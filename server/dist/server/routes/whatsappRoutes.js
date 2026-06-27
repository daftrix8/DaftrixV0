"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRouter = void 0;
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const whatsappController_1 = require("../controllers/whatsappController");
// Ensure uploads/whatsapp directory exists
const baseUploadsPath = fs_1.default.existsSync(path_1.default.join(process.cwd(), 'uploads'))
    ? path_1.default.join(process.cwd(), 'uploads')
    : fs_1.default.existsSync(path_1.default.join(process.cwd(), '..', 'uploads'))
        ? path_1.default.join(process.cwd(), '..', 'uploads')
        : path_1.default.join(__dirname, '..', 'uploads');
const uploadsDir = path_1.default.join(baseUploadsPath, 'whatsapp');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
// Multer config
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const safeName = path_1.default.basename(file.originalname, ext).replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
        cb(null, `${safeName}_${Date.now()}${ext}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
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
router.get('/state', (0, authMiddleware_1.requirePermission)('settings.view'), whatsappController_1.getWhatsAppState);
router.post('/initialize', (0, authMiddleware_1.requirePermission)('settings.edit'), whatsappController_1.initializeWhatsAppInstance);
router.post('/logout', (0, authMiddleware_1.requirePermission)('settings.edit'), whatsappController_1.logoutWhatsAppInstance);
router.post('/test', (0, authMiddleware_1.requirePermission)('settings.edit'), whatsappController_1.testConnection);
router.get('/logs', (0, authMiddleware_1.requirePermission)('settings.view'), whatsappController_1.getMessageLogs);
router.post('/send-invoice-pdf', upload.single('pdf'), whatsappController_1.sendInvoicePDFViaWhatsApp);
router.post('/send-text', whatsappController_1.sendWhatsAppTextMessage);
exports.default = router;
