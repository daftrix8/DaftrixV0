"use strict";
/**
 * Fiscal Year Controller
 * Manages fiscal year CRUD, closing/locking, and reopening.
 *
 * Architecture: Odoo-style "Continuous Accounting"
 * - Closing = setting lock dates (NOT creating zeroing journal entries)
 * - Balances are computed dynamically via date-filtered SUM queries
 * - Lock dates prevent modifications in protected periods
 * - No destructive balance resets or opening balance mutations
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
exports.togglePeriodLock = exports.generatePeriodsForYear = exports.getPeriodsForYear = exports.getComparison = exports.getClosingChecklist = exports.previewClose = exports.getLockDates = exports.updateLockDates = exports.reopenFiscalYear = exports.closeFiscalYear = exports.deleteFiscalYear = exports.updateFiscalYear = exports.createFiscalYear = exports.getFiscalYears = exports.listFiscalYears = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const auditController_1 = require("./auditController");
/**
 * GET /api/fiscal-years/list — Public (for login dropdown)
 * Returns minimal fiscal year data (id, name, status)
 */
const listFiscalYears = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.pool.query('SELECT id, name, start_date, end_date, status FROM fiscal_years ORDER BY start_date DESC');
        res.json({ years: rows });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error listing fiscal years');
    }
});
exports.listFiscalYears = listFiscalYears;
/**
 * GET /api/fiscal-years — Admin, full details with stats
 */
const getFiscalYears = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        try {
            const [years] = yield conn.query('SELECT * FROM fiscal_years ORDER BY start_date DESC');
            // Get transaction counts per year
            const enriched = yield Promise.all(years.map((year) => __awaiter(void 0, void 0, void 0, function* () {
                var _a, _b;
                const [invoiceCount] = yield conn.query('SELECT COUNT(*) as cnt FROM invoices WHERE date >= ? AND date <= ?', [year.start_date, year.end_date]);
                const [journalCount] = yield conn.query('SELECT COUNT(*) as cnt FROM journal_entries WHERE date >= ? AND date <= ?', [year.start_date, year.end_date]);
                return Object.assign(Object.assign({}, year), { invoiceCount: ((_a = invoiceCount[0]) === null || _a === void 0 ? void 0 : _a.cnt) || 0, journalCount: ((_b = journalCount[0]) === null || _b === void 0 ? void 0 : _b.cnt) || 0 });
            })));
            res.json({ years: enriched });
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error getting fiscal years');
    }
});
exports.getFiscalYears = getFiscalYears;
/**
 * POST /api/fiscal-years — Create a new fiscal year
 */
const createFiscalYear = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { name, startDate, endDate, notes } = req.body;
        if (!name || !startDate || !endDate) {
            return res.status(400).json({ error: 'Name, start date, and end date are required' });
        }
        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (end <= start) {
            return res.status(400).json({ error: 'End date must be after start date' });
        }
        // Check for overlapping years
        const [overlaps] = yield db_1.pool.query(`SELECT id, name FROM fiscal_years 
             WHERE (start_date <= ? AND end_date >= ?) 
                OR (start_date <= ? AND end_date >= ?)
                OR (start_date >= ? AND end_date <= ?)`, [endDate, startDate, endDate, startDate, startDate, endDate]);
        if (overlaps.length > 0) {
            return res.status(400).json({
                error: `This date range overlaps with fiscal year "${overlaps[0].name}"`
            });
        }
        const id = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`INSERT INTO fiscal_years (id, name, start_date, end_date, status, notes) 
             VALUES (?, ?, ?, ?, 'OPEN', ?)`, [id, name, startDate, endDate, notes || null]);
        const authReq = req;
        const createdBy = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.username) || 'System';
        try {
            yield (0, auditController_1.logAction)(createdBy, 'FISCAL_YEAR', 'CREATE', `إنشاء سنة مالية: ${name}`, JSON.stringify({ id, name, startDate, endDate }));
        }
        catch (_e) { }
        res.status(201).json({
            message: 'Fiscal year created successfully',
            id,
            name,
            startDate,
            endDate
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error creating fiscal year');
    }
});
exports.createFiscalYear = createFiscalYear;
/**
 * PUT /api/fiscal-years/:id — Update a fiscal year (only if OPEN)
 */
