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
function debugTargetsData() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('--- INSPECTING VEHICLE_TARGETS TABLE ---');
            const [targets] = yield db_1.pool.query(`SELECT * FROM vehicle_targets`);
            console.log('Row count:', targets.length);
            console.log(JSON.stringify(targets, null, 2));
        }
        catch (error) {
            console.error('Error:', error);
        }
        finally {
            process.exit();
        }
    });
}
debugTargetsData();
