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
            console.log('Running tickets query...');
            const [rows] = yield db_1.pool.query(`
      SELECT t.*, 
             p.name as partner_name, COALESCE(p.contactPerson, '') as partner_company,
             l.title as lead_name,
             u.name as assigned_user_name,
             c.name as category_name
      FROM crm_tickets t
      LEFT JOIN partners p ON t.partner_id = p.id
      LEFT JOIN crm_leads l ON t.lead_id = l.id
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN crm_categories c ON t.categoryId = c.id
      WHERE 1=1
    `);
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
