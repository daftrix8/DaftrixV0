"use strict";
/**
 * Force Sync Product Stock Balance
 *
 * This script syncs the running balance shown in کارت الصنف
 * with the actual products.stock value by creating appropriate adjustments.
 *
 * It calculates based on the SAME logic as the getProductMovementHistory endpoint:
 * - Invoice Lines (sales/purchases/returns)
 * - Stock Permit Items (in/out/transfer)
 * - Stock Movements (production/adjustments)
 *
 * Run with: npx ts-node scripts/force-sync-balance.ts
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
function forceSyncBalance() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        console.log('='.repeat(60));
        console.log('🔧 Force Sync Product Balance Script');
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
            yield connection.beginTransaction();
            console.log('📦 Transaction started\n');
            // Get all products with stock
            const [products] = yield connection.query(`
            SELECT id, name, stock FROM products WHERE stock IS NOT NULL
        `);
            console.log(`📊 Checking ${products.length} products...\n`);
            let adjustmentsCreated = 0;
            const discrepancies = [];
            for (const product of products) {
                // Calculate balance from invoices
                const [invoiceBalance] = yield connection.query(`
                SELECT 
                    SUM(CASE 
                        WHEN i.type IN ('INVOICE_PURCHASE', 'RETURN_SALE') THEN il.quantity 
                        WHEN i.type IN ('INVOICE_SALE', 'RETURN_PURCHASE') THEN -il.quantity 
                        ELSE 0 
                    END) as total
                FROM invoice_lines il
                JOIN invoices i ON il.invoiceId = i.id
                WHERE il.productId = ? AND i.status = 'POSTED'
            `, [product.id]);
                // Calculate balance from permits
                const [permitBalance] = yield connection.query(`
                SELECT 
                    SUM(CASE 
                        WHEN sp.type = 'STOCK_PERMIT_IN' THEN spi.quantity 
                        WHEN sp.type = 'STOCK_PERMIT_OUT' THEN -spi.quantity 
                        WHEN sp.type = 'STOCK_TRANSFER' THEN 0
                        ELSE 0 
                    END) as total
                FROM stock_permit_items spi
                JOIN stock_permits sp ON spi.permitId = sp.id
                WHERE spi.productId = ?
            `, [product.id]);
                // Calculate balance from stock movements
                const [movementBalance] = yield connection.query(`
                SELECT SUM(qty_change) as total
                FROM stock_movements
                WHERE product_id = ?
            `, [product.id]);
                const invoiceTotal = parseFloat((_a = invoiceBalance[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
                const permitTotal = parseFloat((_b = permitBalance[0]) === null || _b === void 0 ? void 0 : _b.total) || 0;
                const movementTotal = parseFloat((_c = movementBalance[0]) === null || _c === void 0 ? void 0 : _c.total) || 0;
                const calculatedBalance = invoiceTotal + permitTotal + movementTotal;
                const actualStock = parseFloat(product.stock) || 0;
                const difference = actualStock - calculatedBalance;
                if (Math.abs(difference) > 0.01) {
                    discrepancies.push({
                        id: product.id,
                        name: product.name,
                        actual: actualStock,
                        calculated: calculatedBalance,
                        invoices: invoiceTotal,
                        permits: permitTotal,
                        movements: movementTotal,
                        difference
                    });
                    // Create adjustment
                    yield connection.query(`
                    INSERT INTO stock_movements (
                        product_id, warehouse_id, qty_change, movement_type,
                        reference_type, reference_id, notes
                    ) VALUES (?, NULL, ?, 'OPENING_BALANCE', 'BALANCE_SYNC', ?, ?)
                `, [
                        product.id,
                        difference,
                        `BALANCE-SYNC-${Date.now()}`,
                        `مزامنة رصيد كارت الصنف (الفرق: ${difference > 0 ? '+' : ''}${difference.toFixed(2)})`
                    ]);
                    adjustmentsCreated++;
                }
            }
            if (discrepancies.length === 0) {
                console.log('✅ No discrepancies found. All balances are in sync!\n');
                yield connection.rollback();
                return;
            }
            console.log(`🔄 Found ${discrepancies.length} products with discrepancies:\n`);
            // Show first 10 discrepancies
            const showCount = Math.min(10, discrepancies.length);
            for (let i = 0; i < showCount; i++) {
                const d = discrepancies[i];
                console.log(`   ${d.name.substring(0, 40)}`);
                console.log(`      Actual: ${d.actual}, Calculated: ${d.calculated.toFixed(2)}, Diff: ${d.difference > 0 ? '+' : ''}${d.difference.toFixed(2)}`);
            }
            if (discrepancies.length > showCount) {
                console.log(`   ... and ${discrepancies.length - showCount} more`);
            }
            yield connection.commit();
            console.log('\n' + '='.repeat(60));
            console.log('🎉 SUCCESS! Balance adjustments created.');
            console.log('='.repeat(60));
            console.log(`\n   • Created ${adjustmentsCreated} adjustment movements`);
            console.log('\n📝 Restart the server and refresh کارت الصنف to see the fix.\n');
        }
        catch (error) {
            yield connection.rollback();
            console.error('\n❌ ERROR:', error.message);
            throw error;
        }
        finally {
            yield connection.end();
        }
    });
}
forceSyncBalance()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
