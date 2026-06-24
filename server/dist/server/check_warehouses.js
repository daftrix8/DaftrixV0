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
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [warehouses] = yield db_1.pool.query('SELECT id, name, branchId FROM warehouses');
            console.log('--- WAREHOUSES ---');
            console.log(warehouses);
            const [branches] = yield db_1.pool.query('SELECT id, name FROM branches');
            console.log('\n--- BRANCHES ---');
            console.log(branches);
            const [users] = yield db_1.pool.query('SELECT id, username, name, role, branchId, warehouseId FROM users');
            console.log('\n--- USERS ---');
            console.log(users);
            process.exit(0);
        }
        catch (err) {
            console.error('Error querying database:', err);
            process.exit(1);
        }
    });
}
check();
