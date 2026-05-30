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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updatePreferences = exports.updateUser = exports.createUser = exports.getUsers = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
const getUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Include plain_password and branchId for admin visibility
        const [rows] = yield db_1.pool.query('SELECT id, name, email, username, plain_password, role, status, permissions, lastLogin, avatar, salesmanId, preferences, branchId, defaultTreasuryId, isHidden FROM users WHERE isHidden = FALSE OR isHidden IS NULL');
        const users = rows.map(row => (Object.assign(Object.assign({}, row), { permissions: row.permissions ? JSON.parse(row.permissions) : [], preferences: row.preferences ? (typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences) : {} })));
        res.json(users);
    }
    catch (error) {
        console.error('Error in getUsers:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getUsers = getUsers;
const createUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const user = req.body;
        const id = user.id || (0, crypto_1.randomUUID)();
        const permissions = JSON.stringify(user.permissions || []);
        const preferences = JSON.stringify(user.preferences || {});
        // Normalize empty email to NULL — email has UNIQUE constraint, empty strings conflict
        const email = ((_a = user.email) === null || _a === void 0 ? void 0 : _a.trim()) || null;
        const branchId = user.branchId || null;
        const defaultTreasuryId = user.defaultTreasuryId || null;
        // Pre-check for duplicate username or email to give clear error
        if (user.username) {
            const [existingUsername] = yield connection.query('SELECT id FROM users WHERE username = ? LIMIT 1', [user.username]);
            if (existingUsername.length > 0) {
                yield connection.rollback();
                return res.status(409).json({
                    code: 'DUPLICATE_ENTRY',
                    message: `اسم المستخدم "${user.username}" مستخدم مسبقاً، يرجى اختيار اسم آخر`
                });
            }
        }
        if (email) {
            const [existingEmail] = yield connection.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
            if (existingEmail.length > 0) {
                yield connection.rollback();
                return res.status(409).json({
                    code: 'DUPLICATE_ENTRY',
                    message: `البريد الإلكتروني "${email}" مستخدم مسبقاً`
                });
            }
        }
        // Hash password if provided
        let hashedPassword = user.password;
        if (user.password) {
            const salt = yield bcryptjs_1.default.genSalt(10);
            hashedPassword = yield bcryptjs_1.default.hash(user.password, salt);
        }
        yield connection.query('INSERT INTO users (id, name, email, username, password, plain_password, role, status, permissions, lastLogin, avatar, salesmanId, preferences, branchId, defaultTreasuryId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, user.name, email, user.username, hashedPassword, user.password || null, user.role, user.status, permissions, user.lastLogin ? new Date(user.lastLogin) : null, user.avatar, user.salesmanId || null, preferences, branchId, defaultTreasuryId]);
        yield connection.commit();
        // Log audit trail
        const creator = req.body.creator || 'System';
        yield (0, auditController_1.logAction)(creator, 'USER', 'CREATE', `Created User: ${user.name}`, `Role: ${user.role}, Email: ${user.email}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'users', updatedBy: creator });
        // Re-fetch from DB so response includes plain_password
        const [savedRows] = yield db_1.pool.query('SELECT id, name, email, username, plain_password, role, status, permissions, lastLogin, avatar, salesmanId, preferences, branchId, defaultTreasuryId FROM users WHERE id = ?', [id]);
        const savedUser = savedRows[0];
        if (savedUser) {
            savedUser.permissions = savedUser.permissions ? JSON.parse(savedUser.permissions) : [];
            savedUser.preferences = savedUser.preferences ? (typeof savedUser.preferences === 'string' ? JSON.parse(savedUser.preferences) : savedUser.preferences) : {};
        }
        res.status(201).json(savedUser || Object.assign(Object.assign({}, user), { id }));
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.createUser = createUser;
const updateUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        const user = req.body;
        const permissions = JSON.stringify(user.permissions || []);
        // Normalize empty email to NULL — email has UNIQUE constraint, empty strings would conflict
        const email = ((_a = user.email) === null || _a === void 0 ? void 0 : _a.trim()) || null;
        const branchId = user.branchId || null;
        const defaultTreasuryId = user.defaultTreasuryId || null;
        // Build UPDATE dynamically — only include password if a new one is provided
        // This prevents wiping the existing bcrypt hash when editing name/email/permissions
        let updateSql = 'UPDATE users SET name=?, email=?, username=?, role=?, status=?, permissions=?, lastLogin=?, avatar=?, salesmanId=?, branchId=?, defaultTreasuryId=?';
        let params = [user.name, email, user.username, user.role, user.status, permissions, user.lastLogin ? new Date(user.lastLogin) : null, user.avatar, user.salesmanId || null, branchId, defaultTreasuryId];
        // Only update password if a new plaintext password is explicitly provided
        // Skip if: empty, undefined, null, or already a bcrypt hash (starts with $2)
        if (user.password && typeof user.password === 'string' && user.password.trim() !== '' && !user.password.startsWith('$2')) {
            const salt = yield bcryptjs_1.default.genSalt(10);
            const hashedPassword = yield bcryptjs_1.default.hash(user.password, salt);
            updateSql += ', password=?, plain_password=?';
            params.push(hashedPassword, user.password);
            console.log(`🔑 [USER] Password updated for user: ${user.username}`);
        }
        // Only update preferences if present in body
        if (user.preferences !== undefined) {
            const preferences = JSON.stringify(user.preferences);
            updateSql += ', preferences=?';
            params.push(preferences);
        }
        updateSql += ' WHERE id=?';
        params.push(id);
        yield connection.query(updateSql, params);
        yield connection.commit();
        // Log audit trail
        const updater = req.body.updater || 'System';
        yield (0, auditController_1.logAction)(updater, 'USER', 'UPDATE', `Updated User: ${user.name}`, `Role: ${user.role}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'users', updatedBy: updater });
        // Re-fetch the saved user from DB so response includes plain_password and all fields
        const [savedRows] = yield db_1.pool.query('SELECT id, name, email, username, plain_password, role, status, permissions, lastLogin, avatar, salesmanId, preferences, branchId, defaultTreasuryId FROM users WHERE id = ?', [id]);
        const savedUser = savedRows[0];
        if (savedUser) {
            savedUser.permissions = savedUser.permissions ? JSON.parse(savedUser.permissions) : [];
            savedUser.preferences = savedUser.preferences ? (typeof savedUser.preferences === 'string' ? JSON.parse(savedUser.preferences) : savedUser.preferences) : {};
        }
        res.json(savedUser || Object.assign(Object.assign({}, user), { id }));
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.updateUser = updateUser;
const updatePreferences = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const { preferences } = req.body;
        if (!preferences) {
            return res.status(400).json({ message: 'Preferences required' });
        }
        // Merge with existing preferences for safer updates
        const [rows] = yield connection.query('SELECT preferences FROM users WHERE id=?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        let currentPrefs = rows[0].preferences ? (typeof rows[0].preferences === 'string' ? JSON.parse(rows[0].preferences) : rows[0].preferences) : {};
        const newPrefs = Object.assign(Object.assign({}, currentPrefs), preferences);
        yield connection.query('UPDATE users SET preferences=? WHERE id=?', [JSON.stringify(newPrefs), id]);
        res.json({ message: 'Preferences updated', preferences: newPrefs });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.updatePreferences = updatePreferences;
const deleteUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        const requestingUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        // Prevent self-deletion
        if (requestingUserId && requestingUserId === id) {
            return res.status(400).json({ message: 'لا يمكنك حذف حسابك بنفسك' });
        }
        // Get user name before deletion
        const [users] = yield connection.query('SELECT name FROM users WHERE id=?', [id]);
        const userName = ((_b = users[0]) === null || _b === void 0 ? void 0 : _b.name) || id;
        yield connection.query('DELETE FROM users WHERE id=?', [id]);
        yield connection.commit();
        // Log audit trail
        const deleter = ((_c = req.body) === null || _c === void 0 ? void 0 : _c.deleter) || 'System';
        yield (0, auditController_1.logAction)(deleter, 'USER', 'DELETE', `Deleted User: ${userName}`, `ID: ${id}`);
        // Broadcast real-time deletion
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'users', entityId: id, deletedBy: deleter });
        res.json({ message: 'User deleted' });
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.deleteUser = deleteUser;
