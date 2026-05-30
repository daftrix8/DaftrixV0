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
exports.cleanupOrphanedVouchers = exports.reverseJournalEntry = exports.deleteJournalEntry = exports.updateJournalEntry = exports.createJournalEntry = exports.getJournalEntries = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
const fiscalYearUtils_1 = require("../utils/fiscalYearUtils");
const policyEnforcement_1 = require("../utils/policyEnforcement");
const branchFilter_1 = require("../utils/branchFilter");
const invoiceNumberGenerator_1 = require("../utils/invoiceNumberGenerator");
// GET all journal entries with pagination, filtering, and fiscal year isolation
const getJournalEntries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 200;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const search = req.query.search;
        const accountId = req.query.accountId;
        const accountFilter = req.query.accountFilter;
        const createdBy = req.query.createdBy;
        const costCenterId = req.query.costCenterId;
        const transactionFilter = req.query.transactionFilter;
        const offset = (page - 1) * limit;
        const conn = yield (0, db_1.getConnection)();
        let whereConditions = [];
        let params = [];
        let countParams = [];
        // PERF: Pre-resolve treasury/filtered account IDs ONCE, then use IN() instead of
        // per-row EXISTS + JOIN accounts + LIKE patterns. On 57K entries this saves ~450ms.
        let preResolvedAccountIds = null;
        const needsAccountPreResolve = accountFilter ||
            (transactionFilter && (transactionFilter === 'INCOME' || transactionFilter === 'OUTCOME' || transactionFilter === 'EXPENSES'));
        if (needsAccountPreResolve) {
            let acctFilter;
            if (accountFilter === 'CASH') {
                acctFilter = "a.code LIKE '101%' OR (a.type = 'ASSET' AND (a.name LIKE '%صندوق%' OR a.name LIKE '%خزينة%' OR a.name LIKE '%نقدية%'))";
            }
            else if (accountFilter === 'BANK') {
                acctFilter = "a.code LIKE '102%' OR a.type = 'BANK' OR (a.type = 'ASSET' AND a.name LIKE '%بنك%')";
            }
            else if (accountFilter === 'CHEQUES') {
                acctFilter = "a.code LIKE '106%' OR a.code LIKE '107%'";
            }
            else {
                // ALL_TREASURY or INCOME/OUTCOME without specific accountFilter
                acctFilter = "(a.code LIKE '101%' OR a.code LIKE '102%' OR a.code LIKE '106%' OR a.code LIKE '107%' OR a.type = 'BANK' OR (a.type = 'ASSET' AND (a.name LIKE '%صندوق%' OR a.name LIKE '%خزينة%' OR a.name LIKE '%نقدية%' OR a.name LIKE '%بنك%')))";
            }
            const [acctRows] = yield conn.query(`SELECT id FROM accounts a WHERE ${acctFilter}`);
            preResolvedAccountIds = acctRows.map((r) => r.id);
        }
        if (startDate) {
            whereConditions.push('j.date >= ?');
            params.push(startDate);
            countParams.push(startDate);
        }
        if (endDate) {
            whereConditions.push('j.date <= ?');
            const formattedEndDate = (typeof endDate === 'string' && endDate.includes('T')) ? endDate : endDate + ' 23:59:59';
            params.push(formattedEndDate);
            countParams.push(formattedEndDate);
        }
        if (search) {
            // Search by j.description AND j.referenceId for quick reference number lookups.
            // Previously we also searched ix.notes via a correlated EXISTS subquery which forced
            // a full table scan of invoices for every journal row — causing 30s+ timeouts.
            // j.description already contains the invoice number and partner name, so
            // description-only search finds all relevant entries without the N×M scan cost.
            // Also searching j.referenceId enables fast lookup by receipt/reference number.
            if (search.includes('|')) {
                // Support pipe-delimited OR search (e.g., "سند قبض|متحصلات")
                const terms = search.split('|').map((t) => t.trim()).filter(Boolean);
                const orParts = terms.map(() => `(j.description LIKE ? OR j.referenceId LIKE ?)`);
                whereConditions.push(`(${orParts.join(' OR ')})`);
                for (const term of terms) {
                    params.push(`%${term}%`, `%${term}%`);
                    countParams.push(`%${term}%`, `%${term}%`);
                }
            }
            else {
                // Support space-separated AND search (e.g. "سلف وليد" -> %سلف% AND %وليد%)
                const terms = search.split(' ').map((t) => t.trim()).filter(Boolean);
                for (const term of terms) {
                    whereConditions.push(`(j.description LIKE ? OR j.referenceId LIKE ?)`);
                    params.push(`%${term}%`, `%${term}%`);
                    countParams.push(`%${term}%`, `%${term}%`);
                }
            }
        }
        if (accountId) {
            whereConditions.push('EXISTS (SELECT 1 FROM journal_lines jlf WHERE jlf.journalId = j.id AND jlf.accountId = ?)');
            params.push(accountId);
            countParams.push(accountId);
        }
        const categoryId = req.query.categoryId;
        if (categoryId) {
            // NOTE: accountId-based filtering is unreliable here because multiple categories
            // share the same accountId (e.g. رواتب, حوافز, سلف all use account 503).
            // MANUAL expense entries always embed the category name in j.description:
            //   e.g. "مصروف - رواتب (الحاج بدر)" or "مصروف - سلف (وليد)"
            // So name-based LIKE matching is the ONLY correct filter for these entries.
            const [catRows] = yield conn.query('SELECT name FROM cash_categories WHERE id = ?', [categoryId]);
            if (catRows.length > 0 && catRows[0].name) {
                whereConditions.push('j.description LIKE ?');
                params.push(`%${catRows[0].name}%`);
                countParams.push(`%${catRows[0].name}%`);
            }
            else {
                // Fallback: If the UI passed a raw string instead of a valid UUID (e.g., 'وليد' from a hardcoded list)
                whereConditions.push('j.description LIKE ?');
                params.push(`%${categoryId}%`);
                countParams.push(`%${categoryId}%`);
            }
        }
        if (costCenterId) {
            whereConditions.push('EXISTS (SELECT 1 FROM journal_lines jlf WHERE jlf.journalId = j.id AND jlf.costCenterId = ?)');
            params.push(costCenterId);
            countParams.push(costCenterId);
        }
        if (createdBy && createdBy !== 'ALL') {
            whereConditions.push('j.createdBy = ?');
            params.push(createdBy);
            countParams.push(createdBy);
        }
        // EXCLUDE search: pipe-separated terms to EXCLUDE from results.
        // Used by "غير مصنف" (UNSPECIFIED) filter to show only uncategorized entries.
        const excludeSearch = req.query.excludeSearch;
        if (excludeSearch) {
            const excludeTerms = excludeSearch.split('|').map((t) => t.trim()).filter(Boolean);
            for (const term of excludeTerms) {
                whereConditions.push(`(j.description NOT LIKE ? AND (j.referenceId IS NULL OR j.referenceId NOT LIKE ?))`);
                params.push(`%${term}%`, `%${term}%`);
                countParams.push(`%${term}%`, `%${term}%`);
            }
        }
        if (transactionFilter && transactionFilter !== 'ALL') {
            if (transactionFilter === 'SALES') {
                whereConditions.push("(j.description LIKE '%مبيعات%' OR j.description LIKE '%sale%' OR j.description LIKE '%عميل%')");
            }
            else if (transactionFilter === 'PURCHASES') {
                whereConditions.push("(j.description LIKE '%مشتريات%' OR j.description LIKE '%purchase%' OR j.description LIKE '%مورد%')");
            }
            else if (transactionFilter === 'EXPENSES') {
                // Match description-based expenses AND entries touching EXPENSE-type accounts,
                // BUT exclude structural document types that happen to touch EXPENSE accounts (e.g., COGS on sales invoices).
                // COGS (501) is type=EXPENSE, so every sales invoice has an EXPENSE-type line — we must exclude these.
                whereConditions.push(`(j.description LIKE '%مصروف%' OR j.description LIKE '%expense%' OR (j.description NOT LIKE 'صادر%' AND j.description NOT LIKE '%مرتجع%' AND j.description NOT LIKE '%فاتورة بيع%' AND j.description NOT LIKE '%فاتورة مبيعات%' AND j.description NOT LIKE '%فاتورة شراء%' AND j.description NOT LIKE '%فاتورة مشتريات%' AND j.description NOT LIKE '%سند قبض%' AND j.description NOT LIKE '%سند صرف%' AND j.description NOT LIKE '%دفعة%' AND j.description NOT LIKE '%فاتورة نقدي%' AND EXISTS (SELECT 1 FROM journal_lines jlf JOIN accounts a ON jlf.accountId = a.id WHERE jlf.journalId = j.id AND a.type = 'EXPENSE')))`);
                // Check: cash/bank account has ANY non-zero amount (debit or credit, positive or negative).
                // BUG FIX: The DailyCashRegistration creates negative expense entries with NEGATIVE values
                // (e.g., سلف -200 → cash credit=-200, expense debit=-200) instead of reversing directions.
                // Using > 0 missed these entries entirely. Using != 0 catches all cases:
                //   Normal expense: cash credit=200 (positive)
                //   Negative expense: cash credit=-200 (negative — still != 0)
                if (preResolvedAccountIds && preResolvedAccountIds.length > 0) {
                    const ph = preResolvedAccountIds.map(() => '?').join(',');
                    whereConditions.push(`EXISTS (SELECT 1 FROM journal_lines jlf WHERE jlf.journalId = j.id AND jlf.accountId IN (${ph}) AND (CAST(jlf.credit as DECIMAL(15,4)) != 0 OR CAST(jlf.debit as DECIMAL(15,4)) != 0))`);
                    params.push(...preResolvedAccountIds);
                    countParams.push(...preResolvedAccountIds);
                }
            }
            else if (transactionFilter === 'INCOME' && preResolvedAccountIds && preResolvedAccountIds.length > 0) {
                // PERF: Use pre-resolved IDs instead of per-row JOIN + LIKE
                // وارد (مقبوضات) — cash inflow: net cash impact > 0 (debit > credit on cash accounts)
                // Uses net impact (debit - credit) > 0 instead of raw debit > 0 to handle negative values.
                // BUG FIX: Negative credits (credit=-200) have net impact = 0-(-200) = +200, which IS inflow.
                // EXCLUDE مصروف/سند صرف descriptions to prevent reversed expenses showing as income.
                // INCLUDE سند قبض by description to catch reversed receipts (عكسي) where cash net < 0,
                // BUT only when the receipt touches accounts matching the current filter (e.g., cash 101 not bank 102).
                const ph = preResolvedAccountIds.map(() => '?').join(',');
                const ph2 = preResolvedAccountIds.map(() => '?').join(',');
                whereConditions.push(`(
                    EXISTS (
                        SELECT 1 FROM journal_lines jlf 
                        WHERE jlf.journalId = j.id AND jlf.accountId IN (${ph}) 
                        GROUP BY jlf.journalId 
                        HAVING (COALESCE(SUM(jlf.debit),0) - COALESCE(SUM(jlf.credit),0)) > 0
                    )
                    OR (
                        (j.description LIKE '%سند قبض%' OR j.description LIKE '%متحصلات نقدية%' OR j.referenceId LIKE 'REC-%')
                        AND EXISTS (SELECT 1 FROM journal_lines jlf2 WHERE jlf2.journalId = j.id AND jlf2.accountId IN (${ph2}))
                    )
                )`);
                whereConditions.push(`j.description NOT LIKE '%سند صرف%'`);
                whereConditions.push(`j.description NOT LIKE '%مصروف%'`);
                whereConditions.push(`j.description NOT LIKE '%expense%'`);
                // Also exclude PAY- entries that might have non-standard descriptions
                whereConditions.push(`(j.referenceId IS NULL OR j.referenceId NOT LIKE 'PAY-%')`);
                params.push(...preResolvedAccountIds, ...preResolvedAccountIds);
                countParams.push(...preResolvedAccountIds, ...preResolvedAccountIds);
            }
            else if (transactionFilter === 'OUTCOME' && preResolvedAccountIds && preResolvedAccountIds.length > 0) {
                const ph = preResolvedAccountIds.map(() => '?').join(',');
                const ph2 = preResolvedAccountIds.map(() => '?').join(',');
                // صادر (دفعيات) — cash outflow EXCLUDING مصروفات
                // Uses net cash impact (debit - credit) < 0 to handle both:
                //   Normal outflow: cash credit=500 → net = 0-500 = -500 (outflow)
                //   Negative entries: cash credit=-200 → net = 0-(-200) = +200 (NOT outflow)
                // Also includes سند صرف by description, BUT only when touching filtered accounts.
                // EXCLUDES سند قبض — reversed receipts belong in INCOME, not OUTCOME.
                whereConditions.push(`(
                    EXISTS (
                        SELECT 1 FROM journal_lines jlf
                        WHERE jlf.journalId = j.id AND jlf.accountId IN (${ph})
                        GROUP BY jlf.journalId
                        HAVING (COALESCE(SUM(jlf.debit),0) - COALESCE(SUM(jlf.credit),0)) < 0
                    )
                    OR (
                        (j.description LIKE '%سند صرف%' OR j.referenceId LIKE 'PAY-%')
                        AND EXISTS (SELECT 1 FROM journal_lines jlf2 WHERE jlf2.journalId = j.id AND jlf2.accountId IN (${ph2}))
                    )
                )`);
                whereConditions.push(`j.description NOT LIKE '%مصروف%'`);
                whereConditions.push(`j.description NOT LIKE '%expense%'`);
                whereConditions.push(`j.description NOT LIKE '%سند قبض%'`);
                whereConditions.push(`j.description NOT LIKE '%متحصلات نقدية%'`);
                // Also exclude REC- entries that might have non-standard descriptions
                whereConditions.push(`(j.referenceId IS NULL OR j.referenceId NOT LIKE 'REC-%')`);
                params.push(...preResolvedAccountIds, ...preResolvedAccountIds);
                countParams.push(...preResolvedAccountIds, ...preResolvedAccountIds);
            }
        }
        // PERF: Use pre-resolved account IDs for accountFilter (avoids per-row LIKE on accounts table)
        // Skip this when INCOME/OUTCOME/EXPENSES already added the same account-ID check above (avoids redundant double-filter)
        const alreadyFilteredByAccounts = transactionFilter === 'INCOME' || transactionFilter === 'OUTCOME' || transactionFilter === 'EXPENSES';
        if (accountFilter && preResolvedAccountIds && preResolvedAccountIds.length > 0 && !alreadyFilteredByAccounts) {
            const ph = preResolvedAccountIds.map(() => '?').join(',');
            whereConditions.push(`EXISTS (SELECT 1 FROM journal_lines jlf WHERE jlf.journalId = j.id AND jlf.accountId IN (${ph}))`);
            params.push(...preResolvedAccountIds);
            countParams.push(...preResolvedAccountIds);
        }
        // FISCAL YEAR DATA ISOLATION — always enforce as a hard boundary.
        // When startDate/endDate are also provided, they are already applied above.
        // The fiscal year filter acts as an outer clamp to prevent cross-year data leakage.
        // Without this, a user on fiscal year 2023-2024 could search and see 2025 journal entries.
        const authReq = req;
        if (authReq.fiscalYearFilter) {
            whereConditions.push('j.date >= ? AND j.date <= ?');
            params.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
            countParams.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        // BRANCH ISOLATION — non-privileged users see only their branch's journal entries
        {
            const branchConditions = [];
            const branchParams = [];
            (0, branchFilter_1.appendBranchFilter)(branchConditions, branchParams, authReq, 'j');
            if (branchConditions.length > 0) {
                whereConditions.push(branchConditions[0]);
                params.push(...branchParams);
                countParams.push(...branchParams);
            }
        }
        // DEDUP: Keep only one journal entry per referenceId to prevent duplicates
        // For entries with the same referenceId, keep the latest (largest id)
        // NOTE: Some MySQL/MariaDB versions have issues with correlated subqueries referencing
        // outer table aliases. We wrap this in a flag so we can retry without it if needed.
        const dedupCondition = `(j.referenceId IS NULL OR j.referenceId = '' OR j.referenceId = 'MANUAL' OR NOT EXISTS (SELECT 1 FROM journal_entries j2 WHERE j2.referenceId = j.referenceId AND j2.referenceId IS NOT NULL AND j2.referenceId != '' AND j2.referenceId != 'MANUAL' AND j2.id > j.id))`;
        whereConditions.push(dedupCondition);
        const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';
        // PERF: Simple LEFT JOIN on primary key only (index-based, instant lookup).
        // We try to COALESCE journal_entries.notes with the linked invoice notes.
        // If journal_entries doesn't have a notes column yet, the catch block retries safely.
        let countResult, rows;
        try {
            const countQuery = `SELECT COUNT(*) as total FROM journal_entries j${whereClause}`;
            // Attempt to fetch j.notes — safe fallback below if column doesn't exist
            const dataQuery = `SELECT j.id, j.date, j.description, j.referenceId, j.createdBy,
                j.currencyCode, j.exchangeRate, j.denominations,
                COALESCE(NULLIF(j.notes, ''), i2.notes) as notes
                FROM journal_entries j
                LEFT JOIN invoices i2 ON i2.id = j.referenceId
                ${whereClause}
                ORDER BY j.date DESC, j.id DESC LIMIT ? OFFSET ?`;
            // Compact debug line — only in dev mode, single line per request
            if (process.env.NODE_ENV === 'development') {
                console.log(`[journalController] filters=${transactionFilter || '-'}/${accountFilter || '-'} conditions=${whereConditions.length} fy=${req.fiscalYearFilter ? 'yes' : 'NO'}`);
            }
            [[countResult], [rows]] = yield Promise.all([
                conn.query(countQuery, countParams),
                conn.query(dataQuery, [...params, limit, offset]),
            ]);
        }
        catch (queryErr) {
            // If timeout middleware already responded, suppress — don't double-send
            if (res.headersSent || res.locals._timedOut) {
                conn.release();
                return;
            }
            // Graceful fallback for ANY ER_BAD_FIELD_ERROR (j.notes, j.id in DEDUP subquery, etc.)
            // Some MySQL/MariaDB versions choke on correlated subqueries with outer aliases.
            if (queryErr.code === 'ER_BAD_FIELD_ERROR' ||
                ((_a = queryErr.message) === null || _a === void 0 ? void 0 : _a.includes('Unknown column'))) {
                console.warn(`[journalController] ER_BAD_FIELD_ERROR — retrying with simplified query. Error: ${queryErr.message}`);
                // Strip the DEDUP condition and notes column for maximum compatibility
                const safeConditions = whereConditions.filter(c => c !== dedupCondition);
                const safeWhereClause = safeConditions.length > 0 ? ' WHERE ' + safeConditions.join(' AND ') : '';
                // Also strip DEDUP params (DEDUP has no params, so countParams/params stay the same)
                [[countResult], [rows]] = yield Promise.all([
                    conn.query(`SELECT COUNT(*) as total FROM journal_entries j${safeWhereClause}`, countParams),
                    conn.query(`SELECT j.id, j.date, j.description, j.referenceId, j.createdBy,
                         j.currencyCode, j.exchangeRate, j.denominations
                         FROM journal_entries j${safeWhereClause}
                         ORDER BY j.date DESC, j.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
                ]);
            }
            else {
                throw queryErr;
            }
        }
        const total = ((_b = countResult[0]) === null || _b === void 0 ? void 0 : _b.total) || 0;
        const journalIds = rows.map(r => r.id);
        let linesMap = new Map();
        if (journalIds.length > 0) {
            const placeholders = journalIds.map(() => '?').join(',');
            let lineRows;
            try {
                [lineRows] = yield conn.query(`SELECT journalId, id, accountId, accountName, debit, credit, costCenterId, foreignDebit, foreignCredit, currencyCode, exchangeRate FROM journal_lines WHERE journalId IN (${placeholders}) ORDER BY id`, journalIds);
            }
            catch (linesErr) {
                // Fallback: multi-currency columns (foreignDebit, foreignCredit, currencyCode, exchangeRate) may not exist
                if (linesErr.code === 'ER_BAD_FIELD_ERROR' || ((_c = linesErr.message) === null || _c === void 0 ? void 0 : _c.includes('Unknown column'))) {
                    console.warn(`[journalController] Lines fallback — missing multi-currency columns: ${linesErr.message}`);
                    [lineRows] = yield conn.query(`SELECT journalId, id, accountId, accountName, debit, credit, costCenterId FROM journal_lines WHERE journalId IN (${placeholders}) ORDER BY id`, journalIds);
                }
                else {
                    throw linesErr;
                }
            }
            for (const line of lineRows) {
                if (!linesMap.has(line.journalId))
                    linesMap.set(line.journalId, []);
                linesMap.get(line.journalId).push({
                    id: line.id,
                    accountId: line.accountId,
                    accountName: line.accountName,
                    debit: parseFloat(line.debit) || 0,
                    credit: parseFloat(line.credit) || 0,
                    costCenterId: line.costCenterId || null,
                    foreignDebit: parseFloat(line.foreignDebit) || 0,
                    foreignCredit: parseFloat(line.foreignCredit) || 0,
                    currencyCode: line.currencyCode || null,
                    exchangeRate: parseFloat(line.exchangeRate) || null,
                });
            }
        }
        const journals = rows.map(row => ({
            id: row.id,
            date: row.date,
            description: row.description,
            referenceId: row.referenceId,
            createdBy: row.createdBy,
            currencyCode: row.currencyCode || 'EGP',
            exchangeRate: parseFloat(row.exchangeRate) || 1,
            denominations: row.denominations ? (typeof row.denominations === 'string' ? JSON.parse(row.denominations) : row.denominations) : undefined,
            notes: row.notes || undefined,
            lines: linesMap.get(row.id) || []
        }));
        conn.release();
        // Include debug info when EXPENSES filter is active (temporary diagnostic)
        const debugInfo = transactionFilter === 'EXPENSES' ? {
            preResolvedAccountIds: (preResolvedAccountIds === null || preResolvedAccountIds === void 0 ? void 0 : preResolvedAccountIds.length) || 0,
            whereConditionsCount: whereConditions.length,
            whereClausePreview: whereConditions.map((w, i) => `[${i}] ${w.substring(0, 120)}`),
            paramsCount: params.length,
            totalFromDB: (_d = countResult[0]) === null || _d === void 0 ? void 0 : _d.total,
        } : undefined;
        res.json(Object.assign({ journals, pagination: {
                total: countResult[0].total,
                page,
                limit,
                totalPages: Math.ceil(countResult[0].total / limit)
            } }, (debugInfo ? { _debug: debugInfo } : {})));
    }
    catch (error) {
        // Guard: if timeout middleware already responded, don't try to send again
        if (res.headersSent || res.locals._timedOut) {
            console.error('Error in journal entries (response already sent, suppressing):', error === null || error === void 0 ? void 0 : error.message);
            return;
        }
        console.error('Error fetching journal entries:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'journal entries');
    }
});
exports.getJournalEntries = getJournalEntries;
// CREATE a manual journal entry
const createJournalEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { date, description, notes, lines, currencyCode, exchangeRate, denominations, referenceId: reqReferenceId } = req.body;
        const authReq = req;
        const createdBy = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.username) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        // Validate balanced entry
        const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
        const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            conn.release();
            return res.status(400).json({ error: 'Journal entry must be balanced. Total debits must equal total credits.' });
        }
        if (!lines || lines.length < 2) {
            conn.release();
            return res.status(400).json({ error: 'Journal entry must have at least 2 lines.' });
        }
        // === FISCAL YEAR GUARD ===
        const fyCheck = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)(date);
        if (!fyCheck.allowed) {
            conn.release();
            return res.status(403).json({ code: fyCheck.errorCode, error: fyCheck.error });
        }
        // === SYSTEM POLICY VALIDATION ===
        const currentUserRole = authReq.user ? authReq.user.role : undefined;
        const systemConfig = authReq.systemConfig;
        if (systemConfig && (currentUserRole === null || currentUserRole === void 0 ? void 0 : currentUserRole.toUpperCase()) !== 'MASTER_ADMIN') {
            const context = {
                type: 'JOURNAL',
                date,
                notes: description,
                costCenterId: (_c = lines[0]) === null || _c === void 0 ? void 0 : _c.costCenterId,
                createdBy,
                currentUser: createdBy,
                currentUserRole
            };
            const validationResult = yield (0, policyEnforcement_1.validateTransactionFull)(context, systemConfig, conn);
            if (!validationResult.valid) {
                conn.release();
                return res.status(403).json({ message: validationResult.error, errorCode: validationResult.errorCode });
            }
        }
        yield conn.beginTransaction();
        // Generate sequential referenceId if needed
        let finalReferenceId = reqReferenceId;
        if (!finalReferenceId || finalReferenceId === 'MANUAL') {
            finalReferenceId = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, 'TRX-', 'journal_entries', 'referenceId');
        }
        const id = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO journal_entries (id, date, description, notes, referenceId, createdBy, currencyCode, exchangeRate, denominations, branchId)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, date, description, notes || null, finalReferenceId, createdBy, currencyCode || 'EGP', exchangeRate || 1,
            denominations ? JSON.stringify(denominations) : null, (0, branchFilter_1.resolveBranchIdForWrite)(req)]);
        // PERF: Batch insert all lines + batch update account balances (was 2N queries, now 3)
        const lineValues = lines.map((line) => [
            id, line.accountId, line.accountName, line.debit || 0, line.credit || 0,
            line.costCenterId || null, line.foreignDebit || 0, line.foreignCredit || 0,
            line.currencyCode || null, line.exchangeRate || null
        ]);
        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, costCenterId, foreignDebit, foreignCredit, currencyCode, exchangeRate) VALUES ?`, [lineValues]);
        // Batch-load account types for all lines in ONE query
        const uniqueAccountIds = [...new Set(lines.map((l) => l.accountId).filter(Boolean))];
        const accountTypeMap = new Map();
        if (uniqueAccountIds.length > 0) {
            const [accTypeRows] = yield conn.query(`SELECT id, type FROM accounts WHERE id IN (?)`, [uniqueAccountIds]);
            for (const row of accTypeRows) {
                accountTypeMap.set(row.id, row.type);
            }
        }
        // Batch-update all account balances
        for (const line of lines) {
            const accType = accountTypeMap.get(line.accountId);
            let balanceChange = 0;
            if (accType === 'ASSET' || accType === 'EXPENSE') {
                balanceChange = (Number(line.debit) || 0) - (Number(line.credit) || 0);
            }
            else {
                balanceChange = (Number(line.credit) || 0) - (Number(line.debit) || 0);
            }
            if (Math.abs(balanceChange) > 0.001) {
                yield conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [balanceChange, line.accountId]);
            }
        }
        yield conn.commit();
        try {
            yield (0, auditController_1.logAction)(createdBy, 'ACCOUNTING', 'CREATE_JOURNAL', `إنشاء قيد يومية: ${description}`, `رقم القيد: ${id}`);
        }
        catch (e) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'journals', updatedBy: createdBy });
        res.status(201).json({ id, date, description, referenceId: null, createdBy, currencyCode: currencyCode || 'EGP', exchangeRate: exchangeRate || 1, lines });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error creating journal entry:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'journal entry');
    }
    finally {
        conn.release();
    }
});
exports.createJournalEntry = createJournalEntry;
// UPDATE an existing journal entry
const updateJournalEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { id } = req.params;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { date, description, notes, lines, currencyCode, exchangeRate, denominations } = req.body;
        const authReq = req;
        const updatedBy = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.username) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        // Validate balanced entry
        const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
        const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            conn.release();
            return res.status(400).json({ error: 'Journal entry must be balanced.' });
        }
        // === FISCAL YEAR GUARD ===
        const fyCheck = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)(date);
        if (!fyCheck.allowed) {
            conn.release();
            return res.status(403).json({ code: fyCheck.errorCode, error: fyCheck.error });
        }
        const [existingJ] = yield conn.query('SELECT createdBy FROM journal_entries WHERE id = ?', [id]);
        const existingJData = existingJ[0];
        // === SYSTEM POLICY VALIDATION ===
        const currentUserRole = authReq.user ? authReq.user.role : undefined;
        const systemConfig = authReq.systemConfig;
        if (systemConfig && (currentUserRole === null || currentUserRole === void 0 ? void 0 : currentUserRole.toUpperCase()) !== 'MASTER_ADMIN') {
            const context = {
                type: 'JOURNAL',
                date,
                notes: description,
                costCenterId: (_c = lines[0]) === null || _c === void 0 ? void 0 : _c.costCenterId,
                createdBy: existingJData === null || existingJData === void 0 ? void 0 : existingJData.createdBy,
                currentUser: updatedBy,
                currentUserRole
            };
            const validationResult = yield (0, policyEnforcement_1.validateTransactionFull)(context, systemConfig, conn);
            if (!validationResult.valid) {
                conn.release();
                return res.status(403).json({ message: validationResult.error, errorCode: validationResult.errorCode });
            }
        }
        yield conn.beginTransaction();
        // 1. Reverse old lines' effect on account balances
        const [oldLines] = yield conn.query('SELECT jl.accountId, jl.debit, jl.credit, a.type as accType FROM journal_lines jl LEFT JOIN accounts a ON jl.accountId = a.id WHERE jl.journalId = ?', [id]);
        for (const oldLine of oldLines) {
            let reverseChange = 0;
            if (oldLine.accType === 'ASSET' || oldLine.accType === 'EXPENSE') {
                reverseChange = -((Number(oldLine.debit) || 0) - (Number(oldLine.credit) || 0));
            }
            else {
                reverseChange = -((Number(oldLine.credit) || 0) - (Number(oldLine.debit) || 0));
            }
            yield conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [reverseChange, oldLine.accountId]);
        }
        // 2. Delete old lines
        yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [id]);
        // 3. Update the entry header
        yield conn.query('UPDATE journal_entries SET date = ?, description = ?, notes = ?, currencyCode = ?, exchangeRate = ?, denominations = ? WHERE id = ?', [date, description, notes || null, currencyCode, exchangeRate || 1, denominations ? JSON.stringify(denominations) : null, id]);
        // 4. PERF: Batch insert new lines + batch update balances (was 2N queries, now 3)
        const updateLineValues = lines.map((line) => [
            id, line.accountId, line.accountName, line.debit || 0, line.credit || 0,
            line.costCenterId || null, line.foreignDebit || 0, line.foreignCredit || 0,
            line.currencyCode || null, line.exchangeRate || null
        ]);
        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, costCenterId, foreignDebit, foreignCredit, currencyCode, exchangeRate) VALUES ?`, [updateLineValues]);
        // Batch-load account types
        const updateAccountIds = [...new Set(lines.map((l) => l.accountId).filter(Boolean))];
        const updateAccTypeMap = new Map();
        if (updateAccountIds.length > 0) {
            const [accTypeRows] = yield conn.query(`SELECT id, type FROM accounts WHERE id IN (?)`, [updateAccountIds]);
            for (const row of accTypeRows) {
                updateAccTypeMap.set(row.id, row.type);
            }
        }
        for (const line of lines) {
            const accType = updateAccTypeMap.get(line.accountId);
            let balanceChange = 0;
            if (accType === 'ASSET' || accType === 'EXPENSE') {
                balanceChange = (Number(line.debit) || 0) - (Number(line.credit) || 0);
            }
            else {
                balanceChange = (Number(line.credit) || 0) - (Number(line.debit) || 0);
            }
            if (Math.abs(balanceChange) > 0.001) {
                yield conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [balanceChange, line.accountId]);
            }
        }
        yield conn.commit();
        try {
            yield (0, auditController_1.logAction)(updatedBy, 'ACCOUNTING', 'UPDATE_JOURNAL', `تحديث قيد يومية: ${description}`, `رقم القيد: ${id}`);
        }
        catch (e) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'journals', updatedBy });
        res.json({ id, date, description, lines, currencyCode, exchangeRate });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error updating journal entry:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'journal entry');
    }
    finally {
        conn.release();
    }
});
exports.updateJournalEntry = updateJournalEntry;
// DELETE a journal entry
const deleteJournalEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { id } = req.params;
    const conn = yield (0, db_1.getConnection)();
    try {
        const authReq = req;
        const deletedBy = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.username) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        // === FISCAL YEAR GUARD ===
        const [entryCheck] = yield conn.query('SELECT date, referenceId FROM journal_entries WHERE id = ?', [id]);
        const entry = entryCheck[0];
        if (!entry) {
            conn.release();
            return res.status(404).json({ error: 'Journal entry not found' });
        }
        if (entry.date) {
            const fyCheck = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)(entry.date);
            if (!fyCheck.allowed) {
                conn.release();
                return res.status(403).json({ code: fyCheck.errorCode, error: fyCheck.error });
            }
        }
        yield conn.beginTransaction();
        // 1. Reverse account balance impacts
        const [oldLines] = yield conn.query('SELECT jl.accountId, jl.debit, jl.credit, a.type as accType FROM journal_lines jl LEFT JOIN accounts a ON jl.accountId = a.id WHERE jl.journalId = ?', [id]);
        for (const oldLine of oldLines) {
            let reverseChange = 0;
            if (oldLine.accType === 'ASSET' || oldLine.accType === 'EXPENSE') {
                reverseChange = -((Number(oldLine.debit) || 0) - (Number(oldLine.credit) || 0));
            }
            else {
                reverseChange = -((Number(oldLine.credit) || 0) - (Number(oldLine.debit) || 0));
            }
            yield conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [reverseChange, oldLine.accountId]);
        }
        // 2. Get description for audit
        const [entryRows] = yield conn.query('SELECT description FROM journal_entries WHERE id = ?', [id]);
        const desc = ((_c = entryRows[0]) === null || _c === void 0 ? void 0 : _c.description) || 'Unknown';
        // 3. Delete lines first, then entry
        yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [id]);
        yield conn.query('DELETE FROM journal_entries WHERE id = ?', [id]);
        // 4. CASCADE: Delete linked RECEIPT/PAYMENT invoice if exists
        // When a journal entry is linked to a voucher (سند قبض/صرف), deleting the journal
        // should also delete the voucher — otherwise it becomes an orphan in the payments list
        if (entry.referenceId) {
            const [linkedInvoice] = yield conn.query(`SELECT id, type, partnerId, total FROM invoices WHERE id = ? AND type IN ('RECEIPT', 'PAYMENT')`, [entry.referenceId]);
            const linkedInv = linkedInvoice[0];
            if (linkedInv) {
                // Reverse partner balance if applicable
                if (linkedInv.partnerId) {
                    const balanceReverse = linkedInv.type === 'RECEIPT'
                        ? Number(linkedInv.total) // Receipt reduced balance, so add it back
                        : -Number(linkedInv.total); // Payment increased balance, so subtract it
                    yield conn.query('UPDATE partners SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [balanceReverse, linkedInv.partnerId]);
                }
                yield conn.query('DELETE FROM invoice_lines WHERE invoiceId = ?', [linkedInv.id]);
                yield conn.query('DELETE FROM invoices WHERE id = ?', [linkedInv.id]);
                console.log(`🗑️ CASCADE: Deleted linked ${linkedInv.type} invoice ${linkedInv.id} (${linkedInv.total})`);
            }
        }
        yield conn.commit();
        try {
            yield (0, auditController_1.logAction)(deletedBy, 'ACCOUNTING', 'DELETE_JOURNAL', `حذف قيد يومية: ${desc}`, `رقم القيد: ${id}`);
        }
        catch (e) { }
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'journals', entityId: id, deletedBy });
        res.json({ message: 'Journal entry deleted successfully' });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error deleting journal entry:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'journal entry');
    }
    finally {
        conn.release();
    }
});
exports.deleteJournalEntry = deleteJournalEntry;
// REVERSE a journal entry (create a mirror entry with swapped debits/credits)
const reverseJournalEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { id } = req.params;
    const conn = yield (0, db_1.getConnection)();
    try {
        const authReq = req;
        const createdBy = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.username) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        // Get original entry
        const [entryRows] = yield conn.query('SELECT * FROM journal_entries WHERE id = ?', [id]);
        const entry = entryRows[0];
        if (!entry) {
            conn.release();
            return res.status(404).json({ error: 'Journal entry not found' });
        }
        // === FISCAL YEAR GUARD ===
        const fyCheck = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)(entry.date);
        if (!fyCheck.allowed) {
            conn.release();
            return res.status(403).json({ code: fyCheck.errorCode, error: fyCheck.error });
        }
        // Get original lines
        const [lineRows] = yield conn.query('SELECT * FROM journal_lines WHERE journalId = ?', [id]);
        const lines = lineRows;
        yield conn.beginTransaction();
        const newId = (0, crypto_1.randomUUID)();
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, branchId)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [newId, now, `عكس قيد: ${entry.description}`, id, createdBy,
            entry.currencyCode || 'EGP', entry.exchangeRate || 1, (0, branchFilter_1.resolveBranchIdForWrite)(req)]);
        // PERF: Batch insert reversed lines + batch update balances
        const reverseLineValues = lines.map((line) => [
            newId, line.accountId, line.accountName,
            parseFloat(line.credit) || 0, parseFloat(line.debit) || 0,
            line.costCenterId,
            parseFloat(line.foreignCredit) || 0, parseFloat(line.foreignDebit) || 0,
            line.currencyCode, line.exchangeRate
        ]);
        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, costCenterId, foreignDebit, foreignCredit, currencyCode, exchangeRate) VALUES ?`, [reverseLineValues]);
        // Batch-load account types for reversal
        const reverseAccountIds = [...new Set(lines.map((l) => l.accountId).filter(Boolean))];
        const reverseAccTypeMap = new Map();
        if (reverseAccountIds.length > 0) {
            const [accTypeRows] = yield conn.query(`SELECT id, type FROM accounts WHERE id IN (?)`, [reverseAccountIds]);
            for (const row of accTypeRows) {
                reverseAccTypeMap.set(row.id, row.type);
            }
        }
        for (const line of lines) {
            const accType = reverseAccTypeMap.get(line.accountId);
            let balanceChange = 0;
            if (accType === 'ASSET' || accType === 'EXPENSE') {
                balanceChange = (parseFloat(line.credit) || 0) - (parseFloat(line.debit) || 0);
            }
            else {
                balanceChange = (parseFloat(line.debit) || 0) - (parseFloat(line.credit) || 0);
            }
            if (Math.abs(balanceChange) > 0.001) {
                yield conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [balanceChange, line.accountId]);
            }
        }
        yield conn.commit();
        try {
            yield (0, auditController_1.logAction)(createdBy, 'ACCOUNTING', 'REVERSE_JOURNAL', `عكس قيد يومية: ${entry.description}`, `القيد الأصلي: ${id} → القيد العكسي: ${newId}`);
        }
        catch (e) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'journals', updatedBy: createdBy });
        res.status(201).json({
            id: newId,
            date: now,
            description: `عكس قيد: ${entry.description}`,
            referenceId: id,
            createdBy,
            lines: lines.map((l) => ({
                accountId: l.accountId,
                accountName: l.accountName,
                debit: parseFloat(l.credit) || 0,
                credit: parseFloat(l.debit) || 0,
                costCenterId: l.costCenterId
            }))
        });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error reversing journal entry:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'journal entry');
    }
    finally {
        conn.release();
    }
});
exports.reverseJournalEntry = reverseJournalEntry;
// CLEANUP orphaned RECEIPT/PAYMENT invoices that lost their journal entries
// These are vouchers (سند قبض/صرف) whose journals were deleted before the cascade fix
const cleanupOrphanedVouchers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    const dryRun = req.method === 'GET'; // GET = preview, POST/DELETE = execute
    try {
        const authReq = req;
        const user = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.username) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        // Find RECEIPT/PAYMENT invoices with no matching journal entry
        const [orphans] = yield conn.query(`
            SELECT i.id, i.number, i.type, i.date, i.partnerName, i.total, i.notes
            FROM invoices i
            WHERE i.type IN ('RECEIPT', 'PAYMENT')
            AND NOT EXISTS (
                SELECT 1 FROM journal_entries je WHERE je.referenceId = i.id
            )
            ORDER BY i.date DESC
        `);
        const orphanList = orphans;
        const totalAmount = orphanList.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        if (dryRun) {
            return res.json({
                mode: 'DRY_RUN',
                message: `وجد ${orphanList.length} سند يتيم (بدون قيد يومية)`,
                totalAmount,
                orphans: orphanList.map(o => ({
                    id: o.id,
                    number: o.number,
                    type: o.type === 'PAYMENT' ? 'سند صرف' : 'سند قبض',
                    date: o.date,
                    partner: o.partnerName,
                    total: o.total,
                    notes: o.notes
                }))
            });
        }
        // Execute cleanup
        yield conn.beginTransaction();
        let deletedCount = 0;
        for (const orphan of orphanList) {
            yield conn.query('DELETE FROM invoice_lines WHERE invoiceId = ?', [orphan.id]);
            yield conn.query('DELETE FROM invoices WHERE id = ?', [orphan.id]);
            console.log(`🗑️ Cleaned orphan ${orphan.type} ${orphan.number || orphan.id} (${orphan.total})`);
            deletedCount++;
        }
        yield conn.commit();
        try {
            yield (0, auditController_1.logAction)(user, 'SYSTEM', 'CLEANUP', `تنظيف سندات يتيمة`, `تم حذف ${deletedCount} سند يتيم بإجمالي ${totalAmount}`);
        }
        catch (e) { }
        console.log(`✅ Cleanup complete: ${deletedCount} orphaned vouchers deleted (total: ${totalAmount})`);
        res.json({
            mode: 'EXECUTED',
            message: `تم حذف ${deletedCount} سند يتيم بنجاح`,
            deletedCount,
            totalAmount
        });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error cleaning orphaned vouchers:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'cleanup');
    }
    finally {
        conn.release();
    }
});
exports.cleanupOrphanedVouchers = cleanupOrphanedVouchers;