const updateFiscalYear = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, startDate, endDate, notes } = req.body;
        // Check current status
        const [existing] = yield db_1.pool.query('SELECT status FROM fiscal_years WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Fiscal year not found' });
        }
        if (existing[0].status === 'CLOSED') {
            return res.status(400).json({ error: 'Cannot edit a closed fiscal year' });
        }
        const updates = [];
        const values = [];
        if (name) {
            updates.push('name = ?');
            values.push(name);
        }
        if (startDate) {
            updates.push('start_date = ?');
            values.push(startDate);
        }
        if (endDate) {
            updates.push('end_date = ?');
            values.push(endDate);
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes);
        }
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        values.push(id);
        yield db_1.pool.query(`UPDATE fiscal_years SET ${updates.join(', ')} WHERE id = ?`, values);
        res.json({ message: 'Fiscal year updated successfully' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error updating fiscal year');
    }
});
exports.updateFiscalYear = updateFiscalYear;
/**
 * DELETE /api/fiscal-years/:id — Delete a fiscal year (only if OPEN and no transactions)
 */
const deleteFiscalYear = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { id } = req.params;
        const [existing] = yield db_1.pool.query('SELECT * FROM fiscal_years WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Fiscal year not found' });
        }
        if (existing[0].status === 'CLOSED') {
            return res.status(400).json({ error: 'Cannot delete a closed fiscal year' });
        }
        // Check if there are transactions in this period
        const [invoices] = yield db_1.pool.query('SELECT COUNT(*) as cnt FROM invoices WHERE date >= ? AND date <= ?', [existing[0].start_date, existing[0].end_date]);
        if (((_a = invoices[0]) === null || _a === void 0 ? void 0 : _a.cnt) > 0) {
            return res.status(400).json({
                error: `Cannot delete: ${invoices[0].cnt} invoices exist in this period`
            });
        }
        yield db_1.pool.query('DELETE FROM fiscal_years WHERE id = ?', [id]);
        const authReq = req;
        const deletedBy = ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.name) || ((_c = authReq.user) === null || _c === void 0 ? void 0 : _c.username) || 'System';
        try {
            yield (0, auditController_1.logAction)(deletedBy, 'FISCAL_YEAR', 'DELETE', `حذف سنة مالية: ${existing[0].name}`, JSON.stringify({ id, name: existing[0].name }));
        }
        catch (_e) { }
        res.json({ message: 'Fiscal year deleted successfully' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error deleting fiscal year');
    }
});
exports.deleteFiscalYear = deleteFiscalYear;
/**
 * POST /api/fiscal-years/:id/close — Lock a fiscal year (Non-destructive)
 *
 * Odoo-style continuous accounting approach:
 *   1. Sets fiscalyear_lock_date = end_date (prevents new entries)
 *   2. Sets status = 'LOCKED'
 *   3. Computes P&L summary dynamically (no zeroing entries)
 *   4. Does NOT touch account balances or create closing journals
 *
 * The "retained earnings" transfer is left as an OPTIONAL manual step
 * the accountant can perform via a regular journal entry.
 */
