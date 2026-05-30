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
const db_1 = require("./db");
const crypto_1 = require("crypto");
// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    year: 2024,
    products: {
        rawMaterials: 200,
        finishedGoods: 300,
        total: 500
    },
    partners: {
        customers: 200,
        suppliers: 100,
        total: 300
    },
    transactions: {
        salesInvoices: 10000,
        purchaseInvoices: 5000,
        salesReturns: 500,
        purchaseReturns: 300,
        productionOrders: 2000,
        paymentReceipts: 5000,
        paymentVouchers: 2000,
        bankTransactions: 2000,
        stockMovements: 5000,
        journalEntries: 3000
    },
    warehouses: 20,
    branches: 10,
    categories: 20,
    salesmen: 50,
    costCenters: 20,
    priceLists: 10,
    banks: 10
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
    // Skip weekends
    while (date.getDay() === 0 || date.getDay() === 6) {
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
        'السبيعي', 'المطيري', 'العمري', 'الأحمدي', 'الخالدي', 'السعيد', 'الب لوي', 'الرشيدي'
    ],
    companyTypes: [
        'مؤسسة', 'شركة', 'متجر', 'معرض', 'مصنع', 'ورشة', 'مكتب'
    ],
    companyNames: [
        'النجاح', 'الأمل', 'التميز', 'الإبداع', 'الرائد', 'المستقبل', 'الصفوة', 'الريادة',
        'الابتكار', 'التطوير', 'الجودة', 'الإتقان', 'الازدهار', 'النماء', 'الرفيع', 'الفخامة'
    ],
    productCategories: [
        'الأقمشة والخامات', 'المنسوجات المنزلية', 'الألبسة الجاهزة', 'مواد التعبئة', 'الخيوط والصوف'
    ],
    rawMaterials: [
        'قماش قطن', 'قماش بوليستر', 'قماش حرير', 'خيط قطني', 'خيط نايلون', 'أزرار بلاستيك',
        'سحاب معدني', 'دانتيل', 'شريط مطاط', 'حشو قطني', 'صبغة نسيج', 'لاصق قماش'
    ],
    finishedGoods: [
        'ملاءة سرير', 'مخدة', ' بطانية', 'ستارة', 'مفرش طاولة', 'منشفة', 'فوطة يد',
        'طقم سفرة', 'غطاء كنب', 'مخدة زينة', 'سجادة صغيرة', 'كوشن'
    ],
    cities: [
        'الرياض', 'جدة', 'مكة', 'المدينة', 'الدمام', 'الخبر', 'الطائف', 'أبها', 'تبوك', 'بريدة'
    ],
    districts: [
        'العليا', 'الملز', 'النخيل', 'الروضة', 'الربوة', 'الشفا', 'الصحافة', 'المروج'
    ]
};
// ============================================
// MASTER DATA GENERATORS
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
                name: `فرع ${city}`,
                location: `${city} - ${randomElement(ARABIC_NAMES.districts)}`,
                manager: `${randomElement(ARABIC_NAMES.firstNames)} ${randomElement(ARABIC_NAMES.lastNames)}`,
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
                keeper: `${randomElement(ARABIC_NAMES.firstNames)} ${randomElement(ARABIC_NAMES.lastNames)}`,
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
        for (let i = 0; i < CONFIG.categories; i++) {
            const id = (0, crypto_1.randomUUID)();
            const category = {
                id,
                name: ARABIC_NAMES.productCategories[i % ARABIC_NAMES.productCategories.length],
                description: `فئة ${ARABIC_NAMES.productCategories[i % ARABIC_NAMES.productCategories.length]}`
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
        // Raw materials
        for (let i = 0; i < CONFIG.products.rawMaterials; i++) {
            const id = (0, crypto_1.randomUUID)();
            const name = randomElement(ARABIC_NAMES.rawMaterials);
            const product = {
                id,
                name: `${name} - نوع ${i + 1}`,
                sku: `RAW-${String(i + 1).padStart(4, '0')}`,
                barcode: `${randomInt(1000000000000, 9999999999999)}`,
                description: `مادة خام - ${name}`,
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
            yield db_1.pool.query(`INSERT INTO products (id, name, sku, barcode, description, price, cost, stock, minStock, maxStock, warehouseId, categoryId) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [product.id, product.name, product.sku, product.barcode, product.description,
                product.price, product.cost, product.stock, product.minStock, product.maxStock,
                product.warehouseId, product.categoryId]);
        }
        // Finished goods
        for (let i = 0; i < CONFIG.products.finishedGoods; i++) {
            const id = (0, crypto_1.randomUUID)();
            const name = randomElement(ARABIC_NAMES.finishedGoods);
            const product = {
                id,
                name: `${name} - موديل ${i + 1}`,
                sku: `FIN-${String(i + 1).padStart(4, '0')}`,
                barcode: `${randomInt(1000000000000, 9999999999999)}`,
                description: `منتج نهائي - ${name}`,
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
            yield db_1.pool.query(`INSERT INTO products (id, name, sku, barcode, description, price, cost, stock, minStock, maxStock, warehouseId, categoryId) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [product.id, product.name, product.sku, product.barcode, product.description,
                product.price, product.cost, product.stock, product.minStock, product.maxStock,
                product.warehouseId, product.categoryId]);
        }
        console.log(`✓ Created ${products.length} products (${CONFIG.products.rawMaterials} raw, ${CONFIG.products.finishedGoods} finished)`);
        return products;
    });
}
function generatePartners() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating partners...');
        const partners = [];
        // Customers
        for (let i = 0; i < CONFIG.partners.customers; i++) {
            const id = (0, crypto_1.randomUUID)();
            const isCompany = Math.random() > 0.3;
            let name;
            if (isCompany) {
                name = `${randomElement(ARABIC_NAMES.companyTypes)} ${randomElement(ARABIC_NAMES.companyNames)} ${randomElement(ARABIC_NAMES.lastNames)}`;
            }
            else {
                name = `${randomElement(ARABIC_NAMES.firstNames)} ${randomElement(ARABIC_NAMES.lastNames)}`;
            }
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
                address: `${randomElement(ARABIC_NAMES.cities)} - ${randomElement(ARABIC_NAMES.districts)} - شارع ${randomInt(1, 50)}`,
                contactPerson: `${randomElement(ARABIC_NAMES.firstNames)} ${randomElement(ARABIC_NAMES.lastNames)}`,
                openingBalance: randomFloat(-50000, 50000),
                paymentTerms: randomElement([0, 7, 14, 30, 60])
            };
            partners.push(partner);
            yield db_1.pool.query(`INSERT INTO partners (id, name, type, isCustomer, isSupplier, balance, phone, email, taxId, address, contactPerson, openingBalance, paymentTerms) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [partner.id, partner.name, partner.type, partner.isCustomer, partner.isSupplier,
                partner.balance, partner.phone, partner.email, partner.taxId, partner.address,
                partner.contactPerson, partner.openingBalance, partner.paymentTerms]);
        }
        // Suppliers
        for (let i = 0; i < CONFIG.partners.suppliers; i++) {
            const id = (0, crypto_1.randomUUID)();
            const name = `${randomElement(ARABIC_NAMES.companyTypes)} ${randomElement(ARABIC_NAMES.companyNames)} للتجارة`;
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
                address: `${randomElement(ARABIC_NAMES.cities)} - ${randomElement(ARABIC_NAMES.districts)} - مجمع ${randomInt(1, 20)}`,
                contactPerson: `${randomElement(ARABIC_NAMES.firstNames)} ${randomElement(ARABIC_NAMES.lastNames)}`,
                openingBalance: randomFloat(-100000, 100000),
                paymentTerms: randomElement([0, 7, 30, 60, 90])
            };
            partners.push(partner);
            yield db_1.pool.query(`INSERT INTO partners (id, name, type, isCustomer, isSupplier, balance, phone, email, taxId, address, contactPerson, openingBalance, paymentTerms) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [partner.id, partner.name, partner.type, partner.isCustomer, partner.isSupplier,
                partner.balance, partner.phone, partner.email, partner.taxId, partner.address,
                partner.contactPerson, partner.openingBalance, partner.paymentTerms]);
        }
        console.log(`✓ Created ${partners.length} partners (${CONFIG.partners.customers} customers, ${CONFIG.partners.suppliers} suppliers)`);
        return partners;
    });
}
function generateSalesmen() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating salesmen...');
        const salesmen = [];
        for (let i = 0; i < CONFIG.salesmen; i++) {
            const id = (0, crypto_1.randomUUID)();
            const salesman = {
                id,
                name: `${randomElement(ARABIC_NAMES.firstNames)} ${randomElement(ARABIC_NAMES.lastNames)}`,
                phone: `05${randomInt(10000000, 99999999)}`,
                target: randomFloat(50000, 200000),
                achieved: randomFloat(20000, 150000),
                commissionRate: randomFloat(1, 5),
                region: randomElement(ARABIC_NAMES.cities)
            };
            salesmen.push(salesman);
            yield db_1.pool.query('INSERT INTO salesmen (id, name, phone, target, achieved, commissionRate, region) VALUES (?, ?, ?, ?, ?, ?, ?)', [salesman.id, salesman.name, salesman.phone, salesman.target, salesman.achieved, salesman.commissionRate, salesman.region]);
        }
        console.log(`✓ Created ${salesmen.length} salesmen`);
        return salesmen;
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
function generatePriceLists() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating price lists...');
        const priceLists = [];
        const names = ['قطاعي', 'جملة', 'VIP'];
        for (let i = 0; i < CONFIG.priceLists; i++) {
            const id = (0, crypto_1.randomUUID)();
            const priceList = {
                id,
                name: `${names[i % names.length]} ${Math.floor(i / names.length) + 1}`,
                description: `قائمة أسعار ${names[i % names.length]}`,
                isActive: true
            };
            priceLists.push(priceList);
            yield db_1.pool.query('INSERT INTO price_lists (id, name, description, isActive) VALUES (?, ?, ?, ?)', [priceList.id, priceList.name, priceList.description, priceList.isActive]);
        }
        console.log(`✓ Created ${priceLists.length} price lists`);
        return priceLists;
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
                type: 'CURRENT',
                accountId: '10201' // Link to main bank account
            };
            banks.push(bank);
            yield db_1.pool.query('INSERT INTO banks (id, name, accountNumber, currency, balance, type, accountId) VALUES (?, ?, ?, ?, ?, ?, ?)', [bank.id, bank.name, bank.accountNumber, bank.currency, bank.balance, bank.type, bank.accountId]);
        }
        console.log(`✓ Created ${banks.length} banks`);
        return banks;
    });
}
function generateBOMs(products) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating BOMs...');
        const boms = [];
        const rawMaterials = products.filter(p => p.type === 'RAW');
        const finishedGoods = products.filter(p => p.type === 'FINISHED');
        // Create BOMs for first 15 finished products
        for (const finished of finishedGoods.slice(0, 15)) {
            const id = (0, crypto_1.randomUUID)();
            const bom = {
                id,
                finished_product_id: finished.id,
                name: `تركيبة ${finished.name}`,
                version: 1,
                is_active: true,
                labor_cost: randomFloat(10, 50),
                overhead_cost: randomFloat(5, 20)
            };
            boms.push(bom);
            yield db_1.pool.query('INSERT INTO bom (id, finished_product_id, name, version, is_active, labor_cost, overhead_cost) VALUES (?, ?, ?, ?, ?, ?, ?)', [bom.id, bom.finished_product_id, bom.name, bom.version, bom.is_active, bom.labor_cost, bom.overhead_cost]);
            // Add 3-6 unique raw materials per BOM
            const numItems = randomInt(3, 6);
            const usedMaterials = new Set();
            for (let i = 0; i < numItems; i++) {
                let rawMaterial;
                let attempts = 0;
                // Find a unique raw material for this BOM
                do {
                    rawMaterial = randomElement(rawMaterials);
                    attempts++;
                } while (usedMaterials.has(rawMaterial.id) && attempts < 20);
                if (!usedMaterials.has(rawMaterial.id)) {
                    usedMaterials.add(rawMaterial.id);
                    yield db_1.pool.query('INSERT INTO bom_items (bom_id, raw_product_id, quantity_per_unit, waste_percent) VALUES (?, ?, ?, ?)', [bom.id, rawMaterial.id, randomFloat(0.5, 5, 3), randomFloat(0, 10)]);
                }
            }
        }
        console.log(`✓ Created ${boms.length} BOMs`);
        return boms;
    });
}
// ============================================
// TRANSACTIONAL DATA GENERATORS
// ============================================
function generateSalesInvoices(partners, products, warehouses, costCenters) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating sales invoices...');
        const customers = partners.filter(p => p.isCustomer);
        const finishedGoods = products.filter(p => p.type === 'FINISHED');
        let count = 0;
        for (let i = 0; i < CONFIG.transactions.salesInvoices; i++) {
            const id = (0, crypto_1.randomUUID)();
            const customer = randomElement(customers);
            const date = randomDate(CONFIG.year);
            const numLines = randomInt(1, 5);
            const lines = [];
            let subtotal = 0;
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
            const invoice = {
                id,
                date: formatDateTime(date),
                type: 'INVOICE_SALE',
                partnerId: customer.id,
                partnerName: customer.name,
                total,
                status: 'POSTED',
                paymentMethod: randomElement(['CASH', 'BANK', 'CREDIT']),
                posted: true,
                taxAmount,
                warehouseId: randomElement(warehouses).id,
                costCenterId: randomElement(costCenters).id
            };
            yield db_1.pool.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status, paymentMethod, posted, taxAmount, warehouseId, costCenterId) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [invoice.id, invoice.date, invoice.type, invoice.partnerId, invoice.partnerName, invoice.total,
                invoice.status, invoice.paymentMethod, invoice.posted, invoice.taxAmount, invoice.warehouseId, invoice.costCenterId]);
            for (const line of lines) {
                yield db_1.pool.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [invoice.id, line.productId, line.productName, line.quantity, line.price, line.cost, line.discount, line.total]);
            }
            count++;
            if (count % 100 === 0) {
                console.log(`  Generated ${count} sales invoices...`);
            }
        }
        console.log(`✓ Created ${count} sales invoices`);
    });
}
function generatePurchaseInvoices(partners, products, warehouses, costCenters) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating purchase invoices...');
        const suppliers = partners.filter(p => p.isSupplier);
        const rawMaterials = products.filter(p => p.type === 'RAW');
        let count = 0;
        for (let i = 0; i < CONFIG.transactions.purchaseInvoices; i++) {
            const id = (0, crypto_1.randomUUID)();
            const supplier = randomElement(suppliers);
            const date = randomDate(CONFIG.year);
            const numLines = randomInt(1, 8);
            const lines = [];
            let subtotal = 0;
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
                    discount: 0,
                    total
                });
                subtotal += total;
            }
            const taxAmount = subtotal * 0.15;
            const total = subtotal + taxAmount;
            const invoice = {
                id,
                date: formatDateTime(date),
                type: 'INVOICE_PURCHASE',
                partnerId: supplier.id,
                partnerName: supplier.name,
                total,
                status: 'POSTED',
                paymentMethod: randomElement(['CASH', 'BANK', 'CREDIT']),
                posted: true,
                taxAmount,
                warehouseId: randomElement(warehouses).id,
                costCenterId: randomElement(costCenters).id
            };
            yield db_1.pool.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status, paymentMethod, posted, taxAmount, warehouseId, costCenterId) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [invoice.id, invoice.date, invoice.type, invoice.partnerId, invoice.partnerName, invoice.total,
                invoice.status, invoice.paymentMethod, invoice.posted, invoice.taxAmount, invoice.warehouseId, invoice.costCenterId]);
            for (const line of lines) {
                yield db_1.pool.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [invoice.id, line.productId, line.productName, line.quantity, line.price, line.cost, line.discount, line.total]);
            }
            count++;
            if (count % 100 === 0) {
                console.log(`  Generated ${count} purchase invoices...`);
            }
        }
        console.log(`✓ Created ${count} purchase invoices`);
    });
}
function generateProductionOrders(boms, warehouses) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating production orders...');
        let count = 0;
        for (let i = 0; i < CONFIG.transactions.productionOrders; i++) {
            const bom = randomElement(boms);
            const id = (0, crypto_1.randomUUID)();
            const date = randomDate(CONFIG.year);
            const qtyPlanned = randomInt(10, 100);
            const status = randomElement(['PLANNED', 'IN_PROGRESS', 'COMPLETED']);
            const order = {
                id,
                order_number: `PO-${CONFIG.year}-${String(i + 1).padStart(5, '0')}`,
                bom_id: bom.id,
                finished_product_id: bom.finished_product_id,
                qty_planned: qtyPlanned,
                qty_finished: status === 'COMPLETED' ? qtyPlanned : (status === 'IN_PROGRESS' ? randomInt(0, qtyPlanned) : 0),
                qty_scrapped: status === 'COMPLETED' ? randomInt(0, qtyPlanned * 0.05) : 0,
                status,
                start_date: date.toISOString().slice(0, 10),
                warehouse_id: randomElement(warehouses).id,
                created_at: formatDateTime(date)
            };
            yield db_1.pool.query(`INSERT INTO production_orders (id, order_number, bom_id, finished_product_id, qty_planned, qty_finished, qty_scrapped, status, start_date, warehouse_id, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [order.id, order.order_number, order.bom_id, order.finished_product_id, order.qty_planned,
                order.qty_finished, order.qty_scrapped, order.status, order.start_date, order.warehouse_id, order.created_at]);
            count++;
        }
        console.log(`✓ Created ${count} production orders`);
    });
}
function generateJournalEntries(costCenters) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating journal entries...');
        let count = 0;
        const accountIds = ['101', '103', '104', '201', '301', '401', '501', '503', '504', '505'];
        for (let i = 0; i < CONFIG.transactions.journalEntries; i++) {
            const id = (0, crypto_1.randomUUID)();
            const date = randomDate(CONFIG.year);
            const numLines = randomInt(2, 4);
            const amount = randomFloat(1000, 50000);
            yield db_1.pool.query('INSERT INTO journal_entries (id, date, description, referenceId) VALUES (?, ?, ?, ?)', [id, formatDateTime(date), `قيد يومية رقم ${i + 1}`, `JE-${i + 1}`]);
            let totalDebit = 0;
            let totalCredit = 0;
            // Debit lines
            for (let j = 0; j < Math.floor(numLines / 2); j++) {
                const debitAmount = amount / Math.floor(numLines / 2);
                totalDebit += debitAmount;
                yield db_1.pool.query('INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, costCenterId) VALUES (?, ?, ?, ?, ?, ?)', [id, randomElement(accountIds), 'حساب', debitAmount, 0, randomElement(costCenters).id]);
            }
            // Credit lines (match debit)
            for (let j = 0; j < Math.ceil(numLines / 2); j++) {
                const creditAmount = totalDebit / Math.ceil(numLines / 2);
                totalCredit += creditAmount;
                yield db_1.pool.query('INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit, costCenterId) VALUES (?, ?, ?, ?, ?, ?)', [id, randomElement(accountIds), 'حساب', 0, creditAmount, randomElement(costCenters).id]);
            }
            count++;
        }
        console.log(`✓ Created ${count} journal entries`);
    });
}
function generatePaymentReceipts(partners, banks) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating payment receipts...');
        const customers = partners.filter(p => p.isCustomer);
        let count = 0;
        // Get all unpaid sales invoices
        const [invoices] = yield db_1.pool.query("SELECT * FROM invoices WHERE type = 'INVOICE_SALE' AND status != 'PAID'");
        // Group invoices by customer
        const customerInvoices = {};
        for (const inv of invoices) {
            if (!customerInvoices[inv.partnerId]) {
                customerInvoices[inv.partnerId] = [];
            }
            customerInvoices[inv.partnerId].push(inv);
        }
        for (let i = 0; i < CONFIG.transactions.paymentReceipts; i++) {
            const customer = randomElement(customers);
            const pendingInvoices = customerInvoices[customer.id] || [];
            if (pendingInvoices.length === 0)
                continue;
            const id = (0, crypto_1.randomUUID)();
            const date = randomDate(CONFIG.year);
            const bank = randomElement(banks);
            // Pay 1-3 invoices
            const numToPay = randomInt(1, Math.min(3, pendingInvoices.length));
            const invoicesToPay = [];
            let totalAmount = 0;
            for (let j = 0; j < numToPay; j++) {
                const inv = pendingInvoices[j]; // Simple strategy: pay oldest/first available
                const remaining = inv.total - (inv.paidAmount || 0);
                if (remaining <= 0)
                    continue;
                const payAmount = Math.random() > 0.2 ? remaining : randomFloat(10, remaining); // 80% chance to pay full remaining
                totalAmount += payAmount;
                invoicesToPay.push({
                    id: inv.id,
                    amount: payAmount
                });
            }
            if (totalAmount === 0)
                continue;
            const payment = {
                id,
                date: formatDateTime(date),
                type: 'PAYMENT_RECEIVED',
                partnerId: customer.id,
                partnerName: customer.name,
                total: totalAmount,
                status: 'POSTED',
                paymentMethod: randomElement(['CASH', 'BANK', 'CHEQUE']),
                posted: true,
                bankAccountId: bank.id,
                bankName: bank.name
            };
            // Create Payment Record (in invoices table as per schema implication)
            yield db_1.pool.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status, paymentMethod, posted, bankAccountId, bankName) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [payment.id, payment.date, payment.type, payment.partnerId, payment.partnerName, payment.total,
                payment.status, payment.paymentMethod, payment.posted, payment.bankAccountId, payment.bankName]);
            // Create Allocations and Update Invoices
            for (const item of invoicesToPay) {
                const allocationId = (0, crypto_1.randomUUID)();
                yield db_1.pool.query(`INSERT INTO payment_allocations (id, paymentId, invoiceId, amount) VALUES (?, ?, ?, ?)`, [allocationId, payment.id, item.id, item.amount]);
                yield db_1.pool.query(`UPDATE invoices SET paidAmount = paidAmount + ?, status = CASE WHEN total <= paidAmount + ? THEN 'PAID' ELSE 'PARTIAL' END WHERE id = ?`, [item.amount, item.amount, item.id]);
            }
            // Update Partner Balance (Customer balance decreases when they pay)
            yield db_1.pool.query(`UPDATE partners SET balance = balance - ? WHERE id = ?`, [totalAmount, customer.id]);
            // Update Bank Balance
            if (payment.paymentMethod === 'BANK') {
                yield db_1.pool.query(`UPDATE banks SET balance = balance + ? WHERE id = ?`, [totalAmount, bank.id]);
            }
            count++;
            if (count % 100 === 0) {
                console.log(`  Generated ${count} payment receipts...`);
            }
        }
        console.log(`✓ Created ${count} payment receipts`);
    });
}
function generatePaymentVouchers(partners, banks) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Generating payment vouchers...');
        const suppliers = partners.filter(p => p.isSupplier);
        let count = 0;
        // Get all unpaid purchase invoices
        const [invoices] = yield db_1.pool.query("SELECT * FROM invoices WHERE type = 'INVOICE_PURCHASE' AND status != 'PAID'");
        // Group invoices by supplier
        const supplierInvoices = {};
        for (const inv of invoices) {
            if (!supplierInvoices[inv.partnerId]) {
                supplierInvoices[inv.partnerId] = [];
            }
            supplierInvoices[inv.partnerId].push(inv);
        }
        for (let i = 0; i < CONFIG.transactions.paymentVouchers; i++) {
            const supplier = randomElement(suppliers);
            const pendingInvoices = supplierInvoices[supplier.id] || [];
            if (pendingInvoices.length === 0)
                continue;
            const id = (0, crypto_1.randomUUID)();
            const date = randomDate(CONFIG.year);
            const bank = randomElement(banks);
            // Pay 1-3 invoices
            const numToPay = randomInt(1, Math.min(3, pendingInvoices.length));
            const invoicesToPay = [];
            let totalAmount = 0;
            for (let j = 0; j < numToPay; j++) {
                const inv = pendingInvoices[j];
                const remaining = inv.total - (inv.paidAmount || 0);
                if (remaining <= 0)
                    continue;
                const payAmount = Math.random() > 0.2 ? remaining : randomFloat(10, remaining);
                totalAmount += payAmount;
                invoicesToPay.push({
                    id: inv.id,
                    amount: payAmount
                });
            }
            if (totalAmount === 0)
                continue;
            const payment = {
                id,
                date: formatDateTime(date),
                type: 'PAYMENT_MADE',
                partnerId: supplier.id,
                partnerName: supplier.name,
                total: totalAmount,
                status: 'POSTED',
                paymentMethod: randomElement(['CASH', 'BANK', 'CHEQUE']),
                posted: true,
                bankAccountId: bank.id,
                bankName: bank.name
            };
            // Create Payment Record
            yield db_1.pool.query(`INSERT INTO invoices (id, date, type, partnerId, partnerName, total, status, paymentMethod, posted, bankAccountId, bankName) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [payment.id, payment.date, payment.type, payment.partnerId, payment.partnerName, payment.total,
                payment.status, payment.paymentMethod, payment.posted, payment.bankAccountId, payment.bankName]);
            // Create Allocations and Update Invoices
            for (const item of invoicesToPay) {
                const allocationId = (0, crypto_1.randomUUID)();
                yield db_1.pool.query(`INSERT INTO payment_allocations (id, paymentId, invoiceId, amount) VALUES (?, ?, ?, ?)`, [allocationId, payment.id, item.id, item.amount]);
                yield db_1.pool.query(`UPDATE invoices SET paidAmount = paidAmount + ?, status = CASE WHEN total <= paidAmount + ? THEN 'PAID' ELSE 'PARTIAL' END WHERE id = ?`, [item.amount, item.amount, item.id]);
            }
            // Update Partner Balance (Supplier balance decreases (closer to 0 or negative) when we pay them? 
            // Usually Supplier Balance is Credit (+). When we pay, we Debit (-). So balance decreases.)
            yield db_1.pool.query(`UPDATE partners SET balance = balance - ? WHERE id = ?`, [totalAmount, supplier.id]);
            // Update Bank Balance (Money leaves bank)
            if (payment.paymentMethod === 'BANK') {
                yield db_1.pool.query(`UPDATE banks SET balance = balance - ? WHERE id = ?`, [totalAmount, bank.id]);
            }
            count++;
            if (count % 100 === 0) {
                console.log(`  Generated ${count} payment vouchers...`);
            }
        }
        console.log(`✓ Created ${count} payment vouchers`);
    });
}
// ============================================
// MAIN EXECUTION
// ============================================
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('='.repeat(60));
        console.log('MOCK DATA GENERATION - STRESS TEST');
        console.log('='.repeat(60));
        console.log(`Year: ${CONFIG.year}`);
        console.log(`Target: 10,000+ records`);
        console.log('='.repeat(60));
        console.log('');
        try {
            // Master Data
            console.log('PHASE 1: MASTER DATA');
            console.log('-'.repeat(60));
            const branches = yield generateBranches();
            const warehouses = yield generateWarehouses(branches);
            const categories = yield generateCategories();
            const products = yield generateProducts(warehouses, categories);
            const partners = yield generatePartners();
            const salesmen = yield generateSalesmen();
            const costCenters = yield generateCostCenters();
            const priceLists = yield generatePriceLists();
            const banks = yield generateBanks();
            const boms = yield generateBOMs(products);
            console.log('');
            // Transactional Data
            console.log('PHASE 2: TRANSACTIONAL DATA');
            console.log('-'.repeat(60));
            yield generateSalesInvoices(partners, products, warehouses, costCenters);
            yield generatePurchaseInvoices(partners, products, warehouses, costCenters);
            yield generateProductionOrders(boms, warehouses);
            yield generatePaymentReceipts(partners, banks);
            yield generatePaymentVouchers(partners, banks);
            yield generateJournalEntries(costCenters);
            console.log('');
            // Summary
            console.log('='.repeat(60));
            console.log('SUMMARY');
            console.log('='.repeat(60));
            const tables = [
                'branches', 'warehouses', 'categories', 'products', 'partners',
                'salesmen', 'cost_centers', 'price_lists', 'banks', 'bom', 'bom_items',
                'invoices', 'invoice_lines', 'production_orders', 'journal_entries', 'journal_lines',
                'payment_allocations'
            ];
            let totalRecords = 0;
            for (const table of tables) {
                const [rows] = yield db_1.pool.query(`SELECT COUNT(*) as count FROM ${table}`);
                const count = rows[0].count;
                totalRecords += count;
                console.log(`${table.padEnd(25)}: ${count.toString().padStart(6)} records`);
            }
            console.log('='.repeat(60));
            console.log(`TOTAL RECORDS: ${totalRecords}`);
            console.log('='.repeat(60));
            console.log('');
            console.log('✓ Mock data generation completed successfully!');
            process.exit(0);
        }
        catch (error) {
            console.error('Error generating mock data:', error);
            process.exit(1);
        }
    });
}
main();
