"use strict";
/**
 * Policy Enforcement Utility
 * Server-side enforcement of all system policies
 * تطبيق السياسات على الخادم
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
exports.validateFiscalLockDate = validateFiscalLockDate;
exports.validatePostDatedTransaction = validatePostDatedTransaction;
exports.validateLockOldTransactions = validateLockOldTransactions;
exports.validateTransactionNotes = validateTransactionNotes;
exports.validateCostCenter = validateCostCenter;
exports.validateWarehouseSelection = validateWarehouseSelection;
exports.validateCostEntry = validateCostEntry;
exports.validateTransactionAmountLimit = validateTransactionAmountLimit;
exports.validateLargeTransactionApproval = validateLargeTransactionApproval;
exports.validateEditPostedInvoice = validateEditPostedInvoice;
exports.validateDeletePostedInvoice = validateDeletePostedInvoice;
exports.validateModifyOthersData = validateModifyOthersData;
exports.validateNegativeStock = validateNegativeStock;
exports.validateCreditLimit = validateCreditLimit;
exports.validateTransaction = validateTransaction;
exports.validateTransactionAsync = validateTransactionAsync;
exports.validateTransactionFull = validateTransactionFull;
exports.enforceOverdraftCheck = enforceOverdraftCheck;
const db_1 = require("../db");
/**
 * Validate fiscal lock date
 * التحقق من تاريخ الإقفال المالي
 */
function validateFiscalLockDate(transactionDate, config) {
    if (!config.fiscalLockDate) {
        return { valid: true };
    }
    const lockDate = new Date(config.fiscalLockDate);
    const txDate = new Date(transactionDate);
    if (txDate <= lockDate) {
        const message = `لا يمكن إجراء معاملات قبل تاريخ الإقفال المالي (${config.fiscalLockDate})`;
        if (config.fiscalLockType === 'STRICT') {
            return {
                valid: false,
                error: message,
                errorCode: 'FISCAL_LOCK_STRICT'
            };
        }
        else {
            // Warning mode - allow but log
            console.warn(`⚠️ Warning: Transaction before fiscal lock date: ${transactionDate}`);
            return { valid: true };
        }
    }
    return { valid: true };
}
/**
 * Validate post-dated transactions
 * التحقق من المعاملات المستقبلية
 */
function validatePostDatedTransaction(transactionDate, config) {
    if (config.allowPostDatedTransactions) {
        return { valid: true };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const txDate = new Date(transactionDate);
    txDate.setHours(0, 0, 0, 0);
    if (txDate > today) {
        return {
            valid: false,
            error: 'لا يُسمح بإدخال معاملات بتاريخ مستقبلي. يرجى تفعيل هذا الخيار من إعدادات النظام.',
            errorCode: 'POST_DATED_NOT_ALLOWED'
        };
    }
    return { valid: true };
}
/**
 * Validate lock old transactions
 * التحقق من قفل تعديل المعاملات القديمة
 */
function validateLockOldTransactions(transactionDate, config) {
    if (!config.lockOldTransactionsDays || config.lockOldTransactionsDays <= 0) {
        return { valid: true };
    }
    const txDate = new Date(transactionDate);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.lockOldTransactionsDays);
    cutoffDate.setHours(0, 0, 0, 0);
    if (txDate < cutoffDate) {
        return {
            valid: false,
            error: `لا يمكن إضافة أو تعديل معاملات أقدم من ${config.lockOldTransactionsDays} يوم`,
            errorCode: 'OLD_TRANSACTION_LOCKED'
        };
    }
    return { valid: true };
}
/**
 * Validate transaction notes requirement
 * التحقق من إلزامية الملاحظات
 */
function validateTransactionNotes(notes, config) {
    if (!config.requireTransactionNotes) {
        return { valid: true };
    }
    if (!notes || notes.trim().length === 0) {
        return {
            valid: false,
            error: 'يجب إدخال ملاحظات أو وصف للمعاملة',
            errorCode: 'NOTES_REQUIRED'
        };
    }
    return { valid: true };
}
/**
 * Validate cost center requirement
 * التحقق من إلزامية مركز التكلفة
 */
function validateCostCenter(costCenterId, config) {
    if (!config.requireCostCenter) {
        return { valid: true };
    }
    if (!costCenterId) {
        return {
            valid: false,
            error: 'يجب تحديد مركز التكلفة',
            errorCode: 'COST_CENTER_REQUIRED'
        };
    }
    return { valid: true };
}
/**
 * Validate warehouse requirement
 * التحقق من إلزامية المستودع
 */
