"use strict";
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
/**
 * Fix Orphaned Payment/Receipt Vouchers
 *
 * Creates missing journal entries for PAYMENT/RECEIPT invoices that exist
 * in the invoices table but have NO corresponding journal_entries.
 *
 * This fixes part of the treasury balance discrepancy.
 */
const promise_1 = __importDefault(require("mysql2/promise"));
const crypto_1 = require("crypto");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '..', '.env') });
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'daftrix',
        });
        console.log('🔍 Finding orphaned PAYMENT/RECEIPT invoices (no journal entry)...\n');
        // Find all PAYMENT/RECEIPT invoices that have NO corresponding journal entry
        // Note: Do NOT filter by status or total > 0 to catch all edge cases
        const [orphanedRows] = yield conn.query(`
        SELECT i.id, i.number, i.date, i.type, i.partnerId, i.partnerName, 
               i.total, i.paymentMethod, i.bankAccountId, i.bankName,
               i.notes, i.createdBy
        FROM invoices i
        WHERE i.type IN ('PAYMENT', 'RECEIPT')
          AND NOT EXISTS (
              SELECT 1 FROM journal_entries je
              WHERE je.referenceId = i.id OR je.referenceId = i.number
          )
        ORDER BY i.date ASC, i.number ASC
    `);
        const orphaned = orphanedRows;
        if (orphaned.length === 0) {
            console.log('✅ No orphaned vouchers found! All payments have journal entries.');
            yield conn.end();
            return;
        }
        console.log(`⚠️  Found ${orphaned.length} orphaned vouchers:\n`);
        console.log('─'.repeat(100));
        console.log(`${'Number'.padEnd(15)} ${'Type'.padEnd(12)} ${'Date'.padEnd(12)} ${'Method'.padEnd(8)} ${'Partner'.padEnd(30)} ${'Amount'.padStart(15)}`);
        console.log('─'.repeat(100));
        let totalReceipts = 0, totalPayments = 0;
        for (const o of orphaned) {
            const typeLabel = o.type === 'PAYMENT' ? 'سند صرف' : 'سند قبض';
            const dateStr = new Date(o.date).toISOString().slice(0, 10);
            const amount = Number(o.total);
            if (o.type === 'RECEIPT')
                totalReceipts += amount;
            else
                totalPayments += amount;
            console.log(`${(o.number || o.id.slice(0, 12)).padEnd(15)} ${typeLabel.padEnd(12)} ${dateStr.padEnd(12)} ${(o.paymentMethod || 'N/A').padEnd(8)} ${(o.partnerName || '---').padEnd(30)} ${amount.toLocaleString().padStart(15)}`);
        }
        console.log('─'.repeat(100));
        console.log(`  Total RECEIPT: ${totalReceipts.toLocaleString()}`);
        console.log(`  Total PAYMENT: ${totalPayments.toLocaleString()}`);
        console.log(`  Net Impact: ${(totalReceipts - totalPayments).toLocaleString()}\n`);
        // Find accounts
        const [cashAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '101%' ORDER BY code ASC LIMIT 1`);
        const cashAccount = cashAccounts[0];
        if (!cashAccount) {
            console.error('❌ Could not find a cash account (101x). Cannot proceed.');
            yield conn.end();
            return;
        }
        console.log(`💰 Cash Account: ${cashAccount.name} (${cashAccount.id})`);
        // Find AP (payables) account
        const [apAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%موردين%' OR name LIKE '%دائنون%' OR code LIKE '201%' ORDER BY code ASC LIMIT 1`);
        const apAccount = apAccounts[0];
        if (!apAccount) {
            console.error('❌ Could not find an AP account (201x). Cannot proceed.');
            yield conn.end();
            return;
        }
        console.log(`📋 AP Account: ${apAccount.name} (${apAccount.id})`);
        // Find AR (receivables) account
        const [arAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%عملاء%' OR name LIKE '%مدينون%' OR code LIKE '104%' ORDER BY code ASC LIMIT 1`);
        const arAccount = arAccounts[0];
        console.log(`📋 AR Account: ${(arAccount === null || arAccount === void 0 ? void 0 : arAccount.name) || 'N/A'} (${(arAccount === null || arAccount === void 0 ? void 0 : arAccount.id) || 'N/A'})`);
        // Build bank account lookup for BANK method vouchers
        const [bankRows] = yield conn.query(`SELECT id, accountId, name FROM banks`);
        const bankMap = new Map();
        for (const b of bankRows) {
            bankMap.set(b.id, { accountId: b.accountId, name: b.name });
            if (b.accountId)
                bankMap.set(b.accountId, { accountId: b.accountId, name: b.name });
        }
        console.log(`🏦 Loaded ${bankMap.size} bank mappings\n`);
        // Create journal entries for each orphaned voucher
        console.log('🔧 Creating missing journal entries...\n');
        let repairedCount = 0;
        let skippedCount = 0;
        for (const inv of orphaned) {
            const isReceipt = inv.type === 'RECEIPT';
            const voucherLabel = isReceipt ? 'سند قبض' : 'سند صرف';
            const journalId = (0, crypto_1.randomUUID)();
            const invTotal = Number(inv.total);
            // Handle negative amounts (like REC-00032 with -57,000)
            // A negative RECEIPT is effectively a payment back (credit cash)
            // A negative PAYMENT is effectively a receipt back (debit cash)
            const absTotal = Math.abs(invTotal);
            const isNegative = invTotal < 0;
            if (absTotal === 0) {
                console.log(`  ⏭️  Skipping ${inv.number} - zero amount`);
                skippedCount++;
                continue;
            }
            // Determine partner-side account
            let partnerAccountId;
            let partnerAccountName;
            if (isReceipt) {
                partnerAccountId = (arAccount === null || arAccount === void 0 ? void 0 : arAccount.id) || apAccount.id;
                partnerAccountName = (arAccount === null || arAccount === void 0 ? void 0 : arAccount.name) || apAccount.name;
            }
            else {
                partnerAccountId = apAccount.id;
                partnerAccountName = apAccount.name;
            }
            // Determine cash/bank account
            let cashBankAccountId = cashAccount.id;
            let cashBankAccountName = cashAccount.name;
            if ((inv.paymentMethod === 'BANK' || inv.paymentMethod === 'بنك') && inv.bankAccountId) {
                const bankInfo = bankMap.get(inv.bankAccountId);
                if (bankInfo === null || bankInfo === void 0 ? void 0 : bankInfo.accountId) {
                    cashBankAccountId = bankInfo.accountId;
                    cashBankAccountName = inv.bankName || bankInfo.name || 'البنك';
                }
            }
            // Build description matching the format used by the application
            const paymentMethodLabel = (inv.paymentMethod === 'نقدي' || inv.paymentMethod === 'CASH') ? ' (نقدي)' :
                (inv.paymentMethod === 'BANK' || inv.paymentMethod === 'بنك') ? ' (بنك)' : '';
            const description = `${voucherLabel} #${inv.number || inv.id.slice(0, 8)} - ${inv.partnerName || ''}${paymentMethodLabel}`;
            // Create journal entry
            yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, notes) VALUES (?, ?, ?, ?, ?, ?)`, [journalId, inv.date, description, inv.id, inv.createdBy || 'System-Fix', inv.notes || null]);
            // Determine debit/credit based on type AND sign
            // Normal RECEIPT: Debit Cash, Credit AR
            // Negative RECEIPT: Debit AR, Credit Cash (reversal)
            // Normal PAYMENT: Debit AP, Credit Cash
            // Negative PAYMENT: Debit Cash, Credit AP (reversal)
            let cashDebit, cashCredit;
            let partnerDebit, partnerCredit;
            if (isReceipt && !isNegative) {
                // Normal receipt: cash comes IN
                cashDebit = absTotal;
                cashCredit = 0;
                partnerDebit = 0;
                partnerCredit = absTotal;
            }
            else if (isReceipt && isNegative) {
                // Negative receipt: reversal, cash goes OUT
                cashDebit = 0;
                cashCredit = absTotal;
                partnerDebit = absTotal;
                partnerCredit = 0;
            }
            else if (!isReceipt && !isNegative) {
                // Normal payment: cash goes OUT
                cashDebit = 0;
                cashCredit = absTotal;
                partnerDebit = absTotal;
                partnerCredit = 0;
            }
            else {
                // Negative payment: reversal, cash comes IN
                cashDebit = absTotal;
                cashCredit = 0;
                partnerDebit = 0;
                partnerCredit = absTotal;
            }
            // Insert journal lines
            yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, ?, ?)`, [journalId, cashBankAccountId, cashBankAccountName, cashDebit, cashCredit]);
            yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, ?, ?)`, [journalId, partnerAccountId, partnerAccountName, partnerDebit, partnerCredit]);
            repairedCount++;
            const arrow = (cashDebit > 0) ? '↑IN' : '↓OUT';
            console.log(`  ✅ ${(inv.number || inv.id.slice(0, 12)).padEnd(12)} ${arrow} ${absTotal.toLocaleString().padStart(12)} → JE ${journalId.slice(0, 8)} (${description.substring(0, 50)})`);
        }
        console.log(`\n🎉 Done! Created ${repairedCount} journal entries. Skipped: ${skippedCount}`);
        console.log('   These vouchers will now appear in the Treasury Journal (يومية الخزينة).\n');
        // Recalculate balances
        console.log('📊 Recalculating affected account balances...');
        const debitNormalTypes = ['ASSET', 'EXPENSE'];
        for (const accountId of [cashAccount.id, apAccount.id, arAccount === null || arAccount === void 0 ? void 0 : arAccount.id].filter(Boolean)) {
            const [accRows] = yield conn.query('SELECT type, openingBalance FROM accounts WHERE id = ?', [accountId]);
            const acc = accRows[0];
            if (!acc)
                continue;
            const [movRows] = yield conn.query('SELECT COALESCE(SUM(debit), 0) as d, COALESCE(SUM(credit), 0) as c FROM journal_lines WHERE accountId = ?', [accountId]);
            const mov = movRows[0];
            const ob = parseFloat(acc.openingBalance) || 0;
            const d = parseFloat(mov.d) || 0;
            const c = parseFloat(mov.c) || 0;
            const newBal = debitNormalTypes.includes(acc.type) ? ob + d - c : ob + c - d;
            yield conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [Math.round(newBal * 100) / 100, accountId]);
        }
        console.log('   ✅ Account balances updated.\n');
        yield conn.end();
    });
}
main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
