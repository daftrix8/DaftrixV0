"use strict";
/**
 * Backdate Adjustment Entries
 *
 * This script backdates all SYSTEM_ADJUSTMENT and BALANCE_SYNC entries
 * to 2020-01-01 so they appear in the opening balance for any report period.
 */
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
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '..', '.env') });
function backdateAdjustments() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('='.repeat(50));
        console.log('📅 Backdating Adjustment Entries');
        console.log('='.repeat(50));
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'erp_system'
        });
        try {
            // Check how many entries need backdating
            const [before] = yield conn.query(`
            SELECT COUNT(*) as cnt 
            FROM stock_movements 
            WHERE reference_type IN ('SYSTEM_ADJUSTMENT', 'BALANCE_SYNC')
              AND movement_date > '2020-01-01'
        `);
            console.log(`\n📊 Found ${before[0].cnt} adjustment entries to backdate\n`);
            if (before[0].cnt === 0) {
                console.log('✅ No entries need backdating.\n');
                return;
            }
            // Backdate all adjustment entries to 2020-01-01
            const [result] = yield conn.query(`
            UPDATE stock_movements 
            SET movement_date = '2020-01-01 00:00:00' 
            WHERE reference_type IN ('SYSTEM_ADJUSTMENT', 'BALANCE_SYNC')
        `);
            console.log(`✅ Updated ${result.affectedRows} entries\n`);
            console.log('All adjustment entries now have date: 2020-01-01');
            console.log('They will appear in "opening balance" for any report period.\n');
        }
        finally {
            yield conn.end();
        }
    });
}
backdateAdjustments()
    .then(() => {
    console.log('Script completed successfully.');
    process.exit(0);
})
    .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
