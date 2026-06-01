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
exports.MembershipLifecycle = void 0;
const db_1 = require("../../db");
const eventBus_1 = require("../../utils/eventBus");
class MembershipLifecycle {
    static getMembership(id_1, conn_1) {
        return __awaiter(this, arguments, void 0, function* (id, conn, lockForUpdate = false) {
            const connection = conn || (yield (0, db_1.getConnection)());
            try {
                const query = `SELECT id, customerId, packageId, status, joinDate, endDate, includedVisits, remainingVisits, invoiceId FROM memberships WHERE id = ? ${lockForUpdate ? 'FOR UPDATE' : ''}`;
                const [rows] = yield connection.query(query, [id]);
                if (rows.length === 0)
                    throw new Error('Membership not found');
                const membership = rows[0];
                if (membership.status)
                    membership.status = membership.status.toUpperCase();
                return membership;
            }
            finally {
                if (!conn)
                    connection.release();
            }
        });
    }
    static changeStatus(id, newStatus, actionLabel, notes, userId, providedConn) {
        return __awaiter(this, void 0, void 0, function* () {
            const conn = providedConn || (yield (0, db_1.getConnection)());
            if (!providedConn)
                yield conn.beginTransaction();
            try {
                const membership = yield this.getMembership(id, conn);
                // Validate transition
                this.validateTransition(membership.status, newStatus);
                // Update status
                yield conn.query('UPDATE memberships SET status = ? WHERE id = ?', [newStatus, id]);
                // Add Audit Log
                yield this.addLog(id, actionLabel, notes || `Status changed from ${membership.status} to ${newStatus}`, userId, null, conn);
                if (!providedConn)
                    yield conn.commit();
                eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'memberships', entityId: id, updatedBy: userId || 'System' });
                return { success: true, oldStatus: membership.status, newStatus };
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
    static validateTransition(currentStatus, newStatus) {
        const cs = currentStatus.toUpperCase();
        const ns = newStatus.toUpperCase();
        const allowedTransitions = {
            ['PENDING_PAYMENT']: ['ACTIVE', 'CANCELLED'],
            ['ACTIVE']: ['FROZEN', 'SUSPENDED', 'EXPIRED', 'CANCELLED'],
            ['FROZEN']: ['ACTIVE', 'CANCELLED'],
            ['SUSPENDED']: ['ACTIVE', 'CANCELLED'],
            ['EXPIRED']: ['ACTIVE', 'CANCELLED'], // Renewals create a new membership or reactivate
            ['CANCELLED']: [] // Terminal state
        };
        const allowed = allowedTransitions[cs] || [];
        if (!allowed.includes(ns)) {
            throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
        }
    }
    static addLog(membershipId, action, notes, userId, metadata, conn) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = conn || (yield (0, db_1.getConnection)());
            try {
                const { randomUUID } = require('crypto');
                yield connection.query(`
                INSERT INTO membership_audit_logs (id, membershipId, action, details, userId, metadata)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [randomUUID(), membershipId, action, notes, userId || null, metadata ? JSON.stringify(metadata) : null]);
            }
            finally {
                if (!conn)
                    connection.release();
            }
        });
    }
}
exports.MembershipLifecycle = MembershipLifecycle;
