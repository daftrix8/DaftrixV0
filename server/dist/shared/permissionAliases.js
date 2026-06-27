"use strict";
// ═══════════════════════════════════════════════════════════
// PERMISSION ALIASES — Single source of truth
// Imported by BOTH server (authMiddleware.ts) and frontend (auth.ts).
// Format: { requiredPermission: [alternativePermissions] }
// ═══════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.REVERSE_ALIASES = exports.PERMISSION_ALIASES = void 0;
exports.clearPermissionCaches = clearPermissionCaches;
exports.expandRequiredPermission = expandRequiredPermission;
exports.hasPermissionWithAliases = hasPermissionWithAliases;
exports.expandUserPermissions = expandUserPermissions;
exports.PERMISSION_ALIASES = {
    // ── Van Sales Settlements ──
    'vansales.settlements.view': ['vansales.settlements', 'vansales.settlement', 'vansales.view'],
    'vansales.settlements.create': ['vansales.settlements', 'vansales.settlement'],
    'vansales.settlement': ['vansales.settlements'],
    'vansales.settlements': ['vansales.settlement'],
    // ── BOM ──
    'bom.view': ['manufacturing.bom', 'manufacturing.bom.view'],
    'bom.create': ['manufacturing.bom', 'manufacturing.bom.create'],
    'bom.edit': ['manufacturing.bom', 'manufacturing.bom.edit'],
    'bom.delete': ['manufacturing.bom', 'manufacturing.bom.delete'],
    'bom.copy': ['bom.edit'],
    'bom.costing': ['bom.view'],
    'manufacturing.bom.view': ['manufacturing.bom'],
    'manufacturing.bom.create': ['manufacturing.bom'],
    'manufacturing.bom.edit': ['manufacturing.bom'],
    'manufacturing.bom.delete': ['manufacturing.bom'],
    // ── Production / Manufacturing Orders ──
    'manufacturing.orders.view': ['manufacturing.production', 'production.view'],
    'manufacturing.orders.create': ['manufacturing.production', 'production.create'],
    'manufacturing.orders.edit': ['manufacturing.production', 'production.edit'],
    'manufacturing.orders.delete': ['manufacturing.production', 'production.delete'],
    'manufacturing.orders.start': ['manufacturing.production', 'production.start'],
    'manufacturing.orders.complete': ['manufacturing.production', 'production.complete'],
    'manufacturing.orders.cancel': ['manufacturing.production', 'production.cancel'],
    'production.view': ['manufacturing.production', 'manufacturing.orders.view'],
    'production.create': ['manufacturing.production', 'manufacturing.orders.create'],
    'production.edit': ['manufacturing.production', 'manufacturing.orders.edit'],
    'production.delete': ['manufacturing.production', 'manufacturing.orders.delete'],
    'production.start': ['manufacturing.production', 'manufacturing.orders.start'],
    'production.complete': ['manufacturing.production', 'manufacturing.orders.complete'],
    'production.cancel': ['manufacturing.production', 'manufacturing.orders.cancel'],
    'production.issue_materials': ['manufacturing.production', 'manufacturing.orders.edit'],
    'production.receive_finished': ['manufacturing.production', 'manufacturing.orders.complete'],
    // ── POS ──
    'pos.validate': ['pos.close_shift'],
    'pos.close_shift': ['pos.shifts.close'],
    'pos.shifts.view': ['pos.shifts.manage'],
    'pos.shifts.open': ['pos.shifts.manage'],
    'pos.shifts.close': ['pos.shifts.manage'],
    'pos.shifts.edit': ['pos.shifts.manage'],
    'pos.shifts.delete': ['pos.sessions.delete', 'pos.shifts.manage'],
    'pos.settings.devices': ['pos.devices.manage'],
    'pos.reports.view': ['pos.reports'],
    'pos.screen.view': ['pos.access'],
    'pos.screen.sale': ['pos.access'],
    // ── KB ──
    'kb.view': ['crm.view', 'crm.pipeline.view', 'crm.leads.view'],
    'kb.manage': ['crm.manage'],
    // ── Inventory ──
    'inventory.stock_taking.view': ['inventory.stock_taking'],
    'inventory.stock_taking.create': ['inventory.stock_taking', 'inventory.manage'],
    'inventory.stock_taking.edit': ['inventory.stock_taking'],
    'inventory.stock_taking.delete': ['inventory.stock_taking'],
    'master.products.view': ['inventory.manage_products'],
    'master.products.create': ['inventory.manage_products'],
    'master.products.edit': ['inventory.manage_products'],
    'master.products.delete': ['inventory.manage_products'],
    'inventory.serial_log.view': ['inventory.serial_tracking'],
    'inventory.serial_reports.view': ['inventory.serial_tracking'],
    'inventory.balance.view': ['inventory.view'],
    'inventory.movement.view': ['inventory.view'],
    'inventory.movement_report.view': ['inventory.view'],
    'inventory.value.view': ['inventory.view', 'inventory.view_value'],
    'inventory.shortages.view': ['inventory.view'],
    'inventory.queries.view': ['inventory.view'],
    'inventory.group_balance.view': ['inventory.view'],
    'inventory.item_profit.view': ['inventory.view'],
    'inventory.supplier_stock.view': ['inventory.view'],
    'inventory.receipt.create': ['inventory.manage', 'inventory.permit_in'],
    'inventory.release.create': ['inventory.manage', 'inventory.permit_out'],
    'inventory.transfer.create': ['inventory.manage', 'inventory.transfer'],
    'inventory.adjustment.create': ['inventory.manage', 'inventory.adjustment'],
    // Legacy inventory permissions
    'inventory.barcode.view': ['inventory.barcode'],
    'inventory.transfer.view': ['inventory.transfer'],
    'inventory.transfer.edit': ['inventory.transfer'],
    'inventory.transfer.delete': ['inventory.transfer'],
    'inventory.receipt.view': ['inventory.permit_in'],
    'inventory.receipt.edit': ['inventory.permit_in'],
    'inventory.receipt.delete': ['inventory.permit_in'],
    'inventory.release.view': ['inventory.permit_out'],
    'inventory.release.edit': ['inventory.permit_out'],
    'inventory.release.delete': ['inventory.permit_out'],
    // ── Treasury ──
    'banks.cheques.view': ['treasury.cheques'],
    'banks.cheques.create': ['treasury.cheques'],
    'banks.cheques.edit': ['treasury.cheques'],
    'banks.cheques.delete': ['treasury.cheques'],
    'treasury.currency.view': ['treasury.currency', 'treasury.manage'],
    'treasury.currency.create': ['treasury.currency'],
    'treasury.currency.edit': ['treasury.currency'],
    'treasury.currency.delete': ['treasury.currency'],
    'treasury.installments.view': ['treasury.installments', 'treasury.manage'],
    'treasury.installments.create': ['treasury.installments'],
    'treasury.installments.edit': ['treasury.installments'],
    'treasury.installments.delete': ['treasury.installments'],
    'treasury.receipt.view': ['treasury.receipt', 'treasury.manage', 'treasury.view'],
    'treasury.receipt.create': ['treasury.receipt', 'treasury.manage', 'treasury.receipts.create'],
    'treasury.receipt.edit': ['treasury.receipt', 'treasury.receipts.edit'],
    'treasury.receipt.delete': ['treasury.receipt'],
    'treasury.payment.view': ['treasury.payment', 'treasury.manage', 'treasury.view'],
    'treasury.payment.create': ['treasury.payment', 'treasury.manage', 'treasury.payments.create'],
    'treasury.payment.edit': ['treasury.payment', 'treasury.payments.edit'],
    'treasury.payment.delete': ['treasury.payment'],
    'treasury.receipts.create': ['treasury.receipt.create', 'treasury.receipt', 'treasury.manage', 'customers.payments', 'customers.receipts.view'],
    'treasury.receipts.edit': ['treasury.receipt.edit', 'treasury.receipt', 'treasury.manage', 'customers.payments', 'customers.receipts.view'],
    'treasury.payments.create': ['treasury.payment.create', 'treasury.payment', 'treasury.manage', 'suppliers.payments', 'suppliers.payments.view'],
    'treasury.payments.edit': ['treasury.payment.edit', 'treasury.payment', 'treasury.manage', 'suppliers.payments', 'suppliers.payments.view'],
    'treasury.expenses.view': ['treasury.manage'],
    'treasury.expenses.create': ['treasury.manage'],
    'treasury.cash_register.view': ['treasury.manage'],
    'treasury.cash_register.create': ['treasury.manage'],
    'treasury.payment': ['treasury.manage', 'treasury.view'],
    'treasury.receipt': ['treasury.manage', 'treasury.view'],
    'treasury.quick_expenses.view': ['treasury.manage'],
    'treasury.journal.view': ['treasury.view'],
    'treasury.report.view': ['treasury.view'],
    'treasury.receipts_payments_log.view': ['treasury.view'],
    'treasury.denomination.view': ['treasury.view'],
    'treasury.monthly_profit.view': ['treasury.view', 'reports.financial'],
    'treasury.profit_analysis.view': ['treasury.view', 'reports.financial'],
    'treasury.daily_report.view': ['treasury.view'],
    'treasury.branch_profit.view': ['treasury.view'],
    'treasury.history.view': ['treasury.view'],
    'treasury.safes.view': ['treasury.view'],
    'treasury.branch_report.view': ['treasury.view'],
    // ── Accounting ──
    'accounting.cost_centers.view': ['accounting.cost_centers', 'accounting.view'],
    'accounting.cost_centers.create': ['accounting.cost_centers'],
    'accounting.cost_centers.edit': ['accounting.cost_centers'],
    'accounting.cost_centers.delete': ['accounting.cost_centers'],
    'accounting.fixed_assets.view': ['accounting.fixed_assets', 'accounting.view', 'accounting.assets.view', 'accounting.assets'],
    'accounting.fixed_assets.create': ['accounting.fixed_assets'],
    'accounting.fixed_assets.edit': ['accounting.fixed_assets'],
    'accounting.fixed_assets.delete': ['accounting.fixed_assets'],
    'accounting.journal.view': ['accounting.journal', 'accounting.journal_entry', 'accounting.view'],
    'accounting.journal.create': ['accounting.journal', 'accounting.journal_entry', 'accounting.manage'],
    'accounting.journal.edit': ['accounting.journal', 'accounting.journal_entry'],
    'accounting.journal.delete': ['accounting.journal', 'accounting.journal_entry'],
    'accounting.statements.view': ['accounting.view'],
    'accounting.smart_match.view': ['accounting.view'],
    'accounting.ledger.view': ['accounting.view'],
    'accounting.chart.view': ['accounting.view'],
    'accounting.trial_balance.view': ['accounting.view', 'reports.financial'],
    'accounting.balance_sheet.view': ['accounting.view', 'reports.financial'],
    'accounting.income_statement.view': ['accounting.view', 'reports.financial'],
    'accounting.chart.create': ['accounting.manage'],
    'accounting.chart.edit': ['accounting.manage'],
    'accounting.chart.delete': ['accounting.manage'],
    'accounting.close_year': ['accounting.manage'],
    // ── HR ──
    'hr.advances.view': ['hr.advances', 'hr.view'],
    'hr.advances.create': ['hr.advances'],
    'hr.advances.edit': ['hr.advances'],
    'hr.advances.delete': ['hr.advances'],
    'hr.advance_statement.view': ['hr.advances'],
    'hr.attendance.view': ['hr.attendance', 'hr.view'],
    'hr.attendance.create': ['hr.attendance'],
    'hr.attendance.edit': ['hr.attendance'],
    'hr.attendance.delete': ['hr.attendance'],
    'hr.payroll.view': ['hr.payroll', 'hr.view'],
    'hr.payroll.create': ['hr.payroll'],
    'hr.payroll.edit': ['hr.payroll'],
    'hr.leave.view': ['hr.leave', 'hr.view'],
    'hr.leave.create': ['hr.leave'],
    'hr.leave.edit': ['hr.leave'],
    'hr.leave.delete': ['hr.leave'],
    'hr.gl_mappings.view': ['hr.gl_mappings', 'hr.view'],
    'hr.gl_mappings.edit': ['hr.gl_mappings', 'hr.manage'],
    'hr.salary_items.view': ['hr.salary_structures', 'hr.manage'],
    'hr.salary_items.create': ['hr.salary_structures', 'hr.manage'],
    'hr.salary_items.edit': ['hr.salary_structures'],
    'hr.salary_items.delete': ['hr.salary_structures'],
    'hr.employees.view': ['hr.view'],
    'hr.biometric.view': ['hr.view', 'hr.manage', 'hr.attendance'],
    'hr.smart_register.view': ['hr.view', 'hr.manage', 'hr.attendance'],
    'hr.documents.view': ['hr.view'],
    'hr.training.view': ['hr.view', 'hr.training', 'hr.manage'],
    'hr.training': ['hr.view', 'hr.manage'],
    'hr.employees.create': ['hr.manage'],
    'hr.employees.edit': ['hr.manage'],
    'hr.employees.delete': ['hr.manage'],
    'hr.biometric.edit': ['hr.manage', 'hr.attendance'],
    'hr.smart_register.edit': ['hr.manage', 'hr.attendance'],
    'hr.documents.create': ['hr.manage'],
    'hr.documents.edit': ['hr.manage'],
    'hr.training.manage': ['hr.manage', 'hr.training'],
    'hr.training.report': ['hr.manage', 'hr.training'],
    // ── Sales Team ──
    'salesteam.commissions.view': ['salesteam.commissions'],
    'salesteam.commissions.create': ['salesteam.commissions'],
    'salesteam.commissions.edit': ['salesteam.commissions'],
    'salesteam.commission_report.view': ['salesteam.commissions'],
    'salesteam.targets.view': ['salesteam.targets'],
    'salesteam.targets.create': ['salesteam.targets'],
    'salesteam.targets.edit': ['salesteam.targets'],
    'salesteam.targets.delete': ['salesteam.targets'],
    'salesteam.dashboard.view': ['salesteam.view'],
    'salesteam.performance.view': ['salesteam.view'],
    'salesteam.returns.view': ['salesteam.view'],
    'salesteam.customers.view': ['salesteam.view'],
    'master.salesmen.view': ['master.salesmen'],
    'master.salesmen.create': ['master.salesmen'],
    'master.salesmen.edit': ['master.salesmen'],
    'master.salesmen.delete': ['master.salesmen'],
    'salesteam.customers.edit': ['master.salesmen'],
    // ── CRM ──
    'crm.pipeline.view': ['crm.view', 'crm.manage'],
    'crm.leads.view': ['crm.view', 'crm.manage'],
    'crm.activities.view': ['crm.view', 'crm.manage'],
    'crm.complaints.view': ['crm.view', 'crm.manage', 'pos.access'],
    'crm.complaints.create': ['crm.create', 'crm.manage', 'pos.access'],
    'crm.complaints.edit': ['crm.edit', 'crm.manage'],
    'crm.complaints.delete': ['crm.delete', 'crm.manage'],
    'crm.leads.create': ['crm.create', 'crm.manage'],
    'crm.activities.create': ['crm.create', 'crm.manage'],
    'crm.leads.edit': ['crm.edit', 'crm.manage'],
    'crm.activities.edit': ['crm.edit', 'crm.manage'],
    'crm.pipeline.edit': ['crm.edit', 'crm.manage'],
    'crm.leads.delete': ['crm.delete', 'crm.manage'],
    'crm.activities.delete': ['crm.delete', 'crm.manage'],
    'crm.convert': ['crm.manage'],
    'crm.view': ['crm.pipeline.view', 'crm.leads.view', 'crm.activities.view', 'crm.complaints.view'],
    'crm.create': ['crm.leads.create', 'crm.activities.create', 'crm.complaints.create'],
    'crm.edit': ['crm.leads.edit', 'crm.activities.edit', 'crm.pipeline.edit', 'crm.complaints.edit'],
    'crm.delete': ['crm.leads.delete', 'crm.activities.delete', 'crm.complaints.delete'],
    // ── Van Sales (expanded) ──
    'vansales.routes.view': ['vansales.routes', 'vansales.view'],
    'vansales.routes.create': ['vansales.routes'],
    'vansales.routes.edit': ['vansales.routes'],
    'vansales.routes.delete': ['vansales.routes'],
    'vansales.visits.view': ['vansales.visits', 'vansales.view'],
    'vansales.visits.create': ['vansales.visits'],
    'vansales.vehicle_inventory.view': ['vansales.inventory', 'vansales.manage', 'vansales.view'],
    'vansales.vehicle_inventory.create': ['vansales.inventory', 'vansales.manage'],
    'vansales.reports.view': ['vansales.reports', 'vansales.view'],
    'vansales.vehicles.view': ['vansales.manage', 'vansales.view'],
    'vansales.vehicles.create': ['vansales.manage'],
    'vansales.vehicles.edit': ['vansales.manage'],
    'vansales.vehicles.delete': ['vansales.manage'],
    'vansales.operations.view': ['vansales.manage', 'vansales.view'],
    'vansales.operations.create': ['vansales.manage'],
    'vansales.operations.edit': ['vansales.manage'],
    'vansales.dashboard.view': ['vansales.view'],
    // ── Settings / System ──
    'settings.general.view': ['system.settings', 'settings.view'],
    'settings.general.edit': ['system.settings', 'settings.edit'],
    'settings.users.view': ['system.users'],
    'settings.users.create': ['system.users'],
    'settings.users.edit': ['system.users'],
    'settings.users.delete': ['system.users'],
    'settings.permissions.view': ['system.users'],
    'settings.permissions.edit': ['system.users'],
    'settings.audit.view': ['audit.view'],
    'settings.backup.view': ['backup.manage'],
    'settings.backup.create': ['backup.manage'],
    'settings.backup.restore': ['backup.restore'],
    'settings.migration.view': ['migration.view', 'migration.database'],
    'settings.migration.import': ['migration.import', 'migration.database'],
    'settings.migration.export': ['migration.database'],
    // ── Pricelist (ceramics) ──
    'master.price_lists.view': ['pricelist.view'],
    'master.price_lists.create': ['pricelist.create'],
    'master.price_lists.edit': ['pricelist.edit'],
    'master.price_lists.delete': ['pricelist.delete'],
    // ── Manufacturing Advanced ──
    'routing.view': ['manufacturing.view', 'manufacturing.master.view'],
    'routing.create': ['manufacturing.manage', 'manufacturing.master.edit'],
    'routing.edit': ['manufacturing.manage', 'manufacturing.master.edit'],
    'routing.delete': ['manufacturing.manage', 'manufacturing.master.edit'],
    'workcenter.view': ['manufacturing.view', 'manufacturing.master.view'],
    'workcenter.create': ['manufacturing.manage', 'manufacturing.master.edit'],
    'workcenter.edit': ['manufacturing.manage', 'manufacturing.master.edit'],
    'workcenter.delete': ['manufacturing.manage', 'manufacturing.master.edit'],
    'capacity.view': ['manufacturing.view', 'manufacturing.master.view'],
    'mrp.view': ['manufacturing.view', 'manufacturing.orders.view'],
    'mrp.calculate': ['manufacturing.manage', 'manufacturing.orders.create'],
    'mrp.generate_orders': ['manufacturing.manage', 'manufacturing.orders.create'],
    'quality.view': ['manufacturing.view'],
    'quality.create': ['manufacturing.manage'],
    'quality.approve': ['manufacturing.manage'],
    'quality.templates': ['manufacturing.manage', 'manufacturing.master.edit'],
    'quality.reports': ['manufacturing.view', 'manufacturing.movement_report.view'],
    'scrap.view': ['manufacturing.view', 'inventory.balance.view'],
    'scrap.create': ['manufacturing.manage', 'inventory.adjustment.create'],
    'scrap.approve': ['manufacturing.manage'],
    'scrap.reports': ['manufacturing.view', 'manufacturing.movement_report.view'],
    // ── Additional Mismatches / Parent Aliases ──
    'invoices.quotation.view': ['sales.view', 'sales.quotations.view'],
    'invoices.sales.view': ['sales.view'],
    'invoices.sales_return.view': ['sales.view'],
    'invoices.reports.view': ['sales.view'],
    'invoices.returns_analysis.view': ['sales.view'],
    'invoices.item_by_customer.view': ['sales.view'],
    'invoices.deleted.view': ['sales.view'],
    'invoices.purchase.view': ['purchase.view'],
    'invoices.purchase_return.view': ['purchase.view'],
    'suppliers.payments.view': ['suppliers.view'],
    'suppliers.statement.view': ['suppliers.view'],
    'suppliers.balances.view': ['suppliers.view'],
    'suppliers.discount.view': ['suppliers.view'],
    'suppliers.analysis.view': ['suppliers.view'],
    'suppliers.profit_report.view': ['suppliers.view'],
    'suppliers.pricing.view': ['suppliers.view'],
    'suppliers.purchase_analysis.view': ['suppliers.view'],
    'suppliers.purchase_profit.view': ['suppliers.view'],
    'suppliers.update_prices.view': ['suppliers.view'],
    'customers.receipts.view': ['customers.view'],
    'customers.statement.view': ['customers.view'],
    'customers.balances.view': ['customers.view'],
    'customers.prices.view': ['customers.view'],
    'customers.discount.view': ['customers.view'],
    'system.settings': ['admin.reset'],
    'users.view': ['system.users'],
    'users.create': ['system.users'],
    'users.edit': ['system.users'],
    'users.delete': ['system.users'],
    'permissions.view': ['system.users'],
    'permissions.create': ['system.users'],
    'permissions.edit': ['system.users'],
    'permissions.delete': ['system.users'],
    'permissions.seed': ['system.users'],
    // ── Quotations Naming Drift ──
    'invoices.quotation.create': ['sales.quotations.create'],
    'sales.create': ['sales.quotations.create'],
    'invoices.quotation.edit': ['sales.quotations.edit'],
    'sales.edit': ['sales.quotations.edit'],
    'invoices.quotation.delete': ['sales.quotations.delete'],
    'sales.delete': ['sales.quotations.delete'],
    'sales.view': ['sales.quotations.view'],
};
/**
 * @deprecated Deprecated in favor of transitive required permission expansion.
 * Kept empty for backward compatibility with external imports.
 */
