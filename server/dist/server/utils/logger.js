"use strict";
// ═══════════════════════════════════════════════════════════
// CONDITIONAL LOGGER
// Suppresses verbose debug logs in production to avoid
// blocking the event loop with synchronous console.log calls.
// 15 users × 50 logs per invoice = 750 sync writes per batch.
// ═══════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.logDebug = logDebug;
exports.logWarn = logWarn;
exports.logError = logError;
exports.logInfo = logInfo;
const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
/**
 * Debug log — only prints in development mode.
 * Use for: request tracing, data inspection, flow debugging.
 * In production, these vanish completely (zero overhead).
 */
function logDebug(message, ...args) {
    if (isDev)
        console.log(message, ...args);
}
/**
 * Warning log — always prints.
 * Use for: unexpected but non-fatal situations.
 */
function logWarn(message, ...args) {
    console.warn(message, ...args);
}
/**
 * Error log — always prints.
 * Use for: actual errors that need attention.
 */
function logError(message, ...args) {
    console.error(message, ...args);
}
/**
 * Info log — always prints (for important operational events).
 * Use for: server start, migrations, scheduled tasks.
 */
function logInfo(message, ...args) {
    console.log(message, ...args);
}
