"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Financial Math Utilities — Decimal-Safe Arithmetic
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Wraps Decimal.js to eliminate floating-point precision errors in
 * financial calculations. Prevents issues like:
 *     0.1 + 0.2 = 0.30000000000000004
 *
 * All functions accept and return standard JS `number` values —
 * the precision layer is invisible to consumer code.
 *
 * Usage:
 *   import { safeAdd, safeSub, safeDiv, safeMul, safeRound } from '../utils/money';
 *   const total = safeAdd(price, tax, shipping);
 *   const perUnit = safeDiv(total, quantity);
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeAdd = safeAdd;
exports.safeSub = safeSub;
exports.safeMul = safeMul;
exports.safeDiv = safeDiv;
exports.safeRound = safeRound;
exports.safeSum = safeSum;
exports.isEffectivelyZero = isEffectivelyZero;
exports.safePercent = safePercent;
const decimal_js_1 = __importDefault(require("decimal.js"));
// Configure Decimal.js for financial use
decimal_js_1.default.set({
    precision: 20, // More than enough for any ERP calculation
    rounding: decimal_js_1.default.ROUND_HALF_UP // Standard banker's rounding
});
/**
 * Add multiple values with decimal precision.
 * safeAdd(0.1, 0.2) → 0.3 (not 0.30000000000000004)
 */
function safeAdd(...values) {
    return values
        .reduce((sum, v) => sum.plus(new decimal_js_1.default(v || 0)), new decimal_js_1.default(0))
        .toNumber();
}
/**
 * Subtract b from a with decimal precision.
 * safeSub(0.3, 0.1) → 0.2 (not 0.19999999999999998)
 */
function safeSub(a, b) {
    return new decimal_js_1.default(a || 0).minus(new decimal_js_1.default(b || 0)).toNumber();
}
/**
 * Multiply a * b with decimal precision.
 * safeMul(0.1, 0.2) → 0.02 (not 0.020000000000000004)
 */
function safeMul(a, b) {
    return new decimal_js_1.default(a || 0).times(new decimal_js_1.default(b || 0)).toNumber();
}
/**
 * Divide a / b with decimal precision. Returns 0 if b is 0.
 * Prevents division-by-zero and floating point drift.
 */
function safeDiv(a, b) {
    if (!b || b === 0)
        return 0;
    return new decimal_js_1.default(a || 0).div(new decimal_js_1.default(b)).toNumber();
}
/**
 * Round a number to the specified decimal places (default: 2 for currency).
 * Uses banker's rounding (ROUND_HALF_UP).
 */
function safeRound(value, decimals = 2) {
    return new decimal_js_1.default(value || 0).toDecimalPlaces(decimals, decimal_js_1.default.ROUND_HALF_UP).toNumber();
}
/**
 * Sum an array of numbers with decimal precision.
 * Replaces: arr.reduce((s, v) => s + v, 0)
 */
function safeSum(values) {
    return values
        .reduce((sum, v) => sum.plus(new decimal_js_1.default(v || 0)), new decimal_js_1.default(0))
        .toNumber();
}
/**
 * Check if a value is effectively zero (within financial tolerance).
 * Useful for balance sheet checks and reconciliation.
 */
function isEffectivelyZero(value, tolerance = 0.01) {
    return Math.abs(value) < tolerance;
}
/**
 * Calculate percentage with precision.
 * safePercent(150, 1000) → 15 (meaning 15%)
 */
function safePercent(part, whole) {
    if (!whole || whole === 0)
        return 0;
    return new decimal_js_1.default(part || 0).div(new decimal_js_1.default(whole)).times(100).toNumber();
}
