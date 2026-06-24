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
exports.deleteTermsAndConditions = exports.updateTermsAndConditions = exports.createTermsAndConditions = exports.getTermsAndConditions = exports.checkCreditLimit = exports.generatePaymentSchedule = exports.getPaymentSchedule = exports.deletePaymentTermsTemplate = exports.updatePaymentTermsTemplate = exports.createPaymentTermsTemplate = exports.getPaymentTermsTemplates = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
// ═══════════════════════════════════════════════════════════
// PAYMENT TERMS TEMPLATES
// ═══════════════════════════════════════════════════════════
const getPaymentTermsTemplates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const [rows] = yield conn.query(`
            SELECT t.*, 
                (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'id', d.id, 'description', d.description,
                    'dueDateBasedOn', d.dueDateBasedOn, 'creditDays', d.creditDays,
                    'creditMonths', d.creditMonths, 'paymentPercentage', d.paymentPercentage,
                    'sortOrder', d.sortOrder
                )) FROM payment_terms_template_details d WHERE d.templateId = t.id ORDER BY d.sortOrder) as terms
            FROM payment_terms_templates t
            WHERE t.isActive = 1
            ORDER BY t.isDefault DESC, t.name
        `);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'payment terms templates');
    }
});
exports.getPaymentTermsTemplates = getPaymentTermsTemplates;
const createPaymentTermsTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { name, description, isDefault, terms } = req.body;
        if (!name)
            return res.status(400).json({ error: 'اسم القالب مطلوب' });
        const id = (0, crypto_1.randomUUID)();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        yield conn.beginTransaction();
        // Unset other defaults if this is default
        if (isDefault) {
            yield conn.query('UPDATE payment_terms_templates SET isDefault = 0');
        }
        yield conn.query('INSERT INTO payment_terms_templates (id, name, description, isDefault) VALUES (?, ?, ?, ?)', [id, name, description || null, isDefault ? 1 : 0]);
        // Insert term details
        if (Array.isArray(terms) && terms.length > 0) {
            // Validate total percentage = 100
            const totalPct = terms.reduce((sum, t) => sum + (parseFloat(t.paymentPercentage) || 0), 0);
            if (Math.abs(totalPct - 100) > 0.01) {
                yield conn.rollback();
                conn.release();
                return res.status(400).json({ error: `مجموع النسب يجب أن يساوي 100% (الحالي: ${totalPct}%)` });
            }
            for (let i = 0; i < terms.length; i++) {
                const t = terms[i];
                yield conn.query(`INSERT INTO payment_terms_template_details 
                    (id, templateId, description, dueDateBasedOn, creditDays, creditMonths, paymentPercentage, sortOrder)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), id, t.description || '', t.dueDateBasedOn || 'invoice_date',
                    t.creditDays || 0, t.creditMonths || 0, t.paymentPercentage || 100, i]);
            }
        }
        yield conn.commit();
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'CREATE_PAYMENT_TERMS', `إنشاء قالب شروط الدفع: ${name}`, `الاسم: ${name}`);
        }
        catch (_b) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'payment-terms', updatedBy: user });
        res.status(201).json({ id, name, description, isDefault, terms });
    }
    catch (error) {
        try {
            yield conn.rollback();
        }
        catch (_c) { }
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'payment terms template');
    }
});
exports.createPaymentTermsTemplate = createPaymentTermsTemplate;
const updatePaymentTermsTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const { name, description, isDefault, terms } = req.body;
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        yield conn.beginTransaction();
        if (isDefault) {
            yield conn.query('UPDATE payment_terms_templates SET isDefault = 0');
        }
        yield conn.query('UPDATE payment_terms_templates SET name = ?, description = ?, isDefault = ? WHERE id = ?', [name, description || null, isDefault ? 1 : 0, id]);
        // Replace term details
        yield conn.query('DELETE FROM payment_terms_template_details WHERE templateId = ?', [id]);
        if (Array.isArray(terms) && terms.length > 0) {
            const totalPct = terms.reduce((sum, t) => sum + (parseFloat(t.paymentPercentage) || 0), 0);
            if (Math.abs(totalPct - 100) > 0.01) {
                yield conn.rollback();
                conn.release();
                return res.status(400).json({ error: `مجموع النسب يجب أن يساوي 100% (الحالي: ${totalPct}%)` });
            }
            for (let i = 0; i < terms.length; i++) {
                const t = terms[i];
                yield conn.query(`INSERT INTO payment_terms_template_details 
                    (id, templateId, description, dueDateBasedOn, creditDays, creditMonths, paymentPercentage, sortOrder)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), id, t.description || '', t.dueDateBasedOn || 'invoice_date',
                    t.creditDays || 0, t.creditMonths || 0, t.paymentPercentage || 100, i]);
            }
        }
        yield conn.commit();
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'UPDATE_PAYMENT_TERMS', `تحديث قالب شروط الدفع: ${name}`, `الاسم: ${name}`);
        }
        catch (_b) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'payment-terms', updatedBy: user });
        res.json({ id, name, description, isDefault, terms });
    }
    catch (error) {
        try {
            yield conn.rollback();
        }
        catch (_c) { }
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'payment terms template');
    }
});
exports.updatePaymentTermsTemplate = updatePaymentTermsTemplate;
const deletePaymentTermsTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        // Check usage in partners
        const [usage] = yield conn.query('SELECT COUNT(*) as count FROM partners WHERE paymentTermsTemplateId = ?', [id]);
        if (((_b = usage[0]) === null || _b === void 0 ? void 0 : _b.count) > 0) {
            conn.release();
            return res.status(400).json({ error: `لا يمكن حذف القالب لأنه مستخدم في ${usage[0].count} عميل/مورد` });
        }
        const [row] = yield conn.query('SELECT name FROM payment_terms_templates WHERE id = ?', [id]);
        const templateName = ((_c = row[0]) === null || _c === void 0 ? void 0 : _c.name) || id;
        yield conn.query('DELETE FROM payment_terms_templates WHERE id = ?', [id]);
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'DELETE_PAYMENT_TERMS', `حذف قالب شروط الدفع: ${templateName}`, `المعرف: ${id}`);
        }
        catch (_d) { }
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'payment-terms', entityId: id, deletedBy: user });
        res.json({ message: 'تم حذف قالب شروط الدفع بنجاح' });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'payment terms template');
    }
});
exports.deletePaymentTermsTemplate = deletePaymentTermsTemplate;
// ═══════════════════════════════════════════════════════════
// PAYMENT SCHEDULE (applied to invoices)
// ═══════════════════════════════════════════════════════════
const getPaymentSchedule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { invoiceId } = req.params;
        const [rows] = yield conn.query('SELECT * FROM payment_schedule WHERE invoiceId = ? ORDER BY dueDate', [invoiceId]);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'payment schedule');
    }
});
exports.getPaymentSchedule = getPaymentSchedule;
/** Generate payment schedule from a template for a given invoice */
const generatePaymentSchedule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { invoiceId, templateId, invoiceDate, invoiceTotal, invoiceType } = req.body;
        if (!invoiceId || !templateId || !invoiceDate || invoiceTotal === undefined) {
            conn.release();
            return res.status(400).json({ error: 'بيانات ناقصة: invoiceId, templateId, invoiceDate, invoiceTotal مطلوبة' });
        }
        const [terms] = yield conn.query('SELECT * FROM payment_terms_template_details WHERE templateId = ? ORDER BY sortOrder', [templateId]);
        if (!Array.isArray(terms) || terms.length === 0) {
            conn.release();
            return res.status(404).json({ error: 'لم يتم العثور على شروط الدفع' });
        }
        // Delete existing schedule for this invoice
        yield conn.query('DELETE FROM payment_schedule WHERE invoiceId = ?', [invoiceId]);
        const total = parseFloat(invoiceTotal);
        const baseDate = new Date(invoiceDate);
        const scheduleRows = [];
        for (const term of terms) {
            const pct = parseFloat(term.paymentPercentage) || 0;
            const paymentAmount = Math.round((total * pct / 100) * 100) / 100;
            let dueDate = new Date(baseDate);
            if (term.dueDateBasedOn === 'month_end') {
                dueDate.setMonth(dueDate.getMonth() + (term.creditMonths || 0) + 1, 0);
            }
            else {
                dueDate.setDate(dueDate.getDate() + (term.creditDays || 0));
                dueDate.setMonth(dueDate.getMonth() + (term.creditMonths || 0));
            }
            const scheduleId = (0, crypto_1.randomUUID)();
            const dueDateStr = dueDate.toISOString().split('T')[0];
            yield conn.query(`INSERT INTO payment_schedule 
                (id, invoiceId, invoiceType, dueDate, invoiceAmount, paymentPercentage, paymentAmount, outstanding, status, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?)`, [scheduleId, invoiceId, invoiceType || 'SALE', dueDateStr, total, pct, paymentAmount, paymentAmount, term.description || '']);
            scheduleRows.push({ id: scheduleId, dueDate: dueDateStr, paymentPercentage: pct, paymentAmount, outstanding: paymentAmount, status: 'unpaid' });
        }
        conn.release();
        res.json(scheduleRows);
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'generate payment schedule');
    }
});
exports.generatePaymentSchedule = generatePaymentSchedule;
// ═══════════════════════════════════════════════════════════
// CUSTOMER CREDIT LIMIT
// ═══════════════════════════════════════════════════════════
const checkCreditLimit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { partnerId, additionalAmount } = req.body;
        if (!partnerId) {
            conn.release();
            return res.status(400).json({ error: 'معرف العميل مطلوب' });
        }
        // Get partner credit limit
        const [partner] = yield conn.query('SELECT id, name, creditLimit, creditLimitEnabled FROM partners WHERE id = ?', [partnerId]);
        if (!Array.isArray(partner) || partner.length === 0) {
            conn.release();
            return res.status(404).json({ error: 'العميل غير موجود' });
        }
        const p = partner[0];
        if (!p.creditLimitEnabled || !p.creditLimit || p.creditLimit <= 0) {
            conn.release();
            return res.json({ allowed: true, creditLimit: 0, currentBalance: 0, message: 'لا يوجد حد ائتمان' });
        }
        // Calculate current outstanding balance from transactions
        const [balance] = yield conn.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN type IN ('SALE') THEN total ELSE 0 END), 0) as totalSales,
                COALESCE(SUM(CASE WHEN type IN ('RETURN_SALE') THEN total ELSE 0 END), 0) as totalReturns
            FROM invoices 
            WHERE partnerId = ? AND status != 'VOID'
        `, [partnerId]);
        const [payments] = yield conn.query(`
            SELECT COALESCE(SUM(amount), 0) as totalPaid
            FROM transactions 
            WHERE partnerId = ? AND type IN ('RECEIPT', 'PAYMENT')
        `, [partnerId]);
        const totalSales = ((_a = balance[0]) === null || _a === void 0 ? void 0 : _a.totalSales) || 0;
        const totalReturns = ((_b = balance[0]) === null || _b === void 0 ? void 0 : _b.totalReturns) || 0;
        const totalPaid = ((_c = payments[0]) === null || _c === void 0 ? void 0 : _c.totalPaid) || 0;
        const currentBalance = totalSales - totalReturns - totalPaid;
        const projectedBalance = currentBalance + (parseFloat(additionalAmount) || 0);
        conn.release();
        const isExceeded = projectedBalance > p.creditLimit;
        const availableCredit = Math.max(0, p.creditLimit - currentBalance);
        res.json({
            allowed: !isExceeded,
            creditLimit: p.creditLimit,
            currentBalance,
            projectedBalance,
            availableCredit,
            exceeded: isExceeded,
            message: isExceeded
                ? `تجاوز حد الائتمان! الحد: ${p.creditLimit.toLocaleString()}, الرصيد الحالي: ${currentBalance.toLocaleString()}`
                : `الائتمان المتاح: ${availableCredit.toLocaleString()}`
        });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'credit limit check');
    }
});
exports.checkCreditLimit = checkCreditLimit;
// ═══════════════════════════════════════════════════════════
// TERMS & CONDITIONS
// ═══════════════════════════════════════════════════════════
const getTermsAndConditions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { applicableTo } = req.query;
        let query = 'SELECT * FROM terms_and_conditions WHERE isActive = 1';
        const params = [];
        if (applicableTo && applicableTo !== 'all') {
            query += ' AND (applicableTo = ? OR applicableTo = ?)';
            params.push(applicableTo, 'all');
        }
        query += ' ORDER BY isDefault DESC, name';
        const [rows] = yield conn.query(query, params);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'terms and conditions');
    }
});
exports.getTermsAndConditions = getTermsAndConditions;
const createTermsAndConditions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { name, content, isDefault, applicableTo } = req.body;
        if (!name || !content) {
            conn.release();
            return res.status(400).json({ error: 'الاسم والمحتوى مطلوبان' });
        }
        const id = (0, crypto_1.randomUUID)();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        if (isDefault) {
            yield conn.query('UPDATE terms_and_conditions SET isDefault = 0 WHERE applicableTo = ?', [applicableTo || 'all']);
        }
        yield conn.query('INSERT INTO terms_and_conditions (id, name, content, isDefault, applicableTo) VALUES (?, ?, ?, ?, ?)', [id, name, content, isDefault ? 1 : 0, applicableTo || 'all']);
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'SETTINGS', 'CREATE_TERMS', `إنشاء شروط وأحكام: ${name}`, `الاسم: ${name}`);
        }
        catch (_b) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'terms-conditions', updatedBy: user });
        res.status(201).json({ id, name, content, isDefault, applicableTo });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'terms and conditions');
    }
});
exports.createTermsAndConditions = createTermsAndConditions;
const updateTermsAndConditions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const { name, content, isDefault, applicableTo } = req.body;
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        if (isDefault) {
            yield conn.query('UPDATE terms_and_conditions SET isDefault = 0 WHERE applicableTo = ?', [applicableTo || 'all']);
        }
        yield conn.query('UPDATE terms_and_conditions SET name = ?, content = ?, isDefault = ?, applicableTo = ? WHERE id = ?', [name, content, isDefault ? 1 : 0, applicableTo || 'all', id]);
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'SETTINGS', 'UPDATE_TERMS', `تحديث شروط وأحكام: ${name}`, `الاسم: ${name}`);
        }
        catch (_b) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'terms-conditions', updatedBy: user });
        res.json({ id, name, content, isDefault, applicableTo });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'terms and conditions');
    }
});
exports.updateTermsAndConditions = updateTermsAndConditions;
const deleteTermsAndConditions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'System';
        const [row] = yield conn.query('SELECT name FROM terms_and_conditions WHERE id = ?', [id]);
        const tcName = ((_b = row[0]) === null || _b === void 0 ? void 0 : _b.name) || id;
        yield conn.query('DELETE FROM terms_and_conditions WHERE id = ?', [id]);
        conn.release();
        try {
            yield (0, auditController_1.logAction)(user, 'SETTINGS', 'DELETE_TERMS', `حذف شروط وأحكام: ${tcName}`, `المعرف: ${id}`);
        }
        catch (_c) { }
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'terms-conditions', entityId: id, deletedBy: user });
        res.json({ message: 'تم حذف الشروط والأحكام بنجاح' });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'terms and conditions');
    }
});
exports.deleteTermsAndConditions = deleteTermsAndConditions;
