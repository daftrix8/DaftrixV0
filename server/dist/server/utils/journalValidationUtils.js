"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertBalanced = assertBalanced;
const decimalUtils_1 = require("./decimalUtils");
/**
 * Validates that journal lines are balanced.
 * If the variance is non-zero but within `roundingAllowance` (default 0.05),
 * it automatically appends a rounding difference line referencing account '511'.
 * If the variance exceeds the allowance, it throws an error.
 */
function assertBalanced(lines, roundingAllowance = 0.05) {
    var _a, _b, _c;
    if (!lines || lines.length === 0) {
        throw new Error('Journal entry must have at least one line.');
    }
    // Filter out any auto-generated rounding lines from previous runs
    const cleanLines = lines.filter(l => l.accountId !== '511');
    const totalDebit = cleanLines.reduce((sum, l) => sum.plus((0, decimalUtils_1.D)(l.debit)), (0, decimalUtils_1.D)(0));
    const totalCredit = cleanLines.reduce((sum, l) => sum.plus((0, decimalUtils_1.D)(l.credit)), (0, decimalUtils_1.D)(0));
    const diff = totalDebit.minus(totalCredit);
    const absDiffNum = Math.abs((0, decimalUtils_1.toNum)(diff, 4));
    if (absDiffNum === 0) {
        return cleanLines;
    }
    if (absDiffNum <= roundingAllowance) {
        // We need to add a rounding adjustment line
        const roundingLine = {
            accountId: '511',
            accountName: 'فروق التقريب',
            debit: (0, decimalUtils_1.toNum)(diff.isNegative() ? diff.abs() : (0, decimalUtils_1.D)(0), 2),
            credit: (0, decimalUtils_1.toNum)(diff.isPositive() ? diff : (0, decimalUtils_1.D)(0), 2),
            costCenterId: ((_a = cleanLines[0]) === null || _a === void 0 ? void 0 : _a.costCenterId) || null,
            foreignDebit: 0,
            foreignCredit: 0,
            currencyCode: ((_b = cleanLines[0]) === null || _b === void 0 ? void 0 : _b.currencyCode) || 'EGP',
            exchangeRate: ((_c = cleanLines[0]) === null || _c === void 0 ? void 0 : _c.exchangeRate) || 1
        };
        // If the rounding line has non-zero amount, add it
        if (roundingLine.debit > 0 || roundingLine.credit > 0) {
            return [...cleanLines, roundingLine];
        }
        return cleanLines;
    }
    // Variance exceeds the allowance, throw an explicit error
    const error = new Error(`Journal entry debits and credits do not balance. Total Debit: ${(0, decimalUtils_1.toNum)(totalDebit)}, Total Credit: ${(0, decimalUtils_1.toNum)(totalCredit)}, Difference: ${(0, decimalUtils_1.toNum)(diff)}`);
    error.code = 'UNBALANCED_ENTRY';
    error.status = 400;
    error.context = {
        totalDebit: (0, decimalUtils_1.toNum)(totalDebit),
        totalCredit: (0, decimalUtils_1.toNum)(totalCredit),
        diff: (0, decimalUtils_1.toNum)(diff)
    };
    throw error;
}
