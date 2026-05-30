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
exports.getStats = exports.markAsApplied = exports.getApprovedForPayroll = exports.bulkApprove = exports.cancelAdditionalSalary = exports.rejectAdditionalSalary = exports.approveAdditionalSalary = exports.deleteAdditionalSalary = exports.updateAdditionalSalary = exports.createAdditionalSalary = exports.getAdditionalSalaryEntries = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
// ============================================
// CRUD OPERATIONS
// ============================================
const getAdditionalSalaryEntries = (params) => __awaiter(void 0, void 0, void 0, function* () {
    let query = `
        SELECT ase.*, e.fullName as employeeName, e.department,
               sc.name as componentName, sc.code as componentCode,
               pc.month as cycleMonth, pc.year as cycleYear
        FROM additional_salary_entries ase
        JOIN employees e ON ase.employeeId = e.id
        LEFT JOIN salary_components sc ON ase.componentId = sc.id
        LEFT JOIN payroll_cycles pc ON ase.payrollCycleId = pc.id
        WHERE 1=1
    `;
    const queryParams = [];
    if (params === null || params === void 0 ? void 0 : params.employeeId) {
        query += ' AND ase.employeeId = ?';
        queryParams.push(params.employeeId);
    }
    if (params === null || params === void 0 ? void 0 : params.payrollCycleId) {
        query += ' AND ase.payrollCycleId = ?';
        queryParams.push(params.payrollCycleId);
    }
    if (params === null || params === void 0 ? void 0 : params.status) {
        query += ' AND ase.status = ?';
        queryParams.push(params.status);
    }
    if (params === null || params === void 0 ? void 0 : params.type) {
        query += ' AND ase.type = ?';
        queryParams.push(params.type);
    }
    query += ' ORDER BY ase.createdAt DESC';
    const [rows] = yield db_1.pool.query(query, queryParams);
    return rows;
});
exports.getAdditionalSalaryEntries = getAdditionalSalaryEntries;
const createAdditionalSalary = (data) => __awaiter(void 0, void 0, void 0, function* () {
    const id = (0, crypto_1.randomUUID)();
    yield db_1.pool.query(`
        INSERT INTO additional_salary_entries 
        (id, employeeId, componentId, name, amount, type, payrollCycleId, reason, notes,
         isRecurring, recurringFrom, recurringTo, source, createdBy, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')
    `, [
        id, data.employeeId, data.componentId || null,
        data.name, data.amount, data.type,
        data.payrollCycleId || null, data.reason || null, data.notes || null,
        data.isRecurring || false, data.recurringFrom || null, data.recurringTo || null,
        data.source || 'MANUAL', data.createdBy || null
    ]);
    return id;
});
exports.createAdditionalSalary = createAdditionalSalary;
const updateAdditionalSalary = (id, data) => __awaiter(void 0, void 0, void 0, function* () {
    const fields = [];
    const values = [];
    Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
    });
    if (fields.length === 0)
        return;
    values.push(id);
    yield db_1.pool.query(`UPDATE additional_salary_entries SET ${fields.join(', ')} WHERE id = ? AND status = 'DRAFT'`, values);
});
exports.updateAdditionalSalary = updateAdditionalSalary;
const deleteAdditionalSalary = (id) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query("DELETE FROM additional_salary_entries WHERE id = ? AND status = 'DRAFT'", [id]);
});
exports.deleteAdditionalSalary = deleteAdditionalSalary;
// ============================================
// APPROVAL WORKFLOW
// ============================================
const approveAdditionalSalary = (id, approvedBy) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query(`
        UPDATE additional_salary_entries 
        SET status = 'APPROVED', approvedBy = ?, approvedAt = NOW()
        WHERE id = ? AND status = 'DRAFT'
    `, [approvedBy, id]);
});
exports.approveAdditionalSalary = approveAdditionalSalary;
const rejectAdditionalSalary = (id, approvedBy) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query(`
        UPDATE additional_salary_entries 
        SET status = 'REJECTED', approvedBy = ?, approvedAt = NOW()
        WHERE id = ? AND status = 'DRAFT'
    `, [approvedBy, id]);
});
exports.rejectAdditionalSalary = rejectAdditionalSalary;
const cancelAdditionalSalary = (id) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query(`
        UPDATE additional_salary_entries 
        SET status = 'CANCELLED'
        WHERE id = ? AND status IN ('DRAFT', 'APPROVED')
    `, [id]);
});
exports.cancelAdditionalSalary = cancelAdditionalSalary;
// Bulk approve
const bulkApprove = (ids, approvedBy) => __awaiter(void 0, void 0, void 0, function* () {
    if (ids.length === 0)
        return 0;
    const placeholders = ids.map(() => '?').join(',');
    const [result] = yield db_1.pool.query(`
        UPDATE additional_salary_entries 
        SET status = 'APPROVED', approvedBy = ?, approvedAt = NOW()
        WHERE id IN (${placeholders}) AND status = 'DRAFT'
    `, [approvedBy, ...ids]);
    return result.affectedRows;
});
exports.bulkApprove = bulkApprove;
// ============================================
// PAYROLL INTEGRATION
// ============================================
/**
 * Get approved additional salary entries for a payroll cycle
 * Includes:
 *   1. Entries directly targeting this cycle
 *   2. Entries with no target cycle (next available)
 *   3. Recurring entries active during this period
 */
