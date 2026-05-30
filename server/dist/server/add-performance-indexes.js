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
/**
 * Add performance indexes to speed up data loading
 * Run this script once to optimize database queries
 */
function addPerformanceIndexes() {
    return __awaiter(this, void 0, void 0, function* () {
        let conn;
        try {
            conn = yield (0, db_1.getConnection)();
            console.log('Adding performance indexes...');
            // 1. Index on invoices.date for faster ORDER BY date DESC
            try {
                yield conn.query(`CREATE INDEX idx_invoices_date ON invoices(date DESC)`);
                console.log('✅ Added index on invoices.date');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_invoices_date already exists');
                }
                else {
                    console.error('❌ Error adding invoices.date index:', err.message);
                }
            }
            // 2. Index on invoices.type for filtering
            try {
                yield conn.query(`CREATE INDEX idx_invoices_type ON invoices(type)`);
                console.log('✅ Added index on invoices.type');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_invoices_type already exists');
                }
                else {
                    console.error('❌ Error adding invoices.type index:', err.message);
                }
            }
            // 3. Index on invoices.partnerId for filtering
            try {
                yield conn.query(`CREATE INDEX idx_invoices_partnerId ON invoices(partnerId)`);
                console.log('✅ Added index on invoices.partnerId');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_invoices_partnerId already exists');
                }
                else {
                    console.error('❌ Error adding invoices.partnerId index:', err.message);
                }
            }
            // 4. Index on invoice_lines.invoiceId for faster JOIN (should exist from FK, but ensure it)
            try {
                yield conn.query(`CREATE INDEX idx_invoice_lines_invoiceId ON invoice_lines(invoiceId)`);
                console.log('✅ Added index on invoice_lines.invoiceId');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_invoice_lines_invoiceId already exists');
                }
                else {
                    console.error('❌ Error adding invoice_lines.invoiceId index:', err.message);
                }
            }
            // 5. Index on cheques.transactionId for faster JOIN
            try {
                yield conn.query(`CREATE INDEX idx_cheques_transactionId ON cheques(transactionId)`);
                console.log('✅ Added index on cheques.transactionId');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_cheques_transactionId already exists');
                }
                else {
                    console.error('❌ Error adding cheques.transactionId index:', err.message);
                }
            }
            // 6. Index on journal_lines.journalId for faster JOIN (should exist from FK, but ensure it)
            try {
                yield conn.query(`CREATE INDEX idx_journal_lines_journalId ON journal_lines(journalId)`);
                console.log('✅ Added index on journal_lines.journalId');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_journal_lines_journalId already exists');
                }
                else {
                    console.error('❌ Error adding journal_lines.journalId index:', err.message);
                }
            }
            // 7. Index on partners.name for faster search
            try {
                yield conn.query(`CREATE INDEX idx_partners_name ON partners(name)`);
                console.log('✅ Added index on partners.name');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_partners_name already exists');
                }
                else {
                    console.error('❌ Error adding partners.name index:', err.message);
                }
            }
            // 8. Add missing transactionId column to cheques if it doesn't exist
            try {
                yield conn.query(`ALTER TABLE cheques ADD COLUMN IF NOT EXISTS transactionId VARCHAR(36)`);
                console.log('✅ Added transactionId column to cheques');
            }
            catch (err) {
                if (err.message.includes('Duplicate column')) {
                    console.log('ℹ️ transactionId column already exists in cheques');
                }
                else {
                    console.error('❌ Error adding transactionId column:', err.message);
                }
            }
            // 9. Add missing paymentBreakdown column to invoices if it doesn't exist
            try {
                yield conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paymentBreakdown TEXT`);
                console.log('✅ Added paymentBreakdown column to invoices');
            }
            catch (err) {
                if (err.message.includes('Duplicate column')) {
                    console.log('ℹ️ paymentBreakdown column already exists in invoices');
                }
                else {
                    console.error('❌ Error adding paymentBreakdown column:', err.message);
                }
            }
            // ═══════════════════════════════════════════════════════════
            // COMPOSITE INDEXES — target real query patterns on 30K+ rows
            // ═══════════════════════════════════════════════════════════
            // 10. Partner balance calculation: WHERE partnerId=? AND status IN (...) AND type IN (...)
            try {
                yield conn.query(`CREATE INDEX idx_inv_partner_status ON invoices(partnerId, status, type)`);
                console.log('✅ Added composite index idx_inv_partner_status');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_inv_partner_status already exists');
                }
                else {
                    console.error('❌ Error:', err.message);
                }
            }
            // 11. Partner statement date filtering: WHERE partnerId=? AND date >= ? AND date <= ?
            try {
                yield conn.query(`CREATE INDEX idx_inv_partner_date ON invoices(partnerId, date)`);
                console.log('✅ Added composite index idx_inv_partner_date');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_inv_partner_date already exists');
                }
                else {
                    console.error('❌ Error:', err.message);
                }
            }
            // 12. Dashboard KPIs: WHERE date >= ? AND type IN (...)
            try {
                yield conn.query(`CREATE INDEX idx_inv_date_type ON invoices(date, type)`);
                console.log('✅ Added composite index idx_inv_date_type');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_inv_date_type already exists');
                }
                else {
                    console.error('❌ Error:', err.message);
                }
            }
            // 13. Balance aggregation: WHERE status IN (...) AND type IN (...)
            try {
                yield conn.query(`CREATE INDEX idx_inv_status_type ON invoices(status, type)`);
                console.log('✅ Added composite index idx_inv_status_type');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_inv_status_type already exists');
                }
                else {
                    console.error('❌ Error:', err.message);
                }
            }
            // 14. Commission reports: WHERE salesmanId=? AND date >= ? AND status=?
            try {
                yield conn.query(`CREATE INDEX idx_inv_salesman_date ON invoices(salesmanId, date, status)`);
                console.log('✅ Added composite index idx_inv_salesman_date');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_inv_salesman_date already exists');
                }
                else {
                    console.error('❌ Error:', err.message);
                }
            }
            // 15. Profit reports: JOINs on invoice_lines.productId
            try {
                yield conn.query(`CREATE INDEX idx_invlines_product ON invoice_lines(productId, invoiceId)`);
                console.log('✅ Added composite index idx_invlines_product');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_invlines_product already exists');
                }
                else {
                    console.error('❌ Error:', err.message);
                }
            }
            // 16. Account ledger: JOINs on journal_lines.accountId
            try {
                yield conn.query(`CREATE INDEX idx_journal_lines_account ON journal_lines(accountId, journalId)`);
                console.log('✅ Added composite index idx_journal_lines_account');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_journal_lines_account already exists');
                }
                else {
                    console.error('❌ Error:', err.message);
                }
            }
            // 17. Stock recalculation: WHERE product_id=? AND warehouse_id=?
            try {
                yield conn.query(`CREATE INDEX idx_stock_movements_product_wh ON stock_movements(product_id, warehouse_id)`);
                console.log('✅ Added composite index idx_stock_movements_product_wh');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_stock_movements_product_wh already exists');
                }
                else {
                    console.error('❌ Error:', err.message);
                }
            }
            // 18. Stock recalculation NOT EXISTS check: WHERE reference_id=? AND product_id=?
            try {
                yield conn.query(`CREATE INDEX idx_stock_movements_ref ON stock_movements(reference_id, product_id)`);
                console.log('✅ Added composite index idx_stock_movements_ref');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_stock_movements_ref already exists');
                }
                else {
                    console.error('❌ Error:', err.message);
                }
            }
            // 19. Partner cheque lookups: WHERE partnerId=? AND status=?
            try {
                yield conn.query(`CREATE INDEX idx_cheques_partner ON cheques(partnerId, status)`);
                console.log('✅ Added composite index idx_cheques_partner');
            }
            catch (err) {
                if (err.message.includes('Duplicate key name')) {
                    console.log('ℹ️ Index idx_cheques_partner already exists');
                }
                else {
                    console.error('❌ Error:', err.message);
                }
            }
            console.log('\n✨ Performance optimization complete!');
            console.log('Your queries should now be significantly faster.\n');
        }
        catch (err) {
            console.error('❌ Error adding performance indexes:', err);
            throw err;
        }
        finally {
            if (conn)
                conn.release();
            process.exit(0);
        }
    });
}
// Run the migration
addPerformanceIndexes().catch(console.error);
