"use strict";
/**
 * Server-side Brand Configuration
 *
 * Mirrors the frontend brandConfig.ts but uses process.env instead of import.meta.env.
 * Used in API responses, email templates, PDF generation, and anywhere the server
 * needs to reference the product brand.
 *
 * Priority chain:
 *   1. Per-tenant systemConfig from DB (highest)
 *   2. Environment variables (BRAND_*)
 *   3. Hardcoded defaults (fallback)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVER_BRAND = void 0;
exports.resolveServerBrandName = resolveServerBrandName;
exports.SERVER_BRAND = {
    /** Full product name */
    name: process.env.BRAND_NAME || 'DaftriX ERP',
    /** Short name for compact contexts */
    shortName: process.env.BRAND_SHORT || 'DaftriX',
    /** Legal entity name for documents */
    legalName: process.env.BRAND_LEGAL || 'DaftriX Software',
    /** Product version */
    version: '2.5.0',
    /** Support contact */
    supportEmail: process.env.SUPPORT_EMAIL || '',
    /** Company website */
    website: process.env.BRAND_WEBSITE || '',
    /** Copyright year */
    copyrightYear: new Date().getFullYear(),
};
/**
 * Resolves brand name from DB config, falling back to env/default.
 */
function resolveServerBrandName(dbConfig) {
    if (dbConfig === null || dbConfig === void 0 ? void 0 : dbConfig.appName)
        return dbConfig.appName;
    return exports.SERVER_BRAND.name;
}
