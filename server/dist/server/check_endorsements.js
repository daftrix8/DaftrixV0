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
const promise_1 = require("mysql2/promise");
function checkEndorsements() {
    return __awaiter(this, void 0, void 0, function* () {
        const pool = (0, promise_1.createPool)({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'erp_db'
        });
        const [rows] = yield pool.query('SELECT * FROM cheques WHERE type = "ENDORSED" OR status = "ENDORSED"');
        console.log(rows);
        process.exit(0);
    });
}
checkEndorsements();
