"use strict";
/**
 * POS Cashiers Controller
 * =========================
 * Phase 5: POS-specific cashier credentials + switch within a shift.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.switchCashier = exports.posCashierLogin = exports.endCashierSession = exports.deleteCashier = exports.updateCashier = exports.createCashier = exports.getCashiers = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const dateUtils_1 = require("../../utils/dateUtils");
// ── Schema helpers ─────────────────────────────────────────────────────────
function ensureCashierTables(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        yield conn.query(`
        CREATE TABLE IF NOT EXISTS pos_cashiers (
            id         VARCHAR(36)  NOT NULL,
            name       VARCHAR(255) NOT NULL,
            username   VARCHAR(100) NOT NULL,
            pinHash    VARCHAR(255) NOT NULL,
            employeeId VARCHAR(36)  NULL,
            isActive   TINYINT(1)   NOT NULL DEFAULT 1,
            failedAttempts INT      NOT NULL DEFAULT 0,
            lockoutUntil DATETIME   NULL,
            createdAt  DATETIME     DEFAULT CURRENT_TIMESTAMP,
            updatedAt  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_cashier_username (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
        yield conn.query(`
        CREATE TABLE IF NOT EXISTS pos_cashier_shifts (
            id        VARCHAR(36) NOT NULL,
            shiftId   VARCHAR(36) NOT NULL,
            cashierId VARCHAR(36) NOT NULL,
            startedAt DATETIME    NOT NULL,
            endedAt   DATETIME    NULL,
            PRIMARY KEY (id),
            CONSTRAINT fk_cs_shift    FOREIGN KEY (shiftId)   REFERENCES pos_shifts(id),
            CONSTRAINT fk_cs_cashier  FOREIGN KEY (cashierId) REFERENCES pos_cashiers(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
        // Ensure currentCashierId column on pos_shifts
        try {
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN currentCashierId VARCHAR(36) NULL`);
        }
        catch ( /* already exists */_a) { /* already exists */ }
        // Ensure lockout columns exist
        try {
            yield conn.query(`ALTER TABLE pos_cashiers ADD COLUMN failedAttempts INT NOT NULL DEFAULT 0`);
        }
        catch ( /* already exists */_b) { /* already exists */ }
        try {
            yield conn.query(`ALTER TABLE pos_cashiers ADD COLUMN lockoutUntil DATETIME NULL`);
        }
        catch ( /* already exists */_c) { /* already exists */ }
    });
}
// ── Controllers ────────────────────────────────────────────────────────────
/**
 * GET /api/pos/cashiers
 */
const getCashiers = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield ensureCashierTables(conn);
        const [rows] = yield conn.query(`SELECT id, name, username, employeeId, isActive, createdAt
             FROM pos_cashiers ORDER BY name ASC`);
        res.json({ cashiers: rows });
    }
    catch (error) {
        console.error('[POS Cashiers] getCashiers error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getCashiers = getCashiers;
/**
 * POST /api/pos/cashiers
 */
const createCashier = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield ensureCashierTables(conn);
        const { name, username, pin, employeeId } = req.body;
        if (!name || !username || !pin) {
            return res.status(400).json({ error: 'الاسم واسم المستخدم والرقم السري مطلوبة' });
        }
        const pinStr = String(pin).trim();
        if (!/^\d{4,6}$/.test(pinStr)) {
            return res.status(400).json({ error: 'الرقم السري يجب أن يكون 4-6 أرقام' });
        }
        // Check username uniqueness
        const [existing] = yield conn.query(`SELECT id FROM pos_cashiers WHERE username = ? COLLATE utf8mb4_unicode_ci`, [username]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'اسم المستخدم مستخدم بالفعل' });
        }
        const bcrypt = yield Promise.resolve().then(() => __importStar(require('bcryptjs')));
        const pinHash = yield bcrypt.hash(pinStr, 10);
        const id = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO pos_cashiers (id, name, username, pinHash, employeeId) VALUES (?, ?, ?, ?, ?)`, [id, name, username, pinHash, employeeId || null]);
        res.json({ success: true, cashier: { id, name, username, employeeId: employeeId || null } });
    }
    catch (error) {
        console.error('[POS Cashiers] createCashier error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.createCashier = createCashier;
/**
 * PUT /api/pos/cashiers/:id
 */
const updateCashier = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const { name, username, pin, employeeId, isActive } = req.body;
        const updates = [];
        const params = [];
        if (name) {
            updates.push('name = ?');
            params.push(name);
        }
        if (username) {
            updates.push('username = ?');
            params.push(username);
        }
        if (employeeId !== undefined) {
            updates.push('employeeId = ?');
            params.push(employeeId || null);
        }
        if (isActive !== undefined) {
            updates.push('isActive = ?');
            params.push(isActive ? 1 : 0);
        }
        if (pin) {
            const pinStr = String(pin).trim();
            if (!/^\d{4,6}$/.test(pinStr)) {
                return res.status(400).json({ error: 'الرقم السري يجب أن يكون 4-6 أرقام' });
            }
            const bcrypt = yield Promise.resolve().then(() => __importStar(require('bcryptjs')));
            updates.push('pinHash = ?');
            params.push(yield bcrypt.hash(pinStr, 10));
        }
        if (updates.length === 0) {
            return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
        }
        params.push(id);
        yield conn.query(`UPDATE pos_cashiers SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[POS Cashiers] updateCashier error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.updateCashier = updateCashier;
