"use strict";
/**
 * STOCK DISCREPANCY DIAGNOSTIC SCRIPT
 *
 * This script identifies the exact source of stock balance differences.
 *
 * Usage: npx ts-node server/diagnose-stock-discrepancy.ts <SKU or Product Name>
 * Example: npx ts-node server/diagnose-stock-discrepancy.ts 1002
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
const promise_1 = require("mysql2/promise");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = (0, promise_1.createPool)({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
function diagnoseStockDiscrepancy(searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield pool.getConnection();
        try {
            console.log('\n' + '='.repeat(80));
            console.log('📊 STOCK DISCREPANCY DIAGNOSTIC REPORT');
            console.log('='.repeat(80));
            console.log(`Search Term: ${searchTerm}`);
            console.log(`Timestamp: ${new Date().toISOString()}`);
            console.log('='.repeat(80) + '\n');
            // Step 1: Find the product
            const [products] = yield conn.query(`
            SELECT id, name, sku, stock 
            FROM products 
            WHERE sku LIKE ? OR name LIKE ?
            LIMIT 5
        `, [`%${searchTerm}%`, `%${searchTerm}%`]);
            if (products.length === 0) {
                console.log('❌ No products found matching:', searchTerm);
                return;
            }
            for (const product of products) {
                console.log('\n' + '-'.repeat(80));
                console.log(`🔍 PRODUCT: ${product.name}`);
                console.log(`   SKU: ${product.sku}`);
                console.log(`   ID: ${product.id}`);
                console.log(`   Global Stock (products.stock): ${product.stock}`);
                console.log('-'.repeat(80));
                const productId = product.id;
                // Step 2: Get product_stocks values
                const [productStocks] = yield conn.query(`
                SELECT ps.warehouseId, w.name as warehouseName, ps.stock
                FROM product_stocks ps
                LEFT JOIN warehouses w ON ps.warehouseId = w.id
                WHERE ps.productId = ?
            `, [productId]);
                console.log('\n📦 product_stocks (what رصيد المخزن shows):');
                let totalProductStocks = 0;
                if (productStocks.length === 0) {
                    console.log('   (No entries in product_stocks)');
                }
                else {
                    for (const ps of productStocks) {
                        console.log(`   • ${ps.warehouseName || 'UNKNOWN WAREHOUSE'}: ${ps.stock}`);
                        totalProductStocks += parseFloat(ps.stock) || 0;
                    }
                }
                console.log(`   TOTAL: ${totalProductStocks}`);
                // Step 3: Calculate from stock_movements
                const [movementsSummary] = yield conn.query(`
                SELECT movement_type, reference_type, COUNT(*) as count, SUM(qty_change) as total
                FROM stock_movements
                WHERE product_id = ?
                GROUP BY movement_type, reference_type
            `, [productId]);
                console.log('\n📈 stock_movements breakdown:');
                let totalFromMovements = 0;
                for (const m of movementsSummary) {
                    const skip = m.movement_type === 'SALE' && m.reference_type === 'VAN_SALE';
                    const total = parseFloat(m.total) || 0;
                    if (!skip)
                        totalFromMovements += total;
                    console.log(`   • ${m.movement_type} (${m.reference_type || 'N/A'}): ${m.count} records, total: ${total}${skip ? ' [EXCLUDED - Van Sale]' : ''}`);
                }
                console.log(`   CALCULATED TOTAL: ${totalFromMovements}`);
                // Step 4: Calculate from historical invoice_lines
                const [invoiceSummary] = yield conn.query(`
                SELECT i.type, COUNT(*) as count,
                    SUM(CASE 
                        WHEN i.type = 'INVOICE_PURCHASE' THEN il.quantity
                        WHEN i.type = 'RETURN_SALE' THEN il.quantity
                        WHEN i.type = 'INVOICE_SALE' THEN -il.quantity
                        WHEN i.type = 'RETURN_PURCHASE' THEN -il.quantity
                        ELSE 0 
                    END) as net_change
                FROM invoice_lines il
                JOIN invoices i ON il.invoiceId = i.id
                WHERE il.productId = ?
                  AND i.status NOT IN ('DRAFT', 'CANCELLED', 'VOID')
                  AND NOT EXISTS (
                      SELECT 1 FROM stock_movements sm 
                      WHERE sm.reference_id = i.id 
                        AND sm.product_id = il.productId
                        AND sm.reference_type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE')
                  )
                GROUP BY i.type
            `, [productId]);
                console.log('\n📄 Historical invoice_lines (WITHOUT stock_movements):');
                let totalFromInvoices = 0;
                if (invoiceSummary.length === 0) {
                    console.log('   (No historical invoices without stock_movements)');
                }
                else {
                    for (const inv of invoiceSummary) {
                        const net = parseFloat(inv.net_change) || 0;
                        totalFromInvoices += net;
                        console.log(`   • ${inv.type}: ${inv.count} records, net change: ${net}`);
                    }
                }
                console.log(`   CALCULATED TOTAL: ${totalFromInvoices}`);
                // Step 5: Calculate from stock_permits
                const [permitSummary] = yield conn.query(`
                SELECT sp.type, COUNT(DISTINCT sp.id) as count,
                    SUM(CASE 
                        WHEN sp.type = 'STOCK_PERMIT_IN' THEN spi.quantity
                        WHEN sp.type = 'STOCK_PERMIT_OUT' THEN -spi.quantity
                        ELSE 0 
                    END) as net_change
                FROM stock_permit_items spi
                JOIN stock_permits sp ON spi.permitId = sp.id
                WHERE spi.productId = ?
                GROUP BY sp.type
            `, [productId]);
                console.log('\n📋 stock_permits breakdown:');
                let totalFromPermits = 0;
                if (permitSummary.length === 0) {
                    console.log('   (No stock permits)');
                }
                else {
                    for (const p of permitSummary) {
                        const net = parseFloat(p.net_change) || 0;
                        totalFromPermits += net;
                        console.log(`   • ${p.type}: ${p.count} permits, net change: ${net}`);
                    }
                }
                console.log(`   CALCULATED TOTAL: ${totalFromPermits}`);
                // Step 6: DISCREPANCY ANALYSIS
                const correctTotal = totalFromMovements + totalFromInvoices + totalFromPermits;
                const discrepancy = totalProductStocks - correctTotal;
                console.log('\n' + '='.repeat(80));
                console.log('⚠️  DISCREPANCY ANALYSIS');
                console.log('='.repeat(80));
                console.log(`   product_stocks shows:        ${totalProductStocks}`);
                console.log(`   stock_movements total:       ${totalFromMovements}`);
                console.log(`   Historical invoices total:   ${totalFromInvoices}`);
                console.log(`   Stock permits total:         ${totalFromPermits}`);
                console.log(`   ─────────────────────────────────────`);
                console.log(`   CORRECT TOTAL:               ${correctTotal}`);
                console.log(`   ─────────────────────────────────────`);
                if (discrepancy !== 0) {
                    console.log(`   🔴 DISCREPANCY:              ${discrepancy}`);
                }
                else {
                    console.log(`   ✅ NO DISCREPANCY`);
                }
                console.log('='.repeat(80));
                // Step 7: Check for duplicates (invoices in BOTH invoice_lines AND stock_movements)
                const [duplicates] = yield conn.query(`
                SELECT i.id, i.number, i.type, i.date, il.quantity as invoice_qty, sm.qty_change as movement_qty
                FROM invoice_lines il
                JOIN invoices i ON il.invoiceId = i.id
                JOIN stock_movements sm ON sm.reference_id = i.id AND sm.product_id = il.productId
                WHERE il.productId = ?
                  AND i.status NOT IN ('DRAFT', 'CANCELLED', 'VOID')
                  AND sm.reference_type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE')
                ORDER BY i.date DESC
                LIMIT 10
            `, [productId]);
                if (duplicates.length > 0) {
                    console.log('\n🔵 Invoices with BOTH invoice_lines AND stock_movements (correctly excluded from double-count):');
                    for (const d of duplicates) {
                        console.log(`   • ${d.number} (${d.type}): invoice_qty=${d.invoice_qty}, movement_qty=${d.movement_qty}`);
                    }
                }
                // Step 8: Look for REAL duplicates in stock_movements
                const [movementDupes] = yield conn.query(`
                SELECT reference_id, reference_type, COUNT(*) as count, SUM(qty_change) as total
                FROM stock_movements
                WHERE product_id = ?
                  AND reference_id IS NOT NULL
                GROUP BY reference_id, reference_type
                HAVING COUNT(*) > 1
                LIMIT 10
            `, [productId]);
                if (movementDupes.length > 0) {
                    console.log('\n🔴 DUPLICATE stock_movements (same reference_id):');
                    for (const d of movementDupes) {
                        console.log(`   • Reference: ${d.reference_id} (${d.reference_type}): ${d.count} entries, total: ${d.total}`);
                    }
                }
                // Step 9: Check for orphaned product_stocks
                const [orphaned] = yield conn.query(`
                SELECT ps.id, ps.warehouseId, ps.stock
                FROM product_stocks ps
                LEFT JOIN warehouses w ON ps.warehouseId = w.id
                WHERE ps.productId = ?
                  AND w.id IS NULL
            `, [productId]);
                if (orphaned.length > 0) {
                    console.log('\n👻 ORPHANED product_stocks (warehouse deleted):');
                    for (const o of orphaned) {
                        console.log(`   • Warehouse ID: ${o.warehouseId}, stock: ${o.stock}`);
                    }
                }
                // Step 10: Show recent movements
                const [recentMovements] = yield conn.query(`
                SELECT sm.movement_date, sm.movement_type, sm.reference_type, sm.qty_change, sm.notes, w.name as warehouse
                FROM stock_movements sm
                LEFT JOIN warehouses w ON sm.warehouse_id = w.id
                WHERE sm.product_id = ?
                ORDER BY sm.movement_date DESC, sm.id DESC
                LIMIT 10
            `, [productId]);
                console.log('\n📝 Recent stock_movements (last 10):');
                for (const m of recentMovements) {
                    const date = new Date(m.movement_date).toLocaleDateString('en-GB');
                    console.log(`   ${date} | ${m.movement_type.padEnd(20)} | ${String(m.qty_change).padStart(8)} | ${m.warehouse || 'Global'} | ${(m.notes || '').substring(0, 40)}`);
                }
            }
        }
        catch (error) {
            console.error('Error:', error);
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
// Run the diagnostic
const searchTerm = process.argv[2] || '1002';
console.log(`\nRunning stock discrepancy diagnostic for: "${searchTerm}"\n`);
diagnoseStockDiscrepancy(searchTerm);
