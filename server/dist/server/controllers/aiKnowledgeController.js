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
exports.handleSeedKnowledge = exports.handleKnowledgeCategories = exports.handleDeleteKnowledge = exports.handleUpdateKnowledge = exports.handleCreateKnowledge = exports.handleGetKnowledge = exports.handleListKnowledge = void 0;
exports.searchKnowledgeBase = searchKnowledgeBase;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
// ── Validation constants ──
const VALID_CONTENT_TYPES = ['policy', 'procedure', 'faq', 'report', 'manual', 'note'];
const ALLOWED_KB_ROLES = ['MASTER_ADMIN', 'ADMIN', 'GENERAL_MANAGER'];
const MAX_CATEGORY_LEN = 100;
const MAX_TAGS_COUNT = 50;
const _kbCache = new Map();
const KB_CACHE_TTL = 5 * 60 * 1000;
const KB_CACHE_MAX_SIZE = 500;
/** Store result in cache with FIFO size-cap eviction */
function cacheSet(key, result) {
    if (_kbCache.size >= KB_CACHE_MAX_SIZE) {
        // Evict oldest entry (Maps preserve insertion order — FIFO, not LRU)
        const oldest = _kbCache.keys().next().value;
        if (oldest !== undefined)
            _kbCache.delete(oldest);
    }
    _kbCache.set(key, { result, expiresAt: Date.now() + KB_CACHE_TTL });
}
/** Invalidate KB cache after write operations (#2) */
function invalidateKBCache() {
    _kbCache.clear();
}
// ── Intent → Knowledge Category mapping ──
// When Dax receives a query, it checks if company knowledge exists for the intent
const INTENT_KB_CATEGORIES = {
    customer_balance: ['accounting', 'credit-policy', 'collections'],
    supplier_balance: ['accounting', 'procurement', 'payment-policy'],
    treasury: ['treasury', 'cash-management', 'banking'],
    cheques: ['treasury', 'cheque-policy', 'banking'],
    hr: ['hr', 'employment', 'payroll'],
    inventory: ['inventory', 'warehouse', 'stock-policy'],
    production: ['manufacturing', 'production', 'quality'],
    sales_report: ['sales', 'pricing', 'commissions'],
    aging: ['collections', 'credit-policy', 'risk'],
    cashflow: ['treasury', 'cash-management', 'forecasting'],
    general: ['general', 'faq', 'company'],
};
// ═══════════════════════════════════════════════════════════
// CORE SEARCH FUNCTION — Used by AI Chat Controller
// ═══════════════════════════════════════════════════════════
/**
 * Search the knowledge base for relevant articles.
 * Uses MySQL FULLTEXT MATCH...AGAINST for relevance scoring.
 * Falls back to LIKE search if FULLTEXT returns no results.
 *
 * @param query - The user's message or search terms
 * @param intent - The classified intent (for category filtering)
 * @param maxResults - Maximum number of results to return
 * @returns Formatted knowledge context string for injection into AI prompt
 */
