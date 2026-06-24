"use strict";
/**
 * Debug Salesman Targets Script
 * This script checks the current state of salesman targets and recent invoices
 */
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
function debugSalesmanTargets() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🔍 Debugging Salesman Targets...\n');
        const conn = yield db_1.pool.getConnection();
        try {
            // 1. Check salesman_targets table
            console.log('=== SALESMAN TARGETS ===');
            const [targets] = yield conn.query(`
            SELECT st.*, 
                   s.name as salesmanName, 
                   p.name as productName, 
                   c.name as categoryName
            FROM salesman_targets st
            LEFT JOIN salesmen s ON st.salesmanId = s.id
            LEFT JOIN products p ON st.productId = p.id
            LEFT JOIN categories c ON st.categoryId = c.id
            ORDER BY st.createdAt DESC
            LIMIT 20
        `);
            console.log(`Found ${targets.length} targets:\n`);
            for (const t of targets) {
                console.log(`  📊 ${t.salesmanName || 'Unknown'}`);
                console.log(`     Type: ${t.targetType}`);
                console.log(`     Product: ${t.productName || '-'} (${t.productId || '-'})`);
                console.log(`     Category: ${t.categoryName || '-'} (${t.categoryId || '-'})`);
                console.log(`     Target: ${t.targetQuantity} qty, ${t.targetAmount || 0} amount`);
                console.log(`     Achieved: ${t.achievedQuantity || 0} qty, ${t.achievedAmount || 0} amount`);
                console.log(`     Period: ${t.periodStart} → ${t.periodEnd}`);
                console.log(`     Active: ${t.isActive}\n`);
            }
            // 2. Check recent SALE_INVOICE invoices with salesmanId
            console.log('\n=== RECENT SALES INVOICES WITH SALESMAN ===');
            const [invoices] = yield conn.query(`
            SELECT i.id, i.type, i.date, i.salesmanId, i.total, 
                   s.name as salesmanName, i.partnerName
            FROM invoices i
            LEFT JOIN salesmen s ON i.salesmanId = s.id
            WHERE i.salesmanId IS NOT NULL 
              AND (i.type = 'SALE_INVOICE' OR i.type = 'INVOICE_SALE')
            ORDER BY i.date DESC
            LIMIT 10
        `);
            console.log(`Found ${invoices.length} sales invoices with salesman:\n`);
            for (const inv of invoices) {
                console.log(`  📄 ${inv.id.substring(0, 8)}...`);
                console.log(`     Type: ${inv.type}`);
                console.log(`     Date: ${inv.date}`);
                console.log(`     Salesman: ${inv.salesmanName || 'Unknown'} (${inv.salesmanId})`);
                console.log(`     Partner: ${inv.partnerName}`);
                console.log(`     Total: ${inv.total}\n`);
            }
            // 3. Check invoice lines for those invoices
            if (invoices.length > 0) {
                console.log('\n=== INVOICE LINES ===');
                const invoiceIds = invoices.map(i => i.id);
                const [lines] = yield conn.query(`
                SELECT il.*, p.categoryId
                FROM invoice_lines il
                LEFT JOIN products p ON il.productId = p.id
                WHERE il.invoiceId IN (?)
                ORDER BY il.invoiceId
            `, [invoiceIds]);
                console.log(`Found ${lines.length} invoice lines:\n`);
                for (const line of lines.slice(0, 10)) {
                    console.log(`  📦 ${line.productName}`);
                    console.log(`     ProductId: ${line.productId}`);
                    console.log(`     CategoryId: ${line.categoryId || 'None'}`);
                    console.log(`     Quantity: ${line.quantity}`);
                    console.log(`     Total: ${line.total}\n`);
                }
            }
            // 4. Check what the current date comparison would yield
            const today = new Date().toISOString().split('T')[0];
            console.log(`\n=== DATE CHECK ===`);
            console.log(`Today (for comparison): ${today}`);
            const [activeTargets] = yield conn.query(`
            SELECT st.id, st.salesmanId, st.productId, st.periodStart, st.periodEnd
            FROM salesman_targets st
            WHERE st.isActive = TRUE
              AND st.periodStart <= ?
              AND st.periodEnd >= ?
        `, [today, today]);
            console.log(`Active targets for today: ${activeTargets.length}`);
            for (const at of activeTargets) {
                console.log(`  - Target ${at.id.substring(0, 8)}... (${at.periodStart} to ${at.periodEnd})`);
            }
            console.log('\n✅ Debug complete!');
        }
        catch (error) {
            console.error('❌ Error debugging salesman targets:', error);
            throw error;
        }
        finally {
            conn.release();
            yield db_1.pool.end();
        }
    });
}
// Run the script
debugSalesmanTargets().catch(console.error);
