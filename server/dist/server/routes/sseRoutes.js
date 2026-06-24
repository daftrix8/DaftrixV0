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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSSEClientCount = getSSEClientCount;
exports.getSSEClients = getSSEClients;
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const eventBus_1 = require("../utils/eventBus");
const chatHelpers_1 = require("../utils/chatHelpers");
const authMiddleware_1 = require("../middleware/authMiddleware");
const realtimeState_1 = require("../utils/realtimeState");
const router = (0, express_1.Router)();
// Short-lived SSE tickets (H10 security fix)
// Map<ticket, { user, expiresAt }>
const sseTickets = new Map();
const SSE_TICKET_TTL_MS = 30000; // 30 seconds
// Track connected SSE clients
const sseClients = new Map();
// Event history for missed-event recovery (Last-Event-ID)
// Keeps last 500 events in memory (~50KB max)
const MAX_EVENT_HISTORY = 500;
let globalEventId = 0;
const eventHistory = [];
function addToHistory(event, data) {
    const id = ++globalEventId;
    eventHistory.push({ id, event, data, timestamp: Date.now() });
    // Trim old events (keep last MAX_EVENT_HISTORY)
    while (eventHistory.length > MAX_EVENT_HISTORY) {
        eventHistory.shift();
    }
    return id;
}
// Heartbeat interval (15 seconds — aggressive for Hostinger proxies)
const HEARTBEAT_INTERVAL = 15000;
// Stale client cleanup interval (60 seconds)
const CLEANUP_INTERVAL = 60000;
/**
 * POST /api/sse/ticket
 * Exchange a JWT (from Authorization header) for a short-lived, single-use SSE ticket.
 * The ticket can then be passed as ?ticket=XXXX in the SSE URL (H10 security fix).
 */
router.post('/ticket', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header required' });
    }
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret)
        return res.status(500).json({ error: 'Server misconfiguration' });
    try {
        const decoded = jsonwebtoken_1.default.verify(authHeader.slice(7), jwtSecret);
        const ticket = crypto_1.default.randomBytes(32).toString('hex');
        sseTickets.set(ticket, { user: decoded, expiresAt: Date.now() + SSE_TICKET_TTL_MS });
        // Auto-cleanup expired tickets every 60s
        setTimeout(() => sseTickets.delete(ticket), SSE_TICKET_TTL_MS + 1000);
        res.json({ ticket, expiresIn: SSE_TICKET_TTL_MS / 1000 });
    }
    catch (_a) {
        return res.status(401).json({ error: 'Invalid token' });
    }
});
/**
 * GET /api/sse/events
 * SSE stream endpoint — first-class transport for real-time updates.
 * Auth via: ?ticket=SSE_TICKET (preferred, H10) or ?token=JWT (legacy).
 * Supports Last-Event-ID header for missed event recovery.
 */
