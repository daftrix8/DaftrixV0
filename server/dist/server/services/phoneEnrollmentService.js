"use strict";
/**
 * Phone Enrollment Service
 * Allows HR to bind an employee's phone for attendance
 * WITHOUT creating a full ERP user account.
 *
 * Flow:
 *   1. HR generates a 6-digit pairing code for an employee
 *   2. Employee enters code on /phone-attendance page
 *   3. Service validates code, binds deviceId, returns employee-scoped JWT
 *   4. Employee uses that JWT to punch attendance (reuses existing recordPunch)
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePairingCode = generatePairingCode;
exports.enrollPhone = enrollPhone;
exports.verifyPhoneToken = verifyPhoneToken;
exports.getPhoneEnrolledEmployees = getPhoneEnrolledEmployees;
exports.revokePhoneEnrollment = revokePhoneEnrollment;
exports.bulkGeneratePairingCodes = bulkGeneratePairingCodes;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
// ── Constants ──────────────────────────────────────────────────────────
const PAIRING_CODE_LENGTH = 6;
const PAIRING_CODE_TTL_MINUTES = 10;
const PHONE_JWT_EXPIRY = '365d'; // Long-lived — phone stays enrolled until reset
const JWT_SECRET = process.env.JWT_SECRET || 'phone-attendance-fallback';
// ── Pairing Code Generation ────────────────────────────────────────────
function generateNumericCode(length) {
    const digits = '0123456789';
    let code = '';
    const randomBytes = crypto_1.default.randomBytes(length);
    for (let i = 0; i < length; i++) {
        code += digits[randomBytes[i] % digits.length];
    }
    return code;
}
/**
 * Generate a 6-digit pairing code for an employee.
 * Invalidates any existing unused codes for the same employee.
 */
function generatePairingCode(employeeId) {
    return __awaiter(this, void 0, void 0, function* () {
        // Verify employee exists and is active
        const [empRows] = yield db_1.pool.query('SELECT id, fullName, status FROM employees WHERE id = ?', [employeeId]);
        if (empRows.length === 0) {
            throw new Error('الموظف غير موجود');
        }
        if (empRows[0].status !== 'ACTIVE') {
            throw new Error('الموظف غير نشط');
        }
        // Invalidate any existing unused codes for this employee
        yield db_1.pool.query('UPDATE employee_phone_tokens SET isUsed = TRUE WHERE employeeId = ? AND isUsed = FALSE', [employeeId]);
        // Generate a unique code (retry up to 5 times for collisions)
        let code = '';
        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 5) {
            code = generateNumericCode(PAIRING_CODE_LENGTH);
            const [existing] = yield db_1.pool.query('SELECT id FROM employee_phone_tokens WHERE pairingCode = ? AND isUsed = FALSE AND expiresAt > NOW()', [code]);
            if (existing.length === 0) {
                isUnique = true;
            }
            attempts++;
        }
        if (!isUnique) {
            throw new Error('فشل في إنشاء رمز فريد. حاول مرة أخرى.');
        }
        const id = crypto_1.default.randomUUID();
        const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60 * 1000);
        yield db_1.pool.query(`INSERT INTO employee_phone_tokens (id, employeeId, pairingCode, isUsed, expiresAt)
         VALUES (?, ?, ?, FALSE, ?)`, [id, employeeId, code, expiresAt]);
        return {
            code,
            expiresAt,
            employeeName: empRows[0].fullName,
        };
    });
}
// ── Phone Enrollment ───────────────────────────────────────────────────
/**
 * Enrolls a phone by validating the pairing code and binding the device.
 * Returns a long-lived JWT scoped to attendance operations only.
 */
