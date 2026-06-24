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
exports.deleteTimesheet = exports.updateTimesheetStatus = exports.createTimesheet = exports.getTimesheets = exports.deleteTask = exports.updateTask = exports.createTask = exports.getTasks = exports.deleteProject = exports.updateProject = exports.createProject = exports.getProject = exports.getProjects = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const auditController_1 = require("./auditController");
// ========================================
// PROJECTS
// ========================================
const getProjects = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status, managerId, partnerId, search } = req.query;
        let query = `
            SELECT p.*,
                   u.name as managerName,
                   (SELECT COUNT(*) FROM project_tasks WHERE projectId = p.id) as taskCount,
                   (SELECT COUNT(*) FROM project_tasks WHERE projectId = p.id AND status = 'DONE') as completedTaskCount,
                   (SELECT COALESCE(SUM(hours), 0) FROM timesheets WHERE projectId = p.id AND status = 'APPROVED') as totalHours
            FROM projects p
            LEFT JOIN users u ON p.managerId = u.id
            WHERE 1=1
        `;
        const params = [];
        if (status) {
            query += ' AND p.status = ?';
            params.push(status);
        }
        if (managerId) {
            query += ' AND p.managerId = ?';
            params.push(managerId);
        }
        if (partnerId) {
            query += ' AND p.partnerId = ?';
            params.push(partnerId);
        }
        if (search) {
            query += ' AND (p.name LIKE ? OR p.code LIKE ? OR p.partnerName LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s);
        }
        query += ' ORDER BY p.createdAt DESC';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getProjects = getProjects;
const getProject = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [projects] = yield db_1.pool.query(`
            SELECT p.*, u.name as managerName
            FROM projects p
            LEFT JOIN users u ON p.managerId = u.id
            WHERE p.id = ?
        `, [id]);
        if (!projects[0])
            return res.status(404).json({ error: 'Project not found' });
        const [tasks] = yield db_1.pool.query(`
            SELECT t.*, u.name as assignedToName
            FROM project_tasks t
            LEFT JOIN users u ON t.assignedTo = u.id
            WHERE t.projectId = ?
            ORDER BY t.sortOrder, t.createdAt
        `, [id]);
        const [timesheets] = yield db_1.pool.query(`
            SELECT t.*, u.name as employeeName
            FROM timesheets t
            LEFT JOIN users u ON t.employeeId = u.id
            WHERE t.projectId = ?
            ORDER BY t.activityDate DESC
            LIMIT 50
        `, [id]);
        res.json(Object.assign(Object.assign({}, projects[0]), { tasks, timesheets }));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getProject = getProject;
