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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DATA = 'F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/mall stuff/data';
const BALANCES = 'F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/mall stuff/balances';
// Check Persons.json for ابراهيم غديه  
const persons = JSON.parse(fs.readFileSync(path.join(DATA, 'Persons.json'), 'utf8'));
const targets = persons.filter((p) => p.title && p.title.includes('غديه'));
console.log('=== PERSONS.JSON RECORDS ===');
for (const t of targets) {
    console.log(JSON.stringify(t, null, 2));
}
// Check vendor_balances.json
const vbFile = path.join(BALANCES, 'vendor_balances.json');
if (fs.existsSync(vbFile)) {
    const vb = JSON.parse(fs.readFileSync(vbFile, 'utf8'));
    console.log('\n=== VENDOR BALANCES ===');
    console.log('Total vendors:', Array.isArray(vb) ? vb.length : Object.keys(vb).length);
    if (Array.isArray(vb)) {
        const target = vb.find((v) => JSON.stringify(v).includes('غديه'));
        if (target)
            console.log('Found غديه:', JSON.stringify(target, null, 2));
        console.log('Sample record:', JSON.stringify(vb[0], null, 2));
    }
    else {
        console.log(JSON.stringify(vb).slice(0, 500));
    }
}
else {
    console.log('vendor_balances.json NOT FOUND');
}
// Check SafePayment_Details fields
const spd = JSON.parse(fs.readFileSync(path.join(DATA, 'SafePayment_Details.json'), 'utf8'));
console.log('\n=== SAFE PAYMENT DETAIL FIELDS ===');
console.log('Total records:', spd.length);
console.log('Sample:', JSON.stringify(spd[0], null, 2));
const fieldNames = new Set();
for (const r of spd.slice(0, 100)) {
    Object.keys(r).forEach((k) => fieldNames.add(k));
}
console.log('All fields:', [...fieldNames].join(', '));
// Check if SafePayment_Details has any that mention غديه or have VendorID/CustomerID
const spdWithVendor = spd.filter((r) => r.VendorID || r.vendorID || r.CustID || r.custID);
console.log('SafePayment details with VendorID/CustID:', spdWithVendor.length);
// Check customer_Payment_Details fields too
const cpd = JSON.parse(fs.readFileSync(path.join(DATA, 'customer_Payment_Details.json'), 'utf8'));
console.log('\n=== CUSTOMER PAYMENT DETAIL FIELDS ===');
const cpdFields = new Set();
for (const r of cpd.slice(0, 10)) {
    Object.keys(r).forEach((k) => cpdFields.add(k));
}
console.log('Fields:', [...cpdFields].join(', '));
console.log('Sample:', JSON.stringify(cpd[0], null, 2));
// Check VendorPayment_Details - look for person ID of غديه
const personId = targets.length > 0 ? (_a = targets.find((t) => t.title.includes('ارت'))) === null || _a === void 0 ? void 0 : _a.ID : null;
console.log('\n=== LOOKING FOR PERSON ID:', personId, '===');
if (personId) {
    const vpd = JSON.parse(fs.readFileSync(path.join(DATA, 'VendorPayment_Details.json'), 'utf8'));
    const vendorPayments = vpd.filter((r) => r.VendorID === personId);
    console.log(`VendorPayment_Details for ID ${personId}: ${vendorPayments.length} records`);
    let totalVP = 0;
    for (const vp of vendorPayments) {
        totalVP += Number(vp.Value || 0);
        console.log(`  Value: ${vp.Value}, Notes: ${vp.Notes || ''}`);
    }
    console.log('Total vendor payments:', totalVP);
    // Also check if this person appears in customer payments
    const custPayments = cpd.filter((r) => r.CustID === personId);
    console.log(`customer_Payment_Details for ID ${personId}: ${custPayments.length} records`);
    // Check SafePayment_Details for this person
    const safeForPerson = spd.filter((r) => r.VendorID === personId || r.CustID === personId || r.PersonID === personId);
    console.log(`SafePayment_Details for ID ${personId}: ${safeForPerson.length} records`);
    // Check BuyInvoice totals for this person
    const buyInv = JSON.parse(fs.readFileSync(path.join(DATA, 'BuyInvoice.json'), 'utf8'));
    const buyForPerson = buyInv.filter((inv) => inv.VendorID === personId);
    let totalBuy = 0;
    for (const inv of buyForPerson)
        totalBuy += Number(inv.InvNet || inv.invNet || 0);
    console.log(`\nBuyInvoice totals for ID ${personId}: ${totalBuy} (${buyForPerson.length} invoices)`);
    // Check BuyBackInvoice totals
    const buyBack = JSON.parse(fs.readFileSync(path.join(DATA, 'BuyBackInvoice.json'), 'utf8'));
    const buyBackForPerson = buyBack.filter((inv) => inv.VendorID === personId);
    let totalBuyBack = 0;
    for (const inv of buyBackForPerson)
        totalBuyBack += Number(inv.InvNet || inv.invNet || 0);
    console.log(`BuyBackInvoice totals for ID ${personId}: ${totalBuyBack} (${buyBackForPerson.length} invoices)`);
    // Find the person's startBalance
    const person = targets.find((t) => t.ID === personId);
    const startBal = (person === null || person === void 0 ? void 0 : person.startBalance) || 0;
    console.log(`\n=== BALANCE CALC ===`);
    console.log(`startBalance: ${startBal}`);
    console.log(`+ purchases: ${totalBuy}`);
    console.log(`- returns: ${totalBuyBack}`);
    console.log(`- vendor payments: ${totalVP}`);
    console.log(`= ${startBal + totalBuy - totalBuyBack - totalVP}`);
}
