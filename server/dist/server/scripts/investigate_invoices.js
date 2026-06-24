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
const dotenv_1 = __importDefault(require("dotenv"));
const path = __importStar(require("path"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
function investigate() {
    return __awaiter(this, void 0, void 0, function* () {
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true,
            authPlugins: {
                mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0')
            },
        });
        console.log('=== INVOICE INVESTIGATION ===\n');
        // Check total invoices
        const [totalInv] = yield pool.query(`SELECT COUNT(*) as cnt FROM invoices`);
        console.log('Total invoices:', totalInv[0].cnt);
        // Check invoices by type  
        const [byType] = yield pool.query(`SELECT type, COUNT(*) as cnt FROM invoices GROUP BY type`);
        console.log('\nInvoices by type:');
        for (const t of byType)
            console.log(`  ${t.type}: ${t.cnt}`);
        // Check OLD- prefixed invoices
        const [oldInv] = yield pool.query(`SELECT type, COUNT(*) as cnt FROM invoices WHERE number LIKE 'OLD-%' GROUP BY type`);
        console.log('\nOLD- prefixed invoices:');
        for (const t of oldInv)
            console.log(`  ${t.type}: ${t.cnt}`);
        // Check invoice lines for OLD invoices
        const [oldLines] = yield pool.query(`
    SELECT COUNT(*) as cnt FROM invoice_lines il 
    JOIN invoices i ON il.invoiceId = i.id 
    WHERE i.number LIKE 'OLD-%'
  `);
        console.log('\nOLD invoice lines:', oldLines[0].cnt);
        // Sample a specific OLD invoice with its lines
        const [sampleInv] = yield pool.query(`
    SELECT i.id, i.number, i.date, i.type, i.partnerId, i.partnerName, i.total, i.status, i.posted
    FROM invoices i 
    WHERE i.number LIKE 'OLD-S-%' 
    LIMIT 3
  `);
        console.log('\nSample OLD-S invoices:');
        for (const inv of sampleInv) {
            console.log(`  ${inv.number} | ${inv.date} | partner: ${inv.partnerName || 'NULL'} | total: ${inv.total} | status: ${inv.status} | posted: ${inv.posted}`);
            const [lines] = yield pool.query(`SELECT productId, productName, quantity, price, total FROM invoice_lines WHERE invoiceId = ?`, [inv.id]);
            console.log(`    Lines: ${lines.length}`);
            for (const l of lines.slice(0, 3)) {
                console.log(`      ${l.productName || 'NULL'} | qty: ${l.quantity} | price: ${l.price} | total: ${l.total}`);
            }
        }
        // Check if the supplier ابراهيم غديه has any invoices linked
        const [ghadia] = yield pool.query(`SELECT id, name FROM partners WHERE name LIKE '%غديه ارت%'`);
        if (ghadia.length > 0) {
            const partnerId = ghadia[0].id;
            console.log(`\n=== Invoices for "${ghadia[0].name}" (${partnerId}) ===`);
            const [partnerInv] = yield pool.query(`
      SELECT number, type, date, total FROM invoices WHERE partnerId = ? ORDER BY date LIMIT 10
    `, [partnerId]);
            console.log(`Found ${partnerInv.length} invoices:`);
            for (const inv of partnerInv) {
                console.log(`  ${inv.number} | ${inv.type} | ${inv.date} | ${inv.total}`);
            }
        }
        // Check if we have invoices with NULL partnerId
        const [nullPartner] = yield pool.query(`
    SELECT COUNT(*) as cnt FROM invoices WHERE partnerId IS NULL AND number LIKE 'OLD-%'
  `);
        console.log(`\nOLD invoices with NULL partner: ${nullPartner[0].cnt}`);
        // Check the partnerId mapping for Person IDs used in BuyInvoice
        const [samplePurchase] = yield pool.query(`
    SELECT i.number, i.partnerId, i.partnerName, i.total 
    FROM invoices i WHERE i.type = 'PURCHASE' AND i.number LIKE 'OLD-%' LIMIT 5
  `);
        console.log('\nSample PURCHASE invoices:');
        for (const inv of samplePurchase) {
            console.log(`  ${inv.number} | partnerId: ${inv.partnerId} | name: ${inv.partnerName} | total: ${inv.total}`);
        }
        yield pool.end();
    });
}
investigate().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
