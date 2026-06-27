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
exports.dbReady = void 0;
exports.getServerErrorStats = getServerErrorStats;
exports.invalidateKPICache = invalidateKPICache;
// ═══════════════════════════════════════════════════════════
// STDOUT/STDERR PIPE PROTECTION
// When running under the Python launcher, stdout is a pipe.
// If the launcher crashes or the pipe buffer fills, writing
// to stdout throws EPIPE which kills the entire process.
// This handler swallows EPIPE errors gracefully.
// ═══════════════════════════════════════════════════════════
if (process.stdout && typeof process.stdout.on === 'function') {
    process.stdout.on('error', (err) => {
        if ((err === null || err === void 0 ? void 0 : err.code) === 'EPIPE' || (err === null || err === void 0 ? void 0 : err.code) === 'ERR_STREAM_DESTROYED')
            return;
        // Non-pipe errors: just ignore to prevent crash
    });
}
if (process.stderr && typeof process.stderr.on === 'function') {
    process.stderr.on('error', (err) => {
        if ((err === null || err === void 0 ? void 0 : err.code) === 'EPIPE' || (err === null || err === void 0 ? void 0 : err.code) === 'ERR_STREAM_DESTROYED')
            return;
    });
}
// ═══════════════════════════════════════════════════════════
// FATAL CRASH CAPTURE (Dumps to file before exit)
// The MAIN error handlers are registered further down (line ~174).
// This early handler ONLY writes to crash-dump.log for forensics.
// It does NOT exit the process — that decision is made by the main handler.
// ═══════════════════════════════════════════════════════════
const fsBoot = require('fs');
const pathBoot = require('path');
const crashDumpPath = pathBoot.join(process.cwd(), 'crash-dump.log');
// ═══════════════════════════════════════════════════════════
// FORENSIC TRAP: Capture the EXACT stack trace of what calls
// process.exit(). Without this, we only see the exit code but
// not WHO triggered it (EADDRINUSE? launcher kill? OOM? import error?)
// ═══════════════════════════════════════════════════════════
const _originalProcessExit = process.exit;
process.exit = function (code) {
    if (code === 0) {
        const msg = `[${new Date().toISOString()}] PROCESS_CLEAN_EXIT (PID ${process.pid}, uptime ${Math.round(process.uptime())}s) - Exit code 0`;
        console.log(msg);
        try {
            fsBoot.appendFileSync(crashDumpPath, msg + '\n');
        }
        catch (e) { }
    }
    else {
        const stack = new Error(`FORENSIC: process.exit(${code}) called`).stack;
        const msg = `[${new Date().toISOString()}] PROCESS_EXIT_TRACE (PID ${process.pid}, uptime ${Math.round(process.uptime())}s):\n  Exit code: ${code}\n  Stack:\n${stack}\n\n`;
        console.error(msg);
        try {
            fsBoot.appendFileSync(crashDumpPath, msg);
        }
        catch (e) { }
    }
    return _originalProcessExit.call(process, code);
};
process.on('beforeExit', (code) => {
    const msg = `[${new Date().toISOString()}] BEFORE_EXIT (PID ${process.pid}): Event loop emptied. Code: ${code}\n\n`;
    try {
        fsBoot.appendFileSync(crashDumpPath, msg);
    }
    catch (e) { }
});
// Track whether top-level imports have completed
let __bootPhase = true;
process.on('uncaughtException', (err) => {
    const msg = `[${new Date().toISOString()}] UNCAUGHT EXCEPTION (PID ${process.pid}):\n${(err === null || err === void 0 ? void 0 : err.stack) || err}\n\n`;
    try {
        fsBoot.appendFileSync(crashDumpPath, msg);
    }
    catch (e) { }
    // During boot (before imports complete), this is truly fatal
    if (__bootPhase) {
        console.error("═══════════════════════════════════════");
        console.error("FATAL BOOT ERROR — Server cannot start:");
        console.error((err === null || err === void 0 ? void 0 : err.message) || err);
        console.error((err === null || err === void 0 ? void 0 : err.stack) || '(no stack)');
        console.error("═══════════════════════════════════════");
        process.exit(1);
    }
    // After boot, the main handler (registered later) will handle it
    // and keep the server alive. We just log here.
});
process.on('unhandledRejection', (reason, promise) => {
    const msg = `[${new Date().toISOString()}] UNHANDLED REJECTION (PID ${process.pid}):\n${reason instanceof Error ? reason.stack : reason}\n\n`;
    try {
        fsBoot.appendFileSync(crashDumpPath, msg);
    }
    catch (e) { }
    if (__bootPhase) {
        console.error("═══════════════════════════════════════");
        console.error("FATAL BOOT REJECTION — Server cannot start:");
        console.error((reason === null || reason === void 0 ? void 0 : reason.message) || reason);
        console.error((reason === null || reason === void 0 ? void 0 : reason.stack) || '(no stack)');
        console.error("═══════════════════════════════════════");
        process.exit(1);
    }
});
// ═══════════════════════════════════════════════════════════
// AUTO-HEAP GUARD: Detect if heap limit is dangerously low
// V8 defaults to 64-96MB without --max-old-space-size flag
// ═══════════════════════════════════════════════════════════
const v8Boot = require('v8');
const bootHeapMB = Math.round(v8Boot.getHeapStatistics().heap_size_limit / 1024 / 1024);
console.log(`🚀 Server starting (PID: ${process.pid}, Heap Limit: ${bootHeapMB}MB)`);
if (bootHeapMB < 512) {
    console.warn(`⚠️  HEAP LIMIT TOO LOW: ${bootHeapMB}MB — ERP needs ≥2048MB. Use: node --max-old-space-size=2048`);
}
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const compression_1 = __importDefault(require("compression"));
const express_static_gzip_1 = __importDefault(require("express-static-gzip"));
const body_parser_1 = __importDefault(require("body-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
// ── Sites and Uploads Path Resolution ───────────────────────────────
const sitesPath = fs_1.default.existsSync(path_1.default.join(process.cwd(), 'sites'))
    ? path_1.default.join(process.cwd(), 'sites')
    : fs_1.default.existsSync(path_1.default.join(process.cwd(), '..', 'sites'))
        ? path_1.default.join(process.cwd(), '..', 'sites')
        : path_1.default.join(__dirname, '..', 'sites'); // Fallback
const sitesPrivatePath = fs_1.default.existsSync(path_1.default.join(process.cwd(), 'sites_private'))
    ? path_1.default.join(process.cwd(), 'sites_private')
    : fs_1.default.existsSync(path_1.default.join(process.cwd(), '..', 'sites_private'))
        ? path_1.default.join(process.cwd(), '..', 'sites_private')
        : path_1.default.join(__dirname, '..', 'sites_private'); // Fallback
const uploadsPath = fs_1.default.existsSync(path_1.default.join(process.cwd(), 'uploads'))
    ? path_1.default.join(process.cwd(), 'uploads')
    : fs_1.default.existsSync(path_1.default.join(process.cwd(), '..', 'uploads'))
        ? path_1.default.join(process.cwd(), '..', 'uploads')
        : path_1.default.join(__dirname, '..', 'uploads'); // Fallback
// Ensure directories exist to prevent ENOENT errors
for (const p of [sitesPath, sitesPrivatePath, uploadsPath]) {
    if (!fs_1.default.existsSync(p)) {
        try {
            fs_1.default.mkdirSync(p, { recursive: true });
        }
        catch (err) {
            console.warn(`Failed to create directory at ${p}:`, err);
        }
    }
}
// CRITICAL: Load .env BEFORE any middleware imports that read process.env
// authMiddleware.ts reads JWT_SECRET at module load time
dotenv_1.default.config();
const socket_1 = require("./socket");
const db_1 = require("./db");
const rateLimiter_1 = require("./middleware/rateLimiter");
const securityMiddleware_1 = require("./middleware/securityMiddleware");
const requestTimeout_1 = require("./middleware/requestTimeout");
const productRoutes_1 = __importDefault(require("./routes/productRoutes"));
const partnerRoutes_1 = __importDefault(require("./routes/partnerRoutes"));
const accountRoutes_1 = __importDefault(require("./routes/accountRoutes"));
const invoiceRoutes_1 = __importDefault(require("./routes/invoiceRoutes"));
const syncRoutes_1 = __importDefault(require("./routes/syncRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const masterDataRoutes_1 = __importDefault(require("./routes/masterDataRoutes"));
const treasuryRoutes_1 = __importDefault(require("./routes/treasuryRoutes"));
const productStockRoutes_1 = __importDefault(require("./routes/productStockRoutes"));
const priceListRoutes_1 = __importDefault(require("./routes/priceListRoutes"));
const permissionRoutes_1 = __importDefault(require("./routes/permissionRoutes"));
const bomRoutes_1 = __importDefault(require("./routes/bomRoutes"));
const productionRoutes_1 = __importDefault(require("./routes/productionRoutes"));
const stockMovementRoutes_1 = __importDefault(require("./routes/stockMovementRoutes"));
const scrapRoutes_1 = __importDefault(require("./routes/scrapRoutes"));
const backupRoutes_1 = __importDefault(require("./routes/backupRoutes"));
const settingsRoutes_1 = __importDefault(require("./routes/settingsRoutes"));
const inventoryRoutes_1 = __importDefault(require("./routes/inventoryRoutes"));
const fixedAssetsRoutes_1 = __importDefault(require("./routes/fixedAssetsRoutes"));
const bankReconciliationRoutes_1 = __importDefault(require("./routes/bankReconciliationRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const journalRoutes_1 = __importDefault(require("./routes/journalRoutes"));
const stockPermitRoutes_1 = __importDefault(require("./routes/stockPermitRoutes"));
const auditRoutes_1 = __importDefault(require("./routes/auditRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const workCenterRoutes_1 = __importDefault(require("./routes/workCenterRoutes"));
const routingRoutes_1 = __importDefault(require("./routes/routingRoutes"));
const qualityRoutes_1 = __importDefault(require("./routes/qualityRoutes"));
const batchRoutes_1 = __importDefault(require("./routes/batchRoutes"));
const migrationRoutes_1 = __importDefault(require("./routes/migrationRoutes"));
const installmentRoutes_1 = __importDefault(require("./routes/installmentRoutes"));
const capacityRoutes_1 = __importDefault(require("./routes/capacityRoutes"));
const mrpRoutes_1 = __importDefault(require("./routes/mrpRoutes"));
const packagingRoutes_1 = __importDefault(require("./routes/packagingRoutes"));
const hrRoutes_1 = __importDefault(require("./routes/hrRoutes"));
const phoneAttendanceRoutes_1 = __importDefault(require("./routes/phoneAttendanceRoutes"));
const crmRoutes_1 = __importDefault(require("./routes/crmRoutes"));
const knowledgeBaseRoutes_1 = __importDefault(require("./routes/knowledgeBaseRoutes"));
const vehicleRoutes_1 = __importDefault(require("./routes/vehicleRoutes"));
const deltaSyncRoutes_1 = __importDefault(require("./routes/deltaSyncRoutes"));
const membershipJobs_1 = require("./cron/membershipJobs");
const posJobs_1 = require("./cron/posJobs");
const salesmanTargetRoutes_1 = __importDefault(require("./routes/salesmanTargetRoutes"));
const commissionRoutes_1 = __importDefault(require("./routes/commissionRoutes"));
const posRoutes_1 = __importDefault(require("./routes/posRoutes"));
const loyaltyRoutes_1 = __importDefault(require("./routes/loyaltyRoutes"));
const promotionRoutes_1 = __importDefault(require("./routes/promotionRoutes"));
const serialRoutes_1 = __importDefault(require("./routes/serialRoutes"));
const currencyRoutes_1 = __importDefault(require("./routes/currencyRoutes"));
const fiscalYearRoutes_1 = __importDefault(require("./routes/fiscalYearRoutes"));
const sseRoutes_1 = __importDefault(require("./routes/sseRoutes"));
const variantGroupRoutes_1 = __importDefault(require("./routes/variantGroupRoutes"));
const costCenterRoutes_1 = __importDefault(require("./routes/costCenterRoutes"));
const ceramicRoutes_1 = __importDefault(require("./routes/ceramicRoutes"));
const authMiddleware_1 = require("./middleware/authMiddleware");
const activityLogger_1 = require("./middleware/activityLogger");
const errorHandler_1 = require("./middleware/errorHandler");
const mailService_1 = require("./utils/mailService");
const reservationJobs_1 = require("./cron/reservationJobs");
const backupController_1 = require("./controllers/backupController");
const aiEmbeddingWorker_1 = require("./utils/aiEmbeddingWorker");
const loyaltyExpiryJob_1 = require("./controllers/loyaltyExpiryJob");
// Initialize cron jobs
(0, loyaltyExpiryJob_1.initLoyaltyExpiryJob)();
// ═══════════════════════════════════════════════════════════
// All top-level imports succeeded — mark boot phase as complete.
// From this point, uncaught exceptions should NOT kill the server.
// ═══════════════════════════════════════════════════════════
__bootPhase = false;
// Force Egyptian timezone (UTC+2 / EET) for all date operations
process.env.TZ = 'Africa/Cairo';
const configCache = {};
function getSiteConfig(slug) {
    return __awaiter(this, void 0, void 0, function* () {
        const cleanSlug = slug.replace(/[^a-zA-Z0-9-_]/g, '');
        const cacheKey = cleanSlug;
        const now = Date.now();
        if (configCache[cacheKey] && configCache[cacheKey].expiresAt > now) {
            return configCache[cacheKey].config;
        }
        let config = null;
        try {
            const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
            const [rows] = yield pool.query('SELECT configText FROM storefront_tenant_configs WHERE tenantSlug = ?', [cleanSlug]);
            if (rows && rows.length > 0) {
                config = JSON.parse(rows[0].configText);
            }
        }
        catch (dbErr) {
            console.warn(`[getSiteConfig] Database lookup failed for ${cleanSlug}, falling back to file:`, dbErr.message);
        }
        if (!config) {
            const configPath = path_1.default.join(sitesPath, cleanSlug, 'config.json');
            if (fs_1.default.existsSync(configPath)) {
                try {
                    config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
                    const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
                    yield pool.query('INSERT INTO storefront_tenant_configs (tenantSlug, configText) VALUES (?, ?) ON DUPLICATE KEY UPDATE configText = VALUES(configText)', [cleanSlug, JSON.stringify(config)]);
                    console.log(`[getSiteConfig] Auto-backfilled ${cleanSlug} configuration to database.`);
                }
                catch (err) {
                    console.error(`[getSiteConfig] Failed to read static config or backfill for ${cleanSlug}:`, err.message);
                }
            }
        }
        if (!config) {
            config = { brandName: cleanSlug || 'Store', sections: ['hero', 'featured', 'about', 'newsletter'] };
        }
        configCache[cacheKey] = {
            config,
            expiresAt: now + 60000
        };
        return config;
    });
}
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Database readiness flag — set to true after initDB() completes
let dbReady = false;
exports.dbReady = dbReady;
// Trust exactly 1 reverse proxy hop (Hostinger nginx)
// Using number instead of 'true' to satisfy express-rate-limit security validation
app.set('trust proxy', 1);
// ═══════════════════════════════════════════════════════════
// CRASH PROTECTION — Prevents the #1 cause of ERP hangs
// Old ERPs crash on uncaught errors. This catches them,
// logs them, and keeps the server running.
// ═══════════════════════════════════════════════════════════
let _errorCount = 0;
let _lastErrorTime = 0;
let dbError = null;
// ── Crash log helper: persist errors to file for post-mortem ──
function writeCrashLog(type, detail) {
    try {
        const crashLogPath = require('path').join(__dirname, '..', 'logs', 'crash.log');
        const fsCrash = require('fs');
        // Ensure logs directory exists
        const logsDir = require('path').dirname(crashLogPath);
        if (!fsCrash.existsSync(logsDir))
            fsCrash.mkdirSync(logsDir, { recursive: true });
        const timestamp = new Date().toISOString();
        const entry = `[${timestamp}] PID=${process.pid} ${type}: ${detail}\n`;
        fsCrash.appendFileSync(crashLogPath, entry);
    }
    catch ( /* ignore logging failures */_a) { /* ignore logging failures */ }
}
process.on('uncaughtException', (err) => {
    _errorCount++;
    _lastErrorTime = Date.now();
    console.error('═══════════════════════════════════════');
    console.error(`❌ UNCAUGHT EXCEPTION #${_errorCount}: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
    console.error((err === null || err === void 0 ? void 0 : err.stack) || '(no stack trace)');
    console.error('═══════════════════════════════════════');
    writeCrashLog('UNCAUGHT_EXCEPTION', `${(err === null || err === void 0 ? void 0 : err.message) || err}\n${(err === null || err === void 0 ? void 0 : err.stack) || ''}`);
    // DON'T exit — keep serving. Old ERPs would die here.
    // The pool monitor + connection sweeper handle cleanup.
});
process.on('unhandledRejection', (reason, promise) => {
    _errorCount++;
    _lastErrorTime = Date.now();
    console.error('═══════════════════════════════════════');
    console.error(`❌ UNHANDLED REJECTION #${_errorCount}: ${(reason === null || reason === void 0 ? void 0 : reason.message) || reason}`);
    if (reason === null || reason === void 0 ? void 0 : reason.stack)
        console.error(reason.stack);
    console.error('═══════════════════════════════════════');
    writeCrashLog('UNHANDLED_REJECTION', `${(reason === null || reason === void 0 ? void 0 : reason.message) || reason}\n${(reason === null || reason === void 0 ? void 0 : reason.stack) || ''}`);
    // DON'T exit — keep serving.
});
// ── Log process exit reason (catches OOM, SIGTERM, etc.) ──
process.on('exit', (code) => {
    console.log(`🔴 Process exiting (PID ${process.pid}, code: ${code}, uptime: ${Math.round(process.uptime())}s)`);
    writeCrashLog('PROCESS_EXIT', `Exit code: ${code}, uptime: ${Math.round(process.uptime())}s`);
});
process.on('SIGTERM', () => {
    writeCrashLog('SIGTERM', 'Process received SIGTERM');
    process.exit(0);
});
process.on('SIGINT', () => {
    writeCrashLog('SIGINT', 'Process received SIGINT');
    process.exit(0);
});
// If running as a child process (supervisor/cluster), die when parent dies
if (typeof process.send === 'function') {
    process.on('disconnect', () => {
        console.log(`⚠️ IPC channel disconnected (parent died?). Worker PID ${process.pid} exiting.`);
        writeCrashLog('DISCONNECT', 'Parent process disconnected — worker shutting down');
        process.exit(0);
    });
}
// Export error stats for the health dashboard
function getServerErrorStats() {
    return {
        totalErrors: _errorCount,
        lastErrorTime: _lastErrorTime ? new Date(_lastErrorTime).toISOString() : null,
        uptimeSeconds: process.uptime(),
        nodeVersion: process.version,
        pid: process.pid,
    };
}
// Create HTTP server for WebSocket support
// If loaded from entry.js, reuse the boot server; otherwise create a new one
const bootServer = global.__erpBootServer;
const httpServer = bootServer || http_1.default.createServer(app);
// ── Critical: Prevent 504 Gateway Timeout from Nginx ──
// Node.js default keepAliveTimeout is 5s. Nginx reuses connections with
// keepalive_timeout ~65s. If Nginx sends a request on a connection that
// Node.js has already closed, Nginx gets RST → 504 Gateway Timeout.
// Fix: Keep Node.js connections alive LONGER than Nginx's keepalive_timeout.
httpServer.keepAliveTimeout = 65000; // 65s (must be > Nginx's keepalive_timeout)
httpServer.headersTimeout = 70000; // 70s (must be > keepAliveTimeout)
// ── Port Killer Utility ──
// Proactively kills whatever process is holding a given port.
// This prevents the #1 deployment issue: zombie Node processes holding the port after a crash.
function killPortHolder(port) {
    return new Promise((resolve) => {
        const { exec } = require('child_process');
        const isWin = process.platform === 'win32';
        const myPid = process.pid;
        const parentPid = process.ppid;
        if (isWin) {
            // Windows: find PID(s) listening on the port via netstat, then taskkill them
            exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (err, stdout) => {
                if (err || !stdout.trim()) {
                    resolve(false);
                    return;
                }
                const pids = new Set();
                for (const line of stdout.trim().split('\n')) {
                    const parts = line.trim().split(/\s+/);
                    const pid = parts[parts.length - 1];
                    // Don't kill ourselves or our parent supervisor!
                    if (pid && pid !== '0' && Number(pid) !== myPid && Number(pid) !== parentPid) {
                        pids.add(pid);
                    }
                }
                if (pids.size === 0) {
                    resolve(false);
                    return;
                }
                let killed = 0;
                for (const pid of pids) {
                    console.log(`🔪 Killing zombie process PID ${pid} holding port ${port}`);
                    exec(`taskkill /F /PID ${pid}`, (killErr) => {
                        killed++;
                        if (killed === pids.size) {
                            resolve(true);
                        }
                    });
                }
            });
        }
        else {
            // Linux/macOS: use lsof
            exec(`lsof -t -i:${port}`, (err, stdout) => {
                if (err || !stdout.trim()) {
                    resolve(false);
                    return;
                }
                const pids = stdout.trim().split('\n').filter(p => p && Number(p) !== myPid && Number(p) !== parentPid);
                if (pids.length === 0) {
                    resolve(false);
                    return;
                }
                let killed = 0;
                for (const pid of pids) {
                    console.log(`🔪 Killing zombie process PID ${pid} holding port ${port}`);
                    exec(`kill -9 ${pid}`, () => {
                        killed++;
                        if (killed === pids.length) {
                            resolve(true);
                        }
                    });
                }
            });
        }
        // Safety timeout — don't hang forever
        setTimeout(() => resolve(false), 5000);
    });
}
// ── HTTP Server Error Handlers ──
// Without these, socket-level errors (ECONNRESET, ECONNABORTED, broken
// pipes from idle clients) surface as uncaught exceptions that can crash
// the process. Especially dangerous during idle periods.
let _eaddrinuseRetryCount = 0;
const MAX_EADDRINUSE_RETRIES = 15; // Generous — better to wait 60s than crash-loop forever
httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        const port = Number(PORT);
        if (_eaddrinuseRetryCount < MAX_EADDRINUSE_RETRIES) {
            _eaddrinuseRetryCount++;
            // Kill the zombie on EVERY retry, not just the first — it may respawn
            console.warn(`⚠️ [EADDRINUSE] Port ${port} occupied. Attempt ${_eaddrinuseRetryCount}/${MAX_EADDRINUSE_RETRIES}. Killing zombie...`);
            killPortHolder(port).then((killed) => {
                // Increase wait on later retries: 3s, 3s, 4s, 5s... up to 8s
                const delay = Math.min(3000 + (_eaddrinuseRetryCount - 1) * 500, 8000);
                if (killed) {
                    console.warn(`⚠️ [EADDRINUSE] Killed zombie on port ${port}. Waiting ${delay / 1000}s before retry...`);
                }
                else {
                    console.warn(`⚠️ [EADDRINUSE] No zombie found — port may be in TIME_WAIT. Waiting ${delay / 1000}s...`);
                }
                setTimeout(() => {
                    httpServer.listen(port, '0.0.0.0');
                }, delay);
            });
            return;
        }
        // All retries exhausted — log the EXACT cause for post-mortem
        const exitMsg = `EADDRINUSE: Port ${port} occupied after ${MAX_EADDRINUSE_RETRIES} retries (~60s). Zombie process won't die.`;
        console.error(`🔴 [EADDRINUSE] ${exitMsg}`);
        console.error(`🔴 Fix: Run 'taskkill /F /IM node.exe' to clear all zombies, then restart.`);
        writeCrashLog('EADDRINUSE_FATAL', exitMsg);
        process.exit(1);
    }
    console.error(`🔴 [HTTP Server] Error: ${err.code || err.message}`);
    writeCrashLog('HTTP_SERVER_ERROR', `${err.code || err.message}\n${err.stack || ''}`);
});
httpServer.on('clientError', (err, socket) => {
    // Client sent bad data or disconnected abruptly — not our fault
    if (socket && !socket.destroyed) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
});
// CORS — restrict to configured origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, same-origin)
        // Also allow origin='null' (string) from file:// protocol, sandboxed iframes, Capacitor mobile apps
        if (!origin || origin === 'null')
            return callback(null, true);
        // Allow configured origins
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            return callback(null, true);
        }
        // Allow localhost / 127.0.0.1 on ANY port (dev, preview, etc.)
        try {
            const url = new URL(origin);
            if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
                return callback(null, true);
            }
            // Allow LAN hostnames (non-dotted names like 'desktop-7tg3h7e', 'WORKSTATION')
            if (!url.hostname.includes('.')) {
                return callback(null, true);
            }
            // Allow private/LAN IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x, 100.64-127.x.x Tailscale CGNAT)
            if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(url.hostname)) {
                return callback(null, true);
            }
            // Allow the public VPS IP
            if (url.hostname === '188.245.195.126') {
                return callback(null, true);
            }
        }
        catch (_a) { }
        // Allow ngrok/tailscale subdomains dynamically, and production domain.
        if (origin.endsWith('.ngrok-free.app') || origin.endsWith('.ngrok-free.dev') || origin.endsWith('.ngrok.io') || origin.endsWith('.ts.net') || origin.endsWith('weanst.com') || origin.endsWith('shamshonerp.com') || origin.endsWith('.hostingersite.com')) {
            return callback(null, true);
        }
        callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    exposedHeaders: ['ngrok-skip-browser-warning'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'X-Requested-With']
}));
// ==========================================
// GZIP/DEFLATE COMPRESSION — Critical for Tailscale Funnel & WAN performance
// Compresses all text responses (HTML, JS, CSS, JSON) by ~70-80%
// ==========================================
app.use((0, compression_1.default)({
    level: 6, // Good balance between speed and compression ratio
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
        // Don't compress SSE streams
        if (req.path.startsWith('/api/sse'))
            return false;
        // Use default filter for everything else
        return compression_1.default.filter(req, res);
    }
}));
// Security headers (CSP, HSTS, X-Content-Type-Options, etc.)
// Apply customized, relaxed security headers for client storefronts to support CDNs and inline event handlers
app.use((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    if (req.path.startsWith('/sites/')) {
        return (0, securityMiddleware_1.storefrontSecurityHeaders)(req, res, next);
    }
    // Apply storefront security headers if request host is a custom storefront domain
    const host = req.get('host') || '';
    try {
        const slug = yield getSlugForDomain(host);
        if (slug) {
            return (0, securityMiddleware_1.storefrontSecurityHeaders)(req, res, next);
        }
    }
    catch (err) {
        console.error('Error checking storefront domain for CSP headers:', err);
    }
    (0, securityMiddleware_1.securityHeaders)(req, res, next);
}));
app.use((req, res, next) => {
    (0, securityMiddleware_1.additionalSecurityHeaders)(req, res, next);
});
app.use(body_parser_1.default.json({ limit: '50mb' }));
app.use(body_parser_1.default.urlencoded({ limit: '50mb', extended: true }));
// Automatic Database Connection Leak Sweeper
app.use(db_1.connectionSweepMiddleware);
// PERF: Removed emergency Hostinger debug middleware that logged every HTTP request
// It was causing I/O blocking under load (synchronous console.log per request)
// Track boot state for diagnostics (dbError declared above in crash protection section)
const bootStartTime = Date.now();
app.use((req, res, next) => {
    if (dbReady)
        return next();
    // Allow static assets through — they don't need the database
    const ext = path_1.default.extname(req.path).toLowerCase();
    if (ext && ext !== '.html' && ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map', '.webp'].includes(ext)) {
        return next();
    }
    // Boot status endpoint — ALWAYS accessible, even during startup
    if (req.path === '/api/boot-status') {
        const frontendCheck = (() => {
            try {
                const fs = require('fs');
                const searchPaths = [
                    path_1.default.join(__dirname, '..', 'dist'),
                    path_1.default.join(__dirname, '..', '..', 'dist'),
                    path_1.default.join(__dirname, '..', '..', '..', 'dist'),
                    path_1.default.join(process.cwd(), 'dist'),
                    path_1.default.join(process.cwd(), 'dist', 'public'),
                    path_1.default.join(process.cwd(), 'public'),
                    '/home/u118346121/domains/erp.weanst.com/nodejs/dist/public'
                ];
                return searchPaths.map(p => ({
                    path: path_1.default.resolve(p),
                    hasIndexHtml: fs.existsSync(path_1.default.join(path_1.default.resolve(p), 'index.html')),
                    hasAssets: fs.existsSync(path_1.default.join(path_1.default.resolve(p), 'assets'))
                }));
            }
            catch (e) {
                return e.message;
            }
        })();
        return res.json({
            dbReady,
            dbError: dbError ? 'Database initialization error' : null,
            bootElapsedMs: Date.now() - bootStartTime,
            nodeVersion: process.version,
            platform: process.platform,
            env: {
                NODE_ENV: process.env.NODE_ENV
            },
            hasBootServer: !!global.__erpBootServer
        });
    }
    // Health endpoint — let polling know we're alive but not ready
    if (req.path === '/api/health') {
        return res.status(503).json({ status: 'starting', message: 'Database initializing...', dbError });
    }
    // Settings PUT is allowed during startup — pool is ready even before dbReady flips.
    // Blocking this causes the 503 JSON body to appear in the user's alert dialog.
    if (req.method === 'PUT' && req.path === '/api/settings') {
        return next();
    }
    // API requests — 503 Service Unavailable
    if (req.path.startsWith('/api/')) {
        return res.status(503).json({
            status: 'starting',
            message: 'جاري تشغيل السيرفر... الرجاء الانتظار',
            dbError
        });
    }
    // Frontend / static requests — serve a loading page
    return res.send(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>جاري التشغيل...</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
            color: white; height: 100vh; display: flex; align-items: center; justify-content: center;
        }
        .container { text-align: center; }
        .spinner {
            width: 60px; height: 60px; border: 4px solid rgba(255,255,255,0.1);
            border-top: 4px solid #6366f1; border-radius: 50%;
            animation: spin 1s linear infinite; margin: 0 auto 24px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 8px; }
        p { color: #94a3b8; font-size: 0.9rem; }
    </style>
    <script>setTimeout(() => location.reload(), 3000);</script>
</head>
<body>
    <div class="container">
        <div class="spinner"></div>
        <h1>جاري تشغيل السيرفر...</h1>
        <p>يتم تهيئة قاعدة البيانات، الرجاء الانتظار</p>
    </div>
</body>
</html>`);
});
// Apply rate limiting and request timeout to all API routes
app.use('/api/', rateLimiter_1.apiLimiter);
// ═══════════════════════════════════════════════════════════
// QUERY LIMIT SAFETY CAP — Prevents OOM crash from large queries
// Normal browsing: capped to 500 (fast page loads)
// Export/print/report: capped to 10,000 (when ?export=true)
// This is the #1 fix for the crash loop caused by limit=50000 requests
// flooding the server on startup and exhausting memory.
// ═══════════════════════════════════════════════════════════
const MAX_API_LIMIT = 500;
const MAX_EXPORT_LIMIT = 50000; // For exports, prints, bulk reports
app.use('/api/', (req, res, next) => {
    const isExport = req.query.export === 'true';
    const effectiveMax = isExport ? MAX_EXPORT_LIMIT : MAX_API_LIMIT;
    // Cap query string ?limit=
    if (req.query.limit) {
        const requested = parseInt(req.query.limit, 10);
        if (!isNaN(requested) && requested > effectiveMax) {
            console.warn(`⚠️ [LIMIT CAP] ${req.method} ${req.originalUrl} requested limit=${requested}, capped to ${effectiveMax}${isExport ? ' (export)' : ''}`);
            req.query.limit = String(effectiveMax);
        }
    }
    // Cap body { limit: N } for POST requests
    if (req.body && typeof req.body.limit === 'number' && req.body.limit > effectiveMax) {
        console.warn(`⚠️ [LIMIT CAP] ${req.method} ${req.originalUrl} body.limit=${req.body.limit}, capped to ${effectiveMax}${isExport ? ' (export)' : ''}`);
        req.body.limit = effectiveMax;
    }
    next();
});
// IMPORTANT: Mount sync BEFORE the global 30s timeout — sync runs 90+ sequential
// DB queries in a single transaction and needs 120s.
app.use('/api/sync', requestTimeout_1.reportTimeout, syncRoutes_1.default);
// Backup routes use default API timeout — create responds instantly,
// client polls /backup/status/:backupId for progress
// Global 30s timeout — skip sync (already has 120s), backup (300s), inventory (120s), product writes (image uploads 120s)
app.use('/api/', (req, res, next) => {
    if (req.path.startsWith('/backup') || req.path.startsWith('/inventory'))
        return next();
    // Product create/update can include large base64 images (1-2MB) — give them 2 minutes
    if (req.path.startsWith('/products') && (req.method === 'POST' || req.method === 'PUT')) {
        return (0, requestTimeout_1.requestTimeout)(120000)(req, res, next);
    }
    (0, requestTimeout_1.apiTimeout)(req, res, next);
});
// Public Routes (with rate limiting on auth)
app.use('/api/auth', rateLimiter_1.authLimiter, authRoutes_1.default);
app.use('/api/serials', serialRoutes_1.default);
// Only the /list endpoint is public (used in login year picker)
const fiscalYearController_1 = require("./controllers/fiscalYearController");
app.get('/api/fiscal-years/list', fiscalYearController_1.listFiscalYears);
// Health check for mobile (no auth required) — now includes real pool/DB health
app.get('/api/health', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { runHealthCheck } = yield Promise.resolve().then(() => __importStar(require('./utils/dbHealth')));
        const result = yield runHealthCheck();
        const statusCode = result.status === 'critical' ? 503 : result.status === 'degraded' ? 200 : 200;
        res.status(statusCode).json(result);
    }
    catch (err) {
        res.status(503).json({ status: 'critical', error: err.message, timestamp: new Date().toISOString() });
    }
}));
// SSE (Server-Sent Events) - Public endpoint (handles JWT internally via query param)
// This is the fallback for Hostinger/shared hosting where WebSocket is blocked
app.use('/api/sse', sseRoutes_1.default);
// Public branding endpoint (needed on login screen before auth)
const settingsController_1 = require("./controllers/settingsController");
app.get('/api/settings/branding', settingsController_1.getPublicBranding);
// WhatsApp Webhook — Public endpoint (Meta sends without auth headers)
const whatsappRoutes_1 = require("./routes/whatsappRoutes");
app.use('/api/whatsapp/webhook', whatsappRoutes_1.webhookRouter);
// Debug endpoints removed for production security (C7)
// Use authenticated admin routes for diagnostics instead
// Protected Routes Middleware
// Protect all other API routes + load system config (fiscal year filter, user policies)
const policyMiddleware_1 = require("./middleware/policyMiddleware");
// Shared Storefront Guest Authentication Middleware
const storefrontAuthMiddleware = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const rawSlug = req.params.slug;
    const slug = (typeof rawSlug === 'string' ? rawSlug : '').replace(/[^a-zA-Z0-9-_]/g, '');
    const privateConfigPath = path_1.default.join(sitesPrivatePath, slug, 'private-config.json');
    if (!fs_1.default.existsSync(privateConfigPath)) {
        return res.status(404).json({ error: `Private configuration not found for storefront: ${slug}` });
    }
    try {
        const privateConfig = JSON.parse(fs_1.default.readFileSync(privateConfigPath, 'utf8'));
        const username = (_b = (_a = privateConfig === null || privateConfig === void 0 ? void 0 : privateConfig.api) === null || _a === void 0 ? void 0 : _a.autoLogin) === null || _b === void 0 ? void 0 : _b.username;
        if (!username) {
            return res.status(400).json({ error: 'Storefront user not configured on the server.' });
        }
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const [rows] = yield pool.query(`SELECT id, name, email, username, role, status, permissions, branchId, defaultTreasuryId, warehouseId 
             FROM users 
             WHERE username = ? LIMIT 1`, [username]);
        const dbUser = rows[0];
        if (!dbUser || dbUser.status !== 'ACTIVE') {
            return res.status(403).json({ error: 'Designated storefront user is inactive or does not exist.' });
        }
        let permissions = [];
        if (dbUser.permissions) {
            try {
                permissions = typeof dbUser.permissions === 'string'
                    ? JSON.parse(dbUser.permissions)
                    : dbUser.permissions;
            }
            catch (e) {
                permissions = [];
            }
        }
        req.user = {
            id: dbUser.id,
            username: dbUser.username,
            role: dbUser.role,
            permissions: permissions,
            branchId: dbUser.branchId,
            warehouseId: dbUser.warehouseId
        };
        yield (0, policyMiddleware_1.loadSystemConfig)(req, res, next);
    }
    catch (err) {
        console.error(`❌ Storefront auth middleware error for ${slug}:`, err.message);
        res.status(500).json({ error: `Storefront authentication failed: ${err.message}` });
    }
});
function resolveOrCreatePartner(pool, phone, name, address) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!phone)
            return '';
        const [existing] = yield pool.query("SELECT id FROM partners WHERE phone = ? LIMIT 1", [phone]);
        if (existing && existing.length > 0) {
            return existing[0].id;
        }
        const { randomUUID } = yield Promise.resolve().then(() => __importStar(require('crypto')));
        const partnerId = randomUUID();
        yield pool.query(`INSERT INTO partners (id, name, phone, type, address, status, creditLimit) 
         VALUES (?, ?, ?, 'CUSTOMER', ?, 'ACTIVE', 0)`, [partnerId, name || 'Storefront Customer', phone, address || '']);
        return partnerId;
    });
}
// Storefront guest checkout order submission
app.post('/api/storefront/:slug/order', rateLimiter_1.storefrontOrderLimiter, storefrontAuthMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const rawSlug = req.params.slug;
    const slug = (typeof rawSlug === 'string' ? rawSlug : '').replace(/[^a-zA-Z0-9-_]/g, '');
    const { recoveryToken, customerPhone, customerName, deliveryAddress, paymentMethod, items, totals } = req.body;
    // Input sanitization and validation (Stored XSS / Buffer Overflow prevention)
    const cleanName = String(customerName || '').trim().replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c));
    const cleanPhone = String(customerPhone || '').trim().replace(/[^0-9+\s\-]/g, '');
    const cleanAddress = String(deliveryAddress || '').trim().replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c));
    const cleanPaymentMethod = ['CASH', 'CARD', 'DEFERRED'].includes(String(paymentMethod).toUpperCase()) ? String(paymentMethod).toUpperCase() : 'CASH';
    if (cleanName.length < 3 || cleanName.length > 100) {
        return res.status(400).json({ error: 'الاسم يجب أن يكون بين ٣ و ١٠٠ حرف.' });
    }
    if (cleanPhone.length < 7 || cleanPhone.length > 20) {
        return res.status(400).json({ error: 'رقم الهاتف غير صالح. يجب أن يكون بين ٧ و ٢٠ رقماً.' });
    }
    if (cleanAddress.length < 5 || cleanAddress.length > 500) {
        return res.status(400).json({ error: 'العنوان يجب أن يكون بين ٥ و ٥٠٠ حرف.' });
    }
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        if (recoveryToken) {
            yield pool.query(`UPDATE storefront_abandoned_checkouts SET status = 'COMPLETED' WHERE recoveryToken = ? AND slug = ?`, [recoveryToken, slug]);
        }
        else if (cleanPhone) {
            yield pool.query(`UPDATE storefront_abandoned_checkouts SET status = 'COMPLETED' WHERE customerPhone = ? AND slug = ? AND status = 'PENDING'`, [cleanPhone, slug]);
        }
        const partnerId = yield resolveOrCreatePartner(pool, cleanPhone, cleanName, cleanAddress);
        // Authoritative DB price and cost resolution to block storefront price manipulation exploits
        const productIds = (items || []).map((item) => item.id || item.productId).filter(Boolean);
        const variantIds = (items || []).map((item) => item.variantId).filter(Boolean);
        const productsMap = new Map();
        const variantsMap = new Map();
        if (productIds.length > 0) {
            const [pRows] = yield pool.query('SELECT id, price, cost FROM products WHERE id IN (?)', [productIds]);
            for (const row of pRows) {
                productsMap.set(row.id, { price: Number(row.price) || 0, cost: Number(row.cost) || 0 });
            }
        }
        if (variantIds.length > 0) {
            const [vRows] = yield pool.query('SELECT id, price, cost FROM product_variants WHERE id IN (?)', [variantIds]);
            for (const row of vRows) {
                variantsMap.set(row.id, { price: row.price !== null ? Number(row.price) : null, cost: row.cost !== null ? Number(row.cost) : null });
            }
        }
        const lines = (items || []).map((item) => {
            const pId = item.id || item.productId;
            const vId = item.variantId || null;
            const pInfo = productsMap.get(pId) || { price: 0, cost: 0 };
            const vInfo = vId ? variantsMap.get(vId) : null;
            const authoritativePrice = (vInfo && vInfo.price !== null) ? vInfo.price : pInfo.price;
            const authoritativeCost = (vInfo && vInfo.cost !== null) ? vInfo.cost : pInfo.cost;
            const requestedQty = Number(item.quantity) || 1;
            const requestedDiscount = Number(item.discount) || 0;
            return {
                productId: pId,
                variantId: vId,
                productName: item.name || item.productName,
                quantity: requestedQty,
                price: authoritativePrice,
                cost: authoritativeCost,
                discount: requestedDiscount,
                total: Number((requestedQty * authoritativePrice - requestedDiscount).toFixed(2))
            };
        });
        const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
        const resolvedTotal = Number((subtotal + (Number(totals === null || totals === void 0 ? void 0 : totals.shippingFee) || 0) + (Number(totals === null || totals === void 0 ? void 0 : totals.taxAmount) || 0) - (Number(totals === null || totals === void 0 ? void 0 : totals.whtAmount) || 0)).toFixed(2));
        req.body = {
            id: req.body.id || undefined,
            date: req.body.date || new Date().toISOString().slice(0, 10),
            type: 'INVOICE_SALE',
            partnerId: partnerId || null,
            partnerName: cleanName,
            total: resolvedTotal,
            status: 'confirmed',
            paymentMethod: cleanPaymentMethod,
            notes: `Storefront order via guest checkout. Address: ${cleanAddress}`,
            warehouseId: req.body.warehouseId || ((_a = req.user) === null || _a === void 0 ? void 0 : _a.warehouseId) || (yield getDefaultWarehouseId(pool)),
            lines,
            recoveryToken,
            isStorefront: true
        };
    }
    catch (err) {
        console.warn('⚠️ Storefront order preprocessing failed:', err.message);
    }
    const { createInvoice } = yield Promise.resolve().then(() => __importStar(require('./controllers/invoiceController')));
    createInvoice(req, res);
}));
// Storefront guest coupon validation
app.post('/api/storefront/:slug/validate-coupon', storefrontAuthMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { validateCoupon } = yield Promise.resolve().then(() => __importStar(require('./controllers/promotionController')));
    validateCoupon(req, res);
}));
// Storefront guest abandoned checkout capture
function releaseReservations(conn, token) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!token)
            return;
        const [reservations] = yield conn.query('SELECT productId, variantId, warehouseId, quantity FROM checkout_stock_reservations WHERE recoveryToken = ?', [token]);
        for (const res of reservations) {
            const qty = Number(res.quantity) || 0;
            if (qty <= 0)
                continue;
            yield conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [qty, res.productId]);
            yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) 
             VALUES (UUID(), ?, ?, ?) 
             ON DUPLICATE KEY UPDATE stock = stock + ?`, [res.productId, res.warehouseId, qty, qty]);
            if (res.variantId) {
                yield conn.query('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [qty, res.variantId]);
                yield conn.query(`INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock) 
                 VALUES (UUID(), ?, ?, ?, ?) 
                 ON DUPLICATE KEY UPDATE stock = stock + ?`, [res.variantId, res.productId, res.warehouseId, qty, qty]);
            }
        }
        yield conn.query('DELETE FROM checkout_stock_reservations WHERE recoveryToken = ?', [token]);
    });
}
function getDefaultWarehouseId(conn) {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield conn.query("SELECT id FROM warehouses WHERE isActive = 1 LIMIT 1");
        if (rows && rows.length > 0)
            return rows[0].id;
        const [allRows] = yield conn.query("SELECT id FROM warehouses LIMIT 1");
        if (allRows && allRows.length > 0)
            return allRows[0].id;
        throw new Error('No warehouses configured in the database.');
    });
}
app.post('/api/storefront/:slug/abandoned', rateLimiter_1.storefrontDraftLimiter, storefrontAuthMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const rawSlug = req.params.slug;
    const slug = (typeof rawSlug === 'string' ? rawSlug : '').replace(/[^a-zA-Z0-9-_]/g, '');
    const { customerName, customerPhone, deliveryAddress, cartState, recoveryToken } = req.body;
    const { randomUUID } = yield Promise.resolve().then(() => __importStar(require('crypto')));
    // Input sanitization and validation (Stored XSS / Buffer Overflow prevention)
    const cleanName = String(customerName || '').trim().replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c));
    const cleanPhone = String(customerPhone || '').trim().replace(/[^0-9+\s\-]/g, '');
    const cleanAddress = String(deliveryAddress || '').trim().replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c));
    if (cleanName.length < 2 || cleanName.length > 100) {
        return res.status(400).json({ error: 'الاسم يجب أن يكون بين ٢ و ١٠٠ حرف.' });
    }
    if (cleanPhone.length < 7 || cleanPhone.length > 20) {
        return res.status(400).json({ error: 'رقم الهاتف غير صالح. يجب أن يكون بين ٧ و ٢٠ رقماً.' });
    }
    if (cleanAddress && cleanAddress.length > 500) {
        return res.status(400).json({ error: 'العنوان طويل جداً (بحد أقصى ٥٠٠ حرف).' });
    }
    const conn = yield db_1.pool.getConnection();
    yield conn.beginTransaction();
    try {
        let tokenToUse = recoveryToken;
        let isExisting = false;
        if (tokenToUse) {
            const [rows] = yield conn.query('SELECT id FROM storefront_abandoned_checkouts WHERE recoveryToken = ? AND slug = ? LIMIT 1', [tokenToUse, slug]);
            if (rows.length > 0) {
                isExisting = true;
            }
        }
        if (!tokenToUse) {
            tokenToUse = randomUUID();
        }
        // 1. Release previous reservations under this token to prevent self-blocking
        if (isExisting) {
            yield releaseReservations(conn, tokenToUse);
        }
        // 2. Save or update the draft checkout
        if (isExisting) {
            yield conn.query(`UPDATE storefront_abandoned_checkouts 
                 SET customerName = ?, customerPhone = ?, deliveryAddress = ?, cartState = ?, status = 'PENDING', updatedAt = CURRENT_TIMESTAMP
                 WHERE recoveryToken = ? AND slug = ?`, [cleanName, cleanPhone, cleanAddress || '', JSON.stringify(cartState || {}), tokenToUse, slug]);
        }
        else {
            const id = randomUUID();
            yield conn.query(`INSERT INTO storefront_abandoned_checkouts 
                 (id, slug, recoveryToken, customerName, customerPhone, deliveryAddress, cartState, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`, [id, slug, tokenToUse, cleanName, cleanPhone, cleanAddress || '', JSON.stringify(cartState || {})]);
        }
        // 3. Resolve warehouse ID
        const warehouseId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.warehouseId) || (yield getDefaultWarehouseId(conn));
        // 4. Perform stock checks and reservations
        const items = (cartState === null || cartState === void 0 ? void 0 : cartState.items) || [];
        for (const item of items) {
            const productId = item.id;
            const variantId = item.variantId || null;
            const qty = Number(item.quantity) || 0;
            if (qty <= 0)
                continue;
            // Check stock availability with FOR UPDATE row lock to prevent race conditions
            if (variantId) {
                const [vStockRows] = yield conn.query('SELECT stock FROM product_variant_stocks WHERE variantId = ? AND warehouseId = ? LIMIT 1 FOR UPDATE', [variantId, warehouseId]);
                const currentStock = vStockRows.length > 0 ? Number(vStockRows[0].stock) : 0;
                if (currentStock < qty) {
                    throw new Error(`الكمية المطلوبة من "${item.name || 'المنتج'}" غير متوفرة. المتوفر: ${currentStock}`);
                }
            }
            else {
                const [pStockRows] = yield conn.query('SELECT stock FROM product_stocks WHERE productId = ? AND warehouseId = ? LIMIT 1 FOR UPDATE', [productId, warehouseId]);
                const currentStock = pStockRows.length > 0 ? Number(pStockRows[0].stock) : 0;
                if (currentStock < qty) {
                    throw new Error(`الكمية المطلوبة من "${item.name || 'المنتج'}" غير متوفرة. المتوفر: ${currentStock}`);
                }
            }
            // Decrement stock
            yield conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [qty, productId]);
            yield conn.query(`INSERT INTO product_stocks (id, productId, warehouseId, stock) 
                 VALUES (UUID(), ?, ?, -?) 
                 ON DUPLICATE KEY UPDATE stock = stock - ?`, [productId, warehouseId, qty, qty]);
            if (variantId) {
                yield conn.query('UPDATE product_variants SET stock = stock - ? WHERE id = ?', [qty, variantId]);
                yield conn.query(`INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock) 
                     VALUES (UUID(), ?, ?, ?, -?) 
                     ON DUPLICATE KEY UPDATE stock = stock - ?`, [variantId, productId, warehouseId, qty, qty]);
            }
            // Save reservation
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
            const formattedExpiresAt = expiresAt.toISOString().slice(0, 19).replace('T', ' ');
            yield conn.query(`INSERT INTO checkout_stock_reservations (id, productId, variantId, warehouseId, quantity, recoveryToken, expiresAt, createdAt) 
                 VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())`, [productId, variantId, warehouseId, qty, tokenToUse, formattedExpiresAt]);
        }
        yield conn.commit();
        res.json({ success: true, recoveryToken: tokenToUse });
    }
    catch (err) {
        yield conn.rollback();
        console.error('❌ Failed to save storefront draft checkout & reserve stock:', err.message);
        res.status(400).json({ error: err.message });
    }
    finally {
        conn.release();
    }
}));
// Storefront guest abandoned checkout retrieve
app.get('/api/storefront/:slug/abandoned/:token', storefrontAuthMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const rawSlug = req.params.slug;
    const slug = (typeof rawSlug === 'string' ? rawSlug : '').replace(/[^a-zA-Z0-9-_]/g, '');
    const token = req.params.token;
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const [rows] = yield pool.query(`SELECT customerName, customerPhone, deliveryAddress, cartState, status 
             FROM storefront_abandoned_checkouts 
             WHERE recoveryToken = ? AND slug = ? LIMIT 1`, [token, slug]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Recovery draft checkout not found.' });
        }
        const draft = rows[0];
        let parsedCartState = null;
        try {
            parsedCartState = JSON.parse(draft.cartState);
        }
        catch (jsonErr) {
            console.error('❌ Failed to parse draft cartState:', jsonErr);
        }
        res.json({
            customerName: draft.customerName,
            customerPhone: draft.customerPhone,
            deliveryAddress: draft.deliveryAddress,
            cartState: parsedCartState || { items: [], promo: null },
            status: draft.status
        });
    }
    catch (err) {
        console.error('❌ Failed to retrieve storefront draft checkout:', err);
        res.status(500).json({ error: 'Failed to retrieve draft checkout.' });
    }
}));
app.get('/api/storefront/:slug/config', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const rawSlug = req.params.slug;
    const slug = (typeof rawSlug === 'string' ? rawSlug : '').replace(/[^a-zA-Z0-9-_]/g, '');
    if (!slug) {
        return res.status(400).json({ error: 'Storefront slug is required' });
    }
    try {
        const config = yield getSiteConfig(slug);
        res.json(config);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
app.use('/api', (req, res, next) => {
    // Exclude auth routes (already handled above, but double check)
    if (req.path.startsWith('/auth'))
        return next();
    // Allow public access to view invoices & memberships by ID without credentials
    if (req.method === 'GET' && (req.path.startsWith('/invoices/public/') || req.path.startsWith('/memberships/public/'))) {
        return (0, policyMiddleware_1.loadSystemConfig)(req, res, next);
    }
    // E-commerce public access: Allow read-only operations for products and categories
    // But /products/next-sku is a management route requiring auth/permissions check
    const isPublicGet = req.method === 'GET' && ((req.path.startsWith('/products') && !req.path.startsWith('/products/next-sku')) ||
        req.path.startsWith('/master/categories'));
    if (isPublicGet) {
        return (0, policyMiddleware_1.loadSystemConfig)(req, res, next);
    }
    // Public chat upload endpoint for storefront reviews (images only, rate-limited separately)
    if (req.path === '/chat/upload' && req.method === 'POST') {
        return (0, policyMiddleware_1.loadSystemConfig)(req, res, next);
    }
    // Storefront public guest routes (config, order submission, coupon validation, abandoned checkouts)
    if (req.path.startsWith('/storefront/')) {
        return (0, policyMiddleware_1.loadSystemConfig)(req, res, next);
    }
    (0, authMiddleware_1.authenticateToken)(req, res, () => {
        // After authentication succeeds, load system config for fiscal year filtering & data policies
        (0, policyMiddleware_1.loadSystemConfig)(req, res, () => {
            // Activity logger: logs all write ops + ALL ops for watched users
            (0, activityLogger_1.activityLogger)(req, res, next);
        });
    });
});
// B2B Wholesale Portal Support: Cart Persistence GET endpoint
app.get('/api/portal/cart', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const conn = yield (0, db_1.getConnection)();
        try {
            const [rows] = yield conn.query('SELECT cartState FROM storefront_carts WHERE userId = ?', [userId]);
            if (rows.length === 0) {
                return res.json({ items: [], promo: null });
            }
            try {
                const cartState = JSON.parse(rows[0].cartState);
                res.json(cartState);
            }
            catch (jsonErr) {
                console.error('❌ Failed to parse B2B cartState JSON:', jsonErr);
                res.json({ items: [], promo: null });
            }
        }
        finally {
            conn.release();
        }
    }
    catch (err) {
        console.error('❌ Failed to retrieve B2B cart:', err);
        res.status(500).json({ error: 'Failed to retrieve portal cart.' });
    }
}));
// B2B Wholesale Portal Support: Cart Persistence POST endpoint
app.post('/api/portal/cart', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { cartState } = req.body;
        if (!cartState) {
            return res.status(400).json({ error: 'cartState is required' });
        }
        const conn = yield (0, db_1.getConnection)();
        try {
            yield conn.query(`
                INSERT INTO storefront_carts (userId, cartState) 
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE cartState = VALUES(cartState), updatedAt = CURRENT_TIMESTAMP
            `, [userId, JSON.stringify(cartState)]);
            res.json({ success: true });
        }
        finally {
            conn.release();
        }
    }
    catch (err) {
        console.error('❌ Failed to save B2B cart:', err);
        res.status(500).json({ error: 'Failed to save portal cart.' });
    }
}));
// Routes
// Root route removed to allow frontend serving
// app.get('/', (req, res) => {
//     res.send('Cloud ERP API is running');
// });
app.use('/api/products', productRoutes_1.default);
app.use('/api/partners', partnerRoutes_1.default);
app.use('/api/accounts', accountRoutes_1.default);
app.use('/api/invoices', invoiceRoutes_1.default);
// sync routes mounted above (before global timeout)
app.use('/api/users', activityLogger_1.preferencesGuard, userRoutes_1.default);
app.use('/api/master', masterDataRoutes_1.default);
app.use('/api/treasury', treasuryRoutes_1.default);
app.use('/api/settings', settingsRoutes_1.default);
app.use('/api/inventory', requestTimeout_1.reportTimeout, inventoryRoutes_1.default);
app.use('/api/accounting', fixedAssetsRoutes_1.default);
app.use('/api/accounting/bank-reconciliation', bankReconciliationRoutes_1.default);
app.use('/api/product-stocks', productStockRoutes_1.default);
app.use('/api/price-lists', priceListRoutes_1.default);
app.use('/api/permissions', permissionRoutes_1.default);
app.use('/api/admin', adminRoutes_1.default);
app.use('/api/journals', journalRoutes_1.default);
app.use('/api/cost-centers', costCenterRoutes_1.default);
app.use('/api/fiscal-years', fiscalYearRoutes_1.default);
// Dashboard KPIs (server-side aggregation)
const dashboardRoutes_1 = __importDefault(require("./routes/dashboardRoutes"));
app.use('/api/dashboard', dashboardRoutes_1.default);
// Daily Branch Financial Report (التقرير المالي اليومي)
const dailyReportRoutes_1 = __importDefault(require("./routes/dailyReportRoutes"));
app.use('/api/reports', requestTimeout_1.reportTimeout, dailyReportRoutes_1.default);
// Manufacturing Module Routes
app.use('/api/bom', bomRoutes_1.default);
app.use('/api/production', productionRoutes_1.default);
app.use('/api/stock-movements', stockMovementRoutes_1.default);
app.use('/api/scrap', scrapRoutes_1.default);
app.use('/api/work-centers', workCenterRoutes_1.default);
app.use('/api/routings', routingRoutes_1.default);
app.use('/api/quality', qualityRoutes_1.default);
app.use('/api/batches', batchRoutes_1.default);
app.use('/api/stock-permits', stockPermitRoutes_1.default);
app.use('/api/backup', backupRoutes_1.default); // create responds instantly, client polls for progress
app.use('/api/audit', auditRoutes_1.default);
app.use('/api/migration', migrationRoutes_1.default);
app.use('/api/installments', installmentRoutes_1.default);
app.use('/api/capacity', capacityRoutes_1.default);
app.use('/api/mrp', mrpRoutes_1.default);
app.use('/api/packaging', packagingRoutes_1.default);
// HR & Payroll Module Routes
app.use('/api/hr', hrRoutes_1.default);
app.use('/api/phone-attendance', phoneAttendanceRoutes_1.default);
// CRM (Customer Relationship Management) Module Routes
app.use('/api/crm', crmRoutes_1.default);
// Knowledge Base (قاعدة المعرفة) Routes
app.use('/api/kb', knowledgeBaseRoutes_1.default);
// Van Sales / Mobile Distribution Routes
app.use('/api/vehicles', vehicleRoutes_1.default);
app.use('/api/salesman-targets', salesmanTargetRoutes_1.default);
app.use('/api/commissions', commissionRoutes_1.default);
// POS (Point of Sale) Routes
app.use('/api/pos', posRoutes_1.default);
// Loyalty System Routes (نظام الولاء)
app.use('/api/pos/loyalty', loyaltyRoutes_1.default);
// Promotion Engine Routes (محرك العروض والخصومات)
app.use('/api/pos/promotions', promotionRoutes_1.default);
// Multi-Currency Support Routes
app.use('/api/currencies', currencyRoutes_1.default);
// Delta Sync Routes (for mobile offline)
app.use('/api', deltaSyncRoutes_1.default);
// Ceramics Module Routes (وحدة السيراميك)
app.use('/api/ceramic', ceramicRoutes_1.default);
// Variant Groups Module Routes (مجموعات المتغيرات)
app.use('/api/variant-groups', variantGroupRoutes_1.default);
// Membership Module Routes (نظام الاشتراكات)
const membershipRoutes_1 = __importDefault(require("./routes/membershipRoutes"));
app.use('/api/memberships', membershipRoutes_1.default);
// AI Chatbot Assistant Routes (المساعد الذكي)
const aiChatRoutes_1 = __importDefault(require("./routes/aiChatRoutes"));
app.use('/api/ai-chat', aiChatRoutes_1.default);
const aiReconciliationRoutes_1 = __importDefault(require("./routes/aiReconciliationRoutes"));
app.use('/api/ai-reconciliation', aiReconciliationRoutes_1.default);
// Payment Terms, Credit Limits & Terms & Conditions Routes (شروط الدفع)
const paymentTermsRoutes_1 = __importDefault(require("./routes/paymentTermsRoutes"));
app.use('/api/finance', paymentTermsRoutes_1.default);
// Budget Management Routes (الموازنات)
const budgetRoutes_1 = __importDefault(require("./routes/budgetRoutes"));
app.use('/api/budgets', budgetRoutes_1.default);
// Subscription / Recurring Invoices Routes (الاشتراكات)
const subscriptionRoutes_1 = __importDefault(require("./routes/subscriptionRoutes"));
app.use('/api/subscriptions', subscriptionRoutes_1.default);
// Financial Reports Routes (التقارير المالية المتقدمة)
const financialReportRoutes_1 = __importDefault(require("./routes/financialReportRoutes"));
app.use('/api/financial-reports', financialReportRoutes_1.default);
// WhatsApp Integration Routes (تكامل واتساب)
const whatsappRoutes_2 = __importDefault(require("./routes/whatsappRoutes"));
app.use('/api/whatsapp', whatsappRoutes_2.default);
// Phase 4 — Operational Modules (الوحدات التشغيلية)
const deliveryNoteRoutes_1 = __importDefault(require("./routes/deliveryNoteRoutes"));
app.use('/api/delivery-notes', deliveryNoteRoutes_1.default);
const purchaseReceiptRoutes_1 = __importDefault(require("./routes/purchaseReceiptRoutes"));
app.use('/api/purchase-receipts', purchaseReceiptRoutes_1.default);
const projectRoutes_1 = __importDefault(require("./routes/projectRoutes"));
app.use('/api/projects', projectRoutes_1.default);
const contractRoutes_1 = __importDefault(require("./routes/contractRoutes"));
app.use('/api/contracts', contractRoutes_1.default);
const campaignRoutes_1 = __importDefault(require("./routes/campaignRoutes"));
app.use('/api/campaigns', campaignRoutes_1.default);
// ==========================================
// DASHBOARD KPIs — Server-computed aggregates
// Replaces loading 100K journals into browser for KPI calculation
// PERF: 60s in-memory cache — prevents 8 users all running 7 heavy SQL queries simultaneously
// ==========================================
let _kpiCache = null;
const KPI_CACHE_TTL = 60000; // 60 seconds
function invalidateKPICache() {
    _kpiCache = null;
}
app.get('/api/dashboard-kpis', authMiddleware_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Serve from cache if fresh (within 60s)
    if (_kpiCache && (Date.now() - _kpiCache.timestamp) < KPI_CACHE_TTL) {
        return res.json(_kpiCache.data);
    }
    let conn;
    try {
        const { getConnection } = yield Promise.resolve().then(() => __importStar(require('./db')));
        conn = yield getConnection();
        // All computations in parallel SQL — no need to send raw journals to client
        const [treasuryResult, profitResult, todaySalesResult, pendingChequesResult, dailySalesResult, paymentStatusResult, topCustomersResult] = yield Promise.all([
            // Treasury Balance: JOIN-based aggregation (avoids N+1 correlated subqueries)
            conn.query(`
                SELECT COALESCE(SUM(a.openingBalance + COALESCE(m.netDebit, 0)), 0) as treasuryBalance
                FROM accounts a
                LEFT JOIN (
                    SELECT accountId, SUM(COALESCE(debit, 0)) - SUM(COALESCE(credit, 0)) as netDebit
                    FROM journal_lines GROUP BY accountId
                ) m ON m.accountId = a.id
                WHERE (a.code LIKE '101%' OR a.code LIKE '102%' OR a.code LIKE '106%' OR a.code LIKE '107%' OR a.type = 'BANK' OR (a.type = 'ASSET' AND (a.name LIKE '%صندوق%' OR a.name LIKE '%خزينة%' OR a.name LIKE '%نقدية%' OR a.name LIKE '%بنك%')))
            `),
            // Net Profit: JOIN-based aggregation (avoids N+1 correlated subqueries)
            conn.query(`
                SELECT
                    COALESCE(SUM(CASE WHEN a.type = 'REVENUE' OR a.code LIKE '4%' THEN COALESCE(m.netCredit, 0) ELSE 0 END), 0) as totalRevenue,
                    COALESCE(SUM(CASE WHEN a.type = 'EXPENSE' OR a.code LIKE '5%' THEN COALESCE(m.netDebit, 0) ELSE 0 END), 0) as totalExpenses
                FROM accounts a
                LEFT JOIN (
                    SELECT accountId,
                        SUM(COALESCE(debit, 0)) - SUM(COALESCE(credit, 0)) as netDebit,
                        SUM(COALESCE(credit, 0)) - SUM(COALESCE(debit, 0)) as netCredit
                    FROM journal_lines GROUP BY accountId
                ) m ON m.accountId = a.id
                WHERE a.type IN ('REVENUE', 'EXPENSE') OR a.code LIKE '4%' OR a.code LIKE '5%'
            `),
            // Today's Sales
            conn.query(`
                SELECT COALESCE(SUM(total), 0) as todaySales 
                FROM invoices 
                WHERE DATE(date) = CURDATE() AND type IN ('SALE', 'sale', 'INVOICE_SALE', 'SALE_INVOICE')
                  AND status = 'POSTED'
            `),
            // Pending Cheques
            conn.query(`
                SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total 
                FROM cheques 
                WHERE status IN ('PENDING', 'pending')
            `),
            // Daily Sales (last 7 days)
            conn.query(`
                SELECT DATE(date) as saleDate, COALESCE(SUM(total), 0) as dayTotal
                FROM invoices
                WHERE date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) 
                  AND type IN ('SALE', 'sale', 'INVOICE_SALE', 'SALE_INVOICE')
                  AND status = 'POSTED'
                GROUP BY DATE(date)
                ORDER BY saleDate
            `),
            // Payment Status Breakdown (for sale invoices)
            conn.query(`
                SELECT 
                    SUM(CASE WHEN paymentMethod != 'CREDIT' OR COALESCE(paidAmount, 0) >= total THEN 1 ELSE 0 END) as paidCount,
                    SUM(CASE WHEN paymentMethod != 'CREDIT' OR COALESCE(paidAmount, 0) >= total THEN total ELSE 0 END) as paidTotal,
                    SUM(CASE WHEN paymentMethod = 'CREDIT' AND COALESCE(paidAmount, 0) > 0 AND COALESCE(paidAmount, 0) < total THEN 1 ELSE 0 END) as partialCount,
                    SUM(CASE WHEN paymentMethod = 'CREDIT' AND COALESCE(paidAmount, 0) > 0 AND COALESCE(paidAmount, 0) < total THEN total ELSE 0 END) as partialTotal,
                    SUM(CASE WHEN paymentMethod = 'CREDIT' AND COALESCE(paidAmount, 0) = 0 THEN 1 ELSE 0 END) as unpaidCount,
                    SUM(CASE WHEN paymentMethod = 'CREDIT' AND COALESCE(paidAmount, 0) = 0 THEN total ELSE 0 END) as unpaidTotal,
                    COUNT(*) as totalInvoices
                FROM invoices
                WHERE type IN ('SALE', 'sale', 'INVOICE_SALE', 'SALE_INVOICE')
                  AND status = 'POSTED'
            `),
            // Top 5 Customers by Sales
            conn.query(`
                SELECT COALESCE(partnerName, 'عميل نقدي') as name, SUM(total) as total, COUNT(*) as count
                FROM invoices
                WHERE type IN ('SALE', 'sale', 'INVOICE_SALE', 'SALE_INVOICE')
                  AND status = 'POSTED'
                GROUP BY partnerName
                ORDER BY total DESC
                LIMIT 5
            `),
        ]);
        conn.release();
        conn = null;
        const treasury = treasuryResult[0][0];
        const profit = profitResult[0][0];
        const todaySales = todaySalesResult[0][0];
        const pendingCheques = pendingChequesResult[0][0];
        const dailySalesRows = dailySalesResult[0];
        const paymentStatus = paymentStatusResult[0][0];
        const topCustomers = topCustomersResult[0];
        // Build daily sales array with day names
        const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const dailySales = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const row = dailySalesRows.find((r) => {
                const rd = new Date(r.saleDate);
                return rd.toISOString().slice(0, 10) === dateStr;
            });
            dailySales.push({
                date: dateStr,
                label: i === 0 ? 'اليوم' : i === 1 ? 'أمس' : dayNames[d.getDay()],
                total: row ? Number(row.dayTotal) : 0
            });
        }
        const kpiData = {
            treasuryBalance: Number(treasury.treasuryBalance) || 0,
            totalRevenue: Number(profit.totalRevenue) || 0,
            totalExpenses: Number(profit.totalExpenses) || 0,
            netProfit: (Number(profit.totalRevenue) || 0) - (Number(profit.totalExpenses) || 0),
            todaySales: Number(todaySales.todaySales) || 0,
            pendingChequesCount: Number(pendingCheques.count) || 0,
            pendingChequesTotal: Number(pendingCheques.total) || 0,
            dailySales,
            paymentBreakdown: {
                paidCount: Number(paymentStatus.paidCount) || 0,
                partialCount: Number(paymentStatus.partialCount) || 0,
                unpaidCount: Number(paymentStatus.unpaidCount) || 0,
                paidTotal: Number(paymentStatus.paidTotal) || 0,
                partialTotal: Number(paymentStatus.partialTotal) || 0,
                unpaidTotal: Number(paymentStatus.unpaidTotal) || 0,
                totalInvoices: Number(paymentStatus.totalInvoices) || 0,
            },
            topCustomers: topCustomers.map((c) => ({
                name: c.name,
                total: Number(c.total) || 0,
                count: Number(c.count) || 0,
            })),
        };
        // Cache the result for 60s
        _kpiCache = { data: kpiData, timestamp: Date.now() };
        res.json(kpiData);
    }
    catch (error) {
        if (conn)
            try {
                conn.release();
            }
            catch ( /* ignore */_a) { /* ignore */ }
        console.error('❌ Dashboard KPIs failed:', error);
        res.status(500).json({ error: 'Failed to compute dashboard KPIs' });
    }
}));
// ==========================================
// BATCH INIT ENDPOINT — Single request for all critical startup data
// Saves 7 extra round trips over Tailscale Funnel (~700ms+ latency saved)
// PERF: 30s in-memory cache — prevents 8 parallel queries on every F5/navigation
// ==========================================
let _initCache = null;
const INIT_CACHE_TTL = 30000; // 30 seconds
app.get('/api/init', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Check cache first — all users share the same init data
    if (_initCache && (Date.now() - _initCache.timestamp) < INIT_CACHE_TTL) {
        return res.json(_initCache.data);
    }
    let conn;
    try {
        const { getConnection } = yield Promise.resolve().then(() => __importStar(require('./db')));
        conn = yield getConnection();
        // Helper: run query safely, fallback to simpler query or empty on error
        const safeQuery = (primary, fallback) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const [rows] = yield conn.query(primary);
                return rows;
            }
            catch (e) {
                if (fallback) {
                    try {
                        const [rows] = yield conn.query(fallback);
                        return rows;
                    }
                    catch (_a) {
                        return [];
                    }
                }
                return [];
            }
        });
        // Run ALL queries in parallel — each individually resilient
        const [partners, accounts, invoices, configRows, users, permissions, branches, warehouses] = yield Promise.all([
            // Partners (limit 200) — fallback drops newer columns
            safeQuery(`SELECT id, name, type, balance, phone, email, isCustomer, isSupplier, salesmanId, groupId, creditLimit, priceListId FROM partners ORDER BY name LIMIT 200`, `SELECT id, name, type, balance, phone, email, isCustomer, isSupplier FROM partners ORDER BY name LIMIT 200`),
            // Accounts — safe core columns
            safeQuery(`SELECT id, name, code, type, balance FROM accounts ORDER BY code`),
            // Invoices (limit 200) — fallback drops newer columns
            safeQuery(`SELECT i.id, i.number, i.type, i.date, i.total, i.status, i.partnerId, i.partnerName, i.paymentMethod, i.paidAmount, i.salesmanId, s.name as salesmanName, i.globalDiscount, i.currencyCode, i.warehouseId, i.createdAt FROM invoices i LEFT JOIN salesmen s ON i.salesmanId = s.id ORDER BY i.date DESC LIMIT 200`, `SELECT id, number, type, date, total, status, partnerId, partnerName, paymentMethod FROM invoices ORDER BY date DESC LIMIT 200`),
            // System Config
            safeQuery(`SELECT * FROM system_config LIMIT 1`),
            // Users — fallback drops newer columns
            safeQuery(`SELECT id, name, email, username, plain_password, role, status, permissions, lastLogin, avatar, salesmanId, preferences, branchId, defaultTreasuryId, warehouseId, isHidden FROM users WHERE isHidden = FALSE OR isHidden IS NULL`, `SELECT id, name, email, username, role, status, permissions, lastLogin, avatar FROM users`),
            // Permissions
            safeQuery(`SELECT id, label, module FROM permissions ORDER BY module`),
            // Branches — table might not exist
            safeQuery(`SELECT id, name, code, isActive FROM branches ORDER BY name`),
            // Warehouses — table might not exist
            safeQuery(`SELECT id, name, code, branchId, isDefault FROM warehouses ORDER BY name`, `SELECT id, name, code FROM warehouses ORDER BY name`),
        ]);
        conn.release();
        conn = null;
        // Parse system config (same logic as settingsController.getSystemConfig)
        let config = {};
        if (configRows.length > 0) {
            const row = configRows[0];
            // Parse the JSON 'config' column
            let additionalConfig = {};
            if (row.config && typeof row.config === 'string') {
                try {
                    additionalConfig = JSON.parse(row.config);
                }
                catch (e) { /* ignore */ }
            }
            else if (row.config && typeof row.config === 'object') {
                additionalConfig = row.config;
            }
            // Handle double-encoded legacy format: config column may contain
            // {"config": "{\"modules\":{...}}", ...} where the inner config is
            // itself a JSON string that needs a second parse.
            if (additionalConfig.config && typeof additionalConfig.config === 'string') {
                try {
                    const nested = JSON.parse(additionalConfig.config);
                    additionalConfig = Object.assign(Object.assign({}, additionalConfig), nested);
                    delete additionalConfig.config;
                }
                catch (e) { /* ignore */ }
            }
            config = Object.assign(Object.assign({}, additionalConfig), { companyName: row.companyName, companyAddress: row.companyAddress, companyPhone: row.companyPhone, companyEmail: row.companyEmail, taxId: row.taxId, commercialRegister: row.commercialRegister, currency: row.currency, vatRate: row.vatRate, modules: Object.assign({ sales: true, purchase: true, inventory: true, accounting: true, treasury: true, banks: true, partners: true, manufacturing: true, hr: true }, additionalConfig.modules) });
        }
        const initData = {
            partners: { partners, pagination: { total: partners.length, page: 1, limit: 200, totalPages: 1 } },
            accounts,
            invoices: { invoices, pagination: { total: invoices.length, page: 1, limit: 200, totalPages: 1 } },
            config,
            users,
            permissions,
            branches,
            warehouses,
        };
        // Cache for 30s — all subsequent users get instant response
        _initCache = { data: initData, timestamp: Date.now() };
        // Guard: if timeout middleware responded while we were querying, don't send again
        if (res.headersSent)
            return;
        res.json(initData);
    }
    catch (error) {
        if (conn)
            try {
                conn.release();
            }
            catch ( /* ignore */_a) { /* ignore */ }
        // Guard: if timeout middleware already responded, don't try to send again
        if (res.headersSent) {
            console.error('❌ Batch init failed (response already sent, suppressing):', error === null || error === void 0 ? void 0 : error.message);
            return;
        }
        console.error('❌ Batch init failed:', error);
        res.status(500).json({ error: 'Failed to load initial data' });
    }
}));
// ========================================
// CHAT API (persistent team chat - دردشة الفريق)
// ========================================
// Helper to parse JSON fields safely
function parseJSONField(field, defaultValue) {
    if (field === null || field === undefined)
        return defaultValue;
    if (typeof field === 'object')
        return field;
    try {
        return typeof field === 'string' ? JSON.parse(field) : field;
    }
    catch (_a) {
        return defaultValue;
    }
}
// Multer configuration for chat file uploads
const chatUploadDir = path_1.default.join(uploadsPath, 'chat');
if (!fs_1.default.existsSync(chatUploadDir))
    fs_1.default.mkdirSync(chatUploadDir, { recursive: true });
