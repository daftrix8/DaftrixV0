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
// Load environment variables
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
function fixInvoicePayments() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Connecting to database...');
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'cloud_erp',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        try {
            console.log('--- Starting Payment Fix Script ---');
            // 1. Find invoices with paidAmount = 0 but paymentMethod is NOT Credit
            const [invoices] = yield conn.query(`
            SELECT id, total, paidAmount, paymentMethod, type 
            FROM invoices 
            WHERE status = 'POSTED' 
            AND paymentMethod IN ('CASH', 'BANK', 'CHEQUE', 'MIXED') 
            AND (paidAmount IS NULL OR paidAmount = 0)
        `);
            console.log(`Found ${invoices.length} invoices to fix.`);
            if (invoices.length === 0) {
                console.log('No invoices need fixing.');
                return;
            }
            let updatedCount = 0;
            for (const invoice of invoices) {
                // Assume full payment for these methods if paidAmount is 0
                // (Since they are POSTED and not CREDIT, they should be fully paid or have a valid paidAmount)
                const correctPaidAmount = Number(invoice.total);
                console.log(`Fixing Invoice ${invoice.id} (${invoice.type}): Amount ${correctPaidAmount} (${invoice.paymentMethod})`);
                yield conn.query(`UPDATE invoices SET paidAmount = ? WHERE id = ?`, [correctPaidAmount, invoice.id]);
                updatedCount++;
            }
            console.log(`--- Finished! Updated ${updatedCount} invoices. ---`);
        }
        catch (error) {
            console.error('Error executing fix:', error);
        }
        finally {
            yield conn.end();
        }
    });
}
fixInvoicePayments();
