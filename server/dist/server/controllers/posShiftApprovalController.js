"use strict";
/**
 * POS Shift Approval Controller (اعتماد الوردية)
 * ==================================================
 * Phase 6: Admin reviews a closed shift, enters actual cash received,
 * and approves or flags the shift.
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
exports.adminCloseShift = exports.forceApproveShift = exports.approveShift = exports.getShiftSummary = exports.getShiftsForReview = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const dateUtils_1 = require("../../utils/dateUtils");
const accountBalanceUtils_1 = require("../utils/accountBalanceUtils");
const branchFilter_1 = require("../utils/branchFilter");
const eventBus_1 = require("../utils/eventBus");
function getOrCreatePosSurplusAccount(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield conn.query(`SELECT id FROM accounts WHERE name IN ('فائض النقدية (نقطة البيع)', 'فائض ورديات (نقاط بيع)') LIMIT 1`);
        if (rows.length > 0)
            return rows[0].id;
        let code = `REV-POS-${Math.floor(Math.random() * 10000)}`;
        const [existing] = yield conn.query(`SELECT id FROM accounts WHERE code = ? LIMIT 1`, [code]);
        if (existing.length > 0) {
            code = `${code}-${Math.floor(Math.random() * 105)}`;
        }
        const id = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO accounts (id, code, name, type, subType, balance, openingBalance, currencyCode)
         VALUES (?, ?, 'فائض النقدية (نقطة البيع)', 'REVENUE', 'OTHER_REVENUE', 0, 0, 'EGP')`, [id, code]);
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
        let code = `${codePrefix}${Math.floor(Math.random() * 10000)}`;
        const [existing] = yield conn.query(`SELECT id FROM accounts WHERE code = ? LIMIT 1`, [code]);
        if (existing.length > 0) {
            code = `${code}-${Math.floor(Math.random() * 105)}`;
        }
        const id = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO accounts (id, code, name, type, subType, balance, openingBalance, currencyCode)
         VALUES (?, ?, ?, ?, ?, 0, 0, 'EGP')`, [id, code, name, accountType, subType]);
        return id;
    });
}
// ── Schema helpers ─────────────────────────────────────────────────────────
// ── Controllers ────────────────────────────────────────────────────────────
/**
 * GET /api/pos/shifts/review
 * List closed shifts awaiting approval.
 */
