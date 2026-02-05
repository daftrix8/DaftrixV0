-- ============================================================
-- DAFTRIX ERP - DATABASE DIAGNOSTIC & FIX SCRIPT
-- Version: 2.0.0
-- Date: 2026-02-05
-- Description: Run this on an EXISTING database to add missing
--              columns and tables for newer features.
--              Safe to run multiple times - uses IF NOT EXISTS.
-- ============================================================

-- ============================================================
-- 0. CORE TABLES (Create if missing from very old databases)
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    barcode VARCHAR(100),
    description TEXT,
    price DECIMAL(10, 2) DEFAULT 0,
    cost DECIMAL(10, 2) DEFAULT 0,
    stock INT DEFAULT 0,
    minStock INT DEFAULT 0,
    maxStock INT DEFAULT 0,
    warehouseId VARCHAR(36),
    categoryId VARCHAR(36),
    image TEXT,
    bomId VARCHAR(36),
    type VARCHAR(50),
    unit VARCHAR(50),
    isManufactured BOOLEAN DEFAULT FALSE,
    leadTimeDays INT DEFAULT 0,
    baseUnit VARCHAR(50) DEFAULT 'piece',
    hasMultipleUnits BOOLEAN DEFAULT FALSE,
    trackSerials BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS partners (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type ENUM('CUSTOMER', 'SUPPLIER', 'BOTH') NOT NULL,
    isCustomer BOOLEAN DEFAULT FALSE,
    isSupplier BOOLEAN DEFAULT FALSE,
    balance DECIMAL(15, 2) DEFAULT 0,
    phone VARCHAR(50),
    email VARCHAR(100),
    taxId VARCHAR(50),
    address TEXT,
    contactPerson VARCHAR(100),
    openingBalance DECIMAL(15, 2) DEFAULT 0,
    paymentTerms INT DEFAULT 0,
    creditLimit DECIMAL(15, 2) DEFAULT 0,
    classification VARCHAR(50),
    status VARCHAR(50) DEFAULT 'ACTIVE',
    groupId VARCHAR(36),
    commercialRegister VARCHAR(50),
    salesmanId VARCHAR(36)
);

CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE') NOT NULL,
    balance DECIMAL(15, 2) DEFAULT 0,
    openingBalance DECIMAL(15, 2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(36) PRIMARY KEY,
    date DATETIME NOT NULL,
    type VARCHAR(50) NOT NULL,
    partnerId VARCHAR(36),
    partnerName VARCHAR(255),
    total DECIMAL(15, 2) DEFAULT 0,
    status VARCHAR(50) NOT NULL,
    paymentMethod VARCHAR(50),
    posted BOOLEAN DEFAULT FALSE,
    notes TEXT,
    dueDate DATETIME,
    taxAmount DECIMAL(15, 2) DEFAULT 0,
    whtAmount DECIMAL(15, 2) DEFAULT 0,
    shippingFee DECIMAL(15, 2) DEFAULT 0,
    globalDiscount DECIMAL(15, 2) DEFAULT 0,
    warehouseId VARCHAR(36),
    bankAccountId VARCHAR(36),
    bankName VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS invoice_lines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoiceId VARCHAR(36) NOT NULL,
    productId VARCHAR(36),
    productName VARCHAR(255),
    quantity DECIMAL(15,3) DEFAULT 0,
    price DECIMAL(15, 2) DEFAULT 0,
    cost DECIMAL(15, 2) DEFAULT 0,
    discount DECIMAL(15, 2) DEFAULT 0,
    total DECIMAL(15, 2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS journal_entries (
    id VARCHAR(36) PRIMARY KEY,
    date DATETIME NOT NULL,
    description TEXT,
    referenceId VARCHAR(36)
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    journalId VARCHAR(36) NOT NULL,
    accountId VARCHAR(36) NOT NULL,
    accountName VARCHAR(255),
    debit DECIMAL(15, 2) DEFAULT 0,
    credit DECIMAL(15, 2) DEFAULT 0,
    costCenterId VARCHAR(36)
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE,
    username VARCHAR(100),
    password VARCHAR(255),
    role VARCHAR(50),
    status VARCHAR(50),
    permissions TEXT,
    lastLogin DATETIME,
    avatar TEXT,
    isHidden BOOLEAN DEFAULT FALSE,
    salesmanId VARCHAR(36),
    preferences JSON NULL
);

CREATE TABLE IF NOT EXISTS system_config (
    companyName VARCHAR(255),
    companyAddress TEXT,
    companyPhone VARCHAR(50),
    companyEmail VARCHAR(100),
    taxId VARCHAR(50),
    commercialRegister VARCHAR(50),
    currency VARCHAR(10),
    vatRate DECIMAL(5, 2) DEFAULT 15,
    config JSON,
    enabledModules JSON
);

CREATE TABLE IF NOT EXISTS taxes (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    rate DECIMAL(5, 2) DEFAULT 0,
    type VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS cost_centers (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS stock_taking_sessions (
    id VARCHAR(36) PRIMARY KEY,
    date DATETIME NOT NULL,
    warehouseId VARCHAR(36),
    status VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS stock_taking_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sessionId VARCHAR(36) NOT NULL,
    productId VARCHAR(36),
    systemStock INT DEFAULT 0,
    actualStock INT DEFAULT 0,
    cost DECIMAL(15, 2) DEFAULT 0,
    touched BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS salesmen (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    target DECIMAL(15, 2),
    achieved DECIMAL(15, 2),
    commissionRate DECIMAL(5, 2),
    region VARCHAR(100),
    type VARCHAR(20) DEFAULT 'SALES',
    userId VARCHAR(36),
    targetType VARCHAR(20) DEFAULT 'AMOUNT'
);

-- ============================================================
-- NOTE: Some ALTER TABLE statements may show "duplicate column" 
-- warnings - these are SAFE TO IGNORE.
-- ============================================================

-- ============================================================
-- 1. INVOICES TABLE - Missing Columns
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS costCenterId VARCHAR(36);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS priceListId VARCHAR(36);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paidAmount DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS salesmanId VARCHAR(36);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS number VARCHAR(50);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS createdBy VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS referenceInvoiceId VARCHAR(36);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paymentBreakdown TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS posShiftId VARCHAR(36);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS isPOSSale BOOLEAN DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS balanceSnapshot DECIMAL(15,2) DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bankTransfers TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sourceInvoiceId VARCHAR(36);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS relatedInvoiceIds JSON;

-- ============================================================
-- 2. INVOICE_LINES TABLE - Missing Columns
-- ============================================================

ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS unitId VARCHAR(36);
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS unitName VARCHAR(50);
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS conversionFactor DECIMAL(15,4) DEFAULT 1;
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS baseQuantity DECIMAL(15,3);
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS warehouseId VARCHAR(36);
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS serials JSON;

-- Note: If quantity column needs decimal support, run this manually:
-- ALTER TABLE invoice_lines MODIFY COLUMN quantity DECIMAL(15,3) DEFAULT 0;

-- ============================================================
-- 3. PARTNERS TABLE - Missing Columns
-- ============================================================

ALTER TABLE partners ADD COLUMN IF NOT EXISTS salesmanId VARCHAR(36);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS groupId VARCHAR(36);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS commercialRegister VARCHAR(50);

-- ============================================================
-- 4. PRODUCTS TABLE - Missing Columns
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS baseUnit VARCHAR(50) DEFAULT 'piece';
ALTER TABLE products ADD COLUMN IF NOT EXISTS hasMultipleUnits BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS trackSerials BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS isManufactured BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS leadTimeDays INT DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS bomId VARCHAR(36);

-- ============================================================
-- 5. USERS TABLE - Missing Columns
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS salesmanId VARCHAR(36);
ALTER TABLE users ADD COLUMN IF NOT EXISTS isHidden BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSON NULL;

-- ============================================================
-- 6. JOURNAL_ENTRIES TABLE - Missing Columns
-- ============================================================

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS createdBy VARCHAR(100);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS salesmanId VARCHAR(36);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS sourceInvoiceId VARCHAR(36);

-- ============================================================
-- 7. STOCK_PERMITS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_permits (
    id VARCHAR(36) PRIMARY KEY,
    number INT AUTO_INCREMENT UNIQUE,
    date DATETIME NOT NULL,
    type VARCHAR(50),
    description TEXT,
    sourceWarehouseId VARCHAR(36),
    destWarehouseId VARCHAR(36),
    createdBy VARCHAR(100),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE stock_permits ADD COLUMN IF NOT EXISTS createdBy VARCHAR(100);
ALTER TABLE stock_permits ADD COLUMN IF NOT EXISTS createdAt DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE stock_permits ADD COLUMN IF NOT EXISTS updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ============================================================
-- 8. STOCK_PERMIT_ITEMS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_permit_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    permitId VARCHAR(36) NOT NULL,
    productId VARCHAR(36),
    productName VARCHAR(255),
    quantity DECIMAL(18, 8) DEFAULT 0,
    cost DECIMAL(15, 2) DEFAULT 0,
    driverName VARCHAR(255)
);

ALTER TABLE stock_permit_items ADD COLUMN IF NOT EXISTS productName VARCHAR(255);
ALTER TABLE stock_permit_items ADD COLUMN IF NOT EXISTS driverName VARCHAR(255);

-- ============================================================
-- 9. CASH_CATEGORIES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS cash_categories (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50),
    accountId VARCHAR(36),
    parentId VARCHAR(36)
);

ALTER TABLE cash_categories ADD COLUMN IF NOT EXISTS accountId VARCHAR(36);
ALTER TABLE cash_categories ADD COLUMN IF NOT EXISTS parentId VARCHAR(36);

-- ============================================================
-- 10. SYSTEM_CONFIG TABLE - Missing Columns
-- ============================================================

ALTER TABLE system_config ADD COLUMN IF NOT EXISTS enabledModules JSON;

-- ============================================================
-- 11. SALESMEN TABLE - Missing Columns
-- ============================================================

ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'SALES';
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS userId VARCHAR(36);
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS targetType VARCHAR(20) DEFAULT 'AMOUNT';

-- ============================================================
-- 12. MISSING TABLES - Create if not exist
-- ============================================================

-- Product Stocks Table
CREATE TABLE IF NOT EXISTS product_stocks (
    id VARCHAR(36) PRIMARY KEY,
    productId VARCHAR(36) NOT NULL,
    warehouseId VARCHAR(36) NOT NULL,
    stock DECIMAL(18, 8) DEFAULT 0,
    UNIQUE KEY unique_stock (productId, warehouseId)
);

-- Product Units Table
CREATE TABLE IF NOT EXISTS product_units (
    id VARCHAR(36) PRIMARY KEY,
    productId VARCHAR(36) NOT NULL,
    unitName VARCHAR(50) NOT NULL,
    unitNameEn VARCHAR(50),
    conversionFactor DECIMAL(15,4) NOT NULL DEFAULT 1,
    isBaseUnit BOOLEAN DEFAULT FALSE,
    barcode VARCHAR(50),
    purchasePrice DECIMAL(15,2),
    salePrice DECIMAL(15,2),
    wholesalePrice DECIMAL(15,2),
    minSaleQty DECIMAL(15,3) DEFAULT 1,
    isActive BOOLEAN DEFAULT TRUE,
    sortOrder INT DEFAULT 0,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_product_unit (productId, unitName)
);

-- Deleted Invoices Table
CREATE TABLE IF NOT EXISTS deleted_invoices (
    id VARCHAR(255) PRIMARY KEY,
    original_id VARCHAR(255) NOT NULL,
    date DATETIME,
    type VARCHAR(50),
    partnerId VARCHAR(255),
    partnerName VARCHAR(255),
    total DECIMAL(15, 2) DEFAULT 0,
    status VARCHAR(50),
    paymentMethod VARCHAR(50),
    posted BOOLEAN DEFAULT FALSE,
    notes TEXT,
    dueDate DATETIME,
    taxAmount DECIMAL(15, 2) DEFAULT 0,
    whtAmount DECIMAL(15, 2) DEFAULT 0,
    shippingFee DECIMAL(15, 2) DEFAULT 0,
    globalDiscount DECIMAL(15, 2) DEFAULT 0,
    warehouseId VARCHAR(255),
    costCenterId VARCHAR(255),
    paidAmount DECIMAL(15, 2) DEFAULT 0,
    bankAccountId VARCHAR(255),
    bankName VARCHAR(255),
    paymentBreakdown TEXT,
    salesmanId VARCHAR(255),
    createdBy VARCHAR(255),
    deletedBy VARCHAR(255) NOT NULL,
    deletedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deletionReason TEXT
);

CREATE TABLE IF NOT EXISTS deleted_invoice_lines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    deletedInvoiceId VARCHAR(255) NOT NULL,
    originalInvoiceId VARCHAR(255) NOT NULL,
    productId VARCHAR(255),
    productName VARCHAR(255),
    quantity DECIMAL(15, 3) DEFAULT 0,
    price DECIMAL(15, 2) DEFAULT 0,
    cost DECIMAL(15, 2) DEFAULT 0,
    discount DECIMAL(15, 2) DEFAULT 0,
    total DECIMAL(15, 2) DEFAULT 0
);

-- Stock Movements Table
CREATE TABLE IF NOT EXISTS stock_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    movement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    product_id VARCHAR(36) NOT NULL,
    warehouse_id VARCHAR(36),
    qty_change DECIMAL(15,3) NOT NULL,
    movement_type ENUM(
        'PURCHASE', 'SALE', 'RETURN_IN', 'RETURN_OUT',
        'PRODUCTION_USE', 'PRODUCTION_OUTPUT',
        'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT',
        'OPENING_BALANCE', 'SCRAP'
    ) NOT NULL,
    reference_type VARCHAR(50),
    reference_id VARCHAR(36),
    unit_cost DECIMAL(15,2),
    notes TEXT,
    created_by VARCHAR(50),
    batch_id VARCHAR(50)
);

-- Serial Number Tables
CREATE TABLE IF NOT EXISTS product_serials (
    id VARCHAR(50) PRIMARY KEY,
    productId VARCHAR(50) NOT NULL,
    serialNumber VARCHAR(100) NOT NULL,
    warehouseId VARCHAR(50),
    status ENUM('AVAILABLE', 'SOLD', 'RETURNED', 'RETURNED_TO_VENDOR', 'DAMAGED', 'TRANSIT', 'ADJUSTMENT') DEFAULT 'AVAILABLE',
    purchaseInvoiceId VARCHAR(50),
    salesInvoiceId VARCHAR(50),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_product_serial (productId, serialNumber)
);

CREATE TABLE IF NOT EXISTS serial_transactions (
    id VARCHAR(50) PRIMARY KEY,
    serialId VARCHAR(50) NOT NULL,
    transactionType ENUM('IN', 'OUT', 'TRANSFER', 'RETURN', 'ADJUSTMENT') NOT NULL,
    referenceId VARCHAR(50),
    warehouseId VARCHAR(50),
    notes TEXT,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    userId VARCHAR(50)
);

-- Salesman Targets Table
CREATE TABLE IF NOT EXISTS salesman_targets (
    id VARCHAR(36) PRIMARY KEY,
    salesmanId VARCHAR(36) NOT NULL,
    targetType ENUM('PRODUCT', 'CATEGORY') NOT NULL DEFAULT 'PRODUCT',
    productId VARCHAR(36) NULL,
    categoryId VARCHAR(36) NULL,
    targetQuantity DECIMAL(15,3) NOT NULL DEFAULT 0,
    targetAmount DECIMAL(15,2) NULL,
    achievedQuantity DECIMAL(15,3) DEFAULT 0,
    achievedAmount DECIMAL(15,2) DEFAULT 0,
    periodType ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY') NOT NULL DEFAULT 'MONTHLY',
    periodStart DATE NOT NULL,
    periodEnd DATE NOT NULL,
    isActive BOOLEAN DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Commission Tables
CREATE TABLE IF NOT EXISTS commission_tiers (
    id VARCHAR(36) PRIMARY KEY,
    salesmanId VARCHAR(36) NULL,
    tierName VARCHAR(100) NOT NULL,
    minAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
    maxAmount DECIMAL(15,2) NULL,
    commissionRate DECIMAL(5,2) NOT NULL DEFAULT 0,
    isGlobal BOOLEAN DEFAULT FALSE,
    isActive BOOLEAN DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commission_records (
    id VARCHAR(36) PRIMARY KEY,
    salesmanId VARCHAR(36) NOT NULL,
    periodStart DATE NOT NULL,
    periodEnd DATE NOT NULL,
    totalSales DECIMAL(15,2) NOT NULL DEFAULT 0,
    totalReturns DECIMAL(15,2) NOT NULL DEFAULT 0,
    netSales DECIMAL(15,2) NOT NULL DEFAULT 0,
    commissionRate DECIMAL(5,2) NOT NULL DEFAULT 0,
    commissionAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
    bonusAmount DECIMAL(15,2) DEFAULT 0,
    deductions DECIMAL(15,2) DEFAULT 0,
    finalAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
    status ENUM('PENDING', 'APPROVED', 'PAID', 'REJECTED') DEFAULT 'PENDING',
    approvedBy VARCHAR(36) NULL,
    approvedAt TIMESTAMP NULL,
    paidAt TIMESTAMP NULL,
    notes TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS salesman_customers (
    id VARCHAR(36) PRIMARY KEY,
    salesmanId VARCHAR(36) NOT NULL,
    partnerId VARCHAR(36) NOT NULL,
    assignedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    UNIQUE KEY unique_assignment (salesmanId, partnerId)
);

-- Price Lists
CREATE TABLE IF NOT EXISTS price_lists (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    isActive BOOLEAN DEFAULT TRUE,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_prices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    productId VARCHAR(36) NOT NULL,
    priceListId VARCHAR(36) NOT NULL,
    price DECIMAL(15, 2) DEFAULT 0,
    UNIQUE KEY unique_product_price (productId, priceListId)
);

-- Partner Groups
CREATE TABLE IF NOT EXISTS partner_groups (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50),
    description TEXT
);

-- POS Tables
CREATE TABLE IF NOT EXISTS pos_shifts (
    id VARCHAR(36) PRIMARY KEY,
    userId VARCHAR(36) NOT NULL,
    warehouseId VARCHAR(36),
    terminalName VARCHAR(100),
    openedAt DATETIME NOT NULL,
    closedAt DATETIME,
    openingCash DECIMAL(15,2) DEFAULT 0,
    closingCash DECIMAL(15,2),
    expectedCash DECIMAL(15,2),
    variance DECIMAL(15,2),
    totalSales DECIMAL(15,2) DEFAULT 0,
    totalRefunds DECIMAL(15,2) DEFAULT 0,
    salesCount INT DEFAULT 0,
    refundCount INT DEFAULT 0,
    status ENUM('OPEN', 'CLOSED', 'SUSPENDED') DEFAULT 'OPEN',
    notes TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pos_cash_movements (
    id VARCHAR(36) PRIMARY KEY,
    shiftId VARCHAR(36) NOT NULL,
    type ENUM('DEPOSIT', 'WITHDRAWAL', 'OPENING', 'SALE', 'REFUND', 'ADJUSTMENT') NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    paymentMethod ENUM('CASH', 'BANK', 'CHEQUE', 'MIXED') DEFAULT 'CASH',
    description TEXT,
    referenceId VARCHAR(36),
    referenceType VARCHAR(50),
    approvedBy VARCHAR(36),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pos_held_orders (
    id VARCHAR(36) PRIMARY KEY,
    shiftId VARCHAR(36) NOT NULL,
    userId VARCHAR(36) NOT NULL,
    customerId VARCHAR(36),
    customerName VARCHAR(255),
    orderData JSON NOT NULL,
    holdNote TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pos_favorites (
    id VARCHAR(36) PRIMARY KEY,
    userId VARCHAR(36),
    productId VARCHAR(36) NOT NULL,
    sortOrder INT DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_product (userId, productId)
);

-- ============================================================
-- 13. HR & PAYROLL TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(36) PRIMARY KEY,
    fullName VARCHAR(255) NOT NULL,
    nationalId VARCHAR(50) UNIQUE,
    jobTitle VARCHAR(100),
    department VARCHAR(100),
    employmentType ENUM('MONTHLY', 'DAILY') DEFAULT 'MONTHLY',
    baseSalary DECIMAL(15, 2) DEFAULT 0,
    branchId VARCHAR(36),
    treasuryAccountId VARCHAR(36),
    status ENUM('ACTIVE', 'INACTIVE', 'TERMINATED') DEFAULT 'ACTIVE',
    hireDate DATE,
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    salesmanId VARCHAR(36),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll_cycles (
    id VARCHAR(36) PRIMARY KEY,
    month INT NOT NULL,
    year INT NOT NULL,
    status ENUM('DRAFT', 'REVIEW', 'APPROVED', 'PAID') DEFAULT 'DRAFT',
    totalAmount DECIMAL(15, 2) DEFAULT 0,
    generatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    approvedBy VARCHAR(36),
    approvedAt DATETIME,
    notes TEXT,
    UNIQUE KEY unique_period (month, year)
);

CREATE TABLE IF NOT EXISTS payroll_entries (
    id VARCHAR(36) PRIMARY KEY,
    payrollId VARCHAR(36) NOT NULL,
    employeeId VARCHAR(36) NOT NULL,
    baseSalary DECIMAL(15, 2) DEFAULT 0,
    dailyRate DECIMAL(15, 2) DEFAULT 0,
    overtimeRate DECIMAL(15, 2) DEFAULT 0,
    overtimeHours DECIMAL(6, 2) DEFAULT 0,
    overtimeAmount DECIMAL(15, 2) DEFAULT 0,
    incentives DECIMAL(15, 2) DEFAULT 0,
    bonus DECIMAL(15, 2) DEFAULT 0,
    allowances JSON,
    grossSalary DECIMAL(15, 2) DEFAULT 0,
    purchases DECIMAL(15, 2) DEFAULT 0,
    advances DECIMAL(15, 2) DEFAULT 0,
    absenceDays DECIMAL(6, 2) DEFAULT 0,
    absenceAmount DECIMAL(15, 2) DEFAULT 0,
    hourDeductions DECIMAL(15, 2) DEFAULT 0,
    penaltyDays DECIMAL(6, 2) DEFAULT 0,
    penalties DECIMAL(15, 2) DEFAULT 0,
    deductions JSON,
    totalDeductions DECIMAL(15, 2) DEFAULT 0,
    netSalary DECIMAL(15, 2) DEFAULT 0,
    status ENUM('PENDING', 'PAID') DEFAULT 'PENDING',
    paidAmount DECIMAL(15, 2) DEFAULT 0,
    unpaidAmount DECIMAL(15, 2) DEFAULT 0,
    notes TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id VARCHAR(36) PRIMARY KEY,
    employeeId VARCHAR(36) NOT NULL,
    date DATE NOT NULL,
    checkIn TIME,
    checkOut TIME,
    status ENUM('PRESENT', 'ABSENT', 'LATE', 'LEAVE') DEFAULT 'PRESENT',
    isOvertime BOOLEAN DEFAULT FALSE,
    overtimeHours DECIMAL(4, 2) DEFAULT 0,
    lateMinutes INT DEFAULT 0,
    earlyLeaveMinutes INT DEFAULT 0,
    scheduledCheckIn TIME DEFAULT '09:00:00',
    scheduledCheckOut TIME DEFAULT '17:00:00',
    notes TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_daily_attendance (employeeId, date)
);

CREATE TABLE IF NOT EXISTS employee_advances (
    id VARCHAR(36) PRIMARY KEY,
    employeeId VARCHAR(36) NOT NULL,
    type ENUM('ADVANCE', 'LOAN') DEFAULT 'ADVANCE',
    amount DECIMAL(15, 2) NOT NULL,
    reason TEXT,
    issueDate DATE NOT NULL,
    monthlyDeduction DECIMAL(15, 2) DEFAULT 0,
    totalPaid DECIMAL(15, 2) DEFAULT 0,
    remainingAmount DECIMAL(15, 2) DEFAULT 0,
    status ENUM('ACTIVE', 'COMPLETED', 'CANCELLED') DEFAULT 'ACTIVE',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll_templates (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type ENUM('ALLOWANCE', 'DEDUCTION') NOT NULL,
    calculationType ENUM('FIXED', 'PERCENTAGE') DEFAULT 'FIXED',
    amount DECIMAL(15, 2) DEFAULT 0,
    percentage DECIMAL(5, 2) DEFAULT 0,
    description TEXT,
    isActive BOOLEAN DEFAULT TRUE,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_payroll_templates (
    id VARCHAR(36) PRIMARY KEY,
    employeeId VARCHAR(36) NOT NULL,
    templateId VARCHAR(36) NOT NULL,
    customAmount DECIMAL(15, 2) DEFAULT NULL,
    isActive BOOLEAN DEFAULT TRUE,
    UNIQUE KEY unique_employee_template (employeeId, templateId)
);

-- ============================================================
-- 14. MANUFACTURING TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS bom (
    id VARCHAR(36) PRIMARY KEY,
    finished_product_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    version INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    labor_cost DECIMAL(15,2) DEFAULT 0,
    overhead_cost DECIMAL(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bom_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bom_id VARCHAR(36) NOT NULL,
    raw_product_id VARCHAR(36) NOT NULL,
    quantity_per_unit DECIMAL(18,8) NOT NULL,
    waste_percent DECIMAL(5,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_bom_product (bom_id, raw_product_id)
);

CREATE TABLE IF NOT EXISTS production_orders (
    id VARCHAR(36) PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    bom_id VARCHAR(36) NOT NULL,
    finished_product_id VARCHAR(36) NOT NULL,
    qty_planned DECIMAL(15,3) NOT NULL,
    qty_finished DECIMAL(15,3) DEFAULT 0,
    qty_scrapped DECIMAL(15,3) DEFAULT 0,
    status ENUM('PLANNED', 'CONFIRMED', 'WAITING_MATERIALS', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'PLANNED',
    start_date DATE,
    end_date DATE,
    actual_start_date TIMESTAMP NULL,
    actual_end_date TIMESTAMP NULL,
    warehouse_id VARCHAR(36),
    source_warehouse_id VARCHAR(36),
    dest_warehouse_id VARCHAR(36),
    notes TEXT,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    finished_batch_id VARCHAR(50),
    standard_cost DECIMAL(15,2) DEFAULT 0,
    actual_material_cost DECIMAL(15,2) DEFAULT 0,
    actual_scrap_cost DECIMAL(15,2) DEFAULT 0,
    material_variance DECIMAL(15,2) DEFAULT 0,
    yield_variance DECIMAL(15,2) DEFAULT 0,
    total_variance DECIMAL(15,2) DEFAULT 0,
    priority ENUM('HIGH', 'MEDIUM', 'LOW') DEFAULT 'MEDIUM',
    scheduled_start_date DATE,
    scheduled_end_date DATE,
    updated_by VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS material_reservations (
    id VARCHAR(36) PRIMARY KEY,
    productionOrderId VARCHAR(36) NOT NULL,
    productId VARCHAR(36) NOT NULL,
    warehouseId VARCHAR(36),
    quantityReserved DECIMAL(15,4) NOT NULL,
    quantityConsumed DECIMAL(15,4) DEFAULT 0,
    status ENUM('RESERVED', 'PARTIALLY_CONSUMED', 'FULLY_CONSUMED', 'RELEASED') DEFAULT 'RESERVED',
    reservedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    releasedAt TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS production_scrap (
    id VARCHAR(36) PRIMARY KEY,
    production_order_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    warehouse_id VARCHAR(36),
    quantity DECIMAL(15,4) NOT NULL,
    unit VARCHAR(20),
    scrap_type ENUM('CUTTING_WASTE', 'DEFECTIVE_MATERIAL', 'PROCESS_LOSS', 'DAMAGED_GOODS', 'EXPIRED_MATERIALS', 'OTHER') DEFAULT 'CUTTING_WASTE',
    reason TEXT,
    unit_cost DECIMAL(15,4),
    total_value DECIMAL(15,2),
    disposal_status ENUM('PENDING', 'DISPOSED', 'SOLD', 'RECYCLED') DEFAULT 'PENDING',
    disposal_date TIMESTAMP NULL,
    disposal_notes TEXT,
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_batches (
    id VARCHAR(50) PRIMARY KEY,
    batch_number VARCHAR(100) UNIQUE NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    warehouse_id VARCHAR(50),
    quantity DECIMAL(15,3) NOT NULL DEFAULT 0,
    available_quantity DECIMAL(15,3) NOT NULL DEFAULT 0,
    unit_cost DECIMAL(15,2),
    manufacture_date DATE,
    expiry_date DATE,
    supplier_batch VARCHAR(100),
    supplier_id VARCHAR(50),
    production_order_id VARCHAR(50),
    status ENUM('ACTIVE', 'QUARANTINE', 'EXPIRED', 'CONSUMED') DEFAULT 'ACTIVE',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS batch_genealogy (
    id VARCHAR(50) PRIMARY KEY,
    child_batch_id VARCHAR(50) NOT NULL,
    parent_batch_id VARCHAR(50) NOT NULL,
    production_order_id VARCHAR(50) NOT NULL,
    quantity_consumed DECIMAL(15,3) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_centers (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50),
    capacity_per_hour DECIMAL(10,2) DEFAULT 0,
    cost_per_hour DECIMAL(10,2) DEFAULT 0,
    warehouse_id VARCHAR(50),
    status ENUM('ACTIVE', 'MAINTENANCE', 'INACTIVE') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS routings (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS routing_steps (
    id VARCHAR(50) PRIMARY KEY,
    routing_id VARCHAR(50) NOT NULL,
    sequence_number INT NOT NULL,
    work_center_id VARCHAR(50) NOT NULL,
    operation_name VARCHAR(255) NOT NULL,
    description TEXT,
    setup_time_minutes DECIMAL(10,2) DEFAULT 0,
    run_time_minutes DECIMAL(10,2) DEFAULT 0,
    labor_cost_per_hour DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 15. VAN SALES TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS vehicles (
    id VARCHAR(36) PRIMARY KEY,
    plateNumber VARCHAR(50) NOT NULL,
    name VARCHAR(100),
    type VARCHAR(50),
    capacity DECIMAL(10,2),
    salesmanId VARCHAR(36),
    warehouseId VARCHAR(36),
    status VARCHAR(20) DEFAULT 'AVAILABLE',
    notes TEXT,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    lastLocationUpdate DATETIME,
    currentMileage INT DEFAULT 0,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_inventory (
    id VARCHAR(36) PRIMARY KEY,
    vehicleId VARCHAR(36) NOT NULL,
    productId VARCHAR(36) NOT NULL,
    quantity DECIMAL(15,3) DEFAULT 0,
    lastLoadDate DATETIME,
    UNIQUE KEY unique_vehicle_product (vehicleId, productId)
);

CREATE TABLE IF NOT EXISTS vehicle_operations (
    id VARCHAR(36) PRIMARY KEY,
    vehicleId VARCHAR(36) NOT NULL,
    operationType VARCHAR(20) NOT NULL,
    date DATETIME NOT NULL,
    warehouseId VARCHAR(36),
    notes TEXT,
    createdBy VARCHAR(100),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_operation_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    operationId VARCHAR(36) NOT NULL,
    productId VARCHAR(36),
    productName VARCHAR(255),
    quantity DECIMAL(15,3) NOT NULL,
    cost DECIMAL(15,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vehicle_customer_visits (
    id VARCHAR(36) PRIMARY KEY,
    vehicleId VARCHAR(36) NOT NULL,
    salesmanId VARCHAR(36),
    customerId VARCHAR(36),
    customerName VARCHAR(255),
    visitDate DATETIME NOT NULL,
    visitType ENUM('PLANNED', 'UNPLANNED') DEFAULT 'PLANNED',
    result ENUM('SALE', 'NO_SALE', 'NOT_AVAILABLE', 'DEFERRED', 'RETURN') DEFAULT 'NO_SALE',
    invoiceId VARCHAR(36),
    invoiceAmount DECIMAL(15,2) DEFAULT 0,
    paymentCollected DECIMAL(15,2) DEFAULT 0,
    paymentMethod VARCHAR(50),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    address TEXT,
    notes TEXT,
    duration INT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_returns (
    id VARCHAR(36) PRIMARY KEY,
    vehicleId VARCHAR(36) NOT NULL,
    customerId VARCHAR(36),
    customerName VARCHAR(255),
    returnDate DATETIME NOT NULL,
    originalInvoiceId VARCHAR(36),
    returnType ENUM('DAMAGE', 'EXPIRY', 'QUALITY', 'EXCESS', 'OTHER') DEFAULT 'OTHER',
    returnReason TEXT,
    totalValue DECIMAL(15,2) DEFAULT 0,
    status ENUM('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED') DEFAULT 'PENDING',
    processedBy VARCHAR(100),
    processedAt DATETIME,
    notes TEXT,
    createdBy VARCHAR(100),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_return_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    returnId VARCHAR(36) NOT NULL,
    productId VARCHAR(36),
    productName VARCHAR(255),
    quantity DECIMAL(15,3) NOT NULL,
    unitPrice DECIMAL(15,2) DEFAULT 0,
    totalPrice DECIMAL(15,2) DEFAULT 0,
    reason TEXT
);

CREATE TABLE IF NOT EXISTS vehicle_settlements (
    id VARCHAR(36) PRIMARY KEY,
    vehicleId VARCHAR(36) NOT NULL,
    settlementDate DATE NOT NULL,
    salesmanId VARCHAR(36),
    salesmanName VARCHAR(255),
    totalCashSales DECIMAL(15,2) DEFAULT 0,
    totalCreditSales DECIMAL(15,2) DEFAULT 0,
    totalChequeSales DECIMAL(15,2) DEFAULT 0,
    totalSales DECIMAL(15,2) DEFAULT 0,
    cashCollected DECIMAL(15,2) DEFAULT 0,
    chequesCollected DECIMAL(15,2) DEFAULT 0,
    totalCollections DECIMAL(15,2) DEFAULT 0,
    totalReturns DECIMAL(15,2) DEFAULT 0,
    returnCount INT DEFAULT 0,
    openingInventoryValue DECIMAL(15,2) DEFAULT 0,
    loadedValue DECIMAL(15,2) DEFAULT 0,
    unloadedValue DECIMAL(15,2) DEFAULT 0,
    closingInventoryValue DECIMAL(15,2) DEFAULT 0,
    plannedVisits INT DEFAULT 0,
    completedVisits INT DEFAULT 0,
    successfulVisits INT DEFAULT 0,
    expectedCash DECIMAL(15,2) DEFAULT 0,
    actualCash DECIMAL(15,2) DEFAULT 0,
    cashDifference DECIMAL(15,2) DEFAULT 0,
    status ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'DISPUTED') DEFAULT 'DRAFT',
    approvedBy VARCHAR(100),
    approvedAt DATETIME,
    notes TEXT,
    partialSettlement BOOLEAN DEFAULT FALSE,
    bankTransferAmount DECIMAL(15,2) DEFAULT 0,
    bankTransferReference VARCHAR(100),
    totalBankTransfers DECIMAL(15,2) DEFAULT 0,
    totalExpenses DECIMAL(15,2) DEFAULT 0,
    createdBy VARCHAR(100),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_vehicle_date (vehicleId, settlementDate)
);

CREATE TABLE IF NOT EXISTS vehicle_targets (
    id VARCHAR(36) PRIMARY KEY,
    vehicleId VARCHAR(36) NOT NULL,
    salesmanId VARCHAR(36),
    targetType ENUM('SALES_AMOUNT', 'SALES_COUNT', 'VISITS', 'COLLECTIONS') DEFAULT 'SALES_AMOUNT',
    periodType ENUM('DAILY', 'WEEKLY', 'MONTHLY') DEFAULT 'DAILY',
    targetValue DECIMAL(15,2) NOT NULL,
    periodStart DATE NOT NULL,
    periodEnd DATE NOT NULL,
    achievedValue DECIMAL(15,2) DEFAULT 0,
    isActive BOOLEAN DEFAULT TRUE,
    notes TEXT,
    createdBy VARCHAR(100),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_routes (
    id VARCHAR(36) PRIMARY KEY,
    vehicleId VARCHAR(36) NOT NULL,
    routeName VARCHAR(255) NOT NULL,
    routeDate DATE NOT NULL,
    status ENUM('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'PLANNED',
    plannedDistance DECIMAL(10,2),
    actualDistance DECIMAL(10,2),
    startTime DATETIME,
    endTime DATETIME,
    notes TEXT,
    createdBy VARCHAR(100),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_route_stops (
    id VARCHAR(36) PRIMARY KEY,
    routeId VARCHAR(36) NOT NULL,
    stopOrder INT NOT NULL,
    customerId VARCHAR(36),
    customerName VARCHAR(255),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    address TEXT,
    plannedArrival DATETIME,
    actualArrival DATETIME,
    visitId VARCHAR(36),
    status ENUM('PENDING', 'VISITED', 'SKIPPED') DEFAULT 'PENDING',
    result ENUM('SALE', 'NO_SALE', 'NOT_AVAILABLE', 'DEFERRED') DEFAULT NULL,
    invoiceId VARCHAR(36),
    amountCollected DECIMAL(15,2) DEFAULT 0,
    notes TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_maintenance (
    id VARCHAR(36) PRIMARY KEY,
    vehicleId VARCHAR(36) NOT NULL,
    maintenanceType ENUM('SCHEDULED', 'REPAIR', 'INSPECTION', 'OIL_CHANGE', 'TIRE', 'OTHER') DEFAULT 'SCHEDULED',
    description TEXT,
    scheduledDate DATE,
    completedDate DATE,
    cost DECIMAL(15,2) DEFAULT 0,
    mileage INT,
    nextMaintenanceDate DATE,
    nextMaintenanceMileage INT,
    status ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'SCHEDULED',
    notes TEXT,
    createdBy VARCHAR(100),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_fuel_logs (
    id VARCHAR(36) PRIMARY KEY,
    vehicleId VARCHAR(36) NOT NULL,
    fuelDate DATE NOT NULL,
    fuelType VARCHAR(50) DEFAULT 'بنزين 92',
    liters DECIMAL(10,2) NOT NULL,
    pricePerLiter DECIMAL(10,2),
    totalCost DECIMAL(15,2),
    mileage INT,
    kmPerLiter DECIMAL(10,2),
    fullTank BOOLEAN DEFAULT FALSE,
    notes TEXT,
    createdBy VARCHAR(100),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 16. OTHER MISSING TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS branches (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location TEXT,
    manager VARCHAR(100),
    phone VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS warehouses (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    branchId VARCHAR(36),
    keeper VARCHAR(100),
    phone VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS banks (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    accountNumber VARCHAR(100),
    currency VARCHAR(10),
    balance DECIMAL(15, 2) DEFAULT 0,
    branch VARCHAR(100),
    iban VARCHAR(100),
    swift VARCHAR(50),
    type VARCHAR(50),
    accountId VARCHAR(36),
    color VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS cheques (
    id VARCHAR(36) PRIMARY KEY,
    number VARCHAR(50),
    bankName VARCHAR(100),
    amount DECIMAL(15, 2) DEFAULT 0,
    dueDate DATETIME,
    status VARCHAR(50),
    type VARCHAR(50),
    partnerId VARCHAR(36),
    partnerName VARCHAR(255),
    description TEXT,
    createdDate DATETIME,
    bankAccountId VARCHAR(36),
    bounceReason TEXT,
    createdBy VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS installment_plans (
    id VARCHAR(36) PRIMARY KEY,
    invoiceId VARCHAR(36) NOT NULL,
    partnerId VARCHAR(36) NOT NULL,
    partnerName VARCHAR(255),
    totalAmount DECIMAL(15, 2) NOT NULL,
    downPayment DECIMAL(15, 2) DEFAULT 0,
    remainingAmount DECIMAL(15, 2) NOT NULL,
    numberOfInstallments INT NOT NULL,
    intervalDays INT DEFAULT 30,
    startDate DATE NOT NULL,
    status ENUM('ACTIVE', 'COMPLETED', 'CANCELLED', 'OVERDUE') DEFAULT 'ACTIVE',
    notes TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    createdBy VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS installments (
    id VARCHAR(36) PRIMARY KEY,
    planId VARCHAR(36) NOT NULL,
    installmentNumber INT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    dueDate DATE NOT NULL,
    paidAmount DECIMAL(15, 2) DEFAULT 0,
    paidDate DATETIME,
    status ENUM('PENDING', 'PARTIAL', 'PAID', 'OVERDUE') DEFAULT 'PENDING',
    paymentMethod VARCHAR(50),
    paymentReference VARCHAR(100),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS fixed_assets (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    purchaseDate DATETIME,
    purchaseCost DECIMAL(15, 2) DEFAULT 0,
    salvageValue DECIMAL(15, 2) DEFAULT 0,
    lifeYears INT,
    assetAccountId VARCHAR(36),
    accumulatedDepreciationAccountId VARCHAR(36),
    expenseAccountId VARCHAR(36),
    status VARCHAR(50),
    lastDepreciationDate DATETIME
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    date DATETIME NOT NULL,
    user VARCHAR(100),
    module VARCHAR(50),
    action VARCHAR(50),
    description TEXT,
    details TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
    id VARCHAR(100) PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    module VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_backup_settings (
    id VARCHAR(36) PRIMARY KEY,
    userId VARCHAR(36) NOT NULL,
    scheduleEnabled BOOLEAN DEFAULT FALSE,
    scheduleFrequency ENUM('daily', 'weekly', 'monthly', 'hourly') DEFAULT 'daily',
    scheduleHour INT DEFAULT 2,
    scheduleMinute INT DEFAULT 0,
    scheduleDayOfWeek INT DEFAULT 0,
    scheduleDayOfMonth INT DEFAULT 1,
    backupPath VARCHAR(500),
    deliveryEmail VARCHAR(255),
    lastBackupDate DATETIME,
    lastBackupStatus VARCHAR(50),
    lastBackupFilename VARCHAR(255),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_backup (userId)
);

-- ============================================================
-- 17. ADD MISSING COLUMN: employees.salesmanId
-- ============================================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS salesmanId VARCHAR(36);

-- ============================================================
-- 18. DEFAULT PERMISSIONS
-- ============================================================

INSERT IGNORE INTO permissions (id, label, module) VALUES 
('sales.view', 'عرض فواتير المبيعات', 'المبيعات'),
('sales.create', 'إنشاء فاتورة مبيعات', 'المبيعات'),
('sales.edit', 'تعديل فواتير المبيعات', 'المبيعات'),
('sales.delete', 'حذف فواتير المبيعات', 'المبيعات'),
('sales.discount', 'تطبيق خصومات', 'المبيعات'),
('sales.return', 'مرتجعات المبيعات', 'المبيعات'),
('sales.void', 'إلغاء الفواتير', 'المبيعات'),
('sales.reports', 'تقارير المبيعات', 'المبيعات'),
('purchase.view', 'عرض فواتير المشتريات', 'المشتريات'),
('purchase.create', 'إنشاء فاتورة مشتريات', 'المشتريات'),
('purchase.edit', 'تعديل فواتير المشتريات', 'المشتريات'),
('purchase.delete', 'حذف فواتير المشتريات', 'المشتريات'),
('purchase.return', 'مرتجعات المشتريات', 'المشتريات'),
('purchase.reports', 'تقارير المشتريات', 'المشتريات'),
('inventory.view', 'عرض المخزون', 'المخزون'),
('inventory.manage', 'إدارة الأصناف', 'المخزون'),
('inventory.adjust', 'تسوية المخزون', 'المخزون'),
('inventory.transfer', 'نقل بين المخازن', 'المخزون'),
('treasury.view', 'عرض الخزينة', 'الخزينة'),
('treasury.receipt', 'سند قبض', 'الخزينة'),
('treasury.payment', 'سند صرف', 'الخزينة'),
('treasury.cheques', 'إدارة الشيكات', 'الخزينة'),
('accounting.view', 'عرض الحسابات', 'الحسابات'),
('accounting.journal', 'قيود يومية', 'الحسابات'),
('partners.view', 'عرض العملاء والموردين', 'العملاء والموردين'),
('partners.create', 'إضافة عميل/مورد', 'العملاء والموردين'),
('partners.edit', 'تعديل عميل/مورد', 'العملاء والموردين'),
('system.settings', 'إعدادات النظام', 'الإعدادات'),
('system.users', 'إدارة المستخدمين', 'الإعدادات'),
('hr.view', 'عرض الموظفين', 'الموارد البشرية'),
('hr.manage', 'إدارة الموظفين', 'الموارد البشرية'),
('payroll.view', 'عرض كشف المرتبات', 'الموارد البشرية'),
('payroll.manage', 'إدارة المرتبات', 'الموارد البشرية'),
('vansales.view', 'عرض المبيعات المتنقلة', 'المبيعات المتنقلة'),
('vansales.manage', 'إدارة السيارات', 'المبيعات المتنقلة'),
('vansales.settlement', 'تسوية نهاية اليوم', 'المبيعات المتنقلة');

-- ============================================================
-- 19. CREATE MISSING INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_invoices_referenceInvoiceId ON invoices(referenceInvoiceId);
CREATE INDEX IF NOT EXISTS idx_invoices_pos_shift ON invoices(posShiftId);

-- ============================================================
-- DONE! If errors occurred, they are likely "column already exists"
-- or "table already exists" which are safe to ignore.
-- ============================================================

SELECT 'Migration completed! Check for any errors above.' AS Result;
