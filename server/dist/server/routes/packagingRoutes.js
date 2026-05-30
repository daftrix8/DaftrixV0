"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const packagingController_1 = require("../controllers/packagingController");
const manualBatchController_1 = require("../controllers/manualBatchController");
const packagingOrdersController_1 = require("../controllers/packagingOrdersController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Packaging Specifications (Manager)
router.get('/specs', (0, authMiddleware_1.requirePermission)('manufacturing.view'), packagingController_1.getSpecs);
router.get('/specs/:id', (0, authMiddleware_1.requirePermission)('manufacturing.view'), packagingController_1.getSpec);
router.post('/specs', (0, authMiddleware_1.requirePermission)('manufacturing.production'), packagingController_1.createSpec);
router.put('/specs/:id', (0, authMiddleware_1.requirePermission)('manufacturing.production'), packagingController_1.updateSpec);
router.delete('/specs/:id', (0, authMiddleware_1.requirePermission)('manufacturing.production'), packagingController_1.deleteSpec);
// Packaging Tasks / Shop Floor Execution
router.get('/tasks', (0, authMiddleware_1.requirePermission)('manufacturing.view'), packagingController_1.getTasks);
router.post('/tasks/:id/pack', (0, authMiddleware_1.requirePermission)('manufacturing.production'), packagingController_1.packTask);
router.post('/tasks/:id/complete', (0, authMiddleware_1.requirePermission)('manufacturing.production'), packagingController_1.completeTask);
// Production Orders available for packaging (must be before /orders/:id)
router.get('/orders/production-orders', (0, authMiddleware_1.requirePermission)('manufacturing.view'), packagingOrdersController_1.getProductionOrdersForPackaging);
// Advanced Packaging Orders
router.get('/orders', (0, authMiddleware_1.requirePermission)('manufacturing.view'), packagingOrdersController_1.getPackagingOrders);
router.post('/orders/bulk', (0, authMiddleware_1.requirePermission)('manufacturing.production'), packagingOrdersController_1.createBulkPackagingOrders);
router.get('/orders/:id', (0, authMiddleware_1.requirePermission)('manufacturing.view'), packagingOrdersController_1.getPackagingOrder);
router.post('/orders', (0, authMiddleware_1.requirePermission)('manufacturing.production'), packagingOrdersController_1.createPackagingOrder);
router.delete('/orders/:id', (0, authMiddleware_1.requirePermission)('manufacturing.production'), packagingOrdersController_1.deletePackagingOrder);
// Manual Batches
router.get('/manual-batches', (0, authMiddleware_1.requirePermission)('manufacturing.view'), manualBatchController_1.getManualBatches);
router.get('/manual-batches/:id', (0, authMiddleware_1.requirePermission)('manufacturing.view'), manualBatchController_1.getManualBatch);
router.post('/manual-batches', (0, authMiddleware_1.requirePermission)('manufacturing.production'), manualBatchController_1.createManualBatch);
router.delete('/manual-batches/:id', (0, authMiddleware_1.requirePermission)('manufacturing.production'), manualBatchController_1.deleteManualBatch);
exports.default = router;
