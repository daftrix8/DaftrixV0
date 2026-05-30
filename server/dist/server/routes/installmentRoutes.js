"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const installmentController_1 = require("../controllers/installmentController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const policyMiddleware_1 = require("../middleware/policyMiddleware");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(authMiddleware_1.authenticateToken);
// Dashboard / Stats
router.get('/stats', (0, authMiddleware_1.requirePermission)('treasury.installments'), installmentController_1.getInstallmentStats);
router.get('/overdue', (0, authMiddleware_1.requirePermission)('treasury.installments'), installmentController_1.getOverdueInstallments);
router.get('/upcoming', (0, authMiddleware_1.requirePermission)('treasury.installments'), installmentController_1.getUpcomingInstallments);
// Installment Plans CRUD
router.get('/plans', (0, authMiddleware_1.requirePermission)('treasury.installments'), installmentController_1.getInstallmentPlans);
router.get('/plans/:id', (0, authMiddleware_1.requirePermission)('treasury.installments'), installmentController_1.getInstallmentPlan);
router.post('/plans', (0, authMiddleware_1.requirePermission)('treasury.installments'), (0, policyMiddleware_1.enforceLockDate)(), installmentController_1.createInstallmentPlan);
router.put('/plans/:id/cancel', (0, authMiddleware_1.requirePermission)('treasury.installments'), installmentController_1.cancelInstallmentPlan);
// Partner-specific
router.get('/partner/:partnerId', (0, authMiddleware_1.requirePermission)('treasury.installments'), installmentController_1.getPartnerInstallments);
// Individual installment payment
router.post('/pay/:id', (0, authMiddleware_1.requirePermission)('treasury.installments'), (0, policyMiddleware_1.enforceLockDate)(), installmentController_1.payInstallment);
exports.default = router;
