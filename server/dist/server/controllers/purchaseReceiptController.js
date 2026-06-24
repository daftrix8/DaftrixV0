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
exports.deletePurchaseReceipt = exports.updateReceiptStatus = exports.updatePurchaseReceipt = exports.createFromPurchaseInvoice = exports.createPurchaseReceipt = exports.getPurchaseReceipt = exports.getPurchaseReceipts = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const auditController_1 = require("./auditController");
// ========================================
// PURCHASE RECEIPTS (GRN)
// ========================================
const getPurchaseReceipts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status, partnerId, invoiceId, search } = req.query;
        let query = `
            SELECT pr.*, w.name as warehouseName,
                   (SELECT COUNT(*) FROM purchase_receipt_items WHERE receiptId = pr.id) as itemCount
            FROM purchase_receipts pr
            LEFT JOIN warehouses w ON pr.warehouseId = w.id
            WHERE 1=1
        `;
        const params = [];
        if (status) {
            query += ' AND pr.status = ?';
            params.push(status);
        }
        if (partnerId) {
            query += ' AND pr.partnerId = ?';
            params.push(partnerId);
        }
        if (invoiceId) {
            query += ' AND pr.invoiceId = ?';
            params.push(invoiceId);
        }
        if (search) {
            query += ' AND (pr.receiptNumber LIKE ? OR pr.partnerName LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s);
        }
        query += ' ORDER BY pr.createdAt DESC LIMIT 200';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getPurchaseReceipts = getPurchaseReceipts;
const getPurchaseReceipt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [receipts] = yield db_1.pool.query(`
            SELECT pr.*, w.name as warehouseName
            FROM purchase_receipts pr
            LEFT JOIN warehouses w ON pr.warehouseId = w.id
            WHERE pr.id = ?
        `, [id]);
        if (!receipts[0])
            return res.status(404).json({ error: 'Receipt not found' });
        const [items] = yield db_1.pool.query('SELECT * FROM purchase_receipt_items WHERE receiptId = ? ORDER BY id', [id]);
        res.json(Object.assign(Object.assign({}, receipts[0]), { items }));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getPurchaseReceipt = getPurchaseReceipt;
const createPurchaseReceipt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { invoiceId, partnerId, partnerName, warehouseId, notes, items } = req.body;
        if (!partnerName)
            return res.status(400).json({ error: 'Partner name is required' });
        const id = (0, crypto_1.randomUUID)();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        const [lastReceipt] = yield db_1.pool.query("SELECT receiptNumber FROM purchase_receipts ORDER BY createdAt DESC LIMIT 1");
        const lastNum = ((_b = lastReceipt[0]) === null || _b === void 0 ? void 0 : _b.receiptNumber) ? parseInt(lastReceipt[0].receiptNumber.replace('GRN-', '')) : 0;
        const receiptNumber = `GRN-${String((lastNum || 0) + 1).padStart(6, '0')}`;
        yield db_1.pool.query(`
            INSERT INTO purchase_receipts (id, receiptNumber, invoiceId, partnerId, partnerName, warehouseId, notes, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, receiptNumber, invoiceId || null, partnerId || null, partnerName, warehouseId || null, notes || null, user]);
        if (items === null || items === void 0 ? void 0 : items.length) {
            for (const item of items) {
                const accepted = (item.receivedQty || 0) - (item.rejectedQty || 0);
                yield db_1.pool.query(`
                    INSERT INTO purchase_receipt_items (id, receiptId, productId, productName, orderedQty, receivedQty, rejectedQty, acceptedQty, unit, rejectReason, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [(0, crypto_1.randomUUID)(), id, item.productId || null, item.productName, item.orderedQty || 0, item.receivedQty || 0, item.rejectedQty || 0, accepted, item.unit || null, item.rejectReason || null, item.notes || null]);
            }
        }
        yield (0, auditController_1.logAction)(user, 'Operations', 'GRN_CREATED', `Created GRN ${receiptNumber}`, `ID: ${id}`);
        res.status(201).json({ id, receiptNumber });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.createPurchaseReceipt = createPurchaseReceipt;
const createFromPurchaseInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { invoiceId } = req.params;
        const [invoices] = yield db_1.pool.query('SELECT id, number, partnerId, partnerName, warehouseId FROM invoices WHERE id = ?', [invoiceId]);
        if (!invoices[0])
            return res.status(404).json({ error: 'Invoice not found' });
        const invoice = invoices[0];
        const [lines] = yield db_1.pool.query('SELECT productId, productName, quantity, unit FROM invoice_lines WHERE invoiceId = ?', [invoiceId]);
        const id = (0, crypto_1.randomUUID)();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        const [lastReceipt] = yield db_1.pool.query("SELECT receiptNumber FROM purchase_receipts ORDER BY createdAt DESC LIMIT 1");
        const lastNum = ((_b = lastReceipt[0]) === null || _b === void 0 ? void 0 : _b.receiptNumber) ? parseInt(lastReceipt[0].receiptNumber.replace('GRN-', '')) : 0;
        const receiptNumber = `GRN-${String((lastNum || 0) + 1).padStart(6, '0')}`;
        yield db_1.pool.query(`
            INSERT INTO purchase_receipts (id, receiptNumber, invoiceId, partnerId, partnerName, warehouseId, notes, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, receiptNumber, invoiceId, invoice.partnerId, invoice.partnerName, invoice.warehouseId, `من فاتورة شراء: ${invoice.number}`, user]);
        for (const line of lines) {
            yield db_1.pool.query(`
                INSERT INTO purchase_receipt_items (id, receiptId, productId, productName, orderedQty, receivedQty, acceptedQty, unit)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [(0, crypto_1.randomUUID)(), id, line.productId, line.productName, line.quantity || 0, line.quantity || 0, line.quantity || 0, line.unit || null]);
        }
        yield (0, auditController_1.logAction)(user, 'Operations', 'GRN_FROM_INVOICE', `Created GRN ${receiptNumber} from invoice ${invoice.number}`, `ID: ${id}`);
        res.status(201).json({ id, receiptNumber });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.createFromPurchaseInvoice = createFromPurchaseInvoice;
const updatePurchaseReceipt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { notes, items } = req.body;
        if (notes !== undefined) {
            yield db_1.pool.query('UPDATE purchase_receipts SET notes = ? WHERE id = ?', [notes, id]);
        }
        if (items === null || items === void 0 ? void 0 : items.length) {
            yield db_1.pool.query('DELETE FROM purchase_receipt_items WHERE receiptId = ?', [id]);
            for (const item of items) {
                const accepted = (item.receivedQty || 0) - (item.rejectedQty || 0);
                yield db_1.pool.query(`
                    INSERT INTO purchase_receipt_items (id, receiptId, productId, productName, orderedQty, receivedQty, rejectedQty, acceptedQty, unit, rejectReason, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [(0, crypto_1.randomUUID)(), id, item.productId || null, item.productName, item.orderedQty || 0, item.receivedQty || 0, item.rejectedQty || 0, accepted, item.unit || null, item.rejectReason || null, item.notes || null]);
            }
        }
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updatePurchaseReceipt = updatePurchaseReceipt;
const updateReceiptStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { status, inspectedBy } = req.body;
        if (!status)
            return res.status(400).json({ error: 'Status is required' });
        let query = `UPDATE purchase_receipts SET status = ?`;
        const params = [status];
        if (status === 'RECEIVED') {
            query += ', receiptDate = NOW()';
        }
        if (inspectedBy) {
            query += ', inspectedBy = ?';
            params.push(inspectedBy);
        }
        query += ' WHERE id = ?';
        params.push(id);
        yield db_1.pool.query(query, params);
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        yield (0, auditController_1.logAction)(user, 'Operations', 'GRN_STATUS', `GRN status → ${status}`, `ID: ${id}`);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updateReceiptStatus = updateReceiptStatus;
const deletePurchaseReceipt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const [receipt] = yield db_1.pool.query('SELECT status FROM purchase_receipts WHERE id = ?', [id]);
        if (((_a = receipt[0]) === null || _a === void 0 ? void 0 : _a.status) !== 'DRAFT')
            return res.status(400).json({ error: 'Only draft receipts can be deleted' });
        yield db_1.pool.query('DELETE FROM purchase_receipts WHERE id = ?', [id]);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deletePurchaseReceipt = deletePurchaseReceipt;
