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
exports.fiscalYearRollover = exports.resetDatabase = void 0;
const db_1 = require("../db");
const backupController_1 = require("./backupController");
const errorHandler_1 = require("../utils/errorHandler");
// Admin password from environment — NO DEFAULT (C4 security fix)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
    console.warn('⚠️ [SECURITY] ADMIN_PASSWORD not set in .env — database reset/rollover will be disabled.');
}
/**
 * Verify admin password — constant-time comparison to prevent timing attacks
 */
function verifyPassword(password) {
    if (!ADMIN_PASSWORD || !password)
        return false;
    // Use constant-time comparison
    if (password.length !== ADMIN_PASSWORD.length)
        return false;
    const crypto = require('crypto');
    return crypto.timingSafeEqual(Buffer.from(password, 'utf8'), Buffer.from(ADMIN_PASSWORD, 'utf8'));
}
/**
 * Helper function to safely delete from a table
 */
function safeDelete(conn, table) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield conn.query(`DELETE FROM ${table} `);
            console.log(`  ✓ Deleted: ${table} `);
        }
        catch (err) {
            // Table might not exist - that's OK
            if (!err.message.includes("doesn't exist")) {
                console.log(`  ⚠️ Warning deleting ${table}: ${err.message} `);
            }
        }
    });
}
/**
 * Reset database - removes transactional data
 * Modes: 'FULL' (wipe everything) or 'TRANSACTIONS' (keep master data)
 */
