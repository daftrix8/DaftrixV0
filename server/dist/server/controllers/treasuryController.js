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
exports.cleanupDuplicateBankAccounts = exports.recalculateBankBalances = exports.updateCheque = exports.getCheques = exports.deleteBank = exports.resyncBankGL = exports.updateBank = exports.createBank = exports.getBanks = exports.createReceipt = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
const policyEnforcement_1 = require("../utils/policyEnforcement");
const branchFilter_1 = require("../utils/branchFilter");
/**
 * Create a treasury receipt from mobile app
 * POST /api/treasury/receipts
 */
const createReceipt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    console.log('📱💰 Treasury Receipt Request Received:', JSON.stringify(req.body, null, 2));
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { partnerId, partnerName, amount, date, method, reference, notes, bankAccountId, salesmanId, currencyCode = 'EGP', exchangeRate = 1 } = req.body;
        const user = req.user;
        if (!partnerId || !amount || amount <= 0) {
            connection.release();
            return res.status(400).json({ error: 'Partner ID and amount are required' });
        }
        const receiptDate = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        // === SYSTEM POLICY VALIDATION (PRE-TRANSACTION) ===
        const authReq = req;
        const currentUserRole = authReq.user ? authReq.user.role : undefined;
        const systemConfig = authReq.systemConfig;
        if (systemConfig && (currentUserRole === null || currentUserRole === void 0 ? void 0 : currentUserRole.toUpperCase()) !== 'MASTER_ADMIN') {
            const context = {
                type: 'RECEIPT',
                date: receiptDate,
                total: amount,
                partnerId: partnerId,
                notes: notes,
                createdBy: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) || 'Mobile App',
                currentUser: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) || 'Mobile App',
                currentUserRole
            };
            // Note: Use connection to pass to validation, wait for result.
            // For policies requiring DB lookups like Credit Limit, passing conn is helpful
            const validationResult = yield (0, policyEnforcement_1.validateTransactionFull)(context, systemConfig, connection);
            if (!validationResult.valid) {
                yield connection.rollback();
                connection.release();
                return res.status(403).json({ message: validationResult.error, errorCode: validationResult.errorCode });
            }
        }
        const receiptId = (0, crypto_1.randomUUID)();
        const receiptNumber = `RCV-${Date.now().toString(36).toUpperCase()}`;
        const paymentMethod = method === 'BANK' ? 'BANK' : 'CASH';
        console.log(`💰 Creating treasury receipt: ${receiptNumber} for ${amount} (${paymentMethod})`);
        // Get bank's GL account ID if bank payment
        let bankGLAccountId = null;
        let bankName = null;
        if (paymentMethod === 'BANK' && bankAccountId) {
            const [bankRows] = yield connection.query(`SELECT b.name, b.accountId FROM banks b WHERE b.id = ? OR b.accountId = ? LIMIT 1`, [bankAccountId, bankAccountId]);
            if (bankRows[0]) {
                bankGLAccountId = bankRows[0].accountId;
                bankName = bankRows[0].name;
                console.log(`🏦 Found bank: ${bankName}, GL Account: ${bankGLAccountId}`);
            }
        }
        // 1. Create receipt invoice
        // If it's a foreign currency, 'amount' is in EGP (the base currency value). 
        // We'll calculate the foreignTotal by dividing amount / exchangeRate.
        const foreignTotal = currencyCode !== 'EGP' ? amount / exchangeRate : null;
        const branchId = (0, branchFilter_1.resolveBranchIdForWrite)(req);
        yield connection.query(`
            INSERT INTO invoices (
                id, number, date, type, partnerId, partnerName,
                total, paidAmount, status, paymentMethod, posted,
                notes, salesmanId, createdBy, bankAccountId,
                currencyCode, exchangeRate, foreignTotal, branchId
            ) VALUES (?, ?, ?, 'RECEIPT', ?, ?, ?, ?, 'POSTED', ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            receiptId, receiptNumber, receiptDate, partnerId, partnerName || 'عميل',
            amount, amount,
            paymentMethod,
            notes || (reference ? `رقم المرجع: ${reference}` : 'تحصيل من التطبيق'),
            salesmanId || null,
            (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) || 'Mobile App',
            paymentMethod === 'BANK' ? (bankGLAccountId || bankAccountId) : null,
            currencyCode, exchangeRate, foreignTotal, branchId
        ]);
        // 2. Update partner balance (decrease debt)
        yield connection.query(`
            UPDATE partners SET balance = COALESCE(balance, 0) - ? WHERE id = ?
        `, [amount, partnerId]);
        // 3. Get treasury account for journal entry
        let treasuryAccountId = null;
        if (paymentMethod === 'BANK' && bankGLAccountId) {
            treasuryAccountId = bankGLAccountId;
        }
        else {
            // Find the branch's default treasury GL account first, then fall back to pattern match
            if (branchId) {
                const [branchBank] = yield connection.query(`SELECT b.accountId FROM banks b
                     JOIN branches br ON br.defaultBankId = b.id
                     WHERE br.id = ? AND b.accountId IS NOT NULL LIMIT 1`, [branchId]);
                treasuryAccountId = ((_a = branchBank[0]) === null || _a === void 0 ? void 0 : _a.accountId) || null;
            }
            if (!treasuryAccountId) {
                // Fallback: first cash-type account (legacy behavior)
                const [cashAccounts] = yield connection.query(`SELECT id FROM accounts WHERE code LIKE '101%' OR name LIKE '%نقدي%' OR name LIKE '%صندوق%' LIMIT 1`);
                treasuryAccountId = (_b = cashAccounts[0]) === null || _b === void 0 ? void 0 : _b.id;
            }
        }
        // 4. Create journal entry
        if (treasuryAccountId) {
            const journalId = (0, crypto_1.randomUUID)();
            yield connection.query(`
                INSERT INTO journal_entries (id, date, description, referenceId, currencyCode, exchangeRate, branchId)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                journalId,
                receiptDate,
                `تحصيل من ${partnerName || 'عميل'} - ${receiptNumber} - ${paymentMethod === 'BANK' ? bankName || 'تحويل بنكي' : 'نقدي'}`,
                receiptId,
                currencyCode,
                exchangeRate,
                branchId
            ]);
            // Get receivables account
            const [receivablesAccounts] = yield connection.query(`
                SELECT id FROM accounts WHERE code LIKE '112%' OR name LIKE '%عملاء%' OR name LIKE '%ذمم%' LIMIT 1
            `);
            const receivablesAccountId = (_c = receivablesAccounts[0]) === null || _c === void 0 ? void 0 : _c.id;
            // Debit: Treasury/Bank, Credit: Receivables
            yield connection.query(`
                INSERT INTO journal_lines (journalId, accountId, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit)
                VALUES (?, ?, ?, 0, ?, ?, ?, 0)
            `, [journalId, treasuryAccountId, amount, currencyCode, exchangeRate, foreignTotal !== null ? foreignTotal : amount]);
            if (receivablesAccountId) {
                yield connection.query(`
                    INSERT INTO journal_lines (journalId, accountId, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit)
                    VALUES (?, ?, 0, ?, ?, ?, 0, ?)
                `, [journalId, receivablesAccountId, amount, currencyCode, exchangeRate, foreignTotal !== null ? foreignTotal : amount]);
                // Update account balances
                yield connection.query(`UPDATE accounts SET balance = COALESCE(balance, 0) + ? WHERE id = ?`, [amount, treasuryAccountId]);
                yield connection.query(`UPDATE accounts SET balance = COALESCE(balance, 0) - ? WHERE id = ?`, [amount, receivablesAccountId]);
            }
            console.log(`📝 Created journal entry: ${journalId}`);
        }
        // 5. Update bank balance for BANK method (separate from GL account)
        // REMOVED: Banks balance is now calculated live from GL/journal lines
        // to prevent drift and ensure single source of truth.
        yield connection.commit();
        // Log audit trail
        yield (0, auditController_1.logAction)((user === null || user === void 0 ? void 0 : user.name) || 'Mobile', 'RECEIPT', 'CREATE', `تحصيل من ${partnerName || 'عميل'}`, `المبلغ: ${amount}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoices', updatedBy: (user === null || user === void 0 ? void 0 : user.name) || 'Mobile' });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'partners', updatedBy: (user === null || user === void 0 ? void 0 : user.name) || 'Mobile' });
        console.log(`✅ Receipt created: ${receiptNumber}`);
        res.status(201).json({ id: receiptId, number: receiptNumber, amount, success: true });
    }
    catch (error) {
        yield connection.rollback();
        console.error('❌ Error creating receipt:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'createReceipt');
    }
    finally {
        connection.release();
    }
});
exports.createReceipt = createReceipt;
const getBanks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // Branch isolation: non-admin users see only their branch's banks + shared (branchId IS NULL)
        const authReq = req;
        const branchId = ((_a = authReq.branchContext) === null || _a === void 0 ? void 0 : _a.branchId) || null;
        const userRole = (((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.role) || '').toUpperCase();
        const isPrivileged = ['ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(userRole);
        let banks;
        if (branchId && !isPrivileged) {
            // Branch-locked user: own branch + shared banks
            try {
                const [rows] = yield db_1.pool.query('SELECT * FROM banks WHERE branchId = ? OR branchId IS NULL', [branchId]);
                banks = rows;
            }
            catch (_c) {
                // branchId column may not exist yet — fall through to unfiltered
                const [rows] = yield db_1.pool.query('SELECT * FROM banks');
                banks = rows;
            }
        }
        else {
            // Admin or no branch assignment — show all
            const [rows] = yield db_1.pool.query('SELECT * FROM banks');
            banks = rows;
        }
        // Get all bank account IDs for batch journal query
        const accountIds = banks.filter((b) => b.accountId).map((b) => b.accountId);
        if (accountIds.length > 0) {
            // Batch: get opening balances and journal totals in 2 queries
            const [accounts] = yield db_1.pool.query('SELECT id, COALESCE(openingBalance, 0) as openingBalance FROM accounts WHERE id IN (?)', [accountIds]);
            const accountMap = new Map(accounts.map((a) => [a.id, Number(a.openingBalance) || 0]));
            // Branch-scoped balance: for non-privileged users, only sum journal movements
            // from their branch (+ shared/null-branch entries) so Branch A's cashier
            // doesn't see Branch B's treasury balance.
            let journalTotals;
            if (branchId && !isPrivileged) {
                [journalTotals] = yield db_1.pool.query(`SELECT jl.accountId, 
                            COALESCE(SUM(jl.debit), 0) as totalDebit, 
                            COALESCE(SUM(jl.credit), 0) as totalCredit
                     FROM journal_lines jl
                     JOIN journal_entries je ON jl.journalId = je.id
                     WHERE jl.accountId IN (?)
                       AND (je.branchId = ? OR je.branchId IS NULL)
                     GROUP BY jl.accountId`, [accountIds, branchId]);
            }
            else {
                [journalTotals] = yield db_1.pool.query(`SELECT accountId, 
                            COALESCE(SUM(debit), 0) as totalDebit, 
                            COALESCE(SUM(credit), 0) as totalCredit
                     FROM journal_lines WHERE accountId IN (?)
                     GROUP BY accountId`, [accountIds]);
            }
            const journalMap = new Map(journalTotals.map((j) => [j.accountId, { d: Number(j.totalDebit), c: Number(j.totalCredit) }]));
            for (const bank of banks) {
                if (bank.accountId) {
                    const opening = accountMap.get(bank.accountId) || 0;
                    const jl = journalMap.get(bank.accountId) || { d: 0, c: 0 };
                    // Expose openingBalance (raw) separately from balance (computed live)
                    // The frontend must send openingBalance back on edit — NOT balance —
                    // to avoid conflating journal movements with the opening balance.
                    bank.openingBalance = opening;
                    bank.balance = opening + jl.d - jl.c;
                }
            }
        }
        res.json(banks);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getBanks');
    }
});
exports.getBanks = getBanks;
const createBank = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const bank = req.body;
        const id = bank.id || (0, crypto_1.randomUUID)();
        let accountId = bank.accountId || null;
        // Resolve branchId: explicit body value > user's branch context > null (shared)
        const authReq = req;
        const bankBranchId = bank.branchId || ((_a = authReq.branchContext) === null || _a === void 0 ? void 0 : _a.branchId) || null;
        const openingBalance = Number((_b = bank.openingBalance) !== null && _b !== void 0 ? _b : bank.balance) || 0;
        // Strict Uniqueness Checks
        if (bank.name) {
            const [dupName] = yield connection.query('SELECT id FROM banks WHERE name = ? AND id != ? LIMIT 1', [bank.name, id]);
            if (dupName.length > 0) {
                yield connection.rollback();
                connection.release();
                return res.status(400).json({ code: 'DUPLICATE_NAME', message: 'هذا الاسم مسجل مسبقاً، يرجى اختيار اسم آخر.' });
            }
        }
        if (bank.accountNumber && String(bank.accountNumber).trim() !== '') {
            const [dupAccount] = yield connection.query('SELECT id, name FROM banks WHERE accountNumber = ? AND id != ? LIMIT 1', [bank.accountNumber, id]);
            if (dupAccount.length > 0) {
                yield connection.rollback();
                connection.release();
                return res.status(400).json({ code: 'DUPLICATE_ACCOUNT', message: `رقم الحساب هذا مسجل مسبقاً للبنك: ${dupAccount[0].name}. يرجى تغييره.` });
            }
        }
        // 1. Auto-create GL Account if no accountId provided (or if the provided one doesn't exist)
        if (!accountId) {
            const bankType = bank.bankType || 'BANK';
            const basePrefix = bankType === 'TREASURY' ? '101' : '102';
            const defaultStart = bankType === 'TREASURY' ? 10100 : 10200;
            const subType = bankType === 'TREASURY' ? 'TREASURY' : 'BANK';
            const accName = bankType === 'TREASURY' ? `الخزينة: ${bank.name}` : `Bank: ${bank.name}`;
            // Generate unique code atomically inside the transaction
            const [maxRows] = yield connection.query("SELECT MAX(CAST(code AS UNSIGNED)) as maxCode FROM accounts WHERE code REGEXP '^[0-9]+$' AND code LIKE ?", [`${basePrefix}%`]);
            const maxCode = Number((_c = maxRows[0]) === null || _c === void 0 ? void 0 : _c.maxCode) || defaultStart;
            const newCode = (maxCode + 1).toString();
            accountId = (0, crypto_1.randomUUID)();
            yield connection.query('INSERT INTO accounts (id, code, name, type, subType, openingBalance, balance, currencyCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [accountId, newCode, accName, 'ASSET', subType, openingBalance, openingBalance, bank.currency || 'EGP']);
            console.log(`✓ Auto-created GL Account: ${newCode} - ${accName} (opening: ${openingBalance})`);
        }
        else {
            // Existing account — sync opening balance if it's currently zero (first-time link)
            if (openingBalance > 0) {
                const [existingAccounts] = yield connection.query('SELECT openingBalance FROM accounts WHERE id = ?', [accountId]);
                const existingAccount = existingAccounts[0];
                if (existingAccount && Number(existingAccount.openingBalance) === 0) {
                    yield connection.query('UPDATE accounts SET openingBalance = ?, balance = ? WHERE id = ?', [openingBalance, openingBalance, accountId]);
                }
            }
            // Sync Currency + subType to GL Account
            yield connection.query('UPDATE accounts SET currencyCode = ?, subType = COALESCE(subType, ?) WHERE id = ?', [bank.currency || 'EGP', 'BANK', accountId]);
        }
        // 1.5 Handle isPrimary (only one primary per bankType)
        const isPrimary = bank.isPrimary ? 1 : 0;
        if (bank.isPrimary) {
            yield connection.query('UPDATE banks SET isPrimary = 0 WHERE bankType = ?', [bank.bankType || 'BANK']);
        }
        // 2. Create Bank record (include branchId for branch isolation + fee config + bankType + new fields)
        yield connection.query(`INSERT INTO banks (id, name, accountNumber, currency, balance, accountId, iban, color, branchId,
             feeEnabled, feeType, feePercentage, feeFixedAmount, feeMinAmount, feeTaxRate, bankType,
             isActive, isPrimary, depositPermissions, withdrawPermissions)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id, bank.name, bank.accountNumber, bank.currency, openingBalance, accountId, bank.iban, bank.color, bankBranchId,
            bank.feeEnabled ? 1 : 0,
            bank.feeType || 'PERCENTAGE',
            Number(bank.feePercentage) || 0,
            Number(bank.feeFixedAmount) || 0,
            Number(bank.feeMinAmount) || 0,
            Number(bank.feeTaxRate) || 0,
            bank.bankType || 'BANK',
            bank.isActive !== undefined ? (bank.isActive ? 1 : 0) : 1,
            isPrimary,
            JSON.stringify(bank.depositPermissions || []),
            JSON.stringify(bank.withdrawPermissions || [])
        ]);
        yield connection.commit();
        const user = ((_d = req.user) === null || _d === void 0 ? void 0 : _d.name) || ((_e = req.user) === null || _e === void 0 ? void 0 : _e.username) || req.body.user || 'System';
        yield (0, auditController_1.logAction)(user, 'BANK', 'CREATE', `إنشاء بنك - ${bank.name}`, `الرصيد: ${openingBalance}, العملة: ${bank.currency}`);
        // Broadcast real-time update for both entities
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'banks', updatedBy: user });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'accounts', updatedBy: user });
        res.status(201).json(Object.assign(Object.assign({}, bank), { id, accountId, openingBalance }));
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'createBank');
    }
    finally {
        connection.release();
    }
});
exports.createBank = createBank;
const updateBank = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        const bank = req.body;
        // 1. Get Old Bank Data
        const [oldBanks] = yield connection.query('SELECT * FROM banks WHERE id = ?', [id]);
        const oldBank = oldBanks[0];
        if (!oldBank)
            throw new Error('Bank not found');
        // Strict Uniqueness Checks
        if (bank.name) {
            const [dupName] = yield connection.query('SELECT id FROM banks WHERE name = ? AND id != ? LIMIT 1', [bank.name, id]);
            if (dupName.length > 0) {
                yield connection.rollback();
                connection.release();
                return res.status(400).json({ code: 'DUPLICATE_NAME', message: 'هذا الاسم مسجل مسبقاً، يرجى اختيار اسم آخر.' });
            }
        }
        if (bank.accountNumber && String(bank.accountNumber).trim() !== '') {
            const [dupAccount] = yield connection.query('SELECT id, name FROM banks WHERE accountNumber = ? AND id != ? LIMIT 1', [bank.accountNumber, id]);
            if (dupAccount.length > 0) {
                yield connection.rollback();
                connection.release();
                return res.status(400).json({ code: 'DUPLICATE_ACCOUNT', message: `رقم الحساب هذا مسجل مسبقاً للبنك: ${dupAccount[0].name}. يرجى تغييره.` });
            }
        }
        // 1.5 Handle isPrimary
        const isPrimary = bank.isPrimary !== undefined ? (bank.isPrimary ? 1 : 0) : (oldBank.isPrimary ? 1 : 0);
        if (isPrimary && !oldBank.isPrimary) {
            yield connection.query('UPDATE banks SET isPrimary = 0 WHERE bankType = ?', [bank.bankType || oldBank.bankType || 'BANK']);
        }
        // 2. Update Bank (preserve branchId for branch isolation + fee config + bankType)
        yield connection.query(`UPDATE banks SET name=?, accountNumber=?, currency=?, accountId=?, iban=?, color=?, branchId=?,
             feeEnabled=?, feeType=?, feePercentage=?, feeFixedAmount=?, feeMinAmount=?, feeTaxRate=?, bankType=?,
             isActive=?, isPrimary=?, depositPermissions=?, withdrawPermissions=?
             WHERE id=?`, [
            bank.name, bank.accountNumber, bank.currency, bank.accountId, bank.iban, bank.color,
            bank.branchId !== undefined ? bank.branchId : oldBank.branchId,
            bank.feeEnabled !== undefined ? (bank.feeEnabled ? 1 : 0) : (oldBank.feeEnabled ? 1 : 0),
            bank.feeType || oldBank.feeType || 'PERCENTAGE',
            Number((_a = bank.feePercentage) !== null && _a !== void 0 ? _a : oldBank.feePercentage) || 0,
            Number((_b = bank.feeFixedAmount) !== null && _b !== void 0 ? _b : oldBank.feeFixedAmount) || 0,
            Number((_c = bank.feeMinAmount) !== null && _c !== void 0 ? _c : oldBank.feeMinAmount) || 0,
            Number((_d = bank.feeTaxRate) !== null && _d !== void 0 ? _d : oldBank.feeTaxRate) || 0,
            bank.bankType || oldBank.bankType || 'BANK',
            bank.isActive !== undefined ? (bank.isActive ? 1 : 0) : (oldBank.isActive !== undefined ? (oldBank.isActive ? 1 : 0) : 1),
            isPrimary,
            JSON.stringify(bank.depositPermissions || (oldBank.depositPermissions ? JSON.parse(oldBank.depositPermissions) : [])),
            JSON.stringify(bank.withdrawPermissions || (oldBank.withdrawPermissions ? JSON.parse(oldBank.withdrawPermissions) : [])),
            id
        ]);
        // 3. Sync Opening Balance Change to GL Account
        // CRITICAL: bank.balance from the request is the COMPUTED live balance (opening + journal movements).
        // We must use bank.openingBalance (the raw value the user typed) for GL account mutations.
        // If openingBalance is not provided (older clients), fall back to bank.balance with a warning.
        // getBanks now returns both bank.openingBalance (raw) and bank.balance (computed)
        // so the frontend can send openingBalance back correctly.
        const intendedOpeningBalance = bank.openingBalance !== undefined
            ? Number(bank.openingBalance)
            : Number(bank.balance) || 0;
        if (bank.accountId && bank.accountId === oldBank.accountId) {
            // Same GL account — compare new opening balance against the GL's own openingBalance
            const [glAccounts] = yield connection.query('SELECT openingBalance FROM accounts WHERE id = ?', [bank.accountId]);
            const currentGLOpeningBalance = Number((_e = glAccounts[0]) === null || _e === void 0 ? void 0 : _e.openingBalance) || 0;
            const diff = intendedOpeningBalance - currentGLOpeningBalance;
            if (diff !== 0) {
                // Adjust openingBalance and live balance by the diff
                yield connection.query('UPDATE accounts SET openingBalance = ?, balance = balance + ? WHERE id = ?', [intendedOpeningBalance, diff, bank.accountId]);
                // REMOVED: Banks balance is now calculated live from GL/journal lines
            }
        }
        else if (bank.accountId && bank.accountId !== oldBank.accountId) {
            // GL account switched — zero out old account's opening balance, apply to new
            let oldGLOpening = 0;
            if (oldBank.accountId) {
                const [oldGlAccounts] = yield connection.query('SELECT openingBalance FROM accounts WHERE id = ?', [oldBank.accountId]);
                oldGLOpening = Number((_f = oldGlAccounts[0]) === null || _f === void 0 ? void 0 : _f.openingBalance) || 0;
                if (oldGLOpening !== 0) {
                    yield connection.query('UPDATE accounts SET openingBalance = 0, balance = balance - ? WHERE id = ?', [oldGLOpening, oldBank.accountId]);
                }
            }
            if (intendedOpeningBalance !== 0) {
                yield connection.query('UPDATE accounts SET openingBalance = ?, balance = balance + ? WHERE id = ?', [intendedOpeningBalance, intendedOpeningBalance, bank.accountId]);
            }
            const bankDiff = intendedOpeningBalance - oldGLOpening;
            if (bankDiff !== 0) {
                // REMOVED: Banks balance is now calculated live from GL/journal lines
            }
        }
        // 3.5. Sync Currency + subType to GL Account (Crucial for Multi-Currency + classification)
        if (bank.accountId) {
            yield connection.query('UPDATE accounts SET currencyCode = ?, subType = COALESCE(subType, ?) WHERE id = ?', [bank.currency || 'EGP', 'BANK', bank.accountId]);
        }
        // 4. CASCADE: Update bank name in all related cheques
        // This ensures name changes are reflected everywhere in the system
        if (bank.name && bank.name !== oldBank.name) {
            try {
                yield connection.query('UPDATE cheques SET bankName = ? WHERE bankName = ?', [bank.name, oldBank.name]);
            }
            catch (e) {
                console.log('Note: Could not update cheques bankName:', e);
            }
        }
        yield connection.commit();
        // Log audit trail
        const user = ((_g = req.user) === null || _g === void 0 ? void 0 : _g.name) || ((_h = req.user) === null || _h === void 0 ? void 0 : _h.username) || req.body.user || 'System';
        yield (0, auditController_1.logAction)(user, 'BANK', 'UPDATE', `تحديث بنك - ${bank.name}`, `الرصيد الجديد: ${bank.balance}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'banks', updatedBy: user });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'cheque', updatedBy: user }); // Cheques may have updated bank names
        res.json(Object.assign(Object.assign({}, bank), { id }));
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'updateBank');
    }
    finally {
        connection.release();
    }
});
exports.updateBank = updateBank;
const resyncBankGL = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        // 1. Get Bank Data with linked GL account
        const [banks] = yield connection.query('SELECT * FROM banks WHERE id = ?', [id]);
        const bank = banks[0];
        if (!bank)
            throw new Error('Bank not found');
        if (!bank.accountId)
            throw new Error('Bank is not linked to any GL Account');
        // 2. Get the linked GL Account for opening balance
        const [accounts] = yield connection.query('SELECT * FROM accounts WHERE id = ?', [bank.accountId]);
        const account = accounts[0];
        if (!account)
            throw new Error('Linked Account not found');
        // 3. Calculate the CORRECT balance from journal entries
        // Scope by bank's branch if assigned — prevents cross-branch movements
        // from inflating the resync. Shared banks (branchId IS NULL) sum globally.
        let journalTotals;
        if (bank.branchId) {
            [journalTotals] = yield connection.query(`
                SELECT 
                    COALESCE(SUM(jl.debit), 0) as totalDebit,
                    COALESCE(SUM(jl.credit), 0) as totalCredit
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journalId = je.id
                WHERE jl.accountId = ?
                  AND (je.branchId = ? OR je.branchId IS NULL)`, [bank.accountId, bank.branchId]);
        }
        else {
            [journalTotals] = yield connection.query(`
                SELECT 
                    COALESCE(SUM(debit), 0) as totalDebit,
                    COALESCE(SUM(credit), 0) as totalCredit
                FROM journal_lines 
                WHERE accountId = ?`, [bank.accountId]);
        }
        const totalDebit = Number((_a = journalTotals[0]) === null || _a === void 0 ? void 0 : _a.totalDebit) || 0;
        const totalCredit = Number((_b = journalTotals[0]) === null || _b === void 0 ? void 0 : _b.totalCredit) || 0;
        const openingBalance = Number(account.openingBalance) || 0;
        // Correct balance = openingBalance + debits - credits
        const calculatedBalance = openingBalance + totalDebit - totalCredit;
        const oldBankBalance = Number(bank.balance) || 0;
        const diff = calculatedBalance - oldBankBalance;
        // 4. Update banks.balance to match the calculated value
        if (diff !== 0) {
            // REMOVED: Banks balance is now calculated live from GL/journal lines
            console.log(`🏦 Bank ${bank.name} GL checked: ${oldBankBalance} → ${calculatedBalance} (diff: ${diff})`);
        }
        // 5. Also fix the accounts.balance to match (prevents future discrepancy alerts)
        const accountBalance = Number(account.balance) || 0;
        if (Math.abs(accountBalance - calculatedBalance) > 0.01) {
            yield connection.query('UPDATE accounts SET balance = ? WHERE id = ?', [calculatedBalance, bank.accountId]);
            console.log(`📊 Fixed GL account balance: ${accountBalance} → ${calculatedBalance}`);
        }
        yield connection.commit();
        // Log audit trail
        const user = ((_c = req.user) === null || _c === void 0 ? void 0 : _c.name) || ((_d = req.user) === null || _d === void 0 ? void 0 : _d.username) || req.body.user || 'System';
        yield (0, auditController_1.logAction)(user, 'BANK', 'RESYNC', `مزامنة رصيد بنك - ${bank.name}`, `${oldBankBalance} → ${calculatedBalance}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'banks', updatedBy: user });
        res.json({
            message: 'Synced successfully',
            oldBalance: oldBankBalance,
            newBalance: calculatedBalance,
            diff
        });
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'resyncBankGL');
    }
    finally {
        connection.release();
    }
});
exports.resyncBankGL = resyncBankGL;
const deleteBank = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        // 1. Get bank data including linked account
        const [banks] = yield connection.query('SELECT id, name, accountId, balance, bankType FROM banks WHERE id = ?', [id]);
        const bank = banks[0];
        if (!bank) {
            connection.release();
            return res.status(404).json({
                code: 'NOT_FOUND',
                message: 'البنك غير موجود'
            });
        }
        // 2. CHECK FOR MOVEMENTS — Prevent deletion if bank has transactions
        const dependencies = [];
        // Check invoices referencing this bank
        try {
            const [invoiceCount] = yield connection.query('SELECT COUNT(*) as cnt FROM invoices WHERE bankAccountId = ?', [id]);
            if (((_a = invoiceCount[0]) === null || _a === void 0 ? void 0 : _a.cnt) > 0) {
                dependencies.push(`${invoiceCount[0].cnt} فاتورة/سند مرتبط`);
            }
        }
        catch ( /* table might not exist */_j) { /* table might not exist */ }
        // Check cheques referencing this bank
        try {
            const [chequeCount] = yield connection.query('SELECT COUNT(*) as cnt FROM cheques WHERE bankId = ?', [id]);
            if (((_b = chequeCount[0]) === null || _b === void 0 ? void 0 : _b.cnt) > 0) {
                dependencies.push(`${chequeCount[0].cnt} شيك مرتبط`);
            }
        }
        catch ( /* table might not exist */_k) { /* table might not exist */ }
        // Check journal lines referencing the bank's GL account
        if (bank.accountId) {
            try {
                const [journalCount] = yield connection.query('SELECT COUNT(*) as cnt FROM journal_lines WHERE accountId = ?', [bank.accountId]);
                if (((_c = journalCount[0]) === null || _c === void 0 ? void 0 : _c.cnt) > 0) {
                    dependencies.push(`${journalCount[0].cnt} قيد محاسبي مرتبط`);
                }
            }
            catch ( /* table might not exist */_l) { /* table might not exist */ }
        }
        // Check bank_transactions table
        try {
            const [btCount] = yield connection.query('SELECT COUNT(*) as cnt FROM bank_transactions WHERE bankId = ?', [id]);
            if (((_d = btCount[0]) === null || _d === void 0 ? void 0 : _d.cnt) > 0) {
                dependencies.push(`${btCount[0].cnt} حركة بنكية`);
            }
        }
        catch ( /* table might not exist */_m) { /* table might not exist */ }
        // If dependencies found, block deletion
        if (dependencies.length > 0) {
            yield connection.rollback();
            connection.release();
            return res.status(400).json({
                code: 'HAS_DEPENDENCIES',
                message: `لا يمكن حذف البنك "${bank.name}" لوجود حركات مرتبطة به:\n• ${dependencies.join('\n• ')}\n\nيرجى حذف أو نقل الحركات أولاً.`
            });
        }
        // Prevent deletion of last treasury/bank of its type
        const [typeCount] = yield connection.query('SELECT COUNT(*) as cnt FROM banks WHERE bankType = ?', [bank.bankType || 'BANK']);
        if (((_e = typeCount[0]) === null || _e === void 0 ? void 0 : _e.cnt) <= 1) {
            yield connection.rollback();
            connection.release();
            return res.status(400).json({
                code: 'LAST_BANK_OF_TYPE',
                message: `لا يمكن حذف آخر ${bank.bankType === 'TREASURY' ? 'خزينة' : 'بنك'} موجود في النظام.`
            });
        }
        // 3. Reverse the opening balance from linked GL account (handles negative/overdraft too)
        const bankBal = Number(bank.balance) || 0;
        if (bank.accountId && bankBal !== 0) {
            yield connection.query('UPDATE accounts SET openingBalance = openingBalance - ?, balance = balance - ? WHERE id = ?', [bankBal, bankBal, bank.accountId]);
            console.log(`📊 Reversed ${bankBal} from account ${bank.accountId}`);
        }
        // 4. Delete the bank
        yield connection.query('DELETE FROM banks WHERE id = ?', [id]);
        yield connection.commit();
        // Log audit trail
        const user = ((_f = req.user) === null || _f === void 0 ? void 0 : _f.name) || ((_g = req.user) === null || _g === void 0 ? void 0 : _g.username) || (((_h = req.body) === null || _h === void 0 ? void 0 : _h.user) || req.query.user) || 'System';
        yield (0, auditController_1.logAction)(user, 'BANK', 'DELETE', `حذف بنك - ${bank.name}`, `تم حذف البنك | رقم المرجع: ${id}${bank.accountId ? ` | تم عكس الرصيد: ${bank.balance}` : ''}`);
        // Broadcast real-time deletion
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'banks', entityId: id, deletedBy: user });
        if (bank.accountId) {
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'accounts', updatedBy: user });
        }
        res.json({ message: 'تم حذف البنك بنجاح' });
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleteBank');
    }
    finally {
        connection.release();
    }
});
exports.deleteBank = deleteBank;
// Get cheques with pagination and filtering
const getCheques = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authReq = req;
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const offset = (page - 1) * limit;
        // Filter parameters
        const status = req.query.status; // PENDING, UNDER_COLLECTION, COLLECTED, etc.
        const type = req.query.type; // RECEIVABLE, PAYABLE
        const partnerId = req.query.partnerId;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const search = req.query.search;
        // Build WHERE clause
        let whereConditions = [];
        let params = [];
        // ═══════════════════════════════════════════
        // MANDATORY: Fiscal Year Hard Boundary
        // ═══════════════════════════════════════════
        if (authReq.fiscalYearFilter) {
            whereConditions.push('dueDate >= ? AND dueDate <= ?');
            params.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        // Branch isolation: non-privileged users see only their branch's cheques
        (0, branchFilter_1.appendBranchFilter)(whereConditions, params, authReq);
        if (status) {
            whereConditions.push('status = ?');
            params.push(status);
        }
        if (type) {
            whereConditions.push('type = ?');
            params.push(type);
        }
        if (partnerId) {
            whereConditions.push('partnerId = ?');
            params.push(partnerId);
        }
        if (startDate) {
            whereConditions.push('dueDate >= ?');
            params.push(startDate);
        }
        if (endDate) {
            whereConditions.push('dueDate <= ?');
            params.push(endDate);
        }
        if (search) {
            // Arabic-normalized tokenized search for cheques
            const arabicNorm = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${col}), 'أ','ا'), 'إ','ا'), 'آ','ا'), 'ة','ه'), 'ى','ي'), 'ؤ','و'), 'ئ','ي')`;
            const tokens = search.trim().split(/\s+/).filter(Boolean);
            if (tokens.length > 0) {
                const tokenConditions = tokens.map(() => {
                    return `( ${arabicNorm('COALESCE(chequeNumber, "")')} LIKE ${arabicNorm('?')} OR ${arabicNorm('COALESCE(partnerName, "")')} LIKE ${arabicNorm('?')} OR ${arabicNorm('COALESCE(bankName, "")')} LIKE ${arabicNorm('?')} )`;
                });
                whereConditions.push(`(${tokenConditions.join(' AND ')})`);
                tokens.forEach(token => {
                    const tokenParam = `%${token}%`;
                    params.push(tokenParam, tokenParam, tokenParam);
                });
            }
        }
        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';
        // Run COUNT and SELECT in parallel (independent queries)
        const [[countResult], [rows]] = yield Promise.all([
            db_1.pool.query(`SELECT COUNT(*) as total FROM cheques ${whereClause}`, params),
            db_1.pool.query(`SELECT * FROM cheques ${whereClause} ORDER BY dueDate DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
        ]);
        const total = countResult[0].total;
        res.json({
            cheques: rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getCheques');
    }
});
exports.getCheques = getCheques;
const updateCheque = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        const cheque = req.body;
        // Assuming we only update status or details, not create via this controller usually (created via transaction)
        // But for completeness:
        yield connection.query('UPDATE cheques SET status=?, collectionDate=? WHERE id=?', [cheque.status, cheque.collectionDate ? new Date(cheque.collectionDate) : null, id]);
        yield connection.commit();
        // Log audit trail
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || req.body.user || 'System';
        yield (0, auditController_1.logAction)(user, 'CHEQUE', 'UPDATE', `تحديث شيك - ${cheque.number || id}`, `الحالة الجديدة: ${cheque.status}`);
        res.json(Object.assign(Object.assign({}, cheque), { id }));
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.updateCheque = updateCheque;
/**
 * Recalculate all bank balances from journal entries
 * Uses the same logic as bank statement: openingBalance + sum(debits) - sum(credits)
 * POST /api/treasury/banks/recalculate
 */
