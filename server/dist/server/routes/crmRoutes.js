"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const crmController_1 = require("../controllers/crmController");
const crmTicketController_1 = require("../controllers/crmTicketController");
const router = express_1.default.Router();
// Pipeline Stats (dashboard widget)
router.get('/stats', (0, authMiddleware_1.requirePermission)('crm.view'), crmController_1.getPipelineStats);
// Lost Reasons
router.get('/lost-reasons', (0, authMiddleware_1.requirePermission)('crm.view'), crmController_1.getLostReasons);
// Lead Stages
router.get('/stages', (0, authMiddleware_1.requirePermission)('crm.view'), crmController_1.getLeadStages);
router.post('/stages', (0, authMiddleware_1.requirePermission)('crm.manage'), crmController_1.createLeadStage);
router.put('/stages/:id', (0, authMiddleware_1.requirePermission)('crm.manage'), crmController_1.updateLeadStage);
router.delete('/stages/:id', (0, authMiddleware_1.requirePermission)('crm.manage'), crmController_1.deleteLeadStage);
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
exports.default = router;
