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
const db_1 = require("../db");
function checkTargets() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield db_1.pool.getConnection();
        // Check the product IDs for ملاية قطن فاخرة
        console.log('=== Products named ملاية قطن فاخرة ===');
        const [products] = yield conn.query(`
        SELECT id FROM products WHERE name = 'ملاية قطن فاخرة'
    `);
        console.log('Product IDs:', products.map(p => p.id));
        // Check salesman targets that reference ملاية قطن فاخرة by productId
        console.log('\n=== Salesman targets for ملاية قطن فاخرة ===');
        const [targets] = yield conn.query(`
        SELECT st.id, st.productId, p.name as productName, st.achievedQuantity, st.targetQuantity
        FROM salesman_targets st
        LEFT JOIN products p ON st.productId = p.id
        WHERE st.targetType = 'PRODUCT'
        ORDER BY p.name
    `);
        for (const t of targets) {
            console.log(`Target ${t.id.substring(0, 8)}...`);
            console.log(`  ProductId: ${t.productId}`);
            console.log(`  ProductName: ${t.productName || 'ORPHANED - product deleted!'}`);
            console.log(`  Progress: ${t.achievedQuantity} / ${t.targetQuantity}`);
            console.log('');
        }
        conn.release();
        yield db_1.pool.end();
    });
}
checkTargets().catch(console.error);
