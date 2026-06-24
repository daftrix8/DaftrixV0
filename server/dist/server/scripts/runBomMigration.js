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
const db_1 = require("../db");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Starting BOM tables migration...');
        const conn = yield db_1.pool.getConnection();
        try {
            const sql = fs_1.default.readFileSync(path_1.default.join(__dirname, '../migrations/002_create_bom_tables.sql'), 'utf8');
            const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));
            for (const statement of statements) {
                console.log('Executing:', statement.substring(0, 50) + '...');
                yield conn.query(statement);
            }
            console.log('Migration completed successfully.');
        }
        catch (e) {
            console.error('Migration failed:', e);
        }
        finally {
            conn.release();
            process.exit(0);
        }
    });
}
run();
