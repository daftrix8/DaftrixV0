"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bomController_1 = require("../controllers/bomController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// BOM Routes
router.get('/', (0, authMiddleware_1.requirePermission)('bom.view'), bomController_1.getBOMs);
router.get('/:id', (0, authMiddleware_1.requirePermission)('bom.view'), bomController_1.getBOMById);
router.post('/', (0, authMiddleware_1.requirePermission)('bom.create'), bomController_1.createBOM);
router.put('/:id', (0, authMiddleware_1.requirePermission)('bom.edit'), bomController_1.updateBOM);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('bom.delete'), bomController_1.deleteBOM);
// BOM Calculations
router.post('/calculate-requirements', (0, authMiddleware_1.requirePermission)('bom.costing'), bomController_1.calculateBOMRequirements);
exports.default = router;
