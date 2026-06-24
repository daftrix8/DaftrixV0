"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const permissionController_1 = require("../controllers/permissionController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const responseCache_1 = require("../middleware/responseCache");
const router = express_1.default.Router();
// ── 1. Read Operations ──
// Requires permissions.view permission
router.get('/', (0, authMiddleware_1.requirePermission)('permissions.view'), (0, responseCache_1.responseCache)('permissions', 120000), permissionController_1.getPermissions);
router.get('/:id', (0, authMiddleware_1.requirePermission)('permissions.view'), (req, res, next) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return res.status(400).json({ error: 'INVALID_PERMISSION_ID', message: 'معرف الصلاحية غير صالح' });
    }
    next();
}, permissionController_1.getPermissionById);
// ── 2. Mutation Operations ──
router.post('/seed', (0, authMiddleware_1.requirePermission)('permissions.seed'), permissionController_1.seedPermissions);
router.post('/', (0, authMiddleware_1.requirePermission)('permissions.create'), permissionController_1.createPermission);
router.put('/:id', (0, authMiddleware_1.requirePermission)('permissions.edit'), (req, res, next) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return res.status(400).json({ error: 'INVALID_PERMISSION_ID', message: 'معرف الصلاحية غير صالح' });
    }
    next();
}, permissionController_1.updatePermission);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('permissions.delete'), (req, res, next) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return res.status(400).json({ error: 'INVALID_PERMISSION_ID', message: 'معرف الصلاحية غير صالح' });
    }
    next();
}, permissionController_1.deletePermission);
exports.default = router;
