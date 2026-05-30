"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const journalController_1 = require("../controllers/journalController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const policyMiddleware_1 = require("../middleware/policyMiddleware");
const router = (0, express_1.Router)();
router.get('/', (0, authMiddleware_1.requirePermission)('accounting.journal'), journalController_1.getJournalEntries);
router.post('/', (0, authMiddleware_1.requirePermission)('accounting.journal_entry'), (0, policyMiddleware_1.enforceLockDate)(), journalController_1.createJournalEntry);
router.put('/:id', (0, authMiddleware_1.requirePermission)('accounting.journal'), (0, policyMiddleware_1.enforceLockDate)(), journalController_1.updateJournalEntry);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('accounting.journal'), journalController_1.deleteJournalEntry);
router.post('/:id/reverse', (0, authMiddleware_1.requirePermission)('accounting.journal'), (0, policyMiddleware_1.enforceLockDate)(), journalController_1.reverseJournalEntry);
// Orphaned voucher cleanup (GET = preview, DELETE = execute)
router.get('/cleanup/orphaned-vouchers', (0, authMiddleware_1.requirePermission)('accounting.manage'), journalController_1.cleanupOrphanedVouchers);
router.delete('/cleanup/orphaned-vouchers', (0, authMiddleware_1.requirePermission)('accounting.manage'), journalController_1.cleanupOrphanedVouchers);
exports.default = router;
