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
exports.generateBranchQrToken = generateBranchQrToken;
exports.verifyBranchQrToken = verifyBranchQrToken;
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
exports.getAuditLogs = getAuditLogs;
exports.reviewPunch = reviewPunch;
exports.getSmartAttendanceStats = getSmartAttendanceStats;
exports.haversineDistance = haversineDistance;
exports.generateDeviceFingerprint = generateDeviceFingerprint;
exports.resetDeviceBinding = resetDeviceBinding;
exports.getTodayBranchAttendance = getTodayBranchAttendance;
const db_1 = require("../db");
const eventBus_1 = require("../utils/eventBus");
const crypto_1 = require("crypto");
const crypto_2 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const attendanceHelper_1 = require("./attendanceHelper");
// ── Selfie storage directory ───────────────────────────────────────────
const SELFIE_UPLOAD_DIR = path_1.default.join(process.cwd(), 'uploads', 'attendance-selfies');
const MAX_SELFIE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB after base64 decode
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
// ── Dynamic QR Code Cryptography ──────────────────────────────────────
const QR_SECRET = process.env.JWT_SECRET || 'smart-attendance-qr-secret-key-123';
const usedQrTokens = new Set();
function generateBranchQrToken(branchId) {
    const payload = JSON.stringify({ branchId, timestamp: Date.now() });
    const iv = crypto_2.default.randomBytes(16);
    const key = crypto_2.default.scryptSync(QR_SECRET, 'salt', 32);
    const cipher = crypto_2.default.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(payload, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}
function verifyBranchQrToken(qrToken) {
    try {
        const [ivHex, encrypted] = qrToken.split(':');
        if (!ivHex || !encrypted) {
            throw new Error('رمز QR تالف أو غير صالح');
        }
        const iv = Buffer.from(ivHex, 'hex');
        const key = crypto_2.default.scryptSync(QR_SECRET, 'salt', 32);
        const decipher = crypto_2.default.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    }
    catch (e) {
        throw new Error(`رمز QR غير صالح: ${e.message}`);
    }
}
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
        yield db_1.pool.query(`INSERT INTO attendance_locations (id, name, latitude, longitude, radiusMeters, branchId, wifiSsid, allowedIp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, data.name, data.latitude, data.longitude, data.radiusMeters || 200, data.branchId || null, data.wifiSsid || null, data.allowedIp || null]);
        return (yield getLocationById(id));
    });
}
function updateLocation(id, data) {
    return __awaiter(this, void 0, void 0, function* () {
        const fields = [];
        const values = [];
        const allowed = ['name', 'latitude', 'longitude', 'radiusMeters', 'branchId', 'isActive', 'wifiSsid', 'allowedIp'];
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
function validatePunchEligibility(employeeId, punchType, punchTime, gpsLatitude, gpsLongitude, isMockGps, deviceId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (isMockGps) {
            throw new Error('تم رصد محاولة تزييف الموقع الجغرافي (Mock Location). تم إلغاء تسجيل الحضور.');
        }
        const today = (0, attendanceHelper_1.getLocalDateString)(punchTime);
        // 1. Cooldown — no same-type punch within PUNCH_COOLDOWN_SECONDS
        const [recentRows] = yield db_1.pool.query(`SELECT punchTime FROM smart_attendance_punches
         WHERE employeeId = ? AND punchType = ? AND DATE(punchTime) = ?
         ORDER BY punchTime DESC LIMIT 1`, [employeeId, punchType, today]);
        if (recentRows.length > 0) {
            const lastPunch = new Date(recentRows[0].punchTime);
            const elapsedSeconds = (punchTime.getTime() - lastPunch.getTime()) / 1000;
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
                const elapsedHours = (punchTime.getTime() - new Date(prev.punchTime).getTime()) / 3600000;
                if (elapsedHours > 0) {
                    const velocityKmh = (distanceMeters / 1000) / elapsedHours;
                    if (velocityKmh > MAX_VELOCITY_KMH) {
                        throw new Error(`تم رصد تنقل غير طبيعي: ${Math.round(distanceMeters / 1000)}كم في ${Math.round(elapsedHours * 60)} دقيقة`);
                    }
                }
            }
        }
        // 4. Device Binding & Locking Prevention
        if (!deviceId) {
            throw new Error('مُعرّف الجهاز غير متوفر. يرجى تفعيل أذونات التخزين والموقع للتطبيق.');
        }
        // A. Check if this device is already bound to another active employee (Multi-account prevention)
        const [boundToOther] = yield db_1.pool.query('SELECT fullName FROM employees WHERE boundDeviceId = ? AND id != ? AND status = "ACTIVE"', [deviceId, employeeId]);
        if (boundToOther.length > 0) {
            throw new Error(`هذا الهاتف مسجل ومربوط باسم الموظف (${boundToOther[0].fullName}). لا يمكن استخدام نفس الهاتف لتسجيل الحضور لأكثر من موظف.`);
        }
        // B. Check if employee already has a bound device
        const [empRows] = yield db_1.pool.query('SELECT boundDeviceId FROM employees WHERE id = ?', [employeeId]);
        if (empRows.length > 0) {
            const boundId = empRows[0].boundDeviceId;
            if (!boundId) {
                // First time punching — bind device to this employee
                yield db_1.pool.query('UPDATE employees SET boundDeviceId = ? WHERE id = ?', [deviceId, employeeId]);
                console.log(`📱 [DeviceLock] Bound device "${deviceId}" to employee "${employeeId}"`);
            }
            else if (boundId !== deviceId) {
                throw new Error('هذا الحساب مربوط بهاتف ذكي آخر. لا يمكنك تسجيل البصمة إلا من هاتفك الشخصي المعتمد.');
            }
        }
    });
}
// ── Confidence Scoring ─────────────────────────────────────────────────
function calculateConfidence(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const signals = [];
        let matchedLocationId = null;
        let gpsDistanceMeters = null;
        // ── Signal 1: GPS Geofence ────────────────────────────────────────
        const locations = yield getLocations();
        // Branch Restrictions logic: If user has a branch and not allowed everywhere, filter locations
        const [empRows] = yield db_1.pool.query('SELECT branchId, allowAllLocations FROM employees WHERE id = ?', [req.employeeId]);
        let allowedLocations = locations;
        let isRestrictedBranch = false;
        let employeeBranchName = '';
        let empBranchId = null;
        if (empRows.length > 0) {
            const emp = empRows[0];
            empBranchId = emp.branchId;
            if (!emp.allowAllLocations && emp.branchId) {
                allowedLocations = locations.filter(l => l.branchId === emp.branchId);
                isRestrictedBranch = true;
                const [branchRows] = yield db_1.pool.query('SELECT name FROM branches WHERE id = ?', [emp.branchId]);
                if (branchRows.length > 0) {
                    employeeBranchName = branchRows[0].name;
                }
            }
        }
        let qrScanned = false;
        let qrBranchId = null;
        if (req.qrToken) {
            try {
                // 1. Single-use token prevention (anti-replay check)
                if (usedQrTokens.has(req.qrToken)) {
                    throw new Error('تم مسح رمز الـ QR هذا واستخدامه بالفعل من قبل.');
                }
                // 2. Decrypt and check age limit
                const qrData = verifyBranchQrToken(req.qrToken);
                const ageMs = Date.now() - qrData.timestamp;
                if (ageMs < 0 || ageMs > 15000) {
                    throw new Error('انتهت صلاحية رمز QR. يرجى إعادة المحاولة من شاشة الفرع.');
                }
                qrScanned = true;
                qrBranchId = qrData.branchId;
                // 3. Enforce branch restriction if applicable
                if (isRestrictedBranch && qrBranchId !== empBranchId) {
                    throw new Error(`غير مسموح لك بتسجيل البصمة في هذا الفرع. فرعك المعتمد هو: ${employeeBranchName}`);
                }
                const matchedLocation = locations.find(l => l.branchId === qrBranchId);
                if (matchedLocation) {
                    matchedLocationId = matchedLocation.id;
                    // 4. Hybrid geofence validation: if phone GPS is provided, assert proximity (max 1000m)
                    if (req.gpsLatitude != null && req.gpsLongitude != null) {
                        const distance = haversineDistance(req.gpsLatitude, req.gpsLongitude, Number(matchedLocation.latitude), Number(matchedLocation.longitude));
                        gpsDistanceMeters = Math.round(distance);
                        const MAX_HYBRID_DISTANCE_METERS = 1000;
                        if (distance > MAX_HYBRID_DISTANCE_METERS) {
                            throw new Error(`أنت بعيد جداً عن موقع الفرع الجغرافي (${gpsDistanceMeters} متر). لا يمكنك تسجيل الحضور عن بعد.`);
                        }
                    }
                }
                gpsDistanceMeters = gpsDistanceMeters !== null && gpsDistanceMeters !== void 0 ? gpsDistanceMeters : 0;
                const [branchRows] = yield db_1.pool.query('SELECT name FROM branches WHERE id = ?', [qrBranchId]);
                const branchName = ((_a = branchRows[0]) === null || _a === void 0 ? void 0 : _a.name) || 'الفرع';
                // Mark token as used to prevent subsequent replay submissions
                usedQrTokens.add(req.qrToken);
                setTimeout(() => {
                    usedQrTokens.delete(req.qrToken);
                }, 15000);
                signals.push({
                    signal: 'GPS',
                    score: 100,
                    weight: SIGNAL_WEIGHTS.GPS,
                    weighted: SIGNAL_WEIGHTS.GPS,
                    detail: `✅ تم التحقق بالـ QR: متواجد في ${branchName}`,
                });
            }
            catch (e) {
                // Strict QR Rejection: Throw directly to abort instead of logging a 0 score and falling back to review
                throw new Error(`فشل التحقق برمز الـ QR: ${e.message}`);
            }
        }
        else if (req.gpsLatitude != null && req.gpsLongitude != null && allowedLocations.length > 0) {
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
                for (const loc of allowedLocations) {
                    const distance = haversineDistance(req.gpsLatitude, req.gpsLongitude, Number(loc.latitude), Number(loc.longitude));
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestLocation = loc;
                    }
                }
                gpsDistanceMeters = Math.round(closestDistance);
                let effectiveRadius = closestLocation ? closestLocation.radiusMeters : 200;
                let accuracyTolerance = 0;
                if (req.gpsAccuracyMeters && req.gpsAccuracyMeters > 50) {
                    // If accuracy is low (e.g. 150m), extend radius dynamically by up to 100m
                    accuracyTolerance = Math.min(100, req.gpsAccuracyMeters * 0.5);
                    effectiveRadius += accuracyTolerance;
                }
                if (closestLocation && closestDistance <= effectiveRadius) {
                    // Inside geofence — score scaled by proximity
                    const proximityRatio = 1 - (closestDistance / effectiveRadius);
                    let gpsScore = Math.round(70 + (proximityRatio * 30)); // 70-100
                    matchedLocationId = closestLocation.id;
                    // Penalize score if we relied on dynamic tolerance drift
                    if (accuracyTolerance > 0 && closestDistance > closestLocation.radiusMeters) {
                        gpsScore = Math.round(gpsScore * 0.7);
                    }
                    // Penalize suspiciously perfect accuracy or flagged mock
                    if (isMockSuspect || req.isMockGps) {
                        gpsScore = Math.round(gpsScore * 0.4);
                    }
                    // Wi-Fi SSID Validation
                    let wifiDetail = '';
                    if (closestLocation.wifiSsid) {
                        if (req.wifiSsid) {
                            const match = req.wifiSsid.trim().toLowerCase() === closestLocation.wifiSsid.trim().toLowerCase();
                            if (match) {
                                wifiDetail = ` | Wi-Fi Verified: "${req.wifiSsid}"`;
                            }
                            else {
                                gpsScore = Math.round(gpsScore * 0.1); // Penalize severely
                                wifiDetail = ` | ⚠️ Wi-Fi mismatch: expected "${closestLocation.wifiSsid}", got "${req.wifiSsid}"`;
                            }
                        }
                        else {
                            gpsScore = Math.round(gpsScore * 0.5); // Fall below auto-approve
                            wifiDetail = ` | ⚠️ Wi-Fi required but not provided`;
                        }
                    }
                    let gpsDetail = isMockSuspect || req.isMockGps
                        ? `Inside "${closestLocation.name}" — ${gpsDistanceMeters}m ⚠️ GPS accuracy suspiciously perfect (Mock GPS)`
                        : `Inside "${closestLocation.name}" — ${gpsDistanceMeters}m from center (radius: ${closestLocation.radiusMeters}m)`;
                    if (accuracyTolerance > 0 && closestDistance > closestLocation.radiusMeters) {
                        gpsDetail += ` (⚠️ Dynamic tolerance applied due to GPS accuracy ${req.gpsAccuracyMeters}m)`;
                    }
                    signals.push({
                        signal: 'GPS',
                        score: gpsScore,
                        weight: SIGNAL_WEIGHTS.GPS,
                        weighted: Math.round(gpsScore * SIGNAL_WEIGHTS.GPS / 100),
                        detail: gpsDetail + wifiDetail,
                    });
                }
                else {
                    // Outside all geofences
                    const overshoot = closestLocation
                        ? closestDistance - (closestLocation.radiusMeters + accuracyTolerance)
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
        else if (allowedLocations.length === 0) {
            if (isRestrictedBranch) {
                signals.push({
                    signal: 'GPS',
                    score: 0,
                    weight: SIGNAL_WEIGHTS.GPS,
                    weighted: 0,
                    detail: `لم يتم تهيئة مواقع جغرافية لفرعك المعتمد: ${employeeBranchName || 'فرع غير معروف'}`,
                });
            }
            else {
                // No geofences configured — skip GPS scoring entirely, give full credit
                signals.push({
                    signal: 'GPS',
                    score: 100,
                    weight: SIGNAL_WEIGHTS.GPS,
                    weighted: SIGNAL_WEIGHTS.GPS,
                    detail: 'No geofences configured — GPS check skipped',
                });
            }
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
        // ── Signal: IP Address Match (bonus — boosts confidence when IP matches) ──
        if (req.ipAddress && matchedLocationId) {
            const matchedLoc = locations.find(l => l.id === matchedLocationId);
            if (matchedLoc === null || matchedLoc === void 0 ? void 0 : matchedLoc.allowedIp) {
                const allowedIps = matchedLoc.allowedIp.split(',').map(ip => ip.trim()).filter(Boolean);
                const clientIp = req.ipAddress.replace('::ffff:', ''); // normalize IPv6-mapped IPv4
                const isIpMatch = allowedIps.includes(clientIp);
                if (isIpMatch) {
                    // IP match — add a small bonus to the GPS signal's weighted score
                    const gpsSignal = signals.find(s => s.signal === 'GPS');
                    if (gpsSignal) {
                        const IP_BONUS = 5;
                        gpsSignal.weighted = Math.min(SIGNAL_WEIGHTS.GPS, gpsSignal.weighted + IP_BONUS);
                        gpsSignal.detail += ` | ✅ IP مطابق (${clientIp})`;
                    }
                }
                else {
                    // IP mismatch — informational only, no penalty
                    const gpsSignal = signals.find(s => s.signal === 'GPS');
                    if (gpsSignal) {
                        gpsSignal.detail += ` | ⚠️ IP مختلف (${clientIp})`;
                    }
                }
            }
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
        const punchTime = req.offlineCreatedTime ? new Date(req.offlineCreatedTime) : new Date();
        const timeScore = yield scoreTimeWindow(req.employeeId, req.punchType, punchTime);
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
        return { totalScore, status, signals, matchedLocationId, gpsDistanceMeters, qrScanned, qrBranchId };
    });
}
// ── Punch Recording ────────────────────────────────────────────────────
function recordPunch(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const punchTime = req.offlineCreatedTime ? new Date(req.offlineCreatedTime) : new Date();
        // ── Pre-punch validation (cooldown, cap, velocity, mock, device lock) ──
        yield validatePunchEligibility(req.employeeId, req.punchType, punchTime, req.gpsLatitude, req.gpsLongitude, req.isMockGps, req.deviceId);
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
            // ── Save selfie to disk (if provided) ─────────────────────────
            let selfiePath = null;
            if (req.selfieBase64) {
                selfiePath = saveSelfie(punchId, req.selfieBase64);
            }
            // Silent validation of offline time difference:
            let verificationStatus = confidence.status;
            let reviewNotes = '';
            if (req.offlineCreatedTime && verificationStatus === 'AUTO_APPROVED') {
                const clientTime = new Date(req.offlineCreatedTime).getTime();
                const serverTime = Date.now();
                const timeDiffMinutes = Math.abs(serverTime - clientTime) / 60000;
                if (timeDiffMinutes > 5) {
                    verificationStatus = 'PENDING_REVIEW';
                    reviewNotes = 'تنبيه: فارق توقيت محلي مشبوه أثناء الأوفلاين';
                }
            }
            // ── Store raw punch (immutable audit trail) ────────────────────
            yield db_1.pool.query(`INSERT INTO smart_attendance_punches
             (id, employeeId, userId, punchTime, punchType,
              gpsLatitude, gpsLongitude, gpsAccuracyMeters,
              matchedLocationId, gpsDistanceMeters,
              deviceFingerprint, ipAddress, userAgent,
              confidenceScore, verificationStatus, wifiSsid, isMockGps, selfiePath, deviceId, offlineCreatedTime, reviewNotes, qrScanned, qrBranchId)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                punchId, req.employeeId, req.userId, punchTime, req.punchType,
                req.gpsLatitude || null, req.gpsLongitude || null, req.gpsAccuracyMeters || null,
                confidence.matchedLocationId, confidence.gpsDistanceMeters,
                deviceFingerprint, req.ipAddress, req.userAgent,
                confidence.totalScore, verificationStatus,
                req.wifiSsid || null, req.isMockGps ? 1 : 0, selfiePath, req.deviceId || null,
                req.offlineCreatedTime ? new Date(req.offlineCreatedTime) : null,
                reviewNotes || null,
                confidence.qrScanned ? 1 : 0,
                confidence.qrBranchId || null
            ]);
            // ── Write to attendance_records ONLY for auto-approved ─────────
            // PENDING_REVIEW punches wait until HR approves via reviewPunch()
            let attendanceRecordId;
            if (verificationStatus === 'AUTO_APPROVED') {
                const dateStr = (0, attendanceHelper_1.getLocalDateString)(punchTime);
                const timeStr = punchTime.toTimeString().slice(0, 5);
                const options = {
                    employeeId: req.employeeId,
                    dateStr,
                    source: 'SMART',
                    notes: req.punchType === 'CHECK_IN' ? 'تسجيل ذكي' : 'انصراف ذكي'
                };
                if (req.punchType === 'CHECK_IN') {
                    options.checkIn = timeStr;
                }
                else {
                    options.checkOut = timeStr;
                }
                const upsertRes = yield (0, attendanceHelper_1.upsertAttendanceRecord)(options);
                if (upsertRes.status === 'SUCCESS') {
                    attendanceRecordId = upsertRes.id;
                }
                else if (upsertRes.status === 'LOCKED') {
                    throw new Error('لا يمكن تسجيل الحضور لشهر مغلق مالياً');
                }
            }
            // Return the modified verificationStatus and confidence total
            const finalConfidence = Object.assign(Object.assign({}, confidence), { status: verificationStatus });
            // Broadcast the punch to all connected kiosk displays
            try {
                const [empRows] = yield db_1.pool.query('SELECT fullName, branchId, avatar FROM employees WHERE id = ?', [req.employeeId]);
                if (empRows.length > 0) {
                    eventBus_1.eventBus.broadcast('attendance:punch', {
                        employeeId: req.employeeId,
                        employeeName: empRows[0].fullName,
                        employeeAvatar: empRows[0].avatar || null,
                        punchType: req.punchType,
                        status: verificationStatus,
                        branchId: empRows[0].branchId || null,
                        time: punchTime.toISOString(),
                    });
                }
            }
            catch (e) {
                console.error('❌ Failed to broadcast punch in recordPunch:', e.message);
            }
            return { punchId, confidence: finalConfidence, attendanceRecordId };
        }
        finally {
            yield db_1.pool.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => { });
        }
    });
}
// ── Today's Status ─────────────────────────────────────────────────────
function getTodayStatus(employeeId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const today = (0, attendanceHelper_1.getLocalDateString)(new Date());
        const [rows] = yield db_1.pool.query(`SELECT punchType, TIME_FORMAT(punchTime, '%H:%i') as time,
                confidenceScore, verificationStatus, reviewNotes, punchTime
         FROM smart_attendance_punches
         WHERE employeeId = ? AND DATE(punchTime) = ?
         ORDER BY punchTime DESC`, [employeeId, today]);
        // Group punches by type
        const checkIns = rows.filter((r) => r.punchType === 'CHECK_IN');
        const checkOuts = rows.filter((r) => r.punchType === 'CHECK_OUT');
        // Find the latest valid/active punch of each type
        const latestCheckIn = checkIns[0]; // sorted DESC
        const latestCheckOut = checkOuts[0];
        // Find any rejected punch today to return the last rejection reason
        const rejectedPunch = rows.find((r) => r.verificationStatus === 'REJECTED' || r.verificationStatus === 'MANUALLY_REJECTED');
        // Calculate remaining cooldown (in seconds) since the last punch of each type
        const getCooldownRemaining = (lastPunch) => {
            if (!lastPunch)
                return 0;
            const lastTime = new Date(lastPunch.punchTime).getTime();
            const elapsed = (Date.now() - lastTime) / 1000;
            const cooldown = PUNCH_COOLDOWN_SECONDS; // 300
            return elapsed < cooldown ? Math.ceil(cooldown - elapsed) : 0;
        };
        return {
            hasCheckedIn: checkIns.some((c) => c.verificationStatus !== 'REJECTED' && c.verificationStatus !== 'MANUALLY_REJECTED'),
            hasCheckedOut: checkOuts.some((c) => c.verificationStatus !== 'REJECTED' && c.verificationStatus !== 'MANUALLY_REJECTED'),
            checkInTime: (latestCheckIn === null || latestCheckIn === void 0 ? void 0 : latestCheckIn.time) || null,
            checkOutTime: (latestCheckOut === null || latestCheckOut === void 0 ? void 0 : latestCheckOut.time) || null,
            checkInScore: (_a = latestCheckIn === null || latestCheckIn === void 0 ? void 0 : latestCheckIn.confidenceScore) !== null && _a !== void 0 ? _a : null,
            checkOutScore: (_b = latestCheckOut === null || latestCheckOut === void 0 ? void 0 : latestCheckOut.confidenceScore) !== null && _b !== void 0 ? _b : null,
            checkInStatus: (latestCheckIn === null || latestCheckIn === void 0 ? void 0 : latestCheckIn.verificationStatus) || null,
            checkOutStatus: (latestCheckOut === null || latestCheckOut === void 0 ? void 0 : latestCheckOut.verificationStatus) || null,
            lastRejectionReason: (rejectedPunch === null || rejectedPunch === void 0 ? void 0 : rejectedPunch.reviewNotes) || (rejectedPunch === null || rejectedPunch === void 0 ? void 0 : rejectedPunch.verificationStatus) || null,
            cooldownRemainingCheckIn: getCooldownRemaining(latestCheckIn),
            cooldownRemainingCheckOut: getCooldownRemaining(latestCheckOut),
        };
    });
}
// ── Pending Reviews ────────────────────────────────────────────────────
function getPendingReviews() {
    return __awaiter(this, arguments, void 0, function* (limit = 50) {
        const [rows] = yield db_1.pool.query(`SELECT sap.*, e.fullName as employeeName, e.boundDeviceId as employeeBoundDeviceId,
                u.name as userName, u.username as username,
                al.name as locationName,
                al.latitude as officeLatitude, al.longitude as officeLongitude,
                al.radiusMeters as officeRadiusMeters, al.allowedIp as locationAllowedIp,
                qrb.name as qrBranchName
         FROM smart_attendance_punches sap
         LEFT JOIN employees e ON sap.employeeId = e.id
         LEFT JOIN users u ON sap.userId = u.id
         LEFT JOIN attendance_locations al ON sap.matchedLocationId = al.id
         LEFT JOIN branches qrb ON sap.qrBranchId = qrb.id
         WHERE sap.verificationStatus = 'PENDING_REVIEW'
         ORDER BY sap.punchTime DESC
         LIMIT ?`, [limit]);
        return rows;
    });
}
function getAuditLogs(filters) {
    return __awaiter(this, void 0, void 0, function* () {
        const whereClauses = [];
        const params = [];
        if (filters.employeeId) {
            whereClauses.push('sap.employeeId = ?');
            params.push(filters.employeeId);
        }
        if (filters.status) {
            whereClauses.push('sap.verificationStatus = ?');
            params.push(filters.status);
        }
        if (filters.riskMin != null) {
            whereClauses.push('sap.confidenceScore <= ?');
            params.push(100 - Number(filters.riskMin));
        }
        if (filters.riskMax != null) {
            whereClauses.push('sap.confidenceScore >= ?');
            params.push(100 - Number(filters.riskMax));
        }
        if (filters.fromDate) {
            whereClauses.push('DATE(sap.punchTime) >= ?');
            params.push(filters.fromDate);
        }
        if (filters.toDate) {
            whereClauses.push('DATE(sap.punchTime) <= ?');
            params.push(filters.toDate);
        }
        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const limit = Number(filters.limit || 100);
        params.push(limit);
        const [rows] = yield db_1.pool.query(`SELECT sap.*, e.fullName as employeeName, e.boundDeviceId as employeeBoundDeviceId,
                u.name as userName, u.username as username,
                al.name as locationName,
                al.latitude as officeLatitude, al.longitude as officeLongitude,
                al.radiusMeters as officeRadiusMeters, al.allowedIp as locationAllowedIp,
                qrb.name as qrBranchName
         FROM smart_attendance_punches sap
         LEFT JOIN employees e ON sap.employeeId = e.id
         LEFT JOIN users u ON sap.userId = u.id
         LEFT JOIN attendance_locations al ON sap.matchedLocationId = al.id
         LEFT JOIN branches qrb ON sap.qrBranchId = qrb.id
         ${whereSql}
         ORDER BY sap.punchTime DESC
         LIMIT ?`, params);
        return rows;
    });
}
function reviewPunch(punchId, action, reviewedBy, notes) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield db_1.pool.getConnection();
        try {
            yield conn.beginTransaction();
            const [punch] = yield conn.query('SELECT employeeId, punchTime, punchType FROM smart_attendance_punches WHERE id = ?', [punchId]);
            if (punch.length === 0) {
                throw new Error('لم يتم العثور على البصمة المطلوبة');
            }
            const p = punch[0];
            const dateStr = (0, attendanceHelper_1.getLocalDateString)(new Date(p.punchTime));
            // Block if date falls in a locked payroll cycle
            const locked = yield (0, attendanceHelper_1.isPayrollLocked)(dateStr, conn);
            if (locked) {
                throw new Error('لا يمكن تعديل الحضور لشهر مغلق مالياً');
            }
            yield conn.query(`UPDATE smart_attendance_punches
             SET verificationStatus = ?, reviewedBy = ?, reviewedAt = NOW(), reviewNotes = ?
             WHERE id = ?`, [action, reviewedBy, notes || null, punchId]);
            // If manually approved and no attendance record exists, create one
            if (action === 'MANUALLY_APPROVED') {
                const timeStr = new Date(p.punchTime).toTimeString().slice(0, 5);
                const options = {
                    employeeId: p.employeeId,
                    dateStr,
                    source: 'SMART',
                    notes: 'موافقة يدوية على تسجيل ذكي'
                };
                if (p.punchType === 'CHECK_IN') {
                    options.checkIn = timeStr;
                }
                else {
                    options.checkOut = timeStr;
                }
                const upsertRes = yield (0, attendanceHelper_1.upsertAttendanceRecord)(options, conn);
                if (upsertRes.status === 'FAILED') {
                    throw new Error('فشلت عملية حفظ سجل الحضور');
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
        const today = (0, attendanceHelper_1.getLocalDateString)(new Date());
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
function scoreTimeWindow(employeeId_1, punchType_1) {
    return __awaiter(this, arguments, void 0, function* (employeeId, punchType, punchTime = new Date()) {
        const [empRows] = yield db_1.pool.query('SELECT scheduledCheckIn, scheduledCheckOut FROM employees WHERE id = ?', [employeeId]);
        if (empRows.length === 0) {
            return { score: 50, detail: 'Employee schedule not found' };
        }
        const emp = empRows[0];
        const nowMinutes = punchTime.getHours() * 60 + punchTime.getMinutes();
        const EARLY_WINDOW_MINUTES = 120; // 2 hours before scheduled
        const LATE_WINDOW_MINUTES = 240; // 4 hours after scheduled
        if (punchType === 'CHECK_IN') {
            const scheduledMin = (0, attendanceHelper_1.timeToMinutes)((0, attendanceHelper_1.padTime)(emp.scheduledCheckIn || '09:00'));
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
            const scheduledOut = (0, attendanceHelper_1.timeToMinutes)((0, attendanceHelper_1.padTime)(emp.scheduledCheckOut || '17:00'));
            const diffFromEnd = nowMinutes - scheduledOut;
            if (diffFromEnd >= -60) {
                return { score: 90, detail: 'Check-out within expected window' };
            }
            return { score: 50, detail: `Early check-out — ${Math.abs(diffFromEnd)} min before scheduled end` };
        }
    });
}
/**
 * Reset bound device for an employee (requires admin privilege at controller layer).
 */
function resetDeviceBinding(employeeId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield db_1.pool.query('UPDATE employees SET boundDeviceId = NULL WHERE id = ?', [employeeId]);
        console.log(`📱 [DeviceLock] Reset bound device for employee "${employeeId}"`);
    });
}
/**
 * Decode a base64-encoded selfie and save to disk.
 * Accepts "data:image/jpeg;base64,..." or raw base64.
 * Returns the relative URL path (e.g. /uploads/attendance-selfies/xxx.jpg).
 */
function saveSelfie(punchId, base64Data) {
    try {
        if (!fs_1.default.existsSync(SELFIE_UPLOAD_DIR)) {
            fs_1.default.mkdirSync(SELFIE_UPLOAD_DIR, { recursive: true });
        }
        // Strip data URL prefix if present
        const raw = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(raw, 'base64');
        if (buffer.length > MAX_SELFIE_SIZE_BYTES) {
            console.warn(`📸 Selfie too large for punch ${punchId}: ${buffer.length} bytes`);
            return null;
        }
        const filename = `selfie-${punchId}.jpg`;
        const filePath = path_1.default.join(SELFIE_UPLOAD_DIR, filename);
        fs_1.default.writeFileSync(filePath, buffer);
        return `/uploads/attendance-selfies/${filename}`;
    }
    catch (err) {
        console.error(`📸 Failed to save selfie for punch ${punchId}:`, err);
        return null;
    }
}
/**
 * Get today's attendance summary for a specific branch kiosk.
 */
function getTodayBranchAttendance(branchId) {
    return __awaiter(this, void 0, void 0, function* () {
        // 1. Get today's punches count
        const [statsRows] = yield db_1.pool.query(`
        SELECT 
            COUNT(*) as totalPunches,
            SUM(CASE WHEN punchType = 'CHECK_IN' AND verificationStatus = 'AUTO_APPROVED' THEN 1 ELSE 0 END) as onTimeCount,
            SUM(CASE WHEN punchType = 'CHECK_IN' AND verificationStatus = 'PENDING_REVIEW' THEN 1 ELSE 0 END) as lateCount
        FROM smart_attendance_punches sap
        JOIN employees e ON sap.employeeId = e.id
        WHERE e.branchId = ? AND DATE(sap.punchTime) = CURDATE()
    `, [branchId]);
        const stats = statsRows[0] || { totalPunches: 0, onTimeCount: 0, lateCount: 0 };
        // 2. Get last 15 punches today for this branch
        const [punchesRows] = yield db_1.pool.query(`
        SELECT 
            sap.id as punchId,
            sap.punchType,
            sap.verificationStatus,
            TIME_FORMAT(sap.punchTime, '%H:%i') as time,
            e.fullName as employeeName,
            e.avatar as employeeAvatar
        FROM smart_attendance_punches sap
        JOIN employees e ON sap.employeeId = e.id
        WHERE e.branchId = ? AND DATE(sap.punchTime) = CURDATE()
        ORDER BY sap.punchTime DESC
        LIMIT 15
    `, [branchId]);
        return {
            totalPunches: stats.totalPunches || 0,
            onTimeCount: stats.onTimeCount || 0,
            lateCount: stats.lateCount || 0,
            todayList: punchesRows || []
        };
    });
}