const createProject = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, code, partnerId, partnerName, managerId, priority, startDate, endDate, estimatedCost, estimatedRevenue, description, notes } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Project name is required' });
        const id = (0, crypto_1.randomUUID)();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        yield db_1.pool.query(`
            INSERT INTO projects (id, name, code, partnerId, partnerName, managerId, priority, startDate, endDate, estimatedCost, estimatedRevenue, description, notes, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, name, code || null, partnerId || null, partnerName || null, managerId || null, priority || 'MEDIUM', startDate || null, endDate || null, estimatedCost || 0, estimatedRevenue || 0, description || null, notes || null, user]);
        yield (0, auditController_1.logAction)(user, 'Projects', 'PROJECT_CREATED', `Created project: ${name}`, `ID: ${id}`);
        res.status(201).json({ id, name });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.createProject = createProject;
const updateProject = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, code, partnerId, partnerName, managerId, status, priority, startDate, endDate, actualEndDate, percentComplete, estimatedCost, actualCost, estimatedRevenue, actualRevenue, description, notes } = req.body;
        const fields = [];
        const params = [];
        const addField = (field, value) => { if (value !== undefined) {
            fields.push(`${field} = ?`);
            params.push(value);
        } };
        addField('name', name);
        addField('code', code);
        addField('partnerId', partnerId);
        addField('partnerName', partnerName);
        addField('managerId', managerId);
        addField('status', status);
        addField('priority', priority);
        addField('startDate', startDate);
        addField('endDate', endDate);
        addField('actualEndDate', actualEndDate);
        addField('percentComplete', percentComplete);
        addField('estimatedCost', estimatedCost);
        addField('actualCost', actualCost);
        addField('estimatedRevenue', estimatedRevenue);
        addField('actualRevenue', actualRevenue);
        addField('description', description);
        addField('notes', notes);
        if (fields.length === 0)
            return res.status(400).json({ error: 'No fields to update' });
        params.push(id);
        yield db_1.pool.query(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updateProject = updateProject;
const deleteProject = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield db_1.pool.query('DELETE FROM projects WHERE id = ?', [id]);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteProject = deleteProject;
// ========================================
// TASKS
// ========================================
const getTasks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { projectId, assignedTo, status, search } = req.query;
        let query = `
            SELECT t.*, u.name as assignedToName, p.name as projectName
            FROM project_tasks t
            LEFT JOIN users u ON t.assignedTo = u.id
            LEFT JOIN projects p ON t.projectId = p.id
            WHERE 1=1
        `;
        const params = [];
        if (projectId) {
            query += ' AND t.projectId = ?';
            params.push(projectId);
        }
        if (assignedTo) {
            query += ' AND t.assignedTo = ?';
            params.push(assignedTo);
        }
        if (status) {
            query += ' AND t.status = ?';
            params.push(status);
        }
        if (search) {
            query += ' AND (t.title LIKE ? OR t.description LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s);
        }
        query += ' ORDER BY t.sortOrder, t.createdAt';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getTasks = getTasks;
const createTask = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { projectId, title, description, assignedTo, priority, startDate, endDate, estimatedHours, isMilestone, parentTaskId, sortOrder } = req.body;
        if (!projectId || !title)
            return res.status(400).json({ error: 'Project and title are required' });
        const id = (0, crypto_1.randomUUID)();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        yield db_1.pool.query(`
            INSERT INTO project_tasks (id, projectId, title, description, assignedTo, priority, startDate, endDate, estimatedHours, isMilestone, parentTaskId, sortOrder, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, projectId, title, description || null, assignedTo || null, priority || 'MEDIUM', startDate || null, endDate || null, estimatedHours || 0, isMilestone || false, parentTaskId || null, sortOrder || 0, user]);
        // Recalculate project % complete
        yield recalculateProjectProgress(projectId);
        res.status(201).json({ id, title });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.createTask = createTask;
const updateTask = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { title, description, assignedTo, status, priority, startDate, endDate, estimatedHours, actualHours, isMilestone, sortOrder } = req.body;
        const fields = [];
        const params = [];
        const addField = (field, value) => { if (value !== undefined) {
            fields.push(`${field} = ?`);
            params.push(value);
        } };
        addField('title', title);
        addField('description', description);
        addField('assignedTo', assignedTo);
        addField('status', status);
        addField('priority', priority);
        addField('startDate', startDate);
        addField('endDate', endDate);
        addField('estimatedHours', estimatedHours);
        addField('actualHours', actualHours);
        addField('isMilestone', isMilestone);
        addField('sortOrder', sortOrder);
        if (status === 'DONE') {
            fields.push('completedAt = NOW()');
        }
        if (fields.length === 0)
            return res.status(400).json({ error: 'No fields to update' });
        params.push(id);
        yield db_1.pool.query(`UPDATE project_tasks SET ${fields.join(', ')} WHERE id = ?`, params);
        // Recalculate project progress
        const [task] = yield db_1.pool.query('SELECT projectId FROM project_tasks WHERE id = ?', [id]);
        if ((_a = task[0]) === null || _a === void 0 ? void 0 : _a.projectId)
            yield recalculateProjectProgress(task[0].projectId);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updateTask = updateTask;
