"use strict";
/**
 * MIGRATE: VendorPayment + VendorPayment_Details → invoices (type=PAYMENT)
 *          customer_Payment + Customer_Payment_Details → invoices (type=RECEIPT)
 *
 * Legacy VendorPayment = payments made TO suppliers (سند صرف مورد)
 * Legacy customer_Payment = payments received FROM customers (سند قبض عميل)
 *
 * In our ERP, these are stored as invoices with:
 *   - type = 'PAYMENT' for vendor (supplier) payments
 *   - type = 'RECEIPT' for customer payments
 *   - partnerId links to the supplier/customer
 *   - total = payment amount
 *   - paymentMethod = 'CASH' (from safe/cash drawer)
 *
 * Also creates journal entries for accounting:
 *   PAYMENT: Dr Payables(201), Cr Cash(101)
 *   RECEIPT:  Dr Cash(101), Cr Receivables(121)
 *
 * Run: npx ts-node server/scripts/migrate_vendor_payments.ts
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
const BATCH_SIZE = 500;
function loadJson(filename) {
    const fp = path.join(DATA_DIR, filename);
    if (!fs.existsSync(fp))
        return [];
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
}
// Build a lookup from old VendorID/CustID → partner title/mobile from Persons.json
// This is used as a fallback when idMap.partners points to a non-existent partner
const personsLookup = new Map();
try {
    const persons = loadJson('Persons.json');
    for (const p of persons) {
        personsLookup.set(String(p.ID), {
            title: p.title || p.Name || p.name || '',
            mobile: p.mobile || p.Phone1 || p.tel || '',
        });
    }
}
catch (e) { /* Persons.json may not exist */ }
function formatDate(d) {
    if (!d)
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    const s = String(d).split(' ')[0]; // take date part only
    // Handle DD/MM/YYYY or YYYY-MM-DD
    if (s.includes('/')) {
        const [day, month, year] = s.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return s;
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n══════════════════════════════════════════════════════════');
        console.log('  💸 MIGRATE: Vendor + Customer Payments → Invoices');
        console.log('══════════════════════════════════════════════════════════\n');
        const idMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectionLimit: 5,
        });
        const conn = yield pool.getConnection();
        try {
            // Get next invoice number offset
            const [maxNum] = yield conn.query(`SELECT MAX(CAST(REPLACE(REPLACE(number, 'OLD-VP-', ''), 'OLD-CP-', '') AS UNSIGNED)) as mx FROM invoices WHERE number LIKE 'OLD-VP-%' OR number LIKE 'OLD-CP-%'`);
            // Get account IDs
            const [accounts] = yield conn.query('SELECT id, code, name FROM accounts');
            const acctByCode = new Map();
            for (const a of accounts)
                acctByCode.set(a.code, a);
            const cashAccount = acctByCode.get('101');
            const apAccount = acctByCode.get('201'); // Accounts Payable
            const arAccount = acctByCode.get('104'); // Accounts Receivable (العملاء/الذمم المدينة)
            if (!cashAccount) {
                console.error('❌ Cash account (101) not found!');
                return;
            }
            if (!apAccount) {
                console.error('❌ AP account (201) not found!');
                return;
            }
            if (!arAccount) {
                console.error('❌ AR account (104) not found!');
                return;
            }
            console.log(`  💵 Cash: ${cashAccount.name}`);
            console.log(`  📋 AP: ${apAccount.name}`);
            console.log(`  📋 AR: ${arAccount.name}`);
            // ═══ VENDOR PAYMENTS ═══
            yield migratePayments(conn, idMap, {
                headerFile: 'VendorPayment.json',
                detailFile: 'VendorPayment_Details.json',
                partnerIdField: 'VendorID',
                invoiceType: 'PAYMENT',
                prefix: 'OLD-VP-',
                label: 'Vendor Payments (سند صرف مورد)',
                debitAccount: apAccount, // Dr Payables (reduce what we owe)
                creditAccount: cashAccount, // Cr Cash (cash goes out)
                mapKey: 'vendorPayments',
            });
            // ═══ CUSTOMER PAYMENTS ═══
            yield migratePayments(conn, idMap, {
                headerFile: 'customer_Payment.json',
                detailFile: 'Customer_Payment_Details.json',
                partnerIdField: 'CustID',
                invoiceType: 'RECEIPT',
                prefix: 'OLD-CP-',
                label: 'Customer Payments (سند قبض عميل)',
                debitAccount: cashAccount, // Dr Cash (cash comes in)
                creditAccount: arAccount, // Cr Receivables (reduce what they owe)
                mapKey: 'customerPayments',
            });
            // Save updated idMap
            fs.writeFileSync(MAPPING_FILE, JSON.stringify(idMap, null, 2));
            console.log('\n  ✅ Saved ID mapping');
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
function migratePayments(conn, idMap, config) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`\n━━━ ${config.label} ━━━`);
        const headers = loadJson(config.headerFile);
        const details = loadJson(config.detailFile);
        if (headers.length === 0) {
            console.log('  ⏭️  No data found, skipping');
            return;
        }
        console.log(`  📂 Headers: ${headers.length}, Details: ${details.length}`);
        // Build header lookup
        const headerMap = new Map();
        for (const h of headers)
            headerMap.set(h.ID, h);
        // Initialize map key in idMap
        if (!idMap[config.mapKey])
            idMap[config.mapKey] = {};
        // Clean previous migration
        const [existing] = yield conn.query(`SELECT id FROM invoices WHERE number LIKE ? OR number LIKE ?`, [`${config.prefix}%`, `${config.prefix}DEBIT-%`]);
        if (existing.length > 0) {
            const ids = existing.map((r) => r.id);
            // Delete journal entries linked to these
            for (let i = 0; i < ids.length; i += 500) {
                const chunk = ids.slice(i, i + 500);
                // Delete journal lines first, then entries
                yield conn.query(`DELETE jl FROM journal_lines jl JOIN journal_entries je ON jl.journalId = je.id WHERE je.referenceId IN (?)`, [chunk.map((id) => `INV-${id}`)]);
                yield conn.query(`DELETE FROM journal_entries WHERE referenceId IN (?)`, [chunk.map((id) => `INV-${id}`)]);
                yield conn.query('DELETE FROM invoices WHERE id IN (?)', [chunk]);
            }
            console.log(`  🧹 Cleaned ${existing.length} previous entries`);
        }
        let created = 0;
        let skipped = 0;
        let totalValue = 0;
        let debitTransfers = 0;
        // Group details by MasterID and sum values per vendor/customer
        const paymentsByMaster = new Map();
        for (const d of details) {
            const masterId = d.MasterID;
            if (!paymentsByMaster.has(masterId))
                paymentsByMaster.set(masterId, []);
            paymentsByMaster.get(masterId).push({
                partnerId: d[config.partnerIdField] || d.VendorID || d.CustomerID,
                value: Number(d.Value || d.value || 0),
                safeID: d.SafeID || 0,
                notes: d.Notes || '',
            });
        }
        for (let batchStart = 0; batchStart < details.length; batchStart += BATCH_SIZE) {
            const batch = details.slice(batchStart, batchStart + BATCH_SIZE);
            yield conn.beginTransaction();
            for (const detail of batch) {
                const masterId = detail.MasterID;
                const header = headerMap.get(masterId);
                if (!header) {
                    skipped++;
                    continue;
                }
                const value = Number(detail.Value || detail.value || 0);
                if (value === 0) {
                    skipped++;
                    continue;
                }
                // Negative values = DEBIT transfers (customer-to-customer transfers, bounced cheques, etc.)
                // These INCREASE the partner's balance instead of reducing it.
                const isDebitTransfer = value < 0;
                const absValue = Math.abs(value);
                const oldPartnerIdStr = String(detail[config.partnerIdField] || detail.VendorID || detail.CustID || '');
                let partnerId = idMap.partners[oldPartnerIdStr];
                // Get partner name — first try from idMap, then fallback
                let partnerName = '';
                if (partnerId) {
                    try {
                        const [pRows] = yield conn.query('SELECT name FROM partners WHERE id = ?', [partnerId]);
                        if (pRows.length > 0)
                            partnerName = pRows[0].name;
                    }
                    catch (e) { }
                }
                // FALLBACK: If the partner from idMap doesn't exist (e.g. Persons.json mapped to a
                // different UUID than what the invoice migration created), search by name/phone
                if (!partnerName) {
                    const personInfo = personsLookup.get(oldPartnerIdStr);
                    if (personInfo && (personInfo.title || personInfo.mobile)) {
                        try {
                            // Try matching by name first (exact match)
                            if (personInfo.title) {
                                const [nameRows] = yield conn.query('SELECT id, name FROM partners WHERE name = ? LIMIT 1', [personInfo.title]);
                                if (nameRows.length > 0) {
                                    partnerId = nameRows[0].id;
                                    partnerName = nameRows[0].name;
                                }
                            }
                            // Fallback: match by phone
                            if (!partnerName && personInfo.mobile) {
                                const [phoneRows] = yield conn.query('SELECT id, name FROM partners WHERE phone = ? LIMIT 1', [personInfo.mobile]);
                                if (phoneRows.length > 0) {
                                    partnerId = phoneRows[0].id;
                                    partnerName = phoneRows[0].name;
                                }
                            }
                            // Update idMap cache so future lookups are fast
                            if (partnerId && partnerName) {
                                idMap.partners[oldPartnerIdStr] = partnerId;
                            }
                        }
                        catch (e) { }
                    }
                }
                // If partner still doesn't exist in our DB, skip
                if (!partnerName || !partnerId) {
                    skipped++;
                    continue;
                }
                const date = formatDate(header.InvDate || header.invDate);
                const invNum = header.InvNo || header.invNum || masterId;
                let number;
                let invoiceType;
                let paymentMethod;
                let description;
                let voucherCategory;
                if (isDebitTransfer) {
                    // Negative value = debit/credit adjustment
                    // For VENDORS (config.invoiceType === 'PAYMENT'):
                    //   Negative vendor payment = credit side (purchases/goods received from vendor)
                    //   → INVOICE_PURCHASE (contributes to sImpact as -total, i.e., we owe them more)
                    // For CUSTOMERS (config.invoiceType === 'RECEIPT'):
                    //   Negative customer payment = they owe us more
                    //   → INVOICE_SALE (contributes to cImpact as +total)
                    number = `${config.prefix}DEBIT-${invNum}-${detail.RowID || detail.ID}`;
                    invoiceType = config.invoiceType === 'PAYMENT' ? 'INVOICE_PURCHASE' : 'INVOICE_SALE';
                    paymentMethod = 'CREDIT';
                    description = detail.Notes
                        ? `[تحويل مدين] ${detail.Notes}`
                        : `تحويل مدين - ${partnerName} (سند رقم ${invNum})`;
                    voucherCategory = config.invoiceType === 'PAYMENT' ? 'supplier' : 'customer';
                }
                else {
                    // Positive value = normal receipt/payment
                    number = `${config.prefix}${invNum}-${detail.RowID || detail.ID}`;
                    invoiceType = config.invoiceType;
                    paymentMethod = 'CASH';
                    description = config.invoiceType === 'PAYMENT'
                        ? `سند صرف مورد - ${partnerName}`
                        : `سند قبض عميل - ${partnerName}`;
                    voucherCategory = config.invoiceType === 'PAYMENT' ? 'supplier' : 'customer';
                }
                const newId = (0, crypto_1.randomUUID)();
                try {
                    // Create invoice record
                    yield conn.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status,
           paymentMethod, posted, notes, number, paidAmount, createdBy, voucherCategory)
           VALUES (?, ?, ?, ?, ?, ?, 'POSTED', ?, TRUE, ?, ?, ?, 'migration', ?)`, [
                        newId, date, invoiceType, partnerId, partnerName, absValue,
                        paymentMethod, detail.Notes || description, number, absValue,
                        voucherCategory
                    ]);
                    // Create journal entry (only for normal payments, not debit transfers)
                    if (!isDebitTransfer) {
                        const journalId = (0, crypto_1.randomUUID)();
                        yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy)
             VALUES (?, ?, ?, ?, 'migration')`, [journalId, date, `[MIGRATED-PAY] ${description}`, `INV-${newId}`]);
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES
             (?, ?, ?, ?, 0),
             (?, ?, ?, 0, ?)`, [
                            journalId, config.debitAccount.id, config.debitAccount.name, absValue,
                            journalId, config.creditAccount.id, config.creditAccount.name, absValue,
                        ]);
                    }
                    idMap[config.mapKey][`${masterId}-${detail.RowID || detail.ID}`] = newId;
                    created++;
                    totalValue += absValue;
                    if (isDebitTransfer)
                        debitTransfers++;
                }
                catch (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        skipped++;
                        continue;
                    }
                    console.error(`  ❌ ${number}: ${err.message}`);
                    skipped++;
                }
            }
            yield conn.commit();
            if ((batchStart + BATCH_SIZE) % 2000 === 0 || batchStart + BATCH_SIZE >= details.length) {
                console.log(`  ... processed ${Math.min(batchStart + BATCH_SIZE, details.length)} / ${details.length}`);
            }
        }
        console.log(`  ✅ Created: ${created} (incl. ${debitTransfers} debit transfers) | Skipped: ${skipped} | Total: ${totalValue.toLocaleString()} EGP`);
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
