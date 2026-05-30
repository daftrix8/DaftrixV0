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
const db_1 = require("./db");
function fixAndVerify() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('--- FIXING SCHEMA & VERIFYING TARGETS ---');
            // 1. Fix Schema: Allow vehicleId to be NULL
            try {
                console.log('Altering vehicle_targets to allow NULL vehicleId...');
                yield db_1.pool.query(`ALTER TABLE vehicle_targets MODIFY COLUMN vehicleId VARCHAR(36) NULL`);
                console.log('✅ Schema updated.');
            }
            catch (e) {
                console.log('⚠️ Schema update note:', e.message);
            }
            // 2. Clear existing targets (since they might be corrupt or invisible)
            // Actually, let's keep them if they exist.
            // 3. Find Salesman
            const [salesmen] = yield db_1.pool.query(`SELECT * FROM salesmen WHERE name LIKE '%Salameh%' OR name LIKE '%سلامه%'`);
            if (salesmen.length === 0) {
                console.error('❌ Salesman not found');
                process.exit(1);
            }
            const salesman = salesmen[0];
            console.log(`Using Salesman: ${salesman.name} (ID: ${salesman.id})`);
            // 4. Create a Test Target programmatically
            console.log('Creating Test Target (Jan-Mar 2026)...');
            const targetId = 'test-target-' + Date.now();
            yield db_1.pool.query(`
            INSERT INTO vehicle_targets (
                id, vehicleId, salesmanId, targetType, periodType, 
                targetValue, periodStart, periodEnd, achievedValue, isActive, notes
            ) VALUES (?, NULL, ?, 'SALES_AMOUNT', 'MONTHLY', 
                      15000, '2026-01-01', '2026-03-31', 0, 1, 'Auto-generated Test Target')
        `, [targetId, salesman.id]);
            console.log('✅ Test Target Created.');
            // 5. Run the Calculation Logic (Simulate the Controller)
            console.log('Running Calculation...');
            const [rows] = yield db_1.pool.query(`
            SELECT vt.*,
                CASE 
                    WHEN vt.salesmanId IS NOT NULL AND vt.targetType = 'SALES_AMOUNT' THEN (
                        SELECT COALESCE(SUM(total), 0) FROM invoices 
                        WHERE salesmanId = vt.salesmanId 
                        AND status = 'POSTED'
                        AND date BETWEEN vt.periodStart AND vt.periodEnd
                    )
                    ELSE vt.achievedValue
                END as calculatedAchieved
            FROM vehicle_targets vt
            WHERE vt.id = ?
        `, [targetId]);
            console.log('Result:', JSON.stringify(rows, null, 2));
        }
        catch (error) {
            console.error('Error:', error);
        }
        finally {
            process.exit();
        }
    });
}
fixAndVerify();
