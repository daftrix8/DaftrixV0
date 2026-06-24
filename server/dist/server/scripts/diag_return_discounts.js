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
 * Diagnose return sale discount issue
 * The old ERP stores return invoice discounts as separate ledger lines.
 * In our system, the return's globalDiscount is set but the balance formula
 * uses -(total) without subtracting the discount, causing over-crediting.
 *
 * Old ERP:
 *   مرتجع بيع 2781:  credit 2,086  → reduces customer balance
 *   خصم مرتجع 2781:  debit  36     → increases customer balance (partial discount on return)
 *   Net impact: -(2,086 - 36) = -2,050
 *
 * Our system formula:
 *   RETURN_SALE: -(total) = -(2,086) = -2,086  ← over-credits by 36
 */
const promise_1 = __importDefault(require("mysql2/promise"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_USER,
            password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306, decimalNumbers: true,
        });
        // ── 1. Find the specific customer ───────────────────────
        const [cust] = yield conn.query(`SELECT id, name, openingBalance, balance FROM partners WHERE name LIKE ?`, ['%شيماء%']);
        console.log('Customer:', cust);
        if (cust.length > 0) {
            const pid = cust[0].id;
            const [invs] = yield conn.query(`SELECT type, number, total, globalDiscount, globalDiscountType, paymentMethod, status
             FROM invoices WHERE partnerId = ? ORDER BY date`, [pid]);
            console.log('\nTransactions:');
            for (const inv of invs)
                console.log(' ', inv);
            // Compute balance manually
            let bal = Number(cust[0].openingBalance || 0);
            for (const inv of invs) {
                if (!['POSTED', 'COMPLETED', 'PARTIAL'].includes(inv.status))
                    continue;
                const t = Number(inv.total);
                const pm = inv.paymentMethod || '';
                if (inv.type === 'INVOICE_SALE' && pm !== 'CASH')
                    bal += t;
                else if (inv.type === 'RETURN_SALE' && pm !== 'CASH')
                    bal -= t;
                else if (['RECEIPT', 'DISCOUNT_ALLOWED'].includes(inv.type))
                    bal -= t;
            }
            console.log('\nComputed balance (formula):', Math.round(bal * 100) / 100);
            console.log('Expected balance: 0');
        }
        // ── 2. Scope: how many RETURN_SALE have non-zero globalDiscount? ──
        const [retWithDisc] = yield conn.query(`
        SELECT 
            COUNT(*) as cnt,
            SUM(CASE WHEN globalDiscountType='FIXED' THEN globalDiscount ELSE 0 END) as fixedDiscTotal,
            SUM(CASE WHEN globalDiscountType='PERCENT' THEN globalDiscount ELSE 0 END) as pctDiscTotal,
            SUM(total) as grossTotal
        FROM invoices
        WHERE type = 'RETURN_SALE'
          AND number LIKE 'OLD-RS-%'
          AND globalDiscount > 0
          AND status IN ('POSTED','COMPLETED','PARTIAL')
    `);
        console.log('\n=== RETURN_SALE with globalDiscount (OLD-RS-*) ===');
        console.log(retWithDisc[0]);
        // ── 3. Sample of return invoices with FIXED discount ──
        const [samples] = yield conn.query(`
        SELECT number, total, globalDiscount, globalDiscountType
        FROM invoices
        WHERE type = 'RETURN_SALE'
          AND number LIKE 'OLD-RS-%'
          AND globalDiscount > 0
          AND globalDiscountType = 'FIXED'
          AND status IN ('POSTED','COMPLETED','PARTIAL')
        LIMIT 10
    `);
        console.log('\nSample RETURN_SALE with FIXED discount:');
        for (const s of samples) {
            console.log(`  ${s.number}: gross=${s.total}, discount=${s.globalDiscount}, net=${s.total - s.globalDiscount}`);
        }
        // ── 4. What is the total over-credit from return discounts? ──
        // If total includes the discount amount (gross), we're over-crediting by SUM(globalDiscount)
        const [impact] = yield conn.query(`
        SELECT 
            SUM(globalDiscount) as totalOverCredit,
            COUNT(*) as cnt
        FROM invoices
        WHERE type = 'RETURN_SALE'
          AND number LIKE 'OLD-RS-%'
          AND globalDiscountType = 'FIXED'
          AND globalDiscount > 0
          AND status IN ('POSTED','COMPLETED','PARTIAL')
    `);
        console.log('\n=== Balance Impact of Return Discounts ===');
        console.log(`  Returns with FIXED discount: ${impact[0].cnt}`);
        console.log(`  Total over-credit: ${impact[0].totalOverCredit}`);
        console.log(`  (Current customer net: ~5,167,138)`);
        console.log(`  (Net after fixing this: ~${Math.round(5167138 + Number(impact[0].totalOverCredit || 0))}`);
        // ── 5. Check return invoice JSON source to see if total is gross or net ──
        const DATA_DIRS = [
            path.resolve(__dirname, '../../mall stuff/New folder (3)/data'),
            path.resolve(__dirname, '../../mall stuff/new data/data'),
            path.resolve(__dirname, '../../mall stuff/data'),
        ];
        let retJson = [];
        for (const d of DATA_DIRS) {
            const fp = path.join(d, 'sellBackInvoice.json');
            if (fs.existsSync(fp)) {
                retJson = JSON.parse(fs.readFileSync(fp, 'utf8'));
                console.log(`\nLoaded sellBackInvoice.json from ${d}: ${retJson.length} records`);
                break;
            }
        }
        if (retJson.length > 0) {
            // Find return 2781 in JSON
            const ret2781 = retJson.find((r) => String(r.invNum || r.ID) === '2781' || String(r.ID) === '2781');
            if (ret2781) {
                console.log('\nReturn 2781 from JSON:', JSON.stringify(ret2781, null, 2));
            }
            // Check sample returns to see what InvNet vs line item totals look like
            const withDiscount = retJson.filter((r) => Number(r.invDiscount || r.InvDiscount || 0) > 0).slice(0, 5);
            console.log('\nSample returns with invDiscount in JSON:');
            for (const r of withDiscount) {
                console.log(`  ID=${r.ID}, invNum=${r.invNum}, InvNet=${r.InvNet || r.invNet}, invDiscount=${r.invDiscount || r.InvDiscount}`);
            }
        }
        yield conn.end();
    });
}
main().catch(e => { console.error(e); process.exit(1); });
