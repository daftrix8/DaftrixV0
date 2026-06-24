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
exports.deleteSalaryRule = exports.updateSalaryRule = exports.createSalaryRule = exports.getSalaryRules = void 0;
const errorHandler_1 = require("../../utils/errorHandler");
const salaryRuleService = __importStar(require("../../services/salaryRuleService"));
const getSalaryRules = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const isActiveParam = req.query.isActive;
        const isActive = isActiveParam !== undefined ? isActiveParam === 'true' : undefined;
        const rules = yield salaryRuleService.getSalaryRules({ isActive });
        res.json(rules);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch salary rules');
    }
});
exports.getSalaryRules = getSalaryRules;
const createSalaryRule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = yield salaryRuleService.createSalaryRule(req.body);
        res.status(201).json({ id, message: 'تم إنشاء قاعدة الراتب بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'create salary rule');
    }
});
exports.createSalaryRule = createSalaryRule;
const updateSalaryRule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield salaryRuleService.updateSalaryRule(req.params.id, req.body);
        res.json({ message: 'تم تحديث قاعدة الراتب بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'update salary rule');
    }
});
exports.updateSalaryRule = updateSalaryRule;
const deleteSalaryRule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield salaryRuleService.deleteSalaryRule(req.params.id);
        res.json({ message: 'تم حذف قاعدة الراتب بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete salary rule');
    }
});
exports.deleteSalaryRule = deleteSalaryRule;
exports.default = {
    getSalaryRules: exports.getSalaryRules,
    createSalaryRule: exports.createSalaryRule,
    updateSalaryRule: exports.updateSalaryRule,
    deleteSalaryRule: exports.deleteSalaryRule
};