function enrollPhone(pairingCode, deviceId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!pairingCode || pairingCode.length !== PAIRING_CODE_LENGTH) {
            throw new Error('رمز الربط غير صالح');
        }
        if (!deviceId) {
            throw new Error('معرّف الجهاز مطلوب');
        }
        // Find valid, unused token
        const [tokenRows] = yield db_1.pool.query(`SELECT t.id, t.employeeId, e.fullName as employeeName, e.boundDeviceId, e.status
         FROM employee_phone_tokens t
         JOIN employees e ON t.employeeId = e.id
         WHERE t.pairingCode = ? AND t.isUsed = FALSE AND t.expiresAt > NOW()
         LIMIT 1`, [pairingCode]);
        if (tokenRows.length === 0) {
            throw new Error('رمز الربط غير صالح أو منتهي الصلاحية');
        }
        const record = tokenRows[0];
        if (record.status !== 'ACTIVE') {
            throw new Error('الموظف غير نشط');
        }
        // Check if another device is already bound
        if (record.boundDeviceId && record.boundDeviceId !== deviceId) {
            // Allow re-binding — HR explicitly generated a new code, so they want to rebind
        }
        // Bind device to employee
        yield db_1.pool.query('UPDATE employees SET boundDeviceId = ? WHERE id = ?', [deviceId, record.employeeId]);
        // Generate employee-scoped JWT
        const token = jsonwebtoken_1.default.sign({
            employeeId: record.employeeId,
            deviceId,
            scope: 'phone-attendance',
        }, JWT_SECRET, { expiresIn: PHONE_JWT_EXPIRY });
        // Mark code as used and store JWT + device info
        yield db_1.pool.query(`UPDATE employee_phone_tokens
         SET isUsed = TRUE, deviceId = ?, phoneJwt = ?, enrolledAt = NOW()
         WHERE id = ?`, [deviceId, token, record.id]);
        console.log(`📱 [PhoneEnroll] Employee "${record.employeeName}" (${record.employeeId}) bound to device ${deviceId.substring(0, 12)}...`);
        return {
            token,
            employeeId: record.employeeId,
            employeeName: record.employeeName,
        };
    });
}
// ── Phone JWT Middleware ────────────────────────────────────────────────
/**
 * Middleware that verifies phone-attendance JWTs.
 * Sets req.phoneEmployee with { employeeId, deviceId }.
 */
function verifyPhoneToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'مطلوب تسجيل الدخول', code: 'NO_TOKEN' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (decoded.scope !== 'phone-attendance') {
            return res.status(403).json({ message: 'صلاحيات غير كافية', code: 'WRONG_SCOPE' });
        }
        req.phoneEmployee = {
            employeeId: decoded.employeeId,
            deviceId: decoded.deviceId,
        };
        next();
    }
    catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'انتهت صلاحية الجلسة. أعد الربط.', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ message: 'رمز غير صالح', code: 'INVALID_TOKEN' });
    }
}
// ── Phone-linked Employee Queries ──────────────────────────────────────
/**
 * Get all phone-enrolled employees for the HR management UI.
 */
function getPhoneEnrolledEmployees() {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield db_1.pool.query(`
        SELECT 
            e.id as employeeId,
            e.fullName as employeeName,
            e.department,
            e.branchId,
            e.boundDeviceId,
            e.phone,
            e.avatar,
            t.enrolledAt,
            t.deviceId as enrolledDeviceId,
            (SELECT COUNT(*) FROM smart_attendance_punches WHERE employeeId = e.id AND DATE(punchTime) = CURDATE()) as todayPunchCount,
            (SELECT MAX(punchTime) FROM smart_attendance_punches WHERE employeeId = e.id) as lastPunchTime
        FROM employees e
        INNER JOIN employee_phone_tokens t ON t.employeeId = e.id AND t.isUsed = TRUE
        WHERE e.status = 'ACTIVE'
          AND e.id NOT IN (SELECT employeeId FROM users WHERE employeeId IS NOT NULL)
        GROUP BY e.id
        ORDER BY t.enrolledAt DESC
    `);
        return rows;
    });
}
/**
 * Revoke phone enrollment for an employee (unbind device + invalidate tokens).
 */
function revokePhoneEnrollment(employeeId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield db_1.pool.query('UPDATE employees SET boundDeviceId = NULL WHERE id = ?', [employeeId]);
        yield db_1.pool.query('UPDATE employee_phone_tokens SET isUsed = TRUE WHERE employeeId = ?', [employeeId]);
        console.log(`📱 [PhoneEnroll] Revoked enrollment for employee ${employeeId}`);
    });
}
/**
 * Bulk generate pairing codes for multiple employees.
 * Returns array of { employeeId, employeeName, code, expiresAt }.
 */
function bulkGeneratePairingCodes(employeeIds_1) {
    return __awaiter(this, arguments, void 0, function* (employeeIds, ttlMinutes = PAIRING_CODE_TTL_MINUTES) {
        const results = [];
        for (const employeeId of employeeIds) {
            try {
                const result = yield generatePairingCode(employeeId);
                results.push({
                    employeeId,
                    employeeName: result.employeeName,
                    code: result.code,
                    expiresAt: result.expiresAt,
                });
            }
            catch (err) {
                console.warn(`⚠️ [PhoneEnroll] Skipped bulk code for ${employeeId}: ${err.message}`);
            }
        }
        return results;
    });
}
