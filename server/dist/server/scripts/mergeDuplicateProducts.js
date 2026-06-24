"use strict";
/**
 * Merge Duplicate Products Script (Fixed)
 * This script finds products with duplicate names and merges them into one,
 * updating all references in related tables.
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
const db_1 = require("../db");
function mergeDuplicateProducts() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log('🔍 Scanning for duplicate products...\n');
        const conn = yield db_1.pool.getConnection();
        try {
            // Find duplicate product names
            const [duplicates] = yield conn.query(`
            SELECT name, COUNT(*) as count, GROUP_CONCAT(id) as ids
            FROM products
            GROUP BY name
            HAVING COUNT(*) > 1
            ORDER BY count DESC
        `);
            const dupList = duplicates;
            if (dupList.length === 0) {
                console.log('✅ No duplicate products found!');
                return;
            }
            console.log(`⚠️  Found ${dupList.length} products with duplicate names:\n`);
            for (const dup of dupList) {
                console.log(`  - "${dup.name}": ${dup.count} duplicates`);
            }
            console.log('\n🔧 Merging duplicates...\n');
            let totalMerged = 0;
            for (const dup of dupList) {
                const ids = dup.ids.split(',');
                const productName = dup.name;
                console.log(`\n📦 Processing: ${productName} (${ids.length} copies)`);
                // Find the "primary" product - the one with the most references
                let primaryId = ids[0];
                let maxReferences = 0;
                for (const id of ids) {
                    // Count references in invoice_lines
                    const [countResult] = yield conn.query('SELECT COUNT(*) as cnt FROM invoice_lines WHERE productId = ?', [id]);
                    const count = ((_a = countResult[0]) === null || _a === void 0 ? void 0 : _a.cnt) || 0;
                    if (count > maxReferences) {
                        maxReferences = count;
                        primaryId = id;
                    }
                }
                console.log(`  ✓ Primary product ID: ${primaryId.substring(0, 8)}... (${maxReferences} invoice references)`);
                // Get non-primary IDs
                const duplicateIds = ids.filter((id) => id !== primaryId);
                if (duplicateIds.length === 0)
                    continue;
                // Process each duplicate one by one with individual transactions
                for (const dupId of duplicateIds) {
                    try {
                        yield conn.beginTransaction();
                        // 1. invoice_lines
                        const [ilResult] = yield conn.query('UPDATE invoice_lines SET productId = ? WHERE productId = ?', [primaryId, dupId]);
                        if (ilResult.affectedRows > 0) {
                            console.log(`    → Moved ${ilResult.affectedRows} invoice lines from ${dupId.substring(0, 8)}...`);
                        }
                        // 2. salesman_targets
                        const [stResult] = yield conn.query('UPDATE salesman_targets SET productId = ? WHERE productId = ?', [primaryId, dupId]);
                        if (stResult.affectedRows > 0) {
                            console.log(`    → Moved ${stResult.affectedRows} salesman targets from ${dupId.substring(0, 8)}...`);
                        }
                        // 3. stock_movements (uses snake_case column names)
                        const [smResult] = yield conn.query('UPDATE stock_movements SET product_id = ? WHERE product_id = ?', [primaryId, dupId]);
                        if (smResult.affectedRows > 0) {
                            console.log(`    → Moved ${smResult.affectedRows} stock movements from ${dupId.substring(0, 8)}...`);
                        }
                        // 4. stock_permit_items
                        const [spiResult] = yield conn.query('UPDATE stock_permit_items SET productId = ? WHERE productId = ?', [primaryId, dupId]);
                        if (spiResult.affectedRows > 0) {
                            console.log(`    → Moved ${spiResult.affectedRows} stock permit items from ${dupId.substring(0, 8)}...`);
                        }
                        // 5. product_stocks - merge by adding stock values
                        const [psRows] = yield conn.query('SELECT * FROM product_stocks WHERE productId = ?', [dupId]);
                        for (const ps of psRows) {
                            yield conn.query(`
                            INSERT INTO product_stocks (id, productId, warehouseId, stock, minStock, maxStock)
                            VALUES (UUID(), ?, ?, ?, 0, 0)
                            ON DUPLICATE KEY UPDATE stock = stock + ?
                        `, [primaryId, ps.warehouseId, ps.stock, ps.stock]);
                        }
                        // Delete duplicate product_stocks
                        yield conn.query('DELETE FROM product_stocks WHERE productId = ?', [dupId]);
                        // 6. price_list_items - delete duplicates
                        yield conn.query('DELETE FROM price_list_items WHERE productId = ?', [dupId]).catch(() => { });
                        // 7. deleted_invoice_lines
                        yield conn.query('UPDATE deleted_invoice_lines SET productId = ? WHERE productId = ?', [primaryId, dupId]).catch(() => { });
                        // Now delete the duplicate product
                        yield conn.query('DELETE FROM products WHERE id = ?', [dupId]);
                        yield conn.commit();
                        console.log(`    ✓ Deleted duplicate: ${dupId.substring(0, 8)}...`);
                        totalMerged++;
                    }
                    catch (error) {
                        yield conn.rollback();
                        console.error(`    ✗ Failed to merge ${dupId.substring(0, 8)}...: ${error.message}`);
                    }
                }
            }
            console.log(`\n🎉 Successfully merged ${totalMerged} duplicate products!`);
            // Show remaining products count
            const [remaining] = yield conn.query('SELECT COUNT(*) as cnt FROM products');
            console.log(`📊 Total products remaining: ${(_b = remaining[0]) === null || _b === void 0 ? void 0 : _b.cnt}`);
        }
        catch (error) {
            console.error('❌ Error merging products:', error);
            throw error;
        }
        finally {
            conn.release();
            yield db_1.pool.end();
        }
    });
}
// Run the script
mergeDuplicateProducts().catch(console.error);
