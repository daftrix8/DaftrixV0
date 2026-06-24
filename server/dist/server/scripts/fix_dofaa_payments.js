"use strict";
/**
 * FIX: Missing Dofaa (Payment-With-Invoice) Transactions
 * =========================================================
 *
 * In the old ERP, when creating a purchase or sales invoice, the user can
 * pay a partial or full amount at the time of the invoice. This "Dofaa"
 * (دفعة من حساب فاتورة) is stored in the `Dofaa_Value` field on the
 * invoice header (BuyInvoice.json / sellInvoice.json).
 *
 * Previous migration (`fix_phase3_complete.ts`) imported these into the
 * `account_transactions` table, but the partner statement and balance
 * calculations ONLY query the `invoices` table — making them invisible.
 *
 * This script:
 *   1. Cleans up orphan account_transactions for Dofaa payments
 *   2. Creates proper PAYMENT/RECEIPT invoice records in `invoices` table
 *   3. Creates journal entries for each payment
 *   4. Recalculates all affected partner balances
 *
 * Safe to re-run (idempotent — checks for existing entries by number prefix).
 *
 * Run: npx ts-node server/scripts/fix_dofaa_payments.ts
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
    if (!fs.existsSync(fp)) {
        console.log(`  ⚠️  File not found: ${filename}`);
        return [];
    }
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
}
function safeNum(val, fallback = 0) {
    const n = Number(val);
    return isNaN(n) ? fallback : n;
}
function formatDate(ds) {
    if (!ds)
        return '2023-01-01';
    const d = new Date(ds);
    if (isNaN(d.getTime()))
        return '2023-01-01';
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
// Build a lookup from old VendorID/CustID → partner title/mobile from Persons.json
// Used as fallback when idMap.partners points to a partner that doesn't exist in DB
const personsLookup = new Map();
try {
    const _p = loadJson('Persons.json');
    for (const p of _p) {
        personsLookup.set(String(p.ID), {
            title: p.title || p.Name || p.name || '',
            mobile: p.mobile || p.Phone1 || p.tel || '',
        });
    }
}
catch (e) { /* Persons.json may not exist */ }
function resolvePartner(conn, idMap, oldId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        // Primary: idMap lookup
        let partnerId = ((_a = idMap.partners) === null || _a === void 0 ? void 0 : _a[oldId]) || null;
        let partnerName = '';
        if (partnerId) {
            try {
                const [pRows] = yield conn.query('SELECT name FROM partners WHERE id = ?', [partnerId]);
                if (pRows.length > 0)
                    partnerName = pRows[0].name;
            }
            catch (e) { }
        }
        // Fallback: search by name/phone from Persons.json
        if (!partnerName) {
            const personInfo = personsLookup.get(oldId);
            if (personInfo && (personInfo.title || personInfo.mobile)) {
                try {
                    if (personInfo.title) {
                        const [nameRows] = yield conn.query('SELECT id, name FROM partners WHERE name = ? LIMIT 1', [personInfo.title]);
                        if (nameRows.length > 0) {
                            partnerId = nameRows[0].id;
                            partnerName = nameRows[0].name;
                        }
                    }
                    if (!partnerName && personInfo.mobile) {
                        const [phoneRows] = yield conn.query('SELECT id, name FROM partners WHERE phone = ? LIMIT 1', [personInfo.mobile]);
                        if (phoneRows.length > 0) {
                            partnerId = phoneRows[0].id;
                            partnerName = phoneRows[0].name;
                        }
                    }
                    // Cache the resolved mapping
                    if (partnerId && partnerName) {
                        if (!idMap.partners)
                            idMap.partners = {};
                        idMap.partners[oldId] = partnerId;
                    }
                }
                catch (e) { }
            }
        }
        return (partnerId && partnerName) ? { id: partnerId, name: partnerName } : null;
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('\n══════════════════════════════════════════════════════════');
        console.log('  💰 FIX: Missing Dofaa (Payment-With-Invoice) Payments');
        console.log('     Moves Dofaa_Value from invisible account_transactions');
        console.log('     into the invoices table for proper statement display');
        console.log('══════════════════════════════════════════════════════════\n');
        // ─── Load ID Mapping ─────────────────────────────────────
        if (!fs.existsSync(MAPPING_FILE)) {
            console.error('❌ id_mapping.json not found! Run primary migration first.');
            process.exit(1);
        }
        const idMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        // ─── Load Invoice Data ───────────────────────────────────
        const buyInvoices = loadJson('BuyInvoice.json');
        const sellInvoices = loadJson('sellInvoice.json');
        const buyDofaa = buyInvoices.filter((inv) => safeNum(inv.Dofaa_Value) > 0);
        const sellDofaa = sellInvoices.filter((inv) => safeNum(inv.Dofaa_Value) > 0);
        console.log(`  📊 BuyInvoice.json:  ${buyInvoices.length} total, ${buyDofaa.length} with Dofaa_Value > 0`);
        console.log(`  📊 sellInvoice.json: ${sellInvoices.length} total, ${sellDofaa.length} with Dofaa_Value > 0`);
        console.log(`  📊 Total Dofaa payments to process: ${buyDofaa.length + sellDofaa.length}\n`);
        if (buyDofaa.length === 0 && sellDofaa.length === 0) {
            console.log('  ✅ No Dofaa payments found. Nothing to do.');
            return;
        }
        // ─── Connect to DB ───────────────────────────────────────
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true,
            connectionLimit: 5,
            waitForConnections: true,
        });
        const conn = yield pool.getConnection();
        try {
            // ─── Get Account IDs ─────────────────────────────────────
            const [accounts] = yield conn.query('SELECT id, code, name FROM accounts');
            const acctByCode = new Map();
            for (const a of accounts)
                acctByCode.set(a.code, a);
            const cashAccount = acctByCode.get('101');
            const apAccount = acctByCode.get('201'); // Accounts Payable (الموردين)
            const arAccount = acctByCode.get('104'); // Accounts Receivable (العملاء)
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
            console.log(`  💵 Cash Account:  ${cashAccount.code} - ${cashAccount.name}`);
            console.log(`  📋 AP Account:    ${apAccount.code} - ${apAccount.name}`);
            console.log(`  📋 AR Account:    ${arAccount.code} - ${arAccount.name}\n`);
            // ═══════════════════════════════════════════════════════════
            // STEP 1: Clean up orphan account_transactions from Dofaa
            // ═══════════════════════════════════════════════════════════
            console.log('━━━ Step 1: Cleaning orphan account_transactions (Dofaa) ━━━');
            // Delete Dofaa-related account_transactions created by fix_phase3_complete.ts
            // These have descriptions like "دفعة مع فاتورة بيع" or "دفعة مع فاتورة شراء"
            const [delDofaaTx] = yield conn.query(`
      DELETE FROM account_transactions 
      WHERE createdBy = 'Migration' 
      AND (description LIKE 'دفعة مع فاتورة بيع%' OR description LIKE 'دفعة مع فاتورة شراء%')
    `);
            console.log(`  🗑️  Deleted ${delDofaaTx.affectedRows} orphan Dofaa account_transactions\n`);
            // ═══════════════════════════════════════════════════════════
            // STEP 2: Import Buy Invoice Dofaa → PAYMENT invoices
            // ═══════════════════════════════════════════════════════════
            console.log('━━━ Step 2: Buy Invoice Dofaa → PAYMENT invoices (سند صرف مع فاتورة شراء) ━━━');
            let buyCreated = 0, buySkipped = 0, buyAlreadyExists = 0, buyNoPartner = 0;
            let buyTotalAmount = 0;
            const affectedPartnerIds = new Set();
            for (let batchStart = 0; batchStart < buyDofaa.length; batchStart += BATCH_SIZE) {
                const batch = buyDofaa.slice(batchStart, batchStart + BATCH_SIZE);
                yield conn.beginTransaction();
                for (const inv of batch) {
                    const dofaa = safeNum(inv.Dofaa_Value);
                    if (dofaa <= 0) {
                        buySkipped++;
                        continue;
                    }
                    const vendorOldId = String(inv.VendorID);
                    const partner = yield resolvePartner(conn, idMap, vendorOldId);
                    if (!partner) {
                        buyNoPartner++;
                        continue;
                    }
                    const partnerId = partner.id;
                    const invNum = inv.invNum || inv.InvNo || inv.ID;
                    const number = `OLD-DOFAA-P-${invNum}`;
                    const date = formatDate(inv.invDate || inv.InvDate);
                    // Check if already exists (idempotent)
                    const [existing] = yield conn.query(`SELECT id FROM invoices WHERE number = ?`, [number]);
                    if (existing.length > 0) {
                        buyAlreadyExists++;
                        continue;
                    }
                    const partnerName = partner.name;
                    const newId = (0, crypto_1.randomUUID)();
                    // Create PAYMENT invoice (vendor payment: reduces what we owe)
                    yield conn.query(`INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status,
           paymentMethod, posted, notes, paidAmount, createdBy, voucherCategory)
           VALUES (?, ?, ?, 'PAYMENT', ?, ?, ?, 'POSTED', 'CASH', TRUE, ?, ?, 'Migration-Dofaa', 'supplier')`, [
                        newId, number, date, partnerId, partnerName, dofaa,
                        `دفعة من حساب فاتورة شراء رقم ${invNum}`, dofaa
                    ]);
                    // Create journal entry: Dr Payables (201), Cr Cash (101)
                    const journalId = (0, crypto_1.randomUUID)();
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy)
           VALUES (?, ?, ?, ?, 'Migration-Dofaa')`, [journalId, date, `[دفعة مع فاتورة شراء] ${partnerName} - فاتورة ${invNum}`, `INV-${newId}`]);
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES
           (?, ?, ?, ?, 0),
           (?, ?, ?, 0, ?)`, [
                        journalId, apAccount.id, apAccount.name, dofaa,
                        journalId, cashAccount.id, cashAccount.name, dofaa,
                    ]);
                    buyCreated++;
                    buyTotalAmount += dofaa;
                    affectedPartnerIds.add(partnerId);
                }
                yield conn.commit();
                if ((batchStart + BATCH_SIZE) % 2000 === 0 || batchStart + BATCH_SIZE >= buyDofaa.length) {
                    console.log(`  ... processed ${Math.min(batchStart + BATCH_SIZE, buyDofaa.length)} / ${buyDofaa.length}`);
                }
            }
            console.log(`  ✅ Created:         ${buyCreated} PAYMENT invoices`);
            console.log(`  ⏭️  Already exists:  ${buyAlreadyExists}`);
            console.log(`  ⏭️  No partner:      ${buyNoPartner}`);
            console.log(`  ⏭️  Skipped (zero):  ${buySkipped}`);
            if (buyCreated > 0) {
                console.log(`  💰 Total amount:    ${buyTotalAmount.toLocaleString()} EGP`);
            }
            // ═══════════════════════════════════════════════════════════
            // STEP 3: Import Sell Invoice Dofaa → RECEIPT invoices
            // ═══════════════════════════════════════════════════════════
            console.log('\n━━━ Step 3: Sell Invoice Dofaa → RECEIPT invoices (سند قبض مع فاتورة بيع) ━━━');
            let sellCreated = 0, sellSkipped = 0, sellAlreadyExists = 0, sellNoPartner = 0;
            let sellTotalAmount = 0;
            for (let batchStart = 0; batchStart < sellDofaa.length; batchStart += BATCH_SIZE) {
                const batch = sellDofaa.slice(batchStart, batchStart + BATCH_SIZE);
                yield conn.beginTransaction();
                for (const inv of batch) {
                    const dofaa = safeNum(inv.Dofaa_Value);
                    if (dofaa <= 0) {
                        sellSkipped++;
                        continue;
                    }
                    const custOldId = String(inv.CustomerID);
                    const partner = yield resolvePartner(conn, idMap, custOldId);
                    if (!partner) {
                        sellNoPartner++;
                        continue;
                    }
                    const partnerId = partner.id;
                    const invNum = inv.invNum || inv.InvNo || inv.ID;
                    const number = `OLD-DOFAA-S-${invNum}`;
                    const date = formatDate(inv.invDate || inv.InvDate);
                    // Check if already exists (idempotent)
                    const [existing] = yield conn.query(`SELECT id FROM invoices WHERE number = ?`, [number]);
                    if (existing.length > 0) {
                        sellAlreadyExists++;
                        continue;
                    }
                    const partnerName = partner.name;
                    const newId = (0, crypto_1.randomUUID)();
                    // Create RECEIPT invoice (customer payment: reduces what they owe)
                    yield conn.query(`INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status,
           paymentMethod, posted, notes, paidAmount, createdBy, voucherCategory)
           VALUES (?, ?, ?, 'RECEIPT', ?, ?, ?, 'POSTED', 'CASH', TRUE, ?, ?, 'Migration-Dofaa', 'customer')`, [
                        newId, number, date, partnerId, partnerName, dofaa,
                        `دفعة من حساب فاتورة بيع رقم ${invNum}`, dofaa
                    ]);
                    // Create journal entry: Dr Cash (101), Cr Receivables (104)
                    const journalId = (0, crypto_1.randomUUID)();
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy)
           VALUES (?, ?, ?, ?, 'Migration-Dofaa')`, [journalId, date, `[دفعة مع فاتورة بيع] ${partnerName} - فاتورة ${invNum}`, `INV-${newId}`]);
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES
           (?, ?, ?, ?, 0),
           (?, ?, ?, 0, ?)`, [
                        journalId, cashAccount.id, cashAccount.name, dofaa,
                        journalId, arAccount.id, arAccount.name, dofaa,
                    ]);
                    sellCreated++;
                    sellTotalAmount += dofaa;
                    affectedPartnerIds.add(partnerId);
                }
                yield conn.commit();
                if ((batchStart + BATCH_SIZE) % 2000 === 0 || batchStart + BATCH_SIZE >= sellDofaa.length) {
                    console.log(`  ... processed ${Math.min(batchStart + BATCH_SIZE, sellDofaa.length)} / ${sellDofaa.length}`);
                }
            }
            console.log(`  ✅ Created:         ${sellCreated} RECEIPT invoices`);
            console.log(`  ⏭️  Already exists:  ${sellAlreadyExists}`);
            console.log(`  ⏭️  No partner:      ${sellNoPartner}`);
            console.log(`  ⏭️  Skipped (zero):  ${sellSkipped}`);
            if (sellCreated > 0) {
                console.log(`  💰 Total amount:    ${sellTotalAmount.toLocaleString()} EGP`);
            }
            // ═══════════════════════════════════════════════════════════
            // STEP 4: Check for duplicate payments from migrate_vendor_payments.ts
            // ═══════════════════════════════════════════════════════════
            console.log('\n━━━ Step 4: Deduplication check ━━━');
            // Check if migrate_vendor_payments.ts was run (creates OLD-VP- and OLD-CP- prefixed entries)
            const [vpCount] = yield conn.query(`SELECT COUNT(*) as cnt FROM invoices WHERE number LIKE 'OLD-VP-%'`);
            const [cpCount] = yield conn.query(`SELECT COUNT(*) as cnt FROM invoices WHERE number LIKE 'OLD-CP-%'`);
            console.log(`  📊 OLD-VP-* (vendor payments):   ${vpCount[0].cnt}`);
            console.log(`  📊 OLD-CP-* (customer payments):  ${cpCount[0].cnt}`);
            if (vpCount[0].cnt > 0 || cpCount[0].cnt > 0) {
                console.log(`  ℹ️  migrate_vendor_payments.ts was previously run`);
                console.log(`  ℹ️  Dofaa payments use different number prefix (OLD-DOFAA-*), so no duplication risk`);
            }
            else {
                console.log(`  ℹ️  migrate_vendor_payments.ts was NOT run — only migrate_mall_data.ts payments exist`);
                console.log(`  ⚠️  migrate_mall_data.ts stored payments in account_transactions (NOT invoices)`);
                console.log(`  ⚠️  These payments are invisible in partner statements!`);
                console.log(`  💡 Consider running: npx ts-node server/scripts/migrate_vendor_payments.ts`);
            }
            // ═══════════════════════════════════════════════════════════
            // STEP 5: Recalculate affected partner balances
            // ═══════════════════════════════════════════════════════════
            const totalCreated = buyCreated + sellCreated;
            if (totalCreated > 0) {
                console.log(`\n━━━ Step 5: Recalculating ${affectedPartnerIds.size} affected partner balances ━━━`);
                const partnerIdList = Array.from(affectedPartnerIds);
                for (let i = 0; i < partnerIdList.length; i += 100) {
                    const chunk = partnerIdList.slice(i, i + 100);
                    for (const partnerId of chunk) {
                        // Use the EXACT SAME formula as partnerController.ts
                        const [balCalc] = yield conn.query(`
            SELECT 
              (
                COALESCE(p.openingBalance, 0) +
                CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 
                  THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
                CASE WHEN p.isSupplier = 1 
                  THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
              ) as calculatedBalance
            FROM partners p
            LEFT JOIN (
              SELECT partnerId,
                SUM(CASE WHEN type = 'INVOICE_SALE' AND COALESCE(paymentMethod,'') != 'CASH' THEN total - COALESCE(whtAmount, 0)
                         WHEN type = 'RETURN_SALE' AND COALESCE(paymentMethod,'') != 'CASH' THEN -total
                         WHEN type IN ('RECEIPT', 'DISCOUNT_ALLOWED', 'CHEQUE_DEPOSIT', 'CHEQUE_COLLECT') THEN -total ELSE 0 END) as cImpact,
                SUM(CASE WHEN type = 'INVOICE_PURCHASE' AND COALESCE(paymentMethod,'') != 'CASH' THEN -total
                         WHEN type = 'RETURN_PURCHASE' AND COALESCE(paymentMethod,'') != 'CASH' THEN total
                         WHEN type IN ('PAYMENT', 'DISCOUNT_EARNED', 'CHEQUE_CASHED') THEN total ELSE 0 END) as sImpact,
                SUM(CASE WHEN type = 'CHEQUE_BOUNCE' THEN total ELSE 0 END) as bounceImpact
              FROM invoices
              WHERE status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND partnerId = ?
              GROUP BY partnerId
            ) inv_agg ON inv_agg.partnerId = p.id
            WHERE p.id = ?
          `, [partnerId, partnerId]);
                        const newBal = Math.round(Number(((_a = balCalc[0]) === null || _a === void 0 ? void 0 : _a.calculatedBalance) || 0) * 100) / 100;
                        yield conn.query('UPDATE partners SET balance = ? WHERE id = ?', [newBal, partnerId]);
                    }
                    if (i + 100 < partnerIdList.length) {
                        console.log(`  ... recalculated ${Math.min(i + 100, partnerIdList.length)} / ${partnerIdList.length}`);
                    }
                }
                console.log(`  ✅ Recalculated ${affectedPartnerIds.size} partner balances`);
            }
            else {
                console.log('\n  ℹ️  No new entries created, skipping balance recalculation');
            }
            // ═══════════════════════════════════════════════════════════
            // VERIFICATION: Check sample supplier
            // ═══════════════════════════════════════════════════════════
            console.log('\n━━━ Verification ━━━');
            // Check مصنع الحريه specifically
            const [hariah] = yield conn.query(`
      SELECT p.name, p.balance, p.openingBalance, p.isSupplier, p.isCustomer,
        COALESCE((SELECT SUM(total) FROM invoices WHERE partnerId = p.id AND type = 'INVOICE_PURCHASE' AND status IN ('POSTED','COMPLETED','PARTIAL')), 0) as purchases,
        COALESCE((SELECT SUM(total) FROM invoices WHERE partnerId = p.id AND type = 'RETURN_PURCHASE' AND status IN ('POSTED','COMPLETED','PARTIAL')), 0) as returns,
        COALESCE((SELECT SUM(total) FROM invoices WHERE partnerId = p.id AND type = 'PAYMENT' AND status IN ('POSTED','COMPLETED','PARTIAL')), 0) as payments,
        COALESCE((SELECT COUNT(*) FROM invoices WHERE partnerId = p.id AND number LIKE 'OLD-DOFAA-%'), 0) as dofaaCount,
        COALESCE((SELECT SUM(total) FROM invoices WHERE partnerId = p.id AND number LIKE 'OLD-DOFAA-%'), 0) as dofaaTotal
      FROM partners p WHERE p.name LIKE '%مصنع الحريه%'
    `);
            if (hariah.length > 0) {
                const h = hariah[0];
                console.log(`\n  🔍 Sample: ${h.name}`);
                console.log(`     Opening Balance: ${h.openingBalance}`);
                console.log(`     Purchases (credit): ${Number(h.purchases).toLocaleString()}`);
                console.log(`     Returns: ${Number(h.returns).toLocaleString()}`);
                console.log(`     Payments (debit): ${Number(h.payments).toLocaleString()}`);
                console.log(`     Dofaa entries: ${h.dofaaCount} (total: ${Number(h.dofaaTotal).toLocaleString()})`);
                console.log(`     Current Balance: ${h.balance}`);
            }
            // Overall stats
            const [dofaaStats] = yield conn.query(`
      SELECT 
        COUNT(CASE WHEN number LIKE 'OLD-DOFAA-P-%' THEN 1 END) as vendorDofaa,
        COALESCE(SUM(CASE WHEN number LIKE 'OLD-DOFAA-P-%' THEN total END), 0) as vendorTotal,
        COUNT(CASE WHEN number LIKE 'OLD-DOFAA-S-%' THEN 1 END) as customerDofaa,
        COALESCE(SUM(CASE WHEN number LIKE 'OLD-DOFAA-S-%' THEN total END), 0) as customerTotal
      FROM invoices WHERE number LIKE 'OLD-DOFAA-%'
    `);
            console.log(`\n  📊 Summary:`);
            console.log(`     Vendor Dofaa (PAYMENT):   ${dofaaStats[0].vendorDofaa} entries, ${Number(dofaaStats[0].vendorTotal).toLocaleString()} EGP`);
            console.log(`     Customer Dofaa (RECEIPT):  ${dofaaStats[0].customerDofaa} entries, ${Number(dofaaStats[0].customerTotal).toLocaleString()} EGP`);
            // Balance distribution after fix
            const [balDist] = yield conn.query(`
      SELECT 
        COUNT(CASE WHEN ABS(balance) < 1 THEN 1 END) as zeroBalance,
        COUNT(CASE WHEN balance > 1 THEN 1 END) as positiveBalance,
        COUNT(CASE WHEN balance < -1 THEN 1 END) as negativeBalance
      FROM partners
    `);
            console.log(`\n  💰 Balance Distribution (all partners):`);
            console.log(`     ~Zero: ${balDist[0].zeroBalance}`);
            console.log(`     Positive (owes us): ${balDist[0].positiveBalance}`);
            console.log(`     Negative (we owe): ${balDist[0].negativeBalance}`);
            console.log('\n  ✅ Done!\n');
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
