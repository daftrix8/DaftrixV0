"use strict";
/**
 * Loyalty Routes (نظام الولاء)
 * =============================
 * API endpoints for loyalty program management and POS integration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const loyaltyController_1 = require("../controllers/loyaltyController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// ── Customer-facing (POS access) ────────────────────────────────────────────
// Get customer's loyalty balance + active program config
router.get('/balance/:customerId', (0, authMiddleware_1.requirePermission)('pos.access'), loyaltyController_1.getLoyaltyBalance);
// Get customer's dynamic loyalty tier
router.get('/customer/:customerId/tier', (0, authMiddleware_1.requirePermission)('pos.access'), loyaltyController_1.getCustomerTierAPI);
// Get customer's referral stats
router.get('/referral/stats/:customerId', (0, authMiddleware_1.requirePermission)('pos.access'), loyaltyController_1.getReferralStatsAPI);
// Preview earn + balance for a cart (called from payment modal)
router.post('/preview', (0, authMiddleware_1.requirePermission)('pos.access'), loyaltyController_1.previewLoyalty);
// Get customer's loyalty transaction history
router.get('/history/:customerId', (0, authMiddleware_1.requirePermission)('pos.access'), loyaltyController_1.getLoyaltyHistory);
// Get paginated customer directory with points
router.get('/customers', (0, authMiddleware_1.requirePermission)('pos.access'), loyaltyController_1.getLoyaltyCustomers);
// ── Admin (program management) ──────────────────────────────────────────────
// Dashboard overview with stats + leaderboard
router.get('/dashboard', (0, authMiddleware_1.requirePermission)('pos.manage'), loyaltyController_1.getLoyaltyDashboard);
// Settings
router.get('/settings', (0, authMiddleware_1.requirePermission)('pos.access'), loyaltyController_1.getLoyaltySettingsAPI);
router.put('/settings', (0, authMiddleware_1.requirePermission)('pos.manage'), loyaltyController_1.updateLoyaltySettingsAPI);
// Rules
router.get('/rules', (0, authMiddleware_1.requirePermission)('pos.access'), loyaltyController_1.getLoyaltyRules);
router.post('/rules', (0, authMiddleware_1.requirePermission)('pos.manage'), loyaltyController_1.createLoyaltyRule);
router.put('/rules/:id', (0, authMiddleware_1.requirePermission)('pos.manage'), loyaltyController_1.updateLoyaltyRule);
router.delete('/rules/:id', (0, authMiddleware_1.requirePermission)('pos.manage'), loyaltyController_1.deleteLoyaltyRule);
// Manual point adjustment (admin only)
router.post('/adjust', (0, authMiddleware_1.requirePermission)('pos.manage'), loyaltyController_1.adjustLoyaltyPoints);
// Fraud Alerts
router.get('/alerts', (0, authMiddleware_1.requirePermission)('pos.manage'), loyaltyController_1.getFraudAlerts);
router.delete('/alerts/:id', (0, authMiddleware_1.requirePermission)('pos.manage'), loyaltyController_1.dismissFraudAlert);
exports.default = router;
