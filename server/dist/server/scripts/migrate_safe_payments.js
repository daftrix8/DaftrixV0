"use strict";
/**
 * MIGRATE: SafePayment & SafePayment_Details → journal_entries + journal_lines
 *
 * Legacy SafePayment = internal cash drawer movements (خزنة)
 * Legacy Payment_Types = categories with paymentType:
 *   1 = وارد (Cash IN)   → Debit Cash, Credit Revenue/Income account
 *   2 = صادر (Cash OUT, mixed - settlements, income adjustments)
 *   3 = مصروفات (Expenses) → Debit Expense account, Credit Cash
 *
 * Each SafePayment_Details row becomes one journal_entry with 2 journal_lines.
 *
 * Run: npx ts-node server/scripts/migrate_safe_payments.ts
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
const crypto_1 = require("crypto");
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const DATA_DIR = process.env.MIGRATION_DATA_DIR || path.resolve(__dirname, '../../mall stuff/data');
function loadJson(filename) {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
}
// Map legacy Payment_Types categories to expense account codes in our COA
function mapCategoryToAccountCode(title, paymentType) {
    const t = title.trim();
    // paymentType 1 = Cash IN (وارد)
    if (paymentType === 1) {
        if (t.includes('عجز'))
            return '510'; // عجز نقدية
        return '405'; // زيادة نقدية (default income/adjustment)
    }
    // paymentType 2 = Mixed (صادر/وارد)
    if (paymentType === 2) {
        if (t.includes('تسويه') || t.includes('تسوية'))
            return '405'; // settlements → زيادة نقدية
        if (t.includes('ايرادات') || t.includes('إيرادات'))
            return '403'; // إيرادات خدمات
        if (t.includes('حوافز'))
            return '503'; // حوافز → رواتب
        return '405'; // default
    }
    // paymentType 3 = Expenses (مصروفات)
    if (t.includes('رواتب') || t.includes('مرتبات') || t.includes('أجور'))
        return '503';
    if (t.includes('حوافز') || t.includes('مكافآت') || t.includes('مكافأة'))
        return '503';
    if (t.includes('سلف'))
        return '503';
    if (t.includes('كهرباء') || t.includes('مياه') || t.includes('غاز') || t.includes('مرافق'))
        return '505';
    if (t.includes('إيجار') || t.includes('ايجار'))
        return '504';
    if (t.includes('دعاي') || t.includes('إعلان') || t.includes('اعلان'))
        return '506';
    if (t.includes('صيانة') || t.includes('صيانه'))
        return '508';
    if (t.includes('بنك') || t.includes('عمول'))
        return '507';
    // All other expenses → generic مصروفات أخرى (use 508 as catch-all)
    return '508';
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n══════════════════════════════════════════════');
        console.log('  💰 MIGRATE: SafePayment → Journal Entries');
        console.log('══════════════════════════════════════════════\n');
        // Load legacy data
        const masters = loadJson('SafePayment.json');
        const details = loadJson('SafePayment_Details.json');
        const paymentTypes = loadJson('Payment_Types.json');
        console.log(`  📂 SafePayment masters: ${masters.length}`);
        console.log(`  📂 SafePayment_Details: ${details.length}`);
        console.log(`  📂 Payment_Types: ${paymentTypes.length}`);
        // Build lookup maps
        const masterMap = new Map();
        for (const m of masters)
            masterMap.set(m.ID, m);
        const ptMap = new Map();
        for (const p of paymentTypes)
            ptMap.set(p.ID, p);
        // Build parent chain for category names
        function getFullCategoryName(paymentID) {
            const pt = ptMap.get(paymentID);
            if (!pt)
                return `بند #${paymentID}`;
            let name = pt.title;
            if (pt.parentID && pt.parentID !== 0) {
                const parent = ptMap.get(pt.parentID);
                if (parent)
                    name = `${parent.title} / ${name}`;
            }
            return name;
        }
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const conn = yield pool.getConnection();
        try {
            // 1. Clean up previous migration
            console.log('\n  🧹 Cleaning up previous SafePayment migration...');
            const [existing] = yield conn.query("SELECT id FROM journal_entries WHERE description LIKE '[MIGRATED-SP]%'");
            if (existing.length > 0) {
                const ids = existing.map((r) => r.id);
                for (let i = 0; i < ids.length; i += 500) {
                    const chunk = ids.slice(i, i + 500);
                    yield conn.query('DELETE FROM journal_lines WHERE journalId IN (?)', [chunk]);
                    yield conn.query('DELETE FROM journal_entries WHERE id IN (?)', [chunk]);
                }
                console.log(`     Deleted ${existing.length} previous entries.`);
            }
            // 2. Get account ID map from code
            const [accountRows] = yield conn.query('SELECT id, code, name, type FROM accounts');
            const accountByCode = new Map();
            for (const a of accountRows)
                accountByCode.set(a.code, a);
            // Cash account (الخزينة الرئيسية)
            const cashAccount = accountByCode.get('101');
            if (!cashAccount) {
                console.error('❌ Cash account (code 101) not found! Aborting.');
                return;
            }
            console.log(`  💵 Cash account: ${cashAccount.name} (${cashAccount.id})`);
            // 3. Ensure we have a catch-all expense account for unmapped categories
            // Create "مصروفات عمومية (مهاجرة)" account if code 599 doesn't exist
            let generalExpenseAccount = accountByCode.get('599');
            if (!generalExpenseAccount) {
                const gId = (0, crypto_1.randomUUID)();
                yield conn.query("INSERT INTO accounts (id, code, name, type) VALUES (?, '599', 'مصروفات عمومية (مهاجرة)', 'EXPENSE')", [gId]);
                generalExpenseAccount = { id: gId, code: '599', name: 'مصروفات عمومية (مهاجرة)', type: 'EXPENSE' };
                accountByCode.set('599', generalExpenseAccount);
                console.log('  ✅ Created catch-all expense account: 599 - مصروفات عمومية (مهاجرة)');
            }
            // 4. Migrate cash_categories from Payment_Types
            console.log('\n  📁 Migrating cash categories from Payment_Types...');
            const [existingCats] = yield conn.query('SELECT id, name FROM cash_categories');
            const existingCatNames = new Set(existingCats.map((c) => c.name));
            let catsCreated = 0;
            for (const pt of paymentTypes) {
                if (pt.parentID !== 0)
                    continue; // Only create top-level categories
                const catName = pt.title;
                if (existingCatNames.has(catName))
                    continue;
                const catType = pt.paymentType === 1 ? 'INCOME' : 'EXPENSE';
                const acctCode = mapCategoryToAccountCode(pt.title, pt.paymentType);
                const acct = accountByCode.get(acctCode);
                yield conn.query('INSERT INTO cash_categories (id, name, type, accountId) VALUES (?, ?, ?, ?)', [(0, crypto_1.randomUUID)(), catName, catType, (acct === null || acct === void 0 ? void 0 : acct.id) || generalExpenseAccount.id]);
                existingCatNames.add(catName);
                catsCreated++;
            }
            console.log(`     Created ${catsCreated} new categories.`);
            // 5. Process details - create journal entries
            console.log('\n  📝 Creating journal entries...');
            let created = 0;
            let skipped = 0;
            let totalValue = 0;
            let reversals = 0;
            // Process in batches
            const BATCH_SIZE = 500;
            for (let i = 0; i < details.length; i += BATCH_SIZE) {
                const batch = details.slice(i, i + BATCH_SIZE);
                yield conn.beginTransaction();
                for (const detail of batch) {
                    const master = masterMap.get(detail.MasterID);
                    if (!master) {
                        skipped++;
                        continue;
                    }
                    const rawValue = Number(detail.value) || 0;
                    if (rawValue === 0) {
                        skipped++;
                        continue;
                    }
                    // Negative values = reversals (e.g. مردودات سلف = repaid advance)
                    // A negative expense is actually cash IN, a negative income is actually cash OUT
                    const isReversal = rawValue < 0;
                    const value = Math.abs(rawValue);
                    const pt = ptMap.get(detail.PaymentID);
                    const paymentType = (pt === null || pt === void 0 ? void 0 : pt.paymentType) || 3;
                    const categoryName = getFullCategoryName(detail.PaymentID);
                    const acctCode = mapCategoryToAccountCode((pt === null || pt === void 0 ? void 0 : pt.title) || '', paymentType);
                    const targetAccount = accountByCode.get(acctCode) || generalExpenseAccount;
                    const date = master.InvDate || new Date().toISOString().slice(0, 10);
                    const notes = detail.Notes || '';
                    // Description with migration marker
                    const reversalMarker = isReversal ? ' [مردودات]' : '';
                    const description = `[MIGRATED-SP] ${categoryName}${reversalMarker}${notes ? ' - ' + notes : ''}`;
                    const journalId = (0, crypto_1.randomUUID)();
                    // Insert journal_entry
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy) 
           VALUES (?, ?, ?, ?, ?)`, [journalId, date, description, `OLD-SP-${detail.RowID}`, 'migration']);
                    // Determine debit/credit based on payment type AND reversal status
                    if (isReversal) {
                        // Reversal: flip the normal direction
                        // Reversed expense (paymentType 3/2) = cash IN → Dr Cash, Cr Expense
                        // Reversed income (paymentType 1) = cash OUT → Dr Income, Cr Cash
                        if (paymentType === 1) {
                            // Reversed income: money went OUT
                            yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES 
               (?, ?, ?, ?, 0),
               (?, ?, ?, 0, ?)`, [
                                journalId, targetAccount.id, targetAccount.name, value,
                                journalId, cashAccount.id, cashAccount.name, value
                            ]);
                        }
                        else {
                            // Reversed expense: money came IN (e.g. مردودات سلف)
                            yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES 
               (?, ?, ?, ?, 0),
               (?, ?, ?, 0, ?)`, [
                                journalId, cashAccount.id, cashAccount.name, value,
                                journalId, targetAccount.id, targetAccount.name, value
                            ]);
                        }
                    }
                    else if (paymentType === 1) {
                        // Normal Cash IN (وارد): Debit Cash, Credit Income
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES 
             (?, ?, ?, ?, 0),
             (?, ?, ?, 0, ?)`, [
                            journalId, cashAccount.id, cashAccount.name, value,
                            journalId, targetAccount.id, targetAccount.name, value
                        ]);
                    }
                    else {
                        // Normal Cash OUT (صادر/مصروفات): Debit Expense, Credit Cash
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES 
             (?, ?, ?, ?, 0),
             (?, ?, ?, 0, ?)`, [
                            journalId, targetAccount.id, targetAccount.name, value,
                            journalId, cashAccount.id, cashAccount.name, value
                        ]);
                    }
                    created++;
                    totalValue += value;
                    if (isReversal)
                        reversals++;
                }
                yield conn.commit();
                if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= details.length) {
                    console.log(`     ... processed ${Math.min(i + BATCH_SIZE, details.length)} / ${details.length}`);
                }
            }
            console.log('\n══════════════════════════════════════════════');
            console.log('  📊 RESULTS');
            console.log('══════════════════════════════════════════════');
            console.log(`  ✅ Journal entries created:  ${created}`);
            console.log(`  🔄 Reversals (negative):     ${reversals}`);
            console.log(`  ⏭️  Skipped (no master/0):    ${skipped}`);
            console.log(`  💰 Total value:              ${totalValue.toLocaleString()} EGP`);
            console.log(`  📁 Categories created:       ${catsCreated}`);
        }
        catch (e) {
            yield conn.rollback();
            throw e;
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
