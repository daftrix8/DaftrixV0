"use strict";
/**
 * License Key Validator for DaftriX ERP
 * Decodes and validates SHORT license keys in XXXX-XXXX-XXXX-XXXX format
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateLicenseKey = validateLicenseKey;
exports.isLicenseValid = isLicenseValid;
exports.getEnabledModules = getEnabledModules;
const crypto = __importStar(require("crypto"));
// IMPORTANT: This must match the SECRET_KEY in license_generator.py
const SECRET_KEY = process.env.LICENSE_SECRET || process.env.LICENSE_SECRET_KEY || 'DaftriX2024!';
// Reference date for calculating days
const REF_DATE = new Date('2024-01-01');
// Module bit positions (must match Python)
const MODULE_BITS = {
    sales: 0,
    purchase: 1,
    inventory: 2,
    accounting: 3,
    treasury: 4,
    banks: 5,
    partners: 6,
    manufacturing: 7,
    hr: 8,
    vanSales: 9,
};
/**
 * Decode modules from bitmask
 */
function decodeModules(bitmask) {
    const modules = {};
    for (const [key, bit] of Object.entries(MODULE_BITS)) {
        modules[key] = Boolean(bitmask & (1 << bit));
    }
    return modules;
}
/**
 * Convert base32 to buffer
 */
function base32Decode(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    // Normalize and pad
    let clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
    const padding = (8 - (clean.length % 8)) % 8;
    clean += '='.repeat(padding);
    // Decode
    const bits = [];
    for (const char of clean) {
        if (char === '=')
            break;
        const val = alphabet.indexOf(char);
        if (val === -1)
            throw new Error('Invalid base32 character');
        bits.push(val);
    }
    // Convert 5-bit groups to 8-bit bytes
    let buffer = 0;
    let bitsInBuffer = 0;
    const bytes = [];
    for (const val of bits) {
        buffer = (buffer << 5) | val;
        bitsInBuffer += 5;
        while (bitsInBuffer >= 8) {
            bitsInBuffer -= 8;
            bytes.push((buffer >> bitsInBuffer) & 0xFF);
        }
    }
    return Buffer.from(bytes);
}
/**
 * Decode and validate a short license key
 */
function validateLicenseKey(licenseKey) {
    try {
        // Remove dashes and normalize
        const clean = licenseKey.replace(/-/g, '').replace(/\s/g, '').toUpperCase();
        // Decode from base32
        const fullKey = base32Decode(clean);
        if (fullKey.length !== 10) {
            return { valid: false, error: 'Invalid key length' };
        }
        // Extract parts
        const clientHash = fullKey.slice(0, 2);
        const daysBytes = fullKey.slice(2, 4);
        const moduleBytes = fullKey.slice(4, 6);
        const signature = fullKey.slice(6, 10);
        // Verify signature
        const payload = fullKey.slice(0, 6);
        const sigData = Buffer.concat([payload, Buffer.from(SECRET_KEY)]);
        const expectedSig = crypto.createHash('sha256').update(sigData).digest().slice(0, 4);
        if (!signature.equals(expectedSig)) {
            return { valid: false, error: 'Invalid signature - key may be tampered' };
        }
        // Decode days
        const days = daysBytes.readUInt16BE(0);
        const expiryDate = new Date(REF_DATE);
        expiryDate.setDate(expiryDate.getDate() + days);
        // Check expiry
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        expiryDate.setHours(0, 0, 0, 0);
        const isExpired = expiryDate < today;
        const daysRemaining = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        // Decode modules
        const moduleBits = moduleBytes.readUInt16BE(0);
        const modules = decodeModules(moduleBits);
        return {
            valid: true,
            expired: isExpired,
            expiry: expiryDate.toISOString().split('T')[0],
            daysRemaining: daysRemaining,
            modules: modules
        };
    }
    catch (e) {
        return { valid: false, error: e.message || 'Failed to decode key' };
    }
}
/**
 * Check if a license key is currently valid (not expired)
 */
function isLicenseValid(licenseKey) {
    const result = validateLicenseKey(licenseKey);
    return result.valid && !result.expired;
}
/**
 * Get enabled modules from a license key
 */
function getEnabledModules(licenseKey) {
    const result = validateLicenseKey(licenseKey);
    return result.valid ? result.modules || null : null;
}
