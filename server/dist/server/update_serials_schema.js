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
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
function updateSchema() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield db_1.pool.getConnection();
        try {
            console.log('🔄 Starting Serial Number Tracking schema update...');
            // 1. Add trackSerials column to products
            try {
                yield conn.query(`
                ALTER TABLE products 
                ADD COLUMN IF NOT EXISTS trackSerials BOOLEAN DEFAULT FALSE
            `);
                console.log('✅ Added trackSerials to products table');
            }
            catch (error) {
                console.error('⚠️ Error adding trackSerials column:', error.message);
            }
            // 2. Create product_serials table
            yield conn.query(`
            CREATE TABLE IF NOT EXISTS product_serials (
                id VARCHAR(50) PRIMARY KEY,
                productId VARCHAR(50) NOT NULL,
                serialNumber VARCHAR(100) NOT NULL,
                warehouseId VARCHAR(50),
                status ENUM('AVAILABLE', 'SOLD', 'RETURNED', 'RETURNED_TO_VENDOR', 'DAMAGED', 'TRANSIT', 'ADJUSTMENT') DEFAULT 'AVAILABLE',
                purchaseInvoiceId VARCHAR(50),
                salesInvoiceId VARCHAR(50),
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_product_serial (productId, serialNumber),
                INDEX idx_serial (serialNumber),
                INDEX idx_status (status),
                INDEX idx_warehouse (warehouseId),
                FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
            )
        `);
            console.log('✅ Created product_serials table');
            // 3. Create serial_transactions table
            yield conn.query(`
            CREATE TABLE IF NOT EXISTS serial_transactions (
                id VARCHAR(50) PRIMARY KEY,
                serialId VARCHAR(50) NOT NULL,
                transactionType ENUM('IN', 'OUT', 'TRANSFER', 'RETURN', 'ADJUSTMENT') NOT NULL,
                referenceId VARCHAR(50),
                warehouseId VARCHAR(50),
                notes TEXT,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                userId VARCHAR(50),
                INDEX idx_serial_trans (serialId),
                INDEX idx_ref (referenceId),
                FOREIGN KEY (serialId) REFERENCES product_serials(id) ON DELETE CASCADE
            )
        `);
            console.log('✅ Created serial_transactions table');
            console.log('🎉 Schema update completed successfully!');
        }
        catch (error) {
            console.error('❌ Schema update failed:', error);
        }
        finally {
            conn.release();
            process.exit();
        }
    });
}
updateSchema();
