"use strict";
/**
 * Account Balance Utilities
 *
 * Provides functions to update account balances based on journal entries.
 * This ensures that account.balance stays in sync with journal movements.
 */
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
exports.updateAccountBalancesFromJournal = updateAccountBalancesFromJournal;
exports.collectAffectedAccountIds = collectAffectedAccountIds;
const logger_1 = require("./logger");
/**
 * Update account balances for a list of affected accounts.
 * Recalculates balance from openingBalance + journal movements.
 *
 * Formula:
 * - For ASSET/EXPENSE accounts: Balance = Opening + Debits - Credits
 * - For LIABILITY/EQUITY/REVENUE accounts: Balance = Opening + Credits - Debits
 *
 * Performance: Uses a single batched UPDATE (CASE-based) instead of N individual
 * UPDATE queries when multiple accounts are affected. Falls back to individual
 * updates for single-account cases or if batch update fails.
 *
 * @param conn Database connection (must be within a transaction)
 * @param accountIds List of account IDs that were affected by journal changes
 */
function updateAccountBalancesFromJournal(conn, accountIds) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        if (!accountIds || accountIds.length === 0) {
            return { updatedCount: 0, changes: [] };
        }
        // Debit-normal account types (balance increases with debit)
        const debitNormalTypes = ['ASSET', 'EXPENSE'];
        const changes = [];
        let updatedCount = 0;
        // Get account details for all affected accounts
        const placeholders = accountIds.map(() => '?').join(',');
        const [accounts] = yield conn.query(`SELECT id, code, name, type, openingBalance, balance FROM accounts WHERE id IN (${placeholders})`, accountIds);
        // Get journal movements for all affected accounts
        // NOTE: journal_entries has no status column in this schema, so all lines are
        // considered live. If a status column is added in the future, filter with:
        //   JOIN journal_entries je ON jl.journalId = je.id AND je.status = 'POSTED'
        const [movements] = yield conn.query(`SELECT 
            accountId,
            SUM(debit) as totalDebit,
            SUM(credit) as totalCredit
        FROM journal_lines
        WHERE accountId IN (${placeholders})
        GROUP BY accountId`, accountIds);
        // Create lookup map for movements
        const movementMap = new Map();
        for (const mov of movements) {
            movementMap.set(mov.accountId, {
                totalDebit: parseFloat(mov.totalDebit) || 0,
                totalCredit: parseFloat(mov.totalCredit) || 0
            });
        }
        // ── Compute new balances for all accounts ────────────────────────
        const balanceUpdates = [];
        for (const account of accounts) {
            const movement = movementMap.get(account.id);
            const totalDebit = (movement === null || movement === void 0 ? void 0 : movement.totalDebit) || 0;
            const totalCredit = (movement === null || movement === void 0 ? void 0 : movement.totalCredit) || 0;
            const openingBalance = parseFloat(account.openingBalance) || 0;
            const currentBalance = parseFloat(account.balance) || 0;
            const accountType = account.type;
            let newBalance;
            if (debitNormalTypes.includes(accountType)) {
                // For ASSET/EXPENSE: Balance = Opening + Debits - Credits
                newBalance = openingBalance + totalDebit - totalCredit;
            }
            else {
                // For LIABILITY/EQUITY/REVENUE: Balance = Opening + Credits - Debits
                newBalance = openingBalance + totalCredit - totalDebit;
            }
            // Round to 2 decimal places
            newBalance = Math.round(newBalance * 100) / 100;
            // Only update if different
            if (Math.abs(currentBalance - newBalance) > 0.001) {
                balanceUpdates.push({ id: account.id, code: account.code, name: account.name, oldBalance: currentBalance, newBalance });
            }
        }
        if (balanceUpdates.length === 0) {
            return { updatedCount: 0, changes: [] };
        }
        // ── Batch UPDATE using CASE statement ────────────────────────────
        // Instead of N individual UPDATEs, execute a single atomic statement.
        // This is a meaningful win for cascade deletes touching 10–30 accounts.
        // WARNING: This function receives a PoolConnection that may already be
        // inside an outer transaction. Retry logic for deadlocks/lock-timeouts
        // is NOT safe inside a shared transaction (MySQL requires a full ROLLBACK
        // before retrying). The MAX_RETRIES loop below only applies for lock
        // contention on this specific batch statement. If a deadlock occurs,
        // the outer transaction's catch handler should decide whether to retry
        // the entire operation.
        const MAX_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (balanceUpdates.length === 1) {
                    // Single account — simple UPDATE is cleaner
                    const u = balanceUpdates[0];
                    yield conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [u.newBalance, u.id]);
                }
                else {
                    // Multiple accounts — batch CASE-based UPDATE
                    const caseLines = balanceUpdates.map(u => `WHEN ? THEN ?`).join(' ');
                    const idPlaceholders = balanceUpdates.map(() => '?').join(',');
                    const caseParams = [];
                    for (const u of balanceUpdates) {
                        caseParams.push(u.id, u.newBalance);
                    }
                    const idParams = balanceUpdates.map(u => u.id);
                    yield conn.query(`UPDATE accounts SET balance = CASE id ${caseLines} END WHERE id IN (${idPlaceholders})`, [...caseParams, ...idParams]);
                }
                // Record changes and log
                for (const u of balanceUpdates) {
                    updatedCount++;
                    changes.push({ accountId: u.id, oldBalance: u.oldBalance, newBalance: u.newBalance });
                    (0, logger_1.logDebug)(`[AccountBalance] ${u.name} (${u.code}): ${u.oldBalance.toLocaleString()} → ${u.newBalance.toLocaleString()}`);
                }
                break; // Success — exit retry loop
            }
            catch (retryErr) {
                const isRetryable = (retryErr === null || retryErr === void 0 ? void 0 : retryErr.errno) === 1020
                    || ((_a = retryErr === null || retryErr === void 0 ? void 0 : retryErr.message) === null || _a === void 0 ? void 0 : _a.includes('Record has changed since last read'))
                    || ((_b = retryErr === null || retryErr === void 0 ? void 0 : retryErr.message) === null || _b === void 0 ? void 0 : _b.includes('Lock wait timeout'))
                    || ((_c = retryErr === null || retryErr === void 0 ? void 0 : retryErr.message) === null || _c === void 0 ? void 0 : _c.includes('Deadlock found'));
                if (isRetryable && attempt < MAX_RETRIES) {
                    // Jittered backoff: 200ms, 400ms + random jitter
                    const baseDelay = attempt * 200;
                    const jitter = Math.floor(Math.random() * 100);
                    (0, logger_1.logWarn)(`[AccountBalance] Retry ${attempt}/${MAX_RETRIES} for batch update (${balanceUpdates.length} accounts): ${(_d = retryErr.message) === null || _d === void 0 ? void 0 : _d.substring(0, 80)}`);
                    // Re-read fresh data since another transaction may have committed
                    const freshAccountIds = balanceUpdates.map(u => u.id);
                    const freshPh = freshAccountIds.map(() => '?').join(',');
                    const [freshAccounts] = yield conn.query(`SELECT id, code, name, type, openingBalance, balance FROM accounts WHERE id IN (${freshPh})`, freshAccountIds);
                    const [freshMovements] = yield conn.query(`SELECT accountId, SUM(debit) as totalDebit, SUM(credit) as totalCredit
                     FROM journal_lines WHERE accountId IN (${freshPh}) GROUP BY accountId`, freshAccountIds);
                    // Rebuild balanceUpdates with fresh data (fixes Bug #1: stale account.type on retry)
                    balanceUpdates.length = 0;
                    const freshMovMap = new Map();
                    for (const m of freshMovements) {
                        freshMovMap.set(m.accountId, { totalDebit: parseFloat(m.totalDebit) || 0, totalCredit: parseFloat(m.totalCredit) || 0 });
                    }
                    for (const fa of freshAccounts) {
                        const mov = freshMovMap.get(fa.id);
                        const tD = (mov === null || mov === void 0 ? void 0 : mov.totalDebit) || 0;
                        const tC = (mov === null || mov === void 0 ? void 0 : mov.totalCredit) || 0;
                        const opening = parseFloat(fa.openingBalance) || 0;
                        const current = parseFloat(fa.balance) || 0;
                        const freshType = fa.type; // Use fresh type, not stale
                        let nb;
                        if (debitNormalTypes.includes(freshType)) {
                            nb = opening + tD - tC;
                        }
                        else {
                            nb = opening + tC - tD;
                        }
                        nb = Math.round(nb * 100) / 100;
                        if (Math.abs(current - nb) > 0.001) {
                            balanceUpdates.push({ id: fa.id, code: fa.code, name: fa.name, oldBalance: current, newBalance: nb });
                        }
                    }
                    if (balanceUpdates.length === 0) {
                        // All accounts are now in sync (another transaction already updated them)
                        (0, logger_1.logDebug)(`[AccountBalance] All accounts already in sync after retry ${attempt}`);
                        break;
                    }
                    yield new Promise(r => setTimeout(r, baseDelay + jitter));
                    continue;
                }
                // Non-retryable or max retries exhausted — throw
                throw retryErr;
            }
        }
        return { updatedCount, changes };
    });
}
/**
 * Collect unique account IDs from journal entry lines.
 * Used to determine which accounts need balance updates.
 */
function collectAffectedAccountIds(journalLines) {
    const uniqueIds = new Set();
    for (const line of journalLines) {
        if (line.accountId) {
            uniqueIds.add(line.accountId);
        }
    }
    return Array.from(uniqueIds);
}
