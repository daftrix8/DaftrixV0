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
/**
 * Balance Sheet Diagnostic Script
 * Run with: npx ts-node --skip-project diagnose_balance.ts
 */
const dotenv_1 = __importDefault(require("dotenv"));
const promise_1 = __importDefault(require("mysql2/promise"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '.env') });
function diagnose() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true
        });
        console.log('=== BALANCE SHEET DIAGNOSTIC ===\n');
        // 1. Check for unbalanced journal entries
        console.log('--- 1. UNBALANCED JOURNAL ENTRIES ---');
        const [unbalanced] = yield conn.query(`
        SELECT 
            je.id,
            je.date,
            LEFT(je.description, 60) as description,
            SUM(jl.debit) as total_debit,
            SUM(jl.credit) as total_credit,
            ROUND(SUM(jl.debit) - SUM(jl.credit), 2) as imbalance
        FROM journal_entries je
        JOIN journal_lines jl ON jl.journalId = je.id
        GROUP BY je.id
        HAVING ABS(SUM(jl.debit) - SUM(jl.credit)) > 0.01
        ORDER BY ABS(SUM(jl.debit) - SUM(jl.credit)) DESC
        LIMIT 20
    `);
        if (unbalanced.length === 0) {
            console.log('  All journal entries are balanced');
        }
        else {
            console.log(`  Found ${unbalanced.length} UNBALANCED entries:`);
            let totalImbalance = 0;
            for (const row of unbalanced) {
                totalImbalance += row.imbalance;
                console.log(`  ${row.id} | ${row.date} | Dr=${row.total_debit} Cr=${row.total_credit} | GAP=${row.imbalance} | ${row.description}`);
            }
            console.log(`  >>> TOTAL IMBALANCE: ${totalImbalance}`);
        }
        // 2. Overall journal debit/credit totals
        console.log('\n--- 2. OVERALL JOURNAL TOTALS ---');
        const [totals] = yield conn.query(`
        SELECT 
            ROUND(SUM(debit), 2) as total_debits,
            ROUND(SUM(credit), 2) as total_credits,
            ROUND(SUM(debit) - SUM(credit), 2) as net_difference
        FROM journal_lines
    `);
        console.log(`  Total Debits:  ${totals[0].total_debits}`);
        console.log(`  Total Credits: ${totals[0].total_credits}`);
        console.log(`  Net Diff:      ${totals[0].net_difference}`);
        // 3. Orphan journal lines
        console.log('\n--- 3. ORPHAN JOURNAL LINES (no matching account OR partner) ---');
        const [orphans] = yield conn.query(`
        SELECT 
            jl.journalId,
            jl.accountId,
            jl.accountName,
            jl.debit,
            jl.credit
        FROM journal_lines jl
        LEFT JOIN accounts a ON a.id = jl.accountId
        LEFT JOIN partners p ON p.id = jl.accountId
        WHERE a.id IS NULL AND p.id IS NULL
        LIMIT 20
    `);
        if (orphans.length === 0) {
            console.log('  No orphan lines found');
        }
        else {
            let orphanDr = 0, orphanCr = 0;
            console.log(`  Found ${orphans.length} orphan lines:`);
            for (const row of orphans) {
                orphanDr += row.debit;
                orphanCr += row.credit;
                console.log(`  JE=${row.journalId} | AccID=${row.accountId} | Name=${row.accountName} | Dr=${row.debit} Cr=${row.credit}`);
            }
            console.log(`  >>> ORPHAN TOTAL: Dr=${orphanDr} Cr=${orphanCr} Net=${orphanDr - orphanCr}`);
        }
        // 4. Opening balances by type
        console.log('\n--- 4. OPENING BALANCES BY TYPE ---');
        const [openingBals] = yield conn.query(`
        SELECT type, COUNT(*) as cnt, ROUND(SUM(openingBalance), 2) as total_opening
        FROM accounts GROUP BY type
    `);
        let drOpen = 0, crOpen = 0;
        for (const row of openingBals) {
            console.log(`  ${row.type}: ${row.cnt} accounts, openingBalance=${row.total_opening}`);
            if (row.type === 'ASSET' || row.type === 'EXPENSE')
                drOpen += row.total_opening || 0;
            else
                crOpen += row.total_opening || 0;
        }
        console.log(`  Dr side (Asset+Expense): ${drOpen}`);
        console.log(`  Cr side (Liab+Equity+Rev): ${crOpen}`);
        console.log(`  Opening Imbalance: ${drOpen - crOpen}`);
        // 5. Partner opening balances
        console.log('\n--- 5. PARTNER OPENING BALANCES ---');
        const [partnerBals] = yield conn.query(`
        SELECT type, COUNT(*) as cnt, 
               ROUND(SUM(openingBalance), 2) as total_opening,
               ROUND(SUM(balance), 2) as total_balance
        FROM partners GROUP BY type
    `);
        for (const row of partnerBals) {
            console.log(`  ${row.type}: ${row.cnt} partners, opening=${row.total_opening}, balance=${row.total_balance}`);
        }
        // 6. Partner-Account overlaps
        console.log('\n--- 6. PARTNER-ACCOUNT OVERLAPS ---');
        const [overlaps] = yield conn.query(`
        SELECT p.id, p.name, p.type as p_type, p.openingBalance as p_ob,
               a.type as a_type, a.openingBalance as a_ob
        FROM partners p INNER JOIN accounts a ON a.id = p.id
        LIMIT 20
    `);
        console.log(`  Found ${overlaps.length} overlapping IDs`);
        for (const row of overlaps) {
            console.log(`  ${row.name} | Partner(${row.p_type}, OB=${row.p_ob}) + Account(${row.a_type}, OB=${row.a_ob})`);
        }
        // 7. Journal lines to partners NOT in accounts table
        console.log('\n--- 7. JOURNAL LINES TO PARTNER IDs (not in accounts) ---');
        const [partnerLines] = yield conn.query(`
        SELECT p.type, COUNT(*) as cnt,
               ROUND(SUM(jl.debit), 2) as dr, ROUND(SUM(jl.credit), 2) as cr,
               ROUND(SUM(jl.debit) - SUM(jl.credit), 2) as net
        FROM journal_lines jl
        INNER JOIN partners p ON p.id = jl.accountId
        LEFT JOIN accounts a ON a.id = jl.accountId
        WHERE a.id IS NULL
        GROUP BY p.type
    `);
        if (partnerLines.length === 0) {
            console.log('  None');
        }
        else {
            for (const row of partnerLines) {
                console.log(`  ${row.type}: ${row.cnt} lines, Dr=${row.dr}, Cr=${row.cr}, Net=${row.net}`);
            }
        }
        // 8. Special: Check if the 61,875 appears anywhere
        console.log('\n--- 8. SEARCHING FOR 61875 IN DATA ---');
        const [matches61] = yield conn.query(`
        SELECT 'journal_line_debit' as source, id, journalId, accountId, debit as amount FROM journal_lines WHERE ABS(debit - 61875) < 1
        UNION ALL
        SELECT 'journal_line_credit', id, journalId, accountId, credit FROM journal_lines WHERE ABS(credit - 61875) < 1
        UNION ALL
        SELECT 'account_opening', id, code, name, openingBalance FROM accounts WHERE ABS(openingBalance - 61875) < 1 OR ABS(openingBalance + 61875) < 1
        UNION ALL
        SELECT 'partner_opening', id, type, name, openingBalance FROM partners WHERE ABS(openingBalance - 61875) < 1 OR ABS(openingBalance + 61875) < 1
        UNION ALL
        SELECT 'account_balance', id, code, name, balance FROM accounts WHERE ABS(balance - 61875) < 1 OR ABS(balance + 61875) < 1
        LIMIT 20
    `);
        if (matches61.length === 0) {
            console.log('  No exact match for 61,875 found');
        }
        else {
            for (const row of matches61) {
                console.log(`  ${row.source}: ${JSON.stringify(row)}`);
            }
        }
        yield conn.end();
        console.log('\n=== DIAGNOSTIC COMPLETE ===');
    });
}
diagnose().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
