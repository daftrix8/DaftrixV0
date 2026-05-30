"use strict";
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
exports.calculateFromTemplate = exports.removeAssignment = exports.assignTemplateToEmployee = exports.getTemplateAssignments = exports.getEmployeeAssignment = exports.deleteStructureLine = exports.updateStructureLine = exports.addStructureLine = exports.deleteStructureTemplate = exports.updateStructureTemplate = exports.createStructureTemplate = exports.getStructureTemplate = exports.getStructureTemplates = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const formulaEvaluator_1 = require("./formulaEvaluator");
// ============================================
// TEMPLATE CRUD
// ============================================
const getStructureTemplates = () => __awaiter(void 0, void 0, void 0, function* () {
    const [rows] = yield db_1.pool.query(`
        SELECT sst.*, 
            (SELECT COUNT(*) FROM salary_structure_lines ssl WHERE ssl.templateId = sst.id AND ssl.isActive = 1) as lineCount,
            (SELECT COUNT(*) FROM employee_structure_assignments esa WHERE esa.templateId = sst.id AND esa.isActive = 1) as assignmentCount
        FROM salary_structure_templates sst
        WHERE sst.isActive = 1
        ORDER BY sst.isDefault DESC, sst.name ASC
    `);
    return rows;
});
exports.getStructureTemplates = getStructureTemplates;
const getStructureTemplate = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const [rows] = yield db_1.pool.query('SELECT * FROM salary_structure_templates WHERE id = ?', [id]);
    if (rows.length === 0)
        return null;
    const template = rows[0];
    // Get lines with component info
    const [lines] = yield db_1.pool.query(`
        SELECT ssl.*, sc.name as componentName, sc.nameEn as componentNameEn, 
               sc.code as componentCode, sc.type as componentType,
               sc.isTaxable, sc.isInsuranceSubject, sc.category
        FROM salary_structure_lines ssl
        JOIN salary_components sc ON ssl.componentId = sc.id
        WHERE ssl.templateId = ? AND ssl.isActive = 1
        ORDER BY ssl.sequence ASC
    `, [id]);
    template.lines = lines;
    return template;
});
exports.getStructureTemplate = getStructureTemplate;
const createStructureTemplate = (data) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const id = (0, crypto_1.randomUUID)();
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // If this is default, unset other defaults
        if (data.isDefault) {
            yield conn.query('UPDATE salary_structure_templates SET isDefault = FALSE WHERE isDefault = TRUE');
        }
        yield conn.query(`
            INSERT INTO salary_structure_templates (id, name, nameEn, code, description, structureType, isDefault)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, data.name, data.nameEn || null, data.code, data.description || null,
            data.structureType || 'MONTHLY', data.isDefault || false]);
        // Insert lines
        if (data.lines && data.lines.length > 0) {
            for (let i = 0; i < data.lines.length; i++) {
                const line = data.lines[i];
                yield conn.query(`
                    INSERT INTO salary_structure_lines 
                    (id, templateId, componentId, calculationType, amount, percentage, formula, 
                     sequence, conditionType, conditionFormula, dependsOnPaymentDays)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    (0, crypto_1.randomUUID)(), id, line.componentId,
                    line.calculationType || 'FIXED',
                    line.amount || 0,
                    line.percentage || null,
                    line.formula || null,
                    (_a = line.sequence) !== null && _a !== void 0 ? _a : (i * 10),
                    line.conditionType || 'ALWAYS',
                    line.conditionFormula || null,
                    line.dependsOnPaymentDays || false
                ]);
            }
        }
        yield conn.commit();
        return id;
    }
    catch (error) {
        yield conn.rollback();
        throw error;
    }
    finally {
        conn.release();
    }
});
exports.createStructureTemplate = createStructureTemplate;
const updateStructureTemplate = (id, data) => __awaiter(void 0, void 0, void 0, function* () {
    const fields = [];
    const values = [];
    Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
    });
    if (fields.length === 0)
        return;
    // If setting as default, unset others
    if (data.isDefault) {
        yield db_1.pool.query('UPDATE salary_structure_templates SET isDefault = FALSE WHERE isDefault = TRUE AND id != ?', [id]);
    }
    values.push(id);
    yield db_1.pool.query(`UPDATE salary_structure_templates SET ${fields.join(', ')} WHERE id = ?`, values);
});
exports.updateStructureTemplate = updateStructureTemplate;
const deleteStructureTemplate = (id) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query('UPDATE salary_structure_templates SET isActive = 0 WHERE id = ?', [id]);
});
exports.deleteStructureTemplate = deleteStructureTemplate;
// ============================================
// STRUCTURE LINES
// ============================================
const addStructureLine = (templateId, data) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const id = (0, crypto_1.randomUUID)();
    // Get max sequence if not provided
    let sequence = data.sequence;
    if (sequence === undefined) {
        const [maxSeq] = yield db_1.pool.query('SELECT MAX(sequence) as maxSeq FROM salary_structure_lines WHERE templateId = ?', [templateId]);
        sequence = (((_a = maxSeq[0]) === null || _a === void 0 ? void 0 : _a.maxSeq) || 0) + 10;
    }
    yield db_1.pool.query(`
        INSERT INTO salary_structure_lines
        (id, templateId, componentId, calculationType, amount, percentage, formula,
         sequence, conditionType, conditionFormula, dependsOnPaymentDays, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id, templateId, data.componentId,
        data.calculationType || 'FIXED',
        data.amount || 0,
        data.percentage || null,
        data.formula || null,
        sequence,
        data.conditionType || 'ALWAYS',
        data.conditionFormula || null,
        data.dependsOnPaymentDays || false,
        data.notes || null
    ]);
    return id;
});
exports.addStructureLine = addStructureLine;
const updateStructureLine = (lineId, data) => __awaiter(void 0, void 0, void 0, function* () {
    const fields = [];
    const values = [];
    Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
    });
    if (fields.length === 0)
        return;
    values.push(lineId);
    yield db_1.pool.query(`UPDATE salary_structure_lines SET ${fields.join(', ')} WHERE id = ?`, values);
});
exports.updateStructureLine = updateStructureLine;
const deleteStructureLine = (lineId) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query('DELETE FROM salary_structure_lines WHERE id = ?', [lineId]);
});
exports.deleteStructureLine = deleteStructureLine;
// ============================================
// EMPLOYEE ASSIGNMENTS
// ============================================
const getEmployeeAssignment = (employeeId) => __awaiter(void 0, void 0, void 0, function* () {
    const [rows] = yield db_1.pool.query(`
        SELECT esa.*, sst.name as templateName, sst.code as templateCode, e.fullName as employeeName
        FROM employee_structure_assignments esa
        JOIN salary_structure_templates sst ON esa.templateId = sst.id
        JOIN employees e ON esa.employeeId = e.id
        WHERE esa.employeeId = ? AND esa.isActive = 1
          AND esa.effectiveFrom <= CURDATE()
          AND (esa.effectiveTo IS NULL OR esa.effectiveTo >= CURDATE())
        ORDER BY esa.effectiveFrom DESC
        LIMIT 1
    `, [employeeId]);
    return rows[0] || null;
});
exports.getEmployeeAssignment = getEmployeeAssignment;
const getTemplateAssignments = (templateId) => __awaiter(void 0, void 0, void 0, function* () {
    const [rows] = yield db_1.pool.query(`
        SELECT esa.*, e.fullName as employeeName, e.department, e.jobTitle
        FROM employee_structure_assignments esa
        JOIN employees e ON esa.employeeId = e.id
        WHERE esa.templateId = ? AND esa.isActive = 1
        ORDER BY e.fullName
    `, [templateId]);
    return rows;
});
exports.getTemplateAssignments = getTemplateAssignments;
const assignTemplateToEmployee = (data) => __awaiter(void 0, void 0, void 0, function* () {
    const id = (0, crypto_1.randomUUID)();
    // Deactivate any existing active assignments
    yield db_1.pool.query(`
        UPDATE employee_structure_assignments 
        SET isActive = 0, effectiveTo = DATE_SUB(?, INTERVAL 1 DAY)
        WHERE employeeId = ? AND isActive = 1
    `, [data.effectiveFrom, data.employeeId]);
    yield db_1.pool.query(`
        INSERT INTO employee_structure_assignments 
        (id, employeeId, templateId, baseSalary, effectiveFrom, effectiveTo, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
        id, data.employeeId, data.templateId,
        data.baseSalary, data.effectiveFrom,
        data.effectiveTo || null, data.notes || null
    ]);
    return id;
});
exports.assignTemplateToEmployee = assignTemplateToEmployee;
const removeAssignment = (assignmentId) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query('UPDATE employee_structure_assignments SET isActive = 0 WHERE id = ?', [assignmentId]);
});
exports.removeAssignment = removeAssignment;
// ============================================
// STRUCTURE → PAYROLL CALCULATION
// ============================================
/**
 * Calculate earnings for an employee using their assigned structure template
 * Falls back to direct salary_components if no template assigned
 */
