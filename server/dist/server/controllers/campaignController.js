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
exports.getCampaignStats = exports.deleteCampaign = exports.updateCampaign = exports.createCampaign = exports.getCampaign = exports.getCampaigns = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const auditController_1 = require("./auditController");
// ========================================
// CAMPAIGNS
// ========================================
const getCampaigns = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status, campaignType, search } = req.query;
        let query = `
            SELECT c.*,
                   (SELECT COUNT(*) FROM crm_leads WHERE source = c.name OR campaign_id = c.id) as leadCount,
                   CASE WHEN c.actualCost > 0 THEN ROUND(c.actualRevenue / c.actualCost, 2) ELSE 0 END as roi
            FROM campaigns c
            WHERE 1=1
        `;
        const params = [];
        if (status) {
            query += ' AND c.status = ?';
            params.push(status);
        }
        if (campaignType) {
            query += ' AND c.campaignType = ?';
            params.push(campaignType);
        }
        if (search) {
            query += ' AND (c.name LIKE ? OR c.channel LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s);
        }
        query += ' ORDER BY c.createdAt DESC';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getCampaigns = getCampaigns;
const getCampaign = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [rows] = yield db_1.pool.query('SELECT * FROM campaigns WHERE id = ?', [id]);
        if (!rows[0])
            return res.status(404).json({ error: 'Campaign not found' });
        // Get linked leads
        const [leads] = yield db_1.pool.query('SELECT id, title, status, expected_revenue FROM crm_leads WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 50', [id]);
        res.json(Object.assign(Object.assign({}, rows[0]), { leads }));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getCampaign = getCampaign;
const createCampaign = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, campaignType, startDate, endDate, budget, expectedRevenue, targetAudience, channel, description, notes } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Campaign name is required' });
        const id = (0, crypto_1.randomUUID)();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        yield db_1.pool.query(`
            INSERT INTO campaigns (id, name, campaignType, startDate, endDate, budget, expectedRevenue, targetAudience, channel, description, notes, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, name, campaignType || 'OTHER', startDate || null, endDate || null, budget || 0, expectedRevenue || 0, targetAudience || null, channel || null, description || null, notes || null, user]);
        yield (0, auditController_1.logAction)(user, 'CRM', 'CAMPAIGN_CREATED', `Created campaign: ${name}`, `ID: ${id}`);
        res.status(201).json({ id, name });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.createCampaign = createCampaign;
const updateCampaign = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, campaignType, status, startDate, endDate, budget, actualCost, expectedRevenue, actualRevenue, targetAudience, channel, description, notes } = req.body;
        const fields = [];
        const params = [];
        const addField = (field, value) => { if (value !== undefined) {
            fields.push(`${field} = ?`);
            params.push(value);
        } };
        addField('name', name);
        addField('campaignType', campaignType);
        addField('status', status);
        addField('startDate', startDate);
        addField('endDate', endDate);
        addField('budget', budget);
        addField('actualCost', actualCost);
        addField('expectedRevenue', expectedRevenue);
        addField('actualRevenue', actualRevenue);
        addField('targetAudience', targetAudience);
        addField('channel', channel);
        addField('description', description);
        addField('notes', notes);
        if (fields.length === 0)
            return res.status(400).json({ error: 'No fields to update' });
        params.push(id);
        yield db_1.pool.query(`UPDATE campaigns SET ${fields.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updateCampaign = updateCampaign;
const deleteCampaign = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield db_1.pool.query('DELETE FROM campaigns WHERE id = ?', [id]);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteCampaign = deleteCampaign;
const getCampaignStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [stats] = yield db_1.pool.query(`
            SELECT
                COUNT(*) as totalCampaigns,
                SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as activeCampaigns,
                COALESCE(SUM(budget), 0) as totalBudget,
                COALESCE(SUM(actualCost), 0) as totalSpent,
                COALESCE(SUM(actualRevenue), 0) as totalRevenue,
                CASE WHEN SUM(actualCost) > 0 THEN ROUND(SUM(actualRevenue) / SUM(actualCost), 2) ELSE 0 END as overallROI
            FROM campaigns
        `);
        res.json(stats[0] || {});
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getCampaignStats = getCampaignStats;