const closeFiscalYear = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _f, _g, _h;
    try {
        const { id } = req.params;
        const { createRetainedEarningsEntry } = req.body; // Optional: user explicitly requests it
        const authReq = req;
        const closedBy = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.username) || 'System';
        const conn = yield (0, db_1.getConnection)();
        try {
            const [years] = yield conn.query('SELECT * FROM fiscal_years WHERE id = ?', [id]);
            if (years.length === 0) {
                return res.status(404).json({ error: 'Fiscal year not found' });
            }
            const year = years[0];
            if (year.status === 'CLOSED' || year.status === 'LOCKED') {
                return res.status(400).json({ error: 'السنة المالية مقفلة بالفعل' });
            }
            yield conn.beginTransaction();
            // ── STEP 1: Compute P&L summary (dynamic, no mutations) ──
            const [revenueAccounts] = yield conn.query(`
                SELECT a.id, a.name, a.code,
                       COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) as balance
                FROM accounts a
                INNER JOIN journal_lines jl ON jl.accountId = a.id
                INNER JOIN journal_entries je ON jl.journalId = je.id
                WHERE a.type IN ('REVENUE', 'INCOME')
                  AND je.date >= ? AND je.date <= ?
                GROUP BY a.id, a.name, a.code
                HAVING balance != 0
            `, [year.start_date, year.end_date]);
            const [expenseAccounts] = yield conn.query(`
                SELECT a.id, a.name, a.code,
                       COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) as balance
                FROM accounts a
                INNER JOIN journal_lines jl ON jl.accountId = a.id
                INNER JOIN journal_entries je ON jl.journalId = je.id
                WHERE a.type IN ('EXPENSE', 'EXPENSES')
                  AND je.date >= ? AND je.date <= ?
                GROUP BY a.id, a.name, a.code
                HAVING balance != 0
            `, [year.start_date, year.end_date]);
            const totalRevenue = revenueAccounts.reduce((s, a) => s + Number(a.balance), 0);
            const totalExpenses = expenseAccounts.reduce((s, a) => s + Number(a.balance), 0);
            const netIncome = totalRevenue - totalExpenses;
            // ── STEP 2: Inventory value (read-only snapshot for reporting) ──
            let inventoryValue = 0;
            try {
                const [invResult] = yield conn.query(`
                    SELECT COALESCE(SUM(CAST(stock AS DECIMAL(15,2)) * CAST(costPrice AS DECIMAL(15,2))), 0) as totalValue
                    FROM products WHERE CAST(stock AS DECIMAL(15,2)) > 0
                `);
                inventoryValue = Number((_c = invResult[0]) === null || _c === void 0 ? void 0 : _c.totalValue) || 0;
            }
            catch (_e) { }
            // ── STEP 3: Optional retained earnings journal entry ──
            // Only created if the user explicitly requests it (not auto-generated)
            // This transfers P&L balances → retained earnings (Odoo-style year-end transfer)
            let closingJournalId = null;
            if (createRetainedEarningsEntry && netIncome !== 0) {
                const [retainedEarningsAcct] = yield conn.query(`SELECT id, name FROM accounts WHERE (name LIKE '%أرباح محتجزة%' OR name LIKE '%retained%' OR name LIKE '%أرباح مرحلة%') LIMIT 1`);
                let retainedId = (_d = retainedEarningsAcct[0]) === null || _d === void 0 ? void 0 : _d.id;
                let retainedName = ((_f = retainedEarningsAcct[0]) === null || _f === void 0 ? void 0 : _f.name) || 'أرباح محتجزة';
                if (!retainedId) {
                    const [equityAcct] = yield conn.query(`SELECT id, name FROM accounts WHERE type IN ('EQUITY', 'CAPITAL') LIMIT 1`);
                    retainedId = (_g = equityAcct[0]) === null || _g === void 0 ? void 0 : _g.id;
                    retainedName = ((_h = equityAcct[0]) === null || _h === void 0 ? void 0 : _h.name) || 'حقوق الملكية';
                }
                if (retainedId) {
                    closingJournalId = (0, crypto_1.randomUUID)();
                    yield conn.query(`
                        INSERT INTO journal_entries (id, date, description, referenceId, createdBy)
                        VALUES (?, ?, ?, ?, ?)
                    `, [
                        closingJournalId, year.end_date,
                        `تحويل صافي ${netIncome >= 0 ? 'الربح' : 'الخسارة'} للسنة ${year.name}: ${netIncome.toLocaleString()}`,
                        `FY-TRANSFER-${year.name}`, closedBy
                    ]);
                    // Close revenue accounts: Debit each revenue account (reduces its credit balance)
                    for (const acct of revenueAccounts) {
                        if (Number(acct.balance) === 0)
                            continue;
                        const bal = Number(acct.balance);
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, ?, ?)`, [closingJournalId, acct.id, acct.name, Math.abs(bal), 0]);
                    }
                    // Close expense accounts: Credit each expense account (reduces its debit balance)
                    for (const acct of expenseAccounts) {
                        if (Number(acct.balance) === 0)
                            continue;
                        const bal = Number(acct.balance);
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, ?, ?)`, [closingJournalId, acct.id, acct.name, 0, Math.abs(bal)]);
                    }
                    // Net to retained earnings: Credit if profit, Debit if loss
                    if (netIncome > 0) {
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, 0, ?)`, [closingJournalId, retainedId, retainedName, netIncome]);
                    }
                    else {
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, ?, 0)`, [closingJournalId, retainedId, retainedName, Math.abs(netIncome)]);
                    }
                }
            }
            // ── STEP 4: Set lock dates + status (THE CORE CHANGE) ──
            // Lock date = end_date prevents any entry on or before that date
            yield conn.query(`UPDATE fiscal_years 
                 SET status = 'LOCKED',
                     fiscalyear_lock_date = ?,
                     closed_by = ?, 
                     closed_at = NOW(),
                     closing_journal_id = ?
                 WHERE id = ?`, [year.end_date, closedBy, closingJournalId, id]);
            // ── NO balance resets. NO UPDATE accounts SET balance = 0. ──
            // ── NO openingBalance mutations. Balances stay intact. ──
            yield conn.commit();
            try {
                yield (0, auditController_1.logAction)(closedBy, 'FISCAL_YEAR', 'LOCK', `إقفال سنة مالية: ${year.name}`, JSON.stringify({ id, name: year.name, netIncome, totalRevenue, totalExpenses }));
            }
            catch (_e) { }
            // Suggest next year
            const nextStart = new Date(year.end_date);
            nextStart.setDate(nextStart.getDate() + 1);
            const nextEnd = new Date(nextStart);
            nextEnd.setFullYear(nextEnd.getFullYear() + 1);
            nextEnd.setDate(nextEnd.getDate() - 1);
            const suggestedNextYear = {
                name: String(nextStart.getFullYear()),
                startDate: nextStart.toISOString().slice(0, 10),
                endDate: nextEnd.toISOString().slice(0, 10)
            };
            res.json({
                message: `تم إقفال السنة المالية ${year.name} بنجاح`,
                summary: {
                    totalRevenue,
                    totalExpenses,
                    netIncome,
                    inventoryValue,
                    closingJournalId,
                    revenueAccountsClosed: revenueAccounts.length,
                    expenseAccountsClosed: expenseAccounts.length
                },
                suggestedNextYear
            });
        }
        catch (err) {
            yield conn.rollback();
            throw err;
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error closing fiscal year');
    }
});
exports.closeFiscalYear = closeFiscalYear;
/**
 * POST /api/fiscal-years/:id/reopen — Reopen a locked fiscal year
 *
 * Non-destructive: Simply clears lock dates and resets status to OPEN.
 * No journal deletion, no balance recalculation needed since we never
 * zeroed anything in the first place.
 *
 * Hard lock dates CANNOT be cleared — they're permanent.
 */
