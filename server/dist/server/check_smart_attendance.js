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
const promise_1 = require("mysql2/promise");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = (0, promise_1.createPool)({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const conn = yield pool.getConnection();
            console.log('Connected to DB');
            // Check if employee_phone_tokens exists
            try {
                const [cols] = yield conn.query("SHOW COLUMNS FROM employee_phone_tokens");
                console.log('employee_phone_tokens table exists with columns:', cols.map(c => c.Field));
            }
            catch (e) {
                console.log('employee_phone_tokens table does NOT exist!');
            }
            // Check system_config table
            try {
                const [configs] = yield conn.query("SELECT * FROM system_config");
                console.log('System config entries count:', configs.length);
                if (configs.length > 0) {
                    console.log('Config keys:', Object.keys(configs[0]));
                    // Print relevant columns
                    configs.forEach((cfg) => {
                        console.log(`Config ID: ${cfg.id}`);
                        console.log(`enableSmartAttendance: ${cfg.enableSmartAttendance}`);
                        console.log(`modules:`, cfg.modules);
                    });
                }
            }
            catch (e) {
                console.log('Failed to query system_config:', e);
            }
            conn.release();
        }
        catch (e) {
            console.error(e);
        }
        finally {
            yield pool.end();
        }
    });
}
run();
