"use strict";
/**
 * Loyalty Controller (نظام الولاء)
 * ===================================
 * Full backend for loyalty points: rules, settings, balances, history, adjustments.
 *
 * Balance is ALWAYS derived from SUM of loyalty_transactions — never cached.
 * This follows the financial-integrity rules: source of truth = transaction records.
 */
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
exports.dismissFraudAlert = exports.getFraudAlerts = exports.getReferralStatsAPI = exports.processReferralReward = exports.getCustomerTierAPI = exports.deriveCustomerTier = exports.recordLoyaltyClawback = exports.recordLoyaltyRedeem = exports.recordLoyaltyEarn = exports.getLoyaltyCustomers = exports.getLoyaltyDashboard = exports.deleteLoyaltyRule = exports.updateLoyaltyRule = exports.createLoyaltyRule = exports.getLoyaltyRules = exports.updateLoyaltySettingsAPI = exports.getLoyaltySettingsAPI = exports.adjustLoyaltyPoints = exports.getLoyaltyHistory = exports.previewLoyalty = exports.getLoyaltyBalance = exports.getApplicableRules = exports.getLoyaltySettings = void 0;
exports.calculatePointsEarned = calculatePointsEarned;
const uuid_1 = require("uuid");
const db_1 = require("../db");
const dateUtils_1 = require("../../utils/dateUtils");
const fiscalYearUtils_1 = require("../utils/fiscalYearUtils");
// ─── Helpers ────────────────────────────────────────────────────────────────
/** Derives loyalty balance from transaction records. Never from a cached field. */
const deriveBalance = (conn, customerId) => __awaiter(void 0, void 0, void 0, function* () {
    const [rows] = yield conn.query(`SELECT
            COALESCE(SUM(CASE WHEN type = 'EARN' THEN points ELSE 0 END), 0) AS totalEarned,
            COALESCE(SUM(CASE WHEN type = 'REDEEM' THEN ABS(points) ELSE 0 END), 0) AS totalRedeemed,
            COALESCE(SUM(CASE WHEN type = 'REFUND_CLAWBACK' THEN ABS(points) ELSE 0 END), 0) AS totalClawback,
            COALESCE(SUM(CASE WHEN type = 'ADJUST' THEN points ELSE 0 END), 0) AS totalAdjusted,
            COALESCE(SUM(CASE WHEN type = 'EXPIRE' THEN ABS(points) ELSE 0 END), 0) AS totalExpired
         FROM loyalty_transactions
         WHERE customerId = ?`, [customerId]);
    const row = rows[0] || {};
    const totalEarned = Number(row.totalEarned) || 0;
    const totalRedeemed = Number(row.totalRedeemed) || 0;
    const totalClawback = Number(row.totalClawback) || 0;
    const totalAdjusted = Number(row.totalAdjusted) || 0;
    const totalExpired = Number(row.totalExpired) || 0;
    return {
        totalEarned,
        totalRedeemed,
        totalClawback,
        totalAdjusted,
        currentBalance: totalEarned - totalRedeemed - totalClawback + totalAdjusted - totalExpired,
    };
});
const getLoyaltySettings = (conn) => __awaiter(void 0, void 0, void 0, function* () {
    const [rows] = yield conn.query(`SELECT * FROM loyalty_settings LIMIT 1`);
    const defaultSettings = {
        balanceType: 'loyalty_points',
        minimumRedemptionPoints: 100,
        conversionRate: 1,
        allowDecimals: false,
        tier_silver_min_spend: 2000.00,
        tier_gold_min_spend: 5000.00,
        tier_platinum_min_spend: 10000.00,
        tier_silver_multiplier: 1.20,
        tier_gold_multiplier: 1.50,
        tier_platinum_multiplier: 2.00
    };
    if (rows && rows.length > 0) {
        return Object.assign(Object.assign({}, defaultSettings), rows[0]);
    }
    return defaultSettings;
});
exports.getLoyaltySettings = getLoyaltySettings;
const getApplicableRules = (conn, orderTotal, customerClassification) => __awaiter(void 0, void 0, void 0, function* () {
    let query = `
        SELECT * FROM loyalty_rules 
        WHERE status = 'active' 
          AND (minimumSpend IS NULL OR minimumSpend <= ?)
    `;
    const params = [orderTotal];
    if (customerClassification) {
        query += ` AND (customerClassification IS NULL OR customerClassification = ?)`;
        params.push(customerClassification);
    }
    else {
        query += ` AND customerClassification IS NULL`;
    }
    query += ` ORDER BY priority DESC`;
    const [rows] = yield conn.query(query, params);
    // Filter by day of week
    const currentDay = new Date().getDay(); // 0 = Sunday, 6 = Saturday
    const validRules = rows.filter(rule => {
        if (!rule.days_of_week)
            return true;
        try {
            const days = typeof rule.days_of_week === 'string' ? JSON.parse(rule.days_of_week) : rule.days_of_week;
            if (Array.isArray(days)) {
                return days.includes(currentDay);
            }
        }
        catch (e) { }
        return true;
    });
    return validRules;
});
exports.getApplicableRules = getApplicableRules;
const consumePointsFIFO = (conn, customerId, consumeTransactionId, pointsToConsume) => __awaiter(void 0, void 0, void 0, function* () {
    const [earnTx] = yield conn.query(`
        SELECT t.id, t.points, 
               COALESCE(SUM(c.pointsConsumed), 0) as consumed
        FROM loyalty_transactions t
        LEFT JOIN loyalty_point_consumptions c ON t.id = c.earnTransactionId
        WHERE t.customerId = ? AND t.type IN ('EARN', 'ADJUST') AND t.points > 0
          AND (t.expiresAt IS NULL OR t.expiresAt > NOW())
        GROUP BY t.id
        HAVING (t.points - consumed) > 0
        ORDER BY t.createdAt ASC
    `, [customerId]);
    let remainingToConsume = pointsToConsume;
    const now = (0, dateUtils_1.getEgyptianISOString)();
    for (const tx of earnTx) {
        if (remainingToConsume <= 0)
            break;
        const available = Number(tx.points) - Number(tx.consumed);
        const toConsume = Math.min(available, remainingToConsume);
        yield conn.query(`
            INSERT INTO loyalty_point_consumptions (id, earnTransactionId, consumeTransactionId, pointsConsumed, createdAt)
            VALUES (?, ?, ?, ?, ?)
        `, [(0, uuid_1.v4)(), tx.id, consumeTransactionId, toConsume, now]);
        remainingToConsume -= toConsume;
    }
});
// ─── Customer Balance ───────────────────────────────────────────────────────
const getLoyaltyBalance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { customerId } = req.params;
        if (!customerId) {
            return res.status(400).json({ error: 'customerId مطلوب' });
        }
        const balance = yield deriveBalance(conn, customerId);
        const settings = yield (0, exports.getLoyaltySettings)(conn);
        res.json(Object.assign(Object.assign({}, balance), { settings: {
                balanceType: settings.balanceType,
                minimumRedemptionPoints: Number(settings.minimumRedemptionPoints),
                conversionRate: Number(settings.conversionRate),
                allowDecimals: Boolean(settings.allowDecimals),
            } }));
    }
    catch (error) {
        console.error('Error fetching loyalty balance:', error.message);
        res.status(500).json({ error: 'خطأ في جلب رصيد الولاء' });
    }
    finally {
        conn.release();
    }
});
exports.getLoyaltyBalance = getLoyaltyBalance;
// ─── Preview (for Payment Modal) ────────────────────────────────────────────
const previewLoyalty = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { customerId, orderTotal, cartItems = [] } = req.body;
        if (!customerId || orderTotal === undefined) {
            return res.status(400).json({ error: 'customerId و orderTotal مطلوبان' });
        }
        const [partnerRows] = yield conn.query(`SELECT classification FROM partners WHERE id = ?`, [customerId]);
        const classification = ((_a = partnerRows[0]) === null || _a === void 0 ? void 0 : _a.classification) || null;
        const rules = yield (0, exports.getApplicableRules)(conn, orderTotal, classification);
        const settings = yield (0, exports.getLoyaltySettings)(conn);
        const balance = yield deriveBalance(conn, customerId);
        let pointsToEarn = 0;
        let ruleName = null;
        let ruleId = null;
        if (rules.length > 0) {
            // For preview, we'll just run the calculation engine on the rules
            const calc = yield calculatePointsEarned(conn, rules, orderTotal, cartItems);
            pointsToEarn = calc.pointsEarned;
            if (calc.breakdown.length > 0) {
                ruleName = calc.breakdown[0].ruleName;
                ruleId = calc.breakdown[0].ruleId;
            }
        }
        res.json({
            isActive: true,
            balance,
            settings: {
                balanceType: settings.balanceType,
                minimumRedemptionPoints: Number(settings.minimumRedemptionPoints),
                conversionRate: Number(settings.conversionRate),
                allowDecimals: Boolean(settings.allowDecimals),
            },
            earnPreview: {
                pointsToEarn,
                ruleName,
                ruleId,
            }
        });
    }
    catch (error) {
        console.error('Error previewing loyalty:', error.message);
        res.status(500).json({ error: 'خطأ في معاينة الولاء' });
    }
    finally {
        conn.release();
    }
});
exports.previewLoyalty = previewLoyalty;
function calculatePointsEarned(conn, rules, orderTotal, cartItems) {
    return __awaiter(this, void 0, void 0, function* () {
        let totalPoints = 0;
        const breakdown = [];
        // Get category ids for cart items
        const productIds = cartItems.map((item) => item.productId).filter((id) => id !== 'CUSTOM_TRADE_IN');
        const categoryMap = {};
        if (productIds.length > 0) {
            const [prodRows] = yield conn.query(`SELECT id, categoryId FROM products WHERE id IN (?)`, [productIds]);
            for (const p of prodRows) {
                categoryMap[p.id] = p.categoryId;
            }
        }
        for (const rule of rules) {
            let rulePoints = 0;
            const ppu = Number(rule.points_per_unit) || 1;
            if (rule.rule_type === 'FLAT_BONUS') {
                rulePoints = ppu;
            }
            else if (rule.rule_type === 'SPEND_BASED') {
                const spendUnit = Number(rule.spend_unit) || 10;
                // Filter eligible items
                const eligibleTotal = cartItems.reduce((sum, item) => {
                    const itemDiscount = Number(item.discount) || 0;
                    if (rule.exclude_discounted_items && itemDiscount > 0)
                        return sum;
                    // Safely resolve the line total (POS passes 'total', standard invoices pass 'subtotal' or we compute it)
                    let lineTotal = Number(item.total);
                    if (isNaN(lineTotal) || item.total === undefined) {
                        lineTotal = Number(item.subtotal);
                    }
                    if (isNaN(lineTotal) || (item.subtotal === undefined && item.total === undefined)) {
                        const price = Number(item.price) || 0;
                        const qty = Number(item.quantity) || 1;
                        lineTotal = (price - itemDiscount) * qty;
                    }
                    if (isNaN(lineTotal))
                        lineTotal = 0;
                    if (lineTotal < 0)
                        return sum; // exclude trade-ins
                    return sum + lineTotal;
                }, 0);
                rulePoints = Math.floor(eligibleTotal / spendUnit) * ppu;
            }
            else if (rule.rule_type === 'CATEGORY_MULTIPLIER' || rule.rule_type === 'PRODUCT_MULTIPLIER') {
                const spendUnit = Number(rule.spend_unit) || 10;
                const multiplier = Number(rule.multiplier) || 1.0;
                let targetIds = [];
                try {
                    if (rule.rule_type === 'CATEGORY_MULTIPLIER')
                        targetIds = typeof rule.category_ids === 'string' ? JSON.parse(rule.category_ids) : (rule.category_ids || []);
                    else
                        targetIds = typeof rule.product_ids === 'string' ? JSON.parse(rule.product_ids) : (rule.product_ids || []);
                }
                catch (e) { }
                const eligibleTotal = cartItems.reduce((sum, item) => {
                    if (rule.exclude_discounted_items && item.discount > 0)
                        return sum;
                    if (item.total < 0)
                        return sum;
                    let matches = false;
                    if (rule.rule_type === 'CATEGORY_MULTIPLIER' && categoryMap[item.productId] && targetIds.includes(categoryMap[item.productId])) {
                        matches = true;
                    }
                    else if (rule.rule_type === 'PRODUCT_MULTIPLIER' && targetIds.includes(item.productId)) {
                        matches = true;
                    }
                    return matches ? sum + item.total : sum;
                }, 0);
                rulePoints = Math.floor((eligibleTotal / spendUnit) * ppu * multiplier);
            }
            if (rulePoints > 0) {
                totalPoints += rulePoints;
                breakdown.push({
                    ruleId: rule.id,
                    ruleName: rule.name,
                    points: rulePoints
                });
            }
        }
        return { pointsEarned: totalPoints, breakdown };
    });
}
// ─── Transaction History ────────────────────────────────────────────────────
const getLoyaltyHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { customerId } = req.params;
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const offset = Number(req.query.offset) || 0;
        if (!customerId) {
            return res.status(400).json({ error: 'customerId مطلوب' });
        }
        const [rows] = yield conn.query(`SELECT t.*, r.name as ruleName
             FROM loyalty_transactions t
             LEFT JOIN loyalty_rules r ON r.id = t.ruleId
             WHERE t.customerId = ?
             ORDER BY t.createdAt DESC
             LIMIT ? OFFSET ?`, [customerId, limit, offset]);
        const [countRows] = yield conn.query(`SELECT COUNT(*) as total FROM loyalty_transactions WHERE customerId = ?`, [customerId]);
        res.json({
            transactions: rows,
            total: ((_a = countRows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0,
            limit,
            offset,
        });
    }
    catch (error) {
        console.error('Error fetching loyalty history:', error.message);
        res.status(500).json({ error: 'خطأ في جلب سجل الولاء' });
    }
    finally {
        conn.release();
    }
});
exports.getLoyaltyHistory = getLoyaltyHistory;
// ─── Manual Adjustment (Admin) ──────────────────────────────────────────────
const adjustLoyaltyPoints = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { customerId, points, reason } = req.body;
        const userName = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        if (!customerId || !points || points === 0) {
            return res.status(400).json({ error: 'customerId و points مطلوبان' });
        }
        if (!reason || reason.trim().length < 3) {
            return res.status(400).json({ error: 'يجب إدخال سبب التعديل (3 أحرف على الأقل)' });
        }
        const now = (0, dateUtils_1.getEgyptianISOString)();
        const fyCheck = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)(now);
        if (!fyCheck.allowed) {
            return res.status(403).json({ error: fyCheck.error, errorCode: fyCheck.errorCode });
        }
        const txId = (0, uuid_1.v4)();
        let type = 'ADJUST';
        let txPoints = points;
        yield conn.query('START TRANSACTION');
        if (points < 0) {
            // It's a deduction, act like REDEEM
            type = 'ADJUST'; // We keep ADJUST but deduct via FIFO
            // Lock the transactions to prevent concurrent deductions
            yield conn.query(`SELECT id FROM loyalty_transactions WHERE customerId = ? FOR UPDATE`, [customerId]);
            // Validate balance
            const balance = yield deriveBalance(conn, customerId);
            if (balance.currentBalance < Math.abs(points)) {
                yield conn.query('ROLLBACK');
                return res.status(400).json({ error: 'رصيد العميل لا يكفي للخصم' });
            }
            yield conn.query(`INSERT INTO loyalty_transactions (id, customerId, type, points, description, createdBy, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`, [txId, customerId, type, txPoints, `تعديل يدوي (خصم): ${reason}`, userName, now]);
            // Consume points
            yield consumePointsFIFO(conn, customerId, txId, Math.abs(points));
        }
        else {
            // Positive adjustment
            yield conn.query(`INSERT INTO loyalty_transactions (id, customerId, type, points, description, createdBy, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`, [txId, customerId, type, txPoints, `تعديل يدوي (إضافة): ${reason}`, userName, now]);
        }
        const balance = yield deriveBalance(conn, customerId);
        yield conn.query('COMMIT');
        console.log(`🎯 [Loyalty] Manual adjustment: ${points > 0 ? '+' : ''}${points} points for customer ${customerId} by ${userName}`);
        res.json({
            success: true,
            transactionId: txId,
            balance,
        });
    }
    catch (error) {
        if (conn)
            yield conn.query('ROLLBACK');
        console.error('Error adjusting loyalty points:', error.message);
        res.status(500).json({ error: 'خطأ في تعديل نقاط الولاء' });
    }
    finally {
        conn.release();
    }
});
exports.adjustLoyaltyPoints = adjustLoyaltyPoints;
// ─── Settings CRUD ──────────────────────────────────────────────────────────
const getLoyaltySettingsAPI = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const settings = yield (0, exports.getLoyaltySettings)(conn);
        res.json({ settings });
    }
    catch (error) {
        console.error('Error fetching loyalty settings:', error.message);
        res.status(500).json({ error: 'خطأ في جلب إعدادات الولاء' });
    }
    finally {
        conn.release();
    }
});
exports.getLoyaltySettingsAPI = getLoyaltySettingsAPI;
const updateLoyaltySettingsAPI = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const updates = req.body;
        const allowedFields = [
            'balanceType', 'minimumRedemptionPoints', 'conversionRate', 'allowDecimals',
            'tier_silver_min_spend', 'tier_gold_min_spend', 'tier_platinum_min_spend',
            'tier_silver_multiplier', 'tier_gold_multiplier', 'tier_platinum_multiplier'
        ];
        // Ensure at least one row exists to update
        const [rows] = yield conn.query(`SELECT COUNT(*) as count FROM loyalty_settings`);
        const count = ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
        if (count === 0) {
            yield conn.query(`INSERT INTO loyalty_settings (balanceType) VALUES ('loyalty_points')`);
        }
        const setClauses = [];
        const params = [];
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                setClauses.push(`${field} = ?`);
                params.push(updates[field]);
            }
        }
        if (setClauses.length > 0) {
            yield conn.query(`UPDATE loyalty_settings SET ${setClauses.join(', ')}`, params);
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error updating loyalty settings:', error.message);
        res.status(500).json({ error: 'خطأ في تحديث الإعدادات' });
    }
    finally {
        conn.release();
    }
});
exports.updateLoyaltySettingsAPI = updateLoyaltySettingsAPI;
// ─── Rules CRUD ──────────────────────────────────────────────────────────
const getLoyaltyRules = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const [rows] = yield conn.query(`SELECT * FROM loyalty_rules ORDER BY priority DESC, minimumSpend DESC, createdAt DESC`);
        const rules = rows.map(rule => {
            const parsed = Object.assign({}, rule);
            try {
                if (rule.days_of_week && typeof rule.days_of_week === 'string') {
                    parsed.days_of_week = JSON.parse(rule.days_of_week);
                }
            }
            catch (e) { }
            try {
                if (rule.category_ids && typeof rule.category_ids === 'string') {
                    parsed.category_ids = JSON.parse(rule.category_ids);
                }
            }
            catch (e) { }
            try {
                if (rule.product_ids && typeof rule.product_ids === 'string') {
                    parsed.product_ids = JSON.parse(rule.product_ids);
                }
            }
            catch (e) { }
            return parsed;
        });
        res.json({ rules });
    }
    catch (error) {
        console.error('Error fetching loyalty rules:', error.message);
        res.status(500).json({ error: 'خطأ في جلب قواعد الولاء' });
    }
    finally {
        conn.release();
    }
});
exports.getLoyaltyRules = getLoyaltyRules;
const createLoyaltyRule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { name, status = 'active', priority = 1, customerClassification = null, accumulationRate = 10, minimumSpend = null, expiryDays = null, rule_type = 'SPEND_BASED', points_per_unit = 1.0, spend_unit = 10, multiplier = 1.0, category_ids = null, product_ids = null, valid_from = null, valid_to = null, days_of_week = null, exclude_discounted_items = 0 } = req.body;
        if (!name || name.trim().length < 2) {
            return res.status(400).json({ error: 'اسم القاعدة مطلوب' });
        }
        const id = (0, uuid_1.v4)();
        const now = (0, dateUtils_1.getEgyptianISOString)();
        const daysOfWeekStr = Array.isArray(days_of_week) ? JSON.stringify(days_of_week) : days_of_week;
        const categoryIdsStr = Array.isArray(category_ids) ? JSON.stringify(category_ids) : category_ids;
        const productIdsStr = Array.isArray(product_ids) ? JSON.stringify(product_ids) : product_ids;
        yield conn.query(`INSERT INTO loyalty_rules 
             (id, name, status, priority, customerClassification, accumulationRate, minimumSpend, expiryDays,
              rule_type, points_per_unit, spend_unit, multiplier, category_ids, product_ids, valid_from, valid_to, days_of_week, exclude_discounted_items, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id, name.trim(), status, priority, customerClassification || null, accumulationRate, minimumSpend || null, expiryDays || null,
            rule_type, points_per_unit, spend_unit, multiplier, categoryIdsStr || null, productIdsStr || null, valid_from || null, valid_to || null, daysOfWeekStr || null, exclude_discounted_items ? 1 : 0, now
        ]);
        console.log(`🎯 [Loyalty] Rule created: "${name}" (${id})`);
        res.json({ success: true, id });
    }
    catch (error) {
        console.error('Error creating loyalty rule:', error.message);
        res.status(500).json({ error: 'خطأ في إنشاء القاعدة' });
    }
    finally {
        conn.release();
    }
});
exports.createLoyaltyRule = createLoyaltyRule;
const updateLoyaltyRule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const updates = req.body;
        const [existing] = yield conn.query(`SELECT id FROM loyalty_rules WHERE id = ?`, [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'القاعدة غير موجودة' });
        }
        const allowedFields = [
            'name', 'status', 'priority', 'customerClassification',
            'accumulationRate', 'minimumSpend', 'expiryDays',
            'rule_type', 'points_per_unit', 'spend_unit', 'multiplier',
            'category_ids', 'product_ids', 'valid_from', 'valid_to',
            'days_of_week', 'exclude_discounted_items'
        ];
        const setClauses = [];
        const params = [];
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                setClauses.push(`${field} = ?`);
                let value = updates[field];
                if (value === '') {
                    value = null;
                }
                else if (Array.isArray(value)) {
                    value = JSON.stringify(value);
                }
                params.push(value);
            }
        }
        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'لا توجد حقول للتحديث' });
        }
        params.push(id);
        yield conn.query(`UPDATE loyalty_rules SET ${setClauses.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error updating loyalty rule:', error.message);
        res.status(500).json({ error: 'خطأ في تحديث القاعدة' });
    }
    finally {
        conn.release();
    }
});
exports.updateLoyaltyRule = updateLoyaltyRule;
const deleteLoyaltyRule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        yield conn.query(`DELETE FROM loyalty_rules WHERE id = ?`, [id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting loyalty rule:', error.message);
        res.status(500).json({ error: 'خطأ في حذف القاعدة' });
    }
    finally {
        conn.release();
    }
});
exports.deleteLoyaltyRule = deleteLoyaltyRule;
// ─── Dashboard Stats (Admin Page) ───────────────────────────────────────────
const getLoyaltyDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const [globalRows] = yield conn.query(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'EARN' THEN points ELSE 0 END), 0)                AS totalEarned,
                COALESCE(SUM(CASE WHEN type = 'REDEEM' THEN ABS(points) ELSE 0 END), 0)         AS totalRedeemed,
                COALESCE(SUM(CASE WHEN type = 'REFUND_CLAWBACK' THEN ABS(points) ELSE 0 END),0) AS totalClawback,
                COALESCE(SUM(CASE WHEN type = 'ADJUST' THEN points ELSE 0 END), 0)              AS totalAdjusted,
                COALESCE(SUM(CASE WHEN type = 'EXPIRE' THEN ABS(points) ELSE 0 END), 0)         AS totalExpired,
                COUNT(DISTINCT customerId) AS totalMembers,
                COUNT(*) AS totalTransactions
            FROM loyalty_transactions
        `);
        const stats = globalRows[0] || {};
        const totalEarned = Number(stats.totalEarned) || 0;
        const totalRedeemed = Number(stats.totalRedeemed) || 0;
        const totalClawback = Number(stats.totalClawback) || 0;
        const totalAdjusted = Number(stats.totalAdjusted) || 0;
        const totalExpired = Number(stats.totalExpired) || 0;
        const totalOutstanding = totalEarned - totalRedeemed - totalClawback + totalAdjusted - totalExpired;
        const [topCustomers] = yield conn.query(`
            SELECT
                t.customerId,
                p.name AS customerName,
                p.phone AS customerPhone,
                SUM(CASE WHEN t.type = 'EARN' THEN t.points ELSE 0 END) AS earned,
                SUM(CASE WHEN t.type = 'REDEEM' THEN ABS(t.points) ELSE 0 END) AS redeemed,
                SUM(CASE WHEN t.type = 'REFUND_CLAWBACK' THEN ABS(t.points) ELSE 0 END) AS clawback,
                SUM(CASE WHEN t.type = 'ADJUST' THEN t.points ELSE 0 END) AS adjusted,
                SUM(CASE WHEN t.type = 'EXPIRE' THEN ABS(t.points) ELSE 0 END) AS expired,
                (
                    SUM(CASE WHEN t.type = 'EARN' THEN t.points ELSE 0 END)
                  - SUM(CASE WHEN t.type = 'REDEEM' THEN ABS(t.points) ELSE 0 END)
                  - SUM(CASE WHEN t.type = 'REFUND_CLAWBACK' THEN ABS(t.points) ELSE 0 END)
                  + SUM(CASE WHEN t.type = 'ADJUST' THEN t.points ELSE 0 END)
                  - SUM(CASE WHEN t.type = 'EXPIRE' THEN ABS(t.points) ELSE 0 END)
                ) AS balance,
                MAX(t.createdAt) AS lastActivity
            FROM loyalty_transactions t
            LEFT JOIN partners p ON t.customerId = p.id
            GROUP BY t.customerId, p.name, p.phone
            ORDER BY balance DESC
            LIMIT 20
        `);
        const [recentTx] = yield conn.query(`
            SELECT t.*, p.name AS customerName, r.name AS ruleName
            FROM loyalty_transactions t
            LEFT JOIN partners p ON t.customerId = p.id
            LEFT JOIN loyalty_rules r ON t.ruleId = r.id
            ORDER BY t.createdAt DESC
            LIMIT 30
        `);
        const settings = yield (0, exports.getLoyaltySettings)(conn);
        res.json({
            stats: {
                totalEarned,
                totalRedeemed,
                totalClawback,
                totalAdjusted,
                totalExpired,
                totalOutstanding,
                totalMembers: Number(stats.totalMembers) || 0,
                totalTransactions: Number(stats.totalTransactions) || 0,
            },
            topCustomers,
            recentTransactions: recentTx,
            settings,
        });
    }
    catch (error) {
        console.error('Error fetching loyalty dashboard:', error.message);
        res.status(500).json({ error: 'خطأ في جلب لوحة الولاء' });
    }
    finally {
        conn.release();
    }
});
exports.getLoyaltyDashboard = getLoyaltyDashboard;
const getLoyaltyCustomers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 500);
        const offset = (page - 1) * limit;
        const search = req.query.search;
        const classification = req.query.classification;
        const hasPointsOnly = req.query.hasPointsOnly === 'true';
        const sortBy = req.query.sortBy || 'balance';
        const sortOrder = (req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const allowedSortFields = ['name', 'phone', 'balance', 'earned', 'lastActivity'];
        const sortFieldMap = {
            name: 'p.name',
            phone: 'p.phone',
            balance: 'balance',
            earned: 'earned',
            lastActivity: 'lastActivity'
        };
        const orderBy = allowedSortFields.includes(sortBy) ? sortFieldMap[sortBy] : 'balance';
        let whereClauses = ['p.isCustomer = 1'];
        const params = [];
        if (search) {
            whereClauses.push('(p.name LIKE ? OR p.phone LIKE ?)');
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern);
        }
        if (classification) {
            whereClauses.push('p.classification = ?');
            params.push(classification);
        }
        // Build the base query
        let query = `
            SELECT
                p.id AS customerId,
                p.name AS customerName,
                p.phone AS customerPhone,
                p.classification AS customerClassification,
                p.referral_code AS referral_code,
                COALESCE((
                    SELECT SUM(total)
                    FROM invoices i
                    WHERE i.partnerId = p.id
                      AND i.type = 'INVOICE_SALE'
                      AND i.status != 'VOID'
                      AND i.date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
                ), 0) AS totalSpend,
                COALESCE(SUM(CASE WHEN t.type = 'EARN' THEN t.points ELSE 0 END), 0) AS earned,
                COALESCE(SUM(CASE WHEN t.type = 'REDEEM' THEN ABS(t.points) ELSE 0 END), 0) AS redeemed,
                COALESCE(SUM(CASE WHEN t.type = 'REFUND_CLAWBACK' THEN ABS(t.points) ELSE 0 END), 0) AS clawback,
                COALESCE(SUM(CASE WHEN t.type = 'ADJUST' THEN t.points ELSE 0 END), 0) AS adjusted,
                COALESCE(SUM(CASE WHEN t.type = 'EXPIRE' THEN ABS(t.points) ELSE 0 END), 0) AS expired,
                COALESCE(
                    SUM(CASE WHEN t.type = 'EARN' THEN t.points ELSE 0 END)
                  - SUM(CASE WHEN t.type = 'REDEEM' THEN ABS(t.points) ELSE 0 END)
                  - SUM(CASE WHEN t.type = 'REFUND_CLAWBACK' THEN ABS(t.points) ELSE 0 END)
                  + SUM(CASE WHEN t.type = 'ADJUST' THEN t.points ELSE 0 END)
                  - SUM(CASE WHEN t.type = 'EXPIRE' THEN ABS(t.points) ELSE 0 END)
                , 0) AS balance,
                MAX(t.createdAt) AS lastActivity
            FROM partners p
            LEFT JOIN loyalty_transactions t ON p.id = t.customerId
            WHERE ${whereClauses.join(' AND ')}
            GROUP BY p.id, p.name, p.phone, p.classification
        `;
        if (hasPointsOnly) {
            query += ' HAVING balance > 0';
        }
        // To get total count, we wrap the query
        const countQuery = `SELECT COUNT(*) AS total FROM (${query}) AS sub`;
        const [countRows] = yield conn.query(countQuery, params);
        const total = ((_a = countRows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
        // Add ORDER BY and LIMIT
        query += ` ORDER BY ${orderBy} ${sortOrder} LIMIT ? OFFSET ?`;
        const queryParams = [...params, limit, offset];
        const [rows] = yield conn.query(query, queryParams);
        // Fetch settings once to map tiers
        const settings = yield (0, exports.getLoyaltySettings)(conn);
        const silverSpend = Number(settings.tier_silver_min_spend) || 2000.00;
        const goldSpend = Number(settings.tier_gold_min_spend) || 5000.00;
        const platSpend = Number(settings.tier_platinum_min_spend) || 10000.00;
        const silverMult = Number(settings.tier_silver_multiplier) || 1.20;
        const goldMult = Number(settings.tier_gold_multiplier) || 1.50;
        const platMult = Number(settings.tier_platinum_multiplier) || 2.00;
        const enrichedCustomers = rows.map(c => {
            const totalSpend = Number(c.totalSpend) || 0;
            let tier = 'BRONZE';
            let multiplier = 1.0;
            let nextTierSpend = silverSpend;
            if (totalSpend >= platSpend) {
                tier = 'PLATINUM';
                multiplier = platMult;
                nextTierSpend = 0;
            }
            else if (totalSpend >= goldSpend) {
                tier = 'GOLD';
                multiplier = goldMult;
                nextTierSpend = platSpend;
            }
            else if (totalSpend >= silverSpend) {
                tier = 'SILVER';
                multiplier = silverMult;
                nextTierSpend = goldSpend;
            }
            else {
                tier = 'BRONZE';
                multiplier = 1.0;
                nextTierSpend = silverSpend;
            }
            return Object.assign(Object.assign({}, c), { tierInfo: {
                    tier,
                    multiplier,
                    totalSpend,
                    nextTierSpend
                } });
        });
        res.json({
            customers: enrichedCustomers,
            total,
            page,
            limit
        });
    }
    catch (error) {
        console.error('Error fetching loyalty customers:', error.message);
        res.status(500).json({ error: 'خطأ في جلب عملاء الولاء' });
    }
    finally {
        conn.release();
    }
});
exports.getLoyaltyCustomers = getLoyaltyCustomers;
// ─── Transactional Helpers (called within existing DB transactions) ──────────
/**
 * Records loyalty points EARNED after a successful POS sale.
 * Called from processPOSSale AFTER commit (non-fatal).
 */
const recordLoyaltyEarn = (conn_1, customerId_1, orderId_1, orderTotal_1, userName_1, ...args_1) => __awaiter(void 0, [conn_1, customerId_1, orderId_1, orderTotal_1, userName_1, ...args_1], void 0, function* (conn, customerId, orderId, orderTotal, userName, cartItems = []) {
    var _a, _b;
    try {
        const fyCheck = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)((0, dateUtils_1.getEgyptianISOString)());
        if (!fyCheck.allowed) {
            console.warn(`⚠️ [Loyalty] Earning points blocked due to closed fiscal period: ${fyCheck.error}`);
            return null;
        }
        const [partnerRows] = yield conn.query(`SELECT classification FROM partners WHERE id = ?`, [customerId]);
        const classification = ((_a = partnerRows[0]) === null || _a === void 0 ? void 0 : _a.classification) || null;
        const rules = yield (0, exports.getApplicableRules)(conn, orderTotal, classification);
        if (rules.length === 0)
            return null;
        const calc = yield calculatePointsEarned(conn, rules, orderTotal, cartItems);
        const pointsEarned = calc.pointsEarned;
        if (pointsEarned <= 0)
            return null;
        // Apply dynamic Tier multiplier
        const tierInfo = yield (0, exports.deriveCustomerTier)(conn, customerId);
        const multiplier = tierInfo.multiplier;
        const tierName = tierInfo.tier;
        let finalPointsEarned = 0;
        const finalBreakdown = calc.breakdown.map((b) => {
            const scaledPoints = Math.floor(b.points * multiplier);
            finalPointsEarned += scaledPoints;
            return Object.assign(Object.assign({}, b), { points: scaledPoints });
        });
        if (finalPointsEarned <= 0)
            return null;
        const now = (0, dateUtils_1.getEgyptianISOString)();
        // Use the first applied rule for expiry and primary tracking
        const primaryRule = rules.find(r => finalBreakdown.some((b) => b.ruleId === r.id));
        if (!primaryRule)
            return null;
        let expiresAt = null;
        if (primaryRule.expiryDays && primaryRule.expiryDays > 0) {
            const expireDate = new Date();
            expireDate.setDate(expireDate.getDate() + primaryRule.expiryDays);
            expiresAt = expireDate.toISOString().slice(0, 19).replace('T', ' '); // YYYY-MM-DD HH:MM:SS
        }
        const txId = (0, uuid_1.v4)();
        // Create detailed description from breakdown
        const descStr = finalBreakdown.map((b) => `${b.ruleName} (+${b.points})`).join(' | ');
        const tierSuffix = multiplier > 1.0 ? ` (مضاعف الفئة ${tierName} x${multiplier.toFixed(2)})` : '';
        yield conn.query(`INSERT INTO loyalty_transactions (id, ruleId, customerId, orderId, type, points, monetaryValue, description, createdBy, createdAt, expiresAt)
             VALUES (?, ?, ?, ?, 'EARN', ?, ?, ?, ?, ?, ?)`, [txId, primaryRule.id, customerId, orderId, finalPointsEarned, orderTotal,
            `كسب نقاط: ${descStr}${tierSuffix}`, userName, now, expiresAt]);
        const balance = yield deriveBalance(conn, customerId);
        // === FRAUD SENTRY: Dormant Account Check ===
        if (finalPointsEarned > 100) {
            try {
                const [lastInvoiceRows] = yield conn.query(`SELECT date FROM invoices 
                     WHERE partnerId = ? AND type = 'INVOICE_SALE' AND status != 'VOID' AND id != ?
                     ORDER BY date DESC LIMIT 1`, [customerId, orderId]);
                if (lastInvoiceRows.length > 0) {
                    const lastDate = new Date(lastInvoiceRows[0].date);
                    const daysDiff = (new Date().getTime() - lastDate.getTime()) / (1000 * 3600 * 24);
                    if (daysDiff > 90) {
                        const alertId = (0, uuid_1.v4)();
                        const customerName = ((_b = partnerRows[0]) === null || _b === void 0 ? void 0 : _b.name) || customerId;
                        yield conn.query(`INSERT INTO pos_fraud_alerts (id, alert_type, severity, description, details, cashier_id, cashier_name, customer_id)
                             VALUES (?, 'DORMANT_RAPID_ACCUMULATION', 'WARNING', ?, ?, ?, ?, ?)`, [
                            alertId,
                            `تراكم نقاط سريع (${finalPointsEarned} نقطة) على حساب راكد للعميل (${customerName}) لم يقم بالشراء منذ ${Math.floor(daysDiff)} يوم.`,
                            JSON.stringify({ earnedPoints: finalPointsEarned, daysDormant: Math.floor(daysDiff) }),
                            'system',
                            userName || 'System',
                            customerId
                        ]);
                        console.log(`⚠️ [FRAUD] Alert DORMANT_RAPID_ACCUMULATION created for customer ${customerName}`);
                    }
                }
            }
            catch (fraudErr) {
                console.error('Non-fatal dormant fraud check error:', fraudErr.message);
            }
        }
        console.log(`🎯 [Loyalty] +${finalPointsEarned} points for customer ${customerId} (order ${orderId})`);
        return { pointsEarned: finalPointsEarned, newBalance: balance.currentBalance, breakdown: finalBreakdown };
    }
    catch (err) {
        console.error(`⚠️ [Loyalty] Earn recording failed (non-fatal):`, err.message);
        return null;
    }
});
exports.recordLoyaltyEarn = recordLoyaltyEarn;
/**
 * Records loyalty points REDEEMED as part of a POS sale.
 * Called from processPOSSale WITHIN the transaction.
 */
const recordLoyaltyRedeem = (conn, customerId, orderId, pointsToRedeem, discountAmount, userName) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const fyCheck = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)((0, dateUtils_1.getEgyptianISOString)());
        if (!fyCheck.allowed) {
            console.warn(`⚠️ [Loyalty] Redeeming points blocked due to closed fiscal period: ${fyCheck.error}`);
            return false;
        }
        // Validate balance with FOR UPDATE lock to prevent double-spend
        const [balRows] = yield conn.query(`SELECT 
                COALESCE(SUM(CASE WHEN type = 'EARN' THEN points ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN type IN ('REDEEM','REFUND_CLAWBACK','EXPIRE') THEN ABS(points) ELSE 0 END), 0) +
                COALESCE(SUM(CASE WHEN type = 'ADJUST' THEN points ELSE 0 END), 0) AS balance
             FROM loyalty_transactions
             WHERE customerId = ?
             FOR UPDATE`, [customerId]);
        const currentBalance = Number((_a = balRows[0]) === null || _a === void 0 ? void 0 : _a.balance) || 0;
        if (currentBalance < pointsToRedeem) {
            console.warn(`⚠️ [Loyalty] Insufficient points: has ${currentBalance}, wants ${pointsToRedeem}`);
            return false;
        }
        const now = (0, dateUtils_1.getEgyptianISOString)();
        const txId = (0, uuid_1.v4)();
        // Store as negative points for REDEEM
        yield conn.query(`INSERT INTO loyalty_transactions (id, customerId, orderId, type, points, monetaryValue, description, createdBy, createdAt)
             VALUES (?, ?, ?, 'REDEEM', ?, ?, ?, ?, ?)`, [txId, customerId, orderId, -pointsToRedeem, discountAmount,
            `استبدال نقاط في فاتورة POS`, userName, now]);
        // Perform FIFO Consumption tracking
        yield consumePointsFIFO(conn, customerId, txId, pointsToRedeem);
        console.log(`🎯 [Loyalty] -${pointsToRedeem} points redeemed by customer ${customerId} (= ${discountAmount} EGP)`);
        return true;
    }
    catch (err) {
        console.error(`⚠️ [Loyalty] Redeem recording failed:`, err.message);
        return false;
    }
});
exports.recordLoyaltyRedeem = recordLoyaltyRedeem;
/**
 * Clawback earned points when a refund is processed.
 * Called from processPOSRefund AFTER commit (non-fatal).
 */
const recordLoyaltyClawback = (conn, customerId, originalOrderId, refundTotal, userName) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const fyCheck = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)((0, dateUtils_1.getEgyptianISOString)());
        if (!fyCheck.allowed) {
            console.warn(`⚠️ [Loyalty] Clawback points blocked due to closed fiscal period: ${fyCheck.error}`);
            return 0;
        }
        // Find how many points were earned on the original order
        const [earnRows] = yield conn.query(`SELECT COALESCE(SUM(points), 0) as earnedPoints 
             FROM loyalty_transactions 
             WHERE orderId = ? AND customerId = ? AND type = 'EARN'`, [originalOrderId, customerId]);
        const originalEarned = Number((_a = earnRows[0]) === null || _a === void 0 ? void 0 : _a.earnedPoints) || 0;
        if (originalEarned <= 0)
            return 0;
        // Check if clawback already exists for this order
        const [existingClawback] = yield conn.query(`SELECT COALESCE(SUM(ABS(points)), 0) as clawedBack 
             FROM loyalty_transactions 
             WHERE orderId = ? AND customerId = ? AND type = 'REFUND_CLAWBACK'`, [originalOrderId, customerId]);
        const alreadyClawed = Number((_b = existingClawback[0]) === null || _b === void 0 ? void 0 : _b.clawedBack) || 0;
        // Calculate proportional clawback based on refund vs original total
        const [origInv] = yield conn.query(`SELECT total FROM invoices WHERE id = ? LIMIT 1`, [originalOrderId]);
        const originalTotal = Number((_c = origInv[0]) === null || _c === void 0 ? void 0 : _c.total) || 1;
        const refundRatio = Math.min(1, refundTotal / originalTotal);
        const pointsToClawback = Math.min(Math.floor(originalEarned * refundRatio), originalEarned - alreadyClawed);
        if (pointsToClawback <= 0)
            return 0;
        // Check customer balance to ensure we don't clawback below 0 (or we could allow negative)
        // Usually, clawback can make balance negative, so we proceed anyway.
        const now = (0, dateUtils_1.getEgyptianISOString)();
        const txId = (0, uuid_1.v4)();
        yield conn.query(`INSERT INTO loyalty_transactions (id, customerId, orderId, type, points, monetaryValue, description, createdBy, createdAt)
             VALUES (?, ?, ?, 'REFUND_CLAWBACK', ?, ?, ?, ?, ?)`, [txId, customerId, originalOrderId, -pointsToClawback, refundTotal,
            `استرداد نقاط بسبب مرتجع`, userName, now]);
        // Perform FIFO Consumption tracking for clawback (since it acts like a deduction)
        yield consumePointsFIFO(conn, customerId, txId, pointsToClawback);
        console.log(`🎯 [Loyalty] Clawback: -${pointsToClawback} points from customer ${customerId} (refund on ${originalOrderId})`);
        return pointsToClawback;
    }
    catch (err) {
        console.error(`⚠️ [Loyalty] Clawback failed (non-fatal):`, err.message);
        return 0;
    }
});
exports.recordLoyaltyClawback = recordLoyaltyClawback;
/**
 * Derives the dynamic loyalty tier and point multiplier for a customer
 * based on their rolling 12-month spend in invoices.
 */
const deriveCustomerTier = (conn, customerId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const settings = yield (0, exports.getLoyaltySettings)(conn);
    // Sum rolling 12-month POS/Standard sales invoices
    const [spendRows] = yield conn.query(`SELECT COALESCE(SUM(total), 0) AS totalSpend 
         FROM invoices 
         WHERE partnerId = ? 
           AND type = 'INVOICE_SALE' 
           AND status != 'VOID'
           AND date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`, [customerId]);
    const totalSpend = Number((_a = spendRows[0]) === null || _a === void 0 ? void 0 : _a.totalSpend) || 0;
    let tier = 'BRONZE';
    let multiplier = 1.0;
    const silverSpend = Number(settings.tier_silver_min_spend) || 2000.00;
    const goldSpend = Number(settings.tier_gold_min_spend) || 5000.00;
    const platSpend = Number(settings.tier_platinum_min_spend) || 10000.00;
    let nextTierSpend = silverSpend;
    if (totalSpend >= platSpend) {
        tier = 'PLATINUM';
        multiplier = Number(settings.tier_platinum_multiplier) || 2.00;
        nextTierSpend = 0;
    }
    else if (totalSpend >= goldSpend) {
        tier = 'GOLD';
        multiplier = Number(settings.tier_gold_multiplier) || 1.50;
        nextTierSpend = platSpend;
    }
    else if (totalSpend >= silverSpend) {
        tier = 'SILVER';
        multiplier = Number(settings.tier_silver_multiplier) || 1.20;
        nextTierSpend = goldSpend;
    }
    else {
        tier = 'BRONZE';
        multiplier = 1.0;
        nextTierSpend = silverSpend;
    }
    return {
        tier,
        multiplier,
        totalSpend,
        nextTierSpend
    };
});
exports.deriveCustomerTier = deriveCustomerTier;
/**
 * API wrapper to fetch customer tier details.
 */
const getCustomerTierAPI = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { customerId } = req.params;
        if (!customerId) {
            res.status(400).json({ error: 'معرف العميل مطلوب' });
            return;
        }
        const tierInfo = yield (0, exports.deriveCustomerTier)(conn, customerId);
        res.json(tierInfo);
    }
    catch (error) {
        console.error('Error fetching customer tier:', error.message);
        res.status(500).json({ error: 'خطأ في جلب بيانات مستوى العميل' });
    }
    finally {
        conn.release();
    }
});
exports.getCustomerTierAPI = getCustomerTierAPI;
/**
 * Processes referral rewards when a customer completes checkout.
 * If this is the customer's first purchase and they were referred,
 * rewards the referrer with 50 loyalty points.
 */
const processReferralReward = (conn, refereeId, orderId, userName) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // Find if this customer has a pending referral
        const [refRows] = yield conn.query(`SELECT id, referrer_id, referral_code, coupon_code 
             FROM loyalty_referrals 
             WHERE referee_id = ? AND status = 'PENDING' 
             LIMIT 1`, [refereeId]);
        if (refRows.length === 0)
            return;
        const refRecord = refRows[0];
        // Verify if this is indeed the referee's first purchase (type INVOICE_SALE, POSTED, id != current orderId)
        const [salesRows] = yield conn.query(`SELECT COUNT(*) AS saleCount 
             FROM invoices 
             WHERE partnerId = ? 
               AND type = 'INVOICE_SALE' 
               AND status != 'VOID' 
               AND id != ?`, [refereeId, orderId]);
        const saleCount = Number((_a = salesRows[0]) === null || _a === void 0 ? void 0 : _a.saleCount) || 0;
        if (saleCount > 0) {
            // Not their first sale, void the referral log to prevent fraud/bugs
            yield conn.query(`UPDATE loyalty_referrals SET status = 'VOID', completed_at = NOW() WHERE id = ?`, [refRecord.id]);
            return;
        }
        // Fetch referee's name
        const [refereeRows] = yield conn.query(`SELECT name FROM partners WHERE id = ? LIMIT 1`, [refereeId]);
        const refereeName = ((_b = refereeRows[0]) === null || _b === void 0 ? void 0 : _b.name) || refereeId;
        const now = (0, dateUtils_1.getEgyptianISOString)();
        const txId = (0, uuid_1.v4)();
        // 1. Set status to COMPLETED
        yield conn.query(`UPDATE loyalty_referrals 
             SET status = 'COMPLETED', completed_at = ? 
             WHERE id = ?`, [now, refRecord.id]);
        // 2. Award 50 points to the referrer
        const rewardPoints = 50;
        yield conn.query(`INSERT INTO loyalty_transactions (id, customerId, orderId, type, points, description, createdBy, createdAt)
             VALUES (?, ?, ?, 'EARN', ?, ?, ?, ?)`, [
            txId,
            refRecord.referrer_id,
            orderId,
            rewardPoints,
            `مكافأة إحالة عميل جديد: كسب نقاط لدعوة ${refereeName}`,
            userName,
            now
        ]);
        console.log(`🎯 [Referral] Referrer ${refRecord.referrer_id} rewarded 50 points for inviting ${refereeName}`);
    }
    catch (err) {
        console.error('⚠️ [Referral] Reward processing failed:', err.message);
    }
});
exports.processReferralReward = processReferralReward;
/**
 * API handler to retrieve referral stats for a customer.
 */
const getReferralStatsAPI = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { customerId } = req.params;
        if (!customerId) {
            res.status(400).json({ error: 'معرف العميل مطلوب' });
            return;
        }
        // Fetch partner's own referral code
        const [partnerRows] = yield conn.query(`SELECT referral_code FROM partners WHERE id = ? LIMIT 1`, [customerId]);
        const referralCode = ((_a = partnerRows[0]) === null || _a === void 0 ? void 0 : _a.referral_code) || null;
        // Fetch referral list count and completed count
        const [statsRows] = yield conn.query(`SELECT 
                COUNT(*) AS totalReferred,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pendingCount,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedCount,
                SUM(CASE WHEN status = 'COMPLETED' THEN rewarded_points ELSE 0 END) AS totalPointsEarned
             FROM loyalty_referrals 
             WHERE referrer_id = ?`, [customerId]);
        const stats = statsRows[0] || {};
        // Fetch referred friends list (referee names and statuses)
        const [friendRows] = yield conn.query(`SELECT lr.created_at, lr.status, p.name AS refereeName, p.phone AS refereePhone, lr.completed_at
             FROM loyalty_referrals lr
             JOIN partners p ON lr.referee_id = p.id
             WHERE lr.referrer_id = ?
             ORDER BY lr.created_at DESC`, [customerId]);
        res.json({
            referralCode,
            totalReferred: Number(stats.totalReferred) || 0,
            pendingCount: Number(stats.pendingCount) || 0,
            completedCount: Number(stats.completedCount) || 0,
            totalPointsEarned: Number(stats.totalPointsEarned) || 0,
            friends: friendRows
        });
    }
    catch (error) {
        console.error('Error fetching referral stats:', error.message);
        res.status(500).json({ error: 'خطأ في جلب بيانات الإحالات للعميل' });
    }
    finally {
        conn.release();
    }
});
exports.getReferralStatsAPI = getReferralStatsAPI;
/**
 * Get active fraud alerts from pos_fraud_alerts table.
 */
const getFraudAlerts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const [rows] = yield conn.query(`SELECT * FROM pos_fraud_alerts ORDER BY created_at DESC LIMIT 100`);
        res.json({ alerts: rows });
    }
    catch (error) {
        console.error('Error fetching fraud alerts:', error.message);
        res.status(500).json({ error: 'خطأ في جلب التنبيهات الأمنية' });
    }
    finally {
        conn.release();
    }
});
exports.getFraudAlerts = getFraudAlerts;
/**
 * Dismiss a specific fraud alert.
 */
const dismissFraudAlert = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        yield conn.query(`DELETE FROM pos_fraud_alerts WHERE id = ?`, [id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error dismissing fraud alert:', error.message);
        res.status(500).json({ error: 'خطأ في حذف التنبيه الأمني' });
    }
    finally {
        conn.release();
    }
});
exports.dismissFraudAlert = dismissFraudAlert;
