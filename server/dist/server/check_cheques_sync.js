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
function checkCheques() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("Starting diagnostic scan for cheque synchronization...");
            // 1. Cheques that are COLLECTED but missing the "تحصيل" journal entry
            const [missingCollection] = yield db_1.pool.query(`
            SELECT c.id, c.number, c.status, c.amount, c.type, c.partnerName 
            FROM cheques c
            WHERE c.status = 'COLLECTED'
            AND NOT EXISTS (
                SELECT 1 FROM journal_entries j 
                WHERE j.referenceId = c.number 
                AND j.description LIKE '%تحصيل%'
            )
        `);
            // 2. Cheques that are CASHED but missing the "صرف" journal entry
            const [missingCashed] = yield db_1.pool.query(`
            SELECT c.id, c.number, c.status, c.amount, c.type, c.partnerName 
            FROM cheques c
            WHERE c.status = 'CASHED'
            AND NOT EXISTS (
                SELECT 1 FROM journal_entries j 
                WHERE j.referenceId = c.number 
                AND j.description LIKE '%صرف%'
            )
        `);
            // 3. Cheques that are BOUNCED but missing the "ارتجاع" journal entry
            const [missingBounced] = yield db_1.pool.query(`
            SELECT c.id, c.number, c.status, c.amount, c.type, c.partnerName 
            FROM cheques c
            WHERE c.status = 'BOUNCED'
            AND NOT EXISTS (
                SELECT 1 FROM journal_entries j 
                WHERE j.referenceId = c.number 
                AND j.description LIKE '%ارتجاع%'
            )
        `);
            console.log(`\n=== Diagnostic Results ===`);
            console.log(`Missing Collection Entries: ${missingCollection.length}`);
            if (missingCollection.length > 0)
                console.table(missingCollection);
            console.log(`Missing Cashed Entries: ${missingCashed.length}`);
            if (missingCashed.length > 0)
                console.table(missingCashed);
            console.log(`Missing Bounced Entries: ${missingBounced.length}`);
            if (missingBounced.length > 0)
                console.table(missingBounced);
        }
        catch (err) {
            console.error("Error executing diagnostic:", err);
        }
        finally {
            yield db_1.pool.end();
        }
    });
}
checkCheques();
