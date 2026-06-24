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
const promise_1 = require("mysql2/promise");
dotenv_1.default.config({ path: '../.env' });
function migrateDiscounts() {
    return __awaiter(this, void 0, void 0, function* () {
        const dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'cloud_erp',
            port: Number(process.env.DB_PORT) || 3306
        };
        console.log(`🔌 Connecting to ${dbConfig.database}...`);
        const pool = (0, promise_1.createPool)(dbConfig);
        try {
            const conn = yield pool.getConnection();
            console.log('✅ Connected.');
            // 1. Check existing columns
            const [columns] = yield conn.query('SHOW COLUMNS FROM invoices');
            const hasGlobal = columns.some((c) => c.Field === 'globalDiscount');
            const hasDiscount = columns.some((c) => c.Field === 'discount');
            if (!hasGlobal) {
                console.log('➕ Adding globalDiscount column...');
                yield conn.query(`
                ALTER TABLE invoices 
                ADD COLUMN globalDiscount DECIMAL(15,2) DEFAULT 0 AFTER shippingFee
            `);
                console.log('✅ globalDiscount added.');
            }
            else {
                console.log('ℹ️ globalDiscount already exists.');
            }
            if (!hasDiscount) {
                console.log('➕ Adding discount column...');
                yield conn.query(`
                ALTER TABLE invoices 
                ADD COLUMN discount DECIMAL(15,2) DEFAULT 0 AFTER globalDiscount
            `);
                console.log('✅ discount added.');
            }
            else {
                console.log('ℹ️ discount already exists.');
            }
            console.log('🎉 Migration completed successfully!');
        }
        catch (e) {
            console.error('❌ Migration failed:', e);
        }
        finally {
            yield pool.end();
        }
    });
}
migrateDiscounts();
