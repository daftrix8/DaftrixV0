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
exports.requireAnyPermission = exports.requirePermission = exports.authenticateToken = exports.closeAuthThrottle = void 0;
const db_1 = require("../db");
const permissionAliases_1 = require("../../shared/permissionAliases");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.warn('⚠️ WARNING: JWT_SECRET environment variable is not set in authMiddleware! Request authentication will fail.');
}
// Admin roles aligned with client-side ADMIN_ROLES in utils/auth.ts
const ADMIN_ROLES = ['ADMIN', 'MASTER_ADMIN', 'GENERAL_MANAGER', 'MANAGER', 'المدير', 'المدير العام', 'مسئول النظام'];
// Check if a role is an admin role (case-insensitive and Arabic-safe)
const checkIsAdminRole = (userRole) => {
    if (!userRole)
        return false;
    const normalizedRole = userRole.trim().toUpperCase();
    return ADMIN_ROLES.some(role => role.trim().toUpperCase() === normalizedRole);
};
// Throttle map: prevents repeated log messages for the same path (key -> last log timestamp)
const _authLogThrottle = new Map();
const AUTH_LOG_THROTTLE_MS = 300000; // 5 minutes — reduces stdout pipe pressure
const MAX_THROTTLE_MAP_SIZE = 1000; // Prevents unbounded map growth / memory exhaustion
// Store cleanup interval ref so it doesn't block clean shutdown or testing suites
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of _authLogThrottle.entries()) {
        if (now - ts > AUTH_LOG_THROTTLE_MS * 2)
            _authLogThrottle.delete(key);
    }
}, AUTH_LOG_THROTTLE_MS);
// Cleanup hook for testing or SIGTERM
const closeAuthThrottle = () => {
    clearInterval(cleanupInterval);
};
exports.closeAuthThrottle = closeAuthThrottle;
const throttleLog = (key, logMessage) => {
    const now = Date.now();
    if (_authLogThrottle.size >= MAX_THROTTLE_MAP_SIZE) {
        // Evict the oldest 200 items (first 20% in FIFO insertion order)
        const keys = _authLogThrottle.keys();
        for (let i = 0; i < 200; i++) {
            const next = keys.next();
            if (next.done)
                break;
            _authLogThrottle.delete(next.value);
        }
    }
    if (!_authLogThrottle.has(key) || now - _authLogThrottle.get(key) > AUTH_LOG_THROTTLE_MS) {
        _authLogThrottle.set(key, now);
        console.log(logMessage);
    }
};
const authenticateToken = (req, res, next) => {
    if (!JWT_SECRET) {
        console.error('❌ FATAL: JWT_SECRET environment variable is missing.');
        return res.status(500).json({ message: 'Internal server error: Auth configuration missing' });
    }
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];
    if (!token && req.query.token) {
        // Restrict query parameter tokens to whitelisted GET routes (exports, prints, downloads)
        const path = req.path.toLowerCase();
        const isDownloadRoute = req.method === 'GET' &&
            (path.includes('/download') ||
                path.includes('/export') ||
                path.includes('/print') ||
                path.includes('/pdf') ||
                path.includes('/excel'));
        if (isDownloadRoute) {
            token = req.query.token;
        }
        else {
            console.warn(`🚫 [AUTH] Rejected query param token for unsafe route: ${req.method} ${req.path}`);
        }
    }
    if (!token) {
        const key = `no-token:${req.method}:${req.path}`;
        throttleLog(key, `🔒 [AUTH] No token for ${req.method} ${req.path} (suppressed repeated logs for ${AUTH_LOG_THROTTLE_MS / 1000}s)`);
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, decoded) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        if (err || !decoded) {
            const key = `jwt-fail:${req.method}:${req.path}`;
            throttleLog(key, `🔒 [AUTH] JWT verify FAILED for ${req.method} ${req.path}: ${(err === null || err === void 0 ? void 0 : err.message) || 'Invalid payload'} (throttled)`);
            return res.status(401).json({ message: 'Unauthorized: Invalid token' });
        }
        const userId = decoded.id;
        if (!userId || (typeof userId !== 'string' && (typeof userId !== 'number' || isNaN(userId)))) {
            const key = `bad-id:${req.method}:${req.path}`;
            throttleLog(key, `🔒 [AUTH] Invalid user ID in JWT payload for ${req.method} ${req.path}`);
            return res.status(401).json({ message: 'Unauthorized: Invalid token payload' });
        }
        // Fetch FRESH permissions from DB — never trust JWT permissions.
        try {
            const [rows] = yield db_1.pool.query('SELECT role, permissions, status FROM users WHERE id = ? LIMIT 1', [userId]);
            const freshUser = rows[0];
            const status = (_a = freshUser === null || freshUser === void 0 ? void 0 : freshUser.status) === null || _a === void 0 ? void 0 : _a.trim().toUpperCase();
            if (!freshUser || (status && status !== 'ACTIVE')) {
                return res.status(401).json({ message: 'Unauthorized: Inactive or deleted user' });
            }
            let freshPermissions = [];
            if (freshUser.permissions) {
                try {
                    freshPermissions = typeof freshUser.permissions === 'string'
                        ? JSON.parse(freshUser.permissions)
                        : freshUser.permissions;
                    if (!Array.isArray(freshPermissions)) {
                        console.error(`⚠️ [AUTH] Permissions for user ID ${userId} is not an array:`, freshPermissions);
                        freshPermissions = [];
                    }
                }
                catch (parseErr) {
                    console.error(`❌ [AUTH] Failed to parse permissions JSON for user ID ${userId}: ${parseErr.message}`);
                    freshPermissions = [];
                }
            }
            // Merge JWT metadata (fiscalYear, branch, etc.) with fresh DB data
            req.user = Object.assign(Object.assign({}, decoded), { role: freshUser.role, permissions: freshPermissions });
        }
        catch (dbErr) {
            // DB unreachable — fall back to JWT data so the app doesn't brick
            console.error(`⚠️ [AUTH] Fresh permission lookup FAILED for user ID ${userId} (${decoded.username || 'unknown'}). Falling back to stale JWT permissions. Error: ${dbErr === null || dbErr === void 0 ? void 0 : dbErr.message}`);
            let jwtPermissions = decoded.permissions || [];
            if (typeof jwtPermissions === 'string') {
                try {
                    jwtPermissions = JSON.parse(jwtPermissions);
                }
                catch (_b) {
                    jwtPermissions = [];
                }
            }
            req.user = Object.assign(Object.assign({}, decoded), { permissions: Array.isArray(jwtPermissions) ? jwtPermissions : [] });
        }
        // Attach fiscal year info if present in token
        if (decoded.fiscalYearId) {
            req.user.fiscalYear = {
                id: decoded.fiscalYearId,
                name: decoded.fiscalYearName,
                startDate: decoded.fiscalYearStart,
                endDate: decoded.fiscalYearEnd,
                status: decoded.fiscalYearStatus
            };
        }
        next();
    }));
};
exports.authenticateToken = authenticateToken;
const requirePermission = (permissionId) => {
    return (req, res, next) => {
        var _a;
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: 'Unauthorized: Authentication required' });
        }
        // Admin override check (Arabic-safe and case-insensitive)
        const isAdmin = checkIsAdminRole(user.role) || (user.permissions && user.permissions.includes('all'));
        if (isAdmin) {
            return next();
        }
        // Check explicit permissions (exact match + aliases)
        if (user.permissions && (0, permissionAliases_1.hasPermissionWithAliases)(user.permissions, permissionId)) {
            return next();
        }
        // DEBUG: Log the permission denial details (masking actual permissions details to reduce PII risks)
        console.warn(`🚫 [PERM] DENIED ${req.method} ${req.path} — need: "${permissionId}", user: ${user.username || user.id}, role: "${user.role}", permsCount: ${((_a = user.permissions) === null || _a === void 0 ? void 0 : _a.length) || 0}`);
        return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    };
};
exports.requirePermission = requirePermission;
const requireAnyPermission = (permissionIds) => {
    return (req, res, next) => {
        var _a;
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: 'Unauthorized: Authentication required' });
        }
        // Admin override check (Arabic-safe and case-insensitive)
        const isAdmin = checkIsAdminRole(user.role) || (user.permissions && user.permissions.includes('all'));
        if (isAdmin) {
            return next();
        }
        // Check if user has ANY of the explicit permissions (including aliases)
        if (user.permissions && permissionIds.some((id) => (0, permissionAliases_1.hasPermissionWithAliases)(user.permissions, id))) {
            return next();
        }
        // DEBUG: Log the permission denial details (masking actual permissions details to reduce PII risks)
        console.warn(`🚫 [PERM] DENIED ${req.method} ${req.path} — need any of: ${JSON.stringify(permissionIds)}, user: ${user.username || user.id}, role: "${user.role}", permsCount: ${((_a = user.permissions) === null || _a === void 0 ? void 0 : _a.length) || 0}`);
        return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    };
};
exports.requireAnyPermission = requireAnyPermission;
