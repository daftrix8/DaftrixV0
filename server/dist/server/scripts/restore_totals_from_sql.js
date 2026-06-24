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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../db");
const fs = __importStar(require("fs"));
const readline = __importStar(require("readline"));
function restoreTotalsFromSql() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        console.log("Restoring zeroed totals from backup...");
        const conn = yield (0, db_1.getConnection)();
        try {
            const [invoices] = yield conn.query(`
            SELECT id, number FROM invoices 
            WHERE number LIKE 'OLD-%' AND total = 0
            AND type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE')
        `);
            console.log(`Found ${invoices.length} zeroed invoices to restore.`);
            const zeroedIds = new Set(invoices.map((i) => i.id));
            const zeroedNumbers = new Map(invoices.map((i) => [i.id, i.number]));
            const oldTotals = new Map();
            const fileStream = fs.createReadStream('f:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/backups/cloud_erp-2026-04-17_17-59-00-082.sql');
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            console.log("Scanning backup SQL for INSERT INTO `invoices`...");
            try {
                for (var _d = true, rl_1 = __asyncValues(rl), rl_1_1; rl_1_1 = yield rl_1.next(), _a = rl_1_1.done, !_a; _d = true) {
                    _c = rl_1_1.value;
                    _d = false;
                    const line = _c;
                    if (line.includes('INSERT INTO `invoices`')) {
                        // Remove prefix "INSERT INTO `invoices` VALUES "
                        const dataStr = line.substring(line.indexOf('VALUES') + 6).trim();
                        // Parse tuples. This is a bit tricky but we can just split by "),("
                        // However strings can contain that. A safer bet: regex for ID.
                        for (const id of zeroedIds) {
                            // search for "('id',"
                            const idx = line.indexOf(`('${id}',`);
                            if (idx !== -1) {
                                // We found the tuple starting for this id.
                                // Let's parse from idx to the end of the tuple.
                                let inQuote = false;
                                let fields = [];
                                let currentField = "";
                                // idx points to `('id',...` -> start after the first parenthesis.
                                for (let i = idx + 1; i < line.length; i++) {
                                    const char = line[i];
                                    const prevChar = line[i - 1];
                                    if (char === "'" && prevChar !== '\\') {
                                        inQuote = !inQuote;
                                    }
                                    else if (char === ',' && !inQuote) {
                                        fields.push(currentField);
                                        currentField = "";
                                    }
                                    else if (char === ')' && !inQuote) {
                                        fields.push(currentField);
                                        break;
                                    }
                                    else {
                                        currentField += char;
                                    }
                                }
                                // `total` is index 5
                                const totalStr = fields[5];
                                if (totalStr) {
                                    const parsed = parseFloat(totalStr);
                                    if (!isNaN(parsed) && parsed > 0) {
                                        oldTotals.set(id, parsed);
                                        console.log(`Found total for ${zeroedNumbers.get(id)}: ${parsed}`);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = rl_1.return)) yield _b.call(rl_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
            console.log(`Finished scanning. Found ${oldTotals.size} totals.`);
            let updatedCount = 0;
            for (const [id, total] of oldTotals.entries()) {
                const number = zeroedNumbers.get(id);
                yield conn.query(`UPDATE invoices SET total = ? WHERE id = ?`, [total, id]);
                updatedCount++;
                // console.log(`Restored ${number} to ${total}`);
            }
            console.log(`Successfully updated ${updatedCount} records.`);
        }
        catch (e) {
            console.error("Error:", e);
        }
        finally {
            conn.release();
            process.exit(0);
        }
    });
}
restoreTotalsFromSql();
