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
exports.initializeReservationJobs = initializeReservationJobs;
const node_schedule_1 = __importDefault(require("node-schedule"));
const db_1 = require("../db");
/**
 * Periodically checks for expired checkout stock reservations and releases their stocks.
 */
function initializeReservationJobs() {
    // Run every minute
    node_schedule_1.default.scheduleJob('*/1 * * * *', () => __awaiter(this, void 0, void 0, function* () {
        let conn;
        try {
            conn = yield db_1.pool.getConnection();
            // Find distinct expired recovery tokens
            const [expired] = yield conn.query('SELECT DISTINCT recoveryToken FROM checkout_stock_reservations WHERE expiresAt < NOW()');
            if (expired && expired.length > 0) {
                console.log(`[CRON] Found ${expired.length} expired storefront checkouts. Releasing stock...`);
                for (const row of expired) {
                    const token = row.recoveryToken;
                    yield conn.beginTransaction();
                    try {
                        // 1. Fetch reservations for this token with FOR UPDATE to prevent race conditions with createInvoice
                        const [reservations] = yield conn.query('SELECT productId, variantId, warehouseId, quantity FROM checkout_stock_reservations WHERE recoveryToken = ? FOR UPDATE', [token]);
                        for (const res of reservations) {
                            const qty = Number(res.quantity) || 0;
                            if (qty <= 0)
                                continue;
                            // Restore global product stock
                            yield conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [qty, res.productId]);
                            // Restore warehouse product stock
                            yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) 
                                 VALUES (UUID(), ?, ?, ?) 
                                 ON DUPLICATE KEY UPDATE stock = stock + ?`, [res.productId, res.warehouseId, qty, qty]);
                            // Restore variant stock if applicable
                            if (res.variantId) {
                                yield conn.query('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [qty, res.variantId]);
                                yield conn.query(`INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock) 
                                     VALUES (UUID(), ?, ?, ?, ?) 
                                     ON DUPLICATE KEY UPDATE stock = stock + ?`, [res.variantId, res.productId, res.warehouseId, qty, qty]);
                            }
                        }
                        // 2. Delete reservation records
                        yield conn.query('DELETE FROM checkout_stock_reservations WHERE recoveryToken = ?', [token]);
                        // 3. Mark checkout draft status as 'EXPIRED' if still PENDING
                        yield conn.query("UPDATE storefront_abandoned_checkouts SET status = 'EXPIRED' WHERE recoveryToken = ? AND status = 'PENDING'", [token]);
                        yield conn.commit();
                        console.log(`[CRON] Released stock and marked EXPIRED for token: ${token}`);
                    }
                    catch (txErr) {
                        yield conn.rollback();
                        console.error(`[CRON] Failed to release stock for token ${token}:`, txErr);
                    }
                }
            }
        }
        catch (error) {
            console.error('[CRON] Error in reservation cleanup job:', error);
        }
        finally {
            if (conn)
                conn.release();
        }
    }));
    console.log('[CRON] Storefront reservation cleanup job initialized.');
}
