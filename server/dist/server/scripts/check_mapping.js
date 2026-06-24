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
        var _a, _b, _c, _d, _e, _f, _g;
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        // Get ALL invoices without lines
        const [noLines] = yield conn.query(`
    SELECT i.id, i.number, i.type, i.status, i.total, i.paymentMethod, 
           i.partnerName, i.date, i.notes,
           i.createdBy
    FROM invoices i
    WHERE NOT EXISTS (SELECT 1 FROM invoice_lines il WHERE il.invoiceId = i.id)
      AND i.type IN ('INVOICE_SALE','INVOICE_PURCHASE','RETURN_SALE','RETURN_PURCHASE')
      AND i.status IN ('POSTED','COMPLETED','PARTIAL')
    ORDER BY i.type, i.date DESC
  `);
        console.log(`Total invoices without lines: ${noLines.length}\n`);
        // Group by type and number prefix
        const byType = {};
        const byPrefix = {};
        for (const inv of noLines) {
            const type = inv.type;
            if (!byType[type])
                byType[type] = [];
            byType[type].push(inv);
            const prefix = ((_a = inv.number) === null || _a === void 0 ? void 0 : _a.substring(0, 6)) || 'NULL';
            byPrefix[`${prefix}|${type}`] = (byPrefix[`${prefix}|${type}`] || 0) + 1;
        }
        console.log('=== By type ===');
        for (const [type, invs] of Object.entries(byType)) {
            console.log(`  ${type}: ${invs.length}`);
        }
        console.log('\n=== By number prefix + type ===');
        for (const [key, cnt] of Object.entries(byPrefix).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${key}: ${cnt}`);
        }
        // Sample some
        console.log('\n=== Samples ===');
        for (const [type, invs] of Object.entries(byType)) {
            console.log(`\n--- ${type} (${invs.length}) ---`);
            for (const inv of invs.slice(0, 10)) {
                console.log(`  #${inv.number} | ${inv.status} | total=${inv.total} | ${inv.paymentMethod} | ${((_d = (_c = (_b = inv.date) === null || _b === void 0 ? void 0 : _b.toISOString) === null || _c === void 0 ? void 0 : _c.call(_b)) === null || _d === void 0 ? void 0 : _d.slice(0, 10)) || inv.date} | partner=${(_e = inv.partnerName) === null || _e === void 0 ? void 0 : _e.slice(0, 25)} | by=${inv.createdBy} | notes=${((_f = inv.notes) === null || _f === void 0 ? void 0 : _f.slice(0, 40)) || ''}`);
            }
            if (invs.length > 10)
                console.log(`  ... and ${invs.length - 10} more`);
        }
        // Check: are these zero-total invoices?
        const zeroTotal = noLines.filter((i) => i.total === 0 || i.total === null);
        const nonZeroTotal = noLines.filter((i) => i.total > 0);
        console.log(`\n=== Total amounts ===`);
        console.log(`  Zero total: ${zeroTotal.length}`);
        console.log(`  Non-zero total: ${nonZeroTotal.length}`);
        if (nonZeroTotal.length > 0) {
            console.log('\n  Non-zero samples:');
            for (const inv of nonZeroTotal.slice(0, 10)) {
                console.log(`    #${inv.number} | total=${inv.total} | ${inv.type} | ${(_g = inv.partnerName) === null || _g === void 0 ? void 0 : _g.slice(0, 25)}`);
            }
        }
        // Check if any have deleted_invoice_lines (were deleted and restored?)
        let withDeletedLines = 0;
        for (const inv of noLines) {
            const [dl] = yield conn.query(`SELECT COUNT(*) as cnt FROM deleted_invoice_lines WHERE originalInvoiceId = ?`, [inv.id]);
            if (dl[0].cnt > 0)
                withDeletedLines++;
        }
        console.log(`\n  Have deleted_invoice_lines: ${withDeletedLines}`);
        yield conn.end();
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
