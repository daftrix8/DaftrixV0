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
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // 1. Create table
            yield (0, db_1.safePoolQuery)(`
      CREATE TABLE IF NOT EXISTS crm_categories (
          id CHAR(36) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type ENUM('DEAL', 'TICKET', 'BOTH') DEFAULT 'BOTH',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
            console.log('Created crm_categories table');
            // 2. Add categoryId to crm_leads
            try {
                yield (0, db_1.safePoolQuery)(`ALTER TABLE crm_leads ADD categoryId CHAR(36) NULL`);
                console.log('Added categoryId to crm_leads');
            }
            catch (e) {
                if (e.code !== 'ER_DUP_FIELDNAME') {
                    throw e;
                }
                console.log('categoryId already exists in crm_leads');
            }
            // 3. Add request_type to partners
            try {
                yield (0, db_1.safePoolQuery)(`ALTER TABLE partners ADD request_type ENUM('DEAL', 'TICKET', 'INQUIRY', 'NONE') DEFAULT 'NONE'`);
                console.log('Added request_type to partners');
            }
            catch (e) {
                if (e.code !== 'ER_DUP_FIELDNAME') {
                    throw e;
                }
                console.log('request_type already exists in partners');
            }
            process.exit(0);
        }
        catch (e) {
            console.error(e);
            process.exit(1);
        }
    });
}
run();
