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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const masterData = __importStar(require("../controllers/masterDataController"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Helper to register CRUD routes.
// - writePermissionId: required for POST/PUT/DELETE
// - readPermissionId: optional; if set, GET also requires this permission.
//   Leave unset for lookup tables that form dropdowns need (warehouses, categories, etc.)
const registerRoutes = (path, controller, writePermissionId, readPermissionId) => {
    if (readPermissionId) {
        router.get(`/${path}`, (0, authMiddleware_1.requirePermission)(readPermissionId), controller.getAll);
    }
    else {
        router.get(`/${path}`, controller.getAll); // Open: form dropdowns in invoices, POS, etc.
    }
    router.post(`/${path}`, (0, authMiddleware_1.requirePermission)(writePermissionId), controller.create);
    router.put(`/${path}/:id`, (0, authMiddleware_1.requirePermission)(writePermissionId), controller.update);
    router.delete(`/${path}/:id`, (0, authMiddleware_1.requirePermission)(writePermissionId), controller.delete);
};
registerRoutes('branches', masterData.branches, 'master.branches');
registerRoutes('warehouses', masterData.warehouses, 'master.warehouses');
registerRoutes('categories', masterData.categories, 'master.categories');
registerRoutes('salesmen', masterData.salesmen, 'master.salesmen');
registerRoutes('taxes', masterData.taxes, 'system.settings');
// GET is open — cost-centers and cash-categories are loaded for ALL users (invoice/receipt dropdowns)
// Write operations stay protected by their respective permissions
registerRoutes('cost-centers', masterData.costCenters, 'accounting.cost_centers');
registerRoutes('cash-categories', masterData.cashCategories, 'treasury.manage');
registerRoutes('partner-groups', masterData.partnerGroups, 'partners.manage');
registerRoutes('manufacturers', masterData.manufacturers, 'inventory.manage_products');
registerRoutes('sizes', masterData.sizes, 'inventory.manage_products');
registerRoutes('colors', masterData.colors, 'inventory.manage_products');
registerRoutes('specifications', masterData.specifications, 'inventory.manage_products');
registerRoutes('item-descriptions', masterData.itemDescriptions, 'inventory.manage_products');
registerRoutes('product-groups', masterData.productGroups, 'inventory.manage_products');
exports.default = router;
