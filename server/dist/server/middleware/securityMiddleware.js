"use strict";
/**
 * Security Middleware
 * ====================
 * Adds security HTTP headers and other hardening measures.
 * Uses 'helmet' for standard security headers.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.additionalSecurityHeaders = exports.securityHeaders = void 0;
const helmet_1 = __importDefault(require("helmet"));
/**
 * Core security headers via helmet.
 * Configured for an SPA that loads scripts from CDNs.
 */
exports.securityHeaders = (0, helmet_1.default)({
    // Content-Security-Policy
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'", // Required for Tailwind CDN config script
                // NOTE: 'unsafe-eval' removed — only needed in Vite dev mode, not production.
                "https://cdn.tailwindcss.com",
                "https://aistudiocdn.com",
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'", // Required for Tailwind and inline styles
                "https://fonts.googleapis.com",
                "https://cdn.tailwindcss.com",
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://fonts.googleapis.com",
            ],
            imgSrc: [
                "'self'",
                "data:",
                "blob:",
                "https://grainy-gradients.vercel.app",
                "https://*.tile.openstreetmap.org",
                "https://*.basemaps.cartocdn.com",
                "https://raw.githubusercontent.com",
                "https://cdnjs.cloudflare.com"
            ],
            connectSrc: [
                "'self'",
                "ws:",
                "wss:",
                "https://aistudiocdn.com",
                "https://generativelanguage.googleapis.com",
            ],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            // CRITICAL: Do NOT upgrade HTTP to HTTPS — breaks plain HTTP access (Tailscale IPs)
            upgradeInsecureRequests: null,
        },
    },
    // Strict-Transport-Security (HSTS) — disabled here, applied conditionally below
    // Only sent over HTTPS to avoid breaking plain HTTP access (e.g. Tailscale IPs)
    strictTransportSecurity: false,
    // X-Content-Type-Options: nosniff
    xContentTypeOptions: true,
    // Referrer-Policy
    referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
    },
    // X-Frame-Options: SAMEORIGIN (via frameguard)
    frameguard: {
        action: 'sameorigin',
    },
    // X-DNS-Prefetch-Control: off
    dnsPrefetchControl: {
        allow: false,
    },
    // Hide X-Powered-By
    hidePoweredBy: true,
    // X-XSS-Protection (legacy but harmless)
    xXssProtection: true,
    // Disable these — applied conditionally in additionalSecurityHeaders (HTTPS only)
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    originAgentCluster: false,
});
/**
 * Additional security headers (not included in helmet by default)
 */
const additionalSecurityHeaders = (req, res, next) => {
    // Permissions-Policy: restrict browser features
    // Note: interest-cohort and browsing-topics are not recognized by all browsers
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()');
    // Only apply HTTPS-dependent headers when actually served over HTTPS
    // Plain HTTP (e.g. http://100.x.x.x Tailscale IPs) breaks if these are set
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    if (isSecure) {
        // HSTS: tell browser to always use HTTPS for this origin
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        // Cross-Origin-Opener-Policy: Spectre/Meltdown protection
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        // Cross-Origin-Embedder-Policy: use credentialless so Google Fonts still work
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    }
    next();
};
exports.additionalSecurityHeaders = additionalSecurityHeaders;
