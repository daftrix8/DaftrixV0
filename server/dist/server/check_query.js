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
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const where = "WHERE 1=1 AND l.status IN ('OPEN','WON')";
            const params = ['OPEN', 'WON'];
            console.log('Running count query...');
            const [countResult] = yield db_1.pool.query(`SELECT COUNT(*) as total FROM crm_leads l ${where}`, params);
            console.log('Count:', countResult[0].total);
            console.log('Running main query...');
            const [rows] = yield db_1.pool.query(`SELECT l.*, s.name as stageName, s.is_won as stageIsWon,
              u.name as salespersonName, c.name as categoryName,
              (SELECT MIN(due_date) FROM crm_activities WHERE lead_id = l.id AND is_done = 0) as next_activity_date,
              (SELECT COUNT(*) > 0 FROM crm_activities WHERE lead_id = l.id AND is_done = 0 AND due_date < CURDATE()) as has_overdue_activity,
              (SELECT COUNT(*) > 0 FROM crm_activities WHERE lead_id = l.id AND is_done = 0 AND due_date = CURDATE()) as has_today_activity
       FROM crm_leads l
       LEFT JOIN crm_stages s ON l.stage_id = s.id
       LEFT JOIN users u ON l.salesperson_id = u.id
       LEFT JOIN crm_categories c ON l.categoryId = c.id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT 100 OFFSET 0`, [...params]);
            console.log('Rows:', rows.length);
        }
        catch (err) {
            console.error(err);
        }
        finally {
            process.exit(0);
        }
    });
}
main();
