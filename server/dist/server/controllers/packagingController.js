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
exports.completeTask = exports.packTask = exports.getTasks = exports.deleteSpec = exports.updateSpec = exports.createSpec = exports.getSpec = exports.getSpecs = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
/**
 * Packaging Controller (التعبئة والتغليف)
 * Handles packaging specifications and shop floor execution.
 */
/**
 * Self-healing: ensure packaging tables exist before any operation.
 * Some client databases failed to create these tables during db.ts init
 * (FK constraint errors silently swallowed by .catch()). This guarantees
 * the tables exist before we attempt any query against them.
 */
let packagingTablesVerified = false;
const ensurePackagingTables = () => __awaiter(void 0, void 0, void 0, function* () {
    if (packagingTablesVerified)
        return;
    try {
        // Quick probe — if this succeeds, tables exist
        yield db_1.pool.query('SELECT 1 FROM product_packaging_specs LIMIT 0');
        packagingTablesVerified = true;
    }
    catch (_a) {
        // Table missing — create it now
        console.log('🔧 [Packaging] Tables missing, creating on-the-fly...');
        const conn = yield db_1.pool.getConnection();
        try {
            yield conn.query(`
                CREATE TABLE IF NOT EXISTS product_packaging_specs (
                    id VARCHAR(36) PRIMARY KEY,
                    product_id VARCHAR(36) NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    capacity INT NOT NULL,
                    level ENUM('PRIMARY', 'SECONDARY', 'TERTIARY') DEFAULT 'PRIMARY',
                    instructions TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_pps_product (product_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);
            yield conn.query(`
                CREATE TABLE IF NOT EXISTS product_packaging_materials (
                    id VARCHAR(36) PRIMARY KEY,
                    spec_id VARCHAR(36) NOT NULL,
                    material_product_id VARCHAR(36) NOT NULL,
                    quantity DECIMAL(15,3) NOT NULL,
                    INDEX idx_ppm_spec (spec_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);
            yield conn.query(`
                CREATE TABLE IF NOT EXISTS production_order_packaging (
                    id VARCHAR(36) PRIMARY KEY,
                    production_order_id VARCHAR(36) NOT NULL,
                    packaging_spec_id VARCHAR(36) NOT NULL,
                    qty_planned DECIMAL(15,3) NOT NULL,
                    qty_packed DECIMAL(15,3) DEFAULT 0,
                    status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED') DEFAULT 'PENDING',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_pop_order (production_order_id),
                    INDEX idx_pop_status (status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);
            packagingTablesVerified = true;
            console.log('✅ [Packaging] Tables created successfully');
        }
        catch (createErr) {
            console.error('❌ [Packaging] Failed to create tables:', createErr.message);
            throw new Error(`Packaging tables could not be created: ${createErr.message}`);
        }
        finally {
            conn.release();
        }
    }
});
// ─── Specifications (product_packaging_specs & product_packaging_materials) ───
const getSpecs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield ensurePackagingTables();
        const [specs] = yield db_1.pool.query(`
            SELECT s.*, p.name as product_name
            FROM product_packaging_specs s
            JOIN products p ON s.product_id = p.id
            ORDER BY s.created_at DESC
        `);
        // Fetch materials for all specs
        const specIds = specs.map(s => s.id);
        let materialsMap = {};
        if (specIds.length > 0) {
            const [materials] = yield db_1.pool.query(`
                SELECT m.*, p.name as material_name, p.unit
                FROM product_packaging_materials m
                JOIN products p ON m.material_product_id = p.id
                WHERE m.spec_id IN (${specIds.map(() => '?').join(',')})
            `, specIds);
            for (const mat of materials) {
                if (!materialsMap[mat.spec_id])
                    materialsMap[mat.spec_id] = [];
                materialsMap[mat.spec_id].push(mat);
            }
        }
        const specsWithMaterials = specs.map(s => (Object.assign(Object.assign({}, s), { materials: materialsMap[s.id] || [] })));
        res.json(specsWithMaterials);
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(res, error, 'getSpecs');
    }
});
exports.getSpecs = getSpecs;
const getSpec = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield ensurePackagingTables();
        const { id } = req.params;
        const [specs] = yield db_1.pool.query(`
            SELECT s.*, p.name as product_name
            FROM product_packaging_specs s
            JOIN products p ON s.product_id = p.id
            WHERE s.id = ?
        `, [id]);
        const spec = specs[0];
        if (!spec)
            return res.status(404).json({ error: 'مواصفة التعبئة غير موجودة' });
        const [materials] = yield db_1.pool.query(`
            SELECT m.*, p.name as material_name, p.unit
            FROM product_packaging_materials m
            JOIN products p ON m.material_product_id = p.id
            WHERE m.spec_id = ?
        `, [id]);
        res.json(Object.assign(Object.assign({}, spec), { materials }));
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(res, error, 'getSpec');
    }
});
exports.getSpec = getSpec;
const createSpec = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield ensurePackagingTables();
        yield conn.beginTransaction();
        const { productId, name, capacity, level, instructions, materials = [] } = req.body;
        if (!productId || !name || !capacity) {
            yield conn.rollback();
            conn.release();
            return res.status(400).json({ error: 'المنتج، الاسم، والسعة مطلوبة' });
        }
        const specId = (0, crypto_1.randomUUID)();
        yield conn.query(`
            INSERT INTO product_packaging_specs (id, product_id, name, capacity, level, instructions)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [specId, productId, name, capacity, level || 'PRIMARY', instructions || null]);
        for (const mat of materials) {
            const matId = (0, crypto_1.randomUUID)();
            yield conn.query(`
                INSERT INTO product_packaging_materials (id, spec_id, material_product_id, quantity)
                VALUES (?, ?, ?, ?)
            `, [matId, specId, mat.materialProductId, mat.quantity]);
        }
        yield conn.commit();
        res.status(201).json({ success: true, id: specId, message: 'تم إنشاء مواصفة التعبئة بنجاح' });
    }
    catch (error) {
        yield conn.rollback();
        (0, errorHandler_1.handleControllerError)(res, error, 'createSpec');
    }
    finally {
        conn.release();
    }
});
exports.createSpec = createSpec;
const updateSpec = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield ensurePackagingTables();
        yield conn.beginTransaction();
        const { id } = req.params;
        const { productId, name, capacity, level, instructions, materials = [] } = req.body;
        const [existing] = yield conn.query('SELECT id FROM product_packaging_specs WHERE id = ?', [id]);
        if (!existing[0]) {
            yield conn.rollback();
            conn.release();
            return res.status(404).json({ error: 'مواصفة التعبئة غير موجودة' });
        }
        yield conn.query(`
            UPDATE product_packaging_specs
            SET product_id = ?, name = ?, capacity = ?, level = ?, instructions = ?
            WHERE id = ?
        `, [productId, name, capacity, level || 'PRIMARY', instructions || null, id]);
        // Replace materials
        yield conn.query('DELETE FROM product_packaging_materials WHERE spec_id = ?', [id]);
        for (const mat of materials) {
            const matId = (0, crypto_1.randomUUID)();
            yield conn.query(`
                INSERT INTO product_packaging_materials (id, spec_id, material_product_id, quantity)
                VALUES (?, ?, ?, ?)
            `, [matId, id, mat.materialProductId, mat.quantity]);
        }
        yield conn.commit();
        res.json({ success: true, message: 'تم تحديث مواصفة التعبئة بنجاح' });
    }
    catch (error) {
        yield conn.rollback();
        (0, errorHandler_1.handleControllerError)(res, error, 'updateSpec');
    }
    finally {
        conn.release();
    }
});
exports.updateSpec = updateSpec;
const deleteSpec = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield ensurePackagingTables();
        const { id } = req.params;
        yield db_1.pool.query('DELETE FROM product_packaging_specs WHERE id = ?', [id]);
        res.json({ success: true, message: 'تم حذف مواصفة التعبئة' });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(res, error, 'deleteSpec');
    }
});
exports.deleteSpec = deleteSpec;
// ─── Shop Floor Execution (production_order_packaging) ───
const getTasks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield ensurePackagingTables();
        const { status } = req.query;
        let whereClause = 'WHERE po.status = "COMPLETED"';
        const params = [];
        if (status) {
            const statuses = status.split(',');
            if (statuses.length > 1) {
                whereClause += ` AND pop.status IN (${statuses.map(() => '?').join(',')})`;
                params.push(...statuses);
            }
            else {
                whereClause += ' AND pop.status = ?';
                params.push(status);
            }
        }
        const [tasks] = yield db_1.pool.query(`
            SELECT pop.*,
                   po.order_number as production_order_number,
                   po.warehouse_id,
                   pps.name as spec_name,
                   pps.capacity,
                   pps.instructions,
                   p.name as product_name
            FROM production_order_packaging pop
            JOIN production_orders po ON pop.production_order_id = po.id
            JOIN product_packaging_specs pps ON pop.packaging_spec_id = pps.id
            JOIN products p ON pps.product_id = p.id
            ${whereClause}
            ORDER BY pop.created_at DESC
        `, params);
        res.json(tasks);
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(res, error, 'getTasks');
    }
});
exports.getTasks = getTasks;
const packTask = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield ensurePackagingTables();
        yield conn.beginTransaction();
        const { id } = req.params;
        const { quantityPacked } = req.body; // Quantity of packed packages (e.g., 5 cartons)
        if (!quantityPacked || quantityPacked <= 0) {
            yield conn.rollback();
            conn.release();
            return res.status(400).json({ error: 'الكمية المعبأة غير صالحة' });
        }
        const [tasks] = yield conn.query(`
            SELECT pop.*, po.warehouse_id
            FROM production_order_packaging pop
            JOIN production_orders po ON pop.production_order_id = po.id
            WHERE pop.id = ?
        `, [id]);
        const task = tasks[0];
        if (!task) {
            yield conn.rollback();
            conn.release();
            return res.status(404).json({ error: 'مهمة التعبئة غير موجودة' });
        }
        if (task.status === 'COMPLETED') {
            yield conn.rollback();
            conn.release();
            return res.status(400).json({ error: 'المهمة مكتملة بالفعل' });
        }
        // Fetch materials required for the spec
        const [materials] = yield conn.query(`
            SELECT material_product_id, quantity
            FROM product_packaging_materials
            WHERE spec_id = ?
        `, [task.packaging_spec_id]);
        // Deduct materials from stock
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        for (const mat of materials) {
            const totalQtyToDeduct = Number(mat.quantity) * Number(quantityPacked);
            // Log stock movement
            yield conn.query(`
                INSERT INTO stock_movements (
                    product_id, warehouse_id, movement_type,
                    qty_change, reference_type, reference_id,
                    notes, movement_date, created_by
                ) VALUES (?, ?, 'PRODUCTION_USE', ?, 'PACKAGING', ?, ?, NOW(), ?)
            `, [
                mat.material_product_id,
                task.warehouse_id,
                -totalQtyToDeduct,
                id,
                `استهلاك تعبئة: ${quantityPacked} عبوات`,
                user
            ]);
            // Update product_stocks table
            if (task.warehouse_id) {
                yield conn.query(`
                    UPDATE product_stocks
                    SET quantity = GREATEST(0, quantity - ?)
                    WHERE product_id = ? AND warehouse_id = ?
                `, [totalQtyToDeduct, mat.material_product_id, task.warehouse_id]);
            }
            // Update main products.stock
            yield conn.query(`
                UPDATE products
                SET stock = GREATEST(0, stock - ?)
                WHERE id = ?
            `, [totalQtyToDeduct, mat.material_product_id]);
        }
        // Update task packed quantity and status
        const newQtyPacked = Number(task.qty_packed) + Number(quantityPacked);
        let newStatus = task.status;
        if (newStatus === 'PENDING')
            newStatus = 'IN_PROGRESS';
        if (newQtyPacked >= Number(task.qty_planned)) {
            newStatus = 'COMPLETED';
        }
        yield conn.query(`
            UPDATE production_order_packaging
            SET qty_packed = ?, status = ?
            WHERE id = ?
        `, [newQtyPacked, newStatus, id]);
        yield conn.commit();
        res.json({ success: true, message: 'تم تسجيل التعبئة وخصم المواد بنجاح', newQtyPacked, newStatus });
    }
    catch (error) {
        yield conn.rollback();
        (0, errorHandler_1.handleControllerError)(res, error, 'packTask');
    }
    finally {
        conn.release();
    }
});
exports.packTask = packTask;
const completeTask = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield ensurePackagingTables();
        const { id } = req.params;
        yield db_1.pool.query('UPDATE production_order_packaging SET status = ? WHERE id = ?', ['COMPLETED', id]);
        res.json({ success: true, message: 'تم إكمال مهمة التعبئة' });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(res, error, 'completeTask');
    }
});
exports.completeTask = completeTask;
