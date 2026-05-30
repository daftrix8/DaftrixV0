"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const priceListController_1 = require("../controllers/priceListController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const responseCache_1 = require("../middleware/responseCache");
const router = (0, express_1.Router)();
// GET — any authenticated user can read price lists (needed for invoices)
// PERF: Cache for 60s, auto-invalidated on entity:changed for 'priceLists'
router.get('/', (0, responseCache_1.responseCache)('priceLists'), priceListController_1.getPriceLists);
// Mutations require permission
router.post('/', (0, authMiddleware_1.requirePermission)('pricelist.create'), priceListController_1.createPriceList);
router.put('/:id', (0, authMiddleware_1.requirePermission)('pricelist.edit'), priceListController_1.updatePriceList);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('pricelist.delete'), priceListController_1.deletePriceList);
router.patch('/:id/toggle', (0, authMiddleware_1.requirePermission)('pricelist.edit'), priceListController_1.togglePriceListStatus);
exports.default = router;
