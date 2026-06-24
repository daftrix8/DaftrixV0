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
exports.seedPermissions = exports.deletePermission = exports.updatePermission = exports.createPermission = exports.getPermissionById = exports.getPermissions = void 0;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
const auditController_1 = require("./auditController");
const PERMISSION_ID_REGEX = /^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/;
function validatePermissionInput(id, label, module) {
    if (!id || typeof id !== 'string' || !PERMISSION_ID_REGEX.test(id)) {
        return 'معرف الصلاحية غير صالح (يجب أن يكون بالصيغة: module.action)';
    }
    if (!label || typeof label !== 'string' || label.trim() === '' || label.length > 100) {
        return 'اسم الصلاحية مطلوب ويجب أن لا يتجاوز 100 حرف';
    }
    if (!module || typeof module !== 'string' || module.trim() === '' || module.length > 50) {
        return 'اسم الوحدة مطلوب ويجب أن لا يتجاوز 50 حرف';
    }
    return null;
}
const getPermissions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.pool.query('SELECT id, label, module FROM permissions ORDER BY module, id');
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching permissions:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetching permissions');
    }
});
exports.getPermissions = getPermissions;
const getPermissionById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const [rows] = yield db_1.pool.query('SELECT id, label, module FROM permissions WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'PERMISSION_NOT_FOUND', message: 'الصلاحية غير موجودة' });
        }
        res.json(rows[0]);
    }
    catch (error) {
        console.error('Error fetching permission by ID:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetching permission by ID');
    }
});
exports.getPermissionById = getPermissionById;
const createPermission = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id, label, module } = req.body;
    const validationError = validatePermissionInput(id, label, module);
    if (validationError) {
        return res.status(400).json({ error: 'INVALID_INPUT', message: validationError });
    }
    try {
        // Check if permission already exists to avoid silent overwrite
        const [existing] = yield db_1.pool.query('SELECT id FROM permissions WHERE id = ?', [id]);
        if (existing.length > 0) {
            return res.status(409).json({
                error: 'DUPLICATE_ENTRY',
                message: `الصلاحية "${id}" موجودة مسبقاً`
            });
        }
        yield db_1.pool.query('INSERT INTO permissions (id, label, module) VALUES (?, ?, ?)', [id, label.trim(), module.trim()]);
        // Audit log
        const username = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        yield (0, auditController_1.logAction)(username, 'PERMISSION', 'CREATE', `Created Permission: ${id}`, `Label: ${label}, Module: ${module}`);
        // Invalidate cache by broadcasting event
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'permissions' });
        const [rows] = yield db_1.pool.query('SELECT * FROM permissions WHERE id = ?', [id]);
        res.status(201).json(rows[0]);
    }
    catch (error) {
        console.error('Error creating permission:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'creating permission');
    }
});
exports.createPermission = createPermission;
const updatePermission = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    const { label, module } = req.body;
    const validationError = validatePermissionInput(id, label, module);
    if (validationError) {
        return res.status(400).json({ error: 'INVALID_INPUT', message: validationError });
    }
    try {
        // Verify permission exists
        const [existing] = yield db_1.pool.query('SELECT id FROM permissions WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'PERMISSION_NOT_FOUND', message: 'الصلاحية غير موجودة' });
        }
        yield db_1.pool.query('UPDATE permissions SET label = ?, module = ? WHERE id = ?', [label.trim(), module.trim(), id]);
        // Audit log
        const username = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        yield (0, auditController_1.logAction)(username, 'PERMISSION', 'UPDATE', `Updated Permission: ${id}`, `Label: ${label}, Module: ${module}`);
        // Invalidate cache by broadcasting event
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'permissions' });
        const [rows] = yield db_1.pool.query('SELECT * FROM permissions WHERE id = ?', [id]);
        res.json(rows[0]);
    }
    catch (error) {
        console.error('Error updating permission:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'updating permission');
    }
});
exports.updatePermission = updatePermission;
const deletePermission = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    try {
        // Verify permission exists
        const [existing] = yield db_1.pool.query('SELECT id FROM permissions WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'PERMISSION_NOT_FOUND', message: 'الصلاحية غير موجودة' });
        }
        // Check if permission is currently assigned to any users
        const [userPerms] = yield db_1.pool.query("SELECT id FROM users WHERE JSON_CONTAINS(COALESCE(permissions, '[]'), JSON_QUOTE(?)) LIMIT 1", [id]);
        if (userPerms.length > 0) {
            return res.status(409).json({
                error: 'PERMISSION_IN_USE',
                message: 'لا يمكن حذف هذه الصلاحية لأنها مخصصة لبعض المستخدمين حالياً'
            });
        }
        yield db_1.pool.query('DELETE FROM permissions WHERE id = ?', [id]);
        // Audit log
        const username = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        yield (0, auditController_1.logAction)(username, 'PERMISSION', 'DELETE', `Deleted Permission: ${id}`, `Permission ID: ${id}`);
        // Invalidate cache by broadcasting event
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'permissions', entityId: id });
        res.json({ message: 'Permission deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting permission:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleting permission');
    }
});
exports.deletePermission = deletePermission;
// Bulk seed — replaces 80+ individual POST calls with a single request
const seedPermissions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { permissions } = req.body;
    if (!Array.isArray(permissions) || permissions.length === 0) {
        return res.status(400).json({ error: 'INVALID_INPUT', message: 'يجب توفير مصفوفة الصلاحيات' });
    }
    if (permissions.length > 500) {
        return res.status(400).json({ error: 'BATCH_LIMIT_EXCEEDED', message: 'الحد الأقصى للدفعة الواحدة هو 500 صلاحية' });
    }
    // Validate all items in the batch first to avoid partial failure
    for (const p of permissions) {
        const validationError = validatePermissionInput(p.id, p.label, p.module);
        if (validationError) {
            return res.status(400).json({
                error: 'INVALID_INPUT',
                message: `فشل التحقق من الصلاحية "${p.id || 'unknown'}": ${validationError}`
            });
        }
    }
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        for (const p of permissions) {
            yield connection.query('INSERT INTO permissions (id, label, module) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE label = VALUES(label), module = VALUES(module)', [p.id, p.label.trim(), p.module.trim()]);
        }
        yield connection.commit();
        // Audit log
        const username = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        yield (0, auditController_1.logAction)(username, 'PERMISSION', 'SEED', `Seeded ${permissions.length} permissions`, `Permissions count: ${permissions.length}`);
        // Invalidate cache by broadcasting event
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'permissions' });
        const [rows] = yield db_1.pool.query('SELECT id, label, module FROM permissions ORDER BY module, id');
        res.status(201).json(rows);
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error seeding permissions:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'seeding permissions');
    }
    finally {
        connection.release();
    }
});
exports.seedPermissions = seedPermissions;
