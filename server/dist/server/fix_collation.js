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
        try {
            console.log('Fixing collation...');
            yield db_1.pool.query(`ALTER TABLE crm_categories CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            yield db_1.pool.query(`ALTER TABLE crm_leads MODIFY categoryId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL`);
            yield db_1.pool.query(`ALTER TABLE crm_tickets MODIFY categoryId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL`);
            console.log('Collation fixed.');
        }
        catch (err) {
            console.error(err);
        }
        finally {
            process.exit(0);
        }
    });
}
main();
