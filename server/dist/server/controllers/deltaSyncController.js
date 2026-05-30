"use strict";
/**
 * Delta Sync Controller
 * =====================
 * Backend endpoints for delta synchronization.
 * Returns only items that have changed since a given timestamp.
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
exports.getEnhancedSyncStatus = exports.getSettingsDelta = exports.getStockMovementsDelta = exports.getPriceListItemsDelta = exports.getPriceListsDelta = exports.getPaymentsDelta = exports.healthCheck = exports.getSyncStatus = exports.getVehiclesDelta = exports.getInvoicesDelta = exports.getPartnersDelta = exports.getProductsDelta = void 0;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
const dataFiltering_1 = require("../utils/dataFiltering");
/**
 * Common delta query helper
 */
function getDeltaItems(tableName_1, columns_1, sinceTimestamp_1) {
    return __awaiter(this, arguments, void 0, function* (tableName, columns, sinceTimestamp, additionalWhere = '', additionalParams = []) {
        let query = `SELECT ${columns.join(', ')} FROM ${tableName}`;
        const params = [...additionalParams];
        const whereClauses = [];
        if (additionalWhere) {
            whereClauses.push(additionalWhere);
        }
        if (sinceTimestamp) {
            whereClauses.push('(updatedAt > ? OR updatedAt IS NULL AND createdAt > ?)');
            params.push(sinceTimestamp, sinceTimestamp);
        }
        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        query += ` ORDER BY updatedAt DESC, id ASC LIMIT 2000`;
        const [rows] = yield (0, db_1.safePoolQuery)(query, params);
        return rows;
    });
}
// ==========================================
// PRODUCTS DELTA SYNC
// ==========================================
const getProductsDelta = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const since = req.query.since;
        const products = yield getDeltaItems('products', ['id', 'sku', 'name', 'categoryId', 'price', 'cost', 'stock', 'minStock', 'unit', 'barcode', 'image', 'isActive', 'updatedAt', 'createdAt'], since || null);
        // Enrich with category names
        if (products.length > 0) {
            const categoryIds = [...new Set(products.map(p => p.categoryId).filter(Boolean))];
            if (categoryIds.length > 0) {
                const [categories] = yield (0, db_1.safePoolQuery)(`SELECT id, name FROM categories WHERE id IN (${categoryIds.map(() => '?').join(',')})`, categoryIds);
                const catMap = new Map(categories.map((c) => [c.id, c.name]));
                products.forEach(p => {
                    p.categoryName = catMap.get(p.categoryId) || null;
                });
            }
        }
        res.json({
            items: products,
            count: products.length,
            since: since || null,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error in getProductsDelta:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch products delta');
    }
});
exports.getProductsDelta = getProductsDelta;
// ==========================================
// PARTNERS DELTA SYNC
// ==========================================
const getPartnersDelta = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const since = req.query.since;
        const authReq = req;
        // Build salesman filter
        let salesmanFilter = '';
        const params = [];
        if (authReq.userFilterOptions && authReq.systemConfig) {
            const filter = (0, dataFiltering_1.buildSalesmanFilterClause)(authReq.userFilterOptions, 'partners', '' // No prefix
            );
            salesmanFilter = filter.clause;
            params.push(...filter.params);
        }
        const partners = yield getDeltaItems('partners', ['id', 'code', 'name', 'phone', 'address', 'type', 'isCustomer', 'isSupplier', 'balance', 'creditLimit', 'priceListId', 'salesmanId', 'updatedAt', 'createdAt'], since || null, salesmanFilter, params);
        res.json({
            items: partners,
            count: partners.length,
            since: since || null,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error in getPartnersDelta:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch partners delta');
    }
});
exports.getPartnersDelta = getPartnersDelta;
// ==========================================
// INVOICES DELTA SYNC
// ==========================================
const getInvoicesDelta = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const since = req.query.since;
        const authReq = req;
        // Build user filter (salesmen see only their invoices)
        let userFilter = '';
        const params = [];
        if (authReq.userFilterOptions && authReq.systemConfig) {
            if ((0, dataFiltering_1.shouldFilterBySalesman)(authReq.userFilterOptions, 'invoices')) {
                const salesmanId = authReq.userFilterOptions.salesmanId;
                userFilter = '(salesmanId = ? OR partnerId IN (SELECT id FROM partners WHERE salesmanId = ?))';
                params.push(salesmanId, salesmanId);
            }
        }
        const invoices = yield getDeltaItems('invoices', ['id', 'type', 'partnerId', 'partnerName', 'date', 'dueDate', 'total', 'paidAmount', 'status', 'notes', 'salesmanId', 'updatedAt', 'createdAt'], since || null, userFilter, params);
        // Get invoice lines for each invoice
        if (invoices.length > 0) {
            const invoiceIds = invoices.map(i => i.id);
            const [lines] = yield (0, db_1.safePoolQuery)(`SELECT * FROM invoice_lines WHERE invoiceId IN (${invoiceIds.map(() => '?').join(',')})`, invoiceIds);
            const linesMap = new Map();
            lines.forEach((line) => {
                if (!linesMap.has(line.invoiceId)) {
                    linesMap.set(line.invoiceId, []);
                }
                linesMap.get(line.invoiceId).push(line);
            });
            invoices.forEach(inv => {
                inv.lines = linesMap.get(inv.id) || [];
            });
        }
        res.json({
            items: invoices,
            count: invoices.length,
            since: since || null,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error in getInvoicesDelta:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch invoices delta');
    }
});
exports.getInvoicesDelta = getInvoicesDelta;
// ==========================================
// VEHICLES DELTA SYNC (For Van Sales)
// ==========================================
const getVehiclesDelta = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const since = req.query.since;
        const authReq = req;
        let salesmanFilter = '';
        const params = [];
        if (authReq.userFilterOptions && authReq.systemConfig) {
            if ((0, dataFiltering_1.shouldFilterBySalesman)(authReq.userFilterOptions, 'partners')) {
                const salesmanId = authReq.userFilterOptions.salesmanId;
                if (salesmanId) {
                    salesmanFilter = 'salesmanId = ?';
                    params.push(salesmanId);
                }
            }
        }
        const vehicles = yield getDeltaItems('vehicles', ['id', 'plateNumber', 'name', 'type', 'status', 'salesmanId', 'warehouseId', 'updatedAt', 'createdAt'], since || null, salesmanFilter, params);
        // Get salesman names
        if (vehicles.length > 0) {
            const salesmanIds = [...new Set(vehicles.map(v => v.salesmanId).filter(Boolean))];
            if (salesmanIds.length > 0) {
                const [salesmen] = yield (0, db_1.safePoolQuery)(`SELECT id, name FROM salesmen WHERE id IN (${salesmanIds.map(() => '?').join(',')})`, salesmanIds);
                const salesMap = new Map(salesmen.map((s) => [s.id, s.name]));
                vehicles.forEach(v => {
                    v.salesmanName = salesMap.get(v.salesmanId) || null;
                });
            }
        }
        res.json({
            items: vehicles,
            count: vehicles.length,
            since: since || null,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error in getVehiclesDelta:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch vehicles delta');
    }
});
exports.getVehiclesDelta = getVehiclesDelta;
// ==========================================
// SYNC STATUS ENDPOINT
// ==========================================
const getSyncStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield (0, db_1.safePoolQuery)(`
            SELECT 
                (SELECT COUNT(*) FROM products) as productCount,
                (SELECT COUNT(*) FROM partners) as partnerCount,
                (SELECT COUNT(*) FROM invoices) as invoiceCount,
                (SELECT MAX(updatedAt) FROM products) as lastProduct,
                (SELECT MAX(updatedAt) FROM partners) as lastPartner,
                (SELECT MAX(updatedAt) FROM invoices) as lastInvoice
        `);
        const data = rows[0];
        res.json({
            counts: {
                products: data.productCount || 0,
                partners: data.partnerCount || 0,
                invoices: data.invoiceCount || 0,
            },
            lastUpdates: {
                products: data.lastProduct,
                partners: data.lastPartner,
                invoices: data.lastInvoice,
            },
            serverTime: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error in getSyncStatus:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'get sync status');
    }
});
exports.getSyncStatus = getSyncStatus;
// ==========================================
// HEALTH CHECK FOR MOBILE
// ==========================================
const healthCheck = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Quick DB ping
        yield (0, db_1.safePoolQuery)('SELECT 1');
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: '2.5.0',
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            message: 'Database unavailable',
        });
    }
});
exports.healthCheck = healthCheck;
// ==========================================
// PAYMENTS DELTA SYNC
// ==========================================
const getPaymentsDelta = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const since = req.query.since;
        const user = req.user;
        // Build user filter
        let userFilter = '';
        const params = [];
        if ((user === null || user === void 0 ? void 0 : user.role) === 'SALES' && (user === null || user === void 0 ? void 0 : user.salesmanId)) {
            // Salesmen see payments for their customers only
            userFilter = `partnerId IN (SELECT id FROM partners WHERE salesmanId = ?)`;
            params.push(user.salesmanId);
        }
        const payments = yield getDeltaItems('transactions', [
            'id', 'partnerId', 'partnerName', 'amount', 'date', 'type',
            'paymentMethod as method', 'bankAccountId', 'reference', 'notes',
            'invoiceId', 'status', 'createdBy', 'updatedAt', 'createdAt'
        ], since || null, userFilter ? `${userFilter} AND type IN ('RECEIPT', 'PAYMENT')` : `type IN ('RECEIPT', 'PAYMENT')`, params);
        // Get partner names if not already in data
        if (payments.length > 0) {
            const partnerIds = [...new Set(payments.map(p => p.partnerId).filter(Boolean))];
            if (partnerIds.length > 0) {
                const [partners] = yield (0, db_1.safePoolQuery)(`SELECT id, name FROM partners WHERE id IN (${partnerIds.map(() => '?').join(',')})`, partnerIds);
                const partnerMap = new Map(partners.map((p) => [p.id, p.name]));
                payments.forEach(p => {
                    if (!p.partnerName) {
                        p.partnerName = partnerMap.get(p.partnerId) || null;
                    }
                });
            }
        }
        res.json({
            items: payments,
            count: payments.length,
            since: since || null,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error in getPaymentsDelta:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch payments delta');
    }
});
exports.getPaymentsDelta = getPaymentsDelta;
// ==========================================
// PRICE LISTS DELTA SYNC
// ==========================================
const getPriceListsDelta = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const since = req.query.since;
        // Get price lists
        const priceLists = yield getDeltaItems('price_lists', ['id', 'name', 'description', 'isActive', 'updatedAt', 'createdAt'], since || null);
        // Get price list items if requested
        const includeItems = req.query.includeItems === 'true';
        if (includeItems && priceLists.length > 0) {
            const listIds = priceLists.map(pl => pl.id);
            const [items] = yield (0, db_1.safePoolQuery)(`SELECT pli.*, p.name as productName 
                 FROM price_list_items pli
                 LEFT JOIN products p ON pli.productId = p.id
                 WHERE pli.priceListId IN (${listIds.map(() => '?').join(',')})`, listIds);
            const itemsMap = new Map();
            items.forEach((item) => {
                if (!itemsMap.has(item.priceListId)) {
                    itemsMap.set(item.priceListId, []);
                }
                itemsMap.get(item.priceListId).push(item);
            });
            priceLists.forEach(pl => {
                pl.items = itemsMap.get(pl.id) || [];
            });
        }
        res.json({
            items: priceLists,
            count: priceLists.length,
            since: since || null,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error in getPriceListsDelta:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch price lists delta');
    }
});
exports.getPriceListsDelta = getPriceListsDelta;
// ==========================================
// PRICE LIST ITEMS DELTA SYNC
// ==========================================
const getPriceListItemsDelta = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const since = req.query.since;
        const priceListId = req.query.priceListId;
        let additionalWhere = '';
        const params = [];
        if (priceListId) {
            additionalWhere = 'priceListId = ?';
            params.push(priceListId);
        }
        const items = yield getDeltaItems('price_list_items', ['id', 'priceListId', 'productId', 'price', 'minQty', 'maxQty', 'discountPercent', 'updatedAt', 'createdAt'], since || null, additionalWhere, params);
        // Enrich with product names
        if (items.length > 0) {
            const productIds = [...new Set(items.map(i => i.productId).filter(Boolean))];
            if (productIds.length > 0) {
                const [products] = yield (0, db_1.safePoolQuery)(`SELECT id, name FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`, productIds);
                const productMap = new Map(products.map((p) => [p.id, p.name]));
                items.forEach(i => {
                    i.productName = productMap.get(i.productId) || null;
                });
            }
        }
        res.json({
            items,
            count: items.length,
            since: since || null,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error in getPriceListItemsDelta:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch price list items de');
    }
});
exports.getPriceListItemsDelta = getPriceListItemsDelta;
// ==========================================
// STOCK MOVEMENTS DELTA SYNC
// ==========================================
const getStockMovementsDelta = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const since = req.query.since;
        const warehouseId = req.query.warehouseId;
        const productId = req.query.productId;
        let additionalWhere = '';
        const params = [];
        if (warehouseId) {
            additionalWhere = 'warehouseId = ?';
            params.push(warehouseId);
        }
        if (productId) {
            additionalWhere += (additionalWhere ? ' AND ' : '') + 'productId = ?';
            params.push(productId);
        }
        const movements = yield getDeltaItems('stock_movements', [
            'id', 'productId', 'warehouseId', 'quantity', 'movementType',
            'referenceType', 'referenceId', 'date', 'cost', 'notes',
            'createdBy', 'updatedAt', 'createdAt'
        ], since || null, additionalWhere, params);
        // Enrich with product and warehouse names
        if (movements.length > 0) {
            const productIds = [...new Set(movements.map(m => m.productId).filter(Boolean))];
            const warehouseIds = [...new Set(movements.map(m => m.warehouseId).filter(Boolean))];
            if (productIds.length > 0) {
                const [products] = yield (0, db_1.safePoolQuery)(`SELECT id, name FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`, productIds);
                const productMap = new Map(products.map((p) => [p.id, p.name]));
                movements.forEach(m => {
                    m.productName = productMap.get(m.productId) || null;
                });
            }
            if (warehouseIds.length > 0) {
                const [warehouses] = yield (0, db_1.safePoolQuery)(`SELECT id, name FROM warehouses WHERE id IN (${warehouseIds.map(() => '?').join(',')})`, warehouseIds);
                const warehouseMap = new Map(warehouses.map((w) => [w.id, w.name]));
                movements.forEach(m => {
                    m.warehouseName = warehouseMap.get(m.warehouseId) || null;
                });
            }
        }
        res.json({
            items: movements,
            count: movements.length,
            since: since || null,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error in getStockMovementsDelta:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch stock movements del');
    }
});
exports.getStockMovementsDelta = getStockMovementsDelta;
// ==========================================
// COMPANY SETTINGS DELTA SYNC
// ==========================================
const getSettingsDelta = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const since = req.query.since;
        // Get company settings
        const [settingsRows] = yield (0, db_1.safePoolQuery)(`SELECT * FROM settings WHERE category = 'company' ORDER BY key`);
        // Transform to key-value object
        const settings = {};
        settingsRows.forEach((row) => {
            try {
                settings[row.key] = JSON.parse(row.value);
            }
            catch (_a) {
                settings[row.key] = row.value;
            }
        });
        // Get last update time
        const [lastUpdate] = yield (0, db_1.safePoolQuery)(`SELECT MAX(updatedAt) as lastUpdate FROM settings WHERE category = 'company'`);
        res.json({
            settings,
            lastUpdate: ((_a = lastUpdate[0]) === null || _a === void 0 ? void 0 : _a.lastUpdate) || null,
            since: since || null,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error in getSettingsDelta:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch settings delta');
    }
});
exports.getSettingsDelta = getSettingsDelta;
// ==========================================
// ENHANCED SYNC STATUS
// ==========================================
const getEnhancedSyncStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Get counts for all entities
        const [productCount] = yield (0, db_1.safePoolQuery)('SELECT COUNT(*) as count FROM products');
        const [partnerCount] = yield (0, db_1.safePoolQuery)('SELECT COUNT(*) as count FROM partners');
        const [invoiceCount] = yield (0, db_1.safePoolQuery)('SELECT COUNT(*) as count FROM invoices');
        const [paymentCount] = yield (0, db_1.safePoolQuery)(`SELECT COUNT(*) as count FROM transactions WHERE type IN ('RECEIPT', 'PAYMENT')`);
        const [priceListCount] = yield (0, db_1.safePoolQuery)('SELECT COUNT(*) as count FROM price_lists');
        // Get last update times
        const [lastProduct] = yield (0, db_1.safePoolQuery)('SELECT MAX(updatedAt) as lastUpdate FROM products');
        const [lastPartner] = yield (0, db_1.safePoolQuery)('SELECT MAX(updatedAt) as lastUpdate FROM partners');
        const [lastInvoice] = yield (0, db_1.safePoolQuery)('SELECT MAX(updatedAt) as lastUpdate FROM invoices');
        const [lastPayment] = yield (0, db_1.safePoolQuery)(`SELECT MAX(updatedAt) as lastUpdate FROM transactions WHERE type IN ('RECEIPT', 'PAYMENT')`);
        res.json({
            counts: {
                products: productCount[0].count,
                partners: partnerCount[0].count,
                invoices: invoiceCount[0].count,
                payments: paymentCount[0].count,
                priceLists: priceListCount[0].count,
            },
            lastUpdates: {
                products: lastProduct[0].lastUpdate,
                partners: lastPartner[0].lastUpdate,
                invoices: lastInvoice[0].lastUpdate,
                payments: lastPayment[0].lastUpdate,
            },
            serverTime: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error in getEnhancedSyncStatus:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'get enhanced sync status');
    }
});
exports.getEnhancedSyncStatus = getEnhancedSyncStatus;
