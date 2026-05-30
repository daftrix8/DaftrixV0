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
const fixBNBComplete = () => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield db_1.pool.getConnection();
    try {
        yield conn.beginTransaction();
        console.log('--- Fixing BNB Bank Complete ---\n');
        // 1. Find BNB bank
        const [banks] = yield conn.query('SELECT * FROM banks WHERE name = ?', ['BNB']);
        if (banks.length === 0) {
            console.log('❌ BNB bank not found!');
            return;
        }
        const bnbBank = banks[0];
        console.log(`Found Bank: ${bnbBank.name}`);
        console.log(`  ID: ${bnbBank.id}`);
        console.log(`  Current accountId: ${bnbBank.accountId || 'NULL'}`);
        console.log(`  Opening Balance: ${Number(bnbBank.balance).toLocaleString()}\n`);
        // 2. Check if linked account exists in database
        let linkedAccount = null;
        if (bnbBank.accountId) {
            const [accounts] = yield conn.query('SELECT * FROM accounts WHERE id = ?', [bnbBank.accountId]);
            if (accounts.length > 0) {
                linkedAccount = accounts[0];
                console.log(`Found linked account: ${linkedAccount.name} (${linkedAccount.code})`);
                console.log(`  Opening Balance: ${Number(linkedAccount.openingBalance).toLocaleString()}`);
                console.log(`  Current Balance: ${Number(linkedAccount.balance).toLocaleString()}\n`);
            }
            else {
                console.log(`⚠️ Account ID exists but account NOT found in database (broken link)\n`);
            }
        }
        // 3. Create or fix the account
        if (!linkedAccount) {
            console.log('Creating new GL Account...');
            // Find max code for ASSET accounts
            const [allAccounts] = yield conn.query('SELECT code FROM accounts WHERE code LIKE "1%"');
            const maxCode = allAccounts.reduce((max, a) => {
                const code = parseInt(a.code) || 0;
                return Math.max(max, code);
            }, 10200);
            const newCode = (maxCode + 1).toString();
            const newAccountId = (0, crypto_1.randomUUID)();
            const bankBalance = Number(bnbBank.balance) || 0;
            // Insert new account
            yield conn.query('INSERT INTO accounts (id, name, code, type, balance, openingBalance) VALUES (?, ?, ?, ?, ?, ?)', [newAccountId, `Bank: ${bnbBank.name}`, newCode, 'ASSET', bankBalance, bankBalance]);
            console.log(`✓ Created Account: ${newCode} - Bank: ${bnbBank.name}`);
            console.log(`  Opening Balance: ${bankBalance.toLocaleString()}\n`);
            // Update Bank to link to new account
            yield conn.query('UPDATE banks SET accountId = ? WHERE id = ?', [newAccountId, bnbBank.id]);
            console.log(`✓ Linked bank to account ${newCode}`);
            linkedAccount = { id: newAccountId, code: newCode, openingBalance: bankBalance };
        }
        else {
            // Account exists, but might need balance sync
            const bankBalance = Number(bnbBank.balance) || 0;
            const accountBalance = Number(linkedAccount.openingBalance) || 0;
            if (Math.abs(bankBalance - accountBalance) > 0.01) {
                console.log(`Syncing balances...`);
                console.log(`  Bank Balance: ${bankBalance.toLocaleString()}`);
                console.log(`  Account Opening Balance: ${accountBalance.toLocaleString()}`);
                const diff = bankBalance - accountBalance;
                yield conn.query('UPDATE accounts SET openingBalance = ?, balance = balance + ? WHERE id = ?', [bankBalance, diff, linkedAccount.id]);
                console.log(`✓ Updated account opening balance to ${bankBalance.toLocaleString()}`);
            }
            else {
                console.log(`✓ Balances already match - no update needed`);
            }
        }
        yield conn.commit();
        console.log(`\n✅ SUCCESS! BNB Bank is now properly linked and synced.`);
        console.log(`\n🔄 Refresh your browser to see the changes.`);
    }
    catch (error) {
        yield conn.rollback();
        console.error('❌ Error:', error);
    }
    finally {
        conn.release();
        process.exit();
    }
});
fixBNBComplete().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
