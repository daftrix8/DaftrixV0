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
exports.deleteSLAPolicy = exports.updateSLAPolicy = exports.createSLAPolicy = exports.getSLAPolicy = exports.getSLAPolicies = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
const auditController_1 = require("./auditController");
const getSLAPolicies = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield (0, db_1.safePoolQuery)('SELECT * FROM sla_policies ORDER BY createdAt DESC');
        res.json({ success: true, data: rows });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getSLAPolicies = getSLAPolicies;
const getSLAPolicy = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [rows] = yield (0, db_1.safePoolQuery)('SELECT * FROM sla_policies WHERE id = ?', [id]);
        if (!rows.length)
            return res.status(404).json({ success: false, message: 'Policy not found' });
        res.json({ success: true, data: rows[0] });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getSLAPolicy = getSLAPolicy;
const createSLAPolicy = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, isDefault, priorityRules } = req.body;
        if (!name)
            return res.status(400).json({ success: false, message: 'Policy name is required' });
        const id = (0, crypto_1.randomUUID)();
        const rulesStr = priorityRules ? JSON.stringify(priorityRules) : JSON.stringify({
            LOW: { response_time: 24, resolution_time: 72 },
            MEDIUM: { response_time: 8, resolution_time: 24 },
            HIGH: { response_time: 2, resolution_time: 8 },
            URGENT: { response_time: 1, resolution_time: 4 }
        });
        // If isDefault is true, unset default on other policies
        if (isDefault) {
            yield (0, db_1.safePoolQuery)('UPDATE sla_policies SET isDefault = 0');
        }
        yield (0, db_1.safePoolQuery)('INSERT INTO sla_policies (id, name, isDefault, priorityRules) VALUES (?, ?, ?, ?)', [id, name, isDefault ? 1 : 0, rulesStr]);
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        yield (0, auditController_1.logAction)(user, 'CRM', 'SLA_POLICY_CREATED', `Created SLA policy: ${name}`, `ID: ${id}`);
        res.status(201).json({ success: true, id, message: 'SLA policy created successfully' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.createSLAPolicy = createSLAPolicy;
const updateSLAPolicy = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { name, isDefault, priorityRules } = req.body;
        const [existing] = yield (0, db_1.safePoolQuery)('SELECT * FROM sla_policies WHERE id = ?', [id]);
        if (!existing.length)
            return res.status(404).json({ success: false, message: 'Policy not found' });
        if (isDefault) {
            yield (0, db_1.safePoolQuery)('UPDATE sla_policies SET isDefault = 0 WHERE id != ?', [id]);
        }
        const updates = [];
        const params = [];
        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (isDefault !== undefined) {
            updates.push('isDefault = ?');
            params.push(isDefault ? 1 : 0);
        }
        if (priorityRules !== undefined) {
            updates.push('priorityRules = ?');
            params.push(JSON.stringify(priorityRules));
        }
        if (updates.length > 0) {
            params.push(id);
            yield (0, db_1.safePoolQuery)(`UPDATE sla_policies SET ${updates.join(', ')} WHERE id = ?`, params);
        }
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        yield (0, auditController_1.logAction)(user, 'CRM', 'SLA_POLICY_UPDATED', `Updated SLA policy`, `ID: ${id}`);
        res.json({ success: true, message: 'SLA policy updated successfully' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updateSLAPolicy = updateSLAPolicy;
const deleteSLAPolicy = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const [existing] = yield (0, db_1.safePoolQuery)('SELECT * FROM sla_policies WHERE id = ?', [id]);
        if (!existing.length)
            return res.status(404).json({ success: false, message: 'Policy not found' });
        yield (0, db_1.safePoolQuery)('DELETE FROM sla_policies WHERE id = ?', [id]);
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        yield (0, auditController_1.logAction)(user, 'CRM', 'SLA_POLICY_DELETED', `Deleted SLA policy: ${existing[0].name}`, `ID: ${id}`);
        res.json({ success: true, message: 'SLA policy deleted successfully' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteSLAPolicy = deleteSLAPolicy;
