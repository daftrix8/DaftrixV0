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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DATA_DIR = 'F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/mall stuff/data';
// List all data files and their record counts
console.log('=== ALL DATA FILES ===\n');
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
const summaries = [];
for (const file of files.sort()) {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
        const count = Array.isArray(data) ? data.length : 1;
        const sample = Array.isArray(data) ? data[0] : data;
        const fields = sample ? Object.keys(sample) : [];
        summaries.push({ file, count, fields });
        console.log(`  ${file.padEnd(40)} ${String(count).padStart(8)} records  | Fields: ${fields.join(', ')}`);
    }
    catch (e) {
        console.log(`  ${file.padEnd(40)} ERROR: ${e.message}`);
    }
}
// Deep-dive into specific files the user mentioned
console.log('\n\n========================================');
console.log('=== CUSTOMER PAYMENT DETAILS ===');
console.log('========================================\n');
const cpd = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'customer_Payment_Details.json'), 'utf8'));
console.log('Total records:', cpd.length);
console.log('Sample record:', JSON.stringify(cpd[0], null, 2));
// Analyze: what CustIDs are covered?
const custIds = new Set(cpd.map((r) => r.CustID));
console.log('Unique CustIDs:', custIds.size);
let totalCustPayments = 0;
cpd.forEach((r) => totalCustPayments += Number(r.Value || 0));
console.log('Total payment value:', totalCustPayments);
// Check customer_Payment headers
const cph = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'customer_Payment.json'), 'utf8'));
console.log('customer_Payment headers:', cph.length);
console.log('Header sample:', JSON.stringify(cph[0], null, 2));
console.log('\n\n========================================');
console.log('=== VENDOR PAYMENT DETAILS ===');
console.log('========================================\n');
const vpd = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'VendorPayment_Details.json'), 'utf8'));
console.log('Total records:', vpd.length);
console.log('Sample record:', JSON.stringify(vpd[0], null, 2));
const vendorIds = new Set(vpd.map((r) => r.VendorID));
console.log('Unique VendorIDs:', vendorIds.size);
let totalVendorPayments = 0;
vpd.forEach((r) => totalVendorPayments += Number(r.Value || 0));
console.log('Total payment value:', totalVendorPayments);
const vph = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'VendorPayment.json'), 'utf8'));
console.log('VendorPayment headers:', vph.length);
console.log('Header sample:', JSON.stringify(vph[0], null, 2));
console.log('\n\n========================================');
console.log('=== DISCOUNTS ===');
console.log('========================================\n');
const discFile = path.join(DATA_DIR, 'Discounts.json');
if (fs.existsSync(discFile)) {
    const disc = JSON.parse(fs.readFileSync(discFile, 'utf8'));
    console.log('Total records:', Array.isArray(disc) ? disc.length : 'object');
    if (Array.isArray(disc) && disc.length > 0) {
        console.log('Sample:', JSON.stringify(disc[0], null, 2));
        console.log('Sample 2:', JSON.stringify(disc[1], null, 2));
        // Check what fields exist
        const dFields = new Set();
        disc.slice(0, 100).forEach((d) => Object.keys(d).forEach(k => dFields.add(k)));
        console.log('All fields:', [...dFields].join(', '));
    }
}
else {
    console.log('Discounts.json NOT FOUND');
    // Check for similar files
    const discFiles = files.filter(f => f.toLowerCase().includes('discount'));
    console.log('Discount-related files:', discFiles);
}
console.log('\n\n========================================');
console.log('=== SAFE PAYMENT DETAILS ===');
console.log('========================================\n');
const spd = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'SafePayment_Details.json'), 'utf8'));
console.log('Total records:', spd.length);
console.log('Sample:', JSON.stringify(spd[0], null, 2));
const allSpdFields = new Set();
spd.forEach((r) => Object.keys(r).forEach(k => allSpdFields.add(k)));
console.log('All fields:', [...allSpdFields].join(', '));
// Check what PaymentID values mean  
const paymentTypes = new Map();
spd.forEach((r) => {
    const pid = r.PaymentID;
    paymentTypes.set(pid, (paymentTypes.get(pid) || 0) + 1);
});
console.log('\nPaymentID distribution:');
[...paymentTypes.entries()].sort((a, b) => b[1] - a[1]).forEach(([pid, cnt]) => {
    console.log(`  PaymentID ${pid}: ${cnt} records`);
});
// Check SafePayment headers for PaymentChart meaning
console.log('\n\n========================================');
console.log('=== SAFE CHART (Payment Types) ===');
console.log('========================================\n');
const scFile = path.join(DATA_DIR, 'SafeChart.json');
if (fs.existsSync(scFile)) {
    const sc = JSON.parse(fs.readFileSync(scFile, 'utf8'));
    console.log('SafeChart records:');
    if (Array.isArray(sc)) {
        sc.forEach((r) => console.log(`  ID: ${r.ID}, title: ${r.title}, type: ${r.type}, balance: ${r.balance}`));
    }
}
// Check VendorPayment header for SafeID and what safes are used
console.log('\n\n========================================');
console.log('=== PAYMENT SAFE ALLOCATION ===');
console.log('========================================\n');
const vpSafeIds = new Map();
vpd.forEach((r) => {
    vpSafeIds.set(r.SafeID, (vpSafeIds.get(r.SafeID) || 0) + 1);
});
console.log('VendorPayment SafeID distribution:');
[...vpSafeIds.entries()].sort((a, b) => b[1] - a[1]).forEach(([sid, cnt]) => {
    console.log(`  SafeID ${sid}: ${cnt} records`);
});
const cpSafeIds = new Map();
cpd.forEach((r) => {
    cpSafeIds.set(r.SafeID, (cpSafeIds.get(r.SafeID) || 0) + 1);
});
console.log('\nCustomerPayment SafeID distribution:');
[...cpSafeIds.entries()].sort((a, b) => b[1] - a[1]).forEach(([sid, cnt]) => {
    console.log(`  SafeID ${sid}: ${cnt} records`);
});
// Check for ابراهيم غديه specifically
console.log('\n\n========================================');
console.log('=== DEEP CHECK: ابراهيم غديه (ID=19) ===');
console.log('========================================\n');
// All vendor payment details for this person
const ghadiaVP = vpd.filter((r) => r.VendorID === 19);
console.log(`VendorPayment_Details: ${ghadiaVP.length} records`);
let gvpTotal = 0;
ghadiaVP.forEach((r) => { gvpTotal += Number(r.Value); console.log(`  Value: ${r.Value}, SafeID: ${r.SafeID}, Notes: ${r.Notes}`); });
console.log(`  TOTAL: ${gvpTotal}`);
// Check if they appear in customer payments too (unlikely but check)
const ghadiaCust = cpd.filter((r) => r.CustID === 19);
console.log(`\nCustomer_Payment_Details: ${ghadiaCust.length} records`);
// Check SafePayment_Details - maybe person linked via Notes
const ghadiaSafe = spd.filter((r) => r.Notes && r.Notes.includes('غديه'));
console.log(`\nSafePayment_Details mentioning غديه: ${ghadiaSafe.length} records`);
ghadiaSafe.forEach((r) => console.log(`  Value: ${r.value}, Notes: ${r.Notes}`));
// Check all invoices for this vendor
const buyInv = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'BuyInvoice.json'), 'utf8'));
const ghadiaBuy = buyInv.filter((inv) => inv.VendorID === 19);
console.log(`\nBuyInvoice headers: ${ghadiaBuy.length} invoices`);
ghadiaBuy.forEach((inv) => console.log(`  ID:${inv.ID} invNum:${inv.invNum} discount:${inv.invDiscount} adds:${inv.invAdds}`));
// Get detail totals for each 
const buyDet = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'BuyInvoice_Details.json'), 'utf8'));
let grandBuyTotal = 0;
for (const inv of ghadiaBuy) {
    const lines = buyDet.filter((d) => d.masterID === inv.ID);
    let invTotal = 0;
    lines.forEach((l) => invTotal += (Number(l.price) * Number(l.quan) - Number(l.discount || 0)));
    grandBuyTotal += invTotal - Number(inv.invDiscount || 0) + Number(inv.invAdds || 0);
    console.log(`    → ${lines.length} lines, lineTotal: ${invTotal}, afterDisc: ${invTotal - Number(inv.invDiscount || 0)}`);
}
console.log(`  GRAND TOTAL PURCHASES: ${grandBuyTotal}`);
// Purchase returns
const buyBack = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'BuyBackInvoice.json'), 'utf8'));
const ghadiaBuyBack = buyBack.filter((inv) => inv.VendorID === 19);
console.log(`\nBuyBackInvoice headers: ${ghadiaBuyBack.length}`);
const buyBackDet = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'BuyBackInvoice_Details.json'), 'utf8'));
let grandReturnTotal = 0;
for (const inv of ghadiaBuyBack) {
    const lines = buyBackDet.filter((d) => d.masterID === inv.ID);
    let invTotal = 0;
    lines.forEach((l) => invTotal += (Number(l.price) * Number(l.quan) - Number(l.discount || 0)));
    grandReturnTotal += invTotal;
    console.log(`  ID:${inv.ID} → ${lines.length} lines, total: ${invTotal}`);
}
console.log(`  GRAND TOTAL RETURNS: ${grandReturnTotal}`);
// Persons.json startBalance
const persons = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'Persons.json'), 'utf8'));
const person = persons.find((p) => p.ID === 19);
console.log(`\nPerson startBalance: ${person === null || person === void 0 ? void 0 : person.startBalance}, balanceType: ${person === null || person === void 0 ? void 0 : person.balanceType}`);
console.log(`\n=== EXPECTED BALANCE ===`);
console.log(`Opening: ${person === null || person === void 0 ? void 0 : person.startBalance}`);
console.log(`+ Purchases: ${grandBuyTotal}`);
console.log(`- Returns: ${grandReturnTotal}`);
console.log(`- Payments: ${gvpTotal}`);
const expected = ((person === null || person === void 0 ? void 0 : person.startBalance) || 0) + grandBuyTotal - grandReturnTotal - gvpTotal;
console.log(`= ${expected}`);
console.log(`Old ERP shows: 0`);
console.log(`Difference: ${expected} (these are untracked transactions in the export)`);
