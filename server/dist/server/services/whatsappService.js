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
exports.formatEgyptianPhone = formatEgyptianPhone;
exports.getSettings = getSettings;
exports.isWhatsAppEnabled = isWhatsAppEnabled;
exports.sendTextMessage = sendTextMessage;
exports.sendTemplateMessage = sendTemplateMessage;
exports.sendDocument = sendDocument;
exports.getMessageLogs = getMessageLogs;
exports.updateMessageStatus = updateMessageStatus;
exports.logInboundMessage = logInboundMessage;
const db_1 = require("../db");
const uuid_1 = require("uuid");
// ═══════════════════════════════════════════════════════════
// WhatsApp Cloud API Service
// Direct HTTP calls to Meta Graph API — no third-party libs
// ═══════════════════════════════════════════════════════════
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v20.0';
const BASE_URL = process.env.WHATSAPP_BASE_URL || 'https://graph.facebook.com';
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
        const [rows] = yield db_1.pool.query('SELECT * FROM whatsapp_settings LIMIT 1');
        const settings = rows[0];
        if (!settings)
            return null;
        return {
            id: settings.id,
            isEnabled: !!settings.isEnabled,
            phoneNumberId: settings.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
            accessToken: settings.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || '',
            wabaId: settings.wabaId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
            webhookToken: settings.webhookToken || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
            sendOnInvoiceConfirm: settings.sendOnInvoiceConfirm !== 0,
            sendOnPaymentRecord: settings.sendOnPaymentRecord !== 0,
            sendPOSReceipt: !!settings.sendPOSReceipt,
        };
    });
}
/** Quick check: is WhatsApp globally enabled? */
function isWhatsAppEnabled() {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = yield getSettings();
        return !!(settings === null || settings === void 0 ? void 0 : settings.isEnabled);
    });
}
// ── Credentials Resolution ─────────────────────────────────
/** Resolve credentials: DB settings take priority, .env as fallback */
function resolveCredentials() {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = yield getSettings();
        const phoneNumberId = (settings === null || settings === void 0 ? void 0 : settings.phoneNumberId) || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
        const accessToken = (settings === null || settings === void 0 ? void 0 : settings.accessToken) || process.env.WHATSAPP_ACCESS_TOKEN || '';
        if (!phoneNumberId || !accessToken)
            return null;
        return { phoneNumberId, accessToken };
    });
}
// ── Core Send Function ─────────────────────────────────────
function sendToMeta(body, meta) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const creds = yield resolveCredentials();
        if (!creds) {
            return { success: false, error: 'WhatsApp credentials not configured' };
        }
        const url = `${BASE_URL}/${API_VERSION}/${creds.phoneNumberId}/messages`;
        const logId = (0, uuid_1.v4)();
        try {
            const response = yield fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${creds.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            const data = yield response.json();
            if (!response.ok) {
                const errorMsg = ((_a = data === null || data === void 0 ? void 0 : data.error) === null || _a === void 0 ? void 0 : _a.message) || `HTTP ${response.status}`;
                yield logMessage({
                    id: logId,
                    direction: 'outbound',
                    toPhone: meta.toPhone,
                    messageType: meta.messageType,
                    templateName: meta.templateName,
                    status: 'failed',
                    errorMessage: errorMsg,
                    referenceType: meta.referenceType,
                    referenceId: meta.referenceId,
                    payload: body,
                });
                return { success: false, error: errorMsg };
            }
            const wamid = ((_c = (_b = data === null || data === void 0 ? void 0 : data.messages) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.id) || '';
            yield logMessage({
                id: logId,
                direction: 'outbound',
                toPhone: meta.toPhone,
                messageType: meta.messageType,
                templateName: meta.templateName,
                status: 'sent',
                wamid,
                referenceType: meta.referenceType,
                referenceId: meta.referenceId,
                payload: body,
            });
            return { success: true, wamid };
        }
        catch (err) {
            const errorMsg = (err === null || err === void 0 ? void 0 : err.message) || 'Network error';
            yield logMessage({
                id: logId,
                direction: 'outbound',
                toPhone: meta.toPhone,
                messageType: meta.messageType,
                templateName: meta.templateName,
                status: 'failed',
                errorMessage: errorMsg,
                referenceType: meta.referenceType,
                referenceId: meta.referenceId,
                payload: body,
            }).catch(() => { }); // Don't let logging failure mask the original error
            return { success: false, error: errorMsg };
        }
    });
}
// ── Public Send Functions ──────────────────────────────────
function sendTextMessage(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        const body = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: payload.to,
            type: 'text',
            text: { body: payload.text },
        };
        return sendToMeta(body, {
            toPhone: payload.to,
            messageType: 'text',
            referenceType: payload.referenceType,
            referenceId: payload.referenceId,
        });
    });
}
function sendTemplateMessage(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        const body = {
            messaging_product: 'whatsapp',
            to: payload.to,
            type: 'template',
            template: {
                name: payload.templateName,
                language: { code: payload.languageCode },
                components: payload.components,
            },
        };
        return sendToMeta(body, {
            toPhone: payload.to,
            messageType: 'template',
            templateName: payload.templateName,
            referenceType: payload.referenceType,
            referenceId: payload.referenceId,
        });
    });
}
function sendDocument(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        const body = {
            messaging_product: 'whatsapp',
            to: payload.to,
            type: 'document',
            document: {
                link: payload.documentUrl,
                filename: payload.filename,
                caption: payload.caption || '',
            },
        };
        return sendToMeta(body, {
            toPhone: payload.to,
            messageType: 'document',
            referenceType: payload.referenceType,
            referenceId: payload.referenceId,
        });
    });
}
function logMessage(entry) {
    return __awaiter(this, void 0, void 0, function* () {
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
        return {
            logs: rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    });
}
// ── Webhook Helpers ────────────────────────────────────────
/** Update message status from Meta webhook event */
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
        const id = (0, uuid_1.v4)();
        yield db_1.pool.query(`INSERT INTO whatsapp_message_log 
     (id, direction, fromPhone, messageType, wamid, status, payload)
     VALUES (?, 'inbound', ?, ?, ?, 'read', ?)`, [
            id,
            message.from || null,
            message.type || 'text',
            message.id || null,
            JSON.stringify(message),
        ]);
    });
}
