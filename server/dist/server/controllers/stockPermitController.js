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
exports.deleteStockPermit = exports.updateStockPermit = exports.createStockPermit = exports.getStockPermitById = exports.getStockPermits = exports.getDispatchPermitByInvoice = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
const policyEnforcement_1 = require("../utils/policyEnforcement");
const invoiceNumberGenerator_1 = require("../utils/invoiceNumberGenerator");
const branchFilter_1 = require("../utils/branchFilter");
// Get dispatch permit linked to an invoice (via stock_reservations)
const getDispatchPermitByInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { invoiceId } = req.params;
    const conn = yield (0, db_1.getConnection)();
    try {
        // Find the dispatch permit ID from stock_reservations
        const [reservations] = yield conn.query(`SELECT DISTINCT dispatchPermitId FROM stock_reservations 
             WHERE invoiceId = ? AND dispatchPermitId IS NOT NULL AND status = 'DISPATCHED' 
             LIMIT 1`, [invoiceId]);
        if (reservations.length === 0) {
            // Fallback: search for permit by description containing invoice number
            const [invoice] = yield conn.query('SELECT number FROM invoices WHERE id = ?', [invoiceId]);
            if (invoice.length > 0) {
                const invNumber = invoice[0].number;
                const [permitsByDesc] = yield conn.query(`SELECT * FROM stock_permits WHERE description LIKE ? AND type = 'STOCK_PERMIT_OUT' ORDER BY createdAt DESC LIMIT 1`, [`%${invNumber}%`]);
                if (permitsByDesc.length > 0) {
                    const permit = permitsByDesc[0];
                    const [items] = yield conn.query('SELECT * FROM stock_permit_items WHERE permitId = ?', [permit.id]);
                    permit.items = items;
                    conn.release();
                    return res.json(permit);
                }
            }
            conn.release();
            return res.status(404).json({ message: 'لا يوجد إذن صرف مرتبط بهذه الفاتورة' });
        }
        const permitId = reservations[0].dispatchPermitId;
        // Fetch the full permit with items
        const [permits] = yield conn.query('SELECT * FROM stock_permits WHERE id = ?', [permitId]);
        if (permits.length === 0) {
            conn.release();
            return res.status(404).json({ message: 'إذن الصرف غير موجود' });
        }
        const permit = permits[0];
        const [items] = yield conn.query('SELECT productId, productName, quantity, cost FROM stock_permit_items WHERE permitId = ?', [permitId]);
        permit.items = items;
        conn.release();
        res.json(permit);
    }
    catch (error) {
        console.error('Error fetching dispatch permit by invoice:', error);
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'dispatch permit by invoice');
    }
});
exports.getDispatchPermitByInvoice = getDispatchPermitByInvoice;
// Get all stock permits with pagination
const getStockPermits = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        // Pagination parameters - default to ALL (99999) when limit not specified
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 99999; // Show all by default
        const offset = (page - 1) * limit;
        // Filter parameters
        const type = req.query.type; // PERMIT_IN, PERMIT_OUT, TRANSFER
        const warehouseId = req.query.warehouseId;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const search = req.query.search;
        // Build WHERE clause
        let whereConditions = [];
        let params = [];
        // Branch isolation: non-privileged users see only their branch's permits
        (0, branchFilter_1.appendBranchFilter)(whereConditions, params, req);
        if (type) {
            whereConditions.push('type = ?');
            params.push(type);
        }
        if (warehouseId) {
            whereConditions.push('(warehouseId = ? OR toWarehouseId = ?)');
            params.push(warehouseId, warehouseId);
        }
        if (startDate) {
            whereConditions.push('date >= ?');
            params.push(startDate);
        }
        if (endDate) {
            whereConditions.push('date <= ?');
            params.push(endDate);
        }
        if (search) {
            // PERF: Simplified search — stock_permits table is small (<10K rows)
            // Removed 7-nested REPLACE() that caused full table scan overhead
            const tokens = search.trim().split(/\s+/).filter(Boolean);
            if (tokens.length > 0) {
                const tokenConditions = tokens.map(() => {
                    return `( COALESCE(id, '') LIKE ? OR COALESCE(description, '') LIKE ? )`;
                });
                whereConditions.push(`(${tokenConditions.join(' AND ')})`);
                tokens.forEach(token => {
                    const tokenParam = `%${token}%`;
                    params.push(tokenParam, tokenParam);
                });
            }
        }
        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';
        // Get total count
        const [countResult] = yield conn.query(`SELECT COUNT(*) as total FROM stock_permits ${whereClause}`, params);
        const total = countResult[0].total;
        // Get paginated permits
        const [permits] = yield conn.query(`SELECT * FROM stock_permits ${whereClause} ORDER BY date DESC, createdAt DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
        // Get items for each permit (batch query for better performance)
        if (permits.length > 0) {
            const permitIds = permits.map(p => p.id);
            const [allItems] = yield conn.query(`SELECT spi.*, spi.source_warehouse_id as sourceWarehouseId, spi.dest_warehouse_id as destWarehouseId,
                        p.barcode, p.sku, c.name as categoryName, p.name as productNameLive
                 FROM stock_permit_items spi
                 LEFT JOIN products p ON spi.productId = p.id
                 LEFT JOIN categories c ON p.categoryId = c.id
                 WHERE spi.permitId IN (?)`, [permitIds]);
            // Map items to their permits and normalize dates
            for (const permit of permits) {
                permit.items = allItems.filter(item => item.permitId === permit.id);
                // Normalize DATE field from MySQL Date object to YYYY-MM-DD string
                if (permit.date instanceof Date) {
                    permit.date = `${permit.date.getFullYear()}-${String(permit.date.getMonth() + 1).padStart(2, '0')}-${String(permit.date.getDate()).padStart(2, '0')}`;
                }
            }
        }
        else {
            // No permits, but still need to ensure empty array
        }
        res.json({
            permits,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    }
    catch (error) {
        console.error('Error fetching stock permits:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'stock permits');
    }
    finally {
        conn.release();
    }
});
exports.getStockPermits = getStockPermits;
// Get single stock permit by ID
const getStockPermitById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const conn = yield (0, db_1.getConnection)();
    try {
        const [permits] = yield conn.query('SELECT * FROM stock_permits WHERE id = ?', [id]);
        if (permits.length === 0) {
            return res.status(404).json({ message: 'Stock permit not found' });
        }
        const permit = permits[0];
        const [items] = yield conn.query(`SELECT spi.*, spi.source_warehouse_id as sourceWarehouseId, spi.dest_warehouse_id as destWarehouseId,
                    p.barcode, p.sku, c.name as categoryName, p.name as productNameLive
             FROM stock_permit_items spi
             LEFT JOIN products p ON spi.productId = p.id
             LEFT JOIN categories c ON p.categoryId = c.id
             WHERE spi.permitId = ?`, [id]);
        permit.items = items;
        // Normalize DATE field from MySQL Date object to YYYY-MM-DD string
        if (permit.date instanceof Date) {
            permit.date = `${permit.date.getFullYear()}-${String(permit.date.getMonth() + 1).padStart(2, '0')}-${String(permit.date.getDate()).padStart(2, '0')}`;
        }
        res.json(permit);
    }
    catch (error) {
        console.error('Error fetching stock permit:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'stock permit');
    }
    finally {
        conn.release();
    }
});
exports.getStockPermitById = getStockPermitById;
// Create new stock permit
const createStockPermit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { id, date, type, sourceWarehouseId, destWarehouseId, description, items } = req.body;
    if (!date || !type || !items || items.length === 0) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    // === TIMEZONE-SAFE DATE NORMALIZATION ===
    // The frontend sends YYYY-MM-DD but MySQL may interpret it as UTC midnight,
    // causing a -1 day shift in UTC+2/UTC+3 timezones (Egypt/Arabia).
    // Extract just the YYYY-MM-DD portion to prevent any timezone drift.
    const safeDate = typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0];
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Use authenticated user if available, otherwise fallback to body
        // @ts-ignore
        const createdBy = req.user ? req.user.name : (req.body.user || 'System');
        const currentUserRole = req.user ? req.user.role : undefined;
        // === SYSTEM POLICY VALIDATION ===
        const authReq = req;
        const systemConfig = authReq.systemConfig;
        if (systemConfig && (currentUserRole === null || currentUserRole === void 0 ? void 0 : currentUserRole.toUpperCase()) !== 'MASTER_ADMIN') {
            const context = {
                type,
                date,
                notes: description,
                warehouseId: type === 'STOCK_PERMIT_IN' ? destWarehouseId : sourceWarehouseId,
                createdBy,
                currentUser: createdBy,
                currentUserRole,
                lines: items.map((i) => ({
                    productId: i.productId,
                    quantity: i.quantity,
                    cost: i.cost
                }))
            };
            const validationResult = yield (0, policyEnforcement_1.validateTransactionFull)(context, systemConfig, conn);
            if (!validationResult.valid) {
                yield conn.rollback();
                conn.release();
                return res.status(403).json({ message: validationResult.error, errorCode: validationResult.errorCode });
            }
        }
        // === SERVER-SIDE SEQUENTIAL ID GENERATION ===
        // Always generate IDs server-side for clean, sequential numbering.
        // Frontend-generated IDs (random suffixes like STO-624179) are ignored.
        const prefix = type === 'STOCK_PERMIT_IN' ? 'STK-IN-'
            : type === 'STOCK_PERMIT_OUT' ? 'STK-OUT-'
                : 'STO-';
        const permitId = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, prefix, 'stock_permits', 'id');
        // PERF: console.log(`🔢 [createStockPermit] Generated sequential ID: ${permitId}`);
        const branchId = (0, branchFilter_1.resolveBranchIdForWrite)(req);
        yield conn.query('INSERT INTO stock_permits (id, date, type, sourceWarehouseId, destWarehouseId, description, createdBy, branchId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [permitId, safeDate, type, sourceWarehouseId || null, destWarehouseId || null, description, createdBy, branchId]);
        // === PERF: BATCH INSERT items (1 query instead of N) ===
        const itemValues = items.map((item) => {
            const qty = Number(Number(item.quantity).toFixed(5));
            const cost = Number(Number(item.cost || 0).toFixed(2));
            return [permitId, item.productId, item.productName || item.name, qty, cost, item.sourceWarehouseId || null, item.destWarehouseId || null, item.variantId || null, item.variantLabel || null];
        });
        if (itemValues.length > 0) {
            yield conn.query('INSERT INTO stock_permit_items (permitId, productId, productName, quantity, cost, source_warehouse_id, dest_warehouse_id, variantId, variantLabel) VALUES ?', [itemValues]);
        }
        // === PERF: BATCH warehouse stock updates (product_stocks) ===
        const productStockValues = [];
        for (const item of items) {
            const qty = Number(Number(item.quantity).toFixed(5));
            if (type === 'STOCK_PERMIT_IN' && destWarehouseId) {
                productStockValues.push([(0, crypto_1.randomUUID)(), item.productId, destWarehouseId, qty, qty]);
            }
            else if (type === 'STOCK_PERMIT_OUT' && sourceWarehouseId) {
                productStockValues.push([(0, crypto_1.randomUUID)(), item.productId, sourceWarehouseId, -qty, qty]);
            }
            else if (type === 'STOCK_TRANSFER') {
                // Per-item source warehouse (multi-source transfers)
                const itemSrc = item.sourceWarehouseId || sourceWarehouseId;
                const itemDest = item.destWarehouseId || destWarehouseId;
                if (itemSrc)
                    productStockValues.push([(0, crypto_1.randomUUID)(), item.productId, itemSrc, -qty, qty]);
                if (itemDest)
                    productStockValues.push([(0, crypto_1.randomUUID)(), item.productId, itemDest, qty, qty]);
            }
        }
        // Execute product_stocks upserts — must be sequential per-row due to ON DUPLICATE KEY with +/- logic
        for (const row of productStockValues) {
            const sign = row[3] >= 0 ? '+' : '-';
            yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) 
                 VALUES (?, ?, ?, ?) 
                 ON DUPLICATE KEY UPDATE stock = ROUND(stock ${sign} ?, 5)`, row);
        }
        // === VARIANT STOCK: Update product_variant_stocks per warehouse ===
        for (const item of items) {
            if (!item.variantId)
                continue;
            const qty = Number(Number(item.quantity).toFixed(5));
            if (type === 'STOCK_PERMIT_IN' && destWarehouseId) {
                yield conn.query(`INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock)
                     VALUES (?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)`, [(0, crypto_1.randomUUID)(), item.variantId, item.productId, destWarehouseId, qty, qty]);
            }
            else if (type === 'STOCK_PERMIT_OUT' && sourceWarehouseId) {
                yield conn.query(`INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock)
                     VALUES (?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE stock = ROUND(stock - ?, 5)`, [(0, crypto_1.randomUUID)(), item.variantId, item.productId, sourceWarehouseId, -qty, qty]);
            }
            else if (type === 'STOCK_TRANSFER') {
                const itemSrc = item.sourceWarehouseId || sourceWarehouseId;
                const itemDest = item.destWarehouseId || destWarehouseId;
                if (itemSrc) {
                    yield conn.query(`INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock)
                         VALUES (?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE stock = ROUND(stock - ?, 5)`, [(0, crypto_1.randomUUID)(), item.variantId, item.productId, itemSrc, -qty, qty]);
                }
                if (itemDest) {
                    yield conn.query(`INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock)
                         VALUES (?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)`, [(0, crypto_1.randomUUID)(), item.variantId, item.productId, itemDest, qty, qty]);
                }
            }
        }
        // === PERF: BATCH global products.stock update (CASE WHEN) ===
        // Transfers are net-zero at the global level, no update needed
        if (type !== 'STOCK_TRANSFER') {
            const stockSign = type === 'STOCK_PERMIT_IN' ? 1 : -1;
            const productStockMap = new Map();
            for (const item of items) {
                const qty = Number(Number(item.quantity).toFixed(5));
                productStockMap.set(item.productId, (productStockMap.get(item.productId) || 0) + qty * stockSign);
            }
            if (productStockMap.size > 0) {
                const cases = [];
                const caseParams = [];
                const productIds = [];
                for (const [productId, change] of productStockMap) {
                    cases.push('WHEN id = ? THEN ROUND(COALESCE(stock, 0) + ?, 5)');
                    caseParams.push(productId, change);
                    productIds.push(productId);
                }
                yield conn.query(`UPDATE products SET stock = CASE ${cases.join(' ')} ELSE stock END WHERE id IN (?)`, [...caseParams, productIds]);
            }
            // Also update product_variants.stock (global variant stock)
            const variantStockMap = new Map();
            for (const item of items) {
                if (!item.variantId)
                    continue;
                const qty = Number(Number(item.quantity).toFixed(5));
                variantStockMap.set(item.variantId, (variantStockMap.get(item.variantId) || 0) + qty * stockSign);
            }
            if (variantStockMap.size > 0) {
                const vCases = [];
                const vParams = [];
                const variantIds = [];
                for (const [variantId, change] of variantStockMap) {
                    vCases.push('WHEN id = ? THEN ROUND(COALESCE(stock, 0) + ?, 5)');
                    vParams.push(variantId, change);
                    variantIds.push(variantId);
                }
                yield conn.query(`UPDATE product_variants SET stock = CASE ${vCases.join(' ')} ELSE stock END WHERE id IN (?)`, [...vParams, variantIds]);
            }
        }
        // === PERF: BATCH stock_movements INSERT ===
        const movementValues = [];
        for (const item of items) {
            const qty = Number(Number(item.quantity).toFixed(5));
            const variantId = item.variantId || null;
            if (type === 'STOCK_PERMIT_IN') {
                movementValues.push([item.productId, destWarehouseId, qty, 'ADJUSTMENT', type, permitId, `Stock Permit #${permitId} - ${item.productName || 'Item'}`, safeDate, variantId]);
            }
            else if (type === 'STOCK_PERMIT_OUT') {
                movementValues.push([item.productId, sourceWarehouseId, -qty, 'ADJUSTMENT', type, permitId, `Stock Permit #${permitId} - ${item.productName || 'Item'}`, safeDate, variantId]);
            }
            else if (type === 'STOCK_TRANSFER') {
                const itemSrc = item.sourceWarehouseId || sourceWarehouseId;
                const itemDest = item.destWarehouseId || destWarehouseId;
                if (itemSrc)
                    movementValues.push([item.productId, itemSrc, -qty, 'TRANSFER_OUT', 'STOCK_TRANSFER', permitId, `Stock Transfer #${permitId} - ${item.productName || 'Item'}`, safeDate, variantId]);
                if (itemDest)
                    movementValues.push([item.productId, itemDest, qty, 'TRANSFER_IN', 'STOCK_TRANSFER', permitId, `Stock Transfer #${permitId} - ${item.productName || 'Item'}`, safeDate, variantId]);
            }
        }
        if (movementValues.length > 0) {
            yield conn.query('INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, reference_id, notes, movement_date, variant_id) VALUES ?', [movementValues]);
        }
        // === DISPATCH RESERVATIONS (Reserve-on-Sale) ===
        // When STOCK_PERMIT_OUT is created, find and dispatch matching reservations
        if (type === 'STOCK_PERMIT_OUT' && sourceWarehouseId) {
            try {
                // FIRST: If the description references an invoice, dispatch ALL reservations for that invoice directly
                const invoiceMatchFromDesc = description === null || description === void 0 ? void 0 : description.match(/فاتورة بيع #(\S+)/);
                if (invoiceMatchFromDesc) {
                    const invoiceNumber = invoiceMatchFromDesc[1];
                    const [invoiceReservations] = yield conn.query(`
                        SELECT id, quantity, productId FROM stock_reservations
                        WHERE invoiceNumber = ? AND status = 'RESERVED'
                    `, [invoiceNumber]);
                    for (const reservation of invoiceReservations) {
                        yield conn.query(`
                            UPDATE stock_reservations SET status = 'DISPATCHED', dispatchPermitId = ? WHERE id = ?
                        `, [permitId, reservation.id]);
                        // Decrement reserved_stock
                        yield conn.query(`
                            UPDATE product_stocks SET reserved_stock = ROUND(GREATEST(reserved_stock - ?, 0), 5)
                            WHERE productId = ? AND warehouseId = ?
                        `, [Number(reservation.quantity), reservation.productId, sourceWarehouseId]);
                        // PERF: console.log(`  ✅ Dispatched reservation by invoice: ${reservation.productId} x${reservation.quantity}`);
                    }
                    if (invoiceReservations.length > 0) {
                        // PERF: console.log(`  ✅ Dispatched ${invoiceReservations.length} reservations for invoice ${invoiceNumber}`);
                    }
                }
                // SECOND: Also try product-based matching for any remaining RESERVED items
                for (const item of items) {
                    const qty = Number(Number(item.quantity).toFixed(5));
                    let remainingToDispatch = qty;
                    // Find RESERVED reservations for this product - match warehouse OR null warehouse
                    const [reservations] = yield conn.query(`
                        SELECT id, quantity, invoiceId FROM stock_reservations
                        WHERE productId = ? AND (warehouseId = ? OR warehouseId IS NULL) AND status = 'RESERVED'
                        ORDER BY createdAt ASC
                    `, [item.productId, sourceWarehouseId]);
                    for (const reservation of reservations) {
                        if (remainingToDispatch <= 0)
                            break;
                        const reservedQty = Number(reservation.quantity);
                        const dispatchQty = Math.min(reservedQty, remainingToDispatch);
                        if (dispatchQty >= reservedQty) {
                            // Fully dispatched
                            yield conn.query(`
                                UPDATE stock_reservations SET status = 'DISPATCHED', dispatchPermitId = ? WHERE id = ?
                            `, [permitId, reservation.id]);
                        }
                        else {
                            // Partially dispatched - reduce reservation quantity and create a dispatched record
                            yield conn.query(`
                                UPDATE stock_reservations SET quantity = ROUND(quantity - ?, 5) WHERE id = ?
                            `, [dispatchQty, reservation.id]);
                            yield conn.query(`
                                INSERT INTO stock_reservations (id, invoiceId, invoiceNumber, productId, productName, warehouseId, quantity, status, dispatchPermitId)
                                SELECT ?, invoiceId, invoiceNumber, productId, productName, warehouseId, ?, 'DISPATCHED', ?
                                FROM stock_reservations WHERE id = ?
                            `, [(0, crypto_1.randomUUID)(), dispatchQty, permitId, reservation.id]);
                        }
                        // Decrement reserved_stock
                        yield conn.query(`
                            UPDATE product_stocks SET reserved_stock = ROUND(GREATEST(reserved_stock - ?, 0), 5)
                            WHERE productId = ? AND warehouseId = ?
                        `, [dispatchQty, item.productId, sourceWarehouseId]);
                        remainingToDispatch -= dispatchQty;
                        // PERF: console.log(`  ✅ Dispatched reservation: ${item.productName || 'Item'} x${dispatchQty} (Invoice: ${reservation.invoiceId?.substring(0, 8)})`);
                    }
                }
            }
            catch (e) {
                // PERF: console.log(`⚠️ Reservation dispatch note: ${e.message}`);
            }
        }
        // === AUTO-POST JOURNAL ENTRY FOR STOCK PERMIT ===
        if (type !== 'STOCK_TRANSFER') {
            try {
                const [invAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code = '103' OR name LIKE '%مخزون%' LIMIT 1`);
                const inventoryAcc = invAccRows[0];
                if (inventoryAcc && items.length > 0) {
                    let totalValue = 0;
                    for (const item of items) {
                        totalValue += Math.abs(Number(item.quantity) || 0) * (Number(item.cost) || 0);
                    }
                    totalValue = Number(totalValue.toFixed(2));
                    if (totalValue > 0) {
                        const permitJournalId = (0, crypto_1.randomUUID)();
                        const permitDesc = type === 'STOCK_PERMIT_IN' ? `إذن إضافة #${permitId} ` : `إذن صرف #${permitId} `;
                        yield conn.query(`INSERT INTO journal_entries(id, date, description, referenceId, createdBy, branchId) VALUES(?, ?, ?, ?, ?, ?)`, [permitJournalId, safeDate, `${permitDesc} - ${description || ''} `, permitId, createdBy, branchId]);
                        const journalLines = [];
                        if (type === 'STOCK_PERMIT_IN') {
                            journalLines.push([permitJournalId, inventoryAcc.id, inventoryAcc.name, totalValue, 0]);
                            const [eqAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE type = 'EQUITY' OR code LIKE '301%' LIMIT 1`);
                            const equityAcc = eqAccRows[0];
                            if (equityAcc)
                                journalLines.push([permitJournalId, equityAcc.id, equityAcc.name, 0, totalValue]);
                        }
                        else if (type === 'STOCK_PERMIT_OUT') {
                            const [cogsAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code = '501' OR name LIKE '%تكلفة البضاعة%' LIMIT 1`);
                            const cogsAcc = cogsAccRows[0];
                            if (cogsAcc) {
                                journalLines.push([permitJournalId, cogsAcc.id, cogsAcc.name, totalValue, 0]);
                                journalLines.push([permitJournalId, inventoryAcc.id, inventoryAcc.name, 0, totalValue]);
                            }
                        }
                        if (journalLines.length >= 2) {
                            yield conn.query(`INSERT INTO journal_lines(journalId, accountId, accountName, debit, credit) VALUES ? `, [journalLines]);
                            // PERF: console.log(`📊 Stock permit journal: ${permitDesc}, Value = ${totalValue} `);
                        }
                    }
                }
            }
            catch (e) {
                console.error(`⚠️ Permit journal error: ${e.message} `);
            }
        }
        yield conn.commit();
        // Log audit trail
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || req.body.user || 'System';
        const itemCount = items.length;
        yield (0, auditController_1.logAction)(user, 'INVENTORY', 'CREATE_PERMIT', `Created ${type} Permit #${permitId} `, `Items: ${itemCount}, Desc: ${description || 'N/A'} `);
        // Fetch the created permit with items
        const [createdPermit] = yield conn.query('SELECT * FROM stock_permits WHERE id = ?', [permitId]);
        const [createdItems] = yield conn.query(`SELECT spi.*, spi.source_warehouse_id as sourceWarehouseId, spi.dest_warehouse_id as destWarehouseId,
                    p.barcode, p.sku, c.name as categoryName, p.name as productNameLive
             FROM stock_permit_items spi
             LEFT JOIN products p ON spi.productId = p.id
             LEFT JOIN categories c ON p.categoryId = c.id
             WHERE spi.permitId = ?`, [permitId]);
        const permitData = createdPermit[0];
        // Normalize DATE field from MySQL Date object to YYYY-MM-DD string
        if (permitData.date instanceof Date) {
            permitData.date = `${permitData.date.getFullYear()}-${String(permitData.date.getMonth() + 1).padStart(2, '0')}-${String(permitData.date.getDate()).padStart(2, '0')}`;
        }
        res.status(201).json(Object.assign(Object.assign({}, permitData), { items: createdItems }));
        // Broadcast Real-time Update — notify ALL relevant caches
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'stock-permits', updatedBy: createdBy });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'product-stocks', updatedBy: createdBy });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'products', updatedBy: createdBy });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error creating stock permit:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'creating stock permit');
    }
    finally {
        conn.release();
    }
});
exports.createStockPermit = createStockPermit;
// Update stock permit (Admin only)
const updateStockPermit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { id } = req.params;
    const { date, description, items, sourceWarehouseId, destWarehouseId } = req.body;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Check if permit exists
        const [permits] = yield conn.query('SELECT * FROM stock_permits WHERE id = ?', [id]);
        if (permits.length === 0) {
            yield conn.rollback();
            return res.status(404).json({ message: 'Stock permit not found' });
        }
        const permit = permits[0];
        // === SYSTEM POLICY VALIDATION ===
        const authReq = req;
        const systemConfig = authReq.systemConfig;
        // Use authenticated user if available, otherwise fallback to body
        // @ts-ignore
        const createdBy = req.user ? req.user.name : (req.body.user || 'System');
        const currentUserRole = req.user ? req.user.role : undefined;
        if (systemConfig && (currentUserRole === null || currentUserRole === void 0 ? void 0 : currentUserRole.toUpperCase()) !== 'MASTER_ADMIN') {
            const context = {
                type: permit.type,
                date: date || permit.date,
                notes: description !== undefined ? description : permit.description,
                warehouseId: permit.type === 'STOCK_PERMIT_IN' ? permit.destWarehouseId : permit.sourceWarehouseId,
                createdBy: permit.createdBy,
                currentUser: createdBy,
                currentUserRole,
                lines: items === null || items === void 0 ? void 0 : items.map((i) => ({
                    productId: i.productId,
                    quantity: i.quantity,
                    cost: i.cost
                }))
            };
            const validationResult = yield (0, policyEnforcement_1.validateTransactionFull)(context, systemConfig, conn);
            if (!validationResult.valid) {
                yield conn.rollback();
                conn.release();
                // To display correct negative stock messages
                return res.status(403).json({ message: validationResult.error, errorCode: validationResult.errorCode });
            }
        }
        // Get old items to reverse stock
        const [oldItems] = yield conn.query('SELECT productId, quantity, source_warehouse_id as sourceWarehouseId, dest_warehouse_id as destWarehouseId FROM stock_permit_items WHERE permitId = ?', [id]);
        // STEP 1: Reverse OLD Stock Updates (warehouse-level + global)
        for (const item of oldItems) {
            const qty = Number(item.quantity) || 0;
            if (permit.type === 'STOCK_PERMIT_IN' && permit.destWarehouseId) {
                // Was IN, so decrease stock in destination
                yield conn.query(`UPDATE product_stocks SET stock = ROUND(stock - ?, 5) WHERE productId = ? AND warehouseId = ? `, [qty, item.productId, permit.destWarehouseId]);
                // Reverse global stock
                yield conn.query('UPDATE products SET stock = ROUND(stock - ?, 5) WHERE id = ?', [qty, item.productId]);
            }
            else if (permit.type === 'STOCK_PERMIT_OUT' && permit.sourceWarehouseId) {
                // Was OUT, so increase stock in source
                yield conn.query(`UPDATE product_stocks SET stock = ROUND(stock + ?, 5) WHERE productId = ? AND warehouseId = ? `, [qty, item.productId, permit.sourceWarehouseId]);
                // Reverse global stock
                yield conn.query('UPDATE products SET stock = ROUND(stock + ?, 5) WHERE id = ?', [qty, item.productId]);
            }
            else if (permit.type === 'STOCK_TRANSFER') {
                // Was TRANSFER - reverse both (net-zero globally, no products.stock change)
                // Use per-item source/dest if available, fall back to permit-level
                const oldItemSrc = item.sourceWarehouseId || permit.sourceWarehouseId;
                const oldItemDest = item.destWarehouseId || permit.destWarehouseId;
                if (oldItemSrc) {
                    yield conn.query(`UPDATE product_stocks SET stock = ROUND(stock + ?, 5) WHERE productId = ? AND warehouseId = ? `, [qty, item.productId, oldItemSrc]);
                }
                if (oldItemDest) {
                    yield conn.query(`UPDATE product_stocks SET stock = ROUND(stock - ?, 5) WHERE productId = ? AND warehouseId = ? `, [qty, item.productId, oldItemDest]);
                }
            }
        }
        // STEP 2: Delete old items AND old stock movements
        yield conn.query('DELETE FROM stock_permit_items WHERE permitId = ?', [id]);
        yield conn.query('DELETE FROM stock_movements WHERE reference_id = ?', [id]);
        // STEP 3: Update permit header
        const newSourceWH = sourceWarehouseId !== undefined ? sourceWarehouseId : permit.sourceWarehouseId;
        const newDestWH = destWarehouseId !== undefined ? destWarehouseId : permit.destWarehouseId;
        yield conn.query('UPDATE stock_permits SET date = ?, description = ?, sourceWarehouseId = ?, destWarehouseId = ?, updatedAt = NOW() WHERE id = ?', [date || permit.date, description !== undefined ? description : permit.description, newSourceWH, newDestWH, id]);
        // Remove old journal entry
        const [oldJournals] = yield conn.query('SELECT id FROM journal_entries WHERE referenceId = ?', [id]);
        for (const je of oldJournals) {
            yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [je.id]);
        }
        yield conn.query('DELETE FROM journal_entries WHERE referenceId = ?', [id]);
        // STEP 4: Batch insert new items and apply NEW stock changes
        if (items && items.length > 0) {
            // === PERF: BATCH INSERT items ===
            const itemValues = items.map((item) => {
                const qty = Number(Number(item.quantity).toFixed(5));
                const cost = Number(Number(item.cost || 0).toFixed(2));
                return [id, item.productId, item.productName || item.name, qty, cost, item.sourceWarehouseId || null, item.destWarehouseId || null];
            });
            yield conn.query('INSERT INTO stock_permit_items (permitId, productId, productName, quantity, cost, source_warehouse_id, dest_warehouse_id) VALUES ?', [itemValues]);
            // === PERF: BATCH warehouse stock updates (product_stocks) ===
            const productStockValues = [];
            for (const item of items) {
                const qty = Number(Number(item.quantity).toFixed(5));
                if (permit.type === 'STOCK_PERMIT_IN' && newDestWH) {
                    productStockValues.push([(0, crypto_1.randomUUID)(), item.productId, newDestWH, qty, qty]);
                }
                else if (permit.type === 'STOCK_PERMIT_OUT' && newSourceWH) {
                    productStockValues.push([(0, crypto_1.randomUUID)(), item.productId, newSourceWH, -qty, qty]);
                }
                else if (permit.type === 'STOCK_TRANSFER') {
                    const itemSrc = item.sourceWarehouseId || newSourceWH;
                    const itemDest = item.destWarehouseId || newDestWH;
                    if (itemSrc)
                        productStockValues.push([(0, crypto_1.randomUUID)(), item.productId, itemSrc, -qty, qty]);
                    if (itemDest)
                        productStockValues.push([(0, crypto_1.randomUUID)(), item.productId, itemDest, qty, qty]);
                }
            }
            for (const row of productStockValues) {
                const sign = row[3] >= 0 ? '+' : '-';
                yield conn.query(`INSERT INTO product_stocks(id, productId, warehouseId, stock)
                     VALUES(?, ?, ?, ?) 
                     ON DUPLICATE KEY UPDATE stock = ROUND(stock ${sign} ?, 5)`, row);
            }
            // === PERF: BATCH global products.stock update (CASE WHEN) ===
            if (permit.type !== 'STOCK_TRANSFER') {
                const stockSign = permit.type === 'STOCK_PERMIT_IN' ? 1 : -1;
                const productStockMap = new Map();
                for (const item of items) {
                    const qty = Number(Number(item.quantity).toFixed(5));
                    productStockMap.set(item.productId, (productStockMap.get(item.productId) || 0) + qty * stockSign);
                }
                if (productStockMap.size > 0) {
                    const cases = [];
                    const caseParams = [];
                    const productIds = [];
                    for (const [productId, change] of productStockMap) {
                        cases.push('WHEN id = ? THEN ROUND(COALESCE(stock, 0) + ?, 5)');
                        caseParams.push(productId, change);
                        productIds.push(productId);
                    }
                    yield conn.query(`UPDATE products SET stock = CASE ${cases.join(' ')} ELSE stock END WHERE id IN (?)`, [...caseParams, productIds]);
                }
            }
            // === PERF: BATCH stock_movements INSERT ===
            const movementValues = [];
            for (const item of items) {
                const qty = Number(Number(item.quantity).toFixed(5));
                if (permit.type === 'STOCK_PERMIT_IN') {
                    movementValues.push([item.productId, newDestWH, qty, 'ADJUSTMENT', permit.type, id, `Stock Permit #${id.substring(0, 8)} - ${item.productName || 'Item'}`, permit.date]);
                }
                else if (permit.type === 'STOCK_PERMIT_OUT') {
                    movementValues.push([item.productId, newSourceWH, -qty, 'ADJUSTMENT', permit.type, id, `Stock Permit #${id.substring(0, 8)} - ${item.productName || 'Item'}`, permit.date]);
                }
                else if (permit.type === 'STOCK_TRANSFER') {
                    const itemSrc = item.sourceWarehouseId || newSourceWH;
                    const itemDest = item.destWarehouseId || newDestWH;
                    if (itemSrc)
                        movementValues.push([item.productId, itemSrc, -qty, 'TRANSFER_OUT', 'STOCK_TRANSFER', id, `Stock Transfer #${id.substring(0, 8)} - ${item.productName || 'Item'}`, permit.date]);
                    if (itemDest)
                        movementValues.push([item.productId, itemDest, qty, 'TRANSFER_IN', 'STOCK_TRANSFER', id, `Stock Transfer #${id.substring(0, 8)} - ${item.productName || 'Item'}`, permit.date]);
                }
            }
            if (movementValues.length > 0) {
                yield conn.query('INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, reference_id, notes, movement_date) VALUES ?', [movementValues]);
            }
        }
        // === AUTO-POST JOURNAL ENTRY FOR UPDATED STOCK PERMIT ===
        if (permit.type !== 'STOCK_TRANSFER') {
            try {
                const [invAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code = '103' OR name LIKE '%مخزون%' LIMIT 1`);
                const inventoryAcc = invAccRows[0];
                if (inventoryAcc && items && items.length > 0) {
                    let totalValue = 0;
                    for (const item of items) {
                        totalValue += Math.abs(Number(item.quantity) || 0) * (Number(item.cost) || 0);
                    }
                    totalValue = Number(totalValue.toFixed(2));
                    if (totalValue > 0) {
                        const permitJournalId = (0, crypto_1.randomUUID)();
                        const permitDesc = permit.type === 'STOCK_PERMIT_IN' ? `إذن إضافة معدل #${id.substring(0, 8)} ` : `إذن صرف معدل #${id.substring(0, 8)} `;
                        const updateBranchId = (0, branchFilter_1.resolveBranchIdForWrite)(req);
                        yield conn.query(`INSERT INTO journal_entries(id, date, description, referenceId, createdBy, branchId) VALUES(?, ?, ?, ?, ?, ?)`, [permitJournalId, date || permit.date, `${permitDesc} - ${description !== undefined ? description : permit.description || ''} `, id, createdBy, updateBranchId]);
                        const journalLines = [];
                        if (permit.type === 'STOCK_PERMIT_IN') {
                            journalLines.push([permitJournalId, inventoryAcc.id, inventoryAcc.name, totalValue, 0]);
                            const [eqAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE type = 'EQUITY' OR code LIKE '301%' LIMIT 1`);
                            const equityAcc = eqAccRows[0];
                            if (equityAcc)
                                journalLines.push([permitJournalId, equityAcc.id, equityAcc.name, 0, totalValue]);
                        }
                        else if (permit.type === 'STOCK_PERMIT_OUT') {
                            const [cogsAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code = '501' OR name LIKE '%تكلفة البضاعة%' LIMIT 1`);
                            const cogsAcc = cogsAccRows[0];
                            if (cogsAcc) {
                                journalLines.push([permitJournalId, cogsAcc.id, cogsAcc.name, totalValue, 0]);
                                journalLines.push([permitJournalId, inventoryAcc.id, inventoryAcc.name, 0, totalValue]);
                            }
                        }
                        if (journalLines.length >= 2) {
                            yield conn.query(`INSERT INTO journal_lines(journalId, accountId, accountName, debit, credit) VALUES ? `, [journalLines]);
                        }
                    }
                }
            }
            catch (e) {
                console.error(`⚠️ Permit journal error: ${e.message} `);
            }
        }
        yield conn.commit();
        // Log audit trail
        // @ts-ignore
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || req.body.user || 'System';
        yield (0, auditController_1.logAction)(user, 'INVENTORY', 'UPDATE_PERMIT', `Updated ${permit.type} Permit #${id.substring(0, 8)} `, `Items: ${(items === null || items === void 0 ? void 0 : items.length) || 0} `);
        // Fetch updated permit
        const [updatedPermit] = yield conn.query('SELECT * FROM stock_permits WHERE id = ?', [id]);
        const [updatedItems] = yield conn.query(`SELECT spi.productId, spi.productName, spi.quantity, spi.cost,
                    spi.source_warehouse_id as sourceWarehouseId, spi.dest_warehouse_id as destWarehouseId,
                    p.barcode, p.sku, c.name as categoryName, p.name as productNameLive
             FROM stock_permit_items spi
             LEFT JOIN products p ON spi.productId = p.id
             LEFT JOIN categories c ON p.categoryId = c.id
             WHERE spi.permitId = ?`, [id]);
        res.json(Object.assign(Object.assign({}, updatedPermit[0]), { items: updatedItems }));
        // Broadcast Real-time Update — notify ALL relevant caches
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'stock-permits', updatedBy: user });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'product-stocks', updatedBy: user });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'products', updatedBy: user });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error updating stock permit:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'updating stock permit');
    }
    finally {
        conn.release();
    }
});
exports.updateStockPermit = updateStockPermit;
// Delete stock permit
const deleteStockPermit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { id } = req.params;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Check if permit exists
        const [permits] = yield conn.query('SELECT * FROM stock_permits WHERE id = ?', [id]);
        if (permits.length === 0) {
            yield conn.rollback();
            return res.status(404).json({ message: 'Stock permit not found' });
        }
        const permit = permits[0];
        // Get items to reverse stock
        const [items] = yield conn.query('SELECT productId, quantity, source_warehouse_id as sourceWarehouseId, dest_warehouse_id as destWarehouseId FROM stock_permit_items WHERE permitId = ?', [id]);
        // Reverse Stock Updates (warehouse-level + global)
        for (const item of items) {
            const qty = Number(item.quantity) || 0;
            if (permit.type === 'STOCK_PERMIT_IN' && permit.destWarehouseId) {
                // Was IN, so decrease stock in destination
                yield conn.query(`UPDATE product_stocks SET stock = ROUND(stock - ?, 5) WHERE productId = ? AND warehouseId = ? `, [qty, item.productId, permit.destWarehouseId]);
                // Reverse global stock
                yield conn.query('UPDATE products SET stock = ROUND(stock - ?, 5) WHERE id = ?', [qty, item.productId]);
            }
            else if (permit.type === 'STOCK_PERMIT_OUT' && permit.sourceWarehouseId) {
                // Was OUT, so increase stock in source
                yield conn.query(`UPDATE product_stocks SET stock = ROUND(stock + ?, 5) WHERE productId = ? AND warehouseId = ? `, [qty, item.productId, permit.sourceWarehouseId]);
                // Reverse global stock
                yield conn.query('UPDATE products SET stock = ROUND(stock + ?, 5) WHERE id = ?', [qty, item.productId]);
            }
            else if (permit.type === 'STOCK_TRANSFER') {
                // Was TRANSFER (net-zero globally, no products.stock change)
                // Use per-item source/dest if available, fall back to permit-level
                const itemSrc = item.sourceWarehouseId || permit.sourceWarehouseId;
                const itemDest = item.destWarehouseId || permit.destWarehouseId;
                // 1. Increase stock in source (Reverse OUT)
                if (itemSrc) {
                    yield conn.query(`UPDATE product_stocks SET stock = ROUND(stock + ?, 5) WHERE productId = ? AND warehouseId = ? `, [qty, item.productId, itemSrc]);
                }
                // 2. Decrease stock in destination (Reverse IN)
                if (itemDest) {
                    yield conn.query(`UPDATE product_stocks SET stock = ROUND(stock - ?, 5) WHERE productId = ? AND warehouseId = ? `, [qty, item.productId, itemDest]);
                }
            }
        }
        // Delete items, stock movements, and permit
        yield conn.query('DELETE FROM stock_permit_items WHERE permitId = ?', [id]);
        yield conn.query('DELETE FROM stock_movements WHERE reference_id = ?', [id]);
        // Delete Journal Entries
        const [oldJournals] = yield conn.query('SELECT id FROM journal_entries WHERE referenceId = ?', [id]);
        for (const je of oldJournals) {
            yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [je.id]);
        }
        yield conn.query('DELETE FROM journal_entries WHERE referenceId = ?', [id]);
        // Delete permit
        yield conn.query('DELETE FROM stock_permits WHERE id = ?', [id]);
        yield conn.commit();
        // Log audit trail
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || ((_c = req.body) === null || _c === void 0 ? void 0 : _c.user) || 'System';
        yield (0, auditController_1.logAction)(user, 'INVENTORY', 'DELETE_PERMIT', `Deleted ${permit.type} Permit #${id.substring(0, 8)} `, `Type: ${permit.type} `);
        res.json({ message: 'Stock permit deleted successfully', id });
        // Broadcast Real-time Deletion — notify ALL relevant caches
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'stock-permits', entityId: id, deletedBy: user });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'product-stocks', updatedBy: user });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'products', updatedBy: user });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error deleting stock permit:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleting stock permit');
    }
    finally {
        conn.release();
    }
});
exports.deleteStockPermit = deleteStockPermit;
