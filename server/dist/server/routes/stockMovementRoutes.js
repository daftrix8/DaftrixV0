"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stockMovementController_1 = require("../controllers/stockMovementController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Stock Movement Routes
router.get('/', (0, authMiddleware_1.requirePermission)('inventory.view'), stockMovementController_1.getStockMovements);
router.get('/product/:productId', (0, authMiddleware_1.requirePermission)('inventory.view'), stockMovementController_1.getProductMovementHistory);
router.get('/stats', (0, authMiddleware_1.requirePermission)('inventory.view'), stockMovementController_1.getMovementStats);
router.post('/', (0, authMiddleware_1.requirePermission)('inventory.manage'), stockMovementController_1.createStockMovement);
router.post('/reconcile', (0, authMiddleware_1.requirePermission)('inventory.stock_taking'), stockMovementController_1.reconcileStock);
exports.default = router;
