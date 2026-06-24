"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const userController_1 = require("../controllers/userController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Authenticate token is required for all routes in this router
router.use(authMiddleware_1.authenticateToken);
// ── 1. Sanitized Chat Users List ──
// Accessible to all authenticated users for chat functionality
router.get('/chat', userController_1.getChatUsers);
// ── 2. Preferences Update ──
// Users can only update their own preferences
router.patch('/:id/preferences', (req, res, next) => {
    var _a;
    const { id } = req.params;
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return res.status(400).json({ error: 'INVALID_USER_ID', message: 'معرف المستخدم غير صالح' });
    }
    if (String((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== String(id)) {
        return res.status(403).json({ error: 'FORBIDDEN_OWN_PREFERENCES_ONLY', message: 'يمكنك تعديل تفضيلاتك الخاصة فقط' });
    }
    next();
}, userController_1.updatePreferences);
// ── 3. User Detail Route ──
// Requires users.view permission
router.get('/:id', (0, authMiddleware_1.requirePermission)('users.view'), (req, res, next) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return res.status(400).json({ error: 'INVALID_USER_ID', message: 'معرف المستخدم غير صالح' });
    }
    next();
}, userController_1.getUserById);
// ── 4. Granular User Management Routes ──
router.get('/', (0, authMiddleware_1.requirePermission)('users.view'), userController_1.getUsers);
router.post('/', (0, authMiddleware_1.requirePermission)('users.create'), userController_1.createUser);
router.put('/:id', (0, authMiddleware_1.requirePermission)('users.edit'), (req, res, next) => {
    var _a;
    const { id } = req.params;
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return res.status(400).json({ error: 'INVALID_USER_ID', message: 'معرف المستخدم غير صالح' });
    }
    // Self-update self-protection: prevent users from escalating their own privileges
    if (String((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) === String(id)) {
        if (req.body) {
            delete req.body.role;
            delete req.body.permissions;
            delete req.body.status;
            delete req.body.branchId;
            delete req.body.warehouseId;
        }
    }
    next();
}, userController_1.updateUser);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('users.delete'), (req, res, next) => {
    var _a;
    const { id } = req.params;
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return res.status(400).json({ error: 'INVALID_USER_ID', message: 'معرف المستخدم غير صالح' });
    }
    // Self-delete prevention
    if (String((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) === String(id)) {
        return res.status(403).json({ error: 'FORBIDDEN_CANNOT_DELETE_SELF', message: 'لا يمكنك حذف حسابك بنفسك' });
    }
    next();
}, userController_1.deleteUser);
exports.default = router;
