"use strict";
/**
 * FIX: Truthful Reconciliation Script
 *
 * This recalculates the opening balances so that the UI's PartnerStatement
 * matches the old ERP's Final Balances EXACTLY.
 *
 * It uses the EXACT same math as the PartnerStatement.tsx and considers ALL
 * migrated transactions regardless of date, then sets the openingBalance
 * to bridge the exact gap to the target balance.
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
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const BALANCES_DIR = path.resolve(__dirname, '../../mall stuff/balances');
const MAPPING_FILE = path.resolve(__dirname, '../../mall stuff/id_mapping.json');
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('\n══════════════════════════════════════════════');
        console.log('  🎯 TRUTH RECONCILE: Matching UI Math to Old ERP');
        console.log('══════════════════════════════════════════════\n');
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const idMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        const conn = yield pool.getConnection();
        try {
            const vendorBalances = JSON.parse(fs.readFileSync(path.join(BALANCES_DIR, 'vendor_balances.json'), 'utf8'));
            console.log(`  Processing ${vendorBalances.records.length} vendors...`);
            let vendorsFixed = 0;
            // UI Math from PartnerStatement:
            // Vendor = INVOICE_PURCHASE (-), RETURN_PURCHASE (+), PAYMENT (+), RECEIPT (+), DISCOUNT_EARNED (+), CHEQUE_BOUNCE (depends), CHEQUE_CASHED (+)
            for (const vb of vendorBalances.records) {
                const oldId = String(vb.id);
                const partnerId = (_a = idMap.partners) === null || _a === void 0 ? void 0 : _a[oldId];
                if (!partnerId)
                    continue;
                const targetBalance = vb.balance; // expected final balance
                // Fetch ALL invoices like PartnerStatement does
                const [invoices] = yield conn.query(`
        SELECT type, total FROM invoices 
        WHERE partnerId = ? AND status != 'DRAFT' AND status != 'VOID'
      `, [partnerId]);
                let transSum = 0;
                for (const t of invoices) {
                    const amount = t.total;
                    let baseImpact = 0;
                    switch (t.type) {
                        case 'INVOICE_SALE':
                            baseImpact = amount;
                            break;
                        case 'RETURN_SALE':
                            baseImpact = -amount;
                            break;
                        case 'RECEIPT':
                            baseImpact = -amount;
                            break;
                        case 'DISCOUNT_ALLOWED':
                            baseImpact = -amount;
                            break;
                        case 'CHEQUE_DEPOSIT':
                            baseImpact = -amount;
                            break;
                        case 'CHEQUE_COLLECT':
                            baseImpact = -amount;
                            break;
                        case 'INVOICE_PURCHASE':
                            baseImpact = -amount;
                            break;
                        case 'RETURN_PURCHASE':
                            baseImpact = amount;
                            break;
                        case 'PAYMENT':
                            baseImpact = amount;
                            break;
                        case 'DISCOUNT_EARNED':
                            baseImpact = amount;
                            break;
                        case 'CHEQUE_CASHED':
                            baseImpact = amount;
                            break;
                        case 'CHEQUE_BOUNCE':
                            baseImpact = amount;
                            break; // Fallback (like isSupplier logic: -(-t.total))
                    }
                    // isSupplier = true, so impact is negated
                    const finalImpact = -baseImpact;
                    transSum += finalImpact;
                }
                // We want: TargetBalance = OpeningBalance + TransSum
                // Thus: OpeningBalance = TargetBalance - TransSum
                const newOpening = targetBalance - transSum;
                // Update in DB
                yield conn.query(`UPDATE partners SET openingBalance = ?, balance = ? WHERE id = ?`, [newOpening, targetBalance, partnerId]);
                vendorsFixed++;
                if (vb.name.includes('غديه')) {
                    console.log(`\n  🔧 ${vb.name}`);
                    console.log(`     Data from UI Math: TransSum = ${transSum}`);
                    console.log(`     Target Final Balance: ${targetBalance}`);
                    console.log(`     => New Opening Balance: ${newOpening}\n`);
                }
            }
            console.log(`  ✅ Synced exactly ${vendorsFixed} vendor balances to match UI output.`);
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
