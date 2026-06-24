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
Object.defineProperty(exports, "__esModule", { value: true });
exports.cashCategories = exports.productGroups = exports.itemDescriptions = exports.specifications = exports.colors = exports.sizes = exports.manufacturers = exports.partnerGroups = exports.costCenters = exports.taxes = exports.salesmen = exports.categories = exports.warehouses = exports.branches = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
const responseCache_1 = require("../utils/responseCache");
const branchFilter_1 = require("../utils/branchFilter");
// Referential integrity map: which tables reference each master data table
const referenceMap = {
    categories: [
        { table: 'products', column: 'categoryId', label: 'صنف' },
        { table: 'categories', column: 'parentId', label: 'تصنيف فرعي' },
    ],
    warehouses: [
        { table: 'products', column: 'warehouseId', label: 'صنف' },
        { table: 'product_stocks', column: 'warehouseId', label: 'رصيد مخزني' },
        { table: 'invoices', column: 'warehouseId', label: 'فاتورة' },
    ],
    salesmen: [
        { table: 'invoices', column: 'salesmanId', label: 'فاتورة' },
        { table: 'partners', column: 'salesmanId', label: 'عميل/مورد' },
    ],
    branches: [
        { table: 'warehouses', column: 'branchId', label: 'مخزن' },
    ],
    taxes: [
        { table: 'invoices', column: 'taxId', label: 'فاتورة' },
    ],
    partner_groups: [
        { table: 'partners', column: 'groupId', label: 'عميل/مورد' },
    ],
    cost_centers: [
        { table: 'journal_entry_lines', column: 'costCenterId', label: 'قيد محاسبي' },
    ],
};
// Arabic names for master data tables
const tableLabels = {
    categories: 'التصنيف',
    warehouses: 'المخزن',
    salesmen: 'المندوب',
    branches: 'الفرع',
    taxes: 'الضريبة',
    partner_groups: 'مجموعة الشركاء',
    cost_centers: 'مركز التكلفة',
    cash_categories: 'تصنيف المصروفات',
    manufacturers: 'الشركة المنتجة',
    sizes: 'المقاس',
    colors: 'اللون',
    specifications: 'التوصيف',
    item_descriptions: 'الوصف',
    product_groups: 'المجموعة',
};
// Validate column names to prevent SQL injection via field names (H1 security fix)
const SAFE_COLUMN_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function validateColumnNames(keys) {
    return keys.every(k => SAFE_COLUMN_REGEX.test(k) && k.length <= 64);
}
// Generic Helper for CRUD operations with real-time sync
const createCrudHandlers = (tableName) => ({
    getAll: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            // Cache master data for 2 minutes (auto-invalidated by event bus on changes)
            const rows = yield (0, responseCache_1.cacheThrough)(`${tableName}:all`, responseCache_1.CACHE_TTL.MASTER_DATA, () => __awaiter(void 0, void 0, void 0, function* () {
                const [result] = yield db_1.pool.query(`SELECT * FROM ${tableName}`);
                return result;
            }));
            if (!res.headersSent)
                res.json(rows);
        }
        catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                if (!res.headersSent)
                    return res.json([]);
            }
            if (!res.headersSent)
                return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    }),
    create: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const data = Object.assign({}, req.body);
            // Let MySQL handle timestamps
            delete data.createdAt;
            delete data.updatedAt;
            delete data.syncedAt;
            const id = data.id || (0, crypto_1.randomUUID)();
            const keys = Object.keys(data).filter(k => k !== 'id');
            // Duplicate Name Check
            if (data.name) {
                const normalizedName = data.name.trim();
                const compactedName = normalizedName.replace(/\s+/g, ' ');
                const [existing] = yield db_1.pool.query(`SELECT id FROM ${tableName} WHERE (TRIM(name) = ? OR REPLACE(TRIM(name), "  ", " ") = ?) AND id != ? LIMIT 1`, [normalizedName, compactedName, id]);
                if (existing.length > 0) {
                    return res.status(400).json({ code: 'DUPLICATE_NAME', message: 'هذا الاسم مسجل مسبقاً، يرجى اختيار اسم آخر.' });
                }
            }
            // Validate column names against SQL injection (H1)
            if (!validateColumnNames(keys)) {
                return res.status(400).json({ code: 'INVALID_FIELD', message: 'Invalid field name detected' });
            }
            const values = keys.map(k => data[k]);
            // Use INSERT ... ON DUPLICATE KEY UPDATE so a re-POST of an existing id
            // (e.g. from a retry or a sync race condition) updates instead of throwing ER_DUP_ENTRY.
            const updateClause = keys.map(k => `${k}=VALUES(${k})`).join(', ');
            const query = keys.length > 0
                ? `INSERT INTO ${tableName} (id, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${updateClause}`
                : `INSERT IGNORE INTO ${tableName} (id) VALUES (?)`;
            yield db_1.pool.query(query, [id, ...values]);
            // Broadcast real-time update
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: tableName, updatedBy: 'System' });
            res.status(201).json(Object.assign(Object.assign({}, data), { id }));
        }
        catch (error) {
            return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    }),
    update: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const data = Object.assign({}, req.body);
            // Let MySQL handle timestamps
            delete data.createdAt;
            delete data.updatedAt;
            delete data.syncedAt;
            // Strip computed/virtual fields that are not real columns — these come
            // from SELECT subqueries (e.g. productCount, achieved) and must not appear in SET.
            const COMPUTED_FIELDS = new Set(['productCount', 'achieved']);
            const keys = Object.keys(data).filter(k => k !== 'id' && !COMPUTED_FIELDS.has(k));
            // Duplicate Name Check
            if (data.name) {
                const normalizedName = data.name.trim();
                const compactedName = normalizedName.replace(/\s+/g, ' ');
                const [existing] = yield db_1.pool.query(`SELECT id FROM ${tableName} WHERE (TRIM(name) = ? OR REPLACE(TRIM(name), "  ", " ") = ?) AND id != ? LIMIT 1`, [normalizedName, compactedName, id]);
                if (existing.length > 0) {
                    return res.status(400).json({ code: 'DUPLICATE_NAME', message: 'هذا الاسم مسجل مسبقاً، يرجى اختيار اسم آخر.' });
                }
            }
            // Validate column names against SQL injection (H1)
            if (!validateColumnNames(keys)) {
                return res.status(400).json({ code: 'INVALID_FIELD', message: 'Invalid field name detected' });
            }
            const values = keys.map(k => data[k]);
            const query = `UPDATE ${tableName} SET ${keys.map(k => `${k}=?`).join(', ')} WHERE id=?`;
            yield db_1.pool.query(query, [...values, id]);
            // Broadcast real-time update
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: tableName, updatedBy: 'System' });
            res.json(Object.assign(Object.assign({}, data), { id }));
        }
        catch (error) {
            return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    }),
    delete: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const { id } = req.params;
            // Get the name of the item being deleted
            const [items] = yield db_1.pool.query(`SELECT name FROM ${tableName} WHERE id = ?`, [id]);
            const itemName = ((_a = items[0]) === null || _a === void 0 ? void 0 : _a.name) || id;
            const entityLabel = tableLabels[tableName] || tableName;
            // ========== REFERENTIAL INTEGRITY CHECKS ==========
            const refs = referenceMap[tableName] || [];
            for (const ref of refs) {
                try {
                    const [result] = yield db_1.pool.query(`SELECT COUNT(*) as cnt FROM ${ref.table} WHERE ${ref.column} = ?`, [id]);
                    if (result[0].cnt > 0) {
                        return res.status(400).json({
                            error: `لا يمكن حذف ${entityLabel} "${itemName}" لأنه مرتبط بـ ${result[0].cnt} ${ref.label}.`
                        });
                    }
                }
                catch (e) {
                    // Table or column may not exist - skip this check
                }
            }
            // ========== END INTEGRITY CHECKS ==========
            yield db_1.pool.query(`DELETE FROM ${tableName} WHERE id=?`, [id]);
            // Broadcast real-time deletion
            eventBus_1.eventBus.broadcast('entity:deleted', { entityType: tableName, entityId: id, deletedBy: 'System' });
            res.json({ message: 'Deleted successfully' });
        }
        catch (error) {
            return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    })
});
exports.branches = createCrudHandlers('branches');
exports.warehouses = Object.assign(Object.assign({}, createCrudHandlers('warehouses')), { 
    // Override getAll: branch-scoped so non-privileged users only see their branch's warehouses
    getAll: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const conditions = [];
            const params = [];
            (0, branchFilter_1.appendBranchFilter)(conditions, params, req);
            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            const [rows] = yield db_1.pool.query(`SELECT * FROM warehouses ${whereClause}`, params);
            if (!res.headersSent)
                res.json(rows);
        }
        catch (error) {
            if (!res.headersSent)
                return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    }) });
