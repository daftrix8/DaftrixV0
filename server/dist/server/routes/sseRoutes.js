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
    console.log(`📡 SSE client connected: ${client.userName} (${clientId}) — Total: ${sseClients.size}`);
    // Send connection confirmation with named event
    sendSSEEvent(client, 'connected', {
        clientId,
        userId: user.id,
        userName: client.userName,
        serverTime: new Date().toISOString(),
        transport: 'sse',
    });
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
    // Clean up on disconnect
    req.on('close', () => {
        sseClients.delete(clientId);
        console.log(`📡 SSE client disconnected: ${client.userName} (${clientId}) — Total: ${sseClients.size}`);
    });
    req.on('error', () => {
        sseClients.delete(clientId);
    });
});
/**
 * POST /api/sse/action
 * Client→server actions when using SSE transport.
 * Auth via Bearer token in Authorization header.
 */
router.post('/action', (req, res) => {
    const { event, data } = req.body;
    const user = req.user;
    if (!event) {
        return res.status(400).json({ error: 'Event name required' });
    }
    // Handle all action types
    switch (event) {
        case 'user:viewing':
            eventBus_1.eventBus.broadcast('users:viewing', {
                userId: user === null || user === void 0 ? void 0 : user.id,
                userName: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username),
                view: data === null || data === void 0 ? void 0 : data.view,
            });
            break;
        case 'chat:send': {
            const chatMsg = Object.assign(Object.assign({}, data), { userId: user === null || user === void 0 ? void 0 : user.id, userName: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username), timestamp: new Date().toISOString() });
            eventBus_1.eventBus.broadcast('chat:message', chatMsg);
            // Persist to database (fire-and-forget)
            Promise.resolve().then(() => __importStar(require('../db'))).then(({ pool }) => {
                pool.query('INSERT INTO chat_messages (id, userId, userName, message, type, timestamp) VALUES (?, ?, ?, ?, ?, NOW())', [chatMsg.id, chatMsg.userId, chatMsg.userName, chatMsg.message, 'message']).catch((err) => console.error('❌ SSE chat save error:', err.message));
            }).catch(() => { });
            break;
        }
        case 'chat:private': {
            const privateMsg = Object.assign(Object.assign({}, data), { userId: user === null || user === void 0 ? void 0 : user.id, userName: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username), timestamp: new Date().toISOString() });
            eventBus_1.eventBus.broadcast('chat:private', privateMsg);
            // Persist to database (fire-and-forget)
            Promise.resolve().then(() => __importStar(require('../db'))).then(({ pool }) => {
                pool.query('INSERT INTO chat_messages (id, userId, userName, message, type, targetUserId, timestamp) VALUES (?, ?, ?, ?, ?, ?, NOW())', [privateMsg.id || `pm-${Date.now()}`, privateMsg.userId, privateMsg.userName, privateMsg.message, 'private', privateMsg.targetUserId]).catch((err) => console.error('❌ SSE private chat save error:', err.message));
            }).catch(() => { });
            break;
        }
        case 'chat:typing':
            eventBus_1.eventBus.broadcast('chat:typing', Object.assign(Object.assign({}, data), { userId: user === null || user === void 0 ? void 0 : user.id, userName: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) }));
            break;
        case 'lock:request':
            // Handle edit locks
            eventBus_1.eventBus.broadcast('lock:acquired', {
                type: data === null || data === void 0 ? void 0 : data.type,
                id: data === null || data === void 0 ? void 0 : data.id,
                lockedBy: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username),
                userId: user === null || user === void 0 ? void 0 : user.id,
            });
            res.json({ ok: true, success: true });
            return;
        case 'lock:release':
            eventBus_1.eventBus.broadcast('lock:released', {
                type: data === null || data === void 0 ? void 0 : data.type,
                id: data === null || data === void 0 ? void 0 : data.id,
                userId: user === null || user === void 0 ? void 0 : user.id,
            });
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
 * using proper named events (not just generic 'message').
 */
eventBus_1.eventBus.on('broadcast', ({ event, data }) => {
    if (sseClients.size === 0)
        return; // Skip if no SSE clients
    broadcastSSE(event, data);
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
