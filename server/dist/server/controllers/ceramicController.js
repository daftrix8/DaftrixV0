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
exports.getCustomerCeramicPricing = exports.deleteCeramicDiscountList = exports.updateCeramicDiscountList = exports.createCeramicDiscountList = exports.getCeramicDiscountList = exports.getCeramicDiscountLists = exports.deleteCeramicPriceList = exports.updateCeramicPriceList = exports.createCeramicPriceList = exports.getCeramicPriceList = exports.getCeramicPriceLists = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
// Helper: convert ISO datetime to YYYY-MM-DD for MariaDB DATE columns
const formatDate = (d) => {
    if (!d)
        return null;
    return String(d).substring(0, 10); // '2026-03-08T22:00:00.000Z' → '2026-03-08'
};
// ========================================
// CERAMIC PRICE LISTS (قوائم أسعار السيراميك)
// ========================================
const getCeramicPriceLists = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query(`SELECT pl.*, dl.name as discountListName 
             FROM ceramic_price_lists pl 
             LEFT JOIN ceramic_discount_lists dl ON pl.discountListId = dl.id 
             ORDER BY pl.createdAt DESC`);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'ceramic price lists');
    }
});
exports.getCeramicPriceLists = getCeramicPriceLists;
const getCeramicPriceList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        const [lists] = yield conn.query(`SELECT pl.*, dl.name as discountListName 
             FROM ceramic_price_lists pl 
             LEFT JOIN ceramic_discount_lists dl ON pl.discountListId = dl.id 
             WHERE pl.id = ?`, [id]);
        if (!lists.length) {
            conn.release();
            return res.status(404).json({ error: 'قائمة الأسعار غير موجودة' });
        }
        const [items] = yield conn.query('SELECT * FROM ceramic_price_list_items WHERE priceListId = ? ORDER BY groupName, ceramicName', [id]);
        conn.release();
        res.json(Object.assign(Object.assign({}, lists[0]), { items }));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'ceramic price list');
    }
});
exports.getCeramicPriceList = getCeramicPriceList;
const createCeramicPriceList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, listNumber, date, companyId, companyName, notes, status, discountListId, items } = req.body;
        const id = (0, crypto_1.randomUUID)();
        const conn = yield (0, db_1.getConnection)();
        yield conn.query(`INSERT INTO ceramic_price_lists (id, name, listNumber, date, companyId, companyName, notes, status, discountListId)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, name, listNumber || null, formatDate(date), companyId || null, companyName || null, notes || null, status || 'ACTIVE', discountListId || null]);
        // Insert items if provided
        if (items && items.length > 0) {
            for (const item of items) {
                yield conn.query(`INSERT INTO ceramic_price_list_items 
                     (id, priceListId, productId, groupName, ceramicName, sizeName, itemNumber, color, colorGrade, colorDescription, pattern, price1, price2, price3, price4, feature1, feature2, feature3)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    (0, crypto_1.randomUUID)(), id, item.productId || null,
                    item.groupName || null, item.ceramicName || null, item.sizeName || null, item.itemNumber || null,
                    item.color || null, item.colorGrade || null, item.colorDescription || null, item.pattern || null,
                    item.price1 || 0, item.price2 || 0, item.price3 || 0, item.price4 || 0,
                    item.feature1 || 0, item.feature2 || 0, item.feature3 || 0
                ]);
            }
        }
        conn.release();
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'ceramic_price_lists', updatedBy: 'System' });
        res.status(201).json({ id, name, listNumber, status });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'creating ceramic price list');
    }
});
exports.createCeramicPriceList = createCeramicPriceList;
const updateCeramicPriceList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, listNumber, date, companyId, companyName, notes, status, discountListId, items } = req.body;
        const conn = yield (0, db_1.getConnection)();
        yield conn.query(`UPDATE ceramic_price_lists 
             SET name = ?, listNumber = ?, date = ?, companyId = ?, companyName = ?, notes = ?, status = ?, discountListId = ?
             WHERE id = ?`, [name, listNumber || null, formatDate(date), companyId || null, companyName || null, notes || null, status || 'ACTIVE', discountListId || null, id]);
        // Replace items if provided
        if (items !== undefined) {
            yield conn.query('DELETE FROM ceramic_price_list_items WHERE priceListId = ?', [id]);
            for (const item of items) {
                yield conn.query(`INSERT INTO ceramic_price_list_items 
                     (id, priceListId, productId, groupName, ceramicName, sizeName, itemNumber, color, colorGrade, colorDescription, pattern, price1, price2, price3, price4, feature1, feature2, feature3)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    item.id || (0, crypto_1.randomUUID)(), id, item.productId || null,
                    item.groupName || null, item.ceramicName || null, item.sizeName || null, item.itemNumber || null,
                    item.color || null, item.colorGrade || null, item.colorDescription || null, item.pattern || null,
                    item.price1 || 0, item.price2 || 0, item.price3 || 0, item.price4 || 0,
                    item.feature1 || 0, item.feature2 || 0, item.feature3 || 0
                ]);
            }
        }
        conn.release();
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'ceramic_price_lists', updatedBy: 'System' });
        res.json({ id, name, listNumber, status });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'updating ceramic price list');
    }
});
exports.updateCeramicPriceList = updateCeramicPriceList;
const deleteCeramicPriceList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        // Items are deleted by CASCADE
        yield conn.query('DELETE FROM ceramic_price_lists WHERE id = ?', [id]);
        conn.release();
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'ceramic_price_lists', entityId: id, deletedBy: 'System' });
        res.json({ message: 'تم حذف قائمة أسعار السيراميك بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleting ceramic price list');
    }
});
exports.deleteCeramicPriceList = deleteCeramicPriceList;
// ========================================
// CERAMIC DISCOUNT LISTS (قوائم خصم السيراميك)
// ========================================
const getCeramicDiscountLists = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query('SELECT * FROM ceramic_discount_lists ORDER BY createdAt DESC');
        conn.release();
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'ceramic discount lists');
    }
});
exports.getCeramicDiscountLists = getCeramicDiscountLists;
const getCeramicDiscountList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        const [lists] = yield conn.query('SELECT * FROM ceramic_discount_lists WHERE id = ?', [id]);
        if (!lists.length) {
            conn.release();
            return res.status(404).json({ error: 'قائمة الخصم غير موجودة' });
        }
        const [items] = yield conn.query('SELECT * FROM ceramic_discount_list_items WHERE discountListId = ? ORDER BY groupName', [id]);
        conn.release();
        res.json(Object.assign(Object.assign({}, lists[0]), { items }));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'ceramic discount list');
    }
});
exports.getCeramicDiscountList = getCeramicDiscountList;
const createCeramicDiscountList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, listNumber, date, companyId, companyName, discountType, notes, items } = req.body;
        const id = (0, crypto_1.randomUUID)();
        const conn = yield (0, db_1.getConnection)();
        yield conn.query(`INSERT INTO ceramic_discount_lists (id, name, listNumber, date, companyId, companyName, discountType, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, name, listNumber || null, formatDate(date), companyId || null, companyName || null, discountType || 'WAREHOUSE', notes || null]);
        if (items && items.length > 0) {
            for (const item of items) {
                yield conn.query(`INSERT INTO ceramic_discount_list_items 
                     (id, discountListId, groupName, groupDescription, discount1, discount2, discount3, featureDiscount)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                    (0, crypto_1.randomUUID)(), id,
                    item.groupName, item.groupDescription || null,
                    item.discount1 || 0, item.discount2 || 0, item.discount3 || 0, item.featureDiscount || 0
                ]);
            }
        }
        conn.release();
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'ceramic_discount_lists', updatedBy: 'System' });
        res.status(201).json({ id, name, listNumber, discountType });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'creating ceramic discount list');
    }
});
exports.createCeramicDiscountList = createCeramicDiscountList;
const updateCeramicDiscountList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, listNumber, date, companyId, companyName, discountType, notes, items } = req.body;
        const conn = yield (0, db_1.getConnection)();
        yield conn.query(`UPDATE ceramic_discount_lists 
             SET name = ?, listNumber = ?, date = ?, companyId = ?, companyName = ?, discountType = ?, notes = ?
             WHERE id = ?`, [name, listNumber || null, formatDate(date), companyId || null, companyName || null, discountType || 'WAREHOUSE', notes || null, id]);
        if (items !== undefined) {
            yield conn.query('DELETE FROM ceramic_discount_list_items WHERE discountListId = ?', [id]);
            for (const item of items) {
                yield conn.query(`INSERT INTO ceramic_discount_list_items 
                     (id, discountListId, groupName, groupDescription, discount1, discount2, discount3, featureDiscount)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                    item.id || (0, crypto_1.randomUUID)(), id,
                    item.groupName, item.groupDescription || null,
                    item.discount1 || 0, item.discount2 || 0, item.discount3 || 0, item.featureDiscount || 0
                ]);
            }
        }
        conn.release();
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'ceramic_discount_lists', updatedBy: 'System' });
        res.json({ id, name, listNumber, discountType });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'updating ceramic discount list');
    }
});
exports.updateCeramicDiscountList = updateCeramicDiscountList;
const deleteCeramicDiscountList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        yield conn.query('DELETE FROM ceramic_discount_lists WHERE id = ?', [id]);
        conn.release();
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'ceramic_discount_lists', entityId: id, deletedBy: 'System' });
        res.json({ message: 'تم حذف قائمة خصم السيراميك بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleting ceramic discount list');
    }
});
exports.deleteCeramicDiscountList = deleteCeramicDiscountList;
// ========================================
// CUSTOMER CERAMIC PRICING (تسعير العميل)
// ========================================
const getCustomerCeramicPricing = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { partnerId } = req.params;
        const conn = yield (0, db_1.getConnection)();
        // Get partner's linked ceramic price list and discount list
        const [partners] = yield conn.query('SELECT ceramicPriceListId, ceramicDiscountListId FROM partners WHERE id = ?', [partnerId]);
        if (!partners.length) {
            conn.release();
            return res.status(404).json({ error: 'العميل غير موجود' });
        }
        const partner = partners[0];
        let priceList = null;
        let discountList = null;
        if (partner.ceramicPriceListId) {
            const [lists] = yield conn.query('SELECT * FROM ceramic_price_lists WHERE id = ?', [partner.ceramicPriceListId]);
            if (lists.length) {
                const [items] = yield conn.query('SELECT * FROM ceramic_price_list_items WHERE priceListId = ? ORDER BY groupName, ceramicName', [partner.ceramicPriceListId]);
                priceList = Object.assign(Object.assign({}, lists[0]), { items });
            }
        }
        if (partner.ceramicDiscountListId) {
            const [lists] = yield conn.query('SELECT * FROM ceramic_discount_lists WHERE id = ?', [partner.ceramicDiscountListId]);
            if (lists.length) {
                const [items] = yield conn.query('SELECT * FROM ceramic_discount_list_items WHERE discountListId = ? ORDER BY groupName', [partner.ceramicDiscountListId]);
                discountList = Object.assign(Object.assign({}, lists[0]), { items });
            }
        }
        conn.release();
        res.json({ priceList, discountList });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'customer ceramic pricing');
    }
});
exports.getCustomerCeramicPricing = getCustomerCeramicPricing;
