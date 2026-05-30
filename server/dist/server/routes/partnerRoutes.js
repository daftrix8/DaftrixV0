"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const partnerController_1 = require("../controllers/partnerController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// GET routes — any authenticated user can read partners (needed for invoice dropdowns)
router.get('/', partnerController_1.getPartners);
router.get('/:id', partnerController_1.getPartnerById);
router.get('/:id/balance', partnerController_1.getPartnerById);
router.get('/:id/statement', partnerController_1.getPartnerStatement);
// Supplier Pricing — Get products purchased from a supplier & bulk update prices
router.get('/:id/products', partnerController_1.getSupplierProducts);
router.put('/:id/products/prices', (0, authMiddleware_1.requireAnyPermission)(['suppliers.manage', 'partners.manage', 'inventory.manage_products']), partnerController_1.bulkUpdateSupplierPrices);
// Mutations — accept customers.manage OR suppliers.manage OR partners.manage
router.post('/', (0, authMiddleware_1.requireAnyPermission)(['customers.manage', 'suppliers.manage', 'partners.manage']), partnerController_1.createPartner);
router.put('/:id', (0, authMiddleware_1.requireAnyPermission)(['customers.manage', 'suppliers.manage', 'partners.manage']), partnerController_1.updatePartner);
router.delete('/:id', (0, authMiddleware_1.requireAnyPermission)(['customers.manage', 'suppliers.manage', 'partners.delete']), partnerController_1.deletePartner);
exports.default = router;