const getShiftsForReview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { approvalStatus, cashierId, from, to, page = 1, pageSize = 15, search, hasDiscrepancy } = req.query;
        const offset = (Number(page) - 1) * Number(pageSize);
        const filters = [];
        const params = [];
        (0, branchFilter_1.appendBranchFilter)(filters, params, req, 's');
        if (approvalStatus === 'open') {
            filters.push(`s.status = 'OPEN'`);
        }
        else {
            filters.push(`s.status != 'OPEN'`);
            if (approvalStatus) {
                filters.push(`s.approvalStatus = ?`);
                params.push(approvalStatus);
            }
        }
        if (cashierId) {
            filters.push(`s.userId = ?`);
            params.push(cashierId);
        }
        if (from) {
            filters.push(`s.closedAt >= ?`);
            params.push(String(from).length === 10 ? `${from} 00:00:00` : from);
        }
        if (to) {
            filters.push(`s.closedAt <= ?`);
            params.push(String(to).length === 10 ? `${to} 23:59:59` : to);
        }
        if (search) {
            filters.push(`(u.name LIKE ? OR w.name LIKE ?)`);
            params.push(`%${search}%`, `%${search}%`);
        }
        if (hasDiscrepancy === 'true' || hasDiscrepancy === '1') {
            filters.push(`ABS(COALESCE(s.discrepancyAmount, s.variance, s.closingCash - s.expectedCash)) >= 0.01`);
        }
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        let shifts;
        try {
            [shifts] = (yield conn.query(`SELECT s.id, s.openedAt, s.closedAt, s.status, s.approvalStatus,
                        s.expectedCash, s.closingCash, s.variance, s.openingCash,
                        COALESCE(s.adminOpeningAmount, 0) AS adminOpeningAmount,
                        s.actualCashReceived, s.discrepancyAmount,
                        u.name AS cashierName, w.name AS warehouseName
                 FROM pos_shifts s
                 LEFT JOIN users u ON s.userId COLLATE utf8mb4_unicode_ci = u.id COLLATE utf8mb4_unicode_ci
                 LEFT JOIN warehouses w ON s.warehouseId COLLATE utf8mb4_unicode_ci = w.id COLLATE utf8mb4_unicode_ci
                 ${where}
                 ORDER BY COALESCE(s.closedAt, s.openedAt) DESC
                 LIMIT ? OFFSET ?`, [...params, Number(pageSize), offset]));
        }
        catch (colErr) {
            // adminOpeningAmount column doesn't exist yet — fall back without it
            if (((_a = colErr.message) === null || _a === void 0 ? void 0 : _a.includes('adminOpeningAmount')) || colErr.code === 'ER_BAD_FIELD_ERROR') {
                [shifts] = (yield conn.query(`SELECT s.id, s.openedAt, s.closedAt, s.status, s.approvalStatus,
                            s.expectedCash, s.closingCash, s.variance, s.openingCash,
                            0 AS adminOpeningAmount,
                            s.actualCashReceived, s.discrepancyAmount,
                            u.name AS cashierName, w.name AS warehouseName
                     FROM pos_shifts s
                     LEFT JOIN users u ON s.userId COLLATE utf8mb4_unicode_ci = u.id COLLATE utf8mb4_unicode_ci
                     LEFT JOIN warehouses w ON s.warehouseId COLLATE utf8mb4_unicode_ci = w.id COLLATE utf8mb4_unicode_ci
                     ${where}
                     ORDER BY COALESCE(s.closedAt, s.openedAt) DESC
                     LIMIT ? OFFSET ?`, [...params, Number(pageSize), offset]));
            }
            else {
                throw colErr;
            }
        }
        const [countRows] = yield conn.query(`SELECT COUNT(*) AS total 
             FROM pos_shifts s
             LEFT JOIN users u ON s.userId COLLATE utf8mb4_unicode_ci = u.id COLLATE utf8mb4_unicode_ci
             LEFT JOIN warehouses w ON s.warehouseId COLLATE utf8mb4_unicode_ci = w.id COLLATE utf8mb4_unicode_ci
             ${where}`, params);
        // Global counts across ALL shifts (ignoring active filter, but respecting branch context) for stats cards
        let globalCounts = { pending: 0, flagged: 0, approved: 0, open: 0, total: 0, hasDiscrepancy: 0, totalDiscrepancy: 0 };
        try {
            const gcFilters = [];
            const gcParams = [];
            (0, branchFilter_1.appendBranchFilter)(gcFilters, gcParams, req, 's');
            const gcWhere = gcFilters.length ? `WHERE ${gcFilters.join(' AND ')}` : '';
            const [gcRows] = yield conn.query(`SELECT
                    SUM(CASE WHEN s.status != 'OPEN' AND s.approvalStatus = 'pending' THEN 1 ELSE 0 END) AS pending,
                    SUM(CASE WHEN s.status != 'OPEN' AND s.approvalStatus = 'flagged' THEN 1 ELSE 0 END) AS flagged,
                    SUM(CASE WHEN s.status != 'OPEN' AND s.approvalStatus = 'approved' THEN 1 ELSE 0 END) AS approved,
                    SUM(CASE WHEN s.status = 'OPEN' THEN 1 ELSE 0 END) AS open,
                    SUM(CASE WHEN s.status != 'OPEN' THEN 1 ELSE 0 END) AS total,
                    SUM(CASE
                        WHEN s.status != 'OPEN' AND s.discrepancyAmount IS NOT NULL AND ABS(s.discrepancyAmount) >= 0.01 THEN 1
                        WHEN s.status != 'OPEN' AND s.discrepancyAmount IS NULL AND ABS(COALESCE(s.variance, s.closingCash - s.expectedCash)) >= 0.01 THEN 1
                        ELSE 0
                    END) AS hasDiscrepancy,
                    SUM(CASE
                        WHEN s.status != 'OPEN' AND s.discrepancyAmount IS NOT NULL THEN s.discrepancyAmount
                        WHEN s.status != 'OPEN' THEN COALESCE(s.variance, s.closingCash - s.expectedCash)
                        ELSE 0
                    END) AS totalDiscrepancy
                 FROM pos_shifts s
                 ${gcWhere}`, gcParams);
            const gc = gcRows[0];
            globalCounts = {
                pending: parseInt((gc === null || gc === void 0 ? void 0 : gc.pending) || 0),
                flagged: parseInt((gc === null || gc === void 0 ? void 0 : gc.flagged) || 0),
                approved: parseInt((gc === null || gc === void 0 ? void 0 : gc.approved) || 0),
                open: parseInt((gc === null || gc === void 0 ? void 0 : gc.open) || 0),
                total: parseInt((gc === null || gc === void 0 ? void 0 : gc.total) || 0),
                hasDiscrepancy: parseInt((gc === null || gc === void 0 ? void 0 : gc.hasDiscrepancy) || 0),
                totalDiscrepancy: parseFloat((gc === null || gc === void 0 ? void 0 : gc.totalDiscrepancy) || 0),
            };
        }
        catch (e) {
            console.warn('[POS Approval] globalCounts query failed, using defaults:', e);
        }
        res.json({
            shifts,
            total: ((_b = countRows[0]) === null || _b === void 0 ? void 0 : _b.total) || 0,
            page: Number(page),
            pageSize: Number(pageSize),
            globalCounts,
        });
    }
    catch (error) {
        console.error('[POS Approval] getShiftsForReview error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getShiftsForReview = getShiftsForReview;
/**
 * GET /api/pos/shifts/:shiftId/summary
 * Full financial picture for admin review.
 */
const getShiftSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId } = req.params;
        const { cashierId } = req.query;
        const [shiftRows] = yield conn.query(`SELECT s.*,
                    u.name AS cashierName,
                    w.name AS warehouseName,
                    a.name AS treasuryName
             FROM pos_shifts s
             LEFT JOIN users u ON s.userId COLLATE utf8mb4_unicode_ci = u.id COLLATE utf8mb4_unicode_ci
             LEFT JOIN warehouses w ON s.warehouseId COLLATE utf8mb4_unicode_ci = w.id COLLATE utf8mb4_unicode_ci
             LEFT JOIN accounts a ON s.treasuryId COLLATE utf8mb4_unicode_ci = a.id COLLATE utf8mb4_unicode_ci
             WHERE s.id = ? COLLATE utf8mb4_unicode_ci`, [shiftId]);
        if (shiftRows.length === 0) {
            return res.status(404).json({ error: 'الوردية غير موجودة' });
        }
        const shift = shiftRows[0];
        const { branchId, isPrivileged } = (0, branchFilter_1.resolveBranchScope)(req);
        if (!isPrivileged && branchId && shift.branchId && shift.branchId !== branchId) {
            return res.status(403).json({ error: 'ليس لديك صلاحية للوصول إلى بيانات هذا الفرع' });
        }
        // ── DIAGNOSTIC: Debug Hostinger empty invoices ──────────────────
        try {
            const [diagAll] = yield conn.query(`SELECT COUNT(*) AS cnt FROM invoices WHERE posShiftId = ?`, [shiftId]);
            const [diagPOS] = yield conn.query(`SELECT COUNT(*) AS cnt FROM invoices WHERE posShiftId = ? AND isPOSSale = 1`, [shiftId]);
            const [diagCollate] = yield conn.query(`SELECT COUNT(*) AS cnt FROM invoices WHERE posShiftId COLLATE utf8mb4_unicode_ci = ?`, [shiftId]);
            console.log(`🔍 [ShiftSummary] shiftId=${shiftId}, all=${(_a = diagAll[0]) === null || _a === void 0 ? void 0 : _a.cnt}, withPOS=${(_b = diagPOS[0]) === null || _b === void 0 ? void 0 : _b.cnt}, withCollate=${(_c = diagCollate[0]) === null || _c === void 0 ? void 0 : _c.cnt}`);
        }
        catch (diagErr) {
            console.error(`🔍 [ShiftSummary] DIAG ERROR: ${diagErr.message}`);
        }
        // ── END DIAGNOSTIC ─────────────────────────────────────────────
        let cashierFilterInvoices = '';
        let queryParamsInvoices = [shiftId];
        // Check if cashier sessions actually exist before applying time-range filter
        let hasCashierSessions = false;
        if (cashierId) {
            const [sessionCheck] = yield conn.query(`SELECT COUNT(*) AS cnt FROM pos_cashier_shifts WHERE shiftId COLLATE utf8mb4_unicode_ci = ? AND cashierId COLLATE utf8mb4_unicode_ci = ?`, [shiftId, cashierId]);
            hasCashierSessions = parseInt(((_d = sessionCheck[0]) === null || _d === void 0 ? void 0 : _d.cnt) || 0) > 0;
        }
        if (cashierId && hasCashierSessions) {
            cashierFilterInvoices = ` AND invoices.createdAt >= (
                SELECT MAX(startedAt) FROM pos_cashier_shifts pcs 
                WHERE pcs.shiftId COLLATE utf8mb4_unicode_ci = ? AND pcs.cashierId COLLATE utf8mb4_unicode_ci = ?
            ) AND invoices.createdAt <= COALESCE((
                SELECT endedAt FROM pos_cashier_shifts pcs 
                WHERE pcs.shiftId COLLATE utf8mb4_unicode_ci = ? AND pcs.cashierId COLLATE utf8mb4_unicode_ci = ?
                ORDER BY startedAt DESC LIMIT 1
            ), '2099-12-31 23:59:59')`;
            queryParamsInvoices.push(shiftId, cashierId, shiftId, cashierId);
        }
        // Sales summary from invoices — with type-specific counts
        const [salesRows] = yield conn.query(`SELECT
                COUNT(*) AS invoiceCount,
                SUM(CASE WHEN type = 'INVOICE_SALE' THEN 1 ELSE 0 END) AS saleCount,
                SUM(CASE WHEN type = 'RETURN_SALE' THEN 1 ELSE 0 END) AS returnCount,
                SUM(CASE WHEN paymentMethod = 'DEFERRED' THEN 1 ELSE 0 END) AS deferredCount,
                COALESCE(SUM(CASE WHEN type = 'INVOICE_SALE' THEN total ELSE 0 END), 0) AS grossSales,
                COALESCE(SUM(CASE WHEN type = 'RETURN_SALE' THEN total ELSE 0 END), 0) AS totalReturns,
                COALESCE(SUM(CASE WHEN type = 'RETURN_SALE' THEN -total ELSE total END), 0) AS totalSales,
                COALESCE(SUM(CASE WHEN type = 'INVOICE_SALE' THEN COALESCE(globalDiscount, 0) ELSE 0 END), 0) AS totalDiscounts,
                COALESCE(SUM(CASE WHEN type = 'INVOICE_SALE' THEN COALESCE(shippingFee, 0) ELSE 0 END), 0) AS totalShipping,
                COALESCE(SUM(CASE WHEN paymentMethod = 'CASH' THEN (CASE WHEN type = 'RETURN_SALE' THEN -total ELSE total END) ELSE 0 END), 0) AS cashSales,
                COALESCE(SUM(CASE WHEN paymentMethod = 'BANK' THEN (CASE WHEN type = 'RETURN_SALE' THEN -total ELSE total END) ELSE 0 END), 0) AS cardSales,
                COALESCE(SUM(CASE WHEN paymentMethod NOT IN ('CASH','BANK') THEN (CASE WHEN type = 'RETURN_SALE' THEN -total ELSE total END) ELSE 0 END), 0) AS otherSales
             FROM invoices
             WHERE posShiftId COLLATE utf8mb4_unicode_ci = ? AND isPOSSale = 1 AND type IN ('INVOICE_SALE', 'RETURN_SALE')${cashierFilterInvoices}`, queryParamsInvoices);
        const sales = salesRows[0];
        // Expenses summary
        let expenses = { fromDailyTakings: 0, fromPriorBalance: 0, total: 0, breakdown: [] };
        let cashierFilterExpenses = '';
        let queryParamsExpenses = [shiftId];
        if (cashierId && hasCashierSessions) {
            cashierFilterExpenses = ` AND e.createdAt >= (
                SELECT MAX(startedAt) FROM pos_cashier_shifts pcs 
                WHERE pcs.shiftId COLLATE utf8mb4_unicode_ci = ? AND pcs.cashierId COLLATE utf8mb4_unicode_ci = ?
            ) AND e.createdAt <= COALESCE((
                SELECT endedAt FROM pos_cashier_shifts pcs 
                WHERE pcs.shiftId COLLATE utf8mb4_unicode_ci = ? AND pcs.cashierId COLLATE utf8mb4_unicode_ci = ?
                ORDER BY startedAt DESC LIMIT 1
            ), '2099-12-31 23:59:59')`;
            queryParamsExpenses.push(shiftId, cashierId, shiftId, cashierId);
        }
        try {
            const [expRows] = yield conn.query(`SELECT e.sourceType, COALESCE(SUM(e.amount), 0) AS total
                 FROM pos_expenses e
                 WHERE e.shiftId = ? COLLATE utf8mb4_unicode_ci${cashierFilterExpenses.replace(/e\.createdAt/g, 'e.createdAt')}
                 GROUP BY e.sourceType`, queryParamsExpenses);
            for (const row of expRows) {
                const amt = parseFloat(row.total);
                if (row.sourceType === 'daily_takings')
                    expenses.fromDailyTakings = amt;
                else
                    expenses.fromPriorBalance = amt;
            }
            expenses.total = expenses.fromDailyTakings + expenses.fromPriorBalance;
            const [breakdownRows] = yield conn.query(`SELECT c.name AS category, COALESCE(SUM(e.amount), 0) AS amount
                 FROM pos_expenses e
                 LEFT JOIN pos_expense_categories c ON e.categoryId COLLATE utf8mb4_unicode_ci = c.id COLLATE utf8mb4_unicode_ci
                 WHERE e.shiftId = ? COLLATE utf8mb4_unicode_ci${cashierFilterExpenses.replace(/e\.createdAt/g, 'e.createdAt')}
                 GROUP BY c.name`, queryParamsExpenses);
            expenses.breakdown = breakdownRows;
        }
        catch (e) {
            console.error('Failed to load expenses breakdown for shift summary:', e);
        }
        // Fetch detailed quick expenses list for shift review
        let expensesList = [];
        try {
            const [expDetails] = yield conn.query(`SELECT e.id, e.categoryId, e.entityId, e.entityType, e.description, e.amount, e.sourceType, e.createdAt, c.name AS categoryName, u.name AS cashierName
                 FROM pos_expenses e
                 LEFT JOIN pos_expense_categories c ON e.categoryId COLLATE utf8mb4_unicode_ci = c.id COLLATE utf8mb4_unicode_ci
                 LEFT JOIN users u ON e.createdBy COLLATE utf8mb4_unicode_ci = u.id COLLATE utf8mb4_unicode_ci
                 WHERE e.shiftId = ? COLLATE utf8mb4_unicode_ci${cashierFilterExpenses.replace(/e\.createdAt/g, 'e.createdAt')}
                 ORDER BY e.createdAt DESC`, queryParamsExpenses);
            expensesList = expDetails;
        }
        catch (e) {
            console.error('Failed to load detailed expenses for shift summary:', e);
        }
        // Fetch detailed invoices list for shift review — include type for UI badges
        let invoicesList = [];
        let cashierFilterInvoicesList = '';
        let queryParamsInvoicesList = [shiftId];
        if (cashierId && hasCashierSessions) {
            cashierFilterInvoicesList = ` AND i.createdAt >= (
                SELECT MAX(startedAt) FROM pos_cashier_shifts pcs 
                WHERE pcs.shiftId COLLATE utf8mb4_unicode_ci = ? AND pcs.cashierId COLLATE utf8mb4_unicode_ci = ?
            ) AND i.createdAt <= COALESCE((
                SELECT endedAt FROM pos_cashier_shifts pcs 
                WHERE pcs.shiftId COLLATE utf8mb4_unicode_ci = ? AND pcs.cashierId COLLATE utf8mb4_unicode_ci = ?
                ORDER BY startedAt DESC LIMIT 1
            ), '2099-12-31 23:59:59')`;
            queryParamsInvoicesList.push(shiftId, cashierId, shiftId, cashierId);
        }
        try {
            const [invRows] = yield conn.query(`SELECT i.id, i.number, i.date, i.type, i.partnerName, i.total,
                        i.paymentMethod, i.posted, i.notes, i.createdAt, i.paymentBreakdown,
                        COALESCE(i.bankName, a.name, 
                            CASE i.paymentMethod 
                                WHEN 'CASH' THEN 'نقدي'
                                WHEN 'TREASURY' THEN 'خزينة'
                                WHEN 'DEFERRED' THEN 'آجل'
                                WHEN 'CHEQUE' THEN 'شيك'
                                ELSE i.paymentMethod 
                            END
                        ) as paymentMethodName
                 FROM invoices i
                 LEFT JOIN accounts a ON i.bankAccountId COLLATE utf8mb4_unicode_ci = a.id COLLATE utf8mb4_unicode_ci
                 WHERE i.posShiftId COLLATE utf8mb4_unicode_ci = ? AND i.isPOSSale = 1${cashierFilterInvoicesList}
                 ORDER BY i.createdAt DESC`, queryParamsInvoicesList);
            invoicesList = invRows;
        }
        catch (e) {
            console.warn('[POS Approval] invoiceList query failed:', e);
        }
        // Complete cash flow from pos_cash_movements
        let cashFlow = { deposits: 0, withdrawals: 0 };
        let paymentMethodDetails = [];
        let trueCashSales = 0;
        let trueCardSales = 0;
        let trueOtherSales = 0;
        let cashierFilterMovements = '';
        let queryParamsMovements = [shiftId];
        if (cashierId && hasCashierSessions) {
            cashierFilterMovements = ` AND pcm.createdAt >= (
                SELECT MAX(startedAt) FROM pos_cashier_shifts pcs 
                WHERE pcs.shiftId COLLATE utf8mb4_unicode_ci = ? AND pcs.cashierId COLLATE utf8mb4_unicode_ci = ?
            ) AND pcm.createdAt <= COALESCE((
                SELECT endedAt FROM pos_cashier_shifts pcs 
                WHERE pcs.shiftId COLLATE utf8mb4_unicode_ci = ? AND pcs.cashierId COLLATE utf8mb4_unicode_ci = ?
                ORDER BY startedAt DESC LIMIT 1
            ), '2099-12-31 23:59:59')`;
            queryParamsMovements.push(shiftId, cashierId, shiftId, cashierId);
        }
        try {
            const [pmRows] = yield conn.query(`SELECT pcm.paymentMethod, pcm.type AS movementType,
                        COUNT(*) AS count, COALESCE(SUM(pcm.amount), 0) AS total
                 FROM pos_cash_movements pcm
                 WHERE pcm.shiftId = ? COLLATE utf8mb4_unicode_ci${cashierFilterMovements}
                 GROUP BY pcm.paymentMethod, pcm.type
                 ORDER BY pcm.paymentMethod`, queryParamsMovements);
            paymentMethodDetails = pmRows;
            // Post-process paymentMethodDetails to split BANK method into actual bank accounts by parsing invoice breakdowns
            const bankSplitsMap = new Map();
            for (const inv of invoicesList) {
                let movementType = 'SALE';
                if (inv.type === 'RETURN_SALE' || inv.type === 'RETURN_PURCHASE') {
                    movementType = 'REFUND';
                }
                else if (inv.type === 'INVOICE_PURCHASE') {
                    movementType = 'PURCHASE';
                }
                let splits = [];
                if (inv.paymentBreakdown) {
                    try {
                        const parsed = typeof inv.paymentBreakdown === 'string'
                            ? JSON.parse(inv.paymentBreakdown)
                            : inv.paymentBreakdown;
                        if (Array.isArray(parsed)) {
                            splits = parsed;
                        }
                    }
                    catch (e) {
                        console.error('Failed to parse paymentBreakdown in getShiftSummary:', e);
                    }
                }
                if (splits.length === 0) {
                    if (inv.paymentMethod === 'BANK') {
                        const accName = inv.paymentMethodName || 'شبكة / بنك';
                        const key = `${accName}_${movementType}`;
                        const existing = bankSplitsMap.get(key);
                        if (existing) {
                            existing.total += parseFloat(inv.total || 0);
                            existing.count += 1;
                        }
                        else {
                            bankSplitsMap.set(key, {
                                paymentMethod: accName,
                                movementType,
                                count: 1,
                                total: parseFloat(inv.total || 0)
                            });
                        }
                    }
                }
                else {
                    for (const split of splits) {
                        if (split.method === 'BANK') {
                            const accName = split.accountName || inv.paymentMethodName || 'شبكة / بنك';
                            const key = `${accName}_${movementType}`;
                            const existing = bankSplitsMap.get(key);
                            if (existing) {
                                existing.total += parseFloat(split.amount || 0);
                                existing.count += 1;
                            }
                            else {
                                bankSplitsMap.set(key, {
                                    paymentMethod: accName,
                                    movementType,
                                    count: 1,
                                    total: parseFloat(split.amount || 0)
                                });
                            }
                        }
                    }
                }
            }
            const finalPMDetails = [];
            const hasBankSplits = bankSplitsMap.size > 0;
            for (const row of paymentMethodDetails) {
                if (row.paymentMethod === 'BANK') {
                    if (hasBankSplits) {
                        continue;
                    }
                }
                finalPMDetails.push(row);
            }
            if (hasBankSplits) {
                for (const split of bankSplitsMap.values()) {
                    finalPMDetails.push(split);
                }
            }
            paymentMethodDetails = finalPMDetails;
            // Calculate deposits (excluding OPENING as it's tracked in openingAmounts) and withdrawals
            for (const row of paymentMethodDetails) {
                const amount = parseFloat(row.total);
                if (row.movementType === 'DEPOSIT')
                    cashFlow.deposits += amount;
                if (row.movementType === 'WITHDRAWAL' || row.movementType === 'PURCHASE')
                    cashFlow.withdrawals += amount;
                // Calculate true sales from movements to handle mixed payments correctly
                // Note: For true sales calculation, we map the detailed bank accounts back to BANK/cardSalesAmt
                const isBank = row.paymentMethod !== 'CASH' && row.paymentMethod !== 'DEFERRED' && row.paymentMethod !== 'CHEQUE';
                if (row.movementType === 'SALE') {
                    if (row.paymentMethod === 'CASH')
                        trueCashSales += amount;
                    else if (isBank)
                        trueCardSales += amount;
                    else
                        trueOtherSales += amount;
                }
                else if (row.movementType === 'REFUND') {
                    if (row.paymentMethod === 'CASH')
                        trueCashSales -= amount;
                    else if (isBank)
                        trueCardSales -= amount;
                    else
                        trueOtherSales -= amount;
                }
            }
        }
        catch (e) {
            console.error('Error grouping bank accounts in getShiftSummary:', e);
        }
        const expectedCash = parseFloat(shift.expectedCash || 0);
        const cashierOpening = parseFloat(shift.adminOpeningAmount || 0);
        const totalOpening = parseFloat(shift.openingCash || 0);
        const adminOpening = totalOpening - cashierOpening;
        // Use true sales from movements if available, otherwise fallback to invoice-based
        const hasMovementData = trueCashSales !== 0 || trueCardSales !== 0 || trueOtherSales !== 0;
        const cashSalesAmt = hasMovementData ? trueCashSales : parseFloat((sales === null || sales === void 0 ? void 0 : sales.cashSales) || 0);
        const cardSalesAmt = hasMovementData ? trueCardSales : parseFloat((sales === null || sales === void 0 ? void 0 : sales.cardSales) || 0);
        const otherSalesAmt = hasMovementData ? trueOtherSales : parseFloat((sales === null || sales === void 0 ? void 0 : sales.otherSales) || 0);
        // Fetch cashier sub-shifts (who worked when during this shift)
        let cashierShifts = [];
        try {
            const [csRows] = yield conn.query(`SELECT cs.id, cs.cashierId, cs.startedAt, cs.endedAt, c.name AS cashierName
                 FROM pos_cashier_shifts cs
                 LEFT JOIN pos_cashiers c ON cs.cashierId COLLATE utf8mb4_unicode_ci = c.id COLLATE utf8mb4_unicode_ci
                 WHERE cs.shiftId = ? COLLATE utf8mb4_unicode_ci
                 ORDER BY cs.startedAt ASC`, [shiftId]);
            cashierShifts = csRows;
        }
        catch ( /* table may not exist */_e) { /* table may not exist */ }
        // Fetch warehouse transfers made during this POS shift
        let stockTransfers = [];
        try {
            const [transferRows] = yield conn.query(`SELECT sp.id, sp.date, sp.description, sp.createdBy, sp.createdAt,
                        sw.name AS sourceWarehouseName, dw.name AS destWarehouseName,
                        GROUP_CONCAT(CONCAT(spi.productName, ' x', CAST(spi.quantity AS CHAR)) SEPARATOR ' | ') AS itemsSummary,
                        COUNT(spi.id) AS itemCount,
                        SUM(spi.quantity) AS totalQty
                 FROM stock_permits sp
                 LEFT JOIN warehouses sw ON sp.sourceWarehouseId = sw.id
                 LEFT JOIN warehouses dw ON sp.destWarehouseId = dw.id
                 LEFT JOIN stock_permit_items spi ON sp.id = spi.permitId
                 WHERE sp.posShiftId = ? AND sp.type = 'STOCK_TRANSFER'
                 GROUP BY sp.id
                 ORDER BY sp.createdAt DESC`, [shiftId]);
            stockTransfers = transferRows;
        }
        catch (e) {
            console.warn('[POS Approval] stockTransfers query failed (column may not exist yet):', e);
        }
        // Fetch post-close edit history for warning banner
        let postCloseEdits = [];
        try {
            const [editRows] = yield conn.query(`SELECT pie.id, pie.invoiceId, pie.editedByName, pie.editedAt,
                        pie.oldPaymentMethod, pie.newPaymentMethod,
                        pie.oldTotal, pie.newTotal, pie.shiftWasValidated, pie.reason,
                        i.number AS invoiceNumber
                 FROM pos_invoice_edits pie
                 LEFT JOIN invoices i ON pie.invoiceId COLLATE utf8mb4_unicode_ci = i.id COLLATE utf8mb4_unicode_ci
                 WHERE pie.invoiceId IN (
                     SELECT id FROM invoices WHERE posShiftId COLLATE utf8mb4_unicode_ci = ?
                 )
                 ORDER BY pie.editedAt DESC`, [shiftId]);
            postCloseEdits = editRows;
        }
        catch (_f) {
            // Table or columns may not exist yet — non-fatal
        }
        let parsedBankDetails = null;
        if (shift.closingBankDetails) {
            try {
                parsedBankDetails = JSON.parse(shift.closingBankDetails);
            }
            catch (e) {
                console.error('Failed to parse closingBankDetails in getShiftSummary:', e);
            }
        }
        res.json({
            session: {
                id: shift.id,
                openedAt: shift.openedAt,
                closedAt: shift.closedAt,
                status: shift.status,
                approvalStatus: shift.approvalStatus,
                cashier: { id: shift.userId, name: shift.cashierName },
                warehouse: { id: shift.warehouseId, name: shift.warehouseName },
                treasury: { id: shift.treasuryId, name: shift.treasuryName },
                closingCash: shift.closingCash,
                closingCard: shift.closingCard,
                expectedCard: shift.expectedCard,
                varianceCard: shift.varianceCard,
                closingBankDetails: parsedBankDetails,
                notes: shift.notes,
            },
            openingAmounts: {
                cashierAmount: cashierOpening,
                adminAmount: adminOpening,
                total: totalOpening,
            },
            sales: {
                invoiceCount: parseInt((sales === null || sales === void 0 ? void 0 : sales.invoiceCount) || 0),
                saleCount: parseInt((sales === null || sales === void 0 ? void 0 : sales.saleCount) || 0),
                returnCount: parseInt((sales === null || sales === void 0 ? void 0 : sales.returnCount) || 0),
                deferredCount: parseInt((sales === null || sales === void 0 ? void 0 : sales.deferredCount) || 0),
                grossSales: parseFloat((sales === null || sales === void 0 ? void 0 : sales.grossSales) || 0),
                totalReturns: parseFloat((sales === null || sales === void 0 ? void 0 : sales.totalReturns) || 0),
                totalSales: parseFloat((sales === null || sales === void 0 ? void 0 : sales.totalSales) || 0),
                totalDiscounts: parseFloat((sales === null || sales === void 0 ? void 0 : sales.totalDiscounts) || 0),
                totalShipping: parseFloat((sales === null || sales === void 0 ? void 0 : sales.totalShipping) || 0),
                paymentBreakdown: {
                    cash: cashSalesAmt,
                    card: cardSalesAmt,
                    other: otherSalesAmt,
                },
            },
            expenses,
            cashFlow,
            expectedCash,
            actualCashReceived: shift.actualCashReceived,
            discrepancyAmount: shift.discrepancyAmount,
            discrepancyNotes: shift.discrepancyNotes,
            adminNotes: shift.adminNotes,
            adminShortageEmployeeId: shift.adminShortageEmployeeId,
            approvedBy: shift.approvedBy,
            approvedAt: shift.approvedAt,
            invoices: invoicesList,
            paymentMethodDetails,
            expensesDetail: expensesList,
            cashierShifts,
            stockTransfers,
            postCloseEdits,
        });
    }
    catch (error) {
        console.error('[POS Approval] getShiftSummary error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getShiftSummary = getShiftSummary;
// ── Shared Journal Rewriting Helper ──────────────────────────────────────────
function rewriteShiftJournal(conn, shift, actualCash, adminShortageEmployeeId, userId, now) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!shift.treasuryId || !shift.closingRecipientId) {
            return; // Cashier didn't specify where they put the cash, or no POS treasury
        }
        let targetAccountId = null;
        let shortageAccountId = null;
        // 1. Resolve Target Account ID (Where actual cash goes)
        if (shift.closingRecipientType === 'TREASURY') {
            targetAccountId = shift.closingRecipientId;
        }
        else if (shift.closingRecipientType === 'EMPLOYEE') {
            const [empRows] = yield conn.query('SELECT treasuryAccountId FROM employees WHERE id = ?', [shift.closingRecipientId]);
            if (empRows.length > 0 && empRows[0].treasuryAccountId) {
                targetAccountId = empRows[0].treasuryAccountId;
            }
        }
        // 2. Resolve Admin Shortage Account ID
        const discrepancyAmount = actualCash - parseFloat(shift.expectedCash || 0);
        if (discrepancyAmount < -0.001 && adminShortageEmployeeId) {
            const [shortageEmpRows] = yield conn.query('SELECT treasuryAccountId FROM employees WHERE id = ?', [adminShortageEmployeeId]);
            if (shortageEmpRows.length > 0 && shortageEmpRows[0].treasuryAccountId) {
                shortageAccountId = shortageEmpRows[0].treasuryAccountId;
            }
        }
        if (!targetAccountId) {
            return; // Cannot resolve target account, skip journal rewriting
        }
        // 3. Find and Delete existing journal entry from closeShift
        const [oldJournals] = yield conn.query(`SELECT id FROM journal_entries WHERE referenceId = ? AND description LIKE ?`, [shift.id, '%إغلاق وردية%']);
        if (oldJournals.length > 0) {
            const oldJournalId = oldJournals[0].id;
            // Find affected accounts to recalculate their balances later
            const [oldLines] = yield conn.query(`SELECT accountId FROM journal_lines WHERE journalId = ?`, [oldJournalId]);
            const oldAccountIds = oldLines.map(r => r.accountId).filter(id => id);
            // Delete lines and header
            yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [oldJournalId]);
            yield conn.query('DELETE FROM journal_entries WHERE id = ?', [oldJournalId]);
            // Recalculate balances for the deleted accounts to reset them
            if (oldAccountIds.length > 0) {
                yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, Array.from(new Set(oldAccountIds)));
            }
        }
        // 4. Create new Approved Journal Entry
        const journalId = (0, crypto_1.randomUUID)();
        const journalDescription = `إغلاق وردية نقطة البيع ${shift.id} (بعد الاعتماد) ${Number(shift.adminOpeningAmount || 0)}`;
        yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, branchId)
         VALUES (?, ?, ?, ?, ?, 'EGP', 1, ?)`, [journalId, now, journalDescription, shift.id, userId, shift.branchId || null]);
        const journalLines = [];
        let posCredit = actualCash;
        let surplusAccountId = null;
        let surplusAmount = 0;
        // Debit Target Treasury/Employee (Actual cash received)
        if (actualCash > 0) {
            journalLines.push([
                journalId, targetAccountId, 'تسليم نقدية الوردية', actualCash, 0, 'EGP', 1, actualCash, 0
            ]);
        }
        // Debit Shortage Employee (The Admin assigned shortage)
        if (discrepancyAmount < -0.001 && shortageAccountId) {
            const shortageAmount = Math.abs(discrepancyAmount);
            journalLines.push([
                journalId, shortageAccountId, 'عجز وردية - موظف', shortageAmount, 0, 'EGP', 1, shortageAmount, 0
            ]);
            posCredit += shortageAmount; // Equals expectedCash
        }
        // Expenses already have individual journal entries created at time of expense (addExpense).
        // They are already credited to the POS Treasury. Therefore, we do NOT add them to posCredit
        // here to avoid double-crediting the treasury. posCredit represents the expectedCash (physical drawer cash remaining).
        // Credit Surplus Account
        if (discrepancyAmount > 0.001) {
            surplusAmount = discrepancyAmount;
            surplusAccountId = yield getOrCreatePosSurplusAccount(conn);
            journalLines.push([
                journalId, surplusAccountId, 'فائض إغلاق وردية (اعتماد)', 0, surplusAmount, 'EGP', 1, 0, surplusAmount
            ]);
            posCredit -= surplusAmount; // Equals expectedCash
        }
        // Credit POS Treasury (should exactly equal Sales + Opening after subtracting Surplus and adding Expenses/Shortage)
        if (Math.abs(posCredit) > 0.001) {
            journalLines.push([
                journalId, shift.treasuryId, 'خزينة نقطة البيع', 0, posCredit, 'EGP', 1, 0, posCredit
            ]);
        }
        // Consolidate lines to prevent double counting in ledger UI when Target Treasury == POS Treasury
        const consolidatedMap = new Map();
        for (const line of journalLines) {
            const accId = line[1];
            if (!consolidatedMap.has(accId)) {
                consolidatedMap.set(accId, [...line]);
            }
            else {
                const existing = consolidatedMap.get(accId);
                existing[3] += line[3]; // debit
                existing[4] += line[4]; // credit
                existing[7] += line[7]; // foreignDebit
                existing[8] += line[8]; // foreignCredit
            }
        }
        const finalJournalLines = [];
        for (const [accId, line] of consolidatedMap.entries()) {
            let debit = Number(line[3].toFixed(2));
            let credit = Number(line[4].toFixed(2));
            if (debit > credit) {
                debit = Number((debit - credit).toFixed(2));
                credit = 0;
            }
            else if (credit > debit) {
                credit = Number((credit - debit).toFixed(2));
                debit = 0;
            }
            else {
                continue; // Cancels out entirely
            }
            line[3] = debit;
            line[4] = credit;
            line[7] = debit;
            line[8] = credit;
            finalJournalLines.push(line);
        }
        if (finalJournalLines.length > 0) {
            yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [finalJournalLines]);
            const affectedAccountIds = new Set();
            if (targetAccountId)
                affectedAccountIds.add(targetAccountId);
            if (shortageAccountId)
                affectedAccountIds.add(shortageAccountId);
            if (surplusAccountId)
                affectedAccountIds.add(surplusAccountId);
            if (shift.treasuryId)
                affectedAccountIds.add(shift.treasuryId);
            yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, Array.from(affectedAccountIds));
        }
        // HR Integration: Register Employee Shortage automatically
        if (discrepancyAmount < -0.001 && adminShortageEmployeeId) {
            const shortageAmount = Math.abs(discrepancyAmount);
            const advanceId = (0, crypto_1.randomUUID)();
            // Check if we already inserted it to avoid duplicates on re-approval
            const [existing] = yield conn.query(`SELECT id FROM employee_advances WHERE employeeId = ? AND amount = ? AND reason LIKE ? AND issueDate = ? LIMIT 1`, [adminShortageEmployeeId, shortageAmount, `%إغلاق وردية نقطة البيع ${shift.id}%`, now.split('T')[0]]);
            if (existing.length === 0) {
                yield conn.query(`INSERT INTO employee_advances (id, employeeId, type, loanType, amount, reason, issueDate, monthlyDeduction, totalPaid, remainingAmount, status)
                 VALUES (?, ?, 'SHORTAGE', 'SHORTAGE', ?, ?, ?, 0, 0, ?, 'ACTIVE')`, [advanceId, adminShortageEmployeeId, shortageAmount, `عجز إغلاق وردية نقطة البيع ${shift.id}`, now.split('T')[0], shortageAmount]);
            }
        }
    });
}
/**
 * POST /api/pos/shifts/:shiftId/approve
 */
const approveShift = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId } = req.params;
        const { actualCashReceived, adminNotes, discrepancyNotes, adminShortageEmployeeId } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (actualCashReceived === undefined || actualCashReceived === null) {
            return res.status(400).json({ error: 'المبلغ الفعلي المُسلَّم مطلوب' });
        }
        // Verify shift is closed
        const [shifts] = yield conn.query(`SELECT s.*, COALESCE(s.adminOpeningAmount, 0) AS adminOpeningAmount
             FROM pos_shifts s
             WHERE s.id = ? COLLATE utf8mb4_unicode_ci`, [shiftId]);
        if (shifts.length === 0) {
            return res.status(404).json({ error: 'الوردية غير موجودة' });
        }
        const shift = shifts[0];
        const { branchId, isPrivileged } = (0, branchFilter_1.resolveBranchScope)(req);
        if (!isPrivileged && branchId && shift.branchId && shift.branchId !== branchId) {
            return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل وردية هذا الفرع' });
        }
        if (shift.status === 'OPEN') {
            return res.status(400).json({ error: 'لا يمكن اعتماد وردية لا تزال مفتوحة' });
        }
        const expectedCash = parseFloat(shift.expectedCash || 0);
        const actual = parseFloat(actualCashReceived);
        const discrepancyAmount = actual - expectedCash;
        // Auto-approve if: no discrepancy, surplus (positive), or deficit assigned to employee.
        // Only flag deficits (negative discrepancy) without an assigned shortage employee.
        const isBalanced = Math.abs(discrepancyAmount) < 0.01;
        const isSurplus = discrepancyAmount > 0.01;
        const isDeficitAssigned = discrepancyAmount < -0.01 && adminShortageEmployeeId;
        const approvalStatus = (isBalanced || isSurplus || isDeficitAssigned) ? 'approved' : 'flagged';
        const now = (0, dateUtils_1.getEgyptianISOString)();
        yield conn.query('START TRANSACTION');
        // Also transition status to VALIDATED so POSShifts list reflects approval
        const newStatus = approvalStatus === 'approved' ? 'VALIDATED' : 'PENDING_VALIDATION';
        yield conn.query(`UPDATE pos_shifts SET
                status = ?, approvalStatus = ?, approvedBy = ?, approvedAt = ?,
                validatedBy = ?, validatedAt = ?,
                actualCashReceived = ?, discrepancyAmount = ?,
                discrepancyNotes = ?, adminNotes = ?, adminShortageEmployeeId = ?
             WHERE id = ? COLLATE utf8mb4_unicode_ci`, [
            newStatus, approvalStatus, userId, now,
            userId, now,
            actual, discrepancyAmount,
            discrepancyNotes || null, adminNotes || null, adminShortageEmployeeId || null,
            shiftId,
        ]);
        if (approvalStatus === 'approved') {
            yield rewriteShiftJournal(conn, shift, actual, adminShortageEmployeeId, userId, now);
        }
        yield conn.query('COMMIT');
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'journal', updatedBy: userId });
        res.json({
            success: true,
            approvalStatus,
            expectedCash,
            actualCashReceived: actual,
            discrepancyAmount,
            message: approvalStatus === 'approved'
                ? 'تم اعتماد الوردية بنجاح'
                : `تم تسجيل الوردية مع فرق: ${discrepancyAmount > 0 ? '+' : ''}${discrepancyAmount.toFixed(2)}`,
        });
    }
    catch (error) {
        if (conn)
            yield conn.query('ROLLBACK');
        console.error('[POS Approval] approveShift error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.approveShift = approveShift;
/**
 * POST /api/pos/shifts/:shiftId/force-approve
 * Forces approvalStatus = 'approved' regardless of discrepancy.
 */
const forceApproveShift = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId } = req.params;
        const { actualCashReceived, adminNotes, discrepancyNotes, adminShortageEmployeeId } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (actualCashReceived === undefined) {
            return res.status(400).json({ error: 'المبلغ الفعلي المُسلَّم مطلوب' });
        }
        const actual = parseFloat(actualCashReceived);
        const now = (0, dateUtils_1.getEgyptianISOString)();
        // We still compute discrepancy for the record, but force 'approved'
        const [shifts] = yield conn.query(`SELECT s.*, COALESCE(s.adminOpeningAmount, 0) AS adminOpeningAmount
             FROM pos_shifts s WHERE s.id = ? COLLATE utf8mb4_unicode_ci`, [shiftId]);
        if (shifts.length === 0 || shifts[0].status === 'OPEN') {
            return res.status(400).json({ error: 'الوردية غير موجودة أو لا تزال مفتوحة' });
        }
        const shift = shifts[0];
        const { branchId, isPrivileged } = (0, branchFilter_1.resolveBranchScope)(req);
        if (!isPrivileged && branchId && shift.branchId && shift.branchId !== branchId) {
            return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل وردية هذا الفرع' });
        }
        yield conn.query('START TRANSACTION');
        yield conn.query(`UPDATE pos_shifts SET
                status = 'VALIDATED', approvalStatus = 'approved',
                approvedBy = ?, approvedAt = ?,
                validatedBy = ?, validatedAt = ?,
                actualCashReceived = ?, discrepancyAmount = ?,
                discrepancyNotes = ?, adminNotes = ?, adminShortageEmployeeId = ?
             WHERE id = ? COLLATE utf8mb4_unicode_ci`, [userId, now, userId, now, actual, actual - parseFloat(shift.expectedCash || 0), discrepancyNotes || null, adminNotes || null, adminShortageEmployeeId || null, shiftId]);
        yield rewriteShiftJournal(conn, shift, actual, adminShortageEmployeeId, userId, now);
        yield conn.query('COMMIT');
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'journal', updatedBy: userId });
        res.json({ success: true, approvalStatus: 'approved', message: 'تم اعتماد الوردية بالقوة وتحديث الحسابات المادية' });
    }
    catch (error) {
        if (conn)
            yield conn.query('ROLLBACK');
        console.error('[POS Approval] forceApproveShift error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.forceApproveShift = forceApproveShift;
/**
 * POST /api/pos/shifts/:shiftId/admin-close
 * Admin forcefully closes an open cashier shift when the cashier forgot to do it.
 */
const adminCloseShift = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId } = req.params;
        const { closingCash, closingCard, notes, closingRecipientType, closingRecipientId, shortageEmployeeId, closingBankDetails } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!shiftId) {
            return res.status(400).json({ error: 'معرف الوردية مطلوب' });
        }
        if (closingCash === null || closingCash === undefined) {
            return res.status(400).json({ error: 'يجب إدخال المبلغ الفعلي في الدرج' });
        }
        if (!closingRecipientType || !closingRecipientId) {
            return res.status(400).json({ error: 'يجب اختيار وجهة تسليم العهدة (خزينة أو موظف)' });
        }
        yield conn.query('START TRANSACTION');
        try {
            // Verify shift exists and is open
            const [shifts] = yield conn.query(`SELECT * FROM pos_shifts WHERE id = ? AND status = 'OPEN' FOR UPDATE`, [shiftId]);
            if (shifts.length === 0) {
                yield conn.query('ROLLBACK');
                return res.status(404).json({ error: 'الوردية غير موجودة أو مغلقة بالفعل' });
            }
            const shift = shifts[0];
            // Branch validation
            const { branchId, isPrivileged } = (0, branchFilter_1.resolveBranchScope)(req);
            if (!isPrivileged && branchId && shift.branchId && shift.branchId !== branchId) {
                yield conn.query('ROLLBACK');
                return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل وردية هذا الفرع' });
            }
            // Calculate expected cash and card
            const [movements] = yield conn.query(`SELECT 
                    SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE 0 END) as deposits,
                    SUM(CASE WHEN type = 'WITHDRAWAL' THEN amount ELSE 0 END) as withdrawals,
                    SUM(CASE WHEN type = 'SALE' AND paymentMethod IN ('CASH', 'TREASURY') THEN amount ELSE 0 END) as cashSales,
                    SUM(CASE WHEN type = 'SALE' AND paymentMethod IN ('BANK', 'BANK_ACCOUNT') THEN amount ELSE 0 END) as bankSales,
                    SUM(CASE WHEN type = 'REFUND' AND paymentMethod IN ('CASH', 'TREASURY') THEN amount ELSE 0 END) as cashRefunds,
                    SUM(CASE WHEN type = 'REFUND' AND paymentMethod IN ('BANK', 'BANK_ACCOUNT') THEN amount ELSE 0 END) as bankRefunds,
                    SUM(CASE WHEN type = 'PURCHASE' AND paymentMethod IN ('CASH', 'TREASURY') THEN amount ELSE 0 END) as cashPurchases,
                    SUM(CASE WHEN type = 'PURCHASE' AND paymentMethod IN ('BANK', 'BANK_ACCOUNT') THEN amount ELSE 0 END) as bankPurchases
                 FROM pos_cash_movements
                 WHERE shiftId = ?`, [shiftId]);
            const movementData = movements[0];
            const [expenseRows] = yield conn.query(`SELECT SUM(amount) as totalExpenses FROM pos_expenses WHERE shiftId = ?`, [shiftId]);
            const shiftExpenses = parseFloat(((_b = expenseRows[0]) === null || _b === void 0 ? void 0 : _b.totalExpenses) || 0);
            const expectedCash = parseFloat(shift.openingCash || 0) +
                parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.deposits) || 0) +
                parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.cashSales) || 0) -
                parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.withdrawals) || 0) -
                parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.cashRefunds) || 0) -
                parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.cashPurchases) || 0) - shiftExpenses;
            const variance = closingCash - expectedCash;
            const expectedCard = parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.bankSales) || 0) - parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.bankRefunds) || 0) - parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.bankPurchases) || 0);
            let parsedClosingCard = closingCard !== undefined ? parseFloat(closingCard) : expectedCard;
            let stringifiedBankDetails = null;
            if (closingBankDetails) {
                try {
                    const parsedDetails = typeof closingBankDetails === 'string'
                        ? JSON.parse(closingBankDetails)
                        : closingBankDetails;
                    if (Array.isArray(parsedDetails)) {
                        const sumActual = parsedDetails.reduce((sum, b) => sum + (parseFloat(b.actual) || 0), 0);
                        parsedClosingCard = sumActual;
                        stringifiedBankDetails = JSON.stringify(parsedDetails);
                    }
                }
                catch (e) {
                    console.error('Failed to parse closingBankDetails in adminCloseShift:', e);
                }
            }
            const varianceCard = parsedClosingCard - expectedCard;
            const now = (0, dateUtils_1.getEgyptianISOString)();
            // Check system configuration for session validation requirement
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
                    console.error('Error parsing config', e);
                }
            }
            const isOverThreshold = posVarianceThreshold !== null && Math.abs(variance) > posVarianceThreshold;
            let newStatus = (posValidationRequired || isOverThreshold) ? 'PENDING_VALIDATION' : 'CLOSED';
            // Cleanup held orders
            try {
                yield conn.query('DELETE FROM pos_held_orders WHERE shiftId = ?', [shiftId]);
            }
            catch (heldErr) {
                // ignore
            }
            // Update shift status
            yield conn.query(`UPDATE pos_shifts 
                 SET closedAt = ?, closingCash = ?, expectedCash = ?, variance = ?, 
                     closingCard = ?, expectedCard = ?, varianceCard = ?,
                     status = ?, notes = ?,
                     closingRecipientType = ?, closingRecipientId = ?, shortageEmployeeId = ?,
                     closingBankDetails = ?,
                     updatedAt = ?
                 WHERE id = ?`, [now, closingCash, expectedCash, variance,
                parsedClosingCard, expectedCard, varianceCard,
                newStatus, notes || null,
                closingRecipientType || null, closingRecipientId || null, shortageEmployeeId || null,
                stringifiedBankDetails,
                now, shiftId]);
            // Create Journal Entry for Shift Closing
            if (shift.treasuryId && closingRecipientId) {
                let targetAccountId = null;
                let shortageAccountId = null;
                if (closingRecipientType === 'TREASURY') {
                    targetAccountId = closingRecipientId;
                }
                else if (closingRecipientType === 'EMPLOYEE') {
                    const [empRows] = yield conn.query('SELECT treasuryAccountId FROM employees WHERE id = ?', [closingRecipientId]);
                    if (empRows.length > 0 && empRows[0].treasuryAccountId) {
                        targetAccountId = empRows[0].treasuryAccountId;
                    }
                }
                if (variance < 0 && shortageEmployeeId) {
                    const [shortageEmpRows] = yield conn.query('SELECT treasuryAccountId FROM employees WHERE id = ?', [shortageEmployeeId]);
                    if (shortageEmpRows.length > 0 && shortageEmpRows[0].treasuryAccountId) {
                        shortageAccountId = shortageEmpRows[0].treasuryAccountId;
                    }
                }
                if (targetAccountId) {
                    const journalId = (0, crypto_1.randomUUID)();
                    const journalDescription = `إغلاق وردية نقطة البيع ${shiftId} (بواسطة المسؤول) ${Number(shift.adminOpeningAmount || 0)}`;
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, branchId)
                         VALUES (?, ?, ?, ?, ?, 'EGP', 1, ?)`, [journalId, now, journalDescription, shiftId, userId, shift.branchId || null]);
                    const journalLines = [];
                    const actualCash = closingCash;
                    let surplusAccountId = null;
                    let surplusAmount = 0;
                    if (actualCash > 0) {
                        journalLines.push([
                            journalId, targetAccountId, 'تسليم نقدية الوردية', actualCash, 0, 'EGP', 1, actualCash, 0
                        ]);
                    }
                    if (variance < 0 && shortageAccountId) {
                        const shortageAmount = Math.abs(variance);
                        journalLines.push([
                            journalId, shortageAccountId, 'عجز وردية - موظف', shortageAmount, 0, 'EGP', 1, shortageAmount, 0
                        ]);
                    }
                    if (variance > 0) {
                        surplusAmount = variance;
                        surplusAccountId = yield getOrCreatePosSurplusAccount(conn);
                        journalLines.push([
                            journalId, surplusAccountId, 'فائض إغلاق وردية', 0, surplusAmount, 'EGP', 1, 0, surplusAmount
                        ]);
                    }
                    // Expenses already have individual journal entries created at time of expense (addExpense).
                    // They are already credited to the POS Treasury. Therefore, we do NOT add them to posCredit
                    // here to avoid double-crediting the treasury. posCredit represents the expectedCash (physical drawer cash remaining).
                    let posCredit = actualCash;
                    if (variance < 0)
                        posCredit += Math.abs(variance);
                    if (variance > 0)
                        posCredit -= variance;
                    if (Math.abs(posCredit) > 0.001) {
                        journalLines.push([
                            journalId, shift.treasuryId, 'خزينة نقطة البيع', 0, posCredit, 'EGP', 1, 0, posCredit
                        ]);
                    }
                    // Consolidate lines
                    const consolidatedMap = new Map();
                    for (const line of journalLines) {
                        const accId = line[1];
                        if (!consolidatedMap.has(accId)) {
                            consolidatedMap.set(accId, [...line]);
                        }
                        else {
                            const existing = consolidatedMap.get(accId);
                            existing[3] += line[3];
                            existing[4] += line[4];
                            existing[7] += line[7];
                            existing[8] += line[8];
                        }
                    }
                    const finalJournalLines = [];
                    for (const [accId, line] of consolidatedMap.entries()) {
                        let debit = Number(line[3].toFixed(2));
                        let credit = Number(line[4].toFixed(2));
                        if (debit > credit) {
                            debit = Number((debit - credit).toFixed(2));
                            credit = 0;
                        }
                        else if (credit > debit) {
                            credit = Number((credit - debit).toFixed(2));
                            debit = 0;
                        }
                        else {
                            continue;
                        }
                        line[3] = debit;
                        line[4] = credit;
                        line[7] = debit;
                        line[8] = credit;
                        finalJournalLines.push(line);
                    }
                    if (finalJournalLines.length > 0) {
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [finalJournalLines]);
                        const affectedAccountIds = new Set();
                        if (targetAccountId)
                            affectedAccountIds.add(targetAccountId);
                        if (shortageAccountId)
                            affectedAccountIds.add(shortageAccountId);
                        if (surplusAccountId)
                            affectedAccountIds.add(surplusAccountId);
                        if (shift.treasuryId)
                            affectedAccountIds.add(shift.treasuryId);
                        yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, Array.from(affectedAccountIds));
                    }
                }
            }
            yield conn.query('COMMIT');
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'journal', updatedBy: userId });
            res.json({ success: true, message: 'تم إغلاق الوردية بنجاح بواسطة المسؤول', status: newStatus });
        }
        catch (innerError) {
            yield conn.query('ROLLBACK');
            throw innerError;
        }
    }
    catch (error) {
        console.error('[POS Approval] adminCloseShift error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.adminCloseShift = adminCloseShift;
