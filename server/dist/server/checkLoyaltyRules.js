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
        const conn = yield (0, db_1.getConnection)();
        const [rules] = yield conn.query('SELECT * FROM loyalty_rules');
        console.log('Loyalty Rules:', rules);
        // Also try to simulate getApplicableRules for 600 EGP
        const orderTotal = 600;
        const [applicable] = yield conn.query(`
        SELECT * FROM loyalty_rules 
        WHERE status = 'active' 
          AND (minimumSpend IS NULL OR minimumSpend <= ?)
    `, [orderTotal]);
        console.log('Applicable Rules for 600 EGP (no classification):', applicable);
        const [applicableWithClass] = yield conn.query(`
        SELECT * FROM loyalty_rules 
        WHERE status = 'active' 
          AND (minimumSpend IS NULL OR minimumSpend <= ?)
          AND (customerClassification IS NULL OR customerClassification = 'الجميع')
    `, [orderTotal]);
        console.log('Applicable Rules for 600 EGP (with class الجميع):', applicableWithClass);
        conn.release();
        process.exit(0);
    });
}
run().catch(console.error);
