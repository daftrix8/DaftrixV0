"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Bank Reconciliation Controller
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Replaces localStorage-based reconciliation with database-backed persistence.
 * Provides CRUD for cleared journal entries per bank account with audit trail.
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
exports.bulkSetClearedItems = exports.toggleClearedItem = exports.getClearedItems = void 0;
const db_1 = require("../db");
/**
 * GET /api/accounting/bank-reconciliation/:bankAccountId
 * Retrieve all cleared journal entry IDs for a specific bank account.
 */
const getClearedItems = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        const { bankAccountId } = req.params;
        if (!bankAccountId) {
            return res.status(400).json({ error: 'bankAccountId is required' });
        }
        conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query(`SELECT journalEntryId, clearedAt, clearedBy 
             FROM bank_reconciliation_items 
             WHERE bankAccountId = ?
             ORDER BY clearedAt DESC`, [bankAccountId]);
        conn.release();
        conn = null;
        const items = rows;
        res.json({
            bankAccountId,
            clearedIds: items.map((r) => r.journalEntryId),
            items
        });
    }
    catch (error) {
        if (conn)
            try {
                conn.release();
            }
            catch ( /* ignore */_a) { /* ignore */ }
        console.error('❌ [BankRecon] Failed to get cleared items:', error.message);
        res.status(500).json({ error: 'Failed to fetch reconciliation data' });
    }
});
exports.getClearedItems = getClearedItems;
/**
 * POST /api/accounting/bank-reconciliation/:bankAccountId/toggle
 * Toggle a single journal entry as cleared/uncleared.
 * Body: { journalEntryId: string }
 */
const toggleClearedItem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    let conn;
    try {
        const { bankAccountId } = req.params;
        const { journalEntryId } = req.body;
        const userName = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || 'system';
        if (!bankAccountId || !journalEntryId) {
            return res.status(400).json({ error: 'bankAccountId and journalEntryId are required' });
        }
        conn = yield (0, db_1.getConnection)();
        // Check if already cleared
        const [existing] = yield conn.query(`SELECT id FROM bank_reconciliation_items WHERE bankAccountId = ? AND journalEntryId = ?`, [bankAccountId, journalEntryId]);
        const existingRows = existing;
        let action;
        if (existingRows.length > 0) {
            // Already cleared → unclear it
            yield conn.query(`DELETE FROM bank_reconciliation_items WHERE bankAccountId = ? AND journalEntryId = ?`, [bankAccountId, journalEntryId]);
            action = 'uncleared';
        }
        else {
            // Not cleared → clear it
            yield conn.query(`INSERT INTO bank_reconciliation_items (bankAccountId, journalEntryId, clearedBy) VALUES (?, ?, ?)`, [bankAccountId, journalEntryId, userName]);
            action = 'cleared';
        }
        conn.release();
        conn = null;
        res.json({ success: true, action, journalEntryId });
    }
    catch (error) {
        if (conn)
            try {
                conn.release();
            }
            catch ( /* ignore */_c) { /* ignore */ }
        console.error('❌ [BankRecon] Failed to toggle item:', error.message);
        res.status(500).json({ error: 'Failed to toggle reconciliation item' });
    }
});
exports.toggleClearedItem = toggleClearedItem;
/**
 * PUT /api/accounting/bank-reconciliation/:bankAccountId/bulk
 * Bulk set cleared IDs (replaces all existing entries for this bank).
 * Used for initial migration from localStorage.
 * Body: { clearedIds: string[] }
 */
const bulkSetClearedItems = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    let conn;
    try {
        const { bankAccountId } = req.params;
        const { clearedIds } = req.body;
        const userName = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || 'system';
        if (!bankAccountId || !Array.isArray(clearedIds)) {
            return res.status(400).json({ error: 'bankAccountId and clearedIds array are required' });
        }
        conn = yield (0, db_1.getConnection)();
        yield conn.beginTransaction();
        // Clear all existing entries for this bank
        yield conn.query(`DELETE FROM bank_reconciliation_items WHERE bankAccountId = ?`, [bankAccountId]);
        // Insert new entries (if any)
        if (clearedIds.length > 0) {
            const values = clearedIds.map(id => [bankAccountId, id, userName]);
            yield conn.query(`INSERT INTO bank_reconciliation_items (bankAccountId, journalEntryId, clearedBy) VALUES ?`, [values]);
        }
        yield conn.commit();
        conn.release();
        conn = null;
        res.json({ success: true, count: clearedIds.length });
    }
    catch (error) {
        if (conn)
            try {
                yield conn.rollback();
                conn.release();
            }
            catch ( /* ignore */_c) { /* ignore */ }
        console.error('❌ [BankRecon] Failed to bulk set items:', error.message);
        res.status(500).json({ error: 'Failed to bulk update reconciliation data' });
    }
});
exports.bulkSetClearedItems = bulkSetClearedItems;
