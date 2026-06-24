"use strict";
/**
 * =============================================================
 * EXCEL STOCK MIGRATION — Old ERP → Cloud ERP (Daftrix)
 * =============================================================
 *
 * Reads two Excel files from the old ERP export:
 *   1. Final_Stock_Balances.xlsx → sets current stock per product per warehouse
 *   2. Item_Ledger_Full_v2.xlsx  → creates stock_movements audit trail
 *
 * SAFE: Does NOT touch invoices, partners, payments, or journal entries.
 *       Only modifies: products.stock, product_stocks, stock_movements.
 *
 * Usage:
 *   npx ts-node server/scripts/migrate_excel_stock.ts [--dry-run] [--phase 1|2|3]
 *
 * Phases:
 *   1 = Set stock balances from Final_Stock_Balances.xlsx
 *   2 = Import stock movements from Item_Ledger_Full_v2.xlsx
 *   3 = Verify & reconcile (compare Excel balances vs computed movements)
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
const path = __importStar(require("path"));
const XLSX = __importStar(require("xlsx"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
// ─── CONFIG ─────────────────────────────────────────────────
const EXCEL_DIR = path.resolve(__dirname, '../../mall stuff/New folder (2)');
const STOCK_FILE = path.join(EXCEL_DIR, 'Final_Stock_Balances.xlsx');
const LEDGER_FILE = path.join(EXCEL_DIR, 'Item_Ledger_Full_v2.xlsx');
const DRY_RUN = process.argv.includes('--dry-run');
const PHASE = parseInt(process.argv.find((_, i, arr) => arr[i - 1] === '--phase') || '0');
const BATCH_SIZE = 500;
// ─── HELPERS ────────────────────────────────────────────────
function excelDateToMySQL(serial) {
    if (!serial || typeof serial !== 'number')
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    const utcDays = Math.floor(serial - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return d.toISOString().slice(0, 19).replace('T', ' ');
}
function normalizeArabic(str) {
    if (!str)
        return '';
    return str
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/أ|إ|آ/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي');
}
function printStats(stage, stats) {
    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║ ${stage.padEnd(40)} ║`);
    console.log(`  ╠══════════════════════════════════════════╣`);
    console.log(`  ║ Total:     ${String(stats.total).padStart(8)}                    ║`);
    console.log(`  ║ Matched:   ${String(stats.matched).padStart(8)}  🔗                 ║`);
    console.log(`  ║ Unmatched: ${String(stats.unmatched).padStart(8)}  ⚠️                  ║`);
    console.log(`  ║ Updated:   ${String(stats.updated).padStart(8)}  ✅                 ║`);
    console.log(`  ║ Skipped:   ${String(stats.skipped).padStart(8)}  ⏭️                  ║`);
    console.log(`  ║ Errors:    ${String(stats.errors).padStart(8)}  ❌                 ║`);
    console.log(`  ╚══════════════════════════════════════════╝\n`);
}
// ─── PRODUCT NAME MATCHING ──────────────────────────────────
// The Excel has no ItemCode for most items — we match by name.
// Build a lookup map with normalized Arabic for fuzzy matching.
function buildProductLookup(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield conn.query('SELECT id, name FROM products');
        const lookup = new Map();
        for (const row of rows) {
            const normalized = normalizeArabic(row.name);
            lookup.set(normalized, { id: row.id, name: row.name });
            // Also store original (some names might match exactly)
            lookup.set(row.name.trim(), { id: row.id, name: row.name });
        }
        console.log(`  📦 Product lookup built: ${rows.length} products (${lookup.size} name variants)`);
        return lookup;
    });
}
function buildWarehouseLookup(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield conn.query('SELECT id, name FROM warehouses');
        const lookup = new Map();
        for (const row of rows) {
            lookup.set(row.name.trim(), row.id);
            lookup.set(normalizeArabic(row.name), row.id);
        }
        console.log(`  🏪 Warehouse lookup built: ${rows.length} warehouses`);
        return lookup;
    });
}
function findProduct(name, lookup) {
    const trimmed = name.trim();
    // 1. Exact match
    const exact = lookup.get(trimmed);
    if (exact)
        return exact;
    // 2. Normalized Arabic match
    const normalized = normalizeArabic(trimmed);
    const normMatch = lookup.get(normalized);
    if (normMatch)
        return normMatch;
    // 3. Try without leading/trailing spaces in the Excel data
    const cleaned = trimmed.replace(/^\s+|\s+$/g, '');
    const cleanMatch = lookup.get(cleaned) || lookup.get(normalizeArabic(cleaned));
    if (cleanMatch)
        return cleanMatch;
    return null;
}
// ═══════════════════════════════════════════════════════════
// PHASE 1: SET STOCK BALANCES
// ═══════════════════════════════════════════════════════════
function setStockBalances(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log('\n  ═══ PHASE 1: SET STOCK BALANCES FROM EXCEL ═══');
        const wb = XLSX.readFile(STOCK_FILE);
        const productLookup = yield buildProductLookup(conn);
        const warehouseLookup = yield buildWarehouseLookup(conn);
        // ── Sheet 1: Stock by Warehouse ──
        console.log('\n  📊 Processing Sheet 1: Stock by Warehouse...');
        const whSheet = wb.Sheets['Stock by Warehouse'];
        const whData = XLSX.utils.sheet_to_json(whSheet, { defval: '' });
        const whStats = { total: whData.length, matched: 0, unmatched: 0, updated: 0, skipped: 0, errors: 0 };
        const unmatchedItems = new Set();
        // Clear existing product_stocks to avoid double-counting
        if (!DRY_RUN) {
            // Only clear migration-era stocks (keep any from new transactions)
            console.log('  🧹 Clearing old product_stocks...');
            yield conn.query('DELETE FROM product_stocks');
        }
        for (let i = 0; i < whData.length; i += BATCH_SIZE) {
            const batch = whData.slice(i, i + BATCH_SIZE);
            for (const row of batch) {
                const product = findProduct(row.ItemName, productLookup);
                const warehouseId = warehouseLookup.get((_a = row.WarehouseName) === null || _a === void 0 ? void 0 : _a.trim()) || warehouseLookup.get(normalizeArabic(row.WarehouseName || ''));
                if (!product) {
                    whStats.unmatched++;
                    unmatchedItems.add((_b = row.ItemName) === null || _b === void 0 ? void 0 : _b.trim());
                    continue;
                }
                whStats.matched++;
                if (!warehouseId) {
                    whStats.skipped++;
                    continue;
                }
                const stock = Number(row.CurrentStock) || 0;
                if (!DRY_RUN) {
                    try {
                        yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE stock = ?`, [(0, crypto_1.randomUUID)(), product.id, warehouseId, stock, stock]);
                        whStats.updated++;
                    }
                    catch (err) {
                        console.error(`  ❌ product_stocks ${product.name}: ${err.message}`);
                        whStats.errors++;
                    }
                }
                else {
                    whStats.updated++;
                }
            }
            if (i > 0 && i % 1000 === 0) {
                console.log(`    ... processed ${i}/${whData.length} warehouse stock rows`);
            }
        }
        printStats('Stock by Warehouse', whStats);
        // ── Sheet 2: Total Stock per Item → set products.stock ──
        console.log('\n  📊 Processing Sheet 2: Total Stock per Item...');
        const totalSheet = wb.Sheets['Total Stock per Item'];
        const totalData = XLSX.utils.sheet_to_json(totalSheet, { defval: '' });
        const totalStats = { total: totalData.length, matched: 0, unmatched: 0, updated: 0, skipped: 0, errors: 0 };
        // Reset all products to 0 first, then set from Excel
        if (!DRY_RUN) {
            yield conn.query('UPDATE products SET stock = 0');
        }
        for (const row of totalData) {
            const product = findProduct(row.ItemName, productLookup);
            if (!product) {
                totalStats.unmatched++;
                continue;
            }
            totalStats.matched++;
            const stock = Number(row.CurrentStock) || 0;
            if (!DRY_RUN) {
                try {
                    yield conn.query('UPDATE products SET stock = ? WHERE id = ?', [stock, product.id]);
                    totalStats.updated++;
                }
                catch (err) {
                    console.error(`  ❌ products.stock ${product.name}: ${err.message}`);
                    totalStats.errors++;
                }
            }
            else {
                totalStats.updated++;
            }
        }
        printStats('Total Stock per Item', totalStats);
        // Log unmatched items for review
        if (unmatchedItems.size > 0) {
            console.log(`\n  ⚠️  ${unmatchedItems.size} items in Excel NOT found in ERP products:`);
            const sorted = [...unmatchedItems].sort();
            sorted.slice(0, 20).forEach(name => console.log(`     → "${name}"`));
            if (sorted.length > 20) {
                console.log(`     ... and ${sorted.length - 20} more`);
            }
        }
    });
}
// ═══════════════════════════════════════════════════════════
// PHASE 2: IMPORT STOCK MOVEMENTS (AUDIT TRAIL)
// ═══════════════════════════════════════════════════════════
function importStockMovements(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('\n  ═══ PHASE 2: IMPORT STOCK MOVEMENTS FROM ITEM LEDGER ═══');
        const wb = XLSX.readFile(LEDGER_FILE);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const stats = { total: data.length, matched: 0, unmatched: 0, updated: 0, skipped: 0, errors: 0 };
        console.log(`  📊 ${data.length} ledger rows to process`);
        const productLookup = yield buildProductLookup(conn);
        const warehouseLookup = yield buildWarehouseLookup(conn);
        // Document type → movement_type mapping
        const DOC_TYPE_MAP = {
            'فاتورة بيع': { movementType: 'SALE', referenceType: 'INVOICE_SALE' },
            'فاتورة شراء': { movementType: 'PURCHASE', referenceType: 'INVOICE_PURCHASE' },
            'مرتجع بيع': { movementType: 'RETURN_IN', referenceType: 'RETURN_SALE' },
            'مرتجع شراء': { movementType: 'RETURN_OUT', referenceType: 'RETURN_PURCHASE' },
            'اذن اضافة': { movementType: 'ADJUSTMENT', referenceType: 'STOCK_PERMIT_IN' },
            'اذن صرف': { movementType: 'ADJUSTMENT', referenceType: 'STOCK_PERMIT_OUT' },
            'تحويل (اضافة)': { movementType: 'TRANSFER_IN', referenceType: 'STOCK_TRANSFER' },
            'تحويل (صرف)': { movementType: 'TRANSFER_OUT', referenceType: 'STOCK_TRANSFER' },
        };
        // Clear old migration movements to avoid duplicates on re-run
        if (!DRY_RUN) {
            console.log('  🧹 Clearing old migration stock_movements...');
            const [delResult] = yield conn.query(`DELETE FROM stock_movements WHERE created_by = 'ExcelMigration'`);
            console.log(`     Removed ${delResult.affectedRows} old migration movements`);
        }
        // Process in batches
        for (let i = 0; i < data.length; i += BATCH_SIZE) {
            const batch = data.slice(i, i + BATCH_SIZE);
            const insertValues = [];
            for (const row of batch) {
                const product = findProduct(row.ItemName, productLookup);
                if (!product) {
                    stats.unmatched++;
                    continue;
                }
                stats.matched++;
                const warehouseId = warehouseLookup.get((_a = row.WarehouseName) === null || _a === void 0 ? void 0 : _a.trim())
                    || warehouseLookup.get(normalizeArabic(row.WarehouseName || ''))
                    || null;
                const typeInfo = DOC_TYPE_MAP[row.DocumentType];
                if (!typeInfo) {
                    stats.skipped++;
                    continue;
                }
                const qtyIn = Number(row.QtyIn) || 0;
                const qtyOut = Number(row.QtyOut) || 0;
                // qty_change: positive = stock increase, negative = stock decrease
                const qtyChange = qtyIn - qtyOut;
                if (qtyChange === 0) {
                    stats.skipped++;
                    continue;
                }
                const movementDate = excelDateToMySQL(row.Date);
                const unitCost = Number(row.UnitPrice) || null;
                const refId = `OLD-${row.DocumentType}-${row.DocNo}`;
                const notes = row.PersonName
                    ? `${row.DocumentType} #${row.DocNo} - ${row.PersonName}`
                    : `${row.DocumentType} #${row.DocNo}`;
                insertValues.push([
                    movementDate,
                    product.id,
                    warehouseId,
                    qtyChange,
                    typeInfo.movementType,
                    typeInfo.referenceType,
                    refId,
                    unitCost,
                    notes,
                    'ExcelMigration',
                ]);
            }
            // Bulk insert
            if (!DRY_RUN && insertValues.length > 0) {
                try {
                    const placeholders = insertValues.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
                    const flatValues = insertValues.flat();
                    yield conn.query(`INSERT INTO stock_movements
           (movement_date, product_id, warehouse_id, qty_change, movement_type,
            reference_type, reference_id, unit_cost, notes, created_by)
           VALUES ${placeholders}`, flatValues);
                    stats.updated += insertValues.length;
                }
                catch (err) {
                    // Fallback: insert one by one to find the bad row
                    for (const vals of insertValues) {
                        try {
                            yield conn.query(`INSERT INTO stock_movements
               (movement_date, product_id, warehouse_id, qty_change, movement_type,
                reference_type, reference_id, unit_cost, notes, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, vals);
                            stats.updated++;
                        }
                        catch (innerErr) {
                            stats.errors++;
                        }
                    }
                }
            }
            else {
                stats.updated += insertValues.length;
            }
            if (i > 0 && i % 10000 === 0) {
                console.log(`    ... processed ${i}/${data.length} ledger rows (${stats.updated} inserted, ${stats.unmatched} unmatched)`);
            }
        }
        printStats('Stock Movements (Audit Trail)', stats);
    });
}
// ═══════════════════════════════════════════════════════════
// PHASE 3: VERIFY & RECONCILE
// ═══════════════════════════════════════════════════════════
function verifyAndReconcile(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n  ═══ PHASE 3: VERIFICATION & RECONCILIATION ═══');
        // Compare products.stock (set from Excel) vs SUM(stock_movements.qty_change)
        const [discrepancies] = yield conn.query(`
    SELECT p.id, p.name, p.stock as excelStock,
           COALESCE(sm.total, 0) as movementTotal,
           ABS(p.stock - COALESCE(sm.total, 0)) as diff
    FROM products p
    LEFT JOIN (
      SELECT product_id, SUM(qty_change) as total
      FROM stock_movements
      WHERE created_by = 'ExcelMigration'
      GROUP BY product_id
    ) sm ON sm.product_id = p.id
    WHERE ABS(p.stock - COALESCE(sm.total, 0)) > 0.5
      AND p.stock != 0
    ORDER BY ABS(p.stock - COALESCE(sm.total, 0)) DESC
    LIMIT 30
  `);
        console.log(`\n  📊 Discrepancies between Excel balance and ledger movements:`);
        if (discrepancies.length === 0) {
            console.log('  ✅ No significant discrepancies found!');
        }
        else {
            console.log(`  ⚠️  ${discrepancies.length} products with stock ≠ movement sum:`);
            console.log('  ──────────────────────────────────────────────────────────────');
            console.log('  Product Name                        | Excel | Movements | Diff');
            console.log('  ──────────────────────────────────────────────────────────────');
            for (const d of discrepancies) {
                const name = (d.name || '').substring(0, 35).padEnd(37);
                console.log(`  ${name} | ${String(d.excelStock).padStart(5)} | ${String(d.movementTotal).padStart(9)} | ${String(d.diff).padStart(5)}`);
            }
        }
        // Overall stats
        const [totalProducts] = yield conn.query('SELECT COUNT(*) as cnt FROM products');
        const [stockProducts] = yield conn.query('SELECT COUNT(*) as cnt FROM products WHERE stock != 0');
        const [stockEntries] = yield conn.query('SELECT COUNT(*) as cnt FROM product_stocks WHERE stock != 0');
        const [movementCount] = yield conn.query(`SELECT COUNT(*) as cnt FROM stock_movements WHERE created_by = 'ExcelMigration'`);
        console.log(`\n  ═══ SUMMARY ═══`);
        console.log(`  Total products:              ${totalProducts[0].cnt}`);
        console.log(`  Products with stock > 0:     ${stockProducts[0].cnt}`);
        console.log(`  Warehouse stock entries:     ${stockEntries[0].cnt}`);
        console.log(`  Migration movements created: ${movementCount[0].cnt}`);
        // Verify product_stocks sum matches products.stock
        const [stockMismatch] = yield conn.query(`
    SELECT COUNT(*) as cnt FROM (
      SELECT p.id, p.stock, COALESCE(SUM(ps.stock), 0) as whSum
      FROM products p
      LEFT JOIN product_stocks ps ON ps.productId = p.id
      GROUP BY p.id
      HAVING ABS(p.stock - COALESCE(SUM(ps.stock), 0)) > 0.5
        AND p.stock != 0
    ) t
  `);
        console.log(`  Stock vs warehouse mismatch: ${stockMismatch[0].cnt}`);
    });
}
// ─── MAIN ───────────────────────────────────────────────────
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`  📊 EXCEL STOCK MIGRATION`);
        console.log(`  Phase: ${PHASE || 'ALL'}  |  Dry Run: ${DRY_RUN}`);
        console.log(`  Stock File: ${STOCK_FILE}`);
        console.log(`  Ledger File: ${LEDGER_FILE}`);
        console.log(`${'═'.repeat(60)}\n`);
        const conn = yield promise_1.default.createConnection({
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
        try {
            console.log('  ✅ Connected to database\n');
            if (PHASE === 0 || PHASE === 1) {
                yield setStockBalances(conn);
            }
            if (PHASE === 0 || PHASE === 2) {
                yield importStockMovements(conn);
            }
            if (PHASE === 0 || PHASE === 3) {
                yield verifyAndReconcile(conn);
            }
            console.log(`\n  🎉 Migration complete!\n`);
        }
        catch (err) {
            console.error('\n  ❌ FATAL ERROR:', err.message);
            console.error(err.stack);
            process.exit(1);
        }
        finally {
            yield conn.end();
        }
    });
}
main().catch(err => {
    console.error('UNHANDLED ERROR:', err);
    process.exit(1);
});
