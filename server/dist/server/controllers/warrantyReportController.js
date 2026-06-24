"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.getWarrantyReport = getWarrantyReport;
const branchFilter_1 = require("../utils/branchFilter");
const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const POSTED_STATUSES = `('POSTED','COMPLETED','PARTIAL')`;
function getWarrantyReport(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const authReq = req;
        // Filter parameters
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const filterPartnerId = req.query.partnerId;
        const statusFilter = req.query.status; // 'all', 'active', 'expired'
        const searchQuery = req.query.query; // name/phone/sku/productName search
        let conn;
        try {
            const { heavyPool } = yield Promise.resolve().then(() => __importStar(require('../db')));
            conn = yield heavyPool.getConnection();
            // Build conditions and params
            const conditions = [
                `i.status IN ${POSTED_STATUSES}`,
                `(il.hasWarranty = 1 OR il.warrantyMonths <> 0)`
            ];
            const params = [];
            // Date filters (optional)
            if (startDate && endDate) {
                conditions.push('DATE(i.date) BETWEEN ? AND ?');
                params.push(startDate, endDate);
            }
            else if (startDate) {
                conditions.push('DATE(i.date) >= ?');
                params.push(startDate);
            }
            else if (endDate) {
                conditions.push('DATE(i.date) <= ?');
                params.push(endDate);
            }
            // Client filter (optional)
            if (filterPartnerId) {
                conditions.push('i.partnerId = ?');
                params.push(filterPartnerId);
            }
            // Branch isolation
            (0, branchFilter_1.appendBranchFilter)(conditions, params, authReq, 'i');
            const querySql = `
      SELECT 
        i.id AS invoiceId,
        i.number AS invoiceNumber,
        i.date AS invoiceDate,
        i.partnerId,
        COALESCE(p.name, i.partnerName) AS partnerName,
        p.phone AS partnerPhone,
        il.productId,
        il.productName,
        il.quantity,
        il.price,
        il.total,
        il.warrantyMonths,
        il.hasWarranty,
        CASE 
          WHEN il.warrantyMonths < 0 THEN DATE_ADD(i.date, INTERVAL ABS(il.warrantyMonths) DAY)
          ELSE DATE_ADD(i.date, INTERVAL COALESCE(il.warrantyMonths, 0) MONTH)
        END AS warrantyExpiryDate
      FROM invoice_lines il
      JOIN invoices i ON il.invoiceId = i.id
      LEFT JOIN partners p ON i.partnerId = p.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.date DESC
    `;
            const [rows] = yield conn.query(querySql, params);
            conn.release();
            conn = null;
            const now = new Date();
            // Map rows and calculate active/expired status in memory
            let detailedLines = rows.map((row) => {
                const expiryDate = row.warrantyExpiryDate ? new Date(row.warrantyExpiryDate) : null;
                // If expiry date has passed, warranty is expired
                const isActive = expiryDate ? expiryDate >= now : false;
                const status = isActive ? 'ACTIVE' : 'EXPIRED';
                return {
                    invoiceId: row.invoiceId,
                    invoiceNumber: row.invoiceNumber,
                    invoiceDate: row.invoiceDate,
                    partnerId: row.partnerId || 'WALK_IN',
                    partnerName: row.partnerName || 'عميل نقدي',
                    partnerPhone: row.partnerPhone || '',
                    productId: row.productId,
                    productName: row.productName,
                    quantity: toNum(row.quantity),
                    price: toNum(row.price),
                    total: toNum(row.total),
                    warrantyMonths: toNum(row.warrantyMonths),
                    hasWarranty: !!row.hasWarranty,
                    warrantyExpiryDate: row.warrantyExpiryDate,
                    status
                };
            });
            // Apply status filter
            if (statusFilter && statusFilter !== 'all') {
                const upperStatus = statusFilter.toUpperCase();
                detailedLines = detailedLines.filter((l) => l.status === upperStatus);
            }
            // Apply search filter (client name/phone or product name/sku)
            if (searchQuery) {
                const searchLower = searchQuery.toLowerCase().trim();
                detailedLines = detailedLines.filter((l) => l.partnerName.toLowerCase().includes(searchLower) ||
                    l.partnerPhone.includes(searchLower) ||
                    l.productName.toLowerCase().includes(searchLower) ||
                    l.invoiceNumber.toLowerCase().includes(searchLower));
            }
            // Aggregate by Client
            const clientMap = new Map();
            let totalInvoicesSet = new Set();
            let totalQuantity = 0;
            let activeWarranties = 0;
            let expiredWarranties = 0;
            for (const line of detailedLines) {
                totalInvoicesSet.add(line.invoiceId);
                totalQuantity += line.quantity;
                if (line.status === 'ACTIVE') {
                    activeWarranties += 1;
                }
                else {
                    expiredWarranties += 1;
                }
                const clientKey = line.partnerId === 'WALK_IN' ? `walkin_${line.partnerName}` : line.partnerId;
                const existing = clientMap.get(clientKey);
                if (existing) {
                    existing.invoicesCount = new Set([...existing._invoiceIds, line.invoiceId]).size;
                    existing._invoiceIds.push(line.invoiceId);
                    existing.totalQuantity += line.quantity;
                    existing.totalAmount += line.total;
                }
                else {
                    clientMap.set(clientKey, {
                        partnerId: line.partnerId,
                        partnerName: line.partnerName,
                        partnerPhone: line.partnerPhone,
                        invoicesCount: 1,
                        totalQuantity: line.quantity,
                        totalAmount: line.total,
                        _invoiceIds: [line.invoiceId]
                    });
                }
            }
            const clientSummary = Array.from(clientMap.values()).map(c => {
                // Remove temporary key before sending
                delete c._invoiceIds;
                return c;
            });
            res.json({
                summary: {
                    totalInvoices: totalInvoicesSet.size,
                    totalQuantity,
                    activeWarranties,
                    expiredWarranties
                },
                clientSummary,
                detailedLines
            });
        }
        catch (error) {
            if (conn)
                try {
                    conn.release();
                }
                catch (_a) { }
            console.error('❌ Warranty report error:', error);
            res.status(500).json({ error: 'Failed to generate warranty report' });
        }
    });
}
