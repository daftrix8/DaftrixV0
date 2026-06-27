"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const treasuryController_1 = require("../controllers/treasuryController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const policyMiddleware_1 = require("../middleware/policyMiddleware");
const router = express_1.default.Router();
// Receipts (for mobile app) — enforce lock date
router.post('/receipts', (0, authMiddleware_1.requirePermission)('treasury.receipt'), (0, policyMiddleware_1.enforceLockDate)(), treasuryController_1.createReceipt);
// Banks — GET open (needed for payment method dropdowns), mutations require permission
router.get('/banks', treasuryController_1.getBanks);
router.post('/banks', (0, authMiddleware_1.requirePermission)('treasury.manage'), treasuryController_1.createBank);
router.post('/banks/reorder', (0, authMiddleware_1.requirePermission)('treasury.manage'), treasuryController_1.reorderBanks);
router.post('/banks/recalculate', (0, authMiddleware_1.requirePermission)('system.settings'), treasuryController_1.recalculateBankBalances);
router.post('/cleanup-accounts', (0, authMiddleware_1.requirePermission)('system.settings'), treasuryController_1.cleanupDuplicateBankAccounts);
router.put('/banks/:id', (0, authMiddleware_1.requirePermission)('treasury.manage'), treasuryController_1.updateBank);
router.post('/banks/:id/resync', (0, authMiddleware_1.requirePermission)('treasury.manage'), treasuryController_1.resyncBankGL);
router.delete('/banks/:id', (0, authMiddleware_1.requirePermission)('treasury.manage'), treasuryController_1.deleteBank);
// Cheques — require specific permission
router.get('/cheques', (0, authMiddleware_1.requirePermission)('treasury.cheques'), treasuryController_1.getCheques);
router.put('/cheques/:id', (0, authMiddleware_1.requirePermission)('treasury.cheques'), treasuryController_1.updateCheque);
exports.default = router;
