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
exports.getProfitAnalysis = exports.getMonthlyProfit = exports.getAccountBalances = exports.getAccountsLedger = exports.getTreasuryOpeningBalance = exports.recalculateAccountBalances = exports.deleteAccount = exports.updateAccount = exports.createAccount = exports.getAccounts = void 0;
const db_1 = require("../db");
const branchFilter_1 = require("../utils/branchFilter");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
const getAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query('SELECT * FROM accounts');
        conn.release();
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'accounts');
    }
});
exports.getAccounts = getAccounts;
const VALID_ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
const createAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { id, code, name, type, subType, openingBalance, balance, currencyCode } = req.body;
        if (type && !VALID_ACCOUNT_TYPES.includes(type)) {
            yield conn.rollback();
            conn.release();
            return res.status(400).json({
                code: 'INVALID_ACCOUNT_TYPE',
                message: `نوع الحساب "${type}" غير صالح. القيم المقبولة: ${VALID_ACCOUNT_TYPES.join(', ')}`
            });
        }
        // Validate code uniqueness
        if (code) {
            const [existingCode] = yield conn.query('SELECT id FROM accounts WHERE code = ?', [code]);
            if (existingCode.length > 0) {
                yield conn.rollback();
                conn.release();
                return res.status(400).json({
                    code: 'DUPLICATE_CODE',
                    message: `رمز الحساب "${code}" مستخدم بالفعل لحساب آخر.`
                });
            }
        }
        // Coerce string inputs to numbers
        const parsedOpeningBalance = parseFloat(openingBalance) || 0;
        const parsedBalance = balance !== undefined ? parseFloat(balance) : parsedOpeningBalance;
        // Use provided ID or generate new one
        const accountId = id || (0, crypto_1.randomUUID)();
        yield conn.query('INSERT INTO accounts (id, code, name, type, subType, openingBalance, balance, currencyCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [accountId, code, name, type, subType || null, parsedOpeningBalance, parsedBalance, currencyCode || 'EGP']);
        yield conn.commit();
        // Log audit trail using authenticated user session
        const authReq = req;
        const user = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.username) || 'System';
        yield (0, auditController_1.logAction)(user, 'ACCOUNT', 'CREATE', `إنشاء حساب - ${name}`, `الرمز: ${code}, النوع: ${type}, التصنيف: ${subType || 'بدون'}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'accounts', updatedBy: user });
        res.status(201).json({ id: accountId, code, name, type, subType: subType || null, openingBalance: parsedOpeningBalance, balance: parsedBalance, currencyCode: currencyCode || 'EGP' });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error creating account:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        conn.release();
    }
});
exports.createAccount = createAccount;
const updateAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { id } = req.params;
        const { code, name, type, subType, currencyCode } = req.body;
        if (type && !VALID_ACCOUNT_TYPES.includes(type)) {
            yield conn.rollback();
            conn.release();
            return res.status(400).json({
                code: 'INVALID_ACCOUNT_TYPE',
                message: `نوع الحساب "${type}" غير صالح. القيم المقبولة: ${VALID_ACCOUNT_TYPES.join(', ')}`
            });
        }
        // Validate code uniqueness for other accounts
        if (code) {
            const [existingCode] = yield conn.query('SELECT id FROM accounts WHERE code = ? AND id != ?', [code, id]);
            if (existingCode.length > 0) {
                yield conn.rollback();
                conn.release();
                return res.status(400).json({
                    code: 'DUPLICATE_CODE',
                    message: `رمز الحساب "${code}" مستخدم بالفعل لحساب آخر.`
                });
            }
        }
        yield conn.query('UPDATE accounts SET code = ?, name = ?, type = ?, subType = ?, currencyCode = ? WHERE id = ?', [code, name, type, subType || null, currencyCode, id]);
        yield conn.commit();
        // Log audit trail using authenticated user session
        const authReq = req;
        const user = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.username) || 'System';
        yield (0, auditController_1.logAction)(user, 'ACCOUNT', 'UPDATE', `تحديث حساب - ${name}`, `الرمز: ${code}, النوع: ${type}, التصنيف: ${subType || 'بدون'}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'accounts', updatedBy: user });
        res.json(Object.assign({ id }, req.body));
    }
    catch (error) {
        yield conn.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'updating account');
    }
    finally {
        conn.release();
    }
});
exports.updateAccount = updateAccount;
const deleteAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { id } = req.params;
        // Get account info
        const [accounts] = yield conn.query('SELECT name, code FROM accounts WHERE id = ?', [id]);
        if (!accounts[0]) {
            conn.release();
            return res.status(404).json({ code: 'NOT_FOUND', message: 'الحساب غير موجود' });
        }
        const accountName = accounts[0].name;
        const accountCode = accounts[0].code;
        // CHECK FOR DEPENDENCIES — prevent orphaned data
        const dependencies = [];
        // Check journal lines
        const [journalCount] = yield conn.query('SELECT COUNT(*) as cnt FROM journal_lines WHERE accountId = ?', [id]);
        if (((_a = journalCount[0]) === null || _a === void 0 ? void 0 : _a.cnt) > 0) {
            dependencies.push(`${journalCount[0].cnt} قيد محاسبي مرتبط`);
        }
        // Helper to check dependencies without swallowing actual DB errors
        const checkTableDeps = (queryStr, params) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            try {
                const [res] = yield conn.query(queryStr, params);
                return ((_a = res[0]) === null || _a === void 0 ? void 0 : _a.cnt) > 0;
            }
            catch (err) {
                if (err.code === 'ER_NO_SUCH_TABLE') {
                    return false;
                }
                throw err;
            }
        });
        // Check banks linked to this account
        try {
            const [banks] = yield conn.query('SELECT id, name FROM banks WHERE accountId = ?', [id]);
            if (banks.length > 0) {
                const bankId = banks[0].id;
                let bankHasDeps = false;
                // Check if the bank itself has dependencies
                if (yield checkTableDeps('SELECT COUNT(*) as cnt FROM invoices WHERE bankAccountId = ?', [bankId])) {
                    bankHasDeps = true;
                }
                if (yield checkTableDeps('SELECT COUNT(*) as cnt FROM cheques WHERE bankId = ?', [bankId])) {
                    bankHasDeps = true;
                }
                if (yield checkTableDeps('SELECT COUNT(*) as cnt FROM bank_transactions WHERE bankId = ?', [bankId])) {
                    bankHasDeps = true;
                }
                if (bankHasDeps) {
                    dependencies.push(`يوجد حساب بنكي/خزينة مرتبط به حركات (${banks[0].name})`);
                }
                else {
                    // Safe to cascade delete the bank since it has no transactions
                    yield conn.query('DELETE FROM banks WHERE id = ?', [bankId]);
                }
            }
        }
        catch (err) {
            if (err.code !== 'ER_NO_SUCH_TABLE') {
                throw err;
            }
        }
        if (dependencies.length > 0) {
            yield conn.rollback();
            conn.release();
            return res.status(400).json({
                code: 'HAS_DEPENDENCIES',
                message: `لا يمكن حذف الحساب "${accountCode} - ${accountName}" لوجود حركات مرتبطة:\n• ${dependencies.join('\n• ')}\n\nيرجى حذف أو نقل الحركات أولاً.`
            });
        }
        yield conn.query('DELETE FROM accounts WHERE id = ?', [id]);
        yield conn.commit();
        // Log audit trail using authenticated user session
        const authReq = req;
        const user = ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.name) || ((_c = authReq.user) === null || _c === void 0 ? void 0 : _c.username) || 'System';
        yield (0, auditController_1.logAction)(user, 'ACCOUNT', 'DELETE', `حذف حساب - ${accountName}`, `تم حذف الحساب | رقم المرجع: ${id}`);
        // Broadcast real-time deletion
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'accounts', entityId: id, deletedBy: user });
        res.json({ message: 'Account deleted' });
    }
    catch (error) {
        yield conn.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleting account');
    }
    finally {
        conn.release();
    }
});
exports.deleteAccount = deleteAccount;
/**
 * Recalculate all account balances from journal entries
 * This is the PERMANENT SOLUTION for treasury balance discrepancies
 *
 * Formula: New Balance = Opening Balance + SUM(debits) - SUM(credits) for debit-normal accounts
 *         New Balance = Opening Balance + SUM(credits) - SUM(debits) for credit-normal accounts
 */
