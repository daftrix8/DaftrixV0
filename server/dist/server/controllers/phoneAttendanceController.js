"use strict";
/**
 * Phone Attendance Controller
 * Handles phone-only attendance endpoints:
 *   - POST /enroll         — enroll phone with pairing code
 *   - POST /punch          — record check-in/check-out (phone JWT required)
 *   - GET  /status         — today's attendance status (phone JWT required)
 *
 * Reuses existing recordPunch() — no business logic duplication.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeEnrollment = exports.listEnrolled = exports.bulkGenerateCodes = exports.generateCode = exports.phoneStatus = exports.phonePunch = exports.phoneEnroll = void 0;
const errorHandler_1 = require("../utils/errorHandler");
const phoneEnrollmentService_1 = require("../services/phoneEnrollmentService");
const smartAttendanceService_1 = require("../services/smartAttendanceService");
const db_1 = require("../db");
const eventBus_1 = require("../utils/eventBus");
// ── Public: Phone Enrollment ───────────────────────────────────────────
/**
 * POST /api/phone-attendance/enroll
 * Body: { code, deviceId }
 */
const phoneEnroll = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { code, deviceId } = req.body;
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ message: 'رمز الربط مطلوب' });
        }
        if (!deviceId || typeof deviceId !== 'string') {
            return res.status(400).json({ message: 'معرّف الجهاز مطلوب' });
        }
        const result = yield (0, phoneEnrollmentService_1.enrollPhone)(code.trim(), deviceId.trim());
        res.json({
            success: true,
            token: result.token,
            employeeId: result.employeeId,
            employeeName: result.employeeName,
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Phone enrollment failed');
    }
});
exports.phoneEnroll = phoneEnroll;
// ── Phone JWT Protected: Punch ─────────────────────────────────────────
/**
 * POST /api/phone-attendance/punch
 * Phone JWT required via verifyPhoneToken middleware.
 */
const phonePunch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { employeeId, deviceId } = req.phoneEmployee;
        const { punchType, gpsLatitude, gpsLongitude, gpsAccuracyMeters, isMockGps, selfieBase64, qrToken, } = req.body;
        if (!punchType || !['CHECK_IN', 'CHECK_OUT'].includes(punchType)) {
            return res.status(400).json({ message: 'punchType must be CHECK_IN or CHECK_OUT' });
        }
        // Verify device is still bound
        const [empRows] = yield db_1.pool.query('SELECT boundDeviceId, fullName FROM employees WHERE id = ?', [employeeId]);
        if (empRows.length === 0) {
            return res.status(404).json({ message: 'الموظف غير موجود', code: 'EMPLOYEE_NOT_FOUND' });
        }
        if (empRows[0].boundDeviceId && empRows[0].boundDeviceId !== deviceId) {
            return res.status(403).json({
                message: 'هذا الجهاز غير مسجل. أعد الربط من خلال الإدارة.',
                code: 'DEVICE_MISMATCH',
            });
        }
        const ip = ((_b = (_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.toString().split(',')[0]) === null || _b === void 0 ? void 0 : _b.trim())
            || ((_c = req.socket) === null || _c === void 0 ? void 0 : _c.remoteAddress) || 'unknown';
        const result = yield (0, smartAttendanceService_1.recordPunch)({
            employeeId,
            userId: `phone:${employeeId}`,
            punchType,
            gpsLatitude: gpsLatitude != null ? Number(gpsLatitude) : undefined,
            gpsLongitude: gpsLongitude != null ? Number(gpsLongitude) : undefined,
            gpsAccuracyMeters: gpsAccuracyMeters != null ? Number(gpsAccuracyMeters) : undefined,
            isMockGps: isMockGps != null ? Boolean(isMockGps) : undefined,
            userAgent: req.headers['user-agent'] || '',
            ipAddress: ip,
            acceptLanguage: req.headers['accept-language'] || '',
            selfieBase64: selfieBase64 ? String(selfieBase64) : undefined,
            deviceId,
            qrToken: qrToken ? String(qrToken) : undefined,
        });
        // Broadcast punch event for kiosk live feed
        broadcastPunchEvent(employeeId, empRows[0].fullName, punchType, result.confidence.status);
        res.json({
            success: true,
            punchId: result.punchId,
            confidence: result.confidence,
            attendanceRecordId: result.attendanceRecordId,
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Phone attendance punch failed');
    }
});
exports.phonePunch = phonePunch;
// ── Phone JWT Protected: Status ────────────────────────────────────────
/**
 * GET /api/phone-attendance/status
 * Returns today's check-in/out status for the phone-linked employee.
 */
const phoneStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employeeId, deviceId } = req.phoneEmployee;
        const [empRows] = yield db_1.pool.query('SELECT fullName, boundDeviceId, avatar FROM employees WHERE id = ?', [employeeId]);
        if (empRows.length === 0) {
            return res.status(404).json({ message: 'الموظف غير موجود' });
        }
        // Verify device binding
        if (empRows[0].boundDeviceId && empRows[0].boundDeviceId !== deviceId) {
            return res.status(403).json({
                message: 'هذا الجهاز غير مسجل. أعد الربط.',
                code: 'DEVICE_MISMATCH',
            });
        }
        const status = yield (0, smartAttendanceService_1.getTodayStatus)(employeeId);
        res.json(Object.assign({ linked: true, employeeId, employeeName: empRows[0].fullName, avatar: empRows[0].avatar || null, boundDeviceId: empRows[0].boundDeviceId }, status));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to get phone attendance status');
    }
});
exports.phoneStatus = phoneStatus;
// ── HR Admin: Pairing Code Generation (ERP auth required) ──────────────
/**
 * POST /api/hr/phone-enrollment/generate-code
 * Body: { employeeId }
 */
const generateCode = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employeeId } = req.body;
        if (!employeeId) {
            return res.status(400).json({ message: 'employeeId مطلوب' });
        }
        const result = yield (0, phoneEnrollmentService_1.generatePairingCode)(employeeId);
        res.json({
            success: true,
            code: result.code,
            expiresAt: result.expiresAt,
            employeeName: result.employeeName,
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to generate pairing code');
    }
});
exports.generateCode = generateCode;
/**
 * POST /api/hr/phone-enrollment/bulk-generate
 * Body: { employeeIds: string[] }
 */
const bulkGenerateCodes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employeeIds } = req.body;
        if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
            return res.status(400).json({ message: 'employeeIds array is required' });
        }
        const results = yield (0, phoneEnrollmentService_1.bulkGeneratePairingCodes)(employeeIds);
        res.json({ success: true, codes: results });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to bulk generate pairing codes');
    }
});
exports.bulkGenerateCodes = bulkGenerateCodes;
/**
 * GET /api/hr/phone-enrollment/enrolled
 * Returns all phone-enrolled employees (not linked via user accounts).
 */
const listEnrolled = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const employees = yield (0, phoneEnrollmentService_1.getPhoneEnrolledEmployees)();
        res.json(employees);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to list enrolled employees');
    }
});
exports.listEnrolled = listEnrolled;
/**
 * POST /api/hr/phone-enrollment/revoke
 * Body: { employeeId }
 */
const revokeEnrollment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employeeId } = req.body;
        if (!employeeId) {
            return res.status(400).json({ message: 'employeeId مطلوب' });
        }
        yield (0, phoneEnrollmentService_1.revokePhoneEnrollment)(employeeId);
        res.json({ success: true, message: 'تم إلغاء ربط الهاتف بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to revoke phone enrollment');
    }
});
exports.revokeEnrollment = revokeEnrollment;
// ── Helper: Broadcast punch to kiosk displays ──────────────────────────
function broadcastPunchEvent(employeeId, employeeName, punchType, status) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const [empRows] = yield db_1.pool.query('SELECT branchId, avatar FROM employees WHERE id = ?', [employeeId]);
            const branchId = ((_a = empRows[0]) === null || _a === void 0 ? void 0 : _a.branchId) || null;
            const avatar = ((_b = empRows[0]) === null || _b === void 0 ? void 0 : _b.avatar) || null;
            eventBus_1.eventBus.broadcast('attendance:punch', {
                employeeId,
                employeeName,
                employeeAvatar: avatar,
                punchType,
                status,
                branchId,
                time: new Date().toISOString(),
            });
        }
        catch (err) {
            console.error('❌ Failed to broadcast punch event:', err.message);
        }
    });
}
