"use strict";
/**
 * MIGRATE: Standalone Discounts (Discounts.json)
 *
 * These are separate discount transactions (not part of invoices).
 *   InvType 1 = خصم مسموح به (Discount Allowed - given to customer) → DISCOUNT_ALLOWED
 *   InvType 2 = خصم مكتسب (Discount Earned - from supplier) → DISCOUNT_EARNED
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
const crypto_1 = require("crypto");
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const MALI_DATA_DIR = process.env.MIGRATION_DATA_DIR || path.resolve(__dirname, '../../mall stuff/data');
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('\n══════════════════════════════════════════════');
        console.log('  🏷️  MIGRATE: Standalone Discounts');
        console.log('══════════════════════════════════════════════\n');
        const discounts = JSON.parse(fs.readFileSync(path.join(MALI_DATA_DIR, 'Discounts.json'), 'utf8'));
        const idMapping = JSON.parse(fs.readFileSync(path.resolve(MALI_DATA_DIR, '../id_mapping.json'), 'utf8'));
        console.log(`  📦 Discounts: ${discounts.length} records`);
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const conn = yield pool.getConnection();
        try {
            // Clean up any previous migration
            const [existing] = yield conn.query("SELECT COUNT(*) as cnt FROM invoices WHERE number LIKE 'OLD-DISC-%'");
            if (existing[0].cnt > 0) {
                console.log(`  ⚠️  Deleting ${existing[0].cnt} existing discount records...`);
                yield conn.query("DELETE FROM invoices WHERE number LIKE 'OLD-DISC-%'");
            }
            // Load partner names
            const [partnerRows] = yield conn.query('SELECT id, name FROM partners');
            const partnerNameMap = new Map();
            for (const p of partnerRows)
                partnerNameMap.set(p.id, p.name);
            let insertedCount = 0;
            let skippedNoPartner = 0;
            let totalAllowed = 0;
            let totalEarned = 0;
            let countAllowed = 0;
            let countEarned = 0;
            let batch = [];
            for (const disc of discounts) {
                const personOldId = String(disc.PersonID);
                const partnerId = (_a = idMapping.partners) === null || _a === void 0 ? void 0 : _a[personOldId];
                if (!partnerId) {
                    skippedNoPartner++;
                    continue;
                }
                const partnerName = partnerNameMap.get(partnerId) || `Partner-${personOldId}`;
                const date = disc.InvDate || new Date().toISOString().slice(0, 10);
                const value = Number(disc.Value) || 0;
                if (value <= 0)
                    continue;
                // InvType 1 = Discount Allowed (خصم مسموح به - given to customer)
                // InvType 2 = Discount Earned (خصم مكتسب - from supplier)
                const type = disc.InvType === 1 ? 'DISCOUNT_ALLOWED' : 'DISCOUNT_EARNED';
                const number = `OLD-DISC-${disc.ID}`;
                const notes = disc.Notes || (type === 'DISCOUNT_ALLOWED' ? 'خصم مسموح به' : 'خصم مكتسب');
                if (type === 'DISCOUNT_ALLOWED') {
                    totalAllowed += value;
                    countAllowed++;
                }
                else {
                    totalEarned += value;
                    countEarned++;
                }
                const id = (0, crypto_1.randomUUID)();
                batch.push([
                    id, number, date, type, partnerId, partnerName,
                    value, 'POSTED', 'CASH', 1, notes, 'Migration'
                ]);
                if (batch.length >= 500) {
                    yield insertBatch(conn, batch);
                    insertedCount += batch.length;
                    batch = [];
                }
            }
            if (batch.length > 0) {
                yield insertBatch(conn, batch);
                insertedCount += batch.length;
            }
            console.log('\n══════════════════════════════════════════════');
            console.log('  📊 RESULTS');
            console.log('══════════════════════════════════════════════');
            console.log(`  ✅ Inserted:              ${insertedCount} records`);
            console.log(`  ⏭️  Skipped (no partner):  ${skippedNoPartner}`);
            console.log(`  🏷️  Discount Allowed:      ${countAllowed} records, ${totalAllowed.toLocaleString()} EGP`);
            console.log(`  🏷️  Discount Earned:       ${countEarned} records, ${totalEarned.toLocaleString()} EGP`);
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
function insertBatch(conn, batch) {
    return __awaiter(this, void 0, void 0, function* () {
        const promises = batch.map(args => {
            return conn.query(`INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args);
        });
        yield Promise.all(promises);
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
