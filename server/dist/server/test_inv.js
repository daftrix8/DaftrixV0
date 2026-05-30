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
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query(`
            SELECT id, type, number as invoiceNumber, partnerId, total, status
            FROM invoices
            WHERE number IN (
                '#INV-00051', '#INV-00050', '#INV-00049', '#INV-00048',
                '#INV-00047', '#INV-00046', '#INV-00045', '#INV-00044',
                '#INV-00008', 'INV-00051', 'INV-00050', 'INV-00049', 
                'INV-00048', 'INV-00047', 'INV-00046', 'INV-00045', 
                'INV-00044', 'INV-00008'
            )
        `);
        console.log("Invoices found:");
        console.log(JSON.stringify(rows, null, 2));
        for (const row of rows) {
            console.log(`\nGetting journals for ${row.invoiceNumber} (${row.id})`);
            const [journals] = yield conn.query(`
                SELECT je.id, je.date, je.description, je.referenceId, jl.accountId, a.name as accountName, jl.debit, jl.credit
                FROM journal_entries je
                JOIN journal_lines jl ON je.id = jl.journalId
                JOIN accounts a ON jl.accountId = a.id
                WHERE je.referenceId = ?
            `, [row.id]);
            console.log(JSON.stringify(journals, null, 2));
        }
        conn.release();
        process.exit(0);
    }
    catch (err) {
        console.error(err);
        process.exit(1);
    }
}))();
