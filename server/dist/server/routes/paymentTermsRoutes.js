"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const paymentTermsController_1 = require("../controllers/paymentTermsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Payment Terms Templates
router.get('/payment-terms', (0, authMiddleware_1.requirePermission)('accounting.view'), paymentTermsController_1.getPaymentTermsTemplates);
router.post('/payment-terms', (0, authMiddleware_1.requirePermission)('accounting.manage'), paymentTermsController_1.createPaymentTermsTemplate);
router.put('/payment-terms/:id', (0, authMiddleware_1.requirePermission)('accounting.manage'), paymentTermsController_1.updatePaymentTermsTemplate);
router.delete('/payment-terms/:id', (0, authMiddleware_1.requirePermission)('accounting.manage'), paymentTermsController_1.deletePaymentTermsTemplate);
// Payment Schedule (per invoice)
router.get('/payment-schedule/:invoiceId', (0, authMiddleware_1.requirePermission)('accounting.view'), paymentTermsController_1.getPaymentSchedule);
router.post('/payment-schedule/generate', (0, authMiddleware_1.requirePermission)('accounting.manage'), paymentTermsController_1.generatePaymentSchedule);
// Credit Limit Check
router.post('/credit-limit/check', (0, authMiddleware_1.requirePermission)('invoices.create'), paymentTermsController_1.checkCreditLimit);
// Terms & Conditions
router.get('/terms-conditions', (0, authMiddleware_1.requirePermission)('settings.view'), paymentTermsController_1.getTermsAndConditions);
router.post('/terms-conditions', (0, authMiddleware_1.requirePermission)('settings.manage'), paymentTermsController_1.createTermsAndConditions);
router.put('/terms-conditions/:id', (0, authMiddleware_1.requirePermission)('settings.manage'), paymentTermsController_1.updateTermsAndConditions);
router.delete('/terms-conditions/:id', (0, authMiddleware_1.requirePermission)('settings.manage'), paymentTermsController_1.deleteTermsAndConditions);
exports.default = router;