const recalculateBankBalances = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        const results = [];
        // 1. Get all banks with their linked GL accounts
        const [banks] = yield connection.query(`SELECT b.id, b.name, b.balance as currentBalance, b.accountId,
                    COALESCE(a.openingBalance, 0) as openingBalance,
                    a.name as glAccountName
             FROM banks b
             LEFT JOIN accounts a ON b.accountId = a.id`);
        console.log(`🏦 Recalculating ${banks.length} banks...`);
        // Get ALL journal totals in a single query (instead of 1 query per bank)
        const accountIds = banks.filter((b) => b.accountId).map((b) => b.accountId);
        let journalTotalsMap = new Map();
        if (accountIds.length > 0) {
            const [journalRows] = yield connection.query(`SELECT accountId,
                        COALESCE(SUM(debit), 0) as totalDebit,
                        COALESCE(SUM(credit), 0) as totalCredit
                 FROM journal_lines
                 WHERE accountId IN (?)
                 GROUP BY accountId`, [accountIds]);
            for (const row of journalRows) {
                journalTotalsMap.set(row.accountId, {
                    totalDebit: Number(row.totalDebit) || 0,
                    totalCredit: Number(row.totalCredit) || 0,
                });
            }
        }
        for (const bank of banks) {
            if (!bank.accountId) {
                console.log(`⚠️ ${bank.name}: No linked GL account, skipping`);
                continue;
            }
            const totals = journalTotalsMap.get(bank.accountId) || { totalDebit: 0, totalCredit: 0 };
            const openingBalance = Number(bank.openingBalance) || 0;
            // Bank balance = openingBalance + debits - credits
            const calculatedBalance = openingBalance + totals.totalDebit - totals.totalCredit;
            const oldBalance = Number(bank.currentBalance) || 0;
            const diff = calculatedBalance - oldBalance;
            console.log(`${bank.name}: opening=${openingBalance}, debit=${totals.totalDebit}, credit=${totals.totalCredit}, calculated=${calculatedBalance}, old=${oldBalance}`);
            if (Math.abs(diff) > 0.01) {
                // REMOVED: Banks balance is now calculated live from GL/journal lines
                // We no longer physically write the balance to banks table
                results.push({
                    bankId: bank.id,
                    name: bank.name,
                    oldBalance,
                    newBalance: calculatedBalance,
                    diff
                });
                console.log(`✅ ${bank.name}: Updated ${oldBalance} → ${calculatedBalance}`);
            }
        }
        yield connection.commit();
        // Log audit trail
        if (results.length > 0) {
            yield (0, auditController_1.logAction)(user, 'BANK', 'RECALCULATE', `إعادة حساب أرصدة البنوك`, `تم تحديث ${results.length} بنك`);
        }
        // Broadcast real-time update
        if (results.length > 0) {
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'banks', updatedBy: user });
        }
        res.json({
            success: true,
            message: `تم إعادة حساب أرصدة ${results.length} بنك`,
            updated: results
        });
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'recalculateBankBalances');
    }
    finally {
        connection.release();
    }
});
exports.recalculateBankBalances = recalculateBankBalances;
/**
 * Cleanup duplicate/orphaned bank GL accounts created by the old frontend race condition.
 * POST /api/treasury/cleanup-accounts
 */
const cleanupDuplicateBankAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        // 1. Find all "Bank: %" accounts NOT linked to any bank
        const [orphaned] = yield connection.query(`
            SELECT a.id, a.code, a.name, a.openingBalance, a.balance 
            FROM accounts a 
            WHERE a.name LIKE 'Bank: %' 
              AND a.id NOT IN (SELECT COALESCE(accountId, '') FROM banks)
        `);
        const deleted = [];
        for (const acc of orphaned) {
            // Only delete if no journal entries exist
            const [journalCheck] = yield connection.query('SELECT COUNT(*) as cnt FROM journal_lines WHERE accountId = ?', [acc.id]);
            if (Number((_a = journalCheck[0]) === null || _a === void 0 ? void 0 : _a.cnt) === 0) {
                yield connection.query('DELETE FROM accounts WHERE id = ?', [acc.id]);
                deleted.push({ id: acc.id, code: acc.code, name: acc.name, balance: Number(acc.balance) });
            }
        }
        // 2. Fix duplicate codes
        const [dupCodes] = yield connection.query(`
            SELECT code, COUNT(*) as cnt FROM accounts 
            WHERE code REGEXP '^[0-9]+$'
            GROUP BY code HAVING cnt > 1
        `);
        const recoded = [];
        for (const dup of dupCodes) {
            const [dupes] = yield connection.query('SELECT id, code, name, openingBalance FROM accounts WHERE code = ? ORDER BY openingBalance DESC, id', [dup.code]);
            // Keep the first (highest balance), recode the rest
            for (let i = 1; i < dupes.length; i++) {
                const [maxRows] = yield connection.query("SELECT MAX(CAST(code AS UNSIGNED)) as maxCode FROM accounts WHERE code REGEXP '^[0-9]+$' AND code LIKE '1%'");
                const newCode = (Number(((_b = maxRows[0]) === null || _b === void 0 ? void 0 : _b.maxCode) || 10200) + 1).toString();
                yield connection.query('UPDATE accounts SET code = ? WHERE id = ?', [newCode, dupes[i].id]);
                recoded.push({ id: dupes[i].id, oldCode: dup.code, newCode, name: dupes[i].name });
            }
        }
        yield connection.commit();
        const user = ((_c = req.user) === null || _c === void 0 ? void 0 : _c.name) || 'System';
        yield (0, auditController_1.logAction)(user, 'BANK', 'CLEANUP', `تنظيف حسابات مكررة - حذف ${deleted.length}، إعادة ترقيم ${recoded.length}`, JSON.stringify({ deleted: deleted.length, recoded: recoded.length }));
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'accounts', updatedBy: user });
        res.json({
            success: true,
            message: `تم تنظيف ${deleted.length} حساب مكرر وإعادة ترقيم ${recoded.length}`,
            deleted,
            recoded,
            orphanedTotal: orphaned.length,
            skippedWithJournals: orphaned.length - deleted.length
        });
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'cleanupDuplicateBankAccounts');
    }
    finally {
        connection.release();
    }
});
exports.cleanupDuplicateBankAccounts = cleanupDuplicateBankAccounts;
