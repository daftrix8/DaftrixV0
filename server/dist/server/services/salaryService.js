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
exports.deleteSalaryComponent = exports.updateSalaryComponent = exports.createSalaryComponent = exports.createDefaultSalaryStructure = exports.setEmployeeSalaryComponent = exports.calculateEmployeePayroll = exports.calculateDeductions = exports.calculateEarnings = exports.getEmployeeSalaryStructure = exports.getActiveSalaryComponents = void 0;
const db_1 = require("../db");
const formulaEvaluator_1 = require("./formulaEvaluator");
const taxService_1 = require("./taxService");
/**
 * Get all active salary components
 */
const getActiveSalaryComponents = () => __awaiter(void 0, void 0, void 0, function* () {
    const [rows] = yield db_1.pool.query(`
    SELECT id, code, name, nameEn, type, category, 
           isTaxable, isInsuranceSubject, isActive, defaultFormula, displayOrder
    FROM salary_components 
    WHERE isActive = 1 
    ORDER BY displayOrder ASC
  `);
    return rows;
});
exports.getActiveSalaryComponents = getActiveSalaryComponents;
/**
 * Get employee's salary structure (active components with amounts)
 */
const getEmployeeSalaryStructure = (employeeId_1, ...args_1) => __awaiter(void 0, [employeeId_1, ...args_1], void 0, function* (employeeId, effectiveDate = new Date()) {
    const dateStr = effectiveDate.toISOString().split('T')[0];
    const [rows] = yield db_1.pool.query(`
    SELECT 
      sc.id, sc.id as componentId, sc.code, sc.name, sc.type, sc.category,
      sc.isTaxable, sc.isInsuranceSubject,
      COALESCE(ess.amount, 0) as amount,
      COALESCE(ess.percentage, NULL) as percentage,
      COALESCE(ess.calculationType, 'FIXED') as calculationType,
      COALESCE(ess.customFormula, sc.defaultFormula) as formula
    FROM salary_components sc
    LEFT JOIN employee_salary_structure ess ON sc.id = ess.componentId 
      AND ess.employeeId = ?
      AND ess.isActive = 1
      AND ess.effectiveFrom <= ?
      AND (ess.effectiveTo IS NULL OR ess.effectiveTo >= ?)
    WHERE sc.isActive = 1
    ORDER BY sc.displayOrder ASC
  `, [employeeId, dateStr, dateStr]);
    return rows;
});
exports.getEmployeeSalaryStructure = getEmployeeSalaryStructure;
/**
 * Calculate earnings for an employee based on their salary structure
 */
const calculateEarnings = (employeeId_1, context_1, ...args_1) => __awaiter(void 0, [employeeId_1, context_1, ...args_1], void 0, function* (employeeId, context, effectiveDate = new Date()) {
    const structure = yield (0, exports.getEmployeeSalaryStructure)(employeeId, effectiveDate);
    const earnings = [];
    let grossSalary = 0;
    let taxableIncome = 0;
    let insuranceBase = 0;
    for (const component of structure) {
        if (component.type !== 'EARNING')
            continue;
        let amount = 0;
        switch (component.calculationType) {
            case 'FIXED':
                amount = Number(component.amount) || 0;
                break;
            case 'PERCENTAGE':
                // Percentage of basic salary
                const baseAmount = context['BASIC_SALARY'] || 0;
                amount = baseAmount * ((component.percentage || 0) / 100);
                break;
            case 'FORMULA':
                if (component.formula) {
                    amount = (0, formulaEvaluator_1.evaluateFormula)(component.formula, context);
                }
                break;
        }
        if (amount > 0) {
            earnings.push({
                componentId: component.id,
                code: component.code,
                name: component.name,
                amount: Math.round(amount * 100) / 100,
                isTaxable: component.isTaxable,
                isInsuranceSubject: component.isInsuranceSubject,
                category: component.category
            });
            grossSalary += amount;
            if (component.isTaxable) {
                taxableIncome += amount;
            }
            if (component.isInsuranceSubject) {
                insuranceBase += amount;
            }
        }
    }
    return {
        earnings,
        grossSalary: Math.round(grossSalary * 100) / 100,
        taxableIncome: Math.round(taxableIncome * 100) / 100,
        insuranceBase: Math.round(insuranceBase * 100) / 100
    };
});
exports.calculateEarnings = calculateEarnings;
/**
 * Calculate deductions using payroll rules
 */
