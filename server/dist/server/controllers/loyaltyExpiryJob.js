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
Object.defineProperty(exports, "__esModule", { value: true });
exports.processLoyaltyExpirations = exports.initLoyaltyExpiryJob = void 0;
const schedule = __importStar(require("node-schedule"));
const uuid_1 = require("uuid");
const db_1 = require("../db");
const dateUtils_1 = require("../../utils/dateUtils");
let expiryJob = null;
const initLoyaltyExpiryJob = () => {
    // Run at 2:00 AM every day
    expiryJob = schedule.scheduleJob('0 2 * * *', () => __awaiter(void 0, void 0, void 0, function* () {
        console.log('🔄 [Loyalty Expiry Job] Starting daily check for expired loyalty points...');
        yield (0, exports.processLoyaltyExpirations)();
        console.log('✅ [Loyalty Expiry Job] Completed daily check.');
    }));
    console.log('🕒 Loyalty Expiry Job initialized (Runs at 02:00 AM daily)');
};
exports.initLoyaltyExpiryJob = initLoyaltyExpiryJob;
const processLoyaltyExpirations = () => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // Find all EARN/ADJUST transactions that have expired but still have unconsumed points
        const [expiredTx] = yield conn.query(`
            SELECT t.id, t.customerId, t.points, 
                   COALESCE(SUM(c.pointsConsumed), 0) as consumed
            FROM loyalty_transactions t
            LEFT JOIN loyalty_point_consumptions c ON t.id = c.earnTransactionId
            WHERE t.type IN ('EARN', 'ADJUST') AND t.points > 0
              AND t.expiresAt IS NOT NULL AND t.expiresAt <= NOW()
            GROUP BY t.id
            HAVING (t.points - consumed) > 0
        `);
        let totalExpiredPoints = 0;
        let totalCustomersAffected = 0;
        const now = (0, dateUtils_1.getEgyptianISOString)();
        const affectedCustomers = new Set();
        for (const tx of expiredTx) {
            const availableToExpire = Number(tx.points) - Number(tx.consumed);
            if (availableToExpire <= 0)
                continue;
            const expireTxId = (0, uuid_1.v4)();
            // 1. Insert the EXPIRE transaction
            yield conn.query(`
                INSERT INTO loyalty_transactions (
                    id, customerId, type, points, reference, notes, createdAt
                ) VALUES (?, ?, 'EXPIRE', ?, ?, 'Points expired due to validity period', ?)
            `, [
                expireTxId,
                tx.customerId,
                -Math.abs(availableToExpire), // Make it negative conceptually, though deriveBalance takes ABS()
                `EXP-${tx.id.substring(0, 8)}`,
                now
            ]);
            // 2. Consume the remaining points in the join table to ensure idempotency
            yield conn.query(`
                INSERT INTO loyalty_point_consumptions (
                    id, earnTransactionId, consumeTransactionId, pointsConsumed, createdAt
                ) VALUES (?, ?, ?, ?, ?)
            `, [
                (0, uuid_1.v4)(),
                tx.id,
                expireTxId,
                availableToExpire,
                now
            ]);
            totalExpiredPoints += availableToExpire;
            affectedCustomers.add(tx.customerId);
        }
        yield conn.commit();
        if (totalExpiredPoints > 0) {
            console.log(`📉 [Loyalty Expiry] Expired ${totalExpiredPoints} points across ${affectedCustomers.size} customers.`);
        }
    }
    catch (error) {
        yield conn.rollback();
        console.error('❌ [Loyalty Expiry Job] Error processing expirations:', error);
    }
    finally {
        conn.release();
    }
});
exports.processLoyaltyExpirations = processLoyaltyExpirations;
