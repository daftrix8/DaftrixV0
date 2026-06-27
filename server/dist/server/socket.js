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
const chatHelpers_1 = require("./utils/chatHelpers");
dotenv_1.default.config();
function handleMentionNotifications(msg) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!msg.message || typeof msg.message !== 'string')
            return;
        const senderId = msg.userId;
        const senderName = msg.userName || 'زميل';
        try {
            const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
            // Handle @all or @الجميع
            if (msg.message.includes('@all') || msg.message.includes('@الجميع')) {
                eventBus_1.eventBus.broadcast('notification:receive', {
                    message: `ذكرك ${senderName} في المحادثة`,
                    type: 'info',
                    from: senderName,
                    timestamp: new Date().toISOString(),
                    senderId
                });
                return;
            }
            // Fetch all users to check individual mentions
            const [users] = yield pool.query('SELECT id, name FROM users');
            for (const user of users) {
                const mentionTag = `@${user.name}`;
                if (msg.message.includes(mentionTag) && user.id !== senderId) {
                    eventBus_1.eventBus.broadcast('notification:receive', {
                        message: `ذكرك ${senderName} في المحادثة`,
                        type: 'info',
                        from: senderName,
                        targetUserId: user.id,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        }
        catch (err) {
            console.error('❌ Error handling mention notification:', err.message);
        }
    });
}
const realtimeState_1 = require("./utils/realtimeState");
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
    // Authentication middleware
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
        console.error('❌ FATAL: JWT_SECRET not set — WebSocket auth will reject all connections.');
    }
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        const isStorefront = socket.handshake.auth.isStorefront === true || socket.handshake.auth.isStorefront === 'true';
        if (isStorefront) {
            return next();
        }
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
        const isStorefront = socket.handshake.auth.isStorefront === true || socket.handshake.auth.isStorefront === 'true';
        if (!socket.user && !isStorefront) {
            console.error('❌ Socket connected without user data. Disconnecting.');
            socket.disconnect();
            return;
        }
        const user = socket.user;
        if (user) {
            console.log(`✅ User connected: ${user.name} (${socket.id})`);
            (0, realtimeState_1.addActiveUser)(socket.id, user.id, user.name, user.role, 'websocket');
            socket.emit('pos:carts:list', (0, realtimeState_1.getAllPOSCarts)());
        }
        else {
            console.log(`✅ Storefront client connected (${socket.id})`);
        }
        // ===== USER PRESENCE (Staff only) =====
        socket.on('user:viewing', (data) => {
            if (!user)
                return;
            (0, realtimeState_1.updateActiveUserView)(socket.id, data.view);
        });
        // ===== EDIT LOCKS (Staff only) =====
        socket.on('lock:request', (data, callback) => {
            if (!user)
                return callback({ success: false, error: 'Unauthorized' });
            const result = (0, realtimeState_1.acquireEditLock)(data.type, data.id, socket.id);
            callback(result);
        });
        socket.on('lock:release', (data) => {
            if (!user)
                return;
            (0, realtimeState_1.releaseEditLock)(data.type, data.id, socket.id);
        });
        // ===== REAL-TIME DATA UPDATES (Staff only) =====
        socket.on('invoice:created', (invoice) => {
            if (!user)
                return;
            eventBus_1.eventBus.broadcast('invoice:new', {
                invoice,
                createdBy: user.name || 'System'
            });
        });
        socket.on('invoice:updated', (invoice) => {
            if (!user)
                return;
            eventBus_1.eventBus.broadcast('invoice:changed', {
                invoice,
                updatedBy: user.name || 'System'
            });
        });
        socket.on('invoice:deleted', (invoiceId) => {
            if (!user)
                return;
            eventBus_1.eventBus.broadcast('invoice:removed', {
                id: invoiceId,
                deletedBy: user.name || 'System'
            });
        });
        socket.on('product:updated', (product) => {
            if (!user)
                return;
            eventBus_1.eventBus.broadcast('product:changed', {
                product,
                updatedBy: user.name || 'System'
            });
        });
        socket.on('stock:changed', (data) => {
            if (!user)
                return;
            eventBus_1.eventBus.broadcast('stock:updated', {
                productId: data.productId,
                newStock: data.newStock,
                changedBy: user.name || 'System'
            });
        });
        socket.on('partner:updated', (partner) => {
            if (!user)
                return;
            eventBus_1.eventBus.broadcast('partner:changed', {
                partner,
                updatedBy: user.name || 'System'
            });
        });
        socket.on('pos:cart:sync', (data) => {
            if (!user)
                return;
            (0, realtimeState_1.savePOSCartState)(user.id, data);
            eventBus_1.eventBus.broadcast('pos:carts:list', (0, realtimeState_1.getAllPOSCarts)());
        });
        socket.on('pos:cart:remote-update', (data) => {
            if (!user)
                return;
            (0, realtimeState_1.savePOSCartState)(data.cashierId, Object.assign(Object.assign({}, data.cartState), { cashierId: data.cashierId, updatedByAdmin: user.name }));
            eventBus_1.eventBus.broadcast('pos:carts:list', (0, realtimeState_1.getAllPOSCarts)());
            eventBus_1.eventBus.broadcast('pos:cart:remote-update-received', {
                cashierId: data.cashierId,
                cartState: data.cartState,
                adminName: user.name
            });
        });
        // ===== GENERIC ENTITY UPDATES (Staff only) =====
        socket.on('entity:changed', (data) => {
            if (!user)
                return;
            eventBus_1.eventBus.broadcast('entity:changed', {
                entityType: data.entityType,
                entity: data.entity,
                updatedBy: user.name || 'System'
            });
        });
        socket.on('entity:deleted', (data) => {
            if (!user)
                return;
            eventBus_1.eventBus.broadcast('entity:deleted', {
                entityType: data.entityType,
                entityId: data.entityId,
                deletedBy: user.name || 'System'
            });
        });
        // ===== REAL-TIME CHAT =====
        socket.on('chat:send', (message) => __awaiter(this, void 0, void 0, function* () {
            if (!user)
                return;
            const sanitize = (str) => String(str || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c));
            const chatMessage = Object.assign(Object.assign({}, message), { message: sanitize(message.message || ''), userId: user.id, userName: user.name, timestamp: new Date().toISOString() });
            eventBus_1.eventBus.broadcast('chat:message', chatMessage);
            handleMentionNotifications(chatMessage);
            try {
                const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
                yield pool.query('INSERT INTO chat_messages (id, userId, userName, message, type, replyTo, attachment, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())', [
                    chatMessage.id,
                    chatMessage.userId,
                    chatMessage.userName,
                    chatMessage.message,
                    'message',
                    chatMessage.replyTo ? JSON.stringify(chatMessage.replyTo) : null,
                    chatMessage.attachment ? JSON.stringify(chatMessage.attachment) : null
                ]);
            }
            catch (err) {
                console.error('❌ Chat save error:', err.message);
            }
        }));
        // ===== PRIVATE CHAT =====
        socket.on('chat:private', (data) => __awaiter(this, void 0, void 0, function* () {
            if (!user)
                return;
            const privateMessage = {
                id: data.id,
                userId: user.id,
                userName: user.name,
                message: data.message,
                timestamp: new Date().toISOString(),
                type: 'private',
                targetUserId: data.targetUserId,
                replyTo: data.replyTo,
                attachment: data.attachment
            };
            eventBus_1.eventBus.broadcast('chat:private', privateMessage);
            try {
                const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
                yield pool.query('INSERT INTO chat_messages (id, userId, userName, message, type, targetUserId, replyTo, attachment, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())', [
                    privateMessage.id,
                    privateMessage.userId,
                    privateMessage.userName,
                    privateMessage.message,
                    'private',
                    privateMessage.targetUserId,
                    privateMessage.replyTo ? JSON.stringify(privateMessage.replyTo) : null,
                    privateMessage.attachment ? JSON.stringify(privateMessage.attachment) : null
                ]);
            }
            catch (err) {
                console.error('❌ Private chat save error:', err.message);
            }
        }));
        // ===== GROUP CHAT =====
        socket.on('chat:group', (data) => __awaiter(this, void 0, void 0, function* () {
            if (!user)
                return;
            const groupMessage = {
                id: data.id,
                userId: user.id,
                userName: user.name,
                message: data.message,
                timestamp: new Date().toISOString(),
                type: 'group',
                groupId: data.groupId,
                replyTo: data.replyTo,
                attachment: data.attachment
            };
            eventBus_1.eventBus.broadcast('chat:group', groupMessage);
            handleMentionNotifications(groupMessage);
            try {
                const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
                yield pool.query('INSERT INTO chat_messages (id, userId, userName, message, type, groupId, replyTo, attachment, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())', [
                    groupMessage.id,
                    groupMessage.userId,
                    groupMessage.userName,
                    groupMessage.message,
                    'group',
                    groupMessage.groupId,
                    groupMessage.replyTo ? JSON.stringify(groupMessage.replyTo) : null,
                    groupMessage.attachment ? JSON.stringify(groupMessage.attachment) : null
                ]);
            }
            catch (err) {
                console.error('❌ Group chat save error:', err.message);
            }
        }));
        socket.on('chat:typing', (data) => {
            if (!user)
                return;
            eventBus_1.eventBus.broadcast('chat:typing', {
                userId: user.id,
                userName: user.name,
                targetUserId: data.targetUserId,
                isTyping: data.isTyping
            });
        });
        socket.on('chat:react', (data) => __awaiter(this, void 0, void 0, function* () {
            if (!user)
                return;
            try {
                const result = yield (0, chatHelpers_1.handleReaction)(user.id, data.messageId, data.emoji, data.action);
                eventBus_1.eventBus.broadcast('chat:react', {
                    messageId: data.messageId,
                    emoji: data.emoji,
                    userId: user.id,
                    userName: user.name,
                    action: data.action,
                    reactions: result.reactions,
                    type: result.type,
                    messageSenderId: result.messageSenderId,
                    targetUserId: result.targetUserId,
                    groupId: result.groupId
                });
            }
            catch (err) {
                console.error('❌ Chat react socket error:', err.message);
            }
        }));
        // When a user joins, notify others
        if (user) {
            eventBus_1.eventBus.broadcast('chat:system', {
                message: `${user.name} انضم للمحادثة`,
                type: 'join'
            });
        }
        // ===== NOTIFICATIONS =====
        socket.on('notification:send', (data) => {
            if (!user)
                return;
            const notification = {
                message: data.message,
                type: data.type,
                from: user.name,
                timestamp: new Date().toISOString()
            };
            if (data.targetUserId) {
                eventBus_1.eventBus.broadcast('chat:private', Object.assign(Object.assign({}, notification), { userId: user.id, userName: user.name, targetUserId: data.targetUserId, type: 'private' }));
            }
            else {
                eventBus_1.eventBus.broadcast('notification:receive', notification);
            }
        });
        socket.on('disconnect', () => {
            if (socket.user) {
                const user = socket.user;
                console.log(`❌ User disconnected: ${user.name}`);
                (0, realtimeState_1.removeActiveUser)(socket.id);
                (0, realtimeState_1.deletePOSCartState)(user.id);
                eventBus_1.eventBus.broadcast('pos:carts:list', (0, realtimeState_1.getAllPOSCarts)());
                // If the disconnected user was a manager/admin, we can unlock active carts locked by them
                if (user.role === 'admin' || user.role === 'manager') {
                    Promise.resolve().then(() => __importStar(require('./db'))).then((_a) => __awaiter(this, [_a], void 0, function* ({ safePoolQuery }) {
                        yield safePoolQuery(`UPDATE pos_active_carts 
                             SET isLocked = 0, lockedBy = NULL, lastAdminMessage = NULL 
                             WHERE isLocked = 1 AND lockedBy = ?`, [user.name]);
                        const { fetchAllActiveCartsFromDb } = yield Promise.resolve().then(() => __importStar(require('./controllers/posActiveCartsController')));
                        eventBus_1.eventBus.broadcast('pos:carts:list', yield fetchAllActiveCartsFromDb());
                        eventBus_1.eventBus.broadcast('pos:cart:lock-released-all-for-admin', { adminName: user.name });
                    })).catch(err => console.error('Error auto-unlocking carts on disconnect:', err));
                }
                eventBus_1.eventBus.broadcast('chat:system', {
                    message: `${user.name} غادر المحادثة`,
                    type: 'leave'
                });
            }
            else {
                console.log(`❌ Storefront client disconnected (${socket.id})`);
            }
        });
    });
    // Cleanup old locks every 5 minutes
    setInterval(() => {
        (0, realtimeState_1.cleanupStaleLocks)();
    }, 5 * 60 * 1000);
    // ===== EVENTBUS → SOCKET.IO BRIDGE =====
    eventBus_1.eventBus.on('broadcast', (_a) => __awaiter(this, [_a], void 0, function* ({ event, data }) {
        if (event === 'chat:private') {
            for (const socketId of io.sockets.sockets.keys()) {
                const clientSocket = io.sockets.sockets.get(socketId);
                if (clientSocket && clientSocket.user && (String(clientSocket.user.id) === String(data.targetUserId) || String(clientSocket.user.id) === String(data.userId))) {
                    clientSocket.emit(event, data);
                }
            }
        }
        else if (event === 'chat:typing') {
            const targetId = data.targetUserId || '';
            const isGroup = targetId.startsWith('custom-') || targetId.startsWith('branch-') || targetId === 'global' || targetId.includes('-group');
            if (isGroup) {
                Promise.resolve().then(() => __importStar(require('./db'))).then((_a) => __awaiter(this, [_a], void 0, function* ({ pool }) {
                    try {
                        const [members] = yield pool.query('SELECT userId FROM chat_group_members WHERE groupId = ?', [targetId]);
                        const memberIds = new Set(members.map((m) => m.userId));
                        for (const socketId of io.sockets.sockets.keys()) {
                            const clientSocket = io.sockets.sockets.get(socketId);
                            if (clientSocket && clientSocket.user && memberIds.has(String(clientSocket.user.id)) && String(clientSocket.user.id) !== String(data.userId)) {
                                clientSocket.emit(event, data);
                            }
                        }
                    }
                    catch (err) {
                        console.error('❌ Error broadcasting group typing indicator:', err.message);
                    }
                })).catch(() => { });
            }
            else {
                for (const socketId of io.sockets.sockets.keys()) {
                    const clientSocket = io.sockets.sockets.get(socketId);
                    if (clientSocket && clientSocket.user && String(clientSocket.user.id) === String(data.targetUserId)) {
                        clientSocket.emit(event, data);
                    }
                }
            }
        }
        else if (event === 'chat:group') {
            try {
                const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
                const [members] = yield pool.query('SELECT userId FROM chat_group_members WHERE groupId = ?', [data.groupId]);
                const memberIds = new Set(members.map((m) => m.userId));
                for (const socketId of io.sockets.sockets.keys()) {
                    const clientSocket = io.sockets.sockets.get(socketId);
                    if (clientSocket && clientSocket.user && memberIds.has(String(clientSocket.user.id))) {
                        clientSocket.emit(event, data);
                    }
                }
            }
            catch (err) {
                console.error('❌ Error broadcasting group message:', err.message);
            }
        }
        else if (event === 'notification:receive') {
            if (data.targetUserId) {
                for (const socketId of io.sockets.sockets.keys()) {
                    const clientSocket = io.sockets.sockets.get(socketId);
                    if (clientSocket && clientSocket.user && String(clientSocket.user.id) === String(data.targetUserId)) {
                        clientSocket.emit(event, data);
                    }
                }
            }
            else {
                for (const socketId of io.sockets.sockets.keys()) {
                    const clientSocket = io.sockets.sockets.get(socketId);
                    if (clientSocket && clientSocket.user && String(clientSocket.user.id) !== String(data.senderId)) {
                        clientSocket.emit(event, data);
                    }
                }
            }
        }
        else if (event === 'chat:react' || event === 'chat:edit' || event === 'chat:pin' || event === 'chat:read') {
            const type = data.type || data.chatMode;
            const targetUserId = data.targetUserId;
            const messageSenderId = data.messageSenderId || data.userId;
            const groupId = data.groupId || data.targetId;
            if (type === 'private') {
                for (const socketId of io.sockets.sockets.keys()) {
                    const clientSocket = io.sockets.sockets.get(socketId);
                    if (clientSocket && clientSocket.user &&
                        (String(clientSocket.user.id) === String(targetUserId) || String(clientSocket.user.id) === String(messageSenderId))) {
                        clientSocket.emit(event, data);
                    }
                }
            }
            else if (type === 'group') {
                try {
                    const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
                    const [members] = yield pool.query('SELECT userId FROM chat_group_members WHERE groupId = ?', [groupId]);
                    const memberIds = new Set(members.map((m) => m.userId));
                    for (const socketId of io.sockets.sockets.keys()) {
                        const clientSocket = io.sockets.sockets.get(socketId);
                        if (clientSocket && clientSocket.user && memberIds.has(String(clientSocket.user.id))) {
                            clientSocket.emit(event, data);
                        }
                    }
                }
                catch (err) {
                    console.error(`❌ Error broadcasting group ${event}:`, err.message);
                }
            }
            else {
                io.emit(event, data);
            }
        }
        else {
            io.emit(event, data);
        }
    }));
    return io;
}
