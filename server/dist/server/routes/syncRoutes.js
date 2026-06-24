"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const syncController_1 = require("../controllers/syncController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const policyMiddleware_1 = require("../middleware/policyMiddleware");
const router = (0, express_1.Router)();
// Decode base64 payloads to bypass WAF character filters (ModSecurity)
const decodeBase64Payload = (req, res, next) => {
    if (req.body && typeof req.body === 'object' && req.body.encoded) {
        try {
            const decodedStr = Buffer.from(req.body.encoded, 'base64').toString('utf-8');
            req.body = JSON.parse(decodedStr);
        }
        catch (err) {
            console.error('❌ Failed to decode base64 sync payload:', err.message);
        }
    }
    next();
};
// SECURITY: authenticateToken MUST be applied here explicitly.
// Sync routes are mounted BEFORE the global auth middleware in index.ts (for timeout reasons),
// so the global authenticateToken does NOT apply to these routes.
// loadSystemConfig is also required — without it, req.systemConfig is undefined
// and features like updateCostFromPurchase silently skip.
router.use(authMiddleware_1.authenticateToken);
router.use(policyMiddleware_1.loadSystemConfig);
router.use(decodeBase64Payload);
// Sync transaction — permission checks are handled inside the controller
// based on the payload contents (invoices, journals, deletions, etc.)
// Lock date is checked against the invoice date in the payload
router.post('/transaction', (req, res, next) => {
    var _a, _b, _c, _d;
    // Diagnostic: confirms request reached Node.js (not blocked by WAF/proxy)
    const bodySize = JSON.stringify(req.body || {}).length;
    const lineCount = ((_c = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.invoice) === null || _b === void 0 ? void 0 : _b.lines) === null || _c === void 0 ? void 0 : _c.length) || 0;
    console.log(`📥 [SYNC] POST /transaction received — body: ${Math.round(bodySize / 1024)}KB, lines: ${lineCount}, user: ${((_d = req.user) === null || _d === void 0 ? void 0 : _d.username) || 'unknown'}`);
    next();
}, (0, policyMiddleware_1.enforceLockDate)(req => { var _a, _b; return (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.invoice) === null || _b === void 0 ? void 0 : _b.date; }), syncController_1.syncTransaction);
// Repair endpoint: creates missing journal entries for orphaned payment/receipt vouchers
// Use ?dryRun=true to preview without making changes
// Requires system.settings — this is an admin-only maintenance operation
router.post('/repair-orphaned-vouchers', (0, authMiddleware_1.requirePermission)('system.settings'), syncController_1.repairOrphanedVouchers);
exports.default = router;
