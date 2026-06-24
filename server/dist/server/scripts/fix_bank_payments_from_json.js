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
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'cloud_erp_db',
    charset: 'utf8mb4'
};
function fixBankPayments() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🚀 Starting Bank Payment Fix Script...');
        let conn;
        try {
            conn = yield promise_1.default.createConnection(dbConfig);
            console.log('✅ Connected to database.');
            // 1. Find invoices that might have missing paidAmount
            // Focus on POSTED invoices with paymentMethod BANK, MIXED, CHEQUE
            // where paidAmount is suspiciously low (or 0) compared to calculated amount
            const [rows] = yield conn.query(`
            SELECT id, number, total, paidAmount, paymentMethod, bankTransfers, paymentBreakdown
            FROM invoices
            WHERE status = 'POSTED'
            AND paymentMethod IN ('BANK', 'MIXED', 'CHEQUE')
            AND (paidAmount IS NULL OR paidAmount < total)
        `);
            console.log(`🔍 Found ${rows.length} potential invoices to check.`);
            for (const invoice of rows) {
                let calculatedPaid = 0;
                let logMsg = `Invoice ${invoice.number} (${invoice.paymentMethod}): Current Paid=${invoice.paidAmount}, Total=${invoice.total}`;
                // Parse Bank Transfers
                let bankTotal = 0;
                if (invoice.bankTransfers) {
                    try {
                        const transfers = (typeof invoice.bankTransfers === 'string')
                            ? JSON.parse(invoice.bankTransfers)
                            : invoice.bankTransfers; // Already object if driver parses JSON
                        if (Array.isArray(transfers)) {
                            bankTotal = transfers.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
                        }
                    }
                    catch (e) {
                        console.error(`❌ Error parsing bankTransfers for invoice ${invoice.number}:`, e);
                    }
                }
                // Parse Payment Breakdown
                let cashTotal = 0;
                let chequeTotal = 0;
                if (invoice.paymentBreakdown) {
                    try {
                        const breakdown = (typeof invoice.paymentBreakdown === 'string')
                            ? JSON.parse(invoice.paymentBreakdown)
                            : invoice.paymentBreakdown;
                        cashTotal = Number(breakdown.cash || 0);
                        chequeTotal = Number(breakdown.cheque || 0); // Note: cheques might also be in 'transactionCheques'? invoice controller doesn't save transactionCheques column usually
                    }
                    catch (e) {
                        console.error(`❌ Error parsing paymentBreakdown for invoice ${invoice.number}:`, e);
                    }
                }
                // Calculate Real Paid Amount based on Method
                if (invoice.paymentMethod === 'BANK') {
                    calculatedPaid = bankTotal;
                }
                else if (invoice.paymentMethod === 'MIXED') {
                    calculatedPaid = cashTotal + bankTotal + chequeTotal;
                    // Note: If bankTotal is in breakdown.bank, avoid double counting? 
                    // Usually breakdown.bank IS the bankTotal. 
                    // Let's check if matches.
                    // But invoiceController saves bankTransfers separately. 
                    // InvoiceForm sets breakdown.bank = sum of transfers.
                    // So avoid double adding.
                    // Safe bet: breakdown properties cover everything usually.
                    // BUT wait, Bank Transfers are detailed in `bankTransfers`.
                    // If `bankTransfers` exist, they are definitive for Bank part.
                    // InvoiceForm logic:
                    // breakdown.bank IS updated with total bank amount.
                    // So using breakdown is safer for MIXED.
                    // However, prior to my fix, paymentCollected (and thus breakdown?) might be wrong?
                    // No, breakdown is constructed explicitly in InvoiceForm.
                    // Let's use specific sources if available:
                    // Cash -> breakdown.cash
                    // Bank -> sum(bankTransfers) (more accurate detailed source)
                    // Cheque -> breakdown.cheque (since we don't have cheques column)
                    calculatedPaid = cashTotal + bankTotal + chequeTotal;
                    // Fallback: if bankTotal is 0 but breakdown.bank > 0, use breakdown.bank
                    // (This happens if bankTransfers json is empty but user entered amount in breakdown? unlikely in new UI)
                }
                else if (invoice.paymentMethod === 'CHEQUE') {
                    calculatedPaid = chequeTotal;
                    // If chequeTotal is 0 (breakdown missing), check paidAmount? 
                    // If paidAmount is 0, we are lost unless we have cheques table.
                }
                // Correction logic
                if (calculatedPaid > (Number(invoice.paidAmount) || 0)) {
                    logMsg += ` -> Calculated Real Paid: ${calculatedPaid}`;
                    // Update
                    yield conn.query('UPDATE invoices SET paidAmount = ? WHERE id = ?', [calculatedPaid, invoice.id]);
                    console.log(`✅ ${logMsg} [UPDATED]`);
                    // Check for Missing Receipt Voucher
                    // A receipt voucher is another invoice with type='RECEIPT' and sourceInvoiceId = invoice.id
                    const [receipts] = yield conn.query('SELECT count(*) as count FROM invoices WHERE sourceInvoiceId = ?', [invoice.id]);
                    const receiptCount = receipts[0].count;
                    if (receiptCount === 0) {
                        console.warn(`⚠️  WARNING: Invoice ${invoice.number} has paidAmount=${calculatedPaid} but NO Receipt Voucher found in DB! Accounting Ledger is likely missing this payment.`);
                    }
                    else {
                        console.log(`   (Receipt voucher exists, ledger likely OK)`);
                    }
                }
                else {
                    // console.log(`   ${logMsg} [OK - Matches or Calculated is Lower due to logic mismatch]`);
                }
            }
            console.log('🏁 Script finished.');
        }
        catch (error) {
            console.error('💥 Script failed:', error);
        }
        finally {
            if (conn)
                yield conn.end();
        }
    });
}
fixBankPayments();
