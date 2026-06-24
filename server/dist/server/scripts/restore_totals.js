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
const db_1 = require("../db");
function restoreTotals() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Restoring zeroed totals...");
        const conn = yield (0, db_1.getConnection)();
        try {
            const [invoices] = yield conn.query(`
            SELECT * FROM invoices 
            WHERE number LIKE 'OLD-%' AND total = 0
            AND type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE')
        `);
            console.log(`Found ${invoices.length} zeroed invoices to check.`);
            let updatedCount = 0;
            for (const invoice of invoices) {
                // Check if there are lines
                const [lines] = yield conn.query(`SELECT * FROM invoice_lines WHERE invoiceId = ?`, [invoice.id]);
                if (lines.length === 0) {
                    // If there are no lines, we need to restore the total from somewhere.
                    // Did we lose the total permanently?
                    console.log(`Invoice ${invoice.number} has NO lines! Total is currently 0. Cannot easily restore unless we check payments...`);
                }
            }
            console.log(`Finished checking.`);
        }
        catch (e) {
            console.error("Error:", e);
        }
        finally {
            conn.release();
            process.exit(0);
        }
    });
}
restoreTotals();
