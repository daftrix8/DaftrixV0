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
exports.getPartnerInstallments = exports.cancelInstallmentPlan = exports.getInstallmentStats = exports.getUpcomingInstallments = exports.getOverdueInstallments = exports.payInstallment = exports.createInstallmentPlan = exports.getInstallmentPlan = exports.getInstallmentPlans = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
// ============================================
// INSTALLMENT PLANS - خطط التقسيط
// ============================================
/**
 * Get all installment plans with optional filters
 */
const getInstallmentPlans = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authReq = req;
        const { status, partnerId, startDate, endDate } = req.query;
        let query = `
            SELECT 
                ip.*,
                i.id as invoiceNumber,
                i.type as invoiceType,
                (SELECT COUNT(*) FROM installments WHERE planId = ip.id) as totalInstallments,
                (SELECT COUNT(*) FROM installments WHERE planId = ip.id AND status = 'PAID') as paidInstallments,
                (SELECT SUM(paidAmount) FROM installments WHERE planId = ip.id) as totalPaid
            FROM installment_plans ip
            LEFT JOIN invoices i ON ip.invoiceId = i.id
            WHERE 1=1
        `;
        const params = [];
        // ═══════════════════════════════════════════
        // MANDATORY: Fiscal Year Hard Boundary
        // ═══════════════════════════════════════════
        if (authReq.fiscalYearFilter) {
            query += ' AND ip.startDate >= ? AND ip.startDate <= ?';
            params.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        if (status) {
            query += ' AND ip.status = ?';
            params.push(status);
        }
        if (partnerId) {
            query += ' AND ip.partnerId = ?';
            params.push(partnerId);
        }
        if (startDate) {
            query += ' AND ip.startDate >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND ip.startDate <= ?';
            params.push(endDate);
        }
        query += ' ORDER BY ip.createdAt DESC';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching installment plans:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getInstallmentPlans = getInstallmentPlans;
/**
 * Get single installment plan with its installments
 */
const getInstallmentPlan = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Get plan
        const [planRows] = yield db_1.pool.query(`SELECT ip.*, i.id as invoiceNumber, i.type as invoiceType, i.date as invoiceDate
             FROM installment_plans ip
             LEFT JOIN invoices i ON ip.invoiceId = i.id
             WHERE ip.id = ?`, [id]);
        if (!planRows[0]) {
            return res.status(404).json({ message: 'خطة التقسيط غير موجودة' });
        }
        // Get installments
        const [installments] = yield db_1.pool.query('SELECT * FROM installments WHERE planId = ? ORDER BY installmentNumber', [id]);
        res.json(Object.assign(Object.assign({}, planRows[0]), { installments }));
    }
    catch (error) {
        console.error('Error fetching installment plan:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getInstallmentPlan = getInstallmentPlan;
/**
 * Create a new installment plan
 */
const createInstallmentPlan = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { invoiceId, partnerId, partnerName, totalAmount, downPayment = 0, numberOfInstallments, intervalDays = 30, startDate, notes, createdBy } = req.body;
        // Validate required fields
        if (!invoiceId || !partnerId || !totalAmount || !numberOfInstallments || !startDate) {
            return res.status(400).json({ message: 'يرجى ملء جميع الحقول المطلوبة' });
        }
        const planId = (0, crypto_1.randomUUID)();
        const remainingAmount = totalAmount - downPayment;
        const installmentAmount = Math.round((remainingAmount / numberOfInstallments) * 100) / 100;
        // Create the plan
        yield conn.query(`INSERT INTO installment_plans 
             (id, invoiceId, partnerId, partnerName, totalAmount, downPayment, remainingAmount, numberOfInstallments, intervalDays, startDate, status, notes, createdBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`, [planId, invoiceId, partnerId, partnerName, totalAmount, downPayment, remainingAmount, numberOfInstallments, intervalDays, startDate, notes, createdBy]);
        // Create individual installments
        let currentDate = new Date(startDate);
        for (let i = 1; i <= numberOfInstallments; i++) {
            const installmentId = (0, crypto_1.randomUUID)();
            // Last installment gets any rounding difference
            let amount = installmentAmount;
            if (i === numberOfInstallments) {
                const previousTotal = installmentAmount * (numberOfInstallments - 1);
                amount = Math.round((remainingAmount - previousTotal) * 100) / 100;
            }
            yield conn.query(`INSERT INTO installments 
                 (id, planId, installmentNumber, amount, dueDate, status)
                 VALUES (?, ?, ?, ?, ?, 'PENDING')`, [installmentId, planId, i, amount, currentDate.toISOString().split('T')[0]]);
            // Move to next due date
            currentDate.setDate(currentDate.getDate() + intervalDays);
        }
        yield conn.commit();
        // Log action
        yield (0, auditController_1.logAction)(createdBy || 'System', 'INSTALLMENT', 'CREATE', `إنشاء خطة تقسيط جديدة`, `الفاتورة: ${invoiceId}, المبلغ: ${totalAmount}, عدد الأقساط: ${numberOfInstallments}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'installments', updatedBy: createdBy });
        res.status(201).json({
            message: 'تم إنشاء خطة التقسيط بنجاح',
            planId
        });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error creating installment plan:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        conn.release();
    }
});
exports.createInstallmentPlan = createInstallmentPlan;
/**
 * Pay an installment (full or partial)
 */
const payInstallment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { id } = req.params;
        const { amount, paymentMethod, paymentReference, notes, paidBy } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'يرجى إدخال مبلغ صحيح' });
        }
        // Get installment details
        const [installmentRows] = yield conn.query('SELECT * FROM installments WHERE id = ?', [id]);
        if (!installmentRows[0]) {
            return res.status(404).json({ message: 'القسط غير موجود' });
        }
        const installment = installmentRows[0];
        const remainingForInstallment = installment.amount - installment.paidAmount;
        if (amount > remainingForInstallment) {
            return res.status(400).json({ message: `المبلغ المدفوع أكبر من المتبقي (${remainingForInstallment})` });
        }
        const newPaidAmount = installment.paidAmount + amount;
        let newStatus = 'PARTIAL';
        if (newPaidAmount >= installment.amount) {
            newStatus = 'PAID';
        }
        // Update installment
        yield conn.query(`UPDATE installments 
             SET paidAmount = ?, paidDate = NOW(), status = ?, paymentMethod = ?, paymentReference = ?, notes = ?
             WHERE id = ?`, [newPaidAmount, newStatus, paymentMethod, paymentReference, notes, id]);
        // Check if all installments are paid - update plan status
        const [planRows] = yield conn.query('SELECT planId FROM installments WHERE id = ?', [id]);
        const planId = planRows[0].planId;
        const [pendingRows] = yield conn.query('SELECT COUNT(*) as pending FROM installments WHERE planId = ? AND status != "PAID"', [planId]);
        if (pendingRows[0].pending === 0) {
            yield conn.query('UPDATE installment_plans SET status = "COMPLETED" WHERE id = ?', [planId]);
        }
        yield conn.commit();
        // Log action
        yield (0, auditController_1.logAction)(paidBy || 'System', 'INSTALLMENT', 'PAYMENT', `دفع قسط`, `رقم القسط: ${installment.installmentNumber}, المبلغ: ${amount}, الطريقة: ${paymentMethod || 'نقدي'}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'installments', updatedBy: paidBy });
        res.json({
            message: 'تم تسجيل الدفعة بنجاح',
            newStatus,
            paidAmount: newPaidAmount
        });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error paying installment:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        conn.release();
    }
});
exports.payInstallment = payInstallment;
/**
 * Get overdue installments
 */
