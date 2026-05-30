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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("./db"));
function test() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [rows] = yield db_1.default.query(`SELECT jl.accountId,
                        je.id as journalId,
                        COALESCE(SUM(jl.debit), 0) as d,
                        COALESCE(SUM(jl.credit), 0) as cr
                 FROM journal_lines jl
                 JOIN journal_entries je ON jl.journalId = je.id
                 WHERE jl.accountId IN (SELECT id FROM accounts WHERE isTreasury = 1)
                   AND (je.description LIKE '%مصروف%' OR (je.description NOT LIKE 'صادر%' AND EXISTS (SELECT 1 FROM journal_lines jlf JOIN accounts a ON jlf.accountId = a.id WHERE jlf.journalId = je.id AND a.type = 'EXPENSE')))
                 GROUP BY jl.accountId, je.id LIMIT 10`);
            console.log(rows);
        }
        catch (e) {
            console.error("ERROR:");
            console.error(e);
        }
        process.exit(0);
    });
}
test();
