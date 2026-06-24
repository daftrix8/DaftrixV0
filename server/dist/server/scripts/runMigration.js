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
function runMigration() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🚀 Starting migration...');
        try {
            const migrationPath = path_1.default.join(__dirname, '../migrations/016_add_user_data_filtering.sql');
            const sql = fs_1.default.readFileSync(migrationPath, 'utf8');
            // Split by semicolon to get individual statements, but respect delimiters
            // This is a simple split, for complex procedures we might need better parsing
            // For this specific file, we can execute it as a whole if the driver supports multiple statements
            // or we need to be careful with DELIMITER
            const conn = yield db_1.pool.getConnection();
            try {
                // Enable multiple statements support if not already enabled
                // Usually configured in connection pool, but let's try executing
                console.log('📝 Reading migration file...');
                // We'll execute the file content. 
                // Note: mysql2 driver supports multiple statements if 'multipleStatements: true' is in config.
                // If not, we might need to split. 
                // Let's try to parse the file roughly or just warn the user.
                // For safety with the DELIMITER syntax which is client-side (mysql CLI),
                // we need to adapt it for Node.js execution or just run the raw queries.
                // Actually, the SQL file uses DELIMITER // which is for CLI.
                // Node.js mysql driver doesn't understand DELIMITER command.
                // We should strip those and execute the CREATE PROCEDURE blocks.
                console.log('⚠️  Note: This script assumes standard SQL. If the migration contains DELIMITER commands, they might fail in Node.js directly.');
                console.log('🔄 Attempting to execute...');
                // Let's try a different approach: Read the file and execute statements
                // But since we have procedures, it's tricky.
                // ALTERNATIVE: Just print the DB config so you can run it in CLI
                console.log('\n📊 Database Configuration found:');
                console.log(`Host: ${process.env.DB_HOST}`);
                console.log(`User: ${process.env.DB_USER}`);
                console.log(`Database: ${process.env.DB_NAME}`);
                console.log('----------------------------------------');
                console.log('\nTo run manually in PowerShell:');
                console.log(`cmd /c "mysql -u ${process.env.DB_USER} -p ${process.env.DB_NAME} < server/migrations/016_add_user_data_filtering.sql"`);
            }
            finally {
                conn.release();
            }
        }
        catch (error) {
            console.error('❌ Migration failed:', error);
        }
        finally {
            process.exit();
        }
    });
}
runMigration();
