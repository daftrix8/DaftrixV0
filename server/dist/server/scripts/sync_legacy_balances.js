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
const promise_1 = __importDefault(require("mysql2/promise"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const TARGET_DIR = path.resolve(__dirname, '../../mall stuff/New folder (3)/persons');
const MAPPING_FILE = path.resolve(__dirname, '../../mall stuff/id_mapping.json');
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('\n  dY"  Flawless Full Balance Synchronization from Legacy Master Files');
        if (!fs.existsSync(MAPPING_FILE)) {
            console.log('No mapping file found. Run migrations first.');
            return;
        }
        const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        const files = ['clients.json', 'clients_type2.json', 'suppliers.json', 'suppliers_type5.json'];
        let allTargets = new Map();
        for (const file of files) {
            const fp = path.join(TARGET_DIR, file);
            if (!fs.existsSync(fp)) {
                console.log(`Warning: Missing ${file}`);
                continue;
            }
            const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
            for (const person of data) {
                const daftrixId = (_a = mapping.partners) === null || _a === void 0 ? void 0 : _a[person.ID];
                if (daftrixId) {
                    // targetNetBalance logic:
                    // Daftrix POSITIVE = They Owe Us (Debit in GUI)
                    // JSON 'CALC_total_credit' = Debit in GUI.
                    // Target = CALC_total_credit - CALC_total_debit
                    const target = Number(person.CALC_total_credit || 0) - Number(person.CALC_total_debit || 0);
                    allTargets.set(daftrixId, target);
                }
            }
        }
        console.log(`Loaded ${allTargets.size} mathematical targets from Legacy JSONs.`);
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'cloud_erp'
        });
        const [agg] = yield conn.query(`
        SELECT p.id,
            SUM(CASE WHEN invoices.type = 'INVOICE_SALE' AND COALESCE(paymentMethod,'') != 'CASH' THEN invoices.total WHEN invoices.type = 'RETURN_SALE' AND COALESCE(paymentMethod,'') != 'CASH' THEN -(invoices.total) WHEN invoices.type IN ('RECEIPT', 'DISCOUNT_ALLOWED', 'CHEQUE_DEPOSIT', 'CHEQUE_COLLECT') THEN -invoices.total ELSE 0 END) as cImpact,
            SUM(CASE WHEN invoices.type = 'INVOICE_PURCHASE' AND COALESCE(paymentMethod,'') != 'CASH' THEN -(invoices.total) WHEN invoices.type = 'RETURN_PURCHASE' AND COALESCE(paymentMethod,'') != 'CASH' THEN invoices.total WHEN invoices.type IN ('PAYMENT', 'DISCOUNT_EARNED', 'CHEQUE_CASHED') THEN invoices.total ELSE 0 END) as sImpact,
            SUM(CASE WHEN invoices.type = 'CHEQUE_BOUNCE' THEN invoices.total ELSE 0 END) as bounceImpact,
            p.isSupplier, p.isCustomer
        FROM partners p
        LEFT JOIN invoices ON invoices.partnerId = p.id AND invoices.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
        GROUP BY p.id
    `);
        let corrected = 0;
        for (const row of agg) {
            const daftrixId = row.id;
            const target = allTargets.get(daftrixId);
            if (target !== undefined) {
                let currentNetDBImpact = 0;
                if (row.isSupplier === 0 || row.isCustomer === 1)
                    currentNetDBImpact += (Number(row.cImpact || 0) + Number(row.bounceImpact || 0));
                if (row.isSupplier === 1)
                    currentNetDBImpact += (Number(row.sImpact || 0) - Number(row.bounceImpact || 0));
                // Formula to perfectly hit target:
                // openingBalance + currentNetDBImpact = target
                // openingBalance = target - currentNetDBImpact
                const requiredOpeningBalance = target - currentNetDBImpact;
                yield conn.query('UPDATE partners SET openingBalance = ? WHERE id = ?', [requiredOpeningBalance.toFixed(2), daftrixId]);
                corrected++;
            }
        }
        console.log(`\n  dY"  Successfully aligned ${corrected} opening balances to perfectly neutralize any legacy SQL export drops.`);
        yield conn.end();
    });
}
main().catch(console.error);
