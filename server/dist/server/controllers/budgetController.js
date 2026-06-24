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
exports.getBudgetVariance = exports.deleteBudget = exports.updateBudget = exports.createBudget = exports.getBudgets = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
// ═══════════════════════════════════════════════════════════
// BUDGET MANAGEMENT
// ═══════════════════════════════════════════════════════════
const getBudgets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { fiscalYearId, accountId, costCenterId } = req.query;
        let query = `
            SELECT b.*, 
                a.name as accountName, a.code as accountCode,
                cc.name as costCenterName,
                fy.name as fiscalYearName
            FROM budgets b
            LEFT JOIN accounts a ON b.accountId = a.id
            LEFT JOIN cost_centers cc ON b.costCenterId = cc.id
            LEFT JOIN fiscal_years fy ON b.fiscalYearId = fy.id
            WHERE 1=1
        `;
        const params = [];
        if (fiscalYearId) {
            query += ' AND b.fiscalYearId = ?';
            params.push(fiscalYearId);
        }
        if (accountId) {
            query += ' AND b.accountId = ?';
            params.push(accountId);
        }
        if (costCenterId) {
            query += ' AND b.costCenterId = ?';
            params.push(costCenterId);
        }
        query += ' ORDER BY b.name';
        const [rows] = yield conn.query(query, params);
        // Fetch monthly distributions for each budget
        for (const budget of rows) {
            const [months] = yield conn.query('SELECT month, amount FROM budget_months WHERE budgetId = ? ORDER BY month', [budget.id]);
            budget.months = months;
        }
        conn.release();
        res.json(rows);
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'budgets');
    }
});
exports.getBudgets = getBudgets;
const createBudget = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { name, fiscalYearId, accountId, costCenterId, budgetType, totalBudget, actionOnExceed, notes, months } = req.body;
        if (!name)
            return res.status(400).json({ error: 'اسم الموازنة مطلوب' });
        const id = (0, crypto_1.randomUUID)();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        yield conn.beginTransaction();
        yield conn.query(`INSERT INTO budgets (id, name, fiscalYearId, accountId, costCenterId, budgetType, totalBudget, actionOnExceed, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, name, fiscalYearId || null, accountId || null, costCenterId || null,
            budgetType || 'monthly', totalBudget || 0, actionOnExceed || 'warn', notes || null]);
        // Insert monthly distribution
        if (Array.isArray(months) && months.length > 0) {
            for (const m of months) {
                yield conn.query('INSERT INTO budget_months (id, budgetId, month, amount) VALUES (?, ?, ?, ?)', [(0, crypto_1.randomUUID)(), id, m.month, m.amount || 0]);
            }
        }
        else {
            // Auto-distribute equally across 12 months
            const monthlyAmount = Math.round(((totalBudget || 0) / 12) * 100) / 100;
            for (let m = 1; m <= 12; m++) {
                yield conn.query('INSERT INTO budget_months (id, budgetId, month, amount) VALUES (?, ?, ?, ?)', [(0, crypto_1.randomUUID)(), id, m, monthlyAmount]);
            }
        }
        yield conn.commit();
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'CREATE_BUDGET', `إنشاء موازنة: ${name}`, `المبلغ: ${totalBudget}`);
        }
        catch (_b) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'budgets', updatedBy: user });
        res.status(201).json({ id, name });
    }
    catch (error) {
        try {
            yield conn.rollback();
        }
        catch (_c) { }
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'budget');
    }
});
exports.createBudget = createBudget;
const updateBudget = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const { name, fiscalYearId, accountId, costCenterId, budgetType, totalBudget, actionOnExceed, notes, months } = req.body;
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        yield conn.beginTransaction();
        yield conn.query(`UPDATE budgets SET name = ?, fiscalYearId = ?, accountId = ?, costCenterId = ?, 
             budgetType = ?, totalBudget = ?, actionOnExceed = ?, notes = ? WHERE id = ?`, [name, fiscalYearId || null, accountId || null, costCenterId || null,
            budgetType || 'monthly', totalBudget || 0, actionOnExceed || 'warn', notes || null, id]);
        // Replace monthly distribution
        yield conn.query('DELETE FROM budget_months WHERE budgetId = ?', [id]);
        if (Array.isArray(months) && months.length > 0) {
            for (const m of months) {
                yield conn.query('INSERT INTO budget_months (id, budgetId, month, amount) VALUES (?, ?, ?, ?)', [(0, crypto_1.randomUUID)(), id, m.month, m.amount || 0]);
            }
        }
        yield conn.commit();
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'UPDATE_BUDGET', `تحديث موازنة: ${name}`, `الاسم: ${name}`);
        }
        catch (_b) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'budgets', updatedBy: user });
        res.json({ id, name });
    }
    catch (error) {
        try {
            yield conn.rollback();
        }
        catch (_c) { }
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'budget');
    }
});
exports.updateBudget = updateBudget;
const deleteBudget = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        const [row] = yield conn.query('SELECT name FROM budgets WHERE id = ?', [id]);
        const budgetName = ((_b = row[0]) === null || _b === void 0 ? void 0 : _b.name) || id;
        yield conn.query('DELETE FROM budgets WHERE id = ?', [id]);
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'DELETE_BUDGET', `حذف موازنة: ${budgetName}`, `المعرف: ${id}`);
        }
        catch (_c) { }
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'budgets', entityId: id, deletedBy: user });
        res.json({ message: 'تم حذف الموازنة بنجاح' });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'budget');
    }
});
exports.deleteBudget = deleteBudget;
/** Budget variance report: actual vs budgeted per account/cost center */
const getBudgetVariance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { fiscalYearId, month } = req.query;
        if (!fiscalYearId) {
            conn.release();
            return res.status(400).json({ error: 'السنة المالية مطلوبة' });
        }
        // Get fiscal year date range
        const [fyRows] = yield conn.query('SELECT startDate, endDate FROM fiscal_years WHERE id = ?', [fiscalYearId]);
        if (!Array.isArray(fyRows) || fyRows.length === 0) {
            conn.release();
            return res.status(404).json({ error: 'السنة المالية غير موجودة' });
        }
        const fy = fyRows[0];
        const targetMonth = month ? parseInt(month) : null;
        // Get all budgets for this fiscal year
        const [budgets] = yield conn.query(`
            SELECT b.*, bm.month, bm.amount as budgetedAmount,
                a.name as accountName, a.code as accountCode,
                cc.name as costCenterName
            FROM budgets b
            JOIN budget_months bm ON b.id = bm.budgetId
            LEFT JOIN accounts a ON b.accountId = a.id
            LEFT JOIN cost_centers cc ON b.costCenterId = cc.id
            WHERE b.fiscalYearId = ? AND b.isActive = 1
            ${targetMonth ? 'AND bm.month = ?' : ''}
            ORDER BY b.name, bm.month
        `, targetMonth ? [fiscalYearId, targetMonth] : [fiscalYearId]);
        // Get actual spending from journal lines
        const varianceData = [];
        for (const budget of budgets) {
            let actualQuery = `
                SELECT COALESCE(SUM(jl.debit), 0) as totalDebit, COALESCE(SUM(jl.credit), 0) as totalCredit
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journalId = je.id
                WHERE MONTH(je.date) = ? AND je.date BETWEEN ? AND ?
            `;
            const actualParams = [budget.month, fy.startDate, fy.endDate];
            if (budget.accountId) {
                actualQuery += ' AND jl.accountId = ?';
                actualParams.push(budget.accountId);
            }
            if (budget.costCenterId) {
                actualQuery += ' AND jl.costCenterId = ?';
                actualParams.push(budget.costCenterId);
            }
            const [actual] = yield conn.query(actualQuery, actualParams);
            const actualAmount = ((_a = actual[0]) === null || _a === void 0 ? void 0 : _a.totalDebit) || 0;
            const budgeted = budget.budgetedAmount || 0;
            const variance = budgeted - actualAmount;
            const variancePercentage = budgeted > 0 ? ((variance / budgeted) * 100) : 0;
            varianceData.push({
                budgetId: budget.id,
                budgetName: budget.name,
                accountName: budget.accountName,
                accountCode: budget.accountCode,
                costCenterName: budget.costCenterName,
                month: budget.month,
                budgetedAmount: budgeted,
                actualAmount,
                variance,
                variancePercentage: Math.round(variancePercentage * 100) / 100,
                status: variance >= 0 ? 'within_budget' : 'exceeded',
                actionOnExceed: budget.actionOnExceed
            });
        }
        conn.release();
        res.json(varianceData);
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'budget variance');
    }
});
exports.getBudgetVariance = getBudgetVariance;
