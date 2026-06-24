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
const db_1 = require("../db");
function fixLegacyInvoices() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Starting to fix legacy invoices...");
        const conn = yield (0, db_1.getConnection)();
        try {
            const [invoices] = yield conn.query(`
            SELECT * FROM invoices 
            WHERE number LIKE 'OLD-%' 
            AND type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE')
        `);
            console.log(`Found ${invoices.length} legacy invoices to check.`);
            let updatedCount = 0;
            for (const invoice of invoices) {
                const [lines] = yield conn.query(`SELECT * FROM invoice_lines WHERE invoiceId = ?`, [invoice.id]);
                const subTotal = lines.reduce((sum, line) => sum + (Number(line.total) || 0), 0);
                const isMigrated = !invoice.globalDiscountValue || Number(invoice.globalDiscountValue) === 0;
                let totalDiscount = 0;
                if (invoice.globalDiscountType === 'PERCENT') {
                    const val = Number(invoice.globalDiscountValue);
                    const discountField = Number(invoice.globalDiscount);
                    if (discountField > 0 && val > 0 && Math.abs(discountField - val) < 0.001 && val < 100) {
                        totalDiscount = subTotal * (val / 100);
                    }
                    else if (isMigrated && discountField > 0 && discountField <= 100) {
                        totalDiscount = subTotal * (discountField / 100);
                    }
                    else if (val > 0) {
                        totalDiscount = subTotal * (val / 100);
                    }
                }
                else if (invoice.globalDiscountType === 'FIXED') {
                    const val = Number(invoice.globalDiscountValue);
                    const discountField = Number(invoice.globalDiscount);
                    if (discountField > 0 && val > 0 && Math.abs(discountField - val) < 0.001) {
                        totalDiscount = discountField;
                    }
                    else if (isMigrated && discountField > 0) {
                        totalDiscount = discountField;
                    }
                    else if (val > 0) {
                        totalDiscount = val;
                    }
                }
                totalDiscount = Math.round(totalDiscount * 100) / 100;
                // Fix: the true calculated net should be subtotal - discount + shippingFee
                const calculatedNet = subTotal - totalDiscount + (Number(invoice.shippingFee) || 0);
                if (Math.abs(Number(invoice.total) - calculatedNet) > 0.01) {
                    const correctTotal = Math.round(calculatedNet * 100) / 100;
                    console.log(`Fixing Invoice ${invoice.number} - Old Total: ${invoice.total}, New Total: ${correctTotal}`);
                    yield conn.query(`UPDATE invoices SET total = ? WHERE id = ?`, [correctTotal, invoice.id]);
                    updatedCount++;
                }
            }
            console.log(`Finished fixing legacy invoices. Updated ${updatedCount} records.`);
        }
        catch (e) {
            console.error("Error fixing invoices:", e);
        }
        finally {
            conn.release();
            process.exit(0);
        }
    });
}
fixLegacyInvoices();
