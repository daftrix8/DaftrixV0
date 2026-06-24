"use strict";
/**
 * Data Filtering Utilities
 * Implements user-level data isolation and filtering based on system policies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FILTERABLE_ENTITIES = void 0;
exports.canSeeAllData = canSeeAllData;
exports.canModifyOthersData = canModifyOthersData;
exports.buildUserFilterClause = buildUserFilterClause;
exports.validateTransactionAmount = validateTransactionAmount;
exports.needsApproval = needsApproval;
exports.canModifyRecord = canModifyRecord;
exports.canDeleteRecord = canDeleteRecord;
exports.getUserFilterParams = getUserFilterParams;
exports.escapeSqlString = escapeSqlString;
exports.buildParameterizedFilter = buildParameterizedFilter;
exports.checkSecurityPolicies = checkSecurityPolicies;
exports.hasHigherOrEqualRole = hasHigherOrEqualRole;
exports.shouldFilterEntity = shouldFilterEntity;
exports.hasPermission = hasPermission;
exports.isExemptFromSalesmanIsolation = isExemptFromSalesmanIsolation;
exports.shouldFilterBySalesman = shouldFilterBySalesman;
exports.buildSalesmanFilterClause = buildSalesmanFilterClause;
exports.buildPartnerSalesmanFilter = buildPartnerSalesmanFilter;
exports.buildInvoiceSalesmanFilter = buildInvoiceSalesmanFilter;
exports.getUserSalesmanId = getUserSalesmanId;
/**
 * Determines if a user can see all data based on their role and system configuration
 */
function canSeeAllData(userRole, systemConfig) {
    const role = (userRole || '').toUpperCase();
    // If data isolation is not enabled, everyone can see all data
    if (!(systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.enableUserDataIsolation)) {
        return true;
    }
    // MASTER_ADMIN always sees everything
    if (role === 'MASTER_ADMIN') {
        return true;
    }
    // Check if this role is in the whitelist
    const allowedRoles = (systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.whoCanSeeAllData) || ['MASTER_ADMIN', 'ADMIN', 'GENERAL_MANAGER'];
    const normalizedAllowedRoles = allowedRoles.map(r => r.toUpperCase());
    return normalizedAllowedRoles.includes(role);
}
/**
 * Determines if a user can modify data created by others
 */
function canModifyOthersData(userRole, systemConfig) {
    const role = (userRole || '').toUpperCase();
    // If modify others is not enabled, only creators can modify
    if (!(systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.enableModifyOthersData)) {
        // But MASTER_ADMIN, ADMIN, and GENERAL_MANAGER always can
        return role === 'MASTER_ADMIN' || role === 'ADMIN' || role === 'GENERAL_MANAGER';
    }
    // Check if this role is in the whitelist
    const allowedRoles = (systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.whoCanModifyOthersData) || ['MASTER_ADMIN', 'ADMIN', 'GENERAL_MANAGER'];
    const normalizedAllowedRoles = allowedRoles.map(r => r.toUpperCase());
    return normalizedAllowedRoles.includes(role);
}
/**
 * Builds SQL WHERE clause for filtering data by user.
 * Returns empty string if user can see all data.
 *
 * SECURITY: tableName is validated against an allowlist of known table names
 * to prevent SQL injection. userName uses manual escaping which is fragile —
 * prefer buildParameterizedFilter() for new code.
 *
 * @deprecated Use buildParameterizedFilter() instead — it uses parameterized queries.
 */