exports.REVERSE_ALIASES = {};
// In-memory cache for memoized permission lookups
const _requiredPermissionsCache = new Map();
// In-memory cache for inverted alias mappings
let _invertedAliasesCache = null;
/**
 * Clears the internal permission caches.
 * Useful in development hot-reloading and unit tests.
 */
function clearPermissionCaches() {
    _requiredPermissionsCache.clear();
    _invertedAliasesCache = null;
}
/**
 * Inverts the PERMISSION_ALIASES mapping.
 * Maps granting permissions to the permissions they satisfy.
 */
function getInvertedAliases() {
    if (_invertedAliasesCache)
        return _invertedAliasesCache;
    const inverted = new Map();
    for (const [required, grantingList] of Object.entries(exports.PERMISSION_ALIASES)) {
        for (const granting of grantingList) {
            if (!inverted.has(granting)) {
                inverted.set(granting, new Set());
            }
            inverted.get(granting).add(required);
        }
    }
    _invertedAliasesCache = inverted;
    return inverted;
}
/**
 * Expand a required permission transitively through PERMISSION_ALIASES.
 * Returns a Set of all permissions that can satisfy the required permission.
 * Results are cached to avoid redundant traversals.
 *
 * @param required - The permission requirement to expand.
 * @returns A Set of all permissions (including required) that can satisfy it.
 */
