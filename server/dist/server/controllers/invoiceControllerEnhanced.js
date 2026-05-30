"use strict";
/**
 * Enhanced Invoice Controller with User-Level Data Filtering
 * This demonstrates how to implement the new policy system
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
exports.getTransferableUsers = exports.transferInvoice = exports.previewDeleteInvoice = exports.deleteInvoice = exports.updateInvoice = exports.createInvoice = exports.getInvoices = void 0;
const db_1 = require("../db");
const dataFiltering_1 = require("../utils/dataFiltering");
const errorHandler_1 = require("../utils/errorHandler");
const invoiceCascadeDelete_1 = require("../utils/invoiceCascadeDelete");
const auditController_1 = require("./auditController");
const eventBus_1 = require("../utils/eventBus");
const policyEnforcement_1 = require("../utils/policyEnforcement");
/**
 * GET /api/invoices - List invoices with user filtering
 */
const getInvoices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { userFilterOptions, systemConfig } = authReq;
        try {
            const limit = parseInt(req.query.limit) || 100;
            const offset = parseInt(req.query.offset) || 0;
            const type = req.query.type;
            const status = req.query.status;
            // Build base conditions
            let conditions = [];
            const params = [];
            if (type) {
                conditions.push('type = ?');
                params.push(type);
            }
            if (status) {
                conditions.push('status = ?');
                params.push(status);
            }
            // Build WHERE clause with user filtering
            let whereClause = '';
            if (userFilterOptions && !userFilterOptions.canSeeAll) {
                // User can only see their own invoices
                conditions.push('createdBy = ?');
                params.push(userFilterOptions.userName);
            }
            // FISCAL YEAR DATA ISOLATION — always enforce as a hard boundary
            if (authReq.fiscalYearFilter) {
                conditions.push('date >= ? AND date <= ?');
                params.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
            }
            if (conditions.length > 0) {
                whereClause = 'WHERE ' + conditions.join(' AND ');
            }
            // Get total count
            const [countResult] = yield conn.query(`SELECT COUNT(*) as total FROM invoices ${whereClause}`, params);
            const total = ((_a = countResult[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
            // Get invoices with pagination
            const [invoices] = yield conn.query(`SELECT 
                    i.*,
                    (SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', il.id,
                            'productId', il.productId,
                            'productName', il.productName,
                            'quantity', il.quantity,
                            'price', il.price,
                            'cost', il.cost,
                            'discount', il.discount,
                            'total', il.total
                        )
                    ) FROM invoice_lines il WHERE il.invoiceId = i.id) as lines
                FROM invoices i
                ${whereClause}
                ORDER BY i.date DESC
                LIMIT ? OFFSET ?`, [...params, limit, offset]);
            // Parse lines JSON
            const invoicesWithLines = invoices.map(inv => (Object.assign(Object.assign({}, inv), { lines: inv.lines ? JSON.parse(inv.lines) : [] })));
            res.json({
                invoices: invoicesWithLines,
                total,
                limit,
                offset,
                userFiltered: userFilterOptions ? !userFilterOptions.canSeeAll : false
            });
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('Error fetching invoices:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch invoices');
    }
});
exports.getInvoices = getInvoices;
/**
 * POST /api/invoices - Create invoice with policy validation
 */
const createInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { user, userFilterOptions, systemConfig } = authReq;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        try {
            const invoice = req.body;
            const currentUser = (userFilterOptions === null || userFilterOptions === void 0 ? void 0 : userFilterOptions.userName) || user.name || user.username;
            // Closed fiscal year write protection
            if (((_a = authReq.fiscalYearFilter) === null || _a === void 0 ? void 0 : _a.status) === 'CLOSED') {
                return res.status(403).json({
                    error: 'FISCAL_YEAR_CLOSED',
                    message: `السنة المالية ${authReq.fiscalYearFilter.name} مقفلة. لا يمكن إضافة فواتير جديدة.`
                });
            }
            // Permission Check
            const isSales = invoice.type === 'SALE' || invoice.type === 'RETURN_SALE';
            const permissionId = isSales ? 'sales.create' : 'purchase.create';
            if (!(0, dataFiltering_1.hasPermission)(user, permissionId)) {
                return res.status(403).json({
                    error: 'PERMISSION_DENIED',
                    message: `You do not have permission to create ${isSales ? 'sales' : 'purchase'} invoices`,
                    requiredPermission: permissionId
                });
            }
            // Validate transaction amount
            if (systemConfig && invoice.total) {
                const validation = (0, dataFiltering_1.validateTransactionAmount)(invoice.total, user.role, systemConfig);
                if (!validation.allowed) {
                    return res.status(403).json({
                        error: 'TRANSACTION_LIMIT_EXCEEDED',
                        message: validation.reason,
                        limit: ((_b = systemConfig.transactionLimits) === null || _b === void 0 ? void 0 : _b[user.role]) || 0
                    });
                }
                // Check if needs approval
                if ((0, dataFiltering_1.needsApproval)(invoice.total, systemConfig)) {
                    invoice.status = 'PENDING_APPROVAL';
                    invoice.requiresApproval = true;
                }
            }
            // === POLICY ENFORCEMENT: Full server-side validation ===
            if (systemConfig) {
                const policyContext = {
                    type: invoice.type,
                    date: invoice.date,
                    total: invoice.total,
                    partnerId: invoice.partnerId,
                    notes: invoice.notes,
                    costCenterId: invoice.costCenterId,
                    warehouseId: invoice.warehouseId,
                    currentUser: currentUser,
                    currentUserRole: user.role,
                    lines: (_c = invoice.lines) === null || _c === void 0 ? void 0 : _c.map((l) => ({
                        productId: l.productId,
                        quantity: l.quantity || 0,
                        cost: l.cost
                    }))
                };
                const policyResult = yield (0, policyEnforcement_1.validateTransactionFull)(policyContext, systemConfig);
                if (!policyResult.valid) {
                    return res.status(403).json({
                        error: policyResult.errorCode || 'POLICY_VIOLATION',
                        message: policyResult.error
                    });
                }
            }
            yield conn.beginTransaction();
            // Insert invoice with createdBy
            const [result] = yield conn.query(`INSERT INTO invoices (
                    id, date, type, partnerId, partnerName, total, status,
                    paymentMethod, posted, notes, dueDate, taxAmount, whtAmount,
                    shippingFee, globalDiscount, warehouseId, costCenterId,
                    bankAccountId, bankName, priceListId, paidAmount, salesmanId,
                    createdBy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                invoice.id,
                invoice.date,
                invoice.type,
                invoice.partnerId || null,
                invoice.partnerName || null,
                invoice.total || 0,
                invoice.status || 'DRAFT',
                invoice.paymentMethod || 'CASH',
                invoice.posted || false,
                invoice.notes || null,
                invoice.dueDate || null,
                invoice.taxAmount || 0,
                invoice.whtAmount || 0,
                invoice.shippingFee || 0,
                invoice.globalDiscount || 0,
                invoice.warehouseId || null,
                invoice.costCenterId || null,
                invoice.bankAccountId || null,
                invoice.bankName || null,
                invoice.priceListId || null,
                invoice.paidAmount || 0,
                invoice.salesmanId || null,
                currentUser // Set createdBy
            ]);
            // Insert invoice lines
            if (invoice.lines && invoice.lines.length > 0) {
                const lineValues = invoice.lines.map((line) => [
                    invoice.id,
                    line.productId,
                    line.productName,
                    line.quantity || 0,
                    line.price || 0,
                    line.cost || 0,
                    line.discount || 0,
                    line.total || 0
                ]);
                yield conn.query(`INSERT INTO invoice_lines (
                        invoiceId, productId, productName, quantity, price,
                        cost, discount, total
                    ) VALUES ?`, [lineValues]);
            }
            yield conn.commit();
            res.status(201).json(Object.assign(Object.assign({}, invoice), { createdBy: currentUser, message: invoice.requiresApproval
                    ? 'Invoice created and pending approval'
                    : 'Invoice created successfully' }));
        }
        catch (error) {
            yield conn.rollback();
            throw error;
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('Error creating invoice:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'create invoice');
    }
});
exports.createInvoice = createInvoice;
/**
 * PUT /api/invoices/:id - Update invoice with ownership check
 */
const updateInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { user, userFilterOptions } = authReq;
        const invoiceId = req.params.id;
        if (!user || !userFilterOptions) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        try {
            // Check ownership
            const [existing] = yield conn.query('SELECT createdBy FROM invoices WHERE id = ? LIMIT 1', [invoiceId]);
            const existingInvoice = existing[0];
            if (!existingInvoice) {
                return res.status(404).json({ error: 'Invoice not found' });
            }
            // Check if user can modify
            const isOwner = existingInvoice.createdBy === userFilterOptions.userName;
            const canModify = isOwner || userFilterOptions.canModifyOthers;
            if (!canModify) {
                return res.status(403).json({
                    error: 'PERMISSION_DENIED',
                    message: 'You can only modify your own invoices',
                    owner: existingInvoice.createdBy
                });
            }
            const invoice = req.body;
            // Permission Check
            const isSales = invoice.type === 'SALE' || invoice.type === 'RETURN_SALE';
            const permissionId = isSales ? 'sales.edit' : 'purchase.edit';
            if (!(0, dataFiltering_1.hasPermission)(user, permissionId)) {
                return res.status(403).json({
                    error: 'PERMISSION_DENIED',
                    message: `You do not have permission to edit ${isSales ? 'sales' : 'purchase'} invoices`,
                    requiredPermission: permissionId
                });
            }
            // Check Discount Permission
            if (isSales && (invoice.globalDiscount > 0 || ((_a = invoice.lines) === null || _a === void 0 ? void 0 : _a.some((l) => l.discount > 0)))) {
                if (!(0, dataFiltering_1.hasPermission)(user, 'sales.discount')) {
                    return res.status(403).json({
                        error: 'PERMISSION_DENIED',
                        message: 'You do not have permission to apply discounts',
                        requiredPermission: 'sales.discount'
                    });
                }
            }
            // === POLICY ENFORCEMENT: Check posted invoice edit ===
            if (authReq.systemConfig) {
                const editCheck = (0, policyEnforcement_1.validateEditPostedInvoice)(existingInvoice.posted, authReq.systemConfig);
                if (!editCheck.valid) {
                    return res.status(403).json({
                        error: editCheck.errorCode || 'POLICY_VIOLATION',
                        message: editCheck.error
                    });
                }
                // Also run full policy validation on new data
                const policyContext = {
                    type: invoice.type,
                    date: invoice.date,
                    total: invoice.total,
                    partnerId: invoice.partnerId,
                    notes: invoice.notes,
                    costCenterId: invoice.costCenterId,
                    warehouseId: invoice.warehouseId,
                    createdBy: existingInvoice.createdBy,
                    currentUser: userFilterOptions.userName,
                    currentUserRole: user.role,
                    lines: (_b = invoice.lines) === null || _b === void 0 ? void 0 : _b.map((l) => ({
                        productId: l.productId,
                        quantity: l.quantity || 0,
                        cost: l.cost
                    }))
                };
                const policyResult = yield (0, policyEnforcement_1.validateTransactionFull)(policyContext, authReq.systemConfig);
                if (!policyResult.valid) {
                    return res.status(403).json({
                        error: policyResult.errorCode || 'POLICY_VIOLATION',
                        message: policyResult.error
                    });
                }
            }
            yield conn.beginTransaction();
            // Update invoice (preserve createdBy)
            yield conn.query(`UPDATE invoices SET
                    date = ?, type = ?, partnerId = ?, partnerName = ?,
                    total = ?, status = ?, paymentMethod = ?, posted = ?,
                    notes = ?, dueDate = ?, taxAmount = ?, whtAmount = ?,
                    shippingFee = ?, globalDiscount = ?, warehouseId = ?,
                    costCenterId = ?, bankAccountId = ?, bankName = ?,
                    priceListId = ?, paidAmount = ?, salesmanId = ?
                WHERE id = ?`, [
                invoice.date,
                invoice.type,
                invoice.partnerId || null,
                invoice.partnerName || null,
                invoice.total || 0,
                invoice.status || 'DRAFT',
                invoice.paymentMethod || 'CASH',
                invoice.posted || false,
                invoice.notes || null,
                invoice.dueDate || null,
                invoice.taxAmount || 0,
                invoice.whtAmount || 0,
                invoice.shippingFee || 0,
                invoice.globalDiscount || 0,
                invoice.warehouseId || null,
                invoice.costCenterId || null,
                invoice.bankAccountId || null,
                invoice.bankName || null,
                invoice.priceListId || null,
                invoice.paidAmount || 0,
                invoice.salesmanId || null,
                invoiceId
            ]);
            // Update lines - delete and re-insert
            yield conn.query('DELETE FROM invoice_lines WHERE invoiceId = ?', [invoiceId]);
            if (invoice.lines && invoice.lines.length > 0) {
                const lineValues = invoice.lines.map((line) => [
                    invoiceId,
                    line.productId,
                    line.productName,
                    line.quantity || 0,
                    line.price || 0,
                    line.cost || 0,
                    line.discount || 0,
                    line.total || 0
                ]);
                yield conn.query(`INSERT INTO invoice_lines (
                        invoiceId, productId, productName, quantity, price,
                        cost, discount, total
                    ) VALUES ?`, [lineValues]);
            }
            yield conn.commit();
            res.json(Object.assign(Object.assign({}, invoice), { id: invoiceId, message: 'Invoice updated successfully' }));
        }
        catch (error) {
            yield conn.rollback();
            throw error;
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('Error updating invoice:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'update invoice');
    }
});
exports.updateInvoice = updateInvoice;
/**
 * DELETE /api/invoices/:id - Delete invoice with cascade (deletes linked سند قبض/صرف)
 */
const deleteInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const authReq = req;
        const { user, userFilterOptions } = authReq;
        const invoiceId = req.params.id;
        if (!user || !userFilterOptions) {
            conn.release();
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Check ownership and get invoice details
        const [existing] = yield conn.query('SELECT id, createdBy, type, number, partnerName, total FROM invoices WHERE id = ? LIMIT 1', [invoiceId]);
        const existingInvoice = existing[0];
        if (!existingInvoice) {
            conn.release();
            return res.status(404).json({ error: 'Invoice not found' });
        }
        // Check if user can delete
        const isOwner = existingInvoice.createdBy === userFilterOptions.userName;
        const canDelete = isOwner || userFilterOptions.canModifyOthers;
        if (!canDelete) {
            conn.release();
            return res.status(403).json({
                error: 'PERMISSION_DENIED',
                message: 'You can only delete your own invoices',
                owner: existingInvoice.createdBy
            });
        }
        // Permission Check (Granular)
        const isSales = ['SALE', 'RETURN_SALE', 'INVOICE_SALE', 'SALE_INVOICE'].includes(existingInvoice.type);
        const permissionId = isSales ? 'sales.delete' : 'purchase.delete';
        if (!(0, dataFiltering_1.hasPermission)(user, permissionId)) {
            conn.release();
            return res.status(403).json({
                error: 'PERMISSION_DENIED',
                message: `You do not have permission to delete ${isSales ? 'sales' : 'purchase'} invoices`,
                requiredPermission: permissionId
            });
        }
        // Get the user name for deletion
        const deletedBy = userFilterOptions.userName || user.name || user.username || 'System';
        // === POLICY ENFORCEMENT: Check posted invoice delete ===
        if (authReq.systemConfig) {
            const deleteCheck = (0, policyEnforcement_1.validateDeletePostedInvoice)(existingInvoice.posted, authReq.systemConfig);
            if (!deleteCheck.valid) {
                conn.release();
                return res.status(403).json({
                    error: deleteCheck.errorCode || 'POLICY_VIOLATION',
                    message: deleteCheck.error
                });
            }
        }
        // Start transaction for cascade delete
        yield conn.beginTransaction();
        try {
            // Use CASCADE DELETE to remove invoice + all related documents
            const cascadeResult = yield (0, invoiceCascadeDelete_1.deleteInvoiceWithCascade)(conn, invoiceId, deletedBy);
            if (!cascadeResult.success) {
                yield conn.rollback();
                conn.release();
                return res.status(500).json({
                    error: 'DELETE_FAILED',
                    message: cascadeResult.error || 'Failed to delete invoice'
                });
            }
            yield conn.commit();
            // Log the action
            yield (0, auditController_1.logAction)(deletedBy, 'INVOICE', 'DELETE', `حذف فاتورة ${existingInvoice.number || invoiceId.substring(0, 8)}`, `العميل: ${existingInvoice.partnerName || '-'} | المبلغ: ${existingInvoice.total} | ` +
                `سندات محذوفة: ${cascadeResult.deletedReceipts + cascadeResult.deletedPayments} | ` +
                `قيود محذوفة: ${cascadeResult.deletedJournals}`);
            // Broadcast real-time update
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoice', action: 'delete', updatedBy: deletedBy });
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'journal', action: 'delete', updatedBy: deletedBy });
            eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'accounts', action: 'update', updatedBy: deletedBy });
            res.json({
                message: 'Invoice deleted successfully',
                cascade: {
                    deletedReceipts: cascadeResult.deletedReceipts,
                    deletedPayments: cascadeResult.deletedPayments,
                    deletedJournals: cascadeResult.deletedJournals,
                    reversedBalances: cascadeResult.reversedBalances
                }
            });
        }
        catch (error) {
            yield conn.rollback();
            throw error;
        }
    }
    catch (error) {
        console.error('Error deleting invoice:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete invoice');
    }
    finally {
        conn.release();
    }
});
exports.deleteInvoice = deleteInvoice;
/**
 * GET /api/invoices/:id/preview-delete - Preview what will be deleted (for confirmation)
 */
const previewDeleteInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { user } = authReq;
        const invoiceId = req.params.id;
        if (!user) {
            conn.release();
            return res.status(401).json({ error: 'Unauthorized' });
        }
        try {
            const preview = yield (0, invoiceCascadeDelete_1.previewCascadeDelete)(conn, invoiceId);
            res.json({
                invoice: {
                    id: preview.invoice.id,
                    number: preview.invoice.number,
                    type: preview.invoice.type,
                    partnerName: preview.invoice.partnerName,
                    total: preview.invoice.total,
                    date: preview.invoice.date
                },
                linkedDocuments: {
                    receipts: preview.linkedReceipts.map((r) => ({
                        id: r.id,
                        number: r.number,
                        total: r.total
                    })),
                    payments: preview.linkedPayments.map((p) => ({
                        id: p.id,
                        number: p.number,
                        total: p.total
                    })),
                    journals: preview.linkedJournals.map((j) => ({
                        id: j.id,
                        description: j.description,
                        date: j.date
                    }))
                },
                totalAmount: preview.totalAmount,
                warning: preview.warning,
                confirmMessage: `هل أنت متأكد من حذف الفاتورة؟ ${preview.warning}`
            });
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('Error previewing delete:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'preview delete');
    }
});
exports.previewDeleteInvoice = previewDeleteInvoice;
/**
 * POST /api/invoices/transfer - Transfer invoice ownership to another user
 *
 * This allows cashiers to hand over their invoices to other users
 * (e.g., during shift changes, employee departures, workload redistribution)
 */
const transferInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { user, userFilterOptions } = authReq;
        const { invoiceIds, targetUserId, targetUserName, reason } = req.body;
        if (!user || !userFilterOptions) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
            return res.status(400).json({ error: 'No invoice IDs provided' });
        }
        if (!targetUserId || !targetUserName) {
            return res.status(400).json({ error: 'Target user information is required' });
        }
        const currentUser = userFilterOptions.userName || user.name || user.username;
        try {
            yield conn.beginTransaction();
            const results = [];
            for (const invoiceId of invoiceIds) {
                // Get invoice details
                const [existing] = yield conn.query('SELECT id, createdBy, type, partnerName, total FROM invoices WHERE id = ? LIMIT 1', [invoiceId]);
                const invoice = existing[0];
                if (!invoice) {
                    results.push({
                        invoiceId,
                        success: false,
                        message: 'Invoice not found'
                    });
                    continue;
                }
                // Check if user can transfer this invoice
                const isOwner = invoice.createdBy === currentUser;
                const canTransfer = isOwner || userFilterOptions.canModifyOthers;
                if (!canTransfer) {
                    results.push({
                        invoiceId,
                        success: false,
                        message: `You can only transfer your own invoices. Owner: ${invoice.createdBy}`
                    });
                    continue;
                }
                // Update the createdBy field
                yield conn.query('UPDATE invoices SET createdBy = ? WHERE id = ?', [targetUserName, invoiceId]);
                // Log the transfer in audit trail
                const auditDetails = JSON.stringify({
                    action: 'INVOICE_TRANSFER',
                    invoiceId,
                    fromUser: invoice.createdBy,
                    toUser: targetUserName,
                    reason: reason || 'No reason provided',
                    partnerName: invoice.partnerName,
                    total: invoice.total
                });
                yield conn.query(`INSERT INTO audit_logs (id, date, user, module, action, details) 
                     VALUES (UUID(), NOW(), ?, 'INVOICE', 'TRANSFER', ?)`, [currentUser, auditDetails]);
                results.push({
                    invoiceId,
                    success: true,
                    message: `Transferred to ${targetUserName}`
                });
            }
            yield conn.commit();
            // Emit real-time update
            eventBus_1.eventBus.broadcast('entity:changed', {
                entityType: 'invoice',
                action: 'transfer',
                targetUser: targetUserName
            });
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            res.json({
                message: `Successfully transferred ${successful} invoice(s)${failed > 0 ? `, ${failed} failed` : ''}`,
                results,
                summary: {
                    total: invoiceIds.length,
                    successful,
                    failed
                }
            });
        }
        catch (error) {
            yield conn.rollback();
            throw error;
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('Error transferring invoices:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'transfer invoices');
    }
});
exports.transferInvoice = transferInvoice;
/**
 * GET /api/invoices/transfer/users - Get list of users for transfer dropdown
 */
const getTransferableUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { user } = authReq;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        try {
            // Get all active users except current user
            const [users] = yield conn.query(`SELECT id, name, username, role 
                 FROM users 
                 WHERE status = 'ACTIVE' AND id != ?
                 ORDER BY name`, [user.id]);
            res.json({ users });
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('Error fetching transferable users:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch users');
    }
});
exports.getTransferableUsers = getTransferableUsers;
