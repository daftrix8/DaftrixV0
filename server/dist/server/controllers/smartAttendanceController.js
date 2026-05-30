"use strict";
/**
 * Smart Attendance Controller
 * Handles check-in/check-out punches, status queries, and HR review flow.
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
exports.linkUserToEmployee = exports.getUserEmployeeLinks = exports.removeLocation = exports.editLocation = exports.addLocation = exports.getLocation = exports.listLocations = exports.getStats = exports.reviewPunchAction = exports.listPendingReviews = exports.getMyStatus = exports.punchCheckIn = void 0;
const errorHandler_1 = require("../utils/errorHandler");
const smartAttendanceService_1 = require("../services/smartAttendanceService");
const db_1 = require("../db");
// ── Punch Endpoints ────────────────────────────────────────────────────
/**
 * POST /api/hr/smart-attendance/punch
 * Record a check-in or check-out punch.
 * Requires the user to have an employeeId linked.
 */
const punchCheckIn = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { punchType, gpsLatitude, gpsLongitude, gpsAccuracyMeters } = req.body;
        if (!punchType || !['CHECK_IN', 'CHECK_OUT'].includes(punchType)) {
            return res.status(400).json({ message: 'punchType must be CHECK_IN or CHECK_OUT' });
        }
        // Resolve employeeId from user
        const employeeId = yield resolveEmployeeId(user.id);
        if (!employeeId) {
            return res.status(400).json({
                message: 'حسابك غير مربوط بملف موظف. تواصل مع الإدارة.',
                code: 'NO_EMPLOYEE_LINK',
            });
        }
        const ip = ((_b = (_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.toString().split(',')[0]) === null || _b === void 0 ? void 0 : _b.trim())
            || ((_c = req.socket) === null || _c === void 0 ? void 0 : _c.remoteAddress) || 'unknown';
        const result = yield (0, smartAttendanceService_1.recordPunch)({
            employeeId,
            userId: user.id,
            punchType,
            gpsLatitude: gpsLatitude != null ? Number(gpsLatitude) : undefined,
            gpsLongitude: gpsLongitude != null ? Number(gpsLongitude) : undefined,
            gpsAccuracyMeters: gpsAccuracyMeters != null ? Number(gpsAccuracyMeters) : undefined,
            userAgent: req.headers['user-agent'] || '',
            ipAddress: ip,
            acceptLanguage: req.headers['accept-language'] || '',
        });
        res.json({
            success: true,
            punchId: result.punchId,
            confidence: result.confidence,
            attendanceRecordId: result.attendanceRecordId,
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Smart attendance punch failed');
    }
});
exports.punchCheckIn = punchCheckIn;
/**
 * GET /api/hr/smart-attendance/my-status
 * Get today's check-in/check-out status for the logged-in user.
 */
const getMyStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const employeeId = yield resolveEmployeeId(user.id);
        if (!employeeId) {
            return res.json({
                linked: false,
                message: 'حسابك غير مربوط بملف موظف',
            });
        }
        const status = yield (0, smartAttendanceService_1.getTodayStatus)(employeeId);
        res.json(Object.assign({ linked: true, employeeId }, status));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to get attendance status');
    }
});
exports.getMyStatus = getMyStatus;
// ── HR Review Endpoints ────────────────────────────────────────────────
/**
 * GET /api/hr/smart-attendance/pending-reviews
 * List punches flagged for HR review.
 */
const listPendingReviews = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const reviews = yield (0, smartAttendanceService_1.getPendingReviews)();
        res.json(reviews);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to list pending reviews');
    }
});
exports.listPendingReviews = listPendingReviews;
/**
 * POST /api/hr/smart-attendance/review/:punchId
 * Approve or reject a flagged punch.
 */