function searchKnowledgeBase(query_1, intent_1) {
    return __awaiter(this, arguments, void 0, function* (query, intent, maxResults = 3) {
        // Sanitize first, then build cache key from sanitized form (#9)
        // This prevents duplicate cache entries for e.g. "!!!" vs "???" (both sanitize to "")
        const searchQuery = query.replace(/[^\p{L}\p{N}\s\-]/gu, '').replace(/\s-\s/g, ' ').trim();
        const cacheKey = `${intent || 'any'}:${searchQuery.slice(0, 100)}`;
        const cached = _kbCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now())
            return cached.result;
        try {
            const categories = intent ? (INTENT_KB_CATEGORIES[intent] || []) : [];
            // Build category filter — params populated with category values
            let categoryFilter = '';
            const categoryParams = [];
            if (categories.length > 0) {
                categoryFilter = `AND (category IN (${categories.map(() => '?').join(',')}) OR priority >= 5)`;
                categoryParams.push(...categories);
            }
            // searchQuery already sanitized above (moved before cache key)
            // 1. FULLTEXT search (primary — ranked by relevance)
            if (searchQuery.length >= 3) {
                // Param order: AGAINST(?), AGAINST(?), ...categoryParams, LIMIT ?
                const ftParams = [searchQuery, searchQuery, ...categoryParams, maxResults];
                const [ftRows] = yield db_1.pool.query(`
                SELECT *, MATCH(title, titleAr, content) AGAINST (? IN NATURAL LANGUAGE MODE) as relevance
                FROM ai_knowledge_base
                WHERE isActive = TRUE 
                  AND MATCH(title, titleAr, content) AGAINST (? IN NATURAL LANGUAGE MODE)
                  ${categoryFilter}
                ORDER BY priority DESC, relevance DESC
                LIMIT ?
            `, ftParams);
                if (ftRows.length > 0) {
                    const result = formatKBResults(ftRows);
                    cacheSet(cacheKey, result);
                    return result;
                }
            }
            // 2. Fallback: LIKE on title columns only (item #10 — skip full content scan)
            const likeTerms = searchQuery.split(/\s+/).filter(t => t.length >= 2).slice(0, 3);
            if (likeTerms.length > 0) {
                const likeConditions = likeTerms.map(() => `(title LIKE ? OR titleAr LIKE ?)`).join(' OR ');
                const likeParams = [];
                likeTerms.forEach(term => {
                    const likeTerm = `%${term}%`;
                    likeParams.push(likeTerm, likeTerm);
                });
                // Param order: ...likeParams, ...categoryParams, LIMIT ?
                const fallbackParams = [...likeParams, ...categoryParams, maxResults];
                const [likeRows] = yield db_1.pool.query(`
                SELECT *
                FROM ai_knowledge_base
                WHERE isActive = TRUE AND (${likeConditions}) ${categoryFilter}
                ORDER BY priority DESC, updatedAt DESC
                LIMIT ?
            `, fallbackParams);
                if (likeRows.length > 0) {
                    const result = formatKBResults(likeRows);
                    cacheSet(cacheKey, result);
                    return result;
                }
            }
            // 3. No results found — cache empty result to prevent repeated DB hits (#1)
            const emptyResult = { context: '', articles: [], hitCount: 0 };
            cacheSet(cacheKey, emptyResult);
            return emptyResult;
        }
        catch (error) {
            // Structured error logging (item #12)
            if (error.code === 'ER_NO_SUCH_TABLE') {
                console.warn('[AI KB] ⚠️ Table ai_knowledge_base does not exist — knowledge context disabled');
            }
            else {
                console.error('[AI KB] Search error:', error.message || error);
            }
            return { context: '', articles: [], hitCount: 0 };
        }
    });
}
/**
 * Truncate text at a sentence or line boundary to avoid mid-word/mid-rule cuts (item #9)
 */
function truncateAtBoundary(text, maxLen) {
    if (text.length <= maxLen)
        return text;
    const cut = text.lastIndexOf('\n', maxLen);
    // Use 0.75 threshold to keep more content for Arabic numbered lists (#4)
    return (cut > maxLen * 0.75 ? text.substring(0, cut) : text.substring(0, maxLen)) + '...';
}
/**
 * Format knowledge base results into a context string for the AI prompt
 */
function formatKBResults(rows) {
    const articles = rows;
    const contextLines = articles.map((a) => {
        const typeLabel = {
            policy: '📋 سياسة',
            procedure: '📝 إجراء',
            faq: '❓ سؤال شائع',
            report: '📊 تقرير',
            manual: '📖 دليل',
            note: '📌 ملاحظة',
        }[a.contentType] || '📌';
        // Truncate at sentence/line boundary to avoid mid-word cuts (item #9)
        const truncatedContent = truncateAtBoundary(a.content, 800);
        return `\n--- ${typeLabel}: ${a.titleAr || a.title} ---\n${truncatedContent}`;
    });
    const context = `\n\n📚 معلومات من قاعدة المعرفة:\n${contextLines.join('\n')}`;
    return { context, articles, hitCount: articles.length };
}
// ═══════════════════════════════════════════════════════════
// CRUD ENDPOINTS — Admin management of knowledge articles
// ═══════════════════════════════════════════════════════════
/**
 * GET /api/ai-chat/knowledge — List all knowledge articles (with pagination)
 */
