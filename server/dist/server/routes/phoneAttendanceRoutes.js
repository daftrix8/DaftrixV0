"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const phoneAttendanceController_1 = require("../controllers/phoneAttendanceController");
const phoneEnrollmentService_1 = require("../services/phoneEnrollmentService");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// ── Public Endpoint ───────────────────────────────────────────────────
// Phone self-enrollment via 6-digit code
router.post('/enroll', phoneAttendanceController_1.phoneEnroll);
// ── Phone-JWT Protected Endpoints ─────────────────────────────────────
// These endpoints require a valid employee phone-scoped JWT
router.post('/punch', phoneEnrollmentService_1.verifyPhoneToken, phoneAttendanceController_1.phonePunch);
router.get('/status', phoneEnrollmentService_1.verifyPhoneToken, phoneAttendanceController_1.phoneStatus);
// ── HR Admin Protected Endpoints (ERP Auth Required) ──────────────────
router.post('/generate-code', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requirePermission)('hr.smart_register.edit'), phoneAttendanceController_1.generateCode);
router.post('/bulk-generate', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requirePermission)('hr.smart_register.edit'), phoneAttendanceController_1.bulkGenerateCodes);
router.get('/enrolled', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requirePermission)('hr.smart_register.view'), phoneAttendanceController_1.listEnrolled);
router.post('/revoke', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requirePermission)('hr.smart_register.edit'), phoneAttendanceController_1.revokeEnrollment);
exports.default = router;
