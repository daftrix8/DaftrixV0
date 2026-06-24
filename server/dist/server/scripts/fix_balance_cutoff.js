"use strict";
/**
 * FIX: Balance calculation using balanceDate cutoff
 *
 * Problem: startBalance includes all transactions ON or BEFORE balanceDate.
 * But we also imported those same invoices & payments as separate records.
 * Solution: Only add transactions AFTER balanceDate to startBalance.
 *
 * Also fixes: Remove person-linked SafePayments from partner balances
 * (those are expense categories, NOT vendor/customer payments)
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
const DATA_DIR = path.resolve(__dirname, '../../mall stuff/data');
const MAPPING_FILE = path.resolve(__dirname, '../../mall stuff/id_mapping.json');
function loadJson(f) {
    const fp = path.join(DATA_DIR, f);
    if (!fs.existsSync(fp))
        return [];
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log('\n══════════════════════════════════════════════');
        console.log('  🔧 FIX: Balance Recalculation with Date Cutoff');
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
            // ═══════════════════════════════════════════════════════
            // STEP 1: Remove person-linked SafePayment transactions
            // These are expense CATEGORIES, NOT vendor/customer payments
            // ═══════════════════════════════════════════════════════
            console.log('🗑️  Step 1: Removing person-linked SafePayment transactions...');
            const [delSafe] = yield conn.query(`
      DELETE FROM account_transactions 
      WHERE createdBy = 'Migration' AND description LIKE 'مصروفات خزينة:%'
    `);
            console.log(`  Deleted ${delSafe.affectedRows} safe payment transactions (expense categories, not vendor payments)`);
            // ═══════════════════════════════════════════════════════
            // STEP 2: Store balanceDate for each partner
            // ═══════════════════════════════════════════════════════
            console.log('\n📅 Step 2: Loading person balance dates...');
            const persons = loadJson('Persons.json');
            // Build personOldId → balanceDate map
            const balanceDateMap = new Map(); // partnerId (UUID) → balanceDate
            for (const person of persons) {
                const oldId = String(person.ID);
                const partnerId = (_a = idMap.partners) === null || _a === void 0 ? void 0 : _a[oldId];
                if (!partnerId || !person.balanceDate)
                    continue;
                const bd = new Date(person.balanceDate);
                if (!isNaN(bd.getTime())) {
                    balanceDateMap.set(partnerId, bd.toISOString().slice(0, 10)); // YYYY-MM-DD
                }
            }
            console.log(`  Loaded balance dates for ${balanceDateMap.size} partners`);
            // ═══════════════════════════════════════════════════════
            // STEP 3: Recalculate balances with date cutoff
            // ═══════════════════════════════════════════════════════
            console.log('\n📊 Step 3: Recalculating balances with date cutoff...\n');
            // Get all partners
            const [allPartners] = yield conn.query(`SELECT id, name, type, isSupplier, isCustomer, openingBalance FROM partners`);
            let updated = 0;
            let sampleOutputs = 0;
            for (const partner of allPartners) {
                const balanceDate = balanceDateMap.get(partner.id) || '2000-01-01'; // default = count all
                const isSupplier = partner.type === 'SUPPLIER' || partner.type === 'BOTH' || partner.isSupplier;
                let balance;
                if (isSupplier) {
                    // Supplier: balance = opening + purchases(after cutoff) - returns(after cutoff) - payments(after cutoff)
                    const [result] = yield conn.query(`
          SELECT 
            COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = ? AND i.type = 'INVOICE_PURCHASE' AND i.date > ?), 0) as purchases,
            COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = ? AND i.type = 'RETURN_PURCHASE' AND i.date > ?), 0) as returns,
            COALESCE((SELECT SUM(at2.debit) FROM account_transactions at2 WHERE at2.partnerId = ? AND at2.type = 'VENDOR_PAYMENT' AND at2.date > ?), 0) as payments
        `, [partner.id, balanceDate, partner.id, balanceDate, partner.id, balanceDate]);
                    balance = partner.openingBalance + result[0].purchases - result[0].returns - result[0].payments;
                    // Debug output for specific partner
                    if ((_b = partner.name) === null || _b === void 0 ? void 0 : _b.includes('غديه')) {
                        console.log(`  🔍 DEBUG: ${partner.name}`);
                        console.log(`     balanceDate: ${balanceDate}`);
                        console.log(`     opening: ${partner.openingBalance}`);
                        console.log(`     + purchases (after ${balanceDate}): ${result[0].purchases}`);
                        console.log(`     - returns (after ${balanceDate}): ${result[0].returns}`);
                        console.log(`     - payments (after ${balanceDate}): ${result[0].payments}`);
                        console.log(`     = balance: ${balance}`);
                    }
                }
                else {
                    // Customer: balance = opening + sales(after cutoff) - returns(after cutoff) - payments(after cutoff)
                    const [result] = yield conn.query(`
          SELECT 
            COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = ? AND i.type = 'INVOICE_SALE' AND i.date > ?), 0) as sales,
            COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = ? AND i.type = 'RETURN_SALE' AND i.date > ?), 0) as returns,
            COALESCE((SELECT SUM(at2.credit) FROM account_transactions at2 WHERE at2.partnerId = ? AND at2.type = 'CUSTOMER_PAYMENT' AND at2.date > ?), 0) as payments
        `, [partner.id, balanceDate, partner.id, balanceDate, partner.id, balanceDate]);
                    balance = partner.openingBalance + result[0].sales - result[0].returns - result[0].payments;
                }
                yield conn.query(`UPDATE partners SET balance = ? WHERE id = ?`, [balance, partner.id]);
                updated++;
            }
            console.log(`\n  ✅ Updated ${updated} partner balances`);
            // ═══════════════════════════════════════════════════════
            // VERIFICATION
            // ═══════════════════════════════════════════════════════
            console.log('\n✅ VERIFICATION\n');
            const [ghadia] = yield conn.query(`SELECT name, balance, openingBalance FROM partners WHERE name LIKE '%غديه ارت%'`);
            if (ghadia.length > 0) {
                console.log(`  ${ghadia[0].name}: balance = ${ghadia[0].balance} (expected: ~0)`);
            }
            const [balDist] = yield conn.query(`
      SELECT 
        COUNT(CASE WHEN ABS(balance) < 1 THEN 1 END) as zeroBalance,
        COUNT(CASE WHEN balance > 1 THEN 1 END) as positiveBalance,
        COUNT(CASE WHEN balance < -1 THEN 1 END) as negativeBalance,
        COUNT(*) as total
      FROM partners
    `);
            console.log(`\n  Total partners: ${balDist[0].total}`);
            console.log(`  ~Zero balance: ${balDist[0].zeroBalance}`);
            console.log(`  Positive balance: ${balDist[0].positiveBalance}`);
            console.log(`  Negative balance: ${balDist[0].negativeBalance}`);
            // Show top 10 suppliers by absolute balance for spotcheck
            console.log('\n  Top 10 suppliers by |balance| for verification:');
            const [topSuppliers] = yield conn.query(`
      SELECT name, balance, openingBalance FROM partners 
      WHERE type = 'SUPPLIER' OR isSupplier = TRUE 
      ORDER BY ABS(balance) DESC LIMIT 10
    `);
            for (const s of topSuppliers) {
                console.log(`    ${s.name.substring(0, 40).padEnd(40)} balance: ${String(s.balance).padStart(12)} (opening: ${s.openingBalance})`);
            }
            console.log('\n  🎉 Balance fix complete!\n');
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
