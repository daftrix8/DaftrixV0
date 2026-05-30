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
// Enhanced configuration for comprehensive testing
const CONFIG = {
    year: 2024,
    products: {
        rawMaterials: 150,
        finishedGoods: 200,
    },
    partners: {
        customers: 150,
        suppliers: 75,
    },
    transactions: {
        salesInvoices: 8000,
        purchaseInvoices: 4000,
        salesReturns: 400,
        purchaseReturns: 200,
        productionOrders: 1500,
        paymentReceipts: 4000,
        paymentVouchers: 1500,
        cheques: 2000,
        cashTransactions: 3000,
        journalEntries: 2000
    },
    warehouses: 15,
    branches: 8,
    categories: 15,
    salesmen: 30,
    costCenters: 15,
    priceLists: 5,
    banks: 8,
    users: 10
};
// Utility functions
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomFloat(min, max, decimals = 2) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}
function randomElement(array) {
    return array[randomInt(0, array.length - 1)];
}
function randomDate(year, startMonth = 1, endMonth = 12) {
    const month = randomInt(startMonth - 1, endMonth - 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const day = randomInt(1, daysInMonth);
    const date = new Date(year, month, day);
    while (date.getDay() === 0 || date.getDay() === 6) {
        date.setDate(date.getDate() + 1);
    }
    date.setHours(randomInt(8, 17), randomInt(0, 59), 0, 0);
    return date;
}
function formatDateTime(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}
// Arabic data
const ARABIC_DATA = {
    firstNames: ['محمد', 'أحمد', 'علي', 'حسن', 'حسين', 'عبدالله', 'إبراهيم', 'خالد', 'سعيد', 'فيصل', 'عمر', 'يوسف', 'طارق', 'ماجد', 'سلطان'],
    lastNames: ['العتيبي', 'الشمري', 'الحربي', 'الدوسري', 'القحطاني', 'الغامدي', 'الزهراني', 'العنزي', 'السبيعي', 'المطيري'],
    companyTypes: ['مؤسسة', 'شركة', 'متجر', 'معرض', 'مصنع', 'ورشة'],
    companyNames: ['النجاح', 'الأمل', 'التميز', 'الإبداع', 'الرائد', 'المستقبل', 'الصفوة', 'الريادة', 'الابتكار', 'التطوير'],
    rawMaterials: ['قماش قطن', 'قماش بوليستر', 'خيط قطني', 'خيط نايلون', 'أزرار', 'سحاب', 'دانتيل', 'شريط مطاط'],
    finishedGoods: ['ملاءة سرير', 'مخدة', 'بطانية', 'ستارة', 'مفرش طاولة', 'منشفة', 'طقم سفرة', 'غطاء كنب'],
    cities: ['الرياض', 'جدة', 'مكة', 'المدينة', 'الدمام', 'الخبر', 'الطائف', 'أبها'],
    districts: ['العليا', 'الملز', 'النخيل', 'الروضة', 'الربوة', 'الشفا']
};
// Generate master data
function generateUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating users...');
        const users = [];
        const hashedPassword = yield bcrypt_1.default.hash('password123', 10);
        for (let i = 0; i < CONFIG.users; i++) {
            const id = (0, crypto_1.randomUUID)();
            const name = `${randomElement(ARABIC_DATA.firstNames)} ${randomElement(ARABIC_DATA.lastNames)}`;
            const role = i === 0 ? 'ADMIN' : randomElement(['MANAGER', 'ACCOUNTANT', 'SALESPERSON', 'WAREHOUSE_KEEPER']);
            const user = {
                id,
                name,
                email: `user${i + 1}@company.com`,
                username: `user${i + 1}`,
                password: hashedPassword,
                role,
                status: 'ACTIVE',
                permissions: JSON.stringify({ all: role === 'ADMIN' })
            };
            users.push(user);
            yield db_1.pool.query('INSERT INTO users (id, name, email, username, password, role, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [user.id, user.name, user.email, user.username, user.password, user.role, user.status, user.permissions]);
        }
        console.log(`✓ Created ${users.length} users`);
        return users;
    });
}
function generateBranches() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating branches...');
        const branches = [];
        for (let i = 0; i < CONFIG.branches; i++) {
            const id = (0, crypto_1.randomUUID)();
            const city = randomElement(ARABIC_DATA.cities);
            const branch = {
                id,
                name: `فرع ${city}`,
                location: `${city} - ${randomElement(ARABIC_DATA.districts)}`,
                manager: `${randomElement(ARABIC_DATA.firstNames)} ${randomElement(ARABIC_DATA.lastNames)}`,
                phone: `05${randomInt(10000000, 99999999)}`
            };
            branches.push(branch);
            yield db_1.pool.query('INSERT INTO branches (id, name, location, manager, phone) VALUES(?, ?, ?, ?, ?)', [branch.id, branch.name, branch.location, branch.manager, branch.phone]);
        }
        console.log(`✓ Created ${branches.length} branches`);
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
                name: `مستودع ${i + 1}`,
                branchId: branch.id,
                keeper: `${randomElement(ARABIC_DATA.firstNames)} ${randomElement(ARABIC_DATA.lastNames)}`,
                phone: `05${randomInt(10000000, 99999999)}`
            };
            warehouses.push(warehouse);
            yield db_1.pool.query('INSERT INTO warehouses (id, name, branchId, keeper, phone) VALUES (?, ?, ?, ?, ?)', [warehouse.id, warehouse.name, warehouse.branchId, warehouse.keeper, warehouse.phone]);
        }
        console.log(`✓ Created ${warehouses.length} warehouses`);
        return warehouses;
    });
}
function generateCategories() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating categories...');
        const categories = [];
        const names = ['أقمشة', 'منسوجات', 'ألبسة', 'مواد تعبئة', 'خيوط'];
        for (let i = 0; i < CONFIG.categories; i++) {
            const id = (0, crypto_1.randomUUID)();
            const category = {
                id,
                name: `${names[i % names.length]} ${Math.floor(i / names.length) + 1}`,
                description: `فئة ${names[i % names.length]}`
            };
            categories.push(category);
            yield db_1.pool.query('INSERT INTO categories (id, name, description) VALUES (?, ?, ?)', [category.id, category.name, category.description]);
        }
        console.log(`✓ Created ${categories.length} categories`);
        return categories;
    });
}
function generateProducts(warehouses, categories) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating products...');
        const products = [];
        for (let i = 0; i < CONFIG.products.rawMaterials; i++) {
            const id = (0, crypto_1.randomUUID)();
            const name = randomElement(ARABIC_DATA.rawMaterials);
            const product = {
                id,
                name: `${name} - نوع ${i + 1}`,
                sku: `RAW-${String(i + 1).padStart(4, '0')}`,
                barcode: `${randomInt(1000000000000, 9999999999999)}`,
                price: randomFloat(10, 200),
                cost: randomFloat(5, 150),
                stock: randomInt(100, 5000),
                minStock: 50,
                maxStock: 10000,
                warehouseId: randomElement(warehouses).id,
                categoryId: randomElement(categories).id,
                type: 'RAW'
            };
            products.push(product);
            yield db_1.pool.query(`INSERT INTO products (id, name, sku, barcode, price, cost, stock, minStock, maxStock, warehouseId, categoryId) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [product.id, product.name, product.sku, product.barcode, product.price, product.cost,
                product.stock, product.minStock, product.maxStock, product.warehouseId, product.categoryId]);
        }
        for (let i = 0; i < CONFIG.products.finishedGoods; i++) {
            const id = (0, crypto_1.randomUUID)();
            const name = randomElement(ARABIC_DATA.finishedGoods);
            const product = {
                id,
                name: `${name} - موديل ${i + 1}`,
                sku: `FIN-${String(i + 1).padStart(4, '0')}`,
                barcode: `${randomInt(1000000000000, 9999999999999)}`,
                price: randomFloat(50, 500),
                cost: randomFloat(30, 300),
                stock: randomInt(10, 500),
                minStock: 10,
                maxStock: 1000,
                warehouseId: randomElement(warehouses).id,
                categoryId: randomElement(categories).id,
                type: 'FINISHED'
            };
            products.push(product);
            yield db_1.pool.query(`INSERT INTO products (id, name, sku, barcode, price, cost, stock, minStock, maxStock, warehouseId, categoryId) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [product.id, product.name, product.sku, product.barcode, product.price, product.cost,
                product.stock, product.minStock, product.maxStock, product.warehouseId, product.categoryId]);
        }
        console.log(`✓ Created ${products.length} products`);
        return products;
    });
}
function generatePartners() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating partners...');
        const partners = [];
        for (let i = 0; i < CONFIG.partners.customers; i++) {
            const id = (0, crypto_1.randomUUID)();
            const isCompany = Math.random() > 0.3;
            const name = isCompany
                ? `${randomElement(ARABIC_DATA.companyTypes)} ${randomElement(ARABIC_DATA.companyNames)} ${randomElement(ARABIC_DATA.lastNames)}`
                : `${randomElement(ARABIC_DATA.firstNames)} ${randomElement(ARABIC_DATA.lastNames)}`;
            const partner = {
                id,
                name,
                type: 'CUSTOMER',
                isCustomer: true,
                isSupplier: false,
                balance: 0,
                phone: `05${randomInt(10000000, 99999999)}`,
                email: `customer${i + 1}@example.com`,
                taxId: isCompany ? `3${randomInt(100000000, 999999999)}` : null,
                address: `${randomElement(ARABIC_DATA.cities)} - ${randomElement(ARABIC_DATA.districts)}`,
                contactPerson: `${randomElement(ARABIC_DATA.firstNames)} ${randomElement(ARABIC_DATA.lastNames)}`,
                openingBalance: randomFloat(-50000, 50000),
                paymentTerms: randomElement([0, 7, 14, 30, 60])
            };
            partners.push(partner);
            yield db_1.pool.query(`INSERT INTO partners (id, name, type, isCustomer, isSupplier, balance, phone, email, taxId, address, contactPerson, openingBalance, paymentTerms) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [partner.id, partner.name, partner.type, partner.isCustomer, partner.isSupplier,
                partner.balance, partner.phone, partner.email, partner.taxId, partner.address,
                partner.contactPerson, partner.openingBalance, partner.paymentTerms]);
        }
        for (let i = 0; i < CONFIG.partners.suppliers; i++) {
            const id = (0, crypto_1.randomUUID)();
            const name = `${randomElement(ARABIC_DATA.companyTypes)} ${randomElement(ARABIC_DATA.companyNames)} للتجارة`;
            const partner = {
                id,
                name,
                type: 'SUPPLIER',
                isCustomer: false,
                isSupplier: true,
                balance: 0,
                phone: `05${randomInt(10000000, 99999999)}`,
                email: `supplier${i + 1}@example.com`,
                taxId: `3${randomInt(100000000, 999999999)}`,
                address: `${randomElement(ARABIC_DATA.cities)} - ${randomElement(ARABIC_DATA.districts)}`,
                contactPerson: `${randomElement(ARABIC_DATA.firstNames)} ${randomElement(ARABIC_DATA.lastNames)}`,
                openingBalance: randomFloat(-100000, 100000),
                paymentTerms: randomElement([0, 7, 30, 60, 90])
            };
            partners.push(partner);
            yield db_1.pool.query(`INSERT INTO partners (id, name, type, isCustomer, isSupplier, balance, phone, email, taxId, address, contactPerson, openingBalance, paymentTerms) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [partner.id, partner.name, partner.type, partner.isCustomer, partner.isSupplier,
                partner.balance, partner.phone, partner.email, partner.taxId, partner.address,
                partner.contactPerson, partner.openingBalance, partner.paymentTerms]);
        }
        console.log(`✓ Created ${partners.length} partners`);
        return partners;
    });
}
function generateBanks() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating banks...');
        const banks = [];
        const bankNames = ['البنك الأهلي', 'بنك الرياض', 'البنك السعودي الفرنسي', 'بنك الراجحي'];
        for (let i = 0; i < CONFIG.banks; i++) {
            const id = (0, crypto_1.randomUUID)();
            const bank = {
                id,
                name: `${bankNames[i % bankNames.length]} ${Math.floor(i / bankNames.length) + 1}`,
                accountNumber: `SA${randomInt(10, 99)}${randomInt(1000000000000000, 9999999999999999)}`,
                currency: 'SAR',
                balance: randomFloat(50000, 500000),
                type: 'CURRENT'
            };
            banks.push(bank);
            yield db_1.pool.query('INSERT INTO banks (id, name, accountNumber, currency, balance, type) VALUES (?, ?, ?, ?, ?, ?)', [bank.id, bank.name, bank.accountNumber, bank.currency, bank.balance, bank.type]);
        }
        console.log(`✓ Created ${banks.length} banks`);
        return banks;
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
                code: `CC-${String(i + 1).padStart(3, '0')}`,
                name: `${names[i % names.length]} ${Math.floor(i / names.length) + 1}`,
                description: `مركز تكلفة ${names[i % names.length]}`
            };
            costCenters.push(costCenter);
            yield db_1.pool.query('INSERT INTO cost_centers (id, code, name, description) VALUES (?, ?, ?, ?)', [costCenter.id, costCenter.code, costCenter.name, costCenter.description]);
        }
        console.log(`✓ Created ${costCenters.length} cost centers`);
        return costCenters;
    });
}
// Generate transactions with proper linkages
function generateSalesInvoices(partners, products, warehouses, costCenters) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating sales invoices...');
        const customers = partners.filter(p => p.isCustomer);
        const finishedGoods = products.filter(p => p.type === 'FINISHED');
        const invoices = [];
        for (let i = 0; i < CONFIG.transactions.salesInvoices; i++) {
            const id = (0, crypto_1.randomUUID)();
            const customer = randomElement(customers);
            const date = randomDate(CONFIG.year);
            const numLines = randomInt(1, 5);
            let subtotal = 0;
            const invoice = {
                id,
                date: formatDateTime(date),
                type: 'INVOICE_SALE',
                partnerId: customer.id,
                partnerName: customer.name,
                status: 'POSTED',
                paymentMethod: randomElement(['CASH', 'BANK', 'CREDIT']),
                posted: true,
                warehouseId: randomElement(warehouses).id,
                costCenterId: randomElement(costCenters).id,
                paidAmount: 0
            };
            const lines = [];
            for (let j = 0; j < numLines; j++) {
                const product = randomElement(finishedGoods);
                const quantity = randomInt(1, 20);
                const price = product.price * randomFloat(0.9, 1.1);
                const discount = Math.random() > 0.7 ? randomFloat(0, price * quantity * 0.1) : 0;
                const total = price * quantity - discount;
                lines.push({
                    productId: product.id,
                    productName: product.name,
                    quantity,
                    price,
                    cost: product.cost,
                    discount,
                    total
                });
                subtotal += total;
            }
            const taxAmount = subtotal * 0.15;
            const total = subtotal + taxAmount;
            yield db_1.pool.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status, paymentMethod, posted, taxAmount, warehouseId, costCenterId, paidAmount) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [invoice.id, invoice.date, invoice.type, invoice.partnerId, invoice.partnerName, total,
                invoice.status, invoice.paymentMethod, invoice.posted, taxAmount, invoice.warehouseId, invoice.costCenterId, 0]);
            for (const line of lines) {
                yield db_1.pool.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [invoice.id, line.productId, line.productName, line.quantity, line.price, line.cost, line.discount, line.total]);
            }
            invoices.push(Object.assign(Object.assign({}, invoice), { total }));
            if ((i + 1) % 1000 === 0) {
                console.log(`  Generated ${i + 1} sales invoices...`);
            }
        }
        console.log(`✓ Created ${invoices.length} sales invoices`);
        return invoices;
    });
}
function generatePurchaseInvoices(partners, products, warehouses, costCenters) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating purchase invoices...');
        const suppliers = partners.filter(p => p.isSupplier);
        const rawMaterials = products.filter(p => p.type === 'RAW');
        const invoices = [];
        for (let i = 0; i < CONFIG.transactions.purchaseInvoices; i++) {
            const id = (0, crypto_1.randomUUID)();
            const supplier = randomElement(suppliers);
            const date = randomDate(CONFIG.year);
            const numLines = randomInt(1, 8);
            let subtotal = 0;
            const lines = [];
            for (let j = 0; j < numLines; j++) {
                const product = randomElement(rawMaterials);
                const quantity = randomInt(10, 200);
                const price = product.cost * randomFloat(0.95, 1.05);
                const total = price * quantity;
                lines.push({
                    productId: product.id,
                    productName: product.name,
                    quantity,
                    price,
                    cost: price,
                    total
                });
                subtotal += total;
            }
            const taxAmount = subtotal * 0.15;
            const total = subtotal + taxAmount;
            yield db_1.pool.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status, paymentMethod, posted, taxAmount, warehouseId, costCenterId, paidAmount) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, formatDateTime(date), 'INVOICE_PURCHASE', supplier.id, supplier.name, total,
                'POSTED', randomElement(['CASH', 'BANK', 'CREDIT']), true, taxAmount, randomElement(warehouses).id, randomElement(costCenters).id, 0]);
            for (const line of lines) {
                yield db_1.pool.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, line.productId, line.productName, line.quantity, line.price, line.cost, 0, line.total]);
            }
            invoices.push({ id, total, partnerId: supplier.id, partnerName: supplier.name });
            if ((i + 1) % 1000 === 0) {
                console.log(`  Generated ${i + 1} purchase invoices...`);
            }
        }
        console.log(`✓ Created ${invoices.length} purchase invoices`);
        return invoices;
    });
}
function generatePaymentReceipts(partners, banks) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating payment receipts with cheques...');
        const customers = partners.filter(p => p.isCustomer);
        const [invoices] = yield db_1.pool.query("SELECT * FROM invoices WHERE type = 'INVOICE_SALE' LIMIT 4000");
        let paymentCount = 0;
        let chequeCount = 0;
        for (let i = 0; i < Math.min(CONFIG.transactions.paymentReceipts, invoices.length); i++) {
            const invoice = invoices[i];
            const id = (0, crypto_1.randomUUID)();
            const date = randomDate(CONFIG.year);
            const bank = randomElement(banks);
            const paymentMethod = randomElement(['CASH', 'BANK', 'CHEQUE', 'MIXED']);
            const amount = invoice.total * randomFloat(0.3, 1.0);
            yield db_1.pool.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status, paymentMethod, posted, bankAccountId, bankName) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, formatDateTime(date), 'PAYMENT_RECEIVED', invoice.partnerId, invoice.partnerName, amount,
                'POSTED', paymentMethod, true, bank.id, bank.name]);
            // Create allocation
            yield db_1.pool.query(`INSERT INTO payment_allocations (id, paymentId, invoiceId, amount) VALUES (?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), id, invoice.id, amount]);
            // Update invoice
            yield db_1.pool.query(`UPDATE invoices SET paidAmount = paidAmount + ?, status = CASE WHEN total <= paidAmount + ? THEN 'PAID' ELSE 'PARTIAL' END WHERE id = ?`, [amount, amount, invoice.id]);
            // Create cheque if payment method is CHEQUE or MIXED
            if (paymentMethod === 'CHEQUE' || paymentMethod === 'MIXED') {
                const chequeAmount = paymentMethod === 'MIXED' ? amount * 0.6 : amount;
                const chequeId = (0, crypto_1.randomUUID)();
                const dueDate = new Date(date);
                dueDate.setDate(dueDate.getDate() + randomInt(7, 90));
                yield db_1.pool.query(`INSERT INTO cheques (id, number, bankName, amount, dueDate, status, type, partnerId, partnerName, description, createdDate, bankAccountId) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [chequeId, `CHQ-${randomInt(100000, 999999)}`, bank.name, chequeAmount, formatDateTime(dueDate),
                    randomElement(['PENDING', 'COLLECTED', 'BOUNCED']), 'INCOMING', invoice.partnerId, invoice.partnerName,
                    `شيك وارد - إيصال ${id}`, formatDateTime(date), bank.id]);
                chequeCount++;
            }
            paymentCount++;
            if (paymentCount % 500 === 0) {
                console.log(`  Generated ${paymentCount} payment receipts...`);
            }
        }
        console.log(`✓ Created ${paymentCount} payment receipts with ${chequeCount} cheques`);
    });
}
function generatePaymentVouchers(partners, banks) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating payment vouchers with cheques...');
        const [invoices] = yield db_1.pool.query("SELECT * FROM invoices WHERE type = 'INVOICE_PURCHASE' LIMIT 2000");
        let paymentCount = 0;
        let chequeCount = 0;
        for (let i = 0; i < Math.min(CONFIG.transactions.paymentVouchers, invoices.length); i++) {
            const invoice = invoices[i];
            const id = (0, crypto_1.randomUUID)();
            const date = randomDate(CONFIG.year);
            const bank = randomElement(banks);
            const paymentMethod = randomElement(['CASH', 'BANK', 'CHEQUE']);
            const amount = invoice.total * randomFloat(0.3, 1.0);
            yield db_1.pool.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status, paymentMethod, posted, bankAccountId, bankName) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, formatDateTime(date), 'PAYMENT_MADE', invoice.partnerId, invoice.partnerName, amount,
                'POSTED', paymentMethod, true, bank.id, bank.name]);
            yield db_1.pool.query(`INSERT INTO payment_allocations (id, paymentId, invoiceId, amount) VALUES (?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), id, invoice.id, amount]);
            yield db_1.pool.query(`UPDATE invoices SET paidAmount = paidAmount + ?, status = CASE WHEN total <= paidAmount + ? THEN 'PAID' ELSE 'PARTIAL' END WHERE id = ?`, [amount, amount, invoice.id]);
            if (paymentMethod === 'CHEQUE') {
                const dueDate = new Date(date);
                dueDate.setDate(dueDate.getDate() + randomInt(7, 90));
                yield db_1.pool.query(`INSERT INTO cheques (id, number, bankName, amount, dueDate, status, type, partnerId, partnerName, description, createdDate, bankAccountId) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), `CHQ-${randomInt(100000, 999999)}`, bank.name, amount, formatDateTime(dueDate),
                    randomElement(['PENDING', 'COLLECTED']), 'OUTGOING', invoice.partnerId, invoice.partnerName,
                    `شيك صادر - سند ${id}`, formatDateTime(date), bank.id]);
                chequeCount++;
            }
            paymentCount++;
        }
        console.log(`✓ Created ${paymentCount} payment vouchers with ${chequeCount} cheques`);
    });
}
function generateCashTransactions(costCenters, users) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating cash transactions...');
        // Create cash categories first
        const categories = [];
        const categoryNames = [
            { name: 'مصروفات إدارية', type: 'EXPENSE' },
            { name: 'مصروفات تشغيلية', type: 'EXPENSE' },
            { name: 'إيرادات أخرى', type: 'INCOME' },
            { name: 'عهد موظفين', type: 'EXPENSE' }
        ];
        for (const cat of categoryNames) {
            const id = (0, crypto_1.randomUUID)();
            yield db_1.pool.query('INSERT INTO cash_categories (id, name, type) VALUES (?, ?, ?)', [id, cat.name, cat.type]);
            categories.push(Object.assign({ id }, cat));
        }
        // Generate cash transactions
        for (let i = 0; i < CONFIG.transactions.cashTransactions; i++) {
            const id = (0, crypto_1.randomUUID)();
            const date = randomDate(CONFIG.year);
            const category = randomElement(categories);
            const amount = randomFloat(100, 5000);
            const type = category.type === 'EXPENSE' ? 'CASH_OUT' : 'CASH_IN';
            yield db_1.pool.query(`INSERT INTO invoices (id, date, type, total, status, paymentMethod, posted, notes, costCenterId) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, formatDateTime(date), type, amount, 'POSTED', 'CASH', true,
                `حركة نقدية - ${category.name}`, randomElement(costCenters).id]);
        }
        console.log(`✓ Created ${CONFIG.transactions.cashTransactions} cash transactions`);
    });
}
// Main execution
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('='.repeat(70));
        console.log('COMPREHENSIVE MOCK DATA GENERATION - STRESS TEST');
        console.log('='.repeat(70));
        console.log(`Year: ${CONFIG.year}`);
        console.log('='.repeat(70));
        try {
            console.log('\nPHASE 1: MASTER DATA');
            console.log('-'.repeat(70));
            const users = yield generateUsers();
            const branches = yield generateBranches();
            const warehouses = yield generateWarehouses(branches);
            const categories = yield generateCategories();
            const products = yield generateProducts(warehouses, categories);
            const partners = yield generatePartners();
            const banks = yield generateBanks();
            const costCenters = yield generateCostCenters();
            console.log('\nPHASE 2: TRANSACTIONAL DATA');
            console.log('-'.repeat(70));
            yield generateSalesInvoices(partners, products, warehouses, costCenters);
            yield generatePurchaseInvoices(partners, products, warehouses, costCenters);
            yield generatePaymentReceipts(partners, banks);
            yield generatePaymentVouchers(partners, banks);
            yield generateCashTransactions(costCenters, users);
            console.log('\n' + '='.repeat(70));
            console.log('SUMMARY');
            console.log('='.repeat(70));
            const tables = [
                'users', 'branches', 'warehouses', 'categories', 'products', 'partners',
                'cost_centers', 'banks', 'invoices', 'invoice_lines', 'payment_allocations',
                'cheques', 'cash_categories'
            ];
            let totalRecords = 0;
            for (const table of tables) {
                const [rows] = yield db_1.pool.query(`SELECT COUNT(*) as count FROM ${table}`);
                const count = rows[0].count;
                totalRecords += count;
                console.log(`${table.padEnd(30)}: ${count.toString().padStart(6)} records`);
            }
            console.log('='.repeat(70));
            console.log(`TOTAL RECORDS: ${totalRecords}`);
            console.log('='.repeat(70));
            console.log('\n✓ Mock data generation completed successfully!');
            console.log('\nTest credentials:');
            console.log('  Email: user1@company.com');
            console.log('  Password: password123');
            process.exit(0);
        }
        catch (error) {
            console.error('Error generating mock data:', error);
            process.exit(1);
        }
    });
}
main();
