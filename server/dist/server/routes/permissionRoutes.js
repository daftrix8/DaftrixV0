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
// GET — any authenticated user can read permissions (needed for user management UI dropdowns)
// PERF: Cache for 120s, auto-invalidated on entity:changed for 'permissions'
router.get('/', (0, responseCache_1.responseCache)('permissions', 120000), permissionController_1.getPermissions);
// Mutations — require system.users permission
// SECURITY: Without this, any authenticated user could create/modify/delete permissions,
// which is a privilege escalation vulnerability
router.post('/', (0, authMiddleware_1.requirePermission)('system.users'), permissionController_1.createPermission);
router.post('/seed', (0, authMiddleware_1.requirePermission)('system.users'), permissionController_1.seedPermissions); // Bulk seed — single request instead of 80+
router.put('/:id', (0, authMiddleware_1.requirePermission)('system.users'), permissionController_1.updatePermission);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('system.users'), permissionController_1.deletePermission);
exports.default = router;
