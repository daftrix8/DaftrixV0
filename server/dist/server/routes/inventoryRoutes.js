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
const express_1 = require("express");
const inventoryController_1 = require("../controllers/inventoryController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Stock Taking - requires inventory.stock_taking permission
router.get('/stock-taking', (0, authMiddleware_1.requirePermission)('inventory.stock_taking'), inventoryController_1.getStockTakingSessions);
router.post('/stock-taking', (0, authMiddleware_1.requirePermission)('inventory.stock_taking'), inventoryController_1.createStockTakingSession);
router.put('/stock-taking/:id', (0, authMiddleware_1.requirePermission)('inventory.stock_taking'), inventoryController_1.updateStockTakingSession);
router.delete('/stock-taking/:id', (0, authMiddleware_1.requirePermission)('inventory.stock_taking'), inventoryController_1.deleteStockTakingSession);
// Recalculate Stock - admin/system settings only
router.post('/recalculate-stock', (0, authMiddleware_1.requirePermission)('system.settings'), inventoryController_1.recalculateStock);
router.get('/recalculate-stock/status', (0, authMiddleware_1.requirePermission)('system.settings'), inventoryController_1.getRecalculateStatus);
// Flow Report - inventory view permission
router.get('/flow-report', (0, authMiddleware_1.requirePermission)('inventory.view'), inventoryController_1.getInventoryFlowReport);
// Performance Optimized Server-Side Reports
router.get('/reports/profits', (0, authMiddleware_1.requirePermission)('inventory.view'), inventoryController_1.getItemProfitsReport);
router.get('/reports/variable-pricing', (0, authMiddleware_1.requirePermission)('inventory.view'), inventoryController_1.getVariablePricingReport);
router.get('/reports/stagnant-items', (0, authMiddleware_1.requirePermission)('inventory.view'), inventoryController_1.getStagnantItemsReport);
router.get('/reports/supplier-inventory-payments', (0, authMiddleware_1.requirePermission)('inventory.view'), inventoryController_1.getSupplierInventoryPaymentsReport);
// Server-side stock valuation — replaces client-side limit=999999 product fetch
router.get('/stock-valuation', (0, authMiddleware_1.requirePermission)('inventory.view'), inventoryController_1.getStockValuation);
// Product Inquiry - stock, grades, reservations
router.get('/product-inquiry/:productId', (0, authMiddleware_1.requirePermission)('inventory.view'), inventoryController_1.getProductInquiry);
// Supplier Products - find products purchased from a supplier (historical)
router.get('/supplier-products/:supplierId', (0, authMiddleware_1.requirePermission)('inventory.view'), inventoryController_1.getSupplierProducts);
// === DIAGNOSTIC: Variant stock movements debug ===
router.get('/debug-variant-stock/:productId', (0, authMiddleware_1.requirePermission)('inventory.view'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        const { productId } = req.params;
        const { getConnection } = require('../db');
        conn = yield getConnection();
        // 1. Get all variants for this product
        const [variants] = yield conn.query(`SELECT id, name, sku, stock FROM product_variants WHERE productId = ?`, [productId]);
        // 2. Get all stock_movements for this product
        const [movements] = yield conn.query(`SELECT id, product_id, variant_id, warehouse_id, qty_change, movement_type, reference_type, reference_id, notes, movement_date 
             FROM stock_movements WHERE product_id = ? ORDER BY movement_date DESC LIMIT 100`, [productId]);
        // 3. Get stock_movements with variant_id set
        const [variantMovements] = yield conn.query(`SELECT variant_id, SUM(qty_change) as total_qty, COUNT(*) as movement_count
             FROM stock_movements WHERE product_id = ? AND variant_id IS NOT NULL
             GROUP BY variant_id`, [productId]);
        // 4. Get movements WITHOUT variant_id
        const [nullVariantMovements] = yield conn.query(`SELECT COUNT(*) as cnt, SUM(qty_change) as total_qty
             FROM stock_movements WHERE product_id = ? AND variant_id IS NULL`, [productId]);
        // 5. Get invoice_lines for this product (recent)
        const [invoiceLines] = yield conn.query(`SELECT il.invoiceId, il.productId, il.variantId, il.quantity, il.productName, i.number as invoiceNumber, i.type as invoiceType
             FROM invoice_lines il
             JOIN invoices i ON i.id = il.invoiceId
             WHERE il.productId = ?
             ORDER BY i.date DESC LIMIT 50`, [productId]);
        conn.release();
        res.json({
            productId,
            variants: variants,
            variantStockSummary: variantMovements,
            nullVariantMovements: nullVariantMovements[0],
            recentMovements: movements,
            recentInvoiceLines: invoiceLines,
        });
    }
    catch (error) {
        if (conn)
            try {
                conn.release();
            }
            catch (_a) { }
        res.status(500).json({ error: error.message });
    }
}));
// Historical Stock Balance - calculate stock as of a specific date (رصيد حتى تاريخ)
router.get('/historical-balance', (0, authMiddleware_1.requirePermission)('inventory.view'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        const { date, categoryId, warehouseId } = req.query;
        if (!date)
            return res.status(400).json({ error: 'التاريخ مطلوب' });
        const { getConnection } = require('../db');
        conn = yield getConnection();
        // Check if product_variants table exists for parent product aggregation
        let hasVariantsTable = false;
        try {
            const [pvCheck] = yield conn.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'product_variants' AND TABLE_SCHEMA = DATABASE() LIMIT 1`);
            hasVariantsTable = pvCheck.length > 0;
        }
        catch ( /* ignore */_a) { /* ignore */ }
        // Build product query with optional filters, aggregating variants under parents if table exists
        const productParams = [];
        let productQuery = '';
        if (hasVariantsTable) {
            productQuery = `
                SELECT * FROM (
                    -- 1. Standard products (no active variants)
                    SELECT 
                        p.id, p.name, p.sku, p.price, p.cost, 
                        COALESCE(ps.totalStock, 0) AS currentStock, 
                        p.categoryId, p.warehouseId, p.isActive, p.minStock, p.barcode,
                        p.type, p.unit, 0 AS isVariant, NULL AS parentProductId,
                        0 AS embeddedVariantCount
                    FROM products p
                    LEFT JOIN (
                        SELECT productId, SUM(stock) as totalStock 
                        FROM product_stocks 
                        GROUP BY productId
                    ) ps ON p.id = ps.productId
                    WHERE p.isActive = 1 
                      AND NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.productId = p.id AND pv.isActive = 1)
                    
                    UNION ALL
                    
                    -- 2. Parent products with active variants aggregated
                    SELECT 
                        p.id, p.name, p.sku, 
                        -- Weighted average price from variants
                        COALESCE(
                            CASE WHEN SUM(COALESCE(pvs.totalStock, 0)) > 0 
                                 THEN SUM(COALESCE(pvs.totalStock, 0) * COALESCE(NULLIF(pv.sellingPrice, 0), p.price, 0)) / SUM(COALESCE(pvs.totalStock, 0))
                                 ELSE AVG(COALESCE(NULLIF(pv.sellingPrice, 0), p.price, 0))
                            END, 0
                        ) AS price,
                        -- Weighted average cost from variants
                        COALESCE(
                            CASE WHEN SUM(COALESCE(pvs.totalStock, 0)) > 0 
                                 THEN SUM(COALESCE(pvs.totalStock, 0) * COALESCE(NULLIF(pv.purchasePrice, 0), p.cost, 0)) / SUM(COALESCE(pvs.totalStock, 0))
                                 ELSE AVG(COALESCE(NULLIF(pv.purchasePrice, 0), p.cost, 0))
                            END, 0
                        ) AS cost,
                        -- Aggregated current stock
                        SUM(COALESCE(pvs.totalStock, 0)) AS currentStock, 
                        p.categoryId, p.warehouseId, p.isActive, p.minStock, p.barcode,
                        p.type, p.unit, 0 AS isVariant, NULL AS parentProductId,
                        COUNT(pv.id) AS embeddedVariantCount
                    FROM products p
                    JOIN product_variants pv ON pv.productId = p.id AND pv.isActive = 1
                    LEFT JOIN (
                        SELECT variantId, SUM(stock) as totalStock 
                        FROM product_variant_stocks 
                        GROUP BY variantId
                    ) pvs ON pv.id = pvs.variantId
                    WHERE p.isActive = 1
                    GROUP BY p.id, p.name, p.sku, p.categoryId, p.warehouseId, p.isActive, p.minStock, p.barcode, p.type, p.unit
                ) AS items WHERE isActive = 1
            `;
        }
        else {
            productQuery = `
                SELECT 
                    p.id, p.name, p.sku, p.price, p.cost, 
                    COALESCE(ps.totalStock, 0) AS currentStock, 
                    p.categoryId, p.warehouseId, p.isActive, p.minStock, p.barcode,
                    p.type, p.unit, 0 AS isVariant, NULL AS parentProductId,
                    0 AS embeddedVariantCount
                FROM products p
                LEFT JOIN (
                    SELECT productId, SUM(stock) as totalStock 
                    FROM product_stocks 
                    GROUP BY productId
                ) ps ON p.id = ps.productId
                WHERE p.isActive = 1
            `;
        }
        if (categoryId && categoryId !== 'ALL') {
            productQuery += ` AND categoryId = ?`;
            productParams.push(categoryId);
        }
        const [products] = yield conn.query(productQuery, productParams);
        // Determine if the requested date is today or future
        // If so, read from product_stocks directly (guaranteed match with current report)
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const isCurrentOrFuture = date >= today;
        let stockMap;
        if (isCurrentOrFuture) {
            // ═══════════════════════════════════════════════════════════════
            // DATE >= TODAY: Read from product_stocks (excluding variant parent products)
            // and read individual variant stock from product_variant_stocks (aggregated to parent ID)
            // ═══════════════════════════════════════════════════════════════
            let stockQuery = `
                SELECT ps.productId, ps.warehouseId, ps.stock
                FROM product_stocks ps
                INNER JOIN warehouses w ON ps.warehouseId = w.id
                WHERE ps.warehouseId IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.productId = ps.productId AND pv.isActive = 1)
            `;
            const stockParams = [];
            if (warehouseId && warehouseId !== 'ALL') {
                stockQuery += ` AND ps.warehouseId = ?`;
                stockParams.push(warehouseId);
            }
            if (categoryId && categoryId !== 'ALL') {
                stockQuery += ` AND EXISTS (SELECT 1 FROM products p WHERE p.id = ps.productId AND p.categoryId = ?)`;
                stockParams.push(categoryId);
            }
            stockQuery += `
                UNION ALL
                
                SELECT pv.productId as productId, pvs.warehouseId, pvs.stock
                FROM product_variant_stocks pvs
                INNER JOIN product_variants pv ON pvs.variantId = pv.id
                INNER JOIN warehouses w ON pvs.warehouseId = w.id
                WHERE pvs.warehouseId IS NOT NULL AND pv.isActive = 1
            `;
            const variantParams = [];
            if (warehouseId && warehouseId !== 'ALL') {
                stockQuery += ` AND pvs.warehouseId = ?`;
                variantParams.push(warehouseId);
            }
            if (categoryId && categoryId !== 'ALL') {
                stockQuery += ` AND EXISTS (SELECT 1 FROM products p WHERE p.id = pv.productId AND p.categoryId = ?)`;
                variantParams.push(categoryId);
            }
            const [productStocks] = yield conn.query(stockQuery, [...stockParams, ...variantParams]);
            stockMap = new Map();
            for (const ps of productStocks) {
                const qty = parseFloat(ps.stock) || 0;
                if (qty === 0)
                    continue;
                if (!stockMap.has(ps.productId))
                    stockMap.set(ps.productId, new Map());
                const currentQty = stockMap.get(ps.productId).get(ps.warehouseId) || 0;
                stockMap.get(ps.productId).set(ps.warehouseId, currentQty + qty);
            }
        }
        else {
            // ═══════════════════════════════════════════════════════════════
            // DATE IN PAST: Compute from stock_movements up to that date
            // Must match recalculate engine Phase 1 exactly:
            // - INNER JOIN products (skip orphaned)
            // - warehouse_id IS NOT NULL
            // - Exclude: VAN_SALE, BALANCE_SYNC, SYSTEM_ADJUSTMENT, بيع متنقل
            // - SYSTEM_ADJUSTMENT excluded because Phase 0 deletes them
            // ═══════════════════════════════════════════════════════════════
            const dateEndOfDayISO = `${date}T23:59:59.999Z`;
            const dateEndOfDaySQL = `${date} 23:59:59`;
            let movementQuery = `
                SELECT 
                    sm.product_id as productId,
                    sm.warehouse_id as warehouseId,
                    SUM(sm.qty_change) as netMovement
                FROM stock_movements sm
                INNER JOIN products p ON sm.product_id = p.id
                WHERE sm.warehouse_id IS NOT NULL
                  AND (sm.movement_date IS NULL OR sm.movement_date <= ? OR sm.movement_date <= ?)
                  AND (sm.reference_type IS NULL OR sm.reference_type NOT IN ('VAN_SALE', 'BALANCE_SYNC', 'SYSTEM_ADJUSTMENT'))
                  AND (sm.notes IS NULL OR sm.notes NOT LIKE '%بيع متنقل%')
            `;
            const movementParams = [dateEndOfDayISO, dateEndOfDaySQL];
            if (warehouseId && warehouseId !== 'ALL') {
                movementQuery += ` AND sm.warehouse_id = ?`;
                movementParams.push(warehouseId);
            }
            if (categoryId && categoryId !== 'ALL') {
                movementQuery += ` AND p.categoryId = ?`;
                movementParams.push(categoryId);
            }
            movementQuery += ` GROUP BY sm.product_id, sm.warehouse_id`;
            const [movements] = yield conn.query(movementQuery, movementParams);
            // Get valid warehouse IDs
            const [validWarehouses] = yield conn.query('SELECT id FROM warehouses');
            const validWarehouseIds = new Set(validWarehouses.map((w) => w.id));
            stockMap = new Map();
            for (const m of movements) {
                if (!m.warehouseId || !validWarehouseIds.has(m.warehouseId))
                    continue;
                if (!m.productId)
                    continue;
                const qty = Number(parseFloat(m.netMovement).toFixed(5));
                if (qty === 0)
                    continue;
                if (!stockMap.has(m.productId))
                    stockMap.set(m.productId, new Map());
                stockMap.get(m.productId).set(m.warehouseId, (stockMap.get(m.productId).get(m.warehouseId) || 0) + qty);
            }
        }
        conn.release();
        // Build results: each product with its historical stock per warehouse
        const results = [];
        for (const p of products) {
            const whMap = stockMap.get(p.id);
            if (whMap && whMap.size > 0) {
                let totalStock = 0;
                whMap.forEach((qty) => { totalStock += qty; });
                const warehouseStocks = Array.from(whMap.entries())
                    .filter(([, qty]) => qty !== 0)
                    .map(([whId, qty]) => ({ warehouseId: whId, stock: qty }));
                results.push(Object.assign(Object.assign({}, p), { stock: totalStock, warehouseStocks, historicalDate: date }));
            }
            else {
                results.push(Object.assign(Object.assign({}, p), { stock: 0, warehouseStocks: [], historicalDate: date }));
            }
        }
        res.json({ results, date });
    }
    catch (error) {
        if (conn)
            try {
                conn.release();
            }
            catch (_b) { }
        console.error('Error fetching historical balance:', error);
        res.status(500).json({ error: 'فشل في حساب الرصيد التاريخي' });
    }
}));
exports.default = router;
