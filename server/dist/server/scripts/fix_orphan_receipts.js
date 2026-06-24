"use strict";
/**
 * Fix script to update orphaned سند قبض records with correct salesmanId
 * Run with: npx ts-node scripts/fix_orphan_receipts.ts
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
function fixOrphanReceipts() {
    return __awaiter(this, void 0, void 0, function* () {
        const correctSalesmanId = '68c94c8b-812b-4356-bdbc-b808841fa8ce'; // محمد عامر عطيه سعيد
        const wrongSalesmanId = '84cf1443-6ca0-4857-ac82-6d607f5b6293'; // Non-existent salesman
        console.log('='.repeat(60));
        console.log('🔧 Fixing Orphan Receipt Records');
        console.log('='.repeat(60));
        // First, show what we're about to update
        const [toUpdate] = yield db_1.pool.query(`
        SELECT id, number, total, partnerId, date
        FROM invoices 
        WHERE salesmanId = ? AND type = 'RECEIPT'
    `, [wrongSalesmanId]);
        console.log(`\nFound ${toUpdate.length} receipts to fix:`);
        for (const r of toUpdate) {
            console.log(`  - ${r.number || 'NULL'}: ${r.total}`);
        }
        if (toUpdate.length === 0) {
            console.log('No orphan receipts found. Nothing to fix.');
            yield db_1.pool.end();
            return;
        }
        // Update them
        const [result] = yield db_1.pool.query(`
        UPDATE invoices 
        SET salesmanId = ? 
        WHERE salesmanId = ? AND type = 'RECEIPT'
    `, [correctSalesmanId, wrongSalesmanId]);
        console.log(`\n✅ Updated ${result.affectedRows} invoices`);
        console.log(`   Changed salesmanId from ${wrongSalesmanId} to ${correctSalesmanId}`);
        yield db_1.pool.end();
        console.log('\nDone!');
    });
}
fixOrphanReceipts().catch(console.error);
