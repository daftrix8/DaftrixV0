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
exports.MembershipRenewals = void 0;
const db_1 = require("../../db");
const lifecycle_1 = require("./lifecycle");
const billing_1 = require("./billing");
const crypto_1 = require("crypto");
const dateEngine_1 = require("../../utils/dateEngine");
class MembershipRenewals {
    /**
     * Renews an existing membership. Can be called if active or expired.
     */
    static renewMembership(id, packageId, joinDate, userId, providedConn, salesmanId, branchId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const conn = providedConn || (yield (0, db_1.getConnection)());
            if (!providedConn)
                yield conn.beginTransaction();
            try {
                const oldMembership = yield lifecycle_1.MembershipLifecycle.getMembership(id, conn);
                // Fetch package
                const [packages] = yield conn.query('SELECT id, name, durationDays, includedVisits, price, commissionType, commissionValue FROM membership_packages WHERE id = ?', [packageId]);
                if (packages.length === 0)
                    throw new Error('Package not found');
                const pkg = packages[0];
                // Mark old as expired if it was active and we are replacing it
                if (oldMembership.status !== 'EXPIRED' && oldMembership.status !== 'CANCELLED') {
                    yield lifecycle_1.MembershipLifecycle.changeStatus(id, 'EXPIRED', 'Renewed', 'Replaced by new membership cycle', userId, conn);
                }
                // Create new membership record
                const newMembershipId = (0, crypto_1.randomUUID)();
                const endDate = dateEngine_1.DateEngine.addDays(joinDate, pkg.durationDays).format('YYYY-MM-DD');
                // Fetch customer name for safety
                const [customers] = yield conn.query('SELECT name FROM partners WHERE id = ?', [oldMembership.customerId]);
                const customerName = (_a = customers[0]) === null || _a === void 0 ? void 0 : _a.name;
                // Generate invoice first
                const billingRes = yield billing_1.MembershipBilling.generateInvoice(newMembershipId, oldMembership.customerId, customerName || 'Unknown', packageId, userId, conn, false, undefined, salesmanId, branchId);
                // Calculate commission amount at the time of renewal
                let commissionAmount = 0.00;
                if (salesmanId) {
                    const [salesmen] = yield conn.query('SELECT commissionRate FROM salesmen WHERE id = ?', [salesmanId]);
                    const salesmanRate = salesmen.length > 0 ? (salesmen[0].commissionRate || 0) : 0;
                    const val = pkg.commissionValue || 0;
                    if (pkg.commissionType === 'FIXED') {
                        commissionAmount = val;
                    }
                    else {
                        const pct = val > 0 ? val : salesmanRate;
                        commissionAmount = pkg.price * (pct / 100);
                    }
                    commissionAmount = Math.round(commissionAmount * 100) / 100;
                }
                // Insert new membership
                yield conn.query(`
                INSERT INTO memberships (
                    id, customerId, packageId, description, joinDate, endDate, 
                    status, invoiceId, includedVisits, remainingVisits, salesmanId, commissionAmount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                    newMembershipId,
                    oldMembership.customerId,
                    packageId,
                    'Renewal of ' + oldMembership.id.slice(0, 8),
                    joinDate,
                    endDate,
                    'PENDING_PAYMENT',
                    billingRes.invoiceId,
                    pkg.includedVisits,
                    pkg.includedVisits,
                    salesmanId || null,
                    commissionAmount
                ]);
                // Add Log
                yield lifecycle_1.MembershipLifecycle.addLog(newMembershipId, 'Created', 'Membership renewed from previous cycle', userId, null, conn);
                if (!providedConn)
                    yield conn.commit();
                return { id: newMembershipId, invoiceId: billingRes.invoiceId };
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
}
exports.MembershipRenewals = MembershipRenewals;