const recalculateAccountBalances = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const conn = yield (0, db_1.getConnection)();
    try {
        const authReq = req;
        const userObj = authReq.user;
        const roleUpper = ((userObj === null || userObj === void 0 ? void 0 : userObj.role) || '').trim().toUpperCase();
        const allowedRoles = ['MASTER_ADMIN', 'ADMIN', 'GENERAL_MANAGER', 'MANAGER', 'ACCOUNTANT', 'المدير', 'المدير العام', 'مسئول النظام'];
        const isAllowed = userObj && (allowedRoles.includes(roleUpper) ||
            ((_a = userObj.permissions) === null || _a === void 0 ? void 0 : _a.includes('all')) ||
            ((_b = userObj.permissions) === null || _b === void 0 ? void 0 : _b.includes('system.settings')) ||
            ((_c = userObj.permissions) === null || _c === void 0 ? void 0 : _c.includes('accounting.manage')));
        if (!isAllowed) {
            conn.release();
            return res.status(403).json({
                code: 'FORBIDDEN',
                message: 'غير مصرح لك بإجراء هذه العملية. تتطلب صلاحية مدير أو محاسب.'
            });
        }
        yield conn.beginTransaction();
        // Get all accounts with their current and opening balances (including subType)
        const [accounts] = yield conn.query('SELECT id, code, name, type, subType, openingBalance, balance FROM accounts');
        // Get all journal line movements grouped by account
        const [movements] = yield conn.query(`
            SELECT 
                accountId,
                SUM(debit) as totalDebit,
                SUM(credit) as totalCredit
            FROM journal_lines
            GROUP BY accountId
        `);
        // Create a lookup map for movements
        const movementMap = new Map();
        for (const mov of movements) {
            movementMap.set(mov.accountId, {
                totalDebit: parseFloat(mov.totalDebit) || 0,
                totalCredit: parseFloat(mov.totalCredit) || 0
            });
        }
        // Determine debit-normal vs credit-normal account types
        // Debit-normal: ASSET, EXPENSE (balance increases with debit)
        // Credit-normal: LIABILITY, EQUITY, REVENUE (balance increases with credit)
        const debitNormalTypes = ['ASSET', 'EXPENSE'];
        let updatedCount = 0;
        const changes = [];
        for (const account of accounts) {
            const movement = movementMap.get(account.id);
            const totalDebit = (movement === null || movement === void 0 ? void 0 : movement.totalDebit) || 0;
            const totalCredit = (movement === null || movement === void 0 ? void 0 : movement.totalCredit) || 0;
            const openingBalance = parseFloat(account.openingBalance) || 0;
            let newBalance;
            let isDebitNormal = debitNormalTypes.includes(account.type);
            // Contra-asset accounts like accumulated depreciation are credit-normal
            if (account.subType === 'ACCUMULATED_DEPRECIATION') {
                isDebitNormal = false;
            }
            if (isDebitNormal) {
                // For ASSET/EXPENSE: Balance = Opening + Debits - Credits
                newBalance = openingBalance + totalDebit - totalCredit;
            }
            else {
                // For LIABILITY/EQUITY/REVENUE/ACCUMULATED_DEPRECIATION: Balance = Opening + Credits - Debits
                newBalance = openingBalance + totalCredit - totalDebit;
            }
            // Round to 2 decimal places
            newBalance = Math.round(newBalance * 100) / 100;
            // Only update if different
            const currentBalance = parseFloat(account.balance) || 0;
            if (Math.abs(currentBalance - newBalance) > 0.001) {
                yield conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, account.id]);
                updatedCount++;
                changes.push({
                    accountName: account.name,
                    oldBalance: currentBalance,
                    newBalance: newBalance
                });
            }
        }
        yield conn.commit();
        // Log audit trail
        const user = (userObj === null || userObj === void 0 ? void 0 : userObj.name) || (userObj === null || userObj === void 0 ? void 0 : userObj.username) || 'System';
        if (updatedCount > 0) {
            yield (0, auditController_1.logAction)(user, 'ACCOUNT', 'RECALCULATE', `إعادة احتساب أرصدة الحسابات`, `تم تحديث ${updatedCount} حساب`);
        }
        // Broadcast real-time update to refresh all clients
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'accounts', updatedBy: user });
        res.json({
            message: `تم إعادة احتساب أرصدة ${updatedCount} حساب بنجاح`,
            updatedCount,
            changes: changes.slice(0, 20) // Only show first 20 changes
        });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error recalculating account balances:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'recalculating account balances');
    }
    finally {
        conn.release();
    }
});
exports.recalculateAccountBalances = recalculateAccountBalances;
/**
 * Get treasury summary calculated SERVER-SIDE from ALL journal entries
 * Returns: openingBalance, totalIn, totalOut for the given date range
 * This solves the problem where the client only loads 5000 journals but there are 60K+
 *
 * GET /api/accounts/treasury-opening-balance?date=2026-03-01&endDate=2026-04-01&accountFilter=CASH|BANK|ALL
 */
