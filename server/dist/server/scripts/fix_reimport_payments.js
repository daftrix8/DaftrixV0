"use strict";
/**
 * FIX: Reimport Vendor Payments preserving MasterID and Notes
 *
 * Clears out the generic 'OLD-PAY-V-%' invoices created by the previous
 * migration script and directly injects the vendor payments into the invoices
 * table, using the original document number (MasterID) and exact Notes string.
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
const MALI_DATA_DIR = path.resolve(__dirname, '../../mall stuff/data');
const MAPPING_FILE = path.resolve(__dirname, '../../mall stuff/id_mapping.json');
const loadJson = (filename) => {
    let filePath = path.join(MALI_DATA_DIR, filename);
    if (filename === 'id_mapping.json') {
        filePath = MAPPING_FILE;
    }
    if (!fs.existsSync(filePath)) {
        throw new Error(`Migration file not found: ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};
const formatDate = (dateString) => {
    if (!dateString)
        return null;
    const d = new Date(dateString);
    if (isNaN(d.getTime()))
        return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
};
const sanitize = (text) => {
    if (!text)
        return '';
    return text.trim();
};
const safeNum = (val) => {
    if (val === undefined || val === null || val === '')
        return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n══════════════════════════════════════════════');
        console.log('  🔄 RE-IMPORT: Vendor Payments -> invoices');
        console.log('══════════════════════════════════════════════\n');
        const idMap = loadJson('id_mapping.json');
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const conn = yield pool.getConnection();
        try {
            console.log('  ⚠️  Deleting all old generic Vendor Payments...');
            const [delResult] = yield conn.query(`DELETE FROM invoices WHERE type = 'PAYMENT' AND createdBy = 'Migration'`);
            console.log(`  🗑️  Deleted ${delResult.affectedRows} existing payment records.`);
            console.log('\n  📦 Loading Vendor Payment JSON files...');
            const headers = loadJson('VendorPayment.json');
            const details = loadJson('VendorPayment_Details.json');
            const headerMap = new Map();
            for (const h of headers) {
                headerMap.set(h.ID, h);
            }
            console.log(`  📊 Found ${headers.length} headers, ${details.length} details.`);
            let inserted = 0;
            let skipped = 0;
            let batchValues = [];
            const BATCH_SIZE = 500;
            for (let i = 0; i < details.length; i++) {
                const d = details[i];
                const header = headerMap.get(d.MasterID);
                const date = formatDate((header === null || header === void 0 ? void 0 : header.InvDate) || (header === null || header === void 0 ? void 0 : header.invDate)) || new Date().toISOString().slice(0, 19).replace('T', ' ');
                const partnerOldId = String(d.VendorID || '');
                const partnerId = idMap.partners[partnerOldId] || null;
                const value = safeNum(d.Value || d.value);
                let notes = sanitize(d.Notes);
                // Very important: if the user left notes blank, leave it as '-' so it doesn't look empty and weird, but not generic English text.
                if (!notes) {
                    notes = '-';
                }
                if (!partnerId) {
                    skipped++;
                    continue;
                }
                const invoiceId = (0, crypto_1.randomUUID)();
                // Use the old ERP document number (MasterID) as the invoice number
                const invoiceNumber = String(d.MasterID);
                batchValues.push([
                    invoiceId,
                    invoiceNumber, // e.g. 855650
                    date,
                    'PAYMENT',
                    partnerId,
                    '', // partnerName (will let it be joined later)
                    value,
                    'POSTED', // status
                    'CASH', // paymentMethod
                    notes, // EXACT notes, e.g. 'شيك'
                    'Migration', // createdBy
                    true // posted
                ]);
                if (batchValues.length >= BATCH_SIZE) {
                    yield conn.query(`
                INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, notes, createdBy, posted)
                VALUES ${batchValues.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')}
            `, batchValues.flat());
                    inserted += batchValues.length;
                    batchValues = [];
                }
            }
            // Flush remaining
            if (batchValues.length > 0) {
                yield conn.query(`
            INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, notes, createdBy, posted)
            VALUES ${batchValues.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')}
        `, batchValues.flat());
                inserted += batchValues.length;
            }
            // Fix partner names
            yield conn.query(`
        UPDATE invoices i
        JOIN partners p ON i.partnerId = p.id
        SET i.partnerName = p.name
        WHERE i.type = 'PAYMENT' AND i.createdBy = 'Migration'
    `);
            console.log(`\n  ✅ Successfully injected ${inserted} payments directly into invoices table.`);
            console.log(`  ⏭️  Skipped ${skipped} details due to missing partner mapping.`);
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
