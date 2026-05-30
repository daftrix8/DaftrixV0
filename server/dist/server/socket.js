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
exports.initializeWebSocket = initializeWebSocket;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const eventBus_1 = require("./utils/eventBus");
dotenv_1.default.config();
// Track active users and what they're viewing/editing
const activeUsers = new Map();
const editLocks = new Map();
function initializeWebSocket(httpServer) {
    // Parse allowed origins from env
    const wsOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001')
        .split(',')
        .map(o => o.trim())
        .filter(Boolean);
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: (origin, callback) => {
                // Allow no-origin and 'null' origin (Capacitor mobile, file:// protocol)
                if (!origin || origin === 'null')
                    return callback(null, true);
                if (wsOrigins.includes(origin) || wsOrigins.includes('*'))
                    return callback(null, true);
                if (origin.endsWith('.ngrok-free.app') || origin.endsWith('.ngrok.io') || origin.endsWith('.ts.net'))
                    return callback(null, true);
                // Allow localhost, LAN hostnames, and private/Tailscale IPs
                try {
                    const url = new URL(origin);
                    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
                        return callback(null, true);
                    if (!url.hostname.includes('.'))
                        return callback(null, true);
                    if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(url.hostname))
                        return callback(null, true);
                }
                catch (_a) { }
                callback(new Error(`WebSocket CORS: Origin ${origin} not allowed`));
            },
            methods: ['GET', 'POST'],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });
    let broadcastTimeout = null;
    const throttledBroadcastOnlineUsers = () => {
        if (broadcastTimeout)
            return;
        broadcastTimeout = setTimeout(() => {
            io.emit('users:online', Array.from(activeUsers.values()));
            broadcastTimeout = null;
        }, 1500); // 1.5 seconds throttle prevents network spam during navigation storms
    };
    // Authentication middleware
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
        console.error('❌ FATAL: JWT_SECRET not set — WebSocket auth will reject all connections.');
    }
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error'));
        }
        if (!JWT_SECRET) {
            return next(new Error('Server misconfiguration'));
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            socket.user = decoded;
            next();
        }
        catch (err) {
            next(new Error('Authentication error'));
        }
    });
    io.on('connection', (socket) => {
        if (!socket.user) {
            console.error('❌ Socket connected without user data. Disconnecting.');
            socket.disconnect();
            return;
        }
        const user = socket.user;
        console.log(`✅ User connected: ${user.name} (${socket.id})`);
        // Track active user
        activeUsers.set(socket.id, {
            socketId: socket.id,
            userId: user.id,
            userName: user.name,
        });
        // Broadcast updated user list
        throttledBroadcastOnlineUsers();
        // ===== USER PRESENCE =====
        socket.on('user:viewing', (data) => {
            const userInfo = activeUsers.get(socket.id);
            if (userInfo) {
                userInfo.currentView = data.view;
                activeUsers.set(socket.id, userInfo);
                throttledBroadcastOnlineUsers();
            }
        });
        // ===== EDIT LOCKS =====
        socket.on('lock:request', (data, callback) => {
            const lockKey = `${data.type}:${data.id}`;
            const existingLock = editLocks.get(lockKey);
            if (existingLock && existingLock.userId !== user.id) {
                // Already locked by someone else
                callback({
                    success: false,
                    lockedBy: existingLock.userName
                });
            }
            else {
                // Grant lock
                editLocks.set(lockKey, {
                    userId: user.id,
                    userName: user.name,
                    timestamp: Date.now()
                });
                const userInfo = activeUsers.get(socket.id);
                if (userInfo) {
                    userInfo.editingResource = { type: data.type, id: data.id };
                    activeUsers.set(socket.id, userInfo);
                }
                // Notify others
                socket.broadcast.emit('lock:acquired', {
                    type: data.type,
                    id: data.id,
                    userId: user.id,
                    userName: user.name
                });
                callback({ success: true });
            }
        });
        socket.on('lock:release', (data) => {
            const lockKey = `${data.type}:${data.id}`;
            editLocks.delete(lockKey);
            const userInfo = activeUsers.get(socket.id);
            if (userInfo) {
                userInfo.editingResource = undefined;
                activeUsers.set(socket.id, userInfo);
            }
            socket.broadcast.emit('lock:released', {
                type: data.type,
                id: data.id
            });
        });
        // ===== REAL-TIME DATA UPDATES =====
        socket.on('invoice:created', (invoice) => {
            // Broadcast to other clients only (not the sender)
            socket.broadcast.emit('invoice:new', {
                invoice,
                createdBy: user.name
            });
        });
        socket.on('invoice:updated', (invoice) => {
            // Broadcast to other clients only (not the sender)
            socket.broadcast.emit('invoice:changed', {
                invoice,
                updatedBy: user.name
            });
        });
        socket.on('invoice:deleted', (invoiceId) => {
            // Broadcast to other clients only (not the sender)
            socket.broadcast.emit('invoice:removed', {
                id: invoiceId,
                deletedBy: user.name
            });
        });
        socket.on('product:updated', (product) => {
            socket.broadcast.emit('product:changed', {
                product,
                updatedBy: user.name
            });
        });
        socket.on('stock:changed', (data) => {
            socket.broadcast.emit('stock:updated', {
                productId: data.productId,
                newStock: data.newStock,
                changedBy: user.name
            });
        });
        socket.on('partner:updated', (partner) => {
            socket.broadcast.emit('partner:changed', {
                partner,
                updatedBy: user.name
            });
        });
        // ===== GENERIC ENTITY UPDATES =====
        socket.on('entity:changed', (data) => {
            socket.broadcast.emit('entity:changed', {
                entityType: data.entityType,
                entity: data.entity,
                updatedBy: user.name
            });
        });
        socket.on('entity:deleted', (data) => {
            socket.broadcast.emit('entity:deleted', {
                entityType: data.entityType,
                entityId: data.entityId,
                deletedBy: user.name
            });
        });
        // ===== REAL-TIME CHAT =====
        socket.on('chat:send', (message) => __awaiter(this, void 0, void 0, function* () {
            // Server-side XSS sanitization (M5 security fix)
            const sanitize = (str) => String(str || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c));
            const chatMessage = Object.assign(Object.assign({}, message), { message: sanitize(message.message || ''), userId: user.id, userName: user.name, timestamp: new Date().toISOString() });
            // Broadcast immediately for real-time feel
            io.emit('chat:message', chatMessage);
            // Persist to database (fire-and-forget)
            try {
                const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
                yield pool.query('INSERT INTO chat_messages (id, userId, userName, message, type, timestamp) VALUES (?, ?, ?, ?, ?, NOW())', [chatMessage.id, chatMessage.userId, chatMessage.userName, chatMessage.message, 'message']);
            }
            catch (err) {
                console.error('❌ Chat save error:', err.message);
            }
        }));
        // ===== PRIVATE CHAT =====
        socket.on('chat:private', (data) => __awaiter(this, void 0, void 0, function* () {
            // Find the target user's socket
            const targetUser = Array.from(activeUsers.values())
                .find(u => u.userId === data.targetUserId);
            const privateMessage = {
                id: data.id,
                userId: user.id,
                userName: user.name,
                message: data.message,
                timestamp: new Date().toISOString(),
                type: 'private',
                targetUserId: data.targetUserId
            };
            // Send to target user
            if (targetUser) {
                io.to(targetUser.socketId).emit('chat:private', privateMessage);
            }
            // Also send back to sender for confirmation
            socket.emit('chat:private', privateMessage);
            // Persist to database (fire-and-forget)
            try {
                const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
                yield pool.query('INSERT INTO chat_messages (id, userId, userName, message, type, targetUserId, timestamp) VALUES (?, ?, ?, ?, ?, ?, NOW())', [privateMessage.id, privateMessage.userId, privateMessage.userName, privateMessage.message, 'private', privateMessage.targetUserId]);
            }
            catch (err) {
                console.error('❌ Private chat save error:', err.message);
            }
        }));
        // Typing indicator for private chat
        socket.on('chat:typing', (data) => {
            const targetUser = Array.from(activeUsers.values())
                .find(u => u.userId === data.targetUserId);
            if (targetUser) {
                io.to(targetUser.socketId).emit('chat:typing', {
                    userId: user.id,
                    userName: user.name,
                    isTyping: data.isTyping
                });
            }
        });
        // When a user joins, notify others
        io.emit('chat:system', {
            message: `${user.name} انضم للمحادثة`,
            type: 'join'
        });
        // ===== NOTIFICATIONS =====
        socket.on('notification:send', (data) => {
            const notification = {
                message: data.message,
                type: data.type,
                from: user.name,
                timestamp: new Date().toISOString()
            };
            if (data.targetUserId) {
                // Send to specific user
                const targetUser = Array.from(activeUsers.values())
                    .find(u => u.userId === data.targetUserId);
                if (targetUser) {
                    io.to(targetUser.socketId).emit('notification:receive', notification);
                }
            }
            else {
                // Broadcast to all
                socket.broadcast.emit('notification:receive', notification);
            }
        });
        // ===== DISCONNECT =====
        socket.on('disconnect', () => {
            console.log(`❌ User disconnected: ${user.name}`);
            // Release all locks held by this user
            for (const [lockKey, lock] of editLocks.entries()) {
                if (lock.userId === user.id) {
                    editLocks.delete(lockKey);
                    const [type, id] = lockKey.split(':');
                    socket.broadcast.emit('lock:released', { type, id });
                }
            }
            // Remove from active users
            activeUsers.delete(socket.id);
            // Notify others about user leaving chat
            io.emit('chat:system', {
                message: `${user.name} غادر المحادثة`,
                type: 'leave'
            });
            // Notify others
            throttledBroadcastOnlineUsers();
        });
    });
    // Cleanup old locks every 5 minutes
    setInterval(() => {
        const now = Date.now();
        const timeout = 30 * 60 * 1000; // 30 minutes
        for (const [lockKey, lock] of editLocks.entries()) {
            if (now - lock.timestamp > timeout) {
                editLocks.delete(lockKey);
                console.log(`⚠️ Auto-released stale lock: ${lockKey}`);
            }
        }
    }, 5 * 60 * 1000);
    // ===== EVENTBUS → SOCKET.IO BRIDGE =====
    // Forward EventBus broadcasts to all Socket.IO clients
    eventBus_1.eventBus.on('broadcast', ({ event, data }) => {
        io.emit(event, data);
    });
    return io;
}
