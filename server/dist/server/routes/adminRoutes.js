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
const adminController_1 = require("../controllers/adminController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const dbHealth_1 = require("../utils/dbHealth");
const responseCache_1 = require("../utils/responseCache");
const router = express_1.default.Router();
// Reset database — requires admin.reset permission AND admin password (H8 security fix)
router.post('/reset-database', (0, authMiddleware_1.requirePermission)('admin.reset'), adminController_1.resetDatabase);
// Fiscal Year Rollover — requires admin.reset permission AND admin password
router.post('/fiscal-year-rollover', (0, authMiddleware_1.requirePermission)('admin.reset'), adminController_1.fiscalYearRollover);
// ═══════════════════════════════════════════════════════════
// DATABASE HEALTH & MAINTENANCE (Admin only)
// ═══════════════════════════════════════════════════════════
// Quick pool stats (lightweight, no DB query)
router.get('/db/pool-stats', (0, authMiddleware_1.requirePermission)('admin.reset'), (req, res) => {
    res.json((0, dbHealth_1.getPoolStats)());
});
// Full health check (tests DB connection, gets server stats)
router.get('/db/health', (0, authMiddleware_1.requirePermission)('admin.reset'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield (0, dbHealth_1.runHealthCheck)();
        // Enrich with server stability info
        let serverStats = {};
        try {
            const { getServerErrorStats } = yield Promise.resolve().then(() => __importStar(require('../index')));
            serverStats = getServerErrorStats();
        }
        catch ( /* ignore if not available */_a) { /* ignore if not available */ }
        res.json(Object.assign(Object.assign({}, result), { server: serverStats }));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Database integrity check (orphans, duplicates, negative stock, unbalanced journals)
router.get('/db/integrity', (0, authMiddleware_1.requirePermission)('admin.reset'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield (0, dbHealth_1.runIntegrityCheck)();
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Run table maintenance (OPTIMIZE + ANALYZE)
// This can take a few seconds — don't call during peak hours
router.post('/db/maintenance', (0, authMiddleware_1.requirePermission)('admin.reset'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('🔧 [Admin] Manual database maintenance triggered');
        const result = yield (0, dbHealth_1.runDatabaseMaintenance)();
        console.log(`✅ [Admin] Maintenance complete: ${result.optimized.length} optimized, ${result.analyzed.length} analyzed, ${result.errors.length} errors`);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// ═══════════════════════════════════════════════════════════
// RESPONSE CACHE (Admin only)
// ═══════════════════════════════════════════════════════════
// Cache statistics
router.get('/cache/stats', (0, authMiddleware_1.requirePermission)('admin.reset'), (req, res) => {
    res.json(responseCache_1.responseCache.stats());
});
// Clear all cached responses
router.post('/cache/clear', (0, authMiddleware_1.requirePermission)('admin.reset'), (req, res) => {
    responseCache_1.responseCache.invalidateAll();
    console.log('🗑️ [Admin] Response cache cleared manually');
    res.json({ success: true, message: 'Cache cleared' });
});
exports.default = router;
