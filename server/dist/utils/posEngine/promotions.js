"use strict";
/**
 * POS Promotion Engine — Pure Business Logic
 * ════════════════════════════════════════════
 *
 * Evaluates cart contents against promotion rules and returns applicable discounts.
 * All functions are pure: same inputs → same outputs, no side effects.
 *
 * This engine runs both client-side (instant UI feedback) and server-side
 * (defense-in-depth validation at checkout).
 */
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluatePromotions = evaluatePromotions;
exports.evaluateCoupon = evaluateCoupon;
exports.totalPromotionDiscount = totalPromotionDiscount;
const money_1 = require("./money");
// ── Date / Time Helpers ──────────────────────────────────────────────────────
/** Check if a promotion is within its date bounds. */
function isWithinDateBounds(promo, now) {
    if (promo.startDate && new Date(promo.startDate) > now)
        return false;
    if (promo.endDate && new Date(promo.endDate) < now)
        return false;
    return true;
}
/** Check if usage limits have been reached. */
function isWithinUsageLimits(promo) {
    var _a, _b;
    if (promo.maxUsageTotal !== null && ((_a = promo.usageCount) !== null && _a !== void 0 ? _a : 0) >= promo.maxUsageTotal)
        return false;
    if (promo.maxUsagePerCustomer !== null && ((_b = promo.customerUsageCount) !== null && _b !== void 0 ? _b : 0) >= promo.maxUsagePerCustomer)
        return false;
    return true;
}
// ── Rule Evaluation ──────────────────────────────────────────────────────────
/** Evaluate a single rule against the cart. */
function evaluateRule(rule, cart, now) {
    const targetNum = parseFloat(rule.targetValue) || 0;
    const targetStr = rule.targetValue;
    switch (rule.ruleType) {
        case 'MIN_AMOUNT':
            return cart.subtotal >= targetNum;
        case 'MIN_QTY': {
            const totalQty = cart.items.reduce((sum, item) => sum + item.quantity, 0);
            return totalQty >= targetNum;
        }
        case 'PRODUCT_IN_CART': {
            // targetValue is a comma-separated list of product IDs
            const requiredIds = targetStr.split(',').map(s => s.trim());
            return requiredIds.every(id => cart.items.some(item => item.productId === id));
        }
        case 'CATEGORY_IN_CART': {
            const requiredCats = targetStr.split(',').map(s => s.trim());
            return requiredCats.every(catId => cart.items.some(item => item.categoryId === catId));
        }
        case 'CUSTOMER_GROUP':
            if (!cart.customerGroup)
                return false;
            return targetStr.split(',').map(s => s.trim()).includes(cart.customerGroup);
        case 'CUSTOMER_MEMBERSHIP':
            if (!cart.customerMemberships || cart.customerMemberships.length === 0)
                return false;
            return targetStr.split(',').map(s => s.trim()).some(id => cart.customerMemberships.includes(id));
        case 'DAY_OF_WEEK': {
            // targetValue: comma-separated day numbers (0=Sunday...6=Saturday)
            const allowedDays = targetStr.split(',').map(s => parseInt(s.trim(), 10));
            return allowedDays.includes(now.getDay());
        }
        case 'TIME_RANGE': {
            // targetValue: "HH:MM-HH:MM" (e.g., "09:00-17:00" or "22:00-06:00" overnight)
            const [startTime, endTime] = targetStr.split('-');
            if (!startTime || !endTime)
                return false;
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const [startH, startM] = startTime.split(':').map(Number);
            const [endH, endM] = endTime.split(':').map(Number);
            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;
            // Handle overnight ranges (e.g. 22:00-06:00)
            if (startMinutes > endMinutes) {
                return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
            }
            return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        }
        default:
            return false;
    }
}
/** Evaluate ALL rules for a promotion. ALL rules must pass (AND logic). */
function passesAllRules(promo, cart, now) {
    if (promo.rules.length === 0)
        return true;
    return promo.rules.every(rule => evaluateRule(rule, cart, now));
}
// ── Discount Calculation ─────────────────────────────────────────────────────
/** Cap a computed discount by an optional maximum amount. */
function applyDiscountCap(discount, maxAmount) {
    if (maxAmount != null && maxAmount > 0) {
        return Math.min(discount, maxAmount);
    }
    return discount;
}
/** Compute the discount amount (in display currency) for a promotion. */
function computePromotionDiscount(promo, cart) {
    switch (promo.type) {
        case 'PERCENT_ORDER': {
            const raw = (0, money_1.fromPiasters)((0, money_1.percentP)((0, money_1.toPiasters)(cart.subtotal), promo.discountValue));
            return applyDiscountCap(raw, promo.maxDiscountAmount);
        }
        case 'FIXED_ORDER':
            return Math.min(promo.discountValue, cart.subtotal);
        case 'MIN_SPEND': {
            // discountValue is a percentage applied when min-spend threshold met
            const raw = (0, money_1.fromPiasters)((0, money_1.percentP)((0, money_1.toPiasters)(cart.subtotal), promo.discountValue));
            return applyDiscountCap(raw, promo.maxDiscountAmount);
        }
        case 'CATEGORY_DISCOUNT': {
            // Apply % to lines matching the target category
            const catRule = promo.rules.find(r => r.ruleType === 'CATEGORY_IN_CART');
            if (!catRule)
                return 0;
            const targetCats = catRule.targetValue.split(',').map(s => s.trim());
            const matchingLineTotals = cart.items
                .filter(item => targetCats.includes(item.categoryId))
                .map(item => (0, money_1.toPiasters)(item.lineTotal));
            const matchingTotal = (0, money_1.sumP)(matchingLineTotals);
            return applyDiscountCap((0, money_1.fromPiasters)((0, money_1.percentP)(matchingTotal, promo.discountValue)), promo.maxDiscountAmount);
        }
        case 'PRODUCT_DISCOUNT': {
            // Apply % to lines matching specific products
            const prodRule = promo.rules.find(r => r.ruleType === 'PRODUCT_IN_CART');
            if (!prodRule)
                return 0;
            const targetProdIds = prodRule.targetValue.split(',').map(s => s.trim());
            const matchingLineTotals = cart.items
                .filter(item => targetProdIds.includes(item.productId))
                .map(item => (0, money_1.toPiasters)(item.lineTotal));
            const matchingTotal = (0, money_1.sumP)(matchingLineTotals);
            return applyDiscountCap((0, money_1.fromPiasters)((0, money_1.percentP)(matchingTotal, promo.discountValue)), promo.maxDiscountAmount);
        }
        case 'BUY_X_GET_Y': {
            // discountValue = the number of free items
            // Expand items by quantity so each physical unit is considered,
            // then give the cheapest N items for free.
            const expandedPrices = [];
            for (const item of cart.items) {
                for (let q = 0; q < item.quantity; q++) {
                    expandedPrices.push(item.unitPrice);
                }
            }
            expandedPrices.sort((a, b) => a - b);
            const freeCount = Math.min(Math.floor(promo.discountValue), expandedPrices.length);
            let freeValue = 0;
            for (let i = 0; i < freeCount; i++) {
                freeValue += expandedPrices[i];
            }
            return Math.min(freeValue, cart.subtotal);
        }
        case 'CATEGORY_FIXED': {
            // Apply fixed discount per quantity of items matching the target category
            const catRule = promo.rules.find(r => r.ruleType === 'CATEGORY_IN_CART');
            if (!catRule)
                return 0;
            const targetCats = catRule.targetValue.split(',').map(s => s.trim());
            const matchingItems = cart.items.filter(item => targetCats.includes(item.categoryId));
            const totalMatchingQty = matchingItems.reduce((sum, item) => sum + item.quantity, 0);
            const rawP = (0, money_1.mulP)((0, money_1.toPiasters)(promo.discountValue), totalMatchingQty);
            return Math.min((0, money_1.fromPiasters)(rawP), cart.subtotal);
        }
        case 'PRODUCT_FIXED': {
            // Apply fixed discount per quantity of specific products
            const prodRule = promo.rules.find(r => r.ruleType === 'PRODUCT_IN_CART');
            if (!prodRule)
                return 0;
            const targetProdIds = prodRule.targetValue.split(',').map(s => s.trim());
            const matchingItems = cart.items.filter(item => targetProdIds.includes(item.productId));
            const totalMatchingQty = matchingItems.reduce((sum, item) => sum + item.quantity, 0);
            const rawP = (0, money_1.mulP)((0, money_1.toPiasters)(promo.discountValue), totalMatchingQty);
            return Math.min((0, money_1.fromPiasters)(rawP), cart.subtotal);
        }
        default:
            return 0;
    }
}
/** Get target product IDs for line-level promotions. */
function getTargetProductIds(promo) {
    if (promo.type === 'PRODUCT_DISCOUNT' || promo.type === 'PRODUCT_FIXED') {
        const rule = promo.rules.find(r => r.ruleType === 'PRODUCT_IN_CART');
        if (rule)
            return rule.targetValue.split(',').map(s => s.trim());
    }
    return undefined;
}
/** Determine if a promotion applies at order or line level. */
function getApplicationLevel(promo) {
    return promo.type === 'PRODUCT_DISCOUNT' ||
        promo.type === 'CATEGORY_DISCOUNT' ||
        promo.type === 'PRODUCT_FIXED' ||
        promo.type === 'CATEGORY_FIXED'
        ? 'LINE'
        : 'ORDER';
}
/** Build a human-readable Arabic description for the applied promotion. */
function buildDescription(promo) {
    switch (promo.type) {
        case 'PERCENT_ORDER':
            return `خصم ${promo.discountValue}% على الفاتورة`;
        case 'FIXED_ORDER':
            return `خصم ${promo.discountValue} ج.م على الفاتورة`;
        case 'BUY_X_GET_Y':
            return `اشترِ واحصل على ${promo.discountValue} مجاناً`;
        case 'MIN_SPEND':
            return `خصم ${promo.discountValue}% (حد أدنى للإنفاق)`;
        case 'CATEGORY_DISCOUNT':
            return `خصم ${promo.discountValue}% على الفئة`;
        case 'PRODUCT_DISCOUNT':
            return `خصم ${promo.discountValue}% على المنتج`;
        case 'CATEGORY_FIXED':
            return `خصم ${promo.discountValue} ج.م على الفئة`;
        case 'PRODUCT_FIXED':
            return `خصم ${promo.discountValue} ج.م على المنتج`;
        default:
            return promo.name;
    }
}
// ── Main Evaluation ──────────────────────────────────────────────────────────
/**
 * Evaluate all promotions against the current cart.
 * Returns an array of applicable promotions with their computed discounts.
 *
 * Handles stacking:
 *   - If exclusive promos exist, only the best one (highest discount) wins.
 *   - Combinable promos are all applied.
 *   - Exclusive promos compete with each other AND with the sum of combinable promos.
 */
