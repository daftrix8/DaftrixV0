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
const crypto_1 = require("crypto");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const conn = yield (0, db_1.getConnection)();
        try {
            // 1. Get first customer
            const [customers] = yield conn.query('SELECT id, name FROM partners WHERE type IN ("CUSTOMER", "BOTH") LIMIT 1');
            const customerId = (_a = customers[0]) === null || _a === void 0 ? void 0 : _a.id;
            if (!customerId) {
                console.log('No customers found');
                return;
            }
            // 2. Mock cart items
            const cartItems = [
                { productId: (0, crypto_1.randomUUID)(), quantity: 1, price: 600, total: 600, discount: 0 }
            ];
            // 3. Call function
            const invoiceId = (0, crypto_1.randomUUID)();
            console.log(`Running recordLoyaltyEarn for customer ${customerId}`);
            const result = yield (0, loyaltyController_1.recordLoyaltyEarn)(conn, customerId, invoiceId, 600, 'test_user', cartItems);
            console.log('Result:', result);
            // 4. Verify in DB
            const [txs] = yield conn.query('SELECT * FROM loyalty_transactions WHERE orderId = ?', [invoiceId]);
            console.log('Transactions created:', txs);
        }
        catch (err) {
            console.error('Error:', err);
        }
        finally {
            conn.release();
        }
        process.exit(0);
    });
}
run().catch(console.error);
