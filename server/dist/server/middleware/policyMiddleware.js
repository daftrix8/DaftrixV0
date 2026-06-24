"use strict";
/**
 * Enhanced Authentication Middleware
 * Extends the base auth middleware with policy enforcement
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
exports.enforceLockDate = exports.closePolicyCleanup = exports.requireMinimumRole = exports.canModifyRecordMiddleware = exports.validateTransactionAmountMiddleware = exports.loadSystemConfig = exports.invalidateConfigCache = exports.invalidateSalesmanCache = exports.closePolicyThrottle = void 0;
exports.getInvoiceCreator = getInvoiceCreator;
exports.getJournalCreator = getJournalCreator;
exports.getChequeCreator = getChequeCreator;
exports.trackFailedLogin = trackFailedLogin;
exports.clearFailedLogins = clearFailedLogins;
exports.isAccountLocked = isAccountLocked;
exports.cleanupOldAttempts = cleanupOldAttempts;
const db_1 = require("../db");
const dataFiltering_1 = require("../utils/dataFiltering");
const lockDateValidator_1 = require("../utils/lockDateValidator");
// In-memory cache for system config (prevents DB hit on every request)
let _configCache = null;
const CONFIG_CACHE_TTL = 60000; // 60 seconds
// In-memory cache for per-user salesman link.
// Maps userId -> { salesmanId: string | null; timestamp: number }
// Using null as a sentinel for "checked, no salesman exists".
const _salesmanCache = new Map();
const SALESMAN_CACHE_TTL = 300000; // 5 minutes
// Clean up stale entries every 10 minutes to prevent unbounded growth
const salesmanCleanupInterval = setInterval(() => {
    const cutoff = Date.now() - SALESMAN_CACHE_TTL * 2;
    for (const [key, entry] of _salesmanCache) {
        if (entry.timestamp < cutoff)
            _salesmanCache.delete(key);
    }
}, 600000);
// Cleanup hook for testing or shutdown
const closePolicyThrottle = () => {
    clearInterval(salesmanCleanupInterval);
};
exports.closePolicyThrottle = closePolicyThrottle;
// Cache invalidation helpers
const invalidateSalesmanCache = (userId) => {
    _salesmanCache.delete(userId);
};
exports.invalidateSalesmanCache = invalidateSalesmanCache;
const invalidateConfigCache = () => {
    _configCache = null;
};
exports.invalidateConfigCache = invalidateConfigCache;
/**
 * Middleware to load system configuration and user filter options.
 * Performance: Reuses a single database connection for both config and salesman checks,
 * and caches results to avoid connection pool pressure.
 */
