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
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./db");
// Load env from the local server folder
dotenv_1.default.config({ path: path.resolve(__dirname, '.env') });
function verify() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        console.log("Initializing DB and running migrations...");
        yield (0, db_1.initDB)();
        console.log("DB Config to connect:", {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
        });
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true
        });
        try {
            // Let's find some active product variant to test with
            const [variants] = yield conn.query(`SELECT id, productId, name, stock FROM product_variants WHERE isActive = 1 LIMIT 5`);
            console.log("Sample active product variants from database:", variants);
            if (variants.length === 0) {
                console.log("⚠️ No active variants found in the database. Creating a dummy variant to test...");
                // Let's find any product first
                const [products] = yield conn.query("SELECT id, name FROM products LIMIT 1");
                if (products.length === 0) {
                    console.log("❌ No products found in database. Cannot run test.");
                    return;
                }
                const prodId = products[0].id;
                const dummyVariantId = 'dummy-var-1';
                yield conn.query(`INSERT INTO product_variants (id, productId, name, sku, barcode, stock, isActive) 
                 VALUES (?, ?, ?, ?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE isActive = 1`, [dummyVariantId, prodId, 'Dummy Variant', 'DUMMY-SKU', 'DUMMY-BARCODE', 15]);
                variants.push({ id: dummyVariantId, productId: prodId, name: 'Dummy Variant', stock: 15 });
            }
            for (const variant of variants) {
                const { id: variantId, productId, name, stock: globalStock } = variant;
                console.log(`\nTesting variant: "${name}" (${variantId}) | Global stock: ${globalStock}`);
                // Let's get any warehouse ID or just use a dummy one
                const [warehouses] = yield conn.query("SELECT id, name FROM warehouses LIMIT 2");
                const whId = ((_a = warehouses[0]) === null || _a === void 0 ? void 0 : _a.id) || 'dummy-wh-1';
                const whName = ((_b = warehouses[0]) === null || _b === void 0 ? void 0 : _b.name) || 'Dummy Warehouse';
                console.log(`Selected warehouse for query test: "${whName}" (${whId})`);
                // Let's check if there are entries in product_variant_stocks for this variant
                const [stocksBefore] = yield conn.query("SELECT * FROM product_variant_stocks WHERE variantId = ?", [variantId]);
                console.log(`Existing entries in product_variant_stocks for this variant:`, stocksBefore);
                // Test 1: Query without warehouseId (should sum warehouse stocks or fallback to global stock)
                const queryNoWh = `
                SELECT pv.id, pv.name,
                COALESCE(
                    (SELECT SUM(pvs2.stock) FROM product_variant_stocks pvs2 WHERE pvs2.variantId = pv.id),
                    pv.stock
                ) AS stock
                FROM product_variants pv
                WHERE pv.id = ?
            `;
                const [resNoWh] = yield conn.query(queryNoWh, [variantId]);
                console.log("Result (NO warehouseId specified):", resNoWh[0]);
                // Test 2: Query WITH warehouseId when no warehouse record exists (should fallback to globalStock because count=0)
                const queryWithWh = `
                SELECT pv.id, pv.name,
                COALESCE(
                    pvs.stock,
                    CASE 
                        WHEN (SELECT COUNT(*) FROM product_variant_stocks pvs2 WHERE pvs2.variantId = pv.id) = 0 THEN pv.stock 
                        ELSE 0 
                    END
                ) AS stock
                FROM product_variants pv
                LEFT JOIN product_variant_stocks pvs ON pv.id = pvs.variantId AND pvs.warehouseId = ?
                WHERE pv.id = ?
            `;
                const [resWithWhFallback] = yield conn.query(queryWithWh, [whId, variantId]);
                console.log(`Result (WITH warehouseId, record doesn't exist, count=0):`, resWithWhFallback[0]);
                // Test 3: Insert a stock record for a DIFFERENT warehouse, verify count > 0 and stock is 0 for this warehouse
                const otherWhId = ((_c = warehouses[1]) === null || _c === void 0 ? void 0 : _c.id) || 'other-wh-2';
                if (stocksBefore.length === 0) {
                    console.log(`Adding a stock record in other warehouse "${otherWhId}" to verify no-fallback behavior...`);
                    yield conn.query(`INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock)
                     VALUES (?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE stock = VALUES(stock)`, ['test-pvs-1', variantId, productId, otherWhId, 5]);
                    const [resWithWhNoFallback] = yield conn.query(queryWithWh, [whId, variantId]);
                    console.log(`Result (WITH warehouseId="${whId}", records exist elsewhere, expect 0):`, resWithWhNoFallback[0]);
                    // Cleanup
                    yield conn.query("DELETE FROM product_variant_stocks WHERE id = 'test-pvs-1'");
                }
            }
        }
        catch (e) {
            console.error("Error during verification:", e);
        }
        finally {
            yield conn.end();
        }
    });
}
verify();
