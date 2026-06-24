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
exports.SCHEMA_VERSION = exports.connectionSweepMiddleware = exports.requestContext = exports.heavyPool = exports.pool = void 0;
exports.startPoolHealthMonitor = startPoolHealthMonitor;
exports.startPoolKeepalive = startPoolKeepalive;
exports.getConnection = getConnection;
exports.safeGetConnection = safeGetConnection;
exports.getHeavyConnection = getHeavyConnection;
exports.safePoolQuery = safePoolQuery;
exports.initDB = initDB;
exports.syncBranchChatGroups = syncBranchChatGroups;
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
const async_hooks_1 = require("async_hooks");
const seedData_1 = require("./seedData");
dotenv_1.default.config();
// SECURITY: Only log DB config in development (H2 fix)
if (process.env.NODE_ENV === 'development') {
    console.log('DB Config:', {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        hasPassword: !!process.env.DB_PASSWORD
    });
}
// ═══════════════════════════════════════════════════════════
// MAIN POOL — Reserved for user-facing operations
// Invoices, payments, partner statements, product lookups
// These must NEVER be blocked by background operations
// ═══════════════════════════════════════════════════════════
const poolConfig = Object.assign(Object.assign({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306, waitForConnections: true, connectionLimit: 25, maxIdle: 5, idleTimeout: 300000, queueLimit: 100, connectTimeout: 30000, enableKeepAlive: true, keepAliveInitialDelay: 5000, decimalNumbers: true, charset: 'UTF8MB4_UNICODE_CI' }, (process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})), { authPlugins: {
        mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0')
    } });
