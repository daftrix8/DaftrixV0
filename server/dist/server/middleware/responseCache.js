"use strict";
/**
 * In-Memory Response Cache Middleware
 *
 * PERF: Caches API responses for endpoints that return rarely-changing data
 * (accounts, warehouses, branches, etc.) to eliminate redundant DB queries.
 *
 * Cache is automatically invalidated when:
 * 1. TTL expires (configurable, default 60s)
 * 2. An entity:changed event fires for the matching entity type
 * 3. An entity:deleted event fires for the matching entity type
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.responseCache = responseCache;
exports.invalidateCache = invalidateCache;
const eventBus_1 = require("../utils/eventBus");
// Global cache store
const _responseCache = new Map();
const DEFAULT_TTL = 60000; // 60 seconds
/**
 * Creates a caching middleware for a specific endpoint
 *
 * @param entityType - The entity type to listen for invalidation events (e.g. 'accounts', 'warehouses')
 * @param ttlMs - Time-to-live in milliseconds (default: 60s)
 * @param keyFn - Optional custom key function; defaults to req.originalUrl
 */
function responseCache(entityType, ttlMs = DEFAULT_TTL, keyFn) {
    // Register invalidation listener once per entity type
    const invalidationKey = `__cache_listener_${entityType}`;
    if (!global[invalidationKey]) {
        global[invalidationKey] = true;
        const invalidate = () => {
            // Remove all cache entries that start with this entity type prefix
            for (const key of _responseCache.keys()) {
                if (key.startsWith(`${entityType}:`)) {
                    _responseCache.delete(key);
                }
            }
        };
        const affectsAccounts = ['journal', 'journals', 'invoice', 'invoices', 'cheque', 'cheques'];
        eventBus_1.eventBus.on('entity:changed', (data) => {
            if ((data === null || data === void 0 ? void 0 : data.entityType) === entityType)
                invalidate();
            if (entityType === 'accounts' && affectsAccounts.includes(data === null || data === void 0 ? void 0 : data.entityType))
                invalidate();
        });
        eventBus_1.eventBus.on('entity:deleted', (data) => {
            if ((data === null || data === void 0 ? void 0 : data.entityType) === entityType)
                invalidate();
            if (entityType === 'accounts' && affectsAccounts.includes(data === null || data === void 0 ? void 0 : data.entityType))
                invalidate();
        });
    }
    return (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET')
            return next();
        // Allow bypass with ?fresh=true
        if (req.query.fresh === 'true')
            return next();
        const cacheKey = `${entityType}:${keyFn ? keyFn(req) : req.originalUrl}`;
        const now = Date.now();
        // Check cache
        const cached = _responseCache.get(cacheKey);
        if (cached && (now - cached.timestamp) < ttlMs) {
            // Serve from cache
            res.setHeader('X-Cache', 'HIT');
            return res.status(cached.statusCode).json(cached.data);
        }
        // Cache miss — intercept res.json to capture the response
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            // Only cache successful responses
            if (res.statusCode >= 200 && res.statusCode < 300) {
                _responseCache.set(cacheKey, {
                    data: body,
                    timestamp: now,
                    statusCode: res.statusCode
                });
            }
            res.setHeader('X-Cache', 'MISS');
            return originalJson(body);
        };
        next();
    };
}
/**
 * Manually invalidate cache for a specific entity type
 */
function invalidateCache(entityType) {
    for (const key of _responseCache.keys()) {
        if (key.startsWith(`${entityType}:`)) {
            _responseCache.delete(key);
        }
    }
}
// Clean up stale entries every 5 minutes
setInterval(() => {
    const cutoff = Date.now() - DEFAULT_TTL * 5;
    for (const [key, entry] of _responseCache) {
        if (entry.timestamp < cutoff)
            _responseCache.delete(key);
    }
}, 300000);
