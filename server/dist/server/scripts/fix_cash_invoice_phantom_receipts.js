"use strict";
/**
 * ═══════════════════════════════════════════════════════════════
 * FIX: Delete phantom RECEIPT records created for CASH invoices
 * ═══════════════════════════════════════════════════════════════
 *
 * PROBLEM: Before the isCashInvoice fix, the syncController was
 * auto-creating RECEIPT (سند قبض) records for CASH invoices.
 * These ghost receipts break the customer balance because the
 * balance formula (cImpact) excludes CASH invoices from the debt
 * ledger, BUT counts ALL receipts as debt-reduction (-total).
 *
 * Result: Customer balance = openingBalance + (0 for CASH invoice)
 *         + (-total for phantom receipt) = negative/credit balance!
 *
 * FIX: Find all RECEIPT records that are linked to CASH invoices
 *      (via referenceInvoiceId or notes pattern) and DELETE them,
 *      then recalculate affected partner balances.
 *
 * USAGE: Run this on the client's server:
 *   node server/scripts/fix_cash_invoice_phantom_receipts.js
 *
 * NOTE: This script is SAFE — it only deletes receipts that are
 *       directly linked to CASH invoices (via referenceInvoiceId).
 *       Manual receipts (created from مقبوضات العملاء) are NEVER touched.
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
exports.fixPhantomReceipts = fixPhantomReceipts;
const db_1 = require("../db");
function fixPhantomReceipts() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('═══════════════════════════════════════════════════');
        console.log('🔧 Fixing phantom RECEIPT records for CASH invoices');
        console.log('═══════════════════════════════════════════════════\n');
        const conn = yield (0, db_1.getConnection)();
        try {
            yield conn.beginTransaction();
            // STEP 1: Find all RECEIPT records linked to CASH sale invoices
            const [phantomReceipts] = yield conn.query(`
            SELECT r.id, r.number, r.total, r.partnerId, r.partnerName, r.referenceInvoiceId, r.notes,
                   i.id as invoiceId, i.number as invoiceNumber, i.paymentMethod as invoicePaymentMethod, i.total as invoiceTotal
            FROM invoices r
            INNER JOIN invoices i ON r.referenceInvoiceId = i.id
            WHERE r.type = 'RECEIPT'
              AND i.type IN ('SALE_INVOICE', 'INVOICE_SALE')
              AND i.paymentMethod = 'CASH'
              AND r.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
        `);
            const phantoms = phantomReceipts;
            console.log(`Found ${phantoms.length} phantom RECEIPT(s) linked to CASH invoices:\n`);
            if (phantoms.length === 0) {
                console.log('✅ No phantom receipts found! Database is clean.');
                yield conn.rollback();
                conn.release();
                return;
            }
            // Track affected partners for balance recalculation
            const affectedPartnerIds = new Set();
            for (const receipt of phantoms) {
                console.log(`  🗑️  Receipt ${receipt.number || receipt.id}`);
                console.log(`      Amount: ${receipt.total}`);
                console.log(`      Partner: ${receipt.partnerName} (${receipt.partnerId})`);
                console.log(`      Linked to CASH invoice: ${receipt.invoiceNumber || receipt.invoiceId}`);
                console.log('');
                if (receipt.partnerId) {
                    affectedPartnerIds.add(receipt.partnerId);
                }
                // Delete associated journal entries
                const [journals] = yield conn.query(`SELECT id FROM journal_entries WHERE referenceId = ? OR referenceId = ?`, [receipt.id, receipt.number]);
                for (const j of journals) {
                    yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [j.id]);
                    yield conn.query('DELETE FROM journal_entries WHERE id = ?', [j.id]);
                    console.log(`      📒 Deleted journal entry ${j.id}`);
                }
                // Delete the phantom receipt itself
                yield conn.query('DELETE FROM invoice_lines WHERE invoiceId = ?', [receipt.id]);
                yield conn.query('DELETE FROM invoices WHERE id = ?', [receipt.id]);
                console.log(`      ✅ Deleted phantom receipt ${receipt.id}`);
            }
            // STEP 2: Recalculate balance for all affected partners
            console.log('\n═══════════════════════════════════════════════════');
            console.log(`📊 Recalculating balance for ${affectedPartnerIds.size} affected partner(s)...`);
            console.log('═══════════════════════════════════════════════════\n');
            for (const partnerId of affectedPartnerIds) {
                // Get partner info
                const [pRows] = yield conn.query('SELECT id, name, openingBalance, balance, isSupplier, isCustomer FROM partners WHERE id = ?', [partnerId]);
                const partner = pRows[0];
                if (!partner) {
                    console.log(`  ⚠️  Partner ${partnerId} not found, skipping.`);
                    continue;
                }
                // Recalculate using the EXACT same formula as partnerController.getPartners
                const [balResult] = yield conn.query(`
                SELECT 
                    (
                        COALESCE(?, 0) +
                        CASE WHEN ? = 0 OR ? = 1 THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
                        CASE WHEN ? = 1 THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
                    ) as calculatedBalance
                FROM (SELECT 1) dummy
                LEFT JOIN (
                    SELECT partnerId,
                        SUM(CASE WHEN type = 'INVOICE_SALE' AND COALESCE(paymentMethod, '') != 'CASH' THEN total WHEN type = 'RETURN_SALE' AND COALESCE(paymentMethod, '') != 'CASH' THEN -(total) WHEN type IN ('RECEIPT', 'DISCOUNT_ALLOWED', 'CHEQUE_DEPOSIT', 'CHEQUE_COLLECT') THEN -total ELSE 0 END) as cImpact,
                        SUM(CASE WHEN type = 'INVOICE_PURCHASE' AND COALESCE(paymentMethod, '') != 'CASH' THEN -(total) WHEN type = 'RETURN_PURCHASE' AND COALESCE(paymentMethod, '') != 'CASH' THEN total WHEN type IN ('PAYMENT', 'DISCOUNT_EARNED', 'CHEQUE_CASHED') THEN total ELSE 0 END) as sImpact,
                        SUM(CASE WHEN type = 'CHEQUE_BOUNCE' THEN total ELSE 0 END) as bounceImpact
                    FROM invoices
                    WHERE status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND partnerId = ?
                    GROUP BY partnerId
                ) inv_agg ON 1=1
            `, [
                    partner.openingBalance || 0,
                    partner.isSupplier ? 1 : 0,
                    partner.isCustomer ? 1 : 0,
                    partner.isSupplier ? 1 : 0,
                    partnerId
                ]);
                const newBalance = Math.round(Number(((_a = balResult[0]) === null || _a === void 0 ? void 0 : _a.calculatedBalance) || partner.openingBalance || 0) * 100) / 100;
                const oldBalance = Math.round(Number(partner.balance || 0) * 100) / 100;
                yield conn.query('UPDATE partners SET balance = ? WHERE id = ?', [newBalance, partnerId]);
                console.log(`  👤 ${partner.name}: ${oldBalance} → ${newBalance} ${Math.abs(newBalance - oldBalance) > 0.01 ? '⚠️ CHANGED' : '✅ OK'}`);
            }
            yield conn.commit();
            conn.release();
            console.log('\n═══════════════════════════════════════════════════');
            console.log('✅ Fix complete! Phantom receipts deleted and balances recalculated.');
            console.log('═══════════════════════════════════════════════════');
        }
        catch (error) {
            yield conn.rollback();
            conn.release();
            console.error('❌ Error during fix:', error);
        }
    });
}
