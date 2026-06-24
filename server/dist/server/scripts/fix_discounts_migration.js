"use strict";
/**
 * FIX: Restore Percentage/Value Discount Types to Invoice Lines
 *
 * The initial migration script grabbed the final `discount` monetary value
 * but skipped the `Discount_Type` and `Discount_Percent` fields from the legacy
 * Details.json files. This script surgically updates `invoice_lines` to have
 * `discountType='PERCENT'` and `discountValue=5` where applicable.
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
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n══════════════════════════════════════════════');
        console.log('  🔄 PATCH: Restoring Discount Types & Percents');
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
            // Create lookup map of invoice number -> invoiceId 
            // Because we need to map OLD-1 -> UUID
            console.log('  📦 Loading Invoices from Database...');
            const [invRows] = yield conn.query('SELECT id, number FROM invoices');
            const invLookup = new Map();
            for (const row of invRows) {
                invLookup.set(row.number, row.id);
            }
            console.log(`  📊 Loaded ${invRows.length} invoices into memory.`);
            const filesToProcess = [
                { file: 'BuyInvoice_Details.json', headerFile: 'BuyInvoice.json', prefix: 'OLD-P-', name: 'PURCHASE' },
                { file: 'sellInvoice_Details.json', headerFile: 'sellInvoice.json', prefix: 'OLD-S-', name: 'SALE' },
                { file: 'BuyBackInvoice_Details.json', headerFile: 'BuyBackInvoice.json', prefix: 'OLD-PR-', name: 'RETURN_PURCHASE' },
                { file: 'sellBackInvoice_Details.json', headerFile: 'sellBackInvoice.json', prefix: 'OLD-SR-', name: 'RETURN_SALE' },
            ];
            let updatedLinesCount = 0;
            let missingInvoicesCount = 0;
            for (const task of filesToProcess) {
                console.log(`\n  👉 Processing ${task.name} data from ${task.file}...`);
                try {
                    // Build header map masterId -> invNum
                    const headers = loadJson(task.headerFile);
                    const headerMap = new Map();
                    for (const h of headers) {
                        headerMap.set(h.ID, String(h.invNum || h.ID));
                    }
                    const details = loadJson(task.file);
                    console.log(`     Found ${details.length} details rows. Head Map: ${headerMap.size}`);
                    let updateValues = [];
                    for (const d of details) {
                        const masterId = d.MasterID || d.masterID || d.InvID;
                        const invNumString = headerMap.get(masterId) || String(masterId);
                        const invoiceNumber = `${task.prefix}${invNumString}`;
                        const invoiceId = invLookup.get(invoiceNumber);
                        if (!invoiceId) {
                            if (missingInvoicesCount < 3)
                                console.log(`Debug: Cannot find invoice ID for Number: ${invoiceNumber} (masterId: ${masterId})`);
                            missingInvoicesCount++;
                            continue;
                        }
                        const productOldId = String(d.ItemID || d.itemID);
                        const productId = idMap.products[productOldId];
                        if (!productId) {
                            continue;
                        }
                        const discountTypeParam = d.Discount_Type;
                        const discountPercent = d.Discount_Percent;
                        const discountAmt = Number(d.discount || d.Discount || 0);
                        // MySQL parameters
                        let sqlDiscountType = 'FIXED';
                        let sqlDiscountValue = discountAmt;
                        if (discountTypeParam == 2) { // 2 usually means Percent in this legacy structure
                            sqlDiscountType = 'PERCENT';
                            sqlDiscountValue = Number(discountPercent || 0);
                        }
                        else {
                            // type 1 (Value) or 0/null (None)
                            sqlDiscountType = 'FIXED';
                            sqlDiscountValue = discountAmt;
                        }
                        // We will forcefully update everything to be absolutely sure the values match the exact target data.
                        updateValues.push([sqlDiscountType, sqlDiscountValue, invoiceId, productId]);
                        if (updateValues.length >= 2000) {
                            // Execute batch natively? MySQL promise doesn't natively do batch updates easily
                            // We will run them sequentially in chunks using Promise.all
                            yield updateChunk(conn, updateValues);
                            updatedLinesCount += updateValues.length;
                            updateValues = [];
                        }
                    }
                    if (updateValues.length > 0) {
                        yield updateChunk(conn, updateValues);
                        updatedLinesCount += updateValues.length;
                    }
                    console.log(`     ✅ Processed and matched ${task.name} data.`);
                }
                catch (e) {
                    console.log(`     ⚠️ Skipping ${task.file}: ${e.message}`);
                }
            }
            console.log(`\n  ✅ Successfully updated ${updatedLinesCount} relevant invoice lines with accurate discounting metadata.`);
            if (missingInvoicesCount > 0) {
                console.log(`  🔍 Skipped ${missingInvoicesCount} orphan lines (missing Invoice ID inside DB).`);
            }
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
function updateChunk(conn, batchArgs) {
    return __awaiter(this, void 0, void 0, function* () {
        // Generate a massive CASE statement or run Promise.all
        // Promise.all is safer for complex WHERE matches
        const promises = batchArgs.map(args => {
            return conn.query(`UPDATE invoice_lines SET discountType = ?, discountValue = ? WHERE invoiceId = ? AND productId = ?`, args);
        });
        yield Promise.all(promises);
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