// Allowlist of table names that may use this filter
const ALLOWED_FILTER_TABLES = new Set([
    'invoices', 'i', 'journal_entries', 'je', 'cheques', 'c',
    'stock_permits', 'sp', 'partners', 'p', 'products', 'pr',
    'account_transactions', 'at', 'treasury_transactions', 'tt',
    'bank_transactions', 'bt', 'audit_logs', 'al',
]);
function buildUserFilterClause(tableName, options, additionalConditions = '') {
    const { userRole, userName, systemConfig } = options;
    if (!userRole || !userName) {
        return additionalConditions;
    }
    // Check if user can see all data
    if (canSeeAllData(userRole, systemConfig)) {
        return additionalConditions;
    }
    // SECURITY: Validate tableName against allowlist to prevent SQL injection
    if (!ALLOWED_FILTER_TABLES.has(tableName)) {
        console.error(`🔴 [SECURITY] buildUserFilterClause called with unknown table: "${tableName}"`);
        // Fail closed — return a condition that filters everything
        return '1=0';
    }
    // Build filter for user's own data
    // NOTE: Manual escaping is fragile. Use buildParameterizedFilter() for new code.
    const userFilter = `${tableName}.createdBy = '${userName.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
    // Combine with additional conditions
    if (additionalConditions) {
        return `(${userFilter}) AND (${additionalConditions})`;
    }
    return userFilter;
}
/**
 * Validates if user can create a transaction based on amount limits
 */
function validateTransactionAmount(amount, userRole, systemConfig) {
    const normalizedRole = (userRole || '').toUpperCase();
    // MASTER_ADMIN, ADMIN, and GENERAL_MANAGER have no limits
    if (normalizedRole === 'MASTER_ADMIN' || normalizedRole === 'ADMIN' || normalizedRole === 'GENERAL_MANAGER') {
        return { allowed: true };
    }
    // Check if limits are enabled
    if (!(systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.enableTransactionAmountLimit)) {
        return { allowed: true };
    }
    // Get limit for this role
    const limits = systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.transactionLimits;
    let limit = 0;
    switch (normalizedRole) {
        case 'CASHIER':
        case 'SALES':
            limit = (limits === null || limits === void 0 ? void 0 : limits.SALES) || 0;
            break;
        case 'ACCOUNTANT':
            limit = (limits === null || limits === void 0 ? void 0 : limits.ACCOUNTANT) || 0;
            break;
        case 'INVENTORY':
            limit = (limits === null || limits === void 0 ? void 0 : limits.INVENTORY) || 0;
            break;
        case 'WAREHOUSE_SUPERVISOR':
            limit = (limits === null || limits === void 0 ? void 0 : limits.WAREHOUSE_SUPERVISOR) || 0;
            break;
        case 'MAINTENANCE':
            limit = (limits === null || limits === void 0 ? void 0 : limits.MAINTENANCE) || 0;
            break;
        case 'PURCHASING':
            limit = (limits === null || limits === void 0 ? void 0 : limits.PURCHASING) || 0;
            break;
        default:
            limit = 0;
    }
    // If limit is 0, no restriction
    if (limit === 0) {
        return { allowed: true };
    }
    // Check if amount exceeds limit
    if (amount > limit) {
        return {
            allowed: false,
            reason: `Transaction amount (${amount}) exceeds limit (${limit}) for role ${userRole}`
        };
    }
    return { allowed: true };
}
/**
 * Checks if transaction needs approval based on amount
 */
function needsApproval(amount, systemConfig) {
    if (!(systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.requireApprovalForLargeTransactions)) {
        return false;
    }
    const threshold = (systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.largeTransactionThreshold) || 0;
    if (threshold === 0) {
        return false;
    }
    return amount > threshold;
}
/**
 * Validates if user can modify a specific record
 */
function canModifyRecord(recordCreatedBy, currentUser, userRole, systemConfig) {
    // User can always modify their own records
    if (recordCreatedBy === currentUser) {
        return true;
    }
    // Check if user can modify others' data
    return canModifyOthersData(userRole, systemConfig);
}
/**
 * Validates if user can delete a specific record
 */
function canDeleteRecord(recordCreatedBy, currentUser, userRole, systemConfig) {
    // Use same logic as modify for now
    // Can be extended with separate permissions in the future
    return canModifyRecord(recordCreatedBy, currentUser, userRole, systemConfig);
}
/**
 * Gets user filter parameters for queries
 */
function getUserFilterParams(options) {
    const { userRole, userName, systemConfig } = options;
    if (!userRole || !userName) {
        return { shouldFilter: false };
    }
    const shouldFilter = !canSeeAllData(userRole, systemConfig);
    return {
        shouldFilter,
        createdBy: shouldFilter ? userName : undefined
    };
}
/**
 * Helper to safely escape SQL strings
 */
function escapeSqlString(value) {
    return value.replace(/'/g, "''");
}
/**
 * Builds parameterized query filter
 */
function buildParameterizedFilter(options) {
    const { userRole, userName, systemConfig, canSeeAll } = options;
    if (!userRole || !userName) {
        return { clause: '', params: [] };
    }
    const effectiveCanSeeAll = canSeeAll !== undefined
        ? canSeeAll
        : canSeeAllData(userRole, systemConfig);
    if (effectiveCanSeeAll) {
        return { clause: '', params: [] };
    }
    return {
        clause: 'createdBy = ?',
        params: [userName]
    };
}
/**
 * Checks security policies for a user
 */
function checkSecurityPolicies(systemConfig) {
    return {
        maxFailedAttempts: (systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.maxFailedLoginAttempts) || 0,
        sessionTimeoutMinutes: (systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.sessionTimeoutMinutes) || 0,
        logFailedAttempts: (systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.logFailedAccessAttempts) || false
    };
}
/**
 * Role hierarchy check - useful for permission checks
 */
function hasHigherOrEqualRole(userRole, requiredRole) {
    const uRole = (userRole || '').toUpperCase();
    const reqRole = (requiredRole || '').toUpperCase();
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
    return roleHierarchy[uRole] >= roleHierarchy[reqRole];
}
/**
 * Get all entities that should be filtered by user
 */
exports.FILTERABLE_ENTITIES = [
    'invoices',
    'journal_entries',
    'cheques',
    'stock_permits',
    'partners', // Will need createdBy column added
    'products' // Will need createdBy column added
];
/**
 * Check if an entity should be filtered
 */
function shouldFilterEntity(entityName) {
    return exports.FILTERABLE_ENTITIES.includes(entityName);
}
/**
 * Role-based default permissions (mirrors authMiddleware.ts ROLE_DEFAULT_PERMISSIONS)
 * Ensures hasPermission() is consistent across all server-side permission checks.
 */
// Role defaults intentionally empty — permissions managed entirely via admin UI
const SERVER_ROLE_DEFAULTS = {};
/**
 * Checks if a user has a specific permission
 */
function hasPermission(user, permissionId) {
    if (!user)
        return false;
    // Admin bypass — only true system admins get unconditional access.
    // GENERAL_MANAGER is intentionally excluded: their permissions are
    // managed via the admin UI (see SERVER_ROLE_DEFAULTS comment above).
    if (user.role === 'ADMIN' || user.role === 'MASTER_ADMIN')
        return true;
    const permissions = user.permissions || [];
    if (permissions.includes(permissionId) || permissions.includes('all'))
        return true;
    // Check role-based default permissions
    const role = (user.role || '').toUpperCase();
    const roleDefaults = SERVER_ROLE_DEFAULTS[role];
    if (roleDefaults === null || roleDefaults === void 0 ? void 0 : roleDefaults.includes(permissionId))
        return true;
    return false;
}
// ============================================
// SALESMAN DATA ISOLATION (عزل بيانات المندوبين)
// ============================================
/**
 * Check if a user's role is exempt from salesman isolation
 */
function isExemptFromSalesmanIsolation(userRole, systemConfig) {
    var _a, _b;
    // If salesman isolation is not enabled, everyone is exempt
    if (!((_a = systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.salesmanIsolation) === null || _a === void 0 ? void 0 : _a.enabled)) {
        return true;
    }
    // MASTER_ADMIN is always exempt
    if (userRole === 'MASTER_ADMIN') {
        return true;
    }
    // Check if this role is in the exempt list
    const exemptRoles = ((_b = systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.salesmanIsolation) === null || _b === void 0 ? void 0 : _b.exemptRoles) || ['MASTER_ADMIN', 'ADMIN', 'GENERAL_MANAGER'];
    return exemptRoles.includes(userRole);
}
/**
 * Determines if data should be filtered by salesman for a user
 */
function shouldFilterBySalesman(options, entityType) {
    var _a;
    const { userRole, salesmanId, systemConfig } = options;
    // No role or config means no filtering
    if (!userRole || !((_a = systemConfig === null || systemConfig === void 0 ? void 0 : systemConfig.salesmanIsolation) === null || _a === void 0 ? void 0 : _a.enabled)) {
        return false;
    }
    // If user is exempt, no filtering
    if (isExemptFromSalesmanIsolation(userRole, systemConfig)) {
        return false;
    }
    // If user has no linked salesman, they see nothing (or everything based on config)
    if (!salesmanId) {
        return false; // Let them see all - they're not a salesman
    }
    // Check if this entity type should be filtered
    switch (entityType) {
        case 'partners':
            return systemConfig.salesmanIsolation.filterPartners !== false;
        case 'invoices':
            return systemConfig.salesmanIsolation.filterInvoices !== false;
        case 'collections':
            return systemConfig.salesmanIsolation.filterCollections !== false;
        default:
            return false;
    }
}
/**
 * Build SQL WHERE clause for salesman filtering
 */
function buildSalesmanFilterClause(options, entityType, tableName = '') {
    const { salesmanId } = options;
    if (!shouldFilterBySalesman(options, entityType)) {
        return { clause: '', params: [] };
    }
    const prefix = tableName ? `${tableName}.` : '';
    return {
        clause: `${prefix}salesmanId = ?`,
        params: [salesmanId]
    };
}
/**
 * Build complete filter for partners (customers/suppliers)
 * Filters by the assigned salesman
 */
function buildPartnerSalesmanFilter(options) {
    return buildSalesmanFilterClause(options, 'partners', 'p');
}
/**
 * Build complete filter for invoices
 * Filters by the salesman who created the invoice OR the partner's salesman
 */
function buildInvoiceSalesmanFilter(options) {
    const { salesmanId, userRole, systemConfig } = options;
    if (!shouldFilterBySalesman(options, 'invoices')) {
        return { clause: '', params: [] };
    }
    // For invoices, filter by invoice's salesmanId OR partner's salesmanId
    return {
        clause: `(i.salesmanId = ? OR i.partnerId IN (SELECT id FROM partners WHERE salesmanId = ?))`,
        params: [salesmanId, salesmanId]
    };
}
/**
 * Get salesman ID from user data
 */
function getUserSalesmanId(user) {
    return user === null || user === void 0 ? void 0 : user.salesmanId;
}