/**
 * DELETE /api/pos/cashiers/:id — soft delete
 */
const deleteCashier = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        yield conn.query(`UPDATE pos_cashiers SET isActive = 0 WHERE id = ?`, [id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[POS Cashiers] deleteCashier error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.deleteCashier = deleteCashier;
/**
 * POST /api/pos/shifts/:shiftId/end-cashier-session
 * Ends the active cashier's sub-shift and locks the POS
 * without closing the main shift.
 */
const endCashierSession = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield ensureCashierTables(conn);
        const { shiftId } = req.params;
        const now = (0, dateUtils_1.getEgyptianISOString)();
        // Verify shift is still open
        const [shifts] = yield conn.query(`SELECT id, currentCashierId FROM pos_shifts
             WHERE id = ? COLLATE utf8mb4_unicode_ci AND status = 'OPEN' COLLATE utf8mb4_unicode_ci`, [shiftId]);
        if (shifts.length === 0) {
            return res.status(404).json({ error: 'الوردية غير موجودة أو مغلقة' });
        }
        yield conn.query('START TRANSACTION');
        try {
            // Close all open cashier sub-shifts for this main shift
            yield conn.query(`UPDATE pos_cashier_shifts SET endedAt = ?
                 WHERE shiftId = ? COLLATE utf8mb4_unicode_ci AND endedAt IS NULL`, [now, shiftId]);
            // Clear currentCashierId — POS is now unattended until next login
            yield conn.query(`UPDATE pos_shifts SET currentCashierId = NULL
                 WHERE id = ? COLLATE utf8mb4_unicode_ci`, [shiftId]);
            yield conn.query('COMMIT');
        }
        catch (txError) {
            yield conn.query('ROLLBACK');
            throw txError;
        }
        res.json({ success: true, message: 'تم إنهاء جلسة الكاشير. يرجى تسجيل الدخول مجدداً.' });
    }
    catch (error) {
        console.error('[POS Cashiers] endCashierSession error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.endCashierSession = endCashierSession;
const posCashierLogin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield ensureCashierTables(conn);
        const { username, pin } = req.body;
        if (!username || !pin) {
            return res.status(400).json({ error: 'اسم المستخدم والرقم السري مطلوبان' });
        }
        const [rows] = yield conn.query(`SELECT id, name, pinHash, failedAttempts, lockoutUntil FROM pos_cashiers
             WHERE username = ? COLLATE utf8mb4_unicode_ci AND isActive = 1`, [username]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'بيانات تسجيل الدخول غير صحيحة' });
        }
        const cashier = rows[0];
        if (cashier.lockoutUntil) {
            const lockoutDate = new Date(cashier.lockoutUntil);
            if (lockoutDate > new Date()) {
                return res.status(429).json({
                    error: 'تم حظر الحساب مؤقتاً',
                    lockoutUntil: lockoutDate.toISOString()
                });
            }
            if (lockoutDate <= new Date()) {
                cashier.failedAttempts = 0;
            }
        }
        const bcrypt = yield Promise.resolve().then(() => __importStar(require('bcryptjs')));
        const isValid = yield bcrypt.compare(String(pin), cashier.pinHash);
        if (!isValid) {
            const newAttempts = (cashier.failedAttempts || 0) + 1;
            if (newAttempts >= 3) {
                const lockoutUntil = new Date(Date.now() + 30000);
                yield conn.query(`UPDATE pos_cashiers SET failedAttempts = ?, lockoutUntil = ? WHERE id = ?`, [newAttempts, lockoutUntil, cashier.id]);
                return res.status(429).json({
                    error: 'تم حظر الحساب لمدة 30 ثانية بسبب المحاولات الخاطئة',
                    failedAttempts: newAttempts,
                    lockoutUntil: lockoutUntil.toISOString()
                });
            }
            else {
                yield conn.query(`UPDATE pos_cashiers SET failedAttempts = ? WHERE id = ?`, [newAttempts, cashier.id]);
                return res.status(401).json({
                    error: 'الرقم السري غير صحيح',
                    failedAttempts: newAttempts
                });
            }
        }
        yield conn.query(`UPDATE pos_cashiers SET failedAttempts = 0, lockoutUntil = NULL WHERE id = ?`, [cashier.id]);
        const jwt = yield Promise.resolve().then(() => __importStar(require('jsonwebtoken')));
        const secret = process.env.JWT_SECRET || 'pos_cashier_secret';
        const posToken = jwt.sign({ cashierId: cashier.id, name: cashier.name, scope: 'pos_only' }, secret, { expiresIn: '12h' });
        res.json({ success: true, cashier: { id: cashier.id, name: cashier.name }, posToken });
    }
    catch (error) {
        console.error('[POS Cashiers] posCashierLogin error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.posCashierLogin = posCashierLogin;
/**
 * POST /api/pos/shifts/:shiftId/switch-cashier
 */
const switchCashier = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield ensureCashierTables(conn);
        const { shiftId } = req.params;
        const { username, pin } = req.body;
        if (!username || !pin) {
            return res.status(400).json({ error: 'اسم المستخدم والرقم السري مطلوبان' });
        }
        // Verify shift is open
        const [shifts] = yield conn.query(`SELECT id FROM pos_shifts WHERE id = ? COLLATE utf8mb4_unicode_ci AND status = 'OPEN' COLLATE utf8mb4_unicode_ci`, [shiftId]);
        if (shifts.length === 0) {
            return res.status(404).json({ error: 'الوردية غير موجودة أو مغلقة' });
        }
        // Find cashier
        const [cashierRows] = yield conn.query(`SELECT id, name, pinHash, failedAttempts, lockoutUntil FROM pos_cashiers
             WHERE username = ? COLLATE utf8mb4_unicode_ci AND isActive = 1`, [username]);
        if (cashierRows.length === 0) {
            return res.status(401).json({ error: 'الكاشير غير موجود' });
        }
        const cashier = cashierRows[0];
        if (cashier.lockoutUntil) {
            const lockoutDate = new Date(cashier.lockoutUntil);
            if (lockoutDate > new Date()) {
                return res.status(429).json({
                    error: 'تم حظر الحساب مؤقتاً',
                    lockoutUntil: lockoutDate.toISOString()
                });
            }
            if (lockoutDate <= new Date()) {
                cashier.failedAttempts = 0;
            }
        }
        const bcrypt = yield Promise.resolve().then(() => __importStar(require('bcryptjs')));
        const isValid = yield bcrypt.compare(String(pin), cashier.pinHash);
        if (!isValid) {
            const newAttempts = (cashier.failedAttempts || 0) + 1;
            if (newAttempts >= 3) {
                const lockoutUntil = new Date(Date.now() + 30000);
                yield conn.query(`UPDATE pos_cashiers SET failedAttempts = ?, lockoutUntil = ? WHERE id = ?`, [newAttempts, lockoutUntil, cashier.id]);
                return res.status(429).json({
                    error: 'تم حظر الحساب لمدة 30 ثانية بسبب المحاولات الخاطئة',
                    failedAttempts: newAttempts,
                    lockoutUntil: lockoutUntil.toISOString()
                });
            }
            else {
                yield conn.query(`UPDATE pos_cashiers SET failedAttempts = ? WHERE id = ?`, [newAttempts, cashier.id]);
                return res.status(401).json({
                    error: 'الرقم السري غير صحيح',
                    failedAttempts: newAttempts
                });
            }
        }
        yield conn.query(`UPDATE pos_cashiers SET failedAttempts = 0, lockoutUntil = NULL WHERE id = ?`, [cashier.id]);
        const now = (0, dateUtils_1.getEgyptianISOString)();
        yield conn.query('START TRANSACTION');
        try {
            // Close the current cashier's open sub-shift
            yield conn.query(`UPDATE pos_cashier_shifts SET endedAt = ?
                 WHERE shiftId = ? COLLATE utf8mb4_unicode_ci AND endedAt IS NULL`, [now, shiftId]);
            // Open new cashier sub-shift
            yield conn.query(`INSERT INTO pos_cashier_shifts (id, shiftId, cashierId, startedAt) VALUES (?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), shiftId, cashier.id, now]);
            // Update currentCashierId on the shift
            yield conn.query(`UPDATE pos_shifts SET currentCashierId = ? WHERE id = ? COLLATE utf8mb4_unicode_ci`, [cashier.id, shiftId]);
            yield conn.query('COMMIT');
        }
        catch (txError) {
            yield conn.query('ROLLBACK');
            throw txError;
        }
        res.json({
            success: true,
            cashier: { id: cashier.id, name: cashier.name },
            message: `تم تسجيل الدخول بنجاح — ${cashier.name}`,
        });
    }
    catch (error) {
        console.error('[POS Cashiers] switchCashier error:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.switchCashier = switchCashier;
