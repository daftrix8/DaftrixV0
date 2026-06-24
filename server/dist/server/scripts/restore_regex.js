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
function restoreRegex() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Restoring via regex...");
        const conn = yield (0, db_1.getConnection)();
        try {
            const [invoices] = yield conn.query(`
            SELECT id, number FROM invoices 
            WHERE number LIKE 'OLD-%' AND total = 0
            AND type IN ('INVOICE_SALE', 'INVOICE_PURCHASE', 'RETURN_SALE', 'RETURN_PURCHASE')
        `);
            console.log(`Found ${invoices.length} zeroed invoices to restore.`);
            const zeroedNumbers = new Set(invoices.map((i) => i.number));
            console.log("Reading big sql file...");
            const text = fs.readFileSync('f:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/backups/cloud_erp-2026-04-17_17-59-00-082.sql', 'utf8');
            console.log("File loaded. Executing Regex...");
            // Match tuples: ('uuid', 'date', 'type', 'partner', 'partnerName', total, ... 'OLD-xxx'
            // Since we know the format:
            // ('uuid', 'date', 'type', 'partnerId', 'partnerName', total, 'status', 'paymentMethod', posted, 'notes', ...
            // Let's just find the index of each number
            let updatedCount = 0;
            for (const number of zeroedNumbers) {
                const numIdx = text.indexOf(`'${number}'`);
                if (numIdx !== -1) {
                    // backtrack to the start of the tuple
                    const startIdx = text.lastIndexOf(`\n('`, numIdx);
                    if (startIdx !== -1) {
                        const tupleStr = text.substring(startIdx, numIdx + number.length + 100);
                        // now we can regex match the total from the start of the tuple
                        // ('uuid','date','type','partId','partName',TOTAL,
                        const m = tupleStr.match(/\n\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']*)',\s*([\d\.]+),/);
                        if (m) {
                            const total = parseFloat(m[6]);
                            if (!isNaN(total) && total > 0) {
                                yield conn.query(`UPDATE invoices SET total = ? WHERE number = ?`, [total, number]);
                                console.log(`Restored ${number} to ${total}`);
                                updatedCount++;
                            }
                        }
                        else {
                            console.log("Regex missed for:", tupleStr.substring(0, 100));
                        }
                    }
                }
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
restoreRegex();
