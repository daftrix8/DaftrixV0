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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * DEFINITIVE STOCK FIX
 * ====================
 * This is the final, authoritative fix for stock calculations.
 *
 * Root cause: stock_movements had duplicates AND sync adjustment entries,
 * and the recalculation API reads from stock_movements, creating feedback loops.
 *
 * This script:
 * 1. Removes SYSTEM_ADJUSTMENT / OPENING_BALANCE entries (our previous sync artifacts)
 * 2. Removes duplicate stock_movements (same reference_id + product_id)
 * 3. Recalculates products.stock from invoice_lines + stock_permits (AUTHORITATIVE)
 * 4. Recalculates product_stocks per warehouse from invoice_lines + stock_permits
 * 5. Verifies everything matches
 *
 * Run: npx ts-node server/scripts/fix_duplicate_stock_movements.ts
 */
const promise_1 = __importDefault(require("mysql2/promise"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = require("crypto");
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        console.log('\n══════════════════════════════════════════════════════════');
        console.log('  🔧 DEFINITIVE STOCK FIX — Authoritative Recalculation');
        console.log('══════════════════════════════════════════════════════════\n');
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true
        });
        // ═══════════════════════════════════════
        // STEP 1: Clean up sync artifacts
        // ═══════════════════════════════════════
        console.log('  🗑️  Step 1: Removing sync adjustment artifacts...');
        const [delSync] = yield conn.query(`
    DELETE FROM stock_movements 
    WHERE reference_type = 'SYSTEM_ADJUSTMENT' 
       OR movement_type = 'OPENING_BALANCE'
  `);
        console.log(`     Removed ${delSync.affectedRows} sync artifacts`);
        // ═══════════════════════════════════════
        // STEP 2: Remove duplicate stock_movements
        // ═══════════════════════════════════════
        console.log('  🗑️  Step 2: Removing duplicate stock_movements...');
        const [dupes] = yield conn.query(`
    SELECT reference_id, product_id, COUNT(*) as cnt, 
           MIN(id) as keep_id, GROUP_CONCAT(id ORDER BY id) as all_ids
    FROM stock_movements 
    WHERE reference_id IS NOT NULL AND reference_id != ''
    GROUP BY reference_id, product_id
    HAVING cnt > 1
  `);
        let totalDupeDeleted = 0;
        for (const dupe of dupes) {
            const allIds = String(dupe.all_ids).split(',').map(Number);
            const deleteIds = allIds.filter(id => id !== dupe.keep_id);
            if (deleteIds.length > 0) {
                yield conn.query(`DELETE FROM stock_movements WHERE id IN (?)`, [deleteIds]);
                totalDupeDeleted += deleteIds.length;
            }
        }
        console.log(`     Removed ${totalDupeDeleted} duplicate rows`);
        // ═══════════════════════════════════════
        // STEP 3: Recalculate products.stock from AUTHORITATIVE sources
        //         (invoice_lines + stock_permits — NOT stock_movements)
        // ═══════════════════════════════════════
        console.log('  📊 Step 3: Recalculating products.stock from invoices + permits...');
        // Reset all stock to 0
        yield conn.query('UPDATE products SET stock = 0');
        // Calculate from invoices
        const [invStock] = yield conn.query(`
    SELECT il.productId,
           SUM(CASE 
             WHEN i.type IN ('INVOICE_PURCHASE', 'RETURN_SALE') THEN (il.quantity + COALESCE(il.bonusQty, 0))
             WHEN i.type IN ('INVOICE_SALE', 'RETURN_PURCHASE') THEN -(il.quantity + COALESCE(il.bonusQty, 0))
             ELSE 0
           END) as netQty
    FROM invoice_lines il
    JOIN invoices i ON il.invoiceId = i.id
    WHERE i.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
      AND i.type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE')
    GROUP BY il.productId
  `);
        for (const row of invStock) {
            const qty = Math.round((Number(row.netQty) || 0) * 100) / 100;
            if (qty !== 0) {
                yield conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [qty, row.productId]);
            }
        }
        console.log(`     Invoice stock: ${invStock.length} products`);
        // Calculate from stock_permits
        const [permStock] = yield conn.query(`
    SELECT spi.productId,
           SUM(CASE
             WHEN sp.type = 'STOCK_PERMIT_IN' THEN spi.quantity
             WHEN sp.type = 'STOCK_PERMIT_OUT' THEN -spi.quantity
             ELSE 0
           END) as netQty
    FROM stock_permit_items spi
    JOIN stock_permits sp ON spi.permitId = sp.id
    GROUP BY spi.productId
  `);
        for (const row of permStock) {
            const qty = Math.round((Number(row.netQty) || 0) * 100) / 100;
            if (qty !== 0) {
                yield conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [qty, row.productId]);
            }
        }
        console.log(`     Permit stock: ${permStock.length} products`);
        // Add production movements (PRODUCTION_USE, PRODUCTION_OUTPUT)
        const [prodStock] = yield conn.query(`
    SELECT product_id as productId, SUM(qty_change) as netQty
    FROM stock_movements
    WHERE movement_type IN ('PRODUCTION_USE', 'PRODUCTION_OUTPUT')
    GROUP BY product_id
  `);
        for (const row of prodStock) {
            const qty = Math.round((Number(row.netQty) || 0) * 100) / 100;
            if (qty !== 0) {
                yield conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [qty, row.productId]);
            }
        }
        console.log(`     Production stock: ${prodStock.length} products`);
        // ═══════════════════════════════════════
        // STEP 4: Recalculate product_stocks per warehouse
        // ═══════════════════════════════════════
        console.log('  📊 Step 4: Recalculating product_stocks per warehouse...');
        yield conn.query('DELETE FROM product_stocks');
        // Warehouse stock from invoices  
        const [invWhStock] = yield conn.query(`
    SELECT il.productId,
           COALESCE(il.warehouseId, i.warehouseId) as warehouseId,
           SUM(CASE 
             WHEN i.type IN ('INVOICE_PURCHASE', 'RETURN_SALE') THEN (il.quantity + COALESCE(il.bonusQty, 0))
             WHEN i.type IN ('INVOICE_SALE', 'RETURN_PURCHASE') THEN -(il.quantity + COALESCE(il.bonusQty, 0))
             ELSE 0
           END) as netQty
    FROM invoice_lines il
    JOIN invoices i ON il.invoiceId = i.id
    WHERE i.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
      AND i.type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE')
      AND COALESCE(il.warehouseId, i.warehouseId) IS NOT NULL
    GROUP BY il.productId, COALESCE(il.warehouseId, i.warehouseId)
  `);
        // Warehouse stock from permits
        const [permWhStock] = yield conn.query(`
    SELECT spi.productId,
           CASE 
             WHEN sp.type = 'STOCK_PERMIT_IN' THEN sp.destWarehouseId
             WHEN sp.type = 'STOCK_PERMIT_OUT' THEN sp.sourceWarehouseId
             ELSE NULL
           END as warehouseId,
           SUM(CASE
             WHEN sp.type = 'STOCK_PERMIT_IN' THEN spi.quantity
             WHEN sp.type = 'STOCK_PERMIT_OUT' THEN -spi.quantity
             ELSE 0
           END) as netQty
    FROM stock_permit_items spi
    JOIN stock_permits sp ON spi.permitId = sp.id
    WHERE CASE 
      WHEN sp.type = 'STOCK_PERMIT_IN' THEN sp.destWarehouseId
      WHEN sp.type = 'STOCK_PERMIT_OUT' THEN sp.sourceWarehouseId
      ELSE NULL
    END IS NOT NULL
    GROUP BY spi.productId,
      CASE 
        WHEN sp.type = 'STOCK_PERMIT_IN' THEN sp.destWarehouseId
        WHEN sp.type = 'STOCK_PERMIT_OUT' THEN sp.sourceWarehouseId
        ELSE NULL
      END
  `);
        // Production movements per warehouse
        const [prodWhStock] = yield conn.query(`
    SELECT product_id as productId, warehouse_id as warehouseId, SUM(qty_change) as netQty
    FROM stock_movements
    WHERE movement_type IN ('PRODUCTION_USE', 'PRODUCTION_OUTPUT')
      AND warehouse_id IS NOT NULL
    GROUP BY product_id, warehouse_id
  `);
        // Merge all warehouse stock
        const whMap = new Map();
        const validWh = new Set();
        const [whs] = yield conn.query('SELECT id FROM warehouses');
        whs.forEach((w) => validWh.add(w.id));
        for (const row of [...invWhStock, ...permWhStock, ...prodWhStock]) {
            if (!row.warehouseId || !validWh.has(row.warehouseId))
                continue;
            const key = `${row.productId}::${row.warehouseId}`;
            whMap.set(key, (whMap.get(key) || 0) + (Number(row.netQty) || 0));
        }
        // Insert product_stocks
        let whInserted = 0;
        const BATCH = 500;
        const entries = [...whMap.entries()].filter(([, v]) => Math.abs(v) > 0.001);
        for (let i = 0; i < entries.length; i += BATCH) {
            const batch = entries.slice(i, i + BATCH);
            const placeholders = batch.map(() => '(?, ?, ?, ?)').join(', ');
            const values = batch.flatMap(([key, stock]) => {
                const [productId, warehouseId] = key.split('::');
                return [(0, crypto_1.randomUUID)(), productId, warehouseId, Math.round(stock * 100) / 100];
            });
            yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE stock = VALUES(stock)`, values);
            whInserted += batch.length;
        }
        console.log(`     Inserted ${whInserted} product_stocks entries`);
        // ═══════════════════════════════════════
        // STEP 5: Now sync stock_movements to match
        // ═══════════════════════════════════════
        console.log('  🔄 Step 5: Syncing stock_movements with products.stock...');
        const [discrepancies] = yield conn.query(`
    SELECT p.id, p.stock as authStock, COALESCE(sm.total, 0) as mvtTotal
    FROM products p
    LEFT JOIN (
      SELECT product_id, SUM(qty_change) as total FROM stock_movements GROUP BY product_id
    ) sm ON sm.product_id = p.id
    WHERE ABS(p.stock - COALESCE(sm.total, 0)) > 0.01
  `);
        let syncCount = 0;
        for (const d of discrepancies) {
            const diff = d.authStock - d.mvtTotal;
            // Find the product's most common warehouse for proper assignment
            const [topWh] = yield conn.query(`
      SELECT warehouse_id, COUNT(*) as cnt
      FROM stock_movements
      WHERE product_id = ? AND warehouse_id IS NOT NULL
      GROUP BY warehouse_id ORDER BY cnt DESC LIMIT 1
    `, [d.id]);
            const warehouseId = ((_a = topWh[0]) === null || _a === void 0 ? void 0 : _a.warehouse_id) || null;
            yield conn.query(`
      INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, reference_id, notes)
      VALUES (?, ?, ?, 'OPENING_BALANCE', 'SYSTEM_SYNC', ?, ?)
    `, [d.id, warehouseId, diff, `SYNC-${Date.now()}-${syncCount}`,
                `تعديل رصيد افتتاحي - مزامنة (${diff > 0 ? '+' : ''}${diff.toFixed(2)})`]);
            syncCount++;
        }
        console.log(`     Created ${syncCount} sync adjustments`);
        // ═══════════════════════════════════════
        // STEP 6: Verify
        // ═══════════════════════════════════════
        console.log('\n  ✅ Step 6: Verification...');
        const pid = '91e9ba75-e77a-46f1-bbed-7282578481f6';
        const [target] = yield conn.query(`SELECT stock FROM products WHERE id = ?`, [pid]);
        const [targetMvt] = yield conn.query(`SELECT COALESCE(SUM(qty_change),0) as t FROM stock_movements WHERE product_id = ?`, [pid]);
        const [targetPs] = yield conn.query(`SELECT stock FROM product_stocks WHERE productId = ?`, [pid]);
        console.log(`     درسوار بار 1000:`);
        console.log(`       products.stock    = ${(_b = target[0]) === null || _b === void 0 ? void 0 : _b.stock}`);
        console.log(`       stock_movements   = ${(_c = targetMvt[0]) === null || _c === void 0 ? void 0 : _c.t}`);
        console.log(`       product_stocks    = ${(_e = (_d = targetPs[0]) === null || _d === void 0 ? void 0 : _d.stock) !== null && _e !== void 0 ? _e : 'N/A'}`);
        // Global check
        const [remaining] = yield conn.query(`
    SELECT COUNT(*) as cnt FROM products p
    LEFT JOIN (SELECT product_id, SUM(qty_change) as t FROM stock_movements GROUP BY product_id) sm ON sm.product_id = p.id
    WHERE ABS(p.stock - COALESCE(sm.t, 0)) > 0.01
  `);
        console.log(`     Remaining mismatches: ${remaining[0].cnt}`);
        const [dupeCheck] = yield conn.query(`
    SELECT COUNT(*) as cnt FROM (
      SELECT reference_id, product_id FROM stock_movements 
      WHERE reference_id IS NOT NULL AND reference_id != '' AND reference_type != 'SYSTEM_SYNC'
      GROUP BY reference_id, product_id HAVING COUNT(*) > 1
    ) d
  `);
        console.log(`     Remaining duplicates: ${dupeCheck[0].cnt}`);
        console.log('\n  ✅ DONE');
        yield conn.end();
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
