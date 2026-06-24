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
 * FIX: Add invAdds (إضافات) to invoice totals
 *
 * The old system has an "invAdds" field on invoice headers that represents
 * additional charges (shipping, extras). These are added to the invoice total
 * in the old system but were missed during migration.
 *
 * Formula: new total = current total + invAdds
 * (discount was already calculated on the base gross, not including invAdds)
 */
const promise_1 = __importDefault(require("mysql2/promise"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const DATA_DIR = process.env.MIGRATION_DATA_DIR || path.resolve(__dirname, '../../mall stuff/data');
const MAPPING_FILE = process.env.MIGRATION_MAPPING_FILE || path.resolve(DATA_DIR, '../id_mapping.json');
function loadJson(f) { const fp = path.join(DATA_DIR, f); if (!fs.existsSync(fp))
    return []; return JSON.parse(fs.readFileSync(fp, 'utf8')); }
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('\n══════════════════════════════════════════════════');
        console.log('  🔧 FIX: Add invAdds (إضافات) to Invoice Totals');
        console.log('══════════════════════════════════════════════════\n');
        const idMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectionLimit: 3,
        });
        const configs = [
            { file: 'sellInvoice.json', mapKey: 'sellInvoices' },
            { file: 'BuyInvoice.json', mapKey: 'buyInvoices' },
            { file: 'sellBackInvoice.json', mapKey: 'sellBackInvoices' },
            { file: 'BuyBackInvoice.json', mapKey: 'buyBackInvoices' },
        ];
        const conn = yield pool.getConnection();
        let totalUpdated = 0;
        let totalAddsAmount = 0;
        try {
            for (const config of configs) {
                const headers = loadJson(config.file);
                const withAdds = headers.filter((h) => Number(h.invAdds || 0) > 0);
                if (withAdds.length === 0) {
                    console.log(`--- ${config.file}: No invAdds found ---`);
                    continue;
                }
                console.log(`--- ${config.file}: ${withAdds.length} invoices with invAdds ---`);
                let updated = 0;
                let addsSum = 0;
                yield conn.beginTransaction();
                for (const h of withAdds) {
                    const newId = (_a = idMap[config.mapKey]) === null || _a === void 0 ? void 0 : _a[String(h.ID)];
                    if (!newId)
                        continue;
                    const adds = Number(h.invAdds);
                    addsSum += adds;
                    // Add invAdds to total (total is NET after discount, invAdds is extra charges)
                    yield conn.query(`UPDATE invoices SET total = total + ? WHERE id = ? AND total > 0`, [adds, newId]);
                    updated++;
                }
                yield conn.commit();
                // Sync paidAmount for cash invoices
                yield conn.query(`
        UPDATE invoices SET paidAmount = total 
        WHERE paymentMethod = 'CASH' AND status IN ('POSTED','COMPLETED') AND number LIKE 'OLD-%'
      `);
                console.log(`  ✅ Updated: ${updated}, Total adds: ${addsSum.toLocaleString()}`);
                totalUpdated += updated;
                totalAddsAmount += addsSum;
            }
        }
        finally {
            conn.release();
            yield pool.end();
        }
        console.log(`\n══════════════════════════════════════════════════`);
        console.log(`  ✅ Total updated: ${totalUpdated} invoices`);
        console.log(`  💰 Total invAdds added: ${totalAddsAmount.toLocaleString()}`);
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
