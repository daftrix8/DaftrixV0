"use strict";
/**
 * Bank Reconciliation Routes
 *
 * Endpoints for managing reconciliation state (cleared journal entries per bank account).
 * Mounted at /api/accounting/bank-reconciliation
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bankReconciliationController_1 = require("../controllers/bankReconciliationController");
const router = (0, express_1.Router)();
// GET cleared items for a bank account
router.get('/:bankAccountId', bankReconciliationController_1.getClearedItems);
// Toggle a single journal entry as cleared/uncleared
router.post('/:bankAccountId/toggle', bankReconciliationController_1.toggleClearedItem);
// Bulk set cleared IDs (for migration from localStorage)
router.put('/:bankAccountId/bulk', bankReconciliationController_1.bulkSetClearedItems);
exports.default = router;
