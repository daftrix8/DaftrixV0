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
            console.log("--- DASHBOARD KPI CALCULATION DIAGNOSTIC ---");
            const [paymentStatusResult] = yield Promise.all([
                db_1.pool.query(`
                SELECT 
                    SUM(CASE WHEN paymentMethod != 'CREDIT' OR COALESCE(paidAmount, 0) >= total THEN 1 ELSE 0 END) as paidCount,
                    SUM(CASE WHEN paymentMethod != 'CREDIT' OR COALESCE(paidAmount, 0) >= total THEN total ELSE 0 END) as paidTotal,
                    SUM(CASE WHEN paymentMethod = 'CREDIT' AND COALESCE(paidAmount, 0) > 0 AND COALESCE(paidAmount, 0) < total THEN 1 ELSE 0 END) as partialCount,
                    SUM(CASE WHEN paymentMethod = 'CREDIT' AND COALESCE(paidAmount, 0) > 0 AND COALESCE(paidAmount, 0) < total THEN total ELSE 0 END) as partialTotal,
                    SUM(CASE WHEN paymentMethod = 'CREDIT' AND COALESCE(paidAmount, 0) = 0 THEN 1 ELSE 0 END) as unpaidCount,
                    SUM(CASE WHEN paymentMethod = 'CREDIT' AND COALESCE(paidAmount, 0) = 0 THEN total ELSE 0 END) as unpaidTotal,
                    COUNT(*) as totalInvoices
                FROM invoices
                WHERE type IN ('SALE', 'sale', 'INVOICE_SALE', 'SALE_INVOICE')
                  AND status = 'POSTED'
            `)
            ]);
            console.log("Calculated Payment Status KPI:", paymentStatusResult);
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