const getApprovedForPayroll = (employeeId, payrollCycleId, month, year) => __awaiter(void 0, void 0, void 0, function* () {
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
    const [rows] = yield db_1.pool.query(`
        SELECT ase.*, sc.name as componentName, sc.code as componentCode
        FROM additional_salary_entries ase
        LEFT JOIN salary_components sc ON ase.componentId = sc.id
        WHERE ase.employeeId = ? 
          AND ase.status = 'APPROVED'
          AND (
            -- Directly targeting this cycle
            ase.payrollCycleId = ?
            -- Or no target cycle (next available) and not yet applied
            OR (ase.payrollCycleId IS NULL AND ase.appliedInCycleId IS NULL AND ase.isRecurring = 0)
            -- Or recurring entries active during this period
            OR (ase.isRecurring = 1 AND ase.recurringFrom <= ? AND (ase.recurringTo IS NULL OR ase.recurringTo >= ?))
          )
    `, [employeeId, payrollCycleId, periodEnd, periodStart]);
    return rows;
});
exports.getApprovedForPayroll = getApprovedForPayroll;
/**
 * Mark entries as applied after payroll calculation
 */
const markAsApplied = (entryIds, payrollCycleId) => __awaiter(void 0, void 0, void 0, function* () {
    if (entryIds.length === 0)
        return;
    const placeholders = entryIds.map(() => '?').join(',');
    yield db_1.pool.query(`
        UPDATE additional_salary_entries 
        SET status = 'APPLIED', appliedInCycleId = ?
        WHERE id IN (${placeholders}) AND isRecurring = 0
    `, [payrollCycleId, ...entryIds]);
});
exports.markAsApplied = markAsApplied;
// ============================================
// SUMMARY / STATS
// ============================================
const getStats = () => __awaiter(void 0, void 0, void 0, function* () {
    const [rows] = yield db_1.pool.query(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'DRAFT' THEN 1 ELSE 0 END) as draft,
            SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status = 'APPLIED' THEN 1 ELSE 0 END) as applied,
            SUM(CASE WHEN type = 'EARNING' AND status IN ('APPROVED','APPLIED') THEN amount ELSE 0 END) as totalEarnings,
            SUM(CASE WHEN type = 'DEDUCTION' AND status IN ('APPROVED','APPLIED') THEN amount ELSE 0 END) as totalDeductions
        FROM additional_salary_entries
    `);
    return rows[0];
});
exports.getStats = getStats;
exports.default = {
    getAdditionalSalaryEntries: exports.getAdditionalSalaryEntries,
    createAdditionalSalary: exports.createAdditionalSalary,
    updateAdditionalSalary: exports.updateAdditionalSalary,
    deleteAdditionalSalary: exports.deleteAdditionalSalary,
    approveAdditionalSalary: exports.approveAdditionalSalary,
    rejectAdditionalSalary: exports.rejectAdditionalSalary,
    cancelAdditionalSalary: exports.cancelAdditionalSalary,
    bulkApprove: exports.bulkApprove,
    getApprovedForPayroll: exports.getApprovedForPayroll,
    markAsApplied: exports.markAsApplied,
    getStats: exports.getStats
};
