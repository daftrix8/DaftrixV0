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
        try {
            const [glAccounts] = yield db_1.pool.query('SELECT id, code, name FROM accounts');
            const glAccountCache = {
                cash: glAccounts.find((a) => a.code === '101001') || glAccounts.find((a) => a.code.startsWith('101')),
                payables: glAccounts.find((a) => a.code === '201001') || glAccounts.find((a) => a.code.startsWith('201'))
            };
            const [invs] = yield db_1.pool.query('SELECT * FROM invoices WHERE id = ?', ['PAY_1776021266037_wd97bwv6q']);
            const inv = invs[0];
            const [jours] = yield db_1.pool.query('SELECT id FROM journal_entries WHERE referenceId = ?', [inv.id]);
            if (jours.length > 0) {
                console.log('Journal already exists');
                process.exit(0);
            }
            const journalId = (0, crypto_1.randomUUID)();
            yield db_1.pool.query('INSERT INTO journal_entries(id, date, description, referenceId, createdBy) VALUES(?, ?, ?, ?, ?)', [journalId, inv.date, '??? ??? - ' + inv.partnerName, inv.id, 'System']);
            yield db_1.pool.query('INSERT INTO journal_lines(journalId, accountId, accountName, debit, credit) VALUES(?, ?, ?, ?, 0)', [journalId, glAccountCache.payables.id, glAccountCache.payables.name, inv.total]);
            yield db_1.pool.query('INSERT INTO journal_lines(journalId, accountId, accountName, debit, credit) VALUES(?, ?, ?, 0, ?)', [journalId, glAccountCache.cash.id, glAccountCache.cash.name, inv.total]);
            console.log('Successfully created journal entry for PAY_1776021266037_wd97bwv6q');
        }
        catch (e) {
            console.error(e);
        }
        process.exit(0);
    });
}
run();
