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
 * Fix RETURN_SALE invoice totals
 * ================================
 * The migration imported return sale invoices with gross totals
 * (from line item subtotals) and stored invDiscount as globalDiscount.
 * But the balance formula uses -(total) without subtracting the discount.
 *
 * The same issue was fixed for INVOICE_SALE invoices. This does the same for RETURN_SALE.
 *
 * Fix: total = lineItems_subtotal - FIXED_discount
 *
 * Usage:
 *   npx ts-node scripts/fix_return_sale_totals.ts --dry-run
 *   npx ts-node scripts/fix_return_sale_totals.ts
 */
const promise_1 = __importDefault(require("mysql2/promise"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const DRY_RUN = process.argv.includes('--dry-run');
const DATA_DIRS = [
    path.resolve(__dirname, '../../mall stuff/New folder (3)/data'),
    path.resolve(__dirname, '../../mall stuff/new data/data'),
    path.resolve(__dirname, '../../mall stuff/data'),
];
function findDataDir() {
    for (const d of DATA_DIRS) {
        if (fs.existsSync(path.join(d, 'sellBackInvoice.json')))
            return d;
    }
    return null;
}
function safeNum(v, fallback = 0) {
    const n = Number(v);
    return isNaN(n) ? fallback : n;
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`🔧 Fix RETURN_SALE Invoice Totals ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
        console.log('═══════════════════════════════════════════════════════════════\n');
        const dataDir = findDataDir();
        if (!dataDir) {
            console.error('❌ sellBackInvoice.json not found!');
            process.exit(1);
        }
        // Load JSON data
        const headers = JSON.parse(fs.readFileSync(path.join(dataDir, 'sellBackInvoice.json'), 'utf8'));
        const details = JSON.parse(fs.readFileSync(path.join(dataDir, 'sellBackInvoice_Details.json'), 'utf8'));
        console.log(`  JSON: ${headers.length} return headers, ${details.length} detail lines`);
        // Build detail lookup: invNum → details[]
        const detailByMasterId = new Map();
        for (const d of details) {
            const mid = d.MasterID || d.masterID || d.InvID;
            if (!detailByMasterId.has(mid))
                detailByMasterId.set(mid, []);
            detailByMasterId.get(mid).push(d);
        }
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_USER,
            password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306, decimalNumbers: true,
        });
        // Load all migrated RETURN_SALE invoices with FIXED discounts
        const [dbReturns] = yield conn.query(`
        SELECT id, number, total, globalDiscount, globalDiscountType, partnerId
        FROM invoices
        WHERE type = 'RETURN_SALE'
          AND number LIKE 'OLD-RS-%'
          AND globalDiscount > 0
          AND globalDiscountType = 'FIXED'
          AND status IN ('POSTED','COMPLETED','PARTIAL')
    `);
        console.log(`  DB returns with FIXED discount: ${dbReturns.length}\n`);
        // Build a lookup from invNum → header JSON data
        const jsonByInvNum = new Map();
        for (const h of headers) {
            jsonByInvNum.set(Number(h.invNum || h.ID), h);
        }
        const jsonById = new Map();
        for (const h of headers) {
            jsonById.set(Number(h.ID), h);
        }
        let fixed = 0;
        let skipped = 0;
        let totalAdjustment = 0;
        const fixes = [];
        for (const dbRet of dbReturns) {
            // Extract the old invNum from the number field: "OLD-RS-2781" → 2781
            const invNumStr = String(dbRet.number).replace('OLD-RS-', '');
            const invNum = Number(invNumStr);
            // Find in JSON
            const jsonHeader = jsonByInvNum.get(invNum);
            if (!jsonHeader) {
                console.log(`  ⚠️  No JSON match for ${dbRet.number}`);
                skipped++;
                continue;
            }
            const invDiscount = safeNum(jsonHeader.invDiscount || jsonHeader.InvDiscount);
            const discountType = safeNum(jsonHeader.discountType || jsonHeader.DiscountType, 1);
            // Only fix FIXED discounts (discountType 1 = FIXED, 2 = PERCENT)
            if (discountType !== 1 || invDiscount === 0) {
                skipped++;
                continue;
            }
            // Compute line items subtotal
            const lineItems = detailByMasterId.get(jsonHeader.ID) || [];
            const lineSubtotal = lineItems.reduce((sum, d) => {
                const qty = safeNum(d.quan || d.Quan);
                const price = safeNum(d.price || d.Price);
                const lineDisc = safeNum(d.discount || d.Discount);
                const lineTotal = safeNum(d.total || d.Total || (qty * price - lineDisc));
                return sum + lineTotal;
            }, 0);
            // Correct total = lineSubtotal - invDiscount (flat discount off gross)
            const correctTotal = Math.round((lineSubtotal - invDiscount) * 100) / 100;
            const currentTotal = Number(dbRet.total);
            if (Math.abs(correctTotal - currentTotal) < 0.01) {
                skipped++;
                continue;
            }
            fixes.push({
                id: dbRet.id,
                number: dbRet.number,
                oldTotal: currentTotal,
                newTotal: correctTotal,
                discount: invDiscount,
            });
        }
        console.log(`  Invoices to fix: ${fixes.length}`);
        console.log(`  Already correct: ${skipped}\n`);
        // Show sample
        for (const f of fixes.slice(0, 20)) {
            const adj = f.newTotal - f.oldTotal;
            console.log(`  ${f.number}: ${f.oldTotal} → ${f.newTotal} (${adj > 0 ? '+' : ''}${adj.toFixed(2)})`);
        }
        if (fixes.length > 0) {
            totalAdjustment = fixes.reduce((s, f) => s + (f.newTotal - f.oldTotal), 0);
            console.log(`\n  Total adjustment: ${Math.round(totalAdjustment * 100) / 100}`);
            console.log(`  Impact on customer net: +${Math.round(-totalAdjustment * 100) / 100}`);
            // Returns are subtracted: -(total). If total goes down (negative adj), -(less) = more net
            // If total goes from 2086→2050 (adj=-36), -(2050) vs -(2086) → customer net increases by 36
            const netImpact = -totalAdjustment;
            console.log(`  Estimated new customer net: ~${Math.round((5167138 + netImpact) * 100) / 100}`);
        }
        if (DRY_RUN) {
            console.log('\n⚠️  DRY RUN — run without --dry-run to apply');
            yield conn.end();
            return;
        }
        if (fixes.length === 0) {
            console.log('✅ Nothing to fix!');
            yield conn.end();
            return;
        }
        console.log('\n🔧 Applying fixes...');
        yield conn.beginTransaction();
        try {
            for (const f of fixes) {
                yield conn.query(`UPDATE invoices SET total = ?, paidAmount = CASE WHEN paidAmount >= total THEN ? ELSE paidAmount END WHERE id = ?`, [f.newTotal, f.newTotal, f.id]);
                fixed++;
            }
            yield conn.commit();
            console.log(`✅ Fixed ${fixed} RETURN_SALE invoice totals`);
        }
        catch (err) {
            yield conn.rollback();
            throw err;
        }
        // Recalculate partner balances for affected partners
        console.log('\n🔄 Recalculating affected partner balances...');
        const affectedPartnerIds = [...new Set(dbReturns
                .filter((r) => fixes.some(f => f.id === r.id))
                .map((r) => r.partnerId))];
        let balFixed = 0;
        for (const pid of affectedPartnerIds) {
            const [bRes] = yield conn.query(`
            SELECT 
                COALESCE(p.openingBalance, 0) +
                COALESCE(ia.cI, 0) + COALESCE(ia.bI, 0) as newBal
            FROM partners p
            LEFT JOIN (
                SELECT partnerId,
                    SUM(CASE WHEN type='INVOICE_SALE' AND COALESCE(paymentMethod,'')!='CASH' THEN total
                             WHEN type='RETURN_SALE'  AND COALESCE(paymentMethod,'')!='CASH' THEN -(total)
                             WHEN type IN ('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') THEN -total
                             ELSE 0 END) as cI,
                    SUM(CASE WHEN type='CHEQUE_BOUNCE' THEN total ELSE 0 END) as bI
                FROM invoices WHERE status IN ('POSTED','COMPLETED','PARTIAL') AND partnerId = ?
                GROUP BY partnerId
            ) ia ON p.id = ia.partnerId
            WHERE p.id = ?
        `, [pid, pid]);
            const newBal = Math.round(Number(((_a = bRes[0]) === null || _a === void 0 ? void 0 : _a.newBal) || 0) * 100) / 100;
            yield conn.query(`UPDATE partners SET balance = ? WHERE id = ?`, [newBal, pid]);
            balFixed++;
        }
        console.log(`✅ Recalculated ${balFixed} partner balances`);
        // Final stats
        const [stat] = yield conn.query(`
        SELECT
            SUM(COALESCE(p.openingBalance,0)+
                CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+
                CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END) as net,
            SUM(CASE WHEN (COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END)>0 THEN
                (COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END) ELSE 0 END) as assets,
            SUM(CASE WHEN (COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END)<0 THEN
                ABS(COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END) ELSE 0 END) as liab
        FROM partners p
        LEFT JOIN (
            SELECT partnerId,
                SUM(CASE WHEN type='INVOICE_SALE' AND COALESCE(paymentMethod,'')!='CASH' THEN total
                         WHEN type='RETURN_SALE'  AND COALESCE(paymentMethod,'')!='CASH' THEN -(total)
                         WHEN type IN ('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') THEN -total ELSE 0 END) as cI,
                SUM(CASE WHEN type='INVOICE_PURCHASE' AND COALESCE(paymentMethod,'')!='CASH' THEN -(total)
                         WHEN type='RETURN_PURCHASE'  AND COALESCE(paymentMethod,'')!='CASH' THEN total
                         WHEN type IN ('PAYMENT','DISCOUNT_EARNED','CHEQUE_CASHED') THEN total ELSE 0 END) as sI,
                SUM(CASE WHEN type='CHEQUE_BOUNCE' THEN total ELSE 0 END) as bI
            FROM invoices WHERE status IN ('POSTED','COMPLETED','PARTIAL') GROUP BY partnerId
        ) ia ON p.id = ia.partnerId
        WHERE p.isCustomer = 1
    `);
        console.log('\n═══ CUSTOMER STATS AFTER FIX ═══');
        console.log(`  عليهم (assets): ${Math.round(stat[0].assets * 100) / 100}`);
        console.log(`  لهم   (liab):   ${Math.round(stat[0].liab * 100) / 100}`);
        console.log(`  صافي  (net):    ${Math.round(stat[0].net * 100) / 100}`);
        console.log('\n  Expected: عليهم=6,239,418 | لهم=1,085,120.5 | صافي=5,154,297.5');
        console.log(`  Gap: ${Math.round((5154297.5 - stat[0].net) * 100) / 100}`);
        yield conn.end();
    });
}
main().catch(err => { console.error('❌ ERROR:', err); process.exit(1); });