function validateWarehouseSelection(warehouseId, config, transactionType) {
    if (!config.requireWarehouseSelection) {
        return { valid: true };
    }
    // Only require warehouse for inventory-affecting transactions
    const inventoryTypes = ['INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE', 'STOCK_IN', 'STOCK_OUT', 'TRANSFER'];
    if (transactionType && !inventoryTypes.includes(transactionType)) {
        return { valid: true };
    }
    if (!warehouseId) {
        return {
            valid: false,
            error: 'يجب تحديد المستودع',
            errorCode: 'WAREHOUSE_REQUIRED'
        };
    }
    return { valid: true };
}
/**
 * Validate cost entry requirement
 * التحقق من إلزامية إدخال التكلفة
 */
function validateCostEntry(lines, config, transactionType) {
    if (!config.requireCostEntry) {
        return { valid: true };
    }
    // Only require cost for purchase-related transactions
    const costRequiredTypes = ['INVOICE_PURCHASE', 'RETURN_SALE'];
    if (transactionType && !costRequiredTypes.includes(transactionType)) {
        return { valid: true };
    }
    if (lines && lines.length > 0) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.cost === undefined || line.cost === null || line.cost <= 0) {
                return {
                    valid: false,
                    error: `يجب إدخال تكلفة للصنف في السطر ${i + 1}`,
                    errorCode: 'COST_REQUIRED'
                };
            }
        }
    }
    return { valid: true };
}
/**
 * Validate transaction amount limits
 * التحقق من حدود مبالغ المعاملات
 */
function validateTransactionAmountLimit(total, userRole, config) {
    if (!config.enableTransactionAmountLimit || !total || !userRole) {
        return { valid: true };
    }
    const limits = config.transactionLimits;
    if (!limits) {
        return { valid: true };
    }
    const limit = limits[userRole];
    if (limit !== undefined && limit !== null && total > limit) {
        return {
            valid: false,
            error: `مبلغ المعاملة (${total.toLocaleString()}) يتجاوز الحد المسموح لدورك الوظيفي (${limit.toLocaleString()})`,
            errorCode: 'AMOUNT_LIMIT_EXCEEDED'
        };
    }
    return { valid: true };
}
/**
 * Validate large transaction approval
 * التحقق من الموافقة على المعاملات الكبيرة
 */
function validateLargeTransactionApproval(total, hasApproval, config) {
    if (!config.requireApprovalForLargeTransactions || !total) {
        return { valid: true };
    }
    const threshold = config.largeTransactionThreshold || 0;
    if (total > threshold && !hasApproval) {
        return {
            valid: false,
            error: `المعاملات التي تتجاوز ${threshold.toLocaleString()} تتطلب موافقة المدير`,
            errorCode: 'APPROVAL_REQUIRED'
        };
    }
    return { valid: true };
}
/**
 * Validate edit posted invoice
 * التحقق من السماح بتعديل الفواتير المرحلة
 */
function validateEditPostedInvoice(isPosted, config) {
    if (config.allowEditPostedInvoices) {
        return { valid: true };
    }
    if (isPosted) {
        return {
            valid: false,
            error: 'لا يمكن تعديل الفواتير المرحلة. يرجى تفعيل هذا الخيار من إعدادات النظام.',
            errorCode: 'EDIT_POSTED_NOT_ALLOWED'
        };
    }
    return { valid: true };
}
/**
 * Validate delete posted invoice
 * التحقق من السماح بحذف الفواتير المرحلة
 */
function validateDeletePostedInvoice(isPosted, config) {
    if (config.allowDeletePostedInvoices) {
        return { valid: true };
    }
    if (isPosted) {
        return {
            valid: false,
            error: 'لا يمكن حذف الفواتير المرحلة. يرجى تفعيل هذا الخيار من إعدادات النظام.',
            errorCode: 'DELETE_POSTED_NOT_ALLOWED'
        };
    }
    return { valid: true };
}
/**
 * Validate modify others' data
 * التحقق من السماح بتعديل بيانات الآخرين
 */