const loadSystemConfig = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const now = Date.now();
    let conn;
    try {
        let systemConfig = _configCache === null || _configCache === void 0 ? void 0 : _configCache.data;
        // 1. Resolve System Config (Cache or DB)
        if (_configCache && (now - _configCache.timestamp) < CONFIG_CACHE_TTL) {
            req.systemConfig = systemConfig;
        }
        else {
            conn = yield (0, db_1.getConnection)();
            const [configRows] = yield conn.query('SELECT config FROM system_config LIMIT 1');
            const configData = configRows[0];
            if (configData && configData.config) {
                systemConfig = typeof configData.config === 'string'
                    ? JSON.parse(configData.config)
                    : configData.config;
                req.systemConfig = systemConfig;
                _configCache = { data: systemConfig, timestamp: now };
            }
        }
        // If system config failed to load entirely, block request to prevent downstream faults
        if (!req.systemConfig) {
            console.error('❌ System configuration not found in DB.');
            return res.status(500).json({
                error: 'SYSTEM_CONFIG_ERROR',
                message: 'Failed to load system configuration'
            });
        }
        // 2. Resolve User Filter Options & Salesman Context
        if (req.user) {
            const userRole = req.user.role;
            const systemConfig = req.systemConfig;
            const userId = String(req.user.id);
            let salesmanId;
            const cached = _salesmanCache.get(userId);
            if (cached && (now - cached.timestamp) < SALESMAN_CACHE_TTL) {
                salesmanId = cached.salesmanId || undefined;
            }
            else {
                // If connection wasn't opened for config, get one now
                if (!conn) {
                    conn = yield (0, db_1.getConnection)();
                }
                try {
                    const [salesmanRows] = yield conn.query('SELECT id FROM salesmen WHERE userId = ? LIMIT 1', [userId]);
                    const dbSalesmanId = ((_a = salesmanRows[0]) === null || _a === void 0 ? void 0 : _a.id) || null;
                    _salesmanCache.set(userId, { salesmanId: dbSalesmanId, timestamp: now });
                    salesmanId = dbSalesmanId || undefined;
                }
                catch (e) {
                    // Fallback to null (sentinel) in case column/table is missing during migrations
                    _salesmanCache.set(userId, { salesmanId: null, timestamp: now });
                    salesmanId = undefined;
                }
            }
            req.userFilterOptions = {
                userId: userId,
                userName: req.user.username, // Using canonical unique username instead of human-friendly name
                userRole: userRole,
                salesmanId: salesmanId,
                canSeeAll: (0, dataFiltering_1.canSeeAllData)(userRole, systemConfig),
                canModifyOthers: (0, dataFiltering_1.canModifyOthersData)(userRole, systemConfig),
                canSeeSalesmanData: (0, dataFiltering_1.isExemptFromSalesmanIsolation)(userRole, systemConfig)
            };
        }
        // 3. Set Fiscal Year Filter from JWT Token
        const user = req.user;
        if (user === null || user === void 0 ? void 0 : user.fiscalYear) {
            const fy = user.fiscalYear;
            req.fiscalYearFilter = {
                id: fy.id,
                name: fy.name,
                startDate: typeof fy.startDate === 'string' ? fy.startDate.slice(0, 10) : new Date(fy.startDate).toISOString().slice(0, 10),
                endDate: typeof fy.endDate === 'string' ? fy.endDate.slice(0, 10) : new Date(fy.endDate).toISOString().slice(0, 10),
                status: fy.status || 'OPEN'
            };
        }
        else if ((user === null || user === void 0 ? void 0 : user.fiscalYearId) && (user === null || user === void 0 ? void 0 : user.fiscalYearStart) && (user === null || user === void 0 ? void 0 : user.fiscalYearEnd)) {
            const toDateStr = (v) => typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10);
            req.fiscalYearFilter = {
                id: user.fiscalYearId,
                name: user.fiscalYearName || '',
                startDate: toDateStr(user.fiscalYearStart),
                endDate: toDateStr(user.fiscalYearEnd),
                status: user.fiscalYearStatus || 'OPEN'
            };
        }
        // 4. Set Branch Context from JWT Token
        if ((_b = req.user) === null || _b === void 0 ? void 0 : _b.branchId) {
            req.branchContext = {
                branchId: req.user.branchId || null,
                branchName: req.user.branchName || null,
                defaultWarehouseId: req.user.defaultWarehouseId || null,
                defaultWarehouseName: req.user.defaultWarehouseName || null,
                defaultBankId: req.user.defaultBankId || null,
            };
        }
        next();
    }
    catch (error) {
        console.error('❌ Error loading system config:', error);
        return res.status(500).json({
            error: 'SYSTEM_CONFIG_ERROR',
            message: 'Failed to load system configuration'
        });
    }
    finally {
        if (conn) {
            conn.release();
        }
    }
});
exports.loadSystemConfig = loadSystemConfig;
/**
 * Middleware to validate transaction amount.
 * Saves approval status on req and req.body for backwards compatibility.
 */
