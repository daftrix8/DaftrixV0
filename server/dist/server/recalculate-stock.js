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
const promise_1 = require("mysql2/promise");
const crypto_1 = require("crypto");
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
function recalculateStock() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const conn = yield pool.getConnection();
            console.log('Connected to DB');
            yield conn.beginTransaction();
            // 1. Clear current stock
            console.log('Clearing current stock...');
            yield conn.query('TRUNCATE TABLE product_stocks');
            // We don't touch 'products.stock' legacy column as we are moving to product_stocks
            // 2. Process Invoices
            console.log('Processing Invoices...');
            const [invoices] = yield conn.query('SELECT * FROM invoices WHERE status = "POSTED"');
            for (const inv of invoices) {
                const [lines] = yield conn.query('SELECT * FROM invoice_lines WHERE invoiceId = ?', [inv.id]);
                for (const line of lines) {
                    let change = 0;
                    if (!inv.warehouseId)
                        continue;
                    if (inv.type === 'INVOICE_SALE')
                        change = -line.quantity;
                    else if (inv.type === 'INVOICE_PURCHASE')
                        change = line.quantity;
                    else if (inv.type === 'RETURN_SALE')
                        change = line.quantity;
                    else if (inv.type === 'RETURN_PURCHASE')
                        change = -line.quantity;
                    if (change !== 0) {
                        yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) 
                         VALUES (?, ?, ?, ?) 
                         ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)`, [(0, crypto_1.randomUUID)(), line.productId, inv.warehouseId, change, change]);
                    }
                }
            }
            // 3. Process Stock Permits
            console.log('Processing Stock Permits...');
            const [permits] = yield conn.query('SELECT * FROM stock_permits');
            for (const p of permits) {
                const [items] = yield conn.query('SELECT * FROM stock_permit_items WHERE permitId = ?', [p.id]);
                for (const item of items) {
                    // Ensure item quantity is clean
                    const qty = Number(Number(item.quantity).toFixed(5));
                    if (p.type === 'STOCK_PERMIT_IN' && p.destWarehouseId) {
                        yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) 
                         VALUES (?, ?, ?, ?) 
                         ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)`, [(0, crypto_1.randomUUID)(), item.productId, p.destWarehouseId, qty, qty]);
                    }
                    else if (p.type === 'STOCK_PERMIT_OUT' && p.sourceWarehouseId) {
                        yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) 
                         VALUES (?, ?, ?, ?) 
                         ON DUPLICATE KEY UPDATE stock = ROUND(stock - ?, 5)`, [(0, crypto_1.randomUUID)(), item.productId, p.sourceWarehouseId, qty, qty]);
                    }
                    else if (p.type === 'STOCK_TRANSFER' && p.sourceWarehouseId && p.destWarehouseId) {
                        // Out from Source
                        yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) 
                         VALUES (?, ?, ?, ?) 
                         ON DUPLICATE KEY UPDATE stock = ROUND(stock - ?, 5)`, [(0, crypto_1.randomUUID)(), item.productId, p.sourceWarehouseId, qty, qty]);
                        // In to Dest
                        yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) 
                         VALUES (?, ?, ?, ?) 
                         ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)`, [(0, crypto_1.randomUUID)(), item.productId, p.destWarehouseId, qty, qty]);
                    }
                }
            }
            yield conn.commit();
            console.log('✓ Stock recalculation complete.');
            conn.release();
        }
        catch (e) {
            console.error('Recalculation Failed:', e);
        }
        finally {
            yield pool.end();
        }
    });
}
recalculateStock();
