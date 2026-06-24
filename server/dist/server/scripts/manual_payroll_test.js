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
const hrController = __importStar(require("../controllers/hrController"));
// Mock Express Request/Response
const mockReq = (body = {}, params = {}, query = {}) => ({
    body,
    params,
    query,
    user: { id: 'test-admin', role: 'ADMIN' },
    getAction: () => 'TEST'
});
const mockRes = () => {
    const res = {};
    res.body = {};
    res.statusCode = 200;
    res.json = (data) => {
        res.body = data;
        return res;
    };
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    // Mock other methods if needed
    res.send = (data) => { res.body = data; return res; };
    return res;
};
process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
});
function runTest() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🚀 Starting Manual Payroll Test...');
        let employeeId = null;
        let actualPayrollId = null;
        let createdCycleId = null;
        try {
            // Test DB Connection
            console.log('Testing DB Connection...');
            yield db_1.pool.query('SELECT 1');
            console.log('✅ DB Connected');
            // 1. Create Employee
            console.log('\nCreating Employee...');
            const empReq = mockReq({
                fullName: 'Test Employee Standalone',
                nationalId: 'SA-TEST-001',
                baseSalary: 6000,
                status: 'ACTIVE',
                hireDate: '2025-01-01',
                employmentType: 'MONTHLY'
            });
            const empRes = mockRes();
            yield hrController.createEmployee(empReq, empRes);
            console.log(`Status: ${empRes.statusCode}`);
            console.log('Response:', JSON.stringify(empRes.body));
            if (empRes.statusCode !== 201)
                throw new Error(`Failed to create employee: ${JSON.stringify(empRes.body)}`);
            employeeId = empRes.body.id;
            console.log(`✅ Employee Created: ${employeeId}`);
            // 2. Create Payroll Cycle
            console.log('\nCreating Payroll Cycle...');
            const cycleReq = mockReq({
                month: 2,
                year: 2031,
                notes: 'Test Cycle Standalone',
                includeTax: true,
                includeInsurance: true
            });
            const cycleRes = mockRes();
            yield hrController.createPayrollCycle(cycleReq, cycleRes);
            console.log(`Status: ${cycleRes.statusCode}`);
            console.log('Response:', JSON.stringify(cycleRes.body));
            if (cycleRes.statusCode === 201) {
                createdCycleId = cycleRes.body.id;
                actualPayrollId = createdCycleId;
                console.log(`✅ Cycle Created: ${actualPayrollId}`);
            }
            else if (cycleRes.statusCode === 400 && cycleRes.body.error === 'Payroll cycle for this month already exists') {
                console.log('⚠️ Cycle already exists, fetching it...');
                const cyclesReq = mockReq();
                const cyclesRes = mockRes();
                yield hrController.getPayrollCycles(cyclesReq, cyclesRes);
                const cycle = cyclesRes.body.find((c) => c.month === 2 && c.year === 2031);
                if (cycle) {
                    actualPayrollId = cycle.id;
                    console.log(`✅ Using existing cycle: ${actualPayrollId}`);
                }
                else {
                    throw new Error('Could not find existing cycle');
                }
            }
            else {
                throw new Error(`Failed to create cycle: ${JSON.stringify(cycleRes.body)}`);
            }
            if (!actualPayrollId)
                throw new Error('No Payroll ID');
            // 3. Calculate Payroll
            console.log('\nCalculating Payroll...');
            const calcReq = mockReq({}, { id: actualPayrollId });
            const calcRes = mockRes();
            yield hrController.calculatePayroll(calcReq, calcRes);
            console.log(`Status: ${calcRes.statusCode}`);
            console.log('Response:', JSON.stringify(calcRes.body));
            if (calcRes.statusCode !== 200)
                throw new Error(`Calculation failed: ${JSON.stringify(calcRes.body)}`);
            console.log('✅ Payroll Calculated');
            // 4. Verify Entries
            console.log('\nVerifying Entries...');
            const entReq = mockReq({}, { payrollId: actualPayrollId });
            const entRes = mockRes();
            yield hrController.getPayrollEntries(entReq, entRes);
            const myEntry = entRes.body.find((e) => e.employeeId === employeeId);
            if (myEntry) {
                console.log('✅ Payroll Entry Found!');
                console.log(`Gross: ${myEntry.grossSalary}`);
                console.log(`Net: ${myEntry.netSalary}`);
                console.log(`Tax: ${myEntry.incomeTax}`);
                console.log(`Insurance: ${myEntry.socialInsurance}`);
                if (Number(myEntry.netSalary) < Number(myEntry.grossSalary)) {
                    console.log('✅ PASS: Deductions applied');
                }
                else {
                    console.log('⚠️ WARNING: No deductions applied (Check tax/insurance config)');
                }
            }
            else {
                console.log('❌ FAIL: Entry NOT found for employee');
            }
        }
        catch (e) {
            console.error('❌ Test Failed with Exception:', e);
        }
        finally {
            // Cleanup
            console.log('\nCleaning up...');
            try {
                if (employeeId)
                    yield db_1.pool.query('DELETE FROM employees WHERE id = ?', [employeeId]);
                if (actualPayrollId) {
                    yield db_1.pool.query('DELETE FROM payroll_entries WHERE payrollId = ?', [actualPayrollId]);
                    yield db_1.pool.query('DELETE FROM payroll_cycles WHERE id = ?', [actualPayrollId]);
                }
                console.log('✅ Cleanup Complete');
            }
            catch (cleanupErr) {
                console.error('Cleanup Error:', cleanupErr);
            }
            yield db_1.pool.end();
            process.exit(0);
        }
    });
}
runTest();
