"use strict";
/**
 * Smart Attendance Service
 * Multi-signal confidence scoring for login-based attendance.
 * Replaces fingerprint machines with GPS geofencing + device fingerprint.
 *
 * Signal weights (no WiFi — mobile browsers don't support BSSID API):
 *   GPS geofence match:     50%
 *   Device fingerprint:     20%
 *   Login session:          15%
 *   Schedule time window:   15%
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
exports.getLocations = getLocations;
exports.getAllLocations = getAllLocations;
exports.getLocationById = getLocationById;
exports.createLocation = createLocation;
exports.updateLocation = updateLocation;
exports.deleteLocation = deleteLocation;
exports.calculateConfidence = calculateConfidence;
exports.recordPunch = recordPunch;
exports.getTodayStatus = getTodayStatus;
exports.getPendingReviews = getPendingReviews;
exports.reviewPunch = reviewPunch;
exports.getSmartAttendanceStats = getSmartAttendanceStats;
exports.haversineDistance = haversineDistance;
exports.generateDeviceFingerprint = generateDeviceFingerprint;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const crypto_2 = __importDefault(require("crypto"));
// ── Constants ──────────────────────────────────────────────────────────
const SIGNAL_WEIGHTS = {
    GPS: 50,
    DEVICE: 20,
    SESSION: 15,
    TIME_WINDOW: 15,
};
const CONFIDENCE_THRESHOLDS = {
    AUTO_APPROVE: 70,
    REVIEW: 40,
};
const EARTH_RADIUS_METERS = 6371000;
const MAX_GPS_ACCURACY_METERS = 500;
// ── Anti-fraud constants ───────────────────────────────────────────────
const PUNCH_COOLDOWN_SECONDS = 300; // 5 minutes between same-type punches
const MAX_REJECTED_PER_DAY = 3; // lock out after 3 rejections
const MAX_VELOCITY_KMH = 200; // teleportation detection threshold
const PERFECT_ACCURACY_THRESHOLD = 1; // GPS accuracy ≤1m is suspiciously perfect (mock GPS)
// ── Geofence CRUD ──────────────────────────────────────────────────────
function getLocations() {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield db_1.pool.query('SELECT * FROM attendance_locations WHERE isActive = TRUE ORDER BY name');
        return rows;
    });
}
function getAllLocations() {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield db_1.pool.query('SELECT * FROM attendance_locations ORDER BY name');
        return rows;
    });
}
function getLocationById(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield db_1.pool.query('SELECT * FROM attendance_locations WHERE id = ?', [id]);
        return rows.length > 0 ? rows[0] : null;
    });
}
function createLocation(data) {
    return __awaiter(this, void 0, void 0, function* () {
        const id = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`INSERT INTO attendance_locations (id, name, latitude, longitude, radiusMeters, branchId)
         VALUES (?, ?, ?, ?, ?, ?)`, [id, data.name, data.latitude, data.longitude, data.radiusMeters || 200, data.branchId || null]);
        return (yield getLocationById(id));
    });
}
function updateLocation(id, data) {
    return __awaiter(this, void 0, void 0, function* () {
        const fields = [];
        const values = [];
        const allowed = ['name', 'latitude', 'longitude', 'radiusMeters', 'branchId', 'isActive'];
        for (const field of allowed) {
            if (data[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(data[field]);
            }
        }
        if (fields.length === 0)
            return;
        values.push(id);
        yield db_1.pool.query(`UPDATE attendance_locations SET ${fields.join(', ')} WHERE id = ?`, values);
    });
}
function deleteLocation(id) {
    return __awaiter(this, void 0, void 0, function* () {
        yield db_1.pool.query('DELETE FROM attendance_locations WHERE id = ?', [id]);
    });
}
// ── Pre-Punch Validation ───────────────────────────────────────────────
/**
 * Enforce cooldown, daily rejection cap, and velocity checks.
 * Throws descriptive error if any check fails.
 */
