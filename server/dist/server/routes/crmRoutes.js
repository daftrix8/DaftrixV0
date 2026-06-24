"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const crmController_1 = require("../controllers/crmController");
const crmTicketController_1 = require("../controllers/crmTicketController");
const crmComplaintController_1 = require("../controllers/crmComplaintController");
const slaController_1 = require("../controllers/slaController");
const router = express_1.default.Router();
// Pipeline Stats (dashboard widget)
router.get('/stats', (0, authMiddleware_1.requirePermission)('crm.view'), crmController_1.getPipelineStats);
router.get('/stats/advanced', (0, authMiddleware_1.requirePermission)('crm.view'), crmController_1.getAdvancedStats);
// Lost Reasons
router.get('/lost-reasons', (0, authMiddleware_1.requirePermission)('crm.view'), crmController_1.getLostReasons);
// Lead Stages
router.get('/stages', (0, authMiddleware_1.requirePermission)('crm.view'), crmController_1.getLeadStages);
router.post('/stages', (0, authMiddleware_1.requirePermission)('crm.manage'), crmController_1.createLeadStage);
router.put('/stages/:id', (0, authMiddleware_1.requirePermission)('crm.manage'), crmController_1.updateLeadStage);
router.delete('/stages/:id', (0, authMiddleware_1.requirePermission)('crm.manage'), crmController_1.deleteLeadStage);
// Categories
router.get('/categories', (0, authMiddleware_1.requirePermission)('crm.view'), crmController_1.getCrmCategories);
router.post('/categories', (0, authMiddleware_1.requirePermission)('crm.manage'), crmController_1.createCrmCategory);
router.put('/categories/:id', (0, authMiddleware_1.requirePermission)('crm.manage'), crmController_1.updateCrmCategory);
router.delete('/categories/:id', (0, authMiddleware_1.requirePermission)('crm.manage'), crmController_1.deleteCrmCategory);
// Leads
router.get('/leads', (0, authMiddleware_1.requirePermission)('crm.view'), crmController_1.getLeads);
router.get('/leads/:id', (0, authMiddleware_1.requirePermission)('crm.view'), crmController_1.getLeadById);
router.post('/leads', (0, authMiddleware_1.requirePermission)('crm.create'), crmController_1.createLead);
router.put('/leads/:id', (0, authMiddleware_1.requirePermission)('crm.edit'), crmController_1.updateLead);
router.delete('/leads/:id', (0, authMiddleware_1.requirePermission)('crm.delete'), crmController_1.deleteLead);
router.put('/leads/:id/move', (0, authMiddleware_1.requirePermission)('crm.edit'), crmController_1.moveLeadToStage);
router.post('/leads/:id/convert', (0, authMiddleware_1.requirePermission)('crm.manage'), crmController_1.convertLeadToPartner);
router.post('/leads/:id/mark-lost', (0, authMiddleware_1.requirePermission)('crm.manage'), crmController_1.markLeadLost);
router.post('/leads/:id/create-quotation', (0, authMiddleware_1.requirePermission)('crm.manage'), crmController_1.createQuotationFromLead);
// Lead Items (Opportunity Line Items)
router.get('/leads/:leadId/items', (0, authMiddleware_1.requirePermission)('crm.view'), crmController_1.getLeadItems);
router.post('/leads/:leadId/items', (0, authMiddleware_1.requirePermission)('crm.create'), crmController_1.addLeadItem);
router.put('/leads/:leadId/items/:itemId', (0, authMiddleware_1.requirePermission)('crm.edit'), crmController_1.updateLeadItem);
router.delete('/leads/:leadId/items/:itemId', (0, authMiddleware_1.requirePermission)('crm.delete'), crmController_1.deleteLeadItem);
// Activities
router.get('/activities', (0, authMiddleware_1.requirePermission)('crm.view'), crmController_1.getActivities);
router.post('/activities', (0, authMiddleware_1.requirePermission)('crm.create'), crmController_1.createActivity);
router.put('/activities/:id', (0, authMiddleware_1.requirePermission)('crm.edit'), crmController_1.updateActivity);
router.delete('/activities/:id', (0, authMiddleware_1.requirePermission)('crm.delete'), crmController_1.deleteActivity);
// Tickets
router.get('/tickets', (0, authMiddleware_1.requirePermission)('crm.view'), crmTicketController_1.getTickets);
router.get('/tickets/:id', (0, authMiddleware_1.requirePermission)('crm.view'), crmTicketController_1.getTicketById);
router.post('/tickets', (0, authMiddleware_1.requirePermission)('crm.create'), crmTicketController_1.createTicket);
router.put('/tickets/:id', (0, authMiddleware_1.requirePermission)('crm.edit'), crmTicketController_1.updateTicket);
router.post('/tickets/:id/comments', (0, authMiddleware_1.requirePermission)('crm.create'), crmTicketController_1.addTicketComment);
router.get('/tickets/:id/comments', (0, authMiddleware_1.requirePermission)('crm.view'), crmTicketController_1.getTicketComments);
// Complaints (قسم الشكاوى)
router.get('/complaints', (0, authMiddleware_1.requirePermission)('crm.view'), crmComplaintController_1.getComplaints);
router.get('/complaints/stats/summary', (0, authMiddleware_1.requirePermission)('crm.view'), crmComplaintController_1.getComplaintsStats);
router.get('/complaints/compensations', (0, authMiddleware_1.requirePermission)('crm.view'), crmComplaintController_1.getCompensations);
router.post('/complaints/compensations/:id/approve', (0, authMiddleware_1.requirePermission)('crm.manage'), crmComplaintController_1.approveCompensation);
router.post('/complaints/compensations/:id/reject', (0, authMiddleware_1.requirePermission)('crm.manage'), crmComplaintController_1.rejectCompensation);
router.get('/complaints/:id', (0, authMiddleware_1.requirePermission)('crm.view'), crmComplaintController_1.getComplaintById);
router.post('/complaints', (0, authMiddleware_1.requirePermission)('crm.create'), crmComplaintController_1.createComplaint);
router.put('/complaints/:id', (0, authMiddleware_1.requirePermission)('crm.edit'), crmComplaintController_1.updateComplaint);
router.post('/complaints/:id/comments', (0, authMiddleware_1.requirePermission)('crm.create'), crmComplaintController_1.addComplaintComment);
router.get('/complaints/:id/comments', (0, authMiddleware_1.requirePermission)('crm.view'), crmComplaintController_1.getComplaintComments);
// SLA Policies
router.get('/sla-policies', (0, authMiddleware_1.requirePermission)('crm.view'), slaController_1.getSLAPolicies);
router.get('/sla-policies/:id', (0, authMiddleware_1.requirePermission)('crm.view'), slaController_1.getSLAPolicy);
router.post('/sla-policies', (0, authMiddleware_1.requirePermission)('crm.manage'), slaController_1.createSLAPolicy);
router.put('/sla-policies/:id', (0, authMiddleware_1.requirePermission)('crm.manage'), slaController_1.updateSLAPolicy);
router.delete('/sla-policies/:id', (0, authMiddleware_1.requirePermission)('crm.manage'), slaController_1.deleteSLAPolicy);
exports.default = router;
