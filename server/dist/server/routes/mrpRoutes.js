"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mrpController_1 = require("../controllers/mrpController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// MRP Routes
router.get('/calculate', (0, authMiddleware_1.requirePermission)('mrp.calculate'), mrpController_1.calculateMRP);
router.post('/generate-suggestions', (0, authMiddleware_1.requirePermission)('mrp.calculate'), mrpController_1.generateSuggestions);
router.get('/suggestions', (0, authMiddleware_1.requirePermission)('mrp.view'), mrpController_1.getSuggestions);
router.put('/suggestions/:id', (0, authMiddleware_1.requirePermission)('mrp.calculate'), mrpController_1.updateSuggestion);
router.delete('/suggestions/:id', (0, authMiddleware_1.requirePermission)('mrp.calculate'), mrpController_1.deleteSuggestion);
router.post('/convert-to-orders', (0, authMiddleware_1.requirePermission)('mrp.generate_orders'), mrpController_1.convertToOrders);
exports.default = router;
