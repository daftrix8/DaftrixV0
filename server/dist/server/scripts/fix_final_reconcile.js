"use strict";
/**
 * FINAL FIX: Reconcile balances using old ERP's authoritative balance data
 *
 * For each vendor in vendor_balances.json (420 vendors):
 *   1. Compute our calculated balance
 *   2. Compare to old ERP's final balance
 *   3. Adjust openingBalance to make them match
 *
 * This handles phantom invoices, missing transactions, and any data gaps.
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
const BALANCES_DIR = path.resolve(__dirname, '../../mall stuff/balances');
const DATA_DIR = path.resolve(__dirname, '../../mall stuff/data');
const MAPPING_FILE = path.resolve(__dirname, '../../mall stuff/id_mapping.json');
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        console.log('\n══════════════════════════════════════════════');
        console.log('  🎯 FINAL FIX: Reconcile with Old ERP Balances');
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
            // Load old ERP balance data
            const vendorBalances = JSON.parse(fs.readFileSync(path.join(BALANCES_DIR, 'vendor_balances.json'), 'utf8'));
            const customerBalances = JSON.parse(fs.readFileSync(path.join(BALANCES_DIR, 'customers_balances.json'), 'utf8'));
            console.log(`  Vendor balance records: ${vendorBalances.records.length}`);
            console.log(`  Customer balance records: ${((_a = customerBalances.records) === null || _a === void 0 ? void 0 : _a.length) || 0}`);
            // Load person balance dates for cutoff
            const persons = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'Persons.json'), 'utf8'));
            const personDateMap = new Map();
            persons.forEach((p) => {
                if (p.balanceDate) {
                    const d = new Date(p.balanceDate);
                    if (!isNaN(d.getTime()))
                        personDateMap.set(p.ID, d.toISOString().slice(0, 10));
                }
            });
            // ═══════════════════════════════════════════════════════
            // STEP 1: Reconcile vendor balances (420 vendors)
            // ═══════════════════════════════════════════════════════
            console.log('\n📊 Step 1: Reconciling vendor balances...\n');
            let vendorsFixed = 0;
            let vendorsAlreadyCorrect = 0;
            let vendorsNotFound = 0;
            for (const vb of vendorBalances.records) {
                const oldId = String(vb.id);
                const partnerId = (_b = idMap.partners) === null || _b === void 0 ? void 0 : _b[oldId];
                if (!partnerId) {
                    vendorsNotFound++;
                    continue;
                }
                const targetBalance = vb.balance; // Old ERP's authoritative final balance
                const balanceDate = personDateMap.get(vb.id) || '2000-01-01';
                // Compute what our system currently calculates
                const [result] = yield conn.query(`
        SELECT 
          p.openingBalance,
          COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = ? AND i.type = 'INVOICE_PURCHASE' AND i.date > ?), 0) as purchases,
          COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = ? AND i.type = 'RETURN_PURCHASE' AND i.date > ?), 0) as returns,
          COALESCE((SELECT SUM(at2.debit) FROM account_transactions at2 WHERE at2.partnerId = ? AND at2.type = 'VENDOR_PAYMENT' AND at2.date > ?), 0) as payments
        FROM partners p WHERE p.id = ?
      `, [partnerId, balanceDate, partnerId, balanceDate, partnerId, balanceDate, partnerId]);
                if (result.length === 0) {
                    vendorsNotFound++;
                    continue;
                }
                const r = result[0];
                const currentOpening = r.openingBalance;
                const ourBalance = currentOpening + r.purchases - r.returns - r.payments;
                const delta = ourBalance - targetBalance;
                if (Math.abs(delta) < 0.01) {
                    vendorsAlreadyCorrect++;
                    continue;
                }
                // Adjust opening balance to compensate for the delta
                const newOpening = currentOpening - delta;
                yield conn.query(`UPDATE partners SET openingBalance = ?, balance = ? WHERE id = ?`, [newOpening, targetBalance, partnerId]);
                vendorsFixed++;
                // Debug output for interesting cases
                if (vb.name.includes('غديه') || Math.abs(delta) > 100000) {
                    console.log(`  🔧 ${vb.name}`);
                    console.log(`     Old opening: ${currentOpening} → New opening: ${newOpening}`);
                    console.log(`     Our balance: ${ourBalance} → Target: ${targetBalance} (delta: ${delta})`);
                }
            }
            console.log(`\n  ✅ Vendors fixed: ${vendorsFixed}`);
            console.log(`  ✅ Already correct: ${vendorsAlreadyCorrect}`);
            console.log(`  ⚠️  Not found in DB: ${vendorsNotFound}`);
            // ═══════════════════════════════════════════════════════
            // STEP 2: Reconcile customer balances (3 records only)
            // ═══════════════════════════════════════════════════════
            if (customerBalances.records && customerBalances.records.length > 0) {
                console.log('\n📊 Step 2: Reconciling customer balances...\n');
                let customersFixed = 0;
                for (const cb of customerBalances.records) {
                    const oldId = String(cb.id);
                    const partnerId = (_c = idMap.partners) === null || _c === void 0 ? void 0 : _c[oldId];
                    if (!partnerId)
                        continue;
                    const targetBalance = cb.balance;
                    const balanceDate = personDateMap.get(cb.id) || '2000-01-01';
                    const [result] = yield conn.query(`
          SELECT 
            p.openingBalance,
            COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = ? AND i.type = 'INVOICE_SALE' AND i.date > ?), 0) as sales,
            COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = ? AND i.type = 'RETURN_SALE' AND i.date > ?), 0) as returns,
            COALESCE((SELECT SUM(at2.credit) FROM account_transactions at2 WHERE at2.partnerId = ? AND at2.type = 'CUSTOMER_PAYMENT' AND at2.date > ?), 0) as payments
          FROM partners p WHERE p.id = ?
        `, [partnerId, balanceDate, partnerId, balanceDate, partnerId, balanceDate, partnerId]);
                    if (result.length === 0)
                        continue;
                    const r = result[0];
                    const ourBalance = r.openingBalance + r.sales - r.returns - r.payments;
                    const delta = ourBalance - targetBalance;
                    if (Math.abs(delta) >= 0.01) {
                        const newOpening = r.openingBalance - delta;
                        yield conn.query(`UPDATE partners SET openingBalance = ?, balance = ? WHERE id = ?`, [newOpening, targetBalance, partnerId]);
                        customersFixed++;
                        console.log(`  🔧 ${cb.name}: ${ourBalance} → ${targetBalance}`);
                    }
                }
                console.log(`  ✅ Customers fixed: ${customersFixed}`);
            }
            // ═══════════════════════════════════════════════════════
            // STEP 3: Recalculate remaining partner balances (non-reconciled)
            // ═══════════════════════════════════════════════════════
            console.log('\n📊 Step 3: Recalculating remaining partner balances...');
            // For partners NOT in vendor/customer balance files, use date-cutoff calculation
            const reconciledIds = new Set();
            for (const vb of vendorBalances.records) {
                const pid = (_d = idMap.partners) === null || _d === void 0 ? void 0 : _d[String(vb.id)];
                if (pid)
                    reconciledIds.add(pid);
            }
            if (customerBalances.records) {
                for (const cb of customerBalances.records) {
                    const pid = (_e = idMap.partners) === null || _e === void 0 ? void 0 : _e[String(cb.id)];
                    if (pid)
                        reconciledIds.add(pid);
                }
            }
            const [allPartners] = yield conn.query(`SELECT id, type, isSupplier, openingBalance FROM partners`);
            let recalculated = 0;
            for (const partner of allPartners) {
                if (reconciledIds.has(partner.id))
                    continue; // Already fixed
                const personEntry = persons.find((p) => { var _a; return ((_a = idMap.partners) === null || _a === void 0 ? void 0 : _a[String(p.ID)]) === partner.id; });
                const balanceDate = (personEntry === null || personEntry === void 0 ? void 0 : personEntry.balanceDate)
                    ? new Date(personEntry.balanceDate).toISOString().slice(0, 10)
                    : '2000-01-01';
                const isSupplier = partner.type === 'SUPPLIER' || partner.type === 'BOTH' || partner.isSupplier;
                if (isSupplier) {
                    const [result] = yield conn.query(`
          SELECT 
            COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = ? AND i.type = 'INVOICE_PURCHASE' AND i.date > ?), 0) as purchases,
            COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = ? AND i.type = 'RETURN_PURCHASE' AND i.date > ?), 0) as returns,
            COALESCE((SELECT SUM(at2.debit) FROM account_transactions at2 WHERE at2.partnerId = ? AND at2.type = 'VENDOR_PAYMENT' AND at2.date > ?), 0) as payments
        `, [partner.id, balanceDate, partner.id, balanceDate, partner.id, balanceDate]);
                    const balance = partner.openingBalance + result[0].purchases - result[0].returns - result[0].payments;
                    yield conn.query(`UPDATE partners SET balance = ? WHERE id = ?`, [balance, partner.id]);
                }
                else {
                    const [result] = yield conn.query(`
          SELECT 
            COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = ? AND i.type = 'INVOICE_SALE' AND i.date > ?), 0) as sales,
            COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = ? AND i.type = 'RETURN_SALE' AND i.date > ?), 0) as returns,
            COALESCE((SELECT SUM(at2.credit) FROM account_transactions at2 WHERE at2.partnerId = ? AND at2.type = 'CUSTOMER_PAYMENT' AND at2.date > ?), 0) as payments
        `, [partner.id, balanceDate, partner.id, balanceDate, partner.id, balanceDate]);
                    const balance = partner.openingBalance + result[0].sales - result[0].returns - result[0].payments;
                    yield conn.query(`UPDATE partners SET balance = ? WHERE id = ?`, [balance, partner.id]);
                }
                recalculated++;
            }
            console.log(`  ✅ Recalculated ${recalculated} remaining partners`);
            // ═══════════════════════════════════════════════════════
            // VERIFICATION
            // ═══════════════════════════════════════════════════════
            console.log('\n══════════════════════════════════════════════');
            console.log('  ✅ FINAL VERIFICATION');
            console.log('══════════════════════════════════════════════\n');
            // Spot check ghadia
            const [ghadia] = yield conn.query(`
      SELECT name, balance, openingBalance FROM partners WHERE name LIKE '%غديه ارت%'
    `);
            if (ghadia.length > 0) {
                console.log(`  ${ghadia[0].name}`);
                console.log(`    Balance: ${ghadia[0].balance} (expected: 0) ${Math.abs(ghadia[0].balance) < 1 ? '✅' : '❌'}`);
                console.log(`    Opening: ${ghadia[0].openingBalance}`);
            }
            // Overall stats
            const [stats] = yield conn.query(`
      SELECT 
        (SELECT COUNT(*) FROM invoices WHERE createdBy = 'Migration') as invoices,
        (SELECT COUNT(*) FROM invoice_lines il INNER JOIN invoices i ON il.invoiceId = i.id WHERE i.createdBy = 'Migration') as invoiceLines,
        (SELECT COUNT(*) FROM account_transactions WHERE createdBy = 'Migration') as transactions,
        (SELECT COUNT(*) FROM partners) as partners
    `);
            console.log(`\n  📦 Migration Summary:`);
            console.log(`    Invoices: ${stats[0].invoices}`);
            console.log(`    Invoice Lines: ${stats[0].invoiceLines}`);
            console.log(`    Account Transactions: ${stats[0].transactions}`);
            console.log(`    Partners: ${stats[0].partners}`);
            const [balDist] = yield conn.query(`
      SELECT 
        COUNT(CASE WHEN ABS(balance) < 1 THEN 1 END) as zeroBalance,
        COUNT(CASE WHEN balance > 1 THEN 1 END) as positiveBalance,
        COUNT(CASE WHEN balance < -1 THEN 1 END) as negativeBalance
      FROM partners
    `);
            console.log(`\n  💰 Balance Distribution:`);
            console.log(`    ~Zero: ${balDist[0].zeroBalance}`);
            console.log(`    Positive (owed to us): ${balDist[0].positiveBalance}`);
            console.log(`    Negative (we owe): ${balDist[0].negativeBalance}`);
            // Spot check a few more vendors
            console.log('\n  🔍 Vendor Spot Checks (random 5):');
            const sampleVendors = vendorBalances.records
                .filter((v) => Math.abs(v.balance) > 100)
                .sort(() => Math.random() - 0.5)
                .slice(0, 5);
            for (const vb of sampleVendors) {
                const pid = (_f = idMap.partners) === null || _f === void 0 ? void 0 : _f[String(vb.id)];
                if (!pid)
                    continue;
                const [row] = yield conn.query(`SELECT balance FROM partners WHERE id = ?`, [pid]);
                if (row.length > 0) {
                    const match = Math.abs(row[0].balance - vb.balance) < 1;
                    console.log(`    ${vb.name.substring(0, 35).padEnd(35)} Our: ${String(row[0].balance).padStart(12)} Old: ${String(vb.balance).padStart(12)} ${match ? '✅' : '❌'}`);
                }
            }
            console.log('\n  🎉 Migration reconciliation complete!\n');
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