const deleteTask = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const [task] = yield db_1.pool.query('SELECT projectId FROM project_tasks WHERE id = ?', [id]);
        yield db_1.pool.query('DELETE FROM project_tasks WHERE id = ?', [id]);
        if ((_a = task[0]) === null || _a === void 0 ? void 0 : _a.projectId)
            yield recalculateProjectProgress(task[0].projectId);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteTask = deleteTask;
// ========================================
// TIMESHEETS
// ========================================
const getTimesheets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employeeId, projectId, status, startDate, endDate } = req.query;
        let query = `
            SELECT ts.*, p.name as projectName, pt.title as taskTitle
            FROM timesheets ts
            LEFT JOIN projects p ON ts.projectId = p.id
            LEFT JOIN project_tasks pt ON ts.taskId = pt.id
            WHERE 1=1
        `;
        const params = [];
        if (employeeId) {
            query += ' AND ts.employeeId = ?';
            params.push(employeeId);
        }
        if (projectId) {
            query += ' AND ts.projectId = ?';
            params.push(projectId);
        }
        if (status) {
            query += ' AND ts.status = ?';
            params.push(status);
        }
        if (startDate) {
            query += ' AND ts.activityDate >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND ts.activityDate <= ?';
            params.push(endDate);
        }
        query += ' ORDER BY ts.activityDate DESC LIMIT 200';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getTimesheets = getTimesheets;
const createTimesheet = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employeeId, employeeName, projectId, taskId, activityDate, hours, isBillable, billingRate, description } = req.body;
        if (!employeeId || !activityDate || !hours)
            return res.status(400).json({ error: 'Employee, date, and hours are required' });
        const id = (0, crypto_1.randomUUID)();
        const billingAmount = (isBillable && billingRate) ? hours * billingRate : 0;
        yield db_1.pool.query(`
            INSERT INTO timesheets (id, employeeId, employeeName, projectId, taskId, activityDate, hours, isBillable, billingRate, billingAmount, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, employeeId, employeeName || null, projectId || null, taskId || null, activityDate, hours, isBillable !== null && isBillable !== void 0 ? isBillable : true, billingRate || 0, billingAmount, description || null]);
        // Update task actual hours if linked
        if (taskId) {
            yield db_1.pool.query('UPDATE project_tasks SET actualHours = actualHours + ? WHERE id = ?', [hours, taskId]);
        }
        res.status(201).json({ id });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.createTimesheet = createTimesheet;
const updateTimesheetStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status)
            return res.status(400).json({ error: 'Status is required' });
        const user = req.user;
        let query = 'UPDATE timesheets SET status = ?';
        const params = [status];
        if (status === 'APPROVED') {
            query += ', approvedBy = ?, approvedAt = NOW()';
            params.push((user === null || user === void 0 ? void 0 : user.id) || null);
        }
        query += ' WHERE id = ?';
        params.push(id);
        yield db_1.pool.query(query, params);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updateTimesheetStatus = updateTimesheetStatus;
const deleteTimesheet = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const [ts] = yield db_1.pool.query('SELECT status FROM timesheets WHERE id = ?', [id]);
        if (((_a = ts[0]) === null || _a === void 0 ? void 0 : _a.status) === 'APPROVED')
            return res.status(400).json({ error: 'Cannot delete approved timesheets' });
        yield db_1.pool.query('DELETE FROM timesheets WHERE id = ?', [id]);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteTimesheet = deleteTimesheet;
// ========================================
// HELPERS
// ========================================
function recalculateProjectProgress(projectId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const [stats] = yield db_1.pool.query(`
        SELECT COUNT(*) as total, SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) as done
        FROM project_tasks WHERE projectId = ?
    `, [projectId]);
        const total = ((_a = stats[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
        const done = ((_b = stats[0]) === null || _b === void 0 ? void 0 : _b.done) || 0;
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;
        yield db_1.pool.query('UPDATE projects SET percentComplete = ? WHERE id = ?', [percent, projectId]);
    });
}