router.get('/events', (req, res) => {
    const ticket = req.query.ticket;
    const token = req.query.token;
    if (!ticket && !token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    let user;
    // Prefer ticket-based auth (short-lived, single-use)
    if (ticket) {
        const entry = sseTickets.get(ticket);
        if (!entry || entry.expiresAt < Date.now()) {
            sseTickets.delete(ticket);
            return res.status(401).json({ error: 'Ticket expired or invalid' });
        }
        user = entry.user;
        sseTickets.delete(ticket); // Single-use: delete immediately
    }
    else {
        // Legacy: validate JWT directly from URL (less secure)
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret)
            return res.status(500).json({ error: 'Server misconfiguration' });
        try {
            user = jsonwebtoken_1.default.verify(token, jwtSecret);
        }
        catch (_a) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    }
    // Set SSE headers (optimized for Hostinger/Nginx proxies)
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Content-Encoding': 'none', // Prevents proxy compression and buffering
        'X-Accel-Buffering': 'no', // Disable Nginx buffering
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*',
        'Pragma': 'no-cache',
        'Expires': '0',
    });
    // Flush headers immediately
    res.flushHeaders();
    const clientId = `sse-${user.id}-${Date.now()}`;
    // Register SSE client
    const client = {
        id: clientId,
        userId: user.id,
        userName: user.name || user.username,
        role: user.role || 'USER',
        res,
        connectedAt: Date.now(),
        lastEventId: 0,
    };
    sseClients.set(clientId, client);
    // Track active user in unified registry
    (0, realtimeState_1.addActiveUser)(clientId, user.id, client.userName, client.role, 'sse');
    console.log(`📡 SSE client connected: ${client.userName} (${clientId}) — Total: ${sseClients.size}`);
    // Send connection confirmation with named event
    sendSSEEvent(client, 'connected', {
        clientId,
        userId: user.id,
        userName: client.userName,
        serverTime: new Date().toISOString(),
        transport: 'sse',
    });
    // Send initial active POS carts list
    sendSSEEvent(client, 'pos:carts:list', (0, realtimeState_1.getAllPOSCarts)());
    // ── Missed Event Recovery ──
    // If client sends Last-Event-ID, replay missed events
    const lastEventIdHeader = req.headers['last-event-id'];
    const lastEventIdQuery = req.query.lastEventId;
    const requestedLastId = parseInt(lastEventIdHeader || lastEventIdQuery || '0', 10);
    if (requestedLastId > 0) {
        const missedEvents = eventHistory.filter(e => e.id > requestedLastId);
        if (missedEvents.length > 0) {
            console.log(`📡 [SSE] Replaying ${missedEvents.length} missed events for ${client.userName} (since id=${requestedLastId})`);
            for (const missed of missedEvents) {
                sendSSEEvent(client, missed.event, missed.data, missed.id);
            }
        }
    }
    // Keep-alive: prevent request timeout
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true);
    // Hostinger kills long-lived connections after ~120s (confirmed from 500 errors
    // in production analytics — all at exactly ~120,800ms response time).
    // Gracefully close at 100s so the client's EventSource auto-reconnects cleanly
    // instead of Hostinger sending a 500 error.
    const SSE_MAX_CONNECTION_LIFETIME_MS = 100000; // 100 seconds
    const lifetimeTimer = setTimeout(() => {
        try {
            // Send a reconnect hint so the client knows this is intentional
            sendSSEEvent(client, 'reconnect', { reason: 'connection_lifetime', retryMs: 1000 });
            res.end();
        }
        catch (_a) {
            // Already closed
        }
    }, SSE_MAX_CONNECTION_LIFETIME_MS);
    // Clean up on disconnect
    const cleanup = () => {
        clearTimeout(lifetimeTimer);
        sseClients.delete(clientId);
        (0, realtimeState_1.removeActiveUser)(clientId);
    };
    req.on('close', () => {
        cleanup();
        console.log(`📡 SSE client disconnected: ${client.userName} (${clientId}) — Total: ${sseClients.size}`);
        eventBus_1.eventBus.broadcast('chat:system', {
            message: `${client.userName} غادر المحادثة`,
            type: 'leave'
        });
    });
    req.on('error', () => {
        cleanup();
    });
});
/**
 * POST /api/sse/action
 * Client→server actions when using SSE transport.
 * Auth via Bearer token in Authorization header.
 */
