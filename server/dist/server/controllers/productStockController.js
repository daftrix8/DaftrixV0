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
exports.deleteProductStock = exports.upsertProductStock = exports.getProductStocksByWarehouse = exports.getProductStocksByProduct = exports.getProductStocks = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const getProductStocks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        // Use product_stocks for warehouse balances
        // UNION with vehicle_inventory for car/mobile stocks
        // FILTER: Only show entries with valid warehouseId (hide 'Unknown' entries)
        const [rows] = yield conn.query(`
            SELECT 
                ps.id, 
                ps.productId, 
                ps.warehouseId, 
                ps.stock, 
                w.name as warehouseName 
            FROM product_stocks ps
            INNER JOIN warehouses w ON ps.warehouseId = w.id
            WHERE ps.warehouseId IS NOT NULL
            
            UNION ALL
            
            SELECT 
                CONCAT('VEH-', vi.vehicleId, '-', vi.productId) as id,
                vi.productId,
                CONCAT('VEH-', vi.vehicleId) as warehouseId,
                vi.quantity as stock,
                COALESCE(CONCAT('سيارة: ', v.plateNumber), v.name, CONCAT('سيارة #', vi.vehicleId)) as warehouseName
            FROM vehicle_inventory vi
            LEFT JOIN vehicles v ON vi.vehicleId = v.id
            WHERE vi.quantity != 0
        `);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'product stocks');
    }
});
exports.getProductStocks = getProductStocks;
const getProductStocksByProduct = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productId } = req.params;
        const conn = yield (0, db_1.getConnection)();
        // Only show entries with valid warehouseId (hide 'Unknown' entries)
        const [rows] = yield conn.query(`
            SELECT ps.*, w.name as warehouseName 
            FROM product_stocks ps
            INNER JOIN warehouses w ON ps.warehouseId = w.id
            WHERE ps.productId = ? AND ps.warehouseId IS NOT NULL
        `, [productId]);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'product stocks');
    }
});
exports.getProductStocksByProduct = getProductStocksByProduct;
const getProductStocksByWarehouse = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { warehouseId } = req.params;
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query('SELECT * FROM product_stocks WHERE warehouseId = ?', [warehouseId]);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'product stocks');
    }
});
exports.getProductStocksByWarehouse = getProductStocksByWarehouse;
const upsertProductStock = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productId, warehouseId, stock } = req.body;
        const conn = yield (0, db_1.getConnection)();
        // Check if record exists
        const [existing] = yield conn.query('SELECT id FROM product_stocks WHERE productId = ? AND warehouseId = ?', [productId, warehouseId]);
        if (existing.length > 0) {
            // Update existing
            yield conn.query('UPDATE product_stocks SET stock = ? WHERE productId = ? AND warehouseId = ?', [stock, productId, warehouseId]);
            res.json({ productId, warehouseId, stock });
        }
        else {
            // Insert new
            const id = (0, crypto_1.randomUUID)();
            yield conn.query('INSERT INTO product_stocks (id, productId, warehouseId, stock) VALUES (?, ?, ?, ?)', [id, productId, warehouseId, stock]);
            res.status(201).json({ id, productId, warehouseId, stock });
        }
        conn.release();
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'upserting product stock');
    }
});
exports.upsertProductStock = upsertProductStock;
const deleteProductStock = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        yield conn.query('DELETE FROM product_stocks WHERE id = ?', [id]);
        conn.release();
        res.json({ message: 'Product stock deleted' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleting product stock');
    }
});
exports.deleteProductStock = deleteProductStock;
