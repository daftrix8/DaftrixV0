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
exports.deleteLeaveRequest = exports.cancelLeaveRequest = exports.rejectLeaveRequest = exports.approveLeaveRequest = exports.createLeaveRequest = exports.getLeaveRequests = exports.updateLeaveBalance = exports.initializeLeaveBalances = exports.getLeaveBalances = exports.deleteLeaveType = exports.updateLeaveType = exports.createLeaveType = exports.getLeaveTypes = void 0;
const db_1 = require("../../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../../utils/errorHandler");
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
/**
 * Initialize leave balances.
 * NOTE (Fix #15): This utilizes INSERT IGNORE.
 * For duplicate skips to function correctly, leave_balances must have a uniqueness constraint:
 * ALTER TABLE leave_balances ADD UNIQUE KEY uq_emp_type_year (employeeId, leaveTypeId, year);
 */
const initializeLeaveBalances = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { year } = req.body;
    const targetYear = year || new Date().getFullYear();
    try {
        const [employees] = yield db_1.pool.query('SELECT id FROM employees WHERE status = ?', ['ACTIVE']);
        const [leaveTypes] = yield db_1.pool.query('SELECT id, defaultDays FROM leave_types WHERE isActive = TRUE');
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
    const { employeeId, leaveTypeId, startDate, endDate, reason, notes } = req.body;
    const days = req.body.days != null
        ? Number(req.body.days)
        : Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
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
        if (request.status !== 'PENDING') {
            yield conn.rollback();
            return res.status(400).json({ error: `لا يمكن اعتماد طلب بحالة ${request.status}. يجب أن يكون الطلب معلقاً.` });
        }
        const year = new Date(request.startDate).getFullYear();
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
        yield conn.query(`
            UPDATE leave_balances SET used = used + ?
            WHERE employeeId = ? AND leaveTypeId = ? AND year = ?
        `, [request.days, request.employeeId, request.leaveTypeId, year]);
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
        conn.release(); // Fix #1: always release connection
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
        conn.release(); // Fix #1: always release connection
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
