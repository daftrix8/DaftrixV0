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
dotenv_1.default.config();
function scanDatabases() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('--- STARTING DATABASE SCAN ---');
            // Connect to MySQL root to list databases
            const rootConn = yield promise_1.default.createConnection({
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || 'admin123',
                port: Number(process.env.DB_PORT) || 3306,
            });
            const [dbs] = yield rootConn.query('SHOW DATABASES');
            const databases = dbs.map(row => row.Database);
            console.log(`Found ${databases.length} databases:`, databases.join(', '));
            yield rootConn.end();
            for (const dbName of databases) {
                if (['information_schema', 'mysql', 'performance_schema', 'sys'].includes(dbName))
                    continue;
                console.log(`\nChecking database: [${dbName}]...`);
                let conn;
                try {
                    conn = yield promise_1.default.createConnection({
                        host: process.env.DB_HOST || 'localhost',
                        user: process.env.DB_USER || 'root',
                        password: process.env.DB_PASSWORD || 'admin123',
                        database: dbName,
                        port: Number(process.env.DB_PORT) || 3306,
                    });
                    // Check if vehicle_targets exists
                    const [tables] = yield conn.query(`SHOW TABLES LIKE 'vehicle_targets'`);
                    if (tables.length === 0) {
                        console.log(`  -> Table 'vehicle_targets' does not exist.`);
                        continue;
                    }
                    // Check row count
                    const [rows] = yield conn.query(`SELECT * FROM vehicle_targets`);
                    const count = rows.length;
                    console.log(`  -> Found 'vehicle_targets' with ${count} rows.`);
                    if (count > 0) {
                        console.log('  -> DATA PREVIEW:', JSON.stringify(rows, null, 2));
                        console.log(`  -> !!! POSSIBLE MATCH FOUND IN [${dbName}] !!!`);
                    }
                }
                catch (err) {
                    console.log(`  -> Error accessing ${dbName}:`, err.message);
                }
                finally {
                    if (conn)
                        yield conn.end();
                }
            }
        }
        catch (error) {
            console.error('Fatal Error:', error);
        }
    });
}
scanDatabases();
