"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const hrController_1 = require("../controllers/hrController");
const fingerprintController_1 = require("../controllers/fingerprintController");
const hrDocumentsController_1 = require("../controllers/hrDocumentsController");
const smartAttendanceController_1 = require("../controllers/smartAttendanceController");
const trainingController_1 = require("../controllers/trainingController");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const authMiddleware_1 = require("../middleware/authMiddleware");
// ── Multer setup for HR document file attachments ──────────────────
const hrDocsUploadDir = path_1.default.join(process.cwd(), 'uploads', 'hr-docs');
if (!fs_1.default.existsSync(hrDocsUploadDir))
    fs_1.default.mkdirSync(hrDocsUploadDir, { recursive: true });
const hrDocsStorage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, hrDocsUploadDir),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
});
const hrDocsUpload = (0, multer_1.default)({
    storage: hrDocsStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        cb(null, allowed.includes(file.mimetype));
    },
});
// ── Multer setup for Employee Avatars ────────────────────────────────
const empAvatarDir = path_1.default.join(process.cwd(), 'uploads', 'employees');
if (!fs_1.default.existsSync(empAvatarDir))
    fs_1.default.mkdirSync(empAvatarDir, { recursive: true });
const empAvatarStorage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, empAvatarDir),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        cb(null, `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
});
const empAvatarUpload = (0, multer_1.default)({
    storage: empAvatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Only images are allowed (JPEG, PNG, WEBP)'));
        }
    },
});
const router = express_1.default.Router();
// Employees
router.get('/employees', (0, authMiddleware_1.requirePermission)('hr.view'), hrController_1.getEmployees);
router.post('/employees', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.createEmployee);
router.put('/employees/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.updateEmployee);
router.delete('/employees/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.deleteEmployee);
router.post('/employees/:id/avatar', (0, authMiddleware_1.requirePermission)('hr.manage'), empAvatarUpload.single('avatar'), hrController_1.uploadEmployeeAvatar);
// Attendance
router.get('/attendance', (0, authMiddleware_1.requirePermission)('hr.attendance'), hrController_1.getAttendance);
router.post('/attendance', (0, authMiddleware_1.requirePermission)('hr.attendance'), hrController_1.recordAttendance);
// Payroll
router.get('/payroll', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.getPayrollCycles);
router.get('/payroll/:id', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.getPayrollCycle);
router.post('/payroll', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.createPayrollCycle);
router.get('/payroll/:payrollId/entries', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.getPayrollEntries);
router.delete('/payroll/:id', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.deletePayrollCycle);
router.post('/payroll/:id/calculate', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.calculatePayroll);
router.post('/payroll/:id/approve', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.approvePayroll);
router.put('/payroll/entry/:entryId', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.updatePayrollEntry);
// Advances / Loans
router.get('/advances', (0, authMiddleware_1.requirePermission)('hr.advances'), hrController_1.getAdvances);
router.post('/advances', (0, authMiddleware_1.requirePermission)('hr.advances'), hrController_1.createAdvance);
router.put('/advances/:id', (0, authMiddleware_1.requirePermission)('hr.advances'), hrController_1.updateAdvance);
router.delete('/advances/:id', (0, authMiddleware_1.requirePermission)('hr.advances'), hrController_1.deleteAdvance);
// Smart Loans (New)
router.post('/loans/check-eligibility', (0, authMiddleware_1.requirePermission)('hr.advances'), hrController_1.checkLoanEligibility);
router.post('/loans', (0, authMiddleware_1.requirePermission)('hr.advances'), hrController_1.createLoanWithInstallments);
router.get('/loans/:loanId/installments', (0, authMiddleware_1.requirePermission)('hr.advances'), hrController_1.getLoanInstallments);
router.get('/employees/:employeeId/loan-installments', (0, authMiddleware_1.requirePermission)('hr.advances'), hrController_1.getEmployeeLoanInstallments);
router.post('/loans/installments/:installmentId/skip', (0, authMiddleware_1.requirePermission)('hr.advances'), hrController_1.skipLoanInstallment);
router.post('/loans/:loanId/settle', (0, authMiddleware_1.requirePermission)('hr.advances'), hrController_1.settleLoanEarly);
router.post('/loans/:loanId/repay', (0, authMiddleware_1.requirePermission)('hr.advances'), hrController_1.repayLoan);
router.get('/loans/constraints', (0, authMiddleware_1.requirePermission)('hr.advances'), hrController_1.getLoanConstraints);
router.get('/loans/:loanId/history', (0, authMiddleware_1.requirePermission)('hr.advances'), hrController_1.getLoanHistory);
// Payroll Templates (Allowances/Deductions)
router.get('/templates', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.getPayrollTemplates);
router.post('/templates', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.createPayrollTemplate);
router.put('/templates/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.updatePayrollTemplate);
router.delete('/templates/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.deletePayrollTemplate);
// Employee-Template Assignments
router.get('/employees/:employeeId/templates', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.getEmployeeTemplates);
router.post('/employees/templates', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.assignTemplateToEmployee);
router.put('/employees/templates/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.updateEmployeeTemplate);
router.delete('/employees/:employeeId/templates/:templateId', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.removeEmployeeTemplate);
// Leave Types (أنواع الإجازات)
router.get('/leave-types', (0, authMiddleware_1.requirePermission)('hr.leave'), hrController_1.getLeaveTypes);
router.post('/leave-types', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.createLeaveType);
router.put('/leave-types/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.updateLeaveType);
router.delete('/leave-types/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.deleteLeaveType);
// Leave Balances (أرصدة الإجازات)
router.get('/leave-balances', (0, authMiddleware_1.requirePermission)('hr.leave'), hrController_1.getLeaveBalances);
router.post('/leave-balances/initialize', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.initializeLeaveBalances);
router.put('/leave-balances/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.updateLeaveBalance);
// Leave Requests (طلبات الإجازات)
router.get('/leave-requests', (0, authMiddleware_1.requirePermission)('hr.leave'), hrController_1.getLeaveRequests);
router.post('/leave-requests', (0, authMiddleware_1.requirePermission)('hr.leave'), hrController_1.createLeaveRequest);
router.post('/leave-requests/:id/approve', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.approveLeaveRequest);
router.post('/leave-requests/:id/reject', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.rejectLeaveRequest);
router.post('/leave-requests/:id/cancel', (0, authMiddleware_1.requirePermission)('hr.leave'), hrController_1.cancelLeaveRequest);
router.delete('/leave-requests/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.deleteLeaveRequest);
// Salary Components & Structure (Phase 2 - Formula-Based Payroll)
router.get('/salary-components', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.getSalaryComponents);
router.post('/salary-components', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.createSalaryComponent);
router.put('/salary-components/:id', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.updateSalaryComponent);
router.delete('/salary-components/:id', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.deleteSalaryComponent);
router.get('/employees/:employeeId/salary-structure', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.getEmployeeSalaryStructure);
router.post('/employees/:employeeId/salary-structure', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.setEmployeeSalaryComponent);
router.post('/employees/:employeeId/salary-structure/migrate', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.migrateEmployeeSalaryStructure);
router.post('/payroll/:employeeId/preview', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.calculatePayrollPreview);
// Tax & Insurance Configuration
router.get('/tax-brackets', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.getTaxBrackets);
router.post('/tax/calculate', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.calculateTaxPreview);
router.get('/insurance-config', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.getInsuranceConfig);
// Retroactive Adjustments (Phase 2)
router.post('/employees/:employeeId/retroactive/calculate', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.calculateRetroactiveAdjustment);
router.post('/retroactive-adjustments', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.createRetroactiveAdjustment);
router.get('/employees/:employeeId/adjustments/pending', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.getPendingAdjustments);
router.post('/adjustments/:adjustmentId/approve', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.approveAdjustment);
router.post('/adjustments/:adjustmentId/apply', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.applyAdjustmentToPayroll);
// Treasury Verification (Phase 2)
router.get('/payroll/:cycleId/preflight', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.preflightPayrollApproval);
router.get('/treasury/balance', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.getTreasuryBalance);
router.get('/payroll/:cycleId/verify-treasury', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.verifyTreasuryForPayroll);
// ==========================================
// Beast Mode: Salary Structure Templates
// ==========================================
router.get('/structure-templates', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.getStructureTemplates);
router.get('/structure-templates/:id', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.getStructureTemplate);
router.post('/structure-templates', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.createStructureTemplate);
router.put('/structure-templates/:id', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.updateStructureTemplate);
router.delete('/structure-templates/:id', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.deleteStructureTemplate);
router.post('/structure-templates/:templateId/lines', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.addStructureLine);
router.put('/structure-lines/:lineId', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.updateStructureLine);
router.delete('/structure-lines/:lineId', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.deleteStructureLine);
router.get('/employees/:employeeId/structure-assignment', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.getEmployeeStructureAssignment);
router.get('/structure-templates/:templateId/assignments', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.getTemplateAssignments);
router.post('/structure-assignments', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.assignStructureToEmployee);
router.delete('/structure-assignments/:assignmentId', (0, authMiddleware_1.requirePermission)('hr.salary_structures'), hrController_1.removeStructureAssignment);
// ==========================================
// Beast Mode: Work Entries
// ==========================================
router.get('/work-entry-types', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.getWorkEntryTypes);
router.post('/work-entry-types', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.createWorkEntryType);
router.get('/work-entries', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.getWorkEntries);
router.post('/work-entries', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.upsertWorkEntry);
router.put('/work-entries/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.updateWorkEntry);
router.delete('/work-entries/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.deleteWorkEntry);
router.post('/work-entries/generate', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.generateWorkEntries);
router.post('/work-entries/validate', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.validateWorkEntries);
router.post('/work-entries/:id/resolve-conflict', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.resolveWorkEntryConflict);
router.get('/work-entries/summary', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.getWorkEntrySummary);
// ==========================================
// Beast Mode: Additional Salary
// ==========================================
router.get('/additional-salary', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.getAdditionalSalaryEntries);
router.post('/additional-salary', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.createAdditionalSalary);
router.put('/additional-salary/:id', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.updateAdditionalSalary);
router.delete('/additional-salary/:id', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.deleteAdditionalSalary);
router.post('/additional-salary/:id/approve', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.approveAdditionalSalary);
router.post('/additional-salary/:id/reject', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.rejectAdditionalSalary);
router.post('/additional-salary/:id/cancel', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.cancelAdditionalSalary);
router.post('/additional-salary/bulk-approve', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.bulkApproveAdditionalSalary);
router.get('/additional-salary/stats', (0, authMiddleware_1.requirePermission)('hr.payroll'), hrController_1.getAdditionalSalaryStats);
// ==========================================
// Deductions & Rewards Rules (خصومات ومكافآت)
// ==========================================
router.get('/salary-rules', (0, authMiddleware_1.requirePermission)('hr.rules.view'), hrController_1.getSalaryRules);
router.post('/salary-rules', (0, authMiddleware_1.requirePermission)('hr.rules.manage'), hrController_1.createSalaryRule);
router.put('/salary-rules/:id', (0, authMiddleware_1.requirePermission)('hr.rules.manage'), hrController_1.updateSalaryRule);
router.delete('/salary-rules/:id', (0, authMiddleware_1.requirePermission)('hr.rules.manage'), hrController_1.deleteSalaryRule);
// ==========================================
// Beast Mode: GL Integration
// ==========================================
router.get('/payroll-gl-mappings', (0, authMiddleware_1.requirePermission)('hr.gl_mappings'), hrController_1.getPayrollGLMappings);
router.post('/payroll-gl-mappings', (0, authMiddleware_1.requirePermission)('hr.gl_mappings'), hrController_1.upsertPayrollGLMapping);
router.delete('/payroll-gl-mappings/:id', (0, authMiddleware_1.requirePermission)('hr.gl_mappings'), hrController_1.deletePayrollGLMapping);
router.post('/payroll/:cycleId/preview-journal', (0, authMiddleware_1.requirePermission)('hr.gl_mappings'), hrController_1.previewPayrollJournal);
// ==========================================
// Beast Mode: Rule Categories
// ==========================================
router.get('/rule-categories', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.getRuleCategories);
router.post('/rule-categories', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.createRuleCategory);
router.put('/rule-categories/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.updateRuleCategory);
router.delete('/rule-categories/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrController_1.deleteRuleCategory);
// ==========================================
// Fingerprint Device Integration
// ==========================================
router.get('/fingerprint/overview', (0, authMiddleware_1.requirePermission)('hr.biometric.view'), fingerprintController_1.getOverview);
router.get('/fingerprint/devices', (0, authMiddleware_1.requirePermission)('hr.biometric.view'), fingerprintController_1.getDevices);
router.post('/fingerprint/devices', (0, authMiddleware_1.requirePermission)('hr.biometric.edit'), fingerprintController_1.createDevice);
router.put('/fingerprint/devices/:id', (0, authMiddleware_1.requirePermission)('hr.biometric.edit'), fingerprintController_1.updateDevice);
router.delete('/fingerprint/devices/:id', (0, authMiddleware_1.requirePermission)('hr.biometric.edit'), fingerprintController_1.deleteDevice);
router.post('/fingerprint/devices/:id/test', (0, authMiddleware_1.requirePermission)('hr.biometric.edit'), fingerprintController_1.testConnection);
router.get('/fingerprint/devices/:id/users', (0, authMiddleware_1.requirePermission)('hr.biometric.view'), fingerprintController_1.getDeviceUserList);
// Fingerprint Employee Mapping
router.get('/fingerprint/devices/:id/mappings', (0, authMiddleware_1.requirePermission)('hr.biometric.view'), fingerprintController_1.getMappings);
router.post('/fingerprint/devices/:id/mappings', (0, authMiddleware_1.requirePermission)('hr.biometric.edit'), fingerprintController_1.saveMappings);
router.delete('/fingerprint/mappings/:mappingId', (0, authMiddleware_1.requirePermission)('hr.biometric.edit'), fingerprintController_1.deleteMapping);
router.get('/fingerprint/devices/:id/suggest-mappings', (0, authMiddleware_1.requirePermission)('hr.biometric.view'), fingerprintController_1.suggestMappings);
// Fingerprint Attendance Sync
router.post('/fingerprint/devices/:id/sync', (0, authMiddleware_1.requirePermission)('hr.biometric.edit'), fingerprintController_1.syncDevice);
router.post('/fingerprint/sync-all', (0, authMiddleware_1.requirePermission)('hr.biometric.edit'), fingerprintController_1.syncAllDevices);
router.get('/fingerprint/devices/:id/sync-history', (0, authMiddleware_1.requirePermission)('hr.biometric.view'), fingerprintController_1.getSyncHistory);
// ==========================================
// HR Documents & Contracts
// ==========================================
// Document Templates
router.get('/document-templates', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocumentsController_1.getDocumentTemplates);
router.post('/document-templates', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocumentsController_1.createDocumentTemplate);
router.put('/document-templates/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocumentsController_1.updateDocumentTemplate);
router.delete('/document-templates/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocumentsController_1.deleteDocumentTemplate);
// Employee Documents
router.get('/documents', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocumentsController_1.getAllEmployeeDocuments);
router.get('/documents/templates', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocumentsController_1.getDocumentTemplates);
router.get('/documents/expiring', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocumentsController_1.getExpiringContracts);
router.get('/documents/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocumentsController_1.getDocumentById);
router.post('/documents', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocsUpload.single('document'), hrDocumentsController_1.createEmployeeDocument);
router.post('/documents/issue', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocsUpload.single('document'), hrDocumentsController_1.createEmployeeDocument);
router.put('/documents/:id', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocumentsController_1.updateEmployeeDocument);
router.post('/documents/:id/cancel', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocumentsController_1.cancelEmployeeDocument);
router.get('/employees/:employeeId/documents', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocumentsController_1.getEmployeeDocuments);
// Preview (template merge without saving)
router.post('/documents/preview', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocumentsController_1.previewDocument);
// File Attachment Upload
router.post('/documents/:id/attachment', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocsUpload.single('file'), hrDocumentsController_1.uploadDocumentAttachment);
router.delete('/documents/:id/attachment', (0, authMiddleware_1.requirePermission)('hr.manage'), hrDocumentsController_1.deleteDocumentAttachment);
// ==========================================
// Smart Attendance (تسجيل حضور ذكي)
// ==========================================
// Employee self-service punch (any authenticated user with employee link)
router.post('/smart-attendance/punch', smartAttendanceController_1.punchCheckIn);
router.post('/smart-attendance/punch-bulk', smartAttendanceController_1.punchBulkCheckIn);
router.get('/smart-attendance/my-status', smartAttendanceController_1.getMyStatus);
// HR review & audit queue
router.get('/smart-attendance/audit', (0, authMiddleware_1.requirePermission)('hr.smart_register.view'), smartAttendanceController_1.getAudit);
router.get('/smart-attendance/pending-reviews', (0, authMiddleware_1.requirePermission)('hr.smart_register.view'), smartAttendanceController_1.listPendingReviews);
router.post('/smart-attendance/review/:punchId', (0, authMiddleware_1.requirePermission)('hr.smart_register.edit'), smartAttendanceController_1.reviewPunchAction);
router.put('/smart-attendance/reset-device/:employeeId', (0, authMiddleware_1.requirePermission)('hr.smart_register.edit'), smartAttendanceController_1.resetEmployeeDevice);
// Analytics
router.get('/smart-attendance/stats', (0, authMiddleware_1.requirePermission)('hr.smart_register.view'), smartAttendanceController_1.getStats);
router.get('/smart-attendance/branch-qr/:branchId', (0, authMiddleware_1.requirePermission)('hr.smart_register.view'), smartAttendanceController_1.generateBranchQr);
router.get('/smart-attendance/branch-stats/:branchId', (0, authMiddleware_1.requirePermission)('hr.smart_register.view'), smartAttendanceController_1.getTodayBranchKioskStats);
// Geofence locations (admin only)
router.get('/smart-attendance/locations', (0, authMiddleware_1.requirePermission)('hr.smart_register.view'), smartAttendanceController_1.listLocations);
router.get('/smart-attendance/locations/:id', (0, authMiddleware_1.requirePermission)('hr.smart_register.view'), smartAttendanceController_1.getLocation);
router.post('/smart-attendance/locations', (0, authMiddleware_1.requirePermission)('hr.smart_register.edit'), smartAttendanceController_1.addLocation);
router.put('/smart-attendance/locations/:id', (0, authMiddleware_1.requirePermission)('hr.smart_register.edit'), smartAttendanceController_1.editLocation);
router.delete('/smart-attendance/locations/:id', (0, authMiddleware_1.requirePermission)('hr.smart_register.edit'), smartAttendanceController_1.removeLocation);
// User↔Employee linking (admin only)
router.get('/smart-attendance/user-employee-links', (0, authMiddleware_1.requirePermission)('hr.smart_register.view'), smartAttendanceController_1.getUserEmployeeLinks);
router.put('/smart-attendance/link-employee', (0, authMiddleware_1.requirePermission)('hr.smart_register.edit'), smartAttendanceController_1.linkUserToEmployee);
router.post('/smart-attendance/auto-match', (0, authMiddleware_1.requirePermission)('hr.smart_register.edit'), smartAttendanceController_1.autoMatchUsersAndEmployees);
// ==========================================
// Training Module (المنهج التدريبي)
// ==========================================
// Programs
router.get('/training/programs', (0, authMiddleware_1.requirePermission)('hr.training'), trainingController_1.getTrainingPrograms);
router.get('/training/programs/:id', (0, authMiddleware_1.requirePermission)('hr.training'), trainingController_1.getTrainingProgram);
router.post('/training/programs', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.createTrainingProgram);
router.put('/training/programs/:id', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.updateTrainingProgram);
router.delete('/training/programs/:id', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.deleteTrainingProgram);
// Chapters
router.post('/training/chapters', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.createTrainingChapter);
router.put('/training/chapters/:id', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.updateTrainingChapter);
router.delete('/training/chapters/:id', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.deleteTrainingChapter);
// Topics
router.post('/training/topics', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.createTrainingTopic);
router.put('/training/topics/:id', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.updateTrainingTopic);
router.delete('/training/topics/:id', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.deleteTrainingTopic);
// Questions
router.post('/training/questions', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.createTrainingQuestion);
router.put('/training/questions/:id', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.updateTrainingQuestion);
router.delete('/training/questions/:id', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.deleteTrainingQuestion);
// Enrollments
router.post('/training/enroll', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.enrollEmployee);
router.post('/training/enroll/bulk', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.bulkEnrollEmployees);
router.get('/training/employee/:employeeId/enrollments', (0, authMiddleware_1.requirePermission)('hr.training'), trainingController_1.getEmployeeEnrollments);
router.get('/training/programs/:programId/enrollments', (0, authMiddleware_1.requirePermission)('hr.training'), trainingController_1.getProgramEnrollments);
router.delete('/training/enrollments/:id', (0, authMiddleware_1.requirePermission)('hr.training.manage'), trainingController_1.removeEnrollment);
// Progress
router.post('/training/progress', (0, authMiddleware_1.requirePermission)('hr.training'), trainingController_1.markTopicComplete);
router.get('/training/progress/:enrollmentId', (0, authMiddleware_1.requirePermission)('hr.training'), trainingController_1.getEnrollmentProgress);
// Quiz
router.post('/training/quiz/submit', (0, authMiddleware_1.requirePermission)('hr.training'), trainingController_1.submitQuizAnswers);
// Dashboard / Reports
router.get('/training/dashboard', (0, authMiddleware_1.requirePermission)('hr.training.report'), trainingController_1.getTrainingDashboard);
exports.default = router;
