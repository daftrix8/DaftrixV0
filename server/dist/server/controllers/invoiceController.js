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
exports.getPendingReservations = exports.getInvoiceDispatchStatuses = exports.getInvoiceReservations = exports.updateInvoice = exports.getOutstandingInvoices = exports.getCustomerLastProductPrices = exports.getCustomerLastProductPrice = exports.createInvoice = exports.getInvoiceById = exports.getInvoices = exports.getNextInvoiceNumber = exports.syncRevenueCogsJournal = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const dataFiltering_1 = require("../utils/dataFiltering");
const errorHandler_1 = require("../utils/errorHandler");
const branchFilter_1 = require("../utils/branchFilter");
const accountBalanceUtils_1 = require("../utils/accountBalanceUtils");
const eventBus_1 = require("../utils/eventBus");
const fiscalYearUtils_1 = require("../utils/fiscalYearUtils");
const policyEnforcement_1 = require("../utils/policyEnforcement");
const accountCache_1 = require("../utils/accountCache");
const logger_1 = require("../utils/logger");
const invoiceNumberGenerator_1 = require("../utils/invoiceNumberGenerator");
const memberships_1 = require("./memberships");
// Helper: Pad date-only strings with 12:00:00 to prevent timezone-induced day shifting.
// Without this, "2026-04-26" → MySQL stores as 00:00:00 UTC → frontend reads as April 25 in Egypt (UTC+2).
// Same logic as syncController.ts toMySQLDateTime.
const toMySQLDateTime = (isoDate) => {
    if (!isoDate)
        return null;
    try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
            return `${isoDate} 12:00:00`;
        }
        return new Date(isoDate).toISOString().slice(0, 19).replace('T', ' ');
    }
    catch (_a) {
        return null;
    }
};
const syncRevenueCogsJournal = (conn_1, id_1, invoiceNumber_1, type_1, date_1, partnerName_1, total_1, lines_1, createdBy_1, reserveOnSale_1, ...args_1) => __awaiter(void 0, [conn_1, id_1, invoiceNumber_1, type_1, date_1, partnerName_1, total_1, lines_1, createdBy_1, reserveOnSale_1, ...args_1], void 0, function* (conn, id, invoiceNumber, type, date, partnerName, total, lines, createdBy, reserveOnSale, isCashInvoice = false, globalDiscount = 0, branchId = null) {
    // Safely delete any existing Revenue/COGS logs for this invoice to prevent duplication
    yield conn.query(`DELETE FROM journal_lines WHERE journalId IN (
            SELECT id FROM journal_entries 
            WHERE (referenceId = ? OR referenceId = ?)
            AND (description LIKE 'فاتورة بيع%' OR description LIKE 'مرتجع مبيعات%' OR description LIKE 'فاتورة شراء%' OR description LIKE 'مرتجع مشتريات%')
        )`, [invoiceNumber, id]);
    yield conn.query(`DELETE FROM journal_entries 
         WHERE (referenceId = ? OR referenceId = ?)
         AND (description LIKE 'فاتورة بيع%' OR description LIKE 'مرتجع مبيعات%' OR description LIKE 'فاتورة شراء%' OR description LIKE 'مرتجع مشتريات%')`, [invoiceNumber, id]);
    const invoiceTypesForRevenueJournal = ['INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE'];
    // The `total` parameter already includes globalDiscount deduction from the frontend:
    // frontend: invoiceTotal = (subTotal - globalDiscount + shippingFee) + tax
    // Subtracting globalDiscount again would double-deduct the discount in GL entries.
    const netTotal = Number(total.toFixed(2));
    if (invoiceTypesForRevenueJournal.includes(type) && total > 0) {
        try {
            const revJournalId = id + '-rev'; // Deterministic UUID variant is safer but uuidv4() is fine too. Using uuidv4() inside for absolute uniqueness.
            // Actually let's just use regular randomUUID:
            const { randomUUID } = require('crypto');
            const actualJournalId = randomUUID();
            const isSaleType = type === 'INVOICE_SALE' || type === 'RETURN_SALE';
            const isReturn = type === 'RETURN_SALE' || type === 'RETURN_PURCHASE';
            const cachedAccounts = yield (0, accountCache_1.resolveInvoiceAccounts)();
            const revenueAcc = cachedAccounts.revenue;
            const cogsAcc = cachedAccounts.cogs;
            const inventoryAcc = cachedAccounts.inventory;
            const receivablesAcc = cachedAccounts.receivables;
            const payablesAcc = cachedAccounts.payables;
            // BUG FIX: Revenue/COGS Journal should ALWAYS use Receivables/Payables as the
            // partner account — NEVER the Cash account directly. For CASH invoices, the cash
            // movement is handled by the separate Treasury Journal block (line ~1797) which
            // creates: Dr Cash(101), Cr Receivables(104). Using Cash here caused double-counting
            // where the treasury balance was inflated by 2x for every cash sale.
            // The isCashInvoice flag is no longer used for account selection in this function.
            const partnerAccOut = receivablesAcc;
            const partnerAccIn = payablesAcc;
            let totalCOGS = 0, goodCOGS = 0, damagedCOGS = 0;
            if (lines && lines.length > 0) {
                for (const line of lines) {
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
            if (isSaleType && revenueAcc && receivablesAcc) {
                const descPrefix = isReturn ? 'مرتجع مبيعات' : 'فاتورة بيع';
                // BUG FIX: Add "نقدي" suffix for cash invoices so they appear in Treasury Journal filters
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
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES ?`, [journalLines]);
                }
            }
            else if (!isSaleType && inventoryAcc && payablesAcc) {
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
                yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES ?`, [journalLines]);
            }
        }
        catch (revJournalErr) {
            (0, logger_1.logDebug)(`❌ CRITICAL: Revenue/COGS journal creation FAILED — rolling back parent transaction: ${revJournalErr.message}`);
            // RE-THROW: Do NOT swallow this error. If the GL journal fails,
            // the parent transaction MUST roll back to prevent an invoice
            // from existing without its corresponding ledger entries.
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
const invoiceByIdCache = new Map();
const INVOICE_CACHE_TTL_MS = 2000; // 2 seconds
function getCachedInvoice(id) {
    const entry = invoiceByIdCache.get(id);
    if (entry && Date.now() - entry.timestamp < INVOICE_CACHE_TTL_MS) {
        return entry.data;
    }
    // Cleanup stale entries (limit map size)
    if (invoiceByIdCache.size > 100) {
        const now = Date.now();
        invoiceByIdCache.forEach((val, key) => {
            if (now - val.timestamp > INVOICE_CACHE_TTL_MS)
                invoiceByIdCache.delete(key);
        });
    }
    return null;
}
function setCachedInvoice(id, data) {
    invoiceByIdCache.set(id, { data, timestamp: Date.now() });
}
// ============================================
// Get Next Invoice Number — Gap-Fill Strategy
// Finds the SMALLEST MISSING number in the sequence so that
// deleted invoice numbers are recycled: 1,2,3,4 — never 1,3,5.
// Supports: INV-, PUR-, RET-S-, RET-P-, REC-, PAY-, STK-IN-, STK-OUT-
// ============================================
const getNextInvoiceNumber = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const conn = yield (0, db_1.getConnection)();
        const prefix = req.query.prefix || 'INV-';
        // Stock permits use a different table — keep MAX strategy for them
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
            // Lock the prefix range to prevent concurrent requests from getting the same gap
            yield conn.query(`SELECT 1 FROM invoices WHERE number LIKE ? LIMIT 1 FOR UPDATE`, [`${prefix}%`]);
            const nextNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, prefix);
            yield conn.commit();
            conn.release();
            console.log(`🔢 [GapFill] Next number for prefix "${prefix}": ${nextNumber}`);
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
    var _a;
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
            if (!authReq.userFilterOptions.canSeeAll && authReq.userFilterOptions.userName) {
                conditions.push('i.createdBy = ?');
                params.push(authReq.userFilterOptions.userName);
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
        if (partnerId) {
            conditions.push('i.partnerId = ?');
            params.push(partnerId);
        }
        if (search) {
            // ═══════════════════════════════════════════════════════════
            // Arabic-normalized search on invoice_lines using inline REPLACE.
            // Migration 045 (search_vector column) may not exist on all
            // databases, so we use inline normalization for compatibility.
            // ═══════════════════════════════════════════════════════════
            const arabicNormJS = (s) => s.toLowerCase()
                .replace(/أ/g, 'ا').replace(/إ/g, 'ا').replace(/آ/g, 'ا')
                .replace(/ة/g, 'ه').replace(/ى/g, 'ي')
                .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
            const tokens = search.trim().split(/\s+/).filter(Boolean);
            // Inline Arabic normalization SQL — applied to invoice_lines.productName
            const ARABIC_NORM_SQL = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(COALESCE(il.productName, '')), 'أ','ا'), 'إ','ا'), 'آ','ا'), 'ة','ه'), 'ى','ي'), 'ؤ','و'), 'ئ','ي')`;
            if (tokens.length > 0) {
                const tokenConditions = tokens.map(() => {
                    return `( i.partnerName LIKE ? OR i.id LIKE ? OR i.number LIKE ? OR COALESCE(i.notes, '') LIKE ? OR COALESCE(p.phone, '') LIKE ? OR EXISTS (SELECT 1 FROM invoice_lines il WHERE il.invoiceId = i.id AND ${ARABIC_NORM_SQL} LIKE ? LIMIT 1) )`;
                });
                conditions.push(`(${tokenConditions.join(' AND ')})`);
                tokens.forEach(token => {
                    const normalizedToken = `%${arabicNormJS(token)}%`;
                    const rawToken = `%${token}%`;
                    // partnerName, id, number, notes, phone use raw; productName uses normalized
                    params.push(rawToken, rawToken, rawToken, rawToken, rawToken, normalizedToken);
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
        // FISCAL YEAR DATA ISOLATION — always enforce as a hard boundary.
        // When startDate/endDate are also provided, they are already applied above.
        // The fiscal year filter acts as an outer clamp to prevent cross-year data leakage.
        // Without this, a user on fiscal year 2023-2024 could search and see 2025 invoices.
        if (authReq.fiscalYearFilter) {
            conditions.push('i.date >= ? AND i.date <= ?');
            params.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        // BRANCH ISOLATION — non-privileged users see only their branch's invoices
        (0, branchFilter_1.appendBranchFilter)(conditions, params, authReq, 'i');
        // Build WHERE clause manually
        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        // Get paginated invoices (select only needed columns for list view)
        const selectColumns = minimal
            ? 'i.id, i.number, i.date, i.type, i.partnerId, i.partnerName, i.total, i.status, i.paymentMethod, i.notes, i.voucherCategory, i.salesmanId, i.priceListId, i.createdBy, i.warehouseId, i.currencyCode, i.exchangeRate, i.foreignTotal, s.name as safeName, i.bankName, p.phone as partnerPhone, i.referenceInvoiceId, i.sourceInvoiceId, i.relatedInvoiceIds, i.bankTransferReference'
            : 'i.*, s.name as safeName, i.bankName, p.phone as partnerPhone';
        // Determine if we need the partners JOIN (only needed for phone search)
        const needsPartnerJoin = !!search;
        const statsPartnerJoin = needsPartnerJoin ? 'LEFT JOIN partners p ON i.partnerId = p.id' : '';
        // Determine sorting direction based on type. Client requested Sales/Purchase to show fully chronological (oldest to newest)
        const sortDirection = (type === 'INVOICE_SALE' || type === 'INVOICE_PURCHASE') ? 'ASC' : 'DESC';
        // For PAYMENT/RECEIPT vouchers, sort by DATE first then serial number.
        // Previous approach (numeric-only sort) concatenated all digits from legacy
        // OLD-VP-856497-877504 numbers into 856497877504, burying new PAY-00149
        // on page 800+. Date-first sort ensures recent payments always show at top.
        const isVoucherType = type === 'PAYMENT' || type === 'RECEIPT';
        const orderByClause = isVoucherType
            ? `DATE(i.date) ${sortDirection}, CAST(REGEXP_REPLACE(i.number, '[^0-9]', '') AS UNSIGNED) ${sortDirection}`
            : `DATE(i.date) ${sortDirection}, i.number ${sortDirection}`;
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
            ? (((_a = results[2]) === null || _a === void 0 ? void 0 : _a[0]) || []).map((r) => r.createdBy).filter(Boolean)
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
                // 2. Fetch all cheques — PERF: explicit columns instead of SELECT *
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
    try {
        const { id } = req.params;
        // DEDUP: Return cached result if same invoice was fetched within 2 seconds
        const cached = getCachedInvoice(id);
        if (cached) {
            (0, logger_1.logDebug)('⚡ [getInvoiceById] Cache hit for:', id);
            return res.json(cached);
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
        // Use the actual DB id for line queries (critical when searched by number)
        const actualId = invoice.id;
        (0, logger_1.logDebug)('✅ [getInvoiceById] Found invoice:', invoice.number, 'Type:', invoice.type, 'DB-ID:', actualId);
        // Get invoice lines WITH product data (JOIN to avoid N+1 queries on frontend)
        const [lines] = yield conn.query(`SELECT il.*, 
                    il.priceListId AS priceListId,
                    p.barcode AS productBarcode, p.sku AS productSku, p.cost AS productCost, 
                    p.price AS productPrice, p.trackSerials AS productTrackSerials, 
                    p.isActive AS productIsActive, p.categoryId AS productCategoryId,
                    p.ceramic_size, p.ceramic_color, p.ceramic_pattern, p.ceramicGroup, 
                    p.ceramic_name, p.ceramic_color_grade, p.ceramic_color_desc, p.ceramicItemDesc,
                    c.name AS productCategoryName,
                    pv.name AS variantName, pv.barcode AS variantBarcode, pv.sku AS variantSku
             FROM invoice_lines il
             LEFT JOIN products p ON il.productId = p.id
             LEFT JOIN categories c ON p.categoryId = c.id
             LEFT JOIN product_variants pv ON il.variantId IS NOT NULL AND il.variantId = pv.id
             WHERE il.invoiceId = ?`, [actualId]);
        (0, logger_1.logDebug)(`📦 [getInvoiceById] Found ${lines.length} lines for invoice ${invoice.number} (queried by ID: ${actualId})`);
        if (lines.length === 0) {
            const noLineTypes = ['RECEIPT', 'PAYMENT'];
            if (noLineTypes.includes(invoice.type)) {
                (0, logger_1.logDebug)('ℹ️ [getInvoiceById] This is a RECEIPT/PAYMENT — no lines expected.');
            }
            else {
                console.warn('⚠️ [getInvoiceById] Invoice exists but has NO lines! This may indicate a sync issue.');
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
        // ═══════════════════════════════════════════════════════════
        // PERF: Embed product units in response to eliminate N+1 API calls.
        // Previously the frontend made N separate GET /products/:id/units
        // requests (one per line item). Now we batch-fetch all units in
        // a single query and include them in the response.
        // ═══════════════════════════════════════════════════════════
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
        (0, logger_1.logDebug)(`💰 [getInvoiceById] Invoice paidAmount from DB: ${invoice.paidAmount}`);
        // Use the invoice's paidAmount if it exists (direct field)
        if (invoice.paidAmount && Number(invoice.paidAmount) > 0) {
            invoice.paymentCollected = Number(invoice.paidAmount);
            (0, logger_1.logDebug)(`✅ Loaded paidAmount directly from invoice: ${invoice.paymentCollected}`);
        }
        else {
            // Fallback: Search for linked payment/receipt invoices (legacy method)
            try {
                (0, logger_1.logDebug)(`🔍 [getInvoiceById] Searching for linked payment invoice: ${id} (number: ${invoice.number})`);
                // Method 1: Search by sourceInvoiceId OR referenceInvoiceId (ONLY inline payments owned by this invoice)
                const [linkedPayments] = yield conn.query(`SELECT total FROM invoices 
                     WHERE (sourceInvoiceId = ? OR referenceInvoiceId = ?)
                     AND (type = 'RECEIPT' OR type = 'PAYMENT')
                     ORDER BY id DESC LIMIT 1`, [id, id]);
                if (linkedPayments.length > 0) {
                    invoice.paymentCollected = Number(linkedPayments[0].total);
                    (0, logger_1.logDebug)(`💰 Found linked payment invoice by ID: ${invoice.paymentCollected}`);
                }
                else {
                    // Method 2: Search by invoice number in notes (fallback for legacy data)
                    const [paymentsByNumber] = yield conn.query(`SELECT total FROM invoices 
                         WHERE (type = 'RECEIPT' OR type = 'PAYMENT')
                         AND (notes LIKE ? OR notes LIKE ?)`, [`%دفعة مع الفاتورة ${invoice.number}%`, `%دفعة مع الفاتورة ${id}%`]);
                    if (paymentsByNumber.length > 0) {
                        invoice.paymentCollected = Number(paymentsByNumber[0].total);
                        (0, logger_1.logDebug)(`💰 Found linked payment invoice by number: ${invoice.paymentCollected}`);
                    }
                    else {
                        invoice.paymentCollected = 0;
                        (0, logger_1.logDebug)(`ℹ️ No payment found for invoice ${id}`);
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
                console.log(`🏦 Loaded ${invoice.bankTransfers.length} bank transfers for invoice ${id}`);
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
                    console.log(`🏬 Loaded warehouse name: ${invoice.warehouseName}`);
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
                    console.log(`🔄 Found ${invoice.linkedReturnInvoices.length} linked returns for invoice ${invoice.number}`);
                }
            }
            catch (e) {
                console.warn('Could not load linked returns:', e);
                invoice.linkedReturnInvoices = [];
            }
        }
        // ═══════════════════════════════════════════════════════════
        // CHEQUES: Fetch linked cheques for this transaction.
        // The bulk getInvoices endpoint already does this, but
        // getInvoiceById was missing it — causing the PartnerPayment
        // form to render empty when viewing a receipt from the
        // partner statement or treasury drill-down.
        // ═══════════════════════════════════════════════════════════
        try {
            const [txCheques] = yield conn.query(`SELECT id, number, amount, dueDate, bankName, status, transactionId, type, createdDate, description, bankAccountId
                 FROM cheques WHERE transactionId = ?`, [actualId]);
            invoice.transactionCheques = txCheques.map((c) => (Object.assign(Object.assign({}, c), { dueDate: c.dueDate ? new Date(c.dueDate).toISOString().split('T')[0] : '', createdDate: c.createdDate ? new Date(c.createdDate).toISOString().split('T')[0] : '' })));
        }
        catch (e) {
            console.warn('Could not load cheques for invoice:', e);
            invoice.transactionCheques = [];
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
const createInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const conn = yield (0, db_1.getConnection)();
    try {
        (0, logger_1.logDebug)('🚀 [createInvoice] Called with body:', { id: req.body.id, type: req.body.type, paymentCollected: req.body.paymentCollected });
        (0, logger_1.logDebug)('🏦 [createInvoice] bankTransfers received:', req.body.bankTransfers);
        (0, logger_1.logDebug)('💎 [createInvoice TOP] denominations=', JSON.stringify(req.body.denominations), 'paymentCollected=', req.body.paymentCollected);
        let id = req.body.id || (0, crypto_1.randomUUID)();
        // === CHECK IF INVOICE EXISTS (UPDATE vs CREATE) ===
        if (req.body.id) {
            const [existing] = yield conn.query('SELECT id FROM invoices WHERE id = ?', [req.body.id]);
            if (existing.length > 0) {
                // Invoice exists - delegate to updateInvoice
                (0, logger_1.logDebug)(`📝 Invoice ${req.body.id} exists - updating instead of creating`);
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
        let { date: rawDate, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, dueDate, taxAmount, whtAmount, shippingFee, globalDiscount, lines, salesmanId, salesmanName } = req.body;
        // TIMEZONE FIX: Pad date-only strings to prevent midnight UTC → previous day in Egypt
        const date = toMySQLDateTime(rawDate) || rawDate;
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
            console.log(`✅ Invoice total validated: ${validation.calculated}`);
            // BUG FIX: Use the authoritative server-calculated total for all subsequent logic
            total = validation.calculated;
        }
        // === POLICY ENFORCEMENT: Full server-side validation ===
        const authReqPolicy = req;
        if (authReqPolicy.systemConfig) {
            const currentUser = ((_a = authReqPolicy.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = authReqPolicy.user) === null || _b === void 0 ? void 0 : _b.username) || req.body.createdBy || null;
            const policyContext = {
                type,
                date,
                total,
                partnerId,
                notes,
                costCenterId: req.body.costCenterId,
                warehouseId: req.body.warehouseId,
                currentUser: currentUser,
                currentUserRole: (_c = authReqPolicy.user) === null || _c === void 0 ? void 0 : _c.role,
                lines: lines === null || lines === void 0 ? void 0 : lines.map((l) => ({
                    productId: l.productId,
                    quantity: l.quantity || 0,
                    // For purchase invoices, line.price IS the purchase cost.
                    // line.cost is the product's existing cost (0 for new products),
                    // so fall back to line.price to avoid blocking first-time purchases.
                    cost: l.cost || l.price || 0
                }))
            };
            const policyResult = yield (0, policyEnforcement_1.validateTransactionFull)(policyContext, authReqPolicy.systemConfig, conn);
            if (!policyResult.valid) {
                yield conn.rollback();
                conn.release();
                return res.status(403).json({
                    code: policyResult.errorCode || 'POLICY_VIOLATION',
                    message: policyResult.error,
                    error: policyResult.error
                });
            }
        }
        // === SERVER-SIDE INVOICE NUMBER GENERATION (Gap-Fill Strategy) ===
        // Finds the SMALLEST MISSING number so deleted invoice slots are reused.
        // e.g. if INV-00002 was deleted, the next invoice becomes INV-00002, not INV-00005.
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
        console.log(`📋 [createInvoice] Final invoice: id=${id}, number=${invoiceNumber}, type=${type}`);
        // Get createdBy from request user or body
        const authReq = req;
        const createdBy = ((_d = authReq.user) === null || _d === void 0 ? void 0 : _d.name) || ((_e = authReq.user) === null || _e === void 0 ? void 0 : _e.username) || req.body.createdBy || req.body.user || null;
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
                    console.log(`🔍 [createInvoice] Resolved missing partnerName from DB: "${resolvedPartnerName}" for partnerId: ${sanitizedPartnerId}`);
                }
            }
            catch (pErr) {
                console.warn(`⚠️ [createInvoice] Could not resolve partnerName for partnerId ${sanitizedPartnerId}:`, pErr);
            }
        }
        // === CONCURRENT-SAFE INSERT with duplicate number retry ===
        // When 10+ users create invoices simultaneously, two might get the same number.
        // The UNIQUE index on `number` will catch this — we retry with next number.
        let insertAttempts = 0;
        const MAX_INSERT_ATTEMPTS = 5;
        while (insertAttempts < MAX_INSERT_ATTEMPTS) {
            try {
                yield conn.query(`INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, dueDate, taxAmount, whtAmount, shippingFee, globalDiscount, globalDiscountType, globalDiscountValue, warehouseId, bankAccountId, bankName, paymentBreakdown, bankTransfers, salesmanId, priceListId, createdBy, paidAmount, currencyCode, exchangeRate, foreignTotal, bankTransferReference, referenceInvoiceId, voucherCategory, branchId) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, invoiceNumber, date, type, sanitizedPartnerId, resolvedPartnerName, total, status, paymentMethod, posted, notes || (voucherCategory ? `${voucherCategory}|${partnerId || ''}` : null), sanitizedDueDate, taxAmount, whtAmount, shippingFee, globalDiscount, req.body.globalDiscountType || 'FIXED', req.body.globalDiscountValue || 0, sanitizedWarehouseId,
                    // For CREDIT invoices with partial bank payment: store bank info in bankAccountId/bankName
                    // For BANK invoices: store main bank info as before
                    req.body.partialPaymentBankId || req.body.bankAccountId || null,
                    req.body.partialPaymentMethod || req.body.bankName || null,
                    req.body.paymentBreakdown ? JSON.stringify(req.body.paymentBreakdown) : null, req.body.bankTransfers ? JSON.stringify(req.body.bankTransfers) : null, salesmanId || null, req.body.priceListId || null, createdBy, req.body.paidAmount || req.body.paymentCollected || null, req.body.currencyCode || 'EGP', req.body.exchangeRate || 1, req.body.foreignTotal || null, req.body.bankTransferReference || null, req.body.referenceInvoiceId || null, voucherCategory || null, (0, branchFilter_1.resolveBranchIdForWrite)(req)]);
                break; // Success — exit retry loop
            }
            catch (insertErr) {
                if (insertErr.code === 'ER_DUP_ENTRY' && ((_f = insertErr.message) === null || _f === void 0 ? void 0 : _f.includes('number'))) {
                    insertAttempts++;
                    // Auto-increment the number and retry
                    const prefix = ((_g = invoiceNumber.match(/^[A-Z]+-(?:[A-Z]+-)?/)) === null || _g === void 0 ? void 0 : _g[0]) || 'TRX-';
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
                        yield conn.query(`INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, dueDate, taxAmount, whtAmount, shippingFee, globalDiscount, globalDiscountType, globalDiscountValue, warehouseId, bankAccountId, bankName, paymentBreakdown, bankTransfers, salesmanId, priceListId, createdBy, paidAmount, currencyCode, exchangeRate, foreignTotal, bankTransferReference, referenceInvoiceId, voucherCategory, branchId) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, invoiceNumber, date, type, sanitizedPartnerId, resolvedPartnerName, total, status, paymentMethod, posted, notes || (voucherCategory ? `${voucherCategory}|${partnerId || ''}` : null), sanitizedDueDate, taxAmount, whtAmount, shippingFee, globalDiscount, req.body.globalDiscountType || 'FIXED', req.body.globalDiscountValue || 0, sanitizedWarehouseId,
                            req.body.partialPaymentBankId || req.body.bankAccountId || null,
                            req.body.partialPaymentMethod || req.body.bankName || null,
                            req.body.paymentBreakdown ? JSON.stringify(req.body.paymentBreakdown) : null, req.body.bankTransfers ? JSON.stringify(req.body.bankTransfers) : null, salesmanId || null, req.body.priceListId || null, createdBy, req.body.paidAmount || req.body.paymentCollected || null, req.body.currencyCode || 'EGP', req.body.exchangeRate || 1, req.body.foreignTotal || null, req.body.bankTransferReference || null, req.body.referenceInvoiceId || null, voucherCategory || null, (0, branchFilter_1.resolveBranchIdForWrite)(req)]);
                        break;
                    }
                }
                else {
                    throw insertErr; // Non-duplicate error — propagate
                }
            }
        }
        // ═══════════════════════════════════════════════════════════
        // CHEQUES: Persist transactionCheques to the cheques table
        // The frontend sends cheque data as req.body.transactionCheques
        // for CHEQUE/MIXED payment methods on RECEIPT/PAYMENT invoices.
        // Without this, cheque data was silently lost.
        // ═══════════════════════════════════════════════════════════
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
            // ═══════════════════════════════════════════════════════════
            // PERF: BATCH INSERT all invoice_lines in a single query
            // Instead of N sequential INSERTs (one per line), we build
            // a single INSERT ... VALUES (row1), (row2), ... (rowN)
            // This reduces DB round-trips from N to 1
            // ═══════════════════════════════════════════════════════════
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
                const lineBaseQuantity = Number(line.baseQuantity) || qty;
                const lineSerials = line.serials || [];
                const safeSerials = Array.isArray(lineSerials) ? lineSerials : [];
                const serialsJson = safeSerials.length > 0 ? JSON.stringify(safeSerials) : null;
                batchLineValues.push([
                    id, line.productId, line.productName, qty, price, cost,
                    line.discount, lineTotal, sanitizedLineWarehouseId, serialsJson,
                    bonusQty, gradeValue, lineUnitId, lineUnitName, lineConversionFactor,
                    lineBaseQuantity, returnConditionValue, line.priceListId || null,
                    line.variantId || null
                ]);
                // Collect serial data for post-batch processing
                if (safeSerials.length > 0) {
                    lineDataForSerials.push({ line, safeSerials, qty });
                }
            }
            // Execute batch INSERT (single query for all lines)
            try {
                yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, warehouseId, serials, bonusQty, grade, unitId, unitName, conversionFactor, baseQuantity, returnCondition, priceListId, variantId)
                     VALUES ?`, [batchLineValues]);
            }
            catch (ilErr) {
                // Fallback: try without unit columns if they don't exist yet
                (0, logger_1.logDebug)('⚠️ Batch invoice_lines insert failed, trying fallback:', ilErr.message);
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
                    (0, logger_1.logDebug)('⚠️ Fallback batch insert failed, trying basic:', ilErr2.message);
                    const basicValues = batchLineValues.map(row => [
                        row[0], row[1], row[2], row[3], row[4], row[5],
                        row[6], row[7], row[17] // priceListId
                    ]);
                    yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, priceListId)
                         VALUES ?`, [basicValues]);
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
                            // Fetch warranty info
                            const [pRows] = yield conn.query('SELECT warrantyMonths FROM products WHERE id = ?', [line.productId]);
                            const wMonths = ((_h = pRows[0]) === null || _h === void 0 ? void 0 : _h.warrantyMonths) || 0;
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
                        console.error(`❌ Error processing serial ${cleanSerial} for product ${line.productName}:`, err);
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
                    if (((_j = configObj.inventory) === null || _j === void 0 ? void 0 : _j.reserveOnSale) === true) {
                        reserveOnSale = true;
                    }
                }
                catch (e) { }
            }
        }
        // === RESERVE-ON-SALE MODE ===
        // When enabled, INVOICE_SALE creates reservations instead of deducting stock
        if (reserveOnSale && type === 'INVOICE_SALE' && !isVanSale && lines && lines.length > 0) {
            (0, logger_1.logDebug)(`📋 Reserve-on-Sale mode: Creating reservations for invoice ${invoiceNumber}`);
            for (const line of lines) {
                // Multi-Unit: use baseQuantity (qty * conversionFactor) if available
                // e.g., 1 box with conversionFactor=12 → baseQuantity=12 pieces
                const rawQty = Number(line.baseQuantity || line.quantity);
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
                    (0, logger_1.logDebug)(`  📦 Reserved: ${line.productName} x${totalQty} in warehouse ${warehouseIdToUse || 'N/A'}`);
                }
            }
            // Note: NO stock deduction, NO stock_movements for reserved sales
        }
        // === NORMAL STOCK DEDUCTION MODE ===
        else if (stockChangeTypes[type] !== undefined && lines && lines.length > 0) {
            // Skip stock update for Van Sales (already handled by vehicleController)
            if (type === 'INVOICE_SALE' && isVanSale) {
                (0, logger_1.logDebug)(`⏭️ Skipping stock update for Van Sale invoice ${invoiceNumber}`);
            }
            else {
                // ═══════════════════════════════════════════════════════════
                // PERF v2: Batched stock updates
                // - Non-purchase invoices: bulk UPDATE + bulk UPSERT (2 queries instead of 2N)
                // - Purchase invoices: sequential FOR UPDATE for cost calc, batched warehouse
                // - Stock movements: always batched
                // ═══════════════════════════════════════════════════════════
                const batchStockMovements = [];
                // Collectors for batched non-purchase stock updates
                const bulkProductStockUpdates = [];
                const bulkWarehouseStockUpdates = [];
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
                const isPurchase = type === 'INVOICE_PURCHASE';
                for (const line of lines) {
                    // Multi-Unit: use baseQuantity (qty * conversionFactor) for stock
                    const rawQty = Number(line.baseQuantity || line.quantity);
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
                            if (((_k = variantCheck[0]) === null || _k === void 0 ? void 0 : _k.cnt) > 0) {
                                console.warn(`⚠️ [Invoice] Blocked parent product "${line.productName}" (${line.productId}) — has variants but no variantId specified`);
                                continue; // Skip this line — don't create movement against parent
                            }
                        }
                        catch ( /* product_variants table may not exist — skip check */_m) { /* product_variants table may not exist — skip check */ }
                    }
                    // === DAMAGED RETURN HANDLING (الهالك) ===
                    const isReturn = type === 'RETURN_SALE' || type === 'RETURN_PURCHASE';
                    const isDamaged = isReturn && line.returnCondition === 'DAMAGED';
                    const qtyChange = isDamaged ? 0 : Number((totalQty * stockMultiplier).toFixed(5));
                    if (isPurchase && qty > 0) {
                        // === PURCHASE PATH: Sequential FOR UPDATE needed for average cost ===
                        const [prodRows] = yield conn.query('SELECT stock, cost FROM products WHERE id = ? FOR UPDATE', [line.productId]);
                        const oldStock = prodRows.length > 0 ? (Number(prodRows[0].stock) || 0) : 0;
                        const oldCost = prodRows.length > 0 ? (Number(prodRows[0].cost) || 0) : 0;
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
                        (0, logger_1.logDebug)(`💰 Net cost: ${rawPrice} × ${qty} = ${lineGross}, disc=${lineDiscount}, global=${lineShareOfGlobalDiscount.toFixed(2)}, unit=${unitPurchasePrice.toFixed(2)}`);
                        if (inventoryValuationMethod === 'LAST_PURCHASE') {
                            newCost = unitPurchasePrice;
                        }
                        else {
                            newCost = oldStock <= 0 ? unitPurchasePrice : ((oldStock * oldCost) + (qty * unitPurchasePrice)) / (oldStock + qty);
                        }
                        newCost = Number(newCost.toFixed(2));
                        yield conn.query('UPDATE products SET cost = ? WHERE id = ?', [newCost, line.productId]);
                        (0, logger_1.logDebug)(`💰 Product cost updated: ${line.productName} -> ${newCost} (${inventoryValuationMethod})`);
                    }
                    else {
                        // === NON-PURCHASE PATH: Collect for batch update ===
                        if (!isDamaged && qtyChange !== 0) {
                            bulkProductStockUpdates.push({ productId: line.productId, qtyChange });
                        }
                        else if (isDamaged) {
                            (0, logger_1.logDebug)(`⚠️ DAMAGED return: ${line.productName} x${totalQty} NOT added to saleable stock`);
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
                // ═══════════════════════════════════════════════════════════
                // PERF v2: Execute batched stock updates (non-purchase lines)
                // Instead of N individual UPDATEs, use a single CASE statement
                // ═══════════════════════════════════════════════════════════
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
                    (0, logger_1.logDebug)(`⚡ Batch product stock update: ${productIds.length} products in 1 query`);
                }
                // PERF v2: Batch warehouse stock updates
                if (bulkWarehouseStockUpdates.length > 0) {
                    // For purchases, warehouse stocks were already handled one-by-one above (via FOR UPDATE)
                    // For non-purchases, batch them here
                    const nonPurchaseWarehouseUpdates = isPurchase ? [] : bulkWarehouseStockUpdates;
                    // For purchases, these are collected but need individual UPSERT due to transaction ordering
                    const purchaseWarehouseUpdates = isPurchase ? bulkWarehouseStockUpdates : [];
                    if (nonPurchaseWarehouseUpdates.length > 0) {
                        const whValues = nonPurchaseWarehouseUpdates.map(u => [u.productId, u.warehouseId, u.qtyChange, u.qtyChange]);
                        // Use individual UPSERTs but in a tight loop (MySQL doesn't support batch ON DUPLICATE KEY with different update values per row easily)
                        // However we can still use a single multi-row INSERT with a summing trick
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
                // Update product_variants.stock (global) and product_variant_stocks (per-warehouse)
                const variantStockMap = new Map();
                const variantWarehouseUpdates = [];
                for (const line of lines) {
                    if (!line.variantId)
                        continue;
                    const isReturn = type === 'RETURN_SALE' || type === 'RETURN_PURCHASE';
                    const isDamaged = isReturn && line.returnCondition === 'DAMAGED';
                    if (isDamaged)
                        continue;
                    const rawQty = Number(line.baseQuantity || line.quantity);
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
        // This leverages the shared helper to calculate COGS and insert valid double-entry into GL
        const mainPaymentMethodForReceipt = req.body.paymentMethod || 'CASH';
        const isCashInvoice = mainPaymentMethodForReceipt === 'CASH';
        yield (0, exports.syncRevenueCogsJournal)(conn, id, invoiceNumber, type, date, partnerName, total, lines, createdBy, !!reserveOnSale, isCashInvoice, Number(globalDiscount) || 0, (0, branchFilter_1.resolveBranchIdForWrite)(req));
        // Get user for audit logging
        const user = req.body.user || 'System';
        // === PAYMENT WITH INVOICE (دفعة مع الفاتورة) ===
        // If paymentCollected is provided, create a payment/receipt transaction(WITHOUT TRY-CATCH for atomicity check)
        // BUG FIX: Prevent recursive payment creation for RECEIPT/PAYMENT types
        const supportsPaymentWithInvoice = [
            'INVOICE_SALE',
            'INVOICE_PURCHASE',
            'RETURN_SALE',
            'RETURN_PURCHASE'
        ].includes(type);
        let paymentCollected = supportsPaymentWithInvoice ? Number(req.body.paymentCollected || 0) : 0;
        // BUG FIX: Validate paymentCollected against the finalized total before generating payment receipts
        // to prevent phantom debt/credit in the customer ledger.
        if (paymentCollected > total && total > 0) {
            (0, logger_1.logDebug)(`⚠️ Capping paymentCollected (${paymentCollected}) to validated invoice total (${total})`);
            paymentCollected = total;
        }
        // ═══════════════════════════════════════════════════════════════════
        // BUG FIX: Do NOT create a receipt for CASH invoices!
        // The balance SQL (partnerController) EXCLUDES CASH invoices from the 
        // customer debt ledger (paymentMethod != 'CASH'). If we ALSO create a 
        // RECEIPT record, the receipt subtracts from the balance but the invoice 
        // adds nothing → phantom credit balance.
        // CASH = fully paid at point of sale. No separate receipt needed.
        // Only create receipts for CREDIT invoices with partial payments.
        (0, logger_1.logDebug)(`🔥 createInvoice: paymentCollected=${paymentCollected}, partnerId=${partnerId}, partialPaymentMethod=${req.body.partialPaymentMethod}, mainPaymentMethod=${mainPaymentMethodForReceipt}, isCashInvoice=${isCashInvoice}`);
        if (paymentCollected > 0 && partnerId && !isCashInvoice) {
            (0, logger_1.logDebug)(`💰 Creating payment transaction for invoice ${invoiceNumber}: ${paymentCollected}`);
            // Determine payment type based on invoice type
            const paymentType = (type === 'INVOICE_SALE' || type === 'RETURN_PURCHASE')
                ? 'RECEIPT' // مقبوض
                : 'PAYMENT'; // دفع
            // Generate payment number
            const paymentPrefix = paymentType === 'RECEIPT' ? 'REC-' : 'PAY-';
            const paymentNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, paymentPrefix);
            const paymentId = paymentNumber; // SERIAL FIX: id === number for all PAY/REC
            // Create payment/receipt record with sourceInvoiceId for cascade delete
            // Sanitize warehouseId
            const sanitizedWarehouseId = req.body.warehouseId && typeof req.body.warehouseId === 'string'
                ? req.body.warehouseId.substring(0, 36)
                : null;
            // Build bankTransfers JSON for the receipt if payment method is BANK
            let receiptBankTransfers = null;
            if (req.body.partialPaymentMethod === 'BANK' && req.body.partialPaymentBankId) {
                // Look up bank name
                const [bankInfoRows] = yield conn.query(`SELECT id, name, accountId FROM banks WHERE id = ? LIMIT 1`, [req.body.partialPaymentBankId]);
                const bankInfo = bankInfoRows[0];
                receiptBankTransfers = JSON.stringify([{
                        bankName: (bankInfo === null || bankInfo === void 0 ? void 0 : bankInfo.name) || '',
                        bankId: req.body.partialPaymentBankId,
                        amount: paymentCollected,
                        reference: '',
                        accountNumber: ''
                    }]);
            }
            yield conn.query(`INSERT INTO invoices (
                    id, number, date, type, partnerId, partnerName, 
                    total, status, paymentMethod, posted, notes, 
                    warehouseId, createdBy, sourceInvoiceId, relatedInvoiceIds, bankTransfers,
                    bankAccountId, bankName
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                paymentId,
                paymentNumber,
                date,
                paymentType,
                partnerId,
                partnerName,
                paymentCollected,
                'POSTED',
                req.body.partialPaymentMethod || 'CASH', // Use partial payment method (CASH/BANK/CHEQUE), not main invoice method
                1, // posted = true
                `دفعة مع الفاتورة ${invoiceNumber}`,
                sanitizedWarehouseId, // Use sanitized warehouseId
                createdBy,
                id, // sourceInvoiceId - links to parent invoice for cascade delete
                JSON.stringify([id]), // relatedInvoiceIds - legacy support
                receiptBankTransfers, // Bank transfer details (null if not BANK)
                // Set bankAccountId and bankName for the receipt UI to properly rehydrate the selected bank
                req.body.partialPaymentMethod === 'BANK' ? (receiptBankTransfers ? JSON.parse(receiptBankTransfers)[0].bankId : null) : null,
                req.body.partialPaymentMethod === 'BANK' ? (receiptBankTransfers ? JSON.parse(receiptBankTransfers)[0].bankName : null) : null
            ]);
            // Create account transaction for the payment
            yield conn.query(`INSERT INTO account_transactions (
                    id, date, type, partnerId, partnerName, 
                    debit, credit, description, invoiceId, createdBy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                (0, crypto_1.randomUUID)(),
                date,
                paymentType,
                partnerId,
                partnerName,
                paymentType === 'PAYMENT' ? paymentCollected : 0, // Debit for payments (we paid)
                paymentType === 'RECEIPT' ? paymentCollected : 0, // Credit for receipts (we received)
                `${paymentType === 'RECEIPT' ? 'مقبوض' : 'دفع'} مع الفاتورة ${invoiceNumber}`,
                paymentId,
                createdBy
            ]);
            // === CREATE JOURNAL ENTRY FOR TREASURY JOURNAL ===
            // This ensures the payment appears in يومية الخزينة (Treasury Journal)
            // Create payment journal for:
            // 1. CREDIT invoices with partial payment (legacy behavior)  
            // 2. ANY invoice with denomination data (so denomination report works)
            const mainPaymentMethod = req.body.paymentMethod || 'CASH';
            const hasDenominations = req.body.denominations && Object.values(req.body.denominations).some((v) => Number(v) > 0);
            const shouldCreatePaymentJournal = paymentCollected > 0 && (mainPaymentMethod === 'CREDIT' || hasDenominations);
            console.log(`💎 [DENOM DEBUG] paymentCollected=${paymentCollected}, mainPaymentMethod=${mainPaymentMethod}, hasDenominations=${hasDenominations}, shouldCreatePaymentJournal=${shouldCreatePaymentJournal}`);
            console.log(`💎 [DENOM DEBUG] req.body.denominations=`, JSON.stringify(req.body.denominations));
            if (shouldCreatePaymentJournal) {
                const journalId = (0, crypto_1.randomUUID)();
                // Determine which account to use based on partialPaymentMethod (new field) or default to CASH
                const partialPaymentMethod = req.body.partialPaymentMethod || 'CASH';
                // Resolve payment account based on method:
                // CASH → branch default treasury via resolveBranchCashAccount
                // BANK → specific bank's GL account
                // CHEQUE → Notes Receivable/Payable
                let paymentAccount = null;
                if (partialPaymentMethod === 'CASH') {
                    // Branch-aware: use the branch's default treasury GL account
                    paymentAccount = yield (0, branchFilter_1.resolveBranchCashAccount)(conn, req);
                }
                else if (partialPaymentMethod === 'BANK') {
                    if (req.body.partialPaymentBankId) {
                        const [bankRows] = yield conn.query(`SELECT id, name, accountId FROM banks WHERE id = ? LIMIT 1`, [req.body.partialPaymentBankId]);
                        const bank = bankRows[0];
                        if (bank === null || bank === void 0 ? void 0 : bank.accountId) {
                            const [glAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [bank.accountId]);
                            paymentAccount = glAccRows[0] || null;
                            if (!paymentAccount) {
                                console.warn(`⚠️ Bank ${bank.name} accountId ${bank.accountId} — no GL match`);
                            }
                        }
                        else if (bank) {
                            console.warn(`⚠️ Bank ${bank.name} has no linked GL account`);
                            const [bankAccByName] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [`%${bank.name}%`]);
                            paymentAccount = bankAccByName[0] || null;
                        }
                    }
                    // Final bank fallback
                    if (!paymentAccount) {
                        const [fallback] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '102%' LIMIT 1`);
                        paymentAccount = fallback[0] || null;
                    }
                }
                else if (partialPaymentMethod === 'CHEQUE') {
                    const chequeCode = paymentType === 'RECEIPT' ? '106%' : '203%';
                    const [chequeAcc] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [chequeCode]);
                    paymentAccount = chequeAcc[0] || null;
                }
                // Get partner account (Receivables for RECEIPT, Payables for PAYMENT)
                // Account codes: 104 = AR (العملاء), 201 = AP (الموردين)
                const partnerAccountCode = paymentType === 'RECEIPT' ? '104%' : '201%';
                let [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [partnerAccountCode]);
                // Fallback: Try finding by name (Customers/Suppliers)
                if (partnerAccounts.length === 0) {
                    const searchName = paymentType === 'RECEIPT' ? '%عملاء%' : '%موردين%';
                    console.log(`⚠️ Account ${partnerAccountCode} not found, trying name: ${searchName}`);
                    [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [searchName]);
                }
                const partnerAccount = partnerAccounts[0];
                if (!paymentAccount)
                    console.warn(`❌ Could not find PAYMENT account for journal entry`);
                if (!partnerAccount)
                    console.warn(`❌ Could not find PARTNER account for journal entry`);
                console.log(`🔍 DEBUG: Resolved payment account for method '${partialPaymentMethod}':`, paymentAccount);
                console.log(`🔍 DEBUG: Found partnerAccount:`, partnerAccount);
                if (paymentAccount && partnerAccount) {
                    // Create journal entry header
                    const methodLabel = partialPaymentMethod === 'CASH' ? 'نقدي' :
                        partialPaymentMethod === 'BANK' ? 'تحويل بنكي' : 'شيك';
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, denominations) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                        journalId,
                        date,
                        `${paymentType === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} #${paymentNumber} - ${partnerName} - دفعة مع الفاتورة ${invoiceNumber} (${methodLabel})`,
                        paymentId,
                        createdBy,
                        req.body.currencyCode || 'EGP',
                        req.body.exchangeRate || 1,
                        req.body.denominations ? JSON.stringify(req.body.denominations) : null
                    ]);
                    // PERF: Batch journal lines — single INSERT with 2 rows instead of 2 separate INSERTs
                    const cCode = req.body.currencyCode || 'EGP';
                    const exRate = req.body.exchangeRate || 1;
                    const fAmt = paymentCollected / exRate;
                    const jLines = paymentType === 'RECEIPT'
                        ? [
                            [journalId, paymentAccount.id, paymentAccount.name, paymentCollected, 0, cCode, exRate, fAmt, 0],
                            [journalId, partnerAccount.id, partnerAccount.name, 0, paymentCollected, cCode, exRate, 0, fAmt]
                        ]
                        : [
                            [journalId, partnerAccount.id, partnerAccount.name, paymentCollected, 0, cCode, exRate, fAmt, 0],
                            [journalId, paymentAccount.id, paymentAccount.name, 0, paymentCollected, cCode, exRate, 0, fAmt]
                        ];
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [jLines]);
                    console.log(`📒 Journal entry ${journalId} created for Treasury Journal (${methodLabel})`);
                    // Update bank balance for partial payments with BANK method
                    if (partialPaymentMethod === 'BANK' && req.body.partialPaymentBankId) {
                        // Find the bank by its linked GL account ID
                        const [bankRows] = yield conn.query(`SELECT id FROM banks WHERE accountId = ? LIMIT 1`, [req.body.partialPaymentBankId]);
                        const bankId = (_l = bankRows[0]) === null || _l === void 0 ? void 0 : _l.id;
                        if (bankId) {
                            // For RECEIPT: money comes IN (positive), for PAYMENT: money goes OUT (negative)
                            const balanceChange = paymentType === 'RECEIPT' ? paymentCollected : -paymentCollected;
                            // REMOVED: Banks balance is now calculated live from GL/journal lines
                            console.log(`🏦 Bank ${bankId} GL updated by ${balanceChange} (partial payment)`);
                        }
                    }
                }
                else {
                    console.warn('⚠️ Could not find payment/partner accounts for journal entry');
                }
            }
            console.log(`✅ Payment ${paymentNumber} created and linked to invoice ${invoiceNumber}`);
            // Log audit trail for payment
            yield (0, auditController_1.logAction)(createdBy || 'System', paymentType, 'CREATE', `Created ${paymentType} #${paymentNumber} with Invoice ${invoiceNumber}`, `Partner: ${partnerName}, Amount: ${paymentCollected}`);
        }
        // ═══════════════════════════════════════════════════════════════════
        // BUG FIX: CASH INVOICE TREASURY JOURNAL ENTRY
        // We disabled RECEIPT/Payment generation for CASH invoices above, BUT
        // we STILL need to record the cash flow in the GL (Treasury Journal)!
        // This ensures the cash hits the 101% account and shows up in the Treasury.
        // ═══════════════════════════════════════════════════════════════════
        // BUG FIX: Use the invoice TOTAL, not paymentCollected, for the treasury journal amount.
        // paymentCollected may be stale (React useEffect race) when the user adds discounts/additions
        // and saves immediately. The invoice `total` is the authoritative value — it ALWAYS includes
        // discounts, additions, tax, shipping, and is computed synchronously.
        // BUG FIX: EXCLUDE standalone RECEIPT/PAYMENT types — they create their OWN journal
        // at line ~2096 with correct "سند صرف"/"سند قبض" descriptions. Without this guard,
        // cash PAY/REC entries get a DUPLICATE journal with wrong "فاتورة مبيعات نقدي" label,
        // doubling the financial impact on GL accounts.
        const cashJournalAmount = Number(total) || paymentCollected;
        if (cashJournalAmount > 0 && partnerId && isCashInvoice && type !== 'RECEIPT' && type !== 'PAYMENT') {
            (0, logger_1.logDebug)(`💰 Creating Treasury Journal entry for CASH invoice ${invoiceNumber}: ${cashJournalAmount} (total=${total}, paymentCollected=${paymentCollected})`);
            // Determine payment type based on invoice type
            const paymentType = (type === 'INVOICE_SALE' || type === 'RETURN_PURCHASE') ? 'RECEIPT' : 'PAYMENT';
            const journalId = (0, crypto_1.randomUUID)();
            // 1. Get Cash Account — branch-aware: uses branch's default treasury
            const paymentAccount = yield (0, branchFilter_1.resolveBranchCashAccount)(conn, req);
            // 2. Get Partner Receivable/Payable account 
            // (We MUST credit Receivables since the Revenue Journal debited it!)
            // BUG FIX: RETURN_SALE should also use Receivables (104) not Payables (201).
            // The revenue journal created Dr Revenue, Cr Receivables — the cash refund
            // must settle against Receivables: Dr Receivables (104), Cr Cash (101).
            const isSaleRelated = (type === 'INVOICE_SALE' || type === 'RETURN_SALE');
            const partnerAccountCode = isSaleRelated ? '104%' : '201%';
            let [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [partnerAccountCode]);
            if (partnerAccounts.length === 0) {
                const searchName = paymentType === 'RECEIPT' ? '%عملاء%' : '%موردين%';
                [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [searchName]);
            }
            const partnerAccount = partnerAccounts[0];
            if (paymentAccount && partnerAccount) {
                // Determine description prefix - MUST match legacy pattern for treasury category filters
                // Sales: "فاتورة مبيعات نقدي" matches "مبيعات نقدية" category
                // Returns: "مرتجع مبيعات نقدي" matches "مبيعات نقدية" category  
                // Purchases: "فاتورة مشتريات نقدي" for purchase invoices
                let descPrefix = 'فاتورة مبيعات نقدي';
                if (type === 'RETURN_SALE')
                    descPrefix = 'مرتجع مبيعات نقدي';
                else if (type === 'RETURN_PURCHASE')
                    descPrefix = 'مرتجع مشتريات نقدي';
                else if (type === 'INVOICE_PURCHASE')
                    descPrefix = 'فاتورة مشتريات نقدي';
                // Header
                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, denominations) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                    journalId, date,
                    `${descPrefix} #${invoiceNumber} - ${partnerName}`,
                    id, createdBy, req.body.currencyCode || 'EGP', req.body.exchangeRate || 1,
                    req.body.denominations ? JSON.stringify(req.body.denominations) : null
                ]);
                // Lines
                const exRate = req.body.exchangeRate || 1;
                const fAmt = cashJournalAmount / exRate;
                const cCode = req.body.currencyCode || 'EGP';
                if (paymentType === 'RECEIPT') {
                    // RECEIPT: Dr Cash, Cr Receivables/Payables
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, paymentAccount.id, paymentAccount.name, cashJournalAmount, 0, cCode, exRate, fAmt, 0]);
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, partnerAccount.id, partnerAccount.name, 0, cashJournalAmount, cCode, exRate, 0, fAmt]);
                }
                else {
                    // PAYMENT: Dr Receivables/Payables, Cr Cash
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, partnerAccount.id, partnerAccount.name, cashJournalAmount, 0, cCode, exRate, fAmt, 0]);
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, paymentAccount.id, paymentAccount.name, 0, cashJournalAmount, cCode, exRate, 0, fAmt]);
                }
                (0, logger_1.logDebug)(`📒 Treasury journal entry ${journalId} created for CASH INVOICE ${invoiceNumber} (amount: ${cashJournalAmount})`);
            }
            else {
                console.warn(`⚠️ Could not find Cash or Partner account for CASH INVOICE Treasury Journal (Inv: ${invoiceNumber})`);
            }
        }
        // === PROCESS BANK TRANSFERS (تحويلات بنكية) ===
        // Create payment vouchers for each bank transfer
        const bankTransfers = req.body.bankTransfers;
        if (bankTransfers && Array.isArray(bankTransfers) && bankTransfers.length > 0 && partnerId) {
            console.log(`🏦 Processing ${bankTransfers.length} bank transfers for invoice ${invoiceNumber}`);
            for (const transfer of bankTransfers) {
                if (!transfer.amount || transfer.amount <= 0)
                    continue;
                // Determine payment type based on invoice type
                const transferPaymentType = (type === 'INVOICE_SALE' || type === 'RETURN_PURCHASE')
                    ? 'RECEIPT' // مقبوض
                    : 'PAYMENT'; // سند صرف
                // Memory-Optimized Payment Number Generation for Transfer
                const transferPrefix = transferPaymentType === 'RECEIPT' ? 'REC-' : 'PAY-';
                const transferNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, transferPrefix);
                const transferPaymentId = (0, crypto_1.randomUUID)();
                // Create payment/receipt record for bank transfer with sourceInvoiceId for cascade delete
                yield conn.query(`INSERT INTO invoices (
                        id, number, date, type, partnerId, partnerName, 
                        total, status, paymentMethod, posted, notes, 
                        warehouseId, createdBy, bankName, sourceInvoiceId, relatedInvoiceIds
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    transferPaymentId,
                    transferNumber,
                    date,
                    transferPaymentType,
                    partnerId,
                    partnerName,
                    transfer.amount,
                    'POSTED',
                    'BANK',
                    1, // posted = true
                    `تحويل بنكي مع الفاتورة ${invoiceNumber} - مرجع: ${transfer.reference || '-'}`,
                    req.body.warehouseId || null,
                    createdBy,
                    transfer.bankName || null,
                    id, // sourceInvoiceId - for cascade delete
                    JSON.stringify([id])
                ]);
                // Create account transaction for the bank transfer
                yield conn.query(`INSERT INTO account_transactions (
                        id, date, type, partnerId, partnerName, 
                        debit, credit, description, invoiceId, createdBy
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    (0, crypto_1.randomUUID)(),
                    date,
                    transferPaymentType,
                    partnerId,
                    partnerName,
                    transferPaymentType === 'PAYMENT' ? transfer.amount : 0,
                    transferPaymentType === 'RECEIPT' ? transfer.amount : 0,
                    `تحويل بنكي مع الفاتورة ${invoiceNumber} - بنك: ${transfer.bankName || '-'}`,
                    transferPaymentId,
                    createdBy
                ]);
                // === CREATE JOURNAL ENTRY FOR BANK TRANSFER ===
                const transferJournalId = (0, crypto_1.randomUUID)();
                // Get bank account
                let bankAccountId = null;
                let bankAccountName = 'البنوك';
                // Try to find bank account by name from the transfer
                if (transfer.bankName) {
                    const [bankAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [`%${transfer.bankName}%`]);
                    if (bankAccounts[0]) {
                        bankAccountId = bankAccounts[0].id;
                        bankAccountName = bankAccounts[0].name;
                    }
                }
                // Fallback to generic bank account
                if (!bankAccountId) {
                    const [bankAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '102%' OR name LIKE '%بنك%' LIMIT 1`, []);
                    if (bankAccounts[0]) {
                        bankAccountId = bankAccounts[0].id;
                        bankAccountName = bankAccounts[0].name;
                    }
                }
                // Get partner account (Receivables for RECEIPT, Payables for PAYMENT)
                // Account codes: 104 = AR (العملاء), 201 = AP (الموردين)
                const transferPartnerAccountCode = transferPaymentType === 'RECEIPT' ? '104%' : '201%';
                let [transferPartnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [transferPartnerAccountCode]);
                // Fallback: search by name
                if (transferPartnerAccounts.length === 0) {
                    const searchName = transferPaymentType === 'RECEIPT' ? '%عملاء%' : '%موردين%';
                    [transferPartnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [searchName]);
                }
                const transferPartnerAccount = transferPartnerAccounts[0];
                if (bankAccountId && transferPartnerAccount) {
                    // Create journal entry header
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate) 
                         VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                        transferJournalId,
                        date,
                        `${transferPaymentType === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} #${transferNumber} - ${partnerName} - تحويل بنكي مع الفاتورة ${invoiceNumber}`,
                        transferPaymentId,
                        createdBy,
                        req.body.currencyCode || 'EGP',
                        req.body.exchangeRate || 1
                    ]);
                    // PERF: Batch journal lines — single INSERT with 2 rows
                    const tCCode = req.body.currencyCode || 'EGP';
                    const tExRate = req.body.exchangeRate || 1;
                    const tFAmt = transfer.amount / tExRate;
                    const tJLines = transferPaymentType === 'RECEIPT'
                        ? [
                            [transferJournalId, bankAccountId, bankAccountName, transfer.amount, 0, tCCode, tExRate, tFAmt, 0],
                            [transferJournalId, transferPartnerAccount.id, transferPartnerAccount.name, 0, transfer.amount, tCCode, tExRate, 0, tFAmt]
                        ]
                        : [
                            [transferJournalId, transferPartnerAccount.id, transferPartnerAccount.name, transfer.amount, 0, tCCode, tExRate, tFAmt, 0],
                            [transferJournalId, bankAccountId, bankAccountName, 0, transfer.amount, tCCode, tExRate, 0, tFAmt]
                        ];
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [tJLines]);
                    console.log(`📒 Bank transfer journal entry ${transferJournalId} created`);
                }
                // Update bank balance if we have bankId
                if (transfer.bankId) {
                    const balanceChange = transferPaymentType === 'RECEIPT' ? transfer.amount : -transfer.amount;
                    // REMOVED: Banks balance is now calculated live from GL/journal lines
                    console.log(`🏦 Bank ${transfer.bankId} GL updated by ${balanceChange}`);
                }
                console.log(`✅ Bank transfer payment ${transferNumber} created for ${transfer.amount}`);
                // Log audit trail for bank transfer
                yield (0, auditController_1.logAction)(createdBy || 'System', transferPaymentType, 'CREATE', `Created bank transfer ${transferPaymentType} #${transferNumber} with Invoice ${invoiceNumber}`, `Partner: ${partnerName}, Amount: ${transfer.amount}, Bank: ${transfer.bankName || '-'}`);
            }
        }
        // === UPDATE SALESMAN TARGET ACHIEVEMENTS ===
        // DEPRECATED: Targets are now calculated dynamically on read (see salesmanTargetController.ts)
        // No need to update 'achievedQuantity' or 'achievedAmount' physically anymore.
        // Log audit trail
        yield (0, auditController_1.logAction)(createdBy || 'System', 'INVOICE', 'CREATE', `Created ${type} Invoice #${invoiceNumber}`, `Partner: ${partnerName}, Amount: ${total}, Payment: ${paymentMethod}`);
        // =====================================================
        // === STANDALONE RECEIPT/PAYMENT JOURNAL ENTRIES ===
        // When creating a standalone payment/receipt (not tied to a specific invoice lines payload), 
        // we must manually generate its GL and account transaction entries.
        // This MUST be done because syncRevenueCogsJournal ignores 'PAYMENT' and 'RECEIPT' types.
        if (type === 'RECEIPT' || type === 'PAYMENT') {
            const standaloneTotal = Number(total) || 0;
            const pmMethod = req.body.paymentMethod || 'CASH';
            const pmBankAccountId = req.body.bankAccountId || null;
            console.log(`💰 Creating standalone ${type} #${invoiceNumber} GL entries. Amount: ${standaloneTotal}`);
            // 1. Create account_transactions
            yield conn.query(`INSERT INTO account_transactions (
                    id, date, type, partnerId, partnerName, debit, credit, description, invoiceId, createdBy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                (0, crypto_1.randomUUID)(), date, type, partnerId, partnerName,
                type === 'PAYMENT' ? standaloneTotal : 0, // Debit for PAYMENT
                type === 'RECEIPT' ? standaloneTotal : 0, // Credit for RECEIPT
                `${type === 'RECEIPT' ? 'مقبوض' : 'دفع'} (مستقل) ${invoiceNumber}`,
                id, createdBy
            ]);
            // 2. Create journal entries
            // Handle negative amounts: a negative PAYMENT is effectively a RECEIPT (money back from supplier)
            // Use absolute value for journal amounts and reverse debit/credit when negative
            const absTotal = Math.abs(standaloneTotal);
            const isReversed = standaloneTotal < 0; // Negative amount reverses the flow
            if (absTotal > 0) {
                const journalId = (0, crypto_1.randomUUID)();
                // Determine account codes based on PaymentMethod
                let paymentAccountCode = '101%';
                let paymentAccountName = 'الصندوق';
                if (pmMethod === 'BANK') {
                    if (pmBankAccountId) {
                        const [bankAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [pmBankAccountId]);
                        if (bankAccounts[0]) {
                            paymentAccountCode = bankAccounts[0].id;
                            paymentAccountName = bankAccounts[0].name;
                        }
                    }
                    else {
                        paymentAccountCode = '102%';
                        paymentAccountName = 'البنك';
                    }
                }
                else if (pmMethod === 'CHEQUE') {
                    paymentAccountCode = type === 'RECEIPT' ? '106%' : '203%';
                    paymentAccountName = type === 'RECEIPT' ? 'أوراق قبض' : 'أوراق دفع';
                }
                // Get treasury account
                let [paymentAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? OR id = ? LIMIT 1`, [paymentAccountCode, paymentAccountCode]);
                if (paymentAccounts.length === 0) {
                    const searchName = pmMethod === 'CASH' ? '%خزينة%' : '%بنك%';
                    [paymentAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [searchName]);
                }
                let pAcc = paymentAccounts[0];
                // Fallback for extreme cases to prevent silent GL deletion
                if (!pAcc) {
                    const [fallbackCash] = yield conn.query(`SELECT id, name FROM accounts LIMIT 1`);
                    pAcc = fallbackCash[0];
                    console.error(`⚠️ Extreme fallback used for Payment Account in createInvoice!`);
                }
                // Get partner account
                const partnerAccountCode = type === 'RECEIPT' ? '104%' : '201%';
                let [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [partnerAccountCode]);
                if (partnerAccounts.length === 0) {
                    const searchName = type === 'RECEIPT' ? '%عملاء%' : '%موردين%';
                    [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [searchName]);
                }
                let ptAcc = partnerAccounts[0];
                // Fallback for extreme cases to prevent silent GL deletion
                if (!ptAcc) {
                    const searchNameFallback = type === 'RECEIPT' ? '%إيرادات%' : '%مصروفات%';
                    const [fallbackPartner] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [searchNameFallback]);
                    ptAcc = fallbackPartner[0] || pAcc;
                    console.error(`⚠️ Extreme fallback used for Partner Account in createInvoice!`);
                }
                if (pAcc && ptAcc) {
                    const methodLabel = pmMethod === 'CASH' ? 'نقدي' : pmMethod === 'BANK' ? 'تحويل بنكي' : 'شيك';
                    const reversedLabel = isReversed ? ' (عكسي)' : '';
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, denominations) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                        journalId, date,
                        `${type === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} #${invoiceNumber} - ${partnerName} (${methodLabel})${reversedLabel}`,
                        id, createdBy,
                        req.body.currencyCode || 'EGP', req.body.exchangeRate || 1,
                        req.body.denominations ? JSON.stringify(req.body.denominations) : null
                    ]);
                    const exRate = req.body.exchangeRate || 1;
                    const cCode = req.body.currencyCode || 'EGP';
                    const fAmount = absTotal / exRate;
                    // Determine effective direction:
                    // Normal RECEIPT: Dr Treasury, Cr Partner (money in)
                    // Normal PAYMENT: Dr Partner, Cr Treasury (money out)
                    // Negative PAYMENT (isReversed): Dr Treasury, Cr Partner (money back from supplier)
                    // Negative RECEIPT (isReversed): Dr Partner, Cr Treasury (money returned to customer)
                    const effectiveIsReceipt = isReversed ? (type !== 'RECEIPT') : (type === 'RECEIPT');
                    if (effectiveIsReceipt) {
                        // Effective Receipt: Debit Treasury, Credit Partner
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, pAcc.id, pAcc.name, absTotal, 0, cCode, exRate, fAmount, 0]);
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, ptAcc.id, ptAcc.name, 0, absTotal, cCode, exRate, 0, fAmount]);
                    }
                    else {
                        // Effective Payment: Debit Partner, Credit Treasury
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, ptAcc.id, ptAcc.name, absTotal, 0, cCode, exRate, fAmount, 0]);
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, pAcc.id, pAcc.name, 0, absTotal, cCode, exRate, 0, fAmount]);
                    }
                    if (isReversed) {
                        console.log(`🔄 Reversed ${type} #${invoiceNumber}: negative amount ${standaloneTotal} → journal uses abs(${absTotal}) with flipped debit/credit`);
                    }
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
                console.log(`✅ [createInvoice] Auto-updated ${balanceResult.updatedCount} account balances`);
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
                console.log(`💰 [HR] Created employee advance: ${advanceId} for employee ${originalPartnerId}, amount: ${total}`);
            }
            catch (advErr) {
                console.error('⚠️ Error creating employee advance from voucher:', advErr.message);
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
                    console.log(`💰 [HR] Advance ${adv.id}: repaid ${canApply}, remaining: ${newRemaining}`);
                    remaining -= canApply;
                }
                if (remaining > 0) {
                    console.warn(`⚠️ [HR] Employee ${originalPartnerId} repaid ${total} but only ${total - remaining} could be allocated to active advances`);
                }
            }
            catch (repayErr) {
                console.error('⚠️ Error processing advance repayment from voucher:', repayErr.message);
            }
        }
        yield conn.commit();
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoice', updatedBy: user });
        // Check memberships
        yield (0, memberships_1.checkAndActivateMembership)(id, conn);
        if (type === 'RECEIPT' && req.body.sourceInvoiceId) {
            yield (0, memberships_1.checkAndActivateMembership)(req.body.sourceInvoiceId, conn);
        }
        else if (type === 'RECEIPT' && req.body.referenceInvoiceId) {
            yield (0, memberships_1.checkAndActivateMembership)(req.body.referenceInvoiceId, conn);
        }
        res.status(201).json(Object.assign({ id, number: invoiceNumber }, req.body));
        // ── WhatsApp Notification (fire-and-forget, never blocks response) ──
        // TODO: triggerInvoiceWhatsApp not yet implemented — uncomment when WhatsApp integration is ready
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
// ═══════════════════════════════════════════════════════════
// PERF: Batch version of getCustomerLastProductPrice
// Instead of N individual API calls (one per line item), the frontend
// sends all productIds at once and gets all last prices in a single query.
// For a 15-line invoice, this reduces 15 HTTP round-trips → 1.
// ═══════════════════════════════════════════════════════════
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
        // Build a map: productId → last price data
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
// GET /api/invoices/outstanding/:partnerId - Get outstanding (unpaid) invoices for a partner
// Used by Receipt Voucher to link payments to specific invoices (ربط المقبوضات بالفواتير)
// Optional query param: ?type=INVOICE_SALE or ?type=INVOICE_PURCHASE
const getOutstandingInvoices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { partnerId } = req.params;
        const invoiceType = req.query.type || 'INVOICE_SALE';
        if (!partnerId) {
            return res.status(400).json({ message: 'Partner ID is required' });
        }
        const conn = yield (0, db_1.getConnection)();
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
            WHERE i.partnerId = ?
              AND i.type = ?
              AND i.status NOT IN ('DRAFT', 'VOID')
              AND (i.total - COALESCE(pa_sum.allocatedAmount, 0)) > 0.01
            ORDER BY i.date ASC, i.number ASC
        `, [partnerId, invoiceType]);
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
    var _a, _b;
    const conn = yield (0, db_1.getConnection)();
    try {
        const invoiceId = req.params.id;
        // Invalidate dedup cache on mutation
        invoiceByIdCache.delete(invoiceId);
        (0, logger_1.logDebug)('🚀 [updateInvoice] Called for ID:', invoiceId);
        // PERF: Removed JSON.stringify(req.body) — was serializing ~100KB+ synchronously
        (0, logger_1.logDebug)('🏦 [updateInvoice] bankTransfers:', ((_a = req.body.bankTransfers) === null || _a === void 0 ? void 0 : _a.length) || 0);
        (0, logger_1.logDebug)('💰 [updateInvoice] partialPaymentMethod:', req.body.partialPaymentMethod);
        const authReq = req;
        const user = authReq.user;
        const createdBy = (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) || req.body.user || 'System';
        // Get existing invoice
        const [existing] = yield conn.query('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        const existingInvoice = existing[0];
        const invoiceNumber = existingInvoice.number || req.body.number || invoiceId; // Fallback to ID if number is null
        let { date: rawDate, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, dueDate, taxAmount, whtAmount, shippingFee, globalDiscount, lines, salesmanId, number } = req.body;
        // TIMEZONE FIX: Pad date-only strings to prevent midnight UTC → previous day in Egypt
        const date = toMySQLDateTime(rawDate) || rawDate;
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
                // Credit back old quantities during stock validation — the update
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
            (0, logger_1.logDebug)(`✅ Invoice update total validated: ${validation.calculated}`);
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
        const [updateResult] = yield conn.query(`UPDATE invoices SET
                date = ?, type = ?, partnerId = ?, partnerName = ?,
                total = ?, status = ?, paymentMethod = ?, posted = ?,
                notes = ?, dueDate = ?, taxAmount = ?, whtAmount = ?,
                shippingFee = ?, globalDiscount = ?, globalDiscountType = ?, globalDiscountValue = ?, warehouseId = ?,
                bankAccountId = ?, bankName = ?, salesmanId = ?, priceListId = ?, paidAmount = ?,
                paymentBreakdown = ?, bankTransfers = ?,
                currencyCode = ?, exchangeRate = ?, foreignTotal = ?,
                bankTransferReference = ?,
                referenceInvoiceId = ?
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
            invoiceId
        ]);
        // ═══════════════════════════════════════════════════════════
        // CHEQUES: Sync transactionCheques for RECEIPT/PAYMENT edits
        // Delete existing cheques for this transaction, then re-insert.
        // ═══════════════════════════════════════════════════════════
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
        const oldWasPosted = existingInvoice.status === 'POSTED';
        const newIsPosted = status === 'POSTED';
        let oldLines = [];
        if (stockMultiplierForType !== undefined) {
            const [oldLineRows] = yield conn.query('SELECT productId, quantity, bonusQty, warehouseId, returnCondition, variantId FROM invoice_lines WHERE invoiceId = ?', [invoiceId]);
            oldLines = oldLineRows;
            // REVERSE old stock changes — ONLY if old invoice was POSTED
            // If old was DRAFT, no stock was ever deducted, so nothing to reverse
            if (oldWasPosted) {
                const isReturnType = type === 'RETURN_SALE' || type === 'RETURN_PURCHASE';
                for (const oldLine of oldLines) {
                    // Skip DAMAGED returns — they had 0 stock change, so nothing to reverse
                    const wasOldDamaged = isReturnType && oldLine.returnCondition === 'DAMAGED';
                    if (wasOldDamaged) {
                        (0, logger_1.logDebug)(`🔄 [updateInvoice] Skipping reversal for DAMAGED item: ${oldLine.productId}`);
                        continue;
                    }
                    const oldQty = Number(oldLine.quantity) || 0;
                    const oldBonusQty = Number(oldLine.bonusQty) || 0;
                    const oldTotalQty = oldQty + oldBonusQty;
                    const oldChange = Number((oldTotalQty * stockMultiplierForType).toFixed(5));
                    const reverseChange = -oldChange; // Undo the original change
                    const oldWarehouseId = oldLine.warehouseId || existingInvoice.warehouseId;
                    // Reverse global product stock
                    yield conn.query('UPDATE products SET stock = ROUND(stock + ?, 5) WHERE id = ?', [reverseChange, oldLine.productId]);
                    // Reverse warehouse-level stock
                    if (oldWarehouseId) {
                        yield conn.query('UPDATE product_stocks SET stock = ROUND(stock + ?, 5) WHERE productId = ? AND warehouseId = ?', [reverseChange, oldLine.productId, oldWarehouseId]);
                    }
                    (0, logger_1.logDebug)(`🔄 [updateInvoice] Reversed old stock: ${oldLine.productId} ${reverseChange > 0 ? '+' : ''}${reverseChange}`);
                    // Reverse variant stock if applicable
                    if (oldLine.variantId && !wasOldDamaged) {
                        yield conn.query(`UPDATE product_variants SET stock = ROUND(COALESCE(stock, 0) + ?, 5) WHERE id = ?`, [reverseChange, oldLine.variantId]).catch(() => { });
                        if (oldWarehouseId) {
                            yield conn.query(`UPDATE product_variant_stocks SET stock = ROUND(stock + ?, 5) WHERE variantId = ? AND warehouseId = ?`, [reverseChange, oldLine.variantId, oldWarehouseId]).catch(() => { });
                        }
                    }
                }
            }
            else {
                (0, logger_1.logDebug)(`ℹ️ [updateInvoice] Old invoice was DRAFT — skipping stock reversal`);
            }
        }
        // Update lines - delete and re-insert
        yield conn.query('DELETE FROM invoice_lines WHERE invoiceId = ?', [invoiceId]);
        if (lines && lines.length > 0) {
            // ═══════════════════════════════════════════════════════════
            // PERF: Batch INSERT all invoice_lines in one query
            // (same optimization applied to createInvoice earlier)
            // ═══════════════════════════════════════════════════════════
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
                batchLineValues.push([
                    invoiceId, line.productId, line.productName, qty, price, cost, disc, total,
                    sanitizedLineWarehouseId, lineBonusQty, gradeValue, returnConditionValue,
                    line.priceListId || null, line.variantId || null
                ]);
                // Update product cost if purchase (must remain sequential due to FOR UPDATE row locks)
                if (type === 'INVOICE_PURCHASE' && qty > 0) {
                    const [prodRows] = yield conn.query('SELECT stock, cost FROM products WHERE id = ? FOR UPDATE', [line.productId]);
                    let oldStock = 0;
                    let oldCost = 0;
                    if (prodRows.length > 0) {
                        oldStock = Number(prodRows[0].stock) || 0;
                        oldCost = Number(prodRows[0].cost) || 0;
                    }
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
                        if (oldStock <= 0) {
                            newCost = unitPurchasePrice;
                        }
                        else {
                            const newTotalStock = oldStock + qty;
                            newCost = ((oldStock * oldCost) + (qty * unitPurchasePrice)) / newTotalStock;
                        }
                    }
                    newCost = Number(newCost.toFixed(2));
                    yield conn.query('UPDATE products SET cost = ? WHERE id = ?', [newCost, line.productId]);
                    (0, logger_1.logDebug)(`💰 Product cost updated (Edit): ${line.productName} -> ${newCost} (${inventoryValuationMethod})`);
                }
            }
            // PERF: Batch INSERT all lines in one query
            if (batchLineValues.length > 0) {
                try {
                    yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, warehouseId, bonusQty, grade, returnCondition, priceListId, variantId)
                         VALUES ?`, [batchLineValues]);
                }
                catch (ilErr) {
                    // Fallback: insert without warehouseId/bonusQty if columns don't exist
                    (0, logger_1.logDebug)('⚠️ Batch insert failed, falling back to minimal columns:', ilErr.message);
                    const minimalValues = batchLineValues.map(v => [v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[12]]);
                    yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, priceListId)
                         VALUES ?`, [minimalValues]);
                }
            }
            // === APPLY NEW STOCK + SYNC STOCK MOVEMENTS ===
            if (stockMultiplierForType !== undefined) {
                yield conn.query('DELETE FROM stock_movements WHERE reference_id = ?', [invoiceId]);
                if (!newIsPosted) {
                    (0, logger_1.logDebug)(`ℹ️ [updateInvoice] New status is DRAFT — skipping stock application`);
                }
                // Apply new stock changes and recreate stock movements — ONLY if POSTED
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
                        const rawQty = Number(line.quantity);
                        const qty = !isNaN(rawQty) ? Number(rawQty.toFixed(5)) : 0;
                        const movBonusQty = Number(line.bonusQty) || 0;
                        const totalQtyForMovement = qty + movBonusQty;
                        const lineWarehouseId = line.warehouseId && typeof line.warehouseId === 'string' ? line.warehouseId.substring(0, 36) : null;
                        const warehouseIdToUse = lineWarehouseId || sanitizedWarehouseId;
                        const isReturn = type === 'RETURN_SALE' || type === 'RETURN_PURCHASE';
                        const isDamaged = isReturn && line.returnCondition === 'DAMAGED';
                        const qtyChange = isDamaged ? 0 : Number((totalQtyForMovement * stockMultiplierForType).toFixed(5));
                        // Apply stock changes (must remain sequential — per-product UPDATE)
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
                        const rawQty = Number(line.quantity);
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
                        yield conn.query(`UPDATE product_variants SET stock = CASE ${vCases.join(' ')} ELSE stock END WHERE id IN (?)`, [...vParams, variantIds]).catch((e) => (0, logger_1.logDebug)(`⚠️ Variant stock update note: ${e.message}`));
                    }
                    for (const u of variantWarehouseUpdates) {
                        yield conn.query(`INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock)
                             VALUES (UUID(), ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE stock = ROUND(stock + ?, 5)`, [u.variantId, u.productId, u.warehouseId, u.qtyChange, u.qtyChange]).catch((e) => (0, logger_1.logDebug)(`⚠️ Variant warehouse stock note: ${e.message}`));
                    }
                } // end if (newIsPosted)
            }
        }
        // === PAYMENT WITH INVOICE UPDATE LOGIC ===
        // For CASH payments (نقدي), auto-sync payment amount to invoice total
        // For CREDIT (آجل) or partial payments, use the explicit paymentCollected value
        let paymentCollected = Number(req.body.paymentCollected || 0);
        // Auto-sync for CASH: if paymentMethod is CASH and not explicitly آجل, payment = total
        const isCashPayment = paymentMethod === 'CASH' && !req.body.isCredit;
        const invoiceTotal = Number(total || 0);
        // ═══════════════════════════════════════════════════════════════════
        // BUG FIX: CASH invoices should NOT have a receipt record.
        // The balance SQL excludes CASH invoices from the customer debt ledger,
        // so a receipt would cause a phantom credit balance.
        // If a receipt exists (from before this fix), delete it.
        // ═══════════════════════════════════════════════════════════════════
        if (isCashPayment && partnerId) {
            // Find and delete any existing orphaned receipt for this CASH invoice
            const [orphanedPayments] = yield conn.query(`SELECT id, number FROM invoices 
                 WHERE (sourceInvoiceId = ? OR referenceInvoiceId = ?)
                 AND (type = 'RECEIPT' OR type = 'PAYMENT')
                 ORDER BY id DESC LIMIT 1`, [invoiceId, invoiceId]);
            const orphanedPayment = orphanedPayments[0];
            if (orphanedPayment) {
                (0, logger_1.logDebug)(`🗑️ CASH invoice: Deleting orphaned receipt ${orphanedPayment.number}`);
                yield conn.query('DELETE FROM journal_lines WHERE journalId IN (SELECT id FROM journal_entries WHERE referenceId = ?)', [orphanedPayment.number]);
                yield conn.query('DELETE FROM journal_entries WHERE referenceId = ?', [orphanedPayment.number]);
                yield conn.query('DELETE FROM account_transactions WHERE invoiceId = ?', [orphanedPayment.id]);
                yield conn.query('DELETE FROM invoices WHERE id = ?', [orphanedPayment.id]);
                (0, logger_1.logDebug)(`✅ Orphaned receipt deleted for CASH invoice`);
            }
            // ═══════════════════════════════════════════════════════════════════
            // FIX: Sync the CASH invoice's treasury journal entry IN-PLACE.
            // Instead of deleting + recreating with a different description pattern
            // (which caused phantom duplicates), we UPDATE the existing entry's
            // amounts to match the current invoice total.
            // The original entry uses "فاتورة مبيعات نقدي #INV-xxx" and we KEEP
            // that description so treasury category filters continue to work.
            // ═══════════════════════════════════════════════════════════════════
            const cashJournalTotal = invoiceTotal;
            if (cashJournalTotal > 0) {
                // Determine the expected description prefix (same as create path)
                let descPrefix = 'فاتورة مبيعات نقدي';
                if (type === 'RETURN_SALE')
                    descPrefix = 'مرتجع مبيعات نقدي';
                else if (type === 'RETURN_PURCHASE')
                    descPrefix = 'مرتجع مشتريات نقدي';
                else if (type === 'INVOICE_PURCHASE')
                    descPrefix = 'فاتورة مشتريات نقدي';
                const exRate = req.body.exchangeRate || 1;
                const cCode = req.body.currencyCode || 'EGP';
                const fAmt = cashJournalTotal / exRate;
                // Step 1: Clean up any OLD phantom "متحصلات نقدية" entries for this invoice
                // These were created by the old code path and are redundant
                yield conn.query(`DELETE FROM journal_lines WHERE journalId IN (
                        SELECT id FROM journal_entries 
                        WHERE (referenceId = ? OR referenceId = ?)
                        AND (description LIKE '%متحصلات نقدية%' OR description LIKE '%مدفوعات نقدية%')
                    )`, [invoiceNumber, invoiceId]);
                yield conn.query(`DELETE FROM journal_entries 
                     WHERE (referenceId = ? OR referenceId = ?)
                     AND (description LIKE '%متحصلات نقدية%' OR description LIKE '%مدفوعات نقدية%')`, [invoiceNumber, invoiceId]);
                // Step 2: Find the ORIGINAL treasury journal entry (created by createInvoice)
                // Match by referenceId (invoice UUID) and description pattern
                const [existingJournals] = yield conn.query(`SELECT id FROM journal_entries 
                     WHERE referenceId = ?
                     AND (description LIKE '%مبيعات نقدي%' OR description LIKE '%مشتريات نقدي%' OR description LIKE '%مرتجع%نقدي%')
                     LIMIT 1`, [invoiceId]);
                if (existingJournals.length > 0) {
                    // UPDATE existing entry in-place — preserve description, just fix amounts
                    const existingId = existingJournals[0].id;
                    // Update description to reflect current partner name and invoice number
                    yield conn.query(`UPDATE journal_entries SET description = ?, date = ? WHERE id = ?`, [`${descPrefix} #${invoiceNumber} - ${partnerName}`, date, existingId]);
                    // Update journal line amounts (debit line = cash, credit line = partner)
                    // For RECEIPT: Dr Cash (debit>0), Cr Receivables (credit>0)
                    // For PAYMENT: Dr Payables (debit>0), Cr Cash (credit>0)
                    yield conn.query(`UPDATE journal_lines SET debit = ?, foreignDebit = ? WHERE journalId = ? AND debit > 0`, [cashJournalTotal, fAmt, existingId]);
                    yield conn.query(`UPDATE journal_lines SET credit = ?, foreignCredit = ? WHERE journalId = ? AND credit > 0`, [cashJournalTotal, fAmt, existingId]);
                    (0, logger_1.logDebug)(`📒 [updateInvoice] Cash treasury journal UPDATED in-place: ${existingId} for invoice ${invoiceNumber} (${cashJournalTotal})`);
                }
                else {
                    // No existing entry found — create one (same pattern as createInvoice)
                    let [cashAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '101%' LIMIT 1`);
                    if (cashAccRows.length === 0) {
                        [cashAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%خزينة%' OR name LIKE '%صندوق%' LIMIT 1`);
                    }
                    const cashAcc = cashAccRows[0];
                    const cashPaymentType = (type === 'INVOICE_SALE' || type === 'RETURN_PURCHASE') ? 'RECEIPT' : 'PAYMENT';
                    const isSaleRelated = (type === 'INVOICE_SALE' || type === 'RETURN_SALE');
                    const partnerCode = isSaleRelated ? '104%' : '201%';
                    let [partnerAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [partnerCode]);
                    if (partnerAccRows.length === 0) {
                        const fallbackName = cashPaymentType === 'RECEIPT' ? '%عملاء%' : '%موردين%';
                        [partnerAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [fallbackName]);
                    }
                    const partnerAcc = partnerAccRows[0];
                    if (cashAcc && partnerAcc) {
                        const newJournalId = (0, crypto_1.randomUUID)();
                        yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, denominations)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                            newJournalId, date,
                            `${descPrefix} #${invoiceNumber} - ${partnerName}`,
                            invoiceId, createdBy, cCode, exRate,
                            req.body.denominations ? JSON.stringify(req.body.denominations) : null
                        ]);
                        if (cashPaymentType === 'RECEIPT') {
                            yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [newJournalId, cashAcc.id, cashAcc.name, cashJournalTotal, 0, cCode, exRate, fAmt, 0]);
                            yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [newJournalId, partnerAcc.id, partnerAcc.name, 0, cashJournalTotal, cCode, exRate, 0, fAmt]);
                        }
                        else {
                            yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [newJournalId, partnerAcc.id, partnerAcc.name, cashJournalTotal, 0, cCode, exRate, fAmt, 0]);
                            yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [newJournalId, cashAcc.id, cashAcc.name, 0, cashJournalTotal, cCode, exRate, 0, fAmt]);
                        }
                        (0, logger_1.logDebug)(`📒 [updateInvoice] Cash treasury journal CREATED (no prior entry): ${newJournalId} for invoice ${invoiceNumber} (${cashJournalTotal})`);
                    }
                    else {
                        console.warn(`⚠️ [updateInvoice] Could not find Cash or Partner account to create cash journal for invoice ${invoiceNumber}`);
                    }
                }
            }
            // Skip receipt creation/update for CASH invoices
            paymentCollected = 0;
        }
        else if (isCashPayment && paymentCollected !== invoiceTotal) {
            (0, logger_1.logDebug)(`💵 CASH payment auto-sync: ${paymentCollected} → ${invoiceTotal}`);
            paymentCollected = invoiceTotal;
        }
        if (partnerId && !isCashPayment) {
            // 1. Fetch ALL existing INLINE payments (DO NOT touch standalone receipts - use sourceInvoiceId only)
            const [existingPayments] = yield conn.query(`SELECT * FROM invoices \n                 WHERE sourceInvoiceId = ?\n                 AND (type = \'RECEIPT\' OR type = \'PAYMENT\')`, [invoiceId]);
            // 2. Delete ALL existing inline payments cleanly
            for (const ep of existingPayments) {
                (0, logger_1.logDebug)(`🗑️ Deleting old inline payment ${ep.number}`);
                yield conn.query('DELETE FROM journal_lines WHERE journalId IN (SELECT id FROM journal_entries WHERE referenceId = ?)', [ep.number]);
                yield conn.query('DELETE FROM journal_entries WHERE referenceId = ?', [ep.number]);
                yield conn.query('DELETE FROM account_transactions WHERE invoiceId = ?', [ep.id]);
                yield conn.query('DELETE FROM invoices WHERE id = ?', [ep.id]);
            }
            // 3. Re-run Payment Generation using exact logic from createInvoice
            const isCashInvoice = false; // Always false here since we are in !isCashPayment block
            const mainPaymentMethodForReceipt = paymentMethod;
            if (paymentCollected > 0 && partnerId && !isCashInvoice) {
                (0, logger_1.logDebug)(`💰 Creating payment transaction for invoice ${invoiceNumber}: ${paymentCollected}`);
                // Determine payment type based on invoice type
                const paymentType = (type === 'INVOICE_SALE' || type === 'RETURN_PURCHASE')
                    ? 'RECEIPT' // مقبوض
                    : 'PAYMENT'; // دفع
                // Generate payment number
                const paymentPrefix = paymentType === 'RECEIPT' ? 'REC-' : 'PAY-';
                const paymentNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, paymentPrefix);
                const paymentId = paymentNumber; // SERIAL FIX: id === number for all PAY/REC
                // Create payment/receipt record with sourceInvoiceId for cascade delete
                // Sanitize warehouseId
                const sanitizedWarehouseId = req.body.warehouseId && typeof req.body.warehouseId === 'string'
                    ? req.body.warehouseId.substring(0, 36)
                    : null;
                // Build bankTransfers JSON for the receipt if payment method is BANK
                let receiptBankTransfers = null;
                if (req.body.partialPaymentMethod === 'BANK' && req.body.partialPaymentBankId) {
                    // Look up bank name
                    const [bankInfoRows] = yield conn.query(`SELECT id, name, accountId FROM banks WHERE id = ? LIMIT 1`, [req.body.partialPaymentBankId]);
                    const bankInfo = bankInfoRows[0];
                    receiptBankTransfers = JSON.stringify([{
                            bankName: (bankInfo === null || bankInfo === void 0 ? void 0 : bankInfo.name) || '',
                            bankId: req.body.partialPaymentBankId,
                            amount: paymentCollected,
                            reference: '',
                            accountNumber: ''
                        }]);
                }
                yield conn.query(`INSERT INTO invoices (
                    id, number, date, type, partnerId, partnerName, 
                    total, status, paymentMethod, posted, notes, 
                    warehouseId, createdBy, sourceInvoiceId, relatedInvoiceIds, bankTransfers,
                    bankAccountId, bankName
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    paymentId,
                    paymentNumber,
                    date,
                    paymentType,
                    partnerId,
                    partnerName,
                    paymentCollected,
                    'POSTED',
                    req.body.partialPaymentMethod || 'CASH', // Use partial payment method (CASH/BANK/CHEQUE), not main invoice method
                    1, // posted = true
                    `دفعة مع الفاتورة ${invoiceNumber}`,
                    sanitizedWarehouseId, // Use sanitized warehouseId
                    createdBy,
                    invoiceId, // sourceInvoiceId - links to parent invoice for cascade delete
                    JSON.stringify([invoiceId]), // relatedInvoiceIds - legacy support
                    receiptBankTransfers, // Bank transfer details (null if not BANK)
                    // Set bankAccountId and bankName for the receipt UI to properly rehydrate the selected bank
                    req.body.partialPaymentMethod === 'BANK' ? (receiptBankTransfers ? JSON.parse(receiptBankTransfers)[0].bankId : null) : null,
                    req.body.partialPaymentMethod === 'BANK' ? (receiptBankTransfers ? JSON.parse(receiptBankTransfers)[0].bankName : null) : null
                ]);
                // Create account transaction for the payment
                yield conn.query(`INSERT INTO account_transactions (
                    id, date, type, partnerId, partnerName, 
                    debit, credit, description, invoiceId, createdBy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    (0, crypto_1.randomUUID)(),
                    date,
                    paymentType,
                    partnerId,
                    partnerName,
                    paymentType === 'PAYMENT' ? paymentCollected : 0, // Debit for payments (we paid)
                    paymentType === 'RECEIPT' ? paymentCollected : 0, // Credit for receipts (we received)
                    `${paymentType === 'RECEIPT' ? 'مقبوض' : 'دفع'} مع الفاتورة ${invoiceNumber}`,
                    paymentId,
                    createdBy
                ]);
                // === CREATE JOURNAL ENTRY FOR TREASURY JOURNAL ===
                // This ensures the payment appears in يومية الخزينة (Treasury Journal)
                // Create payment journal for:
                // 1. CREDIT invoices with partial payment (legacy behavior)  
                // 2. ANY invoice with denomination data (so denomination report works)
                const mainPaymentMethod = req.body.paymentMethod || 'CASH';
                const hasDenominations = req.body.denominations && Object.values(req.body.denominations).some((v) => Number(v) > 0);
                const shouldCreatePaymentJournal = paymentCollected > 0 && (mainPaymentMethod === 'CREDIT' || hasDenominations);
                console.log(`💎 [DENOM DEBUG] paymentCollected=${paymentCollected}, mainPaymentMethod=${mainPaymentMethod}, hasDenominations=${hasDenominations}, shouldCreatePaymentJournal=${shouldCreatePaymentJournal}`);
                console.log(`💎 [DENOM DEBUG] req.body.denominations=`, JSON.stringify(req.body.denominations));
                if (shouldCreatePaymentJournal) {
                    const journalId = (0, crypto_1.randomUUID)();
                    // Determine which account to use based on partialPaymentMethod (new field) or default to CASH
                    const partialPaymentMethod = req.body.partialPaymentMethod || 'CASH';
                    // Resolve payment account based on method:
                    // CASH → branch default treasury via resolveBranchCashAccount
                    // BANK → specific bank's GL account
                    // CHEQUE → Notes Receivable/Payable
                    let paymentAccount = null;
                    if (partialPaymentMethod === 'CASH') {
                        // Branch-aware: use the branch's default treasury GL account
                        paymentAccount = yield (0, branchFilter_1.resolveBranchCashAccount)(conn, req);
                    }
                    else if (partialPaymentMethod === 'BANK') {
                        if (req.body.partialPaymentBankId) {
                            const [bankRows] = yield conn.query(`SELECT id, name, accountId FROM banks WHERE id = ? LIMIT 1`, [req.body.partialPaymentBankId]);
                            const bank = bankRows[0];
                            if (bank === null || bank === void 0 ? void 0 : bank.accountId) {
                                const [glAccRows] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [bank.accountId]);
                                paymentAccount = glAccRows[0] || null;
                                if (!paymentAccount) {
                                    console.warn(`⚠️ Bank ${bank.name} accountId ${bank.accountId} — no GL match`);
                                }
                            }
                            else if (bank) {
                                console.warn(`⚠️ Bank ${bank.name} has no linked GL account`);
                                const [bankAccByName] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [`%${bank.name}%`]);
                                paymentAccount = bankAccByName[0] || null;
                            }
                        }
                        // Final bank fallback
                        if (!paymentAccount) {
                            const [fallback] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '102%' LIMIT 1`);
                            paymentAccount = fallback[0] || null;
                        }
                    }
                    else if (partialPaymentMethod === 'CHEQUE') {
                        const chequeCode = paymentType === 'RECEIPT' ? '106%' : '203%';
                        const [chequeAcc] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [chequeCode]);
                        paymentAccount = chequeAcc[0] || null;
                    }
                    // Get partner account (Receivables for RECEIPT, Payables for PAYMENT)
                    // Account codes: 104 = AR (العملاء), 201 = AP (الموردين)
                    const partnerAccountCode = paymentType === 'RECEIPT' ? '104%' : '201%';
                    let [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [partnerAccountCode]);
                    // Fallback: Try finding by name (Customers/Suppliers)
                    if (partnerAccounts.length === 0) {
                        const searchName = paymentType === 'RECEIPT' ? '%عملاء%' : '%موردين%';
                        console.log(`⚠️ Account ${partnerAccountCode} not found, trying name: ${searchName}`);
                        [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [searchName]);
                    }
                    const partnerAccount = partnerAccounts[0];
                    if (!paymentAccount)
                        console.warn(`❌ Could not find PAYMENT account for journal entry`);
                    if (!partnerAccount)
                        console.warn(`❌ Could not find PARTNER account for journal entry`);
                    console.log(`🔍 DEBUG: Resolved payment account for method '${partialPaymentMethod}':`, paymentAccount);
                    console.log(`🔍 DEBUG: Found partnerAccount:`, partnerAccount);
                    if (paymentAccount && partnerAccount) {
                        // Create journal entry header
                        const methodLabel = partialPaymentMethod === 'CASH' ? 'نقدي' :
                            partialPaymentMethod === 'BANK' ? 'تحويل بنكي' : 'شيك';
                        yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, denominations) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                            journalId,
                            date,
                            `${paymentType === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} #${paymentNumber} - ${partnerName} - دفعة مع الفاتورة ${invoiceNumber} (${methodLabel})`,
                            paymentId,
                            createdBy,
                            req.body.currencyCode || 'EGP',
                            req.body.exchangeRate || 1,
                            req.body.denominations ? JSON.stringify(req.body.denominations) : null
                        ]);
                        // PERF: Batch journal lines — single INSERT with 2 rows instead of 2 separate INSERTs
                        const cCode = req.body.currencyCode || 'EGP';
                        const exRate = req.body.exchangeRate || 1;
                        const fAmt = paymentCollected / exRate;
                        const jLines = paymentType === 'RECEIPT'
                            ? [
                                [journalId, paymentAccount.id, paymentAccount.name, paymentCollected, 0, cCode, exRate, fAmt, 0],
                                [journalId, partnerAccount.id, partnerAccount.name, 0, paymentCollected, cCode, exRate, 0, fAmt]
                            ]
                            : [
                                [journalId, partnerAccount.id, partnerAccount.name, paymentCollected, 0, cCode, exRate, fAmt, 0],
                                [journalId, paymentAccount.id, paymentAccount.name, 0, paymentCollected, cCode, exRate, 0, fAmt]
                            ];
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [jLines]);
                        console.log(`📒 Journal entry ${journalId} created for Treasury Journal (${methodLabel})`);
                        // Update bank balance for partial payments with BANK method
                        if (partialPaymentMethod === 'BANK' && req.body.partialPaymentBankId) {
                            // Find the bank by its linked GL account ID
                            const [bankRows] = yield conn.query(`SELECT id FROM banks WHERE accountId = ? LIMIT 1`, [req.body.partialPaymentBankId]);
                            const bankId = (_b = bankRows[0]) === null || _b === void 0 ? void 0 : _b.id;
                            if (bankId) {
                                // For RECEIPT: money comes IN (positive), for PAYMENT: money goes OUT (negative)
                                const balanceChange = paymentType === 'RECEIPT' ? paymentCollected : -paymentCollected;
                                // REMOVED: Banks balance is now calculated live from GL/journal lines
                                console.log(`🏦 Bank ${bankId} GL updated by ${balanceChange} (partial payment)`);
                            }
                        }
                    }
                    else {
                        console.warn('⚠️ Could not find payment/partner accounts for journal entry');
                    }
                }
                console.log(`✅ Payment ${paymentNumber} created and linked to invoice ${invoiceNumber}`);
                // Log audit trail for payment
                yield (0, auditController_1.logAction)(createdBy || 'System', paymentType, 'CREATE', `Created ${paymentType} #${paymentNumber} with Invoice ${invoiceNumber}`, `Partner: ${partnerName}, Amount: ${paymentCollected}`);
            }
            // ═══════════════════════════════════════════════════════════════════
            // BUG FIX: CASH INVOICE TREASURY JOURNAL ENTRY
            // We disabled RECEIPT/Payment generation for CASH invoices above, BUT
            // we STILL need to record the cash flow in the GL (Treasury Journal)!
            // This ensures the cash hits the 101% account and shows up in the Treasury.
            // ═══════════════════════════════════════════════════════════════════
            // BUG FIX: Use the invoice TOTAL, not paymentCollected, for the treasury journal amount.
            // paymentCollected may be stale (React useEffect race) when the user adds discounts/additions
            // and saves immediately. The invoice `total` is the authoritative value — it ALWAYS includes
            // discounts, additions, tax, shipping, and is computed synchronously.
            // BUG FIX: EXCLUDE standalone RECEIPT/PAYMENT types — they create their OWN journal
            // at line ~2096 with correct "سند صرف"/"سند قبض" descriptions. Without this guard,
            // cash PAY/REC entries get a DUPLICATE journal with wrong "فاتورة مبيعات نقدي" label,
            // doubling the financial impact on GL accounts.
            const cashJournalAmount = Number(total) || paymentCollected;
            if (cashJournalAmount > 0 && partnerId && isCashInvoice && type !== 'RECEIPT' && type !== 'PAYMENT') {
                (0, logger_1.logDebug)(`💰 Creating Treasury Journal entry for CASH invoice ${invoiceNumber}: ${cashJournalAmount} (total=${total}, paymentCollected=${paymentCollected})`);
                // Determine payment type based on invoice type
                const paymentType = (type === 'INVOICE_SALE' || type === 'RETURN_PURCHASE') ? 'RECEIPT' : 'PAYMENT';
                const journalId = (0, crypto_1.randomUUID)();
                // 1. Get Cash Account — branch-aware: uses branch's default treasury
                const paymentAccount = yield (0, branchFilter_1.resolveBranchCashAccount)(conn, req);
                // 2. Get Partner Receivable/Payable account 
                // (We MUST credit Receivables since the Revenue Journal debited it!)
                // BUG FIX: RETURN_SALE should also use Receivables (104) not Payables (201).
                // The revenue journal created Dr Revenue, Cr Receivables — the cash refund
                // must settle against Receivables: Dr Receivables (104), Cr Cash (101).
                const isSaleRelated = (type === 'INVOICE_SALE' || type === 'RETURN_SALE');
                const partnerAccountCode = isSaleRelated ? '104%' : '201%';
                let [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [partnerAccountCode]);
                if (partnerAccounts.length === 0) {
                    const searchName = paymentType === 'RECEIPT' ? '%عملاء%' : '%موردين%';
                    [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [searchName]);
                }
                const partnerAccount = partnerAccounts[0];
                if (paymentAccount && partnerAccount) {
                    // Determine description prefix - MUST match legacy pattern for treasury category filters
                    // Sales: "فاتورة مبيعات نقدي" matches "مبيعات نقدية" category
                    // Returns: "مرتجع مبيعات نقدي" matches "مبيعات نقدية" category  
                    // Purchases: "فاتورة مشتريات نقدي" for purchase invoices
                    let descPrefix = 'فاتورة مبيعات نقدي';
                    if (type === 'RETURN_SALE')
                        descPrefix = 'مرتجع مبيعات نقدي';
                    else if (type === 'RETURN_PURCHASE')
                        descPrefix = 'مرتجع مشتريات نقدي';
                    else if (type === 'INVOICE_PURCHASE')
                        descPrefix = 'فاتورة مشتريات نقدي';
                    // Header
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, denominations) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                        journalId, date,
                        `${descPrefix} #${invoiceNumber} - ${partnerName}`,
                        invoiceId, createdBy, req.body.currencyCode || 'EGP', req.body.exchangeRate || 1,
                        req.body.denominations ? JSON.stringify(req.body.denominations) : null
                    ]);
                    // Lines
                    const exRate = req.body.exchangeRate || 1;
                    const fAmt = cashJournalAmount / exRate;
                    const cCode = req.body.currencyCode || 'EGP';
                    if (paymentType === 'RECEIPT') {
                        // RECEIPT: Dr Cash, Cr Receivables/Payables
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, paymentAccount.id, paymentAccount.name, cashJournalAmount, 0, cCode, exRate, fAmt, 0]);
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, partnerAccount.id, partnerAccount.name, 0, cashJournalAmount, cCode, exRate, 0, fAmt]);
                    }
                    else {
                        // PAYMENT: Dr Receivables/Payables, Cr Cash
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, partnerAccount.id, partnerAccount.name, cashJournalAmount, 0, cCode, exRate, fAmt, 0]);
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, paymentAccount.id, paymentAccount.name, 0, cashJournalAmount, cCode, exRate, 0, fAmt]);
                    }
                    (0, logger_1.logDebug)(`📒 Treasury journal entry ${journalId} created for CASH INVOICE ${invoiceNumber} (amount: ${cashJournalAmount})`);
                }
                else {
                    console.warn(`⚠️ Could not find Cash or Partner account for CASH INVOICE Treasury Journal (Inv: ${invoiceNumber})`);
                }
            }
            // === PROCESS BANK TRANSFERS (تحويلات بنكية) ===
            // Create payment vouchers for each bank transfer
            const bankTransfers = req.body.bankTransfers;
            if (bankTransfers && Array.isArray(bankTransfers) && bankTransfers.length > 0 && partnerId) {
                console.log(`🏦 Processing ${bankTransfers.length} bank transfers for invoice ${invoiceNumber}`);
                for (const transfer of bankTransfers) {
                    if (!transfer.amount || transfer.amount <= 0)
                        continue;
                    // Determine payment type based on invoice type
                    const transferPaymentType = (type === 'INVOICE_SALE' || type === 'RETURN_PURCHASE')
                        ? 'RECEIPT' // مقبوض
                        : 'PAYMENT'; // سند صرف
                    // Memory-Optimized Payment Number Generation for Transfer
                    const transferPrefix = transferPaymentType === 'RECEIPT' ? 'REC-' : 'PAY-';
                    const transferNumber = yield (0, invoiceNumberGenerator_1.generateNextSequentialNumber)(conn, transferPrefix);
                    const transferPaymentId = (0, crypto_1.randomUUID)();
                    // Create payment/receipt record for bank transfer with sourceInvoiceId for cascade delete
                    yield conn.query(`INSERT INTO invoices (
                        id, number, date, type, partnerId, partnerName, 
                        total, status, paymentMethod, posted, notes, 
                        warehouseId, createdBy, bankName, sourceInvoiceId, relatedInvoiceIds
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                        transferPaymentId,
                        transferNumber,
                        date,
                        transferPaymentType,
                        partnerId,
                        partnerName,
                        transfer.amount,
                        'POSTED',
                        'BANK',
                        1, // posted = true
                        `تحويل بنكي مع الفاتورة ${invoiceNumber} - مرجع: ${transfer.reference || '-'}`,
                        req.body.warehouseId || null,
                        createdBy,
                        transfer.bankName || null,
                        invoiceId, // sourceInvoiceId - for cascade delete
                        JSON.stringify([invoiceId])
                    ]);
                    // Create account transaction for the bank transfer
                    yield conn.query(`INSERT INTO account_transactions (
                        id, date, type, partnerId, partnerName, 
                        debit, credit, description, invoiceId, createdBy
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                        (0, crypto_1.randomUUID)(),
                        date,
                        transferPaymentType,
                        partnerId,
                        partnerName,
                        transferPaymentType === 'PAYMENT' ? transfer.amount : 0,
                        transferPaymentType === 'RECEIPT' ? transfer.amount : 0,
                        `تحويل بنكي مع الفاتورة ${invoiceNumber} - بنك: ${transfer.bankName || '-'}`,
                        transferPaymentId,
                        createdBy
                    ]);
                    // === CREATE JOURNAL ENTRY FOR BANK TRANSFER ===
                    const transferJournalId = (0, crypto_1.randomUUID)();
                    // Get bank account
                    let bankAccountId = null;
                    let bankAccountName = 'البنوك';
                    // Try to find bank account by name from the transfer
                    if (transfer.bankName) {
                        const [bankAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [`%${transfer.bankName}%`]);
                        if (bankAccounts[0]) {
                            bankAccountId = bankAccounts[0].id;
                            bankAccountName = bankAccounts[0].name;
                        }
                    }
                    // Fallback to generic bank account
                    if (!bankAccountId) {
                        const [bankAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE '102%' OR name LIKE '%بنك%' LIMIT 1`, []);
                        if (bankAccounts[0]) {
                            bankAccountId = bankAccounts[0].id;
                            bankAccountName = bankAccounts[0].name;
                        }
                    }
                    // Get partner account (Receivables for RECEIPT, Payables for PAYMENT)
                    // Account codes: 104 = AR (العملاء), 201 = AP (الموردين)
                    const transferPartnerAccountCode = transferPaymentType === 'RECEIPT' ? '104%' : '201%';
                    let [transferPartnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [transferPartnerAccountCode]);
                    // Fallback: search by name
                    if (transferPartnerAccounts.length === 0) {
                        const searchName = transferPaymentType === 'RECEIPT' ? '%عملاء%' : '%موردين%';
                        [transferPartnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [searchName]);
                    }
                    const transferPartnerAccount = transferPartnerAccounts[0];
                    if (bankAccountId && transferPartnerAccount) {
                        // Create journal entry header
                        yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate) 
                         VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                            transferJournalId,
                            date,
                            `${transferPaymentType === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} #${transferNumber} - ${partnerName} - تحويل بنكي مع الفاتورة ${invoiceNumber}`,
                            transferPaymentId,
                            createdBy,
                            req.body.currencyCode || 'EGP',
                            req.body.exchangeRate || 1
                        ]);
                        // PERF: Batch journal lines — single INSERT with 2 rows
                        const tCCode = req.body.currencyCode || 'EGP';
                        const tExRate = req.body.exchangeRate || 1;
                        const tFAmt = transfer.amount / tExRate;
                        const tJLines = transferPaymentType === 'RECEIPT'
                            ? [
                                [transferJournalId, bankAccountId, bankAccountName, transfer.amount, 0, tCCode, tExRate, tFAmt, 0],
                                [transferJournalId, transferPartnerAccount.id, transferPartnerAccount.name, 0, transfer.amount, tCCode, tExRate, 0, tFAmt]
                            ]
                            : [
                                [transferJournalId, transferPartnerAccount.id, transferPartnerAccount.name, transfer.amount, 0, tCCode, tExRate, tFAmt, 0],
                                [transferJournalId, bankAccountId, bankAccountName, 0, transfer.amount, tCCode, tExRate, 0, tFAmt]
                            ];
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES ?`, [tJLines]);
                        console.log(`📒 Bank transfer journal entry ${transferJournalId} created`);
                    }
                    // Update bank balance if we have bankId
                    if (transfer.bankId) {
                        const balanceChange = transferPaymentType === 'RECEIPT' ? transfer.amount : -transfer.amount;
                        // REMOVED: Banks balance is now calculated live from GL/journal lines
                        console.log(`🏦 Bank ${transfer.bankId} GL updated by ${balanceChange}`);
                    }
                    console.log(`✅ Bank transfer payment ${transferNumber} created for ${transfer.amount}`);
                    // Log audit trail for bank transfer
                    yield (0, auditController_1.logAction)(createdBy || 'System', transferPaymentType, 'CREATE', `Created bank transfer ${transferPaymentType} #${transferNumber} with Invoice ${invoiceNumber}`, `Partner: ${partnerName}, Amount: ${transfer.amount}, Bank: ${transfer.bankName || '-'}`);
                }
            }
            // === UPDATE SALESMAN TARGET ACHIEVEMENTS ===
            // DEPRECATED: Targets are now calculated dynamically on read (see salesmanTargetController.ts)
            // No need to update 'achievedQuantity' or 'achievedAmount' physically anymore.
            // Log audit trail
            yield (0, auditController_1.logAction)(createdBy || 'System', 'INVOICE', 'CREATE', `Created ${type} Invoice #${invoiceNumber}`, `Partner: ${partnerName}, Amount: ${total}, Payment: ${paymentMethod}`);
        }
        // === STANDALONE RECEIPT/PAYMENT JOURNAL ENTRIES UPDATE ===
        // The inline payment logic above skips standalone receipts (where lines are empty and they ARE the payment itself)
        if (type === 'RECEIPT' || type === 'PAYMENT') {
            const standaloneTotal = Number(total) || 0;
            (0, logger_1.logDebug)(`💰 Updating standalone ${type} #${invoiceNumber} GL entries. Amount: ${standaloneTotal}`);
            // 1. Delete old account_transactions
            yield conn.query('DELETE FROM account_transactions WHERE invoiceId = ?', [invoiceId]);
            // 2. Delete old journal_entries and journal_lines
            yield conn.query('DELETE FROM journal_lines WHERE journalId IN (SELECT id FROM journal_entries WHERE referenceId = ?)', [invoiceId]);
            yield conn.query('DELETE FROM journal_entries WHERE referenceId = ?', [invoiceId]);
            // 3. Re-create account_transactions
            yield conn.query(`INSERT INTO account_transactions (
                    id, date, type, partnerId, partnerName, debit, credit, description, invoiceId, createdBy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                (0, crypto_1.randomUUID)(), date, type, partnerId, partnerName,
                type === 'PAYMENT' ? standaloneTotal : 0, // Debit for PAYMENT
                type === 'RECEIPT' ? standaloneTotal : 0, // Credit for RECEIPT
                `${type === 'RECEIPT' ? 'مقبوض' : 'دفع'} (مستقل) ${invoiceNumber}`,
                invoiceId, createdBy
            ]);
            // 4. Re-create journal entries
            if (standaloneTotal > 0) {
                const journalId = (0, crypto_1.randomUUID)();
                // Determine account codes based on PaymentMethod
                let paymentAccountCode = '101%';
                let paymentAccountName = 'الصندوق';
                if (paymentMethod === 'BANK') {
                    if (updateBankAccountId) {
                        const [bankAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE id = ? LIMIT 1`, [updateBankAccountId]);
                        if (bankAccounts[0]) {
                            paymentAccountCode = bankAccounts[0].id;
                            paymentAccountName = bankAccounts[0].name;
                        }
                    }
                    else {
                        paymentAccountCode = '102%';
                        paymentAccountName = 'البنك';
                    }
                }
                else if (paymentMethod === 'CHEQUE') {
                    paymentAccountCode = type === 'RECEIPT' ? '106%' : '203%';
                    paymentAccountName = type === 'RECEIPT' ? 'أوراق قبض' : 'أوراق دفع';
                }
                // Get treasury account
                let [paymentAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? OR id = ? LIMIT 1`, [paymentAccountCode, paymentAccountCode]);
                if (paymentAccounts.length === 0) {
                    const searchName = paymentMethod === 'CASH' ? '%خزينة%' : '%بنك%';
                    [paymentAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [searchName]);
                }
                let pAcc = paymentAccounts[0];
                // Fallback for extreme cases to prevent silent GL deletion
                if (!pAcc) {
                    const [fallbackCash] = yield conn.query(`SELECT id, name FROM accounts LIMIT 1`);
                    pAcc = fallbackCash[0];
                    console.error(`⚠️ Extreme fallback used for Payment Account in updateInvoice!`);
                }
                // Get partner account
                const partnerAccountCode = type === 'RECEIPT' ? '104%' : '201%';
                let [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE code LIKE ? LIMIT 1`, [partnerAccountCode]);
                if (partnerAccounts.length === 0) {
                    const searchName = type === 'RECEIPT' ? '%عملاء%' : '%موردين%';
                    [partnerAccounts] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [searchName]);
                }
                let ptAcc = partnerAccounts[0];
                // Fallback for extreme cases to prevent silent GL deletion
                if (!ptAcc) {
                    const searchNameFallback = type === 'RECEIPT' ? '%إيرادات%' : '%مصروفات%';
                    const [fallbackPartner] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE ? LIMIT 1`, [searchNameFallback]);
                    ptAcc = fallbackPartner[0] || pAcc;
                    console.error(`⚠️ Extreme fallback used for Partner Account in updateInvoice!`);
                }
                if (pAcc && ptAcc) {
                    const methodLabel = paymentMethod === 'CASH' ? 'نقدي' : paymentMethod === 'BANK' ? 'تحويل بنكي' : 'شيك';
                    yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy, currencyCode, exchangeRate, denominations) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                        journalId, date,
                        `${type === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} #${invoiceNumber} - ${partnerName} (${methodLabel})`,
                        invoiceId, createdBy,
                        req.body.currencyCode || 'EGP', req.body.exchangeRate || 1,
                        req.body.denominations ? JSON.stringify(req.body.denominations) : null
                    ]);
                    const exRate = req.body.exchangeRate || 1;
                    const cCode = req.body.currencyCode || 'EGP';
                    const fAmount = standaloneTotal / exRate;
                    if (type === 'RECEIPT') {
                        // Receipt: Debit Treasury, Credit Partner
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, pAcc.id, pAcc.name, standaloneTotal, 0, cCode, exRate, fAmount, 0]);
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, ptAcc.id, ptAcc.name, 0, standaloneTotal, cCode, exRate, 0, fAmount]);
                    }
                    else {
                        // Payment: Debit Partner, Credit Treasury
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, ptAcc.id, ptAcc.name, standaloneTotal, 0, cCode, exRate, fAmount, 0]);
                        yield conn.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, currencyCode, exchangeRate, foreignDebit, foreignCredit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [journalId, pAcc.id, pAcc.name, 0, standaloneTotal, cCode, exRate, 0, fAmount]);
                    }
                }
            }
        }
        yield conn.commit();
        // === AUTO-POST REVENUE/COGS JOURNAL ENTRY (For updates) ===
        // We sync the revenue journal logic here (AFTER commit so that locks are released during the recreation, or we can do it before.
        // Doing it before is better to preserve atomicity, but wait, if it fails, it shouldn't rollback everything.
        // The helper has a try-catch to prevent failing the invoice update.
        yield (0, exports.syncRevenueCogsJournal)(conn, invoiceId, invoiceNumber, type, date, partnerName, total, lines, createdBy, false, isCashPayment, Number(req.body.globalDiscount) || 0, (0, branchFilter_1.resolveBranchIdForWrite)(req));
        // Log audit trail
        yield (0, auditController_1.logAction)(createdBy, 'INVOICE', 'UPDATE', `Updated ${type} Invoice #${invoiceNumber}`, `Partner: ${partnerName}, Amount: ${total}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoice', updatedBy: createdBy });
        // Check memberships
        yield (0, memberships_1.checkAndActivateMembership)(invoiceId, conn);
        if (type === 'RECEIPT' && req.body.sourceInvoiceId) {
            yield (0, memberships_1.checkAndActivateMembership)(req.body.sourceInvoiceId, conn);
        }
        else if (type === 'RECEIPT' && req.body.referenceInvoiceId) {
            yield (0, memberships_1.checkAndActivateMembership)(req.body.referenceInvoiceId, conn);
        }
        res.json(Object.assign(Object.assign({ id: invoiceId, number: invoiceNumber }, req.body), { message: 'Invoice updated successfully' }));
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
        conn.release();
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getPendingReservations');
    }
});
exports.getPendingReservations = getPendingReservations;
