"use strict";
/**
 * Lock Date Validator (Odoo-style Continuous Accounting)
 *
 * Enforces fiscal period protection via lock dates instead of destructive
 * closing entries. Mirrors Odoo's layered locking approach:
 *   - fiscalyear_lock_date: General accounting lock
 *   - tax_lock_date: Tax-specific lock (stricter)
 *   - hard_lock_date: Immutable lock (cannot be overridden even by admins)
 *
 * Design: Pure utility — no side effects, no DB access.
 * Controllers call this with dates from DB cache or middleware.
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
exports.checkLockDate = checkLockDate;
exports.fetchLockDatesForDate = fetchLockDatesForDate;
exports.validateDateAgainstLockDates = validateDateAgainstLockDates;
// ─── Core Validation ─────────────────────────────────────
/**
 * Check whether a transaction date falls within a locked period.
 *
 * Lock priority (highest first):
 *   1. hard_lock_date — blocks everything, no override
 *   2. tax_lock_date  — blocks tax-related entries
 *   3. fiscalyear_lock_date — blocks general entries
 */
function checkLockDate(transactionDate, lockDates, context = 'GENERAL') {
    const txDate = normalizeDate(transactionDate);
    if (!txDate) {
        return { isLocked: false, lockType: null, lockDate: null, message: '' };
    }
    // 1. Hard lock — always checked, never overridable
    if (lockDates.hardLockDate) {
        const hardDate = normalizeDate(lockDates.hardLockDate);
        if (hardDate && txDate <= hardDate) {
            return {
                isLocked: true,
                lockType: 'HARD_LOCK',
                lockDate: lockDates.hardLockDate,
                message: `هذا التاريخ مقفل نهائياً (Hard Lock). لا يمكن تعديل أي قيود قبل ${lockDates.hardLockDate}`
            };
        }
    }
    // 2. Tax lock — checked for tax context
    if ((context === 'TAX' || context === 'ALL') && lockDates.taxLockDate) {
        const taxDate = normalizeDate(lockDates.taxLockDate);
        if (taxDate && txDate <= taxDate) {
            return {
                isLocked: true,
                lockType: 'TAX_LOCK',
                lockDate: lockDates.taxLockDate,
                message: `فترة الضريبة مقفلة حتى ${lockDates.taxLockDate}. لا يمكن تعديل القيود الضريبية.`
            };
        }
    }
    // 3. Fiscal year lock — general protection
    if (lockDates.fiscalyearLockDate) {
        const fyDate = normalizeDate(lockDates.fiscalyearLockDate);
        if (fyDate && txDate <= fyDate) {
            return {
                isLocked: true,
                lockType: 'FISCAL_LOCK',
                lockDate: lockDates.fiscalyearLockDate,
                message: `السنة المالية مقفلة حتى ${lockDates.fiscalyearLockDate}. لا يمكن إضافة أو تعديل قيود في هذه الفترة.`
            };
        }
    }
    return { isLocked: false, lockType: null, lockDate: null, message: '' };
}
// ─── DB Helper ───────────────────────────────────────────
/**
 * Fetch the effective lock dates for a given transaction date.
 * Finds the fiscal year that contains the transaction date and
 * returns its lock date settings.
 */
function fetchLockDatesForDate(conn, transactionDate) {
    return __awaiter(this, void 0, void 0, function* () {
        const dateStr = normalizeDate(transactionDate) || '';
        if (!dateStr) {
            return { fiscalyearLockDate: null, taxLockDate: null, hardLockDate: null };
        }
        const [rows] = yield conn.query(`SELECT fiscalyear_lock_date, tax_lock_date, hard_lock_date
         FROM fiscal_years 
         WHERE start_date <= ? AND end_date >= ?
         LIMIT 1`, [dateStr, dateStr]);
        if (rows.length === 0) {
            return { fiscalyearLockDate: null, taxLockDate: null, hardLockDate: null };
        }
        const row = rows[0];
        return {
            fiscalyearLockDate: formatDbDate(row.fiscalyear_lock_date),
            taxLockDate: formatDbDate(row.tax_lock_date),
            hardLockDate: formatDbDate(row.hard_lock_date),
        };
    });
}
/**
 * Convenience: Fetch + check in one call.
 * Returns the lock check result for a given date against its fiscal year's lock dates.
 */
function validateDateAgainstLockDates(conn_1, transactionDate_1) {
    return __awaiter(this, arguments, void 0, function* (conn, transactionDate, context = 'GENERAL') {
        const lockDates = yield fetchLockDatesForDate(conn, transactionDate);
        return checkLockDate(transactionDate, lockDates, context);
    });
}
// ─── Helpers ─────────────────────────────────────────────
/** Normalize any date input to YYYY-MM-DD string or null */
function normalizeDate(input) {
    if (!input)
        return null;
    if (input instanceof Date) {
        if (isNaN(input.getTime()))
            return null;
        return input.toISOString().slice(0, 10);
    }
    // String — extract YYYY-MM-DD
    const match = String(input).match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
}
/** Format a DB date value (could be Date object or string) to YYYY-MM-DD */
function formatDbDate(val) {
    if (!val)
        return null;
    if (val instanceof Date)
        return val.toISOString().slice(0, 10);
    return normalizeDate(val);
}
