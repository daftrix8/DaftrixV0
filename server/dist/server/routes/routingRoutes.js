"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const routingController_1 = require("../controllers/routingController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Routing routes
router.get('/', (0, authMiddleware_1.requirePermission)('routing.view'), routingController_1.getRoutings);
router.get('/:id', (0, authMiddleware_1.requirePermission)('routing.view'), routingController_1.getRouting);
router.get('/:id/calculate-cost', (0, authMiddleware_1.requirePermission)('routing.view'), routingController_1.calculateRoutingCost);
router.post('/', (0, authMiddleware_1.requirePermission)('routing.create'), routingController_1.createRouting);
router.put('/:id', (0, authMiddleware_1.requirePermission)('routing.edit'), routingController_1.updateRouting);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('routing.delete'), routingController_1.deleteRouting);
exports.default = router;
