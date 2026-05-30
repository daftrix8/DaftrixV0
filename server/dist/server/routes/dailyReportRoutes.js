"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dailyReportController_1 = require("../controllers/dailyReportController");
const router = (0, express_1.Router)();
// GET /api/reports/daily-branch?date=YYYY-MM-DD
router.get('/daily-branch', dailyReportController_1.getDailyBranchReport);
exports.default = router;
