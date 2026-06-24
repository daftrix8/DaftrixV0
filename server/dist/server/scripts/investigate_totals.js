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
const DATA = 'F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/mall stuff/data';
// Check BuyInvoice header for person ID 19
const buyInv = JSON.parse(fs.readFileSync(path.join(DATA, 'BuyInvoice.json'), 'utf8'));
const forPerson = buyInv.filter((inv) => inv.VendorID === 19);
console.log('=== BuyInvoice HEADERS for VendorID=19 ===');
for (const inv of forPerson) {
    console.log(`  ID: ${inv.ID}, InvNet: ${inv.InvNet}, invNet: ${inv.invNet}, Total: ${inv.Total}, total: ${inv.total}`);
    // Show all fields of first one
}
// Show ALL fields of first invoice
if (forPerson.length > 0) {
    console.log('\nFull first invoice record:');
    console.log(JSON.stringify(forPerson[0], null, 2));
}
// Check detail lines for those invoices
const buyDet = JSON.parse(fs.readFileSync(path.join(DATA, 'BuyInvoice_Details.json'), 'utf8'));
const invoiceIds = forPerson.map((inv) => inv.ID);
const detailsForPerson = buyDet.filter((d) => invoiceIds.includes(d.MasterID));
console.log(`\n=== BuyInvoice_Details for VendorID=19 ===`);
console.log(`Total detail lines: ${detailsForPerson.length}`);
// Calculate totals from details
let grandTotal = 0;
for (const invId of invoiceIds) {
    const lines = detailsForPerson.filter((d) => d.MasterID === invId);
    let invTotal = 0;
    for (const l of lines) {
        const lineTotal = Number(l.total || l.Total || (Number(l.price || l.Price) * Number(l.quan || l.Quan)));
        invTotal += lineTotal;
    }
    grandTotal += invTotal;
    console.log(`  Invoice ${invId}: ${lines.length} lines, total from details: ${invTotal}`);
}
console.log(`Grand total from details: ${grandTotal}`);
// Show detail sample
if (detailsForPerson.length > 0) {
    console.log('\nSample detail record:');
    console.log(JSON.stringify(detailsForPerson[0], null, 2));
}
// Now check the invoice totals we stored in DB vs what they should be
console.log('\n=== CRITICAL: Check how many invoices have total=0 ===');
const allBuyInv = buyInv;
const zeroTotal = allBuyInv.filter((inv) => !inv.InvNet && !inv.invNet);
console.log(`BuyInvoice with no InvNet: ${zeroTotal.length} of ${allBuyInv.length}`);
// Check sell invoices too
const sellInv = JSON.parse(fs.readFileSync(path.join(DATA, 'sellInvoice.json'), 'utf8'));
const zeroSell = sellInv.filter((inv) => !inv.InvNet && !inv.invNet);
console.log(`sellInvoice with no InvNet: ${zeroSell.length} of ${sellInv.length}`);
// Check what fields the buy invoice header actually has
const allFields = new Set();
for (const inv of allBuyInv.slice(0, 50)) {
    Object.keys(inv).forEach(k => allFields.add(k));
}
console.log('\nBuyInvoice header fields:', [...allFields].join(', '));
