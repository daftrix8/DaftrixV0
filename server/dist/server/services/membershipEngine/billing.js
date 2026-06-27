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
        return __awaiter(this, arguments, void 0, function* (membershipId, customerId, customerName, packageId, userId, conn, isPaid = false, treasuryAccountId, salesmanId, branchId) {
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
                    paymentMethod, posted, dueDate, notes, createdBy, salesmanId, branchId
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                    invoiceId, invNumber, dateEngine_1.DateEngine.format(dateEngine_1.DateEngine.now(), 'YYYY-MM-DD HH:mm:ss'), types_1.TransactionType.INVOICE_SALE,
                    customerId, customerName, pkg.price, createDraftInvoices ? types_1.InvoiceStatus.DRAFT : types_1.InvoiceStatus.POSTED, types_1.PaymentMethod.CASH,
                    createDraftInvoices ? 0 : 1, dateEngine_1.DateEngine.todayStr(), 'اشتراك: ' + pkg.name, userId || 'System', salesmanId || null, branchId || null
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
                    0, // globalDiscount
                    branchId || null);
                    // If paid immediately, generate a RECEIPT to clear the debt and hit the Treasury Journal
                    if (isPaid) {
                        const receiptId = (0, crypto_1.randomUUID)();
                        const receiptNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, 'REC-');
                        const receiptDate = dateEngine_1.DateEngine.format(dateEngine_1.DateEngine.now(), 'YYYY-MM-DD HH:mm:ss');
                        // 1. Create RECEIPT invoice
                        yield conn.query(`
                        INSERT INTO invoices (
                            id, number, date, type, partnerId, partnerName, total, status, 
                            paymentMethod, posted, notes, createdBy, sourceInvoiceId, salesmanId, branchId
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                            receiptId, receiptNumber, receiptDate, 'RECEIPT',
                            customerId, customerName, safePrice, types_1.InvoiceStatus.POSTED,
                            types_1.PaymentMethod.CASH, 1, 'سداد اشتراك: ' + pkg.name, userId || 'System', invoiceId, salesmanId || null, branchId || null
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
                        yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, branchId) VALUES (?, ?, ?, ?, ?, ?)`, [journalId, receiptDate, `سند قبض نقدي #${receiptNumber} - ${customerName}`, receiptId, userId || 'System', branchId || null]);
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
                // Retrieve invoice to verify if it is fully paid
                const [invoices] = yield conn.query('SELECT total, paidAmount FROM invoices WHERE id = ?', [invoiceId]);
                if (invoices.length > 0) {
                    const inv = invoices[0];
                    const total = Number(inv.total || 0);
                    const paidAmount = Number(inv.paidAmount || 0);
                    // If paid amount is less than total (with 0.01 tolerance for rounding),
                    // do not reactivate membership yet.
                    if (paidAmount < total - 0.01) {
                        if (!providedConn)
                            yield conn.commit();
                        return;
                    }
                }
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
    /**
     * Process recurring billing for memberships (CRON)
     * Finds active RECURRING memberships whose nextBillingDate has arrived,
     * generates a new invoice, shifts billing dates, and optionally changes status to PENDING_PAYMENT.
     */
    static processRecurringBilling(providedConn) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const conn = providedConn || (yield (0, db_1.getConnection)());
            try {
                const todayStr = dateEngine_1.DateEngine.todayStr();
                const query = `
                SELECT m.id, m.customerId, m.salesmanId, m.packageId, m.nextBillingDate, m.endDate,
                       p.name as customerName,
                       pk.name as packageName, pk.price, pk.durationDays, pk.commissionType, pk.commissionValue
                FROM memberships m
                JOIN partners p ON m.customerId = p.id
                JOIN membership_packages pk ON m.packageId = pk.id
                WHERE m.billingType = 'RECURRING'
                  AND m.status = 'ACTIVE'
                  AND m.nextBillingDate <= ?
            `;
                const [dueMemberships] = yield conn.query(query, [todayStr]);
                const [settings] = yield conn.query('SELECT requireInvoicePayment FROM membership_settings WHERE id = 1');
                const requireInvoicePayment = settings.length > 0 ? !!settings[0].requireInvoicePayment : true;
                for (const m of dueMemberships) {
                    const itemConn = providedConn || (yield (0, db_1.getConnection)());
                    if (!providedConn)
                        yield itemConn.beginTransaction();
                    try {
                        const [lockRows] = yield itemConn.query('SELECT status, nextBillingDate FROM memberships WHERE id = ? FOR UPDATE', [m.id]);
                        const statusUpper = ((_a = lockRows[0]) === null || _a === void 0 ? void 0 : _a.status) ? lockRows[0].status.toUpperCase() : '';
                        const nextBillingDateStr = ((_b = lockRows[0]) === null || _b === void 0 ? void 0 : _b.nextBillingDate) ? dateEngine_1.DateEngine.format(lockRows[0].nextBillingDate, 'YYYY-MM-DD') : '';
                        if (lockRows.length === 0 || statusUpper !== 'ACTIVE' || nextBillingDateStr > todayStr) {
                            if (!providedConn) {
                                yield itemConn.rollback();
                                itemConn.release();
                            }
                            continue;
                        }
                        const billingRes = yield this.generateInvoice(m.id, m.customerId, m.customerName, m.packageId, 'System Cron', itemConn, false, undefined, m.salesmanId, undefined // branchId is not tracked on memberships/partners, defaults to null in DB
                        );
                        const lastBillingDate = m.nextBillingDate;
                        const nextBillingDate = dateEngine_1.DateEngine.addDays(lastBillingDate, m.durationDays).format('YYYY-MM-DD');
                        const endDate = nextBillingDate;
                        yield itemConn.query(`UPDATE memberships 
                         SET lastBillingDate = ?, nextBillingDate = ?, endDate = ? 
                         WHERE id = ?`, [lastBillingDate, nextBillingDate, endDate, m.id]);
                        yield lifecycle_1.MembershipLifecycle.addLog(m.id, 'Billing Cycle Processed', `Generated invoice ${billingRes.invoiceId} for next cycle. Next billing: ${nextBillingDate}`, 'System Cron', { invoiceId: billingRes.invoiceId }, itemConn);
                        if (requireInvoicePayment) {
                            yield lifecycle_1.MembershipLifecycle.changeStatus(m.id, 'PENDING_PAYMENT', 'Billing Cycle Invoice Unpaid', `Invoice ${billingRes.invoiceId} generated. Waiting for payment.`, 'System Cron', itemConn);
                        }
                        if (!providedConn)
                            yield itemConn.commit();
                    }
                    catch (err) {
                        if (!providedConn)
                            yield itemConn.rollback();
                        console.error(`Failed to process recurring billing for membership ${m.id}:`, err);
                    }
                    finally {
                        if (!providedConn)
                            itemConn.release();
                    }
                }
            }
            finally {
                if (!providedConn)
                    conn.release();
            }
        });
    }
}
exports.MembershipBilling = MembershipBilling;
