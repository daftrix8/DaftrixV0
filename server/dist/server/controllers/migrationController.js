"use strict";
/**
 * Data Migration Controller
 * Handles importing data from Excel/CSV files and external databases
 *
 * Supports:
 * - Categories (الأصناف)
 * - Partners (العملاء/الموردين)
 * - Products (المنتجات)
 * - Warehouses (المخازن)
 * - Banks (البنوك)
 * - Opening Balances (أرصدة افتتاحية)
 * - Invoices (الفواتير) - Historical
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMigrationStats = exports.importFromDatabase = exports.previewDatabaseTable = exports.getDatabaseTables = exports.testDatabaseConnection = exports.importData = exports.validateData = exports.parseUploadedFile = exports.downloadTemplate = exports.getEntities = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const exceljs_1 = __importDefault(require("exceljs"));
const promise_1 = __importDefault(require("mysql2/promise"));
const errorHandler_1 = require("../utils/errorHandler");
// Validate SQL identifiers to prevent injection (H2 security fix)
const SAFE_SQL_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function isSafeIdentifier(name) {
    return SAFE_SQL_IDENTIFIER.test(name) && name.length <= 64;
}
const ENTITY_DEFINITIONS = {
    categories: {
        name: 'categories',
        arabicName: 'الأصناف/التصنيفات',
        tableName: 'categories',
        uniqueField: 'name',
        fields: [
            { name: 'name', arabicName: 'الاسم', required: true, type: 'string', alternateNames: ['اسم الصنف', 'التصنيف', 'Category', 'CategoryName'] },
            { name: 'description', arabicName: 'الوصف', required: false, type: 'string', alternateNames: ['الوصف', 'Description', 'ملاحظات'] }
        ]
    },
    partners: {
        name: 'partners',
        arabicName: 'العملاء/الموردين',
        tableName: 'partners',
        uniqueField: 'name',
        fields: [
            { name: 'name', arabicName: 'الاسم', required: true, type: 'string', alternateNames: ['اسم العميل', 'اسم المورد', 'الاسم', 'Customer', 'Supplier', 'Partner', 'Name'] },
            { name: 'phone', arabicName: 'الهاتف', required: false, type: 'string', alternateNames: ['رقم الهاتف', 'الموبايل', 'التليفون', 'Phone', 'Mobile', 'Tel'] },
            { name: 'email', arabicName: 'البريد الإلكتروني', required: false, type: 'string', alternateNames: ['الإيميل', 'Email', 'E-mail'] },
            { name: 'address', arabicName: 'العنوان', required: false, type: 'string', alternateNames: ['العنوان', 'Address', 'الموقع'] },
            { name: 'taxId', arabicName: 'الرقم الضريبي', required: false, type: 'string', alternateNames: ['رقم التسجيل الضريبي', 'Tax ID', 'TaxID', 'VAT'] },
            { name: 'commercialRegister', arabicName: 'السجل التجاري', required: false, type: 'string', alternateNames: ['السجل التجاري', 'Commercial Register', 'CR'] },
            { name: 'openingBalance', arabicName: 'الرصيد الافتتاحي', required: false, type: 'number', defaultValue: 0, alternateNames: ['الرصيد', 'رصيد افتتاحي', 'Opening Balance', 'Balance'] },
            { name: 'creditLimit', arabicName: 'حد الائتمان', required: false, type: 'number', defaultValue: 0, alternateNames: ['الحد الائتماني', 'Credit Limit', 'Limit'] },
            { name: 'paymentTerms', arabicName: 'مدة السداد', required: false, type: 'number', defaultValue: 0, alternateNames: ['شروط الدفع', 'Payment Terms', 'Terms'] },
            { name: 'isCustomer', arabicName: 'عميل', required: false, type: 'boolean', defaultValue: false, alternateNames: ['عميل', 'Customer', 'Is Customer'] },
            { name: 'isSupplier', arabicName: 'مورد', required: false, type: 'boolean', defaultValue: false, alternateNames: ['مورد', 'Supplier', 'Is Supplier'] },
            { name: 'type', arabicName: 'النوع', required: false, type: 'string', defaultValue: 'CUSTOMER', alternateNames: ['النوع', 'Type', 'Partner Type'] },
            { name: 'classification', arabicName: 'التصنيف', required: false, type: 'string', defaultValue: 'NORMAL', alternateNames: ['تصنيف', 'Classification', 'Class'] },
            { name: 'status', arabicName: 'الحالة', required: false, type: 'string', defaultValue: 'ACTIVE', alternateNames: ['الحالة', 'Status'] },
            { name: 'contactPerson', arabicName: 'المسؤول', required: false, type: 'string', alternateNames: ['مسؤول التواصل', 'Contact', 'Contact Person'] }
        ]
    },
    products: {
        name: 'products',
        arabicName: 'المنتجات',
        tableName: 'products',
        uniqueField: 'sku',
        fields: [
            { name: 'sku', arabicName: 'الكود', required: true, type: 'string', alternateNames: ['الكود', 'كود المنتج', 'رقم الصنف', 'SKU', 'Code', 'Item Code', 'رقم'] },
            { name: 'name', arabicName: 'الاسم', required: true, type: 'string', alternateNames: ['اسم المنتج', 'الاسم', 'اسم الصنف', 'Product Name', 'Name', 'Item Name', 'الصنف'] },
            { name: 'barcode', arabicName: 'الباركود', required: false, type: 'string', alternateNames: ['الباركود', 'Barcode', 'Bar Code'] },
            { name: 'price', arabicName: 'سعر البيع', required: false, type: 'number', defaultValue: 0, alternateNames: ['السعر', 'سعر البيع', 'Price', 'Sale Price', 'Selling Price'] },
            { name: 'cost', arabicName: 'التكلفة', required: false, type: 'number', defaultValue: 0, alternateNames: ['التكلفة', 'سعر الشراء', 'Cost', 'Purchase Price', 'Buy Price'] },
            { name: 'stock', arabicName: 'الكمية', required: false, type: 'number', defaultValue: 0, alternateNames: ['الكمية', 'المخزون', 'Stock', 'Quantity', 'Qty', 'رصيد المخزون', 'stockQuantity'] },
            { name: 'minStock', arabicName: 'الحد الأدنى', required: false, type: 'number', defaultValue: 0, alternateNames: ['الحد الأدنى', 'Min Stock', 'Minimum', 'Reorder Level'] },
            { name: 'maxStock', arabicName: 'الحد الأقصى', required: false, type: 'number', defaultValue: 0, alternateNames: ['الحد الأقصى', 'Max Stock', 'Maximum'] },
            { name: 'unit', arabicName: 'الوحدة', required: false, type: 'string', defaultValue: 'piece', alternateNames: ['الوحدة', 'وحدة القياس', 'Unit', 'UOM'] },
            { name: 'categoryId', arabicName: 'التصنيف', required: false, type: 'string', alternateNames: ['التصنيف', 'الصنف', 'Category', 'Category ID'] },
            { name: 'description', arabicName: 'الوصف', required: false, type: 'string', alternateNames: ['الوصف', 'Description', 'ملاحظات'] },
            { name: 'type', arabicName: 'النوع', required: false, type: 'string', defaultValue: '', alternateNames: ['النوع', 'Type', 'Product Type'] },
            { name: 'warehouseId', arabicName: 'المخزن', required: false, type: 'string', alternateNames: ['المخزن', 'Warehouse', 'Warehouse ID'] }
        ]
    },
    warehouses: {
        name: 'warehouses',
        arabicName: 'المخازن',
        tableName: 'warehouses',
        uniqueField: 'name',
        fields: [
            { name: 'name', arabicName: 'الاسم', required: true, type: 'string', alternateNames: ['اسم المخزن', 'المخزن', 'Warehouse', 'Warehouse Name', 'Name'] },
            { name: 'keeper', arabicName: 'أمين المخزن', required: false, type: 'string', defaultValue: '', alternateNames: ['أمين المخزن', 'المسؤول', 'Keeper', 'Manager'] },
            { name: 'phone', arabicName: 'الهاتف', required: false, type: 'string', alternateNames: ['الهاتف', 'Phone', 'Tel'] },
            { name: 'branchId', arabicName: 'الفرع', required: false, type: 'string', alternateNames: ['الفرع', 'Branch', 'Branch ID'] }
        ]
    },
    banks: {
        name: 'banks',
        arabicName: 'البنوك',
        tableName: 'banks',
        uniqueField: 'accountNumber',
        fields: [
            { name: 'name', arabicName: 'اسم البنك', required: true, type: 'string', alternateNames: ['اسم البنك', 'البنك', 'Bank Name', 'Bank'] },
            { name: 'accountNumber', arabicName: 'رقم الحساب', required: true, type: 'string', alternateNames: ['رقم الحساب', 'Account Number', 'Account No', 'Account'] },
            { name: 'balance', arabicName: 'الرصيد', required: false, type: 'number', defaultValue: 0, alternateNames: ['الرصيد', 'Balance', 'Opening Balance'] },
            { name: 'currency', arabicName: 'العملة', required: false, type: 'string', defaultValue: 'EGP', alternateNames: ['العملة', 'Currency'] },
            { name: 'branch', arabicName: 'الفرع', required: false, type: 'string', alternateNames: ['الفرع', 'Branch', 'Bank Branch'] },
            { name: 'iban', arabicName: 'IBAN', required: false, type: 'string', alternateNames: ['IBAN', 'ايبان'] },
            { name: 'swift', arabicName: 'SWIFT', required: false, type: 'string', alternateNames: ['SWIFT', 'Swift Code'] },
            { name: 'type', arabicName: 'نوع الحساب', required: false, type: 'string', defaultValue: 'CURRENT', alternateNames: ['نوع الحساب', 'Account Type', 'Type'] }
        ]
    },
    accounts: {
        name: 'accounts',
        arabicName: 'الحسابات المحاسبية',
        tableName: 'accounts',
        uniqueField: 'code',
        fields: [
            { name: 'code', arabicName: 'كود الحساب', required: true, type: 'string', alternateNames: ['كود الحساب', 'رقم الحساب', 'Account Code', 'Code'] },
            { name: 'name', arabicName: 'اسم الحساب', required: true, type: 'string', alternateNames: ['اسم الحساب', 'الحساب', 'Account Name', 'Name'] },
            { name: 'type', arabicName: 'نوع الحساب', required: true, type: 'string', alternateNames: ['النوع', 'نوع الحساب', 'Account Type', 'Type'] },
            { name: 'openingBalance', arabicName: 'الرصيد الافتتاحي', required: false, type: 'number', defaultValue: 0, alternateNames: ['الرصيد الافتتاحي', 'الرصيد', 'Opening Balance', 'Balance'] }
        ]
    }
};
// ========================================
// HELPER FUNCTIONS
// ========================================
/**
 * Parse Excel/CSV file and return JSON data (using ExcelJS)
 */
