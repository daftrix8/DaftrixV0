"use strict";
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
exports.getLoanHistory = exports.getLoanConstraints = exports.repayLoan = exports.settleLoanEarly = exports.skipLoanInstallment = exports.getEmployeeLoanInstallments = exports.getLoanInstallments = exports.createLoanWithInstallments = exports.checkLoanEligibility = exports.deleteAdvance = exports.updateAdvance = exports.createAdvance = exports.getAdvances = void 0;
const db_1 = require("../../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../../utils/errorHandler");
const loanService = __importStar(require("../../services/loanService"));
const getAdvances = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, status, grouped } = req.query;
    try {
        if (grouped === 'true') {
            const [summaries] = yield db_1.pool.query(`
                SELECT 
                    e.id as employeeId,
                    e.fullName as employeeName,
                    e.jobTitle,
                    e.department,
                    COUNT(a.id) as advanceCount,
                    COALESCE(SUM(a.amount), 0) as totalTaken,
                    COALESCE(SUM(a.remainingAmount), 0) as totalRemaining,
                    COALESCE(SUM(a.totalPaid), 0) as totalPaid,
                    SUM(CASE WHEN a.status = 'ACTIVE' THEN 1 ELSE 0 END) as activeCount,
                    MAX(a.issueDate) as lastAdvanceDate
                FROM employees e
                INNER JOIN employee_advances a ON e.id = a.employeeId
                GROUP BY e.id, e.fullName, e.jobTitle, e.department
                HAVING COUNT(a.id) > 0
                ORDER BY COALESCE(SUM(a.remainingAmount), 0) DESC, e.fullName
            `);
            const parsedSummaries = summaries.map((s) => (Object.assign(Object.assign({}, s), { advanceCount: Number(s.advanceCount) || 0, totalTaken: Number(s.totalTaken) || 0, totalRemaining: Number(s.totalRemaining) || 0, totalPaid: Number(s.totalPaid) || 0, activeCount: Number(s.activeCount) || 0 })));
            return res.json(parsedSummaries);
        }
        let query = `
          SELECT a.*, e.fullName as employeeName, e.jobTitle, e.department
          FROM employee_advances a
          JOIN employees e ON a.employeeId = e.id
          WHERE 1=1
        `;
        const params = [];
        if (employeeId) {
            query += ` AND a.employeeId = ?`;
            params.push(employeeId);
        }
        if (status) {
            query += ` AND a.status = ?`;
            params.push(status);
        }
        query += ` ORDER BY a.issueDate DESC`;
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching advances:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch advances');
    }
});
exports.getAdvances = getAdvances;
/**
 * Helper to create accounting entry for advances/loans.
 * Fix #6: Refuses silent auto-creation of account '1120'.
 */
