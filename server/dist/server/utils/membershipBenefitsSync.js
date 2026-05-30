"use strict";
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
exports.syncPackageBenefits = syncPackageBenefits;
const uuid_1 = require("uuid");
const dateUtils_1 = require("../../utils/dateUtils");
function syncPackageBenefits(conn, packageId, benefits, userName) {
    return __awaiter(this, void 0, void 0, function* () {
        // 1. Delete existing benefits for this package
        const [existing] = yield conn.query('SELECT id FROM promotions WHERE linkedMembershipId = ?', [packageId]);
        if (existing.length > 0) {
            const ids = existing.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');
            yield conn.query(`DELETE FROM promo_rules WHERE promotionId IN (${placeholders})`, ids);
            yield conn.query(`DELETE FROM promotions WHERE id IN (${placeholders})`, ids);
        }
        if (!benefits || benefits.length === 0)
            return;
        const now = (0, dateUtils_1.getEgyptianISOString)();
        // 2. Insert new benefits
        for (const b of benefits) {
            const promoId = (0, uuid_1.v4)();
            let promoType = '';
            let discountType = 'PERCENT';
            if (b.type === 'DISCOUNT_PERCENT') {
                discountType = 'PERCENT';
                if (b.targetType === 'ALL')
                    promoType = 'PERCENT_ORDER';
                if (b.targetType === 'CATEGORY')
                    promoType = 'CATEGORY_DISCOUNT';
                if (b.targetType === 'PRODUCT')
                    promoType = 'PRODUCT_DISCOUNT';
            }
            else if (b.type === 'DISCOUNT_FIXED') {
                discountType = 'FIXED';
                if (b.targetType === 'ALL')
                    promoType = 'FIXED_ORDER';
                if (b.targetType === 'CATEGORY')
                    promoType = 'CATEGORY_FIXED';
                if (b.targetType === 'PRODUCT')
                    promoType = 'PRODUCT_FIXED';
            }
            else if (b.type === 'BUY_X_GET_Y') {
                discountType = 'FREE_PRODUCT';
                promoType = 'BUY_X_GET_Y';
            }
            const promoStatus = b.isActive === false ? 'PAUSED' : 'ACTIVE';
            const maxDiscountVal = (b.type === 'DISCOUNT_PERCENT' && b.maxDiscount && b.maxDiscount > 0) ? b.maxDiscount : null;
            // Insert into promotions
            yield conn.query(`INSERT INTO promotions 
             (id, name, type, status, \`trigger\`, discountValue, discountType, maxDiscountAmount, isCombainable, priority, createdAt, createdBy, linkedMembershipId)
             VALUES (?, ?, ?, ?, 'AUTO', ?, ?, ?, 1, 1, ?, ?, ?)`, [
                promoId, b.description || 'ميزة عضوية', promoType, promoStatus, b.value, discountType, maxDiscountVal,
                now, userName, packageId
            ]);
            // Insert Rules
            // Rule 1: Must have this membership package
            yield conn.query(`INSERT INTO promo_rules (id, promotionId, ruleType, targetValue, operator) VALUES (?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), promoId, 'CUSTOMER_MEMBERSHIP', packageId, 'IN']);
            // Rule 2: Target specific product/category if applicable
            if (b.targetType === 'CATEGORY' && b.targetId) {
                yield conn.query(`INSERT INTO promo_rules (id, promotionId, ruleType, targetValue, operator) VALUES (?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), promoId, 'CATEGORY_IN_CART', b.targetId, 'IN']);
            }
            else if (b.targetType === 'PRODUCT' && b.targetId) {
                yield conn.query(`INSERT INTO promo_rules (id, promotionId, ruleType, targetValue, operator) VALUES (?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), promoId, 'PRODUCT_IN_CART', b.targetId, 'IN']);
            }
            // Rule 3: Minimum quantity condition
            if (b.minQty && b.minQty > 0) {
                yield conn.query(`INSERT INTO promo_rules (id, promotionId, ruleType, targetValue, operator) VALUES (?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), promoId, 'MIN_QTY', b.minQty.toString(), 'GTE']);
            }
            // Rule 4: Minimum amount spend condition
            if (b.minAmount && b.minAmount > 0) {
                yield conn.query(`INSERT INTO promo_rules (id, promotionId, ruleType, targetValue, operator) VALUES (?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), promoId, 'MIN_AMOUNT', b.minAmount.toString(), 'GTE']);
            }
            // Rule 5: Days of week condition
            if (b.daysOfWeek && b.daysOfWeek.length > 0) {
                yield conn.query(`INSERT INTO promo_rules (id, promotionId, ruleType, targetValue, operator) VALUES (?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), promoId, 'DAY_OF_WEEK', b.daysOfWeek.join(','), 'IN']);
            }
            // Rule 6: Time range condition
            if (b.startTime && b.endTime) {
                yield conn.query(`INSERT INTO promo_rules (id, promotionId, ruleType, targetValue, operator) VALUES (?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), promoId, 'TIME_RANGE', `${b.startTime}-${b.endTime}`, 'IN']);
            }
        }
    });
}
