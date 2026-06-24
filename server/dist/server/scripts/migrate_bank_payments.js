"use strict";
/**
 * MIGRATE: Bank Accounts & Transactions (تحويلات البنوك)
 *
 * 1. Creates bank records from Banks.json + AccNumbers.json
 * 2. Migrates ALL BankAccount_Details.json transactions:
 *
 *   MoveType 1 = إيداع (Deposit cash→bank)        Dr Bank(102xx), Cr Cash(101)
 *   MoveType 2 = صادر (Bank expense/outgoing)      Dr Expense(508), Cr Bank(102xx)
 *   MoveType 3 = عمولات البنك (Bank fees)           Dr BankFees(507), Cr Bank(102xx)
 *   MoveType 4 = وارد/تحصيل عميل (Customer receipt) Dr Bank(102xx), Cr AR(104)
 *   MoveType 5 = سداد مورد (Supplier payment)      Dr AP(201), Cr Bank(102xx)
 *   MoveType 6 = أخرى (Other)                      Dr Expense(508), Cr Bank(102xx)
 *
 * For MoveType 4 & 5 with FK_Person_ID, also creates PAYMENT/RECEIPT invoices
 * so they appear in partner statements (كشف حساب).
 *
 * Run: npx ts-node server/scripts/migrate_bank_payments.ts
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
const MAPPING_FILE = process.env.MIGRATION_MAPPING_FILE || path.resolve(DATA_DIR, '../id_mapping.json');
function loadJson(filename) {
    const fp = path.join(DATA_DIR, filename);
    if (!fs.existsSync(fp))
        return [];
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
}
function formatDate(d) {
    if (!d)
        return new Date().toISOString().slice(0, 10);
    const s = String(d).split(' ')[0];
    if (s.includes('/')) {
        const parts = s.split('/');
        if (parts[0].length === 4)
            return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return s;
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        console.log('\n══════════════════════════════════════════════════════════');
        console.log('  🏦 MIGRATE: Bank Accounts & Transactions');
        console.log('══════════════════════════════════════════════════════════\n');
        const banks = loadJson('Banks.json');
        const accNumbers = loadJson('AccNumbers.json');
        const masters = loadJson('BankAccount.json');
        const details = loadJson('BankAccount_Details.json');
        const idMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        console.log(`  📂 Banks: ${banks.length}`);
        console.log(`  📂 AccNumbers: ${accNumbers.length}`);
        console.log(`  📂 BankAccount (masters): ${masters.length}`);
        console.log(`  📂 BankAccount_Details: ${details.length}`);
        // Build master date lookup
        const masterDateMap = new Map();
        for (const m of masters)
            masterDateMap.set(m.id, formatDate(m.InvDate));
        // Build AccNumber lookup (AccNoID → bank old ID)
        // AccNumbers has its own IDs, but AccNoID in details refers to BankID
        const accNumByBankId = new Map();
        for (const a of accNumbers)
            accNumByBankId.set(a.ID, a.title);
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectionLimit: 5,
        });
        const conn = yield pool.getConnection();
        try {
            // ═══ STEP 1: Get accounts ═══
            const [accountRows] = yield conn.query('SELECT id, code, name, type FROM accounts');
            const acctByCode = new Map();
            for (const a of accountRows)
                acctByCode.set(a.code, a);
            const cashAccount = acctByCode.get('101');
            const apAccount = acctByCode.get('201');
            const arAccount = acctByCode.get('104');
            const bankFeeAccount = acctByCode.get('507');
            const expenseAccount = acctByCode.get('508');
            if (!cashAccount || !apAccount || !arAccount || !bankFeeAccount || !expenseAccount) {
                console.error('❌ Missing required accounts!');
                return;
            }
            // ═══ STEP 2: Register Banks ═══
            console.log('\n  🏦 Registering banks...');
            // Clean existing banks
            yield conn.query(`DELETE FROM banks WHERE name IN (?)`, [banks.map((b) => b.title)]);
            const bankIdMap = new Map();
            // Map banks to their COA accounts (10201, 10202, etc.)
            const bankAccountCodes = ['10201', '10202', '10203', '10204'];
            for (let i = 0; i < banks.length; i++) {
                const bank = banks[i];
                const accNum = accNumByBankId.get(bank.ID) || '';
                const acctCode = bankAccountCodes[i] || `102${(i + 1).toString().padStart(2, '0')}`;
                let bankCoaAccount = acctByCode.get(acctCode);
                // Create COA account if needed
                if (!bankCoaAccount) {
                    const newAcctId = (0, crypto_1.randomUUID)();
                    yield conn.query(`INSERT INTO accounts (id, code, name, type) VALUES (?, ?, ?, 'ASSET')`, [newAcctId, acctCode, `بنك: ${bank.title}`]);
                    bankCoaAccount = { id: newAcctId, code: acctCode, name: `بنك: ${bank.title}` };
                    acctByCode.set(acctCode, bankCoaAccount);
                }
                const bankId = (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO banks (id, name, accountNumber, balance, accountId, currency)
         VALUES (?, ?, ?, 0, ?, 'EGP')`, [bankId, bank.title, accNum, bankCoaAccount.id]);
                bankIdMap.set(bank.ID, {
                    id: bankId,
                    accountId: bankCoaAccount.id,
                    name: bank.title,
                    accountNumber: accNum,
                });
                console.log(`    ✅ ${bank.title} (${accNum}) → ${acctCode} ${bankCoaAccount.name}`);
            }
            // ═══ STEP 3: Clean previous migration ═══
            console.log('\n  🧹 Cleaning previous bank migration...');
            const [existingInv] = yield conn.query(`SELECT id FROM invoices WHERE number LIKE 'OLD-BPAY-%' OR number LIKE 'OLD-BREC-%'`);
            if (existingInv.length > 0) {
                const ids = existingInv.map((r) => r.id);
                for (let i = 0; i < ids.length; i += 500) {
                    const chunk = ids.slice(i, i + 500);
                    yield conn.query('DELETE FROM invoices WHERE id IN (?)', [chunk]);
                }
                console.log(`    Deleted ${existingInv.length} previous invoices`);
            }
            const [existingJnl] = yield conn.query(`SELECT id FROM journal_entries WHERE description LIKE '[MIGRATED-BANK]%'`);
            if (existingJnl.length > 0) {
                const ids = existingJnl.map((r) => r.id);
                for (let i = 0; i < ids.length; i += 500) {
                    const chunk = ids.slice(i, i + 500);
                    yield conn.query('DELETE FROM journal_lines WHERE journalId IN (?)', [chunk]);
                    yield conn.query('DELETE FROM journal_entries WHERE id IN (?)', [chunk]);
                }
                console.log(`    Deleted ${existingJnl.length} previous journal entries`);
            }
            // ═══ STEP 4: Load partner names ═══
            const [partnerRows] = yield conn.query('SELECT id, name FROM partners');
            const partnerNameMap = new Map();
            for (const p of partnerRows)
                partnerNameMap.set(p.id, p.name);
            // ═══ STEP 5: Process ALL details ═══
            console.log('\n  📝 Processing bank transactions...');
            const stats = {
                deposits: { count: 0, value: 0 },
                bankExpenses: { count: 0, value: 0 },
                bankFees: { count: 0, value: 0 },
                customerReceipts: { count: 0, value: 0 },
                supplierPayments: { count: 0, value: 0 },
                other: { count: 0, value: 0 },
                skipped: 0,
                errors: 0,
            };
            for (let batchStart = 0; batchStart < details.length; batchStart += 500) {
                const batch = details.slice(batchStart, batchStart + 500);
                yield conn.beginTransaction();
                for (const detail of batch) {
                    const rawValue = Number(detail.Value || 0);
                    if (rawValue === 0) {
                        stats.skipped++;
                        continue;
                    }
                    // Negative values = reversals (handle gracefully — use absolute value, swap Dr/Cr)
                    const isReversal = rawValue < 0;
                    const value = Math.abs(rawValue);
                    const date = masterDateMap.get(detail.MasterID) || new Date().toISOString().slice(0, 10);
                    const notes = detail.Notes || '';
                    const receiveNo = detail.ReceiveNo || '';
                    const moveType = detail.MoveType;
                    // Determine which bank
                    const bankInfo = bankIdMap.get(detail.AccNoID) || bankIdMap.get(1); // fallback to first bank
                    if (!bankInfo) {
                        stats.skipped++;
                        continue;
                    }
                    const bankAccount = acctByCode.get(((_a = [...acctByCode.entries()].find(([_, v]) => v.id === bankInfo.accountId)) === null || _a === void 0 ? void 0 : _a[0]) || '10201');
                    if (!bankAccount) {
                        stats.skipped++;
                        continue;
                    }
                    try {
                        switch (moveType) {
                            case 1: {
                                // ═══ إيداع (Deposit: Cash → Bank) ═══
                                const desc = `[MIGRATED-BANK] إيداع بنكي - ${bankInfo.name}${notes ? ` - ${notes}` : ''}`;
                                const jId = (0, crypto_1.randomUUID)();
                                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy) VALUES (?, ?, ?, ?, 'migration')`, [jId, date, desc, `BANK-DEP-${detail.RowID}`]);
                                if (detail.FromToSafe) {
                                    // From cash drawer to bank
                                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES
                   (?, ?, ?, ?, 0), (?, ?, ?, 0, ?)`, [jId, bankAccount.id, bankAccount.name, value,
                                        jId, cashAccount.id, cashAccount.name, value]);
                                }
                                else {
                                    // External deposit
                                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES
                   (?, ?, ?, ?, 0), (?, ?, ?, 0, ?)`, [jId, bankAccount.id, bankAccount.name, value,
                                        jId, arAccount.id, arAccount.name, value]);
                                }
                                stats.deposits.count++;
                                stats.deposits.value += value;
                                break;
                            }
                            case 2: {
                                // ═══ صادر (Bank outgoing/expense) ═══
                                const desc = `[MIGRATED-BANK] مصروفات بنكية - ${bankInfo.name}${notes ? ` - ${notes}` : ''}`;
                                const jId = (0, crypto_1.randomUUID)();
                                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy) VALUES (?, ?, ?, ?, 'migration')`, [jId, date, desc, `BANK-EXP-${detail.RowID}`]);
                                yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES
                 (?, ?, ?, ?, 0), (?, ?, ?, 0, ?)`, [jId, expenseAccount.id, expenseAccount.name, value,
                                    jId, bankAccount.id, bankAccount.name, value]);
                                stats.bankExpenses.count++;
                                stats.bankExpenses.value += value;
                                break;
                            }
                            case 3: {
                                // ═══ عمولات البنك (Bank fees) ═══
                                const desc = `[MIGRATED-BANK] عمولات بنكية - ${bankInfo.name}${notes ? ` - ${notes}` : ''}`;
                                const jId = (0, crypto_1.randomUUID)();
                                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy) VALUES (?, ?, ?, ?, 'migration')`, [jId, date, desc, `BANK-FEE-${detail.RowID}`]);
                                yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES
                 (?, ?, ?, ?, 0), (?, ?, ?, 0, ?)`, [jId, bankFeeAccount.id, bankFeeAccount.name, value,
                                    jId, bankAccount.id, bankAccount.name, value]);
                                stats.bankFees.count++;
                                stats.bankFees.value += value;
                                break;
                            }
                            case 4: {
                                // ═══ وارد/تحصيل عميل (Customer receipt via bank) ═══
                                const personOldId = String(detail.FK_Person_ID || '');
                                const partnerId = (_b = idMap.partners) === null || _b === void 0 ? void 0 : _b[personOldId];
                                const partnerName = partnerId ? (partnerNameMap.get(partnerId) || '') : '';
                                const desc = `[MIGRATED-BANK] تحصيل بنكي${partnerName ? ` - ${partnerName}` : ''}${notes ? ` - ${notes}` : ''}`;
                                const jId = (0, crypto_1.randomUUID)();
                                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy) VALUES (?, ?, ?, ?, 'migration')`, [jId, date, desc, `BANK-REC-${detail.RowID}`]);
                                yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES
                 (?, ?, ?, ?, 0), (?, ?, ?, 0, ?)`, [jId, bankAccount.id, bankAccount.name, value,
                                    jId, arAccount.id, arAccount.name, value]);
                                // Also create RECEIPT invoice for partner statement
                                if (partnerId) {
                                    const invId = (0, crypto_1.randomUUID)();
                                    const fullNotes = [notes, receiveNo ? `رقم الإيصال: ${receiveNo}` : ''].filter(Boolean).join(' | ');
                                    yield conn.query(`INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, paidAmount, createdBy, voucherCategory)
                   VALUES (?, ?, ?, 'RECEIPT', ?, ?, ?, 'POSTED', 'BANK', TRUE, ?, ?, 'migration', 'customer')`, [invId, `OLD-BREC-${detail.RowID}`, date, partnerId, partnerName, value, fullNotes || 'تحصيل بنكي', value]);
                                }
                                stats.customerReceipts.count++;
                                stats.customerReceipts.value += value;
                                break;
                            }
                            case 5: {
                                // ═══ سداد مورد (Supplier payment via bank) ═══
                                const personOldId = String(detail.FK_Person_ID || '');
                                const partnerId = (_c = idMap.partners) === null || _c === void 0 ? void 0 : _c[personOldId];
                                const partnerName = partnerId ? (partnerNameMap.get(partnerId) || '') : '';
                                const desc = `[MIGRATED-BANK] سداد بنكي مورد${partnerName ? ` - ${partnerName}` : ''}${notes ? ` - ${notes}` : ''}`;
                                const jId = (0, crypto_1.randomUUID)();
                                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy) VALUES (?, ?, ?, ?, 'migration')`, [jId, date, desc, `BANK-PAY-${detail.RowID}`]);
                                yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES
                 (?, ?, ?, ?, 0), (?, ?, ?, 0, ?)`, [jId, apAccount.id, apAccount.name, value,
                                    jId, bankAccount.id, bankAccount.name, value]);
                                // Also create PAYMENT invoice for partner statement
                                if (partnerId) {
                                    const invId = (0, crypto_1.randomUUID)();
                                    const fullNotes = [notes, receiveNo ? `رقم الإيصال: ${receiveNo}` : ''].filter(Boolean).join(' | ');
                                    yield conn.query(`INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, paidAmount, createdBy, voucherCategory)
                   VALUES (?, ?, ?, 'PAYMENT', ?, ?, ?, 'POSTED', 'BANK', TRUE, ?, ?, 'migration', 'supplier')`, [invId, `OLD-BPAY-${detail.RowID}`, date, partnerId, partnerName, value, fullNotes || 'سداد بنكي مورد', value]);
                                }
                                stats.supplierPayments.count++;
                                stats.supplierPayments.value += value;
                                break;
                            }
                            case 6:
                            default: {
                                // ═══ أخرى (Other) ═══
                                const desc = `[MIGRATED-BANK] حركة بنكية أخرى - ${bankInfo.name}${notes ? ` - ${notes}` : ''}`;
                                const jId = (0, crypto_1.randomUUID)();
                                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy) VALUES (?, ?, ?, ?, 'migration')`, [jId, date, desc, `BANK-OTH-${detail.RowID}`]);
                                yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES
                 (?, ?, ?, ?, 0), (?, ?, ?, 0, ?)`, [jId, expenseAccount.id, expenseAccount.name, value,
                                    jId, bankAccount.id, bankAccount.name, value]);
                                stats.other.count++;
                                stats.other.value += value;
                                break;
                            }
                        }
                    }
                    catch (err) {
                        if (err.code === 'ER_DUP_ENTRY') {
                            stats.skipped++;
                            continue;
                        }
                        console.error(`  ❌ Row ${detail.RowID}: ${err.message}`);
                        stats.errors++;
                    }
                }
                yield conn.commit();
                if ((batchStart + 500) % 1000 === 0 || batchStart + 500 >= details.length) {
                    console.log(`    ... processed ${Math.min(batchStart + 500, details.length)} / ${details.length}`);
                }
            }
            // ═══ STEP 6: Update bank balances from journal ═══
            console.log('\n  📊 Updating bank balances...');
            for (const [oldId, bank] of bankIdMap) {
                const [bal] = yield conn.query(`
        SELECT COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) as balance
        FROM journal_lines jl WHERE jl.accountId = ?
      `, [bank.accountId]);
                const balance = ((_d = bal[0]) === null || _d === void 0 ? void 0 : _d.balance) || 0;
                yield conn.query('UPDATE banks SET balance = ? WHERE id = ?', [balance, bank.id]);
                console.log(`    ${bank.name}: ${balance.toLocaleString()} EGP`);
            }
            // ═══ RESULTS ═══
            console.log('\n══════════════════════════════════════════════════════════');
            console.log('  📊 RESULTS');
            console.log('══════════════════════════════════════════════════════════');
            console.log(`  🏦 Banks created: ${bankIdMap.size}`);
            console.log(`  📥 Deposits (type=1):      ${stats.deposits.count} → ${stats.deposits.value.toLocaleString()} EGP`);
            console.log(`  📤 Bank Expenses (type=2):  ${stats.bankExpenses.count} → ${stats.bankExpenses.value.toLocaleString()} EGP`);
            console.log(`  💳 Bank Fees (type=3):      ${stats.bankFees.count} → ${stats.bankFees.value.toLocaleString()} EGP`);
            console.log(`  💰 Customer Receipts (4):   ${stats.customerReceipts.count} → ${stats.customerReceipts.value.toLocaleString()} EGP`);
            console.log(`  💸 Supplier Payments (5):   ${stats.supplierPayments.count} → ${stats.supplierPayments.value.toLocaleString()} EGP`);
            console.log(`  📋 Other (type=6):          ${stats.other.count} → ${stats.other.value.toLocaleString()} EGP`);
            console.log(`  ⏭️  Skipped:                ${stats.skipped}`);
            console.log(`  ❌ Errors:                  ${stats.errors}`);
            // Save mapping
            if (!idMap.banks)
                idMap.banks = {};
            for (const [oldId, bank] of bankIdMap) {
                idMap.banks[String(oldId)] = bank.id;
            }
            fs.writeFileSync(MAPPING_FILE, JSON.stringify(idMap, null, 2));
            console.log('\n  ✅ Saved ID mapping');
        }
        catch (err) {
            yield conn.rollback();
            throw err;
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
