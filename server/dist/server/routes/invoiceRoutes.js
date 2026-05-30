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
const express_1 = require("express");
const invoiceController_1 = require("../controllers/invoiceController");
const invoiceControllerEnhanced_1 = require("../controllers/invoiceControllerEnhanced");
const deletedInvoicesController_1 = require("../controllers/deletedInvoicesController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const policyMiddleware_1 = require("../middleware/policyMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
router.get('/', invoiceController_1.getInvoices);
// Deleted invoices routes - for audit trail
router.get('/deleted', (0, authMiddleware_1.requirePermission)('system.settings'), deletedInvoicesController_1.getDeletedInvoices);
router.get('/deleted/stats', (0, authMiddleware_1.requirePermission)('system.settings'), deletedInvoicesController_1.getDeletedInvoicesStats);
router.get('/deleted/:id', (0, authMiddleware_1.requirePermission)('system.settings'), deletedInvoicesController_1.getDeletedInvoiceById);
// Transfer routes - must come before /:id routes
// SECURITY: Use explicit permission check, not role-name matching.
// Grant 'sales.transfer' to any user who needs to reassign invoices between users.
const requireTransferPermission = (req, res, next) => {
    const user = req.user;
    if (!user)
        return res.status(401).json({ error: 'غير مصرح' });
    const role = (user.role || '').toUpperCase();
    // Admins always allowed
    if (role === 'ADMIN' || role === 'MASTER_ADMIN' || role === 'GENERAL_MANAGER')
        return next();
    // All other users must have explicit sales.transfer permission
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    if (perms.includes('sales.transfer') || perms.includes('all'))
        return next();
    return res.status(403).json({ error: 'ليس لديك صلاحية لتحويل الفواتير. تحتاج إلى صلاحية sales.transfer' });
};
router.get('/transfer/users', requireTransferPermission, policyMiddleware_1.loadSystemConfig, invoiceControllerEnhanced_1.getTransferableUsers);
router.post('/transfer', requireTransferPermission, policyMiddleware_1.loadSystemConfig, invoiceControllerEnhanced_1.transferInvoice);
// Invoice Report Stats - Total quantities sold/returned (تقرير الفواتير - الكميات)
router.get('/report-stats', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        const { startDate, endDate, paymentMethod } = req.query;
        const { getConnection } = require('../db');
        conn = yield getConnection();
        let whereClause = `WHERE i.status = 'POSTED' AND i.type IN ('INVOICE_SALE','INVOICE_PURCHASE','RETURN_SALE','RETURN_PURCHASE')`;
        const params = [];
        if (startDate) {
            whereClause += ` AND i.date >= ?`;
            params.push(startDate.length === 10 ? `${startDate} 00:00:00` : startDate);
        }
        if (endDate) {
            whereClause += ` AND i.date <= ?`;
            params.push(endDate.length === 10 ? `${endDate} 23:59:59` : endDate);
        }
        if (paymentMethod && paymentMethod !== 'ALL') {
            whereClause += ` AND i.paymentMethod = ?`;
            params.push(paymentMethod);
        }
        const [qtyRows] = yield conn.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN i.type = 'INVOICE_SALE' THEN il.quantity ELSE 0 END), 0) as qtySold,
                COALESCE(SUM(CASE WHEN i.type = 'INVOICE_PURCHASE' THEN il.quantity ELSE 0 END), 0) as qtyPurchased,
                COALESCE(SUM(CASE WHEN i.type = 'RETURN_SALE' THEN il.quantity ELSE 0 END), 0) as qtyReturnedSale,
                COALESCE(SUM(CASE WHEN i.type = 'RETURN_PURCHASE' THEN il.quantity ELSE 0 END), 0) as qtyReturnedPurchase,
                COUNT(DISTINCT CASE WHEN i.type = 'INVOICE_SALE' THEN il.productId END) as uniqueProductsSold,
                COUNT(DISTINCT CASE WHEN i.type = 'INVOICE_PURCHASE' THEN il.productId END) as uniqueProductsPurchased
            FROM invoice_lines il
            INNER JOIN invoices i ON il.invoiceId = i.id
            ${whereClause}
        `, params);
        const [finRows] = yield conn.query(`
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(CASE WHEN i.type = 'INVOICE_SALE' THEN i.total ELSE 0 END), 0) as totalSales,
                COALESCE(SUM(CASE WHEN i.type = 'INVOICE_PURCHASE' THEN i.total ELSE 0 END), 0) as totalPurchases,
                COALESCE(SUM(CASE WHEN i.type = 'RETURN_SALE' THEN i.total ELSE 0 END), 0) as totalSalesReturns,
                COALESCE(SUM(CASE WHEN i.type = 'RETURN_PURCHASE' THEN i.total ELSE 0 END), 0) as totalPurchaseReturns,
                SUM(CASE WHEN i.type = 'INVOICE_SALE' THEN 1 ELSE 0 END) as salesCount,
                SUM(CASE WHEN i.type = 'INVOICE_PURCHASE' THEN 1 ELSE 0 END) as purchaseCount,
                SUM(CASE WHEN i.type = 'RETURN_SALE' THEN 1 ELSE 0 END) as salesReturnCount,
                SUM(CASE WHEN i.type = 'RETURN_PURCHASE' THEN 1 ELSE 0 END) as purchaseReturnCount
            FROM invoices i
            ${whereClause}
        `, params);
        conn.release();
        const stats = qtyRows[0] || {};
        const finStats = finRows[0] || {};
        res.json({
            qtySold: Number(stats.qtySold) || 0,
            qtyPurchased: Number(stats.qtyPurchased) || 0,
            qtyReturnedSale: Number(stats.qtyReturnedSale) || 0,
            qtyReturnedPurchase: Number(stats.qtyReturnedPurchase) || 0,
            uniqueProductsSold: Number(stats.uniqueProductsSold) || 0,
            uniqueProductsPurchased: Number(stats.uniqueProductsPurchased) || 0,
            count: Number(finStats.count) || 0,
            totalSales: Number(finStats.totalSales) || 0,
            totalPurchases: Number(finStats.totalPurchases) || 0,
            totalSalesReturns: Number(finStats.totalSalesReturns) || 0,
            totalPurchaseReturns: Number(finStats.totalPurchaseReturns) || 0,
            salesCount: Number(finStats.salesCount) || 0,
            purchaseCount: Number(finStats.purchaseCount) || 0,
            salesReturnCount: Number(finStats.salesReturnCount) || 0,
            purchaseReturnCount: Number(finStats.purchaseReturnCount) || 0,
        });
    }
    catch (error) {
        if (conn)
            try {
                conn.release();
            }
            catch (_a) { }
        console.error('Error fetching report stats:', error);
        res.status(500).json({ error: 'فشل في جلب إحصائيات التقرير' });
    }
}));
// Customer last product price - آخر سعر اشترى به العميل هذا المنتج
router.get('/customer-last-price/:partnerId/:productId', invoiceController_1.getCustomerLastProductPrice);
// PERF: Batch version — replaces N parallel API calls with 1
router.post('/customer-last-prices/:partnerId', invoiceController_1.getCustomerLastProductPrices);
// Reservation dispatch statuses (batch - must come before /:id)
router.get('/dispatch-statuses/all', invoiceController_1.getInvoiceDispatchStatuses);
router.get('/pending-reservations', invoiceController_1.getPendingReservations);
// Neighbor invoice - for prev/next navigation across page boundaries
router.get('/neighbor', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        const { currentNumber, type, direction } = req.query;
        if (!currentNumber || !type || !direction) {
            return res.status(400).json({ error: 'Missing required params: currentNumber, type, direction' });
        }
        const { getConnection } = require('../db');
        conn = yield getConnection();
        const isPrev = direction === 'prev';
        // For "prev": find the largest number that is LESS than current
        // For "next": find the smallest number that is GREATER than current
        const operator = isPrev ? '<' : '>';
        const order = isPrev ? 'DESC' : 'ASC';
        const [rows] = yield conn.query(`
            SELECT id, number, date, type 
            FROM invoices 
            WHERE type = ? AND number ${operator} ? AND status != 'VOID'
            ORDER BY number ${order}
            LIMIT 1
        `, [type, currentNumber]);
        conn.release();
        const neighbor = rows[0];
        if (neighbor) {
            res.json({ id: neighbor.id, number: neighbor.number, date: neighbor.date });
        }
        else {
            res.json({ id: null }); // No neighbor found (at the boundary)
        }
    }
    catch (error) {
        if (conn)
            try {
                conn.release();
            }
            catch (_a) { }
        console.error('Error fetching neighbor invoice:', error);
        res.status(500).json({ error: 'فشل في البحث عن الفاتورة المجاورة' });
    }
}));
// Next invoice number - server-side sequential generation
router.get('/next-number', invoiceController_1.getNextInvoiceNumber);
// Outstanding invoices for a partner - ربط المقبوضات بالفواتير
router.get('/outstanding/:partnerId', invoiceController_1.getOutstandingInvoices);
// Partner return invoices - الصافى بعد المرتجع
// Returns today's RETURN_SALE invoices for a specific partner
router.get('/partner-returns/:partnerId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        const { partnerId } = req.params;
        const { date } = req.query; // Optional: specific date, defaults to today
        const { getConnection } = require('../db');
        conn = yield getConnection();
        // Use provided date or default to today (LOCAL time, not UTC)
        // new Date().toISOString() returns UTC which can be a different day
        const now = new Date();
        const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const targetDate = date || localDate;
        const [rows] = yield conn.query(`
            SELECT 
                i.id,
                i.number,
                i.date,
                i.total,
                i.paidAmount,
                i.type,
                i.status,
                i.notes,
                i.referenceInvoiceId
            FROM invoices i
            WHERE i.partnerId = ?
              AND i.type IN ('RETURN_SALE', 'SALE_RETURN')
              AND i.status = 'POSTED'
              AND DATE(i.date) = ?
            ORDER BY i.date DESC
        `, [partnerId, targetDate]);
        conn.release();
        const returns = rows.map(r => ({
            id: r.id,
            number: r.number,
            date: r.date,
            total: Number(r.total) || 0,
            paidAmount: Number(r.paidAmount) || 0,
            type: r.type,
            status: r.status,
            notes: r.notes,
            referenceInvoiceId: r.referenceInvoiceId || null
        }));
        const totalReturns = returns.reduce((sum, r) => sum + r.total, 0);
        res.json({
            returns,
            totalReturns,
            count: returns.length
        });
    }
    catch (error) {
        if (conn)
            try {
                conn.release();
            }
            catch (_a) { }
        console.error('Error fetching partner returns:', error);
        res.status(500).json({ error: 'فشل في جلب فواتير المرتجع' });
    }
}));
// Get single invoice by ID with lines
router.get('/:id', invoiceController_1.getInvoiceById);
// Reservation status for specific invoice
router.get('/:id/reservations', invoiceController_1.getInvoiceReservations);
// Helper: Get permission for invoice type
const getInvoicePermission = (type, action) => {
    const permissionMap = {
        // Sales
        'SALE': `sales.${action}`,
        'INVOICE_SALE': `sales.${action}`,
        'SALE_RETURN': `sales.${action}`,
        'SALE_INVOICE': `sales.${action}`,
        'RETURN_SALE': `sales.${action}`,
        // Purchases
        'PURCHASE': `purchase.${action}`,
        'INVOICE_PURCHASE': `purchase.${action}`,
        'PURCHASE_RETURN': `purchase.${action}`,
        'PURCHASE_INVOICE': `purchase.${action}`,
        'RETURN_PURCHASE': `purchase.${action}`,
        // Treasury (delete uses treasury.manage)
        'RECEIPT': action === 'delete' ? 'treasury.manage' : `treasury.receipts.${action}`,
        'PAYMENT': action === 'delete' ? 'treasury.manage' : `treasury.payments.${action}`,
        // Quotations
        'QUOTATION': `sales.quotations.${action}`,
    };
    return permissionMap[type] || null;
};
router.post('/', (req, res, next) => {
    const type = req.body.type;
    const permission = getInvoicePermission(type, 'create');
    if (!permission) {
        return res.status(400).json({
            code: 'INVALID_TYPE',
            message: `نوع الفاتورة غير صالح: ${type}`
        });
    }
    return (0, authMiddleware_1.requirePermission)(permission)(req, res, next);
}, (0, policyMiddleware_1.enforceLockDate)(), invoiceController_1.createInvoice);
// Update invoice with payment handling
router.put('/:id', (req, res, next) => {
    const type = req.body.type;
    const permission = getInvoicePermission(type, 'edit');
    if (!permission) {
        return res.status(400).json({
            code: 'INVALID_TYPE',
            message: `نوع الفاتورة غير صالح: ${type}`
        });
    }
    return (0, authMiddleware_1.requirePermission)(permission)(req, res, next);
}, (0, policyMiddleware_1.enforceLockDate)(), invoiceController_1.updateInvoice);
// Preview what will be deleted (سندات مرتبطة)
router.get('/:id/preview-delete', policyMiddleware_1.loadSystemConfig, invoiceControllerEnhanced_1.previewDeleteInvoice);
// Delete invoice with CASCADE (deletes linked سند قبض / سند صرف)
// SECURITY: Dynamically check delete permission based on invoice type
router.delete('/:id', policyMiddleware_1.loadSystemConfig, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Look up the invoice type to determine the correct permission
        const { getConnection } = require('../db');
        const conn = yield getConnection();
        try {
            const [rows] = yield conn.query('SELECT type FROM invoices WHERE id = ? LIMIT 1', [req.params.id]);
            const invoice = rows[0];
            if (!invoice) {
                return res.status(404).json({ error: 'Invoice not found' });
            }
            const permission = getInvoicePermission(invoice.type, 'delete');
            if (!permission) {
                // Fallback: require system.settings for unknown types
                return (0, authMiddleware_1.requirePermission)('system.settings')(req, res, next);
            }
            return (0, authMiddleware_1.requirePermission)(permission)(req, res, next);
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('Error checking delete permission:', error);
        return res.status(500).json({ error: 'Permission check failed' });
    }
}), invoiceControllerEnhanced_1.deleteInvoice);
exports.default = router;
