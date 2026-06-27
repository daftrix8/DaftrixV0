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
exports.formatEgyptianPhone = formatEgyptianPhone;
exports.getSettings = getSettings;
exports.isWhatsAppEnabled = isWhatsAppEnabled;
exports.getConnectionState = getConnectionState;
exports.createInstance = createInstance;
exports.getQRCode = getQRCode;
exports.setWebhook = setWebhook;
exports.logoutInstance = logoutInstance;
exports.sendTextMessage = sendTextMessage;
exports.sendDocument = sendDocument;
exports.getMessageLogs = getMessageLogs;
exports.updateMessageStatus = updateMessageStatus;
exports.logInboundMessage = logInboundMessage;
const db_1 = require("../db");
const uuid_1 = require("uuid");
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const pino_1 = __importDefault(require("pino"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// ── Phone Normalization ────────────────────────────────────
/**
 * Normalize any Egyptian phone to WhatsApp format: 20XXXXXXXXXX
 * Handles: 01012345678, +201012345678, 201012345678, 1012345678
 */
function formatEgyptianPhone(phone) {
    if (!phone)
        return '';
    // Strip spaces, dashes, plus signs, parentheses
    const cleaned = phone.replace(/[\s\-\+\(\)]/g, '');
    if (cleaned.startsWith('0'))
        return `20${cleaned.slice(1)}`;
    if (cleaned.startsWith('20'))
        return cleaned;
    // Bare number like 1012345678
    if (cleaned.length === 10 && cleaned.startsWith('1'))
        return `20${cleaned}`;
    return cleaned;
}
/** Read WhatsApp settings from DB. Returns null if not configured. */
function getSettings() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [rows] = yield db_1.pool.query('SELECT * FROM whatsapp_settings LIMIT 1');
            const settings = rows[0];
            if (!settings)
                return null;
            return {
                id: settings.id,
                isEnabled: !!settings.isEnabled,
                provider: settings.provider || 'EMBEDDED',
                apiUrl: settings.apiUrl || '',
                instanceName: settings.instanceName || '',
                apiKey: settings.apiKey || '',
                webhookToken: settings.webhookToken || '',
                sendOnInvoiceConfirm: settings.sendOnInvoiceConfirm !== 0,
                sendOnPaymentRecord: settings.sendOnPaymentRecord !== 0,
                sendPOSReceipt: !!settings.sendPOSReceipt,
            };
        }
        catch (err) {
            console.error('❌ [WhatsApp] getSettings error:', err);
            return null;
        }
    });
}
/** Quick check: is WhatsApp globally enabled? */
function isWhatsAppEnabled() {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = yield getSettings();
        return !!(settings === null || settings === void 0 ? void 0 : settings.isEnabled);
    });
}
// ── Custom MySQL Auth State for Baileys ─────────────────────
function useMySqlAuthState() {
    return __awaiter(this, void 0, void 0, function* () {
        const readKey = (keyId) => __awaiter(this, void 0, void 0, function* () {
            try {
                const [rows] = yield db_1.pool.query('SELECT keyValue FROM whatsapp_session_keys WHERE keyId = ?', [keyId]);
                if (rows && rows.length > 0) {
                    return JSON.parse(rows[0].keyValue, baileys_1.BufferJSON.reviver);
                }
            }
            catch (err) {
                console.error(`[WhatsApp] Error reading key ${keyId} from MySQL:`, err);
            }
            return null;
        });
        const writeKey = (keyId, value) => __awaiter(this, void 0, void 0, function* () {
            try {
                if (value === null || value === undefined) {
                    yield db_1.pool.query('DELETE FROM whatsapp_session_keys WHERE keyId = ?', [keyId]);
                }
                else {
                    const serialized = JSON.stringify(value, baileys_1.BufferJSON.replacer);
                    yield db_1.pool.query('INSERT INTO whatsapp_session_keys (keyId, keyValue) VALUES (?, ?) ON DUPLICATE KEY UPDATE keyValue = ?', [keyId, serialized, serialized]);
                }
            }
            catch (err) {
                console.error(`[WhatsApp] Error writing key ${keyId} to MySQL:`, err);
            }
        });
        let creds = yield readKey('creds');
        if (!creds) {
            creds = (0, baileys_1.initAuthCreds)();
            yield writeKey('creds', creds);
        }
        const saveCreds = () => __awaiter(this, void 0, void 0, function* () {
            yield writeKey('creds', creds);
        });
        const state = {
            creds,
            keys: {
                get: (type, ids) => __awaiter(this, void 0, void 0, function* () {
                    const data = {};
                    yield Promise.all(ids.map((id) => __awaiter(this, void 0, void 0, function* () {
                        const keyId = `${type}-${id}`;
                        const value = yield readKey(keyId);
                        if (value) {
                            data[id] = value;
                        }
                    })));
                    return data;
                }),
                set: (data) => __awaiter(this, void 0, void 0, function* () {
                    const tasks = [];
                    for (const type in data) {
                        for (const id in data[type]) {
                            const keyId = `${type}-${id}`;
                            const value = data[type][id];
                            tasks.push(writeKey(keyId, value));
                        }
                    }
                    yield Promise.all(tasks);
                })
            }
        };
        return {
            state,
            saveCreds,
            clearState: () => __awaiter(this, void 0, void 0, function* () {
                yield db_1.pool.query('DELETE FROM whatsapp_session_keys');
            })
        };
    });
}
// ── In-Process Connection Manager (Baileys) ────────────────
class EmbeddedConnectionManager {
    constructor() {
        this.sock = null;
        this.qrCode = null;
        this.connectionState = 'close';
        this.lastError = null;
        this.idleTimeout = null;
        this.authStateCleanup = null;
        this.isExplicitDisconnect = false;
    }
    getState() {
        return {
            state: this.connectionState,
            error: this.lastError || undefined
        };
    }
    getQRCodeString() {
        return this.qrCode;
    }
    resetIdleTimer() {
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
        }
        // Auto-close connection after 2 minutes of inactivity (saves Hostinger CPU/Memory limit blocks)
        this.idleTimeout = setTimeout(() => {
            console.log('💤 [WhatsApp] Inactivity timeout reached. Auto-closing connection...');
            this.disconnect();
        }, 120000);
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            this.resetIdleTimer();
            this.isExplicitDisconnect = false;
            if (this.sock && (this.connectionState === 'open' || this.connectionState === 'connecting')) {
                return this.sock;
            }
            let isAuthenticated = false;
            console.log('🔄 [WhatsApp] Initializing embedded Baileys socket...');
            this.connectionState = 'connecting';
            this.lastError = null;
            try {
                const { state, saveCreds, clearState } = yield useMySqlAuthState();
                this.authStateCleanup = clearState;
                // Check if we are already authenticated (i.e. creds has 'me')
                isAuthenticated = !!((_b = (_a = state.creds) === null || _a === void 0 ? void 0 : _a.me) === null || _b === void 0 ? void 0 : _b.id);
                console.log(`ℹ️ [WhatsApp] Connection attempt: isAuthenticated = ${isAuthenticated}`);
                const pinoLogger = (0, pino_1.default)({ level: 'silent' });
                const socket = (0, baileys_1.default)({
                    auth: state,
                    logger: pinoLogger,
                    printQRInTerminal: false,
                    syncFullHistory: false, // Disables downloading history, extremely lightweight
                    shouldSyncHistoryMessage: () => false,
                    markOnlineOnConnect: false,
                    defaultQueryTimeoutMs: 15000,
                    connectTimeoutMs: 20000,
                    keepAliveIntervalMs: 15000,
                    getMessage: () => __awaiter(this, void 0, void 0, function* () { return undefined; })
                });
                this.sock = socket;
                socket.ev.on('creds.update', saveCreds);
                socket.ev.on('connection.update', (update) => {
                    var _a, _b;
                    const { connection, lastDisconnect, qr } = update;
                    if (qr) {
                        this.qrCode = qr;
                        console.log('🔑 [WhatsApp] New QR code generated.');
                    }
                    if (connection === 'connecting') {
                        this.connectionState = 'connecting';
                    }
                    if (connection === 'open') {
                        this.connectionState = 'open';
                        this.qrCode = null; // Clear QR code once connected
                        console.log('✅ [WhatsApp] Embedded connection successfully opened.');
                    }
                    if (connection === 'close') {
                        this.connectionState = 'close';
                        const statusCode = (_b = (_a = lastDisconnect === null || lastDisconnect === void 0 ? void 0 : lastDisconnect.error) === null || _a === void 0 ? void 0 : _a.output) === null || _b === void 0 ? void 0 : _b.statusCode;
                        const shouldReconnect = statusCode !== baileys_1.DisconnectReason.loggedOut && !this.isExplicitDisconnect;
                        console.log(`🛑 [WhatsApp] Embedded connection closed. Reason: ${statusCode}. Reconnect: ${shouldReconnect}`);
                        if (statusCode === baileys_1.DisconnectReason.loggedOut) {
                            console.log('🧹 [WhatsApp] Client logged out. Cleaning session credentials...');
                            this.clearCredentials();
                        }
                        this.sock = null;
                        if (shouldReconnect) {
                            console.log('🔄 [WhatsApp] Unexpected socket disconnect. Attempting to reconnect...');
                            this.connect().catch(err => {
                                console.error('❌ [WhatsApp] Automatic reconnection attempt failed:', err.message || err);
                            });
                        }
                    }
                });
                // Wait for:
                // 1. Connection to become 'open' if authenticated.
                // 2. OR QR code to be generated if NOT authenticated.
                // 3. OR connection to close/error.
                let elapsed = 0;
                const timeoutMs = 15000;
                while (elapsed < timeoutMs) {
                    const currentState = this.connectionState;
                    if (isAuthenticated) {
                        if (currentState === 'open')
                            break;
                    }
                    else {
                        // If not authenticated, we succeed/stop waiting once we have the QR code
                        // OR if it somehow connected/opened (e.g. auto-reconnected from an active session)
                        if (this.qrCode || currentState === 'open')
                            break;
                    }
                    if (currentState === 'close') {
                        throw new Error(this.lastError || 'Connection closed immediately.');
                    }
                    yield new Promise(resolve => setTimeout(resolve, 200));
                    elapsed += 200;
                }
                if (isAuthenticated && this.connectionState === 'connecting') {
                    throw new Error('Connection timeout. WhatsApp is taking too long to connect.');
                }
                if (!isAuthenticated && !this.qrCode && this.connectionState !== 'open') {
                    throw new Error('Failed to generate QR code or connect in time.');
                }
                return socket;
            }
            catch (err) {
                this.connectionState = 'close';
                this.lastError = err.message || String(err);
                console.error('❌ [WhatsApp] Failed to connect embedded socket:', err);
                // Self-healing: if we had credentials but the connection closed immediately/failed,
                // it means our session credentials are stale/invalid. Clear them and retry once as unauthenticated.
                if (isAuthenticated && (((_c = err.message) === null || _c === void 0 ? void 0 : _c.includes('closed')) || ((_d = err.message) === null || _d === void 0 ? void 0 : _d.includes('timeout')) || ((_e = err.message) === null || _e === void 0 ? void 0 : _e.includes('loggedOut')) || ((_f = err.message) === null || _f === void 0 ? void 0 : _f.includes('Connection closed')))) {
                    console.log('🔄 [WhatsApp] Stale credentials detected. Auto-clearing and retrying connection...');
                    yield this.clearCredentials();
                    return this.connect();
                }
                throw err;
            }
        });
    }
    disconnect() {
        this.isExplicitDisconnect = true;
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
            this.idleTimeout = null;
        }
        if (this.sock) {
            try {
                this.sock.end(undefined);
            }
            catch (e) { }
            this.sock = null;
        }
        this.connectionState = 'close';
        console.log('🔌 [WhatsApp] Embedded socket disconnected.');
    }
    clearCredentials() {
        return __awaiter(this, void 0, void 0, function* () {
            this.isExplicitDisconnect = true;
            this.qrCode = null;
            this.connectionState = 'close';
            if (this.authStateCleanup) {
                yield this.authStateCleanup();
            }
            yield db_1.pool.query('DELETE FROM whatsapp_session_keys');
            console.log('🧹 [WhatsApp] All session keys deleted from database.');
        });
    }
    sendTextMessage(to, text) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const socket = yield this.connect();
            this.resetIdleTimer();
            const formattedJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
            const result = yield socket.sendMessage(formattedJid, { text });
            if (!((_a = result === null || result === void 0 ? void 0 : result.key) === null || _a === void 0 ? void 0 : _a.id)) {
                throw new Error('Failed to send text message. No message key ID returned.');
            }
            return result.key.id;
        });
    }
    sendDocument(to, fileUrlOrBuffer, filename, caption) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const socket = yield this.connect();
            this.resetIdleTimer();
            const formattedJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
            let docContent;
            if (typeof fileUrlOrBuffer === 'string') {
                docContent = { url: fileUrlOrBuffer };
            }
            else {
                docContent = fileUrlOrBuffer;
            }
            const result = yield socket.sendMessage(formattedJid, {
                document: docContent,
                fileName: filename,
                mimetype: 'application/pdf',
                caption: caption || ''
            });
            if (!((_a = result === null || result === void 0 ? void 0 : result.key) === null || _a === void 0 ? void 0 : _a.id)) {
                throw new Error('Failed to send document. No message key ID returned.');
            }
            return result.key.id;
        });
    }
}
// Instantiate Embedded Connection Manager
const embeddedManager = new EmbeddedConnectionManager();
// ── Evolution API Call Helper ─────────────────────────
function callEvolutionAPI(endpoint, method, body) {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = yield getSettings();
        if (!settings || !settings.apiUrl || !settings.apiKey) {
            return { success: false, error: 'إعدادات Evolution API غير مهيأة بعد' };
        }
        const baseUrl = settings.apiUrl.replace(/\/+$/, '');
        const path = endpoint.replace(/^\/+/, '');
        const url = `${baseUrl}/${path}`;
        const controller = new AbortController();
        // 18-second timeout to return a fast fallback before Express HTTP request 30s timeout
        const timeoutId = setTimeout(() => controller.abort(), 18000);
        try {
            const response = yield fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': settings.apiKey,
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const data = yield response.json().catch(() => ({}));
            if (!response.ok) {
                return { success: false, error: (data === null || data === void 0 ? void 0 : data.message) || (data === null || data === void 0 ? void 0 : data.error) || `HTTP ${response.status}` };
            }
            return { success: true, data };
        }
        catch (err) {
            clearTimeout(timeoutId);
            const isAbort = err.name === 'AbortError';
            const errorMsg = isAbort ? 'انتهت مهلة الطلب (Evolution API request timeout)' : ((err === null || err === void 0 ? void 0 : err.message) || 'خطأ في الاتصال بالشبكة');
            return { success: false, error: errorMsg };
        }
    });
}
// ── Instance Management ────────────────────────────────────
/** Check connection state of the WhatsApp instance */
function getConnectionState() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const settings = yield getSettings();
        if (!settings) {
            return { state: 'close', error: 'إعدادات واتساب غير مهيأة' };
        }
        if (settings.provider === 'EVOLUTION') {
            if (!settings.instanceName) {
                return { state: 'close', error: 'لم يتم تحديد اسم المثيل (Instance Name)' };
            }
            const result = yield callEvolutionAPI(`/instance/connectionState/${settings.instanceName}`, 'GET');
            if (!result.success) {
                return { state: 'error', error: result.error };
            }
            const state = ((_b = (_a = result.data) === null || _a === void 0 ? void 0 : _a.instance) === null || _b === void 0 ? void 0 : _b.state) || 'close';
            return { state };
        }
        else {
            // Embedded Mode
            return embeddedManager.getState();
        }
    });
}
/** Create a new WhatsApp instance on Evolution API */
function createInstance() {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = yield getSettings();
        if (!settings) {
            return { success: false, error: 'إعدادات واتساب غير مهيأة' };
        }
        if (settings.provider === 'EVOLUTION') {
            if (!settings.instanceName) {
                return { success: false, error: 'اسم المثيل مطلوب' };
            }
            const result = yield callEvolutionAPI('/instance/create', 'POST', {
                instanceName: settings.instanceName,
                qrcode: true
            });
            return { success: result.success, error: result.error };
        }
        else {
            // Embedded Mode does not require instance creation, it connects dynamically
            return { success: true };
        }
    });
}
/** Get QR Code for scanning */
function getQRCode() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const settings = yield getSettings();
        if (!settings) {
            return { success: false, error: 'إعدادات واتساب غير مهيأة' };
        }
        if (settings.provider === 'EVOLUTION') {
            if (!settings.instanceName) {
                return { success: false, error: 'اسم المثيل مطلوب' };
            }
            const result = yield callEvolutionAPI(`/instance/connect/${settings.instanceName}`, 'GET');
            if (!result.success) {
                if (((_a = result.error) === null || _a === void 0 ? void 0 : _a.includes('not found')) || ((_b = result.error) === null || _b === void 0 ? void 0 : _b.includes('404'))) {
                    const createRes = yield createInstance();
                    if (!createRes.success) {
                        return { success: false, error: `فشل إنشاء المثيل: ${createRes.error}` };
                    }
                    return getQRCode();
                }
                return { success: false, error: result.error };
            }
            return {
                success: true,
                code: (_c = result.data) === null || _c === void 0 ? void 0 : _c.code,
                base64: (_d = result.data) === null || _d === void 0 ? void 0 : _d.base64
            };
        }
        else {
            // Embedded Mode
            try {
                const stateObj = embeddedManager.getState();
                if (stateObj.state === 'close') {
                    embeddedManager.connect().catch(() => { });
                    // Wait 2-3 seconds for connection initialization and QR generation
                    yield new Promise(resolve => setTimeout(resolve, 3000));
                }
                const code = embeddedManager.getQRCodeString();
                if (!code) {
                    if (embeddedManager.getState().state === 'open') {
                        return { success: false, error: 'ALREADY_CONNECTED' };
                    }
                    return { success: false, error: 'جاري إنشاء رمز الاستجابة السريعة... يرجى إعادة المحاولة' };
                }
                const QRCodeLib = require('qrcode');
                const base64 = yield QRCodeLib.toDataURL(code);
                return {
                    success: true,
                    code,
                    base64
                };
            }
            catch (err) {
                return { success: false, error: err.message || String(err) };
            }
        }
    });
}
/** Configure webhook on Evolution API */
function setWebhook(webhookUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = yield getSettings();
        if (!settings) {
            return { success: false, error: 'إعدادات واتساب غير مهيأة' };
        }
        if (settings.provider === 'EVOLUTION') {
            if (!settings.instanceName) {
                return { success: false, error: 'اسم المثيل مطلوب' };
            }
            const result = yield callEvolutionAPI(`/webhook/set/${settings.instanceName}`, 'POST', {
                enabled: true,
                url: webhookUrl,
                webhookBy: "default",
                events: [
                    "MESSAGES_UPSERT",
                    "MESSAGES_UPDATE",
                    "CONNECTION_UPDATE"
                ]
            });
            return { success: result.success, error: result.error };
        }
        else {
            // Embedded Mode handles webhooks in-process and doesn't require remote webhook config
            return { success: true };
        }
    });
}
/** Logs out/deletes instance */
function logoutInstance() {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = yield getSettings();
        if (!settings)
            return { success: false, error: 'إعدادات واتساب غير مهيأة' };
        if (settings.provider === 'EVOLUTION') {
            const result = yield callEvolutionAPI(`/instance/logout/${settings.instanceName}`, 'DELETE');
            return { success: result.success, error: result.error };
        }
        else {
            // Embedded Mode
            yield embeddedManager.clearCredentials();
            embeddedManager.disconnect();
            return { success: true };
        }
    });
}
// ── Public Send Functions ──────────────────────────────────
function sendTextMessage(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const settings = yield getSettings();
        if (!settings) {
            return { success: false, error: 'إعدادات واتساب غير مكتملة' };
        }
        const cleanPhone = payload.to.replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '');
        const logId = (0, uuid_1.v4)();
        if (settings.provider === 'EVOLUTION') {
            const body = {
                number: cleanPhone,
                options: {
                    delay: 0,
                    presence: 'composing'
                },
                textMessage: {
                    text: payload.text
                }
            };
            const result = yield callEvolutionAPI(`/message/sendText/${settings.instanceName}`, 'POST', body);
            if (!result.success) {
                yield logMessage({
                    id: logId,
                    direction: 'outbound',
                    toPhone: payload.to,
                    messageType: 'text',
                    status: 'failed',
                    errorMessage: result.error,
                    referenceType: payload.referenceType,
                    referenceId: payload.referenceId,
                    payload: body,
                });
                return { success: false, error: result.error };
            }
            const wamid = ((_b = (_a = result.data) === null || _a === void 0 ? void 0 : _a.key) === null || _b === void 0 ? void 0 : _b.id) || '';
            yield logMessage({
                id: logId,
                direction: 'outbound',
                toPhone: payload.to,
                messageType: 'text',
                status: 'sent',
                wamid,
                referenceType: payload.referenceType,
                referenceId: payload.referenceId,
                payload: body,
            });
            return { success: true, wamid };
        }
        else {
            // Embedded Mode
            try {
                const wamid = yield embeddedManager.sendTextMessage(cleanPhone, payload.text);
                yield logMessage({
                    id: logId,
                    direction: 'outbound',
                    toPhone: payload.to,
                    messageType: 'text',
                    status: 'sent',
                    wamid,
                    referenceType: payload.referenceType,
                    referenceId: payload.referenceId,
                    payload: { to: payload.to, text: payload.text },
                });
                return { success: true, wamid };
            }
            catch (err) {
                yield logMessage({
                    id: logId,
                    direction: 'outbound',
                    toPhone: payload.to,
                    messageType: 'text',
                    status: 'failed',
                    errorMessage: err.message || String(err),
                    referenceType: payload.referenceType,
                    referenceId: payload.referenceId,
                    payload: { to: payload.to, text: payload.text },
                });
                return { success: false, error: err.message || String(err) };
            }
        }
    });
}
function sendDocument(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const settings = yield getSettings();
        if (!settings) {
            return { success: false, error: 'إعدادات واتساب غير مكتملة' };
        }
        const cleanPhone = payload.to.replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '');
        const logId = (0, uuid_1.v4)();
        if (settings.provider === 'EVOLUTION') {
            const body = {
                number: cleanPhone,
                options: {
                    delay: 0,
                    presence: 'composing'
                },
                mediaMessage: {
                    mediatype: 'document',
                    fileName: payload.filename,
                    caption: payload.caption || '',
                    media: payload.documentUrl
                }
            };
            const result = yield callEvolutionAPI(`/message/sendMedia/${settings.instanceName}`, 'POST', body);
            if (!result.success) {
                yield logMessage({
                    id: logId,
                    direction: 'outbound',
                    toPhone: payload.to,
                    messageType: 'document',
                    status: 'failed',
                    errorMessage: result.error,
                    referenceType: payload.referenceType,
                    referenceId: payload.referenceId,
                    payload: body,
                });
                return { success: false, error: result.error };
            }
            const wamid = ((_b = (_a = result.data) === null || _a === void 0 ? void 0 : _a.key) === null || _b === void 0 ? void 0 : _b.id) || '';
            yield logMessage({
                id: logId,
                direction: 'outbound',
                toPhone: payload.to,
                messageType: 'document',
                status: 'sent',
                wamid,
                referenceType: payload.referenceType,
                referenceId: payload.referenceId,
                payload: body,
            });
            return { success: true, wamid };
        }
        else {
            // Embedded Mode
            try {
                let documentSource = payload.documentUrl;
                if (payload.documentUrl.includes('/uploads/whatsapp/')) {
                    const filename = payload.documentUrl.split('/uploads/whatsapp/')[1];
                    const baseUploadsPath = fs_1.default.existsSync(path_1.default.join(process.cwd(), 'uploads'))
                        ? path_1.default.join(process.cwd(), 'uploads')
                        : fs_1.default.existsSync(path_1.default.join(process.cwd(), '..', 'uploads'))
                            ? path_1.default.join(process.cwd(), '..', 'uploads')
                            : path_1.default.join(__dirname, '..', 'uploads');
                    const localPath = path_1.default.join(baseUploadsPath, 'whatsapp', filename);
                    if (fs_1.default.existsSync(localPath)) {
                        documentSource = fs_1.default.readFileSync(localPath);
                    }
                }
                const wamid = yield embeddedManager.sendDocument(cleanPhone, documentSource, payload.filename, payload.caption);
                yield logMessage({
                    id: logId,
                    direction: 'outbound',
                    toPhone: payload.to,
                    messageType: 'document',
                    status: 'sent',
                    wamid,
                    referenceType: payload.referenceType,
                    referenceId: payload.referenceId,
                    payload: { to: payload.to, documentUrl: payload.documentUrl },
                });
                return { success: true, wamid };
            }
            catch (err) {
                yield logMessage({
                    id: logId,
                    direction: 'outbound',
                    toPhone: payload.to,
                    messageType: 'document',
                    status: 'failed',
                    errorMessage: err.message || String(err),
                    referenceType: payload.referenceType,
                    referenceId: payload.referenceId,
                    payload: { to: payload.to, documentUrl: payload.documentUrl },
                });
                return { success: false, error: err.message || String(err) };
            }
        }
    });
}
function logMessage(entry) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield db_1.pool.query(`INSERT INTO whatsapp_message_log 
       (id, direction, toPhone, fromPhone, messageType, templateName, status, wamid, errorMessage, referenceType, referenceId, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                entry.id,
                entry.direction,
                entry.toPhone || null,
                entry.fromPhone || null,
                entry.messageType,
                entry.templateName || null,
                entry.status,
                entry.wamid || null,
                entry.errorMessage || null,
                entry.referenceType || null,
                entry.referenceId || null,
                entry.payload ? JSON.stringify(entry.payload) : null,
            ]);
        }
        catch (err) {
            console.error('❌ [WhatsApp] Failed to save message log:', err);
        }
    });
}
// ── Message Log Queries ────────────────────────────────────
function getMessageLogs(filters) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const page = Math.max(filters.page || 1, 1);
        const limit = Math.min(Math.max(filters.limit || 20, 1), 100);
        const offset = (page - 1) * limit;
        const conditions = [];
        const params = [];
        if (filters.referenceType) {
            conditions.push('referenceType = ?');
            params.push(filters.referenceType);
        }
        if (filters.referenceId) {
            conditions.push('referenceId = ?');
            params.push(filters.referenceId);
        }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const [countRows] = yield db_1.pool.query(`SELECT COUNT(*) as total FROM whatsapp_message_log ${where}`, params);
        const total = ((_a = countRows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
        const [rows] = yield db_1.pool.query(`SELECT * FROM whatsapp_message_log ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
        // Fetch status stats for the filtered dataset
        const [statsRows] = yield db_1.pool.query(`SELECT status, COUNT(*) as count FROM whatsapp_message_log ${where} GROUP BY status`, params);
        const stats = {
            total,
            pending: 0,
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0,
        };
        if (Array.isArray(statsRows)) {
            for (const r of statsRows) {
                const s = r.status;
                if (s in stats) {
                    stats[s] = r.count;
                }
            }
        }
        return {
            logs: rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
            stats,
        };
    });
}
// ── Webhook Helpers ────────────────────────────────────────
/** Update message status from Evolution webhook event (MESSAGES_UPDATE) */
function updateMessageStatus(wamid, status) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!wamid || !status)
            return;
        const validStatuses = ['sent', 'delivered', 'read', 'failed'];
        if (!validStatuses.includes(status))
            return;
        yield db_1.pool.query('UPDATE whatsapp_message_log SET status = ?, updatedAt = NOW() WHERE wamid = ?', [status, wamid]);
    });
}
/** Log an inbound message from a customer */
function logInboundMessage(message) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const id = (0, uuid_1.v4)();
        const fromPhone = ((_a = message.key) === null || _a === void 0 ? void 0 : _a.remoteJid) || null;
        const wamid = ((_b = message.key) === null || _b === void 0 ? void 0 : _b.id) || null;
        const textContent = ((_c = message.message) === null || _c === void 0 ? void 0 : _c.conversation) || ((_e = (_d = message.message) === null || _d === void 0 ? void 0 : _d.extendedTextMessage) === null || _e === void 0 ? void 0 : _e.text) || '';
        yield db_1.pool.query(`INSERT INTO whatsapp_message_log 
     (id, direction, fromPhone, messageType, wamid, status, errorMessage, payload)
     VALUES (?, 'inbound', ?, 'text', ?, 'read', ?, ?)`, [
            id,
            fromPhone,
            wamid,
            textContent,
            JSON.stringify(message),
        ]);
    });
}
