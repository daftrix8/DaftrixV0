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
const promise_1 = __importDefault(require("mysql2/promise"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const pool = promise_1.default.createPool({
                host: 'localhost',
                user: 'root',
                password: '',
                database: 'cloud_erp',
                authPlugins: {
                    mysql_clear_password: () => () => Buffer.from('\0')
                }
            });
            console.log('Querying for payments...');
            const [rows] = yield pool.query("SELECT id, number, type, date, total, referenceInvoiceId, createdBy, notes, createdAt FROM invoices WHERE number IN ('PAY-00057', 'PAY-579768') OR id IN ('PAY-00057', 'PAY-579768')");
            console.table(rows);
            process.exit(0);
        }
        catch (e) {
            console.error(e);
            process.exit(1);
        }
    });
}
run();
