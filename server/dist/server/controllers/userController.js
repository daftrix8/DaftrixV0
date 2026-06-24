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
exports.deleteUser = exports.updatePreferences = exports.updateUser = exports.createUser = exports.getUsers = exports.getUserById = exports.getChatUsers = void 0;
exports.createSalesmanForUser = createSalesmanForUser;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
// VALID_PERMISSIONS is fetched dynamically from the database
// ─────────────────────────────────────────────────────────────────────────────
// User → HR auto-sync helpers
// When a user is created or updated, matching HR employee + salesman records
// are automatically created so the admin only enters data once.
// Sync direction: Users → HR/Salesmen (one-way). Non-fatal on failure.
// ─────────────────────────────────────────────────────────────────────────────
const ROLE_JOB_TITLE_MAP = {
    MASTER_ADMIN: 'مدير عام',
    ADMIN: 'مدير',
    GENERAL_MANAGER: 'مدير عام',
    ACCOUNTANT: 'محاسب',
    SALES: 'مندوب مبيعات',
    CASHIER: 'كاشير',
    INVENTORY: 'أمين مخزن',
    MAINTENANCE: 'صيانة',
    WAREHOUSE_SUPERVISOR: 'مشرف مخازن',
    PURCHASING: 'مشتريات',
};
const ROLE_DEPARTMENT_MAP = {
    MASTER_ADMIN: 'الإدارة',
    ADMIN: 'الإدارة',
    GENERAL_MANAGER: 'الإدارة',
    ACCOUNTANT: 'المحاسبة',
    SALES: 'المبيعات',
    CASHIER: 'المبيعات',
    INVENTORY: 'المخازن',
    MAINTENANCE: 'الصيانة',
    WAREHOUSE_SUPERVISOR: 'المخازن',
    PURCHASING: 'المشتريات',
};
/**
 * Create or find an HR employee linked to a user.
 * Returns the employeeId.
 */
