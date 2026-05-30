"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const accountController_1 = require("../controllers/accountController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const responseCache_1 = require("../middleware/responseCache");
const router = (0, express_1.Router)();
// GET / — chart of accounts list stays open: needed for journal form dropdowns by any role
// PERF: Cache for 60s, auto-invalidated on entity:changed for 'accounts'
router.get('/', (0, responseCache_1.responseCache)('accounts'), accountController_1.getAccounts);
// Financial reports — require accounting.view. Profit reports also require reports.financial.
router.get('/reports/ledger', (0, authMiddleware_1.requirePermission)('accounting.view'), accountController_1.getAccountsLedger);
router.get('/reports/balances', (0, authMiddleware_1.requirePermission)('accounting.view'), accountController_1.getAccountBalances);
router.get('/reports/monthly-profit', (0, authMiddleware_1.requirePermission)('reports.financial'), accountController_1.getMonthlyProfit);
router.get('/reports/profit-analysis', (0, authMiddleware_1.requirePermission)('reports.financial'), accountController_1.getProfitAnalysis);
router.get('/treasury-opening-balance', (0, authMiddleware_1.requirePermission)('treasury.view'), accountController_1.getTreasuryOpeningBalance);
// Mutations require permission
router.post('/', (0, authMiddleware_1.requirePermission)('accounting.manage'), accountController_1.createAccount);
router.post('/recalculate-balances', (0, authMiddleware_1.requirePermission)('system.settings'), accountController_1.recalculateAccountBalances);
router.put('/:id', (0, authMiddleware_1.requirePermission)('accounting.manage'), accountController_1.updateAccount);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('accounting.manage'), accountController_1.deleteAccount);
exports.default = router;