router.post('/action', authMiddleware_1.authenticateToken, (req, res) => {
    const { event, data } = req.body;
    const user = req.user;
    if (!event) {
        return res.status(400).json({ error: 'Event name required' });
    }
    // Handle all action types
    switch (event) {
        case 'user:viewing':
            if (user === null || user === void 0 ? void 0 : user.id) {
                (0, realtimeState_1.updateActiveUserViewByUserId)(user.id, data === null || data === void 0 ? void 0 : data.view);
            }
            break;
        case 'chat:send': {
            const chatMsg = Object.assign(Object.assign({}, data), { userId: user === null || user === void 0 ? void 0 : user.id, userName: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username), timestamp: new Date().toISOString(), type: 'message' });
            eventBus_1.eventBus.broadcast('chat:message', chatMsg);
            // Persist to database (fire-and-forget)
            Promise.resolve().then(() => __importStar(require('../db'))).then(({ pool }) => {
                pool.query('INSERT INTO chat_messages (id, userId, userName, message, type, replyTo, attachment, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())', [
                    chatMsg.id,
                    chatMsg.userId,
                    chatMsg.userName,
                    chatMsg.message,
                    'message',
                    chatMsg.replyTo ? JSON.stringify(chatMsg.replyTo) : null,
                    chatMsg.attachment ? JSON.stringify(chatMsg.attachment) : null
                ]).catch((err) => console.error('❌ SSE chat save error:', err.message));
            }).catch(() => { });
            break;
        }
        case 'chat:private': {
            const privateMsg = Object.assign(Object.assign({}, data), { userId: user === null || user === void 0 ? void 0 : user.id, userName: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username), timestamp: new Date().toISOString(), type: 'private' });
            eventBus_1.eventBus.broadcast('chat:private', privateMsg);
            // Persist to database (fire-and-forget)
            Promise.resolve().then(() => __importStar(require('../db'))).then(({ pool }) => {
                pool.query('INSERT INTO chat_messages (id, userId, userName, message, type, targetUserId, replyTo, attachment, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())', [
                    privateMsg.id || `pm-${Date.now()}`,
                    privateMsg.userId,
                    privateMsg.userName,
                    privateMsg.message,
                    'private',
                    privateMsg.targetUserId,
                    privateMsg.replyTo ? JSON.stringify(privateMsg.replyTo) : null,
                    privateMsg.attachment ? JSON.stringify(privateMsg.attachment) : null
                ]).catch((err) => console.error('❌ SSE private chat save error:', err.message));
            }).catch(() => { });
            break;
        }
        case 'chat:group': {
            const groupMsg = Object.assign(Object.assign({}, data), { userId: user === null || user === void 0 ? void 0 : user.id, userName: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username), timestamp: new Date().toISOString(), type: 'group' });
            eventBus_1.eventBus.broadcast('chat:group', groupMsg);
            // Persist to database (fire-and-forget)
            Promise.resolve().then(() => __importStar(require('../db'))).then(({ pool }) => {
                pool.query('INSERT INTO chat_messages (id, userId, userName, message, type, groupId, replyTo, attachment, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())', [
                    groupMsg.id || `gm-${Date.now()}`,
                    groupMsg.userId,
                    groupMsg.userName,
                    groupMsg.message,
                    'group',
                    groupMsg.groupId,
                    groupMsg.replyTo ? JSON.stringify(groupMsg.replyTo) : null,
                    groupMsg.attachment ? JSON.stringify(groupMsg.attachment) : null
                ]).catch((err) => console.error('❌ SSE group chat save error:', err.message));
            }).catch(() => { });
            break;
        }
        case 'chat:typing':
            eventBus_1.eventBus.broadcast('chat:typing', Object.assign(Object.assign({}, data), { userId: user === null || user === void 0 ? void 0 : user.id, userName: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) }));
            break;
        case 'chat:react': {
            const { messageId, emoji, action } = data;
            if (user === null || user === void 0 ? void 0 : user.id) {
                (0, chatHelpers_1.handleReaction)(user.id, messageId, emoji, action)
                    .then((result) => {
                    eventBus_1.eventBus.broadcast('chat:react', {
                        messageId,
                        emoji,
                        userId: user.id,
                        userName: user.name || user.username,
                        action,
                        reactions: result.reactions,
                        type: result.type,
                        messageSenderId: result.messageSenderId,
                        targetUserId: result.targetUserId,
                        groupId: result.groupId
                    });
                })
                    .catch((err) => console.error('❌ SSE reaction error:', err.message));
            }
            break;
        }
        case 'pos:cart:sync':
            (0, realtimeState_1.savePOSCartState)(user.id, data);
            eventBus_1.eventBus.broadcast('pos:carts:list', (0, realtimeState_1.getAllPOSCarts)());
            break;
        case 'pos:cart:remote-update':
            (0, realtimeState_1.savePOSCartState)(data.cashierId, Object.assign(Object.assign({}, data.cartState), { cashierId: data.cashierId, updatedByAdmin: user.name || user.username }));
            eventBus_1.eventBus.broadcast('pos:carts:list', (0, realtimeState_1.getAllPOSCarts)());
            eventBus_1.eventBus.broadcast('pos:cart:remote-update-received', {
                cashierId: data.cashierId,
                cartState: data.cartState,
                adminName: user.name || user.username
            });
            break;
        case 'lock:request': {
            if (!(user === null || user === void 0 ? void 0 : user.id)) {
                return res.status(401).json({ error: 'User info missing' });
            }
            const result = (0, realtimeState_1.acquireEditLockByUserId)(data === null || data === void 0 ? void 0 : data.type, data === null || data === void 0 ? void 0 : data.id, user.id, user.name || user.username);
            res.json({ ok: result.success, success: result.success, lockedBy: result.lockedBy });
            return;
        }
        case 'lock:release':
            if (user === null || user === void 0 ? void 0 : user.id) {
                (0, realtimeState_1.releaseEditLockByUserId)(data === null || data === void 0 ? void 0 : data.type, data === null || data === void 0 ? void 0 : data.id, user.id);
            }
            break;
        default:
            // Forward any event through EventBus
            eventBus_1.eventBus.broadcast(event, Object.assign(Object.assign({}, data), { updatedBy: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) }));
            break;
    }
    res.json({ ok: true });
});
/**
 * GET /api/sse/status
 * Returns SSE connection stats for debugging.
 */
