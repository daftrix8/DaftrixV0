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
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '.env') });
const db_1 = require("./db");
const crypto_1 = require("crypto");
function fixStockConsistency() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('🔄 Starting Stock Consistency Fix...');
        try {
            // 1. Clear Product Stocks (Warehouse Level)
            yield db_1.pool.query('TRUNCATE TABLE product_stocks');
            // 2. Clear Existing Stock Permits (to regenerate Opening Balances)
            yield db_1.pool.query('DELETE FROM stock_permit_items');
            yield db_1.pool.query('DELETE FROM stock_permits');
            console.log('Cleared product_stocks and stock_permits tables.');
            // 3. Get all products
            const [products] = yield db_1.pool.query('SELECT id, name, stock, warehouseId FROM products');
            console.log(`Found ${products.length} products.`);
            // 4. Get all Warehouses
            const [warehouses] = yield db_1.pool.query('SELECT id FROM warehouses');
            const defaultWarehouseId = (_a = warehouses[0]) === null || _a === void 0 ? void 0 : _a.id;
            // Prepare Opening Balance Permit
            const openingPermitId = (0, crypto_1.randomUUID)();
            // Note: Using destWarehouseId for IN permit. sourceWarehouseId is null.
            yield db_1.pool.query(`
            INSERT INTO stock_permits (id, date, type, description, destWarehouseId)
            VALUES (?, ?, ?, ?, ?)
        `, [openingPermitId, '2024-01-01 00:00:00', 'STOCK_PERMIT_IN', 'رصيد افتتاحي (تصحيح النظام)', defaultWarehouseId]);
            for (const product of products) {
                // A. Calculate Net Movement from Invoices
                const [invLines] = yield db_1.pool.query(`
                SELECT 
                    il.quantity, 
                    i.type, 
                    i.warehouseId 
                FROM invoice_lines il
                JOIN invoices i ON il.invoiceId = i.id
                WHERE il.productId = ? AND i.status = 'POSTED'
            `, [product.id]);
                const warehouseMap = new Map();
                let totalNet = 0;
                for (const line of invLines) {
                    let qty = Number(line.quantity);
                    let impact = 0;
                    switch (line.type) {
                        case 'INVOICE_SALE':
                            impact = -qty;
                            break;
                        case 'INVOICE_PURCHASE':
                            impact = qty;
                            break;
                        case 'RETURN_SALE':
                            impact = qty;
                            break;
                        case 'RETURN_PURCHASE':
                            impact = -qty;
                            break;
                    }
                    totalNet += impact;
                    const whId = line.warehouseId || product.warehouseId || defaultWarehouseId;
                    if (whId) {
                        const current = warehouseMap.get(whId) || 0;
                        warehouseMap.set(whId, current + impact);
                    }
                }
                // B. Handle Opening Balance
                // We treat the current `product.stock` (from mock gen) as the Initial Stock.
                const initialStock = Number(product.stock || 0);
                // Insert Item into Opening Permit
                if (initialStock > 0) {
                    yield db_1.pool.query(`
                    INSERT INTO stock_permit_items (permitId, productId, productName, quantity, cost)
                    VALUES (?, ?, ?, ?, ?)
                `, [openingPermitId, product.id, product.name, initialStock, 0]);
                }
                // Add Initial Stock to Product's Default Warehouse
                const productWhId = product.warehouseId || defaultWarehouseId;
                if (productWhId) {
                    const current = warehouseMap.get(productWhId) || 0;
                    warehouseMap.set(productWhId, current + initialStock);
                }
                // C. Calculate Final Stock
                const finalStock = initialStock + totalNet;
                // D. Update Product Global Stock
                yield db_1.pool.query('UPDATE products SET stock = ? WHERE id = ?', [finalStock, product.id]);
                // E. Insert into product_stocks
                for (const [whId, stock] of warehouseMap.entries()) {
                    yield db_1.pool.query('INSERT INTO product_stocks (id, productId, warehouseId, stock) VALUES (?, ?, ?, ?)', [(0, crypto_1.randomUUID)(), product.id, whId, stock]);
                }
            }
            console.log('✅ Successfully recalculated all stock balances and created opening balances.');
        }
        catch (error) {
            console.error('❌ Error fixing stock:', error);
        }
        finally {
            process.exit();
        }
    });
}
fixStockConsistency();
