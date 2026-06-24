"use strict";
/**
 * SYNC: Recalculate ALL Product Stock from Invoice Lines
 *
 * After fresh migration, the products.stock and product_stocks tables are empty
 * because historical invoices only exist in invoice_lines, not stock_movements.
 *
 * This script:
 * 1. Calculates net stock for each product from invoice_lines (POSTED invoices)
 * 2. Adds stock_movements adjustments if any exist
 * 3. Adds stock_permits adjustments if any exist
 * 4. Updates products.stock with the calculated total
 * 5. Updates product_stocks per warehouse
 */
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
const promise_1 = __importDefault(require("mysql2/promise"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n══════════════════════════════════════════════');
        console.log('  📦 SYNC: Recalculate ALL Product Stock');
        console.log('══════════════════════════════════════════════\n');
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const conn = yield pool.getConnection();
        try {
            // Step 1: Calculate stock from invoice_lines
            console.log('  📊 Step 1: Calculating stock from invoice_lines...');
            const [invoiceStock] = yield conn.query(`
      SELECT 
        il.productId,
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
      GROUP BY il.productId, COALESCE(il.warehouseId, i.warehouseId)
    `);
            console.log(`     Found stock data for ${invoiceStock.length} product-warehouse combos`);
            // Step 2: Calculate from stock_movements (ONLY production/manual - NOT invoice or permit entries)
            // Invoice movements are already counted in Step 1 via invoice_lines
            // Permit movements are counted in Step 3 via stock_permits
            console.log('  📊 Step 2: Adding production/manual adjustments from stock_movements...');
            const [movementStock] = yield conn.query(`
      SELECT 
        product_id as productId,
        warehouse_id as warehouseId,
        SUM(qty_change) as netQty
      FROM stock_movements
      WHERE movement_type IN ('PRODUCTION_USE', 'PRODUCTION_OUTPUT', 'OPENING_BALANCE')
        AND reference_type NOT IN ('SYSTEM_ADJUSTMENT')
      GROUP BY product_id, warehouse_id
    `);
            console.log(`     Found ${movementStock.length} movement records`);
            // Step 3: Calculate from stock_permits (historical ones not in stock_movements)
            console.log('  📊 Step 3: Adding stock_permits adjustments...');
            const [permitStock] = yield conn.query(`
      SELECT 
        spi.productId,
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
      WHERE NOT EXISTS (
        SELECT 1 FROM stock_movements sm 
        WHERE sm.reference_id = sp.id 
          AND sm.product_id = spi.productId
          AND sm.reference_type IN ('STOCK_PERMIT_IN', 'STOCK_PERMIT_OUT', 'STOCK_TRANSFER', 'ADJUSTMENT')
      )
      GROUP BY spi.productId, 
        CASE 
          WHEN sp.type = 'STOCK_PERMIT_IN' THEN sp.destWarehouseId
          WHEN sp.type = 'STOCK_PERMIT_OUT' THEN sp.sourceWarehouseId
          ELSE NULL
        END
    `);
            console.log(`     Found ${permitStock.length} historical permit records`);
            // Step 4: Merge all stock data
            console.log('  📊 Step 4: Merging and calculating final stock...');
            // Global stock per product
            const globalStock = new Map();
            // Per warehouse stock
            const warehouseStock = new Map(); // key: productId:warehouseId
            // Process invoice stock
            for (const row of invoiceStock) {
                const pid = row.productId;
                const whId = row.warehouseId;
                const qty = Number(row.netQty) || 0;
                globalStock.set(pid, (globalStock.get(pid) || 0) + qty);
                if (whId) {
                    const key = `${pid}:${whId}`;
                    warehouseStock.set(key, (warehouseStock.get(key) || 0) + qty);
                }
            }
            // Process stock_movements
            for (const row of movementStock) {
                const pid = row.productId;
                const whId = row.warehouseId;
                const qty = Number(row.netQty) || 0;
                globalStock.set(pid, (globalStock.get(pid) || 0) + qty);
                if (whId) {
                    const key = `${pid}:${whId}`;
                    warehouseStock.set(key, (warehouseStock.get(key) || 0) + qty);
                }
            }
            // Process permits
            for (const row of permitStock) {
                const pid = row.productId;
                const whId = row.warehouseId;
                const qty = Number(row.netQty) || 0;
                globalStock.set(pid, (globalStock.get(pid) || 0) + qty);
                if (whId) {
                    const key = `${pid}:${whId}`;
                    warehouseStock.set(key, (warehouseStock.get(key) || 0) + qty);
                }
            }
            // Step 5: Update products.stock
            console.log('  📝 Step 5: Updating products.stock...');
            let updatedCount = 0;
            // First reset ALL products to 0
            yield conn.query('UPDATE products SET stock = 0');
            for (const [productId, stock] of globalStock) {
                const roundedStock = Math.round(stock * 100) / 100;
                yield conn.query('UPDATE products SET stock = ? WHERE id = ?', [roundedStock, productId]);
                updatedCount++;
            }
            console.log(`     Updated ${updatedCount} products`);
            // Step 6: Update product_stocks per warehouse
            console.log('  📝 Step 6: Updating product_stocks per warehouse...');
            // Reset all warehouse stocks to 0
            yield conn.query('UPDATE product_stocks SET stock = 0');
            let whUpdated = 0;
            for (const [key, stock] of warehouseStock) {
                const [productId, warehouseId] = key.split(':');
                const roundedStock = Math.round(stock * 100) / 100;
                yield conn.query(`
        INSERT INTO product_stocks (id, productId, warehouseId, stock)
        VALUES (UUID(), ?, ?, ?)
        ON DUPLICATE KEY UPDATE stock = ?
      `, [productId, warehouseId, roundedStock, roundedStock]);
                whUpdated++;
            }
            console.log(`     Updated ${whUpdated} warehouse-product records`);
            // Show summary
            const nonZero = [...globalStock.values()].filter(v => Math.abs(v) > 0.01).length;
            const positive = [...globalStock.values()].filter(v => v > 0.01).length;
            const negative = [...globalStock.values()].filter(v => v < -0.01).length;
            console.log('\n══════════════════════════════════════════════');
            console.log('  📊 RESULTS');
            console.log('══════════════════════════════════════════════');
            console.log(`  ✅ Products updated:         ${updatedCount}`);
            console.log(`  📦 With non-zero stock:      ${nonZero}`);
            console.log(`  📈 Positive stock:           ${positive}`);
            console.log(`  📉 Negative stock:           ${negative}`);
            console.log(`  🏭 Warehouse records:        ${whUpdated}`);
            // Show top 10 products by stock
            const sorted = [...globalStock.entries()]
                .filter(([, v]) => Math.abs(v) > 0.01)
                .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                .slice(0, 10);
            if (sorted.length > 0) {
                console.log('\n  📝 Top products by stock:');
                const [names] = yield conn.query(`SELECT id, name FROM products WHERE id IN (${sorted.map(() => '?').join(',')})`, sorted.map(s => s[0]));
                const nameMap = new Map(names.map((n) => [n.id, n.name]));
                sorted.forEach(([id, stock]) => {
                    const pName = String(nameMap.get(id) || id);
                    console.log(`     ${pName.substring(0, 40).padEnd(40)} → ${stock > 0 ? '+' : ''}${stock.toFixed(2)}`);
                });
            }
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
