"use strict";
/**
 * FINAL FIX: Recalculate Invoice Totals from Line Items + Apply Correct Discount Type
 *
 * The line items are the source of truth.
 * 1. Sum line totals from invoice_lines in DB
 * 2. Read legacy JSON to determine discountType (1=FIXED, 2=PERCENT) and raw value
 * 3. If PERCENT: globalDiscount = subtotal * (value/100), recalculate net total
 * 4. If FIXED: globalDiscount = value, recalculate net total
 * 5. Update invoice with correct total, globalDiscount, globalDiscountType, globalDiscountValue
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const MALI_DATA_DIR = process.env.MIGRATION_DATA_DIR || path.resolve(__dirname, '../../mall stuff/data');
const loadJson = (filename) => {
    const filePath = path.join(MALI_DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n══════════════════════════════════════════════');
        console.log('  🔧 FINAL FIX: Recalculate Totals from Lines');
        console.log('══════════════════════════════════════════════\n');
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const conn = yield pool.getConnection();
        try {
            // Step 1: Load all invoices from DB
            console.log('  📦 Loading invoices from DB...');
            const [invRows] = yield conn.query('SELECT id, number, total, shippingFee, globalDiscount, globalDiscountType, globalDiscountValue FROM invoices');
            const invMap = new Map();
            for (const row of invRows) {
                invMap.set(row.number, row);
            }
            console.log(`     Loaded ${invRows.length} invoices.`);
            // Step 2: Calculate subtotals from invoice_lines
            console.log('  📦 Loading line totals from DB...');
            const [lineRows] = yield conn.query('SELECT invoiceId, SUM(total) as lineSubtotal FROM invoice_lines GROUP BY invoiceId');
            const lineSubtotals = new Map();
            for (const row of lineRows) {
                lineSubtotals.set(row.invoiceId, Number(row.lineSubtotal));
            }
            console.log(`     Loaded line subtotals for ${lineSubtotals.size} invoices.`);
            // Step 3: Process each legacy file
            const filesToProcess = [
                { file: 'BuyInvoice.json', prefix: 'OLD-P-', name: 'PURCHASE' },
                { file: 'sellInvoice.json', prefix: 'OLD-S-', name: 'SALE' },
                { file: 'BuyBackInvoice.json', prefix: 'OLD-PR-', name: 'RETURN_PURCHASE' },
                { file: 'sellBackInvoice.json', prefix: 'OLD-SR-', name: 'RETURN_SALE' },
            ];
            let updatedCount = 0;
            let skippedCount = 0;
            let percentCount = 0;
            let fixedCount = 0;
            let noDiscountCount = 0;
            let changedTotals = [];
            for (const task of filesToProcess) {
                console.log(`\n  👉 Processing ${task.name} from ${task.file}...`);
                try {
                    const headers = loadJson(task.file);
                    console.log(`     Found ${headers.length} headers.`);
                    let batch = [];
                    for (const h of headers) {
                        const invNumString = String(h.invNum || h.ID);
                        const invoiceNumber = `${task.prefix}${invNumString}`;
                        const inv = invMap.get(invoiceNumber);
                        if (!inv) {
                            skippedCount++;
                            continue;
                        }
                        const subtotal = lineSubtotals.get(inv.id) || 0;
                        if (subtotal === 0) {
                            skippedCount++;
                            continue;
                        }
                        const discountTypeParam = h.discountType; // 1=FIXED, 2=PERCENT
                        const discountRaw = Number(h.invDiscount || h.InvDiscount || 0);
                        const shippingFee = Number(inv.shippingFee || 0);
                        let sqlDiscountType;
                        let sqlGlobalDiscount; // The EGP amount deducted
                        let sqlGlobalDiscountValue; // The raw user input (5 for 5%, or 100 for 100 EGP)
                        let newTotal;
                        if (discountRaw === 0) {
                            // No discount — just recalculate total from lines
                            sqlDiscountType = 'FIXED';
                            sqlGlobalDiscount = 0;
                            sqlGlobalDiscountValue = 0;
                            newTotal = subtotal + shippingFee;
                            noDiscountCount++;
                        }
                        else if (discountTypeParam == 2) {
                            // PERCENT
                            sqlDiscountType = 'PERCENT';
                            sqlGlobalDiscountValue = discountRaw; // e.g. 5 for 5%
                            sqlGlobalDiscount = Math.round(subtotal * (discountRaw / 100) * 100) / 100;
                            newTotal = Math.round((subtotal - sqlGlobalDiscount + shippingFee) * 100) / 100;
                            percentCount++;
                        }
                        else {
                            // FIXED
                            sqlDiscountType = 'FIXED';
                            sqlGlobalDiscountValue = discountRaw;
                            sqlGlobalDiscount = discountRaw;
                            newTotal = Math.round((subtotal - discountRaw + shippingFee) * 100) / 100;
                            fixedCount++;
                        }
                        const oldTotal = Number(inv.total);
                        if (Math.abs(oldTotal - newTotal) > 0.01) {
                            changedTotals.push({
                                number: invoiceNumber,
                                oldTotal,
                                newTotal,
                                discType: sqlDiscountType,
                                discValue: sqlGlobalDiscountValue,
                                discEGP: sqlGlobalDiscount
                            });
                        }
                        // [globalDiscountType, globalDiscount (EGP), globalDiscountValue (raw), total, id]
                        batch.push([sqlDiscountType, sqlGlobalDiscount, sqlGlobalDiscountValue, newTotal, inv.id]);
                        if (batch.length >= 2000) {
                            yield updateBatch(conn, batch);
                            updatedCount += batch.length;
                            batch = [];
                        }
                    }
                    if (batch.length > 0) {
                        yield updateBatch(conn, batch);
                        updatedCount += batch.length;
                    }
                    console.log(`     ✅ Done with ${task.name}.`);
                }
                catch (e) {
                    console.log(`     ⚠️ Skipping ${task.file}: ${e.message}`);
                }
            }
            console.log('\n══════════════════════════════════════════════');
            console.log('  📊 RESULTS');
            console.log('══════════════════════════════════════════════');
            console.log(`  Updated:        ${updatedCount}`);
            console.log(`  Skipped:        ${skippedCount}`);
            console.log(`  PERCENT type:   ${percentCount}`);
            console.log(`  FIXED type:     ${fixedCount}`);
            console.log(`  No discount:    ${noDiscountCount}`);
            console.log(`  Totals changed: ${changedTotals.length}`);
            if (changedTotals.length > 0) {
                console.log('\n  📝 Sample changed totals (first 20):');
                changedTotals.slice(0, 20).forEach(c => {
                    console.log(`     ${c.number}: ${c.oldTotal} → ${c.newTotal} (${c.discType} ${c.discValue} = ${c.discEGP} EGP)`);
                });
            }
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
function updateBatch(conn, batch) {
    return __awaiter(this, void 0, void 0, function* () {
        const promises = batch.map(args => {
            return conn.query(`UPDATE invoices SET globalDiscountType = ?, globalDiscount = ?, globalDiscountValue = ?, total = ? WHERE id = ?`, args);
        });
        yield Promise.all(promises);
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
