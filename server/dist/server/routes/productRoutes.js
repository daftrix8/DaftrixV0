"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const productController_1 = require("../controllers/productController");
const productUnitController_1 = require("../controllers/productUnitController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const productReviewController_1 = require("../controllers/productReviewController");
const router = (0, express_1.Router)();
// Variant Templates (MUST be before /:id routes)
router.get('/variant-templates', productController_1.getVariantTemplates);
router.post('/variant-templates', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productController_1.saveVariantTemplate);
router.delete('/variant-templates/:id', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productController_1.deleteVariantTemplate);
// GET routes — any authenticated user can read products (needed for invoices, POS, etc.)
router.get('/', productController_1.getProducts);
router.get('/paginated', productController_1.getPaginatedProducts);
router.get('/search', productController_1.searchProducts);
router.get('/next-sku', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productController_1.getNextSku);
router.get('/field-suggestions', productController_1.getProductFieldSuggestions);
router.get('/unit-by-barcode/:barcode', productUnitController_1.getUnitByBarcode);
// Cost recovery — recalculate product costs from purchase invoice history
router.post('/refresh-costs', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productController_1.refreshCostsFromPurchases);
// Product Units Routes — GET open, mutations require permission
router.get('/:productId/units', productUnitController_1.getProductUnits);
router.get('/:productId/units/stock', productUnitController_1.getStockInAllUnits);
router.post('/:productId/units', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productUnitController_1.createProductUnit);
router.post('/:productId/units/bulk', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productUnitController_1.bulkCreateUnits);
router.post('/:productId/units/convert', productUnitController_1.convertQuantity);
router.put('/:productId/units/:unitId', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productUnitController_1.updateProductUnit);
router.delete('/:productId/units/:unitId', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productUnitController_1.deleteProductUnit);
// Product Prices — GET open, mutations require permission
router.get('/:id/prices', productController_1.getProductPrices);
router.put('/:id/prices', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productController_1.updateProductPrices);
// Product Variants (embedded within product) — GET open, mutations require permission
router.get('/:id/variants', productController_1.getProductVariants);
router.post('/:id/variants', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productController_1.saveProductVariants);
// Generic Product CRUD — GET open, mutations require permission
router.get('/:id', productController_1.getProduct);
router.post('/', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productController_1.createProduct);
router.put('/:id', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productController_1.updateProduct);
router.patch('/:id/toggle-active', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productController_1.toggleProductActive);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('inventory.manage_products'), productController_1.deleteProduct);
// Product Reviews
router.get('/:id/reviews', productReviewController_1.getProductReviews);
router.post('/:id/reviews', authMiddleware_1.authenticateToken, productReviewController_1.createProductReview);
exports.default = router;
