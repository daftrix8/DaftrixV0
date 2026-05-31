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
exports.forceApproveShift = exports.approveShift = exports.getShiftSummary = exports.getShiftsForReview = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const dateUtils_1 = require("../../utils/dateUtils");
const accountBalanceUtils_1 = require("../utils/accountBalanceUtils");
function getOrCreatePosSurplusAccount(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield conn.query(`SELECT id FROM accounts WHERE name = 'فائض ورديات (نقاط بيع)' LIMIT 1`);
        if (rows.length > 0)
            return rows[0].id;
        const id = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO accounts (id, code, name, type, subType, balance, openingBalance)
         VALUES (?, ?, 'فائض ورديات (نقاط بيع)', 'REVENUE', 'OTHER_REVENUE', 0, 0)`, [id, `REV-POS-${Math.floor(Math.random() * 10000)}`]);
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
        const { approvalStatus, cashierId, from, to, page = 1, pageSize = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(pageSize);
        const filters = [`s.status != 'OPEN'`];
        const params = [];
        if (approvalStatus) {
            filters.push(`s.approvalStatus = ?`);
            params.push(approvalStatus);
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
                 ORDER BY s.closedAt DESC
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
                     ORDER BY s.closedAt DESC
                     LIMIT ? OFFSET ?`, [...params, Number(pageSize), offset]));
            }
            else {
                throw colErr;
            }
        }
        const [countRows] = yield conn.query(`SELECT COUNT(*) AS total FROM pos_shifts s ${where}`, params);
        // Global counts across ALL closed shifts (ignoring active filter) for stats cards
        let globalCounts = { pending: 0, flagged: 0, approved: 0, total: 0, hasDiscrepancy: 0, totalDiscrepancy: 0 };
        try {
            const [gcRows] = yield conn.query(`SELECT
                    SUM(CASE WHEN s.approvalStatus = 'pending' THEN 1 ELSE 0 END) AS pending,
                    SUM(CASE WHEN s.approvalStatus = 'flagged' THEN 1 ELSE 0 END) AS flagged,
                    SUM(CASE WHEN s.approvalStatus = 'approved' THEN 1 ELSE 0 END) AS approved,
                    COUNT(*) AS total,
                    SUM(CASE
                        WHEN s.discrepancyAmount IS NOT NULL AND ABS(s.discrepancyAmount) >= 0.01 THEN 1
                        WHEN s.discrepancyAmount IS NULL AND ABS(COALESCE(s.variance, s.closingCash - s.expectedCash)) >= 0.01 THEN 1
                        ELSE 0
                    END) AS hasDiscrepancy,
                    SUM(CASE
                        WHEN s.discrepancyAmount IS NOT NULL THEN s.discrepancyAmount
                        ELSE COALESCE(s.variance, s.closingCash - s.expectedCash)
                    END) AS totalDiscrepancy
                 FROM pos_shifts s
                 WHERE s.status != 'OPEN'`);
            const gc = gcRows[0];
            globalCounts = {
                pending: parseInt((gc === null || gc === void 0 ? void 0 : gc.pending) || 0),
                flagged: parseInt((gc === null || gc === void 0 ? void 0 : gc.flagged) || 0),
                approved: parseInt((gc === null || gc === void 0 ? void 0 : gc.approved) || 0),
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
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId } = req.params;
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
        // Sales summary from invoices — with type-specific counts
        const [salesRows] = yield conn.query(`SELECT
                COUNT(*) AS invoiceCount,
                SUM(CASE WHEN type = 'INVOICE_SALE' THEN 1 ELSE 0 END) AS saleCount,
                SUM(CASE WHEN type IN ('RETURN_SALE', 'RETURN_PURCHASE') THEN 1 ELSE 0 END) AS returnCount,
                SUM(CASE WHEN paymentMethod = 'DEFERRED' THEN 1 ELSE 0 END) AS deferredCount,
                COALESCE(SUM(CASE WHEN type = 'INVOICE_SALE' THEN total ELSE 0 END), 0) AS grossSales,
                COALESCE(SUM(CASE WHEN type IN ('RETURN_SALE', 'RETURN_PURCHASE') THEN total ELSE 0 END), 0) AS totalReturns,
                COALESCE(SUM(CASE WHEN type IN ('RETURN_SALE', 'RETURN_PURCHASE') THEN -total ELSE total END), 0) AS totalSales,
                COALESCE(SUM(CASE WHEN type = 'INVOICE_SALE' THEN COALESCE(globalDiscount, 0) ELSE 0 END), 0) AS totalDiscounts,
                COALESCE(SUM(CASE WHEN type = 'INVOICE_SALE' THEN COALESCE(shippingFee, 0) ELSE 0 END), 0) AS totalShipping,
                COALESCE(SUM(CASE WHEN paymentMethod = 'CASH' THEN (CASE WHEN type IN ('RETURN_SALE', 'RETURN_PURCHASE') THEN -total ELSE total END) ELSE 0 END), 0) AS cashSales,
                COALESCE(SUM(CASE WHEN paymentMethod = 'BANK' THEN (CASE WHEN type IN ('RETURN_SALE', 'RETURN_PURCHASE') THEN -total ELSE total END) ELSE 0 END), 0) AS cardSales,
                COALESCE(SUM(CASE WHEN paymentMethod NOT IN ('CASH','BANK') THEN (CASE WHEN type IN ('RETURN_SALE', 'RETURN_PURCHASE') THEN -total ELSE total END) ELSE 0 END), 0) AS otherSales
             FROM invoices
             WHERE posShiftId = ? COLLATE utf8mb4_unicode_ci AND isPOSSale = 1`, [shiftId]);
        const sales = salesRows[0];
        // Expenses summary
        let expenses = { fromDailyTakings: 0, fromPriorBalance: 0, total: 0, breakdown: [] };
        try {
            const [expRows] = yield conn.query(`SELECT e.sourceType, COALESCE(SUM(e.amount), 0) AS total
                 FROM pos_expenses e
                 WHERE e.shiftId = ? COLLATE utf8mb4_unicode_ci
                 GROUP BY e.sourceType`, [shiftId]);
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
                 WHERE e.shiftId = ? COLLATE utf8mb4_unicode_ci
                 GROUP BY e.categoryId, c.name`, [shiftId]);
            expenses.breakdown = breakdownRows;
        }
        catch ( /* expense tables may not exist yet */_a) { /* expense tables may not exist yet */ }
        // Fetch detailed quick expenses list for shift review
        let expensesList = [];
        try {
            const [expDetails] = yield conn.query(`SELECT e.id, e.description, e.amount, e.sourceType, e.createdAt, c.name AS categoryName, u.name AS cashierName
                 FROM pos_expenses e
                 LEFT JOIN pos_expense_categories c ON e.categoryId COLLATE utf8mb4_unicode_ci = c.id COLLATE utf8mb4_unicode_ci
                 LEFT JOIN users u ON e.createdBy COLLATE utf8mb4_unicode_ci = u.id COLLATE utf8mb4_unicode_ci
                 WHERE e.shiftId = ? COLLATE utf8mb4_unicode_ci
                 ORDER BY e.createdAt DESC`, [shiftId]);
            expensesList = expDetails;
        }
        catch (e) {
            console.error('Failed to load detailed expenses for shift summary:', e);
        }
        // Fetch detailed invoices list for shift review — include type for UI badges
        let invoicesList = [];
        try {
            const [invDetails] = yield conn.query(`SELECT id, number, date, type, partnerName, paymentMethod, total, createdBy
                 FROM invoices
                 WHERE posShiftId = ? COLLATE utf8mb4_unicode_ci AND isPOSSale = 1
                 ORDER BY date DESC`, [shiftId]);
            invoicesList = invDetails;
        }
        catch (e) {
            console.error('Failed to load detailed invoices for shift summary:', e);
        }
        // Complete cash flow from pos_cash_movements
        let cashFlow = { deposits: 0, withdrawals: 0 };
        let paymentMethodDetails = [];
        let trueCashSales = 0;
        let trueCardSales = 0;
        let trueOtherSales = 0;
        try {
            const [pmRows] = yield conn.query(`SELECT pcm.paymentMethod, pcm.type AS movementType,
                        COUNT(*) AS count, COALESCE(SUM(pcm.amount), 0) AS total
                 FROM pos_cash_movements pcm
                 WHERE pcm.shiftId = ? COLLATE utf8mb4_unicode_ci
                 GROUP BY pcm.paymentMethod, pcm.type
                 ORDER BY pcm.paymentMethod`, [shiftId]);
            paymentMethodDetails = pmRows;
            // Calculate deposits (excluding OPENING as it's tracked in openingAmounts) and withdrawals
            for (const row of paymentMethodDetails) {
                const amount = parseFloat(row.total);
                if (row.movementType === 'DEPOSIT')
                    cashFlow.deposits += amount;
                if (row.movementType === 'WITHDRAWAL')
                    cashFlow.withdrawals += amount;
                // Calculate true sales from movements to handle mixed payments correctly
                if (row.movementType === 'SALE') {
                    if (row.paymentMethod === 'CASH')
                        trueCashSales += amount;
                    else if (row.paymentMethod === 'BANK')
                        trueCardSales += amount;
                    else
                        trueOtherSales += amount;
                }
                else if (row.movementType === 'REFUND') {
                    if (row.paymentMethod === 'CASH')
                        trueCashSales -= amount;
                    else if (row.paymentMethod === 'BANK')
                        trueCardSales -= amount;
                    else
                        trueOtherSales -= amount;
                }
            }
        }
        catch ( /* table may not exist */_b) { /* table may not exist */ }
        const expectedCash = parseFloat(shift.expectedCash || 0);
        const cashierOpening = parseFloat(shift.openingCash || 0);
        const adminOpening = parseFloat(shift.adminOpeningAmount || 0);
        const totalOpening = adminOpening; // The system opening amount is the true starting balance
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
        catch ( /* table may not exist */_c) { /* table may not exist */ }
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
        const journalDescription = `إغلاق وردية نقطة البيع ${shift.id} (بعد الاعتماد)`;
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
        // Debit POS Expenses (from pos_expenses table)
        let expensesList = [];
        try {
            const [expRows] = yield conn.query(`SELECT id, amount, entityType, description FROM pos_expenses WHERE shiftId = ? COLLATE utf8mb4_unicode_ci`, [shift.id]);
            expensesList = expRows;
        }
        catch (_a) {
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
        if (discrepancyAmount > 0.001) {
            surplusAmount = discrepancyAmount;
            surplusAccountId = yield getOrCreatePosSurplusAccount(conn);
            journalLines.push([
                journalId, surplusAccountId, 'فائض إغلاق وردية (اعتماد)', 0, surplusAmount, 'EGP', 1, 0, surplusAmount
            ]);
            posCredit -= surplusAmount; // Equals expectedCash
        }
        // Credit POS Treasury (should exactly equal Sales + Opening after subtracting Surplus and adding Expenses/Shortage)
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
        if (shift.status === 'OPEN') {
            return res.status(400).json({ error: 'لا يمكن اعتماد وردية لا تزال مفتوحة' });
        }
        const expectedCash = parseFloat(shift.expectedCash || 0);
        const actual = parseFloat(actualCashReceived);
        const discrepancyAmount = actual - expectedCash;
        // Auto-flag if there's a discrepancy AND it's not being assigned
        const approvalStatus = Math.abs(discrepancyAmount) < 0.01 || adminShortageEmployeeId ? 'approved' : 'flagged';
        const now = (0, dateUtils_1.getEgyptianISOString)();
        yield conn.query('START TRANSACTION');
        yield conn.query(`UPDATE pos_shifts SET
                approvalStatus = ?, approvedBy = ?, approvedAt = ?,
                actualCashReceived = ?, discrepancyAmount = ?,
                discrepancyNotes = ?, adminNotes = ?, adminShortageEmployeeId = ?
             WHERE id = ? COLLATE utf8mb4_unicode_ci`, [
            approvalStatus, userId, now,
            actual, discrepancyAmount,
            discrepancyNotes || null, adminNotes || null, adminShortageEmployeeId || null,
            shiftId,
        ]);
        if (approvalStatus === 'approved') {
            yield rewriteShiftJournal(conn, shift, actual, adminShortageEmployeeId, userId, now);
        }
        yield conn.query('COMMIT');
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
        yield conn.query('START TRANSACTION');
        yield conn.query(`UPDATE pos_shifts SET
                approvalStatus = 'approved', approvedBy = ?, approvedAt = ?,
                actualCashReceived = ?, discrepancyAmount = ?,
                discrepancyNotes = ?, adminNotes = ?, adminShortageEmployeeId = ?
             WHERE id = ? COLLATE utf8mb4_unicode_ci`, [userId, now, actual, actual - parseFloat(shift.expectedCash || 0), discrepancyNotes || null, adminNotes || null, adminShortageEmployeeId || null, shiftId]);
        yield rewriteShiftJournal(conn, shift, actual, adminShortageEmployeeId, userId, now);
        yield conn.query('COMMIT');
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