function validateModifyOthersData(originalCreator, currentUser, currentUserRole, config) {
    // If not an update (no original creator), allow
    if (!originalCreator || !currentUser) {
        return { valid: true };
    }
    const normalize = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const creatorNormalized = normalize(originalCreator);
    const currentUserTokens = currentUser.split('|').map(normalize);
    // If same user (either username or name matches original creator), always allow
    if (currentUserTokens.includes(creatorNormalized)) {
        return { valid: true };
    }
    // Administrative roles (MASTER_ADMIN, ADMIN, GENERAL_MANAGER) can always modify others' data
    const normalizedRole = currentUserRole === null || currentUserRole === void 0 ? void 0 : currentUserRole.toUpperCase();
    if (normalizedRole === 'MASTER_ADMIN' ||
        normalizedRole === 'ADMIN' ||
        normalizedRole === 'GENERAL_MANAGER') {
        return { valid: true };
    }
    // Check if modification of others' data is enabled
    if (!config.enableModifyOthersData) {
        return {
            valid: false,
            error: 'لا يمكنك تعديل بيانات أدخلها مستخدم آخر',
            errorCode: 'MODIFY_OTHERS_NOT_ALLOWED'
        };
    }
    // Check if user's role is in the allowed list
    const allowedRoles = config.whoCanModifyOthersData || [];
    if (!allowedRoles.includes(currentUserRole)) {
        return {
            valid: false,
            error: 'دورك الوظيفي لا يسمح بتعديل بيانات الآخرين',
            errorCode: 'ROLE_CANNOT_MODIFY_OTHERS'
        };
    }
    return { valid: true };
}
/**
 * Validate negative stock
 * التحقق من المخزون السالب
 *
 * CONCURRENCY FIX: When `existingConn` is provided (from a transaction),
 * uses SELECT ... FOR UPDATE to lock the product row, preventing two
 * concurrent sales from overselling the same stock.
 */
