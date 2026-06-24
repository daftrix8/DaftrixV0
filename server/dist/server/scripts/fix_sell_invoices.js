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
 * FIX: Recalculate ALL sell (and sell-back) invoice totals from source
 *
 * ROOT CAUSE: fix_discount_types.ts incorrectly treated sell invoice discounts
 * as percentages. In the old system:
 *   - BUY invoices: discountType=2 means PERCENTAGE (invDiscount=5 → 5%)
 *   - SELL invoices: invDiscount is ALWAYS a FLAT amount regardless of discountType
 *
 * This script recalculates from source detail lines with correct flat discount logic.
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
        var _a, _b;
        console.log('\n══════════════════════════════════════════════════════');
        console.log('  🔧 FIX: Recalculate SELL Invoice Totals (Flat Discount)');
        console.log('══════════════════════════════════════════════════════\n');
        const idMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectionLimit: 3,
        });
        const configs = [
            { file: 'sellInvoice.json', detailFile: 'sellInvoice_Details.json', mapKey: 'sellInvoices', label: 'Sell Invoices' },
            { file: 'sellBackInvoice.json', detailFile: 'sellBackInvoice_Details.json', mapKey: 'sellBackInvoices', label: 'Sell Returns' },
        ];
        const conn = yield pool.getConnection();
        let grandTotal = 0;
        let grandFixed = 0;
        try {
            for (const config of configs) {
                const headers = loadJson(config.file);
                const details = loadJson(config.detailFile);
                if (headers.length === 0) {
                    console.log(`--- ${config.label}: No data ---`);
                    continue;
                }
                // Group details by masterID
                const detByMaster = new Map();
                for (const d of details) {
                    const m = d.masterID || d.MasterID;
                    if (!detByMaster.has(m))
                        detByMaster.set(m, []);
                    detByMaster.get(m).push(d);
                }
                console.log(`--- ${config.label}: ${headers.length} invoices ---`);
                let updated = 0;
                let skipped = 0;
                let noMapping = 0;
                yield conn.beginTransaction();
                for (const h of headers) {
                    const newId = (_a = idMap[config.mapKey]) === null || _a === void 0 ? void 0 : _a[String(h.ID)];
                    if (!newId) {
                        noMapping++;
                        continue;
                    }
                    const dets = detByMaster.get(h.ID) || [];
                    // Calculate gross from detail lines
                    let gross = 0;
                    for (const d of dets) {
                        gross += Number(d.price || d.Price || 0) * Number(d.quan || d.Quan || 0);
                    }
                    // For SELL invoices: invDiscount is ALWAYS a flat amount
                    const discountFlat = Number(h.invDiscount || 0);
                    const adds = Number(h.invAdds || 0);
                    const correctTotal = gross - discountFlat + adds;
                    // Get current DB value
                    const [rows] = yield conn.query('SELECT total, globalDiscount FROM invoices WHERE id = ?', [newId]);
                    if (!rows[0]) {
                        skipped++;
                        continue;
                    }
                    const currentTotal = rows[0].total;
                    const currentDiscount = rows[0].globalDiscount || 0;
                    // Only update if different
                    if (Math.abs(currentTotal - correctTotal) > 0.01 || Math.abs(currentDiscount - discountFlat) > 0.01) {
                        yield conn.query('UPDATE invoices SET total = ?, globalDiscount = ? WHERE id = ?', [correctTotal, discountFlat, newId]);
                        updated++;
                    }
                    else {
                        skipped++;
                    }
                }
                // Sync paidAmount for cash invoices
                yield conn.query(`
        UPDATE invoices SET paidAmount = total 
        WHERE paymentMethod = 'CASH' AND status IN ('POSTED','COMPLETED') AND number LIKE 'OLD-%'
        AND type IN ('INVOICE_SALE', 'SALE', 'RETURN_SALE')
      `);
                yield conn.commit();
                console.log(`  ✅ Fixed: ${updated}`);
                console.log(`  ⏭️  Already correct: ${skipped}`);
                if (noMapping > 0)
                    console.log(`  ⚠️ No mapping: ${noMapping}`);
                grandTotal += headers.length;
                grandFixed += updated;
            }
        }
        finally {
            conn.release();
        }
        // Verify specific invoices the user mentioned
        console.log('\n--- Verification (user-reported invoices) ---\n');
        const checkNums = [18082, 18083, 18084, 18085, 18086];
        const headers = loadJson('sellInvoice.json');
        for (const num of checkNums) {
            const h = headers.find((h) => h.invNum === num);
            if (!h)
                continue;
            const newId = (_b = idMap.sellInvoices) === null || _b === void 0 ? void 0 : _b[String(h.ID)];
            if (!newId)
                continue;
            const [rows] = yield pool.query('SELECT total, globalDiscount FROM invoices WHERE id = ?', [newId]);
            if (!rows[0])
                continue;
            console.log(`  Inv#${num}: total=${rows[0].total} discount=${rows[0].globalDiscount}`);
        }
        console.log(`\n══════════════════════════════════════════════════════`);
        console.log(`  ✅ Total fixed: ${grandFixed} / ${grandTotal} invoices`);
        console.log(`  Now run fix_partner_balances.ts to sync partner balances`);
        yield pool.end();
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
