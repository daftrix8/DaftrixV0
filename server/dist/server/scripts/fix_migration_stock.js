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
 * Recalculate stock from ALL sources in a SINGLE query:
 *   1. Invoices (POSTED)
 *   2. Stock permits (IN/OUT/TRANSFER)
 *
 * Uses UNION ALL to combine all sources then GROUP BY to aggregate.
 * This avoids ON DUPLICATE KEY issues.
 */
const promise_1 = __importDefault(require("mysql2/promise"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const DATA_DIR = process.env.MIGRATION_DATA_DIR || path.resolve(__dirname, '../../mall stuff/data');
const MAPPING_FILE = process.env.MIGRATION_MAPPING_FILE || path.resolve(DATA_DIR, '../id_mapping.json');
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`  📦 IMPORT OPENING BALANCES + RECALCULATE STOCK`);
        console.log(`  Data Dir: ${DATA_DIR}`);
        console.log(`${'═'.repeat(60)}\n`);
        const idMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        // ── STEP 1: Import opening balances (idempotent) ──
        console.log('━━━ STEP 1: Import opening balances ━━━');
        const pool = yield promise_1.default.createPool({
            host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, decimalNumbers: true,
            connectionLimit: 3
        });
        // Clean old opening balance permits
        yield pool.query(`DELETE spi FROM stock_permit_items spi JOIN stock_permits sp ON sp.id = spi.permitId WHERE sp.description LIKE '%[OPENING_BALANCE]%'`);
        yield pool.query(`DELETE FROM stock_permits WHERE description LIKE '%[OPENING_BALANCE]%'`);
        // Load data
        const tab3Data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ItemTab3Balance.json'), 'utf8'));
        const itemsData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'items.json'), 'utf8'));
        // Build opening balance map
        const balancesByStore = new Map();
        for (const b of tab3Data) {
            const qty = Number(b.openBalance || 0);
            if (qty === 0)
                continue;
            const storeId = String(b.StoreID);
            if (!balancesByStore.has(storeId))
                balancesByStore.set(storeId, []);
            balancesByStore.get(storeId).push({ productOldId: String(b.ItemID), qty });
        }
        for (const item of itemsData) {
            const qty = Number(item.openBalance || 0);
            if (qty === 0)
                continue;
            const storeId = String(item.storeID || '1');
            if (!balancesByStore.has(storeId))
                balancesByStore.set(storeId, []);
            balancesByStore.get(storeId).push({ productOldId: String(item.ID), qty });
        }
        let totalItems = 0;
        for (const [storeId, items] of balancesByStore) {
            const warehouseId = (_a = idMap.warehouses) === null || _a === void 0 ? void 0 : _a[storeId];
            if (!warehouseId)
                continue;
            const permitId = (0, crypto_1.randomUUID)();
            yield pool.query(`INSERT INTO stock_permits (id, date, type, description, destWarehouseId, createdBy) VALUES (?, ?, 'STOCK_PERMIT_IN', ?, ?, 'migration')`, [permitId, '2023-01-01', `[OPENING_BALANCE] Store ${storeId}`, warehouseId]);
            const params = [];
            for (const { productOldId, qty } of items) {
                const productId = (_b = idMap.products) === null || _b === void 0 ? void 0 : _b[productOldId];
                if (!productId)
                    continue;
                params.push([permitId, productId, 'Opening Balance', qty, 0]);
            }
            if (params.length > 0) {
                for (let i = 0; i < params.length; i += 500) {
                    yield pool.query(`INSERT INTO stock_permit_items (permitId, productId, productName, quantity, cost) VALUES ?`, [params.slice(i, i + 500)]);
                }
                totalItems += params.length;
            }
        }
        console.log(`  ✅ Imported ${totalItems} opening balance items`);
        // ── STEP 2: Recalculate stock using SINGLE unified query ──
        console.log('\n━━━ STEP 2: Recalculate stock (unified query) ━━━');
        yield pool.query('TRUNCATE TABLE product_stocks');
        console.log('  Cleared product_stocks');
        // Single INSERT that combines ALL stock sources using UNION ALL
        const [result] = yield pool.query(`
    INSERT INTO product_stocks (id, productId, warehouseId, stock)
    SELECT UUID(), productId, warehouseId, SUM(stockChange)
    FROM (
      -- Source 1: Invoices
      SELECT 
        il.productId,
        COALESCE(il.warehouseId, i.warehouseId) as warehouseId,
        CASE 
          WHEN i.type IN ('INVOICE_PURCHASE', 'RETURN_SALE') THEN il.quantity
          WHEN i.type IN ('INVOICE_SALE', 'RETURN_PURCHASE') THEN -il.quantity
          ELSE 0
        END as stockChange
      FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoiceId
      WHERE i.status = 'POSTED'
        AND COALESCE(il.warehouseId, i.warehouseId) IS NOT NULL
        AND i.type IN ('INVOICE_SALE','INVOICE_PURCHASE','RETURN_SALE','RETURN_PURCHASE')

      UNION ALL

      -- Source 2: STOCK_PERMIT_IN (add to dest warehouse)
      SELECT spi.productId, sp.destWarehouseId, spi.quantity
      FROM stock_permit_items spi
      JOIN stock_permits sp ON sp.id = spi.permitId
      WHERE sp.type = 'STOCK_PERMIT_IN' AND sp.destWarehouseId IS NOT NULL

      UNION ALL

      -- Source 3: STOCK_PERMIT_OUT (subtract from source warehouse)
      SELECT spi.productId, sp.sourceWarehouseId, -spi.quantity
      FROM stock_permit_items spi
      JOIN stock_permits sp ON sp.id = spi.permitId
      WHERE sp.type = 'STOCK_PERMIT_OUT' AND sp.sourceWarehouseId IS NOT NULL

      UNION ALL

      -- Source 4: STOCK_TRANSFER out (subtract from source)
      SELECT spi.productId, sp.sourceWarehouseId, -spi.quantity
      FROM stock_permit_items spi
      JOIN stock_permits sp ON sp.id = spi.permitId
      WHERE sp.type = 'STOCK_TRANSFER' AND sp.sourceWarehouseId IS NOT NULL

      UNION ALL

      -- Source 5: STOCK_TRANSFER in (add to dest)
      SELECT spi.productId, sp.destWarehouseId, spi.quantity
      FROM stock_permit_items spi
      JOIN stock_permits sp ON sp.id = spi.permitId
      WHERE sp.type = 'STOCK_TRANSFER' AND sp.destWarehouseId IS NOT NULL
    ) AS all_movements
    GROUP BY productId, warehouseId
    HAVING SUM(stockChange) != 0
  `);
        console.log(`  ✅ Inserted ${result.affectedRows} product-warehouse stock entries`);
        // Sync products.stock
        console.log('  Syncing products.stock...');
        const [syncResult] = yield pool.query(`
    UPDATE products p SET p.stock = COALESCE(
      (SELECT SUM(ps.stock) FROM product_stocks ps WHERE ps.productId = p.id), 0
    )
  `);
        console.log(`  ✅ Synced ${syncResult.affectedRows} products`);
        // ── VERIFY ──
        console.log('\n━━━ VERIFICATION ━━━');
        const [verify] = yield pool.query(`
    SELECT COUNT(DISTINCT productId) as products,
      SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) as positive,
      SUM(CASE WHEN stock < 0 THEN 1 ELSE 0 END) as negative,
      SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) as zero
    FROM product_stocks
  `);
        console.log(`  Products: ${verify[0].products}`);
        console.log(`  Positive: ${verify[0].positive} | Negative: ${verify[0].negative} | Zero: ${verify[0].zero}`);
        // Test specific items
        for (const { sku, name } of [
            { sku: '317785', name: 'تبارك مسك 4ق' },
            { sku: '832', name: 'ايبرو قطن ليلي' },
            { sku: '244055', name: 'MR السروجي نازلي 4ق' },
            { sku: '183703', name: 'شيفون زاد' },
        ]) {
            const [rows] = yield pool.query(`
      SELECT ps.stock, w.name FROM product_stocks ps 
      JOIN warehouses w ON w.id = ps.warehouseId 
      WHERE ps.productId = (SELECT id FROM products WHERE sku = ? LIMIT 1)
    `, [sku]);
            console.log(`\n  ${name} (${sku}):`);
            if (rows.length === 0)
                console.log(`    (no stock entries)`);
            rows.forEach((r) => console.log(`    ${r.name}: ${r.stock}`));
        }
        // List remaining negatives
        const [negs] = yield pool.query(`
    SELECT p.sku, p.name, ps.stock, w.name as wh FROM product_stocks ps
    JOIN products p ON p.id = ps.productId
    JOIN warehouses w ON w.id = ps.warehouseId
    WHERE ps.stock < 0 ORDER BY ps.stock ASC LIMIT 10
  `);
        if (negs.length > 0) {
            console.log(`\n  Remaining negatives (top 10):`);
            negs.forEach((r) => console.log(`    ${r.sku} | ${r.wh} | ${r.stock} | ${r.name}`));
        }
        console.log('\n  🎉 Done!');
        yield pool.end();
    });
}
run().catch(e => { console.error(e); process.exit(1); });