const reopenFiscalYear = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const authReq = req;
        const reopenedBy = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.username) || 'System';
        const conn = yield (0, db_1.getConnection)();
        try {
            const [existing] = yield conn.query('SELECT * FROM fiscal_years WHERE id = ?', [id]);
            if (existing.length === 0) {
                return res.status(404).json({ error: 'Fiscal year not found' });
            }
            if (existing[0].status === 'OPEN') {
                return res.status(400).json({ error: 'السنة المالية مفتوحة بالفعل' });
            }
            // Hard lock cannot be overridden
            if (existing[0].hard_lock_date) {
                return res.status(403).json({
                    error: 'HARD_LOCK_ACTIVE',
                    message: 'لا يمكن إعادة فتح سنة مالية عليها قفل نهائي (Hard Lock). يجب إزالة القفل النهائي أولاً بواسطة مدير النظام.',
                    hardLockDate: existing[0].hard_lock_date
                });
            }
            // Simple status + lock date reset — no destructive operations
            yield conn.query(`UPDATE fiscal_years 
                 SET status = 'OPEN',
                     fiscalyear_lock_date = NULL,
                     tax_lock_date = NULL,
                     closed_by = NULL, 
                     closed_at = NULL
                 WHERE id = ?`, [id]);
            try {
                yield (0, auditController_1.logAction)(reopenedBy, 'FISCAL_YEAR', 'REOPEN', `إعادة فتح سنة مالية: ${existing[0].name}`, JSON.stringify({ id, name: existing[0].name }));
            }
            catch (_e) { }
            res.json({ message: `تم إعادة فتح السنة المالية ${existing[0].name}` });
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error reopening fiscal year');
    }
});
exports.reopenFiscalYear = reopenFiscalYear;
/**
 * PUT /api/fiscal-years/:id/lock-dates — Update lock dates granularly
 * Allows setting/clearing individual lock dates without full close/reopen cycle.
 */
