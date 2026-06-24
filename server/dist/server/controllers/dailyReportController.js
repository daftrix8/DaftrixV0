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
exports.getBranchProfitability = getBranchProfitability;
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
        `(
      (${alias}.posShiftId IS NULL AND DATE(${alias}.date) = ?)
      OR
      (${alias}.posShiftId IS NOT NULL AND EXISTS (
        SELECT 1 FROM pos_shifts ps WHERE ps.id = ${alias}.posShiftId AND DATE(ps.openedAt) = ?
      ))
    )`,
        `${alias}.status IN ${POSTED_STATUSES}`,
    ];
    const params = [dateStr, dateStr];
    (0, branchFilter_1.appendBranchFilter)(conditions, params, req, alias);
    return { conditions, params };
}
// ── Main handler ───────────────────────────────────────────────
function getDailyBranchReport(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const authReq = req;
        const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
        let conn;
        try {
            const { heavyPool } = yield Promise.resolve().then(() => __importStar(require('../db')));
            conn = yield heavyPool.getConnection();
            // ── Static lookups (branches, banks, categories) ──
            const [branchRows] = yield conn.query('SELECT id, name FROM branches ORDER BY name');
            const [bankRows] = yield conn.query('SELECT id, name, accountId FROM banks ORDER BY name');
            const [categoryRows] = yield conn.query('SELECT id, name FROM categories ORDER BY name');
            const branches = branchRows;
            const banks = bankRows;
            // ── Build shared filters ──
            const { conditions: baseCond, params: baseParams } = buildInvoiceFilters(authReq, dateStr);
            const baseWhere = baseCond.join(' AND ');
            // ── Build independent queries with branch scopes & status isolation (Fix #1, #2, #3, #4, #5) ──
            const { branchId, isPrivileged } = (0, branchFilter_1.resolveBranchScope)(authReq);
            // Start / End balance params & conditions
            // CRITICAL FIX: Opening/closing bank balances must ALWAYS be unfiltered by branch to represent the true cash position.
            let jeBranchFilter = '';
            let startJeParams = [dateStr];
            let endJeParams = [dateStr];
            const bankCond = [];
            const bankParams = [];
            (0, branchFilter_1.appendBranchFilter)(bankCond, bankParams, authReq, 'b');
            const bankWhere = bankCond.length > 0 ? `WHERE ${bankCond.join(' AND ')}` : '';
            // Debts branch filter
            const debtCond = [];
            const debtParams = [];
            (0, branchFilter_1.appendBranchFilter)(debtCond, debtParams, authReq);
            const debtWhere = debtCond.length > 0 ? `WHERE ${debtCond.join(' AND ')}` : '';
            // Inventory value branch filter
            const invCond = ['ps.stock > 0'];
            const invParams = [];
            (0, branchFilter_1.appendBranchFilter)(invCond, invParams, authReq, 'w');
            const invWhere = invCond.join(' AND ');
            // Stock movements branch filter
            const smCond = [];
            const smParams = [];
            (0, branchFilter_1.appendBranchFilter)(smCond, smParams, authReq, 'w');
            const smWhere = smCond.length > 0 ? smCond.join(' AND ') : '1=1';
            // ── All heavy queries in parallel ──
            const [[salesByBranchMethod], [purchasesByBranch], [returnsByBranch], [receiptsByBranchBank], [paymentsByBranch], [categorySalesRows], [startBalanceRows], [endBalanceRows], [debtRows], [inventoryRow], [invMovementsRow], [partnerDetailRows],] = yield Promise.all([
                // 1. Sales per branch (fetch raw invoices to split payment breakdown correctly)
                conn.query(`SELECT COALESCE(i.branchId, w.branchId) AS branchId, i.total, i.paymentMethod, i.bankAccountId, i.bankName, i.paymentBreakdown, i.bankTransfers
         FROM invoices i
         LEFT JOIN warehouses w ON i.warehouseId = w.id
         WHERE i.type IN ${SALE_TYPES} AND ${baseWhere}`, [...baseParams]),
                // 2. Purchases per branch + supplier debt payments only
                // Only count PAYMENT invoices with voucherCategory = 'supplier' or 'labour' as debt payments
                conn.query(`SELECT COALESCE(i.branchId, b.branchId) AS branchId,
                COALESCE(SUM(CASE WHEN i.type IN ${PURCHASE_TYPES} THEN i.total ELSE 0 END), 0) AS purchases,
                COALESCE(SUM(CASE WHEN i.type IN ${PAYMENT_TYPES} AND (i.voucherCategory IN ('supplier','labour') OR COALESCE(p.type, '') = 'SUPPLIER' OR COALESCE(p.isSupplier, 0) = 1) THEN i.total ELSE 0 END), 0) AS debtPayments
         FROM invoices i
         LEFT JOIN partners p ON i.partnerId = p.id
         LEFT JOIN banks b ON i.bankAccountId = b.accountId
         WHERE (i.type IN ${PURCHASE_TYPES} OR (i.type IN ${PAYMENT_TYPES} AND (i.voucherCategory IN ('supplier','labour') OR COALESCE(p.type, '') = 'SUPPLIER' OR COALESCE(p.isSupplier, 0) = 1))) AND ${baseWhere}
         GROUP BY COALESCE(i.branchId, b.branchId)`, [...baseParams]),
                // 3. Returns per branch
                conn.query(`SELECT COALESCE(i.branchId, w.branchId) AS branchId,
                COALESCE(SUM(CASE WHEN i.type IN ${RETURN_SALE_TYPES}     THEN i.total ELSE 0 END), 0) AS saleReturns,
                COALESCE(SUM(CASE WHEN i.type IN ${RETURN_PURCHASE_TYPES} THEN i.total ELSE 0 END), 0) AS purchaseReturns
         FROM invoices i
         LEFT JOIN warehouses w ON i.warehouseId = w.id
         WHERE (i.type IN ${RETURN_SALE_TYPES} OR i.type IN ${RETURN_PURCHASE_TYPES}) AND ${baseWhere}
         GROUP BY COALESCE(i.branchId, w.branchId)`, [...baseParams]),
                // 4. Receipt vouchers (customer payments received) by branch × bank
                conn.query(`SELECT COALESCE(i.branchId, b.branchId) AS branchId, i.bankAccountId, i.bankName, i.paymentMethod,
                COALESCE(SUM(i.total), 0) AS amount
         FROM invoices i
         LEFT JOIN banks b ON i.bankAccountId = b.accountId
         WHERE i.type IN ${RECEIPT_TYPES} AND ${baseWhere}
         GROUP BY COALESCE(i.branchId, b.branchId), i.bankAccountId, i.bankName, i.paymentMethod`, [...baseParams]),
                // 5. Expense vouchers by branch (excluding supplier/labour debt payments to avoid double-counting)
                conn.query(`SELECT COALESCE(i.branchId, b.branchId) AS branchId,
                COALESCE(SUM(i.total), 0) AS totalPayments,
                i.voucherCategory
         FROM invoices i
         LEFT JOIN partners p ON i.partnerId = p.id
         LEFT JOIN banks b ON i.bankAccountId = b.accountId
         WHERE i.type IN ${PAYMENT_TYPES}
           AND NOT (COALESCE(i.voucherCategory, '') IN ('supplier', 'labour') OR COALESCE(p.type, '') = 'SUPPLIER' OR COALESCE(p.isSupplier, 0) = 1)
           AND ${baseWhere}
         GROUP BY COALESCE(i.branchId, b.branchId), i.voucherCategory`, [...baseParams]),
                // 6. Sales by product category (group by branch to allow dynamic client-side filtering)
                conn.query(`SELECT COALESCE(i.branchId, w.branchId) AS branchId, p.categoryId, c.name AS categoryName,
                COALESCE(SUM(il.total), 0) AS amount
         FROM invoice_lines il
         JOIN invoices i ON il.invoiceId = i.id
         LEFT JOIN warehouses w ON i.warehouseId = w.id
         LEFT JOIN products p ON il.productId = p.id
         LEFT JOIN categories c ON p.categoryId = c.id
         WHERE i.type IN ${SALE_TYPES} AND ${baseWhere}
         GROUP BY COALESCE(i.branchId, w.branchId), p.categoryId, c.name`, [...baseParams]),
                // 7. Start-of-day treasury balances (before the report date)
                conn.query(`SELECT b.id AS bankId, b.name AS bankName,
                COALESCE(a.openingBalance, 0)
                  + COALESCE(SUM(CASE WHEN DATE(je.date) < ? ${jeBranchFilter} THEN jl.debit - jl.credit ELSE 0 END), 0) AS balance
         FROM banks b
         LEFT JOIN accounts a ON a.id = b.accountId
         LEFT JOIN journal_lines jl ON jl.accountId = a.id
         LEFT JOIN journal_entries je ON je.id = jl.journalId
         ${bankWhere}
         GROUP BY b.id, b.name, a.openingBalance`, [...startJeParams, ...bankParams]),
                // 8. End-of-day treasury balances (through the report date)
                conn.query(`SELECT b.id AS bankId, b.name AS bankName,
                COALESCE(a.openingBalance, 0)
                  + COALESCE(SUM(CASE WHEN DATE(je.date) <= ? ${jeBranchFilter} THEN jl.debit - jl.credit ELSE 0 END), 0) AS balance
         FROM banks b
         LEFT JOIN accounts a ON a.id = b.accountId
         LEFT JOIN journal_lines jl ON jl.accountId = a.id
         LEFT JOIN journal_entries je ON je.id = jl.journalId
         ${bankWhere}
         GROUP BY b.id, b.name, a.openingBalance`, [...endJeParams, ...bankParams]),
                // 9. Total debts (partner balances — receivables & payables)
                // CRITICAL FIX: Payables represents supplier debt, which is negative (balance < 0) in the DB.
                conn.query(`SELECT
           COALESCE(SUM(CASE WHEN (isCustomer = 1 OR isCustomer = true) AND balance > 0 THEN balance ELSE 0 END), 0) AS receivables,
           COALESCE(SUM(CASE WHEN (isSupplier = 1 OR isSupplier = true) AND balance < 0 THEN ABS(balance) ELSE 0 END), 0) AS payables
         FROM partners ${debtWhere}`, [...debtParams]),
                // 10. Inventory value
                conn.query(`SELECT COALESCE(SUM(ps.stock * COALESCE(p.cost, p.price, 0)), 0) AS inventoryValue
         FROM product_stocks ps
         JOIN products p ON ps.productId = p.id
         JOIN warehouses w ON ps.warehouseId = w.id
         WHERE ${invWhere}`, [...invParams]),
                // 11. Historical inventory movements for start/end day calculation
                conn.query(`SELECT 
           COALESCE(SUM(CASE WHEN DATE(sm.movement_date) > ? THEN sm.qty_change * COALESCE(p.cost, p.price, 0) ELSE 0 END), 0) AS valAfter,
           COALESCE(SUM(CASE WHEN DATE(sm.movement_date) = ? THEN sm.qty_change * COALESCE(p.cost, p.price, 0) ELSE 0 END), 0) AS valDuring
         FROM stock_movements sm
         JOIN products p ON sm.product_id = p.id
         JOIN warehouses w ON sm.warehouse_id = w.id
         WHERE ${smWhere}`, [dateStr, dateStr, ...smParams]),
                // 12. Detailed customer balances for receivables details
                conn.query(`SELECT id, name, balance 
         FROM partners
         ${debtWhere ? debtWhere + ' AND' : 'WHERE'} (isCustomer = 1 OR isCustomer = true) AND balance > 0
         ORDER BY balance DESC`, [...debtParams]),
            ]);
            conn.release();
            conn = null;
            // ── Handle invoices with NULL branchId ──
            // If any SQL rows have null branchId, inject a virtual "unassigned" branch
            // so the assemblers can match and display the data.
            const allDataRows = [
                salesByBranchMethod, purchasesByBranch, returnsByBranch,
                receiptsByBranchBank, paymentsByBranch,
            ];
            const hasNullBranch = allDataRows.some(rows => (rows || []).some((r) => r.branchId == null));
            if (hasNullBranch) {
                const UNASSIGNED_ID = '__unassigned__';
                branches.push({ id: UNASSIGNED_ID, name: 'بدون فرع' });
                // Normalize null branchId → UNASSIGNED_ID in all result rows
                for (const rows of allDataRows) {
                    for (const r of (rows || [])) {
                        if (r.branchId == null)
                            r.branchId = UNASSIGNED_ID;
                    }
                }
            }
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
            // Category sales (map branchId to support dynamic branch filters)
            const categorySales = (categorySalesRows || []).map((r) => ({
                branchId: r.branchId || '__unassigned__',
                categoryId: r.categoryId || 'uncategorized',
                categoryName: r.categoryName || 'بدون تصنيف',
                amount: toNum(r.amount),
            }));
            // Treasury balances using start/end inventory values
            const currentVal = toNum((_a = inventoryRow === null || inventoryRow === void 0 ? void 0 : inventoryRow[0]) === null || _a === void 0 ? void 0 : _a.inventoryValue);
            const valAfter = toNum((_b = invMovementsRow === null || invMovementsRow === void 0 ? void 0 : invMovementsRow[0]) === null || _b === void 0 ? void 0 : _b.valAfter);
            const valDuring = toNum((_c = invMovementsRow === null || invMovementsRow === void 0 ? void 0 : invMovementsRow[0]) === null || _c === void 0 ? void 0 : _c.valDuring);
            const endInventoryVal = currentVal - valAfter;
            const startInventoryVal = endInventoryVal - valDuring;
            const startBalance = buildTreasurySnapshot(startBalanceRows, debtRows, startInventoryVal, partnerDetailRows);
            const endBalance = buildTreasurySnapshot(endBalanceRows, debtRows, endInventoryVal, partnerDetailRows);
            const startMinusEnd = endBalance.netBalance - startBalance.netBalance; // endMinusStart
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
                catch ( /* ignore */_d) { /* ignore */ }
            console.error('❌ Daily branch report failed:', error);
            res.status(500).json({ error: 'Failed to generate daily branch report' });
        }
    });
}
// ── Assemblers ─────────────────────────────────────────────────
// ── Helper parsing & bank matching utilities ──────────────────
function parseJsonField(value, fallback) {
    if (!value)
        return fallback;
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    }
    catch (_a) {
        return fallback;
    }
}
function findBankId(bankAccountId, bankName, bankIdByAccountId, bankIdByName) {
    if (bankAccountId) {
        const id = bankIdByAccountId.get(bankAccountId);
        if (id)
            return id;
    }
    if (bankName) {
        const id = bankIdByName.get(bankName.trim().toLowerCase());
        if (id)
            return id;
    }
    return null;
}
function addPaymentAmount(method, amount, accountId, accountName, byMethod, bankIdByAccountId, bankIdByName, banks) {
    if (method === 'CASH') {
        const matchedId = findBankId(accountId, accountName, bankIdByAccountId, bankIdByName);
        const target = matchedId || 'CASH';
        byMethod[target] = (byMethod[target] || 0) + amount;
    }
    else if (method === 'CREDIT' || method === 'DEFERRED') {
        byMethod['CREDIT'] = (byMethod['CREDIT'] || 0) + amount;
    }
    else if (method === 'BANK') {
        const matchedId = findBankId(accountId, accountName, bankIdByAccountId, bankIdByName);
        const target = matchedId || (banks.length > 0 ? banks[0].id : 'CASH');
        byMethod[target] = (byMethod[target] || 0) + amount;
    }
    else {
        const target = banks.length > 0 ? banks[0].id : 'CASH';
        byMethod[target] = (byMethod[target] || 0) + amount;
    }
}
function distributeInvoicePayments(inv, byMethod, bankIdByAccountId, bankIdByName, banks) {
    const invoiceTotal = toNum(inv.total);
    const paymentBreakdown = parseJsonField(inv.paymentBreakdown, null);
    const bankTransfers = parseJsonField(inv.bankTransfers, null);
    if (Array.isArray(paymentBreakdown) && paymentBreakdown.length > 0) {
        for (const item of paymentBreakdown) {
            addPaymentAmount(item.method, toNum(item.amount), item.accountId, item.accountName, byMethod, bankIdByAccountId, bankIdByName, banks);
        }
        return;
    }
    if (paymentBreakdown && typeof paymentBreakdown === 'object') {
        const cashAmount = toNum(paymentBreakdown.cash);
        if (cashAmount > 0) {
            byMethod['CASH'] = (byMethod['CASH'] || 0) + cashAmount;
        }
        let attributed = cashAmount;
        if (Array.isArray(bankTransfers)) {
            for (const trans of bankTransfers) {
                const amt = toNum(trans.amount);
                attributed += amt;
                const matchedId = findBankId(trans.bankId, trans.bankName, bankIdByAccountId, bankIdByName);
                const target = matchedId || (banks.length > 0 ? banks[0].id : 'CASH');
                byMethod[target] = (byMethod[target] || 0) + amt;
            }
        }
        const remainder = invoiceTotal - attributed;
        if (remainder > 0.01) {
            const isCredit = inv.paymentMethod === 'CREDIT' || inv.paymentMethod === 'DEFERRED';
            const target = isCredit ? 'CREDIT' : 'CASH';
            byMethod[target] = (byMethod[target] || 0) + remainder;
        }
        return;
    }
    if (Array.isArray(bankTransfers) && bankTransfers.length > 0) {
        for (const trans of bankTransfers) {
            const amt = toNum(trans.amount);
            const matchedId = findBankId(trans.bankId, trans.bankName, bankIdByAccountId, bankIdByName);
            const target = matchedId || (banks.length > 0 ? banks[0].id : 'CASH');
            byMethod[target] = (byMethod[target] || 0) + amt;
        }
        const totalTrans = bankTransfers.reduce((s, t) => s + toNum(t.amount), 0);
        const remainder = invoiceTotal - totalTrans;
        if (remainder > 0.01) {
            byMethod['CREDIT'] = (byMethod['CREDIT'] || 0) + remainder;
        }
        return;
    }
    // Fallback to simple paymentMethod
    addPaymentAmount(inv.paymentMethod, invoiceTotal, inv.bankAccountId, inv.bankName, byMethod, bankIdByAccountId, bankIdByName, banks);
}
function assembleBranchSales(branches, invoices, banks) {
    const bankIdByAccountId = new Map();
    const bankIdByName = new Map();
    for (const bank of banks) {
        if (bank.accountId)
            bankIdByAccountId.set(bank.accountId, bank.id);
        bankIdByName.set(bank.name.trim().toLowerCase(), bank.id);
    }
    return branches.map(branch => {
        const branchInvoices = invoices.filter(inv => inv.branchId === branch.id);
        const byMethod = {};
        byMethod['CASH'] = 0;
        byMethod['CREDIT'] = 0;
        for (const bank of banks) {
            byMethod[bank.id] = 0;
        }
        for (const inv of branchInvoices) {
            distributeInvoicePayments(inv, byMethod, bankIdByAccountId, bankIdByName, banks);
        }
        const totalSales = branchInvoices.reduce((s, inv) => s + toNum(inv.total), 0);
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
    const bankIdByAccountId = new Map();
    const bankIdByName = new Map();
    const mainTreasuryBank = banks.find(b => b.name === 'الخزينة الرئيسية');
    const mainTreasuryId = mainTreasuryBank === null || mainTreasuryBank === void 0 ? void 0 : mainTreasuryBank.id;
    for (const bank of banks) {
        if (bank.accountId)
            bankIdByAccountId.set(bank.accountId, bank.id);
        bankIdByName.set(bank.name.trim().toLowerCase(), bank.id);
    }
    return branches.map(branch => {
        const branchRows = rows.filter(r => r.branchId === branch.id);
        const byTreasury = {};
        byTreasury['CASH'] = 0;
        for (const bank of banks) {
            byTreasury[bank.id] = 0;
        }
        for (const r of branchRows) {
            const amount = toNum(r.amount);
            if (r.paymentMethod === 'CASH') {
                byTreasury['CASH'] += amount;
                continue;
            }
            const matchedId = findBankId(r.bankAccountId, r.bankName, bankIdByAccountId, bankIdByName);
            const target = matchedId || (banks.length > 0 ? banks[0].id : 'CASH');
            if (target === mainTreasuryId) {
                byTreasury['CASH'] += amount;
            }
            else {
                byTreasury[target] = (byTreasury[target] || 0) + amount;
            }
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
function buildTreasurySnapshot(balanceRows, debtRows, inventoryValue, partnerDetailRows) {
    const treasuries = (balanceRows || []).map((r) => ({
        bankId: r.bankId,
        bankName: r.bankName,
        balance: toNum(r.balance),
    }));
    const totalTreasury = treasuries.reduce((s, t) => s + t.balance, 0);
    const debts = (debtRows === null || debtRows === void 0 ? void 0 : debtRows[0]) || {};
    const receivables = toNum(debts.receivables);
    const payables = toNum(debts.payables);
    const receivablesDetails = (partnerDetailRows || []).map((r) => ({
        id: r.id,
        name: r.name,
        balance: toNum(r.balance),
    }));
    // CRITICAL FIX: Include customer receivables in totalAssets (Assets = Treasury + Inventory + Receivables)
    const totalAssets = totalTreasury + inventoryValue + receivables;
    const totalDebts = payables;
    const netBalance = totalAssets - totalDebts;
    return {
        treasuries,
        totalTreasury,
        inventoryValue,
        totalAssets,
        receivables,
        payables,
        totalDebts,
        netBalance,
        receivablesDetails
    };
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
// ── Branch Profitability Report ─────────────────────────────────
/**
 * GET /api/reports/branch-profitability?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=optional
 *
 * Computes gross profit (revenue − COGS), net profit (after expenses),
 * branch comparison, top/loss products, daily trends, and category profitability.
 * Uses existing invoice_lines.cost data — no schema changes needed.
 */
function getBranchProfitability(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const authReq = req;
        const today = new Date().toISOString().slice(0, 10);
        const firstOfMonth = today.slice(0, 7) + '-01';
        const fromDate = req.query.from || firstOfMonth;
        const toDate = req.query.to || today;
        const filterBranchId = req.query.branchId;
        let conn;
        try {
            const { heavyPool } = yield Promise.resolve().then(() => __importStar(require('../db')));
            conn = yield heavyPool.getConnection();
            // ── Static lookups ──
            const [branchRows] = yield conn.query('SELECT id, name FROM branches ORDER BY name');
            const branches = branchRows;
            // ── Build shared WHERE clause for invoice queries ──
            const baseCond = [
                'DATE(i.date) BETWEEN ? AND ?',
                `i.status IN ${POSTED_STATUSES}`,
            ];
            const baseParams = [fromDate, toDate];
            (0, branchFilter_1.appendBranchFilter)(baseCond, baseParams, authReq, 'i');
            if (filterBranchId) {
                baseCond.push('i.branchId = ?');
                baseParams.push(filterBranchId);
            }
            const baseWhere = baseCond.join(' AND ');
            // ── 6 parallel SQL queries ──
            const [[salesCogsRows], [returnsRows], [expenseRows], [topProductRows], [dailyTrendRows], [categorySaleRows],] = yield Promise.all([
                // 1. Sales revenue & COGS per branch
                conn.query(`SELECT COALESCE(i.branchId, w.branchId) AS branchId,
                COALESCE(SUM(il.total), 0) AS revenue,
                COALESCE(SUM(ABS(il.quantity) * COALESCE(NULLIF(il.cost, 0), NULLIF(pv.purchasePrice, 0), p.cost, 0)), 0) AS cogs
         FROM invoice_lines il
         JOIN invoices i ON il.invoiceId = i.id
         LEFT JOIN warehouses w ON i.warehouseId = w.id
         LEFT JOIN products p ON il.productId = p.id
         LEFT JOIN product_variants pv ON il.variantId = pv.id
         WHERE i.type IN ${SALE_TYPES} AND ${baseWhere}
         GROUP BY COALESCE(i.branchId, w.branchId)`, [...baseParams]),
                // 2. Returns per branch (reduces revenue / COGS)
                conn.query(`SELECT COALESCE(i.branchId, w.branchId) AS branchId,
                COALESCE(SUM(CASE WHEN i.type IN ${RETURN_SALE_TYPES}
                  THEN il.total ELSE 0 END), 0) AS saleReturnRevenue,
                COALESCE(SUM(CASE WHEN i.type IN ${RETURN_SALE_TYPES}
                  THEN ABS(il.quantity) * COALESCE(NULLIF(il.cost, 0), NULLIF(pv.purchasePrice, 0), p.cost, 0) ELSE 0 END), 0) AS saleReturnCogs
         FROM invoice_lines il
         JOIN invoices i ON il.invoiceId = i.id
         LEFT JOIN warehouses w ON i.warehouseId = w.id
         LEFT JOIN products p ON il.productId = p.id
         LEFT JOIN product_variants pv ON il.variantId = pv.id
         WHERE (i.type IN ${RETURN_SALE_TYPES}) AND ${baseWhere}
         GROUP BY COALESCE(i.branchId, w.branchId)`, [...baseParams]),
                // 3. Operating expenses per branch (excluding supplier/labour debt payments — those aren't expenses)
                conn.query(`SELECT COALESCE(i.branchId, b.branchId) AS branchId, i.voucherCategory,
                COALESCE(SUM(i.total), 0) AS amount
         FROM invoices i
         LEFT JOIN partners p ON i.partnerId = p.id
         LEFT JOIN banks b ON i.bankAccountId = b.accountId
         WHERE i.type IN ${PAYMENT_TYPES}
           AND NOT (COALESCE(i.voucherCategory, '') IN ('supplier', 'labour') OR COALESCE(p.type, '') = 'SUPPLIER' OR COALESCE(p.isSupplier, 0) = 1)
           AND ${baseWhere}
         GROUP BY COALESCE(i.branchId, b.branchId), i.voucherCategory`, [...baseParams]),
                // 4. Top products by gross profit (limited to 50)
                conn.query(`SELECT COALESCE(i.branchId, w.branchId) AS branchId, il.productId, il.productName,
                COALESCE(SUM(il.total), 0) AS revenue,
                COALESCE(SUM(ABS(il.quantity) * COALESCE(NULLIF(il.cost, 0), NULLIF(pv.purchasePrice, 0), p.cost, 0)), 0) AS cogs,
                COALESCE(SUM(il.total), 0) - COALESCE(SUM(ABS(il.quantity) * COALESCE(NULLIF(il.cost, 0), NULLIF(pv.purchasePrice, 0), p.cost, 0)), 0) AS grossProfit,
                COALESCE(SUM(ABS(il.quantity)), 0) AS totalQty
         FROM invoice_lines il
         JOIN invoices i ON il.invoiceId = i.id
         LEFT JOIN warehouses w ON i.warehouseId = w.id
         LEFT JOIN products p ON il.productId = p.id
         LEFT JOIN product_variants pv ON il.variantId = pv.id
         WHERE i.type IN ${SALE_TYPES} AND ${baseWhere}
         GROUP BY COALESCE(i.branchId, w.branchId), il.productId, il.productName
         ORDER BY grossProfit DESC
         LIMIT 50`, [...baseParams]),
                // 5. Daily profit trend (for sparkline)
                conn.query(`SELECT DATE(i.date) AS trendDate,
                COALESCE(SUM(CASE WHEN i.type IN ${SALE_TYPES} THEN il.total ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN i.type IN ${SALE_TYPES}
                  THEN ABS(il.quantity) * COALESCE(NULLIF(il.cost, 0), NULLIF(pv.purchasePrice, 0), p.cost, 0) ELSE 0 END), 0) AS cogs
         FROM invoice_lines il
         JOIN invoices i ON il.invoiceId = i.id
         LEFT JOIN products p ON il.productId = p.id
         LEFT JOIN product_variants pv ON il.variantId = pv.id
         WHERE (i.type IN ${SALE_TYPES} OR i.type IN ${RETURN_SALE_TYPES}) AND ${baseWhere}
         GROUP BY DATE(i.date)
         ORDER BY trendDate ASC`, [...baseParams]),
                // 6. Sales by category per branch
                conn.query(`SELECT COALESCE(i.branchId, w.branchId) AS branchId, p.categoryId, c.name AS categoryName,
                COALESCE(SUM(il.total), 0) AS revenue,
                COALESCE(SUM(ABS(il.quantity) * COALESCE(NULLIF(il.cost, 0), NULLIF(pv.purchasePrice, 0), p.cost, 0)), 0) AS cogs
         FROM invoice_lines il
         JOIN invoices i ON il.invoiceId = i.id
         LEFT JOIN warehouses w ON i.warehouseId = w.id
         LEFT JOIN products p ON il.productId = p.id
         LEFT JOIN product_variants pv ON il.variantId = pv.id
         LEFT JOIN categories c ON p.categoryId = c.id
         WHERE i.type IN ${SALE_TYPES} AND ${baseWhere}
         GROUP BY COALESCE(i.branchId, w.branchId), p.categoryId, c.name`, [...baseParams]),
            ]);
            // ── Daily expenses for trend (separate query since it's from invoices, not lines) ──
            const [dailyExpenseRows] = yield conn.query(`SELECT DATE(i.date) AS trendDate,
              COALESCE(SUM(i.total), 0) AS expenses
       FROM invoices i
       LEFT JOIN partners p ON i.partnerId = p.id
       WHERE i.type IN ${PAYMENT_TYPES}
         AND NOT (COALESCE(i.voucherCategory, '') IN ('supplier', 'labour') OR COALESCE(p.type, '') = 'SUPPLIER' OR COALESCE(p.isSupplier, 0) = 1)
         AND ${baseWhere}
       GROUP BY DATE(i.date)`, [...baseParams]);
            conn.release();
            conn = null;
            // ── Handle invoices with NULL branchId ──
            const profitDataRows = [
                salesCogsRows, returnsRows, expenseRows, topProductRows, categorySaleRows,
            ];
            const hasNullBranch = profitDataRows.some(rows => (rows || []).some((r) => r.branchId == null));
            if (hasNullBranch) {
                const UNASSIGNED_ID = '__unassigned__';
                branches.push({ id: UNASSIGNED_ID, name: 'بدون فرع' });
                for (const rows of profitDataRows) {
                    for (const r of (rows || [])) {
                        if (r.branchId == null)
                            r.branchId = UNASSIGNED_ID;
                    }
                }
            }
            // ── Assemble branch profitability ──
            const branchProfitability = branches.map(branch => {
                const salesRow = (salesCogsRows || []).find((r) => r.branchId === branch.id);
                const returnRow = (returnsRows || []).find((r) => r.branchId === branch.id);
                const branchExpenseRows = (expenseRows || []).filter((r) => r.branchId === branch.id);
                const revenue = toNum(salesRow === null || salesRow === void 0 ? void 0 : salesRow.revenue);
                const cogs = toNum(salesRow === null || salesRow === void 0 ? void 0 : salesRow.cogs);
                const saleReturns = toNum(returnRow === null || returnRow === void 0 ? void 0 : returnRow.saleReturnRevenue);
                const saleReturnCogs = toNum(returnRow === null || returnRow === void 0 ? void 0 : returnRow.saleReturnCogs);
                const netRevenue = revenue - saleReturns;
                const netCogs = cogs - saleReturnCogs;
                const grossProfit = netRevenue - netCogs;
                const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
                const expensesByCategory = {};
                let totalExpenses = 0;
                for (const row of branchExpenseRows) {
                    const cat = row.voucherCategory || 'عام';
                    const amt = toNum(row.amount);
                    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + amt;
                    totalExpenses += amt;
                }
                const netProfit = grossProfit - totalExpenses;
                const netMarginPct = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;
                return {
                    branchId: branch.id,
                    branchName: branch.name,
                    revenue,
                    cogs,
                    saleReturns,
                    netRevenue,
                    netCogs,
                    grossProfit,
                    grossMarginPct: Number(grossMarginPct.toFixed(1)),
                    expenses: totalExpenses,
                    expensesByCategory,
                    netProfit,
                    netMarginPct: Number(netMarginPct.toFixed(1)),
                };
            });
            // ── Top & loss products ──
            const topProducts = (topProductRows || []).map((r) => {
                const rev = toNum(r.revenue);
                const cost = toNum(r.cogs);
                const profit = toNum(r.grossProfit);
                return {
                    branchId: r.branchId,
                    productId: r.productId,
                    productName: r.productName || 'بدون اسم',
                    revenue: rev,
                    cogs: cost,
                    grossProfit: profit,
                    marginPct: rev > 0 ? Number(((profit / rev) * 100).toFixed(1)) : 0,
                    totalQty: toNum(r.totalQty),
                };
            });
            const lossProducts = topProducts.filter(p => p.grossProfit < 0);
            // ── Daily trend ──
            const expenseMap = new Map();
            for (const row of (dailyExpenseRows || [])) {
                const dateKey = typeof row.trendDate === 'string'
                    ? row.trendDate.slice(0, 10)
                    : new Date(row.trendDate).toISOString().slice(0, 10);
                expenseMap.set(dateKey, toNum(row.expenses));
            }
            const dailyTrend = (dailyTrendRows || []).map((r) => {
                const dateKey = typeof r.trendDate === 'string'
                    ? r.trendDate.slice(0, 10)
                    : new Date(r.trendDate).toISOString().slice(0, 10);
                const rev = toNum(r.revenue);
                const cost = toNum(r.cogs);
                const gross = rev - cost;
                const expenses = expenseMap.get(dateKey) || 0;
                return {
                    date: dateKey,
                    revenue: rev,
                    cogs: cost,
                    grossProfit: gross,
                    expenses,
                    netProfit: gross - expenses,
                };
            });
            // ── Category profitability ──
            const categoryProfitability = (categorySaleRows || []).map((r) => {
                const rev = toNum(r.revenue);
                const cost = toNum(r.cogs);
                const profit = rev - cost;
                return {
                    branchId: r.branchId,
                    categoryId: r.categoryId || 'uncategorized',
                    categoryName: r.categoryName || 'بدون تصنيف',
                    revenue: rev,
                    cogs: cost,
                    grossProfit: profit,
                    marginPct: rev > 0 ? Number(((profit / rev) * 100).toFixed(1)) : 0,
                };
            });
            // ── Totals across all branches ──
            const totals = branchProfitability.reduce((acc, b) => ({
                revenue: acc.revenue + b.revenue,
                cogs: acc.cogs + b.netCogs,
                grossProfit: acc.grossProfit + b.grossProfit,
                expenses: acc.expenses + b.expenses,
                netProfit: acc.netProfit + b.netProfit,
                saleReturns: acc.saleReturns + b.saleReturns,
            }), { revenue: 0, cogs: 0, grossProfit: 0, expenses: 0, netProfit: 0, saleReturns: 0 });
            const totalNetRevenue = totals.revenue - totals.saleReturns;
            res.json({
                dateRange: { from: fromDate, to: toDate },
                branches,
                branchProfitability,
                topProducts,
                lossProducts,
                dailyTrend,
                categoryProfitability,
                totals: Object.assign(Object.assign({}, totals), { netRevenue: totalNetRevenue, grossMarginPct: totalNetRevenue > 0
                        ? Number(((totals.grossProfit / totalNetRevenue) * 100).toFixed(1))
                        : 0, netMarginPct: totalNetRevenue > 0
                        ? Number(((totals.netProfit / totalNetRevenue) * 100).toFixed(1))
                        : 0 }),
            });
        }
        catch (error) {
            if (conn)
                try {
                    conn.release();
                }
                catch ( /* ignore */_a) { /* ignore */ }
            console.error('❌ Branch profitability report failed:', error);
            res.status(500).json({ error: 'Failed to generate branch profitability report' });
        }
    });
}
