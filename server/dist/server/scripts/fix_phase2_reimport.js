"use strict";
/**
 * PHASE 2 RE-MIGRATION: Delete old invoices and re-import with fixes
 *
 * Fixes:
 * 1. Invoice types: INVOICE_SALE / INVOICE_PURCHASE (not SALE / PURCHASE)
 * 2. Totals computed from detail lines (price * quan - discount)
 * 3. Invoice lines properly joined via masterID (lowercase)
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
const DATA_DIR = path.resolve(__dirname, '../../mall stuff/data');
const MAPPING_FILE = path.resolve(__dirname, '../../mall stuff/id_mapping.json');
const BATCH_SIZE = 500;
function loadJson(filename) {
    const filepath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filepath)) {
        console.log(`  ⚠️  Not found: ${filename}`);
        return [];
    }
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}
function safeNum(val, fb = 0) { const n = Number(val); return isNaN(n) ? fb : n; }
function sanitize(val) { return val == null ? '' : String(val).trim(); }
function formatDate(ds) {
    if (!ds)
        return null;
    const d = new Date(ds);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        console.log('\n══════════════════════════════════════════════');
        console.log('  🔧 PHASE 2 RE-MIGRATION: Invoice Fix');
        console.log('══════════════════════════════════════════════\n');
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const idMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        const conn = yield pool.getConnection();
        try {
            // ═══════════════════════════════════════════════════════
            // STEP 1: Delete all OLD- invoices and their lines
            // ═══════════════════════════════════════════════════════
            console.log('🗑️  Step 1: Deleting existing OLD- invoices...');
            // Delete invoice lines first (FK constraint)
            const [delLines] = yield conn.query(`
      DELETE il FROM invoice_lines il 
      INNER JOIN invoices i ON il.invoiceId = i.id 
      WHERE i.number LIKE 'OLD-%'
    `);
            console.log(`  Deleted ${delLines.affectedRows} invoice lines`);
            const [delInv] = yield conn.query(`DELETE FROM invoices WHERE number LIKE 'OLD-%'`);
            console.log(`  Deleted ${delInv.affectedRows} invoices`);
            // Clear ID mapping for invoices
            idMap.sellInvoices = {};
            idMap.buyInvoices = {};
            idMap.sellBackInvoices = {};
            idMap.buyBackInvoices = {};
            // ═══════════════════════════════════════════════════════
            // STEP 2: Re-import all invoices with correct types & totals
            // ═══════════════════════════════════════════════════════
            console.log('\n🧾 Step 2: Re-importing invoices...\n');
            // Pre-load product name cache
            const [productRows] = yield conn.query(`SELECT id, name FROM products`);
            const productNameCache = new Map();
            for (const p of productRows)
                productNameCache.set(p.id, p.name);
            // Pre-load partner name cache
            const [partnerRows] = yield conn.query(`SELECT id, name FROM partners`);
            const partnerNameCache = new Map();
            for (const p of partnerRows)
                partnerNameCache.set(p.id, p.name);
            const invoiceSets = [
                { header: 'sellInvoice.json', detail: 'sellInvoice_Details.json', type: 'INVOICE_SALE', prefix: 'OLD-S-', partnerField: 'CustomerID', mapKey: 'sellInvoices' },
                { header: 'BuyInvoice.json', detail: 'BuyInvoice_Details.json', type: 'INVOICE_PURCHASE', prefix: 'OLD-P-', partnerField: 'VendorID', mapKey: 'buyInvoices' },
                { header: 'sellBackInvoice.json', detail: 'sellBackInvoice_Details.json', type: 'RETURN_SALE', prefix: 'OLD-RS-', partnerField: 'CustomerID', mapKey: 'sellBackInvoices' },
                { header: 'BuyBackInvoice.json', detail: 'BuyBackInvoice_Details.json', type: 'RETURN_PURCHASE', prefix: 'OLD-RP-', partnerField: 'VendorID', mapKey: 'buyBackInvoices' },
            ];
            for (const set of invoiceSets) {
                console.log(`  📋 ${set.type} (${set.header})...`);
                const headers = loadJson(set.header);
                const details = loadJson(set.detail);
                // Build detail lookup using lowercase masterID
                const detailMap = new Map();
                for (const d of details) {
                    const mid = (_b = (_a = d.masterID) !== null && _a !== void 0 ? _a : d.MasterID) !== null && _b !== void 0 ? _b : d.InvID;
                    if (mid == null)
                        continue;
                    if (!detailMap.has(mid))
                        detailMap.set(mid, []);
                    detailMap.get(mid).push(d);
                }
                console.log(`    ${headers.length} headers, ${details.length} details, ${detailMap.size} unique masterIDs`);
                let inserted = 0, errors = 0, linesInserted = 0;
                for (let batchStart = 0; batchStart < headers.length; batchStart += BATCH_SIZE) {
                    const batch = headers.slice(batchStart, batchStart + BATCH_SIZE);
                    yield conn.beginTransaction();
                    for (const inv of batch) {
                        const oldId = String(inv.ID);
                        const newId = (0, crypto_1.randomUUID)();
                        const invNum = sanitize(inv.invNum || inv.InvNo);
                        const number = `${set.prefix}${invNum || oldId}`;
                        const date = formatDate(inv.invDate || inv.InvDate) || '2023-01-01 00:00:00';
                        const partnerOldId = String(inv[set.partnerField] || '');
                        const partnerId = ((_c = idMap.partners) === null || _c === void 0 ? void 0 : _c[partnerOldId]) || null;
                        const partnerName = partnerId ? (partnerNameCache.get(partnerId) || '') : '';
                        // Get detail lines for this invoice
                        const invDetails = detailMap.get(inv.ID) || [];
                        // Calculate total from details (NOT from header — header may not have InvNet)
                        let total = 0;
                        if (invDetails.length > 0) {
                            total = invDetails.reduce((sum, d) => {
                                const qty = safeNum(d.quan || d.Quan);
                                const price = safeNum(d.price || d.Price);
                                const disc = safeNum(d.discount || d.Discount);
                                return sum + (price * qty - disc);
                            }, 0);
                        }
                        // Fallback to header total if details empty but header has it
                        if (total === 0) {
                            total = safeNum(inv.InvNet || inv.invNet);
                        }
                        // Apply header-level discount and additions
                        const headerDiscount = safeNum(inv.invDiscount || inv.InvDiscount);
                        const headerAdds = safeNum(inv.invAdds || inv.InvAdds);
                        const finalTotal = total - headerDiscount + headerAdds;
                        const notes = sanitize(inv.notes || inv.Notes);
                        const salesmanId = ((_d = idMap.salesmen) === null || _d === void 0 ? void 0 : _d[String(inv.SellerID || inv.sellerID)]) || null;
                        const warehouseId = ((_e = idMap.warehouses) === null || _e === void 0 ? void 0 : _e[String(inv.StoreID || inv.storeID)]) || null;
                        try {
                            yield conn.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status, 
               paymentMethod, posted, notes, globalDiscount, shippingFee, warehouseId, 
               number, salesmanId, createdBy) 
               VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', 'CASH', TRUE, ?, ?, ?, ?, ?, ?, 'Migration')`, [newId, date, set.type, partnerId, partnerName, finalTotal,
                                notes || null, headerDiscount, headerAdds, warehouseId, number, salesmanId]);
                            // Insert invoice lines
                            for (const d of invDetails) {
                                const productOldId = String(d.ItemID || d.itemID);
                                const productId = ((_f = idMap.products) === null || _f === void 0 ? void 0 : _f[productOldId]) || null;
                                const qty = safeNum(d.quan || d.Quan);
                                const linePrice = safeNum(d.price || d.Price);
                                const lineCost = safeNum(d.BuyPrice || d.buyPrice || d.cost);
                                const lineDiscount = safeNum(d.discount || d.Discount);
                                const lineTotal = linePrice * qty - lineDiscount;
                                const productName = productId ? (productNameCache.get(productId) || '') : '';
                                const lineWarehouseId = ((_g = idMap.warehouses) === null || _g === void 0 ? void 0 : _g[String(d.StoreID || d.storeID)]) || warehouseId;
                                yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, warehouseId) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [newId, productId, productName, qty, linePrice, lineCost, lineDiscount, lineTotal, lineWarehouseId]);
                                linesInserted++;
                            }
                            idMap[set.mapKey][oldId] = newId;
                            inserted++;
                        }
                        catch (err) {
                            console.error(`    ❌ ${number}: ${err.message}`);
                            errors++;
                        }
                    }
                    yield conn.commit();
                    if (batchStart % 2000 === 0 && batchStart > 0) {
                        console.log(`    ... ${batchStart}/${headers.length}`);
                    }
                }
                console.log(`    ✅ ${inserted} invoices, ${linesInserted} lines (${errors} errors)`);
            }
            // ═══════════════════════════════════════════════════════
            // STEP 3: Recalculate partner balances
            // ═══════════════════════════════════════════════════════
            console.log('\n💰 Step 3: Recalculating partner balances...');
            yield conn.query(`
      UPDATE partners p SET p.balance = (
        p.openingBalance
        + COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'INVOICE_PURCHASE'), 0)
        - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_PURCHASE'), 0)
        - COALESCE((SELECT SUM(at2.debit) FROM account_transactions at2 WHERE at2.partnerId = p.id AND at2.type = 'VENDOR_PAYMENT'), 0)
      )
      WHERE p.type IN ('SUPPLIER', 'BOTH') OR p.isSupplier = TRUE
    `);
            yield conn.query(`
      UPDATE partners p SET p.balance = (
        p.openingBalance
        + COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'INVOICE_SALE'), 0)
        - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_SALE'), 0)
        - COALESCE((SELECT SUM(at2.credit) FROM account_transactions at2 WHERE at2.partnerId = p.id AND at2.type = 'CUSTOMER_PAYMENT'), 0)
      )
      WHERE p.type = 'CUSTOMER' OR (p.isCustomer = TRUE AND p.isSupplier = FALSE)
    `);
            // Verify specific partner
            const [ghadia] = yield conn.query(`
      SELECT name, balance, openingBalance FROM partners WHERE name LIKE '%غديه ارت%'
    `);
            if (ghadia.length > 0) {
                console.log(`\n  ✅ ${ghadia[0].name}: balance = ${ghadia[0].balance} (opening: ${ghadia[0].openingBalance})`);
            }
            // Save updated mapping
            fs.writeFileSync(MAPPING_FILE, JSON.stringify(idMap, null, 2), 'utf8');
            console.log('\n  💾 ID mapping saved');
            console.log('\n  🎉 Phase 2 re-migration complete!\n');
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
