"use strict";
/**
 * POS Controller (نقطة البيع)
 * ============================
 * Handles all Point of Sale operations including:
 * - Shift management (open/close)
 * - Cash drawer operations
 * - Quick sales processing
 * - POS reports (X/Z reports)
 */
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
exports.updatePOSInvoice = exports.exportPOSReport = exports.getProductProfitabilityReport = exports.getCategoryProfitabilityReport = exports.getShiftProfitabilityReport = exports.getShiftMovementDetail = exports.getShiftSalesReport = exports.getProductSalesSummary = exports.getCategorySalesSummary = exports.getEmbeddedVariants = exports.processPOSRefund = exports.getPOSInvoice = exports.getPOSCustomerSummary = exports.getRecentPOSSales = exports.recallHeldOrder = exports.getHeldOrders = exports.holdOrder = exports.getProductByBarcode = exports.getPOSProductDetail = exports.getCustomerLastOrder = exports.deleteVariantGroup = exports.getVariantGroupProducts = exports.assignProductToVariantGroup = exports.updateVariantGroup = exports.createVariantGroup = exports.getVariantGroups = exports.getPOSProducts = exports.getShifts = exports.getHourlySales = exports.getReportSummary = exports.getShiftReport = exports.processPOSSale = exports.getShiftMovements = exports.addCashMovement = exports.deleteShift = exports.reopenShift = exports.unvalidateShift = exports.validateShift = exports.closeShift = exports.getCurrentShift = exports.openShift = exports.verifyAdminPassword = exports.updatePOSSettings = exports.getPOSSettings = exports.getTreasuryPreviousBalance = exports.getPOSTreasuries = exports.getPaymentAccounts = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const dateUtils_1 = require("../../utils/dateUtils");
const policyEnforcement_1 = require("../utils/policyEnforcement");
const branchFilter_1 = require("../utils/branchFilter");
const invoiceController_1 = require("./invoiceController");
const accountBalanceUtils_1 = require("../utils/accountBalanceUtils");
const loyaltyController_1 = require("./loyaltyController");
const posConfigController_1 = require("./posConfigController");
const invoiceNumberGenerator_1 = require("../utils/invoiceNumberGenerator");
function getOrCreatePosSurplusAccount(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield conn.query(`SELECT id FROM accounts WHERE name = 'فائض النقدية (نقطة البيع)' LIMIT 1`);
        if (rows.length > 0)
            return rows[0].id;
        const id = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO accounts (id, code, name, type, subType, balance, openingBalance)
         VALUES (?, ?, 'فائض النقدية (نقطة البيع)', 'REVENUE', 'OTHER_REVENUE', 0, 0)`, [id, `REV-POS-${Math.floor(Math.random() * 10000)}`]);
        return id;
    });
}
function getOrCreateExpenseAccount(conn, entityType) {
    return __awaiter(this, void 0, void 0, function* () {
        let name = 'مصروفات ورديات نقاط البيع';
        let codePrefix = 'EXP-POS-';
        let accountType = 'EXPENSE';
        let subType = 'OPERATING_EXPENSE';
        if (entityType === 'EMPLOYEE') {
            name = 'سلف وقروض الموظفين';
            codePrefix = 'ASSET-EMP-';
            accountType = 'ASSET';
            subType = 'OTHER_CURRENT_ASSET';
        }
        else if (entityType === 'SUPPLIER') {
            name = 'دفعات مقدمة لموردين (نقاط بيع)';
            codePrefix = 'ASSET-SUP-';
            accountType = 'ASSET';
            subType = 'OTHER_CURRENT_ASSET';
        }
        const [rows] = yield conn.query(`SELECT id FROM accounts WHERE name = ? LIMIT 1`, [name]);
        if (rows.length > 0)
            return rows[0].id;
        const id = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO accounts (id, code, name, type, subType, balance, openingBalance)
         VALUES (?, ?, ?, ?, ?, 0, 0)`, [id, `${codePrefix}${Math.floor(Math.random() * 10000)}`, name, accountType, subType]);
        return id;
    });
}
// TODO: Add real-time POS updates when socket is refactored
// import { emitEntityChanged } from '../socket';
// ── Optional column cache ──────────────────────────────────────────────────
// Checked once per process. Prevents 'Unknown column' crashes when a client
// database doesn't have optional/feature-specific columns.
let cachedProductCols = null;
let cachedPartnerCols = null;
let cachedInvoiceCols = null;
function getProductCols(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        if (cachedProductCols)
            return cachedProductCols;
        const [rows] = yield conn.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'products'`);
        cachedProductCols = new Set(rows.map((r) => r.COLUMN_NAME));
        return cachedProductCols;
    });
}
function getPartnerCols(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        if (cachedPartnerCols)
            return cachedPartnerCols;
        const [rows] = yield conn.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'partners'`);
        cachedPartnerCols = new Set(rows.map((r) => r.COLUMN_NAME));
        return cachedPartnerCols;
    });
}
function getInvoiceCols(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        if (cachedInvoiceCols)
            return cachedInvoiceCols;
        const [rows] = yield conn.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'invoices'`);
        cachedInvoiceCols = new Set(rows.map((r) => r.COLUMN_NAME));
        return cachedInvoiceCols;
    });
}
/** Build a safe SELECT fragment for a table alias, only including columns that exist. */
function safeCol(cols, colName, alias, tableAlias = 'p') {
    return cols.has(colName)
        ? `${tableAlias}.${colName} AS ${alias}`
        : `NULL AS ${alias}`;
}
// ============================================
// PAYMENT ACCOUNTS (for split-payment modal)
// ============================================
/**
 * Get the payment accounts available to the current user's branch.
 * Returns: cash accounts + bank accounts, each with their GL accountId.
 * GET /api/pos/payment-accounts
 */
const getPaymentAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const userCtx = req.user;
        const branchId = (userCtx === null || userCtx === void 0 ? void 0 : userCtx.branchId) || null;
        // 1. Cash / صندوق accounts:
        //    - code starts with 101 OR name contains خزينة/صندوق
        //    - EXCLUDE any GL account that is already linked to a banks row
        //      (those will appear under BANK type instead)
        const [cashRows] = yield conn.query(`
            SELECT a.id AS accountId, a.name, a.code, 'CASH' AS type,
                   NULL AS bankId, NULL AS bankName
            FROM accounts a
            WHERE (a.code LIKE '101%' OR a.name LIKE '%خزينة%' OR a.name LIKE '%صندوق%')
              AND a.id NOT IN (SELECT accountId FROM banks WHERE accountId IS NOT NULL)
        `);
        // 2. Bank accounts — all rows in banks table that have a linked GL account
        const bankRows = yield getBranchBanks(conn, branchId);
        const accounts = [...cashRows, ...bankRows];
        res.json({ accounts });
    }
    catch (error) {
        console.error('[POS] Error fetching payment accounts:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getPaymentAccounts = getPaymentAccounts;
function getBranchBanks(conn, branchId) {
    return __awaiter(this, void 0, void 0, function* () {
        // Base query — no isActive filter (column does not exist on banks table)
        const baseQuery = `
        SELECT b.accountId, a.name, a.code, 'BANK' AS type,
               b.id AS bankId, b.name AS bankName,
               b.feeEnabled, b.feeType, b.feePercentage, b.feeFixedAmount, b.feeMinAmount, b.feeTaxRate
        FROM banks b
        JOIN accounts a ON b.accountId = a.id
        WHERE b.accountId IS NOT NULL`;
        // Branch-scoped: return banks belonging to this branch + shared banks (branchId IS NULL)
        if (branchId) {
            try {
                const [branchBanks] = yield conn.query(`${baseQuery} AND (b.branchId = ? OR b.branchId IS NULL)`, [branchId]);
                if (branchBanks.length > 0)
                    return branchBanks;
            }
            catch (_a) {
                // branchId column not yet on banks — fall through to unfiltered
            }
        }
        try {
            const [allBanks] = yield conn.query(baseQuery);
            return allBanks;
        }
        catch (err) {
            console.error('[POS] getBranchBanks failed:', err.message);
            return [];
        }
    });
}
// ============================================
// POS SETTINGS & SCHEMA HELPERS
// ============================================
/**
 * Get all cash/treasury accounts available for POS selection.
 * GET /api/pos/treasuries
 *
 * Includes:
 *  - Accounts with code starting with 101 (standard cash)
 *  - Accounts with subType = 'CASH' or subType = 'BANK'
 *  - Any account linked to a bank record (banks.accountId)
 *  - Accounts whose name contains treasury-related keywords
 */
const getPOSTreasuries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const userCtx = req.user;
        const userRole = ((userCtx === null || userCtx === void 0 ? void 0 : userCtx.role) || '').toUpperCase();
        const userBranchId = (userCtx === null || userCtx === void 0 ? void 0 : userCtx.branchId) || null;
        const isPrivileged = ['ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN'].includes(userRole);
        // Non-admin users with a branch: only see treasuries tied to their branch
        // via the banks table (banks.branchId), plus unlinked cash accounts (branchId IS NULL)
        let branchFilter = '';
        const params = [];
        if (!isPrivileged && userBranchId) {
            // Only return treasuries EXACTLY matching the user's branch
            branchFilter = `AND b.branchId = ?`;
            params.push(userBranchId);
        }
        const [rows] = yield conn.query(`
            SELECT DISTINCT a.id, a.name, a.code
            FROM accounts a
            LEFT JOIN banks b ON b.accountId = a.id
            WHERE (
                a.code LIKE '101%'
                OR a.subType IN ('CASH', 'BANK')
                OR b.id IS NOT NULL
                OR a.name LIKE '%خزينة%'
                OR a.name LIKE '%صندوق%'
                OR a.name LIKE '%كاشير%'
                OR a.name LIKE '%نقدية%'
            )
            AND a.type = 'ASSET'
            ${branchFilter}
            ORDER BY a.code ASC, a.name ASC
        `, params);
        res.json({ treasuries: rows, isLocked: !isPrivileged && !!userBranchId });
    }
    catch (error) {
        console.error('[POS] Error fetching treasuries:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getPOSTreasuries = getPOSTreasuries;
/**
 * GET /api/pos/treasuries/:id/previous-balance
 * Returns the closing cash of the last CLOSED shift that used this treasury.
 * If no previous shift exists, returns 0.
 */
const getTreasuryPreviousBalance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        // 1. Get the actual current balance from the GL accounts table
        const [accountRows] = yield conn.query(`SELECT balance FROM accounts WHERE id = ?`, [id]);
        const actualBalance = ((_a = accountRows[0]) === null || _a === void 0 ? void 0 : _a.balance) || 0;
        // 2. Get last shift info for the UI display (closedAt date)
        const [rows] = yield conn.query(`SELECT closedAt, id AS shiftId
             FROM pos_shifts
             WHERE treasuryId = ?
               AND status IN ('CLOSED', 'VALIDATED', 'APPROVED')
             ORDER BY closedAt DESC
             LIMIT 1`, [id]);
        const lastShift = rows[0] || null;
        res.json({
            balance: parseFloat(actualBalance),
            fromShiftId: (lastShift === null || lastShift === void 0 ? void 0 : lastShift.shiftId) || null,
            closedAt: (lastShift === null || lastShift === void 0 ? void 0 : lastShift.closedAt) || null,
        });
    }
    catch (error) {
        console.error('[POS] getTreasuryPreviousBalance error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getTreasuryPreviousBalance = getTreasuryPreviousBalance;
/**
 * Get POS settings (never returns adminPassword hash).
 * GET /api/pos/settings
 */
const getPOSSettings = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    const conn = yield (0, db_1.getConnection)();
    try {
        const [rows] = yield conn.query(`SELECT discountLockEnabled, discountFreeLimit,
                    perInvoiceAccounting, printAfterConfirm, useNumpad, allowedCategories,
                    (adminPassword IS NOT NULL AND adminPassword != '') AS adminPasswordConfigured,
                    autoCloseEnabled, autoCloseTime, editCutoffDate, editCutoffDays
             FROM pos_settings LIMIT 1`);
        const rawSettings = rows[0] || {};
        let parsedCategories = [];
        if (typeof rawSettings.allowedCategories === 'string') {
            try {
                parsedCategories = JSON.parse(rawSettings.allowedCategories);
            }
            catch (_h) { }
        }
        else if (Array.isArray(rawSettings.allowedCategories)) {
            parsedCategories = rawSettings.allowedCategories;
        }
        const settings = {
            discountLockEnabled: Boolean((_a = rawSettings.discountLockEnabled) !== null && _a !== void 0 ? _a : 1),
            discountFreeLimit: Number((_b = rawSettings.discountFreeLimit) !== null && _b !== void 0 ? _b : 5),
            perInvoiceAccounting: Boolean((_c = rawSettings.perInvoiceAccounting) !== null && _c !== void 0 ? _c : 0),
            printAfterConfirm: Boolean((_d = rawSettings.printAfterConfirm) !== null && _d !== void 0 ? _d : 1),
            useNumpad: Boolean((_e = rawSettings.useNumpad) !== null && _e !== void 0 ? _e : 1),
            allowedCategories: parsedCategories,
            adminPasswordConfigured: Boolean((_f = rawSettings.adminPasswordConfigured) !== null && _f !== void 0 ? _f : 0),
            autoCloseEnabled: Boolean((_g = rawSettings.autoCloseEnabled) !== null && _g !== void 0 ? _g : 0),
            autoCloseTime: rawSettings.autoCloseTime || '23:59',
            editCutoffDate: rawSettings.editCutoffDate || null,
            editCutoffDays: Number(rawSettings.editCutoffDays || 0),
        };
        res.json({ settings });
    }
    catch (error) {
        console.error('[POS] Error fetching POS settings:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getPOSSettings = getPOSSettings;
/**
 * Update POS settings.
 * PUT /api/pos/settings
 * Accepts: discountLockEnabled, discountFreeLimit, adminPassword (plain — hashed before save)
 */
const updatePOSSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { discountLockEnabled, discountFreeLimit, adminPassword, perInvoiceAccounting, printAfterConfirm, useNumpad, allowedCategories, autoCloseEnabled, autoCloseTime, editCutoffDate, editCutoffDays, } = req.body;
        const updates = [];
        const params = [];
        if (discountLockEnabled !== undefined) {
            updates.push('discountLockEnabled = ?');
            params.push(discountLockEnabled ? 1 : 0);
        }
        if (discountFreeLimit !== undefined) {
            const limit = parseFloat(discountFreeLimit);
            if (isNaN(limit) || limit < 0 || limit > 100) {
                return res.status(400).json({ error: 'حد الخصم يجب أن يكون بين 0 و 100' });
            }
            updates.push('discountFreeLimit = ?');
            params.push(limit);
        }
        if (perInvoiceAccounting !== undefined) {
            updates.push('perInvoiceAccounting = ?');
            params.push(perInvoiceAccounting ? 1 : 0);
        }
        if (printAfterConfirm !== undefined) {
            updates.push('printAfterConfirm = ?');
            params.push(printAfterConfirm ? 1 : 0);
        }
        if (useNumpad !== undefined) {
            updates.push('useNumpad = ?');
            params.push(useNumpad ? 1 : 0);
        }
        if (allowedCategories !== undefined) {
            updates.push('allowedCategories = ?');
            params.push(allowedCategories ? JSON.stringify(allowedCategories) : null);
        }
        if (autoCloseEnabled !== undefined) {
            updates.push('autoCloseEnabled = ?');
            params.push(autoCloseEnabled ? 1 : 0);
        }
        if (autoCloseTime !== undefined) {
            updates.push('autoCloseTime = ?');
            params.push(autoCloseTime);
        }
        if (adminPassword !== undefined && adminPassword !== '') {
            const bcrypt = yield Promise.resolve().then(() => __importStar(require('bcryptjs')));
            const hash = yield bcrypt.hash(adminPassword, 10);
            updates.push('adminPassword = ?');
            params.push(hash);
        }
        if (editCutoffDate !== undefined) {
            updates.push('editCutoffDate = ?');
            params.push(editCutoffDate || null);
        }
        if (editCutoffDays !== undefined) {
            updates.push('editCutoffDays = ?');
            params.push(parseInt(editCutoffDays) || 0);
        }
        if (updates.length === 0) {
            return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
        }
        params.push('1'); // WHERE id = '1'
        yield conn.query(`UPDATE pos_settings SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' });
    }
    catch (error) {
        console.error('[POS] Error updating POS settings:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.updatePOSSettings = updatePOSSettings;
/**
 * Verify admin password and return a short-lived admin token (15 min).
 * POST /api/pos/verify-admin-password
 * Used by: discount lock (Phase 3), admin opening amount (Phase 1)
 */
const verifyAdminPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ error: 'كلمة المرور مطلوبة' });
        }
        const [rows] = yield conn.query(`SELECT adminPassword FROM pos_settings LIMIT 1`);
        const storedHash = ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.adminPassword) || null;
        if (!storedHash) {
            return res.status(400).json({ error: 'لم يتم تعيين كلمة مرور المشرف' });
        }
        const bcrypt = yield Promise.resolve().then(() => __importStar(require('bcryptjs')));
        const isValid = yield bcrypt.compare(password, storedHash);
        if (!isValid) {
            return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        }
        // Issue a short-lived admin token — signed with the app JWT secret
        const jwt = yield Promise.resolve().then(() => __importStar(require('jsonwebtoken')));
        const secret = process.env.JWT_SECRET || 'pos_admin_secret';
        const adminToken = jwt.sign({ role: 'pos_admin', scope: 'discount_override' }, secret, { expiresIn: '15m' });
        res.json({ valid: true, adminToken });
    }
    catch (error) {
        console.error('[POS] verifyAdminPassword error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.verifyAdminPassword = verifyAdminPassword;
// ============================================
// SHIFT MANAGEMENT
// ============================================
/**
 * Open a new shift for a user
 * POST /api/pos/shift/open
 */
const openShift = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { openingCash = 0, terminalName, shiftDefinitionId: reqShiftDefId, deviceId: reqDeviceId, treasuryId, } = req.body;
        const userCtx = req.user;
        const userId = userCtx === null || userCtx === void 0 ? void 0 : userCtx.id;
        const userName = (userCtx === null || userCtx === void 0 ? void 0 : userCtx.name) || 'Unknown';
        const userRole = ((userCtx === null || userCtx === void 0 ? void 0 : userCtx.role) || '').toUpperCase();
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        if (!treasuryId) {
            return res.status(400).json({ error: 'يجب اختيار الخزينة لفتح الوردية' });
        }
        // ── Branch isolation: derive warehouseId from JWT branch context ──
        // ADMIN / SUPER_ADMIN / MASTER_ADMIN may override via request body.
        const isPrivileged = ['ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN'].includes(userRole);
        let resolvedWarehouseId = isPrivileged && req.body.warehouseId
            ? req.body.warehouseId
            : ((userCtx === null || userCtx === void 0 ? void 0 : userCtx.defaultWarehouseId) || req.body.warehouseId || null);
        const now = (0, dateUtils_1.getEgyptianISOString)();
        // ── Admin opening amount: automatically fetch treasury balance ──
        // No password required for the cashier to open the shift. The system
        // simply records what the treasury balance was at the moment of opening.
        const [accountRows] = yield conn.query(`SELECT balance FROM accounts WHERE id = ?`, [treasuryId]);
        const actualBalance = ((_a = accountRows[0]) === null || _a === void 0 ? void 0 : _a.balance) || 0;
        const parsedAdminAmount = parseFloat(actualBalance) || 0;
        const adminOpeningAmountSetBy = userId;
        const adminOpeningAmountSetAt = now;
        // Check if user already has an open shift
        const [existingShifts] = yield conn.query(`SELECT id FROM pos_shifts WHERE userId = ? AND status = 'OPEN'`, [userId]);
        if (existingShifts.length > 0) {
            return res.status(400).json({
                error: 'لديك وردية مفتوحة بالفعل. يرجى إغلاقها أولاً.',
                existingShiftId: existingShifts[0].id
            });
        }
        // Resolve shift definition + device (auto-seed defaults if needed)
        const defaults = yield (0, posConfigController_1.ensureDefaults)(conn);
        const shiftDefinitionId = reqShiftDefId || defaults.shiftDefinitionId;
        const deviceId = reqDeviceId || defaults.deviceId;
        const shiftId = (0, crypto_1.randomUUID)();
        // Both INSERTs must succeed atomically — shift without its opening
        // movement would produce a 0-balance expectedCash calculation
        yield conn.query('START TRANSACTION');
        try {
            yield conn.query(`INSERT INTO pos_shifts (
                    id, userId, warehouseId, shiftDefinitionId, deviceId, terminalName,
                    openedAt, openingCash, status, branchId,
                    treasuryId, adminOpeningAmount, adminOpeningAmountSetBy, adminOpeningAmountSetAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)`, [
                shiftId, userId, resolvedWarehouseId, shiftDefinitionId, deviceId,
                terminalName || null, now, openingCash,
                (0, branchFilter_1.resolveBranchIdForWrite)(req),
                treasuryId,
                parsedAdminAmount,
                adminOpeningAmountSetBy,
                adminOpeningAmountSetAt,
            ]);
            // Record opening cash movement
            yield conn.query(`INSERT INTO pos_cash_movements (id, shiftId, type, amount, paymentMethod, description, createdAt)
                 VALUES (?, ?, 'OPENING', ?, 'CASH', 'رصيد افتتاحي', ?)`, [(0, crypto_1.randomUUID)(), shiftId, openingCash, now]);
            yield conn.query('COMMIT');
        }
        catch (txError) {
            yield conn.query('ROLLBACK');
            throw txError;
        }
        // Fetch warehouse + treasury names
        let warehouseName = null;
        if (resolvedWarehouseId) {
            const [warehouses] = yield conn.query(`SELECT name FROM warehouses WHERE id = ?`, [resolvedWarehouseId]);
            warehouseName = (_b = warehouses[0]) === null || _b === void 0 ? void 0 : _b.name;
        }
        let treasuryName = null;
        if (treasuryId) {
            const [treasuryRows] = yield conn.query(`SELECT name FROM accounts WHERE id = ?`, [treasuryId]);
            treasuryName = (_c = treasuryRows[0]) === null || _c === void 0 ? void 0 : _c.name;
        }
        const shift = {
            id: shiftId,
            userId,
            userName,
            warehouseId: resolvedWarehouseId,
            warehouseName,
            treasuryId,
            treasuryName,
            adminOpeningAmount: parsedAdminAmount,
            shiftDefinitionId,
            deviceId,
            terminalName,
            openedAt: now,
            openingCash,
            status: 'OPEN',
            totalSales: 0,
            totalRefunds: 0,
            salesCount: 0,
            refundCount: 0,
            // Branch context echoed back to frontend
            branchId: (userCtx === null || userCtx === void 0 ? void 0 : userCtx.branchId) || null,
            branchName: (userCtx === null || userCtx === void 0 ? void 0 : userCtx.branchName) || null,
        };
        // Emit real-time update (when socket is available)
        // emitEntityChanged('pos-shift', shift, userName);
        res.json({
            success: true,
            shift,
            message: 'تم فتح الوردية بنجاح'
        });
    }
    catch (error) {
        console.error('Error opening shift:', error);
        res.status(500).json({ error: error.message || 'حدث خطأ أثناء فتح الوردية' });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.openShift = openShift;
/**
 * Get current open shift for a user
 * GET /api/pos/shift/current
 */
const getCurrentShift = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        // Try to join treasury; gracefully fall back if treasuryId column doesn't exist yet
        let shifts;
        try {
            [shifts] = (yield conn.query(`SELECT s.*, u.name as userName, w.name as warehouseName,
                        a.name as treasuryName
                 FROM pos_shifts s
                 LEFT JOIN users u ON s.userId = u.id
                 LEFT JOIN warehouses w ON s.warehouseId = w.id
                 LEFT JOIN accounts a ON s.treasuryId = a.id
                 WHERE s.userId = ? AND s.status = 'OPEN'
                 ORDER BY s.openedAt DESC
                 LIMIT 1`, [userId]));
        }
        catch (_c) {
            // treasuryId column not yet migrated — fall back to basic query
            [shifts] = (yield conn.query(`SELECT s.*, u.name as userName, w.name as warehouseName
                 FROM pos_shifts s
                 LEFT JOIN users u ON s.userId = u.id
                 LEFT JOIN warehouses w ON s.warehouseId = w.id
                 WHERE s.userId = ? AND s.status = 'OPEN'
                 ORDER BY s.openedAt DESC
                 LIMIT 1`, [userId]));
        }
        const shift = shifts[0] || null;
        if (shift) {
            // Get cash movements summary
            // expectedCash must match closeShift formula: OPENING + DEPOSIT + CASH sales − WITHDRAWAL − CASH refunds
            // Bank/card sales do NOT go into the cash drawer, so they must be excluded
            const [movements] = yield conn.query(`SELECT 
                    SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE 0 END) as deposits,
                    SUM(CASE WHEN type = 'WITHDRAWAL' THEN amount ELSE 0 END) as withdrawals,
                    SUM(CASE WHEN type = 'SALE' AND paymentMethod IN ('CASH', 'TREASURY') THEN amount ELSE 0 END) as cashSales,
                    SUM(CASE WHEN type = 'SALE' AND paymentMethod IN ('BANK', 'BANK_ACCOUNT') THEN amount ELSE 0 END) as bankSales,
                    SUM(CASE WHEN type = 'REFUND' AND paymentMethod IN ('CASH', 'TREASURY') THEN amount ELSE 0 END) as cashRefunds,
                    SUM(CASE WHEN type = 'SALE' THEN amount ELSE 0 END) as totalSales
                 FROM pos_cash_movements
                 WHERE shiftId = ?`, [shift.id]);
            const movementData = movements[0];
            const [expenseRows] = yield conn.query(`SELECT SUM(amount) as totalExpenses FROM pos_expenses WHERE shiftId = ?`, [shift.id]);
            const shiftExpenses = parseFloat(((_b = expenseRows[0]) === null || _b === void 0 ? void 0 : _b.totalExpenses) || 0);
            // Cash drawer = opening + adminOpening + deposits + cash sales − withdrawals − cash refunds - expenses
            shift.expectedCash = parseFloat(shift.adminOpeningAmount || 0) +
                parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.deposits) || 0) +
                parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.cashSales) || 0) -
                parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.withdrawals) || 0) -
                parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.cashRefunds) || 0) - shiftExpenses;
            shift.cashSales = parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.cashSales) || 0);
            shift.bankSales = parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.bankSales) || 0);
            shift.totalSales = parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.totalSales) || 0);
        }
        res.json({ shift });
    }
    catch (error) {
        console.error('Error getting current shift:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getCurrentShift = getCurrentShift;
/**
 * Close a shift with cash count
 * POST /api/pos/shift/close
 */
const closeShift = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId, closingCash, closingCard, notes, closingRecipientType, closingRecipientId, shortageEmployeeId } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown';
        if (!shiftId) {
            return res.status(400).json({ error: 'معرف الوردية مطلوب' });
        }
        // Reject blind close — cashier must explicitly enter the drawer amount
        if (closingCash === null || closingCash === undefined) {
            return res.status(400).json({ error: 'يجب إدخال المبلغ الفعلي في الدرج' });
        }
        if (!closingRecipientType || !closingRecipientId) {
            return res.status(400).json({ error: 'يجب اختيار وجهة تسليم العهدة (خزينة أو موظف)' });
        }
        // Verify shift belongs to user and is open
        const [shifts] = yield conn.query(`SELECT * FROM pos_shifts WHERE id = ? AND userId = ? AND status = 'OPEN'`, [shiftId, userId]);
        if (shifts.length === 0) {
            return res.status(404).json({ error: 'الوردية غير موجودة أو مغلقة بالفعل' });
        }
        const shift = shifts[0];
        // Calculate expected cash and card
        const [movements] = yield conn.query(`SELECT 
                SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE 0 END) as deposits,
                SUM(CASE WHEN type = 'WITHDRAWAL' THEN amount ELSE 0 END) as withdrawals,
                SUM(CASE WHEN type = 'SALE' AND paymentMethod IN ('CASH', 'TREASURY') THEN amount ELSE 0 END) as cashSales,
                SUM(CASE WHEN type = 'SALE' AND paymentMethod IN ('BANK', 'BANK_ACCOUNT') THEN amount ELSE 0 END) as bankSales,
                SUM(CASE WHEN type = 'REFUND' AND paymentMethod IN ('CASH', 'TREASURY') THEN amount ELSE 0 END) as cashRefunds,
                SUM(CASE WHEN type = 'REFUND' AND paymentMethod IN ('BANK', 'BANK_ACCOUNT') THEN amount ELSE 0 END) as bankRefunds
             FROM pos_cash_movements
             WHERE shiftId = ?`, [shiftId]);
        const movementData = movements[0];
        const [expenseRows] = yield conn.query(`SELECT SUM(amount) as totalExpenses FROM pos_expenses WHERE shiftId = ?`, [shiftId]);
        const shiftExpenses = parseFloat(((_c = expenseRows[0]) === null || _c === void 0 ? void 0 : _c.totalExpenses) || 0);
        const expectedCash = parseFloat(shift.adminOpeningAmount || 0) +
            parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.deposits) || 0) +
            parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.cashSales) || 0) -
            parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.withdrawals) || 0) -
            parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.cashRefunds) || 0) - shiftExpenses;
        const variance = closingCash - expectedCash;
        const expectedCard = parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.bankSales) || 0) - parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.bankRefunds) || 0);
        // Fallback to expectedCard if the client did not send closingCard (e.g. old client app)
        const parsedClosingCard = closingCard !== undefined ? parseFloat(closingCard) : expectedCard;
        const varianceCard = parsedClosingCard - expectedCard;
        const now = (0, dateUtils_1.getEgyptianISOString)();
        // Check system configuration for session validation requirement + variance threshold
        const [configRows] = yield conn.query(`SELECT config FROM system_config LIMIT 1`);
        let posValidationRequired = false;
        let posVarianceThreshold = null;
        if (configRows.length > 0) {
            try {
                const settings = JSON.parse(configRows[0].config);
                posValidationRequired = !!settings.posSessionValidationRequired;
                posVarianceThreshold = typeof settings.posVarianceThreshold === 'number' ? settings.posVarianceThreshold : null;
            }
            catch (e) {
                console.error('Error parsing system config for POS validation check', e);
            }
        }
        // Auto-escalate to PENDING_VALIDATION if variance exceeds threshold
        const isOverThreshold = posVarianceThreshold !== null && Math.abs(variance) > posVarianceThreshold;
        let newStatus = (posValidationRequired || isOverThreshold) ? 'PENDING_VALIDATION' : 'CLOSED';
        // === BEGIN TRANSACTION ===
        // Held order cleanup + shift status update must succeed or fail atomically
        yield conn.query('START TRANSACTION');
        try {
            // Cleanup held orders — these are just saved carts with no financial impact
            let heldOrdersPurged = 0;
            try {
                const [heldCount] = yield conn.query('SELECT COUNT(*) as cnt FROM pos_held_orders WHERE shiftId = ?', [shiftId]);
                heldOrdersPurged = ((_d = heldCount[0]) === null || _d === void 0 ? void 0 : _d.cnt) || 0;
                if (heldOrdersPurged > 0) {
                    yield conn.query('DELETE FROM pos_held_orders WHERE shiftId = ?', [shiftId]);
                    console.log(`🗑️ [POS] Purged ${heldOrdersPurged} held orders on shift close for ${shiftId}`);
                }
            }
            catch (heldErr) {
                // Table may not exist — non-fatal for cleanup
                console.warn('⚠️ [POS] Could not cleanup held orders:', heldErr.message);
            }
            // Update shift
            yield conn.query(`UPDATE pos_shifts 
                 SET closedAt = ?, closingCash = ?, expectedCash = ?, variance = ?, 
                     closingCard = ?, expectedCard = ?, varianceCard = ?,
                     status = ?, notes = ?,
                     closingRecipientType = ?, closingRecipientId = ?, shortageEmployeeId = ?,
                     updatedAt = ?
                 WHERE id = ?`, [now, closingCash, expectedCash, variance,
                parsedClosingCard, expectedCard, varianceCard,
                newStatus, notes || null,
                closingRecipientType || null, closingRecipientId || null, shortageEmployeeId || null,
                now, shiftId]);
            // ==============================================
            // Create Journal Entry for the Shift Closing
            // ==============================================
            if (shift.treasuryId && closingRecipientId) {
                let targetAccountId = null;
                let shortageAccountId = null;
                // Resolve target account ID
                if (closingRecipientType === 'TREASURY') {
                    // It's a treasury, so closingRecipientId is an accountId
                    targetAccountId = closingRecipientId;
                }
                else if (closingRecipientType === 'EMPLOYEE') {
                    // It's an employee, find their treasuryAccountId
                    const [empRows] = yield conn.query('SELECT treasuryAccountId FROM employees WHERE id = ?', [closingRecipientId]);
                    if (empRows.length > 0 && empRows[0].treasuryAccountId) {
                        targetAccountId = empRows[0].treasuryAccountId;
                    }
                }
                // Resolve shortage account ID if variance < 0
                if (variance < 0 && shortageEmployeeId) {
                    const [shortageEmpRows] = yield conn.query('SELECT treasuryAccountId FROM employees WHERE id = ?', [shortageEmployeeId]);
                    if (shortageEmpRows.length > 0 && shortageEmpRows[0].treasuryAccountId) {
                        shortageAccountId = shortageEmpRows[0].treasuryAccountId;
                    }
                }
                if (targetAccountId) {
                    const journalId = (0, crypto_1.randomUUID)();
                    const journalDescription = `إغلاق وردية نقطة البيع ${shiftId}`;
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, branchId)
                         VALUES (?, ?, ?, ?, ?, 'EGP', 1, ?)`, [journalId, now, journalDescription, shiftId, userId, shift.branchId || null]);
                    const journalLines = [];
                    const actualCash = closingCash;
                    let posCredit = actualCash;
                    let surplusAccountId = null;
                    let surplusAmount = 0;
                    // Debit Target Treasury/Employee
                    if (actualCash > 0) {
                        journalLines.push([
                            journalId, targetAccountId, 'تسليم نقدية الوردية', actualCash, 0, 'EGP', 1, actualCash, 0
                        ]);
                    }
                    // Debit Shortage Employee
                    if (variance < 0 && shortageAccountId) {
                        const shortageAmount = Math.abs(variance);
                        journalLines.push([
                            journalId, shortageAccountId, 'عجز وردية - موظف', shortageAmount, 0, 'EGP', 1, shortageAmount, 0
                        ]);
                        posCredit += shortageAmount; // Equals expectedCash
                    }
                    // Debit POS Expenses (from pos_expenses table)
                    let expensesList = [];
                    try {
                        const [expRows] = yield conn.query(`SELECT id, amount, entityType, description FROM pos_expenses WHERE shiftId = ?`, [shift.id]);
                        expensesList = expRows;
                    }
                    catch (_e) {
                        // Table might not exist or be empty
                    }
                    const expenseAccountIds = new Set();
                    for (const exp of expensesList) {
                        const expAmount = parseFloat(exp.amount) || 0;
                        if (expAmount > 0) {
                            const expAccountId = yield getOrCreateExpenseAccount(conn, exp.entityType);
                            const expDesc = exp.description || 'مصروف وردية نقطة بيع';
                            journalLines.push([
                                journalId, expAccountId, expDesc, expAmount, 0, 'EGP', 1, expAmount, 0
                            ]);
                            expenseAccountIds.add(expAccountId);
                            posCredit += expAmount; // Adding expenses so POS Treasury gets properly credited for them too
                        }
                    }
                    // Credit Surplus Account
                    if (variance > 0) {
                        surplusAmount = variance;
                        surplusAccountId = yield getOrCreatePosSurplusAccount(conn);
                        journalLines.push([
                            journalId, surplusAccountId, 'فائض إغلاق وردية', 0, surplusAmount, 'EGP', 1, 0, surplusAmount
                        ]);
                        posCredit -= surplusAmount; // Equals expectedCash
                    }
                    // Credit POS Treasury (should exactly equal expectedCash if accounted properly)
                    if (posCredit > 0) {
                        journalLines.push([
                            journalId, shift.treasuryId, 'خزينة نقطة البيع', 0, posCredit, 'EGP', 1, 0, posCredit
                        ]);
                    }
                    if (journalLines.length > 0 && (posCredit > 0 || surplusAmount > 0)) {
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [journalLines]);
                        const affectedAccountIds = new Set();
                        if (targetAccountId)
                            affectedAccountIds.add(targetAccountId);
                        if (shortageAccountId)
                            affectedAccountIds.add(shortageAccountId);
                        if (surplusAccountId)
                            affectedAccountIds.add(surplusAccountId);
                        if (shift.treasuryId)
                            affectedAccountIds.add(shift.treasuryId);
                        for (const expAccId of expenseAccountIds)
                            affectedAccountIds.add(expAccId);
                        yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, Array.from(affectedAccountIds));
                    }
                }
                else {
                    console.warn(`[POS] Could not resolve target account for shift close. Shift ID: ${shiftId}`);
                }
            }
            yield conn.query('COMMIT');
            // Get updated shift data (read-only, outside transaction)
            const [closedShifts] = yield conn.query(`SELECT s.*, u.name as userName, w.name as warehouseName
                 FROM pos_shifts s
                 LEFT JOIN users u ON s.userId = u.id
                 LEFT JOIN warehouses w ON s.warehouseId = w.id
                 WHERE s.id = ?`, [shiftId]);
            const closedShift = closedShifts[0];
            // emitEntityChanged('pos-shift', closedShift, userName);
            res.json({
                success: true,
                shift: closedShift,
                expectedCash,
                variance,
                varianceCard,
                heldOrdersPurged,
                varianceEscalated: isOverThreshold,
                message: variance === 0
                    ? 'تم إغلاق الوردية بنجاح - لا يوجد فرق'
                    : `تم إغلاق الوردية - فرق: ${variance > 0 ? '+' : ''}${variance.toFixed(2)}`
            });
        }
        catch (txError) {
            yield conn.query('ROLLBACK');
            throw txError;
        }
    }
    catch (error) {
        console.error('Error closing shift:', error);
        res.status(500).json({ error: error.message || 'حدث خطأ أثناء إغلاق الوردية' });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.closeShift = closeShift;
// ============================================
// SHIFT VALIDATION (مراجعة واعتماد الوردية)
// ============================================
/**
 * Validate (approve) a closed shift.
 * Only a manager/admin can transition CLOSED → VALIDATED.
 * POST /api/pos/shift/validate
 */
const validateShift = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId, notes } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown';
        if (!shiftId) {
            return res.status(400).json({ error: 'معرف الوردية مطلوب' });
        }
        // Verify shift exists and is PENDING_VALIDATION (only pending shifts can be validated)
        const [shifts] = yield conn.query(`SELECT status FROM pos_shifts WHERE id = ?`, [shiftId]);
        if (shifts.length === 0) {
            return res.status(404).json({ error: 'الوردية غير موجودة' });
        }
        const shiftStatus = shifts[0].status;
        if (shiftStatus !== 'PENDING_VALIDATION' && shiftStatus !== 'CLOSED') {
            return res.status(400).json({ error: 'لا يمكن اعتماد هذه الوردية، يجب أن تكون مغلقة أولاً' });
        }
        const [shiftsDetails] = yield conn.query(`SELECT s.*, u.name as userName, w.name as warehouseName
             FROM pos_shifts s
             LEFT JOIN users u ON s.userId = u.id
             LEFT JOIN warehouses w ON s.warehouseId = w.id
             WHERE s.id = ?`, [shiftId]);
        if (shifts.length === 0) {
            return res.status(404).json({ error: 'الوردية غير موجودة' });
        }
        const shift = shifts[0];
        if (shift.status === 'OPEN') {
            return res.status(400).json({
                error: 'لا يمكن اعتماد وردية مفتوحة — يجب إغلاقها أولاً',
                code: 'SHIFT_STILL_OPEN'
            });
        }
        if (shift.status === 'VALIDATED') {
            return res.status(400).json({
                error: 'تم اعتماد هذه الوردية بالفعل',
                code: 'ALREADY_VALIDATED'
            });
        }
        const now = (0, dateUtils_1.getEgyptianISOString)();
        // Transition to VALIDATED
        yield conn.query(`UPDATE pos_shifts 
             SET status = 'VALIDATED', validatedBy = ?, validatedAt = ?, validationNotes = ?, updatedAt = ?
             WHERE id = ?`, [userId, now, notes || null, now, shiftId]);
        // Return the updated shift with validator info
        let validated;
        try {
            [validated] = yield conn.query(`SELECT s.*, 
                        u.name as userName, w.name as warehouseName,
                        v.name as validatedByName
                 FROM pos_shifts s
                 LEFT JOIN users u ON s.userId = u.id
                 LEFT JOIN warehouses w ON s.warehouseId = w.id
                 LEFT JOIN users v ON s.validatedBy = v.id
                 WHERE s.id = ?`, [shiftId]);
        }
        catch (_c) {
            // validatedBy column may not exist — fall back without validator join
            [validated] = yield conn.query(`SELECT s.*, u.name as userName, w.name as warehouseName
                 FROM pos_shifts s
                 LEFT JOIN users u ON s.userId = u.id
                 LEFT JOIN warehouses w ON s.warehouseId = w.id
                 WHERE s.id = ?`, [shiftId]);
        }
        res.json({
            success: true,
            shift: validated[0],
            message: `تم اعتماد الوردية بنجاح بواسطة ${userName}`
        });
    }
    catch (error) {
        console.error('Error validating shift:', error);
        res.status(500).json({ error: error.message || 'حدث خطأ أثناء اعتماد الوردية' });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.validateShift = validateShift;
/**
 * POST /api/pos/shift/unvalidate
 * Admin-only: Reverts a VALIDATED shift back to PENDING_VALIDATION.
 */
const unvalidateShift = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId, notes } = req.body;
        const userName = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown';
        if (!shiftId) {
            return res.status(400).json({ error: 'معرف الوردية مطلوب' });
        }
        const [shifts] = yield conn.query(`SELECT status FROM pos_shifts WHERE id = ?`, [shiftId]);
        if (shifts.length === 0) {
            return res.status(404).json({ error: 'الوردية غير موجودة' });
        }
        const shift = shifts[0];
        if (shift.status !== 'VALIDATED') {
            return res.status(400).json({
                error: 'هذه الوردية ليست معتمدة، لا يمكن إلغاء اعتمادها.',
                code: 'NOT_VALIDATED'
            });
        }
        const now = (0, dateUtils_1.getEgyptianISOString)();
        // Change status back to PENDING_VALIDATION, log the un-validation note in validationNotes
        yield conn.query('START TRANSACTION');
        yield conn.query(`UPDATE pos_shifts 
             SET status = 'PENDING_VALIDATION', 
                 approvalStatus = 'pending',
                 validationNotes = CONCAT(COALESCE(validationNotes, ''), '\\n[', ?, '] ', ?), 
                 updatedAt = ?
             WHERE id = ?`, [now, notes ? `إلغاء اعتماد: ${notes}` : 'تم إلغاء الاعتماد', now, shiftId]);
        // Delete any closing/approval journals
        const [oldJournals] = yield conn.query(`SELECT id FROM journal_entries WHERE referenceId = ? AND description LIKE ?`, [shiftId, '%إغلاق وردية%']);
        if (oldJournals.length > 0) {
            const oldJournalIds = oldJournals.map((j) => j.id);
            const [oldLines] = yield conn.query(`SELECT accountId FROM journal_lines WHERE journalId IN (?)`, [oldJournalIds]);
            const oldAccountIds = oldLines.map((r) => r.accountId).filter((id) => id);
            yield conn.query(`DELETE FROM journal_lines WHERE journalId IN (?)`, [oldJournalIds]);
            yield conn.query(`DELETE FROM journal_entries WHERE id IN (?)`, [oldJournalIds]);
            if (oldAccountIds.length > 0) {
                yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, Array.from(new Set(oldAccountIds)));
            }
        }
        yield conn.query('COMMIT');
        res.json({
            success: true,
            message: `تم إلغاء اعتماد الوردية بنجاح بواسطة ${userName}`
        });
    }
    catch (error) {
        if (conn)
            yield conn.query('ROLLBACK');
        console.error('[POS] unvalidateShift error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.unvalidateShift = unvalidateShift;
/**
 * POST /api/pos/shift/reopen
 * Admin/Manager: Reverts a CLOSED or PENDING_VALIDATION shift back to OPEN.
 */
const reopenShift = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId, notes } = req.body;
        const userName = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown';
        if (!shiftId) {
            return res.status(400).json({ error: 'معرف الوردية مطلوب' });
        }
        const [shifts] = yield conn.query(`SELECT status FROM pos_shifts WHERE id = ?`, [shiftId]);
        if (shifts.length === 0) {
            return res.status(404).json({ error: 'الوردية غير موجودة' });
        }
        const shift = shifts[0];
        if (shift.status === 'OPEN') {
            return res.status(400).json({
                error: 'هذه الوردية مفتوحة بالفعل.',
                code: 'ALREADY_OPEN'
            });
        }
        if (shift.status === 'VALIDATED') {
            return res.status(400).json({
                error: 'الوردية معتمدة بالفعل. يجب إلغاء الاعتماد أولاً لفتحها.',
                code: 'SHIFT_VALIDATED'
            });
        }
        const now = (0, dateUtils_1.getEgyptianISOString)();
        yield conn.query('START TRANSACTION');
        yield conn.query(`UPDATE pos_shifts 
             SET status = 'OPEN',
                 closedAt = NULL,
                 closingCash = NULL,
                 expectedCash = NULL,
                 variance = NULL,
                 closingCard = NULL,
                 expectedCard = NULL,
                 varianceCard = NULL,
                 approvalStatus = 'pending',
                 notes = CONCAT(COALESCE(notes, ''), '\\n[', ?, '] ', ?), 
                 updatedAt = ?
             WHERE id = ?`, [now, notes ? `إعادة فتح الوردية: ${notes}` : 'تم إعادة فتح الوردية', now, shiftId]);
        // Delete any closing/approval journals
        const [oldJournals] = yield conn.query(`SELECT id FROM journal_entries WHERE referenceId = ? AND description LIKE ?`, [shiftId, '%إغلاق وردية%']);
        if (oldJournals.length > 0) {
            const oldJournalIds = oldJournals.map((j) => j.id);
            const [oldLines] = yield conn.query(`SELECT accountId FROM journal_lines WHERE journalId IN (?)`, [oldJournalIds]);
            const oldAccountIds = oldLines.map((r) => r.accountId).filter((id) => id);
            yield conn.query(`DELETE FROM journal_lines WHERE journalId IN (?)`, [oldJournalIds]);
            yield conn.query(`DELETE FROM journal_entries WHERE id IN (?)`, [oldJournalIds]);
            if (oldAccountIds.length > 0) {
                yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, Array.from(new Set(oldAccountIds)));
            }
        }
        yield conn.query('COMMIT');
        res.json({
            success: true,
            message: `تمت إعادة فتح الوردية بنجاح بواسطة ${userName}`
        });
    }
    catch (error) {
        if (conn)
            yield conn.query('ROLLBACK');
        console.error('[POS] reopenShift error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.reopenShift = reopenShift;
/**
 * Delete a shift.
 * A shift can only be deleted if it has NO cash movements.
 * DELETE /api/pos/sessions/:id
 */
const deleteShift = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        // Check if there are any cash movements
        const [movements] = yield conn.query(`SELECT COUNT(*) as cnt FROM pos_cash_movements WHERE shiftId = ?`, [id]);
        if (movements[0].cnt > 0) {
            return res.status(400).json({
                error: 'لا يمكن حذف وردية تحتوي على حركات مالية'
            });
        }
        yield conn.query(`DELETE FROM pos_shifts WHERE id = ?`, [id]);
        res.json({
            success: true,
            message: 'تم حذف الوردية بنجاح'
        });
    }
    catch (error) {
        console.error('Error deleting shift:', error);
        res.status(500).json({ error: error.message || 'حدث خطأ أثناء حذف الوردية' });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.deleteShift = deleteShift;
// ============================================
// CASH DRAWER OPERATIONS
// ============================================
/**
 * Add a cash movement (deposit/withdrawal)
 * POST /api/pos/cash-movement
 */
const addCashMovement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId, type, amount, description } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown';
        if (!shiftId || !type || amount === undefined) {
            return res.status(400).json({ error: 'البيانات غير مكتملة' });
        }
        if (!['DEPOSIT', 'WITHDRAWAL'].includes(type)) {
            return res.status(400).json({ error: 'نوع الحركة غير صالح' });
        }
        // Verify shift is open
        const [shifts] = yield conn.query(`SELECT id FROM pos_shifts WHERE id = ? AND status = 'OPEN'`, [shiftId]);
        if (shifts.length === 0) {
            return res.status(400).json({ error: 'الوردية غير مفتوحة' });
        }
        const movementId = (0, crypto_1.randomUUID)();
        const now = (0, dateUtils_1.getEgyptianISOString)();
        yield conn.query(`INSERT INTO pos_cash_movements (id, shiftId, type, amount, paymentMethod, description, approvedBy, createdAt)
             VALUES (?, ?, ?, ?, 'CASH', ?, ?, ?)`, [movementId, shiftId, type, amount, description || null, userId, now]);
        const movement = {
            id: movementId,
            shiftId,
            type,
            amount,
            paymentMethod: 'CASH',
            description,
            approvedBy: userId,
            approvedByName: userName,
            createdAt: now
        };
        // emitEntityChanged('pos-cash-movement', movement, userName);
        res.json({
            success: true,
            movement,
            message: type === 'DEPOSIT' ? 'تم الإيداع بنجاح' : 'تم السحب بنجاح'
        });
    }
    catch (error) {
        console.error('Error adding cash movement:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.addCashMovement = addCashMovement;
/**
 * Get cash movements for a shift
 * GET /api/pos/shift/:shiftId/movements
 */
const getShiftMovements = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId } = req.params;
        const [movements] = yield conn.query(`SELECT m.*, u.name as approvedByName
             FROM pos_cash_movements m
             LEFT JOIN users u ON m.approvedBy = u.id
             WHERE m.shiftId = ?`, [shiftId]);
        const combinedMovements = [...movements].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        res.json({ movements: combinedMovements });
    }
    catch (error) {
        console.error('Error getting shift movements:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getShiftMovements = getShiftMovements;
// ============================================
// POS SALE OPERATIONS
// ============================================
/**
 * Process a POS sale
 * POST /api/pos/sale
 */
const processPOSSale = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId, customerId, customerName, items, subtotal, discount, discountType, taxAmount, total, paymentMethod, payments, // Split payment: Array<{ method, amount }>
        cashTendered, bankAccountId, salesmanId, notes, printReceipt, loyaltyRedeem, // { pointsToRedeem, discountAmount } from loyalty widget
        shippingFee, // Sum of shipping charges (مصاريف شحن)
        adminToken, // For trade-ins and discount overrides
        globalDiscount, globalDiscountType, } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown';
        if (!shiftId || !items || items.length === 0 || total === undefined || total === null) {
            console.error('POS Sale validation failed:', { shiftId, itemsLength: items === null || items === void 0 ? void 0 : items.length, total });
            return res.status(400).json({
                error: 'البيانات غير مكتملة',
                details: !shiftId ? 'Missing shiftId' : !items ? 'Missing items' : items.length === 0 ? 'Empty items' : 'Missing total'
            });
        }
        // Validate admin token if there are negative quantities (trade-ins)
        const hasNegativeQty = items.some((i) => Number(i.quantity) < 0);
        if (hasNegativeQty) {
            if (!adminToken) {
                return res.status(401).json({ error: 'مطلوب إذن مدير للقيام بهذه العملية (مرتجع/مبادلة)' });
            }
            try {
                const jwtMod = yield Promise.resolve().then(() => __importStar(require('jsonwebtoken')));
                const jwt = jwtMod.default || jwtMod;
                const secret = process.env.JWT_SECRET || 'pos_admin_secret';
                jwt.verify(adminToken, secret);
            }
            catch (err) {
                console.error("Admin token verification failed:", err);
                return res.status(401).json({ error: 'إذن المدير غير صالح أو منتهي الصلاحية' });
            }
        }
        // Verify shift is open
        const [shifts] = yield conn.query(`SELECT * FROM pos_shifts WHERE id = ? AND status = 'OPEN'`, [shiftId]);
        if (shifts.length === 0) {
            return res.status(400).json({ error: 'الوردية غير مفتوحة' });
        }
        const shift = shifts[0];
        const now = (0, dateUtils_1.getEgyptianISOString)();
        // Get effective warehouseId - use shift's warehouse or fallback to first available
        let effectiveWarehouseId = shift.warehouseId;
        if (!effectiveWarehouseId) {
            const [defaultWh] = yield conn.query('SELECT id FROM warehouses ORDER BY name LIMIT 1');
            effectiveWarehouseId = ((_c = defaultWh[0]) === null || _c === void 0 ? void 0 : _c.id) || null;
            if (effectiveWarehouseId) {
                console.log(`⚠️ POS shift has no warehouse - using default: ${effectiveWarehouseId}`);
            }
        }
        // === SYSTEM POLICY VALIDATION (PRE-TRANSACTION) ===
        const authReq = req;
        const currentUserRole = authReq.user ? authReq.user.role : undefined;
        const systemConfig = authReq.systemConfig;
        if (systemConfig && (currentUserRole === null || currentUserRole === void 0 ? void 0 : currentUserRole.toUpperCase()) !== 'MASTER_ADMIN') {
            const context = {
                type: 'INVOICE_SALE',
                date: now,
                total,
                partnerId: customerId,
                notes: notes || 'مبيعات نقاط البيع',
                warehouseId: effectiveWarehouseId,
                createdBy: userName,
                currentUser: userName,
                currentUserRole,
                lines: items.map((i) => ({
                    productId: i.productId,
                    quantity: i.quantity,
                    cost: i.cost
                }))
            };
            // Note: Not passing `conn` here because we haven't started a transaction yet.
            // validateNegativeStock will create its own temporary connection or we can just rely on the existing explicit blocks below.
            const validationResult = yield (0, policyEnforcement_1.validateTransactionFull)(context, systemConfig);
            if (!validationResult.valid) {
                conn.release();
                return res.status(403).json({ error: validationResult.error, errorCode: validationResult.errorCode });
            }
        }
        // === BEGIN TRANSACTION ===
        // All sale operations must succeed or fail atomically
        yield conn.query('START TRANSACTION');
        try {
            // Create the invoice via the existing invoice system
            // This integrates with the ERP's accounting and inventory
            const invoiceId = (0, crypto_1.randomUUID)();
            // Generate robust sequential POS invoice number (e.g. POS-00001)
            const invoiceNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, 'POS-');
            // Prepare invoice lines — SERVER-SIDE RECOMPUTATION
            // Never trust frontend totals. Recompute every line using integer piasters.
            const toPiasters = (n) => Math.round((n || 0) * 100);
            const fromPiasters = (p) => p / 100;
            const invoiceLines = items.map((item) => {
                const qty = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                // The frontend sends the discount value (either fixed amount or percentage) in `item.discount`
                const discountVal = Number(item.discount) || 0;
                const discountType = item.discountType || 'FIXED';
                // Recompute line total in piasters
                const grossP = Math.round(toPiasters(price) * qty);
                const discountP = discountType === 'PERCENT'
                    ? Math.round((grossP * discountVal) / 100)
                    : toPiasters(discountVal);
                const recomputedTotalP = Math.max(0, grossP - discountP);
                const recomputedTotal = fromPiasters(recomputedTotalP);
                return {
                    productId: item.productId,
                    variantId: item.variantId || null,
                    productName: item.productName,
                    quantity: qty,
                    price,
                    cost: Number(item.cost) || 0,
                    discount: discountType === 'PERCENT' ? fromPiasters(discountP) : discountVal,
                    discountValue: discountType === 'PERCENT' ? discountVal : 0,
                    discountType,
                    total: recomputedTotal,
                    unitId: item.unitId,
                    unitName: item.unitName,
                    conversionFactor: item.conversionFactor || 1,
                    baseQuantity: item.baseQuantity || (qty * (item.conversionFactor || 1)),
                    warrantyMonths: item.warrantyMonths || 0,
                };
            });
            // Recompute invoice total from recomputed line totals
            const recomputedSubtotalP = invoiceLines.reduce((s, l) => s + toPiasters(l.total), 0);
            const globalDiscountP = (globalDiscountType === 'PERCENT')
                ? Math.round((recomputedSubtotalP * (globalDiscount || 0)) / 100)
                : toPiasters(globalDiscount || 0);
            const afterDiscountP = Math.max(0, recomputedSubtotalP - globalDiscountP);
            // Shipping is added after discount, before tax (matches frontend cart engine)
            const shippingFeeP = toPiasters(shippingFee || 0);
            const afterShippingP = afterDiscountP + shippingFeeP;
            const recomputedTaxP = Math.round((afterShippingP * (taxAmount || 0)) / (afterShippingP > 0 ? (afterShippingP + (taxAmount ? toPiasters(taxAmount) : 0)) : 1) || 0);
            const recomputedTotalP = afterShippingP + toPiasters(taxAmount || 0);
            // Validate frontend total against server recomputation (1 piaster tolerance)
            const frontendTotalP = toPiasters(total);
            if (Math.abs(recomputedTotalP - frontendTotalP) > 1) {
                console.warn(`⚠️ POS total mismatch: frontend=${fromPiasters(frontendTotalP)}, server=${fromPiasters(recomputedTotalP)}, diff=${fromPiasters(Math.abs(recomputedTotalP - frontendTotalP))}`);
            }
            // Use server-recomputed total as the authoritative value
            const serverTotal = fromPiasters(recomputedTotalP);
            const serverSubtotal = fromPiasters(recomputedSubtotalP);
            // Determine payment method(s)
            // Support both single paymentMethod and split payments array
            let resolvedPayments = payments && Array.isArray(payments)
                ? payments
                : [{ method: paymentMethod || 'CASH', amount: total }];
            // Handle overpayment (change given)
            // Deduct change from the cash payment split so that the drawer balance matches reality
            const totalPaid = resolvedPayments.reduce((sum, p) => sum + p.amount, 0);
            const changeAmount = Math.max(0, totalPaid - serverTotal);
            if (changeAmount > 0) {
                const cashSplit = resolvedPayments.find(p => p.method === 'CASH' || p.method === 'TREASURY');
                if (cashSplit && cashSplit.amount >= changeAmount) {
                    cashSplit.amount = parseFloat((cashSplit.amount - changeAmount).toFixed(2));
                }
                else {
                    // Fallback if no valid cash split exists but change is owed
                    resolvedPayments.push({
                        method: 'CASH',
                        amount: -changeAmount,
                        accountName: 'نقدي (باقي)',
                    });
                }
            }
            // Primary payment method for the invoice record.
            // DEFERRED overrides all others: any deferred portion creates a receivable,
            // and buildInvAggSQL + PartnerStatement exclude CASH invoices from balance tracking.
            // Without this, a mixed payment (500 cash + 500 deferred) would store 'CASH'
            // when cash >= deferred, hiding the invoice from partner statements entirely.
            const hasDeferredSplit = resolvedPayments.some(p => p.method === 'DEFERRED');
            const primaryPaymentMethod = hasDeferredSplit
                ? 'DEFERRED'
                : resolvedPayments.length > 0
                    ? resolvedPayments.reduce((a, b) => b.amount > a.amount ? b : a).method
                    : 'DEFERRED';
            // Insert invoice
            yield conn.query(`INSERT INTO invoices (
                    id, number, date, type, partnerId, partnerName, 
                    total, status, paymentMethod, posted, notes,
                    taxAmount, globalDiscount, globalDiscountType,
                    warehouseId, createdBy, posShiftId, isPOSSale,
                    bankAccountId, salesmanId, shippingFee
                ) VALUES (?, ?, ?, 'INVOICE_SALE', ?, ?, ?, 'POSTED', ?, 1, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`, [
                invoiceId, invoiceNumber, now,
                customerId || null, customerName || 'عميل نقدي',
                serverTotal, primaryPaymentMethod, notes || null,
                taxAmount || 0, globalDiscount || 0, globalDiscountType || 'FIXED',
                shift.warehouseId, userName, shiftId,
                bankAccountId || null, salesmanId || null,
                shippingFee || 0
            ]);
            // Insert invoice lines
            // (effectiveWarehouseId has been determined above Policy Validation)
            // === PERF: BATCH STOCK VALIDATION (1 query instead of N) ===
            // Only validate if negative stock is NOT allowed globally
            if (effectiveWarehouseId && (!systemConfig || !systemConfig.allowNegativeStock)) {
                // Bypass stock validation for CUSTOM_TRADE_IN
                const normalLines = invoiceLines.filter((l) => !l.variantId && l.tradeInAction !== 'CUSTOM_TRADE_IN');
                const variantLines = invoiceLines.filter((l) => l.variantId && l.tradeInAction !== 'CUSTOM_TRADE_IN');
                const insufficientItems = [];
                if (normalLines.length > 0) {
                    const productIds = normalLines.map((l) => l.productId);
                    const [stockRows] = yield conn.query(`SELECT productId, stock FROM product_stocks WHERE productId IN (?) AND warehouseId = ?`, [productIds, effectiveWarehouseId]);
                    const stockMap = new Map(stockRows.map(r => [r.productId, Number(r.stock)]));
                    for (const line of normalLines) {
                        if (line.baseQuantity <= 0)
                            continue; // Skip returns
                        const currentStock = stockMap.get(line.productId) || 0;
                        if (currentStock < line.baseQuantity) {
                            insufficientItems.push({
                                productName: line.productName,
                                requested: line.baseQuantity,
                                available: currentStock
                            });
                        }
                    }
                }
                if (variantLines.length > 0) {
                    const variantIds = variantLines.map((l) => l.variantId);
                    const [vStockRows] = yield conn.query(`
                        SELECT 
                          pv.id AS variantId,
                          COALESCE(pvs.stock, 
                            CASE 
                              WHEN (SELECT COUNT(*) FROM product_variant_stocks pvs2 WHERE pvs2.variantId = pv.id) = 0 THEN pv.stock
                              ELSE 0 
                            END
                          ) AS stock
                        FROM product_variants pv
                        LEFT JOIN product_variant_stocks pvs ON pv.id = pvs.variantId AND pvs.warehouseId = ?
                        WHERE pv.id IN (?)
                    `, [effectiveWarehouseId, variantIds]);
                    const vStockMap = new Map(vStockRows.map(r => [r.variantId, Number(r.stock)]));
                    for (const line of variantLines) {
                        if (line.baseQuantity <= 0)
                            continue; // Skip returns
                        const currentStock = vStockMap.get(line.variantId) || 0;
                        if (currentStock < line.baseQuantity) {
                            insufficientItems.push({
                                productName: line.productName,
                                requested: line.baseQuantity,
                                available: currentStock
                            });
                        }
                    }
                }
                if (insufficientItems.length > 0) {
                    yield conn.query('ROLLBACK');
                    return res.status(400).json({
                        error: 'كمية غير كافية في المخزون',
                        insufficientItems
                    });
                }
            }
            // === PERF: BATCH INSERT invoice_lines (1 query instead of N) ===
            const lineValues = invoiceLines.map((line) => [
                invoiceId, line.productId, line.productName,
                line.quantity, line.price, line.cost,
                line.discount, line.discountType || 'FIXED', line.total,
                line.unitId || null, line.unitName || null,
                line.conversionFactor, line.baseQuantity,
                effectiveWarehouseId, line.variantId || null,
                line.serials && line.serials.length > 0 ? JSON.stringify(line.serials) : null
            ]);
            yield conn.query(`INSERT INTO invoice_lines (
                    invoiceId, productId, productName, quantity, price, cost,
                    discount, discountType, total, unitId, unitName, conversionFactor, baseQuantity, warehouseId, variantId, serials
                ) VALUES ?`, [lineValues]);
            // === PERF: BATCH stock updates ===
            if (effectiveWarehouseId) {
                // 1. Update warehouse-level stock (sequential due to WHERE clause)
                const stockUpdateLines = invoiceLines.filter((l) => l.tradeInAction !== 'CUSTOM_TRADE_IN');
                // SORT BY PRODUCT ID TO PREVENT DEADLOCKS
                const sortedLines = [...stockUpdateLines].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));
                for (const line of sortedLines) {
                    yield conn.query(`UPDATE product_stocks 
                         SET stock = stock - ?
                         WHERE productId = ? AND warehouseId = ?`, [line.baseQuantity, line.productId, effectiveWarehouseId]);
                    // Update variant-specific warehouse stock and global stock if it's a variant
                    if (line.variantId) {
                        // Only UPDATE existing rows — don't INSERT new ones with negative values.
                        // If no pvs row exists, the stock query falls back to product_variants.stock (global),
                        // which we deduct below.
                        yield conn.query(`UPDATE product_variant_stocks 
                             SET stock = stock - ?
                             WHERE variantId = ? AND warehouseId = ?`, [line.baseQuantity, line.variantId, effectiveWarehouseId]);
                        yield conn.query(`UPDATE product_variants 
                             SET stock = stock - ?
                             WHERE id = ?`, [line.baseQuantity, line.variantId]);
                    }
                }
                // 2. BATCH global product stock update (CASE WHEN — 1 query for all items)
                const productStockMap = new Map();
                for (const line of stockUpdateLines) {
                    productStockMap.set(line.productId, (productStockMap.get(line.productId) || 0) + line.baseQuantity);
                }
                if (productStockMap.size > 0) {
                    const cases = [];
                    const caseParams = [];
                    const productIds = [];
                    for (const [productId, totalQty] of productStockMap) {
                        cases.push('WHEN id = ? THEN ROUND(stock - ?, 5)');
                        caseParams.push(productId, totalQty);
                        productIds.push(productId);
                    }
                    yield conn.query(`UPDATE products SET stock = CASE ${cases.join(' ')} ELSE stock END WHERE id IN (?)`, [...caseParams, productIds]);
                }
                // 3. BATCH INSERT stock movements for audit trail
                // Mirrors the refund pattern — ensures stock balance reports
                // in "historical mode" correctly reflect POS sale deductions
                const saleMovementValues = stockUpdateLines.map((line) => [
                    line.productId,
                    effectiveWarehouseId,
                    -(line.baseQuantity),
                    'SALE', 'INVOICE_SALE',
                    invoiceId,
                    line.cost, // Include unit_cost for audit parity
                    `POS Sale ${invoiceNumber}`,
                    now,
                    line.variantId || null
                ]);
                if (saleMovementValues.length > 0) {
                    yield conn.query(`
                        INSERT INTO stock_movements (
                            product_id, warehouse_id, qty_change, movement_type,
                            reference_type, reference_id, unit_cost, notes, movement_date, variant_id
                        ) VALUES ?
                    `, [saleMovementValues]);
                }
            }
            // Record cash movements for each payment method
            for (const payment of resolvedPayments) {
                const movementId = (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO pos_cash_movements (id, shiftId, type, amount, paymentMethod, description, referenceId, referenceType, createdAt)
                     VALUES (?, ?, 'SALE', ?, ?, ?, ?, 'INVOICE', ?)`, [movementId, shiftId, payment.amount, payment.method, payment.reference || null, invoiceId, now]);
            }
            // Update shift totals
            yield conn.query(`UPDATE pos_shifts 
                 SET totalSales = totalSales + ?, salesCount = salesCount + 1, updatedAt = ?
                 WHERE id = ?`, [serverTotal, now, shiftId]);
            // ═══════════════════════════════════════════════════════════════════
            // AUTO-POST REVENUE/COGS JOURNAL ENTRY (ATOMIC — failure rolls back sale)
            // POS sales bypass createInvoice, so we must call this directly.
            // No try/catch: if this fails the entire TX is rolled back.
            // ═══════════════════════════════════════════════════════════════════
            const isCashInvoice = primaryPaymentMethod === 'CASH' || primaryPaymentMethod === 'TREASURY';
            // For revenue, we only care about the sale of actual products, not the trade-in deductions
            const customTradeInLines = invoiceLines.filter((l) => l.tradeInAction === 'CUSTOM_TRADE_IN');
            const customTradeInTotal = Math.abs(customTradeInLines.reduce((sum, l) => sum + l.total, 0));
            const revenueTotal = Number((serverTotal + customTradeInTotal).toFixed(2));
            yield (0, invoiceController_1.syncRevenueCogsJournal)(conn, invoiceId, invoiceNumber, 'INVOICE_SALE', now, customerName || 'عميل نقدي', revenueTotal, invoiceLines, userName, false, isCashInvoice, 0, (0, branchFilter_1.resolveBranchIdForWrite)(req));
            console.log(`📒 [POS] Revenue/COGS journal created for POS invoice ${invoiceNumber}`);
            // ═══════════════════════════════════════════════════════════════════
            // TRADE-IN COMPENSATING JOURNAL ENTRY
            // ═══════════════════════════════════════════════════════════════════
            // We already have customTradeInLines and customTradeInTotal from above
            if (customTradeInTotal > 0) {
                // Find Trade-In Expense account, fallback to general expenses
                let [expenseAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%مبادلة%' AND code LIKE '5%' LIMIT 1`);
                if (expenseAccRows.length === 0) {
                    [expenseAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '5%' LIMIT 1`);
                }
                const expenseAccount = expenseAccRows[0];
                // Find Partner (Receivables) account to credit
                let [partnerAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '104%' LIMIT 1`);
                if (partnerAccRows.length === 0) {
                    [partnerAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%عملاء%' LIMIT 1`);
                }
                const partnerAccount = partnerAccRows[0];
                if (expenseAccount && partnerAccount) {
                    const tradeInJournalId = (0, crypto_1.randomUUID)();
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate)
                         VALUES (?, ?, ?, ?, ?, 'EGP', 1)`, [
                        tradeInJournalId, now,
                        `تسوية مبادلة منتج (POS) #${invoiceNumber} - ${customerName || 'عميل نقدي'}`,
                        invoiceId, userName
                    ]);
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [[
                            [tradeInJournalId, expenseAccount.id, expenseAccount.name, customTradeInTotal, 0, 'EGP', 1, customTradeInTotal, 0],
                            [tradeInJournalId, partnerAccount.id, partnerAccount.name, 0, customTradeInTotal, 'EGP', 1, 0, customTradeInTotal]
                        ]]);
                    const balResult = yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, [expenseAccount.id, partnerAccount.id]);
                    console.log(`📒 [POS] Trade-In compensating journal created: Dr Expense, Cr Receivables for ${customTradeInTotal}`);
                }
            }
            // ═══════════════════════════════════════════════════════════════════
            // TREASURY JOURNAL ENTRY (يومية الخزينة) — ATOMIC
            // For each payment method, create Dr/Cr entries so the payment
            // shows up in the Treasury ledger. This mirrors createInvoice logic.
            // No try/catch: if this fails the entire TX is rolled back.
            // ═══════════════════════════════════════════════════════════════════
            const affectedAccountIds = [];
            // Resolve partner (receivables) account once — same for all splits
            let [partnerAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '104%' LIMIT 1`);
            if (partnerAccRows.length === 0) {
                [partnerAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%عملاء%' LIMIT 1`);
            }
            const partnerAccount = partnerAccRows[0];
            for (const payment of resolvedPayments) {
                if (payment.amount === 0)
                    continue;
                const treasuryJournalId = (0, crypto_1.randomUUID)();
                // ── Resolve payment GL account ────────────────────────────
                // Priority 1: accountId explicitly provided by the payment modal
                // Priority 2: legacy code-based lookup (backward compat)
                let paymentAccount = null;
                if (payment.accountId) {
                    const [direct] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [payment.accountId]);
                    if (direct.length > 0) {
                        paymentAccount = direct[0];
                    }
                }
                if (!paymentAccount) {
                    // If it's a cash payment, ALWAYS default to the shift's treasury
                    if ((payment.method === 'CASH' || payment.method === 'TREASURY') && shift.treasuryId) {
                        const [treasuryRows] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [shift.treasuryId]);
                        if (treasuryRows.length > 0) {
                            paymentAccount = treasuryRows[0];
                        }
                    }
                    // Legacy fallback: branch-aware treasury resolution
                    if (!paymentAccount) {
                        if (payment.method === 'CASH' || payment.method === 'TREASURY') {
                            paymentAccount = yield (0, branchFilter_1.resolveBranchCashAccount)(conn, req);
                        }
                        else {
                            // BANK / CHEQUE fallback
                            let code = payment.method === 'BANK' ? '102%' : '106%';
                            let nameFallback = payment.method === 'BANK' ? '%بنك%' : '%أوراق قبض%';
                            let [fallbackRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [code]);
                            if (fallbackRows.length === 0) {
                                [fallbackRows] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [nameFallback]);
                            }
                            paymentAccount = fallbackRows[0] || null;
                        }
                    }
                }
                if (!paymentAccount || !partnerAccount) {
                    console.warn(`⚠️ [POS] Could not resolve GL account for payment split (${payment.method}, accountId=${payment.accountId})`);
                    continue;
                }
                // Use accountName from the modal if provided, else fall back to GL name
                const methodLabel = payment.accountName || paymentAccount.name;
                // Build description with reference if provided
                const refSuffix = payment.reference ? ` [مرجع: ${payment.reference}]` : '';
                const absAmount = Math.abs(payment.amount);
                const isPayout = payment.amount < 0;
                // Journal Header
                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate)
                     VALUES (?, ?, ?, ?, ?, 'EGP', 1)`, [
                    treasuryJournalId, now,
                    isPayout
                        ? `مدفوعات خارجة (Payout) #${invoiceNumber} - ${customerName || 'عميل نقدي'} (${methodLabel})${refSuffix}`
                        : `متحصلات (POS) #${invoiceNumber} - ${customerName || 'عميل نقدي'} (${methodLabel})${refSuffix}`,
                    invoiceId, userName
                ]);
                const drAccount = isPayout ? partnerAccount : paymentAccount;
                const crAccount = isPayout ? paymentAccount : partnerAccount;
                const feePortion = (!isPayout && payment.applyFee) ? (Number(payment.feeTotal) || 0) : 0;
                const principalPortion = absAmount - feePortion;
                const journalLines = [
                    [treasuryJournalId, drAccount.id, drAccount.name, absAmount, 0, 'EGP', 1, absAmount, 0]
                ];
                if (feePortion > 0) {
                    journalLines.push([treasuryJournalId, crAccount.id, crAccount.name, 0, principalPortion, 'EGP', 1, 0, principalPortion]);
                    let [feeRevAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE type = 'REVENUE' AND subType = 'OTHER_REVENUE' LIMIT 1`);
                    let feeRevenueAccount = feeRevAccRows[0];
                    if (!feeRevenueAccount) {
                        const feeAccountId = (0, crypto_1.randomUUID)();
                        const feeAccountCode = `4099${Math.floor(Math.random() * 1000)}`;
                        const feeAccountName = 'إيرادات رسوم بنكية وإضافية';
                        yield conn.query(`INSERT INTO accounts (id, code, name, type, subType, balance, openingBalance) VALUES (?, ?, ?, 'REVENUE', 'OTHER_REVENUE', 0, 0)`, [feeAccountId, feeAccountCode, feeAccountName]);
                        feeRevenueAccount = { id: feeAccountId, name: feeAccountName };
                    }
                    journalLines.push([treasuryJournalId, feeRevenueAccount.id, feeRevenueAccount.name, 0, feePortion, 'EGP', 1, 0, feePortion]);
                    if (!affectedAccountIds.includes(feeRevenueAccount.id))
                        affectedAccountIds.push(feeRevenueAccount.id);
                }
                else {
                    journalLines.push([treasuryJournalId, crAccount.id, crAccount.name, 0, absAmount, 'EGP', 1, 0, absAmount]);
                }
                // Journal Lines: Dr Payment Account (treasury/bank), Cr Receivables (flipped for payout)
                yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [journalLines]);
                if (!affectedAccountIds.includes(paymentAccount.id))
                    affectedAccountIds.push(paymentAccount.id);
                if (!affectedAccountIds.includes(partnerAccount.id))
                    affectedAccountIds.push(partnerAccount.id);
                console.log(`📒 [POS] Treasury journal: ${methodLabel} ${payment.amount} → account ${paymentAccount.name} for ${invoiceNumber}`);
            }
            if (affectedAccountIds.length > 0) {
                const balResult = yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, affectedAccountIds);
                if (balResult.updatedCount > 0) {
                    console.log(`✅ [POS] Updated ${balResult.updatedCount} account balances`);
                }
            }
            // ═══════════════════════════════════════════════════════════════════
            // BANK FEE JOURNAL ENTRIES (رسوم بنكية)
            // For each payment split where applyFee=true and feeTotal > 0,
            // create a journal entry:  Dr Bank Charges Expense  /  Cr Payment Account (Bank/Cash)
            // The customer pays invoice + fee, so the bank receives total+fee,
            // and the fee portion is booked as a bank charges expense.
            // ═══════════════════════════════════════════════════════════════════
            const feePayments = resolvedPayments.filter((p) => p.applyFee && p.feeTotal > 0);
            if (feePayments.length > 0) {
                // Find or create a "Bank Charges" expense account
                let [chargesAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE (name LIKE '%مصاريف بنكية%' OR name LIKE '%عمولات بنكية%' OR name LIKE '%bank charges%') AND type = 'EXPENSE' LIMIT 1`);
                let bankChargesAccount = chargesAccRows[0];
                if (!bankChargesAccount) {
                    // Auto-create the expense account
                    const [maxCodeRows] = yield conn.query("SELECT MAX(CAST(code AS UNSIGNED)) as maxCode FROM accounts WHERE code REGEXP '^[0-9]+$' AND code LIKE '5%'");
                    const maxCode = Number((_d = maxCodeRows[0]) === null || _d === void 0 ? void 0 : _d.maxCode) || 50100;
                    const feeAccountCode = (maxCode + 1).toString();
                    const feeAccountId = (0, crypto_1.randomUUID)();
                    yield conn.query(`INSERT INTO accounts (id, code, name, type, subType, balance, openingBalance) VALUES (?, ?, ?, 'EXPENSE', 'OPERATING_EXPENSE', 0, 0)`, [feeAccountId, feeAccountCode, 'مصاريف بنكية']);
                    bankChargesAccount = { id: feeAccountId, name: 'مصاريف بنكية' };
                    console.log(`🏦 [POS] Auto-created Bank Charges account: ${feeAccountCode}`);
                }
                for (const payment of feePayments) {
                    const feeJournalId = (0, crypto_1.randomUUID)();
                    const feeBeforeTax = Number(payment.fee) || 0;
                    const feeTax = Number(payment.feeTax) || 0;
                    const feeTotal = Number(payment.feeTotal) || 0;
                    if (feeTotal <= 0)
                        continue;
                    // Resolve the payment GL account (same logic as treasury journal above)
                    let feePaymentAccount = null;
                    if (payment.accountId) {
                        const [direct] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [payment.accountId]);
                        if (direct.length > 0)
                            feePaymentAccount = direct[0];
                    }
                    if (!feePaymentAccount)
                        continue;
                    const feeMethodLabel = payment.accountName || feePaymentAccount.name;
                    // Journal Header
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate)
                         VALUES (?, ?, ?, ?, ?, 'EGP', 1)`, [
                        feeJournalId, now,
                        `رسوم بنكية (POS) #${invoiceNumber} - ${feeMethodLabel} (${feeBeforeTax}${feeTax > 0 ? ` + ضريبة ${feeTax}` : ''})`,
                        invoiceId, userName
                    ]);
                    // Journal Lines: Dr Bank Charges Expense, Cr Payment Account (customer paid)
                    const feeLines = [
                        [feeJournalId, bankChargesAccount.id, bankChargesAccount.name, feeBeforeTax, 0, 'EGP', 1, feeBeforeTax, 0],
                        [feeJournalId, feePaymentAccount.id, feePaymentAccount.name, 0, feeTotal, 'EGP', 1, 0, feeTotal],
                    ];
                    // If there's fee tax, debit a tax account too
                    if (feeTax > 0) {
                        let [taxAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE (name LIKE '%ضريبة%' OR name LIKE '%VAT%') AND type = 'LIABILITY' LIMIT 1`);
                        const taxAccount = taxAccRows[0];
                        if (taxAccount) {
                            // Adjust: bank charges gets feeBeforeTax, tax liability gets feeTax
                            feeLines.push([feeJournalId, taxAccount.id, taxAccount.name, feeTax, 0, 'EGP', 1, feeTax, 0]);
                            // Fix the credit side — payment account credited for feeTotal already
                        }
                    }
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [feeLines]);
                    if (!affectedAccountIds.includes(bankChargesAccount.id))
                        affectedAccountIds.push(bankChargesAccount.id);
                    if (!affectedAccountIds.includes(feePaymentAccount.id))
                        affectedAccountIds.push(feePaymentAccount.id);
                    console.log(`💰 [POS] Bank fee journal: ${feeTotal} for ${feeMethodLabel} on ${invoiceNumber}`);
                }
                // Update balances for fee-affected accounts
                if (affectedAccountIds.length > 0) {
                    yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, affectedAccountIds);
                }
            }
            // ═══════════════════════════════════════════════════════════════════
            // TRADE-IN SCRAP / WRITE-OFF
            // Items returned (qty < 0) with tradeInAction = 'WRITE_OFF'
            // are considered scrapped. We reverse the stock addition and book scrap expense.
            // ═══════════════════════════════════════════════════════════════════
            const writeOffItems = items.filter((i) => Number(i.quantity) < 0 && i.tradeInAction === 'WRITE_OFF');
            if (writeOffItems.length > 0) {
                // 1. Resolve 'Scrap Expense' account
                let [scrapAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE (name LIKE '%خردة%' OR name LIKE '%إهلاك%' OR name LIKE '%تالف%') AND type = 'EXPENSE' LIMIT 1`);
                let scrapAccount = scrapAccRows[0];
                if (!scrapAccount) {
                    const [maxCodeRows] = yield conn.query("SELECT MAX(CAST(code AS UNSIGNED)) as maxCode FROM accounts WHERE code REGEXP '^[0-9]+$' AND code LIKE '5%'");
                    const maxCode = Number((_e = maxCodeRows[0]) === null || _e === void 0 ? void 0 : _e.maxCode) || 50100;
                    const scrapAccountId = (0, crypto_1.randomUUID)();
                    yield conn.query(`INSERT INTO accounts (id, code, name, type, subType, balance, openingBalance) VALUES (?, ?, ?, 'EXPENSE', 'OPERATING_EXPENSE', 0, 0)`, [scrapAccountId, (maxCode + 1).toString(), 'إهلاك بضاعة']);
                    scrapAccount = { id: scrapAccountId, name: 'إهلاك بضاعة' };
                }
                // 2. Resolve 'Inventory Asset' account
                let [inventoryAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%مخزون%' AND type = 'ASSET' LIMIT 1`);
                let inventoryAccount = inventoryAccRows[0];
                if (!inventoryAccount) {
                    const [maxCodeRows] = yield conn.query("SELECT MAX(CAST(code AS UNSIGNED)) as maxCode FROM accounts WHERE code REGEXP '^[0-9]+$' AND code LIKE '103%'");
                    const maxCode = Number((_f = maxCodeRows[0]) === null || _f === void 0 ? void 0 : _f.maxCode) || 10300;
                    const invAccountId = (0, crypto_1.randomUUID)();
                    yield conn.query(`INSERT INTO accounts (id, code, name, type, subType, balance, openingBalance) VALUES (?, ?, ?, 'ASSET', 'CURRENT_ASSET', 0, 0)`, [invAccountId, (maxCode + 1).toString(), 'مخزون بضاعة']);
                    inventoryAccount = { id: invAccountId, name: 'مخزون بضاعة' };
                }
                const scrapJournalId = (0, crypto_1.randomUUID)();
                let totalScrapCost = 0;
                // SORT BY PRODUCT ID TO PREVENT DEADLOCKS
                const sortedWriteOffItems = [...writeOffItems].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));
                for (const item of sortedWriteOffItems) {
                    const scrapQty = Math.abs(Number(item.quantity)); // Positive value for the deduction amount
                    // Average Cost logic
                    let [costRows] = yield conn.query(`SELECT avgCost, cost FROM products WHERE id = ?`, [item.productId]);
                    let itemCost = Number((_g = costRows[0]) === null || _g === void 0 ? void 0 : _g.avgCost) || Number((_h = costRows[0]) === null || _h === void 0 ? void 0 : _h.cost) || 0;
                    // Fall back to item.price if average cost is 0
                    if (itemCost <= 0)
                        itemCost = Number(item.price);
                    const baseScrapQty = scrapQty * (item.conversionFactor || 1);
                    const lineScrapCost = itemCost * baseScrapQty;
                    totalScrapCost += lineScrapCost;
                    // Deduct stock (it was added by POS generic logic, we deduct it here)
                    if (item.variantId) {
                        yield conn.query(`UPDATE product_variant_stocks SET stock = stock - ? WHERE variantId = ? AND warehouseId = ?`, [baseScrapQty, item.variantId, effectiveWarehouseId]);
                        yield conn.query(`UPDATE product_variants SET stock = stock - ? WHERE id = ?`, [baseScrapQty, item.variantId]);
                    }
                    else {
                        yield conn.query(`UPDATE product_stocks SET stock = stock - ? WHERE productId = ? AND warehouseId = ?`, [baseScrapQty, item.productId, effectiveWarehouseId]);
                    }
                    // Deduct global product stock
                    yield conn.query(`UPDATE products SET stock = stock - ? WHERE id = ?`, [baseScrapQty, item.productId]);
                    // Log stock movement
                    yield conn.query(`INSERT INTO stock_movements (product_id, variant_id, warehouse_id, movement_type, qty_change, reference_type, reference_id, unit_cost, notes, created_by)
                         VALUES (?, ?, ?, 'ADJUSTMENT', ?, 'INVOICE', ?, ?, ?, ?)`, [
                        item.productId, item.variantId || null, effectiveWarehouseId,
                        -baseScrapQty, // negative because we're removing it
                        invoiceId, itemCost, `إهلاك بضاعة مرتجعة تالفة (POS #${invoiceNumber})`, userName
                    ]);
                }
                if (totalScrapCost > 0) {
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate)
                         VALUES (?, ?, ?, ?, ?, 'EGP', 1)`, [scrapJournalId, now, `إهلاك مرتجعات (POS) #${invoiceNumber}`, invoiceId, userName]);
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [[
                            [scrapJournalId, scrapAccount.id, scrapAccount.name, totalScrapCost, 0, 'EGP', 1, totalScrapCost, 0],
                            [scrapJournalId, inventoryAccount.id, inventoryAccount.name, 0, totalScrapCost, 'EGP', 1, 0, totalScrapCost]
                        ]]);
                    yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, [scrapAccount.id, inventoryAccount.id]);
                    console.log(`🗑️ [POS] Scrap journal: ${totalScrapCost} for write-off items on ${invoiceNumber}`);
                }
            }
            // === LOYALTY: Record REDEEM within transaction (atomic) ===
            let loyaltyRedeemSuccess = false;
            if (loyaltyRedeem && customerId && loyaltyRedeem.pointsToRedeem > 0) {
                loyaltyRedeemSuccess = yield (0, loyaltyController_1.recordLoyaltyRedeem)(conn, customerId, invoiceId, loyaltyRedeem.pointsToRedeem, loyaltyRedeem.discountAmount, userName);
            }
            // === COMMIT TRANSACTION ===
            yield conn.query('COMMIT');
            // === LOYALTY: Record EARN after commit (non-fatal) ===
            let loyaltyResult = null;
            try {
                if (customerId) {
                    const loyaltyDiscount = loyaltyRedeemSuccess ? ((loyaltyRedeem === null || loyaltyRedeem === void 0 ? void 0 : loyaltyRedeem.discountAmount) || 0) : 0;
                    loyaltyResult = yield (0, loyaltyController_1.recordLoyaltyEarn)(conn, customerId, invoiceId, total, userName, items);
                }
            }
            catch (loyaltyErr) {
                console.error('Non-fatal loyalty error:', loyaltyErr);
                // DO NOT throw. Allow the response to send.
            }
            // Calculate change (cash portion only)
            const cashPayment = resolvedPayments.find(p => p.method === 'CASH');
            const changeGiven = cashPayment && cashTendered
                ? cashTendered - cashPayment.amount
                : 0;
            // Enrich lines with warranty expiry dates from product card
            const enrichedLines = invoiceLines.map((line) => {
                const wMonths = line.warrantyMonths || 0;
                if (wMonths <= 0)
                    return line;
                const expiryDate = new Date(now);
                expiryDate.setMonth(expiryDate.getMonth() + wMonths);
                return Object.assign(Object.assign({}, line), { warrantyMonths: wMonths, warrantyExpiry: expiryDate.toISOString().slice(0, 10) });
            });
            const invoice = {
                id: invoiceId,
                number: invoiceNumber,
                date: now,
                type: 'INVOICE_SALE',
                partnerId: customerId,
                partnerName: customerName || 'عميل نقدي',
                lines: enrichedLines,
                total: serverTotal,
                subtotal: serverSubtotal,
                discount,
                taxAmount,
                status: 'POSTED',
                paymentMethod: primaryPaymentMethod,
                payments: resolvedPayments,
                posted: true,
                isPOSSale: true,
                posShiftId: shiftId,
                shippingFee: shippingFee || 0
            };
            // emitEntityChanged('invoice', invoice, userName);
            res.json({
                success: true,
                invoice,
                cashTendered,
                changeGiven,
                printReceipt,
                loyalty: loyaltyResult ? {
                    pointsEarned: loyaltyResult.pointsEarned,
                    newBalance: loyaltyResult.newBalance,
                    redeemed: loyaltyRedeemSuccess ? loyaltyRedeem === null || loyaltyRedeem === void 0 ? void 0 : loyaltyRedeem.pointsToRedeem : 0,
                } : null,
                message: 'تم البيع بنجاح'
            });
        }
        catch (txError) {
            // === ROLLBACK on any failure ===
            yield conn.query('ROLLBACK');
            throw txError;
        }
    }
    catch (error) {
        console.error('Error processing POS sale:', error);
        res.status(500).json({ error: error.message || 'حدث خطأ أثناء البيع' });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.processPOSSale = processPOSSale;
// ============================================
// POS REPORTS
// ============================================
/**
 * Get shift report (X/Z Report)
 * GET /api/pos/shift/:shiftId/report
 */
const getShiftReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId } = req.params;
        // Get shift details
        const [shifts] = yield conn.query(`SELECT s.*, u.name as userName, w.name as warehouseName
             FROM pos_shifts s
             LEFT JOIN users u ON s.userId = u.id
             LEFT JOIN warehouses w ON s.warehouseId = w.id
             WHERE s.id = ?`, [shiftId]);
        if (shifts.length === 0) {
            return res.status(404).json({ error: 'الوردية غير موجودة' });
        }
        const shift = shifts[0];
        // Get cash movements
        const [movements] = yield conn.query(`SELECT m.*, u.name as approvedByName
             FROM pos_cash_movements m
             LEFT JOIN users u ON m.approvedBy = u.id
             WHERE m.shiftId = ?`, [shiftId]);
        const combinedMovements = [...movements].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        // Get sales by payment method
        const [salesByMethod] = yield conn.query(`SELECT 
                paymentMethod,
                SUM(amount) as total,
                COUNT(*) as count
             FROM pos_cash_movements
             WHERE shiftId = ? AND type = 'SALE'
             GROUP BY paymentMethod`, [shiftId]);
        // Get top selling products
        const [topProducts] = yield conn.query(`SELECT 
                il.productId,
                il.productName,
                SUM(il.quantity) as quantity,
                SUM(il.total) as revenue
             FROM invoices i
             JOIN invoice_lines il ON i.id = il.invoiceId
             WHERE i.posShiftId = ? AND i.type = 'INVOICE_SALE'
             GROUP BY il.productId, il.productName
             ORDER BY revenue DESC
             LIMIT 10`, [shiftId]);
        const [expenseRows] = yield conn.query(`SELECT SUM(amount) as totalExpenses FROM pos_expenses WHERE shiftId = ?`, [shiftId]);
        const shiftExpenses = parseFloat(((_a = expenseRows[0]) === null || _a === void 0 ? void 0 : _a.totalExpenses) || 0);
        // Recalculate expected cash on the fly for the report
        const [expectedCashMovements] = yield conn.query(`SELECT 
                SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE 0 END) as deposits,
                SUM(CASE WHEN type = 'WITHDRAWAL' THEN amount ELSE 0 END) as withdrawals,
                SUM(CASE WHEN type = 'SALE' AND paymentMethod IN ('CASH', 'TREASURY') THEN amount ELSE 0 END) as cashSales,
                SUM(CASE WHEN type = 'SALE' AND paymentMethod IN ('BANK', 'BANK_ACCOUNT') THEN amount ELSE 0 END) as bankSales,
                SUM(CASE WHEN type = 'REFUND' AND paymentMethod IN ('CASH', 'TREASURY') THEN amount ELSE 0 END) as cashRefunds,
                SUM(CASE WHEN type = 'REFUND' AND paymentMethod IN ('BANK', 'BANK_ACCOUNT') THEN amount ELSE 0 END) as bankRefunds
             FROM pos_cash_movements
             WHERE shiftId = ?`, [shiftId]);
        const movData = expectedCashMovements[0];
        const computedExpectedCash = parseFloat(shift.adminOpeningAmount || 0) +
            parseFloat((movData === null || movData === void 0 ? void 0 : movData.deposits) || 0) +
            parseFloat((movData === null || movData === void 0 ? void 0 : movData.cashSales) || 0) -
            parseFloat((movData === null || movData === void 0 ? void 0 : movData.withdrawals) || 0) -
            parseFloat((movData === null || movData === void 0 ? void 0 : movData.cashRefunds) || 0) - shiftExpenses;
        const computedExpectedCard = parseFloat((movData === null || movData === void 0 ? void 0 : movData.bankSales) || 0) - parseFloat((movData === null || movData === void 0 ? void 0 : movData.bankRefunds) || 0);
        // Calculate totals
        const cashSales = ((_b = salesByMethod.find(m => m.paymentMethod === 'CASH' || m.paymentMethod === 'TREASURY')) === null || _b === void 0 ? void 0 : _b.total) || 0;
        const bankSales = ((_c = salesByMethod.find(m => m.paymentMethod === 'BANK' || m.paymentMethod === 'BANK_ACCOUNT')) === null || _c === void 0 ? void 0 : _c.total) || 0;
        const chequeSales = ((_d = salesByMethod.find(m => m.paymentMethod === 'CHEQUE')) === null || _d === void 0 ? void 0 : _d.total) || 0;
        const report = {
            shift: Object.assign(Object.assign({}, shift), { expectedCash: computedExpectedCash, expectedCard: computedExpectedCard, closedAt: shift.closedAt || null, duration: shift.closedAt
                    ? Math.round((new Date(shift.closedAt).getTime() - new Date(shift.openedAt).getTime()) / 60000)
                    : Math.round((new Date().getTime() - new Date(shift.openedAt).getTime()) / 60000) }),
            cashMovements: combinedMovements,
            salesByPaymentMethod: {
                cash: parseFloat(cashSales),
                bank: parseFloat(bankSales),
                cheque: parseFloat(chequeSales),
                total: parseFloat(cashSales) + parseFloat(bankSales) + parseFloat(chequeSales)
            },
            topProducts
        };
        res.json(report);
    }
    catch (error) {
        console.error('Error getting shift report:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getShiftReport = getShiftReport;
/**
 * Consolidated POS report data — replaces client-side estimation.
 * GET /api/pos/reports/summary?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 */
const getReportSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { dateFrom, dateTo } = req.query;
        if (!dateFrom || !dateTo) {
            return res.status(400).json({ error: 'dateFrom and dateTo are required' });
        }
        const baseWhere = `i.type = 'INVOICE_SALE' AND i.isPOSSale = 1 AND i.status != 'VOID' AND DATE(i.date) BETWEEN ? AND ?`;
        const dateParams = [dateFrom, dateTo];
        // 1. Totals (from invoices) + payment method breakdown (from pos_cash_movements)
        const [totalsRows] = yield conn.query(`SELECT
                COUNT(*) AS totalTransactions,
                COALESCE(SUM(i.total), 0) AS totalSales,
                COALESCE(SUM(i.globalDiscount), 0) AS totalDiscounts
             FROM invoices i WHERE ${baseWhere}`, dateParams);
        const t = totalsRows[0] || {};
        const totalSales = parseFloat(t.totalSales || 0);
        const totalTransactions = parseInt(t.totalTransactions || 0);
        // Payment splits live in pos_cash_movements — NOT invoices.paymentMethod
        const [paymentRows] = yield conn.query(`SELECT
                pcm.paymentMethod,
                COALESCE(SUM(pcm.amount), 0) AS total
             FROM pos_cash_movements pcm
             JOIN invoices i ON pcm.referenceId = i.id
             WHERE pcm.type = 'SALE'
               AND ${baseWhere}
             GROUP BY pcm.paymentMethod`, dateParams);
        let cashSales = 0, bankSales = 0, otherSales = 0;
        for (const pr of paymentRows) {
            const amt = parseFloat(pr.total || 0);
            if (pr.paymentMethod === 'CASH' || pr.paymentMethod === 'TREASURY')
                cashSales += amt;
            else if (pr.paymentMethod === 'BANK' || pr.paymentMethod === 'BANK_ACCOUNT')
                bankSales += amt;
            else
                otherSales += amt;
        }
        // Fallback to invoice totals when no cash movements exist (legacy data)
        if (cashSales === 0 && bankSales === 0 && otherSales === 0 && totalSales > 0) {
            const [legacyRows] = yield conn.query(`SELECT
                    COALESCE(SUM(CASE WHEN i.paymentMethod IN ('CASH', 'TREASURY') THEN i.total ELSE 0 END), 0) AS cashSales,
                    COALESCE(SUM(CASE WHEN i.paymentMethod IN ('BANK', 'BANK_ACCOUNT') THEN i.total ELSE 0 END), 0) AS bankSales,
                    COALESCE(SUM(CASE WHEN i.paymentMethod NOT IN ('CASH','BANK') THEN i.total ELSE 0 END), 0) AS otherSales
                 FROM invoices i WHERE ${baseWhere}`, dateParams);
            const lr = legacyRows[0] || {};
            cashSales = parseFloat(lr.cashSales || 0);
            bankSales = parseFloat(lr.bankSales || 0);
            otherSales = parseFloat(lr.otherSales || 0);
        }
        // 2. Period-over-period growth (same duration before the selected range)
        const daysDiff = Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1;
        const prevTo = new Date(dateFrom);
        prevTo.setDate(prevTo.getDate() - 1);
        const prevFrom = new Date(prevTo);
        prevFrom.setDate(prevFrom.getDate() - daysDiff + 1);
        const prevFromStr = prevFrom.toISOString().split('T')[0];
        const prevToStr = prevTo.toISOString().split('T')[0];
        const [prevRows] = yield conn.query(`SELECT COALESCE(SUM(i.total), 0) AS prevSales
             FROM invoices i WHERE ${baseWhere}`, [prevFromStr, prevToStr]);
        const prevSales = parseFloat(((_a = prevRows[0]) === null || _a === void 0 ? void 0 : _a.prevSales) || 0);
        const growthPercent = prevSales > 0 ? ((totalSales - prevSales) / prevSales) * 100 : 0;
        // 3. Daily breakdown with payment method split
        const [dailyRows] = yield conn.query(`SELECT
                DATE(i.date) AS day,
                COUNT(*) AS transactionCount,
                COALESCE(SUM(i.total), 0) AS totalSales,
                COALESCE(SUM(CASE WHEN i.paymentMethod IN ('CASH', 'TREASURY') THEN i.total ELSE 0 END), 0) AS legacyCashSales,
                COALESCE(SUM(CASE WHEN i.paymentMethod IN ('BANK', 'BANK_ACCOUNT') THEN i.total ELSE 0 END), 0) AS legacyBankSales
             FROM invoices i WHERE ${baseWhere}
             GROUP BY DATE(i.date) ORDER BY day DESC`, dateParams);
        const [dailyPaymentsRows] = yield conn.query(`SELECT
                DATE(i.date) AS day,
                pcm.paymentMethod,
                COALESCE(SUM(pcm.amount), 0) AS total
             FROM pos_cash_movements pcm
             JOIN invoices i ON pcm.referenceId = i.id
             WHERE pcm.type = 'SALE' AND ${baseWhere}
             GROUP BY DATE(i.date), pcm.paymentMethod`, dateParams);
        const dailyMap = new Map();
        for (const row of dailyRows) {
            const dateStr = row.day instanceof Date ? row.day.toISOString().split('T')[0] : row.day;
            dailyMap.set(dateStr, {
                day: dateStr,
                transactionCount: parseInt(row.transactionCount),
                totalSales: parseFloat(row.totalSales),
                cashSales: 0,
                bankSales: 0,
                _legacyCash: parseFloat(row.legacyCashSales),
                _legacyBank: parseFloat(row.legacyBankSales),
                _hasMovements: false
            });
        }
        for (const row of dailyPaymentsRows) {
            const dateStr = row.day instanceof Date ? row.day.toISOString().split('T')[0] : row.day;
            if (dailyMap.has(dateStr)) {
                const entry = dailyMap.get(dateStr);
                entry._hasMovements = true;
                if (row.paymentMethod === 'CASH' || row.paymentMethod === 'TREASURY')
                    entry.cashSales += parseFloat(row.total);
                else if (row.paymentMethod === 'BANK' || row.paymentMethod === 'BANK_ACCOUNT')
                    entry.bankSales += parseFloat(row.total);
            }
        }
        // Apply fallback for days with absolutely no cash movements
        const processedDailyRows = Array.from(dailyMap.values()).map(entry => {
            if (!entry._hasMovements && entry.totalSales > 0) {
                entry.cashSales = entry._legacyCash;
                entry.bankSales = entry._legacyBank;
            }
            return entry;
        });
        // 4. Top 10 products by quantity (group by productId only to avoid split rows)
        const [topProductRows] = yield conn.query(`SELECT
                il.productId,
                MAX(il.productName) AS productName,
                SUM(il.quantity) AS totalQuantity,
                SUM(il.total) AS totalRevenue
             FROM invoice_lines il
             JOIN invoices i ON i.id = il.invoiceId
             WHERE ${baseWhere}
             GROUP BY il.productId
             ORDER BY totalQuantity DESC
             LIMIT 10`, dateParams);
        // 5. Cashier performance
        // UX-R07: createdBy may store username string, not user UUID — join on both
        const [cashierRows] = yield conn.query(`SELECT
                i.createdBy AS userId,
                COALESCE(u.name, u2.name, i.createdBy) AS userName,
                COUNT(*) AS transactionCount,
                COALESCE(SUM(i.total), 0) AS totalSales
             FROM invoices i
             LEFT JOIN users u ON i.createdBy = u.id
             LEFT JOIN users u2 ON i.createdBy = u2.username
             WHERE ${baseWhere}
             GROUP BY i.createdBy, COALESCE(u.name, u2.name, i.createdBy)
             ORDER BY totalSales DESC`, dateParams);
        // 6. Shifts count per cashier
        const [shiftCountRows] = yield conn.query(`SELECT userId, COUNT(*) AS shiftCount
             FROM pos_shifts
             WHERE DATE(openedAt) BETWEEN ? AND ?
             GROUP BY userId`, dateParams);
        const shiftCountMap = new Map();
        for (const row of shiftCountRows) {
            shiftCountMap.set(row.userId, parseInt(row.shiftCount));
        }
        const cashierPerformance = cashierRows.map((c) => ({
            userId: c.userId,
            userName: c.userName || c.userId || 'مستخدم',
            totalSales: parseFloat(c.totalSales),
            transactionCount: parseInt(c.transactionCount),
            averageTicket: parseInt(c.transactionCount) > 0 ? parseFloat(c.totalSales) / parseInt(c.transactionCount) : 0,
            shifts: shiftCountMap.get(c.userId) || 0,
        }));
        res.json({
            totals: {
                totalSales,
                totalTransactions,
                cashSales,
                bankSales,
                otherSales,
                totalDiscounts: parseFloat(t.totalDiscounts || 0),
                averageTicket: totalTransactions > 0 ? totalSales / totalTransactions : 0,
                growthPercent: Math.round(growthPercent * 10) / 10,
            },
            dailySummaries: processedDailyRows.map(d => ({
                date: d.day,
                totalSales: d.totalSales,
                transactionCount: d.transactionCount,
                cashSales: d.cashSales,
                bankSales: d.bankSales,
            })),
            topProducts: topProductRows.map((p) => ({
                productId: p.productId,
                productName: p.productName,
                quantity: parseFloat(p.totalQuantity),
                revenue: parseFloat(p.totalRevenue),
            })),
            cashierPerformance,
        });
    }
    catch (error) {
        console.error('Error getting report summary:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getReportSummary = getReportSummary;
/**
 * Get hourly sales breakdown for a date range
 * GET /api/pos/reports/hourly
 */
const getHourlySales = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { dateFrom, dateTo, warehouseId } = req.query;
        let whereClause = `i.type = 'INVOICE_SALE' AND i.isPOSSale = 1 AND i.status != 'VOID'`;
        const params = [];
        if (dateFrom) {
            whereClause += ' AND DATE(i.date) >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            whereClause += ' AND DATE(i.date) <= ?';
            params.push(dateTo);
        }
        if (warehouseId) {
            whereClause += ' AND i.warehouseId = ?';
            params.push(warehouseId);
        }
        const [hourlyStats] = yield conn.query(`SELECT 
                HOUR(i.date) as hour,
                COUNT(*) as count,
                SUM(i.total) as total
             FROM invoices i
             WHERE ${whereClause}
             GROUP BY HOUR(i.date)
             ORDER BY hour ASC`, params);
        // Fill in missing hours
        const result = Array.from({ length: 24 }, (_, i) => {
            const stat = hourlyStats.find(h => h.hour === i);
            return {
                hour: i,
                hourLabel: `${i.toString().padStart(2, '0')}:00`,
                count: stat ? stat.count : 0,
                total: stat ? stat.total : 0
            };
        });
        res.json({ hourlySales: result });
    }
    catch (error) {
        console.error('Error getting hourly sales:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getHourlySales = getHourlySales;
/**
 * Get all shifts with pagination
 * GET /api/pos/shifts
 */
const getShifts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const authReq = req;
        const { page = 1, limit = 20, userId, status, dateFrom, dateTo, search } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        let whereClause = '1=1';
        const params = [];
        // ═══════════════════════════════════════════
        // MANDATORY: Fiscal Year Hard Boundary
        // ═══════════════════════════════════════════
        if (authReq.fiscalYearFilter) {
            whereClause += ' AND DATE(s.openedAt) >= ? AND DATE(s.openedAt) <= ?';
            params.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        // BRANCH ISOLATION — non-privileged users see only their branch's shifts
        {
            const branchConditions = [];
            const branchParams = [];
            (0, branchFilter_1.appendBranchFilter)(branchConditions, branchParams, authReq, 's');
            if (branchConditions.length > 0) {
                whereClause += ' AND ' + branchConditions[0];
                params.push(...branchParams);
            }
        }
        if (userId) {
            whereClause += ' AND s.userId = ?';
            params.push(userId);
        }
        if (status) {
            whereClause += ' AND s.status = ?';
            params.push(status);
        }
        if (dateFrom) {
            whereClause += ' AND s.openedAt >= ?';
            params.push(String(dateFrom).length === 10 ? `${dateFrom} 00:00:00` : dateFrom);
        }
        if (dateTo) {
            whereClause += ' AND s.openedAt <= ?';
            params.push(String(dateTo).length === 10 ? `${dateTo} 23:59:59` : dateTo);
        }
        if (search) {
            whereClause += ' AND (u.name LIKE ? OR w.name LIKE ?)';
            const like = `%${search}%`;
            params.push(like, like);
        }
        let shifts;
        try {
            [shifts] = yield conn.query(`SELECT s.*, u.name as userName, w.name as warehouseName,
                        v.name as validatedByName,
                        def.name as shiftDefinitionName, dev.name as deviceName
                 FROM pos_shifts s
                 LEFT JOIN users u ON s.userId = u.id
                 LEFT JOIN warehouses w ON s.warehouseId = w.id
                 LEFT JOIN users v ON s.validatedBy = v.id
                 LEFT JOIN pos_shift_definitions def ON s.shiftDefinitionId = def.id
                 LEFT JOIN pos_devices dev ON s.deviceId = dev.id
                 WHERE ${whereClause}
                 ORDER BY s.openedAt DESC
                 LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
        }
        catch (_a) {
            // validatedBy column may not exist — fall back without validator join
            [shifts] = yield conn.query(`SELECT s.*, u.name as userName, w.name as warehouseName,
                        def.name as shiftDefinitionName, dev.name as deviceName
                 FROM pos_shifts s
                 LEFT JOIN users u ON s.userId = u.id
                 LEFT JOIN warehouses w ON s.warehouseId = w.id
                 LEFT JOIN pos_shift_definitions def ON s.shiftDefinitionId = def.id
                 LEFT JOIN pos_devices dev ON s.deviceId = dev.id
                 WHERE ${whereClause}
                 ORDER BY s.openedAt DESC
                 LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
        }
        const [countResult] = yield conn.query(`SELECT COUNT(*) as total FROM pos_shifts s WHERE ${whereClause}`, params);
        res.json({
            shifts,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: countResult[0].total,
                pages: Math.ceil(countResult[0].total / Number(limit))
            }
        });
    }
    catch (error) {
        console.error('Error getting shifts:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getShifts = getShifts;
// ============================================
// POS PRODUCTS (OPTIMIZED FOR POS)
// ============================================
/**
 * Get products optimized for POS display
 * GET /api/pos/products
 */
const getPOSProducts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { categoryId, search, limit = 5000, priceListId } = req.query;
        const userCtx = req.user;
        const userRole = ((userCtx === null || userCtx === void 0 ? void 0 : userCtx.role) || '').toUpperCase();
        const isPrivileged = ['ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN'].includes(userRole);
        // ── Branch isolation: warehouse is derived from JWT, not client param ──
        // Privileged roles may still pass an explicit warehouseId to override.
        const warehouseId = isPrivileged && req.query.warehouseId
            ? String(req.query.warehouseId)
            : ((userCtx === null || userCtx === void 0 ? void 0 : userCtx.defaultWarehouseId) || req.query.warehouseId);
        let whereClause = 'IFNULL(p.isActive, 1) = 1';
        const params = [];
        if (categoryId) {
            whereClause += ' AND p.categoryId = ?';
            params.push(categoryId);
        }
        if (search) {
            // Arabic-normalized tokenized search for POS products
            const arabicNorm = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${col}), 'أ','ا'), 'إ','ا'), 'آ','ا'), 'ة','ه'), 'ى','ي'), 'ؤ','و'), 'ئ','ي')`;
            const tokens = String(search).trim().split(/\s+/).filter(Boolean);
            if (tokens.length > 0) {
                const tokenConditions = tokens.map(() => {
                    return `( ${arabicNorm('COALESCE(p.name, "")')} LIKE ${arabicNorm('?')} OR ${arabicNorm('COALESCE(p.barcode, "")')} LIKE ${arabicNorm('?')} OR ${arabicNorm('COALESCE(p.sku, "")')} LIKE ${arabicNorm('?')} )`;
                });
                whereClause += ` AND (${tokenConditions.join(' AND ')})`;
                tokens.forEach(token => {
                    const tokenParam = `%${token}%`;
                    params.push(tokenParam, tokenParam, tokenParam);
                });
            }
        }
        // Build price expression — use price list override when priceListId is given
        const priceExpr = priceListId
            ? `COALESCE(NULLIF(pp.price, 0), p.price) AS price, p.price AS standardPrice, pp.price AS listPrice`
            : `p.price AS price, p.price AS standardPrice, NULL AS listPrice`;
        const priceJoin = priceListId
            ? `LEFT JOIN product_prices pp ON p.id = pp.productId AND pp.priceListId = ?`
            : '';
        // Build query params — priceListId goes FIRST (before warehouse join param)
        const joinParams = priceListId ? [priceListId] : [];
        const warehouseParam = warehouseId ? [warehouseId] : [];
        // Build safe optional-column fragments (only include columns that exist in this DB)
        const productCols = yield getProductCols(conn);
        const optionalCols = [
            safeCol(productCols, 'ceramicSize', 'ceramicSize'),
            safeCol(productCols, 'ceramicColor', 'ceramicColor'),
            safeCol(productCols, 'ceramicName', 'ceramicName'),
            safeCol(productCols, 'variantGroupId', 'variantGroupId'),
            safeCol(productCols, 'hasMultipleUnits', 'hasMultipleUnits'),
            safeCol(productCols, 'baseUnit', 'baseUnit'),
        ].join(',\n                ');
        // Build stock expression — single warehouse vs sum across all
        const stockExpr = warehouseId
            ? `COALESCE(ps.stock, 0) as stock`
            : `COALESCE((SELECT SUM(ps2.stock) FROM product_stocks ps2 WHERE ps2.productId = p.id), 0) as stock`;
        // Other-warehouse stock: how many units exist in warehouses OTHER than the current one
        const otherWarehouseStockExpr = warehouseId
            ? `COALESCE((SELECT SUM(ps3.stock) FROM product_stocks ps3 WHERE ps3.productId = p.id AND ps3.warehouseId != ? AND ps3.stock > 0), 0) AS otherWarehouseStock`
            : `0 AS otherWarehouseStock`;
        const stockJoin = warehouseId
            ? `LEFT JOIN product_stocks ps ON p.id = ps.productId AND ps.warehouseId = ?`
            : '';
        // Detect embedded variants (product_variants table) — safe subquery
        let embeddedVariantExpr = '0 AS embeddedVariantCount';
        try {
            const [pvCheck] = yield conn.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'product_variants' AND TABLE_SCHEMA = DATABASE() LIMIT 1`);
            if (pvCheck.length > 0) {
                embeddedVariantExpr = '(SELECT COUNT(*) FROM product_variants pv WHERE pv.productId = p.id AND pv.isActive = 1) AS embeddedVariantCount';
            }
        }
        catch ( /* table doesn't exist yet — fine */_a) { /* table doesn't exist yet — fine */ }
        const [products] = yield conn.query(`SELECT
                p.id, p.name, p.sku, p.barcode,
                ${priceExpr},
                p.cost,
                p.categoryId, c.name as categoryName,
                p.image,
                COALESCE(p.warrantyMonths, 0) AS warrantyMonths,
                ${optionalCols},
                ${embeddedVariantExpr},
                ${stockExpr},
                ${otherWarehouseStockExpr}
             FROM products p
             LEFT JOIN categories c ON p.categoryId = c.id
             ${priceJoin}
             ${stockJoin}
             WHERE ${whereClause}
             GROUP BY p.id
             ORDER BY p.name
             LIMIT ?`, [...joinParams, ...warehouseParam, ...warehouseParam, ...params, Number(limit)]);
        res.json({ products, priceListId: priceListId || null });
    }
    catch (error) {
        console.error('Error getting POS products:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getPOSProducts = getPOSProducts;
/**
 * Get all variant groups
 * GET /api/pos/variant-groups
 */
const getVariantGroups = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const [groups] = yield conn.query(`SELECT vg.*, COUNT(p.id) AS productCount
             FROM variant_groups vg
             LEFT JOIN products p ON p.variantGroupId = vg.id
             GROUP BY vg.id
             ORDER BY vg.name`);
        res.json({ groups });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getVariantGroups = getVariantGroups;
/**
 * Create a variant group
 * POST /api/pos/variant-groups
 * Body: { name: string, attributeKeys: string[] }
 */
const createVariantGroup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { name, attributeKeys = [] } = req.body;
        if (!(name === null || name === void 0 ? void 0 : name.trim()))
            return res.status(400).json({ error: 'اسم المجموعة مطلوب' });
        const groupId = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO variant_groups (id, name, attributeKeys) VALUES (?, ?, ?)`, [groupId, name.trim(), JSON.stringify(attributeKeys)]);
        res.status(201).json({ id: groupId, name: name.trim(), attributeKeys, productCount: 0 });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.createVariantGroup = createVariantGroup;
/**
 * Update variant group name / attribute keys
 * PUT /api/pos/variant-groups/:groupId
 */
const updateVariantGroup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { groupId } = req.params;
        const { name, attributeKeys } = req.body;
        const setClauses = [];
        const params = [];
        if (name !== undefined) {
            setClauses.push('name = ?');
            params.push(name.trim());
        }
        if (attributeKeys !== undefined) {
            setClauses.push('attributeKeys = ?');
            params.push(JSON.stringify(attributeKeys));
        }
        if (setClauses.length === 0)
            return res.status(400).json({ error: 'No fields to update' });
        params.push(groupId);
        yield conn.query(`UPDATE variant_groups SET ${setClauses.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.updateVariantGroup = updateVariantGroup;
/**
 * Assign a product to a variant group with its attribute values.
 * Pass attributes = null to remove the product from the group.
 * PATCH /api/pos/variant-groups/:groupId/product/:productId
 * Body: { attributes: Record<string,string> | null }
 */
const assignProductToVariantGroup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { groupId, productId } = req.params;
        const { attributes } = req.body;
        if (attributes === null || attributes === undefined) {
            yield conn.query(`UPDATE products SET variantGroupId = NULL, variantAttributes = NULL WHERE id = ?`, [productId]);
            return res.json({ success: true, action: 'removed' });
        }
        const [groups] = yield conn.query(`SELECT id FROM variant_groups WHERE id = ?`, [groupId]);
        if (groups.length === 0)
            return res.status(404).json({ error: 'مجموعة التشكيلات غير موجودة' });
        yield conn.query(`UPDATE products SET variantGroupId = ?, variantAttributes = ? WHERE id = ?`, [groupId, JSON.stringify(attributes), productId]);
        res.json({ success: true, action: 'assigned', groupId, productId, attributes });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.assignProductToVariantGroup = assignProductToVariantGroup;
/**
 * Get all products in a variant group with resolved attribute values
 * GET /api/pos/variant-groups/:groupId/products
 */
const getVariantGroupProducts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { groupId } = req.params;
        const { warehouseId, priceListId } = req.query;
        const priceExpr = priceListId
            ? `COALESCE(NULLIF(pp.price, 0), p.price) AS price`
            : `p.price AS price`;
        const priceJoin = priceListId
            ? `LEFT JOIN product_prices pp ON p.id = pp.productId AND pp.priceListId = ?`
            : '';
        const joinParams = priceListId ? [priceListId] : [];
        const [products] = yield conn.query(`SELECT p.id, p.name, p.sku, p.barcode, ${priceExpr}, p.cost, p.image,
                    p.variantGroupId, p.variantAttributes,
                    COALESCE(SUM(ps.stock), 0) AS stock
             FROM products p
             ${priceJoin}
             LEFT JOIN product_stocks ps ON p.id = ps.productId ${warehouseId ? 'AND ps.warehouseId = ?' : ''}
             WHERE p.variantGroupId = ?
             GROUP BY p.id
             ORDER BY p.name`, [...joinParams, ...(warehouseId ? [warehouseId] : []), groupId]);
        const [groupMeta] = yield conn.query(`SELECT * FROM variant_groups WHERE id = ?`, [groupId]);
        const group = groupMeta[0];
        if (!group)
            return res.status(404).json({ error: 'المجموعة غير موجودة' });
        const parseJson = (v) => { var _a; return (_a = (typeof v === 'string' ? JSON.parse(v) : v)) !== null && _a !== void 0 ? _a : {}; };
        res.json({
            group: Object.assign(Object.assign({}, group), { attributeKeys: parseJson(group.attributeKeys) }),
            products: products.map(p => (Object.assign(Object.assign({}, p), { variantAttributes: parseJson(p.variantAttributes) })))
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getVariantGroupProducts = getVariantGroupProducts;
/**
 * Delete a variant group. Unlinks all products first.
 * DELETE /api/pos/variant-groups/:groupId
 */
const deleteVariantGroup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { groupId } = req.params;
        // Unlink products from the group
        yield conn.query(`UPDATE products SET variantGroupId = NULL, variantAttributes = NULL WHERE variantGroupId = ?`, [groupId]);
        yield conn.query(`DELETE FROM variant_groups WHERE id = ?`, [groupId]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.deleteVariantGroup = deleteVariantGroup;
/**
 * Get the last POS order for a specific customer
 * GET /api/pos/customers/:customerId/last-order
 */
const getCustomerLastOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { customerId } = req.params;
        const [rows] = yield conn.query(`SELECT * FROM invoices 
             WHERE partnerId = ? AND isPos = 1 AND status != 'VOID'
             ORDER BY createdAt DESC LIMIT 1`, [customerId]);
        const invoice = rows[0];
        if (!invoice) {
            return res.json({ invoice: null });
        }
        // Fetch invoice items
        const [items] = yield conn.query(`SELECT i.*, p.name as productName, p.image as productImage
             FROM invoice_items i
             LEFT JOIN products p ON i.productId = p.id
             WHERE i.invoiceId = ?`, [invoice.id]);
        res.json({ invoice: Object.assign(Object.assign({}, invoice), { items }) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getCustomerLastOrder = getCustomerLastOrder;
/**
 * Get rich product detail for POS info popup

 * GET /api/pos/products/:id/detail
 * Returns: per-warehouse stock, 28-day / 7-day sold quantities, trend deltas, avg cost
 */
const getPOSProductDetail = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        // Per-warehouse stock breakdown
        const [stockRows] = yield conn.query(`SELECT ps.warehouseId, w.name AS warehouseName, ps.stock
             FROM product_stocks ps
             LEFT JOIN warehouses w ON ps.warehouseId = w.id
             WHERE ps.productId = ?`, [id]);
        // 28-day and prior-28-day sold quantities + 7-day and prior-7-day
        const [salesRows] = yield conn.query(`SELECT
                SUM(CASE WHEN il.saleDate >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)  THEN il.quantity ELSE 0 END) AS sold7,
                SUM(CASE WHEN il.saleDate >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
                          AND il.saleDate < DATE_SUB(CURDATE(), INTERVAL 7 DAY)  THEN il.quantity ELSE 0 END) AS sold7Prior,
                SUM(CASE WHEN il.saleDate >= DATE_SUB(CURDATE(), INTERVAL 28 DAY) THEN il.quantity ELSE 0 END) AS sold28,
                SUM(CASE WHEN il.saleDate >= DATE_SUB(CURDATE(), INTERVAL 56 DAY)
                          AND il.saleDate < DATE_SUB(CURDATE(), INTERVAL 28 DAY) THEN il.quantity ELSE 0 END) AS sold28Prior
             FROM (
                 SELECT il.quantity, DATE(i.date) AS saleDate
                 FROM invoice_lines il
                 JOIN invoices i ON il.invoiceId = i.id
                 WHERE il.productId = ?
                   AND i.type = 'INVOICE_SALE'
                   AND i.date >= DATE_SUB(CURDATE(), INTERVAL 56 DAY)
             ) il`, [id]);
        // Average cost from product
        const [productRow] = yield conn.query(`SELECT cost, stock FROM products WHERE id = ?`, [id]);
        const warehouseStocks = stockRows.map(r => ({
            warehouseId: r.warehouseId,
            warehouseName: r.warehouseName || r.warehouseId,
            stock: Number(r.stock),
        }));
        const totalStock = warehouseStocks.reduce((s, r) => s + r.stock, 0);
        const stats = salesRows[0] || {};
        const prod = productRow[0] || {};
        const sold7 = Number(stats.sold7 || 0);
        const sold7Prior = Number(stats.sold7Prior || 0);
        const sold28 = Number(stats.sold28 || 0);
        const sold28Prior = Number(stats.sold28Prior || 0);
        const calcDelta = (current, prior) => {
            if (prior === 0)
                return current > 0 ? 100 : 0;
            return Math.round(((current - prior) / prior) * 100);
        };
        res.json({
            totalStock: totalStock || Number(prod.stock || 0),
            warehouseStocks,
            sold28Days: sold28,
            sold7Days: sold7,
            delta28: calcDelta(sold28, sold28Prior),
            delta7: calcDelta(sold7, sold7Prior),
            avgCost: Number(prod.cost || 0),
        });
    }
    catch (error) {
        console.error('Error getting POS product detail:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getPOSProductDetail = getPOSProductDetail;
/**
 * Look up product by barcode
 * GET /api/pos/product/barcode/:barcode
 */
const getProductByBarcode = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { barcode } = req.params;
        const { warehouseId } = req.query;
        // First check main product barcode
        let [products] = yield conn.query(`SELECT 
                p.id, p.name, p.sku, p.barcode, p.price, p.cost,
                p.categoryId, p.hasMultipleUnits, p.baseUnit,
                COALESCE(ps.stock, 0) as stock,
                NULL as unitId, NULL as unitName, 1 as conversionFactor
             FROM products p
             LEFT JOIN product_stocks ps ON p.id = ps.productId ${warehouseId ? 'AND ps.warehouseId = ?' : ''}
             WHERE p.barcode = ?
             LIMIT 1`, warehouseId ? [warehouseId, barcode] : [barcode]);
        // If not found, check product unit barcodes
        if (products.length === 0) {
            [products] = yield conn.query(`SELECT 
                    p.id, p.name, p.sku, pu.barcode, pu.salePrice as price, p.cost,
                    p.categoryId, p.hasMultipleUnits, p.baseUnit,
                    COALESCE(ps.stock, 0) as stock,
                    pu.id as unitId, pu.unitName, pu.conversionFactor
                 FROM product_units pu
                 JOIN products p ON pu.productId = p.id
                 LEFT JOIN product_stocks ps ON p.id = ps.productId ${warehouseId ? 'AND ps.warehouseId = ?' : ''}
                 WHERE pu.barcode = ?
                 LIMIT 1`, warehouseId ? [warehouseId, barcode] : [barcode]);
        }
        if (products.length === 0) {
            return res.status(404).json({ error: 'المنتج غير موجود' });
        }
        res.json({ product: products[0] });
    }
    catch (error) {
        console.error('Error getting product by barcode:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getProductByBarcode = getProductByBarcode;
// ============================================
// HELD ORDERS
// ============================================
/**
 * Hold an order for later
 * POST /api/pos/hold
 */
const holdOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId, customerId, customerName, items, holdNote } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!shiftId || !items || items.length === 0) {
            return res.status(400).json({ error: 'البيانات غير مكتملة' });
        }
        const holdId = (0, crypto_1.randomUUID)();
        const now = (0, dateUtils_1.getEgyptianISOString)();
        yield conn.query(`INSERT INTO pos_held_orders (id, shiftId, userId, customerId, customerName, orderData, holdNote, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [holdId, shiftId, userId, customerId || null, customerName || null, JSON.stringify(items), holdNote || null, now]);
        res.json({
            success: true,
            holdId,
            message: 'تم تعليق الطلب بنجاح'
        });
    }
    catch (error) {
        console.error('Error holding order:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.holdOrder = holdOrder;
/**
 * Get held orders for a shift
 * GET /api/pos/held/:shiftId
 */
const getHeldOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId } = req.params;
        const [orders] = yield conn.query(`SELECT *, JSON_UNQUOTE(orderData) as orderData
             FROM pos_held_orders
             WHERE shiftId = ?
             ORDER BY createdAt DESC`, [shiftId]);
        // Parse orderData JSON
        const parsedOrders = orders.map(order => (Object.assign(Object.assign({}, order), { items: JSON.parse(order.orderData) })));
        res.json({ heldOrders: parsedOrders });
    }
    catch (error) {
        console.error('Error getting held orders:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getHeldOrders = getHeldOrders;
/**
 * Recall a held order
 * DELETE /api/pos/held/:holdId
 */
const recallHeldOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { holdId } = req.params;
        const [orders] = yield conn.query(`SELECT *, JSON_UNQUOTE(orderData) as orderData
             FROM pos_held_orders
             WHERE id = ?`, [holdId]);
        if (orders.length === 0) {
            return res.status(404).json({ error: 'الطلب غير موجود' });
        }
        const order = orders[0];
        // Delete the held order
        yield conn.query(`DELETE FROM pos_held_orders WHERE id = ?`, [holdId]);
        res.json({
            success: true,
            order: Object.assign(Object.assign({}, order), { items: JSON.parse(order.orderData) }),
            message: 'تم استرجاع الطلب'
        });
    }
    catch (error) {
        console.error('Error recalling held order:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.recallHeldOrder = recallHeldOrder;
// ============================================
// RETURNS / REFUNDS
// ============================================
/**
 * Get recent POS sales for refund lookup
 * GET /api/pos/recent-sales?limit=20
 */
const getRecentPOSSales = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const shiftId = req.query.shiftId;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const invCols = yield getInvoiceCols(conn);
        const safeCols = ['id', 'number', 'date', 'partnerName', 'paymentMethod', 'createdBy']
            .filter(c => invCols.has(c))
            .join(', ');
        const totalCol = invCols.has('total') ? ', total' : ', 0 AS total';
        const isPOSFilter = invCols.has('isPOSSale') ? 'isPOSSale = 1 AND' : '';
        let userFilter = '';
        const params = [];
        if (shiftId) {
            userFilter = 'posShiftId = ? AND';
            params.push(shiftId);
        }
        else if (userId) {
            userFilter = 'createdBy = ? AND';
            // We need the username or email of the user to match createdBy, but we only have userId.
            // Wait, createdBy is a string (username) or ID?
            // Usually createdBy is the user's name or ID. Let's fetch the username.
            const [users] = yield conn.query(`SELECT name FROM users WHERE id = ?`, [userId]);
            if (users.length > 0) {
                params.push(users[0].name);
            }
            else {
                params.push(userId); // Fallback
            }
        }
        params.push(limit);
        const [invoices] = yield conn.query(`SELECT ${safeCols}${totalCol}
             FROM invoices
             WHERE ${userFilter} ${isPOSFilter} type = 'INVOICE_SALE'
             ORDER BY date DESC
             LIMIT ?`, params);
        res.json({ invoices });
    }
    catch (error) {
        console.error('Error getting recent POS sales:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getRecentPOSSales = getRecentPOSSales;
/**
 * Get customer CRM snapshot for POS sidebar
 * GET /api/pos/customers/:id/summary
 * Returns: balance, credit limit, total spent (lifetime + 30d), last 5 invoices, last payment date
 */
const getPOSCustomerSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        // Partner info + balance
        // Use safe column check for optional fields (creditLimit, limit, classification vary by schema)
        const partnerCols = yield getPartnerCols(conn);
        const creditLimitExpr = partnerCols.has('creditLimit')
            ? 'p.creditLimit'
            : partnerCols.has('limit')
                ? 'p.limit'
                : 'NULL';
        const classificationExpr = partnerCols.has('classification') ? 'p.classification' : 'NULL AS classification';
        const priceListJoin = partnerCols.has('priceListId')
            ? `LEFT JOIN price_lists pl ON p.priceListId = pl.id`
            : '';
        const priceListNameExpr = partnerCols.has('priceListId') ? 'pl.name AS priceListName' : 'NULL AS priceListName';
        const priceListNameAlias = partnerCols.has('priceListId') ? 'pl.name AS priceListName' : 'NULL AS priceListName';
        const [partnerRows] = yield conn.query(`SELECT p.id, p.name, p.phone, p.balance,
                    ${creditLimitExpr} AS creditLimit,
                    ${classificationExpr},
                    p.status, p.email,
                    ${priceListNameExpr}
             FROM partners p
             ${priceListJoin}
             WHERE p.id = ?`, [id]);
        if (partnerRows.length === 0) {
            return res.status(404).json({ error: 'العميل غير موجود' });
        }
        const partner = partnerRows[0];
        // Check which columns exist on invoices (total may not exist on old DBs)
        const invCols = yield getInvoiceCols(conn);
        const totalExpr = invCols.has('total') ? 'total' : '0';
        // Lifetime sales total and 30-day total (source: invoices table — transactions table does not exist)
        const [salesStats] = yield conn.query(`SELECT
                SUM(CASE WHEN type = 'INVOICE_SALE' THEN ${totalExpr} ELSE 0 END) AS lifetimeSales,
                SUM(CASE WHEN type = 'INVOICE_SALE' AND date >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN ${totalExpr} ELSE 0 END) AS sales30d,
                COUNT(CASE WHEN type = 'INVOICE_SALE' THEN 1 END) AS invoiceCount,
                MAX(CASE WHEN type IN ('RECEIPT','PAYMENT') THEN date END) AS lastPaymentDate
             FROM invoices
             WHERE partnerId = ? AND status IN ('POSTED', 'COMPLETED', 'PARTIAL')`, [id]);
        // Account summary — broken down by invoice type (source of truth: invoices table)
        const [accountSummary] = yield conn.query(`SELECT
                SUM(CASE WHEN type = 'INVOICE_SALE' THEN ${totalExpr} ELSE 0 END) AS totalInvoiced,
                SUM(CASE WHEN type = 'RETURN_SALE' THEN ${totalExpr} ELSE 0 END) AS totalRefunded,
                SUM(CASE WHEN type IN ('RECEIPT','PAYMENT') THEN ${totalExpr} ELSE 0 END) AS totalPaid,
                SUM(CASE WHEN type = 'CREDIT_NOTE' THEN ${totalExpr} ELSE 0 END) AS totalCreditNotes
             FROM invoices
             WHERE partnerId = ? AND status IN ('POSTED', 'COMPLETED', 'PARTIAL')`, [id]);
        // Last 5 invoices — use safe column list
        const recentSelectCols = ['id', 'number', 'date', 'status', 'paymentMethod']
            .filter(c => invCols.has(c))
            .join(', ');
        const recentTotalCol = invCols.has('total') ? ', total' : ', 0 AS total';
        const [recentInvoices] = yield conn.query(`SELECT ${recentSelectCols}${recentTotalCol}
             FROM invoices
             WHERE partnerId = ? AND type = 'INVOICE_SALE'
             ORDER BY date DESC
             LIMIT 5`, [id]);
        const stats = salesStats[0] || {};
        const acctSummary = accountSummary[0] || {};
        const totalInvoiced = Number(acctSummary.totalInvoiced || 0);
        const totalRefunded = Number(acctSummary.totalRefunded || 0);
        const totalPaid = Number(acctSummary.totalPaid || 0);
        const totalCreditNotes = Number(acctSummary.totalCreditNotes || 0);
        const balanceDue = totalInvoiced - totalRefunded - totalPaid - totalCreditNotes;
        // Fetch active membership + its benefits
        let activeMembership = null;
        try {
            const [membershipRows] = yield conn.query(`SELECT m.id, m.status, m.joinDate, m.endDate, p.name as packageName, p.id as packageId, p.icon as packageIcon
                 FROM memberships m
                 JOIN membership_packages p ON m.packageId = p.id
                 WHERE m.customerId = ? AND m.status IN ('active', 'ACTIVE', 'PENDING_PAYMENT')
                 ORDER BY m.createdAt DESC`, [id]);
            let packageIds = [];
            if (membershipRows.length > 0) {
                // Keep the most recent one as the primary for display
                activeMembership = membershipRows[0];
                packageIds = membershipRows.map(r => r.packageId);
            }
            else {
                activeMembership = {
                    packageId: 'regular-package',
                    packageName: 'عضوية عادية',
                    status: 'active'
                };
                packageIds = ['regular-package'];
            }
            // Benefits are stored in promotions table linked to the membership package
            // We join promo_rules to get category or product targets
            const placeholders = packageIds.map(() => '?').join(',');
            const [promoRows] = yield conn.query(`SELECT p.id as promoId, p.type as promoType, p.discountValue as value, p.discountType,
                        p.maxDiscountAmount as maxDiscount, p.status, p.linkedMembershipId,
                        r.ruleType, r.targetValue
                 FROM promotions p
                 LEFT JOIN promo_rules r ON p.id = r.promotionId
                 WHERE p.linkedMembershipId IN (${placeholders}) AND p.status = 'ACTIVE'`, packageIds);
            // Group the rules by promotion ID so we don't have duplicate benefits
            const promosMap = new Map();
            for (const r of promoRows) {
                if (!promosMap.has(r.promoId)) {
                    promosMap.set(r.promoId, {
                        type: r.promoType === 'PERCENT_ORDER' ? 'DISCOUNT_PERCENT'
                            : r.promoType === 'FIXED_ORDER' ? 'DISCOUNT_FIXED'
                                : r.promoType, // Will retain CATEGORY_DISCOUNT, PRODUCT_DISCOUNT, etc
                        value: Number(r.value || 0),
                        targetIds: [],
                        packageId: r.linkedMembershipId
                    });
                }
                if (r.ruleType === 'CATEGORY_IN_CART' || r.ruleType === 'PRODUCT_IN_CART') {
                    if (r.targetValue) {
                        const ids = r.targetValue.split(',').map((s) => s.trim());
                        promosMap.get(r.promoId).targetIds.push(...ids);
                    }
                }
            }
            activeMembership.benefits = Array.from(promosMap.values());
        }
        catch (e) {
            console.error('Error fetching membership for POS summary:', e);
        }
        res.json({
            partner: {
                id: partner.id,
                name: partner.name,
                phone: partner.phone,
                balance: Number(partner.balance || 0),
                creditLimit: Number(partner.creditLimit || 0),
                classification: partner.classification,
                status: partner.status,
                priceListName: partner.priceListName,
                activeMembership
            },
            lifetimeSales: Number(stats.lifetimeSales || 0),
            sales30d: Number(stats.sales30d || 0),
            invoiceCount: Number(stats.invoiceCount || 0),
            lastPaymentDate: stats.lastPaymentDate || null,
            recentInvoices: recentInvoices,
            accountSummary: {
                totalInvoiced,
                totalRefunded,
                totalPaid,
                totalCreditNotes,
                balanceDue,
            },
        });
    }
    catch (error) {
        console.error('Error getting POS customer summary:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getPOSCustomerSummary = getPOSCustomerSummary;
/**
 * Look up a POS invoice by number for refund
 */
const getPOSInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { invoiceNumber } = req.params;
        const [invoices] = yield conn.query(`SELECT i.*, 
                (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'id', il.id, 'productId', il.productId, 'productName', il.productName,
                    'quantity', il.quantity, 'price', il.price, 'total', il.total,
                    'discount', COALESCE(il.discount, 0), 'discountType', COALESCE(il.discountType, 'FIXED'),
                    'warehouseId', il.warehouseId, 'unitId', il.unitId, 'unitName', il.unitName,
                    'conversionFactor', il.conversionFactor, 'baseQuantity', il.baseQuantity
                )) FROM invoice_lines il WHERE il.invoiceId = i.id) as \`lines\`
             FROM invoices i 
             WHERE i.number = ? AND i.isPOSSale = 1`, [invoiceNumber]);
        if (invoices.length === 0) {
            return res.status(404).json({ error: 'الفاتورة غير موجودة أو ليست فاتورة نقطة بيع' });
        }
        const invoice = invoices[0];
        invoice.lines = invoice.lines ? (typeof invoice.lines === 'string' ? JSON.parse(invoice.lines) : invoice.lines) : [];
        res.json({ invoice });
    }
    catch (error) {
        console.error('Error looking up POS invoice:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getPOSInvoice = getPOSInvoice;
/**
 * Process a POS refund/return
 */
const processPOSRefund = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId, originalInvoiceId, items, reason, refundPaymentMethod, refundAccountId, refundAccountName, globalDiscount, globalDiscountType } = req.body;
        let { refundTotal } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown';
        if (!shiftId || !originalInvoiceId || !items || items.length === 0) {
            return res.status(400).json({ error: 'البيانات غير مكتملة' });
        }
        // refundTotal must never reach the DB as NULL — recompute from items as fallback
        if (refundTotal === undefined || refundTotal === null || isNaN(Number(refundTotal))) {
            refundTotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price) || 0), 0);
        }
        refundTotal = Number(refundTotal);
        // Verify shift is open
        const [shifts] = yield conn.query(`SELECT * FROM pos_shifts WHERE id = ? AND status = 'OPEN'`, [shiftId]);
        if (shifts.length === 0) {
            return res.status(400).json({ error: 'الوردية غير مفتوحة' });
        }
        const shift = shifts[0];
        // Verify original invoice exists
        const [origInvoices] = yield conn.query(`SELECT * FROM invoices WHERE id = ? AND isPOSSale = 1`, [originalInvoiceId]);
        if (origInvoices.length === 0) {
            return res.status(404).json({ error: 'الفاتورة الأصلية غير موجودة' });
        }
        const now = (0, dateUtils_1.getEgyptianISOString)();
        yield conn.query('START TRANSACTION');
        try {
            // Create refund invoice (credit note)
            const refundId = (0, crypto_1.randomUUID)();
            const refundNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, 'RET-POS-');
            // Resolve the refund payment method (defaults to CASH for backward compat)
            const effectiveRefundMethod = refundPaymentMethod || 'CASH';
            yield conn.query(`INSERT INTO invoices (
                    id, number, date, type, partnerId, partnerName,
                    total, status, paymentMethod, posted, notes,
                    warehouseId, createdBy, posShiftId, isPOSSale,
                    globalDiscount, globalDiscountType
                ) VALUES (?, ?, ?, 'RETURN_SALE', ?, ?, ?, 'POSTED', ?, 1, ?, ?, ?, ?, 1, ?, ?)`, [
                refundId, refundNumber, now,
                origInvoices[0].partnerId, origInvoices[0].partnerName,
                refundTotal, effectiveRefundMethod,
                reason || `مرتجع من فاتورة ${origInvoices[0].number}`,
                shift.warehouseId, userId, shiftId,
                globalDiscount || 0,
                globalDiscountType || 'FIXED'
            ]);
            // === PERF: BATCH INSERT refund lines (1 query instead of N) ===
            const effectiveWarehouseId = shift.warehouseId;
            const refundLineValues = items.map((item) => [
                refundId, item.productId, item.productName,
                item.quantity, item.price, item.cost || 0,
                item.discount || 0, item.discountType || 'FIXED',
                (item.quantity * item.price) - (item.discount || 0),
                effectiveWarehouseId,
                item.unitId || null, item.unitName || null,
                item.conversionFactor || 1, item.baseQuantity || item.quantity
            ]);
            yield conn.query(`INSERT INTO invoice_lines (
                    invoiceId, productId, productName, quantity, price, cost, discount, discountType, total, warehouseId,
                    unitId, unitName, conversionFactor, baseQuantity
                ) VALUES ?`, [refundLineValues]);
            // === PERF: BATCH stock restore ===
            if (effectiveWarehouseId) {
                // 1. Update warehouse stock (sequential due to WHERE clause)
                // SORT BY PRODUCT ID TO PREVENT DEADLOCKS
                const sortedItems = [...items].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));
                for (const item of sortedItems) {
                    const baseQty = item.baseQuantity || item.quantity;
                    yield conn.query(`UPDATE product_stocks SET stock = stock + ? WHERE productId = ? AND warehouseId = ?`, [baseQty, item.productId, effectiveWarehouseId]);
                    // Restore variant-specific stock (mirrors sale deduction logic)
                    if (item.variantId) {
                        yield conn.query(`UPDATE product_variant_stocks SET stock = stock + ? WHERE variantId = ? AND warehouseId = ?`, [baseQty, item.variantId, effectiveWarehouseId]);
                        yield conn.query(`UPDATE product_variants SET stock = stock + ? WHERE id = ?`, [baseQty, item.variantId]);
                    }
                }
                // 2. BATCH global product stock update (CASE WHEN — 1 query)
                const productStockMap = new Map();
                for (const item of items) {
                    const baseQty = item.baseQuantity || item.quantity;
                    productStockMap.set(item.productId, (productStockMap.get(item.productId) || 0) + baseQty);
                }
                if (productStockMap.size > 0) {
                    const cases = [];
                    const caseParams = [];
                    const productIds = [];
                    for (const [productId, totalQty] of productStockMap) {
                        cases.push('WHEN id = ? THEN ROUND(stock + ?, 5)');
                        caseParams.push(productId, totalQty);
                        productIds.push(productId);
                    }
                    yield conn.query(`UPDATE products SET stock = CASE ${cases.join(' ')} ELSE stock END WHERE id IN (?)`, [...caseParams, productIds]);
                }
                // 3. BATCH INSERT stock movements (1 query instead of N)
                const movementValues = items.map((item) => [
                    item.productId,
                    effectiveWarehouseId,
                    item.baseQuantity || item.quantity,
                    'RETURN_IN', 'RETURN_SALE',
                    refundId,
                    Number(item.cost) || 0, // Include unit_cost for audit parity
                    `POS Refund ${refundNumber}`,
                    now
                ]);
                yield conn.query(`
                    INSERT INTO stock_movements (
                        product_id, warehouse_id, qty_change, movement_type, 
                        reference_type, reference_id, unit_cost, notes, movement_date
                    ) VALUES ?
                `, [movementValues]);
            }
            // Record refund cash movement
            const movementId = (0, crypto_1.randomUUID)();
            yield conn.query(`INSERT INTO pos_cash_movements (id, shiftId, type, amount, paymentMethod, referenceId, referenceType, description, createdAt)
                 VALUES (?, ?, 'REFUND', ?, ?, ?, 'INVOICE', ?, ?)`, [movementId, shiftId, refundTotal, effectiveRefundMethod, refundId, reason || 'مرتجع', now]);
            // Update shift totals
            yield conn.query(`UPDATE pos_shifts SET totalRefunds = COALESCE(totalRefunds, 0) + ?, refundsCount = COALESCE(refundsCount, 0) + 1, updatedAt = ? WHERE id = ?`, [refundTotal, now, shiftId]);
            // ═══════════════════════════════════════════════════════════════════
            // REVERSE REVENUE/COGS JOURNAL ENTRY (ATOMIC — failure rolls back refund)
            // Mirrors the sale journal but with RETURN_SALE type — reverses Dr/Cr
            // ═══════════════════════════════════════════════════════════════════
            const origInvoice = origInvoices[0];
            const refundLines = items.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                price: item.price,
                cost: item.cost || 0,
                total: item.quantity * item.price,
            }));
            yield (0, invoiceController_1.syncRevenueCogsJournal)(conn, refundId, refundNumber, 'RETURN_SALE', now, origInvoice.partnerName || 'عميل نقدي', refundTotal, refundLines, userName, false, true, 0, (0, branchFilter_1.resolveBranchIdForWrite)(req));
            console.log(`📒 [POS Refund] Revenue/COGS reverse journal created for ${refundNumber}`);
            // ═══════════════════════════════════════════════════════════════════
            // REVERSE TREASURY JOURNAL ENTRY (ATOMIC)
            // Original sale: Dr Cash, Cr Receivables
            // Reverse:       Dr Receivables, Cr Cash
            // ═══════════════════════════════════════════════════════════════════
            const refundAffectedAccountIds = [];
            // Resolve accounts (same pattern as sale)
            let [refPartnerAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '104%' LIMIT 1`);
            if (refPartnerAccRows.length === 0) {
                [refPartnerAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%عملاء%' LIMIT 1`);
            }
            const refPartnerAccount = refPartnerAccRows[0];
            // Resolve cash account (refunds go through selected account, or cash drawer fallback)
            let refCashAccount = null;
            // Use the refundAccountId sent from the client if provided
            if (refundAccountId) {
                const [refAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [refundAccountId]);
                if (refAccRows.length > 0) {
                    refCashAccount = refAccRows[0];
                }
            }
            // Fallback to shift treasury if no explicit account was provided
            if (!refCashAccount && shift.treasuryId) {
                const [refCashAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [shift.treasuryId]);
                if (refCashAccRows.length > 0) {
                    refCashAccount = refCashAccRows[0];
                }
            }
            if (!refCashAccount) {
                // Branch-aware fallback
                refCashAccount = yield (0, branchFilter_1.resolveBranchCashAccount)(conn, req);
            }
            if (refPartnerAccount && refCashAccount) {
                const refTreasuryJournalId = (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate)
                     VALUES (?, ?, ?, ?, ?, 'EGP', 1)`, [
                    refTreasuryJournalId, now,
                    `مردودات (POS) #${refundNumber} - ${origInvoice.partnerName || 'عميل نقدي'}`,
                    refundId, userName
                ]);
                // Reverse: Dr Receivables (partner owes less), Cr Cash (cash goes out)
                yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [[
                        [refTreasuryJournalId, refPartnerAccount.id, refPartnerAccount.name, refundTotal, 0, 'EGP', 1, refundTotal, 0],
                        [refTreasuryJournalId, refCashAccount.id, refCashAccount.name, 0, refundTotal, 'EGP', 1, 0, refundTotal]
                    ]]);
                if (!refundAffectedAccountIds.includes(refPartnerAccount.id))
                    refundAffectedAccountIds.push(refPartnerAccount.id);
                if (!refundAffectedAccountIds.includes(refCashAccount.id))
                    refundAffectedAccountIds.push(refCashAccount.id);
                if (refundAffectedAccountIds.length > 0) {
                    yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, refundAffectedAccountIds);
                }
                console.log(`📒 [POS Refund] Treasury reverse journal created for ${refundNumber}`);
            }
            yield conn.query('COMMIT');
            // === LOYALTY: Clawback earned points after refund (non-fatal) ===
            const refundPartnerId = origInvoices[0].partnerId;
            let loyaltyClawbackPoints = 0;
            try {
                if (refundPartnerId) {
                    loyaltyClawbackPoints = yield (0, loyaltyController_1.recordLoyaltyClawback)(conn, refundPartnerId, originalInvoiceId, refundTotal, userName);
                }
            }
            catch (loyaltyErr) {
                console.error('Non-fatal loyalty clawback error:', loyaltyErr);
                // DO NOT throw. Allow the response to send.
            }
            res.json({
                success: true,
                refund: {
                    id: refundId,
                    number: refundNumber,
                    originalInvoiceId,
                    items,
                    total: refundTotal,
                    reason,
                    date: now
                },
                loyaltyClawback: loyaltyClawbackPoints > 0 ? loyaltyClawbackPoints : undefined,
                message: 'تم المرتجع بنجاح'
            });
        }
        catch (txError) {
            yield conn.query('ROLLBACK');
            throw txError;
        }
    }
    catch (error) {
        console.error('Error processing refund:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.processPOSRefund = processPOSRefund;
// ============================================
// EMBEDDED VARIANTS (product_variants table)
// ============================================
/**
 * GET /api/pos/products/:id/embedded-variants?warehouseId=...
 * Fetches embedded variants for a parent product.
 * Returns attribute groups + variant list with stock.
 */
const getEmbeddedVariants = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id: productId } = req.params;
        const includeInactive = req.query.includeInactive === 'true';
        const userCtx = req.user;
        const userRole = ((userCtx === null || userCtx === void 0 ? void 0 : userCtx.role) || '').toUpperCase();
        const isPrivileged = ['ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN'].includes(userRole);
        // Branch isolation: warehouse from JWT unless privileged overrides
        const warehouseId = isPrivileged && req.query.warehouseId
            ? String(req.query.warehouseId)
            : ((userCtx === null || userCtx === void 0 ? void 0 : userCtx.defaultWarehouseId) || req.query.warehouseId);
        // Get parent product (single indexed lookup)
        const [parentRows] = yield conn.query('SELECT id, name, image, variantAttributes, price, cost FROM products WHERE id = ?', [productId]);
        const parent = parentRows[0];
        if (!parent) {
            conn.release();
            return res.status(404).json({ error: 'المنتج غير موجود' });
        }
        // FAST PATH: Use product_variant_stocks cache (maintained during invoice save)
        // instead of correlated subqueries against stock_movements.
        // Falls back to stock_movements SUM only when cache table is missing.
        const activeFilter = !includeInactive ? 'AND pv.isActive = 1' : '';
        let variantRows;
        try {
            if (warehouseId) {
                // Per-warehouse stock from cache table (single LEFT JOIN, no subquery)
                const [rows] = yield conn.query(`SELECT pv.id, pv.productId, pv.name, pv.sku, pv.barcode, 
                            pv.purchasePrice, pv.sellingPrice, pv.attributes, pv.isActive, pv.image,
                            COALESCE(pvs.stock, 0) AS stock
                     FROM product_variants pv
                     LEFT JOIN product_variant_stocks pvs 
                        ON pvs.variantId = pv.id AND pvs.warehouseId = ?
                     WHERE pv.productId = ? ${activeFilter}
                     ORDER BY pv.name`, [warehouseId, productId]);
                variantRows = rows;
            }
            else {
                // Global stock: sum across all warehouses from cache
                const [rows] = yield conn.query(`SELECT pv.id, pv.productId, pv.name, pv.sku, pv.barcode, 
                            pv.purchasePrice, pv.sellingPrice, pv.attributes, pv.isActive, pv.image,
                            COALESCE(SUM(pvs.stock), 0) AS stock
                     FROM product_variants pv
                     LEFT JOIN product_variant_stocks pvs ON pvs.variantId = pv.id
                     WHERE pv.productId = ? ${activeFilter}
                     GROUP BY pv.id
                     ORDER BY pv.name`, [productId]);
                variantRows = rows;
            }
        }
        catch (_a) {
            // Cache table missing — fall back to stock_movements (slower but always works)
            const stockExpr = warehouseId
                ? `COALESCE((SELECT SUM(sm.qty_change) FROM stock_movements sm WHERE sm.variant_id = pv.id AND sm.warehouse_id = ?), 0) AS stock`
                : `COALESCE((SELECT SUM(sm.qty_change) FROM stock_movements sm WHERE sm.variant_id = pv.id), 0) AS stock`;
            const params = warehouseId ? [warehouseId, productId] : [productId];
            const [rows] = yield conn.query(`SELECT pv.id, pv.productId, pv.name, pv.sku, pv.barcode, 
                        pv.purchasePrice, pv.sellingPrice, pv.attributes, pv.isActive, pv.image,
                        ${stockExpr}
                 FROM product_variants pv
                 WHERE pv.productId = ? ${activeFilter}
                 ORDER BY pv.name`, params);
            variantRows = rows;
        }
        const parentPrice = Number(parent.price) || 0;
        const parentCost = Number(parent.cost) || 0;
        const variants = variantRows.map(r => (Object.assign(Object.assign({}, r), { attributes: typeof r.attributes === 'string' ? JSON.parse(r.attributes) : (r.attributes || {}), price: Number(r.sellingPrice) || parentPrice, cost: Number(r.purchasePrice) || parentCost, totalStock: Number(r.stock) || 0 })));
        // Derive attribute groups from variant data
        const attrMap = new Map();
        for (const v of variants) {
            if (v.attributes) {
                for (const [key, val] of Object.entries(v.attributes)) {
                    if (!attrMap.has(key))
                        attrMap.set(key, new Set());
                    if (val)
                        attrMap.get(key).add(val);
                }
            }
        }
        const attributeGroups = Array.from(attrMap.entries()).map(([key, values]) => ({
            id: key,
            name: key,
            values: Array.from(values).map(v => ({
                id: `${key}:${v}`,
                value: v,
            })),
        }));
        const formattedVariants = variants.map(v => ({
            id: v.id,
            name: v.name,
            sku: v.sku,
            barcode: v.barcode,
            price: v.price,
            cost: v.cost,
            stock: v.totalStock,
            image: v.image || null,
            attributeValues: Object.entries(v.attributes || {}).map(([key, val]) => ({
                groupId: key,
                valueId: `${key}:${val}`,
                value: val,
            })),
        }));
        conn.release();
        res.json({
            parentProduct: {
                id: parent.id,
                name: parent.name,
                image: parent.image || null,
            },
            attributeGroups,
            variants: formattedVariants,
        });
    }
    catch (error) {
        conn.release();
        console.error('Error fetching embedded variants:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.getEmbeddedVariants = getEmbeddedVariants;
// ═══════════════════════════════════════════════════════════════════════════
// SPECIALIZED POS REPORTS (Phase 5)
// Supports: dateFrom, dateTo, shiftId/shiftIds/sessionNumbers, warehouseId,
//           posDeviceId, branchId/branchIds, currency, orderBy, page, pageSize
// ═══════════════════════════════════════════════════════════════════════════
// ── Whitelisted orderBy values → safe SQL fragments ──────────────────────────
const ORDER_BY_MAP = {
    code_asc: 'il.productId ASC',
    code_desc: 'il.productId DESC',
    name_asc: 'il.productName ASC',
    name_desc: 'il.productName DESC',
    sales_amount_asc: 'totalRevenue ASC',
    sales_amount_desc: 'totalRevenue DESC',
    quantity_asc: 'totalQty ASC',
    quantity_desc: 'totalQty DESC',
    profit_asc: 'grossProfit ASC',
    profit_desc: 'grossProfit DESC',
    date_asc: 'i.date ASC',
    date_desc: 'i.date DESC',
};
function orderByToSQL(orderBy, fallback) {
    var _a;
    if (!orderBy)
        return fallback;
    return (_a = ORDER_BY_MAP[orderBy]) !== null && _a !== void 0 ? _a : fallback;
}
/**
 * Build a reusable WHERE clause + params from all supported report filter params.
 * shiftIds / sessionNumbers are treated as aliases for posShiftId (multi-value).
 */
function buildReportFilters(query) {
    const { dateFrom, dateTo, shiftId, shiftIds, sessionNumbers, warehouseId, branchId, branchIds, currency, page, pageSize, } = query;
    const conditions = ["i.type IN ('INVOICE_SALE', 'RETURN_SALE')", "i.isPOSSale = 1", "i.status != 'VOID'"];
    const params = [];
    if (dateFrom && dateTo) {
        conditions.push('DATE(i.date) BETWEEN ? AND ?');
        params.push(dateFrom, dateTo);
    }
    else if (dateFrom) {
        conditions.push('DATE(i.date) >= ?');
        params.push(dateFrom);
    }
    else if (dateTo) {
        conditions.push('DATE(i.date) <= ?');
        params.push(dateTo);
    }
    // Shift filter — merge shiftId, shiftIds, sessionNumbers into one list
    const rawShiftIds = [];
    if (shiftId)
        rawShiftIds.push(String(shiftId));
    if (shiftIds)
        rawShiftIds.push(...String(shiftIds).split(',').map((s) => s.trim()).filter(Boolean));
    if (sessionNumbers)
        rawShiftIds.push(...String(sessionNumbers).split(',').map((s) => s.trim()).filter(Boolean));
    const uniqueShiftIds = [...new Set(rawShiftIds)];
    if (uniqueShiftIds.length === 1) {
        conditions.push('i.posShiftId = ?');
        params.push(uniqueShiftIds[0]);
    }
    else if (uniqueShiftIds.length > 1) {
        conditions.push(`i.posShiftId IN (${uniqueShiftIds.map(() => '?').join(',')})`);
        params.push(...uniqueShiftIds);
    }
    if (warehouseId) {
        conditions.push('i.warehouseId = ?');
        params.push(warehouseId);
    }
    const rawBranchIds = [];
    if (branchId)
        rawBranchIds.push(String(branchId));
    if (branchIds)
        rawBranchIds.push(...String(branchIds).split(',').map((s) => s.trim()).filter(Boolean));
    const uniqueBranchIds = [...new Set(rawBranchIds)];
    if (uniqueBranchIds.length === 1) {
        conditions.push('i.branchId = ?');
        params.push(uniqueBranchIds[0]);
    }
    else if (uniqueBranchIds.length > 1) {
        conditions.push(`i.branchId IN (${uniqueBranchIds.map(() => '?').join(',')})`);
        params.push(...uniqueBranchIds);
    }
    if (currency) {
        conditions.push('i.currency = ?');
        params.push(currency);
    }
    const parsedPageSize = Math.min(Math.max(parseInt(pageSize) || 50, 1), 500);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    return {
        where: conditions.join(' AND '),
        params,
        limit: parsedPageSize,
        offset: (parsedPage - 1) * parsedPageSize,
    };
}
/** Builds a JOIN + extra condition for device filtering (pos_shifts.deviceId). */
function buildDeviceJoin(posDeviceId) {
    if (!posDeviceId)
        return { join: '', condition: '', param: [] };
    return {
        join: 'JOIN pos_shifts ps ON ps.id = i.posShiftId',
        condition: ' AND ps.deviceId = ?',
        param: [posDeviceId],
    };
}
// ─── 1. Category Sales Summary ───────────────────────────────────────────────
const getCategorySalesSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { where, params, limit, offset } = buildReportFilters(req.query);
        const { join: dj, condition: dc, param: dp } = buildDeviceJoin(req.query.posDeviceId);
        const orderSQL = orderByToSQL(req.query.orderBy, 'totalRevenue DESC');
        const allParams = [...params, ...dp];
        const [rows] = yield conn.query(`SELECT
                COALESCE(c.name, 'غير مصنف') AS category,
                COUNT(DISTINCT i.id) AS invoiceCount,
                SUM(il.quantity) AS totalQty,
                SUM(il.price * il.quantity) AS totalRevenue,
                COALESCE(SUM(il.discount), 0) AS totalDiscount,
                SUM(il.total) AS totalNetSales
             FROM invoice_lines il
             JOIN invoices i ON i.id = il.invoiceId
             LEFT JOIN products p ON p.id = il.productId
             LEFT JOIN categories c ON c.id = p.categoryId
             ${dj}
             WHERE ${where}${dc}
             GROUP BY COALESCE(c.name, 'غير مصنف')
             ORDER BY ${orderSQL}
             LIMIT ? OFFSET ?`, [...allParams, limit, offset]);
        conn.release();
        res.json({ rows, limit, offset });
    }
    catch (err) {
        conn.release();
        res.status(500).json({ error: err.message });
    }
});
exports.getCategorySalesSummary = getCategorySalesSummary;
// ─── 2. Product Sales Summary ────────────────────────────────────────────────
const getProductSalesSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { where, params, limit, offset } = buildReportFilters(req.query);
        const { join: dj, condition: dc, param: dp } = buildDeviceJoin(req.query.posDeviceId);
        const orderSQL = orderByToSQL(req.query.orderBy, 'totalRevenue DESC');
        const allParams = [...params, ...dp];
        // BUG-R07: Group by productId only — il.productName can differ across invoices
        const [rows] = yield conn.query(`SELECT
                il.productId,
                MAX(COALESCE(p.name, il.productName)) AS productName,
                COALESCE(MAX(c.name), 'غير مصنف') AS category,
                SUM(il.quantity) AS totalQty,
                AVG(il.price) AS avgPrice,
                SUM(COALESCE(il.discount, 0)) AS totalDiscount,
                SUM(il.price * il.quantity) AS totalRevenue,
                SUM(il.total) AS totalNetSales
             FROM invoice_lines il
             JOIN invoices i ON i.id = il.invoiceId
             LEFT JOIN products p ON p.id = il.productId
             LEFT JOIN categories c ON c.id = p.categoryId
             ${dj}
             WHERE ${where}${dc}
             GROUP BY il.productId
             ORDER BY ${orderSQL}
             LIMIT ? OFFSET ?`, [...allParams, limit, offset]);
        conn.release();
        res.json({ rows, limit, offset });
    }
    catch (err) {
        conn.release();
        res.status(500).json({ error: err.message });
    }
});
exports.getProductSalesSummary = getProductSalesSummary;
// ─── 3. Shift Sales ──────────────────────────────────────────────────────────
const getShiftSalesReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { dateFrom, dateTo, warehouseId, posDeviceId, branchId, branchIds, page, pageSize } = req.query;
        const conditions = ["ps.status IN ('CLOSED', 'VALIDATED', 'PENDING_VALIDATION', 'OPEN')"];
        const params = [];
        if (dateFrom && dateTo) {
            conditions.push('DATE(ps.openedAt) BETWEEN ? AND ?');
            params.push(dateFrom, dateTo);
        }
        if (warehouseId) {
            conditions.push('ps.warehouseId = ?');
            params.push(warehouseId);
        }
        if (posDeviceId) {
            conditions.push('ps.deviceId = ?');
            params.push(posDeviceId);
        }
        const rawBranchIds = [];
        if (branchId)
            rawBranchIds.push(String(branchId));
        if (branchIds)
            rawBranchIds.push(...String(branchIds).split(',').map((s) => s.trim()).filter(Boolean));
        if (rawBranchIds.length === 1) {
            conditions.push('ps.branchId = ?');
            params.push(rawBranchIds[0]);
        }
        else if (rawBranchIds.length > 1) {
            conditions.push(`ps.branchId IN (${rawBranchIds.map(() => '?').join(',')})`);
            params.push(...rawBranchIds);
        }
        const parsedPageSize = Math.min(Math.max(parseInt(pageSize) || 50, 1), 500);
        const parsedPage = Math.max(parseInt(page) || 1, 1);
        const offset = (parsedPage - 1) * parsedPageSize;
        const [rows] = yield conn.query(`SELECT
                ps.id AS shiftId,
                ps.openedAt,
                ps.closedAt,
                COALESCE(u.name, 'Unknown') AS userName,
                ps.status,
                COALESCE(w.name, '') AS warehouseName,
                ps.openingCash,
                ps.closingCash,
                ps.expectedCash,
                ps.variance,
                ps.closingCard,
                ps.expectedCard,
                ps.varianceCard,
                COALESCE(ps.totalSales, 0) AS totalSales,
                COALESCE(ps.totalRefunds, 0) AS totalRefunds,
                COALESCE(ps.salesCount, 0) AS salesCount,
                COALESCE(ps.refundCount, 0) AS refundCount,
                TIMESTAMPDIFF(MINUTE, ps.openedAt, COALESCE(ps.closedAt, NOW())) AS durationMinutes
             FROM pos_shifts ps
             LEFT JOIN users u ON u.id = ps.userId
             LEFT JOIN warehouses w ON w.id = ps.warehouseId
             WHERE ${conditions.join(' AND ')}
             ORDER BY ps.openedAt DESC
             LIMIT ? OFFSET ?`, [...params, parsedPageSize, offset]);
        conn.release();
        res.json({ rows, limit: parsedPageSize, offset });
    }
    catch (err) {
        conn.release();
        res.status(500).json({ error: err.message });
    }
});
exports.getShiftSalesReport = getShiftSalesReport;
// ─── 4. Shift Movement Detail ────────────────────────────────────────────────
const getShiftMovementDetail = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId } = req.query;
        if (!shiftId) {
            conn.release();
            return res.status(400).json({ error: 'shiftId is required' });
        }
        const [movements] = yield conn.query(`SELECT
                pcm.id,
                pcm.type,
                pcm.paymentMethod,
                pcm.amount,
                pcm.description AS notes,
                pcm.referenceId,
                pcm.referenceType,
                pcm.approvedBy,
                pcm.createdAt
             FROM pos_cash_movements pcm
             WHERE pcm.shiftId = ?
             ORDER BY pcm.createdAt ASC`, [shiftId]);
        const [invoices] = yield conn.query(`SELECT
                i.id,
                i.number,
                i.date,
                i.partnerName,
                i.total,
                i.paymentMethod,
                i.status
             FROM invoices i
             WHERE i.posShiftId = ?
               AND i.type IN ('INVOICE_SALE', 'CREDIT_NOTE')
               AND i.isPOSSale = 1
             ORDER BY i.date ASC`, [shiftId]);
        conn.release();
        res.json({ movements, invoices });
    }
    catch (err) {
        conn.release();
        res.status(500).json({ error: err.message });
    }
});
exports.getShiftMovementDetail = getShiftMovementDetail;
// ─── 5. Shift Profitability ──────────────────────────────────────────────────
const getShiftProfitabilityReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { dateFrom, dateTo, warehouseId, posDeviceId, page, pageSize } = req.query;
        const shiftConditions = ["ps.status IN ('CLOSED', 'VALIDATED', 'PENDING_VALIDATION')"];
        const shiftParams = [];
        if (dateFrom && dateTo) {
            shiftConditions.push('DATE(ps.openedAt) BETWEEN ? AND ?');
            shiftParams.push(dateFrom, dateTo);
        }
        if (warehouseId) {
            shiftConditions.push('ps.warehouseId = ?');
            shiftParams.push(warehouseId);
        }
        if (posDeviceId) {
            shiftConditions.push('ps.deviceId = ?');
            shiftParams.push(posDeviceId);
        }
        const parsedPageSize = Math.min(Math.max(parseInt(pageSize) || 50, 1), 500);
        const parsedPage = Math.max(parseInt(page) || 1, 1);
        const offset = (parsedPage - 1) * parsedPageSize;
        const [rows] = yield conn.query(`SELECT
                ps.id AS shiftId,
                ps.openedAt,
                ps.closedAt,
                COALESCE(u.name, 'Unknown') AS userName,
                COALESCE(w.name, '') AS warehouseName,
                COALESCE(ps.totalSales, 0) AS totalSales,
                COALESCE(ps.totalRefunds, 0) AS totalRefunds,
                COALESCE(ps.totalSales, 0) - COALESCE(ps.totalRefunds, 0) AS netSales,
                COALESCE((
                    SELECT SUM(CASE WHEN inv.type = 'RETURN_SALE' THEN -(il.quantity * COALESCE(p.cost, 0)) ELSE (il.quantity * COALESCE(p.cost, 0)) END)
                    FROM invoices inv
                    JOIN invoice_lines il ON il.invoiceId = inv.id
                    LEFT JOIN products p ON p.id = il.productId
                    WHERE inv.posShiftId = ps.id
                      AND inv.type IN ('INVOICE_SALE', 'RETURN_SALE')
                ), 0) AS totalCost,
                COALESCE(ps.totalSales, 0) - COALESCE(ps.totalRefunds, 0)
                    - COALESCE((
                        SELECT SUM(CASE WHEN inv.type = 'RETURN_SALE' THEN -(il.quantity * COALESCE(p.cost, 0)) ELSE (il.quantity * COALESCE(p.cost, 0)) END)
                        FROM invoices inv
                        JOIN invoice_lines il ON il.invoiceId = inv.id
                        LEFT JOIN products p ON p.id = il.productId
                        WHERE inv.posShiftId = ps.id
                          AND inv.type IN ('INVOICE_SALE', 'RETURN_SALE')
                    ), 0) AS grossProfit
             FROM pos_shifts ps
             LEFT JOIN users u ON u.id = ps.userId
             LEFT JOIN warehouses w ON w.id = ps.warehouseId
             WHERE ${shiftConditions.join(' AND ')}
             ORDER BY ps.openedAt DESC
             LIMIT ? OFFSET ?`, [...shiftParams, parsedPageSize, offset]);
        conn.release();
        res.json({ rows, limit: parsedPageSize, offset });
    }
    catch (err) {
        conn.release();
        res.status(500).json({ error: err.message });
    }
});
exports.getShiftProfitabilityReport = getShiftProfitabilityReport;
// ─── 6. Category Profitability ───────────────────────────────────────────────
const getCategoryProfitabilityReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { where, params, limit, offset } = buildReportFilters(req.query);
        const { join: dj, condition: dc, param: dp } = buildDeviceJoin(req.query.posDeviceId);
        const orderSQL = orderByToSQL(req.query.orderBy, 'grossProfit DESC');
        const allParams = [...params, ...dp];
        const [rows] = yield conn.query(`SELECT
                COALESCE(c.name, 'غير مصنف') AS category,
                SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.quantity ELSE il.quantity END) AS totalQty,
                SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) AS totalRevenue,
                SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.quantity * COALESCE(p.cost, 0)) ELSE (il.quantity * COALESCE(p.cost, 0)) END) AS totalCost,
                SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) - SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.quantity * COALESCE(p.cost, 0)) ELSE (il.quantity * COALESCE(p.cost, 0)) END) AS grossProfit,
                CASE
                    WHEN SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) > 0
                    THEN ROUND((SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) - SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.quantity * COALESCE(p.cost, 0)) ELSE (il.quantity * COALESCE(p.cost, 0)) END)) / SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) * 100, 2)
                    ELSE 0
                END AS marginPercent,
                SUM(CASE WHEN COALESCE(p.cost, 0) = 0 THEN 1 ELSE 0 END) AS missingCostCount
             FROM invoice_lines il
             JOIN invoices i ON i.id = il.invoiceId
             LEFT JOIN products p ON p.id = il.productId
             LEFT JOIN categories c ON c.id = p.categoryId
             ${dj}
             WHERE ${where}${dc}
             GROUP BY COALESCE(c.name, 'غير مصنف')
             ORDER BY ${orderSQL}
             LIMIT ? OFFSET ?`, [...allParams, limit, offset]);
        conn.release();
        res.json({ rows, limit, offset });
    }
    catch (err) {
        conn.release();
        res.status(500).json({ error: err.message });
    }
});
exports.getCategoryProfitabilityReport = getCategoryProfitabilityReport;
// ─── 7. Product Profitability ────────────────────────────────────────────────
const getProductProfitabilityReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { where, params, limit, offset } = buildReportFilters(req.query);
        const { join: dj, condition: dc, param: dp } = buildDeviceJoin(req.query.posDeviceId);
        const orderSQL = orderByToSQL(req.query.orderBy, 'grossProfit DESC');
        const allParams = [...params, ...dp];
        const [rows] = yield conn.query(`SELECT
                il.productId,
                il.productName,
                COALESCE(c.name, 'غير مصنف') AS category,
                SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.quantity ELSE il.quantity END) AS totalQty,
                SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) AS totalRevenue,
                SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.quantity * COALESCE(p.cost, 0)) ELSE (il.quantity * COALESCE(p.cost, 0)) END) AS totalCost,
                SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) - SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.quantity * COALESCE(p.cost, 0)) ELSE (il.quantity * COALESCE(p.cost, 0)) END) AS grossProfit,
                CASE
                    WHEN SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) > 0
                    THEN ROUND((SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) - SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.quantity * COALESCE(p.cost, 0)) ELSE (il.quantity * COALESCE(p.cost, 0)) END)) / SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) * 100, 2)
                    ELSE 0
                END AS marginPercent,
                CASE WHEN COALESCE(p.cost, 0) = 0 THEN 1 ELSE 0 END AS missingCost
             FROM invoice_lines il
             JOIN invoices i ON i.id = il.invoiceId
             LEFT JOIN products p ON p.id = il.productId
             LEFT JOIN categories c ON c.id = p.categoryId
             ${dj}
             WHERE ${where}${dc}
             GROUP BY il.productId, il.productName, COALESCE(c.name, 'غير مصنف'),
                      CASE WHEN COALESCE(p.cost, 0) = 0 THEN 1 ELSE 0 END
             ORDER BY ${orderSQL}
             LIMIT ? OFFSET ?`, [...allParams, limit, offset]);
        conn.release();
        res.json({ rows, limit, offset });
    }
    catch (err) {
        conn.release();
        res.status(500).json({ error: err.message });
    }
});
exports.getProductProfitabilityReport = getProductProfitabilityReport;
// ─── 8. Universal CSV Export ─────────────────────────────────────────────────
// GET /api/pos/reports/:reportKey/export?format=csv&...filters
const exportPOSReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { reportKey } = req.params;
    const query = req.query;
    const REPORT_DISPATCH = {
        'category-sales': (q, conn) => __awaiter(void 0, void 0, void 0, function* () {
            const { where, params } = buildReportFilters(q);
            const { join: dj, condition: dc, param: dp } = buildDeviceJoin(q.posDeviceId);
            const [rows] = yield conn.query(`SELECT COALESCE(c.name,'غير مصنف') AS category,
                    COUNT(DISTINCT i.id) AS invoiceCount, SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.quantity ELSE il.quantity END) AS totalQty,
                    SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.price * il.quantity) ELSE (il.price * il.quantity) END) AS totalRevenue, COALESCE(SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.discount ELSE il.discount END),0) AS totalDiscount,
                    SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) AS totalNetSales
                 FROM invoice_lines il
                 JOIN invoices i ON i.id=il.invoiceId
                 LEFT JOIN products p ON p.id=il.productId
                 LEFT JOIN categories c ON c.id=p.categoryId ${dj}
                 WHERE ${where}${dc} GROUP BY COALESCE(c.name,'غير مصنف') ORDER BY totalRevenue DESC`, [...params, ...dp]);
            return rows;
        }),
        'product-sales': (q, conn) => __awaiter(void 0, void 0, void 0, function* () {
            const { where, params } = buildReportFilters(q);
            const { join: dj, condition: dc, param: dp } = buildDeviceJoin(q.posDeviceId);
            const [rows] = yield conn.query(`SELECT il.productId, il.productName, COALESCE(c.name,'غير مصنف') AS category,
                    SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.quantity ELSE il.quantity END) AS totalQty, AVG(il.price) AS avgPrice,
                    SUM(COALESCE(CASE WHEN i.type = 'RETURN_SALE' THEN -il.discount ELSE il.discount END,0)) AS totalDiscount, SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.price * il.quantity) ELSE (il.price * il.quantity) END) AS totalRevenue, SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) AS totalNetSales
                 FROM invoice_lines il
                 JOIN invoices i ON i.id=il.invoiceId
                 LEFT JOIN products p ON p.id=il.productId
                 LEFT JOIN categories c ON c.id=p.categoryId ${dj}
                 WHERE ${where}${dc}
                 GROUP BY il.productId,il.productName,COALESCE(c.name,'غير مصنف')
                 ORDER BY totalRevenue DESC`, [...params, ...dp]);
            return rows;
        }),
        'shift-sales': (q, conn) => __awaiter(void 0, void 0, void 0, function* () {
            const conds = ["ps.status IN ('CLOSED','VALIDATED','PENDING_VALIDATION','OPEN')"];
            const p = [];
            if (q.dateFrom && q.dateTo) {
                conds.push('DATE(ps.openedAt) BETWEEN ? AND ?');
                p.push(q.dateFrom, q.dateTo);
            }
            if (q.warehouseId) {
                conds.push('ps.warehouseId=?');
                p.push(q.warehouseId);
            }
            const [rows] = yield conn.query(`SELECT ps.id AS shiftId, ps.openedAt, ps.closedAt, COALESCE(u.name,'Unknown') AS userName, ps.status,
                    COALESCE(ps.totalSales,0) AS totalSales, COALESCE(ps.totalRefunds,0) AS totalRefunds,
                    COALESCE(ps.salesCount,0) AS salesCount
                 FROM pos_shifts ps
                 LEFT JOIN users u ON u.id = ps.userId
                 WHERE ${conds.join(' AND ')} ORDER BY ps.openedAt DESC`, p);
            return rows;
        }),
        'shift-profitability': (q, conn) => __awaiter(void 0, void 0, void 0, function* () {
            const conds = ["ps.status IN ('CLOSED','VALIDATED','PENDING_VALIDATION')"];
            const p = [];
            if (q.dateFrom && q.dateTo) {
                conds.push('DATE(ps.openedAt) BETWEEN ? AND ?');
                p.push(q.dateFrom, q.dateTo);
            }
            const [rows] = yield conn.query(`SELECT ps.id AS shiftId, ps.openedAt, COALESCE(u.name,'Unknown') AS userName,
                    COALESCE(ps.totalSales,0)-COALESCE(ps.totalRefunds,0) AS netSales
                 FROM pos_shifts ps
                 LEFT JOIN users u ON u.id = ps.userId
                 WHERE ${conds.join(' AND ')} ORDER BY ps.openedAt DESC`, p);
            return rows;
        }),
        'category-profitability': (q, conn) => __awaiter(void 0, void 0, void 0, function* () {
            const { where, params } = buildReportFilters(q);
            const { join: dj, condition: dc, param: dp } = buildDeviceJoin(q.posDeviceId);
            const [rows] = yield conn.query(`SELECT COALESCE(c.name,'غير مصنف') AS category,
                    SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.quantity ELSE il.quantity END) AS totalQty, SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) AS totalRevenue,
                    SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.quantity*COALESCE(p.cost,0)) ELSE (il.quantity*COALESCE(p.cost,0)) END) AS totalCost,
                    SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END)-SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.quantity*COALESCE(p.cost,0)) ELSE (il.quantity*COALESCE(p.cost,0)) END) AS grossProfit,
                    CASE WHEN SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END)>0
                         THEN ROUND((SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END)-SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.quantity*COALESCE(p.cost,0)) ELSE (il.quantity*COALESCE(p.cost,0)) END))/SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END)*100,2)
                         ELSE 0 END AS marginPercent
                 FROM invoice_lines il
                 JOIN invoices i ON i.id=il.invoiceId
                 LEFT JOIN products p ON p.id=il.productId
                 LEFT JOIN categories c ON c.id=p.categoryId ${dj}
                 WHERE ${where}${dc} GROUP BY COALESCE(c.name,'غير مصنف') ORDER BY grossProfit DESC`, [...params, ...dp]);
            return rows;
        }),
        'product-profitability': (q, conn) => __awaiter(void 0, void 0, void 0, function* () {
            const { where, params } = buildReportFilters(q);
            const { join: dj, condition: dc, param: dp } = buildDeviceJoin(q.posDeviceId);
            const [rows] = yield conn.query(`SELECT il.productId, il.productName, COALESCE(c.name,'غير مصنف') AS category,
                    SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.quantity ELSE il.quantity END) AS totalQty, SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END) AS totalRevenue,
                    SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.quantity*COALESCE(p.cost,0)) ELSE (il.quantity*COALESCE(p.cost,0)) END) AS totalCost,
                    SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END)-SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.quantity*COALESCE(p.cost,0)) ELSE (il.quantity*COALESCE(p.cost,0)) END) AS grossProfit,
                    CASE WHEN SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END)>0
                         THEN ROUND((SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END)-SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -(il.quantity*COALESCE(p.cost,0)) ELSE (il.quantity*COALESCE(p.cost,0)) END))/SUM(CASE WHEN i.type = 'RETURN_SALE' THEN -il.total ELSE il.total END)*100,2)
                         ELSE 0 END AS marginPercent
                 FROM invoice_lines il
                 JOIN invoices i ON i.id=il.invoiceId
                 LEFT JOIN products p ON p.id=il.productId
                 LEFT JOIN categories c ON c.id=p.categoryId ${dj}
                 WHERE ${where}${dc}
                 GROUP BY il.productId,il.productName,COALESCE(c.name,'غير مصنف')
                 ORDER BY grossProfit DESC`, [...params, ...dp]);
            return rows;
        }),
    };
    const queryFn = REPORT_DISPATCH[reportKey];
    if (!queryFn) {
        return res.status(404).json({ error: `Unknown report key: ${reportKey}` });
    }
    const conn = yield (0, db_1.getConnection)();
    try {
        const rows = yield queryFn(query, conn);
        conn.release();
        const BOM = '\uFEFF';
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        let csv = BOM + headers.join(',') + '\n';
        for (const row of rows) {
            csv += headers.map(h => { var _a; return `"${String((_a = row[h]) !== null && _a !== void 0 ? _a : '').replace(/"/g, '""')}"`; }).join(',') + '\n';
        }
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${reportKey}-${new Date().toISOString().split('T')[0]}.csv"`);
        return res.send(csv);
    }
    catch (err) {
        conn.release();
        res.status(500).json({ error: err.message });
    }
});
exports.exportPOSReport = exportPOSReport;
/**
 * Admin-only: Update a posted POS invoice.
 * PUT /api/pos/invoice/:invoiceId/edit
 *
 * Validates POS constraints (isPOSSale, cutoff date) then delegates
 * to the existing invoiceController.updateInvoice for stock/GL rewrite.
 * Creates an audit record in pos_invoice_edits.
 */
const updatePOSInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { invoiceId } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown';
        // 1. Validate invoice exists and is a POS invoice
        const [invRows] = yield conn.query('SELECT id, number, date, type, total, isPOSSale, posShiftId FROM invoices WHERE id = ?', [invoiceId]);
        const invoice = invRows[0];
        if (!invoice) {
            conn.release();
            return res.status(404).json({ error: 'الفاتورة غير موجودة' });
        }
        if (!invoice.isPOSSale) {
            conn.release();
            return res.status(400).json({ error: 'هذه ليست فاتورة نقطة بيع' });
        }
        // 2. Check cutoff date
        const [settingsRows] = yield conn.query('SELECT editCutoffDate, editCutoffDays FROM pos_settings LIMIT 1');
        const settingsData = settingsRows[0] || {};
        const cutoffDate = settingsData.editCutoffDate;
        const cutoffDays = parseInt(settingsData.editCutoffDays) || 0;
        // Determine effective cutoff: rolling days takes priority over static date
        let effectiveCutoff = null;
        if (cutoffDays > 0) {
            effectiveCutoff = new Date();
            effectiveCutoff.setDate(effectiveCutoff.getDate() - cutoffDays);
            effectiveCutoff.setHours(0, 0, 0, 0);
        }
        else if (cutoffDate) {
            effectiveCutoff = new Date(cutoffDate);
        }
        if (effectiveCutoff) {
            const invoiceDate = new Date(invoice.date);
            if (invoiceDate < effectiveCutoff) {
                const cutoffStr = effectiveCutoff.toISOString().split('T')[0];
                conn.release();
                return res.status(403).json({
                    error: cutoffDays > 0
                        ? `لا يمكن تعديل فواتير أقدم من ${cutoffDays} يوماً (قبل ${cutoffStr})`
                        : `لا يمكن تعديل فواتير قبل تاريخ ${cutoffStr}`,
                    errorCode: 'CUTOFF_DATE_EXCEEDED'
                });
            }
        }
        // 3. Record old state for audit
        const oldTotal = parseFloat(invoice.total) || 0;
        const [oldLineRows] = yield conn.query('SELECT COUNT(*) AS cnt FROM invoice_lines WHERE invoiceId = ?', [invoiceId]);
        const oldItemCount = parseInt((_c = oldLineRows[0]) === null || _c === void 0 ? void 0 : _c.cnt) || 0;
        conn.release(); // Release before delegating
        // 4. Delegate to existing updateInvoice handler
        req.params.id = invoiceId;
        // Wrap response to intercept the result and create audit log
        const originalJson = res.json.bind(res);
        res.json = function (body) {
            var _a;
            // After successful update, create audit record (fire-and-forget)
            if (!(body === null || body === void 0 ? void 0 : body.error) && res.statusCode < 400) {
                const newTotal = parseFloat(req.body.total) || 0;
                const newItemCount = ((_a = req.body.lines) === null || _a === void 0 ? void 0 : _a.length) || 0;
                (0, db_1.getConnection)().then(auditConn => {
                    auditConn.query(`
                        CREATE TABLE IF NOT EXISTS pos_invoice_edits (
                            id VARCHAR(36) PRIMARY KEY,
                            invoiceId VARCHAR(36) NOT NULL,
                            editedBy VARCHAR(100),
                            editedByName VARCHAR(200),
                            editedAt DATETIME,
                            oldTotal DECIMAL(15,2),
                            newTotal DECIMAL(15,2),
                            oldItemCount INT,
                            newItemCount INT,
                            reason TEXT,
                            INDEX idx_pie_invoiceId (invoiceId)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    `).then(() => {
                        return auditConn.query(`INSERT INTO pos_invoice_edits (id, invoiceId, editedBy, editedByName, editedAt, oldTotal, newTotal, oldItemCount, newItemCount, reason)
                             VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?)`, [
                            (0, crypto_1.randomUUID)(), invoiceId, userId, userName,
                            oldTotal, newTotal, oldItemCount, newItemCount,
                            req.body.editReason || null
                        ]);
                    }).catch(e => console.error('[POS] Audit log error:', e.message))
                        .finally(() => auditConn.release());
                }).catch(e => console.error('[POS] Audit conn error:', e.message));
            }
            return originalJson(body);
        };
        // Import and call updateInvoice
        const { updateInvoice } = yield Promise.resolve().then(() => __importStar(require('./invoiceController')));
        return updateInvoice(req, res);
    }
    catch (error) {
        console.error('[POS] Error in updatePOSInvoice:', error);
        if (conn)
            conn.release();
        res.status(500).json({ error: error.message });
    }
});
exports.updatePOSInvoice = updatePOSInvoice;