const updateLockDates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { fiscalyearLockDate, taxLockDate, hardLockDate } = req.body;
        const authReq = req;
        const updatedBy = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.username) || 'System';
        const [existing] = yield db_1.pool.query('SELECT * FROM fiscal_years WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Fiscal year not found' });
        }
        // Hard lock can only be SET, never cleared (immutable by design)
        if (existing[0].hard_lock_date && hardLockDate === null) {
            return res.status(403).json({
                error: 'HARD_LOCK_IMMUTABLE',
                message: 'القفل النهائي (Hard Lock) لا يمكن إزالته بعد تفعيله. هذا التصميم متعمد لضمان سلامة البيانات.'
            });
        }
        const updates = [];
        const values = [];
        if (fiscalyearLockDate !== undefined) {
            updates.push('fiscalyear_lock_date = ?');
            values.push(fiscalyearLockDate || null);
        }
        if (taxLockDate !== undefined) {
            updates.push('tax_lock_date = ?');
            values.push(taxLockDate || null);
        }
        if (hardLockDate !== undefined) {
            updates.push('hard_lock_date = ?');
            values.push(hardLockDate || null);
        }
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No lock dates provided' });
        }
        values.push(id);
        yield db_1.pool.query(`UPDATE fiscal_years SET ${updates.join(', ')} WHERE id = ?`, values);
        try {
            yield (0, auditController_1.logAction)(updatedBy, 'FISCAL_YEAR', 'UPDATE_LOCK_DATES', `تحديث تواريخ القفل: ${existing[0].name}`, JSON.stringify({ id, fiscalyearLockDate, taxLockDate, hardLockDate }));
        }
        catch (_e) { }
        res.json({ message: 'تم تحديث تواريخ القفل بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error updating lock dates');
    }
});
exports.updateLockDates = updateLockDates;
/**
 * GET /api/fiscal-years/:id/lock-dates — Get current lock date settings
 */
const getLockDates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [rows] = yield db_1.pool.query(`SELECT id, name, start_date, end_date, status,
                    fiscalyear_lock_date, tax_lock_date, hard_lock_date,
                    closed_by, closed_at
             FROM fiscal_years WHERE id = ?`, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Fiscal year not found' });
        }
        res.json({ lockDates: rows[0] });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error getting lock dates');
    }
});
exports.getLockDates = getLockDates;
/**
 * GET /api/fiscal-years/:id/preview — Pre-close financial preview
 * Shows P&L summary, inventory value, and counts WITHOUT closing
 */
