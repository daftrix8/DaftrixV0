"use strict";
/**
 * ═══════════════════════════════════════════════════════════
 * ACTIVITY LOGGER MIDDLEWARE — Comprehensive User Activity Tracking
 * ═══════════════════════════════════════════════════════════
 *
 * Logs EVERY write operation (POST/PUT/DELETE/PATCH) to audit_logs
 * with full context: user, IP, method, path, request body summary,
 * response status, and timing.
 *
 * For watched users (e.g., "fanan"), logs ALL operations including GETs.
 *
 * This middleware prevents abuse like the 8MB preferences bloat
 * by providing full visibility into what each user does.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.activityLogger = activityLogger;
exports.preferencesGuard = preferencesGuard;
exports.addWatchedUser = addWatchedUser;
exports.removeWatchedUser = removeWatchedUser;
exports.getWatchedUsers = getWatchedUsers;
const db_1 = require("../db");
const crypto_1 = require("crypto");
// ── Configuration ──
// Users under enhanced surveillance — ALL their requests are logged (including GET)
// Clear this set when surveillance is no longer needed
const WATCHED_USERS = new Set([]);
// Maximum preferences size allowed (500KB — should be more than enough)
const MAX_PREFERENCES_SIZE = 500 * 1024; // 500KB
// Throttle: don't log repeated identical actions within this window
const DEDUP_WINDOW_MS = 5000; // 5 seconds
const _recentActions = new Map();
// Cleanup stale dedup entries every 60s
setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of _recentActions.entries()) {
        if (now - ts > DEDUP_WINDOW_MS * 3)
            _recentActions.delete(key);
    }
}, 60000);
// ── Helpers ──
function getClientIp(req) {
    var _a, _b, _c, _d;
    return ((_b = (_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.split(',')[0]) === null || _b === void 0 ? void 0 : _b.trim())
        || req.headers['x-real-ip']
        || ((_c = req.connection) === null || _c === void 0 ? void 0 : _c.remoteAddress)
        || ((_d = req.socket) === null || _d === void 0 ? void 0 : _d.remoteAddress)
        || 'unknown';
}
function sanitizeBody(body, maxLen = 500) {
    if (!body || typeof body !== 'object')
        return '';
    try {
        // Remove sensitive fields
        const clean = Object.assign({}, body);
        delete clean.password;
        delete clean.plain_password;
        delete clean.token;
        delete clean.jwt;
        // If preferences is huge, truncate it
        if (clean.preferences && JSON.stringify(clean.preferences).length > 200) {
            clean.preferences = `[${JSON.stringify(clean.preferences).length} bytes]`;
        }
        const json = JSON.stringify(clean);
        return json.length > maxLen ? json.substring(0, maxLen) + '...[truncated]' : json;
    }
    catch (_a) {
        return '[parse error]';
    }
}
function getModuleFromPath(originalUrl) {
    // Extract module from full API path: /api/invoices/123 → INVOICES
    // Must use req.originalUrl, NOT req.path (which is relative to router mount)
    const cleanPath = (originalUrl || '').split('?')[0]; // strip query string
    const parts = cleanPath.replace(/^\/api\//, '').split('/').filter(Boolean);
    // Map known nested routes to proper module names
    const segment = (parts[0] || '').toUpperCase();
    const MODULE_MAP = {
        'MASTER': parts[1] ? parts[1].toUpperCase() : 'MASTER_DATA',
        'INVOICES': 'INVOICE',
        'PARTNERS': 'PARTNER',
        'PRODUCTS': 'PRODUCT',
        'ACCOUNTS': 'ACCOUNTING',
        'JOURNAL': 'ACCOUNTING',
        'CHEQUES': 'CHEQUE',
        'PERMISSIONS': 'SECURITY',
        'USERS': 'USER_MGMT',
        'AUDIT': 'AUDIT',
        'PRODUCT-STOCKS': 'INVENTORY',
        'WAREHOUSES': 'INVENTORY',
        'MANUFACTURING': 'MANUFACTURING',
        'PACKAGING': 'PACKAGING',
        'PAYROLL': 'HR',
        'EMPLOYEES': 'HR',
        'REPORTS': 'REPORTS',
        'SETTINGS': 'SETTINGS',
        'AI-CHAT': 'AI',
    };
    return MODULE_MAP[segment] || segment || 'UNKNOWN';
}
function getActionFromMethod(method, originalUrl) {
    const methodMap = {
        'GET': 'VIEW',
        'POST': 'CREATE',
        'PUT': 'UPDATE',
        'PATCH': 'UPDATE',
        'DELETE': 'DELETE'
    };
    const action = methodMap[method] || method;
    const fullPath = (originalUrl || '').toLowerCase();
    // Refine action based on path keywords
    if (fullPath.includes('/preferences'))
        return 'UPDATE_PREFERENCES';
    if (fullPath.includes('/password'))
        return 'CHANGE_PASSWORD';
    if (fullPath.includes('/login'))
        return 'LOGIN';
    if (fullPath.includes('/logout'))
        return 'LOGOUT';
    if (fullPath.includes('/void'))
        return 'VOID';
    if (fullPath.includes('/export'))
        return 'EXPORT';
    if (fullPath.includes('/backup'))
        return 'BACKUP';
    if (fullPath.includes('/restore'))
        return 'RESTORE';
    if (fullPath.includes('/delete') || fullPath.includes('/remove'))
        return 'DELETE';
    if (fullPath.includes('/seed'))
        return 'SEED';
    if (fullPath.includes('/sync'))
        return 'SYNC';
    return action;
}
// ── Async log writer (fire-and-forget, never blocks the response) ──
function writeAuditLog(username, module, action, description, details, ipAddress) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield db_1.pool.query(`INSERT INTO audit_logs (id, date, user, module, action, description, details)
             VALUES (?, NOW(), ?, ?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), username, module, action, description, details]);
        }
        catch (err) {
            // Never let audit logging crash the app
            console.error('❌ [AUDIT] Failed to write log:', err.message);
        }
    });
}
// ── Main Middleware ──
function activityLogger(req, res, next) {
    // Only log after authentication — req.user must exist
    if (!req.user)
        return next();
    const username = req.user.username || req.user.name || req.user.id || 'unknown';
    const isWatched = WATCHED_USERS.has(username.toLowerCase());
    const method = req.method.toUpperCase();
    const fullUrl = req.originalUrl || req.baseUrl + req.path || req.path;
    // Only log write operations (POST, PUT, DELETE, PATCH) for all users
    // For watched users: also log GET requests
    if (method === 'GET' && !isWatched)
        return next();
    // Skip noisy/polling endpoints
    const skipPatterns = [
        '/api/health', '/api/boot-status', '/api/sse', '/api/init',
        '/api/dashboard-kpis', '/api/permissions/seed',
    ];
    if (skipPatterns.some(p => fullUrl.startsWith(p)))
        return next();
    // Dedup: don't log the exact same action twice within 5s
    const dedupKey = `${username}:${method}:${fullUrl.split('?')[0]}`;
    const now = Date.now();
    if (_recentActions.has(dedupKey) && (now - _recentActions.get(dedupKey)) < DEDUP_WINDOW_MS) {
        return next();
    }
    _recentActions.set(dedupKey, now);
    const startTime = Date.now();
    const ip = getClientIp(req);
    const module = getModuleFromPath(fullUrl);
    const action = getActionFromMethod(method, fullUrl);
    const bodySnippet = sanitizeBody(req.body);
    // ── Intercept the response to capture status code ──
    const originalEnd = res.end;
    res.end = function (...args) {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;
        const cleanPath = fullUrl.split('?')[0]; // strip query params for description
        // Build a human-readable description
        const description = `${method} ${cleanPath} → ${statusCode} (${duration}ms)`;
        // Build details with request context
        const details = JSON.stringify({
            method,
            path: fullUrl,
            status: statusCode,
            duration: `${duration}ms`,
            ip,
            body: bodySnippet || undefined,
            watched: isWatched || undefined,
            params: (req.params && typeof req.params === 'object' && Object.keys(req.params || {}).length > 0) ? req.params : undefined
        });
        // Console warning for watched users
        if (isWatched) {
            const emoji = statusCode >= 400 ? '🚨' : '👁️';
            console.log(`${emoji} [WATCHED: ${username}] ${method} ${cleanPath} → ${statusCode} (${duration}ms) IP:${ip}`);
        }
        // Fire-and-forget: write to DB asynchronously
        writeAuditLog(username, module, action, description, details, ip);
        // Call original res.end
        return originalEnd.apply(this, args);
    };
    next();
}
// ── Preferences Size Guard ──
// If preferences are too large, strip them from the request instead of blocking.
// This prevents unrelated saves (e.g. permission edits) from failing due to
// bloated preferences accumulated in the frontend state.
function preferencesGuard(req, res, next) {
    var _a, _b;
    if ((_a = req.body) === null || _a === void 0 ? void 0 : _a.preferences) {
        const prefsSize = JSON.stringify(req.body.preferences).length;
        if (prefsSize > MAX_PREFERENCES_SIZE) {
            const username = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || 'unknown';
            console.warn(`⚠️ [GUARD] User "${username}" has ${(prefsSize / 1024).toFixed(0)}KB preferences (max: ${MAX_PREFERENCES_SIZE / 1024}KB). Stripping from request.`);
            // Log this event
            writeAuditLog(username, 'SECURITY', 'STRIPPED_OVERSIZE_PREFERENCES', `Stripped ${(prefsSize / 1024).toFixed(0)}KB preferences from save (max: ${MAX_PREFERENCES_SIZE / 1024}KB)`, JSON.stringify({
                size: prefsSize,
                limit: MAX_PREFERENCES_SIZE,
                ip: getClientIp(req)
            }), getClientIp(req));
            // Remove the oversized preferences — let the rest of the save proceed
            delete req.body.preferences;
        }
    }
    next();
}
// ── Admin: Add/Remove watched users at runtime ──
function addWatchedUser(username) {
    WATCHED_USERS.add(username.toLowerCase());
    console.log(`👁️ [WATCH] Now watching user: ${username}`);
}
function removeWatchedUser(username) {
    WATCHED_USERS.delete(username.toLowerCase());
    console.log(`👁️ [WATCH] Stopped watching user: ${username}`);
}
function getWatchedUsers() {
    return Array.from(WATCHED_USERS);
}
