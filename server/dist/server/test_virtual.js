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
function test() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        const [banksRow] = yield conn.query("SELECT * FROM banks");
        const banks = banksRow;
        const linkedAccountIds = banks.map((b) => b.accountId).filter(Boolean);
        let cashFilterStr = linkedAccountIds.length > 0 ? 'AND id NOT IN (?)' : '';
        const queryParams = linkedAccountIds.length > 0 ? [linkedAccountIds] : [];
        const [virtualCashAccounts] = yield conn.query(`SELECT id, name, code as accountNumber, currencyCode as currency, COALESCE(balance, 0) as balance, COALESCE(openingBalance, 0) as openingBalance
         FROM accounts 
         WHERE code LIKE '101%' ${cashFilterStr}`, queryParams);
        console.log("Virtual Treasuries Count:", virtualCashAccounts.length);
        console.log("Virtual Treasuries:");
        virtualCashAccounts.forEach(v => console.log(`- ${v.name} (Code: ${v.accountNumber})`));
        conn.release();
        process.exit(0);
    });
}
test().catch(console.error);
