"use strict";
/**
 * Fix Duplicate Invoice Numbers Script
 * This script identifies and fixes duplicate invoice numbers in the database
 * by assigning unique sequential numbers to invoices that have conflicting numbers.
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
function fixDuplicateInvoiceNumbers() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log('🔍 Scanning for duplicate invoice numbers...\n');
        const conn = yield db_1.pool.getConnection();
        try {
            // Find duplicate numbers grouped by type
            const [duplicates] = yield conn.query(`
            SELECT number, type, COUNT(*) as count, GROUP_CONCAT(id) as ids
            FROM invoices
            WHERE number IS NOT NULL AND number != ''
            GROUP BY number, type
            HAVING COUNT(*) > 1
            ORDER BY type, number
        `);
            const duplicateGroups = duplicates;
            if (duplicateGroups.length === 0) {
                console.log('✅ No duplicate invoice numbers found!');
                return;
            }
            console.log(`⚠️  Found ${duplicateGroups.length} groups with duplicate numbers:\n`);
            for (const group of duplicateGroups) {
                console.log(`  - ${group.number} (${group.type}): ${group.count} duplicates`);
            }
            console.log('\n🔧 Fixing duplicates...\n');
            // Process each type separately to maintain correct sequence
            const typeGroups = new Map();
            for (const group of duplicateGroups) {
                if (!typeGroups.has(group.type)) {
                    typeGroups.set(group.type, []);
                }
                typeGroups.get(group.type).push(group);
            }
            // Prefix map for each type
            const prefixMap = {
                'INVOICE_SALE': 'INV-',
                'INVOICE_PURCHASE': 'PUR-',
                'RETURN_SALE': 'RET-S-',
                'RETURN_PURCHASE': 'RET-P-',
                'RECEIPT': 'REC-',
                'PAYMENT': 'PAY-',
                'QUOTATION': 'QUO-',
            };
            let totalFixed = 0;
            for (const [type, groups] of typeGroups) {
                const prefix = prefixMap[type] || 'TRX-';
                // Get the current max number for this type (excluding duplicates)
                const [maxResult] = yield conn.query(`SELECT MAX(CAST(SUBSTRING(number, ?) AS UNSIGNED)) as maxNum 
                 FROM invoices 
                 WHERE type = ? AND number REGEXP ?`, [prefix.length + 1, type, `^${prefix.replace(/-/g, '\\\\-')}[0-9]+$`]);
                let nextNum = (((_a = maxResult[0]) === null || _a === void 0 ? void 0 : _a.maxNum) || 0) + 1;
                for (const group of groups) {
                    const ids = group.ids.split(',');
                    // Keep the first one, reassign the rest
                    for (let i = 1; i < ids.length; i++) {
                        const newNumber = `${prefix}${String(nextNum).padStart(5, '0')}`;
                        yield conn.query('UPDATE invoices SET number = ? WHERE id = ?', [newNumber, ids[i]]);
                        console.log(`  ✅ Fixed: ${group.number} -> ${newNumber} (ID: ${ids[i].substring(0, 8)}...)`);
                        nextNum++;
                        totalFixed++;
                    }
                }
            }
            console.log(`\n🎉 Fixed ${totalFixed} duplicate invoice numbers!`);
            // Also fix invoices with NULL or empty numbers
            const [nullNumbers] = yield conn.query(`
            SELECT id, type, date FROM invoices 
            WHERE number IS NULL OR number = ''
            ORDER BY type, date
        `);
            const nullInvoices = nullNumbers;
            if (nullInvoices.length > 0) {
                console.log(`\n🔧 Also fixing ${nullInvoices.length} invoices with missing numbers...\n`);
                // Group by type
                const nullByType = new Map();
                for (const inv of nullInvoices) {
                    if (!nullByType.has(inv.type)) {
                        nullByType.set(inv.type, []);
                    }
                    nullByType.get(inv.type).push(inv);
                }
                let nullFixed = 0;
                for (const [type, invoices] of nullByType) {
                    const prefix = prefixMap[type] || 'TRX-';
                    // Get the current max number for this type
                    const [maxResult] = yield conn.query(`SELECT MAX(CAST(SUBSTRING(number, ?) AS UNSIGNED)) as maxNum 
                     FROM invoices 
                     WHERE type = ? AND number REGEXP ?`, [prefix.length + 1, type, `^${prefix.replace(/-/g, '\\\\-')}[0-9]+$`]);
                    let nextNum = (((_b = maxResult[0]) === null || _b === void 0 ? void 0 : _b.maxNum) || 0) + 1;
                    for (const inv of invoices) {
                        const newNumber = `${prefix}${String(nextNum).padStart(5, '0')}`;
                        yield conn.query('UPDATE invoices SET number = ? WHERE id = ?', [newNumber, inv.id]);
                        console.log(`  ✅ Assigned: ${newNumber} (ID: ${inv.id.substring(0, 8)}...)`);
                        nextNum++;
                        nullFixed++;
                    }
                }
                console.log(`\n🎉 Assigned numbers to ${nullFixed} invoices!`);
            }
            console.log('\n✨ All invoice numbers are now unique!');
        }
        catch (error) {
            console.error('❌ Error fixing duplicate invoice numbers:', error);
            throw error;
        }
        finally {
            conn.release();
            yield db_1.pool.end();
        }
    });
}
// Run the script
fixDuplicateInvoiceNumbers().catch(console.error);
