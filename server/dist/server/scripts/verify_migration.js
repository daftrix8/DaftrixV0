"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
function verify() {
    return __awaiter(this, void 0, void 0, function* () {
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true,
            authPlugins: {
                mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0')
            },
        });
        console.log('=== DATABASE COUNTS AFTER PHASE 1 ===\n');
        const queries = [
            ['Categories', 'SELECT COUNT(*) as cnt FROM categories'],
            ['Branches', 'SELECT COUNT(*) as cnt FROM branches'],
            ['Warehouses', 'SELECT COUNT(*) as cnt FROM warehouses'],
            ['Salesmen', 'SELECT COUNT(*) as cnt FROM salesmen'],
            ['Partners', 'SELECT COUNT(*) as cnt FROM partners'],
            ['Products', 'SELECT COUNT(*) as cnt FROM products'],
            ['Price Lists', 'SELECT COUNT(*) as cnt FROM price_lists'],
            ['Product Prices', 'SELECT COUNT(*) as cnt FROM product_prices'],
            ['Product Stocks', 'SELECT COUNT(*) as cnt FROM product_stocks'],
            ['Invoices', 'SELECT COUNT(*) as cnt FROM invoices'],
        ];
        for (const [label, sql] of queries) {
            const [rows] = yield pool.query(sql);
            console.log(`  ${label.padEnd(20)}: ${rows[0].cnt}`);
        }
        // Sample partners
        const [partners] = yield pool.query(`SELECT name, type, isCustomer, isSupplier, openingBalance FROM partners ORDER BY RAND() LIMIT 5`);
        console.log('\n=== SAMPLE PARTNERS ===');
        for (const p of partners) {
            console.log(`  ${p.name}  | ${p.type} | Balance: ${p.openingBalance}`);
        }
        // Sample products
        const [products] = yield pool.query(`SELECT name, sku, price, cost, stock FROM products ORDER BY RAND() LIMIT 5`);
        console.log('\n=== SAMPLE PRODUCTS ===');
        for (const p of products) {
            console.log(`  ${p.name}  | SKU: ${p.sku} | Price: ${p.price} | Cost: ${p.cost} | Stock: ${p.stock}`);
        }
        // Partner type breakdown
        const [typeBreakdown] = yield pool.query(`SELECT type, COUNT(*) as cnt FROM partners GROUP BY type`);
        console.log('\n=== PARTNER TYPE BREAKDOWN ===');
        for (const t of typeBreakdown) {
            console.log(`  ${t.type}: ${t.cnt}`);
        }
        // Check ID mapping file
        const mappingFile = path.resolve(__dirname, '../../mall stuff/id_mapping.json');
        if (fs.existsSync(mappingFile)) {
            const map = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
            console.log('\n=== ID MAPPING COUNTS ===');
            for (const [key, val] of Object.entries(map)) {
                console.log(`  ${key.padEnd(20)}: ${Object.keys(val).length}`);
            }
        }
        yield pool.end();
    });
}
verify().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
