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
exports.MembershipExpiration = void 0;
const db_1 = require("../../db");
const lifecycle_1 = require("./lifecycle");
const dateEngine_1 = require("../../utils/dateEngine");
class MembershipExpiration {
    /**
     * CRON Job hook to expire memberships that have passed their endDate
     */
    static processScheduledExpirations(providedConn) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = providedConn || (yield (0, db_1.getConnection)());
            if (!providedConn)
                yield connection.beginTransaction();
            try {
                const todayStr = dateEngine_1.DateEngine.todayStr();
                const [expiredMemberships] = yield connection.query('SELECT id FROM memberships WHERE status = ? AND endDate < ?', ['ACTIVE', todayStr]);
                for (const m of expiredMemberships) {
                    try {
                        yield lifecycle_1.MembershipLifecycle.changeStatus(m.id, 'EXPIRED', 'Auto-Expired', `End date (${todayStr}) has passed.`, 'System Cron', connection);
                    }
                    catch (err) {
                        console.error(`Failed to auto-expire membership ${m.id}`, err);
                    }
                }
                if (!providedConn)
                    yield connection.commit();
            }
            catch (error) {
                if (!providedConn)
                    yield connection.rollback();
                throw error;
            }
            finally {
                if (!providedConn)
                    connection.release();
            }
        });
    }
}
exports.MembershipExpiration = MembershipExpiration;
