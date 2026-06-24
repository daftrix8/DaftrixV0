"use strict";
/**
 * MIGRATE: Create journal entries for ALL migrated invoices
 *
 * Problem: Historical invoices were inserted directly into `invoices` table
 * without creating journal entries. This means الخزينة (cash) is missing
 * all the revenue (وارد) from sales, receipts, etc.
 *
 * Double-Entry Bookkeeping Rules:
 * ─────────────────────────────────────────────
 * INVOICE_SALE:    Dr Receivables(104), Cr Revenue(401)
 * INVOICE_PURCHASE: Dr Inventory(103), Cr Payables(201)
 * RETURN_SALE:     Dr Revenue(401), Cr Receivables(104)
 * RETURN_PURCHASE: Dr Payables(201), Cr Inventory(103)
 * RECEIPT (سند قبض): Dr Cash(101), Cr Receivables(104)
 * PAYMENT (سند صرف): Dr Payables(201), Cr Cash(101)
 * DISCOUNT_ALLOWED: Dr Discount Allowed(502), Cr Receivables(104)
 * DISCOUNT_EARNED:  Dr Payables(201), Cr Discount Earned(402)
 * ─────────────────────────────────────────────
 *
 * Run: npx ts-node server/scripts/migrate_invoice_journals.ts
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = require("crypto");
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n══════════════════════════════════════════════');
        console.log('  📝 MIGRATE: Create Journal Entries for Invoices');
        console.log('══════════════════════════════════════════════\n');
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const conn = yield pool.getConnection();
        try {
            // 1. Clean up previous migration journal entries (idempotent)
            console.log('  🧹 Cleaning up previous invoice journal migration...');
            const [existing] = yield conn.query("SELECT id FROM journal_entries WHERE description LIKE '[MIGRATED-INV]%'");
            if (existing.length > 0) {
                const ids = existing.map((r) => r.id);
                for (let i = 0; i < ids.length; i += 500) {
                    const chunk = ids.slice(i, i + 500);
                    yield conn.query('DELETE FROM journal_lines WHERE journalId IN (?)', [chunk]);
                    yield conn.query('DELETE FROM journal_entries WHERE id IN (?)', [chunk]);
                }
                console.log(`     Deleted ${existing.length} previous entries.`);
            }
            // 2. Get account IDs from COA
            const [accountRows] = yield conn.query('SELECT id, code, name, type FROM accounts');
            const acctByCode = {};
            for (const a of accountRows)
                acctByCode[a.code] = a;
            const cashAcct = acctByCode['101']; // الخزينة الرئيسية
            const receivablesAcct = acctByCode['104']; // العملاء (الذمم المدينة)
            const payablesAcct = acctByCode['201']; // الموردين (الذمم الدائنة)
            const revenueAcct = acctByCode['401']; // المبيعات
            const inventoryAcct = acctByCode['103']; // مخزون البضائع
            const discountAllowedAcct = acctByCode['502']; // خصم مسموح به
            const discountEarnedAcct = acctByCode['402']; // خصم مكتسب
            // Validate essential accounts
            const required = { cashAcct, receivablesAcct, payablesAcct, revenueAcct, inventoryAcct };
            for (const [name, acct] of Object.entries(required)) {
                if (!acct) {
                    console.error(`❌ Missing account: ${name}! Aborting.`);
                    return;
                }
                console.log(`  ✅ ${name}: ${acct.code} - ${acct.name} (${acct.id})`);
            }
            // 3. Get ALL invoices that DON'T already have journal entries
            // EXCLUDE PAYMENT/RECEIPT — those are handled by migrate_vendor_payments.ts
            console.log('\n  📋 Finding invoices without journal entries...');
            const [invoices] = yield conn.query(`
      SELECT i.id, i.number, i.date, i.type, i.total, i.partnerName, 
             i.paymentMethod, i.bankAccountId, i.createdBy
      FROM invoices i
      WHERE i.type NOT IN ('PAYMENT', 'RECEIPT')
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je 
          WHERE (je.sourceInvoiceId = i.id OR je.referenceId = i.id OR je.referenceId = i.number)
            AND je.description NOT LIKE '[MIGRATED-SP]%'
        )
      ORDER BY i.date, i.id
    `);
            console.log(`  📊 Found ${invoices.length} invoices without journal entries.`);
            // 4. Process in batches
            const BATCH_SIZE = 500;
            const stats = {};
            for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
                const batch = invoices.slice(i, i + BATCH_SIZE);
                yield conn.beginTransaction();
                for (const inv of batch) {
                    const total = Number(inv.total) || 0;
                    if (total <= 0)
                        continue;
                    const journalId = (0, crypto_1.randomUUID)();
                    const date = inv.date;
                    const type = inv.type;
                    const partnerName = inv.partnerName || '';
                    const invNumber = inv.number || inv.id;
                    // Track stats
                    if (!stats[type])
                        stats[type] = { count: 0, total: 0 };
                    stats[type].count++;
                    stats[type].total += total;
                    let description = '';
                    let debitAcct = null;
                    let creditAcct = null;
                    switch (type) {
                        case 'INVOICE_SALE':
                            description = `[MIGRATED-INV] فاتورة بيع #${invNumber} - ${partnerName}`;
                            // Cash sales: Dr Cash(101), Cr Revenue(401) — shows in treasury
                            // Credit sales: Dr Receivables(104), Cr Revenue(401)
                            if (inv.paymentMethod === 'CASH') {
                                debitAcct = cashAcct; // Dr Cash
                            }
                            else {
                                debitAcct = receivablesAcct; // Dr Receivables
                            }
                            creditAcct = revenueAcct; // Cr Revenue
                            break;
                        case 'INVOICE_PURCHASE':
                            description = `[MIGRATED-INV] فاتورة شراء #${invNumber} - ${partnerName}`;
                            debitAcct = inventoryAcct; // Dr Inventory
                            // Cash purchases: Cr Cash(101) — shows in treasury
                            // Credit purchases: Cr Payables(201)
                            if (inv.paymentMethod === 'CASH') {
                                creditAcct = cashAcct; // Cr Cash
                            }
                            else {
                                creditAcct = payablesAcct; // Cr Payables
                            }
                            break;
                        case 'RETURN_SALE':
                            description = `[MIGRATED-INV] مرتجع مبيعات #${invNumber} - ${partnerName}`;
                            debitAcct = revenueAcct; // Dr Revenue (reverse sale)
                            creditAcct = receivablesAcct; // Cr Receivables
                            break;
                        case 'RETURN_PURCHASE':
                            description = `[MIGRATED-INV] مرتجع مشتريات #${invNumber} - ${partnerName}`;
                            debitAcct = payablesAcct; // Dr Payables (reverse purchase)
                            creditAcct = inventoryAcct; // Cr Inventory
                            break;
                        case 'RECEIPT':
                            // سند قبض - Cash comes IN, receivables go DOWN
                            description = `[MIGRATED-INV] سند قبض #${invNumber} - ${partnerName}`;
                            // Check if bank payment
                            if (inv.paymentMethod === 'BANK' && inv.bankAccountId) {
                                debitAcct = acctByCode[inv.bankAccountId] || cashAcct;
                            }
                            else {
                                debitAcct = cashAcct; // Dr Cash
                            }
                            creditAcct = receivablesAcct; // Cr Receivables
                            break;
                        case 'PAYMENT':
                            // سند صرف - Cash goes OUT, payables go DOWN
                            description = `[MIGRATED-INV] سند صرف #${invNumber} - ${partnerName}`;
                            debitAcct = payablesAcct; // Dr Payables
                            if (inv.paymentMethod === 'BANK' && inv.bankAccountId) {
                                creditAcct = acctByCode[inv.bankAccountId] || cashAcct;
                            }
                            else {
                                creditAcct = cashAcct; // Cr Cash
                            }
                            break;
                        case 'DISCOUNT_ALLOWED':
                            description = `[MIGRATED-INV] خصم مسموح به #${invNumber} - ${partnerName}`;
                            debitAcct = discountAllowedAcct || revenueAcct; // Dr Discount Allowed
                            creditAcct = receivablesAcct; // Cr Receivables
                            break;
                        case 'DISCOUNT_EARNED':
                            description = `[MIGRATED-INV] خصم مكتسب #${invNumber} - ${partnerName}`;
                            debitAcct = payablesAcct; // Dr Payables
                            creditAcct = discountEarnedAcct || revenueAcct; // Cr Discount Earned
                            break;
                        default:
                            continue; // Skip unknown types
                    }
                    if (!debitAcct || !creditAcct)
                        continue;
                    // Insert journal entry
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, sourceInvoiceId, createdBy)
           VALUES (?, ?, ?, ?, ?, ?)`, [journalId, date, description, invNumber, inv.id, 'migration']);
                    // Insert journal lines (double-entry)
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES 
           (?, ?, ?, ?, 0),
           (?, ?, ?, 0, ?)`, [
                        journalId, debitAcct.id, debitAcct.name, total,
                        journalId, creditAcct.id, creditAcct.name, total
                    ]);
                }
                yield conn.commit();
                if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= invoices.length) {
                    console.log(`     ... processed ${Math.min(i + BATCH_SIZE, invoices.length)} / ${invoices.length}`);
                }
            }
            // 5. Recalculate ALL account balances
            console.log('\n  🔄 Recalculating all account balances...');
            yield conn.query(`
      UPDATE accounts a 
      SET a.balance = COALESCE(a.openingBalance, 0) + 
        COALESCE((SELECT SUM(jl.debit) - SUM(jl.credit) FROM journal_lines jl WHERE jl.accountId = a.id), 0)
    `);
            // 6. Show results
            const [finalBalances] = yield conn.query("SELECT code, name, balance FROM accounts WHERE code IN ('101','103','104','201','401','402','501','502') ORDER BY code");
            console.log('\n══════════════════════════════════════════════');
            console.log('  📊 RESULTS');
            console.log('══════════════════════════════════════════════');
            console.log('\n  📑 Invoices processed by type:');
            for (const [type, s] of Object.entries(stats)) {
                console.log(`     ${type.padEnd(20)} ${s.count.toString().padStart(6)} invoices  ${s.total.toLocaleString().padStart(15)} EGP`);
            }
            const totalCreated = Object.values(stats).reduce((sum, s) => sum + s.count, 0);
            console.log(`     ${'TOTAL'.padEnd(20)} ${totalCreated.toString().padStart(6)} invoices`);
            console.log('\n  💰 Updated Account Balances:');
            for (const a of finalBalances) {
                console.log(`     ${a.code} ${a.name.substring(0, 30).padEnd(30)} ${Number(a.balance).toLocaleString().padStart(15)} EGP`);
            }
        }
        catch (e) {
            yield conn.rollback();
            throw e;
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
