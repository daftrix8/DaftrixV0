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
exports.getExpenseMiscItems = exports.getExpenseSuppliers = exports.getExpenseEmployees = exports.deleteExpense = exports.getShiftExpenses = exports.addExpense = exports.getExpenseCategories = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const dateUtils_1 = require("../../utils/dateUtils");
// ── Schema helpers ─────────────────────────────────────────────────────────
function ensureExpenseTables(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        yield conn.query(`
        CREATE TABLE IF NOT EXISTS pos_expense_categories (
            id        VARCHAR(36)  NOT NULL,
            name      VARCHAR(255) NOT NULL,
            isActive  TINYINT(1)   NOT NULL DEFAULT 1,
            sortOrder INT          NOT NULL DEFAULT 0,
            createdAt DATETIME     DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
        yield conn.query(`
        CREATE TABLE IF NOT EXISTS pos_expenses (
            id          VARCHAR(36)                              NOT NULL,
            shiftId     VARCHAR(36)                              NOT NULL,
            categoryId  VARCHAR(36)                              NOT NULL,
            description TEXT                                     NULL,
            amount      DECIMAL(15,2)                            NOT NULL,
            sourceType  ENUM('daily_takings','prior_balance')    NOT NULL,
            entityId    VARCHAR(36)                              NULL,
            entityType  ENUM('EMPLOYEE', 'SUPPLIER', 'MISC')     NULL,
            createdBy   VARCHAR(36)                              NOT NULL,
            createdAt   DATETIME                                 DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            CONSTRAINT fk_expense_shift FOREIGN KEY (shiftId) REFERENCES pos_shifts(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
        // Retrofit existing tables
        try {
            yield conn.query(`ALTER TABLE pos_expenses ADD COLUMN entityId VARCHAR(36) NULL`);
            yield conn.query(`ALTER TABLE pos_expenses ADD COLUMN entityType ENUM('EMPLOYEE', 'SUPPLIER', 'MISC') NULL`);
        }
        catch (_a) {
            // Columns likely exist
        }
        // Seed default categories once
        const [cats] = yield conn.query(`SELECT COUNT(*) AS cnt FROM pos_expense_categories`);
        if (cats[0].cnt === 0) {
            const seeds = [
                { id: (0, crypto_1.randomUUID)(), name: 'سلف موظفين', sortOrder: 1 },
                { id: (0, crypto_1.randomUUID)(), name: 'دفعات موردين', sortOrder: 2 },
                { id: (0, crypto_1.randomUUID)(), name: 'مصروفات مختلفة', sortOrder: 3 },
            ];
            for (const s of seeds) {
                yield conn.query(`INSERT INTO pos_expense_categories (id, name, sortOrder) VALUES (?, ?, ?)`, [s.id, s.name, s.sortOrder]);
            }
        }
    });
}
// ── Helpers ────────────────────────────────────────────────────────────────
function computeAvailableBalance(conn, shiftId, sourceType, shift) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        if (sourceType === 'daily_takings') {
            // Daily takings = SUM of confirmed CASH sale movements in this shift
            const [cashRows] = yield conn.query(`SELECT COALESCE(SUM(amount), 0) AS total
             FROM pos_cash_movements
             WHERE shiftId = ? COLLATE utf8mb4_unicode_ci AND type = 'SALE' AND paymentMethod = 'CASH'`, [shiftId]);
            const totalCashSales = parseFloat(((_a = cashRows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0);
            const [spentRows] = yield conn.query(`SELECT COALESCE(SUM(amount), 0) AS spent
             FROM pos_expenses
             WHERE shiftId = ? COLLATE utf8mb4_unicode_ci AND sourceType = 'daily_takings'`, [shiftId]);
            const alreadySpent = parseFloat(((_b = spentRows[0]) === null || _b === void 0 ? void 0 : _b.spent) || 0);
            return Math.max(0, totalCashSales - alreadySpent);
        }
        // Prior balance = cashier opening + admin opening
        const priorBalance = parseFloat(shift.openingCash || 0) + parseFloat(shift.adminOpeningAmount || 0);
        const [spentRows] = yield conn.query(`SELECT COALESCE(SUM(amount), 0) AS spent
         FROM pos_expenses
         WHERE shiftId = ? COLLATE utf8mb4_unicode_ci AND sourceType = 'prior_balance'`, [shiftId]);
        const alreadySpent = parseFloat(((_c = spentRows[0]) === null || _c === void 0 ? void 0 : _c.spent) || 0);
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
        yield ensureExpenseTables(conn);
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
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield ensureExpenseTables(conn);
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
        // Verify shift is open and belongs to the current user
        const [shifts] = yield conn.query(`SELECT * FROM pos_shifts
             WHERE id = ? COLLATE utf8mb4_unicode_ci AND status = 'OPEN' COLLATE utf8mb4_unicode_ci`, [shiftId]);
        if (shifts.length === 0) {
            return res.status(404).json({ error: 'الوردية غير موجودة أو مغلقة' });
        }
        const shift = shifts[0];
        // Balance check
        const available = yield computeAvailableBalance(conn, shiftId, sourceType, shift);
        if (parsedAmount > available + 0.001) {
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
        // HR Integration: Register Employee Advance automatically
        if (entityType === 'EMPLOYEE' && entityId) {
            const advanceId = (0, crypto_1.randomUUID)();
            yield conn.query(`INSERT INTO employee_advances (id, employeeId, type, amount, reason, issueDate, monthlyDeduction, totalPaid, remainingAmount, status)
                 VALUES (?, ?, 'LOAN', ?, ?, ?, 0, 0, ?, 'ACTIVE')`, [advanceId, entityId, parsedAmount, description || 'سلفة سريعة من نقطة البيع', now.split('T')[0], parsedAmount]);
        }
        // Add corresponding movement in pos_cash_movements
        const movementId = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO pos_cash_movements (id, shiftId, type, amount, paymentMethod, description, approvedBy, createdAt)
             VALUES (?, ?, 'EXPENSE', ?, 'CASH', ?, ?, ?)`, [movementId, shiftId, parsedAmount, description || 'مصروفات من نقطة البيع', userId, now]);
        // Return updated balances
        const dailyAvailable = yield computeAvailableBalance(conn, shiftId, 'daily_takings', shift);
        const priorAvailable = yield computeAvailableBalance(conn, shiftId, 'prior_balance', shift);
        res.json({
            success: true,
            expense: { id, shiftId, categoryId, description, amount: parsedAmount, sourceType, createdBy: userId, createdAt: now },
            available: { daily_takings: dailyAvailable, prior_balance: priorAvailable },
        });
    }
    catch (error) {
        console.error('[POS Expenses] addExpense error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
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
        yield ensureExpenseTables(conn);
        const { shiftId } = req.params;
        const [expenses] = yield conn.query(`SELECT e.*, c.name AS categoryName
             FROM pos_expenses e
             LEFT JOIN pos_expense_categories c ON e.categoryId COLLATE utf8mb4_unicode_ci = c.id COLLATE utf8mb4_unicode_ci
             WHERE e.shiftId = ? COLLATE utf8mb4_unicode_ci
             ORDER BY e.createdAt ASC`, [shiftId]);
        // Totals per source
        const [totals] = yield conn.query(`SELECT sourceType, COALESCE(SUM(amount), 0) AS total
             FROM pos_expenses
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
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        // Verify expense exists, shift is open, and created by current user
        const [rows] = yield conn.query(`SELECT e.id, e.createdBy, s.status AS shiftStatus
             FROM pos_expenses e
             JOIN pos_shifts s ON e.shiftId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
             WHERE e.id = ? COLLATE utf8mb4_unicode_ci`, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'المصروف غير موجود' });
        }
        const expense = rows[0];
        if (expense.shiftStatus !== 'OPEN') {
            return res.status(400).json({ error: 'لا يمكن حذف مصروف من وردية مغلقة' });
        }
        if (expense.createdBy !== userId) {
            return res.status(403).json({ error: 'لا يمكنك حذف مصروف أضافه كاشير آخر' });
        }
        yield conn.query(`DELETE FROM pos_expenses WHERE id = ? COLLATE utf8mb4_unicode_ci`, [id]);
        res.json({ success: true });
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
