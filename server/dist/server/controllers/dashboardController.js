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
exports.getDashboardStats = void 0;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
const branchFilter_1 = require("../utils/branchFilter");
/**
 * GET /api/dashboard/stats
 * Returns pre-computed KPIs for the dashboard to avoid heavy client-side computation.
 * Accepts optional ?period=today|week|month|all query parameter.
 *
 * FISCAL YEAR ISOLATION: All date-sensitive queries are clamped to the active
 * fiscal year boundaries from the JWT token. A user viewing fiscal year 2023-2024
 * will never see 2025 data in their dashboard.
 */
const getDashboardStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const authReq = req;
    const period = req.query.period || 'today';
    const today = new Date().toISOString().split('T')[0];
    // Fiscal year boundaries — clamp all relative date filters within these
    const fyStart = (_a = authReq.fiscalYearFilter) === null || _a === void 0 ? void 0 : _a.startDate;
    const fyEnd = (_b = authReq.fiscalYearFilter) === null || _b === void 0 ? void 0 : _b.endDate;
    // Branch scoping: non-privileged users see only their branch's data
    const { branchId: userBranchId, isPrivileged } = (0, branchFilter_1.resolveBranchScope)(authReq);
    const branchFilter = (!isPrivileged && userBranchId)
        ? `AND (i.branchId = '${userBranchId}' OR i.branchId IS NULL)`
        : '';
    const cacheKey = `dashboard:stats:${period}:${today}:${fyStart || 'all'}:${fyEnd || 'all'}:${userBranchId || 'all'}`;
    // Server-side cache: 15 users hitting dashboard share the same result for 30s
    const cached = (yield Promise.resolve().then(() => __importStar(require('../utils/responseCache')))).responseCache.get(cacheKey);
    if (cached)
        return res.json(cached);
    const conn = yield (0, db_1.getConnection)();
    try {
        // Build date filter — use parameterized range queries for index usage.
        // When a fiscal year is active, clamp the period dates within its boundaries.
        let dateFilter = '';
        let dateParams = [];
        if (fyStart && fyEnd) {
            // Fiscal year is active — always enforce its boundaries
            if (period === 'today') {
                // Today, but only if today falls within the fiscal year
                const effectiveDate = today >= fyStart && today <= fyEnd ? today : fyEnd;
                dateFilter = `AND i.date >= ? AND i.date < DATE_ADD(?, INTERVAL 1 DAY)`;
                dateParams = [effectiveDate, effectiveDate];
            }
            else if (period === 'week') {
                const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
                const effectiveStart = weekAgo >= fyStart ? weekAgo : fyStart;
                const effectiveEnd = today <= fyEnd ? today : fyEnd;
                dateFilter = `AND i.date >= ? AND i.date <= ?`;
                dateParams = [effectiveStart, effectiveEnd];
            }
            else if (period === 'month') {
                const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
                const effectiveStart = monthAgo >= fyStart ? monthAgo : fyStart;
                const effectiveEnd = today <= fyEnd ? today : fyEnd;
                dateFilter = `AND i.date >= ? AND i.date <= ?`;
                dateParams = [effectiveStart, effectiveEnd];
            }
            else {
                // 'all' — show everything within fiscal year
                dateFilter = `AND i.date >= ? AND i.date <= ?`;
                dateParams = [fyStart, fyEnd];
            }
        }
        else {
            // No fiscal year — original behavior
            if (period === 'today') {
                dateFilter = `AND i.date >= ? AND i.date < DATE_ADD(?, INTERVAL 1 DAY)`;
                dateParams = [today, today];
            }
            else if (period === 'week') {
                dateFilter = `AND i.date >= DATE_SUB(?, INTERVAL 7 DAY)`;
                dateParams = [today];
            }
            else if (period === 'month') {
                dateFilter = `AND i.date >= DATE_SUB(?, INTERVAL 30 DAY)`;
                dateParams = [today];
            }
            // 'all' = no filter, no params
        }
        // Daily sales chart: 7 days within fiscal year
        let dailySalesFilter;
        let dailySalesParams;
        if (fyStart && fyEnd) {
            const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
            const effectiveStart = weekAgo >= fyStart ? weekAgo : fyStart;
            const effectiveEnd = today <= fyEnd ? today : fyEnd;
            dailySalesFilter = `WHERE date >= ? AND date <= ? AND status IN ('POSTED', 'COMPLETED', 'PARTIAL')`;
            dailySalesParams = [effectiveStart, effectiveEnd];
        }
        else {
            dailySalesFilter = `WHERE date >= DATE_SUB(?, INTERVAL 7 DAY) AND status IN ('POSTED', 'COMPLETED', 'PARTIAL')`;
            dailySalesParams = [today];
        }
        // Recent invoices: fiscal-year-aware, excluding employee/operational categories
        let recentInvoicesFilter = "WHERE COALESCE(i.voucherCategory, '') NOT IN ('expenses', 'employee_advance', 'employee_repay', 'salary', 'labour')";
        let recentInvoicesParams = [];
        if (fyStart && fyEnd) {
            recentInvoicesFilter += ` AND i.date >= ? AND i.date <= ?`;
            recentInvoicesParams = [fyStart, fyEnd];
        }
        // Run ALL queries in parallel for maximum throughput (15+ users hitting dashboard)
        const [[salesKpi], [treasuryKpi], [receivablesKpi], [payablesKpi], [dailySales], [topCustomers], [paymentStatus], [recentInvoices],] = yield Promise.all([
            // 1. Sales & Purchase KPIs
            conn.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN type IN ('SALE', 'INVOICE_SALE', 'SALE_INVOICE') THEN total ELSE 0 END), 0) as totalSales,
                    COALESCE(SUM(CASE WHEN type IN ('PURCHASE', 'INVOICE_PURCHASE', 'PURCHASE_INVOICE') THEN total ELSE 0 END), 0) as totalPurchases,
                    COALESCE(SUM(CASE WHEN type IN ('RETURN_SALE') THEN total ELSE 0 END), 0) as totalSaleReturns,
                    COALESCE(SUM(CASE WHEN type IN ('RETURN_PURCHASE') THEN total ELSE 0 END), 0) as totalPurchaseReturns,
                    COUNT(CASE WHEN type IN ('SALE', 'INVOICE_SALE', 'SALE_INVOICE') THEN 1 END) as saleCount,
                    COUNT(CASE WHEN type IN ('PURCHASE', 'INVOICE_PURCHASE', 'PURCHASE_INVOICE') THEN 1 END) as purchaseCount
                FROM invoices i
                WHERE status IN ('POSTED', 'COMPLETED', 'PARTIAL') ${dateFilter} ${branchFilter}
            `, dateParams),
            // 2. Treasury Balance (not date-filtered — balance is cumulative)
            conn.query(`
                SELECT 
                    COALESCE(SUM(balance), 0) as treasuryBalance
                FROM accounts 
                WHERE type = 'ASSET' AND (
                    code LIKE '1%' OR 
                    name LIKE '%خزينة%' OR name LIKE '%صندوق%' OR name LIKE '%بنك%' OR name LIKE '%كاش%'
                )
            `),
            // 3. Receivables (not date-filtered — balance is cumulative)
            conn.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) as totalReceivables,
                    COALESCE(SUM(CASE WHEN balance < 0 THEN ABS(balance) ELSE 0 END), 0) as totalOverpaid
                FROM partners 
                WHERE isCustomer = 1 OR isCustomer = true
            `),
            // 4. Payables (not date-filtered — balance is cumulative)
            conn.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) as totalPayables,
                    COALESCE(SUM(CASE WHEN balance < 0 THEN ABS(balance) ELSE 0 END), 0) as totalOverpaidSuppliers
                FROM partners 
                WHERE isSupplier = 1 OR isSupplier = true
            `),
            // 5. Daily Sales chart (7 days, clamped to fiscal year)
            conn.query(`
                SELECT 
                    DATE(date) as day,
                    COALESCE(SUM(CASE WHEN type IN ('SALE', 'INVOICE_SALE', 'SALE_INVOICE') THEN total ELSE 0 END), 0) as sales,
                    COALESCE(SUM(CASE WHEN type IN ('PURCHASE', 'INVOICE_PURCHASE', 'PURCHASE_INVOICE') THEN total ELSE 0 END), 0) as purchases
                FROM invoices 
                ${dailySalesFilter}
                GROUP BY DATE(date)
                ORDER BY day ASC
            `, dailySalesParams),
            // 6. Top 5 Customers (within fiscal year period)
            conn.query(`
                SELECT 
                    p.name,
                    COALESCE(SUM(i.total), 0) as totalAmount,
                    COUNT(i.id) as invoiceCount
                FROM invoices i
                JOIN partners p ON i.partnerId = p.id
                WHERE i.type IN ('SALE', 'INVOICE_SALE', 'SALE_INVOICE') AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL') ${dateFilter} ${branchFilter}
                GROUP BY p.id, p.name
                ORDER BY totalAmount DESC
                LIMIT 5
            `, dateParams),
            // 7. Payment status breakdown (within fiscal year period)
            conn.query(`
                SELECT 
                    CASE 
                        WHEN status = 'PAID' OR paymentMethod != 'CREDIT' THEN 'PAID'
                        WHEN paidAmount > 0 AND paidAmount < total THEN 'PARTIAL'
                        ELSE 'UNPAID'
                    END as paymentState,
                    COUNT(*) as count,
                    COALESCE(SUM(total), 0) as amount
                FROM invoices i
                WHERE type IN ('SALE', 'INVOICE_SALE', 'SALE_INVOICE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') ${dateFilter} ${branchFilter}
                GROUP BY paymentState
            `, dateParams),
            // 8. Recent invoices (last 10, within fiscal year)
            conn.query(`
                SELECT 
                    i.id, i.number, i.type, i.date, i.total, i.status, i.paymentMethod, i.paidAmount,
                    p.name as partnerName
                FROM invoices i
                LEFT JOIN partners p ON i.partnerId = p.id
                ${recentInvoicesFilter}
                ORDER BY i.date DESC, i.createdAt DESC
                LIMIT 10
            `, recentInvoicesParams),
        ]);
        conn.release();
        const stats = salesKpi[0] || {};
        const treasury = treasuryKpi[0] || {};
        const receivables = receivablesKpi[0] || {};
        const payables = payablesKpi[0] || {};
        const response = {
            period,
            fiscalYear: authReq.fiscalYearFilter ? {
                name: authReq.fiscalYearFilter.name,
                startDate: fyStart,
                endDate: fyEnd,
            } : null,
            kpis: {
                totalSales: parseFloat(stats.totalSales) || 0,
                totalPurchases: parseFloat(stats.totalPurchases) || 0,
                totalSaleReturns: parseFloat(stats.totalSaleReturns) || 0,
                totalPurchaseReturns: parseFloat(stats.totalPurchaseReturns) || 0,
                saleCount: parseInt(stats.saleCount) || 0,
                purchaseCount: parseInt(stats.purchaseCount) || 0,
                netSales: (parseFloat(stats.totalSales) || 0) - (parseFloat(stats.totalSaleReturns) || 0),
                treasuryBalance: parseFloat(treasury.treasuryBalance) || 0,
                totalReceivables: parseFloat(receivables.totalReceivables) || 0,
                totalPayables: parseFloat(payables.totalPayables) || 0,
            },
            charts: {
                dailySales: dailySales.map((d) => ({
                    day: d.day,
                    sales: parseFloat(d.sales) || 0,
                    purchases: parseFloat(d.purchases) || 0,
                })),
                topCustomers: topCustomers.map((c) => ({
                    name: c.name,
                    totalAmount: parseFloat(c.totalAmount) || 0,
                    invoiceCount: parseInt(c.invoiceCount) || 0,
                })),
                paymentStatus: paymentStatus.map((p) => ({
                    status: p.paymentState,
                    count: parseInt(p.count) || 0,
                    amount: parseFloat(p.amount) || 0,
                })),
            },
            recentInvoices: recentInvoices.map((inv) => ({
                id: inv.id,
                number: inv.number,
                type: inv.type,
                date: inv.date,
                total: parseFloat(inv.total) || 0,
                status: inv.status,
                paymentMethod: inv.paymentMethod,
                paidAmount: parseFloat(inv.paidAmount) || 0,
                partnerName: inv.partnerName || '',
            })),
        };
        // Cache the result for 30s — next users get instant response
        (yield Promise.resolve().then(() => __importStar(require('../utils/responseCache')))).responseCache.set(cacheKey, response, 30000);
        res.json(response);
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'dashboard stats');
    }
});
exports.getDashboardStats = getDashboardStats;
