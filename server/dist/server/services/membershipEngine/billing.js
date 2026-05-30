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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MembershipBilling = void 0;
const db_1 = require("../../db");
const types_1 = require("../../../types");
const lifecycle_1 = require("./lifecycle");
const crypto_1 = require("crypto");
const invoiceNumberGenerator_1 = require("../../utils/invoiceNumberGenerator");
const decimalUtils_1 = require("../../utils/decimalUtils");
const dateEngine_1 = require("../../utils/dateEngine");
const invoiceController_1 = require("../../controllers/invoiceController");
class MembershipBilling {
    /**
     * Generates a new invoice for a membership (creation or renewal)
     */
    static generateInvoice(membershipId_1, customerId_1, customerName_1, packageId_1, userId_1, conn_1) {
        return __awaiter(this, arguments, void 0, function* (membershipId, customerId, customerName, packageId, userId, conn, isPaid = false, treasuryAccountId) {
            // We require conn to be passed from the transaction
            try {
                // Get package details
                const [packages] = yield conn.query('SELECT id, name, price, durationDays, includedVisits FROM membership_packages WHERE id = ?', [packageId]);
                if (packages.length === 0)
                    throw new Error('Package not found');
                const pkg = packages[0];
                // Get Settings
                const [settings] = yield conn.query('SELECT createDraftInvoices FROM membership_settings WHERE id = 1');
                const createDraftInvoices = settings.length > 0 && settings[0].createDraftInvoices;
                const invoiceId = (0, crypto_1.randomUUID)();
                // Task 10: Use InvoiceNumberGenerator instead of Date.now()
                const invNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, 'MEM-');
                const status = createDraftInvoices ? types_1.InvoiceStatus.DRAFT : types_1.InvoiceStatus.POSTED;
                // Task 5: Money System Safety
                const safePrice = (0, decimalUtils_1.toNum)((0, decimalUtils_1.D)(pkg.price));
                // Create Invoice
                yield conn.query(`
                INSERT INTO invoices (
                    id, number, date, type, partnerId, partnerName, total, status, 
                    paymentMethod, posted, dueDate, notes, createdBy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                    invoiceId, invNumber, dateEngine_1.DateEngine.format(dateEngine_1.DateEngine.now(), 'YYYY-MM-DD HH:mm:ss'), types_1.TransactionType.INVOICE_SALE,
                    customerId, customerName, pkg.price, createDraftInvoices ? types_1.InvoiceStatus.DRAFT : types_1.InvoiceStatus.POSTED, types_1.PaymentMethod.CASH,
                    createDraftInvoices ? 0 : 1, dateEngine_1.DateEngine.todayStr(), 'اشتراك: ' + pkg.name, userId || 'System'
                ]);
                // Create Invoice Line
                yield conn.query(`
                INSERT INTO invoice_lines (invoiceId, productName, quantity, price, total)
                VALUES (?, ?, ?, ?, ?)
            `, [invoiceId, 'اشتراك: ' + pkg.name, 1, safePrice, safePrice]);
                // Link Invoice to Membership
                yield conn.query('UPDATE memberships SET invoiceId = ? WHERE id = ?', [invoiceId, membershipId]);
                // Sync with GL to hit statements (Revenue & COGS)
                if (status === types_1.InvoiceStatus.POSTED) {
                    yield (0, invoiceController_1.syncRevenueCogsJournal)(conn, invoiceId, invNumber, types_1.TransactionType.INVOICE_SALE, dateEngine_1.DateEngine.format(dateEngine_1.DateEngine.now(), 'YYYY-MM-DD HH:mm:ss'), customerName, safePrice, [{ quantity: 1, cost: 0, returnCondition: null }], userId || 'System', false, // reserveOnSale
                    false, // isCashInvoice
                    0 // globalDiscount
                    );
                    // If paid immediately, generate a RECEIPT to clear the debt and hit the Treasury Journal
                    if (isPaid) {
                        const receiptId = (0, crypto_1.randomUUID)();
                        const receiptNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, 'REC-');
                        const receiptDate = dateEngine_1.DateEngine.format(dateEngine_1.DateEngine.now(), 'YYYY-MM-DD HH:mm:ss');
                        // 1. Create RECEIPT invoice
                        yield conn.query(`
                        INSERT INTO invoices (
                            id, number, date, type, partnerId, partnerName, total, status, 
                            paymentMethod, posted, notes, createdBy, sourceInvoiceId
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                            receiptId, receiptNumber, receiptDate, 'RECEIPT',
                            customerId, customerName, safePrice, types_1.InvoiceStatus.POSTED,
                            types_1.PaymentMethod.CASH, 1, 'سداد اشتراك: ' + pkg.name, userId || 'System', invoiceId
                        ]);
                        // 2. Update the parent invoice paid amount
                        yield conn.query('UPDATE invoices SET paidAmount = ? WHERE id = ?', [safePrice, invoiceId]);
                        // 3. Create Treasury Journal Entry
                        const journalId = (0, crypto_1.randomUUID)();
                        // Get cash/treasury account — use provided account if available
                        let cashAcc = { id: '101', name: 'الخزينة الرئيسية' };
                        if (treasuryAccountId) {
                            try {
                                const [accs] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ?`, [treasuryAccountId]);
                                if (accs.length > 0)
                                    cashAcc = accs[0];
                            }
                            catch (e) { }
                        }
                        else {
                            try {
                                const [accs] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '101%' LIMIT 1`);
                                if (accs.length > 0)
                                    cashAcc = accs[0];
                            }
                            catch (e) { }
                        }
                        // Get partner account
                        let partnerAccOut = { id: '104', name: 'العملاء' };
                        try {
                            const [accs] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '104%' LIMIT 1`);
                            if (accs.length > 0)
                                partnerAccOut = accs[0];
                        }
                        catch (e) { }
                        yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy) VALUES (?, ?, ?, ?, ?)`, [journalId, receiptDate, `سند قبض نقدي #${receiptNumber} - ${customerName}`, receiptId, userId || 'System']);
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`, [
                            journalId, cashAcc.id, cashAcc.name, safePrice, 0,
                            journalId, partnerAccOut.id, partnerAccOut.name, 0, safePrice
                        ]);
                    }
                }
                return { invoiceId, status, price: safePrice };
            }
            catch (error) {
                throw error;
            }
        });
    }
    /**
     * Called when an invoice linked to a membership gets PAID.
     * Activates the membership if it is currently 'PENDING_PAYMENT'.
     */
    static handleInvoicePaid(invoiceId, providedConn) {
        return __awaiter(this, void 0, void 0, function* () {
            const conn = providedConn || (yield (0, db_1.getConnection)());
            if (!providedConn)
                yield conn.beginTransaction();
            try {
                const [memberships] = yield conn.query('SELECT id, status FROM memberships WHERE invoiceId = ? AND status = ?', [invoiceId, 'PENDING_PAYMENT']);
                // Idempotency: If no memberships are PENDING_PAYMENT, we skip cleanly
                for (const m of memberships) {
                    yield lifecycle_1.MembershipLifecycle.changeStatus(m.id, 'ACTIVE', 'Invoice Paid - Auto Activation', 'Invoice marked as PAID', 'System', conn);
                }
                if (!providedConn)
                    yield conn.commit();
            }
            catch (error) {
                if (!providedConn)
                    yield conn.rollback();
                throw error;
            }
            finally {
                if (!providedConn)
                    conn.release();
            }
        });
    }
}
exports.MembershipBilling = MembershipBilling;
