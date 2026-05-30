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
exports.checkAndActivateMembership = exports.updateMembershipSettings = exports.getMembershipSettings = exports.toggleMembershipSuspension = exports.unfreezeMembership = exports.freezeMembership = exports.getMembershipFreezes = exports.renewMembership = exports.deleteMembership = exports.updateMembership = exports.markMembershipPaid = exports.createMembership = exports.getMembershipById = exports.getMemberships = exports.deleteMembershipPackage = exports.updateMembershipPackage = exports.createMembershipPackage = exports.getMembershipPackages = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
const types_1 = require("../../types");
const dateEngine_1 = require("../utils/dateEngine");
const renewals_1 = require("../services/membershipEngine/renewals");
const freezes_1 = require("../services/membershipEngine/freezes");
const billing_1 = require("../services/membershipEngine/billing");
const lifecycle_1 = require("../services/membershipEngine/lifecycle");
const membershipBenefitsSync_1 = require("../utils/membershipBenefitsSync");
// --- PACKAGES ---
const getMembershipPackages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query('SELECT id, name, description, price, durationDays, includedVisits, isActive, createdAt, updatedAt, icon FROM membership_packages ORDER BY name ASC');
        // Fetch all benefits — gracefully handle missing linkedMembershipId column
        let benefitRows = [];
        try {
            const [rows] = yield conn.query(`SELECT p.linkedMembershipId as packageId, p.id, p.name as description, p.type as promoType, p.discountValue, p.discountType,
                 p.status as promoStatus, p.maxDiscountAmount,
                 r.ruleType, r.targetValue 
                 FROM promotions p 
                 LEFT JOIN promo_rules r ON p.id = r.promotionId 
                 WHERE p.linkedMembershipId IS NOT NULL`);
            benefitRows = rows;
        }
        catch (e) {
            // Column may not exist yet if migration hasn't run
            if (!((_a = e.message) === null || _a === void 0 ? void 0 : _a.includes('Unknown column')))
                throw e;
        }
        conn.release();
        const packages = rows.map(row => {
            const packageBenefits = benefitRows.filter(b => b.packageId === row.id);
            const benefitsMap = new Map();
            for (const b of packageBenefits) {
                if (!benefitsMap.has(b.id)) {
                    let targetType = 'ALL';
                    if (b.promoType === 'CATEGORY_DISCOUNT' || b.promoType === 'CATEGORY_FIXED')
                        targetType = 'CATEGORY';
                    if (b.promoType === 'PRODUCT_DISCOUNT' || b.promoType === 'PRODUCT_FIXED')
                        targetType = 'PRODUCT';
                    let type = 'DISCOUNT_PERCENT';
                    if (b.discountType === 'FIXED')
                        type = 'DISCOUNT_FIXED';
                    if (b.discountType === 'FREE_PRODUCT')
                        type = 'BUY_X_GET_Y';
                    benefitsMap.set(b.id, {
                        id: b.id,
                        description: b.description,
                        type,
                        targetType,
                        value: b.discountValue,
                        targetId: null,
                        minQty: 0,
                        minAmount: 0,
                        maxDiscount: b.maxDiscountAmount ? parseFloat(b.maxDiscountAmount) : 0,
                        daysOfWeek: null,
                        startTime: '',
                        endTime: '',
                        isActive: b.promoStatus !== 'PAUSED'
                    });
                }
                const ben = benefitsMap.get(b.id);
                if (b.ruleType === 'CATEGORY_IN_CART' || b.ruleType === 'PRODUCT_IN_CART') {
                    ben.targetId = b.targetValue;
                }
                if (b.ruleType === 'MIN_QTY') {
                    ben.minQty = parseInt(b.targetValue) || 0;
                }
                if (b.ruleType === 'MIN_AMOUNT') {
                    ben.minAmount = parseFloat(b.targetValue) || 0;
                }
                if (b.ruleType === 'DAY_OF_WEEK') {
                    ben.daysOfWeek = b.targetValue.split(',').map(Number);
                }
                if (b.ruleType === 'TIME_RANGE') {
                    const [start, end] = b.targetValue.split('-');
                    ben.startTime = start || '';
                    ben.endTime = end || '';
                }
            }
            return Object.assign(Object.assign({}, row), { isActive: !!row.isActive, benefits: Array.from(benefitsMap.values()) });
        });
        // Map and append virtual regular package benefits
        const regularPkgBenefits = benefitRows.filter(b => b.packageId === 'regular-package');
        const regularBenefitsMap = new Map();
        for (const b of regularPkgBenefits) {
            if (!regularBenefitsMap.has(b.id)) {
                let targetType = 'ALL';
                if (b.promoType === 'CATEGORY_DISCOUNT' || b.promoType === 'CATEGORY_FIXED')
                    targetType = 'CATEGORY';
                if (b.promoType === 'PRODUCT_DISCOUNT' || b.promoType === 'PRODUCT_FIXED')
                    targetType = 'PRODUCT';
                let type = 'DISCOUNT_PERCENT';
                if (b.discountType === 'FIXED')
                    type = 'DISCOUNT_FIXED';
                if (b.discountType === 'FREE_PRODUCT')
                    type = 'BUY_X_GET_Y';
                regularBenefitsMap.set(b.id, {
                    id: b.id,
                    description: b.description,
                    type,
                    targetType,
                    value: b.discountValue,
                    targetId: null,
                    minQty: 0,
                    minAmount: 0,
                    maxDiscount: b.maxDiscountAmount ? parseFloat(b.maxDiscountAmount) : 0,
                    daysOfWeek: null,
                    startTime: '',
                    endTime: '',
                    isActive: b.promoStatus !== 'PAUSED'
                });
            }
            const ben = regularBenefitsMap.get(b.id);
            if (b.ruleType === 'CATEGORY_IN_CART' || b.ruleType === 'PRODUCT_IN_CART') {
                ben.targetId = b.targetValue;
            }
            if (b.ruleType === 'MIN_QTY') {
                ben.minQty = parseInt(b.targetValue) || 0;
            }
            if (b.ruleType === 'MIN_AMOUNT') {
                ben.minAmount = parseFloat(b.targetValue) || 0;
            }
            if (b.ruleType === 'DAY_OF_WEEK') {
                ben.daysOfWeek = b.targetValue.split(',').map(Number);
            }
            if (b.ruleType === 'TIME_RANGE') {
                const [start, end] = b.targetValue.split('-');
                ben.startTime = start || '';
                ben.endTime = end || '';
            }
        }
        packages.push({
            id: 'regular-package',
            name: 'العضوية العادية (بدون اشتراك)',
            description: 'العملاء الذين لا يملكون اشتراكاً نشطاً',
            price: 0,
            durationDays: 0,
            includedVisits: null,
            isActive: true,
            benefits: Array.from(regularBenefitsMap.values())
        });
        res.json(packages);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetching membership packages');
    }
});
exports.getMembershipPackages = getMembershipPackages;
const createMembershipPackage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, description, price, durationDays, includedVisits, isActive, benefits, icon } = req.body;
        const userName = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        const id = (0, crypto_1.randomUUID)();
        const finalDuration = durationDays || 0;
        const finalVisits = includedVisits !== undefined ? includedVisits : null;
        const finalIsActive = isActive !== undefined ? isActive : true;
        const conn = yield (0, db_1.getConnection)();
        yield conn.query('INSERT INTO membership_packages (id, name, description, price, durationDays, includedVisits, isActive, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, name, description || null, price, finalDuration, finalVisits, finalIsActive, icon || null]);
        if (benefits && benefits.length > 0) {
            yield (0, membershipBenefitsSync_1.syncPackageBenefits)(conn, id, benefits, userName);
        }
        conn.release();
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'membership_packages', updatedBy: 'System' });
        res.status(201).json({ id, name, description, price, durationDays: finalDuration, includedVisits: finalVisits, isActive: finalIsActive, benefits });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'creating membership package');
    }
});
exports.createMembershipPackage = createMembershipPackage;
const updateMembershipPackage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { name, description, price, durationDays, includedVisits, isActive, benefits, icon } = req.body;
        const userName = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        const finalDuration = durationDays || 0;
        const finalVisits = includedVisits !== undefined ? includedVisits : null;
        const finalIsActive = isActive !== undefined ? isActive : true;
        const conn = yield (0, db_1.getConnection)();
        yield conn.query('UPDATE membership_packages SET name = ?, description = ?, price = ?, durationDays = ?, includedVisits = ?, isActive = ?, icon = ? WHERE id = ?', [name, description || null, price, finalDuration, finalVisits, finalIsActive, icon || null, id]);
        yield (0, membershipBenefitsSync_1.syncPackageBenefits)(conn, id, benefits || [], userName);
        conn.release();
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'membership_packages', updatedBy: 'System' });
        res.json({ id, name, description, price, durationDays: finalDuration, includedVisits: finalVisits, isActive: finalIsActive, benefits, icon });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'updating membership package');
    }
});
exports.updateMembershipPackage = updateMembershipPackage;
const deleteMembershipPackage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        if (id === 'regular-package') {
            conn.release();
            return res.status(400).json({ message: 'لا يمكن حذف العضوية العادية الافتراضية.' });
        }
        // Check if package is used
        const [memberships] = yield conn.query('SELECT id FROM memberships WHERE packageId = ? LIMIT 1', [id]);
        if (memberships.length > 0) {
            conn.release();
            return res.status(400).json({ message: 'لا يمكن حذف هذه الباقة لارتباطها باشتراكات حالية.' });
        }
        yield conn.query('DELETE FROM membership_packages WHERE id = ?', [id]);
        conn.release();
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'membership_packages', entityId: id, deletedBy: 'System' });
        res.json({ message: 'تم حذف الباقة بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleting membership package');
    }
});
exports.deleteMembershipPackage = deleteMembershipPackage;
// --- MEMBERSHIPS ---
const getMemberships = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { search, status, customerId, page = 1, limit = 25 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        let query = `
            SELECT m.*, p.name as customerName, pk.name as packageName, pk.durationDays, pk.price 
            FROM memberships m
            LEFT JOIN partners p ON m.customerId = p.id
            LEFT JOIN membership_packages pk ON m.packageId = pk.id
            WHERE 1=1
        `;
        const queryParams = [];
        if (status) {
            query += ` AND m.status = ?`;
            queryParams.push(status);
        }
        if (customerId) {
            query += ` AND m.customerId = ?`;
            queryParams.push(customerId);
        }
        if (search) {
            query += ` AND (p.name LIKE ? OR m.id LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`);
        }
        const countQuery = `SELECT COUNT(*) as total FROM (${query}) as count_table`;
        query += ` ORDER BY m.createdAt DESC LIMIT ? OFFSET ?`;
        queryParams.push(Number(limit), offset);
        const conn = yield (0, db_1.getConnection)();
        const [countRows] = yield conn.query(countQuery, queryParams.slice(0, -2));
        const totalItems = countRows[0].total;
        const totalPages = Math.ceil(totalItems / Number(limit));
        let [rows] = yield conn.query(query, queryParams);
        let finalTotalItems = totalItems;
        let finalTotalPages = totalPages;
        if (customerId) {
            const hasActiveOrPending = rows.some(m => m.status && ['ACTIVE', 'FROZEN', 'PENDING_PAYMENT'].includes(m.status.toUpperCase()));
            if (!hasActiveOrPending && (!status || (typeof status === 'string' && status.toUpperCase() === 'ACTIVE'))) {
                const [customerRows] = yield conn.query('SELECT name, phone FROM partners WHERE id = ?', [customerId]);
                if (customerRows.length > 0) {
                    const virtualMembership = {
                        id: `regular-membership-${customerId}`,
                        customerId,
                        customerName: customerRows[0].name,
                        customerPhone: customerRows[0].phone,
                        packageId: 'regular-package',
                        packageName: 'عضوية عادية',
                        description: 'عضوية عادية افتراضية للعميل',
                        joinDate: new Date().toISOString().split('T')[0],
                        endDate: null,
                        status: 'ACTIVE',
                        includedVisits: null,
                        remainingVisits: null,
                        durationDays: null,
                        price: 0,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    rows = [...rows, virtualMembership];
                    if (totalItems === 0) {
                        finalTotalItems = 1;
                        finalTotalPages = 1;
                    }
                }
            }
        }
        conn.release();
        res.json({
            memberships: rows,
            pagination: {
                totalItems: finalTotalItems,
                totalPages: finalTotalPages,
                currentPage: Number(page),
                limit: Number(limit)
            }
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetching memberships');
    }
});
exports.getMemberships = getMemberships;
const getMembershipById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (id.startsWith('regular-membership-')) {
            const customerId = id.replace('regular-membership-', '');
            const conn = yield (0, db_1.getConnection)();
            const [customerRows] = yield conn.query('SELECT name, phone FROM partners WHERE id = ?', [customerId]);
            conn.release();
            if (customerRows.length === 0) {
                return res.status(404).json({ message: 'العميل غير موجود' });
            }
            return res.json({
                id,
                customerId,
                customerName: customerRows[0].name,
                customerPhone: customerRows[0].phone,
                packageId: 'regular-package',
                packageName: 'عضوية عادية',
                description: 'عضوية عادية افتراضية للعميل',
                status: 'ACTIVE',
                joinDate: new Date().toISOString().split('T')[0],
                endDate: null,
                remainingVisits: null,
                includedVisits: null,
                durationDays: null,
                price: 0,
                freezePeriods: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query(`
            SELECT m.*, p.name as customerName, pk.name as packageName, pk.durationDays, pk.price 
            FROM memberships m
            LEFT JOIN partners p ON m.customerId = p.id
            LEFT JOIN membership_packages pk ON m.packageId = pk.id
            WHERE m.id = ?
        `, [id]);
        if (rows.length === 0) {
            conn.release();
            return res.status(404).json({ message: 'الاشتراك غير موجود' });
        }
        const membership = rows[0];
        const [freezePeriods] = yield conn.query('SELECT * FROM membership_freeze_periods WHERE membershipId = ? ORDER BY freezeStart ASC', [id]);
        membership.freezePeriods = freezePeriods;
        conn.release();
        res.json(membership);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetching membership by id');
    }
});
exports.getMembershipById = getMembershipById;
const createMembership = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { customerId, packageId, description, joinDate, isPaid, treasuryAccountId } = req.body;
        const id = (0, crypto_1.randomUUID)();
        const conn = yield (0, db_1.getConnection)();
        yield conn.beginTransaction();
        try {
            const [packages] = yield conn.query('SELECT * FROM membership_packages WHERE id = ?', [packageId]);
            if (packages.length === 0)
                throw new Error('الباقة غير موجودة');
            const pkg = packages[0];
            const endDate = dateEngine_1.DateEngine.addDays(joinDate, pkg.durationDays).format('YYYY-MM-DD');
            const initialStatus = isPaid ? types_1.MembershipStatus.ACTIVE : types_1.MembershipStatus.PENDING_PAYMENT;
            yield conn.query(`
                INSERT INTO memberships (id, customerId, packageId, description, joinDate, endDate, status, includedVisits, remainingVisits)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [id, customerId, packageId, description || null, joinDate, endDate, initialStatus, pkg.includedVisits, pkg.includedVisits]);
            // Get customer name for invoice
            const [customers] = yield conn.query('SELECT name FROM partners WHERE id = ?', [customerId]);
            const customerName = customers.length > 0 ? customers[0].name : 'Unknown';
            // Generate invoice to hit the statement, and auto-generate receipt if paid
            yield billing_1.MembershipBilling.generateInvoice(id, customerId, customerName, packageId, req.body.createdBy || 'System', conn, isPaid, treasuryAccountId);
            yield lifecycle_1.MembershipLifecycle.addLog(id, 'Created', `Membership created with status ${initialStatus}`, req.body.createdBy || 'System', null, conn);
            yield conn.commit();
            conn.release();
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'memberships', updatedBy: 'System' });
            res.status(201).json({ id, customerId, packageId, status: initialStatus });
        }
        catch (err) {
            yield conn.rollback();
            conn.release();
            throw err;
        }
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'creating membership');
    }
});
exports.createMembership = createMembership;
const markMembershipPaid = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const userId = req.body.createdBy || 'System';
        const result = yield lifecycle_1.MembershipLifecycle.changeStatus(id, types_1.MembershipStatus.ACTIVE, 'Payment Received', 'Membership marked as paid manually', userId);
        res.json(Object.assign({ message: 'تم سداد الاشتراك وتفعيله بنجاح' }, result));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'marking membership paid');
    }
});
exports.markMembershipPaid = markMembershipPaid;
const updateMembership = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { description, endDate } = req.body;
        const conn = yield (0, db_1.getConnection)();
        yield conn.query('UPDATE memberships SET description = ?, endDate = ? WHERE id = ?', [description || null, endDate, id]);
        conn.release();
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'memberships', updatedBy: 'System' });
        res.json({ id, description, endDate });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'updating membership');
    }
});
exports.updateMembership = updateMembership;
const deleteMembership = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        const [memberships] = yield conn.query('SELECT invoiceId FROM memberships WHERE id = ?', [id]);
        if (memberships.length > 0 && memberships[0].invoiceId) {
            const [invoices] = yield conn.query('SELECT status FROM invoices WHERE id = ?', [memberships[0].invoiceId]);
            if (invoices.length > 0 && invoices[0].status === types_1.InvoiceStatus.PAID) {
                conn.release();
                return res.status(400).json({ message: 'لا يمكن حذف اشتراك الفاتورة الخاصة به مدفوعة.' });
            }
            // Delete invoice
            yield conn.query('DELETE FROM invoices WHERE id = ?', [memberships[0].invoiceId]);
        }
        yield conn.query('DELETE FROM memberships WHERE id = ?', [id]);
        conn.release();
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'memberships', entityId: id, deletedBy: 'System' });
        res.json({ message: 'تم الحذف بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleting membership');
    }
});
exports.deleteMembership = deleteMembership;
const renewMembership = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { packageId, joinDate } = req.body;
        const userId = req.body.createdBy || 'System';
        const result = yield renewals_1.MembershipRenewals.renewMembership(id, packageId, joinDate, userId);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'memberships', updatedBy: userId });
        res.json(Object.assign({ message: 'تم التجديد بنجاح، يرجى سداد الفاتورة للتفعيل' }, result));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'renewing membership');
    }
});
exports.renewMembership = renewMembership;
// --- FREEZE PERIODS LIST ---
const getMembershipFreezes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page = 1, limit = 25 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const conn = yield (0, db_1.getConnection)();
        const [countRows] = yield conn.query(`SELECT COUNT(*) as total FROM membership_freeze_periods`);
        const total = countRows[0].total;
        const [rows] = yield conn.query(`SELECT fp.*, m.customerId, p.name as customerName, pk.name as packageName
             FROM membership_freeze_periods fp
             LEFT JOIN memberships m ON fp.membershipId = m.id
             LEFT JOIN partners p ON m.customerId = p.id
             LEFT JOIN membership_packages pk ON m.packageId = pk.id
             ORDER BY fp.freezeStart DESC
             LIMIT ? OFFSET ?`, [Number(limit), offset]);
        conn.release();
        res.json({
            freezes: rows,
            pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) }
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetching membership freezes');
    }
});
exports.getMembershipFreezes = getMembershipFreezes;
const freezeMembership = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { freezeEnd, reason } = req.body;
        const userId = req.body.createdBy || 'System';
        const result = yield freezes_1.MembershipFreezes.freezeMembership(id, reason, freezeEnd, userId);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'memberships', updatedBy: userId });
        res.status(201).json(result);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'freezing membership');
    }
});
exports.freezeMembership = freezeMembership;
const unfreezeMembership = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const userId = req.body.createdBy || 'System';
        const result = yield freezes_1.MembershipFreezes.unfreezeMembership(id, userId);
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'memberships', updatedBy: userId });
        res.json(result);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'unfreezing membership');
    }
});
exports.unfreezeMembership = unfreezeMembership;
const toggleMembershipSuspension = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { suspend } = req.body;
        const conn = yield (0, db_1.getConnection)();
        yield conn.query('UPDATE memberships SET status = ? WHERE id = ?', [suspend ? 'suspended' : 'active', id]);
        conn.release();
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'memberships', updatedBy: 'System' });
        res.json({ message: suspend ? 'تم تجميد الاشتراك' : 'تم تفعيل الاشتراك' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'toggling membership suspension');
    }
});
exports.toggleMembershipSuspension = toggleMembershipSuspension;
// --- SETTINGS ---
const getMembershipSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query('SELECT * FROM membership_settings WHERE id = 1');
        conn.release();
        if (rows.length === 0) {
            return res.json({ gracePeriodDays: 0, attendanceAllowedFor: 'active_only', createDraftInvoices: false });
        }
        // ensure boolean conversion
        const settings = Object.assign(Object.assign({}, rows[0]), { createDraftInvoices: !!rows[0].createDraftInvoices });
        res.json(settings);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetching membership settings');
    }
});
exports.getMembershipSettings = getMembershipSettings;
const updateMembershipSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gracePeriodDays, attendanceAllowedFor, createDraftInvoices } = req.body;
        const conn = yield (0, db_1.getConnection)();
        yield conn.query(`INSERT INTO membership_settings (id, gracePeriodDays, attendanceAllowedFor, createDraftInvoices) 
             VALUES (1, ?, ?, ?)
             ON DUPLICATE KEY UPDATE gracePeriodDays = VALUES(gracePeriodDays), 
                                     attendanceAllowedFor = VALUES(attendanceAllowedFor), 
                                     createDraftInvoices = VALUES(createDraftInvoices)`, [gracePeriodDays, attendanceAllowedFor, createDraftInvoices]);
        conn.release();
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'membership_settings', updatedBy: 'System' });
        res.json({ gracePeriodDays, attendanceAllowedFor, createDraftInvoices });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'updating membership settings');
    }
});
exports.updateMembershipSettings = updateMembershipSettings;
// --- PAYMENT HOOK ---
const checkAndActivateMembership = (invoiceId, conn) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield billing_1.MembershipBilling.handleInvoicePaid(invoiceId, conn);
    }
    catch (err) {
        console.error('Error activating membership on payment:', err);
    }
});
exports.checkAndActivateMembership = checkAndActivateMembership;
