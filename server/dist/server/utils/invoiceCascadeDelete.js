"use strict";
/**
 * Invoice Cascade Delete Utility
 *
 * This module handles the complete deletion of an invoice along with all its
 * related documents:
 * - سند القبض (RECEIPT) - Cash receipts created with the invoice
 * - سند الصرف (PAYMENT) - Payment vouchers created with the invoice
 * - Journal Entries - Accounting entries for the invoice and its payments
 * - Account Transactions - Partner account movements
 * - Bank Transactions - Bank transfer records
 *
 * All deletions are performed within a single transaction for atomicity.
 */
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
exports.findRelatedDocuments = findRelatedDocuments;
exports.releaseInvoiceReservations = releaseInvoiceReservations;
exports.deleteInvoiceWithCascade = deleteInvoiceWithCascade;
exports.previewCascadeDelete = previewCascadeDelete;
const crypto_1 = require("crypto");
/**
 * Find all related documents linked to an invoice
 */
function findRelatedDocuments(conn, invoiceId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        // Use COLLATE to handle potential collation mismatches in MariaDB
        const collate = 'COLLATE utf8mb4_unicode_ci';
        // Find linked RECEIPT documents
        // FIX (Bug #7): Removed dangerous LIKE '%8-char-uuid%' fallback.
        // It could match unrelated invoices sharing UUID prefixes, causing cascading data destruction.
        // sourceInvoiceId and referenceInvoiceId FK columns are sufficient.
        const [receipts] = yield conn.query(`
        SELECT id, number, total, partnerId, partnerName, type FROM invoices 
        WHERE type = 'RECEIPT' AND (
            sourceInvoiceId ${collate} = ? ${collate}
            OR referenceInvoiceId ${collate} = ? ${collate}
        )
    `, [invoiceId, invoiceId]);
        // Find linked PAYMENT documents
        const [payments] = yield conn.query(`
        SELECT id, number, total, partnerId, partnerName, type FROM invoices 
        WHERE type = 'PAYMENT' AND (
            sourceInvoiceId ${collate} = ? ${collate}
            OR referenceInvoiceId ${collate} = ? ${collate}
        )
    `, [invoiceId, invoiceId]);
        // Find linked journal entries by referenceId (the reliable linkage column)
        // NOTE: journal_entries does NOT have sourceInvoiceId — only referenceId.
        // referenceId = invoice.id for inline payments, or invoice.number (PAY-XXXXX) for standalone vouchers.
        let journals = [];
        try {
            const [jRows] = yield conn.query(`
            SELECT je.id, je.description, je.referenceId, je.date FROM journal_entries je
            WHERE je.referenceId ${collate} = ? ${collate}
            OR je.referenceId ${collate} IN (SELECT number ${collate} FROM invoices WHERE id ${collate} = ? ${collate})
        `, [invoiceId, invoiceId]);
            journals = jRows;
            console.log(`🔍 [CascadeDelete] Found ${journals.length} journal entries for invoiceId=${invoiceId} (referenceId match)`);
            if (journals.length > 0) {
                console.log(`   Journal IDs: ${journals.map(j => { var _a; return (_a = j.id) === null || _a === void 0 ? void 0 : _a.substring(0, 8); }).join(', ')}`);
                console.log(`   ReferenceIds: ${journals.map(j => j.referenceId).join(', ')}`);
            }
        }
        catch (err) {
            console.error('❌ [CascadeDelete] CRITICAL: Could not find journals for invoiceId=' + invoiceId + ':', err.message);
        }
        // Find linked account transactions (invoiceId column may not exist on older DBs)
        let transactions = [];
        try {
            const [txRows] = yield conn.query(`
            SELECT id, invoiceId, partnerId, debit, credit FROM account_transactions
            WHERE invoiceId ${collate} = ? ${collate} OR invoiceId ${collate} IN (
                SELECT id FROM invoices WHERE sourceInvoiceId ${collate} = ? ${collate} OR referenceInvoiceId ${collate} = ? ${collate}
            )
        `, [invoiceId, invoiceId, invoiceId]);
            transactions = txRows;
        }
        catch (err) {
            // Fallback: invoiceId column doesn't exist on this DB version
            // SECURITY: Do NOT use LIKE '%uuid-prefix%' as a fallback — a UUID prefix
            // match can destroy unrelated records under concurrent load.
            console.warn('⚠️ [CascadeDelete] account_transactions.invoiceId query failed (column may not exist):', err.message);
            console.warn('   ℹ️ Skipping account_transactions cleanup for invoiceId=' + invoiceId);
            // Leave transactions empty — better to skip than risk deleting unrelated records
        }
        // Find linked bank transactions (table may not exist)
        let bankTransactions = [];
        try {
            const [bankTx] = yield conn.query(`
            SELECT id, bankId, amount, type FROM bank_transactions
            WHERE invoiceId ${collate} = ? ${collate}
        `, [invoiceId]);
            bankTransactions = bankTx;
        }
        catch (err) {
            // Table doesn't exist - ignore
            if (!((_a = err.message) === null || _a === void 0 ? void 0 : _a.includes("doesn't exist"))) {
                console.warn('Warning checking bank_transactions:', err.message);
            }
        }
        return {
            receipts: receipts,
            payments: payments,
            journals,
            transactions,
            bankTransactions
        };
    });
}
/**
 * Archive an invoice before deletion (for audit trail)
 */
