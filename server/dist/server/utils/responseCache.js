"use strict";
// ═══════════════════════════════════════════════════════════
// SERVER-SIDE IN-MEMORY RESPONSE CACHE
// Prevents 15 users from each hitting the DB for the same data
// Uses TTL-based expiration with manual invalidation support
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
exports.CACHE_TTL = exports.responseCache = void 0;
exports.cacheThrough = cacheThrough;
class ResponseCache {
    constructor() {
        this.cache = new Map();
        this.maxEntries = 500;
        this._cleanupInterval = null;
        // Cleanup expired entries every 60 seconds
        this._cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }
    /**
     * Get cached data if fresh, or null if expired/missing
     */
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        // Check TTL
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }
        entry.hits++;
        return entry.data;
    }
    /**
     * Store data with TTL (in milliseconds)
     */
    set(key, data, ttlMs) {
        // Evict oldest if at capacity
        if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey)
                this.cache.delete(oldestKey);
        }
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttlMs,
            hits: 0,
        });
    }
    /**
     * Invalidate a specific cache key
     */
    invalidate(key) {
        this.cache.delete(key);
    }
    /**
     * Invalidate all keys matching a prefix
     * e.g., invalidatePrefix('dashboard') clears all dashboard caches
     */
    invalidatePrefix(prefix) {
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }
    /**
     * Invalidate everything
     */
    invalidateAll() {
        this.cache.clear();
    }
    /**
     * Get cache statistics
     */
    stats() {
        let totalHits = 0;
        let expired = 0;
        const now = Date.now();
        for (const [, entry] of this.cache) {
            totalHits += entry.hits;
            if (now - entry.timestamp > entry.ttl)
                expired++;
        }
        return {
            entries: this.cache.size,
            maxEntries: this.maxEntries,
            totalHits,
            expired,
        };
    }
    /**
     * Remove expired entries
     */
    cleanup() {
        const now = Date.now();
        let removed = 0;
        for (const [key, entry] of this.cache) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
                removed++;
            }
        }
        // Only log when there's activity
        if (removed > 0 && process.env.NODE_ENV === 'development') {
            console.log(`🗑️ [Cache] Cleaned ${removed} expired entries, ${this.cache.size} remaining`);
        }
    }
    destroy() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
        this.cache.clear();
    }
}
// ── Singleton Instance ───────────────────────────────────
exports.responseCache = new ResponseCache();
// ── TTL Presets (milliseconds) ───────────────────────────
exports.CACHE_TTL = {
    /** Dashboard KPIs — 30s (shared across all users) */
    DASHBOARD: 30000,
    /** System config — 5 min (rarely changes) */
    CONFIG: 5 * 60000,
    /** Master data (accounts, branches, warehouses) — 2 min */
    MASTER_DATA: 2 * 60000,
    /** Product field suggestions — 2 min */
    SUGGESTIONS: 2 * 60000,
    /** Report data — 1 min */
    REPORTS: 60000,
    /** Pagination counts — 30s (changes frequently but expensive to compute) */
    COUNTS: 30000,
};
// ── Helper: Cache-through pattern ────────────────────────
/**
 * Try cache first, fall through to loader on miss
 * Usage:
 *   const data = await cacheThrough('dashboard:kpis', CACHE_TTL.DASHBOARD, async () => {
 *     return await computeExpensiveData();
 *   });
 */
function cacheThrough(key, ttlMs, loader) {
    return __awaiter(this, void 0, void 0, function* () {
        const cached = exports.responseCache.get(key);
        if (cached !== null)
            return cached;
        const fresh = yield loader();
        exports.responseCache.set(key, fresh, ttlMs);
        return fresh;
    });
}
