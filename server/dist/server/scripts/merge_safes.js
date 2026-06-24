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
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
function mergeSafes() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Connecting to Database...");
        const connection = yield promise_1.default.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'admin123',
            database: process.env.DB_NAME || 'cloud_erp',
        });
        try {
            yield connection.beginTransaction();
            // 1. Find the REAL ID of the main safe
            const [mainSafeRows] = yield connection.execute(`SELECT id, name FROM accounts WHERE name LIKE '%رئيسية%' OR name LIKE '%رئيسي%' LIMIT 1`);
            if (mainSafeRows.length === 0) {
                throw new Error("Could not find Main Safe!");
            }
            const MAIN_SAFE_ID = mainSafeRows[0].id;
            console.log(`✅ Found Main Safe: ${mainSafeRows[0].name} (ID: ${MAIN_SAFE_ID})`);
            // Find unused accounts
            const [subSafeRows] = yield connection.execute(`SELECT id FROM accounts WHERE name LIKE '%فرعية%' OR name LIKE '%إضافي%' OR id IN ('10102', '10202', '10203')`);
            if (subSafeRows.length === 0) {
                console.log("No sub safes to merge.");
                yield connection.commit();
                yield connection.end();
                return;
            }
            for (const row of subSafeRows) {
                const TARGET_ID = row.id;
                console.log(`Merging ${TARGET_ID} into ${MAIN_SAFE_ID}...`);
                // Update Journal Lines (The Real source of truth)
                yield connection.execute(`UPDATE journal_lines SET accountId = ?, accountName = ? WHERE accountId = ?`, [MAIN_SAFE_ID, mainSafeRows[0].name, TARGET_ID]);
                // Update Invoices if they reference the sub safe
                try {
                    yield connection.execute(`UPDATE invoices SET treasuryAccountId = ? WHERE treasuryAccountId = ?`, [MAIN_SAFE_ID, TARGET_ID]);
                }
                catch (e) {
                    console.log("No treasuryAccountId in invoices or no invoice table, skipping.");
                }
                // Update user configurations if they have a default safe map
                try {
                    yield connection.execute(`UPDATE user_configs SET defaultTreasuryId = ? WHERE defaultTreasuryId = ?`, [MAIN_SAFE_ID, TARGET_ID]);
                }
                catch (e) {
                    // Ignore missing tables
                }
                // Now safe to delete
                yield connection.execute(`DELETE FROM accounts WHERE id = ?`, [TARGET_ID]);
                console.log(`Deleted ${TARGET_ID}`);
            }
            // Recalculate Main Safe balance from journal lines
            const [calcResult] = yield connection.execute(`
            SELECT SUM(debit - credit) as newBalance 
            FROM journal_lines 
            WHERE accountId = ?
        `, [MAIN_SAFE_ID]);
            const newBalance = calcResult[0].newBalance || 0;
            yield connection.execute(`UPDATE accounts SET balance = ? WHERE id = ?`, [newBalance, MAIN_SAFE_ID]);
            console.log(`Main Safe Balance Recalculated: ${newBalance}`);
            yield connection.commit();
            console.log("🎉 Successfully merged sub safe and bank 1 & 2 into main safe and deleted them!");
        }
        catch (e) {
            yield connection.rollback();
            console.error("Error during merge!", e);
        }
        finally {
            yield connection.end();
        }
    });
}
mergeSafes();
