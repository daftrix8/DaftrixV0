"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventBus = void 0;
const events_1 = require("events");
/**
 * Central Event Bus for real-time updates.
 * Both Socket.IO and SSE subscribe to this bus.
 * Controllers broadcast events here instead of calling io.emit() directly.
 */
class EventBus extends events_1.EventEmitter {
    constructor() {
        super();
        // Allow many listeners (Socket.IO + multiple SSE clients)
        this.setMaxListeners(500);
        // ── Auto-invalidate server-side cache on entity changes ──
        // When any entity is created/updated/deleted, clear related caches
        // so the next request gets fresh data from DB
        this.on('broadcast', ({ event, data }) => {
            try {
                const { responseCache } = require('./responseCache');
                const entityType = (data === null || data === void 0 ? void 0 : data.entityType) || '';
                // Dashboard cache is invalidated on ANY entity change
                // (sales stats, treasury, receivables all depend on invoices/journals)
                if (event === 'entity:changed' || event === 'entity:deleted') {
                    responseCache.invalidatePrefix('dashboard:');
                }
                // Entity-specific cache invalidation
                if (entityType) {
                    responseCache.invalidatePrefix(`${entityType}:`);
                }
                // Invalidate account lookup cache when accounts change
                if (entityType === 'accounts') {
                    try {
                        const { invalidateAccountCache } = require('./accountCache');
                        invalidateAccountCache();
                    }
                    catch ( /* not loaded yet */_a) { /* not loaded yet */ }
                }
            }
            catch (_b) {
                // Cache module not loaded yet — ignore
            }
        });
    }
    static getInstance() {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }
    /**
     * Broadcast an event to all real-time channels (Socket.IO + SSE).
     * This is the replacement for io.emit() in controllers.
     */
    broadcast(event, data) {
        this.emit('broadcast', { event, data });
    }
}
exports.eventBus = EventBus.getInstance();
