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
        const conn = yield (0, db_1.getConnection)();
        try {
            console.log("=== SYSTEM CONFIG ===");
            const [configRows] = yield conn.query('SELECT config FROM system_config LIMIT 1');
            const configData = configRows[0];
            if (configData && configData.config) {
                const parsedConfig = typeof configData.config === 'string'
                    ? JSON.parse(configData.config)
                    : configData.config;
                console.log("enableUserDataIsolation:", parsedConfig.enableUserDataIsolation);
                console.log("whoCanSeeAllData:", parsedConfig.whoCanSeeAllData);
                console.log("whoCanModifyOthersData:", parsedConfig.whoCanModifyOthersData);
            }
            else {
                console.log("No config data found in system_config table");
            }
            console.log("\n=== USERS ===");
            const [userRows] = yield conn.query('SELECT id, username, name, role, email, branchId FROM users');
            console.log(userRows);
            console.log("\n=== DISTINCT CREATOR NAMES IN INVOICES ===");
            const [creatorRows] = yield conn.query('SELECT DISTINCT createdBy, COUNT(*) as count FROM invoices GROUP BY createdBy');
            console.log(creatorRows);
        }
        catch (err) {
            console.error("Error occurred:", err);
        }
        finally {
            conn.release();
            process.exit(0);
        }
    });
}
main();
