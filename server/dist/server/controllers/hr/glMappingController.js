"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyAdjustmentToPayroll = exports.approveAdjustment = exports.getPendingAdjustments = exports.createRetroactiveAdjustment = exports.calculateRetroactiveAdjustment = exports.deleteRuleCategory = exports.updateRuleCategory = exports.createRuleCategory = exports.getRuleCategories = exports.previewPayrollJournal = exports.deletePayrollGLMapping = exports.upsertPayrollGLMapping = exports.getPayrollGLMappings = void 0;
const errorHandler_1 = require("../../utils/errorHandler");
const payrollGLService = __importStar(require("../../services/payrollGLService"));
const retroactiveService = __importStar(require("../../services/retroactiveService"));
const getPayrollGLMappings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const mappings = yield payrollGLService.getGLMappings();
        res.json(mappings);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch payroll GL mappings');
    }
});
exports.getPayrollGLMappings = getPayrollGLMappings;
const upsertPayrollGLMapping = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = yield payrollGLService.upsertGLMapping(req.body);
        res.json({ id, message: 'تم حفظ ربط الحساب بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'upsert GL mapping');
    }
});
exports.upsertPayrollGLMapping = upsertPayrollGLMapping;
const deletePayrollGLMapping = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield payrollGLService.deleteGLMapping(req.params.id);
        res.json({ message: 'تم حذف ربط الحساب بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete GL mapping');
    }
});
exports.deletePayrollGLMapping = deletePayrollGLMapping;
const previewPayrollJournal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { treasuryAccountId, entryIds } = req.body;
        const result = yield payrollGLService.buildPayrollJournalEntries(req.params.cycleId, treasuryAccountId, entryIds);
        res.json(result);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'preview payroll journal');
    }
});
exports.previewPayrollJournal = previewPayrollJournal;
const getRuleCategories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const categories = yield payrollGLService.getRuleCategories();
        res.json(categories);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch rule categories');
    }
});
exports.getRuleCategories = getRuleCategories;
const createRuleCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = yield payrollGLService.createRuleCategory(req.body);
        res.status(201).json({ id, message: 'تم إنشاء فئة القاعدة بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'create rule category');
    }
});
exports.createRuleCategory = createRuleCategory;
const updateRuleCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield payrollGLService.updateRuleCategory(req.params.id, req.body);
        res.json({ message: 'تم تحديث فئة القاعدة بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'update rule category');
    }
});
exports.updateRuleCategory = updateRuleCategory;
const deleteRuleCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield payrollGLService.deleteRuleCategory(req.params.id);
        res.json({ message: 'تم حذف فئة القاعدة بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete rule category');
    }
});
exports.deleteRuleCategory = deleteRuleCategory;
const calculateRetroactiveAdjustment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId } = req.params;
    const { newBaseSalary, effectiveFromMonth, effectiveFromYear, currentMonth, currentYear } = req.body;
    try {
        const result = yield retroactiveService.calculateRetroactiveAdjustment(employeeId, parseFloat(newBaseSalary), parseInt(effectiveFromMonth), parseInt(effectiveFromYear), currentMonth ? parseInt(currentMonth) : undefined, currentYear ? parseInt(currentYear) : undefined);
        res.json(result);
    }
    catch (error) {
        console.error('Error calculating retroactive adjustment:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'calculate retroactive adjustment');
    }
});
exports.calculateRetroactiveAdjustment = calculateRetroactiveAdjustment;
const createRetroactiveAdjustment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { calculation, payrollCycleId, applyImmediately } = req.body;
    const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || 'system';
    try {
        const id = yield retroactiveService.createRetroactiveAdjustment(calculation, payrollCycleId, userId, applyImmediately || false);
        res.json({ id, message: 'Retroactive adjustment created successfully' });
    }
    catch (error) {
        console.error('Error creating retroactive adjustment:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'create retroactive adjustment');
    }
});
exports.createRetroactiveAdjustment = createRetroactiveAdjustment;
const getPendingAdjustments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId } = req.params;
    try {
        const adjustments = yield retroactiveService.getPendingAdjustments(employeeId);
        res.json(adjustments);
    }
    catch (error) {
        console.error('Error fetching pending adjustments:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch pending adjustments');
    }
});
exports.getPendingAdjustments = getPendingAdjustments;
const approveAdjustment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { adjustmentId } = req.params;
    const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || 'system';
    try {
        yield retroactiveService.approveAdjustment(adjustmentId, userId);
        res.json({ message: 'Adjustment approved successfully' });
    }
    catch (error) {
        console.error('Error approving adjustment:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'approve adjustment');
    }
});
exports.approveAdjustment = approveAdjustment;
const applyAdjustmentToPayroll = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { adjustmentId } = req.params;
    try {
        yield retroactiveService.applyAdjustmentToPayroll(adjustmentId);
        res.json({ message: 'Adjustment applied to payroll successfully' });
    }
    catch (error) {
        console.error('Error applying adjustment:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'apply adjustment');
    }
});
exports.applyAdjustmentToPayroll = applyAdjustmentToPayroll;
