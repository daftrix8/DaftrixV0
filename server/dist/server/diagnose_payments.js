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
const db_1 = require("./src/config/db");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield db_1.db.getConnection();
        try {
            const [rows] = yield conn.query(`
            SELECT p.*
            FROM invoices p
            LEFT JOIN journal_entries j ON p.invoiceNumber = j.referenceId
            WHERE p.invoiceNumber LIKE 'PAY-%' AND j.id IS NULL
        `);
            console.log(`Found ${rows.length} orphaned PAY- transactions.`);
            if (rows.length > 0) {
                console.log("First 5:", rows.slice(0, 5));
            }
        }
        finally {
            conn.release();
            process.exit(0);
        }
    });
}
run().catch(console.error);
