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
exports.getFinancialRatios = exports.getStatementOfAccounts = exports.getCashFlowStatement = exports.getAccountsPayableAging = exports.getAccountsReceivableAging = void 0;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
// ═══════════════════════════════════════════════════════════
// ACCOUNTS RECEIVABLE AGING REPORT
// Shows customer outstanding balances grouped by aging buckets
// ═══════════════════════════════════════════════════════════
const getAccountsReceivableAging = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { asOfDate, partnerId } = req.query;
        const refDate = asOfDate ? String(asOfDate) : new Date().toISOString().split('T')[0];
        let query = `
            SELECT 
                p.id as partnerId,
                p.name as partnerName,
                p.code as partnerCode,
                i.id as invoiceId,
                i.number as invoiceNumber,
                i.date as invoiceDate,
                i.total as invoiceTotal,
                DATEDIFF(?, i.date) as ageDays,
                i.total - COALESCE(
                    (SELECT SUM(t.amount) FROM transactions t 
                     WHERE t.partnerId = i.partnerId 
                       AND t.type IN ('RECEIPT') 
                       AND t.invoiceId = i.id), 0
                ) as outstanding
            FROM invoices i
            JOIN partners p ON i.partnerId = p.id
            WHERE i.type = 'SALE' 
              AND i.status != 'VOID'
              AND i.date <= ?
              AND p.isSupplier = 0
        `;
        const params = [refDate, refDate];
        if (partnerId) {
            query += ' AND i.partnerId = ?';
            params.push(partnerId);
        }
        query += ' ORDER BY p.name, i.date';
        const [rows] = yield conn.query(query, params);
        // Group into aging buckets per partner
        const partnerMap = new Map();
        for (const row of rows) {
            const outstanding = parseFloat(row.outstanding) || 0;
            if (outstanding <= 0.01)
                continue; // Skip fully paid invoices
            if (!partnerMap.has(row.partnerId)) {
                partnerMap.set(row.partnerId, {
                    partnerId: row.partnerId,
                    partnerName: row.partnerName,
                    partnerCode: row.partnerCode,
                    current: 0, // 0-30 days
                    days31to60: 0,
                    days61to90: 0,
                    over90: 0,
                    totalOutstanding: 0,
                    invoices: []
                });
            }
            const partner = partnerMap.get(row.partnerId);
            const age = row.ageDays || 0;
            if (age <= 30)
                partner.current += outstanding;
            else if (age <= 60)
                partner.days31to60 += outstanding;
            else if (age <= 90)
                partner.days61to90 += outstanding;
            else
                partner.over90 += outstanding;
            partner.totalOutstanding += outstanding;
            partner.invoices.push({
                invoiceId: row.invoiceId,
                invoiceNumber: row.invoiceNumber,
                invoiceDate: row.invoiceDate,
                invoiceTotal: row.invoiceTotal,
                outstanding,
                ageDays: age
            });
        }
        conn.release();
        const result = Array.from(partnerMap.values());
        const totals = result.reduce((acc, p) => ({
            current: acc.current + p.current,
            days31to60: acc.days31to60 + p.days31to60,
            days61to90: acc.days61to90 + p.days61to90,
            over90: acc.over90 + p.over90,
            totalOutstanding: acc.totalOutstanding + p.totalOutstanding
        }), { current: 0, days31to60: 0, days61to90: 0, over90: 0, totalOutstanding: 0 });
        res.json({ partners: result, totals, asOfDate: refDate });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'accounts receivable aging');
    }
});
exports.getAccountsReceivableAging = getAccountsReceivableAging;
// ═══════════════════════════════════════════════════════════
// ACCOUNTS PAYABLE AGING REPORT (Same logic, for suppliers)
// ═══════════════════════════════════════════════════════════
const getAccountsPayableAging = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { asOfDate, partnerId } = req.query;
        const refDate = asOfDate ? String(asOfDate) : new Date().toISOString().split('T')[0];
        let query = `
            SELECT 
                p.id as partnerId,
                p.name as partnerName,
                p.code as partnerCode,
                i.id as invoiceId,
                i.number as invoiceNumber,
                i.date as invoiceDate,
                i.total as invoiceTotal,
                DATEDIFF(?, i.date) as ageDays,
                i.total - COALESCE(
                    (SELECT SUM(t.amount) FROM transactions t 
                     WHERE t.partnerId = i.partnerId 
                       AND t.type IN ('PAYMENT') 
                       AND t.invoiceId = i.id), 0
                ) as outstanding
            FROM invoices i
            JOIN partners p ON i.partnerId = p.id
            WHERE i.type = 'PURCHASE' 
              AND i.status != 'VOID'
              AND i.date <= ?
              AND p.isSupplier = 1
        `;
        const params = [refDate, refDate];
        if (partnerId) {
            query += ' AND i.partnerId = ?';
            params.push(partnerId);
        }
        query += ' ORDER BY p.name, i.date';
        const [rows] = yield conn.query(query, params);
        const partnerMap = new Map();
        for (const row of rows) {
            const outstanding = parseFloat(row.outstanding) || 0;
            if (outstanding <= 0.01)
                continue;
            if (!partnerMap.has(row.partnerId)) {
                partnerMap.set(row.partnerId, {
                    partnerId: row.partnerId,
                    partnerName: row.partnerName,
                    partnerCode: row.partnerCode,
                    current: 0, days31to60: 0, days61to90: 0, over90: 0,
                    totalOutstanding: 0, invoices: []
                });
            }
            const partner = partnerMap.get(row.partnerId);
            const age = row.ageDays || 0;
            if (age <= 30)
                partner.current += outstanding;
            else if (age <= 60)
                partner.days31to60 += outstanding;
            else if (age <= 90)
                partner.days61to90 += outstanding;
            else
                partner.over90 += outstanding;
            partner.totalOutstanding += outstanding;
            partner.invoices.push({
                invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber,
                invoiceDate: row.invoiceDate, invoiceTotal: row.invoiceTotal,
                outstanding, ageDays: age
            });
        }
        conn.release();
        const result = Array.from(partnerMap.values());
        const totals = result.reduce((acc, p) => ({
            current: acc.current + p.current,
            days31to60: acc.days31to60 + p.days31to60,
            days61to90: acc.days61to90 + p.days61to90,
            over90: acc.over90 + p.over90,
            totalOutstanding: acc.totalOutstanding + p.totalOutstanding
        }), { current: 0, days31to60: 0, days61to90: 0, over90: 0, totalOutstanding: 0 });
        res.json({ partners: result, totals, asOfDate: refDate });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'accounts payable aging');
    }
});
exports.getAccountsPayableAging = getAccountsPayableAging;
// ═══════════════════════════════════════════════════════════
// CASH FLOW STATEMENT
// Derived from GL journal entries, categorized by type
// ═══════════════════════════════════════════════════════════
const getCashFlowStatement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            conn.release();
            return res.status(400).json({ error: 'تاريخ البداية والنهاية مطلوبان' });
        }
        // Cash & Bank account types typically: Assets → Cash, Bank
        // Operating: Revenue, Expenses, Current Assets/Liabilities changes
        // Investing: Fixed Assets changes
        // Financing: Capital, Loans changes
        // Get net cash movement per account category
        const [movements] = yield conn.query(`
            SELECT 
                a.id as accountId,
                a.name as accountName,
                a.code as accountCode,
                a.type as accountType,
                a.subType as accountCategory,
                SUM(jl.debit) as totalDebit,
                SUM(jl.credit) as totalCredit,
                SUM(jl.debit) - SUM(jl.credit) as netMovement
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journalId = je.id
            JOIN accounts a ON jl.accountId = a.id
            WHERE je.date BETWEEN ? AND ?
            GROUP BY a.id, a.name, a.code, a.type, a.subType
            ORDER BY a.code
        `, [startDate, endDate]);
        // Categorize into Operating / Investing / Financing
        const operating = [];
        const investing = [];
        const financing = [];
        let operatingTotal = 0, investingTotal = 0, financingTotal = 0;
        for (const m of movements) {
            let type = (m.accountType || '').toLowerCase();
            const subType = (m.accountCategory || '').toLowerCase();
            const code = (m.accountCode || '');
            const net = parseFloat(m.netMovement) || 0;
            // Identify cash/bank accounts to exclude them from Cash Flow categories
            if (subType === 'cash' || subType === 'bank' || subType === 'treasury' || code.startsWith('101') || code.startsWith('102')) {
                type = 'cash';
            }
            const entry = {
                accountId: m.accountId, accountName: m.accountName,
                accountCode: m.accountCode, netMovement: net
            };
            // Cash and bank accounts are excluded from Operating, Investing, and Financing sections
            if (type === 'cash' || type === 'bank') {
                continue;
            }
            let category = subType;
            if (!category) {
                if (code.startsWith('109') || code.startsWith('204')) {
                    category = 'fixed asset';
                }
                else if (code.startsWith('206')) {
                    category = 'equity';
                }
                else if (type === 'asset') {
                    category = 'current asset';
                }
                else if (type === 'liability') {
                    category = 'current liability';
                }
                else if (type === 'equity') {
                    category = 'equity';
                }
            }
            // Fixed Assets → Investing
            if (category.includes('fixed') || (category.includes('asset') && !category.includes('current'))) {
                investing.push(entry);
                investingTotal += net;
            }
            // Capital, Loans → Financing
            else if (category.includes('capital') || category.includes('equity') || category.includes('loan') || category.includes('borrow')) {
                financing.push(entry);
                financingTotal += net;
            }
            // Everything else → Operating
            else {
                operating.push(entry);
                operatingTotal += net;
            }
        }
        // Get opening cash balance
        const [openingCash] = yield conn.query(`
            SELECT COALESCE(SUM(jl.debit - jl.credit), 0) as balance
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journalId = je.id
            JOIN accounts a ON jl.accountId = a.id
            WHERE je.date < ?
              AND (a.subType IN ('CASH', 'BANK', 'TREASURY') OR a.code LIKE '101%' OR a.code LIKE '102%')
        `, [startDate]);
        const openingBalance = parseFloat((_a = openingCash[0]) === null || _a === void 0 ? void 0 : _a.balance) || 0;
        const netCashChange = operatingTotal + investingTotal + financingTotal;
        const closingBalance = openingBalance + netCashChange;
        conn.release();
        res.json({
            period: { startDate, endDate },
            openingCashBalance: Math.round(openingBalance * 100) / 100,
            operating: { items: operating, total: Math.round(operatingTotal * 100) / 100 },
            investing: { items: investing, total: Math.round(investingTotal * 100) / 100 },
            financing: { items: financing, total: Math.round(financingTotal * 100) / 100 },
            netCashChange: Math.round(netCashChange * 100) / 100,
            closingCashBalance: Math.round(closingBalance * 100) / 100
        });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'cash flow statement');
    }
});
exports.getCashFlowStatement = getCashFlowStatement;
// ═══════════════════════════════════════════════════════════
// STATEMENT OF ACCOUNTS (per customer/supplier)
// ═══════════════════════════════════════════════════════════
const getStatementOfAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        const { partnerId, startDate, endDate } = req.query;
        if (!partnerId) {
            conn.release();
            return res.status(400).json({ error: 'معرف العميل/المورد مطلوب' });
        }
        // Get partner info
        const [partnerRows] = yield conn.query('SELECT * FROM partners WHERE id = ?', [partnerId]);
        if (!Array.isArray(partnerRows) || partnerRows.length === 0) {
            conn.release();
            return res.status(404).json({ error: 'العميل/المورد غير موجود' });
        }
        const partner = partnerRows[0];
        // Build date filter
        let dateFilter = '';
        const params = [partnerId];
        if (startDate) {
            dateFilter += ' AND date >= ?';
            params.push(startDate);
        }
        if (endDate) {
            dateFilter += ' AND date <= ?';
            params.push(endDate);
        }
        // Get opening balance (before startDate)
        let openingBalance = parseFloat(partner.openingBalance) || 0;
        if (startDate) {
            const [obRows] = yield conn.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN type IN ('SALE') THEN total ELSE 0 END), 0) -
                    COALESCE(SUM(CASE WHEN type IN ('RETURN_SALE') THEN total ELSE 0 END), 0) as invoiceTotal
                FROM invoices WHERE partnerId = ? AND date < ? AND status != 'VOID'
            `, [partnerId, startDate]);
            const [payRows] = yield conn.query(`
                SELECT COALESCE(SUM(amount), 0) as paid
                FROM transactions WHERE partnerId = ? AND date < ? AND type IN ('RECEIPT', 'PAYMENT')
            `, [partnerId, startDate]);
            const invoicesBefore = ((_a = obRows[0]) === null || _a === void 0 ? void 0 : _a.invoiceTotal) || 0;
            const paidBefore = ((_b = payRows[0]) === null || _b === void 0 ? void 0 : _b.paid) || 0;
            openingBalance += invoicesBefore - paidBefore;
        }
        // Get all transactions in period
        const [invoices] = yield conn.query(`
            SELECT id, number, date, type, total, notes, 'invoice' as txType
            FROM invoices
            WHERE partnerId = ? AND status != 'VOID' ${dateFilter}
            ORDER BY date
        `, params);
        const [payments] = yield conn.query(`
            SELECT id, reference as number, date, type, amount as total, description as notes, 'payment' as txType
            FROM transactions
            WHERE partnerId = ? AND type IN ('RECEIPT', 'PAYMENT') ${dateFilter}
            ORDER BY date
        `, params);
        // Merge and sort by date
        const allTx = [...invoices, ...payments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        // Build running balance
        let runningBalance = openingBalance;
        const statement = allTx.map(tx => {
            let debit = 0, credit = 0;
            if (tx.txType === 'invoice') {
                if (tx.type === 'SALE' || tx.type === 'PURCHASE') {
                    debit = parseFloat(tx.total) || 0;
                }
                else {
                    credit = parseFloat(tx.total) || 0; // Returns
                }
            }
            else {
                credit = parseFloat(tx.total) || 0; // Payments/receipts
            }
            runningBalance = runningBalance + debit - credit;
            return {
                date: tx.date,
                reference: tx.number || tx.id,
                type: tx.type,
                description: tx.notes || '',
                debit,
                credit,
                balance: Math.round(runningBalance * 100) / 100
            };
        });
        conn.release();
        res.json({
            partner: { id: partner.id, name: partner.name, code: partner.code, phone: partner.phone },
            period: { startDate: startDate || 'من البداية', endDate: endDate || 'حتى اليوم' },
            openingBalance: Math.round(openingBalance * 100) / 100,
            transactions: statement,
            closingBalance: Math.round(runningBalance * 100) / 100,
            totalDebit: Math.round(statement.reduce((s, t) => s + t.debit, 0) * 100) / 100,
            totalCredit: Math.round(statement.reduce((s, t) => s + t.credit, 0) * 100) / 100
        });
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'statement of accounts');
    }
});
exports.getStatementOfAccounts = getStatementOfAccounts;
// ═══════════════════════════════════════════════════════════
// FINANCIAL RATIOS
// ═══════════════════════════════════════════════════════════
const getFinancialRatios = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { asOfDate } = req.query;
        const refDate = asOfDate ? String(asOfDate) : new Date().toISOString().split('T')[0];
        // Get account balances by category
        const [balances] = yield conn.query(`
            SELECT 
                a.subType as category,
                a.code,
                a.type,
                SUM(jl.debit - jl.credit) as balance
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journalId = je.id
            JOIN accounts a ON jl.accountId = a.id
            WHERE je.date <= ?
            GROUP BY a.subType, a.code, a.type
        `, [refDate]);
        // Aggregate by category
        let totalCurrentAssets = 0, totalCurrentLiabilities = 0;
        let totalFixedAssets = 0, totalEquity = 0;
        let totalAssets = 0, totalLiabilities = 0;
        let totalRevenue = 0, totalExpenses = 0;
        let cashAndBank = 0, inventory = 0;
        for (const b of balances) {
            let cat = (b.category || '').toLowerCase();
            let type = (b.type || '').toLowerCase();
            const code = (b.code || '');
            const bal = parseFloat(b.balance) || 0;
            // Fallback cash/bank detection
            if (cat === 'cash' || cat === 'bank' || cat === 'treasury' || code.startsWith('101') || code.startsWith('102')) {
                type = 'cash';
            }
            if (!cat) {
                if (code.startsWith('109') || code.startsWith('204')) {
                    cat = 'fixed asset';
                }
                else if (code.startsWith('206') || type === 'equity') {
                    cat = 'equity';
                }
                else if (type === 'asset') {
                    cat = 'current asset';
                }
                else if (type === 'liability') {
                    cat = 'current liability';
                }
            }
            if (type === 'cash' || type === 'bank') {
                cashAndBank += bal;
                totalCurrentAssets += bal;
                totalAssets += bal;
            }
            else if (cat.includes('current') && cat.includes('asset')) {
                totalCurrentAssets += bal;
                totalAssets += bal;
                if (cat.includes('inventory') || cat.includes('stock'))
                    inventory += bal;
            }
            else if (cat.includes('fixed') || (cat.includes('asset') && !cat.includes('current'))) {
                totalFixedAssets += bal;
                totalAssets += bal;
            }
            else if (cat.includes('current') && cat.includes('liabilit')) {
                totalCurrentLiabilities += bal;
                totalLiabilities += bal;
            }
            else if (cat.includes('liabilit')) {
                totalLiabilities += bal;
            }
            else if (cat.includes('equity') || cat.includes('capital')) {
                totalEquity += bal;
            }
            else if (cat.includes('revenue') || cat.includes('income')) {
                totalRevenue += Math.abs(bal);
            }
            else if (cat.includes('expense') || cat.includes('cost')) {
                totalExpenses += Math.abs(bal);
            }
        }
        const netIncome = totalRevenue - totalExpenses;
        const ratios = {
            // Liquidity Ratios
            currentRatio: totalCurrentLiabilities > 0 ? Math.round((totalCurrentAssets / totalCurrentLiabilities) * 100) / 100 : null,
            quickRatio: totalCurrentLiabilities > 0 ? Math.round(((totalCurrentAssets - inventory) / totalCurrentLiabilities) * 100) / 100 : null,
            cashRatio: totalCurrentLiabilities > 0 ? Math.round((cashAndBank / totalCurrentLiabilities) * 100) / 100 : null,
            // Leverage Ratios
            debtToEquity: totalEquity > 0 ? Math.round((totalLiabilities / totalEquity) * 100) / 100 : null,
            debtToAssets: totalAssets > 0 ? Math.round((totalLiabilities / totalAssets) * 100) / 100 : null,
            // Profitability Ratios
            netProfitMargin: totalRevenue > 0 ? Math.round((netIncome / totalRevenue) * 10000) / 100 : null,
            returnOnAssets: totalAssets > 0 ? Math.round((netIncome / totalAssets) * 10000) / 100 : null,
            returnOnEquity: totalEquity > 0 ? Math.round((netIncome / totalEquity) * 10000) / 100 : null,
            // Underlying data
            summary: {
                totalAssets: Math.round(totalAssets * 100) / 100,
                totalCurrentAssets: Math.round(totalCurrentAssets * 100) / 100,
                totalFixedAssets: Math.round(totalFixedAssets * 100) / 100,
                totalLiabilities: Math.round(totalLiabilities * 100) / 100,
                totalCurrentLiabilities: Math.round(totalCurrentLiabilities * 100) / 100,
                totalEquity: Math.round(totalEquity * 100) / 100,
                cashAndBank: Math.round(cashAndBank * 100) / 100,
                inventory: Math.round(inventory * 100) / 100,
                totalRevenue: Math.round(totalRevenue * 100) / 100,
                totalExpenses: Math.round(totalExpenses * 100) / 100,
                netIncome: Math.round(netIncome * 100) / 100
            }
        };
        conn.release();
        res.json(Object.assign({ asOfDate: refDate }, ratios));
    }
    catch (error) {
        conn.release();
        return (0, errorHandler_1.handleControllerError)(res, error, 'financial ratios');
    }
});
exports.getFinancialRatios = getFinancialRatios;
