"use strict";
/**
 * POS Expenses Controller (مصروفات سريعة)
 * ==========================================
 * Phase 2: Quick expenses during a POS shift.
 * Each expense is drawn from either daily takings or prior balance (العهد).
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
exports.createPOSExpenseAccount = exports.createExpenseCategory = exports.updateExpense = exports.getExpenseMiscItems = exports.getExpenseSuppliers = exports.getExpenseEmployees = exports.deleteExpense = exports.getShiftExpenses = exports.addExpense = exports.getExpenseCategories = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const dateUtils_1 = require("../../utils/dateUtils");
const accountBalanceUtils_1 = require("../utils/accountBalanceUtils");
const invoiceNumberGenerator_1 = require("../utils/invoiceNumberGenerator");
const eventBus_1 = require("../utils/eventBus");
// ── Schema helpers ─────────────────────────────────────────────────────────
// ── Helpers ────────────────────────────────────────────────────────────────
function resolveExpenseAccountId(conn, entityType, entityId) {
    return __awaiter(this, void 0, void 0, function* () {
        // For مصروفات مختلفة — entityId IS the account id directly
        if (entityType === 'MISC' && entityId) {
            const [rows] = yield conn.query(`SELECT id FROM accounts WHERE id = ? LIMIT 1`, [entityId]);
            if (rows.length > 0)
                return rows[0].id;
        }
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
            code = `${code}-${Math.floor(Math.random() * 100)}`;
        }
        const id = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO accounts (id, code, name, type, subType, balance, openingBalance, currencyCode)
         VALUES (?, ?, ?, ?, ?, 0, 0, 'EGP')`, [id, code, name, accountType, subType]);
        return id;
    });
}
function getCategoryName(conn, categoryId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const [rows] = yield conn.query(`SELECT name FROM pos_expense_categories WHERE id = ? LIMIT 1`, [categoryId]);
        return ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.name) || 'مصروفات نقطة البيع';
    });
}
function computeAvailableBalance(conn, shiftId, sourceType, shift) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (sourceType === 'daily_takings') {
            // Daily takings = SUM of confirmed CASH sale/deposit movements minus refund/purchase movements in this shift
            const [cashRows] = yield conn.query(`SELECT 
                SUM(CASE WHEN type = 'SALE' THEN amount ELSE 0 END) as sales,
                SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE 0 END) as deposits,
                SUM(CASE WHEN type = 'REFUND' THEN amount ELSE 0 END) as refunds,
                SUM(CASE WHEN type = 'PURCHASE' THEN amount ELSE 0 END) as purchases
             FROM pos_cash_movements
             WHERE shiftId = ? COLLATE utf8mb4_unicode_ci AND paymentMethod IN ('CASH', 'TREASURY')`, [shiftId]);
            const row = cashRows[0];
            const sales = parseFloat((row === null || row === void 0 ? void 0 : row.sales) || 0);
            const deposits = parseFloat((row === null || row === void 0 ? void 0 : row.deposits) || 0);
            const refunds = parseFloat((row === null || row === void 0 ? void 0 : row.refunds) || 0);
            const purchases = parseFloat((row === null || row === void 0 ? void 0 : row.purchases) || 0);
            const netDailyTakings = sales + deposits - refunds - purchases;
            const [spentRows] = yield conn.query(`SELECT COALESCE(SUM(amount), 0) AS spent
             FROM pos_expenses
             WHERE shiftId = ? COLLATE utf8mb4_unicode_ci AND sourceType = 'daily_takings'`, [shiftId]);
            const alreadySpent = parseFloat(((_a = spentRows[0]) === null || _a === void 0 ? void 0 : _a.spent) || 0);
            return Math.max(0, netDailyTakings - alreadySpent);
        }
        // Prior balance = cashier opening + admin opening
        const priorBalance = parseFloat(shift.openingCash || 0);
        const [spentRows] = yield conn.query(`SELECT COALESCE(SUM(amount), 0) AS spent
         FROM pos_expenses
         WHERE shiftId = ? COLLATE utf8mb4_unicode_ci AND sourceType = 'prior_balance'`, [shiftId]);
        const alreadySpent = parseFloat(((_b = spentRows[0]) === null || _b === void 0 ? void 0 : _b.spent) || 0);
        return Math.max(0, priorBalance - alreadySpent);
    });
}
// ── Controllers ────────────────────────────────────────────────────────────
/**
 * GET /api/pos/expense-categories
 */