const createAdvanceAccountingEntry = (connection, advanceId, amount, employeeId, issueDate, paymentMethod, financialAccountId, type, user) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // 1. Get Employee Name
    const [employees] = yield connection.query('SELECT fullName as name FROM employees WHERE id = ?', [employeeId]);
    const employeeName = ((_a = employees[0]) === null || _a === void 0 ? void 0 : _a.name) || 'Employee';
    // 2. Find "Employee Advances/Loans" Account (Debit)
    const [allAccounts] = yield connection.query('SELECT id, code, name FROM accounts');
    let loanAccount = allAccounts.find((a) => (a.name && (a.name.includes('سلف') || a.name.includes('قرض'))) ||
        (a.name && (a.name.toLowerCase().includes('loan') || a.name.toLowerCase().includes('advance'))));
    if (!loanAccount) {
        loanAccount = allAccounts.find((a) => a.code && String(a.code).startsWith('112'));
    }
    if (!loanAccount) {
        loanAccount = allAccounts.find((a) => a.code && String(a.code).startsWith('104'));
    }
    // Fix #6: Expose clear error instead of silent creation of GL account '1120'
    if (!loanAccount) {
        throw new Error('حساب سلف وقروض الموظفين غير موجود بشجرة الحسابات. يرجى تهيئة الحساب أولاً.');
    }
    const loanAccountId = loanAccount.id;
    const loanAccountName = loanAccount.name;
    // 3. Identify Financial Account (Credit) = Treasury/Bank
    let creditAccountId = null;
    let creditAccountName = '';
    if (paymentMethod === 'BANK') {
        const [banks] = yield connection.query('SELECT id, name, accountId FROM banks WHERE id = ?', [financialAccountId]);
        if (banks[0]) {
            creditAccountId = banks[0].accountId;
            creditAccountName = banks[0].name;
        }
    }
    else {
        creditAccountId = financialAccountId;
        const creditAccount = allAccounts.find((a) => a.id === financialAccountId);
        creditAccountName = (creditAccount === null || creditAccount === void 0 ? void 0 : creditAccount.name) || 'الخزينة';
    }
    if (creditAccountId && loanAccountId) {
        const journalId = (0, crypto_1.randomUUID)();
        const description = `صرف ${type === 'LOAN' ? 'قرض' : 'سلفة'} للموظف ${employeeName}`;
        yield connection.query(`
            INSERT INTO journal_entries (id, date, description, referenceId, createdBy)
            VALUES (?, ?, ?, ?, ?)
        `, [
            journalId,
            issueDate,
            description,
            advanceId,
            (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) || 'System'
        ]);
        yield connection.query(`
            INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
            VALUES (?, ?, ?, ?, 0)
        `, [journalId, loanAccountId, loanAccountName, amount]);
        yield connection.query(`
            INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
            VALUES (?, ?, ?, 0, ?)
        `, [journalId, creditAccountId, creditAccountName, amount]);
        yield connection.query('UPDATE accounts SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [amount, loanAccountId]);
        yield connection.query('UPDATE accounts SET balance = COALESCE(balance, 0) - ? WHERE id = ?', [amount, creditAccountId]);
    }
    else {
        throw new Error('تعذر إنشاء القيد المحاسبي: حساب الخزينة/البنك غير مرتبط بحساب محاسبي. يرجى مراجعة إعدادات الحسابات.');
    }
});
const createAdvance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, type, amount, reason, issueDate, monthlyDeduction, paymentMethod, financialAccountId } = req.body;
    const user = req.user;
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({
            code: 'INVALID_AMOUNT',
            message: 'مبلغ السلفة يجب أن يكون أكبر من الصفر'
        });
    }
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const id = (0, crypto_1.randomUUID)();
        yield connection.query(`
          INSERT INTO employee_advances (
            id, employeeId, type, amount, reason, issueDate, 
            monthlyDeduction, remainingAmount, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `, [
            id, employeeId, type || 'ADVANCE', amount, reason, issueDate,
            monthlyDeduction || 0, amount
        ]);
        if (paymentMethod && financialAccountId) {
            yield createAdvanceAccountingEntry(connection, id, parseFloat(amount), employeeId, issueDate, paymentMethod, financialAccountId, type || 'ADVANCE', user);
        }
        yield connection.commit();
        res.status(201).json({ id, message: 'Advance created successfully' });
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error creating advance:', error);
        return res.status(400).json({ error: error.message || 'Error creating advance' });
    }
    finally {
        connection.release();
    }
});
exports.createAdvance = createAdvance;
const updateAdvance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { type, amount, reason, issueDate, monthlyDeduction, status, totalPaid, remainingAmount } = req.body;
    try {
        yield db_1.pool.query(`
          UPDATE employee_advances SET
            type = COALESCE(?, type),
            amount = COALESCE(?, amount),
            reason = COALESCE(?, reason),
            issueDate = COALESCE(?, issueDate),
            monthlyDeduction = COALESCE(?, monthlyDeduction),
            status = COALESCE(?, status),
            totalPaid = COALESCE(?, totalPaid),
            remainingAmount = COALESCE(?, remainingAmount)
          WHERE id = ?
        `, [type, amount, reason, issueDate, monthlyDeduction, status, totalPaid, remainingAmount, id]);
        res.json({ message: 'Advance updated successfully' });
    }
    catch (error) {
        console.error('Error updating advance:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'update advance');
    }
});
exports.updateAdvance = updateAdvance;
const deleteAdvance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const [journalRows] = yield conn.query('SELECT id FROM journal_entries WHERE referenceId = ?', [id]);
        if (journalRows.length > 0) {
            const journalId = journalRows[0].id;
            const [lines] = yield conn.query('SELECT accountId, debit, credit FROM journal_lines WHERE journalId = ?', [journalId]);
            for (const line of lines) {
                yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) - ? + ? WHERE id = ?', [line.debit, line.credit, line.accountId]);
            }
            yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [journalId]);
            yield conn.query('DELETE FROM journal_entries WHERE id = ?', [journalId]);
        }
        yield conn.query('DELETE FROM loan_installments WHERE loanId = ?', [id]).catch(() => { });
        yield conn.query('DELETE FROM loan_history WHERE loanId = ?', [id]).catch(() => { });
        yield conn.query('DELETE FROM employee_advances WHERE id = ?', [id]);
        yield conn.commit();
        res.json({ message: 'تم حذف السلفة وعكس القيد المحاسبي بنجاح' });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error deleting advance with reversal:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete advance');
    }
    finally {
        conn.release();
    }
});
exports.deleteAdvance = deleteAdvance;
const checkLoanEligibility = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, amount, numberOfMonths } = req.body;
    try {
        const result = yield loanService.checkLoanEligibility(employeeId, parseFloat(amount), parseInt(numberOfMonths));
        res.json(result);
    }
    catch (error) {
        console.error('Error checking loan eligibility:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'check loan eligibility');
    }
});
exports.checkLoanEligibility = checkLoanEligibility;
const createLoanWithInstallments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, type, loanType, amount, reason, issueDate: rawIssueDate, startDate, numberOfMonths, numberOfInstallments, allowSkip, maxSkipCount, paymentMethod, financialAccountId } = req.body;
    const issueDate = rawIssueDate || startDate || new Date().toISOString().split('T')[0];
    const numMonthsRaw = numberOfMonths || numberOfInstallments;
    const user = req.user;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const eligibility = yield loanService.checkLoanEligibility(employeeId, parseFloat(amount), parseInt(numMonthsRaw) || 1);
        if (!eligibility.eligible && loanType === 'LOAN') {
            yield connection.rollback();
            return res.status(400).json({
                error: 'لا يمكن منح القرض',
                reasons: eligibility.reasons
            });
        }
        const id = (0, crypto_1.randomUUID)();
        const numMonths = parseInt(numMonthsRaw) || 1;
        const monthlyDeduction = parseFloat(amount) / numMonths;
        yield connection.query(`
            INSERT INTO employee_advances (
                id, employeeId, type, loanType, amount, reason, 
                issueDate, requestDate, monthlyDeduction, numberOfInstallments,
                allowSkip, maxSkipCount, remainingAmount, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `, [
            id, employeeId, type || 'ADVANCE', loanType || 'ADVANCE',
            amount, reason, issueDate, issueDate, monthlyDeduction,
            numMonths, allowSkip !== false, maxSkipCount || 2, amount
        ]);
        // Fix #13: pass transactional connection to prevent connection nested leaks
        if (loanType === 'LOAN' || numMonths > 1) {
            yield loanService.generateInstallments(id, employeeId, parseFloat(amount), numMonths, new Date(issueDate), connection);
        }
        if (paymentMethod && financialAccountId) {
            yield createAdvanceAccountingEntry(connection, id, parseFloat(amount), employeeId, issueDate, paymentMethod, financialAccountId, loanType || 'ADVANCE', user);
        }
        yield connection.commit();
        res.status(201).json({
            id,
            message: loanType === 'LOAN' ? 'تم إنشاء القرض بنجاح' : 'تم إنشاء السلفة بنجاح'
        });
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error creating loan:', error);
        return res.status(400).json({ error: error.message || 'Error creating loan' });
    }
    finally {
        connection.release();
    }
});
exports.createLoanWithInstallments = createLoanWithInstallments;
const getLoanInstallments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loanId } = req.params;
    try {
        const [installments] = yield db_1.pool.query(`
            SELECT * FROM loan_installments
            WHERE loanId = ?
            ORDER BY installmentNumber
        `, [loanId]);
        res.json(installments);
    }
    catch (error) {
        console.error('Error fetching loan installments:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch loan installments');
    }
});
exports.getLoanInstallments = getLoanInstallments;
const getEmployeeLoanInstallments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId } = req.params;
    try {
        const [rows] = yield db_1.pool.query(`
            SELECT li.*, ea.loanType, ea.type, ea.issueDate AS loanStartDate, ea.amount AS loanAmount
            FROM loan_installments li
            JOIN employee_advances ea ON li.loanId = ea.id
            WHERE ea.employeeId = ?
            ORDER BY li.dueDate, li.installmentNumber
        `, [employeeId]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching employee loan installments:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch employee loan installments');
    }
});
exports.getEmployeeLoanInstallments = getEmployeeLoanInstallments;
const skipLoanInstallment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { installmentId } = req.params;
    const { reason, userId } = req.body;
    try {
        yield loanService.skipInstallment(installmentId, reason, userId);
        res.json({ message: 'تم تأجيل القسط بنجاح' });
    }
    catch (error) {
        console.error('Error skipping installment:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'skip installment');
    }
});
exports.skipLoanInstallment = skipLoanInstallment;
const settleLoanEarly = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loanId } = req.params;
    const { settlementAmount, userId, notes } = req.body;
    try {
        const parsedAmount = parseFloat(settlementAmount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ error: 'مبلغ التسوية غير صحيح' });
        }
        yield loanService.settleLoanEarly(loanId, parsedAmount, userId, notes);
        res.json({ message: 'تم تسوية القرض بنجاح' });
    }
    catch (error) {
        console.error('Error settling loan:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'settle loan');
    }
});
exports.settleLoanEarly = settleLoanEarly;
const repayLoan = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { loanId } = req.params;
    const { amount, notes } = req.body;
    const user = req.user;
    const userId = (user === null || user === void 0 ? void 0 : user.id) || (user === null || user === void 0 ? void 0 : user.name) || 'system';
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const parsedRepayAmount = parseFloat(amount);
        if (isNaN(parsedRepayAmount) || parsedRepayAmount <= 0) {
            yield conn.rollback();
            return res.status(400).json({ error: 'مبلغ السداد غير صحيح' });
        }
        // Pass the transactional connection to service
        const result = yield loanService.repayLoan(loanId, parsedRepayAmount, userId, notes);
        // Create accounting entry
        try {
            const [loans] = yield conn.query('SELECT employeeId FROM employee_advances WHERE id = ?', [loanId]);
            const employeeId = (_a = loans[0]) === null || _a === void 0 ? void 0 : _a.employeeId;
            let employeeName = 'موظف';
            if (employeeId) {
                const [emps] = yield conn.query('SELECT fullName as name FROM employees WHERE id = ?', [employeeId]);
                employeeName = ((_b = emps[0]) === null || _b === void 0 ? void 0 : _b.name) || 'موظف';
            }
            const [allAccounts] = yield conn.query('SELECT id, code, name FROM accounts');
            let loanAccount = allAccounts.find((a) => (a.name && (a.name.includes('سلف') || a.name.includes('قرض'))) ||
                (a.name && (a.name.toLowerCase().includes('loan') || a.name.toLowerCase().includes('advance'))));
            if (!loanAccount) {
                loanAccount = allAccounts.find((a) => a.code && String(a.code).startsWith('112'));
            }
            if (!loanAccount) {
                loanAccount = allAccounts.find((a) => a.code && String(a.code).startsWith('104'));
            }
            let cashAccount = allAccounts.find((a) => a.name && (a.name.includes('خزينة') || a.name.includes('الخزنة') || a.name.includes('صندوق')));
            if (!cashAccount) {
                cashAccount = allAccounts.find((a) => a.name && (a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('treasury')));
            }
            if (!cashAccount) {
                cashAccount = allAccounts.find((a) => a.code && String(a.code).startsWith('101'));
            }
            if (loanAccount && cashAccount) {
                const journalId = (0, crypto_1.randomUUID)();
                const description = `سداد سلفة/قرض - ${employeeName}`;
                const today = new Date().toISOString().split('T')[0];
                yield conn.query(`
                    INSERT INTO journal_entries (id, date, description, referenceId, createdBy)
                    VALUES (?, ?, ?, ?, ?)
                `, [journalId, today, description, `REPAY-${loanId.substring(0, 30)}`, (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) || 'System']);
                yield conn.query(`
                    INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
                    VALUES (?, ?, ?, ?, 0)
                `, [journalId, cashAccount.id, cashAccount.name, parsedRepayAmount]);
                yield conn.query(`
                    INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
                    VALUES (?, ?, ?, 0, ?)
                `, [journalId, loanAccount.id, loanAccount.name, parsedRepayAmount]);
                yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [parsedRepayAmount, cashAccount.id]);
                yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) - ? WHERE id = ?', [parsedRepayAmount, loanAccount.id]);
            }
        }
        catch (jeError) {
            console.error('Error creating journal entry on loan repay:', jeError.message);
        }
        yield conn.commit();
        res.json(Object.assign({ message: result.isCompleted ? 'تم سداد السلفة بالكامل' : 'تم تسجيل السداد بنجاح' }, result));
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error repaying loan:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'repay loan');
    }
    finally {
        conn.release(); // Fix #1: always release connection
    }
});
exports.repayLoan = repayLoan;
const getLoanConstraints = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const constraints = yield loanService.getLoanConstraints();
        res.json(constraints);
    }
    catch (error) {
        console.error('Error fetching loan constraints:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch loan constraints');
    }
});
exports.getLoanConstraints = getLoanConstraints;
const getLoanHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loanId } = req.params;
    try {
        const [history] = yield db_1.pool.query(`
            SELECT lh.*, u.username as performedByName
            FROM loan_history lh
            LEFT JOIN users u ON lh.performedBy = u.id
            WHERE lh.loanId = ?
            ORDER BY lh.createdAt DESC
        `, [loanId]);
        res.json(history);
    }
    catch (error) {
        console.error('Error fetching loan history:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch loan history');
    }
});
exports.getLoanHistory = getLoanHistory;
