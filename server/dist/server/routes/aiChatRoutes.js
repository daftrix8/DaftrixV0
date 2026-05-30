"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const aiChatController_1 = require("../controllers/aiChatController");
const aiKnowledgeController_1 = require("../controllers/aiKnowledgeController");
const requestTimeout_1 = require("../middleware/requestTimeout");
const router = (0, express_1.Router)();
// POST /api/ai-chat — Send a message to the AI assistant (90s timeout for slow models like Gemma)
router.post('/', (0, requestTimeout_1.requestTimeout)(90000), aiChatController_1.handleAIChat);
// GET /api/ai-chat/history — Get chat history for current user
router.get('/history', aiChatController_1.getChatHistory);
// GET /api/ai-chat/suggestions — Get suggested questions
router.get('/suggestions', aiChatController_1.getSuggestedQuestions);
// GET /api/ai-chat/pulse — Proactive business pulse (urgent alerts)
router.get('/pulse', aiChatController_1.getBusinessPulse);
// POST /api/ai-chat/feedback — Rate AI response quality (positive/negative/corrected)
router.post('/feedback', aiChatController_1.handleAIFeedback);
// GET /api/ai-chat/usage-stats — Token consumption & performance analytics (Admin)
router.get('/usage-stats', aiChatController_1.handleAIUsageStats);
// GET /api/ai-chat/sessions — View active conversation sessions
router.get('/sessions', aiChatController_1.handleAISessions);
// ── Phase 2: Agentic Actions ────────────────────────────
// POST /api/ai-chat/execute-action — Execute a confirmed AI action (e.g., create receipt)
router.post('/execute-action', (0, requestTimeout_1.requestTimeout)(30000), aiChatController_1.handleExecuteAction);
// GET /api/ai-chat/actions — List available actions for current user role
router.get('/actions', aiChatController_1.handleListActions);
// ── Phase 4: Enterprise Intelligence ─────────────────────
// GET /api/ai-chat/daily-brief — Executive AI-powered daily/weekly business summary
router.get('/daily-brief', (0, requestTimeout_1.requestTimeout)(30000), aiChatController_1.handleDailyBrief);
// ── Phase 3: Knowledge Base (RAG) ────────────────────────
// CRUD for company knowledge articles (policies, SOPs, FAQs)
router.get('/knowledge/categories', aiKnowledgeController_1.handleKnowledgeCategories);
router.post('/knowledge/seed', aiKnowledgeController_1.handleSeedKnowledge);
router.get('/knowledge/:id', aiKnowledgeController_1.handleGetKnowledge);
router.get('/knowledge', aiKnowledgeController_1.handleListKnowledge);
router.post('/knowledge', aiKnowledgeController_1.handleCreateKnowledge);
router.put('/knowledge/:id', aiKnowledgeController_1.handleUpdateKnowledge);
router.delete('/knowledge/:id', aiKnowledgeController_1.handleDeleteKnowledge);
exports.default = router;