const previewClose = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        try {
            const [years] = yield conn.query('SELECT * FROM fiscal_years WHERE id = ?', [id]);
            if (years.length === 0)
                return res.status(404).json({ error: 'Fiscal year not found' });
            const year = years[0];
            // Revenue accounts
            const [revenueAccounts] = yield conn.query(`
                SELECT a.id, a.name, a.code,
                       COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) as balance
                FROM accounts a
                INNER JOIN journal_lines jl ON jl.accountId = a.id
                INNER JOIN journal_entries je ON jl.journalId = je.id
                WHERE a.type IN ('REVENUE', 'INCOME')
                  AND je.date >= ? AND je.date <= ?
                GROUP BY a.id, a.name, a.code
                HAVING balance != 0
            `, [year.start_date, year.end_date]);
            // Expense accounts
            const [expenseAccounts] = yield conn.query(`
                SELECT a.id, a.name, a.code,
                       COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) as balance
                FROM accounts a
                INNER JOIN journal_lines jl ON jl.accountId = a.id
                INNER JOIN journal_entries je ON jl.journalId = je.id
                WHERE a.type IN ('EXPENSE', 'EXPENSES')
                  AND je.date >= ? AND je.date <= ?
                GROUP BY a.id, a.name, a.code
                HAVING balance != 0
            `, [year.start_date, year.end_date]);
            const totalRevenue = revenueAccounts.reduce((s, a) => s + Number(a.balance), 0);
            const totalExpenses = expenseAccounts.reduce((s, a) => s + Number(a.balance), 0);
            const netIncome = totalRevenue - totalExpenses;
            // Counts
            const [invoiceCount] = yield conn.query('SELECT COUNT(*) as cnt FROM invoices WHERE date >= ? AND date <= ?', [year.start_date, year.end_date]);
            const [journalCount] = yield conn.query('SELECT COUNT(*) as cnt FROM journal_entries WHERE date >= ? AND date <= ?', [year.start_date, year.end_date]);
            // Inventory snapshot
            let inventoryValue = 0;
            try {
                const [invResult] = yield conn.query(`
                    SELECT COALESCE(SUM(CAST(stock AS DECIMAL(15,2)) * CAST(costPrice AS DECIMAL(15,2))), 0) as totalValue
                    FROM products WHERE CAST(stock AS DECIMAL(15,2)) > 0
                `);
                inventoryValue = Number((_a = invResult[0]) === null || _a === void 0 ? void 0 : _a.totalValue) || 0;
            }
            catch (_e) { }
            res.json({
                year: { id: year.id, name: year.name, start_date: year.start_date, end_date: year.end_date, status: year.status },
                summary: {
                    totalRevenue,
                    totalExpenses,
                    netIncome,
                    inventoryValue,
                    invoiceCount: ((_b = invoiceCount[0]) === null || _b === void 0 ? void 0 : _b.cnt) || 0,
                    journalCount: ((_c = journalCount[0]) === null || _c === void 0 ? void 0 : _c.cnt) || 0,
                    revenueAccounts: revenueAccounts.map((a) => ({ name: a.name, code: a.code, balance: Number(a.balance) })),
                    expenseAccounts: expenseAccounts.map((a) => ({ name: a.name, code: a.code, balance: Number(a.balance) }))
                }
            });
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error previewing fiscal year close');
    }
});
exports.previewClose = previewClose;
/**
 * GET /api/fiscal-years/:id/checklist — Closing readiness checklist
 */
const getClosingChecklist = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        try {
            const [years] = yield conn.query('SELECT * FROM fiscal_years WHERE id = ?', [id]);
            if (years.length === 0)
                return res.status(404).json({ error: 'Fiscal year not found' });
            const year = years[0];
            const checks = [];
            // 1. Check for draft invoices
            const [draftInvoices] = yield conn.query(`SELECT COUNT(*) as cnt FROM invoices WHERE date >= ? AND date <= ? AND status = 'DRAFT'`, [year.start_date, year.end_date]);
            const draftCount = ((_a = draftInvoices[0]) === null || _a === void 0 ? void 0 : _a.cnt) || 0;
            checks.push({
                label: 'لا توجد فواتير مسودة',
                passed: draftCount === 0,
                detail: draftCount > 0 ? `يوجد ${draftCount} فاتورة مسودة` : 'جميع الفواتير مُرحّلة'
            });
            // 2. Check all journal entries are balanced
            const [unbalancedJournals] = yield conn.query(`
                SELECT j.id, j.description,
                       ABS(SUM(jl.debit) - SUM(jl.credit)) as diff
                FROM journal_entries j
                INNER JOIN journal_lines jl ON jl.journalId = j.id
                WHERE j.date >= ? AND j.date <= ?
                GROUP BY j.id, j.description
                HAVING diff > 0.01
            `, [year.start_date, year.end_date]);
            checks.push({
                label: 'جميع القيود متوازنة',
                passed: unbalancedJournals.length === 0,
                detail: unbalancedJournals.length > 0 ? `يوجد ${unbalancedJournals.length} قيد غير متوازن` : 'جميع القيود متوازنة'
            });
            // 3. Check retained earnings account exists
            const [retainedEarnings] = yield conn.query(`SELECT id FROM accounts WHERE (name LIKE '%أرباح محتجزة%' OR name LIKE '%retained%' OR name LIKE '%أرباح مرحلة%') LIMIT 1`);
            checks.push({
                label: 'حساب الأرباح المحتجزة موجود',
                passed: retainedEarnings.length > 0,
                detail: retainedEarnings.length > 0 ? 'حساب الأرباح المحتجزة موجود' : 'لم يتم العثور على حساب أرباح محتجزة — سيتم استخدام حساب حقوق الملكية'
            });
            // 4. Check year is OPEN
            checks.push({
                label: 'السنة المالية مفتوحة',
                passed: year.status === 'OPEN',
                detail: year.status === 'OPEN' ? 'السنة مفتوحة وجاهزة للإقفال' : 'السنة مقفلة بالفعل'
            });
            // 5. Check that at least 1 transaction exists
            const [txCount] = yield conn.query('SELECT (SELECT COUNT(*) FROM invoices WHERE date >= ? AND date <= ?) + (SELECT COUNT(*) FROM journal_entries WHERE date >= ? AND date <= ?) as total', [year.start_date, year.end_date, year.start_date, year.end_date]);
            checks.push({
                label: 'توجد معاملات في هذه السنة',
                passed: (((_b = txCount[0]) === null || _b === void 0 ? void 0 : _b.total) || 0) > 0,
                detail: `إجمالي المعاملات: ${((_c = txCount[0]) === null || _c === void 0 ? void 0 : _c.total) || 0}`
            });
            const allPassed = checks.every(c => c.passed);
            res.json({ checks, allPassed });
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error getting closing checklist');
    }
});
exports.getClosingChecklist = getClosingChecklist;
/**
 * GET /api/fiscal-years/comparison — Year-over-year comparison
 */
