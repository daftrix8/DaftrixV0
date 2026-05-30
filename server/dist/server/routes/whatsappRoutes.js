"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRouter = void 0;
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const whatsappController_1 = require("../controllers/whatsappController");
// ═══════════════════════════════════════════════════════════
// WhatsApp Routes
// Exports two routers: public (webhooks) and protected (settings)
// ═══════════════════════════════════════════════════════════
// ── Public Webhook Router ──────────────────────────────────
// Must bypass auth — Meta sends requests without auth headers
exports.webhookRouter = (0, express_1.Router)();
exports.webhookRouter.get('/', whatsappController_1.verifyWebhook);
exports.webhookRouter.post('/', whatsappController_1.receiveWebhook);
// ── Protected Router ───────────────────────────────────────
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
router.get('/settings', (0, authMiddleware_1.requirePermission)('settings.view'), whatsappController_1.getWhatsAppSettings);
router.put('/settings', (0, authMiddleware_1.requirePermission)('settings.edit'), whatsappController_1.updateWhatsAppSettings);
router.post('/test', (0, authMiddleware_1.requirePermission)('settings.edit'), whatsappController_1.testConnection);
router.get('/logs', (0, authMiddleware_1.requirePermission)('settings.view'), whatsappController_1.getMessageLogs);
exports.default = router;
