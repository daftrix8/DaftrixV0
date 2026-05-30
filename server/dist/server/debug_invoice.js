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
function debugInvoice() {
    return __awaiter(this, void 0, void 0, function* () {
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
            const invoiceId = 'PUR-766187';
            console.log(`--- Inspecting Invoice ${invoiceId} ---`);
            // 1. Get Invoice Data
            const [invoices] = yield conn.query(`SELECT * FROM invoices WHERE id = ?`, [invoiceId]);
            if (invoices.length === 0) {
                console.log('Invoice not found!');
                return;
            }
            const invoice = invoices[0];
            console.log('Invoice Basic Data:', {
                id: invoice.id,
                total: invoice.total,
                paidAmount: invoice.paidAmount,
                paymentCollected: invoice.paymentCollected,
                paymentMethod: invoice.paymentMethod,
                bankTransfers: invoice.bankTransfers,
                transactionCheques: invoice.transactionCheques
            });
            // 2. Get Journal Entries
            console.log(`\n--- Journal Entries for ${invoiceId} ---`);
            const [journals] = yield conn.query(`
            SELECT je.id, je.description, je.referenceId, jl.accountId, jl.accountName, jl.debit, jl.credit 
            FROM journal_entries je
            JOIN journal_lines jl ON je.id = jl.journalId
            WHERE je.referenceId = ?
        `, [invoiceId]);
            journals.forEach((j) => {
                console.log(`[${j.accountName}] Dr: ${j.debit}, Cr: ${j.credit}`);
            });
        }
        catch (error) {
            console.error('Error:', error);
        }
        finally {
            yield conn.end();
        }
    });
}
debugInvoice();