const getComparison = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        try {
            const [years] = yield conn.query('SELECT * FROM fiscal_years ORDER BY start_date ASC');
            const comparison = yield Promise.all(years.map((year) => __awaiter(void 0, void 0, void 0, function* () {
                var _a, _b, _c, _d;
                const [revenueResult] = yield conn.query(`
                    SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) as total
                    FROM journal_lines jl
                    INNER JOIN journal_entries je ON jl.journalId = je.id
                    INNER JOIN accounts a ON jl.accountId = a.id
                    WHERE a.type IN ('REVENUE', 'INCOME')
                      AND je.date >= ? AND je.date <= ?
                `, [year.start_date, year.end_date]);
                const [expenseResult] = yield conn.query(`
                    SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) as total
                    FROM journal_lines jl
                    INNER JOIN journal_entries je ON jl.journalId = je.id
                    INNER JOIN accounts a ON jl.accountId = a.id
                    WHERE a.type IN ('EXPENSE', 'EXPENSES')
                      AND je.date >= ? AND je.date <= ?
                `, [year.start_date, year.end_date]);
                const [invoiceCount] = yield conn.query('SELECT COUNT(*) as cnt FROM invoices WHERE date >= ? AND date <= ?', [year.start_date, year.end_date]);
                const [journalCount] = yield conn.query('SELECT COUNT(*) as cnt FROM journal_entries WHERE date >= ? AND date <= ?', [year.start_date, year.end_date]);
                const totalRevenue = Number((_a = revenueResult[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
                const totalExpenses = Number((_b = expenseResult[0]) === null || _b === void 0 ? void 0 : _b.total) || 0;
                return {
                    id: year.id,
                    name: year.name,
                    status: year.status,
                    startDate: year.start_date,
                    endDate: year.end_date,
                    totalRevenue,
                    totalExpenses,
                    netIncome: totalRevenue - totalExpenses,
                    invoiceCount: ((_c = invoiceCount[0]) === null || _c === void 0 ? void 0 : _c.cnt) || 0,
                    journalCount: ((_d = journalCount[0]) === null || _d === void 0 ? void 0 : _d.cnt) || 0
                };
            })));
            res.json({ comparison });
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error getting fiscal year comparison');
    }
});
exports.getComparison = getComparison;
/**
 * GET /api/fiscal-years/:id/periods — Get periods for a fiscal year
 */
const getPeriodsForYear = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [periods] = yield db_1.pool.query('SELECT * FROM fiscal_year_periods WHERE fiscal_year_id = ? ORDER BY period_number ASC', [id]);
        res.json({ periods });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error getting fiscal year periods');
    }
});
exports.getPeriodsForYear = getPeriodsForYear;
/**
 * POST /api/fiscal-years/:id/periods/generate — Auto-generate periods
 * Query param: type=monthly|quarterly (default monthly)
 */
