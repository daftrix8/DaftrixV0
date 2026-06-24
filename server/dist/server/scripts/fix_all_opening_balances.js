"use strict";
/**
 * FIX: Reset ALL Partner Opening Balances from Legacy Persons.json
 *
 * The previous fix script skipped partners with startBalance=0, leaving
 * incorrect values from the original migration (e.g., Python migration wizard).
 *
 * This script:
 * 1. Reads ALL persons from Persons.json
 * 2. Matches them to partners in our DB via id_mapping.json
 * 3. Sets openingBalance to the correct value (with correct sign convention)
 * 4. Partners with startBalance=0 are explicitly reset to 0
 *
 * Sign convention:
 *   Positive = partner owes us (debit)
 *   Negative = we owe partner (credit)
 *
 *   Suppliers (type=4): balanceType=2 (credit) → NEGATIVE, balanceType=1 (debit) → POSITIVE
 *   Customers: balanceType=1 (debit) → POSITIVE, balanceType=2 (credit) → NEGATIVE
 */
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
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const MALI_DATA_DIR = process.env.MIGRATION_DATA_DIR || path.resolve(__dirname, '../../mall stuff/data');
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('\n══════════════════════════════════════════════');
        console.log('  🔧 FIX: Reset ALL Partner Opening Balances');
        console.log('══════════════════════════════════════════════\n');
        const persons = JSON.parse(fs.readFileSync(path.join(MALI_DATA_DIR, 'Persons.json'), 'utf8'));
        console.log(`  📦 Loaded ${persons.length} persons from Persons.json`);
        const idMappingPath = path.resolve(MALI_DATA_DIR, '../id_mapping.json');
        const idMapping = JSON.parse(fs.readFileSync(idMappingPath, 'utf8'));
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const conn = yield pool.getConnection();
        try {
            // Load current partners from DB
            const [dbPartners] = yield conn.query('SELECT id, name, openingBalance, isSupplier, isCustomer FROM partners');
            const dbMap = new Map();
            for (const p of dbPartners)
                dbMap.set(p.id, p);
            console.log(`  📊 Loaded ${dbPartners.length} partners from DB.\n`);
            let fixedCount = 0;
            let zeroResetCount = 0;
            let skippedCount = 0;
            let unchangedCount = 0;
            let changedSamples = [];
            for (const person of persons) {
                const oldId = String(person.ID);
                const newId = (_a = idMapping.partners) === null || _a === void 0 ? void 0 : _a[oldId];
                if (!newId) {
                    skippedCount++;
                    continue;
                }
                const dbPartner = dbMap.get(newId);
                if (!dbPartner) {
                    skippedCount++;
                    continue;
                }
                const startBalance = Number(person.startBalance || 0);
                const balanceType = Number(person.balanceType || 1);
                const oldType = Number(person.type || 1); // 4 = supplier
                const isSupplier = oldType === 4;
                let correctOpeningBalance;
                if (startBalance === 0) {
                    correctOpeningBalance = 0;
                }
                else if (isSupplier) {
                    correctOpeningBalance = balanceType === 2 ? -Math.abs(startBalance) : Math.abs(startBalance);
                }
                else {
                    correctOpeningBalance = balanceType === 1 ? Math.abs(startBalance) : -Math.abs(startBalance);
                }
                const currentOB = Number(dbPartner.openingBalance || 0);
                if (Math.abs(currentOB - correctOpeningBalance) > 0.01) {
                    yield conn.query('UPDATE partners SET openingBalance = ? WHERE id = ?', [correctOpeningBalance, newId]);
                    if (startBalance === 0) {
                        zeroResetCount++;
                    }
                    else {
                        fixedCount++;
                    }
                    if (changedSamples.length < 20) {
                        changedSamples.push({
                            name: dbPartner.name,
                            type: isSupplier ? 'SUPPLIER' : 'CUSTOMER',
                            balanceType,
                            startBalance,
                            oldOB: currentOB,
                            newOB: correctOpeningBalance
                        });
                    }
                }
                else {
                    unchangedCount++;
                }
            }
            console.log('══════════════════════════════════════════════');
            console.log('  📊 RESULTS');
            console.log('══════════════════════════════════════════════');
            console.log(`  ✅ Fixed (non-zero):      ${fixedCount}`);
            console.log(`  🔄 Reset to zero:         ${zeroResetCount}`);
            console.log(`  ✓  Already correct:       ${unchangedCount}`);
            console.log(`  ⏭️  Skipped (no mapping):  ${skippedCount}`);
            if (changedSamples.length > 0) {
                console.log('\n  📝 Sample changes:');
                changedSamples.forEach(s => {
                    console.log(`     ${s.name.substring(0, 40).padEnd(40)} (${s.type.padEnd(8)}, bt=${s.balanceType}): ${s.oldOB} → ${s.newOB} [legacy startBal=${s.startBalance}]`);
                });
            }
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
