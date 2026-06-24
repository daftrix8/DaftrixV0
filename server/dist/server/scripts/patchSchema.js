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
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Starting full schema patch migration...');
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306,
            multipleStatements: true,
            authPlugins: {
                mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0')
            }
        });
        try {
            const sql1 = fs_1.default.readFileSync(path_1.default.join(__dirname, '../migrations/CLIENT_DATABASE_FULL_SETUP.sql'), 'utf8');
            console.log('Executing CLIENT_DATABASE_FULL_SETUP.sql...');
            yield conn.query(sql1);
            const sql2 = fs_1.default.readFileSync(path_1.default.join(__dirname, '../migrations/002_create_bom_tables.sql'), 'utf8');
            console.log('Executing 002_create_bom_tables.sql...');
            yield conn.query(sql2);
            console.log('Migration completed successfully.');
        }
        catch (e) {
            console.error('Migration failed:', e.message);
        }
        finally {
            yield conn.end();
            process.exit(0);
        }
    });
}
run();
