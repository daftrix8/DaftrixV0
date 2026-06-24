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
        this.lastUpdates = {
            products: new Date().toISOString(),
            partners: new Date().toISOString(),
            invoices: new Date().toISOString(),
            accounts: new Date().toISOString(),
            permits: new Date().toISOString(),
            cheques: new Date().toISOString(),
            mfg: new Date().toISOString(),
            crm: new Date().toISOString(),
            memberships: new Date().toISOString(),
            settings: new Date().toISOString(),
            chat: new Date().toISOString(),
            global: new Date().toISOString()
        };
        // Allow many listeners (Socket.IO + multiple SSE clients)
        this.setMaxListeners(500);
        // Update in-memory timestamps on entity change broadcasts
        this.on('broadcast', ({ event, data }) => {
            const now = new Date().toISOString();
            this.lastUpdates.global = now;
            const entityType = (data === null || data === void 0 ? void 0 : data.entityType) || '';
            if (event === 'invoice:new' || event === 'invoice:changed' || event === 'invoice:removed' || entityType === 'invoice' || entityType === 'invoices') {
                this.lastUpdates.invoices = now;
            }
            if (event === 'product:changed' || event === 'stock:updated' || entityType === 'products' || entityType === 'product') {
                this.lastUpdates.products = now;
            }
            if (event === 'partner:changed' || entityType === 'partners' || entityType === 'partner') {
                this.lastUpdates.partners = now;
            }
            if (entityType === 'accounts' || entityType === 'account') {
                this.lastUpdates.accounts = now;
            }
            if (entityType === 'permits' || entityType === 'stock-permits' || entityType === 'stock_permits') {
                this.lastUpdates.permits = now;
            }
            if (entityType === 'cheques' || entityType === 'cheque') {
                this.lastUpdates.cheques = now;
            }
            if (entityType === 'boms' || entityType === 'bom' || entityType === 'production-orders' || entityType === 'production_orders' || event === 'production:updated') {
                this.lastUpdates.mfg = now;
            }
            if (entityType === 'crm-leads' || entityType === 'crm-stages' || entityType === 'crm-activities' || entityType === 'leads' || entityType === 'lead') {
                this.lastUpdates.crm = now;
            }
            if (entityType === 'memberships' || entityType === 'membership' || entityType === 'membership-packages' || entityType === 'membership-freezes') {
                this.lastUpdates.memberships = now;
            }
            if (entityType === 'settings' || entityType === 'branches' || entityType === 'warehouses' || entityType === 'categories' || entityType === 'salesmen' || entityType === 'taxes' || entityType === 'cost_centers' || entityType === 'cash_categories' || entityType === 'partner_groups' || entityType === 'price_lists') {
                this.lastUpdates.settings = now;
            }
            if (event === 'chat:message' || event === 'chat:private' || event === 'chat:group') {
                this.lastUpdates.chat = now;
            }
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
