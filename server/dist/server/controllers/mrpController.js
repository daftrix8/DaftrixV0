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
exports.deleteSuggestion = exports.convertToOrders = exports.updateSuggestion = exports.getSuggestions = exports.generateSuggestions = exports.calculateMRP = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
/**
 * GET /api/mrp/calculate
 * Calculate MRP requirements based on sales orders, forecasts, and safety stock
 */
const calculateMRP = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { includeOpenSalesOrders = true, includeSafetyStock = true, forecastDays = 0, targetDate } = req.query;
        const dueDate = targetDate
            ? new Date(targetDate)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default: 30 days from now
        // Step 1: Get all manufactured/finished products with BOMs
        const [products] = yield db_1.pool.query(`
            SELECT 
                p.id as product_id,
                p.name as product_name,
                p.sku as product_sku,
                p.stock as current_stock,
                p.min_stock,
                p.lead_time_days,
                b.id as bom_id,
                b.name as bom_name
            FROM products p
            LEFT JOIN bom b ON b.finished_product_id = p.id AND b.is_active = 1
            WHERE (p.type = 'FINISHED' OR p.type = 'PRODUCT' OR p.type IS NULL OR p.is_manufactured = 1)
              AND b.id IS NOT NULL
            ORDER BY p.name
        `);
        // Step 2: Get pending/incoming production orders per product
        const [incomingProduction] = yield db_1.pool.query(`
            SELECT 
                finished_product_id as product_id,
                SUM(qty_planned - qty_finished) as incoming_quantity
            FROM production_orders
            WHERE status IN ('PLANNED', 'CONFIRMED', 'WAITING_MATERIALS', 'IN_PROGRESS')
            GROUP BY finished_product_id
        `);
        const incomingMap = new Map(incomingProduction.map(p => [p.product_id, Number(p.incoming_quantity)]));
        // Step 3: Get open sales order demand (unpaid/partial invoice lines)
        let salesDemand = [];
        if (includeOpenSalesOrders === 'true' || includeOpenSalesOrders === true) {
            const [salesRows] = yield db_1.pool.query(`
                SELECT 
                    il.productId as product_id,
                    i.id as invoice_id,
                    il.quantity,
                    i.date as order_date,
                    i.dueDate as due_date
                FROM invoice_lines il
                JOIN invoices i ON il.invoiceId = i.id
                WHERE i.type = 'INVOICE_SALE'
                  AND i.status NOT IN ('PAID', 'VOID')
                  AND i.date <= ?
                ORDER BY i.date
            `, [dueDate.toISOString().split('T')[0]]);
            salesDemand = salesRows;
        }
        // Group sales demand by product
        const salesDemandMap = new Map();
        salesDemand.forEach(row => {
            const existing = salesDemandMap.get(row.product_id) || { total: 0, invoiceIds: [] };
            existing.total += Number(row.quantity);
            if (!existing.invoiceIds.includes(row.invoice_id)) {
                existing.invoiceIds.push(row.invoice_id);
            }
            salesDemandMap.set(row.product_id, existing);
        });
        // Step 4: Calculate requirements for each product
        const requirements = [];
        products.forEach(product => {
            const currentStock = Number(product.current_stock) || 0;
            const safetyStock = (includeSafetyStock === 'true' || includeSafetyStock === true)
                ? (Number(product.min_stock) || 0)
                : 0;
            const incomingQty = incomingMap.get(product.product_id) || 0;
            const salesData = salesDemandMap.get(product.product_id) || { total: 0, invoiceIds: [] };
            const demandSources = [];
            // Add sales demand
            if (salesData.total > 0) {
                demandSources.push({
                    type: 'SALES_ORDER',
                    quantity: salesData.total,
                    referenceId: salesData.invoiceIds.join(',')
                });
            }
            // Add safety stock demand
            if (safetyStock > 0 && currentStock < safetyStock) {
                demandSources.push({
                    type: 'SAFETY_STOCK',
                    quantity: safetyStock - currentStock
                });
            }
            const totalDemand = demandSources.reduce((sum, d) => sum + d.quantity, 0);
            const availableQty = currentStock + incomingQty;
            const netRequirement = Math.max(0, totalDemand - availableQty);
            // Only include if there's a net requirement
            if (netRequirement > 0) {
                const leadTime = Number(product.lead_time_days) || 0;
                const suggestedStart = new Date(dueDate);
                suggestedStart.setDate(suggestedStart.getDate() - leadTime);
                requirements.push({
                    productId: product.product_id,
                    productName: product.product_name,
                    productSku: product.product_sku,
                    currentStock,
                    incomingQuantity: incomingQty,
                    totalDemand,
                    netRequirement,
                    demandSources,
                    bomId: product.bom_id,
                    bomName: product.bom_name,
                    leadTimeDays: leadTime,
                    suggestedStartDate: suggestedStart.toISOString().split('T')[0],
                    dueDate: dueDate.toISOString().split('T')[0]
                });
            }
        });
        // Summary stats
        const summary = {
            totalProducts: requirements.length,
            totalNetRequirement: requirements.reduce((sum, r) => sum + r.netRequirement, 0),
            estimatedProductionOrders: requirements.length,
            targetDate: dueDate.toISOString().split('T')[0]
        };
        res.json({
            summary,
            requirements
        });
    }
    catch (error) {
        console.error('Error calculating MRP:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.calculateMRP = calculateMRP;
/**
 * POST /api/mrp/generate-suggestions
 * Generate MRP suggestions and store them for review
 */
const generateSuggestions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { requirements, createdBy } = req.body;
        if (!requirements || !Array.isArray(requirements) || requirements.length === 0) {
            return res.status(400).json({ message: 'No requirements provided' });
        }
        // Clear previous pending suggestions (optional, or mark as superseded)
        yield connection.query(`UPDATE mrp_suggestions SET status = 'REJECTED' WHERE status = 'PENDING'`);
        const suggestions = [];
        for (const req of requirements) {
            const id = (0, crypto_1.randomUUID)();
            yield connection.query(`
                INSERT INTO mrp_suggestions (
                    id, product_id, product_name, product_sku, bom_id, bom_name,
                    suggested_quantity, current_stock, incoming_quantity, demand_quantity,
                    demand_source, source_reference_ids, due_date, lead_time_days,
                    suggested_start_date, priority, status, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
            `, [
                id,
                req.productId,
                req.productName,
                req.productSku,
                req.bomId || null,
                req.bomName || null,
                req.netRequirement,
                req.currentStock,
                req.incomingQuantity,
                req.totalDemand,
                ((_b = (_a = req.demandSources) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.type) || 'MANUAL',
                JSON.stringify(((_c = req.demandSources) === null || _c === void 0 ? void 0 : _c.map((d) => d.referenceId).filter(Boolean)) || []),
                req.dueDate,
                req.leadTimeDays || 0,
                req.suggestedStartDate,
                req.priority || 'MEDIUM',
                createdBy || null
            ]);
            suggestions.push(Object.assign({ id }, req));
        }
        yield connection.commit();
        res.json({
            message: 'MRP suggestions generated successfully',
            count: suggestions.length,
            suggestions
        });
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error generating MRP suggestions:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.generateSuggestions = generateSuggestions;
/**
 * GET /api/mrp/suggestions
 * Get all pending MRP suggestions
 */
const getSuggestions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status = 'PENDING' } = req.query;
        let query = `
            SELECT s.*, p.unit, p.type as product_type
            FROM mrp_suggestions s
            LEFT JOIN products p ON s.product_id = p.id
            WHERE 1=1
        `;
        const params = [];
        if (status && status !== 'ALL') {
            query += ' AND s.status = ?';
            params.push(status);
        }
        query += ' ORDER BY s.priority DESC, s.due_date ASC';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching MRP suggestions:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getSuggestions = getSuggestions;
/**
 * PUT /api/mrp/suggestions/:id
 * Update a suggestion (approve, reject, modify quantity)
 */
const updateSuggestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { status, suggestedQuantity, priority, approvedBy } = req.body;
        let updateQuery = 'UPDATE mrp_suggestions SET updated_at = NOW()';
        const params = [];
        if (status) {
            updateQuery += ', status = ?';
            params.push(status);
        }
        if (suggestedQuantity !== undefined) {
            updateQuery += ', suggested_quantity = ?';
            params.push(suggestedQuantity);
        }
        if (priority) {
            updateQuery += ', priority = ?';
            params.push(priority);
        }
        if (approvedBy) {
            updateQuery += ', approved_by = ?';
            params.push(approvedBy);
        }
        updateQuery += ' WHERE id = ?';
        params.push(id);
        yield db_1.pool.query(updateQuery, params);
        const [result] = yield db_1.pool.query('SELECT * FROM mrp_suggestions WHERE id = ?', [id]);
        res.json(result[0]);
    }
    catch (error) {
        console.error('Error updating MRP suggestion:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updateSuggestion = updateSuggestion;
/**
 * POST /api/mrp/convert-to-orders
 * Convert approved MRP suggestions to production orders
 */
const convertToOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { suggestionIds, warehouseId, createdBy } = req.body;
        if (!suggestionIds || !Array.isArray(suggestionIds) || suggestionIds.length === 0) {
            return res.status(400).json({ message: 'No suggestions selected' });
        }
        // Get suggestions that are PENDING or APPROVED
        const placeholders = suggestionIds.map(() => '?').join(',');
        const [suggestions] = yield connection.query(`
            SELECT * FROM mrp_suggestions 
            WHERE id IN (${placeholders}) AND status IN ('PENDING', 'APPROVED')
        `, suggestionIds);
        if (suggestions.length === 0) {
            return res.status(400).json({ message: 'No valid suggestions found' });
        }
        const createdOrders = [];
        // Get next order number
        const [lastOrder] = yield connection.query(`SELECT order_number FROM production_orders ORDER BY created_at DESC LIMIT 1`);
        let orderNum = 1;
        if (lastOrder.length > 0) {
            const match = lastOrder[0].order_number.match(/PO-(\d+)/);
            if (match)
                orderNum = parseInt(match[1]) + 1;
        }
        for (const suggestion of suggestions) {
            const orderId = (0, crypto_1.randomUUID)();
            const orderNumber = `PO-${String(orderNum++).padStart(5, '0')}`;
            // Create production order
            yield connection.query(`
                INSERT INTO production_orders (
                    id, order_number, bom_id, finished_product_id,
                    qty_planned, qty_finished, qty_scrapped,
                    status, priority, scheduled_start_date, scheduled_end_date,
                    warehouse_id, notes, created_by, created_at
                ) VALUES (?, ?, ?, ?, ?, 0, 0, 'PLANNED', ?, ?, ?, ?, ?, ?, NOW())
            `, [
                orderId,
                orderNumber,
                suggestion.bom_id,
                suggestion.product_id,
                suggestion.suggested_quantity,
                suggestion.priority || 'MEDIUM',
                suggestion.suggested_start_date,
                suggestion.due_date,
                warehouseId || null,
                `Generated from MRP suggestion. Demand: ${suggestion.demand_quantity}`,
                createdBy || null
            ]);
            // Copy routing steps if product has a routing
            const [routingRows] = yield connection.query(`
                SELECT r.id as routing_id FROM routings r
                WHERE r.product_id = ? AND r.is_active = 1
                LIMIT 1
            `, [suggestion.product_id]);
            if (routingRows.length > 0) {
                const routingId = routingRows[0].routing_id;
                // Get routing steps
                const [steps] = yield connection.query(`
                    SELECT * FROM routing_steps WHERE routing_id = ? ORDER BY sequence_number
                `, [routingId]);
                // Create production order steps
                for (const step of steps) {
                    yield connection.query(`
                        INSERT INTO production_order_steps (
                            id, production_order_id, routing_step_id, sequence_number,
                            work_center_id, operation_name, status
                        ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
                    `, [
                        (0, crypto_1.randomUUID)(),
                        orderId,
                        step.id,
                        step.sequence_number,
                        step.work_center_id,
                        step.operation_name
                    ]);
                }
            }
            // Update suggestion status
            yield connection.query(`
                UPDATE mrp_suggestions 
                SET status = 'CONVERTED', converted_order_id = ?, updated_at = NOW()
                WHERE id = ?
            `, [orderId, suggestion.id]);
            createdOrders.push({
                orderId,
                orderNumber,
                productName: suggestion.product_name,
                quantity: suggestion.suggested_quantity
            });
        }
        yield connection.commit();
        res.json({
            message: 'Production orders created successfully',
            count: createdOrders.length,
            orders: createdOrders
        });
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error converting MRP suggestions:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.convertToOrders = convertToOrders;
/**
 * DELETE /api/mrp/suggestions/:id
 * Delete a suggestion
 */
const deleteSuggestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield db_1.pool.query('DELETE FROM mrp_suggestions WHERE id = ?', [id]);
        res.json({ message: 'Suggestion deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting MRP suggestion:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteSuggestion = deleteSuggestion;
