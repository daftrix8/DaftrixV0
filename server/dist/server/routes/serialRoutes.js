"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const serialController_1 = require("../controllers/serialController");
const router = express_1.default.Router();
router.use(authMiddleware_1.authenticateToken);
router.get('/search', (0, authMiddleware_1.requirePermission)('inventory.serial_tracking'), serialController_1.searchSerials);
router.get('/reports', (0, authMiddleware_1.requirePermission)('inventory.serial_tracking'), serialController_1.getSerialReport);
router.get('/dashboard', (0, authMiddleware_1.requirePermission)('inventory.serial_tracking'), serialController_1.getSerialDashboard);
router.get('/available', (0, authMiddleware_1.requirePermission)('inventory.serial_tracking'), serialController_1.getAvailableSerials);
router.get('/history/:serialNumber', (0, authMiddleware_1.requirePermission)('inventory.serial_tracking'), serialController_1.getSerialHistory);
router.get('/customer/:serialNumber', (0, authMiddleware_1.requirePermission)('inventory.serial_tracking'), serialController_1.getCustomerBySerial);
router.put('/:id/status', (0, authMiddleware_1.requirePermission)('inventory.serial_tracking'), serialController_1.updateSerialStatus);
router.post('/bulk-status', (0, authMiddleware_1.requirePermission)('inventory.serial_tracking'), serialController_1.bulkUpdateStatus);
exports.default = router;
