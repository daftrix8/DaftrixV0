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
 * Diagnostic script: Investigate why bank statement shows no historical transactions
 * البريد المصري - account number 0851512000644818
 */
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const promise_1 = __importDefault(require("mysql2/promise"));
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true,
        });
        console.log('=== BANK DIAGNOSTIC ===\n');
        // 1. Find the bank record
        const [banks] = yield conn.query(`SELECT * FROM banks WHERE name LIKE '%بريد%' OR accountNumber LIKE '%0851512%'`);
        console.log('--- Banks matching "بريد" or "0851512" ---');
        for (const b of banks) {
            console.log(`  Bank ID: ${b.id}`);
            console.log(`  Name: ${b.name}`);
            console.log(`  Account#: ${b.accountNumber}`);
            console.log(`  accountId (GL link): ${b.accountId}`);
            console.log(`  balance: ${b.balance}`);
            console.log(`  openingBalance: ${b.openingBalance}\n`);
        }
        if (banks.length === 0) {
            // Try to find all banks
            const [allBanks] = yield conn.query(`SELECT id, name, accountNumber, accountId, balance, openingBalance FROM banks`);
            console.log('--- ALL BANKS ---');
            for (const b of allBanks) {
                console.log(`  ${b.id} | ${b.name} | acct# ${b.accountNumber} | GL: ${b.accountId} | bal: ${b.balance}`);
            }
        }
        // 2. Find the linked GL account
        const bankAccountId = (_a = banks[0]) === null || _a === void 0 ? void 0 : _a.accountId;
        if (bankAccountId) {
            const [accts] = yield conn.query(`SELECT * FROM accounts WHERE id = ?`, [bankAccountId]);
            console.log('--- Linked GL Account ---');
            for (const a of accts) {
                console.log(`  GL ID: ${a.id}`);
                console.log(`  Code: ${a.code}`);
                console.log(`  Name: ${a.name}`);
                console.log(`  Type: ${a.type}`);
                console.log(`  openingBalance: ${a.openingBalance}`);
                console.log(`  balance: ${a.balance}`);
                console.log(`  currencyCode: ${a.currencyCode}\n`);
            }
            // 3. Count journal entries for this GL account
            const [count] = yield conn.query(`SELECT COUNT(*) as cnt FROM journal_lines WHERE accountId = ?`, [bankAccountId]);
            console.log(`--- Total journal_lines for this account: ${count[0].cnt} ---\n`);
            // 4. Show the actual journal entries
            const [entries] = yield conn.query(`SELECT je.id, je.date, je.description, je.referenceId,
                    jl.debit, jl.credit, jl.foreignDebit, jl.foreignCredit
             FROM journal_lines jl
             JOIN journal_entries je ON jl.journalId = je.id
             WHERE jl.accountId = ?
             ORDER BY je.date ASC
             LIMIT 30`, [bankAccountId]);
            console.log(`--- First 30 journal entries for GL account ${bankAccountId} ---`);
            for (const e of entries) {
                const date = e.date ? new Date(e.date).toISOString().split('T')[0] : '?';
                console.log(`  ${date} | D:${e.debit} C:${e.credit} | ${(_b = e.description) === null || _b === void 0 ? void 0 : _b.substring(0, 80)} | ref:${e.referenceId}`);
            }
        }
        // 5. Also check: accounts matching "بريد" or bank codes
        const [bankAccts] = yield conn.query(`SELECT id, code, name, type, openingBalance, balance FROM accounts 
         WHERE name LIKE '%بريد%' OR code LIKE '102%' OR name LIKE '%بنك%'
         ORDER BY code`);
        console.log('\n--- All GL Accounts matching bank/بريد/بنك ---');
        for (const a of bankAccts) {
            // Count entries
            const [cnt] = yield conn.query(`SELECT COUNT(*) as c FROM journal_lines WHERE accountId = ?`, [a.id]);
            console.log(`  ${a.code} | ${a.name} | type:${a.type} | OB:${a.openingBalance} | bal:${a.balance} | entries:${cnt[0].c}`);
        }
        // 6. Check if there are receipts/payments referencing this bank
        const bankName = ((_c = banks[0]) === null || _c === void 0 ? void 0 : _c.name) || 'بريد';
        const [invWithBank] = yield conn.query(`SELECT COUNT(*) as cnt, type FROM invoices 
         WHERE bankName LIKE ? OR bankAccountId = ?
         GROUP BY type`, [`%${bankName}%`, ((_d = banks[0]) === null || _d === void 0 ? void 0 : _d.id) || '']);
        console.log(`\n--- Invoices referencing this bank ---`);
        for (const r of invWithBank) {
            console.log(`  Type: ${r.type} | Count: ${r.cnt}`);
        }
        // 7. Check if there are cheques for this bank
        const [cheqCount] = yield conn.query(`SELECT COUNT(*) as cnt FROM cheques WHERE bankId = ?`, [((_e = banks[0]) === null || _e === void 0 ? void 0 : _e.id) || '']);
        console.log(`\n--- Cheques for this bank: ${((_f = cheqCount[0]) === null || _f === void 0 ? void 0 : _f.cnt) || 0} ---`);
        yield conn.end();
        console.log('\n=== DIAGNOSTIC COMPLETE ===');
    });
}
main().catch(e => { console.error(e); process.exit(1); });
