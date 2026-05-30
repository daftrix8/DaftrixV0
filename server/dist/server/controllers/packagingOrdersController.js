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
exports.createBulkPackagingOrders = exports.deletePackagingOrder = exports.createPackagingOrder = exports.getPackagingOrder = exports.getPackagingOrders = exports.getProductionOrdersForPackaging = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
// ─────────────────────────────────────────────
//  GET PRODUCTION ORDERS FOR PACKAGING
//  Shows completed production orders with
//  how much has already been packaged and
//  how much remains available.
// ─────────────────────────────────────────────
const getProductionOrdersForPackaging = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { search } = req.query;
        let whereClause = `WHERE po.status IN ('COMPLETED', 'IN_PROGRESS') AND po.qty_finished > 0`;
        const params = [];
        if (search && typeof search === 'string' && search.trim()) {
            whereClause += ` AND (po.order_number LIKE ? OR p.name LIKE ?)`;
            const s = `%${search.trim()}%`;
            params.push(s, s);
        }
        const [rows] = yield db_1.pool.query(`
            SELECT 
                po.id,
                po.order_number,
                po.finished_product_id,
                p.name   AS product_name,
                p.sku    AS product_sku,
                p.unit   AS product_unit,
                COALESCE(
                    NULLIF(po.actual_material_cost / NULLIF(po.qty_finished, 0), 0),
                    NULLIF(po.standard_cost / NULLIF(po.qty_planned, 0), 0),
                    p.cost
                ) AS product_cost,
                po.qty_planned,
                po.qty_finished,
                po.status,
                po.created_at,
                COALESCE(pkg.total_packaged, 0) AS qty_already_packaged,
                (po.qty_finished - COALESCE(pkg.total_packaged, 0)) AS qty_remaining
            FROM production_orders po
            JOIN products p ON po.finished_product_id = p.id
            LEFT JOIN (
                SELECT production_order_id,
                       SUM(input_qty) AS total_packaged
                FROM packaging_orders
                WHERE production_order_id IS NOT NULL
                GROUP BY production_order_id
            ) pkg ON pkg.production_order_id = po.id
            ${whereClause}
            HAVING qty_remaining > 0
            ORDER BY po.created_at DESC
            LIMIT 100
        `, params);
        res.json(rows);
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(res, error, 'getProductionOrdersForPackaging');
    }
});
exports.getProductionOrdersForPackaging = getProductionOrdersForPackaging;
/**
 * FLAT Packaging Orders Controller
 *
 * Design: 1 Input Product → 1 Output Product + Materials (stored as JSON)
 * All data lives in the `packaging_orders` table — NO child tables needed.
 *
 * Columns used:
 *   - product_id         → OUTPUT product (the finished/packaged product)
 *   - qty_to_package     → output quantity
 *   - input_product_id   → INPUT product (raw/bulk being consumed)  [migration column]
 *   - input_qty          → input quantity consumed                   [migration column]
 *   - materials_json     → JSON array of packaging materials         [migration column]
 *   - total_material_cost, total_packaging_cost, grand_total_cost, cost_per_unit
 */