const getTreasuryOpeningBalance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    let conn;
    try {
        conn = yield (0, db_1.getConnection)();
        const { date, endDate: rawEndDate, accountFilter = 'ALL', search, specificAccountId, createdBy, transactionFilter, categoryId, costCenterId, excludeSearch } = req.query;
        // Normalize endDate to include time component (23:59:59) to match journal list endpoint behavior
        // Without this, MySQL treats '2026-04-14' as '2026-04-14 00:00:00' and misses entries later in the day
        const endDate = rawEndDate
            ? (typeof rawEndDate === 'string' && !rawEndDate.includes('T') && !rawEndDate.includes(' ')
                ? rawEndDate + ' 23:59:59'
                : rawEndDate)
            : undefined;
        if (!date) {
            return res.status(400).json({ error: 'date parameter is required (YYYY-MM-DD)' });
        }
        // Determine which account codes to include symmetrically
        let codeFilter;
        const isCashExpr = `(a.code LIKE '101%' OR a.id IN (SELECT accountId FROM banks WHERE bankType = 'TREASURY') OR (a.type = 'ASSET' AND (a.name LIKE '%صندوق%' OR a.name LIKE '%خزينة%' OR a.name LIKE '%نقدية%') AND a.id NOT IN (SELECT accountId FROM banks WHERE bankType = 'BANK')))`;
        if (accountFilter === 'CASH') {
            codeFilter = isCashExpr;
        }
        else if (accountFilter === 'BANK') {
            codeFilter = `(a.code LIKE '102%' OR a.type = 'BANK' OR (a.type = 'ASSET' AND a.name LIKE '%بنك%') OR a.id IN (SELECT accountId FROM banks WHERE bankType = 'BANK')) AND NOT ${isCashExpr}`;
        }
        else if (accountFilter === 'CHEQUES') {
            codeFilter = "(a.code LIKE '106%' OR a.code LIKE '107%')";
        }
        else {
            // ALL
            codeFilter = `(${isCashExpr} OR a.code LIKE '102%' OR a.code LIKE '106%' OR a.code LIKE '107%' OR a.type = 'BANK' OR (a.type = 'ASSET' AND a.name LIKE '%بنك%') OR a.id IN (SELECT accountId FROM banks WHERE bankType = 'BANK'))`;
        }
        // Resolve branch vs cost center scope
        const { branchId: userBranchId, isPrivileged } = (0, branchFilter_1.resolveBranchScope)(req);
        let effectiveBranchId = null;
        let isBranchSelection = false;
        if (costCenterId && costCenterId !== 'ALL') {
            const [branchRows] = yield conn.query('SELECT 1 FROM branches WHERE id = ?', [costCenterId]);
            if (branchRows && branchRows.length > 0) {
                isBranchSelection = true;
            }
        }
        if (!isPrivileged && userBranchId) {
            effectiveBranchId = userBranchId;
        }
        else if (isBranchSelection) {
            effectiveBranchId = costCenterId;
        }
        // Pre-filter account IDs for faster queries (avoids repeated LIKE on joined tables)
        let acctQuery = `SELECT a.id, a.code, a.name, COALESCE(a.openingBalance, 0) as openingBalance FROM accounts a WHERE ${codeFilter}`;
        let acctParams = [];
        if (effectiveBranchId) {
            acctQuery = `SELECT a.id, a.code, a.name, COALESCE(a.openingBalance, 0) as openingBalance 
                         FROM accounts a 
                         JOIN banks b ON b.accountId = a.id
                         WHERE ${codeFilter} AND b.branchId = ?`;
            acctParams.push(effectiveBranchId);
        }
        const [acctRows] = yield conn.query(acctQuery, acctParams);
        const accountIds = acctRows.map((r) => r.id);
        if (accountIds.length === 0) {
            return res.json({ openingBalance: 0, totalIn: 0, totalOut: 0, accountOpenings: 0, accountDetails: [] });
        }
        const placeholders = accountIds.map(() => '?').join(',');
        const escapedAccountIds = accountIds.map(id => `'${id}'`).join(',');
        // Build per-account map for detailed breakdown
        const acctMap = new Map();
        for (const r of acctRows) {
            acctMap.set(r.id, {
                id: r.id,
                code: r.code,
                name: r.name,
                ob: parseFloat(r.openingBalance) || 0,
                preDebit: 0,
                preCredit: 0,
                periodIn: 0,
                periodOut: 0,
                periodExpenses: 0,
            });
        }
        // Additional Filters for precise matching
        let additionalFilterSQL = "";
        const additionalParams = [];
        if (search) {
            // PERF: Use simple LIKE instead of Arabic normalization (7 nested REPLACE per row).
            // Journal descriptions are stored in consistent Arabic, normalization is unnecessary.
            const searchStr = typeof search === 'string' ? search : String(search);
            if (searchStr.includes('|')) {
                // Support pipe-delimited OR search matching journal controller pattern
                const terms = searchStr.split('|').map(t => t.trim()).filter(Boolean);
                const orParts = terms.map(() => `je.description LIKE ?`);
                additionalFilterSQL += ` AND (${orParts.join(' OR ')})`;
                terms.forEach(term => {
                    additionalParams.push(`%${term}%`);
                });
            }
            else {
                // Support space-separated AND search (e.g. "سلف محمود طلعت" → %سلف% AND %محمود% AND %طلعت%)
                // This matches journalController behavior. Without splitting, a single LIKE '%سلف محمود طلعت%'
                // would never match descriptions like 'مصروف - سلف (محمود طلعت)' because the words aren't adjacent.
                const terms = searchStr.split(' ').map(t => t.trim()).filter(Boolean);
                for (const term of terms) {
                    additionalFilterSQL += ` AND je.description LIKE ?`;
                    additionalParams.push(`%${term}%`);
                }
            }
        }
        if (specificAccountId) {
            additionalFilterSQL += " AND EXISTS (SELECT 1 FROM journal_lines jlf WHERE jlf.journalId = je.id AND jlf.accountId = ?)";
            additionalParams.push(specificAccountId);
        }
        if (categoryId) {
            const [catRows] = yield conn.query('SELECT name FROM cash_categories WHERE id = ?', [categoryId]);
            if (catRows.length > 0 && catRows[0].name) {
                additionalFilterSQL += " AND je.description LIKE ?";
                additionalParams.push(`%${catRows[0].name}%`);
            }
            else {
                // Fallback: subcategory IDs aren't stored as top-level cash_categories.
                // Use the raw ID as a description search term (matches journalController behavior)
                additionalFilterSQL += " AND je.description LIKE ?";
                additionalParams.push(`%${categoryId}%`);
            }
        }
        if (createdBy) {
            additionalFilterSQL += " AND je.createdBy = ?";
            additionalParams.push(createdBy);
        }
        // Apply comprehensive branch filter to period queries
        if (effectiveBranchId) {
            additionalFilterSQL += ` AND (
                je.branchId = ?
                OR EXISTS (SELECT 1 FROM journal_lines jlf WHERE jlf.journalId = je.id AND jlf.costCenterId = ?)
                OR EXISTS (SELECT 1 FROM journal_lines jlf JOIN banks bk ON jlf.accountId = bk.accountId WHERE jlf.journalId = je.id AND bk.branchId = ?)
                OR EXISTS (SELECT 1 FROM invoices inv WHERE inv.id = je.referenceId AND (inv.branchId = ? OR inv.warehouseId IN (SELECT id FROM warehouses WHERE branchId = ?)))
            )`;
            additionalParams.push(effectiveBranchId, effectiveBranchId, effectiveBranchId, effectiveBranchId, effectiveBranchId);
        }
        // If the costCenterId is a cost center (not a branch), apply the cost center filter
        if (costCenterId && costCenterId !== 'ALL' && !isBranchSelection) {
            additionalFilterSQL += " AND EXISTS (SELECT 1 FROM journal_lines jlf WHERE jlf.journalId = je.id AND jlf.costCenterId = ?)";
            additionalParams.push(costCenterId);
        }
        if (transactionFilter) {
            if (transactionFilter === 'SALES') {
                additionalFilterSQL += " AND (je.description LIKE '%مبيعات%' OR je.description LIKE '%sale%' OR je.description LIKE '%عميل%')";
            }
            else if (transactionFilter === 'PURCHASES') {
                additionalFilterSQL += " AND (je.description LIKE '%مشتريات%' OR je.description LIKE '%purchase%' OR je.description LIKE '%مورد%')";
            }
            else if (transactionFilter === 'EXPENSES') {
                // Match description-based expenses AND entries touching EXPENSE-type accounts,
                // BUT exclude structural documents that touch EXPENSE accounts (e.g., COGS on sales invoices).
                // COGS (501) is type=EXPENSE, so every sales invoice has an EXPENSE-type line — we must exclude these.
                additionalFilterSQL += ` AND (je.description LIKE '%مصروف%' OR je.description LIKE '%expense%' OR (je.description NOT LIKE 'صادر%' AND je.description NOT LIKE '%مرتجع%' AND je.description NOT LIKE '%فاتورة بيع%' AND je.description NOT LIKE '%فاتورة مبيعات%' AND je.description NOT LIKE '%فاتورة شراء%' AND je.description NOT LIKE '%فاتورة مشتريات%' AND je.description NOT LIKE '%سند قبض%' AND je.description NOT LIKE '%سند صرف%' AND je.description NOT LIKE '%دفعة%' AND je.description NOT LIKE '%فاتورة نقدي%' AND EXISTS (SELECT 1 FROM journal_lines jlf JOIN accounts a ON jlf.accountId = a.id WHERE jlf.journalId = je.id AND a.type = 'EXPENSE')))`;
            }
            else if (transactionFilter === 'INCOME') {
                // وارد (مقبوضات) — cash inflow: net cash impact > 0 (debit > credit)
                // Uses net impact instead of raw debit > 0 to handle negative values.
                // BUG FIX: Negative credits (credit=-200) have net impact = 0-(-200) = +200, which IS inflow.
                // EXCLUDE مصروف/سند صرف descriptions to prevent reversed expenses showing as income.
                // INCLUDE سند قبض by description to catch reversed receipts (عكسي) where cash net < 0.
                // Escaped Account IDs are inlined to avoid dynamic parameters mismatch.
                additionalFilterSQL += ` AND (
                    EXISTS (
                        SELECT 1 FROM journal_lines jlf 
                        WHERE jlf.journalId = je.id AND jlf.accountId IN (${escapedAccountIds}) 
                        GROUP BY jlf.journalId 
                        HAVING (COALESCE(SUM(jlf.debit),0) - COALESCE(SUM(jlf.credit),0)) > 0
                    )
                    OR je.description LIKE '%سند قبض%'
                    OR je.description LIKE '%متحصلات نقدية%'
                ) AND je.description NOT LIKE '%سند صرف%' AND je.description NOT LIKE '%مصروف%' AND je.description NOT LIKE '%expense%'`;
            }
            else if (transactionFilter === 'OUTCOME') {
                // صادر (دفعيات) — cash outflow EXCLUDING مصروفات
                // Uses net cash impact (debit - credit) < 0 to handle both:
                //   Normal outflow: cash credit=500 → net = 0-500 = -500 (outflow)
                //   Negative entries: cash credit=-200 → net = 0-(-200) = +200 (NOT outflow)
                // Also includes سند صرف by description regardless of direction.
                // EXCLUDES سند قبض — reversed receipts belong in INCOME, not OUTCOME.
                // Escaped Account IDs are inlined to avoid dynamic parameters mismatch.
                additionalFilterSQL += ` AND (
                    EXISTS (
                        SELECT 1 FROM journal_lines jlf
                        WHERE jlf.journalId = je.id AND jlf.accountId IN (${escapedAccountIds})
                        GROUP BY jlf.journalId
                        HAVING (COALESCE(SUM(jlf.debit),0) - COALESCE(SUM(jlf.credit),0)) < 0
                    )
                    OR je.description LIKE '%سند صرف%'
                ) AND je.description NOT LIKE '%مصروف%' AND je.description NOT LIKE '%expense%' AND je.description NOT LIKE '%سند قبض%' AND je.description NOT LIKE '%متحصلات نقدية%'`;
            }
        }
        // EXCLUDE search: pipe-separated terms to EXCLUDE from results.
        // Used by "غير مصنف" (UNSPECIFIED) filter to show only uncategorized entries.
        if (excludeSearch) {
            const excludeStr = typeof excludeSearch === 'string' ? excludeSearch : String(excludeSearch);
            const excludeTerms = excludeStr.split('|').map(t => t.trim()).filter(Boolean);
            for (const term of excludeTerms) {
                additionalFilterSQL += ` AND (je.description NOT LIKE ? AND (je.referenceId IS NULL OR je.referenceId NOT LIKE ?))`;
                additionalParams.push(`%${term}%`, `%${term}%`);
            }
        }
        // 1. Get sum of opening balances for matching accounts (only makes sense if no advanced filters)
        const accountOpenings = acctRows.reduce((sum, r) => sum + (parseFloat(r.openingBalance) || 0), 0);
        // 2. Get per-account journal movements BEFORE the specified date
        // CRITICAL FIX: Opening balance must ALWAYS be unfiltered — it represents the true
        // cash position at period start. Branch/costCenter filters are removed to maintain
        // visual and accounting period integrity.
        let movRows;
        try {
            const obQuery = `SELECT 
                    jl.accountId,
                    COALESCE(SUM(jl.debit), 0) as totalDebit,
                    COALESCE(SUM(jl.credit), 0) as totalCredit
                 FROM journal_lines jl
                 JOIN journal_entries je ON jl.journalId = je.id
                 WHERE jl.accountId IN (${placeholders})
                   AND je.date < ?
                 GROUP BY jl.accountId`;
            const obParams = [...accountIds, date];
            [movRows] = yield conn.query(obQuery, obParams);
        }
        catch (movErr) {
            // Fallback: If je.id alias fails (MariaDB/MySQL compat), use subquery instead
            if (movErr.code === 'ER_BAD_FIELD_ERROR' || ((_a = movErr.message) === null || _a === void 0 ? void 0 : _a.includes('Unknown column'))) {
                console.warn(`[getTreasuryOpeningBalance] ER_BAD_FIELD_ERROR on opening balance query — using fallback. Error: ${movErr.message}`);
                const fallbackObQuery = `SELECT 
                        jl.accountId,
                        COALESCE(SUM(jl.debit), 0) as totalDebit,
                        COALESCE(SUM(jl.credit), 0) as totalCredit
                     FROM journal_lines jl
                     WHERE jl.accountId IN (${placeholders})
                       AND jl.journalId IN (SELECT id FROM journal_entries WHERE date < ?)
                     GROUP BY jl.accountId`;
                const fallbackObParams = [...accountIds, date];
                [movRows] = yield conn.query(fallbackObQuery, fallbackObParams);
            }
            else {
                throw movErr;
            }
        }
        let totalDebitBefore = 0, totalCreditBefore = 0;
        for (const row of movRows) {
            const d = parseFloat(row.totalDebit) || 0;
            const c = parseFloat(row.totalCredit) || 0;
            totalDebitBefore += d;
            totalCreditBefore += c;
            const acc = acctMap.get(row.accountId);
            if (acc) {
                acc.preDebit = d;
                acc.preCredit = c;
            }
        }
        const openingBalance = accountOpenings + totalDebitBefore - totalCreditBefore;
        // 3. If endDate provided, compute period totals per account
        let totalIn = 0;
        let totalOut = 0;
        let expenseBreakdown = [];
        let flows = {
            operatingIn: 0,
            operatingOut: 0,
            investingIn: 0,
            investingOut: 0,
            financingIn: 0,
            financingOut: 0
        };
        let totalExpenses = 0;
        if (endDate) {
            try {
                // Get per-ENTRY net cash impact to correctly separate inflows from outflows.
                // Some entries use negative credits (e.g., expense refunds: credit=-250 instead of debit=250).
                // Summing raw debits/credits would conflate these, so we compute net per entry first.
                const [perEntryRows] = yield conn.query(`SELECT jl.accountId,
                        je.id as journalId,
                        COALESCE(SUM(jl.debit), 0) as d,
                        COALESCE(SUM(jl.credit), 0) as cr
                 FROM journal_lines jl
                 JOIN journal_entries je ON jl.journalId = je.id
                 WHERE jl.accountId IN (${placeholders})
                   AND je.date >= ? AND je.date <= ? ${additionalFilterSQL}
                 GROUP BY jl.accountId, je.id`, [...accountIds, date, endDate, ...additionalParams]);
                // Compute total expenses from journals that are expenses
                const [expenseEntryRows] = yield conn.query(`SELECT jl.accountId,
                        je.id as journalId,
                        COALESCE(SUM(jl.debit), 0) as d,
                        COALESCE(SUM(jl.credit), 0) as cr
                 FROM journal_lines jl
                 JOIN journal_entries je ON jl.journalId = je.id
                 WHERE jl.accountId IN (${placeholders})
                   AND je.date >= ? AND je.date <= ? ${additionalFilterSQL}
                   AND (je.description LIKE '%مصروف%' OR (je.description NOT LIKE 'صادر%' AND je.description NOT LIKE '%مرتجع%' AND je.description NOT LIKE '%فاتورة%' AND je.description NOT LIKE '%سند قبض%' AND je.description NOT LIKE '%سند صرف%' AND je.description NOT LIKE '%تحصيل%' AND je.description NOT LIKE '%ورقة دفع%' AND je.description NOT LIKE '%تحويل داخلي%' AND je.description NOT LIKE '%راتب%' AND EXISTS (SELECT 1 FROM journal_lines jlf JOIN accounts a ON jlf.accountId = a.id WHERE jlf.journalId = je.id AND a.type = 'EXPENSE')))
                 GROUP BY jl.accountId, je.id`, [...accountIds, date, endDate, ...additionalParams]);
                for (const row of expenseEntryRows) {
                    const d = parseFloat(row.d) || 0;
                    const cr = parseFloat(row.cr) || 0;
                    const net = d - cr; // positive = cash inflow, negative = cash outflow
                    if (net < 0) {
                        const amount = Math.abs(net);
                        totalExpenses += amount;
                        const acc = acctMap.get(row.accountId);
                        if (acc)
                            acc.periodExpenses += amount;
                    }
                }
                // Accumulate per-account NET-based sums for acctMap details
                // CRITICAL: Use net impact (debit - credit) per entry, NOT raw sums.
                // Payments with negative amounts reverse the journal: cash gets debited instead of credited.
                // Using raw debits/credits would misclassify these reversed entries (e.g., showing
                // a supplier payment as "inflow" instead of "outflow" in the per-account table).
                const acctSums = new Map();
                for (const row of perEntryRows) {
                    const d = parseFloat(row.d) || 0;
                    const cr = parseFloat(row.cr) || 0;
                    const net = d - cr; // positive = cash inflow, negative = cash outflow
                    if (net > 0) {
                        totalIn += net;
                    }
                    else {
                        totalOut += Math.abs(net);
                    }
                    if (!acctSums.has(row.accountId))
                        acctSums.set(row.accountId, { netIn: 0, netOut: 0 });
                    const s = acctSums.get(row.accountId);
                    if (net > 0) {
                        s.netIn += net;
                    }
                    else {
                        s.netOut += Math.abs(net);
                    }
                }
                for (const [accountId, sums] of acctSums) {
                    const acc = acctMap.get(accountId);
                    if (acc) {
                        acc.periodIn = sums.netIn;
                        acc.periodOut = sums.netOut;
                    }
                }
                // --- Counterpart Analysis for Flows & Expenses ---
                // Find all lines in the same journals that are NOT treasury accounts
                const [cpRows] = yield conn.query(`SELECT 
                     cp.accountId, a.code, a.type, a.name,
                     COALESCE(SUM(cp.debit), 0) as debit,
                     COALESCE(SUM(cp.credit), 0) as credit
                 FROM journal_lines cp
                 JOIN accounts a ON cp.accountId = a.id
                 JOIN journal_entries je ON cp.journalId = je.id
                 WHERE cp.accountId NOT IN (${placeholders})
                   AND EXISTS (
                       SELECT 1 FROM journal_lines cash_lines 
                       WHERE cash_lines.journalId = cp.journalId 
                         AND cash_lines.accountId IN (${placeholders})
                   )
                   AND je.date >= ? AND je.date <= ? ${additionalFilterSQL}
                 GROUP BY cp.accountId, a.code, a.type, a.name`, [...accountIds, ...accountIds, date, endDate, ...additionalParams]);
                const expMap = new Map();
                for (const row of cpRows) {
                    const code = row.code;
                    const type = row.type;
                    const name = row.name.toLowerCase();
                    const d = parseFloat(row.debit) || 0;
                    const c = parseFloat(row.credit) || 0;
                    // Cash Outflow matches counterpart Debit
                    const outflowAmount = d;
                    // Cash Inflow matches counterpart Credit
                    const inflowAmount = c;
                    if (type === 'REVENUE' || code.startsWith('401') || code.startsWith('402') || code.startsWith('403')) {
                        flows.operatingIn += inflowAmount;
                        flows.operatingOut += outflowAmount;
                    }
                    else if (type === 'EXPENSE' || code.startsWith('5')) {
                        flows.operatingIn += inflowAmount;
                        flows.operatingOut += outflowAmount;
                        if (outflowAmount > 0) {
                            if (!expMap.has(row.accountId))
                                expMap.set(row.accountId, { accountId: row.accountId, name: row.name, amount: 0 });
                            expMap.get(row.accountId).amount += outflowAmount;
                        }
                    }
                    else if (code.startsWith('104') || code.startsWith('201')) {
                        flows.operatingIn += inflowAmount;
                        flows.operatingOut += outflowAmount;
                    }
                    else if (code.startsWith('109') || code.startsWith('204') || name.includes('أصول')) {
                        flows.investingIn += inflowAmount;
                        flows.investingOut += outflowAmount;
                    }
                    else if (type === 'EQUITY' || code.startsWith('3') || code.startsWith('206') || name.includes('قرض')) {
                        flows.financingIn += inflowAmount;
                        flows.financingOut += outflowAmount;
                    }
                    else {
                        flows.operatingIn += inflowAmount;
                        flows.operatingOut += outflowAmount;
                    }
                }
                expenseBreakdown = Array.from(expMap.values()).sort((a, b) => b.amount - a.amount);
            }
            catch (periodErr) {
                // If je.id alias fails in period queries (MariaDB/MySQL compat), log and return safe defaults
                if (periodErr.code === 'ER_BAD_FIELD_ERROR' || ((_b = periodErr.message) === null || _b === void 0 ? void 0 : _b.includes('Unknown column'))) {
                    console.warn(`[getTreasuryOpeningBalance] ER_BAD_FIELD_ERROR in period queries — returning zero period totals. Error: ${periodErr.message}`);
                    // totalIn, totalOut, flows, totalExpenses already initialized to 0
                }
                else {
                    throw periodErr;
                }
            }
        }
        // Build per-account detail array
        const accountDetails = Array.from(acctMap.values()).map(a => {
            const periodOpening = a.ob + a.preDebit - a.preCredit;
            return {
                id: a.id,
                code: a.code,
                name: a.name,
                periodOpening: Math.round(periodOpening * 100) / 100,
                periodIn: Math.round(a.periodIn * 100) / 100,
                periodOut: Math.round(a.periodOut * 100) / 100,
                periodExpenses: Math.round(a.periodExpenses * 100) / 100,
                periodClosing: Math.round((periodOpening + a.periodIn - a.periodOut) * 100) / 100,
            };
        });
        // Connection released in finally block
        res.json({
            openingBalance: Math.round(openingBalance * 100) / 100,
            accountOpenings,
            totalIn: Math.round(totalIn * 100) / 100,
            totalOut: Math.round(totalOut * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            accountDetails,
            flows,
            expenseBreakdown,
            date,
            endDate: endDate || null,
            accountFilter
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getTreasuryOpeningBalance');
    }
    finally {
        if (conn)
            try {
                conn.release();
            }
            catch (_c) { }
    }
});
exports.getTreasuryOpeningBalance = getTreasuryOpeningBalance;
/**
 * Server-Side Endpoint for General Ledger and Bank Statement
 * GET /api/accounts/reports/ledger
 */
const getAccountsLedger = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        conn = yield (0, db_1.getConnection)();
        // Read from query
        let { accountIds, startDate, endDate } = req.query;
        if (!accountIds) {
            return res.status(400).json({ error: 'accountIds is required (comma separated)' });
        }
        const accountsList = accountIds.split(',').filter(Boolean);
        if (accountsList.length === 0) {
            return res.status(400).json({ error: 'Valid accountIds required' });
        }
        const [accounts] = yield conn.query(`SELECT id, openingBalance, currencyCode FROM accounts WHERE id IN (?)`, [accountsList]);
        let totalOpeningBalance = 0;
        let isForeign = false;
        const placeholders = accountsList.map(() => '?').join(',');
        for (const account of accounts) {
            totalOpeningBalance += parseFloat(account.openingBalance || 0);
            if (account.currencyCode && account.currencyCode !== 'EGP')
                isForeign = true;
        }
        const { branchId, isPrivileged } = (0, branchFilter_1.resolveBranchScope)(req);
        if (startDate) {
            let obQuery = `
                SELECT 
                    SUM(jl.debit) as debit,
                    SUM(jl.credit) as credit,
                    SUM(jl.foreignDebit) as fDebit,
                    SUM(jl.foreignCredit) as fCredit
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journalId = je.id
                WHERE jl.accountId IN (${placeholders}) AND je.date < ?
            `;
            const obParams = [...accountsList, startDate];
            if (branchId && !isPrivileged) {
                obQuery += " AND (je.branchId = ? OR je.branchId IS NULL)";
                obParams.push(branchId);
            }
            const [obRows] = yield conn.query(obQuery, obParams);
            if (obRows[0]) {
                const row = obRows[0];
                if (isForeign) {
                    const fD = parseFloat(row.fDebit) || 0;
                    const fC = parseFloat(row.fCredit) || 0;
                    if (fD > 0 || fC > 0) {
                        totalOpeningBalance += (fD - fC);
                    }
                    else {
                        totalOpeningBalance += ((parseFloat(row.debit) || 0) - (parseFloat(row.credit) || 0));
                    }
                }
                else {
                    totalOpeningBalance += ((parseFloat(row.debit) || 0) - (parseFloat(row.credit) || 0));
                }
            }
        }
        const dateFilter = [];
        const params = [...accountsList];
        if (startDate) {
            dateFilter.push("je.date >= ?");
            params.push(startDate);
        }
        if (endDate) {
            dateFilter.push("je.date <= ?");
            params.push(endDate.includes('T') ? endDate : endDate + ' 23:59:59');
        }
        if (branchId && !isPrivileged) {
            dateFilter.push("(je.branchId = ? OR je.branchId IS NULL)");
            params.push(branchId);
        }
        const dateWhere = dateFilter.length > 0 ? "AND " + dateFilter.join(" AND ") : "";
        // FAST QUERY: No LEFT JOIN on invoices — that OR condition caused full table scans
        const [lines] = yield conn.query(`
            SELECT 
                je.id as journalId,
                je.date,
                je.description,
                je.referenceId,
                je.createdBy,
                SUM(jl.debit) as debit,
                SUM(jl.credit) as credit,
                SUM(jl.foreignDebit) as foreignDebit,
                SUM(jl.foreignCredit) as foreignCredit,
                MAX(jl.currencyCode) as currencyCode,
                MAX(jl.exchangeRate) as exchangeRate
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journalId = je.id
            WHERE jl.accountId IN (${placeholders}) ${dateWhere}
            GROUP BY je.id, je.date, je.description, je.referenceId, je.createdBy
            ORDER BY je.date ASC
        `, params);
        // BATCH LOOKUP: Fetch document info (number, posShiftId, bankTransferReference) for referenceIds
        // This is much faster than LEFT JOIN with OR on every row
        const refIds = [...new Set(lines.map((l) => l.referenceId).filter(Boolean))];
        const refMap = new Map();
        const numMap = new Map();
        const shiftMap = new Map();
        if (refIds.length > 0) {
            // Batch in chunks of 500 to avoid query size limits
            const CHUNK = 500;
            for (let i = 0; i < refIds.length; i += CHUNK) {
                const chunk = refIds.slice(i, i + CHUNK);
                const ph = chunk.map(() => '?').join(',');
                const [invRows] = yield conn.query(`SELECT id, number, posShiftId, bankTransferReference FROM invoices 
                     WHERE id IN (${ph}) OR number IN (${ph})`, [...chunk, ...chunk]);
                for (const inv of invRows) {
                    if (inv.bankTransferReference) {
                        refMap.set(inv.id, inv.bankTransferReference);
                        if (inv.number)
                            refMap.set(inv.number, inv.bankTransferReference);
                    }
                    if (inv.number) {
                        numMap.set(inv.id, inv.number);
                    }
                    if (inv.posShiftId) {
                        shiftMap.set(inv.id, inv.posShiftId);
                        if (inv.number)
                            shiftMap.set(inv.number, inv.posShiftId);
                    }
                }
                // Query pos_expenses to map payouts/expenses to their shift ID
                const [posExpRows] = yield conn.query(`SELECT id, shiftId FROM pos_expenses WHERE id IN (${ph})`, [...chunk]);
                for (const exp of posExpRows) {
                    if (exp.shiftId) {
                        shiftMap.set(exp.id, exp.shiftId);
                    }
                }
                // Query pos_shifts to map shift-related entries directly to their shift ID
                const [shiftRows] = yield conn.query(`SELECT id FROM pos_shifts WHERE id IN (${ph})`, [...chunk]);
                for (const s of shiftRows) {
                    shiftMap.set(s.id, s.id);
                }
            }
        }
        // Enrich transactions with bankTransferReference, documentNumber, and posShiftId
        const unmatchedRefs = new Set();
        for (const line of lines) {
            line.bankTransferReference = refMap.get(line.referenceId) || null;
            line.documentNumber = numMap.get(line.referenceId) || line.referenceId || null;
            line.posShiftId = shiftMap.get(line.referenceId) || null;
            if (line.referenceId && !line.bankTransferReference && !numMap.has(line.referenceId)) {
                unmatchedRefs.add(line.referenceId);
            }
        }
        if (unmatchedRefs.size > 0) {
            console.warn(`[getAccountsLedger] Unmatched referenceIds for document mapping:`, Array.from(unmatchedRefs));
        }
        res.json({
            openingBalance: totalOpeningBalance,
            transactions: lines
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getAccountsLedger');
    }
    finally {
        if (conn)
            try {
                conn.release();
            }
            catch (_a) { }
    }
});
exports.getAccountsLedger = getAccountsLedger;
/**
 * Server-Side Endpoint for Trial Balance, Income Statement, Balance Sheet
 * GET /api/accounts/reports/balances
 */