function expandRequiredPermission(required) {
    var _a;
    const cached = _requiredPermissionsCache.get(required);
    if (cached)
        return cached;
    // Cycle detection in non-production environments
    const isDev = typeof process !== 'undefined' && ((_a = process.env) === null || _a === void 0 ? void 0 : _a.NODE_ENV) !== 'production';
    if (isDev) {
        const path = new Set();
        const checkCycle = (curr) => {
            if (path.has(curr)) {
                const chain = Array.from(path).concat(curr).join(' -> ');
                console.warn(`[Permission System Warning] Circular dependency detected in PERMISSION_ALIASES: ${chain}`);
                return;
            }
            path.add(curr);
            const granting = exports.PERMISSION_ALIASES[curr];
            if (granting) {
                for (const g of granting) {
                    checkCycle(g);
                }
            }
            path.delete(curr);
        };
        checkCycle(required);
    }
    const expanded = new Set([required]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const perm of [...expanded]) {
            const granting = exports.PERMISSION_ALIASES[perm];
            if (granting) {
                for (const g of granting) {
                    if (!expanded.has(g)) {
                        expanded.add(g);
                        changed = true;
                    }
                }
            }
        }
    }
    _requiredPermissionsCache.set(required, expanded);
    return expanded;
}
/**
 * Check if a user's permission list satisfies a required permission,
 * considering transitive permission alias chains.
 *
 * @param userPermissions - The permissions held by the user.
 * @param requiredPermission - The permission required for the action.
 * @returns True if the user has a satisfying permission or 'all', false otherwise.
 */
