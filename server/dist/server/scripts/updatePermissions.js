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
const db_1 = require("../db");
const DEFAULT_PERMISSIONS = [
    // ======== المبيعات (Sales) ========
    { id: 'sales.view', label: 'عرض فواتير البيع', module: 'المبيعات' },
    { id: 'sales.create', label: 'إنشاء فاتورة بيع', module: 'المبيعات' },
    { id: 'sales.edit', label: 'تعديل فاتورة بيع', module: 'المبيعات' },
    { id: 'sales.delete', label: 'حذف فاتورة بيع', module: 'المبيعات' },
    { id: 'sales.discount', label: 'إضافة خصم على المبيعات', module: 'المبيعات' },
    { id: 'sales.edit_price', label: 'تعديل سعر البيع', module: 'المبيعات' },
    { id: 'sales.return', label: 'مرتجع مبيعات', module: 'المبيعات' },
    { id: 'sales.print', label: 'طباعة فواتير البيع', module: 'المبيعات' },
    { id: 'sales.view_cost', label: 'عرض سعر التكلفة', module: 'المبيعات' },
    { id: 'sales.approve_credit', label: 'تجاوز الحد الائتماني', module: 'المبيعات' },
    { id: 'sales.cancel', label: 'إلغاء الفواتير', module: 'المبيعات' },
    { id: 'sales.manage', label: 'إدارة كاملة للمبيعات', module: 'المبيعات' },
    // ======== المشتريات (Purchases) ========
    { id: 'purchase.view', label: 'عرض فواتير الشراء', module: 'المشتريات' },
    { id: 'purchase.create', label: 'إنشاء فاتورة شراء', module: 'المشتريات' },
    { id: 'purchase.edit', label: 'تعديل فاتورة شراء', module: 'المشتريات' },
    { id: 'purchase.delete', label: 'حذف فاتورة شراء', module: 'المشتريات' },
    { id: 'purchase.discount', label: 'إضافة خصم على المشتريات', module: 'المشتريات' },
    { id: 'purchase.return', label: 'مرتجع مشتريات', module: 'المشتريات' },
    { id: 'purchase.manage', label: 'إدارة كاملة للمشتريات', module: 'المشتريات' },
    // ======== العملاء (Customers) ========
    { id: 'customers.view', label: 'عرض العملاء', module: 'العملاء' },
    { id: 'customers.manage', label: 'إضافة/تعديل عميل', module: 'العملاء' },
    { id: 'customers.delete', label: 'حذف عميل', module: 'العملاء' },
    { id: 'customers.statement', label: 'كشف حساب العميل', module: 'العملاء' },
    { id: 'customers.balances', label: 'أرصدة العملاء', module: 'العملاء' },
    { id: 'customers.prices', label: 'أسعار العملاء الخاصة', module: 'العملاء' },
    { id: 'customers.discount', label: 'خصم مسموح به', module: 'العملاء' },
    { id: 'customers.payments', label: 'مقبوضات العملاء', module: 'العملاء' },
    // ======== الموردين (Suppliers) ========
    { id: 'suppliers.view', label: 'عرض الموردين', module: 'الموردين' },
    { id: 'suppliers.manage', label: 'إضافة/تعديل مورد', module: 'الموردين' },
    { id: 'suppliers.delete', label: 'حذف مورد', module: 'الموردين' },
    { id: 'suppliers.statement', label: 'كشف حساب المورد', module: 'الموردين' },
    { id: 'suppliers.balances', label: 'أرصدة الموردين', module: 'الموردين' },
    { id: 'suppliers.discount', label: 'خصم مكتسب', module: 'الموردين' },
    { id: 'suppliers.payments', label: 'مدفوعات للموردين', module: 'الموردين' },
    // ======== المخزون (Inventory) ========
    { id: 'inventory.view', label: 'عرض المخزون والأصناف', module: 'المخزون' },
    { id: 'inventory.manage', label: 'إدارة الأصناف (إضافة/تعديل)', module: 'المخزون' },
    { id: 'inventory.manage_products', label: 'كارت الصنف (إضافة/تعديل/مصنعين/مقاسات)', module: 'المخزون' },
    { id: 'inventory.delete', label: 'حذف أصناف', module: 'المخزون' },
    { id: 'inventory.permit_in', label: 'إذن إضافة مخزني', module: 'المخزون' },
    { id: 'inventory.permit_out', label: 'إذن صرف مخزني', module: 'المخزون' },
    { id: 'inventory.transfer', label: 'إذن تحويل مخزني', module: 'المخزون' },
    { id: 'inventory.stock_taking', label: 'جرد المخازن', module: 'المخزون' },
    { id: 'inventory.view_value', label: 'عرض قيمة المخزون', module: 'المخزون' },
    { id: 'inventory.barcode', label: 'طباعة الباركود', module: 'المخزون' },
    { id: 'inventory.serial_tracking', label: 'تتبع الأرقام التسلسلية (السيريال)', module: 'المخزون' },
    { id: 'inventory.reports', label: 'تقارير المخزون (أرصدة، حركات، نواقص)', module: 'المخزون' },
    { id: 'inventory.manage_warehouses', label: 'إدارة المخازن', module: 'المخزون' },
    { id: 'inventory.manage_categories', label: 'إدارة التصنيفات', module: 'المخزون' },
    { id: 'inventory.adjustment', label: 'تسوية المخزون', module: 'المخزون' },
    // ======== الخزينة والبنوك (Treasury & Banks) ========
    { id: 'treasury.view', label: 'عرض الخزينة', module: 'الخزينة والبنوك' },
    { id: 'treasury.manage', label: 'إدارة الخزينة', module: 'الخزينة والبنوك' },
    { id: 'treasury.receipt', label: 'سند قبض (تحصيل)', module: 'الخزينة والبنوك' },
    { id: 'treasury.payment', label: 'سند صرف (دفع)', module: 'الخزينة والبنوك' },
    { id: 'treasury.cheques', label: 'إدارة الشيكات', module: 'الخزينة والبنوك' },
    { id: 'treasury.transfer', label: 'تحويل داخلي (Contra)', module: 'الخزينة والبنوك' },
    { id: 'treasury.view_balance', label: 'عرض أرصدة البنوك', module: 'الخزينة والبنوك' },
    { id: 'treasury.bank_recon', label: 'تسوية البنك', module: 'الخزينة والبنوك' },
    { id: 'treasury.expenses', label: 'المصروفات السريعة', module: 'الخزينة والبنوك' },
    { id: 'treasury.installments', label: 'إدارة الأقساط', module: 'الخزينة والبنوك' },
    { id: 'treasury.currency', label: 'إدارة العملات', module: 'الخزينة والبنوك' },
    { id: 'treasury.denomination', label: 'تقرير فئات النقدية', module: 'الخزينة والبنوك' },
    { id: 'treasury.profit_analysis', label: 'تحليل الأرباح', module: 'الخزينة والبنوك' },
    // ======== الحسابات (Accounting) ========
    { id: 'accounting.view', label: 'عرض شجرة الحسابات', module: 'الحسابات' },
    { id: 'accounting.manage', label: 'إدارة الحسابات', module: 'الحسابات' },
    { id: 'accounting.journal', label: 'قيود اليومية', module: 'الحسابات' },
    { id: 'accounting.assets', label: 'الأصول الثابتة', module: 'الحسابات' },
    { id: 'accounting.cost_centers', label: 'مراكز التكلفة', module: 'الحسابات' },
    { id: 'accounting.close_year', label: 'إقفال السنة المالية', module: 'الحسابات' },
    // ======== التقارير (Reports) ========
    { id: 'reports.view', label: 'عرض التقارير', module: 'التقارير' },
    { id: 'reports.all', label: 'كل التقارير', module: 'التقارير' },
    { id: 'reports.sales', label: 'تقارير المبيعات', module: 'التقارير' },
    { id: 'reports.purchase', label: 'تقارير المشتريات', module: 'التقارير' },
    { id: 'reports.inventory', label: 'تقارير المخزون', module: 'التقارير' },
    { id: 'reports.treasury', label: 'تقارير الخزينة', module: 'التقارير' },
    { id: 'reports.financial', label: 'التقارير المالية (ميزانية/أرباح)', module: 'التقارير' },
    { id: 'reports.invoice_reports', label: 'تقارير الفواتير', module: 'التقارير' },
    { id: 'reports.returns_analysis', label: 'تحليل المرتجعات', module: 'التقارير' },
    { id: 'reports.deleted_invoices', label: 'الفواتير المحذوفة (مراجعة)', module: 'التقارير' },
    // ======== التصنيع (Manufacturing) ========
    { id: 'manufacturing.view', label: 'عرض التصنيع', module: 'التصنيع' },
    { id: 'manufacturing.manage', label: 'إدارة أوامر التصنيع', module: 'التصنيع' },
    { id: 'manufacturing.bom', label: 'قوائم المواد (BOM)', module: 'التصنيع' },
    { id: 'manufacturing.production', label: 'أوامر الإنتاج', module: 'التصنيع' },
    // ======== المبيعات المتنقلة (Van Sales) ========
    { id: 'vansales.view', label: 'عرض المبيعات المتنقلة', module: 'المبيعات المتنقلة' },
    { id: 'vansales.manage', label: 'إدارة المبيعات المتنقلة', module: 'المبيعات المتنقلة' },
    { id: 'vansales.visits', label: 'تتبع زيارات العملاء', module: 'المبيعات المتنقلة' },
    { id: 'vansales.settlements', label: 'تسوية نهاية اليوم', module: 'المبيعات المتنقلة' },
    { id: 'vansales.routes', label: 'إدارة خطوط السير', module: 'المبيعات المتنقلة' },
    { id: 'vansales.reports', label: 'تصدير التقارير', module: 'المبيعات المتنقلة' },
    { id: 'vansales.vehicles', label: 'إدارة السيارات', module: 'المبيعات المتنقلة' },
    { id: 'vansales.inventory', label: 'جرد السيارات', module: 'المبيعات المتنقلة' },
    { id: 'vansales.loading', label: 'عمليات التحميل والتفريغ', module: 'المبيعات المتنقلة' },
    { id: 'vansales.returns', label: 'إدارة المرتجعات', module: 'المبيعات المتنقلة' },
    { id: 'vansales.targets', label: 'إدارة الأهداف', module: 'المبيعات المتنقلة' },
    { id: 'vansales.fuel', label: 'سجل الوقود', module: 'المبيعات المتنقلة' },
    { id: 'vansales.maintenance', label: 'صيانة السيارات', module: 'المبيعات المتنقلة' },
    // ======== نقطة البيع (POS) ========
    { id: 'pos.access', label: 'الوصول لنقطة البيع', module: 'نقطة البيع' },
    { id: 'pos.open_shift', label: 'فتح وردية', module: 'نقطة البيع' },
    { id: 'pos.close_shift', label: 'إغلاق وردية', module: 'نقطة البيع' },
    { id: 'pos.sale', label: 'إجراء بيع', module: 'نقطة البيع' },
    { id: 'pos.refund', label: 'مرتجع نقطة البيع', module: 'نقطة البيع' },
    { id: 'pos.discount', label: 'خصم في نقطة البيع', module: 'نقطة البيع' },
    { id: 'pos.edit_price', label: 'تعديل السعر', module: 'نقطة البيع' },
    { id: 'pos.cash_movement', label: 'إيداع/سحب من الدرج', module: 'نقطة البيع' },
    { id: 'pos.hold_order', label: 'تعليق الطلبات', module: 'نقطة البيع' },
    { id: 'pos.reports', label: 'تقارير نقطة البيع', module: 'نقطة البيع' },
    { id: 'pos.shifts.manage', label: 'إعدادات الورديات', module: 'نقطة البيع' },
    { id: 'pos.devices.manage', label: 'إعدادات الأجهزة', module: 'نقطة البيع' },
    { id: 'pos.sessions.delete', label: 'حذف جلسات نقطة البيع', module: 'نقطة البيع' },
    { id: 'pos.manage', label: 'إدارة كاملة لنقطة البيع', module: 'نقطة البيع' },
    // ======== فريق المبيعات (Sales Team) ========
    { id: 'salesteam.view', label: 'عرض فريق المبيعات', module: 'فريق المبيعات' },
    { id: 'salesteam.manage', label: 'إدارة المندوبين', module: 'فريق المبيعات' },
    { id: 'salesteam.commissions', label: 'العمولات', module: 'فريق المبيعات' },
    { id: 'salesteam.targets', label: 'أهداف المندوبين', module: 'فريق المبيعات' },
    // ======== الموارد البشرية (HR) ========
    { id: 'hr.view', label: 'عرض بيانات الموظفين', module: 'الموارد البشرية' },
    { id: 'hr.manage', label: 'إدارة الموظفين', module: 'الموارد البشرية' },
    { id: 'hr.attendance', label: 'الحضور والانصراف', module: 'الموارد البشرية' },
    { id: 'hr.attendance.manage', label: 'إدارة الحضور والانصراف', module: 'الموارد البشرية' },
    { id: 'hr.payroll', label: 'مسير الرواتب', module: 'الموارد البشرية' },
    { id: 'hr.payroll.manage', label: 'إدارة المرتبات', module: 'الموارد البشرية' },
    { id: 'hr.payroll.view', label: 'عرض كشف المرتبات', module: 'الموارد البشرية' },
    { id: 'hr.advances', label: 'السلف والقروض', module: 'الموارد البشرية' },
    { id: 'hr.leave', label: 'إدارة الإجازات', module: 'الموارد البشرية' },
    { id: 'hr.salary_structures', label: 'هياكل الرواتب', module: 'الموارد البشرية' },
    { id: 'hr.gl_mappings', label: 'الربط المحاسبي للرواتب', module: 'الموارد البشرية' },
    { id: 'hr.rules.view', label: 'عرض قواعد الخصومات والمكافآت', module: 'الموارد البشرية' },
    { id: 'hr.rules.manage', label: 'إدارة قواعد الخصومات والمكافآت', module: 'الموارد البشرية' },
    // ======== إدارة العملاء المحتملين (CRM) ========
    { id: 'crm.view', label: 'عرض إدارة العملاء المحتملين', module: 'إدارة العملاء المحتملين' },
    { id: 'crm.manage', label: 'إدارة العملاء المحتملين', module: 'إدارة العملاء المحتملين' },
    { id: 'crm.pipeline.view', label: 'عرض خط المبيعات (Pipeline)', module: 'إدارة العملاء المحتملين' },
    { id: 'crm.pipeline.edit', label: 'تعديل مراحل خط المبيعات', module: 'إدارة العملاء المحتملين' },
    { id: 'crm.leads.view', label: 'عرض العملاء المحتملين', module: 'إدارة العملاء المحتملين' },
    { id: 'crm.leads.create', label: 'إضافة عميل محتمل', module: 'إدارة العملاء المحتملين' },
    { id: 'crm.leads.edit', label: 'تعديل بيانات عميل محتمل', module: 'إدارة العملاء المحتملين' },
    { id: 'crm.leads.delete', label: 'حذف عميل محتمل', module: 'إدارة العملاء المحتملين' },
    { id: 'crm.activities.view', label: 'عرض الأنشطة والمتابعات', module: 'إدارة العملاء المحتملين' },
    { id: 'crm.activities.create', label: 'إضافة نشاط أو متابعة', module: 'إدارة العملاء المحتملين' },
    { id: 'crm.activities.edit', label: 'تعديل نشاط أو متابعة', module: 'إدارة العملاء المحتملين' },
    { id: 'crm.activities.delete', label: 'حذف نشاط أو متابعة', module: 'إدارة العملاء المحتملين' },
    { id: 'crm.convert', label: 'تحويل عميل محتمل إلى عميل فعلي', module: 'إدارة العملاء المحتملين' },
    { id: 'crm.complaints.view', label: 'عرض الشكاوى', module: 'إدارة العملاء المحتملين' },
    // ======== الاشتراكات والعضويات (Memberships) ========
    { id: 'memberships.view', label: 'عرض الاشتراكات', module: 'الاشتراكات والعضويات' },
    { id: 'memberships.manage', label: 'إدارة الاشتراكات والباقات', module: 'الاشتراكات والعضويات' },
    { id: 'memberships.list.view', label: 'عرض قائمة الاشتراكات', module: 'الاشتراكات والعضويات' },
    { id: 'memberships.subscription.create', label: 'إنشاء اشتراك جديد', module: 'الاشتراكات والعضويات' },
    { id: 'memberships.plans.view', label: 'عرض خطط الباقات', module: 'الاشتراكات والعضويات' },
    // ======== الإعدادات (System Settings) ========
    { id: 'system.settings', label: 'إعدادات النظام', module: 'الإعدادات' },
    { id: 'system.users', label: 'إدارة المستخدمين والصلاحيات', module: 'الإعدادات' },
    { id: 'system.backup', label: 'النسخ الاحتياطي والاستعادة', module: 'الإعدادات' },
    { id: 'system.audit', label: 'سجل المراقبة', module: 'الإعدادات' },
    { id: 'system.migration', label: 'استيراد البيانات', module: 'الإعدادات' },
    // ======== البيانات الأساسية (Master Data) ========
    { id: 'master.branches', label: 'تعريف الفروع', module: 'البيانات الأساسية' },
    { id: 'master.warehouses', label: 'تعريف المخازن', module: 'البيانات الأساسية' },
    { id: 'master.categories', label: 'فئات الأصناف', module: 'البيانات الأساسية' },
    { id: 'master.price_lists', label: 'قوائم الأسعار', module: 'البيانات الأساسية' },
    { id: 'master.banks', label: 'تعريف البنوك', module: 'البيانات الأساسية' },
    { id: 'master.salesmen', label: 'تعريف المندوبين', module: 'البيانات الأساسية' },
];
function updatePermissions() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🚀 Updating permissions in database...');
        console.log(`📦 Total permissions to sync: ${DEFAULT_PERMISSIONS.length}`);
        const conn = yield db_1.pool.getConnection();
        let created = 0;
        let updated = 0;
        try {
            yield conn.beginTransaction();
            for (const perm of DEFAULT_PERMISSIONS) {
                const [rows] = yield conn.query('SELECT id FROM permissions WHERE id = ?', [perm.id]);
                const existing = rows[0];
                if (existing) {
                    yield conn.query('UPDATE permissions SET label = ?, module = ? WHERE id = ?', [perm.label, perm.module, perm.id]);
                    updated++;
                }
                else {
                    yield conn.query('INSERT INTO permissions (id, label, module) VALUES (?, ?, ?)', [perm.id, perm.label, perm.module]);
                    created++;
                    console.log(`✨ Created: ${perm.id}`);
                }
            }
            const validIds = DEFAULT_PERMISSIONS.map(p => p.id);
            const [cleanupResult] = yield conn.query('UPDATE permissions SET module = ? WHERE id NOT IN (?) AND module != ?', ['توافق', validIds, 'توافق']);
            // Run migrations on users permissions JSON strings to map old permission keys to new ones
            console.log('🔄 Mapping old user permissions to new ones in users table...');
            const replacements = [
                ['master.customers.create', 'customers.manage'],
                ['master.customers.edit', 'customers.manage'],
                ['master.customers.view', 'customers.view'],
                ['master.customer_categories.view', 'master.categories'],
                ['master.price_lists.view', 'master.price_lists'],
                ['master.products.view', 'inventory.view'],
                ['master.products.edit', 'inventory.manage'],
                ['invoices.quotation.view', 'sales.view'],
                ['invoices.quotation.create', 'sales.create'],
                ['invoices.quotation.edit', 'sales.edit'],
                ['invoices.sales.view', 'sales.view'],
                ['invoices.sales.create', 'sales.create'],
                ['invoices.sales.edit', 'sales.edit'],
                ['invoices.sales.discount', 'sales.discount'],
                ['invoices.sales.print', 'sales.print'],
                ['invoices.sales_return.view', 'sales.return'],
                ['invoices.sales_return.create', 'sales.return'],
                ['invoices.reports.view', 'reports.sales'],
                ['invoices.purchase.view', 'purchase.view'],
                ['invoices.purchase.create', 'purchase.create'],
                ['invoices.purchase.edit', 'purchase.edit'],
                ['invoices.purchase_return.view', 'purchase.return'],
                ['invoices.purchase_return.create', 'purchase.return'],
                ['master.suppliers.view', 'suppliers.view'],
                ['master.suppliers.create', 'suppliers.manage'],
                ['master.suppliers.edit', 'suppliers.manage'],
                ['suppliers.payments.view', 'suppliers.payments'],
                ['suppliers.payments.create', 'suppliers.payments'],
                ['suppliers.statement.view', 'suppliers.statement'],
                ['suppliers.balances.view', 'suppliers.balances'],
                ['suppliers.discount.view', 'suppliers.discount'],
                ['customers.receipts.view', 'customers.payments'],
                ['customers.receipts.create', 'customers.payments'],
                ['customers.statement.view', 'customers.statement'],
                ['customers.balances.view', 'customers.balances'],
                ['customers.prices.view', 'customers.prices'],
                ['customers.discount.view', 'customers.discount'],
                ['inventory.balance.view', 'inventory.view'],
                ['inventory.movement.view', 'inventory.view'],
                ['inventory.movement_report.view', 'inventory.reports'],
                ['inventory.value.view', 'inventory.view_value'],
                ['inventory.serial_log.view', 'inventory.serial_tracking'],
                ['inventory.serial_reports.view', 'inventory.reports'],
                ['inventory.stock_taking.view', 'inventory.stock_taking'],
                ['inventory.stock_taking.create', 'inventory.stock_taking'],
                ['inventory.stock_taking.edit', 'inventory.stock_taking'],
                ['inventory.receipt.view', 'inventory.permit_in'],
                ['inventory.receipt.create', 'inventory.permit_in'],
                ['inventory.receipt.edit', 'inventory.permit_in'],
                ['inventory.release.view', 'inventory.permit_out'],
                ['inventory.release.create', 'inventory.permit_out'],
                ['inventory.release.edit', 'inventory.permit_out'],
                ['inventory.transfer.view', 'inventory.transfer'],
                ['inventory.transfer.create', 'inventory.transfer'],
                ['inventory.transfer.edit', 'inventory.transfer'],
                ['inventory.barcode.view', 'inventory.barcode'],
                ['inventory.shortages.view', 'inventory.reports'],
                ['inventory.queries.view', 'inventory.view'],
                ['pos.screen.view', 'pos.access'],
                ['pos.screen.sale', 'pos.sale'],
                ['pos.screen.refund', 'pos.refund'],
                ['pos.screen.discount', 'pos.discount'],
                ['pos.screen.hold_order', 'pos.hold_order'],
                ['pos.screen.void_item', 'pos.sale'],
                ['pos.screen.change_customer', 'pos.sale'],
                ['pos.screen.print', 'pos.sale'],
                ['pos.shifts.view', 'pos.shifts.manage'],
                ['pos.shifts.open', 'pos.open_shift'],
                ['pos.shifts.close', 'pos.close_shift'],
                ['pos.reports.view', 'pos.reports'],
                ['pos.screen.cash_movement', 'pos.cash_movement'],
                ['accounting.statements.view', 'accounting.view'],
                ['accounting.smart_match.view', 'accounting.manage'],
                ['accounting.journal.view', 'accounting.journal'],
                ['accounting.journal.create', 'accounting.journal'],
                ['accounting.journal.edit', 'accounting.journal'],
                ['accounting.ledger.view', 'accounting.view'],
                ['accounting.fixed_assets.view', 'accounting.assets'],
                ['accounting.fixed_assets.create', 'accounting.assets'],
                ['accounting.fixed_assets.edit', 'accounting.assets'],
                ['accounting.chart.view', 'accounting.view'],
                ['accounting.chart.create', 'accounting.manage'],
                ['accounting.chart.edit', 'accounting.manage'],
                ['accounting.cost_centers.view', 'accounting.cost_centers'],
                ['accounting.cost_centers.create', 'accounting.cost_centers'],
                ['accounting.cost_centers.edit', 'accounting.cost_centers'],
                ['accounting.trial_balance.view', 'reports.financial'],
                ['accounting.balance_sheet.view', 'reports.financial'],
                ['accounting.income_statement.view', 'reports.financial'],
                ['treasury.payment.view', 'treasury.payment'],
                ['treasury.payment.create', 'treasury.payment'],
                ['treasury.receipt.view', 'treasury.receipt'],
                ['treasury.receipt.create', 'treasury.receipt'],
                ['treasury.expenses.view', 'treasury.expenses'],
                ['treasury.expenses.create', 'treasury.expenses'],
                ['treasury.journal.view', 'reports.treasury'],
                ['treasury.report.view', 'reports.treasury'],
                ['treasury.receipts_payments_log.view', 'treasury.view'],
                ['treasury.monthly_profit.view', 'treasury.profit_analysis'],
                ['treasury.profit_analysis.view', 'treasury.profit_analysis'],
                ['treasury.installments.view', 'treasury.installments'],
                ['treasury.currency.view', 'treasury.currency'],
                ['banks.contra.view', 'treasury.transfer'],
                ['banks.contra.create', 'treasury.transfer'],
                ['banks.statement.view', 'treasury.bank_recon'],
                ['banks.reconciliation.view', 'treasury.bank_recon'],
                ['banks.reconciliation.create', 'treasury.bank_recon'],
                ['banks.cheques.view', 'treasury.cheques'],
                ['banks.cheques.create', 'treasury.cheques'],
                ['banks.cheques.edit', 'treasury.cheques'],
                ['master.banks.view', 'master.banks']
            ];
            for (const [oldKey, newKey] of replacements) {
                yield conn.query(`UPDATE users SET permissions = REPLACE(permissions, ?, ?)`, [`"${oldKey}"`, `"${newKey}"`]);
            }
            // Auto-append missing critical permissions to Sales and Cashier users who need to add customers
            console.log('➕ Appending critical customer permissions to Cashier/Sales users...');
            yield conn.query(`
            UPDATE users 
            SET permissions = JSON_ARRAY_APPEND(COALESCE(permissions, '[]'), '$', 'customers.view')
            WHERE role IN ('SALES', 'CASHIER') AND NOT JSON_CONTAINS(COALESCE(permissions, '[]'), '"customers.view"')
        `);
            yield conn.query(`
            UPDATE users 
            SET permissions = JSON_ARRAY_APPEND(COALESCE(permissions, '[]'), '$', 'customers.manage')
            WHERE role IN ('SALES', 'CASHIER') AND NOT JSON_CONTAINS(COALESCE(permissions, '[]'), '"customers.manage"')
        `);
            // Auto-initialize empty permission arrays in database due to the preset filtering bug
            console.log('🔄 Initializing empty role presets...');
            yield conn.query(`
            UPDATE users
            SET permissions = '["accounting.view","accounting.manage","accounting.journal","accounting.assets","accounting.cost_centers","treasury.view","treasury.manage","treasury.receipt","treasury.payment","treasury.cheques","treasury.transfer","treasury.view_balance","treasury.bank_recon","treasury.expenses","treasury.installments","treasury.currency","treasury.profit_analysis","customers.view","customers.statement","customers.balances","customers.payments","suppliers.view","suppliers.statement","suppliers.balances","suppliers.payments","sales.view","purchase.view","reports.invoice_reports","master.banks"]'
            WHERE role = 'ACCOUNTANT' AND (permissions = '[]' OR permissions IS NULL)
        `);
            yield conn.query(`
            UPDATE users
            SET permissions = '["sales.view","sales.create","sales.edit","sales.discount","sales.print","sales.return","reports.sales","customers.view","customers.manage","customers.statement","customers.balances","customers.prices","customers.discount","customers.payments","master.categories","master.price_lists","inventory.view"]'
            WHERE role = 'SALES' AND (permissions = '[]' OR permissions IS NULL)
        `);
            yield conn.query(`
            UPDATE users
            SET permissions = '["pos.access","pos.open_shift","pos.close_shift","pos.sale","pos.refund","pos.discount","pos.edit_price","pos.cash_movement","pos.hold_order","pos.reports","customers.view","customers.manage","customers.payments","treasury.receipt"]'
            WHERE role = 'CASHIER' AND (permissions = '[]' OR permissions IS NULL)
        `);
            yield conn.commit();
            console.log(`\n🎉 Permissions sync complete!`);
            console.log(`   ✨ Created: ${created}`);
            console.log(`   ✅ Updated: ${updated}`);
            console.log(`   🧹 Moved to توافق: ${cleanupResult.affectedRows}`);
            console.log(`   📦 Total Active: ${DEFAULT_PERMISSIONS.length}`);
        }
        catch (error) {
            yield conn.rollback();
            console.error('❌ Error updating permissions:', error);
        }
        finally {
            conn.release();
            yield db_1.pool.end();
            process.exit();
        }
    });
}
updatePermissions();
