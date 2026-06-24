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
exports.uploadEmployeeAvatar = exports.deleteEmployee = exports.updateEmployee = exports.createEmployee = exports.getEmployees = void 0;
const db_1 = require("../../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../../utils/errorHandler");
const salaryService = __importStar(require("../../services/salaryService"));
/**
 * Resolves the salesman type based on the employee's job title.
 * This ensures the salesman profile matches the employee's role in the organization.
 */
function resolveEmployeeSalesmanType(jobTitle) {
    if (!jobTitle)
        return 'SALES';
    const title = jobTitle.trim();
    if (title.includes('تحصيل') && title.includes('مبيعات'))
        return 'BOTH';
    if (title.includes('تحصيل'))
        return 'COLLECTION';
    return 'SALES';
}
/**
 * Symmetrically syncs an employee record to a matching salesman record.
 * Creating/updating an employee automatically ensures a corresponding salesman exists.
 */
function syncEmployeeToSalesman(employeeId, employeeData) {
    return __awaiter(this, void 0, void 0, function* () {
        const type = resolveEmployeeSalesmanType(employeeData.jobTitle);
        // 1. Check if the employee is already linked to a salesman via salesmanId
        if (employeeData.salesmanId) {
            const [existing] = yield db_1.pool.query('SELECT id FROM salesmen WHERE id = ?', [employeeData.salesmanId]);
            if (existing.length > 0) {
                // Update the existing salesman profile
                yield db_1.pool.query(`UPDATE salesmen
                 SET name = ?, phone = ?, type = ?
                 WHERE id = ?`, [employeeData.fullName, employeeData.phone || null, type, employeeData.salesmanId]);
                return employeeData.salesmanId;
            }
            else {
                throw new Error(`The provided salesmanId '${employeeData.salesmanId}' does not exist.`);
            }
        }
        // 2. Check if a salesman exists with a back-reference to this employeeId
        const [byLink] = yield db_1.pool.query('SELECT id FROM salesmen WHERE employeeId = ? LIMIT 1', [employeeId]);
        if (byLink.length > 0) {
            const existingSalesmanId = byLink[0].id;
            yield db_1.pool.query(`UPDATE salesmen SET name = ?, phone = ?, type = ? WHERE id = ?`, [employeeData.fullName, employeeData.phone || null, type, existingSalesmanId]);
            return existingSalesmanId;
        }
        // 3. Create a brand-new salesman profile if no matching record is found
        const newSalesmanId = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`INSERT INTO salesmen
         (id, name, phone, target, achieved, commissionRate, region, type, employeeId)
         VALUES (?, ?, ?, 0, 0, 0, NULL, ?, ?)`, [
            newSalesmanId,
            employeeData.fullName,
            employeeData.phone || null,
            type,
            employeeId
        ]);
        return newSalesmanId;
    });
}
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
            // Fallback if salesmen table or salesmanId column is missing
            const isMissingField = ((_a = joinErr.message) === null || _a === void 0 ? void 0 : _a.includes('salesmanId')) || joinErr.code === 'ER_BAD_FIELD_ERROR' || joinErr.code === 'ER_NO_SUCH_TABLE';
            if (isMissingField) {
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
    const { fullName, nationalId, jobTitle, department, employmentType, baseSalary, variableSalary, basicSalaryInsurable, personalExemption, insuranceNumber, taxNumber, fingerprintId, branchId, treasuryAccountId, status, hireDate, phone, email, address, salesmanId, createSalesman } = req.body;
    // Input validation
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
        return res.status(400).json({ error: 'اسم الموظف مطلوب' });
    }
    if (baseSalary !== undefined && baseSalary !== null && baseSalary !== '') {
        if (isNaN(Number(baseSalary)) || Number(baseSalary) < 0) {
            return res.status(400).json({ error: 'الراتب الأساسي يجب أن يكون رقماً صحيحاً' });
        }
    }
    // Fix #4: Validate provided salesmanId existence before inserting employee record
    if (salesmanId) {
        try {
            const [existingSalesman] = yield db_1.pool.query('SELECT id FROM salesmen WHERE id = ?', [salesmanId]);
            if (!existingSalesman || existingSalesman.length === 0) {
                return res.status(400).json({ error: 'معرف المندوب المحدد غير موجود' });
            }
        }
        catch (dbErr) {
            console.error('Salesman validation query failed:', dbErr);
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
        // Auto-sync: create/link matching salesman profile unless explicitly requested not to
        const shouldCreateSalesman = createSalesman !== false && createSalesman !== 'NO';
        if (shouldCreateSalesman) {
            try {
                const resolvedSalesmanId = yield syncEmployeeToSalesman(id, {
                    fullName,
                    phone,
                    jobTitle,
                    salesmanId: salesmanId || undefined
                });
                if (!salesmanId) {
                    yield db_1.pool.query('UPDATE employees SET salesmanId = ? WHERE id = ?', [resolvedSalesmanId, id]);
                }
            }
            catch (syncErr) {
                console.warn('[employees.create] Salesman sync failed (non-fatal):', syncErr === null || syncErr === void 0 ? void 0 : syncErr.message);
            }
        }
        res.status(201).json({ id, message: 'Employee created successfully' });
    }
    catch (error) {
        console.error('Error creating employee:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'create employee');
    }
});
exports.createEmployee = createEmployee;
const updateEmployee = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { id } = req.params;
    const { fullName, nationalId, jobTitle, department, employmentType, baseSalary, variableSalary, basicSalaryInsurable, personalExemption, insuranceNumber, taxNumber, fingerprintId, branchId, treasuryAccountId, status, hireDate, phone, email, address, salesmanId, createSalesman } = req.body;
    // Convert ISO datetime to DATE format (YYYY-MM-DD)
    const parsedHireDate = hireDate ? new Date(hireDate).toISOString().split('T')[0] : null;
    // Fix #4: Validate provided salesmanId existence before updating employee record
    if (salesmanId) {
        try {
            const [existingSalesman] = yield db_1.pool.query('SELECT id FROM salesmen WHERE id = ?', [salesmanId]);
            if (!existingSalesman || existingSalesman.length === 0) {
                return res.status(400).json({ error: 'معرف المندوب المحدد غير موجود' });
            }
        }
        catch (dbErr) {
            console.error('Salesman validation query failed:', dbErr);
        }
    }
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
        // Auto-sync: update/link matching salesman profile unless explicitly requested not to
        const shouldCreateSalesman = createSalesman !== false && createSalesman !== 'NO';
        if (shouldCreateSalesman) {
            try {
                const resolvedSalesmanId = yield syncEmployeeToSalesman(id, {
                    fullName,
                    phone,
                    jobTitle,
                    salesmanId: salesmanId || undefined
                });
                if (!salesmanId || salesmanId !== resolvedSalesmanId) {
                    yield db_1.pool.query('UPDATE employees SET salesmanId = ? WHERE id = ?', [resolvedSalesmanId, id]);
                }
            }
            catch (syncErr) {
                console.warn('[employees.update] Salesman sync failed (non-fatal):', syncErr === null || syncErr === void 0 ? void 0 : syncErr.message);
            }
        }
        else if (createSalesman === false || createSalesman === 'NO') {
            // Unlink or delete salesman if they set it to NO/false
            try {
                const [salesmanRows] = yield db_1.pool.query('SELECT id FROM salesmen WHERE employeeId = ?', [id]);
                if (salesmanRows.length > 0) {
                    const existingSalesmanId = salesmanRows[0].id;
                    // Check references
                    const [invCount] = yield db_1.pool.query('SELECT COUNT(*) as count FROM invoices WHERE salesmanId = ?', [existingSalesmanId]);
                    const [partnerCount] = yield db_1.pool.query('SELECT COUNT(*) as count FROM partners WHERE salesmanId = ?', [existingSalesmanId]);
                    const refs = (((_a = invCount[0]) === null || _a === void 0 ? void 0 : _a.count) || 0) + (((_b = partnerCount[0]) === null || _b === void 0 ? void 0 : _b.count) || 0);
                    if (refs === 0) {
                        yield db_1.pool.query('DELETE FROM salesmen WHERE id = ?', [existingSalesmanId]);
                    }
                    else {
                        yield db_1.pool.query('UPDATE salesmen SET employeeId = NULL WHERE id = ?', [existingSalesmanId]);
                    }
                }
                yield db_1.pool.query('UPDATE employees SET salesmanId = NULL WHERE id = ?', [id]);
            }
            catch (syncErr) {
                console.warn('[employees.update] Salesman unlink failed:', syncErr === null || syncErr === void 0 ? void 0 : syncErr.message);
            }
        }
        res.json({ message: 'Employee updated successfully' });
    }
    catch (error) {
        console.error('Error updating employee:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'update employee');
    }
});
exports.updateEmployee = updateEmployee;
const deleteEmployee = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    const { id } = req.params;
    try {
        // Fix #5: Check related records defensively, handling potential missing tables
        let attendanceCount = 0;
        try {
            const [attendance] = yield db_1.pool.query('SELECT COUNT(*) as count FROM attendance_records WHERE employeeId = ?', [id]);
            attendanceCount = ((_a = attendance[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
        }
        catch (e) {
            if (e.code !== 'ER_NO_SUCH_TABLE')
                throw e;
        }
        let payrollCount = 0;
        try {
            const [payroll] = yield db_1.pool.query('SELECT COUNT(*) as count FROM payroll_entries WHERE employeeId = ?', [id]);
            payrollCount = ((_b = payroll[0]) === null || _b === void 0 ? void 0 : _b.count) || 0;
        }
        catch (e) {
            if (e.code !== 'ER_NO_SUCH_TABLE')
                throw e;
        }
        let advanceCount = 0;
        try {
            const [advances] = yield db_1.pool.query('SELECT COUNT(*) as count FROM employee_advances WHERE employeeId = ?', [id]);
            advanceCount = ((_c = advances[0]) === null || _c === void 0 ? void 0 : _c.count) || 0;
        }
        catch (e) {
            if (e.code !== 'ER_NO_SUCH_TABLE')
                throw e;
        }
        const relatedRecords = attendanceCount + payrollCount + advanceCount;
        if (relatedRecords > 0) {
            return res.status(400).json({
                error: `لا يمكن حذف هذا الموظف لأن لديه ${relatedRecords} سجل مرتبط (حضور/رواتب/سلف). قم بتغيير حالته إلى "منهي الخدمة" بدلاً من الحذف.`
            });
        }
        // Auto-sync: safely unlink or delete matching salesman profile
        try {
            const [salesmanRows] = yield db_1.pool.query('SELECT id FROM salesmen WHERE employeeId = ?', [id]);
            if (salesmanRows.length > 0) {
                const salesmanId = salesmanRows[0].id;
                // Check if the salesman is linked to invoices or partners to avoid breaking referential integrity
                const [invCount] = yield db_1.pool.query('SELECT COUNT(*) as count FROM invoices WHERE salesmanId = ?', [salesmanId]);
                const [partnerCount] = yield db_1.pool.query('SELECT COUNT(*) as count FROM partners WHERE salesmanId = ?', [salesmanId]);
                const refs = (((_d = invCount[0]) === null || _d === void 0 ? void 0 : _d.count) || 0) + (((_e = partnerCount[0]) === null || _e === void 0 ? void 0 : _e.count) || 0);
                if (refs === 0) {
                    yield db_1.pool.query('DELETE FROM salesmen WHERE id = ?', [salesmanId]);
                }
                else {
                    yield db_1.pool.query('UPDATE salesmen SET employeeId = NULL WHERE id = ?', [salesmanId]);
                }
            }
        }
        catch (syncErr) {
            console.warn('[employees.delete] Salesman sync cleanup failed (non-fatal):', syncErr === null || syncErr === void 0 ? void 0 : syncErr.message);
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
const uploadEmployeeAvatar = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded' });
    }
    // Return relative path like /uploads/employees/avatar-123.jpg
    const avatarPath = `/uploads/employees/${req.file.filename}`;
    try {
        const [result] = yield db_1.pool.query('UPDATE employees SET avatar = ? WHERE id = ?', [avatarPath, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        res.json({ message: 'Avatar updated successfully', avatar: avatarPath });
    }
    catch (error) {
        console.error('Error uploading employee avatar:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'upload employee avatar');
    }
});
exports.uploadEmployeeAvatar = uploadEmployeeAvatar;
