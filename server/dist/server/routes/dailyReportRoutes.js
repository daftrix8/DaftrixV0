"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dailyReportController_1 = require("../controllers/dailyReportController");
const warrantyReportController_1 = require("../controllers/warrantyReportController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// GET /api/reports/daily-branch?date=YYYY-MM-DD
router.get('/daily-branch', (0, authMiddleware_1.requireAnyPermission)(['treasury.branch_report.view', 'treasury.view', 'reports.financial']), dailyReportController_1.getDailyBranchReport);
// GET /api/reports/branch-profitability?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=optional
router.get('/branch-profitability', (0, authMiddleware_1.requireAnyPermission)(['treasury.branch_profit.view', 'treasury.view', 'reports.financial']), dailyReportController_1.getBranchProfitability);
// GET /api/reports/warranty
router.get('/warranty', (0, authMiddleware_1.requireAnyPermission)(['reports.view', 'reports.all', 'reports.invoice_reports', 'reports.sales']), warrantyReportController_1.getWarrantyReport);
exports.default = router;
