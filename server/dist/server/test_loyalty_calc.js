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
const loyaltyController_1 = require("./controllers/loyaltyController");
const db_1 = require("./db");
function test() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        // Simulate a POS order
        const orderTotal = 600;
        const cartItems = [
            { productId: 'some-uuid', quantity: 2, price: 300, total: 600, discount: 0 }
        ];
        const rules = yield (0, loyaltyController_1.getApplicableRules)(conn, orderTotal, undefined);
        console.log('Applicable Rules:', rules);
        if (rules.length > 0) {
            const result = yield (0, loyaltyController_1.calculatePointsEarned)(conn, rules, orderTotal, cartItems);
            console.log('Earned Points:', result);
        }
        conn.release();
        process.exit(0);
    });
}
test().catch(console.error);