exports.pool = promise_1.default.createPool(poolConfig);
// ═══════════════════════════════════════════════════════════
// POOL-LEVEL SESSION INIT — Runs ONCE per physical connection creation
// Previously these 4 queries ran on EVERY getConnection() checkout,
// wasting 4 round-trips per request. Now they run once when MySQL
// creates the connection, and the session variables persist.
// ═══════════════════════════════════════════════════════════
exports.pool.on('connection', (connection) => {
    connection.query('SET innodb_lock_wait_timeout = 10', (err) => { if (err)
        console.warn('DB config error:', err.message); });
    connection.query('SET SESSION max_execution_time = 25000', (err) => { });
    connection.query('SET SESSION wait_timeout = 28800', (err) => { });
    connection.query('SET SESSION interactive_timeout = 28800', (err) => { });
    // Fix collation mismatch: MariaDB 11.x defaults to uca1400_ai_ci but our tables use unicode_ci
    connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci", (err) => { });
    connection.query("SET collation_connection = utf8mb4_unicode_ci", (err) => { });
    // MVCC FIX: Prevent "Record has changed since last read" false conflicts on MariaDB
    // system-versioned or row-versioned tables. KEEP mode tells MariaDB not to reject
    // concurrent modifications when system versioning detects row changes.
    connection.query('SET SESSION system_versioning_alter_history = KEEP', (err) => { });
});
// ═══════════════════════════════════════════════════════════
// HEAVY POOL — Isolated for background / expensive operations
// Stock recalculation, heavy reports, bulk data fetches
// Limited to 10 connections so it can NEVER starve the main pool
// ═══════════════════════════════════════════════════════════
exports.heavyPool = promise_1.default.createPool(Object.assign(Object.assign({}, poolConfig), { connectionLimit: 10, maxIdle: 3, queueLimit: 50 }));
// Heavy pool gets longer query timeouts
exports.heavyPool.on('connection', (connection) => {
    connection.query('SET innodb_lock_wait_timeout = 30', (err) => { });
    connection.query('SET SESSION max_execution_time = 120000', (err) => { });
    connection.query('SET SESSION wait_timeout = 28800', (err) => { });
    connection.query('SET SESSION interactive_timeout = 28800', (err) => { });
    connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci", (err) => { });
    connection.query("SET collation_connection = utf8mb4_unicode_ci", (err) => { });
    connection.query('SET SESSION system_versioning_alter_history = KEEP', (err) => { });
});
// ── POOL HEALTH MONITOR ──────────────────────────────────
// Logs pool utilization every 60s when there's pressure
// Helps detect exhaustion before it becomes a hang
let _healthInterval = null;
function startPoolHealthMonitor() {
    if (_healthInterval)
        return;
    _healthInterval = setInterval(() => {
        var _a, _b, _c, _d, _e, _f;
        const mainPool = exports.pool.pool;
        const bgPool = exports.heavyPool.pool;
        // Only log when there's actual pressure (queued requests or high utilization)
        const mainActive = ((_a = mainPool === null || mainPool === void 0 ? void 0 : mainPool._allConnections) === null || _a === void 0 ? void 0 : _a.length) || 0;
        const mainFree = ((_b = mainPool === null || mainPool === void 0 ? void 0 : mainPool._freeConnections) === null || _b === void 0 ? void 0 : _b.length) || 0;
        const mainQueued = ((_c = mainPool === null || mainPool === void 0 ? void 0 : mainPool._connectionQueue) === null || _c === void 0 ? void 0 : _c.length) || 0;
        const bgActive = ((_d = bgPool === null || bgPool === void 0 ? void 0 : bgPool._allConnections) === null || _d === void 0 ? void 0 : _d.length) || 0;
        const bgFree = ((_e = bgPool === null || bgPool === void 0 ? void 0 : bgPool._freeConnections) === null || _e === void 0 ? void 0 : _e.length) || 0;
        const bgQueued = ((_f = bgPool === null || bgPool === void 0 ? void 0 : bgPool._connectionQueue) === null || _f === void 0 ? void 0 : _f.length) || 0;
        // Log if any queue has items OR utilization is > 60%
        if (mainQueued > 0 || bgQueued > 0 || (mainActive - mainFree) > 15) {
            console.log(`📊 [Pool Health] Main: ${mainActive - mainFree}/${25} active, ${mainQueued} queued | Heavy: ${bgActive - bgFree}/${10} active, ${bgQueued} queued`);
        }
    }, 60000);
    // Don't keep the process alive just for health checks
    if (_healthInterval.unref)
        _healthInterval.unref();
}
// ── POOL KEEPALIVE PINGER ────────────────────────────────
// MariaDB default wait_timeout is 28800s (8h). After that, idle connections
// are silently killed server-side, causing PROTOCOL_CONNECTION_LOST errors
// when the pool tries to reuse them. TCP keepalive is NOT enough — we need
// to send actual MySQL-level pings to keep connections alive.
// Runs every 4 minutes — well within the 8h window.
let _keepaliveInterval = null;
function startPoolKeepalive() {
    if (_keepaliveInterval)
        return;
    _keepaliveInterval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
        try {
            // Ping the main pool
            yield exports.pool.query('SELECT 1');
            // Ping the heavy pool
            yield exports.heavyPool.query('SELECT 1');
        }
        catch (err) {
            // Non-critical — connection will be recreated on next real request
            console.warn('⚠️ [Keepalive] Ping failed (will auto-reconnect):', err.code || err.message);
        }
    }), 4 * 60 * 1000); // Every 4 minutes
    if (_keepaliveInterval.unref)
        _keepaliveInterval.unref();
    console.log('💓 [Keepalive] Pool keepalive pinger started (every 4 min)');
}
// ── POOL ERROR HANDLER ──────────────────────────────────────
// Catches 'PROTOCOL_CONNECTION_LOST', 'ECONNRESET', etc. at the pool level
// so they don't bubble up as uncaught exceptions and crash the server.
let _lastPoolErrorLog = 0;
exports.pool.on('connection', (connection) => {
    connection.on('error', (err) => {
        const now = Date.now();
        // Throttle: log at most once per 60s to avoid console flooding from normal idle drops
        if (now - _lastPoolErrorLog > 60000) {
            _lastPoolErrorLog = now;
            console.warn('⚠️ [DB Pool] Connection error (will auto-reconnect):', err.code || err.message);
        }
    });
});
// Same handler for the heavy pool
exports.heavyPool.on('connection', (connection) => {
    connection.on('error', (err) => {
        const now = Date.now();
        if (now - _lastPoolErrorLog > 60000) {
            _lastPoolErrorLog = now;
            console.warn('⚠️ [Heavy Pool] Connection error (will auto-reconnect):', err.code || err.message);
        }
    });
});
// ---------------------------------------------------------
// CONNECTION LEAK SWEEPER
// ---------------------------------------------------------
// We use AsyncLocalStorage to track all DB connections acquired during a single HTTP request.
// If a controller crashes or forgets to release a connection, this middleware sweeps it up.
exports.requestContext = new async_hooks_1.AsyncLocalStorage();
const connectionSweepMiddleware = (req, res, next) => {
    const connections = new Set();
    // Clean up function to release all untracked connections
    const cleanup = () => {
        if (connections.size > 0) {
            console.warn(`🧹 [DB Sweep] Releasing ${connections.size} leaked connections for ${req.method} ${req.url}`);
        }
        for (const proxyConn of connections) {
            try {
                proxyConn.release();
            }
            catch (e) {
                console.error(`Error sweeping connection:`, e);
            }
        }
        connections.clear();
    };
    // Run the request inside the AsyncLocalStorage context
    exports.requestContext.run(connections, () => {
        // Hook into response finish and close events
        res.on('finish', cleanup);
        res.on('close', cleanup);
        // Expose the connection set so getConnection() can store thread IDs
        const origAdd = connections.add.bind(connections);
        connections.add = function (conn) {
            origAdd(conn);
            return this;
        };
        next();
    });
};
exports.connectionSweepMiddleware = connectionSweepMiddleware;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function getConnection() {
    return __awaiter(this, arguments, void 0, function* (maxRetries = 5) {
        var _a;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const conn = yield exports.pool.getConnection();
                // Guard: pool can return undefined when in a bad state
                if (!conn) {
                    console.error(`❌ Pool returned undefined connection (attempt ${i + 1})`);
                    continue;
                }
                // Validate connection is alive before returning to caller.
                // ping() is ~0.5ms and prevents "closed state" / "write after end" errors
                // on stale connections that were silently dropped by the server.
                try {
                    yield conn.ping();
                }
                catch (_b) {
                    try {
                        conn.destroy();
                    }
                    catch (_c) { }
                    continue; // Get a fresh connection from the pool
                }
                // Automatically track connection for current HTTP request
                let proxyReleased = false;
                const proxy = new Proxy(conn, {
                    get(target, prop) {
                        if (prop === 'release') {
                            return function () {
                                if (proxyReleased) {
                                    // Silently ignore double release to prevent crashes
                                    return;
                                }
                                proxyReleased = true;
                                const trackedConnections = exports.requestContext.getStore();
                                if (trackedConnections) {
                                    trackedConnections.delete(proxy);
                                }
                                return target.release();
                            };
                        }
                        const val = target[prop];
                        return typeof val === 'function' ? val.bind(target) : val;
                    }
                });
                const trackedConnections = exports.requestContext.getStore();
                if (trackedConnections) {
                    trackedConnections.add(proxy);
                    // Store the MySQL thread ID so requestTimeout can KILL QUERY on timeout
                    const threadId = ((_a = conn === null || conn === void 0 ? void 0 : conn.connection) === null || _a === void 0 ? void 0 : _a.threadId) || (conn === null || conn === void 0 ? void 0 : conn.threadId);
                    if (threadId) {
                        trackedConnections._lastThreadId = threadId;
                    }
                }
                return proxy;
            }
            catch (error) {
                console.error(`❌ DB connection attempt ${i + 1} failed:`, (error === null || error === void 0 ? void 0 : error.message) || error);
                if (i === maxRetries - 1)
                    throw error;
                yield sleep(2000 * (i + 1)); // 2s, 4s, 6s...
            }
        }
        throw new Error('Failed to obtain database connection after retries');
    });
}
// Helper to safely get a connection - wraps getConnection with an extra
// guard against the pool returning undefined (causes 'once' is undefined crashes)
function safeGetConnection() {
    return __awaiter(this, arguments, void 0, function* (maxRetries = 5) {
        var _a, _b;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const conn = yield getConnection(maxRetries);
                if (!conn) {
                    console.error(`❌ Pool returned undefined connection (attempt ${i + 1})`);
                    yield sleep(2000 * (i + 1));
                    continue;
                }
                return conn;
            }
            catch (error) {
                // Catch the 'once' undefined error specifically and retry
                if (((_a = error === null || error === void 0 ? void 0 : error.message) === null || _a === void 0 ? void 0 : _a.includes('once')) || ((_b = error === null || error === void 0 ? void 0 : error.message) === null || _b === void 0 ? void 0 : _b.includes('closed state'))) {
                    console.error(`❌ Connection pool in bad state (attempt ${i + 1}), retrying...`);
                    yield sleep(3000 * (i + 1));
                    continue;
                }
                throw error;
            }
        }
        throw new Error('Failed to obtain safe database connection after retries');
    });
}
// ═══════════════════════════════════════════════════════════
// HEAVY CONNECTION — Uses the isolated heavy pool
// For: stock recalculation, heavy reports, bulk data operations
// These connections have longer query timeouts (120s vs 25s)
// and will NEVER compete with invoice/payment operations
// ═══════════════════════════════════════════════════════════
function getHeavyConnection() {
    return __awaiter(this, arguments, void 0, function* (maxRetries = 5) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const conn = yield exports.heavyPool.getConnection();
                if (!conn) {
                    console.error(`❌ Heavy pool returned undefined connection (attempt ${i + 1})`);
                    continue;
                }
                try {
                    yield conn.ping();
                }
                catch (_a) {
                    try {
                        conn.destroy();
                    }
                    catch ( /* ignore */_b) { /* ignore */ }
                    continue;
                }
                // Session variables are now set at pool-level via heavyPool.on('connection')
                let proxyReleased = false;
                const proxy = new Proxy(conn, {
                    get(target, prop) {
                        if (prop === 'release') {
                            return function () {
                                if (proxyReleased)
                                    return;
                                proxyReleased = true;
                                return target.release();
                            };
                        }
                        const val = target[prop];
                        return typeof val === 'function' ? val.bind(target) : val;
                    }
                });
                return proxy;
            }
            catch (error) {
                console.error(`❌ Heavy DB connection attempt ${i + 1} failed:`, (error === null || error === void 0 ? void 0 : error.message) || error);
                if (i === maxRetries - 1)
                    throw error;
                yield sleep(2000 * (i + 1));
            }
        }
        throw new Error('Failed to obtain heavy database connection after retries');
    });
}
// ═══════════════════════════════════════════════════════════
// SAFE POOL QUERY — For fire-and-forget / Phase B operations
// pool.query() can fail with "write after end" or "closed state"
// when the pool returns a stale connection. This wrapper catches
// those errors and retries with a fresh explicit connection.
// Returns [rows, fields] like pool.query, or throws after retries.
// ═══════════════════════════════════════════════════════════
function safePoolQuery(sql_1, params_1) {
    return __awaiter(this, arguments, void 0, function* (sql, params, maxRetries = 2) {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt === 0) {
                    // First attempt: use pool.query() (auto-acquires and auto-releases)
                    return yield exports.pool.query(sql, params);
                }
                else {
                    // Retry: get an explicit connection, ping it, then query
                    let conn = null;
                    try {
                        conn = yield safeGetConnection();
                        const result = yield conn.query(sql, params);
                        conn.release();
                        return result;
                    }
                    catch (retryErr) {
                        if (conn)
                            try {
                                conn.destroy();
                            }
                            catch ( /* force-destroy bad connection */_a) { /* force-destroy bad connection */ }
                        throw retryErr; // Pass to outer catch so sleep and retry logic handles it
                    }
                }
            }
            catch (err) {
                const msg = (err === null || err === void 0 ? void 0 : err.message) || '';
                const isConnectionDead = msg.includes('write after end')
                    || msg.includes('closed state')
                    || msg.includes('PROTOCOL_CONNECTION_LOST')
                    || msg.includes('ECONNRESET')
                    || msg.includes('once'); // "Cannot read properties of undefined (reading 'once')"
                if (isConnectionDead && attempt < maxRetries) {
                    console.warn(`⚠️ [safePoolQuery] Connection error on attempt ${attempt + 1}, retrying: ${msg.substring(0, 80)}`);
                    yield sleep(500 * (attempt + 1));
                    continue;
                }
                throw err; // Non-connection error or final retry exhausted
            }
        }
        throw new Error('safePoolQuery: should not reach here');
    });
}
exports.SCHEMA_VERSION = 80; // Bump this when adding new migrations
function initDB() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        let conn;
        try {
            // Connect without database selected to create it if not exists
            const rootConn = yield promise_1.default.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                port: Number(process.env.DB_PORT) || 3306,
            });
            yield rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            // Ensure charset is correct even on existing databases
            yield rootConn.query(`ALTER DATABASE \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            // Ensure MariaDB can handle our total pool size (25 main + 10 heavy = 35)
            // plus headroom for admin connections and monitoring
            try {
                yield rootConn.query('SET GLOBAL max_connections = 100');
                console.log('✅ MariaDB max_connections set to 100 (35 pool + 65 headroom)');
            }
            catch (e) {
                // May fail if user doesn't have SUPER privilege — that's OK, admin can set it manually
                console.warn('⚠️ Could not set max_connections (may need SUPER privilege):', e === null || e === void 0 ? void 0 : e.message);
            }
            yield rootConn.end();
            // Now connect to the database
            conn = yield exports.pool.getConnection();
            console.log("Connected to MariaDB/MySQL");
            // Check if schema is already up-to-date (skip migrations for fast startup)
            let needsMigrations = true;
            try {
                const [versionRows] = yield conn.query(`SELECT value FROM schema_meta WHERE \`key\` = 'schema_version' LIMIT 1`);
                const currentVersion = parseInt(((_a = versionRows[0]) === null || _a === void 0 ? void 0 : _a.value) || '0', 10);
                if (currentVersion >= exports.SCHEMA_VERSION) {
                    // DOUBLE CHECK: Even if schema_meta says it's up to date, verify critical tables exist
                    const [tableCheck] = yield conn.query("SHOW TABLES LIKE 'users'");
                    if (tableCheck.length === 0) {
                        console.warn('⚠️ schema_meta claims v' + currentVersion + ' but tables are missing! Forcing full database rebuild...');
                        needsMigrations = true;
                    }
                    else {
                        needsMigrations = false;
                        console.log(`✅ Schema v${currentVersion} is up-to-date (required: v${exports.SCHEMA_VERSION}). Skipping migrations.`);
                    }
                }
                else {
                    console.log(`🔄 Schema v${currentVersion} → v${exports.SCHEMA_VERSION}. Running migrations...`);
                }
            }
            catch (_g) {
                // schema_meta table doesn't exist yet — first run, needs full init
                console.log('🆕 First run (or empty database) detected. Running full database initialization...');
            }
            // Disable foreign key checks during table creation to avoid order dependency issues
            yield conn.query('SET FOREIGN_KEY_CHECKS = 0');
            // Add created_by and address to crm_leads
            try {
                yield conn.query('ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS created_by VARCHAR(36) NULL');
                yield conn.query('ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS address VARCHAR(255) NULL');
                // Backfill created_by from the first activity if it is currently null
                yield conn.query(`
        UPDATE crm_leads l
        JOIN (
          SELECT lead_id, created_by 
          FROM crm_activities 
          WHERE type = 'SYSTEM' 
          GROUP BY lead_id 
          ORDER BY created_at ASC
        ) a ON l.id = a.lead_id
        SET l.created_by = a.created_by
        WHERE l.created_by IS NULL
      `);
            }
            catch (e) {
                console.warn('⚠️ crm_leads created_by addition failed:', e === null || e === void 0 ? void 0 : e.message);
            }
            if (!needsMigrations) {
                // Fast path: only run CREATE TABLE IF NOT EXISTS (instant for existing tables)
                // and skip all ALTER TABLE migrations
                // ── ALWAYS ensure AI tables exist (they were added after many existing deployments) ──
                try {
                    yield conn.query(`CREATE TABLE IF NOT EXISTS ai_chat_messages (
          id VARCHAR(36) PRIMARY KEY, userId VARCHAR(36) NOT NULL,
          role ENUM('user','assistant') NOT NULL DEFAULT 'user', message TEXT NOT NULL,
          intent VARCHAR(50) DEFAULT NULL, contextSummary VARCHAR(500) DEFAULT NULL,
          sessionId VARCHAR(36) DEFAULT NULL, feedback ENUM('positive','negative','corrected') DEFAULT NULL,
          feedbackNote TEXT DEFAULT NULL, provider VARCHAR(20) DEFAULT NULL, model VARCHAR(100) DEFAULT NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ai_chat_user (userId, createdAt), INDEX idx_ai_chat_session (sessionId, createdAt)
        )`);
                    yield conn.query(`CREATE TABLE IF NOT EXISTS ai_chat_sessions (
          id VARCHAR(36) PRIMARY KEY, userId VARCHAR(36) NOT NULL,
          lastIntent VARCHAR(50) DEFAULT 'general', lastPartnerId VARCHAR(36) DEFAULT NULL,
          lastPartnerName VARCHAR(255) DEFAULT NULL, lastEntityType VARCHAR(20) DEFAULT NULL,
          lastTopic VARCHAR(50) DEFAULT NULL, conversationTone VARCHAR(10) DEFAULT 'ar',
          metadata JSON DEFAULT NULL,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ai_session_user (userId, updatedAt)
        )`);
                    yield conn.query(`CREATE TABLE IF NOT EXISTS ai_usage_log (
          id INT AUTO_INCREMENT PRIMARY KEY, userId VARCHAR(36) DEFAULT NULL,
          provider VARCHAR(20) NOT NULL, model VARCHAR(100) NOT NULL, intent VARCHAR(50) DEFAULT NULL,
          inputTokensEst INT DEFAULT 0, outputTokensEst INT DEFAULT 0, latencyMs INT DEFAULT 0,
          cached BOOLEAN DEFAULT FALSE, error BOOLEAN DEFAULT FALSE,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ai_usage_daily (createdAt, provider), INDEX idx_ai_usage_user (userId, createdAt)
        )`);
                    yield conn.query(`CREATE TABLE IF NOT EXISTS ai_knowledge_base (
          id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, titleAr VARCHAR(255) DEFAULT NULL,
          content MEDIUMTEXT NOT NULL,
          contentType ENUM('policy','procedure','faq','report','manual','note') NOT NULL DEFAULT 'note',
          category VARCHAR(100) DEFAULT 'general', tags JSON DEFAULT NULL, priority TINYINT DEFAULT 0,
          isActive BOOLEAN DEFAULT TRUE, createdBy VARCHAR(36) DEFAULT NULL, updatedBy VARCHAR(36) DEFAULT NULL,
          metadata JSON DEFAULT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FULLTEXT INDEX ft_kb_content (title, titleAr, content),
          INDEX idx_kb_type (contentType, isActive), INDEX idx_kb_category (category, isActive)
        )`);
                }
                catch (aiErr) {
                    console.warn('⚠️ AI table fast-path creation warning:', aiErr === null || aiErr === void 0 ? void 0 : aiErr.message);
                }
                // ── Knowledge Base articles table (user-facing FAQ) ──
                try {
                    yield conn.query(`CREATE TABLE IF NOT EXISTS kb_articles (
          id VARCHAR(36) PRIMARY KEY,
          question TEXT NOT NULL,
          answer MEDIUMTEXT NOT NULL,
          category VARCHAR(100) NOT NULL,
          keywords JSON DEFAULT NULL,
          attachments JSON DEFAULT NULL,
          viewCount INT DEFAULT 0,
          isFeatured BOOLEAN DEFAULT FALSE,
          isActive BOOLEAN DEFAULT TRUE,
          createdBy VARCHAR(36),
          updatedBy VARCHAR(36),
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FULLTEXT INDEX ft_kb_search (question, answer),
          INDEX idx_kb_category (category, isActive),
          INDEX idx_kb_featured (isFeatured, isActive)
        )`);
                }
                catch (kbErr) {
                    console.warn('⚠️ kb_articles fast-path creation warning:', kbErr === null || kbErr === void 0 ? void 0 : kbErr.message);
                }
                // ── WhatsApp Cloud API tables ──
                try {
                    yield conn.query(`CREATE TABLE IF NOT EXISTS whatsapp_settings (
          id            VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          isEnabled     BOOLEAN DEFAULT FALSE,
          phoneNumberId VARCHAR(100) NOT NULL DEFAULT '',
          accessToken   TEXT NOT NULL,
          wabaId        VARCHAR(100) NOT NULL DEFAULT '',
          webhookToken  VARCHAR(255) NOT NULL DEFAULT '',
          sendOnInvoiceConfirm BOOLEAN DEFAULT TRUE,
          sendOnPaymentRecord  BOOLEAN DEFAULT TRUE,
          sendPOSReceipt       BOOLEAN DEFAULT FALSE,
          createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`);
                    yield conn.query(`CREATE TABLE IF NOT EXISTS whatsapp_message_log (
          id              VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          direction       ENUM('outbound','inbound') NOT NULL,
          toPhone         VARCHAR(30),
          fromPhone       VARCHAR(30),
          messageType     ENUM('text','template','document','image') NOT NULL,
          templateName    VARCHAR(100),
          status          ENUM('pending','sent','delivered','read','failed') DEFAULT 'pending',
          wamid           VARCHAR(200),
          errorMessage    TEXT,
          referenceType   VARCHAR(50),
          referenceId     VARCHAR(36),
          payload         JSON,
          createdAt       DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_wa_log_ref (referenceType, referenceId),
          INDEX idx_wa_log_status (status),
          INDEX idx_wa_log_wamid (wamid)
        )`);
                }
                catch (waErr) {
                    console.warn('⚠️ WhatsApp table fast-path creation warning:', waErr === null || waErr === void 0 ? void 0 : waErr.message);
                }
                // ── CRM Complaints tables (fast-path) ──
                try {
                    yield conn.query(`
          CREATE TABLE IF NOT EXISTS crm_complaints (
            id VARCHAR(36) PRIMARY KEY,
            complaint_number VARCHAR(50) UNIQUE NOT NULL,
            partner_id VARCHAR(36),
            partner_name VARCHAR(255),
            partner_phone VARCHAR(50),
            subject VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            type ENUM('PRODUCT_QUALITY', 'SERVICE_DELAY', 'EMPLOYEE_BEHAVIOR', 'FINANCIAL_ERROR', 'PACKAGING_ISSUE', 'OTHER') DEFAULT 'OTHER',
            severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
            status ENUM('NEW', 'UNDER_REVIEW', 'INVESTIGATING', 'RESOLVED', 'REJECTED', 'CLOSED') DEFAULT 'NEW',
            source ENUM('PHONE', 'WHATSAPP', 'EMAIL', 'WALK_IN', 'WEBSITE', 'OTHER') DEFAULT 'PHONE',
            assigned_to VARCHAR(36),
            created_by VARCHAR(36),
            resolved_at DATETIME,
            resolved_by VARCHAR(36),
            resolution_summary TEXT,
            client_mood ENUM('ANGRY', 'UPSET', 'NEUTRAL', 'SATISFIED') DEFAULT 'UPSET',
            satisfaction_rating INT,
            compensation_type ENUM('NONE', 'CREDIT_NOTE', 'REFUND', 'REPLACEMENT', 'REPAIR', 'DISCOUNT_VOUCHER', 'LOYALTY_POINTS', 'FREE_GIFT', 'FREE_SERVICE', 'OTHER') DEFAULT 'NONE',
            compensation_amount DECIMAL(15,2) DEFAULT 0.00,
            root_cause TEXT,
            invoice_id VARCHAR(36),
            attachments LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_crm_complaints_partner (partner_id),
            INDEX idx_crm_complaints_status (status),
            INDEX idx_crm_complaints_number (complaint_number)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
                    yield conn.query(`
          CREATE TABLE IF NOT EXISTS crm_complaint_comments (
            id VARCHAR(36) PRIMARY KEY,
            complaint_id VARCHAR(36) NOT NULL,
            user_id VARCHAR(36) NOT NULL,
            content TEXT NOT NULL,
            is_internal TINYINT(1) DEFAULT 1,
            attachments LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_crm_complaint_comments_complaint (complaint_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
                    yield conn.query(`
          CREATE TABLE IF NOT EXISTS crm_complaint_compensations (
            id VARCHAR(36) PRIMARY KEY,
            complaint_id VARCHAR(36) NOT NULL,
            partner_id VARCHAR(36),
            type ENUM('CREDIT_NOTE', 'REFUND', 'REPLACEMENT', 'DISCOUNT_VOUCHER', 'LOYALTY_POINTS', 'OTHER') NOT NULL,
            amount DECIMAL(15,2) DEFAULT 0.00,
            status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
            approved_by VARCHAR(36),
            approved_at DATETIME,
            posted_invoice_id VARCHAR(36),
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_crm_comp_status (status),
            INDEX idx_crm_comp_complaint (complaint_id),
            INDEX idx_crm_comp_partner (partner_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
                }
                catch (complaintErr) {
                    console.warn('⚠️ CRM Complaints table fast-path creation warning:', complaintErr === null || complaintErr === void 0 ? void 0 : complaintErr.message);
                }
                // ── Fix pos_cash_movements ENUM — 'EXPENSE' was missing, causing silent empty inserts ──
                try {
                    // Switch from ENUM to VARCHAR to prevent future silent drops
                    yield conn.query(`ALTER TABLE pos_cash_movements MODIFY COLUMN type VARCHAR(50) NOT NULL DEFAULT 'SALE'`);
                    yield conn.query(`ALTER TABLE pos_cash_movements MODIFY COLUMN paymentMethod VARCHAR(50) DEFAULT 'CASH'`);
                    // Fix existing rows with empty type that are linked to pos_expenses
                    yield conn.query(`
          UPDATE pos_cash_movements SET type = 'EXPENSE'
          WHERE (type = '' OR type IS NULL)
            AND referenceId IS NOT NULL
            AND referenceId IN (SELECT id FROM pos_expenses)
        `);
                    console.log('✅ pos_cash_movements type/paymentMethod columns expanded to VARCHAR(50)');
                }
                catch (posFixErr) {
                    console.warn('⚠️ pos_cash_movements ENUM fix warning:', posFixErr === null || posFixErr === void 0 ? void 0 : posFixErr.message);
                }
                // ── Hotfix: Ensure stock_permits.posShiftId exists (migration 058 may not have been applied) ──
                try {
                    yield conn.query(`ALTER TABLE stock_permits ADD COLUMN IF NOT EXISTS posShiftId VARCHAR(36) NULL`);
                }
                catch ( /* column already exists or table doesn't exist yet */_h) { /* column already exists or table doesn't exist yet */ }
                // ── Hotfix: Ensure bom.is_archived and production_orders.is_archived columns exist (migration 066) ──
                try {
                    yield conn.query(`ALTER TABLE bom ADD COLUMN IF NOT EXISTS is_archived TINYINT(1) DEFAULT 0`);
                }
                catch (err) {
                    console.warn('⚠️ bom is_archived alter failed:', err.message);
                }
                try {
                    yield conn.query(`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS is_archived TINYINT(1) DEFAULT 0`);
                }
                catch (err) {
                    console.warn('⚠️ production_orders is_archived alter failed:', err.message);
                }
                // ── Ensure partners.companyName exists ──
                try {
                    yield conn.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS companyName VARCHAR(255) DEFAULT NULL`);
                    yield conn.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS whatsappAutoSend TINYINT(1) DEFAULT 0`);
                }
                catch ( /* column already exists */_j) { /* column already exists */ }
                // ── Ensure warranty / installation columns exist ──
                try {
                    yield conn.query(`ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS warrantyCategories JSON NULL`);
                    yield conn.query(`ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS hasWarranty TINYINT(1) DEFAULT 0`);
                    yield conn.query(`ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS inBranchInstallation TINYINT(1) DEFAULT 0`);
                    yield conn.query(`ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS warrantyMonths INT DEFAULT 0`);
                    yield conn.query(`ALTER TABLE deleted_invoice_lines ADD COLUMN IF NOT EXISTS hasWarranty TINYINT(1) DEFAULT 0`);
                    yield conn.query(`ALTER TABLE deleted_invoice_lines ADD COLUMN IF NOT EXISTS inBranchInstallation TINYINT(1) DEFAULT 0`);
                    yield conn.query(`ALTER TABLE deleted_invoice_lines ADD COLUMN IF NOT EXISTS warrantyMonths INT DEFAULT 0`);
                }
                catch (err) {
                    console.warn('⚠️ Warranty POS fast-path columns addition warning:', err === null || err === void 0 ? void 0 : err.message);
                }
                // ── Ensure chat groups and memberships exist (v75 migration) ──
                try {
                    yield conn.query(`
          CREATE TABLE IF NOT EXISTS chat_groups (
            id VARCHAR(100) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT NULL,
            type ENUM('GLOBAL', 'BRANCH', 'CUSTOM') DEFAULT 'CUSTOM',
            branchId VARCHAR(36) DEFAULT NULL,
            createdBy VARCHAR(100) DEFAULT 'System',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_group_branch (branchId)
          ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
                    yield conn.query(`
          CREATE TABLE IF NOT EXISTS chat_group_members (
            groupId VARCHAR(100) NOT NULL,
            userId VARCHAR(100) NOT NULL,
            joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (groupId, userId),
            INDEX idx_member_user (userId),
            FOREIGN KEY (groupId) REFERENCES chat_groups(id) ON DELETE CASCADE
          ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
                    yield conn.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS groupId VARCHAR(100) DEFAULT NULL`).catch(() => { });
                    yield conn.query(`CREATE INDEX IF NOT EXISTS idx_chat_msg_group ON chat_messages(groupId)`).catch(() => { });
                    yield conn.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions JSON NULL`).catch(() => { });
                    yield conn.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS replyTo JSON NULL`).catch(() => { });
                    yield conn.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment JSON NULL`).catch(() => { });
                }
                catch (chatErr) {
                    console.warn('⚠️ Chat groups tables fast-path creation warning:', chatErr === null || chatErr === void 0 ? void 0 : chatErr.message);
                }
                // ── Ensure active cashier carts table exists ──
                try {
                    yield conn.query(`
          CREATE TABLE IF NOT EXISTS pos_active_carts (
            cashierId VARCHAR(36) PRIMARY KEY,
            cashierName VARCHAR(255) NOT NULL,
            warehouseName VARCHAR(255) NOT NULL,
            cartState JSON NOT NULL,
            remoteUpdate JSON DEFAULT NULL,
            updatedAt BIGINT NOT NULL
          ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
                    yield conn.query(`ALTER TABLE pos_active_carts ADD COLUMN IF NOT EXISTS isLocked TINYINT(1) DEFAULT 0`);
                    yield conn.query(`ALTER TABLE pos_active_carts ADD COLUMN IF NOT EXISTS lockedBy VARCHAR(255) DEFAULT NULL`);
                    yield conn.query(`ALTER TABLE pos_active_carts ADD COLUMN IF NOT EXISTS lastInterventionReason VARCHAR(255) DEFAULT NULL`);
                    yield conn.query(`ALTER TABLE pos_active_carts ADD COLUMN IF NOT EXISTS lastAdminMessage VARCHAR(255) DEFAULT NULL`);
                }
                catch (posCartErr) {
                    console.warn('⚠️ pos_active_carts fast-path creation warning:', posCartErr === null || posCartErr === void 0 ? void 0 : posCartErr.message);
                }
                // ── Fix collation mismatch: MariaDB 11+ creates tables with utf8mb4_uca1400_ai_ci ──
                // MariaDB 11+ blocks MODIFY COLUMN on FK-referenced columns regardless of FK_CHECKS.
                // Nuclear fix: drop all FKs → modify all columns → re-add all FKs.
                try {
                    // Check if there are any mismatched columns at all (fast exit on clean DBs)
                    const [checkCols] = yield conn.query(`
          SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND COLLATION_NAME IS NOT NULL
            AND COLLATION_NAME != 'utf8mb4_unicode_ci'
            AND DATA_TYPE IN ('varchar', 'char', 'text', 'mediumtext', 'longtext', 'tinytext', 'enum', 'set')
        `);
                    const mismatchCount = ((_b = checkCols[0]) === null || _b === void 0 ? void 0 : _b.cnt) || 0;
                    if (mismatchCount > 0) {
                        console.log(`🔧 [Collation Fix] ${mismatchCount} columns need fixing. Running nuclear FK-safe migration...`);
                        // Phase 1: Database-level default
                        const [dbRows] = yield conn.query(`SELECT DATABASE() as db`);
                        const dbName = (_c = dbRows[0]) === null || _c === void 0 ? void 0 : _c.db;
                        if (dbName) {
                            yield conn.query(`ALTER DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
                        }
                        // Phase 2: Snapshot ALL foreign key constraints
                        const [fkRows] = yield conn.query(`
            SELECT 
              tc.CONSTRAINT_NAME, tc.TABLE_NAME,
              kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
              rc.UPDATE_RULE, rc.DELETE_RULE
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
              ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA AND tc.TABLE_NAME = kcu.TABLE_NAME
            JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
              ON tc.CONSTRAINT_NAME = rc.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
            WHERE tc.TABLE_SCHEMA = DATABASE() AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
            ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME
          `);
                        const fks = fkRows;
                        console.log(`   📋 Captured ${fks.length} FK constraints to restore`);
                        // Phase 3: Drop all FKs
                        yield conn.query('SET FOREIGN_KEY_CHECKS = 0');
                        const droppedFKs = new Set();
                        for (const fk of fks) {
                            const key = `${fk.TABLE_NAME}.${fk.CONSTRAINT_NAME}`;
                            if (droppedFKs.has(key))
                                continue;
                            try {
                                yield conn.query(`ALTER TABLE \`${fk.TABLE_NAME}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
                                droppedFKs.add(key);
                            }
                            catch ( /* already dropped or doesn't exist */_k) { /* already dropped or doesn't exist */ }
                        }
                        console.log(`   🗑️ Dropped ${droppedFKs.size} FK constraints`);
                        // Phase 4: Convert ALL tables that have columns with wrong collation (now no FKs block it)
                        const [allTables] = yield conn.query(`
            SELECT DISTINCT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND COLLATION_NAME IS NOT NULL
              AND COLLATION_NAME != 'utf8mb4_unicode_ci'
              AND DATA_TYPE IN ('varchar', 'char', 'text', 'mediumtext', 'longtext', 'tinytext', 'enum', 'set')
          `);
                        let convertedCount = 0;
                        for (const t of allTables) {
                            try {
                                yield conn.query(`ALTER TABLE \`${t.TABLE_NAME}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
                                convertedCount++;
                            }
                            catch (e) {
                                // Some tables may still have issues (virtual columns, etc.) — try table default only
                                try {
                                    yield conn.query(`ALTER TABLE \`${t.TABLE_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
                                }
                                catch ( /* skip */_l) { /* skip */ }
                            }
                        }
                        console.log(`   ✅ Converted ${convertedCount} tables`);
                        // Phase 5: Re-add all FKs
                        let restoredCount = 0;
                        let failedFKs = 0;
                        const processedFKs = new Set();
                        for (const fk of fks) {
                            const key = `${fk.TABLE_NAME}.${fk.CONSTRAINT_NAME}`;
                            if (processedFKs.has(key))
                                continue;
                            processedFKs.add(key);
                            try {
                                const onUpdate = fk.UPDATE_RULE && fk.UPDATE_RULE !== 'RESTRICT' ? `ON UPDATE ${fk.UPDATE_RULE}` : '';
                                const onDelete = fk.DELETE_RULE && fk.DELETE_RULE !== 'RESTRICT' ? `ON DELETE ${fk.DELETE_RULE}` : '';
                                yield conn.query(`
                ALTER TABLE \`${fk.TABLE_NAME}\` 
                ADD CONSTRAINT \`${fk.CONSTRAINT_NAME}\` 
                FOREIGN KEY (\`${fk.COLUMN_NAME}\`) 
                REFERENCES \`${fk.REFERENCED_TABLE_NAME}\`(\`${fk.REFERENCED_COLUMN_NAME}\`)
                ${onUpdate} ${onDelete}
              `);
                                restoredCount++;
                            }
                            catch (_m) {
                                failedFKs++;
                            }
                        }
                        yield conn.query('SET FOREIGN_KEY_CHECKS = 1');
                        console.log(`   🔗 Restored ${restoredCount} FK constraints${failedFKs > 0 ? `, ${failedFKs} failed` : ''}`);
                        console.log(`✅ [Collation Fix] Nuclear migration complete`);
                    }
                }
                catch (collationErr) {
                    console.warn('⚠️ Collation fix error:', collationErr === null || collationErr === void 0 ? void 0 : collationErr.message);
                    // Ensure FK checks are re-enabled even on error
                    try {
                        yield conn.query('SET FOREIGN_KEY_CHECKS = 1');
                    }
                    catch (_o) { }
                }
                yield conn.query('SET FOREIGN_KEY_CHECKS = 1');
                conn.release();
                conn = null;
                // Seed data (also fast - checks before inserting)
                yield seedInitialData();
                // NOTE: cleanupPhantomSafes() REMOVED on 2026-05-01 — it deletes accounts
                // with hardcoded IDs (10102, 10202, 10203) which could exist legitimately
                // in other client databases. Run manually via CLI if needed.
                yield fixLongInvoiceNumbers();
                yield fixDirtyInvoiceNumbers();
                return;
            }
            console.log("Foreign key checks disabled for initialization");
            // Force consistent collation for all new tables to match existing ones (MariaDB 12 fix)
            // Without this, new tables may get a different default collation, causing errno 150 on FK constraints
            yield conn.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
            yield conn.query("SET collation_connection = utf8mb4_unicode_ci");
            // Products Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100),
        barcode VARCHAR(100),
        description TEXT,
        price DECIMAL(10, 2) DEFAULT 0,
        cost DECIMAL(10, 2) DEFAULT 0,
        stock INT DEFAULT 0,
        minStock INT DEFAULT 0,
        maxStock INT DEFAULT 0,
        warehouseId VARCHAR(36),
        categoryId VARCHAR(36),
        image TEXT,
        bomId VARCHAR(36),
        type VARCHAR(50),
        unit VARCHAR(50),
        isManufactured BOOLEAN DEFAULT FALSE,
        leadTimeDays INT DEFAULT 0
      )
    `);
            // Migration: Expand image column from TEXT (64KB) to LONGTEXT (4GB) for base64 images
            yield conn.query(`ALTER TABLE products MODIFY COLUMN image LONGTEXT`).catch(() => { });
            // FULLTEXT Search Indices
            yield conn.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector TEXT GENERATED ALWAYS AS (REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LOWER(name), ''), 'أ','ا'), 'إ','ا'), 'آ','ا'), 'ة','ه'), 'ى','ي'), 'ؤ','و'), 'ئ','ي')) STORED`).catch(() => { });
            yield conn.query(`CREATE FULLTEXT INDEX IF NOT EXISTS ft_index_search_vector ON products(search_vector)`).catch(() => { });
            // Migration: Add columns that may be missing in older schemas
            // Note: Using try/catch instead of IF NOT EXISTS (MariaDB-only syntax)
            yield conn.query(`ALTER TABLE products ADD COLUMN trackSerials BOOLEAN DEFAULT FALSE`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN trackInventory BOOLEAN DEFAULT TRUE`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN embedding JSON COMMENT 'Semantic 384-dimensional vector'`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN warrantyMonths INT DEFAULT 0`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN isActive BOOLEAN DEFAULT TRUE`).catch(() => { });
            // Ceramic module columns
            yield conn.query(`ALTER TABLE products ADD COLUMN ceramic_size VARCHAR(100)`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN ceramic_color VARCHAR(100)`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN ceramic_color_grade VARCHAR(100)`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN ceramic_color_desc VARCHAR(255)`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN ceramic_name VARCHAR(255)`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN ceramic_pattern VARCHAR(100)`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN ceramicItemDesc VARCHAR(255)`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN ceramicGroup VARCHAR(100)`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN minStock INT DEFAULT 0`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN description TEXT`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN avg_cost DECIMAL(15,2) DEFAULT 0`).catch(() => { });
            // Variant Groups: link products to their variant group
            yield conn.query(`ALTER TABLE products ADD COLUMN variantGroupId VARCHAR(36)`).catch(() => { });
            yield conn.query(`ALTER TABLE products ADD COLUMN variantAttributes JSON COMMENT '{"size":"XL","color":"red"}'`).catch(() => { });
            yield conn.query(`CREATE INDEX IF NOT EXISTS idx_products_variantGroupId ON products(variantGroupId)`).catch(() => { });
            // Subcategory support: optional child category under categoryId
            yield conn.query(`ALTER TABLE products ADD COLUMN subcategoryId VARCHAR(36)`).catch(() => { });
            yield conn.query(`CREATE INDEX IF NOT EXISTS idx_products_subcategoryId ON products(subcategoryId)`).catch(() => { });
            // Product Variants & Templates
            yield conn.query(`
        CREATE TABLE IF NOT EXISTS product_variants (
            id VARCHAR(36) PRIMARY KEY,
            productId VARCHAR(36) NOT NULL,
            sku VARCHAR(100) NULL,
            barcode VARCHAR(100) NULL,
            attributes JSON NOT NULL,
            price DECIMAL(10,2) NULL,
            cost DECIMAL(10,2) NULL,
            isActive BOOLEAN DEFAULT TRUE,
            image LONGTEXT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_product_variants_product (productId)
        )
    `).catch(() => { });
            yield conn.query(`
        CREATE TABLE IF NOT EXISTS product_variant_templates (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            attributes JSON NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `).catch(() => { });
            yield conn.query(`ALTER TABLE product_variants ADD COLUMN isActive BOOLEAN DEFAULT TRUE`).catch(() => { });
            yield conn.query(`ALTER TABLE product_variants ADD COLUMN image LONGTEXT NULL`).catch(() => { });
            // Price Lists
            yield conn.query(`
        CREATE TABLE IF NOT EXISTS price_lists (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            type ENUM('FIXED', 'PERCENTAGE') DEFAULT 'FIXED',
            percentage DECIMAL(10, 2) DEFAULT 0,
            status VARCHAR(50) DEFAULT 'ACTIVE',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).catch(() => { });
            yield conn.query(`
        CREATE TABLE IF NOT EXISTS product_prices (
            id VARCHAR(36) PRIMARY KEY,
            priceListId VARCHAR(36) NOT NULL,
            productId VARCHAR(36) NOT NULL,
            price DECIMAL(10, 2) NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_product_price (priceListId, productId)
        )
    `).catch(() => { });
            // Partners Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS partners (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type ENUM('CUSTOMER', 'SUPPLIER', 'BOTH') NOT NULL,
        isCustomer BOOLEAN DEFAULT FALSE,
        isSupplier BOOLEAN DEFAULT FALSE,
        balance DECIMAL(15, 2) DEFAULT 0,
        phone VARCHAR(50),
        email VARCHAR(100),
        taxId VARCHAR(50),
        address TEXT,
        contactPerson VARCHAR(100),
        openingBalance DECIMAL(15, 2) DEFAULT 0,
        paymentTerms INT DEFAULT 0,
        creditLimit DECIMAL(15, 2) DEFAULT 0,
        classification VARCHAR(50),
        status VARCHAR(50) DEFAULT 'ACTIVE',
        groupId VARCHAR(36),
        commercialRegister VARCHAR(50),
        INDEX idx_type (type),
        INDEX idx_isCustomer (isCustomer),
        INDEX idx_isSupplier (isSupplier),
        INDEX idx_balance (balance),
        INDEX idx_name (name),
        INDEX idx_phone (phone)
      )
    `);
            // Add salesmanId column to partners table if it doesn't exist
            yield conn.query(`
      ALTER TABLE partners 
      ADD COLUMN IF NOT EXISTS salesmanId VARCHAR(36)
    `).catch(() => {
                // Ignore error if column already exists
            });
            // Add priceListId column to partners table for default price list assignment
            yield conn.query(`
      ALTER TABLE partners 
      ADD COLUMN IF NOT EXISTS priceListId VARCHAR(36)
    `).catch(() => {
                // Ignore error if column already exists
            });
            // Add sequential code column to partners table (كود الشريك التسلسلي)
            // Use VARCHAR(50) to support alphanumeric codes (was INT which caused overflow issues)
            yield conn.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS code VARCHAR(50) DEFAULT NULL`).catch(() => { });
            // Migrate INT -> VARCHAR if column already exists as INT
            yield conn.query(`ALTER TABLE partners MODIFY COLUMN code VARCHAR(50) DEFAULT NULL`).catch(() => { });
            // Backfill existing partners that don't have a code yet
            try {
                const [uncoded] = yield conn.query(`SELECT COUNT(*) as cnt FROM partners WHERE code IS NULL`);
                if (((_d = uncoded[0]) === null || _d === void 0 ? void 0 : _d.cnt) > 0) {
                    // Assign sequential codes ordered by name to existing partners
                    yield conn.query(`
          SET @row_number = (SELECT COALESCE(MAX(code), 0) FROM partners WHERE code IS NOT NULL)
        `);
                    yield conn.query(`
          UPDATE partners SET code = (@row_number := @row_number + 1) WHERE code IS NULL ORDER BY name
        `);
                    console.log(`✅ Backfilled ${uncoded[0].cnt} partners with sequential codes`);
                }
            }
            catch (e) {
                console.warn('⚠️ Partner code backfill skipped:', e === null || e === void 0 ? void 0 : e.message);
            }
            // Add unique index on code (after backfill to avoid conflicts)
            yield conn.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_code ON partners(code)`).catch(() => { });
            // CRM/membership columns
            yield conn.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS gender VARCHAR(10) DEFAULT NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS dateOfBirth DATE DEFAULT NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) DEFAULT 'NONE'`).catch(() => { });
            yield conn.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS companyName VARCHAR(255) DEFAULT NULL`).catch(() => { });
            // Accounts Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        type ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE') NOT NULL,
        balance DECIMAL(15, 2) DEFAULT 0,
        openingBalance DECIMAL(15, 2) DEFAULT 0
      )
    `);
            // Migration: Add subType column for schema-driven account classification
            // Replaces fragile hardcoded code matching (e.g., a.code === '109') with explicit subtypes
            yield conn.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS subType VARCHAR(50) DEFAULT NULL COMMENT 'Account classification: CASH, BANK, FIXED_ASSET, COGS, etc.'`).catch(() => { });
            // Invoices Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id VARCHAR(36) PRIMARY KEY,
        date DATETIME NOT NULL,
        type VARCHAR(50) NOT NULL,
        partnerId VARCHAR(36),
        partnerName VARCHAR(255),
        total DECIMAL(15, 2) DEFAULT 0,
        status VARCHAR(50) NOT NULL,
        paymentMethod VARCHAR(50),
        posted BOOLEAN DEFAULT FALSE,
        notes TEXT,
        dueDate DATETIME,
        taxAmount DECIMAL(15, 2) DEFAULT 0,
        whtAmount DECIMAL(15, 2) DEFAULT 0,
        shippingFee DECIMAL(15, 2) DEFAULT 0,
        globalDiscount DECIMAL(15, 2) DEFAULT 0,
        warehouseId VARCHAR(36),
        costCenterId VARCHAR(36),
        bankAccountId VARCHAR(36),
        bankName VARCHAR(100),
        FOREIGN KEY (partnerId) REFERENCES partners(id) ON DELETE SET NULL
      )
    `);
            // ========================================
            // BATCH: Invoice column migrations (run in parallel for speed)
            // ========================================
            yield Promise.all([
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS costCenterId VARCHAR(36)`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS priceListId VARCHAR(36)`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paidAmount DECIMAL(15, 2) DEFAULT 0`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS salesmanId VARCHAR(36)`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS number VARCHAR(50)`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS createdBy VARCHAR(255)`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS referenceInvoiceId VARCHAR(36) COMMENT 'Links receipts to their source invoice'`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paymentBreakdown TEXT COMMENT 'JSON breakdown of payment methods'`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS isPOSSale BOOLEAN DEFAULT FALSE`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS posShiftId VARCHAR(36)`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS globalDiscountType VARCHAR(20) DEFAULT 'FIXED'`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS globalDiscountValue DECIMAL(15, 2) DEFAULT 0`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currencyCode VARCHAR(10) DEFAULT 'EGP'`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchangeRate DECIMAL(15, 6) DEFAULT 1`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS foreignTotal DECIMAL(15, 2) DEFAULT NULL`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bankTransfers TEXT COMMENT 'JSON array of bank transfer details'`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voucherCategory VARCHAR(50) DEFAULT NULL COMMENT 'supplier, expenses, employee_advance, labour, salary'`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bankTransferReference VARCHAR(100) DEFAULT NULL COMMENT 'بند رقم عملية التحويل البنكي'`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paymentSources TEXT DEFAULT NULL COMMENT 'JSON array of multi-source payment breakdown [{type,sourceId,sourceName,accountId,amount}]'`).catch(() => { }),
                // Core columns that may be missing in older client databases
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dueDate DATETIME`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS taxAmount DECIMAL(15, 2) DEFAULT 0`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS whtAmount DECIMAL(15, 2) DEFAULT 0`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shippingFee DECIMAL(15, 2) DEFAULT 0`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS globalDiscount DECIMAL(15, 2) DEFAULT 0`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS warehouseId VARCHAR(36)`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bankAccountId VARCHAR(36)`).catch(() => { }),
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bankName VARCHAR(100)`).catch(() => { }),
            ]);
            // BATCH: Invoice indexes (run in parallel)
            yield Promise.all([
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_referenceInvoiceId ON invoices(referenceInvoiceId)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_pos_shift ON invoices(posShiftId)`).catch(() => { }),
                // FIX: Ensure posShiftId uses utf8mb4 — on Hostinger the table may use utf8mb3,
                // causing collation mismatches when comparing with pos_shifts.id (utf8mb4)
                conn.query(`ALTER TABLE invoices MODIFY COLUMN posShiftId VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`).catch(() => { }),
                // CONCURRENCY: Prevent duplicate invoice numbers when 10+ users create invoices simultaneously
                conn.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number_unique ON invoices(number)`).catch(() => { }),
                // PERFORMANCE: Speed up partner statement queries & type-based filters
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_partnerId ON invoices(partnerId)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_type_date ON invoices(type, date)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`).catch(() => { }),
                // COVERING INDEX: Speeds up the inv_agg subquery used to calculate partner balances.
                // Covers: WHERE status, GROUP BY partnerId, and all SUM columns (type, paymentMethod, total, whtAmount)
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_balance_calc ON invoices(status, partnerId, type, paymentMethod, total, whtAmount)`).catch(() => { }),
                // PERFORMANCE: Covering index for ORDER BY date DESC, number DESC with type filter
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_type_date_desc ON invoices(type, date DESC, number DESC)`).catch(() => { }),
                // PERFORMANCE: partnerName for search queries
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_partnerName ON invoices(partnerName)`).catch(() => { }),
                // PERFORMANCE: createdBy filter and unique creators dropdown
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_type_createdBy ON invoices(type, createdBy)`).catch(() => { }),
                // PERFORMANCE: Payment method filter
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_paymentMethod ON invoices(paymentMethod)`).catch(() => { }),
                // PERF: Customer last price lookup — joins invoices+invoice_lines by partnerId+type+date
                // This query fires per line item when editing an invoice, causing N+1 when unindexed
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_partner_type_date ON invoices(partnerId, type, date DESC)`).catch(() => { }),
                // PERF: sourceInvoiceId used for cascade delete checks and payment linkage
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_sourceInvoiceId ON invoices(sourceInvoiceId)`).catch(() => { }),
                // PERF: bankTransferReference for bank statement batch lookup
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_bankTransferRef ON invoices(bankTransferReference)`).catch(() => { }),
            ]);
            // ═══════════════════════════════════════════════════════════
            // CRITICAL PERFORMANCE INDEXES FOR 15+ CONCURRENT USERS
            // These child tables are queried on every view/list/create
            // Without indexes, every query does a FULL TABLE SCAN
            // ═══════════════════════════════════════════════════════════
            // Add notes to journal_entries to support manual notes
            yield conn.query(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS notes TEXT`).catch(() => { });
            yield Promise.all([
                // invoice_lines — queried on every invoice list, detail, delete, update
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoiceId ON invoice_lines(invoiceId)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoice_lines_productId ON invoice_lines(productId)`).catch(() => { }),
                // PERF: Composite index for customer last price JOIN (invoiceId+productId in one index)
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoice_lines_product_invoice ON invoice_lines(productId, invoiceId)`).catch(() => { }),
                // stock_permit_items — queried on every permit view/list
                conn.query(`CREATE INDEX IF NOT EXISTS idx_stock_permit_items_permitId ON stock_permit_items(permitId)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_stock_permit_items_productId ON stock_permit_items(productId)`).catch(() => { }),
                // product_stocks — queried on every sale, purchase, permit, POS, production
                conn.query(`CREATE INDEX IF NOT EXISTS idx_product_stocks_productId_warehouseId ON product_stocks(productId, warehouseId)`).catch(() => { }),
                // cheques — queried with invoice lists and partner statements
                conn.query(`CREATE INDEX IF NOT EXISTS idx_cheques_transactionId ON cheques(transactionId)`).catch(() => { }),
                // stock_movements — queried in inventory reports, permit creation
                conn.query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_id ON stock_movements(reference_id)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_id ON stock_movements(warehouse_id)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_movement_date ON stock_movements(movement_date)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_id ON stock_movements(variant_id)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_warehouse ON stock_movements(variant_id, warehouse_id)`).catch(() => { }),
                // stock_reservations — queried during dispatch
                conn.query(`CREATE INDEX IF NOT EXISTS idx_stock_reservations_invoiceId ON stock_reservations(invoiceId)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_stock_reservations_productId ON stock_reservations(productId)`).catch(() => { }),
                // journal_lines — queried on every account view, trial balance, financial report
                conn.query(`CREATE INDEX IF NOT EXISTS idx_journal_lines_journalId ON journal_lines(journalId)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_journal_lines_accountId ON journal_lines(accountId)`).catch(() => { }),
                // PERF: Covering index for bank statement & general ledger — avoids table lookups entirely
                conn.query(`CREATE INDEX IF NOT EXISTS idx_journal_lines_ledger_cover ON journal_lines(accountId, journalId, debit, credit, foreignDebit, foreignCredit, currencyCode, exchangeRate)`).catch(() => { }),
                // PERF: Composite index on journal_entries for date range + id JOIN pattern
                conn.query(`CREATE INDEX IF NOT EXISTS idx_journal_entries_date_id ON journal_entries(date, id)`).catch(() => { }),
                // PERF: referenceId used by cascade delete to find journals linked to invoices/vouchers
                conn.query(`CREATE INDEX IF NOT EXISTS idx_journal_entries_referenceId ON journal_entries(referenceId)`).catch(() => { }),
                // products — queried during search, barcode scan
                conn.query(`CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_products_name ON products(name(100))`).catch(() => { }),
                // PERF v2: B-tree index on search_vector for Arabic-normalized LIKE queries
                conn.query(`CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products(search_vector(100))`).catch(() => { }),
            ]);
            // ========================================
            // POS CONFIG TABLES (shift definitions + devices)
            // ========================================
            yield Promise.all([
                conn.query(`
        CREATE TABLE IF NOT EXISTS pos_shift_definitions (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          isDefault BOOLEAN DEFAULT FALSE,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `),
                conn.query(`
        CREATE TABLE IF NOT EXISTS pos_devices (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          isDefault BOOLEAN DEFAULT FALSE,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `),
            ]);
            // ========================================
            // POS SYSTEM TABLES (run in parallel - no dependencies between them)
            // ========================================
            yield Promise.all([
                conn.query(`
        CREATE TABLE IF NOT EXISTS pos_shifts (
          id VARCHAR(36) PRIMARY KEY,
          userId VARCHAR(36) NOT NULL,
          warehouseId VARCHAR(36),
          shiftDefinitionId VARCHAR(36),
          deviceId VARCHAR(36),
          terminalName VARCHAR(100),
          openedAt DATETIME NOT NULL,
          closedAt DATETIME,
          openingCash DECIMAL(15,2) DEFAULT 0,
          closingCash DECIMAL(15,2),
          expectedCash DECIMAL(15,2),
          variance DECIMAL(15,2),
          closingCard DECIMAL(15,2),
          expectedCard DECIMAL(15,2),
          varianceCard DECIMAL(15,2),
          totalSales DECIMAL(15,2) DEFAULT 0,
          totalRefunds DECIMAL(15,2) DEFAULT 0,
          totalPurchases DECIMAL(15,2) DEFAULT 0,
          salesCount INT DEFAULT 0,
          refundCount INT DEFAULT 0,
          purchasesCount INT DEFAULT 0,
          closingRecipientType ENUM('EMPLOYEE', 'TREASURY') DEFAULT NULL,
          closingRecipientId VARCHAR(36) DEFAULT NULL,
          treasuryId VARCHAR(36) NULL,
          adminOpeningAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
          adminOpeningAmountSetBy VARCHAR(36) NULL,
          adminOpeningAmountSetAt DATETIME NULL,
          shortageEmployeeId VARCHAR(36) NULL,
          approvalStatus ENUM('pending','approved','flagged') NOT NULL DEFAULT 'pending',
          approvedBy VARCHAR(36) NULL,
          approvedAt DATETIME NULL,
          actualCashReceived DECIMAL(15,2) NULL,
          discrepancyAmount DECIMAL(15,2) NULL,
          discrepancyNotes TEXT NULL,
          adminNotes TEXT NULL,
          adminShortageEmployeeId VARCHAR(36) NULL,
          status ENUM('OPEN', 'CLOSED', 'PENDING_VALIDATION', 'VALIDATED', 'SUSPENDED') DEFAULT 'OPEN',
          notes TEXT,
          validatedBy VARCHAR(36),
          validatedAt DATETIME,
          validationNotes TEXT,
          closingBankDetails TEXT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_pos_shifts_user (userId),
          INDEX idx_pos_shifts_status (status),
          INDEX idx_pos_shifts_opened (openedAt),
          INDEX idx_pos_shifts_device (deviceId),
          INDEX idx_pos_shifts_definition (shiftDefinitionId)
        )
      `),
                conn.query(`
        CREATE TABLE IF NOT EXISTS pos_cash_movements (
          id VARCHAR(36) PRIMARY KEY,
          shiftId VARCHAR(36) NOT NULL,
          type VARCHAR(50) NOT NULL DEFAULT 'SALE',
          amount DECIMAL(15,2) NOT NULL,
          paymentMethod VARCHAR(50) DEFAULT 'CASH',
          description TEXT,
          referenceId VARCHAR(36),
          referenceType VARCHAR(50),
          approvedBy VARCHAR(36),
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_cash_movements_shift (shiftId),
          INDEX idx_cash_movements_type (type)
        )
      `),
                conn.query(`
        CREATE TABLE IF NOT EXISTS pos_held_orders (
          id VARCHAR(36) PRIMARY KEY,
          shiftId VARCHAR(36) NOT NULL,
          userId VARCHAR(36) NOT NULL,
          customerId VARCHAR(36),
          customerName VARCHAR(255),
          orderData JSON NOT NULL,
          holdNote TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_held_orders_shift (shiftId)
        )
      `),
                conn.query(`
        CREATE TABLE IF NOT EXISTS pos_favorites (
          id VARCHAR(36) PRIMARY KEY,
          userId VARCHAR(36),
          productId VARCHAR(36) NOT NULL,
          sortOrder INT DEFAULT 0,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_product (userId, productId),
          INDEX idx_favorites_user (userId),
          INDEX idx_favorites_product (productId)
        )
      `),
            ]);
            // Ensure pos_shifts has the new fields (migration for existing DBs)
            // Older MySQL/MariaDB do not support "ADD COLUMN IF NOT EXISTS", so we catch the duplicate column error
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN shiftDefinitionId VARCHAR(36)`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN deviceId VARCHAR(36)`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN closingRecipientType ENUM('EMPLOYEE', 'TREASURY') DEFAULT NULL`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN closingRecipientId VARCHAR(36) DEFAULT NULL`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN validatedBy VARCHAR(36)`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN validatedAt DATETIME`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN validationNotes TEXT`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN closingCard DECIMAL(15,2)`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN expectedCard DECIMAL(15,2)`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN varianceCard DECIMAL(15,2)`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`ALTER TABLE pos_shifts MODIFY COLUMN status ENUM('OPEN', 'CLOSED', 'PENDING_VALIDATION', 'VALIDATED', 'SUSPENDED') DEFAULT 'OPEN'`).catch(() => { });
            // Migration: Widen paymentMethod from ENUM to VARCHAR(50) — the ENUM was too narrow
            // (CASH, BANK, CHEQUE, MIXED, CREDIT) and silently truncated DEFERRED/TREASURY inserts
            yield conn.query(`ALTER TABLE pos_cash_movements MODIFY COLUMN paymentMethod VARCHAR(50) DEFAULT 'CASH'`).catch(() => { });
            // Migration: Widen type from ENUM to VARCHAR(50) — the ENUM lacked EXPENSE/CASH_IN/CASH_OUT
            // causing MariaDB to silently insert empty string for expense movements
            yield conn.query(`ALTER TABLE pos_cash_movements MODIFY COLUMN type VARCHAR(50) NOT NULL DEFAULT 'SALE'`).catch(() => { });
            // Fix orphaned empty-type rows linked to pos_expenses
            yield conn.query(`
      UPDATE pos_cash_movements SET type = 'EXPENSE'
      WHERE (type = '' OR type IS NULL)
        AND referenceId IS NOT NULL
        AND referenceId IN (SELECT id FROM pos_expenses)
    `).catch(() => { });
            // Add remaining pos_shifts columns (migrated from controllers)
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN treasuryId VARCHAR(36) NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN adminOpeningAmount DECIMAL(15,2) NOT NULL DEFAULT 0`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN adminOpeningAmountSetBy VARCHAR(36) NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN adminOpeningAmountSetAt DATETIME NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN shortageEmployeeId VARCHAR(36)`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN approvalStatus ENUM('pending','approved','flagged') NOT NULL DEFAULT 'pending'`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN approvedBy VARCHAR(36) NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN approvedAt DATETIME NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN actualCashReceived DECIMAL(15,2) NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN discrepancyAmount DECIMAL(15,2) NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN discrepancyNotes TEXT NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN adminNotes TEXT NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN adminShortageEmployeeId VARCHAR(36) NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN totalPurchases DECIMAL(15,2) DEFAULT 0`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN purchasesCount INT DEFAULT 0`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_shifts ADD COLUMN closingBankDetails TEXT NULL`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            // POS Settings
            yield conn.query(`
        CREATE TABLE IF NOT EXISTS pos_settings (
            id INT PRIMARY KEY DEFAULT 1,
            receiptPrinterId VARCHAR(255) NULL,
            kitchenPrinterId VARCHAR(255) NULL,
            autoPrintReceipt TINYINT(1) DEFAULT 1,
            printKitchenTickets TINYINT(1) DEFAULT 0,
            perInvoiceAccounting TINYINT(1) NOT NULL DEFAULT 0,
            printAfterConfirm TINYINT(1) NOT NULL DEFAULT 1,
            useNumpad TINYINT(1) NOT NULL DEFAULT 1,
            allowedCategories JSON NULL,
            warrantyCategories JSON NULL,
            autoCloseEnabled TINYINT(1) NOT NULL DEFAULT 0,
            autoCloseTime VARCHAR(5) NOT NULL DEFAULT '23:59',
            editCutoffDate DATE NULL,
            editCutoffDays INT NOT NULL DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `).catch(() => { });
            yield conn.query(`ALTER TABLE pos_settings ADD COLUMN perInvoiceAccounting TINYINT(1) NOT NULL DEFAULT 0`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_settings ADD COLUMN printAfterConfirm TINYINT(1) NOT NULL DEFAULT 1`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_settings ADD COLUMN useNumpad TINYINT(1) NOT NULL DEFAULT 1`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_settings ADD COLUMN allowedCategories JSON NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_settings ADD COLUMN warrantyCategories JSON NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_settings ADD COLUMN autoCloseEnabled TINYINT(1) NOT NULL DEFAULT 0`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_settings ADD COLUMN autoCloseTime VARCHAR(5) NOT NULL DEFAULT '23:59'`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_settings ADD COLUMN editCutoffDate DATE NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_settings ADD COLUMN editCutoffDays INT NOT NULL DEFAULT 0`).catch(() => { });
            // Cashier discount cap: 0 = no limit, 5 = max 5% discount for non-admin users
            yield conn.query(`ALTER TABLE pos_settings ADD COLUMN cashierMaxDiscountPercent DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT 'Max discount % for non-admin POS users (0 = no limit)'`).catch(() => { });
            // POS Expenses
            yield conn.query(`
        CREATE TABLE IF NOT EXISTS pos_expense_categories (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT NULL,
            isActive BOOLEAN DEFAULT TRUE,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `).catch(() => { });
            yield conn.query(`
        CREATE TABLE IF NOT EXISTS pos_expenses (
            id VARCHAR(36) PRIMARY KEY,
            shiftId VARCHAR(36) NOT NULL,
            categoryId VARCHAR(36) NOT NULL,
            amount DECIMAL(15,2) NOT NULL,
            paymentMethod VARCHAR(50) DEFAULT 'CASH',
            notes TEXT NULL,
            entityId VARCHAR(36) NULL,
            entityType ENUM('EMPLOYEE', 'SUPPLIER', 'MISC') NULL,
            createdBy VARCHAR(36) NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_pos_expenses_shift (shiftId),
            INDEX idx_pos_expenses_category (categoryId)
        )
    `).catch(() => { });
            yield conn.query(`ALTER TABLE pos_expenses ADD COLUMN entityId VARCHAR(36) NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_expenses ADD COLUMN entityType ENUM('EMPLOYEE', 'SUPPLIER', 'MISC') NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_expenses ADD COLUMN description TEXT NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE pos_expenses ADD COLUMN sourceType VARCHAR(30) DEFAULT 'daily_takings'`).catch(() => { });
            // Active cashier carts table
            yield conn.query(`
        CREATE TABLE IF NOT EXISTS pos_active_carts (
            cashierId VARCHAR(36) PRIMARY KEY,
            cashierName VARCHAR(255) NOT NULL,
            warehouseName VARCHAR(255) NOT NULL,
            cartState JSON NOT NULL,
            remoteUpdate JSON DEFAULT NULL,
            updatedAt BIGINT NOT NULL
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `).catch(() => { });
            // ========================================
            // LOYALTY SYSTEM TABLES (نظام الولاء)
            // ========================================
            yield Promise.all([
                conn.query(`
        CREATE TABLE IF NOT EXISTS loyalty_settings (
          id VARCHAR(36) PRIMARY KEY,
          balanceType ENUM('loyalty_points', 'package_balance') DEFAULT 'loyalty_points',
          minimumRedemptionPoints INT NOT NULL DEFAULT 100 COMMENT 'Min points to redeem',
          conversionRate DECIMAL(10,2) NOT NULL DEFAULT 1 COMMENT 'EGP value per redeemed point',
          allowDecimals BOOLEAN DEFAULT FALSE COMMENT 'Allow decimal conversion rate?',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `),
                conn.query(`
        CREATE TABLE IF NOT EXISTS loyalty_rules (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          status ENUM('active', 'inactive') DEFAULT 'active',
          priority INT NOT NULL DEFAULT 1 COMMENT 'Higher number = higher priority',
          customerClassification VARCHAR(50) DEFAULT NULL COMMENT 'Matches partners.classification',
          accumulationRate DECIMAL(10,2) NOT NULL DEFAULT 10 COMMENT 'EGP per 1 loyalty point',
          minimumSpend DECIMAL(15,2) DEFAULT NULL COMMENT 'Minimum invoice total to apply',
          expiryDays INT DEFAULT NULL COMMENT 'Days until points expire',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_loyalty_rules_status (status),
          INDEX idx_loyalty_rules_priority (priority)
        )
      `),
                conn.query(`
        CREATE TABLE IF NOT EXISTS loyalty_transactions (
          id VARCHAR(36) PRIMARY KEY,
          ruleId VARCHAR(36) DEFAULT NULL COMMENT 'Rule that triggered earning',
          customerId VARCHAR(36) NOT NULL,
          orderId VARCHAR(36) DEFAULT NULL COMMENT 'Invoice/order that triggered this',
          type ENUM('EARN', 'REDEEM', 'ADJUST', 'EXPIRE', 'REFUND_CLAWBACK') NOT NULL,
          points INT NOT NULL COMMENT 'Positive for earn/adjust-up, negative for redeem/clawback',
          monetaryValue DECIMAL(15,2) DEFAULT 0 COMMENT 'EGP equivalent',
          description TEXT,
          createdBy VARCHAR(100),
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          expiresAt DATETIME DEFAULT NULL COMMENT 'When points expire (for EARN only)',
          INDEX idx_loyalty_tx_customer (customerId),
          INDEX idx_loyalty_tx_rule (ruleId),
          INDEX idx_loyalty_tx_order (orderId),
          INDEX idx_loyalty_tx_type (type),
          INDEX idx_loyalty_tx_created (createdAt),
          INDEX idx_loyalty_tx_expires (expiresAt)
        )
      `),
                conn.query(`
        CREATE TABLE IF NOT EXISTS loyalty_point_consumptions (
          id VARCHAR(36) PRIMARY KEY,
          earnTransactionId VARCHAR(36) NOT NULL,
          consumeTransactionId VARCHAR(36) NOT NULL,
          pointsConsumed INT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_loyalty_consumptions_earn (earnTransactionId),
          INDEX idx_loyalty_consumptions_consume (consumeTransactionId),
          FOREIGN KEY (earnTransactionId) REFERENCES loyalty_transactions(id) ON DELETE CASCADE,
          FOREIGN KEY (consumeTransactionId) REFERENCES loyalty_transactions(id) ON DELETE CASCADE
        )
      `)
            ]);
            // Fallback settings if none exist
            yield conn.query(`
      INSERT INTO loyalty_settings (id, balanceType, minimumRedemptionPoints, conversionRate, allowDecimals)
      SELECT 'default-settings-id', 'loyalty_points', 100, 1.00, FALSE
      WHERE NOT EXISTS (SELECT id FROM loyalty_settings)
    `).catch(() => { });
            // Rename programId to ruleId in loyalty_transactions if it exists
            yield conn.query(`ALTER TABLE loyalty_transactions CHANGE programId ruleId VARCHAR(36) DEFAULT NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS expiresAt DATETIME DEFAULT NULL`).catch(() => { });
            // ========================================
            // PROMOTION ENGINE TABLES (محرك العروض والخصومات)
            // ========================================
            yield Promise.all([
                conn.query(`
        CREATE TABLE IF NOT EXISTS promotions (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type ENUM('PERCENT_ORDER','FIXED_ORDER','BUY_X_GET_Y','MIN_SPEND','CATEGORY_DISCOUNT','PRODUCT_DISCOUNT') NOT NULL,
          status ENUM('ACTIVE','PAUSED','ARCHIVED') DEFAULT 'ACTIVE',
          \`trigger\` ENUM('AUTO','COUPON_CODE') DEFAULT 'AUTO',
          couponCode VARCHAR(100) DEFAULT NULL,
          discountValue DECIMAL(10,2) NOT NULL DEFAULT 0,
          discountType ENUM('PERCENT','FIXED','FREE_PRODUCT') DEFAULT 'PERCENT',
          maxUsageTotal INT DEFAULT NULL COMMENT 'NULL = unlimited',
          maxUsagePerCustomer INT DEFAULT NULL COMMENT 'NULL = unlimited',
          isCombainable BOOLEAN DEFAULT FALSE COMMENT 'Can stack with other promos',
          priority INT DEFAULT 10 COMMENT 'Lower = evaluated first',
          startDate DATETIME DEFAULT NULL,
          endDate DATETIME DEFAULT NULL,
          usageCount INT DEFAULT 0 COMMENT 'Derived counter, updated on each application',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          createdBy VARCHAR(100),
          INDEX idx_promotions_status (status),
          INDEX idx_promotions_trigger (\`trigger\`),
          INDEX idx_promotions_coupon (couponCode),
          INDEX idx_promotions_dates (startDate, endDate)
        )
      `),
                conn.query(`
        CREATE TABLE IF NOT EXISTS promo_rules (
          id VARCHAR(36) PRIMARY KEY,
          promotionId VARCHAR(36) NOT NULL,
          ruleType ENUM('MIN_AMOUNT','MIN_QTY','PRODUCT_IN_CART','CATEGORY_IN_CART','CUSTOMER_GROUP','DAY_OF_WEEK','TIME_RANGE') NOT NULL,
          targetValue TEXT NOT NULL COMMENT 'Product IDs, category IDs, amounts, day numbers, time ranges, etc.',
          operator ENUM('GTE','EQ','IN','LTE') DEFAULT 'GTE',
          INDEX idx_promo_rules_promotion (promotionId)
        )
      `),
                conn.query(`
        CREATE TABLE IF NOT EXISTS promo_applications (
          id VARCHAR(36) PRIMARY KEY,
          promotionId VARCHAR(36) NOT NULL,
          invoiceId VARCHAR(36) NOT NULL,
          customerId VARCHAR(36) DEFAULT NULL,
          discountApplied DECIMAL(15,2) NOT NULL DEFAULT 0,
          appliedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          appliedBy VARCHAR(100),
          INDEX idx_promo_app_promotion (promotionId),
          INDEX idx_promo_app_invoice (invoiceId),
          INDEX idx_promo_app_customer (customerId)
        )
      `),
            ]);
            // ========================================
            // MEMBERSHIP SYSTEM TABLES (نظام الاشتراكات)
            // ========================================
            yield Promise.all([
                conn.query(`
        CREATE TABLE IF NOT EXISTS membership_packages (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          price DECIMAL(15,2) NOT NULL DEFAULT 0,
          duration INT NOT NULL COMMENT 'Duration in days',
          included_balance INT NOT NULL DEFAULT 0 COMMENT 'Number of allowed sessions/visits',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `),
                conn.query(`
        CREATE TABLE IF NOT EXISTS memberships (
          id VARCHAR(36) PRIMARY KEY,
          customerId VARCHAR(36) NOT NULL,
          packageId VARCHAR(36) NOT NULL,
          description TEXT,
          joinDate DATE NOT NULL,
          endDate DATE,
          status ENUM('pending', 'active', 'expired', 'suspended', 'cancelled') DEFAULT 'pending',
          invoiceId VARCHAR(36) COMMENT 'The invoice used to pay for this membership/renewal',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_memberships_customer (customerId),
          INDEX idx_memberships_status (status),
          INDEX idx_memberships_dates (joinDate, endDate)
        )
      `),
                conn.query(`
        CREATE TABLE IF NOT EXISTS membership_freeze_periods (
          id VARCHAR(36) PRIMARY KEY,
          membershipId VARCHAR(36) NOT NULL,
          freezeStart DATE NOT NULL,
          freezeEnd DATE NOT NULL,
          actualUnfreezeDate DATETIME DEFAULT NULL,
          extendMembership BOOLEAN DEFAULT FALSE,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_membership_freeze (membershipId),
          FOREIGN KEY (membershipId) REFERENCES memberships(id) ON DELETE CASCADE
        )
      `),
                conn.query(`
        CREATE TABLE IF NOT EXISTS membership_settings (
          id INT PRIMARY KEY DEFAULT 1,
          gracePeriodDays INT NOT NULL DEFAULT 0,
          attendanceAllowedFor ENUM('active_only', 'active_and_grace') DEFAULT 'active_only',
          createDraftInvoices BOOLEAN DEFAULT FALSE,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `)
            ]);
            // Seed default membership settings
            yield conn.query(`
      INSERT INTO membership_settings (id, gracePeriodDays, attendanceAllowedFor, createDraftInvoices)
      SELECT 1, 0, 'active_only', FALSE
      WHERE NOT EXISTS (SELECT id FROM membership_settings)
    `).catch(() => { });
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS invoice_lines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoiceId VARCHAR(36) NOT NULL,
        productId VARCHAR(36),
        productName VARCHAR(255),
        quantity INT DEFAULT 0,
        price DECIMAL(15, 2) DEFAULT 0,
        cost DECIMAL(15, 2) DEFAULT 0,
        discount DECIMAL(15, 2) DEFAULT 0,
        total DECIMAL(15, 2) DEFAULT 0,
        warehouseId VARCHAR(36) DEFAULT NULL COMMENT 'مخزن خاص بالصنف',
        serials JSON DEFAULT NULL COMMENT 'أرقام تسلسلية للصنف',
        hasWarranty TINYINT(1) DEFAULT 0,
        inBranchInstallation TINYINT(1) DEFAULT 0,
        warrantyMonths INT DEFAULT 0,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL
      )
    `);
            yield conn.query(`ALTER TABLE invoice_lines ADD COLUMN hasWarranty TINYINT(1) DEFAULT 0`).catch(() => { });
            yield conn.query(`ALTER TABLE invoice_lines ADD COLUMN inBranchInstallation TINYINT(1) DEFAULT 0`).catch(() => { });
            yield conn.query(`ALTER TABLE invoice_lines ADD COLUMN warrantyMonths INT DEFAULT 0`).catch(() => { });
            // Migration: Ensure invoice_lines.id has AUTO_INCREMENT (fixes "Field 'id' doesn't have a default value" error)
            // This is needed for databases that were created with an older schema
            yield conn.query(`
      ALTER TABLE invoice_lines MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT
    `).catch(() => {
                // Ignore error - column is already correct or table structure differs
            });
            // Deleted Invoices Table (Archive for audit trail and recovery)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS deleted_invoices (
        id VARCHAR(255) PRIMARY KEY,
        original_id VARCHAR(255) NOT NULL,
        date DATETIME,
        type VARCHAR(50),
        partnerId VARCHAR(255),
        partnerName VARCHAR(255),
        total DECIMAL(15, 2) DEFAULT 0,
        status VARCHAR(50),
        paymentMethod VARCHAR(50),
        posted BOOLEAN DEFAULT FALSE,
        notes TEXT,
        dueDate DATETIME,
        taxAmount DECIMAL(15, 2) DEFAULT 0,
        whtAmount DECIMAL(15, 2) DEFAULT 0,
        shippingFee DECIMAL(15, 2) DEFAULT 0,
        globalDiscount DECIMAL(15, 2) DEFAULT 0,
        warehouseId VARCHAR(255),
        costCenterId VARCHAR(255),
        paidAmount DECIMAL(15, 2) DEFAULT 0,
        bankAccountId VARCHAR(255),
        bankName VARCHAR(255),
        paymentBreakdown TEXT,
        salesmanId VARCHAR(255),
        createdBy VARCHAR(255),
        deletedBy VARCHAR(255) NOT NULL,
        deletedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deletionReason TEXT,
        INDEX idx_deleted_invoices_original_id (original_id),
        INDEX idx_deleted_invoices_deletedAt (deletedAt),
        INDEX idx_deleted_invoices_deletedBy (deletedBy),
        INDEX idx_deleted_invoices_type (type),
        INDEX idx_deleted_invoices_partnerId (partnerId)
      )
    `);
            // Deleted Invoice Lines Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS deleted_invoice_lines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        deletedInvoiceId VARCHAR(255) NOT NULL,
        originalInvoiceId VARCHAR(255) NOT NULL,
        productId VARCHAR(255),
        productName VARCHAR(255),
        quantity DECIMAL(15, 3) DEFAULT 0,
        price DECIMAL(15, 2) DEFAULT 0,
        cost DECIMAL(15, 2) DEFAULT 0,
        discount DECIMAL(15, 2) DEFAULT 0,
        total DECIMAL(15, 2) DEFAULT 0,
        hasWarranty TINYINT(1) DEFAULT 0,
        inBranchInstallation TINYINT(1) DEFAULT 0,
        warrantyMonths INT DEFAULT 0,
        INDEX idx_deleted_lines_deletedInvoiceId (deletedInvoiceId),
        INDEX idx_deleted_lines_originalInvoiceId (originalInvoiceId),
        FOREIGN KEY (deletedInvoiceId) REFERENCES deleted_invoices(id) ON DELETE CASCADE
      )
    `);
            yield conn.query(`ALTER TABLE deleted_invoice_lines ADD COLUMN hasWarranty TINYINT(1) DEFAULT 0`).catch(() => { });
            yield conn.query(`ALTER TABLE deleted_invoice_lines ADD COLUMN inBranchInstallation TINYINT(1) DEFAULT 0`).catch(() => { });
            yield conn.query(`ALTER TABLE deleted_invoice_lines ADD COLUMN warrantyMonths INT DEFAULT 0`).catch(() => { });
            // Journal Entries Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id VARCHAR(36) PRIMARY KEY,
        date DATETIME NOT NULL,
        description TEXT,
        referenceId VARCHAR(36)
      )
    `);
            // DIAGNOSTIC: Verify journal_entries schema has the expected 'id' column
            // This helps diagnose the 'Unknown column j.id' errors on some client servers
            try {
                const [jeColumns] = yield conn.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journal_entries' 
         ORDER BY ORDINAL_POSITION`);
                const colNames = jeColumns.map((c) => c.COLUMN_NAME || c.column_name);
                if (!colNames.includes('id')) {
                    console.error('⚠️ CRITICAL: journal_entries table is MISSING the "id" column! Columns found:', colNames.join(', '));
                }
                else {
                    console.log(`✅ journal_entries schema verified: ${colNames.length} columns, id present`);
                }
            }
            catch (diagErr) {
                console.warn('⚠️ Could not verify journal_entries schema:', diagErr);
            }
            // Journal Lines Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS journal_lines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        journalId VARCHAR(36) NOT NULL,
        accountId VARCHAR(36) NOT NULL,
        accountName VARCHAR(255),
        debit DECIMAL(15, 2) DEFAULT 0,
        credit DECIMAL(15, 2) DEFAULT 0,
        costCenterId VARCHAR(36),
        FOREIGN KEY (journalId) REFERENCES journal_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);
            // Migration: Ensure journal_lines.id has AUTO_INCREMENT
            yield conn.query(`
      ALTER TABLE journal_lines MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT
    `).catch(() => { });
            // Migration: Ensure deleted_invoice_lines.id has AUTO_INCREMENT
            yield conn.query(`
      ALTER TABLE deleted_invoice_lines MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT
    `).catch(() => { });
            // Migration: Ensure stock_permit_items.id has AUTO_INCREMENT
            yield conn.query(`
      ALTER TABLE stock_permit_items MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT
    `).catch(() => { });
            // Migration: Ensure stock_taking_items.id has AUTO_INCREMENT
            yield conn.query(`
      ALTER TABLE stock_taking_items MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT
    `).catch(() => { });
            // Migration: Add name and sku columns to stock_taking_items
            yield conn.query(`ALTER TABLE stock_taking_items ADD COLUMN name VARCHAR(255) DEFAULT '' AFTER productId`).catch(() => { });
            yield conn.query(`ALTER TABLE stock_taking_items ADD COLUMN sku VARCHAR(100) DEFAULT '' AFTER name`).catch(() => { });
            // Cheques Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS cheques (
        id VARCHAR(36) PRIMARY KEY,
        number VARCHAR(50),
        bankName VARCHAR(100),
        amount DECIMAL(15, 2) DEFAULT 0,
        dueDate DATETIME,
        status VARCHAR(50),
        type VARCHAR(50),
        partnerId VARCHAR(36),
        partnerName VARCHAR(255),
        description TEXT,
        createdDate DATETIME,
        bankAccountId VARCHAR(36),
        bounceReason TEXT,
        FOREIGN KEY (partnerId) REFERENCES partners(id) ON DELETE SET NULL
      )
    `);
            // Installment Plans Table - خطط التقسيط
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS installment_plans (
        id VARCHAR(36) PRIMARY KEY,
        invoiceId VARCHAR(36) NOT NULL,
        partnerId VARCHAR(36) NOT NULL,
        partnerName VARCHAR(255),
        totalAmount DECIMAL(15, 2) NOT NULL,
        downPayment DECIMAL(15, 2) DEFAULT 0,
        remainingAmount DECIMAL(15, 2) NOT NULL,
        numberOfInstallments INT NOT NULL,
        intervalDays INT DEFAULT 30,
        startDate DATE NOT NULL,
        status ENUM('ACTIVE', 'COMPLETED', 'CANCELLED', 'OVERDUE') DEFAULT 'ACTIVE',
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        createdBy VARCHAR(100),
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (partnerId) REFERENCES partners(id) ON DELETE CASCADE,
        INDEX idx_installment_plan_partner (partnerId),
        INDEX idx_installment_plan_invoice (invoiceId),
        INDEX idx_installment_plan_status (status)
      )
    `);
            // Installments Table - الأقساط الفردية
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS installments (
        id VARCHAR(36) PRIMARY KEY,
        planId VARCHAR(36) NOT NULL,
        installmentNumber INT NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        dueDate DATE NOT NULL,
        paidAmount DECIMAL(15, 2) DEFAULT 0,
        paidDate DATETIME,
        status ENUM('PENDING', 'PARTIAL', 'PAID', 'OVERDUE') DEFAULT 'PENDING',
        paymentMethod VARCHAR(50),
        paymentReference VARCHAR(100),
        notes TEXT,
        FOREIGN KEY (planId) REFERENCES installment_plans(id) ON DELETE CASCADE,
        INDEX idx_installment_plan (planId),
        INDEX idx_installment_due_date (dueDate),
        INDEX idx_installment_status (status)
      )
    `);
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS banks (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        accountNumber VARCHAR(100),
        currency VARCHAR(10),
        balance DECIMAL(15, 2) DEFAULT 0,
        branch VARCHAR(100),
        iban VARCHAR(100),
        swift VARCHAR(50),
        type VARCHAR(50),
        accountId VARCHAR(36),
        color VARCHAR(100)
      )
    `);
            // Branch isolation: link each treasury/bank to a branch
            yield conn.query(`ALTER TABLE banks ADD COLUMN IF NOT EXISTS branchId VARCHAR(36) COMMENT 'الفرع المالك للخزينة'`).catch(() => { });
            yield conn.query(`CREATE INDEX IF NOT EXISTS idx_banks_branchId ON banks(branchId)`).catch(() => { });
            yield conn.query(`ALTER TABLE banks ADD COLUMN bankType VARCHAR(20) DEFAULT 'BANK'`).catch(() => { });
            yield conn.query(`ALTER TABLE banks ADD COLUMN isActive BOOLEAN DEFAULT TRUE`).catch(() => { });
            yield conn.query(`ALTER TABLE banks ADD COLUMN isPrimary BOOLEAN DEFAULT FALSE`).catch(() => { });
            yield conn.query(`ALTER TABLE banks ADD COLUMN depositPermissions JSON`).catch(() => { });
            yield conn.query(`ALTER TABLE banks ADD COLUMN withdrawPermissions JSON`).catch(() => { });
            // Payment Fees: per-bank fee configuration (رسوم الدفع)
            yield conn.query(`ALTER TABLE banks ADD COLUMN IF NOT EXISTS feeEnabled BOOLEAN DEFAULT FALSE COMMENT 'تفعيل رسوم الدفع'`).catch(() => { });
            yield conn.query(`ALTER TABLE banks ADD COLUMN IF NOT EXISTS feeType VARCHAR(20) DEFAULT 'PERCENTAGE' COMMENT 'نوع الرسوم: PERCENTAGE / FIXED / BOTH'`).catch(() => { });
            yield conn.query(`ALTER TABLE banks ADD COLUMN IF NOT EXISTS feePercentage DECIMAL(5,2) DEFAULT 0 COMMENT 'نسبة الرسوم'`).catch(() => { });
            yield conn.query(`ALTER TABLE banks ADD COLUMN IF NOT EXISTS feeFixedAmount DECIMAL(15,2) DEFAULT 0 COMMENT 'مبلغ ثابت للرسوم'`).catch(() => { });
            yield conn.query(`ALTER TABLE banks ADD COLUMN IF NOT EXISTS feeMinAmount DECIMAL(15,2) DEFAULT 0 COMMENT 'الحد الأدنى للرسوم'`).catch(() => { });
            yield conn.query(`ALTER TABLE banks ADD COLUMN IF NOT EXISTS feeTaxRate DECIMAL(5,2) DEFAULT 0 COMMENT 'نسبة الضريبة على الرسوم'`).catch(() => { });
            // Fixed Assets Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS fixed_assets (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        purchaseDate DATETIME,
        purchaseCost DECIMAL(15, 2) DEFAULT 0,
        salvageValue DECIMAL(15, 2) DEFAULT 0,
        lifeYears INT,
        assetAccountId VARCHAR(36),
        accumulatedDepreciationAccountId VARCHAR(36),
        expenseAccountId VARCHAR(36),
        status VARCHAR(50),
        lastDepreciationDate DATETIME
      )
    `);
            // Stock Permits Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS stock_permits (
        id VARCHAR(36) PRIMARY KEY,
        number INT AUTO_INCREMENT UNIQUE,
        date DATETIME NOT NULL,
        type VARCHAR(50),
        description TEXT,
        sourceWarehouseId VARCHAR(36),
        destWarehouseId VARCHAR(36),
        createdBy VARCHAR(100),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
            // Stock Permit Items Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS stock_permit_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        permitId VARCHAR(36) NOT NULL,
        productId VARCHAR(36),
        productName VARCHAR(255),
        quantity DECIMAL(18, 8) DEFAULT 0,
        cost DECIMAL(15, 2) DEFAULT 0,
        FOREIGN KEY (permitId) REFERENCES stock_permits(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL
      )
    `);
            // Migrations: Add warehouse transfer columns to stock_permit_items (for existing databases)
            yield conn.query(`ALTER TABLE stock_permit_items ADD COLUMN IF NOT EXISTS source_warehouse_id VARCHAR(36) DEFAULT NULL COMMENT 'مخزن المصدر للتحويل'`).catch(() => { });
            yield conn.query(`ALTER TABLE stock_permit_items ADD COLUMN IF NOT EXISTS dest_warehouse_id VARCHAR(36) DEFAULT NULL COMMENT 'مخزن الوجهة للتحويل'`).catch(() => { });
            // Migration: Add variant columns to stock_permit_items for variant-aware permits
            yield conn.query(`ALTER TABLE stock_permit_items ADD COLUMN variantId VARCHAR(36) DEFAULT NULL COMMENT 'معرف التشكيلة'`).catch(() => { });
            yield conn.query(`ALTER TABLE stock_permit_items ADD COLUMN variantLabel VARCHAR(255) DEFAULT NULL COMMENT 'اسم التشكيلة'`).catch(() => { });
            // Migrations for stock permit tables (for existing databases)
            yield conn.query(`
      ALTER TABLE stock_permits 
      ADD COLUMN IF NOT EXISTS createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    `).catch(() => {
                // Ignore error if column already exists
            });
            yield conn.query(`
      ALTER TABLE stock_permits 
      ADD COLUMN IF NOT EXISTS number INT AUTO_INCREMENT UNIQUE
    `).catch(() => {
                // Ignore error if column already exists
            });
            yield conn.query(`
      ALTER TABLE stock_permits 
      ADD COLUMN IF NOT EXISTS updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    `).catch(() => {
                // Ignore error if column already exists
            });
            // Stock Reservations Table (حجز المخزون)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS stock_reservations (
        id VARCHAR(36) PRIMARY KEY,
        invoiceId VARCHAR(36) NOT NULL,
        invoiceNumber VARCHAR(50),
        productId VARCHAR(36) NOT NULL,
        productName VARCHAR(255),
        warehouseId VARCHAR(36),
        quantity DECIMAL(15,5) NOT NULL,
        status ENUM('RESERVED','DISPATCHED','CANCELLED') DEFAULT 'RESERVED',
        dispatchPermitId VARCHAR(36),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_invoice (invoiceId),
        INDEX idx_product (productId),
        INDEX idx_status (status),
        INDEX idx_warehouse (warehouseId)
      )
    `);
            // Add reserved_stock column to product_stocks
            yield conn.query(`
      ALTER TABLE product_stocks ADD COLUMN IF NOT EXISTS reserved_stock DECIMAL(15,5) DEFAULT 0
    `).catch(() => { });
            // Migration: Add updatedAt and createdAt to core tables for delta sync support
            const coreTables = ['products', 'partners', 'invoices', 'transactions'];
            for (const table of coreTables) {
                yield conn.query(`
        ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      `).catch(() => { });
                yield conn.query(`
        ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      `).catch(() => { });
            }
            yield conn.query(`
      ALTER TABLE stock_permits 
      ADD COLUMN createdBy VARCHAR(100)
    `).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`
      ALTER TABLE stock_permit_items 
      ADD COLUMN productName VARCHAR(255)
    `).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`
      ALTER TABLE stock_permit_items 
      ADD COLUMN driverName VARCHAR(255)
    `).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            // Migration: Add returnCondition to invoice_lines for return invoice condition tracking (سليم/هالك)
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN returnCondition VARCHAR(20) DEFAULT NULL
    `).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`
      ALTER TABLE deleted_invoice_lines 
      ADD COLUMN returnCondition VARCHAR(20) DEFAULT NULL
    `).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            // Users Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(100) UNIQUE,
        username VARCHAR(100),
        password VARCHAR(255),
        role VARCHAR(50),
        status VARCHAR(50),
        permissions TEXT,
        lastLogin DATETIME,
        avatar TEXT,
        isHidden BOOLEAN DEFAULT FALSE,
        salesmanId VARCHAR(36),
        partnerId VARCHAR(36) DEFAULT NULL,
        userType VARCHAR(50) DEFAULT 'NORMAL'
      )
    `);
            // Add salesmanId column if it doesn't exist (for existing databases)
            yield conn.query(`
      ALTER TABLE users ADD COLUMN salesmanId VARCHAR(36)
    `).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            // System Config Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        companyName VARCHAR(255),
        companyAddress TEXT,
        companyPhone VARCHAR(50),
        companyEmail VARCHAR(100),
        taxId VARCHAR(50),
        commercialRegister VARCHAR(50),
        currency VARCHAR(10),
        vatRate DECIMAL(5, 2) DEFAULT 15,
        config JSON,
        enabledModules JSON
      )
    `);
            // Migration: Add enabledModules column for existing databases
            yield conn.query(`
      ALTER TABLE system_config 
      ADD COLUMN IF NOT EXISTS enabledModules JSON
    `).catch(() => {
                // Ignore error if column already exists
            });
            // Migration: Add isHidden column to users table for existing databases
            yield conn.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS isHidden BOOLEAN DEFAULT FALSE
    `).catch(() => {
                // Ignore error if column already exists
            });
            // Migration: Add salesmanId column to users table for salesman data isolation
            yield conn.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS salesmanId VARCHAR(36)
    `).catch(() => {
                // Ignore error if column already exists
            });
            // Add index for users.salesmanId
            try {
                yield conn.query('CREATE INDEX idx_users_salesmanId ON users(salesmanId)');
            }
            catch (e) { /* Ignore if exists */ }
            // Migration: Add preferences column to users table for storing user preferences (column visibility, etc.)
            yield conn.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS preferences JSON NULL
    `).catch(() => {
                // Ignore error if column already exists
            });
            // ═══════════════════════════════════════════════════════════
            // BRANCH ISOLATION: Link users to branches for strict data isolation
            // CASHIER/SALES see only their branch's warehouses + treasury
            // ADMIN/MANAGER see everything across all branches
            // ═══════════════════════════════════════════════════════════
            yield conn.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS branchId VARCHAR(36)`).catch(() => { });
            yield conn.query(`CREATE INDEX IF NOT EXISTS idx_users_branchId ON users(branchId)`).catch(() => { });
            yield conn.query(`ALTER TABLE users ADD COLUMN plain_password VARCHAR(255) NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE users ADD COLUMN defaultTreasuryId VARCHAR(36) NULL DEFAULT NULL`).catch(() => { });
            // Smart Attendance: Link users to employees for login-based attendance
            yield conn.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS employeeId VARCHAR(36)`).catch(() => { });
            yield conn.query(`CREATE INDEX IF NOT EXISTS idx_users_employeeId ON users(employeeId)`).catch(() => { });
            // Storefront: Link users to partners (customer profile) and add userType column
            yield conn.query(`ALTER TABLE users ADD COLUMN partnerId VARCHAR(36) DEFAULT NULL`).catch((e) => {
                if (e.code !== 'ER_DUP_FIELDNAME')
                    console.error('Error adding partnerId to users:', e.message);
            });
            try {
                yield conn.query(`CREATE INDEX idx_users_partnerId ON users(partnerId)`);
            }
            catch (e) {
                if (e.code !== 'ER_DUP_KEYNAME')
                    console.error('Error creating index idx_users_partnerId:', e.message);
            }
            yield conn.query(`ALTER TABLE users ADD COLUMN userType VARCHAR(50) DEFAULT 'NORMAL'`).catch((e) => {
                if (e.code !== 'ER_DUP_FIELDNAME')
                    console.error('Error adding userType to users:', e.message);
            });
            // Taxes Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS taxes (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        rate DECIMAL(5, 2) DEFAULT 0,
        type VARCHAR(50)
      )
    `);
            // Cost Centers Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS cost_centers (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(50),
        name VARCHAR(255) NOT NULL,
        description TEXT
      )
    `);
            // Cash Categories Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS cash_categories (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50),
        accountId VARCHAR(36)
      )
    `);
            // Add accountId column to cash_categories if it doesn't exist
            yield conn.query(`
      ALTER TABLE cash_categories 
      ADD COLUMN IF NOT EXISTS accountId VARCHAR(36)
    `).catch(() => {
                // Ignore error
            });
            // Add parentId column to cash_categories for subcategories support
            yield conn.query(`
      ALTER TABLE cash_categories 
      ADD COLUMN IF NOT EXISTS parentId VARCHAR(36)
    `).catch(() => {
                // Ignore error
            });
            // ========================================
            // TEAM CHAT (دردشة الفريق - persistent)
            // ========================================
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(100) PRIMARY KEY,
        userId VARCHAR(100) NOT NULL,
        userName VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'message',
        targetUserId VARCHAR(100) DEFAULT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_chat_timestamp (timestamp),
        INDEX idx_chat_type (type),
        INDEX idx_chat_private (userId, targetUserId)
      )
    `);
            // ========================================
            // CHAT GROUPS & MEMBERSHIPS (v75)
            // ========================================
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS chat_groups (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        type ENUM('GLOBAL', 'BRANCH', 'CUSTOM') DEFAULT 'CUSTOM',
        branchId VARCHAR(36) DEFAULT NULL,
        createdBy VARCHAR(100) DEFAULT 'System',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_group_branch (branchId)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS chat_group_members (
        groupId VARCHAR(100) NOT NULL,
        userId VARCHAR(100) NOT NULL,
        joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (groupId, userId),
        INDEX idx_member_user (userId),
        FOREIGN KEY (groupId) REFERENCES chat_groups(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
            yield conn.query(`
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS groupId VARCHAR(100) DEFAULT NULL
    `).catch(() => { });
            yield conn.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_msg_group ON chat_messages(groupId)
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS readReceipts JSON DEFAULT NULL
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS editedAt DATETIME DEFAULT NULL
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS isPinned BOOLEAN DEFAULT FALSE
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS pinnedAt DATETIME DEFAULT NULL
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS pinnedBy VARCHAR(100) DEFAULT NULL
    `).catch(() => { });
            // Stock Taking Sessions Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS stock_taking_sessions (
        id VARCHAR(36) PRIMARY KEY,
        date DATETIME NOT NULL,
        warehouseId VARCHAR(36),
        status VARCHAR(50)
      )
    `);
            // Stock Taking Items Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS stock_taking_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sessionId VARCHAR(36) NOT NULL,
        productId VARCHAR(36),
        name VARCHAR(255) DEFAULT '',
        sku VARCHAR(100) DEFAULT '',
        systemStock INT DEFAULT 0,
        actualStock INT DEFAULT 0,
        cost DECIMAL(15, 2) DEFAULT 0,
        touched BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (sessionId) REFERENCES stock_taking_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL
      )
    `);
            // ========================================
            // BRANCHES & WAREHOUSES (Must be created before product_stocks)
            // ========================================
            // Branches Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location TEXT,
        manager VARCHAR(100),
        phone VARCHAR(50)
      )
    `);
            // Branch isolation: default warehouse and treasury per branch
            yield conn.query(`ALTER TABLE branches ADD COLUMN IF NOT EXISTS defaultWarehouseId VARCHAR(36)`).catch(() => { });
            yield conn.query(`ALTER TABLE branches ADD COLUMN IF NOT EXISTS defaultBankId VARCHAR(36) COMMENT 'الحساب البنكي الافتراضي للفرع'`).catch(() => { });
            yield conn.query(`ALTER TABLE branches ADD COLUMN IF NOT EXISTS defaultSafeId VARCHAR(36) COMMENT 'الخزينة الافتراضية للفرع'`).catch(() => { });
            // Warehouses Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        branchId VARCHAR(36),
        keeper VARCHAR(100),
        phone VARCHAR(50),
        FOREIGN KEY (branchId) REFERENCES branches(id) ON DELETE SET NULL
      )
    `);
            // Product Stocks Table (depends on warehouses)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS product_stocks (
        id VARCHAR(36) PRIMARY KEY,
        productId VARCHAR(36) NOT NULL,
        warehouseId VARCHAR(36) NOT NULL,
        stock DECIMAL(18, 8) DEFAULT 0,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE CASCADE,
        UNIQUE KEY unique_stock (productId, warehouseId)
      )
    `);
            // ========================================
            // MULTI-UNIT SELLING (البيع بوحدات متعددة)
            // ========================================
            // Product Units Table (وحدات قياس المنتج)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS product_units (
        id VARCHAR(36) PRIMARY KEY,
        productId VARCHAR(36) NOT NULL,
        unitName VARCHAR(50) NOT NULL COMMENT 'اسم الوحدة (كرتونة، عبوة، قطعة)',
        unitNameEn VARCHAR(50) COMMENT 'English unit name',
        conversionFactor DECIMAL(15,4) NOT NULL DEFAULT 1 COMMENT 'عامل التحويل للوحدة الأساسية',
        isBaseUnit BOOLEAN DEFAULT FALSE COMMENT 'هل هي الوحدة الأساسية للمخزون؟',
        barcode VARCHAR(50) COMMENT 'باركود خاص بهذه الوحدة',
        purchasePrice DECIMAL(15,2) COMMENT 'سعر الشراء لهذه الوحدة',
        salePrice DECIMAL(15,2) COMMENT 'سعر البيع لهذه الوحدة',
        wholesalePrice DECIMAL(15,2) COMMENT 'سعر الجملة',
        minSaleQty DECIMAL(15,3) DEFAULT 1 COMMENT 'أقل كمية للبيع',
        isActive BOOLEAN DEFAULT TRUE,
        sortOrder INT DEFAULT 0 COMMENT 'ترتيب العرض',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_product (productId),
        INDEX idx_barcode (barcode),
        INDEX idx_base_unit (productId, isBaseUnit),
        UNIQUE KEY unique_product_unit (productId, unitName)
      )
    `);
            // Migration: Add multi-unit columns to invoice_lines
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN IF NOT EXISTS unitId VARCHAR(36) COMMENT 'وحدة البيع المستخدمة'
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN IF NOT EXISTS unitName VARCHAR(100) COMMENT 'اسم الوحدة'
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN IF NOT EXISTS conversionFactor DECIMAL(15,4) DEFAULT 1 COMMENT 'عامل التحويل'
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN IF NOT EXISTS baseQuantity DECIMAL(15,4) COMMENT 'الكمية بالوحدة الأساسية'
    `).catch(() => { });
            // Migration: Add warehouseId to invoice_lines for per-item warehouse selection
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN IF NOT EXISTS warehouseId VARCHAR(36) DEFAULT NULL COMMENT 'مخزن خاص بالصنف'
    `).catch(() => { });
            // Migration: Add serials to invoice_lines for serial number tracking
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN IF NOT EXISTS serials JSON DEFAULT NULL COMMENT 'أرقام تسلسلية للصنف'
    `).catch(() => { });
            // Migration: Add bonusQty to invoice_lines for supplier free goods tracking
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN IF NOT EXISTS bonusQty DECIMAL(15, 2) DEFAULT 0
    `).catch(() => { });
            // Migration: Add grade to invoice_lines for product grade classification (الفرز)
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN IF NOT EXISTS grade VARCHAR(20) DEFAULT NULL COMMENT 'الفرز: أول / ثاني / ثالث'
    `).catch(() => { });
            // Migration: Add discountType and discountValue to invoice_lines for percentage discounts
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN IF NOT EXISTS discountType VARCHAR(10) DEFAULT 'FIXED'
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN IF NOT EXISTS discountValue DECIMAL(15, 2) DEFAULT 0
    `).catch(() => { });
            // Migration: Add priceListId to invoice_lines for per-item pricing
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN IF NOT EXISTS priceListId VARCHAR(36) NULL
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE deleted_invoice_lines 
      ADD COLUMN IF NOT EXISTS priceListId VARCHAR(36) NULL
    `).catch(() => { });
            // Migration: Add notes to invoice_lines for per-line item notes
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL COMMENT 'ملاحظات السطر'
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE deleted_invoice_lines 
      ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL COMMENT 'ملاحظات السطر'
    `).catch(() => { });
            // Migration: Add variantId to invoice_lines for embedded variant stock tracking (تتبع مخزون التشكيلات)
            yield conn.query(`
      ALTER TABLE invoice_lines 
      ADD COLUMN variantId VARCHAR(36) DEFAULT NULL COMMENT 'معرف التشكيلة'
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE deleted_invoice_lines 
      ADD COLUMN variantId VARCHAR(36) DEFAULT NULL COMMENT 'معرف التشكيلة'
    `).catch(() => { });
            // Migration: Add all missing invoice_lines columns queried by invoiceController
            for (const tbl of ['invoice_lines', 'deleted_invoice_lines']) {
                yield conn.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS returnCondition VARCHAR(50) DEFAULT NULL`).catch(() => { });
                yield conn.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS returnQuantity DECIMAL(15,4) DEFAULT 0`).catch(() => { });
                yield conn.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS serialNumbers TEXT DEFAULT NULL`).catch(() => { });
                yield conn.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS warehouseId VARCHAR(36) DEFAULT NULL`).catch(() => { });
                yield conn.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS unitId VARCHAR(36) DEFAULT NULL`).catch(() => { });
                yield conn.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS unitName VARCHAR(100) DEFAULT NULL`).catch(() => { });
            }
            // Migration: Add multi-unit columns to products table
            yield conn.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS baseUnit VARCHAR(50) DEFAULT 'piece' COMMENT 'الوحدة الأساسية للمخزون'
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS hasMultipleUnits BOOLEAN DEFAULT FALSE COMMENT 'هل للمنتج وحدات متعددة؟'
    `).catch(() => { });
            // Partner Groups Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS partner_groups (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50),
        description TEXT,
        color VARCHAR(20)
      )
    `);
            // Migration: Add color column to partner_groups for existing databases
            yield conn.query(`
      ALTER TABLE partner_groups 
      ADD COLUMN IF NOT EXISTS color VARCHAR(20)
    `).catch(() => { });
            // (Branches and Warehouses tables already created above)
            // Categories Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        parentId VARCHAR(36),
        icon VARCHAR(255),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
            // Migrations for existing databases
            yield conn.query(`
      ALTER TABLE categories 
      ADD COLUMN IF NOT EXISTS parentId VARCHAR(36)
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE categories 
      ADD COLUMN IF NOT EXISTS icon VARCHAR(255)
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE categories 
      ADD COLUMN IF NOT EXISTS image MEDIUMTEXT
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE categories 
      ADD COLUMN IF NOT EXISTS color VARCHAR(20)
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE categories 
      ADD COLUMN IF NOT EXISTS createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE categories 
      ADD COLUMN IF NOT EXISTS updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    `).catch(() => { });
            // Manufacturers Table (اسم الشركه المنتجه)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS manufacturers (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
            // Sizes Table (المقاسات)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS sizes (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
            // Colors Table (الألوان)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS colors (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
            // Specifications Table (التوصيف)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS specifications (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
            // Item Descriptions Table (الوصف)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS item_descriptions (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
            // Product Groups Table (المجموعات)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS product_groups (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
            // Salesmen Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS salesmen (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        target DECIMAL(15, 2),
        achieved DECIMAL(15, 2),
        commissionRate DECIMAL(5, 2),
        region VARCHAR(100)
      )
    `);
            // Add type column to salesmen table if it doesn't exist
            yield conn.query(`
      ALTER TABLE salesmen 
      ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'SALES'
    `).catch(() => {
                // Ignore error if column already exists
            });
            // Add userId column to salesmen table for data isolation
            yield conn.query(`
      ALTER TABLE salesmen 
      ADD COLUMN IF NOT EXISTS userId VARCHAR(36)
    `).catch(() => {
                // Ignore error if column already exists
            });
            // Add teamId column to salesmen table to link salesmen to a specific team
            yield conn.query(`
      ALTER TABLE salesmen 
      ADD COLUMN IF NOT EXISTS teamId VARCHAR(36)
    `).catch(() => {
                // Ignore error if column already exists
            });
            // Add targetType column to salesmen table (AMOUNT or PRODUCTS)
            yield conn.query(`
      ALTER TABLE salesmen 
      ADD COLUMN IF NOT EXISTS targetType VARCHAR(20) DEFAULT 'AMOUNT'
    `).catch(() => {
                // Ignore error if column already exists
            });
            // Add unique index on userId to ensure one-to-one relationship
            yield conn.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_salesmen_userId ON salesmen(userId)
    `).catch(() => {
                // Ignore error if index already exists
            });
            // Salesman Targets Table (أهداف المندوبين - حسب الصنف/الفئة)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS salesman_targets (
        id VARCHAR(36) PRIMARY KEY,
        salesmanId VARCHAR(36) NOT NULL,
        targetType ENUM('PRODUCT', 'CATEGORY') NOT NULL DEFAULT 'PRODUCT',
        productId VARCHAR(36) NULL,
        categoryId VARCHAR(36) NULL,
        targetQuantity DECIMAL(15,3) NOT NULL DEFAULT 0,
        targetAmount DECIMAL(15,2) NULL,
        achievedQuantity DECIMAL(15,3) DEFAULT 0,
        achievedAmount DECIMAL(15,2) DEFAULT 0,
        periodType ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY') NOT NULL DEFAULT 'MONTHLY',
        periodStart DATE NOT NULL,
        periodEnd DATE NOT NULL,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (salesmanId) REFERENCES salesmen(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL,
        FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL,
        INDEX idx_salesman (salesmanId),
        INDEX idx_product (productId),
        INDEX idx_category (categoryId),
        INDEX idx_period (periodStart, periodEnd),
        INDEX idx_active (isActive)
      )
    `);
            // Commission Tiers Table (نسب العمولة المتدرجة)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS commission_tiers (
        id VARCHAR(36) PRIMARY KEY,
        salesmanId VARCHAR(36) NULL,
        tierName VARCHAR(100) NOT NULL,
        minAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
        maxAmount DECIMAL(15,2) NULL,
        commissionRate DECIMAL(5,2) NOT NULL DEFAULT 0,
        isGlobal BOOLEAN DEFAULT FALSE,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (salesmanId) REFERENCES salesmen(id) ON DELETE CASCADE,
        INDEX idx_salesman (salesmanId),
        INDEX idx_active (isActive)
      )
    `);
            // Commission Records Table (سجلات العمولات)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS commission_records (
        id VARCHAR(36) PRIMARY KEY,
        salesmanId VARCHAR(36) NOT NULL,
        periodStart DATE NOT NULL,
        periodEnd DATE NOT NULL,
        totalSales DECIMAL(15,2) NOT NULL DEFAULT 0,
        totalReturns DECIMAL(15,2) NOT NULL DEFAULT 0,
        netSales DECIMAL(15,2) NOT NULL DEFAULT 0,
        commissionRate DECIMAL(5,2) NOT NULL DEFAULT 0,
        commissionAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
        bonusAmount DECIMAL(15,2) DEFAULT 0,
        deductions DECIMAL(15,2) DEFAULT 0,
        finalAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
        status ENUM('PENDING', 'APPROVED', 'PAID', 'REJECTED') DEFAULT 'PENDING',
        approvedBy VARCHAR(36) NULL,
        approvedAt TIMESTAMP NULL,
        paidAt TIMESTAMP NULL,
        notes TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (salesmanId) REFERENCES salesmen(id) ON DELETE CASCADE,
        FOREIGN KEY (approvedBy) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_salesman (salesmanId),
        INDEX idx_period (periodStart, periodEnd),
        INDEX idx_status (status)
      )
    `);
            // Salesman Customer Assignments (تخصيص العملاء للمندوبين)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS salesman_customers (
        id VARCHAR(36) PRIMARY KEY,
        salesmanId VARCHAR(36) NOT NULL,
        partnerId VARCHAR(36) NOT NULL,
        assignedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY (salesmanId) REFERENCES salesmen(id) ON DELETE CASCADE,
        FOREIGN KEY (partnerId) REFERENCES partners(id) ON DELETE CASCADE,
        UNIQUE KEY unique_assignment (salesmanId, partnerId),
        INDEX idx_salesman (salesmanId),
        INDEX idx_partner (partnerId)
      )
    `);
            // Price Lists Table (Global/Master Data)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS price_lists (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
            // Product Prices Table (Junction: Product ↔ Price List)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS product_prices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        productId VARCHAR(36) NOT NULL,
        priceListId VARCHAR(36) NOT NULL,
        price DECIMAL(15, 2) DEFAULT 0,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (priceListId) REFERENCES price_lists(id) ON DELETE CASCADE,
        UNIQUE KEY unique_product_price (productId, priceListId)
      )
    `);
            // Audit Logs Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(36) PRIMARY KEY,
        date DATETIME NOT NULL,
        user VARCHAR(100),
        module VARCHAR(50),
        action VARCHAR(50),
        description TEXT,
        details TEXT
      )
    `);
            // Migration: Add description column if it doesn't exist (MariaDB compatible)
            try {
                yield conn.query(`ALTER TABLE audit_logs ADD COLUMN description TEXT AFTER action`);
                console.log('✅ Added description column to audit_logs table');
            }
            catch (err) {
                // Column already exists or other error - ignore
                if (!err.message.includes('Duplicate column')) {
                    console.log('ℹ️ audit_logs.description column already exists or migration skipped');
                }
            }
            // Migration: Add ip_address column to audit_logs for tracking
            yield conn.query(`
      ALTER TABLE audit_logs 
      ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) DEFAULT NULL COMMENT 'عنوان IP'
    `).catch(() => { });
            // Migration: Add composite index for audit log filtering performance
            try {
                yield conn.query('CREATE INDEX idx_audit_logs_date_user ON audit_logs(date, user)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_audit_logs_module_action ON audit_logs(module, action)');
            }
            catch (e) { /* Ignore if exists */ }
            // ========================================
            // AI INTELLIGENCE ENGINE TABLES (Dax)
            // ========================================
            // AI Chat Messages Table (المساعد الذكي)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS ai_chat_messages (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        role ENUM('user','assistant') NOT NULL DEFAULT 'user',
        message TEXT NOT NULL,
        intent VARCHAR(50) DEFAULT NULL,
        contextSummary VARCHAR(500) DEFAULT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_chat_user (userId, createdAt)
      )
    `);
            // Migration: Add sessionId for conversation threading
            yield conn.query(`
      ALTER TABLE ai_chat_messages
      ADD COLUMN IF NOT EXISTS sessionId VARCHAR(36) DEFAULT NULL
    `).catch(() => { });
            try {
                yield conn.query('CREATE INDEX idx_ai_chat_session ON ai_chat_messages(sessionId, createdAt)');
            }
            catch (e) { /* exists */ }
            // Migration: Add feedback columns for response quality tracking
            yield conn.query(`
      ALTER TABLE ai_chat_messages
      ADD COLUMN IF NOT EXISTS feedback ENUM('positive','negative','corrected') DEFAULT NULL
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE ai_chat_messages
      ADD COLUMN IF NOT EXISTS feedbackNote TEXT DEFAULT NULL
    `).catch(() => { });
            // Migration: Add provider + model tracking per message
            yield conn.query(`
      ALTER TABLE ai_chat_messages
      ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT NULL
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE ai_chat_messages
      ADD COLUMN IF NOT EXISTS model VARCHAR(100) DEFAULT NULL
    `).catch(() => { });
            // AI Chat Sessions — Persistent conversation memory (replaces in-memory Map)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS ai_chat_sessions (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        lastIntent VARCHAR(50) DEFAULT 'general',
        lastPartnerId VARCHAR(36) DEFAULT NULL,
        lastPartnerName VARCHAR(255) DEFAULT NULL,
        lastEntityType VARCHAR(20) DEFAULT NULL,
        lastTopic VARCHAR(50) DEFAULT NULL,
        conversationTone VARCHAR(10) DEFAULT 'ar',
        metadata JSON DEFAULT NULL,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_session_user (userId, updatedAt)
      )
    `);
            // AI Usage Log — Token consumption & latency tracking per request
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId VARCHAR(36) DEFAULT NULL,
        provider VARCHAR(20) NOT NULL,
        model VARCHAR(100) NOT NULL,
        intent VARCHAR(50) DEFAULT NULL,
        inputTokensEst INT DEFAULT 0,
        outputTokensEst INT DEFAULT 0,
        latencyMs INT DEFAULT 0,
        cached BOOLEAN DEFAULT FALSE,
        error BOOLEAN DEFAULT FALSE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_usage_daily (createdAt, provider),
        INDEX idx_ai_usage_user (userId, createdAt)
      )
    `);
            // AI Knowledge Base — Phase 3: RAG searchable knowledge for Dax
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS ai_knowledge_base (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        titleAr VARCHAR(255) DEFAULT NULL,
        content MEDIUMTEXT NOT NULL,
        contentType ENUM('policy', 'procedure', 'faq', 'report', 'manual', 'note') NOT NULL DEFAULT 'note',
        category VARCHAR(100) DEFAULT 'general',
        tags JSON DEFAULT NULL,
        priority TINYINT DEFAULT 0,
        isActive BOOLEAN DEFAULT TRUE,
        createdBy VARCHAR(36) DEFAULT NULL,
        updatedBy VARCHAR(36) DEFAULT NULL,
        metadata JSON DEFAULT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FULLTEXT INDEX ft_kb_content (title, titleAr, content),
        INDEX idx_kb_type (contentType, isActive),
        INDEX idx_kb_category (category, isActive)
      )
    `);
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS payment_allocations (
        id VARCHAR(36) PRIMARY KEY,
        paymentId VARCHAR(36) NOT NULL,
        invoiceId VARCHAR(36) NOT NULL,
        amount DECIMAL(15, 2) DEFAULT 0,
        FOREIGN KEY (paymentId) REFERENCES invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);
            // Permissions Table (Master List)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id VARCHAR(100) PRIMARY KEY,
        label VARCHAR(255) NOT NULL,
        module VARCHAR(100) NOT NULL
      )
    `);
            // ========================================
            // MANUFACTURING MODULE TABLES
            // ========================================
            // Bills of Materials (BOM) Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS bom (
        id VARCHAR(36) PRIMARY KEY,
        finished_product_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        version INT DEFAULT 1,
        is_active BOOLEAN DEFAULT TRUE,
        labor_cost DECIMAL(15,2) DEFAULT 0,
        overhead_cost DECIMAL(15,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (finished_product_id) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_finished_product (finished_product_id),
        INDEX idx_active (is_active),
        INDEX idx_name (name)
      )
    `);
            // BOM Items Table (Junction: BOM ↔ Raw Materials)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS bom_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bom_id VARCHAR(36) NOT NULL,
        raw_product_id VARCHAR(36) NOT NULL,
        quantity_per_unit DECIMAL(18,8) NOT NULL,
        waste_percent DECIMAL(5,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bom_id) REFERENCES bom(id) ON DELETE CASCADE,
        FOREIGN KEY (raw_product_id) REFERENCES products(id) ON DELETE RESTRICT,
        INDEX idx_bom (bom_id),
        INDEX idx_raw_product (raw_product_id),
        UNIQUE KEY unique_bom_product (bom_id, raw_product_id)
      )
    `);
            // Migration: Add supplier_id to bom_items for BOM supplier assignment
            yield conn.query(`
      ALTER TABLE bom_items 
      ADD COLUMN IF NOT EXISTS supplier_id VARCHAR(36) DEFAULT NULL
    `).catch(() => {
                // Ignore error if column already exists
            });
            // Production Orders Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS production_orders (
        id VARCHAR(36) PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        bom_id VARCHAR(36) NOT NULL,
        finished_product_id VARCHAR(36) NOT NULL,
        qty_planned DECIMAL(15,3) NOT NULL,
        qty_finished DECIMAL(15,3) DEFAULT 0,
        qty_scrapped DECIMAL(15,3) DEFAULT 0,
        status ENUM('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'PLANNED',
        start_date DATE,
        end_date DATE,
        actual_start_date TIMESTAMP NULL,
        actual_end_date TIMESTAMP NULL,
        warehouse_id VARCHAR(36),
        source_warehouse_id VARCHAR(36),
        dest_warehouse_id VARCHAR(36),
        notes TEXT,
        created_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (bom_id) REFERENCES bom(id) ON DELETE RESTRICT,
        FOREIGN KEY (finished_product_id) REFERENCES products(id) ON DELETE RESTRICT,
        INDEX idx_status (status),
        INDEX idx_order_number (order_number),
        INDEX idx_dates (start_date, end_date),
        INDEX idx_product (finished_product_id),
        INDEX idx_created_at (created_at)
      )
    `);
            // Migration: Add source_warehouse_id and dest_warehouse_id columns for existing databases
            yield conn.query(`
      ALTER TABLE production_orders 
      ADD COLUMN IF NOT EXISTS source_warehouse_id VARCHAR(36)
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE production_orders 
      ADD COLUMN IF NOT EXISTS dest_warehouse_id VARCHAR(36)
    `).catch(() => { });
            // ========================================
            // PACKAGING ORDERS (التعبئة والتغليف)
            // ========================================
            try {
                yield conn.query(`
        CREATE TABLE IF NOT EXISTS packaging_orders (
          id VARCHAR(36) PRIMARY KEY,
          order_number VARCHAR(50) UNIQUE NOT NULL,
          production_order_id VARCHAR(36),
          product_id VARCHAR(36) NOT NULL,
          product_name VARCHAR(255),
          qty_to_package DECIMAL(15,3) NOT NULL,
          qty_packaged DECIMAL(15,3) DEFAULT 0,
          status ENUM('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'DRAFT',
          warehouse_id VARCHAR(36),
          total_material_cost DECIMAL(15,2) DEFAULT 0,
          total_packaging_cost DECIMAL(15,2) DEFAULT 0,
          total_labor_cost DECIMAL(15,2) DEFAULT 0,
          total_overhead_cost DECIMAL(15,2) DEFAULT 0,
          grand_total_cost DECIMAL(15,2) DEFAULT 0,
          cost_per_unit DECIMAL(15,4) DEFAULT 0,
          notes TEXT,
          created_by VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          completed_at TIMESTAMP NULL,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
          INDEX idx_pkg_status (status),
          INDEX idx_pkg_order_number (order_number),
          INDEX idx_pkg_product (product_id),
          INDEX idx_pkg_production (production_order_id),
          INDEX idx_pkg_created_at (created_at)
        )
      `);
                // Migration: Add flat packaging columns to packaging_orders
                yield conn.query(`
        ALTER TABLE packaging_orders 
        ADD COLUMN IF NOT EXISTS input_product_id VARCHAR(36) DEFAULT NULL
      `).catch(() => { });
                yield conn.query(`
        ALTER TABLE packaging_orders 
        ADD COLUMN IF NOT EXISTS input_qty DECIMAL(15,3) DEFAULT 0
      `).catch(() => { });
                yield conn.query(`
        ALTER TABLE packaging_orders 
        ADD COLUMN IF NOT EXISTS materials_json JSON DEFAULT NULL
      `).catch(() => { });
                // Migration: Add production_order_id to packaging_orders for linking to source production orders
                yield conn.query(`
        ALTER TABLE packaging_orders 
        ADD COLUMN IF NOT EXISTS production_order_id VARCHAR(36) DEFAULT NULL
      `).catch(() => { });
                try {
                    yield conn.query('CREATE INDEX idx_pkg_prod_order ON packaging_orders(production_order_id)');
                }
                catch (e) { /* Ignore if exists */ }
                // Packaging Levels (مستويات التعبئة - Hierarchical packaging steps - LEGACY, kept for migration)
                yield conn.query(`
        CREATE TABLE IF NOT EXISTS packaging_levels (
          id VARCHAR(36) PRIMARY KEY,
          packaging_order_id VARCHAR(36) NOT NULL,
          level_order INT NOT NULL DEFAULT 1,
          level_name VARCHAR(255) NOT NULL,
          packaging_material_id VARCHAR(36),
          packaging_material_name VARCHAR(255),
          qty_per_unit DECIMAL(15,3) DEFAULT 1,
          units_per_package DECIMAL(15,3) DEFAULT 1,
          total_packages DECIMAL(15,3) DEFAULT 0,
          material_cost DECIMAL(15,2) DEFAULT 0,
          labor_cost DECIMAL(15,2) DEFAULT 0,
          level_total_cost DECIMAL(15,2) DEFAULT 0,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (packaging_order_id) REFERENCES packaging_orders(id) ON DELETE CASCADE,
          INDEX idx_pkg_level_order (packaging_order_id, level_order)
        )
      `);
            }
            catch (pkgErr) {
                console.warn('⚠️ Packaging tables skipped (FK mismatch - run FIX_HOSTINGER_FK.sql in phpMyAdmin):', pkgErr.message);
            }
            // Packaging Order Levels (flat input→output per order)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS packaging_order_levels (
        id VARCHAR(36) PRIMARY KEY,
        packaging_order_id VARCHAR(36) NOT NULL,
        level_index INT NOT NULL DEFAULT 1,
        input_product_id VARCHAR(36) NOT NULL,
        output_product_id VARCHAR(36) NOT NULL,
        input_qty DECIMAL(15,3) NOT NULL DEFAULT 0,
        output_qty DECIMAL(15,3) NOT NULL DEFAULT 0,
        material_cost DECIMAL(15,2) DEFAULT 0,
        packaging_cost DECIMAL(15,2) DEFAULT 0,
        total_cost DECIMAL(15,2) DEFAULT 0,
        unit_cost DECIMAL(15,4) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (packaging_order_id) REFERENCES packaging_orders(id) ON DELETE CASCADE,
        INDEX idx_pkg_level_order_id (packaging_order_id)
      )
    `).catch(() => { });
            // Packaging Order Materials (packaging materials per level)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS packaging_order_materials (
        id VARCHAR(36) PRIMARY KEY,
        level_id VARCHAR(36) NOT NULL,
        product_id VARCHAR(36) NOT NULL,
        quantity DECIMAL(15,3) NOT NULL DEFAULT 0,
        unit_cost DECIMAL(15,2) DEFAULT 0,
        total_cost DECIMAL(15,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (level_id) REFERENCES packaging_order_levels(id) ON DELETE CASCADE,
        INDEX idx_pkg_mat_level (level_id)
      )
    `).catch(() => { });
            // Migration: Add indexes to partners table for performance
            try {
                yield conn.query('CREATE INDEX idx_type ON partners(type)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_isCustomer ON partners(isCustomer)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_isSupplier ON partners(isSupplier)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_balance ON partners(balance)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_name ON partners(name)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_phone ON partners(phone)');
            }
            catch (e) { /* Ignore if exists */ }
            // ========================================
            // COMPREHENSIVE PERFORMANCE INDEXES
            // Added: 2025-11-30 for improved query performance
            // ========================================
            // Invoices table indexes - Critical for partner statements and reports
            try {
                yield conn.query('CREATE INDEX idx_invoices_date ON invoices(date)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_invoices_type ON invoices(type)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_invoices_partnerId ON invoices(partnerId)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_invoices_status ON invoices(status)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_invoices_posted ON invoices(posted)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_invoices_warehouseId ON invoices(warehouseId)');
            }
            catch (e) { /* Ignore if exists */ }
            // Journal entries and lines indexes
            try {
                yield conn.query('CREATE INDEX idx_journal_entries_date ON journal_entries(date)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_journal_entries_referenceId ON journal_entries(referenceId)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_journal_lines_accountId ON journal_lines(accountId)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_journal_lines_journalId ON journal_lines(journalId)');
            }
            catch (e) { /* Ignore if exists */ }
            // Accounts table indexes
            try {
                yield conn.query('CREATE INDEX idx_accounts_type ON accounts(type)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_accounts_code ON accounts(code)');
            }
            catch (e) { /* Ignore if exists */ }
            // Cheques table indexes - Important for cheque management
            try {
                yield conn.query('CREATE INDEX idx_cheques_status ON cheques(status)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_cheques_type ON cheques(type)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_cheques_dueDate ON cheques(dueDate)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_cheques_partnerId ON cheques(partnerId)');
            }
            catch (e) { /* Ignore if exists */ }
            // Payment allocations indexes
            try {
                yield conn.query('CREATE INDEX idx_payment_allocations_paymentId ON payment_allocations(paymentId)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_payment_allocations_invoiceId ON payment_allocations(invoiceId)');
            }
            catch (e) { /* Ignore if exists */ }
            // Invoice lines indexes
            try {
                yield conn.query('CREATE INDEX idx_invoice_lines_productId ON invoice_lines(productId)');
            }
            catch (e) { /* Ignore if exists */ }
            // Audit logs indexes
            try {
                yield conn.query('CREATE INDEX idx_audit_logs_date ON audit_logs(date)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_audit_logs_user ON audit_logs(user)');
            }
            catch (e) { /* Ignore if exists */ }
            try {
                yield conn.query('CREATE INDEX idx_audit_logs_module ON audit_logs(module)');
            }
            catch (e) { /* Ignore if exists */ }
            // Migration: Add createdBy column to journal_entries
            yield conn.query(`
      ALTER TABLE journal_entries 
      ADD COLUMN IF NOT EXISTS createdBy VARCHAR(100)
    `).catch(() => {
                // Ignore error if column already exists
            });
            // Add index for createdBy
            try {
                yield conn.query('CREATE INDEX idx_journal_entries_createdBy ON journal_entries(createdBy)');
            }
            catch (e) { /* Ignore if exists */ }
            // Migration: Add salesmanId column to journal_entries for transaction tracking
            yield conn.query(`
      ALTER TABLE journal_entries 
      ADD COLUMN IF NOT EXISTS salesmanId VARCHAR(36)
    `).catch(() => {
                // Ignore error if column already exists
            });
            // Add index for salesmanId in journal_entries
            try {
                yield conn.query('CREATE INDEX idx_journal_entries_salesmanId ON journal_entries(salesmanId)');
            }
            catch (e) { /* Ignore if exists */ }
            // Migration: Add currencyCode and exchangeRate to journal_entries for multi-currency support
            yield conn.query(`
      ALTER TABLE journal_entries 
      ADD COLUMN IF NOT EXISTS currencyCode VARCHAR(10) DEFAULT 'EGP'
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE journal_entries 
      ADD COLUMN IF NOT EXISTS exchangeRate DECIMAL(18, 6) DEFAULT 1
    `).catch(() => { });
            // Migration: Add denominations column to journal_entries for cash denomination report
            yield conn.query(`
      ALTER TABLE journal_entries 
      ADD COLUMN IF NOT EXISTS denominations JSON
    `).catch(() => { });
            // Migration: Add transactionId column to cheques for linking cheques to invoices/receipts
            yield conn.query(`
      ALTER TABLE cheques 
      ADD COLUMN IF NOT EXISTS transactionId VARCHAR(36)
    `).catch(() => { });
            // Migration: Add createdBy to other tables
            const tablesToAddCreatedBy = ['invoices', 'cheques', 'stock_permits'];
            for (const table of tablesToAddCreatedBy) {
                yield conn.query(`
        ALTER TABLE ${table} 
        ADD COLUMN IF NOT EXISTS createdBy VARCHAR(100)
      `).catch(() => { });
                try {
                    yield conn.query(`CREATE INDEX idx_${table}_createdBy ON ${table}(createdBy)`);
                }
                catch (e) { /* Ignore if exists */ }
            }
            // Fixed assets indexes
            try {
                yield conn.query('CREATE INDEX idx_fixed_assets_status ON fixed_assets(status)');
            }
            catch (e) { /* Ignore if exists */ }
            console.log('✅ All performance indexes created successfully');
            // Stock Movements Table (Inventory Movement History)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        movement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        product_id VARCHAR(36) NOT NULL,
        warehouse_id VARCHAR(36),
        qty_change DECIMAL(15,3) NOT NULL,
        movement_type ENUM(
          'PURCHASE', 'SALE', 'RETURN_IN', 'RETURN_OUT',
          'PRODUCTION_USE', 'PRODUCTION_OUTPUT',
          'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT',
          'OPENING_BALANCE', 'SCRAP'
        ) NOT NULL,
        reference_type VARCHAR(50),
        reference_id VARCHAR(36),
        unit_cost DECIMAL(15,2),
        notes TEXT,
        created_by VARCHAR(50),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
        INDEX idx_product (product_id),
        INDEX idx_date (movement_date),
        INDEX idx_type (movement_type),
        INDEX idx_warehouse (warehouse_id),
        INDEX idx_product_warehouse (product_id, warehouse_id),
        INDEX idx_reference (reference_type, reference_id)
      )
    `);
            // Migration: Ensure stock_movements.id has AUTO_INCREMENT (fixes "Field 'id' doesn't have a default value" error)
            yield conn.query(`
      ALTER TABLE stock_movements MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT
    `).catch(() => {
                // Ignore error - column is already correct
            });
            // ========================================
            // MANUFACTURING MODULE MIGRATIONS
            // Added: 2025-12-09 for production batch tracking
            // ========================================
            // Migration: Add batch_id to stock_movements for batch tracking
            yield conn.query(`
      ALTER TABLE stock_movements 
      ADD COLUMN IF NOT EXISTS batch_id VARCHAR(50)
    `).catch(() => { });
            // Migration: Add variant_id to stock_movements for variant-level audit trail
            yield conn.query(`
      ALTER TABLE stock_movements
      ADD COLUMN variant_id VARCHAR(36) DEFAULT NULL COMMENT 'معرف التشكيلة'
    `).catch(() => { });
            // Migration: Add finished_batch_id to production_orders
            yield conn.query(`
      ALTER TABLE production_orders 
      ADD COLUMN IF NOT EXISTS finished_batch_id VARCHAR(50)
    `).catch(() => { });
            // Migration: Update production_orders status ENUM to include all statuses
            // Note: This might fail if ENUM already includes these values, which is fine
            try {
                yield conn.query(`
        ALTER TABLE production_orders 
        MODIFY COLUMN status ENUM('PLANNED', 'CONFIRMED', 'WAITING_MATERIALS', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'PLANNED'
      `);
                console.log('✅ Updated production_orders status enum');
            }
            catch (e) {
                // Ignore if already updated
            }
            // Create inventory_batches table if not exists
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS inventory_batches (
        id VARCHAR(50) PRIMARY KEY,
        batch_number VARCHAR(100) UNIQUE NOT NULL,
        product_id VARCHAR(50) NOT NULL,
        warehouse_id VARCHAR(50),
        quantity DECIMAL(15,3) NOT NULL DEFAULT 0,
        available_quantity DECIMAL(15,3) NOT NULL DEFAULT 0,
        unit_cost DECIMAL(15,2),
        manufacture_date DATE,
        expiry_date DATE,
        supplier_batch VARCHAR(100),
        supplier_id VARCHAR(50),
        production_order_id VARCHAR(50),
        status ENUM('ACTIVE', 'QUARANTINE', 'EXPIRED', 'CONSUMED') DEFAULT 'ACTIVE',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_batch_number (batch_number),
        INDEX idx_product (product_id),
        INDEX idx_status (status)
      )
    `);
            // Create batch_genealogy table if not exists
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS batch_genealogy (
        id VARCHAR(50) PRIMARY KEY,
        child_batch_id VARCHAR(50) NOT NULL,
        parent_batch_id VARCHAR(50) NOT NULL,
        production_order_id VARCHAR(50) NOT NULL,
        quantity_consumed DECIMAL(15,3) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_child (child_batch_id),
        INDEX idx_parent (parent_batch_id),
        INDEX idx_production_order (production_order_id)
      )
    `);
            // Material Reservations Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS material_reservations (
        id VARCHAR(36) PRIMARY KEY,
        productionOrderId VARCHAR(36) NOT NULL,
        productId VARCHAR(36) NOT NULL,
        warehouseId VARCHAR(36),
        quantityReserved DECIMAL(15,4) NOT NULL,
        quantityConsumed DECIMAL(15,4) DEFAULT 0,
        status ENUM('RESERVED', 'PARTIALLY_CONSUMED', 'FULLY_CONSUMED', 'RELEASED') DEFAULT 'RESERVED',
        reservedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        releasedAt TIMESTAMP NULL,
        INDEX idx_order (productionOrderId),
        INDEX idx_product (productId),
        INDEX idx_status (status)
      )
    `);
            // Production Scrap Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS production_scrap (
        id VARCHAR(36) PRIMARY KEY,
        production_order_id VARCHAR(36) NOT NULL,
        product_id VARCHAR(36) NOT NULL,
        warehouse_id VARCHAR(36),
        quantity DECIMAL(15,4) NOT NULL,
        unit VARCHAR(20),
        scrap_type ENUM('CUTTING_WASTE', 'DEFECTIVE_MATERIAL', 'PROCESS_LOSS', 'DAMAGED_GOODS', 'EXPIRED_MATERIALS', 'OTHER') DEFAULT 'CUTTING_WASTE',
        reason TEXT,
        unit_cost DECIMAL(15,4),
        total_value DECIMAL(15,2),
        disposal_status ENUM('PENDING', 'DISPOSED', 'SOLD', 'RECYCLED') DEFAULT 'PENDING',
        disposal_date TIMESTAMP NULL,
        disposal_notes TEXT,
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_order (production_order_id),
        INDEX idx_product (product_id),
        INDEX idx_type (scrap_type),
        INDEX idx_status (disposal_status)
      )
    `);
            // Work Centers Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS work_centers (
        id VARCHAR(50) PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(50),
        capacity_per_hour DECIMAL(10,2) DEFAULT 0,
        cost_per_hour DECIMAL(10,2) DEFAULT 0,
        warehouse_id VARCHAR(50),
        status ENUM('ACTIVE', 'MAINTENANCE', 'INACTIVE') DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_code (code),
        INDEX idx_status (status)
      )
    `);
            // Routings Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS routings (
        id VARCHAR(50) PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        product_id VARCHAR(50) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_code (code),
        INDEX idx_product (product_id),
        INDEX idx_active (is_active)
      )
    `);
            // Routing Steps Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS routing_steps (
        id VARCHAR(50) PRIMARY KEY,
        routing_id VARCHAR(50) NOT NULL,
        sequence_number INT NOT NULL,
        work_center_id VARCHAR(50) NOT NULL,
        operation_name VARCHAR(255) NOT NULL,
        description TEXT,
        setup_time_minutes DECIMAL(10,2) DEFAULT 0,
        run_time_minutes DECIMAL(10,2) DEFAULT 0,
        labor_cost_per_hour DECIMAL(10,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_routing (routing_id),
        INDEX idx_work_center (work_center_id)
      )
    `);
            // Quality Check Templates Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS quality_check_templates (
        id VARCHAR(50) PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        product_id VARCHAR(50),
        description TEXT,
        check_type ENUM('INCOMING', 'IN_PROCESS', 'FINAL', 'PERIODIC') DEFAULT 'FINAL',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_product (product_id),
        INDEX idx_type (check_type),
        INDEX idx_active (is_active)
      )
    `);
            // Quality Criteria Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS quality_criteria (
        id VARCHAR(50) PRIMARY KEY,
        template_id VARCHAR(50) NOT NULL,
        sequence_number INT NOT NULL,
        criterion_name VARCHAR(255) NOT NULL,
        description TEXT,
        measurement_type ENUM('PASS_FAIL', 'NUMERIC', 'TEXT') DEFAULT 'PASS_FAIL',
        min_value DECIMAL(15,3),
        max_value DECIMAL(15,3),
        target_value DECIMAL(15,3),
        unit VARCHAR(50),
        is_critical BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_template (template_id),
        INDEX idx_critical (is_critical)
      )
    `);
            // Migration: Add variance analysis columns to production_orders
            yield conn.query(`
      ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS standard_cost DECIMAL(15,2) DEFAULT 0
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS actual_material_cost DECIMAL(15,2) DEFAULT 0
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS actual_scrap_cost DECIMAL(15,2) DEFAULT 0
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS material_variance DECIMAL(15,2) DEFAULT 0
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS yield_variance DECIMAL(15,2) DEFAULT 0
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS total_variance DECIMAL(15,2) DEFAULT 0
    `).catch(() => { });
            // Migration: Add priority and scheduling columns to production_orders
            yield conn.query(`
      ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS priority ENUM('HIGH', 'MEDIUM', 'LOW') DEFAULT 'MEDIUM'
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS scheduled_start_date DATE
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS scheduled_end_date DATE
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS updated_by VARCHAR(50)
    `).catch(() => { });
            // Migration: Add source and destination warehouse columns to production_orders
            // source_warehouse_id: where raw materials come from
            // dest_warehouse_id: where finished products go
            yield conn.query(`
      ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS source_warehouse_id VARCHAR(36)
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS dest_warehouse_id VARCHAR(36)
    `).catch(() => { });
            console.log('✅ Manufacturing module tables and migrations complete');
            // ========================================
            // HR & PAYROLL MODULE TABLES
            // ========================================
            // Employees Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id VARCHAR(36) PRIMARY KEY,
        fullName VARCHAR(255) NOT NULL,
        nationalId VARCHAR(50) UNIQUE,
        jobTitle VARCHAR(100),
        department VARCHAR(100),
        employmentType ENUM('MONTHLY', 'DAILY') DEFAULT 'MONTHLY',
        baseSalary DECIMAL(15, 2) DEFAULT 0,
        branchId VARCHAR(36),
        treasuryAccountId VARCHAR(36) COMMENT 'Account ID for payout (Treasury)',
        status ENUM('ACTIVE', 'INACTIVE', 'TERMINATED') DEFAULT 'ACTIVE',
        hireDate DATE,
        address TEXT,
        phone VARCHAR(50),
        email VARCHAR(255),
        avatar VARCHAR(255) DEFAULT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_branch (branchId),
        INDEX idx_status (status)
      )
    `);
            // Payroll Cycles Table (The master record for a month's payroll)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS payroll_cycles (
        id VARCHAR(36) PRIMARY KEY,
        month INT NOT NULL,
        year INT NOT NULL,
        status ENUM('DRAFT', 'REVIEW', 'APPROVED', 'PAID') DEFAULT 'DRAFT',
        totalAmount DECIMAL(15, 2) DEFAULT 0,
        generatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        approvedBy VARCHAR(36),
        approvedAt DATETIME,
        notes TEXT,
        UNIQUE KEY unique_period (month, year)
      )
    `);
            // Payroll Entries Table (Individual employee payroll details)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS payroll_entries (
        id VARCHAR(36) PRIMARY KEY,
        payrollId VARCHAR(36) NOT NULL,
        employeeId VARCHAR(36) NOT NULL,
        baseSalary DECIMAL(15, 2) DEFAULT 0,
        dailyRate DECIMAL(15, 2) DEFAULT 0 COMMENT 'قيمة وحدة اليوم',
        overtimeRate DECIMAL(15, 2) DEFAULT 0 COMMENT 'قيمة وحدة الأوفرتايم',
        overtimeHours DECIMAL(6, 2) DEFAULT 0 COMMENT 'عدد ساعات الأوفرتايم',
        overtimeAmount DECIMAL(15, 2) DEFAULT 0 COMMENT 'قيمة الأوفرتايم',
        incentives DECIMAL(15, 2) DEFAULT 0 COMMENT 'الحوافز',
        bonus DECIMAL(15, 2) DEFAULT 0 COMMENT 'مكافأة',
        allowances JSON COMMENT 'List of allowances {name, amount}',
        grossSalary DECIMAL(15, 2) DEFAULT 0 COMMENT 'إجمالي الراتب',
        purchases DECIMAL(15, 2) DEFAULT 0 COMMENT 'المشتريات',
        advances DECIMAL(15, 2) DEFAULT 0,
        absenceDays DECIMAL(6, 2) DEFAULT 0 COMMENT 'أيام الغياب',
        absenceAmount DECIMAL(15, 2) DEFAULT 0 COMMENT 'قيمة الغيابات',
        hourDeductions DECIMAL(15, 2) DEFAULT 0 COMMENT 'خصومات/ساعات',
        penaltyDays DECIMAL(6, 2) DEFAULT 0 COMMENT 'أيام الجزاءات',
        penalties DECIMAL(15, 2) DEFAULT 0 COMMENT 'الجزاءات',
        deductions JSON COMMENT 'List of deductions {name, amount}',
        totalDeductions DECIMAL(15, 2) DEFAULT 0 COMMENT 'إجمالي الاستقطاعات',
        netSalary DECIMAL(15, 2) DEFAULT 0,
        status ENUM('PENDING', 'PAID') DEFAULT 'PENDING',
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_payroll (payrollId),
        INDEX idx_employee (employeeId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
            // Attendance Records Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id VARCHAR(36) PRIMARY KEY,
        employeeId VARCHAR(36) NOT NULL,
        date DATE NOT NULL,
        checkIn TIME,
        checkOut TIME,
        status ENUM('PRESENT', 'ABSENT', 'LATE', 'LEAVE') DEFAULT 'PRESENT',
        isOvertime BOOLEAN DEFAULT FALSE,
        overtimeHours DECIMAL(4, 2) DEFAULT 0,
        lateMinutes INT DEFAULT 0,
        earlyLeaveMinutes INT DEFAULT 0,
        scheduledCheckIn TIME DEFAULT '09:00:00',
        scheduledCheckOut TIME DEFAULT '17:00:00',
        source ENUM('MANUAL', 'SMART', 'FINGERPRINT') DEFAULT 'MANUAL',
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_daily_attendance (employeeId, date),
        INDEX idx_date (date)
      )
    `);
            // Migration: Add source column to attendance_records
            yield conn.query(`
      ALTER TABLE attendance_records 
      ADD COLUMN IF NOT EXISTS source ENUM('MANUAL', 'SMART', 'FINGERPRINT') DEFAULT 'MANUAL'
    `).catch(() => { });
            // ════════════════════════════════════════════════════════════
            // SMART ATTENDANCE (تسجيل حضور ذكي — بدون بصمة)
            // GPS geofencing + device fingerprint for clients without
            // fingerprint machines. Feeds into attendance_records.
            // ════════════════════════════════════════════════════════════
            // Office geofences — one per branch/location
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS attendance_locations (
        id VARCHAR(36) PRIMARY KEY,
        branchId VARCHAR(36),
        name VARCHAR(255) NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        radiusMeters INT DEFAULT 200,
        isActive BOOLEAN DEFAULT TRUE,
        wifiSsid VARCHAR(255) NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_branch (branchId)
      ) ENGINE=InnoDB;
    `);
            yield conn.query(`
      ALTER TABLE attendance_locations
      ADD COLUMN IF NOT EXISTS wifiSsid VARCHAR(255) NULL
    `).catch(() => { });
            // Raw smart check-in punches (immutable audit trail)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS smart_attendance_punches (
        id VARCHAR(36) PRIMARY KEY,
        employeeId VARCHAR(36) NOT NULL,
        userId VARCHAR(36) NOT NULL,
        punchTime DATETIME NOT NULL,
        punchType ENUM('CHECK_IN', 'CHECK_OUT') DEFAULT 'CHECK_IN',
        gpsLatitude DECIMAL(10, 8),
        gpsLongitude DECIMAL(11, 8),
        gpsAccuracyMeters INT,
        matchedLocationId VARCHAR(36),
        gpsDistanceMeters INT,
        deviceFingerprint VARCHAR(255),
        ipAddress VARCHAR(45),
        userAgent TEXT,
        confidenceScore INT DEFAULT 0,
        verificationStatus ENUM('AUTO_APPROVED', 'PENDING_REVIEW', 'REJECTED', 'MANUALLY_APPROVED', 'MANUALLY_REJECTED') DEFAULT 'PENDING_REVIEW',
        reviewedBy VARCHAR(36),
        reviewedAt DATETIME,
        reviewNotes TEXT,
        wifiSsid VARCHAR(255) NULL,
        isMockGps BOOLEAN DEFAULT FALSE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_employee (employeeId),
        INDEX idx_date (punchTime),
        INDEX idx_status (verificationStatus)
      ) ENGINE=InnoDB;
    `);
            yield conn.query(`
      ALTER TABLE smart_attendance_punches
      ADD COLUMN IF NOT EXISTS wifiSsid VARCHAR(255) NULL
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE smart_attendance_punches
      ADD COLUMN IF NOT EXISTS isMockGps BOOLEAN DEFAULT FALSE
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE attendance_locations
      ADD COLUMN IF NOT EXISTS allowedIp VARCHAR(255) NULL
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE attendance_locations
      MODIFY COLUMN allowedIp VARCHAR(255) NULL
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE smart_attendance_punches
      ADD COLUMN IF NOT EXISTS selfiePath VARCHAR(500) NULL
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE smart_attendance_punches
      ADD COLUMN IF NOT EXISTS deviceId VARCHAR(255) NULL
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS allowAllLocations TINYINT(1) NOT NULL DEFAULT 0
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE smart_attendance_punches
      ADD COLUMN IF NOT EXISTS offlineCreatedTime DATETIME NULL
    `).catch(() => { });
            // Migration: Add source column to attendance_records to track origin
            yield conn.query(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS source ENUM('FINGERPRINT', 'SMART', 'MANUAL') DEFAULT 'MANUAL'`).catch(() => { });
            // Employee Advances / Loans Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS employee_advances (
        id VARCHAR(36) PRIMARY KEY,
        employeeId VARCHAR(36) NOT NULL,
        type ENUM('ADVANCE', 'LOAN') DEFAULT 'ADVANCE',
        amount DECIMAL(15, 2) NOT NULL,
        reason TEXT,
        issueDate DATE NOT NULL,
        monthlyDeduction DECIMAL(15, 2) DEFAULT 0 COMMENT 'Monthly deduction amount',
        totalPaid DECIMAL(15, 2) DEFAULT 0,
        remainingAmount DECIMAL(15, 2) DEFAULT 0,
        status ENUM('ACTIVE', 'COMPLETED', 'CANCELLED') DEFAULT 'ACTIVE',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_employee (employeeId),
        INDEX idx_status (status)
      )
    `);
            // Payroll Templates (Recurring Allowances/Deductions)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS payroll_templates (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type ENUM('ALLOWANCE', 'DEDUCTION') NOT NULL,
        calculationType ENUM('FIXED', 'PERCENTAGE') DEFAULT 'FIXED',
        amount DECIMAL(15, 2) DEFAULT 0,
        percentage DECIMAL(5, 2) DEFAULT 0,
        description TEXT,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
            // Employee-Template Assignments
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS employee_payroll_templates (
        id VARCHAR(36) PRIMARY KEY,
        employeeId VARCHAR(36) NOT NULL,
        templateId VARCHAR(36) NOT NULL,
        customAmount DECIMAL(15, 2) DEFAULT NULL COMMENT 'Override template amount',
        isActive BOOLEAN DEFAULT TRUE,
        UNIQUE KEY unique_employee_template (employeeId, templateId)
      )
    `);
            // ========================================
            // WEEKLY PAYROLL SUPPORT MIGRATIONS
            // ========================================
            yield conn.query(`ALTER TABLE payroll_cycles ADD COLUMN payrollType ENUM('MONTHLY', 'WEEKLY') DEFAULT 'MONTHLY'`)
                .then(() => console.log('✅ Added payrollType column to payroll_cycles'))
                .catch(() => { });
            yield conn.query(`ALTER TABLE payroll_cycles ADD COLUMN weekNumber INT NULL`)
                .then(() => console.log('✅ Added weekNumber column to payroll_cycles'))
                .catch(() => { });
            yield conn.query(`ALTER TABLE payroll_cycles ADD COLUMN startDate DATE NULL`)
                .then(() => console.log('✅ Added startDate column to payroll_cycles'))
                .catch(() => { });
            yield conn.query(`ALTER TABLE payroll_cycles ADD COLUMN endDate DATE NULL`)
                .then(() => console.log('✅ Added endDate column to payroll_cycles'))
                .catch(() => { });
            // Migration: Update unique constraint to allow weekly + monthly in same month
            try {
                yield conn.query(`ALTER TABLE payroll_cycles DROP INDEX unique_period`);
                yield conn.query(`ALTER TABLE payroll_cycles ADD UNIQUE KEY unique_period (month, year, payrollType, weekNumber)`);
                console.log('✅ Updated payroll_cycles unique constraint for weekly support');
            }
            catch (e) {
                // Constraint might already be updated or might not exist
            }
            yield conn.query(`ALTER TABLE employees MODIFY COLUMN employmentType ENUM('MONTHLY', 'DAILY', 'WEEKLY') DEFAULT 'MONTHLY'`)
                .then(() => console.log('✅ Added WEEKLY to employees.employmentType ENUM'))
                .catch(() => { });
            console.log('✅ Weekly payroll migrations complete');
            // ========================================
            // FINGERPRINT DEVICE INTEGRATION TABLES
            // ========================================
            // Employee columns for biometric integration
            yield conn.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS fingerprintId VARCHAR(50) DEFAULT NULL COMMENT 'Device enrollment number'`).catch(() => { });
            yield conn.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS scheduledCheckIn TIME DEFAULT '09:00:00' COMMENT 'Employee scheduled start time'`).catch(() => { });
            yield conn.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS scheduledCheckOut TIME DEFAULT '17:00:00' COMMENT 'Employee scheduled end time'`).catch(() => { });
            yield conn.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS boundDeviceId VARCHAR(255) DEFAULT NULL COMMENT 'Registered device hardware ID'`).catch(() => { });
            // Fingerprint Devices Registry
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS fingerprint_devices (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        ip VARCHAR(45) NOT NULL,
        port INT DEFAULT 4370,
        serialNumber VARCHAR(100),
        model VARCHAR(100),
        isActive TINYINT(1) DEFAULT 1,
        lastSyncAt DATETIME,
        lastSyncStatus VARCHAR(20),
        lastSyncMessage TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_device_ip (ip, port)
      )
    `);
            // Device User ↔ ERP Employee Mapping
            try {
                yield conn.query(`
        CREATE TABLE IF NOT EXISTS fingerprint_mappings (
          id VARCHAR(36) PRIMARY KEY,
          deviceId VARCHAR(36) NOT NULL,
          deviceUserId VARCHAR(50) NOT NULL,
          deviceUserName VARCHAR(100),
          employeeId VARCHAR(36) NOT NULL,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_device_employee (deviceId, deviceUserId),
          UNIQUE KEY uq_device_erp_employee (deviceId, employeeId),
          FOREIGN KEY (deviceId) REFERENCES fingerprint_devices(id) ON DELETE CASCADE,
          FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE
        )
      `);
            }
            catch (_p) {
                // FK mismatch on Hostinger — create without FK constraints
                yield conn.query(`
        CREATE TABLE IF NOT EXISTS fingerprint_mappings (
          id VARCHAR(36) PRIMARY KEY,
          deviceId VARCHAR(36) NOT NULL,
          deviceUserId VARCHAR(50) NOT NULL,
          deviceUserName VARCHAR(100),
          employeeId VARCHAR(36) NOT NULL,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_device_employee (deviceId, deviceUserId),
          UNIQUE KEY uq_device_erp_employee (deviceId, employeeId),
          INDEX idx_device (deviceId),
          INDEX idx_employee (employeeId)
        )
      `).catch(() => { });
                console.warn('⚠️ fingerprint_mappings created without FK constraints (Hostinger FK mismatch)');
            }
            // Sync History / Audit Log
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS fingerprint_sync_log (
        id VARCHAR(36) PRIMARY KEY,
        deviceId VARCHAR(36) NOT NULL,
        syncedAt DATETIME NOT NULL,
        totalLogs INT DEFAULT 0,
        newRecords INT DEFAULT 0,
        updatedRecords INT DEFAULT 0,
        skippedUnmapped INT DEFAULT 0,
        skippedLocked INT DEFAULT 0,
        errors TEXT,
        status VARCHAR(20) DEFAULT 'SUCCESS',
        FOREIGN KEY (deviceId) REFERENCES fingerprint_devices(id) ON DELETE CASCADE
      )
    `);
            // Raw Punch Logs — immutable source of truth for audit trail
            // Attendance records are DERIVED from these, never stored directly from device
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS fingerprint_raw_logs (
        id VARCHAR(36) PRIMARY KEY,
        deviceId VARCHAR(36) NOT NULL,
        syncBatchId VARCHAR(36) NOT NULL COMMENT 'Links to fingerprint_sync_log.id',
        deviceUserId VARCHAR(50) NOT NULL,
        punchTime DATETIME NOT NULL,
        punchState INT DEFAULT 0 COMMENT '0=check-in, 1=check-out (device-dependent)',
        employeeId VARCHAR(36) DEFAULT NULL COMMENT 'Resolved at sync time, NULL if unmapped',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_raw_punch (deviceId, deviceUserId, punchTime),
        INDEX idx_raw_employee_date (employeeId, punchTime),
        INDEX idx_raw_batch (syncBatchId),
        FOREIGN KEY (deviceId) REFERENCES fingerprint_devices(id) ON DELETE CASCADE
      )
    `);
            // Migration: Add skippedLocked column to existing sync_log tables
            yield conn.query(`ALTER TABLE fingerprint_sync_log ADD COLUMN IF NOT EXISTS skippedLocked INT DEFAULT 0`).catch(() => { });
            console.log('✅ Fingerprint device tables initialized');
            // ========================================
            // ALL SYSTEM PERMISSIONS
            // ========================================
            // Sales Permissions (المبيعات)
            yield conn.query(`
      INSERT IGNORE INTO permissions (id, label, module) VALUES 
      ('sales.view', 'عرض فواتير المبيعات', 'المبيعات'),
      ('sales.create', 'إنشاء فاتورة مبيعات', 'المبيعات'),
      ('sales.edit', 'تعديل فواتير المبيعات', 'المبيعات'),
      ('sales.delete', 'حذف فواتير المبيعات', 'المبيعات'),
      ('sales.discount', 'تطبيق خصومات', 'المبيعات'),
      ('sales.return', 'مرتجعات المبيعات', 'المبيعات'),
      ('sales.void', 'إلغاء الفواتير', 'المبيعات'),
      ('sales.reports', 'تقارير المبيعات', 'المبيعات')
    `);
            // Purchase Permissions (المشتريات)
            yield conn.query(`
      INSERT IGNORE INTO permissions (id, label, module) VALUES 
      ('purchase.view', 'عرض فواتير المشتريات', 'المشتريات'),
      ('purchase.create', 'إنشاء فاتورة مشتريات', 'المشتريات'),
      ('purchase.edit', 'تعديل فواتير المشتريات', 'المشتريات'),
      ('purchase.delete', 'حذف فواتير المشتريات', 'المشتريات'),
      ('purchase.return', 'مرتجعات المشتريات', 'المشتريات'),
      ('purchase.reports', 'تقارير المشتريات', 'المشتريات')
    `);
            // Inventory Permissions (المخزون)
            yield conn.query(`
      INSERT IGNORE INTO permissions (id, label, module) VALUES 
      ('inventory.view', 'عرض المخزون', 'المخزون'),
      ('inventory.manage', 'إدارة الأصناف', 'المخزون'),
      ('inventory.adjust', 'تسوية المخزون', 'المخزون'),
      ('inventory.transfer', 'نقل بين المخازن', 'المخزون'),
      ('inventory.categories', 'إدارة التصنيفات', 'المخزون'),
      ('inventory.warehouses', 'إدارة المخازن', 'المخزون'),
      ('inventory.reports', 'تقارير المخزون', 'المخزون'),
      ('inventory.receipt.create', 'إنشاء إذن إضافة مخزني', 'المخزون'),
      ('inventory.receipt.edit', 'تعديل إذن إضافة مخزني', 'المخزون'),
      ('inventory.receipt.delete', 'حذف إذن إضافة مخزني', 'المخزون'),
      ('inventory.release.create', 'إنشاء إذن صرف مخزني', 'المخزون'),
      ('inventory.release.edit', 'تعديل إذن صرف مخزني', 'المخزون'),
      ('inventory.release.delete', 'حذف إذن صرف مخزني', 'المخزون')
    `);
            // Treasury Permissions (الخزينة)
            yield conn.query(`
      INSERT IGNORE INTO permissions (id, label, module) VALUES 
      ('treasury.view', 'عرض الخزينة', 'الخزينة'),
      ('treasury.receipt', 'سند قبض', 'الخزينة'),
      ('treasury.payment', 'سند صرف', 'الخزينة'),
      ('treasury.transfer', 'تحويل بين الخزائن', 'الخزينة'),
      ('treasury.manage', 'إدارة الصناديق', 'الخزينة'),
      ('treasury.cheques', 'إدارة الشيكات', 'الخزينة'),
      ('treasury.reports', 'تقارير الخزينة', 'الخزينة')
    `);
            // Accounting Permissions (الحسابات)
            yield conn.query(`
      INSERT IGNORE INTO permissions (id, label, module) VALUES 
      ('accounting.view', 'عرض الحسابات', 'الحسابات'),
      ('accounting.journal', 'قيود يومية', 'الحسابات'),
      ('accounting.statement', 'كشوف حساب', 'الحسابات'),
      ('accounting.manage', 'إدارة شجرة الحسابات', 'الحسابات'),
      ('accounting.costcenters', 'مراكز التكلفة', 'الحسابات'),
      ('accounting.reports', 'تقارير مالية', 'الحسابات')
    `);
            // Partners Permissions (العملاء والموردين)
            yield conn.query(`
      INSERT IGNORE INTO permissions (id, label, module) VALUES 
      ('partners.view', 'عرض العملاء والموردين', 'العملاء والموردين'),
      ('partners.create', 'إضافة عميل/مورد', 'العملاء والموردين'),
      ('partners.edit', 'تعديل عميل/مورد', 'العملاء والموردين'),
      ('partners.delete', 'حذف عميل/مورد', 'العملاء والموردين'),
      ('partners.statement', 'كشف حساب العميل', 'العملاء والموردين'),
      ('partners.credit', 'إدارة حدود الائتمان', 'العملاء والموردين')
    `);
            // System Settings Permissions (الإعدادات)
            yield conn.query(`
      INSERT IGNORE INTO permissions (id, label, module) VALUES 
      ('system.settings', 'إعدادات النظام', 'الإعدادات'),
      ('system.users', 'إدارة المستخدمين', 'الإعدادات'),
      ('system.backup', 'النسخ الاحتياطي', 'الإعدادات'),
      ('system.migration', 'ترحيل البيانات', 'الإعدادات'),
      ('system.reports', 'كل التقارير', 'الإعدادات')
    `);
            // HR Permissions
            yield conn.query(`
      INSERT IGNORE INTO permissions (id, label, module) VALUES 
      ('hr.view', 'عرض الموظفين', 'الموارد البشرية'),
      ('hr.manage', 'إدارة الموظفين', 'الموارد البشرية'),
      ('payroll.view', 'عرض كشف المرتبات', 'الموارد البشرية'),
      ('payroll.manage', 'إدارة المرتبات', 'الموارد البشرية'),
      ('attendance.manage', 'إدارة الحضور والانصراف', 'الموارد البشرية'),
      ('hr.biometric.view', 'عرض أجهزة البصمة والربط', 'الموارد البشرية'),
      ('hr.biometric.edit', 'إدارة أجهزة البصمة والمزامنة', 'الموارد البشرية'),
      ('hr.smart_register.view', 'عرض التسجيل الذكي والمواقع', 'الموارد البشرية'),
      ('hr.smart_register.edit', 'إدارة التسجيل الذكي والاعتمادات', 'الموارد البشرية')
    `);
            console.log('✅ All permissions inserted');
            // ========================================
            // USER BACKUP SETTINGS TABLE
            // Per-user backup scheduling and delivery preferences
            // ========================================
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS user_backup_settings (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        scheduleEnabled BOOLEAN DEFAULT FALSE,
        scheduleFrequency ENUM('daily', 'weekly', 'monthly', 'hourly') DEFAULT 'daily',
        scheduleHour INT DEFAULT 2,
        scheduleMinute INT DEFAULT 0,
        scheduleDayOfWeek INT DEFAULT 0,
        scheduleDayOfMonth INT DEFAULT 1,
        backupPath VARCHAR(500),
        deliveryEmail VARCHAR(255),
        lastBackupDate DATETIME,
        lastBackupStatus VARCHAR(50),
        lastBackupFilename VARCHAR(255),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_backup (userId),
        INDEX idx_schedule_enabled (scheduleEnabled),
        INDEX idx_user (userId)
      )
    `);
            // Migration: Add backupPath column if it doesn't exist
            yield conn.query(`
      ALTER TABLE user_backup_settings 
      ADD COLUMN IF NOT EXISTS backupPath VARCHAR(500)
    `).catch(() => { });
            console.log('✅ User backup settings table ready');
            // ========================================
            // VAN SALES / MOBILE DISTRIBUTION TABLES
            // نظام المبيعات المتنقلة
            // ========================================
            // Vehicles Table (السيارات)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id VARCHAR(36) PRIMARY KEY,
        plateNumber VARCHAR(50) NOT NULL,
        name VARCHAR(100),
        type VARCHAR(50),
        capacity DECIMAL(10,2),
        salesmanId VARCHAR(36),
        warehouseId VARCHAR(36),
        status VARCHAR(20) DEFAULT 'AVAILABLE',
        notes TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_vehicle_status (status),
        INDEX idx_vehicle_salesman (salesmanId),
        INDEX idx_vehicle_warehouse (warehouseId)
      )
    `);
            // Vehicle Inventory Table (جرد السيارة)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_inventory (
        id VARCHAR(36) PRIMARY KEY,
        vehicleId VARCHAR(36) NOT NULL,
        productId VARCHAR(36) NOT NULL,
        quantity DECIMAL(15,3) DEFAULT 0,
        lastLoadDate DATETIME,
        FOREIGN KEY (vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE KEY unique_vehicle_product (vehicleId, productId),
        INDEX idx_vehicle_inv_vehicle (vehicleId),
        INDEX idx_vehicle_inv_product (productId)
      )
    `);
            // Vehicle Operations Table (عمليات التحميل والتفريغ)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_operations (
        id VARCHAR(36) PRIMARY KEY,
        vehicleId VARCHAR(36) NOT NULL,
        operationType VARCHAR(20) NOT NULL,
        date DATETIME NOT NULL,
        warehouseId VARCHAR(36),
        notes TEXT,
        createdBy VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE,
        INDEX idx_vehicle_op_vehicle (vehicleId),
        INDEX idx_vehicle_op_type (operationType),
        INDEX idx_vehicle_op_date (date)
      )
    `);
            // Vehicle Operation Items Table (تفاصيل العملية)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_operation_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        operationId VARCHAR(36) NOT NULL,
        productId VARCHAR(36),
        productName VARCHAR(255),
        quantity DECIMAL(15,3) NOT NULL,
        cost DECIMAL(15,2) DEFAULT 0,
        FOREIGN KEY (operationId) REFERENCES vehicle_operations(id) ON DELETE CASCADE,
        INDEX idx_vehicle_op_items_op (operationId)
      )
    `);
            // Van Sales Permissions
            yield conn.query(`
      INSERT IGNORE INTO permissions (id, label, module) VALUES 
      ('vansales.view', 'عرض المبيعات المتنقلة', 'المبيعات المتنقلة'),
      ('vansales.manage', 'إدارة السيارات', 'المبيعات المتنقلة'),
      ('vansales.operations', 'عمليات التحميل والتفريغ', 'المبيعات المتنقلة'),
      ('vansales.visits', 'تتبع زيارات العملاء', 'المبيعات المتنقلة'),
      ('vansales.settlement', 'تسوية نهاية اليوم', 'المبيعات المتنقلة'),
      ('vansales.settlements', 'التسويات', 'المبيعات المتنقلة'),
      ('vansales.inventory', 'جرد السيارات', 'المبيعات المتنقلة'),
      ('vansales.returns', 'إدارة المرتجعات', 'المبيعات المتنقلة')
    `);
            // Customer Visits Table (تتبع زيارات العملاء)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_customer_visits (
        id VARCHAR(36) PRIMARY KEY,
        vehicleId VARCHAR(36) NOT NULL,
        salesmanId VARCHAR(36),
        customerId VARCHAR(36),
        customerName VARCHAR(255),
        visitDate DATETIME NOT NULL,
        visitType ENUM('PLANNED', 'UNPLANNED') DEFAULT 'PLANNED',
        result ENUM('SALE', 'NO_SALE', 'NOT_AVAILABLE', 'DEFERRED') DEFAULT 'NO_SALE',
        invoiceId VARCHAR(36) COMMENT 'If result is SALE, link to invoice',
        invoiceAmount DECIMAL(15,2) DEFAULT 0,
        paymentCollected DECIMAL(15,2) DEFAULT 0,
        paymentMethod VARCHAR(50),
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        address TEXT,
        notes TEXT,
        duration INT COMMENT 'Visit duration in minutes',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE,
        INDEX idx_visit_vehicle (vehicleId),
        INDEX idx_visit_salesman (salesmanId),
        INDEX idx_visit_customer (customerId),
        INDEX idx_visit_date (visitDate),
        INDEX idx_visit_result (result)
      )
    `);
            // Add RETURN to the result enum for customer visits
            yield conn.query(`
      ALTER TABLE vehicle_customer_visits 
      MODIFY COLUMN result ENUM('SALE', 'NO_SALE', 'NOT_AVAILABLE', 'DEFERRED', 'RETURN') DEFAULT 'NO_SALE'
    `).catch(() => {
                // Ignore error if already modified
            });
            // Van Sales Returns Table (مرتجعات المبيعات المتنقلة)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_returns (
        id VARCHAR(36) PRIMARY KEY,
        vehicleId VARCHAR(36) NOT NULL,
        customerId VARCHAR(36),
        customerName VARCHAR(255),
        returnDate DATETIME NOT NULL,
        originalInvoiceId VARCHAR(36),
        returnType ENUM('DAMAGE', 'EXPIRY', 'QUALITY', 'EXCESS', 'OTHER') DEFAULT 'OTHER',
        returnReason TEXT,
        totalValue DECIMAL(15,2) DEFAULT 0,
        status ENUM('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED') DEFAULT 'PENDING',
        processedBy VARCHAR(100),
        processedAt DATETIME,
        notes TEXT,
        createdBy VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE,
        INDEX idx_return_vehicle (vehicleId),
        INDEX idx_return_customer (customerId),
        INDEX idx_return_date (returnDate),
        INDEX idx_return_status (status)
      )
    `);
            // Van Sales Return Items Table (تفاصيل المرتجعات)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_return_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        returnId VARCHAR(36) NOT NULL,
        productId VARCHAR(36),
        productName VARCHAR(255),
        quantity DECIMAL(15,3) NOT NULL,
        unitPrice DECIMAL(15,2) DEFAULT 0,
        totalPrice DECIMAL(15,2) DEFAULT 0,
        reason TEXT,
        FOREIGN KEY (returnId) REFERENCES vehicle_returns(id) ON DELETE CASCADE,
        INDEX idx_return_items_return (returnId)
      )
    `);
            // End of Day Settlement Table (تسوية نهاية اليوم)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_settlements (
        id VARCHAR(36) PRIMARY KEY,
        vehicleId VARCHAR(36) NOT NULL,
        settlementDate DATE NOT NULL,
        salesmanId VARCHAR(36),
        salesmanName VARCHAR(255),
        
        -- Sales Summary
        totalCashSales DECIMAL(15,2) DEFAULT 0,
        totalCreditSales DECIMAL(15,2) DEFAULT 0,
        totalChequeSales DECIMAL(15,2) DEFAULT 0,
        totalSales DECIMAL(15,2) DEFAULT 0,
        
        -- Collections
        cashCollected DECIMAL(15,2) DEFAULT 0,
        chequesCollected DECIMAL(15,2) DEFAULT 0,
        totalCollections DECIMAL(15,2) DEFAULT 0,
        
        -- Returns
        totalReturns DECIMAL(15,2) DEFAULT 0,
        returnCount INT DEFAULT 0,
        
        -- Inventory
        openingInventoryValue DECIMAL(15,2) DEFAULT 0,
        loadedValue DECIMAL(15,2) DEFAULT 0,
        unloadedValue DECIMAL(15,2) DEFAULT 0,
        closingInventoryValue DECIMAL(15,2) DEFAULT 0,
        
        -- Visits Statistics
        plannedVisits INT DEFAULT 0,
        completedVisits INT DEFAULT 0,
        successfulVisits INT DEFAULT 0,
        
        -- Cash Reconciliation
        expectedCash DECIMAL(15,2) DEFAULT 0,
        actualCash DECIMAL(15,2) DEFAULT 0,
        cashDifference DECIMAL(15,2) DEFAULT 0,
        
        -- Status
        status ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'DISPUTED') DEFAULT 'DRAFT',
        approvedBy VARCHAR(100),
        approvedAt DATETIME,
        notes TEXT,
        
        createdBy VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE,
        UNIQUE KEY unique_vehicle_date (vehicleId, settlementDate),
        INDEX idx_settlement_vehicle (vehicleId),
        INDEX idx_settlement_date (settlementDate),
        INDEX idx_settlement_salesman (salesmanId),
        INDEX idx_settlement_status (status)
      )
    `);
            console.log('✅ Van Sales / Mobile Distribution tables ready (including visits, returns, settlements)');
            // ========================================
            // VAN SALES ENHANCEMENTS (2025-12-24)
            // Targets, Routes, Fleet Management
            // ========================================
            // Vehicle Targets Table (أهداف السيارات)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_targets (
        id VARCHAR(36) PRIMARY KEY,
        vehicleId VARCHAR(36) NOT NULL,
        salesmanId VARCHAR(36),
        targetType ENUM('SALES_AMOUNT', 'SALES_COUNT', 'VISITS', 'COLLECTIONS') DEFAULT 'SALES_AMOUNT',
        periodType ENUM('DAILY', 'WEEKLY', 'MONTHLY') DEFAULT 'DAILY',
        targetValue DECIMAL(15,2) NOT NULL,
        periodStart DATE NOT NULL,
        periodEnd DATE NOT NULL,
        achievedValue DECIMAL(15,2) DEFAULT 0,
        isActive BOOLEAN DEFAULT TRUE,
        notes TEXT,
        createdBy VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE,
        INDEX idx_target_vehicle (vehicleId),
        INDEX idx_target_salesman (salesmanId),
        INDEX idx_target_period (periodStart, periodEnd),
        INDEX idx_target_active (isActive)
      )
    `);
            // Vehicle Routes Table (خطوط السير)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_routes (
        id VARCHAR(36) PRIMARY KEY,
        vehicleId VARCHAR(36) NOT NULL,
        routeName VARCHAR(255) NOT NULL,
        routeDate DATE NOT NULL,
        status ENUM('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'PLANNED',
        plannedDistance DECIMAL(10,2),
        actualDistance DECIMAL(10,2),
        startTime DATETIME,
        endTime DATETIME,
        notes TEXT,
        createdBy VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE,
        INDEX idx_route_vehicle (vehicleId),
        INDEX idx_route_date (routeDate),
        INDEX idx_route_status (status)
      )
    `);
            // Vehicle Route Stops Table (محطات خط السير)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_route_stops (
        id VARCHAR(36) PRIMARY KEY,
        routeId VARCHAR(36) NOT NULL,
        stopOrder INT NOT NULL,
        customerId VARCHAR(36),
        customerName VARCHAR(255),
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        address TEXT,
        plannedArrival DATETIME,
        actualArrival DATETIME,
        visitId VARCHAR(36),
        status ENUM('PENDING', 'VISITED', 'SKIPPED') DEFAULT 'PENDING',
        result ENUM('SALE', 'NO_SALE', 'NOT_AVAILABLE', 'DEFERRED') DEFAULT NULL,
        invoiceId VARCHAR(36),
        amountCollected DECIMAL(15,2) DEFAULT 0,
        notes TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (routeId) REFERENCES vehicle_routes(id) ON DELETE CASCADE,
        INDEX idx_stop_route (routeId),
        INDEX idx_stop_customer (customerId),
        INDEX idx_stop_status (status)
      )
    `);
            // Migration: Add result, invoiceId, amountCollected columns to vehicle_route_stops if they don't exist
            yield conn.query(`ALTER TABLE vehicle_route_stops ADD COLUMN IF NOT EXISTS result ENUM('SALE', 'NO_SALE', 'NOT_AVAILABLE', 'DEFERRED') DEFAULT NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE vehicle_route_stops ADD COLUMN IF NOT EXISTS invoiceId VARCHAR(36)`).catch(() => { });
            yield conn.query(`ALTER TABLE vehicle_route_stops ADD COLUMN IF NOT EXISTS amountCollected DECIMAL(15,2) DEFAULT 0`).catch(() => { });
            // Vehicle Maintenance Table (صيانة السيارات)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_maintenance (
        id VARCHAR(36) PRIMARY KEY,
        vehicleId VARCHAR(36) NOT NULL,
        maintenanceType ENUM('SCHEDULED', 'REPAIR', 'INSPECTION', 'OIL_CHANGE', 'TIRE', 'OTHER') DEFAULT 'SCHEDULED',
        description TEXT,
        scheduledDate DATE,
        completedDate DATE,
        cost DECIMAL(15,2) DEFAULT 0,
        mileage INT,
        nextMaintenanceDate DATE,
        nextMaintenanceMileage INT,
        status ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'SCHEDULED',
        notes TEXT,
        createdBy VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE,
        INDEX idx_maintenance_vehicle (vehicleId),
        INDEX idx_maintenance_date (scheduledDate),
        INDEX idx_maintenance_status (status)
      )
    `);
            // Vehicle Fuel Logs Table (سجل الوقود)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_fuel_logs (
        id VARCHAR(36) PRIMARY KEY,
        vehicleId VARCHAR(36) NOT NULL,
        fuelDate DATE NOT NULL,
        fuelType VARCHAR(50) DEFAULT 'بنزين 92',
        liters DECIMAL(10,2) NOT NULL,
        pricePerLiter DECIMAL(10,2),
        totalCost DECIMAL(15,2),
        mileage INT,
        kmPerLiter DECIMAL(10,2),
        fullTank BOOLEAN DEFAULT FALSE,
        notes TEXT,
        createdBy VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE,
        INDEX idx_fuel_vehicle (vehicleId),
        INDEX idx_fuel_date (fuelDate)
      )
    `);
            // Van Sales Enhanced Permissions
            yield conn.query(`
      INSERT IGNORE INTO permissions (id, label, module) VALUES 
      ('vansales.targets', 'إدارة الأهداف', 'المبيعات المتنقلة'),
      ('vansales.routes', 'إدارة خطوط السير', 'المبيعات المتنقلة'),
      ('vansales.maintenance', 'صيانة السيارات', 'المبيعات المتنقلة'),
      ('vansales.fuel', 'سجل الوقود', 'المبيعات المتنقلة'),
      ('vansales.reports.export', 'تصدير التقارير', 'المبيعات المتنقلة')
    `);
            // Migration: Add GPS columns to vehicles table
            yield conn.query(`
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8)
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8)
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS lastLocationUpdate DATETIME
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS currentMileage INT DEFAULT 0
    `).catch(() => { });
            // Migration: Add partial settlement columns
            yield conn.query(`
      ALTER TABLE vehicle_settlements ADD COLUMN IF NOT EXISTS partialSettlement BOOLEAN DEFAULT FALSE
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE vehicle_settlements ADD COLUMN IF NOT EXISTS bankTransferAmount DECIMAL(15,2) DEFAULT 0
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE vehicle_settlements ADD COLUMN IF NOT EXISTS bankTransferReference VARCHAR(100)
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE vehicle_settlements ADD COLUMN IF NOT EXISTS totalBankTransfers DECIMAL(15,2) DEFAULT 0
    `).catch(() => { });
            yield conn.query(`
      ALTER TABLE vehicle_settlements ADD COLUMN IF NOT EXISTS totalExpenses DECIMAL(15,2) DEFAULT 0
    `).catch(() => { });
            console.log('✅ Van Sales Enhancement tables ready (targets, routes, maintenance, fuel)');
            // ========================================
            // AUTO-SYNC: Ensure product_stocks has entries for production
            // Added: 2025-12-10 for automatic warehouse stock consistency
            // ========================================
            try {
                // Get products that have production movements but no product_stocks entry
                const [missingStocks] = yield conn.query(`
        SELECT DISTINCT sm.product_id, sm.warehouse_id
        FROM stock_movements sm
        WHERE sm.movement_type IN ('PRODUCTION_USE', 'PRODUCTION_OUTPUT')
          AND sm.warehouse_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM product_stocks ps 
            WHERE ps.productId = sm.product_id 
              AND ps.warehouseId = sm.warehouse_id
          )
      `);
                if (missingStocks.length > 0) {
                    console.log(`🔄 Auto-syncing ${missingStocks.length} missing product_stocks entries...`);
                    const { randomUUID: uuidv4 } = require('crypto');
                    for (const row of missingStocks) {
                        // Get the current global stock for this product
                        const [productRow] = yield conn.query('SELECT stock FROM products WHERE id = ?', [row.product_id]);
                        const globalStock = ((_e = productRow[0]) === null || _e === void 0 ? void 0 : _e.stock) || 0;
                        // Create product_stocks entry
                        yield conn.query('INSERT INTO product_stocks (id, productId, warehouseId, stock) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE stock = stock', [uuidv4(), row.product_id, row.warehouse_id, globalStock]);
                    }
                    console.log('✅ Production stock sync complete');
                }
            }
            catch (syncErr) {
                console.warn('⚠️ Production stock sync skipped:', syncErr);
                // Non-fatal - continue with startup
            }
            // ========================================
            // AUTO-SYNC: Fix stock movement balances (REMOVED)
            // Logic removed to prevent auto-creation of OPENING_BALANCE entries
            // ========================================
            // (Logic was here)
            // Fiscal Years Table
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS fiscal_years (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status ENUM('OPEN','CLOSED') DEFAULT 'OPEN',
        closing_journal_id VARCHAR(36) DEFAULT NULL,
        closed_by VARCHAR(100) DEFAULT NULL,
        closed_at DATETIME DEFAULT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
            // Fiscal Year Periods Table (الفترات المالية - شهرية/ربع سنوية)
            try {
                yield conn.query(`
        CREATE TABLE IF NOT EXISTS fiscal_year_periods (
          id VARCHAR(36) PRIMARY KEY,
          fiscal_year_id VARCHAR(36) NOT NULL,
          name VARCHAR(100) NOT NULL,
          period_number INT NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          status ENUM('OPEN','LOCKED') DEFAULT 'OPEN',
          locked_by VARCHAR(100) DEFAULT NULL,
          locked_at DATETIME DEFAULT NULL,
          FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE CASCADE,
          INDEX idx_fyp_year (fiscal_year_id),
          INDEX idx_fyp_dates (start_date, end_date),
          INDEX idx_fyp_status (status)
        )
      `);
            }
            catch (fypErr) {
                console.warn('⚠️ fiscal_year_periods skipped (FK mismatch):', fypErr.message);
            }
            // ========================================
            // FISCAL YEAR: Lock Date Columns (Odoo-style Continuous Accounting)
            // Replaces destructive "zeroing entries" with date-based period locking.
            // ========================================
            yield conn.query(`ALTER TABLE fiscal_years ADD COLUMN IF NOT EXISTS fiscalyear_lock_date DATE DEFAULT NULL COMMENT 'General accounting lock date'`).catch(() => { });
            yield conn.query(`ALTER TABLE fiscal_years ADD COLUMN IF NOT EXISTS tax_lock_date DATE DEFAULT NULL COMMENT 'Tax entries lock date'`).catch(() => { });
            yield conn.query(`ALTER TABLE fiscal_years ADD COLUMN IF NOT EXISTS hard_lock_date DATE DEFAULT NULL COMMENT 'Immutable lock — cannot be overridden'`).catch(() => { });
            // Expand status enum to include LOCKED (soft close that doesn't destroy data)
            yield conn.query(`ALTER TABLE fiscal_years MODIFY COLUMN status ENUM('OPEN','CLOSED','LOCKED') DEFAULT 'OPEN'`).catch(() => { });
            console.log('✅ Fiscal year lock date columns ready');
            // ========================================
            // CERAMICS MODULE TABLES (وحدة السيراميك)
            // ========================================
            // Migration: Add ceramic columns to products table
            yield Promise.all([
                conn.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ceramic_size VARCHAR(100)`).catch(() => { }),
                conn.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ceramic_color VARCHAR(100)`).catch(() => { }),
                conn.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ceramic_color_grade VARCHAR(50)`).catch(() => { }),
                conn.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ceramic_color_desc VARCHAR(255)`).catch(() => { }),
                conn.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ceramic_name VARCHAR(100) COMMENT 'الاسم (was الديكالة)'`).catch(() => { }),
                conn.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ceramic_pattern VARCHAR(100)`).catch(() => { }),
            ]);
            // Migration: Add ceramic price/discount list links to partners table
            yield Promise.all([
                conn.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS ceramicPriceListId VARCHAR(36)`).catch(() => { }),
                conn.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS ceramicDiscountListId VARCHAR(36)`).catch(() => { }),
            ]);
            // Ceramic Price Lists Table (قوائم أسعار السيراميك)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS ceramic_price_lists (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        listNumber INT,
        date DATE,
        companyId VARCHAR(36),
        companyName VARCHAR(255),
        notes TEXT,
        status ENUM('ACTIVE','SUSPENDED','PRIVATE') DEFAULT 'ACTIVE',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_date (date)
      )
    `);
            // Migration: Add discountListId to ceramic_price_lists for linking price list to discount list
            yield conn.query(`
      ALTER TABLE ceramic_price_lists 
      ADD COLUMN IF NOT EXISTS discountListId VARCHAR(36) NULL COMMENT 'ربط بقائمة الخصم'
    `).catch(() => { });
            // Ceramic Price List Items Table (بنود قوائم الأسعار)
            try {
                yield conn.query(`
        CREATE TABLE IF NOT EXISTS ceramic_price_list_items (
          id VARCHAR(36) PRIMARY KEY,
          priceListId VARCHAR(36) NOT NULL,
          productId VARCHAR(36),
          groupName VARCHAR(100),
          ceramicName VARCHAR(100) COMMENT 'الاسم (was الديكالة)',
          sizeName VARCHAR(100) COMMENT 'المقاس',
          itemNumber VARCHAR(50) COMMENT 'الرقم',
          color VARCHAR(100) COMMENT 'اللون',
          colorGrade VARCHAR(50) COMMENT 'درجة اللون',
          colorDescription VARCHAR(255) COMMENT 'توصيف اللون',
          pattern VARCHAR(100) COMMENT 'الفطعة',
          price1 DECIMAL(15,2) DEFAULT 0 COMMENT 'أول',
          price2 DECIMAL(15,2) DEFAULT 0 COMMENT 'ثاني',
          price3 DECIMAL(15,2) DEFAULT 0 COMMENT 'ثالث',
          price4 DECIMAL(15,2) DEFAULT 0 COMMENT 'رابع',
          feature1 DECIMAL(15,2) DEFAULT 0 COMMENT 'ميزة 1',
          feature2 DECIMAL(15,2) DEFAULT 0 COMMENT 'ميزة 2',
          feature3 DECIMAL(15,2) DEFAULT 0 COMMENT 'ميزة 3',
          FOREIGN KEY (priceListId) REFERENCES ceramic_price_lists(id) ON DELETE CASCADE,
          FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL,
          INDEX idx_pricelist (priceListId),
          INDEX idx_product (productId),
          INDEX idx_group (groupName)
        )
      `);
            }
            catch (fkErr) {
                // FK constraint may fail if charset/collation/engine mismatch — create without FK
                console.warn('⚠️ ceramic_price_list_items FK error, creating without foreign keys:', fkErr.message);
                yield conn.query(`
        CREATE TABLE IF NOT EXISTS ceramic_price_list_items (
          id VARCHAR(36) PRIMARY KEY,
          priceListId VARCHAR(36) NOT NULL,
          productId VARCHAR(36),
          groupName VARCHAR(100),
          ceramicName VARCHAR(100),
          sizeName VARCHAR(100),
          itemNumber VARCHAR(50),
          color VARCHAR(100),
          colorGrade VARCHAR(50),
          colorDescription VARCHAR(255),
          pattern VARCHAR(100),
          price1 DECIMAL(15,2) DEFAULT 0,
          price2 DECIMAL(15,2) DEFAULT 0,
          price3 DECIMAL(15,2) DEFAULT 0,
          price4 DECIMAL(15,2) DEFAULT 0,
          feature1 DECIMAL(15,2) DEFAULT 0,
          feature2 DECIMAL(15,2) DEFAULT 0,
          feature3 DECIMAL(15,2) DEFAULT 0,
          INDEX idx_pricelist (priceListId),
          INDEX idx_product (productId),
          INDEX idx_group (groupName)
        )
      `);
            }
            // Ceramic Discount Lists Table (قوائم خصم السيراميك)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS ceramic_discount_lists (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        listNumber INT,
        date DATE,
        companyId VARCHAR(36),
        companyName VARCHAR(255),
        discountType ENUM('WAREHOUSE','STORE') DEFAULT 'WAREHOUSE',
        notes TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status (discountType),
        INDEX idx_date (date)
      )
    `);
            // Ceramic Discount List Items Table (بنود قوائم الخصم)
            try {
                yield conn.query(`
        CREATE TABLE IF NOT EXISTS ceramic_discount_list_items (
          id VARCHAR(36) PRIMARY KEY,
          discountListId VARCHAR(36) NOT NULL,
          groupName VARCHAR(100) NOT NULL COMMENT 'المجموعة',
          groupDescription VARCHAR(255) COMMENT 'توصيف المجموعة',
          discount1 DECIMAL(5,2) DEFAULT 0 COMMENT 'خصم أول',
          discount2 DECIMAL(5,2) DEFAULT 0 COMMENT 'خصم ثاني',
          discount3 DECIMAL(5,2) DEFAULT 0 COMMENT 'خصم ثالث',
          featureDiscount DECIMAL(5,2) DEFAULT 0 COMMENT 'خصم الميزة',
          FOREIGN KEY (discountListId) REFERENCES ceramic_discount_lists(id) ON DELETE CASCADE,
          INDEX idx_discountlist (discountListId),
          INDEX idx_group (groupName)
        )
      `);
            }
            catch (cdliErr) {
                console.warn('⚠️ ceramic_discount_list_items skipped (FK mismatch):', cdliErr.message);
            }
            // ========================================
            // PACKAGING SYSTEM TABLES (نظام التعبئة والتغليف)
            // Migration 048: core specs + materials + production_order_packaging
            // Migration 049: advanced packaging (manual batches, packaging orders)
            // ========================================
            // Packaging Specifications (مواصفات التعبئة)
            // NOTE: FK constraints removed from CREATE TABLE to prevent silent failures
            // after full database reset. FKs are added separately below.
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS product_packaging_specs (
        id VARCHAR(36) PRIMARY KEY,
        product_id VARCHAR(36) NOT NULL,
        name VARCHAR(100) NOT NULL,
        capacity INT NOT NULL,
        level ENUM('PRIMARY', 'SECONDARY', 'TERTIARY') DEFAULT 'PRIMARY',
        instructions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_pps_product (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ product_packaging_specs creation failed:', e.message));
            // Packaging Materials (مواد التعبئة لكل مواصفة)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS product_packaging_materials (
        id VARCHAR(36) PRIMARY KEY,
        spec_id VARCHAR(36) NOT NULL,
        material_product_id VARCHAR(36) NOT NULL,
        quantity DECIMAL(15,3) NOT NULL,
        INDEX idx_ppm_spec (spec_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ product_packaging_materials creation failed:', e.message));
            // Production Order Packaging Tasks (مهام التعبئة لأوامر الإنتاج)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS production_order_packaging (
        id VARCHAR(36) PRIMARY KEY,
        production_order_id VARCHAR(36) NOT NULL,
        packaging_spec_id VARCHAR(36) NOT NULL,
        qty_planned DECIMAL(15,3) NOT NULL,
        qty_packed DECIMAL(15,3) DEFAULT 0,
        status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED') DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_pop_order (production_order_id),
        INDEX idx_pop_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ production_order_packaging creation failed:', e.message));
            // Manual Batches (تجميع / تعبئة يدوية)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS manual_batches (
        id VARCHAR(36) PRIMARY KEY,
        batch_number VARCHAR(50) NOT NULL,
        date DATETIME NOT NULL,
        warehouse_id VARCHAR(36) NOT NULL,
        total_cost DECIMAL(15,3) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by VARCHAR(36),
        INDEX idx_mb_date (date),
        INDEX idx_mb_warehouse (warehouse_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ manual_batches creation failed:', e.message));
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS manual_batch_inputs (
        id VARCHAR(36) PRIMARY KEY,
        batch_id VARCHAR(36) NOT NULL,
        product_id VARCHAR(36) NOT NULL,
        quantity DECIMAL(15,3) NOT NULL,
        unit_cost DECIMAL(15,3) NOT NULL,
        total_cost DECIMAL(15,3) NOT NULL,
        INDEX idx_mbi_batch (batch_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ manual_batch_inputs creation failed:', e.message));
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS manual_batch_outputs (
        id VARCHAR(36) PRIMARY KEY,
        batch_id VARCHAR(36) NOT NULL,
        product_id VARCHAR(36) NOT NULL,
        quantity DECIMAL(15,3) NOT NULL,
        unit_cost DECIMAL(15,3) NOT NULL,
        total_cost DECIMAL(15,3) NOT NULL,
        INDEX idx_mbo_batch (batch_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ manual_batch_outputs creation failed:', e.message));
            // Packaging Orders (أوامر التعبئة المتقدمة)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS packaging_orders (
        id VARCHAR(36) PRIMARY KEY,
        order_number VARCHAR(50) NOT NULL,
        type ENUM('TRADITIONAL', 'HIERARCHICAL') DEFAULT 'TRADITIONAL',
        production_order_id VARCHAR(36) NULL,
        product_id VARCHAR(36) NOT NULL,
        quantity DECIMAL(15,3) NOT NULL,
        warehouse_id VARCHAR(36) NOT NULL,
        total_material_cost DECIMAL(15,3) DEFAULT 0,
        total_packaging_cost DECIMAL(15,3) DEFAULT 0,
        total_cost DECIMAL(15,3) DEFAULT 0,
        unit_cost DECIMAL(15,3) DEFAULT 0,
        status ENUM('DRAFT', 'COMPLETED') DEFAULT 'COMPLETED',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by VARCHAR(36),
        INDEX idx_po_status (status),
        INDEX idx_po_product (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ packaging_orders creation failed:', e.message));
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS packaging_order_levels (
        id VARCHAR(36) PRIMARY KEY,
        packaging_order_id VARCHAR(36) NOT NULL,
        level_index INT NOT NULL,
        input_product_id VARCHAR(36) NOT NULL,
        output_product_id VARCHAR(36) NOT NULL,
        input_qty DECIMAL(15,3) NOT NULL,
        output_qty DECIMAL(15,3) NOT NULL,
        material_cost DECIMAL(15,3) DEFAULT 0,
        packaging_cost DECIMAL(15,3) DEFAULT 0,
        total_cost DECIMAL(15,3) DEFAULT 0,
        unit_cost DECIMAL(15,3) DEFAULT 0,
        INDEX idx_pol_order (packaging_order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ packaging_order_levels creation failed:', e.message));
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS packaging_order_materials (
        id VARCHAR(36) PRIMARY KEY,
        level_id VARCHAR(36) NOT NULL,
        product_id VARCHAR(36) NOT NULL,
        quantity DECIMAL(15,3) NOT NULL,
        unit_cost DECIMAL(15,3) NOT NULL,
        total_cost DECIMAL(15,3) NOT NULL,
        INDEX idx_pom_level (level_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ packaging_order_materials creation failed:', e.message));
            console.log('✅ Packaging system tables ready (specs, materials, production_order_packaging, advanced packaging)');
            // ========================================
            // CRM MODULE TABLES
            // ========================================
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS crm_categories (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        type ENUM('LEAD','TICKET','INQUIRY') NOT NULL,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ crm_categories creation failed:', e.message));
            yield conn.query(`ALTER TABLE crm_leads ADD COLUMN categoryId VARCHAR(36)`).catch(() => { });
            yield conn.query(`ALTER TABLE crm_tickets ADD COLUMN categoryId VARCHAR(36)`).catch(() => { });
            yield conn.query(`ALTER TABLE crm_leads ADD COLUMN appointment_date DATETIME`).catch(() => { });
            yield conn.query(`ALTER TABLE crm_tickets ADD COLUMN appointment_date DATETIME`).catch(() => { });
            // Safe column-addition helper — works on all MySQL versions (no IF NOT EXISTS needed)
            const addColumnIfMissing = (table, column, definition) => __awaiter(this, void 0, void 0, function* () {
                const [cols] = yield conn.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, column]);
                if (!cols.length) {
                    yield conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
                }
            });
            // crm_tickets columns added post-release
            yield addColumnIfMissing('crm_tickets', 'attachments', 'LONGTEXT NULL');
            yield addColumnIfMissing('crm_tickets', 'created_by', 'VARCHAR(36) NULL');
            yield addColumnIfMissing('crm_tickets', 'address', 'TEXT NULL');
            // crm_ticket_comments columns added post-release
            yield addColumnIfMissing('crm_ticket_comments', 'is_internal', 'TINYINT(1) NOT NULL DEFAULT 0');
            yield addColumnIfMissing('crm_ticket_comments', 'attachments', 'LONGTEXT NULL');
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS crm_lead_stages (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(20) DEFAULT '#6366f1',
        sortOrder INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ crm_lead_stages creation failed:', e.message));
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS crm_leads (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        name VARCHAR(200),
        company VARCHAR(200),
        email VARCHAR(200),
        phone VARCHAR(50),
        stageId VARCHAR(36),
        assignedTo VARCHAR(36),
        partnerId VARCHAR(36),
        expectedRevenue DECIMAL(15,2) DEFAULT 0,
        probability INT DEFAULT 0,
        source VARCHAR(100),
        status ENUM('OPEN','WON','LOST') DEFAULT 'OPEN',
        notes TEXT,
        tags VARCHAR(500),
        sortOrder INT DEFAULT 0,
        createdBy VARCHAR(36),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_crm_leads_stage (stageId),
        INDEX idx_crm_leads_assigned (assignedTo),
        INDEX idx_crm_leads_status (status),
        INDEX idx_crm_leads_partner (partnerId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ crm_leads creation failed:', e.message));
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS crm_activities (
        id VARCHAR(36) PRIMARY KEY,
        leadId VARCHAR(36) NOT NULL,
        type ENUM('CALL','MEETING','EMAIL','TASK','NOTE') DEFAULT 'TASK',
        summary VARCHAR(500) NOT NULL,
        notes TEXT,
        dueDate DATETIME,
        isDone TINYINT(1) DEFAULT 0,
        assignedTo VARCHAR(36),
        createdBy VARCHAR(36),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_crm_act_lead (leadId),
        INDEX idx_crm_act_due (dueDate),
        INDEX idx_crm_act_done (isDone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ crm_activities creation failed:', e.message));
            // Seed default CRM stages if empty
            const [existingStages] = yield conn.query(`SELECT COUNT(*) as c FROM crm_lead_stages`).catch(() => [[{ c: 1 }]]);
            if (((_f = existingStages[0]) === null || _f === void 0 ? void 0 : _f.c) === 0) {
                const { randomUUID: uuidv4 } = require('crypto');
                const defaultStages = [
                    { id: uuidv4(), name: 'عميل محتمل', color: '#6366f1', sortOrder: 0 },
                    { id: uuidv4(), name: 'تواصل أولي', color: '#3b82f6', sortOrder: 1 },
                    { id: uuidv4(), name: 'عرض سعر', color: '#f59e0b', sortOrder: 2 },
                    { id: uuidv4(), name: 'تفاوض', color: '#f97316', sortOrder: 3 },
                    { id: uuidv4(), name: 'إغلاق', color: '#10b981', sortOrder: 4 },
                ];
                for (const s of defaultStages) {
                    yield conn.query(`INSERT INTO crm_lead_stages (id, name, color, sortOrder) VALUES (?, ?, ?, ?)`, [s.id, s.name, s.color, s.sortOrder]).catch(() => { });
                }
                console.log('✅ Default CRM stages seeded');
            }
            console.log('✅ CRM module tables ready (stages, leads, activities)');
            // Ticketing System Tables
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS crm_tickets (
        id VARCHAR(36) PRIMARY KEY,
        partner_id VARCHAR(36) NOT NULL,
        lead_id VARCHAR(36),
        subject VARCHAR(200) NOT NULL,
        description TEXT,
        status ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') DEFAULT 'OPEN',
        priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') DEFAULT 'MEDIUM',
        assigned_to VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_crm_tickets_partner (partner_id),
        INDEX idx_crm_tickets_lead (lead_id),
        INDEX idx_crm_tickets_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ crm_tickets creation failed:', e.message));
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS crm_ticket_comments (
        id VARCHAR(36) PRIMARY KEY,
        ticket_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_crm_ticket_comments_ticket (ticket_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ crm_ticket_comments creation failed:', e.message));
            // CRM Complaints (قسم الشكاوى) tables
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS crm_complaints (
        id VARCHAR(36) PRIMARY KEY,
        complaint_number VARCHAR(50) UNIQUE NOT NULL,
        partner_id VARCHAR(36),
        partner_name VARCHAR(255),
        partner_phone VARCHAR(50),
        subject VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        type ENUM('PRODUCT_QUALITY', 'SERVICE_DELAY', 'EMPLOYEE_BEHAVIOR', 'FINANCIAL_ERROR', 'PACKAGING_ISSUE', 'OTHER') DEFAULT 'OTHER',
        severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
        status ENUM('NEW', 'UNDER_REVIEW', 'INVESTIGATING', 'RESOLVED', 'REJECTED', 'CLOSED') DEFAULT 'NEW',
        source ENUM('PHONE', 'WHATSAPP', 'EMAIL', 'WALK_IN', 'WEBSITE', 'OTHER') DEFAULT 'PHONE',
        assigned_to VARCHAR(36),
        created_by VARCHAR(36),
        resolved_at DATETIME,
        resolved_by VARCHAR(36),
        resolution_summary TEXT,
        client_mood ENUM('ANGRY', 'UPSET', 'NEUTRAL', 'SATISFIED') DEFAULT 'UPSET',
        satisfaction_rating INT,
        compensation_type ENUM('NONE', 'CREDIT_NOTE', 'REFUND', 'REPLACEMENT', 'REPAIR', 'DISCOUNT_VOUCHER', 'LOYALTY_POINTS', 'FREE_GIFT', 'FREE_SERVICE', 'OTHER') DEFAULT 'NONE',
        compensation_amount DECIMAL(15,2) DEFAULT 0.00,
        root_cause TEXT,
        invoice_id VARCHAR(36),
        attachments LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_crm_complaints_partner (partner_id),
        INDEX idx_crm_complaints_status (status),
        INDEX idx_crm_complaints_number (complaint_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ crm_complaints creation failed:', e.message));
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS crm_complaint_comments (
        id VARCHAR(36) PRIMARY KEY,
        complaint_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        content TEXT NOT NULL,
        is_internal TINYINT(1) DEFAULT 1,
        attachments LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_crm_complaint_comments_complaint (complaint_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ crm_complaint_comments creation failed:', e.message));
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS crm_complaint_compensations (
        id VARCHAR(36) PRIMARY KEY,
        complaint_id VARCHAR(36) NOT NULL,
        partner_id VARCHAR(36),
        type ENUM('CREDIT_NOTE', 'REFUND', 'REPLACEMENT', 'DISCOUNT_VOUCHER', 'LOYALTY_POINTS', 'OTHER') NOT NULL,
        amount DECIMAL(15,2) DEFAULT 0.00,
        status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
        approved_by VARCHAR(36),
        approved_at DATETIME,
        posted_invoice_id VARCHAR(36),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_crm_comp_status (status),
        INDEX idx_crm_comp_complaint (complaint_id),
        INDEX idx_crm_comp_partner (partner_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ crm_complaint_compensations creation failed:', e.message));
            // ── Knowledge Base articles table (user-facing FAQ system) ──
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS kb_articles (
        id VARCHAR(36) PRIMARY KEY,
        question TEXT NOT NULL,
        answer MEDIUMTEXT NOT NULL,
        category VARCHAR(100) NOT NULL,
        keywords JSON DEFAULT NULL,
        attachments JSON DEFAULT NULL,
        viewCount INT DEFAULT 0,
        isFeatured BOOLEAN DEFAULT FALSE,
        isActive BOOLEAN DEFAULT TRUE,
        createdBy VARCHAR(36),
        updatedBy VARCHAR(36),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FULLTEXT INDEX ft_kb_search (question, answer),
        INDEX idx_kb_category (category, isActive),
        INDEX idx_kb_featured (isFeatured, isActive)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ kb_articles creation failed:', e.message));
            console.log('✅ Knowledge Base table ready (kb_articles)');
            // ========================================
            // BRANDS TABLE (used by variant groups)
            // ========================================
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_brands_active (isActive)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ brands table creation failed:', e.message));
            // ========================================
            // VARIANT GROUPS TABLE
            // ========================================
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS variant_groups (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        categoryId VARCHAR(36),
        brandId VARCHAR(36),
        description TEXT,
        attributeKeys JSON NOT NULL COMMENT '["size","color"]',
        isActive BOOLEAN DEFAULT TRUE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_vg_active (isActive),
        INDEX idx_vg_category (categoryId),
        INDEX idx_vg_brand (brandId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((e) => console.warn('⚠️ variant_groups table creation failed:', e.message));
            // Migration: Backfill missing columns on variant_groups (table may have been
            // created from the older posController schema without these fields)
            yield conn.query(`ALTER TABLE variant_groups ADD COLUMN IF NOT EXISTS isActive TINYINT(1) NOT NULL DEFAULT 1`).catch((e) => { var _a; if (!((_a = e.message) === null || _a === void 0 ? void 0 : _a.includes('Duplicate column')))
                console.warn('variant_groups.isActive:', e.message); });
            yield conn.query(`ALTER TABLE variant_groups ADD COLUMN IF NOT EXISTS categoryId VARCHAR(36) DEFAULT NULL`).catch((e) => { var _a; if (!((_a = e.message) === null || _a === void 0 ? void 0 : _a.includes('Duplicate column')))
                console.warn('variant_groups.categoryId:', e.message); });
            yield conn.query(`ALTER TABLE variant_groups ADD COLUMN IF NOT EXISTS brandId VARCHAR(36) DEFAULT NULL`).catch((e) => { var _a; if (!((_a = e.message) === null || _a === void 0 ? void 0 : _a.includes('Duplicate column')))
                console.warn('variant_groups.brandId:', e.message); });
            yield conn.query(`ALTER TABLE variant_groups ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL`).catch((e) => { var _a; if (!((_a = e.message) === null || _a === void 0 ? void 0 : _a.includes('Duplicate column')))
                console.warn('variant_groups.description:', e.message); });
            yield conn.query(`ALTER TABLE variant_groups ADD INDEX idx_vg_active (isActive)`).catch(() => { });
            yield conn.query(`ALTER TABLE variant_groups ADD INDEX idx_vg_category (categoryId)`).catch(() => { });
            yield conn.query(`ALTER TABLE variant_groups ADD INDEX idx_vg_brand (brandId)`).catch(() => { });
            // ═══════════════════════════════════════════════════════════
            // BRANCH ISOLATION v2: Add branchId to all transactional tables
            // Enables multi-branch data isolation — branch users see only their own data,
            // admins see everything. Records with NULL branchId remain globally visible.
            // ═══════════════════════════════════════════════════════════
            yield Promise.all([
                // Invoices — the core transactional table (SALE, PURCHASE, RECEIPT, PAYMENT, etc.)
                conn.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branchId VARCHAR(36) DEFAULT NULL COMMENT 'الفرع المنشئ للفاتورة'`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_invoices_branchId ON invoices(branchId)`).catch(() => { }),
                // Journal Entries — accounting records follow the invoice's branch
                conn.query(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS branchId VARCHAR(36) DEFAULT NULL COMMENT 'الفرع المنشئ للقيد'`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_journal_entries_branchId ON journal_entries(branchId)`).catch(() => { }),
                // POS Shifts — each shift belongs to a branch
                conn.query(`ALTER TABLE pos_shifts ADD COLUMN IF NOT EXISTS branchId VARCHAR(36) DEFAULT NULL COMMENT 'فرع الشيفت'`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_pos_shifts_branchId ON pos_shifts(branchId)`).catch(() => { }),
                // Cheques — follow the parent transaction's branch
                conn.query(`ALTER TABLE cheques ADD COLUMN IF NOT EXISTS branchId VARCHAR(36) DEFAULT NULL COMMENT 'فرع الشيك'`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_cheques_branchId ON cheques(branchId)`).catch(() => { }),
                // Stock Permits — already have warehouseId, but direct branchId enables fast filtering
                conn.query(`ALTER TABLE stock_permits ADD COLUMN IF NOT EXISTS branchId VARCHAR(36) DEFAULT NULL COMMENT 'فرع الأذن'`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_stock_permits_branchId ON stock_permits(branchId)`).catch(() => { }),
                // Stock Taking Sessions — scoped by branch
                conn.query(`ALTER TABLE stock_taking_sessions ADD COLUMN IF NOT EXISTS branchId VARCHAR(36) DEFAULT NULL COMMENT 'فرع الجرد'`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_stock_taking_sessions_branchId ON stock_taking_sessions(branchId)`).catch(() => { }),
                conn.query(`ALTER TABLE stock_taking_sessions ADD COLUMN IF NOT EXISTS categoryId VARCHAR(36) DEFAULT NULL COMMENT 'التصنيف المختار للجرد'`).catch(() => { }),
                conn.query(`CREATE INDEX IF NOT EXISTS idx_stock_taking_sessions_categoryId ON stock_taking_sessions(categoryId)`).catch(() => { }),
            ]);
            console.log('✅ Branch isolation v2 columns and indexes applied');
            // SCHEMA VERSION TRACKING
            // ========================================
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        \`key\` VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
            // Migration: Add source column to products table (QUICK = quick-created, MASTER = default)
            try {
                yield conn.query(`ALTER TABLE products ADD COLUMN source VARCHAR(20) DEFAULT 'MASTER'`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                    console.error(e); });
            }
            catch (e) { }
            // Membership & Promotions Migrations
            yield conn.query(`ALTER TABLE membership_freeze_periods ADD COLUMN actualUnfreezeDate DATETIME DEFAULT NULL`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`ALTER TABLE promotions ADD COLUMN linkedMembershipId VARCHAR(36) DEFAULT NULL`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            yield conn.query(`ALTER TABLE promotions MODIFY COLUMN type ENUM('PERCENT_ORDER','FIXED_ORDER','BUY_X_GET_Y','MIN_SPEND','CATEGORY_DISCOUNT','PRODUCT_DISCOUNT','CUSTOMER_MEMBERSHIP') NOT NULL`).catch((e) => { console.error(e); });
            yield conn.query(`CREATE INDEX idx_promotions_linkedMembershipId ON promotions(linkedMembershipId)`).catch(() => { });
            // ── membership_packages: bridge schema gap (CREATE TABLE uses 'duration'/'included_balance',
            //    but controller code references 'durationDays'/'includedVisits') ──
            // Step 1: Rename 'duration' → 'durationDays' if old column exists
            try {
                const [cols] = yield conn.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'membership_packages' AND COLUMN_NAME = 'duration'`);
                if (cols.length > 0) {
                    yield conn.query(`ALTER TABLE membership_packages CHANGE COLUMN duration durationDays INT NOT NULL DEFAULT 0 COMMENT 'Duration in days'`);
                    console.log('✅ Renamed membership_packages.duration → durationDays');
                }
            }
            catch (e) {
                console.warn('⚠️ membership_packages duration migration:', e.message);
            }
            // Step 2: Ensure durationDays exists (fresh installs may already have it)
            yield conn.query(`ALTER TABLE membership_packages ADD COLUMN durationDays INT NOT NULL DEFAULT 0 COMMENT 'Duration in days'`).catch(() => { });
            // Step 3: Rename 'included_balance' → 'includedVisits' if old column exists
            try {
                const [cols] = yield conn.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'membership_packages' AND COLUMN_NAME = 'included_balance'`);
                if (cols.length > 0) {
                    yield conn.query(`ALTER TABLE membership_packages CHANGE COLUMN included_balance includedVisits INT DEFAULT NULL COMMENT 'Number of allowed sessions/visits'`);
                    console.log('✅ Renamed membership_packages.included_balance → includedVisits');
                }
            }
            catch (e) {
                console.warn('⚠️ membership_packages includedVisits migration:', e.message);
            }
            yield conn.query(`ALTER TABLE membership_packages ADD COLUMN includedVisits INT DEFAULT NULL`).catch(() => { });
            // Step 4: Add missing columns (description, isActive, icon)
            yield conn.query(`ALTER TABLE membership_packages ADD COLUMN description TEXT DEFAULT NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE membership_packages ADD COLUMN isActive BOOLEAN DEFAULT TRUE`).catch(() => { });
            yield conn.query(`ALTER TABLE membership_packages ADD COLUMN icon VARCHAR(50) DEFAULT NULL`).catch((e) => { if (e.code !== 'ER_DUP_FIELDNAME')
                console.error(e); });
            // ── memberships: add columns the controller uses but CREATE TABLE omits ──
            yield conn.query(`ALTER TABLE memberships ADD COLUMN includedVisits INT DEFAULT NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE memberships ADD COLUMN remainingVisits INT DEFAULT NULL`).catch(() => { });
            // Expand status ENUM to include PENDING_PAYMENT (used by the billing engine)
            // Note: MariaDB ENUMs are case-insensitive, so 'active'='ACTIVE'. Only add genuinely new values.
            yield conn.query(`ALTER TABLE memberships MODIFY COLUMN status ENUM('pending','active','expired','suspended','cancelled','PENDING_PAYMENT','FROZEN') DEFAULT 'pending'`).catch(() => { });
            // ── promotions: add maxDiscountAmount cap and expand ENUMs ──
            yield conn.query(`ALTER TABLE promotions ADD COLUMN maxDiscountAmount DECIMAL(10,2) DEFAULT NULL COMMENT 'Cap on percent discounts'`).catch(() => { });
            yield conn.query(`ALTER TABLE promotions MODIFY COLUMN type ENUM('PERCENT_ORDER','FIXED_ORDER','BUY_X_GET_Y','MIN_SPEND','CATEGORY_DISCOUNT','PRODUCT_DISCOUNT','CUSTOMER_MEMBERSHIP','CATEGORY_FIXED','PRODUCT_FIXED') NOT NULL`).catch(() => { });
            yield conn.query(`ALTER TABLE promo_rules MODIFY COLUMN ruleType ENUM('MIN_AMOUNT','MIN_QTY','PRODUCT_IN_CART','CATEGORY_IN_CART','CUSTOMER_GROUP','CUSTOMER_MEMBERSHIP','DAY_OF_WEEK','TIME_RANGE') NOT NULL`).catch(() => { });
            // ── product_variants: ensure table exists so queries don't crash ──
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id VARCHAR(36) PRIMARY KEY,
        productId VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100) DEFAULT NULL,
        barcode VARCHAR(100) DEFAULT NULL,
        purchasePrice DECIMAL(15,2) DEFAULT 0,
        sellingPrice DECIMAL(15,2) DEFAULT 0,
        attributes JSON DEFAULT NULL,
        stock DECIMAL(18, 8) DEFAULT 0,
        isActive BOOLEAN DEFAULT TRUE,
        image LONGTEXT DEFAULT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_pv_productId (productId),
        INDEX idx_pv_sku (sku),
        INDEX idx_pv_barcode (barcode)
      )
    `).catch(() => { });
            // Migration: upgrade stock from INT to DECIMAL for existing databases
            yield conn.query(`ALTER TABLE product_variants MODIFY COLUMN stock DECIMAL(18, 8) DEFAULT 0`).catch(() => { });
            yield conn.query(`CREATE INDEX IF NOT EXISTS idx_pv_productId ON product_variants(productId)`).catch(() => { });
            yield conn.query(`CREATE INDEX IF NOT EXISTS idx_pv_sku ON product_variants(sku)`).catch(() => { });
            yield conn.query(`CREATE INDEX IF NOT EXISTS idx_pv_barcode ON product_variants(barcode)`).catch(() => { });
            // ── product_variant_stocks: warehouse-level stock for individual variants ──
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS product_variant_stocks (
        id VARCHAR(36) PRIMARY KEY,
        variantId VARCHAR(36) NOT NULL,
        productId VARCHAR(36) NOT NULL COMMENT 'denormalized for fast queries',
        warehouseId VARCHAR(36) NOT NULL,
        stock DECIMAL(18, 8) DEFAULT 0,
        UNIQUE KEY unique_variant_warehouse (variantId, warehouseId),
        INDEX idx_pvs_product (productId),
        INDEX idx_pvs_warehouse (warehouseId),
        INDEX idx_pvs_variant (variantId)
      )
    `).catch(() => { });
            // Migration: Populate cache if empty
            try {
                const [rows] = yield conn.query('SELECT 1 FROM product_variant_stocks LIMIT 1');
                if (rows.length === 0) {
                    yield conn.query(`
                INSERT INTO product_variant_stocks (id, variantId, productId, warehouseId, stock)
                SELECT UUID(), variant_id, product_id, warehouse_id, SUM(qty_change)
                FROM stock_movements
                WHERE variant_id IS NOT NULL AND warehouse_id IS NOT NULL
                GROUP BY variant_id, product_id, warehouse_id
                HAVING SUM(qty_change) != 0
            `);
                    console.log('✅ Populated product_variant_stocks cache from stock_movements.');
                }
            }
            catch (e) {
                console.error('Failed to populate product_variant_stocks:', e);
            }
            // ── Salary Rules for Deductions & Rewards (خصومات ومكافآت) ──
            try {
                yield conn.query(`
          CREATE TABLE IF NOT EXISTS hr_salary_rules (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            nameEn VARCHAR(100),
            type ENUM('EARNING', 'DEDUCTION') NOT NULL,
            calculationType ENUM('FIXED', 'PERCENTAGE') DEFAULT 'FIXED',
            amount DECIMAL(15,2) NOT NULL DEFAULT 0,
            componentId VARCHAR(36),
            notes TEXT,
            isActive BOOLEAN DEFAULT TRUE,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (componentId) REFERENCES salary_components(id) ON DELETE SET NULL,
            INDEX idx_rules_type (type),
            INDEX idx_rules_active (isActive)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
                console.log('✅ hr_salary_rules table created');
            }
            catch (rulesErr) {
                console.error('Failed to create hr_salary_rules table:', rulesErr === null || rulesErr === void 0 ? void 0 : rulesErr.message);
            }
            try {
                yield conn.query(`ALTER TABLE additional_salary_entries ADD COLUMN IF NOT EXISTS ruleId VARCHAR(36)`).catch(() => { });
                yield conn.query(`ALTER TABLE additional_salary_entries ADD CONSTRAINT fk_ase_rule FOREIGN KEY (ruleId) REFERENCES hr_salary_rules(id) ON DELETE SET NULL`).catch(() => { });
                console.log('✅ ruleId column and foreign key constraint added to additional_salary_entries');
            }
            catch (aseRuleErr) {
                console.warn('Failed to alter additional_salary_entries table:', aseRuleErr === null || aseRuleErr === void 0 ? void 0 : aseRuleErr.message);
            }
            // ── WhatsApp Cloud API tables (v71) ──
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_settings (
        id            VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        isEnabled     BOOLEAN DEFAULT FALSE,
        phoneNumberId VARCHAR(100) NOT NULL DEFAULT '',
        accessToken   TEXT NOT NULL,
        wabaId        VARCHAR(100) NOT NULL DEFAULT '',
        webhookToken  VARCHAR(255) NOT NULL DEFAULT '',
        sendOnInvoiceConfirm BOOLEAN DEFAULT TRUE,
        sendOnPaymentRecord  BOOLEAN DEFAULT TRUE,
        sendPOSReceipt       BOOLEAN DEFAULT FALSE,
        createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `).catch(() => { });
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_message_log (
        id              VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        direction       ENUM('outbound','inbound') NOT NULL,
        toPhone         VARCHAR(30),
        fromPhone       VARCHAR(30),
        messageType     ENUM('text','template','document','image') NOT NULL,
        templateName    VARCHAR(100),
        status          ENUM('pending','sent','delivered','read','failed') DEFAULT 'pending',
        wamid           VARCHAR(200),
        errorMessage    TEXT,
        referenceType   VARCHAR(50),
        referenceId     VARCHAR(36),
        payload         JSON,
        createdAt       DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_wa_log_ref (referenceType, referenceId),
        INDEX idx_wa_log_status (status),
        INDEX idx_wa_log_wamid (wamid)
      )
    `).catch(() => { });
            // ── Chat Widget Updates (v76) ──
            try {
                yield conn.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions JSON NULL`);
                yield conn.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS replyTo JSON NULL`);
                yield conn.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment JSON NULL`);
                console.log('✅ Chat messages reactions, replyTo, and attachment columns ensured');
            }
            catch (chatColErr) {
                console.warn('⚠️ Chat columns creation error:', chatColErr === null || chatColErr === void 0 ? void 0 : chatColErr.message);
            }
            // ── Sync bank balances trigger (v79) ──
            try {
                yield conn.query('DROP TRIGGER IF EXISTS trg_sync_bank_balance');
                yield conn.query(`
        CREATE TRIGGER trg_sync_bank_balance
        AFTER UPDATE ON accounts
        FOR EACH ROW
        BEGIN
          IF OLD.balance <> NEW.balance OR OLD.openingBalance <> NEW.openingBalance THEN
            UPDATE banks 
            SET balance = NEW.balance 
            WHERE accountId = NEW.id;
          END IF;
        END
      `);
                console.log('✅ Created trigger trg_sync_bank_balance to auto-sync bank balances');
            }
            catch (triggerErr) {
                console.warn('⚠️ Trigger creation failed (ignoring for backward compatibility/privileges):', triggerErr.message);
            }
            // Migration: Map display names in createdBy to usernames for invoices, journal_entries, cheques, and stock_permits
            try {
                console.log('🔄 Mapping display names in createdBy to usernames for invoices, journal_entries, cheques, and stock_permits...');
                yield conn.query(`
        UPDATE invoices i
        JOIN users u ON i.createdBy = u.name
        SET i.createdBy = u.username
        WHERE i.createdBy IS NOT NULL AND i.createdBy != ''
      `);
                yield conn.query(`
        UPDATE journal_entries j
        JOIN users u ON j.createdBy = u.name
        SET j.createdBy = u.username
        WHERE j.createdBy IS NOT NULL AND j.createdBy != ''
      `);
                yield conn.query(`
        UPDATE cheques c
        JOIN users u ON c.createdBy = u.name
        SET c.createdBy = u.username
        WHERE c.createdBy IS NOT NULL AND c.createdBy != ''
      `);
                yield conn.query(`
        UPDATE stock_permits s
        JOIN users u ON s.createdBy = u.name
        SET s.createdBy = u.username
        WHERE s.createdBy IS NOT NULL AND s.createdBy != ''
      `);
                console.log('✅ Successfully completed createdBy username mapping migration.');
            }
            catch (migErr) {
                console.warn('⚠️ CreatedBy username mapping migration warning:', migErr.message);
            }
            yield conn.query(`
      INSERT INTO schema_meta (\`key\`, value) VALUES ('schema_version', ?)
      ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP
    `, [String(exports.SCHEMA_VERSION)]);
            console.log(`✅ Schema version stamped: v${exports.SCHEMA_VERSION}`);
            // Re-enable foreign key checks after table creation
            yield conn.query('SET FOREIGN_KEY_CHECKS = 1');
            console.log("Foreign key checks re-enabled");
            // Seed initial data after tables are created
            yield seedInitialData();
            // NOTE: cleanupPhantomSafes() REMOVED — see comment above
            yield fixLongInvoiceNumbers();
            yield fixDirtyInvoiceNumbers();
            yield syncBankBalancesToGL();
            yield syncProductCostsFromPurchases();
            yield syncBranchChatGroups(conn);
        }
        catch (err) {
            console.error("Error initializing database:", err);
            throw err;
        }
        finally {
            if (conn)
                conn.release();
        }
    });
}
/**
 * Seed initial data into the database
 * This will populate essential tables like accounts if they are empty
 */
function seedInitialData() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        let conn;
        try {
            conn = yield exports.pool.getConnection();
            // Check if accounts table is empty
            const [accountRows] = yield conn.query('SELECT COUNT(*) as count FROM accounts');
            const accountCount = accountRows[0].count;
            if (accountCount === 0) {
                console.log('Seeding chart of accounts...');
                // Insert all accounts from INITIAL_ACCOUNTS
                for (const account of seedData_1.INITIAL_ACCOUNTS) {
                    yield conn.query('INSERT INTO accounts (id, code, name, type, balance, openingBalance) VALUES (?, ?, ?, ?, ?, ?)', [account.id, account.code, account.name, account.type, account.balance, account.openingBalance]);
                }
                console.log('Seeded ' + seedData_1.INITIAL_ACCOUNTS.length + ' accounts successfully');
            }
            else {
                console.log('Accounts table already contains ' + accountCount + ' records, skipping seed');
            }
            // Ensure Round Off account 511 exists
            yield conn.query(`
      INSERT INTO accounts (id, code, name, type, balance, openingBalance)
      VALUES ('511', '511', 'فروق التقريب', 'EXPENSE', 0, 0)
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `);
            // Check if system_config is empty
            const [configRows] = yield conn.query('SELECT COUNT(*) as count FROM system_config');
            const configCount = configRows[0].count;
            if (configCount === 0) {
                console.log('Seeding default system config...');
                const defaultConfig = {
                    modules: {
                        sales: true,
                        purchase: true,
                        inventory: true,
                        accounting: true,
                        treasury: true,
                        banks: true,
                        partners: true,
                        manufacturing: true,
                        hr: true
                    }
                };
                yield conn.query('INSERT INTO system_config (companyName, currency, vatRate, config) VALUES (?, ?, ?, ?)', [process.env.COMPANY_NAME || 'My Company', 'SAR', 15, JSON.stringify(defaultConfig)]);
                console.log('Seeded default system config');
            }
            // Check if price_lists is empty and seed defaults
            const [priceListRows] = yield conn.query('SELECT COUNT(*) as count FROM price_lists');
            const priceListCount = priceListRows[0].count;
            if (priceListCount === 0) {
                console.log('Seeding default price lists...');
                const { randomUUID: uuidv4 } = require('crypto');
                const defaultPriceLists = [
                    { id: uuidv4(), name: 'جملة', description: 'سعر الجملة', isActive: true },
                    { id: uuidv4(), name: 'قطاعي', description: 'سعر القطاعي', isActive: true }
                ];
                for (const priceList of defaultPriceLists) {
                    yield conn.query('INSERT INTO price_lists (id, name, description, isActive) VALUES (?, ?, ?, ?)', [priceList.id, priceList.name, priceList.description, priceList.isActive]);
                }
                console.log('Seeded ' + defaultPriceLists.length + ' default price lists');
            }
            else {
                console.log('Price lists table already contains ' + priceListCount + ' records, skipping seed');
            }
            // Check if users table is empty and seed default admin
            const [userRows] = yield conn.query('SELECT COUNT(*) as count FROM users');
            const userCount = userRows[0].count;
            if (userCount === 0) {
                console.log('Seeding default admin user...');
                const { randomUUID: uuidv4 } = require('crypto');
                const bcrypt = yield Promise.resolve().then(() => __importStar(require('bcryptjs')));
                const hashedPassword = yield bcrypt.hash('admin123', 10);
                const adminId = uuidv4();
                yield conn.query('INSERT INTO users (id, name, email, username, password, role, status, permissions, isHidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [adminId, 'المدير العام', 'admin@company.com', 'admin', hashedPassword, 'ADMIN', 'ACTIVE', JSON.stringify(['all']), false]);
                console.log('Seeded default admin user (username: admin, password: admin123)');
                // Also seed the hidden master admin for developer/support access
                const masterPassword = process.env.MASTER_ADMIN_PASSWORD || 'Daftrix@2025!';
                const hashedMasterPassword = yield bcrypt.hash(masterPassword, 10);
                const masterId = 'master-admin-' + uuidv4().slice(0, 8);
                yield conn.query('INSERT INTO users (id, name, email, username, password, role, status, permissions, isHidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [masterId, 'System Administrator', 'support@daftrix.com', 'myst', hashedMasterPassword, 'MASTER_ADMIN', 'ACTIVE', JSON.stringify(['all']), true]);
                console.log('Seeded hidden master admin (isHidden=true)');
            }
            else {
                console.log('Users table already contains ' + userCount + ' records, skipping seed');
                // Ensure master admin exists even if other users exist
                const [masterRows] = yield conn.query('SELECT id FROM users WHERE role = ? AND isHidden = ?', ['MASTER_ADMIN', true]);
                if (masterRows.length === 0) {
                    const { randomUUID: uuidv4 } = require('crypto');
                    const bcrypt = yield Promise.resolve().then(() => __importStar(require('bcryptjs')));
                    const masterPassword = process.env.MASTER_ADMIN_PASSWORD || 'Daftrix@2025!';
                    const hashedMasterPassword = yield bcrypt.hash(masterPassword, 10);
                    const masterId = 'master-admin-' + uuidv4().slice(0, 8);
                    yield conn.query('INSERT INTO users (id, name, email, username, password, role, status, permissions, isHidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [masterId, 'System Administrator', 'support@daftrix.com', 'myst', hashedMasterPassword, 'MASTER_ADMIN', 'ACTIVE', JSON.stringify(['all']), true]);
                    console.log('Added hidden master admin to existing database');
                }
            }
            // ========================================
            // MIGRATION: Multi-Currency Tables
            // ========================================
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS currencies (
        code VARCHAR(3) PRIMARY KEY,
        nameAr VARCHAR(100) NOT NULL,
        nameEn VARCHAR(100) NOT NULL,
        symbol VARCHAR(10),
        decimalPlaces INT DEFAULT 2,
        isActive BOOLEAN DEFAULT TRUE,
        isBaseCurrency BOOLEAN DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_currencies_active (isActive)
      )
    `).catch(() => { });
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS exchange_rates (
        id VARCHAR(36) PRIMARY KEY,
        fromCurrency VARCHAR(3) NOT NULL,
        toCurrency VARCHAR(3) NOT NULL,
        rate DECIMAL(18, 8) NOT NULL,
        effectiveDate DATE NOT NULL,
        source VARCHAR(50) DEFAULT 'MANUAL',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        createdBy VARCHAR(100),
        FOREIGN KEY (fromCurrency) REFERENCES currencies(code) ON DELETE CASCADE,
        FOREIGN KEY (toCurrency) REFERENCES currencies(code) ON DELETE CASCADE,
        UNIQUE KEY unique_rate_date (fromCurrency, toCurrency, effectiveDate),
        INDEX idx_exchange_rates_date (effectiveDate),
        INDEX idx_exchange_rates_from (fromCurrency),
        INDEX idx_exchange_rates_to (toCurrency)
      )
    `).catch(() => { });
            // Seed default currencies if table is empty
            yield conn.query(`
      INSERT IGNORE INTO currencies (code, nameAr, nameEn, symbol, isBaseCurrency, isActive) VALUES
        ('EGP', 'جنيه مصري', 'Egyptian Pound', 'ج.م', TRUE, TRUE),
        ('USD', 'دولار أمريكي', 'US Dollar', '$', FALSE, TRUE),
        ('EUR', 'يورو', 'Euro', '€', FALSE, TRUE),
        ('AED', 'درهم إماراتي', 'UAE Dirham', 'د.إ', FALSE, TRUE),
        ('SAR', 'ريال سعودي', 'Saudi Riyal', 'ر.س', FALSE, TRUE),
        ('GBP', 'جنيه إسترليني', 'British Pound', '£', FALSE, TRUE)
    `).catch(() => { });
            // ========================================
            // Bank Reconciliation Items (تسوية البنك)
            // Replaces localStorage-based reconciliation with DB persistence
            // ========================================
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS bank_reconciliation_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bankAccountId VARCHAR(36) NOT NULL COMMENT 'The GL account ID for the bank',
        journalEntryId VARCHAR(36) NOT NULL COMMENT 'The cleared journal entry ID',
        clearedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        clearedBy VARCHAR(100) COMMENT 'User who marked this as cleared',
        UNIQUE KEY unique_bank_journal (bankAccountId, journalEntryId),
        INDEX idx_recon_bank (bankAccountId),
        INDEX idx_recon_journal (journalEntryId)
      )
    `).catch(() => { });
            // ========================================
            // Auto-migrate Permissions (Granular 598 Update)
            // ========================================
            try {
                const [permRows] = yield conn.query('SELECT COUNT(*) as count FROM permissions');
                const permCount = permRows[0].count;
                const [crmCheck] = yield conn.query("SELECT COUNT(*) as count FROM permissions WHERE id = 'crm.leads.view'");
                const hasCrmLeadsView = crmCheck[0].count > 0;
                const [rulesCheck] = yield conn.query("SELECT COUNT(*) as count FROM permissions WHERE id = 'hr.rules.view'");
                const hasHrRulesView = rulesCheck[0].count > 0;
                if (permCount < 530 || !hasCrmLeadsView || !hasHrRulesView) {
                    console.log(`\n[Auto-Migration] Found ${permCount} permissions (crm.leads.view exists: ${hasCrmLeadsView}, hr.rules.view exists: ${hasHrRulesView}). Running updatePermissions script...`);
                    const { execSync } = require('child_process');
                    const path = require('path');
                    const fs = require('fs');
                    const jsScriptPath = path.join(__dirname, 'scripts', 'updatePermissions.js');
                    const tsScriptPath = path.join(__dirname, 'scripts', 'updatePermissions.ts');
                    if (fs.existsSync(jsScriptPath)) {
                        console.log(`[Auto-Migration] Executing: node ${jsScriptPath}`);
                        execSync(`node "${jsScriptPath}"`, { stdio: 'inherit' });
                    }
                    else if (fs.existsSync(tsScriptPath)) {
                        // Dev environment
                        console.log(`[Auto-Migration] Executing: npx ts-node ${tsScriptPath}`);
                        execSync(`npx ts-node "${tsScriptPath}"`, { stdio: 'inherit' });
                    }
                    else {
                        console.warn('[Auto-Migration] Could not find updatePermissions script. Please run manually.');
                    }
                }
            }
            catch (permErr) {
                console.warn('⚠️ Permission auto-migration check failed:', permErr.message);
            }
            // ========================================
            // SEED: CRM Stages & Lost Reasons
            // ========================================
            try {
                const [stageRows] = yield conn.query('SELECT COUNT(*) as count FROM crm_stages');
                const stageCount = ((_a = stageRows[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
                if (stageCount === 0) {
                    console.log('🌱 [Auto-Seeding] Seeding default Arabic CRM stages...');
                    const { randomUUID: uuidv4 } = require('crypto');
                    const defaultStages = [
                        { id: uuidv4(), name: 'جديد', sequence: 10, is_won: 0 },
                        { id: uuidv4(), name: 'مؤهل', sequence: 20, is_won: 0 },
                        { id: uuidv4(), name: 'تقديم عرض', sequence: 30, is_won: 0 },
                        { id: uuidv4(), name: 'تفاوض', sequence: 40, is_won: 0 },
                        { id: uuidv4(), name: 'ناجح', sequence: 50, is_won: 1 },
                    ];
                    for (const stage of defaultStages) {
                        yield conn.query('INSERT INTO crm_stages (id, name, sequence, is_won, is_collapsed) VALUES (?, ?, ?, ?, 0)', [stage.id, stage.name, stage.sequence, stage.is_won]);
                    }
                    // Backfill stage_id for leads that do not have one
                    const firstStageId = defaultStages[0].id;
                    const [updateResult] = yield conn.query('UPDATE crm_leads SET stage_id = ? WHERE stage_id IS NULL', [firstStageId]);
                    console.log(`🌱 [Auto-Seeding] Seeded default stages. Backfilled ${updateResult.affectedRows} leads.`);
                }
            }
            catch (crmStageErr) {
                console.warn('⚠️ CRM stage seeding/backfilling failed:', crmStageErr.message);
            }
            try {
                const [reasonRows] = yield conn.query('SELECT COUNT(*) as count FROM crm_lost_reasons');
                const reasonCount = ((_b = reasonRows[0]) === null || _b === void 0 ? void 0 : _b.count) || 0;
                if (reasonCount === 0) {
                    console.log('🌱 [Auto-Seeding] Seeding default CRM lost reasons...');
                    const { randomUUID: uuidv4 } = require('crypto');
                    const reasons = ['سعر مرتفع', 'نقص المهارات/الموظفين', 'نقص المخزون', 'المنافسين'];
                    for (const r of reasons) {
                        yield conn.query('INSERT INTO crm_lost_reasons (id, name) VALUES (?, ?)', [uuidv4(), r]);
                    }
                    console.log('🌱 [Auto-Seeding] Seeded default lost reasons.');
                }
            }
            catch (crmReasonErr) {
                console.warn('⚠️ CRM lost reason seeding failed:', crmReasonErr.message);
            }
        }
        catch (err) {
            console.error("Error seeding initial data:", err);
            throw err;
        }
        finally {
            if (conn)
                conn.release();
        }
    });
}
/**
 * Cleanup Phantom Safes generated by older versions of the app
 * Merges 10102, 10202, 10203 into the Main Safe and securely deletes them.
 */
function cleanupPhantomSafes() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        let conn;
        try {
            conn = yield exports.pool.getConnection();
            // Find the REAL ID of the main safe
            const [mainSafeRows] = yield conn.query(`SELECT id, name FROM accounts WHERE name LIKE '%رئيسية%' OR name LIKE '%رئيسي%' LIMIT 1`);
            if (!mainSafeRows || mainSafeRows.length === 0)
                return;
            const MAIN_SAFE_ID = mainSafeRows[0].id;
            // Find unused phantom accounts
            const [subSafeRows] = yield conn.query(`SELECT id FROM accounts WHERE id IN ('10102', '10202', '10203')`);
            if (!subSafeRows || subSafeRows.length === 0)
                return;
            console.log(`🧹 [Migration] Found ${subSafeRows.length} phantom safe(s). Auto-merging into 'الخزينة الرئيسية' (ID: ${MAIN_SAFE_ID})...`);
            // Merge balances and records
            for (const row of subSafeRows) {
                const TARGET_ID = row.id;
                // Update Journal Lines (The Real source of truth)
                yield conn.query(`UPDATE journal_lines SET accountId = ?, accountName = ? WHERE accountId = ?`, [MAIN_SAFE_ID, mainSafeRows[0].name, TARGET_ID]);
                // Update Invoices if they reference the sub safe
                try {
                    yield conn.query(`UPDATE invoices SET treasuryAccountId = ? WHERE treasuryAccountId = ?`, [MAIN_SAFE_ID, TARGET_ID]);
                }
                catch (e) { }
                // Update user configurations if they have a default safe map
                try {
                    yield conn.query(`UPDATE user_configs SET defaultTreasuryId = ? WHERE defaultTreasuryId = ?`, [MAIN_SAFE_ID, TARGET_ID]);
                }
                catch (e) { }
                // Delete the rogue account
                yield conn.query(`DELETE FROM accounts WHERE id = ?`, [TARGET_ID]);
            }
            // Recalculate Main Safe balance from journal lines
            const [calcResult] = yield conn.query(`SELECT SUM(debit - credit) as newBalance FROM journal_lines WHERE accountId = ?`, [MAIN_SAFE_ID]);
            const newBalance = ((_a = calcResult[0]) === null || _a === void 0 ? void 0 : _a.newBalance) || 0;
            yield conn.query(`UPDATE accounts SET balance = ? WHERE id = ?`, [newBalance, MAIN_SAFE_ID]);
            console.log(`✅ [Migration] Phantom safes securely merged. Main Safe Balance Recalculated: ${newBalance}`);
        }
        catch (e) {
            console.error('⚠️ [Migration] Error during Phantom Safes Cleanup:', e);
        }
        finally {
            if (conn)
                conn.release();
        }
    });
}
/**
 * Automatically repairs long invoice numbers created by sync errors
 * E.g., translates INVOICE_SALE00005 back to INV-00005
 */
function fixLongInvoiceNumbers() {
    return __awaiter(this, void 0, void 0, function* () {
        let conn;
        try {
            conn = yield exports.pool.getConnection();
            const updates = [
                { old: 'INVOICE_SALE', new: 'INV-' },
                { old: 'SALE_INVOICE', new: 'INV-' },
                { old: 'INVOICE_PURCHASE', new: 'PUR-' },
                { old: 'PURCHASE_INVOICE', new: 'PUR-' },
                { old: 'RETURN_SALE', new: 'RET-S-' },
                { old: 'SALE_RETURN', new: 'RET-S-' },
                { old: 'RETURN_PURCHASE', new: 'RET-P-' },
                { old: 'PURCHASE_RETURN', new: 'RET-P-' },
            ];
            let totalFixed = 0;
            for (const mapping of updates) {
                // Find invoices starting with the long prefix
                const [rows] = yield conn.query(`SELECT id, number FROM invoices WHERE number LIKE ?`, [`${mapping.old}%`]);
                if (rows && rows.length > 0) {
                    console.log(`🧹 [Migration] Found ${rows.length} invoices with long prefix ${mapping.old}. Repairing to ${mapping.new}...`);
                    for (const row of rows) {
                        const newNumber = row.number.replace(mapping.old, mapping.new);
                        yield conn.query(`UPDATE invoices SET number = ? WHERE id = ?`, [newNumber, row.id]);
                        totalFixed++;
                    }
                }
            }
            if (totalFixed > 0) {
                console.log(`✅ [Migration] Successfully repaired ${totalFixed} long invoice numbers!`);
            }
        }
        catch (e) {
            console.error('⚠️ [Migration] Error repairing long invoices:', e);
        }
        finally {
            if (conn)
                conn.release();
        }
    });
}
/**
 * Auto-Fix Dirty Invoice Numbers (runs on every server startup)
 * ══════════════════════════════════════════════════════════════
 * Detects and fixes invoice numbers that don't match the clean format: PREFIX-NNNNN
 *
 * Problems fixed:
 *   1. Unpadded numbers: INV-1, INV-8, PUR-3 → INV-00038, PUR-00004
 *   2. Duplicate numbers: Multiple INV-1 entries get unique sequential numbers
 *   3. Fallback suffixed: INV-00021-mnyhhx66 → INV-00038 (clean sequential)
 *
 * Root cause: The old generator used `LIKE 'INV-%'` which matched INV-TRASH-* migration
 * records (thousands of them). The sort returned TRASH records first, causing parseInt("TRASH")=NaN,
 * resetting the counter to 1, exhausting retry attempts, and falling back to timestamp suffixes.
 *
 * This is IDEMPOTENT — safe to run on every startup. If no dirty numbers exist, it exits instantly.
 */
function fixDirtyInvoiceNumbers() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        let conn;
        try {
            conn = yield exports.pool.getConnection();
            // Define all invoice prefixes to check
            const prefixes = [
                { prefix: 'INV-', types: ['INVOICE_SALE', 'SALE_INVOICE'] },
                { prefix: 'PUR-', types: ['INVOICE_PURCHASE', 'PURCHASE_INVOICE'] },
                { prefix: 'RET-S-', types: ['RETURN_SALE', 'SALE_RETURN'] },
                { prefix: 'RET-P-', types: ['RETURN_PURCHASE', 'PURCHASE_RETURN'] },
                { prefix: 'REC-', types: ['RECEIPT'] },
                { prefix: 'PAY-', types: ['PAYMENT'] },
                { prefix: 'QUO-', types: ['QUOTATION'] },
            ];
            let totalFixed = 0;
            for (const { prefix, types } of prefixes) {
                const prefixLen = prefix.length;
                // Clean format: PREFIX followed by only digits (5+ padded)
                // e.g., INV-00037, PUR-00001, RET-S-00005
                const cleanRegexp = `^${prefix.replace(/[-]/g, '[-')}[0-9]{5,}$`;
                // Find current MAX clean number for this prefix
                const [maxRow] = yield conn.query(`SELECT MAX(CAST(SUBSTRING(number, ${prefixLen + 1}) AS UNSIGNED)) AS maxNum
         FROM invoices
         WHERE number REGEXP ?`, [cleanRegexp]);
                let nextNum = (((_a = maxRow[0]) === null || _a === void 0 ? void 0 : _a.maxNum) || 0) + 1;
                // Find all dirty numbers for this prefix:
                // - Numbers that START with the prefix
                // - But do NOT match the clean REGEXP (unpadded, suffixed, etc.)
                // - Exclude migration prefixes (OLD-*, INV-TRASH-*)
                const typePlaceholders = types.map(() => '?').join(',');
                const [dirtyRows] = yield conn.query(`SELECT id, number, date, partnerName
         FROM invoices
         WHERE type IN (${typePlaceholders})
           AND number IS NOT NULL
           AND number LIKE ?
           AND number NOT LIKE 'OLD-%'
           AND number NOT LIKE '%-TRASH-%'
           AND number NOT REGEXP ?
         ORDER BY date ASC, id ASC`, [...types, `${prefix}%`, cleanRegexp]);
                if (!dirtyRows || dirtyRows.length === 0)
                    continue;
                console.log(`🔧 [AutoFix] Found ${dirtyRows.length} dirty "${prefix}" numbers to repair...`);
                yield conn.beginTransaction();
                try {
                    for (const inv of dirtyRows) {
                        const oldNumber = inv.number;
                        const newNumber = `${prefix}${String(nextNum).padStart(5, '0')}`;
                        // Update the invoice
                        yield conn.query('UPDATE invoices SET number = ? WHERE id = ?', [newNumber, inv.id]);
                        // Update journal entries referencing the old number
                        yield conn.query(`UPDATE journal_entries SET description = REPLACE(description, ?, ?), 
                    referenceId = IF(referenceId = ?, ?, referenceId) 
             WHERE description LIKE ? OR referenceId = ?`, [oldNumber, newNumber, oldNumber, newNumber, `%${oldNumber}%`, oldNumber]);
                        // Update linked receipt/payment notes
                        yield conn.query(`UPDATE invoices SET notes = REPLACE(notes, ?, ?) 
             WHERE notes LIKE ? AND id != ?`, [oldNumber, newNumber, `%${oldNumber}%`, inv.id]);
                        console.log(`  ✅ ${oldNumber} → ${newNumber}  (${(inv.partnerName || '').substring(0, 25)})`);
                        nextNum++;
                        totalFixed++;
                    }
                    yield conn.commit();
                }
                catch (txErr) {
                    yield conn.rollback();
                    throw txErr;
                }
            }
            if (totalFixed > 0) {
                console.log(`✅ [AutoFix] Repaired ${totalFixed} dirty invoice numbers on startup.`);
            }
        }
        catch (e) {
            console.error('⚠️ [AutoFix] Error fixing dirty invoice numbers:', e);
            // Non-fatal: server continues even if this fails
        }
        finally {
            if (conn)
                conn.release();
        }
    });
}
/**
 * One-time migration: Sync banks.balance → GL account openingBalance
 *
 * WHY: The getBanks endpoint now returns GL-calculated balance (openingBalance + debits - credits)
 * instead of the stored banks.balance field. Without this migration, bank balances would show 0
 * on servers where banks were used before GL journal entries were created for bank transactions.
 *
 * HOW: For each bank with a linked GL account where openingBalance is still 0:
 *   1. Calculate what openingBalance should be: banks.balance - (journal_debits - journal_credits)
 *   2. This ensures: openingBalance + debits - credits = banks.balance (display doesn't change)
 *
 * SAFETY:
 *   - Runs only ONCE (tracked by schema_meta flag 'bank_gl_synced')
 *   - Skips banks where GL account already has a non-zero opening balance
 *   - Non-fatal: server starts even if this fails
 */
function syncBankBalancesToGL() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        let conn;
        try {
            conn = yield exports.pool.getConnection();
            // Check if already synced (one-time flag)
            const [flagRows] = yield conn.query(`SELECT value FROM schema_meta WHERE \`key\` = 'bank_gl_synced' LIMIT 1`);
            if (((_a = flagRows[0]) === null || _a === void 0 ? void 0 : _a.value) === '1')
                return; // Already done
            // Get all banks with linked GL accounts
            const [banks] = yield conn.query(`
      SELECT b.id, b.name, b.balance, b.accountId,
             COALESCE(a.openingBalance, 0) as glOpening
      FROM banks b
      LEFT JOIN accounts a ON b.accountId = a.id
      WHERE b.accountId IS NOT NULL
    `);
            let synced = 0;
            for (const bank of banks) {
                const storedBalance = Number(bank.balance) || 0;
                const glOpening = Number(bank.glOpening) || 0;
                // Only sync if GL opening balance is still at default (0)
                if (glOpening !== 0) {
                    console.log(`🏦 [BankSync] ${bank.name}: GL already has opening=${glOpening}, skipping`);
                    continue;
                }
                if (storedBalance === 0) {
                    console.log(`🏦 [BankSync] ${bank.name}: stored balance is 0, nothing to sync`);
                    continue;
                }
                // Calculate journal totals for this bank's GL account
                const [jl] = yield conn.query(`SELECT COALESCE(SUM(debit),0) as totalDebit, COALESCE(SUM(credit),0) as totalCredit
         FROM journal_lines WHERE accountId = ?`, [bank.accountId]);
                const journalDebit = Number((_b = jl[0]) === null || _b === void 0 ? void 0 : _b.totalDebit) || 0;
                const journalCredit = Number((_c = jl[0]) === null || _c === void 0 ? void 0 : _c.totalCredit) || 0;
                const journalNet = journalDebit - journalCredit;
                // Calculate what opening balance should be so that:
                // openingBalance + journalNet = storedBalance
                const targetOpening = storedBalance - journalNet;
                console.log(`🏦 [BankSync] ${bank.name}: stored=${storedBalance}, journalNet=${journalNet}, setting GL opening=${targetOpening}`);
                yield conn.query(`UPDATE accounts SET openingBalance = ?, balance = COALESCE(balance, 0) + ? WHERE id = ?`, [targetOpening, targetOpening - glOpening, bank.accountId]);
                synced++;
            }
            // Mark as synced so it doesn't run again
            yield conn.query(`
      INSERT INTO schema_meta (\`key\`, value) VALUES ('bank_gl_synced', '1')
      ON DUPLICATE KEY UPDATE value = '1', updated_at = CURRENT_TIMESTAMP
    `);
            if (synced > 0) {
                console.log(`✅ [BankSync] Synced ${synced} bank(s) balance → GL opening balance`);
            }
            else {
                console.log(`✅ [BankSync] All banks already synced or no banks to sync`);
            }
        }
        catch (e) {
            console.error('⚠️ [BankSync] Error syncing bank balances to GL:', e);
            // Non-fatal: server continues even if this fails
        }
        finally {
            if (conn)
                conn.release();
        }
    });
}
/**
 * Auto-sync product costs from purchase history on startup.
 *
 * WHY: When a user clears the cost field on a product, it becomes 0. The system
 * doesn't auto-pull from existing purchase invoices, leaving BOM calculations at 0.00.
 *
 * HOW:
 *   1. Find all products where cost = 0 or NULL
 *   2. For each, find the latest purchase invoice line price (net of line discount)
 *   3. Update products.cost with that price
 *   4. Recalculate BOM costs for finished products whose raw materials were updated
 *
 * SAFETY: Non-destructive — only fills in missing costs, never overwrites existing ones.
 */
function syncProductCostsFromPurchases() {
    return __awaiter(this, void 0, void 0, function* () {
        let conn;
        try {
            conn = yield exports.pool.getConnection();
            // Find products with zero/null cost that have purchase history
            const [zeroProducts] = yield conn.query(`
      SELECT p.id, p.name, p.cost
      FROM products p
      WHERE (p.cost IS NULL OR p.cost = 0 OR p.cost = 0.00)
        AND p.id IN (
          SELECT DISTINCT il.productId 
          FROM invoice_lines il
          JOIN invoices i ON il.invoiceId = i.id
          WHERE i.type = 'INVOICE_PURCHASE'
        )
    `);
            if (!zeroProducts || zeroProducts.length === 0) {
                return;
            }
            console.log(`🔄 [CostSync] Found ${zeroProducts.length} product(s) with cost=0 that have purchase history`);
            let synced = 0;
            const updatedProductIds = [];
            for (const product of zeroProducts) {
                // Get the latest purchase price for this product
                const [priceRows] = yield conn.query(`
        SELECT il.price, il.discount, il.quantity, i.date
        FROM invoice_lines il
        JOIN invoices i ON il.invoiceId = i.id
        WHERE i.type = 'INVOICE_PURCHASE'
          AND il.productId = ?
        ORDER BY i.date DESC, i.id DESC
        LIMIT 1
      `, [product.id]);
                if (!priceRows || priceRows.length === 0)
                    continue;
                const latestPurchase = priceRows[0];
                const grossPrice = Number(latestPurchase.price) || 0;
                const lineDiscount = Number(latestPurchase.discount) || 0;
                const qty = Number(latestPurchase.quantity) || 1;
                // Net unit cost = (gross - line discount / qty)
                const netUnitCost = Math.max(0, grossPrice - (lineDiscount / qty));
                if (netUnitCost <= 0)
                    continue;
                yield conn.query('UPDATE products SET cost = ? WHERE id = ?', [
                    Number(netUnitCost.toFixed(2)),
                    product.id
                ]);
                updatedProductIds.push(product.id);
                synced++;
                console.log(`  ✅ ${product.name}: cost 0 → ${netUnitCost.toFixed(2)} (from latest purchase)`);
            }
            // Recalculate BOM costs for finished products that use updated raw materials
            if (updatedProductIds.length > 0) {
                const placeholders = updatedProductIds.map(() => '?').join(',');
                const [affectedBOMs] = yield conn.query(`
        SELECT DISTINCT bi.bom_id
        FROM bom_items bi
        WHERE bi.raw_product_id IN (${placeholders})
      `, updatedProductIds);
                if (affectedBOMs && affectedBOMs.length > 0) {
                    console.log(`  🔄 Recalculating ${affectedBOMs.length} BOM(s) with updated material costs...`);
                    for (const bomRow of affectedBOMs) {
                        const bomId = bomRow.bom_id;
                        // Get BOM header
                        const [bomHeaders] = yield conn.query(`
            SELECT finished_product_id, labor_cost, overhead_cost, is_active
            FROM bom WHERE id = ?
          `, [bomId]);
                        if (!bomHeaders || bomHeaders.length === 0)
                            continue;
                        const bom = bomHeaders[0];
                        if (!bom.is_active)
                            continue;
                        // Get BOM items with updated costs
                        const [bomItems] = yield conn.query(`
            SELECT bi.quantity_per_unit, bi.waste_percent, p.cost as unit_cost
            FROM bom_items bi
            LEFT JOIN products p ON bi.raw_product_id = p.id
            WHERE bi.bom_id = ?
          `, [bomId]);
                        let materialCost = 0;
                        for (const item of bomItems) {
                            const qtyWithWaste = (item.quantity_per_unit || 0) * (1 + (item.waste_percent || 0) / 100);
                            materialCost += qtyWithWaste * (item.unit_cost || 0);
                        }
                        const totalCost = materialCost + (parseFloat(bom.labor_cost) || 0) + (parseFloat(bom.overhead_cost) || 0);
                        yield conn.query('UPDATE products SET cost = ? WHERE id = ?', [
                            Number(totalCost.toFixed(2)),
                            bom.finished_product_id
                        ]);
                        console.log(`  ✅ BOM ${bomId}: finished product cost → ${totalCost.toFixed(2)}`);
                    }
                }
            }
            if (synced > 0) {
                console.log(`✅ [CostSync] Restored cost for ${synced} product(s) from purchase history`);
            }
        }
        catch (e) {
            console.error('⚠️ [CostSync] Error syncing product costs:', e);
            // Non-fatal: server continues even if this fails
        }
        finally {
            if (conn)
                conn.release();
        }
    });
}
/**
 * Automatically synchronize company-wide global chat groups and branch-specific groups.
 * Ensures every active branch has a corresponding chat room and users are auto-enrolled.
 */
function syncBranchChatGroups(connection) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = connection || (yield exports.pool.getConnection());
        try {
            // 1. Create or sync global group
            yield conn.query(`
      INSERT INTO chat_groups (id, name, description, type, createdBy)
      VALUES ('global-chat', 'الدردشة العامة (الجميع)', 'الدردشة الجماعية لجميع موظفي الشركة', 'GLOBAL', 'System')
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `);
            // 2. Fetch all branches
            const [branches] = yield conn.query('SELECT id, name FROM branches');
            for (const branch of branches) {
                const branchGroupId = `branch-${branch.id}`;
                const branchGroupName = `مجموعة فرع: ${branch.name}`;
                yield conn.query(`
        INSERT INTO chat_groups (id, name, description, type, branchId, createdBy)
        VALUES (?, ?, ?, 'BRANCH', ?, 'System')
        ON DUPLICATE KEY UPDATE name = VALUES(name)
      `, [branchGroupId, branchGroupName, `مجموعة الدردشة المخصصة لفرع ${branch.name}`, branch.id]);
            }
            // 3. Add members to global group (all users)
            yield conn.query(`
      INSERT IGNORE INTO chat_group_members (groupId, userId)
      SELECT 'global-chat', id FROM users WHERE isHidden = FALSE OR isHidden IS NULL
    `);
            // 4. Add members to branch groups
            for (const branch of branches) {
                const branchGroupId = `branch-${branch.id}`;
                yield conn.query(`
        INSERT IGNORE INTO chat_group_members (groupId, userId)
        SELECT ?, id FROM users
        WHERE branchId = ? AND (isHidden = FALSE OR isHidden IS NULL)
      `, [branchGroupId, branch.id]);
            }
            console.log('✅ Chat groups and memberships auto-synchronized successfully.');
        }
        catch (error) {
            console.error('⚠️ Error syncing branch chat groups:', (error === null || error === void 0 ? void 0 : error.message) || error);
        }
        finally {
            if (!connection && conn) {
                conn.release();
            }
        }
    });
}
