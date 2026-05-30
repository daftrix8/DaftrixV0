"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const qualityController_1 = require("../controllers/qualityController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// QC Templates
router.get('/templates', (0, authMiddleware_1.requirePermission)('quality.templates'), qualityController_1.getQCTemplates);
router.get('/templates/:id', (0, authMiddleware_1.requirePermission)('quality.templates'), qualityController_1.getQCTemplate);
router.post('/templates', (0, authMiddleware_1.requirePermission)('quality.templates'), qualityController_1.createQCTemplate);
router.put('/templates/:id', (0, authMiddleware_1.requirePermission)('quality.templates'), qualityController_1.updateQCTemplate);
router.delete('/templates/:id', (0, authMiddleware_1.requirePermission)('quality.templates'), qualityController_1.deleteQCTemplate);
// Quality Checks
router.get('/checks', (0, authMiddleware_1.requirePermission)('quality.view'), qualityController_1.getQualityChecks);
router.get('/checks/:id', (0, authMiddleware_1.requirePermission)('quality.view'), qualityController_1.getQualityCheck);
router.post('/checks', (0, authMiddleware_1.requirePermission)('quality.create'), qualityController_1.createQualityCheck);
router.put('/checks/:id/complete', (0, authMiddleware_1.requirePermission)('quality.approve'), qualityController_1.completeQualityCheck);
router.delete('/checks/:id', (0, authMiddleware_1.requirePermission)('quality.approve'), qualityController_1.deleteQualityCheck);
// Statistics
router.get('/stats', (0, authMiddleware_1.requirePermission)('quality.reports'), qualityController_1.getQualityStats);
exports.default = router;