// ─────────────────────────────────────────────
//  GET ALL
// ─────────────────────────────────────────────
const getPackagingOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [orders] = yield db_1.pool.query(`
            SELECT po.*,
                   po.qty_to_package as quantity,
                   po.grand_total_cost as total_cost,
                   po.cost_per_unit as unit_cost,
                   p_out.name as product_name, p_out.sku as product_sku,
                   p_in.name as input_product_name, p_in.sku as input_product_sku,
                   w.name as warehouse_name,
                   prod_ord.order_number as production_order_number
            FROM packaging_orders po
            JOIN products p_out ON po.product_id = p_out.id
            LEFT JOIN products p_in ON po.input_product_id = p_in.id
            LEFT JOIN warehouses w ON po.warehouse_id = w.id
            LEFT JOIN production_orders prod_ord ON po.production_order_id = prod_ord.id
            ORDER BY po.created_at DESC
        `);
        res.json(orders);
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(res, error, 'getPackagingOrders');
    }
});
exports.getPackagingOrders = getPackagingOrders;
// ─────────────────────────────────────────────
//  GET ONE
// ─────────────────────────────────────────────
const getPackagingOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [orders] = yield db_1.pool.query(`
            SELECT po.*,
                   po.qty_to_package as quantity,
                   po.grand_total_cost as total_cost,
                   po.cost_per_unit as unit_cost,
                   p_out.name as product_name, p_out.sku as product_sku,
                   p_in.name as input_product_name, p_in.sku as input_product_sku,
                   w.name as warehouse_name
            FROM packaging_orders po
            JOIN products p_out ON po.product_id = p_out.id
            LEFT JOIN products p_in ON po.input_product_id = p_in.id
            LEFT JOIN warehouses w ON po.warehouse_id = w.id
            WHERE po.id = ?
        `, [id]);
        const order = orders[0];
        if (!order)
            return res.status(404).json({ error: 'Order not found' });
        // Parse materials_json if present
        if (order.materials_json) {
            try {
                order.materials = JSON.parse(order.materials_json);
            }
            catch (_a) {
                order.materials = [];
            }
        }
        else {
            order.materials = [];
        }
        res.json(order);
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(res, error, 'getPackagingOrder');
    }
});
exports.getPackagingOrder = getPackagingOrder;
// ─────────────────────────────────────────────
//  CREATE  (Flat — no child tables)
// ─────────────────────────────────────────────
const createPackagingOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { orderNumber, warehouseId, productId, quantity, totalMaterialCost, totalPackagingCost, totalCost, unitCost, levels, createdBy, productionOrderId } = req.body;
        // Extract input/output from the frontend's "levels[0]" structure
        const level = levels && levels.length > 0 ? levels[0] : null;
        const inputProductId = (level === null || level === void 0 ? void 0 : level.inputProductId) || null;
        const inputQty = (level === null || level === void 0 ? void 0 : level.inputQty) || 0;
        const outputProductId = productId; // same as productId in payload
        const outputQty = quantity;
        // ── Validate production order remaining qty ──
        if (productionOrderId && inputQty > 0) {
            const [poRows] = yield conn.query('SELECT qty_finished FROM production_orders WHERE id = ?', [productionOrderId]);
            const po = poRows[0];
            if (!po)
                throw new Error('أمر التصنيع غير موجود');
            const [pkgRows] = yield conn.query(`SELECT COALESCE(SUM(input_qty), 0) AS total_packaged
                 FROM packaging_orders
                 WHERE production_order_id = ?`, [productionOrderId]);
            const alreadyPackaged = parseFloat(pkgRows[0].total_packaged) || 0;
            const remaining = parseFloat(po.qty_finished) - alreadyPackaged;
            if (inputQty > remaining + 0.001) {
                throw new Error(`الكمية المطلوبة (${inputQty}) تتجاوز المتبقي من أمر التصنيع (${remaining.toFixed(3)})`);
            }
        }
        // Collect packaging materials from level
        const materialsArr = (level === null || level === void 0 ? void 0 : level.materials) || [];
        const materialsJson = JSON.stringify(materialsArr);
        const orderId = (0, crypto_1.randomUUID)();
        // ── 1. Insert the packaging order (flat) ──
        yield conn.query(`
            INSERT INTO packaging_orders (
                id, order_number, product_id, qty_to_package,
                input_product_id, input_qty, materials_json,
                warehouse_id, total_material_cost, total_packaging_cost,
                grand_total_cost, cost_per_unit, status, created_by,
                production_order_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
        `, [
            orderId, orderNumber, outputProductId, outputQty,
            inputProductId, inputQty, materialsJson,
            warehouseId, totalMaterialCost || 0, totalPackagingCost || 0,
            totalCost || 0, unitCost || 0, createdBy || null,
            productionOrderId || null
        ]);
        // ── 2. Deduct packaging materials from stock ──
        for (const mat of materialsArr) {
            // Update global product stock
            yield conn.query('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?', [mat.quantity, mat.productId]);
            // Update warehouse-specific stock
            yield conn.query('UPDATE product_stocks SET stock = GREATEST(0, stock - ?) WHERE productId = ? AND warehouseId = ?', [mat.quantity, mat.productId, warehouseId]);
            // Record stock movement
            yield conn.query(`
                INSERT INTO stock_movements (product_id, warehouse_id, movement_type, qty_change, reference_type, reference_id, notes)
                VALUES (?, ?, 'PRODUCTION_USE', ?, 'PACKAGING_ORDER', ?, ?)
            `, [mat.productId, warehouseId, -mat.quantity, orderId, `مواد تعبئة لأمر التعبئة ${orderNumber}`]);
        }
        // ── 3. Deduct the INPUT (raw/bulk) product ──
        if (inputProductId && inputQty > 0) {
            yield conn.query('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?', [inputQty, inputProductId]);
            yield conn.query('UPDATE product_stocks SET stock = GREATEST(0, stock - ?) WHERE productId = ? AND warehouseId = ?', [inputQty, inputProductId, warehouseId]);
            yield conn.query(`
                INSERT INTO stock_movements (product_id, warehouse_id, movement_type, qty_change, reference_type, reference_id, notes)
                VALUES (?, ?, 'PRODUCTION_USE', ?, 'PACKAGING_ORDER', ?, ?)
            `, [inputProductId, warehouseId, -inputQty, orderId, `خامات منصرفة لأمر التعبئة ${orderNumber}`]);
        }
        // ── 4. Add the OUTPUT (packaged) product to stock ──
        if (outputQty > 0) {
            // Weighted average cost update
            yield conn.query(`
                UPDATE products 
                SET cost = CASE WHEN (stock + ?) > 0 
                           THEN ((stock * COALESCE(cost,0)) + ?) / (stock + ?)
                           ELSE COALESCE(cost,0) END,
                    stock = stock + ?
                WHERE id = ?
            `, [outputQty, totalCost || 0, outputQty, outputQty, outputProductId]);
            // Warehouse stock (upsert)
            yield conn.query(`
                INSERT INTO product_stocks (id, productId, warehouseId, stock)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE stock = stock + ?
            `, [(0, crypto_1.randomUUID)(), outputProductId, warehouseId, outputQty, outputQty]);
            // Record stock movement — use PRODUCTION_OUTPUT (valid ENUM value)
            yield conn.query(`
                INSERT INTO stock_movements (product_id, warehouse_id, movement_type, qty_change, reference_type, reference_id, notes)
                VALUES (?, ?, 'PRODUCTION_OUTPUT', ?, 'PACKAGING_ORDER', ?, ?)
            `, [outputProductId, warehouseId, outputQty, orderId, `منتج تام من أمر التعبئة ${orderNumber}`]);
        }
        yield conn.commit();
        res.status(201).json({ success: true, id: orderId, message: 'تم حفظ أمر التعبئة بنجاح' });
    }
    catch (error) {
        yield conn.rollback();
        (0, errorHandler_1.handleControllerError)(res, error, 'createPackagingOrder');
    }
    finally {
        conn.release();
    }
});
exports.createPackagingOrder = createPackagingOrder;
// ─────────────────────────────────────────────
//  DELETE  (with stock reversal)
// ─────────────────────────────────────────────
const deletePackagingOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { id } = req.params;
        // Fetch order
        const [orders] = yield conn.query('SELECT * FROM packaging_orders WHERE id = ?', [id]);
        const order = orders[0];
        if (!order)
            throw new Error('Order not found');
        const warehouseId = order.warehouse_id;
        // ── 1. Reverse INPUT product (add back raw material) ──
        if (order.input_product_id && order.input_qty > 0) {
            yield conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [order.input_qty, order.input_product_id]);
            yield conn.query('UPDATE product_stocks SET stock = stock + ? WHERE productId = ? AND warehouseId = ?', [order.input_qty, order.input_product_id, warehouseId]);
        }
        // ── 2. Reverse OUTPUT product (remove packaged product) ──
        if (order.qty_to_package > 0) {
            yield conn.query('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?', [order.qty_to_package, order.product_id]);
            yield conn.query('UPDATE product_stocks SET stock = GREATEST(0, stock - ?) WHERE productId = ? AND warehouseId = ?', [order.qty_to_package, order.product_id, warehouseId]);
        }
        // ── 3. Reverse packaging materials ──
        if (order.materials_json) {
            try {
                const materials = JSON.parse(order.materials_json);
                for (const mat of materials) {
                    yield conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [mat.quantity, mat.productId]);
                    yield conn.query('UPDATE product_stocks SET stock = stock + ? WHERE productId = ? AND warehouseId = ?', [mat.quantity, mat.productId, warehouseId]);
                }
            }
            catch ( /* ignore parse errors */_a) { /* ignore parse errors */ }
        }
        // ── 4. Delete all related stock movements ──
        yield conn.query('DELETE FROM stock_movements WHERE reference_type = ? AND reference_id = ?', ['PACKAGING_ORDER', id]);
        // ── 5. Delete the order ──
        yield conn.query('DELETE FROM packaging_orders WHERE id = ?', [id]);
        yield conn.commit();
        res.json({ success: true, message: 'تم حذف أمر التعبئة وعكس الحركات المخزنية' });
    }
    catch (error) {
        yield conn.rollback();
        (0, errorHandler_1.handleControllerError)(res, error, 'deletePackagingOrder');
    }
    finally {
        conn.release();
    }
});
exports.deletePackagingOrder = deletePackagingOrder;
// ─────────────────────────────────────────────
//  CREATE BULK (Multiple outputs from single PO)
// ─────────────────────────────────────────────
const createBulkPackagingOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { orders } = req.body;
        if (!Array.isArray(orders) || orders.length === 0) {
            throw new Error('لم يتم إرسال أي أوامر تعبئة');
        }
        // Validate production order remaining qty globally if applicable
        const productionOrderId = orders[0].productionOrderId;
        if (productionOrderId) {
            let totalInputQty = 0;
            for (const order of orders) {
                totalInputQty += parseFloat(order.inputQty) || 0;
            }
            if (totalInputQty > 0) {
                const [poRows] = yield conn.query('SELECT qty_finished FROM production_orders WHERE id = ?', [productionOrderId]);
                const po = poRows[0];
                if (!po)
                    throw new Error('أمر التصنيع غير موجود');
                const [pkgRows] = yield conn.query(`SELECT COALESCE(SUM(input_qty), 0) AS total_packaged
                     FROM packaging_orders
                     WHERE production_order_id = ?`, [productionOrderId]);
                const alreadyPackaged = parseFloat(pkgRows[0].total_packaged) || 0;
                const remaining = parseFloat(po.qty_finished) - alreadyPackaged;
                if (totalInputQty > remaining + 0.001) {
                    throw new Error(`إجمالي الكمية المطلوبة (${totalInputQty}) يتجاوز المتبقي من أمر التصنيع (${remaining.toFixed(3)})`);
                }
            }
        }
        const createdOrderIds = [];
        for (const orderPayload of orders) {
            const { orderNumber, warehouseId, productId, quantity, totalMaterialCost, totalPackagingCost, totalCost, unitCost, inputProductId, inputQty, materials, createdBy } = orderPayload;
            const materialsArr = materials || [];
            const materialsJson = JSON.stringify(materialsArr);
            const orderId = (0, crypto_1.randomUUID)();
            // ── 1. Insert the packaging order (flat) ──
            yield conn.query(`
                INSERT INTO packaging_orders (
                    id, order_number, product_id, qty_to_package,
                    input_product_id, input_qty, materials_json,
                    warehouse_id, total_material_cost, total_packaging_cost,
                    grand_total_cost, cost_per_unit, status, created_by,
                    production_order_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
            `, [
                orderId, orderNumber, productId, quantity,
                inputProductId, inputQty, materialsJson,
                warehouseId, totalMaterialCost || 0, totalPackagingCost || 0,
                totalCost || 0, unitCost || 0, createdBy || null,
                productionOrderId || null
            ]);
            // ── 2. Deduct packaging materials from stock ──
            for (const mat of materialsArr) {
                yield conn.query('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?', [mat.quantity, mat.productId]);
                yield conn.query('UPDATE product_stocks SET stock = GREATEST(0, stock - ?) WHERE productId = ? AND warehouseId = ?', [mat.quantity, mat.productId, warehouseId]);
                yield conn.query(`
                    INSERT INTO stock_movements (product_id, warehouse_id, movement_type, qty_change, reference_type, reference_id, notes)
                    VALUES (?, ?, 'PRODUCTION_USE', ?, 'PACKAGING_ORDER', ?, ?)
                `, [mat.productId, warehouseId, -mat.quantity, orderId, `مواد تعبئة لأمر التعبئة ${orderNumber}`]);
            }
            // ── 3. Deduct the INPUT (raw/bulk) product ──
            if (inputProductId && inputQty > 0) {
                yield conn.query('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?', [inputQty, inputProductId]);
                yield conn.query('UPDATE product_stocks SET stock = GREATEST(0, stock - ?) WHERE productId = ? AND warehouseId = ?', [inputQty, inputProductId, warehouseId]);
                yield conn.query(`
                    INSERT INTO stock_movements (product_id, warehouse_id, movement_type, qty_change, reference_type, reference_id, notes)
                    VALUES (?, ?, 'PRODUCTION_USE', ?, 'PACKAGING_ORDER', ?, ?)
                `, [inputProductId, warehouseId, -inputQty, orderId, `خامات منصرفة لأمر التعبئة ${orderNumber}`]);
            }
            // ── 4. Add the OUTPUT (packaged) product to stock ──
            if (quantity > 0) {
                yield conn.query(`
                    UPDATE products 
                    SET cost = CASE WHEN (stock + ?) > 0 
                               THEN ((stock * COALESCE(cost,0)) + ?) / (stock + ?)
                               ELSE COALESCE(cost,0) END,
                        stock = stock + ?
                    WHERE id = ?
                `, [quantity, totalCost || 0, quantity, quantity, productId]);
                yield conn.query(`
                    INSERT INTO product_stocks (id, productId, warehouseId, stock)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE stock = stock + ?
                `, [(0, crypto_1.randomUUID)(), productId, warehouseId, quantity, quantity]);
                yield conn.query(`
                    INSERT INTO stock_movements (product_id, warehouse_id, movement_type, qty_change, reference_type, reference_id, notes)
                    VALUES (?, ?, 'PRODUCTION_OUTPUT', ?, 'PACKAGING_ORDER', ?, ?)
                `, [productId, warehouseId, quantity, orderId, `منتج تام من أمر التعبئة ${orderNumber}`]);
            }
            createdOrderIds.push(orderId);
        }
        yield conn.commit();
        res.status(201).json({ success: true, count: createdOrderIds.length, message: 'تم حفظ أوامر التعبئة بنجاح' });
    }
    catch (error) {
        yield conn.rollback();
        (0, errorHandler_1.handleControllerError)(res, error, 'createBulkPackagingOrders');
    }
    finally {
        conn.release();
    }
});
exports.createBulkPackagingOrders = createBulkPackagingOrders;