const handleListKnowledge = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const offset = (page - 1) * limit;
        const contentType = req.query.type;
        const category = req.query.category;
        const search = req.query.search;
        let where = 'WHERE 1=1';
        const params = [];
        if (contentType) {
            where += ' AND contentType = ?';
            params.push(contentType);
        }
        if (category) {
            where += ' AND category = ?';
            params.push(category);
        }
        if (search) {
            // Search title columns only — content is large and unindexed (#3)
            where += ' AND (title LIKE ? OR titleAr LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term);
        }
        const [countRows] = yield db_1.pool.query(`SELECT COUNT(*) as total FROM ai_knowledge_base ${where}`, params);
        const total = ((_a = countRows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
        const [rows] = yield db_1.pool.query(`
            SELECT id, title, titleAr, contentType, category, tags, priority, isActive, 
                   createdBy, updatedBy, createdAt, updatedAt,
                   LEFT(content, 200) as contentPreview
            FROM ai_knowledge_base ${where}
            ORDER BY priority DESC, updatedAt DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        res.json({ articles: rows, total, page, limit, pages: Math.ceil(total / limit) });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'listKnowledge');
    }
});
exports.handleListKnowledge = handleListKnowledge;
/**
 * GET /api/ai-chat/knowledge/:id — Get single knowledge article
 */
const handleGetKnowledge = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Validate integer id (item #5)
        const id = parseInt(req.params.id, 10);
        if (isNaN(id))
            return res.status(400).json({ error: 'Invalid article ID' });
        const [rows] = yield db_1.pool.query('SELECT * FROM ai_knowledge_base WHERE id = ?', [id]);
        if (rows.length === 0)
            return res.status(404).json({ error: 'Article not found' });
        res.json(rows[0]);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getKnowledge');
    }
});
exports.handleGetKnowledge = handleGetKnowledge;
/**
 * POST /api/ai-chat/knowledge — Create a new knowledge article
 */
const handleCreateKnowledge = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // Role guard — KB management is admin-only (#5)
        const userRole = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
        if (!ALLOWED_KB_ROLES.includes(userRole)) {
            return res.status(403).json({ error: 'غير مصرح — إدارة قاعدة المعرفة للمشرفين فقط' });
        }
        const { title, titleAr, content, contentType, category, tags, priority, metadata } = req.body;
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
        // Reject empty/whitespace-only title or content (#3)
        if (!(title === null || title === void 0 ? void 0 : title.trim()) || !(content === null || content === void 0 ? void 0 : content.trim())) {
            return res.status(400).json({ error: 'العنوان والمحتوى مطلوبان' });
        }
        // Validate category length (#4)
        if (category && (typeof category !== 'string' || category.length > MAX_CATEGORY_LEN)) {
            return res.status(400).json({ error: 'قيمة التصنيف غير صالحة' });
        }
        // Validate tags/metadata size (#5)
        if (tags && (!Array.isArray(tags) || tags.length > MAX_TAGS_COUNT)) {
            return res.status(400).json({ error: `الوسوم: مصفوفة بحد أقصى ${MAX_TAGS_COUNT} عنصر` });
        }
        if (metadata && JSON.stringify(metadata).length > 10000) {
            return res.status(400).json({ error: 'بيانات التعريف كبيرة جداً' });
        }
        // Validate contentType enum (#6)
        const safeContentType = contentType || 'note';
        if (!VALID_CONTENT_TYPES.includes(safeContentType)) {
            return res.status(400).json({ error: `نوع المحتوى غير صالح: ${safeContentType}` });
        }
        // Clamp priority to [0, 10] (#7)
        const safePriority = Math.max(0, Math.min(10, parseInt(priority) || 0));
        const [result] = yield db_1.pool.query(`
            INSERT INTO ai_knowledge_base (title, titleAr, content, contentType, category, tags, priority, createdBy, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            title, titleAr || null, content,
            safeContentType, category || 'general',
            tags ? JSON.stringify(tags) : null,
            safePriority, userId, metadata ? JSON.stringify(metadata) : null,
        ]);
        invalidateKBCache();
        console.log(`[AI KB] ✏️ Article created: "${title}" by user ${userId}`);
        res.status(201).json({ id: result.insertId, message: 'تم إنشاء المقال بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'createKnowledge');
    }
});
exports.handleCreateKnowledge = handleCreateKnowledge;
/**
 * PUT /api/ai-chat/knowledge/:id — Update a knowledge article
 */
const handleUpdateKnowledge = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // Role guard — KB management is admin-only (#5)
        const userRole = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
        if (!ALLOWED_KB_ROLES.includes(userRole)) {
            return res.status(403).json({ error: 'غير مصرح — إدارة قاعدة المعرفة للمشرفين فقط' });
        }
        // Validate integer id
        const id = parseInt(req.params.id, 10);
        if (isNaN(id))
            return res.status(400).json({ error: 'Invalid article ID' });
        const { title, titleAr, content, contentType, category, tags, priority, isActive, metadata } = req.body;
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
        // Validate contentType enum if provided
        if (contentType !== undefined && !VALID_CONTENT_TYPES.includes(contentType)) {
            return res.status(400).json({ error: `نوع المحتوى غير صالح: ${contentType}` });
        }
        // Validate category length (#4)
        if (category !== undefined && (typeof category !== 'string' || category.length > MAX_CATEGORY_LEN)) {
            return res.status(400).json({ error: 'قيمة التصنيف غير صالحة' });
        }
        // Validate tags/metadata size (#5)
        if (tags !== undefined && (!Array.isArray(tags) || tags.length > MAX_TAGS_COUNT)) {
            return res.status(400).json({ error: `الوسوم: مصفوفة بحد أقصى ${MAX_TAGS_COUNT} عنصر` });
        }
        if (metadata !== undefined && JSON.stringify(metadata).length > 10000) {
            return res.status(400).json({ error: 'بيانات التعريف كبيرة جداً' });
        }
        const updates = [];
        const params = [];
        if (title !== undefined) {
            updates.push('title = ?');
            params.push(title);
        }
        if (titleAr !== undefined) {
            updates.push('titleAr = ?');
            params.push(titleAr);
        }
        if (content !== undefined) {
            updates.push('content = ?');
            params.push(content);
        }
        if (contentType !== undefined) {
            updates.push('contentType = ?');
            params.push(contentType);
        }
        if (category !== undefined) {
            updates.push('category = ?');
            params.push(category);
        }
        if (tags !== undefined) {
            updates.push('tags = ?');
            params.push(JSON.stringify(tags));
        }
        // Clamp priority to [0, 10] (#7)
        if (priority !== undefined) {
            updates.push('priority = ?');
            params.push(Math.max(0, Math.min(10, parseInt(priority) || 0)));
        }
        // Boolean coercion for TINYINT(1) storage
        if (isActive !== undefined) {
            updates.push('isActive = ?');
            params.push(isActive ? 1 : 0);
        }
        if (metadata !== undefined) {
            updates.push('metadata = ?');
            params.push(JSON.stringify(metadata));
        }
        // Explicit field count check
        const fieldUpdateCount = updates.length;
        if (fieldUpdateCount === 0)
            return res.status(400).json({ error: 'لم يتم تقديم حقول للتحديث' });
        updates.push('updatedBy = ?');
        params.push(userId);
        params.push(id);
        const [result] = yield db_1.pool.query(`UPDATE ai_knowledge_base SET ${updates.join(', ')} WHERE id = ?`, params);
        if (result.affectedRows === 0)
            return res.status(404).json({ error: 'Article not found' });
        invalidateKBCache();
        console.log(`[AI KB] 📝 Article ${id} updated by user ${userId}`);
        res.json({ message: 'تم تحديث المقال بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'updateKnowledge');
    }
});
exports.handleUpdateKnowledge = handleUpdateKnowledge;
/**
 * DELETE /api/ai-chat/knowledge/:id — Soft-delete (deactivate) a knowledge article
 */
