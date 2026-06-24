"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const financialReportsController_1 = require("../controllers/financialReportsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// AR/AP Aging Reports
router.get('/ar-aging', (0, authMiddleware_1.requirePermission)('accounting.view'), financialReportsController_1.getAccountsReceivableAging);
router.get('/ap-aging', (0, authMiddleware_1.requirePermission)('accounting.view'), financialReportsController_1.getAccountsPayableAging);
// Cash Flow Statement
router.get('/cash-flow', (0, authMiddleware_1.requirePermission)('accounting.view'), financialReportsController_1.getCashFlowStatement);
// Statement of Accounts (per partner)
router.get('/statement-of-accounts', (0, authMiddleware_1.requirePermission)('accounting.view'), financialReportsController_1.getStatementOfAccounts);
// Financial Ratios
router.get('/financial-ratios', (0, authMiddleware_1.requirePermission)('accounting.view'), financialReportsController_1.getFinancialRatios);
exports.default = router;
