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
exports.markInstallmentsAsDeducted = exports.getPendingInstallments = exports.repayLoan = exports.settleLoanEarly = exports.skipInstallment = exports.generateInstallments = exports.checkLoanEligibility = exports.getLoanConstraints = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
// ============================================
// CONSTRAINT & ELIGIBILITY LOGIC
// ============================================
/**
 * Get active loan constraints configuration
 */
const getLoanConstraints = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.pool.query(`
        SELECT * FROM loan_constraints WHERE isActive = TRUE LIMIT 1
      `);
        if (rows.length === 0) {
            // Return defaults if no config exists
            return {
                maxDeductionPercentage: 50,
                minEmploymentMonths: 6,
                allowDuringProbation: false,
                maxActiveLoanCount: 2,
                minSalaryMultiplier: 3,
                requireApproval: true
            };
        }
        return rows[0];
    }
    catch (error) {
        // Table doesn't exist yet — return safe defaults
        console.warn('⚠️ loan_constraints table not found, using defaults:', error.message);
        return {
            maxDeductionPercentage: 50,
            minEmploymentMonths: 6,
            allowDuringProbation: false,
            maxActiveLoanCount: 2,
            minSalaryMultiplier: 3,
            requireApproval: true
        };
    }
});
exports.getLoanConstraints = getLoanConstraints;
/**
 * Check if employee is eligible for a loan
 */