const handleDeleteKnowledge = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // Role guard — KB management is admin-only (#2)
        const userRole = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
        if (!ALLOWED_KB_ROLES.includes(userRole)) {
            return res.status(403).json({ error: 'غير مصرح — إدارة قاعدة المعرفة للمشرفين فقط' });
        }
        // Validate integer id
        const id = parseInt(req.params.id, 10);
        if (isNaN(id))
            return res.status(400).json({ error: 'Invalid article ID' });
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
        // Check affectedRows to detect non-existent articles (item #2)
        const [result] = yield db_1.pool.query('UPDATE ai_knowledge_base SET isActive = FALSE, updatedBy = ? WHERE id = ?', [userId, id]);
        if (result.affectedRows === 0)
            return res.status(404).json({ error: 'Article not found' });
        invalidateKBCache();
        console.log(`[AI KB] 🗑️ Article ${id} deactivated by user ${userId}`);
        res.json({ message: 'تم حذف المقال بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'deleteKnowledge');
    }
});
exports.handleDeleteKnowledge = handleDeleteKnowledge;
/**
 * GET /api/ai-chat/knowledge/categories — List distinct categories
 */
const handleKnowledgeCategories = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Cache categories — invalidated on writes via invalidateKBCache() (#7)
        const CATS_CACHE_KEY = '__kb_categories__';
        const cached = _kbCache.get(CATS_CACHE_KEY);
        if (cached && cached.expiresAt > Date.now()) {
            return res.json(cached.result);
        }
        const [rows] = yield db_1.pool.query(`
            SELECT category, contentType, COUNT(*) as count 
            FROM ai_knowledge_base 
            WHERE isActive = TRUE 
            GROUP BY category, contentType 
            ORDER BY count DESC
        `);
        const uniqueCategories = [...new Set(rows.map((r) => r.category))];
        const result = { categories: uniqueCategories, breakdown: rows };
        cacheSet(CATS_CACHE_KEY, result);
        res.json(result);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'knowledgeCategories');
    }
});
exports.handleKnowledgeCategories = handleKnowledgeCategories;
/**
 * POST /api/ai-chat/knowledge/seed — Seed initial knowledge base with ERP defaults
 */
