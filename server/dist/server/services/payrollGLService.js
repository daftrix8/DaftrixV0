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
exports.deleteRuleCategory = exports.updateRuleCategory = exports.createRuleCategory = exports.getRuleCategories = exports.postPayrollJournal = exports.buildPayrollJournalEntries = exports.deleteGLMapping = exports.upsertGLMapping = exports.getGLMappings = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
// ============================================
// GL MAPPING CRUD
// ============================================
const getGLMappings = () => __awaiter(void 0, void 0, void 0, function* () {
    const [rows] = yield db_1.pool.query(`
        SELECT pgm.*,
            sc.name as componentName, sc.code as componentCode,
            da.name as debitAccountName, ca.name as creditAccountName
        FROM payroll_gl_mappings pgm
        LEFT JOIN salary_components sc ON pgm.componentId = sc.id
        LEFT JOIN accounts da ON pgm.debitAccountId = da.id
        LEFT JOIN accounts ca ON pgm.creditAccountId = ca.id
        WHERE pgm.isActive = 1
        ORDER BY pgm.mappingType, sc.displayOrder
    `);
    return rows;
});
exports.getGLMappings = getGLMappings;
const upsertGLMapping = (data) => __awaiter(void 0, void 0, void 0, function* () {
    // Check existing mapping
    let query = 'SELECT id FROM payroll_gl_mappings WHERE mappingType = ?';
    const params = [data.mappingType];
    if (data.componentId) {
        query += ' AND componentId = ?';
        params.push(data.componentId);
    }
    else {
        query += ' AND componentId IS NULL';
    }
    const [existing] = yield db_1.pool.query(query, params);
    if (existing.length > 0) {
        // Update
        yield db_1.pool.query(`
            UPDATE payroll_gl_mappings 
            SET debitAccountId = ?, creditAccountId = ?, description = ?
            WHERE id = ?
        `, [data.debitAccountId || null, data.creditAccountId || null,
            data.description || null, existing[0].id]);
        return existing[0].id;
    }
    else {
        // Insert
        const id = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`
            INSERT INTO payroll_gl_mappings (id, componentId, mappingType, debitAccountId, creditAccountId, description)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [id, data.componentId || null, data.mappingType,
            data.debitAccountId || null, data.creditAccountId || null,
            data.description || null]);
        return id;
    }
});
exports.upsertGLMapping = upsertGLMapping;
const deleteGLMapping = (id) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query('DELETE FROM payroll_gl_mappings WHERE id = ?', [id]);
});
exports.deleteGLMapping = deleteGLMapping;
// ============================================
// GENERATE COMPONENT-LEVEL GL ENTRIES
// ============================================
/**
 * Build detailed journal lines for a payroll cycle
 * Returns structured lines that can be reviewed before posting
 */
const buildPayrollJournalEntries = (payrollCycleId, treasuryAccountId, entryIds) => __awaiter(void 0, void 0, void 0, function* () {
    // Get GL mappings
    const mappings = yield (0, exports.getGLMappings)();
    const hasMappings = mappings.some(m => m.debitAccountId || m.creditAccountId);
    if (!hasMappings) {
        // No component-level mappings configured — return empty for fallback
        return {
            lines: [],
            summary: {
                totalEarnings: 0,
                totalDeductions: 0,
                totalInsuranceEmployee: 0,
                totalInsuranceEmployer: 0,
                totalTax: 0,
                totalNet: 0,
                employeeCount: 0
            },
            isComponentLevel: false
        };
    }
    // Get payroll entries
    let entriesQuery = `
        SELECT pe.*, e.fullName as employeeName, e.department
        FROM payroll_entries pe
        JOIN employees e ON pe.employeeId = e.id
        WHERE pe.payrollId = ? AND pe.status = 'PENDING'
    `;
    const queryParams = [payrollCycleId];
    if (entryIds && entryIds.length > 0) {
        const placeholders = entryIds.map(() => '?').join(',');
        entriesQuery += ` AND pe.id IN (${placeholders})`;
        queryParams.push(...entryIds);
    }
    const [entries] = yield db_1.pool.query(entriesQuery, queryParams);
    const journalLines = [];
    const accountTotals = new Map();
    let totalEarnings = 0;
    let totalDeductions = 0;
    let totalInsuranceEmployee = 0;
    let totalInsuranceEmployer = 0;
    let totalTax = 0;
    let totalNet = 0;
    // Build mapping lookups
    const componentMappings = new Map();
    const systemMappings = new Map();
    for (const m of mappings) {
        if (m.componentId) {
            componentMappings.set(m.componentId, m);
        }
        else {
            systemMappings.set(m.mappingType, m);
        }
    }
    for (const entry of entries) {
        const netSalary = parseFloat(entry.netSalary) || 0;
        const socialInsurance = parseFloat(entry.socialInsurance) || 0;
        const employerInsurance = parseFloat(entry.employerInsurance) || 0;
        const incomeTax = parseFloat(entry.incomeTax) || 0;
        const grossSalary = parseFloat(entry.grossSalary) || 0;
        totalEarnings += grossSalary;
        totalInsuranceEmployee += socialInsurance;
        totalInsuranceEmployer += employerInsurance;
        totalTax += incomeTax;
        totalNet += netSalary;
        // Parse earnings breakdown for component-level
        let earningsBreakdown = [];
        try {
            earningsBreakdown = typeof entry.earningsBreakdown === 'string'
                ? JSON.parse(entry.earningsBreakdown)
                : entry.earningsBreakdown || [];
        }
        catch (e) {
            earningsBreakdown = [];
        }
        // Post each earning component
        for (const earning of earningsBreakdown) {
            const mapping = componentMappings.get(earning.componentId);
            if (mapping === null || mapping === void 0 ? void 0 : mapping.debitAccountId) {
                const key = `debit-${mapping.debitAccountId}`;
                const existing = accountTotals.get(key) || {
                    debit: 0, credit: 0,
                    label: `${mapping.componentName || earning.name} - مصروفات`,
                    name: mapping.debitAccountName || ''
                };
                existing.debit += earning.amount;
                accountTotals.set(key, existing);
            }
        }
        // Insurance - employee share
        if (socialInsurance > 0) {
            const insMapping = systemMappings.get('INSURANCE_EMPLOYEE');
            if (insMapping === null || insMapping === void 0 ? void 0 : insMapping.creditAccountId) {
                const key = `credit-INS_EMP-${insMapping.creditAccountId}`;
                const existing = accountTotals.get(key) || {
                    debit: 0, credit: 0,
                    label: 'تأمينات اجتماعية - حصة الموظف',
                    name: insMapping.creditAccountName || ''
                };
                existing.credit += socialInsurance;
                accountTotals.set(key, existing);
            }
            totalDeductions += socialInsurance;
        }
        // Insurance - employer share
        if (employerInsurance > 0) {
            const empInsMapping = systemMappings.get('INSURANCE_EMPLOYER');
            if (empInsMapping === null || empInsMapping === void 0 ? void 0 : empInsMapping.debitAccountId) {
                const key = `debit-INS_ER-${empInsMapping.debitAccountId}`;
                const existing = accountTotals.get(key) || {
                    debit: 0, credit: 0,
                    label: 'تأمينات اجتماعية - حصة صاحب العمل',
                    name: empInsMapping.debitAccountName || ''
                };
                existing.debit += employerInsurance;
                accountTotals.set(key, existing);
            }
            if (empInsMapping === null || empInsMapping === void 0 ? void 0 : empInsMapping.creditAccountId) {
                const key = `credit-INS_ER-${empInsMapping.creditAccountId}`;
                const existing = accountTotals.get(key) || {
                    debit: 0, credit: 0,
                    label: 'تأمينات اجتماعية مستحقة',
                    name: empInsMapping.creditAccountName || ''
                };
                existing.credit += employerInsurance;
                accountTotals.set(key, existing);
            }
        }
        // Tax
        if (incomeTax > 0) {
            const taxMapping = systemMappings.get('TAX');
            if (taxMapping === null || taxMapping === void 0 ? void 0 : taxMapping.creditAccountId) {
                const key = `credit-TAX-${taxMapping.creditAccountId}`;
                const existing = accountTotals.get(key) || {
                    debit: 0, credit: 0,
                    label: 'ضريبة كسب عمل مستحقة',
                    name: taxMapping.creditAccountName || ''
                };
                existing.credit += incomeTax;
                accountTotals.set(key, existing);
            }
            totalDeductions += incomeTax;
        }
    }
    // Net Salary → Credit Treasury
    if (totalNet > 0) {
        const key = `credit-TREASURY-${treasuryAccountId}`;
        accountTotals.set(key, {
            debit: 0, credit: totalNet,
            label: 'صافي الرواتب - الخزينة',
            name: ''
        });
    }
    // Convert to journal lines
    for (const [key, totals] of accountTotals.entries()) {
        const accountId = key.split('-').slice(-1)[0]; // Last part is the account ID
        if (totals.debit > 0) {
            journalLines.push({
                accountId,
                accountName: totals.name,
                debit: Math.round(totals.debit * 100) / 100,
                credit: 0,
                label: totals.label
            });
        }
        if (totals.credit > 0) {
            journalLines.push({
                accountId,
                accountName: totals.name,
                debit: 0,
                credit: Math.round(totals.credit * 100) / 100,
                label: totals.label
            });
        }
    }
    return {
        lines: journalLines,
        summary: {
            totalEarnings: Math.round(totalEarnings * 100) / 100,
            totalDeductions: Math.round(totalDeductions * 100) / 100,
            totalInsuranceEmployee: Math.round(totalInsuranceEmployee * 100) / 100,
            totalInsuranceEmployer: Math.round(totalInsuranceEmployer * 100) / 100,
            totalTax: Math.round(totalTax * 100) / 100,
            totalNet: Math.round(totalNet * 100) / 100,
            employeeCount: entries.length
        },
        isComponentLevel: true
    };
});
exports.buildPayrollJournalEntries = buildPayrollJournalEntries;
/**
 * Post the component-level journal to the ledger
 */
const postPayrollJournal = (conn_1, cycleId_1, month_1, year_1, lines_1, ...args_1) => __awaiter(void 0, [conn_1, cycleId_1, month_1, year_1, lines_1, ...args_1], void 0, function* (conn, cycleId, month, year, lines, isPartial = false) {
    const journalId = (0, crypto_1.randomUUID)();
    const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const description = isPartial
        ? `رواتب شهر ${month}/${year} (تفصيلي - دفعة جزئية)`
        : `رواتب شهر ${month}/${year} (قيد تفصيلي بمكونات الراتب)`;
    yield conn.query(`
        INSERT INTO journal_entries (id, date, description, referenceId)
        VALUES (?, ?, ?, ?)
    `, [journalId, date, description, `PAYROLL-GL-${month}-${year}${isPartial ? '-PARTIAL' : ''}`]);
    for (const line of lines) {
        yield conn.query(`
            INSERT INTO journal_lines (journalId, accountId, debit, credit)
            VALUES (?, ?, ?, ?)
        `, [journalId, line.accountId, line.debit, line.credit]);
        // Update account balances
        if (line.debit > 0) {
            yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [line.debit, line.accountId]);
        }
        if (line.credit > 0) {
            yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) - ? WHERE id = ?', [line.credit, line.accountId]);
        }
    }
    return journalId;
});
exports.postPayrollJournal = postPayrollJournal;
// ============================================
// RULE CATEGORIES
// ============================================
const getRuleCategories = () => __awaiter(void 0, void 0, void 0, function* () {
    const [rows] = yield db_1.pool.query(`
        SELECT src.*,
            (SELECT COUNT(*) FROM salary_components sc WHERE sc.categoryId = src.id) as componentCount
        FROM salary_rule_categories src
        WHERE src.isActive = 1
        ORDER BY src.sequence ASC
    `);
    return rows;
});
exports.getRuleCategories = getRuleCategories;
const createRuleCategory = (data) => __awaiter(void 0, void 0, void 0, function* () {
    const id = (0, crypto_1.randomUUID)();
    yield db_1.pool.query(`
        INSERT INTO salary_rule_categories (id, name, nameEn, code, parentId, sequence)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [id, data.name, data.nameEn || null, data.code, data.parentId || null, data.sequence || 0]);
    return id;
});
exports.createRuleCategory = createRuleCategory;
const updateRuleCategory = (id, data) => __awaiter(void 0, void 0, void 0, function* () {
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
    values.push(id);
    yield db_1.pool.query(`UPDATE salary_rule_categories SET ${fields.join(', ')} WHERE id = ?`, values);
});
exports.updateRuleCategory = updateRuleCategory;
const deleteRuleCategory = (id) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query('UPDATE salary_rule_categories SET isActive = 0 WHERE id = ?', [id]);
});
exports.deleteRuleCategory = deleteRuleCategory;
exports.default = {
    getGLMappings: exports.getGLMappings,
    upsertGLMapping: exports.upsertGLMapping,
    deleteGLMapping: exports.deleteGLMapping,
    buildPayrollJournalEntries: exports.buildPayrollJournalEntries,
    postPayrollJournal: exports.postPayrollJournal,
    getRuleCategories: exports.getRuleCategories,
    createRuleCategory: exports.createRuleCategory,
    updateRuleCategory: exports.updateRuleCategory,
    deleteRuleCategory: exports.deleteRuleCategory
};
