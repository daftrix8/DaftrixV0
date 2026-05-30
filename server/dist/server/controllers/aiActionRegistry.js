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
exports.ACTION_REGISTRY = void 0;
exports.detectAction = detectAction;
exports.extractActionParams = extractActionParams;
exports.getAction = getAction;
exports.canUserExecute = canUserExecute;
exports.buildActionProposal = buildActionProposal;
// ═══════════════════════════════════════════════════════════
// DAX ACTION REGISTRY — Phase 2: Agentic ERP Operations
// Transforms Dax from read-only copilot to operational agent
// ═══════════════════════════════════════════════════════════
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const eventBus_1 = require("../utils/eventBus");
// ── Action Detection Patterns ────────────────────────────
// Maps Arabic/English phrases to action IDs
const ACTION_PATTERNS = [
    // Receipt / Collection
    { pattern: /(سجل|اعمل|أنشئ|انشئ|حصّل|حصل|استلم)\s*(سند\s*قبض|تحصيل|إيصال\s*قبض)/i, actionId: 'create_receipt' },
    { pattern: /(create|make|record)\s*(receipt|collection|payment\s*received)/i, actionId: 'create_receipt' },
    { pattern: /(قبض|حصّل|حصل)\s*(من|مبلغ)\s/i, actionId: 'create_receipt' },
    // Payment Voucher
    { pattern: /(سجل|اعمل|أنشئ|انشئ)\s*(سند\s*صرف|دفعة|مصروف)/i, actionId: 'create_payment' },
    { pattern: /(create|make|record)\s*(payment\s*voucher|payment|disbursement)/i, actionId: 'create_payment' },
    { pattern: /(ادفع|سدد|صرف)\s*(لـ|ل|مبلغ)\s/i, actionId: 'create_payment' },
    // Cheque Collection
    { pattern: /(حصّل|حصل|صرف|جمّع|جمع)\s*(الشيك|شيك|الشيكات)/i, actionId: 'collect_cheque' },
    { pattern: /(collect|cash|deposit)\s*(cheque|check)/i, actionId: 'collect_cheque' },
    { pattern: /شيك.*?(تحصيل|تحصل|اتحصل|محصل)/i, actionId: 'collect_cheque' },
    // Stock Adjustment
    { pattern: /(عدّل|عدل|ضبط|اضبط|غيّر|غير)\s*(المخزون|الكمية|رصيد\s*المخزن|الرصيد)/i, actionId: 'adjust_stock' },
    { pattern: /(adjust|update|correct)\s*(stock|inventory|quantity)/i, actionId: 'adjust_stock' },
];
// ── Detect if a message requests an action ───────────────
function detectAction(message) {
    const lower = message.toLowerCase().trim();
    for (const { pattern, actionId } of ACTION_PATTERNS) {
        if (pattern.test(lower)) {
            return { actionId, rawMessage: message };
        }
    }
    return null;
}
// ── Extract parameters from natural language ─────────────
function extractActionParams(actionId, message, sessionContext) {
    return __awaiter(this, void 0, void 0, function* () {
        const params = {};
        // Extract amount (Arabic/English numbers)
        const amountMatch = message.match(/(\d[\d,\.]*)\s*(جنيه|ج\.م|EGP|ريال|دولار)?/);
        if (amountMatch) {
            params.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
        }
        // Extract date
        const dateMatch = message.match(/(اليوم|النهارده|today|أمس|امس|yesterday|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/);
        if (dateMatch) {
            const d = dateMatch[1];
            if (d === 'اليوم' || d === 'النهارده' || d === 'today') {
                params.date = new Date().toISOString().split('T')[0];
            }
            else if (d === 'أمس' || d === 'امس' || d === 'yesterday') {
                const y = new Date();
                y.setDate(y.getDate() - 1);
                params.date = y.toISOString().split('T')[0];
            }
            else {
                params.date = d;
            }
        }
        // Extract partner name from message (look for "من" or "لـ" patterns)
        const partnerFromMatch = message.match(/(?:من|لـ|ل|from|to|for)\s+([أ-يa-zA-Z\/\s\.]{3,40}?)(?:\s+مبلغ|\s+بمبلغ|\s+قيمة|\s*$)/);
        if (partnerFromMatch) {
            params.partnerName = partnerFromMatch[1].trim();
        }
        // Try to resolve partner from DB
        if (params.partnerName) {
            try {
                const [rows] = yield db_1.pool.query(`SELECT id, name, balance FROM partners WHERE name LIKE ? LIMIT 1`, [`%${params.partnerName}%`]);
                if (rows.length > 0) {
                    params.partnerId = rows[0].id;
                    params.partnerName = rows[0].name;
                    params.currentBalance = rows[0].balance;
                }
            }
            catch ( /* ignore */_a) { /* ignore */ }
        }
        // Fallback to session context
        if (!params.partnerId && (sessionContext === null || sessionContext === void 0 ? void 0 : sessionContext.lastPartnerId)) {
            params.partnerId = sessionContext.lastPartnerId;
            params.partnerName = sessionContext.lastPartnerName;
        }
        // Cheque number extraction
        if (actionId === 'collect_cheque') {
            const chequeMatch = message.match(/(?:شيك|cheque|check)\s*(?:رقم|#|no\.?)?\s*(\w+)/i);
            if (chequeMatch)
                params.chequeNumber = chequeMatch[1];
        }
        // Product extraction for stock
        if (actionId === 'adjust_stock') {
            const qtyMatch = message.match(/(\d+)\s*(قطعة|وحدة|كرتونة|unit|pc|pcs)?/);
            if (qtyMatch)
                params.quantity = parseInt(qtyMatch[1]);
        }
        return params;
    });
}
// ── The Action Registry ──────────────────────────────────
exports.ACTION_REGISTRY = [
    // ─── 1. CREATE RECEIPT (سند قبض) ────────────────────
    {
        id: 'create_receipt',
        nameAr: 'إنشاء سند قبض',
        nameEn: 'Create Receipt',
        description: 'تحصيل مبلغ من عميل',
        icon: '💰',
        requiredRoles: ['admin', 'accountant', 'cashier'],
        category: 'treasury',
        confirmationRequired: true,
        parameters: [
            { name: 'partnerId', nameAr: 'العميل', type: 'string', required: true },
            { name: 'amount', nameAr: 'المبلغ', type: 'number', required: true },
            { name: 'date', nameAr: 'التاريخ', type: 'date', required: false },
        ],
        execute: (params, userId, userName) => __awaiter(void 0, void 0, void 0, function* () {
            const conn = yield (0, db_1.getConnection)();
            try {
                yield conn.beginTransaction();
                const { partnerId, partnerName, amount, date } = params;
                if (!partnerId || !amount || amount <= 0) {
                    return { success: false, message: 'Missing partner or amount', messageAr: 'يجب تحديد العميل والمبلغ' };
                }
                const receiptDate = date || new Date().toISOString().split('T')[0];
                const receiptId = (0, crypto_1.randomUUID)();
                const receiptNumber = `RCV-${Date.now().toString(36).toUpperCase()}`;
                // Create receipt invoice
                yield conn.query(`
                    INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, paidAmount, status, paymentMethod, posted, notes, createdBy)
                    VALUES (?, ?, ?, 'RECEIPT', ?, ?, ?, ?, 'POSTED', 'CASH', 1, ?, ?)
                `, [receiptId, receiptNumber, receiptDate, partnerId, partnerName || '', amount, amount, `تحصيل بواسطة Dax AI - ${userName}`, userName]);
                // Update partner balance
                yield conn.query(`UPDATE partners SET balance = COALESCE(balance, 0) - ? WHERE id = ?`, [amount, partnerId]);
                // Create journal entry
                const journalId = (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId) VALUES (?, ?, ?, ?)`, [journalId, receiptDate, `تحصيل من ${partnerName} - ${receiptNumber} - Dax AI`, receiptId]);
                const [cashAccounts] = yield conn.query(`SELECT id FROM accounts WHERE code LIKE '101%' OR name LIKE '%نقدي%' OR name LIKE '%صندوق%' LIMIT 1`);
                const [recvAccounts] = yield conn.query(`SELECT id FROM accounts WHERE code LIKE '112%' OR name LIKE '%عملاء%' LIMIT 1`);
                if (cashAccounts[0]) {
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, debit, credit) VALUES (?, ?, ?, 0)`, [journalId, cashAccounts[0].id, amount]);
                    yield conn.query(`UPDATE accounts SET balance = COALESCE(balance, 0) + ? WHERE id = ?`, [amount, cashAccounts[0].id]);
                }
                if (recvAccounts[0]) {
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, debit, credit) VALUES (?, ?, 0, ?)`, [journalId, recvAccounts[0].id, amount]);
                    yield conn.query(`UPDATE accounts SET balance = COALESCE(balance, 0) - ? WHERE id = ?`, [amount, recvAccounts[0].id]);
                }
                yield conn.commit();
                yield (0, auditController_1.logAction)(userName, 'RECEIPT', 'CREATE', `تحصيل بواسطة Dax AI من ${partnerName}`, `المبلغ: ${amount}`);
                eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoices', updatedBy: userName });
                eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'partners', updatedBy: userName });
                return {
                    success: true,
                    message: `Receipt ${receiptNumber} created for ${amount}`,
                    messageAr: `✅ تم إنشاء سند القبض ${receiptNumber} بمبلغ ${Number(amount).toLocaleString('ar-EG')} جنيه من ${partnerName}`,
                    data: { receiptId, receiptNumber, amount, partnerName }
                };
            }
            catch (e) {
                yield conn.rollback();
                return { success: false, message: e.message, messageAr: `❌ فشل إنشاء سند القبض: ${e.message}` };
            }
            finally {
                conn.release();
            }
        })
    },
    // ─── 2. CREATE PAYMENT VOUCHER (سند صرف) ────────────
    {
        id: 'create_payment',
        nameAr: 'إنشاء سند صرف',
        nameEn: 'Create Payment Voucher',
        description: 'دفع مبلغ لمورد',
        icon: '📤',
        requiredRoles: ['admin', 'accountant'],
        category: 'treasury',
        confirmationRequired: true,
        parameters: [
            { name: 'partnerId', nameAr: 'المورد', type: 'string', required: true },
            { name: 'amount', nameAr: 'المبلغ', type: 'number', required: true },
            { name: 'date', nameAr: 'التاريخ', type: 'date', required: false },
        ],
        execute: (params, userId, userName) => __awaiter(void 0, void 0, void 0, function* () {
            const conn = yield (0, db_1.getConnection)();
            try {
                yield conn.beginTransaction();
                const { partnerId, partnerName, amount, date } = params;
                if (!partnerId || !amount || amount <= 0) {
                    return { success: false, message: 'Missing partner or amount', messageAr: 'يجب تحديد المورد والمبلغ' };
                }
                const payDate = date || new Date().toISOString().split('T')[0];
                const payId = (0, crypto_1.randomUUID)();
                const payNumber = `PAY-${Date.now().toString(36).toUpperCase()}`;
                yield conn.query(`
                    INSERT INTO invoices (id, number, date, type, partnerId, partnerName, total, paidAmount, status, paymentMethod, posted, notes, createdBy)
                    VALUES (?, ?, ?, 'PAYMENT', ?, ?, ?, ?, 'POSTED', 'CASH', 1, ?, ?)
                `, [payId, payNumber, payDate, partnerId, partnerName || '', amount, amount, `سداد بواسطة Dax AI - ${userName}`, userName]);
                yield conn.query(`UPDATE partners SET balance = COALESCE(balance, 0) + ? WHERE id = ?`, [amount, partnerId]);
                const journalId = (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO journal_entries (id, date, description, referenceId) VALUES (?, ?, ?, ?)`, [journalId, payDate, `سداد لـ ${partnerName} - ${payNumber} - Dax AI`, payId]);
                const [cashAccounts] = yield conn.query(`SELECT id FROM accounts WHERE code LIKE '101%' OR name LIKE '%نقدي%' OR name LIKE '%صندوق%' LIMIT 1`);
                const [payAccounts] = yield conn.query(`SELECT id FROM accounts WHERE code LIKE '211%' OR name LIKE '%موردين%' LIMIT 1`);
                if (payAccounts[0]) {
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, debit, credit) VALUES (?, ?, ?, 0)`, [journalId, payAccounts[0].id, amount]);
                    yield conn.query(`UPDATE accounts SET balance = COALESCE(balance, 0) + ? WHERE id = ?`, [amount, payAccounts[0].id]);
                }
                if (cashAccounts[0]) {
                    yield conn.query(`INSERT INTO journal_lines (journalId, accountId, debit, credit) VALUES (?, ?, 0, ?)`, [journalId, cashAccounts[0].id, amount]);
                    yield conn.query(`UPDATE accounts SET balance = COALESCE(balance, 0) - ? WHERE id = ?`, [amount, cashAccounts[0].id]);
                }
                yield conn.commit();
                yield (0, auditController_1.logAction)(userName, 'PAYMENT', 'CREATE', `سداد بواسطة Dax AI لـ ${partnerName}`, `المبلغ: ${amount}`);
                eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoices', updatedBy: userName });
                eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'partners', updatedBy: userName });
                return {
                    success: true,
                    message: `Payment ${payNumber} created for ${amount}`,
                    messageAr: `✅ تم إنشاء سند الصرف ${payNumber} بمبلغ ${Number(amount).toLocaleString('ar-EG')} جنيه لـ ${partnerName}`,
                    data: { paymentId: payId, payNumber, amount, partnerName }
                };
            }
            catch (e) {
                yield conn.rollback();
                return { success: false, message: e.message, messageAr: `❌ فشل إنشاء سند الصرف: ${e.message}` };
            }
            finally {
                conn.release();
            }
        })
    },
    // ─── 3. COLLECT CHEQUE (تحصيل شيك) ──────────────────
    {
        id: 'collect_cheque',
        nameAr: 'تحصيل شيك',
        nameEn: 'Collect Cheque',
        description: 'تغيير حالة شيك إلى محصل',
        icon: '🏦',
        requiredRoles: ['admin', 'accountant', 'cashier'],
        category: 'cheques',
        confirmationRequired: true,
        parameters: [
            { name: 'chequeNumber', nameAr: 'رقم الشيك', type: 'string', required: true },
        ],
        execute: (params, userId, userName) => __awaiter(void 0, void 0, void 0, function* () {
            const conn = yield (0, db_1.getConnection)();
            try {
                yield conn.beginTransaction();
                const { chequeNumber } = params;
                const [rows] = yield conn.query(`SELECT id, chequeNumber, amount, partnerName, status FROM cheques WHERE chequeNumber = ? OR id = ? LIMIT 1`, [chequeNumber, chequeNumber]);
                if (rows.length === 0) {
                    return { success: false, message: 'Cheque not found', messageAr: `❌ الشيك رقم ${chequeNumber} غير موجود` };
                }
                const cheque = rows[0];
                if (cheque.status === 'COLLECTED') {
                    return { success: false, message: 'Already collected', messageAr: `⚠️ الشيك ${cheque.chequeNumber} محصل بالفعل` };
                }
                yield conn.query(`UPDATE cheques SET status = 'COLLECTED', collectionDate = NOW() WHERE id = ?`, [cheque.id]);
                yield conn.commit();
                yield (0, auditController_1.logAction)(userName, 'CHEQUE', 'COLLECT', `تحصيل شيك بواسطة Dax AI - ${cheque.chequeNumber}`, `المبلغ: ${cheque.amount}`);
                eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'cheques', updatedBy: userName });
                return {
                    success: true,
                    message: `Cheque ${cheque.chequeNumber} collected`,
                    messageAr: `✅ تم تحصيل الشيك ${cheque.chequeNumber} بمبلغ ${Number(cheque.amount).toLocaleString('ar-EG')} جنيه (${cheque.partnerName})`,
                    data: { chequeId: cheque.id, chequeNumber: cheque.chequeNumber, amount: cheque.amount }
                };
            }
            catch (e) {
                yield conn.rollback();
                return { success: false, message: e.message, messageAr: `❌ فشل تحصيل الشيك: ${e.message}` };
            }
            finally {
                conn.release();
            }
        })
    },
    // ─── 4. ADJUST STOCK (تعديل مخزون) ──────────────────
    {
        id: 'adjust_stock',
        nameAr: 'تعديل رصيد المخزون',
        nameEn: 'Adjust Stock',
        description: 'تعديل كمية صنف في المخزون',
        icon: '📦',
        requiredRoles: ['admin', 'warehouse'],
        category: 'inventory',
        confirmationRequired: true,
        parameters: [
            { name: 'productId', nameAr: 'الصنف', type: 'string', required: true },
            { name: 'quantity', nameAr: 'الكمية الجديدة', type: 'number', required: true },
        ],
        execute: (params, userId, userName) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { productId, productName, quantity } = params;
                if (!productId || quantity === undefined) {
                    return { success: false, message: 'Missing product or quantity', messageAr: 'يجب تحديد الصنف والكمية' };
                }
                const [old] = yield db_1.pool.query(`SELECT name, quantity as oldQty FROM products WHERE id = ? LIMIT 1`, [productId]);
                if (old.length === 0) {
                    return { success: false, message: 'Product not found', messageAr: '❌ الصنف غير موجود' };
                }
                yield db_1.pool.query(`UPDATE products SET quantity = ? WHERE id = ?`, [quantity, productId]);
                yield (0, auditController_1.logAction)(userName, 'INVENTORY', 'ADJUST', `تعديل مخزون بواسطة Dax AI - ${old[0].name}`, `${old[0].oldQty} → ${quantity}`);
                eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'products', updatedBy: userName });
                return {
                    success: true,
                    message: `Stock adjusted for ${old[0].name}`,
                    messageAr: `✅ تم تعديل مخزون "${old[0].name}" من ${old[0].oldQty} إلى ${quantity}`,
                    data: { productId, productName: old[0].name, oldQuantity: old[0].oldQty, newQuantity: quantity }
                };
            }
            catch (e) {
                return { success: false, message: e.message, messageAr: `❌ فشل تعديل المخزون: ${e.message}` };
            }
        })
    },
];
// ── Lookup helpers ───────────────────────────────────────
function getAction(actionId) {
    return exports.ACTION_REGISTRY.find(a => a.id === actionId);
}
function canUserExecute(action, userRole) {
    if (action.requiredRoles.length === 0)
        return true;
    return action.requiredRoles.includes(userRole.toLowerCase());
}
// Build a confirmation proposal for the frontend
function buildActionProposal(action, params) {
    return {
        type: 'action_proposal',
        actionId: action.id,
        nameAr: action.nameAr,
        icon: action.icon,
        confirmationRequired: action.confirmationRequired,
        params,
        summary: buildSummaryLines(action, params),
    };
}
function buildSummaryLines(action, params) {
    const lines = [];
    for (const p of action.parameters) {
        const val = params[p.name];
        if (val !== undefined && val !== null) {
            let display = String(val);
            if (p.type === 'number')
                display = Number(val).toLocaleString('ar-EG');
            if (p.name === 'partnerId' && params.partnerName)
                display = params.partnerName;
            if (p.name === 'productId' && params.productName)
                display = params.productName;
            lines.push({ label: p.nameAr, value: display });
        }
    }
    if (!params.date) {
        lines.push({ label: 'التاريخ', value: 'اليوم' });
    }
    return lines;
}
