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
        const { date } = req.query;
        if (!date)
            return res.status(400).json({ error: 'التاريخ مطلوب' });
        const { getConnection } = require('../db');
        conn = yield getConnection();
        // FIX: Append time boundary so a date like '2026-05-08' captures the full day
        // Without this, DATETIME columns like '2026-05-08 14:30:00' would be EXCLUDED
        // because '2026-05-08 14:30:00' > '2026-05-08' (which MySQL treats as '2026-05-08 00:00:00')
        const dateEndOfDay = `${date} 23:59:59`;
        // Check if product_variants table exists for embeddedVariantCount
        let embeddedVariantSelect = ', 0 AS embeddedVariantCount';
        try {
            const [pvCheck] = yield conn.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'product_variants' AND TABLE_SCHEMA = DATABASE() LIMIT 1`);
            if (pvCheck.length > 0) {
                embeddedVariantSelect = ', (SELECT COUNT(*) FROM product_variants pv WHERE pv.productId = p.id AND pv.isActive = 1) AS embeddedVariantCount';
            }
        }
        catch ( /* table check failed — use default 0 */_a) { /* table check failed — use default 0 */ }
        // Get all products 
        const [products] = yield conn.query(`
            SELECT p.id, p.name, p.sku, p.price, p.cost, p.stock as currentStock, 
                   p.categoryId, p.warehouseId, p.isActive, p.minStock, p.barcode,
                   p.type, p.unit${embeddedVariantSelect}
            FROM products p
        `);
        // Sum all movements up to the date from the unified stock_movements table
        // MUST match the same exclusions as recalculate engine (Phase 1 & 2) AND movement card
        // to prevent drift between historical view, current view, and movement card
        const [movements] = yield conn.query(`
            SELECT 
                product_id as productId,
                warehouse_id as warehouseId,
                SUM(qty_change) as netMovement
            FROM stock_movements
            WHERE movement_date <= ?
              AND (reference_type IS NULL OR reference_type NOT IN ('VAN_SALE', 'BALANCE_SYNC', 'SYSTEM_ADJUSTMENT'))
              AND (notes IS NULL OR notes NOT LIKE '%بيع متنقل%')
            GROUP BY product_id, warehouse_id
        `, [dateEndOfDay]);
        conn.release();
        // Build stock map: productId -> { warehouseId -> netQty }
        const stockMap = new Map();
        for (const m of movements) {
            if (!stockMap.has(m.productId))
                stockMap.set(m.productId, new Map());
            const whMap = stockMap.get(m.productId);
            const whId = m.warehouseId || 'ALL';
            whMap.set(whId, (whMap.get(whId) || 0) + Number(m.netMovement));
        }
        // Build results: each product with its historical stock
        const results = [];
        for (const p of products) {
            const whMap = stockMap.get(p.id);
            if (whMap) {
                // Return breakdown per warehouse if there are movements
                let totalStock = 0;
                whMap.forEach((qty) => { totalStock += qty; });
                // FIX: Build warehouse stocks array excluding NULL-warehouse entries
                // The 'ALL' bucket captures movements with no warehouse_id assigned.
                // We include it in the total but don't create a phantom warehouse row for it.
                const warehouseStocks = Array.from(whMap.entries())
                    .filter(([whId]) => whId !== 'ALL')
                    .map(([whId, qty]) => ({ warehouseId: whId, stock: qty }));
                // If product only has NULL-warehouse movements, still include them as a single entry
                if (warehouseStocks.length === 0 && totalStock !== 0) {
                    warehouseStocks.push({ warehouseId: p.warehouseId || 'ALL', stock: totalStock });
                }
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
