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
        try {
            const [invs2] = yield db_1.pool.query('SELECT id, number, type FROM invoices WHERE id LIKE \'%177602126%\'');
            console.log('Invoices 177602126:', invs2.map(i => i.id + ' | ' + i.number).join(', '));
            for (const inv of invs2) {
                const [jours] = yield db_1.pool.query('SELECT * FROM journal_entries WHERE referenceId = ? OR referenceId = ?', [inv.id, inv.number]);
                for (const jour of jours) {
                    console.log('Journal for', inv.id, '->', jour.description);
                    const [lines] = yield db_1.pool.query('SELECT jl.debit, jl.credit, a.code, a.name FROM journal_lines jl JOIN accounts a ON jl.accountId = a.id WHERE jl.journalId = ?', [jour.id]);
                    console.log('  Lines:', lines);
                }
            }
        }
        catch (e) {
            console.error(e);
        }
        process.exit(0);
    });
}
run();
