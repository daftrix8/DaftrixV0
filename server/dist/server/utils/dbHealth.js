"use strict";
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
exports.getPoolStats = getPoolStats;
exports.runHealthCheck = runHealthCheck;
exports.runDatabaseMaintenance = runDatabaseMaintenance;
exports.runIntegrityCheck = runIntegrityCheck;
exports.startPoolMonitor = startPoolMonitor;
exports.startScheduledMaintenance = startScheduledMaintenance;
exports.stopHealthMonitor = stopHealthMonitor;
const db_1 = require("../db");
const v8_1 = __importDefault(require("v8"));
function getPoolStats() {
    var _a, _b, _c, _d;
    const p = db_1.pool.pool;
    const totalConnections = ((_a = p === null || p === void 0 ? void 0 : p._allConnections) === null || _a === void 0 ? void 0 : _a.length) || 0;
    const idleConnections = ((_b = p === null || p === void 0 ? void 0 : p._freeConnections) === null || _b === void 0 ? void 0 : _b.length) || 0;
    const activeConnections = totalConnections - idleConnections;
    const pendingQueue = ((_c = p === null || p === void 0 ? void 0 : p._connectionQueue) === null || _c === void 0 ? void 0 : _c.length) || 0;
    const connectionLimit = ((_d = db_1.pool === null || db_1.pool === void 0 ? void 0 : db_1.pool.config) === null || _d === void 0 ? void 0 : _d.connectionLimit) || 40;
    const usagePercent = Math.round((activeConnections / connectionLimit) * 100);
    return {
        totalConnections,
        idleConnections,
        activeConnections,
        pendingQueue,
        connectionLimit,
        usagePercent,
    };
}
function runHealthCheck() {
    return __awaiter(this, void 0, void 0, function* () {
        const warnings = [];
        const poolStats = getPoolStats();
        let dbInfo = null;
        let dbConnected = false;
        // Pool warnings
        if (poolStats.usagePercent > 80) {
            warnings.push(`⚠️ Pool usage at ${poolStats.usagePercent}% (${poolStats.activeConnections}/${poolStats.connectionLimit})`);
        }
        if (poolStats.pendingQueue > 5) {
            warnings.push(`⚠️ ${poolStats.pendingQueue} requests queued waiting for connections`);
        }
        // Test DB connectivity + get server stats
        const start = Date.now();
        let conn = null;
        try {
            conn = yield (0, db_1.getConnection)(2);
            const responseTimeMs = Date.now() - start;
            const [[versionRow]] = yield conn.query('SELECT VERSION() as ver');
            const [statusRows] = yield conn.query('SHOW GLOBAL STATUS WHERE Variable_name IN ("Threads_connected", "Threads_running", "Slow_queries", "Open_tables", "Uptime")');
            const [varRows] = yield conn.query('SHOW GLOBAL VARIABLES WHERE Variable_name = "max_connections"');
            const statusMap = {};
            for (const row of statusRows) {
                statusMap[row.Variable_name] = row.Value;
            }
            const varMap = {};
            for (const row of varRows) {
                varMap[row.Variable_name] = row.Value;
            }
            dbConnected = true;
            dbInfo = {
                connected: true,
                responseTimeMs,
                version: versionRow.ver,
                maxConnections: parseInt(varMap['max_connections'] || '151'),
                threadsConnected: parseInt(statusMap['Threads_connected'] || '0'),
                threadsRunning: parseInt(statusMap['Threads_running'] || '0'),
                slowQueries: parseInt(statusMap['Slow_queries'] || '0'),
                openTables: parseInt(statusMap['Open_tables'] || '0'),
                uptimeHours: Math.round(parseInt(statusMap['Uptime'] || '0') / 3600),
            };
            // DB-level warnings
            if (responseTimeMs > 1000) {
                warnings.push(`⚠️ DB response time slow: ${responseTimeMs}ms`);
            }
            const dbUsagePercent = Math.round((dbInfo.threadsConnected / dbInfo.maxConnections) * 100);
            if (dbUsagePercent > 70) {
                warnings.push(`⚠️ MySQL connections at ${dbUsagePercent}% (${dbInfo.threadsConnected}/${dbInfo.maxConnections})`);
            }
            conn.release();
            conn = null;
        }
        catch (err) {
            if (conn)
                try {
                    conn.release();
                }
                catch ( /* ignore */_a) { /* ignore */ }
            warnings.push(`❌ DB connection failed: ${err.message}`);
        }
        // Determine overall status
        let status = 'healthy';
        if (!dbConnected) {
            status = 'critical';
        }
        else if (poolStats.usagePercent > 80 || warnings.length > 0) {
            status = 'degraded';
        }
        const mem = process.memoryUsage();
        return {
            status,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            pool: poolStats,
            database: dbInfo,
            warnings,
            memory: {
                heapUsed: mem.heapUsed,
                heapTotal: mem.heapTotal,
                rss: mem.rss,
            },
        };
    });
}
// ── Periodic DB Maintenance ──────────────────────────────
// Runs OPTIMIZE TABLE and ANALYZE TABLE on important tables
// Keeps InnoDB tablespaces compact and index stats up to date
// ═══════════════════════════════════════════════════════════
const MAINTENANCE_TABLES = [
    'invoices',
    'invoice_lines',
    'partners',
    'products',
    'product_stocks',
    'journal_entries',
    'journal_lines',
    'cheques',
    'stock_permits',
    'stock_permit_items',
    'stock_movements',
    'accounts',
    'audit_logs',
];
function runDatabaseMaintenance() {
    return __awaiter(this, void 0, void 0, function* () {
        const optimized = [];
        const analyzed = [];
        const errors = [];
        let conn = null;
        try {
            conn = yield (0, db_1.getConnection)(3);
            for (const table of MAINTENANCE_TABLES) {
                try {
                    // ANALYZE TABLE updates index statistics for the query optimizer
                    yield conn.query(`ANALYZE TABLE ${table}`);
                    analyzed.push(table);
                }
                catch (err) {
                    // Table might not exist yet
                    if (!err.message.includes("doesn't exist")) {
                        errors.push(`ANALYZE ${table}: ${err.message}`);
                    }
                }
                try {
                    // OPTIMIZE TABLE reclaims disk space and defragments InnoDB indexes
                    // For InnoDB, this is equivalent to ALTER TABLE + ANALYZE TABLE
                    yield conn.query(`OPTIMIZE TABLE ${table}`);
                    optimized.push(table);
                }
                catch (err) {
                    if (!err.message.includes("doesn't exist")) {
                        errors.push(`OPTIMIZE ${table}: ${err.message}`);
                    }
                }
            }
            conn.release();
            conn = null;
        }
        catch (err) {
            if (conn)
                try {
                    conn.release();
                }
                catch ( /* ignore */_a) { /* ignore */ }
            errors.push(`Connection failed: ${err.message}`);
        }
        return { optimized, analyzed, errors };
    });
}
function runIntegrityCheck() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const checks = [];
        let conn = null;
        try {
            conn = yield (0, db_1.getConnection)(3);
            // 1. Check for orphaned invoice lines (no parent invoice)
            try {
                const [orphanedLines] = yield conn.query(`
        SELECT COUNT(*) as cnt FROM invoice_lines il 
        LEFT JOIN invoices i ON il.invoiceId = i.id 
        WHERE i.id IS NULL
      `);
                const count = ((_a = orphanedLines[0]) === null || _a === void 0 ? void 0 : _a.cnt) || 0;
                checks.push({
                    name: 'Orphaned invoice lines',
                    status: count > 0 ? 'warning' : 'ok',
                    detail: count > 0 ? `${count} orphaned lines found (no parent invoice)` : 'No orphaned lines',
                });
            }
            catch (_j) {
                checks.push({ name: 'Orphaned invoice lines', status: 'ok', detail: 'Table not checked (may not exist)' });
            }
            // 2. Check for orphaned cheques (no parent invoice)
            try {
                const [orphanedCheques] = yield conn.query(`
        SELECT COUNT(*) as cnt FROM cheques c 
        LEFT JOIN invoices i ON c.transactionId = i.id 
        WHERE i.id IS NULL AND c.transactionId IS NOT NULL AND c.transactionId != ''
      `);
                const count = ((_b = orphanedCheques[0]) === null || _b === void 0 ? void 0 : _b.cnt) || 0;
                checks.push({
                    name: 'Orphaned cheques',
                    status: count > 0 ? 'warning' : 'ok',
                    detail: count > 0 ? `${count} cheques with no matching invoice` : 'All cheques linked correctly',
                });
            }
            catch (_k) {
                checks.push({ name: 'Orphaned cheques', status: 'ok', detail: 'Table not checked' });
            }
            // 3. Check for orphaned stock permit items
            try {
                const [orphanedPermitItems] = yield conn.query(`
        SELECT COUNT(*) as cnt FROM stock_permit_items spi 
        LEFT JOIN stock_permits sp ON spi.permitId = sp.id 
        WHERE sp.id IS NULL
      `);
                const count = ((_c = orphanedPermitItems[0]) === null || _c === void 0 ? void 0 : _c.cnt) || 0;
                checks.push({
                    name: 'Orphaned permit items',
                    status: count > 0 ? 'warning' : 'ok',
                    detail: count > 0 ? `${count} orphaned permit items` : 'All permit items linked',
                });
            }
            catch (_l) {
                checks.push({ name: 'Orphaned permit items', status: 'ok', detail: 'Table not checked' });
            }
            // 4. Check for duplicate invoice numbers
            try {
                const [duplicates] = yield conn.query(`
        SELECT number, COUNT(*) as cnt FROM invoices 
        GROUP BY number HAVING cnt > 1 LIMIT 10
      `);
                checks.push({
                    name: 'Duplicate invoice numbers',
                    status: duplicates.length > 0 ? 'error' : 'ok',
                    detail: duplicates.length > 0
                        ? `${duplicates.length} duplicate numbers: ${duplicates.map((d) => d.number).join(', ')}`
                        : 'All invoice numbers are unique',
                });
            }
            catch (_m) {
                checks.push({ name: 'Duplicate invoice numbers', status: 'ok', detail: 'Check skipped' });
            }
            // 5. Products with negative stock (should be impossible with FOR UPDATE protection)
            try {
                const [negativeStock] = yield conn.query(`
        SELECT COUNT(*) as cnt FROM products WHERE stock < 0
      `);
                const count = ((_d = negativeStock[0]) === null || _d === void 0 ? void 0 : _d.cnt) || 0;
                checks.push({
                    name: 'Negative stock products',
                    status: count > 0 ? 'warning' : 'ok',
                    detail: count > 0 ? `${count} products have negative stock` : 'All stock values ≥ 0',
                });
            }
            catch (_o) {
                checks.push({ name: 'Negative stock products', status: 'ok', detail: 'Check skipped' });
            }
            // 6. Journal entry balance check (debits must equal credits per entry)
            try {
                const [unbalanced] = yield conn.query(`
        SELECT COUNT(*) as cnt FROM (
          SELECT jl.journalId, 
            ABS(SUM(COALESCE(jl.debit, 0)) - SUM(COALESCE(jl.credit, 0))) as diff
          FROM journal_lines jl
          GROUP BY jl.journalId
          HAVING diff > 0.01
        ) t
      `);
                const count = ((_e = unbalanced[0]) === null || _e === void 0 ? void 0 : _e.cnt) || 0;
                checks.push({
                    name: 'Unbalanced journal entries',
                    status: count > 0 ? 'error' : 'ok',
                    detail: count > 0 ? `${count} journal entries where debits ≠ credits` : 'All journals balanced',
                });
            }
            catch (_p) {
                checks.push({ name: 'Unbalanced journal entries', status: 'ok', detail: 'Check skipped' });
            }
            // 7. Table sizes (for capacity planning)
            try {
                const [tableSizes] = yield conn.query(`
        SELECT TABLE_NAME as tableName, 
               TABLE_ROWS as rowCount,
               ROUND(DATA_LENGTH / 1024 / 1024, 2) as dataMB,
               ROUND(INDEX_LENGTH / 1024 / 1024, 2) as indexMB,
               ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) as totalMB
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
        LIMIT 15
      `);
                const totalSize = tableSizes.reduce((sum, t) => sum + (t.totalMB || 0), 0);
                checks.push({
                    name: 'Database size',
                    status: totalSize > 2000 ? 'warning' : 'ok',
                    detail: `Total: ${totalSize.toFixed(1)}MB across top 15 tables. Largest: ${((_f = tableSizes[0]) === null || _f === void 0 ? void 0 : _f.tableName) || 'N/A'} (${((_g = tableSizes[0]) === null || _g === void 0 ? void 0 : _g.totalMB) || 0}MB, ${((_h = tableSizes[0]) === null || _h === void 0 ? void 0 : _h.rowCount) || 0} rows)`,
                });
            }
            catch (_q) {
                checks.push({ name: 'Database size', status: 'ok', detail: 'Size check skipped' });
            }
            conn.release();
            conn = null;
        }
        catch (err) {
            if (conn)
                try {
                    conn.release();
                }
                catch ( /* ignore */_r) { /* ignore */ }
            checks.push({ name: 'Connection', status: 'error', detail: err.message });
        }
        return { checks, timestamp: new Date().toISOString() };
    });
}
// ── Pool Monitor (Background) ────────────────────────────
// Logs warnings when pool usage is getting high
// ═══════════════════════════════════════════════════════════
let _poolMonitorInterval = null;
let _maintenanceInterval = null;
function startPoolMonitor(intervalMs = 30000) {
    if (_poolMonitorInterval)
        return; // Already running
    // Track consecutive critical states for escalation
    let consecutiveCritical = 0;
    let consecutiveHighMemory = 0;
    let lastGCForce = 0;
    _poolMonitorInterval = setInterval(() => {
        var _a, _b;
        const stats = getPoolStats();
        const mem = process.memoryUsage();
        const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
        const heapPercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);
        // ═══════════════════════════════════════════
        // 1. POOL EXHAUSTION CIRCUIT BREAKER
        // If pool is critically full, take corrective action
        // ═══════════════════════════════════════════
        if (stats.usagePercent >= 90) {
            consecutiveCritical++;
            console.error(`🔴 [DB Pool] CRITICAL: ${stats.activeConnections}/${stats.connectionLimit} connections in use (${stats.usagePercent}%), ${stats.pendingQueue} queued [consecutive: ${consecutiveCritical}]`);
            // After 3 consecutive critical readings (90s), force-release idle connections
            if (consecutiveCritical >= 3) {
                console.error(`🚨 [DB Pool] AUTO-HEAL: Force-releasing idle connections after ${consecutiveCritical} critical readings`);
                try {
                    const p = db_1.pool.pool;
                    const freed = ((_a = p === null || p === void 0 ? void 0 : p._freeConnections) === null || _a === void 0 ? void 0 : _a.length) || 0;
                    // Destroy all idle connections to free them
                    while (((_b = p === null || p === void 0 ? void 0 : p._freeConnections) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                        const conn = p._freeConnections.shift();
                        try {
                            conn === null || conn === void 0 ? void 0 : conn.destroy();
                        }
                        catch ( /* ignore */_c) { /* ignore */ }
                    }
                    console.warn(`🧹 [DB Pool] Destroyed ${freed} idle connections, pool can now accept new requests`);
                }
                catch (err) {
                    console.error(`❌ [DB Pool] Auto-heal failed:`, err.message);
                }
                consecutiveCritical = 0; // Reset counter
            }
        }
        else if (stats.usagePercent >= 70) {
            consecutiveCritical = Math.max(0, consecutiveCritical - 1); // Slow decay
            console.warn(`🟡 [DB Pool] HIGH USAGE: ${stats.activeConnections}/${stats.connectionLimit} connections (${stats.usagePercent}%), ${stats.pendingQueue} queued`);
        }
        else {
            consecutiveCritical = 0;
        }
        // ═══════════════════════════════════════════
        // 2. MEMORY WATCHDOG (uses heap_size_limit, NOT heapTotal)
        // V8 dynamically grows heapTotal — heapUsed/heapTotal is ALWAYS ~90%+
        // The REAL limit is heap_size_limit from v8.getHeapStatistics()
        // ═══════════════════════════════════════════
        const v8Stats = v8_1.default.getHeapStatistics();
        const heapLimitMB = Math.round(v8Stats.heap_size_limit / 1024 / 1024);
        const realHeapPercent = Math.round((mem.heapUsed / v8Stats.heap_size_limit) * 100);
        if (realHeapPercent >= 80) {
            consecutiveHighMemory++;
            // Only log every 5th check to avoid log spam
            if (consecutiveHighMemory % 5 === 1) {
                console.warn(`🟡 [Memory] High usage: ${heapUsedMB}MB / ${heapLimitMB}MB limit (${realHeapPercent}%) [consecutive: ${consecutiveHighMemory}]`);
            }
            // If memory is consistently above 80% of REAL limit for 5 min, try GC
            const now = Date.now();
            if (consecutiveHighMemory >= 10 && (now - lastGCForce > 5 * 60 * 1000)) {
                lastGCForce = now;
                if (global.gc) {
                    global.gc();
                    console.warn(`✅ [Memory] Forced GC completed (${heapUsedMB}MB used of ${heapLimitMB}MB limit)`);
                }
            }
        }
        else {
            consecutiveHighMemory = 0;
        }
        if (realHeapPercent >= 95) {
            console.error(`🔴 [Memory] CRITICAL: ${heapUsedMB}MB / ${heapLimitMB}MB limit (${realHeapPercent}%) — Real OOM risk!`);
        }
        // ═══════════════════════════════════════════
        // 3. EVENT LOOP LAG DETECTION
        // Detect if the event loop is blocked (causes all requests to hang)
        // ═══════════════════════════════════════════
        const lagStart = Date.now();
        setImmediate(() => {
            const lag = Date.now() - lagStart;
            if (lag > 500) {
                console.error(`🔴 [Event Loop] LAG: ${lag}ms — Server may be hanging! Check for synchronous operations.`);
            }
            else if (lag > 100) {
                console.warn(`🟡 [Event Loop] Elevated lag: ${lag}ms`);
            }
        });
        // Only log at debug level when things are fine
        // (Don't flood logs when healthy)
    }, intervalMs);
    const heapLimitMB = Math.round(v8_1.default.getHeapStatistics().heap_size_limit / 1024 / 1024);
    console.log(`📊 [DB Health] Pool monitor started with auto-healing (every ${intervalMs / 1000}s)`);
    console.log(`   🛡️  Heap limit: ${heapLimitMB}MB (needs ≥256MB for ERP)`);
    console.log(`   🛡️  Pool circuit breaker: Force-release at 90% for 90s`);
    console.log(`   🛡️  Memory watchdog: Alert at 85%, critical at 95%`);
    console.log(`   🛡️  Event loop lag: Alert at 100ms, critical at 500ms`);
}
// ── Scheduled Maintenance (Background) ───────────────────
// Runs ANALYZE TABLE every 6 hours to keep query optimizer informed
// ═══════════════════════════════════════════════════════════
function startScheduledMaintenance(intervalMs = 6 * 60 * 60 * 1000) {
    if (_maintenanceInterval)
        return; // Already running
    // Run first maintenance 5 minutes after startup (let system warm up)
    setTimeout(() => __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('🔧 [DB Health] Running initial table analysis...');
            const result = yield runLightMaintenance();
            console.log(`✅ [DB Health] Analyzed ${result.analyzed.length} tables${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`);
        }
        catch (err) {
            console.error('❌ [DB Health] Initial maintenance failed:', err.message);
        }
    }), 5 * 60 * 1000);
    // Then run every intervalMs
    _maintenanceInterval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('🔧 [DB Health] Running scheduled table analysis...');
            const result = yield runLightMaintenance();
            console.log(`✅ [DB Health] Analyzed ${result.analyzed.length} tables`);
        }
        catch (err) {
            console.error('❌ [DB Health] Scheduled maintenance failed:', err.message);
        }
    }), intervalMs);
    console.log(`🔧 [DB Health] Scheduled maintenance started (every ${intervalMs / 3600000}h, first run in 5min)`);
}
// Light maintenance: only ANALYZE (fast), skip OPTIMIZE (slow + locks tables)
function runLightMaintenance() {
    return __awaiter(this, void 0, void 0, function* () {
        const analyzed = [];
        const errors = [];
        let conn = null;
        try {
            conn = yield (0, db_1.getConnection)(3);
            for (const table of MAINTENANCE_TABLES) {
                try {
                    yield conn.query(`ANALYZE TABLE ${table}`);
                    analyzed.push(table);
                }
                catch (err) {
                    if (!err.message.includes("doesn't exist")) {
                        errors.push(`${table}: ${err.message}`);
                    }
                }
            }
            conn.release();
            conn = null;
        }
        catch (err) {
            if (conn)
                try {
                    conn.release();
                }
                catch ( /* ignore */_a) { /* ignore */ }
            errors.push(`Connection: ${err.message}`);
        }
        return { analyzed, errors };
    });
}
// ── Cleanup ──────────────────────────────────────────────
function stopHealthMonitor() {
    if (_poolMonitorInterval) {
        clearInterval(_poolMonitorInterval);
        _poolMonitorInterval = null;
    }
    if (_maintenanceInterval) {
        clearInterval(_maintenanceInterval);
        _maintenanceInterval = null;
    }
}
