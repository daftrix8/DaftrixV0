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
exports.receiveWebhook = exports.verifyWebhook = exports.getMessageLogs = exports.testConnection = exports.updateWhatsAppSettings = exports.getWhatsAppSettings = void 0;
const db_1 = require("../db");
const uuid_1 = require("uuid");
const whatsappService = __importStar(require("../services/whatsappService"));
// ═══════════════════════════════════════════════════════════
// WhatsApp Controller
// Settings CRUD, test connection, message logs, webhooks
// ═══════════════════════════════════════════════════════════
// ── Settings ───────────────────────────────────────────────
/** GET /api/whatsapp/settings — Returns settings with masked access token */
const getWhatsAppSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const settings = yield whatsappService.getSettings();
        if (!settings) {
            return res.json({
                isEnabled: false,
                phoneNumberId: '',
                accessToken: '',
                wabaId: '',
                webhookToken: '',
                sendOnInvoiceConfirm: true,
                sendOnPaymentRecord: true,
                sendPOSReceipt: false,
            });
        }
        // Mask access token — never expose the full value
        const maskedToken = maskToken(settings.accessToken);
        return res.json(Object.assign(Object.assign({}, settings), { accessToken: maskedToken }));
    }
    catch (err) {
        console.error('❌ [WhatsApp] getSettings error:', err);
        return res.status(500).json({ error: 'Failed to load WhatsApp settings' });
    }
});
exports.getWhatsAppSettings = getWhatsAppSettings;
/** PUT /api/whatsapp/settings — Upsert settings row */
const updateWhatsAppSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { isEnabled, phoneNumberId, accessToken, wabaId, webhookToken, sendOnInvoiceConfirm, sendOnPaymentRecord, sendPOSReceipt, } = req.body;
        const existing = yield whatsappService.getSettings();
        if (existing) {
            // Build update — only update accessToken if a new value was sent (not the masked one)
            const isNewToken = accessToken && !accessToken.startsWith('••');
            const tokenValue = isNewToken ? accessToken : existing.accessToken;
            yield db_1.pool.query(`UPDATE whatsapp_settings SET 
         isEnabled = ?, phoneNumberId = ?, accessToken = ?, wabaId = ?, webhookToken = ?,
         sendOnInvoiceConfirm = ?, sendOnPaymentRecord = ?, sendPOSReceipt = ?
         WHERE id = ?`, [
                isEnabled !== null && isEnabled !== void 0 ? isEnabled : existing.isEnabled,
                phoneNumberId !== null && phoneNumberId !== void 0 ? phoneNumberId : existing.phoneNumberId,
                tokenValue,
                wabaId !== null && wabaId !== void 0 ? wabaId : existing.wabaId,
                webhookToken !== null && webhookToken !== void 0 ? webhookToken : existing.webhookToken,
                sendOnInvoiceConfirm !== null && sendOnInvoiceConfirm !== void 0 ? sendOnInvoiceConfirm : existing.sendOnInvoiceConfirm,
                sendOnPaymentRecord !== null && sendOnPaymentRecord !== void 0 ? sendOnPaymentRecord : existing.sendOnPaymentRecord,
                sendPOSReceipt !== null && sendPOSReceipt !== void 0 ? sendPOSReceipt : existing.sendPOSReceipt,
                existing.id,
            ]);
        }
        else {
            // First-time insert
            const id = (0, uuid_1.v4)();
            yield db_1.pool.query(`INSERT INTO whatsapp_settings 
         (id, isEnabled, phoneNumberId, accessToken, wabaId, webhookToken, sendOnInvoiceConfirm, sendOnPaymentRecord, sendPOSReceipt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                id,
                isEnabled !== null && isEnabled !== void 0 ? isEnabled : false,
                phoneNumberId || '',
                accessToken || '',
                wabaId || '',
                webhookToken || '',
                sendOnInvoiceConfirm !== null && sendOnInvoiceConfirm !== void 0 ? sendOnInvoiceConfirm : true,
                sendOnPaymentRecord !== null && sendOnPaymentRecord !== void 0 ? sendOnPaymentRecord : true,
                sendPOSReceipt !== null && sendPOSReceipt !== void 0 ? sendPOSReceipt : false,
            ]);
        }
        return res.json({ success: true, message: 'تم حفظ إعدادات واتساب' });
    }
    catch (err) {
        console.error('❌ [WhatsApp] updateSettings error:', err);
        return res.status(500).json({ error: 'Failed to save WhatsApp settings' });
    }
});
exports.updateWhatsAppSettings = updateWhatsAppSettings;
// ── Test Connection ────────────────────────────────────────
/** POST /api/whatsapp/test — Send a test text message */
const testConnection = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { phone, message } = req.body;
        if (!phone) {
            return res.status(400).json({ error: 'رقم الهاتف مطلوب' });
        }
        const formattedPhone = whatsappService.formatEgyptianPhone(phone);
        const result = yield whatsappService.sendTextMessage({
            to: formattedPhone,
            text: message || 'رسالة تجريبية من نظام ERP ✅',
            referenceType: 'test',
        });
        if (result.success) {
            return res.json({ success: true, message: 'تم إرسال الرسالة بنجاح ✅', wamid: result.wamid });
        }
        return res.status(400).json({ success: false, error: result.error });
    }
    catch (err) {
        console.error('❌ [WhatsApp] testConnection error:', err);
        return res.status(500).json({ error: 'فشل اختبار الاتصال' });
    }
});
exports.testConnection = testConnection;
// ── Message Logs ───────────────────────────────────────────
/** GET /api/whatsapp/logs — Paginated message log */
const getMessageLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { referenceType, referenceId, page, limit } = req.query;
        const result = yield whatsappService.getMessageLogs({
            referenceType: referenceType,
            referenceId: referenceId,
            page: page ? parseInt(page, 10) : 1,
            limit: limit ? parseInt(limit, 10) : 20,
        });
        return res.json(result);
    }
    catch (err) {
        console.error('❌ [WhatsApp] getMessageLogs error:', err);
        return res.status(500).json({ error: 'Failed to load message logs' });
    }
});
exports.getMessageLogs = getMessageLogs;
// ── Webhook Handlers ───────────────────────────────────────
/** GET /api/whatsapp/webhook — Meta verification handshake */
const verifyWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    // Resolve verify token: DB settings or .env fallback
    const settings = yield whatsappService.getSettings();
    const expectedToken = (settings === null || settings === void 0 ? void 0 : settings.webhookToken) || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';
    if (mode === 'subscribe' && token === expectedToken) {
        console.log('✅ [WhatsApp] Webhook verified');
        return res.status(200).send(challenge);
    }
    console.warn('⚠️ [WhatsApp] Webhook verification failed');
    return res.sendStatus(403);
});
exports.verifyWebhook = verifyWebhook;
/** POST /api/whatsapp/webhook — Receive status updates + inbound messages */
const receiveWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Always respond 200 to Meta — never return errors or Meta will retry
    res.sendStatus(200);
    try {
        const body = req.body;
        if ((body === null || body === void 0 ? void 0 : body.object) !== 'whatsapp_business_account')
            return;
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                const value = change.value;
                if (!value)
                    continue;
                // Handle delivery status updates
                yield processStatusUpdates(value.statuses || []);
                // Handle inbound customer messages
                yield processInboundMessages(value.messages || []);
            }
        }
    }
    catch (err) {
        // Log but don't crash — webhook already returned 200
        console.error('❌ [WhatsApp] Webhook processing error:', err);
    }
});
exports.receiveWebhook = receiveWebhook;
// ── Webhook Processing ─────────────────────────────────────
function processStatusUpdates(statuses) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const status of statuses) {
            if (!(status === null || status === void 0 ? void 0 : status.id) || !(status === null || status === void 0 ? void 0 : status.status))
                continue;
            yield whatsappService.updateMessageStatus(status.id, status.status);
        }
    });
}
function processInboundMessages(messages) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const message of messages) {
            if (!(message === null || message === void 0 ? void 0 : message.id))
                continue;
            yield whatsappService.logInboundMessage(message);
        }
    });
}
// ── Helpers ────────────────────────────────────────────────
/** Mask a token to ••••••XXXXXX (last 6 chars visible) */
function maskToken(token) {
    if (!token || token.length <= 6)
        return '••••••';
    return '••••••' + token.slice(-6);
}
