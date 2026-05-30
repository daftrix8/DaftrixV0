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
const db_1 = require("./db");
const crypto_1 = require("crypto");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
        try {
            const [glAccounts] = yield db_1.pool.query('SELECT id, code, name FROM accounts');
            const glAccountCache = {
                cash: glAccounts.find((a) => a.code === '101001') || glAccounts.find((a) => a.code.startsWith('101')),
                advances: glAccounts.find((a) => a.code === '105001'),
                salaries: glAccounts.find((a) => a.code === '503001'),
                receivables: glAccounts.find((a) => a.code === '104001') || glAccounts.find((a) => a.code.startsWith('104')),
                payables: glAccounts.find((a) => a.code === '201001') || glAccounts.find((a) => a.code.startsWith('201')),
            };
            const [invs] = yield db_1.pool.query('SELECT * FROM invoices WHERE type IN (\'PAYMENT\', \'RECEIPT\') AND total > 0');
            const invoices = invs;
            let createdCount = 0;
            for (const inv of invoices) {
                const [jours] = yield db_1.pool.query('SELECT id FROM journal_entries WHERE referenceId = ? OR referenceId = ?', [inv.id, inv.number]);
                if (jours.length > 0)
                    continue; // Already has journal
                const isReceipt = inv.type === 'RECEIPT';
                const voucherLabel = isReceipt ? 'سند قبض' : 'سند صرف';
                const journalId = (0, crypto_1.randomUUID)();
                let cashBankAccountId = null;
                let cashBankAccountName = 'الخزينة';
                if (inv.paymentMethod === 'BANK' && inv.bankAccountId) {
                    const [banks] = yield db_1.pool.query('SELECT accountId, name FROM banks WHERE id = ? OR accountId = ? LIMIT 1', [inv.bankAccountId, inv.bankAccountId]);
                    if ((_a = banks[0]) === null || _a === void 0 ? void 0 : _a.accountId) {
                        cashBankAccountId = banks[0].accountId;
                        cashBankAccountName = inv.bankName || banks[0].name || 'البنك';
                    }
                }
                if (!cashBankAccountId) {
                    if (glAccountCache.cash) {
                        cashBankAccountId = glAccountCache.cash.id;
                        cashBankAccountName = glAccountCache.cash.name;
                    }
                }
                if (!cashBankAccountId)
                    continue;
                const autoVoucherCat = inv.voucherCategory || (() => {
                    if (inv.notes && typeof inv.notes === 'string') {
                        const parts = inv.notes.split('|');
                        if (['supplier', 'expenses', 'employee_advance', 'employee_repay', 'salary', 'labour', 'customer', 'supplier_refund'].includes(parts[0]))
                            return parts[0];
                    }
                    return null;
                })();
                let partnerAccountId = null;
                let partnerAccountName = '';
                if (!isReceipt) {
                    if (autoVoucherCat === 'expenses') {
                        const [expAccs] = yield db_1.pool.query('SELECT id, name FROM accounts WHERE id = ? LIMIT 1', [inv.partnerId]);
                        partnerAccountId = (_b = expAccs[0]) === null || _b === void 0 ? void 0 : _b.id;
                        partnerAccountName = ((_c = expAccs[0]) === null || _c === void 0 ? void 0 : _c.name) || 'مصروفات';
                    }
                    else if (autoVoucherCat === 'employee_advance') {
                        partnerAccountId = (_d = glAccountCache.advances) === null || _d === void 0 ? void 0 : _d.id;
                        partnerAccountName = ((_e = glAccountCache.advances) === null || _e === void 0 ? void 0 : _e.name) || 'سلف موظفين';
                    }
                    else if (autoVoucherCat === 'salary') {
                        partnerAccountId = (_f = glAccountCache.salaries) === null || _f === void 0 ? void 0 : _f.id;
                        partnerAccountName = ((_g = glAccountCache.salaries) === null || _g === void 0 ? void 0 : _g.name) || 'رواتب';
                    }
                    else if (autoVoucherCat === 'labour' || autoVoucherCat === 'customer') {
                        partnerAccountId = (_h = glAccountCache.receivables) === null || _h === void 0 ? void 0 : _h.id;
                        partnerAccountName = ((_j = glAccountCache.receivables) === null || _j === void 0 ? void 0 : _j.name) || 'مدينون';
                    }
                    else {
                        partnerAccountId = (_k = glAccountCache.payables) === null || _k === void 0 ? void 0 : _k.id;
                        partnerAccountName = ((_l = glAccountCache.payables) === null || _l === void 0 ? void 0 : _l.name) || 'دائنون';
                    }
                }
                else {
                    if (autoVoucherCat === 'employee_repay') {
                        partnerAccountId = (_m = glAccountCache.advances) === null || _m === void 0 ? void 0 : _m.id;
                        partnerAccountName = ((_o = glAccountCache.advances) === null || _o === void 0 ? void 0 : _o.name) || 'سلف موظفين';
                    }
                    else if (autoVoucherCat === 'supplier_refund' || autoVoucherCat === 'supplier') {
                        partnerAccountId = (_p = glAccountCache.payables) === null || _p === void 0 ? void 0 : _p.id;
                        partnerAccountName = ((_q = glAccountCache.payables) === null || _q === void 0 ? void 0 : _q.name) || 'دائنون';
                    }
                    else {
                        partnerAccountId = (_r = glAccountCache.receivables) === null || _r === void 0 ? void 0 : _r.id;
                        partnerAccountName = ((_s = glAccountCache.receivables) === null || _s === void 0 ? void 0 : _s.name) || 'مدينون';
                    }
                }
                if (!partnerAccountId) {
                    const fallbackPatterns = isReceipt ? ['%عملاء%', '%مدينون%'] : ['%موردين%', '%دائنون%'];
                    let [fallbackAccs] = yield db_1.pool.query('SELECT id, name FROM accounts WHERE name LIKE ? OR name LIKE ? LIMIT 1', fallbackPatterns);
                    if (fallbackAccs.length === 0) {
                        const codePattern = isReceipt ? '104%' : '201%';
                        [fallbackAccs] = yield db_1.pool.query('SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1', [codePattern]);
                    }
                    partnerAccountId = (_t = fallbackAccs[0]) === null || _t === void 0 ? void 0 : _t.id;
                    partnerAccountName = ((_u = fallbackAccs[0]) === null || _u === void 0 ? void 0 : _u.name) || (isReceipt ? 'مدينون' : 'دائنون');
                }
                if (cashBankAccountId && partnerAccountId) {
                    yield db_1.pool.query('INSERT INTO journal_entries (id, date, description, referenceId, createdBy) VALUES (?, ?, ?, ?, ?)', [journalId, inv.date, `${voucherLabel} - ${inv.partnerName || ''}`, inv.id, inv.createdBy || 'Migration']);
                    const isEffectivelyReceipt = (isReceipt && inv.total >= 0) || (!isReceipt && inv.total < 0);
                    const absTotal = Math.abs(inv.total);
                    if (isEffectivelyReceipt) {
                        yield db_1.pool.query('INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, ?, ?)', [journalId, cashBankAccountId, cashBankAccountName, absTotal, 0]);
                        yield db_1.pool.query('INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, ?, ?)', [journalId, partnerAccountId, partnerAccountName, 0, absTotal]);
                    }
                    else {
                        yield db_1.pool.query('INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, ?, ?)', [journalId, partnerAccountId, partnerAccountName, absTotal, 0]);
                        yield db_1.pool.query('INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, ?, ?)', [journalId, cashBankAccountId, cashBankAccountName, 0, absTotal]);
                    }
                    createdCount++;
                }
            }
            console.log('Successfully created missing journals:', createdCount);
        }
        catch (e) {
            console.error(e);
        }
        process.exit(0);
    });
}
run();