function syncUserToEmployee(connection, userId, userData) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const jobTitle = ROLE_JOB_TITLE_MAP[userData.role || ''] || userData.role || '';
        const department = ROLE_DEPARTMENT_MAP[userData.role || ''] || '';
        // Check if user already has a linked employee
        const [existingLink] = yield connection.query('SELECT employeeId FROM users WHERE id = ?', [userId]);
        const currentEmployeeId = (_a = existingLink[0]) === null || _a === void 0 ? void 0 : _a.employeeId;
        if (currentEmployeeId) {
            // Employee exists — sync name, jobTitle, department
            const [empExists] = yield connection.query('SELECT id FROM employees WHERE id = ?', [currentEmployeeId]);
            if (empExists.length > 0) {
                yield connection.query(`UPDATE employees SET fullName = ?, jobTitle = ?, department = ?, email = ? WHERE id = ?`, [userData.name, jobTitle, department, userData.email || null, currentEmployeeId]);
                return currentEmployeeId;
            }
        }
        // No linked employee — create one
        const newEmployeeId = (0, crypto_1.randomUUID)();
        try {
            yield connection.query(`INSERT INTO employees
             (id, fullName, jobTitle, department, employmentType, baseSalary, branchId, status, email)
             VALUES (?, ?, ?, ?, 'MONTHLY', 0, ?, 'ACTIVE', ?)`, [newEmployeeId, userData.name, jobTitle, department, userData.branchId || null, userData.email || null]);
        }
        catch (insertErr) {
            // If the employees table has extra required columns, fall back to minimal insert
            if (insertErr.code === 'ER_BAD_FIELD_ERROR') {
                yield connection.query(`INSERT INTO employees
                 (id, fullName, jobTitle, department, employmentType, baseSalary, status)
                 VALUES (?, ?, ?, ?, 'MONTHLY', 0, 'ACTIVE')`, [newEmployeeId, userData.name, jobTitle, department]);
            }
            else {
                throw insertErr;
            }
        }
        // Link employee back to user
        yield connection.query('UPDATE users SET employeeId = ? WHERE id = ?', [newEmployeeId, userId]);
        return newEmployeeId;
    });
}
function createSalesmanForUser(connection, userId, employeeId, userData) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        // Check if user already has a salesman
        const [existingLink] = yield connection.query('SELECT salesmanId FROM users WHERE id = ?', [userId]);
        const currentSalesmanId = (_a = existingLink[0]) === null || _a === void 0 ? void 0 : _a.salesmanId;
        if (currentSalesmanId) {
            const [smExists] = yield connection.query('SELECT id FROM salesmen WHERE id = ?', [currentSalesmanId]);
            if (smExists.length > 0) {
                // Already linked — update name
                yield connection.query('UPDATE salesmen SET name = ?, userId = ?, employeeId = ? WHERE id = ?', [userData.name, userId, employeeId, currentSalesmanId]);
                return currentSalesmanId;
            }
        }
        // Check if a salesman already exists for this userId
        const [byUserId] = yield connection.query('SELECT id FROM salesmen WHERE userId = ? LIMIT 1', [userId]);
        if (byUserId.length > 0) {
            const existingSalesmanId = byUserId[0].id;
            yield connection.query('UPDATE salesmen SET name = ?, employeeId = ? WHERE id = ?', [userData.name, employeeId, existingSalesmanId]);
            yield connection.query('UPDATE users SET salesmanId = ? WHERE id = ?', [existingSalesmanId, userId]);
            return existingSalesmanId;
        }
        // Check if a salesman with the same name already exists (case & whitespace-insensitive)
        const normalizedName = userData.name.trim();
        const compactedName = normalizedName.replace(/\s+/g, ' ');
        const [byName] = yield connection.query('SELECT id FROM salesmen WHERE TRIM(name) = ? OR REPLACE(TRIM(name), "  ", " ") = ? LIMIT 1', [normalizedName, compactedName]);
        if (byName.length > 0) {
            const existingSalesmanId = byName[0].id;
            yield connection.query('UPDATE salesmen SET name = ?, userId = ?, employeeId = ? WHERE id = ?', [userData.name, userId, employeeId, existingSalesmanId]);
            yield connection.query('UPDATE users SET salesmanId = ? WHERE id = ?', [existingSalesmanId, userId]);
            return existingSalesmanId;
        }
        // Create new salesman
        const newSalesmanId = (0, crypto_1.randomUUID)();
        try {
            yield connection.query(`INSERT INTO salesmen (id, name, type, userId, employeeId)
             VALUES (?, ?, 'SALES', ?, ?)`, [newSalesmanId, userData.name, userId, employeeId]);
        }
        catch (insertErr) {
            // Fallback if employeeId column doesn't exist on salesmen
            if (insertErr.code === 'ER_BAD_FIELD_ERROR') {
                yield connection.query(`INSERT INTO salesmen (id, name, type, userId)
                 VALUES (?, ?, 'SALES', ?)`, [newSalesmanId, userData.name, userId]);
            }
            else {
                throw insertErr;
            }
        }
        // Link salesman back to user and employee
        yield connection.query('UPDATE users SET salesmanId = ? WHERE id = ?', [newSalesmanId, userId]);
        try {
            yield connection.query('UPDATE employees SET salesmanId = ? WHERE id = ?', [newSalesmanId, employeeId]);
        }
        catch ( /* salesmanId column may not exist on employees */_b) { /* salesmanId column may not exist on employees */ }
        // Broadcast so salesman list refreshes in real-time
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'salesmen', updatedBy: 'System' });
        return newSalesmanId;
    });
}
const getChatUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const role = req.query.role || '';
        // Retrieve branch context from AuthRequest (req.user)
        const userBranchId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.branchId;
        let queryStr = "SELECT id, name, username, avatar, role, branchId FROM users WHERE (isHidden = FALSE OR isHidden IS NULL) AND status = 'ACTIVE'";
        const params = [];
        if (search) {
            queryStr += " AND (name LIKE ? OR username LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }
        if (role) {
            queryStr += " AND role = ?";
            params.push(role);
        }
        // Cashiers / Sales are branch isolated; Admins / General Managers see all branches
        const roleUpper = (((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) || '').toUpperCase();
        const isAdmin = ['ADMIN', 'MASTER_ADMIN', 'GENERAL_MANAGER', 'MANAGER', 'المدير', 'المدير العام', 'مسئول النظام'].includes(roleUpper);
        if (!isAdmin && userBranchId) {
            queryStr += " AND branchId = ?";
            params.push(userBranchId);
        }
        queryStr += " ORDER BY name LIMIT ? OFFSET ?";
        params.push(limit, offset);
        const [rows] = yield db_1.pool.query(queryStr, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error in getChatUsers:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getChatUsers = getChatUsers;
const getUserById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [rows] = yield db_1.pool.query(`SELECT 
                u.id, u.name, u.email, u.username, u.role, u.status, u.permissions, 
                u.lastLogin, u.avatar, u.salesmanId, u.preferences, u.branchId, 
                u.defaultTreasuryId, u.employeeId, u.isHidden, u.userType, u.warehouseId,
                b.name AS branchName,
                wh.name AS warehouseName
             FROM users u
             LEFT JOIN branches b ON u.branchId = b.id
             LEFT JOIN warehouses wh ON COALESCE(u.warehouseId, b.defaultWarehouseId) = wh.id
             WHERE u.id = ?`, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });
        }
        const user = rows[0];
        // Parse JSON fields
        user.permissions = user.permissions ? JSON.parse(user.permissions) : [];
        user.preferences = user.preferences ? (typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences) : {};
        res.json(user);
    }
    catch (error) {
        console.error('Error in getUserById:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getUserById = getUserById;
const getUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Include plain_password and branchId for admin visibility
        const [rows] = yield db_1.pool.query('SELECT id, name, email, username, plain_password, role, status, permissions, lastLogin, avatar, salesmanId, preferences, branchId, defaultTreasuryId, employeeId, isHidden, userType, warehouseId FROM users WHERE isHidden = FALSE OR isHidden IS NULL');
        const users = rows.map(row => (Object.assign(Object.assign({}, row), { permissions: row.permissions ? JSON.parse(row.permissions) : [], preferences: row.preferences ? (typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences) : {} })));
        res.json(users);
    }
    catch (error) {
        console.error('Error in getUsers:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getUsers = getUsers;
/**
 * Sanitize permissions array: filter out invalid entries (e.g. single characters
 * from accidental string spreading) by validating against the permissions table.
 * Only IDs that look like valid permission IDs (contain a dot) are kept.
 */
function fetchValidPermissionIds(connection) {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield connection.query('SELECT id FROM permissions');
        const ids = rows.map((r) => r.id);
        ids.push('all');
        return new Set(ids);
    });
}
function sanitizePermissions(permissions, validPermissions) {
    if (!Array.isArray(permissions))
        return [];
    return permissions.filter((p) => typeof p === 'string' && validPermissions.has(p));
}
const createUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const user = req.body;
        const id = user.id || (0, crypto_1.randomUUID)();
        const validPermissions = yield fetchValidPermissionIds(connection);
        const permissions = JSON.stringify(sanitizePermissions(user.permissions, validPermissions));
        const preferences = JSON.stringify(user.preferences || {});
        // Normalize empty email to NULL — email has UNIQUE constraint, empty strings conflict
        const email = ((_a = user.email) === null || _a === void 0 ? void 0 : _a.trim()) || null;
        const branchId = user.branchId || null;
        const defaultTreasuryId = user.defaultTreasuryId || null;
        const warehouseId = user.warehouseId || null;
        const userType = user.userType || 'NORMAL';
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
        yield connection.query('INSERT INTO users (id, name, email, username, password, plain_password, role, status, permissions, lastLogin, avatar, salesmanId, preferences, branchId, defaultTreasuryId, warehouseId, userType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, user.name, email, user.username, hashedPassword, user.password || null, user.role, user.status, permissions, user.lastLogin ? new Date(user.lastLogin) : null, user.avatar, user.salesmanId || null, preferences, branchId, defaultTreasuryId, warehouseId, userType]);
        // ── Auto-sync: Create HR employee + salesman (for cashiers/sales/staff) ──
        // Runs INSIDE transaction for database consistency
        const employeeId = yield syncUserToEmployee(connection, id, {
            name: user.name,
            email,
            role: user.role,
            branchId,
        });
        console.log(`👤 [USER] Auto-created HR employee ${employeeId} for user ${user.name}`);
        // If cashier, sales, or userType is STAFF, also create a salesman and link everything
        if (user.role === 'CASHIER' || user.role === 'SALES' || userType === 'STAFF') {
            const salesmanId = yield createSalesmanForUser(connection, id, employeeId, { name: user.name });
            console.log(`👤 [USER] Auto-created salesman ${salesmanId} for cashier/sales/staff ${user.name}`);
        }
        yield connection.commit();
        // Broadcast employees refresh
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'employees', updatedBy: 'System' });
        // Log audit trail
        const creator = req.body.creator || 'System';
        yield (0, auditController_1.logAction)(creator, 'USER', 'CREATE', `Created User: ${user.name}`, `Role: ${user.role}, Email: ${user.email}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'users', updatedBy: creator });
        // Re-fetch from DB so response includes plain_password + auto-linked IDs
        const [savedRows] = yield db_1.pool.query('SELECT id, name, email, username, plain_password, role, status, permissions, lastLogin, avatar, salesmanId, preferences, branchId, defaultTreasuryId, employeeId, userType, warehouseId FROM users WHERE id = ?', [id]);
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
    var _a, _b;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        const user = req.body;
        const validPermissions = yield fetchValidPermissionIds(connection);
        const permissions = JSON.stringify(sanitizePermissions(user.permissions, validPermissions));
        const email = ((_a = user.email) === null || _a === void 0 ? void 0 : _a.trim()) || null;
        const branchId = user.branchId || null;
        const defaultTreasuryId = user.defaultTreasuryId || null;
        const warehouseId = user.warehouseId || null;
        const userType = user.userType || 'NORMAL';
        // Build UPDATE dynamically — only include password if a new one is provided
        // This prevents wiping the existing bcrypt hash when editing name/email/permissions
        let updateSql = 'UPDATE users SET name=?, email=?, username=?, role=?, status=?, permissions=?, lastLogin=?, avatar=?, salesmanId=?, branchId=?, defaultTreasuryId=?, warehouseId=?, userType=?';
        let params = [user.name, email, user.username, user.role, user.status, permissions, user.lastLogin ? new Date(user.lastLogin) : null, user.avatar, user.salesmanId || null, branchId, defaultTreasuryId, warehouseId, userType];
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
        // ── Auto-sync: Ensure HR employee exists + create/unlink salesman ──
        const employeeId = yield syncUserToEmployee(connection, id, {
            name: user.name,
            email,
            role: user.role,
            branchId,
        });
        const needsSalesman = user.role === 'CASHIER' || user.role === 'SALES' || userType === 'STAFF';
        // Retrieve current salesmanId of the user (from database inside transaction)
        const [userRows] = yield connection.query('SELECT salesmanId FROM users WHERE id = ?', [id]);
        const currentSalesmanId = (_b = userRows[0]) === null || _b === void 0 ? void 0 : _b.salesmanId;
        if (needsSalesman && !currentSalesmanId) {
            const salesmanId = yield createSalesmanForUser(connection, id, employeeId, { name: user.name });
            console.log(`👤 [USER] Auto-created salesman ${salesmanId} for cashier/sales/staff ${user.name}`);
        }
        else if (!needsSalesman && currentSalesmanId) {
            // Unlink the salesman record safely (avoid deleting to prevent FK constraint failures on invoices)
            yield connection.query('UPDATE users SET salesmanId = NULL WHERE id = ?', [id]);
            try {
                yield connection.query('UPDATE employees SET salesmanId = NULL WHERE id = ?', [employeeId]);
            }
            catch (_c) { }
            yield connection.query('UPDATE salesmen SET employeeId = NULL, userId = NULL WHERE id = ?', [currentSalesmanId]);
            console.log(`👤 [USER] Unlinked salesman ${currentSalesmanId} because role/userType no longer requires it`);
        }
        yield connection.commit();
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'employees', updatedBy: 'System' });
        // Log audit trail
        const updater = req.body.updater || 'System';
        yield (0, auditController_1.logAction)(updater, 'USER', 'UPDATE', `Updated User: ${user.name}`, `Role: ${user.role}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'users', updatedBy: updater });
        // Re-fetch the saved user from DB so response includes plain_password and auto-linked IDs
        const [savedRows] = yield db_1.pool.query('SELECT id, name, email, username, plain_password, role, status, permissions, lastLogin, avatar, salesmanId, preferences, branchId, defaultTreasuryId, employeeId, userType, warehouseId FROM users WHERE id = ?', [id]);
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
    var _a, _b;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        const requestingUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        // Prevent self-deletion
        if (requestingUserId && String(requestingUserId) === String(id)) {
            return res.status(403).json({ error: 'FORBIDDEN_CANNOT_DELETE_SELF', message: 'لا يمكنك حذف حسابك بنفسك' });
        }
        // Get user details before deletion
        const [users] = yield connection.query('SELECT name, employeeId, salesmanId FROM users WHERE id=?', [id]);
        if (users.length === 0) {
            yield connection.rollback();
            return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' });
        }
        const user = users[0];
        const userName = user.name || id;
        const employeeId = user.employeeId;
        const salesmanId = user.salesmanId;
        // Delete user first
        yield connection.query('DELETE FROM users WHERE id=?', [id]);
        // Cleanup linked employee if exists (safe delete with fallback to status update if there are foreign constraints)
        if (employeeId) {
            yield connection.query('DELETE FROM employees WHERE id=?', [employeeId]).catch((err) => __awaiter(void 0, void 0, void 0, function* () {
                console.warn(`[deleteUser] Could not delete employee ${employeeId} due to FK constraints (falling back to unlinking):`, err.message);
                yield connection.query('UPDATE employees SET status = "INACTIVE" WHERE id=?', [employeeId]).catch(() => { });
            }));
        }
        // Cleanup linked salesman if exists
        if (salesmanId) {
            yield connection.query('DELETE FROM salesmen WHERE id=?', [salesmanId]).catch((err) => __awaiter(void 0, void 0, void 0, function* () {
                console.warn(`[deleteUser] Could not delete salesman ${salesmanId} due to FK constraints (falling back to unlinking):`, err.message);
                yield connection.query('UPDATE salesmen SET employeeId = NULL, userId = NULL WHERE id=?', [salesmanId]).catch(() => { });
            }));
        }
        yield connection.commit();
        // Log audit trail
        const deleter = ((_b = req.body) === null || _b === void 0 ? void 0 : _b.deleter) || 'System';
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
