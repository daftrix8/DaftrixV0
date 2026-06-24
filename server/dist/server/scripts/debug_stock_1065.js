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
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'cloud_erp_db',
    charset: 'utf8mb4'
};
function debugStockData() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🚀 Starting Stock Discrepancy Debugger...');
        let conn;
        try {
            conn = yield promise_1.default.createConnection(dbConfig);
            console.log('✅ Connected to database.');
            const SKU = '1065';
            // 1. Get Product ID from SKU
            const [products] = yield conn.query('SELECT id, name, stock FROM products WHERE sku = ? OR name LIKE ?', [SKU, `%${SKU}%`]);
            if (products.length === 0) {
                console.error(`❌ Product with SKU/Name '${SKU}' not found.`);
                return;
            }
            const product = products[0];
            console.log(`📦 Product Found: [${product.id}] ${product.name} (Global Stock: ${product.stock})`);
            // 2. Check Product Stocks Table (Warehouse Breakdown)
            const [stocks] = yield conn.query(`
            SELECT ps.warehouseId, w.name, ps.quantity 
            FROM product_stocks ps
            LEFT JOIN warehouses w ON ps.warehouseId = w.id
            WHERE ps.productId = ?
        `, [product.id]);
            console.log('\n📊 Product Stocks Table (Expected TOTAL):');
            let psTotal = 0;
            stocks.forEach(s => {
                console.log(`   - Warehouse [${s.warehouseId}] ${s.name}: ${s.quantity}`);
                psTotal += Number(s.quantity);
            });
            console.log(`   --> Calculated Total from Table: ${psTotal}`);
            // 3. Check Stock Movements Table (Ledger)
            const [movements] = yield conn.query(`
            SELECT sm.type, sm.quantity, sm.warehouseId, w.name, sm.createdAt, sm.details 
            FROM stock_movements sm
            LEFT JOIN warehouses w ON sm.warehouseId = w.id
            WHERE sm.productId = ?
            ORDER BY sm.createdAt ASC
        `, [product.id]);
            console.log('\n📜 Stock Movements (Calculated Ledger):');
            let movementTotal = 0;
            let warehouseTotals = {};
            movements.forEach(m => {
                const qty = Number(m.quantity);
                const whId = m.warehouseId || 'NULL';
                movementTotal += qty;
                warehouseTotals[whId] = (warehouseTotals[whId] || 0) + qty;
                console.log(`   - ${m.createdAt.toISOString().slice(0, 10)} [${m.type}] ${m.name || 'Unknown'}: ${qty > 0 ? '+' : ''}${qty} (${m.details || ''})`);
            });
            console.log(`   --> Calculated Total from Movements: ${movementTotal}`);
            console.log('\n🔍 Warehouse Breakdown (from Movements):');
            for (const [whId, qty] of Object.entries(warehouseTotals)) {
                console.log(`   - Warehouse [${whId}]: ${qty}`);
            }
            // 4. Analysis
            console.log('\n🏁 Summary Analysis:');
            console.log(`   Global Stock (Product): ${product.stock}`);
            console.log(`   Summary Table Total:    ${psTotal}`);
            console.log(`   Movements Ledger Total: ${movementTotal}`);
            if (Number(product.stock) !== Number(movementTotal)) {
                console.error('❌ DISCREPANCY DETECTED: Global Stock != Movement Ledger');
            }
            else {
                console.log('✅ Global Stock matches Movement Ledger.');
            }
        }
        catch (error) {
            console.error('💥 Script failed:', error);
        }
        finally {
            if (conn)
                yield conn.end();
        }
    });
}
debugStockData();
