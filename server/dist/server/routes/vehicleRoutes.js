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
const express_1 = __importDefault(require("express"));
const vehicleController_1 = require("../controllers/vehicleController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// ==========================================
// SPECIFIC ROUTES (must come before /:id)
// ==========================================
// Root and list routes
router.get('/', (0, authMiddleware_1.requirePermission)('vansales.view'), vehicleController_1.getVehicles);
router.post('/', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.createVehicle);
// Inventory - all vehicles
router.get('/inventory', (0, authMiddleware_1.requirePermission)('vansales.view'), vehicleController_1.getAllVehicleInventory);
// Operations - all vehicles
router.get('/operations', (0, authMiddleware_1.requirePermission)('vansales.view'), vehicleController_1.getAllOperations);
router.get('/operations/:operationId', (0, authMiddleware_1.requirePermission)('vansales.view'), vehicleController_1.getOperationDetails);
router.delete('/operations/:operationId', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.deleteOperation);
// Report
router.get('/report', (0, authMiddleware_1.requirePermission)('vansales.reports'), vehicleController_1.getVehicleReport);
// Customer Visits (تتبع زيارات العملاء)
router.get('/visits', (0, authMiddleware_1.requirePermission)('vansales.visits'), vehicleController_1.getCustomerVisits);
router.post('/visits', (0, authMiddleware_1.requirePermission)('vansales.visits'), vehicleController_1.createCustomerVisit);
router.post('/visits/sale', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.createVanSaleVisit); // Create full sale invoice from visit
router.post('/visits/return', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.createVanReturnVisit); // NEW: Create return invoice from visit
router.put('/visits/:visitId', (0, authMiddleware_1.requirePermission)('vansales.visits'), vehicleController_1.updateCustomerVisit);
router.delete('/visits/:visitId', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.deleteCustomerVisit);
// Vehicle Returns (مرتجعات المبيعات المتنقلة)
router.get('/returns', (0, authMiddleware_1.requirePermission)('vansales.view'), vehicleController_1.getVehicleReturns);
router.post('/returns', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.createVehicleReturn);
router.put('/returns/:returnId/process', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.processVehicleReturn);
// Diagnostic endpoint - check bank invoices (temp debug)
router.get('/debug-bank-invoices', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('../db')));
        const [invoices] = yield pool.query(`
            SELECT id, date, partnerId, total, paymentMethod, status, type 
            FROM invoices 
            WHERE paymentMethod = 'BANK' 
            AND status = 'POSTED'
            ORDER BY date DESC
            LIMIT 20
        `);
        const [settlements] = yield pool.query(`
            SELECT id, settlementDate, totalBankTransfers 
            FROM vehicle_settlements 
            ORDER BY settlementDate DESC 
            LIMIT 10
        `);
        res.json({
            bankInvoices: invoices,
            settlements,
            summary: `Found ${invoices.length} BANK invoices`
        });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
}));
// End of Day Settlement (تسوية نهاية اليوم)
router.get('/settlements', (0, authMiddleware_1.requirePermission)('vansales.settlements'), vehicleController_1.getSettlements);
router.post('/settlements', (0, authMiddleware_1.requirePermission)('vansales.settlements'), vehicleController_1.createSettlement);
router.put('/settlements/:settlementId', (0, authMiddleware_1.requirePermission)('vansales.settlements'), vehicleController_1.updateSettlement);
router.delete('/settlements/:settlementId', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.deleteSettlement);
router.post('/settlements/:settlementId/approve', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.approveSettlement);
router.post('/settlements/:settlementId/dispute', (0, authMiddleware_1.requirePermission)('vansales.settlements'), vehicleController_1.disputeSettlement);
router.post('/settlements/:settlementId/submit', (0, authMiddleware_1.requirePermission)('vansales.settlements'), vehicleController_1.submitSettlement);
router.get('/settlements/approved', (0, authMiddleware_1.requirePermission)('vansales.settlements'), vehicleController_1.getApprovedSettlements);
// Daily Report (التقرير اليومي)
router.get('/daily-report', (0, authMiddleware_1.requirePermission)('vansales.reports'), vehicleController_1.getDailyReport);
// Customer Vehicle History (سجل عمليات السيارة للعميل)
router.get('/customer/:customerId/history', (0, authMiddleware_1.requirePermission)('vansales.view'), vehicleController_1.getCustomerVehicleHistory);
// ==========================================
// VAN SALES ENHANCEMENT ROUTES (2025-12-24)
// ==========================================
// Vehicle Targets (أهداف السيارات)
router.get('/targets', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.getVehicleTargets);
router.post('/targets', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.createVehicleTarget);
router.put('/targets/:id', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.updateVehicleTarget);
router.delete('/targets/:id', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.deleteVehicleTarget);
// Vehicle Maintenance (صيانة السيارات)
router.get('/maintenance', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.getVehicleMaintenance);
router.post('/maintenance', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.createVehicleMaintenance);
router.put('/maintenance/:id', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.updateVehicleMaintenance);
router.delete('/maintenance/:id', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.deleteVehicleMaintenance);
// Fuel Logs (سجل الوقود)
router.get('/fuel-logs', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.getVehicleFuelLogs);
router.post('/fuel-logs', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.createVehicleFuelLog);
router.delete('/fuel-logs/:id', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.deleteVehicleFuelLog);
// Alerts (تنبيهات)
router.get('/alerts/low-stock', (0, authMiddleware_1.requirePermission)('vansales.view'), vehicleController_1.getVehicleLowStockAlerts);
// Enhanced Reports (تقارير متقدمة)
router.get('/reports/performance', (0, authMiddleware_1.requirePermission)('vansales.reports'), vehicleController_1.getVehiclePerformanceReport);
router.get('/reports/products', (0, authMiddleware_1.requirePermission)('vansales.reports'), vehicleController_1.getProductPerformanceReport);
// Routes / خطوط السير
router.get('/salesman-routes', (0, authMiddleware_1.requirePermission)('vansales.routes'), vehicleController_1.getSalesmanRoutes); // Mobile sync - user's routes with stops
router.get('/routes', (0, authMiddleware_1.requirePermission)('vansales.routes'), vehicleController_1.getRoutes);
router.post('/routes', (0, authMiddleware_1.requirePermission)('vansales.routes'), vehicleController_1.createRoute);
router.get('/routes/:id', (0, authMiddleware_1.requirePermission)('vansales.routes'), vehicleController_1.getRoute);
router.put('/routes/:id', (0, authMiddleware_1.requirePermission)('vansales.routes'), vehicleController_1.updateRoute);
router.delete('/routes/:id', (0, authMiddleware_1.requirePermission)('vansales.routes'), vehicleController_1.deleteRoute);
router.post('/routes/:id/start', (0, authMiddleware_1.requirePermission)('vansales.routes'), vehicleController_1.startRoute);
router.post('/routes/:id/complete', (0, authMiddleware_1.requirePermission)('vansales.routes'), vehicleController_1.completeRoute);
// DEBUG endpoint - accessible via browser
router.get('/debug-discounts', vehicleController_1.debugDiscounts);
// Route Stops (محطات خط السير)
router.post('/routes/:routeId/stops', (0, authMiddleware_1.requirePermission)('vansales.routes'), vehicleController_1.addRouteStop);
router.put('/routes/stops/:stopId', (0, authMiddleware_1.requirePermission)('vansales.routes'), vehicleController_1.updateRouteStop);
router.post('/routes/stops/:stopId/visited', (0, authMiddleware_1.requirePermission)('vansales.routes'), vehicleController_1.markStopVisited); // Mark stop as visited/completed
router.delete('/routes/stops/:stopId', (0, authMiddleware_1.requirePermission)('vansales.routes'), vehicleController_1.deleteRouteStop);
// ==========================================
// PARAMETERIZED ROUTES (must come after specific routes)
// ==========================================
// Vehicle by ID
router.get('/:id', (0, authMiddleware_1.requirePermission)('vansales.view'), vehicleController_1.getVehicle);
router.put('/:id', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.updateVehicle);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.deleteVehicle);
// Vehicle Inventory
router.get('/:id/inventory', (0, authMiddleware_1.requirePermission)('vansales.inventory'), vehicleController_1.getVehicleInventory);
// Vehicle Operations
router.post('/:id/load', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.loadVehicle);
router.post('/:id/unload', (0, authMiddleware_1.requirePermission)('vansales.manage'), vehicleController_1.unloadVehicle);
router.get('/:id/operations', (0, authMiddleware_1.requirePermission)('vansales.view'), vehicleController_1.getVehicleOperations);
// Vehicle Location (GPS)
router.put('/:id/location', (0, authMiddleware_1.requirePermission)('vansales.view'), vehicleController_1.updateVehicleLocation);
exports.default = router;
