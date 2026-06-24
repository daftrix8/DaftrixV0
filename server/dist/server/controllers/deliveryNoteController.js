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
exports.deleteDeliveryNote = exports.updateDeliveryNoteStatus = exports.updateDeliveryNote = exports.createFromInvoice = exports.createDeliveryNote = exports.getDeliveryNote = exports.getDeliveryNotes = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const auditController_1 = require("./auditController");
// ========================================
// DELIVERY NOTES
// ========================================
const getDeliveryNotes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status, partnerId, invoiceId, search } = req.query;
        let query = `
            SELECT dn.*, w.name as warehouseName,
                   (SELECT COUNT(*) FROM delivery_note_items WHERE deliveryNoteId = dn.id) as itemCount
            FROM delivery_notes dn
            LEFT JOIN warehouses w ON dn.warehouseId = w.id
            WHERE 1=1
        `;
        const params = [];
        if (status) {
            query += ' AND dn.status = ?';
            params.push(status);
        }
        if (partnerId) {
            query += ' AND dn.partnerId = ?';
            params.push(partnerId);
        }
        if (invoiceId) {
            query += ' AND dn.invoiceId = ?';
            params.push(invoiceId);
        }
        if (search) {
            query += ' AND (dn.noteNumber LIKE ? OR dn.partnerName LIKE ? OR dn.driverName LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s);
        }
        query += ' ORDER BY dn.createdAt DESC LIMIT 200';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getDeliveryNotes = getDeliveryNotes;
const getDeliveryNote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [notes] = yield db_1.pool.query(`
            SELECT dn.*, w.name as warehouseName
            FROM delivery_notes dn
            LEFT JOIN warehouses w ON dn.warehouseId = w.id
            WHERE dn.id = ?
        `, [id]);
        if (!notes[0])
            return res.status(404).json({ error: 'Delivery note not found' });
        const [items] = yield db_1.pool.query('SELECT * FROM delivery_note_items WHERE deliveryNoteId = ? ORDER BY id', [id]);
        res.json(Object.assign(Object.assign({}, notes[0]), { items }));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getDeliveryNote = getDeliveryNote;
const createDeliveryNote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { invoiceId, partnerId, partnerName, warehouseId, driverName, driverPhone, vehicleNumber, notes, items } = req.body;
        if (!partnerName)
            return res.status(400).json({ error: 'Partner name is required' });
        const id = (0, crypto_1.randomUUID)();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        // Generate note number
        const [lastNote] = yield db_1.pool.query("SELECT noteNumber FROM delivery_notes ORDER BY createdAt DESC LIMIT 1");
        const lastNum = ((_b = lastNote[0]) === null || _b === void 0 ? void 0 : _b.noteNumber) ? parseInt(lastNote[0].noteNumber.replace('DN-', '')) : 0;
        const noteNumber = `DN-${String((lastNum || 0) + 1).padStart(6, '0')}`;
        yield db_1.pool.query(`
            INSERT INTO delivery_notes (id, noteNumber, invoiceId, partnerId, partnerName, warehouseId, driverName, driverPhone, vehicleNumber, notes, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, noteNumber, invoiceId || null, partnerId || null, partnerName, warehouseId || null, driverName || null, driverPhone || null, vehicleNumber || null, notes || null, user]);
        if (items === null || items === void 0 ? void 0 : items.length) {
            for (const item of items) {
                yield db_1.pool.query(`
                    INSERT INTO delivery_note_items (id, deliveryNoteId, productId, productName, orderedQty, deliveredQty, unit, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [(0, crypto_1.randomUUID)(), id, item.productId || null, item.productName, item.orderedQty || 0, item.deliveredQty || 0, item.unit || null, item.notes || null]);
            }
        }
        yield (0, auditController_1.logAction)(user, 'Operations', 'DN_CREATED', `Created delivery note ${noteNumber}`, `ID: ${id}`);
        res.status(201).json({ id, noteNumber });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.createDeliveryNote = createDeliveryNote;
const createFromInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const [lastNote] = yield db_1.pool.query("SELECT noteNumber FROM delivery_notes ORDER BY createdAt DESC LIMIT 1");
        const lastNum = ((_b = lastNote[0]) === null || _b === void 0 ? void 0 : _b.noteNumber) ? parseInt(lastNote[0].noteNumber.replace('DN-', '')) : 0;
        const noteNumber = `DN-${String((lastNum || 0) + 1).padStart(6, '0')}`;
        yield db_1.pool.query(`
            INSERT INTO delivery_notes (id, noteNumber, invoiceId, partnerId, partnerName, warehouseId, notes, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, noteNumber, invoiceId, invoice.partnerId, invoice.partnerName, invoice.warehouseId, `من فاتورة: ${invoice.number}`, user]);
        for (const line of lines) {
            yield db_1.pool.query(`
                INSERT INTO delivery_note_items (id, deliveryNoteId, productId, productName, orderedQty, deliveredQty, unit)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [(0, crypto_1.randomUUID)(), id, line.productId, line.productName, line.quantity || 0, line.quantity || 0, line.unit || null]);
        }
        yield (0, auditController_1.logAction)(user, 'Operations', 'DN_FROM_INVOICE', `Created DN ${noteNumber} from invoice ${invoice.number}`, `ID: ${id}`);
        res.status(201).json({ id, noteNumber });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.createFromInvoice = createFromInvoice;
const updateDeliveryNote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { driverName, driverPhone, vehicleNumber, notes, items } = req.body;
        yield db_1.pool.query(`
            UPDATE delivery_notes SET driverName = COALESCE(?, driverName), driverPhone = COALESCE(?, driverPhone),
            vehicleNumber = COALESCE(?, vehicleNumber), notes = COALESCE(?, notes) WHERE id = ?
        `, [driverName, driverPhone, vehicleNumber, notes, id]);
        if (items === null || items === void 0 ? void 0 : items.length) {
            yield db_1.pool.query('DELETE FROM delivery_note_items WHERE deliveryNoteId = ?', [id]);
            for (const item of items) {
                yield db_1.pool.query(`
                    INSERT INTO delivery_note_items (id, deliveryNoteId, productId, productName, orderedQty, deliveredQty, unit, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [(0, crypto_1.randomUUID)(), id, item.productId || null, item.productName, item.orderedQty || 0, item.deliveredQty || 0, item.unit || null, item.notes || null]);
            }
        }
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updateDeliveryNote = updateDeliveryNote;
const updateDeliveryNoteStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { status, receivedBy } = req.body;
        if (!status)
            return res.status(400).json({ error: 'Status is required' });
        const dateField = status === 'DISPATCHED' ? 'dispatchDate' : status === 'DELIVERED' ? 'deliveryDate' : null;
        let query = `UPDATE delivery_notes SET status = ?`;
        const params = [status];
        if (dateField) {
            query += `, ${dateField} = NOW()`;
        }
        if (receivedBy) {
            query += ', receivedBy = ?';
            params.push(receivedBy);
        }
        query += ' WHERE id = ?';
        params.push(id);
        yield db_1.pool.query(query, params);
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        yield (0, auditController_1.logAction)(user, 'Operations', 'DN_STATUS', `Delivery note status → ${status}`, `ID: ${id}`);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updateDeliveryNoteStatus = updateDeliveryNoteStatus;
const deleteDeliveryNote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const [note] = yield db_1.pool.query('SELECT status FROM delivery_notes WHERE id = ?', [id]);
        if (((_a = note[0]) === null || _a === void 0 ? void 0 : _a.status) !== 'DRAFT')
            return res.status(400).json({ error: 'Only draft notes can be deleted' });
        yield db_1.pool.query('DELETE FROM delivery_notes WHERE id = ?', [id]);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteDeliveryNote = deleteDeliveryNote;
