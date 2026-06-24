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
exports.migrateEmployeeSalaryStructure = exports.calculatePayrollPreview = exports.getInsuranceConfig = exports.getTaxBrackets = exports.calculateTaxPreview = exports.verifyTreasuryForPayroll = exports.getTreasuryBalance = exports.preflightPayrollApproval = exports.updatePayrollEntry = exports.approvePayroll = exports.calculatePayroll = exports.deletePayrollCycle = exports.createPayrollCycle = exports.getPayrollEntries = exports.getPayrollCycle = exports.getPayrollCycles = void 0;
const db_1 = require("../../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../../utils/errorHandler");
const salaryService = __importStar(require("../../services/salaryService"));
const loanService = __importStar(require("../../services/loanService"));
const salaryStructureService = __importStar(require("../../services/salaryStructureService"));
const treasuryService = __importStar(require("../../services/treasuryService"));
const getPayrollCycles = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.pool.query(`
      SELECT * FROM payroll_cycles ORDER BY year DESC, month DESC, payrollType ASC, weekNumber ASC
    `);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching payroll cycles:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch payroll cycles');
    }
});
exports.getPayrollCycles = getPayrollCycles;
const getPayrollCycle = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const [rows] = yield db_1.pool.query('SELECT * FROM payroll_cycles WHERE id = ?', [id]);
        if (rows.length === 0)
            return res.status(404).json({ error: 'Payroll cycle not found' });
        res.json(rows[0]);
    }
    catch (error) {
        console.error('Error fetching payroll cycle:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch payroll cycle');
    }
});
exports.getPayrollCycle = getPayrollCycle;
const getPayrollEntries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { payrollId } = req.params;
    try {
        const [rows] = yield db_1.pool.query(`
      SELECT pe.*, e.fullName, e.jobTitle, e.department
      FROM payroll_entries pe
      JOIN employees e ON pe.employeeId = e.id
      WHERE pe.payrollId = ?
    `, [payrollId]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching payroll entries:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch payroll entries');
    }
});
exports.getPayrollEntries = getPayrollEntries;
const createPayrollCycle = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { month, year, notes, includeTax, includeInsurance, payrollType, weekNumber } = req.body;
    const isWeekly = payrollType === 'WEEKLY';
    // For weekly cycles, auto-compute startDate/endDate from year + month + weekNumber
    let startDate = null;
    let endDate = null;
    if (isWeekly && weekNumber) {
        const weekStart = (weekNumber - 1) * 7 + 1;
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        const weekEnd = Math.min(weekStart + 6, lastDayOfMonth);
        startDate = `${year}-${String(month).padStart(2, '0')}-${String(weekStart).padStart(2, '0')}`;
        endDate = `${year}-${String(month).padStart(2, '0')}-${String(weekEnd).padStart(2, '0')}`;
    }
    try {
        const id = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`
      INSERT INTO payroll_cycles (id, month, year, status, notes, includeTax, includeInsurance, payrollType, weekNumber, startDate, endDate)
      VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?)
    `, [
            id, month, year, notes, includeTax !== false, includeInsurance !== false,
            isWeekly ? 'WEEKLY' : 'MONTHLY',
            isWeekly ? weekNumber : null,
            startDate, endDate
        ]);
        res.status(201).json({ id, message: 'Payroll cycle created' });
    }
    catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            const label = isWeekly ? `الأسبوع ${weekNumber} من هذا الشهر` : 'هذا الشهر';
            return res.status(400).json({ error: `مسير الرواتب لـ${label} موجود بالفعل` });
        }
        console.error('Error creating payroll cycle:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'create payroll cycle');
    }
});
exports.createPayrollCycle = createPayrollCycle;
const deletePayrollCycle = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Check if cycle exists
        const [cycles] = yield conn.query('SELECT * FROM payroll_cycles WHERE id = ?', [id]);
        if (cycles.length === 0)
            return res.status(404).json({ error: 'Cycle not found' });
        const cycle = cycles[0];
        // Reverse financial entries if cycle is not draft
        if (cycle.status === 'APPROVED' || cycle.status === 'PAID' || cycle.status === 'CALCULATED' || cycle.status === 'DRAFT') {
            const referencePattern = `PAYROLL-${id}%`;
            const legacyPattern = `PAYROLL-${cycle.month}-${cycle.year}%`;
            const [journalRows] = yield conn.query('SELECT id FROM journal_entries WHERE referenceId LIKE ? OR referenceId LIKE ?', [referencePattern, legacyPattern]);
            for (const journal of journalRows) {
                const [lines] = yield conn.query('SELECT accountId, debit, credit FROM journal_lines WHERE journalId = ?', [journal.id]);
                for (const line of lines) {
                    const diff = (Number(line.debit) || 0) - (Number(line.credit) || 0);
                    yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) - ? WHERE id = ?', [diff, line.accountId]);
                    yield conn.query('UPDATE banks SET balance = COALESCE(balance, 0) - ? WHERE accountId = ?', [diff, line.accountId]);
                }
                yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [journal.id]);
                yield conn.query('DELETE FROM journal_entries WHERE id = ?', [journal.id]);
            }
            // Reverse advance deductions
            const [entries] = yield conn.query("SELECT * FROM payroll_entries WHERE payrollId = ? AND status = 'PAID'", [id]);
            for (const entry of entries) {
                const advanceAmount = parseFloat(entry.advances) || 0;
                if (advanceAmount <= 0)
                    continue;
                try {
                    const advanceQuery = `
                        SELECT id, remainingAmount, totalPaid, status, amount
                        FROM employee_advances
                        WHERE employeeId = ? AND (
                            status = 'ACTIVE' OR status = 'COMPLETED'
                        )
                        ORDER BY issueDate ASC
                    `;
                    const [advances] = yield conn.query(advanceQuery, [entry.employeeId]);
                    let remainingToRestore = advanceAmount;
                    for (const adv of advances) {
                        if (remainingToRestore <= 0)
                            break;
                        const totalPaid = parseFloat(adv.totalPaid) || 0;
                        const restoreAmount = Math.min(remainingToRestore, totalPaid);
                        if (restoreAmount > 0) {
                            const newRemaining = (parseFloat(adv.remainingAmount) || 0) + restoreAmount;
                            const newTotalPaid = Math.max(0, totalPaid - restoreAmount);
                            yield conn.query(`
                                UPDATE employee_advances 
                                SET remainingAmount = ?, totalPaid = ?, status = 'ACTIVE'
                                WHERE id = ?
                            `, [newRemaining, newTotalPaid, adv.id]);
                            remainingToRestore -= restoreAmount;
                        }
                    }
                }
                catch (advErr) {
                    console.warn(`Warning restoring advances:`, advErr);
                }
            }
            // Reverse loan installment deductions
            try {
                yield conn.query(`
                    UPDATE loan_installments 
                    SET status = 'PENDING' 
                    WHERE payrollId = ? AND status = 'DEDUCTED'
                `, [id]).catch(() => { });
            }
            catch (loanErr) {
                console.warn('Warning restoring loan installments:', loanErr);
            }
            // Reverse applied additional salary entries
            try {
                yield conn.query(`
                    UPDATE additional_salary_entries
                    SET status = 'APPROVED', appliedInCycleId = NULL
                    WHERE appliedInCycleId = ? AND isRecurring = 0
                `, [id]);
            }
            catch (aseErr) {
                console.warn('Warning restoring additional salary entries:', aseErr);
            }
        }
        // Delete entries and cycle
        yield conn.query('DELETE FROM payroll_entries WHERE payrollId = ?', [id]);
        yield conn.query('DELETE FROM payroll_cycles WHERE id = ?', [id]);
        yield conn.commit();
        res.json({ message: 'تم حذف دورة الرواتب وعكس القيود المحاسبية بنجاح' });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error deleting payroll cycle:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete payroll cycle');
    }
    finally {
        conn.release();
    }
});
exports.deletePayrollCycle = deletePayrollCycle;
const calculatePayroll = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    const { id } = req.params;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // 1. Get Payroll Cycle info and lock it (Fix #3)
        const [cycleRows] = yield conn.query('SELECT * FROM payroll_cycles WHERE id = ? FOR UPDATE', [id]);
        if (cycleRows.length === 0)
            throw new Error('Payroll cycle not found');
        const cycle = cycleRows[0];
        // Recalculation block: block recalculation if cycle is approved or paid
        if (cycle.status !== 'DRAFT') {
            yield conn.rollback();
            return res.status(400).json({ error: 'لا يمكن إعادة الحساب لمسير معتمد أو مدفوع' });
        }
        // 2. Get Active Employees
        const [employees] = yield conn.query('SELECT * FROM employees WHERE status = "ACTIVE"');
        // 3. Clear existing entries for this draft
        yield conn.query('DELETE FROM payroll_entries WHERE payrollId = ?', [id]);
        let totalAmount = 0;
        const processedEntries = [];
        const isWeekly = cycle.payrollType === 'WEEKLY';
        const lastDay = new Date(cycle.year, cycle.month, 0).getDate();
        // Use explicit startDate/endDate from cycle if available, otherwise compute
        const startDate = cycle.startDate
            ? (typeof cycle.startDate === 'string' ? cycle.startDate : new Date(cycle.startDate).toISOString().split('T')[0])
            : `${cycle.year}-${String(cycle.month).padStart(2, '0')}-01`;
        const endDate = cycle.endDate
            ? (typeof cycle.endDate === 'string' ? cycle.endDate : new Date(cycle.endDate).toISOString().split('T')[0])
            : `${cycle.year}-${String(cycle.month).padStart(2, '0')}-${lastDay}`;
        // Calculate period length in days consistently (Fix #11)
        const periodDays = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        // 4. Calculate for each employee using Salary Service
        for (const emp of employees) {
            let paidLeaveDays = 0;
            let unpaidLeaveDays = 0;
            let actualWorkedDays = periodDays;
            let absentDays = 0;
            let lateMinutes = 0;
            let overtimeHours = 0;
            let workingDaysInMonth = periodDays;
            let dataSourceFound = false;
            // Source 1: attendance_records
            try {
                const [stats] = yield conn.query(`
                    SELECT 
                        COUNT(CASE WHEN status = 'ABSENT' THEN 1 END) as absentDays,
                        COUNT(CASE WHEN status = 'LEAVE' THEN 1 END) as leaveDays,
                        SUM(COALESCE(lateMinutes, 0)) as lateMinutes,
                        COALESCE(SUM(overtimeHours), 0) as overtimeHours,
                        COUNT(*) as totalRecords
                    FROM attendance_records
                    WHERE employeeId = ? AND date BETWEEN ? AND ?
                `, [emp.id, startDate, endDate]);
                const totalRecords = parseInt((_a = stats[0]) === null || _a === void 0 ? void 0 : _a.totalRecords) || 0;
                if (totalRecords > 0) {
                    absentDays = parseFloat((_b = stats[0]) === null || _b === void 0 ? void 0 : _b.absentDays) || 0;
                    const leaveDays = parseFloat((_c = stats[0]) === null || _c === void 0 ? void 0 : _c.leaveDays) || 0;
                    lateMinutes = parseFloat((_d = stats[0]) === null || _d === void 0 ? void 0 : _d.lateMinutes) || 0;
                    overtimeHours = parseFloat((_e = stats[0]) === null || _e === void 0 ? void 0 : _e.overtimeHours) || 0;
                    actualWorkedDays = Math.max(0, periodDays - absentDays - leaveDays);
                    dataSourceFound = true;
                }
            }
            catch (e) {
                // Table might not exist
            }
            // Source 2: work_entries (Beast Mode)
            if (!dataSourceFound) {
                try {
                    const [weSummary] = yield conn.query(`
                        SELECT 
                            SUM(CASE WHEN wet.code = 'ATTENDANCE' THEN 1 ELSE 0 END) as attendanceDays,
                            SUM(CASE WHEN wet.code = 'LEAVE_PAID' OR wet.code = 'SICK_LEAVE' THEN 1 ELSE 0 END) as paidLeaveDays,
                            SUM(CASE WHEN wet.code = 'LEAVE_UNPAID' THEN 1 ELSE 0 END) as unpaidLeaveDays,
                            SUM(CASE WHEN wet.code = 'ABSENT' THEN 1 ELSE 0 END) as absentDays,
                            SUM(CASE WHEN wet.code = 'OVERTIME' THEN we.hours ELSE 0 END) as overtimeHours,
                            SUM(CASE WHEN wet.isPaid = 1 THEN 1 ELSE 0 END) as totalPaidDays
                        FROM work_entries we
                        JOIN work_entry_types wet ON we.workEntryTypeId = wet.id
                        WHERE we.employeeId = ? AND we.date BETWEEN ? AND ?
                          AND we.status IN ('VALIDATED', 'DRAFT')
                    `, [emp.id, startDate, endDate]);
                    if (((_f = weSummary[0]) === null || _f === void 0 ? void 0 : _f.attendanceDays) !== null && Number(weSummary[0].attendanceDays) > 0) {
                        paidLeaveDays = Number(weSummary[0].paidLeaveDays) || 0;
                        unpaidLeaveDays = Number(weSummary[0].unpaidLeaveDays) || 0;
                        absentDays = Number(weSummary[0].absentDays) || 0;
                        overtimeHours = Number(weSummary[0].overtimeHours) || 0;
                        actualWorkedDays = Number(weSummary[0].totalPaidDays) || periodDays;
                    }
                }
                catch (weErr) {
                    // Table might not exist
                }
            }
            // Source 3: leave_requests
            try {
                const [leaves] = yield conn.query(`
                    SELECT lr.*, lt.isPaid
                    FROM leave_requests lr
                    JOIN leave_types lt ON lr.leaveTypeId = lt.id
                    WHERE lr.employeeId = ? AND lr.status = 'APPROVED'
                      AND lr.startDate <= ? AND lr.endDate >= ?
                `, [emp.id, endDate, startDate]);
                for (const leave of leaves) {
                    const leaveStart = new Date(Math.max(new Date(leave.startDate).getTime(), new Date(startDate).getTime()));
                    const leaveEnd = new Date(Math.min(new Date(leave.endDate).getTime(), new Date(endDate).getTime()));
                    const days = Math.ceil((leaveEnd.getTime() - leaveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    if (leave.isPaid) {
                        paidLeaveDays += days;
                    }
                    else {
                        unpaidLeaveDays += days;
                    }
                }
            }
            catch (leaveErr) {
                // Table might not exist
            }
            // 4b. Fetch Loan/Advance Deductions
            let loanDeductions = 0;
            let advanceDeductions = 0;
            try {
                const result = yield loanService.getPendingInstallments(emp.id, startDate, endDate);
                loanDeductions = result.total || 0;
            }
            catch (loanErr) {
                // Table might not exist
            }
            // 4b2. Fetch REGULAR ADVANCES
            try {
                const [activeAdvances] = yield conn.query(`
                    SELECT id, amount, monthlyDeduction, remainingAmount
                    FROM employee_advances
                    WHERE employeeId = ? AND status = 'ACTIVE'
                      AND (loanType = 'ADVANCE' OR loanType IS NULL)
                      AND remainingAmount > 0
                `, [emp.id]);
                for (const adv of activeAdvances) {
                    const monthly = parseFloat(adv.monthlyDeduction) || 0;
                    const remaining = parseFloat(adv.remainingAmount) || 0;
                    const deduction = monthly > 0 ? Math.min(monthly, remaining) : remaining;
                    advanceDeductions += deduction;
                }
            }
            catch (advErr) {
                try {
                    const [activeAdvances] = yield conn.query(`
                        SELECT id, amount, monthlyDeduction, remainingAmount
                        FROM employee_advances
                        WHERE employeeId = ? AND status = 'ACTIVE'
                          AND remainingAmount > 0
                    `, [emp.id]);
                    for (const adv of activeAdvances) {
                        const monthly = parseFloat(adv.monthlyDeduction) || 0;
                        const remaining = parseFloat(adv.remainingAmount) || 0;
                        const deduction = monthly > 0 ? Math.min(monthly, remaining) : remaining;
                        advanceDeductions += deduction;
                    }
                }
                catch (e) {
                    // Ignore missing column fallback
                }
            }
            // 4c. Fetch Additional Salary entries
            let additionalEarnings = 0;
            let additionalDeductions = 0;
            let additionalBreakdown = [];
            try {
                const [additionalEntries] = yield conn.query(`
                    SELECT ase.*, sc.name as componentName, sc.code as componentCode
                    FROM additional_salary_entries ase
                    LEFT JOIN salary_components sc ON ase.componentId = sc.id
                    WHERE ase.employeeId = ? AND ase.status = 'APPROVED'
                      AND (
                        ase.payrollCycleId = ?
                        OR (ase.payrollCycleId IS NULL AND ase.appliedInCycleId IS NULL AND ase.isRecurring = 0)
                        OR (ase.isRecurring = 1 AND ase.recurringFrom <= ? AND (ase.recurringTo IS NULL OR ase.recurringTo >= ?))
                      )
                `, [emp.id, id, endDate, startDate]);
                for (const entry of additionalEntries) {
                    const amount = parseFloat(entry.amount) || 0;
                    additionalBreakdown.push({
                        id: entry.id,
                        name: entry.name,
                        amount,
                        type: entry.type,
                        source: entry.source,
                        componentName: entry.componentName
                    });
                    if (entry.type === 'EARNING') {
                        additionalEarnings += amount;
                    }
                    else {
                        additionalDeductions += amount;
                    }
                }
                // Mark non-recurring entries as applied
                const nonRecurringIds = additionalEntries
                    .filter((e) => !e.isRecurring)
                    .map((e) => e.id);
                if (nonRecurringIds.length > 0) {
                    const placeholders = nonRecurringIds.map(() => '?').join(',');
                    yield conn.query(`
                        UPDATE additional_salary_entries 
                        SET status = 'APPLIED', appliedInCycleId = ?
                        WHERE id IN (${placeholders})
                    `, [id, ...nonRecurringIds]);
                }
            }
            catch (addErr) {
                // Table might not exist
            }
            // 4d. Pay calculations
            const empMonthlySalary = parseFloat(emp.baseSalary) || 0;
            let empBaseSalary;
            if (isWeekly) {
                empBaseSalary = emp.employmentType === 'WEEKLY'
                    ? empMonthlySalary
                    : Math.round((empMonthlySalary / 4) * 100) / 100;
            }
            else {
                empBaseSalary = empMonthlySalary;
            }
            const dailyRate = isWeekly ? empBaseSalary / 7 : empBaseSalary / 30;
            const hourlyRate = dailyRate / 8;
            let earningsBreakdown = [];
            let deductionsBreakdown = [];
            let templateGross = 0;
            let templateDeductions = 0;
            let usedTemplate = false;
            try {
                const templateContext = {
                    BASIC_SALARY: empBaseSalary,
                    WORKING_DAYS: periodDays,
                    ABSENT_DAYS: absentDays,
                    OVERTIME_HOURS: overtimeHours,
                    WORKING_DAYS_IN_MONTH: periodDays,
                    ACTUAL_WORKED_DAYS: periodDays - absentDays,
                };
                const templateResult = yield salaryStructureService.calculateFromTemplate(emp.id, templateContext, new Date(startDate));
                if (templateResult.earnings.length > 0) {
                    usedTemplate = true;
                    earningsBreakdown = templateResult.earnings;
                    deductionsBreakdown = templateResult.deductions;
                    templateGross = templateResult.grossSalary;
                    templateDeductions = templateResult.totalDeductions;
                }
            }
            catch (tmplErr) {
                // Expose failed template calculation diagnostics (Fix #8)
                console.warn(`[calculatePayroll] Template calculation failed for employee ${emp.fullName} (${emp.id}): ${(tmplErr === null || tmplErr === void 0 ? void 0 : tmplErr.message) || tmplErr}`);
            }
            if (!usedTemplate) {
                earningsBreakdown = [{
                        componentId: 'BASIC',
                        code: 'BASIC',
                        name: 'الراتب الأساسي',
                        amount: empBaseSalary,
                        isTaxable: true,
                        isInsuranceSubject: true,
                        category: 'BASIC'
                    }];
                templateGross = empBaseSalary;
            }
            const overtimeMultiplier = 1.5;
            const overtimeAmount = Math.round(hourlyRate * overtimeHours * overtimeMultiplier * 100) / 100;
            const incentives = 0;
            const grossSalary = Math.round((templateGross + overtimeAmount + incentives + additionalEarnings) * 100) / 100;
            const absenceAmount = Math.round(absentDays * dailyRate * 100) / 100;
            const unpaidLeaveDeduction = Math.round(unpaidLeaveDays * dailyRate * 100) / 100;
            let socialInsurance = 0;
            let employerInsurance = 0;
            let insuranceBase = 0;
            if (cycle.includeInsurance !== 0) {
                try {
                    const insResult = yield salaryService.calculateEmployeePayroll(emp.id, {
                        baseSalary: empBaseSalary,
                        variableSalary: parseFloat(emp.variableSalary) || 0,
                        basicSalaryInsurable: parseFloat(emp.basicSalaryInsurable) || empBaseSalary,
                        personalExemption: parseFloat(emp.personalExemption) || 15000
                    }, {}, 0, { includeTax: false, includeInsurance: true });
                    socialInsurance = insResult.socialInsurance;
                    employerInsurance = insResult.employerInsurance;
                    insuranceBase = insResult.insuranceBase;
                }
                catch (insErr) {
                    console.warn(`Insurance preview failed:`, insErr);
                }
            }
            let incomeTax = 0;
            let taxBreakdown = [];
            if (cycle.includeTax !== 0) {
                try {
                    const taxResult = yield salaryService.calculateEmployeePayroll(emp.id, {
                        baseSalary: empBaseSalary,
                        variableSalary: parseFloat(emp.variableSalary) || 0,
                        basicSalaryInsurable: parseFloat(emp.basicSalaryInsurable) || empBaseSalary,
                        personalExemption: parseFloat(emp.personalExemption) || 15000
                    }, {}, 0, { includeTax: true, includeInsurance: false });
                    incomeTax = taxResult.incomeTax;
                    taxBreakdown = taxResult.taxBreakdown;
                }
                catch (taxErr) {
                    console.warn(`Tax calculation failed:`, taxErr);
                }
            }
            const totalDeductions = Math.round((absenceAmount +
                unpaidLeaveDeduction +
                loanDeductions +
                advanceDeductions +
                additionalDeductions +
                templateDeductions +
                socialInsurance +
                incomeTax) * 100) / 100;
            const netSalary = Math.max(0, Math.round((grossSalary - totalDeductions) * 100) / 100);
            if (grossSalary - totalDeductions < 0) {
                console.warn(`⚠️ deductions exceed gross for ${emp.fullName}. Net capped at 0.`);
            }
            const entryId = (0, crypto_1.randomUUID)();
            totalAmount += netSalary;
            yield conn.query(`
                INSERT INTO payroll_entries (
                    id, payrollId, employeeId, baseSalary, 
                    overtimeHours, overtimeAmount,
                    grossSalary, netSalary,
                    earningsBreakdown, deductionsBreakdown,
                    socialInsurance, employerInsurance,
                    incomeTax, taxBreakdown,
                    advances, absenceDays, absenceAmount,
                    insuranceBase,
                    paidLeaveDays, unpaidLeaveDays, unpaidLeaveDeduction,
                    workingDaysInMonth, actualWorkedDays,
                    totalDeductions,
                    additionalEarnings, additionalDeductions, additionalBreakdown,
                    department, employeeName,
                    status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
            `, [
                entryId, id, emp.id, empBaseSalary,
                overtimeHours, overtimeAmount,
                grossSalary, netSalary,
                JSON.stringify(earningsBreakdown),
                JSON.stringify(deductionsBreakdown),
                socialInsurance, employerInsurance,
                incomeTax, JSON.stringify(taxBreakdown),
                loanDeductions + advanceDeductions, absentDays, absenceAmount,
                insuranceBase,
                paidLeaveDays, unpaidLeaveDays, unpaidLeaveDeduction,
                workingDaysInMonth, actualWorkedDays,
                totalDeductions,
                additionalEarnings, additionalDeductions,
                additionalBreakdown.length > 0 ? JSON.stringify(additionalBreakdown) : null,
                emp.department || null, emp.fullName || null
            ]);
            processedEntries.push(entryId);
        }
        yield conn.query('UPDATE payroll_cycles SET totalAmount = ? WHERE id = ?', [totalAmount, id]);
        yield conn.commit();
        res.json({
            message: 'تم حساب الرواتب بنجاح',
            totalAmount,
            employeeCount: processedEntries.length,
            details: 'Calculated using Formula Engine V3 (Beast Mode)'
        });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error calculating payroll:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'calculate payroll');
    }
    finally {
        conn.release();
    }
});
exports.calculatePayroll = calculatePayroll;
/**
 * Resolves GL accounts for payroll approval.
 * Optimized locale-agnostic helper (Fix #7).
 */
