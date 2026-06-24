"use strict";
/**
 * POS Cart Engine — Pure Business Logic
 * ══════════════════════════════════════
 *
 * All cart calculations extracted from UI components.
 * Uses integer piaster arithmetic for financial correctness.
 * Every function is pure: same inputs → same outputs, no side effects.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCartLineId = generateCartLineId;
exports.computeLineTotal = computeLineTotal;
exports.addItemToCart = addItemToCart;
exports.updateItemQuantity = updateItemQuantity;
exports.setItemQuantity = setItemQuantity;
exports.setItemPrice = setItemPrice;
exports.setItemDiscount = setItemDiscount;
exports.setItemUnit = setItemUnit;
exports.setItemNote = setItemNote;
exports.setItemSerials = setItemSerials;
exports.removeItem = removeItem;
exports.setItemTradeInAction = setItemTradeInAction;
exports.setItemWarrantyAndInstallation = setItemWarrantyAndInstallation;
exports.addCustomTradeInToCart = addCustomTradeInToCart;
exports.addTradeInProductToCart = addTradeInProductToCart;
exports.computeCartTotals = computeCartTotals;
const money_1 = require("./money");
// ── Stable ID Generator ─────────────────────────────────────────────────────
/** Generate a globally unique cart line ID. Uses crypto.randomUUID for safety
 *  across HMR resets, tab duplication, and multi-terminal POS sessions. */
