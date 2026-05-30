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
const promise_1 = __importDefault(require("mysql2/promise"));
// DB Config (Hardcoded for test script based on previous outputs)
const dbConfig = {
    host: 'localhost',
    user: 'root',
    database: 'cloud_erp',
    password: 'password', // Assuming standard or empty, but previous output showed hasPassword: true. Let's try 'password' or root/root.
    // Wait, I can read .env or just try standard dev creds.
    // The previous output in Step 1700 showed:
    // DB Config: { host: 'localhost', user: 'root', database: 'cloud_erp', port: '3306', hasPassword: true }
    // I will try to read .env or just use the existing db.ts *content* logic but simplified.
    // actually, let's just use the `server/db.ts` values if I can see them.
    // Env usually has DB_PASSWORD.
};
// I'll use dotenv to load config
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '.env') });
function verify() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Connecting to DB...');
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'cloud_erp'
        });
        try {
            yield conn.beginTransaction();
            // 1. Setup: Create a Balanced Journal
            const journalId = 'FIX_TEST_JOURNAL';
            const referenceId = 'REF_FIX_001';
            // Clean up
            yield conn.query(`DELETE FROM journal_lines WHERE journalId = ?`, [journalId]);
            yield conn.query(`DELETE FROM journal_entries WHERE id = ?`, [journalId]);
            yield conn.query(`
            INSERT INTO journal_entries (id, date, description, referenceId, createdBy)
            VALUES (?, NOW(), 'Fix Test Journal', ?, 'System')
        `, [journalId, referenceId]);
            // Fetch valid account IDs
            const [accounts] = yield conn.query('SELECT id, name FROM accounts LIMIT 2');
            if (accounts.length < 2) {
                throw new Error('Not enough accounts in database to run test');
            }
            const acc1 = accounts[0];
            const acc2 = accounts[1];
            console.log(`Using accounts: ${acc1.name} (${acc1.id}) and ${acc2.name} (${acc2.id})`);
            // Line 1: Debit 100 Cash (Treasury)
            yield conn.query(`
            INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
            VALUES (?, ?, ?, 100, 0)
        `, [journalId, acc1.id, acc1.name]);
            // Line 2: Credit 100 Customer (Partner)
            yield conn.query(`
            INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
            VALUES (?, ?, ?, 0, 100)
        `, [journalId, acc2.id, acc2.name]);
            console.log('Initial State: Balanced (100 | 100)');
            // 2. Run the NEW Logic (Simulating invoiceController.ts)
            const paymentCollected = 200;
            const existingPayment = { number: referenceId, type: 'RECEIPT' };
            console.log(`Applying FIX logic to update amount to ${paymentCollected}...`);
            // --- NEW LOGIC START ---
            const [existingLines] = yield conn.query('SELECT * FROM journal_lines WHERE journalId IN (SELECT id FROM journal_entries WHERE referenceId = ?)', [existingPayment.number]);
            if (existingLines.length > 0) {
                for (const line of existingLines) {
                    let isDebit = false;
                    let isCredit = false;
                    if (Number(line.debit) > 0 && Number(line.credit) == 0) {
                        isDebit = true;
                    }
                    else if (Number(line.credit) > 0 && Number(line.debit) == 0) {
                        isCredit = true;
                    }
                    if (isDebit) {
                        console.log(`Updating Line ${line.id} to Debit ${paymentCollected}`);
                        yield conn.query('UPDATE journal_lines SET debit = ?, credit = 0 WHERE id = ?', [paymentCollected, line.id]);
                    }
                    else if (isCredit) {
                        console.log(`Updating Line ${line.id} to Credit ${paymentCollected}`);
                        yield conn.query('UPDATE journal_lines SET debit = 0, credit = ? WHERE id = ?', [paymentCollected, line.id]);
                    }
                }
                console.log(`✅ Journal lines updated with balance check`);
            }
            // --- NEW LOGIC END ---
            // 3. Verify Result
            const [lines] = yield conn.query(`SELECT * FROM journal_lines WHERE journalId = ?`, [journalId]);
            let totalDebit = 0;
            let totalCredit = 0;
            console.log('Lines after update:');
            for (const line of lines) {
                console.log(`- ${line.accountName}: Debit ${line.debit}, Credit ${line.credit}`);
                totalDebit += Number(line.debit);
                totalCredit += Number(line.credit);
            }
            console.log(`Total Debit: ${totalDebit}`);
            console.log(`Total Credit: ${totalCredit}`);
            if (totalDebit === totalCredit && totalDebit === 200) {
                console.log('✅ SUCCESS: Entry is balanced and updated!');
            }
            else {
                console.log('❌ FAIL: Entry is unbalanced or incorrect!');
            }
            yield conn.rollback();
        }
        catch (error) {
            console.error(error);
            yield conn.rollback();
        }
        finally {
            yield conn.end();
        }
    });
}
verify();
