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
function debugPerformance() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('🔌 Connecting to database...');
            const conn = yield (0, db_1.getConnection)();
            // 1. Check Partners Balance
            console.log('\n🔍 Checking Partners Balance (Top 5 with balance > 0):');
            const [partners] = yield conn.query(`
            SELECT id, name, balance, isCustomer, salesmanId 
            FROM partners 
            WHERE balance != 0 
            LIMIT 5
        `);
            console.log(JSON.stringify(partners, null, 2));
            if (partners.length === 0) {
                console.log('⚠️ No partners found with non-zero balance. This explains why Indebtedness is 0.');
                const [count] = yield conn.query('SELECT COUNT(*) as c FROM partners');
                console.log('Checking raw count of partners:', count[0]);
            }
            // 2. Test Discount Calculation Query
            console.log('\n🔍 Testing Discount Calculation Query:');
            // We'll calculate total discount for ALL invoices first to see if data exists
            const [discounts] = yield conn.query(`
            SELECT 
                SUM(globalDiscount) as totalGlobalDiscount,
                SUM((SELECT SUM(discount) FROM invoice_lines WHERE invoiceId = i.id)) as totalLineDiscount
            FROM invoices i
            WHERE i.status = 'POSTED' AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
        `);
            console.log(JSON.stringify(discounts, null, 2));
            // 3. Check Salesman Association
            console.log('\n🔍 Checking Salesman Association on Invoices:');
            const [salesmanStats] = yield conn.query(`
            SELECT salesmanId, COUNT(*) as count 
            FROM invoices 
            WHERE status = 'POSTED' 
            GROUP BY salesmanId
        `);
            console.log(JSON.stringify(salesmanStats, null, 2));
            conn.release();
            process.exit(0);
        }
        catch (error) {
            console.error('❌ Error:', error);
            process.exit(1);
        }
    });
}
debugPerformance();
