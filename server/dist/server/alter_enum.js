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
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        yield conn.query("ALTER TABLE employee_advances MODIFY COLUMN type ENUM('ADVANCE', 'LOAN', 'SHORTAGE') DEFAULT 'ADVANCE'");
        yield conn.query("ALTER TABLE employee_advances MODIFY COLUMN loanType ENUM('ADVANCE', 'LOAN', 'SHORTAGE') DEFAULT 'ADVANCE'");
        console.log('Successfully altered employee_advances ENUMs');
        process.exit(0);
    }
    catch (e) {
        console.error(e);
        process.exit(1);
    }
}))();