const validateTransactionAmountMiddleware = (amountField = 'total') => {
    return (req, res, next) => {
        var _a, _b, _c;
        if (!req.user || !req.systemConfig) {
            return next();
        }
        const amount = (_a = req.body) === null || _a === void 0 ? void 0 : _a[amountField];
        if (typeof amount !== 'number') {
            return next();
        }
        const userRole = req.user.role;
        const validation = (0, dataFiltering_1.validateTransactionAmount)(amount, userRole, req.systemConfig);
        if (!validation.allowed) {
            return res.status(403).json({
                error: 'TRANSACTION_LIMIT_EXCEEDED',
                message: validation.reason || 'Transaction amount exceeds your limit',
                limit: ((_c = (_b = req.systemConfig) === null || _b === void 0 ? void 0 : _b.transactionLimits) === null || _c === void 0 ? void 0 : _c[userRole]) || 0
            });
        }
        // Check if approval is needed
        if ((0, dataFiltering_1.needsApproval)(amount, req.systemConfig)) {
            req.approvalRequired = true;
            req.body = Object.assign(Object.assign({}, req.body), { _needsApproval: true, _approvalStatus: 'PENDING' });
        }
        next();
    };
};
exports.validateTransactionAmountMiddleware = validateTransactionAmountMiddleware;
/**
 * Middleware to check if user can modify a record.
 * Restricts modifications to owners (matched by canonical username) or those with modify-all permissions.
 */
const canModifyRecordMiddleware = (getRecordCreator) => {
    return (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        if (!req.user || !req.userFilterOptions) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        try {
            const recordCreator = yield getRecordCreator(req);
            if (!recordCreator) {
                return res.status(404).json({ error: 'Record not found' });
            }
            // Check if user owns the record (stable, unique username check)
            if (recordCreator === req.userFilterOptions.userName) {
                return next();
            }
            // Check if user can modify others' data
            if (!req.userFilterOptions.canModifyOthers) {
                return res.status(403).json({
                    error: 'PERMISSION_DENIED',
                    message: 'You can only modify your own records',
                    recordOwner: recordCreator
                });
            }
            next();
        }
        catch (error) {
            console.error('Error checking record ownership:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });
};
exports.canModifyRecordMiddleware = canModifyRecordMiddleware;
/**
 * Helper to get invoice creator
 */
function getInvoiceCreator(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const invoiceId = req.params.id || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.id);
        if (!invoiceId)
            return null;
        const conn = yield (0, db_1.getConnection)();
        try {
            const [rows] = yield conn.query('SELECT createdBy FROM invoices WHERE id = ? LIMIT 1', [invoiceId]);
            return ((_b = rows[0]) === null || _b === void 0 ? void 0 : _b.createdBy) || null;
        }
        finally {
            conn.release();
        }
    });
}
/**
 * Helper to get journal entry creator
 */
function getJournalCreator(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const journalId = req.params.id || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.id);
        if (!journalId)
            return null;
        const conn = yield (0, db_1.getConnection)();
        try {
            const [rows] = yield conn.query('SELECT createdBy FROM journal_entries WHERE id = ? LIMIT 1', [journalId]);
            return ((_b = rows[0]) === null || _b === void 0 ? void 0 : _b.createdBy) || null;
        }
        finally {
            conn.release();
        }
    });
}
/**
 * Helper to get cheque creator
 */
function getChequeCreator(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const chequeId = req.params.id || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.id);
        if (!chequeId)
            return null;
        const conn = yield (0, db_1.getConnection)();
        try {
            const [rows] = yield conn.query('SELECT createdBy FROM cheques WHERE id = ? LIMIT 1', [chequeId]);
            return ((_b = rows[0]) === null || _b === void 0 ? void 0 : _b.createdBy) || null;
        }
        finally {
            conn.release();
        }
    });
}
/**
 * Middleware for role-based access checking.
 * Fail-secure: Defaults to denying access (level 0) for undefined roles.
 */
