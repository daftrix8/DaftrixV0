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
exports.getMovementStats = exports.reconcileStock = exports.createStockMovement = exports.getProductMovementHistory = exports.getStockMovements = void 0;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
/**
 * Stock Movement Controller
 * Handles stock movement tracking and audit
 */
// Get stock movements with filters
const getStockMovements = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authReq = req;
        const { productId, movementType, startDate, endDate, warehouseId, limit = 99999, offset = 0 } = req.query;
        let query = `
            SELECT sm.*, 
                   p.name as product_name,
                   p.sku as product_sku,
                   p.unit as product_unit
            FROM stock_movements sm
            LEFT JOIN products p ON sm.product_id = p.id
            WHERE 1=1
        `;
        const params = [];
        // ═══════════════════════════════════════════
        // MANDATORY: Fiscal Year Hard Boundary
        // ═══════════════════════════════════════════
        if (authReq.fiscalYearFilter) {
            query += ' AND sm.movement_date >= ? AND sm.movement_date <= ?';
            params.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        if (productId) {
            query += ' AND sm.product_id = ?';
            params.push(productId);
        }
        if (movementType) {
            query += ' AND sm.movement_type = ?';
            params.push(movementType);
        }
        if (startDate) {
            query += ' AND sm.movement_date >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND sm.movement_date <= ?';
            params.push(endDate);
        }
        if (warehouseId) {
            query += ' AND sm.warehouse_id = ?';
            params.push(warehouseId);
        }
        query += ' ORDER BY sm.movement_date DESC, sm.id DESC';
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        const [rows] = yield db_1.pool.query(query, params);
        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM stock_movements sm WHERE 1=1';
        const countParams = [];
        // MANDATORY: Fiscal Year Hard Boundary (count query)
        if (authReq.fiscalYearFilter) {
            countQuery += ' AND sm.movement_date >= ? AND sm.movement_date <= ?';
            countParams.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        if (productId) {
            countQuery += ' AND sm.product_id = ?';
            countParams.push(productId);
        }
        if (movementType) {
            countQuery += ' AND sm.movement_type = ?';
            countParams.push(movementType);
        }
        if (startDate) {
            countQuery += ' AND sm.movement_date >= ?';
            countParams.push(startDate);
        }
        if (endDate) {
            countQuery += ' AND sm.movement_date <= ?';
            countParams.push(endDate);
        }
        if (warehouseId) {
            countQuery += ' AND sm.warehouse_id = ?';
            countParams.push(warehouseId);
        }
        const [countRows] = yield db_1.pool.query(countQuery, countParams);
        const total = countRows[0].total;
        // Convert snake_case to camelCase
        const movements = rows.map(row => ({
            id: row.id,
            productId: row.product_id,
            productName: row.product_name,
            productSku: row.product_sku,
            productUnit: row.product_unit,
            warehouseId: row.warehouse_id,
            qtyChange: parseFloat(row.qty_change) || 0,
            movementType: row.movement_type,
            movementDate: row.movement_date || row.created_at,
            referenceType: row.reference_type,
            referenceId: row.reference_id,
            unitCost: parseFloat(row.unit_cost) || 0,
            notes: row.notes,
            batchId: row.batch_id,
            createdBy: row.created_by,
            createdAt: row.created_at
        }));
        res.json({
            movements,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: parseInt(offset) + movements.length < total
            }
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getStockMovements');
    }
});
exports.getStockMovements = getStockMovements;
// Get product movement history (Live Calculation from Stock Movements, Permits & Historical Invoices)
// NOTE: New invoices create stock_movements records, but HISTORICAL invoices only exist in invoice_lines.
// We query invoice_lines and EXCLUDE those that have corresponding stock_movements to avoid double-counting.
const getProductMovementHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productId } = req.params;
        const { warehouseId, variantId } = req.query;
        // First, get all warehouses for name lookup
        const [warehouseRows] = yield db_1.pool.query('SELECT id, name FROM warehouses');
        const warehouseMap = {};
        warehouseRows.forEach(w => {
            warehouseMap[w.id] = w.name;
        });
        // 1. Fetch HISTORICAL Invoices (Sales, Purchases, Returns)
        // EXCLUDE invoices that have stock_movements records (to avoid double-counting new invoices)
        let invoiceRows;
        try {
            let invoiceQuery = `
                SELECT 
                    i.id, 
                    i.date, 
                    i.type, 
                    i.number as docNumber, 
                    CONCAT(i.type, ' - ', COALESCE(i.partnerName, '')) as description,
                    i.notes,
                    il.quantity,
                    COALESCE(il.bonusQty, 0) as bonusQty,
                    COALESCE(il.warehouseId, i.warehouseId) as docWarehouseId,
                    il.returnCondition,
                    il.variantId,
                    pv.name as variantName
                FROM invoice_lines il
                JOIN invoices i ON il.invoiceId = i.id
                LEFT JOIN product_variants pv ON il.variantId = pv.id
                WHERE il.productId = ? 
                  AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL') 
                  AND i.number NOT LIKE 'VAN-%'
                  AND NOT EXISTS (
                      SELECT 1 FROM stock_movements sm 
                      WHERE sm.reference_id = i.id 
                        AND sm.product_id = il.productId
                        AND sm.reference_type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE')
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM stock_reservations sr
                      WHERE sr.invoiceId = i.id
                        AND sr.productId = il.productId
                        AND sr.status IN ('RESERVED', 'DISPATCHED')
                  )
            `;
            const invoiceParams = [productId];
            // Filter by variant if specified
            if (variantId) {
                invoiceQuery += ' AND il.variantId = ?';
                invoiceParams.push(variantId);
            }
            const [rows] = yield db_1.pool.query(invoiceQuery, invoiceParams);
            invoiceRows = rows;
        }
        catch (e) {
            // Fallback: query without returnCondition if column doesn't exist yet
            console.warn('⚠️ returnCondition column not found, falling back:', e.message);
            let fallbackQuery = `
                SELECT 
                    i.id, 
                    i.date, 
                    i.type, 
                    i.number as docNumber, 
                    CONCAT(i.type, ' - ', COALESCE(i.partnerName, '')) as description,
                    i.notes,
                    il.quantity,
                    COALESCE(il.bonusQty, 0) as bonusQty,
                    COALESCE(il.warehouseId, i.warehouseId) as docWarehouseId,
                    il.variantId,
                    pv.name as variantName
                FROM invoice_lines il
                JOIN invoices i ON il.invoiceId = i.id
                LEFT JOIN product_variants pv ON il.variantId = pv.id
                WHERE il.productId = ? 
                  AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL') 
                  AND i.number NOT LIKE 'VAN-%'
                  AND NOT EXISTS (
                      SELECT 1 FROM stock_movements sm 
                      WHERE sm.reference_id = i.id 
                        AND sm.product_id = il.productId
                        AND sm.reference_type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE')
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM stock_reservations sr
                      WHERE sr.invoiceId = i.id
                        AND sr.productId = il.productId
                        AND sr.status IN ('RESERVED', 'DISPATCHED')
                  )
            `;
            const fallbackParams = [productId];
            if (variantId) {
                fallbackQuery += ' AND il.variantId = ?';
                fallbackParams.push(variantId);
            }
            const [rows] = yield db_1.pool.query(fallbackQuery, fallbackParams);
            invoiceRows = rows;
        }
        // 2. Fetch Stock Movements (Invoices, Production, Adjustments, Opening Balances, etc.)
        // This includes ALL stock changes - invoices now write here via invoiceController
        let stockMovementQuery = `
            SELECT 
                sm.id,
                sm.movement_date as date,
                sm.movement_type as type,
                sm.reference_type,
                sm.reference_id,
                COALESCE(sm.notes, CONCAT(sm.movement_type, '-', sm.id)) as docNumber,
                sm.notes as description,
                sm.qty_change,
                sm.warehouse_id,
                sm.variant_id as variantId,
                pv.name as variantName
            FROM stock_movements sm
            LEFT JOIN product_variants pv ON sm.variant_id = pv.id
            WHERE sm.product_id = ?
              AND (sm.reference_type IS NULL OR sm.reference_type NOT IN ('BALANCE_SYNC', 'SYSTEM_ADJUSTMENT'))
        `;
        const smParams = [productId];
        // Filter by variant_id if specified
        if (variantId) {
            stockMovementQuery += ' AND sm.variant_id = ?';
            smParams.push(variantId);
        }
        if (warehouseId) {
            // For specific warehouse ID, include:
            // 1. Movements with that specific warehouse ID
            // 2. Movements with NULL warehouse ID (Global) UNLESS they are VAN_SALE
            //    (Van Sales are truly separate location, not global/shared stock)
            stockMovementQuery += ' AND (sm.warehouse_id = ? OR (sm.warehouse_id IS NULL AND sm.reference_type != "VAN_SALE"))';
            smParams.push(warehouseId);
        }
        const [stockMovementRows] = yield db_1.pool.query(stockMovementQuery, smParams);
        const movements = [];
        const targetWarehouseId = warehouseId;
        // Process HISTORICAL Invoices (those without stock_movements)
        invoiceRows.forEach(row => {
            const whId = row.docWarehouseId;
            // Filter by warehouse if requested
            if (targetWarehouseId) {
                if (whId && whId !== targetWarehouseId)
                    return;
                // Exclude Van Sales from Specific Warehouse View
                const isVanSale = (row.docNumber && row.docNumber.toString().startsWith('VAN-')) ||
                    (row.notes && (row.notes.includes('بيع متنقل') || row.notes.includes('Van Sale')));
                if (isVanSale)
                    return;
            }
            let inQty = 0;
            let outQty = 0;
            // Include bonusQty in displayed movement quantities
            const totalQty = parseFloat(row.quantity) + parseFloat(row.bonusQty || 0);
            switch (row.type) {
                case 'INVOICE_SALE':
                    outQty = totalQty;
                    break;
                case 'INVOICE_PURCHASE':
                    inQty = totalQty;
                    break;
                case 'RETURN_SALE':
                    inQty = totalQty;
                    break;
                case 'RETURN_PURCHASE':
                    outQty = totalQty;
                    break;
            }
            const warehouseName = whId ? warehouseMap[whId] : null;
            // Map invoice types to readable labels
            let displayType = row.type;
            switch (row.type) {
                case 'INVOICE_SALE':
                    displayType = 'فاتورة بيع';
                    break;
                case 'INVOICE_PURCHASE':
                    displayType = 'فاتورة شراء';
                    break;
                case 'RETURN_SALE':
                    displayType = 'مرتجع مبيعات';
                    break;
                case 'RETURN_PURCHASE':
                    displayType = 'مرتجع مشتريات';
                    break;
            }
            movements.push({
                id: row.id,
                date: row.date,
                type: displayType,
                docNumber: row.docNumber || row.id,
                description: row.description,
                inQty,
                outQty,
                balance: 0,
                warehouseId: whId,
                warehouseName: warehouseName || 'الكل',
                sourceWarehouse: null,
                destWarehouse: null,
                transferQty: 0,
                returnCondition: row.returnCondition || null,
                variantId: row.variantId || null,
                variantName: row.variantName || null
            });
        });
        // 3. Fetch HISTORICAL Stock Permits (those NOT already in stock_movements)
        // Only process permits whose id is NOT in stock_movements.reference_id
        let permitQuery = `
            SELECT 
                sp.id,
                sp.date,
                sp.type,
                sp.sourceWarehouseId,
                sp.destWarehouseId,
                sp.description as permitDescription,
                spi.productId,
                spi.productName,
                spi.quantity,
                spi.variantId,
                pv.name as variantName
            FROM stock_permits sp
            JOIN stock_permit_items spi ON sp.id = spi.permitId
            LEFT JOIN product_variants pv ON spi.variantId = pv.id
            WHERE spi.productId = ?
              AND NOT EXISTS (
                  SELECT 1 FROM stock_movements sm 
                  WHERE sm.reference_id = sp.id 
                    AND sm.product_id = spi.productId
                    AND sm.reference_type IN ('STOCK_PERMIT_IN', 'STOCK_PERMIT_OUT', 'STOCK_TRANSFER', 'ADJUSTMENT')
              )
        `;
        const permitParams = [productId];
        if (variantId) {
            permitQuery += ' AND spi.variantId = ?';
            permitParams.push(variantId);
        }
        if (warehouseId) {
            permitQuery += ' AND (sp.sourceWarehouseId = ? OR sp.destWarehouseId = ?)';
            permitParams.push(warehouseId, warehouseId);
        }
        const [permitRows] = yield db_1.pool.query(permitQuery, permitParams);
        // Process historical permits
        permitRows.forEach(row => {
            const qty = parseFloat(row.quantity) || 0;
            let inQty = 0;
            let outQty = 0;
            let displayType = row.type;
            let whId = null;
            let sourceWarehouse = null;
            let destWarehouse = null;
            let transferQty = 0;
            if (row.type === 'STOCK_PERMIT_IN') {
                inQty = qty;
                displayType = 'إذن إضافة';
                whId = row.destWarehouseId;
            }
            else if (row.type === 'STOCK_PERMIT_OUT') {
                outQty = qty;
                displayType = 'إذن صرف';
                whId = row.sourceWarehouseId;
            }
            else if (row.type === 'STOCK_TRANSFER') {
                displayType = 'تحويل مخزني';
                sourceWarehouse = warehouseMap[row.sourceWarehouseId] || row.sourceWarehouseId;
                destWarehouse = warehouseMap[row.destWarehouseId] || row.destWarehouseId;
                if (targetWarehouseId) {
                    if (row.sourceWarehouseId === targetWarehouseId) {
                        outQty = qty;
                        whId = row.sourceWarehouseId;
                    }
                    else if (row.destWarehouseId === targetWarehouseId) {
                        inQty = qty;
                        whId = row.destWarehouseId;
                    }
                }
                else {
                    // Global view: transfers are net zero, show as transfer
                    transferQty = qty;
                    whId = row.sourceWarehouseId;
                }
            }
            const warehouseName = whId ? warehouseMap[whId] : 'الكل';
            movements.push({
                id: `PERMIT-${row.id}`,
                date: row.date,
                type: displayType,
                docNumber: `Permit #${row.id.substring(0, 8)}`,
                description: row.permitDescription || `${displayType} - ${row.productName || ''}`,
                inQty,
                outQty,
                transferQty,
                balance: 0,
                warehouseId: whId,
                warehouseName: warehouseName,
                sourceWarehouse,
                destWarehouse,
                variantId: row.variantId || null,
                variantName: row.variantName || null
            });
        });
        // Process Stock Movements (Production, Adjustments, Opening Balances)
        stockMovementRows.forEach(row => {
            var _a, _b;
            const qtyChange = parseFloat(row.qty_change) || 0;
            let inQty = 0;
            let outQty = 0;
            if (qtyChange > 0) {
                inQty = qtyChange;
            }
            else {
                outQty = Math.abs(qtyChange);
            }
            // Map movement types to readable labels
            let displayType = row.type;
            switch (row.type) {
                case 'PRODUCTION_OUTPUT':
                    displayType = 'إنتاج تام';
                    break;
                case 'PRODUCTION_USE':
                    displayType = 'استخدام إنتاج';
                    break;
                case 'OPENING_BALANCE':
                    displayType = 'رصيد افتتاحي';
                    break;
                case 'ADJUSTMENT':
                    displayType = 'تعديل';
                    break;
                case 'SCRAP':
                    displayType = 'هالك';
                    break;
                case 'TRANSFER_IN':
                    displayType = 'تحويل وارد';
                    break;
                case 'TRANSFER_OUT':
                    displayType = 'تحويل صادر';
                    break;
                // Invoice-related movement types (now primary source)
                case 'PURCHASE':
                    displayType = 'فاتورة شراء';
                    break;
                case 'SALE':
                    displayType = 'فاتورة بيع';
                    break;
                case 'RETURN_SALE':
                    displayType = 'مرتجع مبيعات';
                    break;
                case 'RETURN_PURCHASE':
                    displayType = 'مرتجع مشتريات';
                    break;
                case 'RETURN_IN':
                    displayType = 'مرتجع مبيعات';
                    break; // Stock IN from customer return
                case 'RETURN_OUT':
                    displayType = 'مرتجع مشتريات';
                    break; // Stock OUT for vendor return
            }
            // Improve labels for Stock Permits based on reference_type
            if (row.reference_type === 'STOCK_PERMIT_IN') {
                displayType = 'إذن إضافة';
            }
            else if (row.reference_type === 'STOCK_PERMIT_OUT') {
                displayType = 'إذن صرف';
            }
            else if (row.reference_type === 'STOCK_TRANSFER') {
                // For Transfer, keep TRANSFER_IN/OUT distinction if desired, or unify
                // But keep 'تحويل وارد'/'تحويل صادر' from switch for clarity
                // Or use 'تحويل مخزني' to match Permit UI?
                // Let's stick to existing switch for Transfer unless specific override needed
            }
            // Vehicle Loads are now REAL deductions (not floating)
            // They deduct from the source warehouse immediately
            const isVehicleLoad = (row.type === 'TRANSFER_OUT') &&
                (((_a = row.description) === null || _a === void 0 ? void 0 : _a.includes('تحميل سيارة')) || ((_b = row.docNumber) === null || _b === void 0 ? void 0 : _b.includes('VEHICLE_LOAD')));
            let transferQty = 0;
            if (isVehicleLoad) {
                // Show as normal TRANSFER_OUT with actual deduction
                displayType = 'تحميل سيارة'; // Show clear label
                row.description = `تحميل سيارة: نقل من المخزن ← إلى مخازن السيارات`;
                // outQty is already set from qty_change - DON'T zero it out
                // This will properly deduct from the running balance
            }
            let warehouseName = row.warehouse_id ? warehouseMap[row.warehouse_id] : 'الكل';
            // Van Sales: Show differently depending on view
            // In SPECIFIC warehouse view: zero out (stock left via vehicle load, not direct sale)
            // In GLOBAL view: show actual quantities so running balance matches stock balance
            const isVanSale = (row.reference_type === 'VAN_SALE') ||
                (row.warehouse_id === null && (String(row.type) === 'SALE' || (row.notes && row.notes.includes('بيع متنقل'))));
            if (isVanSale) {
                // Completely exclude Van Sales from the report
                // User requirement: "only تحميل سيارة can affect it"
                // This prevents Van Sales from appearing or affecting the running balance
                return;
            }
            // Extract returnCondition from notes for return movements
            let returnCondition = null;
            if (row.type === 'RETURN_IN' || row.type === 'RETURN_OUT' || row.reference_type === 'RETURN_SALE' || row.reference_type === 'RETURN_PURCHASE') {
                if (row.description && row.description.includes('(هالك)')) {
                    returnCondition = 'DAMAGED';
                }
                else if (row.description && row.description.includes('(سليم)')) {
                    returnCondition = 'GOOD';
                }
            }
            movements.push({
                id: `SM-${row.id}`,
                date: row.date,
                type: displayType,
                docNumber: row.docNumber,
                description: row.description || displayType,
                inQty,
                outQty,
                transferQty,
                balance: 0,
                warehouseId: row.warehouse_id,
                warehouseName: warehouseName,
                sourceWarehouse: null,
                destWarehouse: null,
                returnCondition,
                variantId: row.variantId || null,
                variantName: row.variantName || null
            });
        });
        // Sort: Oldest First to calculate running balance
        // Use deterministic ordering: date, then numeric ID
        movements.sort((a, b) => {
            // Primary: Sort by date
            const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
            if (dateDiff !== 0)
                return dateDiff;
            // Secondary: Extract numeric ID for consistent ordering
            const numA = parseInt(String(a.id).replace(/\D/g, '')) || 0;
            const numB = parseInt(String(b.id).replace(/\D/g, '')) || 0;
            return numA - numB;
        });
        // Calculate Running Balance
        let runningBalance = 0;
        movements.forEach(m => {
            runningBalance = runningBalance + m.inQty - m.outQty;
            m.balance = runningBalance;
        });
        // Return Newest First (Reverse)
        res.json(movements.reverse());
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getStockMovementsByProduct');
    }
});
exports.getProductMovementHistory = getProductMovementHistory;
// Create stock movement (manual adjustment)
const createStockMovement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { productId, warehouseId, qtyChange, movementType, referenceType, referenceId, unitCost, notes, createdBy } = req.body;
        // Validate product exists
        const [productRows] = yield connection.query('SELECT id, stock, cost FROM products WHERE id = ?', [productId]);
        if (productRows.length === 0) {
            throw new Error('Product not found');
        }
        const product = productRows[0];
        // Insert movement
        yield connection.query(`
            INSERT INTO stock_movements (
                product_id, warehouse_id, qty_change, movement_type,
                reference_type, reference_id, unit_cost, notes, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            productId,
            warehouseId || null,
            qtyChange,
            movementType,
            referenceType || null,
            referenceId || null,
            unitCost || product.cost,
            notes || null,
            createdBy || null
        ]);
        // Update product stock (global level)
        yield connection.query('UPDATE products SET stock = stock + ? WHERE id = ?', [qtyChange, productId]);
        // =====================================================
        // UPDATE WAREHOUSE-LEVEL STOCK (product_stocks table)
        // This ensures warehouse-specific stock reports are accurate
        // =====================================================
        if (warehouseId) {
            yield connection.query(`
                INSERT INTO product_stocks (id, productId, warehouseId, stock)
                VALUES (UUID(), ?, ?, ?)
                ON DUPLICATE KEY UPDATE stock = stock + ?
            `, [productId, warehouseId, qtyChange, qtyChange]);
            console.log(`📦 Warehouse stock updated: ${productId} in ${warehouseId} ${qtyChange > 0 ? '+' : ''}${qtyChange}`);
        }
        else {
            // If no warehouse specified, try to use default warehouse
            const [defaultWarehouse] = yield connection.query('SELECT id FROM warehouses WHERE isDefault = 1 OR isActive = 1 LIMIT 1');
            const defaultWhId = (_a = defaultWarehouse[0]) === null || _a === void 0 ? void 0 : _a.id;
            if (defaultWhId) {
                yield connection.query(`
                    INSERT INTO product_stocks (id, productId, warehouseId, stock)
                    VALUES (UUID(), ?, ?, ?)
                    ON DUPLICATE KEY UPDATE stock = stock + ?
                `, [productId, defaultWhId, qtyChange, qtyChange]);
                console.log(`📦 Warehouse stock updated (default): ${productId} in ${defaultWhId} ${qtyChange > 0 ? '+' : ''}${qtyChange}`);
            }
        }
        // Note: Product cost is now FIXED and only changes when manually edited in Product Management (إدارة المنتجات)
        // No automatic averaging - the cost field is the single source of truth
        yield connection.commit();
        res.json({ message: 'Stock movement created successfully' });
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'createStockMovement');
    }
    finally {
        connection.release();
    }
});
exports.createStockMovement = createStockMovement;
// Reconcile stock
const reconcileStock = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Get all products with their calculated stock from movements
        const [products] = yield db_1.pool.query(`
            SELECT p.id, p.name, p.sku, p.stock as current_stock,
                   COALESCE(SUM(sm.qty_change), 0) as calculated_stock
            FROM products p
            LEFT JOIN stock_movements sm ON p.id = sm.product_id
            GROUP BY p.id, p.name, p.sku, p.stock
        `);
        // Find discrepancies
        const discrepancies = products
            .map((p) => ({
            productId: p.id,
            productName: p.name,
            sku: p.sku,
            currentStock: p.current_stock,
            calculatedStock: p.calculated_stock,
            difference: p.current_stock - p.calculated_stock
        }))
            .filter((p) => Math.abs(p.difference) > 0.001); // Ignore tiny floating point differences
        res.json({
            totalProducts: products.length,
            discrepanciesFound: discrepancies.length,
            discrepancies
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'reconcileStock');
    }
});
exports.reconcileStock = reconcileStock;
// Get movement statistics
const getMovementStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authReq = req;
        const { startDate, endDate } = req.query;
        let query = `
            SELECT 
                movement_type,
                COUNT(*) as count,
                SUM(ABS(qty_change)) as total_quantity,
                SUM(ABS(qty_change) * COALESCE(unit_cost, 0)) as total_value
            FROM stock_movements
            WHERE 1=1
        `;
        const params = [];
        // MANDATORY: Fiscal Year Hard Boundary
        if (authReq.fiscalYearFilter) {
            query += ' AND movement_date >= ? AND movement_date <= ?';
            params.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        if (startDate) {
            query += ' AND movement_date >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND movement_date <= ?';
            params.push(endDate);
        }
        query += ' GROUP BY movement_type';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching movement stats:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getMovementStats = getMovementStats;
