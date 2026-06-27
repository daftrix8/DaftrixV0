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
exports.getTodayBranchKioskStats = exports.generateBranchQr = exports.autoMatchUsersAndEmployees = exports.getAudit = exports.resetEmployeeDevice = exports.linkUserToEmployee = exports.getUserEmployeeLinks = exports.removeLocation = exports.editLocation = exports.addLocation = exports.getLocation = exports.listLocations = exports.getStats = exports.reviewPunchAction = exports.listPendingReviews = exports.getMyStatus = exports.punchBulkCheckIn = exports.punchCheckIn = void 0;
const errorHandler_1 = require("../utils/errorHandler");
const smartAttendanceService_1 = require("../services/smartAttendanceService");
const db_1 = require("../db");
const userController_1 = require("./userController");
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
        const { punchType, gpsLatitude, gpsLongitude, gpsAccuracyMeters, wifiSsid, isMockGps, selfieBase64, deviceId, offlineCreatedTime, qrToken } = req.body;
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
            wifiSsid: wifiSsid ? String(wifiSsid) : undefined,
            isMockGps: isMockGps != null ? Boolean(isMockGps) : undefined,
            userAgent: req.headers['user-agent'] || '',
            ipAddress: ip,
            acceptLanguage: req.headers['accept-language'] || '',
            selfieBase64: selfieBase64 ? String(selfieBase64) : undefined,
            deviceId: deviceId ? String(deviceId) : undefined,
            offlineCreatedTime: offlineCreatedTime ? String(offlineCreatedTime) : undefined,
            qrToken: qrToken ? String(qrToken) : undefined,
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
const punchBulkCheckIn = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { punches } = req.body; // Array of PunchRequest parameters
        if (!Array.isArray(punches) || punches.length === 0) {
            return res.status(400).json({ message: 'punches array is required and must not be empty' });
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
        const results = [];
        for (const p of punches) {
            try {
                const resVal = yield (0, smartAttendanceService_1.recordPunch)({
                    employeeId,
                    userId: user.id,
                    punchType: p.punchType,
                    gpsLatitude: p.gpsLatitude != null ? Number(p.gpsLatitude) : undefined,
                    gpsLongitude: p.gpsLongitude != null ? Number(p.gpsLongitude) : undefined,
                    gpsAccuracyMeters: p.gpsAccuracyMeters != null ? Number(p.gpsAccuracyMeters) : undefined,
                    wifiSsid: p.wifiSsid ? String(p.wifiSsid) : undefined,
                    isMockGps: p.isMockGps != null ? Boolean(p.isMockGps) : undefined,
                    userAgent: req.headers['user-agent'] || '',
                    ipAddress: ip,
                    acceptLanguage: req.headers['accept-language'] || '',
                    selfieBase64: p.selfieBase64 ? String(p.selfieBase64) : undefined,
                    deviceId: p.deviceId ? String(p.deviceId) : undefined,
                    offlineCreatedTime: p.offlineCreatedTime ? String(p.offlineCreatedTime) : undefined,
                    qrToken: p.qrToken ? String(p.qrToken) : undefined,
                });
                results.push({ success: true, punchId: resVal.punchId, status: resVal.confidence.status });
            }
            catch (err) {
                results.push({ success: false, error: err.message || 'Failed' });
            }
        }
        res.json({ success: true, results });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Bulk smart attendance punches failed');
    }
});
exports.punchBulkCheckIn = punchBulkCheckIn;
/**
 * GET /api/hr/smart-attendance/my-status
 * Get today's check-in/check-out status for the logged-in user.
 */
const getMyStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
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
        const clientIp = ((_b = (_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.toString().split(',')[0]) === null || _b === void 0 ? void 0 : _b.trim())
            || ((_c = req.socket) === null || _c === void 0 ? void 0 : _c.remoteAddress) || 'unknown';
        const [empRows] = yield db_1.pool.query('SELECT boundDeviceId, fullName FROM employees WHERE id = ?', [employeeId]);
        res.json(Object.assign({ linked: true, employeeId, username: user.username, userName: user.name, clientIp, userAgent: req.headers['user-agent'] || '', boundDeviceId: ((_d = empRows[0]) === null || _d === void 0 ? void 0 : _d.boundDeviceId) || null, employeeName: ((_e = empRows[0]) === null || _e === void 0 ? void 0 : _e.fullName) || '' }, status));
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
        if (action === 'MANUALLY_REJECTED' && (!notes || !notes.trim())) {
            return res.status(400).json({ message: 'الرجاء إدخال سبب الرفض' });
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
        const { name, latitude, longitude, radiusMeters, branchId, wifiSsid, allowedIp } = req.body;
        if (!name || latitude == null || longitude == null) {
            return res.status(400).json({ message: 'name, latitude, longitude are required' });
        }
        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
            return res.status(400).json({ message: 'latitude and longitude must be numbers' });
        }
        const location = yield (0, smartAttendanceService_1.createLocation)({ name, latitude, longitude, radiusMeters, branchId, wifiSsid, allowedIp });
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
                   u.employeeId, e.fullName as employeeName, u.userType,
                   e.boundDeviceId,
                   (SELECT ipAddress FROM smart_attendance_punches WHERE userId = u.id ORDER BY punchTime DESC LIMIT 1) as lastIpAddress,
                   (SELECT userAgent FROM smart_attendance_punches WHERE userId = u.id ORDER BY punchTime DESC LIMIT 1) as lastUserAgent,
                   (SELECT deviceId FROM smart_attendance_punches WHERE userId = u.id ORDER BY punchTime DESC LIMIT 1) as lastDeviceId
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
        const { userId, employeeId, userType } = req.body;
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
        yield db_1.pool.query('UPDATE users SET employeeId = ?, userType = ? WHERE id = ?', [employeeId || null, userType || 'NORMAL', userId]);
        if (employeeId) {
            // Get user information for synchronization
            const [userRows] = yield db_1.pool.query('SELECT name, role, salesmanId FROM users WHERE id = ?', [userId]);
            const user = userRows[0];
            if (userType === 'STAFF') {
                // Call createSalesmanForUser to create/link a salesman profile
                const salesmanId = yield (0, userController_1.createSalesmanForUser)(db_1.pool, userId, employeeId, { name: user.name });
                console.log(`👤 [AttendanceLink] Created/linked salesman ${salesmanId} for user ${user.name}`);
            }
            else if (userType === 'NORMAL' && (user === null || user === void 0 ? void 0 : user.salesmanId)) {
                // If linked as NORMAL, clear/unlink salesman
                yield db_1.pool.query('UPDATE users SET salesmanId = NULL WHERE id = ?', [userId]);
                try {
                    yield db_1.pool.query('UPDATE employees SET salesmanId = NULL WHERE id = ?', [employeeId]);
                }
                catch (_a) { }
                yield db_1.pool.query('UPDATE salesmen SET employeeId = NULL, userId = NULL WHERE id = ?', [user.salesmanId]);
                console.log(`👤 [AttendanceLink] Unlinked salesman ${user.salesmanId} because connection type is NORMAL`);
            }
        }
        else {
            // If completely unlinked: clear salesman from user and employee
            const [userRows] = yield db_1.pool.query('SELECT salesmanId FROM users WHERE id = ?', [userId]);
            const user = userRows[0];
            if (user === null || user === void 0 ? void 0 : user.salesmanId) {
                yield db_1.pool.query('UPDATE users SET salesmanId = NULL WHERE id = ?', [userId]);
                yield db_1.pool.query('UPDATE salesmen SET employeeId = NULL, userId = NULL WHERE id = ?', [user.salesmanId]);
            }
        }
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
const resetEmployeeDevice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employeeId } = req.params;
        if (!employeeId) {
            return res.status(400).json({ message: 'employeeId is required' });
        }
        yield (0, smartAttendanceService_1.resetDeviceBinding)(employeeId);
        res.json({ success: true, message: 'تم إعادة تعيين جهاز الموظف بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to reset employee device');
    }
});
exports.resetEmployeeDevice = resetEmployeeDevice;
const getAudit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employeeId, status, riskMin, riskMax, fromDate, toDate, limit } = req.query;
        const logs = yield (0, smartAttendanceService_1.getAuditLogs)({
            employeeId: employeeId ? String(employeeId) : undefined,
            status: status ? String(status) : undefined,
            riskMin: riskMin ? Number(riskMin) : undefined,
            riskMax: riskMax ? Number(riskMax) : undefined,
            fromDate: fromDate ? String(fromDate) : undefined,
            toDate: toDate ? String(toDate) : undefined,
            limit: limit ? Number(limit) : undefined,
        });
        res.json(logs);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to fetch audit logs');
    }
});
exports.getAudit = getAudit;
const autoMatchUsersAndEmployees = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Find unlinked users
        const [users] = yield db_1.pool.query('SELECT id, name, email, phone FROM users WHERE employeeId IS NULL AND (isHidden = FALSE OR isHidden IS NULL)');
        // Find unlinked active employees
        const [employees] = yield db_1.pool.query(`SELECT id, fullName, email, phone FROM employees 
             WHERE id NOT IN (SELECT employeeId FROM users WHERE employeeId IS NOT NULL)
             AND status = 'ACTIVE'`);
        let matchCount = 0;
        const matchedPairs = [];
        // Helper to normalize phone numbers for robust matching (last 9 digits)
        const normPhone = (p) => {
            if (!p)
                return '';
            const cleaned = p.replace(/\D/g, '');
            return cleaned.length >= 9 ? cleaned.slice(-9) : cleaned;
        };
        for (const u of users) {
            let matchedEmp = null;
            let reason = '';
            // 1. Try matching by email
            if (u.email) {
                matchedEmp = employees.find((e) => e.email && e.email.trim().toLowerCase() === u.email.trim().toLowerCase());
                if (matchedEmp)
                    reason = 'مطابقة البريد الإلكتروني';
            }
            // 2. Try matching by phone
            if (!matchedEmp && u.phone) {
                const uPhoneNorm = normPhone(u.phone);
                if (uPhoneNorm) {
                    matchedEmp = employees.find((e) => e.phone && normPhone(e.phone) === uPhoneNorm);
                    if (matchedEmp)
                        reason = 'مطابقة رقم الهاتف';
                }
            }
            // 3. Try matching by exact name
            if (!matchedEmp && u.name) {
                matchedEmp = employees.find((e) => e.fullName && e.fullName.trim().toLowerCase() === u.name.trim().toLowerCase());
                if (matchedEmp)
                    reason = 'مطابقة الاسم بالكامل';
            }
            if (matchedEmp) {
                // Link them!
                yield db_1.pool.query('UPDATE users SET employeeId = ?, userType = ? WHERE id = ?', [matchedEmp.id, 'NORMAL', u.id]);
                // Remove matched employee from pool so they aren't matched twice
                const idx = employees.indexOf(matchedEmp);
                if (idx > -1)
                    employees.splice(idx, 1);
                matchedPairs.push({
                    userName: u.name,
                    employeeName: matchedEmp.fullName,
                    reason
                });
                matchCount++;
            }
        }
        res.json({
            success: true,
            matchCount,
            matchedPairs
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to auto-match users and employees');
    }
});
exports.autoMatchUsersAndEmployees = autoMatchUsersAndEmployees;
/**
 * GET /api/hr/smart-attendance/branch-qr/:branchId
 * Generates a dynamic QR token for the specified branch.
 */
const generateBranchQr = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { branchId } = req.params;
        if (!branchId) {
            return res.status(400).json({ message: 'branchId is required' });
        }
        // Verify that the branch exists
        const [branchRows] = yield db_1.pool.query('SELECT id FROM branches WHERE id = ?', [branchId]);
        if (branchRows.length === 0) {
            return res.status(404).json({ message: 'الفرع المحدد غير موجود في النظام' });
        }
        const qrToken = (0, smartAttendanceService_1.generateBranchQrToken)(branchId);
        res.json({ success: true, qrToken });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to generate branch QR token');
    }
});
exports.generateBranchQr = generateBranchQr;
/**
 * GET /api/hr/smart-attendance/branch-stats/:branchId
 * Retrieves today's stats and history for the branch kiosk.
 */
const getTodayBranchKioskStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { branchId } = req.params;
        if (!branchId) {
            return res.status(400).json({ message: 'branchId is required' });
        }
        const data = yield (0, smartAttendanceService_1.getTodayBranchAttendance)(branchId);
        res.json(Object.assign({ success: true }, data));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to get branch kiosk stats');
    }
});
exports.getTodayBranchKioskStats = getTodayBranchKioskStats;