function archiveInvoice(conn, invoice, deletedBy) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const archiveId = (0, crypto_1.randomUUID)();
        try {
            // Archive the main invoice (table may not exist on older clients)
            yield conn.query(`
            INSERT INTO deleted_invoices (
                id, original_id, date, type, partnerId, partnerName, total, 
                status, paymentMethod, posted, notes, dueDate, taxAmount, whtAmount, 
                shippingFee, globalDiscount, warehouseId, costCenterId, paidAmount, 
                bankAccountId, bankName, paymentBreakdown, salesmanId, createdBy, 
                deletedBy, deletedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
                archiveId, invoice.id, invoice.date, invoice.type, invoice.partnerId, invoice.partnerName,
                invoice.total, invoice.status, invoice.paymentMethod, invoice.posted, invoice.notes,
                invoice.dueDate, invoice.taxAmount, invoice.whtAmount, invoice.shippingFee,
                invoice.globalDiscount, invoice.warehouseId, invoice.costCenterId, invoice.paidAmount,
                invoice.bankAccountId, invoice.bankName, invoice.paymentBreakdown, invoice.salesmanId,
                invoice.createdBy, deletedBy
            ]);
            // Archive invoice lines
            const [lines] = yield conn.query('SELECT * FROM invoice_lines WHERE invoiceId = ?', [invoice.id]);
            for (const line of lines) {
                yield conn.query(`
                INSERT INTO deleted_invoice_lines (
                    deletedInvoiceId, originalInvoiceId, productId, productName, 
                    quantity, price, cost, discount, total, hasWarranty, inBranchInstallation, warrantyMonths
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [archiveId, invoice.id, line.productId, line.productName,
                    line.quantity, line.price, line.cost, line.discount, line.total, line.hasWarranty || 0, line.inBranchInstallation || 0, line.warrantyMonths || 0]);
            }
        }
        catch (err) {
            // Only swallow "table doesn't exist" errors — archive tables may not exist on older clients.
            // Any other error (data too long, FK violation on deleted_invoices, etc.) must propagate
            // so the user knows the audit trail was NOT created before deletion.
            if (((_a = err.message) === null || _a === void 0 ? void 0 : _a.includes("doesn't exist")) || err.code === 'ER_NO_SUCH_TABLE') {
                console.warn('⚠️ Could not archive invoice (archive tables not created yet):', err.message);
            }
            else {
                console.error('❌ [CascadeDelete] Archive failed for non-schema reason — propagating:', err.message);
                throw err;
            }
        }
        return archiveId;
    });
}
/**
 * Reverse partner balance changes from an invoice
 */
function reversePartnerBalance(conn, invoice, linkedDocs) {
    return __awaiter(this, void 0, void 0, function* () {
        const reversals = [];
        if (!invoice.partnerId)
            return reversals;
        // Parse voucherCategory — it's NOT a DB column, it's stored in the notes field
        // as "category|partnerId" (e.g. "expenses|abc-123" or "salary|emp-456")
        const voucherCategory = invoice.voucherCategory || (() => {
            if (invoice.notes && typeof invoice.notes === 'string') {
                const parts = invoice.notes.split('|');
                if (['supplier', 'expenses', 'employee_advance', 'employee_repay',
                    'salary', 'labour', 'customer', 'supplier_refund'].includes(parts[0])) {
                    return parts[0];
                }
            }
            return '';
        })();
        // Calculate total amount to reverse based on invoice type
        let reverseAmount = 0;
        // Main invoice affects partner balance based on type
        const isSale = ['INVOICE_SALE', 'SALE_INVOICE'].includes(invoice.type);
        const isPurchase = ['INVOICE_PURCHASE', 'PURCHASE_INVOICE'].includes(invoice.type);
        const isReturnSale = ['RETURN_SALE'].includes(invoice.type);
        const isReturnPurchase = ['RETURN_PURCHASE'].includes(invoice.type);
        if (isSale) {
            // Sales increase partner balance (they owe us) → reverse = subtract
            reverseAmount = -Number(invoice.total || 0);
        }
        else if (isPurchase) {
            // Purchases decrease partner balance (we owe them) → reverse = add back
            reverseAmount = Number(invoice.total || 0);
        }
        else if (isReturnSale) {
            // Return sales decrease partner balance (we owe them refund) → reverse = add back
            reverseAmount = Number(invoice.total || 0);
        }
        else if (isReturnPurchase) {
            // Return purchases increase partner balance (they owe us refund) → reverse = subtract
            reverseAmount = -Number(invoice.total || 0);
        }
        else if (invoice.type === 'RECEIPT') {
            // Standalone receipt: decreased partner balance → reverse = add back
            // Only for real partner categories (not employee_repay, etc.)
            if (!voucherCategory || voucherCategory === 'customer') {
                reverseAmount = Number(invoice.total || 0);
            }
            else if (voucherCategory === 'supplier_refund') {
                reverseAmount = -Number(invoice.total || 0);
            }
            // employee_repay: no partner balance to reverse
        }
        else if (invoice.type === 'PAYMENT') {
            // Standalone payment: increased partner balance → reverse = subtract
            if (!voucherCategory || voucherCategory === 'supplier' || voucherCategory === 'labour') {
                reverseAmount = -Number(invoice.total || 0);
            }
            // expenses, salary, employee_advance: no partner balance to reverse
        }
        // Linked receipts/payments (auto-generated from invoices with partial payment)
        for (const doc of linkedDocs) {
            if (doc.type === 'RECEIPT') {
                reverseAmount += Number(doc.total || 0); // Undo the reduction
            }
            else if (doc.type === 'PAYMENT') {
                reverseAmount -= Number(doc.total || 0); // Undo the increase
            }
        }
        if (reverseAmount !== 0) {
            yield conn.query('UPDATE partners SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [reverseAmount, invoice.partnerId]);
            reversals.push({ partnerId: invoice.partnerId, amount: reverseAmount });
        }
        return reversals;
    });
}
/**
 * Reverse bank balance changes
 */
function reverseBankBalances(conn, bankTransactions) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const tx of bankTransactions) {
            if (!tx.bankId)
                continue;
            // Reverse the bank balance change
            const reverseAmount = tx.type === 'RECEIPT' || tx.type === 'DEPOSIT'
                ? -Number(tx.amount)
                : Number(tx.amount);
            yield conn.query('UPDATE banks SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [reverseAmount, tx.bankId]);
        }
    });
}
/**
 * Update account balances after deleting journal entries.
 * Delegates to the correct utility that handles openingBalance + account type.
 */
