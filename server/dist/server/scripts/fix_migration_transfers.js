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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Fix Duplicate/Orphan Stock Transfer Movements from Migration
 *
 * Problem: Migration created TRANSFER_IN/OUT records between warehouses,
 * but all invoices (purchase/sale) have warehouseId=NULL (defaulting to main warehouse).
 * This causes:
 *   - Main warehouse with inflated stock (receiving transfers that shouldn't exist)
 *   - Old warehouses with negative stock (sending transfers from empty stock)
 *
 * Fix: Delete migration-created transfer movements and recalculate product_stocks.
 */
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const p = yield promise_1.default.createPool({
            host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
        const DRY_RUN = process.argv.includes('--execute') ? false : true;
        if (DRY_RUN) {
            console.log('🔍 DRY RUN MODE — pass --execute to apply changes');
        }
        else {
            console.log('🚀 EXECUTE MODE — changes will be applied!');
        }
        // 1. Identify migration transfer movements (ones with "تم إعادة بناء الحركة" in notes)
        const [migrationTransfers] = yield p.query(`
    SELECT id, product_id, warehouse_id, qty_change, movement_type, 
           DATE_FORMAT(movement_date, '%Y-%m-%d') as dt, LEFT(notes, 60) as notes
    FROM stock_movements
    WHERE movement_type IN ('TRANSFER_IN', 'TRANSFER_OUT')
      AND notes LIKE '%تم إعادة بناء الحركة%'
    ORDER BY movement_date, id
  `);
        console.log(`\n📊 Migration transfer movements found: ${migrationTransfers.length}`);
        // Count affected products
        const affectedProducts = new Set(migrationTransfers.map((m) => m.product_id));
        console.log(`📦 Affected products: ${affectedProducts.size}`);
        // Show first 10 as sample
        console.log('\nSample (first 10):');
        migrationTransfers.slice(0, 10).forEach((m) => {
            console.log(`  ID=${m.id} | ${m.dt} | ${m.movement_type} | qty=${m.qty_change} | ${m.notes}`);
        });
        // 2. Also find duplicate transfers (not migration-notes but exact duplicates)
        const [dupeTransfers] = yield p.query(`
    SELECT GROUP_CONCAT(id ORDER BY id) as ids, product_id, warehouse_id, movement_type, 
           movement_date, qty_change, COUNT(*) as cnt
    FROM stock_movements
    WHERE movement_type IN ('TRANSFER_IN', 'TRANSFER_OUT')
    GROUP BY product_id, warehouse_id, movement_type, movement_date, qty_change, reference_id
    HAVING COUNT(*) > 1
  `);
        const dupeIdsToDelete = [];
        dupeTransfers.forEach((d) => {
            const ids = d.ids.split(',').map(Number);
            // Keep first, mark rest for deletion
            ids.slice(1).forEach((id) => dupeIdsToDelete.push(id));
        });
        console.log(`\n🔄 Duplicate transfer rows: ${dupeIdsToDelete.length} (from ${dupeTransfers.length} groups)`);
        // 3. Also find duplicate adjustments
        const [dupeAdj] = yield p.query(`
    SELECT GROUP_CONCAT(id ORDER BY id) as ids, product_id, warehouse_id, movement_type,
           movement_date, qty_change, COUNT(*) as cnt
    FROM stock_movements
    WHERE movement_type = 'ADJUSTMENT'
    GROUP BY product_id, warehouse_id, movement_type, movement_date, qty_change, reference_id
    HAVING COUNT(*) > 1
  `);
        const adjIdsToDelete = [];
        dupeAdj.forEach((d) => {
            const ids = d.ids.split(',').map(Number);
            ids.slice(1).forEach((id) => adjIdsToDelete.push(id));
        });
        console.log(`📐 Duplicate adjustment rows: ${adjIdsToDelete.length} (from ${dupeAdj.length} groups)`);
        if (DRY_RUN) {
            console.log(`\n✋ DRY RUN — would delete:`);
            console.log(`   ${migrationTransfers.length} migration transfer movements`);
            console.log(`   ${dupeIdsToDelete.length} duplicate transfer movements`);
            console.log(`   ${adjIdsToDelete.length} duplicate adjustment movements`);
            console.log(`   Then recalculate product_stocks for all affected products`);
            console.log(`\n🏃 Run with --execute to apply`);
            yield p.end();
            return;
        }
        // === EXECUTE ===
        const conn = yield p.getConnection();
        yield conn.beginTransaction();
        try {
            // Delete migration transfers
            if (migrationTransfers.length > 0) {
                const migIds = migrationTransfers.map((m) => m.id);
                yield conn.query(`DELETE FROM stock_movements WHERE id IN (?)`, [migIds]);
                console.log(`✅ Deleted ${migIds.length} migration transfer movements`);
            }
            // Delete duplicate transfers
            if (dupeIdsToDelete.length > 0) {
                yield conn.query(`DELETE FROM stock_movements WHERE id IN (?)`, [dupeIdsToDelete]);
                console.log(`✅ Deleted ${dupeIdsToDelete.length} duplicate transfer movements`);
            }
            // Delete duplicate adjustments
            if (adjIdsToDelete.length > 0) {
                yield conn.query(`DELETE FROM stock_movements WHERE id IN (?)`, [adjIdsToDelete]);
                console.log(`✅ Deleted ${adjIdsToDelete.length} duplicate adjustment movements`);
            }
            // Recalculate product_stocks from remaining stock_movements
            console.log('\n🔄 Recalculating product_stocks...');
            // Get all affected product IDs
            const allAffectedProducts = new Set();
            migrationTransfers.forEach((m) => allAffectedProducts.add(m.product_id));
            dupeTransfers.forEach((d) => allAffectedProducts.add(d.product_id));
            dupeAdj.forEach((d) => allAffectedProducts.add(d.product_id));
            // For each affected product, recalculate stock from movements
            let updatedCount = 0;
            for (const prodId of allAffectedProducts) {
                // Get correct balances from stock_movements
                const [balances] = yield conn.query(`
        SELECT warehouse_id, SUM(qty_change) as balance
        FROM stock_movements WHERE product_id = ?
        GROUP BY warehouse_id
      `, [prodId]);
                // Update product_stocks
                for (const bal of balances) {
                    yield conn.query(`
          UPDATE product_stocks SET stock = ?, lastUpdated = NOW()
          WHERE productId = ? AND warehouseId = ?
        `, [bal.balance, prodId, bal.warehouse_id]);
                    updatedCount++;
                }
                // Delete product_stocks rows for warehouses with no remaining movements
                const warehouseIds = balances.map((b) => b.warehouse_id);
                if (warehouseIds.length > 0) {
                    const [orphanStocks] = yield conn.query(`
          SELECT id, warehouseId FROM product_stocks 
          WHERE productId = ? AND warehouseId NOT IN (?)
        `, [prodId, warehouseIds]);
                    for (const orphan of orphanStocks) {
                        // Set stock to 0 for warehouses with no movements
                        yield conn.query(`UPDATE product_stocks SET stock = 0, lastUpdated = NOW() WHERE id = ?`, [orphan.id]);
                    }
                }
            }
            console.log(`✅ Updated ${updatedCount} product_stocks records for ${allAffectedProducts.size} products`);
            yield conn.commit();
            console.log('\n🎉 All changes committed successfully!');
            // Verify sample product
            console.log('\n=== VERIFICATION: جوفيا دبل فيس SHADA ===');
            const [verify] = yield p.query(`
      SELECT ps.warehouseId, w.name, ps.stock FROM product_stocks ps
      JOIN warehouses w ON w.id = ps.warehouseId
      WHERE ps.productId = '0228b869-4bfc-4be4-a468-1bd5460154ed'
    `);
            verify.forEach((v) => console.log(`  ${v.name}: ${v.stock}`));
        }
        catch (error) {
            yield conn.rollback();
            console.error('❌ Error — rolled back:', error);
        }
        finally {
            conn.release();
        }
        yield p.end();
    });
}
run().catch(e => { console.error(e); process.exit(1); });
