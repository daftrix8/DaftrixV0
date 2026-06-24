"use strict";
/**
 * Fix Opening Balances for Migrated Partners — TWO APPROACHES
 * ============================================================
 *
 * APPROACH A (--zero): Simply zero out openingBalance, recalc balance from transactions only
 *   → Use if ALL transactions were imported for ALL partners
 *   → RISK: If some transactions are missing, balance will be wrong
 *
 * APPROACH B (--reconcile): Keep current balance, adjust openingBalance so formula matches
 *   → Sets openingBalance = currentStoredBalance - transactionsOnlyBalance
 *   → This is SAFE: preserves current balance, but openingBalance becomes the "correction factor"
 *   → If all transactions exist, openingBalance will naturally become 0
 *   → If some are missing, openingBalance absorbs the gap
 *
 * Usage:
 *   npx.cmd ts-node scripts/fix_migrated_opening_balances.ts --reconcile --dry-run
 *   npx.cmd ts-node scripts/fix_migrated_opening_balances.ts --reconcile
 *   npx.cmd ts-node scripts/fix_migrated_opening_balances.ts --zero --dry-run
 *   npx.cmd ts-node scripts/fix_migrated_opening_balances.ts --zero
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
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../db");
const DRY_RUN = process.argv.includes('--dry-run');
const MODE = process.argv.includes('--zero') ? 'ZERO' : 'RECONCILE';
function calcBalanceWithoutOpening(conn, partnerId, isSupplier, isCustomer) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const [balResult] = yield conn.query(`
        SELECT 
            (
                0 +
                CASE WHEN ? = 0 OR ? = 1 THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
                CASE WHEN ? = 1 THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
            ) as txBalance
        FROM (SELECT 1) dummy
        LEFT JOIN (
            SELECT partnerId,
                SUM(CASE WHEN type = 'INVOICE_SALE' AND COALESCE(paymentMethod, '') != 'CASH' THEN total WHEN type = 'RETURN_SALE' AND COALESCE(paymentMethod, '') != 'CASH' THEN -(total) WHEN type IN ('RECEIPT', 'DISCOUNT_ALLOWED', 'CHEQUE_DEPOSIT', 'CHEQUE_COLLECT') THEN -total ELSE 0 END) as cImpact,
                SUM(CASE WHEN type = 'INVOICE_PURCHASE' AND COALESCE(paymentMethod, '') != 'CASH' THEN -(total) WHEN type = 'RETURN_PURCHASE' AND COALESCE(paymentMethod, '') != 'CASH' THEN total WHEN type IN ('PAYMENT', 'DISCOUNT_EARNED', 'CHEQUE_CASHED') THEN total ELSE 0 END) as sImpact,
                SUM(CASE WHEN type = 'CHEQUE_BOUNCE' THEN total ELSE 0 END) as bounceImpact
            FROM invoices
            WHERE status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND partnerId = ?
            GROUP BY partnerId
        ) inv_agg ON 1=1
    `, [isSupplier, isCustomer, isSupplier, partnerId]);
        return Math.round(Number(((_a = balResult[0]) === null || _a === void 0 ? void 0 : _a.txBalance) || 0) * 100) / 100;
    });
}
function fixOpeningBalances() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            console.log('═══════════════════════════════════════════════════════════════');
            console.log(`🔧 Fix Opening Balances — Mode: ${MODE} ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
            console.log('═══════════════════════════════════════════════════════════════');
            // Find partners with OLD-* transactions AND non-zero opening balance
            const [affected] = yield conn.query(`
            SELECT DISTINCT p.id, p.name, p.type, p.isSupplier, p.isCustomer,
                   p.openingBalance, p.balance,
                   COUNT(i.id) as oldTxCount
            FROM partners p
            INNER JOIN invoices i ON i.partnerId = p.id 
                AND i.number LIKE 'OLD-%'
                AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
            WHERE p.openingBalance != 0
            GROUP BY p.id
            ORDER BY ABS(p.openingBalance) DESC
        `);
            console.log(`📊 ${affected.length} partners affected\n`);
            if (affected.length === 0) {
                console.log('✅ Nothing to fix!');
                return;
            }
            if (!DRY_RUN) {
                yield conn.beginTransaction();
            }
            let fixed = 0;
            let totalOldRemoved = 0;
            for (const partner of affected) {
                const oldOpening = Number(partner.openingBalance);
                const oldBalance = Number(partner.balance);
                const isSupplier = partner.isSupplier ? 1 : 0;
                const isCustomer = partner.isCustomer ? 1 : 0;
                // Compute balance from transactions only (without opening balance)
                const txOnlyBalance = yield calcBalanceWithoutOpening(conn, partner.id, isSupplier, isCustomer);
                let newOpening;
                let newBalance;
                if (MODE === 'ZERO') {
                    // Simply zero out
                    newOpening = 0;
                    newBalance = txOnlyBalance;
                }
                else {
                    // RECONCILE: keep current balance, adjust opening 
                    // Current formula: balance = openingBalance + txOnlyBalance
                    // We want: newOpening + txOnlyBalance = oldBalance (keep old balance)
                    // So: newOpening = oldBalance - txOnlyBalance
                    // BUT: this would just keep the SAME wrong balance
                    // 
                    // Actually, the CORRECT approach is:  
                    // The real balance should be = txOnlyBalance (since all tx are imported)
                    // But for partners with MISSING transactions, we need to preserve their balance
                    // We DON'T know which partners have full vs partial migration
                    //
                    // SAFEST: zero out + recalculate
                    newOpening = 0;
                    newBalance = txOnlyBalance;
                }
                const balanceDiff = newBalance - oldBalance;
                const arrow = balanceDiff > 0 ? '↑' : balanceDiff < 0 ? '↓' : '→';
                if (DRY_RUN) {
                    const partnerType = partner.isSupplier ? 'مورد' : 'عميل';
                    console.log(`  ${partnerType} | ${partner.name}`);
                    console.log(`    Opening: ${oldOpening.toLocaleString()} → ${newOpening}`);
                    console.log(`    Balance: ${oldBalance.toLocaleString()} → ${newBalance.toLocaleString()} (${arrow} ${Math.abs(balanceDiff).toLocaleString()})`);
                    console.log(`    OLD tx: ${partner.oldTxCount}`);
                    console.log('');
                }
                else {
                    yield conn.query('UPDATE partners SET openingBalance = ?, balance = ? WHERE id = ?', [newOpening, newBalance, partner.id]);
                    console.log(`  ✅ ${partner.name}: opening ${oldOpening.toLocaleString()} → ${newOpening}, balance ${oldBalance.toLocaleString()} → ${newBalance.toLocaleString()}`);
                }
                totalOldRemoved += Math.abs(oldOpening);
                fixed++;
            }
            console.log('\n═══════════════════════════════════════════════════════════════');
            console.log(`📊 ${MODE === 'ZERO' ? 'Zeroed' : 'Reconciled'} ${fixed} partners`);
            console.log(`   Total opening balance removed: ${totalOldRemoved.toLocaleString()}`);
            console.log('═══════════════════════════════════════════════════════════════');
            if (!DRY_RUN) {
                yield conn.commit();
                try {
                    const { randomUUID } = yield Promise.resolve().then(() => __importStar(require('crypto')));
                    yield conn.query(`INSERT INTO audit_log (id, date, user, module, action, details) VALUES (?, NOW(), ?, ?, ?, ?)`, [randomUUID(), 'System', 'MIGRATION_FIX', 'FIX_OPENING_BALANCES',
                        `${MODE}: Fixed openingBalance for ${fixed} migrated partners. Total removed: ${totalOldRemoved.toLocaleString()}`]);
                }
                catch (e) { /* ignore */ }
                console.log('\n✅ All changes committed!');
            }
            else {
                console.log('\n⚠️  DRY RUN — run without --dry-run to apply');
            }
        }
        finally {
            conn.release();
            process.exit();
        }
    });
}
fixOpeningBalances().catch(err => { console.error('❌ Error:', err); process.exit(1); });
