"use strict";
/**
 * fix_cash_credit_invoices.ts
 * ============================
 * Fixes the paymentMethod and paidAmount for migrated invoices based on the
 * old ERP's Status field:
 *   Status = 1 → Cash (نقدي) → paymentMethod='CASH', paidAmount=total
 *   Status = 2 → Credit (آجل) → paymentMethod='CREDIT', paidAmount=0
 *
 * This is needed because migrate_mall_data.ts hardcoded all invoices as 'CASH'
 * without reading the Status field, causing cash invoices to inflate partner balances.
 *
 * Safe to re-run (idempotent).
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
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const DATA_DIR = process.env.MIGRATION_DATA_DIR || path_1.default.join(__dirname, '../../mall stuff/data');
const MAPPING_FILE = process.env.MIGRATION_MAPPING_FILE || path_1.default.join(DATA_DIR, '../id_mapping.json');
const INVOICE_FILES = [
    { file: 'sellInvoice.json', prefix: 'OLD-S-', type: 'INVOICE_SALE', label: 'Sales' },
    { file: 'BuyInvoice.json', prefix: 'OLD-P-', type: 'INVOICE_PURCHASE', label: 'Purchases' },
    { file: 'sellBackInvoice.json', prefix: 'OLD-RS-', type: 'RETURN_SALE', label: 'Sale Returns' },
    { file: 'BuyBackInvoice.json', prefix: 'OLD-RP-', type: 'RETURN_PURCHASE', label: 'Purchase Returns' },
];
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`\n${'═'.repeat(50)}`);
        console.log(`  💳 FIX: Cash vs Credit Invoice Migration`);
        console.log(`${'═'.repeat(50)}\n`);
        // Load ID mapping
        if (!fs_1.default.existsSync(MAPPING_FILE)) {
            console.error('❌ id_mapping.json not found. Run migrate_mall_data.ts first.');
            process.exit(1);
        }
        const idMap = JSON.parse(fs_1.default.readFileSync(MAPPING_FILE, 'utf8'));
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'cloud_erp',
            waitForConnections: true,
            connectionLimit: 5,
        });
        console.log('  ✅ Connected to database\n');
        let totalCash = 0, totalCredit = 0, totalUpdated = 0, totalSkipped = 0;
        for (const invFile of INVOICE_FILES) {
            const filePath = path_1.default.join(DATA_DIR, invFile.file);
            if (!fs_1.default.existsSync(filePath)) {
                console.log(`  ⏭️  ${invFile.label}: File not found, skipping.`);
                continue;
            }
            const headers = JSON.parse(fs_1.default.readFileSync(filePath, 'utf8'));
            console.log(`  📦 ${invFile.label}: ${headers.length} invoices`);
            // Build oldId → Status map
            const statusMap = new Map();
            for (const inv of headers) {
                statusMap.set(String(inv.ID), inv.Status || 1);
            }
            // Determine which idMap key to use for this invoice type
            let mapKey;
            if (invFile.type === 'INVOICE_SALE')
                mapKey = 'sellInvoices';
            else if (invFile.type === 'INVOICE_PURCHASE')
                mapKey = 'buyInvoices';
            else if (invFile.type === 'RETURN_SALE')
                mapKey = 'sellBackInvoices';
            else if (invFile.type === 'RETURN_PURCHASE')
                mapKey = 'buyBackInvoices';
            else
                continue;
            const invoiceMap = idMap[mapKey] || {};
            let cashCount = 0, creditCount = 0, updatedCount = 0, skippedCount = 0;
            // Process in batches
            const entries = Object.entries(invoiceMap);
            const BATCH = 500;
            for (let i = 0; i < entries.length; i += BATCH) {
                const batch = entries.slice(i, i + BATCH);
                const conn = yield pool.getConnection();
                try {
                    yield conn.beginTransaction();
                    for (const [oldId, newId] of batch) {
                        const status = statusMap.get(oldId);
                        if (status === undefined) {
                            skippedCount++;
                            continue;
                        }
                        if (status === 1) {
                            // Cash: paymentMethod='CASH', paidAmount=total
                            yield conn.query(`UPDATE invoices SET paymentMethod = 'CASH', paidAmount = total WHERE id = ? AND number LIKE 'OLD-%'`, [newId]);
                            cashCount++;
                        }
                        else {
                            // Credit: paymentMethod='CREDIT', paidAmount stays as-is (payments tracked separately)
                            yield conn.query(`UPDATE invoices SET paymentMethod = 'CREDIT' WHERE id = ? AND number LIKE 'OLD-%'`, [newId]);
                            creditCount++;
                        }
                        updatedCount++;
                    }
                    yield conn.commit();
                }
                catch (err) {
                    yield conn.rollback();
                    throw err;
                }
                finally {
                    conn.release();
                }
                if (i + BATCH < entries.length) {
                    process.stdout.write(`     ... processed ${Math.min(i + BATCH, entries.length)} / ${entries.length}\r`);
                }
            }
            console.log(`     💵 Cash (نقدي):   ${cashCount.toLocaleString()}`);
            console.log(`     📋 Credit (آجل):  ${creditCount.toLocaleString()}`);
            console.log(`     ✅ Updated:       ${updatedCount.toLocaleString()}`);
            if (skippedCount > 0)
                console.log(`     ⏭️  Skipped:       ${skippedCount.toLocaleString()}`);
            console.log();
            totalCash += cashCount;
            totalCredit += creditCount;
            totalUpdated += updatedCount;
            totalSkipped += skippedCount;
        }
        // ═══════════════════════════════════════════════════════
        // RECALCULATE PARTNER BALANCES (exclude cash invoices)
        // ═══════════════════════════════════════════════════════
        console.log('  🔄 Recalculating partner balances (excluding cash invoices)...\n');
        // Recalculate ALL partner balances — cash invoices are excluded
        // Customers: balance = openingBalance + CREDIT sales - CREDIT returns - receipts
        const [custResult] = yield pool.query(`
    UPDATE partners p SET p.balance = (
      COALESCE(p.openingBalance, 0)
      + COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'INVOICE_SALE' AND i.paymentMethod != 'CASH' AND i.status != 'VOID'), 0)
      - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_SALE' AND i.paymentMethod != 'CASH' AND i.status != 'VOID'), 0)
      - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RECEIPT' AND i.status != 'VOID'), 0)
      - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'DISCOUNT_ALLOWED' AND i.status != 'VOID'), 0)
    )
    WHERE p.type = 'CUSTOMER' OR (p.isCustomer = TRUE AND p.isSupplier = FALSE)
  `);
        console.log(`  ✅ Updated ${custResult.affectedRows || '?'} customer balances`);
        // Suppliers: balance = openingBalance + CREDIT purchases - CREDIT returns - payments
        const [suppResult] = yield pool.query(`
    UPDATE partners p SET p.balance = (
      COALESCE(p.openingBalance, 0)
      + COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'INVOICE_PURCHASE' AND i.paymentMethod != 'CASH' AND i.status != 'VOID'), 0)
      - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_PURCHASE' AND i.paymentMethod != 'CASH' AND i.status != 'VOID'), 0)
      - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'PAYMENT' AND i.status != 'VOID'), 0)
      - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'DISCOUNT_EARNED' AND i.status != 'VOID'), 0)
    )
    WHERE p.type IN ('SUPPLIER', 'BOTH') OR p.isSupplier = TRUE
  `);
        console.log(`  ✅ Updated ${suppResult.affectedRows || '?'} supplier balances`);
        // Get summary of cash vs credit totals
        const [summaryRows] = yield pool.query(`
    SELECT paymentMethod, COUNT(*) as cnt, COALESCE(SUM(total), 0) as total
    FROM invoices
    WHERE number LIKE 'OLD-%'
    GROUP BY paymentMethod
    ORDER BY paymentMethod
  `);
        console.log(`\n${'═'.repeat(50)}`);
        console.log(`  📊 RESULTS`);
        console.log(`${'═'.repeat(50)}`);
        console.log(`  ✅ Total updated:     ${totalUpdated.toLocaleString()}`);
        console.log(`  💵 Cash invoices:     ${totalCash.toLocaleString()}`);
        console.log(`  📋 Credit invoices:   ${totalCredit.toLocaleString()}`);
        if (totalSkipped > 0)
            console.log(`  ⏭️  Skipped:           ${totalSkipped.toLocaleString()}`);
        console.log(`\n  📊 DB Summary (OLD-* invoices):`);
        for (const row of summaryRows) {
            console.log(`     ${row.paymentMethod || 'NULL'}: ${Number(row.cnt).toLocaleString()} invoices, ${Math.round(Number(row.total)).toLocaleString()} EGP`);
        }
        // Verify sample customer
        const [sampleRows] = yield pool.query(`
    SELECT p.name, p.balance, p.openingBalance
    FROM partners p
    WHERE p.name LIKE '%Mohamed Nasr%'
    LIMIT 1
  `);
        if (sampleRows.length > 0) {
            const s = sampleRows[0];
            console.log(`\n  🧪 Sample: ${s.name}`);
            console.log(`     Opening Balance: ${s.openingBalance}`);
            console.log(`     Current Balance: ${s.balance} ${Math.abs(Number(s.balance)) < 1 ? '✅' : '⚠️'}`);
        }
        // Balance distribution
        const [balDist] = yield pool.query(`
    SELECT 
      COUNT(CASE WHEN ABS(balance) < 1 THEN 1 END) as zeroBalance,
      COUNT(CASE WHEN balance > 1 THEN 1 END) as positiveBalance,
      COUNT(CASE WHEN balance < -1 THEN 1 END) as negativeBalance
    FROM partners
  `);
        console.log(`\n  💰 Balance Distribution:`);
        console.log(`     ~Zero: ${balDist[0].zeroBalance}`);
        console.log(`     Positive: ${balDist[0].positiveBalance}`);
        console.log(`     Negative: ${balDist[0].negativeBalance}`);
        yield pool.end();
        console.log('\n  ✅ Done!\n');
    });
}
main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
