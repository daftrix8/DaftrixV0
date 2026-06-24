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
const DATA_DIR = process.env.MIGRATION_DATA_DIR || path.resolve(__dirname, '../../mall stuff/data');
function loadJson(f) { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); }
const headers = loadJson('BuyInvoice.json').filter((h) => h.VendorID === 201900);
const details = loadJson('BuyInvoice_Details.json');
const detByMaster = new Map();
for (const d of details) {
    const m = d.masterID || d.MasterID;
    if (!detByMaster.has(m))
        detByMaster.set(m, []);
    detByMaster.get(m).push(d);
}
let totalInvAdds = 0;
let totalSaleTax = 0;
let totalTradeTax = 0;
let totalShipping = 0;
let totalLineDiscount = 0;
let totalLineTotals = 0;
for (const h of headers) {
    totalInvAdds += Number(h.invAdds || 0);
    totalSaleTax += Number(h.saleTax || 0);
    totalTradeTax += Number(h.tradeTax || 0);
    totalShipping += Number(h.Shipping_Total || 0);
    const dets = detByMaster.get(h.ID) || [];
    for (const d of dets) {
        totalLineDiscount += Number(d.discount || d.Discount || 0);
        totalLineTotals += Number(d.total || d.Total || 0);
    }
}
console.log('═══ Hidden Fields Check (vendor 201900) ═══\n');
console.log(`  invAdds total: ${totalInvAdds}`);
console.log(`  saleTax total: ${totalSaleTax}`);
console.log(`  tradeTax total: ${totalTradeTax}`);
console.log(`  Shipping_Total: ${totalShipping}`);
console.log(`  Line-level discounts: ${totalLineDiscount}`);
console.log(`  Line-level totals (stored): ${totalLineTotals}`);
console.log(`\n  Gap to explain: 7,420.10`);
console.log(`  invAdds matches gap? ${Math.abs(totalInvAdds - 7420.10) < 1 ? 'YES ✅' : 'NO'}`);
// Check all invoices globally for invAdds
const allHeaders = loadJson('BuyInvoice.json');
const globalAdds = allHeaders.reduce((s, h) => s + Number(h.invAdds || 0), 0);
console.log(`\n  Global invAdds (all buy invoices): ${globalAdds.toLocaleString()}`);
