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
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
function reproduce() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            yield conn.beginTransaction();
            // 1. Create a dummy journal entry with 2 lines (balanced)
            const journalId = 'TEST_JOURNAL_1';
            yield conn.query(`DELETE FROM journal_lines WHERE journalId = ?`, [journalId]);
            yield conn.query(`DELETE FROM journal_entries WHERE id = ?`, [journalId]);
            yield conn.query(`
            INSERT INTO journal_entries (id, date, description, referenceId, createdBy)
            VALUES (?, NOW(), 'Test Journal', 'REF123', 'System')
        `, [journalId]);
            // Line 1: Debit 100 Cash
            yield conn.query(`
            INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
            VALUES (?, '101', 'Cash', 100, 0)
        `, [journalId]);
            // Line 2: Credit 100 Sales
            yield conn.query(`
            INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
            VALUES (?, '401', 'Sales', 0, 100)
        `, [journalId]);
            console.log('Initial State: Balanced (100 | 100)');
            // 2. Run the buggy update query from invoiceController.ts
            const paymentCollected = 200; // New amount
            const type = 'RECEIPT';
            const referenceId = 'REF123';
            console.log(`Updating to ${paymentCollected}...`);
            yield conn.query(`UPDATE journal_lines SET debit = ?, credit = ? 
             WHERE journalId IN (SELECT id FROM journal_entries WHERE referenceId = ?)`, [
                type === 'RECEIPT' ? paymentCollected : 0,
                type === 'RECEIPT' ? 0 : paymentCollected,
                referenceId
            ]);
            // 3. Check the result
            const [lines] = yield conn.query(`SELECT * FROM journal_lines WHERE journalId = ?`, [journalId]);
            let totalDebit = 0;
            let totalCredit = 0;
            console.log('Lines after update:');
            for (const line of lines) {
                console.log(`- Account ${line.accountName}: Debit ${line.debit}, Credit ${line.credit}`);
                totalDebit += Number(line.debit);
                totalCredit += Number(line.credit);
            }
            console.log(`Total Debit: ${totalDebit}`);
            console.log(`Total Credit: ${totalCredit}`);
            if (totalDebit !== totalCredit) {
                console.log('❌ BUG CONFIRMED: Entry is unbalanced!');
            }
            else {
                console.log('✅ Entry is balanced (unexpected given the code)');
            }
            yield conn.rollback();
        }
        catch (error) {
            console.error(error);
            yield conn.rollback();
        }
        finally {
            conn.release();
        }
    });
}
reproduce();
