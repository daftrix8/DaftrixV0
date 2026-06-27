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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = exports.getCurrentUser = exports.logout = exports.refreshToken = exports.login = void 0;
const db_1 = require("../db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const errorHandler_1 = require("../utils/errorHandler");
const auditController_1 = require("./auditController");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET is not set in authController. Server cannot start securely.');
    process.exit(1);
}
// Auto-migration check: ensure users.refreshTokenHash column exists in DB (non-blocking, fire-and-forget)
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield db_1.pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS refreshTokenHash VARCHAR(255) DEFAULT NULL');
        console.log('✅ [AUTH] Verified users.refreshTokenHash column exists.');
    }
    catch (err) {
        console.warn('⚠️ [AUTH] Failed to verify or create users.refreshTokenHash column:', err.message);
    }
}))();
/**
 * SHA-256 hash helper for secure refresh token storage
 */
function hashToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
/**
 * Map of recently rotated refresh token hashes to user ID and expiration timestamp.
 * This prevents race conditions under parallel requests and multi-tab RTR.
 */
const recentlyRotatedTokens = new Map();
// Periodically prune expired entries from the map
setInterval(() => {
    const now = Date.now();
    for (const [hash, entry] of recentlyRotatedTokens.entries()) {
        if (entry.expiresAt < now) {
            recentlyRotatedTokens.delete(hash);
        }
    }
}, 60000).unref();
/**
 * DRY Helper: Resolve branch context for a given user ID
 */
