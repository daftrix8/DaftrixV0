"use strict";
/**
 * Promotion Controller (محرك العروض والخصومات)
 * ═══════════════════════════════════════════════
 *
 * Backend CRUD + evaluation for the promotion engine.
 * Promotions are stored with their rules and evaluated against cart data.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.getPromotionReport = exports.recordPromoApplication = exports.validateCoupon = exports.evaluateCart = exports.archivePromotion = exports.updatePromotion = exports.createPromotion = exports.getActivePromotions = exports.getPromotions = void 0;
const uuid_1 = require("uuid");
const db_1 = require("../db");
const dateUtils_1 = require("../../utils/dateUtils");
// ── Helpers ──────────────────────────────────────────────────────────────────
/** Fetch promotions with their rules. Joins promo_rules in a second query. */
function fetchPromotionsWithRules(conn_1) {
    return __awaiter(this, arguments, void 0, function* (conn, whereClause = '', params = []) {
        const [promoRows] = yield conn.query(`SELECT * FROM promotions ${whereClause} ORDER BY priority ASC, createdAt DESC`, params);
        const promotions = promoRows;
        if (promotions.length === 0)
            return [];
        const promoIds = promotions.map(p => p.id);
        const placeholders = promoIds.map(() => '?').join(',');
        const [ruleRows] = yield conn.query(`SELECT * FROM promo_rules WHERE promotionId IN (${placeholders})`, promoIds);
        const rulesByPromoId = new Map();
        for (const rule of ruleRows) {
            const existing = rulesByPromoId.get(rule.promotionId) || [];
            rulesByPromoId.set(rule.promotionId, [...existing, rule]);
        }
        return promotions.map(p => (Object.assign(Object.assign({}, p), { isCombainable: Boolean(p.isCombainable), discountValue: Number(p.discountValue), maxUsageTotal: p.maxUsageTotal !== null ? Number(p.maxUsageTotal) : null, maxUsagePerCustomer: p.maxUsagePerCustomer !== null ? Number(p.maxUsagePerCustomer) : null, priority: Number(p.priority), usageCount: Number(p.usageCount), rules: rulesByPromoId.get(p.id) || [] })));
    });
}
/** Count how many times a specific customer has used a promotion. */
function getCustomerUsageCount(conn, promotionId, customerId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const [rows] = yield conn.query(`SELECT COUNT(*) as cnt FROM promo_applications WHERE promotionId = ? AND customerId = ?`, [promotionId, customerId]);
        return Number((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.cnt) || 0;
    });
}
// ── List All Promotions (Admin) ──────────────────────────────────────────────
const getPromotions = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const promotions = yield fetchPromotionsWithRules(conn);
        res.json({ promotions });
    }
    catch (error) {
        console.error('Error fetching promotions:', error.message);
        res.status(500).json({ error: 'خطأ في جلب العروض' });
    }
    finally {
        conn.release();
    }
});
exports.getPromotions = getPromotions;
// ── Get Active Promotions (POS Session) ──────────────────────────────────────
const getActivePromotions = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const now = (0, dateUtils_1.getEgyptianISOString)();
        const promotions = yield fetchPromotionsWithRules(conn, `WHERE status = 'ACTIVE' AND (startDate IS NULL OR startDate <= ?) AND (endDate IS NULL OR endDate >= ?)`, [now, now]);
        res.json({ promotions });
    }
    catch (error) {
        console.error('Error fetching active promotions:', error.message);
        res.status(500).json({ error: 'خطأ في جلب العروض النشطة' });
    }
    finally {
        conn.release();
    }
});
exports.getActivePromotions = getActivePromotions;
// ── Create Promotion ─────────────────────────────────────────────────────────
const createPromotion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { name, type, trigger = 'AUTO', couponCode, discountValue, discountType = 'PERCENT', maxUsageTotal, maxUsagePerCustomer, isCombainable = false, priority = 10, startDate, endDate, rules = [], } = req.body;
        const userName = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        if (!name || name.trim().length < 2) {
            return res.status(400).json({ error: 'اسم العرض مطلوب (حرفين على الأقل)' });
        }
        if (!type) {
            return res.status(400).json({ error: 'نوع العرض مطلوب' });
        }
        if (discountValue === undefined || discountValue <= 0) {
            return res.status(400).json({ error: 'قيمة الخصم يجب أن تكون أكبر من صفر' });
        }
        if (trigger === 'COUPON_CODE' && (!couponCode || couponCode.trim().length < 2)) {
            return res.status(400).json({ error: 'كود الكوبون مطلوب لعروض الأكواد' });
        }
        // Uniqueness check for coupon codes
        if (trigger === 'COUPON_CODE' && couponCode) {
            const [existing] = yield conn.query(`SELECT id FROM promotions WHERE couponCode = ? AND status != 'ARCHIVED'`, [couponCode.trim().toUpperCase()]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'كود الكوبون مستخدم بالفعل' });
            }
        }
        const id = (0, uuid_1.v4)();
        const now = (0, dateUtils_1.getEgyptianISOString)();
        yield conn.beginTransaction();
        yield conn.query(`INSERT INTO promotions 
             (id, name, type, status, \`trigger\`, couponCode, discountValue, discountType,
              maxUsageTotal, maxUsagePerCustomer, isCombainable, priority,
              startDate, endDate, createdAt, createdBy)
             VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id, name.trim(), type, trigger,
            trigger === 'COUPON_CODE' ? couponCode.trim().toUpperCase() : null,
            discountValue, discountType,
            maxUsageTotal !== null && maxUsageTotal !== void 0 ? maxUsageTotal : null,
            maxUsagePerCustomer !== null && maxUsagePerCustomer !== void 0 ? maxUsagePerCustomer : null,
            isCombainable ? 1 : 0, priority,
            startDate || null, endDate || null,
            now, userName,
        ]);
        // Insert rules
        for (const rule of rules) {
            if (!rule.ruleType || !rule.targetValue)
                continue;
            const ruleId = (0, uuid_1.v4)();
            yield conn.query(`INSERT INTO promo_rules (id, promotionId, ruleType, targetValue, operator)
                 VALUES (?, ?, ?, ?, ?)`, [ruleId, id, rule.ruleType, rule.targetValue, rule.operator || 'GTE']);
        }
        yield conn.commit();
        console.log(`🎯 [Promo] Created: "${name}" (${type}, ${trigger}) by ${userName}`);
        res.json({ success: true, id });
    }
    catch (error) {
        yield conn.rollback().catch(() => { });
        console.error('Error creating promotion:', error.message);
        res.status(500).json({ error: 'خطأ في إنشاء العرض' });
    }
    finally {
        conn.release();
    }
});
exports.createPromotion = createPromotion;
// ── Update Promotion ─────────────────────────────────────────────────────────
const updatePromotion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const updates = req.body;
        const [existing] = yield conn.query(`SELECT id FROM promotions WHERE id = ?`, [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'العرض غير موجود' });
        }
        const allowedFields = [
            'name', 'type', 'status', 'trigger', 'couponCode',
            'discountValue', 'discountType', 'maxUsageTotal', 'maxUsagePerCustomer',
            'isCombainable', 'priority', 'startDate', 'endDate',
        ];
        yield conn.beginTransaction();
        const setClauses = [];
        const params = [];
        for (const field of allowedFields) {
            if (updates[field] === undefined)
                continue;
            const colName = field === 'trigger' ? '`trigger`' : field;
            setClauses.push(`${colName} = ?`);
            if (field === 'isCombainable') {
                params.push(updates[field] ? 1 : 0);
            }
            else if (field === 'couponCode' && updates[field]) {
                params.push(updates[field].trim().toUpperCase());
            }
            else {
                params.push(updates[field]);
            }
        }
        if (setClauses.length > 0) {
            params.push(id);
            yield conn.query(`UPDATE promotions SET ${setClauses.join(', ')} WHERE id = ?`, params);
        }
        // Replace rules if provided
        if (Array.isArray(updates.rules)) {
            yield conn.query(`DELETE FROM promo_rules WHERE promotionId = ?`, [id]);
            for (const rule of updates.rules) {
                if (!rule.ruleType || !rule.targetValue)
                    continue;
                const ruleId = (0, uuid_1.v4)();
                yield conn.query(`INSERT INTO promo_rules (id, promotionId, ruleType, targetValue, operator)
                     VALUES (?, ?, ?, ?, ?)`, [ruleId, id, rule.ruleType, rule.targetValue, rule.operator || 'GTE']);
            }
        }
        yield conn.commit();
        res.json({ success: true });
    }
    catch (error) {
        yield conn.rollback().catch(() => { });
        console.error('Error updating promotion:', error.message);
        res.status(500).json({ error: 'خطأ في تحديث العرض' });
    }
    finally {
        conn.release();
    }
});
exports.updatePromotion = updatePromotion;
// ── Archive Promotion ────────────────────────────────────────────────────────
const archivePromotion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        yield conn.query(`UPDATE promotions SET status = 'ARCHIVED' WHERE id = ?`, [id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error archiving promotion:', error.message);
        res.status(500).json({ error: 'خطأ في أرشفة العرض' });
    }
    finally {
        conn.release();
    }
});
exports.archivePromotion = archivePromotion;
// ── Evaluate Cart (POS) ──────────────────────────────────────────────────────
const evaluateCart = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { items, subtotal, customerId, customerGroup } = req.body;
        if (!items || !Array.isArray(items) || subtotal === undefined) {
            return res.status(400).json({ error: 'بيانات السلة مطلوبة (items, subtotal)' });
        }
        const now = (0, dateUtils_1.getEgyptianISOString)();
        const promotions = yield fetchPromotionsWithRules(conn, `WHERE status = 'ACTIVE' AND (startDate IS NULL OR startDate <= ?) AND (endDate IS NULL OR endDate >= ?)`, [now, now]);
        let customerMemberships = [];
        // Enrich with customer usage counts if customer is known
        if (customerId) {
            for (const promo of promotions) {
                if (promo.maxUsagePerCustomer !== null) {
                    promo.customerUsageCount = yield getCustomerUsageCount(conn, promo.id, customerId);
                }
            }
            // Fetch active memberships for the customer
            const [membershipRows] = yield conn.query(`SELECT packageId, status FROM memberships 
                 WHERE customerId = ? AND status IN ('ACTIVE', 'FROZEN', 'PENDING_PAYMENT') 
                   AND (endDate IS NULL OR endDate >= ?)`, [customerId, now]);
            customerMemberships = membershipRows
                .filter(r => r.status && r.status.toUpperCase() === 'ACTIVE')
                .map(r => r.packageId);
            if (membershipRows.length === 0) {
                customerMemberships = ['regular-package'];
            }
        }
        // Use the shared engine for evaluation
        const { evaluatePromotions } = yield Promise.resolve().then(() => __importStar(require('../../utils/posEngine/promotions')));
        const cart = { items, subtotal, customerId, customerGroup, customerMemberships };
        const applied = evaluatePromotions(cart, promotions, new Date());
        res.json({ promotions: applied });
    }
    catch (error) {
        console.error('Error evaluating promotions:', error.message);
        res.status(500).json({ error: 'خطأ في تقييم العروض' });
    }
    finally {
        conn.release();
    }
});
exports.evaluateCart = evaluateCart;
// ── Validate Coupon Code ─────────────────────────────────────────────────────
const validateCoupon = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { couponCode, items, subtotal, customerId, customerGroup } = req.body;
        if (!couponCode || !items || subtotal === undefined) {
            return res.status(400).json({ error: 'كود الكوبون وبيانات السلة مطلوبة' });
        }
        const now = (0, dateUtils_1.getEgyptianISOString)();
        const promotions = yield fetchPromotionsWithRules(conn, `WHERE status = 'ACTIVE' AND (startDate IS NULL OR startDate <= ?) AND (endDate IS NULL OR endDate >= ?)`, [now, now]);
        let customerMemberships = [];
        // Enrich with customer usage
        if (customerId) {
            for (const promo of promotions) {
                if (promo.maxUsagePerCustomer !== null) {
                    promo.customerUsageCount = yield getCustomerUsageCount(conn, promo.id, customerId);
                }
            }
            // Fetch active memberships for the customer
            const [membershipRows] = yield conn.query(`SELECT packageId, status FROM memberships 
                 WHERE customerId = ? AND status IN ('ACTIVE', 'FROZEN', 'PENDING_PAYMENT') 
                   AND (endDate IS NULL OR endDate >= ?)`, [customerId, now]);
            customerMemberships = membershipRows
                .filter(r => r.status && r.status.toUpperCase() === 'ACTIVE')
                .map(r => r.packageId);
            if (membershipRows.length === 0) {
                customerMemberships = ['regular-package'];
            }
        }
        const { evaluateCoupon } = yield Promise.resolve().then(() => __importStar(require('../../utils/posEngine/promotions')));
        const cart = { items, subtotal, customerId, customerGroup, customerMemberships };
        const result = evaluateCoupon(cart, couponCode, promotions, new Date());
        if (!result) {
            return res.json({ valid: false, error: 'كود الكوبون غير صالح أو منتهي الصلاحية' });
        }
        res.json({ valid: true, promotion: result });
    }
    catch (error) {
        console.error('Error validating coupon:', error.message);
        res.status(500).json({ error: 'خطأ في التحقق من الكوبون' });
    }
    finally {
        conn.release();
    }
});
exports.validateCoupon = validateCoupon;
// ── Record Promotion Application (transactional helper) ──────────────────────
/**
 * Called from processPOSSale to atomically record promo usage.
 * Runs WITHIN the sale transaction — does not manage its own transaction.
 */
const recordPromoApplication = (conn, promotionId, invoiceId, customerId, discountApplied, userName) => __awaiter(void 0, void 0, void 0, function* () {
    const id = (0, uuid_1.v4)();
    const now = (0, dateUtils_1.getEgyptianISOString)();
    yield conn.query(`INSERT INTO promo_applications (id, promotionId, invoiceId, customerId, discountApplied, appliedAt, appliedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, promotionId, invoiceId, customerId || null, discountApplied, now, userName]);
    // Increment usage counter
    yield conn.query(`UPDATE promotions SET usageCount = usageCount + 1 WHERE id = ?`, [promotionId]);
});
exports.recordPromoApplication = recordPromoApplication;
// ── Promotion Report ─────────────────────────────────────────────────────────
const getPromotionReport = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const [rows] = yield conn.query(`
            SELECT 
                p.id, p.name, p.type, p.status, p.\`trigger\`, p.couponCode,
                p.discountValue, p.usageCount, p.startDate, p.endDate,
                COALESCE(SUM(pa.discountApplied), 0) AS totalDiscountGiven,
                COUNT(pa.id) AS applicationCount
            FROM promotions p
            LEFT JOIN promo_applications pa ON pa.promotionId = p.id
            GROUP BY p.id
            ORDER BY applicationCount DESC
        `);
        res.json({ report: rows });
    }
    catch (error) {
        console.error('Error fetching promotion report:', error.message);
        res.status(500).json({ error: 'خطأ في تقرير العروض' });
    }
    finally {
        conn.release();
    }
});
exports.getPromotionReport = getPromotionReport;
