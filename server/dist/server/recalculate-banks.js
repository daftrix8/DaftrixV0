var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Recalculate bank balances from journal entries
// Same logic as bank statement: openingBalance + debits - credits
const { pool } = require('./db');
function recalculateBankBalances() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const conn = yield pool.getConnection();
        try {
            console.log('🏦 Recalculating bank balances from journal entries...\n');
            // Get all banks with their linked GL accounts
            const [banks] = yield conn.query(`
            SELECT b.id, b.name, b.balance as currentBalance, b.accountId,
                   COALESCE(a.openingBalance, 0) as openingBalance,
                   a.name as glAccountName
            FROM banks b
            LEFT JOIN accounts a ON b.accountId = a.id
        `);
            console.log(`Found ${banks.length} banks\n`);
            for (const bank of banks) {
                if (!bank.accountId) {
                    console.log(`⚠️ ${bank.name}: No linked GL account, skipping\n`);
                    continue;
                }
                // Calculate net movement from journal entries
                const [journalTotals] = yield conn.query(`
                SELECT 
                    COALESCE(SUM(debit), 0) as totalDebit,
                    COALESCE(SUM(credit), 0) as totalCredit
                FROM journal_lines 
                WHERE accountId = ?
            `, [bank.accountId]);
                const totalDebit = Number((_a = journalTotals[0]) === null || _a === void 0 ? void 0 : _a.totalDebit) || 0;
                const totalCredit = Number((_b = journalTotals[0]) === null || _b === void 0 ? void 0 : _b.totalCredit) || 0;
                const openingBalance = Number(bank.openingBalance) || 0;
                // Bank balance = openingBalance + debits - credits
                const calculatedBalance = openingBalance + totalDebit - totalCredit;
                const oldBalance = Number(bank.currentBalance) || 0;
                const diff = calculatedBalance - oldBalance;
                console.log(`${bank.name} (GL: ${bank.glAccountName || bank.accountId}):`);
                console.log(`  Opening Balance: ${openingBalance.toLocaleString()}`);
                console.log(`  Total Debits: +${totalDebit.toLocaleString()}`);
                console.log(`  Total Credits: -${totalCredit.toLocaleString()}`);
                console.log(`  Calculated: ${calculatedBalance.toLocaleString()}`);
                console.log(`  Current in DB: ${oldBalance.toLocaleString()}`);
                console.log(`  Difference: ${diff.toLocaleString()}`);
                if (Math.abs(diff) > 0.01) {
                    yield conn.query('UPDATE banks SET balance = ROUND(?, 2) WHERE id = ?', [calculatedBalance, bank.id]);
                    console.log(`  ✅ Updated!\n`);
                }
                else {
                    console.log(`  ✓ No change needed\n`);
                }
            }
            console.log('✅ Done!');
        }
        finally {
            conn.release();
            pool.end();
        }
    });
}
recalculateBankBalances().catch(e => {
    console.error('❌ Error:', e);
    process.exit(1);
});
