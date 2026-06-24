"use strict";
/**
 * FIX v3: Recalculate invoice totals from original data
 *
 * Problem: Previous discount fixes applied cumulatively.
 * Fix: Recalculate from original BuyInvoice/sellInvoice detail lines.
 *
 * For each invoice:
 *   1. Look up original header discount (invDiscount + discountType)
 *   2. Recalculate gross from detail lines (qty × price)
 *   3. Apply discount correctly: gross × (pct/100) or flat
 *   4. Store: total = net, globalDiscount = flat amount
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
const DATA_DIR = process.env.MIGRATION_DATA_DIR || path.resolve(__dirname, '../../mall stuff/data');
const MAPPING_FILE = process.env.MIGRATION_MAPPING_FILE || path.resolve(DATA_DIR, '../id_mapping.json');
function loadJson(filename) {
    const fp = path.join(DATA_DIR, filename);
    if (!fs.existsSync(fp))
        return [];
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('\n══════════════════════════════════════════════════════════');
        console.log('  🔧 FIX v3: Recalculate Invoice Totals from Source');
        console.log('══════════════════════════════════════════════════════════\n');
        const idMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectionLimit: 3,
        });
        const configs = [
            { headerFile: 'sellInvoice.json', detailFile: 'sellInvoice_Details.json', mapKey: 'sellInvoices', pctType: 1 },
            { headerFile: 'BuyInvoice.json', detailFile: 'BuyInvoice_Details.json', mapKey: 'buyInvoices', pctType: 2 },
            { headerFile: 'sellBackInvoice.json', detailFile: 'sellBackInvoice_Details.json', mapKey: 'sellBackInvoices', pctType: 1 },
            { headerFile: 'BuyBackInvoice.json', detailFile: 'BuyBackInvoice_Details.json', mapKey: 'buyBackInvoices', pctType: 2 },
        ];
        let totalFixed = 0;
        let totalSkipped = 0;
        let totalErrors = 0;
        const conn = yield pool.getConnection();
        try {
            for (const config of configs) {
                const headers = loadJson(config.headerFile);
                const details = loadJson(config.detailFile);
                if (headers.length === 0)
                    continue;
                // Build detail groups by MasterID
                const detailsByMaster = new Map();
                for (const d of details) {
                    const mid = d.masterID || d.MasterID;
                    if (!detailsByMaster.has(mid))
                        detailsByMaster.set(mid, []);
                    detailsByMaster.get(mid).push(d);
                }
                console.log(`\n--- ${config.headerFile} ---`);
                console.log(`  Headers: ${headers.length}, Details: ${details.length}`);
                let fixed = 0, skipped = 0, errors = 0;
                for (let i = 0; i < headers.length; i += 500) {
                    const batch = headers.slice(i, i + 500);
                    yield conn.beginTransaction();
                    for (const h of batch) {
                        const oldId = h.ID;
                        const newId = (_a = idMap[config.mapKey]) === null || _a === void 0 ? void 0 : _a[String(oldId)];
                        if (!newId) {
                            skipped++;
                            continue;
                        }
                        const discPct = Number(h.invDiscount || h.InvDiscount || 0);
                        const discType = h.discountType || h.DiscountType;
                        const isPercentage = discType === config.pctType;
                        // Calculate gross from detail lines
                        const invDetails = detailsByMaster.get(oldId) || [];
                        let gross = 0;
                        for (const d of invDetails) {
                            const price = Number(d.price || d.Price || 0);
                            const qty = Number(d.quan || d.Quan || d.quantity || 0);
                            gross += price * qty;
                        }
                        // If no details, try InvTotal or just skip (can't recalculate)
                        if (gross === 0) {
                            const invTotal = Number(h.InvTotal || h.invTotal || 0);
                            if (invTotal > 0)
                                gross = invTotal;
                            else {
                                skipped++;
                                continue;
                            }
                        }
                        // Calculate discount and net
                        let discountAmount = 0;
                        if (discPct > 0) {
                            if (isPercentage) {
                                discountAmount = Math.round(gross * discPct / 100 * 100) / 100;
                            }
                            else {
                                discountAmount = discPct; // flat amount
                            }
                        }
                        const netTotal = Math.round((gross - discountAmount) * 100) / 100;
                        try {
                            yield conn.query(`UPDATE invoices SET total = ?, globalDiscount = ?, globalDiscountType = 'FIXED' WHERE id = ?`, [netTotal, discountAmount, newId]);
                            fixed++;
                        }
                        catch (err) {
                            console.error(`  ❌ Invoice ${oldId}: ${err.message}`);
                            errors++;
                        }
                    }
                    yield conn.commit();
                    if (i % 2000 === 0 && i > 0)
                        console.log(`    processed ${i}...`);
                }
                console.log(`  ✅ Fixed: ${fixed} | Skipped: ${skipped} | Errors: ${errors}`);
                totalFixed += fixed;
                totalSkipped += skipped;
                totalErrors += errors;
            }
            // Sync paidAmount for cash invoices
            console.log('\n  Syncing paidAmount for cash invoices...');
            const [syncResult] = yield conn.query(`
      UPDATE invoices SET paidAmount = total 
      WHERE paymentMethod = 'CASH' AND status IN ('POSTED','COMPLETED') AND number LIKE 'OLD-%'
    `);
            console.log(`  ✅ Synced paidAmount for ${syncResult.affectedRows} invoices`);
        }
        finally {
            conn.release();
            yield pool.end();
        }
        console.log('\n══════════════════════════════════════════════════════════');
        console.log(`  ✅ Fixed: ${totalFixed} | ⏭️ Skipped: ${totalSkipped} | ❌ Errors: ${totalErrors}`);
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
