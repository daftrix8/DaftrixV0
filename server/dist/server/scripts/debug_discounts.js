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
function debugDiscounts() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const conn = yield (0, db_1.getConnection)();
            console.log('🔌 Connected to database');
            const [salesmen] = yield conn.query("SELECT id, name FROM salesmen");
            const salesman = salesmen.find((s) => s.name.includes("Ali") || s.name.includes("علي") || s.name.includes("على") || s.name.includes("قاروب"));
            if (!salesman) {
                return;
            }
            console.log(`✅ Salesman: ${salesman.name} (ID: ${salesman.id})`);
            console.log('\n🔍 DAILY DISCOUNT BREAKDOWN:');
            console.log('-------------------------------------------');
            const [dailyRows] = yield conn.query(`
            SELECT 
                DATE_FORMAT(i.date, '%Y-%m-%d') as day, 
                SUM(
                    COALESCE(i.globalDiscount, 0) + 
                    COALESCE((SELECT SUM(discount) FROM invoice_lines WHERE invoiceId = i.id), 0)
                ) as totalDailyDiscount
            FROM invoices i
            WHERE i.salesmanId = ? 
            AND i.status = 'POSTED'
            AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
            GROUP BY DATE(i.date)
            HAVING totalDailyDiscount > 0
            ORDER BY i.date DESC
        `, [salesman.id]);
            let sum = 0;
            dailyRows.forEach((row) => {
                console.log(`DATE: ${row.day} | DISCOUNT: ${row.totalDailyDiscount}`);
                sum += Number(row.totalDailyDiscount);
            });
            console.log('-------------------------------------------');
            console.log(`✅ TOTAL SUM: ${sum}`);
            conn.release();
        }
        catch (error) {
            console.error('❌ Error:', error);
        }
    });
}
debugDiscounts();
