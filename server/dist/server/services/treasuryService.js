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
exports.preflightPayrollApproval = exports.getSuggestedPayrollAccount = exports.recordPayrollTreasuryOutflow = exports.verifyTreasuryForPayroll = exports.getPayrollCycleTotal = exports.getTreasuryBalance = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const TREASURY_ACCOUNT_TYPES = ['CASH', 'BANK', 'TREASURY'];
/**
 * Get available treasury balance for payroll
 * Considers only cash and bank accounts marked as treasury accounts
 */
const getTreasuryBalance = (branchId) => __awaiter(void 0, void 0, void 0, function* () {
    let query = `
        SELECT 
          a.id as accountId,
          a.name as accountName,
          COALESCE(b.balance, a.balance) as balance,
          a.type
        FROM accounts a
        JOIN banks b ON b.accountId = a.id
        WHERE b.isActive = 1 
          AND a.isActive = 1
          AND a.type IN ('CASH', 'BANK', 'TREASURY')
    `;
    const params = [];
    if (branchId) {
        query += ` AND (b.branchId = ? OR b.branchId IS NULL)`;
        params.push(branchId);
    }
    query += ` ORDER BY COALESCE(b.balance, a.balance) DESC`;
    const [accounts] = yield db_1.pool.query(query, params);
    const accountStatuses = accounts.map((acc) => ({
        accountId: acc.accountId,
        accountName: acc.accountName,
        balance: parseFloat(acc.balance) || 0,
        type: acc.type
    }));
    const total = accountStatuses.reduce((sum, acc) => sum + acc.balance, 0);
    return { total, accounts: accountStatuses };
});
exports.getTreasuryBalance = getTreasuryBalance;
/**
 * Get payroll cycle total amount
 */
