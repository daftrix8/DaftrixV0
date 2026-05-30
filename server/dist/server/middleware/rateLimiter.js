"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.heavyQueryLimiter = exports.uploadLimiter = exports.reportLimiter = exports.createLimiter = exports.authLimiter = exports.apiLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// ═══════════════════════════════════════════════════════════
// RATE LIMITING — INTERNAL ERP (NOT a public API)
//
// This ERP runs on private LANs where 15-30 users share one
// public IP behind NAT. The keyGenerator tries req.user?.id
// but apiLimiter runs BEFORE auth middleware, so it always
// falls back to IP. All LAN users share ONE bucket.
//
// Strategy:
//   - apiLimiter: extremely generous — just a safety net
//     against runaway scripts, not real user throttling
//   - authLimiter: moderate — prevent brute-force but allow
//     a full office to log in without issues
//   - Skip rate limiting entirely for cheap public GETs
// ═══════════════════════════════════════════════════════════
// Public/lightweight endpoints that fire on every page load.
// These are cheap GETs that every browser tab hits simultaneously —
// rate limiting them causes cascading 429s on page load.
const SKIP_RATE_LIMIT_PATHS = [
    '/settings/branding',
    '/fiscal-years/list',
    '/health',
    '/boot-status',
    '/sse',
    '/users', // User list fetched on many pages
    '/dashboard', // Dashboard KPIs
];
// General API rate limiter — safety net only
// 20,000 req/15min ≈ 1,333/min — even 30 heavy users won't hit this
exports.apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20000, // Safety net: only triggers on runaway loops/scripts
    keyGenerator: (req) => {
        const user = req.user;
        return (user === null || user === void 0 ? void 0 : user.id) || req.ip || 'anonymous';
    },
    skip: (req) => {
        // Don't rate-limit cheap public GETs
        return SKIP_RATE_LIMIT_PATHS.some(p => req.path.startsWith(p));
    },
    message: {
        error: 'تم تجاوز عدد الطلبات المسموح بها. يرجى المحاولة لاحقاً.',
        message_en: 'Too many requests, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: false,
});
// Auth limiter — the only one that actually matters for security
// 100 attempts per 15 min per IP — a full office can log in freely,
// but automated brute-force tools will still get blocked
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 login attempts per IP — generous for office, blocks brute-force
    message: {
        error: 'تم تجاوز عدد محاولات تسجيل الدخول. يرجى المحاولة لاحقاً.',
        message_en: 'Too many login attempts, please try again after 15 minutes.',
        retryAfter: '15 minutes'
    },
    skipSuccessfulRequests: true, // Successful logins don't count
    validate: false,
});
// Create/Update operations — generous for ERP workflows
exports.createLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 120 writes/min — fast data entry won't be throttled
    message: {
        error: 'تم تجاوز عدد عمليات الإنشاء/التحديث. يرجى الانتظار قليلاً.',
        message_en: 'Too many create/update operations, please slow down.',
        retryAfter: '1 minute'
    },
    validate: false,
});
// Report generation — still somewhat restrictive (these are genuinely heavy)
exports.reportLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 reports/min — enough for any human workflow
    message: {
        error: 'تم تجاوز عدد طلبات التقارير. يرجى الانتظار قليلاً.',
        message_en: 'Too many report requests, please wait a moment.',
        retryAfter: '1 minute'
    },
    validate: false,
});
// File upload limiter
exports.uploadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 uploads/min
    message: {
        error: 'تم تجاوز عدد عمليات الرفع. يرجى الانتظار قليلاً.',
        message_en: 'Too many upload requests, please wait.',
        retryAfter: '1 minute'
    },
    validate: false,
});
// Heavy database queries
exports.heavyQueryLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 heavy queries/min
    message: {
        error: 'تم تجاوز عدد الاستعلامات الكبيرة. يرجى الانتظار قليلاً.',
        message_en: 'Too many database queries, please slow down.',
        retryAfter: '1 minute'
    },
    validate: false,
});
