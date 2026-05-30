"use strict";
/**
 * POS Money — Integer Piaster Arithmetic
 * ═══════════════════════════════════════
 *
 * Thin wrappers over the SINGLE financial math engine (utils/money.ts).
 * All internal POS calculations operate in piasters (1/100 of a pound).
 *
 * Boundary rule:
 *   toPiasters() at entry → all math in integers → fromPiasters() at display
 *
 * IMPORTANT: This file does NOT contain its own math. It delegates to
 * utils/money.ts (Decimal.js) to guarantee ONE consistent precision system.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.safePercent = exports.safeSum = exports.isEffectivelyZero = exports.safeRound = exports.safeDiv = exports.safeMul = exports.safeSub = exports.safeAdd = void 0;
exports.toPiasters = toPiasters;
exports.fromPiasters = fromPiasters;
exports.addP = addP;
exports.subP = subP;
exports.mulP = mulP;
exports.percentP = percentP;
exports.sumP = sumP;
exports.isBalanced = isBalanced;
const money_1 = require("../money");
const PIASTERS_PER_UNIT = 100;
/** Convert a display amount (e.g. 12.50) to integer piasters (1250). */
function toPiasters(amount) {
    return Math.round((0, money_1.safeMul)(amount, PIASTERS_PER_UNIT));
}
/** Convert integer piasters (1250) back to display amount (12.50). */
function fromPiasters(piasters) {
    return (0, money_1.safeDiv)(piasters, PIASTERS_PER_UNIT);
}
/** Add piaster amounts. */
function addP(...values) {
    return Math.round((0, money_1.safeAdd)(...values));
}
/** Subtract: a - b in piasters. */
function subP(a, b) {
    return Math.round((0, money_1.safeSub)(a, b));
}
/** Multiply piaster amount by a scalar (e.g. quantity). Rounds to integer. */
function mulP(piasters, scalar) {
    return Math.round((0, money_1.safeMul)(piasters, scalar));
}
/** Percentage of piaster amount. Returns piasters. */
function percentP(piasters, rate) {
    return Math.round((0, money_1.safeDiv)((0, money_1.safeMul)(piasters, rate), 100));
}
/** Sum an array of piaster amounts. */
function sumP(values) {
    return Math.round((0, money_1.safeSum)(values));
}
/** Check if a piaster amount is effectively zero (within 1 piaster). */
function isBalanced(piasters) {
    return (0, money_1.isEffectivelyZero)(piasters, 1.5);
}
// ── Re-export display-layer functions for convenience ────────────────────────
// Components that only need display rounding can import from here
// instead of maintaining two import paths.
var money_2 = require("../money");
Object.defineProperty(exports, "safeAdd", { enumerable: true, get: function () { return money_2.safeAdd; } });
Object.defineProperty(exports, "safeSub", { enumerable: true, get: function () { return money_2.safeSub; } });
Object.defineProperty(exports, "safeMul", { enumerable: true, get: function () { return money_2.safeMul; } });
Object.defineProperty(exports, "safeDiv", { enumerable: true, get: function () { return money_2.safeDiv; } });
Object.defineProperty(exports, "safeRound", { enumerable: true, get: function () { return money_2.safeRound; } });
Object.defineProperty(exports, "isEffectivelyZero", { enumerable: true, get: function () { return money_2.isEffectivelyZero; } });
var money_3 = require("../money");
Object.defineProperty(exports, "safeSum", { enumerable: true, get: function () { return money_3.safeSum; } });
Object.defineProperty(exports, "safePercent", { enumerable: true, get: function () { return money_3.safePercent; } });
