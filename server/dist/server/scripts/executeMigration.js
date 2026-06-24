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
const db_1 = require("../db");
function executeMigration() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🚀 Starting database migration...');
        const conn = yield db_1.pool.getConnection();
        try {
            console.log('1️⃣  Adding createdBy column to partners table...');
            try {
                yield conn.query(`
                ALTER TABLE partners 
                ADD COLUMN IF NOT EXISTS createdBy VARCHAR(100)
            `);
                yield conn.query(`
                CREATE INDEX IF NOT EXISTS idx_partners_createdBy ON partners(createdBy)
            `);
                console.log('   ✅ Done.');
            }
            catch (e) {
                console.log('   ⚠️  Note:', e.message);
            }
            console.log('2️⃣  Adding createdBy column to products table...');
            try {
                yield conn.query(`
                ALTER TABLE products 
                ADD COLUMN IF NOT EXISTS createdBy VARCHAR(100)
            `);
                yield conn.query(`
                CREATE INDEX IF NOT EXISTS idx_products_createdBy ON products(createdBy)
            `);
                console.log('   ✅ Done.');
            }
            catch (e) {
                console.log('   ⚠️  Note:', e.message);
            }
            console.log('3️⃣  Updating existing records...');
            const tables = ['partners', 'products', 'invoices', 'journal_entries', 'cheques', 'stock_permits'];
            for (const table of tables) {
                try {
                    // Check if table exists first to avoid errors
                    const [exists] = yield conn.query(`SHOW TABLES LIKE '${table}'`);
                    if (exists.length > 0) {
                        yield conn.query(`
                        UPDATE ${table} SET createdBy = 'System' 
                        WHERE createdBy IS NULL OR createdBy = ''
                    `);
                        console.log(`   ✅ Updated ${table}`);
                    }
                }
                catch (e) {
                    // Ignore errors for tables that might not exist or have the column yet
                }
            }
            console.log('\n🎉 Migration completed successfully!');
        }
        catch (error) {
            console.error('❌ Migration failed:', error);
        }
        finally {
            conn.release();
            process.exit();
        }
    });
}
executeMigration();
