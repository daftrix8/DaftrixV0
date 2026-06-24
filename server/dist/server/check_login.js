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
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const userId = 'b8168be9-8d05-4675-bca4-30e862e5ae65'; // test2
            // 1. Check user record
            const [userRows] = yield db_1.pool.query('SELECT id, username, role, branchId, warehouseId, defaultTreasuryId FROM users WHERE id = ?', [userId]);
            console.log('=== USER RECORD ===');
            console.log(userRows[0]);
            // 2. Check branch context query (same as login)
            const [branchRows] = yield db_1.pool.query(`
            SELECT
                b.id          AS branchId,
                b.name        AS branchName,
                COALESCE(u.warehouseId, b.defaultWarehouseId, w.id) AS defaultWarehouseId,
                wh.name       AS defaultWarehouseName,
                b.defaultBankId,
                bk.name       AS defaultBankName
            FROM users u
            LEFT JOIN branches  b  ON u.branchId = b.id
            LEFT JOIN (
                SELECT branchId, MIN(id) AS id
                FROM warehouses WHERE branchId IS NOT NULL GROUP BY branchId
            ) w ON b.id = w.branchId
            LEFT JOIN warehouses wh ON COALESCE(u.warehouseId, b.defaultWarehouseId, w.id) = wh.id
            LEFT JOIN banks      bk ON b.defaultBankId = bk.id
            WHERE u.id = ?
            LIMIT 1`, [userId]);
            console.log('\n=== BRANCH CONTEXT (login query) ===');
            console.log(branchRows[0]);
            // 3. List all warehouses
            const [whRows] = yield db_1.pool.query('SELECT id, name, branchId FROM warehouses');
            console.log('\n=== ALL WAREHOUSES ===');
            console.log(whRows);
            // 4. Check if warehouseId matches any warehouse
            if ((_a = branchRows[0]) === null || _a === void 0 ? void 0 : _a.defaultWarehouseId) {
                const whId = branchRows[0].defaultWarehouseId;
                const match = whRows.find((w) => w.id === whId);
                console.log(`\n=== WAREHOUSE ID ${whId} EXISTS IN warehouses TABLE: ${match ? 'YES' : 'NO'} ===`);
                if (match)
                    console.log(match);
            }
        }
        catch (e) {
            console.error(e);
        }
        finally {
            process.exit(0);
        }
    });
}
main();
