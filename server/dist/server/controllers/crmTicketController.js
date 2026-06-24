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
const dateEngine_1 = require("../utils/dateEngine");
const getTickets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { partnerId, leadId, status, priority, search, limit = 50, offset = 0 } = req.query;
        let query = `
      SELECT t.*,
             p.name as partner_name, COALESCE(p.contactPerson, '') as partner_company,
             p.phone as partner_phone, p.address as partner_address,
             l.title as lead_name,
             u.name as assigned_user_name,
             cu.name as created_by_name,
             c.name as category_name
      FROM crm_tickets t
      LEFT JOIN partners p ON t.partner_id = p.id
      LEFT JOIN crm_leads l ON t.lead_id = l.id
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users cu ON t.created_by = cu.id
      LEFT JOIN crm_categories c ON t.categoryId = c.id
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
        if (search) {
            query += ' AND (t.subject LIKE ? OR p.name LIKE ? OR p.phone LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s);
        }
        query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
        params.push(Number(limit), Number(offset));
        const [rows] = yield (0, db_1.safePoolQuery)(query, params);
        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM crm_tickets t LEFT JOIN partners p ON t.partner_id = p.id WHERE 1=1';
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
        if (search) {
            countQuery += ' AND (t.subject LIKE ? OR p.name LIKE ? OR p.phone LIKE ?)';
            const s = `%${search}%`;
            countParams.push(s, s, s);
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
             p.name as partner_name, COALESCE(p.contactPerson, '') as partner_company,
             p.email as partner_email, p.phone as partner_phone, p.address as partner_address,
             l.title as lead_name,
             u.name as assigned_user_name,
             cu.name as created_by_name,
             c.name as category_name
      FROM crm_tickets t
      LEFT JOIN partners p ON t.partner_id = p.id
      LEFT JOIN crm_leads l ON t.lead_id = l.id
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users cu ON t.created_by = cu.id
      LEFT JOIN crm_categories c ON t.categoryId = c.id
      WHERE t.id = ?
    `, [id]);
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        const ticket = rows[0];
        ticket.attachments = ticket.attachments
            ? (typeof ticket.attachments === 'string' ? JSON.parse(ticket.attachments) : ticket.attachments)
            : [];
        res.json({ success: true, data: ticket });
    }
    catch (error) {
        console.error('Error fetching ticket:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch ticket' });
    }
});
exports.getTicketById = getTicketById;
const createTicket = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        let { partner_id, partner_name, partner_phone, lead_id, subject, description, priority, assigned_to, appointment_date, categoryId, attachments, address } = req.body;
        const createdBy = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || null;
        if ((!partner_id && !partner_name) || !subject) {
            return res.status(400).json({ success: false, message: 'Partner information and Subject are required' });
        }
        if (!partner_id && partner_name) {
            partner_id = (0, crypto_1.randomUUID)();
            yield (0, db_1.safePoolQuery)(`INSERT INTO partners (id, type, name, phone, balance, isCustomer) VALUES (?, 'CUSTOMER', ?, ?, 0, 1)`, [partner_id, partner_name, partner_phone || '']);
        }
        // Fetch default SLA policy
        const [slaPolicies] = yield (0, db_1.safePoolQuery)('SELECT * FROM sla_policies WHERE isDefault = 1 LIMIT 1');
        let rules = {
            LOW: { response_time: 24, resolution_time: 72 },
            MEDIUM: { response_time: 8, resolution_time: 24 },
            HIGH: { response_time: 2, resolution_time: 8 },
            URGENT: { response_time: 1, resolution_time: 4 }
        };
        let slaPolicyId = null;
        if (slaPolicies.length > 0) {
            slaPolicyId = slaPolicies[0].id;
            if (slaPolicies[0].priorityRules) {
                try {
                    rules = typeof slaPolicies[0].priorityRules === 'string'
                        ? JSON.parse(slaPolicies[0].priorityRules)
                        : slaPolicies[0].priorityRules;
                }
                catch (e) {
                    console.error('Failed to parse SLA priority rules:', e);
                }
            }
        }
        const pr = (priority || 'MEDIUM').toUpperCase();
        const rule = rules[pr] || rules.MEDIUM;
        const now = new Date();
        const responseDue = new Date(now.getTime() + rule.response_time * 60 * 60 * 1000);
        const resolutionDue = new Date(now.getTime() + rule.resolution_time * 60 * 60 * 1000);
        const id = (0, crypto_1.randomUUID)();
        const attachmentsStr = attachments && attachments.length > 0 ? JSON.stringify(attachments) : null;
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO crm_tickets (id, partner_id, lead_id, subject, description, priority, assigned_to, status, appointment_date, categoryId, attachments, address, created_by, sla_policy_id, response_due_at, resolution_due_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            id, partner_id, lead_id || null, subject, description || null, priority || 'MEDIUM', assigned_to || null,
            appointment_date ? dateEngine_1.DateEngine.toMySQL(appointment_date) : null, categoryId || null, attachmentsStr, address || null,
            createdBy, slaPolicyId, dateEngine_1.DateEngine.toMySQL(responseDue), dateEngine_1.DateEngine.toMySQL(resolutionDue)
        ]);
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
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
    var _a, _b, _c, _d, _e;
    try {
        const { id } = req.params;
        const { status, priority, assigned_to, subject, description, appointment_date, categoryId, address } = req.body;
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
            params.push(dateEngine_1.DateEngine.toMySQL(appointment_date));
        }
        if (categoryId !== undefined) {
            updates.push('categoryId = ?');
            params.push(categoryId);
        }
        if (address !== undefined) {
            updates.push('address = ?');
            params.push(address);
        }
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        params.push(id);
        // Fetch old ticket before updating to check if status changed
        const [oldTicketRows] = yield (0, db_1.safePoolQuery)('SELECT status, resolution_due_at, resolved_at FROM crm_tickets WHERE id = ?', [id]);
        const oldStatus = (_a = oldTicketRows[0]) === null || _a === void 0 ? void 0 : _a.status;
        const oldResolvedAt = (_b = oldTicketRows[0]) === null || _b === void 0 ? void 0 : _b.resolved_at;
        const resolutionDueAt = (_c = oldTicketRows[0]) === null || _c === void 0 ? void 0 : _c.resolution_due_at;
        if ((status === 'RESOLVED' || status === 'CLOSED') && oldStatus !== 'RESOLVED' && oldStatus !== 'CLOSED' && !oldResolvedAt) {
            const now = new Date();
            const resolutionDue = resolutionDueAt ? new Date(resolutionDueAt) : null;
            const resolutionBreached = resolutionDue && now > resolutionDue ? 1 : 0;
            updates.push('resolved_at = ?');
            params.splice(params.length - 1, 0, dateEngine_1.DateEngine.toMySQL(now));
            updates.push('sla_resolution_breached = ?');
            params.splice(params.length - 1, 0, resolutionBreached);
        }
        yield (0, db_1.safePoolQuery)(`
      UPDATE crm_tickets SET ${updates.join(', ')}
      WHERE id = ?
    `, params);
        const userName = ((_d = req.user) === null || _d === void 0 ? void 0 : _d.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'TICKET_UPDATED', `Updated ticket`, `Ticket ID: ${id}`);
        // Add comment if status changed
        if (status && oldStatus && status !== oldStatus) {
            const statusNames = { 'OPEN': 'مفتوح', 'IN_PROGRESS': 'قيد التنفيذ', 'RESOLVED': 'تم الحل', 'CLOSED': 'مغلق' };
            const content = `تغيرت حالة التذكرة إلى: ${statusNames[status] || status}`;
            yield (0, db_1.safePoolQuery)(`
         INSERT INTO crm_ticket_comments (id, ticket_id, user_id, content, is_internal)
         VALUES (?, ?, ?, ?, 1)
       `, [(0, crypto_1.randomUUID)(), id, ((_e = req.user) === null || _e === void 0 ? void 0 : _e.id) || null, content]);
        }
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
      SELECT c.*, u.name as user_name, DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%s') as created_at_str
      FROM crm_ticket_comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.ticket_id = ?
      ORDER BY c.created_at ASC
    `, [id]);
        const parsedRows = rows.map((row) => (Object.assign(Object.assign({}, row), { created_at: row.created_at_str || row.created_at, is_internal: Boolean(row.is_internal), attachments: row.attachments
                ? (typeof row.attachments === 'string' ? JSON.parse(row.attachments) : row.attachments)
                : [] })));
        res.json({ success: true, data: parsedRows });
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
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        // Allow attachment-only comments (content can be empty when attachments exist)
        const hasContent = content && content.trim().length > 0;
        const hasAttachments = attachments && attachments.length > 0;
        if (!hasContent && !hasAttachments) {
            return res.status(400).json({ success: false, message: 'Comment must have text or at least one attachment' });
        }
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: User ID not found' });
        }
        const commentId = (0, crypto_1.randomUUID)();
        const attachmentsStr = hasAttachments ? JSON.stringify(attachments) : null;
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO crm_ticket_comments (id, ticket_id, user_id, content, is_internal, attachments)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [commentId, id, userId, content || '', is_internal ? 1 : 0, attachmentsStr]);
        // Check if this is the first response from an agent/user
        const [ticketRows] = yield (0, db_1.safePoolQuery)('SELECT first_response_at, response_due_at FROM crm_tickets WHERE id = ?', [id]);
        if (ticketRows.length > 0) {
            const ticket = ticketRows[0];
            if (!ticket.first_response_at) {
                const now = new Date();
                const responseDue = ticket.response_due_at ? new Date(ticket.response_due_at) : null;
                const responseBreached = responseDue && now > responseDue ? 1 : 0;
                yield (0, db_1.safePoolQuery)('UPDATE crm_tickets SET first_response_at = ?, sla_response_breached = ? WHERE id = ?', [dateEngine_1.DateEngine.toMySQL(now), responseBreached, id]);
            }
        }
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
