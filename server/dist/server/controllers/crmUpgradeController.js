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
exports.escalateTicket = exports.getSatisfactionReports = exports.getCustomerActivityFeed = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const eventBus_1 = require("../utils/eventBus");
const auditController_1 = require("./auditController");
const getCustomerActivityFeed = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { partnerId } = req.params;
        // Fetch in parallel
        const [ticketsPromise, complaintsPromise, workOrdersPromise, leadsPromise] = [
            (0, db_1.safePoolQuery)(`
        SELECT id, subject AS title, description, status, priority, created_at 
        FROM crm_tickets WHERE partner_id = ?
      `, [partnerId]),
            (0, db_1.safePoolQuery)(`
        SELECT id, description AS title, NULL AS description, status, client_mood AS priority, created_at 
        FROM crm_complaints WHERE partner_id = ?
      `, [partnerId]),
            (0, db_1.safePoolQuery)(`
        SELECT wo.id, wo.title, wo.description, wo.status, wo.rating AS priority, wo.scheduled_date AS created_at, e.fullName AS employee_name
        FROM crm_employee_work_orders wo
        LEFT JOIN employees e ON wo.employee_id = e.id
        WHERE wo.partner_id = ?
      `, [partnerId]),
            (0, db_1.safePoolQuery)(`
        SELECT id, title, description, status, CAST(expected_revenue AS CHAR) AS priority, created_at 
        FROM crm_leads WHERE partner_id = ?
      `, [partnerId])
        ];
        const [[tickets], [complaints], [workOrders], [leads]] = yield Promise.all([
            ticketsPromise, complaintsPromise, workOrdersPromise, leadsPromise
        ]);
        // Merge and map
        const activities = [
            ...tickets.map((t) => (Object.assign(Object.assign({}, t), { type: 'ticket' }))),
            ...complaints.map((c) => (Object.assign(Object.assign({}, c), { type: 'complaint' }))),
            ...workOrders.map((w) => (Object.assign(Object.assign({}, w), { type: 'work_order' }))),
            ...leads.map((l) => (Object.assign(Object.assign({}, l), { type: 'lead' })))
        ];
        // Sort by created_at DESC
        activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        res.json({
            success: true,
            data: activities
        });
    }
    catch (error) {
        console.error('Error fetching customer activity feed:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch activity feed' });
    }
});
exports.getCustomerActivityFeed = getCustomerActivityFeed;
const getSatisfactionReports = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // 1. Overall CSAT score
        const [csatRes] = yield (0, db_1.safePoolQuery)(`
      SELECT ROUND(AVG(rating), 2) AS avgRating, COUNT(rating) AS ratedCount 
      FROM crm_employee_work_orders WHERE rating IS NOT NULL
    `);
        const csat = csatRes[0] || { avgRating: 0, ratedCount: 0 };
        // 2. Employee Performance Heatmap
        const [heatmapRes] = yield (0, db_1.safePoolQuery)(`
      SELECT e.id AS employeeId, e.fullName AS employeeName, wo.rating, COUNT(wo.id) AS count 
      FROM crm_employee_work_orders wo 
      JOIN employees e ON wo.employee_id = e.id 
      WHERE wo.rating IS NOT NULL 
      GROUP BY e.id, e.fullName, wo.rating
    `);
        // 3. Customer Mood Breakdown (Complaints)
        const [moodRes] = yield (0, db_1.safePoolQuery)(`
      SELECT client_mood AS mood, COUNT(id) AS count 
      FROM crm_complaints 
      WHERE client_mood IS NOT NULL
      GROUP BY client_mood
    `);
        // 4. SLA Compliance rate
        const [slaRes] = yield (0, db_1.safePoolQuery)(`
      SELECT 
        COUNT(id) AS totalResolved, 
        SUM(CASE WHEN sla_resolution_breached = 0 THEN 1 ELSE 0 END) AS compliantResolved 
      FROM crm_tickets WHERE status IN ('RESOLVED', 'CLOSED')
    `);
        const sla = slaRes[0] || { totalResolved: 0, compliantResolved: 0 };
        // 5. Monthly CSAT trend
        const [trendRes] = yield (0, db_1.safePoolQuery)(`
      SELECT DATE_FORMAT(scheduled_date, '%Y-%m') AS month, ROUND(AVG(rating), 2) AS avgRating 
      FROM crm_employee_work_orders 
      WHERE rating IS NOT NULL 
      GROUP BY month 
      ORDER BY month ASC 
      LIMIT 12
    `);
        res.json({
            success: true,
            data: {
                csat,
                employeeHeatmap: heatmapRes,
                customerMood: moodRes,
                slaCompliance: {
                    totalResolved: sla.totalResolved,
                    compliantResolved: sla.compliantResolved,
                    complianceRate: sla.totalResolved > 0 ? Math.round((sla.compliantResolved / sla.totalResolved) * 100) : 100
                },
                monthlyTrend: trendRes
            }
        });
    }
    catch (error) {
        console.error('Error fetching satisfaction reports:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch satisfaction reports' });
    }
});
exports.getSatisfactionReports = getSatisfactionReports;
const escalateTicket = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const { id } = req.params;
        // Find the first admin user to assign the ticket to
        const [adminRows] = yield (0, db_1.safePoolQuery)("SELECT id, name FROM users WHERE role = 'ADMIN' LIMIT 1");
        const adminId = ((_a = adminRows[0]) === null || _a === void 0 ? void 0 : _a.id) || null;
        const adminName = ((_b = adminRows[0]) === null || _b === void 0 ? void 0 : _b.name) || 'Senior Admin';
        // Update ticket priority to URGENT and assign to admin
        yield (0, db_1.safePoolQuery)(`
      UPDATE crm_tickets 
      SET priority = 'URGENT', assigned_to = ?, sla_resolution_breached = 1
      WHERE id = ?
    `, [adminId, id]);
        // Insert comment/audit log for escalation
        const commentId = (0, crypto_1.randomUUID)();
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO crm_ticket_comments (id, ticket_id, user_id, content, is_internal)
      VALUES (?, ?, ?, 'تم تصعيد هذه التذكرة تلقائياً إلى إدارة الدعم الفني العليا نظراً لانتهاء المهلة الزمنية لـ SLA أو اقتراب انتهائها.', 1)
    `, [commentId, id, ((_c = req.user) === null || _c === void 0 ? void 0 : _c.id) || null]);
        const userName = ((_d = req.user) === null || _d === void 0 ? void 0 : _d.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'CRM', 'TICKET_ESCALATED', `Escalated ticket priority to URGENT`, `Ticket ID: ${id}`);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'crm-tickets' });
        res.json({ success: true, message: `Ticket escalated and assigned to ${adminName} successfully` });
    }
    catch (error) {
        console.error('Error escalating ticket:', error);
        res.status(500).json({ success: false, message: 'Failed to escalate ticket' });
    }
});
exports.escalateTicket = escalateTicket;
