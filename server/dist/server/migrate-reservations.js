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
function migrate() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Create stock_reservations table
            yield db_1.pool.query(`
            CREATE TABLE IF NOT EXISTS stock_reservations (
                id VARCHAR(36) PRIMARY KEY,
                invoiceId VARCHAR(36) NOT NULL,
                invoiceNumber VARCHAR(50),
                productId VARCHAR(36) NOT NULL,
                productName VARCHAR(255),
                warehouseId VARCHAR(36),
                quantity DECIMAL(15,5) NOT NULL,
                status ENUM('RESERVED','DISPATCHED','CANCELLED') DEFAULT 'RESERVED',
                dispatchPermitId VARCHAR(36),
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_invoice (invoiceId),
                INDEX idx_product (productId),
                INDEX idx_status (status),
                INDEX idx_warehouse (warehouseId)
            )
        `);
            console.log('✅ stock_reservations table created');
            // Add reserved_stock column to product_stocks
            yield db_1.pool.query(`ALTER TABLE product_stocks ADD COLUMN IF NOT EXISTS reserved_stock DECIMAL(15,5) DEFAULT 0`).catch(() => {
                console.log('⚠️ reserved_stock column may already exist');
            });
            console.log('✅ product_stocks.reserved_stock column added');
            console.log('All done!');
            process.exit(0);
        }
        catch (err) {
            console.error('Error:', err);
            process.exit(1);
        }
    });
}
migrate();
