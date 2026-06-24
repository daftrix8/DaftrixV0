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
exports.ACCOUNT_PREFIX = void 0;
exports.resolvePaymentAccount = resolvePaymentAccount;
exports.resolvePartnerAccount = resolvePartnerAccount;
exports.createPaymentJournal = createPaymentJournal;
exports.generateInvoicePayments = generateInvoicePayments;
exports.deleteInvoicePayments = deleteInvoicePayments;
const crypto_1 = require("crypto");
const invoiceNumberGenerator_1 = require("./invoiceNumberGenerator");
const branchFilter_1 = require("./branchFilter");
const journalValidationUtils_1 = require("./journalValidationUtils");
const auditController_1 = require("../controllers/auditController");
exports.ACCOUNT_PREFIX = {
    CASH: '101%',
    BANK: '102%',
    RECEIVABLES: '104%',
    CHEQUES_RECEIVABLE: '106%',
    PAYABLES: '201%',
    CHEQUES_PAYABLE: '203%',
    DAMAGE_EXPENSE: '502%'
};
function resolvePaymentAccount(conn, paymentMethod, paymentType, bankAccountId, req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (paymentMethod === 'CASH') {
            if (bankAccountId) {
                // Check if bankAccountId is directly a GL account ID first to support virtual treasuries
                const [accRowsDirect] = yield conn.query('SELECT id, name FROM accounts WHERE id = ? LIMIT 1', [bankAccountId]);
                if (accRowsDirect[0])
                    return accRowsDirect[0];
                const [bankRows] = yield conn.query('SELECT accountId FROM banks WHERE id = ? LIMIT 1', [bankAccountId]);
                const expAccountId = (_a = bankRows[0]) === null || _a === void 0 ? void 0 : _a.accountId;
                if (expAccountId) {
                    const [expAccRows] = yield conn.query('SELECT id, name FROM accounts WHERE id = ? LIMIT 1', [expAccountId]);
                    if (expAccRows[0])
                        return expAccRows[0];
                }
            }
            return yield (0, branchFilter_1.resolveBranchCashAccount)(conn, req);
        }
        if (paymentMethod === 'BANK') {
            if (bankAccountId) {
                const [accRowsDirect] = yield conn.query('SELECT id, name FROM accounts WHERE id = ? LIMIT 1', [bankAccountId]);
                if (accRowsDirect[0])
                    return accRowsDirect[0];
                const [bankRows] = yield conn.query('SELECT accountId FROM banks WHERE id = ? LIMIT 1', [bankAccountId]);
                const expAccountId = (_b = bankRows[0]) === null || _b === void 0 ? void 0 : _b.accountId;
                if (expAccountId) {
                    const [expAccRows] = yield conn.query('SELECT id, name FROM accounts WHERE id = ? LIMIT 1', [expAccountId]);
                    if (expAccRows[0])
                        return expAccRows[0];
                }
            }
            const [bankAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? OR name LIKE ? LIMIT 1`, [exports.ACCOUNT_PREFIX.BANK, '%بنك%']);
            return bankAccounts[0] || null;
        }
        if (paymentMethod === 'CHEQUE') {
            const code = paymentType === 'RECEIPT' ? exports.ACCOUNT_PREFIX.CHEQUES_RECEIVABLE : exports.ACCOUNT_PREFIX.CHEQUES_PAYABLE;
            const name = paymentType === 'RECEIPT' ? '%أوراق قبض%' : '%أوراق دفع%';
            const [chequeAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? OR name LIKE ? LIMIT 1`, [code, name]);
            return chequeAccounts[0] || null;
        }
        return null;
    });
}
function resolvePartnerAccount(conn, paymentType, partnerId, explicitAccountId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (explicitAccountId) {
            const [directAccs] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [explicitAccountId]);
            if (directAccs[0])
                return directAccs[0];
        }
        if (partnerId) {
            const [partnerRows] = yield conn.query(`SELECT type FROM partners WHERE id = ? LIMIT 1`, [partnerId]);
            if (partnerRows[0]) {
                const pType = partnerRows[0].type;
                const pCode = pType === 'CUSTOMER' ? exports.ACCOUNT_PREFIX.RECEIVABLES : pType === 'SUPPLIER' ? exports.ACCOUNT_PREFIX.PAYABLES : (paymentType === 'RECEIPT' ? exports.ACCOUNT_PREFIX.RECEIVABLES : exports.ACCOUNT_PREFIX.PAYABLES);
                const [accs] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [pCode]);
                if (accs[0])
                    return accs[0];
            }
        }
        const partnerAccountCode = paymentType === 'RECEIPT' ? exports.ACCOUNT_PREFIX.RECEIVABLES : exports.ACCOUNT_PREFIX.PAYABLES;
        let [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [partnerAccountCode]);
        if (partnerAccounts.length === 0) {
            const searchName = paymentType === 'RECEIPT' ? '%عملاء%' : '%موردين%';
            [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [searchName]);
        }
        return partnerAccounts[0] || null;
    });
}
function resolveAccountHelper(conn, type, nameKeywords, codePrefix, fallbackCode) {
    return __awaiter(this, void 0, void 0, function* () {
        const nameLikeClauses = nameKeywords.map(k => `name LIKE ${conn.escape('%' + k + '%')}`).join(' OR ');
        const [rows] = yield conn.query(`SELECT id, name FROM accounts WHERE type = ? AND (${nameLikeClauses}) LIMIT 1`, [type]);
        if (rows[0])
            return rows[0];
        const [codeRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [codePrefix + '%']);
        if (codeRows[0])
            return codeRows[0];
        const [fallbackRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code = ? LIMIT 1`, [fallbackCode]);
        if (fallbackRows[0])
            return fallbackRows[0];
        const [anyRows] = yield conn.query(`SELECT id, name FROM accounts WHERE type = ? LIMIT 1`, [type]);
        if (anyRows[0])
            return anyRows[0];
        const [anyAtAll] = yield conn.query(`SELECT id, name FROM accounts LIMIT 1`);
        if (anyAtAll[0])
            return anyAtAll[0];
        throw new Error(`No accounts found in database`);
    });
}
function createPaymentJournal(_a) {
    return __awaiter(this, arguments, void 0, function* ({ conn, journalId, date, description, referenceId, createdBy, amount, paymentType, paymentMethod, bankAccountId = null, currencyCode = 'EGP', exchangeRate = 1, denominations = null, branchId = null, req, partnerId = null, explicitAccountId = null }) {
        const partnerAccount = yield resolvePartnerAccount(conn, paymentType, partnerId, explicitAccountId);
        if (!partnerAccount) {
            throw new Error(`Cannot resolve partner account for partnerId=${partnerId}`);
        }
        yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, denominations, branchId) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            journalId,
            date,
            description,
            referenceId,
            createdBy,
            currencyCode,
            exchangeRate,
            denominations ? JSON.stringify(denominations) : null,
            branchId
        ]);
        const rate = Number(exchangeRate) || 1;
        const fAmt = amount / rate;
        const paymentSources = req.body.paymentSources || [];
        const isMultiSource = Array.isArray(paymentSources) && paymentSources.length > 1;
        const jLinesToInsert = [];
        if (isMultiSource) {
            // Multi-source:
            // Partner side: single line for full amount
            if (paymentType === 'RECEIPT') {
                jLinesToInsert.push({
                    accountId: partnerAccount.id,
                    accountName: partnerAccount.name,
                    debit: 0,
                    credit: amount
                });
            }
            else {
                jLinesToInsert.push({
                    accountId: partnerAccount.id,
                    accountName: partnerAccount.name,
                    debit: amount,
                    credit: 0
                });
            }
            // Sources side: one line per source
            for (const source of paymentSources) {
                const sourceAmount = Math.abs(Number(source.amount) || 0);
                if (sourceAmount <= 0)
                    continue;
                const [sourceAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [source.accountId]);
                const sourceAcc = sourceAccRows[0];
                if (!sourceAcc) {
                    console.error(`⚠️ Multi-source: account ${source.accountId} not found, skipping`);
                    continue;
                }
                if (paymentType === 'RECEIPT') {
                    jLinesToInsert.push({
                        accountId: sourceAcc.id,
                        accountName: sourceAcc.name,
                        debit: sourceAmount,
                        credit: 0
                    });
                }
                else {
                    jLinesToInsert.push({
                        accountId: sourceAcc.id,
                        accountName: sourceAcc.name,
                        debit: 0,
                        credit: sourceAmount
                    });
                }
            }
        }
        else {
            // Single source
            let resolvedBankAccountId = bankAccountId;
            if (Array.isArray(paymentSources) && paymentSources.length === 1 && paymentSources[0].accountId) {
                resolvedBankAccountId = paymentSources[0].accountId;
            }
            const paymentAccount = yield resolvePaymentAccount(conn, paymentMethod, paymentType, resolvedBankAccountId, req);
            if (!paymentAccount) {
                throw new Error(`Cannot resolve payment account for method ${paymentMethod}`);
            }
            if (paymentType === 'RECEIPT') {
                jLinesToInsert.push({
                    accountId: paymentAccount.id,
                    accountName: paymentAccount.name,
                    debit: amount,
                    credit: 0
                });
                jLinesToInsert.push({
                    accountId: partnerAccount.id,
                    accountName: partnerAccount.name,
                    debit: 0,
                    credit: amount
                });
            }
            else {
                jLinesToInsert.push({
                    accountId: partnerAccount.id,
                    accountName: partnerAccount.name,
                    debit: amount,
                    credit: 0
                });
                jLinesToInsert.push({
                    accountId: paymentAccount.id,
                    accountName: paymentAccount.name,
                    debit: 0,
                    credit: amount
                });
            }
        }
        // Process Fees (Receipt/Payment Bank Fees)
        const extractedFees = [];
        if (Array.isArray(paymentSources) && paymentSources.length > 0) {
            for (const src of paymentSources) {
                if (src.applyFee && src.feeTotal > 0) {
                    extractedFees.push({
                        accountId: src.accountId,
                        accountName: src.sourceName || 'البنك',
                        fee: Number(src.fee) || 0,
                        feeTax: Number(src.feeTax) || 0,
                        feeTotal: Number(src.feeTotal) || 0,
                        feeChargedTo: src.feeChargedTo || 'CLIENT',
                    });
                }
            }
        }
        else if (req.body.applyFee && req.body.feeTotal > 0) {
            let resolvedBankAccountId = bankAccountId;
            if (Array.isArray(paymentSources) && paymentSources.length === 1 && paymentSources[0].accountId) {
                resolvedBankAccountId = paymentSources[0].accountId;
            }
            const paymentAccount = yield resolvePaymentAccount(conn, paymentMethod, paymentType, resolvedBankAccountId, req);
            extractedFees.push({
                accountId: (paymentAccount === null || paymentAccount === void 0 ? void 0 : paymentAccount.id) || '',
                accountName: (paymentAccount === null || paymentAccount === void 0 ? void 0 : paymentAccount.name) || req.body.sourceBankName || 'البنك',
                fee: Number(req.body.fee) || 0,
                feeTax: Number(req.body.feeTax) || 0,
                feeTotal: Number(req.body.feeTotal) || 0,
                feeChargedTo: req.body.feeChargedTo || 'CLIENT',
            });
        }
        if (extractedFees.length > 0) {
            const bankChargesAccount = yield resolveAccountHelper(conn, 'EXPENSE', ['مصاريف بنكية', 'عمولات بنكية', 'bank charges'], '507', '507');
            const feeRevenueAccount = yield resolveAccountHelper(conn, 'REVENUE', ['رسوم بنكية', 'عمولة بنكية', 'إيرادات رسوم', 'bank fee', 'fee revenue'], '4099', '401');
            const taxAccount = yield resolveAccountHelper(conn, 'LIABILITY', ['ضريبة', 'vat'], '205', '205');
            for (const fee of extractedFees) {
                const [bankAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [fee.accountId]);
                let feeBankAcc = bankAccRows[0];
                if (!feeBankAcc) {
                    feeBankAcc = yield resolvePaymentAccount(conn, paymentMethod, paymentType, bankAccountId, req);
                }
                if (!feeBankAcc)
                    continue;
                // 1. Bank Charge portion: Dr Bank Charges Expense, Cr Bank Account
                jLinesToInsert.push({
                    accountId: bankChargesAccount.id,
                    accountName: bankChargesAccount.name,
                    debit: fee.fee,
                    credit: 0
                });
                if (fee.feeTax > 0) {
                    jLinesToInsert.push({
                        accountId: taxAccount.id,
                        accountName: taxAccount.name,
                        debit: fee.feeTax,
                        credit: 0
                    });
                }
                jLinesToInsert.push({
                    accountId: feeBankAcc.id,
                    accountName: feeBankAcc.name,
                    debit: 0,
                    credit: fee.feeTotal
                });
                // 2. Fee recovery (Receipts only, if charged to client): Dr Bank Account, Cr Fee Revenue
                if (paymentType === 'RECEIPT' && fee.feeChargedTo === 'CLIENT') {
                    jLinesToInsert.push({
                        accountId: feeBankAcc.id,
                        accountName: feeBankAcc.name,
                        debit: fee.feeTotal,
                        credit: 0
                    });
                    jLinesToInsert.push({
                        accountId: feeRevenueAccount.id,
                        accountName: feeRevenueAccount.name,
                        debit: 0,
                        credit: fee.feeTotal
                    });
                }
            }
        }
        const balancedLines = (0, journalValidationUtils_1.assertBalanced)(jLinesToInsert);
        const jLines = balancedLines.map(bl => [
            journalId,
            bl.accountId,
            bl.accountName,
            bl.debit,
            bl.credit,
            currencyCode,
            exchangeRate,
            bl.debit > 0 ? (bl.debit / rate) : 0,
            bl.credit > 0 ? (bl.credit / rate) : 0
        ]);
        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [jLines]);
    });
}
function createVoucherHelper(conn, params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { invoiceId, invoiceNumber, type, date, partnerId, partnerName, amount, method, createdBy, resolvedBranchId, req } = params;
        const paymentType = (type === 'INVOICE_SALE' || type === 'RETURN_PURCHASE') ? 'RECEIPT' : 'PAYMENT';
        const paymentPrefix = paymentType === 'RECEIPT' ? 'REC-' : 'PAY-';
        // Locked sequence number generation
        const paymentNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, paymentPrefix, 'invoices', 'number', resolvedBranchId);
        const paymentId = paymentNumber;
        const sanitizedWarehouseId = params.warehouseId && typeof params.warehouseId === 'string'
            ? params.warehouseId.substring(0, 36)
            : null;
        let receiptBankTransfers = null;
        let resolvedBankId = params.bankAccountId || null;
        let resolvedBankName = null;
        if (method === 'BANK' && resolvedBankId) {
            const [bankInfoRows] = yield conn.query(`SELECT id, name, accountId FROM banks WHERE id = ? LIMIT 1`, [resolvedBankId]);
            const bankInfo = bankInfoRows[0];
            resolvedBankName = (bankInfo === null || bankInfo === void 0 ? void 0 : bankInfo.name) || '';
            receiptBankTransfers = JSON.stringify([{
                    bankName: resolvedBankName,
                    bankId: resolvedBankId,
                    amount: amount,
                    reference: '',
                    accountNumber: ''
                }]);
        }
        yield conn.query(`INSERT INTO invoices (
            id, number, date, type, partnerId, partnerName, 
            total, status, paymentMethod, posted, notes, 
            warehouseId, createdBy, sourceInvoiceId, relatedInvoiceIds, bankTransfers,
            bankAccountId, bankName, branchId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            paymentId,
            paymentNumber,
            date,
            paymentType,
            partnerId,
            partnerName,
            amount,
            'POSTED',
            method,
            1,
            `دفعة مع الفاتورة ${invoiceNumber}`,
            sanitizedWarehouseId,
            createdBy,
            invoiceId,
            JSON.stringify([invoiceId]),
            receiptBankTransfers,
            method === 'BANK' ? resolvedBankId : null,
            method === 'BANK' ? resolvedBankName : null,
            resolvedBranchId
        ]);
        yield conn.query(`INSERT INTO payment_allocations (id, paymentId, invoiceId, amount) VALUES (?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), paymentId, invoiceId, amount]);
        yield conn.query(`INSERT INTO account_transactions (
            id, date, type, partnerId, partnerName, 
            debit, credit, description, invoiceId, createdBy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            (0, crypto_1.randomUUID)(),
            date,
            paymentType,
            partnerId,
            partnerName,
            paymentType === 'PAYMENT' ? amount : 0,
            paymentType === 'RECEIPT' ? amount : 0,
            `${paymentType === 'RECEIPT' ? 'مقبوض' : 'دفع'} مع الفاتورة ${invoiceNumber}`,
            paymentId,
            createdBy
        ]);
        const journalId = (0, crypto_1.randomUUID)();
        const methodLabel = method === 'CASH' ? 'نقدي' :
            method === 'BANK' ? 'تحويل بنكي' : 'شيك';
        yield createPaymentJournal({
            conn,
            journalId,
            date,
            description: `${paymentType === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} #${paymentNumber} - ${partnerName} - دفعة مع الفاتورة ${invoiceNumber} (${methodLabel})`,
            referenceId: paymentId,
            createdBy,
            amount,
            paymentType,
            paymentMethod: method,
            bankAccountId: resolvedBankId,
            currencyCode: params.currencyCode || 'EGP',
            exchangeRate: params.exchangeRate || 1,
            denominations: params.denominations,
            branchId: resolvedBranchId,
            req,
            partnerId
        });
        yield (0, auditController_1.logAction)(createdBy || 'System', paymentType, 'CREATE', `Created ${paymentType} #${paymentNumber} with Invoice ${invoiceNumber}`, `Partner: ${partnerName}, Amount: ${amount}`);
    });
}
function generateInvoicePayments(conn, params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { invoiceId, invoiceNumber, type, date, partnerId, partnerName, total, isCashInvoice, createdBy, resolvedBranchId, req } = params;
        const supportsPaymentWithInvoice = [
            'INVOICE_SALE',
            'INVOICE_PURCHASE',
            'RETURN_SALE',
            'RETURN_PURCHASE'
        ].includes(type);
        let paymentCollected = supportsPaymentWithInvoice ? Number(params.paymentCollected || 0) : 0;
        if (paymentCollected > total && total > 0) {
            paymentCollected = total;
        }
        // 1. Generate Payment/Receipt Vouchers for Credit Invoices
        if (paymentCollected > 0 && partnerId && !isCashInvoice) {
            const actualPaymentMethod = params.paymentMethod || 'CASH';
            if (actualPaymentMethod === 'MIXED') {
                const pb = params.paymentBreakdown;
                if (pb) {
                    if (pb.cash && pb.cash > 0) {
                        yield createVoucherHelper(conn, Object.assign(Object.assign({}, params), { amount: pb.cash, method: 'CASH', bankAccountId: params.bankAccountId // mixedTreasuryId resolves to bankAccountId/bankAccountId in controller
                         }));
                    }
                    if (pb.cheque && pb.cheque > 0) {
                        yield createVoucherHelper(conn, Object.assign(Object.assign({}, params), { amount: pb.cheque, method: 'CHEQUE' }));
                    }
                }
            }
            else {
                // Standard Credit / Single-method Partial Payment
                yield createVoucherHelper(conn, Object.assign(Object.assign({}, params), { amount: paymentCollected, method: (params.partialPaymentMethod || 'CASH'), bankAccountId: params.partialPaymentBankId || params.bankAccountId }));
            }
        }
        // 2. Generate Treasury Journal Entry for Cash Invoices
        const cashJournalAmount = Number(total) || paymentCollected;
        if (cashJournalAmount > 0 && partnerId && isCashInvoice && type !== 'RECEIPT' && type !== 'PAYMENT') {
            const paymentType = (type === 'INVOICE_SALE' || type === 'RETURN_PURCHASE') ? 'RECEIPT' : 'PAYMENT';
            const journalId = (0, crypto_1.randomUUID)();
            let descPrefix = 'فاتورة مبيعات نقدي';
            if (type === 'RETURN_SALE')
                descPrefix = 'مرتجع مبيعات نقدي';
            else if (type === 'RETURN_PURCHASE')
                descPrefix = 'مرتجع مشتريات نقدي';
            else if (type === 'INVOICE_PURCHASE')
                descPrefix = 'فاتورة مشتريات نقدي';
            yield createPaymentJournal({
                conn,
                journalId,
                date,
                description: `${descPrefix} #${invoiceNumber} - ${partnerName}`,
                referenceId: invoiceId,
                createdBy,
                amount: cashJournalAmount,
                paymentType,
                paymentMethod: 'CASH',
                bankAccountId: params.bankAccountId,
                currencyCode: params.currencyCode || 'EGP',
                exchangeRate: params.exchangeRate || 1,
                denominations: params.denominations,
                branchId: resolvedBranchId,
                req,
                partnerId
            });
        }
        // 3. Generate Payment Vouchers for Bank Transfers
        const bankTransfers = params.bankTransfers;
        if (bankTransfers && Array.isArray(bankTransfers) && bankTransfers.length > 0 && partnerId) {
            for (const transfer of bankTransfers) {
                if (!transfer.amount || transfer.amount <= 0)
                    continue;
                const transferPaymentType = (type === 'INVOICE_SALE' || type === 'RETURN_PURCHASE') ? 'RECEIPT' : 'PAYMENT';
                const transferPrefix = transferPaymentType === 'RECEIPT' ? 'REC-' : 'PAY-';
                const transferNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, transferPrefix, 'invoices', 'number', resolvedBranchId);
                const transferPaymentId = (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO invoices (
                    id, number, date, type, partnerId, partnerName, 
                    total, status, paymentMethod, posted, notes, 
                    warehouseId, createdBy, bankName, sourceInvoiceId, relatedInvoiceIds, branchId
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    transferPaymentId,
                    transferNumber,
                    date,
                    transferPaymentType,
                    partnerId,
                    partnerName,
                    transfer.amount,
                    'POSTED',
                    'BANK',
                    1,
                    `تحويل بنكي مع الفاتورة ${invoiceNumber} - مرجع: ${transfer.reference || '-'}`,
                    params.warehouseId || null,
                    createdBy,
                    transfer.bankName || null,
                    invoiceId,
                    JSON.stringify([invoiceId]),
                    resolvedBranchId
                ]);
                yield conn.query(`INSERT INTO payment_allocations (id, paymentId, invoiceId, amount) VALUES (?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), transferPaymentId, invoiceId, transfer.amount]);
                yield conn.query(`INSERT INTO account_transactions (
                    id, date, type, partnerId, partnerName, 
                    debit, credit, description, invoiceId, createdBy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    (0, crypto_1.randomUUID)(),
                    date,
                    transferPaymentType,
                    partnerId,
                    partnerName,
                    transferPaymentType === 'PAYMENT' ? transfer.amount : 0,
                    transferPaymentType === 'RECEIPT' ? transfer.amount : 0,
                    `تحويل بنكي مع الفاتورة ${invoiceNumber} - بنك: ${transfer.bankName || '-'}`,
                    transferPaymentId,
                    createdBy
                ]);
                const transferJournalId = (0, crypto_1.randomUUID)();
                yield createPaymentJournal({
                    conn,
                    journalId: transferJournalId,
                    date,
                    description: `${transferPaymentType === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} #${transferNumber} - ${partnerName} - تحويل بنكي مع الفاتورة ${invoiceNumber}`,
                    referenceId: transferPaymentId,
                    createdBy,
                    amount: transfer.amount,
                    paymentType: transferPaymentType,
                    paymentMethod: 'BANK',
                    bankAccountId: transfer.bankAccountId || transfer.bankId || null,
                    currencyCode: params.currencyCode || 'EGP',
                    exchangeRate: params.exchangeRate || 1,
                    branchId: resolvedBranchId,
                    req,
                    partnerId
                });
            }
        }
    });
}
function deleteInvoicePayments(conn, invoiceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [existingPayments] = yield conn.query(`SELECT id, number FROM invoices 
         WHERE sourceInvoiceId = ? AND type IN ('RECEIPT','PAYMENT')`, [invoiceId]);
        for (const ep of existingPayments) {
            yield conn.query('DELETE FROM journal_lines WHERE journalId IN (SELECT id FROM journal_entries WHERE referenceId = ?)', [ep.number]);
            yield conn.query('DELETE FROM journal_entries WHERE referenceId = ?', [ep.number]);
            yield conn.query('DELETE FROM account_transactions WHERE invoiceId = ?', [ep.id]);
            yield conn.query('DELETE FROM payment_allocations WHERE paymentId = ?', [ep.id]);
            yield conn.query('DELETE FROM invoices WHERE id = ?', [ep.id]);
        }
    });
}