function resolvePayrollAccounts(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        let treasuryAccountId = null;
        let expenseAccountId = null;
        // 1. Try GL Mappings
        try {
            const [mappings] = yield conn.query(`
            SELECT mappingType, debitAccountId, creditAccountId 
            FROM payroll_gl_mappings 
            WHERE mappingType IN ('SALARY_EXPENSE', 'NET_SALARY', 'BASIC_SALARY')
        `);
            for (const m of mappings) {
                if (m.mappingType === 'SALARY_EXPENSE' && m.debitAccountId)
                    expenseAccountId = m.debitAccountId;
                if (m.mappingType === 'NET_SALARY' && m.creditAccountId)
                    treasuryAccountId = m.creditAccountId;
                if (m.mappingType === 'BASIC_SALARY' && m.creditAccountId && !treasuryAccountId)
                    treasuryAccountId = m.creditAccountId;
            }
        }
        catch (e) {
            // Table doesn't exist yet, ignore
        }
        const [allAccounts] = yield conn.query('SELECT id, code, name, type FROM accounts');
        // 2. Resolve Treasury Account (Asset)
        if (!treasuryAccountId) {
            const cashAsset = allAccounts.find((a) => a.type === 'ASSET' && (String(a.code).startsWith('101') || String(a.code).startsWith('102')));
            if (cashAsset) {
                treasuryAccountId = cashAsset.id;
            }
            else {
                const arabicCash = allAccounts.find((a) => a.type === 'ASSET' && (String(a.name).includes('خزينة') || String(a.name).includes('صندوق') || String(a.name).includes('بنك')));
                if (arabicCash)
                    treasuryAccountId = arabicCash.id;
            }
        }
        // 3. Resolve Expense Account (Expense)
        if (!expenseAccountId) {
            const salaryExpense = allAccounts.find((a) => a.type === 'EXPENSE' && (String(a.code).startsWith('41') || String(a.code).startsWith('31')));
            if (salaryExpense) {
                expenseAccountId = salaryExpense.id;
            }
            else {
                const generalExpense = allAccounts.find((a) => a.type === 'EXPENSE' && String(a.code).startsWith('4'));
                if (generalExpense) {
                    expenseAccountId = generalExpense.id;
                }
                else {
                    const arabicExpense = allAccounts.find((a) => a.type === 'EXPENSE' && (String(a.name).includes('رواتب') || String(a.name).includes('أجور') || String(a.name).includes('مرتبات')));
                    if (arabicExpense)
                        expenseAccountId = arabicExpense.id;
                }
            }
        }
        // Fallbacks to any ASSET/EXPENSE if still null
        if (!treasuryAccountId) {
            const anyAsset = allAccounts.find((a) => a.type === 'ASSET');
            if (anyAsset)
                treasuryAccountId = anyAsset.id;
        }
        if (!expenseAccountId) {
            const anyExpense = allAccounts.find((a) => a.type === 'EXPENSE');
            if (anyExpense)
                expenseAccountId = anyExpense.id;
        }
        return { treasuryAccountId, expenseAccountId };
    });
}
const approvePayroll = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    let { treasuryAccountId, expenseAccountId, entryIds } = req.body;
    // Auto-detect accounts if not provided
    if (!treasuryAccountId || !expenseAccountId) {
        const autoConn = yield (0, db_1.getConnection)();
        try {
            const resolved = yield resolvePayrollAccounts(autoConn);
            if (!treasuryAccountId)
                treasuryAccountId = resolved.treasuryAccountId;
            if (!expenseAccountId)
                expenseAccountId = resolved.expenseAccountId;
        }
        finally {
            autoConn.release(); // Fix #1: always release connection
        }
        if (!treasuryAccountId || !expenseAccountId) {
            return res.status(400).json({
                error: 'لا يمكن تحديد حسابات الخزينة أو المصروفات تلقائياً. يرجى إنشاء حسابات في شجرة الحسابات أولاً.',
                details: { treasuryAccountId, expenseAccountId }
            });
        }
    }
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const [cycleRows] = yield conn.query('SELECT * FROM payroll_cycles WHERE id = ? FOR UPDATE', [id]);
        if (cycleRows.length === 0)
            throw new Error('Payroll cycle not found');
        const cycle = cycleRows[0];
        if (cycle.status === 'APPROVED' || cycle.status === 'PAID') {
            yield conn.rollback();
            return res.status(409).json({ error: 'CONCURRENT_MODIFICATION: تم اعتماد دورة الرواتب هذه بالفعل.' });
        }
        let entries;
        let isPartialPayment = false;
        if (entryIds && Array.isArray(entryIds) && entryIds.length > 0) {
            // Fix #2: Validate entryIds belong to this specific payroll cycle
            const placeholders = entryIds.map(() => '?').join(',');
            const [validEntries] = yield conn.query(`SELECT id FROM payroll_entries WHERE payrollId = ? AND id IN (${placeholders})`, [id, ...entryIds]);
            if (validEntries.length !== entryIds.length) {
                yield conn.rollback();
                return res.status(400).json({ error: 'بعض مدخلات الرواتب المحددة لا تنتمي لدورة الرواتب هذه.' });
            }
            const [selectedEntries] = yield conn.query(`SELECT * FROM payroll_entries WHERE payrollId = ? AND id IN (${placeholders}) AND status = 'PENDING'`, [id, ...entryIds]);
            entries = selectedEntries;
            isPartialPayment = true;
        }
        else {
            const [allEntries] = yield conn.query('SELECT * FROM payroll_entries WHERE payrollId = ? AND status = \'PENDING\'', [id]);
            entries = allEntries;
        }
        if (entries.length === 0) {
            return res.status(400).json({ error: 'No pending entries to pay' });
        }
        let totalNet = 0;
        for (const entry of entries) {
            totalNet += Number(entry.netSalary) || 0;
        }
        if (totalNet <= 0) {
            yield conn.rollback();
            return res.status(400).json({ error: 'إجمالي الرواتب يساوي صفر - تحقق من بيانات الموظفين' });
        }
        // Verify balance
        const [treasuryAcc] = yield conn.query('SELECT name, balance FROM accounts WHERE id = ?', [treasuryAccountId]);
        if (treasuryAcc.length === 0) {
            yield conn.rollback();
            return res.status(400).json({ error: 'حساب الخزينة المحدد غير موجود.' });
        }
        const availableBalance = parseFloat(treasuryAcc[0].balance) || 0;
        if (availableBalance < totalNet) {
            yield conn.rollback();
            return res.status(400).json({
                error: `رصيد حساب الخزينة (${treasuryAcc[0].name}) غير كافٍ لصرف الرواتب. الرصيد المتاح: ${availableBalance.toLocaleString()} EGP، المطلوب: ${totalNet.toLocaleString()} EGP.`
            });
        }
        const [accountRows] = yield conn.query('SELECT id, name FROM accounts WHERE id IN (?, ?)', [expenseAccountId, treasuryAccountId]);
        const accountNameMap = {};
        for (const acc of accountRows) {
            accountNameMap[acc.id] = acc.name;
        }
        const expenseAccountName = accountNameMap[expenseAccountId] || 'مصروفات رواتب';
        const treasuryAccountName = accountNameMap[treasuryAccountId] || 'الخزينة';
        const journalId = (0, crypto_1.randomUUID)();
        const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const description = isPartialPayment
            ? `رواتب شهر ${cycle.month}/${cycle.year} (${entries.length} موظف - دفعة جزئية)`
            : `رواتب شهر ${cycle.month}/${cycle.year}`;
        yield conn.query(`
      INSERT INTO journal_entries (id, date, description, referenceId)
      VALUES (?, ?, ?, ?)
    `, [
            journalId, date,
            description,
            `PAYROLL-${id}${isPartialPayment ? '-PARTIAL' : ''}`
        ]);
        yield conn.query(`
      INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
      VALUES (?, ?, ?, ?, 0)
    `, [journalId, expenseAccountId, expenseAccountName, totalNet]);
        yield conn.query(`
      INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
      VALUES (?, ?, ?, 0, ?)
    `, [journalId, treasuryAccountId, treasuryAccountName, totalNet]);
        // Fix #12: Update accounts and banks inside transaction safely
        yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [totalNet, expenseAccountId]);
        yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) - ? WHERE id = ?', [totalNet, treasuryAccountId]);
        yield conn.query('UPDATE banks SET balance = COALESCE(balance, 0) - ? WHERE accountId = ?', [totalNet, treasuryAccountId]);
        const paidEntryIds = entries.map((e) => e.id);
        if (paidEntryIds.length > 0) {
            const placeholders = paidEntryIds.map(() => '?').join(',');
            yield conn.query(`UPDATE payroll_entries SET status = 'PAID', paidAt = ? WHERE id IN (${placeholders})`, [date, ...paidEntryIds]);
        }
        const [pendingCount] = yield conn.query('SELECT COUNT(*) as count FROM payroll_entries WHERE payrollId = ? AND status = \'PENDING\'', [id]);
        if (pendingCount[0].count === 0) {
            yield conn.query(`
          UPDATE payroll_cycles 
          SET status = 'APPROVED', approvedAt = ?, approvedBy = ?, version = version + 1
          WHERE id = ?
        `, [date, (_a = req.user) === null || _a === void 0 ? void 0 : _a.id, id]);
        }
        else {
            yield conn.query(`UPDATE payroll_cycles SET version = version + 1 WHERE id = ?`, [id]);
        }
        // Pass connection to service to preserve transaction integrity (Fix #13)
        try {
            const cycleStart = `${cycle.year}-${String(cycle.month).padStart(2, '0')}-01`;
            const cycleEnd = `${cycle.year}-${String(cycle.month).padStart(2, '0')}-31`;
            for (const entry of entries) {
                yield loanService.markInstallmentsAsDeducted(entry.employeeId, id, cycleStart, cycleEnd, conn);
            }
        }
        catch (loanError) {
            console.warn('Could not update loan installments:', loanError);
        }
        // Deduct regular advances
        try {
            for (const entry of entries) {
                const advanceAmount = parseFloat(entry.advances) || 0;
                if (advanceAmount <= 0)
                    continue;
                let activeAdvances = [];
                try {
                    const [rows] = yield conn.query(`
                        SELECT id, monthlyDeduction, remainingAmount
                        FROM employee_advances
                        WHERE employeeId = ? AND status = 'ACTIVE'
                          AND (loanType = 'ADVANCE' OR loanType IS NULL)
                          AND remainingAmount > 0
                        ORDER BY issueDate ASC
                    `, [entry.employeeId]);
                    activeAdvances = rows;
                }
                catch (e) {
                    const [rows] = yield conn.query(`
                        SELECT id, monthlyDeduction, remainingAmount
                        FROM employee_advances
                        WHERE employeeId = ? AND status = 'ACTIVE'
                          AND remainingAmount > 0
                        ORDER BY issueDate ASC
                    `, [entry.employeeId]);
                    activeAdvances = rows;
                }
                let remainingToDeduct = advanceAmount;
                for (const adv of activeAdvances) {
                    if (remainingToDeduct <= 0)
                        break;
                    const monthly = parseFloat(adv.monthlyDeduction) || 0;
                    const remaining = parseFloat(adv.remainingAmount) || 0;
                    const deduction = monthly > 0 ? Math.min(monthly, remaining) : remaining;
                    const actualDeduction = Math.min(deduction, remainingToDeduct);
                    const newRemaining = Math.round((remaining - actualDeduction) * 100) / 100;
                    yield conn.query(`
                        UPDATE employee_advances 
                        SET remainingAmount = ?, totalPaid = COALESCE(totalPaid, 0) + ?
                        WHERE id = ?
                    `, [newRemaining, actualDeduction, adv.id]);
                    if (newRemaining <= 0) {
                        yield conn.query(`
                            UPDATE employee_advances SET status = 'COMPLETED' WHERE id = ?
                        `, [adv.id]);
                    }
                    remainingToDeduct -= actualDeduction;
                }
            }
        }
        catch (advError) {
            console.warn('Could not update advance deductions:', advError);
        }
        yield conn.commit();
        res.json({
            message: isPartialPayment
                ? `تم صرف رواتب ${entries.length} موظف بنجاح (${totalNet.toLocaleString()} جنيه)`
                : 'Payroll approved and posted to journals successfully',
            paidCount: entries.length,
            paidTotal: totalNet,
            isPartialPayment,
            remainingCount: pendingCount[0].count
        });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error approving payroll:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'approve payroll');
    }
    finally {
        conn.release();
    }
});
exports.approvePayroll = approvePayroll;
const updatePayrollEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { entryId } = req.params;
    const body = req.body;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const [entries] = yield conn.query('SELECT * FROM payroll_entries WHERE id = ?', [entryId]);
        if (entries.length === 0) {
            return res.status(404).json({ error: 'Payroll entry not found' });
        }
        const entry = entries[0];
        const [cycles] = yield conn.query('SELECT status FROM payroll_cycles WHERE id = ?', [entry.payrollId]);
        if (cycles.length === 0 || cycles[0].status !== 'DRAFT') {
            return res.status(400).json({ error: 'Cannot edit entries for approved/paid payroll' });
        }
        const baseSalary = body.baseSalary !== undefined ? parseFloat(body.baseSalary) : parseFloat(entry.baseSalary);
        const dailyRate = body.dailyRate !== undefined ? parseFloat(body.dailyRate) : parseFloat(entry.dailyRate) || baseSalary / 30;
        const overtimeRate = body.overtimeRate !== undefined ? parseFloat(body.overtimeRate) : parseFloat(entry.overtimeRate) || (dailyRate / 8) * 1.5;
        const overtimeHours = body.overtimeHours !== undefined ? parseFloat(body.overtimeHours) : parseFloat(entry.overtimeHours) || 0;
        const overtimeAmount = body.overtimeAmount !== undefined ? parseFloat(body.overtimeAmount) : overtimeRate * overtimeHours;
        const incentives = body.incentives !== undefined ? parseFloat(body.incentives) : parseFloat(entry.incentives) || 0;
        const bonus = body.bonus !== undefined ? parseFloat(body.bonus) : parseFloat(entry.bonus) || 0;
        const purchases = body.purchases !== undefined ? parseFloat(body.purchases) : parseFloat(entry.purchases) || 0;
        const advances = body.advances !== undefined ? parseFloat(body.advances) : parseFloat(entry.advances) || 0;
        const absenceDays = body.absenceDays !== undefined ? parseFloat(body.absenceDays) : parseFloat(entry.absenceDays) || 0;
        const absenceAmount = body.absenceAmount !== undefined ? parseFloat(body.absenceAmount) : dailyRate * absenceDays;
        const paidLeaveDays = body.paidLeaveDays !== undefined ? parseFloat(body.paidLeaveDays) : parseFloat(entry.paidLeaveDays) || 0;
        const unpaidLeaveDays = body.unpaidLeaveDays !== undefined ? parseFloat(body.unpaidLeaveDays) : parseFloat(entry.unpaidLeaveDays) || 0;
        const unpaidLeaveDeduction = body.unpaidLeaveDeduction !== undefined ? parseFloat(body.unpaidLeaveDeduction) : parseFloat(entry.unpaidLeaveDeduction) || dailyRate * unpaidLeaveDays;
        const hourDeductions = body.hourDeductions !== undefined ? parseFloat(body.hourDeductions) : parseFloat(entry.hourDeductions) || 0;
        const penaltyDays = body.penaltyDays !== undefined ? parseFloat(body.penaltyDays) : parseFloat(entry.penaltyDays) || 0;
        const penalties = body.penalties !== undefined ? parseFloat(body.penalties) : parseFloat(entry.penalties) || 0;
        const salesmanDeficitDeduction = body.salesmanDeficitDeduction !== undefined ? parseFloat(body.salesmanDeficitDeduction) : parseFloat(entry.salesmanDeficitDeduction) || 0;
        const notes = body.notes !== undefined ? body.notes : entry.notes;
        const allowances = body.allowances !== undefined
            ? (typeof body.allowances === 'string' ? JSON.parse(body.allowances) : body.allowances)
            : JSON.parse(entry.allowances || '[]');
        const deductions = body.deductions !== undefined
            ? (typeof body.deductions === 'string' ? JSON.parse(body.deductions) : body.deductions)
            : JSON.parse(entry.deductions || '[]');
        let earningsBreakdown = [];
        try {
            earningsBreakdown = typeof entry.earningsBreakdown === 'string'
                ? JSON.parse(entry.earningsBreakdown)
                : (entry.earningsBreakdown || []);
        }
        catch (e) {
            earningsBreakdown = [];
        }
        let deductionsBreakdown = [];
        try {
            deductionsBreakdown = typeof entry.deductionsBreakdown === 'string'
                ? JSON.parse(entry.deductionsBreakdown)
                : (entry.deductionsBreakdown || []);
        }
        catch (e) {
            deductionsBreakdown = [];
        }
        allowances.forEach((newComp) => {
            const idx = earningsBreakdown.findIndex((c) => c.componentId === newComp.componentId || c.name === newComp.name);
            if (idx >= 0) {
                earningsBreakdown[idx].amount = Number(newComp.amount);
            }
            else {
                earningsBreakdown.push(Object.assign(Object.assign({}, newComp), { type: 'EARNING' }));
            }
        });
        deductions.forEach((newComp) => {
            const idx = deductionsBreakdown.findIndex((c) => c.componentId === newComp.componentId || c.name === newComp.name);
            if (idx >= 0) {
                deductionsBreakdown[idx].amount = Number(newComp.amount);
            }
            else {
                deductionsBreakdown.push(Object.assign(Object.assign({}, newComp), { type: 'DEDUCTION' }));
            }
        });
        if (body.baseSalary !== undefined) {
            const idx = earningsBreakdown.findIndex((c) => c.code === 'BASIC');
            if (idx >= 0)
                earningsBreakdown[idx].amount = parseFloat(body.baseSalary);
        }
        const otherAllowances = allowances.reduce((sum, a) => sum + Number(a.amount || 0), 0);
        const otherDeductions = deductions.reduce((sum, d) => sum + Number(d.amount || 0), 0);
        const socialInsurance = body.socialInsurance !== undefined ? parseFloat(body.socialInsurance) : parseFloat(entry.socialInsurance) || 0;
        const incomeTax = body.incomeTax !== undefined ? parseFloat(body.incomeTax) : parseFloat(entry.incomeTax) || 0;
        const grossSalary = baseSalary + overtimeAmount + incentives + bonus + otherAllowances;
        const totalDeductions = absenceAmount + unpaidLeaveDeduction + purchases + advances + hourDeductions + penalties + otherDeductions + salesmanDeficitDeduction + socialInsurance + incomeTax;
        const netSalary = grossSalary - totalDeductions;
        yield conn.query(`
            UPDATE payroll_entries SET
                baseSalary = ?, dailyRate = ?, overtimeRate = ?, overtimeHours = ?, overtimeAmount = ?,
                incentives = ?, bonus = ?, allowances = ?, grossSalary = ?,
                purchases = ?, advances = ?, absenceDays = ?, absenceAmount = ?,
                paidLeaveDays = ?, unpaidLeaveDays = ?, unpaidLeaveDeduction = ?,
                hourDeductions = ?, penaltyDays = ?, penalties = ?, deductions = ?, totalDeductions = ?,
                socialInsurance = ?, incomeTax = ?,
                netSalary = ?, notes = ?, salesmanDeficitDeduction = ?,
                earningsBreakdown = ?, deductionsBreakdown = ?
            WHERE id = ?
        `, [
            baseSalary, dailyRate, overtimeRate, overtimeHours, overtimeAmount,
            incentives, bonus, JSON.stringify(allowances), grossSalary,
            purchases, advances, absenceDays, absenceAmount,
            paidLeaveDays, unpaidLeaveDays, unpaidLeaveDeduction,
            hourDeductions, penaltyDays, penalties, JSON.stringify(deductions), totalDeductions,
            socialInsurance, incomeTax,
            netSalary, notes, salesmanDeficitDeduction,
            JSON.stringify(earningsBreakdown), JSON.stringify(deductionsBreakdown),
            entryId
        ]);
        const [totals] = yield conn.query('SELECT SUM(netSalary) as total FROM payroll_entries WHERE payrollId = ?', [entry.payrollId]);
        const newTotal = totals[0].total || 0;
        yield conn.query('UPDATE payroll_cycles SET totalAmount = ? WHERE id = ?', [newTotal, entry.payrollId]);
        yield conn.commit();
        res.json({
            message: 'Entry updated successfully',
            entry: {
                id: entryId, baseSalary, dailyRate, overtimeRate, overtimeHours, overtimeAmount,
                incentives, bonus, allowances, grossSalary,
                purchases, advances, absenceDays, absenceAmount,
                paidLeaveDays, unpaidLeaveDays, unpaidLeaveDeduction,
                hourDeductions, penaltyDays, penalties, deductions, totalDeductions,
                socialInsurance, incomeTax,
                netSalary, notes, salesmanDeficitDeduction
            },
            cycleTotal: newTotal
        });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error updating payroll entry:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'update payroll entry');
    }
    finally {
        conn.release();
    }
});
exports.updatePayrollEntry = updatePayrollEntry;
const preflightPayrollApproval = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { cycleId } = req.params;
    const branchId = req.query.branchId || req.body.branchId || ((_a = req.user) === null || _a === void 0 ? void 0 : _a.branchId);
    try {
        const result = yield treasuryService.preflightPayrollApproval(cycleId, branchId);
        res.json(result);
    }
    catch (error) {
        console.error('Error running preflight check:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'preflight payroll approval');
    }
});
exports.preflightPayrollApproval = preflightPayrollApproval;
const getTreasuryBalance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const branchId = req.query.branchId || req.body.branchId || ((_a = req.user) === null || _a === void 0 ? void 0 : _a.branchId);
    try {
        const result = yield treasuryService.getTreasuryBalance(branchId);
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching treasury balance:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch treasury balance');
    }
});
exports.getTreasuryBalance = getTreasuryBalance;
const verifyTreasuryForPayroll = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { cycleId } = req.params;
    const { safetyMarginPercent } = req.query;
    const branchId = req.query.branchId || req.body.branchId || ((_a = req.user) === null || _a === void 0 ? void 0 : _a.branchId);
    try {
        const result = yield treasuryService.verifyTreasuryForPayroll(cycleId, branchId, safetyMarginPercent ? parseFloat(safetyMarginPercent) : undefined);
        res.json(result);
    }
    catch (error) {
        console.error('Error verifying treasury:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'verify treasury for payroll');
    }
});
exports.verifyTreasuryForPayroll = verifyTreasuryForPayroll;
const calculateTaxPreview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { annualIncome, annualInsurance, personalExemption } = req.body;
    try {
        const result = yield salaryService.calculateEmployeePayroll('preview', {
            baseSalary: parseFloat(annualIncome) / 12,
            variableSalary: 0,
            basicSalaryInsurable: parseFloat(annualInsurance) / 12,
            personalExemption: parseFloat(personalExemption) || 15000
        }, {}, 0, { includeTax: true, includeInsurance: false });
        res.json(result);
    }
    catch (error) {
        console.error('Error calculating tax preview:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'calculate tax preview');
    }
});
exports.calculateTaxPreview = calculateTaxPreview;
const getTaxBrackets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.pool.query('SELECT * FROM tax_brackets ORDER BY minIncome');
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching tax brackets:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch tax brackets');
    }
});
exports.getTaxBrackets = getTaxBrackets;
const getInsuranceConfig = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.pool.query('SELECT * FROM insurance_config LIMIT 1');
        res.json(rows[0] || {});
    }
    catch (error) {
        console.error('Error fetching insurance config:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch insurance config');
    }
});
exports.getInsuranceConfig = getInsuranceConfig;
const calculatePayrollPreview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId } = req.params;
    let { employee, attendance, loanDeductions } = req.body;
    try {
        if (!employee || !employee.baseSalary) {
            const [rows] = yield db_1.pool.query('SELECT baseSalary, variableSalary, basicSalaryInsurable, personalExemption FROM employees WHERE id = ?', [employeeId]);
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Employee not found' });
            }
            employee = {
                baseSalary: Number(rows[0].baseSalary) || 0,
                variableSalary: Number(rows[0].variableSalary) || 0,
                basicSalaryInsurable: Number(rows[0].basicSalaryInsurable) || undefined,
                personalExemption: Number(rows[0].personalExemption) || 15000,
            };
        }
        const result = yield salaryService.calculateEmployeePayroll(employeeId, employee, attendance || {}, loanDeductions || 0);
        res.json(result);
    }
    catch (error) {
        console.error('Error calculating payroll preview:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'calculate payroll preview');
    }
});
exports.calculatePayrollPreview = calculatePayrollPreview;
const migrateEmployeeSalaryStructure = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId } = req.params;
    try {
        const [employees] = yield db_1.pool.query('SELECT baseSalary, variableSalary FROM employees WHERE id = ?', [employeeId]);
        if (employees.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        const emp = employees[0];
        yield salaryService.createDefaultSalaryStructure(employeeId, parseFloat(emp.baseSalary) || 0, parseFloat(emp.variableSalary) || 0);
        res.json({ message: 'Salary structure created successfully' });
    }
    catch (error) {
        console.error('Error migrating salary structure:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'migrate salary structure');
    }
});
exports.migrateEmployeeSalaryStructure = migrateEmployeeSalaryStructure;
