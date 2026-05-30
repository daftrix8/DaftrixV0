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
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("--- DIAGNOSTIC SCRIPT START ---");
            // 1. Total POSTED sales vs DRAFT sales
            const [salesByStatus] = yield db_1.pool.query(`
            SELECT status, SUM(total) as totalSum, COUNT(*) as count 
            FROM invoices 
            WHERE type IN ('INVOICE_SALE') 
            GROUP BY status
        `);
            console.log("Sales by Status:", salesByStatus);
            // 2. Check partial payments on CREDIT invoices
            const [creditPayments] = yield db_1.pool.query(`
            SELECT id, number, status, paymentMethod, total, paidAmount
            FROM invoices
            WHERE type IN ('INVOICE_SALE') AND paymentMethod = 'CREDIT'
            LIMIT 5
        `);
            console.log("Sample Credit Sales:", creditPayments);
            // 3. Confirm Journal entries for posted sales vs draft
            const [journalCheck] = yield db_1.pool.query(`
            SELECT i.status, COUNT(je.id) as journalCount
            FROM invoices i
            LEFT JOIN journal_entries je ON je.referenceId = i.id
            WHERE i.type IN ('INVOICE_SALE')
            GROUP BY i.status
        `);
            console.log("Journals linked by Invoice Status:", journalCheck);
        }
        catch (e) {
            console.error(e);
        }
        finally {
            process.exit(0);
        }
    });
}
main();
