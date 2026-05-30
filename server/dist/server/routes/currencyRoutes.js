"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const currencyController_1 = require("../controllers/currencyController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// ============================================================
// EXCHANGE RATES (must be before /:code to avoid matching 'rates' as a code)
// ============================================================
router.get('/rates', currencyController_1.getExchangeRates);
router.get('/rates/latest', currencyController_1.getLatestRate);
router.post('/rates', (0, authMiddleware_1.requirePermission)('treasury.currency'), currencyController_1.createExchangeRate);
router.post('/rates/fetch-live', (0, authMiddleware_1.requirePermission)('treasury.currency'), currencyController_1.fetchLiveRates);
// ============================================================
// CURRENCY CONVERSION
// ============================================================
router.get('/convert', (0, authMiddleware_1.requirePermission)('treasury.currency'), currencyController_1.convertAmount);
// ============================================================
// CURRENCY TRANSACTIONS
// ============================================================
router.get('/transactions', (0, authMiddleware_1.requirePermission)('treasury.currency'), currencyController_1.getCurrencyTransactions);
router.post('/transactions', (0, authMiddleware_1.requirePermission)('treasury.currency'), currencyController_1.createCurrencyTransaction);
// ============================================================
// CURRENCIES (wildcard :code must be last)
// ============================================================
router.get('/', currencyController_1.getCurrencies);
router.post('/', (0, authMiddleware_1.requirePermission)('treasury.currency'), currencyController_1.createCurrency);
router.get('/:code', (0, authMiddleware_1.requirePermission)('treasury.currency'), currencyController_1.getCurrency);
router.put('/:code', (0, authMiddleware_1.requirePermission)('treasury.currency'), currencyController_1.updateCurrency);
router.delete('/:code', (0, authMiddleware_1.requirePermission)('treasury.currency'), currencyController_1.deleteCurrency);
exports.default = router;