const getAccountBalances = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const conn = yield (0, db_1.getConnection)();
        const { startDate, endDate } = req.query;
        // Fetch ALL accounts (include subType for schema-driven classification)
        // Graceful fallback: subType column may not exist on older databases
        let accounts;
        try {
            [accounts] = (yield conn.query(`SELECT id, code, name, type, subType, openingBalance, currencyCode FROM accounts`));
        }
        catch (colErr) {
            if (((_a = colErr.message) === null || _a === void 0 ? void 0 : _a.includes('Unknown column')) || colErr.code === 'ER_BAD_FIELD_ERROR') {
                [accounts] = (yield conn.query(`SELECT id, code, name, type, NULL as subType, openingBalance, currencyCode FROM accounts`));
            }
            else {
                throw colErr;
            }
        }
        // Compute balances BEFORE startDate (Opening)
        let obRows = [];
        if (startDate) {
            [obRows] = yield conn.query(`
                SELECT 
                    jl.accountId,
                    COALESCE(SUM(jl.debit), 0) as debit,
                    COALESCE(SUM(jl.credit), 0) as credit
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journalId = je.id
                WHERE je.date < ?
                GROUP BY jl.accountId
            `, [startDate]);
        }
        // Compute Period Balances
        const dateFilter = [];
        const params = [];
        if (startDate) {
            dateFilter.push("je.date >= ?");
            params.push(startDate);
        }
        if (endDate) {
            dateFilter.push("je.date <= ?");
            params.push(endDate.includes('T') ? endDate : endDate + ' 23:59:59');
        }
        let periodRows = [];
        if (dateFilter.length > 0) {
            [periodRows] = yield conn.query(`
                SELECT 
                    jl.accountId,
                    COALESCE(SUM(jl.debit), 0) as debit,
                    COALESCE(SUM(jl.credit), 0) as credit
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journalId = je.id
                WHERE ${dateFilter.join(" AND ")}
                GROUP BY jl.accountId
            `, params);
        }
        conn.release();
        const obMap = new Map();
        for (const row of obRows)
            obMap.set(row.accountId, row);
        const periodMap = new Map();
        for (const row of periodRows)
            periodMap.set(row.accountId, row);
        const result = accounts.map((acc) => {
            const obRow = obMap.get(acc.id);
            const periodRow = periodMap.get(acc.id);
            const baseOpening = parseFloat(acc.openingBalance) || 0;
            const opDebit = obRow ? parseFloat(obRow.debit) : 0;
            const opCredit = obRow ? parseFloat(obRow.credit) : 0;
            const debitNormalTypes = ['ASSET', 'EXPENSE'];
            let isDebitNormal = debitNormalTypes.includes(acc.type);
            if (acc.subType === 'ACCUMULATED_DEPRECIATION') {
                isDebitNormal = false;
            }
            const openingBalance = isDebitNormal
                ? baseOpening + opDebit - opCredit
                : baseOpening + opCredit - opDebit;
            return {
                id: acc.id,
                code: acc.code,
                name: acc.name,
                type: acc.type,
                subType: acc.subType || null,
                baseOpeningBalance: baseOpening,
                openingDebit: opDebit,
                openingCredit: opCredit,
                openingBalance: Math.round(openingBalance * 100) / 100,
                movementDebit: periodRow ? parseFloat(periodRow.debit) : 0,
                movementCredit: periodRow ? parseFloat(periodRow.credit) : 0
            };
        });
        res.json(result);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getAccountBalances');
    }
});
exports.getAccountBalances = getAccountBalances;
// ========================================================================
// Get Monthly Profit
// ========================================================================
const getMonthlyProfit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { year, branchId, month } = req.query;
        if (!year) {
            return res.status(400).json({ error: 'Year is required' });
        }
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { branchId: userBranchId, isPrivileged } = (0, branchFilter_1.resolveBranchScope)(authReq);
        let effectiveBranchId = null;
        if (!isPrivileged && userBranchId) {
            effectiveBranchId = userBranchId;
        }
        else if (branchId && branchId !== 'ALL' && branchId !== '') {
            effectiveBranchId = branchId;
        }
        let query = `
            SELECT 
                MONTH(j.date) as month,
                SUM(CASE WHEN a.type = 'REVENUE' THEN (jl.credit - jl.debit) ELSE 0 END) as revenue,
                SUM(CASE WHEN a.type = 'EXPENSE' THEN (jl.debit - jl.credit) ELSE 0 END) as expense
            FROM journal_entries j
            JOIN journal_lines jl ON j.id = jl.journalId
            JOIN accounts a ON jl.accountId = a.id
            WHERE YEAR(j.date) = ?
        `;
        const params = [Number(year)];
        if (month && month !== 'ALL') {
            query += ` AND MONTH(j.date) = ?`;
            params.push(Number(month));
        }
        if (effectiveBranchId) {
            query += ` AND j.branchId = ?`;
            params.push(effectiveBranchId);
        }
        query += `
            GROUP BY MONTH(j.date)
            ORDER BY MONTH(j.date) ASC
        `;
        const [rows] = yield conn.query(query, params);
        conn.release();
        // Fill all 12 months, even if there's no data for some.
        let monthsData = Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            revenue: 0,
            expense: 0,
            profit: 0
        }));
        for (const row of rows) {
            const monthIdx = Number(row.month) - 1;
            if (monthIdx >= 0 && monthIdx < 12) {
                const revenue = parseFloat(row.revenue) || 0;
                const expense = parseFloat(row.expense) || 0;
                monthsData[monthIdx] = {
                    month: monthIdx + 1,
                    revenue,
                    expense,
                    profit: revenue - expense
                };
            }
        }
        if (month && month !== 'ALL') {
            monthsData = monthsData.filter(m => m.month === Number(month));
        }
        res.json(monthsData);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getMonthlyProfit');
    }
});
exports.getMonthlyProfit = getMonthlyProfit;
// ========================================================================
// Get Profit Analysis 
// ========================================================================
const getProfitAnalysis = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }
        const conn = yield (0, db_1.getConnection)();
        // 1. Fetch Purchase Invoice Lines (For Discounts and Bonus)
        const [purchaseRows] = yield conn.query(`
            SELECT 
                i.id as invoiceId,
                i.partnerId as supplierId,
                p.name as supplierName,
                il.productId,
                il.productName,
                il.price,
                il.quantity,
                il.discount,
                il.bonusQty,
                i.globalDiscount,
                inv_sub.subtotal
            FROM invoices i
            JOIN invoice_lines il ON i.id = il.invoiceId
            LEFT JOIN partners p ON i.partnerId = p.id
            JOIN (
                SELECT invoiceId, SUM(price * quantity) as subtotal
                FROM invoice_lines
                GROUP BY invoiceId
            ) inv_sub ON i.id = inv_sub.invoiceId
            WHERE i.type = 'INVOICE_PURCHASE' AND i.status != 'VOID' 
              AND i.date >= ? AND i.date <= ?
        `, [startDate, endDate]);
        // 2. Fetch Sales Invoice Lines
        const [saleRows] = yield conn.query(`
            SELECT 
                i.id as invoiceId,
                i.partnerId as customerId,
                p.name as customerName,
                il.productId,
                il.productName,
                il.price,
                il.quantity,
                il.discount,
                il.cost
            FROM invoices i
            JOIN invoice_lines il ON i.id = il.invoiceId
            LEFT JOIN partners p ON i.partnerId = p.id
            WHERE i.type = 'INVOICE_SALE' AND i.status != 'VOID' 
              AND i.date >= ? AND i.date <= ?
        `, [startDate, endDate]);
        conn.release();
        // Calculate Data using the same memory-friendly grouping
        // --- 1. Purchases (Discounts & Bonus) ---
        let totalPurchases = 0;
        let totalDiscounts = 0;
        let totalBonusQty = 0;
        let totalBonusValue = 0;
        const bySupplierDisc = {};
        const byProductDisc = {};
        const bySupplierBonus = {};
        const productPurchaseDiscountMap = {};
        // To map unique invoices for invoiceCount
        const invoiceCountDisc = new Map();
        for (const row of purchaseRows) {
            const supplierId = row.supplierId;
            const supplierName = row.supplierName || 'غير معروف';
            const pid = row.productId;
            const lineGross = Number(row.price) * Number(row.quantity);
            const globalShare = Number(row.subtotal) > 0 ? (lineGross / Number(row.subtotal)) * Number(row.globalDiscount) : 0;
            const lineDiscounts = Number(row.discount) + globalShare;
            const bonusQty = Number(row.bonusQty) || 0;
            // Discount Analysis
            totalPurchases += lineGross;
            totalDiscounts += lineDiscounts;
            if (!bySupplierDisc[supplierId])
                bySupplierDisc[supplierId] = { id: supplierId, name: supplierName, purchases: 0, discounts: 0, invoiceCount: 0 };
            bySupplierDisc[supplierId].purchases += lineGross;
            bySupplierDisc[supplierId].discounts += lineDiscounts;
            // Keep track of unique invoices per supplier
            if (row.invoiceId) {
                if (!invoiceCountDisc.has(supplierId)) {
                    invoiceCountDisc.set(supplierId, new Set());
                }
                invoiceCountDisc.get(supplierId).add(row.invoiceId);
            }
            if (!byProductDisc[pid])
                byProductDisc[pid] = { id: pid, name: row.productName, purchases: 0, discounts: 0, qty: 0 };
            byProductDisc[pid].purchases += lineGross;
            byProductDisc[pid].discounts += lineDiscounts;
            byProductDisc[pid].qty += Number(row.quantity);
            if (!productPurchaseDiscountMap[pid])
                productPurchaseDiscountMap[pid] = { grossTotal: 0, discountTotal: 0 };
            productPurchaseDiscountMap[pid].grossTotal += lineGross;
            productPurchaseDiscountMap[pid].discountTotal += lineDiscounts;
            // Bonus Analysis
            if (bonusQty > 0) {
                const bonusValue = bonusQty * Number(row.price);
                totalBonusQty += bonusQty;
                totalBonusValue += bonusValue;
                if (!bySupplierBonus[supplierId])
                    bySupplierBonus[supplierId] = { id: supplierId, name: supplierName, bonusQty: 0, bonusValue: 0, items: [] };
                bySupplierBonus[supplierId].bonusQty += bonusQty;
                bySupplierBonus[supplierId].bonusValue += bonusValue;
                // Group items 
                const existingItem = bySupplierBonus[supplierId].items.find((i) => i.name === row.productName);
                if (existingItem) {
                    existingItem.qty += bonusQty;
                }
                else {
                    bySupplierBonus[supplierId].items.push({ name: row.productName, qty: bonusQty, price: Number(row.price) });
                }
            }
        }
        const discountSupplierList = Object.values(bySupplierDisc)
            .map((s) => {
            var _a;
            return (Object.assign(Object.assign({}, s), { invoiceCount: ((_a = invoiceCountDisc.get(s.id)) === null || _a === void 0 ? void 0 : _a.size) || 0, discountPct: s.purchases > 0 ? (s.discounts / s.purchases) * 100 : 0 }));
        })
            .sort((a, b) => b.discounts - a.discounts);
        const discountProductList = Object.values(byProductDisc)
            .map((p) => (Object.assign(Object.assign({}, p), { discountPct: p.purchases > 0 ? (p.discounts / p.purchases) * 100 : 0 })))
            .sort((a, b) => b.discounts - a.discounts)
            .slice(0, 20);
        const bonusSupplierList = Object.values(bySupplierBonus).sort((a, b) => b.bonusValue - a.bonusValue);
        // --- 2. Sales (Customer Extra Profit) ---
        let totalSales = 0;
        let totalExtraProfit = 0;
        let totalNetCost = 0;
        const byCustomer = {};
        const saleInvoiceCountMap = new Map();
        for (const row of saleRows) {
            const customerId = row.customerId;
            const customerName = row.customerName || 'غير معروف';
            const pid = row.productId;
            const qty = Number(row.quantity);
            const price = Number(row.price);
            const lineTotal = (price * qty) - Number(row.discount);
            const rawCost = Number(row.cost);
            const lineCost = rawCost * qty;
            const purchaseData = productPurchaseDiscountMap[pid];
            let netUnitCost = rawCost;
            if (purchaseData && purchaseData.grossTotal > 0) {
                const discountPct = purchaseData.discountTotal / purchaseData.grossTotal;
                netUnitCost = rawCost * (1 - discountPct);
            }
            else if (!purchaseData) {
                console.warn(`[getProfitAnalysis] Product ${pid} (${row.productName}) has no purchase data to determine discount-adjusted cost. Using raw cost: ${rawCost}`);
            }
            const lineNetCost = netUnitCost * qty;
            const lineProfit = lineTotal - lineCost;
            const netProfit = lineTotal - lineNetCost;
            totalSales += lineTotal;
            totalExtraProfit += lineProfit;
            totalNetCost += lineNetCost;
            if (!byCustomer[customerId])
                byCustomer[customerId] = { id: customerId, name: customerName, sales: 0, costTotal: 0, netCostTotal: 0, extraProfit: 0, netProfit: 0, invoiceCount: 0 };
            byCustomer[customerId].sales += lineTotal;
            byCustomer[customerId].costTotal += lineCost;
            byCustomer[customerId].netCostTotal += lineNetCost;
            byCustomer[customerId].extraProfit += lineProfit;
            byCustomer[customerId].netProfit += netProfit;
            // Keep track of unique invoices per customer
            if (row.invoiceId) {
                if (!saleInvoiceCountMap.has(customerId)) {
                    saleInvoiceCountMap.set(customerId, new Set());
                }
                saleInvoiceCountMap.get(customerId).add(row.invoiceId);
            }
        }
        const totalNetProfit = totalSales - totalNetCost;
        const customerList = Object.values(byCustomer)
            .map((c) => {
            var _a;
            return (Object.assign(Object.assign({}, c), { invoiceCount: ((_a = saleInvoiceCountMap.get(c.id)) === null || _a === void 0 ? void 0 : _a.size) || 0, profitPct: c.sales > 0 ? (c.netProfit / c.sales) * 100 : 0 }));
        })
            .sort((a, b) => b.netProfit - a.netProfit);
        res.json({
            discountAnalysis: {
                totalPurchases,
                totalDiscounts,
                avgDiscountPct: totalPurchases > 0 ? (totalDiscounts / totalPurchases) * 100 : 0,
                supplierList: discountSupplierList,
                productList: discountProductList
            },
            bonusAnalysis: {
                totalBonusQty,
                totalBonusValue,
                supplierList: bonusSupplierList
            },
            customerProfitAnalysis: {
                totalSales,
                totalExtraProfit,
                totalNetCost,
                totalNetProfit,
                avgProfitPct: totalSales > 0 ? (totalNetProfit / totalSales) * 100 : 0,
                customerList
            }
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getProfitAnalysis');
    }
});
exports.getProfitAnalysis = getProfitAnalysis;
