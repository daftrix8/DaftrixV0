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
/**
 * Get available treasury balance for payroll
 * Considers only cash and bank accounts marked as treasury accounts
 */
const getTreasuryBalance = (branchId) => __awaiter(void 0, void 0, void 0, function* () {
    // When branchId is provided, only consider GL accounts linked to banks in that branch.
    // This prevents payroll from counting other branches' treasury funds.
    let accounts;
    if (branchId) {
        [accounts] = yield db_1.pool.query(`
            SELECT 
              a.id as accountId,
              a.name as accountName,
              a.balance,
              a.type
            FROM accounts a
            JOIN banks b ON b.accountId = a.id
            WHERE (b.branchId = ? OR b.branchId IS NULL)
              AND b.isActive = 1
            ORDER BY a.balance DESC
        `, [branchId]);
    }
    else {
        [accounts] = yield db_1.pool.query(`
            SELECT 
              a.id as accountId,
              a.name as accountName,
              a.balance,
              a.type
            FROM accounts a
            WHERE a.type IN ('CASH', 'BANK', 'TREASURY')
              AND a.isActive = 1
            ORDER BY a.balance DESC
        `);
    }
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
    WHERE payrollId = ? AND status != 'REJECTED'
  `, [cycleId]);
    return parseFloat((_a = result[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
});
exports.getPayrollCycleTotal = getPayrollCycleTotal;
/**
 * Verify treasury balance before payroll approval
 * Returns detailed breakdown of available funds and any shortfall
 */
const verifyTreasuryForPayroll = (cycleId_1, ...args_1) => __awaiter(void 0, [cycleId_1, ...args_1], void 0, function* (cycleId, safetyMarginPercent = 10) {
    const warnings = [];
    // Get payroll total
    const totalPayrollAmount = yield (0, exports.getPayrollCycleTotal)(cycleId);
    // Get treasury balance
    const { total: availableBalance, accounts } = yield (0, exports.getTreasuryBalance)();
    // Calculate shortfall (if any)
    const shortfall = Math.max(0, totalPayrollAmount - availableBalance);
    const canProceed = shortfall === 0;
    // Add warnings based on conditions
    if (shortfall > 0) {
        warnings.push(`Treasury balance is short by ${shortfall.toLocaleString()} EGP`);
    }
    // Check safety margin
    const safetyMargin = totalPayrollAmount * (safetyMarginPercent / 100);
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
        totalPayrollAmount: Math.round(totalPayrollAmount * 100) / 100,
        availableBalance: Math.round(availableBalance * 100) / 100,
        shortfall: Math.round(shortfall * 100) / 100,
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
    const { randomUUID: uuidv4 } = require('crypto');
    const transactionId = uuidv4();
    // Get cycle details for description
    const [cycles] = yield db_1.pool.query('SELECT month, year FROM payroll_cycles WHERE id = ?', [cycleId]);
    const cycle = cycles[0] || { month: 0, year: 0 };
    const description = `صرف رواتب شهر ${cycle.month}/${cycle.year}`;
    // Create treasury entry
    yield db_1.pool.query(`
    INSERT INTO treasury_entries 
    (id, accountId, type, amount, description, referenceId, referenceType, createdBy, createdAt)
    VALUES (?, ?, 'OUTFLOW', ?, ?, ?, 'PAYROLL', ?, NOW())
  `, [transactionId, payingAccountId, amount, description, cycleId, approvedBy]);
    // Update account balance
    yield db_1.pool.query(`
    UPDATE accounts 
    SET balance = balance - ?
    WHERE id = ?
  `, [amount, payingAccountId]);
    return transactionId;
});
exports.recordPayrollTreasuryOutflow = recordPayrollTreasuryOutflow;
/**
 * Get suggested account for payroll payment
 * Returns the account with the highest balance that can cover the payroll
 */
const getSuggestedPayrollAccount = (totalAmount) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts } = yield (0, exports.getTreasuryBalance)();
    // Find the first account that can cover the whole payroll
    const suitable = accounts.find(acc => acc.balance >= totalAmount);
    if (suitable) {
        return suitable;
    }
    // If no single account can cover it, return the one with highest balance
    return accounts.length > 0 ? accounts[0] : null;
});
exports.getSuggestedPayrollAccount = getSuggestedPayrollAccount;
/**
 * Pre-flight check before payroll approval
 * Combines all verification steps into a single result
 */
const preflightPayrollApproval = (cycleId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const pendingIssues = [];
    // Check treasury balance
    const treasury = yield (0, exports.verifyTreasuryForPayroll)(cycleId);
    if (!treasury.canProceed) {
        pendingIssues.push('Insufficient treasury balance');
    }
    // Get suggested paying account
    const suggestedAccount = yield (0, exports.getSuggestedPayrollAccount)(treasury.totalPayrollAmount);
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
    if (((_b = cycle[0]) === null || _b === void 0 ? void 0 : _b.status) === 'APPROVED') {
        pendingIssues.push('Payroll cycle already approved');
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
