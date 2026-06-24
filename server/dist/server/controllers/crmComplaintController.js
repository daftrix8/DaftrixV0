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
exports.rejectCompensation = exports.approveCompensation = exports.getCompensations = exports.getComplaintsStats = exports.addComplaintComment = exports.getComplaintComments = exports.updateComplaint = exports.createComplaint = exports.getComplaintById = exports.getComplaints = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const eventBus_1 = require("../utils/eventBus");
const auditController_1 = require("./auditController");
const dateEngine_1 = require("../utils/dateEngine");
const invoiceController_1 = require("./invoiceController");
// Helper to mock Express Response for programmatic creation
const createMockResponse = () => {
    const res = { statusCode: 200, headersSent: false };
    res.status = (s) => { res.statusCode = s; return res; };
    res.json = (data) => { res.data = data; res.headersSent = true; return res; };
    res.send = (data) => { res.data = data; res.headersSent = true; return res; };
    return res;
};
// GET /api/crm/complaints
const getComplaints = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { status, severity, type, partnerId, search, limit = 50, offset = 0 } = req.query;
        let query = `
      SELECT c.*,
             p.name as partner_name_db, p.phone as partner_phone_db,
             u.name as assigned_user_name,
             cu.name as created_by_name,
             i.number as invoice_number
      FROM crm_complaints c
      LEFT JOIN partners p ON c.partner_id = p.id
      LEFT JOIN users u ON c.assigned_to = u.id
      LEFT JOIN users cu ON c.created_by = cu.id
      LEFT JOIN invoices i ON c.invoice_id = i.id
      WHERE 1=1
    `;
        const params = [];
        if (status) {
            query += ' AND c.status = ?';
            params.push(status);
        }
        if (severity) {
            query += ' AND c.severity = ?';
            params.push(severity);
        }
        if (type) {
            query += ' AND c.type = ?';
            params.push(type);
        }
        if (partnerId) {
            query += ' AND c.partner_id = ?';
            params.push(partnerId);
        }
        if (search) {
            query += ' AND (c.complaint_number LIKE ? OR c.subject LIKE ? OR c.partner_name LIKE ? OR p.name LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s, s);
        }
        query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
        params.push(Number(limit), Number(offset));
        const [rows] = yield (0, db_1.safePoolQuery)(query, params);
        // Get total count
        let countQuery = `
      SELECT COUNT(*) as total 
      FROM crm_complaints c 
      LEFT JOIN partners p ON c.partner_id = p.id 
      WHERE 1=1
    `;
        const countParams = [];
        if (status) {
            countQuery += ' AND c.status = ?';
            countParams.push(status);
        }
        if (severity) {
            countQuery += ' AND c.severity = ?';
            countParams.push(severity);
        }
        if (type) {
            countQuery += ' AND c.type = ?';
            countParams.push(type);
        }
        if (partnerId) {
            countQuery += ' AND c.partner_id = ?';
            countParams.push(partnerId);
        }
        if (search) {
            countQuery += ' AND (c.complaint_number LIKE ? OR c.subject LIKE ? OR c.partner_name LIKE ? OR p.name LIKE ?)';
            const s = `%${search}%`;
            countParams.push(s, s, s, s);
        }
        const [countRows] = yield (0, db_1.safePoolQuery)(countQuery, countParams);
        res.json({
            success: true,
            data: rows,
            total: ((_a = countRows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0
        });
    }
    catch (error) {
        console.error('Error fetching complaints:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch complaints' });
    }
});
exports.getComplaints = getComplaints;
// GET /api/crm/complaints/:id
const getComplaintById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [rows] = yield (0, db_1.safePoolQuery)(`
      SELECT c.*,
             p.name as partner_name_db, p.phone as partner_phone_db, p.email as partner_email_db,
             u.name as assigned_user_name,
             cu.name as created_by_name,
             i.number as invoice_number
      FROM crm_complaints c
      LEFT JOIN partners p ON c.partner_id = p.id
      LEFT JOIN users u ON c.assigned_to = u.id
      LEFT JOIN users cu ON c.created_by = cu.id
      LEFT JOIN invoices i ON c.invoice_id = i.id
      WHERE c.id = ?
    `, [id]);
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }
        const complaint = rows[0];
        complaint.attachments = complaint.attachments
            ? (typeof complaint.attachments === 'string' ? JSON.parse(complaint.attachments) : complaint.attachments)
            : [];
        res.json({ success: true, data: complaint });
    }
    catch (error) {
        console.error('Error fetching complaint:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch complaint' });
    }
});
exports.getComplaintById = getComplaintById;
// POST /api/crm/complaints
const createComplaint = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { partnerId, partnerName, partnerPhone, subject, description, type, severity, source, assignedTo, clientMood, invoiceId, attachments } = req.body;
        const createdBy = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || null;
        if ((!partnerId && !partnerName) || !subject || !description) {
            return res.status(400).json({ success: false, message: 'Customer info, subject, and description are required' });
        }
        // Auto-generate sequential number (CMP-YYYY-MM-XXXX)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const prefix = `CMP-${year}-${month}-`;
        const [maxRows] = yield (0, db_1.safePoolQuery)(`SELECT complaint_number FROM crm_complaints WHERE complaint_number LIKE ? ORDER BY complaint_number DESC LIMIT 1`, [`${prefix}%`]);
        let nextSerial = 1;
        if (maxRows.length > 0) {
            const lastNum = maxRows[0].complaint_number;
            const parts = lastNum.split('-');
            const lastSerial = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(lastSerial)) {
                nextSerial = lastSerial + 1;
            }
        }
        const complaintNumber = `${prefix}${String(nextSerial).padStart(4, '0')}`;
        const id = (0, crypto_1.randomUUID)();
        const attachmentsStr = attachments && attachments.length > 0 ? JSON.stringify(attachments) : null;
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO crm_complaints (
        id, complaint_number, partner_id, partner_name, partner_phone, subject, description,
        type, severity, status, source, assigned_to, created_by, client_mood, invoice_id, attachments
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?, ?)
    `, [
            id, complaintNumber, partnerId || null, partnerName || null, partnerPhone || null,
            subject, description, type || 'OTHER', severity || 'MEDIUM', source || 'PHONE',
            assignedTo || null, createdBy, clientMood || 'UPSET', invoiceId || null, attachmentsStr
        ]);
        // Log chatter activity comment
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO crm_complaint_comments (id, complaint_id, user_id, content, is_internal)
      VALUES (?, ?, ?, ?, 1)
    `, [(0, crypto_1.randomUUID)(), id, createdBy || 'system', 'تم إنشاء الشكوى بنجاح وبانتظار المراجعة.', 1]);
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'COMPLAINT_CREATED', `Created complaint: ${complaintNumber}`, `Complaint ID: ${id}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-complaints' });
        res.status(201).json({ success: true, id, complaintNumber, message: 'Complaint created successfully' });
    }
    catch (error) {
        console.error('Error creating complaint:', error);
        res.status(500).json({ success: false, message: 'Failed to create complaint' });
    }
});
exports.createComplaint = createComplaint;
// PUT /api/crm/complaints/:id
const updateComplaint = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { status, severity, assignedTo, subject, description, type, clientMood, resolutionSummary, rootCause, satisfactionRating, compensationType, compensationAmount } = req.body;
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || 'system';
        // Fetch old record
        const [oldRows] = yield (0, db_1.safePoolQuery)('SELECT status, complaint_number, partner_id FROM crm_complaints WHERE id = ?', [id]);
        if (oldRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }
        const oldStatus = oldRows[0].status;
        const complaintNumber = oldRows[0].complaint_number;
        const partnerId = oldRows[0].partner_id;
        const updates = [];
        const params = [];
        if (status) {
            updates.push('status = ?');
            params.push(status);
        }
        if (severity) {
            updates.push('severity = ?');
            params.push(severity);
        }
        if (assignedTo !== undefined) {
            updates.push('assigned_to = ?');
            params.push(assignedTo);
        }
        if (subject) {
            updates.push('subject = ?');
            params.push(subject);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description);
        }
        if (type) {
            updates.push('type = ?');
            params.push(type);
        }
        if (clientMood) {
            updates.push('client_mood = ?');
            params.push(clientMood);
        }
        if (resolutionSummary !== undefined) {
            updates.push('resolution_summary = ?');
            params.push(resolutionSummary);
        }
        if (rootCause !== undefined) {
            updates.push('root_cause = ?');
            params.push(rootCause);
        }
        if (satisfactionRating !== undefined) {
            updates.push('satisfaction_rating = ?');
            params.push(satisfactionRating);
        }
        if (compensationType !== undefined) {
            updates.push('compensation_type = ?');
            params.push(compensationType);
        }
        if (compensationAmount !== undefined) {
            updates.push('compensation_amount = ?');
            params.push(compensationAmount);
        }
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        if (status === 'RESOLVED' && oldStatus !== 'RESOLVED') {
            updates.push('resolved_at = ?');
            params.push(dateEngine_1.DateEngine.toMySQL(new Date()));
            updates.push('resolved_by = ?');
            params.push(userId);
        }
        params.push(id);
        yield (0, db_1.safePoolQuery)(`
      UPDATE crm_complaints SET ${updates.join(', ')}
      WHERE id = ?
    `, params);
        // Log status change comment
        if (status && oldStatus && status !== oldStatus) {
            const statusNames = {
                'NEW': 'جديدة',
                'UNDER_REVIEW': 'قيد المراجعة',
                'INVESTIGATING': 'قيد التحقيق',
                'RESOLVED': 'تم الحل',
                'REJECTED': 'مرفوضة',
                'CLOSED': 'مغلقة'
            };
            const content = `تم تغيير حالة الشكوى إلى: ${statusNames[status] || status}`;
            yield (0, db_1.safePoolQuery)(`
        INSERT INTO crm_complaint_comments (id, complaint_id, user_id, content, is_internal)
        VALUES (?, ?, ?, ?, 1)
      `, [(0, crypto_1.randomUUID)(), id, userId, content, 1]);
        }
        // IF COMPLAINT IS RESOLVED AND COMPENSATION TYPE IS FINANCIAL -> Trigger compensation request
        if (status === 'RESOLVED' && oldStatus !== 'RESOLVED' && compensationType && compensationType !== 'NONE') {
            const amount = Number(compensationAmount) || 0;
            if (amount > 0 && ['CREDIT_NOTE', 'REFUND', 'REPLACEMENT', 'DISCOUNT_VOUCHER', 'LOYALTY_POINTS', 'OTHER'].includes(compensationType)) {
                yield (0, db_1.safePoolQuery)(`
          INSERT INTO crm_complaint_compensations (id, complaint_id, partner_id, type, amount, status)
          VALUES (?, ?, ?, ?, ?, 'PENDING')
        `, [(0, crypto_1.randomUUID)(), id, partnerId || null, compensationType, amount]);
                const compLabel = {
                    'CREDIT_NOTE': 'إشعار دائن بقيمة',
                    'REFUND': 'استرداد مالي بقيمة',
                    'REPLACEMENT': 'استبدال منتج بقيمة',
                    'DISCOUNT_VOUCHER': 'قسيمة خصم بقيمة',
                    'LOYALTY_POINTS': 'نقاط ولاء بقيمة',
                    'OTHER': 'تعويض آخر بقيمة'
                };
                yield (0, db_1.safePoolQuery)(`
          INSERT INTO crm_complaint_comments (id, complaint_id, user_id, content, is_internal)
          VALUES (?, ?, ?, ?, 1)
        `, [
                    (0, crypto_1.randomUUID)(),
                    id,
                    userId,
                    `تم إنشاء طلب تعويض معلق: ${compLabel[compensationType] || compensationType} ${amount} ج.م بانتظار موافقة الإدارة المالية.`,
                    1
                ]);
            }
        }
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'COMPLAINT_UPDATED', `Updated complaint: ${complaintNumber}`, `Complaint ID: ${id}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-complaints' });
        res.json({ success: true, message: 'Complaint updated successfully' });
    }
    catch (error) {
        console.error('Error updating complaint:', error);
        res.status(500).json({ success: false, message: 'Failed to update complaint' });
    }
});
exports.updateComplaint = updateComplaint;
// GET /api/crm/complaints/:id/comments
const getComplaintComments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [rows] = yield (0, db_1.safePoolQuery)(`
      SELECT c.*, u.name as user_name, DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%s') as created_at_str
      FROM crm_complaint_comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.complaint_id = ?
      ORDER BY c.created_at ASC
    `, [id]);
        const parsedRows = rows.map((row) => (Object.assign(Object.assign({}, row), { created_at: row.created_at_str || row.created_at, is_internal: Boolean(row.is_internal), attachments: row.attachments
                ? (typeof row.attachments === 'string' ? JSON.parse(row.attachments) : row.attachments)
                : [] })));
        res.json({ success: true, data: parsedRows });
    }
    catch (error) {
        console.error('Error fetching complaint comments:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch comments' });
    }
});
exports.getComplaintComments = getComplaintComments;
// POST /api/crm/complaints/:id/comments
const addComplaintComment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { content, is_internal, attachments } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if ((!content || content.trim().length === 0) && (!attachments || attachments.length === 0)) {
            return res.status(400).json({ success: false, message: 'Comment must have text or attachments' });
        }
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const commentId = (0, crypto_1.randomUUID)();
        const attachmentsStr = attachments && attachments.length > 0 ? JSON.stringify(attachments) : null;
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO crm_complaint_comments (id, complaint_id, user_id, content, is_internal, attachments)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [commentId, id, userId, content || '', is_internal ? 1 : 0, attachmentsStr]);
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'COMPLAINT_COMMENT_ADDED', `Added comment to complaint`, `Complaint ID: ${id}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-complaints' });
        res.status(201).json({ success: true, id: commentId, message: 'Comment added successfully' });
    }
    catch (error) {
        console.error('Error adding complaint comment:', error);
        res.status(500).json({ success: false, message: 'Failed to add comment' });
    }
});
exports.addComplaintComment = addComplaintComment;
// GET /api/crm/complaints/stats/summary
const getComplaintsStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const [statusRows] = yield (0, db_1.safePoolQuery)(`
      SELECT status, COUNT(*) as count 
      FROM crm_complaints 
      GROUP BY status
    `);
        const [severityRows] = yield (0, db_1.safePoolQuery)(`
      SELECT severity, COUNT(*) as count 
      FROM crm_complaints 
      GROUP BY severity
    `);
        const [typeRows] = yield (0, db_1.safePoolQuery)(`
      SELECT type, COUNT(*) as count 
      FROM crm_complaints 
      GROUP BY type
    `);
        const [csatRow] = yield (0, db_1.safePoolQuery)(`
      SELECT AVG(satisfaction_rating) as avgCsat, COUNT(satisfaction_rating) as csatCount 
      FROM crm_complaints 
      WHERE satisfaction_rating IS NOT NULL
    `);
        const [moodRows] = yield (0, db_1.safePoolQuery)(`
      SELECT client_mood, COUNT(*) as count 
      FROM crm_complaints 
      GROUP BY client_mood
    `);
        res.json({
            success: true,
            status: statusRows,
            severity: severityRows,
            type: typeRows,
            csat: {
                avg: Number(((_a = csatRow[0]) === null || _a === void 0 ? void 0 : _a.avgCsat) || 0).toFixed(1),
                count: ((_b = csatRow[0]) === null || _b === void 0 ? void 0 : _b.csatCount) || 0
            },
            mood: moodRows
        });
    }
    catch (error) {
        console.error('Error fetching complaints stats:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch complaints statistics' });
    }
});
exports.getComplaintsStats = getComplaintsStats;
// GET /api/crm/complaints/compensations
const getCompensations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status } = req.query;
        let query = `
      SELECT comp.*, 
             c.complaint_number, c.subject as complaint_subject,
             p.name as partner_name, p.phone as partner_phone,
             u.name as approved_by_name
      FROM crm_complaint_compensations comp
      LEFT JOIN crm_complaints c ON comp.complaint_id = c.id
      LEFT JOIN partners p ON comp.partner_id = p.id
      LEFT JOIN users u ON comp.approved_by = u.id
      WHERE 1=1
    `;
        const params = [];
        if (status) {
            query += ' AND comp.status = ?';
            params.push(status);
        }
        query += ' ORDER BY comp.created_at DESC';
        const [rows] = yield (0, db_1.safePoolQuery)(query, params);
        res.json({ success: true, data: rows });
    }
    catch (error) {
        console.error('Error fetching compensations:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch compensations' });
    }
});
exports.getCompensations = getCompensations;
// POST /api/crm/complaints/compensations/:id/approve
const approveCompensation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || 'system';
        yield conn.beginTransaction();
        const [compRows] = yield conn.query(`SELECT comp.*, c.complaint_number, p.name as partner_name 
       FROM crm_complaint_compensations comp
       LEFT JOIN crm_complaints c ON comp.complaint_id = c.id
       LEFT JOIN partners p ON comp.partner_id = p.id
       WHERE comp.id = ? FOR UPDATE`, [id]);
        if (compRows.length === 0) {
            yield conn.rollback();
            conn.release();
            return res.status(404).json({ success: false, message: 'Compensation request not found' });
        }
        const comp = compRows[0];
        if (comp.status !== 'PENDING') {
            yield conn.rollback();
            conn.release();
            return res.status(400).json({ success: false, message: 'Compensation is already processed' });
        }
        let postedInvoiceId = null;
        if (comp.type === 'CREDIT_NOTE') {
            // 1. Resolve Warehouse & Safe account defaults
            const [warehouseRows] = yield conn.query('SELECT id FROM warehouses LIMIT 1');
            const defaultWarehouseId = ((_b = warehouseRows[0]) === null || _b === void 0 ? void 0 : _b.id) || null;
            if (!defaultWarehouseId) {
                throw new Error('No warehouses configured in system to process Credit Note');
            }
            // Generate Posted Credit Note programmatically using createInvoice controller
            const invoiceId = (0, crypto_1.randomUUID)();
            const mockReq = {
                body: {
                    id: invoiceId,
                    date: dateEngine_1.DateEngine.todayStr(),
                    type: 'RETURN_SALE',
                    partnerId: comp.partner_id,
                    partnerName: comp.partner_name,
                    total: Number(comp.amount),
                    status: 'POSTED',
                    paymentMethod: 'CREDIT',
                    posted: true,
                    warehouseId: defaultWarehouseId,
                    notes: `تعويض شكوى رقم ${comp.complaint_number}`,
                    lines: [
                        {
                            productId: null, // service-level adjustment
                            productName: `تعويض مالي - شكوى رقم ${comp.complaint_number}`,
                            quantity: 1,
                            price: Number(comp.amount),
                            discount: 0,
                            total: Number(comp.amount),
                            cost: 0,
                            trackInventory: 0
                        }
                    ]
                },
                user: req.user,
                systemConfig: req.systemConfig
            };
            const mockRes = createMockResponse();
            // Perform write within our transaction by temporary connection reuse (if createInvoice allows)
            // Since createInvoice gets its own connection inside it, we will complete the approval outside
            // But we can call createInvoice directly.
            yield (0, invoiceController_1.createInvoice)(mockReq, mockRes);
            if (mockRes.statusCode !== 201 && mockRes.statusCode !== 200) {
                throw new Error(((_c = mockRes.data) === null || _c === void 0 ? void 0 : _c.message) || ((_d = mockRes.data) === null || _d === void 0 ? void 0 : _d.error) || 'Failed to generate posted return invoice');
            }
            postedInvoiceId = invoiceId;
        }
        else if (comp.type === 'REFUND') {
            // Generate Outgoing Payment Voucher (سند صرف)
            const [safeRows] = yield conn.query(`SELECT id FROM banks WHERE name LIKE '%خزينة%' OR name LIKE '%نقدي%' LIMIT 1`);
            const defaultSafeId = ((_e = safeRows[0]) === null || _e === void 0 ? void 0 : _e.id) || null;
            if (!defaultSafeId) {
                throw new Error('No cash drawer/safe configured to process cash Refund');
            }
            const invoiceId = (0, crypto_1.randomUUID)();
            const mockReq = {
                body: {
                    id: invoiceId,
                    date: dateEngine_1.DateEngine.todayStr(),
                    type: 'PAYMENT',
                    partnerId: comp.partner_id,
                    partnerName: comp.partner_name,
                    total: Number(comp.amount),
                    status: 'POSTED',
                    paymentMethod: 'CASH',
                    bankAccountId: defaultSafeId,
                    posted: true,
                    notes: `صرف تعويض نقدي - شكوى رقم ${comp.complaint_number}`
                },
                user: req.user,
                systemConfig: req.systemConfig
            };
            const mockRes = createMockResponse();
            yield (0, invoiceController_1.createInvoice)(mockReq, mockRes);
            if (mockRes.statusCode !== 201 && mockRes.statusCode !== 200) {
                throw new Error(((_f = mockRes.data) === null || _f === void 0 ? void 0 : _f.message) || ((_g = mockRes.data) === null || _g === void 0 ? void 0 : _g.error) || 'Failed to generate payment voucher');
            }
            postedInvoiceId = invoiceId;
        }
        // 2. Update Compensation Request Status
        yield conn.query(`UPDATE crm_complaint_compensations 
       SET status = 'APPROVED', approved_by = ?, approved_at = ?, posted_invoice_id = ?, notes = ?
       WHERE id = ?`, [userId, dateEngine_1.DateEngine.toMySQL(new Date()), postedInvoiceId, notes || null, id]);
        // 3. Log a comment in the Complaint chatter timeline
        const typeLabels = {
            'CREDIT_NOTE': 'إشعار دائن',
            'REFUND': 'استرداد مالي نقدي',
            'REPLACEMENT': 'استبدال منتج',
            'DISCOUNT_VOUCHER': 'قسيمة خصم',
            'LOYALTY_POINTS': 'نقاط ولاء إضافية',
            'OTHER': 'تعويض آخر'
        };
        const content = `تمت الموافقة على التعويض من قبل الإدارة المالية: ${typeLabels[comp.type] || comp.type} بقيمة ${comp.amount} ج.م.`;
        yield conn.query(`
      INSERT INTO crm_complaint_comments (id, complaint_id, user_id, content, is_internal)
      VALUES (?, ?, ?, ?, 1)
    `, [(0, crypto_1.randomUUID)(), comp.complaint_id, userId, content, 1]);
        yield conn.commit();
        conn.release();
        const userName = ((_h = req.user) === null || _h === void 0 ? void 0 : _h.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'COMPLAINT_COMPENSATION_APPROVED', `Approved compensation request for complaint: ${comp.complaint_number}`, `Comp ID: ${id}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-complaints' });
        res.json({ success: true, message: 'Compensation approved and posted successfully', invoiceId: postedInvoiceId });
    }
    catch (error) {
        yield conn.rollback();
        conn.release();
        console.error('Error approving compensation:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to approve compensation' });
    }
});
exports.approveCompensation = approveCompensation;
// POST /api/crm/complaints/compensations/:id/reject
const rejectCompensation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || 'system';
        const [compRows] = yield (0, db_1.safePoolQuery)('SELECT * FROM crm_complaint_compensations WHERE id = ? FOR UPDATE', [id]);
        if (compRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Compensation request not found' });
        }
        const comp = compRows[0];
        if (comp.status !== 'PENDING') {
            return res.status(400).json({ success: false, message: 'Compensation is already processed' });
        }
        yield (0, db_1.safePoolQuery)(`UPDATE crm_complaint_compensations 
       SET status = 'REJECTED', approved_by = ?, approved_at = ?, notes = ?
       WHERE id = ?`, [userId, dateEngine_1.DateEngine.toMySQL(new Date()), notes || null, id]);
        // Log comment in Complaint chatter timeline
        const typeLabels = {
            'CREDIT_NOTE': 'إشعار دائن',
            'REFUND': 'استرداد مالي',
            'REPLACEMENT': 'استبدال منتج',
            'DISCOUNT_VOUCHER': 'قسيمة خصم',
            'LOYALTY_POINTS': 'نقاط ولاء',
            'OTHER': 'تعويض آخر'
        };
        const content = `تم رفض طلب التعويض (${typeLabels[comp.type] || comp.type} بقيمة ${comp.amount} ج.م) من قبل الإدارة المالية. السبب: ${notes || 'لم يذكر'}`;
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO crm_complaint_comments (id, complaint_id, user_id, content, is_internal)
      VALUES (?, ?, ?, ?, 1)
    `, [(0, crypto_1.randomUUID)(), comp.complaint_id, userId, content, 1]);
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'COMPLAINT_COMPENSATION_REJECTED', `Rejected compensation request for complaint`, `Comp ID: ${id}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-complaints' });
        res.json({ success: true, message: 'Compensation rejected successfully' });
    }
    catch (error) {
        console.error('Error rejecting compensation:', error);
        res.status(500).json({ success: false, message: 'Failed to reject compensation' });
    }
});
exports.rejectCompensation = rejectCompensation;
