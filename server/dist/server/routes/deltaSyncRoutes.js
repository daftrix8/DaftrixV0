"use strict";
/**
 * Delta Sync Routes
 * =================
 * API routes for mobile delta synchronization
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const policyMiddleware_1 = require("../middleware/policyMiddleware");
const deltaSyncController_1 = require("../controllers/deltaSyncController");
const router = (0, express_1.Router)();
// Health check (no auth required)
router.get('/health', deltaSyncController_1.healthCheck);
// Apply auth and policy middlewares to all endpoints below
router.use(authMiddleware_1.authenticateToken);
router.use(policyMiddleware_1.loadSystemConfig);
// Sync status (auth required)
router.get('/sync/status', deltaSyncController_1.getSyncStatus);
router.get('/sync/status/enhanced', deltaSyncController_1.getEnhancedSyncStatus);
// Core delta sync endpoints
router.get('/products/delta', deltaSyncController_1.getProductsDelta);
router.get('/partners/delta', deltaSyncController_1.getPartnersDelta);
router.get('/invoices/delta', deltaSyncController_1.getInvoicesDelta);
router.get('/vehicles/delta', deltaSyncController_1.getVehiclesDelta);
// New delta sync endpoints for enhanced offline support
router.get('/payments/delta', deltaSyncController_1.getPaymentsDelta);
router.get('/price-lists/delta', deltaSyncController_1.getPriceListsDelta);
router.get('/price-list-items/delta', deltaSyncController_1.getPriceListItemsDelta);
router.get('/stock-movements/delta', deltaSyncController_1.getStockMovementsDelta);
router.get('/settings/delta', deltaSyncController_1.getSettingsDelta);
exports.default = router;