router.get('/status', (req, res) => {
    const clients = Array.from(sseClients.values()).map(c => ({
        id: c.id,
        userName: c.userName,
        connectedAt: new Date(c.connectedAt).toISOString(),
        lastEventId: c.lastEventId,
    }));
    res.json({
        connected: sseClients.size,
        globalEventId,
        eventHistorySize: eventHistory.length,
        clients,
    });
});
// ═══════════════════════════════════════════
// SSE SENDING HELPERS
// ═══════════════════════════════════════════
/**
 * Send a named SSE event to a single client.
 * Uses proper SSE format: id, event, data fields.
 */
function sendSSEEvent(client, event, data, eventId) {
    try {
        const id = eventId || globalEventId;
        let message = '';
        message += `id: ${id}\n`;
        message += `event: ${event}\n`;
        message += `data: ${JSON.stringify(data)}\n\n`;
        client.res.write(message);
        if (typeof client.res.flush === 'function') {
            client.res.flush();
        }
        client.lastEventId = id;
    }
    catch (err) {
        // Client disconnected
        sseClients.delete(client.id);
    }
}
/**
 * Broadcast a named SSE event to ALL connected clients.
 */
function broadcastSSE(event, data) {
    const eventId = addToHistory(event, data);
    for (const [clientId, client] of sseClients.entries()) {
        sendSSEEvent(client, event, data, eventId);
    }
}
// ═══════════════════════════════════════════
// EVENT BUS → SSE BRIDGE
// ═══════════════════════════════════════════
/**
 * Subscribe to ALL EventBus broadcasts and push to SSE clients
 * using proper named events. Handles private routing.
 */
