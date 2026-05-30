"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const variantGroupsController_1 = require("../controllers/variantGroupsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Brands — simple CRUD
router.get('/brands', variantGroupsController_1.getBrands);
router.post('/brands', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), variantGroupsController_1.createBrand);
// Variant Groups — read is open, mutations require permission
router.get('/', variantGroupsController_1.getVariantGroups);
router.get('/:id', variantGroupsController_1.getVariantGroupById);
router.post('/', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), variantGroupsController_1.createVariantGroup);
router.put('/:id', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), variantGroupsController_1.updateVariantGroup);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), variantGroupsController_1.deleteVariantGroup);
// Utility generators
router.post('/generate-skus', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), variantGroupsController_1.generateSKUs);
router.post('/generate-barcodes', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), variantGroupsController_1.generateBarcodes);
exports.default = router;