exports.categories = Object.assign(Object.assign({}, createCrudHandlers('categories')), { getAll: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const page = parseInt(req.query.page) || 0;
            const limit = parseInt(req.query.limit) || 0;
            const search = (req.query.search || '').trim();
            const hierarchy = req.query.hierarchy === 'true'; // Build parent→children tree
            // Build WHERE clause for search
            const conditions = [];
            const params = [];
            if (search) {
                conditions.push('(c.name LIKE ? OR c.description LIKE ?)');
                params.push(`%${search}%`, `%${search}%`);
            }
            const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
            // Use subquery for product counts — much faster than LEFT JOIN + GROUP BY
            const countSubquery = `(SELECT COUNT(*) FROM products p WHERE p.categoryId = c.id)`;
            // Self-join for parent name
            const parentNameSelect = `(SELECT parent.name FROM categories parent WHERE parent.id = c.parentId) as parentName`;
            // If pagination requested (page > 0 and limit > 0), return paginated response
            if (page > 0 && limit > 0) {
                const cacheKey = `categories:paginated:${page}:${limit}:${search}`;
                const result = yield (0, responseCache_1.cacheThrough)(cacheKey, responseCache_1.CACHE_TTL.MASTER_DATA, () => __awaiter(void 0, void 0, void 0, function* () {
                    // Get total count
                    const [countResult] = yield db_1.pool.query(`SELECT COUNT(*) as total FROM categories c ${whereClause}`, params);
                    const total = countResult[0].total;
                    const totalPages = Math.ceil(total / limit);
                    const offset = (page - 1) * limit;
                    // Get paginated categories with product counts + parent name
                    const [rows] = yield db_1.pool.query(`SELECT c.*, ${countSubquery} as productCount, ${parentNameSelect}
                         FROM categories c
                         ${whereClause}
                         ORDER BY COALESCE(c.parentId, c.id), c.parentId IS NOT NULL, c.name ASC
                         LIMIT ? OFFSET ?`, [...params, limit, offset]);
                    return {
                        categories: rows,
                        pagination: { total, page, limit, totalPages }
                    };
                }));
                if (!res.headersSent)
                    return res.json(result);
            }
            // Non-paginated: return with product counts + parent name
            const rows = yield (0, responseCache_1.cacheThrough)(`categories:all:${search}:${hierarchy}`, responseCache_1.CACHE_TTL.MASTER_DATA, () => __awaiter(void 0, void 0, void 0, function* () {
                const [result] = yield db_1.pool.query(`SELECT c.*, ${countSubquery} as productCount, ${parentNameSelect}
                         FROM categories c
                         ${whereClause}
                         ORDER BY c.name ASC`, params);
                return result;
            }));
            // When hierarchy=true, build parent→children tree (same pattern as cashCategories)
            if (hierarchy) {
                const allRows = rows;
                const parentCategories = allRows.filter((cat) => !cat.parentId);
                const childCategories = allRows.filter((cat) => cat.parentId);
                const categoriesWithSubs = parentCategories.map((parent) => (Object.assign(Object.assign({}, parent), { subcategories: childCategories.filter((child) => child.parentId === parent.id) })));
                if (!res.headersSent)
                    return res.json(categoriesWithSubs);
            }
            if (!res.headersSent)
                res.json(rows);
        }
        catch (error) {
            if (!res.headersSent)
                return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    }) });
