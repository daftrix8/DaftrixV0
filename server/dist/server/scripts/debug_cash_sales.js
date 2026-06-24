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
function debugCashSales() {
    return __awaiter(this, void 0, void 0, function* () {
        const vehicleId = '723677c3-21aa-4989-9fa1-fcb251631590';
        const date = '2026-01-29';
        console.log(`\n📊 Debugging cash sales for vehicle ${vehicleId} on ${date}\n`);
        // Get all SALE visits
        const [visits] = yield db_1.pool.query(`
        SELECT 
            customerId as partnerId,
            (SELECT name FROM partners WHERE id = v.customerId) as partnerName,
            result,
            invoiceAmount,
            paymentCollected,
            debtCollected,
            i.paymentMethod,
            LEAST(COALESCE(paymentCollected, 0), COALESCE(invoiceAmount, 0)) as cashSalesRaw,
            CASE 
                WHEN i.paymentMethod = 'CASH' OR i.paymentMethod IS NULL 
                THEN LEAST(COALESCE(paymentCollected, 0), COALESCE(invoiceAmount, 0))
                ELSE 0
            END as cashSalesFixed
        FROM vehicle_customer_visits v
        LEFT JOIN invoices i ON v.invoiceId = i.id
        WHERE v.vehicleId = ? 
        AND DATE(v.visitDate) = ? 
        AND result = 'SALE'
    `, [vehicleId, date]);
        console.log('Individual Visits:');
        console.log('='.repeat(80));
        let totalInvoice = 0;
        let totalPayment = 0;
        let cashSalesFixed = 0;
        let extraCollected = 0;
        for (const v of visits) {
            console.log(`Partner: ${v.partnerName}`);
            console.log(`  Invoice Amount: ${v.invoiceAmount}`);
            console.log(`  Payment Collected: ${v.paymentCollected}`);
            console.log(`  Cash Sales (fixed): ${v.cashSalesFixed}`);
            console.log(`  Extra Collected (debt): ${v.extraCollected}`);
            console.log('');
            totalInvoice += Number(v.invoiceAmount || 0);
            totalPayment += Number(v.paymentCollected || 0);
            cashSalesFixed += Number(v.cashSalesFixed || 0);
            extraCollected += Number(v.extraCollected || 0);
        }
        console.log('='.repeat(80));
        console.log('\n📈 TOTALS:');
        console.log(`Total Invoice Amount (Sales): ${totalInvoice}`);
        console.log(`Total Payment Collected (OLD cashSales): ${totalPayment}`);
        console.log(`Fixed Cash Sales (capped at invoice): ${cashSalesFixed}`);
        console.log(`Extra Collected (debt from overpayment): ${extraCollected}`);
        console.log(`Credit Sales (invoice - cashSales): ${totalInvoice - cashSalesFixed}`);
        console.log('\n📱 EXPECTED (matching mobile):');
        console.log(`Cash Sales: 3,160`);
        console.log(`Credit Sales: 15,255`);
        yield db_1.pool.end();
    });
}
debugCashSales().catch(console.error);
