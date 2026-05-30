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
exports.togglePriceListStatus = exports.deletePriceList = exports.updatePriceList = exports.createPriceList = exports.getPriceLists = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
// Helper to auto-create price_lists and product_prices tables if missing
const ensurePriceListTables = (conn) => __awaiter(void 0, void 0, void 0, function* () {
    yield conn.query(`
        CREATE TABLE IF NOT EXISTS price_lists (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            isActive BOOLEAN DEFAULT TRUE,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    yield conn.query(`
        CREATE TABLE IF NOT EXISTS product_prices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            productId VARCHAR(36) NOT NULL,
            priceListId VARCHAR(36) NOT NULL,
            price DECIMAL(15,2) DEFAULT 0,
            UNIQUE KEY unique_product_price (productId, priceListId)
        )
    `);
});
const getPriceLists = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const conn = yield (0, db_1.getConnection)();
        try {
            const [rows] = yield conn.query('SELECT * FROM price_lists ORDER BY createdAt DESC');
            conn.release();
            res.json(rows);
        }
        catch (queryErr) {
            // Table might not exist on client DB — auto-create it
            if (((_a = queryErr === null || queryErr === void 0 ? void 0 : queryErr.message) === null || _a === void 0 ? void 0 : _a.includes("doesn't exist")) || (queryErr === null || queryErr === void 0 ? void 0 : queryErr.code) === 'ER_NO_SUCH_TABLE') {
                console.warn('⚠️ price_lists table does not exist, creating it...');
                yield ensurePriceListTables(conn);
                conn.release();
                res.json([]);
            }
            else {
                conn.release();
                throw queryErr;
            }
        }
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'price lists');
    }
});
exports.getPriceLists = getPriceLists;
const createPriceList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, description, isActive } = req.body;
        const id = (0, crypto_1.randomUUID)();
        const conn = yield (0, db_1.getConnection)();
        // Ensure tables exist
        yield ensurePriceListTables(conn);
        yield conn.query('INSERT INTO price_lists (id, name, description, isActive) VALUES (?, ?, ?, ?)', [id, name, description || null, isActive !== undefined ? isActive : true]);
        // When creating a new price list, automatically add it to all existing products
        yield conn.query(`
            INSERT INTO product_prices (productId, priceListId, price)
            SELECT id, ?, 0 FROM products
        `, [id]);
        conn.release();
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'price_lists', updatedBy: 'System' });
        res.status(201).json({ id, name, description, isActive });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'creating price list');
    }
});
exports.createPriceList = createPriceList;
const updatePriceList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, description, isActive } = req.body;
        const conn = yield (0, db_1.getConnection)();
        yield conn.query('UPDATE price_lists SET name = ?, description = ?, isActive = ? WHERE id = ?', [name, description || null, isActive, id]);
        conn.release();
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'price_lists', updatedBy: 'System' });
        res.json({ id, name, description, isActive });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'updating price list');
    }
});
exports.updatePriceList = updatePriceList;
const deletePriceList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        // Delete related product_prices first, then the price list
        yield conn.query('DELETE FROM product_prices WHERE priceListId = ?', [id]);
        yield conn.query('DELETE FROM price_lists WHERE id = ?', [id]);
        conn.release();
        // Broadcast real-time deletion
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'price_lists', entityId: id, deletedBy: 'System' });
        res.json({ message: 'تم حذف قائمة الأسعار بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleting price list');
    }
});
exports.deletePriceList = deletePriceList;
const togglePriceListStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        yield conn.query('UPDATE price_lists SET isActive = NOT isActive WHERE id = ?', [id]);
        const [rows] = yield conn.query('SELECT * FROM price_lists WHERE id = ?', [id]);
        conn.release();
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'price_lists', updatedBy: 'System' });
        res.json(rows[0]);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'toggling price list status');
    }
});
exports.togglePriceListStatus = togglePriceListStatus;
