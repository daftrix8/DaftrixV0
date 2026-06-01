"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequired = exports.validateInvoiceTotal = exports.handleControllerError = void 0;
/**
 * Handle controller errors with appropriate status codes
 * @param res Express Response object
 * @param error The caught error
 * @param context Description of where the error occurred (e.g., 'createInvoice')
 */
const handleControllerError = (res, error, context) => {
    var _a, _b, _c;
    console.error(`\n🚨 [CONTROLLER ERROR] in ${context}:`, error.message);
    if (error.sql) {
        console.error(`SQL: ${error.sql}`);
    }
    // Safety check: specific for when this might be called without a valid response object (e.g. sockets)
    if (!res || typeof res.status !== 'function') {
        console.error(`⚠️ handleControllerError called without valid Response object in ${context}`, error);
        return res;
    }
    // Guard: if the response was already sent (e.g. by the requestTimeout middleware),
    // don't attempt to send again — that causes ERR_HTTP_HEADERS_SENT crashes.
    if (res.headersSent) {
        console.error(`⚠️ handleControllerError: response already sent in ${context}, suppressing duplicate response`);
        return res;
    }
    // MySQL specific errors
    if (error.code === 'ER_DUP_ENTRY') {
        // MySQL format: Duplicate entry 'value' for key 'table.key_name'
        const keyMatch = (_a = error.message) === null || _a === void 0 ? void 0 : _a.match(/for key ['`]?([^'`]+)['`]?/);
        const valMatch = (_b = error.message) === null || _b === void 0 ? void 0 : _b.match(/Duplicate entry '([^']+)'/);
        const keyName = (keyMatch ? keyMatch[1] : '').toLowerCase();
        const dupValue = valMatch ? valMatch[1] : '';
        // Map known key names to human-readable Arabic field labels
        let fieldLabel = dupValue;
        if (keyName.includes('username'))
            fieldLabel = `اسم المستخدم "${dupValue}" مستخدم مسبقاً`;
        else if (keyName.includes('email'))
            fieldLabel = `البريد الإلكتروني "${dupValue}" مستخدم مسبقاً`;
        else if (keyName.includes('phone'))
            fieldLabel = `رقم الهاتف "${dupValue}" مستخدم مسبقاً`;
        else if (keyName.includes('code') || keyName.includes('sku'))
            fieldLabel = `الكود "${dupValue}" مستخدم مسبقاً`;
        else if (keyName.includes('number') || keyName.includes('num'))
            fieldLabel = `الرقم "${dupValue}" مستخدم مسبقاً`;
        else if (keyName.includes('name'))
            fieldLabel = `الاسم "${dupValue}" مستخدم مسبقاً`;
        else if (dupValue)
            fieldLabel = `القيمة "${dupValue}" مستخدمة مسبقاً`;
        else
            fieldLabel = 'البيانات مكررة';
        return res.status(409).json({
            code: 'DUPLICATE_ENTRY',
            message: `السجل موجود مسبقاً: ${fieldLabel}`,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
        return res.status(400).json({
            code: 'INVALID_REFERENCE',
            message: 'السجل المشار إليه غير موجود',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
        return res.status(400).json({
            code: 'REFERENCE_EXISTS',
            message: 'لا يمكن حذف السجل لأنه مرتبط بسجلات أخرى',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
    if (error.code === 'ER_DATA_TOO_LONG') {
        return res.status(400).json({
            code: 'DATA_TOO_LONG',
            message: 'البيانات المدخلة طويلة جداً',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
    if (error.code === 'ER_TRUNCATED_WRONG_VALUE') {
        return res.status(400).json({
            code: 'INVALID_DATA_FORMAT',
            message: 'تنسيق البيانات غير صحيح',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
    if (error.code === 'ER_BAD_FIELD_ERROR' || error.code === 1054) {
        return res.status(500).json({
            code: 'DB_SCHEMA_MISMATCH',
            message: 'خطأ في قاعدة البيانات: هناك أعمدة مفقودة. يرجى تحديث قاعدة البيانات.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
    // Application-level errors (detected by message content)
    const errorMessage = ((_c = error.message) === null || _c === void 0 ? void 0 : _c.toLowerCase()) || '';
    if (errorMessage.includes('not found') || errorMessage.includes('غير موجود')) {
        return res.status(404).json({
            code: 'NOT_FOUND',
            message: error.message
        });
    }
    if (errorMessage.includes('insufficient') || errorMessage.includes('غير كافية') || errorMessage.includes('الكمية')) {
        return res.status(400).json({
            code: 'INSUFFICIENT_QUANTITY',
            message: error.message
        });
    }
    if (errorMessage.includes('already exists') || errorMessage.includes('موجود مسبقاً')) {
        return res.status(409).json({
            code: 'ALREADY_EXISTS',
            message: error.message
        });
    }
    if (errorMessage.includes('unauthorized') || errorMessage.includes('غير مصرح') || errorMessage.includes('permission denied')) {
        return res.status(403).json({
            code: 'FORBIDDEN',
            message: error.message
        });
    }
    if (errorMessage.includes('invalid input') || errorMessage.includes('validation failed') || errorMessage.includes('غير صالح')) {
        return res.status(400).json({
            code: 'VALIDATION_ERROR',
            message: error.message
        });
    }
    // Default: Internal Server Error
    // SECURITY: Do NOT expose raw error.message in production — it can contain
    // SQL fragments, table names, column names, and internal paths.
    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    const safeMessage = isDev
        ? (error.message || `حدث خطأ في ${context}`)
        : `حدث خطأ في ${context}`;
    return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: safeMessage,
        details: isDev ? error.stack : undefined
    });
};
exports.handleControllerError = handleControllerError;
/**
 * Validation error for invoice total mismatch
 */
const validateInvoiceTotal = (lines, providedTotal, taxAmount = 0, globalDiscount = 0, whtAmount = 0, shippingFee = 0) => {
    // Calculate line totals
    const lineTotal = lines.reduce((sum, line) => {
        const qty = parseFloat(line.quantity) || 0;
        const price = parseFloat(line.price) || 0;
        const lineDiscount = parseFloat(line.discount) || 0;
        const lineTotal = parseFloat(line.total) || (qty * price - lineDiscount);
        return sum + lineTotal;
    }, 0);
    // Calculate final total: (lineTotal - globalDiscount + shippingFee) + tax - WHT
    // Frontend calculates: taxableAmount = subTotal - globalDiscount + shippingFee
    // Then: invoiceTotal = taxableAmount + tax - whtAmount
    // Note: Tax is already computed on (subTotal - globalDiscount + shippingFee), so don't add shippingFee again
    const taxableAmount = lineTotal - (parseFloat(String(globalDiscount)) || 0) + (parseFloat(String(shippingFee)) || 0);
    const calculatedTotal = taxableAmount
        + (parseFloat(String(taxAmount)) || 0)
        - (parseFloat(String(whtAmount)) || 0);
    const providedTotalNum = parseFloat(String(providedTotal)) || 0;
    const difference = Math.abs(calculatedTotal - providedTotalNum);
    // Allow 1.00 tolerance for rounding errors (generous for Arabic currency)
    if (difference > 1.00) {
        return {
            valid: false,
            calculated: Math.round(calculatedTotal * 100) / 100,
            message: `إجمالي الفاتورة غير متطابق: المحسوب ${calculatedTotal.toFixed(2)}, المستلم ${providedTotalNum.toFixed(2)}`
        };
    }
    return { valid: true, calculated: Math.round(calculatedTotal * 100) / 100 };
};
exports.validateInvoiceTotal = validateInvoiceTotal;
/**
 * Common validation for required fields
 */
const validateRequired = (fields) => {
    const missing = [];
    for (const field of fields) {
        if (field.value === undefined || field.value === null || field.value === '') {
            missing.push(field.label || field.name);
        }
    }
    return {
        valid: missing.length === 0,
        missing
    };
};
exports.validateRequired = validateRequired;
exports.default = {
    handleControllerError: exports.handleControllerError,
    validateInvoiceTotal: exports.validateInvoiceTotal,
    validateRequired: exports.validateRequired
};
