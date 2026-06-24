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
exports.padTime = padTime;
exports.timeToMinutes = timeToMinutes;
exports.getLocalDateString = getLocalDateString;
exports.clearLockedCyclesCache = clearLockedCyclesCache;
exports.isPayrollLocked = isPayrollLocked;
exports.upsertAttendanceRecord = upsertAttendanceRecord;
const db_1 = require("../db");
const crypto_1 = require("crypto");
/**
 * Ensure time string is always in HH:MM format (zero-padded).
 * Prevents comparison bugs, e.g. "9:30" -> "09:30"
 */
function padTime(time) {
    if (!time)
        return '00:00';
    const parts = String(time).slice(0, 5).split(':');
    const h = (parts[0] || '0').padStart(2, '0');
    const m = (parts[1] || '0').padStart(2, '0');
    return `${h}:${m}`;
}
/** Convert "HH:MM" to total minutes for arithmetic. */
function timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}
/**
 * Extract YYYY-MM-DD from a Date using local timezone offsets.
 * Prevents UTC date shift at midnight boundaries.
 */
function getLocalDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
// In-memory cache for memoized lock lookups to speed up batch sync loops
const lockedCyclesCache = new Map();
/**
 * Clears the locked payroll cache. Useful in tests.
 */
function clearLockedCyclesCache() {
    lockedCyclesCache.clear();
}
/**
 * Checks if a date falls within a locked payroll period (APPROVED or PAID cycle).
 */
function isPayrollLocked(dateStr_1) {
    return __awaiter(this, arguments, void 0, function* (dateStr, conn = db_1.pool) {
        const year = parseInt(dateStr.slice(0, 4), 10);
        const month = parseInt(dateStr.slice(5, 7), 10);
        const cacheKey = `${year}-${month}`;
        if (lockedCyclesCache.has(cacheKey)) {
            return lockedCyclesCache.get(cacheKey);
        }
        const [rows] = yield conn.query(`SELECT 1 FROM payroll_cycles WHERE month = ? AND year = ? AND status IN ('APPROVED', 'PAID') LIMIT 1`, [month, year]);
        const isLocked = rows.length > 0;
        lockedCyclesCache.set(cacheKey, isLocked);
        return isLocked;
    });
}
/**
 * Safe upsert into attendance_records, incorporating late calculation and payroll-lock protection.
 */
function upsertAttendanceRecord(options_1) {
    return __awaiter(this, arguments, void 0, function* (options, conn = db_1.pool) {
        var _a, _b;
        const { employeeId, dateStr, checkIn, checkOut, notes, source } = options;
        try {
            // 1. Payroll Lock Check
            const locked = yield isPayrollLocked(dateStr, conn);
            if (locked) {
                console.log(`🔒 [PayrollLock] Prevented attendance write for employee "${employeeId}" on locked date "${dateStr}"`);
                return { status: 'LOCKED' };
            }
            // 2. Fetch Employee Schedule if not provided
            let scheduledStart = options.scheduledCheckIn;
            if (!scheduledStart) {
                const [empRows] = yield conn.query('SELECT scheduledCheckIn FROM employees WHERE id = ?', [employeeId]);
                scheduledStart = padTime(((_a = empRows[0]) === null || _a === void 0 ? void 0 : _a.scheduledCheckIn) || '09:00');
            }
            else {
                scheduledStart = padTime(scheduledStart);
            }
            // 3. Retrieve Existing Attendance Record for Merging
            const [existing] = yield conn.query('SELECT id, checkIn, checkOut FROM attendance_records WHERE employeeId = ? AND date = ?', [employeeId, dateStr]);
            // Keep the earliest check-in and latest check-out
            let mergedCheckIn = checkIn ? padTime(checkIn) : '';
            let mergedCheckOut = checkOut ? padTime(checkOut) : '';
            if (existing.length > 0) {
                const dbCheckIn = existing[0].checkIn ? padTime(existing[0].checkIn) : '';
                const dbCheckOut = existing[0].checkOut ? padTime(existing[0].checkOut) : '';
                if (dbCheckIn && (!mergedCheckIn || dbCheckIn < mergedCheckIn)) {
                    mergedCheckIn = dbCheckIn;
                }
                if (dbCheckOut && (!mergedCheckOut || dbCheckOut > mergedCheckOut)) {
                    mergedCheckOut = dbCheckOut;
                }
            }
            // 4. Late Minutes Calculation (supports night shift logic)
            let status = 'PRESENT';
            let lateMinutes = 0;
            if (mergedCheckIn) {
                const checkInMin = timeToMinutes(mergedCheckIn);
                const scheduledMin = timeToMinutes(scheduledStart);
                const MINUTES_IN_DAY = 1440;
                const LATE_WINDOW_MINUTES = 720; // 12-hour window limit
                const diff = (checkInMin - scheduledMin + MINUTES_IN_DAY) % MINUTES_IN_DAY;
                const isLate = diff > 0 && diff <= LATE_WINDOW_MINUTES;
                status = isLate ? 'LATE' : 'PRESENT';
                lateMinutes = isLate ? diff : 0;
            }
            const id = ((_b = existing[0]) === null || _b === void 0 ? void 0 : _b.id) || (0, crypto_1.randomUUID)();
            const [res] = yield conn.query(`INSERT INTO attendance_records (
                id, employeeId, date, checkIn, checkOut, status,
                isOvertime, overtimeHours, lateMinutes,
                scheduledCheckIn, notes, source
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                checkIn = VALUES(checkIn),
                checkOut = VALUES(checkOut),
                status = VALUES(status),
                lateMinutes = VALUES(lateMinutes),
                scheduledCheckIn = VALUES(scheduledCheckIn),
                notes = VALUES(notes),
                source = VALUES(source)`, [
                id,
                employeeId,
                dateStr,
                mergedCheckIn || null,
                mergedCheckOut || null,
                status,
                lateMinutes,
                scheduledStart,
                notes || (source === 'FINGERPRINT' ? 'بصمة آلية' : 'تسجيل ذكي'),
                source
            ]);
            const isNew = res && res.affectedRows === 1;
            return { status: 'SUCCESS', id, isNew };
        }
        catch (err) {
            console.error(`❌ Failed to upsert attendance record: ${err.message}`);
            return { status: 'FAILED' };
        }
    });
}
