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
const deletedInvoicesController_1 = require("../controllers/deletedInvoicesController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const policyMiddleware_1 = require("../middleware/policyMiddleware");
const dataFiltering_1 = require("../utils/dataFiltering");
const router = (0, express_1.Router)();
// Public unauthenticated route to view invoice
router.get('/public/:id', invoiceController_1.getPublicInvoiceById);
router.use(authMiddleware_1.authenticateToken);
router.use(policyMiddleware_1.loadSystemConfig);
router.get('/', invoiceController_1.getInvoices);
// Deleted invoices routes - for audit trail
router.get('/deleted', (0, authMiddleware_1.requirePermission)('invoices.deleted.view'), deletedInvoicesController_1.getDeletedInvoices);
router.get('/deleted/stats', (0, authMiddleware_1.requirePermission)('invoices.deleted.view'), deletedInvoicesController_1.getDeletedInvoicesStats);
router.get('/deleted/:id', (0, authMiddleware_1.requirePermission)('invoices.deleted.view'), deletedInvoicesController_1.getDeletedInvoiceById);
// Transfer routes - must come before /:id routes
// Uses the standard hasPermission() utility which includes ADMIN/MASTER_ADMIN role bypass.
// Grant 'sales.transfer' to any user who needs to reassign invoices between users.
const requireTransferPermission = (req, res, next) => {
    const user = req.user;
    if (!user)
        return res.status(401).json({ error: 'غير مصرح' });
    if ((0, dataFiltering_1.hasPermission)(user, 'sales.transfer'))
        return next();
    return res.status(403).json({ error: 'ليس لديك صلاحية لتحويل الفواتير. تحتاج إلى صلاحية sales.transfer' });
};
router.get('/transfer/users', requireTransferPermission, policyMiddleware_1.loadSystemConfig, invoiceController_1.getTransferableUsers);
router.post('/transfer', requireTransferPermission, policyMiddleware_1.loadSystemConfig, invoiceController_1.transferInvoice);
// Invoice Report Stats - Total quantities sold/returned (تقرير الفواتير - الكميات)
router.get('/report-stats', policyMiddleware_1.loadSystemConfig, invoiceController_1.getInvoiceReportStats);
// Customer last product price - آخر سعر اشترى به العميل هذا المنتج
router.get('/customer-last-price/:partnerId/:productId', invoiceController_1.getCustomerLastProductPrice);
// PERF: Batch version — replaces N parallel API calls with 1
router.post('/customer-last-prices/:partnerId', invoiceController_1.getCustomerLastProductPrices);
// Reservation dispatch statuses (batch - must come before /:id)
router.get('/dispatch-statuses/all', invoiceController_1.getInvoiceDispatchStatuses);
router.get('/pending-reservations', invoiceController_1.getPendingReservations);
// Neighbor invoice - for prev/next navigation across page boundaries
router.get('/neighbor', policyMiddleware_1.loadSystemConfig, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    let conn;
    try {
        const { currentNumber, type, direction } = req.query;
        if (!currentNumber || !type || !direction) {
            return res.status(400).json({ error: 'Missing required params: currentNumber, type, direction' });
        }
        // Validate direction parameter
        const directionLower = String(direction).toLowerCase();
        if (directionLower !== 'prev' && directionLower !== 'next') {
            return res.status(400).json({ error: 'Invalid direction parameter. Expected prev or next' });
        }
        const { getConnection } = require('../db');
        conn = yield getConnection();
        const isPrev = directionLower === 'prev';
        const operator = isPrev ? '<' : '>';
        const order = isPrev ? 'DESC' : 'ASC';
        const conditions = [
            'type = ?',
            'status != \'VOID\'',
            `CAST(SUBSTRING_INDEX(number, '-', -1) AS UNSIGNED) ${operator} CAST(SUBSTRING_INDEX(?, '-', -1) AS UNSIGNED)`
        ];
        const params = [type, currentNumber];
        // Apply branch isolation filter
        const authReq = req;
        const { user } = authReq;
        const role = ((user === null || user === void 0 ? void 0 : user.role) || '').toUpperCase();
        const isAdmin = role === 'MASTER_ADMIN' || role === 'ADMIN' || role === 'GENERAL_MANAGER';
        if (((_a = authReq.branchContext) === null || _a === void 0 ? void 0 : _a.branchId) && !isAdmin) {
            conditions.push('branchId = ?');
            params.push(authReq.branchContext.branchId);
        }
        const querySql = `
            SELECT id, number, date, type 
            FROM invoices 
            WHERE ${conditions.join(' AND ')}
            ORDER BY CAST(SUBSTRING_INDEX(number, '-', -1) AS UNSIGNED) ${order}
            LIMIT 1
        `;
        const [rows] = yield conn.query(querySql, params);
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
            catch (_b) { }
        console.error('Error fetching neighbor invoice:', error);
        res.status(500).json({ error: 'فشل في البحث عن الفاتورة المجاورة' });
    }
}));
// Next invoice number - server-side sequential generation
router.get('/next-number', invoiceController_1.getNextInvoiceNumber);
// Outstanding invoices for a partner - ربط المقبوضات بالفواتير
router.get('/outstanding/:partnerId', invoiceController_1.getOutstandingInvoices);
// Get single invoice by ID with lines
router.get('/:id', invoiceController_1.getInvoiceById);
// Reservation status for specific invoice
router.get('/:id/reservations', invoiceController_1.getInvoiceReservations);
router.post('/', (req, res, next) => {
    const user = req.user;
    const type = req.body.type;
    if ((user === null || user === void 0 ? void 0 : user.role) === 'CUSTOMER') {
        if (!user.partnerId) {
            return res.status(403).json({
                code: 'MISSING_PARTNER_ID',
                message: 'الحساب ليس له معرف شريك مرتبط'
            });
        }
        const allowedTypes = ['SALES', 'QUOTATION', 'SALES_ORDER'];
        if (!allowedTypes.includes(type)) {
            return res.status(403).json({
                code: 'INVALID_CUSTOMER_INVOICE_TYPE',
                message: 'نوع الفاتورة غير مسموح به لحسابات العملاء'
            });
        }
        req.body = Object.assign(Object.assign({}, req.body), { partnerId: user.partnerId });
        return next();
    }
    const permission = (0, invoiceController_1.getInvoicePermission)(type, 'create');
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
    const permission = (0, invoiceController_1.getInvoicePermission)(type, 'edit');
    if (!permission) {
        return res.status(400).json({
            code: 'INVALID_TYPE',
            message: `نوع الفاتورة غير صالح: ${type}`
        });
    }
    return (0, authMiddleware_1.requirePermission)(permission)(req, res, next);
}, (0, policyMiddleware_1.enforceLockDate)(), invoiceController_1.updateInvoice);
// Preview what will be deleted (سندات مرتبطة)
router.get('/:id/preview-delete', policyMiddleware_1.loadSystemConfig, invoiceController_1.previewDeleteInvoice);
// Delete invoice with CASCADE (deletes linked سند قبض / سند صرف)
// SECURITY: Dynamically check delete permission inside the deleteInvoice controller
router.delete('/:id', policyMiddleware_1.loadSystemConfig, invoiceController_1.deleteInvoice);
exports.default = router;
