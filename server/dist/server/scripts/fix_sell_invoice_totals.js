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
/**
 * FIX: Sell invoice totals using JSON source data
 *
 * For SELL invoices, invDiscount is ALWAYS FLAT regardless of discountType.
 * Some sell invoice totals don't match the JSON source data due to rounding
 * errors during migration.
 *
 * This script:
 * 1. Reads old ERP sell invoice JSON data
 * 2. Compares with database totals
 * 3. Corrects any mismatches
 * 4. Recalculates affected partner balances
 */
const promise_1 = __importDefault(require("mysql2/promise"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const DATA_DIR = path.resolve(__dirname, '../../mall stuff/New folder (3)/data');
const DRY_RUN = process.argv.includes('--dry-run');
function loadJson(filename) {
    const fp = path.join(DATA_DIR, filename);
    if (!fs.existsSync(fp))
        return [];
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`🔧 Fix Sell Invoice Totals ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
        console.log('═══════════════════════════════════════════════════════════════\n');
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true,
        });
        // Load sell invoice JSON
        const sellInvoices = loadJson('sellInvoice.json');
        const sellDetails = loadJson('sellInvoice_Details.json');
        const sellDetailsByMaster = new Map();
        for (const d of sellDetails) {
            const mid = d.masterID || d.MasterID;
            if (!sellDetailsByMaster.has(mid))
                sellDetailsByMaster.set(mid, []);
            sellDetailsByMaster.get(mid).push(d);
        }
        // Get ALL sell invoices from DB
        const [dbInvoices] = yield conn.query(`
        SELECT i.id, i.number, i.total, i.globalDiscount, i.globalDiscountType,
               COALESCE(i.shippingFee, 0) as shippingFee, i.partnerId
        FROM invoices i
        WHERE i.type = 'INVOICE_SALE'
          AND i.number LIKE 'OLD-S-%'
          AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
    `);
        console.log(`  DB sell invoices: ${dbInvoices.length}`);
        console.log(`  JSON sell invoices: ${sellInvoices.length}\n`);
        const fixes = [];
        const affectedPartners = new Set();
        for (const inv of dbInvoices) {
            const cleanNum = parseInt(inv.number.replace('OLD-S-', ''));
            const oldInv = sellInvoices.find((h) => h.invNum === cleanNum);
            if (!oldInv)
                continue;
            // For SELL invoices: invDiscount is ALWAYS FLAT
            const flatDiscount = Number(oldInv.invDiscount || 0);
            const details = sellDetailsByMaster.get(oldInv.ID) || [];
            let gross = 0;
            for (const d of details) {
                gross += Number(d.quan || d.Quan || 0) * Number(d.price || d.Price || 0);
            }
            if (gross === 0)
                continue;
            const shipping = Number(inv.shippingFee);
            const correctTotal = Math.round((gross - flatDiscount + shipping) * 100) / 100;
            const currentTotal = Number(inv.total);
            if (Math.abs(currentTotal - correctTotal) > 0.5) {
                fixes.push({
                    id: inv.id, number: inv.number, currentTotal, correctTotal,
                    correctDisc: flatDiscount, partnerId: inv.partnerId,
                });
                affectedPartners.add(inv.partnerId);
            }
        }
        console.log(`  Need fixing: ${fixes.length}`);
        console.log(`  Affected customers: ${affectedPartners.size}`);
        const totalImpact = fixes.reduce((s, f) => s + (f.correctTotal - f.currentTotal), 0);
        console.log(`  Total impact: ${Math.round(totalImpact * 100) / 100}\n`);
        if (fixes.length === 0) {
            console.log('✅ Nothing to fix!');
            yield conn.end();
            return;
        }
        // Show sample fixes
        console.log('  Sample fixes (first 20):');
        for (const f of fixes.slice(0, 20)) {
            console.log(`    ${f.number}: ${f.currentTotal} → ${f.correctTotal} (diff: ${Math.round((f.correctTotal - f.currentTotal) * 100) / 100})`);
        }
        if (!DRY_RUN) {
            console.log('\n🔧 Applying fixes...');
            yield conn.beginTransaction();
            let fixedCount = 0;
            for (const f of fixes) {
                yield conn.query(`UPDATE invoices SET total = ?, globalDiscount = ? WHERE id = ?`, [f.correctTotal, f.correctDisc, f.id]);
                fixedCount++;
            }
            console.log(`  ✅ Updated ${fixedCount} sell invoices`);
            // Recalculate partner balances for affected partners
            console.log(`\n📊 Recalculating balances for ${affectedPartners.size} partners...`);
            for (const pid of affectedPartners) {
                const [balResult] = yield conn.query(`
                SELECT 
                    COALESCE(p.openingBalance, 0) +
                    CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 
                        THEN COALESCE(ia.cI, 0) + COALESCE(ia.bI, 0) ELSE 0 END +
                    CASE WHEN p.isSupplier = 1 
                        THEN COALESCE(ia.sI, 0) - COALESCE(ia.bI, 0) ELSE 0 END
                    as newBalance
                FROM partners p
                LEFT JOIN (
                    SELECT partnerId,
                        SUM(CASE WHEN type='INVOICE_SALE' AND COALESCE(paymentMethod,'')!='CASH' THEN total
                                 WHEN type='RETURN_SALE' AND COALESCE(paymentMethod,'')!='CASH' THEN -total
                                 WHEN type IN ('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') THEN -total
                                 ELSE 0 END) as cI,
                        SUM(CASE WHEN type='INVOICE_PURCHASE' AND COALESCE(paymentMethod,'')!='CASH' THEN -(total)
                                 WHEN type='RETURN_PURCHASE' AND COALESCE(paymentMethod,'')!='CASH' THEN total
                                 WHEN type IN ('PAYMENT','DISCOUNT_EARNED','CHEQUE_CASHED') THEN total
                                 ELSE 0 END) as sI,
                        SUM(CASE WHEN type='CHEQUE_BOUNCE' THEN total ELSE 0 END) as bI
                    FROM invoices
                    WHERE status IN ('POSTED','COMPLETED','PARTIAL') AND partnerId = ?
                    GROUP BY partnerId
                ) ia ON ia.partnerId = p.id
                WHERE p.id = ?
            `, [pid, pid]);
                const newBalance = Math.round(Number(((_a = balResult[0]) === null || _a === void 0 ? void 0 : _a.newBalance) || 0) * 100) / 100;
                const [pInfo] = yield conn.query('SELECT name, balance FROM partners WHERE id = ?', [pid]);
                const oldBalance = Number(((_b = pInfo[0]) === null || _b === void 0 ? void 0 : _b.balance) || 0);
                yield conn.query('UPDATE partners SET balance = ? WHERE id = ?', [newBalance, pid]);
                if (Math.abs(oldBalance - newBalance) > 0.5) {
                    console.log(`    ✅ ${pInfo[0].name}: ${oldBalance} → ${newBalance}`);
                }
            }
            yield conn.commit();
            console.log('\n✅ All fixes committed!');
        }
        else {
            console.log(`\n⚠️  DRY RUN — not applying. Run without --dry-run to apply.`);
        }
        // Final stats check
        const [stats] = yield conn.query(`
        SELECT 
            SUM(CASE WHEN (COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END)>0 THEN(COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END) ELSE 0 END) as assets,
            SUM(CASE WHEN (COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END)<0 THEN ABS(COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END) ELSE 0 END) as liab,
            SUM(COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END) as net
        FROM partners p LEFT JOIN(
            SELECT partnerId,
                SUM(CASE WHEN type='INVOICE_SALE' AND COALESCE(paymentMethod,'')!='CASH' THEN total WHEN type='RETURN_SALE' AND COALESCE(paymentMethod,'')!='CASH' THEN -(total) WHEN type IN('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') THEN -total ELSE 0 END) as cI,
                SUM(CASE WHEN type='INVOICE_PURCHASE' AND COALESCE(paymentMethod,'')!='CASH' THEN -(total) WHEN type='RETURN_PURCHASE' AND COALESCE(paymentMethod,'')!='CASH' THEN total WHEN type IN('PAYMENT','DISCOUNT_EARNED','CHEQUE_CASHED') THEN total ELSE 0 END) as sI,
                SUM(CASE WHEN type='CHEQUE_BOUNCE' THEN total ELSE 0 END) as bI
            FROM invoices WHERE status IN('POSTED','COMPLETED','PARTIAL') GROUP BY partnerId
        ) ia ON p.id=ia.partnerId WHERE p.isCustomer=1
    `);
        console.log(`\n═══ CUSTOMER STATS AFTER FIX ═══`);
        console.log(`  عليهم (assets):  ${Math.round(stats[0].assets * 100) / 100}`);
        console.log(`  لهم (liab):      ${Math.round(stats[0].liab * 100) / 100}`);
        console.log(`  صافي (net):      ${Math.round(stats[0].net * 100) / 100}`);
        console.log(`\n  Expected: عليهم=6,239,418 | لهم=1,085,120.5 | صافي=5,154,297.5`);
        yield conn.end();
    });
}
main().catch(err => { console.error('ERROR:', err); process.exit(1); });
