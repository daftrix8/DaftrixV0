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
function migrateHR() {
    return __awaiter(this, void 0, void 0, function* () {
        const dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'cloud_erp',
            port: Number(process.env.DB_PORT) || 3306
        };
        console.log(`🔌 Connecting to ${dbConfig.database}...`);
        const pool = (0, promise_1.createPool)(dbConfig);
        try {
            const conn = yield pool.getConnection();
            console.log('✅ Connected.');
            // 1. Update Employees Table
            const [empCols] = yield conn.query('SHOW COLUMNS FROM employees');
            const hasSalesmanId = empCols.some((c) => c.Field === 'salesmanId');
            if (!hasSalesmanId) {
                console.log('➕ Adding salesmanId to employees...');
                yield conn.query(`
                ALTER TABLE employees 
                ADD COLUMN salesmanId VARCHAR(36) DEFAULT NULL AFTER branchId,
                ADD CONSTRAINT fk_employee_salesman FOREIGN KEY (salesmanId) REFERENCES salesmen(id) ON DELETE SET NULL
            `);
                console.log('✅ salesmanId added.');
            }
            else {
                console.log('ℹ️ salesmanId already exists.');
            }
            // 2. Update Payroll Entries Table
            const [payCols] = yield conn.query('SHOW COLUMNS FROM payroll_entries');
            const hasDeficit = payCols.some((c) => c.Field === 'salesmanDeficit');
            const hasDeduction = payCols.some((c) => c.Field === 'salesmanDeficitDeduction');
            if (!hasDeficit) {
                console.log('➕ Adding salesmanDeficit to payroll_entries...');
                yield conn.query(`
                ALTER TABLE payroll_entries 
                ADD COLUMN salesmanDeficit DECIMAL(15,2) DEFAULT 0
            `);
                console.log('✅ salesmanDeficit added.');
            }
            if (!hasDeduction) {
                console.log('➕ Adding salesmanDeficitDeduction to payroll_entries...');
                yield conn.query(`
                ALTER TABLE payroll_entries 
                ADD COLUMN salesmanDeficitDeduction DECIMAL(15,2) DEFAULT 0
            `);
                console.log('✅ salesmanDeficitDeduction added.');
            }
            console.log('🎉 HR Migration completed successfully!');
        }
        catch (e) {
            console.error('❌ HR Migration failed:', e);
        }
        finally {
            yield pool.end();
        }
    });
}
migrateHR();
