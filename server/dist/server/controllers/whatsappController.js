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
exports.sendWhatsAppTextMessage = exports.sendInvoicePDFViaWhatsApp = exports.receiveWebhook = exports.verifyWebhook = exports.getMessageLogs = exports.testConnection = exports.initializeWhatsAppInstance = exports.getWhatsAppState = exports.logoutWhatsAppInstance = exports.updateWhatsAppSettings = exports.getWhatsAppSettings = void 0;
const db_1 = require("../db");
const uuid_1 = require("uuid");
const whatsappService = __importStar(require("../services/whatsappService"));
// ═══════════════════════════════════════════════════════════
// WhatsApp Controller
// Settings CRUD, connection state, QR code initialization, logs, webhooks
// ═══════════════════════════════════════════════════════════
// ── Settings ───────────────────────────────────────────────
/** GET /api/whatsapp/settings — Returns settings with masked API key */
const getWhatsAppSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const settings = yield whatsappService.getSettings();
        if (!settings) {
            return res.json({
                isEnabled: false,
                provider: 'EMBEDDED',
                apiUrl: '',
                instanceName: '',
                apiKey: '',
                webhookToken: '',
                sendOnInvoiceConfirm: true,
                sendOnPaymentRecord: true,
                sendPOSReceipt: false,
            });
        }
        // Mask API key — never expose the full value
        const maskedKey = maskToken(settings.apiKey);
        return res.json(Object.assign(Object.assign({}, settings), { apiKey: maskedKey }));
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
        const { isEnabled, provider, apiUrl, instanceName, apiKey, webhookToken, sendOnInvoiceConfirm, sendOnPaymentRecord, sendPOSReceipt, } = req.body;
        const existing = yield whatsappService.getSettings();
        if (existing) {
            const isNewKey = apiKey && !apiKey.startsWith('••');
            const keyValue = isNewKey ? apiKey : existing.apiKey;
            yield db_1.pool.query(`UPDATE whatsapp_settings SET 
         isEnabled = ?, provider = ?, apiUrl = ?, instanceName = ?, apiKey = ?, webhookToken = ?,
         sendOnInvoiceConfirm = ?, sendOnPaymentRecord = ?, sendPOSReceipt = ?
         WHERE id = ?`, [
                isEnabled !== null && isEnabled !== void 0 ? isEnabled : existing.isEnabled,
                provider !== null && provider !== void 0 ? provider : existing.provider,
                apiUrl !== null && apiUrl !== void 0 ? apiUrl : existing.apiUrl,
                instanceName !== null && instanceName !== void 0 ? instanceName : existing.instanceName,
                keyValue,
                webhookToken !== null && webhookToken !== void 0 ? webhookToken : existing.webhookToken,
                sendOnInvoiceConfirm !== null && sendOnInvoiceConfirm !== void 0 ? sendOnInvoiceConfirm : existing.sendOnInvoiceConfirm,
                sendOnPaymentRecord !== null && sendOnPaymentRecord !== void 0 ? sendOnPaymentRecord : existing.sendOnPaymentRecord,
                sendPOSReceipt !== null && sendPOSReceipt !== void 0 ? sendPOSReceipt : existing.sendPOSReceipt,
                existing.id,
            ]);
        }
        else {
            const id = (0, uuid_1.v4)();
            yield db_1.pool.query(`INSERT INTO whatsapp_settings 
         (id, isEnabled, provider, apiUrl, instanceName, apiKey, accessToken, webhookToken, sendOnInvoiceConfirm, sendOnPaymentRecord, sendPOSReceipt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                id,
                isEnabled !== null && isEnabled !== void 0 ? isEnabled : false,
                provider || 'EMBEDDED',
                apiUrl || '',
                instanceName || '',
                apiKey || '',
                '', // accessToken default value to prevent DB constraint errors
                webhookToken || '',
                sendOnInvoiceConfirm !== null && sendOnInvoiceConfirm !== void 0 ? sendOnInvoiceConfirm : true,
                sendOnPaymentRecord !== null && sendOnPaymentRecord !== void 0 ? sendOnPaymentRecord : true,
                sendPOSReceipt !== null && sendPOSReceipt !== void 0 ? sendPOSReceipt : false,
            ]);
        }
        // Automatically try to set webhook if enabled (only for external Evolution API)
        if (isEnabled && provider === 'EVOLUTION' && apiUrl && instanceName) {
            try {
                const protocol = req.protocol;
                const host = req.get('host');
                const webhookUrl = `${protocol}://${host}/api/whatsapp/webhook`;
                yield whatsappService.setWebhook(webhookUrl);
                console.log(`✅ [WhatsApp] Webhook auto-configured for instance ${instanceName}: ${webhookUrl}`);
            }
            catch (webhookErr) {
                console.warn('⚠️ [WhatsApp] Webhook auto-configuration failed:', webhookErr.message);
            }
        }
        return res.json({ success: true, message: 'تم حفظ إعدادات واتساب' });
    }
    catch (err) {
        console.error('❌ [WhatsApp] updateSettings error:', err);
        return res.status(500).json({ error: 'Failed to save WhatsApp settings' });
    }
});
exports.updateWhatsAppSettings = updateWhatsAppSettings;
/** POST /api/whatsapp/logout — Disconnect and clean session keys */
const logoutWhatsAppInstance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const isEnabled = yield whatsappService.isWhatsAppEnabled();
        if (!isEnabled) {
            return res.status(400).json({ error: 'خدمة واتساب غير مفعّلة حالياً' });
        }
        const result = yield whatsappService.logoutInstance();
        if (result.success) {
            return res.json({ success: true, message: 'تم قطع الاتصال وحذف الجلسة بنجاح ✅' });
        }
        return res.status(400).json({ success: false, error: result.error });
    }
    catch (err) {
        console.error('❌ [WhatsApp] logoutWhatsAppInstance error:', err);
        return res.status(500).json({ error: 'فشل قطع الاتصال بالواتساب' });
    }
});
exports.logoutWhatsAppInstance = logoutWhatsAppInstance;
// ── Connection State & QR Code ─────────────────────────────
/** GET /api/whatsapp/state — Get WhatsApp connection status */
const getWhatsAppState = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const isEnabled = yield whatsappService.isWhatsAppEnabled();
        if (!isEnabled) {
            return res.json({ state: 'close', message: 'خدمة واتساب غير مفعّلة حالياً' });
        }
        const stateResult = yield whatsappService.getConnectionState();
        return res.json(stateResult);
    }
    catch (err) {
        console.error('❌ [WhatsApp] getWhatsAppState error:', err);
        return res.status(500).json({ state: 'error', error: err.message || 'فشل في جلب حالة الاتصال' });
    }
});
exports.getWhatsAppState = getWhatsAppState;
/** POST /api/whatsapp/initialize — Initialize instance and return QR code */
const initializeWhatsAppInstance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const isEnabled = yield whatsappService.isWhatsAppEnabled();
        if (!isEnabled) {
            return res.status(400).json({ error: 'يرجى تفعيل خدمة واتساب أولاً وحفظ الإعدادات' });
        }
        const qrResult = yield whatsappService.getQRCode();
        if (qrResult.success) {
            return res.json({
                success: true,
                code: qrResult.code,
                base64: qrResult.base64
            });
        }
        return res.status(400).json({ success: false, error: qrResult.error });
    }
    catch (err) {
        console.error('❌ [WhatsApp] initializeWhatsAppInstance error:', err);
        return res.status(500).json({ error: 'فشل في إنشاء المثيل واسترجاع رمز QR' });
    }
});
exports.initializeWhatsAppInstance = initializeWhatsAppInstance;
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
/** GET /api/whatsapp/webhook — Meta verification handshake (kept for safety/stub) */
const verifyWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const challenge = req.query['hub.challenge'];
    if (challenge) {
        return res.status(200).send(challenge);
    }
    return res.sendStatus(200);
});
exports.verifyWebhook = verifyWebhook;
/** POST /api/whatsapp/webhook — Receive Evolution API status updates + inbound messages */
const receiveWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    // Always return 200 immediately to prevent webhook retries
    res.sendStatus(200);
    try {
        const body = req.body;
        const event = body === null || body === void 0 ? void 0 : body.event;
        const data = body === null || body === void 0 ? void 0 : body.data;
        if (!event || !data)
            return;
        // Handle Inbound Messages
        if (event === 'messages.upsert') {
            // Only log inbound customer messages (ignore our own outbound triggers)
            if (((_a = data === null || data === void 0 ? void 0 : data.key) === null || _a === void 0 ? void 0 : _a.fromMe) === false) {
                yield whatsappService.logInboundMessage(data);
            }
        }
        // Handle Message Status Delivery Reports
        else if (event === 'messages.update') {
            const wamid = (_b = data === null || data === void 0 ? void 0 : data.key) === null || _b === void 0 ? void 0 : _b.id;
            const statusNum = (_c = data === null || data === void 0 ? void 0 : data.update) === null || _c === void 0 ? void 0 : _c.status;
            let statusStr = '';
            if (statusNum === 1 || statusNum === 2) {
                // 1 = server ack/sent, 2 = delivered to device
                statusStr = statusNum === 2 ? 'delivered' : 'sent';
            }
            else if (statusNum === 3 || statusNum === 4) {
                // 3 = read by recipient, 4 = played audio
                statusStr = 'read';
            }
            if (wamid && statusStr) {
                yield whatsappService.updateMessageStatus(wamid, statusStr);
            }
        }
    }
    catch (err) {
        console.error('❌ [WhatsApp Webhook] Processing error:', err);
    }
});
exports.receiveWebhook = receiveWebhook;
// ── Helpers ────────────────────────────────────────────────
/** Mask a token to ••••••XXXXXX (last 6 chars visible) */
function maskToken(token) {
    if (!token || token.length <= 6)
        return '••••••';
    return '••••••' + token.slice(-6);
}
/** POST /api/whatsapp/send-invoice-pdf — Receive uploaded PDF and send via WhatsApp API or fallback to Web */
const sendInvoicePDFViaWhatsApp = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { phone, invoiceId, caption, referenceType = 'invoice', referenceId } = req.body;
        const file = req.file;
        if (!phone) {
            return res.status(400).json({ error: 'رقم الهاتف مطلوب' });
        }
        if (!file) {
            return res.status(400).json({ error: 'ملف PDF مطلوب' });
        }
        const formattedPhone = whatsappService.formatEgyptianPhone(phone);
        // Construct public url for the file
        const protocol = req.protocol;
        const host = req.get('host');
        const fileUrl = `${protocol}://${host}/uploads/whatsapp/${file.filename}`;
        const isEnabled = yield whatsappService.isWhatsAppEnabled();
        if (isEnabled) {
            try {
                // Deliver via Evolution API directly from the public file url
                const actualReferenceId = referenceId || invoiceId;
                const result = yield whatsappService.sendDocument({
                    to: formattedPhone,
                    documentUrl: fileUrl,
                    filename: file.originalname || `Doc_${actualReferenceId || Date.now()}.pdf`,
                    caption: caption || 'المستند الخاص بك 📄',
                    referenceType: referenceType,
                    referenceId: actualReferenceId,
                });
                if (result.success) {
                    if (res.headersSent) {
                        console.warn('⚠️ [WhatsApp] sendInvoicePDFViaWhatsApp: Headers already sent, skipping success response.');
                        return;
                    }
                    return res.json({
                        success: true,
                        method: 'api',
                        message: 'تم إرسال الفاتورة بنجاح عبر واتساب ✅',
                        wamid: result.wamid,
                    });
                }
                else {
                    throw new Error(result.error);
                }
            }
            catch (sendError) {
                console.warn('⚠️ [WhatsApp] Evolution Media Send failed, falling back to manual redirect link:', sendError);
                if (res.headersSent) {
                    console.warn('⚠️ [WhatsApp] sendInvoicePDFViaWhatsApp: Headers already sent, skipping fallback response.');
                    return;
                }
                return res.json({
                    success: true,
                    method: 'web',
                    fileUrl: `/uploads/whatsapp/${file.filename}`,
                    warning: `فشل الإرسال التلقائي: ${sendError.message || 'خطأ غير معروف'}. تم التحويل للإرسال اليدوي`,
                });
            }
        }
        else {
            // Fallback to Web link (WhatsApp Web redirect link)
            if (res.headersSent)
                return;
            return res.json({
                success: true,
                method: 'web',
                fileUrl: `/uploads/whatsapp/${file.filename}`,
            });
        }
    }
    catch (err) {
        console.error('❌ [WhatsApp] sendInvoicePDFViaWhatsApp error:', err);
        if (res.headersSent)
            return;
        return res.status(500).json({ error: 'فشل إرسال الفاتورة عبر واتساب' });
    }
});
exports.sendInvoicePDFViaWhatsApp = sendInvoicePDFViaWhatsApp;
/** POST /api/whatsapp/send-text — Send a direct text message */
const sendWhatsAppTextMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { phone, text, referenceType, referenceId } = req.body;
        if (!phone || !text) {
            return res.status(400).json({ error: 'رقم الهاتف والرسالة مطلوبان' });
        }
        const formattedPhone = whatsappService.formatEgyptianPhone(phone);
        const isEnabled = yield whatsappService.isWhatsAppEnabled();
        if (isEnabled) {
            const result = yield whatsappService.sendTextMessage({
                to: formattedPhone,
                text,
                referenceType: referenceType || 'membership',
                referenceId: referenceId || undefined,
            });
            if (res.headersSent) {
                console.warn('⚠️ [WhatsApp] sendWhatsAppTextMessage: Headers already sent, skipping response.');
                return;
            }
            if (result.success) {
                return res.json({ success: true, method: 'api', wamid: result.wamid });
            }
            else {
                return res.json({
                    success: true,
                    method: 'web',
                    warning: `فشل الإرسال التلقائي: ${result.error}. تم التحويل للإرسال اليدوي`,
                });
            }
        }
        else {
            if (res.headersSent)
                return;
            return res.json({
                success: true,
                method: 'web',
            });
        }
    }
    catch (err) {
        console.error('❌ [WhatsApp] sendWhatsAppTextMessage error:', err);
        if (res.headersSent)
            return;
        return res.status(500).json({ error: 'فشل إرسال رسالة واتساب' });
    }
});
exports.sendWhatsAppTextMessage = sendWhatsAppTextMessage;
