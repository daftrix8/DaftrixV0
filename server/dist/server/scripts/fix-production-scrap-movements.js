"use strict";
/**
 * Fix Production Scrap Movements Script
 *
 * This script reverses the incorrect SCRAP movements that were created
 * from production orders. The old logic was:
 *   1. Add qtyFinished to inventory (PRODUCTION_OUTPUT)
 *   2. Subtract qtyScrapped from inventory (SCRAP)
 *
 * The new logic only adds (qtyFinished - qtyScrapped) to inventory.
 *
 * This script will:
 *   1. Find all SCRAP movements from PRODUCTION_ORDER
 *   2. Reverse their effect on products.stock
 *   3. Reverse their effect on product_stocks table
 *   4. Delete the incorrect SCRAP movements
 *
 * Run with: npx ts-node scripts/fix-production-scrap-movements.ts
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
function fixProductionScrapMovements() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('='.repeat(60));
        console.log('🔧 Fix Production Scrap Movements Script');
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
            // Step 1: Find all incorrect SCRAP movements from production orders
            console.log('🔍 Step 1: Finding incorrect SCRAP movements...');
            const [scrapMovements] = yield connection.query(`
            SELECT 
                sm.id,
                sm.product_id,
                sm.warehouse_id,
                sm.qty_change,
                sm.reference_id,
                sm.notes,
                sm.movement_date,
                p.name as product_name,
                p.stock as current_stock
            FROM stock_movements sm
            LEFT JOIN products p ON sm.product_id = p.id
            WHERE sm.movement_type = 'SCRAP'
              AND sm.reference_type = 'PRODUCTION_ORDER'
            ORDER BY sm.movement_date DESC
        `);
            if (scrapMovements.length === 0) {
                console.log('✅ No incorrect SCRAP movements found. Database is clean!\n');
                yield connection.rollback();
                return;
            }
            console.log(`📊 Found ${scrapMovements.length} incorrect SCRAP movements to fix:\n`);
            // Display summary
            let totalScrapQty = 0;
            const productSummary = {};
            for (const movement of scrapMovements) {
                totalScrapQty += Math.abs(movement.qty_change);
                if (!productSummary[movement.product_id]) {
                    productSummary[movement.product_id] = {
                        name: movement.product_name,
                        qty: 0
                    };
                }
                productSummary[movement.product_id].qty += Math.abs(movement.qty_change);
            }
            console.log('📋 Summary by product:');
            console.log('-'.repeat(50));
            for (const [productId, info] of Object.entries(productSummary)) {
                console.log(`   ${info.name}: ${info.qty} units to restore`);
            }
            console.log('-'.repeat(50));
            console.log(`   TOTAL: ${totalScrapQty} units\n`);
            // Step 2: Reverse the stock changes
            console.log('🔄 Step 2: Reversing stock changes...');
            for (const movement of scrapMovements) {
                // The qty_change for SCRAP movements is negative (e.g., -244)
                // We need to ADD back this quantity to fix the stock
                const qtyToRestore = Math.abs(movement.qty_change);
                // Update global product stock
                yield connection.query('UPDATE products SET stock = stock + ? WHERE id = ?', [qtyToRestore, movement.product_id]);
                // Update warehouse-level product_stocks if warehouse exists
                if (movement.warehouse_id) {
                    yield connection.query(`
                    UPDATE product_stocks 
                    SET stock = stock + ? 
                    WHERE productId = ? AND warehouseId = ?
                `, [qtyToRestore, movement.product_id, movement.warehouse_id]);
                }
                console.log(`   ✓ Restored ${qtyToRestore} units to ${movement.product_name}`);
            }
            // Step 3: Delete the incorrect SCRAP movements
            console.log('\n🗑️  Step 3: Deleting incorrect SCRAP movements...');
            const movementIds = scrapMovements.map((m) => m.id);
            yield connection.query(`DELETE FROM stock_movements WHERE id IN (?)`, [movementIds]);
            console.log(`   ✓ Deleted ${movementIds.length} SCRAP movement records\n`);
            // Step 4: Verify the fix
            console.log('✅ Step 4: Verifying fix...');
            for (const [productId, info] of Object.entries(productSummary)) {
                const [rows] = yield connection.query('SELECT stock FROM products WHERE id = ?', [productId]);
                if (rows.length > 0) {
                    console.log(`   ${info.name}: New stock = ${rows[0].stock}`);
                }
            }
            // Commit the transaction
            yield connection.commit();
            console.log('\n' + '='.repeat(60));
            console.log('🎉 SUCCESS! All incorrect SCRAP movements have been fixed.');
            console.log('='.repeat(60));
            console.log('\nSummary:');
            console.log(`   • Fixed ${scrapMovements.length} incorrect movements`);
            console.log(`   • Restored ${totalScrapQty} units to inventory`);
            console.log(`   • Affected ${Object.keys(productSummary).length} products`);
            console.log('');
        }
        catch (error) {
            yield connection.rollback();
            console.error('\n❌ ERROR: Fix failed, transaction rolled back');
            console.error('   Message:', error.message);
            throw error;
        }
        finally {
            yield connection.end();
        }
    });
}
// Run the fix
fixProductionScrapMovements()
    .then(() => {
    console.log('Script completed successfully.');
    process.exit(0);
})
    .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
});
