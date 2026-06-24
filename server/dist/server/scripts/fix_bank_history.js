"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = require("crypto");
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const DATA_DIR = path.resolve(__dirname, '../../mall stuff/test/data');
const MAPPING_FILE = path.resolve(__dirname, '../../mall stuff/test/id_mapping.json');
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('--- STARTING BANK HISTORY REPAIR ---');
        if (!fs.existsSync(DATA_DIR))
            throw new Error('Data dir not found');
        const details = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'BankAccount_Details.json'), 'utf8'));
        const masters = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'BankAccount.json'), 'utf8'));
        const idMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        // Master date lookup
        const masterDateMap = new Map();
        for (const m of masters) {
            let d = String(m.InvDate).split(' ')[0];
            if (d.includes('/')) {
                const p = d.split('/');
                d = p[0].length === 4 ? `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}` : `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
            }
            masterDateMap.set(m.id, d);
        }
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306, decimalNumbers: true,
        });
        const conn = yield pool.getConnection();
        // 1. We know the 2 Bank accounts from previous diagnostic
        const [accounts] = yield conn.query("SELECT id, code, openingBalance FROM accounts WHERE code IN ('101', '10201', '10202', '507', '508', '104')");
        const getAcct = (code) => accounts.find((a) => a.code === code);
        // 2. Identify the active Banks in our system
        const [banks] = yield conn.query("SELECT id, accountId, name FROM banks");
        const getBank = (code) => banks.find((b) => { var _a; return b.accountId === ((_a = getAcct(code)) === null || _a === void 0 ? void 0 : _a.id); });
        const bank1 = getBank('10201'); // بنك القاهره
        const bank2 = getBank('10202'); // البريد المصري
        const cashAcct = getAcct('101');
        const arAcct = getAcct('104');
        const expAcct = getAcct('508');
        const feeAcct = getAcct('507');
        console.log('Bank1 (Cairo):', bank1.id);
        console.log('Bank2 (Post):', bank2.id);
        yield conn.beginTransaction();
        try {
            // Find existing invoices
            const [oldInvoices] = yield conn.query("SELECT id, number FROM invoices WHERE number LIKE 'OLD-BREC-%' OR number LIKE 'OLD-BPAY-%'");
            const invoiceMap = new Map();
            for (const inv of oldInvoices)
                invoiceMap.set(inv.number, inv.id);
            let c_invoices_updated = 0;
            let c_journals_created = 0;
            for (const detail of details) {
                const rawValue = Number(detail.Value || 0);
                if (rawValue === 0)
                    continue;
                const isReversal = rawValue < 0;
                const value = Math.abs(rawValue);
                // AccNoID 1 -> Bank1 (Cairo), AccNoID 2 -> Bank2 (Post)
                const targetBank = detail.AccNoID === 1 ? bank1 : bank2;
                const targetBankAcctID = targetBank.accountId;
                let dateStr = masterDateMap.get(detail.MasterID);
                if (!dateStr || dateStr === 'undefined')
                    dateStr = new Date().toISOString().slice(0, 10);
                const moveType = detail.MoveType;
                const notes = detail.Notes || '';
                if (moveType === 4 || moveType === 5) {
                    // Was imported as Invoice
                    const invNumber = moveType === 4 ? `OLD-BREC-${detail.RowID}` : `OLD-BPAY-${detail.RowID}`;
                    const invId = invoiceMap.get(invNumber);
                    if (invId) {
                        yield conn.query("UPDATE invoices SET bankAccountId = ?, bankName = ? WHERE id = ?", [targetBank.id, targetBank.name, invId]);
                        c_invoices_updated++;
                        // Re-route journal line from 101 to targetBankAcctID
                        // Find the journal entries for this invoice
                        const [je] = yield conn.query("SELECT id FROM journal_entries WHERE referenceId = ?", [invNumber]);
                        for (const j of je) {
                            // The entry currently hitting 101 is the one we want to switch to the bank
                            yield conn.query("UPDATE journal_lines SET accountId = ?, accountName = ? WHERE journalId = ? AND accountId = ?", [targetBankAcctID, targetBank.name, j.id, cashAcct.id]);
                            // BUT: We check if there's any AR/AP line, we just replace 101 with Bank.
                        }
                    }
                }
                else {
                    // Ensure this missing journal doesn't already exist (referenceId = BANK-DEP-*, etc)
                    let refPrefix = '';
                    if (moveType === 1)
                        refPrefix = 'BANK-DEP-';
                    else if (moveType === 2)
                        refPrefix = 'BANK-EXP-';
                    else if (moveType === 3)
                        refPrefix = 'BANK-FEE-';
                    else if (moveType === 6)
                        refPrefix = 'BANK-OTH-';
                    const referenceId = `${refPrefix}${detail.RowID}`;
                    const [existing] = yield conn.query("SELECT id FROM journal_entries WHERE referenceId = ?", [referenceId]);
                    if (existing.length === 0) {
                        // Create it!
                        let drAcct, drName, crAcct, crName;
                        const desc = `[MIGRATED-BANK] ${notes}`;
                        const jId = (0, crypto_1.randomUUID)();
                        if (moveType === 1) { // Deposit
                            drAcct = targetBankAcctID;
                            drName = targetBank.name;
                            crAcct = cashAcct.id;
                            crName = cashAcct.name; // assuming from treasury
                        }
                        else if (moveType === 2 || moveType === 6) { // Expense or Other
                            drAcct = expAcct.id;
                            drName = expAcct.name;
                            crAcct = targetBankAcctID;
                            crName = targetBank.name;
                        }
                        else if (moveType === 3) { // Fees
                            drAcct = feeAcct.id;
                            drName = feeAcct.name;
                            crAcct = targetBankAcctID;
                            crName = targetBank.name;
                        }
                        yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy) VALUES (?, ?, ?, ?, 'migration')`, [jId, dateStr, desc, referenceId]);
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, ?, 0), (?, ?, ?, 0, ?)`, [jId, drAcct, drName, value, jId, crAcct, crName, value]);
                        c_journals_created++;
                    }
                }
            }
            console.log(`Invoices updated: ${c_invoices_updated}`);
            console.log(`Missing Journals restored: ${c_journals_created}`);
            // CALIBRATE OPENING BALANCES
            // Calculate the pure net of the LEGACY transactions from our new/updated journals
            for (const b of [bank1, bank2]) {
                const [jNet] = yield conn.query(`
                SELECT COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) as net 
                FROM journal_lines jl JOIN journal_entries je ON jl.journalId = je.id
                WHERE jl.accountId = ? AND je.createdBy = 'migration'
            `, [b.accountId]);
                const legacyNet = Number(jNet[0].net || 0);
                // Fetch current 'target' opening balance (which actually encapsulates the desired legacy net)
                const targetAccount = getAcct(b.accountId === getAcct('10201').id ? '10201' : '10202');
                const targetBalance = Number(targetAccount.openingBalance);
                // New OB = Target - Legacy Net. So that when GL adds Legacy Net back in, it equals Target!
                const newOpeningBalance = targetBalance - legacyNet;
                console.log(`Bank ${b.name}: target OB was ${targetBalance}. Reconstructed legacy net is ${legacyNet}. Setting OB gap to: ${newOpeningBalance}`);
                yield conn.query("UPDATE accounts SET openingBalance = ? WHERE id = ?", [newOpeningBalance, targetAccount.id]);
            }
            // Calibrate Treasury 101: we effectively removed -28.3M and probably restored some Deposits.
            // Let's ensure Treasury balance doesn't shift wildly from what the user saw today.
            // Today's total journal for treasury + OB = Today's Final. We don't want Today's Final to change.
            const [oldTreasuryFinal] = yield conn.query(`
            SELECT COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) + ? as final
            FROM journal_lines jl WHERE jl.accountId = ?
        `, [Number(cashAcct.openingBalance), cashAcct.id]);
            const [newTreasuryJournalsMap] = yield conn.query(`
            SELECT COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) as net
            FROM journal_lines jl WHERE jl.accountId = ?
        `, [cashAcct.id]);
            // We want new OB + newNet = oldFinal
            // new OB = oldFinal - newNet
            const newTreasuryOB = oldTreasuryFinal[0].final - newTreasuryJournalsMap[0].net;
            console.log(`Treasury 101: adjusted OB to ${newTreasuryOB} to maintain final balance of ${oldTreasuryFinal[0].final}`);
            yield conn.query("UPDATE accounts SET openingBalance = ? WHERE id = ?", [newTreasuryOB, cashAcct.id]);
            yield conn.commit();
            console.log('--- REPAIR COMPLETE ---');
        }
        catch (e) {
            yield conn.rollback();
            console.error("FAILED:", e);
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main();