const calculateFromTemplate = (employeeId_1, context_1, ...args_1) => __awaiter(void 0, [employeeId_1, context_1, ...args_1], void 0, function* (employeeId, context, effectiveDate = new Date()) {
    // Check for template assignment
    const assignment = yield (0, exports.getEmployeeAssignment)(employeeId);
    if (!assignment) {
        // No template — return empty (will fall back to old system)
        return { earnings: [], deductions: [], grossSalary: 0, taxableIncome: 0, insuranceBase: 0, totalDeductions: 0 };
    }
    // Get template lines with component info
    const [lines] = yield db_1.pool.query(`
        SELECT ssl.*, sc.name as componentName, sc.code as componentCode, 
               sc.type as componentType, sc.isTaxable, sc.isInsuranceSubject, sc.category
        FROM salary_structure_lines ssl
        JOIN salary_components sc ON ssl.componentId = sc.id
        WHERE ssl.templateId = ? AND ssl.isActive = 1 AND sc.isActive = 1
        ORDER BY ssl.sequence ASC
    `, [assignment.templateId]);
    // Override BASIC_SALARY with assignment's baseSalary
    context.BASIC_SALARY = assignment.baseSalary;
    const earnings = [];
    const deductions = [];
    let grossSalary = 0;
    let taxableIncome = 0;
    let insuranceBase = 0;
    let totalDeductions = 0;
    for (const line of lines) {
        // Check condition
        if (line.conditionType === 'RANGE' && line.conditionRangeField) {
            const fieldVal = context[line.conditionRangeField] || 0;
            if (fieldVal < (line.conditionRangeMin || 0) || fieldVal > (line.conditionRangeMax || Infinity)) {
                continue; // Skip this rule
            }
        }
        else if (line.conditionType === 'FORMULA' && line.conditionFormula) {
            const condResult = (0, formulaEvaluator_1.evaluateFormula)(line.conditionFormula, context);
            if (!condResult || condResult <= 0)
                continue;
        }
        // Calculate amount
        let amount = 0;
        switch (line.calculationType) {
            case 'FIXED':
                amount = Number(line.amount) || 0;
                break;
            case 'PERCENTAGE':
                const baseAmount = context['BASIC_SALARY'] || 0;
                amount = baseAmount * ((line.percentage || 0) / 100);
                break;
            case 'FORMULA':
                if (line.formula) {
                    amount = (0, formulaEvaluator_1.evaluateFormula)(line.formula, context);
                }
                break;
        }
        // Apply payment days proration
        if (line.dependsOnPaymentDays && context.WORKING_DAYS > 0) {
            const actualDays = context.ACTUAL_WORKED_DAYS || context.WORKING_DAYS;
            const totalDays = context.WORKING_DAYS_IN_MONTH || 30;
            amount = amount * (actualDays / totalDays);
        }
        amount = Math.round(amount * 100) / 100;
        if (amount > 0) {
            // Add to context for downstream calculations
            context[line.componentCode] = amount;
            if (line.componentType === 'EARNING') {
                earnings.push({
                    componentId: line.componentId,
                    code: line.componentCode,
                    name: line.componentName,
                    amount,
                    isTaxable: !!line.isTaxable,
                    isInsuranceSubject: !!line.isInsuranceSubject,
                    category: line.category
                });
                grossSalary += amount;
                if (line.isTaxable)
                    taxableIncome += amount;
                if (line.isInsuranceSubject)
                    insuranceBase += amount;
            }
            else if (line.componentType === 'DEDUCTION') {
                deductions.push({
                    componentId: line.componentId,
                    code: line.componentCode,
                    name: line.componentName,
                    amount,
                    category: line.category
                });
                totalDeductions += amount;
            }
        }
    }
    return {
        earnings,
        deductions,
        grossSalary: Math.round(grossSalary * 100) / 100,
        taxableIncome: Math.round(taxableIncome * 100) / 100,
        insuranceBase: Math.round(insuranceBase * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100
    };
});
exports.calculateFromTemplate = calculateFromTemplate;
exports.default = {
    getStructureTemplates: exports.getStructureTemplates,
    getStructureTemplate: exports.getStructureTemplate,
    createStructureTemplate: exports.createStructureTemplate,
    updateStructureTemplate: exports.updateStructureTemplate,
    deleteStructureTemplate: exports.deleteStructureTemplate,
    addStructureLine: exports.addStructureLine,
    updateStructureLine: exports.updateStructureLine,
    deleteStructureLine: exports.deleteStructureLine,
    getEmployeeAssignment: exports.getEmployeeAssignment,
    getTemplateAssignments: exports.getTemplateAssignments,
    assignTemplateToEmployee: exports.assignTemplateToEmployee,
    removeAssignment: exports.removeAssignment,
    calculateFromTemplate: exports.calculateFromTemplate
};
