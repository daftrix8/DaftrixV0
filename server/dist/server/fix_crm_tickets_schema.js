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
            console.log('Adding appointment_date column to crm_tickets...');
            yield (0, db_1.safePoolQuery)('ALTER TABLE crm_tickets ADD COLUMN appointment_date DATETIME NULL');
            console.log('Successfully added appointment_date column!');
        }
        catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('Column appointment_date already exists.');
            }
            else {
                console.error('Error adding column:', err);
            }
        }
        process.exit(0);
    });
}
main();
