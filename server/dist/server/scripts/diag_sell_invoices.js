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
 * DIAGNOSTIC: Check sell invoice totals against source data
 * The invoices are showing negative/wrong totals in the UI
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
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectionLimit: 3,
        });
        const idMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        console.log('═══ SELL INVOICE DIAGNOSTIC ═══\n');
        // Check specific invoices the user mentioned
        const checkNums = [18082, 18083, 18084, 18085, 18086];
        const headers = loadJson('sellInvoice.json');
        const details = loadJson('sellInvoice_Details.json');
        const detByMaster = new Map();
        for (const d of details) {
            const m = d.masterID || d.MasterID;
            if (!detByMaster.has(m))
                detByMaster.set(m, []);
            detByMaster.get(m).push(d);
        }
        console.log('--- Checking specific invoices ---\n');
        for (const num of checkNums) {
            const h = headers.find((h) => h.invNum === num || h.InvNo === num);
            if (!h) {
                console.log(`  ❌ Invoice ${num} not found in source data`);
                continue;
            }
            const newId = (_a = idMap.sellInvoices) === null || _a === void 0 ? void 0 : _a[String(h.ID)];
            const dets = detByMaster.get(h.ID) || [];
            // Calculate correct gross from details
            let gross = 0;
            for (const d of dets) {
                gross += Number(d.price || d.Price || 0) * Number(d.quan || d.Quan || 0);
            }
            // Apply discount
            const discPct = h.discountType === 1 ? Number(h.invDiscount || 0) : 0;
            const discFlat = h.discountType === 2 ? Number(h.invDiscount || 0) : 0;
            const discAmount = discPct > 0 ? gross * discPct / 100 : discFlat;
            const correctNet = gross - discAmount;
            const adds = Number(h.invAdds || 0);
            const correctTotal = correctNet + adds;
            // Get current DB value
            let dbTotal = 0;
            let dbDiscount = 0;
            if (newId) {
                const [rows] = yield pool.query('SELECT total, globalDiscount FROM invoices WHERE id = ?', [newId]);
                if (rows[0]) {
                    dbTotal = rows[0].total;
                    dbDiscount = rows[0].globalDiscount || 0;
                }
            }
            const diff = dbTotal - correctTotal;
            console.log(`  Inv#${num} (old:${h.ID}, new:${newId}):`);
            console.log(`    Source: gross=${gross} disc=${discAmount} (${h.discountType === 1 ? 'pct' : 'flat'} ${h.invDiscount}%) adds=${adds} → correct=${correctTotal}`);
            console.log(`    DB:     total=${dbTotal} discount=${dbDiscount}`);
            console.log(`    ${Math.abs(diff) < 0.01 ? '✅ OK' : `❌ DIFF: ${diff.toFixed(2)}`}`);
            console.log();
        }
        // Global stats
        console.log('--- Global sell invoice check ---\n');
        let totalCorrect = 0, totalDB = 0, diffCount = 0, negativeCount = 0;
        for (const h of headers) {
            const newId = (_b = idMap.sellInvoices) === null || _b === void 0 ? void 0 : _b[String(h.ID)];
            if (!newId)
                continue;
            const dets = detByMaster.get(h.ID) || [];
            let gross = 0;
            for (const d of dets) {
                gross += Number(d.price || d.Price || 0) * Number(d.quan || d.Quan || 0);
            }
            const discPct = h.discountType === 1 ? Number(h.invDiscount || 0) : 0;
            const discFlat = h.discountType === 2 ? Number(h.invDiscount || 0) : 0;
            const discAmount = discPct > 0 ? gross * discPct / 100 : discFlat;
            const correctNet = gross - discAmount;
            const adds = Number(h.invAdds || 0);
            const correctTotal = correctNet + adds;
            const [rows] = yield pool.query('SELECT total FROM invoices WHERE id = ?', [newId]);
            if (!rows[0])
                continue;
            const dbTotal = rows[0].total;
            totalCorrect += correctTotal;
            totalDB += dbTotal;
            if (dbTotal < 0)
                negativeCount++;
            if (Math.abs(dbTotal - correctTotal) > 0.01)
                diffCount++;
        }
        console.log(`  Total invoices checked: ${headers.length}`);
        console.log(`  Invoices with wrong total: ${diffCount}`);
        console.log(`  Invoices with NEGATIVE total: ${negativeCount}`);
        console.log(`  Sum correct: ${totalCorrect.toLocaleString()}`);
        console.log(`  Sum in DB:   ${totalDB.toLocaleString()}`);
        console.log(`  Gap:         ${(totalDB - totalCorrect).toLocaleString()}`);
        yield pool.end();
    });
}
run().catch(e => { console.error(e); process.exit(1); });
