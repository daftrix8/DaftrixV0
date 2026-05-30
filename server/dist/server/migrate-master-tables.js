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
            // Create master data tables
            yield db_1.pool.query(`
            CREATE TABLE IF NOT EXISTS specifications (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
            console.log('✅ specifications table created');
            yield db_1.pool.query(`
            CREATE TABLE IF NOT EXISTS item_descriptions (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
            console.log('✅ item_descriptions table created');
            yield db_1.pool.query(`
            CREATE TABLE IF NOT EXISTS product_groups (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
            console.log('✅ product_groups table created');
            // Add new product columns
            yield db_1.pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ceramicItemDesc VARCHAR(255)`).catch(() => { });
            console.log('✅ products.ceramicItemDesc column added');
            yield db_1.pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ceramicGroup VARCHAR(255)`).catch(() => { });
            console.log('✅ products.ceramicGroup column added');
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
