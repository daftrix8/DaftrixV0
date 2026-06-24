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
const fs = __importStar(require("fs"));
function restoreFromLog() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Restoring zeroed totals from zeroed.txt log...");
        const conn = yield (0, db_1.getConnection)();
        try {
            const text = fs.readFileSync('zeroed.txt', 'utf16le'); // or utf8 depending on powershell
            // Find all lines
            const lines = text.split('\n');
            let updatedCount = 0;
            for (const line of lines) {
                // Fixing Invoice OLD-VP-DEBIT-854077-874965 - Old Total: 1100000, New Total: 0
                const match = line.match(/Fixing Invoice (OLD-[^\s]+) - Old Total: ([\d\.]+), New Total: 0/);
                if (match) {
                    const number = match[1];
                    const oldTotal = parseFloat(match[2]);
                    if (!isNaN(oldTotal) && oldTotal > 0) {
                        yield conn.query(`UPDATE invoices SET total = ? WHERE number = ?`, [oldTotal, number]);
                        console.log(`Restored ${number} to ${oldTotal}`);
                        updatedCount++;
                    }
                }
            }
            console.log(`Successfully restored ${updatedCount} records from log.`);
        }
        catch (e) {
            // try utf8
            try {
                const text = fs.readFileSync('zeroed.txt', 'utf8'); // or utf8 depending on powershell
                const lines = text.split('\n');
                let updatedCount = 0;
                for (const line of lines) {
                    const match = line.match(/Fixing Invoice (OLD-[^\s]+) - Old Total: ([\d\.]+), New Total: 0/);
                    if (match) {
                        const number = match[1];
                        const oldTotal = parseFloat(match[2]);
                        if (!isNaN(oldTotal) && oldTotal > 0) {
                            yield conn.query(`UPDATE invoices SET total = ? WHERE number = ?`, [oldTotal, number]);
                            console.log(`Restored ${number} to ${oldTotal}`);
                            updatedCount++;
                        }
                    }
                }
                console.log(`Successfully restored ${updatedCount} records from log.`);
            }
            catch (e2) {
                console.error("Error:", e2);
            }
        }
        finally {
            conn.release();
            process.exit(0);
        }
    });
}
restoreFromLog();
