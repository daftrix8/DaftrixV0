"use strict";
/**
 * Debug script to check treasury receipts (سند قبض) for a salesman
 * Run with: npx ts-node scripts/debug_treasury_receipts.ts
 */
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
function debugTreasuryReceipts() {
    return __awaiter(this, void 0, void 0, function* () {
        const vehicleId = '723677c3-21aa-4989-9fa1-fcb251631590'; // Replace with actual vehicle ID
        const reportDate = '2026-01-29';
        console.log('='.repeat(80));
        console.log('🔍 Debugging Treasury Receipts for Settlement');
        console.log('='.repeat(80));
        // Get vehicle salesman
        const [vehicle] = yield db_1.pool.query(`
        SELECT v.id, v.plateNumber, v.salesmanId, s.name as salesmanName
        FROM vehicles v
        LEFT JOIN salesmen s ON v.salesmanId = s.id
        WHERE v.id = ?
    `, [vehicleId]);
        if (vehicle.length === 0) {
            console.log('❌ Vehicle not found');
            process.exit(1);
        }
        const salesmanId = vehicle[0].salesmanId;
        console.log(`\n📋 Vehicle: ${vehicle[0].plateNumber}`);
        console.log(`👤 Salesman: ${vehicle[0].salesmanName} (${salesmanId})`);
        console.log(`📅 Date: ${reportDate}`);
        // Query 1: All RECEIPT type invoices for this date (regardless of salesman)
        console.log('\n' + '='.repeat(80));
        console.log('📊 ALL RECEIPT type invoices for this date:');
        console.log('='.repeat(80));
        const [allReceipts] = yield db_1.pool.query(`
        SELECT 
            i.id, i.number, i.total, i.date, i.createdAt, 
            i.salesmanId, s.name as salesmanName,
            i.partnerId, p.name as partnerName,
            i.status, i.paymentMethod, i.createdBy
        FROM invoices i
        LEFT JOIN salesmen s ON i.salesmanId = s.id
        LEFT JOIN partners p ON i.partnerId = p.id
        WHERE DATE(i.date) = ? AND i.type = 'RECEIPT'
        ORDER BY i.createdAt DESC
    `, [reportDate]);
        console.log(`Found ${allReceipts.length} RECEIPT invoices:\n`);
        for (const r of allReceipts) {
            const matchesSalesman = r.salesmanId === salesmanId ? '✅' : '❌';
            console.log(`${matchesSalesman} #${r.number} | ${r.total.toLocaleString()} | ${r.partnerName || 'N/A'}`);
            console.log(`   SalesmanId: ${r.salesmanId || 'NULL'} (${r.salesmanName || 'N/A'})`);
            console.log(`   Status: ${r.status} | PaymentMethod: ${r.paymentMethod || 'N/A'}`);
            console.log(`   Created: ${r.createdAt}`);
            console.log('');
        }
        // Query 2: Receipts matching our salesman
        console.log('\n' + '='.repeat(80));
        console.log('📊 RECEIPT invoices matching our salesman:');
        console.log('='.repeat(80));
        const [matchingReceipts] = yield db_1.pool.query(`
        SELECT id, number, total, status
        FROM invoices 
        WHERE salesmanId = ? AND DATE(date) = ? AND type = 'RECEIPT' AND status = 'POSTED'
    `, [salesmanId, reportDate]);
        let total = 0;
        for (const r of matchingReceipts) {
            console.log(`✅ #${r.number}: ${r.total}`);
            total += Number(r.total);
        }
        console.log(`\nTotal: ${total}`);
        // Query 3: Check vehicle_customer_visits for this vehicle
        console.log('\n' + '='.repeat(80));
        console.log('📊 Vehicle Customer Visits payments:');
        console.log('='.repeat(80));
        const [visits] = yield db_1.pool.query(`
        SELECT 
            v.id, v.visitDate, v.result,
            v.invoiceAmount, v.paymentCollected, v.debtCollected,
            p.name as partnerName
        FROM vehicle_customer_visits v
        LEFT JOIN partners p ON v.partnerId = p.id
        WHERE v.vehicleId = ? AND DATE(v.visitDate) = ?
        ORDER BY v.visitDate DESC
    `, [vehicleId, reportDate]);
        let visitPayments = 0;
        let visitDebt = 0;
        for (const v of visits) {
            console.log(`${v.result}: ${v.partnerName}`);
            console.log(`   Invoice: ${v.invoiceAmount || 0} | Payment: ${v.paymentCollected || 0} | Debt: ${v.debtCollected || 0}`);
            visitPayments += Number(v.paymentCollected || 0);
            visitDebt += Number(v.debtCollected || 0);
        }
        console.log(`\nTotal Visit Payments: ${visitPayments}`);
        console.log(`Total Debt Collected: ${visitDebt}`);
        console.log('\n' + '='.repeat(80));
        console.log('📊 SUMMARY');
        console.log('='.repeat(80));
        console.log(`Treasury Receipts (with salesmanId): ${total}`);
        console.log(`Visit Payments: ${visitPayments}`);
        console.log(`Visit Debt Collected: ${visitDebt}`);
        console.log(`Expected Total Collections: ${total + visitPayments + visitDebt}`);
        yield db_1.pool.end();
    });
}
debugTreasuryReceipts().catch(console.error);
