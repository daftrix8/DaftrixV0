"use strict";
/**
 * ═══════════════════════════════════════════════════════════
 * TREASURY JOURNAL INTEGRITY HEALER
 * Runs automatically on server startup to fix known data issues.
 * Safe to run multiple times (idempotent).
 * ═══════════════════════════════════════════════════════════
 *
 * Fixes:
 *   1. Orphaned duplicate receipts (referenceId not in invoices)
 *   2. Credit returns with cash account lines (should be Receivables)
 *   3. Return journals where amount != invoice.total
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.healTreasuryJournals = healTreasuryJournals;
const db_1 = require("../db");
function healTreasuryJournals() {
    return __awaiter(this, void 0, void 0, function* () {
        let conn;
        try {
            conn = yield (0, db_1.getConnection)();
            console.log('🔧 [Treasury Healer] Starting journal integrity check...');
            // ═══════════════════════════════════════════════════════════
            // FIX 1: Delete orphaned journal entries
            // These are journals whose referenceId doesn't match any invoice.
            // Only target receipt/payment-type descriptions to avoid deleting
            // manual journal entries or opening balances.
            // ═══════════════════════════════════════════════════════════
            const [orphans] = yield conn.query(`
            SELECT je.id, je.referenceId, je.description 
            FROM journal_entries je
            WHERE je.referenceId IS NOT NULL
            AND je.referenceId != ''
            AND je.description LIKE '%سند قبض%'
            AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = je.referenceId OR i.number = je.referenceId)
        `);
            if (orphans.length > 0) {
                const orphanIds = orphans.map((o) => o.id);
                yield conn.query('DELETE FROM journal_lines WHERE journalId IN (?)', [orphanIds]);
                yield conn.query('DELETE FROM journal_entries WHERE id IN (?)', [orphanIds]);
                console.log(`  ✅ Deleted ${orphans.length} orphaned receipt journal(s)`);
            }
            // ═══════════════════════════════════════════════════════════
            // FIX 2: Credit returns with cash account lines
            // If a return invoice has paymentMethod=CREDIT, its journal
            // should use Receivables (104), NOT Cash (101).
            // ═══════════════════════════════════════════════════════════
            const [cashAccts] = yield conn.query("SELECT id FROM accounts WHERE code IN ('101','102','106','107')");
            const [arAccts] = yield conn.query("SELECT id, name FROM accounts WHERE code = '104' LIMIT 1");
            if (cashAccts.length > 0 && arAccts.length > 0) {
                const cashIds = cashAccts.map((a) => a.id);
                const arId = arAccts[0].id;
                const arName = arAccts[0].name;
                const cashPh = cashIds.map(() => '?').join(',');
                // Find credit returns that still have cash journal lines
                const [badReturns] = yield conn.query(`
                SELECT je.id as journalId
                FROM journal_entries je
                JOIN invoices i ON (je.referenceId = i.id OR je.referenceId = i.number)
                WHERE je.description LIKE '%مرتجع%'
                AND i.paymentMethod = 'CREDIT'
                AND EXISTS (
                    SELECT 1 FROM journal_lines jl 
                    WHERE jl.journalId = je.id AND jl.accountId IN (${cashPh})
                )
            `, cashIds);
                let fixedCreditReturns = 0;
                for (const br of badReturns) {
                    const result = yield conn.query(`UPDATE journal_lines SET accountId = ?, accountName = ? 
                     WHERE journalId = ? AND accountId IN (${cashPh})`, [arId, arName, br.journalId, ...cashIds]);
                    if (result[0].affectedRows > 0)
                        fixedCreditReturns++;
                }
                if (fixedCreditReturns > 0) {
                    console.log(`  ✅ Fixed ${fixedCreditReturns} credit return(s) with incorrect cash account lines`);
                }
            }
            // ═══════════════════════════════════════════════════════════
            // FIX 3: Return journals where revenue/partner amounts != invoice.total
            // The journal was historically created from SUM(line.total) which
            // doesn't account for global discounts. Fix to match invoice.total.
            // ═══════════════════════════════════════════════════════════
            const [revenueAccts] = yield conn.query("SELECT id FROM accounts WHERE code = '401' LIMIT 1");
            const [shippingAccts] = yield conn.query("SELECT id FROM accounts WHERE name LIKE '%إيرادات خدمات%' OR name LIKE '%شحن%' LIMIT 1");
            if (revenueAccts.length > 0) {
                const revenueId = revenueAccts[0].id;
                const shippingId = shippingAccts.length > 0 ? shippingAccts[0].id : null;
                // Get all return journals with their invoice totals
                const [returnJournals] = yield conn.query(`
                SELECT je.id as journalId, i.total as invoiceTotal
                FROM journal_entries je
                JOIN invoices i ON (je.referenceId = i.id OR je.referenceId = i.number)
                WHERE je.description LIKE '%مرتجع مبيعات%'
                AND i.type = 'RETURN_SALE'
            `);
                let fixedAmounts = 0;
                for (const rj of returnJournals) {
                    const correctTotal = Number(rj.invoiceTotal);
                    if (correctTotal <= 0)
                        continue;
                    // Get the revenue debit line
                    const [revLines] = yield conn.query('SELECT id, debit FROM journal_lines WHERE journalId = ? AND accountId = ? AND debit > 0', [rj.journalId, revenueId]);
                    if (revLines.length === 0)
                        continue;
                    const currentRevAmount = Number(revLines[0].debit);
                    // Check if shipping line inflates the total
                    let shippingAmount = 0;
                    if (shippingId) {
                        const [shipLines] = yield conn.query('SELECT id, debit FROM journal_lines WHERE journalId = ? AND accountId = ? AND debit > 0', [rj.journalId, shippingId]);
                        if (shipLines.length > 0)
                            shippingAmount = Number(shipLines[0].debit);
                    }
                    const currentTotal = currentRevAmount + shippingAmount;
                    // Only fix if there's a meaningful difference (> 1 EGP)
                    if (Math.abs(currentTotal - correctTotal) <= 1 && shippingAmount === 0)
                        continue;
                    // Update revenue line to invoice total
                    yield conn.query('UPDATE journal_lines SET debit = ? WHERE id = ?', [correctTotal, revLines[0].id]);
                    // Delete shipping line if present (already included in invoice total)
                    if (shippingAmount > 0 && shippingId) {
                        yield conn.query('DELETE FROM journal_lines WHERE journalId = ? AND accountId = ? AND debit > 0', [rj.journalId, shippingId]);
                    }
                    // Update the partner credit line (Receivables or Cash) to match
                    // Find the credit line that's NOT COGS/Inventory (those are separate)
                    const cashAndArIds = [...(cashAccts || []).map((a) => a.id), ...(arAccts || []).map((a) => a.id)];
                    if (cashAndArIds.length > 0) {
                        const phPartner = cashAndArIds.map(() => '?').join(',');
                        yield conn.query(`UPDATE journal_lines SET credit = ? WHERE journalId = ? AND accountId IN (${phPartner}) AND credit > 0`, [correctTotal, rj.journalId, ...cashAndArIds]);
                    }
                    fixedAmounts++;
                }
                if (fixedAmounts > 0) {
                    console.log(`  ✅ Corrected ${fixedAmounts} return journal amount(s) to match invoice totals`);
                }
            }
            // ═══════════════════════════════════════════════════════════
            // RECALCULATE affected account balances
            // ═══════════════════════════════════════════════════════════
            const accountCodes = ['101', '104', '401'];
            for (const code of accountCodes) {
                yield conn.query(`
                UPDATE accounts a 
                SET balance = (
                    SELECT COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
                    FROM journal_lines jl WHERE jl.accountId = a.id
                )
                WHERE a.code = ?
            `, [code]);
            }
            console.log('🔧 [Treasury Healer] Journal integrity check complete.');
        }
        catch (err) {
            console.error('⚠️ [Treasury Healer] Non-fatal error:', err.message);
        }
        finally {
            if (conn)
                conn.release();
        }
    });
}
