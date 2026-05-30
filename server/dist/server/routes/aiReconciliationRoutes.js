"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const aiReconciliationController_1 = require("../controllers/aiReconciliationController");
const router = (0, express_1.Router)();
// POST /api/ai-reconciliation
router.post('/', aiReconciliationController_1.reconcileStatement);
exports.default = router;
