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
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
const crypto_1 = require("crypto");
function seedCategories() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('Connecting to database...');
            const conn = yield db_1.pool.getConnection();
            console.log('Connected.');
            // Get all EXPENSE, REVENUE, EQUITY accounts (excluding Cash/Bank)
            const [accounts] = yield conn.query(`
            SELECT * FROM accounts 
            WHERE type IN ('EXPENSE', 'REVENUE', 'EQUITY') 
            AND code NOT LIKE '101%' 
            AND code NOT LIKE '102%'
        `);
            console.log(`Found ${accounts.length} potential accounts.`);
            for (const acc of accounts) {
                // Check if a category already exists linked to this account
                const [existingLinked] = yield conn.query('SELECT * FROM cash_categories WHERE accountId = ?', [acc.id]);
                if (existingLinked.length === 0) {
                    // Check if a category exists with the same name (to avoid duplicates if not linked)
                    const [existingName] = yield conn.query('SELECT * FROM cash_categories WHERE name = ?', [acc.name]);
                    if (existingName.length === 0) {
                        console.log(`Creating category for account: ${acc.name}`);
                        const type = acc.type === 'REVENUE' ? 'INCOME' : (acc.type === 'EXPENSE' ? 'EXPENSE' : 'OTHER');
                        yield conn.query('INSERT INTO cash_categories (id, name, type, accountId) VALUES (?, ?, ?, ?)', [(0, crypto_1.randomUUID)(), acc.name, type, acc.id]);
                    }
                    else {
                        // Link the existing category if it's not linked
                        if (!existingName[0].accountId) {
                            console.log(`Linking existing category '${acc.name}' to account ${acc.code}`);
                            yield conn.query('UPDATE cash_categories SET accountId = ? WHERE id = ?', [acc.id, existingName[0].id]);
                        }
                    }
                }
            }
            conn.release();
            console.log('Done.');
            process.exit(0);
        }
        catch (err) {
            console.error(err);
            process.exit(1);
        }
    });
}
seedCategories();
