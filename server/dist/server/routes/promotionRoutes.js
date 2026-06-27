"use strict";
/**
 * Promotion Routes (محرك العروض والخصومات)
 * ═════════════════════════════════════════
 * API endpoints for promotion management and POS evaluation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const promotionController_1 = require("../controllers/promotionController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
const requireCustomerOrPosAccess = (req, res, next) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ message: 'Unauthorized: Authentication required' });
    }
    const ADMIN_ROLES = ['ADMIN', 'MASTER_ADMIN', 'GENERAL_MANAGER', 'MANAGER', 'المدير', 'المدير العام', 'مسئول النظام'];
    const isAdmin = ADMIN_ROLES.some(role => { var _a; return role.trim().toUpperCase() === ((_a = user.role) === null || _a === void 0 ? void 0 : _a.trim().toUpperCase()); }) || (user.permissions && user.permissions.includes('all'));
    if (isAdmin || user.role === 'CUSTOMER' || (user.permissions && user.permissions.includes('pos.access'))) {
        return next();
    }
    return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
};
// ── POS-facing (cashier access) ─────────────────────────────────────────────
// Get active promotions for POS session cache
router.get('/active', authMiddleware_1.authenticateToken, requireCustomerOrPosAccess, promotionController_1.getActivePromotions);
// Evaluate cart against promotions (called on cart change, debounced)
router.post('/evaluate', (0, authMiddleware_1.requirePermission)('pos.access'), promotionController_1.evaluateCart);
// Validate a coupon code
router.post('/validate-coupon', (0, authMiddleware_1.requirePermission)('pos.access'), promotionController_1.validateCoupon);
// ── Admin (promotion management) ────────────────────────────────────────────
// List all promotions (including archived)
router.get('/', (0, authMiddleware_1.requirePermission)('pos.manage'), promotionController_1.getPromotions);
// Create a new promotion with rules
router.post('/', (0, authMiddleware_1.requirePermission)('pos.manage'), promotionController_1.createPromotion);
// Update a promotion (and optionally replace rules)
router.put('/:id', (0, authMiddleware_1.requirePermission)('pos.manage'), promotionController_1.updatePromotion);
// Archive a promotion (soft delete)
router.delete('/:id', (0, authMiddleware_1.requirePermission)('pos.manage'), promotionController_1.archivePromotion);
// Promotion usage report
router.get('/report', (0, authMiddleware_1.requirePermission)('pos.manage'), promotionController_1.getPromotionReport);
exports.default = router;
