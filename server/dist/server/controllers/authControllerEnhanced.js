"use strict";
/**
 * Enhanced Authentication Controller
 * Implements failed login tracking and account locking
 */
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
exports.changePassword = exports.getCurrentUser = exports.unlockAccount = exports.logout = exports.login = void 0;
const db_1 = require("../db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const policyMiddleware_1 = require("../middleware/policyMiddleware");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
const JWT_SECRET = process.env.JWT_SECRET;
/**
 * POST /api/auth/login - Enhanced login with security policies
 */
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        const conn = yield (0, db_1.getConnection)();
        try {
            // Load system config for security policies
            const [configRows] = yield conn.query('SELECT config FROM system_config LIMIT 1');
            const configData = configRows[0];
            let systemConfig;
            if (configData && configData.config) {
                systemConfig = typeof configData.config === 'string'
                    ? JSON.parse(configData.config)
                    : configData.config;
            }
            // Check if account is locked
            if ((0, policyMiddleware_1.isAccountLocked)(username, systemConfig)) {
                // Log failed attempt if enabled
                if (systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.logFailedAccessAttempts) {
                    yield (0, auditController_1.logAction)(username, 'AUTH', 'LOGIN_BLOCKED', `Login blocked for ${username} - account locked due to too many failed attempts`, `IP: ${req.ip || 'unknown'}`);
                }
                return res.status(403).json({
                    error: 'ACCOUNT_LOCKED',
                    message: 'Account is locked due to too many failed login attempts. Please contact administrator.'
                });
            }
            // Get user from database
            const [users] = yield conn.query('SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1', [username, username]);
            const user = users[0];
            if (!user) {
                // Track failed login
                const lockResult = (0, policyMiddleware_1.trackFailedLogin)(username, systemConfig);
                // Log failed attempt if enabled
                if (systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.logFailedAccessAttempts) {
                    yield (0, auditController_1.logAction)(username, 'AUTH', 'LOGIN_FAILED', `Failed login attempt for non-existent user: ${username}`, `IP: ${req.ip || 'unknown'}`);
                }
                return res.status(401).json({
                    error: 'INVALID_CREDENTIALS',
                    message: 'Invalid username or password',
                    remainingAttempts: lockResult.remainingAttempts
                });
            }
            // Check if user is active
            if (user.status !== 'ACTIVE') {
                // Log blocked attempt
                if (systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.logFailedAccessAttempts) {
                    yield (0, auditController_1.logAction)(username, 'AUTH', 'LOGIN_BLOCKED', `Login blocked for inactive user: ${username}`, `Status: ${user.status}`);
                }
                return res.status(403).json({
                    error: 'ACCOUNT_INACTIVE',
                    message: 'Account is inactive. Please contact administrator.'
                });
            }
            // Verify password
            const passwordMatch = yield bcryptjs_1.default.compare(password, user.password);
            if (!passwordMatch) {
                // Track failed login
                const lockResult = (0, policyMiddleware_1.trackFailedLogin)(username, systemConfig);
                // Log failed attempt if enabled
                if (systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.logFailedAccessAttempts) {
                    yield (0, auditController_1.logAction)(username, 'AUTH', 'LOGIN_FAILED', `Failed login attempt - incorrect password for user: ${username}`, `IP: ${req.ip || 'unknown'}`);
                }
                return res.status(401).json({
                    error: 'INVALID_CREDENTIALS',
                    message: 'Invalid username or password',
                    remainingAttempts: lockResult.remainingAttempts,
                    locked: lockResult.locked
                });
            }
            // Successful login - clear failed attempts
            (0, policyMiddleware_1.clearFailedLogins)(username);
            // Update last login
            yield conn.query('UPDATE users SET lastLogin = NOW() WHERE id = ?', [user.id]);
            // Parse permissions
            const permissions = user.permissions
                ? (typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions)
                : [];
            // Handle fiscal year selection
            const { fiscalYearId } = req.body;
            let fiscalYear = null;
            // DEBUG: Log fiscal year selection attempt
            const modulesAny = systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.modules;
            console.log(`🔍 [LOGIN] fiscalYearId from body: ${fiscalYearId}, enableFiscalYears: ${(_a = systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.modules) === null || _a === void 0 ? void 0 : _a.enableFiscalYears}, modules keys: ${(systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.modules) ? Object.keys(systemConfig.modules).join(',') : 'N/A'}`);
            // If user selected a fiscal year, try to load it
            // Accept if enableFiscalYears OR fiscalYears is enabled, OR if a fiscalYearId is explicitly provided
            if (fiscalYearId) {
                const [fyRows] = yield conn.query('SELECT id, name, start_date, end_date, status FROM fiscal_years WHERE id = ?', [fiscalYearId]);
                const fy = fyRows[0];
                if (fy) {
                    fiscalYear = {
                        id: fy.id,
                        name: fy.name,
                        startDate: fy.start_date,
                        endDate: fy.end_date,
                        status: fy.status
                    };
                    console.log(`✅ [LOGIN] Fiscal year loaded: ${fiscalYear.name} (${fiscalYear.startDate} - ${fiscalYear.endDate})`);
                }
                else {
                    console.log(`⚠️ [LOGIN] Fiscal year ID ${fiscalYearId} not found in database`);
                }
            }
            // Generate JWT token
            const tokenPayload = {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
                permissions: permissions
            };
            // Include fiscal year in token if selected
            if (fiscalYear) {
                tokenPayload.fiscalYearId = fiscalYear.id;
                tokenPayload.fiscalYearName = fiscalYear.name;
                tokenPayload.fiscalYearStart = fiscalYear.startDate;
                tokenPayload.fiscalYearEnd = fiscalYear.endDate;
                tokenPayload.fiscalYearStatus = fiscalYear.status;
            }
            const token = jsonwebtoken_1.default.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
            // Log successful login
            yield (0, auditController_1.logAction)(user.name || user.username, 'AUTH', 'LOGIN_SUCCESS', `User logged in successfully from ${req.ip || 'unknown IP'}${fiscalYear ? ` (Fiscal Year: ${fiscalYear.name})` : ''}`, `IP: ${req.ip || 'unknown'}`);
            // Return user data and token
            res.json({
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    username: user.username,
                    role: user.role,
                    status: user.status,
                    permissions: permissions,
                    avatar: user.avatar
                },
                fiscalYear: fiscalYear || null
            });
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('Login error:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'internal');
    }
});
exports.login = login;
/**
 * POST /api/auth/logout - Logout user
 */
