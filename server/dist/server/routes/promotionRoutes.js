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
// ── POS-facing (cashier access) ─────────────────────────────────────────────
// Get active promotions for POS session cache
router.get('/active', (0, authMiddleware_1.requirePermission)('pos.access'), promotionController_1.getActivePromotions);
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