const checkLoanEligibility = (employeeId, requestedAmount, numberOfMonths) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const reasons = [];
    // Get employee data
    const [empRows] = yield db_1.pool.query('SELECT * FROM employees WHERE id = ?', [employeeId]);
    if (empRows.length === 0) {
        return {
            eligible: false,
            reasons: ['الموظف غير موجود'],
            maxLoanAmount: 0,
            maxMonthlyDeduction: 0
        };
    }
    const employee = empRows[0];
    // Get constraints
    const constraints = yield (0, exports.getLoanConstraints)();
    // Check 1: Employee Status
    if (employee.status !== 'ACTIVE') {
        reasons.push('الموظف غير نشط');
    }
    // Check 2: Employment Duration
    if (employee.hireDate) {
        const hireDate = new Date(employee.hireDate);
        const monthsEmployed = (new Date().getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
        if (monthsEmployed < constraints.minEmploymentMonths) {
            reasons.push(`يجب أن يكون الموظف قد عمل لمدة ${constraints.minEmploymentMonths} شهر على الأقل (حالياً: ${Math.floor(monthsEmployed)} شهر)`);
        }
    }
    // Check 3: Probation Period (if applicable)
    // TODO: Add probation check if you have a probation field
    // Check 4: Active Loan Count
    const [activeLoanCount] = yield db_1.pool.query(`
    SELECT COUNT(*) as count FROM employee_advances 
    WHERE employeeId = ? AND status = 'ACTIVE'
  `, [employeeId]);
    if (activeLoanCount[0].count >= constraints.maxActiveLoanCount) {
        reasons.push(`الحد الأقصى لعدد القروض النشطة هو ${constraints.maxActiveLoanCount}`);
    }
    // Check 5: Salary-based loan limit
    const baseSalary = parseFloat(employee.baseSalary) || 0;
    const maxLoanBySalary = baseSalary * constraints.minSalaryMultiplier;
    if (requestedAmount > maxLoanBySalary) {
        reasons.push(`الحد الأقصى للقرض بناءً على الراتب: ${maxLoanBySalary.toLocaleString()} جنيه`);
    }
    // Check 6: Monthly Deduction Percentage
    const monthlyDeduction = requestedAmount / numberOfMonths;
    // Calculate existing monthly deductions
    const [existingDeductions] = yield db_1.pool.query(`
    SELECT COALESCE(SUM(li.amount), 0) as total
    FROM loan_installments li
    WHERE li.employeeId = ? 
      AND li.status = 'PENDING'
      AND li.dueDate >= CURRENT_DATE
      AND li.dueDate < DATE_ADD(CURRENT_DATE, INTERVAL 1 MONTH)
  `, [employeeId]);
    const existingMonthlyDeduction = parseFloat((_a = existingDeductions[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
    const totalMonthlyDeduction = existingMonthlyDeduction + monthlyDeduction;
    // Estimate net salary — try using the real salary engine
    let estimatedNetSalary = baseSalary * 0.85; // Fallback rough estimate
    try {
        const salaryService = require('./salaryService');
        const payrollResult = yield salaryService.calculateEmployeePayroll(employeeId, {
            baseSalary,
            variableSalary: parseFloat(employee.variableSalary) || 0,
            basicSalaryInsurable: parseFloat(employee.basicSalaryInsurable) || baseSalary,
            personalExemption: parseFloat(employee.personalExemption) || 15000
        }, { workingDays: 30, absentDays: 0, lateMinutes: 0, overtimeHours: 0 }, 0, { includeTax: true, includeInsurance: true });
        if (payrollResult.netSalary > 0) {
            estimatedNetSalary = payrollResult.netSalary;
        }
    }
    catch (_b) {
        // Fall through to 85% estimate
    }
    const deductionPercentage = (totalMonthlyDeduction / estimatedNetSalary) * 100;
    if (deductionPercentage > constraints.maxDeductionPercentage) {
        reasons.push(`إجمالي الخصومات الشهرية (${deductionPercentage.toFixed(1)}%) يتجاوز الحد المسموح (${constraints.maxDeductionPercentage}%)`);
    }
    const maxAllowedDeduction = (estimatedNetSalary * constraints.maxDeductionPercentage / 100) - existingMonthlyDeduction;
    const maxLoanAmount = Math.min(maxLoanBySalary, maxAllowedDeduction * numberOfMonths);
    return {
        eligible: reasons.length === 0,
        reasons,
        maxLoanAmount: Math.max(0, maxLoanAmount),
        maxMonthlyDeduction: Math.max(0, maxAllowedDeduction)
    };
});
exports.checkLoanEligibility = checkLoanEligibility;
// ============================================
// INSTALLMENT GENERATION
// ============================================
/**
 * Generate installment schedule for a loan
 */
const generateInstallments = (loanId_1, employeeId_1, totalAmount_1, numberOfMonths_1, ...args_1) => __awaiter(void 0, [loanId_1, employeeId_1, totalAmount_1, numberOfMonths_1, ...args_1], void 0, function* (loanId, employeeId, totalAmount, numberOfMonths, startDate = new Date()) {
    const installmentAmount = totalAmount / numberOfMonths;
    const installments = [];
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Delete existing installments if any (for regeneration scenarios)
        yield conn.query('DELETE FROM loan_installments WHERE loanId = ?', [loanId]);
        // Generate new installments
        for (let i = 0; i < numberOfMonths; i++) {
            const dueDate = new Date(startDate);
            dueDate.setMonth(dueDate.getMonth() + i + 1);
            dueDate.setDate(1); // First day of month
            // Last installment gets any rounding difference
            const isLast = i === numberOfMonths - 1;
            const amount = isLast
                ? totalAmount - (installmentAmount * (numberOfMonths - 1))
                : installmentAmount;
            const installmentId = (0, crypto_1.randomUUID)();
            yield conn.query(`
        INSERT INTO loan_installments (
          id, loanId, employeeId, installmentNumber,
          dueDate, amount, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
      `, [installmentId, loanId, employeeId, i + 1, dueDate, amount]);
            installments.push({
                id: installmentId,
                installmentNumber: i + 1,
                dueDate: dueDate.toISOString().split('T')[0],
                amount,
                status: 'PENDING'
            });
        }
        yield conn.commit();
        return installments;
    }
    catch (error) {
        yield conn.rollback();
        throw error;
    }
    finally {
        conn.release();
    }
});
exports.generateInstallments = generateInstallments;
// ============================================
// LOAN LIFECYCLE OPERATIONS
// ============================================
/**
 * Skip an installment (push it forward)
 */
const skipInstallment = (installmentId, reason, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Get installment and loan info
        const [installments] = yield conn.query(`
      SELECT li.*, ea.maxSkipCount, ea.skippedCount, ea.allowSkip
      FROM loan_installments li
      JOIN employee_advances ea ON li.loanId = ea.id
      WHERE li.id = ?
    `, [installmentId]);
        if (installments.length === 0) {
            throw new Error('القسط غير موجود');
        }
        const installment = installments[0];
        if (!installment.allowSkip) {
            throw new Error('هذا القرض لا يسمح بتأجيل الأقساط');
        }
        if (installment.skippedCount >= installment.maxSkipCount) {
            throw new Error(`تم تجاوز الحد الأقصى لعدد التأجيلات (${installment.maxSkipCount})`);
        }
        if (installment.status !== 'PENDING') {
            throw new Error('لا يمكن تأجيل قسط تم خصمه أو دفعه');
        }
        // Mark as skipped
        yield conn.query(`
      UPDATE loan_installments 
      SET status = 'SKIPPED',
          skipReason = ?,
          skippedAt = NOW(),
          skippedBy = ?
      WHERE id = ?
    `, [reason, userId, installmentId]);
        // Increment skip count on loan
        yield conn.query(`
      UPDATE employee_advances 
      SET skippedCount = skippedCount + 1
      WHERE id = ?
    `, [installment.loanId]);
        // Create a new installment at the end
        const [lastInstallment] = yield conn.query(`
      SELECT MAX(installmentNumber) as maxNum, MAX(dueDate) as lastDate
      FROM loan_installments
      WHERE loanId = ?
    `, [installment.loanId]);
        const newDueDate = new Date(lastInstallment[0].lastDate);
        newDueDate.setMonth(newDueDate.getMonth() + 1);
        yield conn.query(`
      INSERT INTO loan_installments (
        id, loanId, employeeId, installmentNumber,
        dueDate, amount, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `, [
            (0, crypto_1.randomUUID)(),
            installment.loanId,
            installment.employeeId,
            lastInstallment[0].maxNum + 1,
            newDueDate,
            installment.amount,
            `تأجيل من القسط #${installment.installmentNumber}`
        ]);
        // Log history
        yield conn.query(`
      INSERT INTO loan_history (id, loanId, action, performedBy, amount, notes)
      VALUES (?, ?, 'INSTALLMENT_SKIPPED', ?, ?, ?)
    `, [(0, crypto_1.randomUUID)(), installment.loanId, userId, installment.amount, reason]);
        yield conn.commit();
    }
    catch (error) {
        yield conn.rollback();
        throw error;
    }
    finally {
        conn.release();
    }
});
exports.skipInstallment = skipInstallment;
/**
 * Settle a loan early (pay remaining balance)
 */
