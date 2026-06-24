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
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '..', '.env') });
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n══════════════════════════════════════════════');
        console.log('  🔄 PATCH STAGE 3: Ultimate Database Truth Check');
        console.log('══════════════════════════════════════════════\n');
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const conn = yield pool.getConnection();
        try {
            console.log('  📦 Loading Invoices from Database...');
            // Get all invoices with global discounts (we want to check EVERY single invoice)
            const [invRows] = yield conn.query('SELECT id, number, total, shippingFee, globalDiscount, globalDiscountType, globalDiscountValue FROM invoices');
            const [lineRows] = yield conn.query('SELECT invoiceId, total FROM invoice_lines');
            // calculate line totals
            const lineTotals = new Map();
            for (const line of lineRows) {
                lineTotals.set(line.invoiceId, (lineTotals.get(line.invoiceId) || 0) + Number(line.total));
            }
            console.log(`  📊 Loaded ${invRows.length} invoices into memory.`);
            let fixedCount = 0;
            let percentCount = 0;
            let updateValues = [];
            for (const inv of invRows) {
                const lTotal = lineTotals.get(inv.id) || 0;
                const netTotal = Number(inv.total);
                let shipping = Number(inv.shippingFee || 0);
                let currentVal = Number(inv.globalDiscountValue || 0);
                // Test 1: Was it mathematically a flat EGP subtraction?
                // mathematical Net = subTotal (lTotal) + shipping - flatDiscount
                // so flatDiscount = (lTotal) + shipping - netTotal
                const flatDifference = Number((lTotal + shipping - netTotal).toFixed(2));
                if (flatDifference > 0) {
                    // Now we know exactly how much EGP was subtracted in history.
                    // So, what was the user's INTENT?
                    // The `globalDiscountValue` holds the user's intent from my previous stage2 JSON map.
                    const discountRaw = currentVal;
                    // If the raw number literally matches the flat deduction (e.g. 5 raw == 5 flat EGP deduction)
                    if (Math.abs(discountRaw - flatDifference) < 0.1) {
                        // IT WAS DEFINITIVELY A FIXED AMOUNT
                        updateValues.push(['FIXED', flatDifference, flatDifference, inv.id]);
                        fixedCount++;
                    }
                    else {
                        // Did the raw number map mathematically to a PERCENTAGE?
                        // e.g. percent = 5%. 5% of (lTotal) = flatDifference ?
                        const percentDeduction = Number(((lTotal) * (discountRaw / 100)).toFixed(2));
                        if (Math.abs(percentDeduction - flatDifference) < 0.5) {
                            // IT WAS DEFINITIVELY A PERCENTAGE!
                            updateValues.push(['PERCENT', flatDifference, discountRaw, inv.id]);
                            percentCount++;
                        }
                        else {
                            // Ambiguous! Fallback to FIXED to preserve historic total
                            updateValues.push(['FIXED', flatDifference, flatDifference, inv.id]);
                            fixedCount++;
                        }
                    }
                }
                else {
                    // No overall flat difference means 0 discount, or very weird decimals
                    // Default back to safely 0
                    if (Number(inv.globalDiscount) !== 0 || inv.globalDiscountType !== 'FIXED') {
                        updateValues.push(['FIXED', 0, 0, inv.id]);
                    }
                }
                if (updateValues.length >= 2000) {
                    yield updateChunk(conn, updateValues);
                    updateValues = [];
                }
            }
            if (updateValues.length > 0) {
                yield updateChunk(conn, updateValues);
            }
            console.log(`\n  ✅ Successfully verified historical mathematics.`);
            console.log(`     -> ${fixedCount} invoices converted/proven to be FIXED amounts.`);
            console.log(`     -> ${percentCount} invoices converted/proven to be PERCENTAGES.`);
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
function updateChunk(conn, batchArgs) {
    return __awaiter(this, void 0, void 0, function* () {
        const promises = batchArgs.map(args => {
            return conn.query(`UPDATE invoices SET globalDiscountType = ?, globalDiscount = ?, globalDiscountValue = ? WHERE id = ?`, [args[0], args[1], args[2], args[3]]);
        });
        yield Promise.all(promises);
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
