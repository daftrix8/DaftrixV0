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
const loyaltyController_1 = require("./controllers/loyaltyController");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const conn = yield (0, db_1.getConnection)();
        try {
            console.log('--- RULES ---');
            const [rules] = yield conn.query('SELECT * FROM loyalty_rules WHERE status = "active"');
            console.log(rules);
            console.log('\n--- RECENT TRANSACTIONS ---');
            const [txs] = yield conn.query('SELECT * FROM loyalty_transactions ORDER BY createdAt DESC LIMIT 5');
            console.log(txs);
            console.log('\n--- LATEST INVOICE WITH CUSTOMER ---');
            const [invoices] = yield conn.query(`
            SELECT i.id, i.partnerId, i.total, i.type, i.isPOSSale 
            FROM invoices i 
            WHERE i.partnerId IS NOT NULL 
            ORDER BY i.date DESC LIMIT 1
        `);
            const invoice = invoices[0];
            console.log(invoice);
            if (invoice) {
                const [partner] = yield conn.query('SELECT classification FROM partners WHERE id = ?', [invoice.partnerId]);
                const classification = ((_a = partner[0]) === null || _a === void 0 ? void 0 : _a.classification) || null;
                console.log('Customer classification:', classification);
                const applicableRules = yield (0, loyaltyController_1.getApplicableRules)(conn, invoice.total, classification);
                console.log('Applicable Rules:', applicableRules);
                // get items
                const [items] = yield conn.query('SELECT * FROM invoice_lines WHERE invoiceId = ?', [invoice.id]);
                const calc = yield (0, loyaltyController_1.calculatePointsEarned)(conn, applicableRules, invoice.total, items);
                console.log('Points calc:', calc);
            }
        }
        catch (e) {
            console.error(e);
        }
        finally {
            conn.release();
        }
        process.exit(0);
    });
}
run();
