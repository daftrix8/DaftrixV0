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
function listUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('📋 Listing all users in database...\n');
        try {
            const conn = yield db_1.pool.getConnection();
            try {
                const [rows] = yield conn.query('SELECT id, username, name, role, status FROM users');
                const users = rows;
                if (users.length === 0) {
                    console.log('❌ No users found in the database.');
                }
                else {
                    console.log('ID | Username | Name | Role | Status');
                    console.log('-'.repeat(60));
                    users.forEach(u => {
                        console.log(`${u.id} | ${u.username} | ${u.name} | ${u.role} | ${u.status}`);
                    });
                    console.log('-'.repeat(60));
                }
            }
            finally {
                conn.release();
            }
        }
        catch (error) {
            console.error('❌ Error listing users:', error);
        }
        finally {
            process.exit();
        }
    });
}
listUsers();
