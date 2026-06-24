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
function migrateLeaveManagement() {
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
            // 1. Create Leave Types Table
            console.log('📋 Creating leave_types table...');
            yield conn.query(`
            CREATE TABLE IF NOT EXISTS leave_types (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                nameEn VARCHAR(100),
                isPaid BOOLEAN DEFAULT TRUE,
                defaultDays INT DEFAULT 0,
                carryOver BOOLEAN DEFAULT FALSE,
                maxCarryOverDays INT DEFAULT 0,
                color VARCHAR(20) DEFAULT '#3b82f6',
                isActive BOOLEAN DEFAULT TRUE,
                requiresDocument BOOLEAN DEFAULT FALSE,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
            console.log('✅ leave_types table created.');
            // 2. Create Leave Balances Table
            console.log('📋 Creating leave_balances table...');
            yield conn.query(`
            CREATE TABLE IF NOT EXISTS leave_balances (
                id VARCHAR(36) PRIMARY KEY,
                employeeId VARCHAR(36) NOT NULL,
                leaveTypeId VARCHAR(36) NOT NULL,
                year INT NOT NULL,
                allocated INT DEFAULT 0,
                used INT DEFAULT 0,
                carriedOver INT DEFAULT 0,
                UNIQUE KEY unique_balance (employeeId, leaveTypeId, year),
                FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE,
                FOREIGN KEY (leaveTypeId) REFERENCES leave_types(id) ON DELETE CASCADE
            )
        `);
            console.log('✅ leave_balances table created.');
            // 3. Create Leave Requests Table
            console.log('📋 Creating leave_requests table...');
            yield conn.query(`
            CREATE TABLE IF NOT EXISTS leave_requests (
                id VARCHAR(36) PRIMARY KEY,
                employeeId VARCHAR(36) NOT NULL,
                leaveTypeId VARCHAR(36) NOT NULL,
                startDate DATE NOT NULL,
                endDate DATE NOT NULL,
                days INT NOT NULL,
                reason TEXT,
                status ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') DEFAULT 'PENDING',
                approvedBy VARCHAR(36),
                approvedAt TIMESTAMP NULL,
                rejectionReason TEXT,
                documentUrl VARCHAR(500),
                notes TEXT,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE,
                FOREIGN KEY (leaveTypeId) REFERENCES leave_types(id) ON DELETE RESTRICT,
                FOREIGN KEY (approvedBy) REFERENCES users(id) ON DELETE SET NULL
            )
        `);
            console.log('✅ leave_requests table created.');
            // 4. Insert Default Leave Types
            console.log('📋 Inserting default leave types...');
            yield conn.query(`
            INSERT IGNORE INTO leave_types (id, name, nameEn, isPaid, defaultDays, carryOver, maxCarryOverDays, color, requiresDocument) VALUES
            (UUID(), 'إجازة سنوية', 'Annual Leave', TRUE, 21, TRUE, 7, '#22c55e', FALSE),
            (UUID(), 'إجازة مرضية', 'Sick Leave', TRUE, 15, FALSE, 0, '#ef4444', TRUE),
            (UUID(), 'إجازة عارضة', 'Casual Leave', TRUE, 7, FALSE, 0, '#f97316', FALSE),
            (UUID(), 'إجازة بدون مرتب', 'Unpaid Leave', FALSE, 0, FALSE, 0, '#6b7280', FALSE),
            (UUID(), 'إجازة زواج', 'Marriage Leave', TRUE, 5, FALSE, 0, '#ec4899', FALSE),
            (UUID(), 'إجازة وفاة', 'Bereavement Leave', TRUE, 3, FALSE, 0, '#6366f1', FALSE),
            (UUID(), 'إجازة أمومة', 'Maternity Leave', TRUE, 90, FALSE, 0, '#8b5cf6', TRUE)
        `);
            console.log('✅ Default leave types inserted.');
            console.log('🎉 Leave Management migration completed successfully!');
        }
        catch (e) {
            console.error('❌ Leave Management migration failed:', e);
        }
        finally {
            yield pool.end();
        }
    });
}
migrateLeaveManagement();