function hasPermissionWithAliases(userPermissions, requiredPermission) {
    if (!userPermissions)
        return false;
    if (userPermissions.includes('all'))
        return true;
    const satisfyingPermissions = expandRequiredPermission(requiredPermission);
    return userPermissions.some(perm => satisfyingPermissions.has(perm));
}
/**
 * Expand a user's permissions transitively using an inverted graph BFS.
 * If a user holds a permission that satisfies other permissions (via PERMISSION_ALIASES),
 * those satisfied permissions are added to the returned list.
 *
 * @param userPerms - The permissions currently held by the user.
 * @param validPermissionIds - Optional array of valid system permission IDs. If provided,
 *                              the output will be filtered to only include these IDs.
 * @returns A new array of transitively expanded permission strings.
 */
function expandUserPermissions(userPerms, validPermissionIds) {
    if (!userPerms || userPerms.length === 0)
        return [];
    if (userPerms.includes('all')) {
        return ['all', ...(validPermissionIds || [])];
    }
    const expanded = new Set(userPerms);
    const queue = [...userPerms];
    const inverted = getInvertedAliases();
    let head = 0;
    while (head < queue.length) {
        const current = queue[head++];
        const implications = inverted.get(current);
        if (implications) {
            for (const imp of implications) {
                if (!expanded.has(imp)) {
                    expanded.add(imp);
                    queue.push(imp);
                }
            }
        }
    }
    if (validPermissionIds) {
        const validSet = new Set(validPermissionIds);
        return Array.from(expanded).filter(p => validSet.has(p));
    }
    return Array.from(expanded);
}
