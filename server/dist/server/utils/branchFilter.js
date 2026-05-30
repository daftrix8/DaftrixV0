"use strict";
/**
 * Branch Filtering Utility
 *
 * Centralized helpers for multi-branch data isolation.
 * Every controller that touches branch-scoped data should use these
 * instead of re-implementing the logic.
 *
 * Design:
 *   - Privileged roles (ADMIN, SUPER_ADMIN, MASTER_ADMIN, MANAGER, GENERAL_MANAGER)
 *     bypass branch filtering and see ALL data.
 *   - Non-privileged users (CASHIER, SALES, ACCOUNTANT, etc.) see only data
 *     belonging to their assigned branch.
 *   - Records with branchId = NULL are visible to everyone (legacy/shared data).
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
exports.resolveBranchScope = resolveBranchScope;
exports.appendBranchFilter = appendBranchFilter;
exports.resolveBranchIdForWrite = resolveBranchIdForWrite;
exports.getBranchWarehouseIds = getBranchWarehouseIds;
exports.appendWarehouseBranchFilter = appendWarehouseBranchFilter;
exports.resolveBranchCashAccount = resolveBranchCashAccount;
const PRIVILEGED_ROLES = ['ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN', 'MANAGER', 'GENERAL_MANAGER'];
/**
 * Resolves the branch scope from the request.
 * Returns the user's branchId and whether they are privileged.
 */
function resolveBranchScope(req) {
    var _a, _b;
    const userRole = (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) || '').toUpperCase();
    const isPrivileged = PRIVILEGED_ROLES.includes(userRole);
    const branchId = ((_b = req.branchContext) === null || _b === void 0 ? void 0 : _b.branchId) || null;
    return { branchId, isPrivileged };
}
/**
 * Appends branch filtering to a SQL WHERE clause.
 *
 * For privileged users: no filter added (they see everything).
 * For branch users: adds `(alias.branchId = ? OR alias.branchId IS NULL)`.
 * The OR NULL clause ensures legacy records without branch assignment remain visible.
 *
 * @param conditions - Mutable array of WHERE conditions to append to
 * @param params - Mutable array of query parameters
 * @param req - The enhanced auth request
 * @param alias - Table alias or name for the branchId column (default: no prefix)
 */
function appendBranchFilter(conditions, params, req, alias) {
    const { branchId, isPrivileged } = resolveBranchScope(req);
    if (isPrivileged || !branchId)
        return;
    const col = alias ? `${alias}.branchId` : 'branchId';
    conditions.push(`(${col} = ? OR ${col} IS NULL)`);
    params.push(branchId);
}
/**
 * Returns the branchId to stamp on new records.
 * Priority: explicit body value > branchContext > null (shared/unassigned)
 */
function resolveBranchIdForWrite(req, explicitBranchId) {
    var _a;
    if (explicitBranchId)
        return explicitBranchId;
    return ((_a = req.branchContext) === null || _a === void 0 ? void 0 : _a.branchId) || null;
}
/**
 * Returns the list of warehouse IDs that belong to the user's branch.
 * Privileged users get null (meaning "all warehouses").
 *
 * Useful for stock/inventory queries where filtering is by warehouseId, not branchId.
 *
 * @param conn - Active DB connection
 * @param req - The enhanced auth request
 * @returns Array of warehouse IDs, or null if user sees all
 */
function getBranchWarehouseIds(conn, req) {
    return __awaiter(this, void 0, void 0, function* () {
        const { branchId, isPrivileged } = resolveBranchScope(req);
        if (isPrivileged || !branchId)
            return null;
        const [rows] = yield conn.query('SELECT id FROM warehouses WHERE branchId = ?', [branchId]);
        return rows.map((r) => r.id);
    });
}
/**
 * Appends warehouse-based branch filtering to a SQL WHERE clause.
 * Used for tables that don't have branchId directly but reference warehouseId.
 *
 * @param conditions - Mutable array of WHERE conditions
 * @param params - Mutable array of query parameters
 * @param conn - Active DB connection (needed to resolve branch → warehouse mapping)
 * @param req - The enhanced auth request
 * @param warehouseCol - Column name for warehouseId (default: 'warehouseId')
 */
function appendWarehouseBranchFilter(conditions_1, params_1, conn_1, req_1) {
    return __awaiter(this, arguments, void 0, function* (conditions, params, conn, req, warehouseCol = 'warehouseId') {
        const warehouseIds = yield getBranchWarehouseIds(conn, req);
        if (!warehouseIds)
            return; // privileged or no branch
        if (warehouseIds.length === 0) {
            // User has a branch but no warehouses — show nothing
            conditions.push('1 = 0');
            return;
        }
        conditions.push(`${warehouseCol} IN (?)`);
        params.push(warehouseIds);
    });
}
/**
 * Resolves the GL cash account for the user's branch treasury.
 *
 * Priority:
 *   1. branchContext.defaultBankId → bank.accountId → GL account
 *   2. Fallback: legacy `code LIKE '101%'` (for installs without branches)
 *
 * This eliminates scattered `code LIKE '101%'` queries across controllers
 * and ensures each branch hits its own treasury GL account.
 */
function resolveBranchCashAccount(conn, req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const defaultBankId = (_a = req.branchContext) === null || _a === void 0 ? void 0 : _a.defaultBankId;
        if (defaultBankId) {
            // Branch has a default treasury — resolve its linked GL account
            const [bankRows] = yield conn.query('SELECT accountId FROM banks WHERE id = ? LIMIT 1', [defaultBankId]);
            const accountId = (_b = bankRows[0]) === null || _b === void 0 ? void 0 : _b.accountId;
            if (accountId) {
                const [accRows] = yield conn.query('SELECT id, name FROM accounts WHERE id = ? LIMIT 1', [accountId]);
                if (accRows[0])
                    return accRows[0];
            }
        }
        // Fallback: legacy global resolution (no branch configured)
        const [fallbackRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '101%' LIMIT 1`);
        if (fallbackRows[0])
            return fallbackRows[0];
        // Last resort: search by Arabic name
        const [nameRows] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%خزينة%' OR name LIKE '%صندوق%' LIMIT 1`);
        return nameRows[0] || null;
    });
}
