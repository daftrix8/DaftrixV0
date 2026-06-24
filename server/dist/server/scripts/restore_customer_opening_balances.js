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
/**
 * Restore Customer Opening Balances from JSON source data
 * ========================================================
 * The fix_migrated_opening_balances.ts script zeroed out openingBalance
 * for ALL partners with OLD-* transactions. This caused customer balances
 * to go deeply negative for customers who had pre-migration balances
 * (they owed us money) but whose opening balances were zeroed without
 * restoring the corresponding invoice history.
 *
 * This script:
 * 1. Reads Persons.json (original ERP data) + id_mapping.json
 * 2. For each customer partner, computes what their openingBalance SHOULD be
 * 3. Compares to current DB state
 * 4. Restores the correct openingBalance and recalculates partner.balance
 *
 * Usage:
 *   npx ts-node scripts/restore_customer_opening_balances.ts --dry-run
 *   npx ts-node scripts/restore_customer_opening_balances.ts
 */
const promise_1 = __importDefault(require("mysql2/promise"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const DRY_RUN = process.argv.includes('--dry-run');
// Try several possible data directories
const POSSIBLE_DIRS = [
    path.resolve(__dirname, '../../mall stuff/New folder (3)/data'),
    path.resolve(__dirname, '../../mall stuff/new data/data'),
    path.resolve(__dirname, '../../mall stuff/data'),
];
const POSSIBLE_MAPPINGS = [
    path.resolve(__dirname, '../../mall stuff/New folder (3)/id_mapping.json'),
    path.resolve(__dirname, '../../mall stuff/new data/id_mapping.json'),
    path.resolve(__dirname, '../../mall stuff/id_mapping.json'),
];
function findFile(candidates) {
    for (const c of candidates) {
        if (fs.existsSync(c))
            return c;
    }
    return null;
}
function loadJson(filepath) {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}
function safeNum(v, fallback = 0) {
    const n = Number(v);
    return isNaN(n) ? fallback : n;
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`🔧 Restore Customer Opening Balances ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
        console.log('═══════════════════════════════════════════════════════════════\n');
        // Locate source files
        const personsPath = findFile(POSSIBLE_DIRS.map(d => path.join(d, 'Persons.json')));
        const mappingPath = findFile(POSSIBLE_MAPPINGS);
        if (!personsPath) {
            console.error('❌ Persons.json not found!');
            process.exit(1);
        }
        if (!mappingPath) {
            console.error('❌ id_mapping.json not found!');
            process.exit(1);
        }
        console.log(`  📄 Persons.json: ${personsPath}`);
        console.log(`  📄 id_mapping:   ${mappingPath}\n`);
        const persons = loadJson(personsPath);
        const idMap = loadJson(mappingPath);
        const partnerMap = idMap.partners || {};
        console.log(`  JSON persons: ${persons.length}`);
        console.log(`  ID mappings:  ${Object.keys(partnerMap).length}\n`);
        const conn = yield promise_1.default.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_USER,
            password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT) || 3306, decimalNumbers: true,
        });
        // Load all customer partners from DB
        const [dbPartners] = yield conn.query(`SELECT id, name, isCustomer, isSupplier, openingBalance, balance FROM partners WHERE isCustomer = 1`);
        const dbById = new Map();
        for (const p of dbPartners)
            dbById.set(p.id, p);
        console.log(`  DB customers: ${dbPartners.length}\n`);
        let fixCount = 0;
        let skipCount = 0;
        let totalOBRestored = 0;
        const fixes = [];
        for (const person of persons) {
            const oldId = String(person.ID);
            const newId = partnerMap[oldId];
            if (!newId)
                continue;
            const dbPartner = dbById.get(newId);
            if (!dbPartner)
                continue;
            if (!dbPartner.isCustomer)
                continue;
            // Reconstruct the original opening balance from JSON
            let openingBalance = safeNum(person.startBalance);
            const balanceType = safeNum(person.balanceType);
            const isSupplier = dbPartner.isSupplier;
            // Migration logic from migrate_mall_data.ts (lines 464-473):
            // For customers: balanceType 2 = credit (we owe them) → negative OB
            if (!isSupplier && balanceType === 2) {
                openingBalance = -Math.abs(openingBalance);
            }
            else if (!isSupplier && balanceType === 1) {
                openingBalance = Math.abs(openingBalance); // They owe us → positive
            }
            // For both-role partners, suppliers have inverted sign but we only touch customers here
            const currentOB = safeNum(dbPartner.openingBalance);
            // Skip if already matches (or if original OB was 0)
            if (Math.abs(currentOB - openingBalance) < 0.01) {
                skipCount++;
                continue;
            }
            // Only restore if the original OB was non-zero and current is 0
            // (i.e., we zeroed it out — don't change ones that were legitimately 0 or already correct)
            if (openingBalance === 0) {
                skipCount++;
                continue;
            }
            fixes.push({
                id: newId,
                name: dbPartner.name,
                oldOB: currentOB,
                newOB: openingBalance,
                oldBal: safeNum(dbPartner.balance),
                newBal: 0, // will be computed below
            });
        }
        console.log(`  Need OB restoration: ${fixes.length}`);
        console.log(`  Already correct/zero: ${skipCount}\n`);
        if (fixes.length === 0) {
            console.log('✅ Nothing to restore!');
            yield conn.end();
            return;
        }
        // Compute new balance for each fix using the formula
        for (const fix of fixes) {
            const [balResult] = yield conn.query(`
            SELECT
                COALESCE(ia.cI, 0) + COALESCE(ia.bI, 0) as txBalance
            FROM (SELECT 1) dummy
            LEFT JOIN (
                SELECT partnerId,
                    SUM(CASE WHEN type='INVOICE_SALE' AND COALESCE(paymentMethod,'')!='CASH' THEN total
                             WHEN type='RETURN_SALE'  AND COALESCE(paymentMethod,'')!='CASH' THEN -(total)
                             WHEN type IN ('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') THEN -total
                             ELSE 0 END) as cI,
                    SUM(CASE WHEN type='CHEQUE_BOUNCE' THEN total ELSE 0 END) as bI
                FROM invoices
                WHERE status IN ('POSTED','COMPLETED','PARTIAL') AND partnerId = ?
                GROUP BY partnerId
            ) ia ON 1 = 1
        `, [fix.id]);
            const txBalance = safeNum((_a = balResult[0]) === null || _a === void 0 ? void 0 : _a.txBalance);
            fix.newBal = Math.round((fix.newOB + txBalance) * 100) / 100;
        }
        // Print sample
        console.log('  Sample restorations (first 30):');
        for (const f of fixes.slice(0, 30)) {
            const diff = Math.round((f.newOB - f.oldOB) * 100) / 100;
            console.log(`  ${f.name}`);
            console.log(`    OB: ${f.oldOB} → ${f.newOB}  (${diff > 0 ? '+' : ''}${diff})`);
            console.log(`    Balance: ${f.oldBal} → ${f.newBal}`);
        }
        totalOBRestored = fixes.reduce((s, f) => s + Math.abs(f.newOB - f.oldOB), 0);
        console.log(`\n  Total OB change magnitude: ${Math.round(totalOBRestored * 100) / 100}`);
        // Estimate new customer stats
        const netDelta = fixes.reduce((s, f) => s + (f.newOB - f.oldOB), 0);
        console.log(`  Estimated net balance change: +${Math.round(netDelta * 100) / 100}`);
        console.log(`  Estimated new net: ~${Math.round((4306358 + netDelta) * 100) / 100}`);
        if (DRY_RUN) {
            console.log('\n⚠️  DRY RUN — run without --dry-run to apply');
            yield conn.end();
            return;
        }
        // Apply fixes
        console.log('\n🔧 Applying restorations...');
        yield conn.beginTransaction();
        try {
            let applied = 0;
            for (const fix of fixes) {
                yield conn.query(`UPDATE partners SET openingBalance = ?, balance = ? WHERE id = ?`, [fix.newOB, fix.newBal, fix.id]);
                applied++;
                if (applied % 100 === 0)
                    console.log(`    ... ${applied}/${fixes.length}`);
            }
            yield conn.commit();
            console.log(`\n✅ Restored ${applied} customer opening balances`);
        }
        catch (err) {
            yield conn.rollback();
            throw err;
        }
        // Final stats
        const [stat] = yield conn.query(`
        SELECT
            SUM(COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END) as net,
            SUM(CASE WHEN (COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END)>0
                THEN (COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END) ELSE 0 END) as assets,
            SUM(CASE WHEN (COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END)<0
                THEN ABS(COALESCE(p.openingBalance,0)+CASE WHEN p.isSupplier=0 OR p.isCustomer=1 THEN COALESCE(ia.cI,0)+COALESCE(ia.bI,0) ELSE 0 END+CASE WHEN p.isSupplier=1 THEN COALESCE(ia.sI,0)-COALESCE(ia.bI,0) ELSE 0 END) ELSE 0 END) as liab
        FROM partners p
        LEFT JOIN (
            SELECT partnerId,
                SUM(CASE WHEN type='INVOICE_SALE' AND COALESCE(paymentMethod,'')!='CASH' THEN total
                         WHEN type='RETURN_SALE'  AND COALESCE(paymentMethod,'')!='CASH' THEN -(total)
                         WHEN type IN ('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') THEN -total
                         ELSE 0 END) as cI,
                SUM(CASE WHEN type='INVOICE_PURCHASE' AND COALESCE(paymentMethod,'')!='CASH' THEN -(total)
                         WHEN type='RETURN_PURCHASE'  AND COALESCE(paymentMethod,'')!='CASH' THEN total
                         WHEN type IN ('PAYMENT','DISCOUNT_EARNED','CHEQUE_CASHED') THEN total
                         ELSE 0 END) as sI,
                SUM(CASE WHEN type='CHEQUE_BOUNCE' THEN total ELSE 0 END) as bI
            FROM invoices WHERE status IN ('POSTED','COMPLETED','PARTIAL')
            GROUP BY partnerId
        ) ia ON p.id = ia.partnerId
        WHERE p.isCustomer = 1
    `);
        console.log('\n═══ CUSTOMER STATS AFTER RESTORE ═══');
        console.log(`  عليهم (assets): ${Math.round(stat[0].assets * 100) / 100}`);
        console.log(`  لهم   (liab):   ${Math.round(stat[0].liab * 100) / 100}`);
        console.log(`  صافي  (net):    ${Math.round(stat[0].net * 100) / 100}`);
        console.log('\n  Expected: عليهم=6,239,418 | لهم=1,085,120.5 | صافي=5,154,297.5');
        console.log(`  Gap: ${Math.round((5154297.5 - stat[0].net) * 100) / 100}`);
        yield conn.end();
    });
}
main().catch(err => { console.error('❌ ERROR:', err); process.exit(1); });