function evaluatePromotions(cart, promotions, now = new Date()) {
    if (cart.items.length === 0 || cart.subtotal <= 0)
        return [];
    // 1. Filter eligible promotions
    const eligible = promotions
        .filter(p => p.status === 'ACTIVE')
        .filter(p => p.trigger === 'AUTO') // Coupons are evaluated separately
        .filter(p => isWithinDateBounds(p, now))
        .filter(p => isWithinUsageLimits(p))
        .filter(p => passesAllRules(p, cart, now))
        .sort((a, b) => a.priority - b.priority);
    // 2. Compute discount for each eligible promotion
    const candidates = eligible
        .map(promo => {
        const discountAmount = computePromotionDiscount(promo, cart);
        if (discountAmount <= 0)
            return null;
        return {
            promotionId: promo.id,
            promotionName: promo.name,
            discountAmount,
            discountType: promo.discountType,
            appliedTo: getApplicationLevel(promo),
            targetProductIds: getTargetProductIds(promo),
            description: buildDescription(promo),
            type: promo.type,
            isCoupon: false,
            isCombinable: promo.isCombinable,
        };
    })
        .filter((c) => c !== null);
    // 3. Stacking logic
    return resolveStacking(candidates);
}
/**
 * Evaluate a single coupon code against the cart.
 * Returns the applicable promotion or null if invalid.
 */
