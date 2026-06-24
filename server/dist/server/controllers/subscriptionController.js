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
exports.generateSubscriptionInvoice = exports.getDueSubscriptions = exports.deleteSubscription = exports.updateSubscription = exports.createSubscription = exports.getSubscriptions = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
// ═══════════════════════════════════════════════════════════
// SUBSCRIPTION / RECURRING INVOICES
// ═══════════════════════════════════════════════════════════
const FREQUENCY_DAYS = {
    daily: 1,
    weekly: 7,
    monthly: 30,
    quarterly: 90,
    half_yearly: 180,
    yearly: 365
};
function addFrequency(date, frequency) {
    const result = new Date(date);
    switch (frequency) {
        case 'daily':
            result.setDate(result.getDate() + 1);
            break;
        case 'weekly':
            result.setDate(result.getDate() + 7);
            break;
        case 'monthly':
            result.setMonth(result.getMonth() + 1);
            break;
        case 'quarterly':
            result.setMonth(result.getMonth() + 3);
            break;
        case 'half_yearly':
            result.setMonth(result.getMonth() + 6);
            break;
        case 'yearly':
            result.setFullYear(result.getFullYear() + 1);
            break;
        default: result.setMonth(result.getMonth() + 1);
    }
    return result;
}
const getSubscriptions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { status, partnerId } = req.query;
        let query = `
            SELECT s.*, p.name as partnerName,
                (SELECT COUNT(*) FROM subscription_invoices si WHERE si.subscriptionId = s.id) as invoiceCount
            FROM subscriptions s
            LEFT JOIN partners p ON s.partnerId = p.id
            WHERE 1=1
        `;
        const params = [];
        if (status) {
            query += ' AND s.status = ?';
            params.push(status);
        }
        if (partnerId) {
            query += ' AND s.partnerId = ?';
            params.push(partnerId);
        }
        query += ' ORDER BY s.createdAt DESC';
        const [rows] = yield conn.query(query, params);
        // Fetch items for each subscription
        for (const sub of rows) {
            const [items] = yield conn.query(`SELECT si.*, pr.name as productName 
                 FROM subscription_items si 
                 LEFT JOIN products pr ON si.productId = pr.id 
                 WHERE si.subscriptionId = ? ORDER BY si.sortOrder`, [sub.id]);
            sub.items = items;
        }
        conn.release();
        res.json(rows);
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'subscriptions');
    }
});
exports.getSubscriptions = getSubscriptions;
const createSubscription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { name, partnerId, partnerType, frequency, startDate, endDate, invoiceType, warehouseId, notes, paymentTermsTemplateId, items } = req.body;
        if (!name || !partnerId || !startDate) {
            conn.release();
            return res.status(400).json({ error: 'الاسم والعميل وتاريخ البدء مطلوبة' });
        }
        if (!Array.isArray(items) || items.length === 0) {
            conn.release();
            return res.status(400).json({ error: 'يجب إضافة بند واحد على الأقل' });
        }
        const id = (0, crypto_1.randomUUID)();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        const nextInvoiceDate = startDate;
        yield conn.beginTransaction();
        yield conn.query(`INSERT INTO subscriptions 
            (id, name, partnerId, partnerType, frequency, startDate, endDate, nextInvoiceDate, invoiceType, warehouseId, notes, paymentTermsTemplateId)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, name, partnerId, partnerType || 'customer', frequency || 'monthly',
            startDate, endDate || null, nextInvoiceDate, invoiceType || 'SALE',
            warehouseId || null, notes || null, paymentTermsTemplateId || null]);
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const qty = parseFloat(item.quantity) || 1;
            const price = parseFloat(item.price) || 0;
            const discount = parseFloat(item.discount) || 0;
            const total = qty * price - discount;
            yield conn.query(`INSERT INTO subscription_items (id, subscriptionId, productId, description, quantity, price, discount, total, sortOrder)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), id, item.productId || null, item.description || '', qty, price, discount, total, i]);
        }
        yield conn.commit();
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'CREATE_SUBSCRIPTION', `إنشاء اشتراك: ${name}`, `الاسم: ${name}`);
        }
        catch (_b) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'subscriptions', updatedBy: user });
        res.status(201).json({ id, name });
    }
    catch (error) {
        try {
            yield conn.rollback();
        }
        catch (_c) { }
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'subscription');
    }
});
exports.createSubscription = createSubscription;
const updateSubscription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const { name, partnerId, partnerType, frequency, startDate, endDate, invoiceType, warehouseId, notes, paymentTermsTemplateId, status, items } = req.body;
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        yield conn.beginTransaction();
        yield conn.query(`UPDATE subscriptions SET name = ?, partnerId = ?, partnerType = ?, frequency = ?, 
             startDate = ?, endDate = ?, invoiceType = ?, warehouseId = ?, notes = ?, 
             paymentTermsTemplateId = ?, status = ? WHERE id = ?`, [name, partnerId, partnerType || 'customer', frequency || 'monthly',
            startDate, endDate || null, invoiceType || 'SALE', warehouseId || null,
            notes || null, paymentTermsTemplateId || null, status || 'active', id]);
        // Replace items
        if (Array.isArray(items)) {
            yield conn.query('DELETE FROM subscription_items WHERE subscriptionId = ?', [id]);
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const qty = parseFloat(item.quantity) || 1;
                const price = parseFloat(item.price) || 0;
                const discount = parseFloat(item.discount) || 0;
                const total = qty * price - discount;
                yield conn.query(`INSERT INTO subscription_items (id, subscriptionId, productId, description, quantity, price, discount, total, sortOrder)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), id, item.productId || null, item.description || '', qty, price, discount, total, i]);
            }
        }
        yield conn.commit();
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'UPDATE_SUBSCRIPTION', `تحديث اشتراك: ${name}`, `الاسم: ${name}`);
        }
        catch (_b) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'subscriptions', updatedBy: user });
        res.json({ id, name });
    }
    catch (error) {
        try {
            yield conn.rollback();
        }
        catch (_c) { }
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'subscription');
    }
});
exports.updateSubscription = updateSubscription;
const deleteSubscription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        const [row] = yield conn.query('SELECT name FROM subscriptions WHERE id = ?', [id]);
        const subName = ((_b = row[0]) === null || _b === void 0 ? void 0 : _b.name) || id;
        yield conn.query('DELETE FROM subscriptions WHERE id = ?', [id]);
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'DELETE_SUBSCRIPTION', `حذف اشتراك: ${subName}`, `المعرف: ${id}`);
        }
        catch (_c) { }
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'subscriptions', entityId: id, deletedBy: user });
        res.json({ message: 'تم حذف الاشتراك بنجاح' });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'subscription');
    }
});
exports.deleteSubscription = deleteSubscription;
/** Get subscriptions due for invoice generation today */
const getDueSubscriptions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const today = new Date().toISOString().split('T')[0];
        const [rows] = yield conn.query(`
            SELECT s.*, p.name as partnerName
            FROM subscriptions s
            LEFT JOIN partners p ON s.partnerId = p.id
            WHERE s.status = 'active' 
              AND s.nextInvoiceDate <= ?
              AND (s.endDate IS NULL OR s.endDate >= ?)
            ORDER BY s.nextInvoiceDate
        `, [today, today]);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'due subscriptions');
    }
});
exports.getDueSubscriptions = getDueSubscriptions;
/** Generate invoice from a subscription (called manually or by cron) */
const generateSubscriptionInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { subscriptionId } = req.params;
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        // Get subscription with items
        const [subRows] = yield conn.query('SELECT * FROM subscriptions WHERE id = ? AND status = ?', [subscriptionId, 'active']);
        if (!Array.isArray(subRows) || subRows.length === 0) {
            conn.release();
            return res.status(404).json({ error: 'الاشتراك غير موجود أو غير نشط' });
        }
        const sub = subRows[0];
        const [itemRows] = yield conn.query('SELECT * FROM subscription_items WHERE subscriptionId = ? ORDER BY sortOrder', [subscriptionId]);
        if (!Array.isArray(itemRows) || itemRows.length === 0) {
            conn.release();
            return res.status(400).json({ error: 'لا توجد بنود في الاشتراك' });
        }
        // Build invoice total
        const invoiceTotal = itemRows.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
        // Create invoice via existing invoice system
        // Build lines from subscription items
        const lines = itemRows.map(item => ({
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            price: item.price,
            discount: item.discount,
            total: item.total
        }));
        yield conn.beginTransaction();
        // Insert invoice
        const today = new Date().toISOString().split('T')[0];
        const [result] = yield conn.query(`INSERT INTO invoices (partnerId, type, date, total, status, notes, warehouseId)
             VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`, [sub.partnerId, sub.invoiceType, today, invoiceTotal,
            `فاتورة اشتراك تلقائية - ${sub.name}`, sub.warehouseId]);
        const invoiceId = result.insertId;
        // Insert invoice lines
        for (const line of lines) {
            yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, description, quantity, price, discount, total)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`, [invoiceId, line.productId, line.description, line.quantity, line.price, line.discount, line.total]);
        }
        // Log subscription invoice
        yield conn.query('INSERT INTO subscription_invoices (id, subscriptionId, invoiceId, generatedDate) VALUES (?, ?, ?, ?)', [(0, crypto_1.randomUUID)(), subscriptionId, invoiceId, today]);
        // Update subscription next date
        const nextDate = addFrequency(new Date(sub.nextInvoiceDate), sub.frequency);
        const isCompleted = sub.endDate && nextDate > new Date(sub.endDate);
        yield conn.query(`UPDATE subscriptions SET nextInvoiceDate = ?, lastInvoiceDate = ?, 
             totalInvoicesGenerated = totalInvoicesGenerated + 1,
             status = ? WHERE id = ?`, [nextDate.toISOString().split('T')[0], today,
            isCompleted ? 'completed' : 'active', subscriptionId]);
        yield conn.commit();
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'GENERATE_SUBSCRIPTION_INVOICE', `إنشاء فاتورة اشتراك: ${sub.name}`, `فاتورة رقم: ${invoiceId}`);
        }
        catch (_b) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoices', updatedBy: user });
        res.status(201).json({ invoiceId, subscriptionId, message: `تم إنشاء الفاتورة رقم ${invoiceId} بنجاح` });
    }
    catch (error) {
        try {
            yield conn.rollback();
        }
        catch (_c) { }
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'generate subscription invoice');
    }
});
exports.generateSubscriptionInvoice = generateSubscriptionInvoice;
