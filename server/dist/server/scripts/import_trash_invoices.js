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
const crypto_1 = require("crypto");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const DATA_DIR = path.resolve(__dirname, '../../mall stuff/New folder (3)/data');
const MAPPING_FILE = path.resolve(__dirname, '../../mall stuff/New folder (3)/id_mapping.json');
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('\n🗑️  Restoring Deleted Invoices from Legacy Recycle Bin (InvoiceTrash.json)');
        const trashFile = path.join(DATA_DIR, 'InvoiceTrash.json');
        if (!fs.existsSync(trashFile)) {
            console.log('No InvoiceTrash.json found.');
            return;
        }
        if (!fs.existsSync(MAPPING_FILE)) {
            console.log('No id_mapping.json found.');
            return;
        }
        const trash = JSON.parse(fs.readFileSync(trashFile, 'utf8'));
        const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        // Connect to DB
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'cloud_erp',
            decimalNumbers: true
        });
        let buyCount = 0;
        let sellCount = 0;
        for (const t of trash) {
            // InvoiceType 1 = Sell, 2 = Buy
            if (t.InvoiceType !== 1 && t.InvoiceType !== 2)
                continue;
            const partnerId = (_a = mapping.partners) === null || _a === void 0 ? void 0 : _a[String(t.PersonID)];
            if (!partnerId)
                continue;
            const type = t.InvoiceType === 1 ? 'INVOICE_SALE' : 'INVOICE_PURCHASE';
            const invoiceNum = parseInt(t.invNum) || 0;
            const total = parseFloat(t.InvNet) || 0;
            const date = t.invDate || new Date().toISOString();
            let prefix = type === 'INVOICE_SALE' ? 'INV' : 'PUR';
            let code = `${prefix}-TRASH-${invoiceNum}-${Date.now().toString().slice(-4)}`;
            const id = (0, crypto_1.randomUUID)();
            // Import as DELETED so they don't break our perfect balance sync!
            yield conn.query(`
            INSERT INTO invoices (
                id, code, type, status, total, subtotal, taxTotal, discountTotal, date, note,
                partnerId, paymentMethod
            ) VALUES (?, ?, ?, 'DELETED', ?, ?, 0, 0, ?, ?, ?, 'CREDIT')
        `, [
                id,
                code,
                type,
                total,
                total,
                date,
                `⚠️ Legacy Deleted Invoice (ID: ${invoiceNum}). Preserved for archiving.`,
                partnerId
            ]);
            if (t.InvoiceType === 1)
                sellCount++;
            else
                buyCount++;
        }
        console.log(`✅ Successfully imported ${sellCount} Sell Invoices and ${buyCount} Buy Invoices as DELETED into Daftrix!`);
        yield conn.end();
    });
}
main().catch(console.error);
