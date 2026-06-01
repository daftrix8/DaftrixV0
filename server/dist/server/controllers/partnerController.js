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
exports.getPartnerStatement = exports.bulkUpdateSupplierPrices = exports.getSupplierProducts = exports.deletePartner = exports.updatePartner = exports.createPartner = exports.getPartnerById = exports.getPartners = void 0;
exports.invalidatePartnerCache = invalidatePartnerCache;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const dataFiltering_1 = require("../utils/dataFiltering");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
// Reverted EFFECTIVE_TOTAL_SQL logic - we must trust i.total as the net amount
// Any legacy invoices where i.total is incorrect must be updated directly in the DB.
/**
 * Generates the inv_agg subquery SQL for partner balance calculations.
 * Uses EFFECTIVE_TOTAL_SQL to correctly compute NET for invoices with discount/shipping.
 * This ensures correct balances even on fresh database restores from legacy systems.
 */
function buildInvAggSQL(opts) {
    const pf = (opts === null || opts === void 0 ? void 0 : opts.partnerFilter) || '';
    const df = (opts === null || opts === void 0 ? void 0 : opts.dateFilter) || '';
    return `(
        SELECT i.partnerId,
            SUM(CASE
                WHEN i.type = 'INVOICE_SALE' AND COALESCE(i.paymentMethod, '') != 'CASH' THEN i.total
                WHEN i.type = 'RETURN_SALE' AND COALESCE(i.paymentMethod, '') != 'CASH' THEN -(i.total)
                WHEN i.type IN ('RECEIPT', 'DISCOUNT_ALLOWED', 'CHEQUE_DEPOSIT', 'CHEQUE_COLLECT') AND COALESCE(i.voucherCategory, '') != 'supplier' THEN -(i.total)
                WHEN i.type = 'PAYMENT' AND i.voucherCategory = 'customer' THEN i.total
                ELSE 0 END) as cImpact,
            SUM(CASE
                WHEN i.type = 'INVOICE_PURCHASE' AND COALESCE(i.paymentMethod, '') != 'CASH' THEN -(i.total)
                WHEN i.type = 'RETURN_PURCHASE' AND COALESCE(i.paymentMethod, '') != 'CASH' THEN i.total
                WHEN i.type IN ('PAYMENT', 'DISCOUNT_EARNED', 'CHEQUE_CASHED') AND COALESCE(i.voucherCategory, '') != 'customer' THEN i.total
                WHEN i.type = 'RECEIPT' AND i.voucherCategory = 'supplier' THEN -(i.total)
                ELSE 0 END) as sImpact,
            SUM(CASE WHEN i.type = 'RECEIPT' THEN -(i.total) ELSE 0 END) as supplierReceiptImpact,
            SUM(CASE WHEN i.type = 'CHEQUE_BOUNCE' THEN i.total ELSE 0 END) as bounceImpact
        FROM invoices i
        WHERE i.status IN ('POSTED', 'COMPLETED', 'PARTIAL') ${pf} ${df}
        GROUP BY i.partnerId
    )`;
}
// ═══════════════════════════════════════════
// RESPONSE CACHE for partner list queries
// The partner list with real-time balance SQL JOIN is heavy (~200ms+ for 5700 partners).
// Multiple frontend components fire the same query within milliseconds.
// Cache for 30s to avoid redundant DB work.
// ═══════════════════════════════════════════
const partnerListCache = new Map();
const PARTNER_CACHE_TTL = 30000; // 30 seconds
function invalidatePartnerCache() {
    partnerListCache.clear();
}
// Auto-invalidate on partner mutations via eventBus
// eventBus emits 'broadcast' with { event, data } payload
eventBus_1.eventBus.on('broadcast', ({ event, data }) => {
    if ((event === 'entity:changed' || event === 'entity:deleted') && (data === null || data === void 0 ? void 0 : data.entityType) === 'partner') {
        invalidatePartnerCache();
    }
});
const getPartners = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const authReq = req;
        // ── RESPONSE CACHE CHECK ──
        // Build a cache key from query params + fiscal year to avoid cross-year contamination
        const fyCacheKey = authReq.fiscalYearFilter
            ? `${authReq.fiscalYearFilter.startDate}|${authReq.fiscalYearFilter.endDate}`
            : 'all';
        const cacheKey = JSON.stringify(req.query) + '|fy:' + fyCacheKey;
        const cached = partnerListCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < PARTNER_CACHE_TTL) {
            return res.json(cached.data);
        }
        const conn = yield (0, db_1.getConnection)();
        // Build fiscal year date filter for inv_agg subquery
        const fyDateFilter = authReq.fiscalYearFilter
            ? `AND i.date >= '${authReq.fiscalYearFilter.startDate}' AND i.date <= '${authReq.fiscalYearFilter.endDate}'`
            : '';
        // ============================================
        // FAST PATH: statsOnly — returns aggregate stats without fetching partner rows
        // Used by Dashboard to get netBalance/totalAssets/totalLiabilities without 5K record transfer
        // ============================================
        if (req.query.statsOnly === 'true') {
            const isCustomer = req.query.isCustomer;
            const isSupplier = req.query.isSupplier;
            const conditions = [];
            const params = [];
            if (isCustomer !== undefined) {
                conditions.push('p.isCustomer = ?');
                params.push(isCustomer === 'true' ? 1 : 0);
            }
            if (isSupplier !== undefined) {
                conditions.push('p.isSupplier = ?');
                params.push(isSupplier === 'true' ? 1 : 0);
            }
            const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
            const [statsResult] = yield conn.query(`SELECT 
                    SUM(
                        COALESCE(p.openingBalance, 0) +
                        CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
                        CASE WHEN p.isSupplier = 1 THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
                    ) as netBalance,
                    SUM(CASE WHEN (
                        COALESCE(p.openingBalance, 0) +
                        CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
                        CASE WHEN p.isSupplier = 1 THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
                    ) > 0 THEN (
                        COALESCE(p.openingBalance, 0) +
                        CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
                        CASE WHEN p.isSupplier = 1 THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
                    ) ELSE 0 END) as totalAssets,
                    SUM(CASE WHEN (
                        COALESCE(p.openingBalance, 0) +
                        CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
                        CASE WHEN p.isSupplier = 1 THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
                    ) < 0 THEN ABS(
                        COALESCE(p.openingBalance, 0) +
                        CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
                        CASE WHEN p.isSupplier = 1 THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
                    ) ELSE 0 END) as totalLiabilities
                 FROM partners p
                 LEFT JOIN ${buildInvAggSQL({ dateFilter: fyDateFilter })} inv_agg ON p.id = inv_agg.partnerId
                 ${whereClause}`, params);
            const stats = statsResult[0];
            conn.release();
            // PERF: console.log(`⚡ [statsOnly] Returned partner stats for ${isCustomer ? 'customers' : isSupplier ? 'suppliers' : 'all'}`);
            return res.json({
                partners: [],
                pagination: { total: 0, page: 1, limit: 0, totalPages: 0 },
                stats: {
                    netBalance: Math.round((stats.netBalance || 0) * 100) / 100,
                    totalLiabilities: Math.round((stats.totalLiabilities || 0) * 100) / 100,
                    totalAssets: Math.round((stats.totalAssets || 0) * 100) / 100
                }
            });
        }
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        // Filter parameters
        const type = req.query.type; // 'CUSTOMER' or 'SUPPLIER'
        const search = req.query.search;
        const isCustomer = req.query.isCustomer;
        const isSupplier = req.query.isSupplier;
        const balanceStatus = req.query.balanceStatus;
        // Build WHERE clause
        const conditions = [];
        const params = [];
        // Apply salesman data isolation filter
        if (authReq.userFilterOptions && authReq.systemConfig) {
            const salesmanFilter = (0, dataFiltering_1.buildSalesmanFilterClause)({
                userRole: authReq.userFilterOptions.userRole,
                salesmanId: authReq.userFilterOptions.salesmanId,
                systemConfig: authReq.systemConfig
            }, 'partners', 'p');
            if (salesmanFilter.clause) {
                conditions.push(salesmanFilter.clause);
                params.push(...salesmanFilter.params);
            }
        }
        if (type) {
            conditions.push('p.type = ?');
            params.push(type);
        }
        if (isCustomer !== undefined) {
            conditions.push('p.isCustomer = ?');
            params.push(isCustomer === 'true' ? 1 : 0);
        }
        if (isSupplier !== undefined) {
            conditions.push('p.isSupplier = ?');
            params.push(isSupplier === 'true' ? 1 : 0);
        }
        if (search) {
            const hasArabicLetters = /[\u0600-\u06FF]/.test(search);
            const rawTokens = search.trim().split(/\s+/).filter(Boolean);
            if (rawTokens.length > 0) {
                if (hasArabicLetters) {
                    // Heavy Arabic-normalized tokenized search functionality optimized!
                    const normalizeArabicStr = (text) => {
                        if (!text)
                            return '';
                        return text.toLowerCase()
                            .replace(/[أإآ]/g, 'ا')
                            .replace(/ة/g, 'ه')
                            .replace(/ى/g, 'ي')
                            .replace(/ؤ/g, 'و')
                            .replace(/ئ/g, 'ي');
                    };
                    const arabicNormSQL = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${col}), 'أ','ا'), 'إ','ا'), 'آ','ا'), 'ة','ه'), 'ى','ي'), 'ؤ','و'), 'ئ','ي')`;
                    const tokenConditions = rawTokens.map(() => {
                        return `( ${arabicNormSQL('p.name')} LIKE ? OR p.phone LIKE ? OR p.taxId LIKE ? OR p.code LIKE ? )`;
                    });
                    conditions.push(`(${tokenConditions.join(' AND ')})`);
                    rawTokens.forEach(token => {
                        const normalizedTokenParam = `%${normalizeArabicStr(token)}%`;
                        const plainTokenParam = `%${token}%`;
                        params.push(normalizedTokenParam, plainTokenParam, plainTokenParam, plainTokenParam);
                    });
                }
                else {
                    // Fast path for non-Arabic searches (e.g. phones, tax IDs, English names)
                    const tokenConditions = rawTokens.map(() => {
                        return `( LOWER(p.name) LIKE LOWER(?) OR p.phone LIKE ? OR p.taxId LIKE ? OR p.code LIKE ? )`;
                    });
                    conditions.push(`(${tokenConditions.join(' AND ')})`);
                    rawTokens.forEach(token => {
                        const plainTokenParam = `%${token}%`;
                        params.push(plainTokenParam, plainTokenParam, plainTokenParam, plainTokenParam);
                    });
                }
            }
        }
        const whereClause = conditions.length > 0
            ? 'WHERE ' + conditions.join(' AND ')
            : '';
        // =====================================================
        // REAL-TIME BALANCE CALCULATION USING EFFICIENT SQL
        // This replaces the stale 'balance' column with dynamic calculation
        // =====================================================
        // Skip real-time calculation if explicitly disabled (for performance in rare cases)
        const skipRealBalance = req.query.skipRealBalance === 'true';
        let balanceSelect;
        if (skipRealBalance) {
            // Use stored balance (legacy behavior)
            balanceSelect = 'p.balance as calculatedBalance, p.balance as supplierBalance, p.balance as customerBalance';
        }
        else {
            // Calculate real-time balance using SQL subqueries
            // This is MORE EFFICIENT than the previous N+1 query approach
            balanceSelect = `
                (
                      COALESCE(p.openingBalance, 0) +
                      CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
                      CASE WHEN p.isSupplier = 1 THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
                  ) as calculatedBalance,
                  (COALESCE(p.openingBalance, 0) + COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0)) as supplierBalance,
                  (COALESCE(p.openingBalance, 0) + COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0)) as customerBalance
              `;
        }
        let partnerFromSql = 'FROM partners p';
        if (!skipRealBalance) {
            // Uses buildInvAggSQL() for correct NET total (handles legacy migrated invoices)
            partnerFromSql = `FROM partners p
                LEFT JOIN ${buildInvAggSQL({ dateFilter: fyDateFilter })} inv_agg ON inv_agg.partnerId = p.id`;
        }
        // Apply HAVING clause for balance filtering (DB level)
        let havingClause = '';
        if (balanceStatus === 'DEBIT') {
            havingClause = 'HAVING calculatedBalance > 0';
        }
        else if (balanceStatus === 'CREDIT') {
            havingClause = 'HAVING calculatedBalance < 0';
        }
        else if (balanceStatus === 'ZERO') {
            havingClause = 'HAVING calculatedBalance = 0';
        }
        // =====================================================
        // OPTIMIZED: Single query for partners + count + stats
        // Previously ran 3 separate heavy queries with the same inv_agg JOIN.
        // Now we use SQL_CALC_FOUND_ROWS to get total count from the same query,
        // and compute stats in-app from the full result set when no balance filter,
        // or run a single separate stats query when HAVING filters are active.
        // =====================================================
        // When balance filtering is active, we need to run the heavy query for all rows.
        // When not, LIMIT/OFFSET gives us efficiency. 
        // Strategy: Run ONE paginated query + ONE count query (skip the 3rd stats query by computing from count query)
        let rows;
        let total;
        let netBalance;
        let totalAssets;
        let totalLiabilities;
        // Run the main partner query with LIMIT/OFFSET
        try {
            [rows] = yield conn.query(`SELECT p.*, s.name as salesmanName, pl.name as priceListName, ${balanceSelect},
                 (SELECT mp.name FROM memberships m JOIN membership_packages mp ON m.packageId = mp.id WHERE m.customerId = p.id AND m.status = 'active' ORDER BY m.createdAt DESC LIMIT 1) as activeMembershipPackageName,
                 (SELECT mp.icon FROM memberships m JOIN membership_packages mp ON m.packageId = mp.id WHERE m.customerId = p.id AND m.status = 'active' ORDER BY m.createdAt DESC LIMIT 1) as activeMembershipIcon
                 ${partnerFromSql} 
                 LEFT JOIN salesmen s ON p.salesmanId = s.id
                 LEFT JOIN price_lists pl ON p.priceListId = pl.id
                 ${whereClause} 
                 ${havingClause}
                 ORDER BY p.name 
                 LIMIT ? OFFSET ?`, [...params, limit, offset]);
        }
        catch (joinErr) {
            // If priceListId column or price_lists table doesn't exist, fall back
            if (((_a = joinErr.message) === null || _a === void 0 ? void 0 : _a.includes('priceListId')) || ((_b = joinErr.message) === null || _b === void 0 ? void 0 : _b.includes('price_lists')) || joinErr.code === 'ER_BAD_FIELD_ERROR') {
                [rows] = yield conn.query(`SELECT p.*, s.name as salesmanName, NULL as priceListName, ${balanceSelect},
                     (SELECT mp.name FROM memberships m JOIN membership_packages mp ON m.packageId = mp.id WHERE m.customerId = p.id AND m.status = 'active' ORDER BY m.createdAt DESC LIMIT 1) as activeMembershipPackageName,
                     (SELECT mp.icon FROM memberships m JOIN membership_packages mp ON m.packageId = mp.id WHERE m.customerId = p.id AND m.status = 'active' ORDER BY m.createdAt DESC LIMIT 1) as activeMembershipIcon
                     ${partnerFromSql} 
                     LEFT JOIN salesmen s ON p.salesmanId = s.id
                     ${whereClause} 
                     ${havingClause}
                     ORDER BY p.name 
                     LIMIT ? OFFSET ?`, [...params, limit, offset]);
            }
            else {
                throw joinErr;
            }
        }
        // Map calculatedBalance to balance for response
        const partnersWithBalance = rows.map(partner => (Object.assign(Object.assign({}, partner), { balance: partner.calculatedBalance !== undefined ? Math.round(partner.calculatedBalance * 100) / 100 : partner.balance })));
        // =====================================================
        // COMBINED count + stats query (single query instead of two)
        // This runs the inv_agg JOIN only ONCE for count+stats combined
        // =====================================================
        const [combinedResult] = yield conn.query(`SELECT 
                COUNT(*) as total,
                SUM(calculatedBalance) as netBalance,
                SUM(CASE WHEN calculatedBalance > 0 THEN calculatedBalance ELSE 0 END) as totalAssets,
                SUM(CASE WHEN calculatedBalance < 0 THEN ABS(calculatedBalance) ELSE 0 END) as totalLiabilities
             FROM (
                SELECT ${skipRealBalance ? 'p.balance' : `(
                    COALESCE(p.openingBalance, 0) +
                    CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
                    CASE WHEN p.isSupplier = 1 THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
                )`} as calculatedBalance
                ${partnerFromSql}
                ${whereClause}
                ${havingClause}
             ) as partner_balances`, params);
        const combined = combinedResult[0];
        total = combined.total || 0;
        netBalance = combined.netBalance || 0;
        totalAssets = combined.totalAssets || 0;
        totalLiabilities = combined.totalLiabilities || 0;
        conn.release();
        // PERF: console.log(`📊 Returned ${partnersWithBalance.length} partners ${skipRealBalance ? '(stored balances)' : 'with real-time balances'} (page ${page})`);
        // Return paginated response — and CACHE it
        const responseData = {
            partners: partnersWithBalance,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            stats: {
                netBalance: Math.round(netBalance * 100) / 100,
                totalLiabilities: Math.round(totalLiabilities * 100) / 100,
                totalAssets: Math.round(totalAssets * 100) / 100
            }
        };
        partnerListCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
        res.json(responseData);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getPartners');
    }
});
exports.getPartners = getPartners;
// Get single partner by ID with REAL-TIME balance calculated from transactions
// This MUST match the calculation in PartnerStatement.tsx partnersWithCalculatedBalance
const getPartnerById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { id } = req.params;
        // Build fiscal year date filter for inv_agg subquery
        const fyDateFilter = authReq.fiscalYearFilter
            ? `AND i.date >= '${authReq.fiscalYearFilter.startDate}' AND i.date <= '${authReq.fiscalYearFilter.endDate}'`
            : '';
        // Get partner basic info
        let partners;
        try {
            [partners] = yield conn.query(`SELECT p.*, s.name as salesmanName, pl.name as priceListName 
                 FROM partners p 
                 LEFT JOIN salesmen s ON p.salesmanId = s.id
                 LEFT JOIN price_lists pl ON p.priceListId = pl.id
                 WHERE p.id = ?`, [id]);
        }
        catch (joinErr) {
            if (((_a = joinErr.message) === null || _a === void 0 ? void 0 : _a.includes('priceListId')) || ((_b = joinErr.message) === null || _b === void 0 ? void 0 : _b.includes('price_lists')) || joinErr.code === 'ER_BAD_FIELD_ERROR') {
                [partners] = yield conn.query(`SELECT p.*, s.name as salesmanName, NULL as priceListName 
                     FROM partners p 
                     LEFT JOIN salesmen s ON p.salesmanId = s.id
                     WHERE p.id = ?`, [id]);
            }
            else {
                throw joinErr;
            }
        }
        if (!partners.length) {
            conn.release();
            return res.status(404).json({ message: 'Partner not found' });
        }
        const partner = partners[0];
        const isSupplier = partner.isSupplier == 1 || partner.type === 'SUPPLIER';
        const isCustomer = partner.isCustomer == 1 || partner.type === 'CUSTOMER';
        // ═══════════════════════════════════════════════════════════════════
        // REAL-TIME BALANCE: Use the EXACT SAME SQL aggregation as getPartners
        // This avoids any subtle differences between loop-based and SQL-based calculation.
        // ═══════════════════════════════════════════════════════════════════
        const [balanceResult] = yield conn.query(`
            SELECT 
                (
                    COALESCE(p.openingBalance, 0) +
                    CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
                    CASE WHEN p.isSupplier = 1 THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
                ) as calculatedBalance
            FROM partners p
            LEFT JOIN ${buildInvAggSQL({ partnerFilter: 'AND i.partnerId = ?', dateFilter: fyDateFilter })} inv_agg ON inv_agg.partnerId = p.id
            WHERE p.id = ?
        `, [id, id]);
        const balance = Math.round(Number(((_c = balanceResult[0]) === null || _c === void 0 ? void 0 : _c.calculatedBalance) || 0) * 100) / 100;
        // Also update the stored balance to keep it in sync (avoids drift for skipRealBalance mode)
        try {
            yield conn.query('UPDATE partners SET balance = ? WHERE id = ?', [balance, id]);
        }
        catch (e) {
            // Non-critical — don't fail the request
        }
        // PERF: console.log(`📊 Partner ${partner.name} (${isSupplier ? 'Supplier' : isCustomer ? 'Customer' : 'Both'}): Opening=${partner.openingBalance}, Balance=${balance}`);
        conn.release();
        res.json(Object.assign(Object.assign({}, partner), { balance: balance, calculatedBalance: balance }));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getPartnerById');
    }
});
exports.getPartnerById = getPartnerById;
const createPartner = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { name, phone, email, taxId, address, contactPerson, paymentTerms, openingBalance, creditLimit, classification, status, groupId, commercialRegister, salesmanId, priceListId, currencyCode, ceramicPriceListId, ceramicDiscountListId, gender, dateOfBirth } = req.body;
        // Default values for mobile app compatibility
        let { type, isCustomer, isSupplier } = req.body;
        // PERF: console.log('DEBUG CREATE PARTNER - RAW:', { type, isCustomer, isSupplier, body: req.body });
        // Auto-set type based on isCustomer/isSupplier flags, or correct invalid 'BOTH' type
        if (!type || type === 'BOTH') {
            if (req.body.isCustomer && req.body.isSupplier) {
                type = 'CUSTOMER'; // Use CUSTOMER as primary type for mixed partners
            }
            else if (req.body.isSupplier) {
                type = 'SUPPLIER';
            }
            else {
                type = 'CUSTOMER'; // Default to customer
            }
        }
        // PERF: console.log('DEBUG CREATE PARTNER - PROCESSED TYPE:', type);
        // Ensure isCustomer/isSupplier are set based on type
        if (isCustomer === undefined && isSupplier === undefined) {
            if (type === 'CUSTOMER') {
                isCustomer = true;
                isSupplier = false;
            }
            else if (type === 'SUPPLIER') {
                isCustomer = false;
                isSupplier = true;
            }
            else {
                isCustomer = true;
                isSupplier = true;
            }
        }
        // Validation: At least one type must be selected
        if (!isCustomer && !isSupplier) {
            yield conn.rollback();
            return res.status(400).json({ message: 'Partner must be either a customer, supplier, or both' });
        }
        const id = req.body.id || (0, crypto_1.randomUUID)(); // Accept client-provided ID for offline sync
        // Check if partner with this ID already exists (prevents duplicate key on double-click/sync retry)
        const [existing] = yield conn.query('SELECT id, name FROM partners WHERE id = ?', [id]);
        if (existing.length > 0) {
            yield conn.rollback();
            // PERF: console.log(`⚠️ Partner ${id} already exists (${(existing as any[])[0].name}), returning existing`);
            res.status(200).json(Object.assign(Object.assign({}, req.body), { id, alreadyExists: true }));
            return;
        }
        const salesmanValue = salesmanId === '' ? null : (salesmanId || null);
        const priceListValue = priceListId === '' ? null : (priceListId || null);
        // Strict Uniqueness Checks
        if (name) {
            const [dupName] = yield conn.query('SELECT id FROM partners WHERE name = ? AND id != ? LIMIT 1', [name, id]);
            if (dupName.length > 0) {
                yield conn.rollback();
                return res.status(400).json({ code: 'DUPLICATE_NAME', message: 'هذا الاسم مسجل مسبقاً لشريك آخر، يرجى اختيار اسم آخر.' });
            }
        }
        if (phone && String(phone).trim() !== '') {
            const [dupPhone] = yield conn.query('SELECT id, name FROM partners WHERE phone = ? AND id != ? LIMIT 1', [phone, id]);
            if (dupPhone.length > 0) {
                yield conn.rollback();
                return res.status(400).json({ code: 'DUPLICATE_PHONE', message: `رقم الهاتف هذا مسجل مسبقاً للشريك: ${dupPhone[0].name}. يرجى استخدام رقم آخر.` });
            }
        }
        if (taxId && String(taxId).trim() !== '') {
            const [dupTaxId] = yield conn.query('SELECT id, name FROM partners WHERE taxId = ? AND id != ? LIMIT 1', [taxId, id]);
            if (dupTaxId.length > 0) {
                yield conn.rollback();
                return res.status(400).json({ code: 'DUPLICATE_TAXID', message: `الرقم الضريبي مسجل مسبقاً للشريك: ${dupTaxId[0].name}. يرجى تغييره.` });
            }
        }
        const ceramicPriceListValue = ceramicPriceListId === '' ? null : (ceramicPriceListId || null);
        const ceramicDiscountListValue = ceramicDiscountListId === '' ? null : (ceramicDiscountListId || null);
        // Handle Foreign Currency Logic
        const isForeign = currencyCode && currencyCode !== 'EGP';
        const finalForeignBalance = isForeign ? (openingBalance || 0) : 0;
        // Ideally we would convert this to EGP for the main balance, but for now we'll store the same value 
        // or 0 if we assume it's purely foreign. Let's store it as local for now to avoid zero balances, 
        // but this should be refined with an exchange rate lookup in future.
        const finalBalance = openingBalance || 0;
        // Generate next sequential code for this partner
        let nextCode = req.body.code || null;
        if (!nextCode) {
            try {
                // FIX: mysql2 returns large CAST(AS UNSIGNED) values as strings, not numbers.
                // This caused "maxCode + 1" to do string concatenation ("9991" + 1 = "99911")
                // instead of arithmetic (9991 + 1 = 9992). Use parseInt() to force numeric addition.
                // Also exclude corrupted codes (> 1M) from the MAX() to prevent runaway sequences.
                const [maxResult] = yield conn.query('SELECT COALESCE(MAX(CAST(code AS UNSIGNED)), 0) as maxCode FROM partners WHERE code REGEXP "^[0-9]+$" AND CAST(code AS UNSIGNED) < 1000000');
                const maxCode = parseInt(String(((_a = maxResult[0]) === null || _a === void 0 ? void 0 : _a.maxCode) || 0), 10);
                nextCode = String(maxCode + 1);
            }
            catch (e) {
                // code column may not exist yet on very old schemas — skip gracefully
                nextCode = null;
            }
        }
        yield conn.query('INSERT INTO partners (id, name, type, isCustomer, isSupplier, phone, email, taxId, address, contactPerson, paymentTerms, openingBalance, balance, creditLimit, classification, status, groupId, commercialRegister, salesmanId, priceListId, currencyCode, foreignBalance, ceramicPriceListId, ceramicDiscountListId, code, gender, dateOfBirth) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, name, type, isCustomer ? 1 : 0, isSupplier ? 1 : 0, phone, email, taxId, address, contactPerson, paymentTerms, openingBalance || 0, finalBalance, creditLimit || 0, classification, status || 'ACTIVE', groupId, commercialRegister, salesmanValue, priceListValue, currencyCode || 'EGP', finalForeignBalance, ceramicPriceListValue, ceramicDiscountListValue, nextCode, gender || null, dateOfBirth || null]);
        yield conn.commit();
        // Log audit trail
        const user = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || ((_c = req.user) === null || _c === void 0 ? void 0 : _c.username) || req.body.user || 'System';
        const partnerType = isCustomer && isSupplier ? 'Customer & Supplier' : isCustomer ? 'Customer' : 'Supplier';
        yield (0, auditController_1.logAction)(user, 'PARTNER', 'CREATE', `Created ${partnerType}: ${name} (Code: ${nextCode})`, `Opening Balance: ${openingBalance || 0}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'partner', updatedBy: user });
        res.status(201).json(Object.assign(Object.assign({}, req.body), { id, code: nextCode, balance: openingBalance || 0, isCustomer, isSupplier }));
    }
    catch (error) {
        yield conn.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'creating partner');
    }
    finally {
        conn.release();
    }
});
exports.createPartner = createPartner;
const updatePartner = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { id } = req.params;
        const { name, type, phone, email, taxId, address, contactPerson, paymentTerms, isCustomer, isSupplier, creditLimit, classification, status, groupId, commercialRegister, salesmanId, priceListId, currencyCode, ceramicPriceListId, ceramicDiscountListId, gender, dateOfBirth } = req.body;
        // Validation: At least one type must be selected
        if (isCustomer !== undefined || isSupplier !== undefined) {
            if (!isCustomer && !isSupplier) {
                yield conn.rollback();
                return res.status(400).json({ message: 'Partner must be either a customer, supplier, or both' });
            }
        }
        // Strict Uniqueness Checks
        if (name) {
            const [dupName] = yield conn.query('SELECT id FROM partners WHERE name = ? AND id != ? LIMIT 1', [name, id]);
            if (dupName.length > 0) {
                yield conn.rollback();
                return res.status(400).json({ code: 'DUPLICATE_NAME', message: 'هذا الاسم مسجل مسبقاً لشريك آخر، يرجى اختيار اسم آخر.' });
            }
        }
        if (phone && String(phone).trim() !== '') {
            const [dupPhone] = yield conn.query('SELECT id, name FROM partners WHERE phone = ? AND id != ? LIMIT 1', [phone, id]);
            if (dupPhone.length > 0) {
                yield conn.rollback();
                return res.status(400).json({ code: 'DUPLICATE_PHONE', message: `رقم الهاتف هذا مسجل مسبقاً للشريك: ${dupPhone[0].name}. يرجى استخدام رقم آخر.` });
            }
        }
        if (taxId && String(taxId).trim() !== '') {
            const [dupTaxId] = yield conn.query('SELECT id, name FROM partners WHERE taxId = ? AND id != ? LIMIT 1', [taxId, id]);
            if (dupTaxId.length > 0) {
                yield conn.rollback();
                return res.status(400).json({ code: 'DUPLICATE_TAXID', message: `الرقم الضريبي مسجل مسبقاً للشريك: ${dupTaxId[0].name}. يرجى تغييره.` });
            }
        }
        // ============================================================
        // SAFE BALANCE HANDLING: Prevent stale frontend data from
        // corrupting openingBalance or balance fields.
        // ============================================================
        // 1. Get current DB values first
        const [currentPartner] = yield conn.query('SELECT openingBalance, balance, isSupplier AS dbIsSupplier, isCustomer AS dbIsCustomer, code FROM partners WHERE id = ?', [id]);
        const currentRow = currentPartner[0];
        if (!currentRow) {
            yield conn.rollback();
            conn.release();
            return res.status(404).json({ message: 'Partner not found' });
        }
        // 2. Only update openingBalance if it was EXPLICITLY provided in request
        //    (openingBalance=undefined means frontend didn't intentionally change it)
        const finalOpeningBalance = req.body.openingBalance !== undefined
            ? Number(req.body.openingBalance)
            : Number(currentRow.openingBalance || 0);
        // 3. NEVER trust frontend-supplied balance — it may be stale.
        //    Recalculate using the EXACT SAME SQL aggregation as getPartners.
        const partnerIsSupplier = isSupplier !== undefined ? isSupplier : currentRow.dbIsSupplier;
        const partnerIsCustomer = isCustomer !== undefined ? isCustomer : currentRow.dbIsCustomer;
        // Use SQL aggregation (same formula as getPartners) with the potentially-updated openingBalance
        const [balCalcResult] = yield conn.query(`
            SELECT 
                (
                    ? +
                    CASE WHEN ? = 0 OR ? = 1 THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
                    CASE WHEN ? = 1 THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
                ) as calculatedBalance
            FROM (SELECT 1) dummy
            LEFT JOIN ${buildInvAggSQL({ partnerFilter: 'AND i.partnerId = ?' })} inv_agg ON 1=1
        `, [finalOpeningBalance, partnerIsSupplier ? 1 : 0, partnerIsCustomer ? 1 : 0, partnerIsSupplier ? 1 : 0, id]);
        const finalBalance = Math.round(Number(((_a = balCalcResult[0]) === null || _a === void 0 ? void 0 : _a.calculatedBalance) || finalOpeningBalance) * 100) / 100;
        // PERF: console.log(`📊 updatePartner: opening=${finalOpeningBalance}, newBalance=${finalBalance} (was ${currentRow.balance})`);
        // Handle Foreign Balance Update (if currency changed or balance updated)
        const isForeign = currencyCode && currencyCode !== 'EGP';
        const finalForeignBalance = isForeign ? (req.body.foreignBalance !== undefined ? req.body.foreignBalance : 0) : 0;
        // Update partner record
        const salesmanValue = salesmanId === '' ? null : (salesmanId || null);
        const priceListValue = priceListId === '' ? null : (priceListId || null);
        const ceramicPriceListValue = ceramicPriceListId === '' ? null : (ceramicPriceListId || null);
        const ceramicDiscountListValue = ceramicDiscountListId === '' ? null : (ceramicDiscountListId || null);
        const partnerCodeValue = req.body.code === undefined ? currentRow.code : (req.body.code || null);
        yield conn.query('UPDATE partners SET name = ?, type = ?, isCustomer = ?, isSupplier = ?, phone = ?, email = ?, taxId = ?, address = ?, contactPerson = ?, paymentTerms = ?, creditLimit = ?, classification = ?, status = ?, groupId = ?, commercialRegister = ?, openingBalance = ?, balance = ?, salesmanId = ?, priceListId = ?, currencyCode = ?, foreignBalance = ?, ceramicPriceListId = ?, ceramicDiscountListId = ?, code = ?, gender = ?, dateOfBirth = ? WHERE id = ?', [name, type, isCustomer ? 1 : 0, isSupplier ? 1 : 0, phone, email, taxId, address, contactPerson, paymentTerms, creditLimit || 0, classification, status, groupId, commercialRegister, finalOpeningBalance, finalBalance, salesmanValue, priceListValue, currencyCode || 'EGP', finalForeignBalance, ceramicPriceListValue, ceramicDiscountListValue, partnerCodeValue, gender || null, dateOfBirth || null, id]);
        // CASCADE: Update partner name in all related records
        // This ensures name changes are reflected everywhere in the system
        if (name) {
            // Update invoices
            yield conn.query('UPDATE invoices SET partnerName = ? WHERE partnerId = ?', [name, id]);
            // Update cheques
            yield conn.query('UPDATE cheques SET partnerName = ? WHERE partnerId = ?', [name, id]);
            // Update transactions (if the table has partnerName field)
            try {
                yield conn.query('UPDATE transactions SET partnerName = ? WHERE partnerId = ?', [name, id]);
            }
            catch (e) {
                // Ignore if transactions table doesn't have partnerName column
            }
        }
        yield conn.commit();
        // Log audit trail
        const user = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || ((_c = req.user) === null || _c === void 0 ? void 0 : _c.username) || req.body.user || 'System';
        const partnerType = isCustomer && isSupplier ? 'Customer & Supplier' : isCustomer ? 'Customer' : 'Supplier';
        yield (0, auditController_1.logAction)(user, 'PARTNER', 'UPDATE', `Updated ${partnerType}: ${name}`, `ID: ${id}`);
        // Broadcast real-time update to all clients
        // Broadcast partner change
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'partner', updatedBy: user });
        // Also broadcast invoice/cheque changes since names were updated
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoice', updatedBy: user });
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'cheque', updatedBy: user });
        res.json(Object.assign({ id }, req.body));
    }
    catch (error) {
        yield conn.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'updating partner');
    }
    finally {
        conn.release();
    }
});
exports.updatePartner = updatePartner;
const deletePartner = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { id } = req.params;
        // Get partner name before deletion
        const [partners] = yield conn.query('SELECT name, type FROM partners WHERE id = ?', [id]);
        if (!partners[0]) {
            yield conn.rollback();
            conn.release();
            return res.status(404).json({ error: 'الشريك غير موجود' });
        }
        const partnerName = ((_a = partners[0]) === null || _a === void 0 ? void 0 : _a.name) || id;
        const partnerType = ((_b = partners[0]) === null || _b === void 0 ? void 0 : _b.type) || 'PARTNER';
        const typeArabic = partnerType === 'CUSTOMER' ? 'العميل' : partnerType === 'SUPPLIER' ? 'المورد' : 'الشريك';
        // ========== REFERENTIAL INTEGRITY CHECKS ==========
        const [invoices] = yield conn.query('SELECT COUNT(*) as cnt FROM invoices WHERE partnerId = ?', [id]);
        if (invoices[0].cnt > 0) {
            yield conn.rollback();
            conn.release();
            return res.status(400).json({
                error: `لا يمكن حذف ${typeArabic} "${partnerName}" لأنه مرتبط بـ ${invoices[0].cnt} فاتورة/سند. يرجى حذف المستندات المرتبطة أولاً.`
            });
        }
        let chequeCount = 0;
        try {
            const [cheques] = yield conn.query('SELECT COUNT(*) as cnt FROM cheques WHERE partnerId = ?', [id]);
            chequeCount = ((_c = cheques[0]) === null || _c === void 0 ? void 0 : _c.cnt) || 0;
        }
        catch (e) { /* table may not exist */ }
        if (chequeCount > 0) {
            yield conn.rollback();
            conn.release();
            return res.status(400).json({
                error: `لا يمكن حذف ${typeArabic} "${partnerName}" لأنه مرتبط بـ ${chequeCount} شيك.`
            });
        }
        // ========== END INTEGRITY CHECKS ==========
        yield conn.query('DELETE FROM partners WHERE id = ?', [id]);
        yield conn.commit();
        // Log audit trail
        const user = ((_d = req.user) === null || _d === void 0 ? void 0 : _d.name) || ((_e = req.user) === null || _e === void 0 ? void 0 : _e.username) || (((_f = req.body) === null || _f === void 0 ? void 0 : _f.user) || req.query.user) || 'System';
        yield (0, auditController_1.logAction)(user, 'PARTNER', 'DELETE', `حذف ${typeArabic} - ${partnerName}`, `تم حذف ${typeArabic} | رقم المرجع: ${id}`);
        // Broadcast real-time deletion
        eventBus_1.eventBus.broadcast('entity:deleted', { entityType: 'partner', entityId: id, deletedBy: user });
        res.json({ message: 'Partner deleted' });
    }
    catch (error) {
        yield conn.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleting partner');
    }
    finally {
        conn.release();
    }
});
exports.deletePartner = deletePartner;
// ========================================================================
// SUPPLIER PRICING — Get products purchased from a specific supplier
// ========================================================================
const getSupplierProducts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const { id } = req.params;
        // 1. Get unique products purchased from this supplier (via purchase invoices)
        const [productRows] = yield conn.query(`
            SELECT DISTINCT p.id, p.name, p.sku, p.barcode, p.cost, p.price, p.unit
            FROM invoice_lines il
            JOIN invoices i ON il.invoiceId = i.id
            JOIN products p ON il.productId = p.id
            WHERE i.partnerId = ?
              AND i.type IN ('INVOICE_PURCHASE', 'PURCHASE_INVOICE')
              AND i.status NOT IN ('VOID', 'DRAFT')
              AND il.productId IS NOT NULL
            ORDER BY p.name
        `, [id]);
        const products = productRows;
        if (products.length === 0) {
            conn.release();
            return res.json({ products: [], priceLists: [] });
        }
        // 2. Get all active price lists
        let priceLists = [];
        try {
            const [plRows] = yield conn.query(`
                SELECT id, name FROM price_lists WHERE isActive = TRUE ORDER BY name
            `);
            priceLists = plRows;
        }
        catch (e) {
            // price_lists table may not exist
        }
        // 3. Get price list prices for all these products in one query
        const productIds = products.map(p => p.id);
        let priceListPrices = [];
        if (priceLists.length > 0 && productIds.length > 0) {
            try {
                const [ppRows] = yield conn.query(`
                    SELECT pp.productId, pp.priceListId, pp.price
                    FROM product_prices pp
                    WHERE pp.productId IN (?)
                `, [productIds]);
                priceListPrices = ppRows;
            }
            catch (e) {
                // product_prices table may not exist
            }
        }
        // 4. Get the last purchase price from the most recent invoice for each product
        const [lastPriceRows] = yield conn.query(`
            SELECT il.productId, il.price as lastPurchasePrice, i.date as lastPurchaseDate
            FROM invoice_lines il
            JOIN invoices i ON il.invoiceId = i.id
            WHERE i.partnerId = ?
              AND i.type IN ('INVOICE_PURCHASE', 'PURCHASE_INVOICE')
              AND i.status NOT IN ('VOID', 'DRAFT')
              AND il.productId IN (?)
              AND i.date = (
                  SELECT MAX(i2.date)
                  FROM invoice_lines il2
                  JOIN invoices i2 ON il2.invoiceId = i2.id
                  WHERE i2.partnerId = ?
                    AND i2.type IN ('INVOICE_PURCHASE', 'PURCHASE_INVOICE')
                    AND i2.status NOT IN ('VOID', 'DRAFT')
                    AND il2.productId = il.productId
              )
            GROUP BY il.productId
        `, [id, productIds, id]);
        const lastPrices = lastPriceRows.reduce((acc, row) => {
            acc[row.productId] = { price: row.lastPurchasePrice, date: row.lastPurchaseDate };
            return acc;
        }, {});
        // 5. Build price map: { productId: { priceListId: price } }
        const priceMap = {};
        for (const pp of priceListPrices) {
            if (!priceMap[pp.productId])
                priceMap[pp.productId] = {};
            priceMap[pp.productId][pp.priceListId] = Number(pp.price);
        }
        // 6. Merge everything into the response
        const enrichedProducts = products.map(p => {
            var _a, _b, _c, _d;
            return ({
                id: p.id,
                name: p.name,
                sku: p.sku || '',
                barcode: p.barcode || '',
                cost: Number(p.cost) || 0,
                price: Number(p.price) || 0,
                unit: p.unit || '',
                lastPurchasePrice: (_b = (_a = lastPrices[p.id]) === null || _a === void 0 ? void 0 : _a.price) !== null && _b !== void 0 ? _b : null,
                lastPurchaseDate: (_d = (_c = lastPrices[p.id]) === null || _c === void 0 ? void 0 : _c.date) !== null && _d !== void 0 ? _d : null,
                priceListPrices: priceMap[p.id] || {}
            });
        });
        conn.release();
        res.json({
            products: enrichedProducts,
            priceLists: priceLists.map(pl => ({ id: pl.id, name: pl.name }))
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getSupplierProducts');
    }
});
exports.getSupplierProducts = getSupplierProducts;
// ========================================================================
// SUPPLIER PRICING — Bulk update product prices
// ========================================================================
const bulkUpdateSupplierPrices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        const { id } = req.params; // supplier ID (for audit logging)
        const { updates } = req.body;
        // updates: Array<{ productId, cost?, price?, priceListPrices?: { priceListId, price }[] }>
        if (!Array.isArray(updates) || updates.length === 0) {
            conn.release();
            return res.status(400).json({ message: 'No updates provided' });
        }
        let updatedCount = 0;
        for (const item of updates) {
            if (!item.productId)
                continue;
            // Update base cost and price on the products table
            const setClauses = [];
            const setParams = [];
            if (item.cost !== undefined && item.cost !== null) {
                setClauses.push('cost = ?');
                setParams.push(Number(item.cost));
            }
            if (item.price !== undefined && item.price !== null) {
                setClauses.push('price = ?');
                setParams.push(Number(item.price));
            }
            if (setClauses.length > 0) {
                setParams.push(item.productId);
                yield conn.query(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`, setParams);
                updatedCount++;
            }
            // Update price list prices
            if (Array.isArray(item.priceListPrices)) {
                for (const plPrice of item.priceListPrices) {
                    if (!plPrice.priceListId)
                        continue;
                    yield conn.query(`
                        INSERT INTO product_prices (productId, priceListId, price)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE price = VALUES(price)
                    `, [item.productId, plPrice.priceListId, Number(plPrice.price) || 0]);
                }
            }
        }
        yield conn.commit();
        // Audit log
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || 'System';
        // Get supplier name for audit
        const [partnerRows] = yield conn.query('SELECT name FROM partners WHERE id = ?', [id]);
        const supplierName = ((_c = partnerRows[0]) === null || _c === void 0 ? void 0 : _c.name) || id;
        yield (0, auditController_1.logAction)(user, 'PRICING', 'BULK_UPDATE', `تحديث أسعار ${updatedCount} صنف للمورد: ${supplierName}`, `Supplier ID: ${id}, Updated ${updates.length} products`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'product', updatedBy: user });
        conn.release();
        res.json({
            message: `تم تحديث ${updatedCount} صنف بنجاح`,
            updatedCount
        });
    }
    catch (error) {
        yield conn.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'bulkUpdateSupplierPrices');
    }
    finally {
        conn.release();
    }
});
exports.bulkUpdateSupplierPrices = bulkUpdateSupplierPrices;
// ========================================================================
// GET PARTNER STATEMENT (Server-Side optimized calculation)
// ========================================================================
const getPartnerStatement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { startDate, endDate, strictSupplierView } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required parameters' });
        }
        const isStrictSupplier = strictSupplierView === 'true';
        const conn = yield (0, db_1.getConnection)();
        // 1. Calculate opening balance exactly via SQL (before startDate)
        // NOTE: For legacy migrated invoices, invoices.total can be corrupt (e.g., subtotal minus
        // discount percentage instead of discount amount). We use invoice_lines to compute
        // the TRUE subtotal, then properly apply the globalDiscount to get the correct net.
        const [partnerRows] = yield conn.query(`
            SELECT p.*,
            (
                COALESCE(p.openingBalance, 0) +
                CASE WHEN ? THEN COALESCE(inv_agg.supplierReceiptImpact, 0) ELSE CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END END +
                CASE WHEN p.isSupplier = 1 THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
            ) as computedOpeningBalance
            FROM partners p
            LEFT JOIN ${buildInvAggSQL({ partnerFilter: 'AND i.partnerId = ?', dateFilter: 'AND i.date < ?', includeSupplierReceipt: true })} inv_agg ON inv_agg.partnerId = p.id
            WHERE p.id = ?
        `, [isStrictSupplier, id, startDate, id]);
        if (partnerRows.length === 0) {
            conn.release();
            return res.status(404).json({ message: 'Partner not found' });
        }
        const openingBalance = Math.round(Number(partnerRows[0].computedOpeningBalance) * 100) / 100;
        // 2. Fetch period transactions
        const endDateInclusive = new Date(endDate);
        endDateInclusive.setHours(23, 59, 59, 999);
        // Fetch transactions directly
        const [transactions] = yield conn.query(`
            SELECT i.*,
                   s.name as safeName, i.bankName, p.phone as partnerPhone 
            FROM invoices i
            LEFT JOIN banks s ON i.bankAccountId = s.id 
            LEFT JOIN partners p ON i.partnerId = p.id
            WHERE i.partnerId = ? 
            AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL') 
            AND i.date >= ? AND i.date <= ?
            ORDER BY i.date ASC, i.number ASC
        `, [id, startDate, endDateInclusive.toISOString()]);
        const invoiceIds = transactions.map(t => t.id);
        if (invoiceIds.length > 0) {
            // Fetch lines and cheques in parallel (independent tables)
            const [[allLines], [allCheques]] = yield Promise.all([
                conn.query(`SELECT * FROM invoice_lines WHERE invoiceId IN (?)`, [invoiceIds]),
                conn.query(`SELECT * FROM cheques WHERE transactionId IN (?)`, [invoiceIds]),
            ]);
            const linesMap = new Map();
            allLines.forEach(l => {
                if (!linesMap.has(l.invoiceId))
                    linesMap.set(l.invoiceId, []);
                linesMap.get(l.invoiceId).push(l);
            });
            const chequesMap = new Map();
            allCheques.forEach(c => {
                if (!chequesMap.has(c.transactionId))
                    chequesMap.set(c.transactionId, []);
                chequesMap.get(c.transactionId).push(c);
            });
            for (const t of transactions) {
                t.lines = linesMap.get(t.id) || [];
                t.transactionCheques = (chequesMap.get(t.id) || []).map((c) => (Object.assign(Object.assign({}, c), { dueDate: c.dueDate ? new Date(c.dueDate).toISOString().split('T')[0] : '', createdDate: c.createdDate ? new Date(c.createdDate).toISOString().split('T')[0] : '' })));
                t.totalImpact = t.total;
                // Parse JSON
                if (t.relatedInvoiceIds) {
                    try {
                        t.relatedInvoiceIds = JSON.parse(t.relatedInvoiceIds);
                    }
                    catch (e) {
                        t.relatedInvoiceIds = [];
                    }
                }
                else {
                    t.relatedInvoiceIds = [];
                }
                if (t.paymentBreakdown) {
                    try {
                        t.paymentBreakdown = JSON.parse(t.paymentBreakdown);
                    }
                    catch (e) {
                        t.paymentBreakdown = undefined;
                    }
                }
                if (t.bankTransfers) {
                    try {
                        t.bankTransfers = JSON.parse(t.bankTransfers);
                    }
                    catch (e) {
                        t.bankTransfers = [];
                    }
                }
            }
        }
        else {
            for (const t of transactions) {
                t.lines = [];
                t.transactionCheques = [];
                t.relatedInvoiceIds = [];
            }
        }
        // Also compute ALL-TIME balance and update stored balance to fix stale values
        const partner = partnerRows[0];
        const [rtBalResult] = yield conn.query(`
            SELECT 
                (
                    COALESCE(?, 0) +
                    CASE WHEN ? = 0 OR ? = 1 THEN COALESCE(inv_agg.cImpact, 0) + COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END +
                    CASE WHEN ? = 1 THEN COALESCE(inv_agg.sImpact, 0) - COALESCE(inv_agg.bounceImpact, 0) ELSE 0 END
                ) as calculatedBalance
            FROM (SELECT 1) dummy
            LEFT JOIN ${buildInvAggSQL({ partnerFilter: 'AND i.partnerId = ?' })} inv_agg ON 1=1
        `, [partner.openingBalance || 0, partner.isSupplier, partner.isCustomer, partner.isSupplier, id]);
        const realTimeBalance = Math.round(Number(((_a = rtBalResult[0]) === null || _a === void 0 ? void 0 : _a.calculatedBalance) || partner.openingBalance || 0) * 100) / 100;
        // Auto-correct stale stored balance
        try {
            yield conn.query('UPDATE partners SET balance = ? WHERE id = ?', [realTimeBalance, id]);
        }
        catch (e) {
            // Non-critical — don't fail the request
        }
        conn.release();
        res.json({
            openingBalance,
            transactions,
            realTimeBalance
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getPartnerStatement');
    }
});
exports.getPartnerStatement = getPartnerStatement;
