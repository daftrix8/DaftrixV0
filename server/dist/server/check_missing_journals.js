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
            const [invs] = yield db_1.pool.query('SELECT * FROM invoices WHERE type IN (\'PAYMENT\', \'RECEIPT\')');
            const invoices = invs;
            console.log('Total Payment/Receipt Invoices:', invoices.length);
            let missingCount = 0;
            for (const inv of invoices) {
                const [jours] = yield db_1.pool.query('SELECT * FROM journal_entries WHERE referenceId = ? OR referenceId = ?', [inv.id, inv.number]);
                if (jours.length === 0) {
                    missingCount++;
                    console.log('MISSING Journal for Invoice:', inv.id, '| Number:', inv.number);
                }
            }
            console.log('Missing count:', missingCount);
        }
        catch (e) {
            console.error(e);
        }
        process.exit(0);
    });
}
run();
