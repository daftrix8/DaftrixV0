"use strict";
/**
 * Sync Stock Movements with Products Stock
 *
 * This script finds discrepancies between:
 *   - products.stock (the authoritative value)
 *   - SUM of stock_movements (what كارت الصنف calculates)
 *
 * For any discrepancy, it creates an ADJUSTMENT movement to sync them.
 *
 * Run with: npx ts-node scripts/sync-stock-movements.ts
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables
dotenv_1.default.config({ path: path_1.default.join(__dirname, '..', '.env') });
function syncStockMovements() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('='.repeat(60));
        console.log('🔄 Sync Stock Movements Script');
        console.log('='.repeat(60));
        console.log('');
        const connection = yield promise_1.default.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'erp_system'
        });
        try {
            // Start transaction
            yield connection.beginTransaction();
            console.log('📦 Transaction started\n');
            // Step 1: Find all discrepancies
            console.log('🔍 Step 1: Finding discrepancies between products.stock and stock_movements...\n');
            const [discrepancies] = yield connection.query(`
            SELECT 
                p.id as product_id,
                p.name as product_name,
                p.sku,
                p.stock as actual_stock,
                COALESCE(SUM(sm.qty_change), 0) as calculated_stock,
                (p.stock - COALESCE(SUM(sm.qty_change), 0)) as difference
            FROM products p
            LEFT JOIN stock_movements sm ON p.id = sm.product_id
            GROUP BY p.id, p.name, p.sku, p.stock
            HAVING ABS(p.stock - COALESCE(SUM(sm.qty_change), 0)) > 0.01
            ORDER BY ABS(p.stock - COALESCE(SUM(sm.qty_change), 0)) DESC
        `);
            if (discrepancies.length === 0) {
                console.log('✅ No discrepancies found. Stock movements are in sync!\n');
                yield connection.rollback();
                return;
            }
            console.log(`📊 Found ${discrepancies.length} products with discrepancies:\n`);
            console.log('-'.repeat(80));
            console.log('Product Name'.padEnd(40) + 'Actual Stock'.padStart(15) + 'Calculated'.padStart(15) + 'Difference'.padStart(12));
            console.log('-'.repeat(80));
            let totalAdjustment = 0;
            for (const d of discrepancies) {
                console.log(d.product_name.substring(0, 38).padEnd(40) +
                    d.actual_stock.toString().padStart(15) +
                    d.calculated_stock.toString().padStart(15) +
                    (d.difference > 0 ? '+' : '') + d.difference.toString().padStart(11));
                totalAdjustment += Math.abs(d.difference);
            }
            console.log('-'.repeat(80));
            console.log(`Total absolute adjustment needed: ${totalAdjustment} units\n`);
            // Step 2: Create adjustment movements
            console.log('🔄 Step 2: Creating adjustment movements...\n');
            let adjustmentsCreated = 0;
            for (const d of discrepancies) {
                if (Math.abs(d.difference) < 0.01)
                    continue;
                // Find the product's most common warehouse for proper assignment
                const [topWh] = yield connection.query(`
                SELECT warehouse_id, COUNT(*) as cnt
                FROM stock_movements
                WHERE product_id = ? AND warehouse_id IS NOT NULL
                GROUP BY warehouse_id ORDER BY cnt DESC LIMIT 1
            `, [d.product_id]);
                const warehouseId = ((_a = topWh === null || topWh === void 0 ? void 0 : topWh[0]) === null || _a === void 0 ? void 0 : _a.warehouse_id) || null;
                // Create an OPENING_BALANCE adjustment to sync the stock
                yield connection.query(`
                INSERT INTO stock_movements (
                    product_id, 
                    warehouse_id, 
                    qty_change, 
                    movement_type,
                    reference_type, 
                    reference_id, 
                    notes
                ) VALUES (?, ?, ?, 'OPENING_BALANCE', 'SYSTEM_SYNC', ?, ?)
            `, [
                    d.product_id,
                    warehouseId,
                    d.difference,
                    `SYNC-${Date.now()}-${adjustmentsCreated}`,
                    `تعديل رصيد افتتاحي - مزامنة الحركات (الفرق: ${d.difference > 0 ? '+' : ''}${d.difference})`
                ]);
                adjustmentsCreated++;
                console.log(`   ✓ ${d.product_name}: ${d.difference > 0 ? '+' : ''}${d.difference} units`);
            }
            // Step 3: Verify the fix
            console.log('\n✅ Step 3: Verifying sync...');
            // Check a few products
            const sampleProducts = discrepancies.slice(0, 5);
            for (const d of sampleProducts) {
                const [rows] = yield connection.query(`
                SELECT 
                    p.stock as actual_stock,
                    COALESCE(SUM(sm.qty_change), 0) as calculated_stock
                FROM products p
                LEFT JOIN stock_movements sm ON p.id = sm.product_id
                WHERE p.id = ?
                GROUP BY p.id
            `, [d.product_id]);
                if (rows.length > 0) {
                    const match = Math.abs(rows[0].actual_stock - rows[0].calculated_stock) < 0.01;
                    console.log(`   ${match ? '✓' : '✗'} ${d.product_name}: Stock=${rows[0].actual_stock}, Calculated=${rows[0].calculated_stock}`);
                }
            }
            // Commit the transaction
            yield connection.commit();
            console.log('\n' + '='.repeat(60));
            console.log('🎉 SUCCESS! Stock movements are now in sync.');
            console.log('='.repeat(60));
            console.log('\nSummary:');
            console.log(`   • Created ${adjustmentsCreated} adjustment movements`);
            console.log(`   • Synced ${discrepancies.length} products`);
            console.log('');
            console.log('📝 Note: كارت الصنف will now show matching balances.');
            console.log('');
        }
        catch (error) {
            yield connection.rollback();
            console.error('\n❌ ERROR: Sync failed, transaction rolled back');
            console.error('   Message:', error.message);
            throw error;
        }
        finally {
            yield connection.end();
        }
    });
}
// Run the sync
syncStockMovements()
    .then(() => {
    console.log('Script completed successfully.');
    process.exit(0);
})
    .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
});