const getExpenseCategories = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const [rows] = yield conn.query(`SELECT id, name, sortOrder FROM pos_expense_categories
             WHERE isActive = 1 ORDER BY sortOrder ASC, name ASC`);
        res.json({ categories: rows });
    }
    catch (error) {
        console.error('[POS Expenses] getExpenseCategories error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getExpenseCategories = getExpenseCategories;
/**
 * POST /api/pos/shifts/:shiftId/expenses
 */
const addExpense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId } = req.params;
        const { categoryId, description, amount, sourceType, entityId, entityType } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!categoryId || !amount || !sourceType) {
            return res.status(400).json({ error: 'الفئة والمبلغ ونوع المصدر مطلوبة' });
        }
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
        }
        if (!['daily_takings', 'prior_balance'].includes(sourceType)) {
            return res.status(400).json({ error: 'نوع المصدر غير صالح' });
        }
        yield conn.query('START TRANSACTION');
        try {
            // Lock the shift row first to prevent concurrent expense double-spend.
            // Without FOR UPDATE, two simultaneous requests can both see the same
            // available balance and both pass the check — overdrafting the drawer.
            const [shifts] = yield conn.query(`SELECT * FROM pos_shifts
                 WHERE id = ? COLLATE utf8mb4_unicode_ci AND status = 'OPEN' COLLATE utf8mb4_unicode_ci
                 FOR UPDATE`, [shiftId]);
            if (shifts.length === 0) {
                yield conn.query('ROLLBACK');
                return res.status(404).json({ error: 'الوردية غير موجودة أو مغلقة' });
            }
            const shift = shifts[0];
            // Balance check — inside the lock so the read is serialised
            const available = yield computeAvailableBalance(conn, shiftId, sourceType, shift);
            if (parsedAmount > available + 0.001) {
                yield conn.query('ROLLBACK');
                const sourceLabel = sourceType === 'daily_takings' ? 'مبيعات اليوم' : 'العهد';
                return res.status(400).json({
                    error: `الرصيد غير كافٍ في ${sourceLabel}. المتاح: ${available.toFixed(2)}`,
                    available,
                });
            }
            const id = (0, crypto_1.randomUUID)();
            const now = (0, dateUtils_1.getEgyptianISOString)();
            yield conn.query(`INSERT INTO pos_expenses (id, shiftId, categoryId, description, amount, sourceType, entityId, entityType, createdBy, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, shiftId, categoryId, description || null, parsedAmount, sourceType, entityId || null, entityType || null, userId, now]);
            // HR Integration: Register Employee Advance/Shortage automatically
            if (entityType === 'EMPLOYEE' && entityId) {
                const advanceId = (0, crypto_1.randomUUID)();
                const catName = yield getCategoryName(conn, categoryId);
                const isShortage = catName.includes('عجز') || (description || '').includes('عجز');
                const advType = isShortage ? 'SHORTAGE' : 'LOAN';
                const advReason = isShortage
                    ? `عجز خزينة من نقطة البيع${description ? ' - ' + description : ''}`
                    : (description || 'سلفة سريعة من نقطة البيع');
                yield conn.query(`INSERT INTO employee_advances (id, employeeId, type, loanType, amount, reason, issueDate, monthlyDeduction, totalPaid, remainingAmount, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'ACTIVE')`, [advanceId, entityId, advType, advType, parsedAmount, advReason, now.split('T')[0], parsedAmount]);
            }
            // Link the cash movement to the expense id so deleteExpense can remove it atomically
            const movementId = (0, crypto_1.randomUUID)();
            yield conn.query(`INSERT INTO pos_cash_movements (id, shiftId, type, amount, paymentMethod, description, approvedBy, createdAt, referenceId)
                 VALUES (?, ?, 'EXPENSE', ?, 'CASH', ?, ?, ?, ?)`, [movementId, shiftId, parsedAmount, description || 'مصروفات من نقطة البيع', userId, now, id]);
            // Create journal entry: Debit expense/partner account, Credit treasury
            // treasuryId is mandatory (enforced at openShift), so this should always succeed.
            if (!shift.treasuryId) {
                throw new Error(`وردية بدون خزينة (shift ${shiftId}). لا يمكن تسجيل مصروف بدون حساب خزينة.`);
            }
            // Resolve treasury account name for proper journal labeling
            const [treasuryAccRows] = yield conn.query(`SELECT name FROM accounts WHERE id = ? LIMIT 1`, [shift.treasuryId]);
            const treasuryAccountName = ((_b = treasuryAccRows[0]) === null || _b === void 0 ? void 0 : _b.name) || 'خزينة نقطة البيع';
            const expAccountId = yield resolveExpenseAccountId(conn, entityType || null, entityId || null);
            const journalId = (0, crypto_1.randomUUID)();
            const catName = yield getCategoryName(conn, categoryId);
            const journalDesc = `مصروف POS: ${catName}${description ? ' - ' + description : ''}`;
            yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, branchId)
                 VALUES (?, ?, ?, ?, ?, 'EGP', 1, ?)`, [journalId, now, journalDesc, id, userId, shift.branchId || null]);
            yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [[
                    [journalId, expAccountId, catName, parsedAmount, 0, 'EGP', 1, parsedAmount, 0],
                    [journalId, shift.treasuryId, treasuryAccountName, 0, parsedAmount, 'EGP', 1, 0, parsedAmount],
                ]]);
            yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, [expAccountId, shift.treasuryId]);
            // PARTNER PAYMENT INTEGRATION
            // For SUPPLIER payments: create a PAYMENT voucher so the payment appears in
            // the supplier statement (partnerController reads invoices WHERE type='PAYMENT')
            // and in يومية الخزينة (dailyReportController reads PAYMENT_TYPES from invoices).
            // For CUSTOMER payments (unlikely but supported): create a RECEIPT voucher.
            if ((entityType === 'SUPPLIER' || entityType === 'CUSTOMER') && entityId) {
                const isSupplier = entityType === 'SUPPLIER';
                const voucherType = isSupplier ? 'PAYMENT' : 'RECEIPT';
                const voucherCategory = isSupplier ? 'supplier' : 'customer';
                const voucherPrefix = isSupplier ? 'PAY-' : 'REC-';
                // Look up partner name
                const [partnerRows] = yield conn.query(`SELECT name FROM partners WHERE id = ? LIMIT 1`, [entityId]);
                const partnerName = ((_c = partnerRows[0]) === null || _c === void 0 ? void 0 : _c.name) || (isSupplier ? 'مورد' : 'عميل');
                const voucherNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, voucherPrefix);
                const voucherId = voucherNumber; // PAY/REC: id === number (system convention)
                const catName = yield getCategoryName(conn, categoryId);
                const voucherNotes = `دفعة من نقطة البيع - ${catName}${description ? ' - ' + description : ''}`;
                yield conn.query(`INSERT INTO invoices
                       (id, number, date, type, partnerId, partnerName, total, status,
                        paymentMethod, posted, notes, voucherCategory, branchId, createdBy, referenceInvoiceId)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'POSTED', 'CASH', 1, ?, ?, ?, ?, ?)`, [
                    voucherId, voucherNumber, now, voucherType,
                    entityId, partnerName, parsedAmount,
                    voucherNotes, voucherCategory,
                    shift.branchId || null, userId,
                    id // expense id — enables atomic delete on rollback
                ]);
            }
            yield conn.query('COMMIT');
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'journal', updatedBy: userId });
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoices', updatedBy: userId });
            // Return updated balances (read-only, outside transaction)
            const dailyAvailable = yield computeAvailableBalance(conn, shiftId, 'daily_takings', shift);
            const priorAvailable = yield computeAvailableBalance(conn, shiftId, 'prior_balance', shift);
            res.json({
                success: true,
                expense: { id, shiftId, categoryId, description, amount: parsedAmount, sourceType, createdBy: userId, createdAt: now },
                available: { daily_takings: dailyAvailable, prior_balance: priorAvailable },
            });
        }
        catch (txErr) {
            yield conn.query('ROLLBACK');
            throw txErr;
        }
    }
    catch (error) {
        console.error('[POS Expenses] addExpense error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        conn.release();
    }
});
exports.addExpense = addExpense;
/**
 * GET /api/pos/shifts/:shiftId/expenses
 */
