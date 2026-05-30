"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const scrapController_1 = require("../controllers/scrapController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Get all scrap records (with filters)
router.get('/', (0, authMiddleware_1.requirePermission)('scrap.view'), scrapController_1.getScrap);
// Get scrap statistics
router.get('/stats', (0, authMiddleware_1.requirePermission)('scrap.reports'), scrapController_1.getScrapStats);
// Create scrap record
router.post('/', (0, authMiddleware_1.requirePermission)('scrap.create'), scrapController_1.createScrap);
// Update scrap disposal status
router.patch('/:id/disposal', (0, authMiddleware_1.requirePermission)('scrap.approve'), scrapController_1.updateScrapDisposal);
// Delete scrap record
router.delete('/:id', (0, authMiddleware_1.requirePermission)('scrap.approve'), scrapController_1.deleteScrap);
exports.default = router;
