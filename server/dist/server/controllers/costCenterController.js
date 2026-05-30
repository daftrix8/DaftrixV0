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
exports.deleteCostCenter = exports.updateCostCenter = exports.createCostCenter = exports.getCostCenters = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
// GET all cost centers
const getCostCenters = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query('SELECT * FROM cost_centers ORDER BY name');
        conn.release();
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'cost centers');
    }
});
exports.getCostCenters = getCostCenters;
// CREATE a cost center
const createCostCenter = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { name, code, description, parentId } = req.body;
        const id = (0, crypto_1.randomUUID)();
        const authReq = req;
        const user = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.username) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        yield conn.query('INSERT INTO cost_centers (id, name, code, description, parentId) VALUES (?, ?, ?, ?, ?)', [id, name, code || null, description || null, parentId || null]);
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'CREATE_COST_CENTER', `إنشاء مركز تكلفة: ${name}`, `الرمز: ${code || '-'}`);
        }
        catch (e) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'cost-centers', updatedBy: user });
        res.status(201).json({ id, name, code, description, parentId });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'cost center');
    }
});
exports.createCostCenter = createCostCenter;
// UPDATE a cost center
const updateCostCenter = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const { name, code, description, parentId } = req.body;
        const authReq = req;
        const user = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.username) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        yield conn.query('UPDATE cost_centers SET name = ?, code = ?, description = ?, parentId = ? WHERE id = ?', [name, code || null, description || null, parentId || null, id]);
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'UPDATE_COST_CENTER', `تحديث مركز تكلفة: ${name}`, `الرمز: ${code || '-'}`);
        }
        catch (e) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'cost-centers', updatedBy: user });
        res.json({ id, name, code, description, parentId });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'cost center');
    }
});
exports.updateCostCenter = updateCostCenter;
// DELETE a cost center
const deleteCostCenter = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const authReq = req;
        const user = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.username) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        // Check if cost center is used in journal lines
        const [usageRows] = yield conn.query('SELECT COUNT(*) as count FROM journal_lines WHERE costCenterId = ?', [id]);
        const usageCount = ((_c = usageRows[0]) === null || _c === void 0 ? void 0 : _c.count) || 0;
        if (usageCount > 0) {
            conn.release();
            return res.status(400).json({ error: `لا يمكن حذف مركز التكلفة لأنه مستخدم في ${usageCount} قيد محاسبي` });
        }
        // Get name before deletion for audit
        const [ccRows] = yield conn.query('SELECT name FROM cost_centers WHERE id = ?', [id]);
        const ccName = ((_d = ccRows[0]) === null || _d === void 0 ? void 0 : _d.name) || id;
        yield conn.query('DELETE FROM cost_centers WHERE id = ?', [id]);
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'DELETE_COST_CENTER', `حذف مركز تكلفة: ${ccName}`, `رقم المرجع: ${id}`);
        }
        catch (e) { }
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'cost-centers', entityId: id, deletedBy: user });
        res.json({ message: 'Cost center deleted successfully' });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'cost center');
    }
});
exports.deleteCostCenter = deleteCostCenter;