eventBus_1.eventBus.on('broadcast', ({ event, data }) => {
    if (sseClients.size === 0)
        return;
    if (event === 'chat:private') {
        // Only route to intended receiver or sender
        for (const client of sseClients.values()) {
            if (String(client.userId) === String(data.targetUserId) || String(client.userId) === String(data.userId)) {
                sendSSEEvent(client, event, data);
            }
        }
    }
    else if (event === 'chat:typing') {
        const targetId = data.targetUserId || '';
        const isGroup = targetId.startsWith('custom-') || targetId.startsWith('branch-') || targetId === 'global' || targetId.includes('-group');
        if (isGroup) {
            Promise.resolve().then(() => __importStar(require('../db'))).then((_a) => __awaiter(void 0, [_a], void 0, function* ({ pool }) {
                try {
                    const [members] = yield pool.query('SELECT userId FROM chat_group_members WHERE groupId = ?', [targetId]);
                    const memberIds = new Set(members.map((m) => m.userId));
                    const eventId = addToHistory(event, data);
                    for (const client of sseClients.values()) {
                        if (memberIds.has(String(client.userId)) && String(client.userId) !== String(data.userId)) {
                            sendSSEEvent(client, event, data, eventId);
                        }
                    }
                }
                catch (err) {
                    console.error('❌ Error broadcasting SSE group typing indicator:', err.message);
                }
            })).catch(() => { });
        }
        else {
            for (const client of sseClients.values()) {
                if (String(client.userId) === String(data.targetUserId)) {
                    sendSSEEvent(client, event, data);
                }
            }
        }
    }
    else if (event === 'chat:group') {
        // Resolve group members asynchronously, then push to matching SSE clients
        Promise.resolve().then(() => __importStar(require('../db'))).then(({ pool }) => {
            pool.query('SELECT userId FROM chat_group_members WHERE groupId = ?', [data.groupId])
                .then(([members]) => {
                const memberIds = new Set(members.map((m) => m.userId));
                const eventId = addToHistory(event, data);
                for (const client of sseClients.values()) {
                    if (memberIds.has(String(client.userId))) {
                        sendSSEEvent(client, event, data, eventId);
                    }
                }
            })
                .catch((err) => console.error('❌ SSE group broadcast error:', err.message));
        }).catch(() => { });
    }
    else if (event === 'notification:receive') {
        if (data.targetUserId) {
            for (const client of sseClients.values()) {
                if (String(client.userId) === String(data.targetUserId)) {
                    sendSSEEvent(client, event, data);
                }
            }
        }
        else {
            for (const client of sseClients.values()) {
                if (String(client.userId) !== String(data.senderId)) {
                    sendSSEEvent(client, event, data);
                }
            }
        }
    }
    else if (event === 'pos:cart:remote-update-received') {
        for (const client of sseClients.values()) {
            if (String(client.userId) === String(data.cashierId)) {
                sendSSEEvent(client, event, data);
            }
        }
    }
    else if (event === 'chat:react' || event === 'chat:edit' || event === 'chat:pin' || event === 'chat:read') {
        const type = data.type || data.chatMode;
        const targetUserId = data.targetUserId;
        const messageSenderId = data.messageSenderId || data.userId;
        const groupId = data.groupId || data.targetId;
        if (type === 'private') {
            for (const client of sseClients.values()) {
                if (String(client.userId) === String(targetUserId) || String(client.userId) === String(messageSenderId)) {
                    sendSSEEvent(client, event, data);
                }
            }
        }
        else if (type === 'group') {
            Promise.resolve().then(() => __importStar(require('../db'))).then(({ pool }) => {
                pool.query('SELECT userId FROM chat_group_members WHERE groupId = ?', [groupId])
                    .then(([members]) => {
                    const memberIds = new Set(members.map((m) => m.userId));
                    const eventId = addToHistory(event, data);
                    for (const client of sseClients.values()) {
                        if (memberIds.has(String(client.userId))) {
                            sendSSEEvent(client, event, data, eventId);
                        }
                    }
                })
                    .catch((err) => console.error(`❌ SSE group ${event} broadcast error:`, err.message));
            }).catch(() => { });
        }
        else {
            broadcastSSE(event, data);
        }
    }
    else {
        broadcastSSE(event, data);
    }
});
// ═══════════════════════════════════════════
// HEARTBEAT & CLEANUP
// ═══════════════════════════════════════════
/**
 * Aggressive heartbeat (15s) to keep connections alive through
 * Hostinger/Nginx proxy timeouts (typically 60s).
 */
setInterval(() => {
    if (sseClients.size === 0)
        return;
    const heartbeat = `: heartbeat ${Date.now()}\n\n`; // SSE comment
    for (const [clientId, client] of sseClients.entries()) {
        try {
            client.res.write(heartbeat);
        }
        catch (err) {
            sseClients.delete(clientId);
        }
    }
}, HEARTBEAT_INTERVAL);
/**
 * Clean up stale clients (connected but not responding).
 */
setInterval(() => {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    for (const [clientId, client] of sseClients.entries()) {
        try {
            // Check if the response is still writable
            if (client.res.writableEnded || client.res.destroyed) {
                sseClients.delete(clientId);
                console.log(`📡 Cleaned up stale SSE client: ${client.userName} (${clientId})`);
            }
        }
        catch (_a) {
            sseClients.delete(clientId);
        }
    }
}, CLEANUP_INTERVAL);
// ═══════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════
function getSSEClientCount() {
    return sseClients.size;
}
function getSSEClients() {
    return Array.from(sseClients.values()).map(c => ({
        id: c.id,
        userName: c.userName,
        userId: c.userId,
    }));
}
exports.default = router;
