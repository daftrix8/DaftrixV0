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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mysql = __importStar(require("mysql2/promise"));
const exceljs_1 = __importDefault(require("exceljs"));
const path_1 = __importDefault(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: path_1.default.resolve(__dirname, '../.env') });
function importPrices() {
    return __awaiter(this, void 0, void 0, function* () {
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'cloud_erp',
            port: Number(process.env.DB_PORT) || 3306,
        });
        const filePath = path_1.default.resolve(__dirname, '../../ASTERA/بيانات استيرا(Autosaved).xlsx');
        console.log(`Reading Excel file: ${filePath}`);
        const workbook = new exceljs_1.default.Workbook();
        yield workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet('Sheet1');
        // Hardcode column indices (1-based in exceljs)
        const skuCol = 1;
        const nameCol = 2;
        const typeCol = 4;
        const priceCol = 5;
        const updates = [];
        worksheet.eachRow((row, rowNumber) => {
            var _a, _b, _c, _d;
            if (rowNumber === 1)
                return; // Skip header
            let sku = (_a = row.getCell(skuCol).text) === null || _a === void 0 ? void 0 : _a.trim();
            const name = (_b = row.getCell(nameCol).text) === null || _b === void 0 ? void 0 : _b.trim();
            const type = (_c = row.getCell(typeCol).text) === null || _c === void 0 ? void 0 : _c.trim();
            const priceStr = (_d = row.getCell(priceCol).text) === null || _d === void 0 ? void 0 : _d.trim();
            let priceVal = parseFloat(priceStr || '0');
            if (sku && name) {
                if (sku.endsWith('.0')) {
                    sku = sku.slice(0, -2);
                }
                let price = 0;
                let cost = 0;
                // According to ERP logic, raw materials cost is the purchase cost
                // Finished products price is the selling price
                if (type === 'ناتج تصنيع' || type === 'منتج نهائي') {
                    price = priceVal;
                    cost = 0; // Cost is calculated from BOM, wait, maybe I shouldn't overwrite cost to 0 if it already has something. Or just update price.
                }
                else {
                    // Raw material
                    cost = priceVal;
                    price = 0; // Typically raw materials aren't sold, or price is same as cost
                }
                updates.push({ sku, name, price, cost, type });
            }
        });
        console.log(`Ready to update ${updates.length} products.`);
        let matchCount = 0;
        let rawUpdateCount = 0;
        let finishedUpdateCount = 0;
        for (const update of updates) {
            const [products] = yield pool.query('SELECT id, type FROM products WHERE sku = ?', [update.sku]);
            if (products.length > 0) {
                matchCount++;
                const dbType = products[0].type;
                if (update.type === 'ناتج تصنيع' || update.type === 'منتج نهائي') {
                    yield pool.query('UPDATE products SET price = ? WHERE sku = ?', [update.price, update.sku]);
                    finishedUpdateCount++;
                }
                else {
                    yield pool.query('UPDATE products SET cost = ? WHERE sku = ?', [update.cost, update.sku]);
                    rawUpdateCount++;
                }
            }
            else {
                // Try matching by name as fallback for raw materials
                const [productsByName] = yield pool.query('SELECT id FROM products WHERE name = ?', [update.name]);
                if (productsByName.length > 0) {
                    matchCount++;
                    if (update.type === 'ناتج تصنيع' || update.type === 'منتج نهائي') {
                        yield pool.query('UPDATE products SET price = ? WHERE name = ?', [update.price, update.name]);
                        finishedUpdateCount++;
                    }
                    else {
                        yield pool.query('UPDATE products SET cost = ? WHERE name = ?', [update.cost, update.name]);
                        rawUpdateCount++;
                    }
                }
            }
        }
        console.log(`Process complete.`);
        console.log(`Found ${matchCount} matching SKUs/Names in DB.`);
        console.log(`Updated ${rawUpdateCount} raw materials with COST.`);
        console.log(`Updated ${finishedUpdateCount} finished products with PRICE.`);
        // Recalculate BOM Costs
        console.log(`Recalculating BOM total costs for finished products...`);
        const [boms] = yield pool.query('SELECT id FROM bom');
        for (const b of boms) {
            // Recalculate and update the finished product's cost from BOM items
            const [itemsRows] = yield pool.query(`
          SELECT bi.quantity_per_unit, bi.waste_percent, p.cost as unit_cost
          FROM bom_items bi
          LEFT JOIN products p ON bi.raw_product_id = p.id
          WHERE bi.bom_id = ?
      `, [b.id]);
            let materialCost = 0;
            for (const item of itemsRows) {
                const qtyWithWaste = (item.quantity_per_unit || 0) * (1 + (item.waste_percent || 0) / 100);
                materialCost += qtyWithWaste * (item.unit_cost || 0);
            }
            const [bomRows] = yield pool.query('SELECT labor_cost, overhead_cost, finished_product_id FROM bom WHERE id = ?', [b.id]);
            if (bomRows.length > 0) {
                const bom = bomRows[0];
                const laborCost = parseFloat(bom.labor_cost) || 0;
                const overheadCost = parseFloat(bom.overhead_cost) || 0;
                const totalCost = materialCost + laborCost + overheadCost;
                yield pool.query('UPDATE products SET cost = ? WHERE id = ?', [totalCost, bom.finished_product_id]);
            }
        }
        console.log(`Updated ${boms.length} BOM costs.`);
        process.exit(0);
    });
}
importPrices().catch(e => {
    console.error("Error:", e);
    process.exit(1);
});
