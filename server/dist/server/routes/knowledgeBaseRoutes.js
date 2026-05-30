"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const knowledgeBaseController_1 = require("../controllers/knowledgeBaseController");
const router = express_1.default.Router();
// Read-only endpoints — any employee with kb.view (or crm.view fallback)
router.get('/articles', (0, authMiddleware_1.requirePermission)('kb.view'), knowledgeBaseController_1.getArticles);
router.get('/articles/:id', (0, authMiddleware_1.requirePermission)('kb.view'), knowledgeBaseController_1.getArticleById);
router.get('/categories', (0, authMiddleware_1.requirePermission)('kb.view'), knowledgeBaseController_1.getCategories);
router.get('/suggest', (0, authMiddleware_1.requirePermission)('kb.view'), knowledgeBaseController_1.suggestArticles);
// Admin-only CRUD
router.post('/articles', (0, authMiddleware_1.requirePermission)('kb.manage'), knowledgeBaseController_1.createArticle);
router.put('/articles/:id', (0, authMiddleware_1.requirePermission)('kb.manage'), knowledgeBaseController_1.updateArticle);
router.delete('/articles/:id', (0, authMiddleware_1.requirePermission)('kb.manage'), knowledgeBaseController_1.deleteArticle);
exports.default = router;
