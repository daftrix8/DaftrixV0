"use strict";
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
exports.initializePOSJobs = initializePOSJobs;
const schedule = __importStar(require("node-schedule"));
const db_1 = require("../db");
/**
 * Initializes CRON jobs for POS automation
 * Runs every minute to check if autoCloseTime has been reached.
 */
function initializePOSJobs() {
    console.log('[CRON] POS auto-close job initialized.');
    // Ensure columns exist to prevent SELECT errors if settings were never opened
    (0, db_1.getConnection)().then((conn) => __awaiter(this, void 0, void 0, function* () {
        try {
            yield conn.query(`ALTER TABLE pos_settings ADD COLUMN autoCloseEnabled TINYINT(1) NOT NULL DEFAULT 0`);
        }
        catch (e) { }
        try {
            yield conn.query(`ALTER TABLE pos_settings ADD COLUMN autoCloseTime VARCHAR(5) NULL`);
        }
        catch (e) { }
        conn.release();
    })).catch(() => { });
    // Run every minute at 0 seconds
    schedule.scheduleJob('0 * * * * *', () => __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            // 1. Get POS settings to check if auto-close is enabled
            // Use SELECT * to avoid "Unknown column" errors if migration hasn't run yet
            const [settingsRows] = yield conn.query('SELECT * FROM pos_settings WHERE id = "1"');
            if (!settingsRows || settingsRows.length === 0)
                return;
            const settings = settingsRows[0];
            if (!settings.autoCloseEnabled || !settings.autoCloseTime)
                return;
            // 2. Check if current time matches autoCloseTime (format HH:mm)
            const now = new Date();
            const currentHours = now.getHours().toString().padStart(2, '0');
            const currentMinutes = now.getMinutes().toString().padStart(2, '0');
            const currentTime = `${currentHours}:${currentMinutes}`;
            if (currentTime !== settings.autoCloseTime) {
                return; // Not the right time
            }
            console.log(`[CRON] POS autoCloseTime (${currentTime}) reached. Processing open shifts...`);
            // 3. Find all open shifts
            const [openShifts] = yield conn.query(`
                SELECT id, expectedCash, cashierId 
                FROM pos_shifts 
                WHERE status = 'open'
            `);
            if (!openShifts || openShifts.length === 0) {
                console.log('[CRON] No open shifts found to auto-close.');
                return;
            }
            // 4. Close each shift automatically
            for (const shift of openShifts) {
                try {
                    console.log(`[CRON] Auto-closing shift: ${shift.id}`);
                    const endTime = new Date();
                    // We set actualCash = expectedCash (no manual count discrepancy for auto-close)
                    // We also mark it clearly in notes
                    const notes = 'تم إغلاق الوردية تلقائياً بواسطة النظام (Auto-Close)';
                    yield conn.query(`
                        UPDATE pos_shifts 
                        SET 
                            status = 'closed',
                            endTime = ?,
                            actualCash = expectedCash,
                            actualCard = 0,
                            cashDifference = 0,
                            notes = CONCAT(IFNULL(notes, ''), '\n', ?)
                        WHERE id = ?
                    `, [endTime, notes, shift.id]);
                    // TODO: Notify cashier/manager (can add notification system hook here)
                    console.log(`[CRON] Shift ${shift.id} auto-closed successfully.`);
                }
                catch (err) {
                    console.error(`[CRON] Failed to auto-close shift ${shift.id}:`, err);
                }
            }
        }
        catch (error) {
            console.error('[CRON] Error in POS auto-close job:', error);
        }
        finally {
            if (conn)
                conn.release();
        }
    }));
    // Run nightly at 00:05 to expire points
    schedule.scheduleJob('5 0 * * *', () => __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            console.log('[CRON] Running loyalty points expiry job...');
            const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const [expiredPoints] = yield conn.query(`
                SELECT t.id, t.customerId, t.points, 
                       COALESCE(SUM(c.pointsConsumed), 0) as consumed
                FROM loyalty_transactions t
                LEFT JOIN loyalty_point_consumptions c ON t.id = c.earnTransactionId
                WHERE t.type = 'EARN' 
                  AND t.expiresAt IS NOT NULL 
                  AND t.expiresAt <= ?
                GROUP BY t.id
                HAVING (t.points - consumed) > 0
            `, [now]);
            if (expiredPoints && expiredPoints.length > 0) {
                for (const tx of expiredPoints) {
                    const unconsumed = tx.points - tx.consumed;
                    const [uuidRow] = yield conn.query('SELECT UUID() as id');
                    const txId = uuidRow[0].id;
                    const [consumeUuidRow] = yield conn.query('SELECT UUID() as id');
                    const consumeTxId = consumeUuidRow[0].id;
                    yield conn.query(`
                        INSERT INTO loyalty_transactions (id, customerId, type, points, description, createdBy, createdAt)
                        VALUES (?, ?, 'EXPIRE', ?, 'انتهاء صلاحية النقاط', 'System', ?)
                    `, [txId, tx.customerId, -unconsumed, now]);
                    yield conn.query(`
                        INSERT INTO loyalty_point_consumptions (id, earnTransactionId, consumeTransactionId, pointsConsumed, createdAt)
                        VALUES (?, ?, ?, ?, ?)
                    `, [consumeTxId, tx.id, txId, unconsumed, now]);
                }
                console.log(`[CRON] Expired points for \${expiredPoints.length} transactions.`);
            }
        }
        catch (error) {
            console.error('[CRON] Error in loyalty expiry job:', error);
        }
        finally {
            if (conn)
                conn.release();
        }
    }));
}
