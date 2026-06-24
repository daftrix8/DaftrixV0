"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const memberships_1 = require("../controllers/memberships");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Public endpoint for customer virtual card (unauthenticated)
router.get('/public/:id', memberships_1.getPublicMembershipCard);
// Secure all membership routes
router.use(authMiddleware_1.authenticateToken);
// Settings — MUST be before /:id to avoid being caught by the wildcard
router.get('/settings/config', memberships_1.getMembershipSettings);
router.post('/settings/config', memberships_1.updateMembershipSettings);
// Packages — MUST be before /:id
router.get('/packages', memberships_1.getMembershipPackages);
router.post('/packages', memberships_1.createMembershipPackage);
router.put('/packages/:id', memberships_1.updateMembershipPackage);
router.delete('/packages/:id', memberships_1.deleteMembershipPackage);
// Freezes list — MUST be before /:id
router.get('/freezes', memberships_1.getMembershipFreezes);
// Memberships (/:id is a wildcard — keep these LAST)
router.get('/', memberships_1.getMemberships);
router.post('/', memberships_1.createMembership);
router.get('/:id', memberships_1.getMembershipById);
router.put('/:id', memberships_1.updateMembership);
router.delete('/:id', memberships_1.deleteMembership);
// Membership Actions
router.post('/:id/renew', memberships_1.renewMembership);
router.post('/:id/freeze', memberships_1.freezeMembership);
router.post('/:id/unfreeze', memberships_1.unfreezeMembership);
router.post('/:id/toggle-suspension', memberships_1.toggleMembershipSuspension);
router.post('/:id/mark-paid', memberships_1.markMembershipPaid);
exports.default = router;
