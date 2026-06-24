"use strict";
/**
 * FIX: Restore Global Percentage Discount Types to Invoices Table
 *
 * Stage 2: Adds mathematical conversion of flat EGP discounts to globalDiscount
 * and correctly populates the newly added globalDiscountValue column.
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
const loadJson = (filename) => {
    const filePath = path.join(MALI_DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Migration file not found: ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n══════════════════════════════════════════════');
        console.log('  🔄 PATCH STAGE 2: Restoring GLOBAL Discount Values');
        console.log('══════════════════════════════════════════════\n');
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const conn = yield pool.getConnection();
        try {
            console.log('  📦 Loading Invoices from Database...');
            const [invRows] = yield conn.query('SELECT id, number, total, shippingFee, globalDiscount, globalDiscountType FROM invoices');
            const invLookup = new Map();
            for (const row of invRows) {
                invLookup.set(row.number, row);
            }
            console.log(`  📊 Loaded ${invRows.length} invoices into memory.`);
            const filesToProcess = [
                { file: 'BuyInvoice.json', prefix: 'OLD-P-', name: 'PURCHASE' },
                { file: 'sellInvoice.json', prefix: 'OLD-S-', name: 'SALE' },
                { file: 'BuyBackInvoice.json', prefix: 'OLD-PR-', name: 'RETURN_PURCHASE' },
                { file: 'sellBackInvoice.json', prefix: 'OLD-SR-', name: 'RETURN_SALE' },
            ];
            let updatedInvoicesCount = 0;
            let missingInvoicesCount = 0;
            for (const task of filesToProcess) {
                console.log(`\n  👉 Processing ${task.name} headers from ${task.file}...`);
                try {
                    const headers = loadJson(task.file);
                    console.log(`     Found ${headers.length} headers.`);
                    let updateValues = [];
                    for (const h of headers) {
                        const invNumString = String(h.invNum || h.ID);
                        const invoiceNumber = `${task.prefix}${invNumString}`;
                        const invoiceObj = invLookup.get(invoiceNumber);
                        if (!invoiceObj) {
                            missingInvoicesCount++;
                            continue;
                        }
                        const discountTypeParam = h.discountType;
                        const discountAmt = Number(h.invDiscount || h.InvDiscount || 0);
                        let sqlDiscountType = 'FIXED';
                        let sqlDiscountValue = discountAmt;
                        let sqlGlobalDiscountEGP = discountAmt;
                        if (discountTypeParam == 2) {
                            sqlDiscountType = 'PERCENT';
                            sqlDiscountValue = discountAmt;
                            const dbNetTotal = Number(invoiceObj.total || 0);
                            const dbAppliedDiscount = Number(invoiceObj.globalDiscount || 0);
                            const dbShippingFee = Number(invoiceObj.shippingFee || 0);
                            const mathematicalSubtotal = dbNetTotal + dbAppliedDiscount - dbShippingFee;
                            const calculatedEGP = mathematicalSubtotal * (discountAmt / 100);
                            sqlGlobalDiscountEGP = calculatedEGP;
                        }
                        updateValues.push([sqlDiscountType, sqlGlobalDiscountEGP, sqlDiscountValue, invoiceObj.id]);
                        if (updateValues.length >= 2000) {
                            yield updateChunk(conn, updateValues);
                            updatedInvoicesCount += updateValues.length;
                            updateValues = [];
                        }
                    }
                    if (updateValues.length > 0) {
                        yield updateChunk(conn, updateValues);
                        updatedInvoicesCount += updateValues.length;
                    }
                    console.log(`     ✅ Processed and matched ${task.name} headers.`);
                }
                catch (e) {
                    console.log(`     ⚠️ Skipping ${task.file}: ${e.message}`);
                }
            }
            console.log(`\n  ✅ Successfully updated ${updatedInvoicesCount} invoices with correct mathematical discounting logic.`);
            if (missingInvoicesCount > 0) {
                console.log(`  🔍 Skipped ${missingInvoicesCount} orphan headers (missing Invoice ID inside DB).`);
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
        const promises = batchArgs.map(args => {
            return conn.query(`UPDATE invoices SET globalDiscountType = ?, globalDiscount = ?, globalDiscountValue = ? WHERE id = ?`, [args[0], args[1], args[2], args[3]]);
        });
        yield Promise.all(promises);
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