const calculateDeductions = (context) => __awaiter(void 0, void 0, void 0, function* () {
    const [rules] = yield db_1.pool.query(`
    SELECT id, name, ruleType, formula 
    FROM payroll_rules 
    WHERE isActive = 1 AND ruleType NOT IN ('TAX', 'INSURANCE')
    ORDER BY priority ASC
  `);
    const deductions = [];
    for (const rule of rules) {
        const amount = (0, formulaEvaluator_1.evaluateFormula)(rule.formula, context);
        if (amount > 0) {
            deductions.push({
                componentId: rule.id,
                code: rule.ruleType,
                name: rule.name,
                amount: Math.round(amount * 100) / 100,
                category: rule.ruleType
            });
        }
    }
    return deductions;
});
exports.calculateDeductions = calculateDeductions;
/**
 * Full payroll calculation for a single employee
 */
const calculateEmployeePayroll = (employeeId_1, employee_1, ...args_1) => __awaiter(void 0, [employeeId_1, employee_1, ...args_1], void 0, function* (employeeId, employee, attendance = {}, loanDeductions = 0, options = { includeTax: true, includeInsurance: true }) {
    // Build formula context
    const context = (0, formulaEvaluator_1.buildFormulaContext)(employee, attendance);
    // Calculate earnings
    const { earnings, grossSalary, taxableIncome, insuranceBase } = yield (0, exports.calculateEarnings)(employeeId, context);
    // Update context with calculated values
    context.GROSS_SALARY = grossSalary;
    context.TAXABLE_INCOME = taxableIncome;
    context.INSURANCE_BASE = insuranceBase || employee.baseSalary;
    // Calculate social insurance
    let insuranceResult = { insuranceBase: 0, employeeContribution: 0, employerContribution: 0, totalContribution: 0 };
    if (options.includeInsurance !== false) {
        insuranceResult = yield (0, taxService_1.calculateSocialInsurance)(insuranceBase || employee.baseSalary, employee.variableSalary || 0);
    }
    // Calculate income tax
    let taxResult = { annualTax: 0, monthlyTax: 0, effectiveRate: 0, breakdown: [] };
    if (options.includeTax !== false) {
        // Calculate income tax (annual then divide by 12)
        const annualTaxableIncome = taxableIncome * 12;
        const annualInsurance = insuranceResult.employeeContribution * 12;
        const personalExemption = employee.personalExemption || 15000;
        taxResult = yield (0, taxService_1.calculateEgyptianIncomeTax)(annualTaxableIncome, annualInsurance, personalExemption);
    }
    // Calculate other deductions (overtime, absence, lateness)
    const deductions = yield (0, exports.calculateDeductions)(context);
    // Sum up all deductions
    const totalDeductions = insuranceResult.employeeContribution +
        taxResult.monthlyTax +
        deductions.reduce((sum, d) => sum + d.amount, 0) +
        loanDeductions;
    // Calculate net salary
    const netSalary = Math.round((grossSalary - totalDeductions) * 100) / 100;
    return {
        employeeId,
        grossSalary,
        earnings,
        taxableIncome,
        insuranceBase: insuranceResult.insuranceBase,
        socialInsurance: insuranceResult.employeeContribution,
        employerInsurance: insuranceResult.employerContribution,
        incomeTax: taxResult.monthlyTax,
        taxBreakdown: taxResult.breakdown,
        deductions,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        loanDeductions,
        netSalary
    };
});
exports.calculateEmployeePayroll = calculateEmployeePayroll;
/**
 * Add or update employee salary component
 */
