"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.deleteVariantTemplate = exports.saveVariantTemplate = exports.getVariantTemplates = exports.saveProductVariants = exports.getProductVariants = exports.refreshCostsFromPurchases = exports.getProductFieldSuggestions = exports.searchProducts = exports.getNextSku = exports.updateProductPrices = exports.getProductPrices = exports.deleteProduct = exports.toggleProductActive = exports.updateProduct = exports.createProduct = exports.getPaginatedProducts = exports.getProduct = exports.getProducts = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
const getProducts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const conn = yield (0, db_1.getConnection)();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const search = (req.query.search || '').replace(/[\x00-\x1F\x7F\r\n\t]/g, '').trim();
        const offset = (page - 1) * limit;
        // Exclude heavy 'image' column (can be 1MB+ per row in base64)
        const columns = 'id, name, sku, barcode, price, cost, stock, warehouseId, categoryId, bomId, type, unit, isManufactured, leadTimeDays, trackSerials, trackInventory, warrantyMonths, ceramic_size, ceramic_color, ceramic_color_grade, ceramic_color_desc, ceramic_name, ceramic_pattern, ceramicItemDesc, ceramicGroup, minStock, description, isActive';
        // Allow Product Master UI to see inactive items via ?showInactive=true
        const showInactive = req.query.showInactive === 'true';
        let query = `SELECT ${columns} FROM products`;
        let countQuery = 'SELECT COUNT(*) as total FROM products';
        let params = [];
        let countParams = [];
        // By default, hide inactive products from all modules (POS, invoices, manufacturing)
        const activeFilter = showInactive ? '' : ' WHERE isActive = TRUE';
        if (!showInactive) {
            query += activeFilter;
            countQuery += activeFilter;
        }
        let orderByClause = ' ORDER BY CASE WHEN sku REGEXP "^[0-9]+$" THEN 0 ELSE 1 END ASC, CAST(sku AS UNSIGNED) ASC, name ASC LIMIT ? OFFSET ?';
        const exactBarcode = req.query.exactBarcode === 'true';
        if (search) {
            const joiner = showInactive ? ' WHERE ' : ' AND ';
            if (exactBarcode) {
                const searchCondition = joiner + '(barcode = ? OR sku = ?)';
                query += searchCondition;
                countQuery += searchCondition;
                params = [search, search];
                countParams = [...params];
            }
            else {
                const searchCondition = joiner + '(name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR sku = ? OR barcode = ?)';
                query += searchCondition;
                countQuery += searchCondition;
                const searchParam = `%${search}%`;
                const exactParam = search;
                params = [searchParam, searchParam, searchParam, exactParam, exactParam];
                countParams = [...params];
                orderByClause = ' ORDER BY CASE WHEN sku = ? OR barcode = ? THEN 0 ELSE 1 END, CASE WHEN sku REGEXP "^[0-9]+$" THEN 0 ELSE 1 END ASC, CAST(sku AS UNSIGNED) ASC, name LIMIT ? OFFSET ?';
                // Add the exact params twice for the CASE WHEN condition
                params.push(exactParam, exactParam);
            }
        }
        query += orderByClause;
        params.push(limit, offset);
        const [countResult] = yield conn.query(countQuery, countParams);
        const total = ((_a = countResult[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
        const [rows] = yield conn.query(query, params);
        conn.release();
        res.json({
            products: rows,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getProducts');
    }
});
exports.getProducts = getProducts;
const getProduct = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query('SELECT p.*, c.name as categoryName FROM products p LEFT JOIN categories c ON p.categoryId COLLATE utf8mb4_unicode_ci = c.id COLLATE utf8mb4_unicode_ci WHERE p.id = ?', [id]);
        if (rows.length === 0) {
            conn.release();
            return res.status(404).json({ message: 'Product not found' });
        }
        const product = rows[0];
        // Fetch prices
        const [prices] = yield conn.query(`
            SELECT pp.*, pl.name as priceListName 
            FROM product_prices pp
            JOIN price_lists pl ON pp.priceListId = pl.id
            WHERE pp.productId = ?
        `, [id]);
        conn.release();
        product.pricingTiers = prices.map(price => ({
            id: price.priceListId,
            label: price.priceListName,
            price: price.price
        }));
        // Convert MySQL boolean values (0/1) to JavaScript booleans
        product.trackSerials = product.trackSerials === 1 || product.trackSerials === true;
        product.isActive = product.isActive === 1 || product.isActive === true;
        product.trackInventory = product.trackInventory === 1 || product.trackInventory === true;
        product.isManufactured = product.isManufactured === 1 || product.isManufactured === true;
        // Map ceramic snake_case DB columns to camelCase
        product.ceramicSize = product.ceramic_size || null;
        product.ceramicColor = product.ceramic_color || null;
        product.ceramicColorGrade = product.ceramic_color_grade || null;
        product.ceramicColorDesc = product.ceramic_color_desc || null;
        product.ceramicName = product.ceramic_name || null;
        product.ceramicPattern = product.ceramic_pattern || null;
        product.ceramicItemDesc = product.ceramicItemDesc || null;
        product.ceramicGroup = product.ceramicGroup || null;
        res.json(product);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getProduct');
    }
});
exports.getProduct = getProduct;
const getPaginatedProducts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        // Sanitize search input: strip control characters, null bytes, and non-printable chars
        // Barcode scanners can inject CR, LF, tab, and other control characters that break SQL
        const rawSearch = req.query.search || '';
        const search = rawSearch.replace(/[\x00-\x1F\x7F\r\n\t]/g, '').trim();
        const offset = (page - 1) * limit;
        // Skip price tiers for bulk reads (e.g. Stock Balance Report doesn't need them)
        const skipPrices = req.query.skipPrices === 'true';
        const conn = yield (0, db_1.getConnection)();
        // Safely check if product_variants table exists for embeddedVariantCount subquery
        let embeddedVariantSelect = ', 0 AS embeddedVariantCount';
        try {
            const [pvTableCheck] = yield conn.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'product_variants' AND TABLE_SCHEMA = DATABASE() LIMIT 1`);
            if (pvTableCheck.length > 0) {
                embeddedVariantSelect = ', (SELECT COUNT(*) FROM product_variants pv WHERE pv.productId = p.id AND pv.isActive = 1) AS embeddedVariantCount';
            }
        }
        catch ( /* table doesn't exist */_a) { /* table doesn't exist */ }
        const isMasterList = req.query.isMasterList === 'true';
        let selectColumns = 'p.id, p.name, p.sku, p.barcode, p.price, p.cost, p.stock, p.warehouseId, p.categoryId, p.subcategoryId, p.bomId, p.type, p.unit, p.isManufactured, p.leadTimeDays, p.trackSerials, p.trackInventory, p.warrantyMonths, p.ceramic_size, p.ceramic_color, p.ceramic_color_grade, p.ceramic_color_desc, p.ceramic_name, p.ceramic_pattern, p.ceramicItemDesc, p.ceramicGroup, p.minStock, p.description, p.isActive, p.variantAttributes, c.name as categoryName';
        if (isMasterList) {
            selectColumns += ', p.image';
        }
        let query = `SELECT ${selectColumns}${embeddedVariantSelect} FROM products p LEFT JOIN categories c ON p.categoryId COLLATE utf8mb4_unicode_ci = c.id COLLATE utf8mb4_unicode_ci`;
        let countQuery = 'SELECT COUNT(*) as total FROM products p';
        let params = [];
        let countParams = [];
        const exactBarcode = req.query.exactBarcode === 'true';
        const categoryId = req.query.categoryId;
        let conditions = [];
        let countJoin = '';
        // Allow Product Master UI to see inactive items via ?showInactive=true
        const showInactive = req.query.showInactive === 'true';
        if (!showInactive) {
            conditions.push('p.isActive = TRUE');
        }
        // NOTE: We no longer filter by variantGroupId or type='TEMPLATE' vs 'PRODUCT'
        // because variants are now stored exclusively in the product_variants table.
        // Every row in the products table is exactly one product family.
        if (categoryId && categoryId !== 'ALL') {
            conditions.push('(p.categoryId = ? OR p.subcategoryId = ?)');
            params.push(categoryId, categoryId);
            countParams.push(categoryId, categoryId);
        }
        if (search) {
            if (exactBarcode) {
                // Barcode mode: only exact sku/barcode match
                conditions.push('(p.barcode = ? OR p.sku = ?)');
                const exactParam = search.trim();
                params.push(exactParam, exactParam);
                countParams.push(exactParam, exactParam);
            }
            else {
                // ═══════════════════════════════════════════════════════════
                // PERF v2: Use pre-computed search_vector column instead of
                // 7-nested REPLACE() on every query. The search_vector column
                // is a STORED generated column with Arabic normalization that
                // has a regular index. We normalize the search term ONCE in JS.
                // 
                // Old: WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(p.name)...))) LIKE ...
                //      → Full table scan (index can't help with wrapped columns)
                // New: WHERE p.search_vector LIKE ?
                //      → Uses idx on search_vector, 10-50x faster
                // ═══════════════════════════════════════════════════════════
                const arabicNormJS = (s) => s.toLowerCase()
                    .replace(/أ/g, 'ا').replace(/إ/g, 'ا').replace(/آ/g, 'ا')
                    .replace(/ة/g, 'ه').replace(/ى/g, 'ي')
                    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
                const tokens = search.trim().split(/\s+/).filter(Boolean);
                // Build token conditions using search_vector (pre-normalized name)
                // and also fall back to category name matching
                const tokenConditions = tokens.map(() => {
                    return `( p.search_vector COLLATE utf8mb4_unicode_ci LIKE ? OR LOWER(COALESCE(c.name, '')) COLLATE utf8mb4_unicode_ci LIKE ? )`;
                });
                const nameOrCategoryMatch = tokenConditions.join(' AND ');
                conditions.push(`(
                    (${tokens.length > 0 ? nameOrCategoryMatch : '1=0'})
                    OR p.sku LIKE ? 
                    OR p.barcode LIKE ? 
                    OR p.sku = ? 
                    OR p.barcode = ?
                )`);
                countJoin = ' LEFT JOIN categories c ON p.categoryId COLLATE utf8mb4_unicode_ci = c.id COLLATE utf8mb4_unicode_ci';
                // Normalize tokens in JS (once) and pass as params
                tokens.forEach(token => {
                    const normalizedToken = `%${arabicNormJS(token)}%`;
                    const categoryToken = `%${token.toLowerCase()}%`;
                    params.push(normalizedToken, categoryToken);
                    countParams.push(normalizedToken, categoryToken);
                });
                const searchParam = `%${search.trim()}%`;
                const exactParam = search.trim();
                // 4 parameters: sku LIKE, barcode LIKE, sku =, barcode =
                params.push(searchParam, searchParam, exactParam, exactParam);
                countParams.push(searchParam, searchParam, exactParam, exactParam);
            }
        }
        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += countJoin + whereClause;
        }
        // Prioritize exact sku/barcode matches at the top of results
        if (search && !exactBarcode) {
            const exactParam = search.trim();
            query += ' ORDER BY CASE WHEN p.sku = ? OR p.barcode = ? THEN 0 ELSE 1 END, CASE WHEN p.sku REGEXP "^[0-9]+$" THEN 0 ELSE 1 END ASC, CAST(p.sku AS UNSIGNED) ASC, p.name LIMIT ? OFFSET ?';
            params.push(exactParam, exactParam, limit, offset);
        }
        else {
            query += ' ORDER BY CASE WHEN p.sku REGEXP "^[0-9]+$" THEN 0 ELSE 1 END ASC, CAST(p.sku AS UNSIGNED) ASC, p.name LIMIT ? OFFSET ?';
            params.push(limit, offset);
        }
        let [[rows], [countResult]] = yield Promise.all([
            conn.query(query, params),
            conn.query(countQuery, countParams),
        ]);
        let products = rows;
        // ═══════════════════════════════════════════════════════════
        // GOD MODE: Semantic AI Fallback if FTS / Native Search Yields Nothing
        // ═══════════════════════════════════════════════════════════
        if (products.length === 0 && search && !exactBarcode) {
            const { InMemoryVectorDB } = yield Promise.resolve().then(() => __importStar(require('../utils/aiSearch')));
            // Ensure we pass categoryId so God Mode respects the dropdown!
            const semanticMatches = yield InMemoryVectorDB.search(search, 15, categoryId);
            if (semanticMatches.length > 0) {
                const exactIds = semanticMatches.map(m => m.id);
                const activeClause = showInactive ? '' : 'AND p.isActive = TRUE';
                const [aiRows] = yield conn.query(`
                    SELECT p.*, c.name as categoryName 
                    FROM products p
                    LEFT JOIN categories c ON p.categoryId COLLATE utf8mb4_unicode_ci = c.id COLLATE utf8mb4_unicode_ci
                    WHERE p.id IN (?) ${activeClause}
                    ORDER BY FIELD(p.id, ?)
                `, [exactIds, exactIds]);
                products = aiRows;
                // We add a meta flag in case the frontend wants to display a "Did you mean?" or "Semantic Match" badge
                products.forEach(p => p._semanticMatch = true);
                // Override pagination total since AI just returns the best 15 fits
                countResult = [{ total: products.length }];
            }
        }
        // Attach pricing tiers (skip for bulk reads like stock reports)
        if (!skipPrices && products.length > 0 && products.length <= 500) {
            // Only fetch prices for reasonable batch sizes (<=500 products)
            // For 50,000 products, the IN clause would time out
            const productIds = products.map(p => p.id);
            const [prices] = yield conn.query(`
                SELECT pp.*, pl.name as priceListName 
                FROM product_prices pp
                JOIN price_lists pl ON pp.priceListId = pl.id
                WHERE pp.productId IN (?)
            `, [productIds]);
            const priceMap = new Map();
            prices.forEach(price => {
                const list = priceMap.get(price.productId) || [];
                list.push({ id: price.priceListId, label: price.priceListName, price: price.price });
                priceMap.set(price.productId, list);
            });
            products.forEach(p => {
                p.pricingTiers = priceMap.get(p.id) || [];
            });
        }
        // Convert MySQL boolean values (0/1) to JavaScript booleans
        products.forEach(p => {
            p.trackSerials = p.trackSerials === 1 || p.trackSerials === true;
            p.isActive = p.isActive === 1 || p.isActive === true;
            p.trackInventory = p.trackInventory === 1 || p.trackInventory === true;
            p.isManufactured = p.isManufactured === 1 || p.isManufactured === true;
            // Map ceramic snake_case DB columns to camelCase
            p.ceramicSize = p.ceramic_size || null;
            p.ceramicColor = p.ceramic_color || null;
            p.ceramicColorGrade = p.ceramic_color_grade || null;
            p.ceramicColorDesc = p.ceramic_color_desc || null;
            p.ceramicName = p.ceramic_name || null;
            p.ceramicPattern = p.ceramic_pattern || null;
            p.ceramicItemDesc = p.ceramicItemDesc || null;
            p.ceramicGroup = p.ceramicGroup || null;
            p.categoryName = p.categoryName || '';
        });
        const showVariants = req.query.showVariants === 'true';
        let finalProducts = products;
        if (showVariants && finalProducts.length > 0) {
            try {
                const productIds = finalProducts.map(p => p.id);
                const [variants] = yield conn.query(`
                    SELECT * FROM product_variants WHERE productId IN (?)
                `, [productIds]);
                const variantMap = new Map();
                variants.forEach(v => {
                    const list = variantMap.get(v.productId) || [];
                    if (typeof v.attributes === 'string') {
                        try {
                            v.attributes = JSON.parse(v.attributes);
                        }
                        catch (e) { }
                    }
                    list.push(v);
                    variantMap.set(v.productId, list);
                });
                finalProducts.forEach(p => {
                    p.variants = variantMap.get(p.id) || [];
                });
            }
            catch (_b) {
                // product_variants table may not exist yet — skip variant enrichment
                finalProducts.forEach(p => { p.variants = []; });
            }
        }
        conn.release();
        // Guard against timeout middleware having already sent 408
        if (res.headersSent)
            return;
        res.json({
            products: finalProducts,
            total: countResult[0].total,
            page,
            totalPages: Math.ceil(countResult[0].total / limit)
        });
    }
    catch (error) {
        if (!res.headersSent) {
            return (0, errorHandler_1.handleControllerError)(res, error, 'getProductsPaginated');
        }
    }
});
exports.getPaginatedProducts = getPaginatedProducts;
const createProduct = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        // =====================================================
        // Use transaction for atomicity - all operations must
        // succeed together or rollback together
        // =====================================================
        yield conn.beginTransaction();
        const { id: reqId, name, sku, price, cost, stock, warehouseId, categoryId, bomId, type, unit, isManufactured, leadTimeDays, trackSerials, trackInventory } = req.body;
        const id = reqId || (0, crypto_1.randomUUID)();
        // Auto-populate barcode with SKU if not provided
        const barcode = req.body.barcode || sku || null;
        // Check for duplicate Name globally
        const [existingName] = yield conn.query('SELECT id FROM products WHERE TRIM(name) = TRIM(?) LIMIT 1', [name]);
        if (existingName.length > 0) {
            yield conn.rollback();
            conn.release();
            return res.status(400).json({ error: `خطأ: الصنف "${name}" مسجل مسبقاً` });
        }
        // Check for duplicate SKU or Barcode
        const barcodeToCheck = barcode || null;
        if (sku || barcodeToCheck) {
            const [existing] = yield conn.query('SELECT id, name, sku, barcode FROM products WHERE sku = ? OR barcode = ? LIMIT 1 FOR UPDATE', [sku, barcodeToCheck]);
            if (existing.length > 0) {
                const conflict = existing[0];
                yield conn.rollback();
                conn.release();
                const conflictField = conflict.sku === sku ? 'الكود (SKU)' : 'الباركود';
                return res.status(400).json({ error: `خطأ: ${conflictField} مستخدم بالفعل مع الصنف "${conflict.name}"` });
            }
        }
        yield conn.query('INSERT INTO products (id, name, sku, barcode, price, cost, stock, warehouseId, categoryId, subcategoryId, bomId, type, unit, isManufactured, leadTimeDays, trackSerials, trackInventory, warrantyMonths, image, variantGroupId, variantAttributes, ceramic_size, ceramic_color, ceramic_color_grade, ceramic_color_desc, ceramic_name, ceramic_pattern, ceramicItemDesc, ceramicGroup) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, name, sku, barcode, price, cost, stock, warehouseId, categoryId, req.body.subcategoryId || null, bomId, type, unit, isManufactured ? 1 : 0, leadTimeDays || 0, trackSerials ? 1 : 0, trackInventory !== false ? 1 : 0, req.body.warrantyMonths || 0, req.body.image || null, req.body.variantGroupId || null, req.body.variantAttributes ? JSON.stringify(req.body.variantAttributes) : null, req.body.ceramicSize || null, req.body.ceramicColor || null, req.body.ceramicColorGrade || null, req.body.ceramicColorDesc || null, req.body.ceramicName || null, req.body.ceramicPattern || null, req.body.ceramicItemDesc || null, req.body.ceramicGroup || null]);
        // Auto-create product_prices entries for all active price lists
        yield conn.query(`
            INSERT IGNORE INTO product_prices (productId, priceListId, price)
            SELECT ?, id, 0 FROM price_lists WHERE isActive = TRUE
        `, [id]);
        // Update with provided pricing tiers — PERF: batch upsert instead of N sequential queries
        const { pricingTiers } = req.body;
        if (pricingTiers && Array.isArray(pricingTiers) && pricingTiers.length > 0) {
            const values = pricingTiers.map(tier => [id, tier.id, tier.price]);
            yield conn.query(`INSERT INTO product_prices (productId, priceListId, price) VALUES ? ON DUPLICATE KEY UPDATE price = VALUES(price)`, [values]);
        }
        // Create product_stocks entry if product has opening balance and assigned warehouse
        if (warehouseId && stock && Number(stock) > 0) {
            const stockId = (0, crypto_1.randomUUID)();
            yield conn.query(`
                INSERT INTO product_stocks (id, productId, warehouseId, stock)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)
            `, [stockId, id, warehouseId, stock, stock]);
            console.log(`✓ Created warehouse stock entry: Product ${name} -> ${stock} units in warehouse ${warehouseId}`);
        }
        // Commit transaction
        yield conn.commit();
        conn.release();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || req.body.user || 'System';
        yield (0, auditController_1.logAction)(user, 'PRODUCT', 'CREATE', `Created Product: ${name}`, `SKU: ${sku}, Price: ${price}`);
        // Broadcast real-time update
        const newProduct = Object.assign(Object.assign({}, req.body), { id });
        eventBus_1.eventBus.broadcast('product:changed', { product: newProduct, updatedBy: user });
        // Asynchronously update Semantic Embedding (God Mode)
        Promise.resolve().then(() => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { getEmbedding, InMemoryVectorDB } = yield Promise.resolve().then(() => __importStar(require('../utils/aiSearch')));
                const pPool = (yield Promise.resolve().then(() => __importStar(require('../db')))).pool;
                // Fetch latest name & category if missing from request
                const [current] = yield pPool.query('SELECT p.name, p.categoryId, c.name as catName FROM products p LEFT JOIN categories c ON p.categoryId = c.id WHERE p.id = ?', [id]);
                if (!current[0])
                    return;
                const finalName = name || current[0].name;
                const finalCategory = current[0].catName || '';
                const finalCatId = categoryId !== undefined ? categoryId : current[0].categoryId;
                const vector = yield getEmbedding(`${finalName} ${finalCategory}`.trim());
                yield pPool.query('UPDATE products SET embedding = ? WHERE id = ?', [JSON.stringify(vector), id]);
                InMemoryVectorDB.addOrUpdateVector(id, vector, finalCatId || null);
            }
            catch (e) {
                console.error('Failed to semantic-embed product:', e);
            }
        }));
        console.log(`✅ Product created: ${name} (transaction committed)`);
        res.status(201).json(Object.assign(Object.assign({}, req.body), { id }));
    }
    catch (error) {
        yield conn.rollback();
        conn.release();
        // Handle race condition: another request inserted the same SKU between our check and insert
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: `خطأ: الكود (SKU) أو الباركود مستخدم بالفعل. يرجى المحاولة مرة أخرى.` });
        }
        console.error('❌ Error creating product (transaction rolled back):', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'createProduct');
    }
});
exports.createProduct = createProduct;
const updateProduct = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { id } = req.params;
        const { name, sku, price, cost, stock, warehouseId, categoryId, bomId, type, unit, isManufactured, leadTimeDays, trackSerials, trackInventory } = req.body;
        // Sync barcode with SKU if barcode is not explicitly provided or is empty
        const barcode = req.body.barcode || sku || null;
        // Check for duplicate Name globally (excluding this product)
        const [existingName] = yield conn.query('SELECT id FROM products WHERE TRIM(name) = TRIM(?) AND id != ? LIMIT 1', [name, id]);
        if (existingName.length > 0) {
            yield conn.rollback();
            conn.release();
            return res.status(400).json({ error: `خطأ: الصنف "${name}" مسجل مسبقاً` });
        }
        // Check for duplicate SKU or Barcode (excluding this product)
        const barcodeToCheck = barcode || null;
        if (sku || barcodeToCheck) {
            const [existing] = yield conn.query('SELECT id, name, sku, barcode FROM products WHERE (sku = ? OR barcode = ?) AND id != ? LIMIT 1 FOR UPDATE', [sku, barcodeToCheck, id]);
            if (existing.length > 0) {
                const conflict = existing[0];
                yield conn.rollback();
                conn.release();
                const conflictField = conflict.sku === sku ? 'الكود (SKU)' : 'الباركود';
                return res.status(400).json({ error: `خطأ: ${conflictField} مستخدم بالفعل مع الصنف "${conflict.name}"` });
            }
        }
        // Update product record including barcode, image, isActive, variantGroupId, and ceramic fields
        const isActive = req.body.isActive !== undefined ? (req.body.isActive ? 1 : 0) : 1;
        yield conn.query('UPDATE products SET name = ?, sku = ?, barcode = ?, price = ?, cost = ?, stock = ?, warehouseId = ?, categoryId = ?, subcategoryId = ?, bomId = ?, type = ?, unit = ?, isManufactured = ?, leadTimeDays = ?, trackSerials = ?, trackInventory = ?, warrantyMonths = ?, isActive = ?, image = ?, variantGroupId = ?, variantAttributes = ?, ceramic_size = ?, ceramic_color = ?, ceramic_color_grade = ?, ceramic_color_desc = ?, ceramic_name = ?, ceramic_pattern = ?, ceramicItemDesc = ?, ceramicGroup = ? WHERE id = ?', [name, sku, barcode, price, cost, stock, warehouseId, categoryId, req.body.subcategoryId || null, bomId, type, unit, isManufactured ? 1 : 0, leadTimeDays || 0, trackSerials ? 1 : 0, trackInventory !== false ? 1 : 0, req.body.warrantyMonths || 0, isActive, req.body.image || null, req.body.variantGroupId || null, req.body.variantAttributes ? JSON.stringify(req.body.variantAttributes) : null, req.body.ceramicSize || null, req.body.ceramicColor || null, req.body.ceramicColorGrade || null, req.body.ceramicColorDesc || null, req.body.ceramicName || null, req.body.ceramicPattern || null, req.body.ceramicItemDesc || null, req.body.ceramicGroup || null, id]);
        // CASCADE: Update product name in all invoice lines
        // This ensures name changes are reflected everywhere in the system
        if (name) {
            try {
                yield conn.query('UPDATE invoice_lines SET productName = ? WHERE productId = ?', [name, id]);
            }
            catch (e) {
                // Ignore if invoice_lines table doesn't exist or has different schema
                console.log('Note: Could not update invoice_lines productName:', e);
            }
        }
        // Update pricing tiers — PERF: batch upsert instead of N sequential queries
        const { pricingTiers } = req.body;
        if (pricingTiers && Array.isArray(pricingTiers) && pricingTiers.length > 0) {
            const values = pricingTiers.map(tier => [id, tier.id, tier.price]);
            yield conn.query(`INSERT INTO product_prices (productId, priceListId, price) VALUES ? ON DUPLICATE KEY UPDATE price = VALUES(price)`, [values]);
        }
        yield conn.commit();
        conn.release();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || req.body.user || 'System';
        yield (0, auditController_1.logAction)(user, 'PRODUCT', 'UPDATE', `Updated Product: ${name}`, `ID: ${id}`);
        // Broadcast real-time update
        const updatedProduct = Object.assign({ id }, req.body);
        eventBus_1.eventBus.broadcast('product:changed', { product: updatedProduct, updatedBy: user });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'product', updatedBy: user });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoice', updatedBy: user }); // Invoices may have updated names
        res.json(Object.assign({ id }, req.body));
    }
    catch (error) {
        yield conn.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'updateProduct');
    }
    finally {
        conn.release();
    }
});
exports.updateProduct = updateProduct;
// Quick toggle endpoint for activating/deactivating products from the list view
const toggleProductActive = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { isActive } = req.body;
        const conn = yield (0, db_1.getConnection)();
        // Verify product exists
        const [rows] = yield conn.query('SELECT id, name FROM products WHERE id = ?', [id]);
        if (rows.length === 0) {
            conn.release();
            return res.status(404).json({ error: 'المنتج غير موجود' });
        }
        const productName = rows[0].name;
        yield conn.query('UPDATE products SET isActive = ? WHERE id = ?', [isActive ? 1 : 0, id]);
        conn.release();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || 'System';
        const status = isActive ? 'نشط' : 'غير نشط';
        yield (0, auditController_1.logAction)(user, 'PRODUCT', 'UPDATE', `Toggled product status: ${productName} → ${status}`, `ID: ${id}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('product:changed', { product: { id, isActive }, updatedBy: user });
        res.json({ id, isActive, message: `تم تحديث حالة الصنف إلى ${status}` });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'toggleProductActive');
    }
});
exports.toggleProductActive = toggleProductActive;
const deleteProduct = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const { id } = req.params;
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || (req.body.user || req.query.user) || 'System';
        const conn = yield (0, db_1.getConnection)();
        // Get product details before deletion
        const [products] = yield conn.query('SELECT name, sku FROM products WHERE id = ?', [id]);
        const product = products[0];
        if (!product) {
            conn.release();
            return res.status(404).json({ error: 'المنتج غير موجود' });
        }
        const productName = (product === null || product === void 0 ? void 0 : product.name) || 'Unknown Product';
        const productSku = (product === null || product === void 0 ? void 0 : product.sku) || '';
        // ========== REFERENTIAL INTEGRITY CHECKS ==========
        const [invoiceLines] = yield conn.query('SELECT COUNT(*) as cnt FROM invoice_lines WHERE productId = ?', [id]);
        if (invoiceLines[0].cnt > 0) {
            conn.release();
            return res.status(400).json({
                error: `لا يمكن حذف الصنف "${productName}" لأنه مستخدم في ${invoiceLines[0].cnt} سطر فاتورة. يرجى حذف الفواتير المرتبطة أولاً.`
            });
        }
        let permitCount = 0;
        try {
            const [permitLines] = yield conn.query('SELECT COUNT(*) as cnt FROM stock_permit_items WHERE productId = ?', [id]);
            permitCount = ((_c = permitLines[0]) === null || _c === void 0 ? void 0 : _c.cnt) || 0;
        }
        catch (e) { /* table may not exist */ }
        if (permitCount > 0) {
            conn.release();
            return res.status(400).json({
                error: `لا يمكن حذف الصنف "${productName}" لأنه مستخدم في ${permitCount} إذن مخزني.`
            });
        }
        let movementCount = 0;
        try {
            const [movements] = yield conn.query('SELECT COUNT(*) as cnt FROM stock_movements WHERE productId = ?', [id]);
            movementCount = ((_d = movements[0]) === null || _d === void 0 ? void 0 : _d.cnt) || 0;
        }
        catch (e) { /* table may not exist */ }
        if (movementCount > 0) {
            conn.release();
            return res.status(400).json({
                error: `لا يمكن حذف الصنف "${productName}" لأنه يحتوي على ${movementCount} حركة مخزنية.`
            });
        }
        let prodOrderCount = 0;
        try {
            const [prodOrders] = yield conn.query('SELECT COUNT(*) as cnt FROM production_orders WHERE productId = ?', [id]);
            prodOrderCount = ((_e = prodOrders[0]) === null || _e === void 0 ? void 0 : _e.cnt) || 0;
        }
        catch (e) { /* table may not exist */ }
        if (prodOrderCount > 0) {
            conn.release();
            return res.status(400).json({
                error: `لا يمكن حذف الصنف "${productName}" لأنه مستخدم في ${prodOrderCount} أمر إنتاج.`
            });
        }
        // ========== END INTEGRITY CHECKS ==========
        // Safe to delete - clean up related data
        yield conn.query('DELETE FROM bom_items WHERE product_id = ? OR raw_product_id = ?', [id, id]).catch(() => { });
        yield conn.query('DELETE FROM product_stocks WHERE productId = ?', [id]).catch(() => { });
        yield conn.query('DELETE FROM products WHERE id = ?', [id]);
        conn.release();
        yield (0, auditController_1.logAction)(user, 'PRODUCT', 'DELETE', `حذف منتج - ${productName}`, `تم حذف المنتج | الرمز: ${productSku} | رقم المرجع: ${id}`);
        // Broadcast real-time deletion
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'product', entityId: id, deletedBy: user });
        // Remove from Semantic DB
        Promise.resolve().then(() => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { InMemoryVectorDB } = yield Promise.resolve().then(() => __importStar(require('../utils/aiSearch')));
                InMemoryVectorDB.removeVector(id);
            }
            catch (e) { }
        }));
        res.json({ message: 'Product deleted' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleteProduct');
    }
});
exports.deleteProduct = deleteProduct;
// Get all prices for a specific product across all price lists
const getProductPrices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query(`
            SELECT 
                pp.id,
                pp.productId,
                pp.priceListId,
                pp.price,
                pl.name as priceListName,
                pl.isActive
            FROM product_prices pp
            JOIN price_lists pl ON pp.priceListId = pl.id
            WHERE pp.productId = ?
                ORDER BY pl.name
                `, [id]);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getProductPrices');
    }
});
exports.getProductPrices = getProductPrices;
// Batch update all prices for a product
const updateProductPrices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { prices } = req.body; // Array of { priceListId, price }
        if (!Array.isArray(prices)) {
            return res.status(400).json({ message: 'Prices must be an array' });
        }
        const conn = yield (0, db_1.getConnection)();
        // Update prices — PERF: batch upsert instead of N sequential queries
        if (prices.length > 0) {
            const values = prices.map((priceData) => [id, priceData.priceListId, priceData.price]);
            yield conn.query(`INSERT INTO product_prices(productId, priceListId, price) VALUES ? ON DUPLICATE KEY UPDATE price = VALUES(price)`, [values]);
        }
        conn.release();
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'product', updatedBy: 'System' });
        res.json({ message: 'Product prices updated successfully' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'updateProductPrices');
    }
});
exports.updateProductPrices = updateProductPrices;
const getNextSku = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        // Find the maximum numeric SKU
        const [rows] = yield conn.query('SELECT MAX(CAST(sku AS UNSIGNED)) as maxSku FROM products WHERE sku REGEXP "^[0-9]+$"');
        conn.release();
        const maxSku = rows[0].maxSku || 1000;
        const nextSku = (maxSku + 1).toString();
        res.json({ nextSku });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getNextSku');
    }
});
exports.getNextSku = getNextSku;
// Search products by name, sku, or barcode
const searchProducts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const rawQuery = req.query.query || '';
        const query = rawQuery.replace(/[\x00-\x1F\x7F\r\n\t]/g, '').trim();
        const limit = parseInt(req.query.limit) || 50;
        const conn = yield (0, db_1.getConnection)();
        // Safely check if product_variants table exists for embeddedVariantCount subquery
        let embeddedVariantSelect = ', 0 AS embeddedVariantCount';
        try {
            const [pvTableCheck] = yield conn.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'product_variants' AND TABLE_SCHEMA = DATABASE() LIMIT 1`);
            if (pvTableCheck.length > 0) {
                embeddedVariantSelect = ', (SELECT COUNT(*) FROM product_variants pv WHERE pv.productId = p.id AND pv.isActive = 1) AS embeddedVariantCount';
            }
        }
        catch ( /* table doesn't exist */_a) { /* table doesn't exist */ }
        let sql = `SELECT p.id, p.name, p.sku, p.barcode, p.price, p.cost, p.stock, p.unit, p.categoryId, p.subcategoryId, p.trackSerials, p.image, c.name as categoryName${embeddedVariantSelect} FROM products p LEFT JOIN categories c ON p.categoryId = c.id`;
        let params = [];
        if (query.trim()) {
            // PERF v3: Use pre-computed search_vector column (indexed)
            // Old: 5-nested REPLACE() per column = full table scan
            // New: search_vector + JS normalization = index seek
            const arabicNormJS = (s) => s.toLowerCase()
                .replace(/أ/g, 'ا').replace(/إ/g, 'ا').replace(/آ/g, 'ا')
                .replace(/ة/g, 'ه').replace(/ى/g, 'ي')
                .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
            const tokens = query.trim().split(/\s+/).filter(Boolean);
            const tokenConditions = tokens.map(() => {
                return `( p.search_vector LIKE ? OR LOWER(COALESCE(c.name, '')) LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? )`;
            });
            sql += ' WHERE p.isActive = TRUE AND (p.type != "TEMPLATE" OR p.type IS NULL) AND ' + tokenConditions.join(' AND ');
            tokens.forEach(token => {
                const normalizedToken = `%${arabicNormJS(token)}%`;
                const categoryToken = `%${token.toLowerCase()}%`;
                params.push(normalizedToken, categoryToken, `%${token}%`, `%${token}%`);
            });
        }
        else {
            sql += ' WHERE p.isActive = TRUE AND (p.type != "TEMPLATE" OR p.type IS NULL)';
        }
        // Exact match first
        if (query.trim()) {
            const exactParam = query.trim();
            sql += ' ORDER BY CASE WHEN p.sku = ? OR p.barcode = ? THEN 0 ELSE 1 END, CASE WHEN p.sku REGEXP "^[0-9]+$" THEN 0 ELSE 1 END ASC, CAST(p.sku AS UNSIGNED) ASC, p.name LIMIT ?';
            params.push(exactParam, exactParam, limit);
        }
        else {
            sql += ' ORDER BY CASE WHEN p.sku REGEXP "^[0-9]+$" THEN 0 ELSE 1 END ASC, CAST(p.sku AS UNSIGNED) ASC, p.name LIMIT ?';
            params.push(limit);
        }
        const [rows] = yield conn.query(sql, params);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'searchProducts');
    }
});
exports.searchProducts = searchProducts;
// Get distinct field values for quick-add suggestions (المقاس، اللون، الشركة المنتجة، المجموعات)
const getProductFieldSuggestions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const [[sizes], [colors], [patterns], [groups]] = yield Promise.all([
            conn.query("SELECT DISTINCT ceramic_size AS val FROM products WHERE ceramic_size IS NOT NULL AND ceramic_size != '' ORDER BY ceramic_size"),
            conn.query("SELECT DISTINCT ceramic_color AS val FROM products WHERE ceramic_color IS NOT NULL AND ceramic_color != '' ORDER BY ceramic_color"),
            conn.query("SELECT DISTINCT ceramic_pattern AS val FROM products WHERE ceramic_pattern IS NOT NULL AND ceramic_pattern != '' ORDER BY ceramic_pattern"),
            conn.query("SELECT DISTINCT ceramicGroup AS val FROM products WHERE ceramicGroup IS NOT NULL AND ceramicGroup != '' ORDER BY ceramicGroup"),
        ]);
        conn.release();
        res.json({
            sizes: sizes.map(r => r.val),
            colors: colors.map(r => r.val),
            patterns: patterns.map(r => r.val),
            groups: groups.map(r => r.val)
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getProductFieldSuggestions');
    }
});
exports.getProductFieldSuggestions = getProductFieldSuggestions;
/**
 * Refresh product costs from purchase invoice history.
 *
 * For products with cost = 0/NULL, pulls the latest purchase price from
 * invoice_lines and updates products.cost. Also recalculates BOM costs
 * for any affected finished products.
 *
 * Can target a single product (?productId=xxx) or all zero-cost products.
 */
const refreshCostsFromPurchases = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const conn = yield (0, db_1.getConnection)();
        const targetProductId = req.query.productId;
        let whereClause = '(p.cost IS NULL OR p.cost = 0 OR p.cost = 0.00)';
        const params = [];
        if (targetProductId) {
            whereClause = 'p.id = ?';
            params.push(targetProductId);
        }
        // Find products that need cost recovery
        const [zeroProducts] = yield conn.query(`
            SELECT p.id, p.name, p.cost
            FROM products p
            WHERE ${whereClause}
              AND p.id IN (
                SELECT DISTINCT il.productId 
                FROM invoice_lines il
                JOIN invoices i ON il.invoiceId = i.id
                WHERE i.type = 'INVOICE_PURCHASE'
              )
        `, params);
        if (!zeroProducts || zeroProducts.length === 0) {
            conn.release();
            return res.json({
                message: 'لا توجد أصناف تحتاج تحديث التكلفة',
                updatedCount: 0,
                updates: []
            });
        }
        const updates = [];
        for (const product of zeroProducts) {
            const [priceRows] = yield conn.query(`
                SELECT il.price, il.discount, il.quantity, i.date
                FROM invoice_lines il
                JOIN invoices i ON il.invoiceId = i.id
                WHERE i.type = 'INVOICE_PURCHASE'
                  AND il.productId = ?
                ORDER BY i.date DESC, i.id DESC
                LIMIT 1
            `, [product.id]);
            if (!priceRows || priceRows.length === 0)
                continue;
            const latestPurchase = priceRows[0];
            const grossPrice = Number(latestPurchase.price) || 0;
            const lineDiscount = Number(latestPurchase.discount) || 0;
            const qty = Number(latestPurchase.quantity) || 1;
            const netUnitCost = Math.max(0, grossPrice - (lineDiscount / qty));
            if (netUnitCost <= 0)
                continue;
            const newCost = Number(netUnitCost.toFixed(2));
            yield conn.query('UPDATE products SET cost = ? WHERE id = ?', [newCost, product.id]);
            updates.push({
                productId: product.id,
                name: product.name,
                oldCost: Number(product.cost) || 0,
                newCost
            });
        }
        // Recalculate BOM costs for affected finished products
        const updatedIds = updates.map(u => u.productId);
        let bomUpdates = 0;
        if (updatedIds.length > 0) {
            const placeholders = updatedIds.map(() => '?').join(',');
            const [affectedBOMs] = yield conn.query(`
                SELECT DISTINCT bi.bom_id
                FROM bom_items bi
                WHERE bi.raw_product_id IN (${placeholders})
            `, updatedIds);
            for (const bomRow of (affectedBOMs || [])) {
                const [bomHeaders] = yield conn.query('SELECT finished_product_id, labor_cost, overhead_cost, is_active FROM bom WHERE id = ?', [bomRow.bom_id]);
                if (!((_a = bomHeaders === null || bomHeaders === void 0 ? void 0 : bomHeaders[0]) === null || _a === void 0 ? void 0 : _a.is_active))
                    continue;
                const bom = bomHeaders[0];
                const [bomItems] = yield conn.query(`
                    SELECT bi.quantity_per_unit, bi.waste_percent, p.cost as unit_cost
                    FROM bom_items bi LEFT JOIN products p ON bi.raw_product_id = p.id
                    WHERE bi.bom_id = ?
                `, [bomRow.bom_id]);
                let materialCost = 0;
                for (const item of bomItems) {
                    const qtyWithWaste = (item.quantity_per_unit || 0) * (1 + (item.waste_percent || 0) / 100);
                    materialCost += qtyWithWaste * (item.unit_cost || 0);
                }
                const totalCost = materialCost + (parseFloat(bom.labor_cost) || 0) + (parseFloat(bom.overhead_cost) || 0);
                yield conn.query('UPDATE products SET cost = ? WHERE id = ?', [Number(totalCost.toFixed(2)), bom.finished_product_id]);
                bomUpdates++;
            }
        }
        conn.release();
        const user = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        console.log(`✅ [CostRefresh] ${user} refreshed ${updates.length} product costs, ${bomUpdates} BOMs recalculated`);
        res.json({
            message: `تم تحديث تكلفة ${updates.length} صنف من فواتير الشراء، وإعادة حساب ${bomUpdates} قائمة مواد`,
            updatedCount: updates.length,
            bomUpdatesCount: bomUpdates,
            updates
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'refreshCostsFromPurchases');
    }
});
exports.refreshCostsFromPurchases = refreshCostsFromPurchases;
// ─── Product Variants (embedded within a single product) ──────────
/**
 * GET /api/products/:id/variants
 * Returns all variants embedded within a product
 */
const getProductVariants = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const [rows] = yield conn.query(`SELECT id, productId, name, sku, barcode, purchasePrice, sellingPrice, attributes, stock, isActive, image
             FROM product_variants WHERE productId = ? ORDER BY name ASC`, [id]);
        const variants = rows.map(r => (Object.assign(Object.assign({}, r), { attributes: typeof r.attributes === 'string' ? JSON.parse(r.attributes) : (r.attributes || {}) })));
        conn.release();
        res.json(variants);
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'getProductVariants');
    }
});
exports.getProductVariants = getProductVariants;
/**
 * POST /api/products/:id/variants
 * Replaces all variants for a product (delete-and-reinsert approach for simplicity).
 * Body: { variants: [{ name, sku, barcode, purchasePrice, sellingPrice, attributes }] }
 */
const saveProductVariants = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { id: productId } = req.params;
        const { variants } = req.body;
        if (!Array.isArray(variants)) {
            yield conn.rollback();
            conn.release();
            return res.status(400).json({ error: 'variants array is required' });
        }
        // Verify parent product exists
        const [parentRows] = yield conn.query('SELECT id, name FROM products WHERE id = ?', [productId]);
        if (parentRows.length === 0) {
            yield conn.rollback();
            conn.release();
            return res.status(404).json({ error: 'المنتج الأساسي غير موجود' });
        }
        // 1. Fetch existing variant IDs
        const [existingRows] = yield conn.query('SELECT id FROM product_variants WHERE productId = ?', [productId]);
        const existingIds = existingRows.map(r => r.id);
        // 2. Identify variants to keep and variants to delete
        const payloadIds = variants.map((v) => v.id).filter((id) => id);
        const toDelete = existingIds.filter(id => !payloadIds.includes(id));
        if (toDelete.length > 0) {
            yield conn.query('DELETE FROM product_variants WHERE id IN (?)', [toDelete]);
        }
        // 3. Upsert variants
        if (variants.length > 0) {
            for (const v of variants) {
                const variantId = v.id || (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO product_variants (id, productId, name, sku, barcode, purchasePrice, sellingPrice, attributes, stock, isActive, image)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE 
                     name = VALUES(name), sku = VALUES(sku), barcode = VALUES(barcode), 
                     purchasePrice = VALUES(purchasePrice), sellingPrice = VALUES(sellingPrice), 
                     attributes = VALUES(attributes), stock = VALUES(stock), isActive = VALUES(isActive), image = VALUES(image)`, [
                    variantId,
                    productId,
                    v.name,
                    v.sku || null,
                    v.barcode || null,
                    Number(v.purchasePrice) || 0,
                    Number(v.sellingPrice) || 0,
                    JSON.stringify(v.attributes || {}),
                    Number(v.stock) || 0,
                    v.status === 'INACTIVE' ? 0 : 1,
                    v.image || null
                ]);
            }
            // Mark parent as having variants (keep type PRODUCT, store dimension keys)
            const attrKeys = Object.keys(variants[0].attributes || {});
            if (attrKeys.length > 0) {
                yield conn.query(`UPDATE products SET variantAttributes = ? WHERE id = ?`, [JSON.stringify({ dimensionKeys: attrKeys }), productId]);
            }
        }
        else {
            // If no variants, clear variant metadata from parent
            yield conn.query(`UPDATE products SET variantAttributes = NULL WHERE id = ?`, [productId]);
        }
        yield conn.commit();
        conn.release();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        const parentName = parentRows[0].name;
        yield (0, auditController_1.logAction)(user, 'PRODUCT', 'UPDATE', `Saved ${variants.length} variants for "${parentName}"`, `ProductID: ${productId}`);
        res.json({ saved: variants.length, productId });
    }
    catch (error) {
        yield conn.rollback();
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'saveProductVariants');
    }
});
exports.saveProductVariants = saveProductVariants;
/**
 * GET /api/products/variant-templates
 * Returns all saved variant templates
 */
