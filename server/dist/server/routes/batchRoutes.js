"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const batchController_1 = require("../controllers/batchController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Batch Management
router.get('/', (0, authMiddleware_1.requirePermission)('inventory.view'), batchController_1.getBatches);
router.get('/near-expiry', (0, authMiddleware_1.requirePermission)('inventory.view'), batchController_1.getNearExpiryBatches);
router.get('/:id', (0, authMiddleware_1.requirePermission)('inventory.view'), batchController_1.getBatch);
router.post('/', (0, authMiddleware_1.requirePermission)('inventory.manage'), batchController_1.createBatch);
router.put('/:id', (0, authMiddleware_1.requirePermission)('inventory.manage'), batchController_1.updateBatch);
// Genealogy & Traceability
router.post('/genealogy', (0, authMiddleware_1.requirePermission)('inventory.manage'), batchController_1.recordGenealogy);
router.get('/:batchId/forward-trace', (0, authMiddleware_1.requirePermission)('inventory.view'), batchController_1.forwardTrace);
router.get('/:batchId/backward-trace', (0, authMiddleware_1.requirePermission)('inventory.view'), batchController_1.backwardTrace);
router.get('/:batchId/history', (0, authMiddleware_1.requirePermission)('inventory.view'), batchController_1.getBatchHistory);
exports.default = router;
