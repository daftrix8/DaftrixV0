"use strict";
/**
 * Fix Duplicate Payment Vouchers (سندات صرف مكررة)
 *
 * This script finds and removes duplicate PAYMENT/RECEIPT vouchers
 * where the same partner+amount+date appears more than once.
 *
 * It keeps the FIRST created voucher (lowest sequential number) and
 * deletes the duplicate, reversing its partner balance impact and
 * cleaning up associated journal entries.
 *
 * Usage: npx ts-node scripts/fix_duplicate_payments.ts
 *        Add --dry-run to preview without making changes
 *        Add --execute to actually delete duplicates
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const DRY_RUN = !process.argv.includes('--execute');
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`  Fix Duplicate Payment Vouchers`);
        console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '⚡ EXECUTE (will delete duplicates)'}`);
        console.log(`${'='.repeat(60)}\n`);
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'cloud_erp',
            port: parseInt(process.env.DB_PORT || '3306')
        });
        try {
            // Find duplicate groups: same type + partnerId + total + date
            const [duplicateGroups] = yield conn.query(`
            SELECT type, partnerId, partnerName, ABS(total) as absTotal, DATE(date) as payDate, 
                   COUNT(*) as cnt, 
                   GROUP_CONCAT(id ORDER BY number ASC SEPARATOR '|||') as ids,
                   GROUP_CONCAT(number ORDER BY number ASC SEPARATOR '|||') as numbers
            FROM invoices 
            WHERE type IN ('PAYMENT', 'RECEIPT')
            AND total != 0
            GROUP BY type, partnerId, ROUND(ABS(total), 0), DATE(date)
            HAVING COUNT(*) > 1
            ORDER BY DATE(date) DESC, partnerName
        `);
            if (duplicateGroups.length === 0) {
                console.log('✅ No duplicate payment vouchers found!');
                yield conn.end();
                return;
            }
            console.log(`Found ${duplicateGroups.length} groups of duplicate vouchers:\n`);
            let totalToDelete = 0;
            let totalAmountImpact = 0;
            const deletionPlan = [];
            for (const group of duplicateGroups) {
                const ids = group.ids.split('|||');
                const numbers = group.numbers.split('|||');
                const typeLabel = group.type === 'PAYMENT' ? 'سند صرف' : 'سند قبض';
                console.log(`  📋 ${typeLabel} - ${group.partnerName} - ${group.absTotal.toLocaleString()} EGP (${group.payDate})`);
                console.log(`     Records: ${numbers.join(', ')}`);
                console.log(`     ✅ KEEP: ${numbers[0]} (${ids[0]})`);
                for (let i = 1; i < ids.length; i++) {
                    console.log(`     ❌ DELETE: ${numbers[i]} (${ids[i]})`);
                    deletionPlan.push({
                        keepId: ids[0],
                        keepNumber: numbers[0],
                        deleteId: ids[i],
                        deleteNumber: numbers[i],
                        partnerId: group.partnerId,
                        partnerName: group.partnerName,
                        amount: group.absTotal,
                        type: group.type
                    });
                    totalToDelete++;
                    totalAmountImpact += group.absTotal;
                }
                console.log('');
            }
            console.log(`${'─'.repeat(60)}`);
            console.log(`Summary: ${totalToDelete} duplicates to delete`);
            console.log(`Total duplicated amount: ${totalAmountImpact.toLocaleString()} EGP\n`);
            if (DRY_RUN) {
                console.log('⚠️  DRY RUN - No changes made.');
                console.log('    Run with --execute to delete the duplicates.\n');
                yield conn.end();
                return;
            }
            // Execute deletions
            console.log('⚡ Executing deletions...\n');
            yield conn.beginTransaction();
            let deleted = 0;
            for (const plan of deletionPlan) {
                try {
                    // 1. Get the duplicate invoice details
                    const [invRows] = yield conn.query('SELECT id, total, type, partnerId FROM invoices WHERE id = ?', [plan.deleteId]);
                    if (invRows.length === 0) {
                        console.log(`  ⏭️ ${plan.deleteNumber} already deleted, skipping`);
                        continue;
                    }
                    const inv = invRows[0];
                    const total = Math.abs(parseFloat(inv.total)) || 0;
                    // 2. Reverse partner balance impact
                    if (inv.partnerId) {
                        const balanceReversal = inv.type === 'PAYMENT' ? -total : total;
                        yield conn.query('UPDATE partners SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [balanceReversal, inv.partnerId]);
                        console.log(`  💰 Reversed balance for ${plan.partnerName}: ${balanceReversal > 0 ? '+' : ''}${balanceReversal.toLocaleString()}`);
                    }
                    // 3. Delete associated journal entries and lines
                    const [journals] = yield conn.query('SELECT id FROM journal_entries WHERE referenceId = ? OR referenceId = ?', [plan.deleteId, plan.deleteNumber]);
                    for (const j of journals) {
                        yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [j.id]);
                        yield conn.query('DELETE FROM journal_entries WHERE id = ?', [j.id]);
                    }
                    // 4. Delete the duplicate invoice
                    yield conn.query('DELETE FROM invoice_lines WHERE invoiceId = ?', [plan.deleteId]);
                    yield conn.query('DELETE FROM invoices WHERE id = ?', [plan.deleteId]);
                    deleted++;
                    console.log(`  ✅ Deleted ${plan.deleteNumber} (kept ${plan.keepNumber})`);
                }
                catch (err) {
                    console.error(`  ❌ Error deleting ${plan.deleteNumber}: ${err.message}`);
                }
            }
            yield conn.commit();
            console.log(`\n${'='.repeat(60)}`);
            console.log(`  ✅ Done! Deleted ${deleted}/${totalToDelete} duplicate vouchers.`);
            console.log(`${'='.repeat(60)}\n`);
        }
        catch (err) {
            console.error('Fatal error:', err.message);
        }
        finally {
            yield conn.end();
        }
    });
}
main().catch(console.error);
