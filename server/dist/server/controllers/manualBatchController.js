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
exports.deleteManualBatch = exports.createManualBatch = exports.getManualBatch = exports.getManualBatches = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const getManualBatches = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [batches] = yield db_1.pool.query(`
            SELECT mb.*, w.name as warehouse_name
            FROM manual_batches mb
            LEFT JOIN warehouses w ON mb.warehouse_id = w.id
            ORDER BY mb.created_at DESC
        `);
        res.json(batches);
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(res, error, 'getManualBatches');
    }
});
exports.getManualBatches = getManualBatches;
const getManualBatch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [batches] = yield db_1.pool.query('SELECT * FROM manual_batches WHERE id = ?', [id]);
        const batch = batches[0];
        if (!batch)
            return res.status(404).json({ error: 'Batch not found' });
        const [inputs] = yield db_1.pool.query(`
            SELECT mbi.*, p.name as product_name, p.sku as product_sku, p.unit
            FROM manual_batch_inputs mbi
            JOIN products p ON mbi.product_id = p.id
            WHERE mbi.batch_id = ?
        `, [id]);
        const [outputs] = yield db_1.pool.query(`
            SELECT mbo.*, p.name as product_name, p.sku as product_sku, p.unit
            FROM manual_batch_outputs mbo
            JOIN products p ON mbo.product_id = p.id
            WHERE mbo.batch_id = ?
        `, [id]);
        res.json(Object.assign(Object.assign({}, batch), { inputs, outputs }));
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(res, error, 'getManualBatch');
    }
});
exports.getManualBatch = getManualBatch;
const createManualBatch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { batchNumber, date, warehouseId, totalCost, notes, inputs, outputs, createdBy } = req.body;
        const batchId = (0, crypto_1.randomUUID)();
        yield conn.query(`
            INSERT INTO manual_batches (id, batch_number, date, warehouse_id, total_cost, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [batchId, batchNumber, date, warehouseId, totalCost, notes || null, createdBy || null]);
        // Process Inputs (Deductions)
        for (const input of inputs) {
            const inputId = (0, crypto_1.randomUUID)();
            yield conn.query(`
                INSERT INTO manual_batch_inputs (id, batch_id, product_id, quantity, unit_cost, total_cost)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [inputId, batchId, input.productId, input.quantity, input.unitCost, input.totalCost]);
            // Deduct stock
            yield conn.query('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?', [input.quantity, input.productId]);
            yield conn.query(`
                UPDATE product_stocks 
                SET quantity = GREATEST(0, quantity - ?) 
                WHERE product_id = ? AND warehouse_id = ?
            `, [input.quantity, input.productId, warehouseId]);
            // Stock Movement
            yield conn.query(`
                INSERT INTO stock_movements (product_id, warehouse_id, movement_type, qty_change, reference_type, reference_id, notes)
                VALUES (?, ?, 'PRODUCTION_USE', ?, 'MANUAL_BATCH', ?, ?)
            `, [input.productId, warehouseId, -input.quantity, batchId, `صرف خامات لتجميعة يدوية ${batchNumber}`]);
        }
        // Process Outputs (Additions)
        for (const output of outputs) {
            const outputId = (0, crypto_1.randomUUID)();
            yield conn.query(`
                INSERT INTO manual_batch_outputs (id, batch_id, product_id, quantity, unit_cost, total_cost)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [outputId, batchId, output.productId, output.quantity, output.unitCost, output.totalCost]);
            // Update cost
            if (output.quantity > 0) {
                // Update average cost in products
                yield conn.query(`
                    UPDATE products 
                    SET cost = ((stock * cost) + ?) / (stock + ?), stock = stock + ?
                    WHERE id = ?
                `, [output.totalCost, output.quantity, output.quantity, output.productId]);
            }
            else {
                yield conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [output.quantity, output.productId]);
            }
            // Update warehouse stock
            yield conn.query(`
                INSERT INTO product_stocks (product_id, warehouse_id, quantity)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE quantity = quantity + ?
            `, [output.productId, warehouseId, output.quantity, output.quantity]);
            // Stock Movement
            yield conn.query(`
                INSERT INTO stock_movements (product_id, warehouse_id, movement_type, qty_change, reference_type, reference_id, notes)
                VALUES (?, ?, 'PRODUCTION', ?, 'MANUAL_BATCH', ?, ?)
            `, [output.productId, warehouseId, output.quantity, batchId, `إضافة منتج من تجميعة يدوية ${batchNumber}`]);
        }
        yield conn.commit();
        res.status(201).json({ success: true, id: batchId, message: 'تم حفظ التجميعة اليدوية بنجاح' });
    }
    catch (error) {
        yield conn.rollback();
        (0, errorHandler_1.handleControllerError)(res, error, 'createManualBatch');
    }
    finally {
        conn.release();
    }
});
exports.createManualBatch = createManualBatch;
const deleteManualBatch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { id } = req.params;
        // Fetch inputs and outputs to reverse stock
        const [inputs] = yield conn.query('SELECT * FROM manual_batch_inputs WHERE batch_id = ?', [id]);
        const [outputs] = yield conn.query('SELECT * FROM manual_batch_outputs WHERE batch_id = ?', [id]);
        const [batchRows] = yield conn.query('SELECT warehouse_id FROM manual_batches WHERE id = ?', [id]);
        if (!batchRows[0]) {
            throw new Error('Batch not found');
        }
        const warehouseId = batchRows[0].warehouse_id;
        // Reverse inputs (add back)
        for (const input of inputs) {
            yield conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [input.quantity, input.product_id]);
            yield conn.query('UPDATE product_stocks SET quantity = quantity + ? WHERE product_id = ? AND warehouse_id = ?', [input.quantity, input.product_id, warehouseId]);
        }
        // Reverse outputs (subtract)
        for (const output of outputs) {
            yield conn.query('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?', [output.quantity, output.product_id]);
            yield conn.query('UPDATE product_stocks SET quantity = GREATEST(0, quantity - ?) WHERE product_id = ? AND warehouse_id = ?', [output.quantity, output.product_id, warehouseId]);
        }
        // Delete movements
        yield conn.query('DELETE FROM stock_movements WHERE reference_type = "MANUAL_BATCH" AND reference_id = ?', [id]);
        // Delete batch (cascade takes care of inputs/outputs)
        yield conn.query('DELETE FROM manual_batches WHERE id = ?', [id]);
        yield conn.commit();
        res.json({ success: true, message: 'تم حذف التجميعة اليدوية وعكس المخزون بنجاح' });
    }
    catch (error) {
        yield conn.rollback();
        (0, errorHandler_1.handleControllerError)(res, error, 'deleteManualBatch');
    }
    finally {
        conn.release();
    }
});
exports.deleteManualBatch = deleteManualBatch;
