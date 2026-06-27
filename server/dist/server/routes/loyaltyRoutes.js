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
// Middleware to allow POS access OR customer self-access
const requireCustomerOrPosAccess = (req, res, next) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ message: 'Unauthorized: Authentication required' });
    }
    // Admin override check (Arabic-safe and case-insensitive)
    const ADMIN_ROLES = ['ADMIN', 'MASTER_ADMIN', 'GENERAL_MANAGER', 'MANAGER', 'المدير', 'المدير العام', 'مسئول النظام'];
    const isAdmin = ADMIN_ROLES.some(role => { var _a; return role.trim().toUpperCase() === ((_a = user.role) === null || _a === void 0 ? void 0 : _a.trim().toUpperCase()); }) || (user.permissions && user.permissions.includes('all'));
    if (isAdmin) {
        return next();
    }
    // POS permission check
    if (user.permissions && user.permissions.includes('pos.access')) {
        return next();
    }
    // Customer self-access check
    const { customerId } = req.params;
    if (user.role === 'CUSTOMER' && user.partnerId && customerId && user.partnerId === customerId) {
        return next();
    }
    return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
};
// ── Customer-facing (POS access) ────────────────────────────────────────────
// Get customer's loyalty balance + active program config
router.get('/balance/:customerId', authMiddleware_1.authenticateToken, requireCustomerOrPosAccess, loyaltyController_1.getLoyaltyBalance);
// Get customer's dynamic loyalty tier
router.get('/customer/:customerId/tier', authMiddleware_1.authenticateToken, requireCustomerOrPosAccess, loyaltyController_1.getCustomerTierAPI);
// Get customer's referral stats
router.get('/referral/stats/:customerId', authMiddleware_1.authenticateToken, requireCustomerOrPosAccess, loyaltyController_1.getReferralStatsAPI);
// Preview earn + balance for a cart (called from payment modal)
router.post('/preview', (0, authMiddleware_1.requirePermission)('pos.access'), loyaltyController_1.previewLoyalty);
// Get customer's loyalty transaction history
router.get('/history/:customerId', authMiddleware_1.authenticateToken, requireCustomerOrPosAccess, loyaltyController_1.getLoyaltyHistory);
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
