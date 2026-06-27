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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MembershipFreezes = void 0;
const db_1 = require("../../db");
const lifecycle_1 = require("./lifecycle");
const dateEngine_1 = require("../../utils/dateEngine");
class MembershipFreezes {
    static freezeMembership(id, reason, freezeEndDate, userId, providedConn) {
        return __awaiter(this, void 0, void 0, function* () {
            const conn = providedConn || (yield (0, db_1.getConnection)());
            if (!providedConn)
                yield conn.beginTransaction();
            try {
                const membership = yield lifecycle_1.MembershipLifecycle.getMembership(id, conn, true);
                // Must be active to freeze
                if (membership.status !== 'ACTIVE') {
                    throw new Error(`Can only freeze active memberships. Current status: ${membership.status}`);
                }
                // Record freeze in periods
                const freezeStart = dateEngine_1.DateEngine.todayStr();
                const { randomUUID } = require('crypto');
                yield conn.query(`
                INSERT INTO membership_freeze_periods (id, membershipId, freezeStart, freezeEnd, freezeReason)
                VALUES (?, ?, ?, ?, ?)
            `, [randomUUID(), id, freezeStart, freezeEndDate, reason]);
                // Change status
                yield lifecycle_1.MembershipLifecycle.changeStatus(id, 'FROZEN', 'Freeze Membership', `Reason: ${reason}, Until: ${freezeEndDate}`, userId, conn);
                if (!providedConn)
                    yield conn.commit();
                return { success: true };
            }
            catch (error) {
                if (!providedConn)
                    yield conn.rollback();
                throw error;
            }
            finally {
                if (!providedConn)
                    conn.release();
            }
        });
    }
    static unfreezeMembership(id, userId, providedConn) {
        return __awaiter(this, void 0, void 0, function* () {
            const conn = providedConn || (yield (0, db_1.getConnection)());
            if (!providedConn)
                yield conn.beginTransaction();
            try {
                const membership = yield lifecycle_1.MembershipLifecycle.getMembership(id, conn, true);
                if (membership.status !== 'FROZEN') {
                    throw new Error('Membership is not frozen');
                }
                // Get active freeze period
                const [periods] = yield conn.query('SELECT freezeStart FROM membership_freeze_periods WHERE membershipId = ? AND actualUnfreezeDate IS NULL ORDER BY freezeStart DESC LIMIT 1', [id]);
                if (periods.length === 0)
                    throw new Error('No active freeze period found');
                // Calculate frozen days
                const freezeStart = periods[0].freezeStart;
                const daysFrozen = dateEngine_1.DateEngine.diffDays(freezeStart, dateEngine_1.DateEngine.todayStr());
                // Extend end date
                const currentEndDate = membership.endDate;
                const newEndDate = dateEngine_1.DateEngine.addDays(currentEndDate, daysFrozen).format('YYYY-MM-DD');
                // If it is a subscription/recurring membership, also extend nextBillingDate
                let newNextBillingDate = null;
                if (membership.billingType === 'RECURRING' && membership.nextBillingDate) {
                    newNextBillingDate = dateEngine_1.DateEngine.addDays(membership.nextBillingDate, daysFrozen).format('YYYY-MM-DD');
                }
                const todayStr = dateEngine_1.DateEngine.todayStr();
                // Close the freeze period record
                yield conn.query(`
                UPDATE membership_freeze_periods 
                SET freezeEnd = ?, actualUnfreezeDate = ?
                WHERE membershipId = ? AND actualUnfreezeDate IS NULL
            `, [todayStr, todayStr, id]);
                // Update membership
                if (newNextBillingDate) {
                    yield conn.query(`
                    UPDATE memberships 
                    SET endDate = ?, nextBillingDate = ?
                    WHERE id = ?
                `, [newEndDate, newNextBillingDate, id]);
                }
                else {
                    yield conn.query(`
                    UPDATE memberships 
                    SET endDate = ?
                    WHERE id = ?
                `, [newEndDate, id]);
                }
                // Change status
                yield lifecycle_1.MembershipLifecycle.changeStatus(id, 'ACTIVE', 'Unfreeze Membership', `Extended end date by ${daysFrozen} days`, userId, conn);
                if (!providedConn)
                    yield conn.commit();
                return { success: true, newEndDate, daysFrozen };
            }
            catch (error) {
                if (!providedConn)
                    yield conn.rollback();
                throw error;
            }
            finally {
                if (!providedConn)
                    conn.release();
            }
        });
    }
    /**
     * CRON Job hook to unfreeze memberships that have reached their freezeEndDate
     */
    static processScheduledUnfreezes(conn) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = conn || (yield (0, db_1.getConnection)());
            try {
                const todayStr = dateEngine_1.DateEngine.todayStr();
                const [frozenMemberships] = yield connection.query('SELECT membershipId FROM membership_freeze_periods WHERE freezeEnd <= ? AND actualUnfreezeDate IS NULL FOR UPDATE', [todayStr]);
                for (const m of frozenMemberships) {
                    try {
                        // Reusing the unfreeze logic, which will calculate days and update the endDate properly
                        // Since it's a cron, we might not want to wrap it entirely in a new transaction if we're already in one,
                        // but unfreezeMembership creates its own transaction. So we'll call it without conn.
                        yield this.unfreezeMembership(m.membershipId, 'System Cron');
                    }
                    catch (err) {
                        console.error(`Failed to auto-unfreeze membership ${m.membershipId}`, err);
                    }
                }
            }
            finally {
                if (!conn)
                    connection.release();
            }
        });
    }
}
exports.MembershipFreezes = MembershipFreezes;
