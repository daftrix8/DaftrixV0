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
exports.addTicketComment = exports.getTicketComments = exports.updateTicket = exports.createTicket = exports.getTicketById = exports.getTickets = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const eventBus_1 = require("../utils/eventBus");
const auditController_1 = require("./auditController");
const getTickets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { partnerId, leadId, status, priority, limit = 50, offset = 0 } = req.query;
        let query = `
      SELECT t.*, 
             p.name as partner_name, COALESCE(p.contactPerson, '') as partner_company,
             l.title as lead_name,
             u.name as assigned_user_name
      FROM crm_tickets t
      LEFT JOIN partners p ON t.partner_id = p.id
      LEFT JOIN crm_leads l ON t.lead_id = l.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE 1=1
    `;
        const params = [];
        if (partnerId) {
            query += ' AND t.partner_id = ?';
            params.push(partnerId);
        }
        if (leadId) {
            query += ' AND t.lead_id = ?';
            params.push(leadId);
        }
        if (status) {
            query += ' AND t.status = ?';
            params.push(status);
        }
        if (priority) {
            query += ' AND t.priority = ?';
            params.push(priority);
        }
        query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
        params.push(Number(limit), Number(offset));
        const [rows] = yield (0, db_1.safePoolQuery)(query, params);
        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM crm_tickets t WHERE 1=1';
        const countParams = [];
        if (partnerId) {
            countQuery += ' AND t.partner_id = ?';
            countParams.push(partnerId);
        }
        if (leadId) {
            countQuery += ' AND t.lead_id = ?';
            countParams.push(leadId);
        }
        if (status) {
            countQuery += ' AND t.status = ?';
            countParams.push(status);
        }
        if (priority) {
            countQuery += ' AND t.priority = ?';
            countParams.push(priority);
        }
        const [countRows] = yield (0, db_1.safePoolQuery)(countQuery, countParams);
        res.json({
            success: true,
            data: rows,
            total: countRows[0].total
        });
    }
    catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
    }
});
exports.getTickets = getTickets;
const getTicketById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [rows] = yield (0, db_1.safePoolQuery)(`
      SELECT t.*, 
             p.name as partner_name, COALESCE(p.contactPerson, '') as partner_company, p.email as partner_email, p.phone as partner_phone,
             l.title as lead_name,
             u.name as assigned_user_name
      FROM crm_tickets t
      LEFT JOIN partners p ON t.partner_id = p.id
      LEFT JOIN crm_leads l ON t.lead_id = l.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id = ?
    `, [id]);
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        res.json({ success: true, data: rows[0] });
    }
    catch (error) {
        console.error('Error fetching ticket:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch ticket' });
    }
});
exports.getTicketById = getTicketById;
const createTicket = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { partner_id, lead_id, subject, description, priority, assigned_to, appointment_date } = req.body;
        if (!partner_id || !subject) {
            return res.status(400).json({ success: false, message: 'Partner ID and Subject are required' });
        }
        const id = (0, crypto_1.randomUUID)();
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO crm_tickets (id, partner_id, lead_id, subject, description, priority, assigned_to, status, appointment_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
    `, [id, partner_id, lead_id || null, subject, description || null, priority || 'MEDIUM', assigned_to || null, appointment_date || null]);
        const userName = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'TICKET_CREATED', `Created ticket: ${subject}`, `Ticket ID: ${id}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-tickets' });
        res.status(201).json({ success: true, id, message: 'Ticket created successfully' });
    }
    catch (error) {
        console.error('Error creating ticket:', error);
        res.status(500).json({ success: false, message: 'Failed to create ticket' });
    }
});
exports.createTicket = createTicket;
const updateTicket = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { status, priority, assigned_to, subject, description, appointment_date } = req.body;
        const updates = [];
        const params = [];
        if (status) {
            updates.push('status = ?');
            params.push(status);
        }
        if (priority) {
            updates.push('priority = ?');
            params.push(priority);
        }
        if (assigned_to !== undefined) {
            updates.push('assigned_to = ?');
            params.push(assigned_to);
        }
        if (subject) {
            updates.push('subject = ?');
            params.push(subject);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description);
        }
        if (appointment_date !== undefined) {
            updates.push('appointment_date = ?');
            params.push(appointment_date);
        }
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        params.push(id);
        yield (0, db_1.safePoolQuery)(`
      UPDATE crm_tickets SET ${updates.join(', ')}
      WHERE id = ?
    `, params);
        const userName = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'TICKET_UPDATED', `Updated ticket`, `Ticket ID: ${id}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-tickets' });
        res.json({ success: true, message: 'Ticket updated successfully' });
    }
    catch (error) {
        console.error('Error updating ticket:', error);
        res.status(500).json({ success: false, message: 'Failed to update ticket' });
    }
});
exports.updateTicket = updateTicket;
const getTicketComments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [rows] = yield (0, db_1.safePoolQuery)(`
      SELECT c.*, u.name as user_name
      FROM crm_ticket_comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.ticket_id = ?
      ORDER BY c.created_at ASC
    `, [id]);
        res.json({ success: true, data: rows });
    }
    catch (error) {
        console.error('Error fetching ticket comments:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch comments' });
    }
});
exports.getTicketComments = getTicketComments;
const addTicketComment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { content, is_internal, attachments } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id; // Assuming authMiddleware populates req.user
        if (!content) {
            return res.status(400).json({ success: false, message: 'Comment content is required' });
        }
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: User ID not found' });
        }
        const commentId = (0, crypto_1.randomUUID)();
        const attachmentsStr = attachments ? JSON.stringify(attachments) : null;
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO crm_ticket_comments (id, ticket_id, user_id, content, is_internal, attachments)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [commentId, id, userId, content, is_internal ? 1 : 0, attachmentsStr]);
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'TICKET_COMMENT_ADDED', `Added comment to ticket`, `Ticket ID: ${id}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-tickets' });
        res.status(201).json({ success: true, id: commentId, message: 'Comment added successfully' });
    }
    catch (error) {
        console.error('Error adding ticket comment:', error);
        res.status(500).json({ success: false, message: 'Failed to add comment' });
    }
});
exports.addTicketComment = addTicketComment;
