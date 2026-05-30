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
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        try {
            const [glAccounts] = yield db_1.pool.query('SELECT id, code, name FROM accounts');
            const glAccountCache = {
                cash: glAccounts.find((a) => a.code === '101001') || glAccounts.find((a) => a.code.startsWith('101')),
                advances: glAccounts.find((a) => a.code === '105001'),
                salaries: glAccounts.find((a) => a.code === '503001'),
                receivables: glAccounts.find((a) => a.code === '104001') || glAccounts.find((a) => a.code.startsWith('104')),
                payables: glAccounts.find((a) => a.code === '201001') || glAccounts.find((a) => a.code.startsWith('201')),
            };
            const [invs] = yield db_1.pool.query('SELECT * FROM invoices WHERE id = ?', ['PAY_1776021266037_wd97bwv6q']);
            const inv = invs[0];
            console.log('Invoice found:', inv.id, 'Total:', inv.total);
            // Simulation
            const isReceipt = inv.type === 'RECEIPT';
            let cashBankAccountId = null;
            let cashBankAccountName = '???????';
            if (inv.paymentMethod === 'BANK' && inv.bankAccountId) {
                console.log('BANK logic triggered');
            }
            if (!cashBankAccountId) {
                if (glAccountCache.cash) {
                    cashBankAccountId = glAccountCache.cash.id;
                    cashBankAccountName = glAccountCache.cash.name;
                    console.log('Using Cash account:', cashBankAccountId, cashBankAccountName);
                }
            }
            let partnerAccountId = null;
            let partnerAccountName = '';
            partnerAccountId = (_a = glAccountCache.payables) === null || _a === void 0 ? void 0 : _a.id;
            partnerAccountName = ((_b = glAccountCache.payables) === null || _b === void 0 ? void 0 : _b.name) || '????????';
            console.log('Using Partner account:', partnerAccountId, partnerAccountName);
            if (!partnerAccountId) {
                const fallbackPatterns = isReceipt ? ['%?????%', '%??????%'] : ['%??????%', '%??????%'];
                let [fallbackAccs] = yield db_1.pool.query('SELECT id, name FROM accounts WHERE name LIKE ? OR name LIKE ? LIMIT 1', fallbackPatterns);
                if (fallbackAccs.length === 0) {
                    const codePattern = isReceipt ? '104%' : '201%';
                    [fallbackAccs] = yield db_1.pool.query('SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1', [codePattern]);
                }
                partnerAccountId = (_c = fallbackAccs[0]) === null || _c === void 0 ? void 0 : _c.id;
                partnerAccountName = ((_d = fallbackAccs[0]) === null || _d === void 0 ? void 0 : _d.name) || (isReceipt ? '???????' : '????????');
                console.log('Fallback Partner account:', partnerAccountId, partnerAccountName);
            }
            console.log('Would save?', !!(cashBankAccountId && partnerAccountId));
        }
        catch (e) {
            console.error(e);
        }
        process.exit(0);
    });
}
run();
