"use strict";
/**
 * POS Refund Engine — Pure Refund Calculations
 * ═════════════════════════════════════════════
 *
 * Extracted from POSRefundModal. Handles:
 *   - Per-line refund total computation
 *   - Overall refund total aggregation
 *   - Validation (max quantity, positive amounts)
 *
 * All arithmetic uses integer piasters.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeRefundLineTotal = computeRefundLineTotal;
exports.computeRefundSummary = computeRefundSummary;
exports.validateRefund = validateRefund;
const money_1 = require("./money");
// ── Calculations ─────────────────────────────────────────────────────────────
/** Compute refund amount for a single line item. Uses piasters internally. */
function computeRefundLineTotal(line) {
    if (!line.isSelected || line.refundQty <= 0)
        return 0;
    const unitPriceP = (0, money_1.toPiasters)(line.price);
    const grossP = (0, money_1.mulP)(unitPriceP, line.refundQty);
    if (!line.discount || line.discount <= 0)
        return (0, money_1.fromPiasters)(grossP);
    // FIXED discount is a flat total amount on the original line (consistent with cart.ts).
    // For partial refunds, compute the proportional share: discount × (refundQty / originalQty).
    const totalDiscountP = line.discountType === 'PERCENT'
        ? (0, money_1.percentP)(grossP, line.discount)
        : Math.round((0, money_1.toPiasters)(line.discount) * line.refundQty / Math.max(1, line.originalQty));
    return (0, money_1.fromPiasters)(Math.max(0, (0, money_1.subP)(grossP, totalDiscountP)));
}
/** Compute full refund summary from a set of refund lines. */
function computeRefundSummary(lines) {
    const selectedLines = lines.filter(l => l.isSelected && l.refundQty > 0);
    const lineResults = selectedLines.map(line => ({
        productId: line.productId,
        productName: line.productName,
        refundQty: line.refundQty,
        lineTotal: computeRefundLineTotal(line),
    }));
    return {
        selectedCount: selectedLines.length,
        totalRefundAmount: (0, money_1.fromPiasters)((0, money_1.sumP)(lineResults.map(l => (0, money_1.toPiasters)(l.lineTotal)))),
        lines: lineResults,
    };
}
/** Validate refund lines before submission. */
function validateRefund(lines) {
    const selected = lines.filter(l => l.isSelected);
    if (selected.length === 0) {
        return { isValid: false, error: 'لم يتم تحديد أصناف للمرتجع' };
    }
    const overQuantity = selected.find(l => l.refundQty > l.originalQty);
    if (overQuantity) {
        return {
            isValid: false,
            error: `الكمية المرتجعة لـ "${overQuantity.productName}" تتجاوز الكمية الأصلية`,
        };
    }
    const zeroQty = selected.find(l => l.refundQty <= 0);
    if (zeroQty) {
        return {
            isValid: false,
            error: `الكمية المرتجعة لـ "${zeroQty.productName}" يجب أن تكون أكبر من صفر`,
        };
    }
    return { isValid: true };
}
