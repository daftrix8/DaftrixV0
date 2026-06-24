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
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: path_1.default.resolve(__dirname, '../.env') });
function importCategories() {
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
        if (!worksheet) {
            throw new Error("Sheet1 not found");
        }
        // Find column indices
        let skuCol = -1;
        let categoryCol = -1;
        worksheet.getRow(1).eachCell((cell, colNumber) => {
            var _a;
            const value = (_a = cell.value) === null || _a === void 0 ? void 0 : _a.toString().trim();
            if (value === 'كود الصنف')
                skuCol = colNumber;
            if (value === 'فئة الصنف')
                categoryCol = colNumber;
        });
        if (skuCol === -1 || categoryCol === -1) {
            throw new Error(`Required columns not found. skuCol: ${skuCol}, categoryCol: ${categoryCol}`);
        }
        const categoryMap = new Map(); // name -> id
        // Load existing categories
        const [existingCats] = yield pool.query('SELECT id, name FROM categories');
        for (const cat of existingCats) {
            categoryMap.set(cat.name.trim(), cat.id);
        }
        console.log(`Loaded ${categoryMap.size} existing categories.`);
        const updates = [];
        const newCategories = new Set();
        worksheet.eachRow((row, rowNumber) => {
            var _a, _b, _c, _d;
            if (rowNumber === 1)
                return; // Skip header
            let sku = (_b = (_a = row.getCell(skuCol).value) === null || _a === void 0 ? void 0 : _a.toString()) === null || _b === void 0 ? void 0 : _b.trim();
            const categoryName = (_d = (_c = row.getCell(categoryCol).value) === null || _c === void 0 ? void 0 : _c.toString()) === null || _d === void 0 ? void 0 : _d.trim();
            if (sku && categoryName) {
                if (sku.endsWith('.0')) {
                    sku = sku.slice(0, -2);
                }
                let categoryId = categoryMap.get(categoryName);
                if (!categoryId) {
                    newCategories.add(categoryName);
                }
                else {
                    updates.push({ sku, categoryId });
                }
            }
        });
        // Create new categories
        for (const newCatName of newCategories) {
            const id = (0, uuid_1.v4)();
            console.log(`Creating new category: ${newCatName}`);
            yield pool.query('INSERT INTO categories (id, name) VALUES (?, ?)', [id, newCatName]);
            categoryMap.set(newCatName, id);
            // add to updates list for rows we processed earlier
            worksheet.eachRow((row, rowNumber) => {
                var _a, _b, _c, _d;
                if (rowNumber === 1)
                    return;
                let sku = (_b = (_a = row.getCell(skuCol).value) === null || _a === void 0 ? void 0 : _a.toString()) === null || _b === void 0 ? void 0 : _b.trim();
                const categoryName = (_d = (_c = row.getCell(categoryCol).value) === null || _c === void 0 ? void 0 : _c.toString()) === null || _d === void 0 ? void 0 : _d.trim();
                if (sku && categoryName === newCatName) {
                    if (sku.endsWith('.0'))
                        sku = sku.slice(0, -2);
                    updates.push({ sku, categoryId: id });
                }
            });
        }
        console.log(`Ready to update ${updates.length} products.`);
        let matchCount = 0;
        let updateCount = 0;
        for (const update of updates) {
            const [products] = yield pool.query('SELECT id FROM products WHERE sku = ?', [update.sku]);
            if (products.length > 0) {
                matchCount++;
                yield pool.query('UPDATE products SET categoryId = ? WHERE sku = ?', [update.categoryId, update.sku]);
                updateCount++;
            }
        }
        console.log(`Process complete.`);
        console.log(`Found ${matchCount} matching SKUs in DB.`);
        console.log(`Updated ${updateCount} products with their categories.`);
        process.exit(0);
    });
}
importCategories().catch(e => {
    console.error("Error:", e);
    process.exit(1);
});