function validateNegativeStock(lines, transactionType, config, existingConn, warehouseId, existingInvoiceId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (config.allowNegativeStock) {
            return { valid: true };
        }
        const stockReducingTypes = ['INVOICE_SALE', 'RETURN_PURCHASE', 'STOCK_OUT', 'TRANSFER_OUT'];
        if (!transactionType || !stockReducingTypes.includes(transactionType)) {
            return { valid: true };
        }
        if (!lines || lines.length === 0) {
            return { valid: true };
        }
        const conn = existingConn || (yield (0, db_1.getConnection)());
        const needsRelease = !existingConn;
        // When updating an existing posted invoice, its old lines will be reversed
        // before the new lines are applied. Build a per-product credit map so the
        // validation sees effective stock = currentStock + oldQty, preventing false
        // lockouts on re-saves of already-deducted invoices.
        const oldQtyCredit = {};
        if (existingInvoiceId && existingConn) {
            const [oldLineRows] = yield existingConn.query(`SELECT il.productId, il.quantity, il.bonusQty
             FROM invoice_lines il
             JOIN invoices i ON i.id = il.invoiceId
             WHERE il.invoiceId = ? AND (i.status IN ('POSTED', 'PAID', 'PARTIAL', 'PARTIALLY_PAID') OR i.posted = 1)`, [existingInvoiceId]);
            for (const ol of oldLineRows) {
                const qty = (Number(ol.quantity) || 0) + (Number(ol.bonusQty) || 0);
                oldQtyCredit[ol.productId] = (oldQtyCredit[ol.productId] || 0) + qty;
            }
        }
        try {
            for (const line of lines) {
                const lockClause = existingConn ? 'FOR UPDATE' : '';
                let currentStock = 0;
                let productName = '';
                // ── Stock resolution: MAX across all available sources ──
                // stock_movements can have NULL warehouse_id for old records, so we
                // query BOTH filtered and unfiltered totals. Cross-check against
                // product_stocks and products.stock caches. Use MAX to prevent
                // false lockouts when any single source drifts or is incomplete.
                const [totalRows] = yield conn.query(`SELECT COALESCE(SUM(sm.qty_change), 0) as totalStock, p.stock as globalStock, p.name, p.type
                 FROM products p
                 LEFT JOIN stock_movements sm ON sm.product_id = p.id
                 WHERE p.id = ?`, [line.productId]);
                const totalRow = totalRows[0];
                if (!(totalRow === null || totalRow === void 0 ? void 0 : totalRow.name)) {
                    productName = `Unknown (${line.productId})`;
                    continue;
                }
                if (totalRow.type === 'SERVICE' || totalRow.type === 'خدمة') {
                    continue;
                }
                productName = totalRow.name;
                const totalMovementsStock = Number(totalRow.totalStock) || 0;
                const globalProductStock = Number(totalRow.globalStock) || 0;
                // Warehouse-specific values (if warehouse context is provided)
                let warehouseMovementsStock = 0;
                let warehouseCachedStock = 0;
                if (warehouseId) {
                    const [whSmRows] = yield conn.query(`SELECT COALESCE(SUM(qty_change), 0) as stock
                     FROM stock_movements WHERE product_id = ? AND warehouse_id = ?`, [line.productId, warehouseId]);
                    warehouseMovementsStock = Number((_a = whSmRows[0]) === null || _a === void 0 ? void 0 : _a.stock) || 0;
                    const [whPsRows] = yield conn.query(`SELECT stock FROM product_stocks WHERE productId = ? AND warehouseId = ?`, [line.productId, warehouseId]);
                    warehouseCachedStock = Number((_b = whPsRows[0]) === null || _b === void 0 ? void 0 : _b.stock) || 0;
                }
                // Use MAX of all sources — the highest credible number wins
                currentStock = Math.max(totalMovementsStock, // all-warehouse movements (most complete)
                warehouseMovementsStock, // this-warehouse movements
                warehouseCachedStock, // product_stocks cache for this warehouse
                globalProductStock // products.stock global field
                );
                // Credit back old invoice quantities: the update will reverse them
                // before re-applying, so effective available = currentStock + oldQty
                const creditQty = oldQtyCredit[line.productId] || 0;
                if (creditQty > 0) {
                    currentStock += creditQty;
                    console.log(`🔄 [STOCK] Update credit: product="${productName}" (${line.productId}) +${creditQty} from existing invoice → effectiveStock=${currentStock}`);
                }
                if (warehouseId && currentStock !== warehouseMovementsStock && warehouseMovementsStock > 0) {
                    console.warn(`⚠️ [STOCK] DRIFT: product="${productName}" (${line.productId}), wh=${warehouseId}: wh_movements=${warehouseMovementsStock}, total_movements=${totalMovementsStock}, ps_cache=${warehouseCachedStock}, global=${globalProductStock} → using MAX(${currentStock})`);
                }
                const newStock = currentStock - Math.abs(line.quantity);
                if (newStock < 0) {
                    console.warn(`🚫 [STOCK] REJECTED: product="${productName}" (${line.productId}), warehouse=${warehouseId || 'GLOBAL'}, currentStock=${currentStock}, requested=${line.quantity}, deficit=${Math.abs(newStock)}`);
                    if (needsRelease)
                        conn.release();
                    return {
                        valid: false,
                        error: `الكمية المطلوبة (${line.quantity}) تتجاوز المخزون المتاح (${currentStock}) للصنف: ${productName}`,
                        errorCode: 'NEGATIVE_STOCK_NOT_ALLOWED'
                    };
                }
            }
            if (needsRelease)
                conn.release();
        }
        catch (error) {
            if (needsRelease)
                try {
                    conn.release();
                }
                catch (_c) { }
            console.error('Error validating negative stock:', error);
        }
        return { valid: true };
    });
}
/**
 * Validate credit limit
 * التحقق من حد الائتمان
 */
function validateCreditLimit(partnerId, transactionTotal, transactionType, config) {
    return __awaiter(this, void 0, void 0, function* () {
        // If strict credit limit is not enabled, skip
        if (!config.enableStrictCreditLimit) {
            return { valid: true };
        }
        // Only check for sales transactions
        const salesTypes = ['INVOICE_SALE'];
        if (!transactionType || !salesTypes.includes(transactionType)) {
            return { valid: true };
        }
        if (!partnerId || !transactionTotal) {
            return { valid: true };
        }
        try {
            const conn = yield (0, db_1.getConnection)();
            const [rows] = yield conn.query('SELECT name, creditLimit, balance FROM partners WHERE id = ?', [partnerId]);
            const partner = rows[0];
            conn.release();
            if (partner && partner.creditLimit > 0) {
                const currentBalance = Number(partner.balance) || 0;
                const newBalance = currentBalance + transactionTotal;
                if (newBalance > partner.creditLimit) {
                    return {
                        valid: false,
                        error: `العميل "${partner.name}" تجاوز حد الائتمان. الرصيد الحالي: ${currentBalance.toLocaleString()}، حد الائتمان: ${partner.creditLimit.toLocaleString()}`,
                        errorCode: 'CREDIT_LIMIT_EXCEEDED'
                    };
                }
            }
        }
        catch (error) {
            console.error('Error validating credit limit:', error);
            // Don't block on validation errors
        }
        return { valid: true };
    });
}
/**
 * Run all synchronous validations
 * تشغيل جميع التحققات المتزامنة
 */
