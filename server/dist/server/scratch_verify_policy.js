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
const policyEnforcement_1 = require("./utils/policyEnforcement");
console.log("Resolved path:", require.resolve('./utils/policyEnforcement'));
// Mock Config
const mockConfig = {
    enableModifyOthersData: false,
    whoCanModifyOthersData: []
};
function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
    console.log(`PASS: ${message}`);
}
function runTests() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Starting policy validation tests...");
        // Test case 1: Exact match
        const result1 = (0, policyEnforcement_1.validateModifyOthersData)("Alf Maskan POS", "Alf Maskan POS", "CASHIER", mockConfig);
        assert(result1.valid === true, "Exact match should be valid");
        // Test case 2: Casing mismatch
        const result2 = (0, policyEnforcement_1.validateModifyOthersData)("alf maskan pos", "Alf Maskan POS", "CASHIER", mockConfig);
        console.log("result2:", result2);
        assert(result2.valid === true, "Case-insensitive match should be valid");
        // Test case 3: Double space mismatch
        const result3 = (0, policyEnforcement_1.validateModifyOthersData)("Alf Maskan  POS", "Alf Maskan POS", "CASHIER", mockConfig);
        assert(result3.valid === true, "Whitespace-collapsed match should be valid");
        // Test case 4: Username vs Name match (using pipe split)
        const result4 = (0, policyEnforcement_1.validateModifyOthersData)("احمد هنيدى", "ABOHAMZA|احمد هنيدى", "CASHIER", mockConfig);
        assert(result4.valid === true, "Pipe split name match should be valid");
        const result5 = (0, policyEnforcement_1.validateModifyOthersData)("ABOHAMZA", "ABOHAMZA|احمد هنيدى", "CASHIER", mockConfig);
        assert(result5.valid === true, "Pipe split username match should be valid");
        // Test case 5: Different user, not allowed
        const result6 = (0, policyEnforcement_1.validateModifyOthersData)("SomeoneElse", "ABOHAMZA|احمد هنيدى", "CASHIER", mockConfig);
        assert(result6.valid === false, "Different user should be invalid");
        // Test case 6: Admin override check
        const result7 = (0, policyEnforcement_1.validateModifyOthersData)("SomeoneElse", "ABOHAMZA", "ADMIN", mockConfig);
        assert(result7.valid === true, "Admin role override should be valid");
        console.log("All policy validation tests passed successfully!");
    });
}
runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
