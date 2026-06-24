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
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const c = yield promise_1.default.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_USER,
            password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306, decimalNumbers: true,
        });
        // ── Component breakdown ──────────────────────────────────
        const [comp] = yield c.query(`
        SELECT
            SUM(CASE WHEN i.type='INVOICE_SALE' AND COALESCE(i.paymentMethod,'')!='CASH' THEN i.total ELSE 0 END)  as sales,
            SUM(CASE WHEN i.type='RETURN_SALE'  AND COALESCE(i.paymentMethod,'')!='CASH' THEN i.total ELSE 0 END)  as returns,
            SUM(CASE WHEN i.type='RECEIPT'                                                THEN i.total ELSE 0 END)  as receipts,
            SUM(CASE WHEN i.type='DISCOUNT_ALLOWED'                                       THEN i.total ELSE 0 END)  as discounts,
            SUM(CASE WHEN i.type='CHEQUE_DEPOSIT'                                         THEN i.total ELSE 0 END)  as cheqDep,
            SUM(CASE WHEN i.type='CHEQUE_COLLECT'                                         THEN i.total ELSE 0 END)  as cheqCol,
            COUNT(DISTINCT i.partnerId)                                                                             as partners
        FROM invoices i
        JOIN partners p ON p.id = i.partnerId
        WHERE p.isCustomer = 1
          AND i.status IN ('POSTED','COMPLETED','PARTIAL')
    `);
        const r = comp[0];
        console.log('=== cImpact Components (isCustomer=1) ===');
        console.log(`  Sales (credit invoices):   ${r.sales}`);
        console.log(`  Returns:                  -${r.returns}`);
        console.log(`  Receipts:                 -${r.receipts}`);
        console.log(`  Discounts allowed:        -${r.discounts}`);
        console.log(`  Cheque deposits:          -${r.cheqDep}`);
        console.log(`  Cheque collects:          -${r.cheqCol}`);
        const cImpact = r.sales - r.returns - r.receipts - r.discounts - r.cheqDep - r.cheqCol;
        console.log(`  ─────────────────────────────────`);
        console.log(`  cImpact total:             ${Math.round(cImpact * 100) / 100}`);
        console.log(`  Partners counted:          ${r.partners}`);
        // Opening balances
        const [ob] = yield c.query(`SELECT SUM(openingBalance) as ob FROM partners WHERE isCustomer=1`);
        console.log(`\n  Opening balances sum:      ${ob[0].ob}`);
        console.log(`  Net (ob + cImpact):        ${Math.round((ob[0].ob + cImpact) * 100) / 100}`);
        // But formula splits per-partner then sums; check
        const [stat] = yield c.query(`
        SELECT 
            SUM(COALESCE(p.openingBalance,0) + COALESCE(ia.cI,0) + COALESCE(ia.bI,0)) as net,
            SUM(CASE WHEN (COALESCE(p.openingBalance,0)+COALESCE(ia.cI,0)+COALESCE(ia.bI,0))>0
                     THEN (COALESCE(p.openingBalance,0)+COALESCE(ia.cI,0)+COALESCE(ia.bI,0)) ELSE 0 END) as assets,
            SUM(CASE WHEN (COALESCE(p.openingBalance,0)+COALESCE(ia.cI,0)+COALESCE(ia.bI,0))<0
                     THEN ABS(COALESCE(p.openingBalance,0)+COALESCE(ia.cI,0)+COALESCE(ia.bI,0)) ELSE 0 END) as liab
        FROM partners p
        LEFT JOIN (
            SELECT partnerId,
                SUM(CASE WHEN type='INVOICE_SALE' AND COALESCE(paymentMethod,'')!='CASH' THEN total
                         WHEN type='RETURN_SALE'  AND COALESCE(paymentMethod,'')!='CASH' THEN -(total)
                         WHEN type IN ('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') THEN -total
                         ELSE 0 END) as cI,
                SUM(CASE WHEN type='CHEQUE_BOUNCE' THEN total ELSE 0 END) as bI
            FROM invoices WHERE status IN ('POSTED','COMPLETED','PARTIAL')
            GROUP BY partnerId
        ) ia ON p.id = ia.partnerId
        WHERE p.isCustomer = 1 AND p.isSupplier = 0
    `);
        console.log('\n=== Customer-ONLY stats (isSupplier=0) ===');
        console.log(`  عليهم (assets):  ${Math.round(stat[0].assets * 100) / 100}`);
        console.log(`  لهم   (liab):    ${Math.round(stat[0].liab * 100) / 100}`);
        console.log(`  صافي  (net):     ${Math.round(stat[0].net * 100) / 100}`);
        // Now total including "both" partners
        const [stat2] = yield c.query(`
        SELECT 
            SUM(COALESCE(p.openingBalance,0)+
                CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+
                CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END) as net,
            SUM(CASE WHEN (COALESCE(p.openingBalance,0)+
                CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+
                CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END)>0
                THEN (COALESCE(p.openingBalance,0)+
                CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+
                CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END) ELSE 0 END) as assets,
            SUM(CASE WHEN (COALESCE(p.openingBalance,0)+
                CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+
                CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END)<0
                THEN ABS(COALESCE(p.openingBalance,0)+
                CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+
                CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END) ELSE 0 END) as liab
        FROM partners p
        LEFT JOIN (
            SELECT partnerId,
                SUM(CASE WHEN type='INVOICE_SALE' AND COALESCE(paymentMethod,'')!='CASH' THEN total
                         WHEN type='RETURN_SALE'  AND COALESCE(paymentMethod,'')!='CASH' THEN -(total)
                         WHEN type IN ('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') THEN -total
                         ELSE 0 END) as cI,
                SUM(CASE WHEN type='INVOICE_PURCHASE' AND COALESCE(paymentMethod,'')!='CASH' THEN -(total)
                         WHEN type='RETURN_PURCHASE'  AND COALESCE(paymentMethod,'')!='CASH' THEN total
                         WHEN type IN ('PAYMENT','DISCOUNT_EARNED','CHEQUE_CASHED') THEN total
                         ELSE 0 END) as sI,
                SUM(CASE WHEN type='CHEQUE_BOUNCE' THEN total ELSE 0 END) as bI
            FROM invoices WHERE status IN ('POSTED','COMPLETED','PARTIAL')
            GROUP BY partnerId
        ) ia ON p.id = ia.partnerId
        WHERE p.isCustomer = 1
    `);
        console.log('\n=== ALL customers (including dual-role) ===');
        console.log(`  عليهم (assets):  ${Math.round(stat2[0].assets * 100) / 100}`);
        console.log(`  لهم   (liab):    ${Math.round(stat2[0].liab * 100) / 100}`);
        console.log(`  صافي  (net):     ${Math.round(stat2[0].net * 100) / 100}`);
        console.log('\n  Expected: عليهم=6,239,418 | لهم=1,085,120.5 | صافي=5,154,297.5');
        console.log(`  Gap: ${Math.round((5154297.5 - stat2[0].net) * 100) / 100}`);
        // What's driving the gap? Check TOP customers with large liab (credit) balances
        console.log('\n=== Top 20 customers by credit balance (لهم) ===');
        const [top] = yield c.query(`
        SELECT p.name,
            (COALESCE(p.openingBalance,0) + COALESCE(ia.cI,0) + COALESCE(ia.bI,0)) as balance
        FROM partners p
        LEFT JOIN (
            SELECT partnerId,
                SUM(CASE WHEN type='INVOICE_SALE' AND COALESCE(paymentMethod,'')!='CASH' THEN total
                         WHEN type='RETURN_SALE'  AND COALESCE(paymentMethod,'')!='CASH' THEN -(total)
                         WHEN type IN ('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') THEN -total
                         ELSE 0 END) as cI,
                SUM(CASE WHEN type='CHEQUE_BOUNCE' THEN total ELSE 0 END) as bI
            FROM invoices WHERE status IN ('POSTED','COMPLETED','PARTIAL')
            GROUP BY partnerId
        ) ia ON p.id = ia.partnerId
        WHERE p.isCustomer = 1 AND p.isSupplier = 0
        HAVING balance < 0
        ORDER BY balance ASC
        LIMIT 20
    `);
        for (const t of top) {
            console.log(`  ${t.name}: ${t.balance}`);
        }
        // Also check OLD-CP-DEBIT impact specifically
        console.log('\n=== OLD-CP-DEBIT classified as INVOICE_SALE ===');
        const [cp] = yield c.query(`
        SELECT COUNT(*) as cnt, SUM(i.total) as total
        FROM invoices i
        JOIN partners p ON p.id = i.partnerId
        WHERE i.number LIKE 'OLD-CP-DEBIT-%'
          AND i.type = 'INVOICE_SALE'
          AND p.isCustomer = 1
          AND i.status IN ('POSTED','COMPLETED','PARTIAL')
    `);
        console.log(`  Count: ${cp[0].cnt}, Total: ${cp[0].total}`);
        console.log('  → These inflate "عليهم" by this amount since they appear as sales');
        console.log('  → They should be RECEIPT type (customers paying) to reduce balance');
        yield c.end();
    });
}
main().catch(e => { console.error(e); process.exit(1); });
