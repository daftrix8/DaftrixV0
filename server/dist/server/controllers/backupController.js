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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBackup = createBackup;
exports.getBackupJobStatus = getBackupJobStatus;
exports.listBackups = listBackups;
exports.downloadBackup = downloadBackup;
exports.restoreBackup = restoreBackup;
exports.deleteBackup = deleteBackup;
exports.initBackupScheduler = initBackupScheduler;
exports.getBackupSettingsAPI = getBackupSettingsAPI;
exports.updateBackupSettingsAPI = updateBackupSettingsAPI;
exports.browseFolders = browseFolders;
exports.getUserBackupSettings = getUserBackupSettings;
exports.updateUserBackupSettings = updateUserBackupSettings;
exports.initAllUserBackupSchedulers = initAllUserBackupSchedulers;
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const zlib_1 = require("zlib");
const fs_1 = require("fs");
const promises_1 = require("stream/promises");
const schedule = __importStar(require("node-schedule"));
const nodemailer = __importStar(require("nodemailer"));
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
const fsSync = __importStar(require("fs"));
const crypto_1 = require("crypto");
const backupJobs = new Map();
// Auto-cleanup completed/failed jobs after 10 minutes
const BACKUP_JOB_TTL_MS = 10 * 60 * 1000;
function scheduleJobCleanup(backupId) {
    setTimeout(() => backupJobs.delete(backupId), BACKUP_JOB_TTL_MS);
}
// Tables to skip during backup (redundant snapshots that bloat the dump)
const TABLES_TO_SKIP = new Set([
    'journal_entries_backup',
    'journal_lines_backup',
]);
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
// Validate filename to prevent path traversal (H9 security fix)
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9_\-]+\.sql\.gz$/;
function isValidBackupFilename(filename) {
    return SAFE_FILENAME_REGEX.test(filename) && !filename.includes('..');
}
// Configuration
const BACKUP_DIR = path.join(__dirname, '../../backups');
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '3306';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'cloud_erp';
const MAX_BACKUPS = 10; // Keep last 10 backups
// Cache backup directory from settings
let customBackupDir = null;
// Get the current backup directory (from settings or default)
function getBackupDir() {
    return __awaiter(this, void 0, void 0, function* () {
        if (customBackupDir !== null) {
            return customBackupDir;
        }
        try {
            const settings = yield getBackupSettings();
            if (settings.backupPath && settings.backupPath.trim()) {
                customBackupDir = settings.backupPath.trim();
                return customBackupDir;
            }
        }
        catch (error) {
            console.error('Error getting backup path from settings:', error);
        }
        return BACKUP_DIR;
    });
}
// Clear cached backup directory (called when settings change)
function clearBackupDirCache() {
    customBackupDir = null;
}
// Scheduler state
let schedulerJob = null;
let emailTransporter = null;
// Find MariaDB bin directory on Windows
function findMariaDBBin() {
    if (process.platform !== 'win32') {
        return null; // On Unix, mysqldump should be in PATH
    }
    const fsSync = require('fs');
    const searchPaths = [
        'C:\\Program Files\\MariaDB 12.1\\bin',
        'C:\\Program Files\\MariaDB 11.0\\bin',
        'C:\\Program Files\\MariaDB 10.11\\bin',
        'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin',
        'C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin',
    ];
    // Also search for any MariaDB installation
    try {
        const programFiles = 'C:\\Program Files';
        const dirs = fsSync.readdirSync(programFiles);
        for (const dir of dirs) {
            if (dir.startsWith('MariaDB')) {
                const binPath = path.join(programFiles, dir, 'bin');
                if (fsSync.existsSync(binPath)) {
                    searchPaths.unshift(binPath);
                }
            }
        }
    }
    catch (err) {
        // Ignore errors
    }
    for (const binPath of searchPaths) {
        const mysqldumpPath = path.join(binPath, 'mysqldump.exe');
        if (fsSync.existsSync(mysqldumpPath)) {
            return binPath;
        }
    }
    return null;
}
// Get full path to mysql command
function getMySQLCommand(command) {
    const exeName = process.platform === 'win32' ? `${command}.exe` : command;
    // First check if it's in PATH
    try {
        (0, child_process_1.execSync)(`where ${exeName}`, { stdio: 'ignore' });
        return exeName;
    }
    catch (_a) {
        // Not in PATH
    }
    // On Windows, try to find MariaDB installation
    const binDir = findMariaDBBin();
    if (binDir) {
        return path.join(binDir, exeName);
    }
    // Fall back to just the command name
    return exeName;
}
// Ensure backup directory exists
function ensureBackupDir() {
    return __awaiter(this, void 0, void 0, function* () {
        const rawDir = yield getBackupDir();
        // Normalize: resolve UNC/relative artifacts from __dirname on Windows hosting
        const backupDir = path.resolve(rawDir);
        try {
            yield fs.mkdir(backupDir, { recursive: true });
        }
        catch (err) {
            console.error(`Failed to create backup directory "${backupDir}" (raw: "${rawDir}"):`, err);
        }
        return backupDir;
    });
}
// Get backup filename
function getBackupFilename() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
    return `${DB_NAME}-${timestamp[0]}_${timestamp[1].split('Z')[0]}.sql.gz`;
}
// ═══════════════════════════════════════════════════════════════════════════════
// PURE-JS SQL DUMP — works on Hostinger & any hosting without mysqldump binary
// ═══════════════════════════════════════════════════════════════════════════════
// Check if mysqldump binary is available
function isMySQLDumpAvailable() {
    try {
        const cmd = getMySQLCommand('mysqldump');
        if (process.platform === 'win32') {
            (0, child_process_1.execSync)(`where "${cmd}"`, { stdio: 'ignore' });
        }
        else {
            (0, child_process_1.execSync)(`which "${cmd}"`, { stdio: 'ignore' });
        }
        return true;
    }
    catch (_a) {
        return false;
    }
}
// Escape a SQL value for safe insertion
function escapeSQLValue(val, columnType) {
    if (val === null || val === undefined)
        return 'NULL';
    if (typeof val === 'number')
        return String(val);
    if (typeof val === 'boolean')
        return val ? '1' : '0';
    if (val instanceof Date) {
        return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
    }
    if (Buffer.isBuffer(val)) {
        return `X'${val.toString('hex')}'`;
    }
    // JSON columns — stringify objects
    if (typeof val === 'object') {
        const jsonStr = JSON.stringify(val);
        return `'${jsonStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    }
    // String values — escape special chars
    const str = String(val);
    return `'${str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\x00/g, '\\0')
        .replace(/\x1a/g, '\\Z')}'`;
}
const BATCH_SIZE = 1000; // Rows per SELECT batch
// Helper: write to stream with backpressure support
function writeWithDrain(stream, data) {
    return new Promise((resolve, reject) => {
        const canContinue = stream.write(data);
        if (canContinue) {
            resolve();
        }
        else {
            const onDrain = () => {
                stream.removeListener('error', onError);
                resolve();
            };
            const onError = (err) => {
                stream.removeListener('drain', onDrain);
                reject(err);
            };
            stream.once('drain', onDrain);
            stream.once('error', onError);
        }
    });
}
// Generate a complete SQL dump using only the MySQL connection pool
function generatePureJSDump(sqlFilePath, backupId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const conn = yield (0, db_1.getConnection)();
        const writeStream = fsSync.createWriteStream(sqlFilePath, { encoding: 'utf8' });
        const writeLine = (line) => __awaiter(this, void 0, void 0, function* () {
            yield writeWithDrain(writeStream, line + '\n');
        });
        try {
            // Header
            yield writeLine('-- Cloud ERP Pure-JS Database Backup');
            yield writeLine(`-- Generated: ${new Date().toISOString()}`);
            yield writeLine(`-- Database: ${DB_NAME}`);
            yield writeLine('');
            yield writeLine('SET NAMES utf8mb4;');
            yield writeLine('SET FOREIGN_KEY_CHECKS = 0;');
            yield writeLine('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";');
            yield writeLine('SET AUTOCOMMIT = 0;');
            yield writeLine('START TRANSACTION;');
            yield writeLine('');
            yield writeLine(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
            yield writeLine(`USE \`${DB_NAME}\`;`);
            yield writeLine('');
            // Get all tables (excluding skipped ones)
            const [tableRows] = yield conn.query('SHOW TABLES');
            const allTables = tableRows.map(row => Object.values(row)[0]);
            const tables = allTables.filter(t => !TABLES_TO_SKIP.has(t));
            const skippedCount = allTables.length - tables.length;
            console.log(`📦 Pure-JS backup: ${tables.length} tables to dump (${skippedCount} skipped)`);
            // Update progress tracker
            if (backupId) {
                const progress = backupJobs.get(backupId);
                if (progress)
                    progress.tablesTotal = tables.length;
            }
            for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
                const tableName = tables[tableIndex];
                console.log(`  📄 Dumping: ${tableName}`);
                // Update progress
                if (backupId) {
                    const progress = backupJobs.get(backupId);
                    if (progress) {
                        progress.currentTable = tableName;
                        progress.tablesDone = tableIndex;
                    }
                }
                // Get CREATE TABLE statement
                const [createRows] = yield conn.query(`SHOW CREATE TABLE \`${tableName}\``);
                const createStatement = ((_a = createRows[0]) === null || _a === void 0 ? void 0 : _a['Create Table'])
                    || ((_b = createRows[0]) === null || _b === void 0 ? void 0 : _b['Create View']);
                if (!createStatement)
                    continue;
                const isView = !!((_c = createRows[0]) === null || _c === void 0 ? void 0 : _c['Create View']);
                yield writeLine('-- -------------------------------------------');
                yield writeLine(`-- Table: ${tableName}`);
                yield writeLine('-- -------------------------------------------');
                yield writeLine('');
                if (isView) {
                    // Views: only dump CREATE VIEW, no data
                    yield writeLine(`DROP VIEW IF EXISTS \`${tableName}\`;`);
                    yield writeLine(`${createStatement};`);
                }
                else {
                    yield writeLine(`DROP TABLE IF EXISTS \`${tableName}\`;`);
                    yield writeLine(`${createStatement};`);
                    // Get column info for type-aware escaping
                    const [colRows] = yield conn.query(`SHOW COLUMNS FROM \`${tableName}\``);
                    const columns = colRows.map(c => ({
                        name: c.Field,
                        type: c.Type
                    }));
                    const columnNames = columns.map(c => `\`${c.name}\``).join(', ');
                    // Dump data in batches
                    let offset = 0;
                    let hasData = true;
                    while (hasData) {
                        const [rows] = yield conn.query(`SELECT * FROM \`${tableName}\` LIMIT ${BATCH_SIZE} OFFSET ${offset}`);
                        const dataRows = rows;
                        if (dataRows.length === 0) {
                            hasData = false;
                            break;
                        }
                        // Build INSERT statement with multiple value tuples
                        const valueSets = [];
                        for (const row of dataRows) {
                            const values = columns.map(col => escapeSQLValue(row[col.name], col.type));
                            valueSets.push(`(${values.join(', ')})`);
                        }
                        yield writeLine(`INSERT INTO \`${tableName}\` (${columnNames}) VALUES`);
                        yield writeLine(valueSets.join(',\n') + ';');
                        offset += BATCH_SIZE;
                        if (dataRows.length < BATCH_SIZE) {
                            hasData = false;
                        }
                    }
                }
                yield writeLine('');
            }
            // Mark final table count
            if (backupId) {
                const progress = backupJobs.get(backupId);
                if (progress)
                    progress.tablesDone = tables.length;
            }
            // Footer
            yield writeLine('COMMIT;');
            yield writeLine('SET FOREIGN_KEY_CHECKS = 1;');
            yield writeLine('');
            yield writeLine('-- End of backup');
            // Close the write stream
            yield new Promise((resolve, reject) => {
                writeStream.end(() => resolve());
                writeStream.on('error', reject);
            });
            console.log(`✅ Pure-JS backup SQL written to: ${sqlFilePath}`);
        }
        finally {
            conn.release();
        }
    });
}
// Restore a SQL dump file using the connection pool (no mysql binary needed)
function restorePureJS(sqlContent) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            // Split into individual statements
            // Handle multi-line statements by splitting on ;\n boundaries
            const statements = splitSQLStatements(sqlContent);
            console.log(`🔄 Pure-JS restore: ${statements.length} statements to execute`);
            let executed = 0;
            let skipped = 0;
            for (const stmt of statements) {
                const trimmed = stmt.trim();
                if (!trimmed || trimmed.startsWith('--')) {
                    skipped++;
                    continue;
                }
                try {
                    yield conn.query(trimmed);
                    executed++;
                    // Log progress every 100 statements
                    if (executed % 100 === 0) {
                        console.log(`  📊 Restored ${executed}/${statements.length} statements...`);
                    }
                }
                catch (err) {
                    // Skip non-fatal errors (duplicate key, table exists, etc.)
                    const isFatal = err.code === 'ER_SYNTAX_ERROR';
                    if (isFatal) {
                        console.error(`❌ Fatal SQL error at statement ${executed}:`, err.message);
                        console.error(`   Statement: ${trimmed.substring(0, 200)}...`);
                        throw err;
                    }
                    // Non-fatal: log and continue
                    console.warn(`⚠️ Non-fatal: ${err.message.substring(0, 100)}`);
                    skipped++;
                }
            }
            console.log(`✅ Pure-JS restore complete: ${executed} executed, ${skipped} skipped`);
        }
        finally {
            conn.release();
        }
    });
}
// Split SQL content into individual statements, respecting string literals
function splitSQLStatements(sql) {
    const statements = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let escaped = false;
    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }
        if (char === '\\') {
            current += char;
            escaped = true;
            continue;
        }
        if (inString) {
            current += char;
            if (char === stringChar) {
                inString = false;
            }
            continue;
        }
        if (char === "'" || char === '"') {
            inString = true;
            stringChar = char;
            current += char;
            continue;
        }
        // Skip single-line comments
        if (char === '-' && sql[i + 1] === '-') {
            const newlineIdx = sql.indexOf('\n', i);
            if (newlineIdx === -1)
                break;
            i = newlineIdx;
            continue;
        }
        if (char === ';') {
            const trimmed = current.trim();
            if (trimmed) {
                statements.push(trimmed);
            }
            current = '';
            continue;
        }
        current += char;
    }
    // Don't forget the last statement if no trailing semicolon
    const lastTrimmed = current.trim();
    if (lastTrimmed) {
        statements.push(lastTrimmed);
    }
    return statements;
}
// Create backup (async background job — returns immediately with backupId)
function createBackup(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const backupId = (0, crypto_1.randomUUID)();
            // Initialize progress tracker
            backupJobs.set(backupId, {
                status: 'running',
                tablesTotal: 0,
                tablesDone: 0,
                currentTable: '',
                startedAt: Date.now(),
            });
            // Respond immediately — client will poll /backup/status/:backupId
            res.json({ success: true, backupId, status: 'started' });
            // Run backup in background (not awaited in request lifecycle)
            runBackupJob(backupId).catch(err => {
                console.error(`❌ Background backup ${backupId} crashed:`, err);
            });
        }
        catch (error) {
            console.error('Backup creation failed:', error);
            return (0, errorHandler_1.handleControllerError)(res, error, 'createBackup');
        }
    });
}
// Background backup job — runs independently of the HTTP request
function runBackupJob(backupId) {
    return __awaiter(this, void 0, void 0, function* () {
        const progress = backupJobs.get(backupId);
        if (!progress)
            return;
        try {
            const backupDir = yield ensureBackupDir();
            const filename = getBackupFilename();
            const sqlFile = path.join(backupDir, filename.replace('.gz', ''));
            const gzFile = path.join(backupDir, filename);
            const hasMysqlDump = isMySQLDumpAvailable();
            if (hasMysqlDump) {
                console.log('📦 Using mysqldump for backup');
                const mysqldumpCmd = getMySQLCommand('mysqldump');
                const dumpArgs = [
                    '-h', DB_HOST,
                    '-P', DB_PORT,
                    '-u', DB_USER,
                    '--single-transaction', '--routines', '--triggers', '--events',
                    '--add-drop-database', '--add-drop-table',
                    '--quick', '--extended-insert',
                    '--net-buffer-length=1048576', '--max-allowed-packet=512M',
                    '--hex-blob', '--set-charset', '--skip-comments',
                    '--result-file', sqlFile,
                    '--databases', DB_NAME
                ];
                yield execFileAsync(mysqldumpCmd, dumpArgs, {
                    env: Object.assign(Object.assign({}, process.env), { MYSQL_PWD: DB_PASSWORD }),
                    maxBuffer: 50 * 1024 * 1024
                });
            }
            else {
                console.log('📦 mysqldump not found — using pure-JS backup');
                yield generatePureJSDump(sqlFile, backupId);
            }
            // Update progress: compressing
            progress.status = 'compressing';
            progress.currentTable = 'ضغط الملف...';
            // Compress the SQL file (level 9 = max compression)
            yield (0, promises_1.pipeline)((0, fs_1.createReadStream)(sqlFile), (0, zlib_1.createGzip)({ level: 9 }), (0, fs_1.createWriteStream)(gzFile));
            // Delete uncompressed SQL file
            yield fs.unlink(sqlFile);
            // Get file stats
            const stats = yield fs.stat(gzFile);
            // Rotate old backups
            yield rotateBackups();
            // Send email notification if enabled
            const settings = yield getBackupSettings();
            if (settings.emailEnabled) {
                yield sendBackupEmail(true, filename);
            }
            // Mark complete
            progress.status = 'completed';
            progress.filename = filename;
            progress.size = stats.size;
            progress.method = hasMysqlDump ? 'mysqldump' : 'pure-js';
            progress.currentTable = '';
            console.log(`✅ Background backup ${backupId} completed: ${filename} (${formatBytes(stats.size)})`);
            scheduleJobCleanup(backupId);
        }
        catch (error) {
            console.error(`❌ Background backup ${backupId} failed:`, error);
            progress.status = 'failed';
            progress.error = error.message || 'Unknown error';
            scheduleJobCleanup(backupId);
            // Send failure email
            try {
                const settings = yield getBackupSettings();
                if (settings.emailEnabled) {
                    yield sendBackupEmail(false, undefined, error.message);
                }
            }
            catch ( /* ignore email errors */_a) { /* ignore email errors */ }
        }
    });
}
// Get backup job status (polling endpoint)
function getBackupJobStatus(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { backupId } = req.params;
        const progress = backupJobs.get(backupId);
        if (!progress) {
            return res.status(404).json({ success: false, error: 'Backup job not found or expired' });
        }
        const elapsedSeconds = Math.round((Date.now() - progress.startedAt) / 1000);
        const percentDone = progress.tablesTotal > 0
            ? Math.round((progress.tablesDone / progress.tablesTotal) * 100)
            : 0;
        res.json(Object.assign(Object.assign({ success: true, backupId, status: progress.status, tablesTotal: progress.tablesTotal, tablesDone: progress.tablesDone, currentTable: progress.currentTable, percentDone,
            elapsedSeconds }, (progress.status === 'completed' && {
            filename: progress.filename,
            size: progress.size,
            method: progress.method,
        })), (progress.status === 'failed' && {
            error: progress.error,
        })));
    });
}
// List all backups
function listBackups(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const backupDir = yield ensureBackupDir();
            const files = yield fs.readdir(backupDir);
            const backups = yield Promise.all(files
                .filter(f => f.endsWith('.sql.gz'))
                .map((filename) => __awaiter(this, void 0, void 0, function* () {
                const filepath = path.join(backupDir, filename);
                const stats = yield fs.stat(filepath);
                return {
                    filename,
                    size: stats.size,
                    created: stats.mtime,
                    humanSize: formatBytes(stats.size)
                };
            })));
            // Sort by date (newest first)
            backups.sort((a, b) => b.created.getTime() - a.created.getTime());
            res.json({ success: true, backups });
        }
        catch (error) {
            console.error('Failed to list backups:', error);
            return (0, errorHandler_1.handleControllerError)(res, error, 'listBackups');
        }
    });
}
// Download backup
function downloadBackup(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { filename } = req.params;
            // Strict filename validation (H9 security fix)
            if (!filename || !isValidBackupFilename(filename)) {
                return res.status(400).json({ success: false, error: 'Invalid filename' });
            }
            const backupDir = yield getBackupDir();
            const filepath = path.resolve(backupDir, filename);
            // Ensure resolved path is within backup directory (prevent path traversal)
            if (!filepath.startsWith(path.resolve(backupDir))) {
                return res.status(400).json({ success: false, error: 'Invalid path' });
            }
            // Check if file exists
            let stats;
            try {
                stats = yield fs.stat(filepath);
            }
            catch (_a) {
                return res.status(404).json({ success: false, error: 'Backup not found' });
            }
            // Send file — disable timeout for large downloads
            res.setTimeout(0);
            res.setHeader('Content-Type', 'application/gzip');
            res.setHeader('Content-Length', stats.size);
            res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filepath)}"`);
            const fileStream = (0, fs_1.createReadStream)(filepath);
            fileStream.pipe(res);
        }
        catch (error) {
            console.error('Download failed:', error);
            return (0, errorHandler_1.handleControllerError)(res, error, 'downloadBackup');
        }
    });
}
// Restore backup — mysql binary with pure-JS fallback
function restoreBackup(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        if (res.headersSent)
            return;
        try {
            const { filename } = req.params;
            // Strict filename validation (H9 security fix)
            if (!filename || !isValidBackupFilename(filename)) {
                return res.status(400).json({ success: false, error: 'Invalid filename' });
            }
            const backupDir = yield getBackupDir();
            const gzFile = path.resolve(backupDir, filename);
            // Ensure resolved path is within backup directory
            if (!gzFile.startsWith(path.resolve(backupDir))) {
                return res.status(400).json({ success: false, error: 'Invalid path' });
            }
            // Check if file exists
            try {
                yield fs.access(gzFile);
            }
            catch (_a) {
                return res.status(404).json({ success: false, error: 'Backup not found' });
            }
            // Check if mysql binary is available
            let hasMySQLBinary = false;
            try {
                const mysqlCmd = getMySQLCommand('mysql');
                if (process.platform === 'win32') {
                    (0, child_process_1.execSync)(`where "${mysqlCmd}"`, { stdio: 'ignore' });
                }
                else {
                    (0, child_process_1.execSync)(`which "${mysqlCmd}"`, { stdio: 'ignore' });
                }
                hasMySQLBinary = true;
            }
            catch (_b) {
                hasMySQLBinary = false;
            }
            if (hasMySQLBinary) {
                console.log('🔄 Using mysql binary for restore');
                const mysqlCmd = getMySQLCommand('mysql');
                const restoreArgs = [
                    '-h', DB_HOST,
                    '-P', DB_PORT,
                    '-u', DB_USER,
                    '--max-allowed-packet=512M',
                    '--force',
                    'mysql'
                ];
                const TURBO_PREAMBLE = Buffer.from('SET autocommit=0;\n');
                const TURBO_EPILOGUE = Buffer.from('\nCOMMIT;\nSET autocommit=1;\n');
                yield new Promise((resolve, reject) => {
                    const proc = require('child_process').spawn(mysqlCmd, restoreArgs, {
                        env: Object.assign(Object.assign({}, process.env), { MYSQL_PWD: DB_PASSWORD }),
                        stdio: ['pipe', 'ignore', 'pipe']
                    });
                    let stderrData = '';
                    proc.stderr.on('data', (d) => { stderrData += d.toString(); });
                    proc.on('close', (code) => {
                        if (code !== 0) {
                            const errors = stderrData.split('\n').filter((l) => l.includes('ERROR')).join('\n');
                            reject(new Error(errors || stderrData));
                        }
                        else {
                            resolve();
                        }
                    });
                    proc.on('error', reject);
                    proc.stdin.write(TURBO_PREAMBLE);
                    const gunzip = (0, zlib_1.createGunzip)();
                    const fileStream = (0, fs_1.createReadStream)(gzFile);
                    gunzip.on('data', (chunk) => proc.stdin.write(chunk));
                    gunzip.on('end', () => {
                        proc.stdin.write(TURBO_EPILOGUE);
                        proc.stdin.end();
                    });
                    gunzip.on('error', reject);
                    fileStream.on('error', reject);
                    fileStream.pipe(gunzip);
                });
            }
            else {
                // Pure-JS fallback: decompress then execute via connection pool
                console.log('🔄 mysql binary not found — using pure-JS restore');
                const sqlContent = yield new Promise((resolve, reject) => {
                    const chunks = [];
                    const gunzip = (0, zlib_1.createGunzip)();
                    const fileStream = (0, fs_1.createReadStream)(gzFile);
                    gunzip.on('data', (chunk) => chunks.push(chunk));
                    gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                    gunzip.on('error', reject);
                    fileStream.on('error', reject);
                    fileStream.pipe(gunzip);
                });
                yield restorePureJS(sqlContent);
            }
            res.json({
                success: true,
                message: 'Database restored successfully',
                method: hasMySQLBinary ? 'mysql-binary' : 'pure-js'
            });
        }
        catch (error) {
            console.error('Restore failed:', error);
            return (0, errorHandler_1.handleControllerError)(res, error, 'restoreBackup');
        }
    });
}
// Helper to move file to recycle bin on Windows
function moveToRecycleBin(filepath) {
    return __awaiter(this, void 0, void 0, function* () {
        if (process.platform === 'win32') {
            // Use PowerShell to move to Recycle Bin
            // We use VisualBasic.FileIO.FileSystem.DeleteFile which supports sending to Recycle Bin
            const command = `powershell.exe -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${filepath}', 'OnlyErrorDialogs', 'SendToRecycleBin')"`;
            try {
                yield execAsync(command);
            }
            catch (error) {
                console.error('Failed to move to recycle bin, falling back to permanent delete:', error);
                yield fs.unlink(filepath);
            }
        }
        else {
            // Fallback for non-Windows (permanent delete)
            yield fs.unlink(filepath);
        }
    });
}
// Delete backup
function deleteBackup(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { filename } = req.params;
            // Strict filename validation (H9 security fix)
            if (!filename || !isValidBackupFilename(filename)) {
                return res.status(400).json({ success: false, error: 'Invalid filename' });
            }
            const backupDir = yield getBackupDir();
            const filepath = path.resolve(backupDir, filename);
            // Ensure resolved path is within backup directory
            if (!filepath.startsWith(path.resolve(backupDir))) {
                return res.status(400).json({ success: false, error: 'Invalid path' });
            }
            // Check if file exists
            try {
                yield fs.access(filepath);
            }
            catch (_a) {
                return res.status(404).json({ success: false, error: 'Backup not found' });
            }
            // Move to recycle bin instead of permanent delete
            yield moveToRecycleBin(filepath);
            res.json({ success: true, message: 'Backup deleted successfully' });
        }
        catch (error) {
            console.error('Delete failed:', error);
            return (0, errorHandler_1.handleControllerError)(res, error, 'deleteBackup');
        }
    });
}
// Rotate backups (keep only maxBackups from settings or default)
function rotateBackups() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const settings = yield getBackupSettings();
            const maxBackups = settings.maxBackups || MAX_BACKUPS;
            const backupDir = yield getBackupDir();
            const files = yield fs.readdir(backupDir);
            const backups = yield Promise.all(files
                .filter(f => f.endsWith('.sql.gz'))
                .map((filename) => __awaiter(this, void 0, void 0, function* () {
                const filepath = path.join(backupDir, filename);
                const stats = yield fs.stat(filepath);
                return { filename, filepath, mtime: stats.mtime };
            })));
            // Sort by date (oldest first)
            backups.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
            // Delete old backups
            const toDelete = backups.slice(0, Math.max(0, backups.length - maxBackups));
            for (const backup of toDelete) {
                yield moveToRecycleBin(backup.filepath);
                console.log(`Rotated old backup (Recycle Bin): ${backup.filename}`);
            }
        }
        catch (error) {
            console.error('Backup rotation failed:', error);
        }
    });
}
// Helper: Format bytes to human readable
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
// ===== EMAIL NOTIFICATIONS =====
function getBackupSettings() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const conn = yield (0, db_1.getConnection)();
            const [rows] = yield conn.query('SELECT config FROM system_config LIMIT 1');
            conn.release();
            if (rows.length > 0) {
                const config = JSON.parse(rows[0].config || '{}');
                return config.backup || {};
            }
            return {};
        }
        catch (error) {
            console.error('Failed to load backup settings:', error);
            return {};
        }
    });
}
function initEmailTransporter(settings) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!settings.emailEnabled || !settings.smtpHost) {
            emailTransporter = null;
            return;
        }
        emailTransporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: settings.smtpPort || 587,
            secure: settings.smtpSecure || false,
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPassword
            }
        });
    });
}
function sendBackupEmail(success, filename, error) {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = yield getBackupSettings();
        if (!emailTransporter || !settings.notificationEmail) {
            return;
        }
        const subject = success
            ? `✅ Backup Successful - ${filename}`
            : `❌ Backup Failed`;
        const html = success
            ? `<h2>Backup Created Successfully</h2>
           <p>A new database backup has been created:</p>
           <ul>
               <li><strong>Filename:</strong> ${filename}</li>
               <li><strong>Time:</strong> ${new Date().toLocaleString('ar-EG')}</li>
               <li><strong>Database:</strong> ${DB_NAME}</li>
           </ul>`
            : `<h2>Backup Failed</h2>
           <p>The automated backup process encountered an error:</p>
           <pre>${error}</pre>`;
        try {
            yield emailTransporter.sendMail({
                from: settings.smtpUser,
                to: settings.notificationEmail,
                subject,
                html
            });
            console.log('📧 Backup notification sent to:', settings.notificationEmail);
        }
        catch (err) {
            console.error('Failed to send backup email:', err);
        }
    });
}
// ===== SCHEDULER =====
function createScheduledBackup() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🔄 Running scheduled backup...');
        try {
            const backupDir = yield ensureBackupDir();
            const filename = getBackupFilename();
            const sqlFile = path.join(backupDir, filename.replace('.gz', ''));
            const gzFile = path.join(backupDir, filename);
            const hasMysqlDump = isMySQLDumpAvailable();
            if (hasMysqlDump) {
                const mysqldumpCmd = getMySQLCommand('mysqldump');
                const cmd = `"${mysqldumpCmd}" -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p"${DB_PASSWORD}" ` +
                    `--single-transaction --routines --triggers --events ` +
                    `--add-drop-database --add-drop-table ` +
                    `--quick --extended-insert --net-buffer-length=1048576 --max-allowed-packet=512M ` +
                    `--hex-blob --set-charset --skip-comments --databases ${DB_NAME} > "${sqlFile}"`;
                yield execAsync(cmd, {
                    env: Object.assign(Object.assign({}, process.env), { MYSQL_PWD: DB_PASSWORD }),
                    maxBuffer: 50 * 1024 * 1024
                });
            }
            else {
                yield generatePureJSDump(sqlFile, undefined);
            }
            yield (0, promises_1.pipeline)((0, fs_1.createReadStream)(sqlFile), (0, zlib_1.createGzip)({ level: 9 }), (0, fs_1.createWriteStream)(gzFile));
            yield fs.unlink(sqlFile);
            yield rotateBackups();
            console.log('✅ Scheduled backup created:', filename);
            yield sendBackupEmail(true, filename);
        }
        catch (error) {
            console.error('❌ Scheduled backup failed:', error);
            yield sendBackupEmail(false, undefined, error.message);
        }
    });
}
function initBackupScheduler() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const settings = yield getBackupSettings();
            // Initialize email if enabled
            yield initEmailTransporter(settings);
            // Cancel existing job
            if (schedulerJob) {
                schedulerJob.cancel();
                schedulerJob = null;
            }
            // Schedule new job if enabled
            if (settings.scheduleEnabled && settings.scheduleFrequency) {
                // Get custom time or default to 2 AM
                const hour = settings.scheduleHour !== undefined ? settings.scheduleHour : 2;
                const minute = settings.scheduleMinute !== undefined ? settings.scheduleMinute : 0;
                let cronExpression;
                switch (settings.scheduleFrequency) {
                    case 'daily':
                        cronExpression = `${minute} ${hour} * * *`; // User-specified time daily
                        break;
                    case 'weekly':
                        // Day of week: settings.scheduleDayOfWeek or default to Sunday (0)
                        const dayOfWeek = settings.scheduleDayOfWeek !== undefined ? settings.scheduleDayOfWeek : 0;
                        cronExpression = `${minute} ${hour} * * ${dayOfWeek}`;
                        break;
                    case 'monthly':
                        // Day of month: settings.scheduleDayOfMonth or default to 1st
                        const dayOfMonth = settings.scheduleDayOfMonth !== undefined ? settings.scheduleDayOfMonth : 1;
                        cronExpression = `${minute} ${hour} ${dayOfMonth} * *`;
                        break;
                    case 'hourly': // For testing
                        cronExpression = `${minute} * * * *`; // Every hour at specified minute
                        break;
                    default:
                        console.log('Invalid schedule frequency:', settings.scheduleFrequency);
                        return;
                }
                schedulerJob = schedule.scheduleJob(cronExpression, createScheduledBackup);
                console.log(`✅ Backup scheduler initialized (${settings.scheduleFrequency} at ${hour}:${minute.toString().padStart(2, '0')})`);
            }
            else {
                console.log('ℹ️ Backup scheduler is disabled');
            }
        }
        catch (error) {
            console.error('Failed to initialize backup scheduler:', error);
        }
    });
}
// ===== SETTINGS API =====
function getBackupSettingsAPI(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const settings = yield getBackupSettings();
            res.json({ success: true, settings });
        }
        catch (error) {
            return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    });
}
function updateBackupSettingsAPI(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const newSettings = req.body;
            const conn = yield (0, db_1.getConnection)();
            // Get current config
            const [rows] = yield conn.query('SELECT config FROM system_config LIMIT 1');
            const currentConfig = rows.length > 0
                ? JSON.parse(rows[0].config || '{}')
                : {};
            // Update backup settings
            currentConfig.backup = newSettings;
            // Save to database
            yield conn.query('UPDATE system_config SET config = ?', [JSON.stringify(currentConfig)]);
            conn.release();
            // Clear cached backup directory so it's re-read
            clearBackupDirCache();
            // Reinitialize scheduler with new settings
            yield initBackupScheduler();
            res.json({ success: true, message: 'Backup settings updated' });
        }
        catch (error) {
            return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    });
}
// ===== FOLDER BROWSER API =====
function browseFolders(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const requestedPath = req.query.path || '';
            const fsSync = require('fs');
            // Restrict browsing to allowed base directories (H9 security fix)
            const allowedRoots = (process.env.BACKUP_ALLOWED_PATHS || '').split(',').map(p => p.trim()).filter(Boolean);
            // Determine the base path to browse
            let basePath;
            if (!requestedPath) {
                // Return available drives on Windows or root folders
                if (process.platform === 'win32') {
                    const drives = [];
                    // If allowed paths are configured, only show those
                    if (allowedRoots.length > 0) {
                        for (const root of allowedRoots) {
                            try {
                                if (fsSync.existsSync(root)) {
                                    drives.push({
                                        name: path.basename(root) || root,
                                        path: root,
                                        type: 'folder'
                                    });
                                }
                            }
                            catch ( /* skip */_a) { /* skip */ }
                        }
                    }
                    else {
                        // Fallback: check common drive letters
                        for (const letter of ['C', 'D', 'E', 'F', 'G', 'H']) {
                            const drivePath = `${letter}:\\`;
                            try {
                                if (fsSync.existsSync(drivePath)) {
                                    fsSync.accessSync(drivePath, fsSync.constants.R_OK);
                                    drives.push({
                                        name: `القرص ${letter}:`,
                                        path: drivePath,
                                        type: 'drive'
                                    });
                                }
                            }
                            catch ( /* skip */_b) { /* skip */ }
                        }
                    }
                    return res.json({
                        success: true,
                        currentPath: '',
                        parentPath: null,
                        folders: drives
                    });
                }
                else {
                    basePath = '/';
                }
            }
            else {
                basePath = path.resolve(requestedPath);
                // If allowed roots are configured, enforce containment
                if (allowedRoots.length > 0) {
                    const isAllowed = allowedRoots.some(root => basePath.startsWith(path.resolve(root)));
                    if (!isAllowed) {
                        return res.status(403).json({ success: false, error: 'Access denied: path outside allowed directories' });
                    }
                }
            }
            // Validate path exists and is accessible
            try {
                const stat = yield fs.stat(basePath);
                if (!stat.isDirectory()) {
                    return res.status(400).json({ success: false, error: 'Path is not a directory' });
                }
            }
            catch (err) {
                return res.status(400).json({ success: false, error: 'Path does not exist or is not accessible' });
            }
            // Read directory contents
            const entries = yield fs.readdir(basePath, { withFileTypes: true });
            const folders = [];
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    // Skip hidden folders and system folders
                    if (entry.name.startsWith('.') || entry.name.startsWith('$')) {
                        continue;
                    }
                    const fullPath = path.join(basePath, entry.name);
                    // Check if folder is accessible
                    try {
                        fsSync.accessSync(fullPath, fsSync.constants.R_OK);
                        folders.push({
                            name: entry.name,
                            path: fullPath,
                            type: 'folder'
                        });
                    }
                    catch (_c) {
                        // Skip inaccessible folders
                    }
                }
            }
            // Sort folders alphabetically
            folders.sort((a, b) => a.name.localeCompare(b.name));
            // Get parent path
            const parentPath = path.dirname(basePath);
            const hasParent = parentPath !== basePath && basePath !== '';
            res.json({
                success: true,
                currentPath: basePath,
                parentPath: hasParent ? parentPath : null,
                folders
            });
        }
        catch (error) {
            console.error('Browse folders error:', error);
            return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    });
}
// ===== USER-SPECIFIC BACKUP SETTINGS =====
// Get user's personal backup settings
function getUserBackupSettings(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: 'User not authenticated' });
            }
            const conn = yield (0, db_1.getConnection)();
            const [rows] = yield conn.query('SELECT * FROM user_backup_settings WHERE userId = ?', [userId]);
            conn.release();
            const settings = rows.length > 0 ? rows[0] : null;
            res.json({ success: true, settings });
        }
        catch (error) {
            console.error('Error getting user backup settings:', error);
            return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    });
}
// Update user's personal backup settings
function updateUserBackupSettings(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        try {
            const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: 'User not authenticated' });
            }
            const settings = req.body;
            const conn = yield (0, db_1.getConnection)();
            // Check if settings exist
            const [existing] = yield conn.query('SELECT id FROM user_backup_settings WHERE userId = ?', [userId]);
            if (existing.length > 0) {
                // Update existing
                yield conn.query(`
                UPDATE user_backup_settings SET
                    scheduleEnabled = ?,
                    scheduleFrequency = ?,
                    scheduleHour = ?,
                    scheduleMinute = ?,
                    scheduleDayOfWeek = ?,
                    scheduleDayOfMonth = ?,
                    backupPath = ?,
                    deliveryEmail = ?,
                    updatedAt = NOW()
                WHERE userId = ?
            `, [
                    settings.scheduleEnabled || false,
                    settings.scheduleFrequency || 'daily',
                    (_b = settings.scheduleHour) !== null && _b !== void 0 ? _b : 2,
                    (_c = settings.scheduleMinute) !== null && _c !== void 0 ? _c : 0,
                    (_d = settings.scheduleDayOfWeek) !== null && _d !== void 0 ? _d : 0,
                    (_e = settings.scheduleDayOfMonth) !== null && _e !== void 0 ? _e : 1,
                    settings.backupPath || null,
                    settings.deliveryEmail || null,
                    userId
                ]);
            }
            else {
                // Insert new
                const { randomUUID: uuidv4 } = require('crypto');
                yield conn.query(`
                INSERT INTO user_backup_settings 
                (id, userId, scheduleEnabled, scheduleFrequency, scheduleHour, scheduleMinute, 
                 scheduleDayOfWeek, scheduleDayOfMonth, backupPath, deliveryEmail)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                    uuidv4(),
                    userId,
                    settings.scheduleEnabled || false,
                    settings.scheduleFrequency || 'daily',
                    (_f = settings.scheduleHour) !== null && _f !== void 0 ? _f : 2,
                    (_g = settings.scheduleMinute) !== null && _g !== void 0 ? _g : 0,
                    (_h = settings.scheduleDayOfWeek) !== null && _h !== void 0 ? _h : 0,
                    (_j = settings.scheduleDayOfMonth) !== null && _j !== void 0 ? _j : 1,
                    settings.backupPath || null,
                    settings.deliveryEmail || null
                ]);
            }
            conn.release();
            // Reinitialize user backup scheduler
            yield initUserBackupScheduler(userId);
            res.json({ success: true, message: 'User backup settings saved' });
        }
        catch (error) {
            console.error('Error updating user backup settings:', error);
            return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
        }
    });
}
// User backup scheduler state (one job per user)
const userSchedulerJobs = new Map();
// Initialize backup scheduler for a specific user
function initUserBackupScheduler(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        try {
            // Cancel existing job for this user
            const existingJob = userSchedulerJobs.get(userId);
            if (existingJob) {
                existingJob.cancel();
                userSchedulerJobs.delete(userId);
            }
            const conn = yield (0, db_1.getConnection)();
            const [rows] = yield conn.query('SELECT * FROM user_backup_settings WHERE userId = ? AND scheduleEnabled = TRUE', [userId]);
            conn.release();
            if (rows.length === 0) {
                console.log(`ℹ️ User ${userId} backup scheduler disabled or not configured`);
                return;
            }
            const settings = rows[0];
            const hour = (_a = settings.scheduleHour) !== null && _a !== void 0 ? _a : 2;
            const minute = (_b = settings.scheduleMinute) !== null && _b !== void 0 ? _b : 0;
            let cronExpression;
            switch (settings.scheduleFrequency) {
                case 'daily':
                    cronExpression = `${minute} ${hour} * * *`;
                    break;
                case 'weekly':
                    cronExpression = `${minute} ${hour} * * ${(_c = settings.scheduleDayOfWeek) !== null && _c !== void 0 ? _c : 0}`;
                    break;
                case 'monthly':
                    cronExpression = `${minute} ${hour} ${(_d = settings.scheduleDayOfMonth) !== null && _d !== void 0 ? _d : 1} * *`;
                    break;
                case 'hourly':
                    cronExpression = `${minute} * * * *`;
                    break;
                default:
                    console.log(`Invalid schedule frequency for user ${userId}`);
                    return;
            }
            const job = schedule.scheduleJob(cronExpression, () => createUserBackup(userId, settings.backupPath, settings.deliveryEmail));
            userSchedulerJobs.set(userId, job);
            console.log(`✅ User ${userId} backup scheduler initialized (${settings.scheduleFrequency} at ${hour}:${minute.toString().padStart(2, '0')})`);
        }
        catch (error) {
            console.error(`Failed to initialize user backup scheduler for ${userId}:`, error);
        }
    });
}
// Create backup for a specific user with optional custom path
function createUserBackup(userId, customPath, email) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`🔄 Running user backup for user ${userId}...`);
        try {
            // Use custom path if provided, otherwise use default backup dir
            let backupDir;
            const trimmedPath = (customPath === null || customPath === void 0 ? void 0 : customPath.trim()) || '';
            if (trimmedPath && trimmedPath.length > 1) {
                // Normalize: resolve UNC/relative paths on Windows hosting
                const resolvedPath = path.resolve(trimmedPath);
                try {
                    yield fs.access(resolvedPath);
                }
                catch (_a) {
                    yield fs.mkdir(resolvedPath, { recursive: true });
                }
                backupDir = resolvedPath;
                console.log(`📁 Using custom backup path: ${resolvedPath}`);
            }
            else {
                backupDir = yield ensureBackupDir();
            }
            const filename = `user-${userId.slice(0, 8)}-${getBackupFilename()}`;
            const sqlFile = path.join(backupDir, filename.replace('.gz', ''));
            const gzFile = path.join(backupDir, filename);
            const hasMysqlDump = isMySQLDumpAvailable();
            if (hasMysqlDump) {
                const mysqldumpCmd = getMySQLCommand('mysqldump');
                const cmd = `"${mysqldumpCmd}" -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p"${DB_PASSWORD}" ` +
                    `--single-transaction --routines --triggers --events ` +
                    `--add-drop-database --add-drop-table --complete-insert ` +
                    `--hex-blob --set-charset --skip-comments --databases ${DB_NAME} > "${sqlFile}"`;
                yield execAsync(cmd, {
                    env: Object.assign(Object.assign({}, process.env), { MYSQL_PWD: DB_PASSWORD }),
                    maxBuffer: 50 * 1024 * 1024
                });
            }
            else {
                yield generatePureJSDump(sqlFile, undefined);
            }
            yield (0, promises_1.pipeline)((0, fs_1.createReadStream)(sqlFile), (0, zlib_1.createGzip)({ level: 9 }), (0, fs_1.createWriteStream)(gzFile));
            yield fs.unlink(sqlFile);
            // Update user backup status
            const conn = yield (0, db_1.getConnection)();
            yield conn.query(`
            UPDATE user_backup_settings 
            SET lastBackupDate = NOW(), lastBackupStatus = 'SUCCESS', lastBackupFilename = ?
            WHERE userId = ?
        `, [filename, userId]);
            // Send email with attachment if email is provided
            if (email) {
                yield sendUserBackupEmail(email, gzFile, filename, true);
            }
            conn.release();
            console.log(`✅ User backup created: ${filename} (path: ${backupDir})`);
            // Clean up user-specific backups (keep last 5)
            yield rotateUserBackups(userId, backupDir);
        }
        catch (error) {
            console.error(`❌ User backup failed for ${userId}:`, error);
            // Update status to failed
            try {
                const conn = yield (0, db_1.getConnection)();
                yield conn.query(`
                UPDATE user_backup_settings 
                SET lastBackupDate = NOW(), lastBackupStatus = 'FAILED'
                WHERE userId = ?
            `, [userId]);
                conn.release();
            }
            catch (e) { }
            // Send failure email if email is provided
            if (email) {
                yield sendUserBackupEmail(email, null, null, false, error.message);
            }
        }
    });
}
// Send backup email to user
function sendUserBackupEmail(email, filePath, filename, success, errorMessage) {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = yield getBackupSettings();
        if (!settings.smtpHost) {
            console.log('📧 Email not configured, skipping user backup email');
            return;
        }
        try {
            const transporter = nodemailer.createTransport({
                host: settings.smtpHost,
                port: settings.smtpPort || 587,
                secure: settings.smtpSecure || false,
                auth: {
                    user: settings.smtpUser,
                    pass: settings.smtpPassword
                }
            });
            const subject = success
                ? `✅ نسختك الاحتياطية جاهزة - ${filename}`
                : '❌ فشل في إنشاء النسخة الاحتياطية';
            const html = success
                ? `<h2>تم إنشاء نسختك الاحتياطية بنجاح</h2>
               <p>مرفق نسخة احتياطية من قاعدة البيانات:</p>
               <ul>
                   <li><strong>الملف:</strong> ${filename}</li>
                   <li><strong>التاريخ:</strong> ${new Date().toLocaleString('ar-EG')}</li>
               </ul>
               <p>يرجى الاحتفاظ بهذا الملف في مكان آمن.</p>`
                : `<h2>فشل في إنشاء النسخة الاحتياطية</h2>
               <p>حدث خطأ أثناء إنشاء نسختك الاحتياطية:</p>
               <pre>${errorMessage}</pre>`;
            const mailOptions = {
                from: settings.smtpUser,
                to: email,
                subject,
                html
            };
            // Attach the backup file if success
            if (success && filePath) {
                mailOptions.attachments = [{
                        filename: filename,
                        path: filePath
                    }];
            }
            yield transporter.sendMail(mailOptions);
            console.log(`📧 User backup email sent to: ${email}`);
        }
        catch (err) {
            console.error('Failed to send user backup email:', err);
        }
    });
}
// Rotate user-specific backups (keep last 5)
function rotateUserBackups(userId, customBackupDir) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const backupDir = customBackupDir || (yield getBackupDir());
            const files = yield fs.readdir(backupDir);
            const userBackups = files.filter(f => f.startsWith(`user-${userId.slice(0, 8)}`) && f.endsWith('.sql.gz'));
            if (userBackups.length <= 5)
                return;
            // Get file dates and sort
            const backupsWithDates = yield Promise.all(userBackups.map((filename) => __awaiter(this, void 0, void 0, function* () {
                const filepath = path.join(backupDir, filename);
                const stats = yield fs.stat(filepath);
                return { filename, filepath, mtime: stats.mtime };
            })));
            // Sort by date (oldest first)
            backupsWithDates.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
            // Delete old backups
            const toDelete = backupsWithDates.slice(0, backupsWithDates.length - 5);
            for (const backup of toDelete) {
                yield fs.unlink(backup.filepath);
                console.log(`🗑️ Rotated old user backup: ${backup.filename}`);
            }
        }
        catch (error) {
            console.error('User backup rotation failed:', error);
        }
    });
}
// Initialize all user backup schedulers on server start
function initAllUserBackupSchedulers() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const conn = yield (0, db_1.getConnection)();
            const [rows] = yield conn.query('SELECT userId FROM user_backup_settings WHERE scheduleEnabled = TRUE');
            conn.release();
            for (const row of rows) {
                yield initUserBackupScheduler(row.userId);
            }
            console.log(`✅ Initialized ${rows.length} user backup schedulers`);
        }
        catch (error) {
            console.error('Failed to initialize user backup schedulers:', error);
        }
    });
}
