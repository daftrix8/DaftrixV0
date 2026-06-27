"use strict";
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDailyBrief = exports.handleListActions = exports.handleExecuteAction = exports.handleAISessions = exports.handleAIUsageStats = exports.handleAIFeedback = exports.getBusinessPulse = exports.getSuggestedQuestions = exports.getChatHistory = exports.handleAIChat = void 0;
exports.getAPIKeys = getAPIKeys;
exports.getAIClient = getAIClient;
exports.generateAIContent = generateAIContent;
exports.generateWithFailover = generateWithFailover;
exports.resetAIClient = resetAIClient;
exports.scopeQueryByBranch = scopeQueryByBranch;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
const aiActionRegistry_1 = require("./aiActionRegistry");
const aiKnowledgeController_1 = require("./aiKnowledgeController");
const brandConfig_1 = require("../config/brandConfig");
// ═══════════════════════════════════════════════════════════
// AI CHATBOT CONTROLLER — DaftriX ERP AI Intelligence Engine
// Supports Gemini, Groq, Cloudflare, and OpenRouter
// with automatic provider failover cascade
// ═══════════════════════════════════════════════════════════
// ── CONSTANTS ─────────────────────────────────────────────
const AI_CONSTANTS = {
    // Timing
    CONFIG_TTL: 5 * 60 * 1000, // 5min — reload config from DB
    SESSION_TTL: 60 * 60 * 1000, // 60min — persistent session expiry
    CACHE_TTL: 5 * 60 * 1000, // 5min — response cache
    GROQ_WINDOW_MS: 60000, // 1min — Groq rate limit window
    // Limits
    MAX_CACHE_ENTRIES: 200,
    MAX_MESSAGE_LENGTH: 2000,
    MAX_HISTORY_FAST: 10, // Groq/OpenRouter — fast providers
    MAX_HISTORY_SLOW: 4, // Gemini free tier
    MAX_STATEMENT_LINES: 150,
    MAX_SUGGESTIONS: 4,
    MAX_NAV_LINKS: 3,
    MAX_SESSIONS: 500,
    // Token budgets
    MAX_TOKENS_FAST: 4096, // Groq/OpenRouter
    MAX_TOKENS_SLOW: 2048, // Gemini free
    OUTPUT_RESERVE_TOKENS: 4096, // Reserved for model output
    CONTEXT_BUDGET_RATIO: 0.6, // 60% of budget for DB context
    // Model context windows (tokens)
    MODEL_LIMITS: {
        'gemma-4-31b-it': 128000,
        'gemma-4-26b-a4b-it': 128000,
        'gemini-2.5-flash': 1000000,
        'gemini-2.5-flash-lite': 1000000,
        'gemini-2.5-pro': 1000000,
        'gemini-2.0-flash': 1000000,
        'gemini-2.0-flash-lite': 1000000,
        'gemma-3-27b-it': 128000,
        'gemma-3-12b-it': 128000,
        'llama-3.3-70b-versatile': 128000,
        'llama-3.1-8b-instant': 128000,
    },
    // Provider failover cascade order
    PROVIDER_CASCADE: ['groq', 'gemini', 'openrouter', 'cloudflare'],
};
// Available AI models
const AI_MODELS = {
    'gemma-4-31b-it': { name: 'Gemma 4 31B (Dense)', id: 'gemma-4-31b-it' },
    'gemma-4-26b-a4b-it': { name: 'Gemma 4 26B (MoE)', id: 'gemma-4-26b-a4b-it' },
    'gemini-2.5-flash': { name: 'Gemini 2.5 Flash', id: 'gemini-2.5-flash' },
    'gemini-2.5-flash-lite': { name: 'Gemini 2.5 Flash-Lite', id: 'gemini-2.5-flash-lite' },
    'gemini-2.5-pro': { name: 'Gemini 2.5 Pro', id: 'gemini-2.5-pro' },
    'gemini-2.0-flash': { name: 'Gemini 2.0 Flash', id: 'gemini-2.0-flash' },
    'gemini-2.0-flash-lite': { name: 'Gemini 2.0 Flash-Lite', id: 'gemini-2.0-flash-lite' },
    'gemma-3-27b-it': { name: 'Gemma 3 27B', id: 'gemma-3-27b-it' },
    'gemma-3-12b-it': { name: 'Gemma 3 12B', id: 'gemma-3-12b-it' },
};
const DEFAULT_MODEL = 'gemma-4-31b-it';
const MODEL_PROFILES = [
    // Fast tier — chitchat, greetings, simple lookups
    { id: 'llama-3.1-8b-instant', tier: 'fast', provider: 'groq', contextWindow: 128000, costPerMToken: 0 },
    { id: 'gemma-3-12b-it', tier: 'fast', provider: 'groq', contextWindow: 128000, costPerMToken: 0 },
    { id: 'gemini-2.0-flash-lite', tier: 'fast', provider: 'gemini', contextWindow: 1000000, costPerMToken: 0 },
    // Balanced tier — data queries, statements, reports
    { id: 'gemma-4-31b-it', tier: 'balanced', provider: 'groq', contextWindow: 128000, costPerMToken: 0 },
    { id: 'gemma-4-26b-a4b-it', tier: 'balanced', provider: 'groq', contextWindow: 128000, costPerMToken: 0 },
    { id: 'gemini-2.5-flash', tier: 'balanced', provider: 'gemini', contextWindow: 1000000, costPerMToken: 0 },
    // Reasoning tier — complex analysis, forecasts, comparisons
    { id: 'gemini-2.5-pro', tier: 'reasoning', provider: 'gemini', contextWindow: 1000000, costPerMToken: 0 },
    { id: 'llama-3.3-70b-versatile', tier: 'reasoning', provider: 'groq', contextWindow: 128000, costPerMToken: 0 },
];
// Intent → required model tier mapping
const INTENT_TIER_MAP = {
    chitchat: 'fast', general: 'fast', help: 'fast', app_guide: 'fast',
    customer_balance: 'balanced', supplier_balance: 'balanced', invoice_lookup: 'balanced',
    product_search: 'balanced', treasury: 'balanced', cheques: 'balanced', hr: 'balanced',
    inventory: 'balanced', production: 'balanced', sales_report: 'balanced', purchases: 'balanced',
    customer_statement: 'balanced', supplier_statement: 'balanced', accounting: 'balanced',
    comparative: 'reasoning', aging: 'reasoning', cashflow: 'reasoning', inventory_intelligence: 'reasoning',
};
// Smart model selection: picks the best model for the task
function smartSelectModel(intent, userSelectedModel, contextSize) {
    const requiredTier = INTENT_TIER_MAP[intent] || 'balanced';
    // If user explicitly chose a model, respect it unless it's a massive downgrade for complex queries
    const userProfile = MODEL_PROFILES.find(p => p.id === userSelectedModel);
    if (userProfile) {
        // User's model is good enough — respect their choice
        const tierOrder = { fast: 0, balanced: 1, reasoning: 2 };
        if (tierOrder[userProfile.tier] >= tierOrder[requiredTier]) {
            return { modelId: userSelectedModel, reason: 'user_selected' };
        }
        // User's model is too weak for this task — auto-upgrade
        if (requiredTier === 'reasoning' && userProfile.tier === 'fast') {
            const upgrade = MODEL_PROFILES.find(p => p.tier === 'reasoning');
            if (upgrade) {
                console.log(`[Smart Router] ⬆️ Auto-upgrading from ${userSelectedModel} (${userProfile.tier}) to ${upgrade.id} (${upgrade.tier}) for intent: ${intent}`);
                return { modelId: upgrade.id, reason: `auto_upgrade:${intent}` };
            }
        }
    }
    // Default: use user's selected model
    return { modelId: userSelectedModel, reason: 'default' };
}
let _aiConfig = null;
let _apiKeys = [];
let _currentKeyIndex = 0;
let _selectedModel = DEFAULT_MODEL;
let _configLoadedAt = 0;
const CONFIG_TTL = AI_CONSTANTS.CONFIG_TTL;
// Groq Rate Limit State
const _groqKeyLastUsed = {};
const GROQ_WINDOW_MS = AI_CONSTANTS.GROQ_WINDOW_MS;
function pickGroqKeyIndex(keysLength) {
    const now = Date.now();
    let bestIdx = 0;
    let oldestUse = Infinity;
    for (let i = 0; i < keysLength; i++) {
        const lastUsed = _groqKeyLastUsed[i] || 0;
        if (now - lastUsed > GROQ_WINDOW_MS) {
            _groqKeyLastUsed[i] = now;
            return i;
        }
        if (lastUsed < oldestUse) {
            oldestUse = lastUsed;
            bestIdx = i;
        }
    }
    _groqKeyLastUsed[bestIdx] = now;
    return bestIdx;
}
function getAPIKeys() {
    return __awaiter(this, void 0, void 0, function* () {
        let apiKeyString = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
        try {
            const [rows] = yield db_1.pool.query('SELECT config FROM system_config LIMIT 1');
            if (rows.length > 0) {
                let cfg = rows[0].config;
                if (typeof cfg === 'string')
                    try {
                        cfg = JSON.parse(cfg);
                    }
                    catch (e) {
                        console.warn('[AI] Failed to parse config JSON', e);
                    }
                _aiConfig = cfg;
                if (cfg === null || cfg === void 0 ? void 0 : cfg.geminiApiKey)
                    apiKeyString = cfg.geminiApiKey;
                if (cfg === null || cfg === void 0 ? void 0 : cfg.aiModel) {
                    _selectedModel = cfg.aiModel;
                }
                else if ((cfg === null || cfg === void 0 ? void 0 : cfg.geminiModel) && AI_MODELS[cfg.geminiModel]) {
                    _selectedModel = cfg.geminiModel;
                }
            }
        }
        catch (e) {
            console.warn('[AI] Failed to load config from DB, using fallback', e);
        }
        _configLoadedAt = Date.now();
        // Support comma, semicolon, or newline separated keys (for Gemini)
        _apiKeys = apiKeyString.split(/[,;\n]+/).map(k => k.trim()).filter(k => k);
        return _apiKeys;
    });
}
function getAIClient() {
    return __awaiter(this, void 0, void 0, function* () {
        // Legacy support: return a client with the current key
        const keys = yield getAPIKeys();
        if (keys.length === 0)
            return null;
        const { GoogleGenAI } = yield Promise.resolve().then(() => __importStar(require('@google/genai')));
        return new GoogleGenAI({ apiKey: keys[_currentKeyIndex] });
    });
}
function generateAIContent(model, params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        var _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        if (!_aiConfig || _apiKeys.length === 0 || Date.now() - _configLoadedAt > CONFIG_TTL) {
            yield getAPIKeys();
        }
        const provider = (_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.aiProvider) || 'gemini';
        model = _selectedModel || model;
        // Auto-map model per provider — prevent sending Gemini model names to Groq/etc
        const PROVIDER_DEFAULTS = {
            groq: 'llama-3.3-70b-versatile',
            cloudflare: '@cf/meta/llama-3.1-8b-instruct',
            openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
        };
        if (provider !== 'gemini' && (model.startsWith('gemini') || model.startsWith('gemma'))) {
            // User has a Gemini model selected but switched provider — use provider default
            model = (_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.aiModel) || PROVIDER_DEFAULTS[provider] || model;
            // If aiModel is still a gemini model, force the provider default
            if (model.startsWith('gemini') || model.startsWith('gemma')) {
                model = PROVIDER_DEFAULTS[provider] || model;
            }
        }
        // ============================================
        // GEMINI IMPLEMENTATION (Legacy & Default)
        // ============================================
        if (provider === 'gemini') {
            if (_apiKeys.length === 0)
                throw new Error('مفتاح الذكاء الاصطناعي (Gemini) غير مفعل');
            const { GoogleGenAI } = yield Promise.resolve().then(() => __importStar(require('@google/genai')));
            let lastError = null;
            for (let attempts = 0; attempts < _apiKeys.length; attempts++) {
                const apiKey = _apiKeys[_currentKeyIndex];
                const ai = new GoogleGenAI({ apiKey });
                // Proactively rotate key for the NEXT request
                _currentKeyIndex = (_currentKeyIndex + 1) % _apiKeys.length;
                try {
                    if (params.onChunk) {
                        const resultStream = yield ai.models.generateContentStream(Object.assign({ model }, params));
                        let fullText = '';
                        try {
                            for (var _t = true, resultStream_1 = (e_1 = void 0, __asyncValues(resultStream)), resultStream_1_1; resultStream_1_1 = yield resultStream_1.next(), _a = resultStream_1_1.done, !_a; _t = true) {
                                _c = resultStream_1_1.value;
                                _t = false;
                                const chunk = _c;
                                const textChunk = chunk.text;
                                fullText += textChunk;
                                params.onChunk(textChunk);
                            }
                        }
                        catch (e_1_1) { e_1 = { error: e_1_1 }; }
                        finally {
                            try {
                                if (!_t && !_a && (_b = resultStream_1.return)) yield _b.call(resultStream_1);
                            }
                            finally { if (e_1) throw e_1.error; }
                        }
                        return {
                            text: fullText,
                            response: { text: () => fullText }
                        };
                    }
                    return yield ai.models.generateContent(Object.assign({ model }, params));
                }
                catch (error) {
                    lastError = error;
                    const status = error === null || error === void 0 ? void 0 : error.status;
                    const msg = ((_d = error === null || error === void 0 ? void 0 : error.message) === null || _d === void 0 ? void 0 : _d.toLowerCase()) || '';
                    const isRateLimit = status === 429 || status === 403 || status === 503 ||
                        msg.includes('429') || msg.includes('quota') ||
                        msg.includes('rate') || msg.includes('exhausted');
                    if (isRateLimit && _apiKeys.length > 1) {
                        console.warn(`[AI] API Key at index ${_currentKeyIndex} hit limit. Rotating to next key...`);
                        _currentKeyIndex = (_currentKeyIndex + 1) % _apiKeys.length;
                        continue; // Try next key
                    }
                    throw error; // Not a rate limit error, throw immediately
                }
            }
            throw new Error('تم استهلاك الحد المسموح لجميع مفاتيح الذكاء الاصطناعي (Rate Limit). ' + ((lastError === null || lastError === void 0 ? void 0 : lastError.message) || ''));
        }
        // ============================================
        // OPENAI COMPATIBLE PROVIDERS (Groq, OpenRouter)
        // ============================================
        if (provider === 'groq' || provider === 'openrouter' || provider === 'cloudflare') {
            let apiUrl = '';
            let headers = { 'Content-Type': 'application/json' };
            if (provider === 'groq') {
                if (!(_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.groqApiKey))
                    throw new Error('مفتاح Groq غير مفعل');
                const groqKeys = _aiConfig.groqApiKey.split(/[,;\n]+/).map((k) => k.trim()).filter((k) => k);
                const keyIdx = pickGroqKeyIndex(groqKeys.length);
                apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
                headers['Authorization'] = `Bearer ${groqKeys[keyIdx]}`;
            }
            else if (provider === 'openrouter') {
                if (!(_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.openRouterApiKey))
                    throw new Error('مفتاح OpenRouter غير مفعل');
                apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
                headers['Authorization'] = `Bearer ${_aiConfig.openRouterApiKey}`;
                headers['HTTP-Referer'] = brandConfig_1.SERVER_BRAND.website || 'https://erp.com';
                headers['X-Title'] = `${brandConfig_1.SERVER_BRAND.name} AI`;
            }
            else if (provider === 'cloudflare') {
                if (!(_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.cloudflareAccountId) || !(_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.cloudflareApiToken)) {
                    throw new Error('بيانات Cloudflare غير مكتملة');
                }
                apiUrl = `https://api.cloudflare.com/client/v4/accounts/${_aiConfig.cloudflareAccountId}/ai/run/${model}`;
                headers['Authorization'] = `Bearer ${_aiConfig.cloudflareApiToken}`;
            }
            // Map Gemini SDK format to OpenAI format
            const messages = [];
            if ((_e = params.config) === null || _e === void 0 ? void 0 : _e.systemInstruction) {
                const sysInstr = params.config.systemInstruction;
                const sysText = typeof sysInstr === 'string' ? sysInstr : ((_g = (_f = sysInstr === null || sysInstr === void 0 ? void 0 : sysInstr.parts) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.text) || '';
                if (sysText) {
                    messages.push({ role: 'system', content: sysText });
                }
            }
            for (const content of params.contents) {
                const role = content.role === 'model' ? 'assistant' : 'user';
                // Check for multi-modal (images)
                const hasInlineData = content.parts.some((p) => p.inlineData);
                if (hasInlineData && provider !== 'cloudflare') {
                    const parts = content.parts.map((p) => {
                        if (p.text)
                            return { type: 'text', text: p.text };
                        if (p.inlineData) {
                            return {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`
                                }
                            };
                        }
                        return null;
                    }).filter(Boolean);
                    messages.push({ role, content: parts });
                }
                else {
                    const text = content.parts.map((p) => p.text || '').join('');
                    messages.push({ role, content: text });
                }
            }
            const payload = {
                messages: messages
            };
            if (provider !== 'cloudflare') {
                payload.model = model;
                if (((_h = params.config) === null || _h === void 0 ? void 0 : _h.temperature) !== undefined)
                    payload.temperature = params.config.temperature;
                if (((_j = params.config) === null || _j === void 0 ? void 0 : _j.maxOutputTokens) !== undefined)
                    payload.max_tokens = params.config.maxOutputTokens;
                // Groq/Llama specific tuning for optimal reasoning and speed
                if (provider === 'groq' || provider === 'openrouter') {
                    payload.top_p = 0.9;
                    payload.frequency_penalty = 0.1;
                    payload.presence_penalty = 0.1;
                }
            }
            if (params.onChunk) {
                payload.stream = true;
                const response = yield fetch(apiUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });
                if (!response.ok) {
                    const errText = yield response.text();
                    throw new Error(`${provider} API Error (${response.status}): ${errText}`);
                }
                const reader = (_k = response.body) === null || _k === void 0 ? void 0 : _k.getReader();
                const decoder = new TextDecoder("utf-8");
                let resultText = "";
                if (reader) {
                    while (true) {
                        const { done, value } = yield reader.read();
                        if (done)
                            break;
                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split("\n").filter(line => line.trim() !== "");
                        for (const line of lines) {
                            if (line === "data: [DONE]")
                                continue;
                            if (line.startsWith("data: ")) {
                                try {
                                    const data = JSON.parse(line.substring(6));
                                    const textChunk = ((_o = (_m = (_l = data.choices) === null || _l === void 0 ? void 0 : _l[0]) === null || _m === void 0 ? void 0 : _m.delta) === null || _o === void 0 ? void 0 : _o.content) || "";
                                    resultText += textChunk;
                                    params.onChunk(textChunk);
                                }
                                catch (e) {
                                    // Ignore parse errors for incomplete chunks
                                }
                            }
                        }
                    }
                }
                return {
                    text: resultText,
                    response: {
                        text: () => resultText
                    }
                };
            }
            const response = yield fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errText = yield response.text();
                throw new Error(`${provider} API Error (${response.status}): ${errText}`);
            }
            const data = yield response.json();
            // Mock the Gemini SDK response format so callers don't break
            let resultText = '';
            if (payload.stream) {
                // Streaming mode is not fully implemented for Groq here, return error or handle it.
                // For now, if stream is requested on Groq/OpenRouter, we'll wait for the whole thing
                // since fetch chunking requires more complex logic.
            }
            if (provider === 'cloudflare') {
                resultText = ((_p = data.result) === null || _p === void 0 ? void 0 : _p.response) || '';
            }
            else {
                resultText = ((_s = (_r = (_q = data.choices) === null || _q === void 0 ? void 0 : _q[0]) === null || _r === void 0 ? void 0 : _r.message) === null || _s === void 0 ? void 0 : _s.content) || '';
            }
            return {
                text: resultText,
                response: {
                    text: () => resultText
                }
            };
        }
        throw new Error(`مزود الذكاء الاصطناعي غير معروف: ${provider}`);
    });
}
// ── AUTOMATIC PROVIDER FAILOVER ──────────────────────────
// Wraps generateAIContent with a cascade: if the primary provider fails
// with a transient error, automatically try the next available provider.
function isTransientError(error) {
    const status = (error === null || error === void 0 ? void 0 : error.status) || (error === null || error === void 0 ? void 0 : error.statusCode);
    const msg = ((error === null || error === void 0 ? void 0 : error.message) || '').toLowerCase();
    return status === 429 || status === 503 || status === 502 || status === 500 ||
        msg.includes('429') || msg.includes('rate') || msg.includes('quota') ||
        msg.includes('exhausted') || msg.includes('overloaded') ||
        msg.includes('timeout') || msg.includes('econnreset') ||
        msg.includes('fetch failed') || msg.includes('network');
}
function hasValidKey(provider) {
    if (provider === 'gemini')
        return _apiKeys.length > 0;
    if (provider === 'groq')
        return !!(_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.groqApiKey);
    if (provider === 'openrouter')
        return !!(_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.openRouterApiKey);
    if (provider === 'cloudflare')
        return !!(_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.cloudflareAccountId) && !!(_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.cloudflareApiToken);
    return false;
}
function generateWithFailover(model, params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const primary = (_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.aiProvider) || 'gemini';
        // Build cascade: primary first, then others
        const cascade = [primary, ...AI_CONSTANTS.PROVIDER_CASCADE.filter(p => p !== primary)];
        let lastError = null;
        const origProvider = _aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.aiProvider;
        for (const provider of cascade) {
            if (!hasValidKey(provider))
                continue;
            try {
                // Temporarily set provider for generateAIContent
                if (_aiConfig)
                    _aiConfig.aiProvider = provider;
                const result = yield generateAIContent(model, params);
                // Restore original provider
                if (_aiConfig)
                    _aiConfig.aiProvider = origProvider;
                return { result, usedProvider: provider };
            }
            catch (e) {
                lastError = e;
                if (_aiConfig)
                    _aiConfig.aiProvider = origProvider;
                if (isTransientError(e)) {
                    console.warn(`[AI Failover] ⚠️ ${provider} failed with transient error: ${(_a = e.message) === null || _a === void 0 ? void 0 : _a.substring(0, 100)}. Cascading...`);
                    continue;
                }
                // Non-transient error (bad request, auth) — don't cascade, throw immediately
                throw e;
            }
        }
        throw lastError || new Error('جميع مزودي الذكاء الاصطناعي غير متوفرين حالياً');
    });
}
// Force re-read API key + model from DB (called when settings change)
function resetAIClient() { _aiConfig = null; _apiKeys = []; _selectedModel = DEFAULT_MODEL; _currentKeyIndex = 0; }
const _sessions = new Map();
const SESSION_TTL = AI_CONSTANTS.SESSION_TTL;
function getSession(sessionId) {
    // 1. Try hot cache first
    const s = _sessions.get(sessionId);
    if (s && Date.now() - s.updatedAt < SESSION_TTL)
        return s;
    if (s)
        _sessions.delete(sessionId);
    return null;
}
function getSessionAsync(sessionId) {
    return __awaiter(this, void 0, void 0, function* () {
        // 1. Try hot cache
        const cached = getSession(sessionId);
        if (cached)
            return cached;
        // 2. Fallback to DB
        try {
            const [rows] = yield db_1.pool.query(`SELECT * FROM ai_chat_sessions WHERE id = ? AND updatedAt > DATE_SUB(NOW(), INTERVAL 60 MINUTE) LIMIT 1`, [sessionId]);
            if (rows.length > 0) {
                const r = rows[0];
                const restored = {
                    lastIntent: r.lastIntent || 'general',
                    lastPartnerId: r.lastPartnerId || undefined,
                    lastPartnerName: r.lastPartnerName || undefined,
                    lastEntityType: r.lastEntityType || undefined,
                    lastTopic: r.lastTopic || undefined,
                    conversationTone: r.conversationTone || 'ar',
                    updatedAt: new Date(r.updatedAt).getTime(),
                };
                // Hydrate hot cache
                _sessions.set(sessionId, restored);
                console.log(`[AI Session] 🔄 Restored session ${sessionId} from DB (intent: ${restored.lastIntent}, partner: ${restored.lastPartnerName || 'none'})`);
                return restored;
            }
        }
        catch (e) {
            console.warn('[AI Session] DB lookup failed:', e);
        }
        return null;
    });
}
function updateSession(sessionId, update) {
    const existing = _sessions.get(sessionId) || { lastIntent: 'general', updatedAt: 0 };
    const merged = Object.assign(Object.assign(Object.assign({}, existing), update), { updatedAt: Date.now() });
    _sessions.set(sessionId, merged);
    // Persist to DB (fire-and-forget for speed)
    db_1.pool.query(`INSERT INTO ai_chat_sessions (id, userId, lastIntent, lastPartnerId, lastPartnerName, lastEntityType, lastTopic, conversationTone, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
           lastIntent = VALUES(lastIntent),
           lastPartnerId = VALUES(lastPartnerId),
           lastPartnerName = VALUES(lastPartnerName),
           lastEntityType = VALUES(lastEntityType),
           lastTopic = VALUES(lastTopic),
           conversationTone = VALUES(conversationTone),
           updatedAt = NOW()`, [sessionId, update.userName || 'unknown', merged.lastIntent, merged.lastPartnerId || null, merged.lastPartnerName || null, merged.lastEntityType || null, merged.lastTopic || null, merged.conversationTone || 'ar']).catch(e => console.warn('[AI Session] DB persist failed:', e));
    // Cleanup old sessions periodically
    if (_sessions.size > AI_CONSTANTS.MAX_SESSIONS) {
        const now = Date.now();
        for (const [k, v] of _sessions) {
            if (now - v.updatedAt > SESSION_TTL)
                _sessions.delete(k);
        }
    }
}
// Detect if a message is a follow-up (short, no clear intent keywords)
function isFollowUp(message, detectedIntent) {
    const lower = message.toLowerCase().trim();
    const wordCount = lower.split(/\s+/).length;
    // ── CHITCHAT EXCLUSION GUARD ──
    // Short casual messages (greetings, "how are you", etc.) must NEVER be treated as follow-ups
    // even if they're classified as 'general' — they should always get a fresh chitchat response
    const chitchatGuard = [
        /^(صباح|مساء|أهلا|اهلا|هلا|مرحبا|هاي|سلام|يا هلا|الو|hello|hi|hey)/i,
        /(عامل ايه|كيف حالك|ازيك|أخبارك|اخبارك|كيفك|ايه الاخبار|اخبارك ايه|عامل كويس|تمام)/i,
        /^(شكرا|شكراً|متشكر|thank|thanks|تسلم|برافو|يسلمو)/i,
        /^(يا دكس|يا دفتري|دكس|dax)/i,
        /(نكتة|joke|ضحكني|حكمة|نصيحة)/i,
        /^(مين أنت|مين انت|اسمك ايه|عرفني بنفسك|who are you)/i,
    ];
    if (chitchatGuard.some(p => p.test(lower)))
        return false;
    // Very short messages or pronouns-only are follow-ups
    if (wordCount <= 3 && detectedIntent === 'general')
        return true;
    // "وشهر X" / "وشهر كذا" / "والشهر اللي قبله"
    if (/^و/.test(lower) && wordCount <= 5)
        return true;
    // "كم رصيده" / "رصيده كام" / "آخر فاتورة" with pronouns (ـه، ـها)
    if (/[هـ]($|\s)/.test(lower) && wordCount <= 4 && detectedIntent !== 'customer_balance')
        return true;
    // Continuation requests
    if (/^(أكمل|اكمل|المزيد|more|تفاصيل|فصّل|فصل|وضّح|وضح|كمّل|كمل)/.test(lower))
        return true;
    // Pronoun-based follow-ups: حسابه، رصيده، فواتيره، شيكاته، كشفه
    if (/(حسابه|رصيده|فواتيره|شيكاته|كشفه|بتاعه|بتاعته|ايه اخباره|اخباره|ديونه|مبيعاته|مشترياته)/.test(lower))
        return true;
    // "هل عنده" / "عنده كام" / "هل سدد" / "متأخر عليه"
    if (/(هل عنده|عنده كام|هل سدد|متأخر عليه|دفع كام|سدد كام|عليه كام|له كام)/.test(lower))
        return true;
    // "نفس العميل/المورد"
    if (/(نفس العميل|نفس المورد|نفس الشخص|العميل ده|المورد ده)/.test(lower))
        return true;
    // ── SUGGESTION BUTTON FOLLOW-UPS ──
    // These are the exact texts from getSuggestedFollowUps() — when clicked they should inherit session context
    const suggestionPatterns = [
        /^(ملخص الرصيد|كشف حساب تفصيلي|كشف حساب أكبر مدين|أعمار الديون|خطة تحصيل|تفاصيل أعلى عميل)/,
        /^(قارن بالشهر|المبيعات النقدية|أعلى \d+ عمل|شيكات مستحقة|رصيد الخزينة)/,
        /^(توقع التدفق|أصناف بطيئة|أصناف نفدت|أصناف قربت|تنويع الموردين|أعلى الموردين)/,
        /^(أسباب التراجع|تفاصيل الشيكات|أكبر المدينين|تقرير المبيعات|تقرير المشتريات)/,
        /^(مبيعات اليوم|أرصدة العملاء)/,
    ];
    if (suggestionPatterns.some(p => p.test(lower)))
        return true;
    return false;
}
// Resolve follow-up intent: maps a follow-up message to the correct specific intent
function resolveFollowUpIntent(message, prevIntent) {
    const lower = message.toLowerCase().trim();
    // Explicit intent keywords in follow-up override previous intent
    if (/(شيكات|شيك|cheque|شيكات مستحقة)/.test(lower))
        return 'cheques';
    if (/(كشف حساب|كشفه|حركاته|statement|كشف حساب تفصيلي|كشف حساب أكبر مدين)/.test(lower)) {
        return prevIntent.startsWith('supplier') ? 'supplier_statement' : 'customer_statement';
    }
    if (/(فاتورة|فواتير|invoice)/.test(lower))
        return 'invoice_lookup';
    if (/(مبيعات|sales|مبيعات اليوم|تقرير المبيعات)/.test(lower))
        return 'sales_report';
    if (/(مشتريات|purchase|تقرير المشتريات)/.test(lower))
        return 'purchases';
    if (/(مخزون|stock|inventory|أصناف بطيئة|أصناف نفدت|أصناف قربت)/.test(lower))
        return 'inventory';
    if (/(متأخر|overdue|aging|أعمار الديون|أكبر المدينين)/.test(lower))
        return 'aging';
    if (/(ملخص الرصيد|رصيد فقط)/.test(lower))
        return 'customer_balance';
    if (/(توقع التدفق|تدفق نقدي|سيولة)/.test(lower))
        return 'cashflow';
    if (/(رصيد الخزينة|خزينة)/.test(lower))
        return 'treasury';
    if (/(قارن بالشهر|مقارنة|المبيعات النقدية)/.test(lower))
        return 'comparative';
    if (/(أرصدة العملاء)/.test(lower))
        return 'aging';
    if (/(أعلى الموردين|تنويع الموردين)/.test(lower))
        return 'purchases';
    // Default: keep same intent family
    return prevIntent;
}
const _responseCache = new Map();
const CACHE_TTL = AI_CONSTANTS.CACHE_TTL;
function getCacheKey(intent, message, partnerId) {
    const normalized = message.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 150);
    return `${intent}:${partnerId || 'none'}:${normalized}`;
}
function getCachedResponse(key) {
    const entry = _responseCache.get(key);
    if (!entry)
        return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        _responseCache.delete(key);
        return null;
    }
    return entry;
}
function setCachedResponse(key, entry) {
    _responseCache.set(key, Object.assign(Object.assign({}, entry), { timestamp: Date.now() }));
    // Purge old entries
    if (_responseCache.size > AI_CONSTANTS.MAX_CACHE_ENTRIES) {
        const now = Date.now();
        for (const [k, v] of _responseCache) {
            if (now - v.timestamp > CACHE_TTL)
                _responseCache.delete(k);
        }
    }
}
// ── TOKEN ESTIMATION & USAGE LOGGING ─────────────────────
function estimateTokens(text) {
    if (!text)
        return 0;
    // Arabic characters are ~2 chars per token; English ~4 chars per token
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const otherChars = text.length - arabicChars;
    return Math.ceil(arabicChars / 2 + otherChars / 4);
}
function logUsage(userId, provider, model, intent, inputText, outputText, latencyMs, cached, error) {
    db_1.pool.query(`INSERT INTO ai_usage_log (userId, provider, model, intent, inputTokensEst, outputTokensEst, latencyMs, cached, error, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`, [userId, provider, model, intent, estimateTokens(inputText), estimateTokens(outputText), latencyMs, cached, error]).catch(() => { });
}
// ── CONTEXT WINDOW GUARD ─────────────────────────────────
function getModelLimit(model) {
    return AI_CONSTANTS.MODEL_LIMITS[model] || 128000;
}
function smartTruncateContext(context, maxTokens) {
    const currentTokens = estimateTokens(context);
    if (currentTokens <= maxTokens)
        return context;
    // Strategy: keep header (first 20%) + tail (last 10%) + truncation notice
    const lines = context.split('\n');
    const totalLines = lines.length;
    const headerLines = Math.ceil(totalLines * 0.3);
    const tailLines = Math.ceil(totalLines * 0.1);
    const header = lines.slice(0, headerLines).join('\n');
    const tail = lines.slice(-tailLines).join('\n');
    const truncated = `${header}\n\n⚠️ [تم اختصار ${totalLines - headerLines - tailLines} سطر من البيانات لأنها كبيرة — الملخص والنتائج الرئيسية محفوظة]\n\n${tail}`;
    return truncated;
}
function guardContextWindow(systemPrompt, context, history, model) {
    const limit = getModelLimit(model);
    const systemTokens = estimateTokens(systemPrompt);
    let budget = limit - systemTokens - AI_CONSTANTS.OUTPUT_RESERVE_TOKENS;
    if (budget < 1000)
        budget = 1000; // safety floor
    // Priority: context > recent history > old history
    const contextBudget = Math.floor(budget * AI_CONSTANTS.CONTEXT_BUDGET_RATIO);
    const truncatedContext = smartTruncateContext(context, contextBudget);
    budget -= estimateTokens(truncatedContext);
    // Trim history from oldest to fit remaining budget
    const trimmedHistory = [...history];
    while (estimateTokens(JSON.stringify(trimmedHistory)) > budget && trimmedHistory.length > 2) {
        trimmedHistory.shift();
    }
    return { context: truncatedContext, history: trimmedHistory };
}
const INTENT_KEYWORDS = {
    customer_statement: ['كشف حساب عميل', 'كشف حساب العميل', 'كشف العميل', 'تفاصيل حساب عميل', 'حركة عميل', 'حركات العميل', 'معاملات العميل', 'statement', 'customer statement', 'customer transactions'],
    customer_balance: ['رصيد العميل', 'رصيد عميل', 'أرصدة العملاء', 'ارصده العملاء', 'ارصدة العملاء', 'مديونية', 'مديونيات', 'حساب العميل', 'ذمم العملاء', 'عميل', 'عملاء', 'زبون', 'زبائن', 'customer balance', 'customer debt', 'receivables'],
    supplier_statement: ['كشف حساب مورد', 'كشف حساب المورد', 'كشف المورد', 'تفاصيل حساب مورد', 'حركة مورد', 'حركات المورد', 'supplier statement', 'supplier transactions'],
    supplier_balance: ['رصيد المورد', 'رصيد مورد', 'أرصدة الموردين', 'ارصده الموردين', 'ارصدة الموردين', 'حساب المورد', 'ذمم الموردين', 'مورد', 'موردين', 'supplier balance', 'supplier debt', 'payables'],
    comparative: ['قارن', 'مقارنة', 'compare', 'الفرق بين', 'مقابل', 'vs', 'versus', 'عن الشهر اللي فات', 'عن الشهر السابق', 'تراجع', 'تراجعت', 'زاد', 'زادت', 'نقص', 'نقصت', 'أكتر من الشهر', 'أقل من الشهر'],
    aging: ['متأخر', 'متأخرة', 'متاخر', 'متاخره', 'overdue', 'aging', 'أكتر من 30 يوم', 'أكتر من 60 يوم', 'أكتر من 90 يوم', 'مر عليه', 'مر عليها', 'ما دفعش', 'مدفعش', 'لسه مدفعش', 'ما سددش', 'عليه فلوس'],
    cashflow: ['تدفق نقدي', 'تدفقات', 'cash flow', 'cashflow', 'توقع', 'forecast', 'المتوقع', 'الأسبوع الجاي', 'الشهر الجاي', 'هندفع كام', 'هنقبض كام', 'سيولة'],
    inventory_intelligence: ['بطيئة الحركة', 'بطيء الحركة', 'slow moving', 'راكد', 'راكدة', 'dead stock', 'احتياجات', 'تقدير', 'هيخلص امتى', 'قربت تخلص', 'أيام مخزون', 'days of stock', 'reorder'],
    sales_report: ['مبيعات', 'إجمالي المبيعات', 'مبيعات اليوم', 'مبيعات الشهر', 'أعلى مبيعات', 'تقرير مبيعات', 'أعلى عميل', 'أكبر عميل', 'أفضل عميل', 'sales', 'revenue', 'أرباح', 'ربح', 'إيراد', 'إيرادات'],
    purchases: ['مشتريات', 'فواتير مشتريات', 'أوامر شراء', 'مشتريات اليوم', 'مشتريات الشهر', 'purchases', 'purchase orders', 'buying'],
    inventory: ['مخزون', 'رصيد المخزون', 'كمية', 'أصناف', 'تحت الحد', 'نفاد', 'stock', 'inventory', 'warehouse', 'مستودع', 'مخزن', 'جرد', 'أرصدة المخزن'],
    treasury: ['خزينة', 'رصيد البنك', 'نقدية', 'كاش', 'تحصيل', 'مصروفات', 'treasury', 'cash', 'bank', 'صندوق', 'حساب بنك', 'تحويل بنكي'],
    cheques: ['شيكات', 'شيك', 'شيكات مستحقة', 'شيكات واردة', 'شيكات صادرة', 'cheque', 'check', 'cheques due'],
    production: ['إنتاج', 'أمر إنتاج', 'تصنيع', 'خط إنتاج', 'أوامر إنتاج', 'production', 'manufacturing', 'bom', 'وصفة', 'تركيبة'],
    hr: ['موظف', 'موظفين', 'رواتب', 'راتب', 'حضور', 'إجازة', 'سلفة', 'سلف', 'employee', 'payroll', 'salary', 'attendance', 'leave', 'loan'],
    invoice_lookup: ['فاتورة رقم', 'فاتورة', 'فواتير', 'invoice', 'INV-', 'رقم الفاتورة'],
    product_search: ['سعر المنتج', 'سعر الصنف', 'ابحث عن منتج', 'منتج اسمه', 'product price', 'سعر', 'منتج', 'صنف اسمه'],
    accounting: ['ميزانية', 'ميزان مراجعة', 'قيد', 'قيود', 'حسابات', 'دليل حسابات', 'أرباح وخسائر', 'قائمة دخل', 'balance sheet', 'trial balance', 'journal', 'ledger', 'chart of accounts'],
    app_guide: ['كيف أعمل', 'كيف اعمل', 'ازاي اعمل', 'إزاي اعمل', 'فين', 'وين', 'أين', 'اين', 'كيف أسجل', 'كيف استخدم', 'شرح النظام', 'شرح البرنامج', 'navigate', 'where is', 'how to use'],
    help: ['كيف', 'شرح', 'مساعدة', 'طريقة', 'ازاي', 'إزاي', 'help', 'how to', 'guide'],
    general: [],
    chitchat: [],
};
// Fallback rule-based classifier
function classifyIntentSync(message) {
    const lower = message.toLowerCase();
    const trimmed = message.trim();
    // Priority overrides for complex intents
    const hasKashf = lower.includes('كشف') || lower.includes('statement') || lower.includes('حركات') || lower.includes('حركة') || lower.includes('تفاصيل حساب') || lower.includes('معاملات');
    const hasCustomer = lower.includes('عميل') || lower.includes('العميل') || lower.includes('عملاء') || lower.includes('customer') || lower.includes('client') || lower.includes('mr');
    const hasSupplier = lower.includes('مورد') || lower.includes('المورد') || lower.includes('موردين') || lower.includes('supplier') || lower.includes('vendor');
    const hasCompare = lower.includes('قارن') || lower.includes('مقارنة') || lower.includes('compare') || lower.includes('الفرق') || lower.includes('مقابل');
    const hasAging = lower.includes('متأخر') || lower.includes('متاخر') || lower.includes('overdue') || lower.includes('مر عليه') || lower.includes('ما دفعش') || lower.includes('عليه فلوس');
    const hasCashflow = lower.includes('تدفق') || lower.includes('cash flow') || lower.includes('توقع') || lower.includes('سيولة') || lower.includes('هندفع') || lower.includes('هنقبض');
    const hasSlowStock = lower.includes('بطيئة') || lower.includes('بطيء') || lower.includes('راكد') || lower.includes('هيخلص') || lower.includes('قربت تخلص') || lower.includes('slow');
    // Detect Arabic name prefixes like "أ/", "ا/", "السيد/", "MR ./" which imply a specific customer
    const hasNamePrefix = /[اأ]\s*\/|السيد\s*\/|MR\s*\.?\s*\//i.test(message);
    // Detect phone numbers (Egyptian mobile: 01xxxxxxxxx)
    const hasPhone = /\b01[0-9]{9}\b/.test(message);
    // Detect English "about" patterns: "tell me about", "what about", "show me", "info on"
    const hasAboutPattern = /\b(about|show\s+me|tell\s+me|info\s+on|what\s+about|know\s+about|details?\s+(of|on|for))\b/i.test(lower);
    if (hasKashf && hasCustomer)
        return 'customer_statement';
    if (hasKashf && hasSupplier)
        return 'supplier_statement';
    // "كشف حساب" with a name prefix but no explicit عميل/مورد → default to customer
    if (hasKashf && hasNamePrefix)
        return 'customer_statement';
    // "كشف حساب" alone without specifying type → default to customer (most common)
    if (hasKashf && lower.includes('حساب') && !hasSupplier)
        return 'customer_statement';
    if (hasCompare)
        return 'comparative';
    if (hasAging)
        return 'aging';
    if (hasCashflow)
        return 'cashflow';
    if (hasSlowStock)
        return 'inventory_intelligence';
    // Name prefix alone (e.g. "أ / محمود محمد") → likely asking about a customer
    if (hasNamePrefix)
        return 'customer_balance';
    // Phone number query → customer lookup
    if (hasPhone)
        return 'customer_balance';
    // English "about" + customer/name → customer lookup
    if (hasAboutPattern && (hasCustomer || hasNamePrefix))
        return 'customer_balance';
    if (hasAboutPattern && hasSupplier)
        return 'supplier_balance';
    // ── CHITCHAT DETECTION (highest priority for casual talk) ──
    const chitchatPatterns = [
        /^(صباح|مساء|أهلا|اهلا|هلا|مرحبا|مرحباً|هاي|سلام|يا هلا|الو|hello|hi|hey|good\s*morning|good\s*evening|good\s*night)/i,
        /^(مين أنت|مين انت|اسمك ايه|عرفني بنفسك|who are you|what are you)/i,
        // Casual "how are you" — with AND without hamza (أخبارك vs اخبارك)
        /(عامل ايه|عاملة ايه|كيف حالك|ازيك|أخبارك|اخبارك|كيفك|ايه الاخبار|اخبارك ايه|أخبارك ايه|عامل كويس|الحمد لله)/i,
        /^(شكرا|شكراً|متشكر|thank|thanks|تمام|أحسنت|ممتاز|جميل|حلو|cool|great|nice|ok|اوك|ماشي|تسلم|برافو|يسلمو)/i,
        /^(يا دكس|يا دفتري|دكس|dax)/i,
        /(نكتة|joke|حاجه مضحكة|ضحكني|حكمة|quote|نصيحة بزنس|motivat)/i,
    ];
    const isChitchat = chitchatPatterns.some(p => p.test(lower));
    if (isChitchat)
        return 'chitchat';
    // ── CASUAL / GENERAL CONVERSATION DETECTION ──
    // Detect casual questions and non-business messages BEFORE name detection
    const hasNoIntentKeyword = !hasKashf && !hasCompare && !hasAging && !hasCashflow && !hasSlowStock &&
        !lower.includes('مبيعات') && !lower.includes('مشتريات') && !lower.includes('مخزون') &&
        !lower.includes('خزينة') && !lower.includes('شيك') && !lower.includes('إنتاج') &&
        !lower.includes('فاتورة') && !lower.includes('حسابات') && !lower.includes('كيف') &&
        !lower.includes('ازاي') && !lower.includes('sales') && !lower.includes('inventory');
    const casualPatterns = [
        // Tech/Programming
        /(javascript|python|react|code|كود|برمجة|programming|typescript|html|css|api|server|database)/,
        // Life/General knowledge
        /(تاريخ|history|علم|science|رياضة|sports|أكل|food|سفر|travel|كتاب|book|فيلم|movie|أغنية|song|music)/,
        // General questions that aren't customer-related
        /(ما هو|ما هي|ايش يعني|يعني ايه|what is|explain|اشرح|فسر|معنى|definition)/,
        // "Tell me" patterns about non-business topics
        /(احكيلي|احكي لي|قولي|كلمني عن|tell me about (?!customer|supplier|client))/,
        // Weather/topics
        /(الطقس|الجو|weather)/,
    ];
    const isCasual = casualPatterns.some(p => p.test(lower));
    if (isCasual && hasNoIntentKeyword) {
        return 'general';
    }
    // ── PURE NAME DETECTION ──
    // If the message is just 2-5 Arabic words with no clear intent keyword, treat as a customer name lookup.
    // Guard: exclude question words and casual phrases to prevent false positives
    const arabicWords = trimmed.split(/\s+/).filter(w => /[\u0600-\u06FF]/.test(w));
    const totalWords = trimmed.split(/\s+/).length;
    const hasQuestionWords = /ما |هل |كيف |لماذا |متى |أين |من |ماذا |ليه |ايه |شو /.test(trimmed + ' ');
    const arabicRatio = arabicWords.length / Math.max(totalWords, 1);
    if (arabicRatio >= 0.8 && arabicWords.length >= 2 && totalWords <= 5 && hasNoIntentKeyword && !isCasual && !hasQuestionWords) {
        return 'customer_balance';
    }
    // English "about X" pattern without customer keyword — still likely a customer lookup
    if (hasAboutPattern && hasNoIntentKeyword && totalWords <= 12 && !isCasual) {
        return 'customer_balance';
    }
    let bestIntent = 'general';
    let bestScore = 0;
    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
        // Weight longer keyword matches more heavily
        let score = 0;
        for (const kw of keywords) {
            if (lower.includes(kw)) {
                score += kw.length; // longer matches = higher confidence
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestIntent = intent;
        }
    }
    return bestIntent;
}
// LLM-powered structured intent classifier
function classifyIntentWithLLM(message, modelId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            const provider = (_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.aiProvider) || 'gemini';
            // ── GROQ OPTIMIZATION: USE FAST 8B MODEL ──
            if (provider === 'groq' && (_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.groqApiKey)) {
                const groqKeys = _aiConfig.groqApiKey.split(/[,;\n]+/).map((k) => k.trim()).filter((k) => k);
                const keyIdx = pickGroqKeyIndex(groqKeys.length);
                const response = yield fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${groqKeys[keyIdx]}`
                    },
                    body: JSON.stringify({
                        model: 'llama-3.1-8b-instant',
                        temperature: 0,
                        max_tokens: 60,
                        messages: [{
                                role: 'user',
                                content: `Classify this ERP query. Reply ONLY with JSON.\nIntents: ${Object.keys(INTENT_KEYWORDS).join(', ')}\nQuery: "${message}"\n{"intent": "...", "targetName": "extracted name or null"}`
                            }]
                    })
                });
                const data = yield response.json();
                const text = (((_c = (_b = (_a = data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '').replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
                const parsed = JSON.parse(text);
                if (Object.keys(INTENT_KEYWORDS).includes(parsed.intent)) {
                    return { intent: parsed.intent, targetName: parsed.targetName || null };
                }
            }
            // ── FALLBACK FOR OTHER PROVIDERS ──
            const prompt = `Analyze this message and extract the user's intent. 
Possible intents: ${Object.keys(INTENT_KEYWORDS).join(', ')}.
If the user mentions a specific person, company, supplier, or product name, extract it into 'targetName'.
Respond ONLY with valid JSON in this exact format without any markdown wrappers:
{"intent": "exact_intent_string", "targetName": "Extracted Name or null"}

Message: "${message}"`;
            const response = yield generateAIContent(modelId, {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    temperature: 0.1, // Low temperature for deterministic output
                    maxOutputTokens: 100,
                },
            });
            const text = (response.text || '').replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
            const parsed = JSON.parse(text);
            // Validate intent exists in our type
            if (Object.keys(INTENT_KEYWORDS).includes(parsed.intent)) {
                return { intent: parsed.intent, targetName: parsed.targetName || null };
            }
            return { intent: classifyIntentSync(message), targetName: null };
        }
        catch (e) {
            console.warn('LLM Intent Classification Failed, falling back to keywords:', e);
            return { intent: classifyIntentSync(message), targetName: null };
        }
    });
}
// ── DB CONTEXT FETCHERS ──────────────────────────────────
// Each returns a string summary to inject into the AI prompt
// Shared helper: extract a partner name from user message by stripping known keywords
function extractPartnerName(message) {
    let cleaned = message.trim().replace(/[؟?!.,،:]/g, '').trim();
    // ── STRATEGY 1: If message contains a name prefix like "أ/", "ا/", "MR ./", "السيد/" anywhere,
    //    extract EVERYTHING after that prefix as the name (handles "tell me about أ/ مجدي صبحي")
    const namePrefixPatterns = [
        /[اأ]\s*\/\s*/, // أ/ or ا/
        /MR\s*\.?\s*\/\s*/i, // MR ./ or MR/
        /Mr\.?\s*\/?\s*/, // Mr. or Mr
        /Mrs\.?\s*\/?\s*/, // Mrs
        /السيد\s*\/?\s*/, // السيد/
        /السيدة\s*\/?\s*/, // السيدة/
    ];
    for (const pattern of namePrefixPatterns) {
        const match = cleaned.match(pattern);
        if (match && match.index !== undefined) {
            // Take everything after the prefix
            const afterPrefix = cleaned.substring(match.index + match[0].length).trim();
            if (afterPrefix.length > 1) {
                // Clean remaining stopwords from the extracted name
                return afterPrefix.replace(/\s+/g, ' ').trim();
            }
        }
    }
    const stopWords = [
        // Arabic conversational
        'رصيد', 'أرصدة', 'ارصده', 'ارصدة', 'حساب', 'كشف', 'مديونية', 'مديونيات',
        'العميل', 'عميل', 'العملاء', 'عملاء', 'زبون', 'زبائن',
        'المورد', 'مورد', 'الموردين', 'موردين',
        'حركة', 'حركات', 'معاملات', 'تفاصيل', 'تفصيلي', 'تقرير', 'ملخص', 'فقط',
        'كم', 'ايه', 'إيه', 'عايز', 'اعرف', 'عرفني', 'قولي', 'هات', 'ورني', 'وريني',
        'لو سمحت', 'من فضلك', 'يا', 'بتاع', 'بتاعت',
        'عن', 'ل', 'لل', 'بتاعه', 'ممكن', 'تعرفني', 'اكتر',
        // English conversational
        'can', 'you', 'tell', 'me', 'more', 'about', 'the', 'client', 'customer',
        'supplier', 'balance', 'statement', 'account', 'what', 'is', 'show',
        'give', 'get', 'find', 'search', 'for', 'of', 'a', 'an', 'this', 'that',
        'please', 'i', 'want', 'need', 'know', 'how', 'much', 'info', 'information',
        'details', 'detail', 'data', 'report', 'who', 'which', 'his', 'her',
    ];
    const sorted = [...stopWords].sort((a, b) => b.length - a.length);
    for (const word of sorted) {
        // Use word boundaries for English, and custom boundaries for Arabic to avoid cutting letters inside words
        const isEnglish = /^[a-zA-Z]+$/.test(word);
        if (isEnglish) {
            cleaned = cleaned.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ').trim();
        }
        else {
            cleaned = cleaned.replace(new RegExp(`(^|\\s)${word}(?=\\s|$)`, 'gi'), ' ').trim();
        }
    }
    // Strip standalone "ل" prefix and "ال" 
    cleaned = cleaned.replace(/^\s*ل\s+/, '').trim();
    cleaned = cleaned.replace(/^\s*ال\s+/, '').trim();
    return cleaned.replace(/\s+/g, ' ').trim();
}
// Real-time balance SELECT expression — uses invoices table (journal_lines has NO partnerId column!)
// Matches the logic in partnerController.ts buildInvAggSQL()
const REALTIME_BALANCE_EXPR = `ROUND(
    COALESCE(p.openingBalance, 0) +
    CASE WHEN p.isSupplier = 0 OR p.isCustomer = 1 THEN COALESCE((
        SELECT SUM(CASE
            WHEN i.type = 'INVOICE_SALE' AND COALESCE(i.paymentMethod,'') != 'CASH' AND NOT (COALESCE(i.isPOSSale, 0) = 1 AND COALESCE(i.paymentMethod, '') != 'DEFERRED') THEN i.total
            WHEN i.type = 'RETURN_SALE' AND COALESCE(i.paymentMethod,'') != 'CASH' AND NOT (COALESCE(i.isPOSSale, 0) = 1 AND COALESCE(i.paymentMethod, '') != 'DEFERRED') THEN -(i.total)
            WHEN i.type IN ('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') AND (COALESCE(p.isSupplier, 0) = 0 OR COALESCE(i.voucherCategory,'') NOT IN ('supplier','supplier_refund')) THEN -(i.total)
            WHEN i.type = 'PAYMENT' AND (COALESCE(p.isSupplier, 0) = 0 OR i.voucherCategory IN ('customer','labour')) THEN i.total
            ELSE 0 END)
        FROM invoices i WHERE i.partnerId = p.id AND i.status IN ('POSTED','COMPLETED','PARTIAL')
    ), 0) + COALESCE((
        SELECT SUM(CASE WHEN i.type = 'CHEQUE_BOUNCE' THEN i.total ELSE 0 END)
        FROM invoices i WHERE i.partnerId = p.id AND i.status IN ('POSTED','COMPLETED','PARTIAL')
    ), 0) ELSE 0 END +
    CASE WHEN p.isSupplier = 1 THEN COALESCE((
        SELECT SUM(CASE
            WHEN i.type = 'INVOICE_PURCHASE' AND COALESCE(i.paymentMethod,'') != 'CASH' AND NOT (COALESCE(i.isPOSSale, 0) = 1 AND COALESCE(i.paymentMethod, '') != 'DEFERRED') THEN -(i.total)
            WHEN i.type = 'RETURN_PURCHASE' AND COALESCE(i.paymentMethod,'') != 'CASH' AND NOT (COALESCE(i.isPOSSale, 0) = 1 AND COALESCE(i.paymentMethod, '') != 'DEFERRED') THEN i.total
            WHEN i.type IN ('PAYMENT','DISCOUNT_EARNED','CHEQUE_CASHED') AND (COALESCE(p.isCustomer, 0) = 0 OR COALESCE(i.voucherCategory,'') NOT IN ('customer','labour')) THEN i.total
            WHEN i.type = 'RECEIPT' AND (COALESCE(p.isCustomer, 0) = 0 OR i.voucherCategory IN ('supplier','supplier_refund')) THEN -(i.total)
            ELSE 0 END)
        FROM invoices i WHERE i.partnerId = p.id AND i.status IN ('POSTED','COMPLETED','PARTIAL')
    ), 0) - COALESCE((
        SELECT SUM(CASE WHEN i.type = 'CHEQUE_BOUNCE' THEN i.total ELSE 0 END)
        FROM invoices i WHERE i.partnerId = p.id AND i.status IN ('POSTED','COMPLETED','PARTIAL')
    ), 0) ELSE 0 END
, 2)`;
const JL_AGG_SQL = ``; // Deprecated for partner scans
// Search partners by name with fuzzy matching — returns REAL-TIME balance from invoices
function searchPartners(name, type, originalMessage) {
    return __awaiter(this, void 0, void 0, function* () {
        const tc = type === 'CUSTOMER'
            ? `(p.isCustomer = TRUE OR p.type = 'CUSTOMER' OR p.type = 'BOTH')`
            : `(p.isSupplier = TRUE OR p.type = 'SUPPLIER' OR p.type = 'BOTH')`;
        const selectCols = `p.id, p.name, p.code, ${REALTIME_BALANCE_EXPR} as balance, p.openingBalance, p.creditLimit, p.phone, p.classification, p.isCustomer, p.isSupplier`;
        const fromJoin = `partners p`;
        // Strategy 0: Original message CONTAINS the partner's exact name
        if (originalMessage && originalMessage.trim().length > 3) {
            try {
                const [inverseMatch] = yield db_1.pool.query(`SELECT ${selectCols} FROM ${fromJoin} WHERE ${tc} AND LENGTH(p.name) > 3 AND ? LIKE CONCAT('%', p.name, '%') ORDER BY LENGTH(p.name) DESC LIMIT 1`, [originalMessage]);
                if (inverseMatch.length > 0)
                    return inverseMatch;
            }
            catch (e) { }
        }
        // Strategy 1: Direct LIKE match
        const [direct] = yield db_1.pool.query(`SELECT ${selectCols} FROM ${fromJoin} WHERE ${tc} AND p.name LIKE ? ORDER BY ABS(${REALTIME_BALANCE_EXPR}) DESC LIMIT 10`, [`%${name}%`]);
        if (direct.length > 0)
            return direct;
        // Strategy 2: Each word separately (AND)
        const words = name.split(/\s+/).filter(w => w.length > 1);
        if (words.length > 1) {
            const conds = words.map(() => `p.name LIKE ?`).join(' AND ');
            const params = words.map(w => `%${w}%`);
            const [wordMatch] = yield db_1.pool.query(`SELECT ${selectCols} FROM ${fromJoin} WHERE ${tc} AND (${conds}) ORDER BY ABS(${REALTIME_BALANCE_EXPR}) DESC LIMIT 10`, params);
            if (wordMatch.length > 0)
                return wordMatch;
        }
        // Strategy 3: Fuzzy OR match
        if (words.length > 0) {
            const conds = words.map(() => `p.name LIKE ?`).join(' OR ');
            const params = words.map(w => `%${w}%`);
            const [fuzzyMatch] = yield db_1.pool.query(`SELECT ${selectCols} FROM ${fromJoin} WHERE ${tc} AND (${conds}) ORDER BY ABS(${REALTIME_BALANCE_EXPR}) DESC LIMIT 10`, params);
            if (fuzzyMatch.length > 0)
                return fuzzyMatch;
        }
        // Strategy 4: By code
        if (/^\d+$/.test(name)) {
            const [codeMatch] = yield db_1.pool.query(`SELECT ${selectCols} FROM ${fromJoin} WHERE ${tc} AND p.code LIKE ? LIMIT 10`, [`%${name}%`]);
            if (codeMatch.length > 0)
                return codeMatch;
        }
        // Strategy 5: Search with common prefixes (Arabic and English)
        const prefixed = [`MR ./ ${name}`, `Mr. ${name}`, `السيد/ ${name}`, `أ/ ${name}`, `أ / ${name}`, `ا / ${name}`, `ا/ ${name}`];
        for (const pn of prefixed) {
            const [prefixMatch] = yield db_1.pool.query(`SELECT ${selectCols} FROM ${fromJoin} WHERE ${tc} AND p.name LIKE ? LIMIT 5`, [`%${pn}%`]);
            if (prefixMatch.length > 0)
                return prefixMatch;
        }
        // Strategy 6: Phone number search (user says "العميل 01226254141")
        const phoneMatch = name.match(/01[0-9]{9}/);
        if (phoneMatch) {
            const [phoneResult] = yield db_1.pool.query(`SELECT ${selectCols} FROM ${fromJoin} WHERE ${tc} AND p.phone LIKE ? LIMIT 5`, [`%${phoneMatch[0]}%`]);
            if (phoneResult.length > 0)
                return phoneResult;
        }
        // Strategy 7: FALLBACK — simple query without real-time balance JOIN (in case the complex query has issues)
        try {
            const [simpleFallback] = yield db_1.pool.query(`SELECT id, name, code, balance, openingBalance, creditLimit, phone, classification, isCustomer, isSupplier
             FROM partners WHERE ${tc.replace(/p\./g, '')} AND name LIKE ? ORDER BY ABS(balance) DESC LIMIT 10`, [`%${name}%`]);
            if (simpleFallback.length > 0) {
                console.log(`[AI] searchPartners: real-time query returned 0, but simple fallback found ${simpleFallback.length} results`);
                return simpleFallback;
            }
        }
        catch ( /* ignore fallback errors */_a) { /* ignore fallback errors */ }
        return [];
    });
}
function getCustomerBalanceContext(message, uiContext) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const searchName = extractPartnerName(message);
            console.log(`[AI] extractPartnerName("${message.substring(0, 60)}...") → "${searchName}"`);
            let finalContext = '';
            let matchedPartnerId = undefined;
            if (searchName && searchName.length > 1) {
                const rows = yield searchPartners(searchName, 'CUSTOMER', message);
                console.log(`[AI] searchPartners("${searchName}") → ${rows.length} results`);
                if (rows.length > 0) {
                    matchedPartnerId = rows[0].id;
                    finalContext = `أرصدة العملاء المطابقين للبحث "${searchName}":\n` + compressCustomerData(rows);
                }
                else {
                    const [similar] = yield db_1.pool.query(`
                    SELECT name FROM partners 
                    WHERE (isCustomer=1 OR type='CUSTOMER' OR type='BOTH')
                    AND (name SOUNDS LIKE ? OR name LIKE ?)
                    LIMIT 3
                `, [searchName, `%${searchName.slice(0, 3)}%`]);
                    if (similar.length > 0) {
                        return {
                            text: `لم أجد العميل "${searchName}". هل تقصد:\n${similar.map((r) => `- ${r.name}`).join('\n')}`,
                            suggestions: similar.map((r) => ({ text: `رصيد ${r.name}`, icon: '👤' }))
                        };
                    }
                    return { text: `لم يتم العثور على عميل باسم "${searchName}".` };
                }
            }
            else if (uiContext === null || uiContext === void 0 ? void 0 : uiContext.partnerId) {
                const [rows] = yield db_1.pool.query(`SELECT p.id, p.name, p.code, ${REALTIME_BALANCE_EXPR} as balance, p.creditLimit, p.phone 
                 FROM partners p 
                 WHERE p.id = ?`, [uiContext.partnerId]);
                if (rows.length > 0) {
                    matchedPartnerId = rows[0].id;
                    finalContext = compressCustomerData(rows);
                }
            }
            else {
                // No specific name — return top debtors with REAL-TIME balances
                const [topDebtors] = yield db_1.pool.query(`SELECT p.name, p.code, ${REALTIME_BALANCE_EXPR} as balance, p.creditLimit 
                 FROM partners p 
                 WHERE (p.isCustomer = TRUE OR p.type = 'CUSTOMER' OR p.type = 'BOTH')
                 HAVING balance != 0
                 ORDER BY balance DESC LIMIT 15`);
                const [stats] = yield db_1.pool.query(`SELECT COUNT(*) as count, 
                        SUM(CASE WHEN bal > 0 THEN bal ELSE 0 END) as totalDebit,
                        SUM(CASE WHEN bal < 0 THEN ABS(bal) ELSE 0 END) as totalCredit
                 FROM (
                    SELECT ${REALTIME_BALANCE_EXPR} as bal
                    FROM partners p 
                    WHERE (p.isCustomer = TRUE OR p.type = 'CUSTOMER' OR p.type = 'BOTH')
                 ) x`);
                const s = stats[0];
                finalContext = `إحصائيات العملاء:\n- إجمالي العملاء: ${s.count}\n- إجمالي المديونيات (لنا): ${Number(s.totalDebit || 0).toLocaleString('ar-EG')} جنيه\n- إجمالي الزيادات (علينا): ${Number(s.totalCredit || 0).toLocaleString('ar-EG')} جنيه\n\nأعلى 15 عميل بالرصيد:\n` +
                    topDebtors.map((r) => `- ${r.name}: ${Number(r.balance).toLocaleString('ar-EG')} جنيه`).join('\n');
            }
            if (matchedPartnerId) {
                finalContext += yield enrichCustomerContext(matchedPartnerId);
            }
            finalContext += yield runAutodiagnosis('customer_balance', {});
            return { text: finalContext, partnerId: matchedPartnerId };
        }
        catch (e) {
            return { text: `خطأ في جلب بيانات العملاء: ${e.message}` };
        }
    });
}
function getSupplierBalanceContext(message, uiContext) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const searchName = extractPartnerName(message);
            if (searchName && searchName.length > 1) {
                const rows = yield searchPartners(searchName, 'SUPPLIER', message);
                if (rows.length > 0) {
                    return {
                        text: `أرصدة الموردين المطابقين:\n` +
                            rows.map((r) => `- ${r.name} (كود: ${r.code || 'N/A'}): الرصيد ${Number(r.balance).toLocaleString('ar-EG')} جنيه | هاتف: ${r.phone || 'غير محدد'}`).join('\n'),
                        partnerId: rows[0].id
                    };
                }
                const [similar] = yield db_1.pool.query(`
                SELECT name FROM partners 
                WHERE (isSupplier=1 OR type='SUPPLIER' OR type='BOTH')
                AND (name SOUNDS LIKE ? OR name LIKE ?)
                LIMIT 3
            `, [searchName, `%${searchName.slice(0, 3)}%`]);
                if (similar.length > 0) {
                    return {
                        text: `لم أجد المورد "${searchName}". هل تقصد:\n${similar.map((r) => `- ${r.name}`).join('\n')}`,
                        suggestions: similar.map((r) => ({ text: `رصيد المورد ${r.name}`, icon: '👤' }))
                    };
                }
                return { text: `لم يتم العثور على مورد باسم "${searchName}".` };
            }
            if (uiContext === null || uiContext === void 0 ? void 0 : uiContext.partnerId) {
                const [rows] = yield db_1.pool.query(`SELECT p.id, p.name, p.code, ${REALTIME_BALANCE_EXPR} as balance, p.phone 
                 FROM partners p 
                 WHERE p.id = ?`, [uiContext.partnerId]);
                if (rows.length > 0) {
                    const r = rows[0];
                    return {
                        text: `رصيد المورد ${r.name} (كود: ${r.code || 'N/A'}): ${Number(r.balance).toLocaleString('ar-EG')} جنيه | هاتف: ${r.phone || 'غير محدد'}`,
                        partnerId: r.id
                    };
                }
            }
            const [topSuppliers] = yield db_1.pool.query(`SELECT p.name, p.code, ${REALTIME_BALANCE_EXPR} as balance 
             FROM partners p 
             WHERE (p.isSupplier = TRUE OR p.type = 'SUPPLIER' OR p.type = 'BOTH')
             HAVING balance != 0
             ORDER BY ABS(balance) DESC LIMIT 15`);
            const [stats] = yield db_1.pool.query(`SELECT COUNT(*) as count, 
                    SUM(CASE WHEN bal < 0 THEN ABS(bal) ELSE 0 END) as totalOwed,
                    SUM(CASE WHEN bal > 0 THEN bal ELSE 0 END) as totalPrepaid
             FROM (
                 SELECT ${REALTIME_BALANCE_EXPR} as bal
                 FROM partners p 
                 WHERE (p.isSupplier = TRUE OR p.type = 'SUPPLIER' OR p.type = 'BOTH')
             ) x`);
            const s = stats[0];
            return { text: `إحصائيات الموردين:\n- إجمالي الموردين: ${s.count}\n- إجمالي المستحق للموردين: ${Number(s.totalOwed || 0).toLocaleString('ar-EG')} جنيه\n- إجمالي المقدم للموردين: ${Number(s.totalPrepaid || 0).toLocaleString('ar-EG')} جنيه\n\nأعلى 15 مورد بالرصيد:\n` +
                    topSuppliers.map((r) => `- ${r.name}: ${Number(r.balance).toLocaleString('ar-EG')} جنيه`).join('\n') };
        }
        catch (e) {
            return { text: `خطأ في جلب بيانات الموردين: ${e.message}` };
        }
    });
}
function parsePeriodFromMessage(message) {
    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();
    const monthNames = {
        'يناير': 1, 'فبراير': 2, 'مارس': 3, 'ابريل': 4, 'أبريل': 4, 'مايو': 5, 'يونيو': 6,
        'يوليو': 7, 'اغسطس': 8, 'أغسطس': 8, 'سبتمبر': 9, 'اكتوبر': 10, 'أكتوبر': 10,
        'نوفمبر': 11, 'ديسمبر': 12,
        'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
        'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
    };
    let targetMonth = null;
    const monthNumMatch = message.match(/شهر\s*(\d{1,2})/i) || message.match(/month\s*(\d{1,2})/i);
    if (monthNumMatch)
        targetMonth = parseInt(monthNumMatch[1]);
    if (!targetMonth) {
        for (const [name, num] of Object.entries(monthNames)) {
            if (message.toLowerCase().includes(name)) {
                targetMonth = num;
                break;
            }
        }
    }
    let periodStart;
    let periodEnd;
    let periodLabel;
    if (targetMonth && targetMonth >= 1 && targetMonth <= 12) {
        periodStart = `${currentYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(currentYear, targetMonth, 0).getDate();
        periodEnd = `${currentYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;
        periodLabel = `شهر ${targetMonth} (${currentYear})`;
    }
    else {
        periodStart = today.substring(0, 7) + '-01';
        periodEnd = today;
        periodLabel = 'هذا الشهر';
    }
    return { periodStart, periodEnd, periodLabel, targetMonth };
}
function getSalesContext(message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const today = new Date().toISOString().split('T')[0];
            const currentYear = new Date().getFullYear();
            const { periodStart, periodEnd, periodLabel, targetMonth } = parsePeriodFromMessage(message);
            let paymentMethodFilter = '';
            let paymentLabelSuffix = '';
            if (message.includes('نقدي') || message.includes('كاش')) {
                paymentMethodFilter = " AND paymentMethod = 'CASH'";
                paymentLabelSuffix = ' (النقدي)';
            }
            else if (message.includes('اجل') || message.includes('أجل')) {
                paymentMethodFilter = " AND paymentMethod = 'CREDIT'";
                paymentLabelSuffix = ' (الآجل)';
            }
            const [todaySales] = yield db_1.pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM invoices 
             WHERE type IN ('SALE','INVOICE_SALE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND DATE(date) = ? ${paymentMethodFilter}`, [today]);
            const [periodSales] = yield db_1.pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM invoices 
             WHERE type IN ('SALE','INVOICE_SALE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND date >= ? AND date <= ? ${paymentMethodFilter}`, [periodStart, periodEnd]);
            const [topProducts] = yield db_1.pool.query(`SELECT p.name, SUM(il.quantity) as qty, SUM(il.total) as revenue
             FROM invoice_lines il JOIN invoices i ON il.invoiceId = i.id JOIN products p ON il.productId = p.id
             WHERE i.type IN ('SALE','INVOICE_SALE') AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND i.date >= ? AND i.date <= ? ${paymentMethodFilter}
             GROUP BY il.productId ORDER BY revenue DESC LIMIT 10`, [periodStart, periodEnd]);
            const [topCustomers] = yield db_1.pool.query(`SELECT partnerName, COUNT(*) as invoiceCount, SUM(total) as total FROM invoices 
             WHERE type IN ('SALE','INVOICE_SALE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND date >= ? AND date <= ? ${paymentMethodFilter}
             GROUP BY partnerId ORDER BY total DESC LIMIT 10`, [periodStart, periodEnd]);
            // Check for last month too
            const lastMonthDate = new Date();
            lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
            const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
            const lastMonthEnd = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-${new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 0).getDate()}`;
            const [lastMonthSales] = yield db_1.pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM invoices 
             WHERE type IN ('SALE','INVOICE_SALE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND date >= ? AND date <= ? ${paymentMethodFilter}`, [lastMonthStart, lastMonthEnd]);
            const ts = todaySales[0];
            const ps = periodSales[0];
            const lm = lastMonthSales[0];
            // ── PRE-COMPUTED INTELLIGENCE ──
            const periodTotal = Number(ps.total) || 0;
            const lastMonthTotal = Number(lm.total) || 0;
            const growthRate = lastMonthTotal > 0 ? ((periodTotal - lastMonthTotal) / lastMonthTotal * 100).toFixed(1) : 'N/A';
            const growthEmoji = Number(growthRate) > 0 ? '📈' : Number(growthRate) < 0 ? '📉' : '➡️';
            // Daily average
            const daysInPeriod = targetMonth
                ? new Date(currentYear, targetMonth, 0).getDate()
                : new Date().getDate(); // days elapsed this month
            const dailyAvg = daysInPeriod > 0 ? Math.round(periodTotal / daysInPeriod) : 0;
            // Top customer concentration
            const topCust = topCustomers[0];
            const topCustPct = topCust && periodTotal > 0 ? ((Number(topCust.total) / periodTotal) * 100).toFixed(1) : '0';
            const concentrationRisk = Number(topCustPct) > 30;
            // Payment method breakdown (if no filter)
            let paymentBreakdown = '';
            if (!paymentMethodFilter) {
                try {
                    const [payBreak] = yield db_1.pool.query(`SELECT paymentMethod, COUNT(*) as cnt, COALESCE(SUM(total), 0) as total FROM invoices 
                     WHERE type IN ('SALE','INVOICE_SALE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND date >= ? AND date <= ?
                     GROUP BY paymentMethod`, [periodStart, periodEnd]);
                    const methods = payBreak;
                    if (methods.length > 0) {
                        paymentBreakdown = `\n💳 توزيع طرق الدفع (${periodLabel}):\n` +
                            methods.map((m) => {
                                const label = m.paymentMethod === 'CASH' ? 'نقدي' : m.paymentMethod === 'CREDIT' ? 'آجل' : (m.paymentMethod || 'غير محدد');
                                const pct = periodTotal > 0 ? ((Number(m.total) / periodTotal) * 100).toFixed(0) : '0';
                                return `- ${label}: ${Number(m.total).toLocaleString('ar-EG')} جنيه (${pct}%) — ${m.cnt} فاتورة`;
                            }).join('\n');
                    }
                }
                catch ( /* ignore */_a) { /* ignore */ }
            }
            let result = `📊 تقرير المبيعات${paymentLabelSuffix}:\n`;
            result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            result += `📅 اليوم (${today}): ${ts.count} فاتورة بإجمالي ${Number(ts.total).toLocaleString('ar-EG')} جنيه\n`;
            result += `📆 ${periodLabel}: ${ps.count} فاتورة بإجمالي ${Number(ps.total).toLocaleString('ar-EG')} جنيه\n`;
            result += `📆 الشهر السابق: ${lm.count} فاتورة بإجمالي ${Number(lm.total).toLocaleString('ar-EG')} جنيه\n`;
            result += `${growthEmoji} نسبة النمو: ${growthRate}%\n`;
            result += `📊 متوسط المبيعات اليومي: ${dailyAvg.toLocaleString('ar-EG')} جنيه\n`;
            result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            result += `🏆 أعلى 10 منتجات مبيعاً (${periodLabel}):\n`;
            result += topProducts.length > 0
                ? topProducts.map((r, i) => `${i + 1}. ${r.name}: ${Number(r.qty)} وحدة — ${Number(r.revenue).toLocaleString('ar-EG')} جنيه`).join('\n')
                : '(لا توجد مبيعات في هذه الفترة)';
            result += `\n\n👥 أعلى 10 عملاء شراءً (${periodLabel}):\n`;
            result += topCustomers.length > 0
                ? topCustomers.map((r, i) => {
                    const pct = periodTotal > 0 ? ((Number(r.total) / periodTotal) * 100).toFixed(1) : '0';
                    return `${i + 1}. ${r.partnerName}: ${r.invoiceCount} فاتورة — ${Number(r.total).toLocaleString('ar-EG')} جنيه (${pct}%)`;
                }).join('\n')
                : '(لا توجد مبيعات في هذه الفترة)';
            if (concentrationRisk && topCust) {
                result += `\n\n⚠️ تنبيه تركز: العميل "${topCust.partnerName}" يمثل ${topCustPct}% من إجمالي المبيعات — خطر تركز عالي`;
            }
            result += paymentBreakdown;
            result += yield forecastNextMonth();
            result += yield runAutodiagnosis('sales_report', {});
            const narrative = buildSalesNarrative({
                todayTotal: Number(ts.total),
                periodTotal: periodTotal,
                lastMonthTotal: lastMonthTotal,
                topCustomer: topCust,
                dailyAvg: dailyAvg,
                topProducts: topProducts
            });
            if (narrative) {
                result = `💡 **ملخص ذكي ومباشر:**\n${narrative}\n\n` + result;
            }
            return result;
        }
        catch (e) {
            return `خطأ في جلب بيانات المبيعات: ${e.message}`;
        }
    });
}
function buildSalesNarrative(data) {
    var _a;
    const growth = data.lastMonthTotal > 0
        ? ((data.periodTotal - data.lastMonthTotal) / data.lastMonthTotal * 100).toFixed(1)
        : null;
    const growthText = growth
        ? Number(growth) > 0
            ? `📈 نمو ${growth}% عن الشهر الماضي`
            : `📉 تراجع ${Math.abs(Number(growth))}% عن الشهر الماضي — يستحق التحقيق`
        : '';
    const concentration = data.topCustomer && data.periodTotal > 0
        ? (Number(data.topCustomer.total) / data.periodTotal * 100).toFixed(0)
        : 0;
    const riskWarning = Number(concentration) > 40
        ? `⚠️ تركز مبيعات خطير: ${(_a = data.topCustomer) === null || _a === void 0 ? void 0 : _a.partnerName} يمثل ${concentration}% من المبيعات`
        : '';
    const daysElapsed = new Date().getDate();
    const projectedMonth = daysElapsed > 5
        ? Math.round(data.dailyAvg * new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate())
        : null;
    return [
        growthText,
        riskWarning,
        projectedMonth ? `🔮 توقع نهاية الشهر: ${projectedMonth.toLocaleString('ar-EG')} جنيه` : '',
        data.topProducts.length > 0 ? `🏆 الأكثر مبيعاً: ${data.topProducts[0].name}` : '',
    ].filter(Boolean).join('\n');
}
function getInventoryContext(message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [stats] = yield db_1.pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END) as outOfStock,
                    SUM(CASE WHEN stock > 0 AND stock <= minStock AND minStock > 0 THEN 1 ELSE 0 END) as lowStock
             FROM products WHERE isActive = TRUE`);
            const [lowStockItems] = yield db_1.pool.query(`SELECT name, stock, minStock, unit FROM products 
             WHERE isActive = TRUE AND stock > 0 AND stock <= minStock AND minStock > 0
             ORDER BY (stock * 1.0 / minStock) ASC LIMIT 15`);
            const [outOfStockItems] = yield db_1.pool.query(`SELECT name, unit FROM products WHERE isActive = TRUE AND stock <= 0 AND minStock > 0 LIMIT 10`);
            const [inventoryValue, deadStockValue, coverageDays] = yield Promise.all([
                db_1.pool.query(`
            SELECT COALESCE(SUM(stock * cost), 0) as totalValue,
                   COALESCE(SUM(stock * price), 0) as retailValue
            FROM products WHERE isActive = TRUE AND stock > 0
          `),
                db_1.pool.query(`
            SELECT COUNT(*) as cnt, COALESCE(SUM(p.stock * p.cost), 0) as value
            FROM products p
            WHERE p.isActive = TRUE AND p.stock > 0
            AND NOT EXISTS (
              SELECT 1 FROM invoice_lines il
              JOIN invoices i ON il.invoiceId = i.id
              WHERE il.productId = p.id
              AND i.type IN ('SALE','INVOICE_SALE')
              AND i.date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
            )
          `),
                db_1.pool.query(`
            SELECT p.name, p.stock, p.unit,
              COALESCE(
                (SELECT SUM(il2.quantity)/30
                FROM invoice_lines il2 JOIN invoices i2 ON il2.invoiceId=i2.id
                WHERE il2.productId=p.id AND i2.type IN ('SALE','INVOICE_SALE')
                AND i2.date >= DATE_SUB(NOW(), INTERVAL 30 DAY))
              , 0) as dailySales
            FROM products p WHERE p.isActive=TRUE AND p.stock > 0
            HAVING dailySales > 0 AND (p.stock / dailySales) < 30
            ORDER BY (p.stock / dailySales) ASC LIMIT 5
          `),
            ]);
            const iv = inventoryValue[0];
            const ds = deadStockValue[0];
            let extra = `
