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
const db_1 = require("./db");
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = require("crypto");
dotenv_1.default.config();
const fixBNBBank = () => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.initDB)();
    const conn = yield (0, db_1.getConnection)();
    try {
        console.log('--- Fixing BNB Bank Link ---');
        // 1. Find BNB bank
        const [banks] = yield conn.query('SELECT * FROM banks WHERE name = ?', ['BNB']);
        if (banks.length === 0) {
            console.log('❌ BNB bank not found!');
            return;
        }
        const bnbBank = banks[0];
        console.log(`\n✓ Found Bank: ${bnbBank.name}`);
        console.log(`  Current accountId: ${bnbBank.accountId || 'NULL'}`);
        console.log(`  Opening Balance: ${Number(bnbBank.balance).toLocaleString()}`);
        // 2. Check if linked account exists
        if (bnbBank.accountId) {
            const [accounts] = yield conn.query('SELECT * FROM accounts WHERE id = ?', [bnbBank.accountId]);
            if (accounts.length > 0) {
                console.log(`\n✓ Linked account found: ${accounts[0].name}`);
                console.log(`  No fix needed - account exists!`);
                return;
            }
            else {
                console.log(`\n⚠️ Linked account NOT found - broken link detected!`);
            }
        }
        // 3. Create new GL Account
        console.log('\n📝 Creating new GL Account...');
        // Find max code for ASSET accounts
        const [allAccounts] = yield conn.query('SELECT code FROM accounts WHERE code LIKE "1%"');
        const maxCode = allAccounts.reduce((max, a) => {
            const code = parseInt(a.code) || 0;
            return Math.max(max, code);
        }, 10200);
        const newCode = (maxCode + 1).toString();
        const newAccountId = (0, crypto_1.randomUUID)();
        const newAccount = {
            id: newAccountId,
            name: `Bank: ${bnbBank.name}`,
            code: newCode,
            type: 'ASSET',
            balance: Number(bnbBank.balance) || 0,
            openingBalance: Number(bnbBank.balance) || 0
        };
        yield conn.query('INSERT INTO accounts (id, name, code, type, balance, openingBalance) VALUES (?, ?, ?, ?, ?, ?)', [newAccount.id, newAccount.name, newAccount.code, newAccount.type, newAccount.balance, newAccount.openingBalance]);
        console.log(`✓ Created Account: ${newAccount.name} (${newAccount.code})`);
        console.log(`  Opening Balance: ${newAccount.openingBalance.toLocaleString()}`);
        // 4. Update Bank to link to new account
        yield conn.query('UPDATE banks SET accountId = ? WHERE id = ?', [newAccountId, bnbBank.id]);
        console.log(`\n✅ SUCCESS! Bank "${bnbBank.name}" is now linked to GL Account "${newAccount.code}"!`);
        console.log(`\nRefresh your browser to see the changes.`);
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
    finally {
        conn.release();
        process.exit();
    }
});
fixBNBBank();
