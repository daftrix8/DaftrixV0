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
exports.initializeMembershipJobs = initializeMembershipJobs;
const node_schedule_1 = __importDefault(require("node-schedule"));
const expiration_1 = require("../services/membershipEngine/expiration");
const freezes_1 = require("../services/membershipEngine/freezes");
const billing_1 = require("../services/membershipEngine/billing");
function initializeMembershipJobs() {
    // Run daily at midnight server time (00:00)
    node_schedule_1.default.scheduleJob('0 0 * * *', () => __awaiter(this, void 0, void 0, function* () {
        console.log('[CRON] Running daily membership jobs...');
        try {
            yield expiration_1.MembershipExpiration.processScheduledExpirations();
            console.log('[CRON] Membership auto-expirations processed successfully.');
        }
        catch (error) {
            console.error('[CRON] Error processing auto-expirations:', error);
        }
        try {
            yield freezes_1.MembershipFreezes.processScheduledUnfreezes();
            console.log('[CRON] Membership auto-unfreezes processed successfully.');
        }
        catch (error) {
            console.error('[CRON] Error processing auto-unfreezes:', error);
        }
        try {
            yield billing_1.MembershipBilling.processRecurringBilling();
            console.log('[CRON] Membership recurring billing processed successfully.');
        }
        catch (error) {
            console.error('[CRON] Error processing recurring billing:', error);
        }
    }));
    console.log('[CRON] Membership jobs initialized.');
}