const settleLoanEarly = (loanId_1, settlementAmount_1, userId_1, ...args_1) => __awaiter(void 0, [loanId_1, settlementAmount_1, userId_1, ...args_1], void 0, function* (loanId, settlementAmount, userId, notes = '') {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Get loan info
        const [loans] = yield conn.query('SELECT * FROM employee_advances WHERE id = ?', [loanId]);
        if (loans.length === 0) {
            throw new Error('القرض غير موجود');
        }
        const loan = loans[0];
        if (loan.status !== 'ACTIVE') {
            throw new Error('القرض غير نشط');
        }
        if (settlementAmount < loan.remainingAmount) {
            throw new Error(`مبلغ التسوية يجب أن يكون على الأقل ${loan.remainingAmount.toLocaleString()} جنيه`);
        }
        // Mark all pending installments as PAID_CASH
        yield conn.query(`
      UPDATE loan_installments 
      SET status = 'PAID_CASH',
          paidCashAt = NOW(),
          paidCashBy = ?,
          notes = CONCAT(COALESCE(notes, ''), ' - تسوية مبكرة')
      WHERE loanId = ? AND status = 'PENDING'
    `, [userId, loanId]);
        // Update loan status
        yield conn.query(`
      UPDATE employee_advances 
      SET status = 'COMPLETED',
          remainingAmount = 0,
          totalPaid = amount,
          settlementAmount = ?,
          settledAt = NOW(),
          settledBy = ?
      WHERE id = ?
    `, [settlementAmount, userId, loanId]);
        // Log history
        yield conn.query(`
      INSERT INTO loan_history (id, loanId, action, performedBy, amount, notes)
      VALUES (?, ?, 'SETTLED', ?, ?, ?)
    `, [(0, crypto_1.randomUUID)(), loanId, userId, settlementAmount, notes]);
        yield conn.commit();
    }
    catch (error) {
        yield conn.rollback();
        throw error;
    }
    finally {
        conn.release();
    }
});
exports.settleLoanEarly = settleLoanEarly;
/**
 * Partial loan repayment (مردودات سلف)
 * Employee pays back part (or all) of their outstanding loan in cash
 */
