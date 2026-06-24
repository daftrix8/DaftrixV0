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
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load env
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../.env') });
const pool = promise_1.default.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'daftrix_erp',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
function testLock() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Testing GET_LOCK concurrency...');
        const lockKey = 'test_lock_123';
        const task1 = () => __awaiter(this, void 0, void 0, function* () {
            const conn = yield pool.getConnection();
            console.log('Task 1: Getting connection');
            try {
                console.log('Task 1: Requesting Lock...');
                const [res] = yield conn.query("SELECT GET_LOCK(?, 5) as locked", [lockKey]);
                console.log('Task 1: Lock Result:', res[0].locked);
                if (res[0].locked) {
                    console.log('Task 1: Acquired Lock! Sleeping 3s...');
                    yield new Promise(r => setTimeout(r, 3000));
                    console.log('Task 1: Releasing Lock...');
                    yield conn.query("SELECT RELEASE_LOCK(?)", [lockKey]);
                    console.log('Task 1: Released.');
                }
            }
            finally {
                conn.release();
            }
        });
        const task2 = () => __awaiter(this, void 0, void 0, function* () {
            // Wait 500ms to ensure Task 1 starts
            yield new Promise(r => setTimeout(r, 500));
            const conn = yield pool.getConnection();
            console.log('Task 2: Getting connection');
            try {
                console.log('Task 2: Requesting Lock (Should wait)...');
                const start = Date.now();
                const [res] = yield conn.query("SELECT GET_LOCK(?, 5) as locked", [lockKey]);
                const duration = Date.now() - start;
                console.log('Task 2: Lock Result:', res[0].locked, 'Waited:', duration, 'ms');
                if (duration < 2000) {
                    console.error('❌ FAILURE: Task 2 did not wait long enough!');
                }
                else {
                    console.log('✅ SUCCESS: Task 2 waited for Task 1.');
                    yield conn.query("SELECT RELEASE_LOCK(?)", [lockKey]);
                }
            }
            finally {
                conn.release();
            }
        });
        yield Promise.all([task1(), task2()]);
        console.log('Test Complete.');
        process.exit(0);
    });
}
testLock().catch(console.error);