💰 قيمة المخزون الإجمالية: ${Number(iv.totalValue).toLocaleString('ar-EG')} جنيه (تكلفة)
🏷️ قيمة البيع: ${Number(iv.retailValue).toLocaleString('ar-EG')} جنيه
🪦 مخزون راكد (+90 يوم): ${ds.cnt} صنف — ${Number(ds.value).toLocaleString('ar-EG')} جنيه مجمدة
`;
            const cd = coverageDays;
            if (cd.length > 0) {
                extra += `\n⚡ أصناف ستنتهي خلال 30 يوم:\n`;
                extra += cd.map((r) => `- ${r.name}: متبقي ${r.stock} ${r.unit} — يكفي ${Math.floor(r.stock / r.dailySales)} يوم`).join('\n');
            }
            const s = stats[0];
            return `حالة المخزون:\n- إجمالي الأصناف النشطة: ${s.total}\n- أصناف نفدت: ${s.outOfStock}\n- أصناف تحت الحد الأدنى: ${s.lowStock}\n` +
                extra +
                `\n⚠️ أصناف تحت الحد الأدنى:\n` +
                lowStockItems.map((r) => `- ${r.name}: ${r.stock} ${r.unit || 'وحدة'} (الحد الأدنى: ${r.minStock})`).join('\n') +
                (outOfStockItems.length > 0 ? `\n\n🔴 أصناف نفدت:\n` +
                    outOfStockItems.map((r) => `- ${r.name}`).join('\n') : '');
        }
        catch (e) {
            return `خطأ في جلب بيانات المخزون: ${e.message}`;
        }
    });
}
function getTreasuryContext() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [cashAccounts] = yield db_1.pool.query(`SELECT a.code, a.name, COALESCE(a.openingBalance, 0) + COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) as balance 
             FROM accounts a
             LEFT JOIN journal_lines jl ON a.id = jl.accountId
             LEFT JOIN journal_entries je ON jl.journalId = je.id
             WHERE a.type = 'ASSET' AND (a.code LIKE '101%' OR a.code LIKE '102%' OR a.name LIKE '%صندوق%' OR a.name LIKE '%بنك%' OR a.name LIKE '%خزينة%')
             GROUP BY a.id, a.code, a.name, a.openingBalance
             ORDER BY a.code LIMIT 20`);
            const [todayCheques] = yield db_1.pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM cheques WHERE status = 'PENDING' AND dueDate <= CURDATE()`);
            return `حالة الخزينة:\n💰 أرصدة الحسابات النقدية والبنكية:\n` +
                cashAccounts.map((r) => `- ${r.code} ${r.name}: ${Number(r.balance).toLocaleString('ar-EG')} جنيه`).join('\n') +
                `\n\n📋 شيكات مستحقة اليوم: ${todayCheques[0].count} شيك بإجمالي ${Number(todayCheques[0].total).toLocaleString('ar-EG')} جنيه`;
        }
        catch (e) {
            return `خطأ في جلب بيانات الخزينة: ${e.message}`;
        }
    });
}
function getProductionContext() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [orders] = yield db_1.pool.query(`SELECT status, COUNT(*) as count FROM production_orders GROUP BY status`);
            return `أوامر الإنتاج:\n` + orders.map((r) => `- ${r.status}: ${r.count} أمر`).join('\n');
        }
        catch (e) {
            return `لا توجد بيانات إنتاج متوفرة حالياً.`;
        }
    });
}
function getHRContext() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [empStats] = yield db_1.pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active FROM employees`);
            const s = empStats[0];
            return `الموارد البشرية:\n- إجمالي الموظفين: ${(s === null || s === void 0 ? void 0 : s.total) || 0}\n- نشط: ${(s === null || s === void 0 ? void 0 : s.active) || 0}`;
        }
        catch (_a) {
            return `لا توجد بيانات موظفين متوفرة حالياً.`;
        }
    });
}
function getInvoiceLookupContext(message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const numMatch = message.match(/(?:فاتورة\s*(?:رقم)?|INV-)\s*(\d+)/i);
            if (numMatch) {
                const num = numMatch[1];
                const [rows] = yield db_1.pool.query(`SELECT id, number, type, partnerName, total, status, date, paymentMethod, notes 
                 FROM invoices WHERE number LIKE ? OR number LIKE ? LIMIT 5`, [`%${num}%`, `INV-${num.padStart(5, '0')}`]);
                if (rows.length > 0) {
                    return `نتائج البحث عن فاتورة "${num}":\n` +
                        rows.map((r) => `- ${r.number} | ${['SALE', 'INVOICE_SALE'].includes(r.type) ? 'مبيعات' : ['PURCHASE', 'INVOICE_PURCHASE'].includes(r.type) ? 'مشتريات' : r.type} | ${r.partnerName || 'غير محدد'} | ${Number(r.total).toLocaleString('ar-EG')} جنيه | ${r.status} | ${new Date(r.date).toLocaleDateString('ar-EG')}`).join('\n');
                }
            }
            return 'لم يتم العثور على فاتورة بهذا الرقم.';
        }
        catch (e) {
            return `خطأ: ${e.message}`;
        }
    });
}
// ── NEW CONTEXT FETCHERS ─────────────────────────────────
function getCustomerStatementContext(message, uiContext) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const searchName = extractPartnerName(message);
            let p;
            if (!searchName || searchName.length < 2) {
                if (uiContext === null || uiContext === void 0 ? void 0 : uiContext.partnerId) {
                    const [rows] = yield db_1.pool.query(`SELECT id, name, phone FROM partners WHERE id = ?`, [uiContext.partnerId]);
                    if (rows.length > 0)
                        p = rows[0];
                }
                if (!p)
                    return getCustomerBalanceContext(message, uiContext);
            }
            else {
                const rows = yield searchPartners(searchName, 'CUSTOMER', message);
                if (rows.length === 0) {
                    const [similar] = yield db_1.pool.query(`
                    SELECT name FROM partners 
                    WHERE (isCustomer=1 OR type='CUSTOMER' OR type='BOTH')
                    AND (name SOUNDS LIKE ? OR name LIKE ?)
                    LIMIT 3
                `, [searchName, `%${searchName.slice(0, 3)}%`]);
                    if (similar.length > 0) {
                        return {
                            text: `لم يتم العثور على عميل باسم "${searchName}". هل تقصد:\n${similar.map((r) => `- ${r.name}`).join('\n')}`,
                            suggestions: similar.map((r) => ({ text: `رصيد ${r.name}`, icon: '👤' }))
                        };
                    }
                    return { text: `لم يتم العثور على عميل باسم "${searchName}". تأكد من الاسم وحاول مرة أخرى.` };
                }
                p = rows[0];
            }
            // Extract date range from message if present
            const dateMatch = message.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
            const startDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}` : '2020-01-01';
            const endDate = new Date().toISOString().split('T')[0];
            // Get statement lines from invoices (journal_lines has no partnerId!)
            const [invoiceLines] = yield db_1.pool.query(`SELECT i.date, i.invoiceNumber as reference, i.type, i.total, i.paymentMethod, i.voucherCategory,
                CASE 
                    WHEN i.type IN ('INVOICE_SALE','CHEQUE_BOUNCE') THEN i.total
                    WHEN i.type = 'PAYMENT' AND i.voucherCategory = 'customer' THEN i.total
                    WHEN i.type = 'RETURN_PURCHASE' AND COALESCE(i.paymentMethod,'') != 'CASH' THEN i.total
                    ELSE 0 END as debit,
                CASE 
                    WHEN i.type IN ('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') THEN i.total
                    WHEN i.type = 'RETURN_SALE' AND COALESCE(i.paymentMethod,'') != 'CASH' THEN i.total
                    ELSE 0 END as credit,
                CONCAT(
                    CASE i.type
                        WHEN 'INVOICE_SALE' THEN 'فاتورة بيع'
                        WHEN 'RETURN_SALE' THEN 'مرتجع بيع'
                        WHEN 'RECEIPT' THEN 'سند قبض'
                        WHEN 'PAYMENT' THEN 'سند صرف'
                        WHEN 'DISCOUNT_ALLOWED' THEN 'خصم مسموح'
                        WHEN 'CHEQUE_DEPOSIT' THEN 'إيداع شيك'
                        WHEN 'CHEQUE_BOUNCE' THEN 'شيك مرتد'
                        ELSE i.type END,
                    ' - ', COALESCE(i.invoiceNumber, '')
                ) as description
             FROM invoices i
             WHERE i.partnerId = ? AND i.date >= ? AND i.date <= ? AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
                AND COALESCE(i.paymentMethod, '') != 'CASH'
             ORDER BY i.date ASC, i.createdAt ASC
             LIMIT 150`, [p.id, startDate, endDate]);
            // Get opening balance before the period (sum of all prior transactions)
            const [obRows] = yield db_1.pool.query(`SELECT COALESCE(SUM(CASE 
                WHEN i.type IN ('INVOICE_SALE','CHEQUE_BOUNCE') THEN i.total
                WHEN i.type = 'PAYMENT' AND i.voucherCategory = 'customer' THEN i.total
                WHEN i.type = 'RETURN_PURCHASE' AND COALESCE(i.paymentMethod,'') != 'CASH' THEN i.total
                ELSE 0 END), 0) -
             COALESCE(SUM(CASE 
                WHEN i.type IN ('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') THEN i.total
                WHEN i.type = 'RETURN_SALE' AND COALESCE(i.paymentMethod,'') != 'CASH' THEN i.total
                ELSE 0 END), 0) as openingBalance
             FROM invoices i 
             WHERE i.partnerId = ? AND i.date < ? AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
                AND COALESCE(i.paymentMethod, '') != 'CASH'`, [p.id, startDate]);
            const openingBalance = Number(((_a = obRows[0]) === null || _a === void 0 ? void 0 : _a.openingBalance) || 0) + Number(p.openingBalance || 0);
            // Get totals
            const [totals] = yield db_1.pool.query(`SELECT 
                COALESCE(SUM(CASE 
                    WHEN i.type IN ('INVOICE_SALE','CHEQUE_BOUNCE') THEN i.total
                    WHEN i.type = 'PAYMENT' AND i.voucherCategory = 'customer' THEN i.total
                    ELSE 0 END), 0) as totalDebit,
                COALESCE(SUM(CASE 
                    WHEN i.type IN ('RECEIPT','DISCOUNT_ALLOWED','CHEQUE_DEPOSIT','CHEQUE_COLLECT') THEN i.total
                    WHEN i.type = 'RETURN_SALE' AND COALESCE(i.paymentMethod,'') != 'CASH' THEN i.total
                    ELSE 0 END), 0) as totalCredit
             FROM invoices i 
             WHERE i.partnerId = ? AND i.date >= ? AND i.date <= ? AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
                AND COALESCE(i.paymentMethod, '') != 'CASH'`, [p.id, startDate, endDate]);
            const t = totals[0];
            const closingBalance = openingBalance + Number(t.totalDebit) - Number(t.totalCredit);
            let result = `📋 كشف حساب العميل: ${p.name}\n`;
            result += `📞 هاتف: ${p.phone || 'غير محدد'}\n`;
            result += `📅 الفترة: من ${startDate} إلى ${endDate}\n`;
            result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            result += `💰 رصيد ما قبل الفترة: ${openingBalance.toLocaleString('ar-EG')} جنيه\n`;
            result += `📊 إجمالي مدين: ${Number(t.totalDebit).toLocaleString('ar-EG')} جنيه\n`;
            result += `📊 إجمالي دائن: ${Number(t.totalCredit).toLocaleString('ar-EG')} جنيه\n`;
            result += `💰 الرصيد الختامي: ${closingBalance.toLocaleString('ar-EG')} جنيه\n`;
            result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            if (invoiceLines.length === 0) {
                result += `(لا توجد حركات خلال هذه الفترة)`;
            }
            else {
                result += `📄 تفاصيل الحركات (${invoiceLines.length} حركة):\n`;
                result += `التاريخ | الوصف | مدين | دائن | الرصيد\n`;
                let runningBalance = openingBalance;
                for (const line of invoiceLines) {
                    const debit = Number(line.debit || 0);
                    const credit = Number(line.credit || 0);
                    runningBalance = Math.round((runningBalance + debit - credit) * 100) / 100;
                    const dateStr = new Date(line.date).toLocaleDateString('ar-EG');
                    const desc = (line.description || line.reference || 'حركة').substring(0, 40);
                    result += `${dateStr} | ${desc} | ${debit > 0 ? debit.toLocaleString('ar-EG') : '-'} | ${credit > 0 ? credit.toLocaleString('ar-EG') : '-'} | ${runningBalance.toLocaleString('ar-EG')}\n`;
                }
                if (invoiceLines.length === 150) {
                    result += `\n⚠️ تنبيه: تم عرض أول 150 حركة فقط.`;
                }
            }
            return { text: result, partnerId: p.id };
        }
        catch (e) {
            return { text: `خطأ: ${e.message}` };
        }
    });
}
function getSupplierStatementContext(message, uiContext) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const searchName = (uiContext === null || uiContext === void 0 ? void 0 : uiContext.llmTargetName) || extractPartnerName(message);
            let p;
            if (!searchName || searchName.length < 2) {
                if (uiContext === null || uiContext === void 0 ? void 0 : uiContext.partnerId) {
                    const [rows] = yield db_1.pool.query(`SELECT id, name, phone FROM partners WHERE id = ?`, [uiContext.partnerId]);
                    if (rows.length > 0)
                        p = rows[0];
                }
                if (!p)
                    return getSupplierBalanceContext(message, uiContext);
            }
            else {
                const rows = yield searchPartners(searchName, 'SUPPLIER', message);
                if (rows.length === 0) {
                    const [similar] = yield db_1.pool.query(`
                    SELECT name FROM partners 
                    WHERE (isSupplier=1 OR type='SUPPLIER' OR type='BOTH')
                    AND (name SOUNDS LIKE ? OR name LIKE ?)
                    LIMIT 3
                `, [searchName, `%${searchName.slice(0, 3)}%`]);
                    if (similar.length > 0) {
                        return {
                            text: `لم يتم العثور على مورد باسم "${searchName}". هل تقصد:\n${similar.map((r) => `- ${r.name}`).join('\n')}`,
                            suggestions: similar.map((r) => ({ text: `كشف حساب المورد ${r.name}`, icon: '📄' }))
                        };
                    }
                    return { text: `لم يتم العثور على مورد باسم "${searchName}". تأكد من الاسم وحاول مرة أخرى.` };
                }
                p = rows[0];
            }
            const dateMatch = message.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
            const startDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}` : '2020-01-01';
            const endDate = new Date().toISOString().split('T')[0];
            const [invoiceLines] = yield db_1.pool.query(`SELECT i.date, i.invoiceNumber as reference, i.type, i.total, i.paymentMethod, i.voucherCategory,
                CASE 
                    WHEN i.type IN ('INVOICE_PURCHASE') AND COALESCE(i.paymentMethod,'') != 'CASH' THEN i.total
                    WHEN i.type = 'RECEIPT' AND i.voucherCategory = 'supplier' THEN i.total
                    ELSE 0 END as debit,
                CASE 
                    WHEN i.type IN ('PAYMENT','DISCOUNT_EARNED','CHEQUE_CASHED') AND COALESCE(i.voucherCategory,'') != 'customer' THEN i.total
                    WHEN i.type = 'RETURN_PURCHASE' AND COALESCE(i.paymentMethod,'') != 'CASH' THEN i.total
                    ELSE 0 END as credit,
                CONCAT(
                    CASE i.type
                        WHEN 'INVOICE_PURCHASE' THEN 'فاتورة شراء'
                        WHEN 'RETURN_PURCHASE' THEN 'مرتجع شراء'
                        WHEN 'PAYMENT' THEN 'سند صرف'
                        WHEN 'RECEIPT' THEN 'سند قبض'
                        WHEN 'DISCOUNT_EARNED' THEN 'خصم مكتسب'
                        ELSE i.type END,
                    ' - ', COALESCE(i.invoiceNumber, '')
                ) as description
             FROM invoices i
             WHERE i.partnerId = ? AND i.date >= ? AND i.date <= ? AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
                AND COALESCE(i.paymentMethod, '') != 'CASH'
             ORDER BY i.date ASC, i.createdAt ASC LIMIT 150`, [p.id, startDate, endDate]);
            const [obRows] = yield db_1.pool.query(`SELECT COALESCE(SUM(CASE 
                WHEN i.type IN ('INVOICE_PURCHASE') AND COALESCE(i.paymentMethod,'') != 'CASH' THEN i.total
                WHEN i.type = 'RECEIPT' AND i.voucherCategory = 'supplier' THEN i.total
                ELSE 0 END), 0) -
             COALESCE(SUM(CASE 
                WHEN i.type IN ('PAYMENT','DISCOUNT_EARNED','CHEQUE_CASHED') AND COALESCE(i.voucherCategory,'') != 'customer' THEN i.total
                WHEN i.type = 'RETURN_PURCHASE' AND COALESCE(i.paymentMethod,'') != 'CASH' THEN i.total
                ELSE 0 END), 0) as ob
             FROM invoices i 
             WHERE i.partnerId = ? AND i.date < ? AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
                AND COALESCE(i.paymentMethod, '') != 'CASH'`, [p.id, startDate]);
            const ob = Number(((_a = obRows[0]) === null || _a === void 0 ? void 0 : _a.ob) || 0) + Number(p.openingBalance || 0);
            const [totals] = yield db_1.pool.query(`SELECT 
                COALESCE(SUM(CASE 
                    WHEN i.type IN ('INVOICE_PURCHASE') AND COALESCE(i.paymentMethod,'') != 'CASH' THEN i.total
                    WHEN i.type = 'RECEIPT' AND i.voucherCategory = 'supplier' THEN i.total
                    ELSE 0 END), 0) as td,
                COALESCE(SUM(CASE 
                    WHEN i.type IN ('PAYMENT','DISCOUNT_EARNED','CHEQUE_CASHED') AND COALESCE(i.voucherCategory,'') != 'customer' THEN i.total
                    WHEN i.type = 'RETURN_PURCHASE' AND COALESCE(i.paymentMethod,'') != 'CASH' THEN i.total
                    ELSE 0 END), 0) as tc
             FROM invoices i 
             WHERE i.partnerId = ? AND i.date >= ? AND i.date <= ? AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL')
                AND COALESCE(i.paymentMethod, '') != 'CASH'`, [p.id, startDate, endDate]);
            const t = totals[0];
            const closing = ob + Number(t.td) - Number(t.tc);
            let result = `📋 كشف حساب المورد: ${p.name}\n📞 هاتف: ${p.phone || 'غير محدد'}\n`;
            result += `📅 الفترة: من ${startDate} إلى ${endDate}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            result += `💰 رصيد ما قبل الفترة: ${ob.toLocaleString('ar-EG')} جنيه\n`;
            result += `📊 إجمالي مدين: ${Number(t.td).toLocaleString('ar-EG')} | دائن: ${Number(t.tc).toLocaleString('ar-EG')}\n`;
            result += `💰 الرصيد الختامي: ${closing.toLocaleString('ar-EG')} جنيه\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            if (invoiceLines.length === 0) {
                result += `(لا توجد حركات خلال هذه الفترة)`;
            }
            else {
                result += `📄 تفاصيل الحركات (${invoiceLines.length} حركة):\nالتاريخ | الوصف | مدين | دائن | الرصيد\n`;
                let rb = ob;
                for (const line of invoiceLines) {
                    const d = Number(line.debit || 0), c = Number(line.credit || 0);
                    rb = Math.round((rb + d - c) * 100) / 100;
                    result += `${new Date(line.date).toLocaleDateString('ar-EG')} | ${(line.description || line.reference || 'حركة').substring(0, 40)} | ${d > 0 ? d.toLocaleString('ar-EG') : '-'} | ${c > 0 ? c.toLocaleString('ar-EG') : '-'} | ${rb.toLocaleString('ar-EG')}\n`;
                }
                if (invoiceLines.length === 150) {
                    result += `\n⚠️ تنبيه: تم عرض أول 150 حركة فقط.`;
                }
            }
            return { text: result, partnerId: p.id };
        }
        catch (e) {
            return { text: `خطأ: ${e.message}` };
        }
    });
}
function getPurchasesContext(message) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const today = new Date().toISOString().split('T')[0];
            const currentYear = new Date().getFullYear();
            const { periodStart, periodEnd, periodLabel, targetMonth } = parsePeriodFromMessage(message);
            let paymentMethodFilter = '';
            let paymentLabelSuffix = '';
            if (message.includes('نقدي') || message.includes('كاش')) {
                paymentMethodFilter = " AND paymentMethod = 'CASH'";
                paymentLabelSuffix = ' (النقدي)';
            }
            else if (message.includes('اجل') || message.includes('أجل')) {
                paymentMethodFilter = " AND paymentMethod = 'CREDIT'";
                paymentLabelSuffix = ' (الآجل)';
            }
            const [todayPurch] = yield db_1.pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM invoices WHERE type IN ('PURCHASE','INVOICE_PURCHASE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND DATE(date) = ? ${paymentMethodFilter}`, [today]);
            const [monthPurch] = yield db_1.pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM invoices WHERE type IN ('PURCHASE','INVOICE_PURCHASE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND date >= ? AND date <= ? ${paymentMethodFilter}`, [periodStart, periodEnd]);
            const [topSuppliers] = yield db_1.pool.query(`SELECT partnerName, COUNT(*) as cnt, SUM(total) as total FROM invoices WHERE type IN ('PURCHASE','INVOICE_PURCHASE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND date >= ? AND date <= ? ${paymentMethodFilter} GROUP BY partnerId ORDER BY total DESC LIMIT 10`, [periodStart, periodEnd]);
            const tp = todayPurch[0];
            const mp = monthPurch[0];
            // ── PRE-COMPUTED INTELLIGENCE ──
            const periodTotal = Number(mp.total) || 0;
            // Get last month for comparison
            const lastMonthDate = new Date();
            lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
            const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
            const lastMonthEnd = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-${new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 0).getDate()}`;
            const [lastMonthPurch] = yield db_1.pool.query(`SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE type IN ('PURCHASE','INVOICE_PURCHASE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND date >= ? AND date <= ? ${paymentMethodFilter}`, [lastMonthStart, lastMonthEnd]);
            const lastMonthTotal = Number(((_a = lastMonthPurch[0]) === null || _a === void 0 ? void 0 : _a.total) || 0);
            const growthRate = lastMonthTotal > 0 ? ((periodTotal - lastMonthTotal) / lastMonthTotal * 100).toFixed(1) : 'N/A';
            const growthEmoji = Number(growthRate) > 0 ? '📈' : Number(growthRate) < 0 ? '📉' : '➡️';
            // Daily average
            const daysInPeriod = targetMonth ? new Date(currentYear, targetMonth, 0).getDate() : new Date().getDate();
            const dailyAvg = daysInPeriod > 0 ? Math.round(periodTotal / daysInPeriod) : 0;
            // Concentration
            const topSupp = topSuppliers[0];
            const topSuppPct = topSupp && periodTotal > 0 ? ((Number(topSupp.total) / periodTotal) * 100).toFixed(1) : '0';
            const concentrationRisk = Number(topSuppPct) > 40; // 40% threshold for suppliers
            let result = `📊 تقرير المشتريات${paymentLabelSuffix}:\n`;
            result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            result += `📅 اليوم (${today}): ${tp.count} فاتورة بإجمالي ${Number(tp.total).toLocaleString('ar-EG')} جنيه\n`;
            result += `📆 ${periodLabel}: ${mp.count} فاتورة بإجمالي ${Number(mp.total).toLocaleString('ar-EG')} جنيه\n`;
            result += `${growthEmoji} التغير عن الشهر السابق: ${growthRate}%\n`;
            result += `📊 متوسط الشراء اليومي: ${dailyAvg.toLocaleString('ar-EG')} جنيه\n`;
            result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            result += `🏭 أعلى الموردين (${periodLabel}):\n`;
            result += topSuppliers.length > 0
                ? topSuppliers.map((r, i) => {
                    const pct = periodTotal > 0 ? ((Number(r.total) / periodTotal) * 100).toFixed(1) : '0';
                    return `${i + 1}. ${r.partnerName}: ${r.cnt} فاتورة — ${Number(r.total).toLocaleString('ar-EG')} جنيه (${pct}%)`;
                }).join('\n')
                : '(لا توجد مشتريات في هذه الفترة)';
            if (concentrationRisk && topSupp) {
                result += `\n\n⚠️ تنبيه: نعتمد بشكل كبير على "${topSupp.partnerName}" (${topSuppPct}% من المشتريات).`;
            }
            return result;
        }
        catch (e) {
            return `خطأ في جلب بيانات المشتريات: ${e.message}`;
        }
    });
}
function getChequesContext() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [pending, dueSoon, overdue, collected, bounced] = yield Promise.all([
                db_1.pool.query(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM cheques WHERE status='PENDING'`),
                db_1.pool.query(`
              SELECT payeeName, amount, dueDate, type, bankName,
                DATEDIFF(dueDate, CURDATE()) as daysUntilDue
              FROM cheques
              WHERE status='PENDING' AND dueDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
              ORDER BY dueDate ASC LIMIT 10
            `),
                db_1.pool.query(`
              SELECT payeeName, amount, dueDate, type,
                DATEDIFF(CURDATE(), dueDate) as daysOverdue
              FROM cheques
              WHERE status='PENDING' AND dueDate < CURDATE()
              ORDER BY dueDate ASC LIMIT 5
            `),
                db_1.pool.query(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM cheques WHERE status='COLLECTED' AND MONTH(updatedAt)=MONTH(CURDATE())`),
                db_1.pool.query(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM cheques WHERE status='BOUNCED' AND MONTH(updatedAt)=MONTH(CURDATE())`),
            ]);
            const p = pending[0];
            const cl = collected[0];
            const bn = bounced[0];
            const od = overdue;
            let result = `
📋 إجمالي شيكات معلقة: ${p.c} شيك — ${Number(p.t).toLocaleString('ar-EG')} جنيه
✅ تم تحصيله هذا الشهر: ${cl.c} شيك — ${Number(cl.t).toLocaleString('ar-EG')} جنيه
❌ مرتجع هذا الشهر: ${bn.c} شيك — ${Number(bn.t).toLocaleString('ar-EG')} جنيه
`;
            if (od.length > 0) {
                result += `\n🚨 شيكات متأخرة (فات موعدها):\n`;
                result += od.map((r) => `- ${r.payeeName}: ${Number(r.amount).toLocaleString('ar-EG')} جنيه — متأخر ${r.daysOverdue} يوم`).join('\n');
            }
            const ds = dueSoon;
            if (ds.length > 0) {
                result += `\n\n⚠️ شيكات خلال 7 أيام:\n`;
                result += ds.map((r) => `- ${r.payeeName}: ${Number(r.amount).toLocaleString('ar-EG')} جنيه — بعد ${r.daysUntilDue} يوم (${r.type === 'INCOMING' ? 'وارد' : 'صادر'}) [${r.bankName || 'بدون بنك'}]`).join('\n');
            }
            return result;
        }
        catch (e) {
            return `خطأ: ${e.message}`;
        }
    });
}
function getAccountingContext() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [accountBalances] = yield db_1.pool.query(`SELECT a.type, 
             SUM(
                 COALESCE(a.openingBalance, 0) + 
                 COALESCE((SELECT SUM(
                     CASE 
                         WHEN a.type IN ('ASSET', 'EXPENSE') THEN jl.debit - jl.credit
                         ELSE jl.credit - jl.debit
                     END) 
                     FROM journal_lines jl JOIN journal_entries j ON jl.journalId = j.id
                     WHERE jl.accountId = a.id
                 ), 0)
             ) as balance
             FROM accounts a
             GROUP BY a.type`);
            const balances = accountBalances.reduce((acc, curr) => {
                acc[curr.type] = curr.balance;
                return acc;
            }, {});
            const rev = Number(balances['REVENUE'] || 0);
            const exp = Number(balances['EXPENSE'] || 0);
            const netProfit = rev - exp;
            const profitMargin = rev > 0 ? ((netProfit / rev) * 100).toFixed(1) : '0';
            const [recentJournals] = yield db_1.pool.query(`SELECT description, totalDebit, date FROM journal_entries ORDER BY date DESC LIMIT 10`);
            return `📊 ملخص الحسابات (مع تحليل الربحية):\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📈 الإيرادات: ${rev.toLocaleString('ar-EG')} جنيه\n` +
                `📉 المصروفات: ${exp.toLocaleString('ar-EG')} جنيه\n` +
                `💰 صافي الدخل (الربح): ${netProfit >= 0 ? '✅' : '🔴'} ${netProfit.toLocaleString('ar-EG')} جنيه\n` +
                `📊 هامش الربح: ${profitMargin}%\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `🏦 الأصول: ${Number(balances['ASSET'] || 0).toLocaleString('ar-EG')} جنيه\n` +
                `📋 الالتزامات: ${Number(balances['LIABILITY'] || 0).toLocaleString('ar-EG')} جنيه\n` +
                `⚖️ حقوق الملكية: ${Number(balances['EQUITY'] || 0).toLocaleString('ar-EG')} جنيه\n\n` +
                `📝 آخر 10 قيود يومية:\n` +
                recentJournals.map((j) => `- ${j.description || 'قيد'} | ${Number(j.totalDebit).toLocaleString('ar-EG')} ج | ${new Date(j.date).toLocaleDateString('ar-EG')}`).join('\n');
        }
        catch (e) {
            return `خطأ: ${e.message}`;
        }
    });
}
function getAppGuideContext() {
    return `دليل استخدام نظام ${brandConfig_1.SERVER_BRAND.name}:

📊 لوحة التحكم (الداشبورد): الصفحة الرئيسية — تعرض ملخص المبيعات والمخزون والخزينة. اضغط على أي بطاقة للتفاصيل.

🧾 الفواتير: من القائمة الجانبية → "الفواتير" — إنشاء فواتير بيع/شراء/مرتجع، البحث بالرقم أو العميل.

👥 العملاء والموردين: من "العملاء والموردين" — إضافة/تعديل/حذف، عرض كشف حساب لكل عميل أو مورد، تحديد حدود ائتمان.

📦 المخزون: من "المخزون" — إدارة المنتجات، متابعة الأرصدة، أذونات إضافة وصرف، جرد المخزون، تتبع أرقام السيريال.

💰 الخزينة: من "الخزينة" — تسجيل المقبوضات والمدفوعات، إدارة الشيكات، التحويلات البنكية، سجل النقدية اليومي.

📊 الحسابات: من "الحسابات" — دليل الحسابات، القيود اليدوية، ميزان المراجعة، قائمة الدخل.

🏭 التصنيع: من "التصنيع" — وصفات الإنتاج (BOM)، أوامر الإنتاج، تخطيط الموارد.

👔 الموارد البشرية: من "HR" — إدارة الموظفين، الرواتب، الحضور والانصراف، الإجازات، السلف.

🚗 مبيعات الفان: من "مبيعات الفان" — عمليات البيع الخارجي، إدارة المركبات، تقارير يومية.

⚙️ الإعدادات: من "إعدادات النظام" — إعدادات الشركة، المستخدمين والصلاحيات، الفروع، الطابعات، الذكاء الاصطناعي.

📋 نقطة البيع (POS): شاشة بيع سريعة مخصصة للكاشير.

💡 نصائح:
- استخدم شريط البحث العلوي للبحث السريع عن أي شيء
- اضغط Ctrl+S لحفظ أي نموذج
- اضغط على أي رقم أزرق للانتقال للتفاصيل`;
}
// ── PHASE 2: COMPARATIVE ANALYSIS ────────────────────────
function getComparativeContext(message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const today = new Date();
            const thisMonthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
            const lastMonth = new Date(today);
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            const lastMonthStart = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;
            const lastMonthEnd = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-${new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate()}`;
            const todayStr = today.toISOString().split('T')[0];
            const [thisSales] = yield db_1.pool.query(`SELECT COUNT(*) as c, COALESCE(SUM(total),0) as t FROM invoices WHERE type IN ('SALE','INVOICE_SALE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND date>=?`, [thisMonthStart]);
            const [lastSales] = yield db_1.pool.query(`SELECT COUNT(*) as c, COALESCE(SUM(total),0) as t FROM invoices WHERE type IN ('SALE','INVOICE_SALE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND date>=? AND date<=?`, [lastMonthStart, lastMonthEnd]);
            const [thisPurch] = yield db_1.pool.query(`SELECT COUNT(*) as c, COALESCE(SUM(total),0) as t FROM invoices WHERE type IN ('PURCHASE','INVOICE_PURCHASE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND date>=?`, [thisMonthStart]);
            const [lastPurch] = yield db_1.pool.query(`SELECT COUNT(*) as c, COALESCE(SUM(total),0) as t FROM invoices WHERE type IN ('PURCHASE','INVOICE_PURCHASE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND date>=? AND date<=?`, [lastMonthStart, lastMonthEnd]);
            const [thisTopProds] = yield db_1.pool.query(`SELECT p.name, SUM(il.total) as rev FROM invoice_lines il JOIN invoices i ON il.invoiceId=i.id JOIN products p ON il.productId=p.id WHERE i.type IN ('SALE','INVOICE_SALE') AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND i.date>=? GROUP BY il.productId ORDER BY rev DESC LIMIT 5`, [thisMonthStart]);
            const [lastTopProds] = yield db_1.pool.query(`SELECT p.name, SUM(il.total) as rev FROM invoice_lines il JOIN invoices i ON il.invoiceId=i.id JOIN products p ON il.productId=p.id WHERE i.type IN ('SALE','INVOICE_SALE') AND i.status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND i.date>=? AND i.date<=? GROUP BY il.productId ORDER BY rev DESC LIMIT 5`, [lastMonthStart, lastMonthEnd]);
            const ts = thisSales[0], ls = lastSales[0];
            const tp = thisPurch[0], lp = lastPurch[0];
            // Sales Pre-computed intelligence
            const salesDiff = Number(ts.t) - Number(ls.t);
            const salesPct = Number(ls.t) > 0 ? ((salesDiff / Number(ls.t)) * 100).toFixed(1) : 'N/A';
            const salesEmoji = salesDiff > 0 ? '📈 نمو' : salesDiff < 0 ? '📉 تراجع' : '➡️ استقرار';
            // Purchases Pre-computed intelligence
            const purchDiff = Number(tp.t) - Number(lp.t);
            const purchPct = Number(lp.t) > 0 ? ((purchDiff / Number(lp.t)) * 100).toFixed(1) : 'N/A';
            const purchEmoji = purchDiff > 0 ? '📈 زيادة' : purchDiff < 0 ? '📉 انخفاض' : '➡️ استقرار';
            let r = `📊 مقارنة الشهر الحالي vs الشهر السابق:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            r += `💰 المبيعات:\n  الحالي: ${Number(ts.t).toLocaleString('ar-EG')} جنيه (${ts.c} فاتورة)\n  السابق: ${Number(ls.t).toLocaleString('ar-EG')} جنيه (${ls.c} فاتورة)\n  التحليل: ${salesEmoji} بنسبة ${salesPct}% (${salesDiff >= 0 ? '+' : ''}${salesDiff.toLocaleString('ar-EG')} ج)\n\n`;
            r += `🛒 المشتريات:\n  الحالي: ${Number(tp.t).toLocaleString('ar-EG')} جنيه (${tp.c} فاتورة)\n  السابق: ${Number(lp.t).toLocaleString('ar-EG')} جنيه (${lp.c} فاتورة)\n  التحليل: ${purchEmoji} بنسبة ${purchPct}% (${purchDiff >= 0 ? '+' : ''}${purchDiff.toLocaleString('ar-EG')} ج)\n\n`;
            r += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            r += `🏆 أعلى منتجات الشهر الحالي مبيعاً:\n`;
            r += thisTopProds.map((p, i) => `  ${i + 1}. ${p.name}: ${Number(p.rev).toLocaleString('ar-EG')} جنيه`).join('\n') || '  (لا توجد مبيعات)';
            r += `\n\n🏆 أعلى منتجات الشهر السابق مبيعاً:\n`;
            r += lastTopProds.map((p, i) => `  ${i + 1}. ${p.name}: ${Number(p.rev).toLocaleString('ar-EG')} جنيه`).join('\n') || '  (لا توجد مبيعات)';
            return r;
        }
        catch (e) {
            return `خطأ: ${e.message}`;
        }
    });
}
function getAgingContext(message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [aging] = yield db_1.pool.query(`
            SELECT p.name, p.phone, p.email, ${REALTIME_BALANCE_EXPR} as balance,
                DATEDIFF(NOW(), COALESCE((SELECT MAX(i2.date) FROM invoices i2 WHERE i2.partnerId=p.id AND i2.type IN ('RECEIPT','PAYMENT','CHEQUE_DEPOSIT','CHEQUE_COLLECT','CHEQUE_CASHED') AND i2.status IN ('POSTED', 'COMPLETED', 'PARTIAL')), p.createdAt)) as daysSinceLastPayment,
                DATEDIFF(NOW(), COALESCE((SELECT MAX(i2.date) FROM invoices i2 WHERE i2.partnerId=p.id AND i2.type IN ('SALE','INVOICE_SALE') AND i2.status IN ('POSTED', 'COMPLETED', 'PARTIAL')), p.createdAt)) as daysSinceLastInvoice
            FROM partners p 
            WHERE (p.isCustomer=TRUE OR p.type='CUSTOMER' OR p.type='BOTH')
            HAVING balance > 0
            ORDER BY balance DESC LIMIT 30
        `);
            const rows = aging;
            const over90 = rows.filter(r => r.daysSinceLastPayment >= 90);
            const over60 = rows.filter(r => r.daysSinceLastPayment >= 60 && r.daysSinceLastPayment < 90);
            const over30 = rows.filter(r => r.daysSinceLastPayment >= 30 && r.daysSinceLastPayment < 60);
            const under30 = rows.filter(r => r.daysSinceLastPayment < 30);
            const sumBal = (arr) => arr.reduce((s, r) => s + Number(r.balance), 0);
            const fmtList = (arr) => arr.length > 0
                ? arr.slice(0, 8).map((r) => `  - ${r.name} | ${Number(r.balance).toLocaleString('ar-EG')} جنيه | ${r.daysSinceLastPayment} يوم | 📞 ${r.phone || 'بدون رقم'}`).join('\n')
                : '  (لا يوجد)';
            let r = `⏰ تحليل أعمار الديون (Aging Analysis):\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            r += `🔴 أكتر من 90 يوم: ${over90.length} عميل — ${sumBal(over90).toLocaleString('ar-EG')} جنيه\n${fmtList(over90)}\n\n`;
            r += `🟠 60-90 يوم: ${over60.length} عميل — ${sumBal(over60).toLocaleString('ar-EG')} جنيه\n${fmtList(over60)}\n\n`;
            r += `🟡 30-60 يوم: ${over30.length} عميل — ${sumBal(over30).toLocaleString('ar-EG')} جنيه\n${fmtList(over30)}\n\n`;
            r += `🟢 أقل من 30 يوم: ${under30.length} عميل — ${sumBal(under30).toLocaleString('ar-EG')} جنيه\n${fmtList(under30)}\n\n`;
            r += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            r += `💰 إجمالي المديونيات: ${sumBal(rows).toLocaleString('ar-EG')} جنيه | المعرض للخطر (90+ يوم): ${sumBal(over90).toLocaleString('ar-EG')} جنيه`;
            return r;
        }
        catch (e) {
            return `خطأ: ${e.message}`;
        }
    });
}
// ── PHASE 2: CASH FLOW FORECAST ──────────────────────────
function getCashFlowContext() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [cashNow] = yield db_1.pool.query(`
            SELECT COALESCE(SUM(
                COALESCE(a.openingBalance, 0) + 
                COALESCE((SELECT SUM(jl.debit) - SUM(jl.credit) 
                          FROM journal_lines jl JOIN journal_entries j ON jl.journalId = j.id 
                          WHERE jl.accountId = a.id), 0)
            ), 0) as t 
            FROM accounts a
            WHERE a.type='ASSET' AND (a.code LIKE '101%' OR a.code LIKE '102%' OR a.name LIKE '%صندوق%' OR a.name LIKE '%بنك%' OR a.name LIKE '%خزينة%')
        `);
            const [expectedIn] = yield db_1.pool.query(`SELECT COALESCE(SUM(amount),0) as t FROM cheques WHERE status='PENDING' AND type='INCOMING' AND dueDate <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`);
            const [expectedOut] = yield db_1.pool.query(`SELECT COALESCE(SUM(amount),0) as t FROM cheques WHERE status='PENDING' AND type='OUTGOING' AND dueDate <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`);
            const [receivables] = yield db_1.pool.query(`SELECT COALESCE(SUM(bal),0) as t FROM (SELECT ${REALTIME_BALANCE_EXPR} as bal FROM partners p WHERE (p.isCustomer=TRUE OR p.type='CUSTOMER' OR p.type='BOTH') HAVING bal > 0) x`);
            const [payables] = yield db_1.pool.query(`SELECT COALESCE(SUM(ABS(bal)),0) as t FROM (SELECT ${REALTIME_BALANCE_EXPR} as bal FROM partners p WHERE (p.isSupplier=TRUE OR p.type='SUPPLIER' OR p.type='BOTH') HAVING bal < 0) x`);
            const [avgDailySales] = yield db_1.pool.query(`SELECT COALESCE(AVG(daily_total),0) as avg_sales FROM (SELECT DATE(date) as d, SUM(total) as daily_total FROM invoices WHERE type IN ('SALE','INVOICE_SALE') AND status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY DATE(date)) sub`);
            const cash = Number(cashNow[0].t);
            const incom = Number(expectedIn[0].t);
            const outgo = Number(expectedOut[0].t);
            const recv = Number(receivables[0].t);
            const pay = Number(payables[0].t);
            const avgSales = Number(avgDailySales[0].avg_sales);
            const projected7d = cash + incom - outgo + (avgSales * 7);
            // Pre-computed liquidity score
            const liquidityStatus = cash > (outgo * 1.5) ? 'ممتاز ✅' : cash > outgo ? 'جيد ⚠️' : 'خطر 🔴';
            let r = `💸 توقع التدفق النقدي والسيولة:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            r += `💰 النقدية الحالية بالخزينة والبنوك: ${cash.toLocaleString('ar-EG')} جنيه\n\n`;
            r += `📥 تدفقات داخلة (خلال 7 أيام):\n  - شيكات واردة: +${incom.toLocaleString('ar-EG')} جنيه\n  - متوقع من المبيعات: ~${(avgSales * 7).toLocaleString('ar-EG')} جنيه\n\n`;
            r += `📤 التزامات عاجلة (خلال 7 أيام):\n  - شيكات صادرة: -${outgo.toLocaleString('ar-EG')} جنيه\n\n`;
            r += `📊 الرصيد المتوقع بعد 7 أيام: ~${projected7d.toLocaleString('ar-EG')} جنيه\n`;
            r += `🛡️ حالة السيولة: ${liquidityStatus} (النقدية الحالية ${cash > outgo ? 'تغطي' : 'لا تغطي'} الشيكات المطلوبة)\n`;
            r += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            r += `📋 ذمم مدينة (أرصدة العملاء): ${recv.toLocaleString('ar-EG')} جنيه\n`;
            r += `📋 ذمم دائنة (أرصدة الموردين): ${pay.toLocaleString('ar-EG')} جنيه\n`;
            r += `\n⚡ صافي الوضع بالسوق: ${(recv - pay) >= 0 ? '✅' : '⚠️'} ${(recv - pay).toLocaleString('ar-EG')} جنيه`;
            return r;
        }
        catch (e) {
            return `خطأ: ${e.message}`;
        }
    });
}
// ── PHASE 2: INVENTORY INTELLIGENCE ──────────────────────
function getInventoryIntelligenceContext() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [slowMoving] = yield db_1.pool.query(`
            SELECT p.name, p.stock, p.unit, p.price,
                DATEDIFF(NOW(), COALESCE((SELECT MAX(i2.date) FROM invoice_lines il2 JOIN invoices i2 ON il2.invoiceId=i2.id WHERE il2.productId=p.id AND i2.type IN ('SALE','INVOICE_SALE') AND i2.status IN ('POSTED', 'COMPLETED', 'PARTIAL')), p.createdAt)) as daysSinceLastSale
            FROM products p WHERE p.isActive=TRUE AND p.stock > 0
            ORDER BY daysSinceLastSale DESC LIMIT 15
        `);
            const [fastMoving] = yield db_1.pool.query(`
            SELECT p.name, p.stock, p.minStock, p.unit,
                COALESCE((SELECT SUM(il2.quantity) FROM invoice_lines il2 JOIN invoices i2 ON il2.invoiceId=i2.id WHERE il2.productId=p.id AND i2.type IN ('SALE','INVOICE_SALE') AND i2.status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND i2.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)),0) as monthlySales
            FROM products p WHERE p.isActive=TRUE AND p.stock > 0
            HAVING monthlySales > 0
            ORDER BY monthlySales DESC LIMIT 10
        `);
            const [daysOfStock] = yield db_1.pool.query(`
            SELECT p.name, p.stock, p.unit,
                COALESCE((SELECT SUM(il2.quantity)/30 FROM invoice_lines il2 JOIN invoices i2 ON il2.invoiceId=i2.id WHERE il2.productId=p.id AND i2.type IN ('SALE','INVOICE_SALE') AND i2.status IN ('POSTED', 'COMPLETED', 'PARTIAL') AND i2.date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)),0) as dailyAvg
            FROM products p WHERE p.isActive=TRUE AND p.stock > 0
            HAVING dailyAvg > 0
            ORDER BY (p.stock / dailyAvg) ASC LIMIT 10
        `);
            let r = `🔍 تحليل ذكاء المخزون:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            r += `🐌 أصناف راكدة (بطيئة الحركة):\n`;
            r += slowMoving.map((p) => `  - ${p.name}: ${p.stock} ${p.unit || 'وحدة'} | آخر بيع: ${p.daysSinceLastSale} يوم | قيمة مجمدة: ${(Number(p.stock) * Number(p.price || 0)).toLocaleString('ar-EG')} جنيه`).join('\n') || '  (لا يوجد)';
            r += `\n\n🚀 أصناف سريعة الحركة (أعلى مبيعاً):\n`;
            r += fastMoving.map((p) => `  - ${p.name}: مبيعات الشهر ${p.monthlySales} ${p.unit || 'وحدة'} | رصيد: ${p.stock}`).join('\n') || '  (لا يوجد)';
            r += `\n\n⏳ أصناف قربت تخلص (أيام المخزون المتبقية):\n`;
            r += daysOfStock.map((p) => {
                const days = Number(p.dailyAvg) > 0 ? Math.round(Number(p.stock) / Number(p.dailyAvg)) : 999;
                return `  - ${p.name}: ${p.stock} ${p.unit || 'وحدة'} → ~${days} يوم متبقي`;
            }).join('\n') || '  (لا يوجد)';
            return r;
        }
        catch (e) {
            return `خطأ: ${e.message}`;
        }
    });
}
// ── PHASE 3: PROACTIVE INTELLIGENCE & BUSINESS PROFILE ──────
function getBusinessProfile() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const [config] = yield db_1.pool.query(`SELECT config FROM system_config LIMIT 1`);
            const cfg = (_a = config[0]) === null || _a === void 0 ? void 0 : _a.config;
            let parsedCfg = cfg;
            if (typeof cfg === 'string')
                try {
                    parsedCfg = JSON.parse(cfg);
                }
                catch (e) { }
            const [stats] = yield db_1.pool.query(`
            SELECT 
            (SELECT COUNT(*) FROM partners WHERE isCustomer = 1) as totalCustomers,
            (SELECT COUNT(*) FROM partners WHERE isSupplier = 1) as totalSuppliers,
            (SELECT COUNT(*) FROM products WHERE isActive = 1) as totalProducts,
            (SELECT COALESCE(SUM(total),0) FROM invoices 
            WHERE type='INVOICE_SALE' AND MONTH(date)=MONTH(NOW())) as thisMonthSales
        `);
            const s = stats[0];
            return `
=== معلومات الشركة ===
اسم الشركة: ${(parsedCfg === null || parsedCfg === void 0 ? void 0 : parsedCfg.companyName) || brandConfig_1.SERVER_BRAND.name}
النشاط: ${(parsedCfg === null || parsedCfg === void 0 ? void 0 : parsedCfg.businessType) || 'تجارة'}
عدد العملاء: ${s.totalCustomers}
عدد الموردين: ${s.totalSuppliers}
عدد الأصناف: ${s.totalProducts}
مبيعات الشهر الحالي: ${Number(s.thisMonthSales).toLocaleString('ar-EG')} جنيه
`;
        }
        catch (e) {
            return '';
        }
    });
}
function getProactiveInsights() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const insights = [];
            // 1. Overdue collections
            const [overdue] = yield db_1.pool.query(`
            SELECT COUNT(*) as cnt, SUM(${REALTIME_BALANCE_EXPR}) as total
            FROM partners p WHERE isCustomer=1
            AND EXISTS (
            SELECT 1 FROM invoices i 
            WHERE i.partnerId = p.id 
            AND i.type='INVOICE_SALE' 
            AND i.status='POSTED'
            AND DATEDIFF(NOW(), i.date) > 60
            )
        `);
            const od = overdue[0];
            if (od.cnt > 0 && Number(od.total) > 0)
                insights.push(`⚠️ ${od.cnt} عميل لم يسدد منذ أكثر من 60 يوم — إجمالي ${Number(od.total).toLocaleString('ar-EG')} جنيه`);
            // 2. Low stock items
            const [lowStock] = yield db_1.pool.query(`
            SELECT COUNT(*) as cnt FROM products 
            WHERE stock <= minStock AND isActive=1 AND minStock > 0
        `);
            if (lowStock[0].cnt > 0)
                insights.push(`📦 ${lowStock[0].cnt} صنف وصل لحد إعادة الطلب`);
            // 3. Today vs 7-day avg anomaly
            const [todayVsAvg] = yield db_1.pool.query(`
            SELECT 
            (SELECT COALESCE(SUM(total),0) FROM invoices WHERE type='INVOICE_SALE' AND DATE(date)=CURDATE()) as today,
            (SELECT COALESCE(AVG(dt),0) FROM (
                SELECT SUM(total) as dt FROM invoices 
                WHERE type='INVOICE_SALE' AND DATE(date) BETWEEN DATE_SUB(CURDATE(),INTERVAL 7 DAY) AND DATE_SUB(CURDATE(),INTERVAL 1 DAY)
                GROUP BY DATE(date)
            ) x) as avg7
        `);
            const ta = todayVsAvg[0];
            if (ta.avg7 > 0 && ta.today < ta.avg7 * 0.5)
                insights.push(`📉 مبيعات اليوم أقل بـ ${Math.round((1 - ta.today / ta.avg7) * 100)}% عن متوسط الأسبوع`);
            return insights.length > 0
                ? `\n\n💡 ملاحظات تلقائية:\n${insights.join('\n')}`
                : '';
        }
        catch (e) {
            return '';
        }
    });
}
// ── INTELLIGENCE ENGINES ─────────────────────────────────
function compressCustomerData(rows) {
    if (rows.length === 0)
        return 'لا يوجد بيانات';
    if (rows.length === 1) {
        const r = rows[0];
        return `العميل: ${r.name} | الرصيد: ${Number(r.balance).toLocaleString('ar-EG')} جنيه | الهاتف: ${r.phone || 'غير محدد'} | الحد الائتماني: ${Number(r.creditLimit || 0).toLocaleString('ar-EG')} جنيه`;
    }
    const totalBalance = rows.reduce((s, r) => s + Number(r.balance), 0);
    const topDebtor = rows.reduce((a, b) => Number(a.balance) > Number(b.balance) ? a : b, rows[0]);
    return `
وجدت ${rows.length} عملاء مطابقين:
${rows.map((r) => `- ${r.name}: ${Number(r.balance).toLocaleString('ar-EG')} جنيه`).join('\n')}
المجموع: ${totalBalance.toLocaleString('ar-EG')} جنيه | أعلى رصيد: ${(topDebtor === null || topDebtor === void 0 ? void 0 : topDebtor.name) || ''}
    `.trim();
}
function enrichCustomerContext(partnerId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [lastActivity, chequeStatus, invoiceHistory, creditUsage] = yield Promise.all([
                db_1.pool.query(`
                SELECT total, date, status, type FROM invoices
                WHERE partnerId = ? AND type IN ('INVOICE_SALE','INVOICE_PURCHASE')
                ORDER BY date DESC LIMIT 1
            `, [partnerId]),
                db_1.pool.query(`
                SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total
                FROM invoices WHERE partnerId = ? AND type = 'CHEQUE_BOUNCE'
                AND status IN ('POSTED','COMPLETED')
            `, [partnerId]),
                db_1.pool.query(`
                SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total3m
                FROM invoices
                WHERE partnerId = ? AND type IN ('INVOICE_SALE','INVOICE_PURCHASE')
                AND date >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
                AND status IN ('POSTED','COMPLETED','PARTIAL')
            `, [partnerId]),
                db_1.pool.query(`
                SELECT creditLimit, ${REALTIME_BALANCE_EXPR} as balance
                FROM partners p WHERE p.id=?
            `, [partnerId])
            ]);
            const last = lastActivity[0];
            const chq = chequeStatus[0];
            const hist = invoiceHistory[0];
            const cred = creditUsage[0];
            const daysSinceLast = last
                ? Math.floor((Date.now() - new Date(last.date).getTime()) / 86400000)
                : null;
            const parts = [];
            if (last)
                parts.push(`📄 آخر معاملة: ${Number(last.total).toLocaleString('ar-EG')} جنيه — منذ ${daysSinceLast} يوم` +
                    (daysSinceLast > 60 ? ' ⚠️ لم يتعامل منذ فترة طويلة' : ''));
            if ((chq === null || chq === void 0 ? void 0 : chq.cnt) > 0)
                parts.push(`🚨 شيكات مرتجعة: ${chq.cnt} شيك — ${Number(chq.total).toLocaleString('ar-EG')} جنيه`);
            if ((hist === null || hist === void 0 ? void 0 : hist.cnt) > 0)
                parts.push(`📊 آخر 3 شهور: ${hist.cnt} فاتورة بإجمالي ${Number(hist.total3m).toLocaleString('ar-EG')} جنيه`);
            const creditPct = (cred === null || cred === void 0 ? void 0 : cred.creditLimit) > 0
                ? ((cred.balance / cred.creditLimit) * 100).toFixed(0)
                : null;
            if (creditPct)
                parts.push(`💳 استخدام الحد الائتماني: ${creditPct}%${Number(creditPct) > 80 ? ' ⚠️' : ''}`);
            return parts.length > 0 ? '\n\n' + parts.join('\n') : '';
        }
        catch (e) {
            return '';
        }
    });
}
function runAutodiagnosis(intent, data) {
    return __awaiter(this, void 0, void 0, function* () {
        const insights = [];
        try {
            if (intent === 'sales_report') {
                const [churnedCustomers] = yield db_1.pool.query(`
                SELECT partnerName FROM invoices
                WHERE type='INVOICE_SALE' 
                  AND MONTH(date) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH))
                  AND partnerId NOT IN (
                      SELECT DISTINCT partnerId FROM invoices
                      WHERE type='INVOICE_SALE' AND MONTH(date) = MONTH(NOW())
                  )
                GROUP BY partnerId
                ORDER BY SUM(total) DESC LIMIT 5
            `);
                if (churnedCustomers.length > 0) {
                    insights.push(`🚨 عملاء اشتروا الشهر اللي فات بس مشتروش الشهر ده:\n` +
                        churnedCustomers.map((r) => `- ${r.partnerName}`).join('\n'));
                }
                const [peakHour] = yield db_1.pool.query(`
                SELECT HOUR(date) as hr, COUNT(*) as cnt
                FROM invoices WHERE type='INVOICE_SALE' AND MONTH(date)=MONTH(NOW())
                GROUP BY hr ORDER BY cnt DESC LIMIT 1
            `);
                if (peakHour.length > 0 && peakHour[0].hr !== null) {
                    insights.push(`⏰ أكتر وقت مبيعات: الساعة ${peakHour[0].hr}:00`);
                }
            }
            if (intent === 'customer_balance') {
                const [inactive] = yield db_1.pool.query(`
                SELECT p.name, MAX(i.date) as lastBuy,
                    DATEDIFF(NOW(), MAX(i.date)) as daysSince,
                    ${REALTIME_BALANCE_EXPR} as currentBal
                FROM partners p
                JOIN invoices i ON i.partnerId = p.id
                WHERE p.isCustomer=1
                  AND i.type='INVOICE_SALE'
                GROUP BY p.id
                HAVING daysSince > 30 AND currentBal > 10000
                ORDER BY currentBal DESC LIMIT 3
            `);
                if (inactive.length > 0) {
                    insights.push(`⚠️ عملاء عليهم ديون ومشتروش من فترة:\n` +
                        inactive.map((r) => `- ${r.name}: آخر شراء منذ ${r.daysSince} يوم`).join('\n'));
                }
            }
        }
        catch (e) { }
        return insights.length > 0 ? '\n\n💡 تشخيص آلي:\n' + insights.join('\n\n') : '';
    });
}
function forecastNextMonth() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [monthly] = yield db_1.pool.query(`
            SELECT MONTH(date) as month, SUM(total) as total
            FROM invoices
            WHERE type='INVOICE_SALE' 
              AND date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY MONTH(date)
            ORDER BY MAX(date)
        `);
            const data = monthly.map((r) => Number(r.total));
            if (data.length < 3)
                return '';
            const n = data.length;
            const xMean = (n - 1) / 2;
            const yMean = data.reduce((a, b) => a + b, 0) / n;
            let num = 0, den = 0;
            data.forEach((y, x) => {
                num += (x - xMean) * (y - yMean);
                den += (x - xMean) ** 2;
            });
            const slope = den !== 0 ? num / den : 0;
            const intercept = yMean - slope * xMean;
            const forecast = intercept + slope * n;
            const trend = slope > 0 ? '📈 تصاعدي' : '📉 تنازلي';
            return `\n🔮 توقع الشهر القادم:\n- الاتجاه العام: ${trend}\n- المبيعات المتوقعة: ${Math.max(0, Math.round(forecast)).toLocaleString('ar-EG')} جنيه\n- متوسط النمو الشهري: ${slope > 0 ? '+' : ''}${Math.round(slope).toLocaleString('ar-EG')} جنيه/شهر\n`;
        }
        catch (e) {
            return '';
        }
    });
}
// ── CONTEXT ROUTER ───────────────────────────────────────
function fetchContext(intent, message, uiContext) {
    return __awaiter(this, void 0, void 0, function* () {
        switch (intent) {
            case 'customer_balance': return getCustomerBalanceContext(message, uiContext);
            case 'customer_statement': return getCustomerStatementContext(message, uiContext);
            case 'supplier_balance': return getSupplierBalanceContext(message, uiContext);
            case 'supplier_statement': return getSupplierStatementContext(message, uiContext);
            case 'sales_report': return { text: yield getSalesContext(message) };
            case 'purchases': return { text: yield getPurchasesContext(message) };
            case 'inventory': return { text: yield getInventoryContext(message) };
            case 'treasury': return { text: yield getTreasuryContext() };
            case 'cheques': return { text: yield getChequesContext() };
            case 'production': return { text: yield getProductionContext() };
            case 'hr': return { text: yield getHRContext() };
            case 'invoice_lookup': return { text: yield getInvoiceLookupContext(message) };
            case 'product_search': return { text: yield getInventoryContext(message) };
            case 'accounting': return { text: yield getAccountingContext() };
            case 'comparative': return { text: yield getComparativeContext(message) };
            case 'aging': return { text: yield getAgingContext(message) };
            case 'cashflow': return { text: yield getCashFlowContext() };
            case 'inventory_intelligence': return { text: yield getInventoryIntelligenceContext() };
            case 'app_guide': return { text: yield getAppGuideContext() };
            case 'help': return { text: yield getAppGuideContext() };
            case 'chitchat': return { text: yield getCasualContext() };
            case 'general': return { text: yield getCasualContext() };
            default: return { text: '' };
        }
    });
}
// ── CASUAL / CHITCHAT CONTEXT — lightweight awareness ──
function getCasualContext() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? 'الصبح' : hour < 17 ? 'بعد الظهر' : 'بالليل';
            const [qs] = yield db_1.pool.query(`
            SELECT 
                (SELECT COALESCE(SUM(total),0) FROM invoices WHERE type IN ('SALE','INVOICE_SALE') AND status IN ('POSTED','COMPLETED','PARTIAL') AND DATE(date) = CURDATE()) as todaySales,
                (SELECT COUNT(*) FROM invoices WHERE status = 'DRAFT') as openDrafts
        `);
            const stats = qs[0] || {};
            return `[سياق خفيف — محادثة عادية]
الوقت: ${greeting} (${new Date().toLocaleDateString('ar-EG')})
مبيعات اليوم حتى الآن: ${Number(stats.todaySales || 0).toLocaleString('ar-EG')} جنيه
فواتير معلقة: ${stats.openDrafts || 0}
المستخدم بيكلمك كلام عادي. رد بشكل إنساني ودافئ وطبيعي. ممكن تذكر رقم المبيعات لو مناسب بس متفرضهوش.`;
        }
        catch (_a) {
            return '';
        }
    });
}
// ── SYSTEM PROMPT — Executive J.A.R.V.I.S Persona ──
const SYSTEM_PROMPT = `أنت "Dax" (دكس) — المساعد الذكي لنظام ${brandConfig_1.SERVER_BRAND.name}.
أنت حاد الذكاء، ودود بطبيعتك، ومباشر. أنت زميل في الشركة وليس مجرد بوت — فكّر في نفسك كالمستشار التنفيذي اللي دايماً موجود.

TONE SWITCHING:
- كلام عادي (تحية، نكتة، "عامل ايه") → رد بشكل إنساني ودافئ في جملة أو اتنين. خلّي الكلام خفيف. استخدم فكاهة لو مناسبة.
- سؤال بيزنس / بيانات → حوّل فوراً لأسلوب دقيق ومنظم ومختصر. ادخل في الموضوع مباشرة.
- خبر حلو (مبيعات طالعة، عميل سدد) → احتفل بيه بحماس خفيف 🎯
- مشكلة في البيانات (مبيعات واقعة، ديون كتير) → نبّه بلطف واقترح حل عملي.
- متقولش أبداً "أنا مجرد ذكاء اصطناعي" أو "لا أستطيع" — دايماً اوجد طريقة تساعد بيها.

ANTI-REPETITION RULES:
⛔ لا تبدأ كل رد بتحية أو بـ"مرحباً". التحية مرة واحدة فقط في أول رسالة من المحادثة.
⛔ لا تكرر نفس رقم المبيعات اليومية في كل رد — اذكره مرة واحدة لو المستخدم سأل أو في أول رسالة فقط.
⛔ إذا المحادثة فيها تاريخ سابق (رسائل سابقة)، ادخل في الموضوع مباشرة بدون مقدمات.
⛔ ردودك على أسئلة البيانات يجب أن تبدأ بالإجابة مباشرة وليس بالتحية.

PERSONALITY:
- عندك رأي: لو المبيعات نازلة قولها بصراحة مع اقتراح.
- بتفتكر سياق المحادثة وبترجعله بشكل طبيعي.
- صادق لو مش متأكد — بس متسبش المستخدم من غير خطوة تانية.
- خلّي ردودك مختصرة ومفيدة. الناس مشغولة.

CONVERSATION MEMORY:
- لو المستخدم سأل عن عميل أو مورد قبل كده في المحادثة وبعدين قال "كشف حسابه" أو "ملخص الرصيد" — ارجع لنفس العميل/المورد السابق.
- لو المستخدم طلب "كشف حساب أكبر مدين" بعد تقرير أعمار الديون — ده يعني أكبر عميل في قائمة الديون المعروضة.
- لو المستخدم كتب "ملخص الرصيد فقط" — ده يعني العميل اللي كان بيتكلم عنه قبل كده.

LANGUAGE RULE: 
- If the user writes in Arabic → respond ONLY in Arabic (العامية المصرية مقبولة ومفضّلة)
- If the user writes in English → respond in English
- If mixed → match their exact blend naturally

FORMAT INSTRUCTIONS:
- For lists of customers/products/invoices: use markdown tables
- For single numbers: bold them with context (**1,500** جنيه)
- For comparisons: use a 2-column table
- At the END of business data responses, add a line:
  🔗 [افتح في النظام](/route/to/relevant/page) (if applicable)

CRITICAL RULES:
1. ⛔ الدقة المطلقة: أي رقم تكتبه يجب أن يكون مستمداً حرفياً من البيانات المزوّدة. لا تخمن ولا تخترع أي أرقام.
2. ⛔ لا تضلل المستخدم: إذا كانت البيانات فارغة أو "0"، قل كده بوضوح.
3. ⛔ لست مهندس صيانة: لا تعرض برمجة أو إصلاح النظام. أنت مستشار بيانات.`;
// Simple language detection in backend
function detectLanguage(text) {
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    const ratio = arabicChars / (arabicChars + englishChars + 1);
    if (ratio > 0.7)
        return 'ar';
    if (ratio < 0.3)
        return 'en';
    return 'mixed';
}
// ── MAIN CHAT ENDPOINT ───────────────────────────────────
const handleAIChat = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    const requestStartTime = Date.now();
    const { message, history, uiContext } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'الرسالة مطلوبة' });
    }
    if (message.length > AI_CONSTANTS.MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ error: `الرسالة طويلة جداً (الحد الأقصى ${AI_CONSTANTS.MAX_MESSAGE_LENGTH} حرف)` });
    }
    try {
        // Ensure config is loaded
        yield getAPIKeys();
        const provider = (_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.aiProvider) || 'gemini';
        // Check provider-specific keys
        if (provider === 'gemini' && _apiKeys.length === 0) {
            return res.status(503).json({
                error: 'مفتاح Gemini API غير مُعَد. يرجى إضافته من إعدادات النظام → الذكاء الاصطناعي.',
                needsApiKey: true
            });
        }
        if (provider === 'groq' && !(_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.groqApiKey)) {
            return res.status(503).json({ error: 'مفتاح Groq غير مُعَد. يرجى إضافته من الإعدادات.', needsApiKey: true });
        }
        if (provider === 'cloudflare' && (!(_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.cloudflareAccountId) || !(_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.cloudflareApiToken))) {
            return res.status(503).json({ error: 'بيانات Cloudflare غير مكتملة. يرجى إضافتها من الإعدادات.', needsApiKey: true });
        }
        if (provider === 'openrouter' && !(_aiConfig === null || _aiConfig === void 0 ? void 0 : _aiConfig.openRouterApiKey)) {
            return res.status(503).json({ error: 'مفتاح OpenRouter غير مُعَد. يرجى إضافته من الإعدادات.', needsApiKey: true });
        }
        // 1. Classify intent with CONVERSATION MEMORY (DB-backed)
        let modelId = _selectedModel;
        const sessionId = req.body.sessionId || ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || 'default';
        const session = yield getSessionAsync(sessionId);
        let intent = classifyIntentSync(message);
        let llmExtractedName = undefined;
        // Hook LLM Intent Classifier as fallback for ambiguous queries
        if (intent === 'general' && message.trim().split(/\s+/).length > 3 && (!session || !isFollowUp(message, intent))) {
            try {
                console.log(`[AI Chat] 🤖 Sync classifier returned 'general'. Invoking LLM fallback classifier...`);
                const llmResult = yield classifyIntentWithLLM(message, modelId);
                if (llmResult && llmResult.intent && llmResult.intent !== 'general') {
                    console.log(`[AI Chat] 🤖 LLM successfully recovered intent: ${llmResult.intent} with target: ${llmResult.targetName}`);
                    intent = llmResult.intent;
                    if (llmResult.targetName && llmResult.targetName.length > 2 && llmResult.targetName !== 'null') {
                        llmExtractedName = llmResult.targetName;
                    }
                }
            }
            catch (e) {
                console.warn(`[AI Chat] LLM intent classifier failed:`, e);
            }
        }
        // MEMORY: If this is a follow-up, inherit context from previous turn
        if (session && isFollowUp(message, intent)) {
            const prevIntent = session.lastIntent;
            console.log(`[AI Chat] 🧠 Follow-up detected! Inheriting from session. Prev intent: ${prevIntent}, Prev partner: ${session.lastPartnerName || 'none'}`);
            // Resolve the specific follow-up intent (e.g., "شيكاته" → cheques)
            // Always resolve for suggestion-button follow-ups, not just 'general' or 'chitchat'
            const resolvedIntent = resolveFollowUpIntent(message, prevIntent);
            if (resolvedIntent !== prevIntent || intent === 'general' || intent === 'chitchat') {
                intent = resolvedIntent;
                console.log(`[AI Chat] 🧠 Follow-up intent resolved to: ${intent}`);
            }
            // ── SPECIAL: "كشف حساب أكبر مدين" from aging context ──
            // When the user clicks this suggestion after an aging report, resolve the top debtor
            if (/أكبر مدين/.test(message) && prevIntent === 'aging') {
                try {
                    const [topDebtor] = yield db_1.pool.query(`SELECT p.id, p.name FROM partners p 
                         WHERE (p.isCustomer=TRUE OR p.type='CUSTOMER' OR p.type='BOTH')
                         HAVING (${REALTIME_BALANCE_EXPR}) > 0
                         ORDER BY (${REALTIME_BALANCE_EXPR}) DESC LIMIT 1`);
                    if (topDebtor.length > 0) {
                        const debtor = topDebtor[0];
                        if (!req.body.uiContext)
                            req.body.uiContext = {};
                        req.body.uiContext.partnerId = debtor.id;
                        req.body.uiContext.partnerName = debtor.name;
                        intent = 'customer_statement';
                        console.log(`[AI Chat] 🧠 Resolved "أكبر مدين" to customer: ${debtor.name} (ID: ${debtor.id})`);
                    }
                }
                catch (e) {
                    console.warn('[AI Chat] Could not resolve top debtor:', e);
                }
            }
            // Inject previous partner context into uiContext if missing
            if (!((_b = req.body.uiContext) === null || _b === void 0 ? void 0 : _b.partnerId) && session.lastPartnerId) {
                if (!req.body.uiContext)
                    req.body.uiContext = {};
                req.body.uiContext.partnerId = session.lastPartnerId;
                req.body.uiContext.partnerName = session.lastPartnerName;
                console.log(`[AI Chat] 🧠 Inherited partnerId: ${session.lastPartnerId} (${session.lastPartnerName})`);
            }
        }
        // ── Phase 3: Smart Model Routing ──
        const smartRoute = smartSelectModel(intent, modelId, message.length);
        if (smartRoute.reason !== 'user_selected' && smartRoute.reason !== 'default') {
            modelId = smartRoute.modelId;
        }
        console.log(`[AI Chat] Intent: ${intent} | Provider: ${provider} | Model: ${modelId} | Router: ${smartRoute.reason}${session ? ' | 🧠 Session active' : ''}`);
        // ════════════════════════════════════════════════════
        // PHASE 2: AGENTIC ACTION DETECTION
        // Detect if the user is requesting an ERP operation
        // ════════════════════════════════════════════════════
        const detectedAction = (0, aiActionRegistry_1.detectAction)(message);
        if (detectedAction) {
            const action = (0, aiActionRegistry_1.getAction)(detectedAction.actionId);
            if (action) {
                const user = req.user;
                const userRole = (user === null || user === void 0 ? void 0 : user.role) || 'user';
                // Role-based access check
                if (!(0, aiActionRegistry_1.canUserExecute)(action, userRole)) {
                    const denyMsg = `⛔ عذراً، ليس لديك صلاحية تنفيذ "${action.nameAr}". هذه العملية متاحة لـ: ${action.requiredRoles.join(', ')}`;
                    if (req.body.stream) {
                        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
                        res.setHeader('Cache-Control', 'no-cache');
                        res.write(`data: ${JSON.stringify({ type: 'start', intent: 'action_denied' })}\n\n`);
                        res.write(`data: ${JSON.stringify({ type: 'chunk', text: denyMsg })}\n\n`);
                        res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
                        res.end();
                    }
                    else {
                        res.json({ response: denyMsg, intent: 'action_denied' });
                    }
                    return;
                }
                // Extract parameters from the natural language message
                const params = yield (0, aiActionRegistry_1.extractActionParams)(detectedAction.actionId, message, session ? {
                    lastPartnerId: session.lastPartnerId,
                    lastPartnerName: session.lastPartnerName,
                } : undefined);
                // Build the confirmation proposal
                const proposal = (0, aiActionRegistry_1.buildActionProposal)(action, params);
                // Check for missing required params
                const missing = action.parameters.filter(p => p.required && !params[p.name]);
                if (missing.length > 0) {
                    proposal.missingParams = missing.map(m => m.nameAr);
                    proposal.promptMessage = `⚠️ لتنفيذ "${action.nameAr}"، أحتاج منك: ${missing.map(m => m.nameAr).join('، ')}`;
                }
                console.log(`[AI Action] 🎯 Detected: ${action.id} | Params: ${JSON.stringify(params)} | Missing: ${missing.map(m => m.name).join(',') || 'none'}`);
                // Return the proposal to the frontend for confirmation
                if (req.body.stream) {
                    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.write(`data: ${JSON.stringify({ type: 'start', intent: 'action_proposal' })}\n\n`);
                    if (missing.length > 0) {
                        // Missing params — ask for them via normal AI response
                        res.write(`data: ${JSON.stringify({ type: 'chunk', text: proposal.promptMessage })}\n\n`);
                    }
                    else {
                        // All params present — send confirmation card
                        const confirmMsg = `🤖 **${action.nameAr}** ${action.icon}\n\n` +
                            proposal.summary.map((s) => `• **${s.label}**: ${s.value}`).join('\n') +
                            '\n\n⬇️ اضغط **تأكيد** لتنفيذ العملية';
                        res.write(`data: ${JSON.stringify({ type: 'chunk', text: confirmMsg })}\n\n`);
                        res.write(`data: ${JSON.stringify(Object.assign({ type: 'action_proposal' }, proposal))}\n\n`);
                    }
                    res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
                    res.end();
                }
                else {
                    res.json({ response: proposal.promptMessage || 'Action proposal ready', intent: 'action_proposal', actionProposal: proposal });
                }
                return;
            }
        }
        // Inject LLM extracted name if any
        if (llmExtractedName) {
            if (!req.body.uiContext)
                req.body.uiContext = {};
            req.body.uiContext.llmTargetName = llmExtractedName;
        }
        // 2. Fetch relevant DB context — ALWAYS pass raw message so each fetcher can extract what it needs
        const contextResult = yield fetchContext(intent, message, req.body.uiContext || uiContext);
        let dbContext = contextResult.text;
        const responsePartnerId = contextResult.partnerId;
        // Dynamic Intent Correction (False Positive Name Detection)
        if (['customer_balance', 'customer_statement', 'supplier_balance', 'supplier_statement'].includes(intent)) {
            const isExplicit = /(عميل|العميل|مورد|المورد|رصيد|حساب|كشف|زبون|مبيعات|مشتريات|فاتورة)/.test(message);
            if (!isExplicit && dbContext && dbContext.includes('لم يتم العثور على')) {
                console.log(`[AI Chat] 🔄 False positive name detection for "${message}". Resetting to general intent.`);
                intent = 'general';
                dbContext = '';
                contextResult.text = '';
            }
        }
        // ── Phase 3: RAG Knowledge Base Search ──
        // Enrich context with relevant company knowledge (policies, SOPs, FAQs)
        let kbHitCount = 0;
        try {
            const kbResult = yield (0, aiKnowledgeController_1.searchKnowledgeBase)(message, intent, 2);
            if (kbResult.hitCount > 0) {
                dbContext = (dbContext || '') + kbResult.context;
                kbHitCount = kbResult.hitCount;
                console.log(`[AI KB] 📚 Found ${kbResult.hitCount} relevant knowledge articles for intent: ${intent}`);
            }
        }
        catch (kbErr) {
            // Non-critical — don't break the response if KB search fails
            console.warn('[AI KB] Search error (non-blocking):', kbErr);
        }
        console.log(`[AI Chat] DB Context (${(dbContext === null || dbContext === void 0 ? void 0 : dbContext.length) || 0} chars, KB: ${kbHitCount} hits): ${(dbContext === null || dbContext === void 0 ? void 0 : dbContext.substring(0, 120)) || '(empty)'}...`);
        // 3. Generate structured response blocks from raw data
        const blocks = buildResponseBlocks(intent, dbContext, contextResult);
        if (contextResult.suggestions && contextResult.suggestions.length > 0) {
            // Push dynamic suggestions to the front or replace existing suggested_actions
            const existingSuggestions = blocks.find(b => b.type === 'suggested_actions');
            if (existingSuggestions) {
                existingSuggestions.data = [...contextResult.suggestions, ...existingSuggestions.data].slice(0, 4);
            }
            else {
                blocks.push({ type: 'suggested_actions', data: contextResult.suggestions });
            }
        }
        // 4. Build conversation messages
        const contents = [];
        // Add history from DB
        const userId = ((_c = req.user) === null || _c === void 0 ? void 0 : _c.id) || 'unknown';
        const isFastProvider = provider === 'groq' || provider === 'openrouter';
        const limit = isFastProvider ? AI_CONSTANTS.MAX_HISTORY_FAST : AI_CONSTANTS.MAX_HISTORY_SLOW;
        let historyLoaded = false;
        try {
            const [historyRows] = yield db_1.pool.query(`SELECT role, message FROM ai_chat_messages
                 WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`, [userId, limit]);
            const dbHistory = historyRows.reverse().map((r) => ({
                role: r.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: r.message }]
            }));
            if (dbHistory.length > 0) {
                contents.push(...dbHistory);
                historyLoaded = true;
            }
        }
        catch (e) {
            console.warn('[AI Chat] Could not load DB history', e);
        }
        // Fallback to frontend history ONLY if DB load failed or returned nothing
        if (!historyLoaded && Array.isArray(history)) {
            const recentHistory = history.slice(-limit);
            for (const msg of recentHistory) {
                contents.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                });
            }
        }
        // Add current message with context
        let contextSection = '';
        if (dbContext) {
            contextSection += `\n\n=== بيانات النظام الحقيقية (هذه هي البيانات الوحيدة المسموح لك باستخدامها) ===\n${dbContext}\n=== نهاية البيانات ===\n⛔ تحذير: أي رقم تكتبه غير موجود أعلاه يعتبر كذب. إذا البيانات تقول الرصيد 0 فالرصيد 0. لا تخترع أرقاماً.`;
        }
        else if (intent !== 'general') {
            contextSection += `\n\n⚠️ لم يتم العثور على بيانات لهذا الاستعلام في قاعدة البيانات. أجب بأنك لم تجد بيانات. لا تخترع أي أرقام.`;
        }
        if ((_d = (req.body.uiContext || uiContext)) === null || _d === void 0 ? void 0 : _d.pathname) {
            const ctx = req.body.uiContext || uiContext;
            contextSection += `\n\n--- الشاشة الحالية للمستخدم ---\nالرابط الحالي: ${ctx.pathname}${ctx.hash || ''}\n(استخدم هذه المعلومة لتقديم مساعدة سياقية إذا سأل المستخدم عن "هذه الصفحة" أو أراد مساعدة حول ما يراه أمامه الآن).`;
        }
        // Add session memory context for the LLM
        if (session === null || session === void 0 ? void 0 : session.lastPartnerName) {
            contextSection += `\n\n--- سياق المحادثة السابقة ---\nالعميل/المورد السابق: ${session.lastPartnerName}\nالموضوع السابق: ${session.lastIntent}`;
        }
        const userPrompt = contextSection
            ? `${message}${contextSection}`
            : message;
        const userParts = [{ text: userPrompt }];
        // ============================================
        // VISION: MULTIMODAL IMAGE SUPPORT
        // ============================================
        if (req.body.image) {
            const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, "");
            const mimeType = ((_e = req.body.image.match(/^data:(image\/\w+);base64,/)) === null || _e === void 0 ? void 0 : _e[1]) || "image/jpeg";
            userParts.push({
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            });
            // Provide explicit instruction for image processing
            userParts[0].text = `[تم إرفاق صورة مع هذه الرسالة. إذا كانت فاتورة مشتريات أو مبيعات، قم بقراءة بياناتها بعناية (الأصناف، الكميات، الأسعار، والإجمالي) وساعد المستخدم في تسجيلها أو تحليلها.]\n\n` + userParts[0].text;
        }
        contents.push({ role: 'user', parts: userParts });
        // 5. Call AI model — provider-specific optimizations
        const isDataQuery = ['customer_balance', 'customer_statement', 'supplier_balance', 'supplier_statement', 'sales_report', 'purchases', 'inventory', 'treasury', 'cheques', 'production', 'hr', 'invoice_lookup', 'product_search', 'accounting', 'comparative', 'aging', 'cashflow', 'inventory_intelligence'].includes(intent);
        // Groq/OpenRouter are fast enough for larger outputs; Gemini free tier needs smaller limits
        const maxTokens = isFastProvider ? AI_CONSTANTS.MAX_TOKENS_FAST : AI_CONSTANTS.MAX_TOKENS_SLOW;
        // Apply context window guard to prevent exceeding model limits
        const guarded = guardContextWindow(SYSTEM_PROMPT, dbContext || '', contents, modelId);
        if (guarded.context !== dbContext && dbContext) {
            console.log(`[AI Guard] ⚠️ Context truncated for model ${modelId} (${estimateTokens(dbContext || '')} → ${estimateTokens(guarded.context)} tokens)`);
        }
        // Replace contents with guarded history (preserving user message at end)
        const userMessage = contents[contents.length - 1];
        contents.length = 0;
        contents.push(...guarded.history, userMessage);
        // 4-tier temperature system: factual → advisory → casual → creative
        const temperature = isDataQuery ? 0.1
            : intent === 'chitchat' ? 0.85
                : (intent === 'general' || intent === 'app_guide' || intent === 'help') ? 0.7
                    : 0.4;
        // ============================================
        // PHASE 1: USER PROFILING & DEEP PERSONALIZATION
        // ============================================
        let dynamicSystemPrompt = SYSTEM_PROMPT;
        // Multi-Language Auto-Detection
        const lang = detectLanguage(message);
        const langInstruction = lang === 'en'
            ? 'Respond in English only.'
            : lang === 'mixed'
                ? 'The user mixes Arabic and English. Match their style naturally.'
                : 'رد بالعربية فقط — العامية المصرية مقبولة.';
        dynamicSystemPrompt += `\n\n[Language Instruction]: ${langInstruction}\n`;
        try {
            const user = req.user;
            // ── INJECT BUSINESS PROFILE & PROACTIVE INSIGHTS ──
            const businessProfile = yield getBusinessProfile();
            const proactiveInsights = yield getProactiveInsights();
            dynamicSystemPrompt = SYSTEM_PROMPT + `\n${businessProfile}\n${proactiveInsights}`;
            // ── LIVE CONTEXT INJECTION (Pulse Check) ──
            const [quickStats] = yield db_1.pool.query(`SELECT 
                    (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE type IN ('SALE','INVOICE_SALE') AND status IN ('POSTED','COMPLETED','PARTIAL') AND DATE(date) = CURDATE()) as todaySales,
                    (SELECT COUNT(*) FROM invoices WHERE status = 'DRAFT') as openDrafts,
                    (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE type IN ('PURCHASE','INVOICE_PURCHASE') AND status IN ('POSTED','COMPLETED','PARTIAL') AND DATE(date) = CURDATE()) as todayPurchases`);
            const qs = quickStats[0] || {};
            if (user) {
                const userRole = user.role === 'admin' ? 'المدير العام / صاحب العمل' : (user.role || 'مستخدم');
                const userName = user.name || user.username || 'يا فندم';
                const profileAddition = `\n\n=== ملف المستخدم والنبض المالي الحي ===
أنت تتحدث الآن مع: ${userName}
المنصب/الصلاحية: ${userRole}
التاريخ الحالي: ${new Date().toLocaleDateString('ar-EG')}

[النبض المالي الحي (مؤشرات اليوم)]:
- مبيعات اليوم: ${Number(qs.todaySales || 0).toLocaleString('ar-EG')} جنيه
- مشتريات اليوم: ${Number(qs.todayPurchases || 0).toLocaleString('ar-EG')} جنيه
- عدد الفواتير المعلقة (Draft): ${qs.openDrafts || 0} فاتورة

[التعليمات الخاصة بك]:
1. خاطبه باسمه (${userName}) فقط في أول رسالة. في باقي المحادثة ادخل في الموضوع مباشرة.
2. حافظ على تركيزك المطلق على كفاءة الأعمال. لا تستخدم الفكاهة الساذجة.
3. إذا وجه لك أمراً أو استفساراً، تعامل معه كأنك مستشاره التنفيذي الذكي الذي لا يخيب ظنه.
4. يمكنك استخدام "النبض المالي الحي" أعلاه لإبقاء إجاباتك مرتبطة بالواقع المالي لليوم إذا لزم الأمر — لكن لا تكرره في كل رد.
===================\n`;
                // Inject right after the first line
                dynamicSystemPrompt = dynamicSystemPrompt.replace(`المساعد الذكي لنظام ${brandConfig_1.SERVER_BRAND.name}`, `المساعد الذكي لنظام ${brandConfig_1.SERVER_BRAND.name}${profileAddition}`);
            }
        }
        catch (e) {
            // fallback to default if user object is malformed
            console.warn(`[AI Chat] Error building dynamic prompt:`, e);
        }
        if (isDataQuery) {
            dynamicSystemPrompt += `\n\nقبل ما تجاوب، فكر بصوت عالٍ في خطوات:
<thinking>
1. المستخدم بيسأل عن...
2. البيانات اللي عندي بتقول...
3. المشكلة الحقيقية هي...
4. إذن الإجابة المفيدة هي...
</thinking>

بعد التفكير، اجب بشكل مباشر ومفيد بدون ذكر الـ thinking.`;
        }
        if (req.body.stream) {
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            const navigation = buildNavigationLinks(intent, responsePartnerId, dbContext);
            // ── SMART CACHE: Check for cached response ──
            const cacheKey = getCacheKey(intent, message, responsePartnerId || ((_f = (req.body.uiContext || uiContext)) === null || _f === void 0 ? void 0 : _f.partnerId));
            const cachedEntry = isDataQuery ? getCachedResponse(cacheKey) : null;
            if (cachedEntry) {
                console.log(`[AI Chat] \u26a1 Cache HIT for ${intent} \u2014 serving instantly`);
                logUsage(userId, provider, modelId, intent, message, cachedEntry.response, Date.now() - requestStartTime, true, false);
                res.write(`data: ${JSON.stringify({ type: 'start', intent, partnerId: responsePartnerId || ((_g = (req.body.uiContext || uiContext)) === null || _g === void 0 ? void 0 : _g.partnerId), blocks, navigation: cachedEntry.navigation || navigation, hasMemory: !!session, cached: true })}\n\n`);
                // Stream cached response in chunks for natural feel
                const words = cachedEntry.response.split(/(?<=\s)/);
                for (let i = 0; i < words.length; i += 3) {
                    const chunk = words.slice(i, i + 3).join('');
                    res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
                }
                // Update session
                updateSession(sessionId, {
                    lastIntent: intent,
                    lastPartnerId: responsePartnerId || (session === null || session === void 0 ? void 0 : session.lastPartnerId),
                    lastPartnerName: extractPartnerNameFromContext(dbContext) || (session === null || session === void 0 ? void 0 : session.lastPartnerName),
                    lastEntityType: intent.startsWith('customer') ? 'customer' : intent.startsWith('supplier') ? 'supplier' : session === null || session === void 0 ? void 0 : session.lastEntityType,
                    userName: ((_h = req.user) === null || _h === void 0 ? void 0 : _h.name) || (session === null || session === void 0 ? void 0 : session.userName),
                    conversationTone: detectLanguage(message),
                    lastTopic: intent !== 'chitchat' ? intent : session === null || session === void 0 ? void 0 : session.lastTopic,
                });
                res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
                res.end();
                return;
            }
            res.write(`data: ${JSON.stringify({ type: 'start', intent, partnerId: responsePartnerId || ((_j = (req.body.uiContext || uiContext)) === null || _j === void 0 ? void 0 : _j.partnerId), blocks, navigation, hasMemory: !!session })}\n\n`);
            let fullText = '';
            let usedProvider = provider;
            try {
                const { result, usedProvider: actualProvider } = yield generateWithFailover(modelId, {
                    contents,
                    config: {
                        systemInstruction: dynamicSystemPrompt,
                        maxOutputTokens: maxTokens,
                        temperature,
                    },
                    onChunk: (chunk) => {
                        fullText += chunk;
                        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
                    }
                });
                usedProvider = actualProvider;
                if (usedProvider !== provider) {
                    console.log(`[AI Failover] ✅ Request served by fallback provider: ${usedProvider} (primary: ${provider})`);
                }
            }
            catch (e) {
                logUsage(userId, provider, modelId, intent, message, '', Date.now() - requestStartTime, false, true);
                res.write(`data: ${JSON.stringify({ type: 'error', error: e.message || 'Stream error' })}\n\n`);
                res.end();
                return;
            }
            // Update conversation memory
            updateSession(sessionId, {
                lastIntent: intent,
                lastPartnerId: responsePartnerId || (session === null || session === void 0 ? void 0 : session.lastPartnerId),
                lastPartnerName: extractPartnerNameFromContext(dbContext) || (session === null || session === void 0 ? void 0 : session.lastPartnerName),
                lastEntityType: intent.startsWith('customer') ? 'customer' : intent.startsWith('supplier') ? 'supplier' : session === null || session === void 0 ? void 0 : session.lastEntityType,
                userName: ((_k = req.user) === null || _k === void 0 ? void 0 : _k.name) || (session === null || session === void 0 ? void 0 : session.userName),
                conversationTone: detectLanguage(message),
                lastTopic: intent !== 'chitchat' ? intent : session === null || session === void 0 ? void 0 : session.lastTopic,
            });
            // ── SMART CACHE: Store response for future hits ──
            if (isDataQuery && fullText.length > 20) {
                setCachedResponse(cacheKey, {
                    response: fullText,
                    blocks,
                    navigation,
                    partnerId: responsePartnerId,
                });
            }
            // Log interaction with session threading + provider tracking
            const latencyMs = Date.now() - requestStartTime;
            logUsage(userId, usedProvider, modelId, intent, message, fullText, latencyMs, false, false);
            db_1.pool.query(`INSERT INTO ai_chat_messages (id, userId, role, message, intent, contextSummary, sessionId, provider, model, createdAt)
                 VALUES (UUID(), ?, 'user', ?, ?, ?, ?, ?, ?, NOW())`, [userId, message.substring(0, 500), intent, dbContext ? dbContext.substring(0, 200) : null, sessionId, usedProvider, modelId]).catch(() => { });
            db_1.pool.query(`INSERT INTO ai_chat_messages (id, userId, role, message, intent, sessionId, provider, model, createdAt)
                 VALUES (UUID(), ?, 'assistant', ?, ?, ?, ?, ?, NOW())`, [userId, fullText.substring(0, 5000), intent, sessionId, usedProvider, modelId]).catch(() => { });
            res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
            res.end();
            return;
        }
        const { result: response, usedProvider } = yield generateWithFailover(modelId, {
            contents,
            config: {
                systemInstruction: dynamicSystemPrompt,
                maxOutputTokens: maxTokens,
                temperature,
            },
        });
        if (usedProvider !== provider) {
            console.log(`[AI Failover] ✅ Non-streaming served by: ${usedProvider} (primary: ${provider})`);
        }
        const text = response.text || 'عذراً، لم أتمكن من إنشاء رد. حاول مرة أخرى.';
        // 6. Update conversation memory
        updateSession(sessionId, {
            lastIntent: intent,
            lastPartnerId: responsePartnerId || (session === null || session === void 0 ? void 0 : session.lastPartnerId),
            lastPartnerName: extractPartnerNameFromContext(dbContext) || (session === null || session === void 0 ? void 0 : session.lastPartnerName),
            lastEntityType: intent.startsWith('customer') ? 'customer' : intent.startsWith('supplier') ? 'supplier' : session === null || session === void 0 ? void 0 : session.lastEntityType,
            userName: ((_l = req.user) === null || _l === void 0 ? void 0 : _l.name) || (session === null || session === void 0 ? void 0 : session.userName),
            conversationTone: detectLanguage(message),
            lastTopic: intent !== 'chitchat' ? intent : session === null || session === void 0 ? void 0 : session.lastTopic,
        });
        // 7. Log interaction with session threading + provider tracking
        const latencyMs = Date.now() - requestStartTime;
        logUsage(userId, usedProvider, modelId, intent, message, text, latencyMs, false, false);
        db_1.pool.query(`INSERT INTO ai_chat_messages (id, userId, role, message, intent, contextSummary, sessionId, provider, model, createdAt)
             VALUES (UUID(), ?, 'user', ?, ?, ?, ?, ?, ?, NOW())`, [userId, message.substring(0, 500), intent, dbContext ? dbContext.substring(0, 200) : null, sessionId, usedProvider, modelId]).catch(() => { });
        db_1.pool.query(`INSERT INTO ai_chat_messages (id, userId, role, message, intent, sessionId, provider, model, createdAt)
             VALUES (UUID(), ?, 'assistant', ?, ?, ?, ?, ?, NOW())`, [userId, text.substring(0, 5000), intent, sessionId, usedProvider, modelId]).catch(() => { });
        if (res.headersSent)
            return; // Guard: timeout middleware may have already responded
        // Build navigation links for deep-linking
        const navigation = buildNavigationLinks(intent, responsePartnerId, dbContext);
        res.json({
            reply: text,
            intent,
            model: modelId,
            partnerId: responsePartnerId || ((_m = (req.body.uiContext || uiContext)) === null || _m === void 0 ? void 0 : _m.partnerId),
            blocks, // Structured visual blocks for the frontend
            navigation, // Deep navigation links
            hasMemory: !!session,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        if (res.headersSent)
            return; // Guard: don't send twice
        console.error('🤖 AI Chat Error:', (error === null || error === void 0 ? void 0 : error.message) || error);
        // Handle specific Gemini errors
        if ((_o = error === null || error === void 0 ? void 0 : error.message) === null || _o === void 0 ? void 0 : _o.includes('API key')) {
            return res.status(503).json({ error: 'مفتاح API غير صالح. تحقق من الإعدادات.', needsApiKey: true });
        }
        if (((_p = error === null || error === void 0 ? void 0 : error.message) === null || _p === void 0 ? void 0 : _p.includes('quota')) || ((_q = error === null || error === void 0 ? void 0 : error.message) === null || _q === void 0 ? void 0 : _q.includes('429'))) {
            return res.status(429).json({ error: 'تم تجاوز الحد المجاني. حاول بعد دقيقة.' });
        }
        if (((_r = error === null || error === void 0 ? void 0 : error.message) === null || _r === void 0 ? void 0 : _r.includes('Internal error')) || (error === null || error === void 0 ? void 0 : error.status) === 500) {
            return res.status(500).json({ error: `خطأ من سيرفر Gemini. النموذج "${_selectedModel}" قد لا يكون مدعوماً. جرب: gemma-4-31b-it أو gemini-2.5-flash` });
        }
        if (((_s = error === null || error === void 0 ? void 0 : error.message) === null || _s === void 0 ? void 0 : _s.includes('not found')) || (error === null || error === void 0 ? void 0 : error.status) === 404) {
            return res.status(404).json({ error: `النموذج "${_selectedModel}" غير موجود. اختر نموذج صحيح من الإعدادات (مثال: gemma-4-31b-it أو gemini-2.5-flash).` });
        }
        return (0, errorHandler_1.handleControllerError)(res, error, 'AI Chat');
    }
});
exports.handleAIChat = handleAIChat;
function buildResponseBlocks(intent, dbContext, contextResult) {
    if (!dbContext)
        return [];
    const blocks = [];
    try {
        // Extract numbers from context for metric cards
        const numbers = extractNumbersFromContext(dbContext);
        switch (intent) {
            case 'sales_report': {
                const totalMatch = dbContext.match(/إجمالي.*?المبيعات.*?([٠-٩\d,\.]+)/);
                const countMatch = dbContext.match(/(\d+)\s*فاتورة/);
                if (totalMatch || countMatch) {
                    blocks.push({
                        type: 'metric_cards',
                        data: [
                            totalMatch ? { label: 'إجمالي المبيعات', value: totalMatch[1], icon: '📈', format: 'currency' } : null,
                            countMatch ? { label: 'عدد الفواتير', value: countMatch[1], icon: '🧾', format: 'number' } : null,
                        ].filter(Boolean)
                    });
                }
                // Extract top products/customers tables
                const topSection = dbContext.match(/أعلى.*?منتجات.*?مبيعاً:?\n([\s\S]*?)(?:\n\n|أعلى|$)/i);
                if (topSection) {
                    const rows = topSection[1].split('\n').filter((l) => l.trim().startsWith('-') || l.trim().startsWith('•')).map((l) => l.replace(/^[\s\-•]+/, '').trim()).filter(Boolean);
                    if (rows.length > 0) {
                        blocks.push({ type: 'table', title: 'أعلى المنتجات مبيعاً', data: { rows: rows.map((r) => ({ name: r })) } });
                    }
                }
                break;
            }
            case 'customer_balance':
            case 'supplier_balance': {
                const balanceMatch = dbContext.match(/الرصيد.*?([٠-٩\d,\.]+)/);
                if (contextResult.partnerId) {
                    blocks.push({
                        type: 'partner_card',
                        data: {
                            partnerId: contextResult.partnerId,
                            balance: balanceMatch ? balanceMatch[1] : '0',
                            type: intent === 'customer_balance' ? 'customer' : 'supplier'
                        }
                    });
                }
                break;
            }
            case 'aging': {
                blocks.push({
                    type: 'alert',
                    data: { severity: 'warning', message: 'تقرير أعمار الديون يعرض العملاء المتأخرين في السداد' }
                });
                break;
            }
            case 'treasury': {
                const cashMatch = dbContext.match(/رصيد.*?(?:الخزينة|النقدي|الصندوق).*?([٠-٩\d,\.]+)/);
                if (cashMatch) {
                    blocks.push({
                        type: 'metric_cards',
                        data: [{ label: 'رصيد الخزينة', value: cashMatch[1], icon: '💰', format: 'currency' }]
                    });
                }
                break;
            }
            case 'inventory': {
                const lowStockMatch = dbContext.match(/تحت الحد.*?(\d+)/);
                const totalItemsMatch = dbContext.match(/(\d+)\s*صنف/);
                if (lowStockMatch || totalItemsMatch) {
                    blocks.push({
                        type: 'metric_cards',
                        data: [
                            lowStockMatch ? { label: 'أصناف تحت الحد', value: lowStockMatch[1], icon: '⚠️', format: 'number' } : null,
                            totalItemsMatch ? { label: 'إجمالي الأصناف', value: totalItemsMatch[1], icon: '📦', format: 'number' } : null,
                        ].filter(Boolean)
                    });
                }
                break;
            }
        }
        // Add suggested follow-up actions
        const suggestions = getSuggestedFollowUps(intent, dbContext);
        if (suggestions.length > 0) {
            blocks.push({ type: 'suggested_actions', data: suggestions });
        }
    }
    catch (e) {
        // Block generation should never crash the response
        console.warn('[AI Blocks] Error generating blocks:', e);
    }
    return blocks;
}
function extractNumbersFromContext(text) {
    const nums = {};
    const patterns = [
        { key: 'total', regex: /إجمالي.*?([٠-٩\d,\.]+)\s*جنيه/ },
        { key: 'count', regex: /(\d+)\s*فاتورة/ },
        { key: 'balance', regex: /الرصيد.*?([٠-٩\d,\.]+)/ },
    ];
    for (const { key, regex } of patterns) {
        const m = text.match(regex);
        if (m)
            nums[key] = parseFloat(m[1].replace(/,/g, ''));
    }
    return nums;
}
function extractPartnerNameFromContext(dbContext) {
    if (!dbContext)
        return undefined;
    // Match "كشف حساب العميل: NAME" or "رصيد العميل NAME"
    const m = dbContext.match(/(?:كشف حساب|رصيد)\s*(?:العميل|المورد)[:\s]+([^\n]+)/);
    return m ? m[1].trim() : undefined;
}
// ── SMART DATA-DRIVEN FOLLOW-UPS ─────────────────────────
function getSuggestedFollowUps(intent, dbContext) {
    const suggestions = [];
    const ctx = dbContext || '';
    switch (intent) {
        case 'sales_report': {
            // If sales declined → suggest investigation
            if (ctx.includes('📉') || ctx.includes('تراجع')) {
                suggestions.push({ text: 'ليه المبيعات نزلت؟ حلل الأسباب', icon: '🔍' });
            }
            // If concentration risk detected
            if (ctx.includes('تنبيه تركز')) {
                suggestions.push({ text: 'تفاصيل أعلى عميل', icon: '⚠️' });
            }
            suggestions.push({ text: 'قارن بالشهر اللي فات', icon: '📊' });
            suggestions.push({ text: 'المبيعات النقدية vs الآجل', icon: '💳' });
            suggestions.push({ text: 'أعلى 10 عملاء', icon: '👥' });
            break;
        }
        case 'customer_balance': {
            suggestions.push({ text: 'كشف حساب تفصيلي', icon: '📄' });
            suggestions.push({ text: 'أعمار الديون', icon: '⏰' });
            // If high balance detected
            if (ctx.match(/الرصيد.*?[\d,]{6,}/)) {
                suggestions.push({ text: 'خطة تحصيل مقترحة', icon: '💡' });
            }
            break;
        }
        case 'customer_statement': {
            suggestions.push({ text: 'ملخص الرصيد فقط', icon: '💰' });
            suggestions.push({ text: 'أعمار الديون', icon: '⏰' });
            break;
        }
        case 'purchases': {
            suggestions.push({ text: 'قارن بالشهر اللي فات', icon: '📊' });
            if (ctx.includes('تنبيه')) {
                suggestions.push({ text: 'تنويع الموردين', icon: '🏭' });
            }
            suggestions.push({ text: 'أعلى الموردين شراءً', icon: '🏭' });
            break;
        }
        case 'inventory': {
            // If out of stock detected
            if (ctx.includes('نفدت') || ctx.includes('🔴')) {
                suggestions.push({ text: 'أصناف نفدت — محتاج أشتري', icon: '🛒' });
            }
            suggestions.push({ text: 'أصناف بطيئة الحركة', icon: '🐌' });
            suggestions.push({ text: 'أصناف قربت تخلص', icon: '⏳' });
            break;
        }
        case 'treasury': {
            suggestions.push({ text: 'شيكات مستحقة اليوم', icon: '📋' });
            suggestions.push({ text: 'توقع التدفق النقدي', icon: '💸' });
            break;
        }
        case 'cheques': {
            if (ctx.includes('مستحقة')) {
                suggestions.push({ text: 'تفاصيل الشيكات المتأخرة', icon: '⚠️' });
            }
            suggestions.push({ text: 'رصيد الخزينة', icon: '💰' });
            break;
        }
        case 'comparative': {
            if (ctx.includes('تراجع') || ctx.includes('📉')) {
                suggestions.push({ text: 'أسباب التراجع — أعلى المنتجات', icon: '🔍' });
            }
            suggestions.push({ text: 'توقع التدفق النقدي', icon: '💸' });
            suggestions.push({ text: 'أعمار الديون', icon: '⏰' });
            break;
        }
        case 'aging': {
            suggestions.push({ text: 'كشف حساب أكبر مدين', icon: '📄' });
            suggestions.push({ text: 'توقع التدفق النقدي', icon: '💸' });
            break;
        }
        case 'cashflow': {
            if (ctx.includes('خطر') || ctx.includes('🔴')) {
                suggestions.push({ text: 'أكبر المدينين — للتحصيل', icon: '👥' });
            }
            suggestions.push({ text: 'شيكات مستحقة', icon: '📋' });
            suggestions.push({ text: 'أرصدة العملاء', icon: '👥' });
            break;
        }
        case 'accounting': {
            suggestions.push({ text: 'تقرير المبيعات', icon: '📊' });
            suggestions.push({ text: 'توقع التدفق النقدي', icon: '💸' });
            break;
        }
        case 'supplier_balance': {
            suggestions.push({ text: 'كشف حساب تفصيلي', icon: '📄' });
            suggestions.push({ text: 'تقرير المشتريات', icon: '🛒' });
            break;
        }
        default: {
            // General fallback
            suggestions.push({ text: 'مبيعات اليوم', icon: '📊' });
            suggestions.push({ text: 'رصيد الخزينة', icon: '💰' });
        }
    }
    return suggestions.slice(0, 4); // Max 4 suggestions
}
// ── CHAT HISTORY ─────────────────────────────────────────
const getChatHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    try {
        const [rows] = yield db_1.pool.query(`SELECT role, message, intent, createdAt FROM ai_chat_messages 
             WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`, [userId, limit]);
        res.json(rows.reverse());
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'Chat History');
    }
});
exports.getChatHistory = getChatHistory;
// ── SUGGESTED QUESTIONS ──────────────────────────────────
const getSuggestedQuestions = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json([
        { text: 'كم مبيعات اليوم؟', icon: '📊' },
        { text: 'قارن مبيعات الشهر بالشهر اللي فات', icon: '📊' },
        { text: 'مين العملاء المتأخرين في السداد؟', icon: '⏰' },
        { text: 'توقع التدفق النقدي الأسبوع الجاي', icon: '💸' },
        { text: 'أصناف بطيئة الحركة والراكدة', icon: '🔍' },
        { text: 'أرصدة العملاء المدينين', icon: '👥' },
        { text: 'رصيد الخزينة', icon: '💰' },
        { text: 'شيكات مستحقة اليوم', icon: '📋' },
        { text: 'مبيعات شهر 4', icon: '📈' },
        { text: 'أصناف تحت الحد الأدنى', icon: '📦' },
        { text: 'كشف حساب عميل', icon: '📄' },
        { text: 'ملخص الحسابات', icon: '🏦' },
        { text: 'كيف أسجل فاتورة جديدة؟', icon: '❓' },
    ]);
});
exports.getSuggestedQuestions = getSuggestedQuestions;
// ═══════════════════════════════════════════════════════════
// DEEP NAVIGATION LINKS — Clickable buttons in AI responses
// ═══════════════════════════════════════════════════════════
function buildNavigationLinks(intent, partnerId, dbContext) {
    const links = [];
    // Partner-specific navigation
    if (partnerId) {
        if (intent === 'customer_balance' || intent === 'customer_statement') {
            links.push({ label: 'فتح كشف حساب العميل', viewId: `cust-statement|${partnerId}`, icon: '📄' });
            links.push({ label: 'صفحة العميل', viewId: `customers|${partnerId}`, icon: '👤' });
        }
        if (intent === 'supplier_balance' || intent === 'supplier_statement') {
            links.push({ label: 'فتح كشف حساب المورد', viewId: `sup-statement|${partnerId}`, icon: '📄' });
            links.push({ label: 'صفحة المورد', viewId: `suppliers|${partnerId}`, icon: '🏭' });
        }
    }
    // Intent-specific navigation
    switch (intent) {
        case 'sales_report':
            links.push({ label: 'فتح صفحة الفواتير', viewId: 'invoices', icon: '🧾' });
            break;
        case 'purchases':
            links.push({ label: 'فتح صفحة المشتريات', viewId: 'purchases', icon: '🛒' });
            break;
        case 'inventory':
        case 'inventory_intelligence':
            links.push({ label: 'فتح المخزون', viewId: 'inventory', icon: '📦' });
            break;
        case 'treasury':
        case 'cashflow':
            links.push({ label: 'فتح الخزينة', viewId: 'treasury', icon: '💰' });
            break;
        case 'cheques':
            links.push({ label: 'فتح إدارة الشيكات', viewId: 'cheques', icon: '📋' });
            break;
        case 'accounting':
            links.push({ label: 'فتح الحسابات', viewId: 'accounting', icon: '🏦' });
            break;
        case 'aging':
            links.push({ label: 'فتح أرصدة العملاء', viewId: 'customers', icon: '👥' });
            break;
    }
    return links.slice(0, 3); // Max 3 links
}
// ═══════════════════════════════════════════════════════════
// PROACTIVE BUSINESS PULSE — Auto-show alerts on chat open
// ═══════════════════════════════════════════════════════════
const getBusinessPulse = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const alerts = [];
        const currentHash = req.query.hash;
        // ============================================
        // PAGE-AWARE COPILOT (Contextual Alerts)
        // ============================================
        if (currentHash) {
            const hashParts = currentHash.replace('#', '').split('|');
            const viewId = hashParts[0];
            const entityId = hashParts[1];
            if (viewId === 'invoices' && entityId) {
                alerts.push({
                    icon: '👀',
                    text: `أنا شايفك بتراجع فاتورة رقم ${entityId}، تحب أراجعها معاك؟`,
                    query: `راجع الفاتورة رقم ${entityId} واديني ملخص عنها`,
                    severity: 'info'
                });
            }
            else if (viewId === 'purchases' && entityId) {
                alerts.push({
                    icon: '📦',
                    text: `هل محتاج مساعدة في فاتورة المشتريات رقم ${entityId}؟`,
                    query: `راجع فاتورة المشتريات رقم ${entityId}`,
                    severity: 'info'
                });
            }
            else if (viewId === 'inventory') {
                alerts.push({
                    icon: '🏭',
                    text: `إنت في المخزن.. تحب أجيبلك النواقص أو الرواكد؟`,
                    query: `النواقص والأصناف اللي هتنتهي قريباً من المخزن`,
                    severity: 'info'
                });
            }
            else if (viewId === 'treasury') {
                alerts.push({
                    icon: '💰',
                    text: `إنت في الخزنة.. تحب أعرض لك ملخص التدفقات النقدية؟`,
                    query: `ملخص حركة الخزينة والسيولة اليوم`,
                    severity: 'info'
                });
            }
            else if (['cust-statement', 'customers'].includes(viewId)) {
                alerts.push({
                    icon: '👥',
                    text: `هل عايز تقرير سريع عن العملاء المديونين؟`,
                    query: `أعلى 5 عملاء عليهم مديونيات متأخرة`,
                    severity: 'info'
                });
            }
        }
        // Run all pulse queries in parallel for speed
        const [salesRows, chequeRows, oosRows, lowRows, topDebtorRows] = yield Promise.all([
            db_1.pool.query(`SELECT COUNT(*) as c, COALESCE(SUM(total),0) as t FROM invoices 
                WHERE type IN ('SALE','INVOICE_SALE') AND status IN ('POSTED','COMPLETED','PARTIAL') AND DATE(date) = CURDATE()`),
            db_1.pool.query(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM cheques 
                WHERE status='PENDING' AND dueDate <= CURDATE()`),
            db_1.pool.query(`SELECT COUNT(*) as c FROM products WHERE isActive=TRUE AND stock <= 0 AND minStock > 0`),
            db_1.pool.query(`SELECT COUNT(*) as c FROM products WHERE isActive=TRUE AND stock > 0 AND stock <= minStock AND minStock > 0`),
            db_1.pool.query(`SELECT p.name, ${REALTIME_BALANCE_EXPR} as balance
                FROM partners p 
                WHERE (p.isCustomer=TRUE OR p.type='CUSTOMER' OR p.type='BOTH')
                HAVING balance > 0
                ORDER BY balance DESC LIMIT 1`),
        ]);
        // 1. Today's sales
        const sales = salesRows[0][0];
        const salesTotal = Number(sales.t);
        alerts.push({
            icon: salesTotal > 0 ? '📈' : '📊',
            text: `مبيعات اليوم: ${salesTotal.toLocaleString('ar-EG')} جنيه (${sales.c} فاتورة)`,
            query: 'كم مبيعات اليوم؟'
        });
        // 2. Overdue cheques
        const cheques = chequeRows[0][0];
        if (Number(cheques.c) > 0) {
            alerts.push({
                icon: '⚠️',
                text: `${cheques.c} شيكات مستحقة (${Number(cheques.t).toLocaleString('ar-EG')} جنيه)`,
                query: 'شيكات مستحقة اليوم',
                severity: 'warning'
            });
        }
        // 3. Out of stock
        const oos = oosRows[0][0];
        if (Number(oos.c) > 0) {
            alerts.push({
                icon: '🔴',
                text: `${oos.c} أصناف نفدت من المخزون`,
                query: 'أصناف نفدت من المخزون',
                severity: 'danger'
            });
        }
        // 4. Low stock
        const low = lowRows[0][0];
        if (Number(low.c) > 0) {
            alerts.push({
                icon: '🟡',
                text: `${low.c} أصناف تحت الحد الأدنى`,
                query: 'أصناف تحت الحد الأدنى',
                severity: 'warning'
            });
        }
        // 5. Top debtor
        const topDebtor = topDebtorRows[0][0];
        if (topDebtor && Number(topDebtor.balance) > 50000) {
            alerts.push({
                icon: '👤',
                text: `أعلى مدين: ${topDebtor.name} (${Number(topDebtor.balance).toLocaleString('ar-EG')} جنيه)`,
                query: `رصيد ${topDebtor.name}`
            });
        }
        res.json({
            alerts,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('[AI Pulse] Error:', error === null || error === void 0 ? void 0 : error.message);
        res.json({ alerts: [], timestamp: new Date().toISOString() });
    }
});
exports.getBusinessPulse = getBusinessPulse;
// ═══════════════════════════════════════════════════════════
// FEEDBACK ENDPOINT — Response quality tracking
// ═══════════════════════════════════════════════════════════
const handleAIFeedback = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { messageId, feedback, feedbackNote } = req.body;
        if (!messageId || !feedback || !['positive', 'negative', 'corrected'].includes(feedback)) {
            return res.status(400).json({ error: 'messageId and valid feedback (positive/negative/corrected) required' });
        }
        yield db_1.pool.query(`UPDATE ai_chat_messages SET feedback = ?, feedbackNote = ? WHERE id = ?`, [feedback, feedbackNote || null, messageId]);
        console.log(`[AI Feedback] ${feedback} on message ${messageId}`);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[AI Feedback] Error:', error === null || error === void 0 ? void 0 : error.message);
        res.status(500).json({ error: 'Failed to save feedback' });
    }
});
exports.handleAIFeedback = handleAIFeedback;
// ═══════════════════════════════════════════════════════════
// USAGE STATS ENDPOINT — Token & cost analytics (Admin)
// ═══════════════════════════════════════════════════════════
const handleAIUsageStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const days = parseInt(req.query.days) || 7;
        // Overall stats
        const [overallRows] = yield db_1.pool.query(`
            SELECT 
                COUNT(*) as totalRequests,
                SUM(inputTokensEst) as totalInputTokens,
                SUM(outputTokensEst) as totalOutputTokens,
                ROUND(AVG(latencyMs)) as avgLatencyMs,
                SUM(CASE WHEN cached = TRUE THEN 1 ELSE 0 END) as cacheHits,
                SUM(CASE WHEN error = TRUE THEN 1 ELSE 0 END) as errorCount,
                ROUND(SUM(CASE WHEN cached = TRUE THEN 1 ELSE 0 END) / GREATEST(COUNT(*), 1) * 100, 1) as cacheHitRate
            FROM ai_usage_log 
            WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
        `, [days]);
        // Per-provider breakdown
        const [providerRows] = yield db_1.pool.query(`
            SELECT 
                provider,
                COUNT(*) as requests,
                SUM(inputTokensEst + outputTokensEst) as totalTokens,
                ROUND(AVG(latencyMs)) as avgLatencyMs,
                SUM(CASE WHEN error = TRUE THEN 1 ELSE 0 END) as errors
            FROM ai_usage_log 
            WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY provider
            ORDER BY requests DESC
        `, [days]);
        // Top intents
        const [intentRows] = yield db_1.pool.query(`
            SELECT 
                intent,
                COUNT(*) as count,
                ROUND(AVG(latencyMs)) as avgLatencyMs
            FROM ai_usage_log 
            WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY) AND intent IS NOT NULL
            GROUP BY intent
            ORDER BY count DESC
            LIMIT 15
        `, [days]);
        // Daily trend
        const [dailyRows] = yield db_1.pool.query(`
            SELECT 
                DATE(createdAt) as date,
                COUNT(*) as requests,
                SUM(inputTokensEst + outputTokensEst) as tokens,
                ROUND(AVG(latencyMs)) as avgLatencyMs
            FROM ai_usage_log 
            WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY DATE(createdAt)
            ORDER BY date
        `, [days]);
        // Feedback summary
        const [feedbackRows] = yield db_1.pool.query(`
            SELECT 
                feedback,
                COUNT(*) as count
            FROM ai_chat_messages 
            WHERE feedback IS NOT NULL 
              AND createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY feedback
        `, [days]);
        const overall = overallRows[0] || {};
        res.json({
            period: `${days} days`,
            overall: {
                totalRequests: Number(overall.totalRequests || 0),
                totalTokens: Number(overall.totalInputTokens || 0) + Number(overall.totalOutputTokens || 0),
                inputTokens: Number(overall.totalInputTokens || 0),
                outputTokens: Number(overall.totalOutputTokens || 0),
                avgLatencyMs: Number(overall.avgLatencyMs || 0),
                cacheHits: Number(overall.cacheHits || 0),
                cacheHitRate: Number(overall.cacheHitRate || 0),
                errorCount: Number(overall.errorCount || 0),
            },
            byProvider: providerRows,
            topIntents: intentRows,
            dailyTrend: dailyRows,
            feedback: feedbackRows,
        });
    }
    catch (error) {
        console.error('[AI Usage Stats] Error:', error === null || error === void 0 ? void 0 : error.message);
        res.status(500).json({ error: 'Failed to load usage stats' });
    }
});
exports.handleAIUsageStats = handleAIUsageStats;
// ═══════════════════════════════════════════════════════════
// ACTIVE SESSIONS ENDPOINT — View conversation threads
// ═══════════════════════════════════════════════════════════
const handleAISessions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.pool.query(`
            SELECT s.*, 
                   (SELECT COUNT(*) FROM ai_chat_messages m WHERE m.sessionId = s.id) as messageCount
            FROM ai_chat_sessions s 
            WHERE s.updatedAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ORDER BY s.updatedAt DESC
            LIMIT 50
        `);
        res.json({ sessions: rows });
    }
    catch (error) {
        console.error('[AI Sessions] Error:', error === null || error === void 0 ? void 0 : error.message);
        res.status(500).json({ error: 'Failed to load sessions' });
    }
});
exports.handleAISessions = handleAISessions;
// ═══════════════════════════════════════════════════════════
// PHASE 2: EXECUTE AI ACTION — User confirmed the proposal
// POST /api/ai-chat/execute-action
// ═══════════════════════════════════════════════════════════
const handleExecuteAction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { actionId, params } = req.body;
        const user = req.user;
        const userId = (user === null || user === void 0 ? void 0 : user.id) || 'unknown';
        const userName = (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) || 'Dax User';
        const userRole = (user === null || user === void 0 ? void 0 : user.role) || 'user';
        if (!actionId || !params) {
            return res.status(400).json({ success: false, messageAr: 'بيانات العملية ناقصة' });
        }
        const action = (0, aiActionRegistry_1.getAction)(actionId);
        if (!action) {
            return res.status(404).json({ success: false, messageAr: `العملية "${actionId}" غير معروفة` });
        }
        // Re-verify role (defense in depth — frontend also checks)
        if (!(0, aiActionRegistry_1.canUserExecute)(action, userRole)) {
            return res.status(403).json({ success: false, messageAr: `⛔ ليس لديك صلاحية تنفيذ "${action.nameAr}"` });
        }
        console.log(`[AI Action] ⚡ Executing: ${action.id} by ${userName} | Params: ${JSON.stringify(params)}`);
        const startTime = Date.now();
        // Execute the action
        const result = yield action.execute(params, userId, userName);
        const latency = Date.now() - startTime;
        console.log(`[AI Action] ${result.success ? '✅' : '❌'} ${action.id} completed in ${latency}ms | ${result.messageAr}`);
        // Log to usage table
        db_1.pool.query(`INSERT INTO ai_usage_log (userId, provider, model, intent, inputTokensEst, outputTokensEst, latencyMs, cached, error, createdAt)
             VALUES (?, 'action', ?, ?, 0, 0, ?, 0, ?, NOW())`, [userId, action.id, `action_${actionId}`, latency, !result.success]).catch(() => { });
        res.json(Object.assign(Object.assign({}, result), { actionId, executedBy: userName, latencyMs: latency }));
    }
    catch (error) {
        console.error('[AI Action Execute] Error:', error === null || error === void 0 ? void 0 : error.message);
        return (0, errorHandler_1.handleControllerError)(res, error, 'executeAction');
    }
});
exports.handleExecuteAction = handleExecuteAction;
// ═══════════════════════════════════════════════════════════
// AVAILABLE ACTIONS LIST — For frontend to show capabilities
// GET /api/ai-chat/actions
// ═══════════════════════════════════════════════════════════
const handleListActions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    const userRole = (user === null || user === void 0 ? void 0 : user.role) || 'user';
    const available = aiActionRegistry_1.ACTION_REGISTRY
        .filter(a => (0, aiActionRegistry_1.canUserExecute)(a, userRole))
        .map(a => ({
        id: a.id,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        icon: a.icon,
        category: a.category,
        description: a.description,
        parameters: a.parameters,
    }));
    res.json({ actions: available, total: available.length });
});
exports.handleListActions = handleListActions;
// ═══════════════════════════════════════════════════════════
// PHASE 4.2: DAILY BRIEF — Executive AI Summary Generator
// GET /api/ai-chat/daily-brief
// Aggregates sales, treasury, aging, and inventory KPIs into
// a concise executive intelligence report generated by AI
// ═══════════════════════════════════════════════════════════
const handleDailyBrief = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    try {
        const user = req.user;
        const userId = (user === null || user === void 0 ? void 0 : user.id) || 'system';
        const branchFilter = (user === null || user === void 0 ? void 0 : user.branchId) ? `AND branchId = ?` : '';
        const branchParams = (user === null || user === void 0 ? void 0 : user.branchId) ? [user.branchId] : [];
        const period = req.query.period || 'today';
        // Determine date range
        let dateFilter = 'DATE(createdAt) = CURDATE()';
        let periodLabel = 'اليوم';
        if (period === 'week') {
            dateFilter = 'createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
            periodLabel = 'الأسبوع';
        }
        if (period === 'month') {
            dateFilter = 'createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
            periodLabel = 'الشهر';
        }
        // 1. Sales Summary
        const [salesRows] = yield db_1.pool.query(`
            SELECT 
                COUNT(*) as invoiceCount,
                COALESCE(SUM(CASE WHEN type = 'INVOICE_SALE' THEN total ELSE 0 END), 0) as totalSales,
                COALESCE(SUM(CASE WHEN type = 'INVOICE_PURCHASE' THEN total ELSE 0 END), 0) as totalPurchases,
                COALESCE(SUM(CASE WHEN type = 'RETURN_SALE' THEN total ELSE 0 END), 0) as totalReturns,
                COALESCE(SUM(CASE WHEN type = 'INVOICE_SALE' THEN paidAmount ELSE 0 END), 0) as cashCollected
            FROM invoices 
            WHERE ${dateFilter} ${branchFilter}
        `, [...branchParams]);
        // 2. Treasury Summary
        const [treasuryRows] = yield db_1.pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN type IN ('receipt', 'RECEIPT') THEN amount ELSE 0 END), 0) as totalReceipts,
                COALESCE(SUM(CASE WHEN type IN ('payment', 'PAYMENT', 'expense') THEN amount ELSE 0 END), 0) as totalPayments
            FROM journal_entries 
            WHERE ${dateFilter} ${branchFilter}
        `, [...branchParams]);
        // 3. Aging Summary (overdue receivables)
        const [agingRows] = yield db_1.pool.query(`
            SELECT 
                COUNT(*) as overdueCount,
                COALESCE(SUM(total - COALESCE(paidAmount, 0)), 0) as overdueAmount
            FROM invoices 
            WHERE type = 'INVOICE_SALE' 
              AND status NOT IN ('PAID', 'VOID')
              AND dueDate IS NOT NULL 
              AND dueDate < CURDATE()
              ${branchFilter}
        `, [...branchParams]);
        // 4. Cheques due soon
        const [chequeRows] = yield db_1.pool.query(`
            SELECT 
                COUNT(*) as dueSoonCount,
                COALESCE(SUM(amount), 0) as dueSoonAmount
            FROM cheques 
            WHERE (status = 'PENDING' OR status = 'UNDER_COLLECTION')
              AND dueDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
        `);
        // 5. Low stock items
        const [stockRows] = yield db_1.pool.query(`
            SELECT COUNT(*) as lowStockCount
            FROM products 
            WHERE stock <= COALESCE(minStock, 5) AND stock >= 0
        `);
        const sales = salesRows[0] || {};
        const treasury = treasuryRows[0] || {};
        const aging = agingRows[0] || {};
        const cheques = chequeRows[0] || {};
        const stock = stockRows[0] || {};
        // Build brief data
        const briefData = {
            period: periodLabel,
            generatedAt: new Date().toISOString(),
            generatedFor: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) || 'المدير',
            metrics: {
                sales: {
                    invoiceCount: Number(sales.invoiceCount || 0),
                    totalSales: Number(sales.totalSales || 0),
                    totalPurchases: Number(sales.totalPurchases || 0),
                    totalReturns: Number(sales.totalReturns || 0),
                    cashCollected: Number(sales.cashCollected || 0),
                    netSales: Number(sales.totalSales || 0) - Number(sales.totalReturns || 0),
                },
                treasury: {
                    totalReceipts: Number(treasury.totalReceipts || 0),
                    totalPayments: Number(treasury.totalPayments || 0),
                    netCashFlow: Number(treasury.totalReceipts || 0) - Number(treasury.totalPayments || 0),
                },
                aging: {
                    overdueCount: Number(aging.overdueCount || 0),
                    overdueAmount: Number(aging.overdueAmount || 0),
                },
                cheques: {
                    dueSoonCount: Number(cheques.dueSoonCount || 0),
                    dueSoonAmount: Number(cheques.dueSoonAmount || 0),
                },
                inventory: {
                    lowStockCount: Number(stock.lowStockCount || 0),
                },
            },
        };
        // Generate AI narrative (optional — only if model available)
        let aiNarrative = '';
        try {
            const modelId = _selectedModel;
            const briefPrompt = `أنت مساعد تنفيذي للمدير. اكتب ملخصاً تنفيذياً موجزاً (5-7 أسطر) لبيانات ${periodLabel}:
المبيعات: ${briefData.metrics.sales.totalSales.toLocaleString()} ج.م (${briefData.metrics.sales.invoiceCount} فاتورة)
المشتريات: ${briefData.metrics.sales.totalPurchases.toLocaleString()} ج.م
المرتجعات: ${briefData.metrics.sales.totalReturns.toLocaleString()} ج.م
التحصيلات: ${briefData.metrics.treasury.totalReceipts.toLocaleString()} ج.م
المدفوعات: ${briefData.metrics.treasury.totalPayments.toLocaleString()} ج.م
المتأخرات: ${briefData.metrics.aging.overdueCount} فاتورة بقيمة ${briefData.metrics.aging.overdueAmount.toLocaleString()} ج.م
شيكات مستحقة: ${briefData.metrics.cheques.dueSoonCount} شيك بقيمة ${briefData.metrics.cheques.dueSoonAmount.toLocaleString()} ج.م
أصناف منخفضة: ${briefData.metrics.inventory.lowStockCount} صنف

اكتب بأسلوب مهني وموجز. إذا كانت هناك ملاحظات مهمة أو تحذيرات، وضحها.`;
            const { result } = yield generateWithFailover(modelId, {
                contents: [
                    { role: 'user', parts: [{ text: briefPrompt }] },
                ],
                systemInstruction: { parts: [{ text: `أنت Dax، المساعد التنفيذي لنظام ${brandConfig_1.SERVER_BRAND.name}. اكتب ملخصات موجزة ومفيدة.` }] },
                generationConfig: { maxOutputTokens: 400 },
            });
            const responseText = (_f = (_e = (_d = (_c = (_b = (_a = result === null || result === void 0 ? void 0 : result.response) === null || _a === void 0 ? void 0 : _a.candidates) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.parts) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.text;
            if (responseText) {
                aiNarrative = responseText;
            }
        }
        catch (aiErr) {
            console.warn('[Daily Brief] AI narrative generation failed (non-blocking):', aiErr);
        }
        // Log usage
        db_1.pool.query(`INSERT INTO ai_usage_log (userId, provider, model, intent, inputTokensEst, outputTokensEst, latencyMs) VALUES (?, 'action', 'daily-brief', 'daily_brief', 0, 0, 0)`, [userId]).catch(() => { });
        res.json(Object.assign(Object.assign({}, briefData), { narrative: aiNarrative }));
    }
    catch (error) {
        console.error('[Daily Brief] Error:', error === null || error === void 0 ? void 0 : error.message);
        return (0, errorHandler_1.handleControllerError)(res, error, 'dailyBrief');
    }
});
exports.handleDailyBrief = handleDailyBrief;
// ═══════════════════════════════════════════════════════════
// PHASE 4.3: MULTI-TENANT QUERY SCOPING
// Utility to ensure AI data queries respect branch isolation
// ═══════════════════════════════════════════════════════════
function scopeQueryByBranch(sql, user) {
    if (!(user === null || user === void 0 ? void 0 : user.branchId))
        return { sql, params: [] };
    // Tables that support branch scoping
    const branchTables = ['invoices', 'journal_entries', 'cheques', 'stock_permits', 'production_orders'];
    let scopedSql = sql;
    const params = [];
    for (const table of branchTables) {
        // Add branch filter after FROM clause
        const fromPattern = new RegExp(`FROM\\s+${table}(\\s|$)`, 'gi');
        if (fromPattern.test(scopedSql) && !scopedSql.includes('branchId')) {
            // Check if there's already a WHERE
            if (/WHERE/i.test(scopedSql)) {
                scopedSql = scopedSql.replace(/(WHERE)/i, `WHERE ${table}.branchId = ? AND`);
            }
            else {
                scopedSql = scopedSql.replace(fromPattern, `FROM ${table} WHERE ${table}.branchId = ? `);
            }
            params.push(user.branchId);
        }
    }
    return { sql: scopedSql, params };
}