const chatStorage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, chatUploadDir),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        cb(null, `chat-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
});
const chatUpload = (0, multer_1.default)({
    storage: chatStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        var _a;
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        const mimeToExt = {
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png': ['.png'],
            'image/gif': ['.gif'],
            'image/webp': ['.webp'],
            'application/pdf': ['.pdf']
        };
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const mType = file.mimetype;
        // Ensure extension matches mimetype
        if (!allowedTypes.includes(mType) || !((_a = mimeToExt[mType]) === null || _a === void 0 ? void 0 : _a.includes(ext))) {
            return cb(new Error('File extension does not match file type or format is not allowed'), false);
        }
        // Restrict guests to images only
        const hasAuth = !!(req.user || req.headers['authorization']);
        if (!hasAuth && mType === 'application/pdf') {
            return cb(new Error('Guests are only allowed to upload images (PNG, JPG, JPEG, GIF, WEBP)'), false);
        }
        cb(null, true);
    },
});
// File upload endpoint for chat attachments (guest uploads rate-limited, images-only)
app.post('/api/chat/upload', rateLimiter_1.uploadLimiter, (req, res, next) => {
    chatUpload.single('file')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message || 'File upload failed' });
        }
        next();
    });
}, (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded or invalid file format' });
    }
    const type = req.file.mimetype.startsWith('image/') ? 'image' : 'pdf';
    res.json({
        url: `/uploads/chat/${req.file.filename}`,
        type,
        name: req.file.originalname,
        size: req.file.size
    });
});
// Get public messages (last 200)
app.get('/api/chat/messages', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const [rows] = yield pool.query(`SELECT id, userId, userName, message, type, targetUserId, reactions, replyTo, attachment, timestamp, readReceipts, editedAt, isPinned, pinnedAt, pinnedBy 
             FROM chat_messages 
             WHERE type != 'private'
             ORDER BY timestamp DESC 
             LIMIT 200`);
        // Return in chronological order and parse JSON columns
        const mapped = rows.map((m) => (Object.assign(Object.assign({}, m), { reactions: parseJSONField(m.reactions, {}), readReceipts: parseJSONField(m.readReceipts, {}), replyTo: parseJSONField(m.replyTo, null), attachment: parseJSONField(m.attachment, null) })));
        res.json({ messages: mapped.reverse() });
    }
    catch (error) {
        console.error('❌ Chat fetch error:', error.message);
        res.json({ messages: [] });
    }
}));
// Get private conversation with a specific user (last 100)
app.get('/api/chat/private/:userId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const otherUserId = req.params.userId;
        const [rows] = yield pool.query(`SELECT id, userId, userName, message, type, targetUserId, reactions, replyTo, attachment, timestamp, readReceipts, editedAt, isPinned, pinnedAt, pinnedBy 
             FROM chat_messages 
             WHERE type = 'private'
               AND ((userId = ? AND targetUserId = ?) OR (userId = ? AND targetUserId = ?))
             ORDER BY timestamp DESC 
             LIMIT 100`, [currentUserId, otherUserId, otherUserId, currentUserId]);
        // Return in chronological order and parse JSON columns
        const mapped = rows.map((m) => (Object.assign(Object.assign({}, m), { reactions: parseJSONField(m.reactions, {}), readReceipts: parseJSONField(m.readReceipts, {}), replyTo: parseJSONField(m.replyTo, null), attachment: parseJSONField(m.attachment, null) })));
        res.json({ messages: mapped.reverse() });
    }
    catch (error) {
        console.error('❌ Private chat fetch error:', error.message);
        res.json({ messages: [] });
    }
}));
// Clear messages in a chat (public, private, or group)
app.delete('/api/chat/messages/clear', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const currentUserRole = (((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) || '').toUpperCase();
        const isAdmin = currentUserRole === 'ADMIN' || currentUserRole === 'SUPERADMIN';
        const chatMode = req.query.chatMode;
        const targetId = req.query.targetId;
        if (chatMode === 'public') {
            if (isAdmin) {
                yield pool.query("DELETE FROM chat_messages WHERE type != 'private' AND type != 'group'");
            }
            else {
                yield pool.query("DELETE FROM chat_messages WHERE type != 'private' AND type != 'group' AND userId = ?", [currentUserId]);
            }
        }
        else if (chatMode === 'private') {
            if (!targetId) {
                return res.status(400).json({ error: 'targetId is required for private chat clear' });
            }
            if (isAdmin) {
                yield pool.query("DELETE FROM chat_messages WHERE type = 'private' AND ((userId = ? AND targetUserId = ?) OR (userId = ? AND targetUserId = ?))", [currentUserId, targetId, targetId, currentUserId]);
            }
            else {
                yield pool.query("DELETE FROM chat_messages WHERE type = 'private' AND userId = ? AND targetUserId = ?", [currentUserId, targetId]);
            }
        }
        else if (chatMode === 'group') {
            if (!targetId) {
                return res.status(400).json({ error: 'targetId is required for group chat clear' });
            }
            if (isAdmin) {
                yield pool.query("DELETE FROM chat_messages WHERE type = 'group' AND groupId = ?", [targetId]);
            }
            else {
                yield pool.query("DELETE FROM chat_messages WHERE type = 'group' AND groupId = ? AND userId = ?", [targetId, currentUserId]);
            }
        }
        else {
            return res.status(400).json({ error: 'Invalid chatMode' });
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('❌ Chat clear error:', error.message);
        res.status(500).json({ error: 'Failed to clear chat messages' });
    }
}));
// Delete a message (own messages only)
app.delete('/api/chat/messages/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        yield pool.query('DELETE FROM chat_messages WHERE id = ? AND userId = ?', [req.params.id, currentUserId]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('❌ Chat delete error:', error.message);
        res.status(500).json({ error: 'Failed to delete' });
    }
}));
// Mark messages in a chat as read
app.post('/api/chat/read', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { chatMode, targetId } = req.body;
        if (!chatMode || !targetId) {
            return res.status(400).json({ error: 'chatMode and targetId are required' });
        }
        const now = new Date().toISOString();
        const jsonPath = `$."${currentUserId}"`;
        if (chatMode === 'private') {
            yield pool.query(`UPDATE chat_messages 
                 SET readReceipts = JSON_SET(COALESCE(readReceipts, '{}'), ?, ?) 
                 WHERE type = 'private' 
                   AND userId = ? 
                   AND targetUserId = ? 
                   AND (readReceipts IS NULL OR JSON_EXTRACT(readReceipts, ?) IS NULL)`, [jsonPath, now, targetId, currentUserId, jsonPath]);
        }
        else if (chatMode === 'group') {
            yield pool.query(`UPDATE chat_messages 
                 SET readReceipts = JSON_SET(COALESCE(readReceipts, '{}'), ?, ?) 
                 WHERE type = 'group' 
                   AND groupId = ? 
                   AND userId != ?
                   AND (readReceipts IS NULL OR JSON_EXTRACT(readReceipts, ?) IS NULL)`, [jsonPath, now, targetId, currentUserId, jsonPath]);
        }
        // Broadcast read receipt event
        const { eventBus } = yield Promise.resolve().then(() => __importStar(require('./utils/eventBus')));
        eventBus.broadcast('chat:read', {
            chatMode,
            targetId,
            userId: currentUserId,
            readTime: now,
            targetUserId: chatMode === 'private' ? targetId : undefined,
            messageSenderId: currentUserId
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('❌ Chat read receipt error:', error.message);
        res.status(500).json({ error: 'Failed to mark messages as read' });
    }
}));
// Edit a message (own messages only, within 15 minutes, until someone replies)
app.put('/api/chat/messages/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const messageId = req.params.id;
        const { message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message text is required' });
        }
        // Fetch existing message to validate ownership & time limit
        const [rows] = yield pool.query('SELECT userId, type, targetUserId, groupId, timestamp FROM chat_messages WHERE id = ?', [messageId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        const msg = rows[0];
        if (msg.userId !== currentUserId) {
            return res.status(403).json({ error: 'Cannot edit another user\'s message' });
        }
        // 15-minute time limit check
        const elapsed = Date.now() - new Date(msg.timestamp).getTime();
        if (elapsed > 15 * 60 * 1000) {
            return res.status(400).json({ error: 'Messages can only be edited within 15 minutes' });
        }
        // Check if there are any subsequent messages in the conversation (until replies)
        let checkReplySql = '';
        let checkParams = [];
        if (msg.type === 'private') {
            checkReplySql = `
                SELECT COUNT(*) as count FROM chat_messages 
                WHERE type = 'private' 
                  AND ((userId = ? AND targetUserId = ?) OR (userId = ? AND targetUserId = ?)) 
                  AND timestamp > ?`;
            checkParams = [currentUserId, msg.targetUserId, msg.targetUserId, currentUserId, msg.timestamp];
        }
        else if (msg.type === 'group') {
            checkReplySql = `
                SELECT COUNT(*) as count FROM chat_messages 
                WHERE type = 'group' 
                  AND groupId = ? 
                  AND timestamp > ?`;
            checkParams = [msg.groupId, msg.timestamp];
        }
        else {
            checkReplySql = `
                SELECT COUNT(*) as count FROM chat_messages 
                WHERE type = 'message' 
                  AND timestamp > ?`;
            checkParams = [msg.timestamp];
        }
        const [replyRows] = yield pool.query(checkReplySql, checkParams);
        if (((_b = replyRows[0]) === null || _b === void 0 ? void 0 : _b.count) > 0) {
            return res.status(400).json({ error: 'Cannot edit message after replies have been sent' });
        }
        const editedAt = new Date();
        yield pool.query('UPDATE chat_messages SET message = ?, editedAt = ? WHERE id = ?', [message.trim(), editedAt, messageId]);
        // Broadcast the edit event
        const { eventBus } = yield Promise.resolve().then(() => __importStar(require('./utils/eventBus')));
        eventBus.broadcast('chat:edit', {
            messageId,
            message: message.trim(),
            editedAt: editedAt.toISOString(),
            type: msg.type,
            targetUserId: msg.targetUserId,
            messageSenderId: msg.userId,
            groupId: msg.groupId
        });
        res.json({ success: true, editedAt });
    }
    catch (error) {
        console.error('❌ Chat edit error:', error.message);
        res.status(500).json({ error: 'Failed to edit message' });
    }
}));
// Pin a message
app.post('/api/chat/messages/:id/pin', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'مستخدم';
        const messageId = req.params.id;
        // Fetch existing message
        const [rows] = yield pool.query('SELECT userId, type, targetUserId, groupId FROM chat_messages WHERE id = ?', [messageId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        const msg = rows[0];
        const pinnedAt = new Date();
        yield pool.query('UPDATE chat_messages SET isPinned = TRUE, pinnedAt = ?, pinnedBy = ? WHERE id = ?', [pinnedAt, userName, messageId]);
        // Broadcast pin event
        const { eventBus } = yield Promise.resolve().then(() => __importStar(require('./utils/eventBus')));
        eventBus.broadcast('chat:pin', {
            messageId,
            isPinned: true,
            pinnedBy: userName,
            pinnedAt: pinnedAt.toISOString(),
            type: msg.type,
            groupId: msg.groupId,
            targetUserId: msg.targetUserId,
            messageSenderId: msg.userId
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('❌ Chat pin error:', error.message);
        res.status(500).json({ error: 'Failed to pin message' });
    }
}));
// Unpin a message
app.delete('/api/chat/messages/:id/pin', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const messageId = req.params.id;
        const [rows] = yield pool.query('SELECT userId, type, targetUserId, groupId FROM chat_messages WHERE id = ?', [messageId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        const msg = rows[0];
        yield pool.query('UPDATE chat_messages SET isPinned = FALSE, pinnedAt = NULL, pinnedBy = NULL WHERE id = ?', [messageId]);
        // Broadcast unpin event
        const { eventBus } = yield Promise.resolve().then(() => __importStar(require('./utils/eventBus')));
        eventBus.broadcast('chat:pin', {
            messageId,
            isPinned: false,
            type: msg.type,
            groupId: msg.groupId,
            targetUserId: msg.targetUserId,
            messageSenderId: msg.userId
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('❌ Chat unpin error:', error.message);
        res.status(500).json({ error: 'Failed to unpin message' });
    }
}));
// Get all groups for current user (plus sync auto-groups first)
app.get('/api/chat/groups', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { pool, syncBranchChatGroups } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!currentUserId)
            return res.status(401).json({ error: 'Unauthorized' });
        // Ensure branch groups and memberships are synced
        yield syncBranchChatGroups();
        // Query all groups the user is a member of
        const [groups] = yield pool.query(`SELECT g.id, g.name, g.description, g.type, g.branchId, g.createdBy, g.createdAt 
             FROM chat_groups g
             JOIN chat_group_members m ON g.id = m.groupId
             WHERE m.userId = ?
             ORDER BY g.type = 'GLOBAL' DESC, g.type = 'BRANCH' DESC, g.name ASC`, [currentUserId]);
        res.json({ groups });
    }
    catch (error) {
        console.error('❌ Chat groups fetch error:', error.message);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
}));
// Create a custom chat group
app.post('/api/chat/groups', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const currentUserName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'User';
        const { name, description, userIds } = req.body;
        if (!(name === null || name === void 0 ? void 0 : name.trim())) {
            return res.status(400).json({ error: 'Group name is required' });
        }
        const groupId = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // Use connection for transaction
        const conn = yield pool.getConnection();
        try {
            yield conn.beginTransaction();
            // Insert group
            yield conn.query(`INSERT INTO chat_groups (id, name, description, type, createdBy) 
                 VALUES (?, ?, ?, 'CUSTOM', ?)`, [groupId, name.trim(), description || null, currentUserName]);
            // Add members (creator + selected users)
            const membersToInsert = Array.from(new Set([currentUserId, ...(userIds || [])]));
            for (const memberId of membersToInsert) {
                if (memberId) {
                    yield conn.query(`INSERT INTO chat_group_members (groupId, userId) VALUES (?, ?)`, [groupId, memberId]);
                }
            }
            yield conn.commit();
            // Fetch the created group to return it
            const [grpRows] = yield conn.query(`SELECT id, name, description, type, branchId, createdBy, createdAt FROM chat_groups WHERE id = ?`, [groupId]);
            res.status(201).json({ success: true, group: grpRows[0] });
        }
        catch (txErr) {
            yield conn.rollback();
            throw txErr;
        }
        finally {
            conn.release();
        }
    }
    catch (error) {
        console.error('❌ Group creation error:', error.message);
        res.status(500).json({ error: 'Failed to create group' });
    }
}));
// Get messages for a specific group (only if user is a member)
app.get('/api/chat/groups/:groupId/messages', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { groupId } = req.params;
        // Verify membership first
        const [membership] = yield pool.query(`SELECT 1 FROM chat_group_members WHERE groupId = ? AND userId = ?`, [groupId, currentUserId]);
        if (membership.length === 0) {
            return res.status(403).json({ error: 'You are not a member of this group' });
        }
        // Fetch last 150 group messages
        const [messages] = yield pool.query(`SELECT id, userId, userName, message, type, groupId, reactions, replyTo, attachment, timestamp, readReceipts, editedAt, isPinned, pinnedAt, pinnedBy 
             FROM chat_messages 
             WHERE type = 'group' AND groupId = ?
             ORDER BY timestamp DESC
             LIMIT 150`, [groupId]);
        // Parse JSON columns safely
        const mapped = messages.map((m) => (Object.assign(Object.assign({}, m), { reactions: parseJSONField(m.reactions, {}), readReceipts: parseJSONField(m.readReceipts, {}), replyTo: parseJSONField(m.replyTo, null), attachment: parseJSONField(m.attachment, null) })));
        res.json({ messages: mapped.reverse() });
    }
    catch (error) {
        console.error('❌ Group messages fetch error:', error.message);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
}));
// Get list of members in a group
app.get('/api/chat/groups/:groupId/members', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { groupId } = req.params;
        // Verify membership first
        const [membership] = yield pool.query(`SELECT 1 FROM chat_group_members WHERE groupId = ? AND userId = ?`, [groupId, currentUserId]);
        if (membership.length === 0) {
            return res.status(403).json({ error: 'You are not a member of this group' });
        }
        // Fetch users in the group (excluding password and sensitive fields)
        const [members] = yield pool.query(`SELECT u.id, u.name, u.email, u.username, u.role, u.avatar 
             FROM users u
             JOIN chat_group_members m ON u.id = m.userId
             WHERE m.groupId = ? AND (u.isHidden = FALSE OR u.isHidden IS NULL)
             ORDER BY u.name ASC`, [groupId]);
        res.json({ members });
    }
    catch (error) {
        console.error('❌ Group members fetch error:', error.message);
        res.status(500).json({ error: 'Failed to fetch members' });
    }
}));
// Serve static frontend files (production build)
// Check multiple possible locations for the frontend build:
// 1. Root-level dist (when running with ts-node from server/)
// 2. Root-level dist (when running compiled JS from server/dist/server/)
// 3. Fallback to build folder for legacy packages
// Robust frontend path resolution
const findFrontendPath = () => {
    // 1. Allow env var override
    if (process.env.FRONTEND_PATH && fs_1.default.existsSync(path_1.default.join(process.env.FRONTEND_PATH, 'index.html'))) {
        return process.env.FRONTEND_PATH;
    }
    const searchPaths = [
        path_1.default.join(__dirname, '..', 'dist'), // Standard: server/dist/dist (unlikely but checked)
        path_1.default.join(__dirname, '..', '..', 'dist'), // Standard Prod: server/dist/../dist -> server/dist
        path_1.default.join(__dirname, '..', '..', '..', 'dist'), // Standard Repo: server/dist/server/../../../dist -> root/dist
        path_1.default.join(__dirname, '..', 'public'), // Fallback
        path_1.default.join(process.cwd(), 'dist'), // CWD based
        path_1.default.join(process.cwd(), 'dist', 'public'), // CWD/dist/public (Hostinger layout)
        path_1.default.join(process.cwd(), '..', 'dist'), // Parent of CWD
        '/app/dist', // Common Docker path
        // Hostinger-specific paths
        path_1.default.join(process.cwd(), 'public'), // CWD/public
        '/home/u118346121/domains/erp.weanst.com/nodejs/dist/public' // Hostinger exact path
    ];
    console.log('🔍 Searching for frontend build...');
    console.log(`   Current directory (__dirname): ${__dirname}`);
    console.log(`   Working directory (cwd): ${process.cwd()}`);
    for (const p of searchPaths) {
        const testPath = path_1.default.resolve(p);
        const indexPath = path_1.default.join(testPath, 'index.html');
        console.log(`   Checking: ${indexPath} → ${fs_1.default.existsSync(indexPath) ? '✅ FOUND' : '❌'}`);
        if (fs_1.default.existsSync(indexPath)) {
            console.log(`✅ Found frontend at: ${testPath}`);
            return testPath;
        }
    }
    console.error('❌ COULD NOT FIND FRONTEND BUILD (index.html)');
    console.error('   Please run "npm run build" in the root directory.');
    console.error('   falling back to default path...');
    return searchPaths[2]; // Default to ../../../dist in case of weird permissions
};
const frontendPath = findFrontendPath();
console.log(`📂 Serving frontend from: ${frontendPath}`);
// ==========================================
// CACHING HEADERS MIDDLEWARE 
// (Note: Headers are set here, but if the file is NOT found, we MUST remove them 
// in the 404 handler to prevent caching 404s for 1 year!)
// ==========================================
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path.startsWith('/sites/')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    else if (req.path.startsWith('/assets/')) {
        // Hashed assets — cache for 1 year (immutable)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    else if (req.path.match(/\.(js|css|woff2?|ttf|eot)$/)) {
        // Unhashed static files — cache for 1 day
        res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    else if (req.path.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/)) {
        // Images — cache for 7 days
        res.setHeader('Cache-Control', 'public, max-age=604800');
    }
    next();
});
let domainToSlugCache = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 30000; // 30 seconds
function getSlugForDomain(host) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!host)
            return null;
        const domain = host.split(':')[0].toLowerCase();
        // Ignore default domains
        const defaultDomains = ['localhost', '127.0.0.1', 'cloud-erp.com', 'erp.weanst.com'];
        if (defaultDomains.includes(domain)) {
            return null;
        }
        const now = Date.now();
        if (domainToSlugCache && (now - lastCacheUpdate < CACHE_TTL)) {
            return domainToSlugCache[domain] || domainToSlugCache[`www.${domain}`] || null;
        }
        const newCache = {};
        // 1. Query from DB
        try {
            const [rows] = yield db_1.pool.query('SELECT tenantSlug, configText FROM storefront_tenant_configs');
            for (const row of rows) {
                try {
                    const config = JSON.parse(row.configText);
                    if (config.customDomain) {
                        const customDomain = config.customDomain.trim().toLowerCase();
                        newCache[customDomain] = row.tenantSlug;
                        if (!customDomain.startsWith('www.')) {
                            newCache[`www.${customDomain}`] = row.tenantSlug;
                        }
                        else {
                            newCache[customDomain.replace(/^www\./, '')] = row.tenantSlug;
                        }
                    }
                }
                catch (e) {
                    console.warn(`Failed to parse config for domain mapping from DB for ${row.tenantSlug}:`, e);
                }
            }
        }
        catch (dbErr) {
            console.error('Failed to query storefront_tenant_configs for domain mapping:', dbErr.message);
        }
        // 2. Directory fallback for legacy/unmigrated sites
        try {
            const dirs = fs_1.default.readdirSync(sitesPath);
            for (const slug of dirs) {
                if (slug === '_template')
                    continue;
                // Skip if already mapped from DB
                if (Object.values(newCache).includes(slug))
                    continue;
                const configPath = path_1.default.join(sitesPath, slug, 'config.json');
                if (fs_1.default.existsSync(configPath)) {
                    try {
                        const config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
                        if (config.customDomain) {
                            const customDomain = config.customDomain.trim().toLowerCase();
                            newCache[customDomain] = slug;
                            if (!customDomain.startsWith('www.')) {
                                newCache[`www.${customDomain}`] = slug;
                            }
                            else {
                                newCache[customDomain.replace(/^www\./, '')] = slug;
                            }
                        }
                    }
                    catch (e) {
                        console.warn(`Failed to parse config for domain mapping in directory ${slug}:`, e);
                    }
                }
            }
            domainToSlugCache = newCache;
            lastCacheUpdate = now;
        }
        catch (err) {
            console.error('Failed to read sites directory for domain mapping:', err);
            if (!domainToSlugCache) {
                domainToSlugCache = newCache;
                lastCacheUpdate = now;
            }
        }
        return (domainToSlugCache && (domainToSlugCache[domain] || domainToSlugCache[`www.${domain}`])) || null;
    });
}
// CNAME Router Rewrite Middleware
app.use((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const host = req.get('host') || '';
    try {
        const slug = yield getSlugForDomain(host);
        if (slug) {
            // Under a mapped domain! Rewrite paths transparently:
            if (req.path === '/' || req.path === '/index.html') {
                req.url = `/sites/${slug}/index.html`;
            }
            else if (req.path === '/manifest.json') {
                req.url = `/sites/${slug}/manifest.json`;
            }
            else if (req.path === '/sw.js') {
                req.url = `/sites/${slug}/sw.js`;
            }
            else if (req.path === '/robots.txt') {
                req.url = `/sites/${slug}/robots.txt`;
            }
            else if (req.path === '/sitemap.xml') {
                req.url = `/sites/${slug}/sitemap.xml`;
            }
            else if (!req.path.startsWith('/sites/') && !req.path.startsWith('/api/')) {
                const potentialFilePath = path_1.default.join(sitesPath, slug, req.path);
                if (fs_1.default.existsSync(potentialFilePath)) {
                    req.url = `/sites/${slug}${req.path}`;
                }
            }
        }
    }
    catch (err) {
        console.error('Error in domain mapping middleware:', err);
    }
    next();
}));
app.use('/uploads', express_1.default.static(uploadsPath));
// Dynamic robots.txt for tenant storefronts
app.get('/sites/:slug/robots.txt', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const slug = req.params.slug;
    const host = req.get('host') || '';
    const protocol = req.protocol || 'http';
    const mappedSlug = yield getSlugForDomain(host);
    const sitemapUrl = mappedSlug
        ? `${protocol}://${host}/sitemap.xml`
        : `${protocol}://${host}/sites/${slug}/sitemap.xml`;
    res.setHeader('Content-Type', 'text/plain');
    res.send(`User-agent: *
Allow: /
Sitemap: ${sitemapUrl}
`);
}));
// Dynamic sitemap.xml for tenant storefronts
app.get('/sites/:slug/sitemap.xml', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const slug = req.params.slug;
    const host = req.get('host') || '';
    const protocol = req.protocol || 'http';
    const mappedSlug = yield getSlugForDomain(host);
    const rootLoc = mappedSlug
        ? `${protocol}://${host}/`
        : `${protocol}://${host}/sites/${slug}/`;
    try {
        const conn = yield db_1.pool.getConnection();
        const [rows] = yield conn.query('SELECT id FROM products WHERE isActive = TRUE');
        conn.release();
        const productsList = rows;
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${rootLoc}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;
        for (const p of productsList) {
            const productLoc = mappedSlug
                ? `${protocol}://${host}/?product=${p.id}`
                : `${protocol}://${host}/sites/${slug}/?product=${p.id}`;
            xml += `
  <url>
    <loc>${productLoc}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
        }
        xml += `
</urlset>`;
        res.setHeader('Content-Type', 'application/xml');
        res.send(xml);
    }
    catch (err) {
        console.error(`❌ Failed to generate sitemap for ${slug}:`, err.message);
        res.status(500).send('Internal Server Error');
    }
}));
function escapeHtml(str) {
    if (!str)
        return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
// Serve storefronts with server-side SEO pre-rendering for HTML routes
// Serve storefronts with server-side SEO pre-rendering for HTML routes
app.get(['/sites/:slug', '/sites/:slug/', '/sites/:slug/index.html'], (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const slug = req.params.slug;
    if (slug === '_template') {
        return next();
    }
    const indexPath = path_1.default.join(sitesPath, slug, 'index.html');
    if (fs_1.default.existsSync(indexPath)) {
        try {
            let html = fs_1.default.readFileSync(indexPath, 'utf8');
            const config = yield getSiteConfig(slug);
            let seoTitle = ((_a = config.seo) === null || _a === void 0 ? void 0 : _a.title) || config.brandName || 'Store';
            let seoDesc = ((_b = config.seo) === null || _b === void 0 ? void 0 : _b.description) || config.tagline || '';
            const logoUrl = config.logoUrl || '';
            const host = req.get('host') || '';
            const protocol = req.protocol || 'http';
            const fullLogoUrl = logoUrl ? (logoUrl.startsWith('http') ? logoUrl : `${protocol}://${host}${logoUrl}`) : '';
            const mappedSlug = yield getSlugForDomain(host);
            let canonicalUrl = mappedSlug
                ? `${protocol}://${host}/`
                : `${protocol}://${host}/sites/${slug}/`;
            let structuredData = '';
            const productId = req.query.product;
            let product = null;
            if (productId) {
                try {
                    const conn = yield db_1.pool.getConnection();
                    const [rows] = yield conn.query('SELECT name, description, price, sku, stock, image FROM products WHERE id = ? AND isActive = TRUE', [productId]);
                    conn.release();
                    if (rows.length > 0) {
                        product = rows[0];
                    }
                }
                catch (err) {
                    console.warn(`Failed to fetch product ${productId} for SEO injection:`, err.message);
                }
            }
            if (product) {
                seoTitle = `${product.name} | ${config.brandName || 'Store'}`;
                if (product.description) {
                    seoDesc = product.description.substring(0, 160);
                }
                canonicalUrl = mappedSlug
                    ? `${protocol}://${host}/?product=${productId}`
                    : `${protocol}://${host}/sites/${slug}/?product=${productId}`;
                const productImage = product.image ? (product.image.startsWith('http') ? product.image : `${protocol}://${host}${product.image}`) : fullLogoUrl;
                structuredData = JSON.stringify({
                    "@context": "https://schema.org",
                    "@type": "Product",
                    "name": product.name,
                    "image": productImage,
                    "description": seoDesc,
                    "sku": product.sku || undefined,
                    "offers": {
                        "@type": "Offer",
                        "url": canonicalUrl,
                        "priceCurrency": ((_c = config.currency) === null || _c === void 0 ? void 0 : _c.code) || 'USD',
                        "price": product.price,
                        "availability": product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
                    }
                });
            }
            else {
                structuredData = JSON.stringify({
                    "@context": "https://schema.org",
                    "@type": "Organization",
                    "name": config.brandName || 'Store',
                    "url": canonicalUrl,
                    "logo": fullLogoUrl,
                    "description": seoDesc
                });
            }
            // Inject SEO tags
            html = html.replace('<title>Loading...</title>', `<title>${escapeHtml(seoTitle)}</title>`);
            const manifestHref = mappedSlug ? '/manifest.json' : `/sites/${slug}/manifest.json`;
            const metaTags = `
    <link rel="manifest" href="${escapeHtml(manifestHref)}">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
    <meta name="description" content="${escapeHtml(seoDesc)}">
    <meta property="og:title" content="${escapeHtml(seoTitle)}">
    <meta property="og:description" content="${escapeHtml(seoDesc)}">
    <meta property="og:image" content="${escapeHtml(product ? (product.image || fullLogoUrl) : fullLogoUrl)}">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(seoTitle)}">
    <meta name="twitter:description" content="${escapeHtml(seoDesc)}">
    <meta name="twitter:image" content="${escapeHtml(product ? (product.image || fullLogoUrl) : fullLogoUrl)}">
    <script type="application/ld+json">${structuredData.replace(/<\/script>/gi, '<\\/script>')}</script>
            `;
            html = html.replace('</head>', `${metaTags}\n</head>`);
            const swPath = mappedSlug ? '/sw.js' : `/sites/${slug}/sw.js`;
            const pwaRegisterScript = `
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('${swPath}')
            .then(reg => console.log('ServiceWorker registered for ${slug}'))
            .catch(err => console.error('ServiceWorker registration failed:', err));
        });
      }
    </script>
    </body>
            `;
            html = html.replace('</body>', pwaRegisterScript);
            // Inject Dynamic custom CSS/JS from config if present
            if (config.customCss) {
                const cssContent = config.customCss.trim().startsWith('<style')
                    ? config.customCss
                    : `<style id="sf-custom-css">\n${config.customCss}\n</style>`;
                html = html.replace('</head>', `${cssContent}\n</head>`);
            }
            if (config.customJs) {
                const jsContent = config.customJs.trim().startsWith('<script')
                    ? config.customJs
                    : `<script id="sf-custom-js">\n${config.customJs}\n</script>`;
                html = html.replace('</body>', `${jsContent}\n</body>`);
            }
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.send(html);
        }
        catch (err) {
            console.error(`❌ Failed to inject SEO tags for site ${slug}:`, err.message);
            return res.sendFile(indexPath);
        }
    }
    next();
}));
app.get('/sites/:slug/manifest.json', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const slug = req.params.slug;
    if (slug === '_template')
        return next();
    try {
        const config = yield getSiteConfig(slug);
        const name = config.brandName || 'Storefront';
        const startUrl = `/sites/${slug}/`;
        const themeColor = ((_a = config.colors) === null || _a === void 0 ? void 0 : _a.primary) || '#2563EB';
        const bgColor = ((_b = config.colors) === null || _b === void 0 ? void 0 : _b.background) || '#FFFFFF';
        let logoUrl = config.logoUrl || '';
        let iconType = "image/png";
        let iconSizes = "512x512";
        if (logoUrl) {
            if (logoUrl.startsWith('/sites/')) {
                const relativePath = logoUrl.replace(/^\/sites\//, '');
                const absolutePath = path_1.default.join(sitesPath, relativePath);
                if (!fs_1.default.existsSync(absolutePath)) {
                    logoUrl = '';
                }
            }
        }
        if (!logoUrl) {
            logoUrl = '/sites/_template/favicon.svg';
            iconType = "image/svg+xml";
            iconSizes = "any";
        }
        else if (logoUrl.endsWith('.svg')) {
            iconType = "image/svg+xml";
            iconSizes = "any";
        }
        else if (logoUrl.endsWith('.webp')) {
            iconType = "image/webp";
        }
        const manifest = {
            name: name,
            short_name: name,
            start_url: startUrl,
            display: "standalone",
            orientation: "any",
            background_color: bgColor,
            theme_color: themeColor,
            icons: [
                {
                    src: logoUrl,
                    sizes: iconSizes,
                    type: iconType,
                    purpose: "any maskable"
                }
            ]
        };
        res.setHeader('Content-Type', 'application/json');
        return res.json(manifest);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}));