function generateCartLineId() {
    var _a;
    return `cl_${((_a = crypto.randomUUID) === null || _a === void 0 ? void 0 : _a.call(crypto)) || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}
// ── Line Total Calculation ───────────────────────────────────────────────────
/** Compute line total in display currency (pounds). Uses piasters internally. */
function computeLineTotal(quantity, price, discount, discountType) {
    const isNegative = quantity < 0;
    const absQuantity = Math.abs(quantity);
    const grossPiasters = (0, money_1.mulP)((0, money_1.toPiasters)(price), absQuantity);
    if (!discount || discount <= 0) {
        return isNegative ? (0, money_1.fromPiasters)(-grossPiasters) : (0, money_1.fromPiasters)(grossPiasters);
    }
    const discountPiasters = discountType === 'PERCENT'
        ? (0, money_1.percentP)(grossPiasters, discount)
        : (0, money_1.toPiasters)(discount);
    const netPiasters = Math.max(0, (0, money_1.subP)(grossPiasters, discountPiasters));
    return isNegative ? (0, money_1.fromPiasters)(-netPiasters) : (0, money_1.fromPiasters)(netPiasters);
}
/** Add a product to the cart. Returns a new cart array (immutable). */
function addItemToCart(cart, params) {
    const { productId, variantId, productName, price, stock, isService, warrantyMonths, availableUnits, trackSerials, categoryId } = params;
    const existing = cart.find(item => item.productId === productId && item.variantId === variantId);
    const currentQty = (existing === null || existing === void 0 ? void 0 : existing.quantity) || 0;
    // Stock guard — service products bypass stock checks (they don't track inventory)
    if (!isService && (stock <= 0 || currentQty >= stock))
        return cart;
    if (existing) {
        return cart.map(item => (item.productId === productId && item.variantId === variantId)
            ? Object.assign(Object.assign({}, item), { quantity: item.quantity + 1, total: computeLineTotal(item.quantity + 1, item.price, item.discount, item.discountType) }) : item);
    }
    return [...cart, {
            cartLineId: generateCartLineId(),
            productId,
            variantId,
            productName,
            price,
            quantity: 1,
            total: price,
            unitName: 'قطعة', // Will be overridden if user selects a different unit
            warrantyMonths: warrantyMonths || undefined,
            availableUnits,
            trackSerials,
            serials: trackSerials ? [] : undefined,
            categoryId,
            hasWarranty: false,
            inBranchInstallation: false
        }];
}
/** Update quantity by delta. Removes item if qty drops to 0. */
function updateItemQuantity(cart, cartLineId, delta) {
    return cart.reduce((acc, item) => {
        if (item.cartLineId !== cartLineId) {
            acc.push(item);
            return acc;
        }
        const newQty = item.quantity + delta;
        if (newQty === 0)
            return acc; // Remove item if quantity is exactly 0
        // Prevent non-trade-in items from going negative — negative qty is
        // reserved for trade-in lines which are created explicitly.
        const isTradeIn = !!item.tradeInAction;
        if (newQty < 0 && !isTradeIn)
            return acc;
        acc.push(Object.assign(Object.assign({}, item), { quantity: newQty, total: computeLineTotal(newQty, item.price, item.discount, item.discountType) }));
        return acc;
    }, []);
}
/** Set exact quantity on a cart line. */
function setItemQuantity(cart, cartLineId, quantity) {
    return cart.map(item => item.cartLineId !== cartLineId
        ? item
        : Object.assign(Object.assign({}, item), { quantity, total: computeLineTotal(quantity, item.price, item.discount, item.discountType) }));
}
/** Set exact price on a cart line. */
function setItemPrice(cart, cartLineId, price) {
    return cart.map(item => item.cartLineId !== cartLineId
        ? item
        : Object.assign(Object.assign({}, item), { price, isPriceOverridden: true, total: computeLineTotal(item.quantity, price, item.discount, item.discountType) }));
}
/** Set discount on a cart line. */
function setItemDiscount(cart, cartLineId, discount, discountType) {
    return cart.map(item => item.cartLineId !== cartLineId
        ? item
        : Object.assign(Object.assign({}, item), { discount: discount || undefined, discountType, total: computeLineTotal(item.quantity, item.price, discount || undefined, discountType) }));
}
/** Set unit of measure on a cart line. */
function setItemUnit(cart, cartLineId, unitId, unitName, conversionFactor, price) {
    return cart.map(item => item.cartLineId !== cartLineId
        ? item
        : Object.assign(Object.assign({}, item), { unitId,
            unitName,
            conversionFactor,
            price, total: computeLineTotal(item.quantity, price, item.discount, item.discountType) }));
}
/** Set note on a cart line. */
function setItemNote(cart, cartLineId, note) {
    return cart.map(item => item.cartLineId !== cartLineId
        ? item
        : Object.assign(Object.assign({}, item), { notes: note || undefined }));
}
/** Set serial numbers for a cart item */
function setItemSerials(cart, cartLineId, serials) {
    return cart.map(item => item.cartLineId === cartLineId ? Object.assign(Object.assign({}, item), { serials }) : item);
}
/** Remove a specific item by cartLineId. */
function removeItem(cart, cartLineId) {
    return cart.filter(item => item.cartLineId !== cartLineId);
}
/** Set Trade-In action for negative quantity items. */
function setItemTradeInAction(cart, cartLineId, action) {
    return cart.map(item => item.cartLineId !== cartLineId
        ? item
        : Object.assign(Object.assign({}, item), { tradeInAction: action }));
}
/** Set warranty and in-branch installation toggles on a cart line. */
function setItemWarrantyAndInstallation(cart, cartLineId, hasWarranty, inBranchInstallation, warrantyMonths) {
    return cart.map(item => item.cartLineId !== cartLineId
        ? item
        : Object.assign(Object.assign({}, item), { hasWarranty,
            inBranchInstallation, warrantyMonths: warrantyMonths !== undefined ? warrantyMonths : item.warrantyMonths }));
}
/** Add a Customer's Own Item as a Trade-In (bypasses stock, posts to Trade-In Expense). */
function addCustomTradeInToCart(cart, description, value, condition, notes) {
    const combinedNotes = [
        condition ? `الحالة: ${condition}` : '',
        notes ? `ملاحظات: ${notes}` : ''
    ].filter(Boolean).join(' | ');
    const newItem = {
        cartLineId: generateCartLineId(),
        productId: 'CUSTOM_TRADE_IN', // Handled specially by backend
        productName: `مبادلة: ${description}`,
        quantity: -1,
        price: value,
        cost: 0,
        discount: 0,
        discountType: 'FIXED',
        total: -value, // Negative total since quantity is -1 and price is positive
        tradeInAction: 'CUSTOM_TRADE_IN',
        notes: combinedNotes || undefined,
        baseQuantity: -1,
        conversionFactor: 1
    };
    return [...cart, newItem];
}
/** Add a real Product to the cart as a Trade-In (negative quantity, adds back to stock). */
function addTradeInProductToCart(cart, product, // Using any for Product to avoid deep type imports here, will cast appropriately
value, condition, notes, variantId) {
    var _a;
    const combinedNotes = [
        condition ? `الحالة: ${condition}` : '',
        notes ? `ملاحظات: ${notes}` : ''
    ].filter(Boolean).join(' | ');
    let variantName = '';
    if (variantId && product.variants) {
        const variant = product.variants.find((v) => v.id === variantId);
        if (variant) {
            const attributesText = (_a = variant.attributes) === null || _a === void 0 ? void 0 : _a.map((attr) => attr.value).join(' - ');
            if (attributesText) {
                variantName = ` - ${attributesText}`;
            }
            else if (variant.sku) {
                variantName = ` - ${variant.sku}`;
            }
        }
    }
    const newItem = {
        cartLineId: generateCartLineId(),
        productId: product.id,
        variantId,
        productName: `مبادلة: ${product.name}${variantName}`,
        quantity: -1,
        price: value,
        cost: product.cost || 0,
        discount: 0,
        discountType: 'FIXED',
        total: -value,
        tradeInAction: 'ADD_TO_STOCK', // Adds it back to physical inventory
        notes: combinedNotes || undefined,
        baseQuantity: -1,
        conversionFactor: 1
    };
    return [...cart, newItem];
}
/** Compute all cart totals. Uses piasters internally for precision. */
function computeCartTotals(cart, globalDiscount, globalDiscountType, taxRate = 0, shippingCharges = [], shippingTaxType = 'NONE') {
    // Separate new items and trade-ins
    const newItems = cart.filter(item => item.total >= 0 && item.tradeInAction !== 'CUSTOM_TRADE_IN');
    const tradeInItems = cart.filter(item => item.total < 0 || item.tradeInAction === 'CUSTOM_TRADE_IN');
    // Calculate subtotal for new items only
    const subtotalP = (0, money_1.sumP)(newItems.map(item => (0, money_1.toPiasters)(item.total)));
    const globalDiscountP = globalDiscountType === 'PERCENT'
        ? (0, money_1.percentP)(subtotalP, globalDiscount)
        : (0, money_1.toPiasters)(globalDiscount);
    const afterDiscountP = Math.max(0, (0, money_1.subP)(subtotalP, globalDiscountP));
    const shippingP = (0, money_1.sumP)(shippingCharges.map(sc => (0, money_1.toPiasters)(sc.amount)));
    // Calculate base item tax
    const itemsTaxP = (0, money_1.percentP)(afterDiscountP, taxRate);
    // Calculate shipping tax based on type
    let shippingTaxP = 0;
    let finalShippingP = shippingP;
    if (shippingTaxType === 'EXCLUSIVE' && taxRate > 0) {
        shippingTaxP = (0, money_1.percentP)(shippingP, taxRate);
        // Exclusive means we add tax on top of the shipping fee
        finalShippingP = shippingP;
    }
    else if (shippingTaxType === 'INCLUSIVE' && taxRate > 0) {
        // Inclusive means the shipping fee already contains the tax
        // shippingP = base + (base * taxRate/100) -> base = shippingP / (1 + taxRate/100)
        const taxRateDecimal = taxRate / 100;
        const shippingBaseP = Math.round(shippingP / (1 + taxRateDecimal));
        shippingTaxP = shippingP - shippingBaseP;
        // The display total includes the tax, so final amount added to total doesn't need to add tax again
        finalShippingP = shippingP - shippingTaxP; // Only add the base part because the tax part is added via taxAmount
    }
    const afterShippingP = afterDiscountP + finalShippingP;
    const taxP = itemsTaxP + shippingTaxP;
    const newItemsTotalP = afterShippingP + taxP;
    // Calculate trade-in credit
    const tradeInCreditP = Math.abs((0, money_1.sumP)(tradeInItems.map(item => (0, money_1.toPiasters)(item.total))));
    const amountDueP = newItemsTotalP - tradeInCreditP;
    return {
        subtotal: (0, money_1.fromPiasters)(subtotalP),
        discountAmount: (0, money_1.fromPiasters)(globalDiscountP),
        shippingTotal: (0, money_1.fromPiasters)(shippingP),
        taxAmount: (0, money_1.fromPiasters)(taxP),
        total: (0, money_1.fromPiasters)(newItemsTotalP),
        newItemsTotal: (0, money_1.fromPiasters)(newItemsTotalP),
        tradeInCredit: (0, money_1.fromPiasters)(tradeInCreditP),
        amountDue: (0, money_1.fromPiasters)(amountDueP),
    };
}
