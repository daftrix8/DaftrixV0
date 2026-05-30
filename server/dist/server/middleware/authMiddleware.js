"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAnyPermission = exports.requirePermission = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
    console.warn('⚠️ WARNING: JWT_SECRET environment variable is not set! Using a random temporary secret.');
    console.warn('   This means users will be logged out whenever the server restarts.');
}
// Throttle map: prevents repeated log messages for the same path (key -> last log timestamp)
const _authLogThrottle = new Map();
const AUTH_LOG_THROTTLE_MS = 300000; // 5 minutes — reduces stdout pipe pressure
// Cleanup stale throttle entries every 5 minutes (prevents unbounded memory growth)
setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of _authLogThrottle.entries()) {
        if (now - ts > AUTH_LOG_THROTTLE_MS * 2)
            _authLogThrottle.delete(key);
    }
}, AUTH_LOG_THROTTLE_MS);
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // Support token from Authorization header OR query param (for direct browser downloads)
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
    if (!token) {
        // Throttle: only log each path once per 60s to prevent console flooding
        const key = `no-token:${req.method}:${req.path}`;
        const now = Date.now();
        if (!_authLogThrottle.has(key) || now - _authLogThrottle.get(key) > AUTH_LOG_THROTTLE_MS) {
            _authLogThrottle.set(key, now);
            console.log(`🔒 [AUTH] No token for ${req.method} ${req.path} (throttled — suppressing repeats for ${AUTH_LOG_THROTTLE_MS / 1000}s)`);
        }
        return res.sendStatus(401);
    }
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            // Throttle: only log each path once per 60s
            const key = `jwt-fail:${req.method}:${req.path}`;
            const now = Date.now();
            if (!_authLogThrottle.has(key) || now - _authLogThrottle.get(key) > AUTH_LOG_THROTTLE_MS) {
                _authLogThrottle.set(key, now);
                console.log(`🔒 [AUTH] JWT verify FAILED for ${req.method} ${req.path}: ${err.message} (throttled)`);
            }
            return res.sendStatus(401);
        }
        // Attach fiscal year info if present in token
        if (user.fiscalYearId) {
            user.fiscalYear = {
                id: user.fiscalYearId,
                name: user.fiscalYearName,
                startDate: user.fiscalYearStart,
                endDate: user.fiscalYearEnd,
                status: user.fiscalYearStatus
            };
        }
        req.user = user;
        next();
    });
};
exports.authenticateToken = authenticateToken;
// Role-based default permissions: Automatically granted even if not
// explicitly assigned in the database. Add entries here only for permissions
// that are truly universal to a role and cannot be configured per-user.
const ROLE_DEFAULT_PERMISSIONS = {
// No blanket defaults — grant all permissions explicitly per-user in User Management.
// This prevents silent privilege escalation for non-admin roles.
};
// Permission aliases: maps route-required permission → alternative IDs the user may have
// This resolves inconsistencies where db seeds and route checks use slightly different IDs
const PERMISSION_ALIASES = {
    'vansales.settlements': ['vansales.settlement'], // plural vs singular mismatch
    'vansales.settlement': ['vansales.settlements'],
    // BOM: routes check bom.*, but التصنيع module grants manufacturing.bom
    'bom.view': ['manufacturing.bom'],
    'bom.create': ['manufacturing.bom'],
    'bom.edit': ['manufacturing.bom'],
    'bom.delete': ['manufacturing.bom'],
    'bom.copy': ['manufacturing.bom'],
    'bom.costing': ['manufacturing.bom'],
    // Production: routes check production.*, but التصنيع module grants manufacturing.production
    'production.view': ['manufacturing.production'],
    'production.create': ['manufacturing.production'],
    'production.edit': ['manufacturing.production'],
    'production.delete': ['manufacturing.production'],
    'production.start': ['manufacturing.production'],
    'production.complete': ['manufacturing.production'],
    'production.cancel': ['manufacturing.production'],
    'production.issue_materials': ['manufacturing.production'],
    'production.receive_finished': ['manufacturing.production'],
    // POS: validate permission falls back to close_shift for backward compatibility
    'pos.validate': ['pos.close_shift'],
    // KB: knowledge base lives inside CRM — anyone with crm.view can read articles
    'kb.view': ['crm.view'],
};
const requirePermission = (permissionId) => {
    return (req, res, next) => {
        var _a, _b;
        const user = req.user;
        if (!user)
            return res.sendStatus(401);
        // Admin bypass
        const role = (_a = user.role) === null || _a === void 0 ? void 0 : _a.toUpperCase();
        if (role === 'ADMIN' || role === 'MASTER_ADMIN' || role === 'GENERAL_MANAGER')
            return next();
        // Check explicit permissions (exact match + aliases)
        if (user.permissions) {
            if (user.permissions.includes(permissionId) || user.permissions.includes('all')) {
                return next();
            }
            // Check aliases
            const aliases = PERMISSION_ALIASES[permissionId];
            if (aliases && aliases.some((alias) => user.permissions.includes(alias))) {
                return next();
            }
        }
        // Check role-based default permissions (e.g. SALES → vansales.*)
        const roleDefaults = ROLE_DEFAULT_PERMISSIONS[role || ''];
        if (roleDefaults && roleDefaults.includes(permissionId)) {
            return next();
        }
        // DEBUG: Log the permission denial details to diagnose 403 errors
        console.warn(`🚫 [PERM] DENIED ${req.method} ${req.path} — need: "${permissionId}", user: ${user.username || user.id}, role: "${user.role}", permsType: ${typeof user.permissions}, perms: ${(_b = JSON.stringify(user.permissions)) === null || _b === void 0 ? void 0 : _b.slice(0, 200)}`);
        return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    };
};
exports.requirePermission = requirePermission;
const requireAnyPermission = (permissionIds) => {
    return (req, res, next) => {
        var _a;
        const user = req.user;
        if (!user)
            return res.sendStatus(401);
        // Admin bypass
        const role = (_a = user.role) === null || _a === void 0 ? void 0 : _a.toUpperCase();
        if (role === 'ADMIN' || role === 'MASTER_ADMIN' || role === 'GENERAL_MANAGER')
            return next();
        // Check if user has ANY of the explicit permissions
        if (user.permissions && (user.permissions.includes('all') || permissionIds.some((id) => user.permissions.includes(id)))) {
            return next();
        }
        // Check role-based default permissions
        const roleDefaults = ROLE_DEFAULT_PERMISSIONS[role || ''];
        if (roleDefaults && permissionIds.some(id => roleDefaults.includes(id))) {
            return next();
        }
        return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    };
};
exports.requireAnyPermission = requireAnyPermission;
