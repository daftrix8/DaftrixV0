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
exports.deleteCrmCategory = exports.updateCrmCategory = exports.createCrmCategory = exports.getCrmCategories = exports.deleteLeadItem = exports.updateLeadItem = exports.addLeadItem = exports.getLeadItems = exports.getAdvancedStats = exports.getPipelineStats = exports.createQuotationFromLead = exports.markLeadLost = exports.deleteActivity = exports.updateActivity = exports.createActivity = exports.getActivities = exports.convertLeadToPartner = exports.moveLeadToStage = exports.deleteLead = exports.updateLead = exports.createLead = exports.getLeadById = exports.getLeads = exports.getLostReasons = exports.deleteLeadStage = exports.updateLeadStage = exports.createLeadStage = exports.getLeadStages = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const dateEngine_1 = require("../utils/dateEngine");
// ========================================
// STAGES (Pipeline State Machine)
// ========================================
const getLeadStages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.pool.query(`SELECT * FROM crm_stages ORDER BY sequence ASC`);
        res.json(rows);
    }
    catch (err) {
        console.error('❌ CRM getLeadStages:', err.message);
        res.status(500).json({ error: 'Failed to fetch lead stages' });
    }
});
exports.getLeadStages = getLeadStages;
const createLeadStage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, sequence, isWon, isCollapsed } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Stage name is required' });
        const id = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`INSERT INTO crm_stages (id, name, sequence, is_won, is_collapsed) VALUES (?, ?, ?, ?, ?)`, [id, name, sequence !== null && sequence !== void 0 ? sequence : 0, isWon ? 1 : 0, isCollapsed ? 1 : 0]);
        res.status(201).json({ id, name, sequence, isWon, isCollapsed });
    }
    catch (err) {
        console.error('❌ CRM createLeadStage:', err.message);
        res.status(500).json({ error: 'Failed to create lead stage' });
    }
});
exports.createLeadStage = createLeadStage;
const updateLeadStage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, sequence, isWon, isCollapsed } = req.body;
        yield db_1.pool.query(`UPDATE crm_stages SET name = COALESCE(?, name), sequence = COALESCE(?, sequence), is_won = COALESCE(?, is_won), is_collapsed = COALESCE(?, is_collapsed) WHERE id = ?`, [name, sequence, isWon !== undefined ? (isWon ? 1 : 0) : null, isCollapsed !== undefined ? (isCollapsed ? 1 : 0) : null, id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('❌ CRM updateLeadStage:', err.message);
        res.status(500).json({ error: 'Failed to update lead stage' });
    }
});
exports.updateLeadStage = updateLeadStage;
const deleteLeadStage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const [leads] = yield db_1.pool.query(`SELECT COUNT(*) as count FROM crm_leads WHERE stage_id = ?`, [id]);
        if (((_a = leads[0]) === null || _a === void 0 ? void 0 : _a.count) > 0) {
            return res.status(400).json({ error: 'Cannot delete stage with existing leads. Move leads first.' });
        }
        yield db_1.pool.query(`DELETE FROM crm_stages WHERE id = ?`, [id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('❌ CRM deleteLeadStage:', err.message);
        res.status(500).json({ error: 'Failed to delete lead stage' });
    }
});
exports.deleteLeadStage = deleteLeadStage;
const getLostReasons = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.pool.query(`SELECT * FROM crm_lost_reasons ORDER BY name ASC`);
        res.json(rows);
    }
    catch (err) {
        console.error('❌ CRM getLostReasons:', err.message);
        res.status(500).json({ error: 'Failed to fetch lost reasons' });
    }
});
exports.getLostReasons = getLostReasons;
// ========================================
// LEADS & OPPORTUNITIES (Single Unified Table)
// ========================================
const getLeads = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { stageId, salespersonId, search, status, tag, smartFilter, page = '1', limit = '1000' } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(10000, parseInt(limit, 10));
        const offset = (pageNum - 1) * limitNum;
        let where = 'WHERE 1=1';
        const params = [];
        if (stageId) {
            where += ' AND l.stage_id = ?';
            params.push(stageId);
        }
        if (salespersonId) {
            where += ' AND l.salesperson_id = ?';
            params.push(salespersonId);
        }
        if (status) {
            const statuses = status.split(',');
            where += ` AND l.status IN (${statuses.map(() => '?').join(',')})`;
            params.push(...statuses);
        }
        if (search) {
            where += ' AND (l.title LIKE ? OR l.contact_name LIKE ? OR l.company_name LIKE ? OR l.email LIKE ? OR l.phone LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s, s, s);
        }
        if (tag) {
            where += ' AND l.tags LIKE ?';
            params.push('%"' + tag + '"%');
        }
        if (smartFilter === 'today') {
            where += ' AND EXISTS (SELECT 1 FROM crm_activities WHERE lead_id = l.id AND is_done = 0 AND due_date <= CURDATE())';
        }
        else if (smartFilter === 'vip') {
            where += ' AND (l.tags LIKE ? OR l.expected_revenue >= 50000)';
            params.push('%"VIP"%');
        }
        const [countResult] = yield db_1.pool.query(`SELECT COUNT(*) as total FROM crm_leads l ${where}`, params);
        const total = ((_a = countResult[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
        const [rows] = yield db_1.pool.query(`SELECT l.*, s.name as stageName, s.is_won as stageIsWon, s.default_probability,
              u.name as salespersonName, c.name as categoryName, cu.name as createdByName,
              camp.name as campaignName,
              (SELECT MIN(due_date) FROM crm_activities WHERE lead_id = l.id AND is_done = 0) as next_activity_date,
              (SELECT COUNT(*) > 0 FROM crm_activities WHERE lead_id = l.id AND is_done = 0 AND due_date < CURDATE()) as has_overdue_activity,
              (SELECT COUNT(*) > 0 FROM crm_activities WHERE lead_id = l.id AND is_done = 0 AND due_date = CURDATE()) as has_today_activity
       FROM crm_leads l
       LEFT JOIN crm_stages s ON l.stage_id = s.id
       LEFT JOIN users u ON l.salesperson_id = u.id
       LEFT JOIN users cu ON l.created_by = cu.id
       LEFT JOIN crm_categories c ON l.categoryId = c.id
       LEFT JOIN campaigns camp ON l.campaign_id = camp.id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`, [...params, limitNum, offset]);
        const parsedRows = rows.map(row => {
            let parsedTags = [];
            if (row.tags) {
                try {
                    const t = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
                    parsedTags = Array.isArray(t) ? t : [t].filter(Boolean);
                }
                catch (e) {
                    parsedTags = [row.tags].filter(Boolean);
                }
            }
            return Object.assign(Object.assign({}, row), { tags: parsedTags });
        });
        res.json({
            leads: parsedRows,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
        });
    }
    catch (err) {
        console.error('❌ CRM getLeads:', err.message);
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
});
exports.getLeads = getLeads;
const getLeadById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [rows] = yield db_1.pool.query(`SELECT l.*, s.name as stageName, s.is_won as stageIsWon, s.default_probability,
              u.name as salespersonName, p.name as partnerName, lr.name as lostReasonName,
              c.name as categoryName, cu.name as createdByName, camp.name as campaignName,
              qu.name as qualifiedByName
       FROM crm_leads l
       LEFT JOIN crm_stages s ON l.stage_id = s.id
       LEFT JOIN users u ON l.salesperson_id = u.id
       LEFT JOIN users cu ON l.created_by = cu.id
       LEFT JOIN users qu ON l.qualified_by = qu.id
       LEFT JOIN partners p ON l.partner_id = p.id
       LEFT JOIN crm_lost_reasons lr ON l.lost_reason_id = lr.id
       LEFT JOIN crm_categories c ON l.categoryId = c.id
       LEFT JOIN campaigns camp ON l.campaign_id = camp.id
       WHERE l.id = ?`, [id]);
        if (!rows[0])
            return res.status(404).json({ error: 'Lead not found' });
        const lead = rows[0];
        if (lead.tags) {
            try {
                const t = typeof lead.tags === 'string' ? JSON.parse(lead.tags) : lead.tags;
                lead.tags = Array.isArray(t) ? t : [t].filter(Boolean);
            }
            catch (e) {
                lead.tags = [lead.tags].filter(Boolean);
            }
        }
        else {
            lead.tags = [];
        }
        // Fetch activities (Timeline / Chatter)
        const [activities] = yield db_1.pool.query(`SELECT a.*, u.name as createdByName, DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%s') as created_at_str
       FROM crm_activities a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.lead_id = ?
       ORDER BY a.due_date ASC, a.created_at DESC`, [id]);
        const parsedActivities = activities.map((a) => (Object.assign(Object.assign({}, a), { created_at: a.created_at_str || a.created_at })));
        res.json(Object.assign(Object.assign({}, lead), { activities: parsedActivities }));
    }
    catch (err) {
        console.error('❌ CRM getLeadById:', err.message);
        res.status(500).json({ error: 'Failed to fetch lead' });
    }
});
exports.getLeadById = getLeadById;
const createLead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { title, contactName, companyName, email, phone, stageId, salespersonId, expectedRevenue, probability, expectedClosingDate, source, notes, tags, appointmentDate, categoryId, address, campaignId } = req.body;
        if (!title || !contactName) {
            return res.status(400).json({ error: 'Title and Contact Name are required' });
        }
        // Duplicate detection: check phone or email against non-LOST leads
        if (phone || email) {
            const dupConditions = [];
            const dupParams = [];
            if (phone) {
                dupConditions.push('phone = ?');
                dupParams.push(phone);
            }
            if (email) {
                dupConditions.push('email = ?');
                dupParams.push(email);
            }
            const [duplicates] = yield db_1.pool.query(`SELECT id, title, contact_name, status FROM crm_leads WHERE (${dupConditions.join(' OR ')}) AND status != 'LOST' LIMIT 1`, dupParams);
            if (duplicates.length > 0) {
                return res.status(409).json({
                    error: 'DUPLICATE_LEAD',
                    message: `عميل محتمل موجود بالفعل: ${duplicates[0].title}`,
                    existing: duplicates[0]
                });
            }
        }
        const id = (0, crypto_1.randomUUID)();
        const user = req.user;
        const resolvedSalespersonId = salespersonId || (user === null || user === void 0 ? void 0 : user.id) || null;
        let tagsArray = [];
        if (Array.isArray(tags))
            tagsArray = tags;
        else if (typeof tags === 'string' && tags.trim() !== '')
            tagsArray = [tags.trim()];
        const tagsJson = JSON.stringify(tagsArray);
        let resolvedStageId = stageId;
        let resolvedProbability = probability;
        if (!resolvedStageId) {
            const [stages] = yield db_1.pool.query('SELECT id, default_probability FROM crm_stages ORDER BY sequence ASC LIMIT 1');
            if (stages.length > 0) {
                resolvedStageId = stages[0].id;
                if (!resolvedProbability)
                    resolvedProbability = (_a = stages[0].default_probability) !== null && _a !== void 0 ? _a : 10;
            }
        }
        yield db_1.pool.query(`INSERT INTO crm_leads
        (id, title, contact_name, company_name, email, phone, stage_id, salesperson_id,
         expected_revenue, probability, expected_closing_date, source, notes, tags,
         appointment_date, categoryId, created_by, address, campaign_id, qualification_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNQUALIFIED')`, [id, title, contactName, companyName || null, email || null, phone || null,
            resolvedStageId || null, resolvedSalespersonId,
            expectedRevenue || 0, resolvedProbability || 10, dateEngine_1.DateEngine.toMySQL(expectedClosingDate),
            source || null, notes || null, tagsJson, dateEngine_1.DateEngine.toMySQL(appointmentDate),
            categoryId || null, (_b = user === null || user === void 0 ? void 0 : user.id) !== null && _b !== void 0 ? _b : null, address || null, campaignId || null]);
        // Automatically log creation in timeline
        yield db_1.pool.query(`INSERT INTO crm_activities (id, lead_id, type, summary, created_by) VALUES (?, ?, 'SYSTEM', 'Lead created', ?)`, [(0, crypto_1.randomUUID)(), id, (_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null]);
        res.status(201).json({ id, title, contactName });
    }
    catch (err) {
        console.error('❌ CRM createLead:', err.message);
        res.status(500).json({ error: 'Failed to create lead' });
    }
});
exports.createLead = createLead;
const updateLead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    try {
        const { id } = req.params;
        const body = req.body;
        // Accept both camelCase and snake_case from frontend
        const title = body.title;
        const contactName = (_a = body.contactName) !== null && _a !== void 0 ? _a : body.contact_name;
        const companyName = (_b = body.companyName) !== null && _b !== void 0 ? _b : body.company_name;
        const email = body.email;
        const phone = body.phone;
        const stageId = (_c = body.stageId) !== null && _c !== void 0 ? _c : body.stage_id;
        const salespersonId = (_d = body.salespersonId) !== null && _d !== void 0 ? _d : body.salesperson_id;
        const expectedRevenue = (_e = body.expectedRevenue) !== null && _e !== void 0 ? _e : body.expected_revenue;
        const probability = body.probability;
        const expectedClosingDate = (_f = body.expectedClosingDate) !== null && _f !== void 0 ? _f : body.expected_closing_date;
        const source = body.source;
        const notes = body.notes;
        const tags = body.tags;
        const status = body.status;
        const lostReasonId = (_g = body.lostReasonId) !== null && _g !== void 0 ? _g : body.lost_reason_id;
        const partnerId = (_h = body.partnerId) !== null && _h !== void 0 ? _h : body.partner_id;
        const appointmentDate = (_j = body.appointmentDate) !== null && _j !== void 0 ? _j : body.appointment_date;
        const categoryId = body.categoryId;
        const address = body.address;
        const campaignId = (_k = body.campaignId) !== null && _k !== void 0 ? _k : body.campaign_id;
        const qualificationStatus = (_l = body.qualificationStatus) !== null && _l !== void 0 ? _l : body.qualification_status;
        const fields = [];
        const params = [];
        const addField = (field, value) => {
            if (value !== undefined) {
                fields.push(`${field} = ?`);
                params.push(value);
            }
        };
        addField('title', title);
        addField('contact_name', contactName);
        addField('company_name', companyName);
        addField('email', email);
        addField('phone', phone);
        addField('stage_id', stageId);
        addField('salesperson_id', salespersonId);
        addField('expected_revenue', expectedRevenue);
        addField('probability', probability);
        addField('expected_closing_date', expectedClosingDate !== undefined ? dateEngine_1.DateEngine.toMySQL(expectedClosingDate) : undefined);
        addField('source', source);
        addField('notes', notes);
        addField('address', address);
        if (tags !== undefined) {
            let tagsArray = [];
            if (Array.isArray(tags))
                tagsArray = tags;
            else if (typeof tags === 'string' && tags.trim() !== '')
                tagsArray = [tags.trim()];
            fields.push('tags = ?');
            params.push(JSON.stringify(tagsArray));
        }
        addField('status', status);
        addField('lost_reason_id', lostReasonId);
        addField('partner_id', partnerId);
        addField('appointment_date', appointmentDate !== undefined ? dateEngine_1.DateEngine.toMySQL(appointmentDate) : undefined);
        addField('categoryId', categoryId);
        addField('campaign_id', campaignId);
        addField('qualification_status', qualificationStatus);
        if (qualificationStatus === 'QUALIFIED') {
            addField('qualified_by', (_o = (_m = req.user) === null || _m === void 0 ? void 0 : _m.id) !== null && _o !== void 0 ? _o : null);
            addField('qualified_on', new Date().toISOString().split('T')[0]);
        }
        if (fields.length === 0)
            return res.status(400).json({ error: 'No fields to update' });
        params.push(id);
        yield db_1.pool.query(`UPDATE crm_leads SET ${fields.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    }
    catch (err) {
        console.error('❌ CRM updateLead:', err.message);
        res.status(500).json({ error: 'Failed to update lead' });
    }
});
exports.updateLead = updateLead;
const deleteLead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Activities will be automatically deleted due to ON DELETE CASCADE
        yield db_1.pool.query(`DELETE FROM crm_leads WHERE id = ?`, [id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('❌ CRM deleteLead:', err.message);
        res.status(500).json({ error: 'Failed to delete lead' });
    }
});
exports.deleteLead = deleteLead;
const moveLeadToStage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { stageId } = req.body;
        if (!stageId)
            return res.status(400).json({ error: 'stageId is required' });
        const user = req.user;
        // Fetch stage details including default_probability
        const [stages] = yield db_1.pool.query('SELECT is_won, name, sequence, default_probability FROM crm_stages WHERE id = ?', [stageId]);
        if (!stages[0])
            return res.status(404).json({ error: 'Stage not found' });
        const stage = stages[0];
        const isWon = stage.is_won === 1;
        const probability = isWon ? 100 : ((_a = stage.default_probability) !== null && _a !== void 0 ? _a : 50);
        const statusUpdate = isWon ? "status = 'WON'," : "";
        yield db_1.pool.query(`UPDATE crm_leads SET stage_id = ?, probability = ?, ${statusUpdate} updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [stageId, probability, id]);
        // Log the movement in the timeline
        yield db_1.pool.query(`INSERT INTO crm_activities (id, lead_id, type, summary, created_by) VALUES (?, ?, 'SYSTEM', ?, ?)`, [(0, crypto_1.randomUUID)(), id, `Moved to stage: ${stage.name}`, (_b = user === null || user === void 0 ? void 0 : user.id) !== null && _b !== void 0 ? _b : null]);
        res.json({ success: true, isWon });
    }
    catch (err) {
        console.error('❌ CRM moveLeadToStage:', err.message);
        res.status(500).json({ error: 'Failed to move lead' });
    }
});
exports.moveLeadToStage = moveLeadToStage;
const convertLeadToPartner = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const [leads] = yield db_1.pool.query(`SELECT * FROM crm_leads WHERE id = ?`, [id]);
        const lead = leads[0];
        if (!lead)
            return res.status(404).json({ error: 'Lead not found' });
        if (lead.partner_id) {
            return res.status(400).json({ error: 'Lead already converted to partner' });
        }
        const partnerId = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`INSERT INTO partners (id, name, phone, email, type, isCustomer, balance, createdAt)
       VALUES (?, ?, ?, ?, 'CUSTOMER', 1, 0, NOW())`, [partnerId, lead.company_name || lead.contact_name, lead.phone, lead.email]);
        yield db_1.pool.query(`UPDATE crm_leads SET partner_id = ?, status = 'WON' WHERE id = ?`, [partnerId, id]);
        const user = req.user;
        yield db_1.pool.query(`INSERT INTO crm_activities (id, lead_id, type, summary, created_by) VALUES (?, ?, 'SYSTEM', 'Converted to Partner (Customer)', ?)`, [(0, crypto_1.randomUUID)(), id, (_a = user === null || user === void 0 ? void 0 : user.id) !== null && _a !== void 0 ? _a : null]);
        res.json({ success: true, partnerId, message: 'Lead converted to customer successfully' });
    }
    catch (err) {
        console.error('❌ CRM convertLeadToPartner:', err.message);
        res.status(500).json({ error: 'Failed to convert lead to partner' });
    }
});
exports.convertLeadToPartner = convertLeadToPartner;
// ========================================
// ACTIVITIES (Timeline / Chatter)
// ========================================
const getActivities = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { leadId, type, isDone, page = '1', limit = '50' } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(200, parseInt(limit, 10));
        const offset = (pageNum - 1) * limitNum;
        let where = 'WHERE 1=1';
        const params = [];
        if (leadId) {
            where += ' AND a.lead_id = ?';
            params.push(leadId);
        }
        if (type) {
            where += ' AND a.type = ?';
            params.push(type);
        }
        if (isDone !== undefined) {
            where += ' AND a.is_done = ?';
            params.push(isDone === 'true' ? 1 : 0);
        }
        const [rows] = yield db_1.pool.query(`SELECT a.*, l.title as leadTitle, u.name as createdByName, DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%s') as created_at_str
       FROM crm_activities a
       LEFT JOIN crm_leads l ON a.lead_id = l.id
       LEFT JOIN users u ON a.created_by = u.id
       ${where}
       ORDER BY a.is_done ASC, a.due_date ASC
       LIMIT ? OFFSET ?`, [...params, limitNum, offset]);
        const parsedRows = rows.map((row) => (Object.assign(Object.assign({}, row), { created_at: row.created_at_str || row.created_at })));
        res.json(parsedRows);
    }
    catch (err) {
        console.error('❌ CRM getActivities:', err.message);
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
});
exports.getActivities = getActivities;
const createActivity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { leadId, type, summary, dueDate } = req.body;
        if (!leadId || !type || !summary) {
            return res.status(400).json({ error: 'leadId, type, and summary are required' });
        }
        const id = (0, crypto_1.randomUUID)();
        const user = req.user;
        yield db_1.pool.query(`INSERT INTO crm_activities (id, lead_id, type, summary, due_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`, [id, leadId, type, summary, dateEngine_1.DateEngine.toMySQL(dueDate), (_a = user === null || user === void 0 ? void 0 : user.id) !== null && _a !== void 0 ? _a : null]);
        res.status(201).json({ id, summary });
    }
    catch (err) {
        console.error('❌ CRM createActivity:', err.message);
        res.status(500).json({ error: 'Failed to create activity' });
    }
});
exports.createActivity = createActivity;
const updateActivity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { type, summary, dueDate, isDone } = req.body;
        const fields = [];
        const params = [];
        if (type !== undefined) {
            fields.push('type = ?');
            params.push(type);
        }
        if (summary !== undefined) {
            fields.push('summary = ?');
            params.push(summary);
        }
        if (dueDate !== undefined) {
            fields.push('due_date = ?');
            params.push(dateEngine_1.DateEngine.toMySQL(dueDate));
        }
        if (isDone !== undefined) {
            fields.push('is_done = ?');
            params.push(isDone ? 1 : 0);
        }
        if (fields.length === 0)
            return res.status(400).json({ error: 'No fields to update' });
        params.push(id);
        yield db_1.pool.query(`UPDATE crm_activities SET ${fields.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    }
    catch (err) {
        console.error('❌ CRM updateActivity:', err.message);
        res.status(500).json({ error: 'Failed to update activity' });
    }
});
exports.updateActivity = updateActivity;
const deleteActivity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield db_1.pool.query(`DELETE FROM crm_activities WHERE id = ?`, [id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('❌ CRM deleteActivity:', err.message);
        res.status(500).json({ error: 'Failed to delete activity' });
    }
});
exports.deleteActivity = deleteActivity;
// ========================================
// PIPELINE STATS & FORECASTING
// ========================================
const markLeadLost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { lostReasonId } = req.body;
        // Set lead status to LOST and probability to 0
        yield db_1.pool.query(`UPDATE crm_leads SET status = 'LOST', lost_reason_id = ?, probability = 0 WHERE id = ?`, [lostReasonId, id]);
        // Create system activity
        yield db_1.pool.query(`INSERT INTO crm_activities (id, lead_id, type, summary, created_by) VALUES (UUID(), ?, 'SYSTEM', 'تم وسم الفرصة كمفقودة', ?)`, [id, (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('❌ CRM markLeadLost:', err.message);
        res.status(500).json({ error: 'Failed to mark lead as lost' });
    }
});
exports.markLeadLost = markLeadLost;
const createQuotationFromLead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { id } = req.params;
        const [leads] = yield db_1.pool.query(`SELECT * FROM crm_leads WHERE id = ?`, [id]);
        const lead = leads[0];
        if (!lead)
            return res.status(404).json({ error: 'Lead not found' });
        let partnerId = lead.partner_id;
        let partnerName = lead.contact_name || lead.title;
        // If no partner linked, create a draft partner
        if (!partnerId) {
            partnerId = (0, crypto_1.randomUUID)();
            yield db_1.pool.query(`INSERT INTO partners (id, type, name, phone, email, balance, isCustomer) VALUES (?, 'CUSTOMER', ?, ?, ?, 0, 1)`, [partnerId, partnerName, lead.phone || '', lead.email || '']);
            yield db_1.pool.query(`UPDATE crm_leads SET partner_id = ? WHERE id = ?`, [partnerId, id]);
        }
        const invoiceId = (0, crypto_1.randomUUID)();
        const invoiceNumber = `QT-${Date.now().toString().slice(-6)}`;
        const revenue = lead.expected_revenue || 0;
        // Create Draft Invoice (Quotation)
        yield db_1.pool.query(`INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, paidAmount, status, paymentMethod, posted, notes, createdBy)
       VALUES (?, ?, NOW(), 'SALES', ?, ?, ?, 0, 'DRAFT', 'CASH', 0, ?, ?)`, [invoiceId, invoiceNumber, partnerId, partnerName, revenue, `عرض سعر مبدئي - ${lead.title}`, ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || 'System']);
        // Create Invoice Line for the Quotation
        yield db_1.pool.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, total)
       VALUES (?, NULL, ?, 1, ?, ?)`, [invoiceId, `مشروع / خدمة: ${lead.title}`, revenue, revenue]);
        // Activity Log
        yield db_1.pool.query(`INSERT INTO crm_activities (id, lead_id, type, summary, created_by) VALUES (UUID(), ?, 'SYSTEM', 'تم إنشاء عرض سعر (فاتورة مسودة)', ?)`, [id, (_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : null]);
        res.json({ success: true, invoiceId });
    }
    catch (err) {
        console.error('❌ CRM createQuotation:', err.message);
        res.status(500).json({ error: 'Failed to create quotation' });
    }
});
exports.createQuotationFromLead = createQuotationFromLead;
const getPipelineStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [stageStats] = yield db_1.pool.query(`
      SELECT s.id, s.name, s.sequence, s.is_won, s.default_probability,
             COUNT(l.id) as leadCount,
             COALESCE(SUM(l.expected_revenue), 0) as totalRevenue,
             COALESCE(SUM(l.expected_revenue * (l.probability / 100)), 0) as weightedRevenue
      FROM crm_stages s
      LEFT JOIN crm_leads l ON l.stage_id = s.id AND l.status IN ('OPEN', 'WON')
      GROUP BY s.id
      ORDER BY s.sequence ASC
    `);
        const [leadStats] = yield db_1.pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as openLeads,
        SUM(CASE WHEN status = 'WON' THEN 1 ELSE 0 END) as wonLeads,
        SUM(CASE WHEN status = 'LOST' THEN 1 ELSE 0 END) as lostLeads,
        COALESCE(SUM(expected_revenue), 0) as totalExpectedRevenue,
        COALESCE(SUM(expected_revenue * (probability / 100)), 0) as totalWeightedRevenue
      FROM crm_leads
    `);
        res.json({
            stages: stageStats,
            overview: leadStats[0] || {}
        });
    }
    catch (err) {
        console.error('❌ CRM getPipelineStats:', err.message);
        res.status(500).json({ error: 'Failed to fetch pipeline stats' });
    }
});
exports.getPipelineStats = getPipelineStats;
// ========================================
// ADVANCED ANALYTICS
// ========================================
const getAdvancedStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // 1. Conversion Time: avg days from creation to WON
        const [conversionTime] = yield db_1.pool.query(`
      SELECT
        ROUND(AVG(DATEDIFF(updated_at, created_at)), 1) as avgDays,
        MIN(DATEDIFF(updated_at, created_at)) as minDays,
        MAX(DATEDIFF(updated_at, created_at)) as maxDays,
        COUNT(*) as wonCount
      FROM crm_leads WHERE status = 'WON'
    `);
        // 2. Salesperson Leaderboard
        const [salespersonStats] = yield db_1.pool.query(`
      SELECT
        u.id, u.name,
        COUNT(l.id) as totalLeads,
        SUM(CASE WHEN l.status = 'WON' THEN 1 ELSE 0 END) as wonLeads,
        SUM(CASE WHEN l.status = 'LOST' THEN 1 ELSE 0 END) as lostLeads,
        COALESCE(SUM(CASE WHEN l.status = 'WON' THEN l.expected_revenue ELSE 0 END), 0) as wonRevenue,
        ROUND(
          SUM(CASE WHEN l.status = 'WON' THEN 1 ELSE 0 END) * 100.0 /
          NULLIF(SUM(CASE WHEN l.status IN ('WON','LOST') THEN 1 ELSE 0 END), 0)
        , 1) as winRate
      FROM users u
      INNER JOIN crm_leads l ON l.salesperson_id = u.id
      GROUP BY u.id
      ORDER BY wonRevenue DESC
    `);
        // 3. Lost Reason Breakdown
        const [lostReasons] = yield db_1.pool.query(`
      SELECT
        lr.id, lr.name,
        COUNT(l.id) as count,
        COALESCE(SUM(l.expected_revenue), 0) as lostRevenue
      FROM crm_lost_reasons lr
      INNER JOIN crm_leads l ON l.lost_reason_id = lr.id AND l.status = 'LOST'
      GROUP BY lr.id
      ORDER BY count DESC
    `);
        // 4. Campaign Attribution
        const [campaignAttribution] = yield db_1.pool.query(`
      SELECT
        camp.id, camp.name,
        COUNT(l.id) as totalLeads,
        SUM(CASE WHEN l.status = 'WON' THEN 1 ELSE 0 END) as wonLeads,
        COALESCE(SUM(CASE WHEN l.status = 'WON' THEN l.expected_revenue ELSE 0 END), 0) as wonRevenue,
        COALESCE(SUM(l.expected_revenue), 0) as totalRevenue
      FROM campaigns camp
      INNER JOIN crm_leads l ON l.campaign_id = camp.id
      GROUP BY camp.id
      ORDER BY wonRevenue DESC
    `);
        // 5. Monthly Pipeline Trend (last 6 months)
        const [monthlyTrend] = yield db_1.pool.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as openCount,
        SUM(CASE WHEN status = 'WON' THEN 1 ELSE 0 END) as wonCount,
        SUM(CASE WHEN status = 'LOST' THEN 1 ELSE 0 END) as lostCount,
        COALESCE(SUM(expected_revenue), 0) as totalRevenue
      FROM crm_leads
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `);
        // 6. Qualification Breakdown
        const [qualificationStats] = yield db_1.pool.query(`
      SELECT
        COALESCE(qualification_status, 'UNQUALIFIED') as qualification_status,
        COUNT(*) as count
      FROM crm_leads WHERE status = 'OPEN'
      GROUP BY qualification_status
    `);
        res.json({
            conversionTime: conversionTime[0] || {},
            salespersonStats,
            lostReasons,
            campaignAttribution,
            monthlyTrend,
            qualificationStats
        });
    }
    catch (err) {
        console.error('❌ CRM getAdvancedStats:', err.message);
        res.status(500).json({ error: 'Failed to fetch advanced stats' });
    }
});
exports.getAdvancedStats = getAdvancedStats;
// ========================================
// LEAD ITEMS (Opportunity Line Items)
// ========================================
const getLeadItems = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { leadId } = req.params;
        const [rows] = yield db_1.pool.query(`SELECT li.*, p.name as productNameFromDB
       FROM crm_lead_items li
       LEFT JOIN products p ON li.product_id = p.id
       WHERE li.lead_id = ?
       ORDER BY li.sort_order ASC, li.created_at ASC`, [leadId]);
        res.json(rows);
    }
    catch (err) {
        console.error('❌ CRM getLeadItems:', err.message);
        res.status(500).json({ error: 'Failed to fetch lead items' });
    }
});
exports.getLeadItems = getLeadItems;
const addLeadItem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { leadId } = req.params;
        const { productId, productName, description, quantity, unitPrice, sortOrder } = req.body;
        if (!productName)
            return res.status(400).json({ error: 'Product name is required' });
        const id = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`INSERT INTO crm_lead_items (id, lead_id, product_id, product_name, description, quantity, unit_price, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, leadId, productId || null, productName, description || null,
            quantity || 1, unitPrice || 0, sortOrder || 0]);
        // Recalculate expected_revenue from items total
        yield recalcLeadRevenueFromItems(leadId);
        res.status(201).json({ id, productName });
    }
    catch (err) {
        console.error('❌ CRM addLeadItem:', err.message);
        res.status(500).json({ error: 'Failed to add lead item' });
    }
});
exports.addLeadItem = addLeadItem;
const updateLeadItem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { leadId, itemId } = req.params;
        const { productId, productName, description, quantity, unitPrice, sortOrder } = req.body;
        const fields = [];
        const params = [];
        const addField = (field, value) => {
            if (value !== undefined) {
                fields.push(`${field} = ?`);
                params.push(value);
            }
        };
        addField('product_id', productId);
        addField('product_name', productName);
        addField('description', description);
        addField('quantity', quantity);
        addField('unit_price', unitPrice);
        addField('sort_order', sortOrder);
        if (fields.length === 0)
            return res.status(400).json({ error: 'No fields to update' });
        params.push(itemId, leadId);
        yield db_1.pool.query(`UPDATE crm_lead_items SET ${fields.join(', ')} WHERE id = ? AND lead_id = ?`, params);
        yield recalcLeadRevenueFromItems(leadId);
        res.json({ success: true });
    }
    catch (err) {
        console.error('❌ CRM updateLeadItem:', err.message);
        res.status(500).json({ error: 'Failed to update lead item' });
    }
});
exports.updateLeadItem = updateLeadItem;
const deleteLeadItem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { leadId, itemId } = req.params;
        yield db_1.pool.query(`DELETE FROM crm_lead_items WHERE id = ? AND lead_id = ?`, [itemId, leadId]);
        yield recalcLeadRevenueFromItems(leadId);
        res.json({ success: true });
    }
    catch (err) {
        console.error('❌ CRM deleteLeadItem:', err.message);
        res.status(500).json({ error: 'Failed to delete lead item' });
    }
});
exports.deleteLeadItem = deleteLeadItem;
/** Recalculate lead expected_revenue from the sum of its line items (if any exist) */
function recalcLeadRevenueFromItems(leadId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const [result] = yield db_1.pool.query(`SELECT COALESCE(SUM(quantity * unit_price), 0) as total, COUNT(*) as itemCount FROM crm_lead_items WHERE lead_id = ?`, [leadId]);
        // Only auto-update revenue if there are items (don't zero out manual entry)
        if (((_a = result[0]) === null || _a === void 0 ? void 0 : _a.itemCount) > 0) {
            yield db_1.pool.query(`UPDATE crm_leads SET expected_revenue = ? WHERE id = ?`, [result[0].total, leadId]);
        }
    });
}
// ========================================
// CATEGORIES
// ========================================
const getCrmCategories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { type } = req.query;
        let query = `SELECT * FROM crm_categories ORDER BY name ASC`;
        const params = [];
        if (type) {
            query = `SELECT * FROM crm_categories WHERE type = ? OR type = 'BOTH' ORDER BY name ASC`;
            params.push(type);
        }
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (err) {
        console.error('❌ CRM getCrmCategories:', err.message);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});
exports.getCrmCategories = getCrmCategories;
const createCrmCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, type, isActive } = req.body;
        if (!name || !type)
            return res.status(400).json({ error: 'Name and type are required' });
        const id = (0, crypto_1.randomUUID)();
        yield db_1.pool.query(`INSERT INTO crm_categories (id, name, type, isActive) VALUES (?, ?, ?, ?)`, [id, name, type, isActive !== undefined ? isActive : true]);
        res.status(201).json({ id, name, type, isActive });
    }
    catch (err) {
        console.error('❌ CRM createCrmCategory:', err.message);
        res.status(500).json({ error: 'Failed to create category' });
    }
});
exports.createCrmCategory = createCrmCategory;
const updateCrmCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, type, isActive } = req.body;
        yield db_1.pool.query(`UPDATE crm_categories SET name = COALESCE(?, name), type = COALESCE(?, type), isActive = COALESCE(?, isActive) WHERE id = ?`, [name, type, isActive, id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('❌ CRM updateCrmCategory:', err.message);
        res.status(500).json({ error: 'Failed to update category' });
    }
});
exports.updateCrmCategory = updateCrmCategory;
const deleteCrmCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield db_1.pool.query(`DELETE FROM crm_categories WHERE id = ?`, [id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('❌ CRM deleteCrmCategory:', err.message);
        res.status(500).json({ error: 'Failed to delete category' });
    }
});
exports.deleteCrmCategory = deleteCrmCategory;
