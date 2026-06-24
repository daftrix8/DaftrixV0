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
exports.generateNextSequentialNumber = generateNextSequentialNumber;
const crypto_1 = require("crypto");
/**
 * Invoice Number Generator — Strict MAX + 1 Strategy (PERF v2)
 * =============================================
 * Enforces a strict ascending sequence for invoices by finding the MAXIMUM
 * number in the sequence for each prefix and adding 1. This prevents jarring
 * sequence jumps (jitter) commonly caused by deleted older records or messy data
 * entries imported from older systems (Migrations).
 *
 * Thread-Safety: Uses SELECT ... FOR UPDATE inside the caller's open transaction.
 * The caller MUST call this inside an active transaction to prevent race conditions.
 *
 * PERF v2: Replaced REGEXP with LIKE + LENGTH for index-friendly queries.
 * REGEXP forces full index scans; LIKE 'PREFIX%' uses B-tree prefix matching.
 *
 * Supports all invoice prefixes:
 *   INV-  PUR-  RET-S-  RET-P-  REC-  PAY-  QUO-  TRX-
 */
/**
 * Finds the next sequential number for a given prefix.
 *
 * Algorithm:
 *  1. Use LIKE + LENGTH to find MAX numeric suffix (index-friendly).
 *  2. candidate = MAX + 1.
 *  3. A uniqueness check guard loop (max 10 tries) handles rare race windows.
 *
 * @param conn   - Active DB connection (must be inside a transaction)
 * @param prefix - e.g. 'INV-', 'PUR-', 'REC-'
 * @returns      - Full formatted invoice number, e.g. 'INV-00003'
 */
function generateNextSequentialNumber(conn_1, prefix_1) {
    return __awaiter(this, arguments, void 0, function* (conn, prefix, tableName = 'invoices', columnName = 'number', branchId = null) {
        const PAD = 5; // e.g. 00001
        const expectedLength = prefix.length + PAD; // e.g. 'INV-' (4) + 5 = 9
        let candidate = 1;
        const likePattern = `${prefix}%`;
        const prefixLen = prefix.length;
        // Step 1: Lock the branch row (or fallback to system_config row/table limits)
        // to strictly serialize concurrent requests even when the table is empty.
        if (branchId) {
            try {
                yield conn.query('SELECT id FROM branches WHERE id = ? FOR UPDATE', [branchId]);
            }
            catch (lockErr) {
                console.warn(`⚠️ Branch lock failed (non-fatal):`, lockErr.message);
                try {
                    yield conn.query('SELECT config FROM system_config LIMIT 1 FOR UPDATE');
                }
                catch (_a) {
                    yield conn.query(`SELECT ?? FROM ?? LIMIT 1 FOR UPDATE`, [columnName, tableName]).catch(() => { });
                }
            }
        }
        else {
            try {
                yield conn.query('SELECT config FROM system_config LIMIT 1 FOR UPDATE');
            }
            catch (_b) {
                yield conn.query(`SELECT ?? FROM ?? LIMIT 1 FOR UPDATE`, [columnName, tableName]).catch(() => { });
            }
        }
        // Step 2: Lock the highest existing row for this prefix to serialize concurrent reads.
        // If no rows exist yet, this returns nothing and candidate stays at 1.
        yield conn.query(`SELECT ?? FROM ?? WHERE ?? LIKE ? AND LENGTH(??) = ? ORDER BY ?? DESC LIMIT 1 FOR UPDATE`, [columnName, tableName, columnName, likePattern, columnName, expectedLength, columnName]);
        // Step 2: Now that we hold the lock, read MAX safely.
        const [rows] = yield conn.query(`SELECT MAX(CAST(SUBSTRING(??, ${prefixLen + 1}) AS UNSIGNED)) AS maxNum
         FROM ??
         WHERE ?? LIKE ? AND LENGTH(??) = ?`, [
            columnName,
            tableName,
            columnName,
            likePattern,
            columnName,
            expectedLength
        ]);
        if (rows.length > 0 && rows[0].maxNum != null) {
            candidate = Number(rows[0].maxNum) + 1;
            console.log(`🔢 [SeqGen] MAX for "${prefix}" in ${tableName}: ${rows[0].maxNum} → candidate: ${candidate}`);
        }
        // Guard loop: confirm candidate is truly free (handles edge cases where FOR UPDATE
        // couldn't lock a row because the table was empty or prefix had no matches).
        let attempts = 0;
        const MAX_ATTEMPTS = 20;
        while (attempts < MAX_ATTEMPTS) {
            const formatted = `${prefix}${String(candidate).padStart(PAD, '0')}`;
            const [conflict] = yield conn.query(`SELECT 1 FROM ?? WHERE ?? = ? LIMIT 1`, [tableName, columnName, formatted]);
            if (conflict.length === 0) {
                console.log(`🔢 [SeqGen] Next number for prefix "${prefix}" in ${tableName}: ${formatted}`);
                return formatted;
            }
            // Rare race: another thread just took this number; advance and retry
            console.warn(`⚠️ [SeqGen] Collision on ${formatted} in ${tableName}, advancing...`);
            candidate++;
            attempts++;
        }
        // Absolute safety fallback (should never reach here under normal usage)
        // WARNING: This format exceeds expectedLength, so future MAX queries using
        // LENGTH = expectedLength will never find it — the sequence permanently
        // skips this number. UUID suffix guarantees uniqueness even under extreme contention.
        const fallback = `${prefix}${String(candidate).padStart(PAD, '0')}-${(0, crypto_1.randomUUID)().substring(0, 8)}`;
        console.error(`❌ [SeqGen] Max attempts exceeded for prefix "${prefix}" in ${tableName}. Using fallback: ${fallback}`);
        return fallback;
    });
}
