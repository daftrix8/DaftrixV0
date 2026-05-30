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
exports.setEmployeeSalaryComponent = exports.getEmployeeSalaryStructure = exports.getSalaryComponents = exports.deleteLeaveRequest = exports.cancelLeaveRequest = exports.rejectLeaveRequest = exports.approveLeaveRequest = exports.createLeaveRequest = exports.getLeaveRequests = exports.updateLeaveBalance = exports.initializeLeaveBalances = exports.getLeaveBalances = exports.deleteLeaveType = exports.updateLeaveType = exports.createLeaveType = exports.getLeaveTypes = exports.updateEmployeeTemplate = exports.removeEmployeeTemplate = exports.getEmployeeTemplates = exports.assignTemplateToEmployee = exports.deletePayrollTemplate = exports.updatePayrollTemplate = exports.createPayrollTemplate = exports.getPayrollTemplates = exports.getLoanHistory = exports.getLoanConstraints = exports.repayLoan = exports.settleLoanEarly = exports.skipLoanInstallment = exports.getEmployeeLoanInstallments = exports.getLoanInstallments = exports.createLoanWithInstallments = exports.checkLoanEligibility = exports.deleteAdvance = exports.updateAdvance = exports.createAdvance = exports.getAdvances = exports.updatePayrollEntry = exports.approvePayroll = exports.calculatePayroll = exports.deletePayrollCycle = exports.createPayrollCycle = exports.getPayrollEntries = exports.getPayrollCycles = exports.recordAttendance = exports.getAttendance = exports.deleteEmployee = exports.updateEmployee = exports.createEmployee = exports.getEmployees = void 0;
exports.deletePayrollGLMapping = exports.upsertPayrollGLMapping = exports.getPayrollGLMappings = exports.getAdditionalSalaryStats = exports.bulkApproveAdditionalSalary = exports.cancelAdditionalSalary = exports.rejectAdditionalSalary = exports.approveAdditionalSalary = exports.deleteAdditionalSalary = exports.updateAdditionalSalary = exports.createAdditionalSalary = exports.getAdditionalSalaryEntries = exports.getWorkEntrySummary = exports.resolveWorkEntryConflict = exports.validateWorkEntries = exports.generateWorkEntries = exports.deleteWorkEntry = exports.updateWorkEntry = exports.upsertWorkEntry = exports.getWorkEntries = exports.createWorkEntryType = exports.getWorkEntryTypes = exports.removeStructureAssignment = exports.assignStructureToEmployee = exports.getTemplateAssignments = exports.getEmployeeStructureAssignment = exports.deleteStructureLine = exports.updateStructureLine = exports.addStructureLine = exports.deleteStructureTemplate = exports.updateStructureTemplate = exports.createStructureTemplate = exports.getStructureTemplate = exports.getStructureTemplates = exports.deleteSalaryComponent = exports.updateSalaryComponent = exports.createSalaryComponent = exports.verifyTreasuryForPayroll = exports.getTreasuryBalance = exports.preflightPayrollApproval = exports.applyAdjustmentToPayroll = exports.approveAdjustment = exports.getPendingAdjustments = exports.createRetroactiveAdjustment = exports.calculateRetroactiveAdjustment = exports.migrateEmployeeSalaryStructure = exports.calculatePayrollPreview = exports.getInsuranceConfig = exports.getTaxBrackets = exports.calculateTaxPreview = void 0;
exports.deleteRuleCategory = exports.updateRuleCategory = exports.createRuleCategory = exports.getRuleCategories = exports.previewPayrollJournal = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const loanService = __importStar(require("../services/loanService"));
const salaryService = __importStar(require("../services/salaryService"));
const taxService = __importStar(require("../services/taxService"));
const salaryStructureService = __importStar(require("../services/salaryStructureService"));
// ==========================================
// EMPLOYEES
// ==========================================
const getEmployees = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        let rows;
        try {
            [rows] = yield db_1.pool.query(`
              SELECT e.*, b.name as branchName, a.name as treasuryName, s.name as salesmanName
              FROM employees e
              LEFT JOIN branches b ON e.branchId = b.id
              LEFT JOIN accounts a ON e.treasuryAccountId = a.id
              LEFT JOIN salesmen s ON e.salesmanId = s.id
              ORDER BY e.fullName
            `);
        }
        catch (joinErr) {
            // If salesmanId column or salesmen table doesn't exist, fall back without it
            if (((_a = joinErr.message) === null || _a === void 0 ? void 0 : _a.includes('salesmanId')) || joinErr.code === 'ER_BAD_FIELD_ERROR' || joinErr.code === 'ER_NO_SUCH_TABLE') {
                [rows] = yield db_1.pool.query(`
                  SELECT e.*, b.name as branchName, a.name as treasuryName, NULL as salesmanName
                  FROM employees e
                  LEFT JOIN branches b ON e.branchId = b.id
                  LEFT JOIN accounts a ON e.treasuryAccountId = a.id
                  ORDER BY e.fullName
                `);
            }
            else {
                throw joinErr;
            }
        }
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching employees:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch employees');
    }
});
exports.getEmployees = getEmployees;
const createEmployee = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { fullName, nationalId, jobTitle, department, employmentType, baseSalary, variableSalary, basicSalaryInsurable, personalExemption, insuranceNumber, taxNumber, fingerprintId, branchId, treasuryAccountId, status, hireDate, phone, email, address, salesmanId } = req.body;
    // Input validation
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
        return res.status(400).json({ error: 'اسم الموظف مطلوب' });
    }
    if (baseSalary !== undefined && baseSalary !== null && baseSalary !== '') {
        if (isNaN(Number(baseSalary)) || Number(baseSalary) < 0) {
            return res.status(400).json({ error: 'الراتب الأساسي يجب أن يكون رقماً صحيحاً' });
        }
    }
    // Convert ISO datetime to DATE format (YYYY-MM-DD)
    const parsedHireDate = hireDate ? new Date(hireDate).toISOString().split('T')[0] : null;
    try {
        const id = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`
      INSERT INTO employees (
        id, fullName, nationalId, jobTitle, department, employmentType,
        baseSalary, variableSalary, basicSalaryInsurable, personalExemption,
        insuranceNumber, taxNumber, fingerprintId,
        branchId, treasuryAccountId, status, hireDate,
        phone, email, address, salesmanId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            id, fullName, nationalId || null, jobTitle || null, department || null, employmentType || 'MONTHLY',
            baseSalary || 0, variableSalary || 0,
            basicSalaryInsurable || null, personalExemption || 15000,
            insuranceNumber || null, taxNumber || null, fingerprintId || null,
            branchId || null, treasuryAccountId || null, status || 'ACTIVE', parsedHireDate,
            phone || null, email || null, address || null, salesmanId || null
        ]);
        // Create default salary structure (Basic + Variable if any)
        yield salaryService.createDefaultSalaryStructure(id, Number(baseSalary) || 0, 0 // Default variable to 0 for now
        );
        res.status(201).json({ id, message: 'Employee created successfully' });
    }
    catch (error) {
        console.error('Error creating employee:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'create employee');
    }
});
exports.createEmployee = createEmployee;
const updateEmployee = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { fullName, nationalId, jobTitle, department, employmentType, baseSalary, variableSalary, basicSalaryInsurable, personalExemption, insuranceNumber, taxNumber, fingerprintId, branchId, treasuryAccountId, status, hireDate, phone, email, address, salesmanId } = req.body;
    // Convert ISO datetime to DATE format (YYYY-MM-DD)
    const parsedHireDate = hireDate ? new Date(hireDate).toISOString().split('T')[0] : null;
    try {
        yield db_1.pool.query(`
      UPDATE employees SET
        fullName = ?, nationalId = ?, jobTitle = ?, department = ?,
        employmentType = ?, baseSalary = ?,
        variableSalary = ?, basicSalaryInsurable = ?, personalExemption = ?,
        insuranceNumber = ?, taxNumber = ?, fingerprintId = ?,
        branchId = ?, treasuryAccountId = ?, status = ?, hireDate = ?,
        phone = ?, email = ?, address = ?, salesmanId = ?
      WHERE id = ?
    `, [
            fullName, nationalId || null, jobTitle || null, department || null, employmentType || 'MONTHLY',
            baseSalary || 0,
            variableSalary || 0, basicSalaryInsurable || null, personalExemption || 15000,
            insuranceNumber || null, taxNumber || null, fingerprintId || null,
            branchId || null, treasuryAccountId || null, status || 'ACTIVE', parsedHireDate,
            phone || null, email || null, address || null, salesmanId || null, id
        ]);
        res.json({ message: 'Employee updated successfully' });
    }
    catch (error) {
        console.error('Error updating employee:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'update employee');
    }
});
exports.updateEmployee = updateEmployee;
const deleteEmployee = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { id } = req.params;
    try {
        // Check for related records before deleting
        const [attendance] = yield db_1.pool.query('SELECT COUNT(*) as count FROM attendance_records WHERE employeeId = ?', [id]);
        const [payroll] = yield db_1.pool.query('SELECT COUNT(*) as count FROM payroll_entries WHERE employeeId = ?', [id]);
        let advanceCount = 0;
        try {
            const [advances] = yield db_1.pool.query('SELECT COUNT(*) as count FROM employee_advances WHERE employeeId = ?', [id]);
            advanceCount = ((_a = advances[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
        }
        catch (e) { /* table might not exist */ }
        const relatedRecords = (((_b = attendance[0]) === null || _b === void 0 ? void 0 : _b.count) || 0) + (((_c = payroll[0]) === null || _c === void 0 ? void 0 : _c.count) || 0) + advanceCount;
        if (relatedRecords > 0) {
            return res.status(400).json({
                error: `لا يمكن حذف هذا الموظف لأن لديه ${relatedRecords} سجل مرتبط (حضور/رواتب/سلف). قم بتغيير حالته إلى "منهي الخدمة" بدلاً من الحذف.`
            });
        }
        yield db_1.pool.query('DELETE FROM employees WHERE id = ?', [id]);
        res.json({ message: 'Employee deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting employee:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete employee');
    }
});
exports.deleteEmployee = deleteEmployee;
// ==========================================
// ATTENDANCE
// ==========================================
const getAttendance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { date, employeeId, startDate, endDate } = req.query;
    try {
        let query = `
      SELECT ar.*, e.fullName 
      FROM attendance_records ar
      JOIN employees e ON ar.employeeId = e.id
      WHERE 1=1
    `;
        const params = [];
        if (employeeId) {
            query += ` AND ar.employeeId = ?`;
            params.push(employeeId);
        }
        if (date) {
            query += ` AND ar.date = ?`;
            params.push(date);
        }
        if (startDate && endDate) {
            query += ` AND ar.date BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        }
        query += ` ORDER BY ar.date DESC, e.fullName`;
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching attendance:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch attendance');
    }
});
exports.getAttendance = getAttendance;
const recordAttendance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, date, checkIn, checkOut, status, isOvertime, overtimeHours, notes, lateMinutes, earlyLeaveMinutes, scheduledCheckIn, scheduledCheckOut, source } = req.body;
    try {
        const id = (0, crypto_1.randomUUID)();
        // Calculate late minutes if checkIn and scheduledCheckIn are provided
        let calculatedLateMinutes = lateMinutes || 0;
        let calculatedEarlyLeaveMinutes = earlyLeaveMinutes || 0;
        const defaultScheduledCheckIn = scheduledCheckIn || '09:00:00';
        const defaultScheduledCheckOut = scheduledCheckOut || '17:00:00';
        // Auto-calculate late minutes from checkIn time
        if (checkIn && !lateMinutes && status !== 'ABSENT') {
            const [schedHours, schedMins] = defaultScheduledCheckIn.split(':').map(Number);
            const [checkHours, checkMins] = checkIn.split(':').map(Number);
            const schedMinutes = schedHours * 60 + schedMins;
            const checkMinutes = checkHours * 60 + checkMins;
            calculatedLateMinutes = Math.max(0, checkMinutes - schedMinutes);
        }
        // Auto-calculate early leave minutes from checkOut time
        if (checkOut && !earlyLeaveMinutes && status !== 'ABSENT') {
            const [schedHours, schedMins] = defaultScheduledCheckOut.split(':').map(Number);
            const [checkHours, checkMins] = checkOut.split(':').map(Number);
            const schedMinutes = schedHours * 60 + schedMins;
            const checkMinutes = checkHours * 60 + checkMins;
            calculatedEarlyLeaveMinutes = Math.max(0, schedMinutes - checkMinutes);
        }
        // Determine status based on late minutes if not explicitly set
        let finalStatus = status || 'PRESENT';
        if (!status && calculatedLateMinutes > 0) {
            finalStatus = 'LATE';
        }
        // Upsert logic (insert or update if exists for same day)
        yield db_1.pool.query(`
      INSERT INTO attendance_records (
        id, employeeId, date, checkIn, checkOut, status,
        isOvertime, overtimeHours, lateMinutes, earlyLeaveMinutes,
        scheduledCheckIn, scheduledCheckOut, notes, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        checkIn = VALUES(checkIn),
        checkOut = VALUES(checkOut),
        status = VALUES(status),
        isOvertime = VALUES(isOvertime),
        overtimeHours = VALUES(overtimeHours),
        lateMinutes = VALUES(lateMinutes),
        earlyLeaveMinutes = VALUES(earlyLeaveMinutes),
        scheduledCheckIn = VALUES(scheduledCheckIn),
        scheduledCheckOut = VALUES(scheduledCheckOut),
        notes = VALUES(notes),
        source = VALUES(source)
    `, [
            id, employeeId, date,
            checkIn || null, // empty string '' is invalid for TIME — use null
            checkOut || null, // same
            finalStatus,
            isOvertime || false, overtimeHours || 0,
            calculatedLateMinutes, calculatedEarlyLeaveMinutes,
            defaultScheduledCheckIn, defaultScheduledCheckOut, notes,
            source || 'MANUAL'
        ]);
        res.json({
            message: 'Attendance recorded successfully',
            lateMinutes: calculatedLateMinutes,
            earlyLeaveMinutes: calculatedEarlyLeaveMinutes,
            status: finalStatus
        });
    }
    catch (error) {
        console.error('Error recording attendance:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'record attendance');
    }
});
exports.recordAttendance = recordAttendance;
// ==========================================
// PAYROLL
// ==========================================
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
        // Week 1 = days 1-7, Week 2 = days 8-14, etc.
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
        // If approved/paid, reverse all financial entries first
        if (cycle.status === 'APPROVED' || cycle.status === 'PAID' || cycle.status === 'CALCULATED') {
            // PERF: console.log(`🔄 [deletePayroll] Reversing approved payroll cycle ${id} (status: ${cycle.status})`);
            // 1. Reverse journal entries created for this payroll
            // Match by cycle ID prefix for precision (avoids matching other cycles with same month/year)
            const referencePattern = `PAYROLL-${id}%`;
            const legacyPattern = `PAYROLL-${cycle.month}-${cycle.year}%`;
            const [journalRows] = yield conn.query('SELECT id FROM journal_entries WHERE referenceId LIKE ? OR referenceId LIKE ?', [referencePattern, legacyPattern]);
            for (const journal of journalRows) {
                // Reverse account balances from journal lines
                const [lines] = yield conn.query('SELECT accountId, debit, credit FROM journal_lines WHERE journalId = ?', [journal.id]);
                for (const line of lines) {
                    // Reverse: subtract debit, add credit
                    yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) - ? + ? WHERE id = ?', [Number(line.debit) || 0, Number(line.credit) || 0, line.accountId]);
                }
                // Delete journal lines and entry
                yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [journal.id]);
                yield conn.query('DELETE FROM journal_entries WHERE id = ?', [journal.id]);
                // PERF: console.log(`  📚 Reversed and deleted journal ${journal.id}`);
            }
            // 2. Reverse advance deductions made during approval
            const [entries] = yield conn.query('SELECT * FROM payroll_entries WHERE payrollId = ?', [id]);
            for (const entry of entries) {
                const advanceAmount = parseFloat(entry.advances) || 0;
                if (advanceAmount <= 0)
                    continue;
                try {
                    // Restore advance remaining amounts
                    // Find advances that were deducted for this employee
                    let advanceQuery = `
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
                            // PERF: console.log(`  💰 Restored ${restoreAmount} to advance ${adv.id}`);
                        }
                    }
                }
                catch (advErr) {
                    // PERF: console.warn(`Warning restoring advances for employee ${entry.employeeId}:`, advErr);
                }
            }
            // 3. Reverse loan installment deductions
            try {
                const startDate = `${cycle.year}-${String(cycle.month).padStart(2, '0')}-01`;
                const endDate = `${cycle.year}-${String(cycle.month).padStart(2, '0')}-31`;
                yield conn.query(`
                    UPDATE loan_installments 
                    SET status = 'PENDING' 
                    WHERE payrollId = ? AND status = 'DEDUCTED'
                `, [id]).catch(() => { });
            }
            catch (loanErr) {
                // PERF: console.warn('Warning restoring loan installments:', loanErr);
            }
        }
        // Delete entries and cycle
        yield conn.query('DELETE FROM payroll_entries WHERE payrollId = ?', [id]);
        yield conn.query('DELETE FROM payroll_cycles WHERE id = ?', [id]);
        yield conn.commit();
        // PERF: console.log(`✅ [deletePayroll] Successfully deleted payroll cycle ${id} (was ${cycle.status})`);
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
    const { id } = req.params; // payrollId
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // 1. Get Payroll Cycle info
        const [cycleRows] = yield conn.query('SELECT * FROM payroll_cycles WHERE id = ?', [id]);
        if (cycleRows.length === 0)
            throw new Error('Payroll cycle not found');
        const cycle = cycleRows[0];
        // 2. Get Active Employees
        const [employees] = yield conn.query('SELECT * FROM employees WHERE status = "ACTIVE"');
        // 3. Clear existing entries for this draft
        yield conn.query('DELETE FROM payroll_entries WHERE payrollId = ?', [id]);
        let totalAmount = 0;
        const processedEntries = [];
        const isWeekly = cycle.payrollType === 'WEEKLY';
        const lastDay = new Date(cycle.year, cycle.month, 0).getDate();
        // Use explicit startDate/endDate from cycle if available (weekly), otherwise compute from month/year
        const startDate = cycle.startDate
            ? (typeof cycle.startDate === 'string' ? cycle.startDate : new Date(cycle.startDate).toISOString().split('T')[0])
            : `${cycle.year}-${String(cycle.month).padStart(2, '0')}-01`;
        const endDate = cycle.endDate
            ? (typeof cycle.endDate === 'string' ? cycle.endDate : new Date(cycle.endDate).toISOString().split('T')[0])
            : `${cycle.year}-${String(cycle.month).padStart(2, '0')}-${lastDay}`;
        // Calculate period length in days
        const periodDays = isWeekly
            ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
            : lastDay;
        // 4. Calculate for each employee using Salary Service
        for (const emp of employees) {
            // 4a. Gather attendance data from ALL available sources
            let paidLeaveDays = 0;
            let unpaidLeaveDays = 0;
            let actualWorkedDays = periodDays;
            let absentDays = 0;
            let lateMinutes = 0;
            let overtimeHours = 0;
            let workingDaysInMonth = periodDays;
            let dataSourceFound = false;
            // Source 1: Try attendance_records (most likely to have data)
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
                    actualWorkedDays = lastDay - absentDays - leaveDays;
                    dataSourceFound = true;
                }
            }
            catch (e) {
                // attendance_records table might not exist
            }
            // Source 2: Try work_entries (Beast Mode) — only if no attendance data found
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
                        actualWorkedDays = Number(weSummary[0].totalPaidDays) || 30;
                    }
                }
                catch (weErr) {
                    // work_entries tables don't exist
                }
            }
            // Source 3: Try leave_requests (always check for approved leaves)
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
                // Leave tables might not exist
            }
            // 4b. Fetch Loan/Advance Deductions (wrapped in try/catch)
            let loanDeductions = 0;
            let advanceDeductions = 0;
            try {
                const result = yield loanService.getPendingInstallments(emp.id, startDate, endDate);
                loanDeductions = result.total || 0;
            }
            catch (loanErr) {
                // Loan tables might not exist on this client
                // PERF: console.warn(`Loan query warning for ${emp.fullName}:`, loanErr);
            }
            // 4b2. Fetch REGULAR ADVANCES (no installments — deduct monthlyDeduction directly)
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
                    // If monthlyDeduction is set, use it; otherwise deduct the full remaining amount
                    const deduction = monthly > 0 ? Math.min(monthly, remaining) : remaining;
                    advanceDeductions += deduction;
                }
                if (advanceDeductions > 0) {
                    // PERF: console.log(`💰 [calculatePayroll] ${emp.fullName}: Regular advance deduction = ${advanceDeductions}`);
                }
            }
            catch (advErr) {
                // employee_advances table might not have loanType column on older DBs
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
                    // PERF: console.warn(`Advance query warning for ${emp.fullName}:`, e);
                }
            }
            // 4c. Fetch Additional Salary entries (Beast Mode)
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
                // Additional salary tables might not exist yet
            }
            // ========================================================
            // 4d. PAYROLL CALCULATION (with Salary Structure Templates)
            // ========================================================
            const empMonthlySalary = parseFloat(emp.baseSalary) || 0;
            // For weekly cycles: use 1/4 of monthly salary as the period base
            // For weekly employees (employmentType === 'WEEKLY'): baseSalary IS the weekly salary
            let empBaseSalary;
            if (isWeekly) {
                empBaseSalary = emp.employmentType === 'WEEKLY'
                    ? empMonthlySalary // baseSalary is already the weekly rate
                    : Math.round((empMonthlySalary / 4) * 100) / 100; // Convert monthly to weekly
            }
            else {
                empBaseSalary = empMonthlySalary;
            }
            const dailyRate = isWeekly ? empBaseSalary / 7 : empBaseSalary / 30;
            const hourlyRate = dailyRate / 8;
            // --- TRY SALARY STRUCTURE TEMPLATE ---
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
                // Template tables might not exist yet — fall back to basic
                // PERF: console.warn(`Template calc fallback for ${emp.fullName}:`, tmplErr);
            }
            // If no template was used, fall back to hardcoded BASIC
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
            // --- EARNINGS ---
            const overtimeMultiplier = 1.5;
            const overtimeAmount = Math.round(hourlyRate * overtimeHours * overtimeMultiplier * 100) / 100;
            const incentives = 0; // Will be set manually if needed
            const grossSalary = Math.round((templateGross + overtimeAmount + incentives + additionalEarnings) * 100) / 100;
            // --- DEDUCTIONS ---
            const absenceAmount = Math.round(absentDays * dailyRate * 100) / 100;
            const unpaidLeaveDeduction = Math.round(unpaidLeaveDays * dailyRate * 100) / 100;
            // Insurance (only if cycle has includeInsurance enabled)
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
                    // Insurance calculation failed, skip it
                    // PERF: console.warn(`Insurance calculation warning for ${emp.fullName}:`, insErr);
                }
            }
            // Tax (only if cycle has includeTax enabled)
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
                    // PERF: console.warn(`Tax calculation warning for ${emp.fullName}:`, taxErr);
                }
            }
            // Sum all deductions
            const totalDeductions = Math.round((absenceAmount +
                unpaidLeaveDeduction +
                loanDeductions +
                advanceDeductions +
                additionalDeductions +
                templateDeductions +
                socialInsurance +
                incomeTax) * 100) / 100;
            // --- NET SALARY ---
            const netSalary = Math.round((grossSalary - totalDeductions) * 100) / 100;
            // 4e. Save Entry with ALL fields stored explicitly
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
        // 5. Update Cycle Total
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
const approvePayroll = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    let { treasuryAccountId, expenseAccountId, entryIds } = req.body;
    // Auto-detect accounts if not provided
    if (!treasuryAccountId || !expenseAccountId) {
        // PERF: console.log('⚙️ [approvePayroll] Auto-detecting treasury/expense accounts...');
        const autoConn = yield (0, db_1.getConnection)();
        try {
            // Strategy 1: Check payroll_gl_mappings for configured accounts
            try {
                const [mappings] = yield autoConn.query(`
                    SELECT mappingType, debitAccountId, creditAccountId 
                    FROM payroll_gl_mappings 
                    WHERE mappingType IN ('SALARY_EXPENSE', 'NET_SALARY', 'BASIC_SALARY')
                    LIMIT 5
                `);
                for (const m of mappings) {
                    if (!expenseAccountId && m.debitAccountId)
                        expenseAccountId = m.debitAccountId;
                    if (!treasuryAccountId && m.creditAccountId)
                        treasuryAccountId = m.creditAccountId;
                }
            }
            catch (e) {
                // Table may not exist
            }
            // Strategy 2: Find by account type and code patterns
            if (!treasuryAccountId) {
                const [treasuryRows] = yield autoConn.query(`
                    SELECT id FROM accounts 
                    WHERE type = 'ASSET' AND (code LIKE '101%' OR code LIKE '102%' OR name LIKE '%خزينة%' OR name LIKE '%صندوق%')
                    ORDER BY code ASC LIMIT 1
                `);
                if (treasuryRows.length > 0)
                    treasuryAccountId = treasuryRows[0].id;
            }
            if (!expenseAccountId) {
                const [expenseRows] = yield autoConn.query(`
                    SELECT id FROM accounts 
                    WHERE type = 'EXPENSE' AND (name LIKE '%رواتب%' OR name LIKE '%أجور%' OR name LIKE '%مرتبات%' OR code LIKE '4%')
                    ORDER BY code ASC LIMIT 1
                `);
                if (expenseRows.length > 0)
                    expenseAccountId = expenseRows[0].id;
            }
            // Strategy 3: Fallback to any ASSET / EXPENSE account
            if (!treasuryAccountId) {
                const [anyAsset] = yield autoConn.query(`SELECT id FROM accounts WHERE type = 'ASSET' ORDER BY code ASC LIMIT 1`);
                if (anyAsset.length > 0)
                    treasuryAccountId = anyAsset[0].id;
            }
            if (!expenseAccountId) {
                const [anyExpense] = yield autoConn.query(`SELECT id FROM accounts WHERE type = 'EXPENSE' ORDER BY code ASC LIMIT 1`);
                if (anyExpense.length > 0)
                    expenseAccountId = anyExpense[0].id;
            }
            // PERF: console.log(`⚙️ [approvePayroll] Auto-detected: treasury=${treasuryAccountId}, expense=${expenseAccountId}`);
        }
        finally {
            autoConn.release();
        }
        // If still no accounts found, error out
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
        // Get entries - either all or specific ones based on entryIds
        let entries;
        let isPartialPayment = false;
        if (entryIds && Array.isArray(entryIds) && entryIds.length > 0) {
            // Partial payment - only specific entries
            const placeholders = entryIds.map(() => '?').join(',');
            const [selectedEntries] = yield conn.query(`SELECT * FROM payroll_entries WHERE payrollId = ? AND id IN (${placeholders}) AND status = 'PENDING'`, [id, ...entryIds]);
            entries = selectedEntries;
            isPartialPayment = true;
        }
        else {
            // Full payment - all pending entries
            const [allEntries] = yield conn.query('SELECT * FROM payroll_entries WHERE payrollId = ? AND status = \'PENDING\'', [id]);
            entries = allEntries;
        }
        if (entries.length === 0) {
            return res.status(400).json({ error: 'No pending entries to pay' });
        }
        let totalNet = 0;
        for (const entry of entries) {
            const salary = Number(entry.netSalary) || 0;
            totalNet += salary;
        }
        // PERF: console.log(`💰 [approvePayroll] totalNet=${totalNet}, entries=${entries.length}, entryNetSalaries=${entries.map((e: any) => e.netSalary).join(',')}`);
        if (totalNet <= 0) {
            yield conn.rollback();
            return res.status(400).json({ error: 'إجمالي الرواتب يساوي صفر - تحقق من بيانات الموظفين' });
        }
        // Get account names for journal lines
        const [accountRows] = yield conn.query('SELECT id, name FROM accounts WHERE id IN (?, ?)', [expenseAccountId, treasuryAccountId]);
        const accountNameMap = {};
        for (const acc of accountRows) {
            accountNameMap[acc.id] = acc.name;
        }
        const expenseAccountName = accountNameMap[expenseAccountId] || 'مصروفات رواتب';
        const treasuryAccountName = accountNameMap[treasuryAccountId] || 'الخزينة';
        // Create Journal Entry
        // Debit: Salaries Expense
        // Credit: Treasury
        const journalId = (0, crypto_1.randomUUID)();
        const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
        // Include employee count in description for partial payments
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
        // Debit Line (Expense)
        yield conn.query(`
      INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
      VALUES (?, ?, ?, ?, 0)
    `, [journalId, expenseAccountId, expenseAccountName, totalNet]);
        // Credit Line (Treasury)
        yield conn.query(`
      INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
      VALUES (?, ?, ?, 0, ?)
    `, [journalId, treasuryAccountId, treasuryAccountName, totalNet]);
        // Update Account Balances (keep in sync with journal entries)
        yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [totalNet, expenseAccountId]);
        yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) - ? WHERE id = ?', [totalNet, treasuryAccountId]);
        // Update only the paid entries status
        const paidEntryIds = entries.map((e) => e.id);
        if (paidEntryIds.length > 0) {
            const placeholders = paidEntryIds.map(() => '?').join(',');
            yield conn.query(`UPDATE payroll_entries SET status = 'PAID', paidAt = ? WHERE id IN (${placeholders})`, [date, ...paidEntryIds]);
        }
        // Check if all entries in this cycle are now paid
        const [pendingCount] = yield conn.query('SELECT COUNT(*) as count FROM payroll_entries WHERE payrollId = ? AND status = \'PENDING\'', [id]);
        // Only mark cycle as APPROVED if all entries are paid
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
        // Update Loan Installments (New System)
        try {
            const startDate = `${cycle.year}-${String(cycle.month).padStart(2, '0')}-01`;
            const endDate = `${cycle.year}-${String(cycle.month).padStart(2, '0')}-31`;
            for (const entry of entries) {
                yield loanService.markInstallmentsAsDeducted(entry.employeeId, id, startDate, endDate);
            }
        }
        catch (loanError) {
            // PERF: console.warn('Could not update loan installments:', loanError);
        }
        // Deduct regular advances (reduce remainingAmount, mark COMPLETED when fully paid)
        try {
            for (const entry of entries) {
                const advanceAmount = parseFloat(entry.advances) || 0;
                if (advanceAmount <= 0)
                    continue;
                // Get active regular advances for this employee
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
                    // Fallback without loanType filter
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
                    // Mark as COMPLETED if fully paid
                    if (newRemaining <= 0) {
                        yield conn.query(`
                            UPDATE employee_advances SET status = 'COMPLETED' WHERE id = ?
                        `, [adv.id]);
                    }
                    remainingToDeduct -= actualDeduction;
                    // PERF: console.log(`✅ [approvePayroll] Deducted ${actualDeduction} from advance ${adv.id}, remaining: ${newRemaining}`);
                }
            }
        }
        catch (advError) {
            // PERF: console.warn('Could not update advance deductions:', advError);
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
// Update individual payroll entry (Manual Mode) - Comprehensive Version
const updatePayrollEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { entryId } = req.params;
    const body = req.body;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Get current entry
        const [entries] = yield conn.query('SELECT * FROM payroll_entries WHERE id = ?', [entryId]);
        if (entries.length === 0) {
            return res.status(404).json({ error: 'Payroll entry not found' });
        }
        const entry = entries[0];
        // Check if payroll is still in DRAFT status
        const [cycles] = yield conn.query('SELECT status FROM payroll_cycles WHERE id = ?', [entry.payrollId]);
        if (cycles.length === 0 || cycles[0].status !== 'DRAFT') {
            return res.status(400).json({ error: 'Cannot edit entries for approved/paid payroll' });
        }
        // Get values from body or use existing
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
        // Parse legacy allowances/deductions (for backward compatibility)
        const allowances = body.allowances !== undefined
            ? (typeof body.allowances === 'string' ? JSON.parse(body.allowances) : body.allowances)
            : JSON.parse(entry.allowances || '[]');
        const deductions = body.deductions !== undefined
            ? (typeof body.deductions === 'string' ? JSON.parse(body.deductions) : body.deductions)
            : JSON.parse(entry.deductions || '[]');
        // Parse detailed breakdowns
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
        // SYNC: Update breakdowns with new values from allowances/deductions
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
        // Calculate totals
        const otherAllowances = allowances.reduce((sum, a) => sum + Number(a.amount || 0), 0);
        const otherDeductions = deductions.reduce((sum, d) => sum + Number(d.amount || 0), 0);
        // Insurance and tax (preserve existing values unless manually edited)
        const socialInsurance = body.socialInsurance !== undefined ? parseFloat(body.socialInsurance) : parseFloat(entry.socialInsurance) || 0;
        const incomeTax = body.incomeTax !== undefined ? parseFloat(body.incomeTax) : parseFloat(entry.incomeTax) || 0;
        const grossSalary = baseSalary + overtimeAmount + incentives + bonus + otherAllowances;
        const totalDeductions = absenceAmount + unpaidLeaveDeduction + purchases + advances + hourDeductions + penalties + otherDeductions + salesmanDeficitDeduction + socialInsurance + incomeTax;
        const netSalary = grossSalary - totalDeductions;
        // Update the entry with all fields
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
        // Recalculate cycle total
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
// ==========================================
// EMPLOYEE ADVANCES / LOANS
// ==========================================
const getAdvances = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, status, grouped } = req.query;
    try {
        // If grouped=true, return per-employee summary with totals
        if (grouped === 'true') {
            const [summaries] = yield db_1.pool.query(`
                SELECT 
                    e.id as employeeId,
                    e.fullName as employeeName,
                    e.jobTitle,
                    e.department,
                    COUNT(a.id) as advanceCount,
                    COALESCE(SUM(a.amount), 0) as totalTaken,
                    COALESCE(SUM(a.remainingAmount), 0) as totalRemaining,
                    COALESCE(SUM(a.totalPaid), 0) as totalPaid,
                    SUM(CASE WHEN a.status = 'ACTIVE' THEN 1 ELSE 0 END) as activeCount,
                    MAX(a.issueDate) as lastAdvanceDate
                FROM employees e
                INNER JOIN employee_advances a ON e.id = a.employeeId
                GROUP BY e.id, e.fullName, e.jobTitle, e.department
                HAVING COUNT(a.id) > 0
                ORDER BY COALESCE(SUM(a.remainingAmount), 0) DESC, e.fullName
            `);
            // Parse values to ensure they're numbers (MySQL may return strings)
            const parsedSummaries = summaries.map((s) => (Object.assign(Object.assign({}, s), { advanceCount: Number(s.advanceCount) || 0, totalTaken: Number(s.totalTaken) || 0, totalRemaining: Number(s.totalRemaining) || 0, totalPaid: Number(s.totalPaid) || 0, activeCount: Number(s.activeCount) || 0 })));
            return res.json(parsedSummaries);
        }
        // Regular query - return individual advances
        let query = `
          SELECT a.*, e.fullName as employeeName, e.jobTitle, e.department
          FROM employee_advances a
          JOIN employees e ON a.employeeId = e.id
          WHERE 1=1
        `;
        const params = [];
        if (employeeId) {
            query += ` AND a.employeeId = ?`;
            params.push(employeeId);
        }
        if (status) {
            query += ` AND a.status = ?`;
            params.push(status);
        }
        query += ` ORDER BY a.issueDate DESC`;
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching advances:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch advances');
    }
});
exports.getAdvances = getAdvances;
// Helper to create accounting entry for advances/loans
const createAdvanceAccountingEntry = (connection, advanceId, amount, employeeId, issueDate, paymentMethod, financialAccountId, type, user) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // 1. Get Employee Name
    const [employees] = yield connection.query('SELECT fullName as name FROM employees WHERE id = ?', [employeeId]);
    const employeeName = ((_a = employees[0]) === null || _a === void 0 ? void 0 : _a.name) || 'Employee';
    // 2. Find "Employee Advances/Loans" Account (Debit)
    const [allAccounts] = yield connection.query('SELECT id, code, name FROM accounts');
    let loanAccount = allAccounts.find((a) => (a.name && (a.name.includes('سلف') || a.name.includes('قرض'))) ||
        (a.name && (a.name.toLowerCase().includes('loan') || a.name.toLowerCase().includes('advance'))));
    // Fallback 1: Look for account codes starting with 112 (common for employee receivables)
    if (!loanAccount) {
        loanAccount = allAccounts.find((a) => a.code && String(a.code).startsWith('112'));
    }
    // Fallback 2: Look for 104 (other current assets)
    if (!loanAccount) {
        loanAccount = allAccounts.find((a) => a.code && String(a.code).startsWith('104'));
    }
    // Fallback 3: AUTO-CREATE the Employee Advances account
    if (!loanAccount) {
        const newAccountId = (0, crypto_1.randomUUID)();
        const newAccountCode = '1120'; // Standard code for employee receivables
        yield connection.query(`
            INSERT INTO accounts (id, code, name, type, parentId, balance, isActive)
            VALUES (?, ?, ?, 'ASSET', NULL, 0, 1)
        `, [newAccountId, newAccountCode, 'سلف وقروض الموظفين']);
        loanAccount = { id: newAccountId, code: newAccountCode, name: 'سلف وقروض الموظفين' };
    }
    const loanAccountId = loanAccount === null || loanAccount === void 0 ? void 0 : loanAccount.id;
    const loanAccountName = (loanAccount === null || loanAccount === void 0 ? void 0 : loanAccount.name) || 'سلف وقروض الموظفين';
    // 3. Identify Financial Account (Credit) = Treasury/Bank
    let creditAccountId = null;
    let creditAccountName = '';
    if (paymentMethod === 'BANK') {
        const [banks] = yield connection.query('SELECT id, name, accountId FROM banks WHERE id = ?', [financialAccountId]);
        if (banks[0]) {
            creditAccountId = banks[0].accountId;
            creditAccountName = banks[0].name;
            // REMOVED: Banks balance is now calculated live from GL/journal lines
        }
    }
    else {
        // CASH - financialAccountId is the treasury account ID directly
        creditAccountId = financialAccountId;
        const creditAccount = allAccounts.find((a) => a.id === financialAccountId);
        creditAccountName = (creditAccount === null || creditAccount === void 0 ? void 0 : creditAccount.name) || 'الخزينة';
    }
    if (creditAccountId && loanAccountId) {
        const journalId = (0, crypto_1.randomUUID)();
        const description = `صرف ${type === 'LOAN' ? 'قرض' : 'سلفة'} للموظف ${employeeName}`;
        // Create Journal Entry Header
        yield connection.query(`
            INSERT INTO journal_entries (id, date, description, referenceId, createdBy)
            VALUES (?, ?, ?, ?, ?)
        `, [
            journalId,
            issueDate,
            description,
            advanceId,
            (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) || 'System'
        ]);
        // Debit: Employee Loan Account (including accountName for display)
        yield connection.query(`
            INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
            VALUES (?, ?, ?, ?, 0)
        `, [journalId, loanAccountId, loanAccountName, amount]);
        // Credit: Treasury/Bank (including accountName for display)
        yield connection.query(`
            INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
            VALUES (?, ?, ?, 0, ?)
        `, [journalId, creditAccountId, creditAccountName, amount]);
        // Update Account Balances
        yield connection.query('UPDATE accounts SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [amount, loanAccountId]);
        yield connection.query('UPDATE accounts SET balance = COALESCE(balance, 0) - ? WHERE id = ?', [amount, creditAccountId]);
    }
    else {
        console.error('❌ MISSING ACCOUNTS - Cannot create journal entry', {
            loanAccountId,
            creditAccountId,
            paymentMethod,
            financialAccountId
        });
        throw new Error('تعذر إنشاء القيد المحاسبي: حساب الخزينة/البنك غير مرتبط بحساب محاسبي. يرجى مراجعة إعدادات الحسابات.');
    }
});
const createAdvance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, type, amount, reason, issueDate, monthlyDeduction, paymentMethod, financialAccountId } = req.body;
    const user = req.user;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const id = (0, crypto_1.randomUUID)();
        yield connection.query(`
          INSERT INTO employee_advances (
            id, employeeId, type, amount, reason, issueDate, 
            monthlyDeduction, remainingAmount, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `, [
            id, employeeId, type || 'ADVANCE', amount, reason, issueDate,
            monthlyDeduction || 0, amount
        ]);
        if (paymentMethod && financialAccountId) {
            yield createAdvanceAccountingEntry(connection, id, parseFloat(amount), employeeId, issueDate, paymentMethod, financialAccountId, type || 'ADVANCE', user);
        }
        else {
            // PERF: console.warn('⚠️ No payment method provided, skipping accounting entry.');
        }
        yield connection.commit();
        res.status(201).json({ id, message: 'Advance created successfully' });
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error creating advance:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'create advance');
    }
    finally {
        connection.release();
    }
});
exports.createAdvance = createAdvance;
const updateAdvance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { type, amount, reason, issueDate, monthlyDeduction, status, totalPaid, remainingAmount } = req.body;
    try {
        yield db_1.pool.query(`
          UPDATE employee_advances SET
            type = COALESCE(?, type),
            amount = COALESCE(?, amount),
            reason = COALESCE(?, reason),
            issueDate = COALESCE(?, issueDate),
            monthlyDeduction = COALESCE(?, monthlyDeduction),
            status = COALESCE(?, status),
            totalPaid = COALESCE(?, totalPaid),
            remainingAmount = COALESCE(?, remainingAmount)
          WHERE id = ?
        `, [type, amount, reason, issueDate, monthlyDeduction, status, totalPaid, remainingAmount, id]);
        res.json({ message: 'Advance updated successfully' });
    }
    catch (error) {
        console.error('Error updating advance:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'update advance');
    }
});
exports.updateAdvance = updateAdvance;
const deleteAdvance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // 1. Reverse the journal entry created for this advance
        const [journalRows] = yield conn.query('SELECT id FROM journal_entries WHERE referenceId = ?', [id]);
        if (journalRows.length > 0) {
            const journalId = journalRows[0].id;
            // Reverse account balances from journal lines
            const [lines] = yield conn.query('SELECT accountId, debit, credit FROM journal_lines WHERE journalId = ?', [journalId]);
            for (const line of lines) {
                // Reverse: subtract debit, add credit
                yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) - ? + ? WHERE id = ?', [line.debit, line.credit, line.accountId]);
            }
            // Delete journal lines and entry
            yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [journalId]);
            yield conn.query('DELETE FROM journal_entries WHERE id = ?', [journalId]);
        }
        // 1b. Reverse bank balance if advance was paid via bank
        try {
            const [advanceRows] = yield conn.query('SELECT amount FROM employee_advances WHERE id = ?', [id]);
            const advAmount = parseFloat((_a = advanceRows[0]) === null || _a === void 0 ? void 0 : _a.amount) || 0;
            if (advAmount > 0) {
                // Find banks whose GL accountId was credited (debit=0, credit>0) in the journal
                // If the credit line's accountId belongs to a bank, restore that bank's balance
                if (journalRows.length > 0) {
                    const journalId = journalRows[0].id;
                    // The credit line was the treasury/bank side
                    const [creditLines] = yield conn.query('SELECT jl.accountId FROM journal_lines jl WHERE jl.journalId = ? AND jl.credit > 0', [journalId]);
                    for (const cl of creditLines) {
                        const [bankRows] = yield conn.query('SELECT id FROM banks WHERE accountId = ?', [cl.accountId]);
                        if (bankRows.length > 0) {
                            // REMOVED: Banks balance is now calculated live from GL/journal lines
                            // PERF: console.log(`🏦 Restored ${advAmount} to bank ${bankRows[0].id}`);
                        }
                    }
                }
            }
        }
        catch (bankErr) {
            // PERF: console.warn('Warning restoring bank balance on advance delete:', bankErr);
        }
        // 2. Delete installments
        yield conn.query('DELETE FROM loan_installments WHERE loanId = ?', [id]).catch(() => { });
        // 3. Delete loan history
        yield conn.query('DELETE FROM loan_history WHERE loanId = ?', [id]).catch(() => { });
        // 4. Delete the advance record itself
        yield conn.query('DELETE FROM employee_advances WHERE id = ?', [id]);
        yield conn.commit();
        conn.release();
        res.json({ message: 'تم حذف السلفة وعكس القيد المحاسبي بنجاح' });
    }
    catch (error) {
        yield conn.rollback();
        conn.release();
        console.error('Error deleting advance with reversal:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete advance');
    }
});
exports.deleteAdvance = deleteAdvance;
// ==========================================
// SMART LOANS - New Endpoints
// ==========================================
/**
 * Check loan eligibility for an employee
 */
const checkLoanEligibility = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, amount, numberOfMonths } = req.body;
    try {
        const result = yield loanService.checkLoanEligibility(employeeId, parseFloat(amount), parseInt(numberOfMonths));
        res.json(result);
    }
    catch (error) {
        console.error('Error checking loan eligibility:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'check loan eligibility');
    }
});
exports.checkLoanEligibility = checkLoanEligibility;
/**
 * Create a new loan with installments
 */
const createLoanWithInstallments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, type, loanType, amount, reason, issueDate: rawIssueDate, startDate, numberOfMonths, numberOfInstallments, allowSkip, maxSkipCount, paymentMethod, financialAccountId } = req.body;
    const issueDate = rawIssueDate || startDate || new Date().toISOString().split('T')[0];
    const numMonthsRaw = numberOfMonths || numberOfInstallments;
    const user = req.user;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        // Validate eligibility first
        const eligibility = yield loanService.checkLoanEligibility(employeeId, parseFloat(amount), parseInt(numMonthsRaw) || 1);
        if (!eligibility.eligible && loanType === 'LOAN') {
            connection.release();
            return res.status(400).json({
                error: 'لا يمكن منح القرض',
                reasons: eligibility.reasons
            });
        }
        const id = (0, crypto_1.randomUUID)();
        const numMonths = parseInt(numMonthsRaw) || 1;
        const monthlyDeduction = parseFloat(amount) / numMonths;
        // Create the loan record
        yield connection.query(`
            INSERT INTO employee_advances (
                id, employeeId, type, loanType, amount, reason, 
                issueDate, requestDate, monthlyDeduction, numberOfInstallments,
                allowSkip, maxSkipCount, remainingAmount, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `, [
            id, employeeId, type || 'ADVANCE', loanType || 'ADVANCE',
            amount, reason, issueDate, issueDate, monthlyDeduction,
            numMonths, allowSkip !== false, maxSkipCount || 2, amount
        ]);
        // Generate installments if it's a LOAN
        if (loanType === 'LOAN' || numMonths > 1) {
            yield loanService.generateInstallments(id, employeeId, parseFloat(amount), numMonths, new Date(issueDate));
        }
        // Create Accounting Entry
        if (paymentMethod && financialAccountId) {
            yield createAdvanceAccountingEntry(connection, id, parseFloat(amount), employeeId, issueDate, paymentMethod, financialAccountId, loanType || 'ADVANCE', user);
        }
        yield connection.commit();
        res.status(201).json({
            id,
            message: loanType === 'LOAN' ? 'تم إنشاء القرض بنجاح' : 'تم إنشاء السلفة بنجاح'
        });
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error creating loan:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'create loan');
    }
    finally {
        connection.release();
    }
});
exports.createLoanWithInstallments = createLoanWithInstallments;
/**
 * Get installments for a specific loan
 */
const getLoanInstallments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loanId } = req.params;
    try {
        const [installments] = yield db_1.pool.query(`
            SELECT * FROM loan_installments
            WHERE loanId = ?
            ORDER BY installmentNumber
        `, [loanId]);
        res.json(installments);
    }
    catch (error) {
        console.error('Error fetching loan installments:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch loan installments');
    }
});
exports.getLoanInstallments = getLoanInstallments;
/**
 * Bulk: Get all installments for all of an employee's loans in one query.
 * Eliminates the N+1 problem of fetching installments per-loan.
 */
const getEmployeeLoanInstallments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId } = req.params;
    try {
        const [rows] = yield db_1.pool.query(`
            SELECT li.*, ea.loanType, ea.type, ea.issueDate AS loanStartDate, ea.amount AS loanAmount
            FROM loan_installments li
            JOIN employee_advances ea ON li.loanId = ea.id
            WHERE ea.employeeId = ?
            ORDER BY li.dueDate, li.installmentNumber
        `, [employeeId]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching employee loan installments:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch employee loan installments');
    }
});
exports.getEmployeeLoanInstallments = getEmployeeLoanInstallments;
/**
 * Skip an installment
 */
const skipLoanInstallment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { installmentId } = req.params;
    const { reason, userId } = req.body;
    try {
        yield loanService.skipInstallment(installmentId, reason, userId);
        res.json({ message: 'تم تأجيل القسط بنجاح' });
    }
    catch (error) {
        console.error('Error skipping installment:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'skip installment');
    }
});
exports.skipLoanInstallment = skipLoanInstallment;
/**
 * Settle a loan early
 */
const settleLoanEarly = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loanId } = req.params;
    const { settlementAmount, userId, notes } = req.body;
    try {
        const parsedAmount = parseFloat(settlementAmount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ error: 'مبلغ التسوية غير صحيح' });
        }
        yield loanService.settleLoanEarly(loanId, parsedAmount, userId, notes);
        res.json({ message: 'تم تسوية القرض بنجاح' });
    }
    catch (error) {
        console.error('Error settling loan:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'settle loan');
    }
});
exports.settleLoanEarly = settleLoanEarly;
/**
 * Partial loan repayment (مردودات سلف)
 */
const repayLoan = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { loanId } = req.params;
    const { amount, notes } = req.body;
    const user = req.user;
    const userId = (user === null || user === void 0 ? void 0 : user.id) || (user === null || user === void 0 ? void 0 : user.name) || 'system';
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // 1. Execute the loan repayment (updates balance, installments, history)
        const parsedRepayAmount = parseFloat(amount);
        if (isNaN(parsedRepayAmount) || parsedRepayAmount <= 0) {
            conn.release();
            return res.status(400).json({ error: 'مبلغ السداد غير صحيح' });
        }
        const result = yield loanService.repayLoan(loanId, parsedRepayAmount, userId, notes);
        // 2. Create accounting journal entry (REVERSE of loan creation)
        // Dr Cash/Treasury (money comes back), Cr Employee Loans (loan balance decreases)
        try {
            const repaymentAmount = parsedRepayAmount;
            // Get loan details (employee info)
            const [loans] = yield conn.query('SELECT employeeId FROM employee_advances WHERE id = ?', [loanId]);
            const employeeId = (_a = loans[0]) === null || _a === void 0 ? void 0 : _a.employeeId;
            let employeeName = 'موظف';
            if (employeeId) {
                const [emps] = yield conn.query('SELECT fullName as name FROM employees WHERE id = ?', [employeeId]);
                employeeName = ((_b = emps[0]) === null || _b === void 0 ? void 0 : _b.name) || 'موظف';
            }
            // Find Employee Loans account (same logic as createAdvanceAccountingEntry)
            const [allAccounts] = yield conn.query('SELECT id, code, name FROM accounts');
            let loanAccount = allAccounts.find((a) => (a.name && (a.name.includes('سلف') || a.name.includes('قرض'))) ||
                (a.name && (a.name.toLowerCase().includes('loan') || a.name.toLowerCase().includes('advance'))));
            if (!loanAccount) {
                loanAccount = allAccounts.find((a) => a.code && String(a.code).startsWith('112'));
            }
            if (!loanAccount) {
                loanAccount = allAccounts.find((a) => a.code && String(a.code).startsWith('104'));
            }
            // Find Cash/Treasury account (default treasury)
            let cashAccount = allAccounts.find((a) => a.name && (a.name.includes('خزينة') || a.name.includes('الخزنة') || a.name.includes('صندوق')));
            if (!cashAccount) {
                cashAccount = allAccounts.find((a) => a.name && (a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('treasury')));
            }
            if (!cashAccount) {
                cashAccount = allAccounts.find((a) => a.code && String(a.code).startsWith('101'));
            }
            if (loanAccount && cashAccount) {
                const journalId = (0, crypto_1.randomUUID)();
                const description = `سداد سلفة/قرض - ${employeeName}`;
                const today = new Date().toISOString().split('T')[0];
                // Journal Entry Header
                yield conn.query(`
                    INSERT INTO journal_entries (id, date, description, referenceId, createdBy)
                    VALUES (?, ?, ?, ?, ?)
                `, [journalId, today, description, `REPAY-${loanId.substring(0, 30)}`, (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) || 'System']);
                // Debit: Cash/Treasury (money received)
                yield conn.query(`
                    INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
                    VALUES (?, ?, ?, ?, 0)
                `, [journalId, cashAccount.id, cashAccount.name, repaymentAmount]);
                // Credit: Employee Loans (loan balance decreases)
                yield conn.query(`
                    INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit)
                    VALUES (?, ?, ?, 0, ?)
                `, [journalId, loanAccount.id, loanAccount.name, repaymentAmount]);
                // Update Account Balances
                yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [repaymentAmount, cashAccount.id]);
                yield conn.query('UPDATE accounts SET balance = COALESCE(balance, 0) - ? WHERE id = ?', [repaymentAmount, loanAccount.id]);
                // PERF: console.log(`✅ [repayLoan] Journal entry created: Dr ${cashAccount.name} ${repaymentAmount} / Cr ${loanAccount.name} ${repaymentAmount}`);
            }
            else {
                console.warn('⚠️ [repayLoan] Could not find loan or cash accounts, skipping journal entry', {
                    loanAccount: loanAccount === null || loanAccount === void 0 ? void 0 : loanAccount.name,
                    cashAccount: cashAccount === null || cashAccount === void 0 ? void 0 : cashAccount.name
                });
            }
        }
        catch (jeError) {
            console.error('⚠️ [repayLoan] Error creating journal entry (continuing):', jeError.message);
            // Don't fail the whole operation if journal entry fails
        }
        yield conn.commit();
        res.json(Object.assign({ message: result.isCompleted ? 'تم سداد السلفة بالكامل' : 'تم تسجيل السداد بنجاح' }, result));
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error repaying loan:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'repay loan');
    }
    finally {
        conn.release();
    }
});
exports.repayLoan = repayLoan;
/**
 * Get loan constraints configuration
 */
const getLoanConstraints = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const constraints = yield loanService.getLoanConstraints();
        res.json(constraints);
    }
    catch (error) {
        console.error('Error fetching loan constraints:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch loan constraints');
    }
});
exports.getLoanConstraints = getLoanConstraints;
/**
 * Get loan history/audit trail
 */
const getLoanHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loanId } = req.params;
    try {
        const [history] = yield db_1.pool.query(`
            SELECT lh.*, u.username as performedByName
            FROM loan_history lh
            LEFT JOIN users u ON lh.performedBy = u.id
            WHERE lh.loanId = ?
            ORDER BY lh.createdAt DESC
        `, [loanId]);
        res.json(history);
    }
    catch (error) {
        console.error('Error fetching loan history:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch loan history');
    }
});
exports.getLoanHistory = getLoanHistory;
// ==========================================
// PAYROLL TEMPLATES (Allowances/Deductions)
// ==========================================
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
// Assign template to employee
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
// ==========================================
// LEAVE TYPES (أنواع الإجازات)
// ==========================================
const getLeaveTypes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.pool.query(`
            SELECT * FROM leave_types 
            ORDER BY name
        `);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching leave types:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch leave types');
    }
});
exports.getLeaveTypes = getLeaveTypes;
const createLeaveType = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, nameEn, isPaid, defaultDays, carryOver, maxCarryOverDays, color, requiresDocument } = req.body;
    try {
        const id = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`
            INSERT INTO leave_types (id, name, nameEn, isPaid, defaultDays, carryOver, maxCarryOverDays, color, isActive, requiresDocument)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)
        `, [id, name, nameEn, isPaid !== false, defaultDays || 0, carryOver || false, maxCarryOverDays || 0, color || '#3b82f6', requiresDocument || false]);
        res.status(201).json({ id, message: 'Leave type created successfully' });
    }
    catch (error) {
        console.error('Error creating leave type:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'create leave type');
    }
});
exports.createLeaveType = createLeaveType;
const updateLeaveType = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { name, nameEn, isPaid, defaultDays, carryOver, maxCarryOverDays, color, isActive, requiresDocument } = req.body;
    try {
        yield db_1.pool.query(`
            UPDATE leave_types SET 
                name = ?, nameEn = ?, isPaid = ?, defaultDays = ?, 
                carryOver = ?, maxCarryOverDays = ?, color = ?, isActive = ?, requiresDocument = ?
            WHERE id = ?
        `, [name, nameEn, isPaid, defaultDays, carryOver, maxCarryOverDays, color, isActive, requiresDocument, id]);
        res.json({ message: 'Leave type updated successfully' });
    }
    catch (error) {
        console.error('Error updating leave type:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'update leave type');
    }
});
exports.updateLeaveType = updateLeaveType;
const deleteLeaveType = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { id } = req.params;
    try {
        // Check if leave type is referenced by any balances or requests
        const [balanceRefs] = yield db_1.pool.query('SELECT COUNT(*) as count FROM leave_balances WHERE leaveTypeId = ?', [id]);
        const [requestRefs] = yield db_1.pool.query('SELECT COUNT(*) as count FROM leave_requests WHERE leaveTypeId = ?', [id]);
        const totalRefs = (((_a = balanceRefs[0]) === null || _a === void 0 ? void 0 : _a.count) || 0) + (((_b = requestRefs[0]) === null || _b === void 0 ? void 0 : _b.count) || 0);
        if (totalRefs > 0) {
            return res.status(400).json({
                error: `لا يمكن حذف نوع الإجازة لوجود ${totalRefs} سجل مرتبط به (أرصدة أو طلبات). يمكنك تعطيله بدلاً من حذفه.`
            });
        }
        yield db_1.pool.query('DELETE FROM leave_types WHERE id = ?', [id]);
        res.json({ message: 'Leave type deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting leave type:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete leave type');
    }
});
exports.deleteLeaveType = deleteLeaveType;
// ==========================================
// LEAVE BALANCES (أرصدة الإجازات)
// ==========================================
const getLeaveBalances = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, year } = req.query;
    const currentYear = year || new Date().getFullYear();
    try {
        let query = `
            SELECT lb.*, e.fullName as employeeName, lt.name as leaveTypeName, lt.color as leaveTypeColor
            FROM leave_balances lb
            JOIN employees e ON lb.employeeId = e.id
            JOIN leave_types lt ON lb.leaveTypeId = lt.id
            WHERE lb.year = ?
        `;
        const params = [currentYear];
        if (employeeId) {
            query += ` AND lb.employeeId = ?`;
            params.push(employeeId);
        }
        query += ` ORDER BY e.fullName, lt.name`;
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching leave balances:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch leave balances');
    }
});
exports.getLeaveBalances = getLeaveBalances;
const initializeLeaveBalances = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { year } = req.body;
    const targetYear = year || new Date().getFullYear();
    try {
        // Get all active employees and leave types
        const [employees] = yield db_1.pool.query('SELECT id FROM employees WHERE status = ?', ['ACTIVE']);
        const [leaveTypes] = yield db_1.pool.query('SELECT id, defaultDays FROM leave_types WHERE isActive = TRUE');
        // Batch INSERT IGNORE — avoids N+1 queries
        let created = 0;
        const values = [];
        const placeholders = [];
        for (const emp of employees) {
            for (const lt of leaveTypes) {
                const id = (0, crypto_1.randomUUID)();
                placeholders.push('(?, ?, ?, ?, ?, 0, 0)');
                values.push(id, emp.id, lt.id, targetYear, lt.defaultDays || 0);
            }
        }
        if (placeholders.length > 0) {
            // INSERT IGNORE skips rows that violate the UNIQUE constraint
            const [result] = yield db_1.pool.query(`
                INSERT IGNORE INTO leave_balances (id, employeeId, leaveTypeId, year, allocated, used, carriedOver)
                VALUES ${placeholders.join(', ')}
            `, values);
            created = result.affectedRows || 0;
        }
        res.json({ message: `Initialized ${created} leave balances for year ${targetYear}` });
    }
    catch (error) {
        console.error('Error initializing leave balances:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'initialize leave balances');
    }
});
exports.initializeLeaveBalances = initializeLeaveBalances;
const updateLeaveBalance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { allocated, carriedOver } = req.body;
    try {
        yield db_1.pool.query(`
            UPDATE leave_balances SET allocated = ?, carriedOver = ?
            WHERE id = ?
        `, [allocated, carriedOver || 0, id]);
        res.json({ message: 'Balance updated successfully' });
    }
    catch (error) {
        console.error('Error updating leave balance:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'update leave balance');
    }
});
exports.updateLeaveBalance = updateLeaveBalance;
// ==========================================
// LEAVE REQUESTS (طلبات الإجازات)
// ==========================================
const getLeaveRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, status, startDate, endDate } = req.query;
    try {
        let query = `
            SELECT lr.*, e.fullName as employeeName, e.jobTitle, e.department,
                   lt.name as leaveTypeName, lt.color as leaveTypeColor, lt.isPaid,
                   u.name as approvedByName
            FROM leave_requests lr
            JOIN employees e ON lr.employeeId = e.id
            JOIN leave_types lt ON lr.leaveTypeId = lt.id
            LEFT JOIN users u ON lr.approvedBy = u.id
            WHERE 1=1
        `;
        const params = [];
        if (employeeId) {
            query += ` AND lr.employeeId = ?`;
            params.push(employeeId);
        }
        if (status) {
            query += ` AND lr.status = ?`;
            params.push(status);
        }
        if (startDate && endDate) {
            query += ` AND ((lr.startDate BETWEEN ? AND ?) OR (lr.endDate BETWEEN ? AND ?))`;
            params.push(startDate, endDate, startDate, endDate);
        }
        query += ` ORDER BY lr.createdAt DESC`;
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching leave requests:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch leave requests');
    }
});
exports.getLeaveRequests = getLeaveRequests;
const createLeaveRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId, leaveTypeId, startDate, endDate, days, reason, notes } = req.body;
    try {
        const id = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`
            INSERT INTO leave_requests (id, employeeId, leaveTypeId, startDate, endDate, days, reason, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
        `, [id, employeeId, leaveTypeId, startDate, endDate, days, reason, notes]);
        res.status(201).json({ id, message: 'Leave request created successfully' });
    }
    catch (error) {
        console.error('Error creating leave request:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'create leave request');
    }
});
exports.createLeaveRequest = createLeaveRequest;
const approveLeaveRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Get leave request details
        const [requests] = yield conn.query(`
            SELECT lr.*, lt.isPaid FROM leave_requests lr
            JOIN leave_types lt ON lr.leaveTypeId = lt.id
            WHERE lr.id = ?
        `, [id]);
        if (requests.length === 0) {
            yield conn.rollback();
            return res.status(404).json({ error: 'طلب الإجازة غير موجود' });
        }
        const request = requests[0];
        // Guard: Only PENDING requests can be approved
        if (request.status !== 'PENDING') {
            yield conn.rollback();
            return res.status(400).json({ error: `لا يمكن اعتماد طلب بحالة ${request.status}. يجب أن يكون الطلب معلقاً.` });
        }
        const year = new Date(request.startDate).getFullYear();
        // Lock the balance row and check sufficiency
        const [balances] = yield conn.query(`
            SELECT allocated, used, carriedOver FROM leave_balances
            WHERE employeeId = ? AND leaveTypeId = ? AND year = ?
            FOR UPDATE
        `, [request.employeeId, request.leaveTypeId, year]);
        if (balances.length > 0) {
            const bal = balances[0];
            const remaining = (parseFloat(bal.allocated) || 0) + (parseFloat(bal.carriedOver) || 0) - (parseFloat(bal.used) || 0);
            if (remaining < parseFloat(request.days)) {
                yield conn.rollback();
                return res.status(400).json({
                    error: `رصيد الإجازات غير كافي. المتبقي: ${remaining} يوم، المطلوب: ${request.days} يوم`
                });
            }
        }
        // Deduct from leave balance
        yield conn.query(`
            UPDATE leave_balances SET used = used + ?
            WHERE employeeId = ? AND leaveTypeId = ? AND year = ?
        `, [request.days, request.employeeId, request.leaveTypeId, year]);
        // Update request status
        yield conn.query(`
            UPDATE leave_requests SET status = 'APPROVED', approvedBy = ?, approvedAt = NOW()
            WHERE id = ?
        `, [userId, id]);
        yield conn.commit();
        res.json({ message: 'تم اعتماد طلب الإجازة بنجاح' });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error approving leave request:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'approve leave request');
    }
    finally {
        conn.release();
    }
});
exports.approveLeaveRequest = approveLeaveRequest;
const rejectLeaveRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    try {
        yield db_1.pool.query(`
            UPDATE leave_requests SET status = 'REJECTED', approvedBy = ?, approvedAt = NOW(), rejectionReason = ?
            WHERE id = ?
        `, [userId, rejectionReason, id]);
        res.json({ message: 'Leave request rejected' });
    }
    catch (error) {
        console.error('Error rejecting leave request:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'reject leave request');
    }
});
exports.rejectLeaveRequest = rejectLeaveRequest;
const cancelLeaveRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Get request details to reverse balance if already approved
        const [requests] = yield conn.query(`SELECT * FROM leave_requests WHERE id = ?`, [id]);
        if (requests.length === 0) {
            yield conn.rollback();
            return res.status(404).json({ error: 'طلب الإجازة غير موجود' });
        }
        const request = requests[0];
        if (request.status === 'CANCELLED') {
            yield conn.rollback();
            return res.status(400).json({ error: 'الطلب ملغى بالفعل' });
        }
        if (request.status === 'APPROVED') {
            const year = new Date(request.startDate).getFullYear();
            // Restore balance atomically
            yield conn.query(`
                UPDATE leave_balances SET used = GREATEST(used - ?, 0)
                WHERE employeeId = ? AND leaveTypeId = ? AND year = ?
            `, [request.days, request.employeeId, request.leaveTypeId, year]);
        }
        yield conn.query(`UPDATE leave_requests SET status = 'CANCELLED' WHERE id = ?`, [id]);
        yield conn.commit();
        res.json({ message: 'تم إلغاء طلب الإجازة بنجاح' });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error cancelling leave request:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'cancel leave request');
    }
    finally {
        conn.release();
    }
});
exports.cancelLeaveRequest = cancelLeaveRequest;
const deleteLeaveRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        yield db_1.pool.query('DELETE FROM leave_requests WHERE id = ? AND status = ?', [id, 'PENDING']);
        res.json({ message: 'Leave request deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting leave request:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete leave request');
    }
});
exports.deleteLeaveRequest = deleteLeaveRequest;
// ==========================================
// SALARY COMPONENTS & STRUCTURE (Phase 2)
// ==========================================
// Imports moved to top
// Get all salary components
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
// Get employee's salary structure
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
// Set employee salary component
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
// Calculate tax preview for an employee
const calculateTaxPreview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { annualIncome, annualInsurance, personalExemption } = req.body;
    try {
        const result = yield taxService.calculateEgyptianIncomeTax(parseFloat(annualIncome) || 0, parseFloat(annualInsurance) || 0, parseFloat(personalExemption) || 15000);
        res.json(result);
    }
    catch (error) {
        console.error('Error calculating tax preview:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'calculate tax preview');
    }
});
exports.calculateTaxPreview = calculateTaxPreview;
// Get Egyptian tax brackets
const getTaxBrackets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { year } = req.query;
    try {
        const brackets = yield taxService.getTaxBrackets(year ? parseInt(year) : new Date().getFullYear());
        res.json(brackets);
    }
    catch (error) {
        console.error('Error fetching tax brackets:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch tax brackets');
    }
});
exports.getTaxBrackets = getTaxBrackets;
// Get insurance configuration
const getInsuranceConfig = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const config = yield taxService.getActiveInsuranceConfig();
        res.json(config);
    }
    catch (error) {
        console.error('Error fetching insurance config:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch insurance config');
    }
});
exports.getInsuranceConfig = getInsuranceConfig;
// Calculate full payroll preview for an employee
const calculatePayrollPreview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId } = req.params;
    const { employee, attendance, loanDeductions } = req.body;
    try {
        const result = yield salaryService.calculateEmployeePayroll(employeeId, employee, attendance || {}, loanDeductions || 0);
        res.json(result);
    }
    catch (error) {
        console.error('Error calculating payroll preview:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'calculate payroll preview');
    }
});
exports.calculatePayrollPreview = calculatePayrollPreview;
// Create default salary structure from existing employee data
const migrateEmployeeSalaryStructure = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { employeeId } = req.params;
    try {
        // Get employee's current salary
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
// ==========================================
// RETROACTIVE ADJUSTMENTS (Phase 2)
// ==========================================
const retroactiveService = __importStar(require("../services/retroactiveService"));
const treasuryService = __importStar(require("../services/treasuryService"));
// Calculate retroactive adjustment preview
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
// Create retroactive adjustment
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
// Get pending adjustments for employee
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
// Approve adjustment
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
// Apply adjustment to payroll
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
// ==========================================
// TREASURY VERIFICATION (Phase 2)
// ==========================================
// Preflight check before payroll approval
const preflightPayrollApproval = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { cycleId } = req.params;
    try {
        const result = yield treasuryService.preflightPayrollApproval(cycleId);
        res.json(result);
    }
    catch (error) {
        console.error('Error running preflight check:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'preflight payroll approval');
    }
});
exports.preflightPayrollApproval = preflightPayrollApproval;
// Get treasury balance
const getTreasuryBalance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield treasuryService.getTreasuryBalance();
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching treasury balance:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch treasury balance');
    }
});
exports.getTreasuryBalance = getTreasuryBalance;
// Verify treasury for specific payroll
const verifyTreasuryForPayroll = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { cycleId } = req.params;
    const { safetyMarginPercent } = req.query;
    try {
        const result = yield treasuryService.verifyTreasuryForPayroll(cycleId, safetyMarginPercent ? parseFloat(safetyMarginPercent) : undefined);
        res.json(result);
    }
    catch (error) {
        console.error('Error verifying treasury:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'verify treasury for payroll');
    }
});
exports.verifyTreasuryForPayroll = verifyTreasuryForPayroll;
// ==========================================
// SALARY COMPONENT ACTIONS (Phase 2.5)
// ==========================================
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
// ==========================================
// SALARY STRUCTURE TEMPLATES (Beast Mode)
// ==========================================
const structureService = __importStar(require("../services/salaryStructureService"));
const workEntryService = __importStar(require("../services/workEntryService"));
const additionalSalaryService = __importStar(require("../services/additionalSalaryService"));
const payrollGLService = __importStar(require("../services/payrollGLService"));
// --- Structure Templates ---
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
// --- Structure Lines ---
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
// --- Employee ↔ Structure Assignment ---
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
// ==========================================
// WORK ENTRIES (Beast Mode)
// ==========================================
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
// ==========================================
// ADDITIONAL SALARY (Beast Mode)
// ==========================================
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
// ==========================================
// COMPONENT-LEVEL GL INTEGRATION (Beast Mode)
// ==========================================
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
// ==========================================
// RULE CATEGORIES (Beast Mode)
// ==========================================
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
