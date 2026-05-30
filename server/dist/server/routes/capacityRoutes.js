"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const capacityController_1 = require("../controllers/capacityController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Capacity Planning Routes
router.get('/load', (0, authMiddleware_1.requirePermission)('capacity.view'), capacityController_1.getCapacityLoad);
router.get('/summary', (0, authMiddleware_1.requirePermission)('capacity.view'), capacityController_1.getCapacitySummary);
router.get('/bottlenecks', (0, authMiddleware_1.requirePermission)('capacity.view'), capacityController_1.getBottlenecks);
router.get('/work-center/:id/schedule', (0, authMiddleware_1.requirePermission)('capacity.view'), capacityController_1.getWorkCenterSchedule);
exports.default = router;