const getVariantTemplates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const [rows] = yield conn.query(`SELECT * FROM product_variant_templates ORDER BY createdAt DESC`);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching variant templates:', error);
        res.status(500).json({ message: 'فشل جلب القوالب', error: error.message });
    }
    finally {
        conn.release();
    }
});
exports.getVariantTemplates = getVariantTemplates;
/**
 * POST /api/products/variant-templates
 * Save a new variant template
 */
const saveVariantTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { name, attributes } = req.body;
        if (!name || !attributes) {
            return res.status(400).json({ message: 'الاسم والسمات مطلوبة' });
        }
        const id = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO product_variant_templates (id, name, attributes) VALUES (?, ?, ?)`, [id, name, JSON.stringify(attributes)]);
        res.status(201).json({ id, name, attributes });
    }
    catch (error) {
        console.error('Error saving variant template:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ message: 'اسم القالب موجود مسبقاً' });
        }
        else {
            res.status(500).json({ message: 'فشل حفظ القالب', error: error.message });
        }
    }
    finally {
        conn.release();
    }
});
exports.saveVariantTemplate = saveVariantTemplate;
/**
 * DELETE /api/products/variant-templates/:id
 * Delete a variant template
 */
const deleteVariantTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        yield conn.query(`DELETE FROM product_variant_templates WHERE id = ?`, [id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting variant template:', error);
        res.status(500).json({ message: 'فشل حذف القالب', error: error.message });
    }
    finally {
        conn.release();
    }
});
exports.deleteVariantTemplate = deleteVariantTemplate;
