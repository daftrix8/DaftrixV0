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
exports.deleteWorkOrder = exports.rateWorkOrder = exports.updateWorkOrder = exports.batchCreateWorkOrders = exports.createWorkOrder = exports.getWorkOrderEmployees = exports.getWorkOrders = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const eventBus_1 = require("../utils/eventBus");
const auditController_1 = require("./auditController");
const dateEngine_1 = require("../utils/dateEngine");
// Helper to format work order query results
function formatWorkOrderRow(row) {
    return {
        id: row.id,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        employeeJobTitle: row.employee_job_title,
        employeeAvatar: row.employee_avatar,
        title: row.title,
        description: row.description,
        scheduledDate: row.scheduled_date,
        status: row.status,
        rating: row.rating,
        ratingNotes: row.rating_notes,
        ratedAt: row.rated_at,
        ratedBy: row.rated_by,
        ratedByName: row.rated_by_name,
        partnerId: row.partner_id,
        partnerName: row.partner_name,
        ticketId: row.ticket_id,
        ticketSubject: row.ticket_subject,
        createdBy: row.created_by,
        createdByName: row.created_by_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
const getWorkOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate, employeeId, status } = req.query;
        let query = `
      SELECT wo.*,
             e.fullName AS employee_name, e.jobTitle AS employee_job_title, e.avatar AS employee_avatar,
             p.name AS partner_name,
             t.subject AS ticket_subject,
             cu.name AS created_by_name,
             ru.name AS rated_by_name
      FROM crm_employee_work_orders wo
      LEFT JOIN employees e ON wo.employee_id = e.id
      LEFT JOIN partners p ON wo.partner_id = p.id
      LEFT JOIN crm_tickets t ON wo.ticket_id = t.id
      LEFT JOIN users cu ON wo.created_by = cu.id
      LEFT JOIN users ru ON wo.rated_by = ru.id
      WHERE 1=1
    `;
        const params = [];
        if (startDate) {
            query += ' AND wo.scheduled_date >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND wo.scheduled_date <= ?';
            params.push(endDate);
        }
        if (employeeId) {
            query += ' AND wo.employee_id = ?';
            params.push(employeeId);
        }
        if (status) {
            query += ' AND wo.status = ?';
            params.push(status);
        }
        query += ' ORDER BY wo.scheduled_date ASC, wo.created_at ASC';
        const [rows] = yield (0, db_1.safePoolQuery)(query, params);
        res.json({
            success: true,
            data: rows.map(formatWorkOrderRow)
        });
    }
    catch (error) {
        console.error('Error fetching work orders:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch work orders' });
    }
});
exports.getWorkOrders = getWorkOrders;
const getWorkOrderEmployees = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield (0, db_1.safePoolQuery)(`
      SELECT id, fullName AS name, jobTitle AS jobTitle, avatar, department 
      FROM employees 
      WHERE status = 'ACTIVE' 
      ORDER BY fullName ASC
    `);
        res.json({ success: true, data: rows });
    }
    catch (error) {
        console.error('Error fetching work order employees:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch employees' });
    }
});
exports.getWorkOrderEmployees = getWorkOrderEmployees;
const createWorkOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { employeeId, title, description, scheduledDate, partnerId, ticketId } = req.body;
        const createdBy = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!employeeId || !title || !scheduledDate) {
            return res.status(400).json({ success: false, message: 'Required fields: employeeId, title, scheduledDate' });
        }
        const id = (0, crypto_1.randomUUID)();
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO crm_employee_work_orders 
        (id, employee_id, title, description, scheduled_date, status, partner_id, ticket_id, created_by)
      VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
    `, [
            id, employeeId, title, description || null,
            dateEngine_1.DateEngine.toMySQL(scheduledDate), partnerId || null, ticketId || null, createdBy
        ]);
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'WORK_ORDER_CREATED', `Created work order: ${title}`, `Work Order ID: ${id}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-work-orders' });
        res.status(201).json({ success: true, id, message: 'Work order created successfully' });
    }
    catch (error) {
        console.error('Error creating work order:', error);
        res.status(500).json({ success: false, message: 'Failed to create work order' });
    }
});
exports.createWorkOrder = createWorkOrder;
const batchCreateWorkOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { workOrders } = req.body;
        const createdBy = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!workOrders || !Array.isArray(workOrders) || workOrders.length === 0) {
            return res.status(400).json({ success: false, message: 'Required: non-empty workOrders array' });
        }
        const ids = [];
        for (const wo of workOrders) {
            const { employeeId, title, description, scheduledDate, partnerId, ticketId } = wo;
            if (!employeeId || !title || !scheduledDate)
                continue;
            const id = (0, crypto_1.randomUUID)();
            yield (0, db_1.safePoolQuery)(`
        INSERT INTO crm_employee_work_orders 
          (id, employee_id, title, description, scheduled_date, status, partner_id, ticket_id, created_by)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
      `, [
                id, employeeId, title, description || null,
                dateEngine_1.DateEngine.toMySQL(scheduledDate), partnerId || null, ticketId || null, createdBy
            ]);
            ids.push(id);
        }
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'WORK_ORDER_BATCH_CREATED', `Created ${ids.length} work orders in batch`, `IDs: ${ids.join(', ')}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-work-orders' });
        res.status(201).json({ success: true, ids, message: `${ids.length} work orders scheduled successfully` });
    }
    catch (error) {
        console.error('Error batch creating work orders:', error);
        res.status(500).json({ success: false, message: 'Failed to schedule work orders' });
    }
});
exports.batchCreateWorkOrders = batchCreateWorkOrders;
const updateWorkOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { employeeId, title, description, scheduledDate, status, partnerId, ticketId } = req.body;
        const updates = [];
        const params = [];
        if (employeeId !== undefined) {
            updates.push('employee_id = ?');
            params.push(employeeId);
        }
        if (title !== undefined) {
            updates.push('title = ?');
            params.push(title);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description || null);
        }
        if (scheduledDate !== undefined) {
            updates.push('scheduled_date = ?');
            params.push(dateEngine_1.DateEngine.toMySQL(scheduledDate));
        }
        if (status !== undefined) {
            updates.push('status = ?');
            params.push(status);
        }
        if (partnerId !== undefined) {
            updates.push('partner_id = ?');
            params.push(partnerId || null);
        }
        if (ticketId !== undefined) {
            updates.push('ticket_id = ?');
            params.push(ticketId || null);
        }
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        params.push(id);
        yield (0, db_1.safePoolQuery)(`UPDATE crm_employee_work_orders SET ${updates.join(', ')} WHERE id = ?`, params);
        const userName = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'WORK_ORDER_UPDATED', `Updated work order`, `Work Order ID: ${id}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-work-orders' });
        res.json({ success: true, message: 'Work order updated successfully' });
    }
    catch (error) {
        console.error('Error updating work order:', error);
        res.status(500).json({ success: false, message: 'Failed to update work order' });
    }
});
exports.updateWorkOrder = updateWorkOrder;
const rateWorkOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { rating, ratingNotes } = req.body;
        const ratedBy = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (rating === undefined || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be an integer between 1 and 5' });
        }
        // Update status to COMPLETED automatically when rating, record rating details
        yield (0, db_1.safePoolQuery)(`
      UPDATE crm_employee_work_orders 
      SET rating = ?, rating_notes = ?, rated_by = ?, rated_at = CURRENT_TIMESTAMP, status = 'COMPLETED'
      WHERE id = ?
    `, [rating, ratingNotes || null, ratedBy, id]);
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'WORK_ORDER_RATED', `Rated employee performance: ${rating}/5 stars`, `Work Order ID: ${id}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-work-orders' });
        res.json({ success: true, message: 'Performance rating submitted successfully' });
    }
    catch (error) {
        console.error('Error submitting rating:', error);
        res.status(500).json({ success: false, message: 'Failed to submit rating' });
    }
});
exports.rateWorkOrder = rateWorkOrder;
const deleteWorkOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const [rows] = yield (0, db_1.safePoolQuery)('SELECT title FROM crm_employee_work_orders WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Work order not found' });
        }
        const title = rows[0].title;
        yield (0, db_1.safePoolQuery)('DELETE FROM crm_employee_work_orders WHERE id = ?', [id]);
        const userName = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'WORK_ORDER_DELETED', `Deleted work order: ${title}`, `Work Order ID: ${id}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-work-orders' });
        res.json({ success: true, message: 'Work order deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting work order:', error);
        res.status(500).json({ success: false, message: 'Failed to delete work order' });
    }
});
exports.deleteWorkOrder = deleteWorkOrder;
