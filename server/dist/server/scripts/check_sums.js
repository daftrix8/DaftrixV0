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
const database_1 = require("../config/database");
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, database_1.getConnection)();
        const [rows] = yield conn.query(`SELECT SUM(discount) as d, SUM(whtAmount) as wht, SUM(total) as t FROM invoices WHERE partnerId='c02b5fba-ba39-4a6e-87a5-f0352dcab9d3' AND type IN ('INVOICE_PURCHASE', 'RETURN_PURCHASE', 'RECEIPT', 'PAYMENT')`);
        console.log("DB sums: ", rows);
        process.exit(0);
    });
}
check();
