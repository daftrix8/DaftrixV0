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
            console.log('Adding subcategoryId to products table...');
            yield db_1.pool.query(`
            ALTER TABLE products 
            ADD COLUMN subcategoryId VARCHAR(36) NULL AFTER categoryId;
        `);
            console.log('Column subcategoryId added successfully.');
        }
        catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('Column subcategoryId already exists.');
            }
            else {
                console.error('Error adding column:', e);
            }
        }
        try {
            console.log('Adding index on subcategoryId...');
            yield db_1.pool.query(`
            CREATE INDEX idx_products_subcategory ON products(subcategoryId);
        `);
            console.log('Index idx_products_subcategory added successfully.');
        }
        catch (e) {
            if (e.code === 'ER_DUP_KEYNAME') {
                console.log('Index idx_products_subcategory already exists.');
            }
            else {
                console.error('Error adding index:', e);
            }
        }
        console.log('Migration complete.');
        process.exit(0);
    });
}
migrate();
