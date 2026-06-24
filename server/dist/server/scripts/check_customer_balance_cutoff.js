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
 * Find the exact source of مدين/دائن gaps
 * Compares JSON source totals vs DB totals for each transaction type
 * as-of 2026-04-10
 */
const promise_1 = __importDefault(require("mysql2/promise"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const CUTOFF = new Date('2026-04-11'); // exclusive
const DATA_DIRS = [
    path.resolve(__dirname, '../../mall stuff/New folder (3)/data'),
    path.resolve(__dirname, '../../mall stuff/new data/data'),
    path.resolve(__dirname, '../../mall stuff/data'),
];
function findDataDir() {
    for (const d of DATA_DIRS) {
        if (fs.existsSync(path.join(d, 'sellInvoice.json')))
            return d;
    }
    throw new Error('Data dir not found');
}
function safeNum(v, fallback = 0) { const n = Number(v); return isNaN(n) ? fallback : n; }
function beforeCutoff(dateStr) {
    if (!dateStr)
        return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d < CUTOFF;
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const dataDir = findDataDir();
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_USER,
            password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306, decimalNumbers: true,
        });
        // ── Load id_mapping ──────────────────────────────────────
        const idMapPath = path.join(path.dirname(dataDir), 'id_mapping.json');
        const idMap = JSON.parse(fs.readFileSync(idMapPath, 'utf8'));
        const partnerMap = idMap.partners || {};
        // ── Get customer partner IDs ─────────────────────────────
        const [custRows] = yield conn.query(`SELECT id FROM partners WHERE isCustomer=1`);
        const custIds = new Set(custRows.map((r) => r.id));
        console.log(`Customer partners in DB: ${custIds.size}`);
        // ══════════════════════════════════════════════════════════
        // 1. SELL INVOICES (credit only = مدين)
        // ══════════════════════════════════════════════════════════
        const sellHeaders = JSON.parse(fs.readFileSync(path.join(dataDir, 'sellInvoice.json'), 'utf8'));
        const sellDetails = JSON.parse(fs.readFileSync(path.join(dataDir, 'sellInvoice_Details.json'), 'utf8'));
        // Build detail map
        const sellDetailMap = new Map();
        for (const d of sellDetails) {
            const mid = d.MasterID || d.masterID;
            if (!sellDetailMap.has(mid))
                sellDetailMap.set(mid, []);
            sellDetailMap.get(mid).push(d);
        }
        let jsonSellCreditTotal = 0;
        let jsonSellCreditCnt = 0;
        let jsonSellCashTotal = 0;
        let jsonSellCashCnt = 0;
        for (const h of sellHeaders) {
            if (!beforeCutoff(h.invDate || h.InvDate))
                continue;
            const oldPartnerId = String(h.CustomerID || h.customerId || '');
            const newPartnerId = partnerMap[oldPartnerId];
            if (!newPartnerId || !custIds.has(newPartnerId))
                continue;
            const isCash = (h.Status || 1) === 1;
            // Compute net from details
            const lines = sellDetailMap.get(h.ID) || [];
            let lineSubtotal = lines.reduce((s, d) => {
                const qty = safeNum(d.quan || d.Quan);
                const price = safeNum(d.price || d.Price);
                const ld = safeNum(d.discount || d.Discount);
                return s + safeNum(d.total || d.Total || (qty * price - ld));
            }, 0);
            const disc = safeNum(h.invDiscount || h.InvDiscount);
            const discType = safeNum(h.discountType || h.DiscountType, 1);
            const netTotal = discType === 1 ? lineSubtotal - disc : lineSubtotal * (1 - disc / 100);
            if (isCash) {
                jsonSellCashTotal += netTotal;
                jsonSellCashCnt++;
            }
            else {
                jsonSellCreditTotal += netTotal;
                jsonSellCreditCnt++;
            }
        }
        // DB sell credit
        const [dbSellCredit] = yield conn.query(`
        SELECT COUNT(*) as cnt, SUM(total) as total FROM invoices i
        JOIN partners p ON p.id=i.partnerId
        WHERE p.isCustomer=1 AND i.type='INVOICE_SALE'
          AND i.paymentMethod != 'CASH' AND i.number LIKE 'OLD-S-%'
          AND i.status IN ('POSTED','COMPLETED','PARTIAL') AND i.date <= '2026-04-10 23:59:59'
    `);
        console.log('\n══ SELL INVOICES (credit = مدين) ══');
        console.log(`  JSON credit total (≤10/4): ${Math.round(jsonSellCreditTotal * 100) / 100} (${jsonSellCreditCnt} inv)`);
        console.log(`  DB credit total  (≤10/4): ${dbSellCredit[0].total} (${dbSellCredit[0].cnt} inv)`);
        console.log(`  Diff: ${Math.round((jsonSellCreditTotal - Number(dbSellCredit[0].total || 0)) * 100) / 100}`);
        // ══════════════════════════════════════════════════════════
        // 2. SELL RETURNS (credit = دائن)
        // ══════════════════════════════════════════════════════════
        const retHeaders = JSON.parse(fs.readFileSync(path.join(dataDir, 'sellBackInvoice.json'), 'utf8'));
        const retDetails = JSON.parse(fs.readFileSync(path.join(dataDir, 'sellBackInvoice_Details.json'), 'utf8'));
        const retDetailMap = new Map();
        for (const d of retDetails) {
            const mid = d.MasterID || d.masterID;
            if (!retDetailMap.has(mid))
                retDetailMap.set(mid, []);
            retDetailMap.get(mid).push(d);
        }
        let jsonRetCreditTotal = 0;
        let jsonRetCreditCnt = 0;
        let jsonRetCashTotal = 0;
        let jsonRetCashCnt = 0;
        for (const h of retHeaders) {
            if (!beforeCutoff(h.invDate || h.InvDate))
                continue;
            const oldPartnerId = String(h.CustomerID || h.customerId || '');
            const newPartnerId = partnerMap[oldPartnerId];
            if (!newPartnerId || !custIds.has(newPartnerId))
                continue;
            const isCash = (h.Status || 1) === 1;
            const lines = retDetailMap.get(h.ID) || [];
            let lineSubtotal = lines.reduce((s, d) => {
                const qty = safeNum(d.quan || d.Quan);
                const price = safeNum(d.price || d.Price);
                const ld = safeNum(d.discount || d.Discount);
                return s + safeNum(d.total || d.Total || (qty * price - ld));
            }, 0);
            const disc = safeNum(h.invDiscount || h.InvDiscount);
            const discType = safeNum(h.discountType || h.DiscountType, 1);
            const netTotal = discType === 1 ? lineSubtotal - disc : lineSubtotal * (1 - disc / 100);
            if (isCash) {
                jsonRetCashTotal += netTotal;
                jsonRetCashCnt++;
            }
            else {
                jsonRetCreditTotal += netTotal;
                jsonRetCreditCnt++;
            }
        }
        const [dbRetCredit] = yield conn.query(`
        SELECT COUNT(*) as cnt, SUM(total) as total FROM invoices i
        JOIN partners p ON p.id=i.partnerId
        WHERE p.isCustomer=1 AND i.type='RETURN_SALE'
          AND i.paymentMethod != 'CASH' AND i.number LIKE 'OLD-RS-%'
          AND i.status IN ('POSTED','COMPLETED','PARTIAL') AND i.date <= '2026-04-10 23:59:59'
    `);
        console.log('\n══ RETURN SALES (credit = دائن) ══');
        console.log(`  JSON credit total (≤10/4): ${Math.round(jsonRetCreditTotal * 100) / 100} (${jsonRetCreditCnt} ret)`);
        console.log(`  DB credit total  (≤10/4): ${dbRetCredit[0].total} (${dbRetCredit[0].cnt} ret)`);
        console.log(`  Diff: ${Math.round((jsonRetCreditTotal - Number(dbRetCredit[0].total || 0)) * 100) / 100}`);
        // ══════════════════════════════════════════════════════════
        // 3. CUSTOMER PAYMENTS (دائن)
        // ══════════════════════════════════════════════════════════
        let cpJsonFile = '';
        for (const d of DATA_DIRS) {
            const f1 = path.join(d, 'customer_Payment.json');
            const f2 = path.join(d, 'CustomerPayment.json');
            if (fs.existsSync(f1)) {
                cpJsonFile = f1;
                break;
            }
            if (fs.existsSync(f2)) {
                cpJsonFile = f2;
                break;
            }
        }
        let jsonPayTotal = 0;
        let jsonPayCnt = 0;
        if (cpJsonFile) {
            const cpHeaders = JSON.parse(fs.readFileSync(cpJsonFile, 'utf8'));
            const cpDetailFile = cpJsonFile.replace('.json', '_Details.json').replace('customer_Payment', 'Customer_Payment_Details');
            let cpDetails = [];
            if (fs.existsSync(cpDetailFile))
                cpDetails = JSON.parse(fs.readFileSync(cpDetailFile, 'utf8'));
            else {
                // Try alternate
                const alt = path.join(path.dirname(cpJsonFile), 'Customer_Payment_Details.json');
                if (fs.existsSync(alt))
                    cpDetails = JSON.parse(fs.readFileSync(alt, 'utf8'));
            }
            const cpDetailMap = new Map();
            for (const d of cpDetails) {
                const mid = d.MasterID || d.masterID;
                if (!cpDetailMap.has(mid))
                    cpDetailMap.set(mid, []);
                cpDetailMap.get(mid).push(d);
            }
            for (const h of cpHeaders) {
                if (!beforeCutoff(h.InvDate || h.invDate))
                    continue;
                const details = cpDetailMap.get(h.ID) || [];
                for (const d of details) {
                    const oldPartnerId = String(d.CustomerID || d.customerId || '');
                    const newPartnerId = partnerMap[oldPartnerId];
                    if (!newPartnerId || !custIds.has(newPartnerId))
                        continue;
                    const val = safeNum(d.Value || d.value);
                    if (val > 0) {
                        jsonPayTotal += val;
                        jsonPayCnt++;
                    }
                }
            }
            console.log(`\n  Customer payment JSON file: ${cpJsonFile}`);
            console.log(`  CP details: ${cpDetails.length}`);
        }
        const [dbPay] = yield conn.query(`
        SELECT COUNT(*) as cnt, SUM(total) as total FROM invoices i
        JOIN partners p ON p.id=i.partnerId
        WHERE p.isCustomer=1 AND i.type='RECEIPT'
          AND i.number LIKE 'OLD-CP-%'
          AND i.status IN ('POSTED','COMPLETED','PARTIAL') AND i.date <= '2026-04-10 23:59:59'
    `);
        const [dbBRec] = yield conn.query(`
        SELECT COUNT(*) as cnt, SUM(total) as total FROM invoices i
        JOIN partners p ON p.id=i.partnerId
        WHERE p.isCustomer=1 AND i.type='RECEIPT'
          AND i.number LIKE 'OLD-BREC-%'
          AND i.status IN ('POSTED','COMPLETED','PARTIAL') AND i.date <= '2026-04-10 23:59:59'
    `);
        console.log('\n══ CUSTOMER PAYMENTS (receipts = دائن) ══');
        console.log(`  JSON payments (≤10/4): ${Math.round(jsonPayTotal * 100) / 100} (${jsonPayCnt} lines)`);
        console.log(`  DB OLD-CP-* receipts:  ${dbPay[0].total} (${dbPay[0].cnt})`);
        console.log(`  DB OLD-BREC-* receipts:${dbBRec[0].total} (${dbBRec[0].cnt})`);
        console.log(`  DB total receipts:     ${Math.round((Number(dbPay[0].total || 0) + Number(dbBRec[0].total || 0)) * 100) / 100}`);
        // ══════════════════════════════════════════════════════════
        // 4. SUMMARY: where do the gaps come from?
        // ══════════════════════════════════════════════════════════
        console.log('\n══════════════════════════════════════════════');
        console.log('  SUMMARY — Source of Gaps');
        console.log('══════════════════════════════════════════════');
        console.log('  Target (old ERP):');
        console.log('    مدين: 271,795,196.63');
        console.log('    دائن: 266,057,564.13');
        console.log('    Net:   5,737,632.50');
        console.log('');
        console.log(`  JSON-computed مدين (credit sells):  ${Math.round(jsonSellCreditTotal * 100) / 100}`);
        console.log(`  + Pos opening balances:              ${1046061}`);
        console.log(`  = Total مدين:                       ${Math.round((jsonSellCreditTotal + 1046061) * 100) / 100}`);
        console.log(`  Old ERP مدين:                        271,795,196.63`);
        console.log(`  Diff:                                ${Math.round((jsonSellCreditTotal + 1046061 - 271795196.63) * 100) / 100}`);
        console.log('');
        console.log(`  JSON-computed دائن (credit returns): ${Math.round(jsonRetCreditTotal * 100) / 100}`);
        console.log(`  + JSON payments:                     ${Math.round(jsonPayTotal * 100) / 100}`);
        console.log(`  + Neg opening balances:              ${33588}`);
        console.log(`  = Total دائن:                       ${Math.round((jsonRetCreditTotal + jsonPayTotal + 33588) * 100) / 100}`);
        console.log(`  Old ERP دائن:                        266,057,564.13`);
        console.log(`  Diff:                                ${Math.round((jsonRetCreditTotal + jsonPayTotal + 33588 - 266057564.13) * 100) / 100}`);
        yield conn.end();
    });
}
main().catch(e => { console.error(e); process.exit(1); });