app.get('/sites/:slug/sw.js', (req, res, next) => {
    const slug = req.params.slug;
    if (slug === '_template')
        return next();
    const swCode = `
const CACHE_NAME = 'storefront-${slug}-v2';
const ASSETS_TO_CACHE = [
  '/sites/${slug}/',
  '/sites/${slug}/index.html',
  '/sites/_template/styles.min.css',
  '/sites/_template/storefront.min.js',
  'https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', event => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  if (url.pathname.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        
        if (url.origin === self.location.origin && 
            (url.pathname.startsWith('/sites/') || url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js'))) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        
        return networkResponse;
      }).catch(() => {
        return caches.match('/sites/${slug}/index.html');
      });
    })
  );
});
`;
    res.setHeader('Content-Type', 'application/javascript');
    return res.send(swCode);
});
app.use('/sites', express_1.default.static(sitesPath));
// ── Site Customization API ───────────────────────────────────────────
const siteUploadStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const rawSlug = req.params.slug;
        const slug = (typeof rawSlug === 'string' ? rawSlug : '').replace(/[^a-zA-Z0-9-_]/g, '');
        const dest = path_1.default.join(sitesPath, slug);
        if (!fs_1.default.existsSync(dest)) {
            fs_1.default.mkdirSync(dest, { recursive: true });
        }
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        cb(null, `logo${ext}`);
    }
});
const siteUpload = (0, multer_1.default)({
    storage: siteUploadStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit for logo
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
        const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(file.mimetype) && allowedExts.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid format. Allowed formats: PNG, JPG, JPEG, WEBP, SVG'), false);
        }
    }
});
const checkStorefrontWritePermission = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const rawSlug = req.params.slug;
    const slug = (typeof rawSlug === 'string' ? rawSlug : '').replace(/[^a-zA-Z0-9-_]/g, '');
    const user = req.user;
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }
    // 1. Admin overrides
    const ADMIN_ROLES = ['ADMIN', 'MASTER_ADMIN', 'GENERAL_MANAGER', 'MANAGER', 'المدير', 'المدير العام', 'مسئول النظام'];
    const isAdmin = ADMIN_ROLES.some(role => { var _a; return role.trim().toUpperCase() === ((_a = user.role) === null || _a === void 0 ? void 0 : _a.trim().toUpperCase()); }) || (user.permissions && user.permissions.includes('all'));
    if (((_a = user.role) === null || _a === void 0 ? void 0 : _a.trim().toUpperCase()) === 'MASTER_ADMIN' || (user.permissions && user.permissions.includes('all'))) {
        return next();
    }
    // 2. Fetch the storefront user to find the associated branchId
    const privateConfigPath = path_1.default.join(sitesPrivatePath, slug, 'private-config.json');
    if (!fs_1.default.existsSync(privateConfigPath)) {
        return res.status(404).json({ error: `Storefront not found: ${slug}` });
    }
    try {
        const privateConfig = JSON.parse(fs_1.default.readFileSync(privateConfigPath, 'utf8'));
        const storefrontUsername = (_c = (_b = privateConfig === null || privateConfig === void 0 ? void 0 : privateConfig.api) === null || _b === void 0 ? void 0 : _b.autoLogin) === null || _c === void 0 ? void 0 : _c.username;
        if (!storefrontUsername) {
            return res.status(400).json({ error: 'Storefront user is not configured on the server.' });
        }
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const [rows] = yield pool.query(`SELECT branchId FROM users WHERE username = ? LIMIT 1`, [storefrontUsername]);
        const storefrontUser = rows[0];
        if (!storefrontUser) {
            return res.status(400).json({ error: 'Storefront user not found in database.' });
        }
        // Check if the logged-in user belongs to the same branch
        if (user.branchId !== undefined && user.branchId !== null && storefrontUser.branchId !== undefined && storefrontUser.branchId !== null) {
            if (Number(user.branchId) === Number(storefrontUser.branchId)) {
                return next();
            }
        }
        else if (isAdmin) {
            return next();
        }
        return res.status(403).json({ error: 'Forbidden: You do not have permission to manage this storefront' });
    }
    catch (err) {
        console.error('Storefront permission check error:', err.message);
        return res.status(500).json({ error: 'Internal server error during permission check' });
    }
});
app.post('/api/sites/:slug/logo', authMiddleware_1.authenticateToken, checkStorefrontWritePermission, (req, res, next) => {
    siteUpload.single('logo')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message || 'Logo upload failed' });
        }
        next();
    });
}, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const rawSlug = req.params.slug;
    const slug = (typeof rawSlug === 'string' ? rawSlug : '').replace(/[^a-zA-Z0-9-_]/g, '');
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const relativeUrl = `/sites/${slug}/${req.file.filename}`;
    try {
        const config = yield getSiteConfig(slug);
        config.logoUrl = relativeUrl;
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        yield pool.query('INSERT INTO storefront_tenant_configs (tenantSlug, configText) VALUES (?, ?) ON DUPLICATE KEY UPDATE configText = VALUES(configText)', [slug, JSON.stringify(config)]);
        const configPath = path_1.default.join(sitesPath, slug, 'config.json');
        try {
            fs_1.default.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        }
        catch (e) {
            console.warn(`[Logo] Failed to write backup file for ${slug}:`, e.message);
        }
        delete configCache[slug];
        res.json({ success: true, logoUrl: relativeUrl });
    }
    catch (err) {
        res.status(500).json({ error: `Failed to update logo: ${err.message}` });
    }
}));
app.post('/api/sites/:slug/config', authMiddleware_1.authenticateToken, checkStorefrontWritePermission, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const rawSlug = req.params.slug;
    const slug = (typeof rawSlug === 'string' ? rawSlug : '').replace(/[^a-zA-Z0-9-_]/g, '');
    try {
        const currentConfig = yield getSiteConfig(slug);
        const newConfig = Object.assign(Object.assign({}, currentConfig), req.body);
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        yield pool.query('INSERT INTO storefront_tenant_configs (tenantSlug, configText) VALUES (?, ?) ON DUPLICATE KEY UPDATE configText = VALUES(configText)', [slug, JSON.stringify(newConfig)]);
        const configPath = path_1.default.join(sitesPath, slug, 'config.json');
        try {
            fs_1.default.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
        }
        catch (e) {
            console.warn(`[Config] Failed to write backup file for ${slug}:`, e.message);
        }
        delete configCache[slug];
        res.json({ success: true, config: newConfig });
    }
    catch (err) {
        res.status(500).json({ error: `Failed to save config: ${err.message}` });
    }
}));
// Tenant admin abandoned checkouts list
app.get('/api/sites/:slug/abandoned', authMiddleware_1.authenticateToken, checkStorefrontWritePermission, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const rawSlug = req.params.slug;
    const slug = (typeof rawSlug === 'string' ? rawSlug : '').replace(/[^a-zA-Z0-9-_]/g, '');
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        const [rows] = yield pool.query(`SELECT id, customerName, customerPhone, deliveryAddress, cartState, status, recoveryToken, createdAt 
             FROM storefront_abandoned_checkouts 
             WHERE slug = ? 
             ORDER BY createdAt DESC LIMIT 100`, [slug]);
        res.json({ abandonedCheckouts: rows });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
app.post('/api/sites/:slug/abandoned/:token/email', authMiddleware_1.authenticateToken, checkStorefrontWritePermission, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const rawSlug = req.params.slug;
    const slug = (typeof rawSlug === 'string' ? rawSlug : '').replace(/[^a-zA-Z0-9-_]/g, '');
    const token = req.params.token;
    try {
        const { pool } = yield Promise.resolve().then(() => __importStar(require('./db')));
        // 1. Fetch draft checkout details
        const [drafts] = yield pool.query('SELECT customerName, customerPhone, deliveryAddress, cartState FROM storefront_abandoned_checkouts WHERE recoveryToken = ? AND slug = ? LIMIT 1', [token, slug]);
        const draft = drafts[0];
        if (!draft) {
            return res.status(404).json({ error: 'لم يتم العثور على مسودة طلب لهذه المعاملة.' });
        }
        // 2. Resolve customer email from partners table
        const cleanPhone = draft.customerPhone.trim();
        const [partners] = yield pool.query('SELECT email, name FROM partners WHERE (phone = ? OR mobile = ? OR name = ?) AND email IS NOT NULL AND email != \'\' LIMIT 1', [cleanPhone, cleanPhone, draft.customerName]);
        let recipientEmail = ((_a = partners[0]) === null || _a === void 0 ? void 0 : _a.email) || req.body.email;
        if (!recipientEmail) {
            return res.status(400).json({ error: 'لم يتم العثور على بريد إلكتروني مسجل لهذا العميل. يرجى توفير بريد إلكتروني.' });
        }
        // 3. Resolve site config and URL
        const config = yield getSiteConfig(slug);
        const brandName = config.brandName || slug;
        const currency = config.currency || '$';
        const host = req.get('host') || 'localhost:3000';
        const siteUrl = config.customDomain ? `https://${config.customDomain}` : `${req.protocol}://${host}/sites/${slug}`;
        const recoveryLink = `${siteUrl}?recoveryToken=${token}`;
        // 4. Parse cart items
        let cartState = {};
        try {
            cartState = typeof draft.cartState === 'string' ? JSON.parse(draft.cartState) : draft.cartState;
        }
        catch (e) { }
        const items = cartState.items || [];
        let itemsHtml = '';
        let total = 0;
        items.forEach((item) => {
            const itemQty = Number(item.quantity) || 1;
            const itemPrice = Number(item.price) || 0;
            const lineTotal = itemQty * itemPrice;
            total += lineTotal;
            itemsHtml += `
                <li style="padding: 10px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; direction: rtl;">
                    <span>${item.name} (x${itemQty})</span>
                    <span style="font-weight: bold;">${lineTotal.toFixed(2)} ${currency}</span>
                </li>
            `;
        });
        // 5. Construct HTML Recovery Template
        const subject = `هل نسيت شيئاً؟ أكمل طلبك في ${brandName} | Complete your purchase at ${brandName}`;
        const htmlBody = `
            <div style="font-family: sans-serif; direction: rtl; text-align: right; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff;">
                <h2 style="color: #4F46E5; margin-bottom: 10px;">عزيزي ${draft.customerName}،</h2>
                <p style="font-size: 16px; color: #374151; line-height: 1.6;">لقد لاحظنا أنك تركت بعض المنتجات الرائعة في عربة التسوق الخاصة بك في <strong>${brandName}</strong>. لا تدعها تذهب!</p>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                
                <h3 style="color: #1F2937; margin-bottom: 10px;">العناصر في عربتك:</h3>
                <ul style="list-style: none; padding: 0; margin: 0; color: #4B5563;">
                    ${itemsHtml || '<li style="padding: 10px 0;">منتجات في عربة التسوق</li>'}
                </ul>
                <h4 style="text-align: left; color: #111827; margin-top: 15px;">الإجمالي التقريبي: <span style="font-size: 18px; color: #4F46E5;">${total.toFixed(2)} ${currency}</span></h4>
                
                <div style="text-align: center; margin: 35px 0;">
                    <a href="${recoveryLink}" style="background-color: #4F46E5; color: #ffffff; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">أكمل عملية الشراء الآن</a>
                </div>
                
                <p style="font-size: 14px; color: #6B7280; text-align: center;">إذا كان لديك أي أسئلة، فلا تتردد في الاتصال بنا. شكراً لتسوقك معنا!</p>
            </div>
        `;
        // 6. Send the email
        const sent = yield (0, mailService_1.sendStorefrontEmail)(recipientEmail, subject, htmlBody);
        if (sent) {
            res.json({ success: true, message: 'تم إرسال بريد التذكير الإلكتروني بنجاح.' });
        }
        else {
            res.status(500).json({ error: 'فشل في إرسال البريد الإلكتروني. يرجى التحقق من إعدادات SMTP.' });
        }
    }
    catch (err) {
        console.error('❌ Failed to trigger recovery email:', err.message);
        res.status(500).json({ error: `فشل في إرسال البريد الإلكتروني: ${err.message}` });
    }
}));
// Serve pre-compressed .br/.gz files when available (built by vite-plugin-compression2)
// Falls back to raw files + dynamic compression() middleware for uncompressed assets
app.use((0, express_static_gzip_1.default)(frontendPath, {
    enableBrotli: true,
    orderPreference: ['br', 'gzip'],
    serveStatic: {
        etag: true,
        lastModified: true,
        maxAge: 0 // Per-path caching is handled by the middleware above
    }
}));
// Debug endpoint removed for production security (C7)
// Handle SPA routing - send all non-API requests to index.html
app.get('*', (req, res) => {
    // Don't intercept API routes or WebSocket
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return res.status(404).json({ error: 'Not found' });
    }
    // Don't serve index.html for static asset requests that express.static couldn't find
    // This prevents MIME type errors (serving HTML for .js/.css requests)
    const ext = path_1.default.extname(req.path).toLowerCase();
    if (ext && ext !== '.html') {
        // Only log for real asset paths (JS/CSS/images), not bot probes like .php, .axd, .json etc.
        const realAssetExts = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map', '.webp'];
        if (realAssetExts.includes(ext)) {
            console.error(`⚠️ Static asset not found: ${req.path} (looked in ${frontendPath})`);
        }
        // Prevent aggressive 1-year caching of 404 responses!
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.status(404).send('Not found');
    }
    res.sendFile(path_1.default.join(frontendPath, 'index.html'));
});
// Register global error handler after all routes
app.use(errorHandler_1.handleGlobalErrors);
// ============================================================
// SERVER STARTUP
// Always starts directly — no supervisor fork.
// The launcher (launcher_gui.py) handles auto-restart externally.
// ============================================================
// If we reached this point, all top-level imports succeeded without crashing
global.__appInitialized = true;
// Initialize WebSocket FIRST (doesn't need DB)
const io = (0, socket_1.initializeWebSocket)(httpServer);
console.log('✅ WebSocket server initialized');
app.set('io', io);
if (bootServer) {
    // Loaded from entry.js — server is already listening!
    // Attach our Express app to the existing boot server
    bootServer.removeAllListeners('request');
    bootServer.on('request', app);
    console.log(`⚡ Attached to boot server (port ${PORT}). DB initializing in background...`);
    console.log(`🔌 WebSocket ready on ws://0.0.0.0:${PORT}`);
}
else {
    // Normal startup — listen ourselves
    httpServer.listen(Number(PORT), '0.0.0.0', () => {
        console.log(`⚡ Server listening on port ${PORT} (DB initializing in background...)`);
        console.log(`🔌 WebSocket ready on ws://0.0.0.0:${PORT}`);
    });
}
// THEN initialize DB in background
(0, db_1.initDB)().then(() => __awaiter(void 0, void 0, void 0, function* () {
    exports.dbReady = dbReady = true;
    console.log('✅ Database ready — server fully operational');
    // ── Create Storefront Phase 3 Tables ──
    try {
        yield db_1.pool.query(`
            CREATE TABLE IF NOT EXISTS storefront_tenant_configs (
                tenantSlug VARCHAR(100) PRIMARY KEY,
                configText LONGTEXT NOT NULL,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        console.log('✅ storefront_tenant_configs table — ready');
    }
    catch (tblErr) {
        console.error('Failed to create storefront_tenant_configs table:', tblErr.message);
    }
    try {
        yield db_1.pool.query(`
            CREATE TABLE IF NOT EXISTS checkout_stock_reservations (
                id VARCHAR(36) PRIMARY KEY,
                productId VARCHAR(36) NOT NULL,
                variantId VARCHAR(36) NULL,
                warehouseId VARCHAR(36) NOT NULL,
                quantity DECIMAL(15,5) NOT NULL,
                recoveryToken VARCHAR(36) NOT NULL,
                expiresAt DATETIME NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_token (recoveryToken),
                INDEX idx_expires (expiresAt)
            ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        console.log('✅ checkout_stock_reservations table — ready');
    }
    catch (tblErr) {
        console.error('Failed to create checkout_stock_reservations table:', tblErr.message);
    }
    // Initialize Reservation TTL release CRON job
    try {
        (0, reservationJobs_1.initializeReservationJobs)();
    }
    catch (cronErr) {
        console.error('Failed to initialize reservation cleanup cron:', cronErr.message);
    }
    console.log('Server is running'); // Required by launcher detection
    // ── Start DB Health Monitors ──
    Promise.resolve().then(() => __importStar(require('./utils/dbHealth'))).then(({ startPoolMonitor, startScheduledMaintenance }) => {
        startPoolMonitor(30000); // Check pool usage every 30s
        startScheduledMaintenance(6 * 60 * 60 * 1000); // ANALYZE tables every 6h
    }).catch(err => console.error('Failed to start DB health monitor:', err));
    // ── Start Pool Health Monitor (main + heavy pool utilization) ──
    (0, db_1.startPoolHealthMonitor)();
    // ── Start Pool Keepalive Pinger (prevents MariaDB from killing idle connections) ──
    (0, db_1.startPoolKeepalive)();
    // Initialize backup schedulers after DB is ready
    (0, backupController_1.initBackupScheduler)().catch(err => {
        console.error('Failed to initialize backup scheduler:', err);
    });
    (0, backupController_1.initAllUserBackupSchedulers)().catch(err => {
        console.error('Failed to initialize user backup schedulers:', err);
    });
    // Initialize Membership CRON jobs
    (0, membershipJobs_1.initializeMembershipJobs)();
    // Initialize POS CRON jobs
    (0, posJobs_1.initializePOSJobs)();
    // Start background embedding worker
    try {
        (0, aiEmbeddingWorker_1.startEmbeddingWorker)();
    }
    catch (embedErr) {
        console.error('Failed to start embedding worker:', embedErr.message);
    }
    // ── Run Abandoned Checkouts TTL Cleanup (delete PENDING older than 30 days) ──
    try {
        const [cleanupResult] = yield db_1.pool.query("DELETE FROM storefront_abandoned_checkouts WHERE status = 'PENDING' AND createdAt < DATE_SUB(NOW(), INTERVAL 30 DAY)");
        console.log(`🧹 [DB Cleanup] Cleaned up ${cleanupResult.affectedRows || 0} stale abandoned checkout drafts older than 30 days.`);
    }
    catch (cleanupErr) {
        console.warn('⚠️ Failed to run abandoned checkouts TTL cleanup:', cleanupErr.message);
    }
})).catch(err => {
    console.error('❌ Failed to initialize database:', err);
    dbError = (err === null || err === void 0 ? void 0 : err.message) || String(err);
    // Don't exit — keep serving so /api/boot-status can show the error
});
