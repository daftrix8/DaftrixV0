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
exports.getWorkEntrySummary = exports.resolveConflict = exports.validateWorkEntries = exports.generateWorkEntries = exports.deleteWorkEntry = exports.updateWorkEntry = exports.upsertWorkEntry = exports.getWorkEntries = exports.createWorkEntryType = exports.getWorkEntryTypes = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
// ============================================
// WORK ENTRY TYPE CRUD
// ============================================
const getWorkEntryTypes = () => __awaiter(void 0, void 0, void 0, function* () {
    const [rows] = yield db_1.pool.query(`
        SELECT * FROM work_entry_types 
        WHERE isActive = 1 
        ORDER BY sequence ASC
    `);
    return rows;
});
exports.getWorkEntryTypes = getWorkEntryTypes;
const createWorkEntryType = (data) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const id = (0, crypto_1.randomUUID)();
    yield db_1.pool.query(`
        INSERT INTO work_entry_types (id, name, nameEn, code, color, isPaid, isLeave, roundingType, sequence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, data.name, data.nameEn || null, data.code, data.color || '#3B82F6', (_a = data.isPaid) !== null && _a !== void 0 ? _a : true, (_b = data.isLeave) !== null && _b !== void 0 ? _b : false, data.roundingType || 'NO', data.sequence || 0]);
    return id;
});
exports.createWorkEntryType = createWorkEntryType;
// ============================================
// WORK ENTRY CRUD
// ============================================
const getWorkEntries = (params) => __awaiter(void 0, void 0, void 0, function* () {
    let query = `
        SELECT we.*, 
            wet.name as typeName, wet.nameEn as typeNameEn, wet.code as typeCode, 
            wet.color as typeColor, wet.isPaid, wet.isLeave,
            e.fullName as employeeName, e.department
        FROM work_entries we
        JOIN work_entry_types wet ON we.workEntryTypeId = wet.id
        JOIN employees e ON we.employeeId = e.id
        WHERE we.date BETWEEN ? AND ?
    `;
    const queryParams = [params.startDate, params.endDate];
    if (params.employeeId) {
        query += ' AND we.employeeId = ?';
        queryParams.push(params.employeeId);
    }
    if (params.status) {
        query += ' AND we.status = ?';
        queryParams.push(params.status);
    }
    if (params.payrollCycleId) {
        query += ' AND we.payrollCycleId = ?';
        queryParams.push(params.payrollCycleId);
    }
    query += ' ORDER BY e.fullName, we.date';
    const [rows] = yield db_1.pool.query(query, queryParams);
    return rows;
});
exports.getWorkEntries = getWorkEntries;
const upsertWorkEntry = (data) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const id = (0, crypto_1.randomUUID)();
    yield db_1.pool.query(`
        INSERT INTO work_entries 
        (id, employeeId, date, workEntryTypeId, hours, attendanceRecordId, leaveRequestId, 
         payrollCycleId, status, conflictReason, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            workEntryTypeId = VALUES(workEntryTypeId),
            hours = VALUES(hours),
            attendanceRecordId = VALUES(attendanceRecordId),
            leaveRequestId = VALUES(leaveRequestId),
            payrollCycleId = VALUES(payrollCycleId),
            status = VALUES(status),
            conflictReason = VALUES(conflictReason),
            notes = VALUES(notes),
            updatedAt = NOW()
    `, [
        id, data.employeeId, data.date, data.workEntryTypeId,
        (_a = data.hours) !== null && _a !== void 0 ? _a : 8,
        data.attendanceRecordId || null, data.leaveRequestId || null,
        data.payrollCycleId || null, data.status || 'DRAFT',
        data.conflictReason || null, data.notes || null
    ]);
    return id;
});
exports.upsertWorkEntry = upsertWorkEntry;
const updateWorkEntry = (id, data) => __awaiter(void 0, void 0, void 0, function* () {
    const fields = [];
    const values = [];
    let expectedVersion;
    Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
            if (key === 'version') {
                expectedVersion = value;
            }
            else {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
    });
    if (fields.length === 0)
        return;
    fields.push('version = version + 1');
    values.push(id);
    let query = `UPDATE work_entries SET ${fields.join(', ')}, updatedAt = NOW() WHERE id = ?`;
    if (expectedVersion !== undefined) {
        query += ' AND version = ?';
        values.push(expectedVersion);
    }
    const [result] = yield db_1.pool.query(query, values);
    if (expectedVersion !== undefined && result.affectedRows === 0) {
        throw new Error('CONCURRENT_MODIFICATION: تم تعديل هذا السجل من قبل مستخدم آخر، يرجى التحديث.');
    }
});
exports.updateWorkEntry = updateWorkEntry;
const deleteWorkEntry = (id) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query('DELETE FROM work_entries WHERE id = ?', [id]);
});
exports.deleteWorkEntry = deleteWorkEntry;
// ============================================
// AUTO-GENERATION
// ============================================
/**
 * Generate work entries for a payroll period
 * Fills from attendance records and approved leave requests
 */
const generateWorkEntries = (payrollCycleId, month, year) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Get all active employees
        const [employees] = yield conn.query('SELECT id, fullName, department FROM employees WHERE status = "ACTIVE"');
        // Get work entry types
        const [types] = yield conn.query('SELECT * FROM work_entry_types WHERE isActive = 1');
        const typeMap = {};
        for (const t of types) {
            typeMap[t.code] = t;
        }
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
        let totalGenerated = 0;
        let totalConflicts = 0;
        for (const emp of employees) {
            // Get attendance records for this period
            const [attendance] = yield conn.query(`
                SELECT * FROM attendance_records 
                WHERE employeeId = ? AND date BETWEEN ? AND ?
            `, [emp.id, startDate, endDate]);
            // Get approved leave requests overlapping this period
            const [leaves] = yield conn.query(`
                SELECT lr.*, lt.isPaid, lt.name as leaveTypeName
                FROM leave_requests lr
                JOIN leave_types lt ON lr.leaveTypeId = lt.id
                WHERE lr.employeeId = ? AND lr.status = 'APPROVED'
                  AND lr.startDate <= ? AND lr.endDate >= ?
            `, [emp.id, endDate, startDate]);
            // Build a map of attendance dates
            const attendanceMap = new Map();
            for (const att of attendance) {
                const dateStr = new Date(att.date).toISOString().split('T')[0];
                attendanceMap.set(dateStr, att);
            }
            // Build a map of leave dates
            const leaveDateMap = new Map();
            for (const leave of leaves) {
                const leaveStart = new Date(Math.max(new Date(leave.startDate).getTime(), new Date(startDate).getTime()));
                const leaveEnd = new Date(Math.min(new Date(leave.endDate).getTime(), new Date(endDate).getTime()));
                for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
                    const dateStr = d.toISOString().split('T')[0];
                    leaveDateMap.set(dateStr, leave);
                }
            }
            // Generate entry for each day in the period
            for (let day = 1; day <= lastDay; day++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayOfWeek = new Date(dateStr).getDay(); // 0=Sunday, 5=Friday, 6=Saturday
                const isFriday = dayOfWeek === 5;
                const att = attendanceMap.get(dateStr);
                const leave = leaveDateMap.get(dateStr);
                let entryTypeCode;
                let hours = 8;
                let status = 'VALIDATED';
                let conflictReason = null;
                let attId = null;
                let leaveId = null;
                if (att && leave) {
                    // CONFLICT: both attendance and leave exist for same day
                    entryTypeCode = 'ATTENDANCE'; // Default to attendance
                    status = 'CONFLICT';
                    conflictReason = `يوجد حضور وإجازة في نفس اليوم (${leave.leaveTypeName})`;
                    hours = parseFloat(att.hoursWorked) || 8;
                    attId = att.id;
                    leaveId = leave.id;
                    totalConflicts++;
                }
                else if (leave) {
                    // Leave day
                    if (leave.isPaid) {
                        entryTypeCode = ((_a = leave.leaveTypeName) === null || _a === void 0 ? void 0 : _a.includes('مرض')) ? 'SICK_LEAVE' : 'LEAVE_PAID';
                    }
                    else {
                        entryTypeCode = 'LEAVE_UNPAID';
                    }
                    hours = 8;
                    leaveId = leave.id;
                }
                else if (att) {
                    // Normal attendance
                    if (att.status === 'ABSENT') {
                        entryTypeCode = 'ABSENT';
                        hours = 0;
                    }
                    else {
                        entryTypeCode = 'ATTENDANCE';
                        hours = parseFloat(att.hoursWorked) || 8;
                    }
                    attId = att.id;
                }
                else if (isFriday) {
                    // Friday = weekend
                    entryTypeCode = 'WEEKEND';
                    hours = 0;
                }
                else {
                    // No record at all — CONFLICT (missing)
                    entryTypeCode = 'ABSENT';
                    status = 'CONFLICT';
                    conflictReason = 'لا يوجد سجل حضور لهذا اليوم';
                    hours = 0;
                    totalConflicts++;
                }
                const entryType = typeMap[entryTypeCode];
                if (!entryType)
                    continue;
                yield conn.query(`
                    INSERT INTO work_entries 
                    (id, employeeId, date, workEntryTypeId, hours, attendanceRecordId, 
                     leaveRequestId, payrollCycleId, status, conflictReason)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        workEntryTypeId = VALUES(workEntryTypeId),
                        hours = VALUES(hours),
                        attendanceRecordId = VALUES(attendanceRecordId),
                        leaveRequestId = VALUES(leaveRequestId),
                        payrollCycleId = VALUES(payrollCycleId),
                        status = VALUES(status),
                        conflictReason = VALUES(conflictReason),
                        updatedAt = NOW()
                `, [
                    (0, crypto_1.randomUUID)(), emp.id, dateStr, entryType.id,
                    hours, attId, leaveId, payrollCycleId,
                    status, conflictReason
                ]);
                totalGenerated++;
            }
        }
        yield conn.commit();
        return { generated: totalGenerated, conflicts: totalConflicts, employees: employees.length };
    }
    catch (error) {
        yield conn.rollback();
        throw error;
    }
    finally {
        conn.release();
    }
});
exports.generateWorkEntries = generateWorkEntries;
// ============================================
// VALIDATION
// ============================================
/**
 * Validate all draft work entries for a period
 */
const validateWorkEntries = (startDate, endDate, employeeId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    let query = `
        UPDATE work_entries 
        SET status = 'VALIDATED' 
        WHERE status = 'DRAFT' AND date BETWEEN ? AND ?
    `;
    const params = [startDate, endDate];
    if (employeeId) {
        query += ' AND employeeId = ?';
        params.push(employeeId);
    }
    const [result] = yield db_1.pool.query(query, params);
    // Count remaining conflicts
    let conflictQuery = `
        SELECT COUNT(*) as count FROM work_entries 
        WHERE status = 'CONFLICT' AND date BETWEEN ? AND ?
    `;
    const conflictParams = [startDate, endDate];
    if (employeeId) {
        conflictQuery += ' AND employeeId = ?';
        conflictParams.push(employeeId);
    }
    const [conflicts] = yield db_1.pool.query(conflictQuery, conflictParams);
    return {
        validated: result.affectedRows || 0,
        conflicts: ((_a = conflicts[0]) === null || _a === void 0 ? void 0 : _a.count) || 0
    };
});
exports.validateWorkEntries = validateWorkEntries;
/**
 * Resolve a conflict by choosing a work entry type
 */
const resolveConflict = (workEntryId_1, workEntryTypeId_1, ...args_1) => __awaiter(void 0, [workEntryId_1, workEntryTypeId_1, ...args_1], void 0, function* (workEntryId, workEntryTypeId, hours = 8, version) {
    let query = `
        UPDATE work_entries 
        SET workEntryTypeId = ?, hours = ?, status = 'VALIDATED', conflictReason = NULL, updatedAt = NOW(), version = version + 1
        WHERE id = ?
    `;
    const params = [workEntryTypeId, hours, workEntryId];
    if (version !== undefined) {
        query += ' AND version = ?';
        params.push(version);
    }
    const [result] = yield db_1.pool.query(query, params);
    if (version !== undefined && result.affectedRows === 0) {
        throw new Error('CONCURRENT_MODIFICATION: تم تعديل هذا السجل من قبل مستخدم آخر، يرجى التحديث.');
    }
});
exports.resolveConflict = resolveConflict;
// ============================================
// SUMMARY FOR PAYROLL
// ============================================
/**
 * Get work entry summary for payroll calculation
 */
const getWorkEntrySummary = (employeeId, startDate, endDate) => __awaiter(void 0, void 0, void 0, function* () {
    const [rows] = yield db_1.pool.query(`
        SELECT 
            we.employeeId,
            e.fullName as employeeName,
            e.department,
            COUNT(*) as totalDays,
            SUM(CASE WHEN wet.code = 'ATTENDANCE' THEN 1 ELSE 0 END) as attendanceDays,
            SUM(CASE WHEN wet.code = 'LEAVE_PAID' THEN 1 ELSE 0 END) as paidLeaveDays,
            SUM(CASE WHEN wet.code = 'LEAVE_UNPAID' THEN 1 ELSE 0 END) as unpaidLeaveDays,
            SUM(CASE WHEN wet.code = 'SICK_LEAVE' THEN 1 ELSE 0 END) as sickLeaveDays,
            SUM(CASE WHEN wet.code = 'HOLIDAY' THEN 1 ELSE 0 END) as holidayDays,
            SUM(CASE WHEN wet.code = 'WEEKEND' THEN 1 ELSE 0 END) as weekendDays,
            SUM(CASE WHEN wet.code = 'ABSENT' THEN 1 ELSE 0 END) as absentDays,
            SUM(CASE WHEN wet.code = 'OVERTIME' THEN we.hours ELSE 0 END) as overtimeHours,
            SUM(CASE WHEN wet.isPaid = 1 THEN 1 ELSE 0 END) as totalPaidDays,
            SUM(CASE WHEN wet.isPaid = 0 THEN 1 ELSE 0 END) as totalUnpaidDays,
            SUM(CASE WHEN we.status = 'CONFLICT' THEN 1 ELSE 0 END) as conflictCount,
            SUM(CASE WHEN we.status = 'VALIDATED' THEN 1 ELSE 0 END) as validatedCount,
            SUM(CASE WHEN we.status = 'DRAFT' THEN 1 ELSE 0 END) as draftCount
        FROM work_entries we
        JOIN work_entry_types wet ON we.workEntryTypeId = wet.id
        JOIN employees e ON we.employeeId = e.id
        WHERE we.employeeId = ? AND we.date BETWEEN ? AND ?
        GROUP BY we.employeeId, e.fullName, e.department
    `, [employeeId, startDate, endDate]);
    if (rows.length === 0) {
        return {
            employeeId,
            employeeName: '',
            totalDays: 0,
            attendanceDays: 0,
            paidLeaveDays: 0,
            unpaidLeaveDays: 0,
            sickLeaveDays: 0,
            holidayDays: 0,
            weekendDays: 0,
            absentDays: 0,
            overtimeHours: 0,
            totalPaidDays: 0,
            totalUnpaidDays: 0,
            conflictCount: 0,
            validatedCount: 0,
            draftCount: 0
        };
    }
    const row = rows[0];
    return {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        department: row.department,
        totalDays: Number(row.totalDays),
        attendanceDays: Number(row.attendanceDays),
        paidLeaveDays: Number(row.paidLeaveDays),
        unpaidLeaveDays: Number(row.unpaidLeaveDays),
        sickLeaveDays: Number(row.sickLeaveDays),
        holidayDays: Number(row.holidayDays),
        weekendDays: Number(row.weekendDays),
        absentDays: Number(row.absentDays),
        overtimeHours: Number(row.overtimeHours),
        totalPaidDays: Number(row.totalPaidDays),
        totalUnpaidDays: Number(row.totalUnpaidDays),
        conflictCount: Number(row.conflictCount),
        validatedCount: Number(row.validatedCount),
        draftCount: Number(row.draftCount)
    };
});
exports.getWorkEntrySummary = getWorkEntrySummary;
exports.default = {
    getWorkEntryTypes: exports.getWorkEntryTypes,
    createWorkEntryType: exports.createWorkEntryType,
    getWorkEntries: exports.getWorkEntries,
    upsertWorkEntry: exports.upsertWorkEntry,
    updateWorkEntry: exports.updateWorkEntry,
    deleteWorkEntry: exports.deleteWorkEntry,
    generateWorkEntries: exports.generateWorkEntries,
    validateWorkEntries: exports.validateWorkEntries,
    resolveConflict: exports.resolveConflict,
    getWorkEntrySummary: exports.getWorkEntrySummary
};
