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
exports.getDeletedInvoicesStats = exports.getDeletedInvoiceById = exports.getDeletedInvoices = void 0;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
// Get all deleted invoices with optional filters
const getDeletedInvoices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        // Filter parameters
        const type = req.query.type;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const deletedBy = req.query.deletedBy;
        const search = req.query.search;
        // Build WHERE clause
        const conditions = [];
        const params = [];
        // ═══════════════════════════════════════════
        // MANDATORY: Fiscal Year Hard Boundary
        // ═══════════════════════════════════════════
        if (authReq.fiscalYearFilter) {
            conditions.push('deletedAt >= ? AND deletedAt <= ?');
            params.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        if (type) {
            conditions.push('type = ?');
            params.push(type);
        }
        if (startDate) {
            conditions.push('deletedAt >= ?');
            params.push(startDate);
        }
        if (endDate) {
            conditions.push('deletedAt <= ?');
            params.push(endDate + ' 23:59:59');
        }
        if (deletedBy) {
            conditions.push('deletedBy = ?');
            params.push(deletedBy);
        }
        if (search) {
            conditions.push('(partnerName LIKE ? OR original_id LIKE ? OR notes LIKE ?)');
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        const whereClause = conditions.length > 0
            ? 'WHERE ' + conditions.join(' AND ')
            : '';
        // Get total count for pagination
        const [countResult] = yield conn.query(`SELECT COUNT(*) as total FROM deleted_invoices ${whereClause}`, params);
        const total = countResult[0].total;
        // Get paginated deleted invoices
        const [deletedInvoices] = yield conn.query(`SELECT * FROM deleted_invoices ${whereClause} ORDER BY deletedAt DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
        // Fetch lines for each deleted invoice
        if (deletedInvoices.length > 0) {
            const archiveIds = deletedInvoices.map(inv => inv.id);
            const [allLines] = yield conn.query(`SELECT * FROM deleted_invoice_lines WHERE deletedInvoiceId IN (?)`, [archiveIds]);
            // Build Map for O(1) lookups (js-set-map-lookups best practice)
            const linesByInvoiceId = new Map();
            for (const line of allLines) {
                if (!linesByInvoiceId.has(line.deletedInvoiceId)) {
                    linesByInvoiceId.set(line.deletedInvoiceId, []);
                }
                linesByInvoiceId.get(line.deletedInvoiceId).push(line);
            }
            // Map lines back to invoices using O(1) lookup
            for (const inv of deletedInvoices) {
                inv.lines = linesByInvoiceId.get(inv.id) || [];
            }
        }
        conn.release();
        res.json({
            deletedInvoices,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    }
    catch (error) {
        console.error('Error fetching deleted invoices:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleted invoices');
    }
});
exports.getDeletedInvoices = getDeletedInvoices;
// Get a single deleted invoice by ID
const getDeletedInvoiceById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        const [invoices] = yield conn.query('SELECT * FROM deleted_invoices WHERE id = ? OR original_id = ?', [id, id]);
        if (invoices.length === 0) {
            conn.release();
            return res.status(404).json({ message: 'Deleted invoice not found' });
        }
        const invoice = invoices[0];
        // Fetch lines
        const [lines] = yield conn.query('SELECT * FROM deleted_invoice_lines WHERE deletedInvoiceId = ?', [invoice.id]);
        invoice.lines = lines;
        conn.release();
        res.json(invoice);
    }
    catch (error) {
        console.error('Error fetching deleted invoice:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleted invoice');
    }
});
exports.getDeletedInvoiceById = getDeletedInvoiceById;
// Get deletion statistics
const getDeletedInvoicesStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        // Build fiscal year constraint for stats
        let fyWhere = '';
        const fyParams = [];
        if (authReq.fiscalYearFilter) {
            fyWhere = 'WHERE deletedAt >= ? AND deletedAt <= ?';
            fyParams.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        // Get statistics
        const [stats] = yield conn.query(`
            SELECT 
                COUNT(*) as totalDeleted,
                SUM(total) as totalValue,
                COUNT(DISTINCT deletedBy) as totalDeleters,
                MAX(deletedAt) as lastDeletion
            FROM deleted_invoices
            ${fyWhere}
        `, fyParams);
        // Get by type
        const [byType] = yield conn.query(`
            SELECT type, COUNT(*) as count, SUM(total) as totalValue
            FROM deleted_invoices
            ${fyWhere}
            GROUP BY type
            ORDER BY count DESC
        `, fyParams);
        // Get by user (top deleters)
        const [byUser] = yield conn.query(`
            SELECT deletedBy, COUNT(*) as count, SUM(total) as totalValue
            FROM deleted_invoices
            ${fyWhere}
            GROUP BY deletedBy
            ORDER BY count DESC
            LIMIT 10
        `, fyParams);
        // Get recent deletions (last 7 days within fiscal year)
        const recentWhere = fyWhere
            ? fyWhere + ' AND deletedAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
            : 'WHERE deletedAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        const [recentDeletions] = yield conn.query(`
            SELECT DATE(deletedAt) as date, COUNT(*) as count, SUM(total) as totalValue
            FROM deleted_invoices
            ${recentWhere}
            GROUP BY DATE(deletedAt)
            ORDER BY date DESC
        `, fyParams);
        conn.release();
        res.json({
            summary: stats[0],
            byType,
            byUser,
            recentDeletions
        });
    }
    catch (error) {
        console.error('Error fetching deleted invoices stats:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'statistics');
    }
});
exports.getDeletedInvoicesStats = getDeletedInvoicesStats;