const getShiftExpenses = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { shiftId } = req.params;
        const [expenses] = yield conn.query(`SELECT e.id, e.shiftId, e.categoryId, e.description, e.amount, e.sourceType, e.entityId, e.entityType, e.createdBy, e.createdAt, c.name AS categoryName
             FROM pos_expenses e
             LEFT JOIN pos_expense_categories c ON e.categoryId COLLATE utf8mb4_unicode_ci = c.id COLLATE utf8mb4_unicode_ci
             WHERE e.shiftId = ? COLLATE utf8mb4_unicode_ci
             UNION ALL
             SELECT i.id, i.posShiftId AS shiftId, NULL AS categoryId, CONCAT('فاتورة شراء نقدي #', i.number) AS description, i.total AS amount, 'daily_takings' AS sourceType, i.partnerId AS entityId, 'SUPPLIER' AS entityType, i.createdBy, i.date AS createdAt, 'فاتورة مشتريات' AS categoryName
             FROM invoices i
             WHERE i.posShiftId = ? COLLATE utf8mb4_unicode_ci AND i.type = 'INVOICE_PURCHASE' AND i.paymentMethod = 'CASH' AND i.status != 'VOID' AND i.status != 'DRAFT'
             UNION ALL
             SELECT i.id, i.posShiftId AS shiftId, NULL AS categoryId, CONCAT('مرتجع شراء نقدي #', i.number) AS description, -i.total AS amount, 'daily_takings' AS sourceType, i.partnerId AS entityId, 'SUPPLIER' AS entityType, i.createdBy, i.date AS createdAt, 'مرتجع مشتريات' AS categoryName
             FROM invoices i
             WHERE i.posShiftId = ? COLLATE utf8mb4_unicode_ci AND i.type = 'RETURN_PURCHASE' AND i.paymentMethod = 'CASH' AND i.status != 'VOID' AND i.status != 'DRAFT'
             ORDER BY createdAt ASC`, [shiftId, shiftId, shiftId]);
        // Totals per source
        const [totals] = yield conn.query(`SELECT sourceType, COALESCE(SUM(amount), 0) AS total
             FROM (
                 SELECT sourceType, amount, shiftId FROM pos_expenses
                 UNION ALL
                 SELECT 'daily_takings' AS sourceType, total AS amount, posShiftId AS shiftId 
                 FROM invoices 
                 WHERE type = 'INVOICE_PURCHASE' AND paymentMethod = 'CASH' AND status != 'VOID' AND status != 'DRAFT'
                 UNION ALL
                 SELECT 'daily_takings' AS sourceType, -total AS amount, posShiftId AS shiftId 
                 FROM invoices 
                 WHERE type = 'RETURN_PURCHASE' AND paymentMethod = 'CASH' AND status != 'VOID' AND status != 'DRAFT'
             ) combined
             WHERE shiftId = ? COLLATE utf8mb4_unicode_ci
             GROUP BY sourceType`, [shiftId]);
        const totalsMap = {};
        for (const row of totals) {
            totalsMap[row.sourceType] = parseFloat(row.total);
        }
        // Fetch shift for available balance calculation
        let shift = {};
        try {
            const [shiftRows] = yield conn.query(`SELECT openingCash, COALESCE(adminOpeningAmount, 0) AS adminOpeningAmount
                 FROM pos_shifts WHERE id = ? COLLATE utf8mb4_unicode_ci`, [shiftId]);
            shift = shiftRows[0] || {};
        }
        catch (_a) {
            // adminOpeningAmount column may not exist yet — use zero
        }
        const dailyAvailable = yield computeAvailableBalance(conn, shiftId, 'daily_takings', shift);
        const priorAvailable = yield computeAvailableBalance(conn, shiftId, 'prior_balance', shift);
        res.json({
            expenses,
            totals: {
                daily_takings: totalsMap['daily_takings'] || 0,
                prior_balance: totalsMap['prior_balance'] || 0,
                total: (totalsMap['daily_takings'] || 0) + (totalsMap['prior_balance'] || 0),
            },
            available: {
                daily_takings: dailyAvailable,
                prior_balance: priorAvailable,
            },
        });
    }
    catch (error) {
        console.error('[POS Expenses] getShiftExpenses error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getShiftExpenses = getShiftExpenses;
/**
 * DELETE /api/pos/expenses/:id
 */
const deleteExpense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        yield conn.query('START TRANSACTION');
        try {
            // Verify expense exists, shift is open, and created by current user (unless admin)
            const [rows] = yield conn.query(`SELECT e.id, e.shiftId, e.amount, e.createdBy, e.entityId, e.entityType, e.createdAt, s.status AS shiftStatus
                 FROM pos_expenses e
                 JOIN pos_shifts s ON e.shiftId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
                 WHERE e.id = ? COLLATE utf8mb4_unicode_ci FOR UPDATE`, [id]);
            if (rows.length === 0) {
                yield conn.query('ROLLBACK');
                return res.status(404).json({ error: 'المصروف غير موجود' });
            }
            const expense = rows[0];
            const isAdmin = ['ADMIN', 'MASTER_ADMIN', 'GENERAL_MANAGER'].includes((_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role) === null || _c === void 0 ? void 0 : _c.toUpperCase()) || ((_e = (_d = req.user) === null || _d === void 0 ? void 0 : _d.permissions) === null || _e === void 0 ? void 0 : _e.includes('pos.admin_edit_invoice'));
            if (expense.shiftStatus !== 'OPEN') {
                yield conn.query('ROLLBACK');
                return res.status(400).json({ error: 'لا يمكن حذف مصروف من وردية مغلقة' });
            }
            if (expense.createdBy !== userId && !isAdmin) {
                yield conn.query('ROLLBACK');
                return res.status(403).json({ error: 'لا يمكنك حذف مصروف أضافه كاشير آخر' });
            }
            // Also remove the linked employee advance if exists
            if (expense.entityType === 'EMPLOYEE' && expense.entityId) {
                const dateStr = expense.createdAt instanceof Date
                    ? expense.createdAt.toISOString().split('T')[0]
                    : String(expense.createdAt).split('T')[0];
                const [advances] = yield conn.query(`SELECT id FROM employee_advances
                     WHERE employeeId = ? AND amount = ? AND status = 'ACTIVE'
                       AND (issueDate = ? OR ABS(DATEDIFF(issueDate, ?)) <= 1)`, [expense.entityId, expense.amount, dateStr, dateStr]);
                if (advances.length > 0) {
                    const advanceIds = advances.map((a) => a.id);
                    const ph = advanceIds.map(() => '?').join(',');
                    yield conn.query(`DELETE FROM employee_advances WHERE id IN (${ph})`, advanceIds);
                }
            }
            yield conn.query(`DELETE FROM pos_expenses WHERE id = ? COLLATE utf8mb4_unicode_ci`, [id]);
            // Also remove the linked cash movement so expectedCash stays accurate.
            // Try referenceId first (new schema), then fall back to matching by type+amount+shiftId.
            const [delResult] = yield conn.query(`DELETE FROM pos_cash_movements
                 WHERE shiftId = ? COLLATE utf8mb4_unicode_ci
                   AND type = 'EXPENSE'
                   AND (referenceId = ? OR referenceId IS NULL)
                   AND amount = ?
                 ORDER BY createdAt DESC
                 LIMIT 1`, [expense.shiftId, id, expense.amount]);
            if (delResult.affectedRows === 0) {
                // Broader fallback: match any EXPENSE movement with the same amount
                yield conn.query(`DELETE FROM pos_cash_movements
                     WHERE shiftId = ? COLLATE utf8mb4_unicode_ci AND type = 'EXPENSE' AND amount = ?
                     ORDER BY createdAt DESC LIMIT 1`, [expense.shiftId, expense.amount]);
            }
            // Also remove the linked journal entry so قيود اليومية stays clean
            const [journalRows] = yield conn.query(`SELECT id FROM journal_entries WHERE referenceId = ?`, [id]);
            if (journalRows.length > 0) {
                const journalId = journalRows[0].id;
                const [lineRows] = yield conn.query(`SELECT accountId FROM journal_lines WHERE journalId = ?`, [journalId]);
                const accountIds = lineRows.map((r) => r.accountId).filter(Boolean);
                yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [journalId]);
                yield conn.query('DELETE FROM journal_entries WHERE id = ?', [journalId]);
                if (accountIds.length > 0) {
                    yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, accountIds);
                }
            }
            // Also remove the linked PAYMENT/RECEIPT invoice for supplier/customer expenses
            // so the partner statement and treasury journal stay consistent
            yield conn.query(`DELETE FROM invoices
                 WHERE referenceInvoiceId = ?
                   AND type IN ('PAYMENT', 'RECEIPT')
                   AND status = 'POSTED'
                 LIMIT 1`, [id]);
            yield conn.query('COMMIT');
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'journal', updatedBy: userId });
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoices', updatedBy: userId });
            res.json({ success: true });
        }
        catch (txErr) {
            yield conn.query('ROLLBACK');
            throw txErr;
        }
    }
    catch (error) {
        console.error('[POS Expenses] deleteExpense error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.deleteExpense = deleteExpense;
/**
 * GET /api/pos/expense-meta/employees
 * Returns active employees for the سلف موظفين category picker.
 */
const getExpenseEmployees = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const [rows] = yield conn.query(`SELECT e.id, e.fullName AS name, e.jobTitle
             FROM employees e
             WHERE e.status = 'ACTIVE'
             ORDER BY e.fullName ASC
             LIMIT 200`);
        res.json({ employees: rows });
    }
    catch (error) {
        // Table may not exist in all deployments — return empty gracefully
        console.warn('[POS] getExpenseEmployees fallback:', error.message);
        res.json({ employees: [] });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getExpenseEmployees = getExpenseEmployees;
/**
 * GET /api/pos/expense-meta/suppliers
 * Returns active suppliers for the دفعات موردين category picker.
 */
const getExpenseSuppliers = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const [rows] = yield conn.query(`SELECT p.id, p.name, p.phone
             FROM partners p
             WHERE (p.isSupplier = 1 OR p.type IN ('SUPPLIER', 'BOTH'))
               AND (p.status IS NULL OR p.status = 'ACTIVE')
             ORDER BY p.name ASC
             LIMIT 300`);
        res.json({ suppliers: rows });
    }
    catch (error) {
        console.warn('[POS] getExpenseSuppliers fallback:', error.message);
        res.json({ suppliers: [] });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getExpenseSuppliers = getExpenseSuppliers;
/**
 * GET /api/pos/expense-meta/misc-items
 * Returns EXPENSE-type accounts (excluding COGS) for the مصروفات مختلفة picker.
 */
const getExpenseMiscItems = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const [rows] = yield conn.query(`SELECT a.id, a.name, a.code
             FROM accounts a
             WHERE a.type = 'EXPENSE'
               AND a.code NOT LIKE '5001%'
               AND a.code NOT LIKE '501%'
               AND a.name NOT LIKE '%تكلفة%'
               AND a.name NOT LIKE '%بضاعة%'
               AND a.name NOT LIKE '%COGS%'
             ORDER BY a.code ASC
             LIMIT 100`);
        res.json({ items: rows });
    }
    catch (error) {
        console.warn('[POS] getExpenseMiscItems fallback:', error.message);
        res.json({ items: [] });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getExpenseMiscItems = getExpenseMiscItems;
/**
 * PUT /api/pos/expenses/:id
 */
const updateExpense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const { categoryId, description, amount, sourceType, entityId, entityType } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!categoryId || !amount || !sourceType) {
            return res.status(400).json({ error: 'الفئة والمبلغ ونوع المصدر مطلوبة' });
        }
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
        }
        yield conn.query('START TRANSACTION');
        try {
            // Get existing expense and shift status
            const [rows] = yield conn.query(`SELECT e.*, s.status AS shiftStatus, s.treasuryId, s.branchId, s.openingCash, COALESCE(s.adminOpeningAmount, 0) AS adminOpeningAmount
                 FROM pos_expenses e
                 JOIN pos_shifts s ON e.shiftId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
                 WHERE e.id = ? COLLATE utf8mb4_unicode_ci FOR UPDATE`, [id]);
            if (rows.length === 0) {
                yield conn.query('ROLLBACK');
                return res.status(404).json({ error: 'المصروف غير موجود' });
            }
            const oldExpense = rows[0];
            const isAdmin = ['ADMIN', 'MASTER_ADMIN', 'GENERAL_MANAGER'].includes((_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role) === null || _c === void 0 ? void 0 : _c.toUpperCase()) || ((_e = (_d = req.user) === null || _d === void 0 ? void 0 : _d.permissions) === null || _e === void 0 ? void 0 : _e.includes('pos.admin_edit_invoice'));
            if (oldExpense.shiftStatus !== 'OPEN') {
                yield conn.query('ROLLBACK');
                return res.status(400).json({ error: 'لا يمكن تعديل مصروف من وردية مغلقة' });
            }
            if (oldExpense.createdBy !== userId && !isAdmin) {
                yield conn.query('ROLLBACK');
                return res.status(403).json({ error: 'لا يمكنك تعديل مصروف أضافه كاشير آخر' });
            }
            // Balance check: available balance must include the amount of this expense that we're replacing
            const shift = { openingCash: oldExpense.openingCash, adminOpeningAmount: oldExpense.adminOpeningAmount };
            let available = yield computeAvailableBalance(conn, oldExpense.shiftId, sourceType, shift);
            if (oldExpense.sourceType === sourceType) {
                available += oldExpense.amount;
            }
            if (parsedAmount > available + 0.001) {
                yield conn.query('ROLLBACK');
                const sourceLabel = sourceType === 'daily_takings' ? 'مبيعات اليوم' : 'العهد';
                return res.status(400).json({
                    error: `الرصيد غير كافٍ في ${sourceLabel}. المتاح للتعديل: ${available.toFixed(2)}`,
                    available,
                });
            }
            // 1. DELETE old linked records (advances, cash movements, journal entries, supplier/customer vouchers)
            // 1a. Employee Advance
            if (oldExpense.entityType === 'EMPLOYEE' && oldExpense.entityId) {
                const oldDateStr = oldExpense.createdAt instanceof Date
                    ? oldExpense.createdAt.toISOString().split('T')[0]
                    : String(oldExpense.createdAt).split('T')[0];
                const [advances] = yield conn.query(`SELECT id FROM employee_advances
                     WHERE employeeId = ? AND amount = ? AND status = 'ACTIVE'
                       AND (issueDate = ? OR ABS(DATEDIFF(issueDate, ?)) <= 1)`, [oldExpense.entityId, oldExpense.amount, oldDateStr, oldDateStr]);
                if (advances.length > 0) {
                    const advanceIds = advances.map((a) => a.id);
                    const ph = advanceIds.map(() => '?').join(',');
                    yield conn.query(`DELETE FROM employee_advances WHERE id IN (${ph})`, advanceIds);
                }
            }
            // 1b. Cash movement
            yield conn.query(`DELETE FROM pos_cash_movements
                 WHERE shiftId = ? COLLATE utf8mb4_unicode_ci
                   AND type = 'EXPENSE'
                   AND referenceId = ?`, [oldExpense.shiftId, id]);
            // 1c. Journal entry and lines
            const [journalRows] = yield conn.query(`SELECT id FROM journal_entries WHERE referenceId = ?`, [id]);
            if (journalRows.length > 0) {
                const journalId = journalRows[0].id;
                const [lineRows] = yield conn.query(`SELECT accountId FROM journal_lines WHERE journalId = ?`, [journalId]);
                const accountIds = lineRows.map((r) => r.accountId).filter(Boolean);
                yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [journalId]);
                yield conn.query('DELETE FROM journal_entries WHERE id = ?', [journalId]);
                if (accountIds.length > 0) {
                    yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, accountIds);
                }
            }
            // 1d. Linked invoice (payment/receipt voucher)
            yield conn.query(`DELETE FROM invoices
                 WHERE referenceInvoiceId = ?
                   AND type IN ('PAYMENT', 'RECEIPT')
                   AND status = 'POSTED'`, [id]);
            // 2. UPDATE the expense record
            const now = (0, dateUtils_1.getEgyptianISOString)();
            yield conn.query(`UPDATE pos_expenses
                 SET categoryId = ?, description = ?, amount = ?, sourceType = ?, entityId = ?, entityType = ?
                 WHERE id = ? COLLATE utf8mb4_unicode_ci`, [categoryId, description || null, parsedAmount, sourceType, entityId || null, entityType || null, id]);
            // 3. CREATE new linked records
            // 3a. Employee Advance
            if (entityType === 'EMPLOYEE' && entityId) {
                const advanceId = (0, crypto_1.randomUUID)();
                const catName = yield getCategoryName(conn, categoryId);
                const isShortage = catName.includes('عجز') || (description || '').includes('عجز');
                const advType = isShortage ? 'SHORTAGE' : 'LOAN';
                const advReason = isShortage
                    ? `عجز خزينة من نقطة البيع${description ? ' - ' + description : ''}`
                    : (description || 'سلفة سريعة من نقطة البيع');
                yield conn.query(`INSERT INTO employee_advances (id, employeeId, type, loanType, amount, reason, issueDate, monthlyDeduction, totalPaid, remainingAmount, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'ACTIVE')`, [advanceId, entityId, advType, advType, parsedAmount, advReason, now.split('T')[0], parsedAmount]);
            }
            // 3b. Cash movement
            const movementId = (0, crypto_1.randomUUID)();
            yield conn.query(`INSERT INTO pos_cash_movements (id, shiftId, type, amount, paymentMethod, description, approvedBy, createdAt, referenceId)
                 VALUES (?, ?, 'EXPENSE', ?, 'CASH', ?, ?, ?, ?)`, [movementId, oldExpense.shiftId, parsedAmount, description || 'مصروفات من نقطة البيع', userId, now, id]);
            // 3c. Journal entries
            if (oldExpense.treasuryId) {
                const [treasuryAccRows] = yield conn.query(`SELECT name FROM accounts WHERE id = ? LIMIT 1`, [oldExpense.treasuryId]);
                const treasuryAccountName = ((_f = treasuryAccRows[0]) === null || _f === void 0 ? void 0 : _f.name) || 'خزينة نقطة البيع';
                const expAccountId = yield resolveExpenseAccountId(conn, entityType || null, entityId || null);
                const journalId = (0, crypto_1.randomUUID)();
                const catName = yield getCategoryName(conn, categoryId);
                const journalDesc = `تعديل مصروف POS: ${catName}${description ? ' - ' + description : ''}`;
                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, branchId)
                     VALUES (?, ?, ?, ?, ?, 'EGP', 1, ?)`, [journalId, now, journalDesc, id, userId, oldExpense.branchId || null]);
                yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [[
                        [journalId, expAccountId, catName, parsedAmount, 0, 'EGP', 1, parsedAmount, 0],
                        [journalId, oldExpense.treasuryId, treasuryAccountName, 0, parsedAmount, 'EGP', 1, 0, parsedAmount],
                    ]]);
                yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, [expAccountId, oldExpense.treasuryId]);
            }
            // 3d. Partner vouchers
            if ((entityType === 'SUPPLIER' || entityType === 'CUSTOMER') && entityId) {
                const isSupplier = entityType === 'SUPPLIER';
                const voucherType = isSupplier ? 'PAYMENT' : 'RECEIPT';
                const voucherCategory = isSupplier ? 'supplier' : 'customer';
                const voucherPrefix = isSupplier ? 'PAY-' : 'REC-';
                const [partnerRows] = yield conn.query(`SELECT name FROM partners WHERE id = ? LIMIT 1`, [entityId]);
                const partnerName = ((_g = partnerRows[0]) === null || _g === void 0 ? void 0 : _g.name) || (isSupplier ? 'مورد' : 'عميل');
                const voucherNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, voucherPrefix);
                const voucherId = voucherNumber;
                const catName = yield getCategoryName(conn, categoryId);
                const voucherNotes = `دفعة معدلة من نقطة البيع - ${catName}${description ? ' - ' + description : ''}`;
                yield conn.query(`INSERT INTO invoices
                       (id, number, date, type, partnerId, partnerName, total, status,
                        paymentMethod, posted, notes, voucherCategory, branchId, createdBy, referenceInvoiceId)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'POSTED', 'CASH', 1, ?, ?, ?, ?, ?)`, [
                    voucherId, voucherNumber, now, voucherType,
                    entityId, partnerName, parsedAmount,
                    voucherNotes, voucherCategory,
                    oldExpense.branchId || null, userId,
                    id
                ]);
            }
            yield conn.query('COMMIT');
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'journal', updatedBy: userId });
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoices', updatedBy: userId });
            res.json({ success: true });
        }
        catch (txErr) {
            yield conn.query('ROLLBACK');
            throw txErr;
        }
    }
    catch (error) {
        console.error('[POS Expenses] updateExpense error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.updateExpense = updateExpense;
/**
 * POST /api/pos/expense-categories
 */
const createExpenseCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'اسم الفئة مطلوب' });
        }
        const id = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO pos_expense_categories (id, name, isActive, sortOrder)
             VALUES (?, ?, 1, 0)`, [id, name.trim()]);
        // Broadcast category creation
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'categories', updatedBy: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'POS Cashier' });
        res.status(201).json({ id, name: name.trim(), isActive: 1, sortOrder: 0 });
    }
    catch (error) {
        console.error('[POS Expenses] createExpenseCategory error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.createExpenseCategory = createExpenseCategory;
/**
 * POST /api/pos/expense-accounts
 */
const createPOSExpenseAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { name, code } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'اسم الحساب مطلوب' });
        }
        let finalCode = code === null || code === void 0 ? void 0 : code.trim();
        if (!finalCode) {
            // Find max numeric code starting with '5'
            const [rows] = yield conn.query(`SELECT code FROM accounts 
                 WHERE code REGEXP '^[0-9]+$' AND code LIKE '5%' 
                 ORDER BY CAST(code AS UNSIGNED) DESC LIMIT 1`);
            if (rows.length > 0) {
                const maxCode = parseInt(rows[0].code, 10);
                if (!isNaN(maxCode)) {
                    finalCode = String(maxCode + 1);
                }
            }
            if (!finalCode) {
                finalCode = `5130${Math.floor(100 + Math.random() * 900)}`;
            }
        }
        // Verify code is unique
        const [existing] = yield conn.query(`SELECT id FROM accounts WHERE code = ? LIMIT 1`, [finalCode]);
        if (existing.length > 0) {
            finalCode = `${finalCode}-${Math.floor(10 + Math.random() * 90)}`;
        }
        const id = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO accounts (id, code, name, type, subType, balance, openingBalance, currencyCode)
             VALUES (?, ?, ?, 'EXPENSE', 'OPERATING_EXPENSE', 0, 0, 'EGP')`, [id, finalCode, name.trim()]);
        // Broadcast account creation
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'accounts', updatedBy: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'POS Cashier' });
        res.status(201).json({ id, name: name.trim(), code: finalCode });
    }
    catch (error) {
        console.error('[POS Expenses] createPOSExpenseAccount error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.createPOSExpenseAccount = createPOSExpenseAccount;