const logout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (req.user) {
            yield (0, auditController_1.logAction)(req.user.name || req.user.username, 'AUTH', 'LOGOUT', 'User logged out', '');
        }
        res.json({ message: 'Logged out successfully' });
    }
    catch (error) {
        console.error('Logout error:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'internal');
    }
});
exports.logout = logout;
/**
 * POST /api/auth/unlock-account - Unlock a locked account (Admin only)
 */
const unlockAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username } = req.body;
        if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'MASTER_ADMIN')) {
            return res.status(403).json({ error: 'Only admins can unlock accounts' });
        }
        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }
        // Clear failed login attempts
        (0, policyMiddleware_1.clearFailedLogins)(username);
        // Log action
        yield (0, auditController_1.logAction)(req.user.name || req.user.username, 'AUTH', 'ACCOUNT_UNLOCKED', `Account unlocked for user: ${username}`, '');
        res.json({ message: 'Account unlocked successfully' });
    }
    catch (error) {
        console.error('Unlock account error:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'internal');
    }
});
exports.unlockAccount = unlockAccount;
/**
 * GET /api/auth/me - Get current user info with refresh
 */
const getCurrentUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const conn = yield (0, db_1.getConnection)();
        try {
            const [users] = yield conn.query('SELECT id, name, email, username, role, status, permissions, avatar, lastLogin FROM users WHERE id = ? LIMIT 1', [req.user.id]);
            const user = users[0];
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            if (user.status !== 'ACTIVE') {
                return res.status(403).json({ error: 'Account is inactive' });
            }
            // Parse permissions
            const permissions = user.permissions
                ? (typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions)
                : [];
            res.json({
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    username: user.username,
                    role: user.role,
                    status: user.status,
                    permissions: permissions,
                    avatar: user.avatar,
                    lastLogin: user.lastLogin
                }
            });
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('Get current user error:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'internal');
    }
});
exports.getCurrentUser = getCurrentUser;
/**
 * POST /api/auth/change-password - Change user password
 */
const changePassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new passwords are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }
        const conn = yield (0, db_1.getConnection)();
        try {
            // Get current user
            const [users] = yield conn.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
            const user = users[0];
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            // Verify current password
            const passwordMatch = yield bcryptjs_1.default.compare(currentPassword, user.password);
            if (!passwordMatch) {
                yield (0, auditController_1.logAction)(req.user.name || req.user.username, 'AUTH', 'PASSWORD_CHANGE_FAILED', 'Failed password change - incorrect current password', '');
                return res.status(401).json({ error: 'Current password is incorrect' });
            }
            // Hash new password
            const hashedPassword = yield bcryptjs_1.default.hash(newPassword, 10);
            // Update password
            yield conn.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
            // Log action
            yield (0, auditController_1.logAction)(req.user.name || req.user.username, 'AUTH', 'PASSWORD_CHANGED', 'User password changed successfully', '');
            res.json({ message: 'Password changed successfully' });
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('Change password error:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'internal');
    }
});
exports.changePassword = changePassword;