const getOverdueInstallments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const today = new Date().toISOString().split('T')[0];
        const [rows] = yield db_1.pool.query(`
            SELECT 
                i.*,
                ip.partnerName,
                ip.partnerId,
                ip.invoiceId,
                ip.totalAmount as planTotal,
                (i.amount - i.paidAmount) as remainingAmount
            FROM installments i
            JOIN installment_plans ip ON i.planId = ip.id
            WHERE i.dueDate < ? AND i.status NOT IN ('PAID')
            ORDER BY i.dueDate ASC
        `, [today]);
        // Also update status to OVERDUE
        yield db_1.pool.query(`
            UPDATE installments 
            SET status = 'OVERDUE' 
            WHERE dueDate < ? AND status = 'PENDING'
        `, [today]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching overdue installments:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getOverdueInstallments = getOverdueInstallments;
/**
 * Get upcoming installments (due in next N days)
 */
const getUpcomingInstallments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const days = parseInt(req.query.days) || 7;
        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + days);
        const [rows] = yield db_1.pool.query(`
            SELECT 
                i.*,
                ip.partnerName,
                ip.partnerId,
                ip.invoiceId,
                (i.amount - i.paidAmount) as remainingAmount
            FROM installments i
            JOIN installment_plans ip ON i.planId = ip.id
            WHERE i.dueDate BETWEEN ? AND ? AND i.status NOT IN ('PAID')
            ORDER BY i.dueDate ASC
        `, [today.toISOString().split('T')[0], futureDate.toISOString().split('T')[0]]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching upcoming installments:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getUpcomingInstallments = getUpcomingInstallments;
/**
 * Get installment statistics/dashboard
 */
const getInstallmentStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const today = new Date().toISOString().split('T')[0];
        // Active plans count
        const [activePlans] = yield db_1.pool.query('SELECT COUNT(*) as count FROM installment_plans WHERE status = "ACTIVE"');
        // Total receivable from installments
        const [receivable] = yield db_1.pool.query(`
            SELECT SUM(i.amount - i.paidAmount) as total 
            FROM installments i
            JOIN installment_plans ip ON i.planId = ip.id
            WHERE ip.status = 'ACTIVE' AND i.status != 'PAID'
        `);
        // Overdue count and amount
        const [overdue] = yield db_1.pool.query(`
            SELECT COUNT(*) as count, SUM(i.amount - i.paidAmount) as amount
            FROM installments i
            JOIN installment_plans ip ON i.planId = ip.id
            WHERE i.dueDate < ? AND i.status NOT IN ('PAID') AND ip.status = 'ACTIVE'
        `, [today]);
        // Due today
        const [dueToday] = yield db_1.pool.query(`
            SELECT COUNT(*) as count, SUM(i.amount - i.paidAmount) as amount
            FROM installments i
            JOIN installment_plans ip ON i.planId = ip.id
            WHERE i.dueDate = ? AND i.status NOT IN ('PAID') AND ip.status = 'ACTIVE'
        `, [today]);
        // Collected this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        const [collectedThisMonth] = yield db_1.pool.query(`
            SELECT SUM(paidAmount) as total
            FROM installments
            WHERE paidDate >= ? AND paidAmount > 0
        `, [startOfMonth.toISOString().split('T')[0]]);
        res.json({
            activePlans: activePlans[0].count || 0,
            totalReceivable: receivable[0].total || 0,
            overdueCount: overdue[0].count || 0,
            overdueAmount: overdue[0].amount || 0,
            dueTodayCount: dueToday[0].count || 0,
            dueTodayAmount: dueToday[0].amount || 0,
            collectedThisMonth: collectedThisMonth[0].total || 0
        });
    }
    catch (error) {
        console.error('Error fetching installment stats:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getInstallmentStats = getInstallmentStats;
/**
 * Cancel an installment plan
 */
const cancelInstallmentPlan = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { id } = req.params;
        const { reason, cancelledBy } = req.body;
        // Check if plan exists
        const [planRows] = yield conn.query('SELECT * FROM installment_plans WHERE id = ?', [id]);
        if (!planRows[0]) {
            return res.status(404).json({ message: 'خطة التقسيط غير موجودة' });
        }
        // Update plan status
        yield conn.query('UPDATE installment_plans SET status = "CANCELLED", notes = CONCAT(IFNULL(notes, ""), "\n[إلغاء]: ", ?) WHERE id = ?', [reason || 'تم الإلغاء', id]);
        yield conn.commit();
        // Log action
        yield (0, auditController_1.logAction)(cancelledBy || 'System', 'INSTALLMENT', 'CANCEL', `إلغاء خطة تقسيط`, `السبب: ${reason || 'غير محدد'}`);
        res.json({ message: 'تم إلغاء خطة التقسيط' });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error cancelling installment plan:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        conn.release();
    }
});
exports.cancelInstallmentPlan = cancelInstallmentPlan;
/**
 * Get installments by partner
 */
const getPartnerInstallments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { partnerId } = req.params;
        const [plans] = yield db_1.pool.query(`
            SELECT 
                ip.*,
                i.id as invoiceNumber,
                (SELECT COUNT(*) FROM installments WHERE planId = ip.id) as totalInstallments,
                (SELECT COUNT(*) FROM installments WHERE planId = ip.id AND status = 'PAID') as paidInstallments,
                (SELECT SUM(amount - paidAmount) FROM installments WHERE planId = ip.id AND status != 'PAID') as remaining
            FROM installment_plans ip
            LEFT JOIN invoices i ON ip.invoiceId = i.id
            WHERE ip.partnerId = ?
            ORDER BY ip.createdAt DESC
        `, [partnerId]);
        res.json(plans);
    }
    catch (error) {
        console.error('Error fetching partner installments:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getPartnerInstallments = getPartnerInstallments;
