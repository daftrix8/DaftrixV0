"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const workCenterController_1 = require("../controllers/workCenterController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Work Center routes
router.get('/', (0, authMiddleware_1.requirePermission)('workcenter.view'), workCenterController_1.getWorkCenters);
router.get('/:id', (0, authMiddleware_1.requirePermission)('workcenter.view'), workCenterController_1.getWorkCenter);
router.post('/', (0, authMiddleware_1.requirePermission)('workcenter.create'), workCenterController_1.createWorkCenter);
router.put('/:id', (0, authMiddleware_1.requirePermission)('workcenter.edit'), workCenterController_1.updateWorkCenter);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('workcenter.delete'), workCenterController_1.deleteWorkCenter);
exports.default = router;
