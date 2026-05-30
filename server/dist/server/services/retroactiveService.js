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
exports.rejectAdjustment = exports.approveAdjustment = exports.getPendingAdjustments = exports.applyAdjustmentToPayroll = exports.createRetroactiveAdjustment = exports.calculateRetroactiveAdjustment = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
/**
 * Calculate retroactive adjustment for salary change
 * When an employee's salary is increased/decreased effective from a past date,
 * this calculates the difference owed/recovered for all affected months.
 *
 * @param employeeId - Employee ID
 * @param newBaseSalary - New base salary amount
 * @param effectiveFromMonth - Month the change should have been effective (1-12)
 * @param effectiveFromYear - Year the change should have been effective
 * @param currentMonth - Current payroll month
 * @param currentYear - Current payroll year
 */
const calculateRetroactiveAdjustment = (employeeId_1, newBaseSalary_1, effectiveFromMonth_1, effectiveFromYear_1, ...args_1) => __awaiter(void 0, [employeeId_1, newBaseSalary_1, effectiveFromMonth_1, effectiveFromYear_1, ...args_1], void 0, function* (employeeId, newBaseSalary, effectiveFromMonth, effectiveFromYear, currentMonth = new Date().getMonth() + 1, currentYear = new Date().getFullYear()) {
    // Get the employee's old salary
    const [employees] = yield db_1.pool.query('SELECT baseSalary, fullName FROM employees WHERE id = ?', [employeeId]);
    if (employees.length === 0) {
        throw new Error('Employee not found');
    }
    const oldBaseSalary = parseFloat(employees[0].baseSalary) || 0;
    const employeeName = employees[0].fullName;
    // Get all approved payroll entries between effective date and current month
    const [entries] = yield db_1.pool.query(`
    SELECT 
      pe.id, pe.payrollId, pe.baseSalary, pe.netSalary, pe.grossSalary,
      pc.month, pc.year
    FROM payroll_entries pe
    JOIN payroll_cycles pc ON pe.payrollId = pc.id
    WHERE pe.employeeId = ?
      AND pc.status = 'APPROVED'
      AND (
        (pc.year > ? OR (pc.year = ? AND pc.month >= ?))
        AND (pc.year < ? OR (pc.year = ? AND pc.month < ?))
      )
    ORDER BY pc.year ASC, pc.month ASC
  `, [
        employeeId,
        effectiveFromYear, effectiveFromYear, effectiveFromMonth,
        currentYear, currentYear, currentMonth
    ]);
    let totalAdjustment = 0;
    const breakdown = [];
    for (const entry of entries) {
        const entryBaseSalary = parseFloat(entry.baseSalary) || 0;
        const entryNetSalary = parseFloat(entry.netSalary) || 0;
        // Calculate what the net salary should have been with the new base
        // Simple proportional calculation: new_net = old_net * (new_base / old_base)
        const salaryRatio = newBaseSalary / (entryBaseSalary || 1);
        const newNetSalary = Math.round(entryNetSalary * salaryRatio * 100) / 100;
        const difference = Math.round((newNetSalary - entryNetSalary) * 100) / 100;
        if (difference !== 0) {
            breakdown.push({
                cycleId: entry.payrollId,
                month: entry.month,
                year: entry.year,
                oldNetSalary: entryNetSalary,
                newNetSalary,
                difference
            });
            totalAdjustment += difference;
        }
    }
    return {
        employeeId,
        totalAdjustment: Math.round(totalAdjustment * 100) / 100,
        affectedMonths: breakdown.length,
        breakdown,
        reason: `Retroactive salary adjustment from ${oldBaseSalary} to ${newBaseSalary} for ${employeeName}, effective ${effectiveFromMonth}/${effectiveFromYear}`
    };
});
exports.calculateRetroactiveAdjustment = calculateRetroactiveAdjustment;
/**
 * Create a retroactive adjustment record and optionally apply to current payroll
 */
