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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
const crypto_1 = require("crypto");
const bcrypt_1 = __importDefault(require("bcrypt"));
// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    year: 2024,
    products: {
        rawMaterials: 100,
        finishedGoods: 150,
    },
    partners: {
        customers: 200,
        suppliers: 50,
    },
    employees: 25,
    assets: 20,
    transactions: {
        salesInvoices: 2000,
        purchaseInvoices: 500,
        productionOrders: 200,
        paymentReceipts: 1000,
        paymentVouchers: 300,
        journalEntries: 500,
        payrollMonths: 6
    },
    warehouses: 5,
    branches: 3,
    categories: 8,
    costCenters: 5,
    banks: 4,
    salesmen: 10
};
// ============================================
// UTILITIES
// ============================================
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomFloat(min, max, decimals = 2) {
    const value = Math.random() * (max - min) + min;
    return parseFloat(value.toFixed(decimals));
}
function randomElement(array) {
    return array[randomInt(0, array.length - 1)];
}
function randomDate(year, startMonth = 1, endMonth = 12) {
    const month = randomInt(startMonth - 1, endMonth - 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const day = randomInt(1, daysInMonth);
    const date = new Date(year, month, day);
    // Skip weekends (Friday/Saturday in some regions, but let's assume generic Fri/Sat for now or Sat/Sun)
    // Let's stick to standard working days
    while (date.getDay() === 5 || date.getDay() === 6) { // Fri/Sat off
        date.setDate(date.getDate() + 1);
    }
    const hour = randomInt(8, 17);
    const minute = randomInt(0, 59);
    date.setHours(hour, minute, 0, 0);
    return date;
}
function formatDateTime(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}
function formatDate(date) {
    return date.toISOString().slice(0, 10);
}
// ============================================
// ARABIC DATA
// ============================================
const ARABIC_NAMES = {
    firstNames: [
        'محمد', 'أحمد', 'علي', 'حسن', 'حسين', 'عبدالله', 'إبراهيم', 'خالد', 'سعيد', 'فيصل',
        'عمر', 'يوسف', 'طارق', 'ماجد', 'سلطان', 'فهد', 'عبدالعزيز', 'ناصر', 'سعود', 'منصور',
        'فاطمة', 'عائشة', 'خديجة', 'مريم', 'نورة', 'سارة', 'هند', 'ريم', 'لطيفة', 'منى'
    ],
    lastNames: [
        'العتيبي', 'الشمري', 'الحربي', 'الدوسري', 'القحطاني', 'الغامدي', 'الزهراني', 'العنزي',
        'السبيعي', 'المطيري', 'العمري', 'الأحمدي', 'الخالدي', 'السعيد', 'اليامي', 'الرشيدي'
    ],
    companyTypes: ['مؤسسة', 'شركة', 'متجر', 'معرض', 'مصنع', 'ورشة', 'مكتب'],
    companyNames: [
        'النجاح', 'الأمل', 'التميز', 'الإبداع', 'الرائد', 'المستقبل', 'الصفوة', 'الريادة',
        'الابتكار', 'التطوير', 'الجودة', 'الإتقان', 'الازدهار', 'النماء', 'الرفيع', 'الفخامة'
    ],
    jobTitles: [
        'مدير عام', 'محاسب', 'مندوب مبيعات', 'أمينه مستودع', 'موارد بشرية', 'مهندس إنتاج',
        'فني صيانة', 'سائق', 'مستقبال', 'حارس أمن'
    ],
    assetNames: [
        'سيارة تويوتا', 'سيارة هيونداي', 'لابتوب ديل', 'لابتوب اتش بي', 'طابعة ليزر',
        'مكتب إداري', 'كرسي مكتب', 'مكيف اسبليت', 'آلة تصوير', 'سيرفر بيانات'
    ],
    departmentNames: ['الإدارة العامة', 'المبيعات', 'المستودعات', 'المالية', 'الموارد البشرية', 'الإنتاج'],
    cities: ['الرياض', 'جدة', 'مكة', 'المدينة', 'الدمام', 'الخبر', 'الطائف', 'أبها']
};
// ============================================
// GENERATORS
// ============================================
function generateBranches() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating branches...');
        const branches = [];
        for (let i = 0; i < CONFIG.branches; i++) {
            const id = (0, crypto_1.randomUUID)();
            const city = randomElement(ARABIC_NAMES.cities);
            const branch = {
                id,
                name: `فرع ${city} ${i + 1}`,
                location: city,
                manager: `${randomElement(ARABIC_NAMES.firstNames)} ${randomElement(ARABIC_NAMES.lastNames)}`,
                phone: `05${randomInt(10000000, 99999999)}`
            };
            branches.push(branch);
            yield db_1.pool.query('INSERT INTO branches (id, name, location, manager, phone) VALUES(?, ?, ?, ?, ?)', [branch.id, branch.name, branch.location, branch.manager, branch.phone]);
        }
        return branches;
    });
}
function generateWarehouses(branches) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating warehouses...');
        const warehouses = [];
        for (let i = 0; i < CONFIG.warehouses; i++) {
            const id = (0, crypto_1.randomUUID)();
            const branch = randomElement(branches);
            const warehouse = {
                id,
                name: `مستودع ${i + 1} - ${branch.name}`,
                branchId: branch.id,
                keeper: `${randomElement(ARABIC_NAMES.firstNames)} ${randomElement(ARABIC_NAMES.lastNames)}`,
                phone: `05${randomInt(10000000, 99999999)}`
            };
            warehouses.push(warehouse);
            yield db_1.pool.query('INSERT INTO warehouses (id, name, branchId, keeper, phone) VALUES (?, ?, ?, ?, ?)', [warehouse.id, warehouse.name, warehouse.branchId, warehouse.keeper, warehouse.phone]);
        }
        return warehouses;
    });
}
function generateUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating users...');
        const users = [];
        const password = yield bcrypt_1.default.hash('password123', 10);
        const roles = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALESPERSON', 'WAREHOUSE_KEEPER'];
        // Ensure at least one admin
        const adminId = (0, crypto_1.randomUUID)();
        try {
            yield db_1.pool.query('INSERT INTO users (id, name, email, username, password, role, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [adminId, 'Admin User', 'admin@company.com', 'admin', password, 'ADMIN', 'ACTIVE', JSON.stringify({ all: true })]);
            users.push({ id: adminId, role: 'ADMIN' });
        }
        catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                console.log('  Admin user already exists, skipping...');
                // Try to fetch existing admin to add to users array
                const [rows] = yield db_1.pool.query('SELECT id, role FROM users WHERE email = ?', ['admin@company.com']);
                if (rows.length > 0) {
                    users.push(rows[0]);
                }
            }
            else {
                console.error('  Error creating admin:', error.message);
            }
        }
        for (let i = 0; i < 10; i++) {
            const id = (0, crypto_1.randomUUID)();
            const role = randomElement(roles);
            const name = `${randomElement(ARABIC_NAMES.firstNames)} ${randomElement(ARABIC_NAMES.lastNames)}`;
            const email = `user${i + 1}@company.com`;
            try {
                yield db_1.pool.query('INSERT INTO users (id, name, email, username, password, role, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, name, email, `user${i + 1}`, password, role, 'ACTIVE', JSON.stringify({ all: role === 'ADMIN' })]);
                users.push({ id, role });
            }
            catch (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    // If collision, just fetch it
                    const [rows] = yield db_1.pool.query('SELECT id, role FROM users WHERE email = ?', [email]);
                    if (rows.length > 0) {
                        users.push(rows[0]);
                    }
                }
            }
        }
        return users;
    });
}
function generateCostCenters() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating cost centers...');
        const costCenters = [];
        const names = ['المبيعات', 'الإنتاج', 'التسويق', 'الإدارة', 'الصيانة'];
        for (let i = 0; i < CONFIG.costCenters; i++) {
            const id = (0, crypto_1.randomUUID)();
            const costCenter = {
                id,
                code: `CC-${(i + 1).toString().padStart(3, '0')}`,
                name: names[i % names.length],
                description: `مركز تكلفة ${names[i % names.length]}`
            };
            costCenters.push(costCenter);
            yield db_1.pool.query('INSERT INTO cost_centers (id, code, name, description) VALUES (?, ?, ?, ?)', [costCenter.id, costCenter.code, costCenter.name, costCenter.description]);
        }
        return costCenters;
    });
}
function generateFixedAssets(costCenters) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating fixed assets...');
        const assets = [];
        for (let i = 0; i < CONFIG.assets; i++) {
            const id = (0, crypto_1.randomUUID)();
            const name = randomElement(ARABIC_NAMES.assetNames);
            const cost = randomFloat(2000, 150000);
            const lifeYears = randomInt(3, 10);
            const asset = {
                id,
                name: `${name} #${i + 1}`,
                purchaseDate: formatDate(randomDate(CONFIG.year - 1)), // Purchased last year or earlier
                purchaseCost: cost,
                salvageValue: cost * 0.1,
                lifeYears,
                status: 'ACTIVE',
                assetAccountId: '1501', // Mock Account IDs
                accumulatedDepreciationAccountId: '1502',
                expenseAccountId: '5501'
            };
            assets.push(asset);
            yield db_1.pool.query(`INSERT INTO fixed_assets (id, name, purchaseDate, purchaseCost, salvageValue, lifeYears, assetAccountId, accumulatedDepreciationAccountId, expenseAccountId, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [asset.id, asset.name, asset.purchaseDate, asset.purchaseCost, asset.salvageValue, asset.lifeYears,
                asset.assetAccountId, asset.accumulatedDepreciationAccountId, asset.expenseAccountId, asset.status]);
        }
        return assets;
    });
}
function generateEmployees(branches) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating employees...');
        const employees = [];
        for (let i = 0; i < CONFIG.employees; i++) {
            const id = (0, crypto_1.randomUUID)();
            const branch = randomElement(branches);
            const employee = {
                id,
                fullName: `${randomElement(ARABIC_NAMES.firstNames)} ${randomElement(ARABIC_NAMES.lastNames)}`,
                nationalId: `1${randomInt(100000000, 999999999)}`,
                jobTitle: randomElement(ARABIC_NAMES.jobTitles),
                department: randomElement(ARABIC_NAMES.departmentNames),
                employmentType: 'MONTHLY',
                baseSalary: randomFloat(3000, 15000),
                branchId: branch.id,
                status: 'ACTIVE',
                hireDate: formatDate(randomDate(2020, 1, 12))
            };
            employees.push(employee);
            yield db_1.pool.query(`INSERT INTO employees (id, fullName, nationalId, jobTitle, department, employmentType, baseSalary, branchId, status, hireDate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [employee.id, employee.fullName, employee.nationalId, employee.jobTitle, employee.department,
                employee.employmentType, employee.baseSalary, employee.branchId, employee.status, employee.hireDate]);
        }
        return employees;
    });
}
// Generates Payroll Cycles and Entries for the last few months
function generatePayroll(employees) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating payroll...');
        const cycles = [];
        // Generate for months 1 to CONFIG.transactions.payrollMonths
        for (let m = 1; m <= CONFIG.transactions.payrollMonths; m++) {
            const cycleId = (0, crypto_1.randomUUID)();
            const totalAmount = 0; // Updated later
            const status = 'PAID';
            try {
                yield db_1.pool.query('INSERT INTO payroll_cycles (id, month, year, status) VALUES (?, ?, ?, ?)', [cycleId, m, CONFIG.year, status]);
                let cycleTotal = 0;
                for (const emp of employees) {
                    const entryId = (0, crypto_1.randomUUID)();
                    const netSalary = emp.baseSalary; // Simplified
                    try {
                        yield db_1.pool.query(`INSERT INTO payroll_entries (id, payrollId, employeeId, baseSalary, netSalary, status)
                         VALUES (?, ?, ?, ?, ?, ?)`, [entryId, cycleId, emp.id, emp.baseSalary, netSalary, 'PAID']);
                        cycleTotal += netSalary;
                    }
                    catch (e) {
                        // Ignore duplicate entries
                        if (e.code !== 'ER_DUP_ENTRY')
                            console.error('  Error creating payroll entry:', e.message);
                    }
                }
                yield db_1.pool.query('UPDATE payroll_cycles SET totalAmount = ? WHERE id = ?', [cycleTotal, cycleId]);
            }
            catch (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    console.log(`  Payroll cycle for month ${m}/${CONFIG.year} already exists, skipping...`);
                }
                else {
                    console.error('  Error creating payroll cycle:', error.message);
                }
            }
        }
    });
}
function generateCategories() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating categories...');
        const categories = [];
        const catNames = ['مواد خام', 'منتجات نهائية', 'قطع غيار', 'تغليف', 'اكسسوارات'];
        for (let i = 0; i < CONFIG.categories; i++) {
            const id = (0, crypto_1.randomUUID)();
            const name = catNames[i % catNames.length] + ' ' + (i + 1);
            categories.push({ id });
            yield db_1.pool.query('INSERT INTO categories (id, name, description) VALUES (?, ?, ?)', [id, name, `وصف ${name}`]);
        }
        return categories;
    });
}
function generateProducts(warehouses, categories) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating products...');
        const products = [];
        // Raw Materials
        for (let i = 0; i < CONFIG.products.rawMaterials; i++) {
            const id = (0, crypto_1.randomUUID)();
            const sku = `RM-${(i + 1).toString().padStart(4, '0')}`;
            try {
                yield db_1.pool.query(`INSERT INTO products (id, name, sku, type, price, cost, stock, warehouseId, categoryId, minStock, maxStock)
                 VALUES (?, ?, ?, 'RAW', ?, ?, ?, ?, ?, 10, 2000)`, [id, `مادة خام ${i + 1}`, sku, randomFloat(10, 100), randomFloat(5, 80), randomInt(100, 1000),
                    randomElement(warehouses).id, randomElement(categories).id]);
                products.push({ id, type: 'RAW', name: `مادة خام ${i + 1}` }); // Simplified push for performance
            }
            catch (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    const [rows] = yield db_1.pool.query('SELECT id, name, type, price, cost FROM products WHERE sku = ?', [sku]);
                    if (rows.length > 0) {
                        products.push(rows[0]);
                    }
                }
            }
        }
        // Finished Goods
        for (let i = 0; i < CONFIG.products.finishedGoods; i++) {
            const id = (0, crypto_1.randomUUID)();
            const sku = `FG-${(i + 1).toString().padStart(4, '0')}`;
            try {
                yield db_1.pool.query(`INSERT INTO products (id, name, sku, type, price, cost, stock, warehouseId, categoryId, minStock, maxStock)
                 VALUES (?, ?, ?, 'FINISHED', ?, ?, ?, ?, ?, 10, 1000)`, [id, `منتج نهائي ${i + 1}`, sku, randomFloat(100, 500), randomFloat(50, 250), randomInt(50, 500),
                    randomElement(warehouses).id, randomElement(categories).id]);
                products.push({ id, type: 'FINISHED', name: `منتج نهائي ${i + 1}` });
            }
            catch (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    const [rows] = yield db_1.pool.query('SELECT id, name, type, price, cost FROM products WHERE sku = ?', [sku]);
                    if (rows.length > 0) {
                        products.push(rows[0]);
                    }
                }
            }
        }
        return products;
    });
}
function generateBOMs(products) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating BOMs...');
        const rawMaterials = products.filter(p => p.type === 'RAW');
        const finishedGoods = products.filter(p => p.type === 'FINISHED');
        const boms = [];
        // Create BOM for 50% of finished goods
        for (const fg of finishedGoods.slice(0, Math.floor(finishedGoods.length / 2))) {
            const id = (0, crypto_1.randomUUID)();
            yield db_1.pool.query('INSERT INTO bom (id, finished_product_id, name, version, is_active, labor_cost, overhead_cost) VALUES (?, ?, ?, 1, 1, 20, 10)', [id, fg.id, `تركيبة ${fg.name}`]);
            boms.push({ id, finishedProductId: fg.id });
            // Add items - Ensure unique raw materials
            const numItems = randomInt(2, Math.min(5, rawMaterials.length));
            const usedRawMaterialIds = new Set();
            for (let k = 0; k < numItems; k++) {
                let raw;
                let attempts = 0;
                // Try to find an unused raw material
                do {
                    raw = randomElement(rawMaterials);
                    attempts++;
                } while (usedRawMaterialIds.has(raw.id) && attempts < 10);
                if (raw && !usedRawMaterialIds.has(raw.id)) {
                    usedRawMaterialIds.add(raw.id);
                    try {
                        yield db_1.pool.query('INSERT INTO bom_items (bom_id, raw_product_id, quantity_per_unit, waste_percent) VALUES (?, ?, ?, 0)', [id, raw.id, randomFloat(1, 5)]);
                    }
                    catch (error) {
                        if (error.code !== 'ER_DUP_ENTRY')
                            throw error;
                        // If duplicate somehow slipped through, just ignore
                    }
                }
            }
        }
        return boms;
    });
}
function generatePartners() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating partners...');
        const partners = [];
        // Customers
        for (let i = 0; i < CONFIG.partners.customers; i++) {
            const id = (0, crypto_1.randomUUID)();
            const name = `${randomElement(ARABIC_NAMES.firstNames)} ${randomElement(ARABIC_NAMES.lastNames)}`;
            partners.push({ id, name, isCustomer: true, isSupplier: false });
            yield db_1.pool.query(`INSERT INTO partners (id, name, type, isCustomer, isSupplier, balance, phone) 
             VALUES (?, ?, 'CUSTOMER', 1, 0, 0, ?)`, [id, name, `05${randomInt(10000000, 99999999)}`]);
        }
        // Suppliers
        for (let i = 0; i < CONFIG.partners.suppliers; i++) {
            const id = (0, crypto_1.randomUUID)();
            const name = `${randomElement(ARABIC_NAMES.companyNames)} للمقاولات`;
            partners.push({ id, name, isCustomer: false, isSupplier: true });
            yield db_1.pool.query(`INSERT INTO partners (id, name, type, isCustomer, isSupplier, balance, phone) 
             VALUES (?, ?, 'SUPPLIER', 0, 1, 0, ?)`, [id, name, `05${randomInt(10000000, 99999999)}`]);
        }
        return partners;
    });
}
function generateBanks() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating banks...');
        const banks = [];
        const bankNames = ['الراجحي', 'الأهلي', 'الرياض', 'الانماء'];
        for (let i = 0; i < CONFIG.banks; i++) {
            const id = (0, crypto_1.randomUUID)();
            const name = bankNames[i];
            try {
                yield db_1.pool.query('INSERT INTO banks (id, name, accountNumber, currency, balance, type) VALUES (?, ?, ?, "SAR", 100000, "CURRENT")', [id, name, `SA${randomInt(100000, 999999)}`]);
                banks.push({ id, name });
            }
            catch (error) {
                // If duplicate name or something
                try {
                    const [rows] = yield db_1.pool.query('SELECT id, name FROM banks WHERE name = ?', [name]);
                    if (rows.length > 0) {
                        banks.push(rows[0]);
                    }
                }
                catch (e) { }
            }
        }
        return banks;
    });
}
function generateSalesmen(users) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating salesmen...');
        const salesmen = [];
        const types = ['SALES', 'COLLECTION', 'BOTH'];
        for (let i = 0; i < CONFIG.salesmen; i++) {
            const id = (0, crypto_1.randomUUID)();
            const name = `${randomElement(ARABIC_NAMES.firstNames)} ${randomElement(ARABIC_NAMES.lastNames)}`;
            const type = randomElement(types);
            // Link to a user if available, otherwise null
            const userId = i < users.length ? users[i].id : null;
            try {
                // Removed 'target_monthly', 'commission_rate', 'status' as they do not exist
                yield db_1.pool.query(`INSERT INTO salesmen (id, name, phone, type) 
                 VALUES (?, ?, ?, ?)`, [id, name, `05${randomInt(10000000, 99999999)}`, type]);
                salesmen.push({ id, name, type });
            }
            catch (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    // Try to fetch existing
                    const [rows] = yield db_1.pool.query('SELECT id, name, type FROM salesmen WHERE name = ? LIMIT 1', [name]);
                    if (rows.length > 0)
                        salesmen.push(rows[0]);
                }
                else if (error.code === 'ER_NO_SUCH_TABLE') {
                    console.warn('Salesmen table does not exist, skipping...');
                    return [];
                }
                else {
                    console.warn('Error creating salesman:', error.message);
                }
            }
        }
        return salesmen;
    });
}
function generateSalesmanTargets(salesmen, categories) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating salesman targets...');
        if (salesmen.length === 0)
            return;
        for (const salesman of salesmen) {
            // Create 2-3 targets for each salesman
            for (let k = 0; k < randomInt(2, 3); k++) {
                const id = (0, crypto_1.randomUUID)();
                const category = randomElement(categories);
                try {
                    // target for current month
                    const startDate = new Date(CONFIG.year, new Date().getMonth(), 1);
                    const endDate = new Date(CONFIG.year, new Date().getMonth() + 1, 0);
                    yield db_1.pool.query(`INSERT INTO salesman_targets (id, salesmanId, targetType, categoryId, targetAmount, periodType, periodStart, periodEnd, isActive)
                     VALUES (?, ?, 'CATEGORY', ?, ?, 'MONTHLY', ?, ?, 1)`, [id, salesman.id, category.id, randomFloat(10000, 50000), formatDate(startDate), formatDate(endDate)]);
                }
                catch (error) {
                    if (error.code !== 'ER_DUP_ENTRY')
                        console.warn('Error creating target:', error.message);
                }
            }
        }
    });
}
// ============================================
// TRANSACTIONS
// ============================================
function generateTransactions(partners, products, warehouses, costCenters, banks, boms, salesmen) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating transactions...');
        const customers = partners.filter(p => p.isCustomer);
        const suppliers = partners.filter(p => p.isSupplier);
        const finishedGoods = products.filter(p => p.type === 'FINISHED');
        const rawMaterials = products.filter(p => p.type === 'RAW');
        // Sales Invoices
        for (let i = 0; i < CONFIG.transactions.salesInvoices; i++) {
            const id = (0, crypto_1.randomUUID)();
            const date = randomDate(CONFIG.year);
            const customer = randomElement(customers);
            const product = randomElement(finishedGoods);
            const qty = randomInt(1, 10);
            const total = product.price * qty;
            const salesman = (salesmen && salesmen.length > 0 && Math.random() > 0.3) ? randomElement(salesmen) : null;
            const salesmanId = salesman ? salesman.id : null;
            try {
                yield db_1.pool.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status, warehouseId, costCenterId, posted, salesmanId) 
                 VALUES (?, ?, 'INVOICE_SALE', ?, ?, ?, 'POSTED', ?, ?, 1, ?)`, [id, formatDateTime(date), customer.id, customer.name, total, randomElement(warehouses).id, randomElement(costCenters).id, salesmanId]);
                yield db_1.pool.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, total) 
                 VALUES (?, ?, ?, ?, ?, ?)`, [id, product.id, product.name, qty, product.price, total]);
            }
            catch (error) {
                if (error.code !== 'ER_DUP_ENTRY')
                    console.error('Error creating sales invoice:', error.message);
            }
        }
        // Purchase Invoices
        for (let i = 0; i < CONFIG.transactions.purchaseInvoices; i++) {
            const id = (0, crypto_1.randomUUID)();
            const date = randomDate(CONFIG.year);
            const supplier = randomElement(suppliers);
            const product = randomElement(rawMaterials);
            const qty = randomInt(10, 100);
            const total = product.cost * qty;
            try {
                yield db_1.pool.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status, warehouseId, costCenterId, posted) 
                 VALUES (?, ?, 'INVOICE_PURCHASE', ?, ?, ?, 'POSTED', ?, ?, 1)`, [id, formatDateTime(date), supplier.id, supplier.name, total, randomElement(warehouses).id, randomElement(costCenters).id]);
                yield db_1.pool.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, total) 
                 VALUES (?, ?, ?, ?, ?, ?)`, [id, product.id, product.name, qty, product.cost, total]);
            }
            catch (error) {
                if (error.code !== 'ER_DUP_ENTRY')
                    console.error('Error creating purchase invoice:', error.message);
            }
        }
        // Production Orders
        for (let i = 0; i < CONFIG.transactions.productionOrders; i++) {
            const bom = randomElement(boms);
            const id = (0, crypto_1.randomUUID)();
            const date = randomDate(CONFIG.year);
            const qty = randomInt(5, 50);
            // Randomize Order Number to avoid collision
            const orderNum = `PO-${randomInt(1000, 999999)}`;
            try {
                yield db_1.pool.query(`INSERT INTO production_orders (id, order_number, bom_id, finished_product_id, qty_planned, qty_finished, status, start_date, warehouse_id)
                 VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)`, [id, orderNum, bom.id, bom.finishedProductId, qty, qty, formatDate(date), randomElement(warehouses).id]);
            }
            catch (error) {
                if (error.code !== 'ER_DUP_ENTRY')
                    console.error('Error creating production order:', error.message);
            }
        }
        // Payment Receipts (Customers Paying)
        for (let i = 0; i < CONFIG.transactions.paymentReceipts; i++) {
            const customer = randomElement(customers);
            const id = (0, crypto_1.randomUUID)();
            const amount = randomFloat(100, 5000);
            const bank = randomElement(banks);
            try {
                yield db_1.pool.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status, bankAccountId, bankName, posted, paymentMethod)
                 VALUES (?, ?, 'PAYMENT_RECEIVED', ?, ?, ?, 'POSTED', ?, ?, 1, 'BANK')`, [id, formatDateTime(randomDate(CONFIG.year)), customer.id, customer.name, amount, bank.id, bank.name]);
            }
            catch (error) {
                if (error.code !== 'ER_DUP_ENTRY')
                    console.error('Error creating payment receipt:', error.message);
            }
        }
        console.log('✓ Transactions generated');
    });
}
// ============================================
// MAIN EXECUTION
// ============================================
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('='.repeat(60));
        console.log('COMPREHENSIVE MOCK DATA GENERATION');
        console.log('='.repeat(60));
        try {
            const branches = yield generateBranches();
            const warehouses = yield generateWarehouses(branches);
            const users = yield generateUsers();
            const costCenters = yield generateCostCenters();
            const employees = yield generateEmployees(branches);
            const assets = yield generateFixedAssets(costCenters);
            const categories = yield generateCategories();
            const products = yield generateProducts(warehouses, categories);
            const partners = yield generatePartners();
            const banks = yield generateBanks();
            const boms = yield generateBOMs(products);
            const salesmen = yield generateSalesmen(users);
            yield generateSalesmanTargets(salesmen, categories);
            // Modules Transactions
            yield generatePayroll(employees);
            yield generateTransactions(partners, products, warehouses, costCenters, banks, boms, salesmen);
            console.log('='.repeat(60));
            console.log('MOCK DATA GENERATION COMPLETED SUCCESSFULLY');
            console.log('='.repeat(60));
            process.exit(0);
        }
        catch (error) {
            console.error('Error:', error);
            process.exit(1);
        }
    });
}
main();
