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
exports.deleteScrap = exports.updateScrapDisposal = exports.createScrap = exports.getScrapStats = exports.getScrap = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
/**
 * Scrap Controller
 * Handles production scrap/waste tracking and disposal
 */
// Get all scrap records with filters
const getScrap = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productionOrderId, productId, scrapType, disposalStatus, startDate, endDate } = req.query;
        let query = `
            SELECT s.*, 
                   po.order_number,
                   fp.name as finished_product_name,
                   p.name as scrap_product_name,
                   p.sku as scrap_product_sku,
                   w.name as warehouse_name
            FROM production_scrap s
            LEFT JOIN production_orders po ON s.production_order_id = po.id
            LEFT JOIN products fp ON po.finished_product_id = fp.id
            LEFT JOIN products p ON s.product_id = p.id
            LEFT JOIN warehouses w ON s.warehouse_id = w.id
            WHERE 1=1
        `;
        const params = [];
        if (productionOrderId) {
            query += ' AND s.production_order_id = ?';
            params.push(productionOrderId);
        }
        if (productId) {
            query += ' AND s.product_id = ?';
            params.push(productId);
        }
        if (scrapType) {
            query += ' AND s.scrap_type = ?';
            params.push(scrapType);
        }
        if (disposalStatus) {
            query += ' AND s.disposal_status = ?';
            params.push(disposalStatus);
        }
        if (startDate) {
            query += ' AND DATE(s.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND DATE(s.created_at) <= ?';
            params.push(endDate);
        }
        query += ' ORDER BY s.created_at DESC';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching scrap:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getScrap = getScrap;
// Get scrap statistics
const getScrapStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate } = req.query;
        let dateFilter = '';
        const params = [];
        if (startDate && endDate) {
            dateFilter = 'WHERE DATE(created_at) BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }
        // Total scrap value and quantity
        const [totalStats] = yield db_1.pool.query(`
            SELECT 
                COUNT(*) as total_records,
                SUM(quantity) as total_quantity,
                SUM(total_value) as total_value,
                AVG(total_value) as avg_value
            FROM production_scrap
            ${dateFilter}
        `, params);
        // Scrap by type
        const [byType] = yield db_1.pool.query(`
            SELECT 
                scrap_type,
                COUNT(*) as count,
                SUM(quantity) as total_quantity,
                SUM(total_value) as total_value
            FROM production_scrap
            ${dateFilter}
            GROUP BY scrap_type
            ORDER BY total_value DESC
        `, params);
        // Scrap by disposal status
        const [byStatus] = yield db_1.pool.query(`
            SELECT 
                disposal_status,
                COUNT(*) as count,
                SUM(total_value) as total_value
            FROM production_scrap
            ${dateFilter}
            GROUP BY disposal_status
        `, params);
        // Top scrap products
        const [topProducts] = yield db_1.pool.query(`
            SELECT 
                p.id,
                p.name,
                p.sku,
                COUNT(s.id) as scrap_count,
                SUM(s.quantity) as total_quantity,
                SUM(s.total_value) as total_value
            FROM production_scrap s
            LEFT JOIN products p ON s.product_id = p.id
            ${dateFilter}
            GROUP BY p.id, p.name, p.sku
            ORDER BY total_value DESC
            LIMIT 10
        `, params);
        res.json({
            summary: totalStats[0],
            byType,
            byStatus,
            topProducts
        });
    }
    catch (error) {
        console.error('Error fetching scrap stats:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getScrapStats = getScrapStats;
// Create scrap record
const createScrap = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productionOrderId, productId, warehouseId, quantity, unit, scrapType, reason, unitCost, createdBy } = req.body;
        if (!productionOrderId || !productId || !quantity) {
            return res.status(400).json({ message: 'Production order, product, and quantity are required' });
        }
        const id = (0, crypto_1.randomUUID)();
        const totalValue = (unitCost || 0) * quantity;
        yield db_1.pool.query(`
            INSERT INTO production_scrap (
                id, production_order_id, product_id, warehouse_id,
                quantity, unit, scrap_type, reason,
                unit_cost, total_value, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            productionOrderId,
            productId,
            warehouseId || null,
            quantity,
            unit || null,
            scrapType || 'CUTTING_WASTE',
            reason || null,
            unitCost || null,
            totalValue,
            createdBy || null
        ]);
        // Get the created record with joins
        const [result] = yield db_1.pool.query(`
            SELECT s.*, 
                   po.order_number,
                   p.name as scrap_product_name,
                   p.sku as scrap_product_sku
            FROM production_scrap s
            LEFT JOIN production_orders po ON s.production_order_id = po.id
            LEFT JOIN products p ON s.product_id = p.id
            WHERE s.id = ?
        `, [id]);
        res.json(result[0]);
    }
    catch (error) {
        console.error('Error creating scrap:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.createScrap = createScrap;
// Update scrap disposal status
const updateScrapDisposal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { disposalStatus, disposalNotes } = req.body;
        if (!disposalStatus) {
            return res.status(400).json({ message: 'Disposal status is required' });
        }
        yield db_1.pool.query(`
            UPDATE production_scrap
            SET disposal_status = ?,
                disposal_date = CASE WHEN ? IN ('DISPOSED', 'SOLD', 'RECYCLED') THEN NOW() ELSE disposal_date END,
                disposal_notes = ?
            WHERE id = ?
        `, [disposalStatus, disposalStatus, disposalNotes || null, id]);
        const [result] = yield db_1.pool.query('SELECT * FROM production_scrap WHERE id = ?', [id]);
        res.json(result[0]);
    }
    catch (error) {
        console.error('Error updating scrap disposal:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updateScrapDisposal = updateScrapDisposal;
// Delete scrap record
const deleteScrap = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield db_1.pool.query('DELETE FROM production_scrap WHERE id = ?', [id]);
        res.json({ message: 'Scrap record deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting scrap:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteScrap = deleteScrap;
