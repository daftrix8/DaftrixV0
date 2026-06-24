"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        // Check how migrated invoices are tagged
        const [sample] = yield conn.query(`
    SELECT number, notes, type FROM invoices 
    WHERE notes LIKE '%[MIGRATED]%' OR notes LIKE '%MIGRATED%' OR number LIKE 'OLD-%'
    LIMIT 5
  `);
        console.log('Sample migrated invoices:');
        for (const r of sample)
            console.log(`  num="${r.number}", notes="${(_a = r.notes) === null || _a === void 0 ? void 0 : _a.slice(0, 80)}", type=${r.type}`);
        // Check how migrated PAYMENTS are tagged
        const [paySample] = yield conn.query(`
    SELECT number, notes, type FROM invoices 
    WHERE type IN ('PAYMENT','RECEIPT') 
    LIMIT 5
  `);
        console.log('\nSample payments:');
        for (const r of paySample)
            console.log(`  num="${r.number}", notes="${(_b = r.notes) === null || _b === void 0 ? void 0 : _b.slice(0, 80)}", type=${r.type}`);
        // Check number patterns
        const [numPatterns] = yield conn.query(`
    SELECT SUBSTRING(number, 1, 5) as prefix, type, COUNT(*) as cnt
    FROM invoices WHERE number IS NOT NULL GROUP BY prefix, type ORDER BY cnt DESC LIMIT 15
  `);
        console.log('\nNumber prefix patterns:');
        for (const r of numPatterns)
            console.log(`  "${r.prefix}" (${r.type}): ${r.cnt}`);
        // journal_lines column name
        const [jlCols] = yield conn.query('SHOW COLUMNS FROM journal_lines');
        console.log('\nJournal lines FK column:', jlCols.map((c) => c.Field).filter((f) => f.includes('ournal') || f.includes('entry')));
        yield conn.end();
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
