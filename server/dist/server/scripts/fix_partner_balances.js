"use strict";
/**
 * FIX: Recalculate partner.balance from actual transaction data
 *
 * The `balance` field stored on partners was never updated after migration.
 * This script recalculates it using the same logic as the PartnerStatement:
 *   - Invoice purchase → negative (we owe more)
 *   - Return purchase → positive (we owe less)
 *   - Payment → positive (we paid)
 *   - Receipt → negative (customer paid us)
 *   - Discount earned → positive
 *   Net = total_net regardless of dates/period
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
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n══════════════════════════════════════════════════════════');
        console.log('  🔧 Recalculate Partner Balances from Transactions');
        console.log('══════════════════════════════════════════════════════════\n');
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectionLimit: 3,
        });
        const conn = yield pool.getConnection();
        try {
            // Get all partners
            const [partners] = yield conn.query('SELECT id, name, balance, isSupplier FROM partners');
            console.log(`  Partners: ${partners.length}`);
            let updated = 0;
            let noChange = 0;
            let noTransactions = 0;
            for (const partner of partners) {
                // Calculate balance from invoices (same formula as PartnerStatement)
                // For SUPPLIERS:
                //   Purchase = credit (we owe more) → negative balance
                //   Return Purchase = debit (we owe less) → positive
                //   Payment = debit (we paid) → positive  
                //   Discount Earned = debit → positive
                // For CUSTOMERS:
                //   Sale = debit (they owe more) → positive balance
                //   Return Sale = credit (they owe less) → negative
                //   Receipt = credit (they paid us) → negative
                //   Discount Allowed = credit → negative
                const [rows] = yield conn.query(`
        SELECT type, 
          SUM(total) as totalAmount,
          SUM(globalDiscount) as totalDiscount
        FROM invoices 
        WHERE partnerId = ? AND status IN ('POSTED', 'COMPLETED')
        GROUP BY type
      `, [partner.id]);
                if (rows.length === 0) {
                    noTransactions++;
                    // Don't zero out - might have opening balance
                    continue;
                }
                let balance = 0;
                for (const row of rows) {
                    const net = row.totalAmount; // already net (total after discount)
                    switch (row.type) {
                        case 'INVOICE_PURCHASE':
                            balance -= net;
                            break;
                        case 'RETURN_PURCHASE':
                            balance += net;
                            break;
                        case 'PAYMENT':
                            balance += net;
                            break;
                        case 'RECEIPT':
                            balance -= net;
                            break;
                        case 'DISCOUNT_EARNED':
                            balance += net;
                            break;
                        case 'INVOICE_SALE':
                            balance += net;
                            break;
                        case 'RETURN_SALE':
                            balance -= net;
                            break;
                        case 'DISCOUNT_ALLOWED':
                            balance -= net;
                            break;
                    }
                }
                // Round to 2 decimals
                balance = Math.round(balance * 100) / 100;
                if (Math.abs(balance - partner.balance) > 0.01) {
                    yield conn.query('UPDATE partners SET balance = ? WHERE id = ?', [balance, partner.id]);
                    updated++;
                    if (Math.abs(balance - partner.balance) > 1000) {
                        console.log(`  ⚡ ${partner.name}: ${partner.balance} → ${balance} (diff: ${(balance - partner.balance).toLocaleString()})`);
                    }
                }
                else {
                    noChange++;
                }
            }
            console.log(`\n  ✅ Updated: ${updated}`);
            console.log(`  ⏭️  No change: ${noChange}`);
            console.log(`  📭 No transactions: ${noTransactions}`);
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
