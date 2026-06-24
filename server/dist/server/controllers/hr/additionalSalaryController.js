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
exports.getAdditionalSalaryStats = exports.bulkApproveAdditionalSalary = exports.cancelAdditionalSalary = exports.rejectAdditionalSalary = exports.approveAdditionalSalary = exports.deleteAdditionalSalary = exports.updateAdditionalSalary = exports.createAdditionalSalary = exports.getAdditionalSalaryEntries = void 0;
const errorHandler_1 = require("../../utils/errorHandler");
const additionalSalaryService = __importStar(require("../../services/additionalSalaryService"));
const getAdditionalSalaryEntries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const entries = yield additionalSalaryService.getAdditionalSalaryEntries({
            employeeId: req.query.employeeId,
            payrollCycleId: req.query.payrollCycleId,
            status: req.query.status,
            type: req.query.type
        });
        res.json(entries);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch additional salary entries');
    }
});
exports.getAdditionalSalaryEntries = getAdditionalSalaryEntries;
const createAdditionalSalary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const id = yield additionalSalaryService.createAdditionalSalary(Object.assign(Object.assign({}, req.body), { createdBy: (_a = req.user) === null || _a === void 0 ? void 0 : _a.id }));
        res.status(201).json({ id, message: 'تم إنشاء إدخال الراتب الإضافي بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'create additional salary');
    }
});
exports.createAdditionalSalary = createAdditionalSalary;
const updateAdditionalSalary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield additionalSalaryService.updateAdditionalSalary(req.params.id, req.body);
        res.json({ message: 'تم تحديث إدخال الراتب الإضافي بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'update additional salary');
    }
});
exports.updateAdditionalSalary = updateAdditionalSalary;
const deleteAdditionalSalary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield additionalSalaryService.deleteAdditionalSalary(req.params.id);
        res.json({ message: 'تم حذف إدخال الراتب الإضافي بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete additional salary');
    }
});
exports.deleteAdditionalSalary = deleteAdditionalSalary;
const approveAdditionalSalary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        yield additionalSalaryService.approveAdditionalSalary(req.params.id, ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || 'system');
        res.json({ message: 'تم اعتماد إدخال الراتب الإضافي بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'approve additional salary');
    }
});
exports.approveAdditionalSalary = approveAdditionalSalary;
const rejectAdditionalSalary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        yield additionalSalaryService.rejectAdditionalSalary(req.params.id, ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || 'system');
        res.json({ message: 'تم رفض إدخال الراتب الإضافي' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'reject additional salary');
    }
});
exports.rejectAdditionalSalary = rejectAdditionalSalary;
const cancelAdditionalSalary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield additionalSalaryService.cancelAdditionalSalary(req.params.id);
        res.json({ message: 'تم إلغاء إدخال الراتب الإضافي' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'cancel additional salary');
    }
});
exports.cancelAdditionalSalary = cancelAdditionalSalary;
const bulkApproveAdditionalSalary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { ids } = req.body;
        const count = yield additionalSalaryService.bulkApprove(ids, ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || 'system');
        res.json({ message: `تم اعتماد ${count} إدخال بنجاح`, approvedCount: count });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'bulk approve additional salary');
    }
});
exports.bulkApproveAdditionalSalary = bulkApproveAdditionalSalary;
const getAdditionalSalaryStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const stats = yield additionalSalaryService.getStats();
        res.json(stats);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'get additional salary stats');
    }
});
exports.getAdditionalSalaryStats = getAdditionalSalaryStats;
