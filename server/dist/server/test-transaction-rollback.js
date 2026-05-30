"use strict";
/**
 * Transaction Rollback Verification Test
 *
 * This script tests that database transactions properly rollback on error,
 * ensuring data integrity is maintained when operations fail.
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
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
const crypto_1 = require("crypto");
function testPartnerRollback() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\\n=== Testing Partner Transaction Rollback ===');
        const testId = (0, crypto_1.randomUUID)();
        const conn = yield db_1.pool.getConnection();
        try {
            yield conn.beginTransaction();
            // Create a test partner
            yield conn.query('INSERT INTO partners (id, name, type, isCustomer, isSupplier) VALUES (?, ?, ?, ?, ?)', [testId, 'Test Rollback Partner', 'CUSTOMER', 1, 0]);
            console.log('✓ Partner inserted');
            // Force an error (duplicate key)
            yield conn.query('INSERT INTO partners (id, name, type, isCustomer, isSupplier) VALUES (?, ?, ?, ?, ?)', [testId, 'Duplicate Partner', 'CUSTOMER', 1, 0]);
            yield conn.commit();
            console.log('❌ FAILED: Transaction should have failed!');
        }
        catch (error) {
            yield conn.rollback();
            console.log('✓ Rollback executed successfully');
            // Verify partner was not created
            const [rows] = yield conn.query('SELECT * FROM partners WHERE id = ?', [testId]);
            if (rows.length === 0) {
                console.log('✓ Data correctly rolled back - no orphaned records');
                return true;
            }
            else {
                console.log('❌ FAILED: Data was not rolled back!');
                return false;
            }
        }
        finally {
            conn.release();
        }
    });
}
function testAccountRollback() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\\n=== Testing Account Transaction Rollback ===');
        const testId = (0, crypto_1.randomUUID)();
        const conn = yield db_1.pool.getConnection();
        try {
            yield conn.beginTransaction();
            // Create a test account
            yield conn.query('INSERT INTO accounts (id, code, name, type, balance, openingBalance) VALUES (?, ?, ?, ?, ?, ?)', [testId, 'TEST-001', 'Test Rollback Account', 'ASSET', 0, 0]);
            console.log('✓ Account inserted');
            // Force an error (duplicate code)
            yield conn.query('INSERT INTO accounts (id, code, name, type, balance, openingBalance) VALUES (?, ?, ?, ?, ?, ?)', [(0, crypto_1.randomUUID)(), 'TEST-001', 'Duplicate Account', 'ASSET', 0, 0]);
            yield conn.commit();
            console.log('❌ FAILED: Transaction should have failed!');
        }
        catch (error) {
            yield conn.rollback();
            console.log('✓ Rollback executed successfully');
            // Verify account was not created
            const [rows] = yield conn.query('SELECT * FROM accounts WHERE id = ?', [testId]);
            if (rows.length === 0) {
                console.log('✓ Data correctly rolled back - no orphaned records');
                return true;
            }
            else {
                console.log('❌ FAILED: Data was not rolled back!');
                return false;
            }
        }
        finally {
            conn.release();
        }
    });
}
function testUserRollback() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\\n=== Testing User Transaction Rollback ===');
        const testId = (0, crypto_1.randomUUID)();
        const conn = yield db_1.pool.getConnection();
        try {
            yield conn.beginTransaction();
            // Create a test user
            yield conn.query('INSERT INTO users (id, name, email, username, password, role, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [testId, 'Test User', 'test@rollback.com', 'testuser', 'hashedpass', 'USER', 'ACTIVE', '[]']);
            console.log('✓ User inserted');
            // Force an error (duplicate email)
            yield conn.query('INSERT INTO users (id, name, email, username, password, role, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [(0, crypto_1.randomUUID)(), 'Test User 2', 'test@rollback.com', 'testuser2', 'hashedpass', 'USER', 'ACTIVE', '[]']);
            yield conn.commit();
            console.log('❌ FAILED: Transaction should have failed!');
        }
        catch (error) {
            yield conn.rollback();
            console.log('✓ Rollback executed successfully');
            // Verify user was not created
            const [rows] = yield conn.query('SELECT * FROM users WHERE id = ?', [testId]);
            if (rows.length === 0) {
                console.log('✓ Data correctly rolled back - no orphaned records');
                return true;
            }
            else {
                console.log('❌ FAILED: Data was not rolled back!');
                return false;
            }
        }
        finally {
            conn.release();
        }
    });
}
function runAllTests() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\\n╔════════════════════════════════════════════════╗');
        console.log('║  Transaction Rollback Verification Tests      ║');
        console.log('╚════════════════════════════════════════════════╝');
        try {
            const results = yield Promise.all([
                testPartnerRollback(),
                testAccountRollback(),
                testUserRollback()
            ]);
            const allPassed = results.every(r => r === true);
            console.log('\\n' + '='.repeat(50));
            if (allPassed) {
                console.log('✅ ALL TESTS PASSED - Transaction management is working correctly!');
            }
            else {
                console.log('❌ SOME TESTS FAILED - Review the output above');
            }
            console.log('='.repeat(50) + '\\n');
            yield db_1.pool.end();
            process.exit(allPassed ? 0 : 1);
        }
        catch (error) {
            console.error('\\n❌ Test suite failed:', error);
            yield db_1.pool.end();
            process.exit(1);
        }
    });
}
runAllTests();
