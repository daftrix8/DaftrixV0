"use strict";
// ═══════════════════════════════════════════════════════════
// SERVER-SIDE ACCOUNT LOOKUP CACHE
// GL account codes (401, 501, 103, etc.) never change during
// server lifetime. This eliminates 5 DB queries per invoice save.
// ═══════════════════════════════════════════════════════════
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
exports.findAccountByCode = findAccountByCode;
exports.findAccountByCodeOrName = findAccountByCodeOrName;
exports.resolveInvoiceAccounts = resolveInvoiceAccounts;
exports.invalidateAccountCache = invalidateAccountCache;
exports.invalidateAccountCacheImmediate = invalidateAccountCacheImmediate;
const db_1 = require("../db");
let accountsByCode = null;
let loadPromise = null;
/**
 * Load all accounts into memory (once, on first use)
 * ~200 rows × 3 columns = ~20KB in memory
 */
function ensureLoaded() {
    return __awaiter(this, void 0, void 0, function* () {
        if (accountsByCode)
            return;
        // Prevent concurrent loads (stampede protection)
        if (loadPromise)
            return loadPromise;
        loadPromise = (() => __awaiter(this, void 0, void 0, function* () {
            try {
                const [rows] = yield db_1.pool.query('SELECT id, name, code FROM accounts');
                accountsByCode = new Map();
                for (const row of rows) {
                    if (row.code) {
                        accountsByCode.set(row.code, { id: row.id, name: row.name, code: row.code });
                    }
                }
                console.log(`📋 [AccountCache] Loaded ${accountsByCode.size} accounts`);
            }
            catch (err) {
                console.error('❌ [AccountCache] Failed to load:', err);
                accountsByCode = new Map(); // Empty map to prevent retry storm
            }
            finally {
                // IMPORTANT: Clear loadPromise AFTER accountsByCode is set.
                // If we cleared it before the catch set accountsByCode, a concurrent
                // caller could slip through the stampede guard and launch a second query.
                loadPromise = null;
            }
        }))();
        return loadPromise;
    });
}
/**
 * Find account by exact code or code prefix
 * Replaces: SELECT id, name FROM accounts WHERE code = '401' LIMIT 1
 */
function findAccountByCode(code) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureLoaded();
        if (!accountsByCode)
            return null;
        // Exact match first
        const exact = accountsByCode.get(code);
        if (exact)
            return exact;
        // Prefix match (e.g., '104%' → find first account starting with '104')
        if (code.endsWith('%')) {
            const prefix = code.slice(0, -1);
            for (const [accCode, entry] of accountsByCode) {
                if (accCode.startsWith(prefix))
                    return entry;
            }
        }
        return null;
    });
}
/**
 * Find account by code OR name pattern
 * Replaces: SELECT id, name FROM accounts WHERE code = '401' OR name LIKE '%مبيعات%' LIMIT 1
 */
function findAccountByCodeOrName(code, ...namePatterns) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureLoaded();
        if (!accountsByCode)
            return null;
        // Try exact code first
        const byCode = accountsByCode.get(code);
        if (byCode)
            return byCode;
        // Try prefix match
        for (const [accCode, entry] of accountsByCode) {
            if (accCode.startsWith(code.replace('%', '')))
                return entry;
        }
        // Try name patterns (strip SQL wildcards)
        for (const pattern of namePatterns) {
            const cleanPattern = pattern.replace(/%/g, '').toLowerCase();
            for (const [, entry] of accountsByCode) {
                if (entry.name.toLowerCase().includes(cleanPattern))
                    return entry;
            }
        }
        return null;
    });
}
/**
 * Resolve the standard 5 accounts used in invoice journal entries
 * Replaces 5 sequential DB queries with 0 DB queries (cached)
 */
function resolveInvoiceAccounts() {
    return __awaiter(this, void 0, void 0, function* () {
        const [revenue, cogs, inventory, receivables, payables, cash] = yield Promise.all([
            findAccountByCodeOrName('401', 'مبيعات'),
            findAccountByCodeOrName('501', 'تكلفة البضاعة', 'COGS'),
            findAccountByCodeOrName('103', 'مخزون'),
            findAccountByCodeOrName('104', 'عملاء'),
            findAccountByCodeOrName('201', 'موردين'),
            findAccountByCodeOrName('101', 'خزينة', 'صندوق', 'نقدية')
        ]);
        return { revenue, cogs, inventory, receivables, payables, cash };
    });
}
/**
 * Invalidate the cache (call when accounts change).
 *
 * DEBOUNCED: During cascade deletes and bulk operations, this gets called
 * many times within milliseconds. Instead of wiping the cache N times
 * (causing N redundant DB re-reads), we coalesce within a 500ms window.
 * The cache only actually clears once after the burst settles.
 */
let _invalidateTimer = null;
function invalidateAccountCache() {
    // If already scheduled, no-op — the pending invalidation will handle it
    if (_invalidateTimer)
        return;
    _invalidateTimer = setTimeout(() => {
        accountsByCode = null;
        _invalidateTimer = null;
        console.log('🔄 [AccountCache] Invalidated (debounced)');
    }, 500);
}
/**
 * Force-invalidate immediately (for use in tests or critical paths)
 */
function invalidateAccountCacheImmediate() {
    if (_invalidateTimer) {
        clearTimeout(_invalidateTimer);
        _invalidateTimer = null;
    }
    accountsByCode = null;
    console.log('🔄 [AccountCache] Invalidated (immediate)');
}
