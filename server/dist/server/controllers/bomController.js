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
exports.calculateBOMRequirements = exports.deleteBOM = exports.updateBOM = exports.createBOM = exports.getBOMById = exports.getBOMs = void 0;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
const crypto_1 = require("crypto");
const eventBus_1 = require("../utils/eventBus");
/**
 * BOM Controller
 * Handles Bill of Materials operations
 */
/**
 * Calculate total BOM cost and update the finished product's cost
 * Called after BOM create/update to keep product cost in sync
 */
const calculateAndUpdateProductCost = (bomId, connection) => __awaiter(void 0, void 0, void 0, function* () {
    const db = connection || db_1.pool;
    try {
        // Get BOM header with labor and overhead costs
        const [bomRows] = yield db.query(`
            SELECT b.finished_product_id, b.labor_cost, b.overhead_cost, b.is_active
            FROM bom b
            WHERE b.id = ?
        `, [bomId]);
        if (bomRows.length === 0)
            return null;
        const bom = bomRows[0];
        // Only update product cost if this is the active BOM
        if (!bom.is_active)
            return null;
        // Get BOM items with their costs
        const [itemsRows] = yield db.query(`
            SELECT bi.quantity_per_unit, bi.waste_percent, p.cost as unit_cost
            FROM bom_items bi
            LEFT JOIN products p ON bi.raw_product_id = p.id
            WHERE bi.bom_id = ?
        `, [bomId]);
        // Calculate material cost (including waste)
        let materialCost = 0;
        for (const item of itemsRows) {
            const qtyWithWaste = (item.quantity_per_unit || 0) * (1 + (item.waste_percent || 0) / 100);
            materialCost += qtyWithWaste * (item.unit_cost || 0);
        }
        // Calculate total cost per unit
        const laborCost = parseFloat(bom.labor_cost) || 0;
        const overheadCost = parseFloat(bom.overhead_cost) || 0;
        const totalCost = materialCost + laborCost + overheadCost;
        // Update the finished product's cost
        yield db.query(`
            UPDATE products SET cost = ? WHERE id = ?
        `, [totalCost, bom.finished_product_id]);
        console.log(`✅ Auto-updated product cost: ${totalCost.toFixed(2)} for product ${bom.finished_product_id}`);
        return {
            productId: bom.finished_product_id,
            materialCost,
            laborCost,
            overheadCost,
            totalCost
        };
    }
    catch (error) {
        console.error('Error calculating product cost from BOM:', error);
        return null;
    }
});
// Get all BOMs with optional filters
const getBOMs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productId, isActive } = req.query;
        let query = `
            SELECT b.*, 
                   p.name as finished_product_name,
                   p.sku as finished_product_sku,
                   COUNT(bi.id) as items_count,
                   (
                       SELECT COALESCE(SUM(
                           bi2.quantity_per_unit * (1 + COALESCE(bi2.waste_percent, 0) / 100) * COALESCE(p2.cost, 0)
                       ), 0) + COALESCE(b.labor_cost, 0) + COALESCE(b.overhead_cost, 0)
                       FROM bom_items bi2
                       LEFT JOIN products p2 ON bi2.raw_product_id = p2.id
                       WHERE bi2.bom_id = b.id
                   ) as total_cost
            FROM bom b
            LEFT JOIN products p ON b.finished_product_id = p.id
            LEFT JOIN bom_items bi ON b.id = bi.bom_id
            WHERE 1=1
        `;
        const params = [];
        if (productId) {
            query += ' AND b.finished_product_id = ?';
            params.push(productId);
        }
        if (isActive !== undefined) {
            query += ' AND b.is_active = ?';
            params.push(isActive === 'true' ? 1 : 0);
        }
        query += ' GROUP BY b.id ORDER BY b.created_at DESC';
        const [rows] = yield db_1.pool.query(query, params);
        // Convert snake_case to camelCase
        const result = rows.map(row => ({
            id: row.id,
            finishedProductId: row.finished_product_id,
            finishedProductName: row.finished_product_name,
            finishedProductSku: row.finished_product_sku,
            name: row.name,
            version: row.version,
            isActive: row.is_active === 1,
            laborCost: row.labor_cost,
            overheadCost: row.overhead_cost,
            notes: row.notes,
            itemsCount: parseInt(row.items_count) || 0,
            totalCost: parseFloat(row.total_cost) || 0,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching BOMs:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getBOMs = getBOMs;
// Get BOM by ID with items
const getBOMById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Get BOM header
        const [bomRows] = yield db_1.pool.query(`
            SELECT b.*, 
                   p.name as finished_product_name,
                   p.sku as finished_product_sku,
                   p.unit as finished_product_unit
            FROM bom b
            LEFT JOIN products p ON b.finished_product_id = p.id
            WHERE b.id = ?
        `, [id]);
        if (bomRows.length === 0) {
            return res.status(404).json({ message: 'BOM not found' });
        }
        const row = bomRows[0];
        // Get BOM items with product details
        const [itemsRows] = yield db_1.pool.query(`
            SELECT bi.*, 
                   p.name as raw_product_name,
                   p.sku as raw_product_sku,
                   p.unit as raw_product_unit,
                   p.stock as current_stock,
                   p.cost as unit_cost,
                   sup.name as supplier_name
            FROM bom_items bi
            LEFT JOIN products p ON bi.raw_product_id = p.id
            LEFT JOIN partners sup ON bi.supplier_id = sup.id
            WHERE bi.bom_id = ?
            ORDER BY bi.id
        `, [id]);
        // Convert snake_case to camelCase
        const bom = {
            id: row.id,
            finishedProductId: row.finished_product_id,
            finishedProductName: row.finished_product_name,
            finishedProductSku: row.finished_product_sku,
            finishedProductUnit: row.finished_product_unit,
            name: row.name,
            version: row.version,
            isActive: row.is_active === 1,
            laborCost: row.labor_cost,
            overheadCost: row.overhead_cost,
            notes: row.notes,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            items: itemsRows.map(item => ({
                id: item.id,
                bomId: item.bom_id,
                rawProductId: item.raw_product_id,
                rawProductName: item.raw_product_name,
                rawProductSku: item.raw_product_sku,
                unit: item.raw_product_unit,
                quantityPerUnit: parseFloat(item.quantity_per_unit) || 0,
                wastePercent: parseFloat(item.waste_percent) || 0,
                currentStock: parseFloat(item.current_stock) || 0,
                unitCost: parseFloat(item.unit_cost) || 0,
                notes: item.notes,
                supplierId: item.supplier_id || null,
                supplierName: item.supplier_name || null
            }))
        };
        res.json(bom);
    }
    catch (error) {
        console.error('Error fetching BOM:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getBOMById = getBOMById;
// Create new BOM
const createBOM = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id: reqId, finishedProductId, name, laborCost, overheadCost, notes, items } = req.body;
        // Generate ID if not provided
        const id = reqId || (0, crypto_1.randomUUID)();
        // Validate finished product exists and is a manufacturable type
        // Accepts: FINISHED, PRODUCT (default type), null/empty type, or isManufactured flag
        // This mirrors the frontend filter: p.type === 'FINISHED' || p.type === 'PRODUCT' || p.isManufactured || !p.type
        const [productRows] = yield connection.query('SELECT id, type, isManufactured FROM products WHERE id = ?', [finishedProductId]);
        if (productRows.length === 0) {
            throw new Error('Finished product not found');
        }
        const product = productRows[0];
        const isManufacturable = !product.type || // null/empty type (default products)
            product.type === 'FINISHED' ||
            product.type === 'PRODUCT' ||
            product.isManufactured;
        if (!isManufacturable) {
            throw new Error('هذا المنتج لا يمكن تصنيعه. يرجى تحديد نوع المنتج كـ "منتج نهائي" من إدارة المنتجات.');
        }
        // Insert BOM header
        yield connection.query(`
            INSERT INTO bom (id, finished_product_id, name, labor_cost, overhead_cost, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [id, finishedProductId, name, laborCost || 0, overheadCost || 0, notes || null]);
        // Insert BOM items
        if (items && items.length > 0) {
            for (const item of items) {
                // Validate raw product exists
                const [rawProductRows] = yield connection.query('SELECT id, type FROM products WHERE id = ?', [item.rawProductId]);
                if (rawProductRows.length === 0) {
                    throw new Error(`Raw product ${item.rawProductId} not found`);
                }
                yield connection.query(`
                    INSERT INTO bom_items (bom_id, raw_product_id, quantity_per_unit, waste_percent, notes, supplier_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    id,
                    item.rawProductId,
                    item.quantityPerUnit,
                    item.wastePercent || 0,
                    item.notes || null,
                    item.supplierId || null
                ]);
            }
        }
        yield connection.commit();
        // Auto-calculate and update the finished product's cost
        const costUpdate = yield calculateAndUpdateProductCost(id);
        // Broadcast real-time update via WebSocket if cost was updated
        if (costUpdate) {
            eventBus_1.eventBus.broadcast('product:cost_updated', {
                productId: costUpdate.productId,
                materialCost: costUpdate.materialCost,
                laborCost: costUpdate.laborCost,
                overheadCost: costUpdate.overheadCost,
                totalCost: costUpdate.totalCost,
                bomId: id,
                updatedAt: new Date().toISOString()
            });
            eventBus_1.eventBus.broadcast('entity:changed', {
                entityType: 'products',
                updatedBy: 'BOM Auto-Cost'
            });
        }
        // Return created BOM with items
        const [result] = yield db_1.pool.query(`
            SELECT b.*, 
                   p.name as finished_product_name
            FROM bom b
            LEFT JOIN products p ON b.finished_product_id = p.id
            WHERE b.id = ?
        `, [id]);
        res.json(result[0]);
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error creating BOM:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.createBOM = createBOM;
// Update BOM
const updateBOM = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        const { finishedProductId, name, laborCost, overheadCost, notes, isActive, items } = req.body;
        // Update BOM header (including finishedProductId if provided)
        if (finishedProductId) {
            yield connection.query(`
                UPDATE bom 
                SET finished_product_id = ?, name = ?, labor_cost = ?, overhead_cost = ?, notes = ?, is_active = ?
                WHERE id = ?
            `, [finishedProductId, name, laborCost, overheadCost, notes, isActive, id]);
        }
        else {
            yield connection.query(`
                UPDATE bom 
                SET name = ?, labor_cost = ?, overhead_cost = ?, notes = ?, is_active = ?
                WHERE id = ?
            `, [name, laborCost, overheadCost, notes, isActive, id]);
        }
        // If items provided, replace all items
        if (items) {
            // Delete existing items
            yield connection.query('DELETE FROM bom_items WHERE bom_id = ?', [id]);
            // Insert new items
            for (const item of items) {
                yield connection.query(`
                    INSERT INTO bom_items (bom_id, raw_product_id, quantity_per_unit, waste_percent, notes, supplier_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    id,
                    item.rawProductId,
                    item.quantityPerUnit,
                    item.wastePercent || 0,
                    item.notes || null,
                    item.supplierId || null
                ]);
            }
        }
        yield connection.commit();
        // Auto-calculate and update the finished product's cost
        const costUpdate = yield calculateAndUpdateProductCost(id);
        // Broadcast real-time update via WebSocket if cost was updated
        if (costUpdate) {
            eventBus_1.eventBus.broadcast('product:cost_updated', {
                productId: costUpdate.productId,
                materialCost: costUpdate.materialCost,
                laborCost: costUpdate.laborCost,
                overheadCost: costUpdate.overheadCost,
                totalCost: costUpdate.totalCost,
                bomId: id,
                updatedAt: new Date().toISOString()
            });
            eventBus_1.eventBus.broadcast('entity:changed', {
                entityType: 'products',
                updatedBy: 'BOM Auto-Cost'
            });
        }
        // Return updated BOM
        const [result] = yield db_1.pool.query('SELECT * FROM bom WHERE id = ?', [id]);
        res.json(result[0]);
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error updating BOM:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.updateBOM = updateBOM;
// Delete BOM
const deleteBOM = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const connection = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const force = req.query.force === 'true';
        yield connection.beginTransaction();
        // Check if BOM is used in ACTIVE production orders (not draft/cancelled)
        let hasActiveOrders = false;
        let activeOrderCount = 0;
        try {
            const [orderRows] = yield connection.query(`SELECT COUNT(*) as count FROM production_orders 
                 WHERE bom_id = ? AND status NOT IN ('DRAFT', 'CANCELLED')`, [id]);
            activeOrderCount = orderRows[0].count;
            hasActiveOrders = activeOrderCount > 0;
        }
        catch (_b) {
            // production_orders table might not exist — safe to delete
        }
        if (hasActiveOrders && !force) {
            yield connection.rollback();
            return res.status(409).json({
                message: `لا يمكن حذف هذه القائمة - مرتبطة بـ ${activeOrderCount} أمر تصنيع نشط. استخدم الحذف القسري أو احذف أوامر التصنيع أولاً.`,
                message_en: `Cannot delete BOM — it is used in ${activeOrderCount} active production orders. Use force delete or remove production orders first.`,
                hasActiveOrders: true
            });
        }
        // Clear BOM reference from ALL production orders before deletion
        // This prevents FK constraint errors regardless of order status
        try {
            yield connection.query('UPDATE production_orders SET bom_id = NULL WHERE bom_id = ?', [id]);
        }
        catch ( /* table might not exist */_c) { /* table might not exist */ }
        // Clear bomId reference from products table
        yield connection.query('UPDATE products SET bomId = NULL WHERE bomId = ?', [id]).catch(() => { });
        // Delete BOM items first (foreign key), then BOM
        yield connection.query('DELETE FROM bom_items WHERE bom_id = ?', [id]);
        yield connection.query('DELETE FROM bom WHERE id = ?', [id]);
        yield connection.commit();
        res.json({ message: 'تم حذف قائمة المواد بنجاح', deleted: true });
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error deleting BOM:', error);
        // User-friendly FK constraint error
        if (error.code === 'ER_ROW_IS_REFERENCED_2' || ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('foreign key constraint'))) {
            return res.status(409).json({
                message: 'لا يمكن حذف قائمة المواد - مرتبطة بسجلات أخرى (أوامر تصنيع أو منتجات). يرجى حذف السجلات المرتبطة أولاً.',
                message_en: 'Cannot delete BOM — it is referenced by other records. Delete related production orders first.'
            });
        }
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.deleteBOM = deleteBOM;
// Calculate BOM requirements
const calculateBOMRequirements = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { bomId, quantity, warehouseId } = req.body;
        if (!bomId || !quantity) {
            return res.status(400).json({ message: 'bomId and quantity are required' });
        }
        // Get BOM items with product details
        const [items] = yield db_1.pool.query(`
            SELECT bi.*, 
                   p.id as product_id,
                   p.name as product_name,
                   p.sku,
                   p.unit,
                   p.stock as total_stock,
                   p.cost as unit_cost
            FROM bom_items bi
            LEFT JOIN products p ON bi.raw_product_id = p.id
            WHERE bi.bom_id = ?
        `, [bomId]);
        // If warehouseId is specified, get warehouse-specific stock from MULTIPLE sources
        let warehouseStockMap = new Map();
        if (warehouseId) {
            // Get the product IDs from the BOM items
            const bomProductIds = items.map(item => item.product_id).filter(Boolean);
            if (bomProductIds.length > 0) {
                // SOURCE 1: Get stock from product_stocks table (primary source for invoice/purchase stock)
                const placeholders = bomProductIds.map(() => '?').join(',');
                const [productStocks] = yield db_1.pool.query(`
                    SELECT productId, stock
                    FROM product_stocks
                    WHERE warehouseId = ? AND productId IN (${placeholders})
                `, [warehouseId, ...bomProductIds]);
                for (const row of productStocks) {
                    warehouseStockMap.set(row.productId, Number(row.stock) || 0);
                }
                // SOURCE 2: For products NOT found in product_stocks, check stock_movements
                const missingProductIds = bomProductIds.filter(id => !warehouseStockMap.has(id));
                if (missingProductIds.length > 0) {
                    const missingPlaceholders = missingProductIds.map(() => '?').join(',');
                    const [warehouseStock] = yield db_1.pool.query(`
                        SELECT 
                            product_id,
                            COALESCE(SUM(
                                CASE 
                                    WHEN movement_type IN ('PURCHASE', 'RETURN_IN', 'PRODUCTION_OUTPUT', 'TRANSFER_IN', 'OPENING_BALANCE', 'ADJUSTMENT') 
                                    THEN qty_change 
                                    ELSE 0 
                                END
                            ), 0) - COALESCE(SUM(
                                CASE 
                                    WHEN movement_type IN ('SALE', 'RETURN_OUT', 'PRODUCTION_USE', 'TRANSFER_OUT', 'SCRAP', 'DAMAGE') 
                                    THEN ABS(qty_change) 
                                    ELSE 0 
                                END
                            ), 0) as current_stock
                        FROM stock_movements
                        WHERE warehouse_id = ? AND product_id IN (${missingPlaceholders})
                        GROUP BY product_id
                    `, [warehouseId, ...missingProductIds]);
                    for (const row of warehouseStock) {
                        if (!warehouseStockMap.has(row.product_id)) {
                            warehouseStockMap.set(row.product_id, Number(row.current_stock) || 0);
                        }
                    }
                }
            }
            // Subtract any existing reservations for this warehouse
            try {
                const [reservations] = yield db_1.pool.query(`
                    SELECT productId, SUM(quantityReserved - quantityConsumed) as reserved
                    FROM material_reservations
                    WHERE warehouseId = ? AND status = 'RESERVED'
                    GROUP BY productId
                `, [warehouseId]);
                for (const row of reservations) {
                    const currentStock = warehouseStockMap.get(row.productId) || 0;
                    warehouseStockMap.set(row.productId, currentStock - Number(row.reserved));
                }
            }
            catch (e) {
                // material_reservations table might not exist
                console.log('Note: material_reservations table not available');
            }
        }
        // Calculate requirements with waste
        const requirements = items.map(item => {
            const qtyWithWaste = item.quantity_per_unit * (1 + item.waste_percent / 100);
            const totalRequired = qtyWithWaste * quantity;
            // Priority: 1. Warehouse-specific stock, 2. Product's global stock
            let currentStock;
            if (warehouseId) {
                const warehouseStock = warehouseStockMap.get(item.product_id);
                if (warehouseStock !== undefined) {
                    currentStock = warehouseStock;
                }
                else {
                    // Fallback to product's global stock if no warehouse-specific data
                    currentStock = item.total_stock || 0;
                    console.log(`📦 No warehouse stock found for ${item.product_name} (${item.product_id}), using global stock: ${currentStock}`);
                }
            }
            else {
                currentStock = item.total_stock || 0;
            }
            const shortage = Math.max(0, totalRequired - currentStock);
            return {
                productId: item.product_id,
                productName: item.product_name,
                sku: item.sku,
                unit: item.unit,
                quantityPerUnit: item.quantity_per_unit,
                wastePercent: item.waste_percent,
                quantityWithWaste: qtyWithWaste,
                totalRequired: totalRequired,
                currentStock: currentStock,
                shortage: shortage,
                hasShortage: shortage > 0.001, // Use small tolerance for floating point
                unitCost: item.unit_cost,
                totalCost: totalRequired * item.unit_cost
            };
        });
        const totalCost = requirements.reduce((sum, r) => sum + r.totalCost, 0);
        const hasAnyShortage = requirements.some(r => r.hasShortage);
        res.json({
            bomId,
            quantity,
            warehouseId: warehouseId || null,
            requirements,
            totalMaterialCost: totalCost,
            hasShortage: hasAnyShortage
        });
    }
    catch (error) {
        console.error('Error calculating BOM requirements:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.calculateBOMRequirements = calculateBOMRequirements;
