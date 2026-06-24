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
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv.config({ path: path_1.default.resolve(__dirname, '../.env') });
function fixBoms() {
    return __awaiter(this, void 0, void 0, function* () {
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'cloud_erp',
            port: Number(process.env.DB_PORT) || 3306,
        });
        console.log('Fetching all raw products...');
        // We identify fake products either by SKU starting with RAW- and containing a number in the name
        // Or simply by checking all products used in BOMs
        const [bomItems] = yield pool.query(`
    SELECT bi.id as bom_item_id, bi.raw_product_id, p.name, p.sku
    FROM bom_items bi
    JOIN products p ON bi.raw_product_id = p.id
  `);
        console.log(`Found ${bomItems.length} BOM items.`);
        const [allProducts] = yield pool.query('SELECT id, name, sku FROM products');
        const productsByName = new Map();
        for (const p of allProducts) {
            productsByName.set(p.name.trim(), p);
        }
        let fixedCount = 0;
        const fakeProductIdsToDelete = new Set();
        for (const item of bomItems) {
            const match = item.name.match(/(.*?)\s*([\d\.]+)[م]?$/);
            if (match) {
                const realName = match[1].trim();
                const parsedQty = parseFloat(match[2]);
                if (realName && parsedQty !== undefined) {
                    // Does the real name exist?
                    let realProduct = productsByName.get(realName);
                    // Fallback fuzzy match
                    if (!realProduct) {
                        for (const [pName, p] of productsByName.entries()) {
                            if (pName.includes(realName) || realName.includes(pName)) {
                                realProduct = p;
                                break;
                            }
                        }
                    }
                    if (realProduct && realProduct.id !== item.raw_product_id) {
                        // Found the real product!
                        console.log(`Fixing BOM Item: ${item.name} -> Real Name: ${realProduct.name}, Qty: ${parsedQty}`);
                        // Update BOM item
                        yield pool.query('UPDATE bom_items SET raw_product_id = ?, quantity_per_unit = ? WHERE id = ?', [realProduct.id, parsedQty, item.bom_item_id]);
                        // Mark old fake product for deletion
                        fakeProductIdsToDelete.add(item.raw_product_id);
                        fixedCount++;
                    }
                }
            }
            else {
                // Just in case it's named something like "حشو كبير" with quantity 1 in the string but couldn't parse
                // It might be a fake product if it's "RAW-..."
            }
        }
        console.log(`Fixed ${fixedCount} BOM items.`);
        // Delete fake products
        let deleteCount = 0;
        for (const id of fakeProductIdsToDelete) {
            try {
                yield pool.query('DELETE FROM products WHERE id = ?', [id]);
                deleteCount++;
            }
            catch (err) {
                console.error(`Could not delete product ${id}:`, err);
            }
        }
        console.log(`Deleted ${deleteCount} fake products.`);
        // Recalculate BOM Costs
        console.log(`Recalculating BOM total costs for finished products...`);
        const [boms] = yield pool.query('SELECT id FROM bom');
        for (const b of boms) {
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
fixBoms().catch(e => {
    console.error("Error:", e);
    process.exit(1);
});