const reviewPunchAction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const { punchId } = req.params;
        const { action, notes } = req.body;
        if (!punchId) {
            return res.status(400).json({ message: 'punchId is required' });
        }
        if (!action || !['MANUALLY_APPROVED', 'MANUALLY_REJECTED'].includes(action)) {
            return res.status(400).json({ message: 'action must be MANUALLY_APPROVED or MANUALLY_REJECTED' });
        }
        yield (0, smartAttendanceService_1.reviewPunch)(punchId, action, (user === null || user === void 0 ? void 0 : user.id) || 'unknown', notes);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to review punch');
    }
});
exports.reviewPunchAction = reviewPunchAction;
/**
 * GET /api/hr/smart-attendance/stats
 * Dashboard analytics for admin settings page.
 */
const getStats = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const stats = yield (0, smartAttendanceService_1.getSmartAttendanceStats)();
        res.json(stats);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to fetch attendance stats');
    }
});
exports.getStats = getStats;
// ── Location (Geofence) Endpoints ──────────────────────────────────────
const listLocations = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const locations = yield (0, smartAttendanceService_1.getAllLocations)();
        res.json(locations);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to list locations');
    }
});
exports.listLocations = listLocations;
const getLocation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const location = yield (0, smartAttendanceService_1.getLocationById)(req.params.id);
        if (!location)
            return res.status(404).json({ message: 'Location not found' });
        res.json(location);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to get location');
    }
});
exports.getLocation = getLocation;
const addLocation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, latitude, longitude, radiusMeters, branchId } = req.body;
        if (!name || latitude == null || longitude == null) {
            return res.status(400).json({ message: 'name, latitude, longitude are required' });
        }
        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
            return res.status(400).json({ message: 'latitude and longitude must be numbers' });
        }
        const location = yield (0, smartAttendanceService_1.createLocation)({ name, latitude, longitude, radiusMeters, branchId });
        res.status(201).json(location);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to create location');
    }
});
exports.addLocation = addLocation;
const editLocation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, smartAttendanceService_1.updateLocation)(req.params.id, req.body);
        const updated = yield (0, smartAttendanceService_1.getLocationById)(req.params.id);
        res.json(updated);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to update location');
    }
});
exports.editLocation = editLocation;
const removeLocation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, smartAttendanceService_1.deleteLocation)(req.params.id);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to delete location');
    }
});
exports.removeLocation = removeLocation;
// ── User↔Employee Linking ──────────────────────────────────────────────
/**
 * GET /api/hr/smart-attendance/user-employee-links
 * List all users with their linked employee (if any).
 */
const getUserEmployeeLinks = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.pool.query(`
            SELECT u.id as userId, u.name as userName, u.username,
                   u.employeeId, e.fullName as employeeName
            FROM users u
            LEFT JOIN employees e ON u.employeeId = e.id
            WHERE u.isHidden = FALSE OR u.isHidden IS NULL
            ORDER BY u.name
        `);
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to get user-employee links');
    }
});
exports.getUserEmployeeLinks = getUserEmployeeLinks;
/**
 * PUT /api/hr/smart-attendance/link-employee
 * Link a user to an employee.
 */
const linkUserToEmployee = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, employeeId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: 'userId is required' });
        }
        // Prevent duplicate links — one employee can only be linked to one user
        if (employeeId) {
            const [existing] = yield db_1.pool.query('SELECT id, name FROM users WHERE employeeId = ? AND id != ?', [employeeId, userId]);
            if (existing.length > 0) {
                return res.status(409).json({
                    message: `هذا الموظف مربوط بالفعل بالمستخدم: ${existing[0].name}`,
                    code: 'DUPLICATE_EMPLOYEE_LINK',
                });
            }
        }
        // employeeId = null means unlink
        yield db_1.pool.query('UPDATE users SET employeeId = ? WHERE id = ?', [employeeId || null, userId]);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to link user to employee');
    }
});
exports.linkUserToEmployee = linkUserToEmployee;
// ── Helpers ────────────────────────────────────────────────────────────
function resolveEmployeeId(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const [rows] = yield db_1.pool.query('SELECT employeeId FROM users WHERE id = ?', [userId]);
        return ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.employeeId) || null;
    });
}