const requireMinimumRole = (minRole) => {
    return (req, res, next) => {
        var _a, _b;
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const userRole = req.user.role;
        const roleHierarchy = {
            'MASTER_ADMIN': 5,
            'GENERAL_MANAGER': 4,
            'ADMIN': 4,
            'ACCOUNTANT': 3,
            'SALES': 2,
            'CASHIER': 2,
            'INVENTORY': 1,
            'WAREHOUSE_SUPERVISOR': 1,
            'MAINTENANCE': 1,
            'PURCHASING': 2
        };
        const userLevel = (_a = roleHierarchy[userRole]) !== null && _a !== void 0 ? _a : 0;
        const minLevel = (_b = roleHierarchy[minRole]) !== null && _b !== void 0 ? _b : 99; // Default deny if minRole is invalid
        if (userLevel < minLevel) {
            return res.status(403).json({
                error: 'INSUFFICIENT_ROLE',
                message: `This action requires ${minRole} role or higher`,
                requiredRole: minRole,
                userRole: userRole
            });
        }
        next();
    };
};
exports.requireMinimumRole = requireMinimumRole;
/**
 * Rate limiting helper for failed login attempts
 */
const failedLoginAttempts = new Map();
function trackFailedLogin(username, systemConfig) {
    const security = (0, dataFiltering_1.checkSecurityPolicies)(systemConfig);
    // If not enabled, don't track
    if (security.maxFailedAttempts === 0) {
        return { locked: false };
    }
    const current = failedLoginAttempts.get(username) || { count: 0, lastAttempt: new Date() };
    current.count++;
    current.lastAttempt = new Date();
    failedLoginAttempts.set(username, current);
    const locked = current.count >= security.maxFailedAttempts;
    return {
        locked,
        remainingAttempts: locked ? 0 : security.maxFailedAttempts - current.count
    };
}
function clearFailedLogins(username) {
    failedLoginAttempts.delete(username);
}
function isAccountLocked(username, systemConfig) {
    const security = (0, dataFiltering_1.checkSecurityPolicies)(systemConfig);
    if (security.maxFailedAttempts === 0) {
        return false;
    }
    const attempts = failedLoginAttempts.get(username);
    if (!attempts) {
        return false;
    }
    return attempts.count >= security.maxFailedAttempts;
}
/**
 * Clean up old failed login attempts (run periodically)
 */
function cleanupOldAttempts(maxAgeHours = 24) {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    failedLoginAttempts.forEach((data, username) => {
        if (data.lastAttempt < cutoff) {
            failedLoginAttempts.delete(username);
        }
    });
}
// Clean up every hour
const cleanupAttemptsInterval = setInterval(() => cleanupOldAttempts(24), 60 * 60 * 1000);
// Hook to clear cleanup intervals on testing or shutdown
const closePolicyCleanup = () => {
    clearInterval(cleanupAttemptsInterval);
};
exports.closePolicyCleanup = closePolicyCleanup;
/**
 * Factory that returns a middleware enforcing lock date checks.
 *
 * @param dateExtractor - Function that pulls the transaction date from the request.
 *   Falls back to req.body.date if not provided.
 * @param context - 'GENERAL' (default), 'TAX', or 'ALL'
 *
 * Usage in routes:
 *   router.post('/journals', enforceLockDate(), createJournal);
 *   router.post('/invoices', enforceLockDate(req => req.body.date), createInvoice);
 */
const enforceLockDate = (dateExtractor, context = 'GENERAL') => {
    return (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const txDate = dateExtractor ? dateExtractor(req) : (_a = req.body) === null || _a === void 0 ? void 0 : _a.date;
            if (!txDate)
                return next(); // No date = nothing to check
            const conn = yield (0, db_1.getConnection)();
            try {
                const result = yield (0, lockDateValidator_1.validateDateAgainstLockDates)(conn, txDate, context);
                if (result.isLocked) {
                    return res.status(403).json({
                        error: 'PERIOD_LOCKED',
                        lockType: result.lockType,
                        lockDate: result.lockDate,
                        message: result.message
                    });
                }
                next();
            }
            finally {
                conn.release();
            }
        }
        catch (error) {
            // Lock date check failure should not block the request entirely
            console.error('⚠️ Lock date check failed:', error);
            next();
        }
    });
};
exports.enforceLockDate = enforceLockDate;