const getPayrollCycleTotal = (cycleId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const [result] = yield db_1.pool.query(`
        SELECT COALESCE(SUM(netSalary), 0) as total
        FROM payroll_entries
        WHERE payrollId = ? AND status IN ('PENDING', 'PAID')
    `, [cycleId]);
    return parseFloat((_a = result[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
});
exports.getPayrollCycleTotal = getPayrollCycleTotal;
/**
 * Verify treasury balance before payroll approval
 * Returns detailed breakdown of available funds and any shortfall
 */
const verifyTreasuryForPayroll = (cycleId_1, branchId_1, ...args_1) => __awaiter(void 0, [cycleId_1, branchId_1, ...args_1], void 0, function* (cycleId, branchId, safetyMarginPercent = 10, preFetchedBalance) {
    const warnings = [];
    // Get payroll total
    const totalPayrollAmount = yield (0, exports.getPayrollCycleTotal)(cycleId);
    // Auto-detect branch if not provided
    let finalBranchId = branchId;
    if (!finalBranchId) {
        const [rows] = yield db_1.pool.query(`
            SELECT DISTINCT e.branchId 
            FROM payroll_entries pe
            JOIN employees e ON pe.employeeId = e.id
            WHERE pe.payrollId = ? AND e.branchId IS NOT NULL
        `, [cycleId]);
        if (rows.length === 1) {
            finalBranchId = rows[0].branchId;
        }
    }
    // Get treasury balance
    const { total: availableBalance, accounts } = preFetchedBalance || (yield (0, exports.getTreasuryBalance)(finalBranchId));
    // Calculate shortfall (if any)
    const shortfall = Math.max(0, totalPayrollAmount - availableBalance);
    const canProceed = shortfall === 0;
    // Add warnings based on conditions
    if (shortfall > 0) {
        warnings.push(`Treasury balance is short by ${shortfall.toLocaleString()} EGP`);
    }
    // Check safety margin (percentage of available balance)
    const safetyMargin = availableBalance * (safetyMarginPercent / 100);
    const remainingAfterPayroll = availableBalance - totalPayrollAmount;
    if (remainingAfterPayroll < safetyMargin && canProceed) {
        warnings.push(`Treasury will have only ${remainingAfterPayroll.toLocaleString()} EGP remaining (below ${safetyMarginPercent}% safety margin)`);
    }
    // Check for low individual account balances
    const lowAccounts = accounts.filter(acc => acc.balance < totalPayrollAmount * 0.1 && acc.balance > 0);
    if (lowAccounts.length > 0) {
        warnings.push(`${lowAccounts.length} treasury account(s) have low balances`);
    }
    return {
        canProceed,
        totalPayrollAmount: Number(totalPayrollAmount.toFixed(2)),
        availableBalance: Number(availableBalance.toFixed(2)),
        shortfall: Number(shortfall.toFixed(2)),
        accounts,
        warnings
    };
});
exports.verifyTreasuryForPayroll = verifyTreasuryForPayroll;
/**
 * Record treasury transaction after payroll approval
 * Creates outflow entries for each treasury account used
 */
const recordPayrollTreasuryOutflow = (cycleId, payingAccountId, amount, approvedBy) => __awaiter(void 0, void 0, void 0, function* () {
    const transactionId = (0, crypto_1.randomUUID)();
    // Get cycle details for description
    const [cycles] = yield db_1.pool.query('SELECT month, year FROM payroll_cycles WHERE id = ?', [cycleId]);
    const cycle = cycles[0] || { month: 0, year: 0 };
    const description = `صرف رواتب شهر ${cycle.month}/${cycle.year}`;
    const connection = yield db_1.pool.getConnection();
    try {
        yield connection.beginTransaction();
        // Create treasury entry
        yield connection.query(`
            INSERT INTO treasury_entries 
            (id, accountId, type, amount, description, referenceId, referenceType, createdBy, createdAt)
            VALUES (?, ?, 'OUTFLOW', ?, ?, ?, 'PAYROLL', ?, NOW())
        `, [transactionId, payingAccountId, amount, description, cycleId, approvedBy]);
        // Update banks table (treasury balance)
        yield connection.query(`
            UPDATE banks 
            SET balance = balance - ?
            WHERE accountId = ?
        `, [amount, payingAccountId]);
        // Update account balance (GL balance)
        yield connection.query(`
            UPDATE accounts 
            SET balance = balance - ?
            WHERE id = ?
        `, [amount, payingAccountId]);
        yield connection.commit();
        return transactionId;
    }
    catch (e) {
        yield connection.rollback();
        throw e;
    }
    finally {
        connection.release();
    }
});
exports.recordPayrollTreasuryOutflow = recordPayrollTreasuryOutflow;
/**
 * Get suggested account for payroll payment
 * Returns the account with the highest balance that can cover the payroll
 */
const getSuggestedPayrollAccount = (totalAmount, preFetchedAccounts, branchId) => __awaiter(void 0, void 0, void 0, function* () {
    const accounts = preFetchedAccounts || (yield (0, exports.getTreasuryBalance)(branchId)).accounts;
    if (accounts.length === 0) {
        return null;
    }
    // Find the first account that can cover the whole payroll
    const suitable = accounts.find(acc => acc.balance >= totalAmount);
    if (suitable) {
        return suitable;
    }
    // If no single account can cover it, but the total balance can cover it, suggest a virtual SPLIT account
    const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
    if (totalBalance >= totalAmount) {
        return {
            accountId: 'SPLIT',
            accountName: `حسابات متعددة (موزع على ${accounts.length} حسابات)`,
            balance: totalBalance,
            type: 'SPLIT'
        };
    }
    // If no suitable accounts can cover it, return the one with highest balance
    return accounts[0] || null;
});
exports.getSuggestedPayrollAccount = getSuggestedPayrollAccount;
/**
 * Pre-flight check before payroll approval
 * Combines all verification steps into a single result
 */
const preflightPayrollApproval = (cycleId, branchId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const pendingIssues = [];
    // Auto-detect branch if not provided
    let finalBranchId = branchId;
    if (!finalBranchId) {
        const [rows] = yield db_1.pool.query(`
            SELECT DISTINCT e.branchId 
            FROM payroll_entries pe
            JOIN employees e ON pe.employeeId = e.id
            WHERE pe.payrollId = ? AND e.branchId IS NOT NULL
        `, [cycleId]);
        if (rows.length === 1) {
            finalBranchId = rows[0].branchId;
        }
    }
    // Fetch treasury balance ONCE
    const treasuryBalance = yield (0, exports.getTreasuryBalance)(finalBranchId);
    // Check treasury balance
    const treasury = yield (0, exports.verifyTreasuryForPayroll)(cycleId, finalBranchId, 10, treasuryBalance);
    if (!treasury.canProceed) {
        pendingIssues.push('Insufficient treasury balance');
    }
    // Get suggested paying account
    const suggestedAccount = yield (0, exports.getSuggestedPayrollAccount)(treasury.totalPayrollAmount, treasuryBalance.accounts);
    if (!suggestedAccount) {
        pendingIssues.push('No treasury account available');
    }
    // Check for any rejected entries
    const [rejectedEntries] = yield db_1.pool.query(`
        SELECT COUNT(*) as count 
        FROM payroll_entries 
        WHERE payrollId = ? AND status = 'REJECTED'
    `, [cycleId]);
    if (((_a = rejectedEntries[0]) === null || _a === void 0 ? void 0 : _a.count) > 0) {
        pendingIssues.push(`${rejectedEntries[0].count} payroll entries are rejected`);
    }
    // Check cycle status
    const [cycle] = yield db_1.pool.query('SELECT status FROM payroll_cycles WHERE id = ?', [cycleId]);
    if (((_b = cycle[0]) === null || _b === void 0 ? void 0 : _b.status) === 'APPROVED' || ((_c = cycle[0]) === null || _c === void 0 ? void 0 : _c.status) === 'PAID') {
        pendingIssues.push('Payroll cycle already approved or paid');
    }
    return {
        canApprove: pendingIssues.length === 0 && treasury.canProceed,
        treasury,
        suggestedAccount,
        pendingIssues
    };
});
exports.preflightPayrollApproval = preflightPayrollApproval;
exports.default = {
    getTreasuryBalance: exports.getTreasuryBalance,
    getPayrollCycleTotal: exports.getPayrollCycleTotal,
    verifyTreasuryForPayroll: exports.verifyTreasuryForPayroll,
    recordPayrollTreasuryOutflow: exports.recordPayrollTreasuryOutflow,
    getSuggestedPayrollAccount: exports.getSuggestedPayrollAccount,
    preflightPayrollApproval: exports.preflightPayrollApproval
};
