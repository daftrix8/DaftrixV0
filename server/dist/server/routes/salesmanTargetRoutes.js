"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const salesmanTargetController_1 = require("../controllers/salesmanTargetController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Get stats for all salesmen (التحصيل، المديونيه، العجز)
router.get('/stats', (0, authMiddleware_1.requirePermission)('salesteam.view'), salesmanTargetController_1.getAllSalesmanStats);
// Get stats for a specific salesman
router.get('/stats/:salesmanId', (0, authMiddleware_1.requirePermission)('salesteam.view'), salesmanTargetController_1.getSalesmanStats);
// Get all targets (bare path — used by SalesmanReports.tsx for commission rate hierarchy)
router.get('/', (0, authMiddleware_1.requirePermission)('salesteam.view'), salesmanTargetController_1.getAllActiveTargets);
// Get all active targets
router.get('/active', (0, authMiddleware_1.requirePermission)('salesteam.targets'), salesmanTargetController_1.getAllActiveTargets);
// Get targets for a specific salesman
router.get('/salesman/:salesmanId', (0, authMiddleware_1.requirePermission)('salesteam.targets'), salesmanTargetController_1.getSalesmanTargets);
// Get progress report for a salesman
router.get('/salesman/:salesmanId/progress', (0, authMiddleware_1.requirePermission)('salesteam.targets'), salesmanTargetController_1.getTargetProgressReport);
// Create new target
router.post('/', (0, authMiddleware_1.requirePermission)('salesteam.targets'), salesmanTargetController_1.createSalesmanTarget);
// Update target
router.put('/:id', (0, authMiddleware_1.requirePermission)('salesteam.targets'), salesmanTargetController_1.updateSalesmanTarget);
// Delete target
router.delete('/:id', (0, authMiddleware_1.requirePermission)('salesteam.targets'), salesmanTargetController_1.deleteSalesmanTarget);
exports.default = router;
