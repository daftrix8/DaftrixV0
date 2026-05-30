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
            const [invs] = yield db_1.pool.query('SELECT * FROM invoices WHERE id LIKE \'%274120%\' OR id LIKE \'%17760212660%\'');
            console.log('Invoices:', invs);
            const [jours] = yield db_1.pool.query('SELECT * FROM journal_entries WHERE referenceId LIKE \'%274120%\' OR referenceId LIKE \'%17760212660%\'');
            console.log('Journals:', jours);
        }
        catch (e) {
            console.error(e);
        }
        process.exit(0);
    });
}
run();