function validatePunchEligibility(employeeId, punchType, gpsLatitude, gpsLongitude) {
    return __awaiter(this, void 0, void 0, function* () {
        const today = getLocalDateString(new Date());
        // 1. Cooldown — no same-type punch within PUNCH_COOLDOWN_SECONDS
        const [recentRows] = yield db_1.pool.query(`SELECT punchTime FROM smart_attendance_punches
         WHERE employeeId = ? AND punchType = ? AND DATE(punchTime) = ?
         ORDER BY punchTime DESC LIMIT 1`, [employeeId, punchType, today]);
        if (recentRows.length > 0) {
            const lastPunch = new Date(recentRows[0].punchTime);
            const elapsedSeconds = (Date.now() - lastPunch.getTime()) / 1000;
            if (elapsedSeconds < PUNCH_COOLDOWN_SECONDS) {
                const remaining = Math.ceil(PUNCH_COOLDOWN_SECONDS - elapsedSeconds);
                throw new Error(`يجب الانتظار ${remaining} ثانية قبل التسجيل مرة أخرى`);
            }
        }
        // 2. Daily rejection cap
        const [rejectRows] = yield db_1.pool.query(`SELECT COUNT(*) as cnt FROM smart_attendance_punches
         WHERE employeeId = ? AND DATE(punchTime) = ?
         AND verificationStatus = 'REJECTED'`, [employeeId, today]);
        if (rejectRows[0].cnt >= MAX_REJECTED_PER_DAY) {
            throw new Error('تم تجاوز الحد الأقصى للمحاولات المرفوضة اليوم. تواصل مع الإدارة.');
        }
        // 3. Velocity check — can't teleport between GPS locations
        if (gpsLatitude != null && gpsLongitude != null) {
            const [lastGps] = yield db_1.pool.query(`SELECT gpsLatitude, gpsLongitude, punchTime
             FROM smart_attendance_punches
             WHERE employeeId = ? AND gpsLatitude IS NOT NULL
             ORDER BY punchTime DESC LIMIT 1`, [employeeId]);
            if (lastGps.length > 0) {
                const prev = lastGps[0];
                const distanceMeters = haversineDistance(gpsLatitude, gpsLongitude, Number(prev.gpsLatitude), Number(prev.gpsLongitude));
                const elapsedHours = (Date.now() - new Date(prev.punchTime).getTime()) / 3600000;
                if (elapsedHours > 0) {
                    const velocityKmh = (distanceMeters / 1000) / elapsedHours;
                    if (velocityKmh > MAX_VELOCITY_KMH) {
                        throw new Error(`تم رصد تنقل غير طبيعي: ${Math.round(distanceMeters / 1000)}كم في ${Math.round(elapsedHours * 60)} دقيقة`);
                    }
                }
            }
        }
    });
}
// ── Confidence Scoring ─────────────────────────────────────────────────
function calculateConfidence(req) {
    return __awaiter(this, void 0, void 0, function* () {
        const signals = [];
        let matchedLocationId = null;
        let gpsDistanceMeters = null;
        // ── Signal 1: GPS Geofence ────────────────────────────────────────
        const locations = yield getLocations();
        if (req.gpsLatitude != null && req.gpsLongitude != null && locations.length > 0) {
            // Flag suspiciously perfect GPS accuracy (mock GPS apps report 0.0m)
            const isMockSuspect = req.gpsAccuracyMeters != null
                && req.gpsAccuracyMeters <= PERFECT_ACCURACY_THRESHOLD;
            // Reject absurdly inaccurate GPS readings
            if (req.gpsAccuracyMeters && req.gpsAccuracyMeters > MAX_GPS_ACCURACY_METERS) {
                signals.push({
                    signal: 'GPS',
                    score: 0,
                    weight: SIGNAL_WEIGHTS.GPS,
                    weighted: 0,
                    detail: `GPS accuracy too low: ${req.gpsAccuracyMeters}m (max: ${MAX_GPS_ACCURACY_METERS}m)`,
                });
            }
            else {
                let closestDistance = Infinity;
                let closestLocation = null;
                for (const loc of locations) {
                    const distance = haversineDistance(req.gpsLatitude, req.gpsLongitude, Number(loc.latitude), Number(loc.longitude));
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestLocation = loc;
                    }
                }
                gpsDistanceMeters = Math.round(closestDistance);
                if (closestLocation && closestDistance <= closestLocation.radiusMeters) {
                    // Inside geofence — score scaled by proximity
                    const proximityRatio = 1 - (closestDistance / closestLocation.radiusMeters);
                    let gpsScore = Math.round(70 + (proximityRatio * 30)); // 70-100
                    matchedLocationId = closestLocation.id;
                    // Penalize suspiciously perfect accuracy
                    if (isMockSuspect) {
                        gpsScore = Math.round(gpsScore * 0.6);
                    }
                    signals.push({
                        signal: 'GPS',
                        score: gpsScore,
                        weight: SIGNAL_WEIGHTS.GPS,
                        weighted: Math.round(gpsScore * SIGNAL_WEIGHTS.GPS / 100),
                        detail: isMockSuspect
                            ? `Inside "${closestLocation.name}" — ${gpsDistanceMeters}m ⚠️ GPS accuracy suspiciously perfect`
                            : `Inside "${closestLocation.name}" — ${gpsDistanceMeters}m from center (radius: ${closestLocation.radiusMeters}m)`,
                    });
                }
                else {
                    // Outside all geofences
                    const overshoot = closestLocation
                        ? closestDistance - closestLocation.radiusMeters
                        : closestDistance;
                    const decayScore = Math.max(0, Math.round(50 * (1 - overshoot / 500)));
                    signals.push({
                        signal: 'GPS',
                        score: decayScore,
                        weight: SIGNAL_WEIGHTS.GPS,
                        weighted: Math.round(decayScore * SIGNAL_WEIGHTS.GPS / 100),
                        detail: `Outside geofence — ${gpsDistanceMeters}m from nearest (${closestLocation === null || closestLocation === void 0 ? void 0 : closestLocation.name})`,
                    });
                }
            }
        }
        else if (locations.length === 0) {
            // No geofences configured — skip GPS scoring entirely, give full credit
            signals.push({
                signal: 'GPS',
                score: 100,
                weight: SIGNAL_WEIGHTS.GPS,
                weighted: SIGNAL_WEIGHTS.GPS,
                detail: 'No geofences configured — GPS check skipped',
            });
        }
        else {
            signals.push({
                signal: 'GPS',
                score: 0,
                weight: SIGNAL_WEIGHTS.GPS,
                weighted: 0,
                detail: 'GPS data not provided',
            });
        }
        // ── Signal 2: Device Fingerprint ──────────────────────────────────
        const deviceFingerprint = generateDeviceFingerprint(req.userAgent, req.ipAddress, req.acceptLanguage);
        const deviceScore = yield scoreDeviceConsistency(req.employeeId, deviceFingerprint);
        signals.push({
            signal: 'DEVICE',
            score: deviceScore.score,
            weight: SIGNAL_WEIGHTS.DEVICE,
            weighted: Math.round(deviceScore.score * SIGNAL_WEIGHTS.DEVICE / 100),
            detail: deviceScore.detail,
        });
        // ── Signal 3: Login Session ───────────────────────────────────────
        signals.push({
            signal: 'SESSION',
            score: 100,
            weight: SIGNAL_WEIGHTS.SESSION,
            weighted: SIGNAL_WEIGHTS.SESSION,
            detail: 'Authenticated user session verified',
        });
        // ── Signal 4: Time Window ─────────────────────────────────────────
        const timeScore = yield scoreTimeWindow(req.employeeId, req.punchType);
        signals.push({
            signal: 'TIME_WINDOW',
            score: timeScore.score,
            weight: SIGNAL_WEIGHTS.TIME_WINDOW,
            weighted: Math.round(timeScore.score * SIGNAL_WEIGHTS.TIME_WINDOW / 100),
            detail: timeScore.detail,
        });
        // ── Total ─────────────────────────────────────────────────────────
        const totalScore = signals.reduce((sum, s) => sum + s.weighted, 0);
        let status;
        if (totalScore >= CONFIDENCE_THRESHOLDS.AUTO_APPROVE) {
            status = 'AUTO_APPROVED';
        }
        else if (totalScore >= CONFIDENCE_THRESHOLDS.REVIEW) {
            status = 'PENDING_REVIEW';
        }
        else {
            status = 'REJECTED';
        }
        return { totalScore, status, signals, matchedLocationId, gpsDistanceMeters };
    });
}
// ── Punch Recording ────────────────────────────────────────────────────
function recordPunch(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        // ── Pre-punch validation (cooldown, cap, velocity) ────────────────
        yield validatePunchEligibility(req.employeeId, req.punchType, req.gpsLatitude, req.gpsLongitude);
        // ── Advisory lock to prevent double-click race conditions ─────────
        const lockName = `smart_punch_${req.employeeId}`;
        const [lockResult] = yield db_1.pool.query('SELECT GET_LOCK(?, 5) as acquired', [lockName]);
        if (!((_a = lockResult[0]) === null || _a === void 0 ? void 0 : _a.acquired)) {
            throw new Error('جاري معالجة تسجيل سابق، يرجى الانتظار');
        }
        try {
            const confidence = yield calculateConfidence(req);
            const deviceFingerprint = generateDeviceFingerprint(req.userAgent, req.ipAddress, req.acceptLanguage);
            const punchId = (0, crypto_1.randomUUID)();
            const now = new Date();
            // ── Store raw punch (immutable audit trail) ────────────────────
            yield db_1.pool.query(`INSERT INTO smart_attendance_punches
             (id, employeeId, userId, punchTime, punchType,
              gpsLatitude, gpsLongitude, gpsAccuracyMeters,
              matchedLocationId, gpsDistanceMeters,
              deviceFingerprint, ipAddress, userAgent,
              confidenceScore, verificationStatus)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                punchId, req.employeeId, req.userId, now, req.punchType,
                req.gpsLatitude || null, req.gpsLongitude || null, req.gpsAccuracyMeters || null,
                confidence.matchedLocationId, confidence.gpsDistanceMeters,
                deviceFingerprint, req.ipAddress, req.userAgent,
                confidence.totalScore, confidence.status,
            ]);
            // ── Write to attendance_records ONLY for auto-approved ─────────
            // PENDING_REVIEW punches wait until HR approves via reviewPunch()
            let attendanceRecordId;
            if (confidence.status === 'AUTO_APPROVED') {
                attendanceRecordId = yield upsertAttendanceRecord(req, now);
            }
            return { punchId, confidence, attendanceRecordId };
        }
        finally {
            yield db_1.pool.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => { });
        }
    });
}
// ── Attendance Record Upsert ───────────────────────────────────────────
function upsertAttendanceRecord(req, punchTime) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        // Use local time, NOT UTC — prevents date drift at midnight boundaries
        const dateStr = getLocalDateString(punchTime);
        const timeStr = punchTime.toTimeString().slice(0, 5); // HH:MM (already local)
        // Get employee scheduled check-in for late calculation
        const [empRows] = yield db_1.pool.query('SELECT scheduledCheckIn FROM employees WHERE id = ?', [req.employeeId]);
        const scheduledStart = padTime(((_a = empRows[0]) === null || _a === void 0 ? void 0 : _a.scheduledCheckIn) || '09:00');
        if (req.punchType === 'CHECK_IN') {
            // Late calculation (same logic as fingerprintService)
            const checkInMin = timeToMinutes(timeStr);
            const scheduledMin = timeToMinutes(scheduledStart);
            const MINUTES_IN_DAY = 1440;
            const LATE_WINDOW_MINUTES = 720;
            const diff = (checkInMin - scheduledMin + MINUTES_IN_DAY) % MINUTES_IN_DAY;
            const isLate = diff > 0 && diff <= LATE_WINDOW_MINUTES;
            const status = isLate ? 'LATE' : 'PRESENT';
            const lateMinutes = isLate ? diff : 0;
            const id = (0, crypto_1.randomUUID)();
            const [result] = yield db_1.pool.query(`INSERT INTO attendance_records
             (id, employeeId, date, checkIn, status, lateMinutes, scheduledCheckIn, notes, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SMART')
             ON DUPLICATE KEY UPDATE
                 checkIn = IF(VALUES(checkIn) < checkIn OR checkIn IS NULL, VALUES(checkIn), checkIn),
                 status = VALUES(status),
                 lateMinutes = VALUES(lateMinutes),
                 scheduledCheckIn = VALUES(scheduledCheckIn),
                 source = 'SMART',
                 notes = VALUES(notes)`, [id, req.employeeId, dateStr, timeStr, status, lateMinutes, scheduledStart, 'تسجيل ذكي']);
            return result.insertId || id;
        }
        else {
            // CHECK_OUT — update existing record's checkOut
            yield db_1.pool.query(`UPDATE attendance_records
             SET checkOut = ?,
                 notes = CONCAT(COALESCE(notes, ''), ' | انصراف ذكي')
             WHERE employeeId = ? AND date = ?`, [timeStr, req.employeeId, dateStr]);
            return '';
        }
    });
}
// ── Today's Status ─────────────────────────────────────────────────────
function getTodayStatus(employeeId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const today = new Date().toISOString().split('T')[0];
        const [rows] = yield db_1.pool.query(`SELECT punchType, TIME_FORMAT(punchTime, '%H:%i') as time, confidenceScore
         FROM smart_attendance_punches
         WHERE employeeId = ? AND DATE(punchTime) = ?
         ORDER BY punchTime`, [employeeId, today]);
        const checkIn = rows.find((r) => r.punchType === 'CHECK_IN');
        const checkOut = rows.find((r) => r.punchType === 'CHECK_OUT');
        return {
            hasCheckedIn: !!checkIn,
            hasCheckedOut: !!checkOut,
            checkInTime: (checkIn === null || checkIn === void 0 ? void 0 : checkIn.time) || null,
            checkOutTime: (checkOut === null || checkOut === void 0 ? void 0 : checkOut.time) || null,
            checkInScore: (_a = checkIn === null || checkIn === void 0 ? void 0 : checkIn.confidenceScore) !== null && _a !== void 0 ? _a : null,
            checkOutScore: (_b = checkOut === null || checkOut === void 0 ? void 0 : checkOut.confidenceScore) !== null && _b !== void 0 ? _b : null,
        };
    });
}
// ── Pending Reviews ────────────────────────────────────────────────────
function getPendingReviews() {
    return __awaiter(this, arguments, void 0, function* (limit = 50) {
        const [rows] = yield db_1.pool.query(`SELECT sap.*, e.fullName as employeeName, al.name as locationName,
                al.latitude as officeLatitude, al.longitude as officeLongitude, al.radiusMeters as officeRadiusMeters
         FROM smart_attendance_punches sap
         LEFT JOIN employees e ON sap.employeeId = e.id
         LEFT JOIN attendance_locations al ON sap.matchedLocationId = al.id
         WHERE sap.verificationStatus = 'PENDING_REVIEW'
         ORDER BY sap.punchTime DESC
         LIMIT ?`, [limit]);
        return rows;
    });
}
function reviewPunch(punchId, action, reviewedBy, notes) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield db_1.pool.getConnection();
        try {
            yield conn.beginTransaction();
            yield conn.query(`UPDATE smart_attendance_punches
             SET verificationStatus = ?, reviewedBy = ?, reviewedAt = NOW(), reviewNotes = ?
             WHERE id = ?`, [action, reviewedBy, notes || null, punchId]);
            // If manually approved and no attendance record exists, create one
            if (action === 'MANUALLY_APPROVED') {
                const [punch] = yield conn.query('SELECT * FROM smart_attendance_punches WHERE id = ?', [punchId]);
                if (punch.length > 0) {
                    const p = punch[0];
                    const dateStr = new Date(p.punchTime).toISOString().split('T')[0];
                    const timeStr = new Date(p.punchTime).toTimeString().slice(0, 5);
                    if (p.punchType === 'CHECK_IN') {
                        const id = (0, crypto_1.randomUUID)();
                        yield conn.query(`INSERT INTO attendance_records
                         (id, employeeId, date, checkIn, status, notes, source)
                         VALUES (?, ?, ?, ?, 'PRESENT', ?, 'SMART')
                         ON DUPLICATE KEY UPDATE
                             checkIn = VALUES(checkIn), status = 'PRESENT',
                             source = 'SMART', notes = VALUES(notes)`, [id, p.employeeId, dateStr, timeStr, 'موافقة يدوية على تسجيل ذكي']);
                    }
                    else {
                        yield conn.query(`UPDATE attendance_records SET checkOut = ? WHERE employeeId = ? AND date = ?`, [timeStr, p.employeeId, dateStr]);
                    }
                }
            }
            yield conn.commit();
        }
        catch (err) {
            yield conn.rollback();
            throw err;
        }
        finally {
            conn.release();
        }
    });
}
// ── Analytics ──────────────────────────────────────────────────────────
function getSmartAttendanceStats() {
    return __awaiter(this, void 0, void 0, function* () {
        const today = getLocalDateString(new Date());
        // 1. Linked employees
        const [linkedRows] = yield db_1.pool.query('SELECT COUNT(*) as cnt FROM users WHERE employeeId IS NOT NULL');
        // 2. Today's punches
        const [todayRows] = yield db_1.pool.query(`SELECT
            COUNT(DISTINCT employeeId) as checkedIn,
            COUNT(CASE WHEN verificationStatus = 'PENDING_REVIEW' THEN 1 END) as pendingReviews
         FROM smart_attendance_punches
         WHERE DATE(punchTime) = ? AND punchType = 'CHECK_IN'`, [today]);
        // 3. Last 7 days distribution
        const [distRows] = yield db_1.pool.query(`SELECT
            COUNT(CASE WHEN confidenceScore >= 70 THEN 1 END) as approved,
            COUNT(CASE WHEN confidenceScore >= 40 AND confidenceScore < 70 THEN 1 END) as review,
            COUNT(CASE WHEN confidenceScore < 40 THEN 1 END) as rejected,
            AVG(confidenceScore) as avgScore
         FROM smart_attendance_punches
         WHERE punchTime >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`);
        // 4. Top flagged employees
        const [flaggedRows] = yield db_1.pool.query(`SELECT sap.employeeId, e.fullName as employeeName, COUNT(*) as flagCount
         FROM smart_attendance_punches sap
         JOIN employees e ON sap.employeeId = e.id
         WHERE sap.verificationStatus = 'PENDING_REVIEW'
            OR sap.verificationStatus = 'REJECTED'
         GROUP BY sap.employeeId, e.fullName
         ORDER BY flagCount DESC
         LIMIT 5`);
        return {
            linkedEmployees: linkedRows[0].cnt || 0,
            todayCheckedIn: todayRows[0].checkedIn || 0,
            pendingReviews: todayRows[0].pendingReviews || 0,
            avgConfidence: Math.round(distRows[0].avgScore || 0),
            scoreDistribution: {
                approved: distRows[0].approved || 0,
                review: distRows[0].review || 0,
                rejected: distRows[0].rejected || 0,
            },
            topFlagged: flaggedRows,
        };
    });
}
// ── Helpers ────────────────────────────────────────────────────────────
/**
 * Haversine formula — great-circle distance between two GPS coordinates.
 * Returns distance in meters.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_METERS * c;
}
/**
 * Generate a stable device fingerprint from browser signals.
 * Not meant to be cryptographically unique — just consistent enough
 * to detect when the same employee suddenly uses a different device.
 */
function generateDeviceFingerprint(userAgent, ipAddress, acceptLanguage) {
    const raw = `${userAgent}|${acceptLanguage || ''}`;
    return crypto_2.default.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}
/**
 * Score device consistency.
 * First punch ever from this employee → 80 (benefit of the doubt).
 * Same fingerprint as last 3 punches → 100.
 * Different fingerprint → 30 (flagged but not blocked).
 */
function scoreDeviceConsistency(employeeId, currentFingerprint) {
    return __awaiter(this, void 0, void 0, function* () {
        const [recent] = yield db_1.pool.query(`SELECT deviceFingerprint FROM smart_attendance_punches
         WHERE employeeId = ?
         ORDER BY punchTime DESC LIMIT 3`, [employeeId]);
        if (recent.length === 0) {
            return { score: 80, detail: 'First smart check-in — new device baseline' };
        }
        const matches = recent.filter((r) => r.deviceFingerprint === currentFingerprint).length;
        const matchRatio = matches / recent.length;
        if (matchRatio >= 0.66) {
            return { score: 100, detail: 'Consistent device — matches recent history' };
        }
        else if (matchRatio > 0) {
            return { score: 60, detail: 'Partially recognized device — mixed history' };
        }
        return { score: 30, detail: 'Unrecognized device — different from recent punches' };
    });
}
/**
 * Score whether the punch falls within a reasonable time window
 * relative to the employee's scheduled hours.
 */
function scoreTimeWindow(employeeId, punchType) {
    return __awaiter(this, void 0, void 0, function* () {
        const [empRows] = yield db_1.pool.query('SELECT scheduledCheckIn, scheduledCheckOut FROM employees WHERE id = ?', [employeeId]);
        if (empRows.length === 0) {
            return { score: 50, detail: 'Employee schedule not found' };
        }
        const emp = empRows[0];
        const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
        const EARLY_WINDOW_MINUTES = 120; // 2 hours before scheduled
        const LATE_WINDOW_MINUTES = 240; // 4 hours after scheduled
        if (punchType === 'CHECK_IN') {
            const scheduledMin = timeToMinutes(padTime(emp.scheduledCheckIn || '09:00'));
            const diffFromScheduled = nowMinutes - scheduledMin;
            if (diffFromScheduled >= -EARLY_WINDOW_MINUTES && diffFromScheduled <= LATE_WINDOW_MINUTES) {
                // Within reasonable window
                const earlyBonus = diffFromScheduled <= 0 ? 10 : 0;
                return {
                    score: Math.min(100, 80 + earlyBonus),
                    detail: diffFromScheduled <= 0
                        ? `${Math.abs(diffFromScheduled)} minutes early — good!`
                        : `${diffFromScheduled} minutes after scheduled start`,
                };
            }
            return { score: 20, detail: `Punch is far outside scheduled window (${Math.abs(diffFromScheduled)} min)` };
        }
        else {
            // CHECK_OUT — any time after scheduled start is valid
            const scheduledOut = timeToMinutes(padTime(emp.scheduledCheckOut || '17:00'));
            const diffFromEnd = nowMinutes - scheduledOut;
            if (diffFromEnd >= -60) {
                return { score: 90, detail: 'Check-out within expected window' };
            }
            return { score: 50, detail: `Early check-out — ${Math.abs(diffFromEnd)} min before scheduled end` };
        }
    });
}
function padTime(time) {
    if (!time)
        return '00:00';
    const parts = String(time).slice(0, 5).split(':');
    const h = (parts[0] || '0').padStart(2, '0');
    const m = (parts[1] || '0').padStart(2, '0');
    return `${h}:${m}`;
}
function timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}
/**
 * Extract YYYY-MM-DD from a Date using the server's local timezone.
 * Avoids UTC date drift (e.g. 11:30 PM Cairo = next day in UTC).
 */
function getLocalDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
