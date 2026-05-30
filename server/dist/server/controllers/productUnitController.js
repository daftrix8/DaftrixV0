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
exports.convertQuantity = exports.bulkCreateUnits = exports.getStockInAllUnits = exports.deleteProductUnit = exports.updateProductUnit = exports.createProductUnit = exports.getUnitByBarcode = exports.getProductUnits = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
// ========================================
// PRODUCT UNITS CONTROLLER
// وحدات قياس المنتج - البيع بوحدات متعددة
// ========================================
// Get all units for a specific product
const getProductUnits = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productId } = req.params;
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query(`
            SELECT * FROM product_units 
            WHERE productId = ? 
            ORDER BY isBaseUnit DESC, sortOrder ASC, conversionFactor ASC
        `, [productId]);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching product units:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'product units');
    }
});
exports.getProductUnits = getProductUnits;
// Get unit by barcode (for POS scanning)
const getUnitByBarcode = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { barcode } = req.params;
        const conn = yield (0, db_1.getConnection)();
        // First check product_units table
        const [unitRows] = yield conn.query(`
            SELECT pu.*, p.name as productName, p.stock as productStock, p.id as productId
            FROM product_units pu
            JOIN products p ON pu.productId = p.id
            WHERE pu.barcode = ? AND pu.isActive = TRUE
        `, [barcode]);
        if (unitRows.length > 0) {
            conn.release();
            return res.json(unitRows[0]);
        }
        // Fallback: Check products table barcode (base unit)
        const [productRows] = yield conn.query(`
            SELECT p.*, 
                   'piece' as unitName,
                   1 as conversionFactor,
                   TRUE as isBaseUnit,
                   p.price as salePrice,
                   p.cost as purchasePrice
            FROM products p
            WHERE p.barcode = ?
        `, [barcode]);
        conn.release();
        if (productRows.length > 0) {
            return res.json(productRows[0]);
        }
        res.status(404).json({ message: 'Barcode not found' });
    }
    catch (error) {
        console.error('Error fetching unit by barcode:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'unit by barcode');
    }
});
exports.getUnitByBarcode = getUnitByBarcode;
// Create a new unit for a product
const createProductUnit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { productId } = req.params;
        const { unitName, unitNameEn, conversionFactor, isBaseUnit, barcode, purchasePrice, salePrice, wholesalePrice, minSaleQty, sortOrder } = req.body;
        const id = (0, crypto_1.randomUUID)();
        const conn = yield (0, db_1.getConnection)();
        // If this is being set as base unit, clear other base units first
        if (isBaseUnit) {
            yield conn.query(`
                UPDATE product_units SET isBaseUnit = FALSE WHERE productId = ?
            `, [productId]);
            // Also update the products table
            yield conn.query(`
                UPDATE products SET baseUnit = ?, hasMultipleUnits = TRUE WHERE id = ?
            `, [unitName, productId]);
        }
        // Check if product has any units yet
        const [existingUnits] = yield conn.query(`
            SELECT COUNT(*) as count FROM product_units WHERE productId = ?
        `, [productId]);
        const isFirstUnit = existingUnits[0].count === 0;
        yield conn.query(`
            INSERT INTO product_units (
                id, productId, unitName, unitNameEn, conversionFactor, 
                isBaseUnit, barcode, purchasePrice, salePrice, 
                wholesalePrice, minSaleQty, sortOrder
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, productId, unitName, unitNameEn || null,
            conversionFactor || 1, isBaseUnit || isFirstUnit, // First unit is base unit by default
            barcode || null, purchasePrice || null, salePrice || null,
            wholesalePrice || null, minSaleQty || 1, sortOrder || 0
        ]);
        // Update product to mark it has multiple units
        yield conn.query(`
            UPDATE products SET hasMultipleUnits = TRUE WHERE id = ?
        `, [productId]);
        conn.release();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || req.body.user || 'System';
        yield (0, auditController_1.logAction)(user, 'PRODUCT_UNIT', 'CREATE', `إضافة وحدة قياس: ${unitName}`, `المنتج: ${productId} | عامل التحويل: ${conversionFactor}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'product-units', productId, updatedBy: user });
        res.status(201).json(Object.assign({ id, productId }, req.body));
    }
    catch (error) {
        console.error('Error creating product unit:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'هذه الوحدة موجودة مسبقاً لهذا المنتج' });
        }
        return (0, errorHandler_1.handleControllerError)(res, error, 'creating product unit');
    }
});
exports.createProductUnit = createProductUnit;
// Update a product unit
const updateProductUnit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { productId, unitId } = req.params;
        const { unitName, unitNameEn, conversionFactor, isBaseUnit, barcode, purchasePrice, salePrice, wholesalePrice, minSaleQty, isActive, sortOrder } = req.body;
        const conn = yield (0, db_1.getConnection)();
        // If this is being set as base unit, clear other base units first
        if (isBaseUnit) {
            yield conn.query(`
                UPDATE product_units SET isBaseUnit = FALSE WHERE productId = ?
            `, [productId]);
            yield conn.query(`
                UPDATE products SET baseUnit = ? WHERE id = ?
            `, [unitName, productId]);
        }
        yield conn.query(`
            UPDATE product_units SET
                unitName = ?,
                unitNameEn = ?,
                conversionFactor = ?,
                isBaseUnit = ?,
                barcode = ?,
                purchasePrice = ?,
                salePrice = ?,
                wholesalePrice = ?,
                minSaleQty = ?,
                isActive = ?,
                sortOrder = ?
            WHERE id = ? AND productId = ?
        `, [
            unitName, unitNameEn, conversionFactor, isBaseUnit || false,
            barcode, purchasePrice, salePrice, wholesalePrice,
            minSaleQty || 1, isActive !== false, sortOrder || 0,
            unitId, productId
        ]);
        conn.release();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || req.body.user || 'System';
        yield (0, auditController_1.logAction)(user, 'PRODUCT_UNIT', 'UPDATE', `تعديل وحدة قياس: ${unitName}`, `المنتج: ${productId} | عامل التحويل: ${conversionFactor}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'product-units', productId, updatedBy: user });
        res.json(Object.assign({ id: unitId, productId }, req.body));
    }
    catch (error) {
        console.error('Error updating product unit:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'updating product unit');
    }
});
exports.updateProductUnit = updateProductUnit;
// Delete a product unit
const deleteProductUnit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { productId, unitId } = req.params;
        const conn = yield (0, db_1.getConnection)();
        // Check if it's the base unit
        const [unit] = yield conn.query(`
            SELECT isBaseUnit, unitName FROM product_units WHERE id = ?
        `, [unitId]);
        if (unit.length > 0 && unit[0].isBaseUnit) {
            conn.release();
            return res.status(400).json({
                message: 'لا يمكن حذف الوحدة الأساسية. قم بتعيين وحدة أخرى كوحدة أساسية أولاً.'
            });
        }
        const unitName = ((_a = unit[0]) === null || _a === void 0 ? void 0 : _a.unitName) || 'Unknown';
        yield conn.query(`DELETE FROM product_units WHERE id = ? AND productId = ?`, [unitId, productId]);
        // Check if product still has multiple units
        const [remainingUnits] = yield conn.query(`
            SELECT COUNT(*) as count FROM product_units WHERE productId = ?
        `, [productId]);
        if (remainingUnits[0].count <= 1) {
            yield conn.query(`
                UPDATE products SET hasMultipleUnits = FALSE WHERE id = ?
            `, [productId]);
        }
        conn.release();
        const user = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || ((_c = req.user) === null || _c === void 0 ? void 0 : _c.username) || req.query.user || 'System';
        yield (0, auditController_1.logAction)(user, 'PRODUCT_UNIT', 'DELETE', `حذف وحدة قياس: ${unitName}`, `المنتج: ${productId}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'product-units', entityId: unitId, productId, deletedBy: user });
        res.json({ message: 'Unit deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting product unit:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleting product unit');
    }
});
exports.deleteProductUnit = deleteProductUnit;
// Get stock in all available units for a product
const getStockInAllUnits = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { productId } = req.params;
        const warehouseId = req.query.warehouseId;
        const conn = yield (0, db_1.getConnection)();
        // Get base stock
        let stockQuery = `
            SELECT COALESCE(SUM(stock), 0) as totalStock 
            FROM product_stocks WHERE productId = ?
        `;
        const stockParams = [productId];
        if (warehouseId) {
            stockQuery = `
                SELECT COALESCE(stock, 0) as totalStock 
                FROM product_stocks WHERE productId = ? AND warehouseId = ?
            `;
            stockParams.push(warehouseId);
        }
        const [stockResult] = yield conn.query(stockQuery, stockParams);
        const baseStock = ((_a = stockResult[0]) === null || _a === void 0 ? void 0 : _a.totalStock) || 0;
        // Get all units
        const [units] = yield conn.query(`
            SELECT * FROM product_units 
            WHERE productId = ? AND isActive = TRUE
            ORDER BY isBaseUnit DESC, conversionFactor ASC
        `, [productId]);
        conn.release();
        // Calculate stock in each unit
        const stockByUnit = units.map(unit => ({
            unitId: unit.id,
            unitName: unit.unitName,
            conversionFactor: unit.conversionFactor,
            isBaseUnit: unit.isBaseUnit,
            availableQty: Math.floor(baseStock / unit.conversionFactor),
            remainder: baseStock % unit.conversionFactor
        }));
        res.json({
            productId,
            baseStock,
            stockByUnit
        });
    }
    catch (error) {
        console.error('Error calculating stock in units:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'calculating stock in unit');
    }
});
exports.getStockInAllUnits = getStockInAllUnits;
// Bulk create units for a product (useful for initial setup)
const bulkCreateUnits = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { productId } = req.params;
        const { units } = req.body; // Array of unit objects
        if (!Array.isArray(units) || units.length === 0) {
            return res.status(400).json({ message: 'Units array is required' });
        }
        const conn = yield (0, db_1.getConnection)();
        const createdUnits = [];
        // Clear existing units if requested
        if (req.body.replaceExisting) {
            yield conn.query(`DELETE FROM product_units WHERE productId = ?`, [productId]);
        }
        for (const unit of units) {
            const id = (0, crypto_1.randomUUID)();
            yield conn.query(`
                INSERT INTO product_units (
                    id, productId, unitName, unitNameEn, conversionFactor,
                    isBaseUnit, barcode, purchasePrice, salePrice,
                    wholesalePrice, minSaleQty, sortOrder
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    conversionFactor = VALUES(conversionFactor),
                    purchasePrice = VALUES(purchasePrice),
                    salePrice = VALUES(salePrice),
                    wholesalePrice = VALUES(wholesalePrice)
            `, [
                id, productId, unit.unitName, unit.unitNameEn || null,
                unit.conversionFactor || 1, unit.isBaseUnit || false,
                unit.barcode || null, unit.purchasePrice || null,
                unit.salePrice || null, unit.wholesalePrice || null,
                unit.minSaleQty || 1, unit.sortOrder || 0
            ]);
            createdUnits.push(Object.assign({ id }, unit));
        }
        // Update product
        yield conn.query(`
            UPDATE products SET hasMultipleUnits = TRUE WHERE id = ?
        `, [productId]);
        conn.release();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || req.body.user || 'System';
        yield (0, auditController_1.logAction)(user, 'PRODUCT_UNIT', 'BULK_CREATE', `إضافة ${units.length} وحدات قياس`, `المنتج: ${productId}`);
        res.status(201).json({
            message: `Created ${createdUnits.length} units successfully`,
            units: createdUnits
        });
    }
    catch (error) {
        console.error('Error bulk creating units:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'bulk creating units');
    }
});
exports.bulkCreateUnits = bulkCreateUnits;
// Convert quantity between units
const convertQuantity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productId } = req.params;
        const { fromUnitId, toUnitId, quantity } = req.body;
        if (!fromUnitId || !toUnitId || quantity === undefined) {
            return res.status(400).json({ message: 'fromUnitId, toUnitId, and quantity are required' });
        }
        const conn = yield (0, db_1.getConnection)();
        const [units] = yield conn.query(`
            SELECT id, unitName, conversionFactor FROM product_units 
            WHERE productId = ? AND id IN (?, ?)
        `, [productId, fromUnitId, toUnitId]);
        conn.release();
        const fromUnit = units.find(u => u.id === fromUnitId);
        const toUnit = units.find(u => u.id === toUnitId);
        if (!fromUnit || !toUnit) {
            return res.status(404).json({ message: 'Unit not found' });
        }
        // Convert to base unit first, then to target unit
        const baseQuantity = quantity * fromUnit.conversionFactor;
        const convertedQuantity = baseQuantity / toUnit.conversionFactor;
        res.json({
            fromUnit: fromUnit.unitName,
            toUnit: toUnit.unitName,
            originalQuantity: quantity,
            convertedQuantity,
            baseQuantity
        });
    }
    catch (error) {
        console.error('Error converting quantity:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'converting quantity');
    }
});
exports.convertQuantity = convertQuantity;
