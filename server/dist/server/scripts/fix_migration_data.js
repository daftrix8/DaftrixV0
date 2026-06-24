"use strict";
/**
 * FIX MIGRATION DATA
 *
 * 1. Fix invoice types: SALE → INVOICE_SALE, PURCHASE → INVOICE_PURCHASE
 * 2. Recalculate all partner balances based on corrected data
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
function fix() {
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
        const conn = yield pool.getConnection();
        try {
            // ═══════════════════════════════════════════════════════
            // FIX 1: Invoice Types
            // ═══════════════════════════════════════════════════════
            console.log('=== FIX 1: Correcting Invoice Types ===\n');
            // Show before
            const [beforeTypes] = yield conn.query(`SELECT type, COUNT(*) as cnt FROM invoices GROUP BY type ORDER BY cnt DESC`);
            console.log('  BEFORE:');
            for (const t of beforeTypes)
                console.log(`    ${t.type}: ${t.cnt}`);
            // Fix: SALE → INVOICE_SALE (only for OLD- migrated invoices)
            const [r1] = yield conn.query(`
      UPDATE invoices SET type = 'INVOICE_SALE' 
      WHERE type = 'SALE' AND number LIKE 'OLD-S-%'
    `);
            console.log(`\n  ✅ SALE → INVOICE_SALE: ${r1.affectedRows} rows`);
            // Fix: PURCHASE → INVOICE_PURCHASE
            const [r2] = yield conn.query(`
      UPDATE invoices SET type = 'INVOICE_PURCHASE' 
      WHERE type = 'PURCHASE' AND number LIKE 'OLD-P-%'
    `);
            console.log(`  ✅ PURCHASE → INVOICE_PURCHASE: ${r2.affectedRows} rows`);
            // RETURN_SALE and RETURN_PURCHASE are already correct (no change needed)
            // Show after
            const [afterTypes] = yield conn.query(`SELECT type, COUNT(*) as cnt FROM invoices GROUP BY type ORDER BY cnt DESC`);
            console.log('\n  AFTER:');
            for (const t of afterTypes)
                console.log(`    ${t.type}: ${t.cnt}`);
            // ═══════════════════════════════════════════════════════
            // FIX 2: Recalculate Partner Balances  
            // ═══════════════════════════════════════════════════════
            console.log('\n=== FIX 2: Recalculating Partner Balances ===\n');
            // For SUPPLIERS:
            // balance = openingBalance + purchases - returns - payments
            yield conn.query(`
      UPDATE partners p SET p.balance = (
        p.openingBalance
        + COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'INVOICE_PURCHASE'), 0)
        - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_PURCHASE'), 0)
        - COALESCE((SELECT SUM(at2.debit) FROM account_transactions at2 WHERE at2.partnerId = p.id AND at2.type = 'VENDOR_PAYMENT'), 0)
      )
      WHERE p.type IN ('SUPPLIER', 'BOTH') OR p.isSupplier = TRUE
    `);
            const [sr] = yield conn.query(`SELECT ROW_COUNT() as cnt`);
            console.log(`  ✅ Updated ${sr[0].cnt} supplier balances`);
            // For CUSTOMERS:
            // balance = openingBalance + sales - returns - payments  
            yield conn.query(`
      UPDATE partners p SET p.balance = (
        p.openingBalance
        + COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'INVOICE_SALE'), 0)
        - COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_SALE'), 0)
        - COALESCE((SELECT SUM(at2.credit) FROM account_transactions at2 WHERE at2.partnerId = p.id AND at2.type = 'CUSTOMER_PAYMENT'), 0)
      )
      WHERE p.type = 'CUSTOMER' OR (p.isCustomer = TRUE AND p.isSupplier = FALSE)
    `);
            const [cr] = yield conn.query(`SELECT ROW_COUNT() as cnt`);
            console.log(`  ✅ Updated ${cr[0].cnt} customer balances`);
            // ═══════════════════════════════════════════════════════
            // VERIFY: Check specific supplier
            // ═══════════════════════════════════════════════════════
            console.log('\n=== VERIFICATION ===\n');
            const [ghadia] = yield conn.query(`
      SELECT p.name, p.type, p.balance, p.openingBalance,
        COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'INVOICE_PURCHASE'), 0) as purchases,
        COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.partnerId = p.id AND i.type = 'RETURN_PURCHASE'), 0) as returns,
        COALESCE((SELECT SUM(at2.debit) FROM account_transactions at2 WHERE at2.partnerId = p.id AND at2.type = 'VENDOR_PAYMENT'), 0) as payments
      FROM partners p
      WHERE p.name LIKE '%غديه ارت%'
    `);
            if (ghadia.length > 0) {
                const g = ghadia[0];
                console.log(`  Partner: ${g.name}`);
                console.log(`  Opening Balance: ${g.openingBalance}`);
                console.log(`  + Purchases: ${g.purchases}`);
                console.log(`  - Returns: ${g.returns}`);
                console.log(`  - Payments: ${g.payments}`);
                console.log(`  = Balance: ${g.balance}`);
                console.log(`  Expected (old ERP): 0`);
                if (Math.abs(g.balance) > 0.01) {
                    console.log(`\n  ⚠️  Balance mismatch! Difference: ${g.balance}`);
                    console.log(`  This means: openingBalance(${g.openingBalance}) + purchases(${g.purchases}) - returns(${g.returns}) - payments(${g.payments}) = ${g.openingBalance + g.purchases - g.returns - g.payments}`);
                }
            }
            // Show balance summary
            const [zeroSuppliers] = yield conn.query(`SELECT COUNT(*) as cnt FROM partners WHERE (type='SUPPLIER' OR isSupplier=TRUE) AND ABS(balance) < 0.01`);
            const [nonZeroSuppliers] = yield conn.query(`SELECT COUNT(*) as cnt FROM partners WHERE (type='SUPPLIER' OR isSupplier=TRUE) AND ABS(balance) >= 0.01`);
            console.log(`\n  Suppliers with ~zero balance: ${zeroSuppliers[0].cnt}`);
            console.log(`  Suppliers with non-zero balance: ${nonZeroSuppliers[0].cnt}`);
            console.log('\n  🎉 Fixes applied successfully!\n');
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
fix().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
