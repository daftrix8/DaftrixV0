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
exports.removeStructureAssignment = exports.assignStructureToEmployee = exports.getTemplateAssignments = exports.getEmployeeStructureAssignment = exports.deleteStructureLine = exports.updateStructureLine = exports.addStructureLine = exports.deleteStructureTemplate = exports.updateStructureTemplate = exports.createStructureTemplate = exports.getStructureTemplate = exports.getStructureTemplates = exports.setEmployeeSalaryComponent = exports.getEmployeeSalaryStructure = exports.deleteSalaryComponent = exports.updateSalaryComponent = exports.createSalaryComponent = exports.getSalaryComponents = exports.updateEmployeeTemplate = exports.removeEmployeeTemplate = exports.getEmployeeTemplates = exports.assignTemplateToEmployee = exports.deletePayrollTemplate = exports.updatePayrollTemplate = exports.createPayrollTemplate = exports.getPayrollTemplates = void 0;
const db_1 = require("../../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../../utils/errorHandler");
const salaryService = __importStar(require("../../services/salaryService"));
const structureService = __importStar(require("../../services/salaryStructureService"));
const getPayrollTemplates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { type } = req.query;
    try {
        let query = `SELECT * FROM payroll_templates WHERE 1=1`;
        const params = [];
        if (type) {
            query += ` AND type = ?`;
            params.push(type);
        }
        query += ` ORDER BY type, name`;
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return res.json([]);
        }
        console.error('Error fetching templates:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch templates');
    }
});
exports.getPayrollTemplates = getPayrollTemplates;
const createPayrollTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, type, calculationType, amount, percentage, description, isActive } = req.body;
    try {
        const id = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`
          INSERT INTO payroll_templates (
            id, name, type, calculationType, amount, percentage, description, isActive
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, name, type, calculationType || 'FIXED',
            amount || 0, percentage || 0, description, isActive !== false
        ]);
        res.status(201).json({ id, message: 'Template created successfully' });
    }
    catch (error) {
        console.error('Error creating template:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'create template');
    }
});
exports.createPayrollTemplate = createPayrollTemplate;
const updatePayrollTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { name, type, calculationType, amount, percentage, description, isActive } = req.body;
    try {
        yield db_1.pool.query(`
          UPDATE payroll_templates SET
            name = ?, type = ?, calculationType = ?, amount = ?,
            percentage = ?, description = ?, isActive = ?
          WHERE id = ?
        `, [name, type, calculationType, amount, percentage, description, isActive, id]);
        res.json({ message: 'Template updated successfully' });
    }
    catch (error) {
        console.error('Error updating template:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'update template');
    }
});
exports.updatePayrollTemplate = updatePayrollTemplate;
const deletePayrollTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        yield db_1.pool.query('DELETE FROM payroll_templates WHERE id = ?', [id]);
        res.json({ message: 'Template deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting template:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete template');
    }
});
exports.deletePayrollTemplate = deletePayrollTemplate;
const assignTemplateToEmployee = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, templateId, customAmount } = req.body;
    try {
        const id = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`
          INSERT INTO employee_payroll_templates (id, employeeId, templateId, customAmount, isActive)
          VALUES (?, ?, ?, ?, TRUE)
          ON DUPLICATE KEY UPDATE customAmount = ?, isActive = TRUE
        `, [id, employeeId, templateId, customAmount, customAmount]);
        res.status(201).json({ id, message: 'Template assigned successfully' });
    }
    catch (error) {
        console.error('Error assigning template:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'assign template');
    }
});
exports.assignTemplateToEmployee = assignTemplateToEmployee;
const getEmployeeTemplates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId } = req.params;
    try {
        const [rows] = yield db_1.pool.query(`
          SELECT ept.*, pt.name, pt.type, pt.calculationType, pt.amount as templateAmount, pt.percentage
          FROM employee_payroll_templates ept
          JOIN payroll_templates pt ON ept.templateId = pt.id
          WHERE ept.employeeId = ? AND ept.isActive = TRUE
        `, [employeeId]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching employee templates:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch employee templates');
    }
});
exports.getEmployeeTemplates = getEmployeeTemplates;
const removeEmployeeTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, templateId } = req.params;
    try {
        yield db_1.pool.query(`
          UPDATE employee_payroll_templates SET isActive = FALSE
          WHERE employeeId = ? AND templateId = ?
        `, [employeeId, templateId]);
        res.json({ message: 'Template removed from employee successfully' });
    }
    catch (error) {
        console.error('Error removing template:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'remove template');
    }
});
exports.removeEmployeeTemplate = removeEmployeeTemplate;
const updateEmployeeTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { customAmount, isActive } = req.body;
    try {
        yield db_1.pool.query(`
          UPDATE employee_payroll_templates SET customAmount = ?, isActive = ?
          WHERE id = ?
        `, [customAmount, isActive, id]);
        res.json({ message: 'Template assignment updated successfully' });
    }
    catch (error) {
        console.error('Error updating template assignment:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'update template assignment');
    }
});
exports.updateEmployeeTemplate = updateEmployeeTemplate;
const getSalaryComponents = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const components = yield salaryService.getActiveSalaryComponents();
        res.json(components);
    }
    catch (error) {
        console.error('Error fetching salary components:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch salary components');
    }
});
exports.getSalaryComponents = getSalaryComponents;
const createSalaryComponent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = yield salaryService.createSalaryComponent(req.body);
        res.status(201).json({ id, message: 'Salary component created successfully' });
    }
    catch (error) {
        console.error('Error creating salary component:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'create salary component');
    }
});
exports.createSalaryComponent = createSalaryComponent;
const updateSalaryComponent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        yield salaryService.updateSalaryComponent(id, req.body);
        res.json({ message: 'Salary component updated successfully' });
    }
    catch (error) {
        console.error('Error updating salary component:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'update salary component');
    }
});
exports.updateSalaryComponent = updateSalaryComponent;
const deleteSalaryComponent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        yield salaryService.deleteSalaryComponent(id);
        res.json({ message: 'Salary component deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting salary component:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete salary component');
    }
});
exports.deleteSalaryComponent = deleteSalaryComponent;
const getEmployeeSalaryStructure = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId } = req.params;
    const { date } = req.query;
    try {
        const effectiveDate = date ? new Date(date) : new Date();
        const structure = yield salaryService.getEmployeeSalaryStructure(employeeId, effectiveDate);
        res.json(structure);
    }
    catch (error) {
        console.error('Error fetching employee salary structure:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch employee salary structure');
    }
});
exports.getEmployeeSalaryStructure = getEmployeeSalaryStructure;
const setEmployeeSalaryComponent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId } = req.params;
    const { componentId, amount, effectiveFrom, calculationType, percentage, customFormula, notes } = req.body;
    try {
        const id = yield salaryService.setEmployeeSalaryComponent(employeeId, componentId, amount, new Date(effectiveFrom), { calculationType, percentage, customFormula, notes });
        res.json({ id, message: 'Salary component updated successfully' });
    }
    catch (error) {
        console.error('Error setting salary component:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'set salary component');
    }
});
exports.setEmployeeSalaryComponent = setEmployeeSalaryComponent;
const getStructureTemplates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const templates = yield structureService.getStructureTemplates();
        res.json(templates);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch structure templates');
    }
});
exports.getStructureTemplates = getStructureTemplates;
const getStructureTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const template = yield structureService.getStructureTemplate(req.params.id);
        if (!template)
            return res.status(404).json({ error: 'Template not found' });
        res.json(template);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch structure template');
    }
});
exports.getStructureTemplate = getStructureTemplate;
const createStructureTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = yield structureService.createStructureTemplate(req.body);
        res.status(201).json({ id, message: 'تم إنشاء هيكل الراتب بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'create structure template');
    }
});
exports.createStructureTemplate = createStructureTemplate;
const updateStructureTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield structureService.updateStructureTemplate(req.params.id, req.body);
        res.json({ message: 'تم تحديث هيكل الراتب بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'update structure template');
    }
});
exports.updateStructureTemplate = updateStructureTemplate;
const deleteStructureTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield structureService.deleteStructureTemplate(req.params.id);
        res.json({ message: 'تم حذف هيكل الراتب بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete structure template');
    }
});
exports.deleteStructureTemplate = deleteStructureTemplate;
const addStructureLine = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = yield structureService.addStructureLine(req.params.templateId, req.body);
        res.status(201).json({ id, message: 'تم إضافة مكون الراتب بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'add structure line');
    }
});
exports.addStructureLine = addStructureLine;
const updateStructureLine = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield structureService.updateStructureLine(req.params.lineId, req.body);
        res.json({ message: 'تم تحديث مكون الراتب بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'update structure line');
    }
});
exports.updateStructureLine = updateStructureLine;
const deleteStructureLine = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield structureService.deleteStructureLine(req.params.lineId);
        res.json({ message: 'تم حذف مكون الراتب بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete structure line');
    }
});
exports.deleteStructureLine = deleteStructureLine;
const getEmployeeStructureAssignment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const assignment = yield structureService.getEmployeeAssignment(req.params.employeeId);
        res.json(assignment || {});
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch employee structure assignment');
    }
});
exports.getEmployeeStructureAssignment = getEmployeeStructureAssignment;
const getTemplateAssignments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const assignments = yield structureService.getTemplateAssignments(req.params.templateId);
        res.json(assignments);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch template assignments');
    }
});
exports.getTemplateAssignments = getTemplateAssignments;
const assignStructureToEmployee = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = yield structureService.assignTemplateToEmployee(req.body);
        res.status(201).json({ id, message: 'تم تعيين هيكل الراتب للموظف بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'assign structure to employee');
    }
});
exports.assignStructureToEmployee = assignStructureToEmployee;
const removeStructureAssignment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield structureService.removeAssignment(req.params.assignmentId);
        res.json({ message: 'تم إلغاء تعيين هيكل الراتب بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'remove structure assignment');
    }
});
exports.removeStructureAssignment = removeStructureAssignment;
