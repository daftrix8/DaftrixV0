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
exports.getInvoiceReportStats = exports.getTransferableUsers = exports.transferInvoice = exports.previewDeleteInvoice = exports.deleteInvoice = exports.getInvoicePermission = exports.INVOICE_PERMISSIONS = exports.getPendingReservations = exports.getInvoiceDispatchStatuses = exports.getInvoiceReservations = exports.updateInvoice = exports.getOutstandingInvoices = exports.normalizeInvoiceType = exports.getCustomerLastProductPrices = exports.getCustomerLastProductPrice = exports.createInvoice = exports.getPublicInvoiceById = exports.getInvoiceById = exports.getInvoices = exports.getNextInvoiceNumber = exports.syncRevenueCogsJournal = exports.ACCOUNT_PREFIX = void 0;
exports.invalidateInvoiceCache = invalidateInvoiceCache;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const invoiceCascadeDelete_1 = require("../utils/invoiceCascadeDelete");
const dataFiltering_1 = require("../utils/dataFiltering");
const errorHandler_1 = require("../utils/errorHandler");
const branchFilter_1 = require("../utils/branchFilter");
const accountBalanceUtils_1 = require("../utils/accountBalanceUtils");
const eventBus_1 = require("../utils/eventBus");
const fiscalYearUtils_1 = require("../utils/fiscalYearUtils");
const lockDateValidator_1 = require("../utils/lockDateValidator");
const policyEnforcement_1 = require("../utils/policyEnforcement");
const accountCache_1 = require("../utils/accountCache");
const logger_1 = require("../utils/logger");
const invoiceNumberGenerator_1 = require("../utils/invoiceNumberGenerator");
const memberships_1 = require("./memberships");
const loyaltyController_1 = require("./loyaltyController");
const journalValidationUtils_1 = require("../utils/journalValidationUtils");
const dateEngine_1 = require("../utils/dateEngine");
const paymentGeneration_1 = require("../utils/paymentGeneration");
Object.defineProperty(exports, "ACCOUNT_PREFIX", { enumerable: true, get: function () { return paymentGeneration_1.ACCOUNT_PREFIX; } });
// In-memory dual-key cache for getInvoiceById to achieve O(1) invalidation and read operations
const invoiceCache = new Map(); // key: uuid -> entry
const numberIndex = new Map(); // number -> uuid
const INVOICE_CACHE_TTL_MS = 2000;
function invalidateInvoiceCache(id, number) {
    // 1. Get cached entry to find associated UUID and number
    let entry = invoiceCache.get(id);
    if (!entry) {
        const uuid = numberIndex.get(id);
        if (uuid) {
            entry = invoiceCache.get(uuid);
        }
    }
    // 2. Delete entry properties
    if (entry && entry.data) {
        const uuid = entry.data.id;
        const num = entry.data.number;
        if (uuid)
            invoiceCache.delete(uuid);
        if (num)
            numberIndex.delete(num);
    }
    // 3. Direct cleanups as fallback
    invoiceCache.delete(id);
    numberIndex.delete(id);
    if (number) {
        invoiceCache.delete(number);
        numberIndex.delete(number);
    }
}
function getCachedInvoice(key) {
    var _a;
    let entry = invoiceCache.get(key);
    if (!entry) {
        const uuid = numberIndex.get(key);
        if (uuid) {
            entry = invoiceCache.get(uuid);
        }
    }
    if (entry && Date.now() - entry.timestamp < INVOICE_CACHE_TTL_MS) {
        return entry.data;
    }
    // Cleanup stale entries (limit map size)
    if (invoiceCache.size > 100) {
        const now = Date.now();
        for (const [uuid, val] of invoiceCache.entries()) {
            if (now - val.timestamp > INVOICE_CACHE_TTL_MS) {
                invoiceCache.delete(uuid);
                if ((_a = val.data) === null || _a === void 0 ? void 0 : _a.number) {
                    numberIndex.delete(val.data.number);
                }
            }
        }
    }
    return null;
}
function setCachedInvoice(key, data) {
    if (!data || !data.id)
        return;
    const uuid = data.id;
    invoiceCache.set(uuid, { data, timestamp: Date.now() });
    if (data.number) {
        numberIndex.set(data.number, uuid);
    }
}
const syncRevenueCogsJournal = (conn_1, id_1, invoiceNumber_1, type_1, date_1, partnerName_1, total_1, lines_1, createdBy_1, reserveOnSale_1, ...args_1) => __awaiter(void 0, [conn_1, id_1, invoiceNumber_1, type_1, date_1, partnerName_1, total_1, lines_1, createdBy_1, reserveOnSale_1, ...args_1], void 0, function* (conn, id, invoiceNumber, type, date, partnerName, total, lines, createdBy, reserveOnSale, isCashInvoice = false, globalDiscount = 0, branchId = null, status = 'POSTED') {
    const actualJournalId = 'r' + id.substring(1);
    // Safely delete any existing Revenue/COGS logs for this invoice to prevent duplication
    yield conn.query('DELETE FROM journal_lines WHERE journalId = ?', [actualJournalId]);
    yield conn.query('DELETE FROM journal_entries WHERE id = ?', [actualJournalId]);
    // Backwards compatibility for old randomUUID-based entries
    yield conn.query(`DELETE FROM journal_lines WHERE journalId IN (
            SELECT id FROM journal_entries 
            WHERE (referenceId = ? OR referenceId = ?)
            AND (description LIKE 'فاتورة بيع%' OR description LIKE 'مرتجع مبيعات%' OR description LIKE 'فاتورة شراء%' OR description LIKE 'مرتجع مشتريات%')
        )`, [invoiceNumber, id]);
    yield conn.query(`DELETE FROM journal_entries 
         WHERE (referenceId = ? OR referenceId = ?)
         AND (description LIKE 'فاتورة بيع%' OR description LIKE 'مرتجع مبيعات%' OR description LIKE 'فاتورة شراء%' OR description LIKE 'مرتجع مشتريات%')`, [invoiceNumber, id]);
    if (status === 'VOID' || status === 'DRAFT') {
        return;
    }
    const invoiceTypesForRevenueJournal = ['INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE'];
    const netTotal = Number(total.toFixed(2));
    if (invoiceTypesForRevenueJournal.includes(type) && total > 0) {
        try {
            const isSaleType = type === 'INVOICE_SALE' || type === 'RETURN_SALE';
            const isReturn = type === 'RETURN_SALE' || type === 'RETURN_PURCHASE';
            const cachedAccounts = yield (0, accountCache_1.resolveInvoiceAccounts)();
            const revenueAcc = cachedAccounts.revenue;
            const cogsAcc = cachedAccounts.cogs;
            const inventoryAcc = cachedAccounts.inventory;
            const receivablesAcc = cachedAccounts.receivables;
            const payablesAcc = cachedAccounts.payables;
            const partnerAccOut = receivablesAcc;
            const partnerAccIn = payablesAcc;
            let totalCOGS = 0, goodCOGS = 0, damagedCOGS = 0;
            if (lines && lines.length > 0) {
                for (const line of lines) {
                    if (line.trackInventory === false || line.trackInventory === 0)
                        continue;
                    const rawQty = Number(line.quantity) || 0;
                    const qty = Math.abs(rawQty);
                    const unitCost = Number(line.cost) || 0;
                    const lineCOGS = qty * unitCost;
                    if (rawQty < 0) {
                        totalCOGS -= lineCOGS;
                        goodCOGS -= lineCOGS;
                    }
                    else {
                        totalCOGS += lineCOGS;
                        if (isReturn && line.returnCondition === 'DAMAGED')
                            damagedCOGS += lineCOGS;
                        else
                            goodCOGS += lineCOGS;
                    }
                }
            }
            totalCOGS = Number(totalCOGS.toFixed(2));
            goodCOGS = Number(goodCOGS.toFixed(2));
            damagedCOGS = Number(damagedCOGS.toFixed(2));
            // Enforce account configuration
            if (isSaleType) {
                if (!revenueAcc || !receivablesAcc) {
                    throw new Error(`Required ledger accounts (Revenue or Receivables) are not configured.`);
                }
                if (totalCOGS !== 0 || goodCOGS > 0 || damagedCOGS > 0) {
                    if (!cogsAcc || !inventoryAcc) {
                        throw new Error(`Required inventory ledger accounts (COGS or Inventory) are not configured.`);
                    }
                }
            }
            else {
                if (!inventoryAcc || !payablesAcc) {
                    throw new Error(`Required ledger accounts (Inventory or Payables) are not configured.`);
                }
            }
            if (isSaleType) {
                const descPrefix = isReturn ? 'مرتجع مبيعات' : 'فاتورة بيع';
                const cashSuffix = isCashInvoice ? ' نقدي' : '';
                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, branchId) VALUES (?, ?, ?, ?, ?, ?)`, [actualJournalId, date, `${descPrefix}${cashSuffix} #${invoiceNumber} - ${partnerName}`, id, createdBy, branchId]);
                const journalLines = [];
                if (isReturn) {
                    journalLines.push([actualJournalId, revenueAcc.id, revenueAcc.name, netTotal, 0]);
                    if (partnerAccOut)
                        journalLines.push([actualJournalId, partnerAccOut.id, partnerAccOut.name, 0, netTotal]);
                    if (goodCOGS > 0 && cogsAcc && inventoryAcc) {
                        journalLines.push([actualJournalId, inventoryAcc.id, inventoryAcc.name, goodCOGS, 0]);
                        journalLines.push([actualJournalId, cogsAcc.id, cogsAcc.name, 0, goodCOGS]);
                    }
                    if (damagedCOGS > 0 && cogsAcc) {
                        let damageAcc = null;
                        try {
                            const [damageAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code = '502' OR name LIKE '%هالك%' OR name LIKE '%تالف%' OR name LIKE '%خسائر مرتجعات%' LIMIT 1`);
                            damageAcc = damageAccRows[0];
                        }
                        catch (e) { }
                        if (damageAcc) {
                            journalLines.push([actualJournalId, damageAcc.id, damageAcc.name, damagedCOGS, 0]);
                            journalLines.push([actualJournalId, cogsAcc.id, cogsAcc.name, 0, damagedCOGS]);
                        }
                        else if (inventoryAcc) {
                            journalLines.push([actualJournalId, inventoryAcc.id, inventoryAcc.name, damagedCOGS, 0]);
                            journalLines.push([actualJournalId, cogsAcc.id, cogsAcc.name, 0, damagedCOGS]);
                        }
                    }
                }
                else {
                    if (partnerAccOut)
                        journalLines.push([actualJournalId, partnerAccOut.id, partnerAccOut.name, netTotal, 0]);
                    journalLines.push([actualJournalId, revenueAcc.id, revenueAcc.name, 0, netTotal]);
                    if (totalCOGS !== 0 && cogsAcc && inventoryAcc && !reserveOnSale) {
                        if (totalCOGS > 0) {
                            journalLines.push([actualJournalId, cogsAcc.id, cogsAcc.name, totalCOGS, 0]);
                            journalLines.push([actualJournalId, inventoryAcc.id, inventoryAcc.name, 0, totalCOGS]);
                        }
                        else {
                            const absCOGS = Math.abs(totalCOGS);
                            journalLines.push([actualJournalId, inventoryAcc.id, inventoryAcc.name, absCOGS, 0]);
                            journalLines.push([actualJournalId, cogsAcc.id, cogsAcc.name, 0, absCOGS]);
                        }
                    }
                }
                if (journalLines.length > 0) {
                    const formattedLines = journalLines.map(jl => ({
                        accountId: jl[1],
                        accountName: jl[2],
                        debit: jl[3],
                        credit: jl[4]
                    }));
                    const balancedLines = (0, journalValidationUtils_1.assertBalanced)(formattedLines);
                    const finalJournalLines = balancedLines.map(bl => [
                        actualJournalId,
                        bl.accountId,
                        bl.accountName,
                        bl.debit,
                        bl.credit
                    ]);
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES ?`, [finalJournalLines]);
                }
            }
            else if (!isSaleType) {
                const descPrefix = isReturn ? 'مرتجع مشتريات' : 'فاتورة شراء';
                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, branchId) VALUES (?, ?, ?, ?, ?, ?)`, [actualJournalId, date, `${descPrefix} #${invoiceNumber} - ${partnerName}`, id, createdBy, branchId]);
                const journalLines = [];
                if (isReturn) {
                    if (partnerAccIn)
                        journalLines.push([actualJournalId, partnerAccIn.id, partnerAccIn.name, netTotal, 0]);
                    journalLines.push([actualJournalId, inventoryAcc.id, inventoryAcc.name, 0, netTotal]);
                }
                else {
                    journalLines.push([actualJournalId, inventoryAcc.id, inventoryAcc.name, netTotal, 0]);
                    if (partnerAccIn)
                        journalLines.push([actualJournalId, partnerAccIn.id, partnerAccIn.name, 0, netTotal]);
                }
                if (journalLines.length > 0) {
                    const formattedLines = journalLines.map(jl => ({
                        accountId: jl[1],
                        accountName: jl[2],
                        debit: jl[3],
                        credit: jl[4]
                    }));
                    const balancedLines = (0, journalValidationUtils_1.assertBalanced)(formattedLines);
                    const finalJournalLines = balancedLines.map(bl => [
                        actualJournalId,
                        bl.accountId,
                        bl.accountName,
                        bl.debit,
                        bl.credit
                    ]);
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES ?`, [finalJournalLines]);
                }
            }
        }
        catch (revJournalErr) {
            (0, logger_1.logDebug)(`âŒ CRITICAL: Revenue/COGS journal creation FAILED â€” rolling back parent transaction: ${revJournalErr.message}`);
            throw revJournalErr;
        }
    }
});
exports.syncRevenueCogsJournal = syncRevenueCogsJournal;
// ============================================
// In-memory deduplication cache for getInvoiceById
// Prevents N+1 query explosion when Partner Statement fetches
// the same invoice 6x in 2 seconds from multiple components
// ============================================
// getCachedInvoice and setCachedInvoice are hoisted to the top
// ============================================
// Get Next Invoice Number â€” Gap-Fill Strategy
// Finds the SMALLEST MISSING number in the sequence so that
// deleted invoice numbers are recycled: 1,2,3,4 â€” never 1,3,5.
// Supports: INV-, PUR-, RET-S-, RET-P-, REC-, PAY-, STK-IN-, STK-OUT-
// ============================================
const getNextInvoiceNumber = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const conn = yield (0, db_1.getConnection)();
        const prefix = req.query.prefix || 'INV-';
        // Stock permits use a different table â€” keep MAX strategy for them
        if (prefix.startsWith('STK-')) {
            const prefixLen = prefix.length;
            yield conn.beginTransaction();
            try {
                const [maxRows] = yield conn.query(`SELECT id as maxNum FROM stock_permits
                     WHERE id LIKE ? ORDER BY LENGTH(id) DESC, id DESC LIMIT 1 FOR UPDATE`, [`${prefix}%`]);
                let maxNum = 0;
                const lastStr = (_a = maxRows[0]) === null || _a === void 0 ? void 0 : _a.maxNum;
                if (lastStr) {
                    const parsed = parseInt(lastStr.substring(prefixLen), 10);
                    if (!isNaN(parsed))
                        maxNum = parsed;
                }
                const nextNumber = `${prefix}${String(maxNum + 1).padStart(5, '0')}`;
                yield conn.commit();
                conn.release();
                res.json({ nextNumber, maxNum });
            }
            catch (innerErr) {
                yield conn.rollback();
                conn.release();
                throw innerErr;
            }
            return;
        }
        // For all invoice prefixes: use Gap-Fill strategy
        yield conn.beginTransaction();
        try {
            const resolvedBranchId = (0, branchFilter_1.resolveBranchIdForWrite)(req, req.query.branchId);
            const nextNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, prefix, 'invoices', 'number', resolvedBranchId);
            yield conn.commit();
            conn.release();
            console.log(`ðŸ”¢ [GapFill] Next number for prefix "${prefix}": ${nextNumber}`);
            res.json({ nextNumber });
        }
        catch (innerErr) {
            yield conn.rollback();
            conn.release();
            throw innerErr;
        }
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getNextInvoiceNumber');
    }
});
exports.getNextInvoiceNumber = getNextInvoiceNumber;
const getInvoices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        // Performance flag: minimal mode skips fetching lines/cheques (for list views)
        const minimal = req.query.minimal === 'true';
        const minimalBeforeDate = req.query.minimalBeforeDate;
        // Filter parameters
        const type = req.query.type;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const partnerId = req.query.partnerId;
        const search = req.query.search;
        const status = req.query.status; // 'POSTED' | 'DRAFT'
        const createdBy = req.query.createdBy;
        const paymentMethod = req.query.paymentMethod;
        const minAmount = req.query.minAmount;
        const maxAmount = req.query.maxAmount;
        const sortBy = req.query.sortBy;
        const sortOrder = req.query.sortOrder;
        // Build WHERE clause
        const conditions = [];
        const params = [];
        // Apply salesman data isolation filter
        if (authReq.userFilterOptions && authReq.systemConfig) {
            const salesmanFilter = (0, dataFiltering_1.buildSalesmanFilterClause)({
                userRole: authReq.userFilterOptions.userRole,
                salesmanId: authReq.userFilterOptions.salesmanId,
                systemConfig: authReq.systemConfig
            }, 'invoices', 'i');
            if (salesmanFilter.clause) {
                conditions.push(salesmanFilter.clause);
                params.push(...salesmanFilter.params);
            }
            // Apply createdBy data isolation when enableUserDataIsolation is on
            // Users who can't see all data should only see their own invoices
            const userFilter = (0, dataFiltering_1.buildParameterizedFilter)(authReq.userFilterOptions);
            if (userFilter.clause) {
                conditions.push(`i.${userFilter.clause}`);
                params.push(...userFilter.params);
            }
        }
        if (type) {
            if (type.includes(',')) {
                const types = type.split(',').map(t => t.trim()).filter(Boolean);
                if (types.length > 0) {
                    conditions.push(`i.type IN (${types.map(() => '?').join(',')})`);
                    params.push(...types);
                }
            }
            else {
                conditions.push('i.type = ?');
                params.push(type);
            }
        }
        if (startDate) {
            conditions.push('i.date >= ?');
            params.push(startDate.length === 10 ? `${startDate} 00:00:00` : startDate);
        }
        if (endDate) {
            conditions.push('i.date <= ?');
            params.push(endDate.length === 10 ? `${endDate} 23:59:59` : endDate);
        }
        if (((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.role) === 'CUSTOMER') {
            if (!authReq.user.partnerId) {
                conn.release();
                return res.status(403).json({ error: 'الحساب غير مرتبط بعميل' });
            }
            conditions.push('i.partnerId = ?');
            params.push(authReq.user.partnerId);
        }
        else if (partnerId) {
            conditions.push('i.partnerId = ?');
            params.push(partnerId);
        }
        if (search) {
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // Arabic-normalized search on invoice_lines, partnerName, and notes
            // using inline REPLACE.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const arabicNormJS = (s) => s.toLowerCase()
                .replace(/أ/g, 'ا').replace(/إ/g, 'ا').replace(/آ/g, 'ا')
                .replace(/ة/g, 'ه').replace(/ى/g, 'ي')
                .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
            const tokens = search.trim().split(/\s+/).filter(Boolean);
            const arabicNormSQL = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${col}), 'أ','ا'), 'إ','ا'), 'آ','ا'), 'ة','ه'), 'ى','ي'), 'ؤ','و'), 'ئ','ي')`;
            if (tokens.length > 0) {
                const tokenConditions = tokens.map(token => {
                    const normToken = arabicNormJS(token);
                    const isExchange = normToken === 'مبادله' || normToken === 'مبادلة' || normToken === 'exchange' || normToken === 'trade-in' || normToken === 'tradein';
                    if (isExchange) {
                        return `( ${arabicNormSQL('i.partnerName')} LIKE ? OR i.id LIKE ? OR i.number LIKE ? OR ${arabicNormSQL('COALESCE(i.notes, \'\')')} LIKE ? OR COALESCE(p.phone, '') LIKE ? OR EXISTS (SELECT 1 FROM invoice_lines il WHERE il.invoiceId = i.id AND ${arabicNormSQL('COALESCE(il.productName, \'\')')} LIKE ? LIMIT 1) OR EXISTS (SELECT 1 FROM invoice_lines il WHERE il.invoiceId = i.id AND (il.tradeInAction IN ('CUSTOM_TRADE_IN', 'ADD_TO_STOCK', 'WRITE_OFF') OR il.quantity < 0) LIMIT 1) )`;
                    }
                    return `( ${arabicNormSQL('i.partnerName')} LIKE ? OR i.id LIKE ? OR i.number LIKE ? OR ${arabicNormSQL('COALESCE(i.notes, \'\')')} LIKE ? OR COALESCE(p.phone, '') LIKE ? OR EXISTS (SELECT 1 FROM invoice_lines il WHERE il.invoiceId = i.id AND ${arabicNormSQL('COALESCE(il.productName, \'\')')} LIKE ? LIMIT 1) )`;
                });
                conditions.push(`(${tokenConditions.join(' AND ')})`);
                tokens.forEach(token => {
                    const normalizedToken = `%${arabicNormJS(token)}%`;
                    const rawToken = `%${token}%`;
                    params.push(normalizedToken, rawToken, rawToken, normalizedToken, rawToken, normalizedToken);
                });
            }
        }
        // Server-side filters (previously done client-side in InvoiceList.tsx)
        if (status === 'POSTED') {
            conditions.push("(i.status != 'DRAFT' AND i.status != 'VOID')");
        }
        else if (status === 'DRAFT') {
            conditions.push("i.status = 'DRAFT'");
        }
        if (createdBy) {
            conditions.push('i.createdBy = ?');
            params.push(createdBy);
        }
        if (paymentMethod) {
            conditions.push('i.paymentMethod = ?');
            params.push(paymentMethod);
        }
        if (minAmount) {
            conditions.push('i.total >= ?');
            params.push(parseFloat(minAmount));
        }
        if (maxAmount) {
            conditions.push('i.total <= ?');
            params.push(parseFloat(maxAmount));
        }
        const salesmanName = req.query.salesmanName;
        if (salesmanName) {
            const arabicNormSQL = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${col}), 'أ','ا'), 'إ','ا'), 'آ','ا'), 'ة','ه'), 'ى','ي'), 'ؤ','و'), 'ئ','ي')`;
            const arabicNormJS = (s) => s.toLowerCase()
                .replace(/أ/g, 'ا').replace(/إ/g, 'ا').replace(/آ/g, 'ا')
                .replace(/ة/g, 'ه').replace(/ى/g, 'ي')
                .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
            conditions.push(`i.salesmanId IN (SELECT id FROM salesmen WHERE ${arabicNormSQL('name')} LIKE ?)`);
            params.push(`%${arabicNormJS(salesmanName)}%`);
        }
        const hasExchange = req.query.hasExchange;
        if (hasExchange === 'YES') {
            conditions.push(`EXISTS (SELECT 1 FROM invoice_lines il WHERE il.invoiceId = i.id AND (il.tradeInAction IN ('CUSTOM_TRADE_IN', 'ADD_TO_STOCK', 'WRITE_OFF') OR il.quantity < 0) LIMIT 1)`);
        }
        else if (hasExchange === 'NO') {
            conditions.push(`NOT EXISTS (SELECT 1 FROM invoice_lines il WHERE il.invoiceId = i.id AND (il.tradeInAction IN ('CUSTOM_TRADE_IN', 'ADD_TO_STOCK', 'WRITE_OFF') OR il.quantity < 0) LIMIT 1)`);
        }
        // FISCAL YEAR DATA ISOLATION â€” always enforce as a hard boundary.
        // When startDate/endDate are also provided, they are already applied above.
        // The fiscal year filter acts as an outer clamp to prevent cross-year data leakage.
        // Without this, a user on fiscal year 2023-2024 could search and see 2025 invoices.
        if (authReq.fiscalYearFilter) {
            conditions.push('i.date >= ? AND i.date <= ?');
            params.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        // BRANCH ISOLATION â€” non-privileged users see only their branch's invoices
        (0, branchFilter_1.appendBranchFilter)(conditions, params, authReq, 'i');
        // Build WHERE clause manually
        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        // Get paginated invoices (select only needed columns for list view)
        const selectColumns = minimal
            ? 'i.id, i.number, i.date, i.type, i.partnerId, i.partnerName, i.total, i.status, i.paymentMethod, i.notes, i.voucherCategory, i.salesmanId, i.priceListId, i.createdBy, i.warehouseId, i.currencyCode, i.exchangeRate, i.foreignTotal, s.name as safeName, i.bankName, p.phone as partnerPhone, i.referenceInvoiceId, i.sourceInvoiceId, i.relatedInvoiceIds, i.bankTransferReference, i.branchId, i.bankAccountId'
            : 'i.*, s.name as safeName, i.bankName, p.phone as partnerPhone';
        // Determine if we need the partners JOIN (only needed for phone search)
        const needsPartnerJoin = !!search;
        const statsPartnerJoin = needsPartnerJoin ? 'LEFT JOIN partners p ON i.partnerId = p.id' : '';
        // Determine dynamic sorting
        let orderByClause = '';
        if (sortBy) {
            const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';
            if (sortBy === 'number') {
                orderByClause = `CAST(REGEXP_REPLACE(i.number COLLATE utf8mb4_unicode_ci, '[^0-9]', '') AS UNSIGNED) ${direction}, i.number ${direction}, i.id ${direction}`;
            }
            else if (sortBy === 'date') {
                orderByClause = `i.date ${direction}, CAST(REGEXP_REPLACE(i.number COLLATE utf8mb4_unicode_ci, '[^0-9]', '') AS UNSIGNED) ${direction}, i.number ${direction}, i.id ${direction}`;
            }
            else if (sortBy === 'partnerName') {
                orderByClause = `i.partnerName ${direction}, i.date ${direction}, i.number ${direction}, i.id ${direction}`;
            }
            else if (sortBy === 'total') {
                orderByClause = `i.total ${direction}, i.date ${direction}, i.number ${direction}, i.id ${direction}`;
            }
            else if (sortBy === 'status') {
                orderByClause = `i.status ${direction}, i.date ${direction}, i.number ${direction}, i.id ${direction}`;
            }
            else if (sortBy === 'createdBy') {
                orderByClause = `i.createdBy ${direction}, i.date ${direction}, i.number ${direction}, i.id ${direction}`;
            }
            else {
                orderByClause = `i.date ${direction}, CAST(REGEXP_REPLACE(i.number COLLATE utf8mb4_unicode_ci, '[^0-9]', '') AS UNSIGNED) ${direction}, i.number ${direction}, i.id ${direction}`;
            }
        }
        else {
            // Determine sorting direction based on type. Client requested Sales/Purchase to show fully chronological (oldest to newest)
            const sortDirection = (type === 'INVOICE_SALE' || type === 'INVOICE_PURCHASE') ? 'ASC' : 'DESC';
            // For PAYMENT/RECEIPT vouchers, sort by DATE first then serial number.
            const isVoucherType = type === 'PAYMENT' || type === 'RECEIPT';
            orderByClause = isVoucherType
                ? `DATE(i.date) ${sortDirection}, CAST(REGEXP_REPLACE(i.number COLLATE utf8mb4_unicode_ci, '[^0-9]', '') AS UNSIGNED) ${sortDirection}, i.id ${sortDirection}`
                : `DATE(i.date) ${sortDirection}, i.number ${sortDirection}, i.id ${sortDirection}`;
        }
        // Run COUNT+STATS, SELECT, and unique creators ALL in parallel
        const queries = [
            conn.query(`SELECT COUNT(*) as total,
                        COALESCE(SUM(CASE WHEN i.status != 'VOID' THEN i.total ELSE 0 END), 0) as totalAmount,
                        SUM(CASE WHEN i.status = 'DRAFT' THEN 1 ELSE 0 END) as draftCount
                 FROM invoices i 
                 ${statsPartnerJoin}
                 ${whereClause}`, params),
            conn.query(`SELECT ${selectColumns} 
                 FROM invoices i 
                 LEFT JOIN banks s ON i.bankAccountId = s.id 
                 LEFT JOIN partners p ON i.partnerId = p.id
                 ${whereClause} 
                 ORDER BY ${orderByClause}
                 LIMIT ? OFFSET ?`, [...params, limit, offset]),
        ];
        // Only fetch unique creators when filtering by type (for the dropdown)
        if (type) {
            queries.push(conn.query('SELECT DISTINCT createdBy FROM invoices WHERE type = ? AND createdBy IS NOT NULL ORDER BY createdBy', [type]));
        }
        const results = yield Promise.all(queries);
        const [statsResult] = results[0];
        const [invoices] = results[1];
        const uniqueCreators = type
            ? (((_b = results[2]) === null || _b === void 0 ? void 0 : _b[0]) || []).map((r) => r.createdBy).filter(Boolean)
            : [];
        const total = statsResult[0].total;
        const totalAmount = Number(statsResult[0].totalAmount) || 0;
        const draftCount = Number(statsResult[0].draftCount) || 0;
        // Only fetch lines and cheques if NOT in minimal mode (for edit/detail views)
        if (!minimal && invoices.length > 0) {
            // If minimalBeforeDate is provided, only fetch lines for invoices on or after that date
            let invoicesToFetchDetails = invoices;
            if (minimalBeforeDate) {
                invoicesToFetchDetails = invoicesToFetchDetails.filter(inv => {
                    // Extract YYYY-MM-DD from invoice date (which might be a timestamp)
                    const invDateStr = (inv.date.toISOString ? inv.date.toISOString() : String(inv.date)).split('T')[0];
                    return invDateStr >= minimalBeforeDate;
                });
            }
            if (invoicesToFetchDetails.length > 0) {
                const invoiceIds = invoicesToFetchDetails.map(inv => inv.id);
                // 1. Fetch all lines
                const [allLines] = yield conn.query(`SELECT * FROM invoice_lines WHERE invoiceId IN (?)`, [invoiceIds]);
                // 2. Fetch all cheques â€” PERF: explicit columns instead of SELECT *
                const [allCheques] = yield conn.query(`SELECT id, number, amount, dueDate, bankName, status, transactionId, type, createdDate, description FROM cheques WHERE transactionId IN (?)`, [invoiceIds]);
                // 3. Build Maps for O(1) lookups
                const linesByInvoiceId = new Map();
                for (const line of allLines) {
                    if (!linesByInvoiceId.has(line.invoiceId)) {
                        linesByInvoiceId.set(line.invoiceId, []);
                    }
                    linesByInvoiceId.get(line.invoiceId).push(line);
                }
                const chequesByTransactionId = new Map();
                for (const cheque of allCheques) {
                    if (!chequesByTransactionId.has(cheque.transactionId)) {
                        chequesByTransactionId.set(cheque.transactionId, []);
                    }
                    chequesByTransactionId.get(cheque.transactionId).push(cheque);
                }
                // 4. Map back to invoices using O(1) Map lookups
                for (const inv of invoices) {
                    // Either map from the fetched lines, or empty array if skipped
                    inv.lines = linesByInvoiceId.get(inv.id) || [];
                    const invCheques = chequesByTransactionId.get(inv.id) || [];
                    inv.transactionCheques = invCheques.map((c) => (Object.assign(Object.assign({}, c), { dueDate: c.dueDate ? new Date(c.dueDate).toISOString().split('T')[0] : '', createdDate: c.createdDate ? new Date(c.createdDate).toISOString().split('T')[0] : '' })));
                }
            }
            else {
                // All voices skipped due to minimalBeforeDate
                for (const inv of invoices) {
                    inv.lines = [];
                    inv.transactionCheques = [];
                }
            }
            // Always parse JSON regardless of lines fetched
            for (const inv of invoices) {
                // Parse paymentBreakdown JSON if it exists
                if (inv.paymentBreakdown) {
                    try {
                        inv.paymentBreakdown = typeof inv.paymentBreakdown === 'string' ? JSON.parse(inv.paymentBreakdown) : inv.paymentBreakdown;
                    }
                    catch (e) {
                        inv.paymentBreakdown = undefined;
                    }
                }
                // Parse bankTransfers JSON if it exists
                if (inv.bankTransfers) {
                    try {
                        inv.bankTransfers = typeof inv.bankTransfers === 'string' ? JSON.parse(inv.bankTransfers) : inv.bankTransfers;
                    }
                    catch (e) {
                        inv.bankTransfers = [];
                    }
                }
            }
        }
        else if (minimal) {
            // For minimal mode, initialize empty lines array
            for (const inv of invoices) {
                inv.lines = [];
            }
        }
        // Parse JSON fields for all invoices
        for (const inv of invoices) {
            if (inv.relatedInvoiceIds) {
                try {
                    inv.relatedInvoiceIds = JSON.parse(inv.relatedInvoiceIds);
                }
                catch (e) {
                    inv.relatedInvoiceIds = [];
                }
            }
            else {
                inv.relatedInvoiceIds = [];
            }
        }
        // uniqueCreators already fetched in parallel above
        conn.release();
        // Return paginated response with stats for dashboard cards
        res.json({
            invoices,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            stats: {
                totalAmount,
                count: total,
                draftCount
            },
            uniqueCreators
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'invoices');
    }
});
exports.getInvoices = getInvoices;
// GET /api/invoices/:id - Get single invoice with lines
const getInvoiceById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        // DEDUP: Return cached result if same invoice was fetched within 2 seconds
        // (Only if it passes security checks)
        const cached = getCachedInvoice(id);
        if (cached) {
            const authReq = req;
            const { user } = authReq;
            const userRole = ((user === null || user === void 0 ? void 0 : user.role) || '').toUpperCase();
            let isAllowed = true;
            if (userRole === 'CUSTOMER') {
                if (!(user === null || user === void 0 ? void 0 : user.partnerId) || cached.partnerId !== user.partnerId) {
                    isAllowed = false;
                }
            }
            else {
                const PRIVILEGED_ROLES = ['ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN', 'GENERAL_MANAGER', 'MANAGER', 'ACCOUNTANT'];
                const isPrivileged = PRIVILEGED_ROLES.includes(userRole);
                const userBranchId = ((_a = authReq.branchContext) === null || _a === void 0 ? void 0 : _a.branchId) || null;
                if (!isPrivileged && userBranchId && cached.branchId && cached.branchId !== userBranchId) {
                    isAllowed = false;
                }
                if (authReq.userFilterOptions && authReq.systemConfig) {
                    const { canSeeAll, userName } = authReq.userFilterOptions;
                    if (!canSeeAll) {
                        const isOwner = cached.createdBy === userName || cached.createdBy === (user === null || user === void 0 ? void 0 : user.name);
                        if (!isOwner) {
                            isAllowed = false;
                        }
                    }
                }
            }
            if (isAllowed) {
                (0, logger_1.logDebug)('⚡ [getInvoiceById] Cache hit for:', id);
                return res.json(cached);
            }
        }
        (0, logger_1.logDebug)('🔍 [getInvoiceById] Fetching invoice:', id);
        const conn = yield (0, db_1.getConnection)();
        // Get invoice header — search by both id AND number to handle cases
        // where the frontend passes a display number (e.g. PUR-00001) instead of UUID
        const [invoices] = yield conn.query(`SELECT i.*, s.name as salesmanName, w.name as warehouseName, sf.name as safeName, i.bankName 
             FROM invoices i 
             LEFT JOIN salesmen s ON i.salesmanId = s.id 
             LEFT JOIN warehouses w ON i.warehouseId = w.id 
             LEFT JOIN banks sf ON i.bankAccountId = sf.id
             WHERE i.id = ? OR i.number = ?`, [id, id]);
        if (invoices.length === 0) {
            console.log('❌ [getInvoiceById] Invoice not found in database:', id);
            conn.release();
            return res.status(404).json({ message: 'Invoice not found' });
        }
        const invoice = invoices[0];
        // === SECURITY: Enforce branch and user-level data isolation ===
        const authReq = req;
        const { user } = authReq;
        const userRole = ((user === null || user === void 0 ? void 0 : user.role) || '').toUpperCase();
        if (userRole === 'CUSTOMER') {
            if (!(user === null || user === void 0 ? void 0 : user.partnerId) || invoice.partnerId !== user.partnerId) {
                console.warn(`[getInvoiceById] Customer isolation block: user.partnerId=${user === null || user === void 0 ? void 0 : user.partnerId}, invoice.partnerId=${invoice.partnerId}`);
                conn.release();
                return res.status(403).json({ error: 'ACCESS_DENIED', message: 'ليس لديك صلاحية للوصول إلى هذه الفاتورة' });
            }
        }
        else {
            const PRIVILEGED_ROLES = ['ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN', 'GENERAL_MANAGER', 'MANAGER', 'ACCOUNTANT'];
            const isPrivileged = PRIVILEGED_ROLES.includes(userRole);
            const userBranchId = ((_b = authReq.branchContext) === null || _b === void 0 ? void 0 : _b.branchId) || null;
            if (!isPrivileged && userBranchId && invoice.branchId && invoice.branchId !== userBranchId) {
                console.warn(`[getInvoiceById] Branch isolation block: user branch=${userBranchId}, invoice branch=${invoice.branchId}`);
                conn.release();
                return res.status(403).json({ error: 'ACCESS_DENIED', message: 'You do not have access to this branch\'s invoices' });
            }
            if (authReq.userFilterOptions && authReq.systemConfig) {
                const { canSeeAll, userName } = authReq.userFilterOptions;
                if (!canSeeAll) {
                    const isOwner = invoice.createdBy === userName || invoice.createdBy === (user === null || user === void 0 ? void 0 : user.name);
                    if (!isOwner) {
                        console.warn(`[getInvoiceById] User isolation block: username=${userName}, name=${user === null || user === void 0 ? void 0 : user.name}, invoice createdBy=${invoice.createdBy}`);
                        conn.release();
                        return res.status(403).json({ error: 'ACCESS_DENIED', message: 'You can only view your own invoices' });
                    }
                }
            }
        }
        // Use the actual DB id for line queries (critical when searched by number)
        const actualId = invoice.id;
        (0, logger_1.logDebug)('âœ… [getInvoiceById] Found invoice:', invoice.number, 'Type:', invoice.type, 'DB-ID:', actualId);
        // Get invoice lines WITH product data (JOIN to avoid N+1 queries on frontend)
        const [lines] = yield conn.query(`SELECT il.*, 
                    p.barcode AS productBarcode, p.sku AS productSku, p.cost AS productCost, 
                    p.price AS productPrice, p.trackSerials AS productTrackSerials, 
                    p.isActive AS productIsActive, p.categoryId AS productCategoryId,
                    p.ceramic_size, p.ceramic_color, p.ceramic_pattern, p.ceramicGroup, 
                    p.ceramic_name, p.ceramic_color_grade, p.ceramic_color_desc, p.ceramicItemDesc,
                    c.name AS productCategoryName,
                    NULL AS variantName, NULL AS variantBarcode, NULL AS variantSku
             FROM invoice_lines il
             LEFT JOIN products p ON il.productId = p.id
             LEFT JOIN categories c ON p.categoryId = c.id
             WHERE il.invoiceId = ?`, [actualId]);
        (0, logger_1.logDebug)(`ðŸ“¦ [getInvoiceById] Found ${lines.length} lines for invoice ${invoice.number} (queried by ID: ${actualId})`);
        if (lines.length === 0) {
            const noLineTypes = ['RECEIPT', 'PAYMENT'];
            if (noLineTypes.includes(invoice.type)) {
                (0, logger_1.logDebug)('â„¹ï¸ [getInvoiceById] This is a RECEIPT/PAYMENT â€” no lines expected.');
            }
            else {
                console.warn('âš ï¸ [getInvoiceById] Invoice exists but has NO lines! This may indicate a sync issue.');
                console.warn(`   Invoice created by: ${invoice.createdBy}, date: ${invoice.date}, total: ${invoice.total}`);
            }
        }
        // Attach embedded product data to each line for instant frontend rendering
        const linesWithProducts = lines.map(line => {
            var _a;
            // Enrich productName with variant info when variantId exists but
            // productName only contains the parent name (legacy data fix)
            if (line.variantId && line.variantName && !((_a = line.productName) === null || _a === void 0 ? void 0 : _a.includes(' - '))) {
                line.productName = `${line.productName} - ${line.variantName}`;
            }
            const effectiveBarcode = line.variantBarcode || line.productBarcode || null;
            const effectiveSku = line.variantSku || line.productSku || null;
            if (line.productBarcode || line.productSku || line.productCost !== undefined) {
                line.product = {
                    id: line.productId,
                    name: line.productName,
                    barcode: effectiveBarcode,
                    sku: effectiveSku,
                    cost: Number(line.productCost || 0),
                    price: Number(line.productPrice || 0),
                    trackSerials: !!line.productTrackSerials,
                    isActive: line.productIsActive !== 0,
                    categoryId: line.productCategoryId || '',
                    categoryName: line.productCategoryName || '',
                    ceramicSize: line.ceramic_size || '',
                    ceramicColor: line.ceramic_color || '',
                    ceramicPattern: line.ceramic_pattern || '',
                    ceramicGroup: line.ceramicGroup || '',
                    ceramicName: line.ceramic_name || '',
                    ceramicColorGrade: line.ceramic_color_grade || '',
                    ceramicColorDesc: line.ceramic_color_desc || '',
                    ceramicItemDesc: line.ceramicItemDesc || '',
                };
            }
            // Clean up temporary join fields
            delete line.productBarcode;
            delete line.productSku;
            delete line.productCost;
            delete line.productPrice;
            delete line.productTrackSerials;
            delete line.productIsActive;
            delete line.productCategoryId;
            delete line.productCategoryName;
            delete line.ceramic_size;
            delete line.ceramic_color;
            delete line.ceramic_pattern;
            delete line.ceramicGroup;
            delete line.ceramic_name;
            delete line.ceramic_color_grade;
            delete line.ceramic_color_desc;
            delete line.ceramicItemDesc;
            delete line.variantName;
            delete line.variantBarcode;
            delete line.variantSku;
            return line;
        });
        invoice.lines = linesWithProducts;
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PERF: Embed product units in response to eliminate N+1 API calls.
        // Previously the frontend made N separate GET /products/:id/units
        // requests (one per line item). Now we batch-fetch all units in
        // a single query and include them in the response.
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const uniqueProductIds = [...new Set(lines.map((l) => l.productId).filter(Boolean))];
        let productUnitsMap = {};
        if (uniqueProductIds.length > 0) {
            try {
                const [allUnits] = yield conn.query(`SELECT * FROM product_units 
                     WHERE productId IN (${uniqueProductIds.map(() => '?').join(',')})
                     ORDER BY isBaseUnit DESC, sortOrder ASC, conversionFactor ASC`, uniqueProductIds);
                // Group by productId
                for (const unit of allUnits) {
                    if (!productUnitsMap[unit.productId]) {
                        productUnitsMap[unit.productId] = [];
                    }
                    productUnitsMap[unit.productId].push(unit);
                }
            }
            catch (e) {
                // Non-critical: units table might not exist in older schemas
            }
        }
        invoice.productUnitsMap = productUnitsMap;
        // Parse JSON fields
        if (invoice.relatedInvoiceIds) {
            try {
                invoice.relatedInvoiceIds = JSON.parse(invoice.relatedInvoiceIds);
            }
            catch (e) {
                invoice.relatedInvoiceIds = [];
            }
        }
        else {
            invoice.relatedInvoiceIds = [];
        }
        // Load payment collected - FIRST check invoice's own paidAmount field
        (0, logger_1.logDebug)(`ðŸ’° [getInvoiceById] Invoice paidAmount from DB: ${invoice.paidAmount}`);
        // Use the invoice's paidAmount if it exists (direct field)
        if (invoice.paidAmount && Number(invoice.paidAmount) > 0) {
            invoice.paymentCollected = Number(invoice.paidAmount);
            (0, logger_1.logDebug)(`âœ… Loaded paidAmount directly from invoice: ${invoice.paymentCollected}`);
        }
        else {
            // Fallback: Search for linked payment/receipt invoices (legacy method)
            try {
                (0, logger_1.logDebug)(`ðŸ” [getInvoiceById] Searching for linked payment invoice: ${id} (number: ${invoice.number})`);
                // Method 1: Search by sourceInvoiceId OR referenceInvoiceId (ONLY inline payments owned by this invoice)
                const [linkedPayments] = yield conn.query(`SELECT total FROM invoices 
                     WHERE (sourceInvoiceId = ? OR referenceInvoiceId = ?)
                     AND (type = 'RECEIPT' OR type = 'PAYMENT')
                     ORDER BY id DESC LIMIT 1`, [id, id]);
                if (linkedPayments.length > 0) {
                    invoice.paymentCollected = Number(linkedPayments[0].total);
                    (0, logger_1.logDebug)(`ðŸ’° Found linked payment invoice by ID: ${invoice.paymentCollected}`);
                }
                else {
                    // Method 2: Search by invoice number in notes (fallback for legacy data)
                    const [paymentsByNumber] = yield conn.query(`SELECT total FROM invoices 
                         WHERE (type = 'RECEIPT' OR type = 'PAYMENT')
                         AND (notes LIKE ? OR notes LIKE ?)`, [`%دفعة مع الفاتورة ${invoice.number}%`, `%دفعة مع الفاتورة ${id}%`]);
                    if (paymentsByNumber.length > 0) {
                        invoice.paymentCollected = Number(paymentsByNumber[0].total);
                        (0, logger_1.logDebug)(`ðŸ’° Found linked payment invoice by number: ${invoice.paymentCollected}`);
                    }
                    else {
                        invoice.paymentCollected = 0;
                        (0, logger_1.logDebug)(`â„¹ï¸ No payment found for invoice ${id}`);
                    }
                }
            }
            catch (e) {
                console.error('Error loading linked payments:', e);
                invoice.paymentCollected = 0;
            }
        }
        // Parse paymentBreakdown JSON if it exists
        if (invoice.paymentBreakdown) {
            try {
                invoice.paymentBreakdown = JSON.parse(invoice.paymentBreakdown);
            }
            catch (e) {
                invoice.paymentBreakdown = undefined;
            }
        }
        // Parse bankTransfers JSON if it exists
        if (invoice.bankTransfers) {
            try {
                invoice.bankTransfers = JSON.parse(invoice.bankTransfers);
                console.log(`ðŸ¦ Loaded ${invoice.bankTransfers.length} bank transfers for invoice ${id}`);
            }
            catch (e) {
                invoice.bankTransfers = [];
            }
        }
        // Lookup warehouse name if warehouseId exists (for mobile display)
        if (invoice.warehouseId) {
            try {
                const [warehouses] = yield conn.query('SELECT name FROM warehouses WHERE id = ? LIMIT 1', [invoice.warehouseId]);
                if (warehouses.length > 0) {
                    invoice.warehouseName = warehouses[0].name;
                    console.log(`ðŸ¬ Loaded warehouse name: ${invoice.warehouseName}`);
                }
            }
            catch (e) {
                console.warn('Could not load warehouse name:', e);
            }
        }
        // === Fetch linked return invoices for SELL/PURCHASE invoices ===
        // This allows the UI to show which returns are SPECIFICALLY linked to this invoice
        // (not all returns for the same partner)
        if (['INVOICE_SALE', 'INVOICE_PURCHASE'].includes(invoice.type)) {
            try {
                const returnType = invoice.type === 'INVOICE_SALE' ? "('RETURN_SALE', 'SALE_RETURN')" : "('RETURN_PURCHASE', 'PURCHASE_RETURN')";
                const [linkedReturns] = yield conn.query(`SELECT id, number, date, total, status, referenceInvoiceId
                     FROM invoices 
                     WHERE referenceInvoiceId = ?
                       AND type IN ${returnType}
                       AND status = 'POSTED'
                     ORDER BY date DESC`, [actualId]);
                invoice.linkedReturnInvoices = linkedReturns.map(r => ({
                    id: r.id,
                    number: r.number,
                    date: r.date,
                    total: Number(r.total) || 0,
                    status: r.status
                }));
                if (invoice.linkedReturnInvoices.length > 0) {
                    console.log(`ðŸ”„ Found ${invoice.linkedReturnInvoices.length} linked returns for invoice ${invoice.number}`);
                }
            }
            catch (e) {
                console.warn('Could not load linked returns:', e);
                invoice.linkedReturnInvoices = [];
            }
        }
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // CHEQUES: Fetch linked cheques for this transaction.
        // The bulk getInvoices endpoint already does this, but
        // getInvoiceById was missing it â€” causing the PartnerPayment
        // form to render empty when viewing a receipt from the
        // partner statement or treasury drill-down.
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        try {
            const [txCheques] = yield conn.query(`SELECT id, number, amount, dueDate, bankName, status, transactionId, type, createdDate, description, bankAccountId
                 FROM cheques WHERE transactionId = ?`, [actualId]);
            invoice.transactionCheques = txCheques.map((c) => (Object.assign(Object.assign({}, c), { dueDate: c.dueDate ? new Date(c.dueDate).toISOString().split('T')[0] : '', createdDate: c.createdDate ? new Date(c.createdDate).toISOString().split('T')[0] : '' })));
        }
        catch (e) {
            console.warn('Could not load cheques for invoice:', e);
            invoice.transactionCheques = [];
        }
        // Compute historical partner balance before and after this transaction
        if (invoice.partnerId) {
            try {
                const [balanceRows] = yield conn.query(`
                    SELECT 
                        COALESCE(p.openingBalance, 0) +
                        CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 THEN COALESCE(inv_agg.cImpactAfter, 0) + COALESCE(inv_agg.bounceImpactAfter, 0) ELSE 0 END +
                        CASE WHEN p.isSupplier = 1 THEN COALESCE(inv_agg.sImpactAfter, 0) - COALESCE(inv_agg.bounceImpactAfter, 0) ELSE 0 END as balanceAfter,
                        
                        COALESCE(p.openingBalance, 0) +
                        CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 THEN COALESCE(inv_agg.cImpactBefore, 0) + COALESCE(inv_agg.bounceImpactBefore, 0) ELSE 0 END +
                        CASE WHEN p.isSupplier = 1 THEN COALESCE(inv_agg.sImpactBefore, 0) - COALESCE(inv_agg.bounceImpactBefore, 0) ELSE 0 END as balanceBefore
                    FROM partners p
                    LEFT JOIN (
                        SELECT i.partnerId,
                            SUM(CASE WHEN (i.date < ? OR (i.date = ? AND i.number <= ?)) THEN
                                CASE
                                    WHEN i.type = 'INVOICE_SALE' AND COALESCE(i.paymentMethod, '') != 'CASH' AND NOT (COALESCE(i.isPOSSale, 0) = 1 AND COALESCE(i.paymentMethod, '') NOT IN ('DEFERRED', 'CREDIT')) THEN i.total
                                    WHEN i.type = 'RETURN_SALE' AND COALESCE(i.paymentMethod, '') != 'CASH' AND NOT (COALESCE(i.isPOSSale, 0) = 1 AND COALESCE(i.paymentMethod, '') NOT IN ('DEFERRED', 'CREDIT')) THEN -(i.total)
                                    WHEN i.type IN ('RECEIPT', 'DISCOUNT_ALLOWED', 'CHEQUE_DEPOSIT', 'CHEQUE_COLLECT') AND (COALESCE(p2.isSupplier, 0) = 0 OR COALESCE(i.voucherCategory, '') NOT IN ('supplier', 'supplier_refund')) THEN -(i.total)
                                    WHEN i.type = 'PAYMENT' AND (COALESCE(p2.isSupplier, 0) = 0 OR i.voucherCategory IN ('customer', 'labour')) THEN i.total
                                    ELSE 0 END
                                ELSE 0 END) as cImpactAfter,
                            SUM(CASE WHEN (i.date < ? OR (i.date = ? AND i.number < ?)) THEN
                                CASE
                                    WHEN i.type = 'INVOICE_SALE' AND COALESCE(i.paymentMethod, '') != 'CASH' AND NOT (COALESCE(i.isPOSSale, 0) = 1 AND COALESCE(i.paymentMethod, '') NOT IN ('DEFERRED', 'CREDIT')) THEN i.total
                                    WHEN i.type = 'RETURN_SALE' AND COALESCE(i.paymentMethod, '') != 'CASH' AND NOT (COALESCE(i.isPOSSale, 0) = 1 AND COALESCE(i.paymentMethod, '') NOT IN ('DEFERRED', 'CREDIT')) THEN -(i.total)
                                    WHEN i.type IN ('RECEIPT', 'DISCOUNT_ALLOWED', 'CHEQUE_DEPOSIT', 'CHEQUE_COLLECT') AND (COALESCE(p2.isSupplier, 0) = 0 OR COALESCE(i.voucherCategory, '') NOT IN ('supplier', 'supplier_refund')) THEN -(i.total)
                                    WHEN i.type = 'PAYMENT' AND (COALESCE(p2.isSupplier, 0) = 0 OR i.voucherCategory IN ('customer', 'labour')) THEN i.total
                                    ELSE 0 END
                                ELSE 0 END) as cImpactBefore,
                            
                            SUM(CASE WHEN (i.date < ? OR (i.date = ? AND i.number <= ?)) THEN
                                CASE
                                    WHEN i.type = 'INVOICE_PURCHASE' AND COALESCE(i.paymentMethod, '') != 'CASH' AND NOT (COALESCE(i.isPOSSale, 0) = 1 AND COALESCE(i.paymentMethod, '') NOT IN ('DEFERRED', 'CREDIT')) THEN -(i.total)
                                    WHEN i.type = 'RETURN_PURCHASE' AND COALESCE(i.paymentMethod, '') != 'CASH' AND NOT (COALESCE(i.isPOSSale, 0) = 1 AND COALESCE(i.paymentMethod, '') NOT IN ('DEFERRED', 'CREDIT')) THEN i.total
                                    WHEN i.type IN ('PAYMENT', 'DISCOUNT_EARNED', 'CHEQUE_CASHED') AND (COALESCE(p2.isCustomer, 0) = 0 OR COALESCE(i.voucherCategory, '') NOT IN ('customer', 'labour')) THEN i.total
                                    WHEN i.type = 'RECEIPT' AND (COALESCE(p2.isCustomer, 0) = 0 OR i.voucherCategory IN ('supplier', 'supplier_refund')) THEN -(i.total)
                                    ELSE 0 END
                                ELSE 0 END) as sImpactAfter,
                            SUM(CASE WHEN (i.date < ? OR (i.date = ? AND i.number < ?)) THEN
                                CASE
                                    WHEN i.type = 'INVOICE_PURCHASE' AND COALESCE(i.paymentMethod, '') != 'CASH' AND NOT (COALESCE(i.isPOSSale, 0) = 1 AND COALESCE(i.paymentMethod, '') NOT IN ('DEFERRED', 'CREDIT')) THEN -(i.total)
                                    WHEN i.type = 'RETURN_PURCHASE' AND COALESCE(i.paymentMethod, '') != 'CASH' AND NOT (COALESCE(i.isPOSSale, 0) = 1 AND COALESCE(i.paymentMethod, '') NOT IN ('DEFERRED', 'CREDIT')) THEN i.total
                                    WHEN i.type IN ('PAYMENT', 'DISCOUNT_EARNED', 'CHEQUE_CASHED') AND (COALESCE(p2.isCustomer, 0) = 0 OR COALESCE(i.voucherCategory, '') NOT IN ('customer', 'labour')) THEN i.total
                                    WHEN i.type = 'RECEIPT' AND (COALESCE(p2.isCustomer, 0) = 0 OR i.voucherCategory IN ('supplier', 'supplier_refund')) THEN -(i.total)
                                    ELSE 0 END
                                ELSE 0 END) as sImpactBefore,
                                
                            SUM(CASE WHEN (i.date < ? OR (i.date = ? AND i.number <= ?)) AND i.type = 'CHEQUE_BOUNCE' THEN i.total ELSE 0 END) as bounceImpactAfter,
                            SUM(CASE WHEN (i.date < ? OR (i.date = ? AND i.number < ?)) AND i.type = 'CHEQUE_BOUNCE' THEN i.total ELSE 0 END) as bounceImpactBefore
                        FROM invoices i
                        LEFT JOIN partners p2 ON i.partnerId = p2.id
                        WHERE i.partnerId = ?
                          AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
                        GROUP BY i.partnerId
                    ) inv_agg ON inv_agg.partnerId = p.id
                    WHERE p.id = ?
                `, [
                    invoice.date, invoice.date, invoice.number || '',
                    invoice.date, invoice.date, invoice.number || '',
                    invoice.date, invoice.date, invoice.number || '',
                    invoice.date, invoice.date, invoice.number || '',
                    invoice.date, invoice.date, invoice.number || '',
                    invoice.date, invoice.date, invoice.number || '',
                    invoice.partnerId, invoice.partnerId
                ]);
                if (balanceRows.length > 0) {
                    invoice.partnerBalanceBefore = Math.round(Number(balanceRows[0].balanceBefore || 0) * 100) / 100;
                    invoice.partnerBalanceAfter = Math.round(Number(balanceRows[0].balanceAfter || 0) * 100) / 100;
                }
            }
            catch (balErr) {
                console.warn('Could not calculate historical partner balance:', balErr);
            }
        }
        conn.release();
        // Cache the result for deduplication (2-second TTL)
        setCachedInvoice(id, invoice);
        res.json(invoice);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getInvoiceById');
    }
});
exports.getInvoiceById = getInvoiceById;
// GET /api/invoices/public/:id - Public unauthenticated invoice view (Cairo font Arabic display)
const getPublicInvoiceById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        const [invoices] = yield conn.query(`SELECT i.*, s.name as salesmanName, w.name as warehouseName 
             FROM invoices i 
             LEFT JOIN salesmen s ON i.salesmanId = s.id 
             LEFT JOIN warehouses w ON i.warehouseId = w.id 
             WHERE i.id = ? OR i.number = ?`, [id, id]);
        if (invoices.length === 0) {
            conn.release();
            return res.status(404).json({ message: 'الفاتورة غير موجودة' });
        }
        const invoice = invoices[0];
        // Fetch partner details
        let partner = null;
        if (invoice.partnerId) {
            const [partners] = yield conn.query(`SELECT id, name, phone, address, taxId FROM partners WHERE id = ?`, [invoice.partnerId]);
            if (partners.length > 0) {
                partner = partners[0];
            }
        }
        const [lines] = yield conn.query(`SELECT il.*, 
                    p.barcode AS productBarcode, p.sku AS productSku, p.cost AS productCost, 
                    p.price AS productPrice, p.trackSerials AS productTrackSerials, 
                    p.isActive AS productIsActive, p.categoryId AS productCategoryId,
                    p.ceramic_size, p.ceramic_color, p.ceramic_pattern, p.ceramicGroup, 
                    p.ceramic_name, p.ceramic_color_grade, p.ceramic_color_desc, p.ceramicItemDesc,
                    c.name AS productCategoryName
             FROM invoice_lines il
             LEFT JOIN products p ON il.productId = p.id
             LEFT JOIN categories c ON p.categoryId = c.id
             WHERE il.invoiceId = ?`, [invoice.id]);
        // Attach product to lines
        const enrichedLines = lines.map(line => {
            line.product = {
                id: line.productId,
                name: line.productName,
                barcode: line.variantBarcode || line.productBarcode || null,
                sku: line.variantSku || line.productSku || null,
                cost: Number(line.productCost || 0),
                price: Number(line.productPrice || 0),
                trackSerials: !!line.productTrackSerials,
                isActive: line.productIsActive !== 0,
                categoryId: line.productCategoryId || '',
                categoryName: line.productCategoryName || '',
                ceramicSize: line.ceramic_size || '',
                ceramicColor: line.ceramic_color || '',
                ceramicPattern: line.ceramic_pattern || '',
                ceramicGroup: line.ceramicGroup || '',
                ceramicName: line.ceramic_name || '',
                ceramicColorGrade: line.ceramic_color_grade || '',
                ceramicColorDesc: line.ceramic_color_desc || '',
                ceramicItemDesc: line.ceramicItemDesc || ''
            };
            return line;
        });
        invoice.lines = enrichedLines;
        const [configRows] = yield conn.query('SELECT * FROM system_config LIMIT 1');
        const systemConfigRow = configRows[0] || {};
        // Parse system config JSON
        let systemConfig = {};
        if (systemConfigRow.config) {
            try {
                const parsed = JSON.parse(systemConfigRow.config);
                systemConfig = Object.assign(Object.assign({}, parsed), { companyName: systemConfigRow.companyName, companyAddress: systemConfigRow.companyAddress, companyPhone: systemConfigRow.companyPhone, companyEmail: systemConfigRow.companyEmail, taxId: systemConfigRow.taxId, commercialRegister: systemConfigRow.commercialRegister, currency: systemConfigRow.currency, vatRate: systemConfigRow.vatRate, logo: parsed.logo || null, qrCode: parsed.qrCode || null });
            }
            catch (e) {
                systemConfig = systemConfigRow;
            }
        }
        else {
            systemConfig = systemConfigRow;
        }
        conn.release();
        return res.json({ invoice, partner, systemConfig });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getPublicInvoiceById');
    }
});
exports.getPublicInvoiceById = getPublicInvoiceById;
const createInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const conn = yield (0, db_1.getConnection)();
    try {
        (0, logger_1.logDebug)('ðŸš€ [createInvoice] Called with body:', { id: req.body.id, type: req.body.type, paymentCollected: req.body.paymentCollected });
        (0, logger_1.logDebug)('ðŸ¦ [createInvoice] bankTransfers received:', req.body.bankTransfers);
        (0, logger_1.logDebug)('ðŸ’Ž [createInvoice TOP] denominations=', JSON.stringify(req.body.denominations), 'paymentCollected=', req.body.paymentCollected);
        let id = req.body.id || (0, crypto_1.randomUUID)();
        // === CHECK IF INVOICE EXISTS (UPDATE vs CREATE) ===
        if (req.body.id) {
            const [existing] = yield conn.query('SELECT id FROM invoices WHERE id = ?', [req.body.id]);
            if (existing.length > 0) {
                // Invoice exists - delegate to updateInvoice
                (0, logger_1.logDebug)(`ðŸ“ Invoice ${req.body.id} exists - updating instead of creating`);
                conn.release();
                req.params = { id: req.body.id };
                return (0, exports.updateInvoice)(req, res);
            }
        }
        // === INVOICE DOES NOT EXIST - PROCEED WITH CREATE ===
        yield conn.beginTransaction();
        // === FISCAL YEAR GUARD: Block if date is in closed year or locked period ===
        const fyCheck = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)(req.body.date);
        if (!fyCheck.allowed) {
            yield conn.rollback();
            conn.release();
            return res.status(403).json({
                code: fyCheck.errorCode || 'FISCAL_YEAR_CLOSED',
                message: fyCheck.error,
                error: fyCheck.error
            });
        }
        let { date: rawDate, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, dueDate, taxAmount, whtAmount, shippingFee, globalDiscount, lines, salesmanId, salesmanName, paymentCollected } = req.body;
        // === DISCOUNT PERMISSION CHECK ===
        const isSales = ['INVOICE_SALE', 'RETURN_SALE', 'SALE_INVOICE'].includes(type);
        const hasDiscount = (Number(globalDiscount) > 0 || (lines === null || lines === void 0 ? void 0 : lines.some((l) => Number(l.discount) > 0)));
        if (hasDiscount && req.user) {
            const discountPermission = isSales ? 'sales.discount' : 'purchase.discount';
            if (!(0, dataFiltering_1.hasPermission)(req.user, discountPermission)) {
                yield conn.rollback();
                conn.release();
                return res.status(403).json({
                    error: 'PERMISSION_DENIED',
                    message: `You do not have permission to apply discounts on ${isSales ? 'sales' : 'purchase'} transactions`,
                    requiredPermission: discountPermission
                });
            }
        }
        const resolvedBranchId = (0, branchFilter_1.resolveBranchIdForWrite)(req, req.body.branchId);
        // TIMEZONE FIX: Pad date-only strings to prevent midnight UTC â†’ previous day in Egypt
        const date = (0, dateEngine_1.toMySQLDateTime)(rawDate) || rawDate;
        // === SERVER-SIDE TOTAL VALIDATION ===
        // Skip validation for RECEIPT/PAYMENT which don't have line items
        if (lines && lines.length > 0 && !['RECEIPT', 'PAYMENT'].includes(type)) {
            const validation = (0, errorHandler_1.validateInvoiceTotal)(lines, total, taxAmount || 0, globalDiscount || 0, whtAmount || 0, shippingFee || 0);
            if (!validation.valid) {
                conn.release();
                return res.status(400).json({
                    code: 'TOTAL_MISMATCH',
                    message: validation.message,
                    calculated: validation.calculated,
                    provided: total
                });
            }
            console.log(`âœ… Invoice total validated: ${validation.calculated}`);
            // BUG FIX: Use the authoritative server-calculated total for all subsequent logic
            total = validation.calculated;
        }
        // === INVOICE PAYLOAD VALIDATION ===
        const LINE_BEARING_TYPES = ['INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE'];
        // Guard 1: Line-bearing invoice types must have at least one line
        if (LINE_BEARING_TYPES.includes(type) && (!lines || lines.length === 0)) {
            conn.release();
            return res.status(400).json({
                code: 'EMPTY_INVOICE',
                message: '\u064a\u062c\u0628 \u0625\u0636\u0627\u0641\u0629 \u0635\u0646\u0641 \u0648\u0627\u062d\u062f \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0644\u0644\u0641\u0627\u062a\u0648\u0631\u0629'
            });
        }
        // Guard 2: Discount per line must not exceed its own line total
        if (lines && lines.length > 0) {
            for (const line of lines) {
                const lineTotal = (Number(line.quantity) || 0) * (Number(line.price) || 0);
                const lineDiscount = Number(line.discount) || 0;
                if (lineDiscount > lineTotal + 0.001) {
                    conn.release();
                    return res.status(400).json({
                        code: 'INVALID_DISCOUNT',
                        message: `\u0627\u0644\u062e\u0635\u0645 \u0644\u0644\u0635\u0646\u0641 "${line.productName || line.productId}" \u064a\u062a\u062c\u0627\u0648\u0632 \u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0633\u0637\u0631`,
                        lineProductId: line.productId
                    });
                }
            }
        }
        // Guards 3 & 4: Return-specific validations
        const isReturnType = type === 'RETURN_SALE' || type === 'RETURN_PURCHASE';
        const referenceInvoiceId = req.body.referenceInvoiceId;
        if (isReturnType && referenceInvoiceId) {
            // Guard 3: Referenced invoice must exist (and lock to prevent concurrent return race conditions)
            const [refInvoiceRows] = yield conn.query('SELECT id FROM invoices WHERE id = ? LIMIT 1 FOR UPDATE', [referenceInvoiceId]);
            if (refInvoiceRows.length === 0) {
                yield conn.rollback();
                conn.release();
                return res.status(404).json({
                    code: 'REFERENCE_NOT_FOUND',
                    message: `\u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629 \u0627\u0644\u0645\u0631\u062c\u0639\u064a\u0629 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f\u0629: ${referenceInvoiceId}`
                });
            }
            // Guard 4: Return quantity, product, and price validation
            if (lines && lines.length > 0) {
                const [originalLines] = yield conn.query('SELECT productId, SUM(quantity) as originalQty, MAX(price) as originalPrice FROM invoice_lines WHERE invoiceId = ? GROUP BY productId', [referenceInvoiceId]);
                // Fetch already returned quantities for this invoice
                const [returnedLines] = yield conn.query(`SELECT il.productId, SUM(il.quantity) as returnedQty 
                     FROM invoice_lines il 
                     JOIN invoices i ON il.invoiceId = i.id 
                     WHERE i.referenceInvoiceId = ? 
                     AND i.type IN ('RETURN_SALE', 'RETURN_PURCHASE') 
                     AND i.status != 'VOID' 
                     AND i.id != ?
                     GROUP BY il.productId`, [referenceInvoiceId, id]);
                const originalLineMap = new Map(originalLines.map((l) => [String(l.productId), { qty: Number(l.originalQty), price: Number(l.originalPrice) }]));
                const returnedQtyMap = new Map(returnedLines.map((l) => [String(l.productId), Number(l.returnedQty)]));
                for (const line of lines) {
                    const original = originalLineMap.get(String(line.productId));
                    // Guard 4a: Product must exist in the original invoice
                    if (!original) {
                        yield conn.rollback();
                        conn.release();
                        return res.status(400).json({
                            code: 'PRODUCT_NOT_IN_ORIGINAL',
                            message: `\u0627\u0644\u0635\u0646\u0641 "${line.productName || line.productId}" \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f \u0641\u064a \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629 \u0627\u0644\u0623\u0635\u0644\u064a\u0629`,
                            productId: line.productId
                        });
                    }
                    const { qty: originalQty, price: originalPrice } = original;
                    const alreadyReturned = (_a = returnedQtyMap.get(String(line.productId))) !== null && _a !== void 0 ? _a : 0;
                    const returnQty = Number(line.quantity) || 0;
                    const returnPrice = Number(line.price) || 0;
                    const availableToReturn = originalQty - alreadyReturned;
                    // Guard 4b: Return price must not exceed original sale price
                    if (returnPrice > originalPrice + 0.001) {
                        yield conn.rollback();
                        conn.release();
                        return res.status(400).json({
                            code: 'RETURN_PRICE_EXCEEDS_ORIGINAL',
                            message: `\u0633\u0639\u0631 \u0627\u0644\u0645\u0631\u062a\u062c\u0639 (${returnPrice}) \u0644\u0644\u0635\u0646\u0641 "${line.productName || line.productId}" \u0623\u0639\u0644\u0649 \u0645\u0646 \u0633\u0639\u0631 \u0627\u0644\u0628\u064a\u0639 \u0627\u0644\u0623\u0635\u0644\u064a (${originalPrice}). \u064a\u062c\u0628 \u0623\u0646 \u064a\u062a\u0637\u0627\u0628\u0642 \u0633\u0639\u0631 \u0627\u0644\u0645\u0631\u062a\u062c\u0639 \u0645\u0639 \u0633\u0639\u0631 \u0627\u0644\u0628\u064a\u0639`,
                            productId: line.productId,
                            returnPrice,
                            originalPrice
                        });
                    }
                    // Guard 4c: Return quantity must not exceed available (original - already returned)
                    if (returnQty > availableToReturn + 0.001) {
                        yield conn.rollback();
                        conn.release();
                        return res.status(400).json({
                            code: 'RETURN_EXCEEDS_ORIGINAL',
                            message: `\u0643\u0645\u064a\u0629 \u0627\u0644\u0645\u0631\u062a\u062c\u0639 \u0644\u0644\u0635\u0646\u0641 "${line.productName || line.productId}" (${returnQty}) \u062a\u062a\u062c\u0627\u0648\u0632 \u0627\u0644\u0645\u062a\u0628\u0642\u064a \u0627\u0644\u0645\u0633\u0645\u0648\u062d \u0625\u0631\u062c\u0627\u0639\u0647 (${availableToReturn}) (\u0627\u0644\u0623\u0635\u0644: ${originalQty}, \u0645\u0631\u062a\u062c\u0639 \u0633\u0627\u0628\u0642: ${alreadyReturned})`,
                            productId: line.productId,
                            returnQty,
                            originalQty,
                            alreadyReturned
                        });
                    }
                }
            }
        }
        // Guard 5: Payment/Receipt integrity checks
        const isPaymentType = type === 'RECEIPT' || type === 'PAYMENT';
        // Guard 5a: Reject zero payment amounts (negative allowed for reversals)
        if (isPaymentType) {
            const requestedAmount = Number(total) || 0;
            if (requestedAmount === 0) {
                yield conn.rollback();
                conn.release();
                return res.status(400).json({
                    code: 'INVALID_PAYMENT_AMOUNT',
                    message: `\u0642\u064a\u0645\u0629 \u0627\u0644\u0633\u0646\u062f \u064a\u062c\u0628 \u0623\u0646 \u062a\u0643\u0648\u0646 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631 (${requestedAmount})`
                });
            }
        }
        // Guard 5b: Payment against a referenced invoice â€” balance and status checks
        if (isPaymentType && referenceInvoiceId) {
            const [refRows] = yield conn.query('SELECT total, status FROM invoices WHERE id = ? LIMIT 1 FOR UPDATE', [referenceInvoiceId]);
            if (refRows.length === 0) {
                yield conn.rollback();
                conn.release();
                return res.status(404).json({
                    code: 'REFERENCE_NOT_FOUND',
                    message: `\u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629 \u0627\u0644\u0645\u0631\u062c\u0639\u064a\u0629 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f\u0629: ${referenceInvoiceId}`
                });
            }
            // Reject payments against VOID invoices
            if (refRows[0].status === 'VOID') {
                yield conn.rollback();
                conn.release();
                return res.status(400).json({
                    code: 'PAYMENT_ON_VOID_INVOICE',
                    message: `\u0644\u0627 \u064a\u0645\u0643\u0646 \u0625\u0636\u0627\u0641\u0629 \u062f\u0641\u0639\u0629 \u0639\u0644\u0649 \u0641\u0627\u062a\u0648\u0631\u0629 \u0645\u0644\u063a\u0627\u0629`
                });
            }
            const [paymentRows] = yield conn.query(`SELECT COALESCE(SUM(total), 0) as totalPaid FROM invoices 
                 WHERE referenceInvoiceId = ? AND type IN ('RECEIPT', 'PAYMENT') AND status != 'VOID' AND id != ?`, [referenceInvoiceId, id]);
            const originalTotal = Number(refRows[0].total) || 0;
            const alreadyPaid = Number(paymentRows[0].totalPaid) || 0;
            const requestedAmount = Number(total) || 0;
            if (requestedAmount > (originalTotal - alreadyPaid) + 0.01) {
                yield conn.rollback();
                conn.release();
                return res.status(400).json({
                    code: 'OVERPAYMENT_NOT_ALLOWED',
                    message: `\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0645\u0637\u0644\u0648\u0628 (${requestedAmount}) \u064a\u062a\u062c\u0627\u0648\u0632 \u0627\u0644\u0631\u0635\u064a\u062f \u0627\u0644\u0645\u062a\u0628\u0642\u064a \u0644\u0644\u0641\u0627\u062a\u0648\u0631\u0629 (${(originalTotal - alreadyPaid).toFixed(2)})`
                });
            }
        }
        // === POLICY ENFORCEMENT: Full server-side validation ===
        const authReqPolicy = req;
        if (authReqPolicy.systemConfig) {
            const currentUser = ((_b = authReqPolicy.user) === null || _b === void 0 ? void 0 : _b.name) || ((_c = authReqPolicy.user) === null || _c === void 0 ? void 0 : _c.username) || req.body.createdBy || null;
            const policyContext = {
                type,
                date,
                total,
                partnerId,
                notes,
                costCenterId: req.body.costCenterId,
                warehouseId: req.body.warehouseId,
                currentUser: currentUser,
                currentUserRole: (_d = authReqPolicy.user) === null || _d === void 0 ? void 0 : _d.role,
                lines: lines === null || lines === void 0 ? void 0 : lines.map((l) => ({
                    productId: l.productId,
                    quantity: l.quantity || 0,
                    // For purchase invoices, line.price IS the purchase cost.
                    // line.cost is the product's existing cost (0 for new products),
                    // so fall back to price if cost is empty
                    cost: l.cost || l.price || 0,
                    price: l.price || 0
                }))
            };
            const policyResult = yield (0, policyEnforcement_1.validateTransactionFull)(policyContext, authReqPolicy.systemConfig, conn);
            if (!policyResult.valid) {
                conn.release();
                return res.status(403).json({ message: policyResult.error, errorCode: policyResult.errorCode });
            }
        }
        let invoiceNumber = req.body.number;
        if (!invoiceNumber) {
            const prefixMap = {
                'INVOICE_SALE': 'INV-',
                'INVOICE_PURCHASE': 'PUR-',
                'RETURN_SALE': 'RET-S-',
                'RETURN_PURCHASE': 'RET-P-',
                'RECEIPT': 'REC-',
                'PAYMENT': 'PAY-',
                'QUOTATION': 'QUO-',
            };
            const prefix = prefixMap[type] || 'TRX-';
            // Gap-Fill: conn already has an open transaction — safe to call directly
            invoiceNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, prefix);
        }
        // SAFETY: Ensure invoiceNumber is NEVER null/undefined
        if (!invoiceNumber) {
            const fallbackPrefix = {
                'INVOICE_SALE': 'INV-', 'INVOICE_PURCHASE': 'PUR-',
                'RETURN_SALE': 'RET-S-', 'RETURN_PURCHASE': 'RET-P-',
                'RECEIPT': 'REC-', 'PAYMENT': 'PAY-', 'QUOTATION': 'QUO-',
            };
            const fp = fallbackPrefix[type] || 'TRX-';
            invoiceNumber = `${fp}${String(Date.now()).slice(-5).padStart(5, '0')}`;
            console.warn(`⚠️ [createInvoice] Invoice number was null! Generated fallback: ${invoiceNumber}`);
        }
        // === SERIAL FIX: For PAYMENT/RECEIPT, id === number (single identity) ===
        // e.g. PAY-00032 is BOTH the primary key and the display number.
        // This prevents the old split where id=PAY_timestamp but number=PAY-00032.
        if (['PAYMENT', 'RECEIPT'].includes(type)) {
            id = invoiceNumber;
        }
        console.log(`📝 [createInvoice] Final invoice: id=${id}, number=${invoiceNumber}, type=${type}`);
        // Get createdBy from request user or body
        const authReq = req;
        const createdBy = ((_e = authReq.user) === null || _e === void 0 ? void 0 : _e.username) || ((_f = authReq.user) === null || _f === void 0 ? void 0 : _f.name) || req.body.createdBy || req.body.user || null;
        // Sanitize dates - convert empty strings to null
        const sanitizedDueDate = dueDate && dueDate !== '' ? dueDate : null;
        // Sanitize warehouseId
        const sanitizedWarehouseId = req.body.warehouseId && typeof req.body.warehouseId === 'string'
            ? req.body.warehouseId.substring(0, 36)
            : null;
        // Sanitize partnerId for non-partner voucher categories (expenses use accountId, advances use employeeId)
        // The invoices table has FK constraint: partnerId REFERENCES partners(id)
        const voucherCategory = req.body.voucherCategory;
        const originalPartnerId = partnerId; // Keep original before FK sanitization (used for employee advances)
        const sanitizedPartnerId = (voucherCategory === 'expenses' || voucherCategory === 'employee_advance' || voucherCategory === 'employee_repay' || voucherCategory === 'salary')
            ? null // These IDs are NOT in the partners table, would violate FK
            : (partnerId || null);
        // === SERVER-SIDE PARTNER NAME GUARD ===
        // When partnerName is missing from payload (e.g., AsyncPartnerSelect race condition),
        // look it up from the database to prevent empty names in journal entries.
        let resolvedPartnerName = partnerName;
        if (!resolvedPartnerName && sanitizedPartnerId) {
            try {
                const [pRows] = yield conn.query(`SELECT name FROM partners WHERE id = ? LIMIT 1`, [sanitizedPartnerId]);
                if (pRows[0]) {
                    resolvedPartnerName = pRows[0].name;
                    console.log(`🔎 [createInvoice] Resolved missing partnerName from DB: "${resolvedPartnerName}" for partnerId: ${sanitizedPartnerId}`);
                }
            }
            catch (pErr) {
                console.warn(`⚠️ [createInvoice] Could not resolve partnerName for partnerId ${sanitizedPartnerId}:`, pErr);
            }
        }
        // Check if user has an open POS shift and link this cash transaction to it
        let posShiftId = req.body.posShiftId || null;
        if (!posShiftId && paymentMethod === 'CASH') {
            try {
                const userId = ((_g = req.user) === null || _g === void 0 ? void 0 : _g.id) || '';
                const [openShifts] = yield conn.query("SELECT id FROM pos_shifts WHERE userId = ? AND status = 'OPEN' LIMIT 1", [userId]);
                if (openShifts.length > 0) {
                    posShiftId = openShifts[0].id;
                }
                else if (userId) {
                    // Fallback: Find the most recent shift for this user active around the invoice date
                    const [recentShifts] = yield conn.query("SELECT id FROM pos_shifts WHERE userId = ? AND openedAt <= ? ORDER BY openedAt DESC LIMIT 1", [userId, date]);
                    if (recentShifts.length > 0) {
                        posShiftId = recentShifts[0].id;
                    }
                }
            }
            catch (err) {
                console.warn(`⚠️ [createInvoice] Could not resolve posShiftId:`, err);
            }
        }
        // === CONCURRENT-SAFE INSERT with duplicate number retry ===
        // When 10+ users create invoices simultaneously, two might get the same number.
        // The UNIQUE index on `number` will catch this — we retry with next number.
        let insertAttempts = 0;
        const MAX_INSERT_ATTEMPTS = 5;
        while (insertAttempts < MAX_INSERT_ATTEMPTS) {
            try {
                yield conn.query(`INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, dueDate, taxAmount, whtAmount, shippingFee, globalDiscount, globalDiscountType, globalDiscountValue, warehouseId, bankAccountId, bankName, paymentBreakdown, bankTransfers, salesmanId, priceListId, createdBy, paidAmount, currencyCode, exchangeRate, foreignTotal, bankTransferReference, referenceInvoiceId, voucherCategory, branchId, paymentSources, posShiftId) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    id, invoiceNumber, date, type, sanitizedPartnerId, resolvedPartnerName, total, status, paymentMethod, posted,
                    notes || (voucherCategory ? `${voucherCategory}|${partnerId || ''}` : null), sanitizedDueDate, taxAmount, whtAmount, shippingFee, globalDiscount,
                    req.body.globalDiscountType || 'FIXED', req.body.globalDiscountValue || 0, sanitizedWarehouseId,
                    req.body.partialPaymentBankId || req.body.bankAccountId || null,
                    req.body.partialPaymentMethod || req.body.bankName || null,
                    req.body.paymentBreakdown ? JSON.stringify(req.body.paymentBreakdown) : null,
                    req.body.bankTransfers ? JSON.stringify(req.body.bankTransfers) : null,
                    salesmanId || null, req.body.priceListId || null, createdBy,
                    req.body.paidAmount || req.body.paymentCollected || null, req.body.currencyCode || 'EGP', req.body.exchangeRate || 1,
                    req.body.foreignTotal || null, req.body.bankTransferReference || null, req.body.referenceInvoiceId || null,
                    voucherCategory || null, (0, branchFilter_1.resolveBranchIdForWrite)(req, req.body.branchId),
                    req.body.paymentSources ? JSON.stringify(req.body.paymentSources) : null,
                    posShiftId
                ]);
                break; // Success — exit retry loop
            }
            catch (insertErr) {
                if (insertErr.code === 'ER_DUP_ENTRY' && ((_h = insertErr.message) === null || _h === void 0 ? void 0 : _h.includes('number'))) {
                    insertAttempts++;
                    // Auto-increment the number and retry
                    const prefix = ((_j = invoiceNumber.match(/^[A-Z]+-(?:[A-Z]+-)?/)) === null || _j === void 0 ? void 0 : _j[0]) || 'TRX-';
                    const currentNum = parseInt(invoiceNumber.substring(prefix.length), 10) || 0;
                    invoiceNumber = `${prefix}${String(currentNum + 1).padStart(5, '0')}`;
                    // SERIAL FIX: For PAY/REC, id must track number
                    if (['PAYMENT', 'RECEIPT'].includes(type)) {
                        id = invoiceNumber;
                    }
                    console.warn(`⚠️ [createInvoice] Duplicate number collision (attempt ${insertAttempts}), retrying with: ${invoiceNumber}`);
                    if (insertAttempts >= MAX_INSERT_ATTEMPTS) {
                        // Absolute fallback — append timestamp to guarantee uniqueness
                        invoiceNumber = `${invoiceNumber}-${Date.now().toString(36)}`;
                        console.error(`❌ [createInvoice] Max retry attempts reached, using timestamped fallback: ${invoiceNumber}`);
                        yield conn.query(`INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, dueDate, taxAmount, whtAmount, shippingFee, globalDiscount, globalDiscountType, globalDiscountValue, warehouseId, bankAccountId, bankName, paymentBreakdown, bankTransfers, salesmanId, priceListId, createdBy, paidAmount, currencyCode, exchangeRate, foreignTotal, bankTransferReference, referenceInvoiceId, voucherCategory, branchId, paymentSources, posShiftId) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                            id, invoiceNumber, date, type, sanitizedPartnerId, resolvedPartnerName, total, status, paymentMethod, posted,
                            notes || (voucherCategory ? `${voucherCategory}|${partnerId || ''}` : null), sanitizedDueDate, taxAmount, whtAmount, shippingFee, globalDiscount,
                            req.body.globalDiscountType || 'FIXED', req.body.globalDiscountValue || 0, sanitizedWarehouseId,
                            req.body.partialPaymentBankId || req.body.bankAccountId || null,
                            req.body.partialPaymentMethod || req.body.bankName || null,
                            req.body.paymentBreakdown ? JSON.stringify(req.body.paymentBreakdown) : null,
                            req.body.bankTransfers ? JSON.stringify(req.body.bankTransfers) : null,
                            salesmanId || null, req.body.priceListId || null, createdBy,
                            req.body.paidAmount || req.body.paymentCollected || null, req.body.currencyCode || 'EGP', req.body.exchangeRate || 1,
                            req.body.foreignTotal || null, req.body.bankTransferReference || null, req.body.referenceInvoiceId || null,
                            voucherCategory || null, (0, branchFilter_1.resolveBranchIdForWrite)(req, req.body.branchId),
                            req.body.paymentSources ? JSON.stringify(req.body.paymentSources) : null,
                            posShiftId
                        ]);
                        break;
                    }
                }
                else {
                    throw insertErr; // Non-duplicate error â€” propagate
                }
            }
        }
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // CHEQUES: Persist transactionCheques to the cheques table
        // The frontend sends cheque data as req.body.transactionCheques
        // for CHEQUE/MIXED payment methods on RECEIPT/PAYMENT invoices.
        // Without this, cheque data was silently lost.
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const transactionCheques = req.body.transactionCheques;
        if (transactionCheques && Array.isArray(transactionCheques) && transactionCheques.length > 0) {
            for (const c of transactionCheques) {
                const chequeId = c.id || (0, crypto_1.randomUUID)();
                const chequeType = (type === 'RECEIPT') ? 'RECEIVABLE' : 'PAYABLE';
                yield conn.query(`INSERT INTO cheques (id, number, bankName, amount, dueDate, status, type, partnerId, partnerName, description, createdDate, bankAccountId, transactionId, createdBy)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                     amount = ?, dueDate = ?, bankName = ?, status = ?`, [
                    chequeId,
                    c.number || '',
                    c.bankName || '',
                    Number(c.amount) || 0,
                    c.dueDate || null,
                    c.status || 'PENDING',
                    c.type === 'ENDORSE' ? 'ENDORSED' : chequeType,
                    partnerId || null,
                    partnerName || null,
                    notes || null,
                    date,
                    c.bankAccountId || null,
                    id,
                    createdBy,
                    // ON DUPLICATE KEY UPDATE params:
                    Number(c.amount) || 0,
                    c.dueDate || null,
                    c.bankName || '',
                    c.status || 'PENDING'
                ]);
                // If endorsing an existing cheque, update its status
                if (c.type === 'ENDORSE' && c.chequeId) {
                    yield conn.query(`UPDATE cheques SET status = 'ENDORSED' WHERE id = ?`, [c.chequeId]);
                }
            }
            (0, logger_1.logDebug)(`[createInvoice] Saved ${transactionCheques.length} cheques for invoice ${id}`);
        }
        if (lines && lines.length > 0) {
            (0, logger_1.logDebug)('[createInvoice] Saving', lines.length, 'lines');
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // PRE-FETCH PRODUCT METADATA (trackInventory, stock, cost) FOR UPDATE
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const productIds = lines.map((l) => l.productId).filter(Boolean);
            const productsMeta = {};
            const productsCache = new Map();
            if (productIds.length > 0) {
                const [metaRows] = yield conn.query('SELECT id, trackInventory, stock, cost FROM products WHERE id IN (?) FOR UPDATE', [productIds]);
                for (const row of metaRows) {
                    productsMeta[row.id] = row.trackInventory !== 0 && row.trackInventory !== false;
                    productsCache.set(row.id, {
                        stock: Number(row.stock) || 0,
                        cost: Number(row.cost) || 0
                    });
                }
                for (const line of lines) {
                    line.trackInventory = (_k = productsMeta[line.productId]) !== null && _k !== void 0 ? _k : true;
                }
            }
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // PERF: BATCH INSERT all invoice_lines in a single query
            // Instead of N sequential INSERTs (one per line), we build
            // a single INSERT ... VALUES (row1), (row2), ... (rowN)
            // This reduces DB round-trips from N to 1
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const batchLineValues = [];
            const lineDataForSerials = [];
            for (const line of lines) {
                // Ensure strict 5-decimal precision, with safety check
                const rawQty = Number(line.quantity);
                const rawPrice = Number(line.price);
                const rawCost = Number(line.cost);
                const rawTotal = Number(line.total);
                const qty = !isNaN(rawQty) ? Number(rawQty.toFixed(5)) : 0;
                const price = !isNaN(rawPrice) ? Number(rawPrice.toFixed(2)) : 0;
                const cost = !isNaN(rawCost) ? Number(rawCost.toFixed(2)) : 0;
                const lineTotal = !isNaN(rawTotal) ? Number(rawTotal.toFixed(2)) : 0;
                const sanitizedLineWarehouseId = line.warehouseId && typeof line.warehouseId === 'string'
                    ? line.warehouseId.substring(0, 36)
                    : null;
                const bonusQty = Number(line.bonusQty) || 0;
                const gradeValue = line.grade || null;
                const returnConditionValue = (type === 'RETURN_SALE' || type === 'RETURN_PURCHASE') ? (line.returnCondition || 'GOOD') : null;
                // Multi-Unit Support: save unit info with the line
                const lineUnitId = line.unitId || null;
                const lineUnitName = line.unitName || null;
                const lineConversionFactor = Number(line.conversionFactor) || 1;
                const lineBaseQuantity = Number(line.baseQuantity) || (qty * lineConversionFactor);
                line.baseQuantity = lineBaseQuantity;
                const lineSerials = line.serials || [];
                const safeSerials = Array.isArray(lineSerials) ? lineSerials : [];
                const serialsJson = safeSerials.length > 0 ? JSON.stringify(safeSerials) : null;
                batchLineValues.push([
                    id, line.productId, line.productName, qty, price, cost,
                    line.discount, lineTotal, sanitizedLineWarehouseId, serialsJson,
                    bonusQty, gradeValue, lineUnitId, lineUnitName, lineConversionFactor,
                    lineBaseQuantity, returnConditionValue, line.priceListId || null,
                    line.variantId || null,
                    line.hasWarranty ? 1 : 0,
                    line.inBranchInstallation ? 1 : 0,
                    line.warrantyMonths || 0
                ]);
                // Collect serial data for post-batch processing
                if (safeSerials.length > 0) {
                    lineDataForSerials.push({ line, safeSerials, qty });
                }
            }
            // Execute batch INSERT (single query for all lines)
            try {
                yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, warehouseId, serials, bonusQty, grade, unitId, unitName, conversionFactor, baseQuantity, returnCondition, priceListId, variantId, hasWarranty, inBranchInstallation, warrantyMonths)
                     VALUES ?`, [batchLineValues]);
            }
            catch (ilErr) {
                // Fallback: try without unit columns if they don't exist yet
                (0, logger_1.logDebug)('âš ï¸ Batch invoice_lines insert failed, trying fallback:', ilErr.message);
                try {
                    const fallbackValues = batchLineValues.map(row => [
                        row[0], row[1], row[2], row[3], row[4], row[5],
                        row[6], row[7], row[8], row[9], row[10], row[11],
                        row[16], row[17] // returnCondition, priceListId
                    ]);
                    yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, warehouseId, serials, bonusQty, grade, returnCondition, priceListId)
                         VALUES ?`, [fallbackValues]);
                }
                catch (ilErr2) {
                    (0, logger_1.logDebug)('âš ï¸ Fallback batch insert failed, trying basic:', ilErr2.message);
                    const basicValues = batchLineValues.map(row => [
                        row[0], row[1], row[2], row[3], row[4], row[5],
                        row[6], row[7], row[17] // priceListId
                    ]);
                    yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, priceListId)
                         VALUES ?`, [basicValues]);
                }
            }
            // Pre-fetch warranty info for all products in lineDataForSerials to prevent N+1 query loop
            const warrantyProductIds = [...new Set(lineDataForSerials.map(x => x.line.productId).filter(Boolean))];
            const warrantyMonthsCache = new Map();
            if (warrantyProductIds.length > 0) {
                const [warrantyRows] = yield conn.query('SELECT id, warrantyMonths FROM products WHERE id IN (?)', [warrantyProductIds]);
                for (const row of warrantyRows) {
                    warrantyMonthsCache.set(row.id, Number(row.warrantyMonths) || 0);
                }
            }
            // === PROCESS SERIAL NUMBERS (must remain sequential per serial) ===
            // Serials need individual queries because each has conditional logic
            // (warranty lookup, status updates, transaction records)
            // Most invoices have 0 serials, so this rarely runs
            for (const { line, safeSerials } of lineDataForSerials) {
                for (const serial of safeSerials) {
                    const cleanSerial = String(serial).trim();
                    if (!cleanSerial)
                        continue;
                    try {
                        if (type === 'INVOICE_PURCHASE') {
                            // Fetch warranty info from cache
                            const wMonths = warrantyMonthsCache.get(line.productId) || 0;
                            let wStart = null;
                            let wEnd = null;
                            if (wMonths > 0) {
                                const startDate = new Date(date); // Use invoice date
                                const endDate = new Date(startDate);
                                endDate.setMonth(endDate.getMonth() + wMonths);
                                wStart = startDate.toISOString().split('T')[0];
                                wEnd = endDate.toISOString().split('T')[0];
                            }
                            // Register new serial
                            yield conn.query(`
                                INSERT INTO product_serials (id, productId, serialNumber, warehouseId, status, purchaseInvoiceId, warrantyStartDate, warrantyEndDate)
                                VALUES (UUID(), ?, ?, ?, 'AVAILABLE', ?, ?, ?)
                            `, [line.productId, cleanSerial, line.warehouseId || req.body.warehouseId, id, wStart, wEnd]);
                            yield conn.query(`
                                INSERT INTO serial_transactions (id, serialId, transactionType, referenceId, warehouseId, date, userId)
                                SELECT UUID(), id, 'IN', ?, ?, ?, ? FROM product_serials WHERE serialNumber = ? AND productId = ?
                            `, [id, line.warehouseId || req.body.warehouseId, date, createdBy, cleanSerial, line.productId]);
                        }
                        else if (type === 'INVOICE_SALE') {
                            yield conn.query(`
                                UPDATE product_serials SET status = 'SOLD', salesInvoiceId = ?
                                WHERE productId = ? AND serialNumber = ?
                            `, [id, line.productId, cleanSerial]);
                            yield conn.query(`
                                INSERT INTO serial_transactions (id, serialId, transactionType, referenceId, warehouseId, date, userId)
                                SELECT UUID(), id, 'OUT', ?, warehouseId, ?, ? FROM product_serials WHERE serialNumber = ? AND productId = ?
                            `, [id, date, createdBy, cleanSerial, line.productId]);
                        }
                        else if (type === 'RETURN_SALE') {
                            yield conn.query(`
                                UPDATE product_serials SET status = 'AVAILABLE', salesInvoiceId = NULL
                                WHERE productId = ? AND serialNumber = ?
                            `, [line.productId, cleanSerial]);
                            yield conn.query(`
                                INSERT INTO serial_transactions (id, serialId, transactionType, referenceId, warehouseId, date, userId)
                                SELECT UUID(), id, 'RETURN', ?, warehouseId, ?, ? FROM product_serials WHERE serialNumber = ? AND productId = ?
                            `, [id, date, createdBy, cleanSerial, line.productId]);
                        }
                        else if (type === 'RETURN_PURCHASE') {
                            yield conn.query(`
                                UPDATE product_serials SET status = 'RETURNED_TO_VENDOR'
                                WHERE productId = ? AND serialNumber = ?
                            `, [line.productId, cleanSerial]);
                            yield conn.query(`
                                INSERT INTO serial_transactions (id, serialId, transactionType, referenceId, warehouseId, date, userId)
                                SELECT UUID(), id, 'OUT', ?, warehouseId, ?, ? FROM product_serials WHERE serialNumber = ? AND productId = ?
                            `, [id, date, createdBy, cleanSerial, line.productId]);
                        }
                    }
                    catch (err) {
                        console.error(`âŒ Error processing serial ${cleanSerial} for product ${line.productName}:`, err);
                    }
                }
            }
        }
        // === UPDATE STOCK FOR PURCHASE/RETURN INVOICES ===
        // INVOICE_PURCHASE: Stock IN (+)
        // RETURN_SALE: Stock IN (+)
        // INVOICE_SALE: Stock OUT (-) - Only for non-Van Sales (Van Sales handled separately)
        // RETURN_PURCHASE: Stock OUT (-)
        const stockChangeTypes = {
            'INVOICE_PURCHASE': 1, // +stock (شراء)
            'RETURN_SALE': 1, // +stock (مرتجع مبيعات)
            'INVOICE_SALE': -1, // -stock (بيع) - Skip if Van Sale
            'RETURN_PURCHASE': -1 // -stock (مرتجع مشتريات)
        };
        // Check if this is a Van Sale (handled separately in vehicleController)
        const isVanSale = req.body.isVanSale || (notes && notes.includes('بيع متنقل'));
        // Fetch System Config for Inventory Valuation Method AND Reserve-on-Sale toggle
        let inventoryValuationMethod = 'AVERAGE_COST';
        let reserveOnSale = false;
        {
            const [configRows] = yield conn.query('SELECT config FROM system_config LIMIT 1');
            if (configRows.length > 0 && configRows[0].config) {
                try {
                    const configObj = typeof configRows[0].config === 'string' ? JSON.parse(configRows[0].config) : configRows[0].config;
                    if (configObj.inventoryValuationMethod) {
                        inventoryValuationMethod = configObj.inventoryValuationMethod;
                    }
                    if (((_l = configObj.inventory) === null || _l === void 0 ? void 0 : _l.reserveOnSale) === true) {
                        reserveOnSale = true;
                    }
                }
                catch (e) { }
            }
        }
        // === RESERVE-ON-SALE MODE ===
        // When enabled, INVOICE_SALE creates reservations instead of deducting stock
        if (reserveOnSale && type === 'INVOICE_SALE' && !isVanSale && lines && lines.length > 0) {
            (0, logger_1.logDebug)(`ðŸ“‹ Reserve-on-Sale mode: Creating reservations for invoice ${invoiceNumber}`);
            for (const line of lines) {
                // Multi-Unit: use baseQuantity (qty * conversionFactor) if available
                const rawQty = Number(line.baseQuantity !== null && line.baseQuantity !== undefined ? line.baseQuantity : (Number(line.quantity) * (Number(line.conversionFactor) || 1)));
                const qty = !isNaN(rawQty) ? Number(rawQty.toFixed(5)) : 0;
                const lineBonusQty = Number(line.bonusQty) || 0;
                const totalQty = qty + lineBonusQty;
                const warehouseIdToUse = line.warehouseId || req.body.warehouseId;
                if (totalQty > 0) {
                    // 1. Create stock_reservation record
                    yield conn.query(`
                        INSERT INTO stock_reservations (id, invoiceId, invoiceNumber, productId, productName, warehouseId, quantity, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'RESERVED')
                    `, [(0, crypto_1.randomUUID)(), id, invoiceNumber, line.productId, line.productName || '', warehouseIdToUse || null, totalQty]);
                    // 2. Increment reserved_stock in product_stocks
                    if (warehouseIdToUse) {
                        yield conn.query(`
                            INSERT INTO product_stocks (id, productId, warehouseId, stock, reserved_stock)
                            VALUES (UUID(), ?, ?, 0, ?)
                            ON DUPLICATE KEY UPDATE reserved_stock = ROUND(reserved_stock + ?, 5)
                        `, [line.productId, warehouseIdToUse, totalQty, totalQty]);
                    }
                    (0, logger_1.logDebug)(`  ðŸ“¦ Reserved: ${line.productName} x${totalQty} in warehouse ${warehouseIdToUse || 'N/A'}`);
                }
            }
            // Note: NO stock deduction, NO stock_movements for reserved sales
        }
        // === NORMAL STOCK DEDUCTION MODE ===
        else if (stockChangeTypes[type] !== undefined && lines && lines.length > 0) {
            // Skip stock update for Van Sales (already handled by vehicleController)
            if (type === 'INVOICE_SALE' && isVanSale) {
                (0, logger_1.logDebug)(`â­ï¸ Skipping stock update for Van Sale invoice ${invoiceNumber}`);
            }
            else {
                // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                // PERF v2: Batched stock updates
                // - Non-purchase invoices: bulk UPDATE + bulk UPSERT (2 queries instead of 2N)
                // - Purchase invoices: sequential FOR UPDATE for cost calc, batched warehouse
                // - Stock movements: always batched
                // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                const batchStockMovements = [];
                // Collectors for batched non-purchase stock updates
                const bulkProductStockUpdates = [];
                const bulkWarehouseStockUpdates = [];
                // Pre-fetch product metadata and populate productsCache
                const productIds = lines.map((l) => l.productId).filter(Boolean);
                const productsMeta = {};
                const productsCache = new Map();
                if (productIds.length > 0) {
                    const [metaRows] = yield conn.query('SELECT id, trackInventory, stock, cost FROM products WHERE id IN (?) FOR UPDATE', [productIds]);
                    for (const row of metaRows) {
                        productsMeta[row.id] = row.trackInventory !== 0 && row.trackInventory !== false;
                        productsCache.set(row.id, {
                            stock: Number(row.stock) || 0,
                            cost: Number(row.cost) || 0
                        });
                    }
                    for (const line of lines) {
                        line.trackInventory = (_m = productsMeta[line.productId]) !== null && _m !== void 0 ? _m : true;
                    }
                }
                // PERF: Pre-compute invoiceSubtotal once (was recalculated per line in loop)
                const invoiceSubtotal = (lines || []).reduce((sum, l) => sum + ((Number(l.price) || 0) * (Number(l.quantity) || 0)), 0);
                const invoiceGlobalDiscount = Number(req.body.globalDiscount) || 0;
                // Determine movement type once (same for all lines in an invoice)
                let movementType = 'ADJUSTMENT';
                if (type === 'INVOICE_PURCHASE')
                    movementType = 'PURCHASE';
                else if (type === 'INVOICE_SALE')
                    movementType = 'SALE';
                else if (type === 'RETURN_SALE')
                    movementType = 'RETURN_IN';
                else if (type === 'RETURN_PURCHASE')
                    movementType = 'RETURN_OUT';
                const isPurchase = type === 'INVOICE_PURCHASE' || type === 'RETURN_PURCHASE';
                for (const line of lines) {
                    if (line.trackInventory === false || line.trackInventory === 0)
                        continue; // Skip stock movements for services
                    const rawQty = Number(line.baseQuantity !== null && line.baseQuantity !== undefined ? line.baseQuantity : (Number(line.quantity) * (Number(line.conversionFactor) || 1)));
                    const qty = !isNaN(rawQty) ? Number(rawQty.toFixed(5)) : 0;
                    const lineBonusQty = Number(line.bonusQty) || 0;
                    const totalQty = qty + lineBonusQty;
                    const stockMultiplier = stockChangeTypes[type] || 0;
                    const warehouseIdToUse = line.warehouseId || req.body.warehouseId;
                    // Guard: Block parent products with variants when no variantId is specified
                    // This prevents phantom parent-level stock movements that break variant tracking
                    if (!line.variantId && line.productId) {
                        try {
                            const [variantCheck] = yield conn.query(`SELECT COUNT(*) as cnt FROM product_variants WHERE productId = ? LIMIT 1`, [line.productId]);
                            if (((_o = variantCheck[0]) === null || _o === void 0 ? void 0 : _o.cnt) > 0) {
                                console.warn(`âš ï¸ [Invoice] Blocked parent product "${line.productName}" (${line.productId}) â€” has variants but no variantId specified`);
                                continue; // Skip this line â€” don't create movement against parent
                            }
                        }
                        catch ( /* product_variants table may not exist â€” skip check */_p) { /* product_variants table may not exist â€” skip check */ }
                    }
                    // === DAMAGED RETURN HANDLING (الهالك) ===
                    const isReturn = type === 'RETURN_SALE' || type === 'RETURN_PURCHASE';
                    const isDamaged = isReturn && line.returnCondition === 'DAMAGED';
                    const qtyChange = isDamaged ? 0 : Number((totalQty * stockMultiplier).toFixed(5));
                    if (isPurchase && qty > 0) {
                        // === PURCHASE / RETURN_PURCHASE PATH: Sequential FOR UPDATE needed for average cost ===
                        const cache = productsCache.get(line.productId) || { stock: 0, cost: 0 };
                        const oldStock = cache.stock;
                        const oldCost = cache.cost;
                        // Update global stock
                        if (!isDamaged) {
                            yield conn.query('UPDATE products SET stock = ROUND(stock + ?, 5) WHERE id = ?', [qtyChange, line.productId]);
                        }
                        // Calculate and update cost
                        let newCost = oldCost;
                        const rawPrice = Number(line.price) || 0;
                        const lineDiscount = Number(line.discount) || 0;
                        const lineGross = rawPrice * qty;
                        const lineShareOfGlobalDiscount = invoiceSubtotal > 0 ? (lineGross / invoiceSubtotal) * invoiceGlobalDiscount : 0;
                        const netLineTotal = lineGross - lineDiscount - lineShareOfGlobalDiscount;
                        const unitPurchasePrice = qty > 0 ? Math.max(0, netLineTotal / qty) : rawPrice;
                        (0, logger_1.logDebug)(`ðŸ’° Net cost: ${rawPrice} Ã— ${qty} = ${lineGross}, disc=${lineDiscount}, global=${lineShareOfGlobalDiscount.toFixed(2)}, unit=${unitPurchasePrice.toFixed(2)}`);
                        if (inventoryValuationMethod === 'LAST_PURCHASE') {
                            newCost = unitPurchasePrice;
                        }
                        else {
                            const costMultiplier = type === 'RETURN_PURCHASE' ? -1 : 1;
                            const stockChange = qty * costMultiplier;
                            const newStock = oldStock + stockChange;
                            newCost = newStock <= 0 ? oldCost : ((oldStock * oldCost) + (stockChange * unitPurchasePrice)) / newStock;
                        }
                        newCost = Number(newCost.toFixed(2));
                        yield conn.query('UPDATE products SET cost = ? WHERE id = ?', [newCost, line.productId]);
                        // Update cache
                        productsCache.set(line.productId, { stock: oldStock + (qty * (type === 'RETURN_PURCHASE' ? -1 : 1)), cost: newCost });
                        (0, logger_1.logDebug)(`ðŸ’° Product cost updated: ${line.productName} -> ${newCost} (${inventoryValuationMethod})`);
                    }
                    else {
                        // === NON-PURCHASE PATH: Collect for batch update ===
                        if (!isDamaged && qtyChange !== 0) {
                            bulkProductStockUpdates.push({ productId: line.productId, qtyChange });
                        }
                        else if (isDamaged) {
                            (0, logger_1.logDebug)(`âš ï¸ DAMAGED return: ${line.productName} x${totalQty} NOT added to saleable stock`);
                        }
                    }
                    // Collect warehouse stock updates for batch (both purchase and non-purchase)
                    if (!isDamaged && warehouseIdToUse && qtyChange !== 0) {
                        bulkWarehouseStockUpdates.push({ productId: line.productId, warehouseId: warehouseIdToUse, qtyChange });
                    }
                    // Collect stock movement for batch INSERT
                    let movementNotes = `Invoice #${invoiceNumber} - ${partnerName}`;
                    if (isReturn && line.returnCondition) {
                        const conditionLabel = line.returnCondition === 'DAMAGED' ? 'هالك' : 'سليم';
                        movementNotes += ` (${conditionLabel})`;
                    }
                    batchStockMovements.push([
                        line.productId,
                        warehouseIdToUse || null,
                        isDamaged ? 0 : qtyChange,
                        movementType,
                        type,
                        id,
                        movementNotes,
                        date,
                        line.variantId || null
                    ]);
                }
                // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                // PERF v2: Execute batched stock updates (non-purchase lines)
                // Instead of N individual UPDATEs, use a single CASE statement
                // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                if (bulkProductStockUpdates.length > 0) {
                    // Merge duplicate productIds (same product on multiple lines)
                    const mergedUpdates = new Map();
                    for (const u of bulkProductStockUpdates) {
                        mergedUpdates.set(u.productId, (mergedUpdates.get(u.productId) || 0) + u.qtyChange);
                    }
                    const productIds = Array.from(mergedUpdates.keys());
                    let caseSql = 'UPDATE products SET stock = CASE id ';
                    const caseParams = [];
                    for (const [pid, change] of mergedUpdates) {
                        caseSql += 'WHEN ? THEN ROUND(stock + ?, 5) ';
                        caseParams.push(pid, change);
                    }
                    caseSql += 'ELSE stock END WHERE id IN (?)';
                    caseParams.push(productIds);
                    yield conn.query(caseSql, caseParams);
                    (0, logger_1.logDebug)(`âš¡ Batch product stock update: ${productIds.length} products in 1 query`);
                }
                // PERF v2: Batch warehouse stock updates
                if (bulkWarehouseStockUpdates.length > 0) {
                    // For purchases, warehouse stocks were already handled one-by-one above (via FOR UPDATE)
                    // For non-purchases, batch them here
                    const nonPurchaseWarehouseUpdates = isPurchase ? [] : bulkWarehouseStockUpdates;
                    // For purchases, these are collected but need individual UPSERT due to transaction ordering
                    const purchaseWarehouseUpdates = isPurchase ? bulkWarehouseStockUpdates : [];
                    if (nonPurchaseWarehouseUpdates.length > 0) {
                        for (const u of nonPurchaseWarehouseUpdates) {
                            yield conn.query(`
                                INSERT INTO product_stocks (id, productId, warehouseId, stock)
                                VALUES (UUID(), ?, ?, ?)
                                ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)
                            `, [u.productId, u.warehouseId, u.qtyChange, u.qtyChange]);
                        }
                    }
                    if (purchaseWarehouseUpdates.length > 0) {
                        for (const u of purchaseWarehouseUpdates) {
                            yield conn.query(`
                                INSERT INTO product_stocks (id, productId, warehouseId, stock)
                                VALUES (UUID(), ?, ?, ?)
                                ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)
                            `, [u.productId, u.warehouseId, u.qtyChange, u.qtyChange]);
                        }
                    }
                }
                // PERF: Batch INSERT all stock_movements in one query
                if (batchStockMovements.length > 0) {
                    yield conn.query(`
                        INSERT INTO stock_movements (
                            product_id, warehouse_id, qty_change, movement_type, 
                            reference_type, reference_id, notes, movement_date, variant_id
                        ) VALUES ?
                    `, [batchStockMovements]);
                }
                // === VARIANT STOCK UPDATES ===
                const variantStockMap = new Map();
                const variantWarehouseUpdates = [];
                for (const line of lines) {
                    if (!line.variantId)
                        continue;
                    const isReturn = type === 'RETURN_SALE' || type === 'RETURN_PURCHASE';
                    const isDamaged = isReturn && line.returnCondition === 'DAMAGED';
                    if (isDamaged)
                        continue;
                    const rawQty = Number(line.baseQuantity !== null && line.baseQuantity !== undefined ? line.baseQuantity : (Number(line.quantity) * (Number(line.conversionFactor) || 1)));
                    const totalQty = (!isNaN(rawQty) ? Number(rawQty.toFixed(5)) : 0) + (Number(line.bonusQty) || 0);
                    const stockMultiplier = stockChangeTypes[type] || 0;
                    const qtyChange = Number((totalQty * stockMultiplier).toFixed(5));
                    const warehouseIdToUse = line.warehouseId || req.body.warehouseId;
                    if (qtyChange !== 0) {
                        variantStockMap.set(line.variantId, (variantStockMap.get(line.variantId) || 0) + qtyChange);
                        if (warehouseIdToUse) {
                            variantWarehouseUpdates.push({ variantId: line.variantId, productId: line.productId, warehouseId: warehouseIdToUse, qtyChange });
                        }
                    }
                }
                // Update global product_variants.stock
                if (variantStockMap.size > 0) {
                    const vCases = [];
                    const vParams = [];
                    const variantIds = [];
                    for (const [variantId, change] of variantStockMap) {
                        vCases.push('WHEN id = ? THEN ROUND(COALESCE(stock, 0) + ?, 5)');
                        vParams.push(variantId, change);
                        variantIds.push(variantId);
                    }
                    yield conn.query(`UPDATE product_variants SET stock = CASE ${vCases.join(' ')} ELSE stock END WHERE id IN (?)`, [...vParams, variantIds]).catch((e) => (0, logger_1.logDebug)(`⚠️ Variant stock update note: ${e.message}`));
                }
                // Update per-warehouse product_variant_stocks
                for (const u of variantWarehouseUpdates) {
                    yield conn.query(`INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock)
                         VALUES (UUID(), ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)`, [u.variantId, u.productId, u.warehouseId, u.qtyChange, u.qtyChange]).catch((e) => (0, logger_1.logDebug)(`⚠️ Variant warehouse stock note: ${e.message}`));
                }
            }
        }
        // === AUTO-POST REVENUE/COGS JOURNAL ENTRY ===
        const mainPaymentMethodForReceipt = req.body.paymentMethod || 'CASH';
        const isCashInvoice = mainPaymentMethodForReceipt === 'CASH';
        yield (0, exports.syncRevenueCogsJournal)(conn, id, invoiceNumber, type, date, partnerName, total, lines, createdBy, !!reserveOnSale, isCashInvoice, Number(globalDiscount) || 0, (0, branchFilter_1.resolveBranchIdForWrite)(req));
        const user = req.body.user || 'System';
        yield (0, paymentGeneration_1.generateInvoicePayments)(conn, {
            invoiceId: id,
            invoiceNumber,
            type,
            date,
            partnerId: sanitizedPartnerId,
            partnerName: resolvedPartnerName || '',
            total,
            paymentCollected,
            isCashInvoice,
            createdBy,
            resolvedBranchId,
            partialPaymentMethod: req.body.partialPaymentMethod,
            partialPaymentBankId: req.body.partialPaymentBankId,
            bankAccountId: req.body.bankAccountId,
            currencyCode: req.body.currencyCode,
            exchangeRate: req.body.exchangeRate,
            denominations: req.body.denominations,
            bankTransfers: req.body.bankTransfers,
            warehouseId: sanitizedWarehouseId,
            req,
            paymentMethod: req.body.paymentMethod,
            paymentBreakdown: req.body.paymentBreakdown
        });
        yield (0, auditController_1.logAction)(createdBy || 'System', 'INVOICE', 'CREATE', `Created ${type} Invoice #${invoiceNumber}`, `Partner: ${partnerName}, Amount: ${total}, Payment: ${paymentMethod}`);
        // =====================================================
        // === STANDALONE RECEIPT/PAYMENT JOURNAL ENTRIES ===
        // =====================================================
        if (type === 'RECEIPT' || type === 'PAYMENT') {
            const standaloneTotal = Number(total) || 0;
            const pmMethod = req.body.paymentMethod || 'CASH';
            const pmBankAccountId = req.body.bankAccountId || null;
            const cCode = req.body.currencyCode || 'USD';
            const exRate = Number(req.body.exchangeRate) || 1;
            console.log(`💰 Creating standalone ${type} #${invoiceNumber} GL entries. Amount: ${standaloneTotal}`);
            const absTotal = Math.abs(standaloneTotal);
            const isReversed = standaloneTotal < 0;
            const effectiveIsReceipt = isReversed ? (type !== 'RECEIPT') : (type === 'RECEIPT');
            yield conn.query(`INSERT INTO account_transactions (id, date, type, partnerId, partnerName, debit, credit, description, invoiceId, createdBy) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), date, type, partnerId, partnerName, effectiveIsReceipt ? 0 : absTotal, effectiveIsReceipt ? absTotal : 0, `${type === 'RECEIPT' ? 'مقبوض' : 'دفع'} (مستقل) ${invoiceNumber}`, id, createdBy]);
            if (absTotal > 0) {
                const journalId = (0, crypto_1.randomUUID)();
                const methodLabel = pmMethod === 'CASH' ? 'نقدي' : pmMethod === 'BANK' ? 'تحويل بنكي' : 'شيك';
                const paymentSources = req.body.paymentSources || [];
                const isMultiSource = paymentSources.length > 1;
                const journalMethodLabel = isMultiSource ? 'متعدد المصادر' : methodLabel;
                const reversedLabel = isReversed ? ' (عكسي)' : '';
                yield (0, paymentGeneration_1.createPaymentJournal)({
                    conn, journalId, date, description: `${type === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} #${invoiceNumber} - ${partnerName} (${journalMethodLabel})${reversedLabel}`,
                    referenceId: id, createdBy, amount: absTotal, paymentType: effectiveIsReceipt ? 'RECEIPT' : 'PAYMENT',
                    paymentMethod: pmMethod || 'CASH', bankAccountId: pmBankAccountId, currencyCode: cCode, exchangeRate: exRate,
                    denominations: req.body.denominations, branchId: resolvedBranchId, req, partnerId, explicitAccountId: req.body.accountId || null
                });
                if (isReversed) {
                    console.log(`🔄 Reversed ${type} #${invoiceNumber}: negative amount ${standaloneTotal} → journal uses abs(${absTotal}) with flipped debit/credit`);
                }
            }
        }
        // =====================================================
        // AUTO-UPDATE ACCOUNT BALANCES FROM JOURNAL ENTRIES
        // This is the PERMANENT FIX for treasury balance mismatches
        // Collect all account IDs that were affected by payment journal entries
        // =====================================================
        const affectedAccountIds = [];
        // Note: Journal lines were inserted in the payment processing above
        // We need to recalculate affected accounts. For invoices with payments,
        // the affected accounts are typically: Cash (101), Bank (102), AR (104), AP (201)
        // This is handled when journals are synced via syncController.
        // For direct invoice creation with journal entries, we add the accounts.
        if (paymentCollected > 0 || type === 'PAYMENT' || type === 'RECEIPT') {
            // FIX: Use explicit referenceId-based lookup instead of fragile createdBy+date query.
            // The old query matched ALL journals by the same user on the same date,
            // which caused incorrect balance updates under concurrent load.
            // Using referenceId (= invoice ID) is deterministic and race-condition-proof.
            const [journalAccountRows] = yield conn.query(`SELECT DISTINCT jl.accountId FROM journal_lines jl
                 JOIN journal_entries je ON jl.journalId = je.id
                 WHERE je.referenceId = ? OR je.referenceId = ?`, [id, invoiceNumber]);
            for (const row of journalAccountRows) {
                if (row.accountId)
                    affectedAccountIds.push(row.accountId);
            }
        }
        if (affectedAccountIds.length > 0) {
            const balanceResult = yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, affectedAccountIds);
            if (balanceResult.updatedCount > 0) {
                console.log(`âœ… [createInvoice] Auto-updated ${balanceResult.updatedCount} account balances`);
            }
        }
        // === UPDATE EMPLOYEE ADVANCES TABLE FOR VOUCHER CATEGORIES ===
        // When a Payment Voucher (سند صرف) has category 'employee_advance', insert a new advance record
        // When a Receipt Voucher (سند قبض) has category 'employee_repay', apply FIFO repayment
        if (voucherCategory === 'employee_advance' && type === 'PAYMENT' && originalPartnerId && total > 0) {
            try {
                const advanceId = (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO employee_advances (id, employeeId, type, amount, reason, issueDate, monthlyDeduction, totalPaid, remainingAmount, status)
                     VALUES (?, ?, 'ADVANCE', ?, ?, ?, 0, 0, ?, 'ACTIVE')`, [advanceId, originalPartnerId, total, notes || `سلفة من سند صرف #${invoiceNumber}`, date, total]);
                console.log(`ðŸ’° [HR] Created employee advance: ${advanceId} for employee ${originalPartnerId}, amount: ${total}`);
            }
            catch (advErr) {
                console.error('âš ï¸ Error creating employee advance from voucher:', advErr.message);
            }
        }
        else if (voucherCategory === 'employee_repay' && type === 'RECEIPT' && originalPartnerId && total > 0) {
            try {
                // FIFO: Find oldest active advances for this employee and apply repayment
                const [activeAdvances] = yield conn.query(`SELECT id, amount, totalPaid, remainingAmount FROM employee_advances
                     WHERE employeeId = ? AND status = 'ACTIVE' AND remainingAmount > 0
                     ORDER BY issueDate ASC, createdAt ASC`, [originalPartnerId]);
                let remaining = total;
                for (const adv of activeAdvances) {
                    if (remaining <= 0)
                        break;
                    const canApply = Math.min(remaining, Number(adv.remainingAmount));
                    const newTotalPaid = Number(adv.totalPaid) + canApply;
                    const newRemaining = Number(adv.remainingAmount) - canApply;
                    yield conn.query(`UPDATE employee_advances SET totalPaid = ?, remainingAmount = ?, status = ? WHERE id = ?`, [newTotalPaid, newRemaining, newRemaining <= 0 ? 'COMPLETED' : 'ACTIVE', adv.id]);
                    console.log(`ðŸ’° [HR] Advance ${adv.id}: repaid ${canApply}, remaining: ${newRemaining}`);
                    remaining -= canApply;
                }
                if (remaining > 0) {
                    console.warn(`âš ï¸ [HR] Employee ${originalPartnerId} repaid ${total} but only ${total - remaining} could be allocated to active advances`);
                }
            }
            catch (repayErr) {
                console.error('âš ï¸ Error processing advance repayment from voucher:', repayErr.message);
            }
        }
        // === LOYALTY: Record Earn / Clawback (non-fatal but within transaction context) ===
        if (originalPartnerId) {
            try {
                if (type === 'INVOICE_SALE') {
                    yield (0, loyaltyController_1.recordLoyaltyEarn)(conn, originalPartnerId, id, total, user, lines);
                }
                else if (type === 'RETURN_SALE') {
                    yield (0, loyaltyController_1.recordLoyaltyClawback)(conn, originalPartnerId, id, total, user);
                }
            }
            catch (loyaltyErr) {
                console.error('âš ï¸ [Loyalty] Error in generic invoice loyalty integration:', loyaltyErr);
            }
        }
        // Standalone RECEIPT / PAYMENT allocations
        if (['RECEIPT', 'PAYMENT'].includes(type) && status !== 'VOID' && status !== 'DRAFT' && (referenceInvoiceId || req.body.sourceInvoiceId)) {
            const targetInvoiceId = referenceInvoiceId || req.body.sourceInvoiceId;
            yield conn.query(`INSERT INTO payment_allocations (id, paymentId, invoiceId, amount) VALUES (?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), id, targetInvoiceId, total]);
        }
        // Check memberships
        yield (0, memberships_1.checkAndActivateMembership)(id, conn);
        if (type === 'RECEIPT' && req.body.sourceInvoiceId) {
            yield (0, memberships_1.checkAndActivateMembership)(req.body.sourceInvoiceId, conn);
        }
        else if (type === 'RECEIPT' && req.body.referenceInvoiceId) {
            yield (0, memberships_1.checkAndActivateMembership)(req.body.referenceInvoiceId, conn);
        }
        // === POS CASH MOVEMENTS SYNC LOGIC (For new creations) ===
        if (posShiftId && paymentMethod === 'CASH' && status !== 'VOID' && status !== 'DRAFT') {
            const movementId = (0, crypto_1.randomUUID)();
            let movementType = 'SALE';
            if (type === 'INVOICE_SALE' || type === 'SALE_INVOICE') {
                movementType = 'SALE';
            }
            else if (type === 'RETURN_SALE' || type === 'SALE_RETURN') {
                movementType = 'REFUND';
            }
            else if (type === 'INVOICE_PURCHASE' || type === 'PURCHASE_INVOICE') {
                movementType = 'PURCHASE';
            }
            else if (type === 'RETURN_PURCHASE' || type === 'PURCHASE_RETURN') {
                movementType = 'DEPOSIT';
            }
            yield conn.query(`INSERT INTO pos_cash_movements (id, shiftId, type, amount, paymentMethod, referenceId, referenceType, description, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?, 'INVOICE', ?, NOW())`, [
                movementId,
                posShiftId,
                movementType,
                total,
                paymentMethod,
                id,
                `فاتورة ${invoiceNumber} - ${partnerName || ''}`
            ]);
            // Recalculate shift totals
            try {
                const { recalculateShiftTotals } = require('./posController');
                yield recalculateShiftTotals(conn, posShiftId, createdBy);
            }
            catch (e) {
                console.warn('⚠️ [createInvoice] Recalculate shift totals failed:', e.message);
            }
        }
        yield conn.commit();
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoice', updatedBy: user });
        res.status(201).json(Object.assign(Object.assign({}, req.body), { id, number: invoiceNumber }));
        // â”€â”€ WhatsApp Notification (fire-and-forget, never blocks response) â”€â”€
        // TODO: triggerInvoiceWhatsApp not yet implemented â€” uncomment when WhatsApp integration is ready
        // if (status === 'confirmed' && type === 'SALE') {
        //     triggerInvoiceWhatsApp(id, invoiceNumber, sanitizedPartnerId, resolvedPartnerName, total).catch(() => {});
        // }
    }
    catch (error) {
        yield conn.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'createInvoice');
    }
    finally {
        conn.release();
    }
    // Note: To fully fix atomicity in createInvoice, we need to restructure the whole function to commit at the VERY end.
    // I will do a separate pass for that if requested, as it involves moving a large block of code.
    // For now, I'm fixing the regex at line 319.
});
exports.createInvoice = createInvoice;
// Get the last price a customer paid for a specific product
// آخر سعر اشترى به العميل هذا المنتج
const getCustomerLastProductPrice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { partnerId, productId } = req.params;
        if (!partnerId || !productId) {
            return res.status(400).json({ message: 'Partner ID and Product ID are required' });
        }
        const conn = yield (0, db_1.getConnection)();
        // Query to get the last price for this product sold to this customer
        // We look at INVOICE_SALE type only (when the customer bought from us)
        const [rows] = yield conn.query(`
            SELECT 
                il.price,
                il.quantity,
                il.discount,
                il.total,
                il.unitName,
                i.id as invoiceId,
                i.date as invoiceDate
            FROM invoice_lines il
            INNER JOIN invoices i ON il.invoiceId = i.id
            WHERE i.partnerId = ?
              AND il.productId = ?
              AND i.type = 'INVOICE_SALE'
              AND i.status != 'VOID'
            ORDER BY i.date DESC, i.id DESC
            LIMIT 1
        `, [partnerId, productId]);
        conn.release();
        if (rows.length === 0) {
            return res.json({
                found: false,
                message: 'لا يوجد سجل مبيعات سابق لهذا العميل مع هذا المنتج'
            });
        }
        const lastPurchase = rows[0];
        res.json({
            found: true,
            price: lastPurchase.price,
            quantity: lastPurchase.quantity,
            discount: lastPurchase.discount,
            total: lastPurchase.total,
            unitName: lastPurchase.unitName,
            invoiceId: lastPurchase.invoiceId,
            invoiceDate: lastPurchase.invoiceDate
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getCustomerLastProductPrice');
    }
});
exports.getCustomerLastProductPrice = getCustomerLastProductPrice;
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PERF: Batch version of getCustomerLastProductPrice
// Instead of N individual API calls (one per line item), the frontend
// sends all productIds at once and gets all last prices in a single query.
// For a 15-line invoice, this reduces 15 HTTP round-trips â†’ 1.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const getCustomerLastProductPrices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { partnerId } = req.params;
        const { productIds } = req.body;
        if (!partnerId || !productIds || !Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({ message: 'Partner ID and productIds array are required' });
        }
        // Cap at 100 products to prevent abuse
        const ids = productIds.slice(0, 100);
        const conn = yield (0, db_1.getConnection)();
        // For each productId, get the most recent sale price to this partner
        const [rows] = yield conn.query(`
            SELECT 
                il.productId,
                il.price,
                il.quantity,
                il.discount,
                il.total,
                il.unitName,
                i.id as invoiceId,
                i.date as invoiceDate
            FROM invoice_lines il
            INNER JOIN invoices i ON il.invoiceId = i.id
            INNER JOIN (
                SELECT il2.productId, MAX(CONCAT(i2.date, i2.id)) as maxKey
                FROM invoice_lines il2
                INNER JOIN invoices i2 ON il2.invoiceId = i2.id
                WHERE i2.partnerId = ?
                  AND il2.productId IN (?)
                  AND i2.type = 'INVOICE_SALE'
                  AND i2.status != 'VOID'
                GROUP BY il2.productId
            ) latest ON il.productId = latest.productId
            WHERE i.partnerId = ?
              AND i.type = 'INVOICE_SALE'
              AND i.status != 'VOID'
              AND CONCAT(i.date, i.id) = latest.maxKey
        `, [partnerId, ids, partnerId]);
        conn.release();
        // Build a map: productId â†’ last price data
        const priceMap = {};
        for (const row of rows) {
            priceMap[row.productId] = {
                found: true,
                price: row.price,
                quantity: row.quantity,
                discount: row.discount,
                total: row.total,
                unitName: row.unitName,
                invoiceId: row.invoiceId,
                invoiceDate: row.invoiceDate
            };
        }
        res.json(priceMap);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getCustomerLastProductPrices');
    }
});
exports.getCustomerLastProductPrices = getCustomerLastProductPrices;
// Normalize type aliases to match database stored values
const normalizeInvoiceType = (type) => {
    const map = {
        'SALE': 'INVOICE_SALE',
        'PURCHASE': 'INVOICE_PURCHASE',
        'SALE_RETURN': 'RETURN_SALE',
        'PURCHASE_RETURN': 'RETURN_PURCHASE',
        'SALE_INVOICE': 'INVOICE_SALE',
        'PURCHASE_INVOICE': 'INVOICE_PURCHASE'
    };
    return map[type.toUpperCase()] || type;
};
exports.normalizeInvoiceType = normalizeInvoiceType;
// GET /api/invoices/outstanding/:partnerId - Get outstanding (unpaid) invoices for a partner
// Used by Receipt Voucher to link payments to specific invoices (ربط المقبوضات بالفواتير)
// Optional query param: ?type=INVOICE_SALE or ?type=INVOICE_PURCHASE
const getOutstandingInvoices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { partnerId } = req.params;
        const rawType = req.query.type || 'INVOICE_SALE';
        const invoiceType = (0, exports.normalizeInvoiceType)(rawType);
        if (!partnerId) {
            return res.status(400).json({ message: 'Partner ID is required' });
        }
        // Security check: Dynamic permission based on requested type
        const authReq = req;
        const { user } = authReq;
        const requiredPermission = invoiceType.includes('PURCHASE') ? 'purchase.view' : 'sales.view';
        if (user && !(0, dataFiltering_1.hasPermission)(user, requiredPermission)) {
            return res.status(403).json({
                error: 'PERMISSION_DENIED',
                message: `You do not have permission to view outstanding status for this invoice type`,
                requiredPermission
            });
        }
        const conn = yield (0, db_1.getConnection)();
        const conditions = [
            'i.partnerId = ?',
            'i.type = ?',
            `i.status NOT IN ('DRAFT', 'VOID')`,
            `(i.total - COALESCE(pa_sum.allocatedAmount, 0)) > 0.01`
        ];
        const queryParams = [partnerId, invoiceType];
        // Apply user data isolation and salesman isolation
        if (authReq.userFilterOptions && authReq.systemConfig) {
            const salesmanFilter = (0, dataFiltering_1.buildSalesmanFilterClause)({
                userRole: authReq.userFilterOptions.userRole,
                salesmanId: authReq.userFilterOptions.salesmanId,
                systemConfig: authReq.systemConfig
            }, 'invoices', 'i');
            if (salesmanFilter.clause) {
                conditions.push(salesmanFilter.clause);
                queryParams.push(...salesmanFilter.params);
            }
            const userFilter = (0, dataFiltering_1.buildParameterizedFilter)(authReq.userFilterOptions);
            if (userFilter.clause) {
                conditions.push(`i.${userFilter.clause}`);
                queryParams.push(...userFilter.params);
            }
        }
        // Apply branch isolation
        (0, branchFilter_1.appendBranchFilter)(conditions, queryParams, authReq, 'i');
        // Get all sale invoices for this partner with outstanding balance
        // Outstanding = total - sum(payment_allocations)
        // Note: We only use payment_allocations, not paidAmount, to avoid double-counting
        const [rows] = yield conn.query(`
            SELECT 
                i.id,
                i.number,
                i.date,
                i.total,
                COALESCE(pa_sum.allocatedAmount, 0) as allocatedAmount,
                (i.total - COALESCE(pa_sum.allocatedAmount, 0)) as remainingAmount
            FROM invoices i
            LEFT JOIN (
                SELECT invoiceId, SUM(amount) as allocatedAmount
                FROM payment_allocations
                GROUP BY invoiceId
            ) pa_sum ON pa_sum.invoiceId = i.id
            WHERE ${conditions.join(' AND ')}
            ORDER BY i.date ASC, i.number ASC
        `, queryParams);
        conn.release();
        const invoices = rows.map(row => ({
            id: row.id,
            number: row.number,
            date: row.date,
            total: Number(row.total),
            paidAmount: Number(row.allocatedAmount), // allocations are the canonical source
            allocatedAmount: Number(row.allocatedAmount),
            remainingAmount: Number(row.remainingAmount)
        }));
        res.json(invoices);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getOutstandingInvoices');
    }
});
exports.getOutstandingInvoices = getOutstandingInvoices;
/**
 * PUT /api/invoices/:id - Update invoice with payment handling
 */
const updateInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const conn = yield (0, db_1.getConnection)();
    try {
        const invoiceId = req.params.id;
        // Invalidate dedup cache on mutation
        invalidateInvoiceCache(invoiceId);
        (0, logger_1.logDebug)('ðŸš€ [updateInvoice] Called for ID:', invoiceId);
        // PERF: Removed JSON.stringify(req.body) â€” was serializing ~100KB+ synchronously
        (0, logger_1.logDebug)('ðŸ¦ [updateInvoice] bankTransfers:', ((_a = req.body.bankTransfers) === null || _a === void 0 ? void 0 : _a.length) || 0);
        (0, logger_1.logDebug)('ðŸ’° [updateInvoice] partialPaymentMethod:', req.body.partialPaymentMethod);
        const authReq = req;
        const user = authReq.user;
        const createdBy = (user === null || user === void 0 ? void 0 : user.username) || (user === null || user === void 0 ? void 0 : user.name) || req.body.user || 'System';
        // Get existing invoice
        const [existing] = yield conn.query('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
        if (existing.length === 0) {
            conn.release();
            return res.status(404).json({ error: 'Invoice not found' });
        }
        const existingInvoice = existing[0];
        invalidateInvoiceCache(invoiceId, existingInvoice.number);
        const invoiceNumber = existingInvoice.number || req.body.number || invoiceId; // Fallback to ID if number is null
        let { date: rawDate, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, dueDate, taxAmount, whtAmount, shippingFee, globalDiscount, lines, salesmanId, number } = req.body;
        // === DISCOUNT PERMISSION CHECK ===
        const isSales = ['INVOICE_SALE', 'RETURN_SALE', 'SALE_INVOICE'].includes(type || existingInvoice.type);
        const hasDiscount = (Number(globalDiscount) > 0 || (lines === null || lines === void 0 ? void 0 : lines.some((l) => Number(l.discount) > 0)));
        if (hasDiscount && user) {
            const discountPermission = isSales ? 'sales.discount' : 'purchase.discount';
            if (!(0, dataFiltering_1.hasPermission)(user, discountPermission)) {
                conn.release();
                return res.status(403).json({
                    error: 'PERMISSION_DENIED',
                    message: `You do not have permission to apply discounts on ${isSales ? 'sales' : 'purchase'} transactions`,
                    requiredPermission: discountPermission
                });
            }
        }
        // TIMEZONE FIX: Pad date-only strings to prevent midnight UTC â†’ previous day in Egypt
        const date = (0, dateEngine_1.toMySQLDateTime)(rawDate) || rawDate;
        // === FISCAL YEAR GUARD: Block if old or new date is in closed year or locked period ===
        if (existingInvoice.date) {
            const fyCheckOld = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)(existingInvoice.date);
            if (!fyCheckOld.allowed) {
                conn.release();
                return res.status(403).json({
                    code: fyCheckOld.errorCode || 'FISCAL_YEAR_CLOSED',
                    message: `Old date: ${fyCheckOld.error}`,
                    error: fyCheckOld.error
                });
            }
        }
        if (date && date !== existingInvoice.date) {
            const fyCheckNew = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)(date);
            if (!fyCheckNew.allowed) {
                conn.release();
                return res.status(403).json({
                    code: fyCheckNew.errorCode || 'FISCAL_YEAR_CLOSED',
                    message: `New date: ${fyCheckNew.error}`,
                    error: fyCheckNew.error
                });
            }
        }
        // === SYSTEM POLICY VALIDATION (PRE-TRANSACTION) ===
        const authReqPolicy = req;
        const currentUserRolePolicy = authReqPolicy.user ? authReqPolicy.user.role : undefined;
        if (authReqPolicy.systemConfig && (currentUserRolePolicy === null || currentUserRolePolicy === void 0 ? void 0 : currentUserRolePolicy.toUpperCase()) !== 'MASTER_ADMIN') {
            const policyContext = {
                type: type || existingInvoice.type,
                date: date || existingInvoice.date,
                total: total !== undefined ? total : existingInvoice.total,
                partnerId: partnerId || existingInvoice.partnerId,
                notes: notes || existingInvoice.notes,
                warehouseId: req.body.warehouseId || existingInvoice.warehouseId,
                createdBy: existingInvoice.createdBy,
                currentUser: createdBy,
                currentUserRole: currentUserRolePolicy,
                // Credit back old quantities during stock validation â€” the update
                // will reverse the original stock before re-applying the new lines.
                existingInvoiceId: existingInvoice.status === 'POSTED' ? invoiceId : undefined,
                lines: lines === null || lines === void 0 ? void 0 : lines.map((i) => ({
                    productId: i.productId,
                    quantity: i.quantity,
                    // Same fallback as create path: line.price IS the purchase cost
                    cost: i.cost || i.price || 0,
                    unitId: i.unitId,
                    baseQuantity: i.baseQuantity
                }))
            };
            const policyResult = yield (0, policyEnforcement_1.validateTransactionFull)(policyContext, authReqPolicy.systemConfig, conn);
            if (!policyResult.valid) {
                conn.release();
                return res.status(403).json({ message: policyResult.error, errorCode: policyResult.errorCode });
            }
        }
        yield conn.beginTransaction();
        // Release reservations if status updates to VOID or DRAFT
        if (status === 'VOID' || status === 'DRAFT') {
            try {
                const { releaseInvoiceReservations } = require('../utils/invoiceCascadeDelete');
                yield releaseInvoiceReservations(conn, invoiceId);
            }
            catch (err) {
                (0, logger_1.logDebug)(`âš ï¸ Failed to release reservations dynamically: ${err.message}`);
            }
        }
        // === SERVER-SIDE TOTAL VALIDATION ===
        // Skip validation for RECEIPT/PAYMENT which don't have line items
        if (lines && lines.length > 0 && !['RECEIPT', 'PAYMENT'].includes(type)) {
            const validation = (0, errorHandler_1.validateInvoiceTotal)(lines, total, taxAmount || 0, globalDiscount || 0, whtAmount || 0, shippingFee || 0);
            if (!validation.valid) {
                conn.release();
                return res.status(400).json({
                    code: 'TOTAL_MISMATCH',
                    message: validation.message,
                    calculated: validation.calculated,
                    provided: total
                });
            }
            (0, logger_1.logDebug)(`âœ… Invoice update total validated: ${validation.calculated}`);
            // BUG FIX: Use the authoritative server-calculated total for all subsequent logic
            total = validation.calculated;
        }
        // Sanitize dates - convert empty strings to null
        const sanitizedDueDate = dueDate && dueDate !== '' ? dueDate : null;
        // Sanitize warehouseId
        const sanitizedWarehouseId = req.body.warehouseId && typeof req.body.warehouseId === 'string'
            ? req.body.warehouseId.substring(0, 36)
            : null;
        // Update invoice (including paidAmount for inline payments)
        const updateBankAccountId = req.body.partialPaymentBankId || req.body.bankAccountId || null;
        const updateBankName = req.body.partialPaymentMethod || req.body.bankName || null;
        const updatePaidAmount = req.body.paidAmount || req.body.paymentCollected || null;
        const resolvedBranchId = (0, branchFilter_1.resolveBranchIdForWrite)(req, req.body.branchId);
        // Check if user has an open POS shift and link this cash transaction to it
        let posShiftId = req.body.posShiftId || existingInvoice.posShiftId || null;
        if (!posShiftId && paymentMethod === 'CASH') {
            try {
                const userId = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || '';
                const [openShifts] = yield conn.query("SELECT id FROM pos_shifts WHERE userId = ? AND status = 'OPEN' LIMIT 1", [userId]);
                if (openShifts.length > 0) {
                    posShiftId = openShifts[0].id;
                }
                else if (userId) {
                    // Fallback: Find the most recent shift for this user active around the invoice date
                    const [recentShifts] = yield conn.query("SELECT id FROM pos_shifts WHERE userId = ? AND openedAt <= ? ORDER BY openedAt DESC LIMIT 1", [userId, date]);
                    if (recentShifts.length > 0) {
                        posShiftId = recentShifts[0].id;
                    }
                }
            }
            catch (err) {
                console.warn(`⚠️ [updateInvoice] Could not resolve posShiftId:`, err);
            }
        }
        const [updateResult] = yield conn.query(`UPDATE invoices SET
                date = ?, type = ?, partnerId = ?, partnerName = ?,
                total = ?, status = ?, paymentMethod = ?, posted = ?,
                notes = ?, dueDate = ?, taxAmount = ?, whtAmount = ?,
                shippingFee = ?, globalDiscount = ?, globalDiscountType = ?, globalDiscountValue = ?, warehouseId = ?,
                bankAccountId = ?, bankName = ?, salesmanId = ?, priceListId = ?, paidAmount = ?,
                paymentBreakdown = ?, bankTransfers = ?,
                currencyCode = ?, exchangeRate = ?, foreignTotal = ?,
                bankTransferReference = ?,
                referenceInvoiceId = ?,
                branchId = ?,
                posShiftId = ?,
                paymentSources = ?
            WHERE id = ?`, [
            date, type, partnerId, partnerName, total, status, paymentMethod, posted,
            notes, sanitizedDueDate, taxAmount, whtAmount, shippingFee, globalDiscount, req.body.globalDiscountType || 'FIXED', req.body.globalDiscountValue || 0,
            sanitizedWarehouseId,
            updateBankAccountId,
            updateBankName,
            salesmanId,
            req.body.priceListId || null,
            updatePaidAmount,
            req.body.paymentBreakdown ? JSON.stringify(req.body.paymentBreakdown) : null,
            req.body.bankTransfers ? JSON.stringify(req.body.bankTransfers) : null,
            req.body.currencyCode || 'EGP', req.body.exchangeRate || 1, req.body.foreignTotal || null,
            req.body.bankTransferReference || null,
            req.body.referenceInvoiceId || null,
            resolvedBranchId,
            posShiftId,
            req.body.paymentSources ? JSON.stringify(req.body.paymentSources) : null,
            invoiceId
        ]);
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // CHEQUES: Sync transactionCheques for RECEIPT/PAYMENT edits
        // Delete existing cheques for this transaction, then re-insert.
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const transactionCheques = req.body.transactionCheques;
        if (transactionCheques && Array.isArray(transactionCheques)) {
            // Remove old cheques for this transaction
            yield conn.query('DELETE FROM cheques WHERE transactionId = ?', [invoiceId]);
            // Insert updated cheques
            for (const c of transactionCheques) {
                const chequeId = c.id || (0, crypto_1.randomUUID)();
                const chequeType = (type === 'RECEIPT') ? 'RECEIVABLE' : 'PAYABLE';
                yield conn.query(`INSERT INTO cheques (id, number, bankName, amount, dueDate, status, type, partnerId, partnerName, description, createdDate, bankAccountId, transactionId, createdBy)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    chequeId,
                    c.number || '',
                    c.bankName || '',
                    Number(c.amount) || 0,
                    c.dueDate || null,
                    c.status || 'PENDING',
                    c.type === 'ENDORSE' ? 'ENDORSED' : chequeType,
                    partnerId || null,
                    partnerName || null,
                    notes || null,
                    date,
                    c.bankAccountId || null,
                    invoiceId,
                    createdBy
                ]);
                // If endorsing an existing cheque, update its status
                if (c.type === 'ENDORSE' && c.chequeId) {
                    yield conn.query(`UPDATE cheques SET status = 'ENDORSED' WHERE id = ?`, [c.chequeId]);
                }
            }
            if (transactionCheques.length > 0) {
                (0, logger_1.logDebug)(`[updateInvoice] Synced ${transactionCheques.length} cheques for invoice ${invoiceId}`);
            }
        }
        // Fetch System Config for Inventory Valuation Method
        let inventoryValuationMethod = 'AVERAGE_COST';
        if (type === 'INVOICE_PURCHASE') {
            const [configRows] = yield conn.query('SELECT config FROM system_config LIMIT 1');
            if (configRows.length > 0 && configRows[0].config) {
                try {
                    const configObj = typeof configRows[0].config === 'string' ? JSON.parse(configRows[0].config) : configRows[0].config;
                    if (configObj.inventoryValuationMethod) {
                        inventoryValuationMethod = configObj.inventoryValuationMethod;
                    }
                }
                catch (e) { }
            }
        }
        // === STOCK REVERSAL: Fetch old lines BEFORE deleting them ===
        // We need the old line data to reverse stock (products.stock + product_stocks)
        const stockChangeTypes = {
            'INVOICE_PURCHASE': 1, // +stock
            'RETURN_SALE': 1, // +stock
            'INVOICE_SALE': -1, // -stock
            'RETURN_PURCHASE': -1 // -stock
        };
        const stockMultiplierForType = stockChangeTypes[type];
        const oldStockMultiplier = stockChangeTypes[existingInvoice.type];
        const oldWasPosted = existingInvoice.status === 'POSTED' || existingInvoice.status === 'PAID' || existingInvoice.status === 'PARTIALLY_PAID' || existingInvoice.posted === 1 || existingInvoice.posted === true;
        const newIsPosted = status === 'POSTED' || status === 'PAID' || status === 'PARTIALLY_PAID' || posted === 1 || posted === true;
        const hasStockChange = oldStockMultiplier !== undefined || stockMultiplierForType !== undefined;
        let oldLines = [];
        if (hasStockChange) {
            const [oldLineRows] = yield conn.query('SELECT productId, quantity, baseQuantity, conversionFactor, bonusQty, warehouseId, returnCondition, variantId FROM invoice_lines WHERE invoiceId = ?', [invoiceId]);
            oldLines = oldLineRows;
            // Pre-fetch trackInventory for old lines
            const oldProductIds = oldLines.map((l) => l.productId).filter(Boolean);
            if (oldProductIds.length > 0) {
                const [metaRows] = yield conn.query('SELECT id, trackInventory FROM products WHERE id IN (?)', [oldProductIds]);
                const productsMeta = {};
                for (const row of metaRows) {
                    productsMeta[row.id] = row.trackInventory !== 0 && row.trackInventory !== false;
                }
                for (const line of oldLines) {
                    line.trackInventory = (_c = productsMeta[line.productId]) !== null && _c !== void 0 ? _c : true;
                }
            }
            // REVERSE old stock changes — ONLY if old invoice was POSTED and old type was stock-changing
            if (oldWasPosted && oldStockMultiplier !== undefined) {
                const wasOldReturnType = existingInvoice.type === 'RETURN_SALE' || existingInvoice.type === 'RETURN_PURCHASE';
                for (const oldLine of oldLines) {
                    if (oldLine.trackInventory === false || oldLine.trackInventory === 0)
                        continue; // Skip reversal for services
                    // Skip DAMAGED returns — they had 0 stock change, so nothing to reverse
                    const wasOldDamaged = wasOldReturnType && oldLine.returnCondition === 'DAMAGED';
                    if (wasOldDamaged) {
                        (0, logger_1.logDebug)(`ðŸ”„ [updateInvoice] Skipping reversal for DAMAGED item: ${oldLine.productId}`);
                        continue;
                    }
                    const oldQty = Number(oldLine.baseQuantity !== null && oldLine.baseQuantity !== undefined ? oldLine.baseQuantity : oldLine.quantity) || 0;
                    const oldBonusQty = Number(oldLine.bonusQty) || 0;
                    const oldTotalQty = oldQty + oldBonusQty;
                    const oldChange = Number((oldTotalQty * oldStockMultiplier).toFixed(5));
                    const reverseChange = -oldChange; // Undo the original change
                    const oldWarehouseId = oldLine.warehouseId || existingInvoice.warehouseId;
                    // Reverse global product stock
                    yield conn.query('UPDATE products SET stock = ROUND(stock + ?, 5) WHERE id = ?', [reverseChange, oldLine.productId]);
                    // Reverse warehouse-level stock
                    if (oldWarehouseId) {
                        yield conn.query('UPDATE product_stocks SET stock = ROUND(stock + ?, 5) WHERE productId = ? AND warehouseId = ?', [reverseChange, oldLine.productId, oldWarehouseId]);
                    }
                    (0, logger_1.logDebug)(`ðŸ”„ [updateInvoice] Reversed old stock: ${oldLine.productId} ${reverseChange > 0 ? '+' : ''}${reverseChange}`);
                    // Reverse variant stock if applicable
                    if (oldLine.variantId && !wasOldDamaged) {
                        yield conn.query(`UPDATE product_variants SET stock = ROUND(COALESCE(stock, 0) + ?, 5) WHERE id = ?`, [reverseChange, oldLine.variantId]).catch(() => { });
                        if (oldWarehouseId) {
                            yield conn.query(`UPDATE product_variant_stocks SET stock = ROUND(stock + ?, 5) WHERE variantId = ? AND warehouseId = ?`, [reverseChange, oldLine.variantId, oldWarehouseId]).catch(() => { });
                        }
                    }
                }
            }
        }
        // Delete old lines (unconditionally, to insert new ones)
        yield conn.query('DELETE FROM invoice_lines WHERE invoiceId = ?', [invoiceId]);
        const productIds = lines.map((l) => l.productId).filter(Boolean);
        const productsMeta = {};
        const productsCache = new Map();
        if (productIds.length > 0) {
            const [metaRows] = yield conn.query('SELECT id, trackInventory, stock, cost FROM products WHERE id IN (?) FOR UPDATE', [productIds]);
            for (const row of metaRows) {
                productsMeta[row.id] = row.trackInventory !== 0 && row.trackInventory !== false;
                productsCache.set(row.id, {
                    stock: Number(row.stock) || 0,
                    cost: Number(row.cost) || 0
                });
            }
            for (const line of lines) {
                line.trackInventory = (_d = productsMeta[line.productId]) !== null && _d !== void 0 ? _d : true;
            }
        }
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PERF: Batch INSERT all invoice_lines in one query
        // (same optimization applied to createInvoice earlier)
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const batchLineValues = [];
        // PERF: Pre-compute invoiceSubtotal once (was recalculated per line)
        const invoiceSubtotal = (lines || []).reduce((sum, l) => sum + ((Number(l.price) || 0) * (Number(l.quantity) || 0)), 0);
        const invoiceGlobalDiscount = Number(globalDiscount) || 0;
        for (const line of lines) {
            const rawQty = Number(line.quantity);
            const rawPrice = Number(line.price);
            const rawCost = Number(line.cost);
            const rawDisc = Number(line.discount);
            const rawTotal = Number(line.total);
            const qty = !isNaN(rawQty) ? Number(rawQty.toFixed(5)) : 0;
            const price = !isNaN(rawPrice) ? Number(rawPrice.toFixed(2)) : 0;
            const cost = !isNaN(rawCost) ? Number(rawCost.toFixed(2)) : 0;
            const disc = !isNaN(rawDisc) ? Number(rawDisc.toFixed(2)) : 0;
            let total = !isNaN(rawTotal) ? Number(rawTotal.toFixed(2)) : 0;
            if (!total && qty && price) {
                total = (qty * price) - disc;
            }
            const sanitizedLineWarehouseId = line.warehouseId && typeof line.warehouseId === 'string'
                ? line.warehouseId.substring(0, 36)
                : null;
            const lineBonusQty = Number(line.bonusQty) || 0;
            const gradeValue = line.grade || null;
            const returnConditionValue = (type === 'RETURN_SALE' || type === 'RETURN_PURCHASE') ? (line.returnCondition || 'GOOD') : null;
            // Multi-Unit Support: save unit info with the line
            const lineUnitId = line.unitId || null;
            const lineUnitName = line.unitName || null;
            const lineConversionFactor = Number(line.conversionFactor) || 1;
            const lineBaseQuantity = Number(line.baseQuantity) || (qty * lineConversionFactor);
            batchLineValues.push([
                invoiceId, line.productId, line.productName, qty, price, cost, disc, total,
                sanitizedLineWarehouseId, lineBonusQty, gradeValue, returnConditionValue,
                line.priceListId || null, line.variantId || null,
                lineUnitId, lineUnitName, lineConversionFactor, lineBaseQuantity,
                line.hasWarranty ? 1 : 0,
                line.inBranchInstallation ? 1 : 0,
                line.warrantyMonths || 0
            ]);
            if (line.trackInventory === false || line.trackInventory === 0)
                continue; // Skip stock updates for services
            // Update product cost if purchase or return purchase (must remain sequential due to FOR UPDATE row locks)
            if ((type === 'INVOICE_PURCHASE' || type === 'RETURN_PURCHASE') && qty > 0) {
                const cache = productsCache.get(line.productId) || { stock: 0, cost: 0 };
                const oldStock = cache.stock;
                const oldCost = cache.cost;
                let newCost = oldCost;
                const lineGross = (Number(line.price) || 0) * qty;
                const lineDiscount = Number(line.discount) || 0;
                const lineShareOfGlobalDiscount = invoiceSubtotal > 0 ? (lineGross / invoiceSubtotal) * invoiceGlobalDiscount : 0;
                const netLineTotal = lineGross - lineDiscount - lineShareOfGlobalDiscount;
                const unitPurchasePrice = qty > 0 ? Math.max(0, netLineTotal / qty) : (Number(line.price) || 0);
                if (inventoryValuationMethod === 'LAST_PURCHASE') {
                    newCost = unitPurchasePrice;
                }
                else {
                    const costMultiplier = type === 'RETURN_PURCHASE' ? -1 : 1;
                    const stockChange = qty * costMultiplier;
                    const newStock = oldStock + stockChange;
                    newCost = newStock <= 0 ? oldCost : ((oldStock * oldCost) + (stockChange * unitPurchasePrice)) / newStock;
                }
                newCost = Number(newCost.toFixed(2));
                yield conn.query('UPDATE products SET cost = ? WHERE id = ?', [newCost, line.productId]);
                productsCache.set(line.productId, { stock: oldStock + (qty * (type === 'RETURN_PURCHASE' ? -1 : 1)), cost: newCost });
                (0, logger_1.logDebug)(`ðŸ’° Product cost updated (Edit): ${line.productName} -> ${newCost} (${inventoryValuationMethod})`);
            }
        }
        // PERF: Batch INSERT all lines in one query
        if (batchLineValues.length > 0) {
            try {
                yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, warehouseId, bonusQty, grade, returnCondition, priceListId, variantId, unitId, unitName, conversionFactor, baseQuantity, hasWarranty, inBranchInstallation, warrantyMonths)
                         VALUES ?`, [batchLineValues]);
            }
            catch (ilErr) {
                // Fallback: insert without warehouseId/bonusQty if columns don't exist
                (0, logger_1.logDebug)('âš ï¸ Batch insert failed, falling back to minimal columns:', ilErr.message);
                const minimalValues = batchLineValues.map(v => [v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[12]]);
                yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, priceListId)
                         VALUES ?`, [minimalValues]);
            }
        }
        // === APPLY NEW STOCK + SYNC STOCK MOVEMENTS ===
        if (stockMultiplierForType !== undefined) {
            yield conn.query('DELETE FROM stock_movements WHERE reference_id = ?', [invoiceId]);
            if (!newIsPosted) {
                (0, logger_1.logDebug)(`â„¹ï¸ [updateInvoice] New status is DRAFT â€” skipping stock application`);
            }
            // Apply new stock changes and recreate stock movements â€” ONLY if POSTED
            if (newIsPosted) {
                // PERF: Batch stock_movements INSERT at the end
                const batchStockMovements = [];
                // Determine movement type once
                let movementType = 'ADJUSTMENT';
                if (type === 'INVOICE_PURCHASE')
                    movementType = 'PURCHASE';
                else if (type === 'INVOICE_SALE')
                    movementType = 'SALE';
                else if (type === 'RETURN_SALE')
                    movementType = 'RETURN_IN';
                else if (type === 'RETURN_PURCHASE')
                    movementType = 'RETURN_OUT';
                for (const line of lines) {
                    const rawQty = Number(line.baseQuantity !== null && line.baseQuantity !== undefined ? line.baseQuantity : (Number(line.quantity) * (Number(line.conversionFactor) || 1)));
                    const qty = !isNaN(rawQty) ? Number(rawQty.toFixed(5)) : 0;
                    const movBonusQty = Number(line.bonusQty) || 0;
                    const totalQtyForMovement = qty + movBonusQty;
                    const lineWarehouseId = line.warehouseId && typeof line.warehouseId === 'string' ? line.warehouseId.substring(0, 36) : null;
                    const warehouseIdToUse = lineWarehouseId || sanitizedWarehouseId;
                    const isReturn = type === 'RETURN_SALE' || type === 'RETURN_PURCHASE';
                    const isDamaged = isReturn && line.returnCondition === 'DAMAGED';
                    const qtyChange = isDamaged ? 0 : Number((totalQtyForMovement * stockMultiplierForType).toFixed(5));
                    // Apply stock changes (must remain sequential â€” per-product UPDATE)
                    if (!isDamaged) {
                        yield conn.query('UPDATE products SET stock = ROUND(stock + ?, 5) WHERE id = ?', [qtyChange, line.productId]);
                    }
                    if (!isDamaged && warehouseIdToUse) {
                        yield conn.query(`
                                INSERT INTO product_stocks (id, productId, warehouseId, stock)
                                VALUES (UUID(), ?, ?, ?)
                                ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)
                            `, [line.productId, warehouseIdToUse, qtyChange, qtyChange]);
                    }
                    // Collect movement for batch INSERT
                    let movementNotes = `Invoice #${invoiceNumber} - ${partnerName}`;
                    if (isReturn && line.returnCondition) {
                        const conditionLabel = line.returnCondition === 'DAMAGED' ? 'هالك' : 'سليم';
                        movementNotes += ` (${conditionLabel})`;
                    }
                    batchStockMovements.push([
                        line.productId,
                        warehouseIdToUse || null,
                        qtyChange,
                        movementType,
                        type,
                        invoiceId,
                        movementNotes,
                        date,
                        line.variantId || null
                    ]);
                }
                // PERF: Batch INSERT all stock_movements in one query
                if (batchStockMovements.length > 0) {
                    yield conn.query(`
                            INSERT INTO stock_movements (
                                product_id, warehouse_id, qty_change, movement_type, 
                                reference_type, reference_id, notes, movement_date, variant_id
                            ) VALUES ?
                        `, [batchStockMovements]);
                }
                // === VARIANT STOCK UPDATES (updateInvoice) ===
                const variantStockMap = new Map();
                const variantWarehouseUpdates = [];
                for (const line of lines) {
                    if (!line.variantId)
                        continue;
                    const isReturn = type === 'RETURN_SALE' || type === 'RETURN_PURCHASE';
                    const isDamaged = isReturn && line.returnCondition === 'DAMAGED';
                    if (isDamaged)
                        continue;
                    const rawQty = Number(line.baseQuantity !== null && line.baseQuantity !== undefined ? line.baseQuantity : (Number(line.quantity) * (Number(line.conversionFactor) || 1)));
                    const totalQty = (!isNaN(rawQty) ? Number(rawQty.toFixed(5)) : 0) + (Number(line.bonusQty) || 0);
                    const qtyChange = Number((totalQty * stockMultiplierForType).toFixed(5));
                    const lineWarehouseId = line.warehouseId && typeof line.warehouseId === 'string' ? line.warehouseId.substring(0, 36) : null;
                    const warehouseIdToUse = lineWarehouseId || sanitizedWarehouseId;
                    if (qtyChange !== 0) {
                        variantStockMap.set(line.variantId, (variantStockMap.get(line.variantId) || 0) + qtyChange);
                        if (warehouseIdToUse) {
                            variantWarehouseUpdates.push({ variantId: line.variantId, productId: line.productId, warehouseId: warehouseIdToUse, qtyChange });
                        }
                    }
                }
                if (variantStockMap.size > 0) {
                    const vCases = [];
                    const vParams = [];
                    const variantIds = [];
                    for (const [variantId, change] of variantStockMap) {
                        vCases.push('WHEN id = ? THEN ROUND(COALESCE(stock, 0) + ?, 5)');
                        vParams.push(variantId, change);
                        variantIds.push(variantId);
                    }
                    yield conn.query(`UPDATE product_variants SET stock = CASE ${vCases.join(' ')} ELSE stock END WHERE id IN (?)`, [...vParams, variantIds]).catch((e) => (0, logger_1.logDebug)(`âš ï¸ Variant stock update note: ${e.message}`));
                }
                for (const u of variantWarehouseUpdates) {
                    yield conn.query(`INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock)
                             VALUES (UUID(), ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)`, [u.variantId, u.productId, u.warehouseId, u.qtyChange, u.qtyChange]).catch((e) => (0, logger_1.logDebug)(`âš ï¸ Variant warehouse stock note: ${e.message}`));
                }
            } // end if (newIsPosted)
        }
        // === PAYMENT WITH INVOICE UPDATE LOGIC ===
        // For CASH payments (نقدي), auto-sync payment amount to invoice total
        // For CREDIT (آجل) or partial payments, use the explicit paymentCollected value
        let paymentCollected = Number(req.body.paymentCollected || 0);
        // Auto-sync for CASH: if paymentMethod is CASH and not explicitly آجل, payment = total
        const isCashPayment = paymentMethod === 'CASH' && !req.body.isCredit;
        const isCashInvoice = isCashPayment;
        const invoiceTotal = Number(total || 0);
        // Define flag to check if financial details or payment details changed
        const inlinePaymentOrFinancialChanged = Number(total) !== Number(existingInvoice.total) ||
            rawDate !== existingInvoice.date ||
            partnerId !== existingInvoice.partnerId ||
            paymentMethod !== existingInvoice.paymentMethod ||
            req.body.bankAccountId !== existingInvoice.bankAccountId ||
            status !== existingInvoice.status ||
            Number(req.body.paymentCollected || 0) !== Number(existingInvoice.paidAmount || 0) ||
            JSON.stringify(req.body.bankTransfers || []) !== (typeof existingInvoice.bankTransfers === 'string' ? existingInvoice.bankTransfers : JSON.stringify(existingInvoice.bankTransfers || []));
        if (isCashPayment && partnerId) {
            if (inlinePaymentOrFinancialChanged) {
                // Find and delete any existing orphaned receipt for this CASH invoice
                const [orphanedPayments] = yield conn.query(`SELECT id, number FROM invoices 
                     WHERE (sourceInvoiceId = ? OR referenceInvoiceId = ?)
                     AND (type = 'RECEIPT' OR type = 'PAYMENT')
                     ORDER BY id DESC LIMIT 1`, [invoiceId, invoiceId]);
                const orphanedPayment = orphanedPayments[0];
                if (orphanedPayment) {
                    (0, logger_1.logDebug)(`ðŸ—‘ï¸ CASH invoice: Deleting orphaned receipt ${orphanedPayment.number}`);
                    yield conn.query('DELETE FROM journal_lines WHERE journalId IN (SELECT id FROM journal_entries WHERE referenceId = ?)', [orphanedPayment.number]);
                    yield conn.query('DELETE FROM journal_entries WHERE referenceId = ?', [orphanedPayment.number]);
                    yield conn.query('DELETE FROM account_transactions WHERE invoiceId = ?', [orphanedPayment.id]);
                    yield conn.query('DELETE FROM invoices WHERE id = ?', [orphanedPayment.id]);
                    (0, logger_1.logDebug)(`âœ… Orphaned receipt deleted for CASH invoice`);
                }
                // FIX: Sync the CASH invoice's treasury journal entry.
                // Clean up any old/stale cash entries, then call createPaymentJournal
                const cashJournalTotal = invoiceTotal;
                if (cashJournalTotal > 0) {
                    let descPrefix = 'فاتورة مبيعات نقدي';
                    if (type === 'RETURN_SALE')
                        descPrefix = 'مرتجع مبيعات نقدي';
                    else if (type === 'RETURN_PURCHASE')
                        descPrefix = 'مرتجع مشتريات نقدي';
                    else if (type === 'INVOICE_PURCHASE')
                        descPrefix = 'فاتورة مشتريات نقدي';
                    const cashPaymentType = (type === 'INVOICE_SALE' || type === 'RETURN_PURCHASE') ? 'RECEIPT' : 'PAYMENT';
                    // Clean up old cash entries
                    yield conn.query(`DELETE FROM journal_lines WHERE journalId IN (
                            SELECT id FROM journal_entries 
                            WHERE (referenceId = ? OR referenceId = ?)
                            AND (description LIKE '%مبيعات نقدي%' OR description LIKE '%مشتريات نقدي%' OR description LIKE '%مرتجع%نقدي%'
                                 OR description LIKE '%متحصلات نقدية%' OR description LIKE '%مدفوعات نقدية%')
                        )`, [invoiceId, invoiceNumber]);
                    yield conn.query(`DELETE FROM journal_entries 
                         WHERE (referenceId = ? OR referenceId = ?)
                         AND (description LIKE '%مبيعات نقدي%' OR description LIKE '%مشتريات نقدي%' OR description LIKE '%مرتجع%نقدي%'
                              OR description LIKE '%متحصلات نقدية%' OR description LIKE '%مدفوعات نقدية%')`, [invoiceId, invoiceNumber]);
                    const newJournalId = (0, crypto_1.randomUUID)();
                    yield (0, paymentGeneration_1.createPaymentJournal)({
                        conn,
                        journalId: newJournalId,
                        date,
                        description: `${descPrefix} #${invoiceNumber} - ${partnerName}`,
                        referenceId: invoiceId,
                        createdBy,
                        amount: cashJournalTotal,
                        paymentType: cashPaymentType,
                        paymentMethod: 'CASH',
                        bankAccountId: req.body.bankAccountId,
                        currencyCode: req.body.currencyCode,
                        exchangeRate: req.body.exchangeRate,
                        denominations: req.body.denominations,
                        branchId: resolvedBranchId,
                        req,
                        partnerId
                    });
                    (0, logger_1.logDebug)(`ðŸ“’ [updateInvoice] Cash treasury journal synced: ${newJournalId} for invoice ${invoiceNumber} (${cashJournalTotal})`);
                }
            }
            // Skip receipt creation/update for CASH invoices
            paymentCollected = 0;
        }
        else if (isCashPayment && paymentCollected !== invoiceTotal) {
            (0, logger_1.logDebug)(`ðŸ’µ CASH payment auto-sync: ${paymentCollected} â†’ ${invoiceTotal}`);
            paymentCollected = invoiceTotal;
        }
        if (partnerId && !isCashPayment) {
            if (inlinePaymentOrFinancialChanged) {
                // 1. Delete ALL existing inline payments cleanly
                yield (0, paymentGeneration_1.deleteInvoicePayments)(conn, invoiceId);
                // 2. Re-run Payment Generation using helper
                yield (0, paymentGeneration_1.generateInvoicePayments)(conn, {
                    invoiceId,
                    invoiceNumber,
                    type,
                    date,
                    partnerId,
                    partnerName,
                    total,
                    paymentCollected,
                    isCashInvoice,
                    createdBy,
                    resolvedBranchId,
                    partialPaymentMethod: req.body.partialPaymentMethod,
                    partialPaymentBankId: req.body.partialPaymentBankId,
                    bankAccountId: req.body.bankAccountId,
                    currencyCode: req.body.currencyCode,
                    exchangeRate: req.body.exchangeRate,
                    denominations: req.body.denominations,
                    bankTransfers: req.body.bankTransfers,
                    warehouseId: sanitizedWarehouseId,
                    req,
                    paymentMethod: req.body.paymentMethod,
                    paymentBreakdown: req.body.paymentBreakdown
                });
            }
        }
        // === STANDALONE RECEIPT/PAYMENT JOURNAL ENTRIES UPDATE ===
        // The inline payment logic above skips standalone receipts (where lines are empty and they ARE the payment itself)
        if (type === 'RECEIPT' || type === 'PAYMENT') {
            const standaloneTotal = Number(total) || 0;
            const hasStandaloneFinancialChanges = standaloneTotal !== Number(existingInvoice.total) ||
                rawDate !== existingInvoice.date ||
                partnerId !== existingInvoice.partnerId ||
                paymentMethod !== existingInvoice.paymentMethod ||
                req.body.bankAccountId !== existingInvoice.bankAccountId ||
                req.body.accountId !== existingInvoice.accountId ||
                status !== existingInvoice.status ||
                req.body.referenceInvoiceId !== existingInvoice.referenceInvoiceId ||
                req.body.sourceInvoiceId !== existingInvoice.sourceInvoiceId;
            if (!hasStandaloneFinancialChanges) {
                (0, logger_1.logDebug)(`â„¹ï¸ Metadata-only update for standalone payment/receipt #${invoiceNumber}`);
                yield conn.query(`UPDATE account_transactions SET date = ?, description = ? WHERE invoiceId = ?`, [date, `${type === 'RECEIPT' ? 'مقبوض' : 'دفع'} (مستقل) ${invoiceNumber}`, invoiceId]);
                const methodLabel = paymentMethod === 'CASH' ? 'نقدي' : paymentMethod === 'BANK' ? 'تحويل بنكي' : 'شيك';
                yield conn.query(`UPDATE journal_entries SET date = ?, description = ? WHERE referenceId = ?`, [date, `${type === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} #${invoiceNumber} - ${partnerName} (${methodLabel})`, invoiceId]);
            }
            else {
                (0, logger_1.logDebug)(`ðŸ’° Standalone payment/receipt financial details changed. Recreating entries.`);
                // 1. Delete old account_transactions
                yield conn.query('DELETE FROM account_transactions WHERE invoiceId = ?', [invoiceId]);
                // 2. Delete old journal_entries and journal_lines
                yield conn.query('DELETE FROM journal_lines WHERE journalId IN (SELECT id FROM journal_entries WHERE referenceId = ?)', [invoiceId]);
                yield conn.query('DELETE FROM journal_entries WHERE referenceId = ?', [invoiceId]);
                // 2b. Delete old payment allocations
                yield conn.query('DELETE FROM payment_allocations WHERE paymentId = ?', [invoiceId]);
                const absTotal = Math.abs(standaloneTotal);
                const isReversed = standaloneTotal < 0;
                const effectiveIsReceipt = isReversed ? (type !== 'RECEIPT') : (type === 'RECEIPT');
                // 3. Re-create account_transactions
                yield conn.query(`INSERT INTO account_transactions (
                        id, date, type, partnerId, partnerName, debit, credit, description, invoiceId, createdBy
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    (0, crypto_1.randomUUID)(), date, type, partnerId, partnerName,
                    effectiveIsReceipt ? 0 : absTotal,
                    effectiveIsReceipt ? absTotal : 0,
                    `${type === 'RECEIPT' ? 'مقبوض' : 'دفع'} (مستقل) ${invoiceNumber}`,
                    invoiceId, createdBy
                ]);
                // 4. Re-create journal entries
                if (absTotal > 0) {
                    const journalId = (0, crypto_1.randomUUID)();
                    const methodLabel = paymentMethod === 'CASH' ? 'نقدي' : paymentMethod === 'BANK' ? 'تحويل بنكي' : 'شيك';
                    const reversedLabel = isReversed ? ' (عكسي)' : '';
                    yield (0, paymentGeneration_1.createPaymentJournal)({
                        conn,
                        journalId,
                        date,
                        description: `${type === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} #${invoiceNumber} - ${partnerName} (${methodLabel})${reversedLabel}`,
                        referenceId: invoiceId,
                        createdBy,
                        amount: absTotal,
                        paymentType: effectiveIsReceipt ? 'RECEIPT' : 'PAYMENT',
                        paymentMethod: paymentMethod || 'CASH',
                        bankAccountId: updateBankAccountId,
                        currencyCode: req.body.currencyCode,
                        exchangeRate: req.body.exchangeRate,
                        denominations: req.body.denominations,
                        branchId: resolvedBranchId,
                        req,
                        partnerId,
                        explicitAccountId: req.body.accountId || null
                    });
                    // 4b. Re-create payment allocation
                    if (status !== 'VOID' && status !== 'DRAFT' && (req.body.referenceInvoiceId || req.body.sourceInvoiceId)) {
                        const targetInvoiceId = req.body.referenceInvoiceId || req.body.sourceInvoiceId;
                        yield conn.query(`INSERT INTO payment_allocations (id, paymentId, invoiceId, amount) VALUES (?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), invoiceId, targetInvoiceId, absTotal]);
                    }
                    if (isReversed) {
                        console.log(`ðŸ”„ Reversed ${type} #${invoiceNumber}: negative amount ${standaloneTotal} â†’ journal uses abs(${absTotal}) with flipped debit/credit`);
                    }
                }
            }
        }
        // =====================================================
        // AUTO-UPDATE ACCOUNT BALANCES FROM JOURNAL ENTRIES
        // Recalculate affected accounts to prevent drifts.
        // =====================================================
        const affectedAccountIds = [];
        if (paymentCollected > 0 || type === 'PAYMENT' || type === 'RECEIPT') {
            const [journalAccountRows] = yield conn.query(`SELECT DISTINCT jl.accountId FROM journal_lines jl
                 JOIN journal_entries je ON jl.journalId = je.id
                 WHERE je.referenceId = ? OR je.referenceId = ?`, [invoiceId, invoiceNumber]);
            for (const row of journalAccountRows) {
                if (row.accountId)
                    affectedAccountIds.push(row.accountId);
            }
        }
        if (affectedAccountIds.length > 0) {
            const balanceResult = yield (0, accountBalanceUtils_1.updateAccountBalancesFromJournal)(conn, affectedAccountIds);
            if (balanceResult.updatedCount > 0) {
                console.log(`âœ… [updateInvoice] Auto-updated ${balanceResult.updatedCount} account balances`);
            }
        }
        // === AUTO-POST REVENUE/COGS JOURNAL ENTRY (For updates) ===
        // Must be done before commit to ensure transaction atomicity.
        yield (0, exports.syncRevenueCogsJournal)(conn, invoiceId, invoiceNumber, type, date, partnerName, total, lines, createdBy, false, isCashPayment, Number(req.body.globalDiscount) || 0, (0, branchFilter_1.resolveBranchIdForWrite)(req));
        // Check memberships
        yield (0, memberships_1.checkAndActivateMembership)(invoiceId, conn);
        if (type === 'RECEIPT' && req.body.sourceInvoiceId) {
            yield (0, memberships_1.checkAndActivateMembership)(req.body.sourceInvoiceId, conn);
        }
        else if (type === 'RECEIPT' && req.body.referenceInvoiceId) {
            yield (0, memberships_1.checkAndActivateMembership)(req.body.referenceInvoiceId, conn);
        }
        // === POS CASH MOVEMENTS SYNC LOGIC ===
        const shiftIdToUse = existingInvoice.posShiftId || req.body.posShiftId || posShiftId;
        if (shiftIdToUse) {
            // Delete existing movements
            yield conn.query('DELETE FROM pos_cash_movements WHERE referenceId = ?', [invoiceId]);
            // Insert updated movement if eligible
            if (paymentMethod === 'CASH' && status !== 'VOID' && status !== 'DRAFT') {
                const movementId = (0, crypto_1.randomUUID)();
                let movementType = 'SALE';
                if (type === 'INVOICE_SALE' || type === 'SALE_INVOICE') {
                    movementType = 'SALE';
                }
                else if (type === 'RETURN_SALE' || type === 'SALE_RETURN') {
                    movementType = 'REFUND';
                }
                else if (type === 'INVOICE_PURCHASE' || type === 'PURCHASE_INVOICE') {
                    movementType = 'PURCHASE';
                }
                else if (type === 'RETURN_PURCHASE' || type === 'PURCHASE_RETURN') {
                    movementType = 'DEPOSIT';
                }
                yield conn.query(`INSERT INTO pos_cash_movements (id, shiftId, type, amount, paymentMethod, referenceId, referenceType, description, createdAt)
                     VALUES (?, ?, ?, ?, ?, ?, 'INVOICE', ?, NOW())`, [
                    movementId,
                    shiftIdToUse,
                    movementType,
                    total,
                    paymentMethod,
                    invoiceId,
                    `تعديل فاتورة ${invoiceNumber} - ${partnerName}`
                ]);
            }
            // Recalculate shift totals
            try {
                const { recalculateShiftTotals } = require('./posController');
                yield recalculateShiftTotals(conn, shiftIdToUse, createdBy);
            }
            catch (posShiftErr) {
                console.warn(`⚠️ [updateInvoice] Warning recalculating shift totals for shift ${shiftIdToUse}: ${posShiftErr.message}`);
            }
        }
        yield conn.commit();
        // Log audit trail
        yield (0, auditController_1.logAction)(createdBy, 'INVOICE', 'UPDATE', `Updated ${type} Invoice #${invoiceNumber}`, `Partner: ${partnerName}, Amount: ${total}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoice', updatedBy: createdBy });
        res.json(Object.assign(Object.assign({}, req.body), { id: invoiceId, number: invoiceNumber, message: 'Invoice updated successfully' }));
    }
    catch (error) {
        yield conn.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'updateInvoice');
    }
    finally {
        conn.release();
    }
});
exports.updateInvoice = updateInvoice;
// Get reservation status for an invoice
const getInvoiceReservations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query('SELECT * FROM stock_reservations WHERE invoiceId = ? ORDER BY createdAt', [id]);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getInvoiceReservations');
    }
});
exports.getInvoiceReservations = getInvoiceReservations;
// Batch: Get dispatch status for multiple invoices (for list view badges)
const getInvoiceDispatchStatuses = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        // Get all sale invoices with reservations
        const [rows] = yield conn.query(`
            SELECT 
                invoiceId,
                COUNT(*) as totalReservations,
                SUM(CASE WHEN status = 'DISPATCHED' THEN 1 ELSE 0 END) as dispatched,
                SUM(CASE WHEN status = 'RESERVED' THEN 1 ELSE 0 END) as reserved,
                SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled
            FROM stock_reservations
            GROUP BY invoiceId
        `);
        conn.release();
        const statusMap = {};
        for (const row of rows) {
            if (row.reserved > 0 && row.dispatched === 0) {
                statusMap[row.invoiceId] = 'PENDING'; // محجوز - في انتظار الصرف
            }
            else if (row.reserved > 0 && row.dispatched > 0) {
                statusMap[row.invoiceId] = 'PARTIAL'; // صرف جزئي
            }
            else if (row.reserved === 0 && row.dispatched > 0) {
                statusMap[row.invoiceId] = 'DISPATCHED'; // تم الصرف
            }
            else {
                statusMap[row.invoiceId] = 'CANCELLED';
            }
        }
        res.json(statusMap);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getInvoiceDispatchStatuses');
    }
});
exports.getInvoiceDispatchStatuses = getInvoiceDispatchStatuses;
// Fetch list of invoices that have pending reservations (for Stock Permit)
const getPendingReservations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        // Get unique invoices that have at least one RESERVED item
        const [rows] = yield conn.query(`
            SELECT DISTINCT 
                sr.invoiceId, 
                sr.invoiceNumber,
                inv.partnerName as partnerName,
                inv.date
            FROM stock_reservations sr
            LEFT JOIN invoices inv ON sr.invoiceId = inv.id
            WHERE sr.status = 'RESERVED'
            ORDER BY inv.date DESC, sr.createdAt DESC
        `);
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getPendingReservations');
    }
});
exports.getPendingReservations = getPendingReservations;
// Helper: Get permission for invoice type
exports.INVOICE_PERMISSIONS = {
    // Sales
    'SALE': { create: 'sales.create', edit: 'sales.edit', delete: 'sales.delete' },
    'INVOICE_SALE': { create: 'sales.create', edit: 'sales.edit', delete: 'sales.delete' },
    'SALE_RETURN': { create: 'sales.create', edit: 'sales.edit', delete: 'sales.delete' },
    'SALE_INVOICE': { create: 'sales.create', edit: 'sales.edit', delete: 'sales.delete' },
    'RETURN_SALE': { create: 'sales.create', edit: 'sales.edit', delete: 'sales.delete' },
    // Purchases
    'PURCHASE': { create: 'purchase.create', edit: 'purchase.edit', delete: 'purchase.delete' },
    'INVOICE_PURCHASE': { create: 'purchase.create', edit: 'purchase.edit', delete: 'purchase.delete' },
    'PURCHASE_RETURN': { create: 'purchase.create', edit: 'purchase.edit', delete: 'purchase.delete' },
    'PURCHASE_INVOICE': { create: 'purchase.create', edit: 'purchase.edit', delete: 'purchase.delete' },
    'RETURN_PURCHASE': { create: 'purchase.create', edit: 'purchase.edit', delete: 'purchase.delete' },
    // Treasury (delete uses treasury.manage)
    'RECEIPT': { create: 'treasury.receipts.create', edit: 'treasury.receipts.edit', delete: 'treasury.manage' },
    'PAYMENT': { create: 'treasury.payments.create', edit: 'treasury.payments.edit', delete: 'treasury.manage' },
    // Quotations
    'QUOTATION': { create: 'sales.quotations.create', edit: 'sales.quotations.edit', delete: 'sales.quotations.delete' },
};
const getInvoicePermission = (type, action) => {
    var _a;
    return ((_a = exports.INVOICE_PERMISSIONS[type]) === null || _a === void 0 ? void 0 : _a[action]) || null;
};
exports.getInvoicePermission = getInvoicePermission;
/**
 * DELETE /api/invoices/:id - Delete invoice with cascade (deletes linked سند قبض/صرف)
 */
const deleteInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const authReq = req;
        const { user, userFilterOptions } = authReq;
        const invoiceId = req.params.id;
        if (!user || !userFilterOptions) {
            conn.release();
            return res.status(401).json({ error: 'Unauthorized' });
        }
        yield conn.beginTransaction();
        // Check ownership and lock invoice row
        const [existing] = yield conn.query('SELECT id, createdBy, type, date, number, partnerName, total, posted, branchId FROM invoices WHERE id = ? LIMIT 1 FOR UPDATE', [invoiceId]);
        const existingInvoice = existing[0];
        if (!existingInvoice) {
            yield conn.rollback();
            conn.release();
            return res.status(404).json({ error: 'Invoice not found' });
        }
        // Enforce closed fiscal year date check
        const fyCheck = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)(existingInvoice.date);
        if (!fyCheck.allowed) {
            yield conn.rollback();
            conn.release();
            return res.status(403).json({
                error: fyCheck.errorCode || 'FISCAL_YEAR_CLOSED',
                message: fyCheck.error
            });
        }
        // Enforce lock date validation
        const lockCheck = yield (0, lockDateValidator_1.validateDateAgainstLockDates)(conn, existingInvoice.date, 'GENERAL');
        if (lockCheck.isLocked) {
            yield conn.rollback();
            conn.release();
            return res.status(403).json({
                error: 'PERIOD_LOCKED',
                lockType: lockCheck.lockType,
                lockDate: lockCheck.lockDate,
                message: lockCheck.message
            });
        }
        // Enforce branch isolation
        const role = (user.role || '').toUpperCase();
        const isAdmin = role === 'MASTER_ADMIN' || role === 'ADMIN' || role === 'GENERAL_MANAGER';
        if (((_a = authReq.branchContext) === null || _a === void 0 ? void 0 : _a.branchId) && !isAdmin) {
            if (existingInvoice.branchId && existingInvoice.branchId !== authReq.branchContext.branchId) {
                yield conn.rollback();
                conn.release();
                return res.status(403).json({
                    error: 'BRANCH_ACCESS_DENIED',
                    message: 'لا يمكنك تعديل فواتير الفروع الأخرى'
                });
            }
        }
        // Check if user can delete
        const isOwner = existingInvoice.createdBy === userFilterOptions.userName;
        const canDelete = isOwner || userFilterOptions.canModifyOthers;
        if (!canDelete) {
            yield conn.rollback();
            conn.release();
            return res.status(403).json({
                error: 'PERMISSION_DENIED',
                message: 'You can only delete your own invoices',
                owner: existingInvoice.createdBy
            });
        }
        // Permission Check (Granular)
        const permissionId = (0, exports.getInvoicePermission)(existingInvoice.type, 'delete');
        if (permissionId && !(0, dataFiltering_1.hasPermission)(user, permissionId)) {
            yield conn.rollback();
            conn.release();
            return res.status(403).json({
                error: 'PERMISSION_DENIED',
                message: `You do not have permission to delete this transaction`,
                requiredPermission: permissionId
            });
        }
        // Get the user name for deletion
        const deletedBy = userFilterOptions.userName || user.name || user.username || 'System';
        // === POLICY ENFORCEMENT: Check posted invoice delete ===
        if (authReq.systemConfig) {
            const deleteCheck = (0, policyEnforcement_1.validateDeletePostedInvoice)(existingInvoice.posted, authReq.systemConfig);
            if (!deleteCheck.valid) {
                yield conn.rollback();
                conn.release();
                return res.status(403).json({
                    error: deleteCheck.errorCode || 'POLICY_VIOLATION',
                    message: deleteCheck.error
                });
            }
        }
        // Use CASCADE DELETE to remove invoice + all related documents
        const cascadeResult = yield (0, invoiceCascadeDelete_1.deleteInvoiceWithCascade)(conn, invoiceId, deletedBy);
        if (!cascadeResult.success) {
            yield conn.rollback();
            conn.release();
            return res.status(500).json({
                error: 'DELETE_FAILED',
                message: cascadeResult.error || 'Failed to delete invoice'
            });
        }
        yield conn.commit();
        // Log the action
        yield (0, auditController_1.logAction)(deletedBy, 'INVOICE', 'DELETE', `حذف فاتورة ${existingInvoice.number || invoiceId.substring(0, 8)}`, `العميل: ${existingInvoice.partnerName || '-'} | المبلغ: ${existingInvoice.total} | ` +
            `سندات محذوفة: ${cascadeResult.deletedReceipts + cascadeResult.deletedPayments} | ` +
            `قيود محذوفة: ${cascadeResult.deletedJournals}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoice', action: 'delete', updatedBy: deletedBy });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'journal', action: 'delete', updatedBy: deletedBy });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'accounts', action: 'update', updatedBy: deletedBy });
        res.json({
            message: 'Invoice deleted successfully',
            cascade: {
                deletedReceipts: cascadeResult.deletedReceipts,
                deletedPayments: cascadeResult.deletedPayments,
                deletedJournals: cascadeResult.deletedJournals,
                reversedBalances: cascadeResult.reversedBalances
            }
        });
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error deleting invoice:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete invoice');
    }
    finally {
        conn.release();
    }
});
exports.deleteInvoice = deleteInvoice;
/**
 * GET /api/invoices/:id/preview-delete - Preview what will be deleted (for confirmation)
 */
const previewDeleteInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { user, userFilterOptions } = authReq;
        const invoiceId = req.params.id;
        if (!user || !userFilterOptions) {
            conn.release();
            return res.status(401).json({ error: 'Unauthorized' });
        }
        try {
            // Check ownership and branch isolation of target invoice
            const [existing] = yield conn.query('SELECT id, createdBy, type, date, number, partnerName, total, branchId FROM invoices WHERE id = ? LIMIT 1', [invoiceId]);
            const existingInvoice = existing[0];
            if (!existingInvoice) {
                return res.status(404).json({ error: 'Invoice not found' });
            }
            // Enforce closed fiscal year date check
            const fyCheck = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)(existingInvoice.date);
            if (!fyCheck.allowed) {
                return res.status(403).json({
                    error: fyCheck.errorCode || 'FISCAL_YEAR_CLOSED',
                    message: fyCheck.error
                });
            }
            // Enforce lock date validation
            const lockCheck = yield (0, lockDateValidator_1.validateDateAgainstLockDates)(conn, existingInvoice.date, 'GENERAL');
            if (lockCheck.isLocked) {
                return res.status(403).json({
                    error: 'PERIOD_LOCKED',
                    lockType: lockCheck.lockType,
                    lockDate: lockCheck.lockDate,
                    message: lockCheck.message
                });
            }
            // Enforce branch isolation
            const role = (user.role || '').toUpperCase();
            const isAdmin = role === 'MASTER_ADMIN' || role === 'ADMIN' || role === 'GENERAL_MANAGER';
            if (((_a = authReq.branchContext) === null || _a === void 0 ? void 0 : _a.branchId) && !isAdmin) {
                if (existingInvoice.branchId && existingInvoice.branchId !== authReq.branchContext.branchId) {
                    return res.status(403).json({
                        error: 'BRANCH_ACCESS_DENIED',
                        message: 'لا يمكنك تعديل فواتير الفروع الأخرى'
                    });
                }
            }
            // Check if requesting user can delete
            const isOwner = existingInvoice.createdBy === userFilterOptions.userName;
            const canDelete = isOwner || userFilterOptions.canModifyOthers;
            if (!canDelete) {
                return res.status(403).json({
                    error: 'PERMISSION_DENIED',
                    message: 'You can only delete your own invoices',
                    owner: existingInvoice.createdBy
                });
            }
            // Enforce delete permission check
            const permissionId = (0, exports.getInvoicePermission)(existingInvoice.type, 'delete');
            if (permissionId && !(0, dataFiltering_1.hasPermission)(user, permissionId)) {
                return res.status(403).json({
                    error: 'PERMISSION_DENIED',
                    message: `You do not have permission to delete this transaction`,
                    requiredPermission: permissionId
                });
            }
            const preview = yield (0, invoiceCascadeDelete_1.previewCascadeDelete)(conn, invoiceId);
            res.json({
                invoice: {
                    id: preview.invoice.id,
                    number: preview.invoice.number,
                    type: preview.invoice.type,
                    partnerName: preview.invoice.partnerName,
                    total: preview.invoice.total,
                    date: preview.invoice.date
                },
                linkedDocuments: {
                    receipts: preview.linkedReceipts.map((r) => ({
                        id: r.id,
                        number: r.number,
                        total: r.total
                    })),
                    payments: preview.linkedPayments.map((p) => ({
                        id: p.id,
                        number: p.number,
                        total: p.total
                    })),
                    journals: preview.linkedJournals.map((j) => ({
                        id: j.id,
                        description: j.description,
                        date: j.date
                    }))
                },
                totalAmount: preview.totalAmount,
                warning: preview.warning,
                confirmMessage: `هل أنت متأكد من حذف الفاتورة؟ ${preview.warning}`
            });
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('Error previewing delete:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'preview delete');
    }
});
exports.previewDeleteInvoice = previewDeleteInvoice;
/**
 * POST /api/invoices/transfer - Transfer invoice ownership to another user
 */
const transferInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { user, userFilterOptions } = authReq;
        const { invoiceIds, targetUserId, reason } = req.body;
        if (!user || !userFilterOptions) {
            conn.release();
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
            conn.release();
            return res.status(400).json({ error: 'No invoice IDs provided' });
        }
        if (!targetUserId) {
            conn.release();
            return res.status(400).json({ error: 'Target user information is required' });
        }
        const currentUser = userFilterOptions.userName || user.name || user.username;
        const role = (user.role || '').toUpperCase();
        const isAdmin = role === 'MASTER_ADMIN' || role === 'ADMIN' || role === 'GENERAL_MANAGER';
        try {
            // 1. Fetch target user
            const [targetUsers] = yield conn.query('SELECT id, name, username, role, permissions, status, branchId FROM users WHERE id = ? LIMIT 1', [targetUserId]);
            const targetUser = targetUsers[0];
            if (!targetUser) {
                return res.status(400).json({ error: 'TARGET_USER_NOT_FOUND', message: 'المستخدم المستهدف غير موجود' });
            }
            if (targetUser.status !== 'ACTIVE') {
                return res.status(400).json({ error: 'TARGET_USER_INACTIVE', message: 'المستخدم المستهدف غير نشط' });
            }
            const targetUserName = targetUser.name || targetUser.username;
            yield conn.beginTransaction();
            const results = [];
            for (const invoiceId of invoiceIds) {
                // Lock invoice row
                const [existing] = yield conn.query('SELECT id, number, createdBy, type, partnerName, total, date, branchId FROM invoices WHERE id = ? LIMIT 1 FOR UPDATE', [invoiceId]);
                const invoice = existing[0];
                if (!invoice) {
                    results.push({
                        invoiceId,
                        success: false,
                        message: 'Invoice not found'
                    });
                    continue;
                }
                // Verify invoice date is not in closed fiscal year
                const fyCheck = yield (0, fiscalYearUtils_1.validateFiscalYearOpen)(invoice.date);
                if (!fyCheck.allowed) {
                    results.push({
                        invoiceId,
                        success: false,
                        message: `لا يمكن نقل ملكية فاتورة في فترة مالية مغلقة: ${fyCheck.error}`
                    });
                    continue;
                }
                // Verify invoice date is not in locked period
                const lockCheck = yield (0, lockDateValidator_1.validateDateAgainstLockDates)(conn, invoice.date, 'GENERAL');
                if (lockCheck.isLocked) {
                    results.push({
                        invoiceId,
                        success: false,
                        message: `لا يمكن نقل ملكية فاتورة في فترة مقفلة: ${lockCheck.message}`
                    });
                    continue;
                }
                // Enforce branch isolation for target user (unless requester is admin)
                if (((_a = authReq.branchContext) === null || _a === void 0 ? void 0 : _a.branchId) && !isAdmin) {
                    if (invoice.branchId && invoice.branchId !== authReq.branchContext.branchId) {
                        results.push({
                            invoiceId,
                            success: false,
                            message: 'لا يمكنك تعديل فواتير الفروع الأخرى'
                        });
                        continue;
                    }
                    if (targetUser.branchId && targetUser.branchId !== authReq.branchContext.branchId) {
                        results.push({
                            invoiceId,
                            success: false,
                            message: 'المستخدم المستهدف ينتمي لفرع آخر'
                        });
                        continue;
                    }
                }
                // Check if requesting user can transfer this invoice
                const isOwner = invoice.createdBy === currentUser;
                const canTransfer = isOwner || userFilterOptions.canModifyOthers;
                if (!canTransfer) {
                    results.push({
                        invoiceId,
                        success: false,
                        message: `You can only transfer your own invoices. Owner: ${invoice.createdBy}`
                    });
                    continue;
                }
                // Verify target user has permission to create/edit this invoice type
                const requiredPerm = (0, exports.getInvoicePermission)(invoice.type, 'create');
                if (requiredPerm && !(0, dataFiltering_1.hasPermission)(targetUser, requiredPerm)) {
                    results.push({
                        invoiceId,
                        success: false,
                        message: `المستخدم المستهدف ليس لديه صلاحية لهذه الفاتورة (${requiredPerm})`
                    });
                    continue;
                }
                // Update the createdBy field
                yield conn.query('UPDATE invoices SET createdBy = ? WHERE id = ?', [targetUserName, invoiceId]);
                // Invalidate cache
                invalidateInvoiceCache(invoiceId, invoice.number);
                // Log the transfer in audit trail inside transaction
                const auditDetails = JSON.stringify({
                    action: 'INVOICE_TRANSFER',
                    invoiceId,
                    fromUser: invoice.createdBy,
                    toUser: targetUserName,
                    reason: reason || 'No reason provided',
                    partnerName: invoice.partnerName,
                    total: invoice.total
                });
                yield conn.query(`INSERT INTO audit_logs (id, date, user, module, action, details) 
                     VALUES (UUID(), NOW(), ?, 'INVOICE', 'TRANSFER', ?)`, [currentUser, auditDetails]);
                results.push({
                    invoiceId,
                    success: true,
                    message: `Transferred to ${targetUserName}`
                });
            }
            yield conn.commit();
            // Emit real-time update
            eventBus_1.eventBus.broadcast('entity:changed', {
                entityType: 'invoice',
                action: 'transfer',
                targetUser: targetUserName
            });
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            res.json({
                message: `Successfully transferred ${successful} invoice(s)${failed > 0 ? `, ${failed} failed` : ''}`,
                results,
                summary: {
                    total: invoiceIds.length,
                    successful,
                    failed
                }
            });
        }
        catch (error) {
            yield conn.rollback();
            throw error;
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('Error transferring invoices:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'transfer invoices');
    }
});
exports.transferInvoice = transferInvoice;
/**
 * GET /api/invoices/transfer/users - Get list of users for transfer dropdown
 */
const getTransferableUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { user } = authReq;
        if (!user) {
            conn.release();
            return res.status(401).json({ error: 'Unauthorized' });
        }
        try {
            const limit = parseInt(req.query.limit) || 100;
            const offset = parseInt(req.query.offset) || 0;
            let conditions = ["status = 'ACTIVE' AND id != ?"];
            const params = [user.id];
            if ((_a = authReq.branchContext) === null || _a === void 0 ? void 0 : _a.branchId) {
                const role = (user.role || '').toUpperCase();
                if (role !== 'MASTER_ADMIN' && role !== 'ADMIN' && role !== 'GENERAL_MANAGER') {
                    conditions.push("branchId = ?");
                    params.push(authReq.branchContext.branchId);
                }
            }
            const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
            const [countRows] = yield conn.query(`SELECT COUNT(*) as total FROM users ${whereClause}`, params);
            const total = ((_b = countRows[0]) === null || _b === void 0 ? void 0 : _b.total) || 0;
            const [users] = yield conn.query(`SELECT id, name, username, role, branchId 
                 FROM users 
                 ${whereClause}
                 ORDER BY name
                 LIMIT ? OFFSET ?`, [...params, limit, offset]);
            res.json({
                users,
                total,
                limit,
                offset
            });
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('Error fetching transferable users:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch users');
    }
});
exports.getTransferableUsers = getTransferableUsers;
/**
 * GET /api/invoices/report-stats - Fetch sales and purchase invoice stats
 */
const getInvoiceReportStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { user } = authReq;
        // Security check
        if (user && !(0, dataFiltering_1.hasPermission)(user, 'sales.view') && !(0, dataFiltering_1.hasPermission)(user, 'purchase.view')) {
            conn.release();
            return res.status(403).json({ error: 'PERMISSION_DENIED', message: 'Unauthorized access to report stats' });
        }
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const paymentMethod = req.query.paymentMethod;
        // Input validation
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (startDate && !dateRegex.test(startDate)) {
            conn.release();
            return res.status(400).json({ error: 'INVALID_INPUT', message: 'Invalid startDate format. Expected YYYY-MM-DD' });
        }
        if (endDate && !dateRegex.test(endDate)) {
            conn.release();
            return res.status(400).json({ error: 'INVALID_INPUT', message: 'Invalid endDate format. Expected YYYY-MM-DD' });
        }
        const conditions = [
            "i.status = 'POSTED'",
            "i.type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE')"
        ];
        const params = [];
        // Apply data isolation (salesman + user isolation)
        if (authReq.userFilterOptions && authReq.systemConfig) {
            const salesmanFilter = (0, dataFiltering_1.buildSalesmanFilterClause)({
                userRole: authReq.userFilterOptions.userRole,
                salesmanId: authReq.userFilterOptions.salesmanId,
                systemConfig: authReq.systemConfig
            }, 'invoices', 'i');
            if (salesmanFilter.clause) {
                conditions.push(salesmanFilter.clause);
                params.push(...salesmanFilter.params);
            }
            const userFilter = (0, dataFiltering_1.buildParameterizedFilter)(authReq.userFilterOptions);
            if (userFilter.clause) {
                conditions.push(`i.${userFilter.clause}`);
                params.push(...userFilter.params);
            }
        }
        // Apply branch filter if not admin
        (0, branchFilter_1.appendBranchFilter)(conditions, params, authReq, 'i');
        if (startDate) {
            conditions.push('i.date >= ?');
            params.push(startDate.length === 10 ? `${startDate} 00:00:00` : startDate);
        }
        if (endDate) {
            conditions.push('i.date <= ?');
            params.push(endDate.length === 10 ? `${endDate} 23:59:59` : endDate);
        }
        if (paymentMethod && paymentMethod !== 'ALL') {
            conditions.push('i.paymentMethod = ?');
            params.push(paymentMethod);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
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
        return (0, errorHandler_1.handleControllerError)(res, error, 'getInvoiceReportStats');
    }
});
exports.getInvoiceReportStats = getInvoiceReportStats;
