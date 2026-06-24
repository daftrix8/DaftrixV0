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
// Check BuyInvoice_Details structure and IDs
const buyDet = JSON.parse(fs.readFileSync(path.join(DATA, 'BuyInvoice_Details.json'), 'utf8'));
console.log('=== BuyInvoice_Details ===');
console.log('Total records:', buyDet.length);
console.log('Sample:', JSON.stringify(buyDet[0], null, 2));
// Get all unique MasterIDs from details
const detailMasterIds = new Set(buyDet.map((d) => d.MasterID));
console.log('Unique MasterIDs in details:', detailMasterIds.size);
// Get the range of MasterIDs
const masterIdArray = [...detailMasterIds].map(Number).sort((a, b) => a - b);
console.log('MasterID range:', masterIdArray[0], '-', masterIdArray[masterIdArray.length - 1]);
// Get all IDs from BuyInvoice headers
const buyInv = JSON.parse(fs.readFileSync(path.join(DATA, 'BuyInvoice.json'), 'utf8'));
const headerIds = new Set(buyInv.map((inv) => inv.ID));
console.log('\nHeaderIDs count:', headerIds.size);
const headerIdArray = [...headerIds].map(Number).sort((a, b) => a - b);
console.log('HeaderID range:', headerIdArray[0], '-', headerIdArray[headerIdArray.length - 1]);
// Check overlap
let matched = 0;
let unmatched = 0;
for (const mid of detailMasterIds) {
    if (headerIds.has(mid))
        matched++;
    else
        unmatched++;
}
console.log(`\nMasterIDs matching headers: ${matched}`);
console.log(`MasterIDs NOT matching headers: ${unmatched}`);
// Check if details use invNum instead of ID
const headerByInvNum = new Map(buyInv.map((inv) => [inv.invNum, inv]));
let matchedByInvNum = 0;
for (const mid of detailMasterIds) {
    if (headerByInvNum.has(mid))
        matchedByInvNum++;
}
console.log(`MasterIDs matching invNum: ${matchedByInvNum}`);
// Try matching detail's InvID if it exists  
const detailFields = new Set();
for (const d of buyDet.slice(0, 100)) {
    Object.keys(d).forEach(k => detailFields.add(k));
}
console.log('\nDetail fields:', [...detailFields].join(', '));
// Check sellInvoice_Details for comparison
const sellDet = JSON.parse(fs.readFileSync(path.join(DATA, 'sellInvoice_Details.json'), 'utf8'));
console.log('\n=== sellInvoice_Details ===');
console.log('Total records:', sellDet.length);
console.log('Sample:', JSON.stringify(sellDet[0], null, 2));
const sellDetFields = new Set();
for (const d of sellDet.slice(0, 100)) {
    Object.keys(d).forEach(k => sellDetFields.add(k));
}
console.log('Detail fields:', [...sellDetFields].join(', '));
// How many sell invoice details match their headers?
const sellInv = JSON.parse(fs.readFileSync(path.join(DATA, 'sellInvoice.json'), 'utf8'));
const sellHeaderIds = new Set(sellInv.map((inv) => inv.ID));
const sellDetailMasterIds = new Set(sellDet.map((d) => d.MasterID || d.InvID));
let sellMatched = 0;
for (const mid of sellDetailMasterIds) {
    if (sellHeaderIds.has(mid))
        sellMatched++;
}
console.log(`Sell detail MasterIDs matching headers: ${sellMatched} of ${sellDetailMasterIds.size}`);
// Check what join field the BuyInvoice_Details uses - maybe it's InvID or something else
console.log('\n=== BuyInvoice_Details first 5 records ===');
for (const d of buyDet.slice(0, 5)) {
    console.log(`  MasterID: ${d.MasterID}, ItemID: ${d.ItemID}, price: ${d.price}, quan: ${d.quan}, total: ${d.total}`);
}
// Sample BuyInvoice header IDs
console.log('\n=== BuyInvoice first 5 IDs ===');
for (const inv of buyInv.slice(0, 5)) {
    console.log(`  ID: ${inv.ID}, invNum: ${inv.invNum}, VendorID: ${inv.VendorID}`);
}