function validateTransaction(context, config) {
    // Fiscal lock date
    let result = validateFiscalLockDate(context.date, config);
    if (!result.valid)
        return result;
    // Post-dated transactions
    result = validatePostDatedTransaction(context.date, config);
    if (!result.valid)
        return result;
    // Lock old transactions
    result = validateLockOldTransactions(context.date, config);
    if (!result.valid)
        return result;
    // Transaction notes
    result = validateTransactionNotes(context.notes, config);
    if (!result.valid)
        return result;
    // Cost center
    result = validateCostCenter(context.costCenterId, config);
    if (!result.valid)
        return result;
    // Warehouse selection
    result = validateWarehouseSelection(context.warehouseId, config, context.type);
    if (!result.valid)
        return result;
    // Cost entry
    result = validateCostEntry(context.lines, config, context.type);
    if (!result.valid)
        return result;
    // Amount limits
    result = validateTransactionAmountLimit(context.total, context.currentUserRole, config);
    if (!result.valid)
        return result;
    // Modify others' data
    result = validateModifyOthersData(context.createdBy, context.currentUser, context.currentUserRole, config);
    if (!result.valid)
        return result;
    return { valid: true };
}
/**
 * Run all async validations (database lookups)
 * تشغيل جميع التحققات غير المتزامنة
 */
function validateTransactionAsync(context, config, existingConn) {
    return __awaiter(this, void 0, void 0, function* () {
        // Negative stock — pass connection for FOR UPDATE locking + warehouseId for accurate per-warehouse check
        // existingInvoiceId allows update validation to credit back old quantities before checking
        let result = yield validateNegativeStock(context.lines, context.type, config, existingConn, context.warehouseId, context.existingInvoiceId);
        if (!result.valid)
            return result;
        // Credit limit
        result = yield validateCreditLimit(context.partnerId, context.total, context.type, config);
        if (!result.valid)
            return result;
        return { valid: true };
    });
}
/**
 * Full transaction validation (sync + async)
 * التحقق الكامل من المعاملة
 */
function validateTransactionFull(context, config, existingConn) {
    return __awaiter(this, void 0, void 0, function* () {
        // Run sync validations first
        const syncResult = validateTransaction(context, config);
        if (!syncResult.valid)
            return syncResult;
        // Run async validations — pass connection for row locking
        const asyncResult = yield validateTransactionAsync(context, config, existingConn);
        if (!asyncResult.valid)
            return asyncResult;
        return { valid: true };
    });
}
/**
 * Enforce overdraft check for bank/cash accounts
 * التحقق من رصيد الحسابات البنكية أو الخزينة لمنع السحب على المكشوف
 */
function enforceOverdraftCheck(accountIds, config, conn) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!config || !config.preventBankOverdraft)
            return { valid: true };
        const uniqueIds = Array.from(new Set(accountIds.filter(Boolean)));
        if (uniqueIds.length === 0)
            return { valid: true };
        const [rows] = yield conn.query(`SELECT a.id, a.name, a.code, a.type,
            COALESCE(a.openingBalance, 0) + 
            COALESCE((SELECT SUM(jl.debit) - SUM(jl.credit) FROM journal_lines jl WHERE jl.accountId = a.id), 0) as balance
         FROM accounts a WHERE a.id IN (?)`, [uniqueIds]);
        for (const row of rows) {
            const isCashOrBank = row.type === 'ASSET' && (row.code.startsWith('101') || row.code.startsWith('102') ||
                row.name.includes('خزينة') || row.name.includes('صندوق') || row.name.includes('بنك'));
            if (!isCashOrBank)
                continue;
            if (Number(row.balance) < 0) {
                return {
                    valid: false,
                    error: `رصيد الحساب غير كافٍ لإجراء هذه العملية. الحساب: ${row.name}، الرصيد المتبقي بعد العملية: ${Number(row.balance).toFixed(2)}`,
                    errorCode: 'INSUFFICIENT_BANK_BALANCE'
                };
            }
        }
        return { valid: true };
    });
}
