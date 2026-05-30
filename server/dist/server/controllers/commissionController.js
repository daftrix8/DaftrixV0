"use strict";
/**
 * Commission Controller (مراقب العمولات)
 * Handles tiered commissions, commission records, and approval workflow
 */
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
exports.getSalesmanCommissionReport = exports.getUnassignedCustomers = exports.unassignCustomer = exports.bulkAssignCustomers = exports.assignCustomer = exports.getSalesmanCustomers = exports.getCommissionSummary = exports.markCommissionPaid = exports.rejectCommission = exports.approveCommission = exports.calculateCommission = exports.getCommissionRecords = exports.deleteCommissionTier = exports.updateCommissionTier = exports.createCommissionTier = exports.getCommissionTiers = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
// =================== COMMISSION TIERS ===================
// Get all commission tiers
const getCommissionTiers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const salesmanId = req.query.salesmanId;
        let query = `
            SELECT ct.*, s.name as salesmanName 
            FROM commission_tiers ct
            LEFT JOIN salesmen s ON ct.salesmanId = s.id
            WHERE ct.isActive = TRUE
        `;
        const params = [];
        if (salesmanId) {
            query += ' AND (ct.salesmanId = ? OR ct.isGlobal = TRUE)';
            params.push(salesmanId);
        }
        query += ' ORDER BY ct.minAmount ASC';
        const [tiers] = yield conn.query(query, params);
        conn.release();
        res.json(tiers);
    }
    catch (error) {
        console.error('Error fetching commission tiers:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch commission tiers');
    }
});
exports.getCommissionTiers = getCommissionTiers;
// Helper function to check tier overlap
const checkTierOverlap = (conn, tierId, isGlobal, salesmanId, minAmount, maxAmount) => __awaiter(void 0, void 0, void 0, function* () {
    let query = `
        SELECT id, tierName, minAmount, maxAmount 
        FROM commission_tiers 
        WHERE isActive = TRUE 
          AND (? < COALESCE(maxAmount, 999999999999))
          AND (COALESCE(?, 999999999999) > minAmount)
    `;
    const params = [minAmount, maxAmount];
    if (tierId) {
        query += ` AND id != ?`;
        params.push(tierId);
    }
    if (isGlobal) {
        query += ` AND isGlobal = TRUE`;
    }
    else {
        query += ` AND (salesmanId = ? OR isGlobal = TRUE)`;
        params.push(salesmanId);
    }
    const [overlapping] = yield conn.query(query, params);
    return overlapping[0];
});
// Create commission tier
const createCommissionTier = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const conn = yield (0, db_1.getConnection)();
        const { salesmanId, tierName, minAmount, maxAmount, commissionRate, isGlobal } = req.body;
        const overlapping = yield checkTierOverlap(conn, null, isGlobal || false, salesmanId, minAmount, maxAmount || null);
        if (overlapping) {
            conn.release();
            return res.status(409).json({ error: `تعارض مع النطاق: ${overlapping.tierName} (${overlapping.minAmount} - ${(_a = overlapping.maxAmount) !== null && _a !== void 0 ? _a : '∞'})` });
        }
        const id = (0, crypto_1.randomUUID)();
        yield conn.query(`
            INSERT INTO commission_tiers (id, salesmanId, tierName, minAmount, maxAmount, commissionRate, isGlobal)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, isGlobal ? null : salesmanId, tierName, minAmount, maxAmount || null, commissionRate, isGlobal || false]);
        conn.release();
        res.status(201).json({ id, message: 'Commission tier created successfully' });
    }
    catch (error) {
        console.error('Error creating commission tier:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'create commission tier');
    }
});
exports.createCommissionTier = createCommissionTier;
// Update commission tier
const updateCommissionTier = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const conn = yield (0, db_1.getConnection)();
        const { id } = req.params;
        const { salesmanId, tierName, minAmount, maxAmount, commissionRate, isGlobal, isActive } = req.body;
        const overlapping = yield checkTierOverlap(conn, id, isGlobal || false, salesmanId, minAmount, maxAmount || null);
        if (overlapping) {
            conn.release();
            return res.status(409).json({ error: `تعارض مع النطاق: ${overlapping.tierName} (${overlapping.minAmount} - ${(_a = overlapping.maxAmount) !== null && _a !== void 0 ? _a : '∞'})` });
        }
        yield conn.query(`
            UPDATE commission_tiers 
            SET salesmanId = ?, tierName = ?, minAmount = ?, maxAmount = ?, 
                commissionRate = ?, isGlobal = ?, isActive = ?
            WHERE id = ?
        `, [isGlobal ? null : salesmanId, tierName, minAmount, maxAmount || null, commissionRate, isGlobal || false, isActive !== false, id]);
        conn.release();
        res.json({ message: 'Commission tier updated successfully' });
    }
    catch (error) {
        console.error('Error updating commission tier:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'update commission tier');
    }
});
exports.updateCommissionTier = updateCommissionTier;
// Delete commission tier
const deleteCommissionTier = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const { id } = req.params;
        yield conn.query('UPDATE commission_tiers SET isActive = FALSE WHERE id = ?', [id]);
        conn.release();
        res.json({ message: 'Commission tier deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting commission tier:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete commission tier');
    }
});
exports.deleteCommissionTier = deleteCommissionTier;
// =================== COMMISSION RECORDS ===================
// Get commission records
const getCommissionRecords = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { salesmanId, status, startDate, endDate } = req.query;
        let query = `
            SELECT cr.*, 
                   s.name as salesmanName,
                   u.username as approvedByName
            FROM commission_records cr
            LEFT JOIN salesmen s ON cr.salesmanId = s.id
            LEFT JOIN users u ON cr.approvedBy = u.id
            WHERE 1=1
        `;
        const params = [];
        // ═══════════════════════════════════════════
        // MANDATORY: Fiscal Year Hard Boundary
        // ═══════════════════════════════════════════
        if (authReq.fiscalYearFilter) {
            query += ' AND cr.periodStart >= ? AND cr.periodEnd <= ?';
            params.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        if (salesmanId) {
            query += ' AND cr.salesmanId = ?';
            params.push(salesmanId);
        }
        if (status) {
            query += ' AND cr.status = ?';
            params.push(status);
        }
        if (startDate) {
            query += ' AND cr.periodStart >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND cr.periodEnd <= ?';
            params.push(endDate);
        }
        query += ' ORDER BY cr.periodEnd DESC, s.name ASC';
        const [records] = yield conn.query(query, params);
        conn.release();
        res.json(records);
    }
    catch (error) {
        console.error('Error fetching commission records:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch commission records');
    }
});
exports.getCommissionRecords = getCommissionRecords;
// Calculate and create commission record for a period
// Uses salesman_targets for commission rates with Product > Category > Global > Tier > Default hierarchy
const calculateCommission = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const { salesmanId, periodStart, periodEnd, bonusAmount, deductions, notes } = req.body;
        // Get salesman info
        const [salesmanResult] = yield conn.query('SELECT * FROM salesmen WHERE id = ?', [salesmanId]);
        const salesman = salesmanResult[0];
        if (!salesman) {
            conn.release();
            return res.status(404).json({ error: 'Salesman not found' });
        }
        // Calculate sales for the period (totals for summary)
        const [salesResult] = yield conn.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN total ELSE 0 END), 0) as totalSales,
                COALESCE(SUM(CASE WHEN type = 'RETURN_SALE' THEN total ELSE 0 END), 0) as totalReturns
            FROM invoices
            WHERE salesmanId = ?
              AND date >= ?
              AND date <= ?
              AND status = 'POSTED'
        `, [salesmanId, periodStart, periodEnd]);
        const { totalSales, totalReturns } = salesResult[0];
        const netSales = totalSales - totalReturns;
        // Get active salesman_targets for this period
        const [targetsResult] = yield conn.query(`
            SELECT st.*, p.categoryId as productCategoryId
            FROM salesman_targets st
            LEFT JOIN products p ON st.productId = p.id
            WHERE st.salesmanId = ?
              AND st.isActive = TRUE
              AND st.periodStart <= ?
              AND st.periodEnd >= ?
        `, [salesmanId, periodEnd, periodStart]);
        const targets = targetsResult;
        // Find the Global (SALES_AMOUNT) target
        const globalTarget = targets.find(t => t.targetType === 'SALES_AMOUNT');
        const globalCommissionRate = (globalTarget === null || globalTarget === void 0 ? void 0 : globalTarget.commissionPercentage) || 0;
        // Get product-level sales for detailed calculation
        const [productSalesResult] = yield conn.query(`
            SELECT 
                il.productId,
                p.categoryId,
                SUM(CASE WHEN i.type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN il.quantity ELSE -il.quantity END) as netQuantity,
                SUM(CASE WHEN i.type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN il.total ELSE -il.total END) as netAmount,
                AVG(p.cost) as avgCost,
                AVG(il.price) as avgPrice
            FROM invoice_lines il
            JOIN invoices i ON il.invoiceId = i.id
            JOIN products p ON il.productId = p.id
            WHERE i.salesmanId = ?
              AND i.date >= ?
              AND i.date <= ?
              AND i.status = 'POSTED'
            GROUP BY il.productId, p.categoryId
        `, [salesmanId, periodStart, periodEnd]);
        const productSales = productSalesResult;
        // Calculate commission based on Product > Category > Global > Tier > Default hierarchy
        let totalCommission = 0;
        const defaultRate = salesman.commissionRate || 0;
        for (const product of productSales) {
            let rate = defaultRate; // Start with salesman default
            // 1. Check Product Target
            const productTarget = targets.find(t => t.targetType === 'PRODUCT' && t.productId === product.productId);
            if (productTarget === null || productTarget === void 0 ? void 0 : productTarget.commissionPercentage) {
                rate = productTarget.commissionPercentage;
            }
            else {
                // 2. Check Category Target
                const categoryTarget = targets.find(t => t.targetType === 'CATEGORY' && t.categoryId === product.categoryId);
                if (categoryTarget === null || categoryTarget === void 0 ? void 0 : categoryTarget.commissionPercentage) {
                    rate = categoryTarget.commissionPercentage;
                }
                else if (globalCommissionRate > 0) {
                    // 3. Global Target
                    rate = globalCommissionRate;
                }
                else {
                    // 4. Fallback to Commission Tiers (Legacy)
                    const [tierResult] = yield conn.query(`
                        SELECT commissionRate FROM commission_tiers
                        WHERE (salesmanId = ? OR isGlobal = TRUE)
                          AND isActive = TRUE
                          AND minAmount <= ?
                          AND (maxAmount IS NULL OR maxAmount >= ?)
                        ORDER BY isGlobal ASC, commissionRate DESC
                        LIMIT 1
                    `, [salesmanId, netSales, netSales]);
                    if (tierResult.length > 0) {
                        rate = tierResult[0].commissionRate;
                    }
                    // else: Uses default salesman rate
                }
            }
            // Calculate commission for this product based on net sales amount
            const productCommission = product.netAmount > 0 ? (product.netAmount * rate / 100) : 0;
            totalCommission += productCommission;
        }
        // Round the total commission
        const commissionAmount = Math.round(totalCommission * 100) / 100;
        const finalAmount = commissionAmount + (bonusAmount || 0) - (deductions || 0);
        // Create record
        // Note: commissionRate is set to 0 for "mixed rates" cases. The actual calculation is in commissionAmount.
        const id = (0, crypto_1.randomUUID)();
        const effectiveRate = globalCommissionRate > 0 ? globalCommissionRate : defaultRate; // For display purposes
        yield conn.query(`
            INSERT INTO commission_records 
            (id, salesmanId, periodStart, periodEnd, totalSales, totalReturns, netSales, 
             commissionRate, commissionAmount, bonusAmount, deductions, finalAmount, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, salesmanId, periodStart, periodEnd, totalSales, totalReturns, netSales,
            effectiveRate, commissionAmount, bonusAmount || 0, deductions || 0, finalAmount, notes || 'Calculated using dynamic targets']);
        conn.release();
        res.status(201).json({
            id,
            salesmanId,
            totalSales,
            totalReturns,
            netSales,
            commissionRate: effectiveRate,
            commissionAmount,
            bonusAmount: bonusAmount || 0,
            deductions: deductions || 0,
            finalAmount,
            status: 'PENDING',
            message: 'Commission calculated successfully (using salesman_targets)'
        });
    }
    catch (error) {
        console.error('Error calculating commission:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'calculate commission');
    }
});
exports.calculateCommission = calculateCommission;
// Approve commission record
const approveCommission = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { id } = req.params;
        const userId = (_a = authReq.user) === null || _a === void 0 ? void 0 : _a.id;
        yield conn.query(`
            UPDATE commission_records 
            SET status = 'APPROVED', approvedBy = ?, approvedAt = NOW()
            WHERE id = ? AND status = 'PENDING'
        `, [userId, id]);
        conn.release();
        res.json({ message: 'Commission approved successfully' });
    }
    catch (error) {
        console.error('Error approving commission:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'approve commission');
    }
});
exports.approveCommission = approveCommission;
// Reject commission record
const rejectCommission = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const conn = yield (0, db_1.getConnection)();
        const authReq = req;
        const { id } = req.params;
        const { notes } = req.body;
        const userId = (_a = authReq.user) === null || _a === void 0 ? void 0 : _a.id;
        yield conn.query(`
            UPDATE commission_records 
            SET status = 'REJECTED', approvedBy = ?, approvedAt = NOW(), notes = CONCAT(COALESCE(notes, ''), '\nسبب الرفض: ', ?)
            WHERE id = ? AND status = 'PENDING'
        `, [userId, notes || 'لم يحدد', id]);
        conn.release();
        res.json({ message: 'Commission rejected' });
    }
    catch (error) {
        console.error('Error rejecting commission:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'reject commission');
    }
});
exports.rejectCommission = rejectCommission;
// Mark commission as paid (with treasury transaction)
const markCommissionPaid = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        // =====================================================
        // CRITICAL: Use transaction for all financial operations
        // This ensures atomicity - all succeed or all rollback
        // =====================================================
        yield conn.beginTransaction();
        const authReq = req;
        const { id } = req.params;
        const { treasuryAccountId, notes } = req.body;
        const userId = (_a = authReq.user) === null || _a === void 0 ? void 0 : _a.id;
        // Get commission record details
        const [recordResult] = yield conn.query(`SELECT cr.*, s.name as salesmanName 
             FROM commission_records cr 
             LEFT JOIN salesmen s ON cr.salesmanId = s.id 
             WHERE cr.id = ? AND cr.status = 'APPROVED'`, [id]);
        const record = recordResult[0];
        if (!record) {
            yield conn.rollback();
            conn.release();
            return res.status(404).json({ error: 'Commission record not found or not approved' });
        }
        // Verify treasury account exists
        if (treasuryAccountId) {
            const [accountResult] = yield conn.query('SELECT * FROM accounts WHERE id = ?', [treasuryAccountId]);
            const account = accountResult[0];
            if (!account) {
                yield conn.rollback();
                conn.release();
                return res.status(404).json({ error: 'Treasury account not found' });
            }
            // Create journal entry for the payment
            // 2. Create Journal Entry
            const journalId = (0, crypto_1.randomUUID)();
            const journalNumber = `COM-${Date.now()}`;
            const description = `صرف عمولة للمندوب ${record.salesmanName} - فترة ${new Date(record.periodStart).toISOString().split('T')[0]} إلى ${new Date(record.periodEnd).toISOString().split('T')[0]}`;
            // Journal Entry - Use referenceId instead of number, remove type
            yield conn.query(`
            INSERT INTO journal_entries (id, referenceId, date, description, createdBy)
            VALUES (?, ?, NOW(), ?, ?)
        `, [journalId, journalNumber, description, userId]);
            // 3. Create Journal Entry Line
            // Table is journal_lines (not journal_entry_lines)
            // Column is journalId (not journalEntryId)
            // ID is auto-increment (do not insert)
            // Commission Payment = صادر (outgoing) from Treasury
            // Debit: Commission Expense (مصروفات عمولات)
            // Credit: Treasury Account (reduce cash balance)
            // Find or use a commission expense account
            const [expenseAccResult] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%عمولات%' AND type = 'EXPENSE' LIMIT 1`);
            const expenseAccount = expenseAccResult[0];
            // Debit line: Commission Expense
            if (expenseAccount) {
                yield conn.query(`
                    INSERT INTO journal_lines (journalId, accountId, debit, credit, accountName)
                    VALUES (?, ?, ?, 0, ?)
                `, [journalId, expenseAccount.id, record.finalAmount, `مصروفات عمولات - ${record.salesmanName}`]);
            }
            // Credit line: Treasury Account (reduce balance)
            yield conn.query(`
                INSERT INTO journal_lines (journalId, accountId, debit, credit, accountName)
                VALUES (?, ?, 0, ?, ?)
            `, [journalId, treasuryAccountId, record.finalAmount, `صرف عمولة ${record.salesmanName}`]);
            // Update treasury account balance
            yield conn.query(`
                UPDATE accounts SET balance = balance - ? WHERE id = ?
            `, [record.finalAmount, treasuryAccountId]);
            // Update commission record with payment details
            yield conn.query(`
                UPDATE commission_records 
                SET status = 'PAID', paidAt = NOW(), notes = CONCAT(COALESCE(notes, ''), ?)
                WHERE id = ?
            `, [notes ? `\nملاحظات الدفع: ${notes}` : '', id]);
        }
        else {
            // No treasury account - just mark as paid
            yield conn.query(`
                UPDATE commission_records 
                SET status = 'PAID', paidAt = NOW()
                WHERE id = ? AND status = 'APPROVED'
            `, [id]);
        }
        // All operations successful - commit the transaction
        yield conn.commit();
        conn.release();
        console.log(`✅ Commission ${id} marked as paid (transaction committed)`);
        res.json({ message: 'Commission marked as paid', treasuryAccountId });
    }
    catch (error) {
        // Rollback on any error to maintain data integrity
        yield conn.rollback();
        conn.release();
        console.error('❌ Error marking commission as paid (transaction rolled back):', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'mark commission as paid');
    }
});
exports.markCommissionPaid = markCommissionPaid;
// Get commission summary for dashboard
const getCommissionSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const [summary] = yield conn.query(`
            SELECT 
                COUNT(*) as totalRecords,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pendingCount,
                SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approvedCount,
                SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) as paidCount,
                SUM(CASE WHEN status = 'PENDING' THEN finalAmount ELSE 0 END) as pendingAmount,
                SUM(CASE WHEN status = 'APPROVED' THEN finalAmount ELSE 0 END) as approvedAmount,
                SUM(CASE WHEN status = 'PAID' THEN finalAmount ELSE 0 END) as paidAmount
            FROM commission_records
        `);
        conn.release();
        res.json(summary[0]);
    }
    catch (error) {
        console.error('Error fetching commission summary:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch commission summary');
    }
});
exports.getCommissionSummary = getCommissionSummary;
// =================== SALESMAN CUSTOMERS ===================
// Get all customer assignments (from both salesman_customers table AND partners.salesmanId)
const getSalesmanCustomers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const salesmanId = req.query.salesmanId;
        // Combine both sources: explicit salesman_customers assignments AND partners linked via salesmanId
        let query = `
            SELECT sc.id, sc.salesmanId, sc.partnerId,
                   s.name as salesmanName,
                   p.name as partnerName,
                   p.phone as partnerPhone,
                   p.address as partnerAddress,
                   'commission' as source
            FROM salesman_customers sc
            JOIN salesmen s ON sc.salesmanId = s.id
            JOIN partners p ON sc.partnerId = p.id
            WHERE 1=1
            ${salesmanId ? ' AND sc.salesmanId = ?' : ''}

            UNION

            SELECT CONCAT('partner-', p.id) as id, p.salesmanId, p.id as partnerId,
                   s.name as salesmanName,
                   p.name as partnerName,
                   p.phone as partnerPhone,
                   p.address as partnerAddress,
                   'partner' as source
            FROM partners p
            JOIN salesmen s ON p.salesmanId = s.id
            WHERE p.salesmanId IS NOT NULL
              AND p.type = 'CUSTOMER'
              AND p.id NOT IN (SELECT partnerId FROM salesman_customers)
            ${salesmanId ? ' AND p.salesmanId = ?' : ''}

            ORDER BY salesmanName, partnerName
        `;
        const params = [];
        if (salesmanId) {
            params.push(salesmanId);
            params.push(salesmanId);
        }
        const [assignments] = yield conn.query(query, params);
        conn.release();
        res.json(assignments);
    }
    catch (error) {
        console.error('Error fetching customer assignments:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch customer assignment');
    }
});
exports.getSalesmanCustomers = getSalesmanCustomers;
// Assign customer to salesman
const assignCustomer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const { salesmanId, partnerId, notes } = req.body;
        const id = (0, crypto_1.randomUUID)();
        // Check if already assigned
        const [existing] = yield conn.query('SELECT id FROM salesman_customers WHERE salesmanId = ? AND partnerId = ?', [salesmanId, partnerId]);
        if (existing.length > 0) {
            conn.release();
            return res.status(400).json({ error: 'Customer already assigned to this salesman' });
        }
        yield conn.query(`
            INSERT INTO salesman_customers (id, salesmanId, partnerId, notes)
            VALUES (?, ?, ?, ?)
        `, [id, salesmanId, partnerId, notes || null]);
        // Also update partners.salesmanId for master data sync
        yield conn.query('UPDATE partners SET salesmanId = ? WHERE id = ?', [salesmanId, partnerId]);
        conn.release();
        res.status(201).json({ id, message: 'Customer assigned successfully' });
    }
    catch (error) {
        console.error('Error assigning customer:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'assign customer');
    }
});
exports.assignCustomer = assignCustomer;
// Bulk assign customers
const bulkAssignCustomers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const { salesmanId, partnerIds, notes } = req.body;
        let assignedCount = 0;
        for (const partnerId of partnerIds) {
            const id = (0, crypto_1.randomUUID)();
            try {
                yield conn.query(`
                    INSERT IGNORE INTO salesman_customers (id, salesmanId, partnerId, notes)
                    VALUES (?, ?, ?, ?)
                `, [id, salesmanId, partnerId, notes || null]);
                // Also update partners.salesmanId for master data sync
                yield conn.query('UPDATE partners SET salesmanId = ? WHERE id = ?', [salesmanId, partnerId]);
                assignedCount++;
            }
            catch (e) {
                // Skip duplicates
            }
        }
        conn.release();
        res.status(201).json({
            assignedCount,
            message: `${assignedCount} customers assigned successfully`
        });
    }
    catch (error) {
        console.error('Error bulk assigning customers:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'assign customers');
    }
});
exports.bulkAssignCustomers = bulkAssignCustomers;
// Remove customer assignment
const unassignCustomer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const { id } = req.params;
        // Get the partnerId before deleting to clear salesmanId
        const [assignment] = yield conn.query('SELECT partnerId FROM salesman_customers WHERE id = ?', [id]);
        yield conn.query('DELETE FROM salesman_customers WHERE id = ?', [id]);
        // Clear salesmanId on the partner in master data
        if (assignment.length > 0) {
            const partnerId = assignment[0].partnerId;
            yield conn.query('UPDATE partners SET salesmanId = NULL WHERE id = ?', [partnerId]);
        }
        conn.release();
        res.json({ message: 'Customer unassigned successfully' });
    }
    catch (error) {
        console.error('Error unassigning customer:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'unassign customer');
    }
});
exports.unassignCustomer = unassignCustomer;
// Get unassigned customers (not in salesman_customers AND no salesmanId in partners)
const getUnassignedCustomers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const [customers] = yield conn.query(`
            SELECT p.id, p.name, p.phone, p.address, p.type
            FROM partners p
            WHERE p.type = 'CUSTOMER'
              AND p.id NOT IN (SELECT partnerId FROM salesman_customers)
              AND (p.salesmanId IS NULL OR p.salesmanId = '')
            ORDER BY p.name
        `);
        conn.release();
        res.json(customers);
    }
    catch (error) {
        console.error('Error fetching unassigned customers:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch unassigned customer');
    }
});
exports.getUnassignedCustomers = getUnassignedCustomers;
// =================== SALESMAN COMMISSION REPORT ===================
// Get detailed salesman commission report with product breakdown
const getSalesmanCommissionReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield (0, db_1.getConnection)();
        const { salesmanId, startDate, endDate } = req.query;
        if (!salesmanId || !startDate || !endDate) {
            return res.status(400).json({ error: 'salesmanId, startDate, and endDate are required' });
        }
        // Get salesman info
        const [salesmanResult] = yield conn.query('SELECT * FROM salesmen WHERE id = ?', [salesmanId]);
        const salesman = salesmanResult[0];
        if (!salesman) {
            conn.release();
            return res.status(404).json({ error: 'Salesman not found' });
        }
        // Get product-level sales data for the period
        const [productSales] = yield conn.query(`
            SELECT 
                il.productId,
                p.name as productName,
                p.sku,
                p.cost,
                p.price as basePrice,
                SUM(CASE WHEN i.type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN il.quantity ELSE 0 END) as salesQuantity,
                SUM(CASE WHEN i.type = 'RETURN_SALE' THEN il.quantity ELSE 0 END) as returnQuantity,
                SUM(CASE WHEN i.type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN il.total ELSE 0 END) as salesAmount,
                SUM(CASE WHEN i.type = 'RETURN_SALE' THEN il.total ELSE 0 END) as returnAmount,
                AVG(il.price) as avgPrice,
                COUNT(DISTINCT i.id) as invoiceCount
            FROM invoice_lines il
            JOIN invoices i ON il.invoiceId = i.id
            JOIN products p ON il.productId = p.id
            WHERE i.salesmanId = ?
              AND i.date >= ?
              AND i.date <= ?
              AND i.status = 'POSTED'
            GROUP BY il.productId, p.name, p.sku, p.cost, p.price
            ORDER BY salesAmount DESC
        `, [salesmanId, startDate, endDate]);
        // Calculate net quantities and totals
        const productData = productSales.map(item => ({
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            cost: item.cost || 0,
            basePrice: item.basePrice || 0,
            quantity: (item.salesQuantity || 0) - (item.returnQuantity || 0),
            salesAmount: (item.salesAmount || 0) - (item.returnAmount || 0),
            avgPrice: item.avgPrice || 0,
            invoiceCount: item.invoiceCount || 0
        })).filter(item => item.quantity > 0 || item.salesAmount > 0);
        // Get totals summary
        const [totalsResult] = yield conn.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN total ELSE 0 END), 0) as totalSales,
                COALESCE(SUM(CASE WHEN type = 'RETURN_SALE' THEN total ELSE 0 END), 0) as totalReturns,
                COUNT(DISTINCT CASE WHEN type IN ('INVOICE_SALE', 'SALE_INVOICE') THEN id END) as salesInvoiceCount,
                COUNT(DISTINCT CASE WHEN type = 'RETURN_SALE' THEN id END) as returnInvoiceCount
            FROM invoices
            WHERE salesmanId = ?
              AND date >= ?
              AND date <= ?
              AND status = 'POSTED'
        `, [salesmanId, startDate, endDate]);
        const totals = totalsResult[0];
        conn.release();
        res.json({
            salesman: {
                id: salesman.id,
                name: salesman.name,
                phone: salesman.phone,
                commissionRate: salesman.commissionRate || 0
            },
            period: {
                startDate,
                endDate
            },
            productSales: productData,
            summary: {
                totalSales: totals.totalSales || 0,
                totalReturns: totals.totalReturns || 0,
                netSales: (totals.totalSales || 0) - (totals.totalReturns || 0),
                salesInvoiceCount: totals.salesInvoiceCount || 0,
                returnInvoiceCount: totals.returnInvoiceCount || 0,
                productCount: productData.length
            }
        });
    }
    catch (error) {
        console.error('Error generating salesman commission report:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'generate commission repor');
    }
});
exports.getSalesmanCommissionReport = getSalesmanCommissionReport;
