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
const vehicleController_1 = require("../controllers/vehicleController");
const db_1 = require("../db");
const req = {
    query: {
        vehicleId: '723677c3-21aa-4989-9fa1-fcb251631590',
        date: '2026-01-29'
    }
};
const res = {
    json: (data) => {
        console.log('✅ Controller Response:');
        console.log(JSON.stringify(data, null, 2));
    },
    status: (code) => {
        console.log(`⚠️ Status Code: ${code}`);
        return {
            json: (data) => console.log('Error Response:', data),
            send: (msg) => console.log('Error Send:', msg)
        };
    }
};
console.log('🚀 Testing getDailyReport controller logic...');
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, vehicleController_1.getDailyReport)(req, res);
    }
    catch (e) {
        console.error('❌ Error executing controller:', e);
    }
    finally {
        yield db_1.pool.end();
    }
}))();