const generatePeriodsForYear = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const periodType = req.query.type || 'monthly';
        const [years] = yield db_1.pool.query('SELECT * FROM fiscal_years WHERE id = ?', [id]);
        if (years.length === 0)
            return res.status(404).json({ error: 'Fiscal year not found' });
        const year = years[0];
        // Delete existing periods
        yield db_1.pool.query('DELETE FROM fiscal_year_periods WHERE fiscal_year_id = ?', [id]);
        const start = new Date(year.start_date);
        const end = new Date(year.end_date);
        const periods = [];
        let periodNum = 1;
        if (periodType === 'quarterly') {
            // Generate 4 quarters
            const quarterNames = ['الربع الأول', 'الربع الثاني', 'الربع الثالث', 'الربع الرابع'];
            let qStart = new Date(start);
            for (let q = 0; q < 4 && qStart <= end; q++) {
                const qEnd = new Date(qStart);
                qEnd.setMonth(qEnd.getMonth() + 3);
                qEnd.setDate(qEnd.getDate() - 1);
                const actualEnd = qEnd > end ? end : qEnd;
                const pid = (0, crypto_1.randomUUID)();
                yield db_1.pool.query(`INSERT INTO fiscal_year_periods (id, fiscal_year_id, name, period_number, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, 'OPEN')`, [pid, id, quarterNames[q], periodNum, qStart.toISOString().slice(0, 10), actualEnd.toISOString().slice(0, 10)]);
                periods.push({ id: pid, name: quarterNames[q], period_number: periodNum, start_date: qStart.toISOString().slice(0, 10), end_date: actualEnd.toISOString().slice(0, 10), status: 'OPEN' });
                periodNum++;
                qStart = new Date(actualEnd);
                qStart.setDate(qStart.getDate() + 1);
            }
        }
        else {
            // Generate monthly periods
            const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
            let mStart = new Date(start);
            while (mStart <= end) {
                const mEnd = new Date(mStart);
                mEnd.setMonth(mEnd.getMonth() + 1);
                mEnd.setDate(mEnd.getDate() - 1);
                const actualEnd = mEnd > end ? end : mEnd;
                const pid = (0, crypto_1.randomUUID)();
                const monthName = monthNames[mStart.getMonth()];
                yield db_1.pool.query(`INSERT INTO fiscal_year_periods (id, fiscal_year_id, name, period_number, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, 'OPEN')`, [pid, id, monthName, periodNum, mStart.toISOString().slice(0, 10), actualEnd.toISOString().slice(0, 10)]);
                periods.push({ id: pid, name: monthName, period_number: periodNum, start_date: mStart.toISOString().slice(0, 10), end_date: actualEnd.toISOString().slice(0, 10), status: 'OPEN' });
                periodNum++;
                mStart = new Date(actualEnd);
                mStart.setDate(mStart.getDate() + 1);
            }
        }
        res.json({ message: `تم إنشاء ${periods.length} فترة مالية`, periods });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error generating fiscal year periods');
    }
});
exports.generatePeriodsForYear = generatePeriodsForYear;
/**
 * POST /api/fiscal-years/periods/:periodId/toggle-lock — Lock or unlock a period
 */
const togglePeriodLock = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { periodId } = req.params;
        const authReq = req;
        const user = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.username) || 'System';
        const [periods] = yield db_1.pool.query('SELECT * FROM fiscal_year_periods WHERE id = ?', [periodId]);
        if (periods.length === 0)
            return res.status(404).json({ error: 'Period not found' });
        const period = periods[0];
        const newStatus = period.status === 'LOCKED' ? 'OPEN' : 'LOCKED';
        yield db_1.pool.query(`UPDATE fiscal_year_periods SET status = ?, locked_by = ?, locked_at = NOW() WHERE id = ?`, [newStatus, newStatus === 'LOCKED' ? user : null, periodId]);
        try {
            yield (0, auditController_1.logAction)(user, 'FISCAL_YEAR', newStatus === 'LOCKED' ? 'LOCK_PERIOD' : 'UNLOCK_PERIOD', `${newStatus === 'LOCKED' ? 'قفل' : 'فتح'} فترة: ${period.name}`, JSON.stringify({ periodId, name: period.name }));
        }
        catch (_e) { }
        res.json({ message: `تم ${newStatus === 'LOCKED' ? 'قفل' : 'فتح'} الفترة: ${period.name}`, status: newStatus });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Error toggling period lock');
    }
});
exports.togglePeriodLock = togglePeriodLock;
