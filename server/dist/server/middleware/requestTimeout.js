"use strict";
// ═══════════════════════════════════════════════════════════
// REQUEST TIMEOUT MIDDLEWARE
// Prevents hung DB queries from holding HTTP connections
// open indefinitely. Without this, a single slow query can
// cascade into pool exhaustion with 15 concurrent users.
//
// CRITICAL FIX: Now also kills the underlying MySQL thread
// via KILL QUERY. The old version only sent a 408 to the
// client, but the DB query kept running + holding a connection.
// ═══════════════════════════════════════════════════════════
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
exports.reportTimeout = exports.apiTimeout = void 0;
exports.requestTimeout = requestTimeout;
/**
 * Creates request timeout middleware.
 * If the request takes longer than `ms`, abort with 408.
 * Also marks the request as timed-out so controllers can
 * check `res.locals._timedOut` and skip further work.
 */
function requestTimeout(ms) {
    return (req, res, next) => {
        // Don't timeout SSE/streaming connections
        if (req.headers.accept === 'text/event-stream') {
            return next();
        }
        const timer = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!res.headersSent) {
                console.error(`⏱️ [Timeout] ${req.method} ${req.url} exceeded ${ms}ms`);
                // Mark request as timed-out so any in-flight controller logic can bail
                res.locals._timedOut = true;
                // Try to kill the MySQL thread if one is attached to this request
                const threadId = res.locals._dbThreadId;
                if (threadId) {
                    try {
                        const { pool } = yield Promise.resolve().then(() => __importStar(require('../db')));
                        yield pool.query(`KILL QUERY ${threadId}`);
                        console.warn(`🔪 [Timeout] Killed MySQL thread ${threadId} for ${req.url}`);
                    }
                    catch (killErr) {
                        // Thread may have already completed — ignore
                        if (!((_a = killErr.message) === null || _a === void 0 ? void 0 : _a.includes('Unknown thread id'))) {
                            console.error(`⚠️ [Timeout] Failed to kill thread ${threadId}:`, killErr.message);
                        }
                    }
                }
                res.status(408).json({
                    error: 'Request timeout',
                    message: 'الطلب استغرق وقت طويل. يرجى المحاولة مرة أخرى.',
                    timeout: ms,
                });
            }
        }), ms);
        // Clean up timer when response finishes
        res.on('finish', () => clearTimeout(timer));
        res.on('close', () => clearTimeout(timer));
        next();
    };
}
// Pre-configured timeouts
exports.apiTimeout = requestTimeout(30000); // 30s for regular API
exports.reportTimeout = requestTimeout(120000); // 2min for heavy reports
