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
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables
dotenv_1.default.config({ path: path_1.default.join(__dirname, '..', '.env') });
function fixWarehouseStock() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('='.repeat(60));
        console.log('🔧 Fix Warehouse Stock Balance Script');
        console.log('='.repeat(60));
        const connection = yield promise_1.default.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'erp_system'
        });
        try {
            yield connection.beginTransaction();
            // 1. Get List of all Warehouses
            const [warehouses] = yield connection.query('SELECT id, name FROM warehouses');
            console.log(`Found ${warehouses.length} warehouses.`);
            // 2. Iterate warehouses and recalculate stock for all products
            for (const wh of warehouses) {
                console.log(`\nProcessing Warehouse: ${wh.name} (${wh.id})`);
                // Calculate stock per product for this warehouse
                // ONLY check movements that strictly belong to this warehouse
                const [calculatedStocks] = yield connection.query(`
                SELECT 
                    product_id, 
                    SUM(qty_change) as actual_stock 
                FROM stock_movements 
                WHERE warehouse_id = ? 
                GROUP BY product_id
            `, [wh.id]);
                console.log(`   Found ${calculatedStocks.length} products with movement history in this warehouse.`);
                // Reset all stocks for this warehouse first (to clear phantom stocks)
                yield connection.query('UPDATE product_stocks SET stock = 0 WHERE warehouseId = ?', [wh.id]);
                // Apply calculated stocks
                for (const item of calculatedStocks) {
                    if (Math.abs(item.actual_stock) > 0.001) {
                        yield connection.query(`
                        INSERT INTO product_stocks (id, productId, warehouseId, stock)
                        VALUES (UUID(), ?, ?, ?)
                        ON DUPLICATE KEY UPDATE stock = ?
                    `, [item.product_id, wh.id, item.actual_stock, item.actual_stock]);
                    }
                }
                console.log(`   ✅ Synced stocks for ${wh.name}`);
            }
            yield connection.commit();
            console.log('\n✅ Warehouse repair complete.');
        }
        catch (error) {
            yield connection.rollback();
            console.error('Error:', error);
        }
        finally {
            yield connection.end();
        }
    });
}
fixWarehouseStock();
