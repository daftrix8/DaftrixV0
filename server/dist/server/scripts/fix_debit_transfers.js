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
 * FIX DEBIT TRANSFERS & BOUNCED CHEQUES (Customers + Vendors)
 * =============================================================
 *
 * Scans old ERP payment data for negative-value entries that were not
 * captured during the primary migration. Handles BOTH customer AND vendor payments.
 *
 * Negative entries include:
 *   - شيك مرتد (Bounced cheques) — reverses a payment
 *   - تحويل بين عملاء/موردين (Transfers between accounts) — debit adjustment
 *   - سلفه (Advances/loans) — additional debt
 *   - فرق فاتورة (Invoice differences) — balance corrections
 *
 * For CUSTOMERS: negative value = they owe us MORE → INVOICE_SALE / CREDIT
 * For VENDORS:   negative value = we owe them MORE → INVOICE_PURCHASE / CREDIT
 *
 * Run: npx ts-node server/scripts/fix_debit_transfers.ts
 */
const promise_1 = __importDefault(require("mysql2/promise"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = require("crypto");
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const DATA_DIR = process.env.MIGRATION_DATA_DIR || path.resolve(__dirname, '../../mall stuff/data');
function loadJson(filename) {
    const fp = path.join(DATA_DIR, filename);
    if (!fs.existsSync(fp))
        return [];
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        console.log('\n══════════════════════════════════════════════════════════');
        console.log('  🔄 FIX: Debit Transfers & Bounced Cheques');
        console.log('     (Customers + Vendors)');
        console.log('══════════════════════════════════════════════════════════\n');
        // Load persons (for name lookup)
        const persons = loadJson('Persons.json');
        const personNameById = new Map();
        for (const p of persons) {
            personNameById.set(String(p.ID), String(p.title || p.etitle || '').trim());
        }
        // Connect to DB
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true
        });
        // Build partner name → id map from our DB
        const [partnerRows] = yield conn.query('SELECT id, name, isSupplier, isCustomer FROM partners');
        const partnerByName = new Map();
        for (const p of partnerRows) {
            partnerByName.set(p.name.trim(), { id: p.id, name: p.name, isSupplier: !!p.isSupplier, isCustomer: !!p.isCustomer });
        }
        // Process both customer and vendor payments
        const configs = [
            {
                label: '💵 Customer Payments (سندات قبض العملاء)',
                headerFile: 'customer_Payment.json',
                detailFile: 'Customer_Payment_Details.json',
                partnerIdField: 'CustID',
                debitInvoiceType: 'INVOICE_SALE', // Increases what customer owes us
                prefix: 'OLD-TRANSFER-C',
                isSupplier: false,
            },
            {
                label: '💳 Vendor Payments (سندات صرف الموردين)',
                headerFile: 'VendorPayment.json',
                detailFile: 'VendorPayment_Details.json',
                partnerIdField: 'VendorID',
                debitInvoiceType: 'INVOICE_PURCHASE', // Increases what we owe vendor
                prefix: 'OLD-TRANSFER-V',
                isSupplier: true,
            },
        ];
        let grandTotalNew = 0;
        for (const config of configs) {
            console.log(`\n━━━ ${config.label} ━━━`);
            const headers = loadJson(config.headerFile);
            const details = loadJson(config.detailFile);
            if (headers.length === 0 || details.length === 0) {
                console.log('  ⏭️  No data found, skipping');
                continue;
            }
            const headerMap = new Map();
            for (const h of headers)
                headerMap.set(h.ID, h);
            const negativeEntries = details.filter((d) => Number(d.Value) < 0);
            console.log(`  📦 Total details: ${details.length}, Negative entries: ${negativeEntries.length}`);
            if (negativeEntries.length === 0) {
                console.log('  ✅ No debit transfers found');
                continue;
            }
            let totalNew = 0, totalSkipped = 0, totalNoMatch = 0, totalAlreadyExists = 0;
            let totalAmount = 0;
            const unmatchedNames = new Set();
            for (const detail of negativeEntries) {
                const header = headerMap.get(detail.MasterID);
                if (!header)
                    continue;
                // Resolve partner name from old ERP data
                const oldPartnerId = String(detail[config.partnerIdField] || detail.VendorID || detail.CustID || '');
                const oldName = personNameById.get(oldPartnerId);
                if (!oldName) {
                    totalSkipped++;
                    continue;
                }
                // Match partner by name in our DB
                const partner = partnerByName.get(oldName);
                if (!partner) {
                    totalNoMatch++;
                    unmatchedNames.add(oldName);
                    continue;
                }
                const amount = Math.abs(Number(detail.Value));
                const date = ((_a = header.invDate) === null || _a === void 0 ? void 0 : _a.split('T')[0]) || ((_b = header.InvDate) === null || _b === void 0 ? void 0 : _b.split('T')[0]) || '2025-01-01';
                const notes = String(detail.Notes || '');
                const number = `${config.prefix}-${detail.MasterID}-${detail.RowID || detail.ID}`;
                // Check if already exists (idempotent) - check multiple possible formats
                const [existing] = yield conn.query(`SELECT id FROM invoices WHERE (number = ? OR number = ? OR number = ?) AND partnerId = ?`, [
                    number,
                    `OLD-TRANSFER-${detail.MasterID}-${detail.RowID}`, // Old customer format
                    `OLD-TRANSFER-${detail.MasterID}`, // Very old format
                    partner.id
                ]);
                if (existing.length > 0) {
                    totalAlreadyExists++;
                    continue;
                }
                // Also check by OLD-CP-DEBIT / OLD-VP-DEBIT prefix (from updated migrate_vendor_payments.ts)
                const debitPrefix = config.isSupplier ? 'OLD-VP-DEBIT-' : 'OLD-CP-DEBIT-';
                const [existingPay] = yield conn.query(`SELECT id FROM invoices WHERE number LIKE ? AND partnerId = ?`, [`${debitPrefix}%-${detail.RowID || detail.ID}`, partner.id]);
                if (existingPay.length > 0) {
                    totalAlreadyExists++;
                    continue;
                }
                // Insert debit entry
                const id = (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, createdBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'POSTED', 'CREDIT', TRUE, ?, 'Migration-Fix')`, [id, number, date, config.debitInvoiceType, partner.id, partner.name, amount, `[تصحيح ترحيل] ${notes}`]);
                totalNew++;
                totalAmount += amount;
            }
            console.log(`  ✅ New entries added:    ${totalNew}`);
            console.log(`  ⏭️  Already exists:      ${totalAlreadyExists}`);
            console.log(`  ⏭️  Skipped (no name):   ${totalSkipped}`);
            console.log(`  ⚠️  No partner match:    ${totalNoMatch}`);
            if (totalNew > 0) {
                console.log(`  💰 Total amount:         ${totalAmount.toLocaleString()} EGP`);
            }
            if (unmatchedNames.size > 0 && unmatchedNames.size <= 20) {
                console.log(`  ⚠️  Unmatched names:`);
                for (const n of unmatchedNames)
                    console.log(`     - ${n}`);
            }
            grandTotalNew += totalNew;
        }
        // Recalculate balances for ALL affected partners
        if (grandTotalNew > 0) {
            console.log('\n━━━ Recalculating Partner Balances ━━━');
            const [affected] = yield conn.query(`
      SELECT DISTINCT i.partnerId, p.name 
      FROM invoices i JOIN partners p ON p.id = i.partnerId
      WHERE (i.number LIKE 'OLD-TRANSFER-C%' OR i.number LIKE 'OLD-TRANSFER-V%' OR i.number LIKE 'OLD-TRANSFER-%')
        AND i.createdBy = 'Migration-Fix'
    `);
            for (const a of affected) {
                const [balCalc] = yield conn.query(`
        SELECT (
          COALESCE(p.openingBalance, 0) +
          CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 
            THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
          CASE WHEN p.isSupplier = 1 
            THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
        ) as calculatedBalance
        FROM partners p
        LEFT JOIN (
          SELECT partnerId,
            SUM(CASE WHEN type='INVOICE_SALE' AND COALESCE(paymentMethod,'')!='CASH' THEN total-COALESCE(whtAmount,0) WHEN type='RETURN_SALE' AND COALESCE(paymentMethod,'')!='CASH' THEN -total WHEN type IN ('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') THEN -total ELSE 0 END) as cImpact,
            SUM(CASE WHEN type='INVOICE_PURCHASE' AND COALESCE(paymentMethod,'')!='CASH' THEN -total WHEN type='RETURN_PURCHASE' AND COALESCE(paymentMethod,'')!='CASH' THEN total WHEN type IN ('PAYMENT','DISCOUNT_EARNED','CHEQUE_CASHED') THEN total ELSE 0 END) as sImpact,
            SUM(CASE WHEN type='CHEQUE_BOUNCE' THEN total ELSE 0 END) as bounceImpact
          FROM invoices WHERE status IN ('POSTED','COMPLETED','PARTIAL') AND partnerId=? GROUP BY partnerId
        ) inv_agg ON inv_agg.partnerId=p.id WHERE p.id=?
      `, [a.partnerId, a.partnerId]);
                const newBal = Math.round(Number(((_c = balCalc[0]) === null || _c === void 0 ? void 0 : _c.calculatedBalance) || 0) * 100) / 100;
                yield conn.query('UPDATE partners SET balance=? WHERE id=?', [newBal, a.partnerId]);
            }
            console.log(`  ✅ Recalculated ${affected.length} partner balances`);
        }
        // ═══════════════════════════════════════════════════════════
        // SafePayment (مصروفات/وارد) negative entries
        // ═══════════════════════════════════════════════════════════
        console.log(`\n━━━ 💵 SafePayment (حركات الخزينة) ━━━`);
        const spHeaders = loadJson('SafePayment.json');
        const spDetails = loadJson('SafePayment_Details.json');
        const paymentTypes = loadJson('Payment_Types.json');
        if (spDetails.length > 0) {
            const spHeaderMap = new Map();
            for (const h of spHeaders)
                spHeaderMap.set(h.ID, h);
            const ptMap = new Map();
            for (const pt of paymentTypes)
                ptMap.set(pt.ID, pt);
            // Get accounts
            const [accountRows] = yield conn.query('SELECT id, code, name FROM accounts');
            const acctByCode = new Map();
            for (const a of accountRows)
                acctByCode.set(a.code, a);
            const cashAccount = acctByCode.get('101');
            const generalExpenseAccount = acctByCode.get('599') || acctByCode.get('508');
            const spNegatives = spDetails.filter((d) => Number(d.value) < 0);
            console.log(`  📦 Total details: ${spDetails.length}, Negative entries: ${spNegatives.length}`);
            if (spNegatives.length > 0 && cashAccount) {
                let spNew = 0, spExists = 0;
                let spTotal = 0;
                for (const detail of spNegatives) {
                    const master = spHeaderMap.get(detail.MasterID);
                    if (!master)
                        continue;
                    const value = Math.abs(Number(detail.value));
                    const refId = `OLD-SP-REV-${detail.RowID}`;
                    // Check if already exists
                    const [existing] = yield conn.query(`SELECT id FROM journal_entries WHERE referenceId = ?`, [refId]);
                    if (existing.length > 0) {
                        spExists++;
                        continue;
                    }
                    // Also check if the original migration already handled it (after script update)
                    const [origRef] = yield conn.query(`SELECT id FROM journal_entries WHERE referenceId = ?`, [`OLD-SP-${detail.RowID}`]);
                    if (origRef.length > 0) {
                        spExists++;
                        continue;
                    }
                    const date = ((_d = master.InvDate) === null || _d === void 0 ? void 0 : _d.split('T')[0]) || '2025-01-01';
                    const notes = detail.Notes || '';
                    const pt = ptMap.get(detail.PaymentID);
                    const categoryName = (pt === null || pt === void 0 ? void 0 : pt.title) || `بند #${detail.PaymentID}`;
                    // Reversed expense = money came IN (مردودات سلف) → Dr Cash, Cr Expense
                    const journalId = (0, crypto_1.randomUUID)();
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy)
           VALUES (?, ?, ?, ?, 'Migration-Fix')`, [journalId, date, `[تصحيح ترحيل] مردودات - ${categoryName}${notes ? ' - ' + notes : ''}`, refId]);
                    const targetAccount = generalExpenseAccount;
                    // Reversed expense: Dr Cash (money in), Cr Expense (reduce cost)
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES
           (?, ?, ?, ?, 0),
           (?, ?, ?, 0, ?)`, [
                        journalId, cashAccount.id, cashAccount.name, value,
                        journalId, targetAccount.id, targetAccount.name, value,
                    ]);
                    spNew++;
                    spTotal += value;
                }
                console.log(`  ✅ New journal entries:   ${spNew}`);
                console.log(`  ⏭️  Already exists:       ${spExists}`);
                if (spNew > 0) {
                    console.log(`  💰 Total amount:          ${spTotal.toLocaleString()} EGP`);
                }
            }
            else {
                console.log('  ✅ No negative entries found');
            }
        }
        else {
            console.log('  ⏭️  No SafePayment data found');
        }
        console.log('\n  ✅ Done');
        yield conn.end();
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