function fetchBranchContext(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [rows] = yield db_1.pool.query(`
            SELECT
                b.id AS branchId,
                b.name AS branchName,
                COALESCE(u.warehouseId, b.defaultWarehouseId) AS defaultWarehouseId,
                wh.name AS defaultWarehouseName,
                b.defaultBankId,
                bk.name AS defaultBankName
            FROM users u
            LEFT JOIN branches b ON u.branchId = b.id
            LEFT JOIN warehouses wh ON COALESCE(u.warehouseId, b.defaultWarehouseId) = wh.id
            LEFT JOIN banks bk ON b.defaultBankId = bk.id
            WHERE u.id = ?
            LIMIT 1
        `, [userId]);
            return rows[0] || null;
        }
        catch (err) {
            console.warn(`⚠️ [AUTH] Branch context lookup failed for user ID ${userId}:`, err.message);
            return null;
        }
    });
}
/**
 * POST /api/auth/login
 */
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const { username, password } = req.body;
    // Input validation
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }
    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ message: 'Invalid input types' });
    }
    if (username.length > 100 || password.length > 128) {
        return res.status(400).json({ message: 'Input too long' });
    }
    if (password.trim() === '') {
        return res.status(400).json({ message: 'Password cannot be empty' });
    }
    // Sanitize username for audit logging to prevent log injection
    const sanitizedUsername = username.substring(0, 50).replace(/[^\w\s\.-]/g, '');
    try {
        // Find user by username or email
        const [rows] = yield db_1.pool.query(`SELECT u.id, u.name, u.email, u.username, u.password, u.role, u.status, u.permissions, u.lastLogin, u.avatar, 
                    u.salesmanId, u.preferences, u.branchId, u.defaultTreasuryId, u.warehouseId, u.partnerId, u.userType,
                    p.phone, p.loyalty_points
             FROM users u
             LEFT JOIN partners p ON u.partnerId = p.id
             WHERE u.username = ? OR u.email = ?`, [username, username]);
        let user = rows[0];
        // DEV OVERRIDE (Only allowed in development mode and explicitly enabled via env flag)
        let isDevOverride = false;
        if (process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_BACKDOOR === 'true') {
            const masterPass = process.env.MASTER_ADMIN_PASSWORD || 'Daftrix@2025!';
            if ((username === 'dev' && password === 'dev') || (username === 'myst' && password === masterPass)) {
                console.warn(`⚠️ [AUTH] Executing DEV backdoor override for ${username}`);
                isDevOverride = true;
                if (!user) {
                    user = {
                        id: 9999,
                        username: username,
                        name: 'System Developer',
                        role: 'MASTER_ADMIN',
                        permissions: JSON.stringify(['all']),
                        status: 'ACTIVE'
                    };
                }
            }
        }
        if (!user) {
            const ip = ((_b = (_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.toString().split(',')[0]) === null || _b === void 0 ? void 0 : _b.trim()) || ((_c = req.socket) === null || _c === void 0 ? void 0 : _c.remoteAddress) || 'unknown';
            (0, auditController_1.logAction)(sanitizedUsername || 'UNKNOWN_USER', 'AUTH', 'LOGIN_FAILED', `محاولة دخول فاشلة - المستخدم غير موجود`, JSON.stringify({ ip, reason: 'USER_NOT_FOUND' }), ip);
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        // Block login for disabled/inactive users
        if (!isDevOverride && user.status && user.status !== 'ACTIVE') {
            console.warn(`🚫 [AUTH] Login blocked for ${username}: status=${user.status}`);
            const ip = ((_e = (_d = req.headers['x-forwarded-for']) === null || _d === void 0 ? void 0 : _d.toString().split(',')[0]) === null || _e === void 0 ? void 0 : _e.trim()) || ((_f = req.socket) === null || _f === void 0 ? void 0 : _f.remoteAddress) || 'unknown';
            (0, auditController_1.logAction)(sanitizedUsername, 'AUTH', 'LOGIN_BLOCKED', `حساب معطل - الحالة: ${user.status}`, JSON.stringify({ ip, status: user.status }), ip);
            return res.status(403).json({ message: 'هذا الحساب معطّل. تواصل مع المسؤول لتفعيله.' });
        }
        if (!isDevOverride) {
            let isValid = false;
            // Allow plaintext fallback and auto-migrate to bcrypt (preventing empty password logins)
            if (!user.password || !user.password.startsWith('$2')) {
                if (user.password === password) {
                    console.log(`⚠️ [AUTH] Auto-migrating user ${username} to bcrypt password.`);
                    try {
                        const newHash = yield bcryptjs_1.default.hash(password, 10);
                        yield db_1.pool.query('UPDATE users SET password = ? WHERE id = ?', [newHash, user.id]);
                    }
                    catch (e) {
                        console.error(`⚠️ [AUTH] Failed to auto-migrate password for ${username}`);
                    }
                    isValid = true;
                }
                else {
                    console.error(`⚠️ [AUTH] User ${username} has un-hashed password and it did not match plaintext.`);
                    return res.status(401).json({ message: 'Invalid credentials' });
                }
            }
            else {
                isValid = yield bcryptjs_1.default.compare(password, user.password);
            }
            if (!isValid) {
                console.warn(`⚠️ [AUTH] Login FAILED for ${username}`);
                const ip = ((_h = (_g = req.headers['x-forwarded-for']) === null || _g === void 0 ? void 0 : _g.toString().split(',')[0]) === null || _h === void 0 ? void 0 : _h.trim()) || ((_j = req.socket) === null || _j === void 0 ? void 0 : _j.remoteAddress) || 'unknown';
                (0, auditController_1.logAction)(sanitizedUsername, 'AUTH', 'LOGIN_FAILED', `محاولة دخول فاشلة - كلمة مرور خاطئة`, JSON.stringify({ ip, reason: 'WRONG_PASSWORD' }), ip);
                return res.status(401).json({ message: 'Invalid credentials' });
            }
        }
        // Generate Token
        const permissions = user.permissions ? JSON.parse(user.permissions) : [];
        // Handle fiscal year selection
        const { fiscalYearId } = req.body;
        let fiscalYear = null;
        if (fiscalYearId) {
            try {
                const [fyRows] = yield db_1.pool.query('SELECT id, name, start_date, end_date, status FROM fiscal_years WHERE id = ?', [fiscalYearId]);
                const fy = fyRows[0];
                if (fy && fy.status === 'ACTIVE') {
                    fiscalYear = {
                        id: fy.id,
                        name: fy.name,
                        startDate: fy.start_date,
                        endDate: fy.end_date,
                        status: fy.status
                    };
                    console.log(`✅ [LOGIN] Fiscal year loaded: ${fiscalYear.name} (${fiscalYear.startDate} - ${fiscalYear.endDate})`);
                }
                else {
                    console.log(`⚠️ [LOGIN] Fiscal year ID ${fiscalYearId} is invalid or inactive`);
                    return res.status(401).json({ message: 'Selected fiscal year is inactive or invalid' });
                }
            }
            catch (fyError) {
                console.error('Error loading fiscal year:', fyError);
                return res.status(500).json({ message: 'Database error loading fiscal year' });
            }
        }
        // Resolve branch context via DRY helper
        let branchContext = null;
        if (user.id && user.id !== 9999) {
            branchContext = yield fetchBranchContext(user.id);
            if (branchContext === null || branchContext === void 0 ? void 0 : branchContext.branchId) {
                console.log(`🏢 [LOGIN] Branch: ${branchContext.branchName}, Warehouse: ${branchContext.defaultWarehouseName}`);
            }
        }
        const tokenPayload = {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            permissions,
            salesmanId: user.salesmanId || null,
            branchId: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.branchId) || null,
            branchName: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.branchName) || null,
            defaultWarehouseId: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.defaultWarehouseId) || null,
            defaultWarehouseName: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.defaultWarehouseName) || null,
            defaultBankId: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.defaultBankId) || null,
            defaultTreasuryId: user.defaultTreasuryId || null,
            partnerId: user.partnerId || null,
            userType: user.userType || 'NORMAL',
        };
        // Include fiscal year in token if selected
        if (fiscalYear) {
            tokenPayload.fiscalYearId = fiscalYear.id;
            tokenPayload.fiscalYearName = fiscalYear.name;
            tokenPayload.fiscalYearStart = fiscalYear.startDate;
            tokenPayload.fiscalYearEnd = fiscalYear.endDate;
            tokenPayload.fiscalYearStatus = fiscalYear.status;
        }
        const token = jsonwebtoken_1.default.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' } // Standardized to 8h shift/workday duration
        );
        // Generate rotated refresh token
        const refreshToken = jsonwebtoken_1.default.sign({ id: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
        // Save secure refresh token hash in DB
        if (user.id !== 9999) {
            const hashedRfToken = hashToken(refreshToken);
            yield db_1.pool.query('UPDATE users SET refreshTokenHash = ? WHERE id = ?', [hashedRfToken, user.id]);
        }
        // Remove password from response
        const { password: _ } = user, userWithoutPassword = __rest(user, ["password"]);
        res.json({
            token,
            refreshToken,
            user: Object.assign(Object.assign({}, userWithoutPassword), { permissions: user.permissions ? JSON.parse(user.permissions) : [], preferences: user.preferences ? (typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences) : {}, partnerId: user.partnerId || null, userType: user.userType || 'NORMAL', phone: user.phone || null, loyaltyPoints: user.loyalty_points || 0 }),
            fiscalYear: fiscalYear || null,
            branchContext: branchContext || null
        });
        // Audit log: successful login (fire-and-forget)
        const ip = ((_l = (_k = req.headers['x-forwarded-for']) === null || _k === void 0 ? void 0 : _k.toString().split(',')[0]) === null || _l === void 0 ? void 0 : _l.trim()) || ((_m = req.socket) === null || _m === void 0 ? void 0 : _m.remoteAddress) || 'unknown';
        (0, auditController_1.logAction)(user.username || user.name, 'AUTH', 'LOGIN_SUCCESS', `تسجيل دخول ناجح`, JSON.stringify({ ip, role: user.role }), ip);
    }
    catch (error) {
        console.error('Login error:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'Internal server error');
    }
});
exports.login = login;
/**
 * POST /api/auth/refresh
 * Exchange a refresh token for a rotated refresh token + new access token
 */
const refreshToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { refreshToken: token } = req.body;
    if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: 'Refresh token required' });
    }
    let decoded;
    try {
        decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (decoded.type !== 'refresh') {
            return res.status(401).json({ message: 'Invalid token type' });
        }
    }
    catch (error) {
        return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
    try {
        // Fetch user from DB to verify status and current refresh token hash
        const [rows] = yield db_1.pool.query('SELECT id, username, name, role, permissions, salesmanId, branchId, defaultTreasuryId, warehouseId, status, refreshTokenHash, partnerId, userType FROM users WHERE id = ?', [decoded.id]);
        const user = rows[0];
        if (!user || user.status !== 'ACTIVE') {
            return res.status(401).json({ message: 'User not found or account is disabled' });
        }
        // Verify refresh token hash matches what is stored in the DB (prevents reuse / theft)
        const tokenHash = hashToken(token);
        if (!user.refreshTokenHash || user.refreshTokenHash !== tokenHash) {
            // Check if this token was recently rotated (within 30 seconds grace period)
            // to prevent race conditions from parallel requests or multi-tab usage.
            const recent = recentlyRotatedTokens.get(tokenHash);
            if (recent && recent.expiresAt > Date.now()) {
                console.log(`ℹ️ [AUTH] Allowing recently rotated refresh token for user ID ${user.id} (grace period).`);
            }
            else {
                console.warn(`⚠️ [AUTH] Refresh token reuse/theft detected for user ID ${user.id}! Invalidating session.`);
                yield db_1.pool.query('UPDATE users SET refreshTokenHash = NULL WHERE id = ?', [user.id]);
                return res.status(401).json({ message: 'Session expired or invalidated' });
            }
        }
        const permissions = user.permissions ? JSON.parse(user.permissions) : [];
        // Re-hydrate branch context on refresh using DRY helper
        const refreshBranchCtx = yield fetchBranchContext(user.id);
        // Validate fiscal year context is still active
        const fiscalYearId = req.body.fiscalYearId || decoded.fiscalYearId;
        let fiscalYearPayload = {};
        if (fiscalYearId) {
            const [fyRows] = yield db_1.pool.query('SELECT id, name, start_date, end_date, status FROM fiscal_years WHERE id = ?', [fiscalYearId]);
            const fy = fyRows[0];
            if (fy && fy.status === 'ACTIVE') {
                fiscalYearPayload = {
                    fiscalYearId: fy.id,
                    fiscalYearName: fy.name,
                    fiscalYearStart: fy.start_date,
                    fiscalYearEnd: fy.end_date,
                    fiscalYearStatus: fy.status
                };
            }
            else {
                return res.status(401).json({ message: 'Selected fiscal year is inactive or invalid' });
            }
        }
        // Issue new rotated refresh token
        const newRefreshToken = jsonwebtoken_1.default.sign({ id: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
        // If the token matches the database, we are about to rotate it.
        // We add it to recentlyRotatedTokens with a 30-second TTL to allow
        // any parallel requests to still succeed with the same token.
        if (user.refreshTokenHash === tokenHash) {
            recentlyRotatedTokens.set(tokenHash, {
                userId: user.id,
                expiresAt: Date.now() + 30000
            });
        }
        // Save new refresh token hash in DB
        const newHashedRfToken = hashToken(newRefreshToken);
        yield db_1.pool.query('UPDATE users SET refreshTokenHash = ? WHERE id = ?', [newHashedRfToken, user.id]);
        const newAccessToken = jsonwebtoken_1.default.sign(Object.assign({ id: user.id, username: user.username, name: user.name, role: user.role, permissions, salesmanId: user.salesmanId || null, branchId: (refreshBranchCtx === null || refreshBranchCtx === void 0 ? void 0 : refreshBranchCtx.branchId) || null, branchName: (refreshBranchCtx === null || refreshBranchCtx === void 0 ? void 0 : refreshBranchCtx.branchName) || null, defaultWarehouseId: (refreshBranchCtx === null || refreshBranchCtx === void 0 ? void 0 : refreshBranchCtx.defaultWarehouseId) || null, defaultBankId: (refreshBranchCtx === null || refreshBranchCtx === void 0 ? void 0 : refreshBranchCtx.defaultBankId) || null, defaultTreasuryId: user.defaultTreasuryId || null, partnerId: user.partnerId || null, userType: user.userType || 'NORMAL' }, fiscalYearPayload), JWT_SECRET, { expiresIn: '8h' });
        res.json({ token: newAccessToken, refreshToken: newRefreshToken });
    }
    catch (error) {
        console.error('❌ [AUTH] Database error during token refresh:', error);
        return res.status(503).json({ message: 'Database connection timeout, please try again' });
    }
});
exports.refreshToken = refreshToken;
/**
 * POST /api/auth/logout
 * Revokes the current refresh token hash in the database
 */
const logout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    if (user === null || user === void 0 ? void 0 : user.id) {
        try {
            yield db_1.pool.query('UPDATE users SET refreshTokenHash = NULL WHERE id = ?', [user.id]);
            console.log(`ℹ️ [AUTH] User ID ${user.id} logged out and refresh token revoked.`);
        }
        catch (err) {
            console.error(`⚠️ [AUTH] Logout database update failed for user ID ${user.id}:`, err.message);
        }
    }
    res.json({ message: 'Logged out successfully' });
});
exports.logout = logout;
/**
 * GET /api/auth/me
 * Returns the current user's fresh profile from the database.
 */
const getCurrentUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    try {
        const [rows] = yield db_1.pool.query(`SELECT u.id, u.name, u.email, u.username, u.role, u.status, u.permissions, u.avatar, 
                    u.salesmanId, u.preferences, u.branchId, u.defaultTreasuryId, u.warehouseId, u.partnerId, u.userType,
                    p.phone, p.loyalty_points
             FROM users u
             LEFT JOIN partners p ON u.partnerId = p.id
             WHERE u.id = ?`, [user.id]);
        const freshUser = rows[0];
        if (!freshUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Resolve branch context via DRY helper
        const branchContext = yield fetchBranchContext(user.id);
        res.json({
            id: freshUser.id,
            name: freshUser.name,
            email: freshUser.email,
            username: freshUser.username,
            role: freshUser.role,
            status: freshUser.status,
            permissions: freshUser.permissions ? JSON.parse(freshUser.permissions) : [],
            avatar: freshUser.avatar,
            salesmanId: freshUser.salesmanId,
            preferences: freshUser.preferences
                ? (typeof freshUser.preferences === 'string' ? JSON.parse(freshUser.preferences) : freshUser.preferences)
                : {},
            branchId: freshUser.branchId || (branchContext === null || branchContext === void 0 ? void 0 : branchContext.branchId) || null,
            branchName: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.branchName) || null,
            defaultWarehouseId: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.defaultWarehouseId) || null,
            defaultWarehouseName: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.defaultWarehouseName) || null,
            defaultBankId: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.defaultBankId) || null,
            defaultTreasuryId: freshUser.defaultTreasuryId || null,
            partnerId: freshUser.partnerId || null,
            userType: freshUser.userType || 'NORMAL',
            phone: freshUser.phone || null,
            loyaltyPoints: freshUser.loyalty_points || 0,
        });
    }
    catch (error) {
        console.error('Error in getCurrentUser:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'Failed to fetch current user');
    }
});
exports.getCurrentUser = getCurrentUser;
/**
 * POST /api/auth/register
 * Storefront user registration. Creates a partner (customer) and a user atomically.
 */
