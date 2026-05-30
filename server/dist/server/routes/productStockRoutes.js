"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const productStockController_1 = require("../controllers/productStockController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// GET — any authenticated user can read stock levels (needed for invoices, POS)
router.get('/', productStockController_1.getProductStocks);
router.get('/product/:productId', productStockController_1.getProductStocksByProduct);
router.get('/warehouse/:warehouseId', productStockController_1.getProductStocksByWarehouse);
// Mutations require permission
router.post('/', (0, authMiddleware_1.requirePermission)('inventory.manage'), productStockController_1.upsertProductStock);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('inventory.manage'), productStockController_1.deleteProductStock);
exports.default = router;
