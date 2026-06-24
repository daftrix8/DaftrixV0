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
exports.checkActiveCartUpdate = exports.sendAdminMessage = exports.unlockActiveCart = exports.lockActiveCart = exports.remoteUpdateActiveCart = exports.listActiveCarts = exports.syncActiveCart = void 0;
exports.fetchAllActiveCartsFromDb = fetchAllActiveCartsFromDb;
const db_1 = require("../db");
const eventBus_1 = require("../utils/eventBus");
const realtimeState_1 = require("../utils/realtimeState");
// Helper function to fetch and format all active carts from the database
// We ignore carts that haven't synced in the last 15 minutes (to keep it clean)
function fetchAllActiveCartsFromDb() {
    return __awaiter(this, void 0, void 0, function* () {
        const cutoff = Date.now() - 15 * 60 * 1000;
        const [rows] = yield (0, db_1.safePoolQuery)(`SELECT cashierId, cashierName, warehouseName, cartState, isLocked, lockedBy, lastInterventionReason, lastAdminMessage, updatedAt 
         FROM pos_active_carts 
         WHERE updatedAt > ? 
         ORDER BY updatedAt DESC`, [cutoff]);
        return rows.map(row => {
            let state = row.cartState;
            if (typeof state === 'string') {
                try {
                    state = JSON.parse(state);
                }
                catch (_a) { }
            }
            const activeConnections = (0, realtimeState_1.getActiveConnectionsByUserId)(row.cashierId);
            const isOnline = activeConnections.length > 0;
            const connectionType = isOnline ? activeConnections[0].transport : 'none';
            return {
                cashierId: row.cashierId,
                cashierName: row.cashierName,
                warehouseName: row.warehouseName,
                cart: (state === null || state === void 0 ? void 0 : state.cart) || [],
                selectedCustomer: (state === null || state === void 0 ? void 0 : state.selectedCustomer) || null,
                globalDiscount: (state === null || state === void 0 ? void 0 : state.globalDiscount) || 0,
                discountType: (state === null || state === void 0 ? void 0 : state.discountType) || 'PERCENT',
                total: (state === null || state === void 0 ? void 0 : state.total) || 0,
                itemCount: (state === null || state === void 0 ? void 0 : state.itemCount) || 0,
                isOnline,
                connectionType,
                isLocked: !!row.isLocked,
                lockedBy: row.lockedBy,
                lastInterventionReason: row.lastInterventionReason,
                lastAdminMessage: row.lastAdminMessage,
                updatedAt: row.updatedAt
            };
        });
    });
}
// Synchronize cart state from cashier
// POST /api/pos/active-carts/sync
const syncActiveCart = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const cashierId = user === null || user === void 0 ? void 0 : user.id;
        if (!cashierId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const { cashierName, warehouseName, cartState } = req.body;
        if (!cashierName || !warehouseName || !cartState) {
            return res.status(400).json({ error: 'Missing required sync parameters' });
        }
        const now = Date.now();
        // Insert or update in database
        yield (0, db_1.safePoolQuery)(`INSERT INTO pos_active_carts (cashierId, cashierName, warehouseName, cartState, updatedAt)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
                cashierName = VALUES(cashierName),
                warehouseName = VALUES(warehouseName),
                cartState = VALUES(cartState),
                updatedAt = VALUES(updatedAt)`, [cashierId, cashierName, warehouseName, JSON.stringify(cartState), now]);
        // Also broadcast via socket (for backward compatibility / instant updates if connected)
        eventBus_1.eventBus.broadcast('pos:carts:list', yield fetchAllActiveCartsFromDb());
        res.json({ success: true });
    }
    catch (error) {
        console.error('[POS Sync] Error in syncActiveCart:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.syncActiveCart = syncActiveCart;
// List all active carts
// GET /api/pos/active-carts/list
const listActiveCarts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const carts = yield fetchAllActiveCartsFromDb();
        res.json({ success: true, carts });
    }
    catch (error) {
        console.error('[POS Sync] Error in listActiveCarts:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.listActiveCarts = listActiveCarts;
// Write a remote update for a cashier
// POST /api/pos/active-carts/remote-update
const remoteUpdateActiveCart = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const admin = req.user;
        const { cashierId, cartState, lastInterventionReason } = req.body;
        if (!cashierId || !cartState) {
            return res.status(400).json({ error: 'Missing cashierId or cartState' });
        }
        const now = Date.now();
        const remoteUpdatePayload = Object.assign(Object.assign({}, cartState), { adminName: (admin === null || admin === void 0 ? void 0 : admin.name) || 'المدير', lastInterventionReason: lastInterventionReason || null });
        yield (0, db_1.safePoolQuery)(`UPDATE pos_active_carts 
             SET remoteUpdate = ?, isLocked = 0, lockedBy = NULL, lastAdminMessage = NULL, lastInterventionReason = ?, updatedAt = ?
             WHERE cashierId = ?`, [JSON.stringify(remoteUpdatePayload), lastInterventionReason || null, now, cashierId]);
        // Broadcast to notify cashiers immediately if they are online via sockets
        eventBus_1.eventBus.broadcast('pos:cart:remote-update-received', {
            cashierId,
            cartState,
            adminName: (admin === null || admin === void 0 ? void 0 : admin.name) || 'المدير'
        });
        eventBus_1.eventBus.broadcast('pos:cart:lock-released', {
            cashierId
        });
        eventBus_1.eventBus.broadcast('pos:carts:list', yield fetchAllActiveCartsFromDb());
        res.json({ success: true });
    }
    catch (error) {
        console.error('[POS Sync] Error in remoteUpdateActiveCart:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.remoteUpdateActiveCart = remoteUpdateActiveCart;
// Lock cashier's screen remotely
// POST /api/pos/active-carts/lock
const lockActiveCart = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const admin = req.user;
        const { cashierId } = req.body;
        if (!cashierId) {
            return res.status(400).json({ error: 'Missing cashierId' });
        }
        const adminName = (admin === null || admin === void 0 ? void 0 : admin.name) || 'المدير';
        const now = Date.now();
        yield (0, db_1.safePoolQuery)(`UPDATE pos_active_carts 
             SET isLocked = 1, lockedBy = ?, updatedAt = ? 
             WHERE cashierId = ?`, [adminName, now, cashierId]);
        // Broadcast lock status
        eventBus_1.eventBus.broadcast('pos:cart:lock-acquired', {
            cashierId,
            lockedBy: adminName
        });
        eventBus_1.eventBus.broadcast('pos:carts:list', yield fetchAllActiveCartsFromDb());
        res.json({ success: true, lockedBy: adminName });
    }
    catch (error) {
        console.error('[POS Sync] Error in lockActiveCart:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.lockActiveCart = lockActiveCart;
// Unlock cashier's screen remotely
// POST /api/pos/active-carts/unlock
const unlockActiveCart = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { cashierId } = req.body;
        if (!cashierId) {
            return res.status(400).json({ error: 'Missing cashierId' });
        }
        const now = Date.now();
        yield (0, db_1.safePoolQuery)(`UPDATE pos_active_carts 
             SET isLocked = 0, lockedBy = NULL, lastAdminMessage = NULL, updatedAt = ? 
             WHERE cashierId = ?`, [now, cashierId]);
        // Broadcast unlock status
        eventBus_1.eventBus.broadcast('pos:cart:lock-released', {
            cashierId
        });
        eventBus_1.eventBus.broadcast('pos:carts:list', yield fetchAllActiveCartsFromDb());
        res.json({ success: true });
    }
    catch (error) {
        console.error('[POS Sync] Error in unlockActiveCart:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.unlockActiveCart = unlockActiveCart;
// Send message to cashier's screen
// POST /api/pos/active-carts/message
const sendAdminMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const admin = req.user;
        const { cashierId, message } = req.body;
        if (!cashierId || message === undefined) {
            return res.status(400).json({ error: 'Missing cashierId or message' });
        }
        const adminName = (admin === null || admin === void 0 ? void 0 : admin.name) || 'المدير';
        const now = Date.now();
        yield (0, db_1.safePoolQuery)(`UPDATE pos_active_carts 
             SET lastAdminMessage = ?, updatedAt = ? 
             WHERE cashierId = ?`, [message, now, cashierId]);
        // Broadcast message to cashier
        eventBus_1.eventBus.broadcast('pos:cart:message-received', {
            cashierId,
            message,
            adminName
        });
        eventBus_1.eventBus.broadcast('pos:carts:list', yield fetchAllActiveCartsFromDb());
        res.json({ success: true });
    }
    catch (error) {
        console.error('[POS Sync] Error in sendAdminMessage:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.sendAdminMessage = sendAdminMessage;
// Cashier checks if there's any pending remote update or lock status
// GET /api/pos/active-carts/check-update/:cashierId
const checkActiveCartUpdate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { cashierId } = req.params;
        if (!cashierId) {
            return res.status(400).json({ error: 'Cashier ID required' });
        }
        // Get the active cart and check if remoteUpdate is set
        const [rows] = yield (0, db_1.safePoolQuery)(`SELECT remoteUpdate, isLocked, lockedBy, lastAdminMessage FROM pos_active_carts WHERE cashierId = ?`, [cashierId]);
        const row = rows[0];
        if (row) {
            let parsedUpdate = row.remoteUpdate;
            if (typeof parsedUpdate === 'string') {
                try {
                    parsedUpdate = JSON.parse(parsedUpdate);
                }
                catch (_a) { }
            }
            if (row.remoteUpdate) {
                // Clear the remoteUpdate column so it is only consumed once
                yield (0, db_1.safePoolQuery)(`UPDATE pos_active_carts SET remoteUpdate = NULL, isLocked = 0, lockedBy = NULL, lastAdminMessage = NULL WHERE cashierId = ?`, [cashierId]);
                return res.json({
                    hasUpdate: true,
                    update: parsedUpdate,
                    isLocked: false,
                    lockedBy: null,
                    lastAdminMessage: null
                });
            }
            return res.json({
                hasUpdate: false,
                isLocked: !!row.isLocked,
                lockedBy: row.lockedBy,
                lastAdminMessage: row.lastAdminMessage
            });
        }
        res.json({ hasUpdate: false });
    }
    catch (error) {
        console.error('[POS Sync] Error in checkActiveCartUpdate:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.checkActiveCartUpdate = checkActiveCartUpdate;