function updateAccountBalances(conn, journalIds) {
    return __awaiter(this, void 0, void 0, function* () {
        if (journalIds.length === 0)
            return;
        // Get all affected account IDs from the journals being deleted
        const placeholders = journalIds.map(() => '?').join(',');
        const [affectedAccounts] = yield conn.query(`
        SELECT DISTINCT accountId FROM journal_lines 
        WHERE journalId IN (${placeholders})
    `, journalIds);
        const accountIds = affectedAccounts.map(a => a.accountId);
        if (accountIds.length === 0)
            return;
        // Use the correct utility that respects openingBalance + debit/credit-normal account types
        const { updateAccountBalancesFromJournal } = require('./accountBalanceUtils');
        yield updateAccountBalancesFromJournal(conn, accountIds);
    });
}
/**
/**
 * Release stock reservations for an invoice
 */
function releaseInvoiceReservations(conn, invoiceId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [reservations] = yield conn.query(`SELECT productId, warehouseId, quantity FROM stock_reservations 
             WHERE invoiceId = ? AND status = 'RESERVED'`, [invoiceId]);
            if (reservations.length > 0) {
                console.log(`📦 [Reservations] Releasing ${reservations.length} reservations for invoice ${invoiceId}`);
                for (const res of reservations) {
                    const qty = Number(res.quantity) || 0;
                    if (qty > 0 && res.productId && res.warehouseId) {
                        yield conn.query(`UPDATE product_stocks 
                         SET reserved_stock = ROUND(GREATEST(0, reserved_stock - ?), 5) 
                         WHERE productId = ? AND warehouseId = ?`, [qty, res.productId, res.warehouseId]);
                    }
                }
                yield conn.query(`DELETE FROM stock_reservations WHERE invoiceId = ?`, [invoiceId]);
            }
        }
        catch (err) {
            console.warn(`⚠️ [Reservations] Error releasing reservations for invoice ${invoiceId}:`, err.message);
        }
    });
}
/**
 * Main cascade delete function
 *
 * Deletes an invoice and all its related documents in the correct order:
 * 1. Release reservations
 * 2. Invalidate cache
 * 3. Archive everything for audit trail
 * 4. Delete bank transactions
 * 5. Delete account transactions
 * 6. Delete journal lines, then journal entries
 * 7. Delete linked RECEIPT/PAYMENT invoices
 * 8. Reverse partner/bank balances
 * 9. Delete the main invoice and its lines
 */
