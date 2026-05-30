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
exports.getSalesmanStats = exports.getAllSalesmanStats = exports.getTargetProgressReport = exports.updateTargetAchievement = exports.deleteSalesmanTarget = exports.updateSalesmanTarget = exports.createSalesmanTarget = exports.getAllActiveTargets = exports.getSalesmanTargets = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
// Get all targets for a salesman (with dynamic achievement calculation)
// Supports both salesmanId and userId lookups for mobile compatibility
const getSalesmanTargets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { salesmanId } = req.params;
    try {
        const conn = yield (0, db_1.getConnection)();
        // First, check if the passed ID is a user ID and get the salesman ID
        // This allows mobile apps to pass user.id instead of requiring salesman.id
        let actualSalesmanId = salesmanId;
        const [salesmanCheck] = yield conn.query('SELECT id FROM salesmen WHERE id = ? OR userId = ? LIMIT 1', [salesmanId, salesmanId]);
        if (salesmanCheck && salesmanCheck.length > 0) {
            actualSalesmanId = salesmanCheck[0].id;
            console.log(`📊 Resolved salesman ID: ${actualSalesmanId} from input: ${salesmanId}`);
        }
        else {
            console.log(`📊 No salesman found for ID: ${salesmanId}`);
            conn.release();
            return res.json([]); // Return empty array if no salesman found
        }
        // Dynamic calculation of achieved values based on invoices (POSTED)
        // Adjust for RETURNS (subtracting from achievement)
        const [rows] = yield conn.query(`
            SELECT st.*,
                   s.name as salesmanName,
                   p.name as productName,
                   c.name as categoryName,
                   (
                       SELECT COALESCE(SUM(
                           CASE 
                               WHEN i.type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN il.quantity 
                               WHEN i.type = 'RETURN_SALE' THEN -il.quantity
                               ELSE 0 
                           END
                       ), 0)
                       FROM invoice_lines il
                       JOIN invoices i ON il.invoiceId = i.id
                       WHERE i.salesmanId = st.salesmanId
                         AND i.status = 'POSTED'
                         AND i.date >= st.periodStart
                         AND i.date <= st.periodEnd
                         AND (
                            (st.targetType = 'PRODUCT' AND il.productId = st.productId)
                            OR
                            (st.targetType = 'CATEGORY' AND st.categoryId IS NOT NULL AND il.productId IN (SELECT id FROM products WHERE categoryId = st.categoryId))
                            OR
                            (st.targetType = 'CATEGORY' AND st.categoryId IS NULL)
                            OR
                            (st.targetType = 'SALES_AMOUNT')
                         )
                   ) as achievedQuantity,
                   (
                       SELECT COALESCE(SUM(
                           CASE 
                               WHEN i.type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN il.total 
                               WHEN i.type = 'RETURN_SALE' THEN -il.total
                               ELSE 0 
                           END
                       ), 0)
                       FROM invoice_lines il
                       JOIN invoices i ON il.invoiceId = i.id
                       WHERE i.salesmanId = st.salesmanId
                         AND i.status = 'POSTED'
                         AND i.date >= st.periodStart
                         AND i.date <= st.periodEnd
                         AND (
                            (st.targetType = 'PRODUCT' AND il.productId = st.productId)
                            OR
                            (st.targetType = 'CATEGORY' AND st.categoryId IS NOT NULL AND il.productId IN (SELECT id FROM products WHERE categoryId = st.categoryId))
                            OR
                            (st.targetType = 'CATEGORY' AND st.categoryId IS NULL)
                            OR
                            (st.targetType = 'SALES_AMOUNT')
                         )
                   ) as achievedAmount
            FROM salesman_targets st
            LEFT JOIN salesmen s ON st.salesmanId = s.id
            LEFT JOIN products p ON st.productId = p.id
            LEFT JOIN categories c ON st.categoryId = c.id
            WHERE st.salesmanId = ?
            ORDER BY st.periodStart DESC
        `, [actualSalesmanId]);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching salesman targets:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'salesman targets');
    }
});
exports.getSalesmanTargets = getSalesmanTargets;
// Get all active targets (with dynamic achievement calculation)
const getAllActiveTargets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const today = new Date().toISOString().split('T')[0];
        const [rows] = yield conn.query(`
            SELECT st.*,
                   s.name as salesmanName,
                   p.name as productName,
                   c.name as categoryName,
                   (
                       SELECT COALESCE(SUM(
                           CASE 
                               WHEN i.type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN il.quantity 
                               WHEN i.type = 'RETURN_SALE' THEN -il.quantity
                               ELSE 0 
                           END
                       ), 0)
                       FROM invoice_lines il
                       JOIN invoices i ON il.invoiceId = i.id
                       WHERE i.salesmanId = st.salesmanId
                         AND i.status = 'POSTED'
                         AND i.date >= st.periodStart
                         AND i.date <= st.periodEnd
                         AND (
                            (st.targetType = 'PRODUCT' AND il.productId = st.productId)
                            OR
                            (st.targetType = 'CATEGORY' AND st.categoryId IS NOT NULL AND il.productId IN (SELECT id FROM products WHERE categoryId = st.categoryId))
                            OR
                            (st.targetType = 'CATEGORY' AND st.categoryId IS NULL)
                            OR
                            (st.targetType = 'SALES_AMOUNT')
                         )
                   ) as achievedQuantity,
                   (
                       SELECT COALESCE(SUM(
                           CASE 
                               WHEN i.type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN il.total 
                               WHEN i.type = 'RETURN_SALE' THEN -il.total
                               ELSE 0 
                           END
                       ), 0)
                       FROM invoice_lines il
                       JOIN invoices i ON il.invoiceId = i.id
                       WHERE i.salesmanId = st.salesmanId
                         AND i.status = 'POSTED'
                         AND i.date >= st.periodStart
                         AND i.date <= st.periodEnd
                         AND (
                            (st.targetType = 'PRODUCT' AND il.productId = st.productId)
                            OR
                            (st.targetType = 'CATEGORY' AND st.categoryId IS NOT NULL AND il.productId IN (SELECT id FROM products WHERE categoryId = st.categoryId))
                            OR
                            (st.targetType = 'CATEGORY' AND st.categoryId IS NULL)
                            OR
                            (st.targetType = 'SALES_AMOUNT')
                         )
                   ) as achievedAmount
            FROM salesman_targets st
            LEFT JOIN salesmen s ON st.salesmanId = s.id
            LEFT JOIN products p ON st.productId = p.id
            LEFT JOIN categories c ON st.categoryId = c.id
            WHERE st.isActive = TRUE
              AND st.periodStart <= ?
              AND st.periodEnd >= ?
            ORDER BY s.name, st.targetType
        `, [today, today]);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching active targets:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'active targets');
    }
});
exports.getAllActiveTargets = getAllActiveTargets;
// Create a new target
const createSalesmanTarget = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { salesmanId, targetType, productId, categoryId, targetQuantity, targetAmount, periodType, periodStart, periodEnd, commissionPercentage } = req.body;
    try {
        const conn = yield (0, db_1.getConnection)();
        const id = (0, crypto_1.randomUUID)();
        yield conn.query(`
            INSERT INTO salesman_targets (
                id, salesmanId, targetType, productId, categoryId,
                targetQuantity, targetAmount, periodType, periodStart, periodEnd, commissionPercentage, isActive
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
        `, [id, salesmanId, targetType, productId || null, categoryId || null,
            targetQuantity, targetAmount || null, periodType, periodStart, periodEnd, commissionPercentage || 0]);
        conn.release();
        res.status(201).json(Object.assign({ id }, req.body));
    }
    catch (error) {
        console.error('Error creating salesman target:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'creating salesman target');
    }
});
exports.createSalesmanTarget = createSalesmanTarget;
// Update a target
const updateSalesmanTarget = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { targetQuantity, targetAmount, periodStart, periodEnd, commissionPercentage, isActive } = req.body;
    try {
        const conn = yield (0, db_1.getConnection)();
        yield conn.query(`
            UPDATE salesman_targets SET
                targetQuantity = ?,
                targetAmount = ?,
                periodStart = ?,
                periodEnd = ?,
                commissionPercentage = ?,
                isActive = ?
            WHERE id = ?
        `, [targetQuantity, targetAmount || null, periodStart, periodEnd, commissionPercentage || 0, isActive, id]);
        conn.release();
        res.json(Object.assign({ id }, req.body));
    }
    catch (error) {
        console.error('Error updating salesman target:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'updating salesman target');
    }
});
exports.updateSalesmanTarget = updateSalesmanTarget;
// Delete a target
const deleteSalesmanTarget = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const conn = yield (0, db_1.getConnection)();
        yield conn.query('DELETE FROM salesman_targets WHERE id = ?', [id]);
        conn.release();
        res.json({ message: 'Target deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting salesman target:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleting salesman target');
    }
});
exports.deleteSalesmanTarget = deleteSalesmanTarget;
// Update achieved values - DEPRECATED (Now calculated dynamically on read)
const updateTargetAchievement = (salesmanId, productId, categoryId, quantity, amount) => __awaiter(void 0, void 0, void 0, function* () {
    // This function is deprecated as targets are now calculated dynamically.
    // Keeping it as a no-op to prevent breaking existing calls until they are removed.
    return;
});
exports.updateTargetAchievement = updateTargetAchievement;
// Get target progress report for a salesman (dynamic calculation from invoices)
const getTargetProgressReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { salesmanId } = req.params;
    const { periodStart, periodEnd } = req.query;
    try {
        const conn = yield (0, db_1.getConnection)();
        const [rows] = yield conn.query(`
            SELECT st.*,
                   s.name as salesmanName,
                   p.name as productName,
                   c.name as categoryName,
                   (
                       SELECT COALESCE(SUM(
                           CASE 
                               WHEN i.type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN il.quantity 
                               WHEN i.type = 'RETURN_SALE' THEN -il.quantity
                               ELSE 0 
                           END
                       ), 0)
                       FROM invoice_lines il
                       JOIN invoices i ON il.invoiceId = i.id
                       WHERE i.salesmanId = st.salesmanId
                         AND i.status = 'POSTED'
                         AND i.date >= st.periodStart
                         AND i.date <= st.periodEnd
                         AND (
                            (st.targetType = 'PRODUCT' AND il.productId = st.productId)
                            OR
                            (st.targetType = 'CATEGORY' AND st.categoryId IS NOT NULL AND il.productId IN (SELECT id FROM products WHERE categoryId = st.categoryId))
                            OR
                            (st.targetType = 'CATEGORY' AND st.categoryId IS NULL)
                            OR
                            (st.targetType = 'SALES_AMOUNT')
                         )
                   ) as achievedQuantity,
                   (
                       SELECT COALESCE(SUM(
                           CASE 
                               WHEN i.type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN il.total 
                               WHEN i.type = 'RETURN_SALE' THEN -il.total
                               ELSE 0 
                           END
                       ), 0)
                       FROM invoice_lines il
                       JOIN invoices i ON il.invoiceId = i.id
                       WHERE i.salesmanId = st.salesmanId
                         AND i.status = 'POSTED'
                         AND i.date >= st.periodStart
                         AND i.date <= st.periodEnd
                         AND (
                            (st.targetType = 'PRODUCT' AND il.productId = st.productId)
                            OR
                            (st.targetType = 'CATEGORY' AND st.categoryId IS NOT NULL AND il.productId IN (SELECT id FROM products WHERE categoryId = st.categoryId))
                            OR
                            (st.targetType = 'CATEGORY' AND st.categoryId IS NULL)
                            OR
                            (st.targetType = 'SALES_AMOUNT')
                         )
                   ) as achievedAmount,
                   CASE 
                       WHEN st.targetQuantity > 0 THEN ROUND((
                           (SELECT COALESCE(SUM(
                               CASE 
                                   WHEN i.type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN il.quantity 
                                   WHEN i.type = 'RETURN_SALE' THEN -il.quantity
                                   ELSE 0 
                               END
                           ), 0)
                           FROM invoice_lines il
                           JOIN invoices i ON il.invoiceId = i.id
                           WHERE i.salesmanId = st.salesmanId
                             AND i.status = 'POSTED'
                             AND i.date >= st.periodStart
                             AND i.date <= st.periodEnd
                             AND (
                                (st.targetType = 'PRODUCT' AND il.productId = st.productId)
                                OR
                                (st.targetType = 'CATEGORY' AND st.categoryId IS NOT NULL AND il.productId IN (SELECT id FROM products WHERE categoryId = st.categoryId))
                                OR
                                (st.targetType = 'CATEGORY' AND st.categoryId IS NULL)
                                OR
                                (st.targetType = 'SALES_AMOUNT')
                             )
                           ) / st.targetQuantity
                       ) * 100, 1)
                       ELSE 0
                   END as progressPercent
            FROM salesman_targets st
            LEFT JOIN salesmen s ON st.salesmanId = s.id
            LEFT JOIN products p ON st.productId = p.id
            LEFT JOIN categories c ON st.categoryId = c.id
            WHERE st.salesmanId = ?
              AND st.periodStart >= COALESCE(?, st.periodStart)
              AND st.periodEnd <= COALESCE(?, st.periodEnd)
            ORDER BY st.periodStart DESC
        `, [salesmanId, periodStart || null, periodEnd || null]);
        conn.release();
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching target progress report:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'target progress report');
    }
});
exports.getTargetProgressReport = getTargetProgressReport;
/**
 * Get performance stats for all salesmen
 * GET /api/salesman-targets/stats
 * Query params: startDate, endDate (optional date range filters)
 */
const getAllSalesmanStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const authReq = req;
    const { startDate, endDate } = req.query;
    try {
        const conn = yield (0, db_1.getConnection)();
        // Build date filter — fiscal year is mandatory, user dates are additional
        let dateFilter = '';
        const dateParams = [];
        // MANDATORY: Fiscal Year Hard Boundary
        if (authReq.fiscalYearFilter) {
            dateFilter += ' AND i.date >= ? AND i.date <= ?';
            dateParams.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        if (startDate) {
            dateFilter += ' AND i.date >= ?';
            dateParams.push(startDate);
        }
        if (endDate) {
            dateFilter += ' AND i.date <= ?';
            dateParams.push(endDate);
        }
        // Get all salesmen with their stats
        const [rows] = yield conn.query(`
            SELECT 
                s.id as salesmanId,
                s.name as salesmanName,
                s.type as salesmanType,
                s.commissionRate,
                
                -- Total Sales (إجمالي المبيعات)
                COALESCE((
                    SELECT SUM(
                        CASE 
                            WHEN i.type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN i.total 
                            WHEN i.type = 'RETURN_SALE' THEN -i.total
                            ELSE 0 
                        END
                    )
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    ${dateFilter}
                ), 0) as totalSales,
                
                -- Cash Sales (المبيعات النقدية)
                COALESCE((
                    SELECT SUM(i.total)
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                    AND i.paymentMethod = 'CASH'
                    ${dateFilter}
                ), 0) as totalCashSales,
                
                -- Credit Sales (المبيعات الآجلة)
                COALESCE((
                    SELECT SUM(i.total)
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                    AND i.paymentMethod = 'CREDIT'
                    ${dateFilter}
                ), 0) as totalCreditSales,
                
                -- Cheque Sales (المبيعات بشيكات)
                COALESCE((
                    SELECT SUM(i.total)
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                    AND i.paymentMethod = 'CHEQUE'
                    ${dateFilter}
                ), 0) as totalChequeSales,
                
                -- Bank Sales (المبيعات ببنوك)
                COALESCE((
                    SELECT SUM(i.total)
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                    AND i.paymentMethod = 'BANK'
                    ${dateFilter}
                ), 0) as totalBankSales,
                
                -- Invoice Count (عدد الفواتير)
                COALESCE((
                    SELECT COUNT(*)
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                    ${dateFilter}
                ), 0) as invoiceCount,
                
                -- Total Collections (إجمالي التحصيل)
                -- المحصل = المبيعات النقدية + المدفوع جزئياً من الآجل
                COALESCE((
                    SELECT SUM(
                        CASE 
                            WHEN i.paymentMethod = 'CASH' THEN i.total
                            WHEN i.paymentMethod IN ('CREDIT', 'MIXED') THEN COALESCE(i.paidAmount, 0)
                            ELSE COALESCE(i.paidAmount, 0)
                        END
                    )
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                    ${dateFilter}
                ), 0) as totalCollections,
                
                -- Treasury Collections (التحصيل من الخزينة) - Skipped if table doesn't exist
                0 as treasuryCollections,
                
                -- Customer Debt (مديونية العملاء الذين لديهم فواتير مع المندوب)
                -- Calculate from partners who have invoices with this salesman
                COALESCE((
                    SELECT SUM(p.balance)
                    FROM partners p 
                    WHERE p.balance > 0
                    AND p.isCustomer = 1
                    AND (
                        p.salesmanId = s.id 
                        OR p.id IN (
                            SELECT DISTINCT i.partnerId 
                            FROM invoices i 
                            WHERE i.salesmanId = s.id 
                            AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                            AND i.status = 'POSTED'
                        )
                    )
                ), 0) as totalCustomerDebt,
                
                -- Customer Count (عدد العملاء)
                COALESCE((
                    SELECT COUNT(DISTINCT p.id)
                    FROM partners p 
                    WHERE p.isCustomer = 1
                    AND (
                        p.salesmanId = s.id 
                        OR p.id IN (
                            SELECT DISTINCT i.partnerId 
                            FROM invoices i 
                            WHERE i.salesmanId = s.id 
                            AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                        )
                    )
                ), 0) as customerCount,

                -- Total Discounts (إجمالي الخصومات) - sum globalDiscount + discount columns
                COALESCE((
                    SELECT SUM(COALESCE(i.globalDiscount, 0) + COALESCE(i.discount, 0))
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                    ${dateFilter}
                ), 0) as totalDiscounts,

                -- Settlement Deficit (عجز التسويات) - sum of negative cashDifference from settlements
                COALESCE((
                    SELECT SUM(ABS(vs.cashDifference))
                    FROM vehicle_settlements vs
                    JOIN vehicles v ON vs.vehicleId = v.id
                    WHERE v.salesmanId = s.id
                    AND vs.cashDifference < 0
                    AND vs.status IN ('SUBMITTED', 'APPROVED')
                ), 0) as settlementDeficit


            FROM salesmen s
            ORDER BY s.name
        `, [...dateParams, ...dateParams, ...dateParams, ...dateParams, ...dateParams, ...dateParams, ...dateParams, ...dateParams, ...dateParams]);
        // Calculate deficit for each salesman
        const statsWithDeficit = rows.map((row) => (Object.assign(Object.assign({}, row), { totalSales: Number(row.totalSales) || 0, totalCashSales: Number(row.totalCashSales) || 0, totalCreditSales: Number(row.totalCreditSales) || 0, totalChequeSales: Number(row.totalChequeSales) || 0, totalBankSales: Number(row.totalBankSales) || 0, invoiceCount: Number(row.invoiceCount) || 0, totalCollections: Number(row.totalCollections) || 0, treasuryCollections: Number(row.treasuryCollections) || 0, totalCustomerDebt: Number(row.totalCustomerDebt) || 0, customerCount: Number(row.customerCount) || 0, totalDiscounts: Number(row.totalDiscounts) || 0 })));
        // Finalize stats with calculated values
        const finalStats = statsWithDeficit.map((row) => (Object.assign(Object.assign({}, row), { 
            // Use treasury collections if available, otherwise use calculated collections
            actualCollections: row.treasuryCollections > 0 ? row.treasuryCollections : row.totalCollections, 
            // العجز = عجز التسويات (الفرق السالب في الكاش من التسويات)
            totalDeficit: Number(row.settlementDeficit) || 0 })));
        conn.release();
        res.json(finalStats);
    }
    catch (error) {
        console.error('Error fetching salesman stats:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'salesman stats');
    }
});
exports.getAllSalesmanStats = getAllSalesmanStats;
/**
 * Get performance stats for a single salesman
 * GET /api/salesman-targets/stats/:salesmanId
 * Query params: startDate, endDate (optional date range filters)
 */
const getSalesmanStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { salesmanId } = req.params;
    const authReq = req;
    const { startDate, endDate } = req.query;
    try {
        const conn = yield (0, db_1.getConnection)();
        // Build date filter — fiscal year is mandatory, user dates are additional
        let dateFilter = '';
        const dateParams = [];
        // MANDATORY: Fiscal Year Hard Boundary
        if (authReq.fiscalYearFilter) {
            dateFilter += ' AND i.date >= ? AND i.date <= ?';
            dateParams.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        if (startDate) {
            dateFilter += ' AND i.date >= ?';
            dateParams.push(startDate);
        }
        if (endDate) {
            dateFilter += ' AND i.date <= ?';
            dateParams.push(endDate);
        }
        // Get salesman stats
        const [rows] = yield conn.query(`
            SELECT 
                s.id as salesmanId,
                s.name as salesmanName,
                s.type as salesmanType,
                s.commissionRate,
                
                -- Total Sales
                COALESCE((
                    SELECT SUM(
                        CASE 
                            WHEN i.type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN i.total 
                            WHEN i.type = 'RETURN_SALE' THEN -i.total
                            ELSE 0 
                        END
                    )
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    ${dateFilter}
                ), 0) as totalSales,
                
                -- Cash Sales
                COALESCE((
                    SELECT SUM(i.total)
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                    AND i.paymentMethod = 'CASH'
                    ${dateFilter}
                ), 0) as totalCashSales,
                
                -- Credit Sales
                COALESCE((
                    SELECT SUM(i.total)
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                    AND i.paymentMethod = 'CREDIT'
                    ${dateFilter}
                ), 0) as totalCreditSales,
                
                -- Invoice Count
                COALESCE((
                    SELECT COUNT(*)
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                    ${dateFilter}
                ), 0) as invoiceCount,
                
                -- Total Collections (إجمالي التحصيل)
                COALESCE((
                    SELECT SUM(
                        CASE 
                            WHEN i.paymentMethod = 'CASH' THEN i.total
                            WHEN i.paymentMethod IN ('CREDIT', 'MIXED') THEN COALESCE(i.paidAmount, 0)
                            ELSE COALESCE(i.paidAmount, 0)
                        END
                    )
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                    ${dateFilter}
                ), 0) as totalCollections,
                
                -- Customer Debt (مديونية العملاء الذين لديهم فواتير مع المندوب)
                COALESCE((
                    SELECT SUM(p.balance)
                    FROM partners p 
                    WHERE p.balance > 0
                    AND p.isCustomer = 1
                    AND (
                        p.salesmanId = s.id 
                        OR p.id IN (
                            SELECT DISTINCT i.partnerId 
                            FROM invoices i 
                            WHERE i.salesmanId = s.id 
                            AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                            AND i.status = 'POSTED'
                        )
                    )
                ), 0) as totalCustomerDebt,
                
                -- Customer Count
                COALESCE((
                    SELECT COUNT(DISTINCT p.id)
                    FROM partners p 
                    WHERE p.isCustomer = 1
                    AND (
                        p.salesmanId = s.id 
                        OR p.id IN (
                            SELECT DISTINCT i.partnerId 
                            FROM invoices i 
                            WHERE i.salesmanId = s.id 
                            AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                        )
                    )
                ), 0) as customerCount,

                -- Total Discounts (إجمالي الخصومات) - sum globalDiscount + discount columns
                COALESCE((
                    SELECT SUM(COALESCE(i.globalDiscount, 0) + COALESCE(i.discount, 0))
                    FROM invoices i 
                    WHERE i.salesmanId = s.id 
                    AND i.status = 'POSTED'
                    AND i.type IN ('INVOICE_SALE', 'SALE_INVOICE')
                    ${dateFilter}
                ), 0) as totalDiscounts,

                -- Settlement Deficit (عجز التسويات) - sum of negative cashDifference
                COALESCE((
                    SELECT SUM(ABS(vs.cashDifference))
                    FROM vehicle_settlements vs
                    JOIN vehicles v ON vs.vehicleId = v.id
                    WHERE v.salesmanId = s.id
                    AND vs.cashDifference < 0
                    AND vs.status IN ('SUBMITTED', 'APPROVED')
                ), 0) as settlementDeficit

            FROM salesmen s
            WHERE s.id = ?
        `, [...dateParams, ...dateParams, ...dateParams, ...dateParams, ...dateParams, ...dateParams, ...dateParams, salesmanId]);
        conn.release();
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'Salesman not found' });
        }
        const row = rows[0];
        const stats = Object.assign(Object.assign({}, row), { totalSales: Number(row.totalSales) || 0, totalCashSales: Number(row.totalCashSales) || 0, totalCreditSales: Number(row.totalCreditSales) || 0, invoiceCount: Number(row.invoiceCount) || 0, totalCollections: Number(row.totalCollections) || 0, totalCustomerDebt: Number(row.totalCustomerDebt) || 0, customerCount: Number(row.customerCount) || 0, totalDeficit: Number(row.settlementDeficit) || 0, totalDiscounts: Number(row.totalDiscounts) || 0 });
        res.json(stats);
    }
    catch (error) {
        console.error('Error fetching salesman stats:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'salesman stats');
    }
});
exports.getSalesmanStats = getSalesmanStats;