const setEmployeeSalaryComponent = (employeeId_1, componentId_1, amount_1, effectiveFrom_1, ...args_1) => __awaiter(void 0, [employeeId_1, componentId_1, amount_1, effectiveFrom_1, ...args_1], void 0, function* (employeeId, componentId, amount, effectiveFrom, options = {}) {
    var _a;
    const { randomUUID: uuidv4 } = require('crypto');
    const id = uuidv4();
    // Deactivate any existing active entries for this component
    yield db_1.pool.query(`
    UPDATE employee_salary_structure 
    SET isActive = 0, effectiveTo = DATE_SUB(?, INTERVAL 1 DAY)
    WHERE employeeId = ? AND componentId = ? AND isActive = 1
  `, [effectiveFrom.toISOString().split('T')[0], employeeId, componentId]);
    // Insert new entry
    yield db_1.pool.query(`
    INSERT INTO employee_salary_structure 
    (id, employeeId, componentId, amount, percentage, calculationType, customFormula, effectiveFrom, effectiveTo, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
        id,
        employeeId,
        componentId,
        amount,
        options.percentage || null,
        options.calculationType || 'FIXED',
        options.customFormula || null,
        effectiveFrom.toISOString().split('T')[0],
        ((_a = options.effectiveTo) === null || _a === void 0 ? void 0 : _a.toISOString().split('T')[0]) || null,
        options.notes || null
    ]);
    return id;
});
exports.setEmployeeSalaryComponent = setEmployeeSalaryComponent;
/**
 * Create default salary structure from employee base salary
 * This migrates employees from the old single-salary system
 */
const createDefaultSalaryStructure = (employeeId_1, baseSalary_1, ...args_1) => __awaiter(void 0, [employeeId_1, baseSalary_1, ...args_1], void 0, function* (employeeId, baseSalary, variableSalary = 0) {
    const effectiveFrom = new Date();
    // Get component IDs
    const [components] = yield db_1.pool.query(`
    SELECT id, code FROM salary_components WHERE code IN ('BASIC', 'VARIABLE')
  `);
    const basicComponent = components.find((c) => c.code === 'BASIC');
    const variableComponent = components.find((c) => c.code === 'VARIABLE');
    if (basicComponent && baseSalary > 0) {
        yield (0, exports.setEmployeeSalaryComponent)(employeeId, basicComponent.id, baseSalary, effectiveFrom);
    }
    if (variableComponent && variableSalary > 0) {
        yield (0, exports.setEmployeeSalaryComponent)(employeeId, variableComponent.id, variableSalary, effectiveFrom);
    }
});
exports.createDefaultSalaryStructure = createDefaultSalaryStructure;
/**
 * Create a new salary component
 */
const createSalaryComponent = (component) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { randomUUID: uuidv4 } = require('crypto');
    const id = uuidv4();
    // ON DUPLICATE KEY UPDATE prevents a crash when the same code is submitted
    // twice (e.g. rapid double-click). Returns the existing row's id instead.
    yield db_1.pool.query(`
    INSERT INTO salary_components 
    (id, code, name, nameEn, type, category, isTaxable, isInsuranceSubject, defaultFormula, displayOrder, isActive)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON DUPLICATE KEY UPDATE
      name               = VALUES(name),
      nameEn             = VALUES(nameEn),
      type               = VALUES(type),
      category           = VALUES(category),
      isTaxable          = VALUES(isTaxable),
      isInsuranceSubject = VALUES(isInsuranceSubject),
      defaultFormula     = VALUES(defaultFormula),
      displayOrder       = VALUES(displayOrder),
      isActive           = 1
  `, [
        id,
        component.code,
        component.name,
        component.nameEn || null,
        component.type,
        component.category,
        component.isTaxable ? 1 : 0,
        component.isInsuranceSubject ? 1 : 0,
        component.defaultFormula || null,
        component.displayOrder || 0
    ]);
    // Fetch the real id in case an existing row was updated instead of inserted
    const [existing] = yield db_1.pool.query('SELECT id FROM salary_components WHERE code = ?', [component.code]);
    return (_b = (_a = existing[0]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : id;
});
exports.createSalaryComponent = createSalaryComponent;
/**
 * Update a salary component
 */
// Only these keys are actual DB columns — any extra UI fields sent by the
// frontend (e.g. uiPercentage) are silently ignored instead of crashing.
const SALARY_COMPONENT_DB_COLUMNS = new Set([
    'code', 'name', 'nameEn', 'type', 'category',
    'isTaxable', 'isInsuranceSubject', 'defaultFormula',
    'displayOrder', 'isActive',
]);
const updateSalaryComponent = (id, updates) => __awaiter(void 0, void 0, void 0, function* () {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
        if (!SALARY_COMPONENT_DB_COLUMNS.has(key))
            continue;
        if (value === undefined)
            continue;
        fields.push(`${key} = ?`);
        values.push(value);
    }
    if (fields.length === 0)
        return;
    values.push(id);
    yield db_1.pool.query(`
    UPDATE salary_components
    SET ${fields.join(', ')}
    WHERE id = ?
  `, values);
});
exports.updateSalaryComponent = updateSalaryComponent;
/**
 * Delete (soft delete) a salary component
 */
const deleteSalaryComponent = (id) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query('UPDATE salary_components SET isActive = 0 WHERE id = ?', [id]);
});
exports.deleteSalaryComponent = deleteSalaryComponent;
exports.default = {
    getActiveSalaryComponents: exports.getActiveSalaryComponents,
    getEmployeeSalaryStructure: exports.getEmployeeSalaryStructure,
    calculateEarnings: exports.calculateEarnings,
    calculateDeductions: exports.calculateDeductions,
    calculateEmployeePayroll: exports.calculateEmployeePayroll,
    setEmployeeSalaryComponent: exports.setEmployeeSalaryComponent,
    createDefaultSalaryStructure: exports.createDefaultSalaryStructure,
    createSalaryComponent: exports.createSalaryComponent,
    updateSalaryComponent: exports.updateSalaryComponent,
    deleteSalaryComponent: exports.deleteSalaryComponent
};