function evaluateCoupon(cart, couponCode, promotions, now = new Date()) {
    const normalizedCode = couponCode.trim().toUpperCase();
    const couponPromo = promotions.find(p => {
        var _a;
        return p.status === 'ACTIVE'
            && p.trigger === 'COUPON_CODE'
            && ((_a = p.couponCode) === null || _a === void 0 ? void 0 : _a.toUpperCase()) === normalizedCode
            && isWithinDateBounds(p, now)
            && isWithinUsageLimits(p)
            && passesAllRules(p, cart, now);
    });
    if (!couponPromo)
        return null;
    const discountAmount = computePromotionDiscount(couponPromo, cart);
    if (discountAmount <= 0)
        return null;
    return {
        promotionId: couponPromo.id,
        promotionName: couponPromo.name,
        discountAmount,
        discountType: couponPromo.discountType,
        appliedTo: getApplicationLevel(couponPromo),
        targetProductIds: getTargetProductIds(couponPromo),
        description: buildDescription(couponPromo),
        type: couponPromo.type,
        isCoupon: true,
        couponCode: normalizedCode,
    };
}
/**
 * Resolve stacking: exclusive promos compete, combinable promos stack.
 * If the best exclusive promo beats the sum of all combinable promos, use it.
 */
function resolveStacking(candidates) {
    const combinable = candidates.filter(c => c.isCombinable);
    const exclusive = candidates.filter(c => !c.isCombinable);
    const combinableTotal = combinable.reduce((sum, c) => sum + c.discountAmount, 0);
    const bestExclusive = exclusive.sort((a, b) => b.discountAmount - a.discountAmount)[0];
    // If no exclusive promos, return all combinable
    if (!bestExclusive) {
        return combinable.map(stripInternal);
    }
    // If no combinable promos, return the best exclusive
    if (combinable.length === 0) {
        return [stripInternal(bestExclusive)];
    }
    // Compare: best exclusive vs. sum of all combinable
    if (bestExclusive.discountAmount >= combinableTotal) {
        return [stripInternal(bestExclusive)];
    }
    return combinable.map(stripInternal);
}
/** Remove internal-only fields before returning to caller. */
function stripInternal(promo) {
    const { isCombinable: _ } = promo, rest = __rest(promo, ["isCombinable"]);
    return rest;
}
/**
 * Compute the total discount from all applied promotions.
 * Caps at the cart subtotal to prevent negative totals.
 */
function totalPromotionDiscount(appliedPromotions, subtotal) {
    const rawTotal = appliedPromotions.reduce((sum, p) => sum + p.discountAmount, 0);
    return Math.min(rawTotal, subtotal);
}
