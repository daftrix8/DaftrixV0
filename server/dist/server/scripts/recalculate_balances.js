"use strict";
/**
 * PARTNER BALANCE RECALCULATION
 *
 * After bulk-importing invoices and payments, the partner balance fields
 * are stale. This script recalculates them from the actual transaction data.
 *
 * Balance = openingBalance
 *   + SUM(SALE invoices)          → customer owes us
 *   - SUM(RETURN_SALE invoices)   → we returned to customer
 *   - SUM(PURCHASE invoices)      → we owe supplier
 *   + SUM(RETURN_PURCHASE)        → supplier returned to us
 *   - SUM(customer payments)      → customer paid
 *   + SUM(vendor payments)        → we paid supplier
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
const dotenv_1 = __importDefault(require("dotenv"));
const path = __importStar(require("path"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
function recalculateBalances() {
    return __awaiter(this, void 0, void 0, function* () {
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true,
            connectTimeout: 30000,
            authPlugins: {
                mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0')
            },
        });
        console.log('=== PARTNER BALANCE RECALCULATION ===\n');
        const conn = yield pool.getConnection();
        try {
            // Step 1: Show a sample before recalculation
            const [sampleBefore] = yield conn.query(`
      SELECT p.name, p.type, p.balance, p.openingBalance,
        (SELECT COALESCE(SUM(i.total), 0) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'SALE') as saleTotal,
        (SELECT COALESCE(SUM(i.total), 0) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'PURCHASE') as purchaseTotal,
        (SELECT COALESCE(SUM(i.total), 0) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_SALE') as returnSaleTotal,
        (SELECT COALESCE(SUM(i.total), 0) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_PURCHASE') as returnPurchaseTotal,
        (SELECT COALESCE(SUM(at2.debit), 0) FROM account_transactions at2 WHERE at2.partnerId = p.id AND at2.type = 'VENDOR_PAYMENT') as vendorPayments,
        (SELECT COALESCE(SUM(at2.credit), 0) FROM account_transactions at2 WHERE at2.partnerId = p.id AND at2.type = 'CUSTOMER_PAYMENT') as customerPayments
      FROM partners p 
      WHERE p.name LIKE '%غديه%' OR p.name LIKE '%ابراهيم غديه%'
      LIMIT 5
    `);
            if (sampleBefore.length > 0) {
                console.log('  BEFORE recalculation (ابراهيم غديه):');
                for (const r of sampleBefore) {
                    console.log(`    Name: ${r.name}`);
                    console.log(`    Type: ${r.type}`);
                    console.log(`    Current balance: ${r.balance}`);
                    console.log(`    Opening balance: ${r.openingBalance}`);
                    console.log(`    Sale invoices: ${r.saleTotal}`);
                    console.log(`    Purchase invoices: ${r.purchaseTotal}`);
                    console.log(`    Sale returns: ${r.returnSaleTotal}`);
                    console.log(`    Purchase returns: ${r.returnPurchaseTotal}`);
                    console.log(`    Vendor payments (debit): ${r.vendorPayments}`);
                    console.log(`    Customer payments (credit): ${r.customerPayments}`);
                }
            }
            // Step 2: Recalculate ALL partner balances
            console.log('\n  Recalculating all partner balances...');
            // For SUPPLIER / BOTH partners:
            // balance = openingBalance 
            //   + purchase invoices (we owe them)
            //   - purchase returns (they owe us back)
            //   - vendor payments (we paid them)
            //
            // IMPORTANT: In our system, positive balance for supplier = we owe them
            // In the old ERP, startBalance was the initial amount we owed them
            // So: balance = openingBalance + purchases - returns - payments
            yield conn.query(`
      UPDATE partners p SET p.balance = (
        p.openingBalance
        + COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'PURCHASE'), 0)
        - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_PURCHASE'), 0)
        - COALESCE((SELECT SUM(at2.debit) FROM account_transactions at2 WHERE at2.partnerId = p.id AND at2.type = 'VENDOR_PAYMENT'), 0)
      )
      WHERE p.type IN ('SUPPLIER', 'BOTH') OR p.isSupplier = TRUE
    `);
            const [supplierResult] = yield conn.query(`SELECT ROW_COUNT() as cnt`);
            console.log(`  ✅ Updated ${supplierResult[0].cnt} supplier balances`);
            // For CUSTOMER partners:
            // balance = openingBalance
            //   + sale invoices (they owe us)
            //   - sale returns (we returned)
            //   - customer payments (they paid us)
            yield conn.query(`
      UPDATE partners p SET p.balance = (
        p.openingBalance
        + COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'SALE'), 0)
        - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_SALE'), 0)
        - COALESCE((SELECT SUM(at2.credit) FROM account_transactions at2 WHERE at2.partnerId = p.id AND at2.type = 'CUSTOMER_PAYMENT'), 0)
      )
      WHERE p.type = 'CUSTOMER' OR (p.isCustomer = TRUE AND p.isSupplier = FALSE)
    `);
            const [customerResult] = yield conn.query(`SELECT ROW_COUNT() as cnt`);
            console.log(`  ✅ Updated ${customerResult[0].cnt} customer balances`);
            // Step 3: Verify the specific partner after recalculation
            const [sampleAfter] = yield conn.query(`
      SELECT name, type, balance, openingBalance 
      FROM partners 
      WHERE name LIKE '%غديه%' OR name LIKE '%ابراهيم غديه%'
      LIMIT 5
    `);
            if (sampleAfter.length > 0) {
                console.log('\n  AFTER recalculation (ابراهيم غديه):');
                for (const r of sampleAfter) {
                    console.log(`    Name: ${r.name}, Balance: ${r.balance}, Opening: ${r.openingBalance}`);
                }
            }
            // Step 4: Summary stats
            const [zeroBalanceSuppliers] = yield conn.query(`
      SELECT COUNT(*) as cnt FROM partners WHERE (type = 'SUPPLIER' OR isSupplier = TRUE) AND balance = 0
    `);
            const [nonZeroSuppliers] = yield conn.query(`
      SELECT COUNT(*) as cnt FROM partners WHERE (type = 'SUPPLIER' OR isSupplier = TRUE) AND balance != 0
    `);
            const [zeroBalanceCustomers] = yield conn.query(`
      SELECT COUNT(*) as cnt FROM partners WHERE type = 'CUSTOMER' AND balance = 0
    `);
            const [nonZeroCustomers] = yield conn.query(`
      SELECT COUNT(*) as cnt FROM partners WHERE type = 'CUSTOMER' AND balance != 0
    `);
            console.log('\n  === BALANCE SUMMARY ===');
            console.log(`  Suppliers with zero balance: ${zeroBalanceSuppliers[0].cnt}`);
            console.log(`  Suppliers with non-zero balance: ${nonZeroSuppliers[0].cnt}`);
            console.log(`  Customers with zero balance: ${zeroBalanceCustomers[0].cnt}`);
            console.log(`  Customers with non-zero balance: ${nonZeroCustomers[0].cnt}`);
            // Show top 10 suppliers by balance (to verify)
            const [topSuppliers] = yield conn.query(`
      SELECT name, balance FROM partners 
      WHERE type = 'SUPPLIER' OR isSupplier = TRUE 
      ORDER BY ABS(balance) DESC LIMIT 10
    `);
            console.log('\n  === TOP 10 SUPPLIERS BY BALANCE ===');
            for (const s of topSuppliers) {
                console.log(`    ${s.name}: ${s.balance}`);
            }
            console.log('\n  🎉 Balance recalculation complete!\n');
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
recalculateBalances().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