const repayLoan = (loanId_1, repaymentAmount_1, userId_1, ...args_1) => __awaiter(void 0, [loanId_1, repaymentAmount_1, userId_1, ...args_1], void 0, function* (loanId, repaymentAmount, userId, notes = '') {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Get loan info
        const [loans] = yield conn.query('SELECT * FROM employee_advances WHERE id = ?', [loanId]);
        if (loans.length === 0) {
            throw new Error('السلفة/القرض غير موجود');
        }
        const loan = loans[0];
        if (loan.status !== 'ACTIVE') {
            throw new Error('السلفة/القرض غير نشط');
        }
        const remaining = parseFloat(loan.remainingAmount) || 0;
        if (repaymentAmount <= 0) {
            throw new Error('مبلغ السداد يجب أن يكون أكبر من صفر');
        }
        if (repaymentAmount > remaining) {
            throw new Error(`مبلغ السداد (${repaymentAmount.toLocaleString()}) أكبر من المتبقي (${remaining.toLocaleString()})`);
        }
        const newRemaining = remaining - repaymentAmount;
        const newTotalPaid = (parseFloat(loan.totalPaid) || 0) + repaymentAmount;
        const isCompleted = newRemaining <= 0;
        // Mark equivalent pending installments as PAID_CASH (oldest first)
        let amountToAllocate = repaymentAmount;
        try {
            const [pendingInstallments] = yield conn.query(`
                SELECT id, amount FROM loan_installments
                WHERE loanId = ? AND status = 'PENDING'
                ORDER BY dueDate ASC
            `, [loanId]);
            for (const inst of pendingInstallments) {
                if (amountToAllocate <= 0)
                    break;
                const instAmount = parseFloat(inst.amount) || 0;
                if (amountToAllocate >= instAmount) {
                    // Fully cover this installment
                    yield conn.query(`
                        UPDATE loan_installments
                        SET status = 'PAID_CASH', paidCashAt = NOW(), paidCashBy = ?,
                            notes = CONCAT(COALESCE(notes, ''), ' - سداد نقدي')
                        WHERE id = ?
                    `, [userId, inst.id]);
                    amountToAllocate -= instAmount;
                }
                else {
                    // Partial — reduce the installment amount
                    yield conn.query(`
                        UPDATE loan_installments
                        SET amount = amount - ?,
                            notes = CONCAT(COALESCE(notes, ''), ' - سداد جزئي ${amountToAllocate.toLocaleString()} ج.م')
                        WHERE id = ?
                    `, [amountToAllocate, inst.id]);
                    amountToAllocate = 0;
                }
            }
        }
        catch (instErr) {
            // loan_installments table might not exist for simple advances — continue gracefully
            console.warn('⚠️ Could not update installments (may not exist for ADVANCE type):', instErr.message);
        }
        // Update loan balance
        yield conn.query(`
            UPDATE employee_advances
            SET totalPaid = ?,
                remainingAmount = ?,
                status = ?
            WHERE id = ?
        `, [newTotalPaid, newRemaining, isCompleted ? 'COMPLETED' : 'ACTIVE', loanId]);
        // Log history
        try {
            yield conn.query(`
                INSERT INTO loan_history (id, loanId, action, performedBy, amount, notes)
                VALUES (?, ?, 'REPAYMENT', ?, ?, ?)
            `, [(0, crypto_1.randomUUID)(), loanId, userId, repaymentAmount, notes || 'سداد جزئي']);
        }
        catch (histErr) {
            console.warn('⚠️ Could not log to loan_history:', histErr.message);
        }
        yield conn.commit();
        return { newRemaining, newTotalPaid, isCompleted };
    }
    catch (error) {
        yield conn.rollback();
        throw error;
    }
    finally {
        conn.release();
    }
});
exports.repayLoan = repayLoan;
// ============================================
// PAYROLL INTEGRATION
// ============================================
/**
 * Get pending installments for an employee in a specific period
 */
