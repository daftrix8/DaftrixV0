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
exports.reservationController = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
exports.reservationController = {
    /**
     * Create material reservations for a production order
     * @param warehouseId - Optional. If specified, only reserve from this warehouse
     */
    createReservations(productionOrderId, bomId, quantity, warehouseId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const connection = yield (0, db_1.getConnection)();
            try {
                yield connection.beginTransaction();
                // 1. Get BOM items with waste percentage
                const [bomItems] = yield connection.query('SELECT * FROM bom_items WHERE bom_id = ?', [bomId]);
                const reservations = [];
                const insufficientMaterials = [];
                for (const item of bomItems) {
                    // Calculate required quantity INCLUDING waste
                    const wasteMultiplier = 1 + (item.waste_percent || 0) / 100;
                    const requiredQty = item.quantity_per_unit * quantity * wasteMultiplier;
                    let stockList = [];
                    if (warehouseId) {
                        // SIMPLIFIED: Check product_stocks table directly (primary source for stock data)
                        const [productStockRows] = yield connection.query(`SELECT warehouseId, stock as currentStock 
                         FROM product_stocks 
                         WHERE warehouseId = ? AND productId = ?`, [warehouseId, item.raw_product_id]);
                        if (productStockRows.length > 0 && Number(productStockRows[0].currentStock) > 0) {
                            stockList = productStockRows;
                        }
                        else {
                            // Fallback: Check global product stock (from products table)
                            const [globalStock] = yield connection.query(`SELECT ? as warehouseId, COALESCE(stock, 0) as currentStock 
                             FROM products 
                             WHERE id = ?`, [warehouseId, item.raw_product_id]);
                            if (globalStock.length > 0 && Number(globalStock[0].currentStock) > 0) {
                                stockList = globalStock;
                            }
                        }
                    }
                    else {
                        // Check all warehouses - use product_stocks as primary source
                        const [allWarehouseStock] = yield connection.query(`SELECT ps.warehouseId, ps.stock as currentStock, w.name
                         FROM product_stocks ps
                         JOIN warehouses w ON ps.warehouseId = w.id
                         WHERE ps.productId = ? AND ps.stock > 0
                         ORDER BY ps.stock DESC`, [item.raw_product_id]);
                        stockList = allWarehouseStock;
                    }
                    let remainingToReserve = requiredQty;
                    // Check existing reservations to subtract from physical stock
                    const reservationCheckQuery = warehouseId
                        ? `SELECT SUM(quantityReserved - quantityConsumed) as reserved
                       FROM material_reservations
                       WHERE productId = ? AND warehouseId = ? AND status = 'RESERVED'`
                        : `SELECT warehouseId, SUM(quantityReserved - quantityConsumed) as reserved
                       FROM material_reservations
                       WHERE productId = ? AND status = 'RESERVED'
                       GROUP BY warehouseId`;
                    const reservationParams = warehouseId
                        ? [item.raw_product_id, warehouseId]
                        : [item.raw_product_id];
                    const [existingReservations] = yield connection.query(reservationCheckQuery, reservationParams);
                    const reservedMap = new Map();
                    if (warehouseId) {
                        const reserved = ((_a = existingReservations[0]) === null || _a === void 0 ? void 0 : _a.reserved) || 0;
                        reservedMap.set(warehouseId, Number(reserved));
                    }
                    else {
                        existingReservations.forEach(r => reservedMap.set(r.warehouseId, Number(r.reserved)));
                    }
                    // If no stock found in product_stocks, still allow if warehouseId is specified
                    // (the user explicitly confirmed materials are there)
                    if (stockList.length === 0 && warehouseId) {
                        // Add dummy entry to allow reservation attempt
                        stockList = [{ warehouseId, currentStock: 0 }];
                    }
                    if (stockList.length === 0) {
                        insufficientMaterials.push({
                            productId: item.raw_product_id,
                            required: requiredQty,
                            available: 0
                        });
                        continue;
                    }
                    for (const warehouse of stockList) {
                        if (remainingToReserve <= 0.0001)
                            break;
                        const physicalStock = Number(warehouse.currentStock) || 0;
                        const alreadyReserved = reservedMap.get(warehouse.warehouseId) || 0;
                        const availableStock = physicalStock - alreadyReserved;
                        if (availableStock > 0) {
                            const reserveAmount = Math.min(availableStock, remainingToReserve);
                            const reservationId = (0, crypto_1.randomUUID)();
                            yield connection.query(`
                            INSERT INTO material_reservations 
                            (id, productionOrderId, productId, warehouseId, quantityReserved, status)
                            VALUES (?, ?, ?, ?, ?, 'RESERVED')
                        `, [reservationId, productionOrderId, item.raw_product_id, warehouse.warehouseId, reserveAmount]);
                            reservations.push({
                                id: reservationId,
                                productId: item.raw_product_id,
                                warehouseId: warehouse.warehouseId,
                                quantity: reserveAmount
                            });
                            remainingToReserve -= reserveAmount;
                        }
                    }
                    if (remainingToReserve > 0.0001) {
                        insufficientMaterials.push({
                            productId: item.raw_product_id,
                            required: requiredQty,
                            missing: remainingToReserve
                        });
                    }
                }
                if (insufficientMaterials.length > 0) {
                    // If we can't reserve everything, rollback and return failure
                    yield connection.rollback();
                    return { success: false, insufficientMaterials };
                }
                yield connection.commit();
                return { success: true, reservations };
            }
            catch (error) {
                yield connection.rollback();
                throw error;
            }
            finally {
                connection.release();
            }
        });
    },
    /**
     * Release reservations (e.g. when order is cancelled)
     */
    releaseReservations(productionOrderId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield db_1.pool.query(`
            UPDATE material_reservations 
            SET status = 'RELEASED', releasedAt = NOW()
            WHERE productionOrderId = ? AND status = 'RESERVED'
        `, [productionOrderId]);
        });
    },
    /**
     * Consume reserved materials (when production starts)
     */
    consumeReservations(productionOrderId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Update status to FULLY_CONSUMED
            // In a real scenario, we might consume partially
            yield db_1.pool.query(`
            UPDATE material_reservations 
            SET status = 'FULLY_CONSUMED', quantityConsumed = quantityReserved
            WHERE productionOrderId = ? AND status = 'RESERVED'
        `, [productionOrderId]);
        });
    },
    /**
     * Get available quantity for a product (Physical - Reserved)
     */
    getAvailableQuantity(productId) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. Get Physical Stock from product_stocks
            const [stockRows] = yield db_1.pool.query(`
            SELECT COALESCE(SUM(stock), 0) as totalStock
            FROM product_stocks
            WHERE productId = ?
        `, [productId]);
            const physicalStock = Number(stockRows[0].totalStock);
            // 2. Get Reserved Quantity
            const [reservedRows] = yield db_1.pool.query(`
            SELECT COALESCE(SUM(quantityReserved - quantityConsumed), 0) as totalReserved
            FROM material_reservations
            WHERE productId = ? AND status = 'RESERVED'
        `, [productId]);
            const reservedStock = Number(reservedRows[0].totalReserved);
            return {
                physical: physicalStock,
                reserved: reservedStock,
                available: physicalStock - reservedStock
            };
        });
    }
};
