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
exports.getWorkEntrySummary = exports.resolveWorkEntryConflict = exports.validateWorkEntries = exports.generateWorkEntries = exports.deleteWorkEntry = exports.updateWorkEntry = exports.upsertWorkEntry = exports.getWorkEntries = exports.createWorkEntryType = exports.getWorkEntryTypes = void 0;
const errorHandler_1 = require("../../utils/errorHandler");
const workEntryService = __importStar(require("../../services/workEntryService"));
const getWorkEntryTypes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const types = yield workEntryService.getWorkEntryTypes();
        res.json(types);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch work entry types');
    }
});
exports.getWorkEntryTypes = getWorkEntryTypes;
const createWorkEntryType = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = yield workEntryService.createWorkEntryType(req.body);
        res.status(201).json({ id, message: 'تم إنشاء نوع إدخال العمل بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'create work entry type');
    }
});
exports.createWorkEntryType = createWorkEntryType;
const getWorkEntries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employeeId, startDate, endDate, status, payrollCycleId } = req.query;
        const entries = yield workEntryService.getWorkEntries({
            employeeId: employeeId,
            startDate: startDate || new Date().toISOString().slice(0, 10),
            endDate: endDate || new Date().toISOString().slice(0, 10),
            status: status,
            payrollCycleId: payrollCycleId
        });
        res.json(entries);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch work entries');
    }
});
exports.getWorkEntries = getWorkEntries;
const upsertWorkEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = yield workEntryService.upsertWorkEntry(req.body);
        res.status(201).json({ id, message: 'تم حفظ إدخال العمل بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'upsert work entry');
    }
});
exports.upsertWorkEntry = upsertWorkEntry;
const updateWorkEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield workEntryService.updateWorkEntry(req.params.id, req.body);
        res.json({ message: 'تم تحديث إدخال العمل بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'update work entry');
    }
});
exports.updateWorkEntry = updateWorkEntry;
const deleteWorkEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield workEntryService.deleteWorkEntry(req.params.id);
        res.json({ message: 'تم حذف إدخال العمل بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete work entry');
    }
});
exports.deleteWorkEntry = deleteWorkEntry;
const generateWorkEntries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { payrollCycleId, month, year } = req.body;
        const result = yield workEntryService.generateWorkEntries(payrollCycleId, month, year);
        res.json(Object.assign({ message: `تم توليد ${result.generated} إدخال عمل لـ ${result.employees} موظف` }, result));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'generate work entries');
    }
});
exports.generateWorkEntries = generateWorkEntries;
const validateWorkEntries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate, employeeId } = req.body;
        const result = yield workEntryService.validateWorkEntries(startDate, endDate, employeeId);
        res.json(Object.assign({ message: `تم اعتماد ${result.validated} إدخال عمل` }, result));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'validate work entries');
    }
});
exports.validateWorkEntries = validateWorkEntries;
const resolveWorkEntryConflict = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { workEntryTypeId, hours, version } = req.body;
        yield workEntryService.resolveConflict(req.params.id, workEntryTypeId, hours, version);
        res.json({ message: 'تم حل التعارض بنجاح' });
    }
    catch (error) {
        if (error instanceof Error && error.message.includes('CONCURRENT_MODIFICATION')) {
            return res.status(409).json({ message: error.message });
        }
        return (0, errorHandler_1.handleControllerError)(res, error, 'resolve conflict');
    }
});
exports.resolveWorkEntryConflict = resolveWorkEntryConflict;
const getWorkEntrySummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employeeId, startDate, endDate } = req.query;
        const summary = yield workEntryService.getWorkEntrySummary(employeeId, startDate, endDate);
        res.json(summary);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'get work entry summary');
    }
});
exports.getWorkEntrySummary = getWorkEntrySummary;