const getPendingInstallments = (employeeId, startDate, endDate) => __awaiter(void 0, void 0, void 0, function* () {
    const [installments] = yield db_1.pool.query(`
    SELECT 
      li.*,
      ea.type as loanCategory,
      ea.loanType,
      ea.reason as loanReason
    FROM loan_installments li
    JOIN employee_advances ea ON li.loanId = ea.id
    WHERE li.employeeId = ? 
      AND li.dueDate BETWEEN ? AND ?
      AND li.status = 'PENDING'
    ORDER BY li.dueDate
  `, [employeeId, startDate, endDate]);
    const total = installments.reduce((sum, inst) => sum + parseFloat(inst.amount), 0);
    return { total, installments };
});
exports.getPendingInstallments = getPendingInstallments;
/**
 * Mark installments as deducted after payroll approval
 */
const markInstallmentsAsDeducted = (employeeId, payrollCycleId, startDate, endDate) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Get the installments
        const [installments] = yield conn.query(`
      SELECT * FROM loan_installments
      WHERE employeeId = ? 
        AND dueDate BETWEEN ? AND ?
        AND status = 'PENDING'
    `, [employeeId, startDate, endDate]);
        if (installments.length === 0) {
            yield conn.commit();
            return 0;
        }
        // Mark as deducted
        yield conn.query(`
      UPDATE loan_installments
      SET status = 'DEDUCTED',
          deductedAt = NOW(),
          deductedInPayrollId = ?
      WHERE employeeId = ? 
        AND dueDate BETWEEN ? AND ?
        AND status = 'PENDING'
    `, [payrollCycleId, employeeId, startDate, endDate]);
        // Update loan totals
        const totalDeducted = installments.reduce((sum, inst) => sum + parseFloat(inst.amount), 0);
        for (const inst of installments) {
            yield conn.query(`
        UPDATE employee_advances
        SET totalPaid = totalPaid + ?,
            remainingAmount = remainingAmount - ?
        WHERE id = ?
      `, [inst.amount, inst.amount, inst.loanId]);
            // Check if loan is now completed
            const [loan] = yield conn.query('SELECT remainingAmount FROM employee_advances WHERE id = ?', [inst.loanId]);
            if (((_a = loan[0]) === null || _a === void 0 ? void 0 : _a.remainingAmount) <= 0) {
                yield conn.query("UPDATE employee_advances SET status = 'COMPLETED' WHERE id = ?", [inst.loanId]);
            }
            // Log history
            yield conn.query(`
        INSERT INTO loan_history (id, loanId, action, performedBy, amount, notes, metadata)
        VALUES (?, ?, 'INSTALLMENT_DEDUCTED', NULL, ?, ?, ?)
      `, [
                (0, crypto_1.randomUUID)(),
                inst.loanId,
                inst.amount,
                `خصم تلقائي من مسير ${payrollCycleId}`,
                JSON.stringify({ payrollCycleId, installmentId: inst.id })
            ]);
        }
        yield conn.commit();
        return totalDeducted;
    }
    catch (error) {
        yield conn.rollback();
        throw error;
    }
    finally {
        conn.release();
    }
});
exports.markInstallmentsAsDeducted = markInstallmentsAsDeducted;
