"use strict";
/**
 * Fingerprint Device Integration Service
 * Communicates with ZKTeco-compatible attendance machines via ZKUDP/TCP protocol.
 * Handles device discovery, user sync, and attendance log ingestion.
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
exports.getDevices = getDevices;
exports.getDevice = getDevice;
exports.createDevice = createDevice;
exports.updateDevice = updateDevice;
exports.deleteDevice = deleteDevice;
exports.testDeviceConnection = testDeviceConnection;
exports.getDeviceUsers = getDeviceUsers;
exports.getMappings = getMappings;
exports.saveMappings = saveMappings;
exports.deleteMapping = deleteMapping;
exports.syncAttendanceLogs = syncAttendanceLogs;
exports.getSyncHistory = getSyncHistory;
exports.suggestMappings = suggestMappings;
const db_1 = require("../db");
const crypto_1 = require("crypto");
// ── NOTE: Schema tables are created in server/db.ts initDB() (schema v62+)
// No runtime schema creation — tables exist at startup.
// ── Device Management ──────────────────────────────────────────────────
function getDevices() {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield db_1.pool.query('SELECT * FROM fingerprint_devices ORDER BY name');
        return rows;
    });
}
function getDevice(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield db_1.pool.query('SELECT * FROM fingerprint_devices WHERE id = ?', [id]);
        return rows.length > 0 ? rows[0] : null;
    });
}
function createDevice(data) {
    return __awaiter(this, void 0, void 0, function* () {
        const id = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`INSERT INTO fingerprint_devices (id, name, ip, port, model) VALUES (?, ?, ?, ?, ?)`, [id, data.name, data.ip, data.port || 4370, data.model || null]);
        return (yield getDevice(id));
    });
}
function updateDevice(id, data) {
    return __awaiter(this, void 0, void 0, function* () {
        const fields = [];
        const values = [];
        const allowedFields = ['name', 'ip', 'port', 'model', 'isActive'];
        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(data[field]);
            }
        }
        if (fields.length === 0)
            return;
        values.push(id);
        yield db_1.pool.query(`UPDATE fingerprint_devices SET ${fields.join(', ')} WHERE id = ?`, values);
    });
}
function deleteDevice(id) {
    return __awaiter(this, void 0, void 0, function* () {
        yield db_1.pool.query('DELETE FROM fingerprint_devices WHERE id = ?', [id]);
    });
}
// ── Device Connection (via node-zklib) ─────────────────────────────────
/**
 * Attempt to connect to a ZKTeco device and return basic info.
 * Requires `node-zklib` to be installed: `npm install node-zklib`
 * If the library is not available, returns a helpful error message.
 */
function testDeviceConnection(deviceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const device = yield getDevice(deviceId);
        if (!device)
            return { isConnected: false, error: 'Device not found' };
        try {
            const ZKLib = yield loadZKLib();
            const zk = new ZKLib(device.ip, device.port, 10000, 4000);
            yield zk.createSocket();
            const info = yield zk.getInfo();
            // Update serial/model from device info
            if (info === null || info === void 0 ? void 0 : info.serialNumber) {
                yield db_1.pool.query('UPDATE fingerprint_devices SET serialNumber = ?, model = ? WHERE id = ?', [info.serialNumber, info.platform || device.model, deviceId]);
            }
            yield zk.disconnect();
            return {
                isConnected: true,
                serialNumber: info === null || info === void 0 ? void 0 : info.serialNumber,
                model: info === null || info === void 0 ? void 0 : info.platform,
                userCount: info === null || info === void 0 ? void 0 : info.userCounts,
                logCount: info === null || info === void 0 ? void 0 : info.logCounts,
            };
        }
        catch (error) {
            return {
                isConnected: false,
                error: error.message || 'Connection failed',
            };
        }
    });
}
/**
 * Pull the user list from a device.
 * Returns raw device users that can be mapped to ERP employees.
 */
