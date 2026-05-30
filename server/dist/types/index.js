"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MembershipStatus = exports.LeaveStatus = exports.PayrollStatus = exports.AttendanceStatus = exports.EmployeeStatus = exports.EmploymentType = exports.ProductionPriority = exports.ProductionOrderStatus = exports.MovementType = exports.UnitOfMeasure = exports.ProductType = exports.ChequeStatus = exports.PaymentMethod = exports.InvoiceStatus = exports.TransactionType = void 0;
__exportStar(require("./membership"), exports);
var TransactionType;
(function (TransactionType) {
    TransactionType["INVOICE_SALE"] = "INVOICE_SALE";
    TransactionType["INVOICE_PURCHASE"] = "INVOICE_PURCHASE";
    TransactionType["RETURN_SALE"] = "RETURN_SALE";
    TransactionType["RETURN_PURCHASE"] = "RETURN_PURCHASE";
    TransactionType["RETURN_IN"] = "RETURN_IN";
    TransactionType["RETURN_OUT"] = "RETURN_OUT";
    TransactionType["QUOTATION"] = "QUOTATION";
    TransactionType["RECEIPT"] = "RECEIPT";
    TransactionType["PAYMENT"] = "PAYMENT";
    TransactionType["JOURNAL"] = "JOURNAL";
    TransactionType["STOCK_PERMIT_IN"] = "STOCK_PERMIT_IN";
    TransactionType["STOCK_PERMIT_OUT"] = "STOCK_PERMIT_OUT";
    TransactionType["STOCK_TRANSFER"] = "STOCK_TRANSFER";
    TransactionType["DISCOUNT_ALLOWED"] = "DISCOUNT_ALLOWED";
    TransactionType["DISCOUNT_EARNED"] = "DISCOUNT_EARNED";
    // Cheque Lifecycle
    TransactionType["CHEQUE_RECEIVED"] = "CHEQUE_RECEIVED";
    TransactionType["CHEQUE_ISSUED"] = "CHEQUE_ISSUED";
    TransactionType["CHEQUE_DEPOSIT"] = "CHEQUE_DEPOSIT";
    TransactionType["CHEQUE_COLLECT"] = "CHEQUE_COLLECT";
    TransactionType["CHEQUE_BOUNCE"] = "CHEQUE_BOUNCE";
    TransactionType["CHEQUE_CASHED"] = "CHEQUE_CASHED";
    // Assets
    TransactionType["ASSET_DEPRECIATION"] = "ASSET_DEPRECIATION";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
var InvoiceStatus;
(function (InvoiceStatus) {
    InvoiceStatus["DRAFT"] = "DRAFT";
    InvoiceStatus["POSTED"] = "POSTED";
    InvoiceStatus["VOID"] = "VOID";
    InvoiceStatus["PAID"] = "PAID";
    InvoiceStatus["PARTIAL"] = "PARTIAL";
})(InvoiceStatus || (exports.InvoiceStatus = InvoiceStatus = {}));
var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["CASH"] = "CASH";
    PaymentMethod["BANK"] = "BANK";
    PaymentMethod["CREDIT"] = "CREDIT";
    PaymentMethod["CHEQUE"] = "CHEQUE";
    PaymentMethod["MIXED"] = "MIXED"; // New for split payments
})(PaymentMethod || (exports.PaymentMethod = PaymentMethod = {}));
var ChequeStatus;
(function (ChequeStatus) {
    ChequeStatus["PENDING"] = "PENDING";
    ChequeStatus["UNDER_COLLECTION"] = "UNDER_COLLECTION";
    ChequeStatus["COLLECTED"] = "COLLECTED";
    ChequeStatus["BOUNCED"] = "BOUNCED";
    ChequeStatus["CASHED"] = "CASHED";
    ChequeStatus["ENDORSED"] = "ENDORSED"; // Transferred to third party (Receivable Cheque)
})(ChequeStatus || (exports.ChequeStatus = ChequeStatus = {}));
// ========================================
// MANUFACTURING MODULE TYPES
// ========================================
var ProductType;
(function (ProductType) {
    ProductType["RAW"] = "RAW";
    ProductType["FINISHED"] = "FINISHED";
    ProductType["SERVICE"] = "SERVICE"; // Service items
})(ProductType || (exports.ProductType = ProductType = {}));
var UnitOfMeasure;
(function (UnitOfMeasure) {
    UnitOfMeasure["PIECE"] = "piece";
    UnitOfMeasure["METER"] = "meter";
    UnitOfMeasure["KG"] = "kg";
    UnitOfMeasure["SET"] = "set";
    UnitOfMeasure["BOX"] = "box";
    UnitOfMeasure["LITER"] = "liter";
    UnitOfMeasure["GRAM"] = "gram";
    UnitOfMeasure["TON"] = "ton";
})(UnitOfMeasure || (exports.UnitOfMeasure = UnitOfMeasure = {}));
var MovementType;
(function (MovementType) {
    MovementType["PURCHASE"] = "PURCHASE";
    MovementType["SALE"] = "SALE";
    MovementType["RETURN_IN"] = "RETURN_IN";
    MovementType["RETURN_OUT"] = "RETURN_OUT";
    MovementType["PRODUCTION_USE"] = "PRODUCTION_USE";
    MovementType["PRODUCTION_OUTPUT"] = "PRODUCTION_OUTPUT";
    MovementType["ADJUSTMENT"] = "ADJUSTMENT";
    MovementType["TRANSFER_IN"] = "TRANSFER_IN";
    MovementType["TRANSFER_OUT"] = "TRANSFER_OUT";
    MovementType["OPENING_BALANCE"] = "OPENING_BALANCE";
    MovementType["SCRAP"] = "SCRAP"; // Production waste
})(MovementType || (exports.MovementType = MovementType = {}));
var ProductionOrderStatus;
(function (ProductionOrderStatus) {
    ProductionOrderStatus["PLANNED"] = "PLANNED";
    ProductionOrderStatus["CONFIRMED"] = "CONFIRMED";
    ProductionOrderStatus["WAITING_MATERIALS"] = "WAITING_MATERIALS";
    ProductionOrderStatus["IN_PROGRESS"] = "IN_PROGRESS";
    ProductionOrderStatus["COMPLETED"] = "COMPLETED";
    ProductionOrderStatus["CANCELLED"] = "CANCELLED";
})(ProductionOrderStatus || (exports.ProductionOrderStatus = ProductionOrderStatus = {}));
var ProductionPriority;
(function (ProductionPriority) {
    ProductionPriority["HIGH"] = "HIGH";
    ProductionPriority["MEDIUM"] = "MEDIUM";
    ProductionPriority["LOW"] = "LOW";
})(ProductionPriority || (exports.ProductionPriority = ProductionPriority = {}));
// ========================================
// HR & PAYROLL MODULE TYPES
// ========================================
var EmploymentType;
(function (EmploymentType) {
    EmploymentType["MONTHLY"] = "MONTHLY";
    EmploymentType["DAILY"] = "DAILY";
    EmploymentType["WEEKLY"] = "WEEKLY";
})(EmploymentType || (exports.EmploymentType = EmploymentType = {}));
var EmployeeStatus;
(function (EmployeeStatus) {
    EmployeeStatus["ACTIVE"] = "ACTIVE";
    EmployeeStatus["INACTIVE"] = "INACTIVE";
    EmployeeStatus["TERMINATED"] = "TERMINATED";
})(EmployeeStatus || (exports.EmployeeStatus = EmployeeStatus = {}));
var AttendanceStatus;
(function (AttendanceStatus) {
    AttendanceStatus["PRESENT"] = "PRESENT";
    AttendanceStatus["ABSENT"] = "ABSENT";
    AttendanceStatus["LATE"] = "LATE";
    AttendanceStatus["LEAVE"] = "LEAVE";
})(AttendanceStatus || (exports.AttendanceStatus = AttendanceStatus = {}));
var PayrollStatus;
(function (PayrollStatus) {
    PayrollStatus["DRAFT"] = "DRAFT";
    PayrollStatus["CALCULATED"] = "CALCULATED";
    PayrollStatus["REVIEW"] = "REVIEW";
    PayrollStatus["APPROVED"] = "APPROVED";
    PayrollStatus["PAID"] = "PAID";
})(PayrollStatus || (exports.PayrollStatus = PayrollStatus = {}));
// ========================================
// LEAVE MANAGEMENT TYPES (الإجازات)
// ========================================
var LeaveStatus;
(function (LeaveStatus) {
    LeaveStatus["PENDING"] = "PENDING";
    LeaveStatus["APPROVED"] = "APPROVED";
    LeaveStatus["REJECTED"] = "REJECTED";
    LeaveStatus["CANCELLED"] = "CANCELLED";
})(LeaveStatus || (exports.LeaveStatus = LeaveStatus = {}));
__exportStar(require("./PaymentTypes"), exports);
var MembershipStatus;
(function (MembershipStatus) {
    MembershipStatus["PENDING"] = "PENDING";
    MembershipStatus["PENDING_PAYMENT"] = "PENDING_PAYMENT";
    MembershipStatus["ACTIVE"] = "ACTIVE";
    MembershipStatus["EXPIRED"] = "EXPIRED";
    MembershipStatus["FROZEN"] = "FROZEN";
    MembershipStatus["CANCELLED"] = "CANCELLED";
})(MembershipStatus || (exports.MembershipStatus = MembershipStatus = {}));
