"use strict";
/**
 * sync-production-stock.ts
 *
 * This script syncs the product_stocks table with production movements
 * that may have only updated the global products.stock but not warehouse-level stock.
 *
 * Run with: npx ts-node sync-production-stock.ts
 * Or after compilation: node dist/server/sync-production-stock.js
 */
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
exports.syncProductionStock = syncProductionStock;
const db_1 = require("./db");
const crypto_1 = require("crypto");
function syncProductionStock() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const connection = yield db_1.pool.getConnection();
        try {
            console.log('🔄 Starting production stock sync...\n');
            yield connection.beginTransaction();
            // Step 1: Get all production movements with warehouse
            console.log('📊 Analyzing production movements...');
            const [movements] = yield connection.query(`
            SELECT 
                sm.product_id,
                sm.warehouse_id,
                sm.movement_type,
                SUM(sm.qty_change) as total_change
            FROM stock_movements sm
            WHERE sm.movement_type IN ('PRODUCTION_USE', 'PRODUCTION_OUTPUT')
              AND sm.warehouse_id IS NOT NULL
            GROUP BY sm.product_id, sm.warehouse_id, sm.movement_type
        `);
            console.log(`   Found ${movements.length} product-warehouse-type combinations\n`);
            if (movements.length === 0) {
                console.log('✅ No production movements to sync!');
                yield connection.commit();
                return;
            }
            // Step 2: Get current product_stocks state
            const [currentStocks] = yield connection.query(`
            SELECT productId, warehouseId, stock 
            FROM product_stocks
        `);
            const stockMap = new Map();
            for (const stock of currentStocks) {
                stockMap.set(`${stock.productId}-${stock.warehouseId}`, parseFloat(stock.stock) || 0);
            }
            // Step 3: Calculate expected stock from movements
            const expectedChanges = new Map();
            for (const movement of movements) {
                const key = `${movement.product_id}-${movement.warehouse_id}`;
                const current = expectedChanges.get(key) || 0;
                expectedChanges.set(key, current + parseFloat(movement.total_change));
            }
            // Step 4: Sync each product-warehouse combination
            let synced = 0;
            let created = 0;
            let skipped = 0;
            console.log('🔧 Syncing product stocks...\n');
            for (const [key, expectedChange] of expectedChanges) {
                const [productId, warehouseId] = key.split('-');
                // Check if product_stocks record exists
                const [existing] = yield connection.query('SELECT id, stock FROM product_stocks WHERE productId = ? AND warehouseId = ?', [productId, warehouseId]);
                if (existing.length === 0) {
                    // Create new record - but we need to get the global product stock first
                    const [productRow] = yield connection.query('SELECT stock FROM products WHERE id = ?', [productId]);
                    const globalStock = ((_a = productRow[0]) === null || _a === void 0 ? void 0 : _a.stock) || 0;
                    // Create product_stocks entry with current global stock
                    // (The production changes are already reflected in global stock)
                    yield connection.query('INSERT INTO product_stocks (id, productId, warehouseId, stock) VALUES (?, ?, ?, ?)', [(0, crypto_1.randomUUID)(), productId, warehouseId, globalStock]);
                    console.log(`   ➕ Created stock record: Product ${productId.substring(0, 8)}... @ Warehouse ${warehouseId.substring(0, 8)}... = ${globalStock}`);
                    created++;
                }
                else {
                    // Record exists, skip (we assume if it exists it's already tracked)
                    skipped++;
                }
            }
            // Step 5: Recalculate global product stock from product_stocks
            console.log('\n📈 Verifying global stock totals...\n');
            const [stockTotals] = yield connection.query(`
            SELECT productId, SUM(stock) as total_stock
            FROM product_stocks
            GROUP BY productId
        `);
            for (const row of stockTotals) {
                const [productRow] = yield connection.query('SELECT stock FROM products WHERE id = ?', [row.productId]);
                const globalStock = parseFloat((_b = productRow[0]) === null || _b === void 0 ? void 0 : _b.stock) || 0;
                const warehouseTotal = parseFloat(row.total_stock) || 0;
                if (Math.abs(globalStock - warehouseTotal) > 0.001) {
                    console.log(`   ⚠️  Product ${row.productId.substring(0, 8)}...: Global=${globalStock}, Warehouses=${warehouseTotal}, Diff=${globalStock - warehouseTotal}`);
                }
            }
            yield connection.commit();
            console.log('\n' + '='.repeat(50));
            console.log('✅ Production stock sync completed!');
            console.log(`   Created: ${created} records`);
            console.log(`   Skipped: ${skipped} (already exist)`);
            console.log('='.repeat(50) + '\n');
        }
        catch (error) {
            yield connection.rollback();
            console.error('❌ Error syncing production stock:', error);
            throw error;
        }
        finally {
            connection.release();
        }
    });
}
// Run if called directly
syncProductionStock()
    .then(() => {
    console.log('Script completed successfully.');
    process.exit(0);
})
    .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
});