const resetDatabase = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { password, mode = 'TRANSACTIONS' } = req.body;
        // Verify password
        if (!verifyPassword(password)) {
            return res.status(403).json({ message: 'Invalid password' });
        }
        console.log(`🔄 Starting database reset(${mode})...`);
        const conn = yield (0, db_1.getConnection)();
        // Disable foreign key checks temporarily
        yield conn.query('SET FOREIGN_KEY_CHECKS = 0');
        // ====================================
        // Step 1: Delete transactional data
        // ====================================
        console.log('📋 Step 1: Deleting transactional data...');
        // Payment & Invoice related
        yield safeDelete(conn, 'payment_allocations');
        yield safeDelete(conn, 'installments'); // Installment payments
        yield safeDelete(conn, 'installment_plans'); // Installment plans
        yield safeDelete(conn, 'deleted_invoice_lines'); // Archived invoice lines
        yield safeDelete(conn, 'deleted_invoices'); // Archived invoices
        yield safeDelete(conn, 'invoice_lines');
        yield safeDelete(conn, 'invoices');
        // Journal entries
        yield safeDelete(conn, 'journal_lines');
        yield safeDelete(conn, 'journal_entries');
        // Account & Bank transactions
        yield safeDelete(conn, 'account_transactions');
        yield safeDelete(conn, 'bank_transactions');
        // Cheques
        yield safeDelete(conn, 'cheques');
        // Stock & Inventory
        yield safeDelete(conn, 'stock_movements'); // Stock movement history
        yield safeDelete(conn, 'stock_permit_items');
        yield safeDelete(conn, 'stock_permits');
        yield safeDelete(conn, 'stock_taking_items');
        yield safeDelete(conn, 'stock_taking_sessions');
        yield safeDelete(conn, 'product_stocks');
        yield safeDelete(conn, 'inventory_batches');
        yield safeDelete(conn, 'inventory_lots');
        // Serial tracking
        yield safeDelete(conn, 'serial_transactions');
        yield safeDelete(conn, 'product_serials');
        // Commission & Sales tracking
        yield safeDelete(conn, 'commission_records');
        yield safeDelete(conn, 'commission_tiers');
        yield safeDelete(conn, 'customer_visits');
        yield safeDelete(conn, 'batch_genealogy');
        // HR transactional data
        yield safeDelete(conn, 'attendance_records');
        yield safeDelete(conn, 'payroll_entries');
        yield safeDelete(conn, 'payroll_cycles');
        yield safeDelete(conn, 'employee_advances');
        // Branch transfers
        yield safeDelete(conn, 'branch_transfer_items');
        yield safeDelete(conn, 'branch_transfers');
        // Insurance & other
        yield safeDelete(conn, 'insurance');
        // Audit
        yield safeDelete(conn, 'audit_logs');
        // Van Sales / Mobile Distribution
        yield safeDelete(conn, 'vehicle_settlements');
        yield safeDelete(conn, 'vehicle_returns');
        yield safeDelete(conn, 'vehicle_visits');
        yield safeDelete(conn, 'vehicle_operations');
        yield safeDelete(conn, 'vehicle_inventory');
        yield safeDelete(conn, 'vehicles');
        if (mode === 'FULL') {
            // ====================================
            // Step 2: Delete manufacturing data
            // ====================================
            console.log('🏭 Step 2: Deleting manufacturing data...');
            yield safeDelete(conn, 'production_orders');
            yield safeDelete(conn, 'bom_items');
            yield safeDelete(conn, 'bom');
            // ====================================
            // Step 3: Delete master data
            // ====================================
            console.log('📦 Step 3: Deleting master data...');
            // Product related
            yield safeDelete(conn, 'product_units'); // Multi-unit selling
            yield safeDelete(conn, 'product_prices');
            yield safeDelete(conn, 'price_lists');
            yield safeDelete(conn, 'products');
            // Partner related
            yield safeDelete(conn, 'partner_groups');
            yield safeDelete(conn, 'partners');
            // Structure
            yield safeDelete(conn, 'warehouses');
            yield safeDelete(conn, 'branches');
            yield safeDelete(conn, 'categories');
            // Financial master data
            yield safeDelete(conn, 'cost_centers');
            yield safeDelete(conn, 'cash_categories');
            yield safeDelete(conn, 'salesmen');
            yield safeDelete(conn, 'taxes');
            yield safeDelete(conn, 'fixed_assets');
            // ====================================
            // Step 4: Delete bank-related accounts from chart of accounts
            // ====================================
            console.log('🏦 Step 4: Deleting bank-related accounts...');
            // First get all bank accountIds before deleting banks
            try {
                const [bankAccounts] = yield conn.query('SELECT accountId FROM banks WHERE accountId IS NOT NULL');
                for (const bank of bankAccounts) {
                    if (bank.accountId) {
                        yield conn.query('DELETE FROM accounts WHERE id = ?', [bank.accountId]);
                        console.log(`  ✓ Deleted bank account: ${bank.accountId} `);
                    }
                }
            }
            catch (e) {
                console.log('  ⚠️ Could not delete bank accounts (might not exist)');
            }
            // Now delete banks table
            yield safeDelete(conn, 'banks');
            // HR data
            yield safeDelete(conn, 'employee_salary_structure');
            yield safeDelete(conn, 'employee_payroll_templates');
            yield safeDelete(conn, 'structure_assignments');
            yield safeDelete(conn, 'additional_salary_entries');
            yield safeDelete(conn, 'employees');
            // Salesman targets
            yield safeDelete(conn, 'salesman_targets');
            // Exchange rates
            yield safeDelete(conn, 'exchange_rates');
            yield safeDelete(conn, 'currencies');
            // Egyptian tax
            yield safeDelete(conn, 'egyptian_tax_brackets');
            // Fiscal years
            yield safeDelete(conn, 'fiscal_years');
            // Users & permissions
            yield safeDelete(conn, 'permissions');
            yield safeDelete(conn, 'users');
            console.log('💰 Step 5: Resetting account balances to zero (keeping chart of accounts)...');
            // Reset ALL account balances to 0 (keep the accounts structure intact)
            yield conn.query('UPDATE accounts SET balance = 0, openingBalance = 0');
            console.log('  ✓ All account balances reset to 0');
            // Delete system config (initDB will recreate defaults)
            yield safeDelete(conn, 'system_config');
            // POS data
            yield safeDelete(conn, 'pos_shifts');
            yield safeDelete(conn, 'pos_sessions');
            yield safeDelete(conn, 'pos_terminals');
            // Payroll templates & structures
            yield safeDelete(conn, 'salary_structures');
            yield safeDelete(conn, 'salary_structure_components');
            yield safeDelete(conn, 'payroll_templates');
            yield safeDelete(conn, 'payroll_template_components');
            yield safeDelete(conn, 'payroll_gl_mappings');
            // Leave management
            yield safeDelete(conn, 'leave_requests');
            yield safeDelete(conn, 'leave_allocations');
            yield safeDelete(conn, 'leave_types');
            // Loan data
            yield safeDelete(conn, 'loan_repayments');
            yield safeDelete(conn, 'loans');
            // Work entries
            yield safeDelete(conn, 'work_entries');
            console.log('✅ ALL data deleted — true factory reset');
        }
        else {
            // ====================================
            // Transaction mode: reset balances only
            // ====================================
            console.log('💰 Resetting balances...');
            yield conn.query('UPDATE accounts SET balance = openingBalance');
            try {
                yield conn.query('UPDATE partners SET balance = openingBalance');
            }
            catch ( /* column might not exist */_a) { /* column might not exist */ }
            try {
                yield conn.query('UPDATE banks SET balance = 0');
            }
            catch ( /* table might not exist */_b) { /* table might not exist */ }
            yield conn.query('UPDATE products SET stock = 0');
            console.log('✅ Balances reset successfully');
        }
        // Re-enable foreign key checks
        yield conn.query('SET FOREIGN_KEY_CHECKS = 1');
        conn.release();
        console.log('✅ Database reset complete');
        const clearedTables = mode === 'FULL'
            ? [
                // Transactional
                'invoices', 'invoice_lines', 'deleted_invoices', 'deleted_invoice_lines',
                'payment_allocations', 'installment_plans', 'installments',
                'journal_entries', 'journal_lines', 'cheques',
                'stock_permits', 'stock_permit_items', 'stock_movements',
                'stock_taking_sessions', 'stock_taking_items', 'product_stocks',
                // Manufacturing
                'production_orders', 'bom', 'bom_items',
                // Master Data
                'products', 'product_units', 'product_prices', 'price_lists',
                'partners', 'partner_groups', 'warehouses', 'branches',
                'categories', 'cost_centers', 'cash_categories',
                'salesmen', 'taxes', 'fixed_assets', 'banks',
                'bank_accounts (from chart of accounts)',
                'permissions', 'users', 'audit_logs'
            ]
            : [
                'invoices', 'invoice_lines', 'deleted_invoices', 'deleted_invoice_lines',
                'payment_allocations', 'installment_plans', 'installments',
                'journal_entries', 'journal_lines', 'cheques',
                'stock_permits', 'stock_permit_items', 'stock_movements',
                'stock_taking_sessions', 'stock_taking_items', 'product_stocks',
                'vehicles', 'vehicle_inventory', 'vehicle_operations',
                'vehicle_visits', 'vehicle_returns', 'vehicle_settlements',
                'audit_logs'
            ];
        res.json({
            message: `Database reset successful(${mode})`,
            mode: mode,
            cleared: clearedTables,
            kept: mode === 'FULL'
                ? ['nothing — true factory reset, initDB will recreate defaults']
                : ['accounts', 'products', 'partners', 'warehouses', 'categories', 'all master data']
        });
    }
    catch (error) {
        console.error('❌ Error resetting database:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.resetDatabase = resetDatabase;
/**
 * Fiscal Year Rollover
 * Creates a backup, clears transactions, sets current balances as opening balances
 */
const fiscalYearRollover = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { password, newYearName } = req.body;
        // Verify password
        if (!verifyPassword(password)) {
            return res.status(403).json({ message: 'Invalid password' });
        }
        console.log('🔄 Starting Fiscal Year Rollover...');
        // Step 1: Force Backup
        console.log('📦 Step 1: Creating backup before rollover...');
        const mockReq = { body: {} };
        const mockRes = {
            json: (data) => {
                if (!data.success) {
                    throw new Error('Backup failed');
                }
            },
            status: (code) => mockRes
        };
        yield (0, backupController_1.createBackup)(mockReq, mockRes);
        // Step 2: Get connection
        const conn = yield (0, db_1.getConnection)();
        // Disable foreign key checks
        yield conn.query('SET FOREIGN_KEY_CHECKS = 0');
        // Step 3: Calculate closing balances and update opening balances
        console.log('💰 Step 2: Calculating closing balances...');
        // Accounts: set current balance as new opening balance
        yield conn.query('UPDATE accounts SET openingBalance = balance');
        // Partners: set current balance as new opening balance
        yield conn.query('UPDATE partners SET openingBalance = balance');
        // Step 4: Snapshot stock positions
        console.log('📊 Step 3: Creating stock snapshot...');
        yield conn.query(`
            CREATE TEMPORARY TABLE temp_stock_snapshot AS
            SELECT productId, warehouseId, stock 
            FROM product_stocks 
            WHERE stock > 0
    `);
        // Step 5: Delete transaction history (using safe delete)
        console.log('🗑️ Step 4: Clearing transaction history...');
        // Payment & Invoice related
        yield safeDelete(conn, 'payment_allocations');
        yield safeDelete(conn, 'installments');
        yield safeDelete(conn, 'installment_plans');
        yield safeDelete(conn, 'deleted_invoice_lines');
        yield safeDelete(conn, 'deleted_invoices');
        yield safeDelete(conn, 'invoice_lines');
        yield safeDelete(conn, 'invoices');
        // Journal entries
        yield safeDelete(conn, 'journal_lines');
        yield safeDelete(conn, 'journal_entries');
        // Cheques
        yield safeDelete(conn, 'cheques');
        // Stock & Inventory
        yield safeDelete(conn, 'stock_movements');
        yield safeDelete(conn, 'stock_permit_items');
        yield safeDelete(conn, 'stock_permits');
        yield safeDelete(conn, 'stock_taking_items');
        yield safeDelete(conn, 'stock_taking_sessions');
        // Manufacturing
        yield safeDelete(conn, 'production_orders');
        // Audit
        yield safeDelete(conn, 'audit_logs');
        // Van Sales / Mobile Distribution
        yield safeDelete(conn, 'vehicle_settlements');
        yield safeDelete(conn, 'vehicle_returns');
        yield safeDelete(conn, 'vehicle_visits');
        yield safeDelete(conn, 'vehicle_operations');
        yield safeDelete(conn, 'vehicle_inventory');
        yield safeDelete(conn, 'vehicles');
        // Clear product_stocks (will be restored from snapshot)
        yield safeDelete(conn, 'product_stocks');
        // Step 6: Restore stock from snapshot (these are now "opening" stocks)
        console.log('📦 Step 5: Restoring stock positions...');
        yield conn.query(`
            INSERT INTO product_stocks(id, productId, warehouseId, stock)
            SELECT UUID(), productId, warehouseId, stock
            FROM temp_stock_snapshot
        `);
        // Drop temporary table
        yield conn.query('DROP TEMPORARY TABLE temp_stock_snapshot');
        // Re-enable foreign key checks
        yield conn.query('SET FOREIGN_KEY_CHECKS = 1');
        // Step 7: Update system config with new year info (optional)
        if (newYearName) {
            try {
                const [rows] = yield conn.query('SELECT config FROM system_config LIMIT 1');
                const config = rows.length > 0
                    ? JSON.parse(rows[0].config || '{}')
                    : {};
                config.currentFiscalYear = newYearName;
                config.lastRolloverDate = new Date().toISOString();
                yield conn.query('UPDATE system_config SET config = ?', [JSON.stringify(config)]);
                console.log(`  ✓ Updated fiscal year to: ${newYearName} `);
            }
            catch (e) {
                console.log('  ⚠️ Could not update system config (might not exist)');
            }
        }
        conn.release();
        console.log('✅ Fiscal Year Rollover complete');
        res.json({
            message: 'Fiscal year rollover completed successfully',
            newYear: newYearName || 'New Fiscal Year',
            actions: [
                'Backup created',
                'Closing balances calculated',
                'Transaction history cleared (including installments, archived invoices)',
                'Opening balances set',
                'Stock positions preserved'
            ]
        });
    }
    catch (error) {
        console.error('❌ Fiscal Year Rollover failed:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.fiscalYearRollover = fiscalYearRollover;
