"use strict";
/**
 * MIGRATE: Legacy Stock Permits & Transfers
 *
 * Handles:
 * 1. stores_add (إذن إضافة) → STOCK_PERMIT_IN
 * 2. stores_sub (إذن صرف) → STOCK_PERMIT_OUT
 * 3. stores_transfer (تحويل مخزني) → STOCK_TRANSFER
 *
 * Uses id_mapping.json for Products and Warehouses.
 */
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
const promise_1 = __importDefault(require("mysql2/promise"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = require("crypto");
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const MALI_DATA_DIR = process.env.MIGRATION_DATA_DIR || path.resolve(__dirname, '../../mall stuff/data');
function loadJson(filename) {
    const filePath = path.join(MALI_DATA_DIR, filename);
    if (!fs.existsSync(filePath))
        throw new Error(`File not found: ${filePath}`);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        console.log('\n══════════════════════════════════════════════');
        console.log('  📦 MIGRATE: Stock Permits & Transfers');
        console.log('══════════════════════════════════════════════\n');
        const idMapping = JSON.parse(fs.readFileSync(path.resolve(MALI_DATA_DIR, '../id_mapping.json'), 'utf8'));
        const pool = promise_1.default.createPool({
            host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
            decimalNumbers: true, connectTimeout: 30000, connectionLimit: 5,
            authPlugins: { mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0') },
        });
        const conn = yield pool.getConnection();
        try {
            // 1. Delete previous migrated permits to ensure idempotency
            console.log('  🧹 Cleaning up previous migrations...');
            const [existingRows] = yield conn.query("SELECT id FROM stock_permits WHERE description LIKE '[MIGRATED]%'");
            if (existingRows.length > 0) {
                const ids = existingRows.map((r) => r.id);
                // Delete items and STOCK MOVEMENTS in chunks (prevents orphaned movements on re-migration)
                for (let i = 0; i < ids.length; i += 1000) {
                    const chunk = ids.slice(i, i + 1000);
                    yield conn.query(`DELETE FROM stock_movements WHERE reference_id IN (?) AND reference_type IN ('STOCK_PERMIT_IN', 'STOCK_PERMIT_OUT', 'STOCK_TRANSFER')`, [chunk]);
                    yield conn.query(`DELETE FROM stock_permit_items WHERE permitId IN (?)`, [chunk]);
                    yield conn.query(`DELETE FROM stock_permits WHERE id IN (?)`, [chunk]);
                }
                console.log(`     Deleted ${existingRows.length} existing migrated permits + their stock movements.`);
            }
            // Load definitions
            const [productRows] = yield conn.query('SELECT id, name, cost FROM products');
            const productMap = new Map();
            for (const p of productRows)
                productMap.set(p.id, { name: p.name, cost: Number(p.cost) });
            const sources = [
                {
                    type: 'STOCK_PERMIT_IN',
                    label: 'إذن إضافة',
                    mastersJson: 'stores_add.json',
                    detailsJson: 'stores_add_details.json'
                },
                {
                    type: 'STOCK_PERMIT_OUT',
                    label: 'إذن صرف',
                    mastersJson: 'stores_sub.json',
                    detailsJson: 'stores_sub_details.json'
                },
                {
                    type: 'STOCK_TRANSFER',
                    label: 'تحويل مخزني',
                    mastersJson: 'stores_transfer.json',
                    detailsJson: 'stores_transfer_details.json'
                }
            ];
            let totalPermits = 0;
            let totalItems = 0;
            yield conn.beginTransaction();
            for (const task of sources) {
                console.log(`\n  👉 Processing ${task.label}...`);
                try {
                    const masters = loadJson(task.mastersJson);
                    const details = loadJson(task.detailsJson);
                    console.log(`     Loaded ${masters.length} masters, ${details.length} details`);
                    const masterMap = new Map();
                    for (const m of masters)
                        masterMap.set(m.ID, m);
                    const detailsByMaster = new Map();
                    for (const d of details) {
                        if (!detailsByMaster.has(d.masterID))
                            detailsByMaster.set(d.masterID, []);
                        detailsByMaster.get(d.masterID).push(d);
                    }
                    let taskPermits = 0;
                    let taskItems = 0;
                    for (const master of masters) {
                        const detailLines = detailsByMaster.get(master.ID) || [];
                        if (detailLines.length === 0)
                            continue;
                        const linesByWh = new Map();
                        for (const d of detailLines) {
                            let sourceWh = '';
                            let destWh = '';
                            if (task.type === 'STOCK_PERMIT_IN') {
                                destWh = String(d.toStoreID || d.StoreID || '1');
                            }
                            else if (task.type === 'STOCK_PERMIT_OUT') {
                                sourceWh = String(d.fromStoreID || d.StoreID || '1');
                            }
                            else if (task.type === 'STOCK_TRANSFER') {
                                sourceWh = String(d.fromStoreID || '');
                                destWh = String(d.toStoreID || '');
                            }
                            const whKey = `${sourceWh}|${destWh}`;
                            if (!linesByWh.has(whKey))
                                linesByWh.set(whKey, []);
                            linesByWh.get(whKey).push(d);
                        }
                        // Create one permit per warehouse combination
                        for (const [whKey, whLines] of linesByWh) {
                            const [sourceOldId, destOldId] = whKey.split('|');
                            const sourceWarehouseId = sourceOldId ? (((_a = idMapping.warehouses) === null || _a === void 0 ? void 0 : _a[sourceOldId]) || null) : null;
                            const destWarehouseId = destOldId ? (((_b = idMapping.warehouses) === null || _b === void 0 ? void 0 : _b[destOldId]) || null) : null;
                            // Skip if we can't map warehouses
                            if (task.type === 'STOCK_PERMIT_IN' && !destWarehouseId)
                                continue;
                            if (task.type === 'STOCK_PERMIT_OUT' && !sourceWarehouseId)
                                continue;
                            if (task.type === 'STOCK_TRANSFER' && (!sourceWarehouseId || !destWarehouseId))
                                continue;
                            const permitId = (0, crypto_1.randomUUID)();
                            const date = master.invDate || new Date().toISOString().slice(0, 10);
                            const legacyNotes = master.notes || master.Notes || '';
                            const description = `[MIGRATED] OLD-${master.ID} | ${legacyNotes}`;
                            yield conn.query(`INSERT INTO stock_permits (id, date, type, description, sourceWarehouseId, destWarehouseId, createdBy)
               VALUES (?, ?, ?, ?, ?, ?, ?)`, [permitId, date, task.type, description, sourceWarehouseId, destWarehouseId, 'migration']);
                            taskPermits++;
                            const itemParams = [];
                            for (const d of whLines) {
                                const oldItem = String(d.itemID);
                                const productId = (_c = idMapping.products) === null || _c === void 0 ? void 0 : _c[oldItem];
                                if (!productId)
                                    continue;
                                const prodDef = productMap.get(productId);
                                const qty = Number(d.quan) || 0;
                                const cost = Number(d.ItemBuyPrice) || (prodDef ? prodDef.cost : 0);
                                if (qty <= 0)
                                    continue;
                                itemParams.push([permitId, productId, prodDef ? prodDef.name : 'Unknown', qty, cost]);
                            }
                            if (itemParams.length > 0) {
                                yield conn.query(`INSERT INTO stock_permit_items (permitId, productId, productName, quantity, cost) VALUES ?`, [itemParams]);
                                taskItems += itemParams.length;
                            }
                        }
                    }
                    console.log(`     ✅ Added ${taskPermits} permits with ${taskItems} items.`);
                    totalPermits += taskPermits;
                    totalItems += taskItems;
                }
                catch (err) {
                    console.log(`     ⚠️ Failed: ${err.message}`);
                }
            }
            yield conn.commit();
            console.log('\n══════════════════════════════════════════════');
            console.log('  📊 RESULTS');
            console.log('══════════════════════════════════════════════');
            console.log(`  ✅ Total Permits inserted: ${totalPermits}`);
            console.log(`  ✅ Total Items inserted:   ${totalItems}`);
            console.log(`\n  👉 Run 'npx ts-node server/scripts/sync_stock_from_invoices.ts' to recalculate balances.`);
        }
        catch (e) {
            yield conn.rollback();
            throw e;
        }
        finally {
            conn.release();
            yield pool.end();
        }
    });
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
