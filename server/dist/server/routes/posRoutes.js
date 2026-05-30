"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const express_1 = require("express");
const posController_1 = require("../controllers/posController");
const posExpensesController_1 = require("../controllers/posExpensesController");
const posCashiersController_1 = require("../controllers/posCashiersController");
const posShiftApprovalController_1 = require("../controllers/posShiftApprovalController");
const posConfigController_1 = require("../controllers/posConfigController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// ============================================
// SHIFT MANAGEMENT
// ============================================
// ============================================
// POS CONFIG (Shift Definitions & Devices)
// ============================================
router.get('/shift-definitions', (0, authMiddleware_1.requirePermission)('pos.access'), posConfigController_1.getShiftDefinitions);
router.post('/shift-definitions', (0, authMiddleware_1.requirePermission)('pos.shifts.manage'), posConfigController_1.createShiftDefinition);
router.put('/shift-definitions/:id', (0, authMiddleware_1.requirePermission)('pos.shifts.manage'), posConfigController_1.updateShiftDefinition);
router.delete('/shift-definitions/:id', (0, authMiddleware_1.requirePermission)('pos.shifts.manage'), posConfigController_1.deleteShiftDefinition);
router.get('/devices', (0, authMiddleware_1.requirePermission)('pos.access'), posConfigController_1.getDevices);
router.post('/devices', (0, authMiddleware_1.requirePermission)('pos.devices.manage'), posConfigController_1.createDevice);
router.put('/devices/:id', (0, authMiddleware_1.requirePermission)('pos.devices.manage'), posConfigController_1.updateDevice);
router.delete('/devices/:id', (0, authMiddleware_1.requirePermission)('pos.devices.manage'), posConfigController_1.deleteDevice);
// ============================================
// SHIFT MANAGEMENT
// ============================================// Open a new shift
router.post('/shift/open', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.openShift);
// Get current open shift for logged-in user
router.get('/shift/current', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getCurrentShift);
// Close a shift
router.post('/shift/close', (0, authMiddleware_1.requirePermission)('pos.close_shift'), posController_1.closeShift);
// Validate (approve) a closed shift — manager/admin only
router.post('/shift/validate', (0, authMiddleware_1.requirePermission)('pos.validate'), posController_1.validateShift);
// Un-validate a shift — admin only
router.post('/shift/unvalidate', (0, authMiddleware_1.requirePermission)('pos.validate'), posController_1.unvalidateShift);
// Reopen a closed/pending shift
router.post('/shift/reopen', (0, authMiddleware_1.requirePermission)('pos.validate'), posController_1.reopenShift);
// Delete a shift
router.delete('/sessions/:id', (0, authMiddleware_1.requirePermission)('pos.sessions.delete'), posController_1.deleteShift);
// Get all shifts (with filters)
router.get('/shifts', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getShifts);
// Get shift report (X/Z report)
router.get('/shift/:shiftId/report', (0, authMiddleware_1.requirePermission)('pos.reports'), posController_1.getShiftReport);
// Get shift cash movements
router.get('/shift/:shiftId/movements', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getShiftMovements);
// Get hourly sales report
router.get('/reports/hourly', (0, authMiddleware_1.requirePermission)('pos.reports'), posController_1.getHourlySales);
router.get('/reports/summary', (0, authMiddleware_1.requirePermission)('pos.reports'), posController_1.getReportSummary);
// ── Specialized Reports (Phase 5) ──────────────────────────────────────────
router.get('/reports/category-sales', (0, authMiddleware_1.requirePermission)('pos.reports'), posController_1.getCategorySalesSummary);
router.get('/reports/product-sales', (0, authMiddleware_1.requirePermission)('pos.reports'), posController_1.getProductSalesSummary);
router.get('/reports/shift-sales', (0, authMiddleware_1.requirePermission)('pos.reports'), posController_1.getShiftSalesReport);
router.get('/reports/shift-movement-detail', (0, authMiddleware_1.requirePermission)('pos.reports'), posController_1.getShiftMovementDetail);
router.get('/reports/shift-profitability', (0, authMiddleware_1.requirePermission)('pos.reports'), posController_1.getShiftProfitabilityReport);
router.get('/reports/category-profitability', (0, authMiddleware_1.requirePermission)('pos.reports'), posController_1.getCategoryProfitabilityReport);
router.get('/reports/product-profitability', (0, authMiddleware_1.requirePermission)('pos.reports'), posController_1.getProductProfitabilityReport);
// Universal CSV export — must come AFTER specific routes to avoid path collision
router.get('/reports/:reportKey/export', (0, authMiddleware_1.requirePermission)('pos.reports'), posController_1.exportPOSReport);
const fixGhostCashController_1 = require("../controllers/fixGhostCashController");
router.get('/fix-ghost-cash', fixGhostCashController_1.fixGhostCash);
// ============================================
// CASH OPERATIONS
// ============================================
// Add cash movement (deposit/withdrawal)
router.post('/cash-movement', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.addCashMovement);
// ============================================
// PAYMENT ACCOUNTS
// ============================================
// Get branch-specific cash + bank accounts for the split-payment modal
router.get('/payment-accounts', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getPaymentAccounts);
// ============================================
// SALES
// ============================================
// Process a POS sale
router.post('/sale', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.processPOSSale);
// ============================================
// PRODUCTS
// ============================================
// Get products optimized for POS
router.get('/products', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getPOSProducts);
// Look up product by barcode
router.get('/product/barcode/:barcode', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getProductByBarcode);
// Get rich product detail for POS info popup (stock per warehouse, 28/7-day sales)
router.get('/products/:id/detail', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getPOSProductDetail);
// Get embedded variants for a product (product_variants table)
router.get('/products/:id/embedded-variants', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getEmbeddedVariants);
// ============================================
// HELD ORDERS
// ============================================
// Hold an order for later
router.post('/hold', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.holdOrder);
// Get held orders for a shift
router.get('/held/:shiftId', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getHeldOrders);
// Recall a held order (and delete it from held)
router.delete('/held/:holdId', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.recallHeldOrder);
// ============================================
// RETURNS / REFUNDS
// ============================================
// Look up POS invoice for refund
router.get('/invoice/:invoiceNumber', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getPOSInvoice);
// Process a refund
router.post('/refund', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.processPOSRefund);
// Get recent POS sales (for refund lookup)
router.get('/recent-sales', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getRecentPOSSales);
// ============================================
// CUSTOMER CRM SNAPSHOT
// ============================================
// Get customer CRM snapshot (balance, recent invoices, stats)
router.get('/customers/:id/summary', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getPOSCustomerSummary);
// Get the last POS order for a specific customer
router.get('/customers/:customerId/last-order', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getCustomerLastOrder);
// ============================================
// VARIANT GROUPS
// ============================================
// List all variant groups (admin)
router.get('/variant-groups', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getVariantGroups);
// Create a new variant group
router.post('/variant-groups', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.createVariantGroup);
// Update variant group name / attribute keys
router.put('/variant-groups/:groupId', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.updateVariantGroup);
// Delete a variant group
router.delete('/variant-groups/:groupId', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.deleteVariantGroup);
// Assign / remove a product from a group (PATCH with attributes or null)
router.patch('/variant-groups/:groupId/product/:productId', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.assignProductToVariantGroup);
// Get all products in a variant group
router.get('/variant-groups/:groupId/products', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getVariantGroupProducts);
// ============================================
// PHASE 1: SETTINGS & TREASURIES
// ============================================
// Get treasury/cash accounts for shift setup
router.get('/treasuries', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getPOSTreasuries);
// Get closing balance of the last shift for a specific treasury
router.get('/treasuries/:id/previous-balance', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getTreasuryPreviousBalance);
// POS settings (discount lock, admin password)
router.get('/settings', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.getPOSSettings);
router.put('/settings', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.updatePOSSettings);
// Warehouse stock count check — lightweight pre-flight for shift setup
router.get('/warehouse-stock-count', (0, authMiddleware_1.requirePermission)('pos.access'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { warehouseId } = req.query;
        if (!warehouseId)
            return res.json({ count: 0 });
        const { getConnection } = yield Promise.resolve().then(() => __importStar(require('../db')));
        const conn = yield getConnection();
        try {
            const [rows] = yield conn.query(`SELECT COUNT(DISTINCT productId) as count FROM product_stocks WHERE warehouseId = ? AND stock > 0`, [warehouseId]);
            res.json({ count: ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.count) || 0 });
        }
        finally {
            conn.release();
        }
    }
    catch (err) {
        res.json({ count: -1 }); // Non-fatal — don't block shift open
    }
}));
// Verify admin password → returns 15-min adminToken
router.post('/verify-admin-password', (0, authMiddleware_1.requirePermission)('pos.access'), posController_1.verifyAdminPassword);
// ============================================
// PHASE 2: QUICK EXPENSES
// ============================================
router.get('/expense-categories', (0, authMiddleware_1.requirePermission)('pos.access'), posExpensesController_1.getExpenseCategories);
router.post('/shifts/:shiftId/expenses', (0, authMiddleware_1.requirePermission)('pos.access'), posExpensesController_1.addExpense);
router.get('/shifts/:shiftId/expenses', (0, authMiddleware_1.requirePermission)('pos.access'), posExpensesController_1.getShiftExpenses);
router.delete('/expenses/:id', (0, authMiddleware_1.requirePermission)('pos.access'), posExpensesController_1.deleteExpense);
// Contextual pickers for expense categories
router.get('/expense-meta/employees', (0, authMiddleware_1.requirePermission)('pos.access'), posExpensesController_1.getExpenseEmployees);
router.get('/expense-meta/suppliers', (0, authMiddleware_1.requirePermission)('pos.access'), posExpensesController_1.getExpenseSuppliers);
router.get('/expense-meta/misc-items', (0, authMiddleware_1.requirePermission)('pos.access'), posExpensesController_1.getExpenseMiscItems);
// ============================================
// PHASE 5: CASHIER MANAGEMENT
// ============================================
// POS cashier login (before session exists)
router.post('/cashier-login', posCashiersController_1.posCashierLogin);
// Cashier CRUD (admin)
router.get('/cashiers', (0, authMiddleware_1.requirePermission)('pos.access'), posCashiersController_1.getCashiers);
router.post('/cashiers', (0, authMiddleware_1.requirePermission)('pos.access'), posCashiersController_1.createCashier);
router.put('/cashiers/:id', (0, authMiddleware_1.requirePermission)('pos.access'), posCashiersController_1.updateCashier);
router.delete('/cashiers/:id', (0, authMiddleware_1.requirePermission)('pos.access'), posCashiersController_1.deleteCashier);
// Switch cashier within an open shift
router.post('/shifts/:shiftId/switch-cashier', (0, authMiddleware_1.requirePermission)('pos.access'), posCashiersController_1.switchCashier);
// End current cashier sub-session (lock POS without closing shift)
router.post('/shifts/:shiftId/end-cashier-session', (0, authMiddleware_1.requirePermission)('pos.access'), posCashiersController_1.endCashierSession);
// ============================================
// PHASE 6: SHIFT APPROVAL
// ============================================
// List closed shifts pending approval
router.get('/shifts/review', (0, authMiddleware_1.requirePermission)('pos.access'), posShiftApprovalController_1.getShiftsForReview);
// Shift financial summary for admin review
router.get('/shifts/:shiftId/summary', (0, authMiddleware_1.requirePermission)('pos.access'), posShiftApprovalController_1.getShiftSummary);
// Approve shift (with or without discrepancy)
router.post('/shifts/:shiftId/approve', (0, authMiddleware_1.requirePermission)('pos.access'), posShiftApprovalController_1.approveShift);
router.post('/shifts/:shiftId/force-approve', (0, authMiddleware_1.requirePermission)('pos.access'), posShiftApprovalController_1.forceApproveShift);
// ============================================
// ADMIN INVOICE EDIT
// ============================================
router.put('/invoice/:invoiceId/edit', (0, authMiddleware_1.requirePermission)('pos.admin_edit_invoice'), posController_1.updatePOSInvoice);
exports.default = router;