function getDeviceUsers(deviceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const device = yield getDevice(deviceId);
        if (!device)
            throw new Error('Device not found');
        const ZKLib = yield loadZKLib();
        const zk = new ZKLib(device.ip, device.port, 10000, 4000);
        try {
            yield zk.createSocket();
            const result = yield zk.getUsers();
            return ((result === null || result === void 0 ? void 0 : result.data) || []).map((u) => ({
                uid: u.uid,
                userId: String(u.userId),
                name: u.name || `User #${u.userId}`,
                cardno: u.cardno || 0,
                role: u.role || 0,
            }));
        }
        catch (error) {
            throw new Error(`Failed to fetch users from ${device.name}: ${error.message}`);
        }
        finally {
            yield zk.disconnect().catch(() => { });
        }
    });
}
// ── Employee Mapping ───────────────────────────────────────────────────
function getMappings(deviceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield db_1.pool.query(`SELECT fm.*, e.fullName as employeeName
         FROM fingerprint_mappings fm
         JOIN employees e ON fm.employeeId = e.id
         WHERE fm.deviceId = ?
         ORDER BY fm.deviceUserName`, [deviceId]);
        return rows;
    });
}
function saveMappings(deviceId, mappings) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        let created = 0;
        let updated = 0;
        try {
            yield conn.beginTransaction();
            for (const mapping of mappings) {
                if (!mapping.employeeId || !mapping.deviceUserId)
                    continue;
                const id = (0, crypto_1.randomUUID)();
                const [result] = yield conn.query(`INSERT INTO fingerprint_mappings (id, deviceId, deviceUserId, deviceUserName, employeeId)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                     employeeId = VALUES(employeeId),
                     deviceUserName = VALUES(deviceUserName)`, [id, deviceId, mapping.deviceUserId, mapping.deviceUserName, mapping.employeeId]);
                if (result.affectedRows === 1)
                    created++;
                else if (result.affectedRows === 2)
                    updated++; // ON DUPLICATE KEY counts as 2
                // Sync fingerprintId on the employees table in the same loop
                yield conn.query('UPDATE employees SET fingerprintId = ? WHERE id = ?', [mapping.deviceUserId, mapping.employeeId]);
            }
            yield conn.commit();
            return { created, updated };
        }
        catch (error) {
            yield conn.rollback();
            throw error;
        }
        finally {
            conn.release();
        }
    });
}
function deleteMapping(mappingId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [mapping] = yield db_1.pool.query('SELECT employeeId FROM fingerprint_mappings WHERE id = ?', [mappingId]);
        const conn = yield (0, db_1.getConnection)();
        try {
            yield conn.beginTransaction();
            if (mapping.length > 0) {
                yield conn.query('UPDATE employees SET fingerprintId = NULL WHERE id = ?', [mapping[0].employeeId]);
            }
            yield conn.query('DELETE FROM fingerprint_mappings WHERE id = ?', [mappingId]);
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
// ── Attendance Sync ────────────────────────────────────────────────────
/**
 * Pull attendance logs from a device → store raw punches → derive attendance.
 *
 * Architecture (3-layer):
 *   Layer 1: Raw device punches → fingerprint_raw_logs (immutable audit trail)
 *   Layer 2: Punch grouping → first/last per employee+date
 *   Layer 3: Attendance derivation → attendance_records (UPSERT, skipping locked periods)
 *
 * Safety:
 *   - Duplicate punches are ignored (UNIQUE KEY on deviceId+userId+punchTime)
 *   - Payroll-locked dates are NOT overwritten
 *   - Incremental sync uses lastSyncAt to avoid re-downloading entire history
 */
function syncAttendanceLogs(deviceId, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const device = yield getDevice(deviceId);
        if (!device)
            throw new Error('Device not found');
        // Only mark status — do NOT set lastSyncAt here.
        // lastSyncAt is written in the success path (Step 8) to prevent
        // failed-sync timestamps from advancing the incremental cursor.
        yield db_1.pool.query('UPDATE fingerprint_devices SET lastSyncStatus = ? WHERE id = ?', ['SYNCING', deviceId]);
        const syncBatchId = (0, crypto_1.randomUUID)();
        const result = {
            deviceId,
            deviceName: device.name,
            totalLogs: 0,
            newRecords: 0,
            updatedRecords: 0,
            skippedUnmapped: 0,
            skippedLocked: 0,
            errors: [],
            syncedAt: new Date().toISOString(),
        };
        let zk = null;
        try {
            // ── Step 1: Load mappings + per-employee schedules ──────────────
            const [mappingRows] = yield db_1.pool.query(`SELECT fm.deviceUserId, fm.employeeId, e.scheduledCheckIn
             FROM fingerprint_mappings fm
             JOIN employees e ON fm.employeeId = e.id
             WHERE fm.deviceId = ?`, [deviceId]);
            const mappingLookup = new Map();
            const scheduleLookup = new Map();
            const DEFAULT_SCHEDULED_START = '09:00';
            for (const m of mappingRows) {
                mappingLookup.set(String(m.deviceUserId), m.employeeId);
                const rawSchedule = m.scheduledCheckIn || DEFAULT_SCHEDULED_START;
                scheduleLookup.set(m.employeeId, padTime(String(rawSchedule).slice(0, 5)));
            }
            if (mappingLookup.size === 0) {
                throw new Error('No employee mappings configured for this device');
            }
            // ── Step 2: Pull logs from device ──────────────────────────────
            const ZKLib = yield loadZKLib();
            zk = new ZKLib(device.ip, device.port, 10000, 4000);
            yield zk.createSocket();
            const rawLogs = yield zk.getAttendances();
            const logs = ((rawLogs === null || rawLogs === void 0 ? void 0 : rawLogs.data) || []).map((l) => ({
                id: l.id,
                userId: String(l.deviceUserId || l.uid),
                timestamp: l.timestamp,
                state: l.state || 0,
            }));
            result.totalLogs = logs.length;
            // ── Step 3: Filter by date range (incremental sync) ────────────
            // Use lastSyncAt as cursor when no explicit range provided
            const effectiveFromDate = (options === null || options === void 0 ? void 0 : options.fromDate) ||
                (device.lastSyncAt ? String(device.lastSyncAt).split('T')[0].split(' ')[0] : undefined);
            const filteredLogs = effectiveFromDate || (options === null || options === void 0 ? void 0 : options.toDate)
                ? logs.filter(l => {
                    const logDate = l.timestamp.split(' ')[0];
                    if (effectiveFromDate && logDate < effectiveFromDate)
                        return false;
                    if ((options === null || options === void 0 ? void 0 : options.toDate) && logDate > options.toDate)
                        return false;
                    return true;
                })
                : logs;
            // ── Step 4: Store raw punches (immutable audit trail) ──────────
            // INSERT IGNORE deduplicates via UNIQUE(deviceId, deviceUserId, punchTime)
            const rawConn = yield (0, db_1.getConnection)();
            const unmappedUserIds = new Set();
            try {
                yield rawConn.beginTransaction();
                for (const log of filteredLogs) {
                    const employeeId = mappingLookup.get(log.userId) || null;
                    if (!employeeId)
                        unmappedUserIds.add(log.userId);
                    yield rawConn.query(`INSERT IGNORE INTO fingerprint_raw_logs
                     (id, deviceId, syncBatchId, deviceUserId, punchTime, punchState, employeeId)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), deviceId, syncBatchId, log.userId, log.timestamp, log.state, employeeId]);
                }
                result.skippedUnmapped = unmappedUserIds.size;
                yield rawConn.commit();
            }
            catch (rawErr) {
                yield rawConn.rollback();
                throw rawErr;
            }
            finally {
                rawConn.release();
            }
            // ── Step 5: Derive attendance from stored raw logs ─────────────
            const dateParams = [deviceId];
            let dateFilter = '';
            if (effectiveFromDate) {
                dateFilter += ' AND DATE(punchTime) >= ?';
                dateParams.push(effectiveFromDate);
            }
            if (options === null || options === void 0 ? void 0 : options.toDate) {
                dateFilter += ' AND DATE(punchTime) <= ?';
                dateParams.push(options.toDate);
            }
            const [storedPunches] = yield db_1.pool.query(`SELECT employeeId, DATE(punchTime) as punchDate,
                    TIME_FORMAT(punchTime, '%H:%i') as punchHHMM
             FROM fingerprint_raw_logs
             WHERE deviceId = ? AND employeeId IS NOT NULL ${dateFilter}
             ORDER BY employeeId, punchTime`, dateParams);
            // Group by employee+date
            const grouped = new Map();
            for (const p of storedPunches) {
                const empId = p.employeeId;
                const dateStr = typeof p.punchDate === 'string'
                    ? p.punchDate.split('T')[0]
                    : new Date(p.punchDate).toISOString().split('T')[0];
                if (!grouped.has(empId))
                    grouped.set(empId, new Map());
                const empDays = grouped.get(empId);
                if (!empDays.has(dateStr))
                    empDays.set(dateStr, []);
                empDays.get(dateStr).push(padTime(p.punchHHMM));
            }
            // ── Step 6: Identify locked payroll dates ──────────────────────
            const [lockedCycles] = yield db_1.pool.query(`SELECT month, year FROM payroll_cycles WHERE status IN ('APPROVED', 'PAID')`);
            const lockedMonths = new Set();
            for (const c of lockedCycles) {
                lockedMonths.add(`${c.year}-${String(c.month).padStart(2, '0')}`);
            }
            // ── Step 7: Write attendance records ───────────────────────────
            const writeConn = yield (0, db_1.getConnection)();
            try {
                yield writeConn.beginTransaction();
                for (const [employeeId, days] of grouped) {
                    const scheduledStart = scheduleLookup.get(employeeId) || DEFAULT_SCHEDULED_START;
                    for (const [date, times] of days) {
                        // Skip dates in locked payroll periods
                        if (lockedMonths.has(date.slice(0, 7))) {
                            result.skippedLocked++;
                            continue;
                        }
                        const sorted = times.sort();
                        const checkIn = sorted[0];
                        const checkOut = sorted.length > 1 ? sorted[sorted.length - 1] : '';
                        // Late calculation that handles night shifts (e.g. scheduled 22:00):
                        // A punch at 22:15 is 15 min late. A punch at 06:00 the next day
                        // is NOT late — it's the checkout, not a tardy check-in.
                        // We use a 12-hour forward window: anything within 0-720 min
                        // after scheduled start counts as "late arrival" territory.
                        const checkInMin = timeToMinutes(checkIn);
                        const scheduledMin = timeToMinutes(scheduledStart);
                        const MINUTES_IN_DAY = 1440;
                        const LATE_WINDOW_MINUTES = 720; // 12 hours — max plausible lateness
                        const diff = (checkInMin - scheduledMin + MINUTES_IN_DAY) % MINUTES_IN_DAY;
                        const isLate = diff > 0 && diff <= LATE_WINDOW_MINUTES;
                        const status = isLate ? 'LATE' : 'PRESENT';
                        const lateMinutes = isLate ? diff : 0;
                        const id = (0, crypto_1.randomUUID)();
                        const [upsertResult] = yield writeConn.query(`INSERT INTO attendance_records (
                            id, employeeId, date, checkIn, checkOut, status,
                            isOvertime, overtimeHours, lateMinutes,
                            scheduledCheckIn, notes, source
                        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 'FINGERPRINT')
                        ON DUPLICATE KEY UPDATE
                            checkIn = VALUES(checkIn),
                            checkOut = VALUES(checkOut),
                            status = VALUES(status),
                            lateMinutes = VALUES(lateMinutes),
                            scheduledCheckIn = VALUES(scheduledCheckIn),
                            notes = VALUES(notes),
                            source = 'FINGERPRINT'`, [id, employeeId, date, checkIn, checkOut, status, lateMinutes, scheduledStart, 'بصمة آلية']);
                        if (upsertResult.affectedRows === 1)
                            result.newRecords++;
                        else if (upsertResult.affectedRows === 2)
                            result.updatedRecords++;
                    }
                }
                yield writeConn.commit();
            }
            catch (dbError) {
                yield writeConn.rollback();
                throw dbError;
            }
            finally {
                writeConn.release();
            }
            // ── Step 8: Update device sync status ──────────────────────────
            const statusMsg = `${result.newRecords} new, ${result.updatedRecords} updated` +
                (result.skippedLocked > 0 ? `, ${result.skippedLocked} locked` : '');
            yield db_1.pool.query(`UPDATE fingerprint_devices
             SET lastSyncAt = NOW(), lastSyncStatus = 'SUCCESS',
                 lastSyncMessage = ? WHERE id = ?`, [statusMsg, deviceId]);
            // ── Step 9: Log the sync ───────────────────────────────────────
            yield db_1.pool.query(`INSERT INTO fingerprint_sync_log
             (id, deviceId, syncedAt, totalLogs, newRecords, updatedRecords, skippedUnmapped, skippedLocked, status)
             VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, 'SUCCESS')`, [syncBatchId, deviceId, result.totalLogs, result.newRecords, result.updatedRecords, result.skippedUnmapped, result.skippedLocked]);
            return result;
        }
        catch (error) {
            yield db_1.pool.query(`UPDATE fingerprint_devices SET lastSyncStatus = 'FAILED', lastSyncMessage = ? WHERE id = ?`, [(_a = error.message) === null || _a === void 0 ? void 0 : _a.slice(0, 500), deviceId]).catch(() => { });
            yield db_1.pool.query(`INSERT INTO fingerprint_sync_log (id, deviceId, syncedAt, totalLogs, errors, status)
             VALUES (?, ?, NOW(), 0, ?, 'FAILED')`, [syncBatchId, deviceId, error.message]).catch(() => { });
            throw error;
        }
        finally {
            if (zk)
                yield zk.disconnect().catch(() => { });
        }
    });
}
/**
 * Get sync history for a device.
 */
function getSyncHistory(deviceId_1) {
    return __awaiter(this, arguments, void 0, function* (deviceId, limit = 20) {
        const [rows] = yield db_1.pool.query(`SELECT * FROM fingerprint_sync_log
         WHERE deviceId = ?
         ORDER BY syncedAt DESC
         LIMIT ?`, [deviceId, limit]);
        return rows;
    });
}
// ── Auto-Match Suggestion ──────────────────────────────────────────────
/**
 * Suggest employee matches for device users based on name similarity.
 * Uses a simple normalized string comparison — good enough for Arabic names.
 */
function suggestMappings(deviceId, deviceUsers) {
    return __awaiter(this, void 0, void 0, function* () {
        const [employees] = yield db_1.pool.query("SELECT id, fullName FROM employees WHERE status = 'ACTIVE' ORDER BY fullName");
        // Get existing mappings to exclude already-mapped employees
        const [existingMappings] = yield db_1.pool.query('SELECT employeeId FROM fingerprint_mappings WHERE deviceId = ?', [deviceId]);
        const mappedEmployeeIds = new Set(existingMappings.map((m) => m.employeeId));
        return deviceUsers.map(deviceUser => {
            let bestMatch = null;
            let bestScore = 0;
            const normalizedDeviceName = normalizeName(deviceUser.name);
            for (const emp of employees) {
                if (mappedEmployeeIds.has(emp.id))
                    continue;
                const normalizedEmpName = normalizeName(emp.fullName);
                const score = calculateNameSimilarity(normalizedDeviceName, normalizedEmpName);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { id: emp.id, fullName: emp.fullName };
                }
            }
            return {
                deviceUser,
                suggestedEmployee: bestScore >= 0.4 ? bestMatch : null,
                confidence: Math.round(bestScore * 100),
            };
        });
    });
}
// ── Helpers ────────────────────────────────────────────────────────────
/**
 * Ensure time string is always in HH:MM format (zero-padded).
 * Prevents string comparison bugs: "9:30" → "09:30"
 */
function padTime(time) {
    if (!time)
        return '00:00';
    const parts = time.split(':');
    const h = (parts[0] || '0').padStart(2, '0');
    const m = (parts[1] || '0').padStart(2, '0');
    return `${h}:${m}`;
}
/** Convert "HH:MM" to total minutes for arithmetic. */
function timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}
function normalizeName(name) {
    return name
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '') // Remove Arabic diacritics
        .replace(/\s+/g, ' ');
}
/**
 * Simple Jaccard similarity on name tokens.
 * Returns 0-1 where 1 = identical token sets.
 */
function calculateNameSimilarity(a, b) {
    const tokensA = new Set(a.split(' ').filter(Boolean));
    const tokensB = new Set(b.split(' ').filter(Boolean));
    if (tokensA.size === 0 || tokensB.size === 0)
        return 0;
    let intersection = 0;
    for (const token of tokensA) {
        if (tokensB.has(token))
            intersection++;
    }
    const union = tokensA.size + tokensB.size - intersection;
    return union > 0 ? intersection / union : 0;
}
/**
 * Dynamic require of node-zklib.
 * Throws a clear error if not installed.
 * Uses require() to avoid TS compile-time module resolution failures.
 */
function loadZKLib() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require('node-zklib');
        }
        catch (_a) {
            throw new Error('node-zklib is not installed. Run: cd server && npm install node-zklib\n' +
                'This package is required for fingerprint device communication.');
        }
    });
}
