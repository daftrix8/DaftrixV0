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
exports.recordAttendance = exports.getAttendance = void 0;
const db_1 = require("../../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../../utils/errorHandler");
const getAttendance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { date, employeeId, startDate, endDate } = req.query;
    try {
        let query = `
      SELECT ar.*, e.fullName 
      FROM attendance_records ar
      JOIN employees e ON ar.employeeId = e.id
      WHERE 1=1
    `;
        const params = [];
        if (employeeId) {
            query += ` AND ar.employeeId = ?`;
            params.push(employeeId);
        }
        if (date) {
            query += ` AND ar.date = ?`;
            params.push(date);
        }
        if (startDate && endDate) {
            query += ` AND ar.date BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        }
        query += ` ORDER BY ar.date DESC, e.fullName`;
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching attendance:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch attendance');
    }
});
exports.getAttendance = getAttendance;
/**
 * Record or upsert attendance.
 * NOTE (Fix #10): This relies on ON DUPLICATE KEY UPDATE.
 * For this to work as expected, the table attendance_records MUST have a unique constraint:
 * ALTER TABLE attendance_records ADD UNIQUE KEY uq_emp_date (employeeId, date);
 */
const recordAttendance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, date, checkIn, checkOut, status, isOvertime, overtimeHours, notes, lateMinutes, earlyLeaveMinutes, scheduledCheckIn, scheduledCheckOut, source } = req.body;
    try {
        const id = (0, crypto_1.randomUUID)();
        // Calculate late minutes if checkIn and scheduledCheckIn are provided
        let calculatedLateMinutes = lateMinutes || 0;
        let calculatedEarlyLeaveMinutes = earlyLeaveMinutes || 0;
        const defaultScheduledCheckIn = scheduledCheckIn || '09:00:00';
        const defaultScheduledCheckOut = scheduledCheckOut || '17:00:00';
        // Auto-calculate late minutes from checkIn time
        if (checkIn && !lateMinutes && status !== 'ABSENT') {
            const [schedHours, schedMins] = defaultScheduledCheckIn.split(':').map(Number);
            const [checkHours, checkMins] = checkIn.split(':').map(Number);
            const schedMinutes = schedHours * 60 + schedMins;
            const checkMinutes = checkHours * 60 + checkMins;
            calculatedLateMinutes = Math.max(0, checkMinutes - schedMinutes);
        }
        // Auto-calculate early leave minutes from checkOut time
        if (checkOut && !earlyLeaveMinutes && status !== 'ABSENT') {
            const [schedHours, schedMins] = defaultScheduledCheckOut.split(':').map(Number);
            const [checkHours, checkMins] = checkOut.split(':').map(Number);
            const schedMinutes = schedHours * 60 + schedMins;
            const checkMinutes = checkHours * 60 + checkMins;
            calculatedEarlyLeaveMinutes = Math.max(0, schedMinutes - checkMinutes);
        }
        // Determine status based on late minutes if not explicitly set
        let finalStatus = status || 'PRESENT';
        if (!status && calculatedLateMinutes > 0) {
            finalStatus = 'LATE';
        }
        // Upsert logic (insert or update if exists for same day)
        yield db_1.pool.query(`
      INSERT INTO attendance_records (
        id, employeeId, date, checkIn, checkOut, status,
        isOvertime, overtimeHours, lateMinutes, earlyLeaveMinutes,
        scheduledCheckIn, scheduledCheckOut, notes, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        checkIn = VALUES(checkIn),
        checkOut = VALUES(checkOut),
        status = VALUES(status),
        isOvertime = VALUES(isOvertime),
        overtimeHours = VALUES(overtimeHours),
        lateMinutes = VALUES(lateMinutes),
        earlyLeaveMinutes = VALUES(earlyLeaveMinutes),
        scheduledCheckIn = VALUES(scheduledCheckIn),
        scheduledCheckOut = VALUES(scheduledCheckOut),
        notes = VALUES(notes),
        source = VALUES(source)
    `, [
            id, employeeId, date,
            checkIn || null, // empty string '' is invalid for TIME — use null
            checkOut || null, // same
            finalStatus,
            isOvertime || false, overtimeHours || 0,
            calculatedLateMinutes, calculatedEarlyLeaveMinutes,
            defaultScheduledCheckIn, defaultScheduledCheckOut, notes,
            source || 'MANUAL'
        ]);
        res.json({
            message: 'Attendance recorded successfully',
            lateMinutes: calculatedLateMinutes,
            earlyLeaveMinutes: calculatedEarlyLeaveMinutes,
            status: finalStatus
        });
    }
    catch (error) {
        console.error('Error recording attendance:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'record attendance');
    }
});
exports.recordAttendance = recordAttendance;
