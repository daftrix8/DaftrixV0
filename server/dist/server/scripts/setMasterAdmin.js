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
function setMasterAdmin() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🚀 Upgrading account to MASTER_ADMIN...');
        const targetId = 'myst';
        try {
            const conn = yield db_1.pool.getConnection();
            try {
                // Check if user exists first
                const [users] = yield conn.query('SELECT * FROM users WHERE id = ? OR username = ?', [targetId, targetId]);
                const userList = users;
                if (userList.length === 0) {
                    console.log(`❌ User with ID or Username '${targetId}' not found!`);
                    console.log('Please check the ID/Username and try again.');
                    return;
                }
                const user = userList[0];
                console.log(`👤 Found user: ${user.name} (${user.username})`);
                // Update the role
                const [result] = yield conn.query("UPDATE users SET role = 'MASTER_ADMIN', permissions = '[\"all\"]' WHERE id = ?", [user.id]);
                console.log('✅ Success! User role updated to MASTER_ADMIN.');
                console.log('------------------------------------------------');
                console.log('🎉 You now have full developer access:');
                console.log('   - Hidden from UI role selectors');
                console.log('   - Bypass all transaction limits');
                console.log('   - See ALL data regardless of settings');
                console.log('   - Modify ANY data');
            }
            finally {
                conn.release();
            }
        }
        catch (error) {
            console.error('❌ Error updating user:', error);
        }
    });
}
setMasterAdmin().then(() => process.exit());
