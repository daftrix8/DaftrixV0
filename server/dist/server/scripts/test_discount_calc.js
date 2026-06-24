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
const dotenv_1 = __importDefault(require("dotenv"));
const promise_1 = require("mysql2/promise");
dotenv_1.default.config({ path: '../.env' });
function runTest() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        console.log('🧪 Starting Discount Calculation Test...');
        // Database Config
        const dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'cloud_erp',
            port: Number(process.env.DB_PORT) || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        };
        console.log(`🔌 Connecting to DB: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
        const pool = (0, promise_1.createPool)(dbConfig);
        try {
            const conn = yield pool.getConnection();
            console.log('✅ Connected.');
            // 1. Fetch a valid Partner ID
            const [partners] = yield conn.query('SELECT id, name FROM partners LIMIT 1');
            const partnerId = (_a = partners[0]) === null || _a === void 0 ? void 0 : _a.id;
            const partnerName = ((_b = partners[0]) === null || _b === void 0 ? void 0 : _b.name) || 'Test Partner';
            if (!partnerId) {
                console.error('❌ No partners found in DB. Cannot test.');
                return;
            }
            // 2. Define Test Data
            const testDate = new Date().toISOString().slice(0, 10);
            const testInvoiceId = 'TEST_INV_' + Date.now();
            const testDiscount = 150;
            console.log(`📅 Test Date: ${testDate}`);
            console.log(`📝 Creating Test Invoice: ${testInvoiceId} with discount ${testDiscount} for ${partnerName} (${partnerId})`);
            // 3. Insert Test Invoice
            yield conn.query(`
            INSERT INTO invoices (
                id, number, date, type, partnerId, partnerName, total, status, globalDiscount, discount
            ) VALUES (?, ?, NOW(), 'INVOICE_SALE', ?, ?, 1000, 'POSTED', ?, ?)
        `, [testInvoiceId, testInvoiceId, partnerId, partnerName, testDiscount, 0]);
            // Testing storage in 'globalDiscount' column as per vehicleController
            // 4. Run Query
            console.log('🔍 Running Settlement Query...');
            const [rows] = yield conn.query(`
            SELECT COALESCE(SUM(COALESCE(globalDiscount, 0) + COALESCE(discount, 0)), 0) as totalDiscounts
            FROM invoices 
            WHERE DATE(date) = ?
            AND (type LIKE '%SALE%' AND type NOT LIKE '%RETURN%')
            AND status = 'POSTED'
        `, [testDate]);
            const result = Number((_c = rows[0]) === null || _c === void 0 ? void 0 : _c.totalDiscounts);
            console.log(`🔢 Result: ${result}`);
            // Note: Query sums ALL sales for the date, so if there are other sales, result > testDiscount
            if (result >= testDiscount) {
                console.log('✅ PASS: Discount was found and calculated.');
            }
            else {
                console.log('❌ FAIL: Discount was NOT found.');
            }
            // 5. Check Raw Invoice
            const [inv] = yield conn.query('SELECT * FROM invoices WHERE id = ?', [testInvoiceId]);
            console.log('📄 Raw Saved Invoice:', {
                id: inv[0].id,
                date: inv[0].date,
                globalDiscount: inv[0].globalDiscount,
                discount: inv[0].discount,
                type: inv[0].type
            });
            // 6. Cleanup
            yield conn.query('DELETE FROM invoices WHERE id = ?', [testInvoiceId]);
            console.log('🧹 Cleanup done.');
        }
        catch (e) {
            console.error('❌ Error:', e);
        }
        finally {
            yield pool.end();
        }
    });
}
runTest();