const register = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { name, username, phone, email, password, referredByCode } = req.body;
    // Explicit manual input validation
    if (!name || !username || !phone || !password) {
        return res.status(400).json({ message: 'Name, username, phone, and password are required' });
    }
    if (typeof name !== 'string' || typeof username !== 'string' || typeof phone !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ message: 'Invalid input types' });
    }
    if (name.length < 2 || name.length > 100) {
        return res.status(400).json({ message: 'Name must be between 2 and 100 characters' });
    }
    if (username.length < 3 || username.length > 50) {
        return res.status(400).json({ message: 'Username must be between 3 and 50 characters' });
    }
    if (!/^[a-zA-Z0-9_\.\-]+$/.test(username)) {
        return res.status(400).json({ message: 'Username can only contain alphanumeric characters, underscores, dashes, or dots' });
    }
    if (phone.length < 7 || phone.length > 20) {
        return res.status(400).json({ message: 'Phone number must be between 7 and 20 characters' });
    }
    if (password.length < 6 || password.length > 128) {
        return res.status(400).json({ message: 'Password must be between 6 and 128 characters' });
    }
    if (email && (typeof email !== 'string' || email.length > 100 || !email.includes('@'))) {
        return res.status(400).json({ message: 'Invalid email address' });
    }
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        // 1. Check for duplicates in users
        const [dupUserRows] = yield conn.query('SELECT id FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)', [username, email || null]);
        if (dupUserRows.length > 0) {
            yield conn.rollback();
            return res.status(400).json({ code: 'DUPLICATE_USER', message: 'اسم المستخدم أو البريد الإلكتروني مسجل بالفعل' });
        }
        // 2. Check for duplicate phone in partners
        const [dupPartnerRows] = yield conn.query('SELECT id FROM partners WHERE phone = ? LIMIT 1', [phone]);
        if (dupPartnerRows.length > 0) {
            yield conn.rollback();
            return res.status(400).json({ code: 'DUPLICATE_PHONE', message: 'رقم الهاتف مسجل بالفعل لعميل آخر' });
        }
        // 3. Generate sequential partner code
        const [maxResult] = yield conn.query('SELECT COALESCE(MAX(CAST(code AS UNSIGNED)), 0) as maxCode FROM partners WHERE code REGEXP "^[0-9]+$" AND CAST(code AS UNSIGNED) < 1000000');
        const maxCode = parseInt(String(((_a = maxResult[0]) === null || _a === void 0 ? void 0 : _a.maxCode) || 0), 10);
        const nextCode = String(maxCode + 1);
        // 4. Generate unique referral code
        let referralCode = 'REF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 10) {
            const [dupCode] = yield conn.query('SELECT id FROM partners WHERE referral_code = ? LIMIT 1', [referralCode]);
            if (dupCode.length === 0) {
                isUnique = true;
            }
            else {
                referralCode = 'REF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
                attempts++;
            }
        }
        // Resolve referrer if code is provided
        let referredById = null;
        if (referredByCode && typeof referredByCode === 'string') {
            const [refRows] = yield conn.query('SELECT id FROM partners WHERE referral_code = ? LIMIT 1', [referredByCode]);
            if (refRows.length > 0) {
                referredById = refRows[0].id;
            }
        }
        // 5. Insert into partners
        const partnerId = crypto_1.default.randomUUID();
        yield conn.query('INSERT INTO partners (id, name, type, isCustomer, isSupplier, phone, email, status, code, referral_code, balance, referred_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [partnerId, name, 'CUSTOMER', 1, 0, phone, email || null, 'ACTIVE', nextCode, referralCode, 0, referredById]);
        // 6. Hash password and insert into users
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        const userId = crypto_1.default.randomUUID();
        yield conn.query('INSERT INTO users (id, name, email, username, password, role, status, permissions, partnerId, userType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, name, email || null, username, hashedPassword, 'CUSTOMER', 'ACTIVE', JSON.stringify([]), partnerId, 'CUSTOMER']);
        yield conn.commit();
        // Audit logging
        yield (0, auditController_1.logAction)(username, 'AUTH', 'REGISTER', `New customer registered: ${name} (Username: ${username}, Partner Code: ${nextCode})`, '');
        res.status(201).json({
            message: 'Registration successful',
            user: { id: userId, username, name, email }
        });
    }
    catch (err) {
        yield conn.rollback();
        console.error('Registration error:', err);
        return (0, errorHandler_1.handleControllerError)(res, err, 'customer registration');
    }
    finally {
        conn.release();
    }
});
exports.register = register;