function deleteInvoiceWithCascade(conn, invoiceId, deletedBy) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        const result = {
            success: false,
            invoiceId,
            deletedReceipts: 0,
            deletedPayments: 0,
            deletedJournals: 0,
            deletedTransactions: 0,
            deletedStockMovements: 0,
            reversedBalances: [],
            reversedStock: []
        };
        try {
            // 1. Get the main invoice
            const [invoiceRows] = yield conn.query('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
            const invoice = invoiceRows[0];
            if (!invoice) {
                result.error = 'Invoice not found';
                return result;
            }
            console.log(`🗑️ [CascadeDelete] Starting cascade delete for invoice ${invoiceId} (${invoice.type})`);
            // 1b. Release reservations if any
            yield releaseInvoiceReservations(conn, invoiceId);
            // 1c. Invalidate cache dynamically
            try {
                const { invalidateInvoiceCache } = require('../controllers/invoiceController');
                if (invalidateInvoiceCache) {
                    invalidateInvoiceCache(invoiceId, invoice.number);
                }
            }
            catch (e) {
                // Ignore circular require issues during bootstrap
            }
            // 2. Find all related documents
            const related = yield findRelatedDocuments(conn, invoiceId);
            console.log(`📋 Found: ${related.receipts.length} receipts, ${related.payments.length} payments, ${related.journals.length} journals`);
            // 3. Archive the main invoice
            const archiveId = yield archiveInvoice(conn, invoice, deletedBy);
            result.archivedAt = archiveId;
            // ══════════════════════════════════════════════════════════
            // CONCURRENCY FIX: Collect ALL affected account IDs across
            // the entire cascade delete, then do ONE SINGLE balance
            // recalculation at the end. Previously we called
            // updateAccountBalancesFromJournal N+1 times (once per linked
            // doc + once for main journals), causing concurrent UPDATEs
            // on the same accounts rows → ER_CHECKREAD (errno 1020).
            // ══════════════════════════════════════════════════════════
            const allAffectedAccountIds = new Set();
            // 4. Archive and delete linked RECEIPT/PAYMENT documents
            const allLinkedDocs = [...related.receipts, ...related.payments];
            for (const doc of allLinkedDocs) {
                // Archive first
                yield archiveInvoice(conn, doc, deletedBy);
                // Delete account transactions for this document
                try {
                    yield conn.query('DELETE FROM account_transactions WHERE invoiceId = ?', [doc.id]);
                }
                catch (e) {
                    console.warn('⚠️ Could not delete account_transactions for doc:', e.message);
                }
                // Delete payment allocations for this linked document
                try {
                    yield conn.query('DELETE FROM payment_allocations WHERE paymentId = ? OR invoiceId = ?', [doc.id, doc.id]);
                }
                catch (e) {
                    console.warn('⚠️ Could not delete payment_allocations for linked doc:', e.message);
                }
                // ✅ FIX: Delete journal entries for this linked document
                // The journal entries are referenced by the receipt number (e.g., RCV-VAN-2026-00006)
                // NOTE: journal_entries does NOT have sourceInvoiceId — only referenceId.
                try {
                    const collate = 'COLLATE utf8mb4_unicode_ci';
                    const [docJournals] = yield conn.query(`
                    SELECT je.id FROM journal_entries je
                    WHERE je.referenceId ${collate} = ? ${collate}
                    OR je.referenceId ${collate} = (SELECT number ${collate} FROM invoices WHERE id ${collate} = ? ${collate})
                `, [doc.id, doc.id]);
                    if (docJournals.length > 0) {
                        const journalIdsToDelete = docJournals.map((j) => j.id);
                        const phld = journalIdsToDelete.map(() => '?').join(',');
                        // Collect affected account IDs before deleting (add to unified set)
                        const [affAccts] = yield conn.query(`SELECT DISTINCT accountId FROM journal_lines WHERE journalId IN (${phld})`, journalIdsToDelete);
                        for (const a of affAccts) {
                            allAffectedAccountIds.add(a.accountId);
                        }
                        // Delete journal lines and entries
                        yield conn.query(`DELETE FROM journal_lines WHERE journalId IN (${phld})`, journalIdsToDelete);
                        yield conn.query(`DELETE FROM journal_entries WHERE id IN (${phld})`, journalIdsToDelete);
                        console.log(`📚 Deleted ${journalIdsToDelete.length} journal entries for linked ${doc.type} ${doc.number || doc.id}`);
                    }
                    else {
                        console.log(`ℹ️ No journal entries found for linked ${doc.type} ${doc.number || doc.id}`);
                    }
                }
                catch (err) {
                    console.error('❌ [CascadeDelete] FAILED to delete journal entries for linked doc:', err.message);
                }
                // ✅ FIX: Also delete bank_transactions for linked receipts/payments
                // This is where mobile invoice payments (تحصيل بيع متنقل) are stored
                try {
                    // Find and reverse bank balances for this document
                    const [docBankTx] = yield conn.query('SELECT id, bankId, amount, type FROM bank_transactions WHERE invoiceId = ?', [doc.id]);
                    yield reverseBankBalances(conn, docBankTx);
                    yield conn.query('DELETE FROM bank_transactions WHERE invoiceId = ?', [doc.id]);
                    console.log(`🏦 Deleted bank_transactions for linked ${doc.type} ${doc.id}`);
                }
                catch (err) {
                    if (!((_a = err.message) === null || _a === void 0 ? void 0 : _a.includes("doesn't exist"))) {
                        console.warn('Warning deleting bank_transactions for linked doc:', err.message);
                    }
                }
                // Delete the document
                yield conn.query('DELETE FROM invoice_lines WHERE invoiceId = ?', [doc.id]);
                yield conn.query('DELETE FROM invoices WHERE id = ?', [doc.id]);
            }
            result.deletedReceipts = related.receipts.length;
            result.deletedPayments = related.payments.length;
            // 5. Delete account transactions for main invoice
            try {
                yield conn.query('DELETE FROM account_transactions WHERE invoiceId = ?', [invoiceId]);
            }
            catch (e) {
                console.warn('⚠️ Could not delete account_transactions for main invoice:', e.message);
            }
            // Delete payment allocations for main invoice
            try {
                yield conn.query('DELETE FROM payment_allocations WHERE paymentId = ? OR invoiceId = ?', [invoiceId, invoiceId]);
            }
            catch (e) {
                console.warn('⚠️ Could not delete payment_allocations for main invoice:', e.message);
            }
            result.deletedTransactions = related.transactions.length;
            // 6. Collect journal IDs and delete journals
            const journalIds = related.journals.map((j) => j.id);
            if (journalIds.length > 0) {
                // Collect affected account IDs BEFORE deleting journals (add to unified set)
                const mainPlaceholders = journalIds.map(() => '?').join(',');
                const [mainAffAccts] = yield conn.query(`SELECT DISTINCT accountId FROM journal_lines WHERE journalId IN (${mainPlaceholders})`, journalIds);
                for (const a of mainAffAccts) {
                    allAffectedAccountIds.add(a.accountId);
                }
                // Delete journal lines then entries
                // MVCC FIX: MariaDB can throw "Record has changed since last read" (errno 1020)
                // when another transaction touches the same rows concurrently. Retry up to 3 times.
                const MAX_RETRIES = 3;
                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        yield conn.query(`DELETE FROM journal_lines WHERE journalId IN (${mainPlaceholders})`, journalIds);
                        yield conn.query(`DELETE FROM journal_entries WHERE id IN (${mainPlaceholders})`, journalIds);
                        break; // Success — exit retry loop
                    }
                    catch (delErr) {
                        const isRetryable = ((_b = delErr.message) === null || _b === void 0 ? void 0 : _b.includes('Record has changed since last read'))
                            || delErr.errno === 1020;
                        if (isRetryable && attempt < MAX_RETRIES) {
                            console.warn(`⚠️ [CascadeDelete] MVCC conflict on journal delete (attempt ${attempt}/${MAX_RETRIES}), retrying...`);
                            yield new Promise(r => setTimeout(r, 100 * attempt));
                        }
                        else {
                            throw delErr;
                        }
                    }
                }
            }
            result.deletedJournals = journalIds.length;
            // 6b. SINGLE account balance recalculation for ALL affected accounts
            // This replaces the N+1 separate calls that caused ER_CHECKREAD conflicts
            if (allAffectedAccountIds.size > 0) {
                const { updateAccountBalancesFromJournal } = require('./accountBalanceUtils');
                const uniqueAcctIds = Array.from(allAffectedAccountIds);
                console.log(`💰 [CascadeDelete] Recalculating balances for ${uniqueAcctIds.length} affected accounts (single batch)`);
                yield updateAccountBalancesFromJournal(conn, uniqueAcctIds);
            }
            // 7. Reverse bank balances
            yield reverseBankBalances(conn, related.bankTransactions);
            // Delete bank transactions (table may not exist)
            try {
                yield conn.query('DELETE FROM bank_transactions WHERE invoiceId = ?', [invoiceId]);
            }
            catch (err) {
                if (!((_c = err.message) === null || _c === void 0 ? void 0 : _c.includes("doesn't exist"))) {
                    console.warn('Warning deleting bank_transactions:', err.message);
                }
            }
            // 8. Reverse partner balances
            result.reversedBalances = yield reversePartnerBalance(conn, invoice, allLinkedDocs);
            // 9. Restore vehicle inventory for VAN sales (بيع متنقل)
            // If this is a VAN sale invoice, return the items to the vehicle
            const isVanSale = invoice.number && invoice.number.startsWith('VAN-');
            console.log(`🚗 [CascadeDelete] VAN sale check: number=${invoice.number}, isVanSale=${isVanSale}, salesmanId=${invoice.salesmanId}`);
            if (isVanSale) {
                let vehicleId = null;
                // Method 1: Find the customer_visit to get the vehicleId (may not exist on server)
                try {
                    const [visits] = yield conn.query('SELECT vehicleId FROM vehicle_customer_visits WHERE invoiceId = ? LIMIT 1', [invoiceId]);
                    const visit = visits[0];
                    if (visit && visit.vehicleId) {
                        vehicleId = visit.vehicleId;
                        console.log(`🔍 [CascadeDelete] Found vehicleId from customer_visits: ${vehicleId}`);
                    }
                }
                catch (e) {
                    // Table may not exist on server
                    console.log(`ℹ️ [CascadeDelete] vehicle_customer_visits table not found`);
                }
                // Method 2: Fallback - find vehicle by salesmanId
                if (!vehicleId && invoice.salesmanId) {
                    try {
                        const [vehicles] = yield conn.query('SELECT id FROM vehicles WHERE salesmanId = ? LIMIT 1', [invoice.salesmanId]);
                        const vehicle = vehicles[0];
                        if (vehicle) {
                            vehicleId = vehicle.id;
                            console.log(`🔍 [CascadeDelete] Found vehicleId from salesmanId: ${vehicleId}`);
                        }
                    }
                    catch (e) {
                        console.warn(`Warning finding vehicle by salesmanId: ${e.message}`);
                    }
                }
                // Method 3: Fallback - find salesman by name, then get their vehicle
                if (!vehicleId && invoice.createdBy) {
                    try {
                        // First find salesman ID by name/username match
                        const [salesmen] = yield conn.query('SELECT id FROM salesmen WHERE employeeName = ? OR userName = ? LIMIT 1', [invoice.createdBy, invoice.createdBy]);
                        const salesman = salesmen[0];
                        if (salesman) {
                            // Now find vehicle assigned to this salesman
                            const [vehicles] = yield conn.query('SELECT id FROM vehicles WHERE salesmanId = ? LIMIT 1', [salesman.id]);
                            const vehicle = vehicles[0];
                            if (vehicle) {
                                vehicleId = vehicle.id;
                                console.log(`🔍 [CascadeDelete] Found vehicleId from createdBy (${invoice.createdBy}): ${vehicleId}`);
                            }
                        }
                    }
                    catch (e) {
                        console.warn(`Warning finding vehicle by createdBy: ${e.message}`);
                    }
                }
                if (vehicleId) {
                    try {
                        // Get invoice lines to know what items to restore
                        const [lines] = yield conn.query('SELECT productId, quantity FROM invoice_lines WHERE invoiceId = ?', [invoiceId]);
                        // Restore each item to vehicle inventory (UPSERT pattern)
                        let restoredCount = 0;
                        for (const line of lines) {
                            // Try UPDATE first
                            const [updateResult] = yield conn.query('UPDATE vehicle_inventory SET quantity = quantity + ? WHERE vehicleId = ? AND productId = ?', [line.quantity, vehicleId, line.productId]);
                            if (updateResult.affectedRows > 0) {
                                restoredCount++;
                                console.log(`📦 [CascadeDelete] Restored ${line.quantity} of product ${line.productId} to vehicle ${vehicleId}`);
                            }
                            else {
                                // No row exists - INSERT a new one (item was fully sold before)
                                try {
                                    yield conn.query('INSERT INTO vehicle_inventory (id, vehicleId, productId, quantity) VALUES (UUID(), ?, ?, ?)', [vehicleId, line.productId, line.quantity]);
                                    restoredCount++;
                                    console.log(`📦 [CascadeDelete] Created new vehicle_inventory row: ${line.quantity} of ${line.productId} for vehicle ${vehicleId}`);
                                }
                                catch (insertErr) {
                                    console.warn(`⚠️ [CascadeDelete] Failed to insert vehicle_inventory: ${insertErr.message}`);
                                }
                            }
                        }
                        console.log(`🚗 [CascadeDelete] Restored ${restoredCount}/${lines.length} items to vehicle inventory`);
                    }
                    catch (err) {
                        console.warn(`Warning restoring vehicle inventory: ${err.message}`);
                    }
                }
                else {
                    console.warn(`⚠️ [CascadeDelete] VAN sale invoice but no vehicleId found. salesmanId=${invoice.salesmanId}, createdBy=${invoice.createdBy}`);
                }
            }
            // 10. REVERSE STOCK CHANGES - CRITICAL FIX!
            // When an invoice is deleted, we must:
            // a) Delete the corresponding stock_movements record
            // b) Reverse the product_stocks change
            // c) Reverse the products.stock change
            try {
                // Get invoice lines before deletion to know what to reverse
                const [invoiceLines] = yield conn.query('SELECT productId, quantity, baseQuantity, warehouseId, returnCondition FROM invoice_lines WHERE invoiceId = ?', [invoiceId]);
                // Determine the stock change direction based on invoice type
                // We need to REVERSE what the invoice did:
                // - INVOICE_PURCHASE added stock (+), so deletion should subtract (-)
                // - INVOICE_SALE subtracted stock (-), so deletion should add (+)
                // - RETURN_SALE added stock (+), so deletion should subtract (-)
                // - RETURN_PURCHASE subtracted stock (-), so deletion should add (+)
                const stockReverseMultiplier = {
                    'INVOICE_PURCHASE': -1, // Undo the +stock
                    'RETURN_SALE': -1, // Undo the +stock
                    'INVOICE_SALE': 1, // Undo the -stock (add back)
                    'RETURN_PURCHASE': 1 // Undo the -stock (add back)
                };
                const reverseMultiplier = stockReverseMultiplier[invoice.type] || 0;
                // Skip if this is a VAN sale (stock was from vehicle, not warehouse)
                // VAN sales are identified by invoice number starting with 'VAN-' or containing بيع متنقل
                const isVanSaleInvoice = ((_d = invoice.number) === null || _d === void 0 ? void 0 : _d.startsWith('VAN-')) ||
                    ((_e = invoice.notes) === null || _e === void 0 ? void 0 : _e.includes('متنقل')) ||
                    ((_f = invoice.notes) === null || _f === void 0 ? void 0 : _f.includes('Van Sale'));
                const isReturnType = invoice.type === 'RETURN_SALE' || invoice.type === 'RETURN_PURCHASE';
                if (reverseMultiplier !== 0 && !isVanSaleInvoice) {
                    console.log(`📦 [CascadeDelete] Reversing stock for ${invoice.type} invoice (multiplier: ${reverseMultiplier})`);
                    for (const line of invoiceLines) {
                        // Skip DAMAGED returns — they never had stock added, so nothing to reverse
                        if (isReturnType && line.returnCondition === 'DAMAGED') {
                            console.log(`   ⚠️ Skipping reversal for DAMAGED item: ${line.productId} (was هالك, no stock to reverse)`);
                            continue;
                        }
                        const qty = Number(line.baseQuantity !== null && line.baseQuantity !== undefined ? line.baseQuantity : line.quantity) || 0;
                        const reverseChange = qty * reverseMultiplier;
                        const warehouseId = line.warehouseId || invoice.warehouseId;
                        // a) Reverse products.stock (global stock)
                        yield conn.query('UPDATE products SET stock = ROUND(stock + ?, 5) WHERE id = ?', [reverseChange, line.productId]);
                        console.log(`   📦 products.stock: ${line.productId} ${reverseChange > 0 ? '+' : ''}${reverseChange}`);
                        // b) Reverse product_stocks (warehouse-level stock)
                        if (warehouseId) {
                            yield conn.query('UPDATE product_stocks SET stock = ROUND(stock + ?, 5) WHERE productId = ? AND warehouseId = ?', [reverseChange, line.productId, warehouseId]);
                            console.log(`   🏬 product_stocks: ${line.productId} in ${warehouseId} ${reverseChange > 0 ? '+' : ''}${reverseChange}`);
                        }
                        // Track in result
                        result.reversedStock.push({
                            productId: line.productId,
                            change: reverseChange,
                            warehouseId: warehouseId || undefined
                        });
                    }
                }
                else if (isVanSaleInvoice) {
                    console.log(`📦 [CascadeDelete] Skipping warehouse stock reversal for VAN sale (vehicle inventory already restored above)`);
                }
                // c) Delete stock_movements for this invoice (regardless of type)
                const [deleteMovementResult] = yield conn.query('DELETE FROM stock_movements WHERE reference_id = ?', [invoiceId]);
                const deletedMovements = deleteMovementResult.affectedRows || 0;
                result.deletedStockMovements = deletedMovements;
                if (deletedMovements > 0) {
                    console.log(`📈 [CascadeDelete] Deleted ${deletedMovements} stock_movements for invoice ${invoiceId}`);
                }
            }
            catch (stockError) {
                console.warn(`⚠️ [CascadeDelete] Warning reversing stock: ${stockError.message}`);
                // Continue with deletion - stock can be recalculated later
            }
            // 10d. Delete linked POS expense and POS cash movement (if payment/receipt links to one)
            if (invoice.referenceInvoiceId) {
                try {
                    // Find the linked POS expense
                    const [expRows] = yield conn.query(`SELECT * FROM pos_expenses WHERE id = ?`, [invoice.referenceInvoiceId]);
                    if (expRows.length > 0) {
                        const expense = expRows[0];
                        console.log(`🗑️ [CascadeDelete] Found linked POS expense ${expense.id} for invoice ${invoiceId}. Deleting...`);
                        // Delete employee advance if exists (سلفة)
                        if (expense.entityType === 'EMPLOYEE' && expense.entityId) {
                            const dateStr = expense.createdAt instanceof Date
                                ? expense.createdAt.toISOString().split('T')[0]
                                : String(expense.createdAt).split('T')[0];
                            const [advances] = yield conn.query(`SELECT id FROM employee_advances
                             WHERE employeeId = ? AND amount = ? AND status = 'ACTIVE'
                               AND (issueDate = ? OR ABS(DATEDIFF(issueDate, ?)) <= 1)`, [expense.entityId, expense.amount, dateStr, dateStr]);
                            if (advances.length > 0) {
                                const advanceIds = advances.map((a) => a.id);
                                const ph = advanceIds.map(() => '?').join(',');
                                yield conn.query(`DELETE FROM employee_advances WHERE id IN (${ph})`, advanceIds);
                            }
                        }
                        // Delete linked journal entry from journal_entries
                        const [journalRows] = yield conn.query(`SELECT id FROM journal_entries WHERE referenceId = ?`, [expense.id]);
                        if (journalRows.length > 0) {
                            const journalId = journalRows[0].id;
                            yield updateAccountBalances(conn, [journalId]);
                            yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [journalId]);
                            yield conn.query('DELETE FROM journal_entries WHERE id = ?', [journalId]);
                        }
                        // Delete from pos_expenses
                        yield conn.query(`DELETE FROM pos_expenses WHERE id = ?`, [expense.id]);
                        // Recalculate shift totals so expectedCash and variance stay accurate
                        const { recalculateShiftTotals } = require('../controllers/posController');
                        yield recalculateShiftTotals(conn, expense.shiftId, deletedBy);
                        // Delete linked cash movement from pos_cash_movements
                        const [delResult] = yield conn.query(`DELETE FROM pos_cash_movements
                         WHERE shiftId = ?
                           AND type = 'EXPENSE'
                           AND (referenceId = ? OR referenceId IS NULL)
                           AND amount = ?
                         ORDER BY createdAt DESC
                         LIMIT 1`, [expense.shiftId, expense.id, expense.amount]);
                        if (delResult.affectedRows === 0) {
                            yield conn.query(`DELETE FROM pos_cash_movements
                             WHERE shiftId = ? AND type = 'EXPENSE' AND amount = ?
                             ORDER BY createdAt DESC LIMIT 1`, [expense.shiftId, expense.amount]);
                        }
                    }
                }
                catch (posExpenseErr) {
                    console.warn(`⚠️ [CascadeDelete] Warning deleting linked POS expense: ${posExpenseErr.message}`);
                }
            }
            // Resolve shiftId (from invoice, falling back to linked cash movements if invoice.posShiftId is missing/null)
            let resolvedShiftId = invoice.posShiftId || null;
            if (!resolvedShiftId) {
                try {
                    const [pcmRows] = yield conn.query('SELECT DISTINCT shiftId FROM pos_cash_movements WHERE referenceId = ? LIMIT 1', [invoiceId]);
                    if (pcmRows && pcmRows.length > 0) {
                        resolvedShiftId = pcmRows[0].shiftId;
                    }
                }
                catch (pcmErr) {
                    console.warn('⚠️ [CascadeDelete] Warning fetching shiftId from pos_cash_movements:', pcmErr.message);
                }
            }
            // Delete POS cash movements if referenceId matches
            try {
                const [delMovements] = yield conn.query('DELETE FROM pos_cash_movements WHERE referenceId = ?', [invoiceId]);
                const affected = delMovements.affectedRows || 0;
                if (affected > 0) {
                    console.log(`🗑️ [CascadeDelete] Deleted ${affected} pos_cash_movements for POS invoice ${invoiceId}`);
                }
            }
            catch (posMoveErr) {
                console.warn(`⚠️ [CascadeDelete] Warning deleting associated pos_cash_movements: ${posMoveErr.message}`);
            }
            // 11. Delete the main invoice and its lines
            yield conn.query('DELETE FROM invoice_lines WHERE invoiceId = ?', [invoiceId]);
            yield conn.query('DELETE FROM invoices WHERE id = ?', [invoiceId]);
            // Recalculate shift totals so expectedCash, variance, and totals/counts stay accurate
            if (resolvedShiftId) {
                try {
                    const { recalculateShiftTotals } = require('../controllers/posController');
                    yield recalculateShiftTotals(conn, resolvedShiftId, deletedBy);
                }
                catch (posShiftErr) {
                    console.warn(`⚠️ [CascadeDelete] Warning recalculating shift totals for shift ${resolvedShiftId}: ${posShiftErr.message}`);
                }
            }
            // 12. Delete related customer visits (الزيارات)
            // Customer visits have invoiceId linking them to VAN sale invoices
            try {
                const [visitResult] = yield conn.query('DELETE FROM vehicle_customer_visits WHERE invoiceId = ?', [invoiceId]);
                const deletedVisits = visitResult.affectedRows || 0;
                if (deletedVisits > 0) {
                    console.log(`🗑️ [CascadeDelete] Deleted ${deletedVisits} customer visits linked to invoice`);
                }
            }
            catch (err) {
                // Table may not exist in some installations
                if (!((_g = err.message) === null || _g === void 0 ? void 0 : _g.includes("doesn't exist"))) {
                    console.warn('Warning deleting vehicle_customer_visits:', err.message);
                }
            }
            result.success = true;
            console.log(`✅ [CascadeDelete] Successfully deleted invoice ${invoiceId} with ${allLinkedDocs.length} linked docs`);
            return result;
        }
        catch (error) {
            console.error(`❌ [CascadeDelete] Error deleting invoice ${invoiceId}:`, error);
            result.error = error.message;
            return result;
        }
    });
}
/**
 * Preview what would be deleted without actually deleting
 * Useful for confirmation dialogs
 */
function previewCascadeDelete(conn, invoiceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [invoiceRows] = yield conn.query('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
        const invoice = invoiceRows[0];
        if (!invoice) {
            throw new Error('Invoice not found');
        }
        const related = yield findRelatedDocuments(conn, invoiceId);
        let totalAmount = Number(invoice.total || 0);
        for (const doc of [...related.receipts, ...related.payments]) {
            totalAmount += Number(doc.total || 0);
        }
        const linkedCount = related.receipts.length + related.payments.length;
        let warning = '';
        if (linkedCount > 0) {
            warning = `⚠️ سيتم حذف ${linkedCount} سند ${related.receipts.length > 0 ? 'قبض' : ''} ${related.payments.length > 0 ? 'صرف' : ''} مرتبط بهذه الفاتورة`;
        }
        if (related.journals.length > 0) {
            warning += `\n📚 سيتم حذف ${related.journals.length} قيد محاسبي`;
        }
        return {
            invoice,
            linkedReceipts: related.receipts,
            linkedPayments: related.payments,
            linkedJournals: related.journals,
            totalAmount,
            warning
        };
    });
}
