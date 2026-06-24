"use strict";
/**
 * FIX: Move migrated account_transactions into invoices table
 *
 * The PartnerStatement component only reads from `invoices` table.
 * Migrated payments/discounts were stored in `account_transactions`
 * but need to be in `invoices` to appear in the statement of account.
 *
 * This script converts:
 *   VENDOR_PAYMENT → PAYMENT invoice
 *   CUSTOMER_PAYMENT → RECEIPT invoice
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
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = require("crypto");
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n══════════════════════════════════════════════');
        console.log('  🔄 MOVE: account_transactions → invoices');
        console.log('══════════════════════════════════════════════\n');
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const conn = yield pool.getConnection();
        try {
            // Get all migrated account_transactions
            const [txns] = yield conn.query(`
      SELECT * FROM account_transactions WHERE createdBy = 'Migration'
    `);
            console.log(`  Found ${txns.length} migrated account_transactions to convert`);
            if (txns.length === 0) {
                console.log('  Nothing to do!');
                return;
            }
            // Count existing OLD-PAY invoices to avoid conflicts
            const [existing] = yield conn.query(`
      SELECT COUNT(*) as c FROM invoices WHERE number LIKE 'OLD-PAY-%' AND createdBy = 'Migration'
    `);
            if (existing[0].c > 0) {
                console.log(`  ⚠️  ${existing[0].c} payment invoices already exist. Deleting first...`);
                yield conn.query(`DELETE FROM invoices WHERE number LIKE 'OLD-PAY-%' AND createdBy = 'Migration'`);
            }
            let vendorCount = 0;
            let customerCount = 0;
            let batchValues = [];
            const BATCH_SIZE = 500;
            for (let i = 0; i < txns.length; i++) {
                const tx = txns[i];
                // Determine invoice type
                let invoiceType;
                let total;
                let number;
                if (tx.type === 'VENDOR_PAYMENT') {
                    invoiceType = 'PAYMENT';
                    total = tx.debit || 0;
                    vendorCount++;
                    number = `OLD-PAY-V-${vendorCount}`;
                }
                else if (tx.type === 'CUSTOMER_PAYMENT') {
                    invoiceType = 'RECEIPT';
                    total = tx.credit || 0;
                    customerCount++;
                    number = `OLD-PAY-C-${customerCount}`;
                }
                else {
                    // Skip other types (shouldn't exist but just in case)
                    continue;
                }
                const invoiceId = (0, crypto_1.randomUUID)();
                batchValues.push([
                    invoiceId,
                    number,
                    tx.date,
                    invoiceType,
                    tx.partnerId,
                    tx.partnerName || '',
                    total,
                    'POSTED', // status
                    'CASH', // paymentMethod
                    tx.description || '',
                    'Migration', // createdBy
                    true, // posted
                ]);
                // Flush batch
                if (batchValues.length >= BATCH_SIZE) {
                    yield conn.query(`
          INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, notes, createdBy, posted)
          VALUES ${batchValues.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')}
        `, batchValues.flat());
                    batchValues = [];
                }
            }
            // Flush remaining
            if (batchValues.length > 0) {
                yield conn.query(`
        INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, notes, createdBy, posted)
        VALUES ${batchValues.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')}
      `, batchValues.flat());
            }
            console.log(`\n  ✅ Created ${vendorCount} PAYMENT invoices (vendor payments)`);
            console.log(`  ✅ Created ${customerCount} RECEIPT invoices (customer payments)`);
            // Verify
            const [verify] = yield conn.query(`
      SELECT type, COUNT(*) as c FROM invoices WHERE number LIKE 'OLD-PAY-%' GROUP BY type
    `);
            console.log('\n  Verification:');
            verify.forEach((v) => console.log(`    ${v.type}: ${v.c}`));
            // Now we can delete the account_transactions since they're in invoices
            // Actually keep them - they're harmless and provide an audit trail
            console.log('\n  🎉 Done! Payments are now visible in Statement of Account.');
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
