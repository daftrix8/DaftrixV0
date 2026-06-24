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
const stockPermitController_1 = require("../controllers/stockPermitController");
const router = (0, express_1.Router)();
// Middleware to check if user is admin for edit/delete operations
const requireAdminForEditDelete = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const authReq = req;
    const user = authReq.user;
    if (!user) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    // Allow admins
    if (user.role === 'ADMIN' || user.role === 'admin' || user.role === 'MASTER_ADMIN' || user.role === 'GENERAL_MANAGER') {
        return next();
    }
    // Check for specific permission
    const method = req.method;
    // For PUT, type is in the body. For DELETE, body is typically empty — resolve from DB.
    let permitType = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.type) || ((_b = req.query) === null || _b === void 0 ? void 0 : _b.type);
    // SECURITY FIX: For DELETE requests, the body is usually empty, so we must
    // look up the actual permit type from the database to check the correct permission
    if (method === 'DELETE' && !permitType && ((_c = req.params) === null || _c === void 0 ? void 0 : _c.id)) {
        try {
            const { getConnection } = require('../db');
            const conn = yield getConnection();
            try {
                const [rows] = yield conn.query('SELECT type FROM stock_permits WHERE id = ? LIMIT 1', [req.params.id]);
                permitType = (_d = rows[0]) === null || _d === void 0 ? void 0 : _d.type;
            }
            finally {
                conn.release();
            }
        }
        catch (err) {
            console.error('Error looking up permit type for delete permission:', err);
            return res.status(500).json({ error: 'فشل التحقق من الصلاحيات' });
        }
    }
    if (method === 'PUT') {
        let permission;
        if (permitType === 'STOCK_PERMIT_OUT') {
            permission = 'inventory.release.edit';
        }
        else if (permitType === 'STOCK_TRANSFER') {
            permission = 'inventory.transfer';
        }
        else {
            permission = 'inventory.receipt.edit';
        }
        if (((_e = user.permissions) === null || _e === void 0 ? void 0 : _e.includes(permission)) || ((_f = user.permissions) === null || _f === void 0 ? void 0 : _f.includes('all'))) {
            return next();
        }
        return res.status(403).json({ error: 'ليس لديك صلاحية تعديل هذا الإذن. هذه العملية متاحة للمدير فقط.' });
    }
    if (method === 'DELETE') {
        let permission;
        if (permitType === 'STOCK_PERMIT_OUT') {
            permission = 'inventory.release.delete';
        }
        else if (permitType === 'STOCK_TRANSFER') {
            permission = 'inventory.transfer';
        }
        else {
            permission = 'inventory.receipt.delete';
        }
        if (((_g = user.permissions) === null || _g === void 0 ? void 0 : _g.includes(permission)) || ((_h = user.permissions) === null || _h === void 0 ? void 0 : _h.includes('all'))) {
            return next();
        }
        return res.status(403).json({ error: 'ليس لديك صلاحية حذف هذا الإذن. هذه العملية متاحة للمدير فقط.' });
    }
    return res.status(403).json({ error: 'هذه العملية متاحة للمدير فقط' });
});
// Routes
router.get('/', stockPermitController_1.getStockPermits);
router.get('/by-invoice/:invoiceId', stockPermitController_1.getDispatchPermitByInvoice);
router.get('/:id', stockPermitController_1.getStockPermitById);
// Create - requires specific permission based on permit type
router.post('/', (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const authReq = req;
    const user = authReq.user;
    const permitType = (_a = req.body) === null || _a === void 0 ? void 0 : _a.type;
    if (!user) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    // Admins can do anything
    if (user.role === 'ADMIN' || user.role === 'admin' || user.role === 'MASTER_ADMIN' || user.role === 'GENERAL_MANAGER') {
        return next();
    }
    // Check permission based on permit type — STOCK_TRANSFER accepts old or new permission
    if (permitType === 'STOCK_TRANSFER') {
        // Accept old 'inventory.transfer' OR new granular 'inventory.transfer.create'
        if (((_b = user.permissions) === null || _b === void 0 ? void 0 : _b.includes('inventory.transfer')) ||
            ((_c = user.permissions) === null || _c === void 0 ? void 0 : _c.includes('inventory.transfer.create')) ||
            ((_d = user.permissions) === null || _d === void 0 ? void 0 : _d.includes('all'))) {
            return next();
        }
        return res.status(403).json({ error: 'ليس لديك صلاحية إنشاء هذا النوع من الإذونات' });
    }
    let permission;
    if (permitType === 'STOCK_PERMIT_OUT') {
        permission = 'inventory.release.create';
    }
    else {
        permission = 'inventory.receipt.create';
    }
    if (((_e = user.permissions) === null || _e === void 0 ? void 0 : _e.includes(permission)) || ((_f = user.permissions) === null || _f === void 0 ? void 0 : _f.includes('inventory.manage')) || ((_g = user.permissions) === null || _g === void 0 ? void 0 : _g.includes('all'))) {
        return next();
    }
    return res.status(403).json({ error: 'ليس لديك صلاحية إنشاء هذا النوع من الإذونات' });
}, stockPermitController_1.createStockPermit);
// Update - admin only or with specific edit permission
router.put('/:id', requireAdminForEditDelete, stockPermitController_1.updateStockPermit);
// Delete - admin only or with specific delete permission
router.delete('/:id', requireAdminForEditDelete, stockPermitController_1.deleteStockPermit);
exports.default = router;
