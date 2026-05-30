"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const userController_1 = require("../controllers/userController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.use(authMiddleware_1.authenticateToken);
// Preferences update — users can only update their OWN preferences
// SECURITY: ownership check prevents User A from modifying User B's preferences
router.patch('/:id/preferences', (req, res, next) => {
    var _a;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== req.params.id) {
        return res.status(403).json({ error: 'يمكنك تعديل تفضيلاتك الخاصة فقط' });
    }
    next();
}, userController_1.updatePreferences);
router.use((0, authMiddleware_1.requirePermission)('system.users'));
router.get('/', userController_1.getUsers);
router.post('/', userController_1.createUser);
router.put('/:id', userController_1.updateUser);
router.delete('/:id', userController_1.deleteUser);
exports.default = router;
