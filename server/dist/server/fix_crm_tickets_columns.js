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
function safePoolQuery(sql) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield db_1.pool.query(sql);
        }
        catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log(`Column already exists.`);
            }
            else {
                console.error(`Error executing: ${sql}`, err.message);
            }
        }
    });
}
function fixMissingColumns() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Adding attachments column to crm_tickets...');
        yield safePoolQuery('ALTER TABLE crm_tickets ADD COLUMN attachments LONGTEXT NULL');
        console.log('Adding created_by column to crm_tickets...');
        yield safePoolQuery('ALTER TABLE crm_tickets ADD COLUMN created_by VARCHAR(36) NULL');
        console.log('Adding address column to crm_tickets...');
        yield safePoolQuery('ALTER TABLE crm_tickets ADD COLUMN address TEXT NULL');
        console.log('Adding is_internal column to crm_ticket_comments...');
        yield safePoolQuery('ALTER TABLE crm_ticket_comments ADD COLUMN is_internal TINYINT(1) NOT NULL DEFAULT 0');
        console.log('Adding attachments column to crm_ticket_comments...');
        yield safePoolQuery('ALTER TABLE crm_ticket_comments ADD COLUMN attachments LONGTEXT NULL');
        console.log('Done!');
        process.exit(0);
    });
}
fixMissingColumns().catch(err => {
    console.error(err);
    process.exit(1);
});
