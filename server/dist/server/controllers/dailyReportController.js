"use strict";
/**
 * Daily Branch Financial Report Controller
 *
 * Produces the "Daily Transaction Sheet" — a comprehensive financial
 * snapshot for a single day, broken down by branch and payment method.
 *
 * Mirrors the Shamshon Vapor's CLUB PDF layout but is fully generic:
 * branches, banks, and product categories are all loaded dynamically.
 */
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
exports.getDailyBranchReport = getDailyBranchReport;
const branchFilter_1 = require("../utils/branchFilter");
// ── Helpers ────────────────────────────────────────────────────
const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const SALE_TYPES = `('SALE','INVOICE_SALE','SALE_INVOICE')`;
const PURCHASE_TYPES = `('PURCHASE','INVOICE_PURCHASE','PURCHASE_INVOICE')`;
const RETURN_SALE_TYPES = `('RETURN_SALE')`;
const RETURN_PURCHASE_TYPES = `('RETURN_PURCHASE')`;
const RECEIPT_TYPES = `('RECEIPT')`;
const PAYMENT_TYPES = `('PAYMENT')`;
const POSTED_STATUSES = `('POSTED','COMPLETED','PARTIAL')`;
/**
 * Builds date + branch WHERE conditions for invoice queries.
 * Returns { conditions: string[], params: unknown[] } ready to be AND-joined.
 */
