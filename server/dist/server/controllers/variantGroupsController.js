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
exports.createBrand = exports.getBrands = exports.generateBarcodes = exports.generateSKUs = exports.deleteVariantGroup = exports.updateVariantGroup = exports.createVariantGroup = exports.getVariantGroupById = exports.getVariantGroups = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
// ═══════════════════════════════════════════════════════════
// VARIANT GROUPS CONTROLLER
// Manages product variant groups (e.g. T-Shirt with sizes/colors).
// Variants are regular products linked via products.variantGroupId.
// ═══════════════════════════════════════════════════════════
/**
 * Compute the cartesian product of multiple arrays.
 * cartesian([['S','M'], ['Red','Blue']]) → [['S','Red'],['S','Blue'],['M','Red'],['M','Blue']]
 */
function cartesian(arrays) {
    if (arrays.length === 0)
        return [[]];
    return arrays.reduce((acc, curr) => acc.flatMap(combo => curr.map(val => [...combo, val])), [[]]);
}
/** Build a product name from group name + attribute values */
function buildVariantName(groupName, attributeKeys, values) {
    const suffix = values.join(' - ');
    return `${groupName} (${suffix})`;
}
/** Build a SKU from group name + attribute values */
function buildVariantSKU(baseSku, values) {
    const suffix = values.map(v => v.replace(/\s+/g, '').toUpperCase()).join('-');
    return `${baseSku}-${suffix}`;
}
// ─── LIST ALL GROUPS ─────────────────────────────────────────
const getVariantGroups = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        conn = yield (0, db_1.getConnection)();
        const showInactive = req.query.showInactive === 'true';
        const [rows] = yield conn.query(`
      SELECT
        vg.*,
        c.name AS categoryName,
        b.name AS brandName,
        COUNT(DISTINCT p.id) AS productCount,
        COALESCE(SUM(ps.stock), 0) AS totalStock
      FROM variant_groups vg
      LEFT JOIN categories c ON vg.categoryId COLLATE utf8mb4_unicode_ci = c.id COLLATE utf8mb4_unicode_ci
      LEFT JOIN brands b ON vg.brandId COLLATE utf8mb4_unicode_ci = b.id COLLATE utf8mb4_unicode_ci
      LEFT JOIN products p ON p.variantGroupId COLLATE utf8mb4_unicode_ci = vg.id COLLATE utf8mb4_unicode_ci
      LEFT JOIN product_stocks ps ON ps.productId COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
      GROUP BY vg.id
      ORDER BY vg.createdAt DESC
    `);
        // Filter active/inactive in JS — safe even if isActive column was just migrated
        const filtered = showInactive
            ? rows
            : rows.filter(r => r.isActive !== false && r.isActive !== 0);
        conn.release();
        res.json(filtered);
    }
    catch (error) {
        if (conn)
            conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'getVariantGroups');
    }
});
exports.getVariantGroups = getVariantGroups;
// ─── GET SINGLE GROUP + CHILD PRODUCTS ───────────────────────
const getVariantGroupById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        const { id } = req.params;
        conn = yield (0, db_1.getConnection)();
        const [groupRows] = yield conn.query(`
      SELECT vg.*, c.name AS categoryName, b.name AS brandName
      FROM variant_groups vg
      LEFT JOIN categories c ON vg.categoryId COLLATE utf8mb4_unicode_ci = c.id COLLATE utf8mb4_unicode_ci
      LEFT JOIN brands b ON vg.brandId COLLATE utf8mb4_unicode_ci = b.id COLLATE utf8mb4_unicode_ci
      WHERE vg.id = ?
    `, [id]);
        if (groupRows.length === 0) {
            conn.release();
            return res.status(404).json({ message: 'Variant group not found' });
        }
        const group = groupRows[0];
        // Fetch child products with per-warehouse stock
        const [products] = yield conn.query(`
      SELECT p.id, p.name, p.sku, p.barcode, p.price, p.cost, p.variantAttributes,
             p.isActive, p.stock,
             COALESCE(SUM(ps.stock), 0) AS totalStock
      FROM products p
      LEFT JOIN product_stocks ps ON ps.productId = p.id
      WHERE p.variantGroupId = ?
      GROUP BY p.id
      ORDER BY p.name
    `, [id]);
        conn.release();
        res.json(Object.assign(Object.assign({}, group), { products }));
    }
    catch (error) {
        if (conn)
            conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'getVariantGroupById');
    }
});
exports.getVariantGroupById = getVariantGroupById;
// ─── CREATE GROUP + CHILD PRODUCTS ───────────────────────────
const createVariantGroup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    let conn;
    try {
        const { name, categoryId, brandId, description, attributeKeys, // ["size", "color"]
        attributeValues, // { size: ["S","M","L"], color: ["Red","Blue"] }
        baseSku, // optional base SKU prefix
        basePrice, // default price for generated products
        baseCost, // default cost for generated products
         } = req.body;
        if (!name || !attributeKeys || !Array.isArray(attributeKeys) || attributeKeys.length === 0) {
            return res.status(400).json({ message: 'Name and at least one attribute key are required' });
        }
        if (!attributeValues || typeof attributeValues !== 'object') {
            return res.status(400).json({ message: 'attributeValues object is required' });
        }
        // Validate all attribute keys have at least one value
        for (const key of attributeKeys) {
            const values = attributeValues[key];
            if (!Array.isArray(values) || values.length === 0) {
                return res.status(400).json({ message: `Attribute "${key}" must have at least one value` });
            }
        }
        conn = yield (0, db_1.getConnection)();
        yield conn.beginTransaction();
        const groupId = (0, crypto_1.randomUUID)();
        yield conn.query(`
      INSERT INTO variant_groups (id, name, categoryId, brandId, description, attributeKeys)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [groupId, name, categoryId || null, brandId || null, description || null, JSON.stringify(attributeKeys)]);
        // Check if caller sent pre-built variants (inline generator in ProductMaster)
        const inlineVariants = req.body.variants;
        const createdProducts = [];
        const skuBase = baseSku || name.replace(/\s+/g, '-').toUpperCase().substring(0, 10);
        const baseProductId = req.body.baseProductId;
        if (baseProductId) {
            yield conn.query(`UPDATE products SET type = 'TEMPLATE', variantGroupId = ? WHERE id = ?`, [groupId, baseProductId]);
        }
        if (Array.isArray(inlineVariants) && inlineVariants.length > 0) {
            // ── Use pre-built variants from the inline generator ──
            for (let i = 0; i < inlineVariants.length; i++) {
                const v = inlineVariants[i];
                const productId = (0, crypto_1.randomUUID)();
                const variantName = v.name || buildVariantName(name, attributeKeys, Object.values(v.attributes || {}));
                const variantSku = v.sku || buildVariantSKU(skuBase, Object.values(v.attributes || {}));
                yield conn.query(`
          INSERT INTO products (id, name, sku, barcode, price, cost, categoryId, variantGroupId, variantAttributes, isActive, trackInventory)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE)
        `, [
                    productId,
                    variantName,
                    variantSku,
                    v.barcode || null,
                    Number((_b = (_a = v.sellingPrice) !== null && _a !== void 0 ? _a : v.price) !== null && _b !== void 0 ? _b : basePrice) || 0,
                    Number((_d = (_c = v.purchasePrice) !== null && _c !== void 0 ? _c : v.cost) !== null && _d !== void 0 ? _d : baseCost) || 0,
                    categoryId || null,
                    groupId,
                    JSON.stringify(v.attributes || {}),
                ]);
                createdProducts.push({
                    id: productId,
                    name: variantName,
                    sku: variantSku,
                    barcode: v.barcode || null,
                    variantAttributes: v.attributes || {},
                });
            }
        }
        else {
            // ── Fallback: auto-generate from cartesian product ──
            const valueArrays = attributeKeys.map((key) => attributeValues[key]);
            const combinations = cartesian(valueArrays);
            for (const combo of combinations) {
                const productId = (0, crypto_1.randomUUID)();
                const variantName = buildVariantName(name, attributeKeys, combo);
                const variantSku = buildVariantSKU(skuBase, combo);
                const variantAttrs = {};
                attributeKeys.forEach((key, i) => {
                    variantAttrs[key] = combo[i];
                });
                yield conn.query(`
          INSERT INTO products (id, name, sku, price, cost, categoryId, variantGroupId, variantAttributes, isActive, trackInventory)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE)
        `, [
                    productId,
                    variantName,
                    variantSku,
                    basePrice || 0,
                    baseCost || 0,
                    categoryId || null,
                    groupId,
                    JSON.stringify(variantAttrs),
                ]);
                createdProducts.push({
                    id: productId,
                    name: variantName,
                    sku: variantSku,
                    variantAttributes: variantAttrs,
                });
            }
        }
        yield conn.commit();
        // Audit log
        const user = req.user;
        yield (0, auditController_1.logAction)((user === null || user === void 0 ? void 0 : user.id) || 'system', 'variant_groups', 'CREATE', `Created variant group "${name}" with ${createdProducts.length} products`, JSON.stringify({ groupId, productCount: createdProducts.length }));
        conn.release();
        res.status(201).json({
            id: groupId,
            name,
            attributeKeys,
            productCount: createdProducts.length,
            products: createdProducts,
        });
    }
    catch (error) {
        if (conn) {
            try {
                yield conn.rollback();
            }
            catch (_e) { }
            conn.release();
        }
        return (0, errorHandler_1.handleControllerError)(res, error, 'createVariantGroup');
    }
});
exports.createVariantGroup = createVariantGroup;
// ─── UPDATE GROUP METADATA ───────────────────────────────────
const updateVariantGroup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        const { id } = req.params;
        const { name, categoryId, brandId, description, isActive } = req.body;
        conn = yield (0, db_1.getConnection)();
        // Verify group exists
        const [existing] = yield conn.query('SELECT id FROM variant_groups WHERE id = ?', [id]);
        if (existing.length === 0) {
            conn.release();
            return res.status(404).json({ message: 'Variant group not found' });
        }
        const updates = [];
        const params = [];
        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (categoryId !== undefined) {
            updates.push('categoryId = ?');
            params.push(categoryId || null);
        }
        if (brandId !== undefined) {
            updates.push('brandId = ?');
            params.push(brandId || null);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description || null);
        }
        if (isActive !== undefined) {
            updates.push('isActive = ?');
            params.push(isActive);
        }
        if (updates.length === 0) {
            conn.release();
            return res.status(400).json({ message: 'No fields to update' });
        }
        params.push(id);
        yield conn.query(`UPDATE variant_groups SET ${updates.join(', ')} WHERE id = ?`, params);
        // If categoryId changed, also update child products
        if (categoryId !== undefined) {
            yield conn.query('UPDATE products SET categoryId = ? WHERE variantGroupId = ?', [categoryId || null, id]);
        }
        // Audit
        const user = req.user;
        yield (0, auditController_1.logAction)((user === null || user === void 0 ? void 0 : user.id) || 'system', 'variant_groups', 'UPDATE', `Updated variant group ${id}`, JSON.stringify({ updates: Object.keys(req.body) }));
        conn.release();
        res.json({ message: 'Variant group updated' });
    }
    catch (error) {
        if (conn)
            conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'updateVariantGroup');
    }
});
exports.updateVariantGroup = updateVariantGroup;
// ─── DELETE GROUP (stock-guarded) ────────────────────────────
const deleteVariantGroup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    let conn;
    try {
        const { id } = req.params;
        conn = yield (0, db_1.getConnection)();
        // Check for non-zero stock across any warehouse
        const [stockCheck] = yield conn.query(`
      SELECT COALESCE(SUM(ps.stock), 0) AS totalStock
      FROM products p
      LEFT JOIN product_stocks ps ON ps.productId = p.id
      WHERE p.variantGroupId = ?
    `, [id]);
        const totalStock = ((_a = stockCheck[0]) === null || _a === void 0 ? void 0 : _a.totalStock) || 0;
        if (totalStock > 0) {
            conn.release();
            return res.status(400).json({
                message: `Cannot delete variant group — child products have ${totalStock} units in stock. Clear stock first.`,
                totalStock,
            });
        }
        // Check for invoices referencing child products
        const [invoiceCheck] = yield conn.query(`
      SELECT COUNT(*) AS lineCount
      FROM invoice_lines il
      JOIN products p ON il.productId = p.id
      WHERE p.variantGroupId = ?
    `, [id]);
        const lineCount = ((_b = invoiceCheck[0]) === null || _b === void 0 ? void 0 : _b.lineCount) || 0;
        yield conn.beginTransaction();
        if (lineCount === 0) {
            // No invoice history — safe to hard-delete products
            yield conn.query('DELETE FROM products WHERE variantGroupId = ?', [id]);
        }
        else {
            // Has invoice history — soft-delete (deactivate) products instead
            yield conn.query('UPDATE products SET isActive = FALSE, variantGroupId = NULL WHERE variantGroupId = ?', [id]);
        }
        yield conn.query('DELETE FROM variant_groups WHERE id = ?', [id]);
        yield conn.commit();
        const user = req.user;
        yield (0, auditController_1.logAction)((user === null || user === void 0 ? void 0 : user.id) || 'system', 'variant_groups', 'DELETE', `Deleted variant group ${id}`, JSON.stringify({ hadInvoices: lineCount > 0 }));
        conn.release();
        res.json({ message: 'Variant group deleted', softDeleted: lineCount > 0 });
    }
    catch (error) {
        if (conn) {
            try {
                yield conn.rollback();
            }
            catch (_c) { }
            conn.release();
        }
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleteVariantGroup');
    }
});
exports.deleteVariantGroup = deleteVariantGroup;
// ─── GENERATE SKU SUGGESTIONS ────────────────────────────────
const generateSKUs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { baseSku, attributeKeys, attributeValues } = req.body;
        if (!baseSku || !attributeKeys || !attributeValues) {
            return res.status(400).json({ message: 'baseSku, attributeKeys, and attributeValues are required' });
        }
        const valueArrays = attributeKeys.map((key) => (attributeValues[key] || []));
        const combinations = cartesian(valueArrays);
        const skus = combinations.map(combo => buildVariantSKU(baseSku, combo));
        res.json({ skus });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'generateSKUs');
    }
});
exports.generateSKUs = generateSKUs;
// ─── GENERATE BARCODE SUGGESTIONS ────────────────────────────
const generateBarcodes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { count } = req.body;
        const barcodeCount = Math.min(count || 1, 500);
        const barcodes = [];
        for (let i = 0; i < barcodeCount; i++) {
            // Generate 12-digit random barcode (EAN-13 without check digit)
            const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
            // Calculate EAN-13 check digit
            const digits = base.split('').map(Number);
            const checkSum = digits.reduce((sum, d, idx) => sum + d * (idx % 2 === 0 ? 1 : 3), 0);
            const checkDigit = (10 - (checkSum % 10)) % 10;
            barcodes.push(base + checkDigit);
        }
        res.json({ barcodes });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'generateBarcodes');
    }
});
exports.generateBarcodes = generateBarcodes;
// ─── LIST ALL BRANDS ─────────────────────────────────────────
const getBrands = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query('SELECT * FROM brands WHERE isActive = TRUE ORDER BY name');
        conn.release();
        res.json(rows);
    }
    catch (error) {
        if (conn)
            conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'getBrands');
    }
});
exports.getBrands = getBrands;
// ─── CREATE BRAND ────────────────────────────────────────────
const createBrand = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        const { name } = req.body;
        if (!name)
            return res.status(400).json({ message: 'Brand name is required' });
        conn = yield (0, db_1.getConnection)();
        const id = (0, crypto_1.randomUUID)();
        yield conn.query('INSERT INTO brands (id, name) VALUES (?, ?)', [id, name]);
        conn.release();
        res.status(201).json({ id, name });
    }
    catch (error) {
        if (conn)
            conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'createBrand');
    }
});
exports.createBrand = createBrand;
