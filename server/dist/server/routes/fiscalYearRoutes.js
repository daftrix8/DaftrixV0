"use strict";
/**
 * Fiscal Year Routes
 * Public route for listing (login dropdown) + protected admin routes
 * Enhanced with preview, checklist, comparison, and period management
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fiscalYearController_1 = require("../controllers/fiscalYearController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Public route (no auth) — used on the login screen
router.get('/list', fiscalYearController_1.listFiscalYears);
// Year-over-year comparison (must be before /:id routes)
router.get('/comparison', (0, authMiddleware_1.requirePermission)('accounting.view'), fiscalYearController_1.getComparison);
// Period lock/unlock (must be before /:id routes)
router.post('/periods/:periodId/toggle-lock', (0, authMiddleware_1.requirePermission)('accounting.close_year'), fiscalYearController_1.togglePeriodLock);
// Protected routes (auth applied by parent middleware in index.ts)
router.get('/', (0, authMiddleware_1.requirePermission)('accounting.view'), fiscalYearController_1.getFiscalYears);
router.post('/', (0, authMiddleware_1.requirePermission)('accounting.close_year'), fiscalYearController_1.createFiscalYear);
router.put('/:id', (0, authMiddleware_1.requirePermission)('accounting.close_year'), fiscalYearController_1.updateFiscalYear);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('accounting.close_year'), fiscalYearController_1.deleteFiscalYear);
router.post('/:id/close', (0, authMiddleware_1.requirePermission)('accounting.close_year'), fiscalYearController_1.closeFiscalYear);
router.post('/:id/reopen', (0, authMiddleware_1.requirePermission)('accounting.close_year'), fiscalYearController_1.reopenFiscalYear);
router.get('/:id/preview', (0, authMiddleware_1.requirePermission)('accounting.view'), fiscalYearController_1.previewClose);
router.get('/:id/checklist', (0, authMiddleware_1.requirePermission)('accounting.view'), fiscalYearController_1.getClosingChecklist);
router.get('/:id/periods', (0, authMiddleware_1.requirePermission)('accounting.view'), fiscalYearController_1.getPeriodsForYear);
router.post('/:id/periods/generate', (0, authMiddleware_1.requirePermission)('accounting.close_year'), fiscalYearController_1.generatePeriodsForYear);
// Lock date management (Continuous Accounting)
router.get('/:id/lock-dates', (0, authMiddleware_1.requirePermission)('accounting.view'), fiscalYearController_1.getLockDates);
router.put('/:id/lock-dates', (0, authMiddleware_1.requirePermission)('accounting.close_year'), fiscalYearController_1.updateLockDates);
exports.default = router;
