"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Decimal = void 0;
exports.D = D;
exports.toNum = toNum;
exports.sumD = sumD;
exports.roundMoney = roundMoney;
exports.moneyEqual = moneyEqual;
exports.absD = absD;
/**
 * Decimal-Safe Money Utilities
 * ============================
 * Wraps decimal.js for financial arithmetic in the ERP backend.
 *
 * WHY: JavaScript's IEEE 754 floats cause drift:
 *   0.1 + 0.2 === 0.30000000000000004
 *   Over 10,000 invoices, partner balances drift by ±0.01–1.00 EGP.
 *
 * USAGE:
 *   import { D, toNum, sumD, roundMoney } from '../utils/decimalUtils';
 *   const total = D(price).mul(qty).minus(discount);
 *   await conn.query('INSERT ... VALUES (?)', [toNum(total)]);
 *
 * PERF: Decimal operations are ~5x slower than native floats.
 *       Only use for MONEY fields (total, paidAmount, balance, debit, credit).
 *       Do NOT use for quantities, timestamps, or IDs.
 */
const decimal_js_1 = __importDefault(require("decimal.js"));
exports.Decimal = decimal_js_1.default;
// Configure for financial precision
decimal_js_1.default.set({
    precision: 20, // Internal precision (digits)
    rounding: decimal_js_1.default.ROUND_HALF_UP, // Banker's rounding
    toExpNeg: -9,
    toExpPos: 15,
});
/**
 * Create a Decimal from any value. Safe for null/undefined/NaN.
 * Returns Decimal(0) for falsy or invalid inputs.
 */
function D(value) {
    if (value === null || value === undefined || value === '')
        return new decimal_js_1.default(0);
    try {
        const d = new decimal_js_1.default(value);
        return d.isNaN() ? new decimal_js_1.default(0) : d;
    }
    catch (_a) {
        return new decimal_js_1.default(0);
    }
}
/**
 * Convert Decimal back to a JS number for DB insertion.
 * Rounds to `dp` decimal places (default 2 for money).
 */
function toNum(value, dp = 2) {
    if (typeof value === 'number')
        return Number(Number(value).toFixed(dp));
    return value.toDecimalPlaces(dp, decimal_js_1.default.ROUND_HALF_UP).toNumber();
}
/**
 * Sum an array of values with Decimal precision.
 * Avoids the classic floating-point accumulation error.
 */
function sumD(values) {
    return values.reduce((acc, v) => acc.plus(D(v)), new decimal_js_1.default(0));
}
/**
 * Round a number to 2 decimal places using Decimal.js.
 * Drop-in replacement for `Number(x.toFixed(2))`.
 */
function roundMoney(value) {
    return toNum(D(value), 2);
}
/**
 * Check if two money values are equal within 2dp precision.
 * Replaces dangerous `a === b` or `Math.abs(a - b) < 0.01` patterns.
 */
function moneyEqual(a, b) {
    return D(a).toDecimalPlaces(2).equals(D(b).toDecimalPlaces(2));
}
/**
 * Absolute value with Decimal precision.
 */
function absD(value) {
    return D(value).abs();
}
