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
exports.cancelProduction = exports.finishProduction = exports.startProduction = exports.deleteProductionOrder = exports.updateProductionOrder = exports.createProductionOrder = exports.getProductionOrder = exports.getProductionOrders = void 0;
const db_1 = require("../db");
const reservationController_1 = require("./reservationController");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
/**
 * Production Controller
 * Handles production order operations
 */
// Get all production orders with filters and pagination
const getProductionOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { status, startDate, endDate, productId, limit = 50, offset = 0, search, showArchived } = req.query;
        // Build WHERE clause
        let whereClause = ' WHERE 1=1';
        const params = [];
        if (status && status !== 'ALL') {
            if (status === 'PENDING') {
                whereClause += " AND (po.status = 'PLANNED' OR po.status = 'CONFIRMED')";
            }
            else {
                whereClause += ' AND po.status = ?';
                params.push(status);
            }
        }
        if (startDate) {
            whereClause += ' AND po.start_date >= ?';
            params.push(startDate);
        }
        if (endDate) {
            whereClause += ' AND po.end_date <= ?';
            params.push(endDate);
        }
        if (productId) {
            whereClause += ' AND po.finished_product_id = ?';
            params.push(productId);
        }
        if (search && typeof search === 'string' && search.trim()) {
            whereClause += ' AND (po.order_number LIKE ? OR p.name LIKE ?)';
            const searchPattern = `%${search.trim()}%`;
            params.push(searchPattern, searchPattern);
        }
        if (showArchived !== 'true') {
            whereClause += ' AND (po.is_archived = 0 OR po.is_archived IS NULL)';
        }
        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM production_orders po
            LEFT JOIN products p ON po.finished_product_id = p.id
            ${whereClause}
        `;
        const [countResult] = yield db_1.pool.query(countQuery, params);
        const total = ((_a = countResult[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
        // Get statistics (always for all orders, ignoring pagination)
        let statsQuery = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('PLANNED', 'CONFIRMED', 'WAITING_MATERIALS') THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as inProgress,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled
            FROM production_orders po
            WHERE 1=1
        `;
        const statsParams = [];
        if (showArchived !== 'true') {
            statsQuery += ' AND (po.is_archived = 0 OR po.is_archived IS NULL)';
        }
        const [statsResult] = yield db_1.pool.query(statsQuery, statsParams);
        const stats = statsResult[0] || { total: 0, pending: 0, inProgress: 0, completed: 0, cancelled: 0 };
        // Main query with pagination
        const query = `
            SELECT po.*, 
                   p.name as finished_product_name,
                   p.sku as finished_product_sku,
                   p.unit as finished_product_unit,
                   b.name as bom_name
            FROM production_orders po
            LEFT JOIN products p ON po.finished_product_id = p.id
            LEFT JOIN bom b ON po.bom_id = b.id
            ${whereClause}
            ORDER BY po.created_at DESC
            LIMIT ? OFFSET ?
        `;
        // Add limit and offset to params
        const queryParams = [...params, parseInt(limit), parseInt(offset)];
        const [rows] = yield db_1.pool.query(query, queryParams);
        // Convert snake_case to camelCase for frontend compatibility
        const orders = rows.map(row => ({
            id: row.id,
            orderNumber: row.order_number,
            bomId: row.bom_id,
            bomName: row.bom_name,
            finishedProductId: row.finished_product_id,
            finishedProductName: row.finished_product_name,
            finishedProductSku: row.finished_product_sku,
            finishedProductUnit: row.finished_product_unit,
            qtyPlanned: parseFloat(row.qty_planned) || 0,
            qtyFinished: parseFloat(row.qty_finished) || 0,
            qtyScrapped: parseFloat(row.qty_scrapped) || 0,
            status: row.status,
            priority: row.priority || 'MEDIUM',
            isArchived: row.is_archived === 1,
            scheduledStartDate: row.scheduled_start_date || row.start_date,
            scheduledEndDate: row.scheduled_end_date || row.end_date,
            startDate: row.start_date,
            endDate: row.end_date,
            actualStartDate: row.actual_start_date,
            actualEndDate: row.actual_end_date,
            warehouseId: row.warehouse_id,
            sourceWarehouseId: row.source_warehouse_id || row.warehouse_id,
            destWarehouseId: row.dest_warehouse_id || row.warehouse_id,
            notes: row.notes,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            updatedBy: row.updated_by,
            // Cost Tracking Fields
            standardCost: parseFloat(row.standard_cost) || 0,
            estimatedCost: parseFloat(row.standard_cost) || 0, // Alias for consistency
            actualMaterialCost: parseFloat(row.actual_material_cost) || 0,
            actualScrapCost: parseFloat(row.actual_scrap_cost) || 0,
            materialVariance: parseFloat(row.material_variance) || 0,
            yieldVariance: parseFloat(row.yield_variance) || 0,
            totalVariance: parseFloat(row.total_variance) || 0,
            costPerUnit: row.qty_finished > 0
                ? (parseFloat(row.actual_material_cost) || 0) / parseFloat(row.qty_finished)
                : null
        }));
        res.json({
            orders,
            stats: {
                total: parseInt(stats.total) || 0,
                pending: parseInt(stats.pending) || 0,
                inProgress: parseInt(stats.inProgress) || 0,
                completed: parseInt(stats.completed) || 0,
                cancelled: parseInt(stats.cancelled) || 0
            },
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: parseInt(offset) + orders.length < total
            }
        });
    }
    catch (error) {
        console.error('Error fetching production orders:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getProductionOrders = getProductionOrders;
// Get production order by ID
const getProductionOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [rows] = yield db_1.pool.query(`
            SELECT po.*, 
                   p.name as finished_product_name,
                   p.sku as finished_product_sku,
                   p.unit as finished_product_unit,
                   b.name as bom_name
            FROM production_orders po
            LEFT JOIN products p ON po.finished_product_id = p.id
            LEFT JOIN bom b ON po.bom_id = b.id
            WHERE po.id = ?
        `, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Production order not found' });
        }
        res.json(rows[0]);
    }
    catch (error) {
        console.error('Error fetching production order:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getProductionOrder = getProductionOrder;
// Create production order
const createProductionOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id, orderNumber, bomId, finishedProductId, qtyPlanned, startDate, endDate, warehouseId, // Legacy: kept for backward compatibility
        sourceWarehouseId, // NEW: مخزن المواد الخام - where raw materials come from
        destWarehouseId, // NEW: مخزن المنتج التام - where finished products go
        notes, createdBy } = req.body;
        // Use sourceWarehouseId if provided, otherwise fall back to warehouseId
        const rawMaterialWarehouseId = sourceWarehouseId || warehouseId;
        const finishedProductWarehouseId = destWarehouseId || warehouseId;
        // Validate BOM exists and get cost info
        const [bomRows] = yield db_1.pool.query(`
            SELECT b.id, b.labor_cost, b.overhead_cost 
            FROM bom b 
            WHERE b.id = ?
        `, [bomId]);
        if (bomRows.length === 0) {
            return res.status(404).json({ message: 'BOM not found' });
        }
        const bom = bomRows[0];
        // Calculate estimated cost from BOM
        const [bomItems] = yield db_1.pool.query(`
            SELECT bi.quantity_per_unit, bi.waste_percent, p.cost as unit_cost
            FROM bom_items bi
            LEFT JOIN products p ON bi.raw_product_id = p.id
            WHERE bi.bom_id = ?
        `, [bomId]);
        let materialCostPerUnit = 0;
        for (const item of bomItems) {
            const qtyWithWaste = (item.quantity_per_unit || 0) * (1 + (item.waste_percent || 0) / 100);
            materialCostPerUnit += qtyWithWaste * (item.unit_cost || 0);
        }
        const laborCostPerUnit = parseFloat(bom.labor_cost) || 0;
        const overheadCostPerUnit = parseFloat(bom.overhead_cost) || 0;
        const costPerUnit = materialCostPerUnit + laborCostPerUnit + overheadCostPerUnit;
        const estimatedCost = costPerUnit * qtyPlanned;
        // Generate server-side UUID if client didn't provide one
        const orderId = id || (0, crypto_1.randomUUID)();
        // Idempotent: if this ID already exists (e.g. retry after timeout), return existing order
        const [existingOrder] = yield db_1.pool.query('SELECT id FROM production_orders WHERE id = ?', [orderId]);
        if (existingOrder.length > 0) {
            console.log(`⚠️ Production order ${orderId} already exists — returning existing (idempotent retry)`);
            const [existing] = yield db_1.pool.query(`
                SELECT po.*, p.name as finished_product_name
                FROM production_orders po
                LEFT JOIN products p ON po.finished_product_id = p.id
                WHERE po.id = ?
            `, [orderId]);
            return res.json(existing[0]);
        }
        // Insert production order with estimated cost
        // Store source_warehouse_id for raw materials and dest_warehouse_id for finished products
        yield db_1.pool.query(`
            INSERT INTO production_orders (
                id, order_number, bom_id, finished_product_id, qty_planned,
                start_date, end_date, warehouse_id, source_warehouse_id, dest_warehouse_id, 
                notes, created_by, status, standard_cost
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PLANNED', ?)
        `, [
            orderId,
            orderNumber,
            bomId,
            finishedProductId,
            qtyPlanned,
            startDate || null,
            endDate || null,
            rawMaterialWarehouseId || null, // Legacy warehouse_id = source
            rawMaterialWarehouseId || null, // source_warehouse_id
            finishedProductWarehouseId || null, // dest_warehouse_id
            notes || null,
            createdBy || null,
            estimatedCost
        ]);
        // Attempt to reserve materials from the SOURCE warehouse (raw materials)
        let reservationStatus = 'PLANNED';
        let reservationNotes = '';
        // Check if autoPurchaseOnProduction is enabled
        let autoPurchaseEnabled = false;
        try {
            const [configRows] = yield db_1.pool.query('SELECT config FROM system_config LIMIT 1');
            if (configRows.length > 0 && configRows[0].config) {
                const config = typeof configRows[0].config === 'string' ? JSON.parse(configRows[0].config) : configRows[0].config;
                autoPurchaseEnabled = ((_a = config === null || config === void 0 ? void 0 : config.modules) === null || _a === void 0 ? void 0 : _a.autoPurchaseOnProduction) === true;
            }
        }
        catch (e) { /* ignore config parse error */ }
        try {
            // Pass rawMaterialWarehouseId to only reserve from the raw materials warehouse
            const reservationResult = yield reservationController_1.reservationController.createReservations(orderId, bomId, Number(qtyPlanned), rawMaterialWarehouseId || undefined);
            if (reservationResult.success) {
                reservationStatus = 'CONFIRMED';
            }
            else if (autoPurchaseEnabled) {
                // Auto-purchase enabled: keep as CONFIRMED since materials will be bought on start
                reservationStatus = 'CONFIRMED';
                reservationNotes = 'سيتم شراء المواد الناقصة تلقائياً عند بدء التصنيع';
            }
            else {
                reservationStatus = 'WAITING_MATERIALS';
                const missing = (_b = reservationResult.insufficientMaterials) === null || _b === void 0 ? void 0 : _b.map((m) => m.productId).join(', ');
                reservationNotes = `Missing materials: ${missing}`;
            }
            // Update status based on reservation
            yield db_1.pool.query('UPDATE production_orders SET status = ?, notes = CONCAT(COALESCE(notes, ""), ?) WHERE id = ?', [reservationStatus, reservationNotes ? `\n[System]: ${reservationNotes}` : '', orderId]);
        }
        catch (err) {
            console.error('Failed to reserve materials:', err);
            // Don't fail the order creation, just leave as PLANNED
        }
        // --- Auto-Create Packaging Task ---
        try {
            // Check if the finished product has a PRIMARY packaging spec
            const [specs] = yield db_1.pool.query(`SELECT id FROM product_packaging_specs WHERE product_id = ? AND level = 'PRIMARY' LIMIT 1`, [finishedProductId]);
            if (specs.length > 0) {
                const specId = specs[0].id;
                const taskId = (0, crypto_1.randomUUID)();
                yield db_1.pool.query(`
                    INSERT INTO production_order_packaging (id, production_order_id, packaging_spec_id, qty_planned, status)
                    VALUES (?, ?, ?, ?, 'PENDING')
                `, [taskId, orderId, specId, qtyPlanned]);
                console.log(`✅ Created packaging task ${taskId} for production order ${orderId}`);
            }
        }
        catch (err) {
            console.error('Failed to auto-create packaging task:', err);
        }
        // Return created order
        const [result] = yield db_1.pool.query(`
            SELECT po.*, p.name as finished_product_name
            FROM production_orders po
            LEFT JOIN products p ON po.finished_product_id = p.id
            WHERE po.id = ?
        `, [orderId]);
        res.json(result[0]);
    }
    catch (error) {
        console.error('Error creating production order:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.createProductionOrder = createProductionOrder;
// Update production order
const updateProductionOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { qtyPlanned, startDate, endDate, notes, warehouseId, destWarehouseId, isArchived } = req.body;
        // Check if order exists and is PLANNED
        const [rows] = yield db_1.pool.query('SELECT status FROM production_orders WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Production order not found' });
        }
        const currentStatus = rows[0].status;
        if (currentStatus !== 'PLANNED' && currentStatus !== 'CONFIRMED' && currentStatus !== 'WAITING_MATERIALS') {
            // Allow updating notes even if not planned, but restrict other fields?
            // For now, let's allow updating notes anytime, but others only if PLANNED.
            // Actually, user might want to update dates even if in progress.
            // Let's allow it.
        }
        const sanitizeDate = (d) => d ? String(d).split('T')[0] : null;
        const isArchivedVal = isArchived !== undefined ? (isArchived ? 1 : 0) : null;
        yield db_1.pool.query(`
            UPDATE production_orders 
            SET qty_planned = COALESCE(?, qty_planned),
                start_date = COALESCE(?, start_date),
                end_date = COALESCE(?, end_date),
                notes = COALESCE(?, notes),
                warehouse_id = COALESCE(?, warehouse_id),
                source_warehouse_id = COALESCE(?, source_warehouse_id),
                dest_warehouse_id = COALESCE(?, dest_warehouse_id),
                is_archived = COALESCE(?, is_archived)
            WHERE id = ?
        `, [
            qtyPlanned,
            sanitizeDate(startDate),
            sanitizeDate(endDate),
            notes,
            warehouseId,
            warehouseId,
            destWarehouseId,
            isArchivedVal,
            id
        ]);
        // Return updated order
        const [result] = yield db_1.pool.query(`
            SELECT po.*, p.name as finished_product_name
            FROM production_orders po
            LEFT JOIN products p ON po.finished_product_id = p.id
            WHERE po.id = ?
        `, [id]);
        res.json(result[0]);
    }
    catch (error) {
        console.error('Error updating production order:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updateProductionOrder = updateProductionOrder;
// Delete production order
const deleteProductionOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        // Check if order exists and get its details
        const [rows] = yield connection.query('SELECT * FROM production_orders WHERE id = ?', [id]);
        if (rows.length === 0) {
            yield connection.rollback();
            return res.status(404).json({ message: 'أمر التصنيع غير موجود' });
        }
        const order = rows[0];
        const currentStatus = order.status;
        // If COMPLETED, reverse BOTH materials (add back) AND finished products (remove)
        if (currentStatus === 'COMPLETED') {
            const sourceWarehouse = order.source_warehouse_id || order.warehouse_id;
            const destWarehouse = order.dest_warehouse_id || order.warehouse_id;
            // 1. Reverse Finished Products (remove from inventory)
            const qtyFinished = order.qty_finished || order.qty_planned;
            const qtyScrapped = order.qty_scrapped || 0;
            const goodQty = Math.max(0, qtyFinished - qtyScrapped);
            // Remove from global product stock
            yield connection.query('UPDATE products SET stock = stock - ? WHERE id = ?', [goodQty, order.finished_product_id]);
            // Remove from destination warehouse
            if (destWarehouse) {
                yield connection.query(`UPDATE product_stocks SET stock = stock - ? WHERE productId = ? AND warehouseId = ?`, [goodQty, order.finished_product_id, destWarehouse]);
            }
            // Create reverse stock movement for finished product
            yield connection.query(`
                INSERT INTO stock_movements (
                    product_id, warehouse_id, qty_change, movement_type,
                    reference_type, reference_id, notes
                ) VALUES (?, ?, ?, 'ADJUSTMENT', 'PRODUCTION_ORDER', ?, ?)
            `, [
                order.finished_product_id,
                destWarehouse,
                -goodQty,
                id,
                `إلغاء المنتج التام - حذف أمر التصنيع ${order.order_number}`
            ]);
            // 2. Reverse Raw Materials (add back to inventory)
            const [bomItems] = yield connection.query(`
                SELECT bi.*, p.name
                FROM bom_items bi
                LEFT JOIN products p ON bi.raw_product_id = p.id
                WHERE bi.bom_id = ?
            `, [order.bom_id]);
            for (const item of bomItems) {
                const qtyWithWaste = item.quantity_per_unit * (1 + (item.waste_percent || 0) / 100);
                const totalConsumed = qtyWithWaste * order.qty_planned;
                // Add back to global product stock
                yield connection.query('UPDATE products SET stock = stock + ? WHERE id = ?', [totalConsumed, item.raw_product_id]);
                // Add back to source warehouse
                if (sourceWarehouse) {
                    yield connection.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) 
                         VALUES (?, ?, ?, ?) 
                         ON DUPLICATE KEY UPDATE stock = stock + ?`, [(0, crypto_1.randomUUID)(), item.raw_product_id, sourceWarehouse, totalConsumed, totalConsumed]);
                }
                // Create reverse stock movement
                yield connection.query(`
                    INSERT INTO stock_movements (
                        product_id, warehouse_id, qty_change, movement_type,
                        reference_type, reference_id, notes
                    ) VALUES (?, ?, ?, 'ADJUSTMENT', 'PRODUCTION_ORDER', ?, ?)
                `, [
                    item.raw_product_id,
                    sourceWarehouse,
                    totalConsumed,
                    id,
                    `استرجاع المواد - حذف أمر مكتمل ${order.order_number}`
                ]);
            }
            console.log(`✅ Reversed COMPLETED order ${order.order_number}: materials returned, finished products removed`);
        }
        // If IN_PROGRESS, reverse the stock movements (return materials to warehouse)
        if (currentStatus === 'IN_PROGRESS') {
            // Get the BOM items to know what materials were consumed
            const [bomItems] = yield connection.query(`
                SELECT bi.*, p.name, p.stock as current_stock
                FROM bom_items bi
                LEFT JOIN products p ON bi.raw_product_id = p.id
                WHERE bi.bom_id = ?
            `, [order.bom_id]);
            const sourceWarehouse = order.source_warehouse_id || order.warehouse_id;
            // Reverse the stock deductions for each BOM item
            for (const item of bomItems) {
                const qtyWithWaste = item.quantity_per_unit * (1 + (item.waste_percent || 0) / 100);
                const totalConsumed = qtyWithWaste * order.qty_planned;
                // Add back to global product stock
                yield connection.query('UPDATE products SET stock = stock + ? WHERE id = ?', [totalConsumed, item.raw_product_id]);
                // Add back to warehouse-level product_stocks
                if (sourceWarehouse) {
                    const [existingStock] = yield connection.query('SELECT id FROM product_stocks WHERE productId = ? AND warehouseId = ?', [item.raw_product_id, sourceWarehouse]);
                    if (existingStock.length > 0) {
                        yield connection.query('UPDATE product_stocks SET stock = stock + ? WHERE productId = ? AND warehouseId = ?', [totalConsumed, item.raw_product_id, sourceWarehouse]);
                    }
                    else {
                        // Create new record with the returned amount
                        const [productRow] = yield connection.query('SELECT stock FROM products WHERE id = ?', [item.raw_product_id]);
                        const globalStock = parseFloat((_a = productRow[0]) === null || _a === void 0 ? void 0 : _a.stock) || 0;
                        yield connection.query('INSERT INTO product_stocks (id, productId, warehouseId, stock) VALUES (?, ?, ?, ?)', [(0, crypto_1.randomUUID)(), item.raw_product_id, sourceWarehouse, globalStock]);
                    }
                }
                // Create reverse stock movement (return materials)
                yield connection.query(`
                    INSERT INTO stock_movements (
                        product_id, warehouse_id, qty_change, movement_type,
                        reference_type, reference_id, notes
                    ) VALUES (?, ?, ?, 'ADJUSTMENT', 'PRODUCTION_ORDER', ?, ?)
                `, [
                    item.raw_product_id,
                    sourceWarehouse,
                    totalConsumed,
                    id,
                    `استرجاع المواد - حذف أمر التصنيع ${order.order_number}`
                ]);
            }
            console.log(`✅ Reversed stock for deleted IN_PROGRESS order ${order.order_number}`);
        }
        // Release any material reservations
        try {
            yield reservationController_1.reservationController.releaseReservations(id);
        }
        catch (err) {
            console.error('Error releasing reservations during delete:', err);
        }
        // Delete related stock movements for this production order
        yield connection.query(`DELETE FROM stock_movements WHERE reference_type = 'PRODUCTION_ORDER' AND reference_id = ?`, [id]);
        // Delete material reservations
        yield connection.query('DELETE FROM material_reservations WHERE productionOrderId = ?', [id]);
        // Delete the production order
        yield connection.query('DELETE FROM production_orders WHERE id = ?', [id]);
        yield connection.commit();
        res.json({
            success: true,
            message: currentStatus === 'COMPLETED'
                ? 'تم حذف أمر التصنيع المكتمل وإرجاع المواد وإزالة المنتج التام بنجاح'
                : currentStatus === 'IN_PROGRESS'
                    ? 'تم حذف أمر التصنيع وإرجاع المواد للمخزن بنجاح'
                    : 'تم حذف أمر التصنيع بنجاح'
        });
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error deleting production order:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.deleteProductionOrder = deleteProductionOrder;
// Start production
const startProduction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        // Get production order
        const [orderRows] = yield connection.query('SELECT * FROM production_orders WHERE id = ?', [id]);
        if (orderRows.length === 0) {
            throw new Error('Production order not found');
        }
        const order = orderRows[0];
        if (order.status !== 'PLANNED' && order.status !== 'CONFIRMED') {
            throw new Error('Order must be in PLANNED or CONFIRMED status to start');
        }
        // Get BOM items with stock
        const [items] = yield connection.query(`
            SELECT bi.*, 
                   p.name,
                   COALESCE(p.stock, 0) as available_stock
            FROM bom_items bi
            LEFT JOIN products p ON bi.raw_product_id = p.id
            WHERE bi.bom_id = ?
        `, [order.bom_id]);
        // Check stock availability (Double check even if reserved)
        const shortages = [];
        for (const item of items) {
            const qtyWithWaste = item.quantity_per_unit * (1 + item.waste_percent / 100);
            const totalRequired = qtyWithWaste * order.qty_planned;
            const availableStock = parseFloat(item.available_stock) || 0;
            if (availableStock < totalRequired) {
                shortages.push({
                    product: item.name,
                    required: totalRequired,
                    available: availableStock,
                    shortage: totalRequired - availableStock
                });
            }
        }
        // Log shortages as warning but allow production to proceed (for testing/simple mode)
        if (shortages.length > 0) {
            console.warn('⚠️ Stock shortages detected but allowing production:', shortages);
            // For strict mode, uncomment below:
            // return res.status(400).json({
            //     message: 'Insufficient stock for production',
            //     shortages
            // });
        }
        // Consume reservations first
        yield reservationController_1.reservationController.consumeReservations(id);
        // Phase 6: Consume specific inventory batches if provided
        const { materialBatches } = req.body;
        if (materialBatches && Array.isArray(materialBatches)) {
            for (const batch of materialBatches) {
                // Deduct from batch quantity (Consumption)
                yield connection.query('UPDATE inventory_batches SET quantity = quantity - ?, available_quantity = available_quantity - ? WHERE id = ?', [batch.quantity, batch.quantity, batch.batchId]);
            }
            // Store allocation for Genealogy (to be linked at finish)
            const allocationNote = `\n[BATCH_ALLOCATION]:${JSON.stringify(materialBatches)}`;
            yield connection.query('UPDATE production_orders SET notes = CONCAT(COALESCE(notes, ""), ?) WHERE id = ?', [allocationNote, id]);
        }
        // Deduct raw materials
        for (const item of items) {
            const qtyWithWaste = item.quantity_per_unit * (1 + item.waste_percent / 100);
            const totalRequired = qtyWithWaste * order.qty_planned;
            // Use source_warehouse_id for raw materials, fall back to warehouse_id
            const sourceWarehouse = order.source_warehouse_id || order.warehouse_id;
            // Update global product stock
            yield connection.query('UPDATE products SET stock = stock - ? WHERE id = ?', [totalRequired, item.raw_product_id]);
            // Update warehouse-level product_stocks (from SOURCE warehouse)
            if (sourceWarehouse) {
                // FIX: Check if record exists first, then insert or update properly
                const [existingStock] = yield connection.query('SELECT id, stock FROM product_stocks WHERE productId = ? AND warehouseId = ?', [item.raw_product_id, sourceWarehouse]);
                if (existingStock.length > 0) {
                    // Record exists - just deduct
                    yield connection.query('UPDATE product_stocks SET stock = stock - ? WHERE productId = ? AND warehouseId = ?', [totalRequired, item.raw_product_id, sourceWarehouse]);
                }
                else {
                    // WARNING: No product_stocks record exists for this product in the source warehouse!
                    // This means the product has never been added to this warehouse.
                    // We will NOT create a phantom entry - the user should first add stock via Stock Permit.
                    // The global stock deduction still happens above (line 665-668).
                    console.warn(`⚠️ [Production ${id}] WARNING: Product ${item.raw_product_id} has no stock record in warehouse ${sourceWarehouse}. Skipping warehouse-level deduction. Consider adding stock via Stock Permit first.`);
                }
            }
            // Create stock movement (from SOURCE warehouse)
            yield connection.query(`
                INSERT INTO stock_movements (
                    product_id, warehouse_id, qty_change, movement_type,
                    reference_type, reference_id, notes
                ) VALUES (?, ?, ?, 'PRODUCTION_USE', 'PRODUCTION_ORDER', ?, ?)
            `, [
                item.raw_product_id,
                sourceWarehouse,
                -totalRequired,
                id,
                `Production deduction for order ${order.order_number}`
            ]);
        }
        // Update order status
        yield connection.query(`
            UPDATE production_orders 
            SET status = 'IN_PROGRESS', actual_start_date = NOW()
            WHERE id = ?
        `, [id]);
        // ==========================================
        // AUTO PURCHASE INVOICE GENERATION
        // ==========================================
        try {
            // Check system config for autoPurchaseOnProduction flag
            const [configRows] = yield connection.query('SELECT config FROM system_config LIMIT 1');
            let autoPurchaseEnabled = false;
            if (configRows.length > 0 && configRows[0].config) {
                try {
                    const config = typeof configRows[0].config === 'string'
                        ? JSON.parse(configRows[0].config)
                        : configRows[0].config;
                    autoPurchaseEnabled = ((_a = config === null || config === void 0 ? void 0 : config.modules) === null || _a === void 0 ? void 0 : _a.autoPurchaseOnProduction) === true;
                }
                catch (e) {
                    // Config parse error - skip
                }
            }
            if (autoPurchaseEnabled) {
                // Re-fetch BOM items WITH supplier info
                const [bomItemsWithSupplier] = yield connection.query(`
                    SELECT bi.*, 
                           p.name as product_name,
                           p.sku as product_sku,
                           p.cost as product_cost,
                           p.unit as product_unit,
                           bi.supplier_id,
                           sup.name as supplier_name
                    FROM bom_items bi
                    LEFT JOIN products p ON bi.raw_product_id = p.id
                    LEFT JOIN partners sup ON bi.supplier_id = sup.id
                    WHERE bi.bom_id = ?
                `, [order.bom_id]);
                // Group items by supplier_id (skip items with no supplier)
                const supplierGroups = new Map();
                for (const bomItem of bomItemsWithSupplier) {
                    if (!bomItem.supplier_id)
                        continue; // Skip items without supplier
                    if (!supplierGroups.has(bomItem.supplier_id)) {
                        supplierGroups.set(bomItem.supplier_id, {
                            supplierId: bomItem.supplier_id,
                            supplierName: bomItem.supplier_name || 'مورد',
                            items: []
                        });
                    }
                    supplierGroups.get(bomItem.supplier_id).items.push(bomItem);
                }
                // Create one INVOICE_PURCHASE per supplier
                for (const [supplierId, group] of supplierGroups) {
                    const invoiceId = (0, crypto_1.randomUUID)();
                    const today = new Date().toISOString().split('T')[0];
                    // Generate invoice number (PUR-XXXXX)
                    const [existingNums] = yield connection.query(`SELECT number FROM invoices WHERE number LIKE 'PUR-%'`);
                    let maxNum = 0;
                    existingNums.forEach((row) => {
                        if (row.number && row.number.startsWith('PUR-')) {
                            const suffix = row.number.substring(4);
                            if (/^\d+$/.test(suffix)) {
                                const num = parseInt(suffix, 10);
                                if (num > maxNum)
                                    maxNum = num;
                            }
                        }
                    });
                    const invoiceNumber = `PUR-${String(maxNum + 1).padStart(5, '0')}`;
                    // Calculate lines and total
                    let invoiceTotal = 0;
                    const invoiceLines = [];
                    for (const bomItem of group.items) {
                        const qtyWithWaste = bomItem.quantity_per_unit * (1 + (bomItem.waste_percent || 0) / 100);
                        const totalQty = qtyWithWaste * order.qty_planned;
                        const unitCost = parseFloat(bomItem.product_cost) || 0;
                        const lineTotal = totalQty * unitCost;
                        invoiceTotal += lineTotal;
                        invoiceLines.push({
                            productId: bomItem.raw_product_id,
                            productName: bomItem.product_name || '',
                            quantity: Number(totalQty.toFixed(5)),
                            price: Number(unitCost.toFixed(2)),
                            cost: Number(unitCost.toFixed(2)),
                            total: Number(lineTotal.toFixed(2))
                        });
                    }
                    invoiceTotal = Number(invoiceTotal.toFixed(2));
                    // Insert the invoice
                    yield connection.query(`INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, paidAmount) 
                         VALUES (?, ?, ?, 'INVOICE_PURCHASE', ?, ?, ?, 'POSTED', 'CREDIT', 1, ?, 0)`, [
                        invoiceId,
                        invoiceNumber,
                        today,
                        supplierId,
                        group.supplierName,
                        invoiceTotal,
                        `فاتورة شراء تلقائية - أمر تصنيع #${order.order_number}`
                    ]);
                    // Insert invoice lines
                    for (const line of invoiceLines) {
                        yield connection.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total)
                             VALUES (?, ?, ?, ?, ?, ?, 0, ?)`, [invoiceId, line.productId, line.productName, line.quantity, line.price, line.cost, line.total]);
                    }
                    console.log(`🧾 Auto-created purchase invoice ${invoiceNumber} for supplier "${group.supplierName}" (${invoiceLines.length} items, total: ${invoiceTotal})`);
                }
                if (supplierGroups.size > 0) {
                    console.log(`✅ Auto-created ${supplierGroups.size} purchase invoice(s) for production order ${order.order_number}`);
                }
            }
        }
        catch (autoPurchaseError) {
            // Non-critical: log but don't fail the production start
            console.error('⚠️ Error in auto-purchase invoice generation (non-critical):', autoPurchaseError);
        }
        yield connection.commit();
        // Return updated order
        const [result] = yield db_1.pool.query('SELECT * FROM production_orders WHERE id = ?', [id]);
        res.json(result[0]);
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error starting production:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.startProduction = startProduction;
// Finish production
const finishProduction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        const { qtyFinished, qtyScrapped, scrapEntries } = req.body;
        // Get production order
        const [orderRows] = yield connection.query('SELECT * FROM production_orders WHERE id = ?', [id]);
        if (orderRows.length === 0) {
            throw new Error('Production order not found');
        }
        const order = orderRows[0];
        // If order is not yet IN_PROGRESS, auto-start it (deduct materials) before finishing
        if (order.status === 'PLANNED' || order.status === 'CONFIRMED' || order.status === 'WAITING_MATERIALS') {
            console.log(`⚡ Auto-starting order ${order.order_number} (was ${order.status}) before finishing`);
            // Get BOM items for material deduction
            const [autoStartItems] = yield connection.query(`
                SELECT bi.*, COALESCE(p.stock, 0) as available_stock
                FROM bom_items bi
                LEFT JOIN products p ON bi.raw_product_id = p.id
                WHERE bi.bom_id = ?
            `, [order.bom_id]);
            // Consume reservations
            try {
                yield reservationController_1.reservationController.consumeReservations(id);
            }
            catch (e) { /* ignore */ }
            // Deduct raw materials (same logic as startProduction)
            for (const item of autoStartItems) {
                const qtyWithWaste = item.quantity_per_unit * (1 + (item.waste_percent || 0) / 100);
                const totalRequired = qtyWithWaste * order.qty_planned;
                const sourceWarehouse = order.source_warehouse_id || order.warehouse_id;
                yield connection.query('UPDATE products SET stock = stock - ? WHERE id = ?', [totalRequired, item.raw_product_id]);
                if (sourceWarehouse) {
                    const [existingStock] = yield connection.query('SELECT id FROM product_stocks WHERE productId = ? AND warehouseId = ?', [item.raw_product_id, sourceWarehouse]);
                    if (existingStock.length > 0) {
                        yield connection.query('UPDATE product_stocks SET stock = stock - ? WHERE productId = ? AND warehouseId = ?', [totalRequired, item.raw_product_id, sourceWarehouse]);
                    }
                }
                yield connection.query(`
                    INSERT INTO stock_movements (
                        product_id, warehouse_id, qty_change, movement_type,
                        reference_type, reference_id, notes
                    ) VALUES (?, ?, ?, 'PRODUCTION_USE', 'PRODUCTION_ORDER', ?, ?)
                `, [
                    item.raw_product_id,
                    sourceWarehouse,
                    -totalRequired,
                    id,
                    `Auto-start deduction for order ${order.order_number}`
                ]);
            }
            // Mark as IN_PROGRESS
            yield connection.query(`
                UPDATE production_orders SET status = 'IN_PROGRESS', actual_start_date = NOW() WHERE id = ?
            `, [id]);
            order.status = 'IN_PROGRESS';
            console.log(`✅ Auto-started order ${order.order_number}`);
        }
        else if (order.status !== 'IN_PROGRESS') {
            throw new Error(`لا يمكن إنهاء أمر التصنيع - الحالة الحالية: ${order.status} (يجب أن يكون قيد التنفيذ)`);
        }
        // === VARIANCE ANALYSIS: Calculate Standard Cost from BOM ===
        const [bomItems] = yield connection.query(`
            SELECT bi.*, p.cost as raw_product_cost
            FROM bom_items bi
            LEFT JOIN products p ON bi.raw_product_id = p.id
            WHERE bi.bom_id = ?
        `, [order.bom_id]);
        let standardCost = 0;
        for (const item of bomItems) {
            const qtyPerUnit = item.quantity_per_unit * (1 + item.waste_percent / 100);
            const totalQty = qtyPerUnit * order.qty_planned;
            standardCost += totalQty * (item.raw_product_cost || 0);
        }
        // === VARIANCE ANALYSIS: Calculate Actual Material Cost ===
        // Get all PRODUCTION_USE movements for this order
        const [materialMovements] = yield connection.query(`
            SELECT sm.*, p.cost as product_cost
            FROM stock_movements sm
            LEFT JOIN products p ON sm.product_id = p.id
            WHERE sm.reference_type = 'PRODUCTION_ORDER' 
              AND sm.reference_id = ?
              AND sm.movement_type = 'PRODUCTION_USE'
        `, [id]);
        let actualMaterialCost = 0;
        for (const movement of materialMovements) {
            const qtyUsed = Math.abs(movement.qty_change);
            actualMaterialCost += qtyUsed * (movement.product_cost || 0);
        }
        // Phase 6: Create Finished Good Batch & Genealogy
        const { finishedBatchNumber, expiryDate } = req.body;
        let finishedBatchId = null;
        // Calculate good quantity (what actually goes to inventory)
        const goodQty = Math.max(0, (qtyFinished || 0) - (qtyScrapped || 0));
        if (finishedBatchNumber && goodQty > 0) {
            // Create Batch
            finishedBatchId = crypto.randomUUID();
            yield connection.query(`
                INSERT INTO inventory_batches (
                    id, batch_number, product_id, warehouse_id, quantity,
                    available_quantity, manufacture_date, expiry_date,
                    production_order_id, status
                ) VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, ?, 'ACTIVE')
            `, [
                finishedBatchId,
                finishedBatchNumber,
                order.finished_product_id,
                order.warehouse_id,
                goodQty, // Only good quantity in batch
                goodQty,
                expiryDate || null,
                id
            ]);
            // Create Genealogy (Backward Trace)
            const notes = order.notes || '';
            const match = notes.match(/\[BATCH_ALLOCATION\]:(.*)/);
            if (match) {
                try {
                    const allocatedBatches = JSON.parse(match[1]);
                    for (const parent of allocatedBatches) {
                        yield connection.query(`
                            INSERT INTO batch_genealogy (
                                id, child_batch_id, parent_batch_id, 
                                production_order_id, quantity_consumed
                            ) VALUES (UUID(), ?, ?, ?, ?)
                        `, [finishedBatchId, parent.batchId, id, parent.quantity]);
                    }
                }
                catch (e) {
                    console.error('Error parsing batch allocation:', e);
                }
            }
        }
        // Add ONLY GOOD finished goods to stock (not including scrap)
        if (goodQty > 0) {
            // Use dest_warehouse_id for finished products, fall back to warehouse_id
            const destWarehouse = order.dest_warehouse_id || order.warehouse_id;
            // Update global product stock
            yield connection.query('UPDATE products SET stock = stock + ? WHERE id = ?', [goodQty, order.finished_product_id]);
            // Update warehouse-level product_stocks (to DESTINATION warehouse)
            if (destWarehouse) {
                yield connection.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) 
                     VALUES (?, ?, ?, ?) 
                     ON DUPLICATE KEY UPDATE stock = stock + ?`, [(0, crypto_1.randomUUID)(), order.finished_product_id, destWarehouse, goodQty, goodQty]);
            }
            // Create stock movement for output (to DESTINATION warehouse)
            yield connection.query(`
                INSERT INTO stock_movements (
                    product_id, warehouse_id, qty_change, movement_type,
                    reference_type, reference_id, notes, batch_id
                ) VALUES (?, ?, ?, 'PRODUCTION_OUTPUT', 'PRODUCTION_ORDER', ?, ?, ?)
            `, [
                order.finished_product_id,
                destWarehouse,
                goodQty, // Only good quantity
                id,
                `Production output for order ${order.order_number} (Good: ${goodQty}, Scrap: ${qtyScrapped || 0})`,
                finishedBatchId
            ]);
        }
        // === VARIANCE ANALYSIS: Track Scrap Cost ===
        let actualScrapCost = 0;
        // Handle scrap tracking (for cost analysis only - no inventory movement)
        if (qtyScrapped && qtyScrapped > 0) {
            // Get finished product cost for scrap valuation
            const [finishedProduct] = yield connection.query('SELECT cost, unit, name FROM products WHERE id = ?', [order.finished_product_id]);
            const finishedCost = ((_a = finishedProduct[0]) === null || _a === void 0 ? void 0 : _a.cost) || 0;
            const finishedUnit = ((_b = finishedProduct[0]) === null || _b === void 0 ? void 0 : _b.unit) || 'وحدة';
            const finishedName = ((_c = finishedProduct[0]) === null || _c === void 0 ? void 0 : _c.name) || 'منتج';
            actualScrapCost += qtyScrapped * finishedCost;
            // Create production_scrap record for cost tracking (NOT affecting inventory)
            yield connection.query(`
                INSERT INTO production_scrap (
                    id, production_order_id, product_id, warehouse_id,
                    quantity, unit, scrap_type, reason,
                    unit_cost, total_value, created_by
                ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id,
                order.finished_product_id,
                order.warehouse_id,
                qtyScrapped,
                finishedUnit,
                'DEFECTIVE_MATERIAL',
                `هالك من أمر التصنيع ${order.order_number} - ${finishedName}`,
                finishedCost,
                qtyScrapped * finishedCost,
                ((_d = req.user) === null || _d === void 0 ? void 0 : _d.name) || 'System'
            ]);
        }
        // Handle detailed scrap entries
        if (scrapEntries && Array.isArray(scrapEntries)) {
            for (const entry of scrapEntries) {
                const totalValue = (entry.unitCost || 0) * entry.quantity;
                actualScrapCost += totalValue;
                yield connection.query(`
                    INSERT INTO production_scrap (
                        id, production_order_id, product_id, warehouse_id,
                        quantity, unit, scrap_type, reason,
                        unit_cost, total_value, created_by
                    ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    id,
                    entry.productId,
                    order.warehouse_id,
                    entry.quantity,
                    entry.unit,
                    entry.scrapType || 'CUTTING_WASTE',
                    entry.reason,
                    entry.unitCost,
                    totalValue,
                    ((_e = req.user) === null || _e === void 0 ? void 0 : _e.name) || 'System'
                ]);
            }
        }
        // === VARIANCE ANALYSIS: Calculate Variances ===
        const materialVariance = actualMaterialCost - standardCost;
        const yieldVariance = actualScrapCost; // Scrap is pure loss
        const totalVariance = materialVariance + yieldVariance;
        // Update order with variance analysis
        yield connection.query(`
            UPDATE production_orders 
            SET status = 'COMPLETED',
                qty_finished = ?,
                qty_scrapped = ?,
                actual_end_date = NOW(),
                standard_cost = ?,
                actual_material_cost = ?,
                actual_scrap_cost = ?,
                material_variance = ?,
                yield_variance = ?,
                total_variance = ?,
                finished_batch_id = ?
            WHERE id = ?
        `, [
            qtyFinished || 0,
            qtyScrapped || 0,
            standardCost,
            actualMaterialCost,
            actualScrapCost,
            materialVariance,
            yieldVariance,
            totalVariance,
            finishedBatchId,
            id
        ]);
        yield connection.commit();
        // Return updated order with variance data
        const [result] = yield db_1.pool.query('SELECT * FROM production_orders WHERE id = ?', [id]);
        const completedOrder = result[0];
        res.json(completedOrder);
        // Broadcast real-time update via WebSocket
        const user = ((_f = req.user) === null || _f === void 0 ? void 0 : _f.name) || 'System';
        // Notify about production completion
        eventBus_1.eventBus.broadcast('production:completed', {
            orderId: id,
            orderNumber: completedOrder.order_number,
            productId: order.finished_product_id,
            qtyFinished,
            completedBy: user
        });
        // Notify about stock change (for inventory views to refresh)
        eventBus_1.eventBus.broadcast('stock:updated', {
            productId: order.finished_product_id,
            warehouseId: order.warehouse_id,
            changeType: 'PRODUCTION_OUTPUT',
            updatedBy: user
        });
        // Generic entity change notification
        eventBus_1.eventBus.broadcast('entity:changed', {
            entityType: 'products',
            updatedBy: user
        });
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error finishing production:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.finishProduction = finishProduction;
// Cancel production
const cancelProduction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        // Get production order
        const [orderRows] = yield connection.query('SELECT * FROM production_orders WHERE id = ?', [id]);
        if (orderRows.length === 0) {
            throw new Error('Production order not found');
        }
        const order = orderRows[0];
        if (order.status === 'COMPLETED') {
            throw new Error('Cannot cancel completed orders');
        }
        // Release reservations
        yield reservationController_1.reservationController.releaseReservations(id);
        // If IN_PROGRESS, reverse raw material deductions
        if (order.status === 'IN_PROGRESS') {
            // Get all PRODUCTION_USE movements for this order
            const [movements] = yield connection.query(`
                SELECT * FROM stock_movements 
                WHERE reference_type = 'PRODUCTION_ORDER' 
                  AND reference_id = ?
                  AND movement_type = 'PRODUCTION_USE'
            `, [id]);
            // Reverse them
            for (const movement of movements) {
                // Add back to global stock
                yield connection.query('UPDATE products SET stock = stock + ? WHERE id = ?', [-movement.qty_change, movement.product_id]);
                // Update warehouse-level product_stocks (reverse the deduction)
                if (movement.warehouse_id) {
                    const [existingStock] = yield connection.query('SELECT id FROM product_stocks WHERE productId = ? AND warehouseId = ?', [movement.product_id, movement.warehouse_id]);
                    if (existingStock.length > 0) {
                        yield connection.query('UPDATE product_stocks SET stock = stock + ? WHERE productId = ? AND warehouseId = ?', [-movement.qty_change, movement.product_id, movement.warehouse_id]);
                    }
                    else {
                        // Create new record with the reversed amount
                        const [productRow] = yield connection.query('SELECT stock FROM products WHERE id = ?', [movement.product_id]);
                        const globalStock = parseFloat((_a = productRow[0]) === null || _a === void 0 ? void 0 : _a.stock) || 0;
                        yield connection.query('INSERT INTO product_stocks (id, productId, warehouseId, stock) VALUES (?, ?, ?, ?)', [(0, crypto_1.randomUUID)(), movement.product_id, movement.warehouse_id, globalStock]);
                    }
                }
                // Create reversal movement
                yield connection.query(`
                    INSERT INTO stock_movements (
                        product_id, warehouse_id, qty_change, movement_type,
                        reference_type, reference_id, notes
                    ) VALUES (?, ?, ?, 'ADJUSTMENT', 'PRODUCTION_ORDER', ?, ?)
                `, [
                    movement.product_id,
                    movement.warehouse_id,
                    -movement.qty_change,
                    id,
                    `Cancellation reversal for order ${order.order_number}`
                ]);
            }
        }
        // Update order status
        yield connection.query('UPDATE production_orders SET status = \'CANCELLED\' WHERE id = ?', [id]);
        yield connection.commit();
        // Return updated order
        const [result] = yield db_1.pool.query('SELECT * FROM production_orders WHERE id = ?', [id]);
        res.json(result[0]);
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error cancelling production:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.cancelProduction = cancelProduction;
