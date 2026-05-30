"use strict";
/**
 * POS Payments Engine — Split Payment Reconciliation
 * ═══════════════════════════════════════════════════
 *
 * Extracted from POSPaymentModal. Handles:
 *   - Split payment validation
 *   - Change computation
 *   - Remaining balance tracking
 *   - Payment method allocation
 *
 * All arithmetic uses integer piasters.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcilePayments = reconcilePayments;
exports.validatePaymentSplits = validatePaymentSplits;
exports.computePaymentState = computePaymentState;
const money_1 = require("./money");
// ── Reconciliation ───────────────────────────────────────────────────────────
/** Reconcile a set of payment splits against a required total. */
function reconcilePayments(splits, requiredTotal) {
    const requiredP = (0, money_1.toPiasters)(requiredTotal);
    const totalPaidP = (0, money_1.sumP)(splits.map(s => (0, money_1.toPiasters)(s.amount)));
    const remainingP = (0, money_1.subP)(requiredP, totalPaidP);
    // Change is only given on CASH overpayment
    const cashPaidP = (0, money_1.sumP)(splits.filter(s => s.method === 'CASH').map(s => (0, money_1.toPiasters)(s.amount)));
    const nonCashPaidP = (0, money_1.subP)(totalPaidP, cashPaidP);
    const cashRequiredP = Math.max(0, (0, money_1.subP)(requiredP, nonCashPaidP));
    const changeP = Math.max(0, (0, money_1.subP)(cashPaidP, cashRequiredP));
    return {
        totalPaidP,
        remainingP: Math.max(0, remainingP),
        changeP,
        isComplete: (0, money_1.isBalanced)(remainingP) || remainingP <= 0,
        totalPaid: (0, money_1.fromPiasters)(totalPaidP),
        remaining: (0, money_1.fromPiasters)(Math.max(0, remainingP)),
        change: (0, money_1.fromPiasters)(changeP),
    };
}
/** Validate that payment splits cover the required total. */
function validatePaymentSplits(splits, requiredTotal) {
    if (splits.length === 0) {
        return { isValid: false, error: 'لم يتم تحديد طريقة دفع' };
    }
    const hasZeroSplit = splits.some(s => s.amount <= 0);
    if (hasZeroSplit) {
        return { isValid: false, error: 'مبلغ الدفع يجب أن يكون أكبر من صفر' };
    }
    const reconciliation = reconcilePayments(splits, requiredTotal);
    if (!reconciliation.isComplete) {
        return { isValid: false, error: `متبقي ${(0, money_1.fromPiasters)(reconciliation.remainingP)} ج.م` };
    }
    return { isValid: true };
}
/** Compute the full payment state from modal inputs.
 *  This is the ONLY place these derivations should live —
 *  the modal just calls this and renders the results. */
function computePaymentState(invoiceTotal, loyaltyDiscount, splits) {
    const effectiveTotal = Math.max(0, (0, money_1.fromPiasters)((0, money_1.subP)((0, money_1.toPiasters)(invoiceTotal), (0, money_1.toPiasters)(loyaltyDiscount))));
    const reconciliation = reconcilePayments(splits, effectiveTotal);
    return {
        effectiveTotal,
        totalPaid: reconciliation.totalPaid,
        remaining: reconciliation.remaining,
        change: reconciliation.change,
        isFullyPaid: reconciliation.isComplete,
    };
}
