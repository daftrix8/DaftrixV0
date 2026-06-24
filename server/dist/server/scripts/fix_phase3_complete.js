"use strict";
/**
 * PHASE 3 FIX: Import missing transactions
 *
 * 1. Discounts.json → account_transactions (VENDOR_PAYMENT or CUSTOMER_PAYMENT type)
 * 2. SafePayment_Details linked to persons via Payment_Types → account_transactions
 * 3. Dofaa_Value from invoices → paidAmount field on invoices + account_transactions
 * 4. Recalculate ALL partner balances
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
const crypto_1 = require("crypto");
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
function safeNum(v, fb = 0) { const n = Number(v); return isNaN(n) ? fb : n; }
function formatDate(ds) {
    if (!ds)
        return null;
    const d = new Date(ds);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        console.log('\n══════════════════════════════════════════════');
        console.log('  🔧 PHASE 3 FIX: Missing Transactions');
        console.log('══════════════════════════════════════════════\n');
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const idMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        const conn = yield pool.getConnection();
        // Load person type lookup  
        const persons = loadJson('Persons.json');
        const personTypeMap = new Map(); // personID → type (4=vendor)
        persons.forEach((p) => personTypeMap.set(p.ID, p.type));
        try {
            // ═══════════════════════════════════════════════════════
            // STEP 1: Delete previously imported OLD- payments to avoid duplicates
            // ═══════════════════════════════════════════════════════
            console.log('🗑️  Step 1: Cleaning up previous Phase 3 data...');
            // Delete old account_transactions from migration
            const [delAT] = yield conn.query(`DELETE FROM account_transactions WHERE createdBy = 'Migration'`);
            console.log(`  Deleted ${delAT.affectedRows} old account_transactions`);
            // Delete old RECEIPT/PAYMENT invoices from migration
            const [delReceipt] = yield conn.query(`
      DELETE FROM invoices WHERE createdBy = 'Migration' AND type IN ('RECEIPT', 'PAYMENT')
    `);
            console.log(`  Deleted ${delReceipt.affectedRows} old receipt/payment invoices`);
            // ═══════════════════════════════════════════════════════
            // STEP 2: Import VendorPayment_Details (proper re-import)
            // ═══════════════════════════════════════════════════════
            console.log('\n💰 Step 2: Importing Vendor Payments...');
            const vpHeaders = loadJson('VendorPayment.json');
            const vpDetails = loadJson('VendorPayment_Details.json');
            // Build header date lookup: MasterID → date
            const vpDateMap = new Map();
            vpHeaders.forEach((h) => vpDateMap.set(h.ID, h.InvDate));
            let vpInserted = 0;
            yield conn.beginTransaction();
            for (const vp of vpDetails) {
                const vendorOldId = String(vp.VendorID);
                const partnerId = ((_a = idMap.partners) === null || _a === void 0 ? void 0 : _a[vendorOldId]) || null;
                if (!partnerId)
                    continue;
                const date = formatDate(vpDateMap.get(vp.MasterID)) || '2023-01-01 00:00:00';
                const value = safeNum(vp.Value);
                if (value <= 0)
                    continue;
                const txId = (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO account_transactions (id, date, type, debit, credit, description, partnerId, createdBy)
         VALUES (?, ?, 'VENDOR_PAYMENT', ?, 0, ?, ?, 'Migration')`, [txId, date, value, vp.Notes || 'Vendor payment from old ERP', partnerId]);
                vpInserted++;
            }
            yield conn.commit();
            console.log(`  ✅ ${vpInserted} vendor payments imported`);
            // ═══════════════════════════════════════════════════════
            // STEP 3: Import customer_Payment_Details
            // ═══════════════════════════════════════════════════════
            console.log('\n💰 Step 3: Importing Customer Payments...');
            const cpHeaders = loadJson('customer_Payment.json');
            const cpDetails = loadJson('customer_Payment_Details.json');
            const cpDateMap = new Map();
            cpHeaders.forEach((h) => cpDateMap.set(h.ID, h.invDate));
            let cpInserted = 0;
            yield conn.beginTransaction();
            for (const cp of cpDetails) {
                const custOldId = String(cp.CustID);
                const partnerId = ((_b = idMap.partners) === null || _b === void 0 ? void 0 : _b[custOldId]) || null;
                if (!partnerId)
                    continue;
                const date = formatDate(cpDateMap.get(cp.MasterID)) || '2023-01-01 00:00:00';
                const value = safeNum(cp.Value);
                if (value <= 0)
                    continue;
                const txId = (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO account_transactions (id, date, type, debit, credit, description, partnerId, createdBy)
         VALUES (?, ?, 'CUSTOMER_PAYMENT', 0, ?, ?, ?, 'Migration')`, [txId, date, value, cp.Notes || 'Customer payment from old ERP', partnerId]);
                cpInserted++;
            }
            yield conn.commit();
            console.log(`  ✅ ${cpInserted} customer payments imported`);
            // ═══════════════════════════════════════════════════════
            // STEP 4: Import Discounts.json  
            // ═══════════════════════════════════════════════════════
            console.log('\n🏷️  Step 4: Importing Discounts...');
            const discounts = loadJson('Discounts.json');
            let discInserted = 0;
            yield conn.beginTransaction();
            for (const disc of discounts) {
                const personOldId = String(disc.PersonID);
                const partnerId = ((_c = idMap.partners) === null || _c === void 0 ? void 0 : _c[personOldId]) || null;
                if (!partnerId)
                    continue;
                const date = formatDate(disc.InvDate) || '2023-01-01 00:00:00';
                const value = safeNum(disc.Value);
                if (value <= 0)
                    continue;
                const personType = personTypeMap.get(disc.PersonID) || 0;
                // InvType 1 = vendor discount (reduces what we owe), InvType 2 = customer discount (reduces what they owe)
                const isVendor = disc.InvType === 2 || personType === 4; // type 2 in discounts = vendor discount
                const txId = (0, crypto_1.randomUUID)();
                if (isVendor) {
                    yield conn.query(`INSERT INTO account_transactions (id, date, type, debit, credit, description, partnerId, createdBy)
           VALUES (?, ?, 'VENDOR_PAYMENT', ?, 0, ?, ?, 'Migration')`, [txId, date, value, `خصم: ${disc.Notes || 'Discount from old ERP'}`, partnerId]);
                }
                else {
                    yield conn.query(`INSERT INTO account_transactions (id, date, type, debit, credit, description, partnerId, createdBy)
           VALUES (?, ?, 'CUSTOMER_PAYMENT', 0, ?, ?, ?, 'Migration')`, [txId, date, value, `خصم: ${disc.Notes || 'Discount from old ERP'}`, partnerId]);
                }
                discInserted++;
            }
            yield conn.commit();
            console.log(`  ✅ ${discInserted} discounts imported`);
            // ═══════════════════════════════════════════════════════
            // STEP 5: Import SafePayment_Details linked to persons
            // ═══════════════════════════════════════════════════════
            console.log('\n🏦 Step 5: Importing Person-linked Safe Payments...');
            const paymentTypes = loadJson('Payment_Types.json');
            const safePaymentDetails = loadJson('SafePayment_Details.json');
            const safePaymentHeaders = loadJson('SafePayment.json');
            // Build SafePayment date lookup
            const safeDateMap = new Map();
            safePaymentHeaders.forEach((h) => safeDateMap.set(h.ID, h.InvDate));
            // Build PaymentID → PersonID map from Payment_Types where parentID is a person
            const paymentToPersonMap = new Map(); // PaymentID → PersonID
            const personIds = new Set(persons.map((p) => p.ID));
            for (const pt of paymentTypes) {
                if (pt.parentID && personIds.has(pt.parentID)) {
                    paymentToPersonMap.set(pt.ID, pt.parentID);
                }
            }
            console.log(`  Payment types linked to persons: ${paymentToPersonMap.size}`);
            let safeInserted = 0;
            yield conn.beginTransaction();
            for (const sp of safePaymentDetails) {
                const personOldId = paymentToPersonMap.get(sp.PaymentID);
                if (!personOldId)
                    continue;
                const partnerId = ((_d = idMap.partners) === null || _d === void 0 ? void 0 : _d[String(personOldId)]) || null;
                if (!partnerId)
                    continue;
                const date = formatDate(safeDateMap.get(sp.MasterID)) || '2023-01-01 00:00:00';
                const value = safeNum(sp.value);
                if (value === 0)
                    continue;
                const personType = personTypeMap.get(personOldId) || 0;
                const isVendor = personType === 4;
                const txId = (0, crypto_1.randomUUID)();
                if (isVendor) {
                    // Safe payment TO vendor = reduces our debt
                    yield conn.query(`INSERT INTO account_transactions (id, date, type, debit, credit, description, partnerId, createdBy)
           VALUES (?, ?, 'VENDOR_PAYMENT', ?, 0, ?, ?, 'Migration')`, [txId, date, Math.abs(value), `مصروفات خزينة: ${sp.Notes || 'Safe payment from old ERP'}`, partnerId]);
                }
                else {
                    // Safe receipt FROM customer = reduces their debt
                    yield conn.query(`INSERT INTO account_transactions (id, date, type, debit, credit, description, partnerId, createdBy)
           VALUES (?, ?, 'CUSTOMER_PAYMENT', 0, ?, ?, ?, 'Migration')`, [txId, date, Math.abs(value), `مصروفات خزينة: ${sp.Notes || 'Safe payment from old ERP'}`, partnerId]);
                }
                safeInserted++;
            }
            yield conn.commit();
            console.log(`  ✅ ${safeInserted} person-linked safe payments imported`);
            // ═══════════════════════════════════════════════════════
            // STEP 6: Import Dofaa_Value (payment-with-invoice) 
            // ═══════════════════════════════════════════════════════
            console.log('\n💵 Step 6: Importing Dofaa (payment-with-invoice)...');
            const sellInvoices = loadJson('sellInvoice.json');
            const buyInvoices = loadJson('BuyInvoice.json');
            let dofaaInserted = 0;
            yield conn.beginTransaction();
            // Sell invoice Dofaa = customer paid with invoice
            for (const inv of sellInvoices) {
                const dofaa = safeNum(inv.Dofaa_Value);
                if (dofaa <= 0)
                    continue;
                const custOldId = String(inv.CustomerID);
                const partnerId = ((_e = idMap.partners) === null || _e === void 0 ? void 0 : _e[custOldId]) || null;
                if (!partnerId)
                    continue;
                const date = formatDate(inv.invDate) || '2023-01-01 00:00:00';
                const txId = (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO account_transactions (id, date, type, debit, credit, description, partnerId, createdBy)
         VALUES (?, ?, 'CUSTOMER_PAYMENT', 0, ?, ?, ?, 'Migration')`, [txId, date, dofaa, `دفعة مع فاتورة بيع ${inv.invNum}`, partnerId]);
                dofaaInserted++;
            }
            // Buy invoice Dofaa = we paid vendor with invoice
            for (const inv of buyInvoices) {
                const dofaa = safeNum(inv.Dofaa_Value);
                if (dofaa <= 0)
                    continue;
                const vendorOldId = String(inv.VendorID);
                const partnerId = ((_f = idMap.partners) === null || _f === void 0 ? void 0 : _f[vendorOldId]) || null;
                if (!partnerId)
                    continue;
                const date = formatDate(inv.invDate) || '2023-01-01 00:00:00';
                const txId = (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO account_transactions (id, date, type, debit, credit, description, partnerId, createdBy)
         VALUES (?, ?, 'VENDOR_PAYMENT', ?, 0, ?, ?, 'Migration')`, [txId, date, dofaa, `دفعة مع فاتورة شراء ${inv.invNum}`, partnerId]);
                dofaaInserted++;
            }
            yield conn.commit();
            console.log(`  ✅ ${dofaaInserted} Dofaa payments imported`);
            // ═══════════════════════════════════════════════════════
            // STEP 7: Recalculate ALL partner balances
            // ═══════════════════════════════════════════════════════
            console.log('\n📊 Step 7: Recalculating ALL partner balances...');
            // Suppliers: balance = opening + purchases - returns - ALL payments (vendor + safe + discounts + dofaa)
            yield conn.query(`
      UPDATE partners p SET p.balance = (
        p.openingBalance
        + COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'INVOICE_PURCHASE'), 0)
        - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_PURCHASE'), 0)
        - COALESCE((SELECT SUM(at2.debit) FROM account_transactions at2 WHERE at2.partnerId = p.id AND at2.type = 'VENDOR_PAYMENT'), 0)
      )
      WHERE p.type IN ('SUPPLIER', 'BOTH') OR p.isSupplier = TRUE
    `);
            // Customers: balance = opening + sales - returns - ALL payments  
            yield conn.query(`
      UPDATE partners p SET p.balance = (
        p.openingBalance
        + COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'INVOICE_SALE'), 0)
        - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_SALE'), 0)
        - COALESCE((SELECT SUM(at2.credit) FROM account_transactions at2 WHERE at2.partnerId = p.id AND at2.type = 'CUSTOMER_PAYMENT'), 0)
      )
      WHERE p.type = 'CUSTOMER' OR (p.isCustomer = TRUE AND p.isSupplier = FALSE)
    `);
            // ═══════════════════════════════════════════════════════
            // VERIFICATION
            // ═══════════════════════════════════════════════════════
            console.log('\n✅ VERIFICATION\n');
            // Check ghadia
            const [ghadia] = yield conn.query(`
      SELECT p.name, p.balance, p.openingBalance,
        COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'INVOICE_PURCHASE'), 0) as purchases,
        COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_PURCHASE'), 0) as returns,
        COALESCE((SELECT SUM(at2.debit) FROM account_transactions at2 WHERE at2.partnerId = p.id AND at2.type = 'VENDOR_PAYMENT'), 0) as payments
      FROM partners p WHERE p.name LIKE '%غديه ارت%'
    `);
            if (ghadia.length > 0) {
                const g = ghadia[0];
                console.log(`  Partner: ${g.name}`);
                console.log(`  Opening: ${g.openingBalance}`);
                console.log(`  + Purchases: ${g.purchases}`);
                console.log(`  - Returns: ${g.returns}`);
                console.log(`  - Payments (vendor+safe+discount+dofaa): ${g.payments}`);
                console.log(`  = Balance: ${g.balance}`);
            }
            // Overall stats
            const [stats] = yield conn.query(`
      SELECT 
        (SELECT COUNT(*) FROM account_transactions WHERE createdBy = 'Migration') as totalTx,
        (SELECT COUNT(*) FROM account_transactions WHERE createdBy = 'Migration' AND type = 'VENDOR_PAYMENT') as vendorTx,
        (SELECT COUNT(*) FROM account_transactions WHERE createdBy = 'Migration' AND type = 'CUSTOMER_PAYMENT') as customerTx
    `);
            console.log(`\n  Total migrated transactions: ${stats[0].totalTx}`);
            console.log(`  Vendor payments: ${stats[0].vendorTx}`);
            console.log(`  Customer payments: ${stats[0].customerTx}`);
            // Balance distribution
            const [balDist] = yield conn.query(`
      SELECT 
        COUNT(CASE WHEN ABS(balance) < 1 THEN 1 END) as zeroBalance,
        COUNT(CASE WHEN balance > 1 THEN 1 END) as positiveBalance,
        COUNT(CASE WHEN balance < -1 THEN 1 END) as negativeBalance
      FROM partners
    `);
            console.log(`\n  Partners with ~zero balance: ${balDist[0].zeroBalance}`);
            console.log(`  Partners with positive balance: ${balDist[0].positiveBalance}`);
            console.log(`  Partners with negative balance: ${balDist[0].negativeBalance}`);
            console.log('\n  🎉 Phase 3 fix complete!\n');
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
