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
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportAuditLogs = exports.getAuditStats = exports.getAuditLogs = exports.logAction = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
// Helper to log actions (internal use)
const logAction = (user, module, action, description, details, ipAddress) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('🔍 AUDIT LOG:', { user, module, action, description, details });
        yield db_1.pool.query(`INSERT INTO audit_logs (id, date, user, module, action, description, details)
             VALUES (?, NOW(), ?, ?, ?, ?, ?)`, [(0, crypto_1.randomUUID)(), user, module, action, description, details]);
        console.log('✅ Audit log saved successfully');
    }
    catch (error) {
        console.error('❌ Failed to create audit log:', error);
    }
});
exports.logAction = logAction;
// Get audit logs with pagination and filtering
const getAuditLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authReq = req;
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 200, 1000); // Allow up to 1000
        const offset = (page - 1) * limit;
        // Filter parameters
        const user = req.query.user;
        const module = req.query.module;
        const action = req.query.action;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const search = req.query.search;
        // Build WHERE clause
        let whereConditions = [];
        let params = [];
        // ═══════════════════════════════════════════
        // MANDATORY: Fiscal Year Hard Boundary
        // ═══════════════════════════════════════════
        if (authReq.fiscalYearFilter) {
            whereConditions.push('date >= ? AND date <= ?');
            params.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        if (user) {
            whereConditions.push('user = ?');
            params.push(user);
        }
        if (module) {
            whereConditions.push('module = ?');
            params.push(module);
        }
        if (action) {
            // Support server-side action filtering
            if (action === 'CREATE') {
                whereConditions.push("(LOWER(action) LIKE '%create%' OR LOWER(action) LIKE '%add%' OR LOWER(action) LIKE '%new%')");
            }
            else if (action === 'UPDATE') {
                whereConditions.push("(LOWER(action) LIKE '%update%' OR LOWER(action) LIKE '%edit%')");
            }
            else if (action === 'DELETE') {
                whereConditions.push("(LOWER(action) LIKE '%delete%' OR LOWER(action) LIKE '%remove%' OR LOWER(action) LIKE '%void%')");
            }
            else if (action === 'AUTH') {
                whereConditions.push("(LOWER(action) LIKE '%login%' OR LOWER(action) LIKE '%logout%')");
            }
            else {
                whereConditions.push('action = ?');
                params.push(action);
            }
        }
        if (startDate) {
            whereConditions.push('date >= ?');
            params.push(startDate);
        }
        if (endDate) {
            whereConditions.push('date <= ?');
            params.push(endDate + ' 23:59:59');
        }
        if (search) {
            whereConditions.push('(description LIKE ? OR details LIKE ? OR user LIKE ? OR module LIKE ? OR action LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';
        // Get total count
        const [countResult] = yield db_1.pool.query(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`, params);
        const total = countResult[0].total;
        // Get paginated data
        const [rows] = yield db_1.pool.query(`SELECT * FROM audit_logs ${whereClause} ORDER BY date DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
        res.json({
            logs: rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getAuditLogs = getAuditLogs;
// Get audit stats - aggregated data for dashboard
const getAuditStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authReq = req;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        let whereConditions = [];
        let params = [];
        // MANDATORY: Fiscal Year Hard Boundary
        if (authReq.fiscalYearFilter) {
            whereConditions.push('date >= ?');
            params.push(authReq.fiscalYearFilter.startDate);
            whereConditions.push('date <= ?');
            params.push(authReq.fiscalYearFilter.endDate);
        }
        if (startDate) {
            whereConditions.push('date >= ?');
            params.push(startDate);
        }
        if (endDate) {
            whereConditions.push('date <= ?');
            params.push(endDate + ' 23:59:59');
        }
        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';
        // Run all stats queries in parallel
        const [[totalResult], [userBreakdown], [moduleBreakdown], [actionBreakdown], [hourlyBreakdown], [dailyBreakdown], [recentDeletions], [uniqueUsersResult], [uniqueModulesResult],] = yield Promise.all([
            // Total count
            db_1.pool.query(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`, params),
            // Per-user breakdown
            db_1.pool.query(`SELECT user, COUNT(*) as count FROM audit_logs ${whereClause} GROUP BY user ORDER BY count DESC LIMIT 20`, params),
            // Per-module breakdown
            db_1.pool.query(`SELECT module, COUNT(*) as count FROM audit_logs ${whereClause} GROUP BY module ORDER BY count DESC`, params),
            // Per-action breakdown (categorized)
            db_1.pool.query(`SELECT 
                    CASE
                        WHEN LOWER(action) LIKE '%delete%' OR LOWER(action) LIKE '%remove%' OR LOWER(action) LIKE '%void%' THEN 'DELETE'
                        WHEN LOWER(action) LIKE '%create%' OR LOWER(action) LIKE '%add%' OR LOWER(action) LIKE '%new%' THEN 'CREATE'
                        WHEN LOWER(action) LIKE '%update%' OR LOWER(action) LIKE '%edit%' THEN 'UPDATE'
                        WHEN LOWER(action) LIKE '%login%' OR LOWER(action) LIKE '%logout%' THEN 'AUTH'
                        ELSE 'OTHER'
                    END as actionCategory,
                    COUNT(*) as count
                FROM audit_logs ${whereClause}
                GROUP BY actionCategory
                ORDER BY count DESC`, params),
            // Hourly breakdown (last 24h)
            db_1.pool.query(`SELECT HOUR(date) as hour, COUNT(*) as count 
                FROM audit_logs 
                WHERE date >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                GROUP BY hour
                ORDER BY hour`, []),
            // Daily breakdown (last 30 days)
            db_1.pool.query(`SELECT DATE(date) as day, COUNT(*) as count 
                FROM audit_logs 
                WHERE date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                GROUP BY day
                ORDER BY day`, []),
            // Recent deletions (last 24h)
            db_1.pool.query(`SELECT id, date, user, module, action, description, details
                FROM audit_logs
                WHERE date >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                AND (LOWER(action) LIKE '%delete%' OR LOWER(action) LIKE '%remove%' OR LOWER(action) LIKE '%void%')
                ORDER BY date DESC
                LIMIT 50`, []),
            // Distinct users list
            db_1.pool.query(`SELECT DISTINCT user FROM audit_logs ORDER BY user`, []),
            // Distinct modules list
            db_1.pool.query(`SELECT DISTINCT module FROM audit_logs ORDER BY module`, []),
        ]);
        res.json({
            total: totalResult[0].total,
            userBreakdown: userBreakdown,
            moduleBreakdown: moduleBreakdown,
            actionBreakdown: actionBreakdown,
            hourlyActivity: hourlyBreakdown,
            dailyActivity: dailyBreakdown,
            recentDeletions: recentDeletions,
            uniqueUsers: uniqueUsersResult.map(u => u.user),
            uniqueModules: uniqueModulesResult.map(m => m.module),
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getAuditStats = getAuditStats;
// Export ALL audit logs (no pagination limit)
const exportAuditLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authReq = req;
        // Filter parameters
        const user = req.query.user;
        const module = req.query.module;
        const action = req.query.action;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const search = req.query.search;
        let whereConditions = [];
        let params = [];
        // MANDATORY: Fiscal Year Hard Boundary
        if (authReq.fiscalYearFilter) {
            whereConditions.push('date >= ? AND date <= ?');
            params.push(authReq.fiscalYearFilter.startDate, authReq.fiscalYearFilter.endDate);
        }
        if (user) {
            whereConditions.push('user = ?');
            params.push(user);
        }
        if (module) {
            whereConditions.push('module = ?');
            params.push(module);
        }
        if (action) {
            if (action === 'CREATE') {
                whereConditions.push("(LOWER(action) LIKE '%create%' OR LOWER(action) LIKE '%add%' OR LOWER(action) LIKE '%new%')");
            }
            else if (action === 'UPDATE') {
                whereConditions.push("(LOWER(action) LIKE '%update%' OR LOWER(action) LIKE '%edit%')");
            }
            else if (action === 'DELETE') {
                whereConditions.push("(LOWER(action) LIKE '%delete%' OR LOWER(action) LIKE '%remove%' OR LOWER(action) LIKE '%void%')");
            }
            else if (action === 'AUTH') {
                whereConditions.push("(LOWER(action) LIKE '%login%' OR LOWER(action) LIKE '%logout%')");
            }
            else {
                whereConditions.push('action = ?');
                params.push(action);
            }
        }
        if (startDate) {
            whereConditions.push('date >= ?');
            params.push(startDate);
        }
        if (endDate) {
            whereConditions.push('date <= ?');
            params.push(endDate + ' 23:59:59');
        }
        if (search) {
            whereConditions.push('(description LIKE ? OR details LIKE ? OR user LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';
        // Get ALL matching logs (up to 50,000 cap for safety)
        const [rows] = yield db_1.pool.query(`SELECT * FROM audit_logs ${whereClause} ORDER BY date DESC LIMIT 50000`, params);
        res.json({
            logs: rows,
            total: rows.length
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.exportAuditLogs = exportAuditLogs;
