"use strict";
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
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
function fixLongInvoiceNumbers() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Connecting to Database...");
        const connection = yield promise_1.default.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'admin123',
            database: process.env.DB_NAME || 'cloud_erp',
        });
        try {
            yield connection.beginTransaction();
            const updates = [
                { old: 'INVOICE_SALE', new: 'INV-' },
                { old: 'SALE_INVOICE', new: 'INV-' },
                { old: 'INVOICE_PURCHASE', new: 'PUR-' },
                { old: 'PURCHASE_INVOICE', new: 'PUR-' },
                { old: 'RETURN_SALE', new: 'RET-S-' },
                { old: 'SALE_RETURN', new: 'RET-S-' },
                { old: 'RETURN_PURCHASE', new: 'RET-P-' },
                { old: 'PURCHASE_RETURN', new: 'RET-P-' },
            ];
            let totalFixed = 0;
            for (const mapping of updates) {
                // Find invoices starting with the long prefix
                const [rows] = yield connection.execute(`SELECT id, number FROM invoices WHERE number LIKE ?`, [`${mapping.old}%`]);
                if (rows.length > 0) {
                    console.log(`Found ${rows.length} invoices with prefix ${mapping.old}. Fixing to ${mapping.new}...`);
                    for (const row of rows) {
                        const newNumber = row.number.replace(mapping.old, mapping.new);
                        yield connection.execute(`UPDATE invoices SET number = ? WHERE id = ?`, [newNumber, row.id]);
                        totalFixed++;
                    }
                }
            }
            yield connection.commit();
            console.log(`✅ Successfully fixed ${totalFixed} long invoice numbers!`);
        }
        catch (e) {
            yield connection.rollback();
            console.error("Error fixing invoice numbers!", e);
        }
        finally {
            yield connection.end();
        }
    });
}
fixLongInvoiceNumbers();
