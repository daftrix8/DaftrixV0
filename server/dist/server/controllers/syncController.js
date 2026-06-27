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
exports.repairOrphanedVouchers = exports.syncTransaction = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const salesmanTargetController_1 = require("./salesmanTargetController");
const errorHandler_1 = require("../utils/errorHandler");
const auditController_1 = require("./auditController");
const accountBalanceUtils_1 = require("../utils/accountBalanceUtils");
const invoiceCascadeDelete_1 = require("../utils/invoiceCascadeDelete");
const branchFilter_1 = require("../utils/branchFilter");
const eventBus_1 = require("../utils/eventBus");
const invoiceNumberGenerator_1 = require("../utils/invoiceNumberGenerator");
const decimalUtils_1 = require("../utils/decimalUtils");
const policyEnforcement_1 = require("../utils/policyEnforcement");
const index_1 = require("../index");
const dateEngine_1 = require("../utils/dateEngine");
const paymentGeneration_1 = require("../utils/paymentGeneration");
// Helper to sanitize ID fields to prevent "Data too long" errors
// Mobile clients may send IDs longer than the VARCHAR(36) column allows
const sanitizeId = (value, maxLen = 36) => {
    if (!value)
        return null;
    return typeof value === 'string' && value.length > maxLen ? value.substring(0, maxLen) : value;
};
// generateInvoiceNumber replaced by shared gap-fill utility: generateNextSequentialNumber
// (imported from '../utils/invoiceNumberGenerator')
// Helper function to resolve salesmanId from a potentially incorrect userId
// Mobile apps sometimes send userId instead of salesmanId - this fixes that
// PERF: Supports request-scoped memoization via optional cache parameter
const resolveSalesmanId = (conn, providedId, cache) => __awaiter(void 0, void 0, void 0, function* () {
    if (!providedId)
        return null;
    // PERF: Check memoization cache first (avoids repeated DB lookups within one request)
    if (cache && cache.has(providedId))
        return cache.get(providedId);
    // First, check if it's a valid salesman ID
    const [salesmanExists] = yield conn.query('SELECT id FROM salesmen WHERE id = ?', [providedId]);
    if (salesmanExists.length > 0) {
        if (cache)
            cache.set(providedId, providedId);
        return providedId; // It's a valid salesman ID
    }
    // If not a salesman, check if it's a user ID with a linked salesmanId
    const [userWithSalesman] = yield conn.query('SELECT salesmanId FROM users WHERE id = ? AND salesmanId IS NOT NULL', [providedId]);
    if (userWithSalesman.length > 0 && userWithSalesman[0].salesmanId) {
        // PERF: console.log(`ðŸ”„ Resolved userId ${providedId.substring(0, 8)} to salesmanId ${userWithSalesman[0].salesmanId.substring(0, 8)}`);
        if (cache)
            cache.set(providedId, userWithSalesman[0].salesmanId);
        return userWithSalesman[0].salesmanId;
    }
    // Return null if we can't resolve it (orphan ID)
    // PERF: console.warn(`âš ï¸  Could not resolve salesmanId: ${providedId} (not found in salesmen or users)`);
    if (cache)
        cache.set(providedId, null);
    return null;
});
/**
 * COMPREHENSIVE PERMISSION CHECKER FOR SYNC
 * ==========================================
 * This function validates that the user has the required permissions to sync data.
 *
 * IMPORTANT: constants.ts (frontend) and updatePermissions.ts (server) define
 * DIFFERENT permission IDs for the same operation. For example:
 *   - Frontend (constants.ts):        purchase.create
 *   - Server  (updatePermissions.ts): purchase.create_invoice AND purchase.create
 *
 * This function MUST accept ALL valid variants to prevent false "Permission denied" errors.
 * If you add a new permission ID anywhere in the system, you MUST also add it here.
 *
 * Permission ID cross-reference:
 * ┌─────────────────────────────────┬───────────────────────────────────────┐
 * │ constants.ts (frontend)         │ updatePermissions.ts (server)         │
 * ├─────────────────────────────────┼───────────────────────────────────────┤
 * │ sales.create                    │ sales.create + sales.create_invoice   │
 * │ purchase.create                 │ purchase.create + purchase.create_inv │
 * │ sales.return                    │ sales.return                          │
 * │ purchase.return                 │ purchase.return                       │
 * │ treasury.receipt (singular)     │ treasury.receipt                      │
 * │ treasury.payment (singular)     │ treasury.payment                      │
 * │ accounting.journal              │ accounting.journal + .journal_entry   │
 * └─────────────────────────────────┴───────────────────────────────────────┘
 */
