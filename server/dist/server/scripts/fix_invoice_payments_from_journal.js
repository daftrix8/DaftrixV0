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
function fixInvoicePaymentsFromJournal() {
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
            console.log('--- Starting Intelligent Payment Fix Script ---');
            // 1. Find invoices with paidAmount = 0 (or NULL)
            const [invoices] = yield conn.query(`
            SELECT i.id, i.total, i.type, i.paymentMethod 
            FROM invoices i
            WHERE i.status = 'POSTED' 
            AND i.paymentMethod IN ('CASH', 'BANK', 'CHEQUE', 'MIXED')
            AND (i.paidAmount IS NULL OR i.paidAmount = 0)
        `);
            console.log(`Found ${invoices.length} potential invoices to fix.`);
            let updatedCount = 0;
            for (const invoice of invoices) {
                // 2. Get Journal Lines for this invoice
                const [lines] = yield conn.query(`
                SELECT jl.accountName, jl.debit, jl.credit
                FROM journal_entries je
                JOIN journal_lines jl ON je.id = jl.journalId
                WHERE je.referenceId = ?
            `, [invoice.id]);
                if (lines.length === 0) {
                    console.warn(`No journal found for ${invoice.id}, skipping.`);
                    continue;
                }
                let calculatedPayment = 0;
                if (invoice.type === 'INVOICE_SALE' || invoice.type === 'RECEIPT') {
                    // For Sales: Payment is what we RECEIVED (Debit to Cash/Bank/Cheque)
                    // We look for lines that are NOT the AR (Customer) lines and NOT Revenue lines (if distinct)
                    // Or simpler: Look for Debit lines on Cash/Bank accounts
                    // But account names vary.
                    // Alternative: Look for Credit on AR?
                    // Sale: Dr AR, Cr Revenue. 
                    // Payment: Dr Bank, Cr AR.
                    // So Payment = Sum(Credit AR).
                    // We don't know AR account ID easily, but we can guess it's the partner account.
                    // Let's rely on direction. 
                    // If it's a Sale, the 'Main' transaction is Dr AR, Cr Revenue. Total = Dr AR.
                    // The 'Payment' transaction is Dr Bank, Cr AR.
                    // So Total Credit on AR lines = Payment.
                    // BUT, distinguishing AR lines?
                    // Let's use the explicit Payment Method logic:
                    // If Bank: Look for Debit on Bank.
                    // If Cash: Look for Debit on Cash.
                    // If Mixed: Debit on any liquid asset?
                    // Fallback Approach:
                    // Total Invoice = Sum(Dr).
                    // In a simple Invoice+Payment journal:
                    // Dr AR (Net), Dr Bank (Payment), Cr Revenue (Total).
                    // So Revenue = Total.
                    // Payment = Dr Bank.
                    // Dr AR = Total - Payment.
                    // So Sum(Dr) = Revenue = Total. 
                    // Wait. Dr AR + Dr Bank = Total.
                    // So Payment = Total - Dr AR.
                    // This requires identifying AR line.
                    // Let's try: Search for lines with 'Bank' or 'Cash' or ' الصندوق' or 'البنك' in name?
                    // Risky.
                    // Approach 2: Use the logic that Payment = Total - Remaining Debt.
                    // Remaining Debt = Net impact on AR/AP.
                    // For Sale: Net Debit on AR.
                    // Payment = Total - Net Debit on AR.
                    // How to find AR line? It usually has the Partner Name? Or accountName = 'Customers'?
                    // Let's scan lines for Debit amounts that look like payment? 
                    // If invoice.paymentMethod = 'BANK', look for a Debit line that matches?
                    // Let's look for known liquid keywords in accountName for Egypt context
                    lines.forEach((l) => {
                        const name = (l.accountName || '').toLowerCase();
                        if (name.includes('bank') || name.includes('cash') || name.includes('box') || name.includes('treasury') ||
                            name.includes('بنك') || name.includes('خزينة') || name.includes('صندوق') || name.includes('نقدية')) {
                            calculatedPayment += Number(l.debit);
                        }
                    });
                }
                else if (invoice.type === 'INVOICE_PURCHASE' || invoice.type === 'PAYMENT') {
                    // For Purchase: Payment is what we PAID (Credit to Cash/Bank/Cheque)
                    // Purchase: Dr Inventory, Cr AP.
                    // Payment: Dr AP, Cr Bank.
                    // Payment = Sum(Credit Bank).
                    lines.forEach((l) => {
                        const name = (l.accountName || '').toLowerCase();
                        if (name.includes('bank') || name.includes('cash') || name.includes('box') || name.includes('treasury') ||
                            name.includes('بنك') || name.includes('خزينة') || name.includes('صندوق') || name.includes('نقدية')) {
                            calculatedPayment += Number(l.credit);
                        }
                    });
                }
                // Fallback: If calculatedPayment is 0 but method is BANK/CASH, maybe assume Total? 
                // Only if we found NO liquid lines, which implies maybe the journal is just Dr Inv / Cr AP (Full Credit).
                // But query filtered for paymentMethod != Credit.
                // If paymentMethod is Bank but journal has no Bank line -> Data inconsistency.
                // But if we found liquid lines, trust the sum.
                if (calculatedPayment > 0) {
                    console.log(`Updating ${invoice.id}: Paid ${calculatedPayment} (Total ${invoice.total})`);
                    yield conn.query('UPDATE invoices SET paidAmount = ? WHERE id = ?', [calculatedPayment, invoice.id]);
                    updatedCount++;
                }
                else {
                    console.log(`Skipping ${invoice.id}: Could not detect payment in journal (Total ${invoice.total}). Check Manually.`);
                }
            }
            console.log(`--- Finished! Updated ${updatedCount} invoices. ---`);
        }
        catch (error) {
            console.error('Error:', error);
        }
        finally {
            yield conn.end();
        }
    });
}
fixInvoicePaymentsFromJournal();
