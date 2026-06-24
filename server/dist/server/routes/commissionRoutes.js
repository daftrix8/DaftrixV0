"use strict";
/**
 * Commission Routes (مسارات العمولات)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const commissionController_1 = require("../controllers/commissionController");
const router = express_1.default.Router();
// Apply auth middleware to all routes
router.use(authMiddleware_1.authenticateToken);
// =================== COMMISSION TIERS ===================
router.get('/tiers', (0, authMiddleware_1.requirePermission)('salesteam.commissions'), commissionController_1.getCommissionTiers);
router.post('/tiers', (0, authMiddleware_1.requirePermission)('salesteam.commissions'), commissionController_1.createCommissionTier);
router.put('/tiers/:id', (0, authMiddleware_1.requirePermission)('salesteam.commissions'), commissionController_1.updateCommissionTier);
router.delete('/tiers/:id', (0, authMiddleware_1.requirePermission)('salesteam.commissions'), commissionController_1.deleteCommissionTier);
// =================== COMMISSION RECORDS ===================
router.get('/records', (0, authMiddleware_1.requirePermission)('salesteam.commissions'), commissionController_1.getCommissionRecords);
router.get('/summary', (0, authMiddleware_1.requirePermission)('salesteam.commissions'), commissionController_1.getCommissionSummary);
router.post('/calculate', (0, authMiddleware_1.requirePermission)('salesteam.commissions'), commissionController_1.calculateCommission);
router.put('/records/:id/approve', (0, authMiddleware_1.requirePermission)('salesteam.commissions'), commissionController_1.approveCommission);
router.put('/records/:id/reject', (0, authMiddleware_1.requirePermission)('salesteam.commissions'), commissionController_1.rejectCommission);
router.put('/records/:id/paid', (0, authMiddleware_1.requirePermission)('salesteam.commissions'), commissionController_1.markCommissionPaid);
// =================== SALESMAN CUSTOMERS ===================
router.get('/customers', (0, authMiddleware_1.requirePermission)('salesteam.view'), commissionController_1.getSalesmanCustomers);
router.get('/customers/unassigned', (0, authMiddleware_1.requirePermission)('master.salesmen'), commissionController_1.getUnassignedCustomers);
router.post('/customers', (0, authMiddleware_1.requirePermission)('master.salesmen'), commissionController_1.assignCustomer);
router.post('/customers/bulk', (0, authMiddleware_1.requirePermission)('master.salesmen'), commissionController_1.bulkAssignCustomers);
router.delete('/customers/:id', (0, authMiddleware_1.requirePermission)('master.salesmen'), commissionController_1.unassignCustomer);
// =================== REPORTS ===================
router.get('/report/salesman', (0, authMiddleware_1.requirePermission)('salesteam.commissions'), commissionController_1.getSalesmanCommissionReport);
// =================== MEMBERSHIP COMMISSIONS ===================
router.get('/memberships', (0, authMiddleware_1.requirePermission)('salesteam.commissions'), commissionController_1.getMembershipCommissions);
router.post('/memberships/:id/pay', (0, authMiddleware_1.requirePermission)('salesteam.commissions'), commissionController_1.payMembershipCommission);
exports.default = router;
