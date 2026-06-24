"use strict";
/**
 * =============================================================
 * MALL STUFF - OLD ERP DATA MIGRATION SCRIPT
 * =============================================================
 *
 * Migrates data from the old ERP (becreative_badr) JSON exports
 * into the Cloud ERP (Daftrix) database.
 *
 * Usage:
 *   npx ts-node server/scripts/migrate_mall_data.ts [--dry-run] [--phase 1|2|3|4] [--stage N]
 *
 * Phases:
 *   1 = Master Data (categories, warehouses, salesmen, partners, products)
 *   2 = Invoices (sales, purchase, returns)
 *   3 = Financial (payments, stock permits)
 *   4 = Reconciliation (balance verification)
 */
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
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
// ─── CONFIG ─────────────────────────────────────────────────
const DATA_DIR = process.env.MIGRATION_DATA_DIR || path.resolve(__dirname, '../../mall stuff/data');
const BALANCES_DIR = process.env.MIGRATION_BALANCES_DIR || path.resolve(DATA_DIR, '../balances');
const MAPPING_FILE = process.env.MIGRATION_MAPPING_FILE || path.resolve(DATA_DIR, '../id_mapping.json');
const DRY_RUN = process.argv.includes('--dry-run');
const PHASE = parseInt(process.argv.find((_, i, arr) => arr[i - 1] === '--phase') || '0');
const ONLY_STAGE = parseInt(process.argv.find((_, i, arr) => arr[i - 1] === '--stage') || '0');
const BATCH_SIZE = 500;
// ─── HELPERS ────────────────────────────────────────────────
function loadJson(filename) {
    const filepath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filepath)) {
        console.log(`  ⚠️  File not found: ${filename}`);
        return [];
    }
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw);
}
function loadJsonFromPath(filepath) {
    if (!fs.existsSync(filepath)) {
        console.log(`  ⚠️  File not found: ${filepath}`);
        return null;
    }
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw);
}
function loadIdMap() {
    if (fs.existsSync(MAPPING_FILE)) {
        return JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
    }
    return {
        categories: {},
        branches: {},
        warehouses: {},
        salesmen: {},
        partners: {},
        products: {},
        sellInvoices: {},
        buyInvoices: {},
        sellBackInvoices: {},
        buyBackInvoices: {},
    };
}
function saveIdMap(map) {
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(map, null, 2), 'utf8');
    console.log(`  💾 ID mapping saved to ${MAPPING_FILE}`);
}
function sanitize(val) {
    if (val === null || val === undefined)
        return '';
    return String(val).trim();
}
function safeNum(val, fallback = 0) {
    const n = Number(val);
    return isNaN(n) ? fallback : n;
}
function formatDate(dateStr) {
    if (!dateStr)
        return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime()))
        return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
}
function printStats(stage, stats) {
    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║ ${stage.padEnd(40)} ║`);
    console.log(`  ╠══════════════════════════════════════════╣`);
    console.log(`  ║ Total:    ${String(stats.total).padStart(8)}                     ║`);
    console.log(`  ║ Inserted: ${String(stats.inserted).padStart(8)}  ✅                  ║`);
    console.log(`  ║ Skipped:  ${String(stats.skipped).padStart(8)}  ⏭️                   ║`);
    console.log(`  ║ Errors:   ${String(stats.errors).padStart(8)}  ❌                  ║`);
    console.log(`  ╚══════════════════════════════════════════╝\n`);
}
// ─── MAIN ───────────────────────────────────────────────────
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`  🏪 MALL STUFF DATA MIGRATION`);
        console.log(`  Phase: ${PHASE || 'ALL'}  |  Dry Run: ${DRY_RUN}  |  Stage: ${ONLY_STAGE || 'ALL'}`);
        console.log(`  Data Dir: ${DATA_DIR}`);
        console.log(`${'═'.repeat(60)}\n`);
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306,
            waitForConnections: true,
            connectionLimit: 5,
            decimalNumbers: true,
            connectTimeout: 30000,
            authPlugins: {
                mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0')
            },
        });
        try {
            const conn = yield pool.getConnection();
            console.log('  ✅ Connected to database\n');
            conn.release();
            const idMap = loadIdMap();
            // Phase 0 = ALL phases
            if (PHASE === 0 || PHASE === 1) {
                console.log('\n  ═══ PHASE 1: MASTER DATA ═══');
                if (!ONLY_STAGE || ONLY_STAGE === 1)
                    yield migrateCategories(pool, idMap);
                if (!ONLY_STAGE || ONLY_STAGE === 2)
                    yield migrateBranchesAndWarehouses(pool, idMap);
                if (!ONLY_STAGE || ONLY_STAGE === 3)
                    yield migrateSalesmen(pool, idMap);
                if (!ONLY_STAGE || ONLY_STAGE === 4)
                    yield migratePartners(pool, idMap);
                if (!ONLY_STAGE || ONLY_STAGE === 5)
                    yield migrateProducts(pool, idMap);
                saveIdMap(idMap); // Save after Phase 1 so Phase 2 can use the IDs
            }
            if (PHASE === 0 || PHASE === 2) {
                console.log('\n  ═══ PHASE 2: INVOICES ═══');
                if (!ONLY_STAGE || ONLY_STAGE === 6)
                    yield migrateSalesInvoices(pool, idMap);
                if (!ONLY_STAGE || ONLY_STAGE === 7)
                    yield migratePurchaseInvoices(pool, idMap);
                if (!ONLY_STAGE || ONLY_STAGE === 8)
                    yield migrateSalesReturns(pool, idMap);
                if (!ONLY_STAGE || ONLY_STAGE === 9)
                    yield migratePurchaseReturns(pool, idMap);
                saveIdMap(idMap); // Save after Phase 2
            }
            if (PHASE === 0 || PHASE === 3) {
                console.log('\n  ═══ PHASE 3: FINANCIAL ═══');
                if (!ONLY_STAGE || ONLY_STAGE === 10)
                    yield migrateVendorPayments(pool, idMap);
                if (!ONLY_STAGE || ONLY_STAGE === 11)
                    yield migrateCustomerPayments(pool, idMap);
                if (!ONLY_STAGE || ONLY_STAGE === 12)
                    yield migrateSafePayments(pool, idMap);
            }
            // ── POST-MIGRATION: Auto-detect dual-role partners ──
            // The old ERP type field only has customer(1,2) or vendor(4).
            // Partners that are both customers AND suppliers won't have the right flags.
            // Detect from actual invoice activity and fix.
            if (!DRY_RUN) {
                yield fixDualRolePartners(pool);
            }
            saveIdMap(idMap);
            console.log(`\n  🎉 Phase ${PHASE || 'ALL'} migration complete!\n`);
        }
        catch (err) {
            console.error('\n  ❌ FATAL ERROR:', err.message);
            console.error(err.stack);
            process.exit(1);
        }
        finally {
            yield pool.end();
        }
    });
}
// ═══════════════════════════════════════════════════════════
// PHASE 1: MASTER DATA
// ═══════════════════════════════════════════════════════════
// ─── STAGE 1: CATEGORIES ────────────────────────────────────
function migrateCategories(pool, idMap) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('📁 Stage 1: Migrating Categories...');
        const data = loadJson('itemCategories.json');
        const stats = { inserted: 0, skipped: 0, errors: 0, total: data.length };
        const conn = yield pool.getConnection();
        try {
            yield conn.beginTransaction();
            for (const cat of data) {
                const oldId = String(cat.ID);
                if (idMap.categories[oldId]) {
                    stats.skipped++;
                    continue;
                }
                const newId = (0, crypto_1.randomUUID)();
                const name = sanitize(cat.title) || `Category-${oldId}`;
                if (!DRY_RUN) {
                    try {
                        yield conn.query(`INSERT INTO categories (id, name, description) VALUES (?, ?, ?)`, [newId, name, `Migrated from old ERP (ID: ${oldId})`]);
                        idMap.categories[oldId] = newId;
                        stats.inserted++;
                    }
                    catch (err) {
                        if (err.code === 'ER_DUP_ENTRY') {
                            // Name already exists, find the existing ID
                            const [rows] = yield conn.query(`SELECT id FROM categories WHERE name = ?`, [name]);
                            if (rows.length > 0) {
                                idMap.categories[oldId] = rows[0].id;
                                stats.skipped++;
                            }
                        }
                        else {
                            console.error(`  ❌ Category ${oldId}: ${err.message}`);
                            stats.errors++;
                        }
                    }
                }
                else {
                    idMap.categories[oldId] = newId;
                    stats.inserted++;
                }
            }
            if (!DRY_RUN)
                yield conn.commit();
        }
        catch (err) {
            yield conn.rollback();
            throw err;
        }
        finally {
            conn.release();
        }
        printStats('Categories', stats);
    });
}
// ─── STAGE 2: BRANCHES & WAREHOUSES ────────────────────────
function migrateBranchesAndWarehouses(pool, idMap) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🏢 Stage 2: Migrating Branches & Warehouses...');
        const branches = loadJson('Branchs.json');
        const stores = loadJson('stores.json');
        const branchStats = { inserted: 0, skipped: 0, errors: 0, total: branches.length };
        const storeStats = { inserted: 0, skipped: 0, errors: 0, total: stores.length };
        const conn = yield pool.getConnection();
        try {
            yield conn.beginTransaction();
            // Branches
            for (const branch of branches) {
                const oldId = String(branch.ID);
                if (idMap.branches[oldId]) {
                    branchStats.skipped++;
                    continue;
                }
                const newId = (0, crypto_1.randomUUID)();
                const name = sanitize(branch.title) || `Branch-${oldId}`;
                if (!DRY_RUN) {
                    try {
                        yield conn.query(`INSERT INTO branches (id, name) VALUES (?, ?)`, [newId, name]);
                        idMap.branches[oldId] = newId;
                        branchStats.inserted++;
                    }
                    catch (err) {
                        if (err.code === 'ER_DUP_ENTRY') {
                            const [rows] = yield conn.query(`SELECT id FROM branches WHERE name = ?`, [name]);
                            if (rows.length > 0) {
                                idMap.branches[oldId] = rows[0].id;
                                branchStats.skipped++;
                            }
                        }
                        else {
                            console.error(`  ❌ Branch ${oldId}: ${err.message}`);
                            branchStats.errors++;
                        }
                    }
                }
                else {
                    idMap.branches[oldId] = newId;
                    branchStats.inserted++;
                }
            }
            // Warehouses (stores)
            for (const store of stores) {
                const oldId = String(store.ID);
                if (idMap.warehouses[oldId]) {
                    storeStats.skipped++;
                    continue;
                }
                const newId = (0, crypto_1.randomUUID)();
                const name = sanitize(store.title) || `Warehouse-${oldId}`;
                const branchId = idMap.branches[String(store.BranchID)] || null;
                const phone = sanitize(store.phone);
                if (!DRY_RUN) {
                    try {
                        yield conn.query(`INSERT INTO warehouses (id, name, branchId, phone) VALUES (?, ?, ?, ?)`, [newId, name, branchId, phone || null]);
                        idMap.warehouses[oldId] = newId;
                        storeStats.inserted++;
                    }
                    catch (err) {
                        if (err.code === 'ER_DUP_ENTRY') {
                            const [rows] = yield conn.query(`SELECT id FROM warehouses WHERE name = ?`, [name]);
                            if (rows.length > 0) {
                                idMap.warehouses[oldId] = rows[0].id;
                                storeStats.skipped++;
                            }
                        }
                        else {
                            console.error(`  ❌ Warehouse ${oldId}: ${err.message}`);
                            storeStats.errors++;
                        }
                    }
                }
                else {
                    idMap.warehouses[oldId] = newId;
                    storeStats.inserted++;
                }
            }
            if (!DRY_RUN)
                yield conn.commit();
        }
        catch (err) {
            yield conn.rollback();
            throw err;
        }
        finally {
            conn.release();
        }
        printStats('Branches', branchStats);
        printStats('Warehouses', storeStats);
    });
}
// ─── STAGE 3: SALESMEN ──────────────────────────────────────
function migrateSalesmen(pool, idMap) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('👔 Stage 3: Migrating Salesmen...');
        const data = loadJson('Sellers.json');
        const stats = { inserted: 0, skipped: 0, errors: 0, total: data.length };
        const conn = yield pool.getConnection();
        try {
            yield conn.beginTransaction();
            for (const seller of data) {
                const oldId = String(seller.ID);
                if (idMap.salesmen[oldId]) {
                    stats.skipped++;
                    continue;
                }
                const newId = (0, crypto_1.randomUUID)();
                const name = sanitize(seller.Title) || `Salesman-${oldId}`;
                const phone = sanitize(seller.Tel);
                if (!DRY_RUN) {
                    try {
                        yield conn.query(`INSERT INTO salesmen (id, name, phone, type) VALUES (?, ?, ?, 'SALES')`, [newId, name, phone || null]);
                        idMap.salesmen[oldId] = newId;
                        stats.inserted++;
                    }
                    catch (err) {
                        console.error(`  ❌ Salesman ${oldId}: ${err.message}`);
                        stats.errors++;
                    }
                }
                else {
                    idMap.salesmen[oldId] = newId;
                    stats.inserted++;
                }
            }
            if (!DRY_RUN)
                yield conn.commit();
        }
        catch (err) {
            yield conn.rollback();
            throw err;
        }
        finally {
            conn.release();
        }
        printStats('Salesmen', stats);
    });
}
// ─── STAGE 4: PARTNERS (CUSTOMERS + SUPPLIERS) ─────────────
function migratePartners(pool, idMap) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('👥 Stage 4: Migrating Partners...');
        const data = loadJson('Persons.json');
        const stats = { inserted: 0, skipped: 0, errors: 0, total: data.length };
        const conn = yield pool.getConnection();
        try {
            for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
                const batch = data.slice(batchStart, batchStart + BATCH_SIZE);
                yield conn.beginTransaction();
                for (const person of batch) {
                    const oldId = String(person.ID);
                    if (idMap.partners[oldId]) {
                        stats.skipped++;
                        continue;
                    }
                    const newId = (0, crypto_1.randomUUID)();
                    const name = sanitize(person.title) || sanitize(person.etitle) || `Partner-${oldId}`;
                    const phone = sanitize(person.mobile);
                    const email = sanitize(person.email);
                    const address = sanitize(person.address);
                    const taxId = sanitize(person.TaxRecordNo);
                    const commercialRegister = sanitize(person.CommercialRecordNO);
                    const contactPerson = sanitize(person.ResponsiblePerson);
                    const creditLimit = safeNum(person.creditLimit);
                    // Type mapping: 1=cash customer, 2=regular customer, 4=vendor
                    const oldType = safeNum(person.type);
                    let type = 'CUSTOMER';
                    let isCustomer = true;
                    let isSupplier = false;
                    if (oldType === 4) {
                        type = 'SUPPLIER';
                        isCustomer = false;
                        isSupplier = true;
                    }
                    else {
                        type = 'CUSTOMER';
                        isCustomer = true;
                        isSupplier = false;
                    }
                    // Balance: balanceType 1=debit(owes us), 2=credit(we owe)
                    let openingBalance = safeNum(person.startBalance);
                    const balanceType = safeNum(person.balanceType);
                    // In our system: positive = partner owes us, negative = we owe partner
                    // For suppliers: debit balance = we owe them (negative)
                    // For customers: debit balance = they owe us (positive)
                    if (type === 'SUPPLIER' && balanceType === 1) {
                        openingBalance = -Math.abs(openingBalance); // We owe them
                    }
                    else if (type === 'CUSTOMER' && balanceType === 2) {
                        openingBalance = -Math.abs(openingBalance); // They overpaid
                    }
                    if (!DRY_RUN) {
                        try {
                            yield conn.query(`INSERT INTO partners (id, name, type, isCustomer, isSupplier, balance, phone, email, 
               address, taxId, commercialRegister, contactPerson, openingBalance, creditLimit, 
               classification, status) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NORMAL', 'ACTIVE')`, [
                                newId, name, type, isCustomer, isSupplier, openingBalance,
                                phone || null, email || null, address || null,
                                taxId || null, commercialRegister || null, contactPerson || null,
                                openingBalance, creditLimit
                            ]);
                            idMap.partners[oldId] = newId;
                            stats.inserted++;
                        }
                        catch (err) {
                            console.error(`  ❌ Partner ${oldId} (${name}): ${err.message}`);
                            stats.errors++;
                        }
                    }
                    else {
                        idMap.partners[oldId] = newId;
                        stats.inserted++;
                    }
                }
                if (!DRY_RUN)
                    yield conn.commit();
                if (batchStart % 2000 === 0 && batchStart > 0) {
                    console.log(`    ... processed ${batchStart}/${data.length} partners`);
                }
            }
        }
        catch (err) {
            yield conn.rollback();
            throw err;
        }
        finally {
            conn.release();
        }
        printStats('Partners', stats);
    });
}
// ─── STAGE 5: PRODUCTS + PRICE LISTS ────────────────────────
function migrateProducts(pool, idMap) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('📦 Stage 5: Migrating Products...');
        const data = loadJson('items.json');
        const stats = { inserted: 0, skipped: 0, errors: 0, total: data.length };
        const conn = yield pool.getConnection();
        try {
            // First, ensure we have price lists for wholesale
            let wholesalePriceListId = null;
            let retailPriceListId = null;
            if (!DRY_RUN) {
                // Check if price lists already exist
                const [existingLists] = yield conn.query(`SELECT id, name FROM price_lists`);
                const wholesale = existingLists.find((pl) => pl.name.includes('جملة') || pl.name.toLowerCase().includes('wholesale'));
                const retail = existingLists.find((pl) => pl.name.includes('قطاعي') || pl.name.toLowerCase().includes('retail'));
                if (!wholesale) {
                    wholesalePriceListId = (0, crypto_1.randomUUID)();
                    yield conn.query(`INSERT INTO price_lists (id, name, description, isActive) VALUES (?, ?, ?, ?)`, [wholesalePriceListId, 'سعر الجملة (مهاجر)', 'Wholesale price imported from old ERP', true]);
                    console.log(`  📋 Created wholesale price list: ${wholesalePriceListId}`);
                }
                else {
                    wholesalePriceListId = wholesale.id;
                }
                if (!retail) {
                    retailPriceListId = (0, crypto_1.randomUUID)();
                    yield conn.query(`INSERT INTO price_lists (id, name, description, isActive) VALUES (?, ?, ?, ?)`, [retailPriceListId, 'سعر القطاعي (مهاجر)', 'Retail unit price imported from old ERP', true]);
                    console.log(`  📋 Created retail price list: ${retailPriceListId}`);
                }
                else {
                    retailPriceListId = retail.id;
                }
            }
            // Process products in batches
            for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
                const batch = data.slice(batchStart, batchStart + BATCH_SIZE);
                yield conn.beginTransaction();
                for (const item of batch) {
                    const oldId = String(item.ID);
                    if (idMap.products[oldId]) {
                        stats.skipped++;
                        continue;
                    }
                    const newId = (0, crypto_1.randomUUID)();
                    const name = sanitize(item.title) || `Product-${oldId}`;
                    const sku = sanitize(item.batchNum) || `OLD-${oldId}`;
                    const barcode = sanitize(item.barCode);
                    const description = sanitize(item.Etitle); // English name as description
                    const cost = safeNum(item.buyPrice);
                    const price = safeNum(item.SellPrice_Peice); // Retail price as main price
                    const wholesalePrice = safeNum(item.SellPrice_Gomla);
                    const unit = sanitize(item.unit) || 'piece';
                    const categoryId = idMap.categories[String(item.cat_id)] || null;
                    const warehouseId = idMap.warehouses[String(item.storeID)] || null;
                    const minStock = safeNum(item.requestLimit);
                    const stock = safeNum(item.openBalance);
                    if (!DRY_RUN) {
                        try {
                            yield conn.query(`INSERT INTO products (id, name, sku, barcode, description, price, cost, stock, 
               minStock, unit, categoryId, warehouseId, type) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`, [
                                newId, name, sku, barcode || null, description || null,
                                price, cost, stock, minStock, unit,
                                categoryId, warehouseId
                            ]);
                            idMap.products[oldId] = newId;
                            stats.inserted++;
                            // Create product_stocks entry if we have warehouse and stock
                            if (warehouseId && stock > 0) {
                                const stockId = (0, crypto_1.randomUUID)();
                                yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) 
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE stock = stock + ?`, [stockId, newId, warehouseId, stock, stock]);
                            }
                            // Add wholesale price to price list
                            if (wholesalePriceListId && wholesalePrice > 0) {
                                yield conn.query(`INSERT INTO product_prices (productId, priceListId, price) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE price = ?`, [newId, wholesalePriceListId, wholesalePrice, wholesalePrice]);
                            }
                            // Add retail price to price list (if different from main price)
                            if (retailPriceListId && price > 0) {
                                yield conn.query(`INSERT INTO product_prices (productId, priceListId, price) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE price = ?`, [newId, retailPriceListId, price, price]);
                            }
                        }
                        catch (err) {
                            if (err.code === 'ER_DUP_ENTRY') {
                                // SKU already exists
                                const [rows] = yield conn.query(`SELECT id FROM products WHERE sku = ?`, [sku]);
                                if (rows.length > 0) {
                                    idMap.products[oldId] = rows[0].id;
                                    stats.skipped++;
                                }
                            }
                            else {
                                console.error(`  ❌ Product ${oldId} (${name}): ${err.message}`);
                                stats.errors++;
                            }
                        }
                    }
                    else {
                        idMap.products[oldId] = newId;
                        stats.inserted++;
                    }
                }
                if (!DRY_RUN)
                    yield conn.commit();
                if (batchStart % 2000 === 0 && batchStart > 0) {
                    console.log(`    ... processed ${batchStart}/${data.length} products`);
                }
            }
        }
        catch (err) {
            yield conn.rollback();
            throw err;
        }
        finally {
            conn.release();
        }
        printStats('Products', stats);
    });
}
// ═══════════════════════════════════════════════════════════
// PHASE 2: INVOICES
// ═══════════════════════════════════════════════════════════
function migrateInvoiceSet(pool, idMap, headerFile, detailFile, invoiceType, prefix, partnerIdField, mapKey) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`🧾 Migrating ${invoiceType} invoices...`);
        const headers = loadJson(headerFile);
        const details = loadJson(detailFile);
        const stats = { inserted: 0, skipped: 0, errors: 0, total: headers.length };
        // Build detail lookup: MasterID → details[]
        const detailMap = new Map();
        for (const d of details) {
            const masterId = d.MasterID || d.masterID || d.InvID;
            if (!detailMap.has(masterId))
                detailMap.set(masterId, []);
            detailMap.get(masterId).push(d);
        }
        console.log(`  📊 ${headers.length} headers, ${details.length} detail lines loaded`);
        const conn = yield pool.getConnection();
        try {
            for (let batchStart = 0; batchStart < headers.length; batchStart += BATCH_SIZE) {
                const batch = headers.slice(batchStart, batchStart + BATCH_SIZE);
                yield conn.beginTransaction();
                for (const inv of batch) {
                    const oldId = String(inv.ID);
                    const map = idMap[mapKey];
                    if (map[oldId]) {
                        stats.skipped++;
                        continue;
                    }
                    const newId = (0, crypto_1.randomUUID)();
                    const invNum = sanitize(inv.invNum || inv.InvNo);
                    const number = `${prefix}${invNum || oldId}`;
                    const date = formatDate(inv.invDate || inv.InvDate) || new Date().toISOString().slice(0, 19).replace('T', ' ');
                    const partnerOldId = String(inv[partnerIdField] || inv.CustomerID || inv.VendorID || '');
                    const partnerId = idMap.partners[partnerOldId] || null;
                    // Calculate total from details if not in header
                    const invDetails = detailMap.get(inv.ID) || [];
                    let total = safeNum(inv.InvNet || inv.invNet);
                    if (!total && invDetails.length > 0) {
                        total = invDetails.reduce((sum, d) => sum + safeNum(d.total || d.Total || (safeNum(d.price || d.Price) * safeNum(d.quan || d.Quan))), 0);
                    }
                    const discount = safeNum(inv.invDiscount || inv.InvDiscount);
                    // Old system: discountType 1=Flat, 2=Percentage
                    const discountType = (inv.discountType || inv.DiscountType || 1);
                    const globalDiscountType = discountType === 2 ? 'PERCENT' : 'FIXED';
                    const shippingFee = safeNum(inv.invAdds || inv.InvAdds);
                    const notes = sanitize(inv.notes || inv.Notes);
                    const salesmanId = idMap.salesmen[String(inv.SellerID || inv.sellerID)] || null;
                    const warehouseId = idMap.warehouses[String(inv.StoreID || inv.storeID)] || null;
                    // Determine partner name from the partner table
                    let partnerName = '';
                    if (partnerId && !DRY_RUN) {
                        const [pRows] = yield conn.query(`SELECT name FROM partners WHERE id = ?`, [partnerId]);
                        if (pRows.length > 0)
                            partnerName = pRows[0].name;
                    }
                    // Determine cash vs credit from old Status field (1=Cash, 2=Credit)
                    const isCash = (inv.Status || 1) === 1;
                    const paymentMethod = isCash ? 'CASH' : 'CREDIT';
                    const paidAmount = isCash ? total : 0;
                    if (!DRY_RUN) {
                        try {
                            yield conn.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status, 
               paymentMethod, posted, notes, globalDiscount, globalDiscountType, shippingFee, warehouseId, 
               number, salesmanId, paidAmount, createdBy) 
               VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', ?, TRUE, ?, ?, ?, ?, ?, ?, ?, ?, 'Migration')`, [
                                newId, date, invoiceType, partnerId, partnerName, total,
                                paymentMethod, notes || null, discount, globalDiscountType, shippingFee,
                                warehouseId, number, salesmanId, paidAmount
                            ]);
                            // Insert invoice lines
                            for (const d of invDetails) {
                                const productOldId = String(d.ItemID || d.itemID);
                                const productId = idMap.products[productOldId] || null;
                                const qty = safeNum(d.quan || d.Quan);
                                const linePrice = safeNum(d.price || d.Price);
                                const lineCost = safeNum(d.BuyPrice || d.buyPrice || d.cost);
                                const lineDiscount = safeNum(d.discount || d.Discount);
                                const lineTotal = safeNum(d.total || d.Total || (linePrice * qty - lineDiscount));
                                let productName = '';
                                if (productId) {
                                    const [prRows] = yield conn.query(`SELECT name FROM products WHERE id = ?`, [productId]);
                                    if (prRows.length > 0)
                                        productName = prRows[0].name;
                                }
                                yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [newId, productId, productName, qty, linePrice, lineCost, lineDiscount, lineTotal]);
                            }
                            map[oldId] = newId;
                            stats.inserted++;
                        }
                        catch (err) {
                            console.error(`  ❌ Invoice ${number}: ${err.message}`);
                            stats.errors++;
                        }
                    }
                    else {
                        map[oldId] = newId;
                        stats.inserted++;
                    }
                }
                if (!DRY_RUN)
                    yield conn.commit();
                if (batchStart % 2000 === 0 && batchStart > 0) {
                    console.log(`    ... processed ${batchStart}/${headers.length} ${invoiceType} invoices`);
                }
            }
        }
        catch (err) {
            yield conn.rollback();
            throw err;
        }
        finally {
            conn.release();
        }
        printStats(`${invoiceType} Invoices`, stats);
    });
}
function migrateSalesInvoices(pool, idMap) {
    return __awaiter(this, void 0, void 0, function* () {
        yield migrateInvoiceSet(pool, idMap, 'sellInvoice.json', 'sellInvoice_Details.json', 'INVOICE_SALE', 'OLD-S-', 'CustomerID', 'sellInvoices');
    });
}
function migratePurchaseInvoices(pool, idMap) {
    return __awaiter(this, void 0, void 0, function* () {
        yield migrateInvoiceSet(pool, idMap, 'BuyInvoice.json', 'BuyInvoice_Details.json', 'INVOICE_PURCHASE', 'OLD-P-', 'VendorID', 'buyInvoices');
    });
}
function migrateSalesReturns(pool, idMap) {
    return __awaiter(this, void 0, void 0, function* () {
        yield migrateInvoiceSet(pool, idMap, 'sellBackInvoice.json', 'sellBackInvoice_Details.json', 'RETURN_SALE', 'OLD-RS-', 'CustomerID', 'sellBackInvoices');
    });
}
function migratePurchaseReturns(pool, idMap) {
    return __awaiter(this, void 0, void 0, function* () {
        yield migrateInvoiceSet(pool, idMap, 'BuyBackInvoice.json', 'BuyBackInvoice_Details.json', 'RETURN_PURCHASE', 'OLD-RP-', 'VendorID', 'buyBackInvoices');
    });
}
// ═══════════════════════════════════════════════════════════
// PHASE 3: FINANCIAL DATA
// ═══════════════════════════════════════════════════════════
function migratePaymentSet(pool, idMap, headerFile, detailFile, partnerIdField, paymentType, label) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`💰 Migrating ${label}...`);
        const headers = loadJson(headerFile);
        const details = loadJson(detailFile);
        const stats = { inserted: 0, skipped: 0, errors: 0, total: details.length };
        // Build header lookup
        const headerMap = new Map();
        for (const h of headers) {
            headerMap.set(h.ID, h);
        }
        console.log(`  📊 ${headers.length} headers, ${details.length} detail lines`);
        const conn = yield pool.getConnection();
        try {
            for (let batchStart = 0; batchStart < details.length; batchStart += BATCH_SIZE) {
                const batch = details.slice(batchStart, batchStart + BATCH_SIZE);
                yield conn.beginTransaction();
                for (const d of batch) {
                    const header = headerMap.get(d.MasterID);
                    const date = formatDate((header === null || header === void 0 ? void 0 : header.InvDate) || (header === null || header === void 0 ? void 0 : header.invDate)) || new Date().toISOString().slice(0, 19).replace('T', ' ');
                    const partnerOldId = String(d[partnerIdField] || '');
                    const partnerId = idMap.partners[partnerOldId] || null;
                    const value = safeNum(d.Value || d.value);
                    const notes = sanitize(d.Notes);
                    if (!partnerId && partnerIdField !== 'NONE') {
                        stats.skipped++;
                        continue;
                    }
                    const newId = (0, crypto_1.randomUUID)();
                    // Determine debit/credit based on payment type
                    let debit = 0, credit = 0;
                    if (paymentType === 'VENDOR_PAYMENT') {
                        // Paying vendor: debit vendor account (reduces what we owe)
                        debit = value;
                    }
                    else if (paymentType === 'CUSTOMER_PAYMENT') {
                        // Customer pays us: credit customer account (reduces what they owe)
                        credit = value;
                    }
                    else if (paymentType === 'SAFE_PAYMENT') {
                        // Cash expense
                        debit = value;
                    }
                    let partnerName = '';
                    if (partnerId && !DRY_RUN) {
                        const [pRows] = yield conn.query(`SELECT name FROM partners WHERE id = ?`, [partnerId]);
                        if (pRows.length > 0)
                            partnerName = pRows[0].name;
                    }
                    if (!DRY_RUN) {
                        try {
                            yield conn.query(`INSERT INTO account_transactions (id, date, type, partnerId, partnerName, debit, credit, description, createdBy) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Migration')`, [newId, date, paymentType, partnerId, partnerName, debit, credit, notes || `${label} migrated from old ERP`]);
                            stats.inserted++;
                        }
                        catch (err) {
                            console.error(`  ❌ ${label} detail ${d.RowID}: ${err.message}`);
                            stats.errors++;
                        }
                    }
                    else {
                        stats.inserted++;
                    }
                }
                if (!DRY_RUN)
                    yield conn.commit();
                if (batchStart % 5000 === 0 && batchStart > 0) {
                    console.log(`    ... processed ${batchStart}/${details.length} ${label}`);
                }
            }
        }
        catch (err) {
            yield conn.rollback();
            throw err;
        }
        finally {
            conn.release();
        }
        printStats(label, stats);
    });
}
function migrateVendorPayments(pool, idMap) {
    return __awaiter(this, void 0, void 0, function* () {
        yield migratePaymentSet(pool, idMap, 'VendorPayment.json', 'VendorPayment_Details.json', 'VendorID', 'VENDOR_PAYMENT', 'Vendor Payments');
    });
}
function migrateCustomerPayments(pool, idMap) {
    return __awaiter(this, void 0, void 0, function* () {
        yield migratePaymentSet(pool, idMap, 'customer_Payment.json', 'customer_Payment_Details.json', 'CustID', 'CUSTOMER_PAYMENT', 'Customer Payments');
    });
}
function migrateSafePayments(pool, idMap) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('💰 Migrating Safe/Cash Payments...');
        const headers = loadJson('SafePayment.json');
        const details = loadJson('SafePayment_Details.json');
        const stats = { inserted: 0, skipped: 0, errors: 0, total: details.length };
        const headerMap = new Map();
        for (const h of headers) {
            headerMap.set(h.ID, h);
        }
        console.log(`  📊 ${headers.length} headers, ${details.length} detail lines`);
        const conn = yield pool.getConnection();
        try {
            for (let batchStart = 0; batchStart < details.length; batchStart += BATCH_SIZE) {
                const batch = details.slice(batchStart, batchStart + BATCH_SIZE);
                yield conn.beginTransaction();
                for (const d of batch) {
                    const header = headerMap.get(d.MasterID);
                    const date = formatDate(header === null || header === void 0 ? void 0 : header.InvDate) || new Date().toISOString().slice(0, 19).replace('T', ' ');
                    const value = safeNum(d.value);
                    const notes = sanitize(d.Notes);
                    const newId = (0, crypto_1.randomUUID)();
                    if (!DRY_RUN) {
                        try {
                            yield conn.query(`INSERT INTO account_transactions (id, date, type, debit, credit, description, createdBy) 
               VALUES (?, ?, 'SAFE_PAYMENT', ?, 0, ?, 'Migration')`, [newId, date, value, notes || 'Safe payment migrated from old ERP']);
                            stats.inserted++;
                        }
                        catch (err) {
                            console.error(`  ❌ Safe payment ${d.RowID}: ${err.message}`);
                            stats.errors++;
                        }
                    }
                    else {
                        stats.inserted++;
                    }
                }
                if (!DRY_RUN)
                    yield conn.commit();
                if (batchStart % 5000 === 0 && batchStart > 0) {
                    console.log(`    ... processed ${batchStart}/${details.length} safe payments`);
                }
            }
        }
        catch (err) {
            yield conn.rollback();
            throw err;
        }
        finally {
            conn.release();
        }
        printStats('Safe/Cash Payments', stats);
    });
}
// ─── FIX DUAL-ROLE PARTNERS ─────────────────────────────────
// Partners in the old system might be typed as customer-only but
// also have purchase invoices (and vice versa). This detects and WARNS (does NOT auto-fix).
// Auto-fixing was causing balance discrepancies because a supplier with a few sale invoices
// would get isCustomer=1 and their negative supplier balance would appear in Customer Totals.
// The old system never did this — a person's type was fixed at creation time.
function fixDualRolePartners(pool) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n🔄 Post-Migration: Checking for dual-role partner activity...');
        const conn = yield pool.getConnection();
        try {
            // Partners with purchase activity but isSupplier=0
            const [customersWithPurchases] = yield conn.query(`
      SELECT DISTINCT p.id, p.name
      FROM partners p
      JOIN invoices i ON i.partnerId = p.id 
        AND i.type IN ('INVOICE_PURCHASE','RETURN_PURCHASE','PAYMENT','DISCOUNT_EARNED')
        AND i.status IN ('POSTED','COMPLETED','PARTIAL')
      WHERE p.isSupplier = 0
    `);
            if (customersWithPurchases.length > 0) {
                console.log(`  ⚠️ Found ${customersWithPurchases.length} customers with purchase activity (NOT auto-fixing — preserving legacy type):`);
                customersWithPurchases.forEach((p) => console.log(`     → ${p.name}`));
            }
            // Partners with sales activity but isCustomer=0
            const [suppliersWithSales] = yield conn.query(`
      SELECT DISTINCT p.id, p.name
      FROM partners p
      JOIN invoices i ON i.partnerId = p.id 
        AND i.type IN ('INVOICE_SALE','RETURN_SALE','RECEIPT','DISCOUNT_ALLOWED')
        AND i.status IN ('POSTED','COMPLETED','PARTIAL')
      WHERE p.isCustomer = 0
    `);
            if (suppliersWithSales.length > 0) {
                console.log(`  ⚠️ Found ${suppliersWithSales.length} suppliers with sales activity (NOT auto-fixing — preserving legacy type):`);
                suppliersWithSales.forEach((p) => console.log(`     → ${p.name}`));
            }
            if (customersWithPurchases.length === 0 && suppliersWithSales.length === 0) {
                console.log('  ✅ All partner flags are correct — no dual-role issues detected.');
            }
        }
        finally {
            conn.release();
        }
    });
}
// ═══════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════
main().catch(err => {
    console.error('UNHANDLED ERROR:', err);
    process.exit(1);
});
