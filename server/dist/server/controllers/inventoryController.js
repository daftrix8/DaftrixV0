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
exports.getStockValuation = exports.getStagnantItemsReport = exports.getVariablePricingReport = exports.getItemProfitsReport = exports.getSupplierProducts = exports.getProductInquiry = exports.getInventoryFlowReport = exports.recalculateStock = exports.getRecalculateStatus = exports.deleteStockTakingSession = exports.updateStockTakingSession = exports.createStockTakingSession = exports.getStockTakingSessions = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const branchFilter_1 = require("../utils/branchFilter");
// Convert ISO 8601 datetime (e.g. '2026-02-24T22:00:00.000Z') to MySQL DATETIME format
function toMySQLDate(dateInput) {
    if (!dateInput)
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    const d = new Date(dateInput);
    if (isNaN(d.getTime()))
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    return d.toISOString().slice(0, 19).replace('T', ' ');
}
const getStockTakingSessions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Branch isolation: non-privileged users see only sessions for their branch's warehouses
        const conditions = [];
        const params = [];
        const conn = yield (0, db_1.getConnection)();
        try {
            yield (0, branchFilter_1.appendWarehouseBranchFilter)(conditions, params, conn, req, 'warehouseId');
        }
        finally {
            conn.release();
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const [sessions] = yield db_1.pool.query(`SELECT * FROM stock_taking_sessions ${whereClause} ORDER BY date DESC`, params);
        // FIX: Bulk-fetch all items instead of N+1 queries
        // Old: 50 sessions = 51 queries | New: always 2 queries
        const sessionIds = sessions.map(s => s.id);
        let allItems = [];
        if (sessionIds.length > 0) {
            const [items] = yield db_1.pool.query(`SELECT * FROM stock_taking_items WHERE sessionId IN (${sessionIds.map(() => '?').join(',')})`, sessionIds);
            allItems = items;
        }
        // Group items by sessionId in memory (O(n))
        const itemsBySession = new Map();
        for (const item of allItems) {
            const list = itemsBySession.get(item.sessionId) || [];
            list.push(item);
            itemsBySession.set(item.sessionId, list);
        }
        const sessionsWithItems = sessions.map(session => (Object.assign(Object.assign({}, session), { items: itemsBySession.get(session.id) || [] })));
        res.json(sessionsWithItems);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getStockTakingSessions = getStockTakingSessions;
const createStockTakingSession = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const session = req.body;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const sessionId = session.id || (0, crypto_1.randomUUID)();
        yield conn.query('INSERT INTO stock_taking_sessions (id, date, warehouseId, status) VALUES (?, ?, ?, ?)', [sessionId, toMySQLDate(session.date), session.warehouseId, session.status]);
        if (session.items && session.items.length > 0) {
            // PERF: Batch INSERT (1 query instead of N)
            const itemValues = session.items.map((item) => [
                sessionId, item.productId, item.name || '', item.sku || '',
                item.systemStock, item.actualStock, item.cost, item.touched
            ]);
            yield conn.query(`INSERT INTO stock_taking_items (sessionId, productId, name, sku, systemStock, actualStock, cost, touched)
                 VALUES ?`, [itemValues]);
        }
        yield conn.commit();
        res.status(201).json(Object.assign(Object.assign({}, session), { id: sessionId }));
    }
    catch (error) {
        yield conn.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        conn.release();
    }
});
exports.createStockTakingSession = createStockTakingSession;
const updateStockTakingSession = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const session = req.body;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        yield conn.query('UPDATE stock_taking_sessions SET date=?, warehouseId=?, status=? WHERE id=?', [toMySQLDate(session.date), session.warehouseId, session.status, id]);
        // Delete existing items and re-insert (simplest for now)
        yield conn.query('DELETE FROM stock_taking_items WHERE sessionId = ?', [id]);
        if (session.items && session.items.length > 0) {
            // PERF: Batch INSERT (1 query instead of N)
            const itemValues = session.items.map((item) => [
                id, item.productId, item.name || '', item.sku || '',
                item.systemStock, item.actualStock, item.cost, item.touched
            ]);
            yield conn.query(`INSERT INTO stock_taking_items (sessionId, productId, name, sku, systemStock, actualStock, cost, touched)
                 VALUES ?`, [itemValues]);
        }
        yield conn.commit();
        res.json(session);
    }
    catch (error) {
        yield conn.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        conn.release();
    }
});
exports.updateStockTakingSession = updateStockTakingSession;
const deleteStockTakingSession = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        yield db_1.pool.query('DELETE FROM stock_taking_sessions WHERE id = ?', [id]);
        res.json({ message: 'Session deleted' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteStockTakingSession = deleteStockTakingSession;
const _recalcStatus = {
    running: false,
    phase: 'idle',
    progress: 0,
    startedAt: null,
    completedAt: null,
    lastResult: null,
    error: null,
};
// Status endpoint — allows frontend to poll progress
const getRecalculateStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(_recalcStatus);
});
exports.getRecalculateStatus = getRecalculateStatus;
const recalculateStock = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // ── Mutex: reject if already running ──
    if (_recalcStatus.running) {
        return res.status(409).json({
            message: 'إعادة الاحتساب قيد التنفيذ بالفعل',
            status: _recalcStatus,
        });
    }
    // ── Return 202 Accepted immediately ──
    _recalcStatus.running = true;
    _recalcStatus.phase = 'starting';
    _recalcStatus.progress = 0;
    _recalcStatus.startedAt = Date.now();
    _recalcStatus.completedAt = null;
    _recalcStatus.error = null;
    _recalcStatus.lastResult = null;
    res.status(202).json({
        message: 'تم بدء إعادة الاحتساب في الخلفية',
        status: _recalcStatus,
    });
    // ── Run in background (fire-and-forget) ──
    runRecalculationInBackground().catch(err => {
        console.error('❌ [recalculateStock] Background fatal error:', err);
        _recalcStatus.running = false;
        _recalcStatus.phase = 'error';
        _recalcStatus.error = (err === null || err === void 0 ? void 0 : err.message) || 'Unknown error';
    });
});
exports.recalculateStock = recalculateStock;
function runRecalculationInBackground() {
    return __awaiter(this, void 0, void 0, function* () {
        const summary = {
            rebuiltInvoiceMovements: 0,
            rebuiltPermitMovements: 0,
            rebuiltProductionMovements: 0,
            totalRebuiltMovements: 0,
            stockMovementGroups: 0,
            totalProductStocksCreated: 0,
        };
        try {
            // ════════════════════════════════════════════════════
            // PHASE 0: Rebuild missing stock_movements
            // Uses its own transaction — releases connection when done
            // ════════════════════════════════════════════════════
            _recalcStatus.phase = 'rebuilding_movements';
            _recalcStatus.progress = 5;
            // PERF: console.log('🔄 [recalculateStock/BG] PHASE 0: Rebuilding missing stock_movements...');
            const phase0Result = yield runPhase0_RebuildMovements();
            summary.rebuiltInvoiceMovements = phase0Result.rebuiltInvoices;
            summary.rebuiltPermitMovements = phase0Result.rebuiltPermits;
            summary.rebuiltProductionMovements = phase0Result.rebuiltProduction;
            summary.totalRebuiltMovements = phase0Result.rebuiltInvoices + phase0Result.rebuiltPermits + phase0Result.rebuiltProduction;
            _recalcStatus.progress = 40;
            // ════════════════════════════════════════════════════
            // PHASE 1: Recalculate product_stocks from movements
            // Own transaction — the DELETE + re-INSERT is the heaviest part
            // ════════════════════════════════════════════════════
            _recalcStatus.phase = 'recalculating_stocks';
            _recalcStatus.progress = 45;
            // PERF: console.log('🔄 [recalculateStock/BG] PHASE 1: Recalculating product_stocks...');
            const phase1Result = yield runPhase1_RecalculateStocks();
            summary.stockMovementGroups = phase1Result.stockMovementGroups;
            summary.totalProductStocksCreated = phase1Result.insertedCount;
            _recalcStatus.progress = 80;
            // ════════════════════════════════════════════════════
            // PHASE 2: Update products.stock from product_stocks
            // Quick single UPDATE statement
            // ════════════════════════════════════════════════════
            _recalcStatus.phase = 'updating_products';
            _recalcStatus.progress = 85;
            yield runPhase2_UpdateProducts();
            // ════════════════════════════════════════════════════
            // PHASE 3: Zero-out Negative Phantom Stocks
            // ════════════════════════════════════════════════════
            _recalcStatus.phase = 'zero_out_negatives';
            _recalcStatus.progress = 90;
            // PERF: console.log('🔄 [recalculateStock/BG] PHASE 3: Correcting phantom negative stocks...');
            yield runPhase3_ZeroOutNegativePhantomStocks();
            _recalcStatus.progress = 100;
            // ── Done ──
            _recalcStatus.phase = 'completed';
            _recalcStatus.completedAt = Date.now();
            _recalcStatus.lastResult = Object.assign({ message: 'Stock recalculated successfully' }, summary);
            _recalcStatus.running = false;
            const elapsed = _recalcStatus.completedAt - (_recalcStatus.startedAt || 0);
            // PERF: console.log(`✅ [recalculateStock/BG] COMPLETE in ${(elapsed / 1000).toFixed(1)}s:`, summary);
            // ── Broadcast WebSocket to all clients ──
            try {
                const { eventBus } = require('../utils/eventBus');
                eventBus.broadcast('stock:recalculated', summary);
                eventBus.broadcast('stock:updated', { source: 'recalculation' });
                eventBus.broadcast('entity:changed', { entityType: 'products', updatedBy: 'System' });
            }
            catch ( /* eventBus not loaded */_a) { /* eventBus not loaded */ }
        }
        catch (error) {
            _recalcStatus.running = false;
            _recalcStatus.phase = 'error';
            _recalcStatus.error = (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error';
            _recalcStatus.completedAt = Date.now();
            console.error('❌ [recalculateStock/BG] Failed:', error);
        }
    });
}
// ── Phase 0: Rebuild missing stock_movements ──
function runPhase0_RebuildMovements() {
    return __awaiter(this, void 0, void 0, function* () {
        let conn = null;
        let rebuiltInvoices = 0;
        let rebuiltPermits = 0;
        let rebuiltProduction = 0;
        try {
            conn = yield (0, db_1.getHeavyConnection)();
            yield conn.beginTransaction();
            // Get all valid warehouse IDs
            const [validWarehouses] = yield conn.query('SELECT id FROM warehouses');
            const validWarehouseIds = new Set(validWarehouses.map((w) => w.id));
            // 0-PRE: Cleanup phantom movements for reserved invoices
            const [deletedPhantoms] = yield conn.query(`
            DELETE sm FROM stock_movements sm
            INNER JOIN stock_reservations sr 
                ON sm.reference_id = sr.invoiceId 
                AND sm.product_id = sr.productId
            WHERE sr.status IN ('RESERVED', 'DISPATCHED')
              AND sm.movement_type IN ('SALE', 'ADJUSTMENT')
        `);
            const phantomCount = deletedPhantoms.affectedRows || 0;
            if (phantomCount > 0) {
                // PERF: console.log(`   🧹 Cleaned up ${phantomCount} phantom stock movements`);
            }
            // 0-PRE2: Cleanup SYSTEM_ADJUSTMENTS for idempotency before rebuilding
            const [deletedSystemAdjustments] = yield conn.query(`
            DELETE FROM stock_movements WHERE reference_type = 'SYSTEM_ADJUSTMENT'
        `);
            const systemAdjCount = deletedSystemAdjustments.affectedRows || 0;
            if (systemAdjCount > 0) {
                // PERF: console.log(`   🧹 Wiped ${systemAdjCount} old SYSTEM_ADJUSTMENTS (idempotency reset)`);
            }
            // 0A: Rebuild from INVOICES
            // FIX: INNER JOIN products to skip orphaned product references (deleted products)
            // Without this, the FK constraint on stock_movements.product_id → products.id fails
            const [missingInvoiceMovements] = yield conn.query(`
            SELECT i.id as invoiceId, i.type, i.date, 
                   COALESCE(il.warehouseId, i.warehouseId) as warehouseId,
                   i.number as invoiceNumber,
                   i.partnerName,
                   il.productId, il.quantity, il.variantId
            FROM invoices i
            JOIN invoice_lines il ON i.id = il.invoiceId
            INNER JOIN products p_check ON il.productId = p_check.id
            WHERE i.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
              AND NOT EXISTS (
                  SELECT 1 FROM stock_movements sm 
                  WHERE sm.reference_id = i.id 
                    AND sm.product_id = il.productId
              )
              AND NOT EXISTS (
                  SELECT 1 FROM stock_reservations sr 
                  WHERE sr.invoiceId = i.id 
                    AND sr.productId = il.productId
                    AND sr.status IN ('RESERVED', 'DISPATCHED')
              )
              AND (COALESCE(il.warehouseId, i.warehouseId) IS NOT NULL OR i.date < '2026-02-10')
        `);
            for (const row of missingInvoiceMovements) {
                const qty = parseFloat(row.quantity) || 0;
                if (qty === 0 || !row.productId)
                    continue;
                let qtyChange = 0;
                let movementType = '';
                let referenceType = '';
                switch (row.type) {
                    case 'INVOICE_PURCHASE':
                        qtyChange = qty;
                        movementType = 'PURCHASE';
                        referenceType = 'INVOICE_PURCHASE';
                        break;
                    case 'INVOICE_SALE':
                        qtyChange = -qty;
                        movementType = 'SALE';
                        referenceType = 'INVOICE_SALE';
                        break;
                    case 'RETURN_SALE':
                        qtyChange = qty;
                        movementType = 'RETURN_IN';
                        referenceType = 'RETURN_SALE';
                        break;
                    case 'RETURN_PURCHASE':
                        qtyChange = -qty;
                        movementType = 'RETURN_OUT';
                        referenceType = 'RETURN_PURCHASE';
                        break;
                    default: continue;
                }
                yield conn.query(`
                INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, reference_id, notes, movement_date, variant_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                    row.productId, row.warehouseId, qtyChange, movementType, referenceType,
                    row.invoiceId, `${row.invoiceNumber || row.type} - ${row.partnerName || ''} (تم إعادة بناء الحركة)`, row.date, row.variantId || null
                ]);
                rebuiltInvoices++;
            }
            // PERF: console.log(`   📦 Rebuilt ${rebuiltInvoices} invoice stock movements`);
            // 0B: Rebuild from STOCK PERMITS
            // FIX: INNER JOIN products to skip orphaned product references
            const [missingPermitMovements] = yield conn.query(`
            SELECT sp.id as permitId, sp.type, sp.date, sp.description,
                   sp.sourceWarehouseId, sp.destWarehouseId,
                   spi.productId, spi.productName, spi.quantity, spi.variantId
            FROM stock_permits sp
            JOIN stock_permit_items spi ON sp.id = spi.permitId
            INNER JOIN products p_check ON spi.productId = p_check.id
            WHERE NOT EXISTS (
                SELECT 1 FROM stock_movements sm 
                WHERE sm.reference_id = sp.id 
                  AND sm.product_id = spi.productId
            )
        `);
            for (const row of missingPermitMovements) {
                const qty = parseFloat(row.quantity) || 0;
                if (qty === 0 || !row.productId)
                    continue;
                const vId = row.variantId || null;
                if (row.type === 'STOCK_PERMIT_IN') {
                    yield conn.query(`
                    INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, reference_id, notes, movement_date, variant_id)
                    VALUES (?, ?, ?, 'ADJUSTMENT', 'STOCK_PERMIT_IN', ?, ?, ?, ?)
                `, [row.productId, row.destWarehouseId, qty, row.permitId,
                        `${row.description || 'إذن إضافة'} - ${row.productName || ''} (تم إعادة بناء الحركة)`, row.date, vId]);
                    rebuiltPermits++;
                }
                else if (row.type === 'STOCK_PERMIT_OUT') {
                    yield conn.query(`
                    INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, reference_id, notes, movement_date, variant_id)
                    VALUES (?, ?, ?, 'ADJUSTMENT', 'STOCK_PERMIT_OUT', ?, ?, ?, ?)
                `, [row.productId, row.sourceWarehouseId, -qty, row.permitId,
                        `${row.description || 'إذن صرف'} - ${row.productName || ''} (تم إعادة بناء الحركة)`, row.date, vId]);
                    rebuiltPermits++;
                }
                else if (row.type === 'STOCK_TRANSFER') {
                    if (row.sourceWarehouseId) {
                        yield conn.query(`
                        INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, reference_id, notes, movement_date, variant_id)
                        VALUES (?, ?, ?, 'TRANSFER_OUT', 'STOCK_TRANSFER', ?, ?, ?, ?)
                    `, [row.productId, row.sourceWarehouseId, -qty, row.permitId,
                            `تحويل صادر - ${row.productName || ''} (تم إعادة بناء الحركة)`, row.date, vId]);
                        rebuiltPermits++;
                    }
                    if (row.destWarehouseId) {
                        yield conn.query(`
                        INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, reference_id, notes, movement_date, variant_id)
                        VALUES (?, ?, ?, 'TRANSFER_IN', 'STOCK_TRANSFER', ?, ?, ?, ?)
                    `, [row.productId, row.destWarehouseId, qty, row.permitId,
                            `تحويل وارد - ${row.productName || ''} (تم إعادة بناء الحركة)`, row.date, vId]);
                        rebuiltPermits++;
                    }
                }
            }
            // PERF: console.log(`   📋 Rebuilt ${rebuiltPermits} permit stock movements`);
            // 0C: Rebuild from PRODUCTION ORDERS
            const [missingProductionOrders] = yield conn.query(`
            SELECT po.id, po.order_number, po.bom_id, po.finished_product_id,
                   po.qty_planned, po.qty_finished, po.qty_scrapped, po.status,
                   po.warehouse_id, po.source_warehouse_id, po.dest_warehouse_id,
                   po.actual_start_date, po.actual_end_date
            FROM production_orders po
            WHERE po.status IN ('IN_PROGRESS', 'COMPLETED')
              AND NOT EXISTS (
                  SELECT 1 FROM stock_movements sm 
                  WHERE sm.reference_id = po.id 
                    AND sm.reference_type = 'PRODUCTION_ORDER'
              )
        `);
            for (const order of missingProductionOrders) {
                // FIX: INNER JOIN products to skip orphaned raw product references
                const [bomItems] = yield conn.query(`
                SELECT bi.raw_product_id, bi.quantity_per_unit, bi.waste_percent,
                       p.name as productName
                FROM bom_items bi
                INNER JOIN products p ON bi.raw_product_id = p.id
                WHERE bi.bom_id = ?
            `, [order.bom_id]);
                const sourceWarehouse = order.source_warehouse_id || order.warehouse_id;
                for (const item of bomItems) {
                    if (!item.raw_product_id)
                        continue;
                    const qtyWithWaste = item.quantity_per_unit * (1 + (item.waste_percent || 0) / 100);
                    const totalRequired = qtyWithWaste * order.qty_planned;
                    yield conn.query(`
                    INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, reference_id, notes, movement_date)
                    VALUES (?, ?, ?, 'PRODUCTION_USE', 'PRODUCTION_ORDER', ?, ?, ?)
                `, [
                        item.raw_product_id, sourceWarehouse, -totalRequired, order.id,
                        `استخدام إنتاج - أمر ${order.order_number} - ${item.productName || ''} (تم إعادة بناء الحركة)`,
                        order.actual_start_date || order.actual_end_date || new Date()
                    ]);
                    rebuiltProduction++;
                }
                // FIX: Verify finished_product still exists before inserting movement
                if (order.status === 'COMPLETED' && order.qty_finished > 0 && order.finished_product_id) {
                    const [fpExists] = yield conn.query('SELECT 1 FROM products WHERE id = ? LIMIT 1', [order.finished_product_id]);
                    if (fpExists.length === 0)
                        continue; // Skip deleted finished product
                    const destWarehouse = order.dest_warehouse_id || order.warehouse_id;
                    const goodQty = Math.max(0, (order.qty_finished || 0) - (order.qty_scrapped || 0));
                    if (goodQty > 0) {
                        yield conn.query(`
                        INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, reference_id, notes, movement_date)
                        VALUES (?, ?, ?, 'PRODUCTION_OUTPUT', 'PRODUCTION_ORDER', ?, ?, ?)
                    `, [
                            order.finished_product_id, destWarehouse, goodQty, order.id,
                            `إنتاج تام - أمر ${order.order_number} (تم إعادة بناء الحركة)`,
                            order.actual_end_date || order.actual_start_date || new Date()
                        ]);
                        rebuiltProduction++;
                    }
                }
            }
            // PERF: console.log(`   🏭 Rebuilt ${rebuiltProduction} production stock movements`);
            // PERF: console.log(`✅ [recalculateStock/BG] PHASE 0 COMPLETE: Rebuilt ${rebuiltInvoices + rebuiltPermits + rebuiltProduction} total stock movements`);
            yield conn.commit();
        }
        catch (err) {
            if (conn)
                try {
                    yield conn.rollback();
                }
                catch ( /* ignore */_a) { /* ignore */ }
            throw err;
        }
        finally {
            if (conn)
                try {
                    conn.release();
                }
                catch ( /* ignore */_b) { /* ignore */ }
        }
        return { rebuiltInvoices, rebuiltPermits, rebuiltProduction };
    });
}
// ── Phase 1: Recalculate product_stocks ──
function runPhase1_RecalculateStocks() {
    return __awaiter(this, void 0, void 0, function* () {
        let conn = null;
        let insertedCount = 0;
        let stockMovementGroupCount = 0;
        try {
            conn = yield (0, db_1.getHeavyConnection)();
            yield conn.beginTransaction();
            // Get valid warehouse IDs
            const [validWarehouses] = yield conn.query('SELECT id FROM warehouses');
            const validWarehouseIds = new Set(validWarehouses.map((w) => w.id));
            const isValidWarehouse = (warehouseId) => {
                return !!warehouseId && validWarehouseIds.has(warehouseId);
            };
            // Clear current stock
            yield conn.query('DELETE FROM product_stocks');
            // Aggregate all stock movements by product + warehouse
            // FIX: INNER JOIN products to skip orphaned product_ids (deleted products)
            // Without this, inserting into product_stocks fails on FK constraint
            const [stockMovements] = yield conn.query(`
            SELECT sm.product_id, sm.warehouse_id, SUM(sm.qty_change) as total_change
            FROM stock_movements sm
            INNER JOIN products p ON sm.product_id = p.id
            WHERE sm.warehouse_id IS NOT NULL
              AND (sm.reference_type IS NULL OR sm.reference_type NOT IN ('VAN_SALE', 'BALANCE_SYNC')) 
              AND (sm.notes IS NULL OR sm.notes NOT LIKE '%بيع متنقل%')
            GROUP BY sm.product_id, sm.warehouse_id
        `);
            stockMovementGroupCount = stockMovements.length;
            // PERF: console.log(`   📊 Found ${stockMovementGroupCount} warehouse stock groups`);
            // Batch INSERT — instead of 4,264 individual queries, do ~9 batched queries (500 rows each)
            // This reduces connection hold time from seconds to milliseconds
            const BATCH_SIZE = 500;
            const validMovements = [];
            for (const movement of stockMovements) {
                if (!isValidWarehouse(movement.warehouse_id))
                    continue;
                if (!movement.product_id)
                    continue;
                const stock = Number(parseFloat(movement.total_change).toFixed(5));
                if (stock !== 0) {
                    validMovements.push({
                        id: (0, crypto_1.randomUUID)(),
                        productId: movement.product_id,
                        warehouseId: movement.warehouse_id,
                        stock,
                    });
                }
            }
            // Execute in batches
            for (let i = 0; i < validMovements.length; i += BATCH_SIZE) {
                const batch = validMovements.slice(i, i + BATCH_SIZE);
                const placeholders = batch.map(() => '(?, ?, ?, ?)').join(', ');
                const values = batch.flatMap(m => [m.id, m.productId, m.warehouseId, m.stock]);
                yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) 
                 VALUES ${placeholders}
                 ON DUPLICATE KEY UPDATE stock = stock`, values);
            }
            insertedCount = validMovements.length;
            // PERF: console.log(`✅ [recalculateStock/BG] Inserted ${insertedCount} product_stocks entries (${Math.ceil(validMovements.length / BATCH_SIZE)} batches)`);
            // --- 1B: Recalculate product_variant_stocks ---
            // Safely check if product_variant_stocks table exists
            const [variantStockTables] = yield conn.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'product_variant_stocks' AND TABLE_SCHEMA = DATABASE() LIMIT 1`);
            if (variantStockTables.length > 0) {
                yield conn.query('DELETE FROM product_variant_stocks');
                const [variantStockMovements] = yield conn.query(`
                SELECT sm.product_id, sm.variant_id, sm.warehouse_id, SUM(sm.qty_change) as total_change
                FROM stock_movements sm
                INNER JOIN product_variants pv ON sm.variant_id = pv.id
                WHERE sm.warehouse_id IS NOT NULL
                  AND sm.variant_id IS NOT NULL
                  AND (sm.reference_type IS NULL OR sm.reference_type NOT IN ('VAN_SALE', 'BALANCE_SYNC')) 
                  AND (sm.notes IS NULL OR sm.notes NOT LIKE '%بيع متنقل%')
                GROUP BY sm.product_id, sm.variant_id, sm.warehouse_id
            `);
                const validVariantMovements = [];
                for (const movement of variantStockMovements) {
                    if (!isValidWarehouse(movement.warehouse_id))
                        continue;
                    const stock = Number(parseFloat(movement.total_change).toFixed(5));
                    if (stock !== 0) {
                        validVariantMovements.push({
                            id: (0, crypto_1.randomUUID)(),
                            productId: movement.product_id,
                            variantId: movement.variant_id,
                            warehouseId: movement.warehouse_id,
                            stock,
                        });
                    }
                }
                for (let i = 0; i < validVariantMovements.length; i += BATCH_SIZE) {
                    const batch = validVariantMovements.slice(i, i + BATCH_SIZE);
                    const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
                    const values = batch.flatMap(m => [m.id, m.variantId, m.productId, m.warehouseId, m.stock]);
                    yield conn.query(`INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock) 
                     VALUES ${placeholders}
                     ON DUPLICATE KEY UPDATE stock = stock`, values);
                }
            }
            // --- 1C: REMOVED ---
            // Phase 1C used to replace parent product_stocks with SUM(variant_stocks).
            // This is WRONG when purchases are recorded at the parent level (variant_id = NULL)
            // but sales are at the variant level (variant_id = V1). Phase 1 already computes
            // correct totals from ALL movements (both parent and variant) grouped by product_id,
            // so replacing with variant-only sums loses the purchase quantities.
            // Phase 1B (product_variant_stocks) provides the variant-level breakdown.
            yield conn.commit();
        }
        catch (err) {
            if (conn)
                try {
                    yield conn.rollback();
                }
                catch ( /* ignore */_a) { /* ignore */ }
            throw err;
        }
        finally {
            if (conn)
                try {
                    conn.release();
                }
                catch ( /* ignore */_b) { /* ignore */ }
        }
        return { insertedCount, stockMovementGroups: stockMovementGroupCount };
    });
}
// ── Phase 2: Update products.stock from stock_movements (authoritative) ──
// We use stock_movements instead of product_stocks because product_stocks
// only contains warehouse-assigned entries, missing NULL-warehouse adjustments.
function runPhase2_UpdateProducts() {
    return __awaiter(this, void 0, void 0, function* () {
        let conn = null;
        try {
            conn = yield (0, db_1.getHeavyConnection)();
            yield conn.query(`
            UPDATE products p
            SET stock = COALESCE((
                SELECT SUM(sm.qty_change)
                FROM stock_movements sm
                WHERE sm.product_id = p.id
                  AND (sm.reference_type IS NULL OR sm.reference_type NOT IN ('VAN_SALE', 'BALANCE_SYNC'))
                  AND (sm.notes IS NULL OR sm.notes NOT LIKE '%بيع متنقل%')
            ), 0)
        `);
            // Update product_variants.stock
            const [variantTables] = yield conn.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'product_variants' AND TABLE_SCHEMA = DATABASE() LIMIT 1`);
            if (variantTables.length > 0) {
                yield conn.query(`
                UPDATE product_variants pv
                SET stock = COALESCE((
                    SELECT SUM(sm.qty_change)
                    FROM stock_movements sm
                    WHERE sm.variant_id = pv.id
                      AND (sm.reference_type IS NULL OR sm.reference_type NOT IN ('VAN_SALE', 'BALANCE_SYNC'))
                      AND (sm.notes IS NULL OR sm.notes NOT LIKE '%بيع متنقل%')
                ), 0)
            `);
                // --- 2B: REMOVED ---
                // Phase 2B used to override products.stock with SUM(product_variants.stock).
                // Same issue as Phase 1C: misses parent-level movements, producing wrong totals.
                // Phase 2 already sets products.stock correctly from ALL stock_movements.
            }
        }
        catch (err) {
            throw err;
        }
        finally {
            if (conn)
                try {
                    conn.release();
                }
                catch ( /* ignore */_a) { /* ignore */ }
        }
    });
}
function runPhase3_ZeroOutNegativePhantomStocks() {
    return __awaiter(this, void 0, void 0, function* () {
        let conn = null;
        try {
            conn = yield (0, db_1.getHeavyConnection)();
            yield conn.beginTransaction();
            // Find all products that currently have deeply negative global stock
            const [negativeProducts] = yield conn.query(`
            SELECT id, name, stock 
            FROM products 
            WHERE stock < 0
        `);
            for (const p of negativeProducts) {
                const absDifference = Math.abs(parseFloat(p.stock));
                let totalWarehouseAdjustments = 0;
                // For warehouses, find any warehouse where this product is negative and zero it out there too!
                const [negWarehouses] = yield conn.query(`
                SELECT id, warehouseId, stock
                FROM product_stocks
                WHERE productId = ? AND stock < 0
            `, [p.id]);
                for (const pw of negWarehouses) {
                    const whDiff = Math.abs(parseFloat(pw.stock));
                    totalWarehouseAdjustments += whDiff;
                    yield conn.query(`UPDATE product_stocks SET stock = 0 WHERE id = ?`, [pw.id]);
                    // Drop a tiny warehouse-specific correction
                    yield conn.query(`
                    INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, notes, movement_date)
                    VALUES (?, ?, ?, 'ADJUSTMENT', 'SYSTEM_ADJUSTMENT', 'تسوية رصيد مخزني فرعي', NOW())
                `, [p.id, pw.warehouseId, whDiff]);
                }
                const remainingGlobalDifference = absDifference - totalWarehouseAdjustments;
                if (remainingGlobalDifference > 0) {
                    // Generate a correction movement for the remaining global stock
                    yield conn.query(`
                    INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, notes, movement_date)
                    VALUES (?, NULL, ?, 'ADJUSTMENT', 'SYSTEM_ADJUSTMENT', 'تسوية رصيد - تعويض نواقص معتمة من النظام القديم', NOW())
                `, [p.id, remainingGlobalDifference]);
                }
                // Update the global stock back to 0
                yield conn.query(`UPDATE products SET stock = 0 WHERE id = ?`, [p.id]);
            }
            // Zero out negative phantom stocks for variants too
            const [variantTables] = yield conn.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'product_variants' AND TABLE_SCHEMA = DATABASE() LIMIT 1`);
            if (variantTables.length > 0) {
                const [negativeVariants] = yield conn.query(`
                SELECT id, productId, name, stock 
                FROM product_variants 
                WHERE stock < 0
            `);
                for (const v of negativeVariants) {
                    const absDifference = Math.abs(parseFloat(v.stock));
                    let totalWarehouseAdjustments = 0;
                    const [negWarehouses] = yield conn.query(`
                    SELECT id, warehouseId, stock
                    FROM product_variant_stocks
                    WHERE variantId = ? AND stock < 0
                `, [v.id]);
                    for (const pw of negWarehouses) {
                        const whDiff = Math.abs(parseFloat(pw.stock));
                        totalWarehouseAdjustments += whDiff;
                        yield conn.query(`UPDATE product_variant_stocks SET stock = 0 WHERE id = ?`, [pw.id]);
                        yield conn.query(`
                        INSERT INTO stock_movements (product_id, variant_id, warehouse_id, qty_change, movement_type, reference_type, notes, movement_date)
                        VALUES (?, ?, ?, ?, 'ADJUSTMENT', 'SYSTEM_ADJUSTMENT', 'تسوية رصيد مخزني فرعي للتشكيلة', NOW())
                    `, [v.productId, v.id, pw.warehouseId, whDiff]);
                    }
                    const remainingGlobalDifference = absDifference - totalWarehouseAdjustments;
                    if (remainingGlobalDifference > 0) {
                        yield conn.query(`
                        INSERT INTO stock_movements (product_id, variant_id, warehouse_id, qty_change, movement_type, reference_type, notes, movement_date)
                        VALUES (?, ?, NULL, ?, 'ADJUSTMENT', 'SYSTEM_ADJUSTMENT', 'تسوية رصيد - تعويض نواقص معتمة للتشكيلة من النظام القديم', NOW())
                    `, [v.productId, v.id, remainingGlobalDifference]);
                    }
                    yield conn.query(`UPDATE product_variants SET stock = 0 WHERE id = ?`, [v.id]);
                }
            }
            yield conn.commit();
            // PERF: console.log(`✅ [recalculateStock/BG] Inserted phantom stock corrections for ${(negativeProducts as any[]).length} items`);
        }
        catch (err) {
            if (conn)
                try {
                    yield conn.rollback();
                }
                catch ( /* ignore */_a) { /* ignore */ }
            throw err;
        }
        finally {
            if (conn)
                try {
                    conn.release();
                }
                catch ( /* ignore */_b) { /* ignore */ }
        }
    });
}
const getInventoryFlowReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // PERF FIX: Use a SINGLE heavy connection for all 7+ queries
    // Before: 7 × pool.query() = 7 connections per user → 15 users × 7 = 105 connections
    // After:  1 × getHeavyConnection() = 1 connection per user → 15 users × 1 = 15 connections
    let conn = null;
    try {
        const { startDate, endDate, warehouseId, categoryId } = req.query;
        // PERF: console.log('Generating Flow Report:', { startDate, endDate, warehouseId, categoryId });
        conn = yield (0, db_1.getHeavyConnection)();
        // Build product query with category filter only (warehouse filtering is done via movements/stocks)
        let productQuery = 'SELECT id, name, sku, categoryId FROM products WHERE 1=1';
        const productParams = [];
        if (categoryId && categoryId !== 'ALL') {
            productQuery += ' AND categoryId = ?';
            productParams.push(categoryId);
        }
        const [products] = yield conn.query(productQuery, productParams);
        // PERF: console.log(`Found ${(products as any[]).length} products`);
        // Fix End Date to include the full day
        const endDateTime = `${endDate} 23:59:59`;
        // Build warehouse filter conditions for movement queries
        const warehouseFilter = warehouseId && warehouseId !== 'ALL' ? warehouseId : null;
        // 1. Opening Balance (Transactions < startDate)
        // Invoices - filter by invoice warehouse
        let invoiceOpeningQuery = `
            SELECT il.productId, 
                   SUM(CASE 
                       WHEN i.type IN ('INVOICE_PURCHASE', 'RETURN_SALE') THEN il.quantity 
                       WHEN i.type IN ('INVOICE_SALE', 'RETURN_PURCHASE') THEN -il.quantity 
                       ELSE 0 END) as qty
            FROM invoice_lines il
            JOIN invoices i ON il.invoiceId = i.id
            WHERE i.status = 'POSTED' AND i.date < ?
              AND i.number NOT LIKE 'VAN-%' -- Exclude Van Sales as per user request
              AND NOT EXISTS (
                  SELECT 1 FROM stock_movements sm 
                  WHERE sm.reference_id = i.id 
                    AND sm.product_id = il.productId
                    AND sm.reference_type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE', 'SALE', 'PURCHASE')
              )`;
        const invoiceOpeningParams = [startDate];
        if (warehouseFilter) {
            invoiceOpeningQuery += ' AND i.warehouseId = ?';
            invoiceOpeningParams.push(warehouseFilter);
        }
        invoiceOpeningQuery += ' GROUP BY il.productId';
        const [invoiceOpening] = yield conn.query(invoiceOpeningQuery, invoiceOpeningParams);
        // Permits - filter by source/dest warehouse
        const permitNotExistsClause = `
              AND NOT EXISTS (
                  SELECT 1 FROM stock_movements sm 
                  WHERE sm.reference_id = sp.id 
                    AND sm.product_id = spi.productId
                    AND sm.reference_type IN ('STOCK_PERMIT_IN', 'STOCK_PERMIT_OUT', 'STOCK_TRANSFER', 'ADJUSTMENT')
              )`;
        let permitOpeningQuery = `
            SELECT spi.productId,
                   SUM(CASE 
                       WHEN sp.type = 'STOCK_PERMIT_IN' THEN spi.quantity
                       WHEN sp.type = 'STOCK_PERMIT_OUT' THEN -spi.quantity
                       WHEN sp.type = 'STOCK_TRANSFER' AND sp.destWarehouseId = ? THEN spi.quantity
                       WHEN sp.type = 'STOCK_TRANSFER' AND sp.sourceWarehouseId = ? THEN -spi.quantity
                       ELSE 0 END) as qty
            FROM stock_permit_items spi
            JOIN stock_permits sp ON spi.permitId = sp.id
            WHERE sp.date < ? ${permitNotExistsClause}`;
        const permitOpeningParams = [];
        if (warehouseFilter) {
            permitOpeningParams.push(warehouseFilter, warehouseFilter);
            permitOpeningQuery += ` AND (sp.destWarehouseId = ? OR sp.sourceWarehouseId = ?)`;
            permitOpeningParams.push(warehouseFilter, warehouseFilter);
        }
        else {
            // No warehouse filter - just sum all permits
            permitOpeningQuery = `
                SELECT spi.productId,
                       SUM(CASE 
                           WHEN sp.type = 'STOCK_PERMIT_IN' THEN spi.quantity
                           WHEN sp.type = 'STOCK_PERMIT_OUT' THEN -spi.quantity
                           ELSE 0 END) as qty
                FROM stock_permit_items spi
                JOIN stock_permits sp ON spi.permitId = sp.id
                WHERE sp.date < ? ${permitNotExistsClause}`;
        }
        permitOpeningParams.push(startDate);
        permitOpeningQuery += ' GROUP BY spi.productId';
        const [permitOpening] = yield conn.query(permitOpeningQuery, permitOpeningParams);
        // Stock Movements (Production, Adjustments, Opening Balances) - filter by warehouse
        let movementOpeningQuery = `
            SELECT product_id as productId,
                   SUM(qty_change) as qty
            FROM stock_movements
            WHERE movement_date < ?
              AND (reference_type IS NULL OR reference_type != 'VAN_SALE') 
              AND (notes IS NULL OR notes NOT LIKE '%بيع متنقل%')`;
        const movementOpeningParams = [startDate];
        if (warehouseFilter) {
            movementOpeningQuery += ' AND warehouse_id = ?';
            movementOpeningParams.push(warehouseFilter);
        }
        movementOpeningQuery += ' GROUP BY product_id';
        const [movementOpening] = yield conn.query(movementOpeningQuery, movementOpeningParams);
        // 2. Period Movement (startDate <= date <= endDate)
        // Invoices - filter by warehouse
        let invoicePeriodQuery = `
            SELECT il.productId, 
                   SUM(CASE WHEN i.type IN ('INVOICE_PURCHASE', 'RETURN_SALE') THEN il.quantity ELSE 0 END) as inQty,
                   SUM(CASE WHEN i.type IN ('INVOICE_SALE', 'RETURN_PURCHASE') THEN il.quantity ELSE 0 END) as outQty
            FROM invoice_lines il
            JOIN invoices i ON il.invoiceId = i.id
            WHERE i.status = 'POSTED' AND i.date >= ? AND i.date <= ?
              AND i.number NOT LIKE 'VAN-%' -- Exclude Van Sales
              AND NOT EXISTS (
                  SELECT 1 FROM stock_movements sm 
                  WHERE sm.reference_id = i.id 
                    AND sm.product_id = il.productId
                    AND sm.reference_type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE', 'SALE', 'PURCHASE')
              )`;
        const invoicePeriodParams = [startDate, endDateTime];
        if (warehouseFilter) {
            invoicePeriodQuery += ' AND i.warehouseId = ?';
            invoicePeriodParams.push(warehouseFilter);
        }
        invoicePeriodQuery += ' GROUP BY il.productId';
        const [invoicePeriod] = yield conn.query(invoicePeriodQuery, invoicePeriodParams);
        // Permits - filter by warehouse
        let permitPeriodQuery;
        const permitPeriodParams = [];
        if (warehouseFilter) {
            // For specific warehouse, track in/out correctly based on source/dest
            permitPeriodQuery = `
                SELECT spi.productId,
                       SUM(CASE 
                           WHEN sp.type = 'STOCK_PERMIT_IN' AND sp.destWarehouseId = ? THEN spi.quantity
                           WHEN sp.type = 'STOCK_TRANSFER' AND sp.destWarehouseId = ? THEN spi.quantity
                           ELSE 0 END) as inQty,
                       SUM(CASE 
                           WHEN sp.type = 'STOCK_PERMIT_OUT' AND sp.sourceWarehouseId = ? THEN spi.quantity
                           WHEN sp.type = 'STOCK_TRANSFER' AND sp.sourceWarehouseId = ? THEN spi.quantity
                           ELSE 0 END) as outQty
                FROM stock_permit_items spi
                JOIN stock_permits sp ON spi.permitId = sp.id
                WHERE sp.date >= ? AND sp.date <= ?
                  AND (sp.destWarehouseId = ? OR sp.sourceWarehouseId = ?)
                  ${permitNotExistsClause}
                GROUP BY spi.productId`;
            permitPeriodParams.push(warehouseFilter, warehouseFilter, warehouseFilter, warehouseFilter, startDate, endDateTime, warehouseFilter, warehouseFilter);
        }
        else {
            // All warehouses - simple sum
            permitPeriodQuery = `
                SELECT spi.productId,
                       SUM(CASE WHEN sp.type = 'STOCK_PERMIT_IN' THEN spi.quantity ELSE 0 END) as inQty,
                       SUM(CASE WHEN sp.type = 'STOCK_PERMIT_OUT' THEN spi.quantity ELSE 0 END) as outQty
                FROM stock_permit_items spi
                JOIN stock_permits sp ON spi.permitId = sp.id
                WHERE sp.date >= ? AND sp.date <= ?
                  ${permitNotExistsClause}
                GROUP BY spi.productId`;
            permitPeriodParams.push(startDate, endDateTime);
        }
        const [permitPeriod] = yield conn.query(permitPeriodQuery, permitPeriodParams);
        // Stock Movements (Production, Adjustments) - filter by warehouse
        let movementPeriodQuery = `
            SELECT product_id as productId,
                   SUM(CASE WHEN qty_change > 0 THEN qty_change ELSE 0 END) as inQty,
                   SUM(CASE WHEN qty_change < 0 THEN ABS(qty_change) ELSE 0 END) as outQty
            FROM stock_movements
            WHERE movement_date >= ? AND movement_date <= ?
              AND (reference_type IS NULL OR reference_type != 'VAN_SALE')
              AND (notes IS NULL OR notes NOT LIKE '%بيع متنقل%')`;
        const movementPeriodParams = [startDate, endDateTime];
        if (warehouseFilter) {
            movementPeriodQuery += ' AND warehouse_id = ?';
            movementPeriodParams.push(warehouseFilter);
        }
        movementPeriodQuery += ' GROUP BY product_id';
        const [movementPeriod] = yield conn.query(movementPeriodQuery, movementPeriodParams);
        // If warehouse is selected, filter to only include products that have stock in that warehouse
        let relevantProductIds = null;
        if (warehouseFilter) {
            const [warehouseStocks] = yield conn.query('SELECT DISTINCT productId FROM product_stocks WHERE warehouseId = ? AND stock != 0', [warehouseFilter]);
            const [warehouseMovements] = yield conn.query('SELECT DISTINCT product_id as productId FROM stock_movements WHERE warehouse_id = ?', [warehouseFilter]);
            relevantProductIds = new Set([
                ...warehouseStocks.map(r => r.productId),
                ...warehouseMovements.map(r => r.productId)
            ]);
        }
        // Build Maps for O(1) lookups (js-set-map-lookups best practice)
        // Opening balance Maps
        const invoiceOpeningMap = new Map(invoiceOpening.map(x => [x.productId, x.qty]));
        const permitOpeningMap = new Map(permitOpening.map(x => [x.productId, x.qty]));
        const movementOpeningMap = new Map(movementOpening.map(x => [x.productId, x.qty]));
        // Period Maps
        const invoicePeriodMap = new Map(invoicePeriod.map(x => [x.productId, x]));
        const permitPeriodMap = new Map(permitPeriod.map(x => [x.productId, x]));
        const movementPeriodMap = new Map(movementPeriod.map(x => [x.productId, x]));
        // Map results using O(1) Map lookups instead of O(n) find() calls
        const report = products
            .filter(p => {
            // If warehouse filter is set, only include products that have movements/stock in that warehouse
            if (relevantProductIds && !relevantProductIds.has(p.id)) {
                return false;
            }
            return true;
        })
            .map(p => {
            // Opening - O(1) lookups
            const invOpen = invoiceOpeningMap.get(p.id) || 0;
            const permOpen = permitOpeningMap.get(p.id) || 0;
            const movOpen = movementOpeningMap.get(p.id) || 0;
            const openingBalance = Number(invOpen) + Number(permOpen) + Number(movOpen);
            // Period - O(1) lookups
            const invPer = invoicePeriodMap.get(p.id) || { inQty: 0, outQty: 0 };
            const permPer = permitPeriodMap.get(p.id) || { inQty: 0, outQty: 0 };
            const movPer = movementPeriodMap.get(p.id) || { inQty: 0, outQty: 0 };
            const periodIn = Number(invPer.inQty) + Number(permPer.inQty) + Number(movPer.inQty);
            const periodOut = Number(invPer.outQty) + Number(permPer.outQty) + Number(movPer.outQty);
            return {
                productId: p.id,
                name: p.name,
                sku: p.sku,
                warehouseId: warehouseFilter || null,
                opening: openingBalance,
                in: periodIn,
                out: periodOut,
                closing: openingBalance + periodIn - periodOut
            };
        })
            .filter(row => {
            // Filter out products with no movement at all (all zeros)
            return row.opening !== 0 || row.in !== 0 || row.out !== 0 || row.closing !== 0;
        });
        // PERF: console.log(`Generated report with ${report.length} rows`);
        res.json(report);
    }
    catch (error) {
        console.error("Error generating inventory flow report:", error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        if (conn)
            try {
                conn.release();
            }
            catch ( /* ignore */_a) { /* ignore */ }
    }
});
exports.getInventoryFlowReport = getInventoryFlowReport;
const getProductInquiry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn = null;
    try {
        const { productId } = req.params;
        if (!productId) {
            return res.status(400).json({ error: 'Product ID is required' });
        }
        conn = yield (0, db_1.getConnection)();
        // 1. Get product info
        const [productRows] = yield conn.query('SELECT id, name, sku, price, cost, unit, stock FROM products WHERE id = ?', [productId]);
        const product = productRows[0];
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        // 2-5. Run remaining queries in parallel on the same connection
        const [warehouses] = yield conn.query('SELECT id, name FROM warehouses ORDER BY name');
        const [stockRows] = yield conn.query('SELECT warehouseId, stock FROM product_stocks WHERE productId = ?', [productId]);
        const [reservedRows] = yield conn.query(`SELECT warehouseId, SUM(quantity) as reserved
             FROM stock_reservations
             WHERE productId = ? AND status = 'RESERVED'
             GROUP BY warehouseId`, [productId]);
        const [gradeRows] = yield conn.query(`SELECT DISTINCT grade FROM invoice_lines
             WHERE productId = ? AND grade IS NOT NULL AND grade != ''
             ORDER BY grade`, [productId]);
        const stockMap = new Map(stockRows.map(r => [r.warehouseId, parseFloat(r.stock) || 0]));
        const reservedMap = new Map(reservedRows.map(r => [r.warehouseId, parseFloat(r.reserved) || 0]));
        const grades = gradeRows.map(r => r.grade);
        // 6. Build per-warehouse results
        const stocks = warehouses.map((wh) => {
            const stock = stockMap.get(wh.id) || 0;
            const reserved = reservedMap.get(wh.id) || 0;
            return {
                warehouseId: wh.id,
                warehouseName: wh.name,
                stock: Number(stock.toFixed(2)),
                reservedStock: Number(reserved.toFixed(2)),
                available: Number((stock - reserved).toFixed(2)),
            };
        }).filter(s => s.stock !== 0 || s.reservedStock !== 0);
        // 7. Also include warehouses with reservations but no stock entry
        for (const [whId, reserved] of reservedMap) {
            if (!stocks.find(s => s.warehouseId === whId)) {
                const wh = warehouses.find((w) => w.id === whId);
                if (wh) {
                    stocks.push({
                        warehouseId: wh.id,
                        warehouseName: wh.name,
                        stock: 0,
                        reservedStock: Number(reserved.toFixed(2)),
                        available: Number((-reserved).toFixed(2)),
                    });
                }
            }
        }
        res.json({
            product: {
                id: product.id,
                name: product.name,
                sku: product.sku,
                price: parseFloat(product.price) || 0,
                cost: parseFloat(product.cost) || 0,
                unit: product.unit,
                totalStock: parseFloat(product.stock) || 0,
            },
            grades,
            stocks,
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        if (conn)
            try {
                conn.release();
            }
            catch ( /* ignore */_a) { /* ignore */ }
    }
});
exports.getProductInquiry = getProductInquiry;
/**
 * GET /api/inventory/supplier-products/:supplierId
 * Returns distinct product IDs that were purchased from a specific supplier
 * (based on historical purchase invoices). Used by StockBalanceReport supplier filter.
 */
const getSupplierProducts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { supplierId } = req.params;
        if (!supplierId) {
            return res.status(400).json({ error: 'Supplier ID is required' });
        }
        const [rows] = yield db_1.pool.query(`
            SELECT DISTINCT il.productId
            FROM invoice_lines il
            JOIN invoices i ON il.invoiceId = i.id
            WHERE i.partnerId = ? 
              AND i.type = 'INVOICE_PURCHASE'
        `, [supplierId]);
        const productIds = rows.map(r => r.productId);
        res.json({ productIds });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getSupplierProducts = getSupplierProducts;
/**
 * GET /api/inventory/reports/profits
 */
const getItemProfitsReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn = null;
    try {
        const { startDate, endDate, categoryId } = req.query;
        conn = yield (0, db_1.getHeavyConnection)();
        // Build product query with category filter
        let productQuery = 'SELECT id, name, sku, categoryId, cost FROM products WHERE 1=1';
        const productParams = [];
        if (categoryId && categoryId !== 'ALL') {
            productQuery += ' AND categoryId = ?';
            productParams.push(categoryId);
        }
        const [products] = yield conn.query(productQuery, productParams);
        const endDateTime = endDate ? `${endDate} 23:59:59` : null;
        // Query the invoices using JOIN
        let invoiceQuery = `
            SELECT il.productId,
                   SUM(CASE WHEN i.type = 'INVOICE_SALE' THEN il.quantity ELSE 0 END) as qtySold,
                   SUM(CASE WHEN i.type = 'RETURN_SALE' THEN il.quantity ELSE 0 END) as qtyReturned,
                   SUM(CASE WHEN i.type = 'INVOICE_SALE' THEN coalesce(il.total, 0) ELSE 0 END) as revenue,
                   SUM(CASE WHEN i.type = 'RETURN_SALE' THEN coalesce(il.total, 0) ELSE 0 END) as returns,
                   SUM(CASE WHEN i.type = 'INVOICE_SALE' THEN (il.quantity * coalesce(il.cost, p.cost, 0)) ELSE 0 END) as costOfSales,
                   SUM(CASE WHEN i.type = 'RETURN_SALE' THEN (il.quantity * coalesce(il.cost, p.cost, 0)) ELSE 0 END) as costOfReturns
            FROM invoice_lines il
            JOIN invoices i ON il.invoiceId = i.id
            LEFT JOIN products p ON il.productId = p.id
            WHERE i.status = 'POSTED' AND i.type IN ('INVOICE_SALE', 'RETURN_SALE')
        `;
        const invoiceParams = [];
        if (startDate && endDateTime) {
            invoiceQuery += ' AND i.date >= ? AND i.date <= ?';
            invoiceParams.push(startDate, endDateTime);
        }
        invoiceQuery += ' GROUP BY il.productId';
        const [invoiceStats] = yield conn.query(invoiceQuery, invoiceParams);
        // Map it all together
        const statsMap = new Map(invoiceStats.map(x => [x.productId, x]));
        const report = products.map(p => {
            const stat = statsMap.get(p.id) || { qtySold: 0, qtyReturned: 0, revenue: 0, returns: 0, costOfSales: 0, costOfReturns: 0 };
            const netQty = Number(stat.qtySold) - Number(stat.qtyReturned);
            const netRevenue = Number(stat.revenue) - Number(stat.returns);
            const netCost = Number(stat.costOfSales) - Number(stat.costOfReturns);
            const grossProfit = netRevenue - netCost;
            const margin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : (netRevenue < 0 ? -100 : 0);
            const markup = netCost > 0 ? (grossProfit / netCost) * 100 : (grossProfit > 0 ? 100 : 0);
            const profitPerItem = netQty > 0 ? grossProfit / netQty : 0;
            return {
                productId: p.id,
                name: p.name,
                sku: p.sku,
                categoryId: p.categoryId,
                qtySold: Number(stat.qtySold),
                qtyReturned: Number(stat.qtyReturned),
                netQty: netQty,
                revenue: Number(stat.revenue),
                returns: Number(stat.returns),
                netRevenue: netRevenue,
                cost: netCost, // Named cost for frontend mappings
                profit: grossProfit,
                margin: margin,
                markup: markup,
                profitPerItem: profitPerItem
            };
        }).filter(r => r.qtySold > 0 || r.qtyReturned > 0);
        res.json(report);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        if (conn)
            try {
                conn.release();
            }
            catch ( /* ignore */_a) { /* ignore */ }
    }
});
exports.getItemProfitsReport = getItemProfitsReport;
/**
 * GET /api/inventory/reports/variable-pricing
 */
const getVariablePricingReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate, categoryId } = req.query;
        let query = `
            SELECT il.productId, 
                   p.name, p.sku, p.categoryId, p.cost as costPrice,
                   il.price, 
                   SUM(il.quantity) as qty, 
                   SUM(il.total) as revenue, 
                   SUM(il.quantity * COALESCE(il.cost, p.cost, 0)) as cost,
                   GROUP_CONCAT(DISTINCT i.partnerName SEPARATOR '||') as customers
            FROM invoice_lines il
            JOIN invoices i ON il.invoiceId = i.id
            JOIN products p ON il.productId = p.id
            WHERE i.status = 'POSTED' AND i.type = 'INVOICE_SALE'
        `;
        const params = [];
        if (categoryId && categoryId !== 'ALL') {
            query += ' AND p.categoryId = ?';
            params.push(categoryId);
        }
        if (startDate && endDate) {
            query += ' AND i.date >= ? AND i.date <= ?';
            const endDateTime = `${endDate} 23:59:59`;
            params.push(startDate, endDateTime);
        }
        query += ' GROUP BY il.productId, p.name, p.sku, p.categoryId, p.cost, il.price';
        const [rows] = yield (0, db_1.getHeavyConnection)().then((c) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const result = yield c.query(query, params);
                return result;
            }
            finally {
                c.release();
            }
        }));
        // Group rows back by product
        const productMap = new Map();
        for (const row of rows) {
            if (!productMap.has(row.productId)) {
                productMap.set(row.productId, {
                    productId: row.productId,
                    name: row.name,
                    sku: row.sku,
                    categoryId: row.categoryId,
                    costPrice: Number(row.costPrice),
                    totalQty: 0,
                    totalRevenue: 0,
                    totalCost: 0,
                    totalProfit: 0,
                    prices: []
                });
            }
            const p = productMap.get(row.productId);
            const revenue = Number(row.revenue);
            const cost = Number(row.cost);
            const profit = revenue - cost;
            const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
            p.totalQty += Number(row.qty);
            p.totalRevenue += revenue;
            p.totalCost += cost;
            p.totalProfit += profit;
            p.prices.push({
                price: Number(row.price),
                qty: Number(row.qty),
                revenue: revenue,
                cost: cost,
                profit: profit,
                margin: margin,
                customers: row.customers ? row.customers.split('||').filter(Boolean) : []
            });
        }
        // Finalize calculations
        const report = Array.from(productMap.values()).map(p => {
            p.margin = p.totalRevenue > 0 ? (p.totalProfit / p.totalRevenue) * 100 : 0;
            p.priceCount = p.prices.length;
            const priceMap = p.prices.map((px) => px.price);
            p.minPrice = Math.min(...priceMap);
            p.maxPrice = Math.max(...priceMap);
            p.avgPrice = p.totalQty > 0 ? p.totalRevenue / p.totalQty : 0;
            // Sort prices
            p.prices.sort((a, b) => a.price - b.price);
            return p;
        });
        res.json(report);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getVariablePricingReport = getVariablePricingReport;
/**
 * GET /api/inventory/reports/stagnant-items
 */
const getStagnantItemsReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [stats] = yield db_1.pool.query(`
            SELECT il.productId, MAX(i.date) as lastSaleDate
            FROM invoice_lines il
            JOIN invoices i ON il.invoiceId = i.id
            WHERE i.status = 'POSTED' AND i.type = 'INVOICE_SALE'
            GROUP BY il.productId
        `);
        const result = stats.map(r => ({
            productId: r.productId,
            lastSaleDate: r.lastSaleDate
        }));
        res.json(result);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getStagnantItemsReport = getStagnantItemsReport;
// ═══════════════════════════════════════════════════════════
// SERVER-SIDE STOCK VALUATION REPORT
// Replaces the frontend pattern of fetching ALL products (limit=999999)
// and computing totals in the browser. This endpoint does the
// aggregation in SQL and returns paginated results + summary stats.
// ═══════════════════════════════════════════════════════════
const getStockValuation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const warehouseId = req.query.warehouseId;
        const categoryId = req.query.categoryId;
        const search = req.query.search;
        const hideZero = req.query.hideZero === 'true';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const sortBy = req.query.sortBy || 'totalCost';
        const sortDir = req.query.sortDir || 'desc';
        const offset = (page - 1) * limit;
        // Build stock source — either warehouse-specific or global
        let stockExpr;
        const params = [];
        if (warehouseId && warehouseId !== 'ALL') {
            stockExpr = 'COALESCE(ps.stock, 0)';
        }
        else {
            stockExpr = 'p.stock';
        }
        // Build WHERE conditions
        const conditions = [];
        if (categoryId && categoryId !== 'ALL') {
            conditions.push('p.categoryId = ?');
            params.push(categoryId);
        }
        if (hideZero) {
            conditions.push(`${stockExpr} != 0`);
        }
        if (search) {
            conditions.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)');
            const s = `%${search}%`;
            params.push(s, s, s);
        }
        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        // JOIN for warehouse-specific stock
        let joinClause = '';
        if (warehouseId && warehouseId !== 'ALL') {
            joinClause = 'LEFT JOIN product_stocks ps ON p.id = ps.productId AND ps.warehouseId = ?';
            params.unshift(warehouseId); // prepend for JOIN
        }
        // Sort mapping
        const sortMap = {
            name: 'p.name',
            stock: stockExpr,
            cost: 'COALESCE(p.cost, 0)',
            totalCost: `(${stockExpr} * COALESCE(p.cost, 0))`,
            price: 'COALESCE(p.price, 0)',
            totalRetail: `(${stockExpr} * COALESCE(p.price, 0))`,
            margin: `CASE WHEN COALESCE(p.cost, 0) > 0 THEN ((COALESCE(p.price, 0) - COALESCE(p.cost, 0)) / COALESCE(p.cost, 0) * 100) ELSE 0 END`
        };
        const orderExpr = sortMap[sortBy] || sortMap.totalCost;
        const orderDir = sortDir === 'asc' ? 'ASC' : 'DESC';
        // 1. Get summary stats (single query, no LIMIT)
        const countParams = [...params];
        const [summaryRows] = yield db_1.pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(${stockExpr} * COALESCE(p.cost, 0)) as totalAsset,
                SUM(${stockExpr} * COALESCE(p.price, 0)) as totalRetail,
                SUM(CASE WHEN COALESCE(p.price, 0) > 0 THEN ${stockExpr} * COALESCE(p.cost, 0) ELSE 0 END) as sellableAsset,
                SUM(CASE WHEN COALESCE(p.price, 0) > 0 THEN ${stockExpr} * COALESCE(p.price, 0) ELSE 0 END) as sellableRetail,
                SUM(CASE WHEN ${stockExpr} < 0 THEN 1 ELSE 0 END) as negativeCount,
                SUM(CASE WHEN COALESCE(p.price, 0) = 0 AND ${stockExpr} > 0 THEN 1 ELSE 0 END) as noPriceCount
            FROM products p ${joinClause} ${whereClause}
        `, countParams);
        const summary = summaryRows[0];
        // 2. Get paginated products
        const dataParams = [...params, limit, offset];
        const [productRows] = yield db_1.pool.query(`
            SELECT 
                p.id, p.name, p.sku, p.barcode,
                ${stockExpr} as stock,
                COALESCE(p.cost, 0) as cost,
                COALESCE(p.price, 0) as price,
                (${stockExpr} * COALESCE(p.cost, 0)) as totalCost,
                (${stockExpr} * COALESCE(p.price, 0)) as totalRetail,
                CASE WHEN COALESCE(p.price, 0) > 0 
                     THEN (${stockExpr} * COALESCE(p.price, 0)) - (${stockExpr} * COALESCE(p.cost, 0))
                     ELSE 0 END as profit,
                CASE WHEN COALESCE(p.cost, 0) > 0 AND COALESCE(p.price, 0) > 0
                     THEN ((COALESCE(p.price, 0) - COALESCE(p.cost, 0)) / COALESCE(p.cost, 0) * 100)
                     ELSE 0 END as margin,
                CASE WHEN COALESCE(p.price, 0) > 0 THEN 1 ELSE 0 END as hasPrice
            FROM products p ${joinClause} ${whereClause}
            ORDER BY ${orderExpr} ${orderDir}
            LIMIT ? OFFSET ?
        `, dataParams);
        res.json({
            products: productRows,
            summary: {
                total: Number(summary.total) || 0,
                totalAsset: Math.round((Number(summary.totalAsset) || 0) * 100) / 100,
                totalRetail: Math.round((Number(summary.totalRetail) || 0) * 100) / 100,
                sellableAsset: Math.round((Number(summary.sellableAsset) || 0) * 100) / 100,
                sellableRetail: Math.round((Number(summary.sellableRetail) || 0) * 100) / 100,
                negativeCount: Number(summary.negativeCount) || 0,
                noPriceCount: Number(summary.noPriceCount) || 0,
            },
            pagination: {
                page,
                limit,
                total: Number(summary.total) || 0,
                totalPages: Math.ceil((Number(summary.total) || 0) / limit)
            }
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getStockValuation');
    }
});
exports.getStockValuation = getStockValuation;