function buildInvoiceFilters(req, dateStr, alias = 'i') {
    const conditions = [
        `DATE(${alias}.date) = ?`,
        `${alias}.status IN ${POSTED_STATUSES}`,
    ];
    const params = [dateStr];
    (0, branchFilter_1.appendBranchFilter)(conditions, params, req, alias);
    return { conditions, params };
}
// ── Main handler ───────────────────────────────────────────────
function getDailyBranchReport(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const authReq = req;
        const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
        let conn;
        try {
            const { heavyPool } = yield Promise.resolve().then(() => __importStar(require('../db')));
            conn = yield heavyPool.getConnection();
            // ── Static lookups (branches, banks, categories) ──
            const [branchRows] = yield conn.query('SELECT id, name FROM branches ORDER BY name');
            const [bankRows] = yield conn.query('SELECT id, name FROM banks ORDER BY name');
            const [categoryRows] = yield conn.query('SELECT id, name FROM categories ORDER BY name');
            const branches = branchRows;
            const banks = bankRows;
            // ── Build shared filters ──
            const { conditions: baseCond, params: baseParams } = buildInvoiceFilters(authReq, dateStr);
            const baseWhere = baseCond.join(' AND ');
            // ── All heavy queries in parallel ──
            const [[salesByBranchMethod], [purchasesByBranch], [returnsByBranch], [receiptsByBranchBank], [paymentsByBranch], [categorySalesRows], [startBalanceRows], [endBalanceRows], [debtRows], [inventoryRow],] = yield Promise.all([
                // 1. Sales per branch × payment method / bank
                conn.query(`SELECT i.branchId, i.paymentMethod, i.bankAccountId, COALESCE(SUM(i.total), 0) AS amount
         FROM invoices i
         WHERE i.type IN ${SALE_TYPES} AND ${baseWhere}
         GROUP BY i.branchId, i.paymentMethod, i.bankAccountId`, [...baseParams]),
                // 2. Purchases per branch + payments to suppliers (debt settlement)
                conn.query(`SELECT i.branchId,
                COALESCE(SUM(CASE WHEN i.type IN ${PURCHASE_TYPES} THEN i.total ELSE 0 END), 0) AS purchases,
                COALESCE(SUM(CASE WHEN i.type IN ${PAYMENT_TYPES}  THEN i.total ELSE 0 END), 0) AS debtPayments
         FROM invoices i
         WHERE (i.type IN ${PURCHASE_TYPES} OR i.type IN ${PAYMENT_TYPES}) AND ${baseWhere}
         GROUP BY i.branchId`, [...baseParams]),
                // 3. Returns per branch
                conn.query(`SELECT i.branchId,
                COALESCE(SUM(CASE WHEN i.type IN ${RETURN_SALE_TYPES}     THEN i.total ELSE 0 END), 0) AS saleReturns,
                COALESCE(SUM(CASE WHEN i.type IN ${RETURN_PURCHASE_TYPES} THEN i.total ELSE 0 END), 0) AS purchaseReturns
         FROM invoices i
         WHERE (i.type IN ${RETURN_SALE_TYPES} OR i.type IN ${RETURN_PURCHASE_TYPES}) AND ${baseWhere}
         GROUP BY i.branchId`, [...baseParams]),
                // 4. Receipt vouchers (customer payments received) by branch × bank
                conn.query(`SELECT i.branchId, i.bankAccountId, i.paymentMethod,
                COALESCE(SUM(i.total), 0) AS amount
         FROM invoices i
         WHERE i.type IN ${RECEIPT_TYPES} AND ${baseWhere}
         GROUP BY i.branchId, i.bankAccountId, i.paymentMethod`, [...baseParams]),
                // 5. Payment vouchers (expenses/supplier payments) by branch
                conn.query(`SELECT i.branchId,
                COALESCE(SUM(i.total), 0) AS totalPayments,
                i.voucherCategory
         FROM invoices i
         WHERE i.type IN ${PAYMENT_TYPES} AND ${baseWhere}
         GROUP BY i.branchId, i.voucherCategory`, [...baseParams]),
                // 6. Sales by product category
                conn.query(`SELECT p.categoryId, c.name AS categoryName,
                COALESCE(SUM(il.total), 0) AS amount
         FROM invoice_lines il
         JOIN invoices i ON il.invoiceId = i.id
         LEFT JOIN products p ON il.productId = p.id
         LEFT JOIN categories c ON p.categoryId = c.id
         WHERE i.type IN ${SALE_TYPES} AND ${baseWhere}
         GROUP BY p.categoryId, c.name`, [...baseParams]),
                // 7. Start-of-day treasury balances (before the report date)
                conn.query(`SELECT b.id AS bankId, b.name AS bankName,
                COALESCE(a.openingBalance, 0)
                  + COALESCE(SUM(CASE WHEN DATE(je.date) < ? THEN jl.debit - jl.credit ELSE 0 END), 0) AS balance
         FROM banks b
         LEFT JOIN accounts a ON a.id = b.accountId
         LEFT JOIN journal_lines jl ON jl.accountId = a.id
         LEFT JOIN journal_entries je ON je.id = jl.journalId
         GROUP BY b.id, b.name, a.openingBalance`, [dateStr]),
                // 8. End-of-day treasury balances (through the report date)
                conn.query(`SELECT b.id AS bankId, b.name AS bankName,
                COALESCE(a.openingBalance, 0)
                  + COALESCE(SUM(CASE WHEN DATE(je.date) <= ? THEN jl.debit - jl.credit ELSE 0 END), 0) AS balance
         FROM banks b
         LEFT JOIN accounts a ON a.id = b.accountId
         LEFT JOIN journal_lines jl ON jl.accountId = a.id
         LEFT JOIN journal_entries je ON je.id = jl.journalId
         GROUP BY b.id, b.name, a.openingBalance`, [dateStr]),
                // 9. Total debts (partner balances — receivables & payables)
                conn.query(`SELECT
           COALESCE(SUM(CASE WHEN (isCustomer = 1 OR isCustomer = true) AND balance > 0 THEN balance ELSE 0 END), 0) AS receivables,
           COALESCE(SUM(CASE WHEN (isSupplier = 1 OR isSupplier = true) AND balance > 0 THEN balance ELSE 0 END), 0) AS payables
         FROM partners`),
                // 10. Inventory value
                conn.query(`SELECT COALESCE(SUM(ps.stock * COALESCE(p.cost, p.price, 0)), 0) AS inventoryValue
         FROM product_stocks ps
         JOIN products p ON ps.productId = p.id
         WHERE ps.stock > 0`),
            ]);
            conn.release();
            conn = null;
            // ── Assemble response ──
            // Sales by branch × method
            const branchSales = assembleBranchSales(branches, salesByBranchMethod, banks);
            // Purchases/debt by branch
            const branchPurchases = assembleBranchPurchases(branches, purchasesByBranch);
            // Returns by branch
            const branchReturns = assembleBranchReturns(branches, returnsByBranch);
            // Receipts (equity received) by branch × bank
            const branchEquity = assembleBranchEquity(branches, receiptsByBranchBank, banks);
            // Expenses by branch
            const branchExpenses = assembleBranchExpenses(branches, paymentsByBranch);
            // Category sales
            const categorySales = (categorySalesRows || []).map((r) => ({
                categoryId: r.categoryId || 'uncategorized',
                categoryName: r.categoryName || 'بدون تصنيف',
                amount: toNum(r.amount),
            }));
            // Treasury balances
            const startBalance = buildTreasurySnapshot(startBalanceRows, debtRows, inventoryRow);
            const endBalance = buildTreasurySnapshot(endBalanceRows, debtRows, inventoryRow);
            const startMinusEnd = startBalance.netBalance - endBalance.netBalance;
            // End-shift summary (computed aggregates)
            const endShiftSummary = buildEndShiftSummary(branchEquity, branchPurchases, branchReturns, branchExpenses);
            res.json({
                date: dateStr,
                branches,
                banks,
                categories: categoryRows,
                startBalance,
                endBalance: Object.assign(Object.assign({}, endBalance), { startMinusEnd }),
                branchSales,
                branchPurchases,
                branchReturns,
                branchEquity,
                branchExpenses,
                categorySales,
                endShiftSummary,
            });
        }
        catch (error) {
            if (conn)
                try {
                    conn.release();
                }
                catch ( /* ignore */_a) { /* ignore */ }
            console.error('❌ Daily branch report failed:', error);
            res.status(500).json({ error: 'Failed to generate daily branch report' });
        }
    });
}
// ── Assemblers ─────────────────────────────────────────────────
function assembleBranchSales(branches, rows, banks) {
    return branches.map(branch => {
        const branchRows = rows.filter(r => r.branchId === branch.id);
        const byMethod = {};
        // Sum CASH directly
        const cashRows = branchRows.filter(r => r.paymentMethod === 'CASH');
        byMethod['CASH'] = cashRows.reduce((s, r) => s + toNum(r.amount), 0);
        // Sum by bank
        for (const bank of banks) {
            const bankRows = branchRows.filter(r => r.bankAccountId === bank.id);
            byMethod[bank.id] = bankRows.reduce((s, r) => s + toNum(r.amount), 0);
        }
        // CREDIT sales (no bank)
        const creditRows = branchRows.filter(r => r.paymentMethod === 'CREDIT' && !r.bankAccountId);
        byMethod['CREDIT'] = creditRows.reduce((s, r) => s + toNum(r.amount), 0);
        const totalSales = branchRows.reduce((s, r) => s + toNum(r.amount), 0);
        return { branchId: branch.id, branchName: branch.name, byMethod, totalSales };
    });
}
function assembleBranchPurchases(branches, rows) {
    return branches.map(branch => {
        const row = rows.find(r => r.branchId === branch.id);
        return {
            branchId: branch.id,
            branchName: branch.name,
            purchases: toNum(row === null || row === void 0 ? void 0 : row.purchases),
            debtPayments: toNum(row === null || row === void 0 ? void 0 : row.debtPayments),
        };
    });
}
function assembleBranchReturns(branches, rows) {
    return branches.map(branch => {
        const row = rows.find(r => r.branchId === branch.id);
        return {
            branchId: branch.id,
            branchName: branch.name,
            saleReturns: toNum(row === null || row === void 0 ? void 0 : row.saleReturns),
            purchaseReturns: toNum(row === null || row === void 0 ? void 0 : row.purchaseReturns),
        };
    });
}
function assembleBranchEquity(branches, rows, banks) {
    return branches.map(branch => {
        const branchRows = rows.filter(r => r.branchId === branch.id);
        const byTreasury = {};
        // CASH receipts → main treasury
        const cashRows = branchRows.filter(r => r.paymentMethod === 'CASH');
        byTreasury['CASH'] = cashRows.reduce((s, r) => s + toNum(r.amount), 0);
        // By bank
        for (const bank of banks) {
            const bankRows = branchRows.filter(r => r.bankAccountId === bank.id);
            byTreasury[bank.id] = bankRows.reduce((s, r) => s + toNum(r.amount), 0);
        }
        const totalReceived = branchRows.reduce((s, r) => s + toNum(r.amount), 0);
        return { branchId: branch.id, branchName: branch.name, byTreasury, totalReceived };
    });
}
function assembleBranchExpenses(branches, rows) {
    return branches.map(branch => {
        const branchRows = rows.filter(r => r.branchId === branch.id);
        const totalExpenses = branchRows.reduce((s, r) => s + toNum(r.totalPayments), 0);
        const byCategory = {};
        for (const row of branchRows) {
            const cat = row.voucherCategory || 'عام';
            byCategory[cat] = (byCategory[cat] || 0) + toNum(row.totalPayments);
        }
        return { branchId: branch.id, branchName: branch.name, totalExpenses, byCategory };
    });
}
function buildTreasurySnapshot(balanceRows, debtRows, inventoryRow) {
    var _a;
    const treasuries = (balanceRows || []).map((r) => ({
        bankId: r.bankId,
        bankName: r.bankName,
        balance: toNum(r.balance),
    }));
    const totalTreasury = treasuries.reduce((s, t) => s + t.balance, 0);
    const inventoryValue = toNum((_a = inventoryRow === null || inventoryRow === void 0 ? void 0 : inventoryRow[0]) === null || _a === void 0 ? void 0 : _a.inventoryValue);
    const totalAssets = totalTreasury + inventoryValue;
    const debts = (debtRows === null || debtRows === void 0 ? void 0 : debtRows[0]) || {};
    const receivables = toNum(debts.receivables);
    const payables = toNum(debts.payables);
    const totalDebts = payables;
    const netBalance = totalAssets - totalDebts;
    return { treasuries, totalTreasury, inventoryValue, totalAssets, receivables, payables, totalDebts, netBalance };
}
function buildEndShiftSummary(branchEquity, branchPurchases, branchReturns, branchExpenses) {
    const totalReceived = branchEquity.reduce((s, b) => s + b.totalReceived, 0);
    const totalPurchases = branchPurchases.reduce((s, b) => s + b.purchases, 0);
    const totalDebtPayments = branchPurchases.reduce((s, b) => s + b.debtPayments, 0);
    const totalReturns = branchReturns.reduce((s, b) => s + b.saleReturns + b.purchaseReturns, 0);
    const totalExpenses = branchExpenses.reduce((s, b) => s + b.totalExpenses, 0);
    return {
        receivedEquity: [
            { label: 'إجمالي المستلم', amount: totalReceived },
        ],
        supplierMovements: [
            { label: 'المشتريات', amount: totalPurchases },
            { label: 'المرتجعات', amount: totalReturns },
            { label: 'سداد ديون', amount: totalDebtPayments },
            { label: 'إجمالي المدفوعات', amount: totalPurchases + totalDebtPayments },
        ],
        dailyExpenses: [
            { label: 'إجمالي المصروفات', amount: totalExpenses },
        ],
    };
}
