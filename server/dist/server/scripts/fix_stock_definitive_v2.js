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
 * DEFINITIVE STOCK FIX v3
 * =======================
 * Root cause: The migration was run multiple times. Each run created new UUIDs for
 * stock_permits, but the stock_movements from previous runs were NEVER cleaned up.
 * This left orphaned movements pointing to deleted permits.
 *
 * Fix:
 * 1. Delete stock_movements referencing non-existent stock_permits (orphaned)
 * 2. Delete SYSTEM_SYNC / OPENING_BALANCE artifacts
 * 3. Delete remaining duplicates (same reference_id + product_id)
 * 4. Rebuild products.stock from invoice_lines + stock_permits (AUTHORITATIVE)
 * 5. Rebuild product_stocks per warehouse
 * 6. Sync stock_movements to match (with proper warehouse_id)
 */
const promise_1 = __importDefault(require("mysql2/promise"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = require("crypto");
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        console.log('\n══════════════════════════════════════════════════════════');
        console.log('  🔧 DEFINITIVE STOCK FIX v3 — Orphaned Movement Cleanup');
        console.log('══════════════════════════════════════════════════════════\n');
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        // ═══════════════════════════════════════
        // STEP 1: Delete ORPHANED permit movements (reference_id points to deleted permits)
        // ═══════════════════════════════════════
        console.log('  🗑️  Step 1: Removing ORPHANED permit movements...');
        const [orphanedPermits] = yield conn.query(`
    DELETE sm FROM stock_movements sm
    WHERE sm.reference_type IN ('STOCK_PERMIT_IN', 'STOCK_PERMIT_OUT', 'STOCK_TRANSFER')
      AND sm.reference_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM stock_permits sp WHERE sp.id = sm.reference_id
      )
  `);
        console.log(`     Removed ${orphanedPermits.affectedRows} orphaned permit movements`);
        // ═══════════════════════════════════════
        // STEP 2: Delete ORPHANED invoice movements (reference_id points to deleted invoices)
        // ═══════════════════════════════════════
        console.log('  🗑️  Step 2: Removing ORPHANED invoice movements...');
        const [orphanedInv] = yield conn.query(`
    DELETE sm FROM stock_movements sm
    WHERE sm.reference_type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE', 'SALE', 'PURCHASE', 'RETURN_IN', 'RETURN_OUT')
      AND sm.reference_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM invoices i WHERE i.id = sm.reference_id
      )
  `);
        console.log(`     Removed ${orphanedInv.affectedRows} orphaned invoice movements`);
        // ═══════════════════════════════════════
        // STEP 3: Delete ALL sync artifacts
        // ═══════════════════════════════════════
        console.log('  🗑️  Step 3: Removing ALL sync artifacts...');
        const [delSync] = yield conn.query(`
    DELETE FROM stock_movements 
    WHERE reference_type IN ('SYSTEM_SYNC', 'SYSTEM_ADJUSTMENT')
       OR movement_type = 'OPENING_BALANCE'
  `);
        console.log(`     Removed ${delSync.affectedRows} sync artifacts`);
        // ═══════════════════════════════════════
        // STEP 4: Remove remaining duplicates (same reference_id + product_id)
        // ═══════════════════════════════════════
        console.log('  🗑️  Step 4: Removing remaining duplicates...');
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
            const deleteIds = allIds.filter((id) => id !== dupe.keep_id);
            if (deleteIds.length > 0) {
                yield conn.query(`DELETE FROM stock_movements WHERE id IN (?)`, [deleteIds]);
                totalDupeDeleted += deleteIds.length;
            }
        }
        console.log(`     Removed ${totalDupeDeleted} duplicate rows`);
        // ═══════════════════════════════════════
        // STEP 5: Rebuild products.stock from AUTHORITATIVE sources
        // ═══════════════════════════════════════
        console.log('  📊 Step 5: Rebuilding products.stock...');
        yield conn.query('UPDATE products SET stock = 0');
        const [invStock] = yield conn.query(`
    SELECT il.productId,
           SUM(CASE 
             WHEN i.type IN ('INVOICE_PURCHASE', 'RETURN_SALE') THEN (il.quantity + COALESCE(il.bonusQty, 0))
             WHEN i.type IN ('INVOICE_SALE', 'RETURN_PURCHASE') THEN -(il.quantity + COALESCE(il.bonusQty, 0))
             ELSE 0 END) as netQty
    FROM invoice_lines il JOIN invoices i ON il.invoiceId = i.id
    WHERE i.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
      AND i.type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE')
    GROUP BY il.productId
  `);
        for (const row of invStock) {
            const qty = Math.round((Number(row.netQty) || 0) * 100) / 100;
            if (qty !== 0)
                yield conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [qty, row.productId]);
        }
        console.log(`     Invoice stock: ${invStock.length} products`);
        const [permStock] = yield conn.query(`
    SELECT spi.productId,
           SUM(CASE WHEN sp.type = 'STOCK_PERMIT_IN' THEN spi.quantity
                    WHEN sp.type = 'STOCK_PERMIT_OUT' THEN -spi.quantity ELSE 0 END) as netQty
    FROM stock_permit_items spi JOIN stock_permits sp ON spi.permitId = sp.id
    GROUP BY spi.productId
  `);
        for (const row of permStock) {
            const qty = Math.round((Number(row.netQty) || 0) * 100) / 100;
            if (qty !== 0)
                yield conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [qty, row.productId]);
        }
        console.log(`     Permit stock: ${permStock.length} products`);
        // ═══════════════════════════════════════
        // STEP 5B: Fix NULL warehouse on invoices/invoice_lines → assign to الرئيسى
        // ═══════════════════════════════════════
        console.log('  🏪 Step 5B: Fixing NULL warehouse on invoices...');
        const [defaultWh] = yield conn.query(`SELECT id FROM warehouses WHERE name = 'الرئيسى' LIMIT 1`);
        if (defaultWh.length > 0) {
            const whId = defaultWh[0].id;
            const [fixedInv] = yield conn.query(`UPDATE invoices SET warehouseId = ? WHERE warehouseId IS NULL AND type IN ('INVOICE_SALE','INVOICE_PURCHASE','RETURN_SALE','RETURN_PURCHASE')`, [whId]);
            const [fixedLines] = yield conn.query(`UPDATE invoice_lines SET warehouseId = ? WHERE warehouseId IS NULL`, [whId]);
            console.log(`     Fixed ${fixedInv.affectedRows} invoices + ${fixedLines.affectedRows} lines → الرئيسى`);
        }
        // ═══════════════════════════════════════
        // STEP 6: Rebuild product_stocks per warehouse
        // ═══════════════════════════════════════
        console.log('  📊 Step 6: Rebuilding product_stocks...');
        yield conn.query('DELETE FROM product_stocks');
        const [invWhStock] = yield conn.query(`
    SELECT il.productId, COALESCE(il.warehouseId, i.warehouseId) as warehouseId,
           SUM(CASE WHEN i.type IN ('INVOICE_PURCHASE','RETURN_SALE') THEN (il.quantity+COALESCE(il.bonusQty,0))
                    WHEN i.type IN ('INVOICE_SALE','RETURN_PURCHASE') THEN -(il.quantity+COALESCE(il.bonusQty,0)) ELSE 0 END) as netQty
    FROM invoice_lines il JOIN invoices i ON il.invoiceId = i.id
    WHERE i.status IN ('POSTED','COMPLETED','PARTIAL')
      AND i.type IN ('INVOICE_SALE','INVOICE_PURCHASE','RETURN_SALE','RETURN_PURCHASE')
      AND COALESCE(il.warehouseId, i.warehouseId) IS NOT NULL
    GROUP BY il.productId, COALESCE(il.warehouseId, i.warehouseId)
  `);
        // Permit warehouse stock: IN, OUT, and TRANSFER (source -qty, dest +qty)
        const [permWhStock] = yield conn.query(`
    SELECT spi.productId, sp.destWarehouseId as warehouseId, SUM(spi.quantity) as netQty
    FROM stock_permit_items spi JOIN stock_permits sp ON spi.permitId = sp.id
    WHERE sp.type = 'STOCK_PERMIT_IN' AND sp.destWarehouseId IS NOT NULL
    GROUP BY spi.productId, sp.destWarehouseId
    UNION ALL
    SELECT spi.productId, sp.sourceWarehouseId as warehouseId, SUM(-spi.quantity) as netQty
    FROM stock_permit_items spi JOIN stock_permits sp ON spi.permitId = sp.id
    WHERE sp.type = 'STOCK_PERMIT_OUT' AND sp.sourceWarehouseId IS NOT NULL
    GROUP BY spi.productId, sp.sourceWarehouseId
    UNION ALL
    SELECT spi.productId, sp.sourceWarehouseId as warehouseId, SUM(-spi.quantity) as netQty
    FROM stock_permit_items spi JOIN stock_permits sp ON spi.permitId = sp.id
    WHERE sp.type = 'STOCK_TRANSFER' AND sp.sourceWarehouseId IS NOT NULL
    GROUP BY spi.productId, sp.sourceWarehouseId
    UNION ALL
    SELECT spi.productId, sp.destWarehouseId as warehouseId, SUM(spi.quantity) as netQty
    FROM stock_permit_items spi JOIN stock_permits sp ON spi.permitId = sp.id
    WHERE sp.type = 'STOCK_TRANSFER' AND sp.destWarehouseId IS NOT NULL
    GROUP BY spi.productId, sp.destWarehouseId
  `);
        const whMap = new Map();
        const [whs] = yield conn.query('SELECT id FROM warehouses');
        const validWh = new Set(whs.map((w) => w.id));
        for (const row of [...invWhStock, ...permWhStock]) {
            if (!row.warehouseId || !validWh.has(row.warehouseId))
                continue;
            const key = `${row.productId}::${row.warehouseId}`;
            whMap.set(key, (whMap.get(key) || 0) + (Number(row.netQty) || 0));
        }
        let whInserted = 0;
        const entries = [...whMap.entries()].filter(([, v]) => Math.abs(v) > 0.001);
        for (let i = 0; i < entries.length; i += 500) {
            const batch = entries.slice(i, i + 500);
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
        // STEP 7: Sync stock_movements to match products.stock
        // ═══════════════════════════════════════
        console.log('  🔄 Step 7: Syncing stock_movements...');
        const [discrepancies] = yield conn.query(`
    SELECT p.id, p.stock as authStock, COALESCE(sm.total, 0) as mvtTotal
    FROM products p
    LEFT JOIN (SELECT product_id, SUM(qty_change) as total FROM stock_movements GROUP BY product_id) sm ON sm.product_id = p.id
    WHERE ABS(p.stock - COALESCE(sm.total, 0)) > 0.01
  `);
        let syncCount = 0;
        for (const d of discrepancies) {
            const diff = d.authStock - d.mvtTotal;
            const [topWh] = yield conn.query(`
      SELECT warehouse_id, COUNT(*) as cnt FROM stock_movements
      WHERE product_id = ? AND warehouse_id IS NOT NULL
      GROUP BY warehouse_id ORDER BY cnt DESC LIMIT 1
    `, [d.id]);
            const warehouseId = ((_a = topWh[0]) === null || _a === void 0 ? void 0 : _a.warehouse_id) || null;
            yield conn.query(`
      INSERT INTO stock_movements (product_id, warehouse_id, qty_change, movement_type, reference_type, reference_id, notes, movement_date)
      VALUES (?, ?, ?, 'OPENING_BALANCE', 'SYSTEM_SYNC', ?, ?, NOW())
    `, [d.id, warehouseId, diff, `SYNC-v3-${Date.now()}-${syncCount}`,
                `تعديل رصيد - مزامنة نهائية (${diff > 0 ? '+' : ''}${diff.toFixed(2)})`]);
            syncCount++;
        }
        console.log(`     Created ${syncCount} sync adjustments`);
        // ═══════════════════════════════════════
        // STEP 8: Verify
        // ═══════════════════════════════════════
        console.log('\n  ✅ Step 8: Verification...');
        // 42139
        const pid42139 = (_b = (yield conn.query(`SELECT id FROM products WHERE sku = '42139'`))[0][0]) === null || _b === void 0 ? void 0 : _b.id;
        if (pid42139) {
            const [t] = yield conn.query(`SELECT stock FROM products WHERE id = ?`, [pid42139]);
            const [m] = yield conn.query(`SELECT COALESCE(SUM(qty_change),0) as t FROM stock_movements WHERE product_id = ?`, [pid42139]);
            const [mc] = yield conn.query(`SELECT COUNT(*) as c FROM stock_movements WHERE product_id = ?`, [pid42139]);
            console.log(`     110 + كيس مخده: stock=${t[0].stock}, mvts_sum=${m[0].t}, mvts_count=${mc[0].c}`);
        }
        // 42708
        const pid42708 = (_c = (yield conn.query(`SELECT id FROM products WHERE sku = '42708'`))[0][0]) === null || _c === void 0 ? void 0 : _c.id;
        if (pid42708) {
            const [t] = yield conn.query(`SELECT stock FROM products WHERE id = ?`, [pid42708]);
            const [m] = yield conn.query(`SELECT COALESCE(SUM(qty_change),0) as t FROM stock_movements WHERE product_id = ?`, [pid42708]);
            console.log(`     درسوار بار: stock=${t[0].stock}, mvts_sum=${m[0].t}`);
        }
        // Global
        const [mismatches] = yield conn.query(`
    SELECT COUNT(*) as cnt FROM products p
    LEFT JOIN (SELECT product_id, SUM(qty_change) as t FROM stock_movements GROUP BY product_id) sm ON sm.product_id = p.id
    WHERE ABS(p.stock - COALESCE(sm.t, 0)) > 0.01
  `);
        const [dupeCheck] = yield conn.query(`
    SELECT COUNT(*) as cnt FROM (
      SELECT reference_id, product_id FROM stock_movements 
      WHERE reference_id IS NOT NULL AND reference_id != '' AND reference_type != 'SYSTEM_SYNC'
      GROUP BY reference_id, product_id HAVING COUNT(*) > 1
    ) d
  `);
        const [orphanCheck] = yield conn.query(`
    SELECT COUNT(*) as cnt FROM stock_movements sm
    WHERE sm.reference_type IN ('STOCK_PERMIT_IN','STOCK_PERMIT_OUT')
      AND NOT EXISTS (SELECT 1 FROM stock_permits sp WHERE sp.id = sm.reference_id)
  `);
        console.log(`\n     Global stock mismatches: ${mismatches[0].cnt}`);
        console.log(`     Remaining duplicates: ${dupeCheck[0].cnt}`);
        console.log(`     Remaining orphaned permits: ${orphanCheck[0].cnt}`);
        console.log('\n  ✅ DONE');
        yield conn.end();
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