const checkPermissions = (user, body) => {
    // Admins bypass all permission checks
    const role = (user.role || '').toUpperCase();
    if (role === 'ADMIN' || role === 'MASTER_ADMIN' || role === 'GENERAL_MANAGER')
        return;
    // Allow SALES/SALESMAN/CASHIER/POS roles to sync sales invoices
    const isSalesOrPosRole = ['SALES', 'SALESMAN', 'CASHIER', 'POS', 'WAREHOUSE_SUPERVISOR'].includes(role)
        || user.role === 'salesman';
    const allInvoices = [...(body.invoices || []), body.invoice].filter(Boolean);
    const hasSalesInvoices = allInvoices.some((inv) => { var _a, _b; return ((_a = inv === null || inv === void 0 ? void 0 : inv.type) === null || _a === void 0 ? void 0 : _a.includes('SALE')) || ((_b = inv === null || inv === void 0 ? void 0 : inv.type) === null || _b === void 0 ? void 0 : _b.includes('RECEIPT')); });
    // If it's a sales/POS/cashier user syncing sales data (no deletions), allow everything
    // This covers the invoice + journal + partner balance updates that accompany every save
    if (isSalesOrPosRole && hasSalesInvoices && !body.deletedInvoiceId && !body.deletedJournalId) {
        return; // Allow sales/POS/cashier users to sync their sales
    }
    // Parse permissions — handle array, string, or object (JWT may deserialize arrays as objects)
    let perms = [];
    if (Array.isArray(user.permissions)) {
        perms = user.permissions;
    }
    else if (typeof user.permissions === 'string') {
        try {
            perms = JSON.parse(user.permissions);
        }
        catch (_a) {
            perms = [];
        }
    }
    else if (user.permissions && typeof user.permissions === 'object') {
        // JWT sometimes deserializes arrays as plain objects {0: "perm1", 1: "perm2", ...}
        perms = Object.values(user.permissions);
    }
    // Role-based default permissions (mirrors authMiddleware ROLE_DEFAULT_PERMISSIONS)
    const roleDefaults = {
        'SALES': ['sales.view', 'sales.create', 'sales.create_invoice', 'sales.edit', 'sales.print', 'sales.return', 'sales.discount', 'customers.view', 'inventory.view', 'reports.view'],
        'CASHIER': ['sales.view', 'sales.create', 'sales.create_invoice', 'sales.edit', 'sales.print', 'sales.return', 'sales.discount', 'pos.access', 'pos.close_shift', 'pos.reports', 'customers.view', 'inventory.view', 'treasury.receipt', 'reports.view'],
        'ACCOUNTANT': ['accounting.view', 'accounting.manage', 'accounting.journal', 'accounting.journal_entry', 'treasury.view', 'treasury.manage', 'treasury.receipt', 'treasury.payment', 'treasury.cheques', 'treasury.transfer', 'sales.view', 'purchase.view', 'purchase.create', 'purchase.create_invoice', 'partners.view', 'reports.view'],
        'WAREHOUSE_SUPERVISOR': ['inventory.view', 'inventory.manage', 'inventory.permit_in', 'inventory.permit_out', 'inventory.transfer', 'inventory.stock_taking', 'reports.view'],
        'PURCHASING': ['purchase.view', 'purchase.create', 'purchase.create_invoice', 'purchase.edit', 'purchase.return', 'purchase.manage', 'suppliers.view', 'inventory.view', 'reports.view'],
    };
    const defaults = roleDefaults[role] || [];
    const has = (p) => perms.includes(p) || perms.includes('all') || perms.includes('*') || defaults.includes(p);
    const hasAny = (ps) => ps.some(p => has(p));
    // ─── PERMISSION GROUPS ───
    // Each group lists ALL valid permission IDs that grant the same capability.
    const CAN_CREATE_SALE = ['sales.create', 'sales.create_invoice', 'sales.manage'];
    const CAN_CREATE_PURCHASE = ['purchase.create', 'purchase.create_invoice', 'purchase.manage'];
    const CAN_RETURN_SALE = ['sales.return', 'sales.create', 'sales.create_invoice', 'sales.manage'];
    const CAN_RETURN_PURCHASE = ['purchase.return', 'purchase.create', 'purchase.create_invoice', 'purchase.manage'];
    const CAN_RECEIPT = ['treasury.receipt', 'treasury.receipts', 'treasury.manage', 'customers.payments'];
    const CAN_PAYMENT = ['treasury.payment', 'treasury.payments', 'treasury.manage', 'suppliers.payments'];
    const CAN_JOURNAL = ['accounting.journal', 'accounting.journal_entry', 'accounting.manage'];
    const CAN_PARTNER = ['partners.manage', 'partners.manage_customers', 'partners.manage_suppliers', 'customers.manage', 'suppliers.manage', 'sales.manage', 'purchase.manage'];
    // Determine if user is allowed to create ANY type of invoice (used for journal/partner bypass)
    const canCreateInvoice = isSalesOrPosRole
        || hasAny(CAN_CREATE_SALE)
        || hasAny(CAN_CREATE_PURCHASE)
        || has('pos.access') || has('pos.manage') || has('pos.sale')
        || has('vansales') || has('vansales.manage')
        || has('mobile_sales') || has('salesman') || has('cashier');
    // 1. Invoices — check each invoice type against ALL valid permission variants
    const invoicesToCheck = [...(body.invoices || [])];
    if (body.invoice)
        invoicesToCheck.push(body.invoice);
    for (const inv of invoicesToCheck) {
        const t = inv.type;
        // Sales invoices
        if (t === 'SALE_INVOICE' || t === 'INVOICE_SALE') {
            if (!canCreateInvoice && !hasAny(CAN_CREATE_SALE)) {
                console.error(`🚫 [SYNC PERM] DENIED sale for user: ${user.username || user.id}, role: "${role}", perms: ${JSON.stringify(perms.slice(0, 15))}`);
                throw new Error('Permission denied: sales.create_invoice');
            }
        }
        // Sales returns
        else if (t === 'SALE_RETURN' || t === 'RETURN_SALE') {
            if (!canCreateInvoice && !hasAny(CAN_RETURN_SALE)) {
                console.error(`🚫 [SYNC PERM] DENIED sale return for user: ${user.username || user.id}, role: "${role}", perms: ${JSON.stringify(perms.slice(0, 15))}`);
                throw new Error('Permission denied: sales.return');
            }
        }
        // Receipts (customer payments)
        else if (t === 'RECEIPT') {
            if (!canCreateInvoice && !hasAny(CAN_RECEIPT)) {
                console.error(`🚫 [SYNC PERM] DENIED receipt for user: ${user.username || user.id}, role: "${role}", perms: ${JSON.stringify(perms.slice(0, 15))}`);
                throw new Error('Permission denied: treasury.receipt');
            }
        }
        // Purchase invoices
        else if (t === 'PURCHASE_INVOICE' || t === 'INVOICE_PURCHASE') {
            if (!hasAny(CAN_CREATE_PURCHASE)) {
                console.error(`🚫 [SYNC PERM] DENIED purchase for user: ${user.username || user.id}, role: "${role}", perms: ${JSON.stringify(perms.slice(0, 15))}`);
                throw new Error('Permission denied: purchase.create');
            }
        }
        // Purchase returns
        else if (t === 'PURCHASE_RETURN' || t === 'RETURN_PURCHASE') {
            if (!hasAny(CAN_RETURN_PURCHASE)) {
                console.error(`🚫 [SYNC PERM] DENIED purchase return for user: ${user.username || user.id}, role: "${role}", perms: ${JSON.stringify(perms.slice(0, 15))}`);
                throw new Error('Permission denied: purchase.return');
            }
        }
        // Payments (to suppliers)
        else if (t === 'PAYMENT') {
            if (!hasAny(CAN_CREATE_PURCHASE) && !hasAny(CAN_PAYMENT)) {
                console.error(`🚫 [SYNC PERM] DENIED payment for user: ${user.username || user.id}, role: "${role}", perms: ${JSON.stringify(perms.slice(0, 15))}`);
                throw new Error('Permission denied: treasury.payment');
            }
        }
        // DISCOUNT_ALLOWED / DISCOUNT_EARNED — tied to sales or purchase permissions
        else if (t === 'DISCOUNT_ALLOWED') {
            if (!canCreateInvoice && !hasAny(CAN_CREATE_SALE) && !has('customers.discount')) {
                throw new Error('Permission denied: sales.discount');
            }
        }
        else if (t === 'DISCOUNT_EARNED') {
            if (!hasAny(CAN_CREATE_PURCHASE) && !has('suppliers.discount')) {
                throw new Error('Permission denied: purchase.discount');
            }
        }
    }
    // 2. Journals — allow if user can create ANY invoice (journals are auto-generated from invoice saves)
    if (body.journal || (body.journals && body.journals.length > 0)) {
        if (!canCreateInvoice && !hasAny(CAN_JOURNAL)) {
            throw new Error('Permission denied: accounting.journal_entry');
        }
    }
    // 3. Products / Stocks
    if ((body.products && body.products.length > 0) || (body.productStocks && body.productStocks.length > 0)) {
        if (!has('inventory.manage') && !has('inventory.manage_products'))
            throw new Error('Permission denied: inventory.manage');
    }
    // 4. Partners — allow if user can create invoices (partner balances update on invoice save)
    if (body.partners && body.partners.length > 0) {
        if (!canCreateInvoice && !hasAny(CAN_PARTNER)) {
            throw new Error('Permission denied: partners.manage');
        }
    }
    // 5. Cheques
    if (body.cheques && body.cheques.length > 0) {
        if (!has('treasury.manage') && !has('treasury.cheques'))
            throw new Error('Permission denied: treasury.cheques');
    }
    // 6. Fixed Assets
    if (body.fixedAssets && body.fixedAssets.length > 0) {
        if (!has('accounting.manage') && !has('accounting.assets') && !has('accounting.fixed_assets'))
            throw new Error('Permission denied: accounting.assets');
    }
    // 7. Deletions — require the SPECIFIC delete permission, not just .manage
    if (body.deletedInvoiceId) {
        if (!hasAny(['sales.delete', 'purchase.delete', 'sales.manage', 'purchase.manage', 'treasury.manage'])) {
            throw new Error('Permission denied: delete invoice (requires sales.delete or purchase.delete)');
        }
    }
    if (body.deletedJournalId) {
        if (!hasAny(['accounting.manage', 'accounting.journal', 'accounting.journal_entry']))
            throw new Error('Permission denied: delete journal');
    }
};
const resolveSyncCashBankAccount = (conn, bankAccountId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!bankAccountId)
        return null;
    const [accRowsDirect] = yield conn.query('SELECT id, name FROM accounts WHERE id = ? LIMIT 1', [bankAccountId]);
    if (accRowsDirect[0])
        return accRowsDirect[0];
    const [bankRows] = yield conn.query('SELECT accountId FROM banks WHERE id = ? LIMIT 1', [bankAccountId]);
    const expAccountId = (_a = bankRows[0]) === null || _a === void 0 ? void 0 : _a.accountId;
    if (expAccountId) {
        const [expAccRows] = yield conn.query('SELECT id, name FROM accounts WHERE id = ? LIMIT 1', [expAccountId]);
        if (expAccRows[0])
            return expAccRows[0];
    }
    return null;
});
const syncTransaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31, _32, _33, _34, _35, _36, _37, _38, _39, _40, _41, _42, _43, _44, _45, _46, _47, _48, _49, _50, _51, _52, _53, _54;
    const currentUser = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || req.body.user || 'System';
    const syncInvoiceCashMovement = (conn, inv, posShiftId) => __awaiter(void 0, void 0, void 0, function* () {
        // Delete existing movement for this invoice
        yield conn.query('DELETE FROM pos_cash_movements WHERE referenceId = ?', [inv.id]);
        if (posShiftId && inv.paymentMethod === 'CASH' && inv.status !== 'VOID' && inv.status !== 'DRAFT') {
            const movementId = (0, crypto_1.randomUUID)();
            let movementType = 'SALE';
            if (inv.type === 'INVOICE_SALE' || inv.type === 'SALE_INVOICE') {
                movementType = 'SALE';
            }
            else if (inv.type === 'RETURN_SALE' || inv.type === 'SALE_RETURN') {
                movementType = 'REFUND';
            }
            else if (inv.type === 'INVOICE_PURCHASE' || inv.type === 'PURCHASE_INVOICE') {
                movementType = 'PURCHASE';
            }
            else if (inv.type === 'RETURN_PURCHASE' || inv.type === 'PURCHASE_RETURN') {
                movementType = 'DEPOSIT';
            }
            yield conn.query(`INSERT INTO pos_cash_movements (id, shiftId, type, amount, paymentMethod, referenceId, referenceType, description, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?, 'INVOICE', ?, NOW())`, [
                movementId,
                posShiftId,
                movementType,
                inv.total,
                inv.paymentMethod,
                inv.id,
                `مزامنة فاتورة ${inv.number || inv.id} - ${inv.partnerName || ''}`
            ]);
            try {
                const { recalculateShiftTotals } = require('./posController');
                yield recalculateShiftTotals(conn, posShiftId, inv.createdBy || currentUser);
            }
            catch (e) {
                console.error('⚠️ [syncController] Error recalculating shift totals:', e.message);
            }
        }
        else if (posShiftId) {
            try {
                const { recalculateShiftTotals } = require('./posController');
                yield recalculateShiftTotals(conn, posShiftId, inv.createdBy || currentUser);
            }
            catch (e) {
                console.error('⚠️ [syncController] Error recalculating shift totals:', e.message);
            }
        }
    });
    const getStockChange = (line, invType) => {
        const isPurchase = invType === 'PURCHASE_INVOICE' || invType === 'INVOICE_PURCHASE' || invType === 'PURCHASE_RETURN' || invType === 'RETURN_PURCHASE';
        const isSale = invType === 'SALE_INVOICE' || invType === 'INVOICE_SALE' || invType === 'SALE_RETURN' || invType === 'RETURN_SALE';
        const isReturn = invType === 'SALE_RETURN' || invType === 'RETURN_SALE' || invType === 'PURCHASE_RETURN' || invType === 'RETURN_PURCHASE';
        const convFactor = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.conversionFactor), 5) || 1;
        const baseQty = line.baseQuantity ? (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.baseQuantity), 5) : (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.quantity).mul((0, decimalUtils_1.D)(convFactor)), 5);
        const bonusQty = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.bonusQty).mul((0, decimalUtils_1.D)(convFactor)), 5);
        const totalBaseQty = baseQty + bonusQty;
        if (isPurchase)
            return isReturn ? -totalBaseQty : totalBaseQty;
        if (isSale)
            return isReturn ? totalBaseQty : -totalBaseQty;
        return 0;
    };
    const applyStockDeltas = (conn, inv, oldLines, wasPosted, isNowPosted, whId) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const stockInvoiceTypes = ['INVOICE_SALE', 'SALE_INVOICE', 'INVOICE_PURCHASE', 'PURCHASE_INVOICE', 'RETURN_SALE', 'SALE_RETURN', 'RETURN_PURCHASE', 'PURCHASE_RETURN'];
        if (!stockInvoiceTypes.includes(inv.type))
            return;
        // ── Variant ID → Parent Product ID Resolution ──
        // Embedded variants use the parent product's ID as productId (FK-safe),
        // with a separate variantId field to identify the specific variant.
        // We also support the legacy path where productId IS the variant ID.
        const variantToParent = new Map();
        const allProductIds = new Set();
        const collectIds = (lines) => {
            for (const line of lines) {
                if (line.productId)
                    allProductIds.add(line.productId);
            }
        };
        if (wasPosted && (oldLines === null || oldLines === void 0 ? void 0 : oldLines.length))
            collectIds(oldLines);
        if (isNowPosted && ((_a = inv.lines) === null || _a === void 0 ? void 0 : _a.length))
            collectIds(inv.lines);
        if (allProductIds.size > 0) {
            try {
                const [variantRows] = yield conn.query(`SELECT id, productId FROM product_variants WHERE id IN (?)`, [Array.from(allProductIds)]);
                for (const row of variantRows) {
                    variantToParent.set(row.id, row.productId);
                }
            }
            catch (_c) {
                // product_variants table may not exist — no variant resolution needed
            }
        }
        // Helper: resolve a line's productId to the parent product (for stock tracking)
        const resolveProductId = (lineProductId) => variantToParent.get(lineProductId) || lineProductId;
        // Key: "productId|warehouseId" — each line's warehouse is respected, falling back to the invoice-level warehouse.
        const productWarehouseStockChanges = new Map();
        // Key: "variantId|productId|warehouseId" - to track variant-level stock changes per warehouse
        const variantWarehouseStockChanges = new Map();
        // Key: "productId|warehouseId|variantId" - for stock_movements
        const detailedStockChanges = new Map();
        // Track variant-specific stock changes separately (to update product_variants.stock)
        const variantStockChanges = new Map();
        // Helper: resolve which variantId to track for a given line
        const getLineVariantId = (line) => {
            // Prefer explicit variantId field (new path)
            if (line.variantId)
                return line.variantId;
            // Legacy path: productId IS the variant ID
            if (variantToParent.has(line.productId))
                return line.productId;
            return null;
        };
        // Get the effective warehouse for a line: line-level overrides invoice-level
        const resolveLineWarehouse = (line) => (line.warehouseId && typeof line.warehouseId === 'string' ? line.warehouseId : null) || whId;
        // Reverse old lines if it was posted
        if (wasPosted && oldLines && oldLines.length > 0) {
            for (const line of oldLines) {
                if (line.productId) {
                    const stockChange = getStockChange(line, inv.type);
                    if (stockChange !== 0) {
                        const parentId = resolveProductId(line.productId);
                        const lineWh = resolveLineWarehouse(line);
                        const key = `${parentId}|${lineWh || ''}`;
                        productWarehouseStockChanges.set(key, (productWarehouseStockChanges.get(key) || 0) - stockChange);
                        // Track variant-level change using explicit variantId or legacy path
                        const vId = getLineVariantId(line);
                        const detailedKey = `${parentId}|${lineWh || ''}|${vId || ''}`;
                        detailedStockChanges.set(detailedKey, (detailedStockChanges.get(detailedKey) || 0) - stockChange);
                        if (vId) {
                            variantStockChanges.set(vId, (variantStockChanges.get(vId) || 0) - stockChange);
                            const vKey = `${vId}|${parentId}|${lineWh || ''}`;
                            variantWarehouseStockChanges.set(vKey, (variantWarehouseStockChanges.get(vKey) || 0) - stockChange);
                        }
                    }
                }
            }
        }
        // Apply new lines if it is now posted
        if (isNowPosted && inv.lines && inv.lines.length > 0) {
            console.log(`🔍 [applyStockDeltas] Processing ${inv.lines.length} new lines for invoice ${inv.id}, type=${inv.type}`);
            for (const line of inv.lines) {
                if (line.productId) {
                    const stockChange = getStockChange(line, inv.type);
                    const lineWh = resolveLineWarehouse(line);
                    console.log(`🔍 [applyStockDeltas] Line: productId=${line.productId}, variantId=${line.variantId || 'NONE'}, qty=${line.quantity}, stockChange=${stockChange}, warehouse=${lineWh}`);
                    if (stockChange !== 0) {
                        const parentId = resolveProductId(line.productId);
                        const key = `${parentId}|${lineWh || ''}`;
                        productWarehouseStockChanges.set(key, (productWarehouseStockChanges.get(key) || 0) + stockChange);
                        // Track variant-level change using explicit variantId or legacy path
                        const vId = getLineVariantId(line);
                        const detailedKey = `${parentId}|${lineWh || ''}|${vId || ''}`;
                        detailedStockChanges.set(detailedKey, (detailedStockChanges.get(detailedKey) || 0) + stockChange);
                        if (vId) {
                            variantStockChanges.set(vId, (variantStockChanges.get(vId) || 0) + stockChange);
                            const vKey = `${vId}|${parentId}|${lineWh || ''}`;
                            variantWarehouseStockChanges.set(vKey, (variantWarehouseStockChanges.get(vKey) || 0) + stockChange);
                        }
                        console.log(`🔍 [applyStockDeltas] -> parentId=${parentId}, variantId=${vId || 'NONE'}, warehouse=${lineWh}`);
                    }
                }
            }
        }
        // Remove 0 deltas
        for (const [key, change] of productWarehouseStockChanges.entries()) {
            if (Math.abs(change) < 0.0001)
                productWarehouseStockChanges.delete(key);
        }
        if (productWarehouseStockChanges.size > 0) {
            // FIX: Delete old stock_movements for this invoice before creating new ones.
            // Without this, editing an invoice through sync creates DUPLICATE movements
            // instead of replacing them (invoiceController.updateInvoice already does this).
            if (inv.id) {
                yield conn.query('DELETE FROM stock_movements WHERE reference_id = ?', [inv.id]);
            }
            // Ensure a fallback warehouse exists if any line has no warehouse
            let fallbackWhId = whId;
            if (!fallbackWhId) {
                const [whRows] = yield conn.query('SELECT id FROM warehouses LIMIT 1');
                fallbackWhId = ((_b = whRows[0]) === null || _b === void 0 ? void 0 : _b.id) || null;
            }
            // Collect unique productIds for the products.stock aggregate update
            const productTotalChanges = new Map();
            for (const [key, change] of productWarehouseStockChanges.entries()) {
                const productId = key.split('|')[0];
                productTotalChanges.set(productId, (productTotalChanges.get(productId) || 0) + change);
            }
            // Update products.stock (aggregate total across all warehouses)
            const cases = [];
            const ids = [];
            const productIdsToUpdate = Array.from(productTotalChanges.keys());
            for (const [productId, stockChange] of productTotalChanges.entries()) {
                cases.push(`WHEN id = ? THEN COALESCE(stock, 0) + ?`);
                ids.push(productId, stockChange);
            }
            const updateQuery = `
                UPDATE products 
                SET stock = CASE 
                    ${cases.join('\n                    ')}
                    ELSE stock 
                END
                WHERE id IN (?)
            `;
            ids.push(productIdsToUpdate);
            yield conn.query(updateQuery, ids);
            // Update product_stocks per product+warehouse — this is the source of truth for per-warehouse inventory
            for (const [key, change] of productWarehouseStockChanges.entries()) {
                const [productId, lineWhId] = key.split('|');
                const effectiveWhId = lineWhId || fallbackWhId;
                if (!effectiveWhId)
                    continue;
                yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock)
                     VALUES (UUID(), ?, ?, ?)
                     ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)`, [productId, effectiveWhId, change, change]);
            }
            // Update product_variant_stocks per variant+warehouse
            for (const [vKey, change] of variantWarehouseStockChanges.entries()) {
                if (Math.abs(change) < 0.0001)
                    continue;
                const [variantId, productId, lineWhId] = vKey.split('|');
                const effectiveWhId = lineWhId || fallbackWhId;
                if (!effectiveWhId)
                    continue;
                yield conn.query(`INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock)
                     VALUES (UUID(), ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)`, [variantId, productId, effectiveWhId, change, change]).catch((e) => console.warn(`⚠️ [syncController] Variant warehouse stock update failed:`, e.message));
            }
            // ── Record stock_movements for historical balance report ──
            const movementType = (() => {
                const isPurchase = inv.type === 'PURCHASE_INVOICE' || inv.type === 'INVOICE_PURCHASE';
                const isSaleReturn = inv.type === 'SALE_RETURN' || inv.type === 'RETURN_SALE';
                const isPurchaseReturn = inv.type === 'PURCHASE_RETURN' || inv.type === 'RETURN_PURCHASE';
                if (isPurchase)
                    return 'PURCHASE';
                if (isSaleReturn)
                    return 'RETURN_IN';
                if (isPurchaseReturn)
                    return 'RETURN_OUT';
                return 'SALE';
            })();
            // FIX: Use invoice date for movement_date instead of letting MySQL default to NOW().
            // Without this, editing a historical invoice creates movements dated today,
            // corrupting the stock movement timeline.
            const movementDate = inv.date || new Date().toISOString();
            const movementValues = [];
            if (isNowPosted && inv.lines && inv.lines.length > 0) {
                for (const line of inv.lines) {
                    if (!line.productId)
                        continue;
                    const stockChange = getStockChange(line, inv.type);
                    if (stockChange !== 0) {
                        const parentId = resolveProductId(line.productId);
                        const lineWh = resolveLineWarehouse(line);
                        const effectiveWhId = lineWh || fallbackWhId;
                        const vId = getLineVariantId(line);
                        const invNumber = inv.number || inv.invoiceNumber || inv.id;
                        const movementNote = inv.partnerName
                            ? `Invoice #${invNumber} - ${inv.partnerName}`
                            : `Invoice #${invNumber}`;
                        movementValues.push(parentId, effectiveWhId || null, stockChange, movementType, inv.type, inv.id || null, null, movementNote, movementDate, vId || null);
                    }
                }
            }
            if (movementValues.length > 0) {
                const movementTuples = [];
                for (let i = 0; i < movementValues.length; i += 10) {
                    movementTuples.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                }
                try {
                    yield conn.query(`INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, reference_id, unit_cost, notes, movement_date, variant_id)
                         VALUES ${movementTuples.join(', ')}`, movementValues);
                }
                catch (mvErr) {
                    console.warn('⚠️ [syncController] Failed to record stock_movements (non-fatal):', mvErr.message);
                }
            }
        }
        // ── Update variant-level stock (product_variants.stock) ──
        // This keeps the static variant stock field in sync for display purposes
        console.log(`🔍 [applyStockDeltas] variantStockChanges map size: ${variantStockChanges.size}`, Object.fromEntries(variantStockChanges));
        for (const [variantId, change] of variantStockChanges.entries()) {
            if (Math.abs(change) < 0.0001)
                continue;
            try {
                console.log(`🔍 [applyStockDeltas] Updating product_variants SET stock += ${change} WHERE id = ${variantId}`);
                const [updateResult] = yield conn.query(`UPDATE product_variants SET stock = GREATEST(0, COALESCE(stock, 0) + ?) WHERE id = ?`, [change, variantId]);
                console.log(`🔍 [applyStockDeltas] UPDATE result: affectedRows=${updateResult === null || updateResult === void 0 ? void 0 : updateResult.affectedRows}`);
            }
            catch (variantErr) {
                console.error(`❌ [applyStockDeltas] variant stock update failed:`, variantErr.message);
            }
        }
    });
    // === PURCHASE COST UPDATE (تحديث تكلفة المنتج من فاتورة الشراء) ===
    // Recalculates product cost when a purchase invoice is synced.
    // Uses either Weighted Average Cost (WAC) or Last Purchase Price,
    // depending on the inventoryValuationMethod setting.
    // Only runs if systemConfig.updateCostFromPurchase is enabled.
    const applyPurchaseCostUpdate = (conn, inv, config) => __awaiter(void 0, void 0, void 0, function* () {
        const isPurchaseType = inv.type === 'PURCHASE_INVOICE' || inv.type === 'INVOICE_PURCHASE';
        if (!isPurchaseType || !(config === null || config === void 0 ? void 0 : config.updateCostFromPurchase))
            return;
        if (!inv.lines || inv.lines.length === 0 || inv.status !== 'POSTED')
            return;
        const valuationMethod = config.inventoryValuationMethod || 'AVERAGE_COST';
        // Pre-compute invoice-level discount allocation
        const invoiceSubtotal = (inv.lines || []).reduce((sum, l) => sum + ((Number(l.price) || 0) * (Number(l.quantity) || 0)), 0);
        const invoiceGlobalDiscount = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(inv.globalDiscount));
        for (const line of inv.lines) {
            if (!line.productId)
                continue;
            const qty = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.baseQuantity || line.quantity), 5);
            if (qty <= 0)
                continue;
            // Resolve variant ID to parent product for cost update
            let targetProductId = line.productId;
            try {
                const [variantCheck] = yield conn.query('SELECT productId FROM product_variants WHERE id = ? LIMIT 1', [line.productId]);
                if (variantCheck.length > 0) {
                    targetProductId = variantCheck[0].productId;
                }
            }
            catch (_a) {
                // product_variants table may not exist
            }
            // Lock the product row to prevent concurrent cost drift
            const [prodRows] = yield conn.query('SELECT stock, cost FROM products WHERE id = ? FOR UPDATE', [targetProductId]);
            if (!prodRows || prodRows.length === 0)
                continue;
            const oldStock = Number(prodRows[0].stock) || 0;
            const oldCost = Number(prodRows[0].cost) || 0;
            // Calculate net unit purchase price (price after line discount & global discount share)
            const rawPrice = Number(line.price) || 0;
            const lineDiscount = Number(line.discount) || 0;
            const lineGross = rawPrice * qty;
            const lineShareOfGlobalDiscount = invoiceSubtotal > 0
                ? (lineGross / invoiceSubtotal) * invoiceGlobalDiscount
                : 0;
            const netLineTotal = lineGross - lineDiscount - lineShareOfGlobalDiscount;
            const unitPurchasePrice = qty > 0 ? Math.max(0, netLineTotal / qty) : rawPrice;
            let newCost;
            if (valuationMethod === 'LAST_PURCHASE') {
                newCost = unitPurchasePrice;
            }
            else {
                // Weighted Average Cost: ((oldStock × oldCost) + (newQty × newPrice)) / (oldStock + newQty)
                // When oldCost is 0, stock was never costed — use purchase price directly
                // instead of averaging against zero which produces misleadingly low results
                newCost = (oldStock <= 0 || oldCost <= 0)
                    ? unitPurchasePrice
                    : ((oldStock * oldCost) + (qty * unitPurchasePrice)) / (oldStock + qty);
            }
            newCost = Number(newCost.toFixed(2));
            yield conn.query('UPDATE products SET cost = ? WHERE id = ?', [newCost, targetProductId]);
            // Also update variant-level purchasePrice for display consistency
            // Legacy path: line.productId IS the variant ID
            if (targetProductId !== line.productId) {
                try {
                    yield conn.query('UPDATE product_variants SET purchasePrice = ? WHERE id = ?', [unitPurchasePrice, line.productId]);
                }
                catch ( /* product_variants may not exist */_b) { /* product_variants may not exist */ }
            }
            // Embedded variant path: line.variantId holds the variant ID
            if (line.variantId) {
                try {
                    yield conn.query('UPDATE product_variants SET purchasePrice = ? WHERE id = ?', [unitPurchasePrice, line.variantId]);
                }
                catch ( /* product_variants may not exist */_c) { /* product_variants may not exist */ }
            }
            console.log(`💰 [syncController] Cost updated: ${line.productName} → ${newCost} (${valuationMethod})`);
        }
    });
    const conn = yield (0, db_1.getConnection)();
    const authReq = req;
    let connReleased = false; // Track connection lifecycle to prevent double-release
    // SAFE RELEASE: Prevents double-release pool corruption
    const safeRelease = () => {
        if (!connReleased) {
            conn.release();
            connReleased = true;
        }
    };
    try {
        // Permission Check â€” STRICT: reject if no authenticated user
        // @ts-ignore
        if (!req.user) {
            safeRelease();
            return res.status(401).json({ error: 'Authentication required for sync operations' });
        }
        // @ts-ignore
        checkPermissions(req.user, req.body);
        const { invoice, invoices, journal, products, partners, accounts, cheques, productStocks, allocations, deletedInvoiceId, deletedJournalId } = req.body;
        // Use authenticated user from token if available, otherwise fallback to body (for legacy/migration)
        const currentUserRole = ((_c = req.user) === null || _c === void 0 ? void 0 : _c.role) || 'SALES';
        // ============================================
        // POLICY ENFORCEMENT - Before any DB changes
        // ============================================
        const systemConfig = authReq.systemConfig;
        if (systemConfig && (currentUserRole === null || currentUserRole === void 0 ? void 0 : currentUserRole.toUpperCase()) !== 'MASTER_ADMIN') {
            // Validate all invoices
            const invoicesToValidate = [...(invoices || [])];
            if (invoice)
                invoicesToValidate.push(invoice);
            for (const inv of invoicesToValidate) {
                // Check if editing a posted invoice
                const [existingInv] = yield conn.query('SELECT posted, status, createdBy FROM invoices WHERE id = ?', [inv.id]);
                const existingData = existingInv[0];
                if (existingData) {
                    // Validate edit of posted invoice
                    const isPosted = existingData.posted || existingData.status === 'POSTED';
                    const editResult = (0, policyEnforcement_1.validateEditPostedInvoice)(isPosted, systemConfig);
                    if (!editResult.valid) {
                        safeRelease();
                        return res.status(403).json({ message: editResult.error, errorCode: editResult.errorCode });
                    }
                }
                // For purchase invoices, line.price IS the cost (what we pay the supplier).
                // line.cost may be stale (product's old cost, 0 for new items).
                // Fall back to line.price to prevent false COST_REQUIRED rejections.
                const isPurchaseType = inv.type === 'INVOICE_PURCHASE' || inv.type === 'RETURN_SALE';
                // Build context for full validation
                const isExistingPosted = existingData && (existingData.posted || existingData.status === 'POSTED');
                const u = req.user;
                const context = {
                    type: inv.type,
                    date: inv.date,
                    total: inv.total,
                    partnerId: inv.partnerId,
                    notes: inv.notes,
                    costCenterId: inv.costCenterId,
                    warehouseId: inv.warehouseId,
                    posted: inv.posted,
                    createdBy: existingData === null || existingData === void 0 ? void 0 : existingData.createdBy,
                    currentUser: u ? `${u.username || ''}|${u.name || ''}` : currentUser,
                    currentUserRole,
                    // Credit back old quantities when re-saving a posted invoice —
                    // the update will reverse them before applying the new lines.
                    existingInvoiceId: isExistingPosted ? inv.id : undefined,
                    lines: (_d = inv.lines) === null || _d === void 0 ? void 0 : _d.map((l) => ({
                        productId: l.productId,
                        quantity: l.quantity,
                        cost: l.cost || (isPurchaseType ? l.price : 0)
                    }))
                };
                // Run full validation (sync + async) — pass conn for row locking and credit lookup
                const validationResult = yield (0, policyEnforcement_1.validateTransactionFull)(context, systemConfig, conn);
                if (!validationResult.valid) {
                    safeRelease();
                    return res.status(403).json({ message: validationResult.error, errorCode: validationResult.errorCode });
                }
                // Server-Side Cheque Validation
                if ((inv.type === 'RECEIPT' || inv.type === 'PAYMENT') && (inv.paymentMethod === 'CHEQUE' || inv.paymentMethod === 'MIXED')) {
                    const hasCheques = (cheques && cheques.length > 0) || (inv.transactionCheques && inv.transactionCheques.length > 0);
                    // Legacy check: some old integrations might send just chequeNumber
                    const hasSingleCheque = inv.chequeNumber && inv.chequeNumber.trim() !== '';
                    if (!hasCheques && !hasSingleCheque) {
                        safeRelease();
                        return res.status(400).json({ error: 'MISSING_CHEQUE', message: 'طريقة الدفع المختارة تتطلب وجود شيكات، ولم يتم إرسال بيانات أي شيك.' });
                    }
                }
            }
            // Validate invoice deletion
            if (deletedInvoiceId) {
                const [invToDelete] = yield conn.query('SELECT posted, status FROM invoices WHERE id = ?', [deletedInvoiceId]);
                const invData = invToDelete[0];
                if (invData) {
                    const isPosted = invData.posted || invData.status === 'POSTED';
                    const deleteResult = (0, policyEnforcement_1.validateDeletePostedInvoice)(isPosted, systemConfig);
                    if (!deleteResult.valid) {
                        safeRelease();
                        return res.status(403).json({ message: deleteResult.error, errorCode: deleteResult.errorCode });
                    }
                }
            }
            // Validate journal entries
            const journalsToValidate = req.body.journals || (journal ? [journal] : []);
            for (const j of journalsToValidate) {
                const [existingJ] = yield conn.query('SELECT createdBy FROM journal_entries WHERE id = ?', [j.id]);
                const existingJData = existingJ[0];
                const context = {
                    type: 'JOURNAL',
                    date: j.date,
                    notes: j.description,
                    costCenterId: (_f = (_e = j.lines) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.costCenterId,
                    createdBy: existingJData === null || existingJData === void 0 ? void 0 : existingJData.createdBy,
                    currentUser,
                    currentUserRole
                };
                const validationResult = yield (0, policyEnforcement_1.validateTransactionFull)(context, systemConfig);
                if (!validationResult.valid) {
                    safeRelease();
                    return res.status(403).json({ message: validationResult.error, errorCode: validationResult.errorCode });
                }
            }
        }
        // ============================================
        // END POLICY ENFORCEMENT
        // ============================================
        yield conn.beginTransaction();
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PERF: GL ACCOUNT CACHE â€” Preload all commonly-used accounts
        // ONE query replaces ~30 repeated LIKE-based lookups throughout
        // the revenue journal, treasury receipt, and RECEIPT/PAYMENT phases.
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const glAccountCache = {};
        try {
            const [glRows] = yield conn.query(`
                SELECT id, name, code, type FROM accounts 
                WHERE code IN ('101','102','103','104','109','201','204','401','501','503')
                OR name LIKE '%خزينة%' OR name LIKE '%صندوق%' OR name LIKE '%نقدية%'
                OR name LIKE '%عملاء%' OR name LIKE '%مدينون%'
                OR name LIKE '%موردين%' OR name LIKE '%دائنون%'
                OR name LIKE '%مبيعات%' OR name LIKE '%تكلفة البضاعة%' OR name LIKE '%COGS%'
                OR name LIKE '%مخزون%'
                OR name LIKE '%سلف %' OR name LIKE '%عهد%'
                OR name LIKE '%رواتب%' OR name LIKE '%أجور%'
            `);
            const rows = glRows;
            // Build named lookups (first match wins for each role)
            const findAcc = (predicate) => {
                const found = rows.find(predicate);
                return found ? { id: found.id, name: found.name } : null;
            };
            glAccountCache.revenue = findAcc(r => r.code === '401' || (r.type === 'REVENUE' && (r.name || '').includes('مبيعات')));
            glAccountCache.cogs = findAcc(r => r.code === '501' || (r.name || '').includes('تكلفة البضاعة') || (r.name || '').includes('COGS'));
            glAccountCache.inventory = findAcc(r => r.code === '103' || (r.name || '').includes('مخزون'));
            glAccountCache.receivables = findAcc(r => (r.code || '').startsWith('104') || (r.name || '').includes('عملاء'));
            glAccountCache.payables = findAcc(r => (r.code || '').startsWith('201') || (r.name || '').includes('موردين'));
            glAccountCache.cash = findAcc(r => (r.code || '').startsWith('101') || (r.name || '').includes('خزينة') || (r.name || '').includes('صندوق') || (r.name || '').includes('نقدية'));
            glAccountCache.advances = findAcc(r => r.code === '109' || (r.name || '').includes('سلف') || (r.name || '').includes('عهد'));
            glAccountCache.salaries = findAcc(r => r.code === '503' || (r.name || '').includes('رواتب') || (r.name || '').includes('أجور'));
            // Extreme fallback for cash: any asset account
            if (!glAccountCache.cash) {
                glAccountCache.cash = findAcc(r => r.type === 'ASSET' && (r.code || '').startsWith('1'));
            }
            // PERF: console.log(`ðŸ“Š [PERF] GL account cache loaded: ${Object.entries(glAccountCache).filter(([,v]) => v).length}/${Object.keys(glAccountCache).length} accounts found`);
        }
        catch (cacheErr) {
            // PERF: console.warn('âš ï¸ GL account cache preload failed (fallback to per-query):', cacheErr.message);
        }
        // PERF: Request-scoped salesman ID memoization cache
        const salesmanCache = new Map();
        // 1. Handle Invoices (Upsert) - Support both single 'invoice' and array 'invoices'
        // FIX: Ensure we process 'invoice' even if 'invoices' is an empty array
        const invoicesToProcess = [...(invoices || [])];
        if (invoice) {
            // Add main invoice if not already in the list
            if (!invoicesToProcess.find((i) => i.id === invoice.id)) {
                invoicesToProcess.push(invoice);
            }
        }
        // Track skipped invoices to prevent journal creation for duplicates
        const skippedInvoiceIds = new Set();
        // BUG FIX: Track original UUID → new sequential ID for PAYMENT/RECEIPT invoices.
        // The SERIAL FIX (inv.id = inv.number) mutates the invoice ID, but the frontend
        // journal still has referenceId = originalUUID. Without this map, the auto-journal
        // logic can't detect the frontend journal and creates a duplicate.
        const originalIdToNewId = new Map();
        if (invoicesToProcess.length > 0) {
            for (const inv of invoicesToProcess) {
                // =================================================
                // SERVER-SIDE PROTECTION: Auto-generate ID if missing
                // =================================================
                if (!inv.id) {
                    inv.id = `INV_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    // PERF: console.warn(`âš ï¸ Generated server-side ID for invoice: ${inv.id}`);
                }
                // =================================================
                // RESOLVE SALESMAN ID: Convert userId to salesmanId
                // Mobile apps sometimes send userId instead of salesmanId
                // =================================================
                const resolvedSalesmanId = yield resolveSalesmanId(conn, inv.salesmanId, salesmanCache);
                // =====================================================
                // SERVER-SIDE TOTAL VALIDATION FOR SYNCED INVOICES
                // Prevents accepting invoices with manipulated totals
                // =====================================================
                if (inv.lines && inv.lines.length > 0 && !['RECEIPT', 'PAYMENT'].includes(inv.type)) {
                    const validation = (0, errorHandler_1.validateInvoiceTotal)(inv.lines, inv.total, inv.taxAmount || 0, inv.globalDiscount || 0, inv.whtAmount || 0, inv.shippingFee || 0);
                    if (!validation.valid) {
                        yield conn.rollback();
                        safeRelease();
                        console.error(`âŒ Sync rejected: Invoice ${inv.id} total mismatch. ${validation.message}`);
                        return res.status(400).json({
                            code: 'TOTAL_MISMATCH',
                            message: validation.message,
                            invoiceId: inv.id,
                            calculated: validation.calculated,
                            provided: inv.total
                        });
                    }
                    // PERF: console.log(`âœ… Sync: Invoice ${inv.id} total validated (${validation.calculated})`);
                    // BUG FIX: Assign the authoritative server-calculated total
                    inv.total = validation.calculated;
                }
                // Check if user has an open POS shift and link this cash transaction to it
                let posShiftId = inv.posShiftId || null;
                if (!posShiftId && inv.paymentMethod === 'CASH') {
                    try {
                        const creator = inv.createdBy || '';
                        let userId = ((_g = authReq.user) === null || _g === void 0 ? void 0 : _g.id) || '';
                        if (creator) {
                            const [userRows] = yield conn.query("SELECT id FROM users WHERE username = ? OR name = ? LIMIT 1", [creator, creator]);
                            if (userRows.length > 0) {
                                userId = userRows[0].id;
                            }
                        }
                        if (userId) {
                            const [openShifts] = yield conn.query("SELECT id FROM pos_shifts WHERE userId = ? AND status = 'OPEN' LIMIT 1", [userId]);
                            if (openShifts.length > 0) {
                                posShiftId = openShifts[0].id;
                            }
                            else {
                                // Fallback: Find the most recent shift for this user active around the invoice date
                                const [recentShifts] = yield conn.query("SELECT id FROM pos_shifts WHERE userId = ? AND openedAt <= ? ORDER BY openedAt DESC LIMIT 1", [userId, (0, dateEngine_1.toMySQLDateTime)(inv.date)]);
                                if (recentShifts.length > 0) {
                                    posShiftId = recentShifts[0].id;
                                }
                            }
                        }
                    }
                    catch (err) {
                        console.warn(`⚠️ [syncTransaction] Could not resolve posShiftId:`, err);
                    }
                }
                // Check if exists
                const [existing] = yield conn.query('SELECT id, status, createdBy, posShiftId FROM invoices WHERE id = ?', [inv.id]);
                const wasPosted = ((_h = existing[0]) === null || _h === void 0 ? void 0 : _h.status) === 'POSTED';
                const isNowPosted = inv.status === 'POSTED';
                if ((_j = existing[0]) === null || _j === void 0 ? void 0 : _j.posShiftId) {
                    posShiftId = existing[0].posShiftId;
                }
                if (existing.length > 0) {
                    // Update
                    yield conn.query(`UPDATE invoices SET 
                date=?, type=?, partnerId=?, partnerName=?, total=?, status=?, paymentMethod=?, 
                posted=?, notes=?, dueDate=?, taxAmount=?, whtAmount=?, shippingFee=?, globalDiscount=?, globalDiscountType=?, globalDiscountValue=?, warehouseId=?, costCenterId=?, paidAmount=?,
                bankAccountId=?, bankName=?, paymentBreakdown=?, bankTransfers=?, createdBy=?, salesmanId=?, relatedInvoiceIds=?,
                currencyCode=?, exchangeRate=?, foreignTotal=?, priceListId=?, bankTransferReference=?,
                referenceInvoiceId=?, branchId=?, posShiftId=?, paymentSources=?, voucherCategory=?
               WHERE id=?`, [
                        (0, dateEngine_1.toMySQLDateTime)(inv.date), inv.type, inv.partnerId, inv.partnerName, inv.total, inv.status, inv.paymentMethod,
                        inv.posted, inv.notes, (0, dateEngine_1.toMySQLDateTime)(inv.dueDate), inv.taxAmount, inv.whtAmount, inv.shippingFee, inv.globalDiscount || inv.discount || 0,
                        inv.globalDiscountType || 'FIXED', inv.globalDiscountValue || inv.globalDiscount || inv.discount || 0,
                        inv.warehouseId ? sanitizeId(inv.warehouseId) : null, inv.costCenterId ? sanitizeId(inv.costCenterId) : null,
                        // CASH FIX: For CASH invoices that are POSTED, paidAmount must equal total
                        (inv.paymentMethod === 'CASH' && inv.status === 'POSTED' && !['RECEIPT', 'PAYMENT'].includes(inv.type))
                            ? inv.total
                            : (inv.paidAmount || inv.paymentCollected || 0),
                        inv.bankAccountId || null, inv.bankName || null,
                        inv.paymentBreakdown ? JSON.stringify(inv.paymentBreakdown) : null,
                        inv.bankTransfers ? JSON.stringify(inv.bankTransfers) : null,
                        ((_k = existing[0]) === null || _k === void 0 ? void 0 : _k.createdBy) || inv.createdBy || currentUser, // PRESERVE original creator on edits
                        resolvedSalesmanId,
                        inv.relatedInvoiceIds ? JSON.stringify(inv.relatedInvoiceIds) : null,
                        inv.currencyCode || 'EGP', inv.exchangeRate || 1, inv.foreignTotal || null, inv.priceListId || null, inv.bankTransferReference || null,
                        inv.referenceInvoiceId || null,
                        (0, branchFilter_1.resolveBranchIdForWrite)(req, inv.branchId),
                        posShiftId,
                        inv.paymentSources ? (typeof inv.paymentSources === 'string' ? inv.paymentSources : JSON.stringify(inv.paymentSources)) : null,
                        inv.voucherCategory || null,
                        inv.id
                    ]);
                    // Delete lines and re-insert (only if lines are provided)
                    // SAFEGUARD: Only update lines if explicitly provided and not empty for existing invoices
                    if (inv.lines !== undefined && inv.lines !== null) {
                        // Warn if trying to set lines to empty array for existing invoice
                        if (inv.lines.length === 0) {
                            // PERF: console.warn(`âš ï¸  Warning: Attempting to clear all lines for existing invoice ${inv.id}. This will delete all products!`);
                        }
                        // Fetch old lines before deletion for stock delta calculation
                        let oldLines = [];
                        if (wasPosted) {
                            const [oLines] = yield conn.query('SELECT productId, quantity, conversionFactor, baseQuantity, bonusQty, variantId FROM invoice_lines WHERE invoiceId = ?', [inv.id]);
                            oldLines = oLines;
                        }
                        yield conn.query('DELETE FROM invoice_lines WHERE invoiceId = ?', [inv.id]);
                        if (inv.lines.length > 0) {
                            // Batch insert for better performance - includes multi-unit fields
                            const values = inv.lines.map((line) => {
                                // Calculate baseQuantity if unitId is provided
                                const qty = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.quantity), 5);
                                const price = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.price));
                                const cost = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.cost));
                                const disc = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.discount));
                                const total = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.total));
                                const conversionFactor = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.conversionFactor), 5) || 1;
                                const baseQuantity = line.baseQuantity ? (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.baseQuantity), 5) : (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(qty).mul((0, decimalUtils_1.D)(conversionFactor)), 5);
                                return [
                                    inv.id, line.productId, line.productName, qty, price, cost, disc, total,
                                    line.unitId || null, line.unitName || null, conversionFactor, baseQuantity,
                                    sanitizeId(line.warehouseId) || null,
                                    (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.bonusQty), 5),
                                    line.discountType || 'FIXED',
                                    (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.discountValue)),
                                    line.priceListId || null,
                                    line.variantId || null,
                                    line.hasWarranty ? 1 : 0,
                                    line.inBranchInstallation ? 1 : 0,
                                    line.warrantyMonths || 0
                                ];
                            });
                            console.log('VARIANT_DEBUG_INSERT:', JSON.stringify(inv.lines.map((l) => ({ pid: l.productId, vid: l.variantId }))));
                            try {
                                yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, unitId, unitName, conversionFactor, baseQuantity, warehouseId, bonusQty, discountType, discountValue, priceListId, variantId, hasWarranty, inBranchInstallation, warrantyMonths) VALUES ?`, [values]);
                            }
                            catch (ilErr) {
                                console.warn('VARIANT_FALLBACK_TRIGGERED:', ilErr.message);
                                // Fallback: insert without new columns if they don't exist on client
                                // PERF: console.warn('⚠️ Fallback invoice_lines insert (missing columns):', ilErr.message);
                                const basicValues = inv.lines.map((line) => [
                                    inv.id, line.productId, line.productName,
                                    (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.quantity), 5), (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.price)),
                                    (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.cost)), (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.discount)), (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.total))
                                ]);
                                yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total) VALUES ?`, [basicValues]);
                            }
                        }
                        // === STOCK UPDATE LOGIC ===
                        yield applyStockDeltas(conn, inv, oldLines, wasPosted, isNowPosted, inv.warehouseId);
                        // === PURCHASE COST UPDATE (متوسط التكلفة) ===
                        if (isNowPosted)
                            yield applyPurchaseCostUpdate(conn, inv, systemConfig);
                    }
                    else {
                        // PERF: console.log(`ℹ️ Skipping line update for invoice ${inv.id} - lines not provided in update`);
                    }
                    yield syncInvoiceCashMovement(conn, inv, posShiftId);
                }
                else {
                    // === DUPLICATE DETECTION FOR SALE/PURCHASE INVOICES ===
                    // Check if an invoice with the same type + partner + total + date already exists
                    // This catches cases where the client generates a new UUID for the same real invoice
                    const invTypesForDedup = ['SALE_INVOICE', 'INVOICE_SALE', 'PURCHASE_INVOICE', 'INVOICE_PURCHASE',
                        'SALE_RETURN', 'RETURN_SALE', 'PURCHASE_RETURN', 'RETURN_PURCHASE'];
                    if (invTypesForDedup.includes(inv.type) && inv.total > 0) {
                        const [dupInv] = yield conn.query(`SELECT id, number FROM invoices 
                             WHERE type = ? AND partnerId = ? AND ABS(total - ?) < 0.01 AND DATE(date) = DATE(?)
                             LIMIT 1`, [inv.type, inv.partnerId, inv.total, (0, dateEngine_1.toMySQLDateTime)(inv.date)]);
                        if (dupInv.length > 0) {
                            const existingInv = dupInv[0];
                            // PERF: console.log(`⭷ [SYNC] SKIP: Duplicate ${inv.type} detected — existing: ${existingInv.number || existingInv.id} (same partner + total + date)`);
                            skippedInvoiceIds.add(inv.id);
                            continue;
                        }
                    }
                    // === DUPLICATE DETECTION FOR RECEIPTS & PAYMENTS ===
                    // Before inserting a new RECEIPT or PAYMENT, check:
                    // 1. Same partner + amount within last 5 minutes (recent re-sync)
                    // 2. Same partner + amount on the SAME DATE (same-day duplicate / delayed re-sync)
                    // 3. Same referenceInvoiceId + amount (auto-generated doc already exists)
                    // FOR UPDATE: Ensures concurrent transactions block until the first one commits,
                    // preventing the race condition where both read 0 matches and both insert.
                    if ((inv.type === 'RECEIPT' || inv.type === 'PAYMENT') && inv.total > 0) {
                        let duplicateQuery = `
                            SELECT id, number FROM invoices 
                            WHERE type = ? 
                            AND id != ?
                            AND (
                                (partnerId = ? AND ABS(total - ?) < 0.01 AND date >= DATE_SUB(NOW(), INTERVAL 5 MINUTE))
                                OR (partnerId = ? AND ABS(total - ?) < 0.01 AND DATE(date) = DATE(?))
                        `;
                        const invDate = (0, dateEngine_1.toMySQLDateTime)(inv.date);
                        const queryParams = [inv.type, inv.id, inv.partnerId, inv.total, inv.partnerId, inv.total, invDate];
                        // If this receipt/payment is linked to an invoice, check if a doc with SAME AMOUNT handles that invoice
                        // This allows multiple partial payments, but blocks exact duplicates of the initial payment
                        if (inv.referenceInvoiceId) {
                            duplicateQuery += ` OR (referenceInvoiceId = ? AND ABS(total - ?) < 0.01) `;
                            queryParams.push(inv.referenceInvoiceId, inv.total);
                        }
                        duplicateQuery += ` ) LIMIT 1 FOR UPDATE`;
                        const [duplicateCheck] = yield conn.query(duplicateQuery, queryParams);
                        if (duplicateCheck.length > 0) {
                            const existingDoc = duplicateCheck[0];
                            // PERF: console.log(`⚠️ SKIP: Duplicate ${inv.type} detected - existing: ${existingDoc.number} for invoice ${inv.referenceInvoiceId || 'N/A'}`);
                            skippedInvoiceIds.add(inv.id); // Track skipped ID to prevent journal creation
                            console.log(`[syncController] DEDUP-BLOCK: ${inv.type} duplicate blocked. existing=${existingDoc.number} incoming=${(_l = inv.id) === null || _l === void 0 ? void 0 : _l.substring(0, 8)} partner=${(inv.partnerId || '').substring(0, 8)} amount=${inv.total}`);
                            continue; // Skip this invoice, don't insert duplicate
                        }
                    }
                    // Sanitize partnerId for non-partner voucher categories (FK constraint)
                    const invVoucherCategory = inv.voucherCategory;
                    const syncPartnerId = (invVoucherCategory === 'expenses' || invVoucherCategory === 'employee_advance' || invVoucherCategory === 'employee_repay' || invVoucherCategory === 'salary')
                        ? null : (inv.partnerId || null);
                    // === NUMBER-BASED DUPLICATE DETECTION ===
                    // If the invoice has a sequential number (e.g., INV-00003) and an invoice with that number already exists,
                    // update the existing invoice instead of creating a duplicate. This catches cases where the frontend
                    // generates a new UUID (lost initialData) but sends the same invoice number.
                    const invoiceNumber = ((inv.referenceNumber && inv.referenceNumber.length !== 36 && !inv.referenceNumber.startsWith('OFF-')) ? inv.referenceNumber : null) ||
                        ((inv.number && inv.number.length !== 36 && !inv.number.startsWith('OFF-')) ? inv.number : null);
                    if (invoiceNumber) {
                        const [existingByNumber] = yield conn.query('SELECT id, status, createdBy, posShiftId FROM invoices WHERE number = ? LIMIT 1', [invoiceNumber]);
                        if (existingByNumber.length > 0) {
                            const existingRecord = existingByNumber[0];
                            // PERF: 🔄 [SYNC] Invoice with number ${invoiceNumber} already exists (id: ${existingRecord.id}). Updating instead of inserting.
                            if (existingRecord.posShiftId) {
                                posShiftId = existingRecord.posShiftId;
                            }
                            // Update the existing record instead of inserting a new one
                            yield conn.query(`UPDATE invoices SET 
                                    date=?, type=?, partnerId=?, partnerName=?, total=?, status=?, paymentMethod=?, 
                                    posted=?, notes=?, dueDate=?, taxAmount=?, whtAmount=?, shippingFee=?, globalDiscount=?, globalDiscountType=?, globalDiscountValue=?, warehouseId=?, costCenterId=?, paidAmount=?,
                                    bankAccountId=?, bankName=?, paymentBreakdown=?, bankTransfers=?, createdBy=?, salesmanId=?, relatedInvoiceIds=?,
                                    currencyCode=?, exchangeRate=?, foreignTotal=?, priceListId=?, bankTransferReference=?,
                                    referenceInvoiceId=?, branchId=?, posShiftId=?
                                WHERE id=?`, [
                                (0, dateEngine_1.toMySQLDateTime)(inv.date), inv.type, syncPartnerId, inv.partnerName, inv.total, inv.status, inv.paymentMethod,
                                inv.posted, inv.notes || (invVoucherCategory ? `${invVoucherCategory}|${inv.partnerId || ''}` : null), (0, dateEngine_1.toMySQLDateTime)(inv.dueDate), inv.taxAmount, inv.whtAmount, inv.shippingFee, inv.globalDiscount || inv.discount || 0,
                                inv.globalDiscountType || 'FIXED', inv.globalDiscountValue || inv.globalDiscount || inv.discount || 0,
                                inv.warehouseId ? sanitizeId(inv.warehouseId) : null, inv.costCenterId ? sanitizeId(inv.costCenterId) : null,
                                (inv.paymentMethod === 'CASH' && inv.status === 'POSTED' && !['RECEIPT', 'PAYMENT'].includes(inv.type))
                                    ? inv.total
                                    : (inv.paidAmount || inv.paymentCollected || 0),
                                inv.bankAccountId || null, inv.bankName || null,
                                inv.paymentBreakdown ? JSON.stringify(inv.paymentBreakdown) : null,
                                inv.bankTransfers ? JSON.stringify(inv.bankTransfers) : null,
                                existingRecord.createdBy || inv.createdBy || currentUser, // PRESERVE original creator on edits
                                resolvedSalesmanId,
                                inv.relatedInvoiceIds ? JSON.stringify(inv.relatedInvoiceIds) : null,
                                inv.currencyCode || 'EGP', inv.exchangeRate || 1, inv.foreignTotal || null, inv.priceListId || null, inv.bankTransferReference || null,
                                inv.referenceInvoiceId || null,
                                (0, branchFilter_1.resolveBranchIdForWrite)(req, inv.branchId),
                                posShiftId,
                                existingRecord.id
                            ]);
                            // Fetch old lines before deletion for stock delta calculation
                            let oldLinesByNumber = [];
                            const wasPostedByNum = existingRecord.status === 'POSTED';
                            if (wasPostedByNum) {
                                const [oLines] = yield conn.query('SELECT productId, quantity, conversionFactor, baseQuantity, bonusQty, variantId FROM invoice_lines WHERE invoiceId = ?', [existingRecord.id]);
                                oldLinesByNumber = oLines;
                            }
                            // Delete old lines and re-insert new ones
                            const realInvId = existingRecord.id;
                            yield conn.query('DELETE FROM invoice_lines WHERE invoiceId = ?', [realInvId]);
                            if (inv.lines && inv.lines.length > 0) {
                                const values = inv.lines.map((line) => {
                                    const conversionFactor = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.conversionFactor), 5) || 1;
                                    const baseQuantity = line.baseQuantity ? (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.baseQuantity), 5) : ((0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.quantity).mul((0, decimalUtils_1.D)(conversionFactor)), 5));
                                    return [
                                        realInvId, line.productId, line.productName,
                                        (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.quantity), 5), (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.price)),
                                        (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.cost)), (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.discount)), (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.total)),
                                        line.unitId || null, line.unitName || null, conversionFactor, baseQuantity,
                                        sanitizeId(line.warehouseId) || null,
                                        (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.bonusQty), 5),
                                        line.discountType || 'FIXED',
                                        (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.discountValue)),
                                        line.priceListId || null,
                                        line.variantId || null,
                                        line.hasWarranty ? 1 : 0,
                                        line.inBranchInstallation ? 1 : 0,
                                        line.warrantyMonths || 0
                                    ];
                                });
                                try {
                                    yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, unitId, unitName, conversionFactor, baseQuantity, warehouseId, bonusQty, discountType, discountValue, priceListId, variantId, hasWarranty, inBranchInstallation, warrantyMonths) VALUES ?`, [values]);
                                }
                                catch (ilErr) {
                                    const basicValues = inv.lines.map((line) => [
                                        realInvId, line.productId, line.productName,
                                        (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.quantity), 5), (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.price)),
                                        (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.cost)), (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.discount)), (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.total))
                                    ]);
                                    yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total) VALUES ?`, [basicValues]);
                                }
                            }
                            // === STOCK UPDATE LOGIC ===
                            if (inv.lines !== undefined && inv.lines !== null) {
                                yield applyStockDeltas(conn, inv, oldLinesByNumber, wasPostedByNum, isNowPosted, inv.warehouseId);
                                // === PURCHASE COST UPDATE (متوسط التكلفة) ===
                                if (isNowPosted)
                                    yield applyPurchaseCostUpdate(conn, inv, systemConfig);
                            }
                            yield syncInvoiceCashMovement(conn, inv, posShiftId);
                            continue; // Skip the normal INSERT path
                        }
                    }
                    // Insert
                    // Generate missing sequence number if needed
                    inv.number = ((inv.referenceNumber && inv.referenceNumber.length !== 36 && !inv.referenceNumber.startsWith('OFF-')) ? inv.referenceNumber : null) ||
                        ((inv.number && inv.number.length !== 36 && !inv.number.startsWith('OFF-')) ? inv.number : null) ||
                        (yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, {
                            'INVOICE_SALE': 'INV-', 'SALE_INVOICE': 'INV-',
                            'INVOICE_PURCHASE': 'PUR-', 'PURCHASE_INVOICE': 'PUR-',
                            'RETURN_SALE': 'RET-S-', 'SALE_RETURN': 'RET-S-',
                            'RETURN_PURCHASE': 'RET-P-', 'PURCHASE_RETURN': 'RET-P-',
                            'RECEIPT': 'REC-', 'PAYMENT': 'PAY-', 'QUOTATION': 'QUO-'
                        }[inv.type] || 'TRX-'));
                    // SERIAL FIX: For PAYMENT/RECEIPT, id === number (single identity)
                    if (['RECEIPT', 'PAYMENT'].includes(inv.type)) {
                        const originalUUID = inv.id;
                        inv.id = inv.number;
                        // Track UUID→sequential mapping so downstream journal dedup works
                        if (originalUUID !== inv.id) {
                            originalIdToNewId.set(originalUUID, inv.id);
                            // Rewrite the frontend journal's referenceId from UUID to the new
                            // sequential ID so all dedup checks (hasProvidedJournal, existingJournal
                            // query, safety net) compare against a single canonical ID.
                            const providedJournals = req.body.journals || (req.body.journal ? [req.body.journal] : []);
                            for (const j of providedJournals) {
                                if (j.referenceId === originalUUID) {
                                    j.referenceId = inv.id;
                                    // Also fix the description: replace UUID with sequential number
                                    // Frontend generates: "سند صرف #<UUID> - Ahmed"
                                    // We want:            "سند صرف #PAY-00026 - Ahmed"
                                    if (j.description && j.description.includes(originalUUID)) {
                                        j.description = j.description.replace(originalUUID, inv.id);
                                    }
                                }
                            }
                        }
                    }
                    yield conn.query(`INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, dueDate, taxAmount, whtAmount, shippingFee, globalDiscount, globalDiscountType, globalDiscountValue, warehouseId, costCenterId, paidAmount, bankAccountId, bankName, paymentBreakdown, bankTransfers, createdBy, salesmanId, relatedInvoiceIds, currencyCode, exchangeRate, foreignTotal, priceListId, bankTransferReference, referenceInvoiceId, branchId, posShiftId, paymentSources, voucherCategory) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                        inv.id,
                        inv.number,
                        (0, dateEngine_1.toMySQLDateTime)(inv.date), inv.type, syncPartnerId, inv.partnerName, inv.total, inv.status, inv.paymentMethod,
                        inv.posted, inv.notes || (invVoucherCategory ? `${invVoucherCategory}|${inv.partnerId || ''}` : null), (0, dateEngine_1.toMySQLDateTime)(inv.dueDate), inv.taxAmount, inv.whtAmount, inv.shippingFee, inv.globalDiscount || inv.discount || 0,
                        inv.globalDiscountType || 'FIXED', inv.globalDiscountValue || inv.globalDiscount || inv.discount || 0,
                        inv.warehouseId ? sanitizeId(inv.warehouseId) : null, inv.costCenterId ? sanitizeId(inv.costCenterId) : null,
                        // CASH FIX: For CASH invoices that are POSTED, paidAmount must equal total
                        (inv.paymentMethod === 'CASH' && inv.status === 'POSTED' && !['RECEIPT', 'PAYMENT'].includes(inv.type))
                            ? inv.total
                            : (inv.paidAmount || inv.paymentCollected || 0),
                        inv.bankAccountId || null, inv.bankName || null,
                        inv.paymentBreakdown ? JSON.stringify(inv.paymentBreakdown) : null,
                        inv.bankTransfers ? JSON.stringify(inv.bankTransfers) : null,
                        inv.createdBy || currentUser,
                        resolvedSalesmanId,
                        inv.relatedInvoiceIds ? JSON.stringify(inv.relatedInvoiceIds) : null,
                        inv.currencyCode || 'EGP', inv.exchangeRate || 1, inv.foreignTotal || null, inv.priceListId || null, inv.bankTransferReference || null,
                        inv.referenceInvoiceId || null,
                        (0, branchFilter_1.resolveBranchIdForWrite)(req, inv.branchId),
                        posShiftId,
                        inv.paymentSources ? (typeof inv.paymentSources === 'string' ? inv.paymentSources : JSON.stringify(inv.paymentSources)) : null,
                        inv.voucherCategory || invVoucherCategory || null
                    ]);
                    // Insert Lines using batch insert for better performance - includes multi-unit fields
                    if (inv.lines && inv.lines.length > 0) {
                        const values = inv.lines.map((line) => {
                            // Calculate baseQuantity if unitId is provided
                            const qty = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.quantity), 5);
                            const price = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.price));
                            const cost = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.cost));
                            const disc = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.discount));
                            const total = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.total));
                            const conversionFactor = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.conversionFactor), 5) || 1;
                            const baseQuantity = line.baseQuantity ? (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.baseQuantity), 5) : (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(qty).mul((0, decimalUtils_1.D)(conversionFactor)), 5);
                            return [
                                inv.id, line.productId, line.productName, qty, price, cost, disc, total,
                                line.unitId || null, line.unitName || null, conversionFactor, baseQuantity,
                                sanitizeId(line.warehouseId) || null,
                                (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.bonusQty), 5),
                                line.discountType || 'FIXED',
                                (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.discountValue)),
                                line.priceListId || null,
                                line.variantId || null,
                                line.hasWarranty ? 1 : 0,
                                line.inBranchInstallation ? 1 : 0,
                                line.warrantyMonths || 0
                            ];
                        });
                        try {
                            yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, unitId, unitName, conversionFactor, baseQuantity, warehouseId, bonusQty, discountType, discountValue, priceListId, variantId, hasWarranty, inBranchInstallation, warrantyMonths) VALUES ?`, [values]);
                        }
                        catch (ilErr) {
                            // Fallback: insert without new columns if they don't exist on client
                            // PERF: console.warn('âš ï¸  Fallback invoice_lines insert (missing columns):', ilErr.message);
                            const basicValues = inv.lines.map((line) => [
                                inv.id, line.productId, line.productName,
                                (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.quantity), 5), (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.price)),
                                (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.cost)), (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.discount)), (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.total))
                            ]);
                            yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total) VALUES ?`, [basicValues]);
                        }
                    }
                    // Update stock for new POSTED invoices
                    if (isNowPosted && inv.lines && inv.lines.length > 0) {
                        // OPTIMIZATION: Aggregate stock changes
                        yield applyStockDeltas(conn, inv, [], false, isNowPosted, inv.warehouseId);
                        // === PURCHASE COST UPDATE (متوسط التكلفة) ===
                        yield applyPurchaseCostUpdate(conn, inv, systemConfig);
                    }
                    yield syncInvoiceCashMovement(conn, inv, posShiftId);
                }
            }
        }
        // === AUTO-POST REVENUE/COGS JOURNAL FOR SYNCED INVOICES ===
        // Creates Income Statement entries for all synced POSTED invoices
        // SKIP if client already sent journals (to prevent duplicates)
        const clientSentJournals = (req.body.journals && req.body.journals.length > 0) || !!req.body.journal;
        console.log(`[syncController] AUTO-POST check: clientSentJournals=${clientSentJournals}`);
        for (const inv of invoicesToProcess) {
            if (clientSentJournals)
                break; // Client already handles journal creation
            if (skippedInvoiceIds.has(inv.id))
                continue;
            const invType = inv.type;
            const invNumber = inv.number || inv.id.substring(0, 8);
            // Guard: skip receipts/payments that somehow ended up in invoicesToProcess
            // They already have their own journal entries from the receipt/payment flow
            if (invNumber.startsWith('REC-') || invNumber.startsWith('PAY-'))
                continue;
            const isRevenueType = ['INVOICE_SALE', 'SALE_INVOICE', 'INVOICE_PURCHASE', 'PURCHASE_INVOICE', 'RETURN_SALE', 'SALE_RETURN', 'RETURN_PURCHASE', 'PURCHASE_RETURN'].includes(invType);
            const invTotal = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(inv.total));
            // BUG FIX: Subtract globalDiscount to get the net amount for journal entries
            const invGlobalDiscount = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(inv.globalDiscount));
            const invNetTotal = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(inv.total).minus((0, decimalUtils_1.D)(inv.globalDiscount)));
            if (isRevenueType && invTotal > 0 && inv.status === 'POSTED') {
                try {
                    const partnerName = inv.partnerName || '';
                    // ===== DUPLICATE JOURNAL CHECK =====
                    // Prevent creating multiple journals for the same invoice
                    // Check by invoice ID (primary) and by number (fallback)
                    const [existingRevJournal] = yield conn.query(`SELECT id FROM journal_entries 
                         WHERE referenceId = ? OR referenceId = ? OR referenceId = ?
                         LIMIT 1`, [inv.id, invNumber, inv.id.substring(0, 8)]);
                    if (existingRevJournal.length > 0) {
                        // PERF: console.log(`â ­ï¸  [SYNC] Revenue/COGS journal already exists for invoice ${inv.id} (ref: ${invNumber}). Skipping.`);
                        continue;
                    }
                    const revJournalId = (0, crypto_1.randomUUID)();
                    const isSaleType = ['INVOICE_SALE', 'SALE_INVOICE', 'RETURN_SALE', 'SALE_RETURN'].includes(invType);
                    const isReturn = ['RETURN_SALE', 'SALE_RETURN', 'RETURN_PURCHASE', 'PURCHASE_RETURN'].includes(invType);
                    // Resolve accounts â€” PERF: Use cached GL accounts instead of 5 separate queries
                    const revenueAcc = glAccountCache.revenue;
                    const cogsAcc = glAccountCache.cogs;
                    const inventoryAcc = glAccountCache.inventory;
                    const receivablesAcc = glAccountCache.receivables;
                    const payablesAcc = glAccountCache.payables;
                    // Calculate COGS
                    let totalCOGS_d = (0, decimalUtils_1.D)(0);
                    if (inv.lines && inv.lines.length > 0) {
                        for (const line of inv.lines) {
                            totalCOGS_d = totalCOGS_d.plus((0, decimalUtils_1.D)(line.quantity).abs().mul((0, decimalUtils_1.D)(line.cost)));
                        }
                    }
                    const totalCOGS = (0, decimalUtils_1.toNum)(totalCOGS_d);
                    // Use inv.id as referenceId for consistent duplicate detection
                    // Add "نقدي" suffix for CASH/BANK invoices so they appear under مبيعات نقدية in Treasury Journal
                    const isCashInv = inv.paymentMethod === 'CASH' || inv.paymentMethod === 'BANK';
                    const cashTag = isCashInv ? ' نقدي' : '';
                    if (isSaleType && revenueAcc && receivablesAcc) {
                        // For CASH invoices, use the cash account instead of receivables
                        let cashAcc = glAccountCache.cash;
                        if (inv.bankAccountId) {
                            const resolved = yield resolveSyncCashBankAccount(conn, inv.bankAccountId);
                            if (resolved)
                                cashAcc = resolved;
                        }
                        const partnerAcc = (isCashInv && cashAcc) ? cashAcc : receivablesAcc;
                        const descPrefix = isReturn ? 'مرتجع مبيعات' : 'فاتورة بيع';
                        yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy) VALUES (?, ?, ?, ?, ?)`, [revJournalId, inv.date, `${descPrefix}${cashTag} #${invNumber} - ${partnerName}`, inv.id, inv.createdBy || currentUser]);
                        const journalLines = [];
                        if (isReturn) {
                            journalLines.push([revJournalId, revenueAcc.id, revenueAcc.name, invNetTotal, 0]);
                            journalLines.push([revJournalId, partnerAcc.id, partnerAcc.name, 0, invNetTotal]);
                            if (totalCOGS > 0 && cogsAcc && inventoryAcc) {
                                journalLines.push([revJournalId, inventoryAcc.id, inventoryAcc.name, totalCOGS, 0]);
                                journalLines.push([revJournalId, cogsAcc.id, cogsAcc.name, 0, totalCOGS]);
                            }
                        }
                        else {
                            journalLines.push([revJournalId, partnerAcc.id, partnerAcc.name, invNetTotal, 0]);
                            journalLines.push([revJournalId, revenueAcc.id, revenueAcc.name, 0, invNetTotal]);
                            if (totalCOGS > 0 && cogsAcc && inventoryAcc) {
                                journalLines.push([revJournalId, cogsAcc.id, cogsAcc.name, totalCOGS, 0]);
                                journalLines.push([revJournalId, inventoryAcc.id, inventoryAcc.name, 0, totalCOGS]);
                            }
                        }
                        if (journalLines.length > 0) {
                            yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES ?`, [journalLines]);
                            // PERF: console.log(`ðŸ“Š [SYNC] Revenue/COGS journal: ${descPrefix} #${invNumber}, Rev=${invTotal}, COGS=${totalCOGS}`);
                        }
                    }
                    else if (!isSaleType && inventoryAcc && payablesAcc) {
                        // For CASH purchases, use the cash account instead of payables
                        let cashAcc = glAccountCache.cash;
                        if (inv.bankAccountId) {
                            const resolved = yield resolveSyncCashBankAccount(conn, inv.bankAccountId);
                            if (resolved)
                                cashAcc = resolved;
                        }
                        const supplierAcc = (isCashInv && cashAcc) ? cashAcc : payablesAcc;
                        const descPrefix = isReturn ? 'مرتجع مشتريات' : 'فاتورة شراء';
                        yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy) VALUES (?, ?, ?, ?, ?)`, [revJournalId, inv.date, `${descPrefix}${cashTag} #${invNumber} - ${partnerName}`, inv.id, inv.createdBy || currentUser]);
                        const journalLines = [];
                        if (isReturn) {
                            journalLines.push([revJournalId, supplierAcc.id, supplierAcc.name, invNetTotal, 0]);
                            journalLines.push([revJournalId, inventoryAcc.id, inventoryAcc.name, 0, invNetTotal]);
                        }
                        else {
                            journalLines.push([revJournalId, inventoryAcc.id, inventoryAcc.name, invNetTotal, 0]);
                            journalLines.push([revJournalId, supplierAcc.id, supplierAcc.name, 0, invNetTotal]);
                        }
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES ?`, [journalLines]);
                        // PERF: console.log(`ðŸ“Š [SYNC] Inventory journal: ${descPrefix} #${invNumber}, Total=${invTotal}`);
                    }
                }
                catch (revErr) {
                    console.error('[syncController] CRITICAL: Revenue/COGS journal FAILED for invoice ' + inv.id + ':', revErr.message);
                    throw revErr; // RE-THROW: Accounting journal MUST succeed - cannot have invoices without GL entries
                }
            }
        }
        // === UPDATE SALESMAN TARGET ACHIEVEMENTS ===
        // After all invoices are processed, update targets for sales invoices
        if (invoicesToProcess.length > 0) {
            for (const inv of invoicesToProcess) {
                // Only track SALE_INVOICE / INVOICE_SALE with salesmanId
                const isSaleInvoice = inv.type === 'SALE_INVOICE' || inv.type === 'INVOICE_SALE';
                if (isSaleInvoice && inv.salesmanId && inv.lines && inv.lines.length > 0) {
                    // PERF: console.log(`ðŸ“Š Updating salesman targets for ${inv.salesmanId} (${inv.lines.length} lines)`);
                    // PERF: Batch-load all product categories in ONE query instead of N per-line queries
                    const lineProductIds = inv.lines.map((l) => l.productId).filter(Boolean);
                    const productCategoryMap = new Map();
                    if (lineProductIds.length > 0) {
                        try {
                            const [catRows] = yield conn.query(`SELECT id, categoryId FROM products WHERE id IN (?)`, [lineProductIds]);
                            for (const row of catRows) {
                                productCategoryMap.set(row.id, row.categoryId || null);
                            }
                        }
                        catch (catErr) {
                            console.error('âš ï¸  Batch product category lookup failed:', catErr);
                        }
                    }
                    const targetPromises = inv.lines.map((line) => __awaiter(void 0, void 0, void 0, function* () {
                        try {
                            const categoryId = productCategoryMap.get(line.productId) || null;
                            // Update achievement for this product/category
                            yield (0, salesmanTargetController_1.updateTargetAchievement)(inv.salesmanId, line.productId, categoryId, (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.quantity), 5), (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.total)));
                            // PERF: Removed per-line log to reduce I/O
                        }
                        catch (targetError) {
                            // Log but don't fail the sync
                            console.error('Error updating salesman target:', targetError);
                        }
                    }));
                    yield Promise.allSettled(targetPromises);
                }
            }
        }
        // === UPDATE-OR-CREATE TREASURY RECEIPT/PAYMENT FOR PAID INVOICES ===
        // For sale/purchase invoices with paidAmount > 0, create or update a treasury receipt/payment (سند قبض / سند صرف)
        // This ensures collected/paid cash from invoices goes to the treasury
        // UPDATE-OR-CREATE PATTERN: When an invoice is edited, the linked doc must stay in sync
        for (const inv of invoicesToProcess) {
            const isSaleInvoice = inv.type === 'SALE_INVOICE' || inv.type === 'INVOICE_SALE';
            const isPurchaseInvoice = inv.type === 'PURCHASE_INVOICE' || inv.type === 'INVOICE_PURCHASE';
            if (!isSaleInvoice && !isPurchaseInvoice)
                continue;
            // Read paidAmount from either field â€” frontend sends paymentCollected for partial payments
            // DECIMAL-SAFE: Use D() to avoid parseFloat drift on amounts like 1999.99
            const paidAmount = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(inv.paidAmount).isZero() ? (0, decimalUtils_1.D)(inv.paymentCollected) : (0, decimalUtils_1.D)(inv.paidAmount));
            // BUG FIX: Skip receipt creation for CASH invoices.
            // CASH invoices are excluded from the debt ledger,
            // so creating a RECEIPT/PAYMENT would cause a phantom credit balance.
            const isCashInvoice = inv.paymentMethod === 'CASH';
            const docType = isSaleInvoice ? 'RECEIPT' : 'PAYMENT';
            const docLabel = isSaleInvoice ? 'سند قبض' : 'سند صرف';
            console.log(`[syncController] TREASURY-CHECK inv=${(_m = inv.id) === null || _m === void 0 ? void 0 : _m.substring(0, 8)} num=${inv.number || 'NEW'} type=${inv.type} paymentMethod=${inv.paymentMethod} paidAmount=${paidAmount} paymentCollected=${inv.paymentCollected} total=${inv.total} isCash=${isCashInvoice} partnerId=${inv.partnerId ? inv.partnerId.substring(0, 8) : 'NONE'}`);
            if (paidAmount > 0 && inv.partnerId && !isCashInvoice) {
                try { // === CHECK 0: Did the client already send a standalone PAYMENT/RECEIPT for this partner+amount? ===
                    // If the client created a payment voucher directly AND also sent the purchase invoice,
                    // we must NOT auto-create another treasury doc - that would cause duplicate entries.
                    const invDateForCheck = (0, dateEngine_1.toMySQLDateTime)(inv.date);
                    const [clientCreatedDoc] = yield conn.query(`SELECT id, number FROM invoices 
                         WHERE type = ? AND partnerId = ? AND ABS(total - ?) < 0.01 
                         AND DATE(date) >= DATE_SUB(DATE(?), INTERVAL 7 DAY) 
                         AND DATE(date) <= DATE_ADD(DATE(?), INTERVAL 7 DAY) 
                         AND (relatedInvoiceIds IS NULL OR relatedInvoiceIds = '' OR relatedInvoiceIds = '[]')
                         AND (referenceInvoiceId IS NULL OR referenceInvoiceId = '')
                         AND id != ?
                         LIMIT 1`, [docType, inv.partnerId, paidAmount, invDateForCheck, invDateForCheck, inv.id]);
                    if (clientCreatedDoc.length > 0) {
                        const existingClientDoc = clientCreatedDoc[0];
                        console.log(`[syncController] SKIP auto-treasury: Client already created ${docLabel} for partner ${inv.partnerId} amount ${paidAmount}`);
                        // MARK AS USED so it doesn't suppress multiple invoices erroneously.
                        // We use relatedInvoiceIds instead of referenceInvoiceId so this manual doc 
                        // is PROTECTED from the orphan cascade-delete logic when invoice is edited.
                        yield conn.query(`UPDATE invoices SET relatedInvoiceIds = ? WHERE id = ?`, [JSON.stringify([inv.id]), existingClientDoc.id]);
                        continue;
                    }
                    // PERF: Use exact referenceInvoiceId match instead of LIKE scans
                    // referenceInvoiceId is always set for auto-generated treasury docs
                    const [existingDoc] = yield conn.query(`SELECT id, number, total, partnerId, partnerName, notes FROM invoices 
                         WHERE type = ? AND referenceInvoiceId = ?
                         ORDER BY date DESC LIMIT 1`, [docType, inv.id]);
                    if (existingDoc.length > 0) {
                        const existing = existingDoc[0];
                        const existingTotal = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(existing.total));
                        const amountChanged = !(0, decimalUtils_1.D)(existingTotal).equals((0, decimalUtils_1.D)(paidAmount));
                        const partnerChanged = existing.partnerId !== inv.partnerId;
                        if (!amountChanged && !partnerChanged) {
                            // PERF: console.log(`â ­ï¸  [syncController] SKIP: ${docLabel} ${existing.number} unchanged for invoice ${inv.id}`);
                            continue; // No changes needed
                        }
                        // === UPDATE EXISTING DOC ===
                        // PERF: console.log(`âœ ï¸  [syncController] UPDATING ${docLabel} ${existing.number}: total ${existingTotal} â†’ ${paidAmount}, partner ${partnerChanged ? 'CHANGED' : 'same'}`);
                        // 1. Update the document invoice record
                        const derivedPaymentMethod = inv.partialPaymentMethod || (inv.paymentMethod === 'CREDIT' ? 'CASH' : inv.paymentMethod) || 'CASH';
                        const derivedBankId = inv.partialPaymentBankId || inv.bankAccountId || null;
                        yield conn.query(`UPDATE invoices SET total = ?, partnerId = ?, partnerName = ?, notes = ?, paymentMethod = ?, bankAccountId = ?, bankName = ? WHERE id = ?`, [paidAmount, inv.partnerId, inv.partnerName, `${isSaleInvoice ? 'مقبوضات فاتورة بيع' : 'مدفوعات فاتورة شراء'} ${inv.number || inv.id.substring(0, 8)}`, derivedPaymentMethod, derivedBankId, inv.bankName || null, existing.id]);
                        // 2. Adjust partner balance by the DELTA (not the full amount)
                        const balanceDelta = paidAmount - existingTotal;
                        if (Math.abs(balanceDelta) >= 0.01) {
                            // If partner changed, reverse old partner and apply to new
                            if (partnerChanged && existing.partnerId) {
                                // Reverse old partner: remove old impact
                                yield conn.query('UPDATE partners SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [isSaleInvoice ? existingTotal : -existingTotal, existing.partnerId]);
                                // Apply to new partner
                                yield conn.query('UPDATE partners SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [isSaleInvoice ? -paidAmount : paidAmount, inv.partnerId]);
                            }
                            else {
                                // Same partner, just adjust by delta
                                yield conn.query('UPDATE partners SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [isSaleInvoice ? -balanceDelta : balanceDelta, inv.partnerId]);
                            }
                        }
                        else if (partnerChanged && existing.partnerId) {
                            // Amount same but partner changed — full swap
                            yield conn.query('UPDATE partners SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [isSaleInvoice ? existingTotal : -existingTotal, existing.partnerId]);
                            yield conn.query('UPDATE partners SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [isSaleInvoice ? -paidAmount : paidAmount, inv.partnerId]);
                        }
                        // 3. Update the linked journal entry amounts
                        try {
                            const [journalRows] = yield conn.query(`SELECT id FROM journal_entries WHERE referenceId = ? OR referenceId = ? LIMIT 1 FOR UPDATE`, [existing.id, existing.number]);
                            if (journalRows.length > 0) {
                                const journalId = journalRows[0].id;
                                const invNumber = inv.number || inv.id.substring(0, 8);
                                // Update journal description
                                yield conn.query(`UPDATE journal_entries SET description = ? WHERE id = ?`, [`${docLabel} #${existing.number} - ${inv.partnerName} - دفعة مع الفاتورة ${invNumber}`, journalId]);
                                // Update debit/credit amounts on the journal lines using mathematical replacement
                                yield conn.query(`UPDATE journal_lines SET debit = ? WHERE journalId = ? AND debit > 0`, [paidAmount, journalId]);
                                yield conn.query(`UPDATE journal_lines SET credit = ? WHERE journalId = ? AND credit > 0`, [paidAmount, journalId]);
                                // CRITICAL FIX (Bug #9): Recalculate GL account balances after editing journal lines
                                // Without this, accounts.balance remains stale at the old amounts
                                const [editAffAccts] = yield conn.query('SELECT DISTINCT accountId FROM journal_lines WHERE journalId = ?', [journalId]);
                                const editAcctIds = editAffAccts.map((a) => a.accountId);
                                if (editAcctIds.length > 0) {
                                    yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, editAcctIds);
                                }
                            }
                        }
                        catch (journalUpdateErr) {
                            console.error('[syncController] CRITICAL: Journal UPDATE failed for treasury doc:', journalUpdateErr.message);
                            throw journalUpdateErr; // RE-THROW: Journal must stay in sync with treasury doc
                        }
                        continue; // Done with this invoice
                    }
                    // === CREATE NEW DOC (no existing found) ===
                    const docNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, isSaleInvoice ? 'REC-' : 'PAY-');
                    const docId = docNumber; // SERIAL FIX: id === number for all PAY/REC
                    console.log(`[syncController] CREATE TREASURY DOC: ${docNumber} type=${docType} amount=${paidAmount} for inv=${(_o = inv.id) === null || _o === void 0 ? void 0 : _o.substring(0, 8)} (${inv.number})`);
                    // Create treasury doc
                    const derivedPaymentMethod = inv.partialPaymentMethod || (inv.paymentMethod === 'CREDIT' ? 'CASH' : inv.paymentMethod) || 'CASH';
                    const derivedBankId = inv.partialPaymentBankId || inv.bankAccountId || null;
                    yield conn.query(`
                            INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, 
                                paymentMethod, bankAccountId, bankName, notes, referenceInvoiceId, createdBy, salesmanId, branchId)
                            VALUES (?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, ?, ?, ?, ?, ?, ?, ?)`, [
                        docId,
                        docNumber,
                        (0, dateEngine_1.toMySQLDateTime)(inv.date),
                        docType,
                        inv.partnerId,
                        inv.partnerName,
                        paidAmount,
                        derivedPaymentMethod,
                        derivedBankId,
                        inv.bankName || null,
                        inv.paymentMethod === 'CASH' ? `فاتورة ${isSaleInvoice ? 'نقدي' : 'مشتريات نقدي'} ${inv.partnerName}` : `${isSaleInvoice ? 'مقبوضات فاتورة بيع' : 'مدفوعات فاتورة شراء'} ${inv.number || inv.id.substring(0, 8)}`,
                        inv.id,
                        inv.createdBy || currentUser,
                        yield resolveSalesmanId(conn, inv.salesmanId, salesmanCache),
                        (0, branchFilter_1.resolveBranchIdForWrite)(req, inv.branchId)
                    ]);
                    // Update partner balance
                    yield conn.query('UPDATE partners SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [isSaleInvoice ? -paidAmount : paidAmount, inv.partnerId]);
                    // === CREATE JOURNAL ENTRY FOR TREASURY DOC ===
                    try {
                        const docJournalId = (0, crypto_1.randomUUID)();
                        // Determine which cash/bank account to use
                        const partialMethod = inv.partialPaymentMethod || (inv.paymentMethod === 'CREDIT' ? 'CASH' : inv.paymentMethod) || 'CASH';
                        let cashAccountId = null;
                        let cashAccountName = 'الخزينة';
                        const targetBankId = inv.partialPaymentBankId || inv.bankAccountId;
                        if (targetBankId) {
                            const resolved = yield resolveSyncCashBankAccount(conn, targetBankId);
                            if (resolved) {
                                cashAccountId = resolved.id;
                                cashAccountName = resolved.name;
                            }
                        }
                        if (!cashAccountId && glAccountCache.cash) {
                            cashAccountId = glAccountCache.cash.id;
                            cashAccountName = glAccountCache.cash.name || 'الخزينة';
                        }
                        if (!cashAccountId) {
                            const [fallbackCashQuery] = yield conn.query(`SELECT id, name FROM accounts WHERE type IN ('ASSET', 'TREASURY', 'CASH', 'BANK') ORDER BY created_at ASC LIMIT 1`);
                            if (fallbackCashQuery.length > 0) {
                                cashAccountId = fallbackCashQuery[0].id;
                                cashAccountName = fallbackCashQuery[0].name;
                            }
                        }
                        // Get Partner account
                        let partnerAccountId = isSaleInvoice ? (((_p = glAccountCache.receivables) === null || _p === void 0 ? void 0 : _p.id) || null) : (((_q = glAccountCache.payables) === null || _q === void 0 ? void 0 : _q.id) || null);
                        let partnerAccountName = isSaleInvoice ? (((_r = glAccountCache.receivables) === null || _r === void 0 ? void 0 : _r.name) || 'العملاء') : (((_s = glAccountCache.payables) === null || _s === void 0 ? void 0 : _s.name) || 'الموردين');
                        if (!partnerAccountId) {
                            const [fallbackARQuery] = yield conn.query(`SELECT id, name FROM accounts WHERE type IN (?, ?) ORDER BY created_at ASC LIMIT 1`, isSaleInvoice ? ['ASSET', 'RECEIVABLE'] : ['LIABILITY', 'PAYABLE']);
                            if (fallbackARQuery.length > 0) {
                                partnerAccountId = fallbackARQuery[0].id;
                                partnerAccountName = fallbackARQuery[0].name;
                            }
                        }
                        let invoiceDenominations = null;
                        if (inv.denominations && inv.denominations.length > 0) {
                            try {
                                invoiceDenominations = typeof inv.denominations === 'string' ? inv.denominations : JSON.stringify(inv.denominations);
                            }
                            catch (e) { }
                        }
                        if (cashAccountId && partnerAccountId) {
                            const invNumber = inv.number || inv.id.substring(0, 8);
                            // Prevent orphaned old journal duplication for edits
                            yield conn.query('DELETE FROM journal_entries WHERE referenceId = ?', [docId]);
                            yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, denominations) VALUES (?, ?, ?, ?, ?, ?)`, [
                                docJournalId,
                                (0, dateEngine_1.toMySQLDateTime)(inv.date),
                                `${docLabel} #${docNumber} - ${inv.partnerName}${inv.paymentMethod === 'CASH' ? ' (نقدي)' : ` - دفعة مع الفاتورة ${invNumber}`}`,
                                docId,
                                inv.createdBy || currentUser,
                                invoiceDenominations
                            ]);
                            if (isSaleInvoice) {
                                // Dr Cash/Bank, Cr AR â€” PERF: Batch insert
                                yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES ?`, [[
                                        [docJournalId, cashAccountId, cashAccountName, paidAmount, 0],
                                        [docJournalId, partnerAccountId, partnerAccountName, 0, paidAmount]
                                    ]]);
                            }
                            else {
                                // Dr AP, Cr Cash/Bank â€” PERF: Batch insert
                                yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES ?`, [[
                                        [docJournalId, partnerAccountId, partnerAccountName, paidAmount, 0],
                                        [docJournalId, cashAccountId, cashAccountName, 0, paidAmount]
                                    ]]);
                            }
                        }
                    }
                    catch (docJournalErr) {
                        console.error(`[syncController] CRITICAL: Treasury journal creation FAILED for inv=${(_t = inv.id) === null || _t === void 0 ? void 0 : _t.substring(0, 8)}:`, docJournalErr.message);
                        throw docJournalErr; // RE-THROW: Treasury journal MUST succeed - rollback entire transaction
                    }
                }
                catch (docError) {
                    console.error(`[syncController] CRITICAL: Treasury doc creation FAILED for inv=${(_u = inv.id) === null || _u === void 0 ? void 0 : _u.substring(0, 8)} type=${docType}:`, (docError === null || docError === void 0 ? void 0 : docError.message) || docError);
                    throw docError; // RE-THROW: Treasury doc is NOT optional - rollback entire transaction
                }
            }
            else {
                // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
                // ORPHANED VOUCHER CLEANUP: If the invoice was edited to 0 paid amount 
                // or changed to CASH, we must delete any previously auto-generated 
                // treasury receipt/payment to prevent phantom treasury balances.
                // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
                try {
                    // PERF: Use exact referenceInvoiceId match instead of LIKE scans
                    const [orphanedDocs] = yield conn.query(`SELECT id FROM invoices 
                         WHERE type = ? AND referenceInvoiceId = ?`, [docType, inv.id]);
                    for (const orphan of orphanedDocs) {
                        // PERF: console.log(`ðŸ—‘ï¸  [syncController] Deleting orphaned auto-generated ${docLabel} (${orphan.id}) because invoice ${inv.id} paidAmount is now 0 or CASH`);
                        yield (0, invoiceCascadeDelete_1.deleteInvoiceWithCascade)(conn, orphan.id, currentUser);
                    }
                }
                catch (cleanupErr) {
                    console.error('[syncController] CRITICAL: Orphan treasury cleanup FAILED for inv=' + inv.id + ':', cleanupErr.message);
                    throw cleanupErr; // RE-THROW: Orphaned vouchers corrupt treasury balance if left behind
                }
            }
        }
        // === CREATE JOURNAL ENTRIES FOR RECEIPT/PAYMENT INVOICES ===
        // Direct RECEIPT/PAYMENT invoices need journal entries for treasury/bank
        for (const inv of invoicesToProcess) {
            // Skip journal creation for invoices that were detected as duplicates
            if (skippedInvoiceIds.has(inv.id)) {
                // PERF: console.log(`â ­ï¸  SKIP: Not creating journal for skipped duplicate invoice ${inv.id}`);
                continue;
            }
            if ((inv.type === 'RECEIPT' || inv.type === 'PAYMENT') && !(0, decimalUtils_1.D)(inv.total).isZero()) {
                const isReceipt = inv.type === 'RECEIPT';
                const voucherLabel = isReceipt ? 'سند قبض' : 'سند صرف';
                // BUG FIX: Check if a journal for this voucher is already provided in the request payload
                // If so, skip auto-creation to avoid duplicates (one auto-generated, one from frontend)
                const providedJournals = req.body.journals || (req.body.journal ? [req.body.journal] : []);
                const hasProvidedJournal = providedJournals.some((j) => j.referenceId === inv.id);
                if (hasProvidedJournal) {
                    // PERF: console.log(`â„¹ï¸  [syncController] Skipping auto-journal creation for ${inv.type} ${inv.id} - Journal provided in payload`);
                    continue;
                }
                try {
                    // Check if journal entry already exists for this voucher (using both id and number)
                    const [existingJournal] = yield conn.query('SELECT id FROM journal_entries WHERE referenceId = ? OR referenceId = ? FOR UPDATE', [inv.id, inv.number]);
                    if (existingJournal.length === 0) {
                        const journalId = (0, crypto_1.randomUUID)();
                        // Determine cash/bank account based on payment method
                        let cashBankAccountId = null;
                        let cashBankAccountName = 'الخزينة';
                        if (inv.bankAccountId) {
                            const resolved = yield resolveSyncCashBankAccount(conn, inv.bankAccountId);
                            if (resolved) {
                                cashBankAccountId = resolved.id;
                                cashBankAccountName = resolved.name;
                            }
                        }
                        // Fallback to cash/treasury if not a bank payment or bank not found — PERF: Use GL cache
                        if (!cashBankAccountId) {
                            if (glAccountCache.cash) {
                                cashBankAccountId = glAccountCache.cash.id;
                                cashBankAccountName = glAccountCache.cash.name || 'الخزينة';
                            }
                            // Last resort: DB query only if cache missed entirely
                            if (!cashBankAccountId) {
                                const [fallbackAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '1%' AND type = 'ASSET' LIMIT 1`);
                                cashBankAccountId = (_v = fallbackAccounts[0]) === null || _v === void 0 ? void 0 : _v.id;
                                cashBankAccountName = ((_w = fallbackAccounts[0]) === null || _w === void 0 ? void 0 : _w.name) || 'الخزينة';
                            }
                            if (!cashBankAccountId) {
                                console.error(`â Œ CRITICAL: No cash/treasury account found for ${inv.type} journal entry. Skipping to prevent unbalanced entry.`);
                            }
                        }
                        // === CATEGORY-AWARE PARTNER ACCOUNT SELECTION ===
                        // Must match the client-side postTransaction logic in erpService.ts
                        // Parse voucherCategory from notes field (format: "category|partnerId")
                        const autoVoucherCat = inv.voucherCategory || (() => {
                            if (inv.notes && typeof inv.notes === 'string') {
                                const parts = inv.notes.split('|');
                                if (['supplier', 'expenses', 'employee_advance', 'employee_repay', 'salary', 'labour', 'customer', 'supplier_refund'].includes(parts[0]))
                                    return parts[0];
                            }
                            return null;
                        })();
                        let partnerAccountId = null;
                        let partnerAccountName = '';
                        let shouldUpdatePartnerBalance = false; // Only update for real partner categories
                        // PERF: Use GL cache for all category account lookups (eliminates ~10 queries)
                        if (!isReceipt) {
                            // === PAYMENT CATEGORIES ===
                            if (autoVoucherCat === 'expenses') {
                                // Expenses: debit the expense account directly (partnerId IS the account ID)
                                // MUST query DB â€” partnerId is dynamic, not a well-known GL account
                                const [expAccs] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [inv.partnerId]);
                                partnerAccountId = (_x = expAccs[0]) === null || _x === void 0 ? void 0 : _x.id;
                                partnerAccountName = ((_y = expAccs[0]) === null || _y === void 0 ? void 0 : _y.name) || 'مصروفات';
                                // No partner balance update for expenses
                            }
                            else if (autoVoucherCat === 'employee_advance') {
                                // Employee Advance: debit Employee Advances asset account
                                partnerAccountId = ((_z = glAccountCache.advances) === null || _z === void 0 ? void 0 : _z.id) || null;
                                partnerAccountName = ((_0 = glAccountCache.advances) === null || _0 === void 0 ? void 0 : _0.name) || 'سلف موظفين';
                                // No partner balance update for employee advances
                            }
                            else if (autoVoucherCat === 'salary') {
                                // Salary: debit Salaries & Wages expense (503)
                                partnerAccountId = ((_1 = glAccountCache.salaries) === null || _1 === void 0 ? void 0 : _1.id) || null;
                                partnerAccountName = ((_2 = glAccountCache.salaries) === null || _2 === void 0 ? void 0 : _2.name) || 'رواتب';
                                // PERF: console.log(`ðŸ’° [SYNC/salary] Auto-journal debit account: ${partnerAccountId} (${partnerAccountName})`);
                            }
                            else if (autoVoucherCat === 'labour') {
                                // Customer payment: debit AR (reduces what customer owes)
                                partnerAccountId = ((_3 = glAccountCache.receivables) === null || _3 === void 0 ? void 0 : _3.id) || null;
                                partnerAccountName = ((_4 = glAccountCache.receivables) === null || _4 === void 0 ? void 0 : _4.name) || 'العملاء';
                                shouldUpdatePartnerBalance = true;
                            }
                            else {
                                // Default: Supplier payment â†’ debit AP
                                partnerAccountId = ((_5 = glAccountCache.payables) === null || _5 === void 0 ? void 0 : _5.id) || null;
                                partnerAccountName = ((_6 = glAccountCache.payables) === null || _6 === void 0 ? void 0 : _6.name) || 'الموردين';
                                shouldUpdatePartnerBalance = true;
                            }
                        }
                        else {
                            // === RECEIPT CATEGORIES ===
                            if (autoVoucherCat === 'employee_repay') {
                                // Employee repayment: credit Employee Advances
                                partnerAccountId = ((_7 = glAccountCache.advances) === null || _7 === void 0 ? void 0 : _7.id) || null;
                                partnerAccountName = ((_8 = glAccountCache.advances) === null || _8 === void 0 ? void 0 : _8.name) || 'سلف موظفين';
                                // No partner balance update for employee repayment
                            }
                            else if (autoVoucherCat === 'supplier_refund') {
                                // Supplier refund: credit AP
                                partnerAccountId = ((_9 = glAccountCache.payables) === null || _9 === void 0 ? void 0 : _9.id) || null;
                                partnerAccountName = ((_10 = glAccountCache.payables) === null || _10 === void 0 ? void 0 : _10.name) || 'الموردين';
                                shouldUpdatePartnerBalance = true;
                            }
                            else {
                                // Default: Customer receipt â†’ credit AR
                                partnerAccountId = ((_11 = glAccountCache.receivables) === null || _11 === void 0 ? void 0 : _11.id) || null;
                                partnerAccountName = ((_12 = glAccountCache.receivables) === null || _12 === void 0 ? void 0 : _12.name) || 'العملاء';
                                shouldUpdatePartnerBalance = true;
                            }
                        }
                        // Last resort fallback if no account found (cache was empty for this role)
                        if (!partnerAccountId) {
                            const fallbackPatterns = isReceipt
                                ? ['%عملاء%', '%مدينون%', '%Receivable%']
                                : ['%موردين%', '%دائنون%', '%Payable%'];
                            let [fallbackAccs] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? OR name LIKE ? OR name LIKE ? LIMIT 1`, fallbackPatterns);
                            if (fallbackAccs.length === 0) {
                                const codePattern = isReceipt ? '104%' : '201%';
                                [fallbackAccs] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [codePattern]);
                            }
                            partnerAccountId = (_13 = fallbackAccs[0]) === null || _13 === void 0 ? void 0 : _13.id;
                            partnerAccountName = ((_14 = fallbackAccs[0]) === null || _14 === void 0 ? void 0 : _14.name) || (isReceipt ? 'العملاء' : 'الموردين');
                            shouldUpdatePartnerBalance = true; // Assume partner for fallback
                        }
                        if (cashBankAccountId && partnerAccountId) {
                            const paymentSources = inv.paymentSources
                                ? (typeof inv.paymentSources === 'string' ? JSON.parse(inv.paymentSources) : inv.paymentSources)
                                : [];
                            const mockReq = {
                                body: {
                                    paymentSources: paymentSources,
                                    applyFee: inv.applyFee || false,
                                    fee: inv.fee || 0,
                                    feeTax: inv.feeTax || 0,
                                    feeTotal: inv.feeTotal || 0,
                                    feeChargedTo: inv.feeChargedTo || 'CLIENT',
                                    sourceBankName: inv.bankName || 'البنك'
                                },
                                user: req.user,
                                branchContext: req.branchContext
                            };
                            yield (0, paymentGeneration_1.createPaymentJournal)({
                                conn,
                                journalId,
                                date: (0, dateEngine_1.toMySQLDateTime)(inv.date),
                                description: `${voucherLabel} - ${inv.partnerName}${inv.paymentMethod === 'BANK' ? ' - تحويل بنكي' : ''}`,
                                referenceId: inv.id,
                                createdBy: inv.createdBy || currentUser,
                                amount: inv.total,
                                paymentType: isReceipt ? 'RECEIPT' : 'PAYMENT',
                                paymentMethod: inv.paymentMethod || 'CASH',
                                bankAccountId: inv.bankAccountId || cashBankAccountId,
                                currencyCode: inv.currencyCode || 'EGP',
                                exchangeRate: inv.exchangeRate || 1,
                                denominations: inv.denominations,
                                branchId: inv.branchId,
                                req: mockReq,
                                partnerId: inv.partnerId,
                                explicitAccountId: partnerAccountId
                            });
                            // Update partner balance ONLY for real partner categories
                            // (not for expenses, employee advances, or salaries)
                            if (shouldUpdatePartnerBalance && inv.partnerId) {
                                const balanceChange = isReceipt ? -inv.total : inv.total;
                                yield conn.query('UPDATE partners SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [balanceChange, inv.partnerId]);
                            }
                            // CRITICAL FIX (Bug #8): Update GL account balances after auto-journal creation
                            // Without this, accounts.balance drifts permanently out of sync
                            const [lines] = yield conn.query('SELECT DISTINCT accountId FROM journal_lines WHERE journalId = ?', [journalId]);
                            const autoJournalAcctIds = lines.map(l => l.accountId).filter(Boolean);
                            if (autoJournalAcctIds.length > 0) {
                                yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, autoJournalAcctIds);
                            }
                        }
                        else {
                            console.warn(`[syncController] Could not find accounts for ${inv.type} ${inv.id} journal. cashBank=${cashBankAccountId}, partner=${partnerAccountId}`);
                        }
                    }
                }
                catch (journalError) {
                    console.error('[syncController] CRITICAL: Journal creation FAILED for ' + inv.type + ' ' + inv.id + ':', journalError);
                    throw journalError; // RE-THROW: Treasury journals are mandatory for accounting integrity
                }
            }
        }
        // === UPDATE EMPLOYEE ADVANCES TABLE FOR SYNCED VOUCHERS ===
        // When a synced Payment Voucher has category 'employee_advance', insert a new advance record
        // When a synced Receipt Voucher has category 'employee_repay', apply FIFO repayment
        for (const inv of invoicesToProcess) {
            if (skippedInvoiceIds.has(inv.id))
                continue;
            // Extract voucherCategory from inv or parse from notes (format: "employee_advance|employeeId")
            const syncVoucherCat = inv.voucherCategory || (() => {
                if (inv.notes && typeof inv.notes === 'string') {
                    const parts = inv.notes.split('|');
                    if (parts[0] === 'employee_advance' || parts[0] === 'employee_repay')
                        return parts[0];
                }
                return null;
            })();
            // Extract employeeId from partnerId or from notes
            const syncEmployeeId = inv.partnerId || (() => {
                if (inv.notes && typeof inv.notes === 'string') {
                    const parts = inv.notes.split('|');
                    if (parts.length > 1 && (parts[0] === 'employee_advance' || parts[0] === 'employee_repay'))
                        return parts[1];
                }
                return null;
            })();
            const syncTotal = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(inv.total));
            if (syncVoucherCat === 'employee_advance' && inv.type === 'PAYMENT' && syncEmployeeId && syncTotal > 0) {
                try {
                    // Check for duplicate advance (avoid double-insert on re-sync)
                    const [existingAdv] = yield conn.query(`SELECT id FROM employee_advances WHERE employeeId = ? AND amount = ? AND issueDate = DATE(?) LIMIT 1`, [syncEmployeeId, syncTotal, inv.date]);
                    if (existingAdv.length === 0) {
                        const advanceId = (0, crypto_1.randomUUID)();
                        yield conn.query(`INSERT INTO employee_advances (id, employeeId, type, amount, reason, issueDate, monthlyDeduction, totalPaid, remainingAmount, status)
                             VALUES (?, ?, 'ADVANCE', ?, ?, ?, 0, 0, ?, 'ACTIVE')`, [advanceId, syncEmployeeId, syncTotal, inv.notes || `سلف ة من سند صرف`, inv.date, syncTotal]);
                        // PERF: console.log(`ðŸ’° [HR-SYNC] Created employee advance: ${advanceId} for employee ${syncEmployeeId}, amount: ${syncTotal}`);
                    }
                    else {
                        // PERF: console.log(`â ­ï¸  [HR-SYNC] Advance already exists for employee ${syncEmployeeId}, amount ${syncTotal} on ${inv.date}`);
                    }
                }
                catch (advErr) {
                    console.error('[syncController] CRITICAL: Employee advance creation FAILED:', advErr.message);
                    throw advErr; // RE-THROW: Financial operation - payment was recorded, advance must also persist
                }
            }
            else if (syncVoucherCat === 'employee_repay' && inv.type === 'RECEIPT' && syncEmployeeId && syncTotal > 0) {
                try {
                    const [activeAdvances] = yield conn.query(`SELECT id, amount, totalPaid, remainingAmount FROM employee_advances
                         WHERE employeeId = ? AND status = 'ACTIVE' AND remainingAmount > 0
                         ORDER BY issueDate ASC, createdAt ASC`, [syncEmployeeId]);
                    let remaining = syncTotal;
                    for (const adv of activeAdvances) {
                        if (remaining <= 0)
                            break;
                        const canApply = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(remaining).gt((0, decimalUtils_1.D)(adv.remainingAmount)) ? (0, decimalUtils_1.D)(adv.remainingAmount) : (0, decimalUtils_1.D)(remaining));
                        const newTotalPaid = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(adv.totalPaid).plus((0, decimalUtils_1.D)(canApply)));
                        const newRemaining = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(adv.remainingAmount).minus((0, decimalUtils_1.D)(canApply)));
                        yield conn.query(`UPDATE employee_advances SET totalPaid = ?, remainingAmount = ?, status = ? WHERE id = ?`, [newTotalPaid, newRemaining, newRemaining <= 0 ? 'COMPLETED' : 'ACTIVE', adv.id]);
                        // PERF: console.log(`💰 [HR-SYNC] Advance ${adv.id}: repaid ${canApply}, remaining: ${newRemaining}`);
                        remaining -= canApply;
                    }
                    if (remaining > 0) {
                        // PERF: console.warn(`⚠️ [HR-SYNC] Employee ${syncEmployeeId} repaid ${syncTotal} but only ${syncTotal - remaining} allocated to active advances`);
                    }
                }
                catch (repayErr) {
                    console.error('[syncController] CRITICAL: Advance repayment FAILED:', repayErr.message);
                    throw repayErr; // RE-THROW: Financial operation - receipt was recorded, repayment must also persist
                }
            }
        }
        // 1b. Handle Allocations
        if (allocations && allocations.length > 0) {
            for (const alloc of allocations) {
                // Delete existing allocation for this pair if exists (to avoid duplicates or update amount)
                yield conn.query('DELETE FROM payment_allocations WHERE paymentId = ? AND invoiceId = ?', [alloc.paymentId, alloc.invoiceId]);
                yield conn.query(`INSERT INTO payment_allocations (id, paymentId, invoiceId, amount) VALUES (?, ?, ?, ?)`, [alloc.id || (0, crypto_1.randomUUID)(), alloc.paymentId, alloc.invoiceId, alloc.amount]);
            }
        }
        // 2. Handle Journals (Upsert) â€” ISOLATED with savepoint to prevent loss on later failures
        // CONCURRENCY FIX: Uses FOR UPDATE locking + retry to handle "Record has changed since last read"
        const journals = req.body.journals || (journal ? [journal] : []);
        const processedJournals = [];
        // Get denomination data from invoice if available (for denomination report)
        const invoiceDenominations = (_15 = req.body.invoice) === null || _15 === void 0 ? void 0 : _15.denominations;
        const invoiceDenomJson = invoiceDenominations && Object.values(invoiceDenominations).some((v) => Number(v) > 0)
            ? JSON.stringify(invoiceDenominations) : null;
        if (journals.length > 0) {
            // RETRY WRAPPER: MariaDB MVCC can throw "Record has changed since last read"
            // when concurrent syncs modify the same journal_lines rows. Retry up to 3 times.
            const JOURNAL_MAX_RETRIES = 3;
            let journalAttempt = 0;
            let journalSaved = false;
            while (journalAttempt < JOURNAL_MAX_RETRIES && !journalSaved) {
                journalAttempt++;
                let savepointCreated = false;
                try {
                    yield conn.query('SAVEPOINT journal_save');
                    savepointCreated = true;
                    for (const j of journals) {
                        // Validation: Don't update if lines are missing/empty
                        if (!j.lines || j.lines.length === 0) {
                            // PERF: console.warn(`âš ï¸  Skipping journal ${j.id} - no lines`);
                            continue;
                        }
                        // Get denomination data from journal or fallback to invoice
                        const journalDenominations = j.denominations;
                        const denomJson = (journalDenominations && Object.values(journalDenominations).some((v) => Number(v) > 0))
                            ? (typeof journalDenominations === 'string' ? journalDenominations : JSON.stringify(journalDenominations))
                            : invoiceDenomJson;
                        // CONCURRENCY FIX: Use FOR UPDATE to lock the row before modifying.
                        // This prevents "Record has changed since last read" from concurrent syncs.
                        const [existingJ] = yield conn.query('SELECT id, referenceId FROM journal_entries WHERE id = ? FOR UPDATE', [j.id]);
                        // Generate sequential serial number for manual journals if they don't have one
                        let finalReferenceId = j.referenceId;
                        if (!finalReferenceId || finalReferenceId === 'MANUAL') {
                            // If it exists in DB with a non-MANUAL referenceId, preserve the existing one
                            if (existingJ.length > 0 && existingJ[0].referenceId && existingJ[0].referenceId !== 'MANUAL') {
                                finalReferenceId = existingJ[0].referenceId;
                            }
                            else {
                                finalReferenceId = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, 'TRX-', 'journal_entries', 'referenceId');
                            }
                            // Mutate j so subsequent logic (and potentially response) uses the new ID
                            j.referenceId = finalReferenceId;
                        }
                        if (existingJ.length > 0) {
                            console.log(`[syncController] UPDATE journal ${(_16 = j.id) === null || _16 === void 0 ? void 0 : _16.substring(0, 8)} ref=${(_17 = j.referenceId) === null || _17 === void 0 ? void 0 : _17.substring(0, 8)} desc="${(_18 = j.description) === null || _18 === void 0 ? void 0 : _18.substring(0, 60)}"`);
                            yield conn.query('UPDATE journal_entries SET date=?, description=?, notes=COALESCE(?, notes), referenceId=?, createdBy=?, currencyCode=?, exchangeRate=?, denominations=COALESCE(?, denominations) WHERE id=?', [(0, dateEngine_1.toMySQLDateTime)(j.date), j.description, j.notes || null, finalReferenceId, j.createdBy || currentUser, j.currencyCode || 'EGP', j.exchangeRate || 1, denomJson, j.id]);
                            // Lock journal_lines rows too before deleting to prevent MVCC conflict
                            yield conn.query('SELECT id FROM journal_lines WHERE journalId = ? FOR UPDATE', [j.id]);
                            yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [j.id]);
                        }
                        else {
                            // === DUPLICATE JOURNAL DETECTION ===
                            // Skip if this journal's referenceId matches a skipped (duplicate) invoice
                            // BUT allow if the invoice actually exists in DB (e.g., created by api.post('/invoices') moments before)
                            if (j.referenceId && skippedInvoiceIds.has(j.referenceId)) {
                                const [invoiceExists] = yield conn.query('SELECT id FROM invoices WHERE id = ?', [j.referenceId]);
                                if (invoiceExists.length === 0) {
                                    // PERF: console.log(`â ­ï¸  [SYNC] SKIP journal ${j.id} â€” referenceId ${j.referenceId} was a duplicate invoice (not in DB)`);
                                    continue;
                                }
                                // PERF: console.log(`â„¹ï¸  [SYNC] Invoice ${j.referenceId} exists in DB â€” proceeding with journal save despite duplicate detection`);
                            }
                            // Precise referenceId-based dedup: skip if a journal already exists
                            // for the exact same referenceId. Covers:
                            //   - UUIDs (invoice-generated journals)
                            //   - Sequential IDs (REC-00011, PAY-00005, RCV-, OLD-CP-, OLD-BREC-, etc.)
                            // Manual vouchers with generic references (like '123' or 'مصروفات') are NOT deduped.
                            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(j.referenceId || '');
                            const isSequentialDoc = /^(REC-|PAY-|RCV-|OLD-|INV-|RET-)/i.test(j.referenceId || '');
                            const isSystemGenerated = isUUID || isSequentialDoc;
                            if (j.referenceId && j.referenceId !== 'MANUAL' && isSystemGenerated) {
                                const [dupJournal] = yield conn.query(`SELECT id FROM journal_entries WHERE referenceId = ? LIMIT 1 FOR UPDATE`, [j.referenceId]);
                                if (dupJournal.length > 0) {
                                    // PERF: console.log(`â ­ï¸  [SYNC] SKIP duplicate journal ${j.id} â€” journal already exists for referenceId ${j.referenceId}`);
                                    continue;
                                }
                            }
                            console.log(`[syncController] INSERT journal ${(_19 = j.id) === null || _19 === void 0 ? void 0 : _19.substring(0, 8)} ref=${finalReferenceId === null || finalReferenceId === void 0 ? void 0 : finalReferenceId.substring(0, 12)} desc="${(_20 = j.description) === null || _20 === void 0 ? void 0 : _20.substring(0, 60)}"`);
                            yield conn.query('INSERT INTO journal_entries (id, date, description, notes, referenceId, createdBy, currencyCode, exchangeRate, denominations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [j.id, (0, dateEngine_1.toMySQLDateTime)(j.date), j.description, j.notes || null, finalReferenceId, j.createdBy || currentUser, j.currencyCode || 'EGP', j.exchangeRate || 1, denomJson]);
                        }
                        // Validate all lines have accountId
                        const validLines = j.lines.filter((line) => !!line.accountId);
                        if (validLines.length === 0) {
                            continue;
                        }
                        // Server-side fallback/correction for CASH/BANK treasury mapping.
                        // If the journal is linked to an invoice (referenceId), check if that invoice has a specific treasury (bankAccountId).
                        // If it does, make sure the cash/bank ledger line points to the correct GL account.
                        if (finalReferenceId) {
                            try {
                                const [invRows] = yield conn.query('SELECT id, paymentMethod, bankAccountId FROM invoices WHERE id = ? LIMIT 1', [finalReferenceId]);
                                if (invRows.length > 0) {
                                    const linkedInv = invRows[0];
                                    if (linkedInv.bankAccountId) {
                                        const resolvedAcc = yield resolveSyncCashBankAccount(conn, linkedInv.bankAccountId);
                                        if (resolvedAcc) {
                                            const [defaultCashAcc] = yield conn.query("SELECT id FROM accounts WHERE code = '101' LIMIT 1");
                                            const defaultCashId = (_21 = defaultCashAcc[0]) === null || _21 === void 0 ? void 0 : _21.id;
                                            for (const line of validLines) {
                                                const isDefaultCash = line.accountId === defaultCashId || line.accountId === '101' || line.accountId === '1e93a16a-3148-4d35-b4ad-4d046ce28cfc';
                                                if (isDefaultCash && resolvedAcc.id !== defaultCashId) {
                                                    console.log(`[syncController] Intercepted cached/old client journal line: rewriting cash account from default 101 to resolved treasury: ${resolvedAcc.name} (${resolvedAcc.id})`);
                                                    line.accountId = resolvedAcc.id;
                                                    line.accountName = resolvedAcc.name;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            catch (e) {
                                console.error('[syncController] Failed to auto-correct treasury mapping for journal:', e.message);
                            }
                        }
                        // ===== BALANCE VALIDATION =====
                        // Ensure total debits = total credits before saving
                        const totalDebit_d = validLines.reduce((sum, l) => (0, decimalUtils_1.D)(sum).plus((0, decimalUtils_1.D)(l.debit)), (0, decimalUtils_1.D)(0));
                        const totalCredit_d = validLines.reduce((sum, l) => (0, decimalUtils_1.D)(sum).plus((0, decimalUtils_1.D)(l.credit)), (0, decimalUtils_1.D)(0));
                        const balanceDiff = (0, decimalUtils_1.toNum)(totalDebit_d.minus(totalCredit_d).abs());
                        if (balanceDiff > 0.01) {
                            console.error(`❌ UNBALANCED JOURNAL DETECTED: ${j.id} (${j.description}) - Dr=${(0, decimalUtils_1.toNum)(totalDebit_d)}, Cr=${(0, decimalUtils_1.toNum)(totalCredit_d)}, Gap=${(0, decimalUtils_1.toNum)(totalDebit_d.minus(totalCredit_d))}. Skipping to prevent imbalance.`);
                            continue; // Skip unbalanced entries
                        }
                        // DIAGNOSTIC: Log journal lines being saved to trace Cash/Bank account usage
                        for (const line of validLines) {
                            console.log(`[syncController]   LINE j=${(_22 = j.id) === null || _22 === void 0 ? void 0 : _22.substring(0, 8)}: acct=${(_23 = (line.accountName || 'unknown')) === null || _23 === void 0 ? void 0 : _23.substring(0, 15)} Dr=${line.debit || 0} Cr=${line.credit || 0}`);
                        }
                        const values = validLines.map((line) => [
                            j.id || null,
                            line.accountId || null,
                            line.accountName || null,
                            line.debit || 0,
                            line.credit || 0,
                            line.costCenterId || null,
                            line.currencyCode || 'EGP',
                            line.exchangeRate || 1,
                            line.foreignDebit || 0,
                            line.foreignCredit || 0
                        ]);
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, costCenterId, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [values]);
                        processedJournals.push(j);
                        // PERF: Single summary log instead of per-line logging
                        // PERF: console.log(`âœ… Journal saved: ${j.id} (${j.description}) - ${validLines.length} lines [BALANCED âœ“]`);
                    }
                    // AUTO-UPDATE ACCOUNT BALANCES FROM JOURNAL ENTRIES
                    const affectedAccountIds = new Set();
                    for (const j of processedJournals) {
                        for (const line of j.lines) {
                            if (line.accountId) {
                                affectedAccountIds.add(line.accountId);
                            }
                        }
                    }
                    if (affectedAccountIds.size > 0) {
                        const balanceResult = yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, Array.from(affectedAccountIds));
                        if (balanceResult.updatedCount > 0) {
                            // PERF: console.log(`âœ… Auto-updated ${balanceResult.updatedCount} account balances from journal entries`);
                        }
                    }
                    // ══════════════════════════════════════════════════════════
                    // SAFETY NET: Guarantee every PAYMENT/RECEIPT invoice has a journal
                    // The dedup logic above can skip journals in edge cases (e.g. when
                    // frontend sends journal AND auto-journal was also skipped due to
                    // hasProvidedJournal=true). This catches orphans BEFORE commit.
                    // ══════════════════════════════════════════════════════════
                    const voucherInvoices = invoicesToProcess.filter((inv) => !skippedInvoiceIds.has(inv.id) &&
                        (inv.type === 'RECEIPT' || inv.type === 'PAYMENT') &&
                        !(0, decimalUtils_1.D)(inv.total).isZero());
                    for (const vInv of voucherInvoices) {
                        const [existingJE] = yield conn.query('SELECT id FROM journal_entries WHERE referenceId = ? LIMIT 1 FOR UPDATE', [vInv.id]);
                        if (existingJE.length === 0) {
                            // Journal is missing — create it now
                            const vIsReceipt = vInv.type === 'RECEIPT';
                            const vLabel = vIsReceipt ? 'سند قبض' : 'سند صرف';
                            const safetyJournalId = (0, crypto_1.randomUUID)();
                            // Determine cash/bank account
                            let sCashId = ((_24 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.cash) === null || _24 === void 0 ? void 0 : _24.id) || null;
                            let sCashName = ((_25 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.cash) === null || _25 === void 0 ? void 0 : _25.name) || 'الخزينة';
                            if (vInv.bankAccountId) {
                                const resolved = yield resolveSyncCashBankAccount(conn, vInv.bankAccountId);
                                if (resolved) {
                                    sCashId = resolved.id;
                                    sCashName = resolved.name;
                                }
                            }
                            if (!sCashId) {
                                const [fAccs] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '101%' OR (name LIKE '%خزينة%' AND type = 'ASSET') LIMIT 1`);
                                sCashId = (_26 = fAccs[0]) === null || _26 === void 0 ? void 0 : _26.id;
                                sCashName = ((_27 = fAccs[0]) === null || _27 === void 0 ? void 0 : _27.name) || 'الخزينة';
                            }
                            // Determine partner account — category-aware routing
                            // (mirrors the main auto-journal logic at lines 1431-1460)
                            // CRITICAL FIX: voucherCategory is NOT a DB column — parse from notes
                            const vCat = vInv.voucherCategory || (() => {
                                if (vInv.notes && typeof vInv.notes === 'string') {
                                    const parts = vInv.notes.split('|');
                                    if (['supplier', 'expenses', 'employee_advance', 'employee_repay',
                                        'salary', 'labour', 'customer', 'supplier_refund'].includes(parts[0])) {
                                        return parts[0];
                                    }
                                }
                                return '';
                            })();
                            let sPartId = null;
                            let sPartName = '';
                            if (!vIsReceipt && vCat === 'expenses' && vInv.partnerId) {
                                // Expense voucher: partnerId IS the expense account
                                const [expAccs] = yield conn.query('SELECT id, name FROM accounts WHERE id = ? LIMIT 1', [vInv.partnerId]);
                                sPartId = ((_28 = expAccs[0]) === null || _28 === void 0 ? void 0 : _28.id) || null;
                                sPartName = ((_29 = expAccs[0]) === null || _29 === void 0 ? void 0 : _29.name) || 'مصروفات';
                            }
                            else if (!vIsReceipt && vCat === 'salary') {
                                sPartId = ((_30 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.salaries) === null || _30 === void 0 ? void 0 : _30.id) || null;
                                sPartName = ((_31 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.salaries) === null || _31 === void 0 ? void 0 : _31.name) || 'رواتب';
                            }
                            else if (!vIsReceipt && vCat === 'employee_advance') {
                                sPartId = ((_32 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.advances) === null || _32 === void 0 ? void 0 : _32.id) || null;
                                sPartName = ((_33 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.advances) === null || _33 === void 0 ? void 0 : _33.name) || 'سلف موظفين';
                            }
                            else if (vIsReceipt && vCat === 'employee_repay') {
                                sPartId = ((_34 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.advances) === null || _34 === void 0 ? void 0 : _34.id) || null;
                                sPartName = ((_35 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.advances) === null || _35 === void 0 ? void 0 : _35.name) || 'سلف موظفين';
                            }
                            else if (vIsReceipt && vCat === 'supplier_refund') {
                                sPartId = ((_36 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.payables) === null || _36 === void 0 ? void 0 : _36.id) || null;
                                sPartName = ((_37 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.payables) === null || _37 === void 0 ? void 0 : _37.name) || 'الموردين';
                            }
                            else {
                                // Default: AR for receipts, AP for payments
                                sPartId = vIsReceipt
                                    ? (((_38 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.receivables) === null || _38 === void 0 ? void 0 : _38.id) || null)
                                    : (((_39 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.payables) === null || _39 === void 0 ? void 0 : _39.id) || null);
                                sPartName = vIsReceipt
                                    ? (((_40 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.receivables) === null || _40 === void 0 ? void 0 : _40.name) || 'العملاء')
                                    : (((_41 = glAccountCache === null || glAccountCache === void 0 ? void 0 : glAccountCache.payables) === null || _41 === void 0 ? void 0 : _41.name) || 'الموردين');
                            }
                            if (!sPartId) {
                                const codePattern = vIsReceipt ? '104%' : '201%';
                                const [pAccs] = yield conn.query('SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1', [codePattern]);
                                sPartId = (_42 = pAccs[0]) === null || _42 === void 0 ? void 0 : _42.id;
                                sPartName = ((_43 = pAccs[0]) === null || _43 === void 0 ? void 0 : _43.name) || sPartName;
                            }
                            if (sCashId && sPartId) {
                                const absTotal = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(vInv.total).abs());
                                const isEffReceipt = (vIsReceipt && vInv.total >= 0) || (!vIsReceipt && vInv.total < 0);
                                yield conn.query('INSERT INTO journal_entries (id, date, description, referenceId, createdBy) VALUES (?, ?, ?, ?, ?)', [safetyJournalId, (0, dateEngine_1.toMySQLDateTime)(vInv.date),
                                    `${vLabel} - ${vInv.partnerName || ''}${vInv.paymentMethod === 'BANK' ? ' - تحويل بنكي' : ''}`,
                                    vInv.id, vInv.createdBy || currentUser]);
                                const sjlValues = isEffReceipt
                                    ? [[safetyJournalId, sCashId, sCashName, absTotal, 0],
                                        [safetyJournalId, sPartId, sPartName, 0, absTotal]]
                                    : [[safetyJournalId, sPartId, sPartName, absTotal, 0],
                                        [safetyJournalId, sCashId, sCashName, 0, absTotal]];
                                yield conn.query('INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES ?', [sjlValues]);
                                processedJournals.push({
                                    id: safetyJournalId,
                                    lines: sjlValues.map((v) => ({ accountId: v[1], debit: v[3], credit: v[4] }))
                                });
                                console.log(`🛡️ [SAFETY NET] Created missing journal for ${vInv.type} ${vInv.number || vInv.id.slice(0, 8)} (${absTotal})`);
                            }
                            else {
                                console.error(`❌ [SAFETY NET] Cannot create journal for ${vInv.type} ${vInv.id} — no cash or partner account`);
                            }
                        }
                    }
                    if (savepointCreated) {
                        yield conn.query('RELEASE SAVEPOINT journal_save');
                    }
                    journalSaved = true; // Success â€” exit retry loop
                }
                catch (journalError) {
                    const errMsg = (journalError === null || journalError === void 0 ? void 0 : journalError.message) || '';
                    const isRetryable = errMsg.includes('Record has changed since last read')
                        || errMsg.includes('Lock wait timeout')
                        || errMsg.includes('Deadlock found');
                    if (savepointCreated) {
                        try {
                            yield conn.query('ROLLBACK TO SAVEPOINT journal_save');
                        }
                        catch (e) { /* ignore */ }
                    }
                    if (isRetryable && journalAttempt < JOURNAL_MAX_RETRIES) {
                        // PERF: console.warn(`âš ï¸ Journal save failed (attempt ${journalAttempt}/${JOURNAL_MAX_RETRIES}), retrying in ${journalAttempt * 500}ms: ${errMsg.substring(0, 100)}`);
                        processedJournals.length = 0; // Clear for retry
                        yield new Promise(r => setTimeout(r, journalAttempt * 500));
                        continue; // Retry
                    }
                    console.error(`âŒ Journal save failed (will continue with rest of sync):`, journalError);
                }
            }
        }
        // 3. Products â€” DO NOT update cost from invoice syncs.
        // Product cost/price should only be changed via كارت الصنف (Product Card) or تحديث الاسعار (Price Update).
        // (Cost update removed to prevent invoice edits from overwriting master prices)
        // 3b. Update Product Stocks â€” within transaction (stock integrity matters)
        // PERF: Batch upsert with INSERT ON DUPLICATE KEY UPDATE (1 query instead of 2N)
        try {
            if (productStocks && productStocks.length > 0) {
                // PERF: console.log('Syncing product stocks:', productStocks.length);
                // Individual UPSERTs — VALUES() deprecated in MariaDB 10.3.32+
                for (const ps of productStocks) {
                    const stockVal = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(ps.stock), 5);
                    yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock)
                         VALUES (UUID(), ?, ?, ?)
                         ON DUPLICATE KEY UPDATE stock = ?`, [ps.productId, sanitizeId(ps.warehouseId), stockVal, stockVal]);
                }
            }
        }
        catch (prodError) {
            console.error('âš ï¸ Non-fatal: Product stock sync failed:', prodError);
        }
        // Handle Deletions inside transaction â€” CASCADE DELETE needs atomicity
        // SECURITY: Double-check delete permission at execution point (defense-in-depth)
        if (deletedInvoiceId) {
            // Verify the user actually has the correct delete permission for this invoice type
            const [invTypeRow] = yield conn.query('SELECT type FROM invoices WHERE id = ? LIMIT 1', [deletedInvoiceId]);
            const invType = (_44 = invTypeRow[0]) === null || _44 === void 0 ? void 0 : _44.type;
            if (invType) {
                const isSalesType = ['SALE', 'RETURN_SALE', 'INVOICE_SALE', 'SALE_INVOICE'].includes(invType);
                const isPurchaseType = ['PURCHASE', 'RETURN_PURCHASE', 'INVOICE_PURCHASE', 'PURCHASE_INVOICE'].includes(invType);
                const isTreasuryType = ['RECEIPT', 'PAYMENT'].includes(invType);
                const userRole = (_46 = (_45 = req.user) === null || _45 === void 0 ? void 0 : _45.role) === null || _46 === void 0 ? void 0 : _46.toUpperCase();
                const isAdmin = userRole === 'ADMIN' || userRole === 'MASTER_ADMIN' || userRole === 'GENERAL_MANAGER';
                if (!isAdmin) {
                    let userPerms = [];
                    const rawPerms = (_47 = req.user) === null || _47 === void 0 ? void 0 : _47.permissions;
                    if (Array.isArray(rawPerms))
                        userPerms = rawPerms;
                    else if (typeof rawPerms === 'string') {
                        try {
                            userPerms = JSON.parse(rawPerms);
                        }
                        catch (_55) {
                            userPerms = [];
                        }
                    }
                    const hasAll = userPerms.includes('all');
                    const hasSalesDel = userPerms.includes('sales.delete');
                    const hasPurchaseDel = userPerms.includes('purchase.delete');
                    const hasTreasDel = userPerms.includes('treasury.manage');
                    if (isSalesType && !hasSalesDel && !hasAll) {
                        safeRelease();
                        return res.status(403).json({ error: 'PERMISSION_DENIED', message: 'ليس لديك صلاحية حذف فواتير المبيعات', requiredPermission: 'sales.delete' });
                    }
                    if (isPurchaseType && !hasPurchaseDel && !hasAll) {
                        safeRelease();
                        return res.status(403).json({ error: 'PERMISSION_DENIED', message: 'ليس لديك صلاحية حذف فواتير المشتريات', requiredPermission: 'purchase.delete' });
                    }
                    if (isTreasuryType && !hasTreasDel && !hasAll) {
                        safeRelease();
                        return res.status(403).json({ error: 'PERMISSION_DENIED', message: 'ليس لديك صلاحية حذف سندات الخزينة', requiredPermission: 'treasury.manage' });
                    }
                }
            }
            const cascadeResult = yield (0, invoiceCascadeDelete_1.deleteInvoiceWithCascade)(conn, deletedInvoiceId, currentUser);
            if (cascadeResult.success) {
                // PERF: console.log(`ðŸ—‘ï¸  [Sync] Cascade deleted invoice ${deletedInvoiceId}:`, {
                // receipts: // cascadeResult.deletedReceipts,
                // 
                // payments: // cascadeResult.deletedPayments,
                // 
                // journals: // cascadeResult.deletedJournals
                // 
                // });
                // 
            }
            else {
                console.error(`â Œ [Sync] Failed to cascade delete invoice ${deletedInvoiceId}:`, cascadeResult.error);
            }
        }
        if (deletedJournalId) {
            // 1. Reverse account balance impacts from journal lines
            const [delJLines] = yield conn.query('SELECT jl.accountId, jl.debit, jl.credit, a.type as accType FROM journal_lines jl LEFT JOIN accounts a ON jl.accountId = a.id WHERE jl.journalId = ?', [deletedJournalId]);
            for (const line of delJLines) {
                let reverseChange = 0;
                if (line.accType === 'ASSET' || line.accType === 'EXPENSE') {
                    reverseChange = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.credit).minus((0, decimalUtils_1.D)(line.debit)));
                }
                else {
                    reverseChange = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(line.debit).minus((0, decimalUtils_1.D)(line.credit)));
                }
                yield conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [reverseChange, line.accountId]);
            }
            // 2. Get referenceId before deleting
            const [delJEntry] = yield conn.query('SELECT referenceId FROM journal_entries WHERE id = ?', [deletedJournalId]);
            const delRefId = (_48 = delJEntry[0]) === null || _48 === void 0 ? void 0 : _48.referenceId;
            // 3. Delete journal lines and entry
            yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [deletedJournalId]);
            yield conn.query('DELETE FROM journal_entries WHERE id = ?', [deletedJournalId]);
            // 4. CASCADE: Handle linked RECEIPT/PAYMENT invoice
            // SAFETY: Only cascade-delete AUTO-GENERATED vouchers (with referenceInvoiceId).
            // NEVER delete standalone payment vouchers - they are independently created.
            // BUG FIXED: Previous blind cascade caused untraceable loss of supplier payments.
            if (delRefId) {
                const [linkedInv] = yield conn.query(`SELECT id, number, type, partnerId, partnerName, total, date, referenceInvoiceId, createdBy, paymentMethod, notes FROM invoices WHERE id = ? AND type IN ('RECEIPT', 'PAYMENT')`, [delRefId]);
                const inv = linkedInv[0];
                if (inv) {
                    const isAutoGenerated = !!inv.referenceInvoiceId;
                    if (isAutoGenerated) {
                        // Auto-generated voucher: safe to cascade delete, but archive first
                        console.log(`[Sync] CASCADE: Deleting auto-generated ${inv.type} ${inv.number || inv.id}`);
                        try {
                            yield conn.query(`INSERT INTO deleted_invoices (id, original_id, date, type, partnerId, partnerName, total, status, paymentMethod, notes, createdBy, deletedBy, deletedAt, deletionReason) VALUES (UUID(), ?, ?, ?, ?, ?, ?, 'POSTED', ?, ?, ?, ?, NOW(), ?)`, [inv.id, inv.date, inv.type, inv.partnerId, inv.partnerName, inv.total, inv.paymentMethod, inv.notes, inv.createdBy, currentUser, `Cascade: journal ${deletedJournalId} deleted`]);
                        }
                        catch (archiveErr) {
                            console.warn('[Sync] Could not archive cascaded voucher:', archiveErr.message);
                        }
                        if (inv.partnerId) {
                            const balReverse = (0, decimalUtils_1.toNum)(inv.type === 'RECEIPT' ? (0, decimalUtils_1.D)(inv.total) : (0, decimalUtils_1.D)(inv.total).neg());
                            yield conn.query('UPDATE partners SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [balReverse, inv.partnerId]);
                        }
                        yield conn.query('DELETE FROM invoice_lines WHERE invoiceId = ?', [inv.id]);
                        yield conn.query('DELETE FROM invoices WHERE id = ?', [inv.id]);
                        console.log(`[Sync] CASCADE: Archived + deleted auto-generated ${inv.type} ${inv.number || inv.id}`);
                    }
                    else {
                        // STANDALONE voucher - DO NOT DELETE. Preserve for audit trail.
                        console.warn(`[Sync] PROTECT: Standalone ${inv.type} ${inv.number || inv.id} (${inv.partnerName}, ${inv.total}) - journal deleted but voucher preserved`);
                    }
                }
            }
            // PERF: console.log(`ðŸ—‘ï¸ Journal ${deletedJournalId} fully deleted (lines + balances reversed + linked voucher)`);
        }
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PHASE A COMPLETE â€” COMMIT & RELEASE transactional connection
        // All financial data (invoice, journal, stock, deletions) is now committed.
        // Release the connection IMMEDIATELY so other users aren't blocked."
        // 5. Handle Cheques (Upsert) - CRITICAL FINANCIAL DATA (Moved to Phase A for transactional safety)
        if (cheques && cheques.length > 0) {
            for (const c of cheques) {
                const [existingCheque] = yield conn.query('SELECT id FROM cheques WHERE id = ?', [c.id]);
                if (existingCheque.length > 0) {
                    yield conn.query(`UPDATE cheques SET 
                        number = ?, bankName = ?, amount = ?, dueDate = ?, status = ?, type = ?, 
                        partnerId = ?, partnerName = ?, description = ?, createdDate = ?, 
                        bankAccountId = ?, bounceReason = ?, transactionId = ?, createdBy = ?
                        WHERE id = ?`, [
                        c.number, c.bankName, c.amount, (0, dateEngine_1.toMySQLDateTime)(c.dueDate), c.status, c.type,
                        c.partnerId, c.partnerName, c.description, (0, dateEngine_1.toMySQLDateTime)(c.createdDate),
                        c.bankAccountId, c.bounceReason, c.transactionId, c.createdBy || currentUser,
                        c.id
                    ]);
                }
                else {
                    yield conn.query(`INSERT INTO cheques (id, number, bankName, amount, dueDate, status, type, partnerId, partnerName, description, createdDate, bankAccountId, bounceReason, transactionId, createdBy)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                        c.id, c.number, c.bankName, c.amount, (0, dateEngine_1.toMySQLDateTime)(c.dueDate), c.status, c.type,
                        c.partnerId, c.partnerName, c.description, (0, dateEngine_1.toMySQLDateTime)(c.createdDate),
                        c.bankAccountId, c.bounceReason, c.transactionId, c.createdBy || currentUser
                    ]);
                }
            }
        }
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        yield conn.commit();
        safeRelease();
        connReleased = true; // Flag so catch/finally don't double-release
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PHASE B â€” NON-CRITICAL UPDATES (fire-and-forget, no transaction needed)
        // Partners, accounts, cheques, fixed assets, and audit logs.
        // These use safePoolQuery() which auto-acquires, retries on stale connections.
        // If any fail, the core financial data is already safe.
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // 4. Update Partners (Upsert) â€” non-fatal, uses safePoolQuery()
        try {
            if (partners && partners.length > 0) {
                for (const p of partners) {
                    const [existing] = yield (0, db_1.safePoolQuery)('SELECT id FROM partners WHERE id = ?', [p.id]);
                    if (existing.length > 0) {
                        yield (0, db_1.safePoolQuery)(`UPDATE partners SET 
                        balance = ?, 
                        name = COALESCE(?, name),
                        phone = COALESCE(?, phone),
                        address = COALESCE(?, address)
                        WHERE id = ?`, [(0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(p.balance)), p.name, p.phone, p.address, p.id]);
                    }
                    else {
                        let partnerType = p.type || 'CUSTOMER';
                        if (partnerType === 'BOTH')
                            partnerType = 'CUSTOMER';
                        yield (0, db_1.safePoolQuery)(`INSERT INTO partners (id, name, type, balance, phone, address, isCustomer, isSupplier)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                            p.id,
                            p.name,
                            partnerType,
                            (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(p.balance)),
                            p.phone || null,
                            p.address || null,
                            (_49 = p.isCustomer) !== null && _49 !== void 0 ? _49 : (partnerType === 'CUSTOMER' || p.type === 'BOTH'),
                            (_50 = p.isSupplier) !== null && _50 !== void 0 ? _50 : (partnerType === 'SUPPLIER' || p.type === 'BOTH')
                        ]);
                    }
                }
            }
        }
        catch (partnerError) {
            console.error('âš ï¸ Non-fatal: Partner sync failed:', partnerError);
        }
        // 5. Update Accounts (Balance) â€” non-fatal
        try {
            if (accounts && accounts.length > 0) {
                for (const a of accounts) {
                    yield (0, db_1.safePoolQuery)('UPDATE accounts SET balance = ? WHERE id = ?', [(0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(a.balance)), a.id]);
                }
            }
        }
        catch (accError) {
            console.error('âš ï¸ Non-fatal: Account sync failed:', accError);
        }
        // 6. Cheques moved to Phase A.
        // 7. Handle Fixed Assets (Upsert) â€” non-fatal
        try {
            const assets = req.body.fixedAssets;
            if (assets && assets.length > 0) {
                for (const a of assets) {
                    const [existingA] = yield (0, db_1.safePoolQuery)('SELECT id FROM fixed_assets WHERE id = ?', [a.id]);
                    if (existingA.length > 0) {
                        yield (0, db_1.safePoolQuery)(`UPDATE fixed_assets SET 
                            name=?, purchaseDate=?, purchaseCost=?, salvageValue=?, lifeYears=?, 
                            assetAccountId=?, accumulatedDepreciationAccountId=?, expenseAccountId=?, 
                            status=?, lastDepreciationDate=?
                            WHERE id=?`, [
                            a.name, (0, dateEngine_1.toMySQLDateTime)(a.purchaseDate), a.purchaseCost, a.salvageValue, a.lifeYears,
                            a.assetAccountId, a.accumulatedDepreciationAccountId, a.expenseAccountId,
                            a.status, (0, dateEngine_1.toMySQLDateTime)(a.lastDepreciationDate),
                            a.id
                        ]);
                    }
                    else {
                        yield (0, db_1.safePoolQuery)(`INSERT INTO fixed_assets (id, name, purchaseDate, purchaseCost, salvageValue, lifeYears, assetAccountId, accumulatedDepreciationAccountId, expenseAccountId, status, lastDepreciationDate)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                            a.id, a.name, (0, dateEngine_1.toMySQLDateTime)(a.purchaseDate), a.purchaseCost, a.salvageValue, a.lifeYears,
                            a.assetAccountId, a.accumulatedDepreciationAccountId, a.expenseAccountId,
                            a.status || 'ACTIVE', (0, dateEngine_1.toMySQLDateTime)(a.lastDepreciationDate)
                        ]);
                    }
                }
            }
        }
        catch (assetError) {
            console.error('âš ï¸ Non-fatal: Fixed assets sync failed:', assetError);
        }
        // 8. Audit Logs â€” PERF: fire-and-forget (don't block response for non-critical writes)
        // Capture variables and run asynchronously via pool (not conn, which may be released)
        const _auditInvoices = [...invoicesToProcess];
        const _auditJournals = [...processedJournals];
        const _auditDelInvId = deletedInvoiceId;
        const _auditDelJrnlId = deletedJournalId;
        const _auditUser = currentUser;
        setImmediate(() => __awaiter(void 0, void 0, void 0, function* () {
            try {
                if (_auditInvoices.length > 0) {
                    for (const inv of _auditInvoices) {
                        const typeMap = {
                            'SALE_INVOICE': 'فاتورة بيع',
                            'PURCHASE_INVOICE': 'فاتورة شراء',
                            'SALE_RETURN': 'مرتجع مبيعات',
                            'PURCHASE_RETURN': 'مرتجع مشتريات',
                            'RECEIPT': 'سند قبض',
                            'PAYMENT': 'سند صرف',
                            'OPENING_BALANCE': 'رصيد افتتاحي'
                        };
                        const invoiceTypeArabic = typeMap[inv.type] || inv.type;
                        const partnerName = inv.partnerName || 'بدون عميل';
                        let details = `النوع: ${invoiceTypeArabic}`;
                        if (inv.partnerName)
                            details += ` | العميل/المورد: ${inv.partnerName}`;
                        details += ` | المبلغ: ${(0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(inv.total)).toLocaleString('ar-EG')} ج.م`;
                        details += ` | الحالة: ${inv.status === 'PAID' ? 'مدفوع' : inv.status === 'PENDING' ? 'معلق' : inv.status}`;
                        if (inv.paymentMethod) {
                            const paymentMap = {
                                'CASH': 'نقداً',
                                'CARD': 'بطاقة',
                                'BANK': 'تحويل بنكي',
                                'CHEQUE': 'شيك',
                                'CREDIT': 'آجل'
                            };
                            details += ` | طريقة الدفع: ${paymentMap[inv.paymentMethod] || inv.paymentMethod}`;
                        }
                        if (inv.notes) {
                            details += ` | ملاحظات: ${inv.notes.substring(0, 50)}${inv.notes.length > 50 ? '...' : ''}`;
                        }
                        details += ` | رقم المرجع: ${inv.id.substring(0, 8)}`;
                        yield (0, auditController_1.logAction)(_auditUser, 'INVOICE', 'SAVE', `${invoiceTypeArabic} - ${partnerName}`, details);
                    }
                }
                if (_auditDelInvId) {
                    yield (0, auditController_1.logAction)(_auditUser, 'INVOICE', 'DELETE', `حذف فاتورة`, `تم حذف الفاتورة | رقم المرجع: ${_auditDelInvId.substring(0, 8)}`);
                }
                if (_auditJournals.length > 0) {
                    for (const j of _auditJournals) {
                        const totalDebit = (0, decimalUtils_1.toNum)(j.lines.reduce((sum, l) => (0, decimalUtils_1.D)(sum).plus((0, decimalUtils_1.D)(l.debit)), (0, decimalUtils_1.D)(0)));
                        const totalCredit = (0, decimalUtils_1.toNum)(j.lines.reduce((sum, l) => (0, decimalUtils_1.D)(sum).plus((0, decimalUtils_1.D)(l.credit)), (0, decimalUtils_1.D)(0)));
                        let details = `الوصف: ${j.description || 'قيد يومية'}`;
                        details += ` | إجمالي المدين: ${totalDebit.toLocaleString('ar-EG')} ج.م`;
                        details += ` | إجمالي الدائن: ${totalCredit.toLocaleString('ar-EG')} ج.م`;
                        details += ` | عدد الحسابات: ${j.lines.length}`;
                        details += ` | رقم المرجع: ${j.id.substring(0, 8)}`;
                        yield (0, auditController_1.logAction)(_auditUser, 'ACCOUNTING', 'JOURNAL', `قيد يومية - ${j.description || 'بدون وصف'}`, details);
                    }
                }
                if (_auditDelJrnlId) {
                    yield (0, auditController_1.logAction)(_auditUser, 'ACCOUNTING', 'DELETE', `حذف قيد يومية`, `تم حذف القيد اليومي | رقم المرجع: ${_auditDelJrnlId.substring(0, 8)}`);
                }
            }
            catch (auditError) {
                console.error('âš ï¸ Non-fatal: Audit log failed:', auditError);
            }
        }));
        // 9. Broadcast Real-time Updates (in-memory, instant)
        if (invoicesToProcess.length > 0 || deletedInvoiceId) {
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoice', updatedBy: currentUser });
            (0, index_1.invalidateKPICache)();
        }
        if (cheques && cheques.length > 0) {
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'cheques', updatedBy: currentUser });
        }
        if (processedJournals.length > 0 || deletedJournalId) {
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'journal', updatedBy: currentUser });
            (0, index_1.invalidateKPICache)();
        }
        if ((accounts && accounts.length > 0) || processedJournals.length > 0) {
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'accounts', updatedBy: currentUser });
        }
        if (partners && partners.length > 0) {
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'partner', updatedBy: currentUser });
            (0, index_1.invalidateKPICache)();
        }
        res.json({
            success: true,
            journal: processedJournals.length === 1 ? processedJournals[0] : undefined,
            journals: processedJournals
        });
    }
    catch (error) {
        // Only rollback if we still own the connection (Phase A didn't complete)
        if (!connReleased) {
            try {
                yield conn.rollback();
            }
            catch ( /* connection may be dead */_56) { /* connection may be dead */ }
        }
        console.error('âŒ Sync Error (full rollback):', error);
        console.error('âŒ Sync Error details:', {
            hasInvoice: !!req.body.invoice,
            hasJournal: !!req.body.journal,
            journalLines: ((_52 = (_51 = req.body.journal) === null || _51 === void 0 ? void 0 : _51.lines) === null || _52 === void 0 ? void 0 : _52.length) || 0,
            invoiceType: (_53 = req.body.invoice) === null || _53 === void 0 ? void 0 : _53.type,
            invoiceId: (_54 = req.body.invoice) === null || _54 === void 0 ? void 0 : _54.id,
            connReleased
        });
        return (0, errorHandler_1.handleControllerError)(res, error, 'Sync failed');
    }
    finally {
        safeRelease();
    }
});
exports.syncTransaction = syncTransaction;
// =====================================================
// REPAIR: Find and fix orphaned payment vouchers
// (vouchers that were saved but whose journal entries were dropped by the old dedup bug)
// POST /api/sync/repair-orphaned-vouchers
// =====================================================
const repairOrphanedVouchers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    const conn = yield (0, db_1.getConnection)();
    try {
        const authReq = req;
        const currentUser = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.username) || 'System';
        const dryRun = req.query.dryRun === 'true';
        // Find all PAYMENT/RECEIPT invoices that have NO corresponding journal entry
        const [orphanedRows] = yield conn.query(`
            SELECT i.id, i.number, i.date, i.type, i.partnerId, i.partnerName, 
                   i.total, i.paymentMethod, i.bankAccountId, i.bankName,
                   i.notes, i.createdBy, i.currencyCode, i.exchangeRate, i.branchId,
                   i.paymentSources, i.applyFee, i.fee, i.feeTax, i.feeTotal, i.feeChargedTo
            FROM invoices i
            LEFT JOIN journal_entries je ON je.referenceId = i.id OR je.referenceId = i.number
            WHERE i.type IN ('PAYMENT', 'RECEIPT')
            AND i.status = 'POSTED'
            AND i.total > 0
            AND je.id IS NULL
            ORDER BY i.date DESC
        `);
        const orphaned = orphanedRows;
        // PERF: console.log(`ðŸ” [REPAIR] Found ${orphaned.length} orphaned vouchers (no journal entry)`);
        if (dryRun) {
            return res.json({
                dryRun: true,
                orphanedCount: orphaned.length,
                orphaned: orphaned.map(o => ({
                    id: o.id,
                    number: o.number,
                    date: o.date,
                    type: o.type,
                    partnerName: o.partnerName,
                    total: (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(o.total)),
                    paymentMethod: o.paymentMethod
                }))
            });
        }
        yield conn.beginTransaction();
        let repairedCount = 0;
        const repaired = [];
        for (const inv of orphaned) {
            try {
                const isReceipt = inv.type === 'RECEIPT';
                const voucherLabel = isReceipt ? 'سند قبض' : 'سند صرف';
                const journalId = (0, crypto_1.randomUUID)();
                // Determine cash/bank account
                let cashBankAccountId = null;
                let cashBankAccountName = 'الخزينة';
                if (inv.bankAccountId) {
                    const resolved = yield resolveSyncCashBankAccount(conn, inv.bankAccountId);
                    if (resolved) {
                        cashBankAccountId = resolved.id;
                        cashBankAccountName = resolved.name;
                    }
                }
                // Fallback to cash/treasury
                if (!cashBankAccountId) {
                    const [cashAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%خزينة%' OR name LIKE '%نقدية%' OR name LIKE '%صندوق%' OR code LIKE '101%' LIMIT 1`);
                    cashBankAccountId = (_c = cashAccounts[0]) === null || _c === void 0 ? void 0 : _c.id;
                    cashBankAccountName = ((_d = cashAccounts[0]) === null || _d === void 0 ? void 0 : _d.name) || 'الخزينة';
                }
                if (!cashBankAccountId) {
                    // PERF: console.warn(`âš ï¸ [REPAIR] Skipping ${inv.id} â€” no cash/bank account found`);
                    continue;
                }
                // Get partner account
                // Parse voucherCategory from notes (format: "category|partnerId")
                const vCat = (() => {
                    if (inv.notes && typeof inv.notes === 'string') {
                        const parts = inv.notes.split('|');
                        if (['supplier', 'expenses', 'employee_advance', 'employee_repay', 'salary', 'labour', 'customer', 'supplier_refund'].includes(parts[0]))
                            return parts[0];
                    }
                    return null;
                })();
                let partnerAccountId = null;
                let partnerAccountName = '';
                if (!isReceipt) {
                    // === PAYMENT CATEGORIES ===
                    if (vCat === 'expenses') {
                        const [expAccs] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [inv.partnerId]);
                        partnerAccountId = (_e = expAccs[0]) === null || _e === void 0 ? void 0 : _e.id;
                        partnerAccountName = ((_f = expAccs[0]) === null || _f === void 0 ? void 0 : _f.name) || 'مصروفات';
                    }
                    else if (vCat === 'employee_advance') {
                        const [advAccs] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%سلف%' OR name LIKE '%عهد%' OR code = '109' LIMIT 1`);
                        partnerAccountId = (_g = advAccs[0]) === null || _g === void 0 ? void 0 : _g.id;
                        partnerAccountName = ((_h = advAccs[0]) === null || _h === void 0 ? void 0 : _h.name) || 'سلف موظفين';
                    }
                    else if (vCat === 'salary') {
                        const [salAccs] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%رواتب%' OR name LIKE '%أجور%' OR code = '204' LIMIT 1`);
                        partnerAccountId = (_j = salAccs[0]) === null || _j === void 0 ? void 0 : _j.id;
                        partnerAccountName = ((_k = salAccs[0]) === null || _k === void 0 ? void 0 : _k.name) || 'رواتب';
                    }
                    else if (vCat === 'labour') {
                        // Customer payment via labour: debit AR
                        const [arAccs] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%عملاء%' OR name LIKE '%مدينون%' OR code LIKE '104%' LIMIT 1`);
                        partnerAccountId = (_l = arAccs[0]) === null || _l === void 0 ? void 0 : _l.id;
                        partnerAccountName = ((_m = arAccs[0]) === null || _m === void 0 ? void 0 : _m.name) || 'العملاء';
                    }
                    else {
                        // Default: Supplier â†’ AP
                        const [apAccs] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%موردين%' OR name LIKE '%دائنون%' OR code LIKE '201%' LIMIT 1`);
                        partnerAccountId = (_o = apAccs[0]) === null || _o === void 0 ? void 0 : _o.id;
                        partnerAccountName = ((_p = apAccs[0]) === null || _p === void 0 ? void 0 : _p.name) || 'الموردين';
                    }
                }
                else {
                    // === RECEIPT CATEGORIES ===
                    if (vCat === 'employee_repay') {
                        const [advAccs] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%سلف%' OR name LIKE '%عهد%' OR code = '109' LIMIT 1`);
                        partnerAccountId = (_q = advAccs[0]) === null || _q === void 0 ? void 0 : _q.id;
                        partnerAccountName = ((_r = advAccs[0]) === null || _r === void 0 ? void 0 : _r.name) || 'سلف موظفين';
                    }
                    else if (vCat === 'supplier_refund') {
                        const [apAccs] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%موردين%' OR name LIKE '%دائنون%' OR code LIKE '201%' LIMIT 1`);
                        partnerAccountId = (_s = apAccs[0]) === null || _s === void 0 ? void 0 : _s.id;
                        partnerAccountName = ((_t = apAccs[0]) === null || _t === void 0 ? void 0 : _t.name) || 'الموردين';
                    }
                    else {
                        // Default: Customer â†’ AR
                        const [arAccs] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%عملاء%' OR name LIKE '%مدينون%' OR code LIKE '104%' LIMIT 1`);
                        partnerAccountId = (_u = arAccs[0]) === null || _u === void 0 ? void 0 : _u.id;
                        partnerAccountName = ((_v = arAccs[0]) === null || _v === void 0 ? void 0 : _v.name) || 'العملاء';
                    }
                }
                if (!partnerAccountId) {
                    // PERF: console.warn(`âš ï¸ [REPAIR] Skipping ${inv.id} â€” no partner account found`);
                    continue;
                }
                const invTotal = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(inv.total));
                const paymentSources = inv.paymentSources
                    ? (typeof inv.paymentSources === 'string' ? JSON.parse(inv.paymentSources) : inv.paymentSources)
                    : [];
                const mockReq = {
                    body: {
                        paymentSources: paymentSources,
                        applyFee: inv.applyFee || false,
                        fee: inv.fee || 0,
                        feeTax: inv.feeTax || 0,
                        feeTotal: inv.feeTotal || 0,
                        feeChargedTo: inv.feeChargedTo || 'CLIENT',
                        sourceBankName: inv.bankName || 'البنك'
                    },
                    user: req.user,
                    branchContext: req.branchContext
                };
                yield (0, paymentGeneration_1.createPaymentJournal)({
                    conn,
                    journalId,
                    date: inv.date,
                    description: `${voucherLabel} - ${inv.partnerName || ''}${inv.paymentMethod === 'BANK' ? ' - تحويل بنكي' : ''} [إصلاح]`,
                    referenceId: inv.id,
                    createdBy: inv.createdBy || currentUser,
                    amount: invTotal,
                    paymentType: isReceipt ? 'RECEIPT' : 'PAYMENT',
                    paymentMethod: inv.paymentMethod || 'CASH',
                    bankAccountId: inv.bankAccountId || cashBankAccountId,
                    currencyCode: inv.currencyCode || 'EGP',
                    exchangeRate: inv.exchangeRate || 1,
                    branchId: inv.branchId,
                    req: mockReq,
                    partnerId: inv.partnerId,
                    explicitAccountId: partnerAccountId
                });
                repairedCount++;
                repaired.push({
                    id: inv.id,
                    number: inv.number,
                    type: inv.type,
                    partnerName: inv.partnerName,
                    total: invTotal,
                    journalId
                });
                // PERF: console.log(`âœ… [REPAIR] Created journal ${journalId} for orphaned ${inv.type} ${inv.number || inv.id} (${invTotal})`);
            }
            catch (repairErr) {
                console.error(`âš ï¸ [REPAIR] Error repairing ${inv.id}:`, repairErr.message);
            }
        }
        // Recalculate affected account balances
        if (repairedCount > 0) {
            try {
                const [affectedAccIds] = yield conn.query(`
                    SELECT DISTINCT jl.accountId FROM journal_lines jl 
                    JOIN journal_entries je ON jl.journalId = je.id
                    WHERE je.description LIKE '%[إصلاح]%' AND je.createdBy = ?
                `, [currentUser]);
                const accIds = affectedAccIds.map(r => r.accountId);
                if (accIds.length > 0) {
                    const { updateAccountBalancesFromJournal } = require('../utils/accountBalanceUtils');
                    yield updateAccountBalancesFromJournal(conn, accIds);
                    // PERF: console.log(`âœ… [REPAIR] Recalculated ${accIds.length} account balances`);
                }
            }
            catch (balErr) {
                // PERF: console.warn('âš ï¸ [REPAIR] Balance recalc failed (non-fatal):', balErr.message);
            }
        }
        if (repairedCount > 0) {
            (0, index_1.invalidateKPICache)();
        }
        yield conn.commit();
        yield (0, auditController_1.logAction)(currentUser, 'SYSTEM', 'REPAIR_VOUCHERS', `Repaired ${repairedCount} orphaned vouchers`, `Total orphaned found: ${orphaned.length}`);
        res.json({
            success: true,
            orphanedFound: orphaned.length,
            repairedCount,
            repaired
        });
    }
    catch (error) {
        try {
            yield conn.rollback();
        }
        catch (_) { /* no active transaction */ }
        console.error('âŒ [REPAIR] Error:', error);
        if (!res.headersSent) {
            return (0, errorHandler_1.handleControllerError)(res, error, 'Repair orphaned vouchers');
        }
    }
    finally {
        conn.release();
    }
});
exports.repairOrphanedVouchers = repairOrphanedVouchers;
