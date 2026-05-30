"use strict";
/**
 * Fiscal Year Utilities
 * Validates that transactions can be posted to a given date
 * Checks both closed fiscal years and locked periods
 */
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
exports.validateFiscalYearOpen = validateFiscalYearOpen;
const db_1 = require("../db");
/**
 * Check if a transaction date falls within a CLOSED fiscal year or LOCKED period.
 * Returns { allowed: true } if the date is valid for posting.
 * Returns { allowed: false, error: '...' } if the date is in a closed year or locked period.
 */
function validateFiscalYearOpen(date) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (!date)
                return { allowed: true };
            const transactionDate = typeof date === 'string' ? date.slice(0, 10) : new Date(date).toISOString().slice(0, 10);
            // 1. Check if date falls within a CLOSED fiscal year
            const [closedYears] = yield db_1.pool.query(`SELECT id, name FROM fiscal_years 
             WHERE status = 'CLOSED' 
               AND start_date <= ? 
               AND end_date >= ?`, [transactionDate, transactionDate]);
            if (closedYears.length > 0) {
                const fy = closedYears[0];
                return {
                    allowed: false,
                    error: `لا يمكن إجراء عمليات في سنة مالية مقفلة "${fy.name}"`,
                    errorCode: 'FISCAL_YEAR_CLOSED',
                    fiscalYearName: fy.name
                };
            }
            // 2. Check if date falls within a LOCKED fiscal year period
            try {
                const [lockedPeriods] = yield db_1.pool.query(`SELECT id, name, fiscal_year_id FROM fiscal_year_periods 
                 WHERE status = 'LOCKED' 
                   AND start_date <= ? 
                   AND end_date >= ?`, [transactionDate, transactionDate]);
                if (lockedPeriods.length > 0) {
                    const period = lockedPeriods[0];
                    return {
                        allowed: false,
                        error: `لا يمكن إجراء عمليات في فترة مالية مقفلة "${period.name}"`,
                        errorCode: 'FISCAL_PERIOD_LOCKED',
                        periodName: period.name
                    };
                }
            }
            catch (_e) {
                // fiscal_year_periods table may not exist yet - skip period check
            }
            return { allowed: true };
        }
        catch (error) {
            // AUDIT WARNING: Fiscal year enforcement is disabled due to a DB error.
            // We fail open to avoid blocking transactions, but this MUST be logged
            // so that operations teams know enforcement was bypassed.
            console.error(`🔴 [AUDIT] Fiscal year validation BYPASSED due to DB error for date="${date}":`, error.message);
            console.error('   ⚠️ Transactions may have been posted to closed fiscal years during this outage.');
            // Don't block transactions if the check fails
            return { allowed: true };
        }
    });
}