const handleSeedKnowledge = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // Role guard — seed is admin-only (item #6)
        const userRole = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
        if (!['MASTER_ADMIN', 'ADMIN'].includes(userRole)) {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
        // Per-article idempotency check — only skip if seed marker article exists (item #4)
        const [existing] = yield db_1.pool.query("SELECT 1 FROM ai_knowledge_base WHERE title = 'Credit Policy - سياسة الائتمان' LIMIT 1");
        if (existing.length > 0) {
            return res.json({ message: 'قاعدة المعرفة مُهيأة بالفعل' });
        }
        const seedArticles = [
            {
                title: 'Credit Policy - سياسة الائتمان',
                titleAr: 'سياسة الائتمان والتحصيل',
                content: `سياسة الائتمان:\n1. الحد الائتماني الافتراضي: يتم تحديده بناءً على حجم التعامل والتاريخ الائتماني.\n2. شروط الدفع: 30 يوم صافي للعملاء الجدد، 60 يوم للعملاء المميزين.\n3. التحصيل: يتم إرسال تنبيه بعد 15 يوم من تاريخ الاستحقاق.\n4. الإيقاف: يتم إيقاف التوريد تلقائياً عند تجاوز 90 يوم.\n5. الخصم النقدي: 2% خصم عند الدفع خلال 10 أيام.`,
                contentType: 'policy', category: 'credit-policy', priority: 8,
            },
            {
                title: 'Return Policy - سياسة المرتجعات',
                titleAr: 'سياسة المرتجعات والاستبدال',
                content: `سياسة المرتجعات:\n1. فترة الإرجاع: 14 يوم من تاريخ الشراء.\n2. الحالة: يجب أن يكون المنتج بحالته الأصلية.\n3. الفاتورة: مطلوب تقديم الفاتورة الأصلية.\n4. الاسترداد: يتم خلال 7 أيام عمل.\n5. الاستثناءات: المواد الغذائية والمنتجات المصنعة حسب الطلب لا تُقبل مرتجعاتها.`,
                contentType: 'policy', category: 'sales', priority: 7,
            },
            {
                title: 'Cheque Handling Procedure - إجراءات الشيكات',
                titleAr: 'إجراءات استلام وصرف الشيكات',
                content: `إجراءات الشيكات:\n1. الاستلام: يتم تسجيل الشيك فوراً في النظام مع صورة ضوئية.\n2. التحقق: مراجعة التاريخ، المبلغ، التوقيع، والختم.\n3. الإيداع: يتم إيداع الشيكات قبل تاريخ الاستحقاق بـ 3 أيام.\n4. الارتجاع: في حالة الارتجاع يتم إبلاغ المدير المالي فوراً وإعادة تسجيل المديونية.\n5. المتابعة: متابعة يومية للشيكات المستحقة خلال الأسبوع القادم.`,
                contentType: 'procedure', category: 'treasury', priority: 7,
            },
            {
                title: 'Inventory Count Procedure - إجراءات الجرد',
                titleAr: 'إجراءات الجرد الدوري',
                content: `إجراءات الجرد:\n1. التوقيت: جرد شهري للأصناف الحرجة (A)، ربع سنوي للأصناف (B)، سنوي للأصناف (C).\n2. الفريق: فريق مكون من 3 أشخاص على الأقل (مخزن + محاسبة + مراجعة).\n3. التسجيل: يتم التسجيل مباشرة على النظام باستخدام الباركود.\n4. الفروقات: فروقات أقل من 1% تُعالج تلقائياً، أكثر من 1% تحتاج موافقة المدير.\n5. التقرير: تقرير الجرد يُرفع للإدارة خلال 48 ساعة.`,
                contentType: 'procedure', category: 'inventory', priority: 6,
            },
            {
                title: 'Employee Leave Policy - سياسة الإجازات',
                titleAr: 'سياسة الإجازات والغياب',
                content: `سياسة الإجازات:\n1. الإجازة السنوية: 21 يوم للسنة الأولى، تزداد يوم كل سنة حتى 30 يوم.\n2. الإجازة المرضية: حتى 15 يوم بأجر كامل مع شهادة طبية.\n3. الطوارئ: 3 أيام إجازة طوارئ في السنة.\n4. الإشعار: يجب تقديم طلب الإجازة قبل 7 أيام (إلا في الحالات الطارئة).\n5. الترحيل: يمكن ترحيل حتى 10 أيام من الإجازة السنوية للسنة التالية.`,
                contentType: 'policy', category: 'hr', priority: 6,
            },
        ];
        // Multi-row INSERT in a transaction for atomicity (#9)
        const placeholders = seedArticles.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
        const flatParams = seedArticles.flatMap(a => [
            a.title, a.titleAr, a.content, a.contentType, a.category, a.priority, userId
        ]);
        const conn = yield db_1.pool.getConnection();
        try {
            yield conn.beginTransaction();
            yield conn.query(`INSERT INTO ai_knowledge_base (title, titleAr, content, contentType, category, priority, createdBy) VALUES ${placeholders}`, flatParams);
            yield conn.commit();
        }
        catch (txErr) {
            yield conn.rollback();
            throw txErr;
        }
        finally {
            conn.release();
        }
        invalidateKBCache();
        console.log(`[AI KB] 🌱 Seeded ${seedArticles.length} knowledge articles`);
        res.json({ message: `تم إنشاء ${seedArticles.length} مقال في قاعدة المعرفة`, count: seedArticles.length });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'seedKnowledge');
    }
});
exports.handleSeedKnowledge = handleSeedKnowledge;