function parseFile(buffer, filename) {
    return __awaiter(this, void 0, void 0, function* () {
        const workbook = new exceljs_1.default.Workbook();
        try {
            if (filename.toLowerCase().endsWith('.csv')) {
                const stream = require('stream').Readable.from(buffer);
                yield workbook.csv.read(stream);
            }
            else {
                yield workbook.xlsx.load(buffer);
            }
        }
        catch (err) {
            throw new Error(`تعذر قراءة الملف. تأكد من أن الملف بصيغة صالحة (XLSX أو CSV). التفاصيل: ${err.message}`);
        }
        // Find the data sheet - skip "تعليمات" (instructions) sheet
        let worksheet = workbook.worksheets[0];
        if (workbook.worksheets.length > 1) {
            // Find a sheet that's not instructions
            const dataSheet = workbook.worksheets.find(ws => !ws.name.includes('تعليمات') &&
                !ws.name.toLowerCase().includes('instruction'));
            if (dataSheet) {
                worksheet = dataSheet;
            }
            else {
                worksheet = workbook.worksheets[1] || workbook.worksheets[0];
            }
        }
        // Extract headers from first row
        const headers = [];
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            headers[colNumber] = cell.value ? String(cell.value).trim() : `Column${colNumber}`;
        });
        // Convert rows to JSON objects
        const data = [];
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1)
                return; // Skip header row
            const rowObj = {};
            let hasData = false;
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const header = headers[colNumber];
                if (!header)
                    return;
                let value = cell.value;
                // Handle ExcelJS cell value types
                if (value && typeof value === 'object') {
                    if ('result' in value) {
                        // Formula cell - use the result
                        value = value.result;
                    }
                    else if ('richText' in value) {
                        // Rich text - concatenate plain text
                        value = value.richText.map((rt) => rt.text).join('');
                    }
                    else if (value instanceof Date) {
                        value = value.toISOString().split('T')[0];
                    }
                }
                // Convert to string for consistency (matching xlsx raw:false behavior)
                rowObj[header] = value !== null && value !== undefined ? String(value) : null;
                if (value !== null && value !== undefined && String(value).trim() !== '') {
                    hasData = true;
                }
            });
            // Also fill in missing headers with null
            for (const h of headers) {
                if (h && !(h in rowObj)) {
                    rowObj[h] = null;
                }
            }
            if (hasData) {
                data.push(rowObj);
            }
        });
        return data;
    });
}
/**
 * Auto-detect column mappings based on column names
 */