// ─────────────────────────────────────────────────────────────────────────────
// Salesmen — with HR employee auto-sync
// When a مندوب is created or updated here, a matching HR employee record is
// automatically created/updated so the user only has to enter data once.
// Sync direction: مناديب → HR (one-way). Edits in HR do not push back.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Resolves the Arabic job title based on the salesman type.
 */
function resolveSalesmanJobTitle(type) {
    switch (type) {
        case 'COLLECTION': return 'مندوب تحصيل';
        case 'BOTH': return 'مندوب مبيعات وتحصيل';
        default: return 'مندوب مبيعات';
    }
}
/**
 * Given a salesman record, ensure a matching HR employee exists and is synced.
 * Returns the employeeId that was created or found.
 */
function syncSalesmanToEmployee(salesmanId, salesmanData) {
    return __awaiter(this, void 0, void 0, function* () {
        const jobTitle = resolveSalesmanJobTitle(salesmanData.type);
        // Check if we already have a linked employee
        if (salesmanData.employeeId) {
            const [existing] = yield db_1.pool.query('SELECT id FROM employees WHERE id = ?', [salesmanData.employeeId]);
            if (existing.length > 0) {
                // Employee exists — sync name, phone, jobTitle
                yield db_1.pool.query(`UPDATE employees
                 SET fullName = ?, phone = ?, jobTitle = ?
                 WHERE id = ?`, [salesmanData.name, salesmanData.phone || null, jobTitle, salesmanData.employeeId]);
                return salesmanData.employeeId;
            }
        }
        // No linked employee yet — check if one was already created for this salesman
        const [byLink] = yield db_1.pool.query('SELECT id FROM employees WHERE salesmanId = ? LIMIT 1', [salesmanId]);
        if (byLink.length > 0) {
            const existingEmployeeId = byLink[0].id;
            yield db_1.pool.query(`UPDATE employees SET fullName = ?, phone = ?, jobTitle = ? WHERE id = ?`, [salesmanData.name, salesmanData.phone || null, jobTitle, existingEmployeeId]);
            return existingEmployeeId;
        }
        // Create a brand-new employee record
        const newEmployeeId = (0, crypto_1.randomUUID)();
        try {
            yield db_1.pool.query(`INSERT INTO employees
             (id, fullName, phone, jobTitle, department, employmentType, status,
              baseSalary, salesmanId)
             VALUES (?, ?, ?, ?, 'المبيعات', 'MONTHLY', 'ACTIVE', 0, ?)`, [
                newEmployeeId,
                salesmanData.name,
                salesmanData.phone || null,
                jobTitle,
                salesmanId
            ]);
        }
        catch (insertErr) {
            // If the employees table schema differs (e.g. missing salesmanId column),
            // fall back to a minimal insert without salesmanId
            if (insertErr.code === 'ER_BAD_FIELD_ERROR') {
                yield db_1.pool.query(`INSERT INTO employees
                 (id, fullName, phone, jobTitle, department, employmentType, status, baseSalary)
                 VALUES (?, ?, ?, ?, 'المبيعات', 'MONTHLY', 'ACTIVE', 0)`, [newEmployeeId, salesmanData.name, salesmanData.phone || null, jobTitle]);
            }
            else {
                throw insertErr;
            }
        }
        return newEmployeeId;
    });
}
exports.salesmen = Object.assign(Object.assign({}, createCrudHandlers('salesmen')), { getAll: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const query = `
                SELECT s.*, 
                (
                    CASE 
                        WHEN s.type = 'COLLECTION' THEN (
                            SELECT COALESCE(SUM(total), 0)
                            FROM invoices i 
                            WHERE i.salesmanId = s.id AND i.type = 'RECEIPT'
                        )
                        ELSE (
                            SELECT 
                                COALESCE(SUM(CASE WHEN type = 'INVOICE_SALE' THEN total ELSE 0 END), 0) - 
                                COALESCE(SUM(CASE WHEN type = 'RETURN_SALE' THEN total ELSE 0 END), 0)
                            FROM invoices i 
                            WHERE i.salesmanId = s.id 
                        )
                    END
                ) as achieved
                FROM salesmen s
            `;
            const [rows] = yield db_1.pool.query(query);
            res.json(rows);
        }
        catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                return res.json([]);
            }
            return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    }), create: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const data = Object.assign({}, req.body);
            delete data.createdAt;
            delete data.updatedAt;
            delete data.syncedAt;
            const id = data.id || (0, crypto_1.randomUUID)();
            const keys = Object.keys(data).filter(k => k !== 'id');
            // Duplicate Name Check
            if (data.name) {
                const [existing] = yield db_1.pool.query(`SELECT id FROM salesmen WHERE name = ? AND id != ? LIMIT 1`, [data.name, id]);
                if (existing.length > 0) {
                    return res.status(400).json({ code: 'DUPLICATE_NAME', message: 'هذا الاسم مسجل مسبقاً، يرجى اختيار اسم آخر.' });
                }
            }
            if (!validateColumnNames(keys)) {
                return res.status(400).json({ code: 'INVALID_FIELD', message: 'Invalid field name detected' });
            }
            const values = keys.map(k => data[k]);
            const updateClause = keys.map(k => `${k}=VALUES(${k})`).join(', ');
            const query = keys.length > 0
                ? `INSERT INTO salesmen (id, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${updateClause}`
                : `INSERT IGNORE INTO salesmen (id) VALUES (?)`;
            yield db_1.pool.query(query, [id, ...values]);
            // Auto-sync: create matching HR employee
            try {
                const employeeId = yield syncSalesmanToEmployee(id, {
                    name: data.name,
                    phone: data.phone,
                    type: data.type
                });
                // Write employeeId back to the salesman row
                yield db_1.pool.query('UPDATE salesmen SET employeeId = ? WHERE id = ?', [employeeId, id]);
                data.employeeId = employeeId;
            }
            catch (syncErr) {
                // HR sync failure must not block the salesman save
                console.warn('[salesmen.create] HR employee sync failed (non-fatal):', syncErr === null || syncErr === void 0 ? void 0 : syncErr.message);
            }
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'salesmen', updatedBy: 'System' });
            res.status(201).json(Object.assign(Object.assign({}, data), { id }));
        }
        catch (error) {
            return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    }), update: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const data = Object.assign({}, req.body);
            delete data.createdAt;
            delete data.updatedAt;
            delete data.syncedAt;
            const COMPUTED_FIELDS = new Set(['productCount', 'achieved']);
            const keys = Object.keys(data).filter(k => k !== 'id' && !COMPUTED_FIELDS.has(k));
            // Duplicate Name Check
            if (data.name) {
                const [existing] = yield db_1.pool.query(`SELECT id FROM salesmen WHERE name = ? AND id != ? LIMIT 1`, [data.name, id]);
                if (existing.length > 0) {
                    return res.status(400).json({ code: 'DUPLICATE_NAME', message: 'هذا الاسم مسجل مسبقاً، يرجى اختيار اسم آخر.' });
                }
            }
            if (!validateColumnNames(keys)) {
                return res.status(400).json({ code: 'INVALID_FIELD', message: 'Invalid field name detected' });
            }
            const values = keys.map(k => data[k]);
            const query = `UPDATE salesmen SET ${keys.map(k => `${k}=?`).join(', ')} WHERE id=?`;
            yield db_1.pool.query(query, [...values, id]);
            // Auto-sync: update matching HR employee
            try {
                const employeeId = yield syncSalesmanToEmployee(id, {
                    name: data.name,
                    phone: data.phone,
                    type: data.type,
                    employeeId: data.employeeId
                });
                // Persist employeeId if it was newly created
                if (!data.employeeId || data.employeeId !== employeeId) {
                    yield db_1.pool.query('UPDATE salesmen SET employeeId = ? WHERE id = ?', [employeeId, id]);
                }
            }
            catch (syncErr) {
                console.warn('[salesmen.update] HR employee sync failed (non-fatal):', syncErr === null || syncErr === void 0 ? void 0 : syncErr.message);
            }
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'salesmen', updatedBy: 'System' });
            res.json(Object.assign(Object.assign({}, data), { id }));
        }
        catch (error) {
            return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    }) });
exports.taxes = createCrudHandlers('taxes');
exports.costCenters = createCrudHandlers('cost_centers');
exports.partnerGroups = createCrudHandlers('partner_groups');
exports.manufacturers = createCrudHandlers('manufacturers');
exports.sizes = createCrudHandlers('sizes');
exports.colors = createCrudHandlers('colors');
exports.specifications = createCrudHandlers('specifications');
exports.itemDescriptions = createCrudHandlers('item_descriptions');
exports.productGroups = createCrudHandlers('product_groups');
// Custom handler for cash_categories to support subcategories
exports.cashCategories = Object.assign(Object.assign({}, createCrudHandlers('cash_categories')), { getAll: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const [rows] = yield db_1.pool.query('SELECT * FROM cash_categories');
            // Build hierarchy: parent categories with nested subcategories
            const parentCategories = rows.filter((cat) => !cat.parentId);
            const childCategories = rows.filter((cat) => cat.parentId);
            const categoriesWithSubs = parentCategories.map((parent) => (Object.assign(Object.assign({}, parent), { subcategories: childCategories.filter((child) => child.parentId === parent.id) })));
            res.json(categoriesWithSubs);
        }
        catch (error) {
            return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    }) });
