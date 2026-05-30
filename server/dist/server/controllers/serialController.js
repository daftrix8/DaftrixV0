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
exports.getCustomerBySerial = exports.bulkUpdateStatus = exports.getSerialDashboard = exports.getSerialReport = exports.updateSerialStatus = exports.getSerialHistory = exports.getAvailableSerials = exports.searchSerials = void 0;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
// GET /api/serials/search?query=XYZ
const searchSerials = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { query } = req.query;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ message: 'Query parameter is required' });
        }
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query(`
            SELECT ps.*, p.name as productName, p.sku
            FROM product_serials ps
            JOIN products p ON ps.productId COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
            WHERE ps.serialNumber LIKE ?
            LIMIT 20
        `, [`%${query}%`]);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'searchSerials');
    }
});
exports.searchSerials = searchSerials;
// GET /api/serials/available
// Query params: productId, warehouseId
const getAvailableSerials = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productId, warehouseId } = req.query;
        if (!productId) {
            return res.status(400).json({ message: 'ProductId is required' });
        }
        const conn = yield (0, db_1.getConnection)();
        let query = `
            SELECT serialNumber, createdAt 
            FROM product_serials 
            WHERE productId = ? AND status = 'AVAILABLE'
        `;
        const params = [productId];
        if (warehouseId) {
            query += ` AND warehouseId = ?`;
            params.push(warehouseId);
        }
        query += ` ORDER BY createdAt ASC`; // FIFO suggestion
        const [rows] = yield conn.query(query, params);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getAvailableSerials');
    }
});
exports.getAvailableSerials = getAvailableSerials;
// GET /api/serials/history/:serialNumber
const getSerialHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { serialNumber } = req.params;
        const conn = yield (0, db_1.getConnection)();
        // Get basic info
        const [info] = yield conn.query(`
            SELECT ps.*, p.name as productName, p.sku, w.name as warehouseName
            FROM product_serials ps
            JOIN products p ON ps.productId COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
            LEFT JOIN warehouses w ON ps.warehouseId COLLATE utf8mb4_unicode_ci = w.id COLLATE utf8mb4_unicode_ci
            WHERE ps.serialNumber = ?
        `, [serialNumber]);
        if (info.length === 0) {
            conn.release();
            return res.status(404).json({ message: 'Serial number not found' });
        }
        // Get transactions with Invoice and Partner Details
        const [transactions] = yield conn.query(`
            SELECT st.*, 
                   u.name as userName,
                   inv.number as invoiceNumber,
                   inv.type as invoiceType,
                   part.name as partnerName
            FROM serial_transactions st
            LEFT JOIN users u ON st.userId COLLATE utf8mb4_unicode_ci = u.id COLLATE utf8mb4_unicode_ci
            LEFT JOIN invoices inv ON st.referenceId COLLATE utf8mb4_unicode_ci = inv.id COLLATE utf8mb4_unicode_ci
            LEFT JOIN partners part ON inv.partnerId COLLATE utf8mb4_unicode_ci = part.id COLLATE utf8mb4_unicode_ci
            WHERE st.serialId = ?
            ORDER BY st.date DESC
        `, [info[0].id]);
        // Get customer info (who bought this serial)
        const serialInfo = info[0];
        let customerInfo = null;
        if (serialInfo.salesInvoiceId) {
            const [custRows] = yield conn.query(`
                SELECT p.name as customerName, p.phone as customerPhone,
                       i.number as invoiceNumber, i.date as invoiceDate, i.total as invoiceTotal
                FROM invoices i
                JOIN partners p ON i.partnerId = p.id
                WHERE i.id = ?
            `, [serialInfo.salesInvoiceId]);
            if (custRows.length > 0) {
                customerInfo = custRows[0];
            }
        }
        conn.release();
        res.json({
            info: serialInfo,
            transactions,
            customerInfo
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getSerialHistory');
    }
});
exports.getSerialHistory = getSerialHistory;
// PUT /api/serials/:id/status
const updateSerialStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const conn = yield (0, db_1.getConnection)();
        // Update serial
        yield conn.query(`
            UPDATE product_serials SET status = ?, statusNotes = ? WHERE id = ?
        `, [status, notes, id]);
        // Log transaction
        yield conn.query(`
            INSERT INTO serial_transactions (id, serialId, transactionType, referenceId, warehouseId, date, userId)
            SELECT UUID(), id, 'STATUS_CHANGE', ?, warehouseId, NOW(), ? 
            FROM product_serials WHERE id = ?
        `, [notes || 'Manual Status Change', req.body.user || 'System', id]);
        conn.release();
        res.json({ message: 'Status updated' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'updateSerialStatus');
    }
});
exports.updateSerialStatus = updateSerialStatus;
// GET /api/serials/reports
// Query: type=STATUS|WARRANTY|MOVEMENT
// Enhanced with: dateFrom, dateTo, productId filters
const getSerialReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { type, status, warehouseId, days, dateFrom, dateTo, productId } = req.query;
        const conn = yield (0, db_1.getConnection)();
        let results = [];
        let stats = {};
        if (type === 'STATUS') {
            let whereClause = '1=1';
            const params = [];
            if (status && status !== 'ALL') {
                whereClause += ' AND ps.status = ?';
                params.push(status);
            }
            if (warehouseId) {
                whereClause += ' AND ps.warehouseId = ?';
                params.push(warehouseId);
            }
            if (productId) {
                whereClause += ' AND ps.productId = ?';
                params.push(productId);
            }
            // Get List
            const [rows] = yield conn.query(`
                SELECT ps.*, p.name as productName, p.sku, w.name as warehouseName 
                FROM product_serials ps
                JOIN products p ON ps.productId COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
                LEFT JOIN warehouses w ON ps.warehouseId COLLATE utf8mb4_unicode_ci = w.id COLLATE utf8mb4_unicode_ci
                WHERE ${whereClause}
                ORDER BY ps.createdAt DESC
                LIMIT 1000
            `, params);
            results = rows;
            // Get Stats
            const [statRows] = yield conn.query(`
                SELECT status, COUNT(*) as count 
                FROM product_serials ps
                WHERE ${whereClause}
                GROUP BY status
            `, params);
            stats = statRows;
        }
        else if (type === 'WARRANTY') {
            const daysLimit = Number(days) || 30;
            let whereClause = `ps.warrantyEndDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)`;
            const params = [daysLimit];
            if (warehouseId) {
                whereClause += ' AND ps.warehouseId = ?';
                params.push(warehouseId);
            }
            if (productId) {
                whereClause += ' AND ps.productId = ?';
                params.push(productId);
            }
            const [rows] = yield conn.query(`
                SELECT ps.*, p.name as productName, w.name as warehouseName
                FROM product_serials ps
                JOIN products p ON ps.productId COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
                LEFT JOIN warehouses w ON ps.warehouseId COLLATE utf8mb4_unicode_ci = w.id COLLATE utf8mb4_unicode_ci
                WHERE ${whereClause}
                ORDER BY ps.warrantyEndDate ASC
            `, params);
            results = rows;
        }
        else if (type === 'MOVEMENT') {
            let whereClause = '1=1';
            const params = [];
            if (dateFrom) {
                whereClause += ' AND DATE(st.date) >= ?';
                params.push(dateFrom);
            }
            if (dateTo) {
                whereClause += ' AND DATE(st.date) <= ?';
                params.push(dateTo);
            }
            if (productId) {
                whereClause += ' AND ps.productId = ?';
                params.push(productId);
            }
            if (warehouseId) {
                whereClause += ' AND st.warehouseId = ?';
                params.push(warehouseId);
            }
            const [rows] = yield conn.query(`
                SELECT st.*, ps.serialNumber, p.name as productName, p.sku,
                       u.name as userName, st.transactionType, w.name as warehouseName
                FROM serial_transactions st
                JOIN product_serials ps ON st.serialId COLLATE utf8mb4_unicode_ci = ps.id COLLATE utf8mb4_unicode_ci
                JOIN products p ON ps.productId COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
                LEFT JOIN users u ON st.userId COLLATE utf8mb4_unicode_ci = u.id COLLATE utf8mb4_unicode_ci
                LEFT JOIN warehouses w ON st.warehouseId COLLATE utf8mb4_unicode_ci = w.id COLLATE utf8mb4_unicode_ci
                WHERE ${whereClause}
                ORDER BY st.date DESC
                LIMIT 500
            `, params);
            results = rows;
            // Movement stats
            const [movStats] = yield conn.query(`
                SELECT transactionType, COUNT(*) as count
                FROM serial_transactions st
                JOIN product_serials ps ON st.serialId COLLATE utf8mb4_unicode_ci = ps.id COLLATE utf8mb4_unicode_ci
                WHERE ${whereClause}
                GROUP BY transactionType
            `, params);
            stats = movStats;
        }
        conn.release();
        res.json({ data: results, stats });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getSerialReport');
    }
});
exports.getSerialReport = getSerialReport;
// GET /api/serials/dashboard
// Returns serial counts grouped by product and status
const getSerialDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { warehouseId } = req.query;
        const conn = yield (0, db_1.getConnection)();
        let whereClause = '1=1';
        const params = [];
        if (warehouseId) {
            whereClause += ' AND ps.warehouseId = ?';
            params.push(warehouseId);
        }
        // Per-product breakdown
        const [productBreakdown] = yield conn.query(`
            SELECT ps.productId, p.name as productName, p.sku,
                   ps.status, COUNT(*) as count
            FROM product_serials ps
            JOIN products p ON ps.productId COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
            WHERE ${whereClause}
            GROUP BY ps.productId, p.name, p.sku, ps.status
            ORDER BY p.name, ps.status
        `, params);
        // Overall summary
        const [overallStats] = yield conn.query(`
            SELECT ps.status, COUNT(*) as count
            FROM product_serials ps
            WHERE ${whereClause}
            GROUP BY ps.status
        `, params);
        // Total unique products with serials
        const [productCount] = yield conn.query(`
            SELECT COUNT(DISTINCT ps.productId) as totalProducts,
                   COUNT(*) as totalSerials
            FROM product_serials ps
            WHERE ${whereClause}
        `, params);
        // Recently added serials (last 10)
        const [recentSerials] = yield conn.query(`
            SELECT ps.serialNumber, ps.status, ps.createdAt, 
                   p.name as productName, w.name as warehouseName
            FROM product_serials ps
            JOIN products p ON ps.productId COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
            LEFT JOIN warehouses w ON ps.warehouseId COLLATE utf8mb4_unicode_ci = w.id COLLATE utf8mb4_unicode_ci
            WHERE ${whereClause}
            ORDER BY ps.createdAt DESC
            LIMIT 10
        `, params);
        conn.release();
        res.json({
            productBreakdown,
            overallStats,
            summary: productCount[0],
            recentSerials
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getSerialDashboard');
    }
});
exports.getSerialDashboard = getSerialDashboard;
// POST /api/serials/bulk-status
// Body: { serialIds: string[], status: string, notes?: string }
const bulkUpdateStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { serialIds, status, notes } = req.body;
        if (!Array.isArray(serialIds) || serialIds.length === 0) {
            return res.status(400).json({ message: 'serialIds array is required' });
        }
        if (!status) {
            return res.status(400).json({ message: 'status is required' });
        }
        const conn = yield (0, db_1.getConnection)();
        // Update all serials
        const placeholders = serialIds.map(() => '?').join(',');
        yield conn.query(`
            UPDATE product_serials SET status = ?, statusNotes = ? 
            WHERE id IN (${placeholders})
        `, [status, notes || `Bulk update to ${status}`, ...serialIds]);
        // Log transactions for each
        for (const serialId of serialIds) {
            yield conn.query(`
                INSERT INTO serial_transactions (id, serialId, transactionType, referenceId, warehouseId, date, userId)
                SELECT UUID(), id, 'STATUS_CHANGE', ?, warehouseId, NOW(), ?
                FROM product_serials WHERE id = ?
            `, [notes || `Bulk: ${status}`, req.body.user || 'System', serialId]);
        }
        conn.release();
        res.json({ message: `Updated ${serialIds.length} serials to ${status}`, count: serialIds.length });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'bulkUpdateStatus');
    }
});
exports.bulkUpdateStatus = bulkUpdateStatus;
// GET /api/serials/customer/:serialNumber
// Returns who bought this serial
const getCustomerBySerial = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { serialNumber } = req.params;
        const conn = yield (0, db_1.getConnection)();
        // Find serial
        const [serialRows] = yield conn.query(`
            SELECT ps.*, p.name as productName, p.sku
            FROM product_serials ps
            JOIN products p ON ps.productId COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
            WHERE ps.serialNumber = ?
        `, [serialNumber]);
        if (serialRows.length === 0) {
            conn.release();
            return res.status(404).json({ message: 'Serial not found' });
        }
        const serial = serialRows[0];
        // Find customer via sales invoice
        let customer = null;
        if (serial.salesInvoiceId) {
            const [custRows] = yield conn.query(`
                SELECT p.id as customerId, p.name as customerName, p.phone, p.email,
                       i.number as invoiceNumber, i.date as saleDate, i.total as invoiceTotal
                FROM invoices i
                JOIN partners p ON i.partnerId = p.id
                WHERE i.id = ?
            `, [serial.salesInvoiceId]);
            if (custRows.length > 0) {
                customer = custRows[0];
            }
        }
        // If no direct salesInvoice link, try finding from serial_transactions
        if (!customer) {
            const [transRows] = yield conn.query(`
                SELECT p.id as customerId, p.name as customerName, p.phone, p.email,
                       i.number as invoiceNumber, i.date as saleDate, i.total as invoiceTotal
                FROM serial_transactions st
                JOIN invoices i ON st.referenceId COLLATE utf8mb4_unicode_ci = i.id COLLATE utf8mb4_unicode_ci
                JOIN partners p ON i.partnerId COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
                WHERE st.serialId = ? AND st.transactionType = 'OUT'
                ORDER BY st.date DESC
                LIMIT 1
            `, [serial.id]);
            if (transRows.length > 0) {
                customer = transRows[0];
            }
        }
        conn.release();
        res.json({
            serial: {
                serialNumber: serial.serialNumber,
                productName: serial.productName,
                sku: serial.sku,
                status: serial.status,
                warrantyStartDate: serial.warrantyStartDate,
                warrantyEndDate: serial.warrantyEndDate
            },
            customer
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getCustomerBySerial');
    }
});
exports.getCustomerBySerial = getCustomerBySerial;