function autoDetectMappings(columns, entityType) {
    const entity = ENTITY_DEFINITIONS[entityType];
    if (!entity)
        return {};
    const mappings = {};
    // Normalize column name - remove required marker (*) and extra spaces
    const normalizeColumn = (col) => col.replace(/\s*\*\s*$/, '').trim();
    for (const field of entity.fields) {
        // Check exact match first (with normalization)
        let matchedColumn = columns.find(col => {
            const normalizedCol = normalizeColumn(col);
            return normalizedCol.toLowerCase() === field.name.toLowerCase() ||
                normalizedCol === field.arabicName ||
                col === field.arabicName;
        });
        // Check alternate names
        if (!matchedColumn && field.alternateNames) {
            matchedColumn = columns.find(col => {
                const normalizedCol = normalizeColumn(col);
                return field.alternateNames.some(alt => normalizedCol.toLowerCase() === alt.toLowerCase() ||
                    normalizedCol.includes(alt) ||
                    alt.includes(normalizedCol) ||
                    col.includes(alt));
            });
        }
        if (matchedColumn) {
            mappings[matchedColumn] = field.name;
        }
    }
    return mappings;
}
/**
 * Validate a single row of data
 */
function validateRow(row, mappings, entityType, rowIndex) {
    const entity = ENTITY_DEFINITIONS[entityType];
    const errors = [];
    const warnings = [];
    // Check required fields
    for (const field of entity.fields) {
        if (field.required) {
            const sourceColumn = Object.keys(mappings).find(key => mappings[key] === field.name);
            if (!sourceColumn || !row[sourceColumn] || row[sourceColumn] === '') {
                errors.push(`الصف ${rowIndex + 1}: الحقل "${field.arabicName}" مطلوب`);
            }
        }
    }
    // Type validation
    for (const [sourceColumn, targetField] of Object.entries(mappings)) {
        const field = entity.fields.find(f => f.name === targetField);
        if (!field)
            continue;
        const value = row[sourceColumn];
        if (value === null || value === undefined || value === '')
            continue;
        if (field.type === 'number' && isNaN(Number(value))) {
            errors.push(`الصف ${rowIndex + 1}: القيمة "${value}" في "${field.arabicName}" يجب أن تكون رقماً`);
        }
    }
    return { valid: errors.length === 0, errors, warnings };
}
/**
 * Transform row data based on mappings
 */
function transformRow(row, mappings, entityType) {
    const entity = ENTITY_DEFINITIONS[entityType];
    const result = { id: (0, crypto_1.randomUUID)() };
    for (const [sourceColumn, targetField] of Object.entries(mappings)) {
        const field = entity.fields.find(f => f.name === targetField);
        if (!field)
            continue;
        let value = row[sourceColumn];
        // Apply default value if empty
        if ((value === null || value === undefined || value === '') && field.defaultValue !== undefined) {
            value = field.defaultValue;
        }
        // Type conversion
        if (value !== null && value !== undefined) {
            switch (field.type) {
                case 'number':
                    value = Number(value) || field.defaultValue || 0;
                    break;
                case 'boolean':
                    value = value === true || value === 'true' || value === 'نعم' || value === 'yes' || value === '1' || value === 1;
                    break;
                case 'date':
                    if (value instanceof Date) {
                        value = value.toISOString().split('T')[0];
                    }
                    break;
            }
        }
        result[targetField] = value;
    }
    // Ensure balance field exists for partners (set from openingBalance)
    if (entityType === 'partners' && result.openingBalance !== undefined) {
        result.balance = result.openingBalance;
    }
    return result;
}
// ========================================
// API ENDPOINTS
// ========================================
/**
 * GET /api/migration/entities
 * Get list of supported entities for migration
 */
