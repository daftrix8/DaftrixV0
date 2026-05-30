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
exports.suggestArticles = exports.getCategories = exports.deleteArticle = exports.updateArticle = exports.createArticle = exports.getArticleById = exports.getArticles = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const auditController_1 = require("./auditController");
// ── List / Search articles ──
const getArticles = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { search, category, featured, limit = 50, offset = 0 } = req.query;
        let query = `SELECT * FROM kb_articles WHERE isActive = 1`;
        const params = [];
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        if (featured === 'true') {
            query += ' AND isFeatured = 1';
        }
        if (search && String(search).trim().length > 0) {
            const term = String(search).trim();
            // FULLTEXT needs 2+ chars in BOOLEAN MODE; fall back to LIKE for short queries
            if (term.length >= 2) {
                query += ` AND (MATCH(question, answer) AGAINST(? IN BOOLEAN MODE) OR question LIKE ? OR answer LIKE ?)`;
                // Append wildcard for boolean mode matching
                params.push(`${term}*`, `%${term}%`, `%${term}%`);
            }
            else {
                query += ` AND (question LIKE ? OR answer LIKE ?)`;
                params.push(`%${term}%`, `%${term}%`);
            }
        }
        query += ' ORDER BY isFeatured DESC, viewCount DESC, updatedAt DESC LIMIT ? OFFSET ?';
        params.push(Number(limit), Number(offset));
        const [rows] = yield (0, db_1.safePoolQuery)(query, params);
        // Total count for pagination
        let countQuery = `SELECT COUNT(*) as total FROM kb_articles WHERE isActive = 1`;
        const countParams = [];
        if (category) {
            countQuery += ' AND category = ?';
            countParams.push(category);
        }
        if (featured === 'true') {
            countQuery += ' AND isFeatured = 1';
        }
        if (search && String(search).trim().length > 0) {
            const term = String(search).trim();
            if (term.length >= 2) {
                countQuery += ` AND (MATCH(question, answer) AGAINST(? IN BOOLEAN MODE) OR question LIKE ? OR answer LIKE ?)`;
                countParams.push(`${term}*`, `%${term}%`, `%${term}%`);
            }
            else {
                countQuery += ` AND (question LIKE ? OR answer LIKE ?)`;
                countParams.push(`%${term}%`, `%${term}%`);
            }
        }
        const [countRows] = yield (0, db_1.safePoolQuery)(countQuery, countParams);
        // Parse JSON fields
        const articles = rows.map(parseArticleRow);
        res.json({ success: true, data: articles, total: ((_a = countRows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0 });
    }
    catch (error) {
        console.error('Error fetching KB articles:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch articles' });
    }
});
exports.getArticles = getArticles;
// ── Get single article (increments viewCount) ──
const getArticleById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [rows] = yield (0, db_1.safePoolQuery)(`SELECT * FROM kb_articles WHERE id = ? AND isActive = 1`, [id]);
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Article not found' });
        }
        // Increment view count (fire-and-forget)
        (0, db_1.safePoolQuery)(`UPDATE kb_articles SET viewCount = viewCount + 1 WHERE id = ?`, [id]).catch(() => { });
        res.json({ success: true, data: parseArticleRow(rows[0]) });
    }
    catch (error) {
        console.error('Error fetching KB article:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch article' });
    }
});
exports.getArticleById = getArticleById;
// ── Create article ──
const createArticle = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { question, answer, category, keywords, attachments, isFeatured } = req.body;
        if (!question || !answer || !category) {
            return res.status(400).json({ success: false, message: 'Question, Answer, and Category are required' });
        }
        const id = (0, crypto_1.randomUUID)();
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || null;
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO kb_articles (id, question, answer, category, keywords, attachments, isFeatured, createdBy, updatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            id,
            question,
            answer,
            category,
            keywords ? JSON.stringify(keywords) : null,
            attachments ? JSON.stringify(attachments) : null,
            isFeatured ? 1 : 0,
            userId,
            userId,
        ]);
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'KB', 'ARTICLE_CREATED', `Created KB article: ${question.slice(0, 80)}`, `Article ID: ${id}`);
        res.status(201).json({ success: true, id, message: 'Article created successfully' });
    }
    catch (error) {
        console.error('Error creating KB article:', error);
        res.status(500).json({ success: false, message: 'Failed to create article' });
    }
});
exports.createArticle = createArticle;
// ── Update article ──
const updateArticle = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { question, answer, category, keywords, attachments, isFeatured, isActive } = req.body;
        const updates = [];
        const params = [];
        if (question !== undefined) {
            updates.push('question = ?');
            params.push(question);
        }
        if (answer !== undefined) {
            updates.push('answer = ?');
            params.push(answer);
        }
        if (category !== undefined) {
            updates.push('category = ?');
            params.push(category);
        }
        if (keywords !== undefined) {
            updates.push('keywords = ?');
            params.push(JSON.stringify(keywords));
        }
        if (attachments !== undefined) {
            updates.push('attachments = ?');
            params.push(JSON.stringify(attachments));
        }
        if (isFeatured !== undefined) {
            updates.push('isFeatured = ?');
            params.push(isFeatured ? 1 : 0);
        }
        if (isActive !== undefined) {
            updates.push('isActive = ?');
            params.push(isActive ? 1 : 0);
        }
        // Always update who edited and when
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || null;
        updates.push('updatedBy = ?');
        params.push(userId);
        if (updates.length === 1) {
            // Only updatedBy — nothing meaningful changed
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        params.push(id);
        yield (0, db_1.safePoolQuery)(`UPDATE kb_articles SET ${updates.join(', ')} WHERE id = ?`, params);
        const userName = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'KB', 'ARTICLE_UPDATED', `Updated KB article`, `Article ID: ${id}`);
        res.json({ success: true, message: 'Article updated successfully' });
    }
    catch (error) {
        console.error('Error updating KB article:', error);
        res.status(500).json({ success: false, message: 'Failed to update article' });
    }
});
exports.updateArticle = updateArticle;
// ── Delete article (soft delete) ──
const deleteArticle = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        yield (0, db_1.safePoolQuery)(`UPDATE kb_articles SET isActive = 0 WHERE id = ?`, [id]);
        const userName = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        yield (0, auditController_1.logAction)(userName, 'KB', 'ARTICLE_DELETED', `Deleted KB article`, `Article ID: ${id}`);
        res.json({ success: true, message: 'Article deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting KB article:', error);
        res.status(500).json({ success: false, message: 'Failed to delete article' });
    }
});
exports.deleteArticle = deleteArticle;
// ── List unique categories ──
const getCategories = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield (0, db_1.safePoolQuery)(`SELECT category, COUNT(*) as articleCount FROM kb_articles WHERE isActive = 1 GROUP BY category ORDER BY articleCount DESC`);
        res.json({ success: true, data: rows });
    }
    catch (error) {
        console.error('Error fetching KB categories:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch categories' });
    }
});
exports.getCategories = getCategories;
// ── Suggest articles by context (for tickets/leads) ──
const suggestArticles = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { keyword, category: contextCategory, limit = 5 } = req.query;
        if (!keyword || String(keyword).trim().length === 0) {
            return res.json({ success: true, data: [] });
        }
        const term = String(keyword).trim();
        let query;
        const params = [];
        if (term.length >= 2) {
            query = `
        SELECT id, question, category, keywords, viewCount,
               MATCH(question, answer) AGAINST(? IN BOOLEAN MODE) as relevance
        FROM kb_articles
        WHERE isActive = 1
          AND (MATCH(question, answer) AGAINST(? IN BOOLEAN MODE) OR question LIKE ? OR answer LIKE ?)
      `;
            params.push(`${term}*`, `${term}*`, `%${term}%`, `%${term}%`);
        }
        else {
            query = `
        SELECT id, question, category, keywords, viewCount, 1 as relevance
        FROM kb_articles
        WHERE isActive = 1
          AND (question LIKE ? OR answer LIKE ?)
      `;
            params.push(`%${term}%`, `%${term}%`);
        }
        if (contextCategory) {
            query += ' AND category = ?';
            params.push(contextCategory);
        }
        query += ' ORDER BY relevance DESC, viewCount DESC LIMIT ?';
        params.push(Number(limit));
        const [rows] = yield (0, db_1.safePoolQuery)(query, params);
        const articles = rows.map(parseArticleRow);
        res.json({ success: true, data: articles });
    }
    catch (error) {
        console.error('Error suggesting KB articles:', error);
        res.status(500).json({ success: false, message: 'Failed to suggest articles' });
    }
});
exports.suggestArticles = suggestArticles;
// ── Helper: parse JSON columns ──
function parseArticleRow(row) {
    if (!row)
        return row;
    return Object.assign(Object.assign({}, row), { keywords: parseJson(row.keywords, []), attachments: parseJson(row.attachments, []), isFeatured: Boolean(row.isFeatured), isActive: Boolean(row.isActive) });
}
function parseJson(value, fallback) {
    if (!value)
        return fallback;
    if (typeof value === 'object')
        return value; // Already parsed by driver
    try {
        return JSON.parse(value);
    }
    catch (_a) {
        return fallback;
    }
}
