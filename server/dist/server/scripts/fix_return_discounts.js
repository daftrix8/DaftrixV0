"use strict";
/**
 * FIX: Correct percentage discounts for RETURN_PURCHASE and RETURN_SALE
 *
 * The previous fix script (fix_global_discounts_final.ts) only processed INVOICE_PURCHASE.
 * This script processes RETURN_PURCHASE and RETURN_SALE invoices with the same logic:
 * - Read BuyBackInvoice.json and sellBackInvoice.json for discountType
 * - If discountType=2 (PERCENT), recalculate globalDiscount as percentage of line subtotal
 * - Update globalDiscountType, globalDiscountValue, globalDiscount, and total
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
const MALI_DATA_DIR = path.resolve(__dirname, '../../mall stuff/data');
function loadJson(filename) {
    return JSON.parse(fs.readFileSync(path.join(MALI_DATA_DIR, filename), 'utf8'));
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n══════════════════════════════════════════════');
        console.log('  🔧 FIX: Return Invoice Percentage Discounts');
        console.log('══════════════════════════════════════════════\n');
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const conn = yield pool.getConnection();
        try {
            // Process RETURN_PURCHASE (BuyBackInvoice)
            const buyBack = loadJson('BuyBackInvoice.json');
            const buyBackMap = new Map();
            buyBack.forEach((inv) => buyBackMap.set(inv.invNum, inv));
            yield processReturns(conn, 'RETURN_PURCHASE', 'OLD-RP-', buyBackMap);
            // Process RETURN_SALE (sellBackInvoice)
            const sellBack = loadJson('sellBackInvoice.json');
            const sellBackMap = new Map();
            sellBack.forEach((inv) => sellBackMap.set(inv.invNum, inv));
            yield processReturns(conn, 'RETURN_SALE', 'OLD-RS-', sellBackMap);
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
function processReturns(conn, invoiceType, prefix, legacyMap) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`\n  📋 Processing ${invoiceType}...`);
        // Get all return invoices with discounts
        const [invoices] = yield conn.query(`SELECT i.id, i.number, i.total, i.globalDiscount, i.globalDiscountType,
            (SELECT COALESCE(SUM(il.total), 0) FROM invoice_lines il WHERE il.invoiceId = i.id) as lineSubtotal
     FROM invoices i 
     WHERE i.type = ? AND i.globalDiscount > 0 AND i.number LIKE ?`, [invoiceType, prefix + '%']);
        console.log(`  📊 Found ${invoices.length} invoices with discounts`);
        let fixedCount = 0;
        let skippedCount = 0;
        let samples = [];
        for (const inv of invoices) {
            // Extract old invoice number
            const oldNum = parseInt(inv.number.replace(prefix, ''), 10);
            if (isNaN(oldNum)) {
                skippedCount++;
                continue;
            }
            const legacyInv = legacyMap.get(oldNum);
            if (!legacyInv) {
                skippedCount++;
                continue;
            }
            const discountType = Number(legacyInv.discountType || 1);
            const rawDiscount = Number(legacyInv.invDiscount || 0);
            const lineSubtotal = Number(inv.lineSubtotal || 0);
            if (discountType === 2 && rawDiscount > 0 && lineSubtotal > 0) {
                // PERCENT discount
                const percentValue = rawDiscount; // e.g., 5 means 5%
                const calculatedDiscount = Math.round((lineSubtotal * percentValue / 100) * 100) / 100;
                const newTotal = Math.round((lineSubtotal - calculatedDiscount) * 100) / 100;
                const oldTotal = Number(inv.total);
                const oldDisc = Number(inv.globalDiscount);
                yield conn.query(`UPDATE invoices SET 
          globalDiscountType = 'PERCENT', 
          globalDiscountValue = ?, 
          globalDiscount = ?, 
          total = ? 
         WHERE id = ?`, [percentValue, calculatedDiscount, newTotal, inv.id]);
                fixedCount++;
                if (samples.length < 5) {
                    samples.push({
                        number: inv.number,
                        lineSubtotal,
                        oldDisc,
                        newDisc: calculatedDiscount,
                        oldTotal,
                        newTotal,
                        pct: percentValue
                    });
                }
            }
            else if (discountType === 1 && rawDiscount > 0) {
                // FIXED discount - just ensure type is set
                yield conn.query(`UPDATE invoices SET globalDiscountType = 'FIXED', globalDiscountValue = ? WHERE id = ?`, [rawDiscount, inv.id]);
            }
        }
        console.log(`  ✅ Fixed ${fixedCount} percentage discounts`);
        console.log(`  ⏭️  Skipped ${skippedCount}`);
        if (samples.length > 0) {
            console.log('  📝 Samples:');
            samples.forEach(s => {
                console.log(`     ${s.number}: subtotal=${s.lineSubtotal}, ${s.pct}% → disc ${s.oldDisc}→${s.newDisc}, total ${s.oldTotal}→${s.newTotal}`);
            });
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