const getEntities = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const entities = Object.entries(ENTITY_DEFINITIONS).map(([key, value]) => ({
            id: key,
            name: value.name,
            arabicName: value.arabicName,
            fields: value.fields.map(f => ({
                name: f.name,
                arabicName: f.arabicName,
                required: f.required,
                type: f.type
            }))
        }));
        res.json({ entities });
    }
    catch (error) {
        console.error('Error getting entities:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getEntities = getEntities;
/**
 * GET /api/migration/template/:entity
 * Download Professional Styled Excel template for an entity
 */
const downloadTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { entity } = req.params;
        const entityDef = ENTITY_DEFINITIONS[entity];
        if (!entityDef) {
            return res.status(400).json({ error: 'نوع البيانات غير مدعوم' });
        }
        // Create workbook with ExcelJS for styling
        const workbook = new exceljs_1.default.Workbook();
        workbook.creator = 'دفتريكس ERP';
        workbook.created = new Date();
        // Sanitize sheet name
        const sanitizedSheetName = entityDef.arabicName.replace(/[:\\\/\?\*\[\]]/g, ' ').substring(0, 31);
        // ========================================
        // SHEET 1: INSTRUCTIONS (تعليمات)
        // ========================================
        const instructionsSheet = workbook.addWorksheet('تعليمات', {
            views: [{ rightToLeft: true }]
        });
        // Set column width
        instructionsSheet.getColumn(1).width = 80;
        // Title
        instructionsSheet.addRow(['📋 تعليمات استيراد البيانات - دفتريكس']);
        instructionsSheet.getRow(1).font = { bold: true, size: 18, color: { argb: 'FF1E40AF' } };
        instructionsSheet.getRow(1).height = 30;
        instructionsSheet.addRow(['']);
        // Important instructions header
        instructionsSheet.addRow(['⚠️ تعليمات هامة:']);
        instructionsSheet.getRow(3).font = { bold: true, size: 14, color: { argb: 'FFDC2626' } };
        const instructions = [
            '1. لا تغير أسماء الأعمدة في الصف الأول',
            '2. الأعمدة المميزة بنجمة (*) مطلوبة ولا يمكن تركها فارغة',
            '3. احذف صفوف الأمثلة قبل إضافة بياناتك',
            '4. تأكد من عدم وجود صفوف فارغة في منتصف البيانات',
            '5. الأرقام يجب أن تكون أرقام فقط بدون فواصل أو عملات',
        ];
        instructions.forEach(inst => {
            const row = instructionsSheet.addRow([inst]);
            row.font = { size: 12 };
        });
        instructionsSheet.addRow(['']);
        // Fields header
        const fieldsHeaderRow = instructionsSheet.addRow(['📊 الأعمدة المتاحة:']);
        fieldsHeaderRow.font = { bold: true, size: 14, color: { argb: 'FF059669' } };
        // Add field descriptions
        entityDef.fields.forEach((f, i) => {
            const required = f.required ? '⭐ مطلوب' : 'اختياري';
            const typeDesc = f.type === 'number' ? '(رقم)' : f.type === 'boolean' ? '(نعم/لا)' : '(نص)';
            const row = instructionsSheet.addRow([`   ${i + 1}. ${f.arabicName} - ${required} ${typeDesc}`]);
            row.font = { size: 11, color: { argb: f.required ? 'FFDC2626' : 'FF6B7280' } };
        });
        instructionsSheet.addRow(['']);
        // Add variant instructions for products
        if (entity === 'products') {
            const variantHeader = instructionsSheet.addRow(['📦 استيراد المتغيرات (Variants):']);
            variantHeader.font = { bold: true, size: 14, color: { argb: 'FF7C3AED' } };
            const variantInstructions = [
                '• يوجد ورقة (Sheet) ثانية باسم "المتغيرات" لإضافة المتغيرات لكل منتج',
                '• عمود "كود المنتج الأب" يجب أن يطابق الكود في ورقة المنتجات',
                '• كل صف في ورقة المتغيرات يمثل متغير واحد (مثلاً: مقاس أو لون)',
                '• عمود "الخصائص" اختياري بصيغة JSON مثلاً: {"لون":"أحمر","مقاس":"L"}',
                '• إذا لم يكن للمنتج متغيرات، لا تضف شيئاً في ورقة المتغيرات',
            ];
            variantInstructions.forEach(inst => {
                const row = instructionsSheet.addRow([inst]);
                row.font = { size: 11, color: { argb: 'FF7C3AED' } };
            });
            instructionsSheet.addRow(['']);
        }
        const successRow = instructionsSheet.addRow(['✅ بعد تجهيز البيانات، ارفع هذا الملف من خلال شاشة استيراد البيانات']);
        successRow.font = { size: 12, color: { argb: 'FF059669' } };
        // ========================================
        // SHEET 2: DATA TEMPLATE
        // ========================================
        const dataSheet = workbook.addWorksheet(sanitizedSheetName, {
            views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }]
        });
        // Create headers with required indicator
        const headers = entityDef.fields.map(f => f.required ? `${f.arabicName} *` : f.arabicName);
        // Add header row with styling
        const headerRow = dataSheet.addRow(headers);
        headerRow.height = 25;
        headerRow.eachCell((cell, colNumber) => {
            const field = entityDef.fields[colNumber - 1];
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: (field === null || field === void 0 ? void 0 : field.required) ? 'FF1E40AF' : 'FF3B82F6' }
            };
            cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF000000' } },
                left: { style: 'thin', color: { argb: 'FF000000' } },
                bottom: { style: 'medium', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } }
            };
        });
        // Set column widths
        if (entity === 'products') {
            const widths = [15, 35, 18, 12, 12, 10, 12, 12, 10, 15, 40, 8, 10];
            widths.forEach((w, i) => { dataSheet.getColumn(i + 1).width = w; });
        }
        else if (entity === 'partners') {
            const widths = [30, 15, 25, 40, 15, 12, 15, 12, 10, 8, 8, 12, 12, 10, 20];
            widths.forEach((w, i) => { dataSheet.getColumn(i + 1).width = w; });
        }
        else {
            entityDef.fields.forEach((f, i) => {
                dataSheet.getColumn(i + 1).width = Math.max(f.arabicName.length * 2, 15);
            });
        }
        // Sample data based on entity type
        const sampleData = [];
        if (entity === 'products') {
            // Fields: sku, name, barcode, price, cost, stock, minStock, maxStock, unit, categoryId, description, type, warehouseId
            sampleData.push(['PRD-001', 'صابون معطر بالعود', '6221234567890', 15.00, 8.00, 100, 10, 500, 'قطعة', '', 'صابون معطر طبيعي', '', '']);
            sampleData.push(['PRD-002', 'شامبو للشعر الجاف', '6221234567891', 25.00, 12.00, 50, 5, 200, 'زجاجة', '', 'شامبو بخلاصة الأعشاب', '', '']);
            sampleData.push(['PRD-003', 'زيت زيتون بكر', '6221234567892', 85.00, 60.00, 30, 10, 100, 'لتر', '', 'زيت زيتون طبيعي 100%', '', '']);
        }
        else if (entity === 'partners') {
            sampleData.push(['محمد أحمد للتجارة', '01012345678', 'mohamed@example.com', 'القاهرة - مدينة نصر', '123456789', '12345', 5000, 10000, 30, 'نعم', 'لا', 'CUSTOMER', 'VIP', 'ACTIVE', 'أحمد محمود']);
            sampleData.push(['شركة النور للتوريدات', '01098765432', 'alnour@example.com', 'الجيزة - الهرم', '987654321', '54321', 0, 0, 0, 'لا', 'نعم', 'SUPPLIER', 'NORMAL', 'ACTIVE', 'سمير عبدالله']);
        }
        else if (entity === 'categories') {
            sampleData.push(['منظفات', 'جميع أنواع المنظفات والمطهرات']);
            sampleData.push(['أغذية', 'المواد الغذائية والمشروبات']);
            sampleData.push(['إلكترونيات', 'الأجهزة الإلكترونية وملحقاتها']);
            sampleData.push(['عناية شخصية', 'منتجات العناية بالجسم والبشرة']);
        }
        else {
            sampleData.push(entityDef.fields.map(f => {
                var _a;
                switch (f.name) {
                    case 'name': return 'مثال';
                    case 'sku': return 'SKU-001';
                    case 'code': return '1001';
                    case 'phone': return '01234567890';
                    case 'email': return 'example@email.com';
                    case 'price': return 100;
                    case 'cost': return 50;
                    default: return (_a = f.defaultValue) !== null && _a !== void 0 ? _a : '';
                }
            }));
        }
        // Add sample rows with alternating colors
        sampleData.forEach((rowData, index) => {
            const row = dataSheet.addRow(rowData);
            row.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: index % 2 === 0 ? 'FFF0F9FF' : 'FFFFFFFF' }
                };
                cell.font = { size: 11, color: { argb: 'FF374151' } };
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                };
            });
        });
        // Add empty rows for data entry with light styling
        for (let i = 0; i < 100; i++) {
            const row = dataSheet.addRow(new Array(headers.length).fill(''));
            row.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: i % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF' }
                };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                };
            });
        }
        // ========================================
        // SHEET 3 (PRODUCTS ONLY): VARIANTS TEMPLATE
        // ========================================
        if (entity === 'products') {
            const variantSheet = workbook.addWorksheet('المتغيرات', {
                views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }]
            });
            const variantHeaders = [
                'كود المنتج الأب *',
                'اسم المتغير *',
                'كود المتغير',
                'باركود',
                'سعر الشراء',
                'سعر البيع',
                'الكمية',
                'الخصائص (JSON)'
            ];
            const variantHeaderRow = variantSheet.addRow(variantHeaders);
            variantHeaderRow.height = 25;
            variantHeaderRow.eachCell((cell, colNumber) => {
                const isRequired = colNumber <= 2;
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: isRequired ? 'FF7C3AED' : 'FF8B5CF6' }
                };
                cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF000000' } },
                    left: { style: 'thin', color: { argb: 'FF000000' } },
                    bottom: { style: 'medium', color: { argb: 'FF000000' } },
                    right: { style: 'thin', color: { argb: 'FF000000' } }
                };
            });
            // Variant column widths
            const variantWidths = [18, 30, 18, 18, 14, 14, 10, 35];
            variantWidths.forEach((w, i) => { variantSheet.getColumn(i + 1).width = w; });
            // Sample variant data
            const variantSamples = [
                ['PRD-001', 'صابون عود - كبير', 'PRD-001-L', '6221234567893', 10.00, 18.00, 50, '{"مقاس":"كبير"}'],
                ['PRD-001', 'صابون عود - صغير', 'PRD-001-S', '6221234567894', 7.00, 12.00, 80, '{"مقاس":"صغير"}'],
                ['PRD-002', 'شامبو - 500 مل', 'PRD-002-500', '6221234567895', 15.00, 30.00, 30, '{"الحجم":"500 مل"}'],
                ['PRD-002', 'شامبو - 250 مل', 'PRD-002-250', '6221234567896', 8.00, 16.00, 60, '{"الحجم":"250 مل"}'],
            ];
            variantSamples.forEach((rowData, index) => {
                const row = variantSheet.addRow(rowData);
                row.eachCell((cell) => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: index % 2 === 0 ? 'FFF5F3FF' : 'FFFFFFFF' }
                    };
                    cell.font = { size: 11, color: { argb: 'FF374151' } };
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                    };
                });
            });
            // Empty rows for data entry
            for (let i = 0; i < 100; i++) {
                const row = variantSheet.addRow(new Array(variantHeaders.length).fill(''));
                row.eachCell((cell) => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: i % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF' }
                    };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                    };
                });
            }
        }
        // Generate buffer
        const buffer = yield workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=template_${entity}.xlsx`);
        res.send(Buffer.from(buffer));
    }
    catch (error) {
        console.error('Error downloading template:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.downloadTemplate = downloadTemplate;
/**
 * POST /api/migration/parse
 * Parse uploaded file and detect column mappings
 */
const parseUploadedFile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'لم يتم رفع ملف' });
        }
        const { entityType } = req.body;
        if (!entityType || !ENTITY_DEFINITIONS[entityType]) {
            return res.status(400).json({ error: 'نوع البيانات غير مدعوم' });
        }
        const data = yield parseFile(req.file.buffer, req.file.originalname);
        if (data.length === 0) {
            return res.status(400).json({ error: 'الملف فارغ' });
        }
        const columns = Object.keys(data[0]);
        const suggestedMappings = autoDetectMappings(columns, entityType);
        res.json({
            success: true,
            totalRows: data.length,
            columns,
            suggestedMappings,
            preview: data.slice(0, 10), // First 10 rows for preview
            entity: ENTITY_DEFINITIONS[entityType]
        });
    }
    catch (error) {
        console.error('Error parsing file:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.parseUploadedFile = parseUploadedFile;
/**
 * POST /api/migration/validate
 * Validate data with given mappings
 */
const validateData = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'لم يتم رفع ملف' });
        }
        const { entityType, mappings } = req.body;
        const parsedMappings = typeof mappings === 'string' ? JSON.parse(mappings) : mappings;
        if (!entityType || !ENTITY_DEFINITIONS[entityType]) {
            return res.status(400).json({ error: 'نوع البيانات غير مدعوم' });
        }
        const data = yield parseFile(req.file.buffer, req.file.originalname);
        const entity = ENTITY_DEFINITIONS[entityType];
        let allErrors = [];
        let allWarnings = [];
        let validCount = 0;
        const transformedData = [];
        // Check for duplicates in existing database
        let conn;
        const existingValues = new Set();
        try {
            conn = yield (0, db_1.getConnection)();
            if (entity.uniqueField) {
                const uniqueField = entity.uniqueField;
                // uniqueField is from code-defined ENTITY_DEFINITIONS, safe for SQL
                const sourceColumn = Object.keys(parsedMappings).find(key => parsedMappings[key] === uniqueField);
                if (sourceColumn) {
                    const [rows] = yield conn.query(`SELECT \`${uniqueField}\` FROM \`${entity.tableName}\``);
                    rows.forEach((row) => existingValues.add(String(row[uniqueField]).toLowerCase()));
                }
            }
        }
        finally {
            if (conn)
                conn.release();
        }
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            // Skip completely empty rows
            const hasData = Object.values(row).some(val => val !== null && val !== undefined && val !== '' && String(val).trim() !== '');
            if (!hasData)
                continue;
            const validation = validateRow(row, parsedMappings, entityType, i);
            if (validation.errors.length > 0) {
                allErrors.push(...validation.errors);
            }
            if (validation.warnings.length > 0) {
                allWarnings.push(...validation.warnings);
            }
            if (validation.valid) {
                const transformed = transformRow(row, parsedMappings, entityType);
                // Check for duplicate
                if (entity.uniqueField && transformed[entity.uniqueField]) {
                    const uniqueValue = String(transformed[entity.uniqueField]).toLowerCase();
                    if (existingValues.has(uniqueValue)) {
                        allWarnings.push(`الصف ${i + 1}: "${transformed[entity.uniqueField]}" موجود بالفعل في قاعدة البيانات`);
                        transformed._duplicate = true;
                    }
                }
                transformedData.push(transformed);
                validCount++;
            }
        }
        res.json({
            success: true,
            totalRows: data.length,
            validRows: validCount,
            invalidRows: data.length - validCount,
            duplicates: transformedData.filter(d => d._duplicate).length,
            errors: allErrors.slice(0, 50), // Limit errors shown
            warnings: allWarnings.slice(0, 50),
            preview: transformedData.slice(0, 20)
        });
    }
    catch (error) {
        console.error('Error validating data:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.validateData = validateData;
/**
 * POST /api/migration/import
 * Import validated data into database
 */
const importData = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'لم يتم رفع ملف' });
        }
        const { entityType, mappings, duplicateAction = 'skip', user = 'Migration' } = req.body;
        const parsedMappings = typeof mappings === 'string' ? JSON.parse(mappings) : mappings;
        if (!entityType || !ENTITY_DEFINITIONS[entityType]) {
            return res.status(400).json({ error: 'نوع البيانات غير مدعوم' });
        }
        const data = yield parseFile(req.file.buffer, req.file.originalname);
        const entity = ENTITY_DEFINITIONS[entityType];
        conn = yield (0, db_1.getConnection)();
        yield conn.beginTransaction();
        let imported = 0;
        let updated = 0;
        let skipped = 0;
        const errors = [];
        // Get existing records for duplicate checking
        const existingRecords = new Map();
        // Lookup maps for resolving names to IDs
        const categoriesMap = new Map();
        const warehousesMap = new Map();
        if (entity.uniqueField) {
            const uniqueField = entity.uniqueField;
            const [rows] = yield conn.query(`SELECT * FROM \`${entity.tableName}\``);
            rows.forEach((row) => {
                existingRecords.set(String(row[uniqueField]).toLowerCase(), row);
            });
        }
        // Pre-fetch categories and warehouses for products
        if (entityType === 'products') {
            const [cats] = yield conn.query('SELECT id, name FROM categories');
            cats.forEach((c) => categoriesMap.set(c.name.toLowerCase(), c.id));
            const [warehouses] = yield conn.query('SELECT id, name FROM warehouses');
            warehouses.forEach((w) => warehousesMap.set(w.name.toLowerCase(), w.id));
            console.log(`📋 Loaded ${categoriesMap.size} categories and ${warehousesMap.size} warehouses for lookup`);
        }
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            // Skip completely empty rows
            const hasData = Object.values(row).some(val => val !== null && val !== undefined && val !== '' && String(val).trim() !== '');
            if (!hasData)
                continue;
            const validation = validateRow(row, parsedMappings, entityType, i);
            if (!validation.valid) {
                skipped++;
                continue;
            }
            try {
                const transformed = transformRow(row, parsedMappings, entityType);
                delete transformed._duplicate;
                // Check for duplicate
                const uniqueValue = entity.uniqueField ? String(transformed[entity.uniqueField]).toLowerCase() : null;
                const existingRecord = uniqueValue ? existingRecords.get(uniqueValue) : null;
                if (existingRecord) {
                    if (duplicateAction === 'skip') {
                        console.log(`⏭️ Skipping duplicate: ${uniqueValue} (exists in DB)`);
                        skipped++;
                        continue;
                    }
                    else if (duplicateAction === 'update') {
                        // Update existing record
                        const updateFields = Object.keys(transformed)
                            .filter(k => k !== 'id' && transformed[k] !== undefined && isSafeIdentifier(k))
                            .map(k => `\`${k}\` = ?`);
                        const updateValues = Object.keys(transformed)
                            .filter(k => k !== 'id' && transformed[k] !== undefined && isSafeIdentifier(k))
                            .map(k => transformed[k]);
                        if (updateFields.length > 0) {
                            yield conn.query(`UPDATE ${entity.tableName} SET ${updateFields.join(', ')} WHERE id = ?`, [...updateValues, existingRecord.id]);
                            updated++;
                        }
                        continue;
                    }
                    // duplicateAction === 'create' - create new with different ID
                }
                // Look up Category and Warehouse IDs for Products (resolve name -> UUID)
                if (entityType === 'products') {
                    if (transformed.categoryId && typeof transformed.categoryId === 'string') {
                        const catId = categoriesMap.get(transformed.categoryId.toLowerCase());
                        if (catId) {
                            console.log(`🏷️ Resolved category "${transformed.categoryId}" -> ${catId}`);
                            transformed.categoryId = catId;
                        }
                        else {
                            console.log(`⚠️ Category "${transformed.categoryId}" not found, setting to null`);
                            transformed.categoryId = null;
                        }
                    }
                    if (transformed.warehouseId && typeof transformed.warehouseId === 'string') {
                        const whId = warehousesMap.get(transformed.warehouseId.toLowerCase());
                        if (whId) {
                            console.log(`🏢 Resolved warehouse "${transformed.warehouseId}" -> ${whId}`);
                            transformed.warehouseId = whId;
                        }
                        else {
                            console.log(`⚠️ Warehouse "${transformed.warehouseId}" not found, setting to null`);
                            transformed.warehouseId = null;
                        }
                    }
                }
                // Insert new record
                const fields = Object.keys(transformed).filter(k => transformed[k] !== undefined);
                const values = fields.map(k => transformed[k]);
                const placeholders = fields.map(() => '?').join(', ');
                console.log(`📝 Inserting into ${entity.tableName}:`, { sku: transformed.sku, name: transformed.name });
                yield conn.query(`INSERT INTO ${entity.tableName} (${fields.join(', ')}) VALUES (${placeholders})`, values);
                console.log(`✅ Successfully imported: ${transformed.sku || transformed.name}`);
                imported++;
            }
            catch (insertError) {
                console.error(`❌ Import error row ${i + 1}:`, insertError.message);
                console.error(`   Row data:`, JSON.stringify(row).substring(0, 200));
                errors.push(`الصف ${i + 1}: ${insertError.message}`);
                skipped++;
            }
        }
        // ========================================
        // VARIANT IMPORT (Products only)
        // ========================================
        let variantsImported = 0;
        if (entityType === 'products' && req.file) {
            try {
                const variantRows = yield parseVariantsSheet(req.file.buffer);
                if (variantRows.length > 0) {
                    // Build SKU → product ID map from DB (includes just-imported products)
                    const [allProducts] = yield conn.query('SELECT id, sku FROM products');
                    const skuToId = new Map();
                    allProducts.forEach((p) => {
                        if (p.sku)
                            skuToId.set(String(p.sku).trim().toLowerCase(), p.id);
                    });
                    for (let vi = 0; vi < variantRows.length; vi++) {
                        const vRow = variantRows[vi];
                        const parentSku = String(vRow.parentSku || '').trim();
                        const variantName = String(vRow.name || '').trim();
                        if (!parentSku || !variantName) {
                            errors.push(`المتغيرات صف ${vi + 1}: كود المنتج الأب والاسم مطلوبان`);
                            continue;
                        }
                        const productId = skuToId.get(parentSku.toLowerCase());
                        if (!productId) {
                            errors.push(`المتغيرات صف ${vi + 1}: المنتج بكود "${parentSku}" غير موجود`);
                            continue;
                        }
                        try {
                            const variantId = (0, crypto_1.randomUUID)();
                            let attributes = null;
                            if (vRow.attributes) {
                                try {
                                    // Validate JSON
                                    JSON.parse(vRow.attributes);
                                    attributes = vRow.attributes;
                                }
                                catch (_a) {
                                    attributes = null;
                                }
                            }
                            yield conn.query(`INSERT INTO product_variants (id, productId, name, sku, barcode, purchasePrice, sellingPrice, stock, attributes, isActive)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`, [
                                variantId,
                                productId,
                                variantName,
                                vRow.sku || null,
                                vRow.barcode || null,
                                Number(vRow.purchasePrice) || 0,
                                Number(vRow.sellingPrice) || 0,
                                Number(vRow.stock) || 0,
                                attributes
                            ]);
                            variantsImported++;
                        }
                        catch (vErr) {
                            errors.push(`المتغيرات صف ${vi + 1}: ${vErr.message}`);
                        }
                    }
                    // Update embeddedVariantCount on parent products
                    if (variantsImported > 0) {
                        yield conn.query(`
                            UPDATE products p
                            SET p.embeddedVariantCount = (
                                SELECT COUNT(*) FROM product_variants pv WHERE pv.productId = p.id AND pv.isActive = TRUE
                            )
                            WHERE p.id IN (SELECT DISTINCT productId FROM product_variants)
                        `).catch((e) => console.warn('⚠️ Could not update embeddedVariantCount:', e.message));
                    }
                    console.log(`📦 Variants imported: ${variantsImported}`);
                }
            }
            catch (variantError) {
                console.warn('⚠️ Variant sheet processing error:', variantError.message);
                // Non-fatal — products were already imported
            }
        }
        yield conn.commit();
        // Log audit
        try {
            const variantMsg = variantsImported > 0 ? ` + ${variantsImported} متغير` : '';
            yield conn.query(`INSERT INTO audit_log (id, date, user, module, action, details) VALUES (?, NOW(), ?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), user, 'MIGRATION', 'IMPORT', `Imported ${imported} ${entity.arabicName}${variantMsg}, Updated ${updated}, Skipped ${skipped}`]);
        }
        catch (auditError) {
            // Ignore audit error
        }
        const variantMsg = variantsImported > 0 ? ` و ${variantsImported} متغير` : '';
        res.json({
            success: true,
            imported,
            updated,
            skipped,
            variantsImported,
            errors: errors.slice(0, 20),
            message: `تم استيراد ${imported} سجل بنجاح${variantMsg}${updated > 0 ? ` وتحديث ${updated}` : ''}${skipped > 0 ? ` وتخطي ${skipped}` : ''}`
        });
    }
    catch (error) {
        if (conn)
            yield conn.rollback();
        console.error('Error importing data:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.importData = importData;
// ========================================
// VARIANT SHEET PARSER
// ========================================
/**
 * Parse the "المتغيرات" (Variants) sheet from a products Excel file.
 * Returns an array of variant row objects. If the sheet doesn't exist, returns [].
 */
function parseVariantsSheet(buffer) {
    return __awaiter(this, void 0, void 0, function* () {
        const workbook = new exceljs_1.default.Workbook();
        yield workbook.xlsx.load(buffer);
        // Find the variants sheet by name
        const variantSheet = workbook.worksheets.find(ws => ws.name.includes('متغيرات') || ws.name.toLowerCase().includes('variant'));
        if (!variantSheet)
            return [];
        // Known header mapping (Arabic header → field name)
        const VARIANT_HEADER_MAP = {
            'كود المنتج الأب': 'parentSku',
            'كود المنتج الأب *': 'parentSku',
            'اسم المتغير': 'name',
            'اسم المتغير *': 'name',
            'كود المتغير': 'sku',
            'باركود': 'barcode',
            'سعر الشراء': 'purchasePrice',
            'سعر البيع': 'sellingPrice',
            'الكمية': 'stock',
            'الخصائص (JSON)': 'attributes',
            'الخصائص': 'attributes',
            // English fallbacks
            'Parent SKU': 'parentSku',
            'Variant Name': 'name',
            'Variant SKU': 'sku',
            'Barcode': 'barcode',
            'Purchase Price': 'purchasePrice',
            'Selling Price': 'sellingPrice',
            'Stock': 'stock',
            'Attributes': 'attributes',
        };
        // Read headers from first row
        const headers = [];
        const headerRow = variantSheet.getRow(1);
        headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const raw = cell.value ? String(cell.value).trim().replace(/\s*\*\s*$/, '').trim() : '';
            headers[colNumber] = raw;
        });
        // Map column numbers to field names
        const colFieldMap = {};
        for (const [colNum, headerText] of Object.entries(headers)) {
            if (!headerText)
                continue;
            // Try exact match first, then match with * stripped
            const originalHeader = String(variantSheet.getRow(1).getCell(Number(colNum)).value || '').trim();
            const fieldName = VARIANT_HEADER_MAP[originalHeader] || VARIANT_HEADER_MAP[headerText];
            if (fieldName)
                colFieldMap[Number(colNum)] = fieldName;
        }
        // Parse data rows
        const results = [];
        variantSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1)
                return;
            const rowObj = {};
            let hasData = false;
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const fieldName = colFieldMap[colNumber];
                if (!fieldName)
                    return;
                let value = cell.value;
                if (value && typeof value === 'object') {
                    if ('result' in value)
                        value = value.result;
                    else if ('richText' in value)
                        value = value.richText.map((rt) => rt.text).join('');
                }
                rowObj[fieldName] = value !== null && value !== undefined ? String(value).trim() : null;
                if (value !== null && value !== undefined && String(value).trim() !== '')
                    hasData = true;
            });
            if (hasData && rowObj.parentSku && rowObj.name) {
                results.push({
                    parentSku: rowObj.parentSku || '',
                    name: rowObj.name || '',
                    sku: rowObj.sku || null,
                    barcode: rowObj.barcode || null,
                    purchasePrice: Number(rowObj.purchasePrice) || 0,
                    sellingPrice: Number(rowObj.sellingPrice) || 0,
                    stock: Number(rowObj.stock) || 0,
                    attributes: rowObj.attributes || null,
                });
            }
        });
        return results;
    });
}
/**
 * POST /api/migration/test-connection
 * Test connection to external database
 */
const testDatabaseConnection = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { type, host, port, user, password, database } = req.body;
    try {
        if (type === 'mysql' || type === 'mariadb') {
            const connection = yield promise_1.default.createConnection({
                host,
                port: port || 3306,
                user,
                password,
                database,
                connectTimeout: 10000
            });
            yield connection.ping();
            // Get list of tables
            const [tables] = yield connection.query('SHOW TABLES');
            const tableNames = tables.map((t) => Object.values(t)[0]);
            yield connection.end();
            res.json({
                success: true,
                message: 'تم الاتصال بنجاح',
                tables: tableNames
            });
        }
        else {
            res.status(400).json({ error: 'نوع قاعدة البيانات غير مدعوم حالياً. MySQL/MariaDB فقط.' });
        }
    }
    catch (error) {
        console.error('Database connection error:', error);
        res.status(400).json({
            error: 'فشل الاتصال بقاعدة البيانات',
            details: error.message
        });
    }
});
exports.testDatabaseConnection = testDatabaseConnection;
/**
 * POST /api/migration/db/tables
 * Get table structure from external database
 */
const getDatabaseTables = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { type, host, port, user, password, database } = req.body;
    try {
        if (type === 'mysql' || type === 'mariadb') {
            const connection = yield promise_1.default.createConnection({
                host,
                port: port || 3306,
                user,
                password,
                database
            });
            const [tables] = yield connection.query('SHOW TABLES');
            const tableNames = tables.map((t) => Object.values(t)[0]);
            const tableStructures = {};
            for (const tableName of tableNames) {
                // Validate table name from external DB (H2 security fix)
                if (!isSafeIdentifier(tableName))
                    continue;
                const [columns] = yield connection.query(`DESCRIBE \`${tableName}\``);
                const [count] = yield connection.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
                tableStructures[tableName] = {
                    columns: columns.map((c) => ({
                        name: c.Field,
                        type: c.Type,
                        nullable: c.Null === 'YES',
                        key: c.Key,
                        default: c.Default
                    })),
                    rowCount: count[0].count
                };
            }
            yield connection.end();
            res.json({
                success: true,
                tables: tableStructures
            });
        }
        else {
            res.status(400).json({ error: 'نوع قاعدة البيانات غير مدعوم حالياً' });
        }
    }
    catch (error) {
        console.error('Error getting tables:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getDatabaseTables = getDatabaseTables;
/**
 * POST /api/migration/db/preview
 * Preview data from external table
 */
const previewDatabaseTable = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { type, host, port, user, password, database, tableName, limit = 50 } = req.body;
    try {
        if (type === 'mysql' || type === 'mariadb') {
            const connection = yield promise_1.default.createConnection({
                host,
                port: port || 3306,
                user,
                password,
                database
            });
            // Validate table name (H2 security fix)
            if (!tableName || !isSafeIdentifier(tableName)) {
                return res.status(400).json({ error: 'Invalid table name' });
            }
            const [rows] = yield connection.query(`SELECT * FROM \`${tableName}\` LIMIT ?`, [limit]);
            const [columns] = yield connection.query(`DESCRIBE \`${tableName}\``);
            yield connection.end();
            res.json({
                success: true,
                columns: columns.map((c) => c.Field),
                data: rows,
                rowCount: rows.length
            });
        }
        else {
            res.status(400).json({ error: 'نوع قاعدة البيانات غير مدعوم حالياً' });
        }
    }
    catch (error) {
        console.error('Error previewing table:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.previewDatabaseTable = previewDatabaseTable;
/**
 * POST /api/migration/db/import
 * Import data from external database table
 */
const importFromDatabase = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let externalConn = null;
    let localConn = null;
    try {
        const { type, host, port, user, password, database, tableName, entityType, mappings, duplicateAction = 'skip', currentUser = 'Migration' } = req.body;
        if (!entityType || !ENTITY_DEFINITIONS[entityType]) {
            return res.status(400).json({ error: 'نوع البيانات غير مدعوم' });
        }
        const entity = ENTITY_DEFINITIONS[entityType];
        // Connect to external database
        if (type === 'mysql' || type === 'mariadb') {
            externalConn = yield promise_1.default.createConnection({
                host,
                port: port || 3306,
                user,
                password,
                database
            });
        }
        else {
            return res.status(400).json({ error: 'نوع قاعدة البيانات غير مدعوم حالياً' });
        }
        // Validate external table name (H2 security fix)
        if (!tableName || !isSafeIdentifier(tableName)) {
            return res.status(400).json({ error: 'Invalid table name' });
        }
        // Fetch all data from external table
        const [externalData] = yield externalConn.query(`SELECT * FROM \`${tableName}\``);
        // Connect to local database
        localConn = yield (0, db_1.getConnection)();
        yield localConn.beginTransaction();
        // Get existing records
        const existingRecords = new Map();
        if (entity.uniqueField) {
            const uniqueField = entity.uniqueField;
            const [rows] = yield localConn.query(`SELECT * FROM ${entity.tableName}`);
            rows.forEach((row) => {
                existingRecords.set(String(row[uniqueField]).toLowerCase(), row);
            });
        }
        let imported = 0;
        let updated = 0;
        let skipped = 0;
        const errors = [];
        for (let i = 0; i < externalData.length; i++) {
            const row = externalData[i];
            try {
                // Transform row based on mappings
                const transformed = { id: (0, crypto_1.randomUUID)() };
                for (const [externalField, localField] of Object.entries(mappings)) {
                    if (row[externalField] !== undefined) {
                        const field = entity.fields.find(f => f.name === localField);
                        let value = row[externalField];
                        // Type conversion
                        if (field) {
                            switch (field.type) {
                                case 'number':
                                    value = Number(value) || field.defaultValue || 0;
                                    break;
                                case 'boolean':
                                    value = Boolean(value);
                                    break;
                            }
                        }
                        transformed[localField] = value;
                    }
                }
                // Apply defaults for missing required fields
                for (const field of entity.fields) {
                    if (transformed[field.name] === undefined && field.defaultValue !== undefined) {
                        transformed[field.name] = field.defaultValue;
                    }
                }
                // Set balance from openingBalance for partners
                if (entityType === 'partners' && transformed.openingBalance !== undefined) {
                    transformed.balance = transformed.openingBalance;
                }
                // Check for duplicate
                const uniqueValue = entity.uniqueField && transformed[entity.uniqueField]
                    ? String(transformed[entity.uniqueField]).toLowerCase()
                    : null;
                const existingRecord = uniqueValue ? existingRecords.get(uniqueValue) : null;
                if (existingRecord) {
                    if (duplicateAction === 'skip') {
                        skipped++;
                        continue;
                    }
                    else if (duplicateAction === 'update') {
                        const updateFields = Object.keys(transformed)
                            .filter(k => k !== 'id' && transformed[k] !== undefined)
                            .map(k => `${k} = ?`);
                        const updateValues = Object.keys(transformed)
                            .filter(k => k !== 'id' && transformed[k] !== undefined)
                            .map(k => transformed[k]);
                        if (updateFields.length > 0) {
                            yield localConn.query(`UPDATE ${entity.tableName} SET ${updateFields.join(', ')} WHERE id = ?`, [...updateValues, existingRecord.id]);
                            updated++;
                        }
                        continue;
                    }
                }
                // Insert new record
                const fields = Object.keys(transformed).filter(k => transformed[k] !== undefined);
                const values = fields.map(k => transformed[k]);
                const placeholders = fields.map(() => '?').join(', ');
                yield localConn.query(`INSERT INTO ${entity.tableName} (${fields.join(', ')}) VALUES (${placeholders})`, values);
                imported++;
            }
            catch (rowError) {
                errors.push(`الصف ${i + 1}: ${rowError.message}`);
                skipped++;
            }
        }
        yield localConn.commit();
        // Log audit
        try {
            yield localConn.query(`INSERT INTO audit_log (id, date, user, module, action, details) VALUES (?, NOW(), ?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), currentUser, 'MIGRATION', 'DB_IMPORT', `Imported from ${database}.${tableName}: ${imported} ${entity.arabicName}, Updated ${updated}, Skipped ${skipped}`]);
        }
        catch (auditError) {
            // Ignore
        }
        res.json({
            success: true,
            imported,
            updated,
            skipped,
            total: externalData.length,
            errors: errors.slice(0, 20),
            message: `تم استيراد ${imported} سجل من جدول ${tableName}`
        });
    }
    catch (error) {
        if (localConn)
            yield localConn.rollback();
        console.error('Error importing from database:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        if (externalConn)
            yield externalConn.end();
        if (localConn)
            localConn.release();
    }
});
exports.importFromDatabase = importFromDatabase;
/**
 * GET /api/migration/stats
 * Get current database statistics for migration planning
 */
const getMigrationStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let conn;
    try {
        conn = yield (0, db_1.getConnection)();
        const stats = {};
        for (const [key, entity] of Object.entries(ENTITY_DEFINITIONS)) {
            try {
                const [result] = yield conn.query(`SELECT COUNT(*) as count FROM ${entity.tableName}`);
                stats[key] = {
                    name: entity.arabicName,
                    count: result[0].count
                };
            }
            catch (e) {
                stats[key] = {
                    name: entity.arabicName,
                    count: 0,
                    error: 'Table not found'
                };
            }
        }
        res.json({ stats });
    }
    catch (error) {
        console.error('Error getting stats:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getMigrationStats = getMigrationStats;
