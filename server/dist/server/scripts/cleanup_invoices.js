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
function cleanupInvoices() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const conn = yield (0, db_1.getConnection)();
            console.log('🔌 Connected to database');
            // 1. Find Salesman
            const [salesmen] = yield conn.query("SELECT id, name FROM salesmen");
            const salesman = salesmen.find((s) => s.name.includes("Ali") || s.name.includes("علي") || s.name.includes("على") || s.name.includes("قاروب"));
            if (!salesman) {
                console.log('❌ No salesman found');
                return;
            }
            console.log(`✅ Salesman: ${salesman.name} (ID: ${salesman.id})`);
            // 2. Identify the "Ghost" Invoices (Jan 12th)
            console.log('\n🔍 Identifying invoices to delete (specifically Jan 12th)...');
            // We look for invoices on Jan 12th 2026 which caused the discrepancy
            const [invoicesToDelete] = yield conn.query(`
            SELECT id, date, total, globalDiscount, status
            FROM invoices 
            WHERE salesmanId = ? 
            AND date LIKE '2026-01-12%'
        `, [salesman.id]);
            if (invoicesToDelete.length === 0) {
                console.log('✅ No invoices found for Jan 12th. Already clean?');
            }
            else {
                console.log(`⚠️ Found ${invoicesToDelete.length} invoices to delete:`);
                console.table(invoicesToDelete);
                // 3. Delete them
                const ids = invoicesToDelete.map((i) => i.id);
                console.log(`\n🗑️ Deleting ${ids.length} invoices...`);
                // Delete lines first
                yield conn.query('DELETE FROM invoice_lines WHERE invoiceId IN (?)', [ids]);
                // Delete invoices
                yield conn.query('DELETE FROM invoices WHERE id IN (?)', [ids]);
                console.log('✅ Successfully deleted ghost invoices.');
            }
            conn.release();
        }
        catch (error) {
            console.error('❌ Error:', error);
        }
    });
}
cleanupInvoices();