const createRetroactiveAdjustment = (calculation_1, currentPayrollCycleId_1, createdBy_1, ...args_1) => __awaiter(void 0, [calculation_1, currentPayrollCycleId_1, createdBy_1, ...args_1], void 0, function* (calculation, currentPayrollCycleId, createdBy, applyImmediately = false) {
    const id = (0, crypto_1.randomUUID)();
    yield db_1.pool.query(`
    INSERT INTO payroll_adjustments 
    (id, employeeId, payrollCycleId, adjustmentType, reason, amount, affectedMonths, breakdown, status, createdBy)
    VALUES (?, ?, ?, 'RETROACTIVE', ?, ?, ?, ?, ?, ?)
  `, [
        id,
        calculation.employeeId,
        currentPayrollCycleId,
        calculation.reason,
        calculation.totalAdjustment,
        calculation.affectedMonths,
        JSON.stringify(calculation.breakdown),
        applyImmediately ? 'APPLIED' : 'PENDING',
        createdBy
    ]);
    // If applying immediately, update the current payroll entry
    if (applyImmediately) {
        yield (0, exports.applyAdjustmentToPayroll)(id);
    }
    return id;
});
exports.createRetroactiveAdjustment = createRetroactiveAdjustment;
/**
 * Apply a pending adjustment to the associated payroll entry
 */
const applyAdjustmentToPayroll = (adjustmentId) => __awaiter(void 0, void 0, void 0, function* () {
    const [adjustments] = yield db_1.pool.query('SELECT * FROM payroll_adjustments WHERE id = ?', [adjustmentId]);
    if (adjustments.length === 0) {
        throw new Error('Adjustment not found');
    }
    const adjustment = adjustments[0];
    if (adjustment.status === 'APPLIED') {
        throw new Error('Adjustment already applied');
    }
    // Find the payroll entry for this employee in the target cycle
    const [entries] = yield db_1.pool.query(`
    SELECT id, netSalary, retroactiveAdjustment 
    FROM payroll_entries 
    WHERE employeeId = ? AND payrollId = ?
  `, [adjustment.employeeId, adjustment.payrollCycleId]);
    if (entries.length === 0) {
        throw new Error('Payroll entry not found for this employee and cycle');
    }
    const entry = entries[0];
    const currentRetro = parseFloat(entry.retroactiveAdjustment) || 0;
    const newRetro = currentRetro + parseFloat(adjustment.amount);
    const newNetSalary = parseFloat(entry.netSalary) + parseFloat(adjustment.amount);
    // Update the payroll entry
    yield db_1.pool.query(`
    UPDATE payroll_entries 
    SET retroactiveAdjustment = ?, netSalary = ?
    WHERE id = ?
  `, [newRetro, newNetSalary, entry.id]);
    // Mark adjustment as applied
    yield db_1.pool.query(`
    UPDATE payroll_adjustments 
    SET status = 'APPLIED', appliedAt = NOW()
    WHERE id = ?
  `, [adjustmentId]);
});
exports.applyAdjustmentToPayroll = applyAdjustmentToPayroll;
/**
 * Get pending adjustments for an employee
 */
const getPendingAdjustments = (employeeId) => __awaiter(void 0, void 0, void 0, function* () {
    const [adjustments] = yield db_1.pool.query(`
    SELECT pa.*, pc.month, pc.year
    FROM payroll_adjustments pa
    JOIN payroll_cycles pc ON pa.payrollCycleId = pc.id
    WHERE pa.employeeId = ? AND pa.status = 'PENDING'
    ORDER BY pa.createdAt DESC
  `, [employeeId]);
    return adjustments;
});
exports.getPendingAdjustments = getPendingAdjustments;
/**
 * Approve a pending adjustment
 */
const approveAdjustment = (adjustmentId, approvedBy) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query(`
    UPDATE payroll_adjustments 
    SET status = 'APPROVED', approvedBy = ?, approvedAt = NOW()
    WHERE id = ? AND status = 'PENDING'
  `, [approvedBy, adjustmentId]);
});
exports.approveAdjustment = approveAdjustment;
/**
 * Reject a pending adjustment
 */
const rejectAdjustment = (adjustmentId, approvedBy) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query(`
    UPDATE payroll_adjustments 
    SET status = 'REJECTED', approvedBy = ?, approvedAt = NOW()
    WHERE id = ? AND status = 'PENDING'
  `, [approvedBy, adjustmentId]);
});
exports.rejectAdjustment = rejectAdjustment;
exports.default = {
    calculateRetroactiveAdjustment: exports.calculateRetroactiveAdjustment,
    createRetroactiveAdjustment: exports.createRetroactiveAdjustment,
    applyAdjustmentToPayroll: exports.applyAdjustmentToPayroll,
    getPendingAdjustments: exports.getPendingAdjustments,
    approveAdjustment: exports.approveAdjustment,
    rejectAdjustment: exports.rejectAdjustment
};
