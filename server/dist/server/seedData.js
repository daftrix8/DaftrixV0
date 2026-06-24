"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INITIAL_ACCOUNTS = void 0;
// Initial Chart of Accounts for seeding the database
exports.INITIAL_ACCOUNTS = [
    // 1. Assets
    { id: '101', code: '101', name: 'الخزينة الرئيسية', type: 'ASSET', balance: 0, openingBalance: 0 },
    { id: '10201', code: '10201', name: 'البنك الرئيسي', type: 'ASSET', balance: 0, openingBalance: 0 },
    { id: '103', code: '103', name: 'مخزون البضائع', type: 'ASSET', balance: 0, openingBalance: 0 },
    { id: '104', code: '104', name: 'العملاء (الذمم المدينة)', type: 'ASSET', balance: 0, openingBalance: 0 },
    { id: '105', code: '105', name: 'ضريبة القيمة المضافة (مدخلات)', type: 'ASSET', balance: 0, openingBalance: 0 },
    { id: '106', code: '106', name: 'أوراق قبض (شيكات بالخزنة)', type: 'ASSET', balance: 0, openingBalance: 0 },
    { id: '107', code: '107', name: 'شيكات تحت التحصيل', type: 'ASSET', balance: 0, openingBalance: 0 },
    { id: '108', code: '108', name: 'أرصدة مدينة - ضرائب خصم', type: 'ASSET', balance: 0, openingBalance: 0 },
    { id: '109', code: '109', name: 'الأصول الثابتة', type: 'ASSET', balance: 0, openingBalance: 0 },
    // 2. Liabilities
    { id: '201', code: '201', name: 'الموردين (الذمم الدائنة)', type: 'LIABILITY', balance: 0, openingBalance: 0 },
    { id: '202', code: '202', name: 'ضريبة القيمة المضافة (مخرجات)', type: 'LIABILITY', balance: 0, openingBalance: 0 },
    { id: '203', code: '203', name: 'أوراق دفع', type: 'LIABILITY', balance: 0, openingBalance: 0 },
    { id: '204', code: '204', name: 'مجمع الإهلاك', type: 'LIABILITY', balance: 0, openingBalance: 0 },
    { id: '205', code: '205', name: 'ضريبة خصم من المنبع (دائنة)', type: 'LIABILITY', balance: 0, openingBalance: 0 },
    { id: '206', code: '206', name: 'جاري الشركاء', type: 'LIABILITY', balance: 0, openingBalance: 0 },
    // 3. Equity
    { id: '301', code: '301', name: 'رأس المال', type: 'EQUITY', balance: 0, openingBalance: 0 },
    { id: '302', code: '302', name: 'أرباح مرحلة', type: 'EQUITY', balance: 0, openingBalance: 0 },
    { id: '303', code: '303', name: 'احتياطي قانوني', type: 'EQUITY', balance: 0, openingBalance: 0 },
    // 4. Revenue
    { id: '401', code: '401', name: 'المبيعات', type: 'REVENUE', balance: 0, openingBalance: 0 },
    { id: '402', code: '402', name: 'خصم مكتسب', type: 'REVENUE', balance: 0, openingBalance: 0 },
    { id: '403', code: '403', name: 'إيرادات خدمات وشحن', type: 'REVENUE', balance: 0, openingBalance: 0 },
    { id: '404', code: '404', name: 'أرباح رأسمالية', type: 'REVENUE', balance: 0, openingBalance: 0 },
    { id: '405', code: '405', name: 'زيادة نقدية (عجز/زيادة)', type: 'REVENUE', balance: 0, openingBalance: 0 },
    // 5. Expenses
    { id: '501', code: '501', name: 'تكلفة البضاعة المباعة (COGS)', type: 'EXPENSE', balance: 0, openingBalance: 0 },
    { id: '502', code: '502', name: 'خصم مسموح به', type: 'EXPENSE', balance: 0, openingBalance: 0 },
    { id: '503', code: '503', name: 'رواتب وأجور', type: 'EXPENSE', balance: 0, openingBalance: 0 },
    { id: '504', code: '504', name: 'إيجارات', type: 'EXPENSE', balance: 0, openingBalance: 0 },
    { id: '505', code: '505', name: 'كهرباء ومرافق', type: 'EXPENSE', balance: 0, openingBalance: 0 },
    { id: '506', code: '506', name: 'دعاية وإعلان', type: 'EXPENSE', balance: 0, openingBalance: 0 },
    { id: '507', code: '507', name: 'مصروفات بنكية', type: 'EXPENSE', balance: 0, openingBalance: 0 },
    { id: '508', code: '508', name: 'صيانة وتشغيل', type: 'EXPENSE', balance: 0, openingBalance: 0 },
    { id: '509', code: '509', name: 'مصروف إهلاك', type: 'EXPENSE', balance: 0, openingBalance: 0 },
    { id: '510', code: '510', name: 'عجز نقدية', type: 'EXPENSE', balance: 0, openingBalance: 0 },
    { id: '511', code: '511', name: 'فروق التقريب', type: 'EXPENSE', balance: 0, openingBalance: 0 },
];
