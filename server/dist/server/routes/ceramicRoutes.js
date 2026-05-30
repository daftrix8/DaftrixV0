"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ceramicController_1 = require("../controllers/ceramicController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Ceramic Price Lists (قوائم أسعار السيراميك)
router.get('/price-lists', (0, authMiddleware_1.requirePermission)('pricelist.view'), ceramicController_1.getCeramicPriceLists);
router.get('/price-lists/:id', (0, authMiddleware_1.requirePermission)('pricelist.view'), ceramicController_1.getCeramicPriceList);
router.post('/price-lists', (0, authMiddleware_1.requirePermission)('pricelist.create'), ceramicController_1.createCeramicPriceList);
router.put('/price-lists/:id', (0, authMiddleware_1.requirePermission)('pricelist.edit'), ceramicController_1.updateCeramicPriceList);
router.delete('/price-lists/:id', (0, authMiddleware_1.requirePermission)('pricelist.delete'), ceramicController_1.deleteCeramicPriceList);
// Ceramic Discount Lists (قوائم خصم السيراميك)
router.get('/discount-lists', (0, authMiddleware_1.requirePermission)('pricelist.view'), ceramicController_1.getCeramicDiscountLists);
router.get('/discount-lists/:id', (0, authMiddleware_1.requirePermission)('pricelist.view'), ceramicController_1.getCeramicDiscountList);
router.post('/discount-lists', (0, authMiddleware_1.requirePermission)('pricelist.create'), ceramicController_1.createCeramicDiscountList);
router.put('/discount-lists/:id', (0, authMiddleware_1.requirePermission)('pricelist.edit'), ceramicController_1.updateCeramicDiscountList);
router.delete('/discount-lists/:id', (0, authMiddleware_1.requirePermission)('pricelist.delete'), ceramicController_1.deleteCeramicDiscountList);
// Customer Ceramic Pricing (تسعير العميل)
router.get('/customer/:partnerId/pricing', (0, authMiddleware_1.requirePermission)('pricelist.view'), ceramicController_1.getCustomerCeramicPricing);
exports.default = router;
