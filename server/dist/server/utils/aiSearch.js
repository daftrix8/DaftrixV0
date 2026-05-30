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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryVectorDB = void 0;
exports.initAIModel = initAIModel;
exports.getEmbedding = getEmbedding;
exports.cosineSimilarity = cosineSimilarity;
const transformers_1 = require("@xenova/transformers");
const path_1 = __importDefault(require("path"));
// Disable telemetry and set cache directory
transformers_1.env.allowLocalModels = true;
// Set to a local folder within server
transformers_1.env.cacheDir = path_1.default.join(__dirname, '..', '.cache', 'transformers');
let extractor = null;
let isInitializing = false;
let initializationPromise = null;
function initAIModel() {
    return __awaiter(this, void 0, void 0, function* () {
        if (extractor)
            return;
        if (isInitializing && initializationPromise) {
            return initializationPromise;
        }
        isInitializing = true;
        initializationPromise = new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('🤖 AI Search: Initializing Multilingual Embedding Model (This may take a moment on first boot to download weights)...');
                extractor = yield (0, transformers_1.pipeline)('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
                    quantized: true, // Use int8 quantization to save memory (~117MB instead of ~470MB)
                });
                console.log('✅ AI Search: Model initialized and ready.');
                resolve();
            }
            catch (error) {
                console.error('❌ AI Search: Failed to initialize model', error);
                // Clear the cached promise so future callers can retry
                // instead of silently receiving the cached rejection
                initializationPromise = null;
                reject(error);
            }
            finally {
                isInitializing = false;
            }
        }));
        return initializationPromise;
    });
}
/**
 * Converts a text string into a 384-dimensional mathematical vector
 */
function getEmbedding(text) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!extractor) {
            yield initAIModel();
        }
        if (!extractor) {
            throw new Error('AI Model failed to load');
        }
        // Extract features with mean pooling and normalization (essential for cosine similarity)
        const output = yield extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    });
}
/**
 * Calculates Cosine Similarity between two normalized vectors
 * Value ranges between -1 (opposite) to 1 (identical)
 */
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0.0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
    }
    return dotProduct;
}
class VectorDatabase {
    constructor() {
        this.vectors = [];
        this.isLoaded = false;
    }
    loadDB(pool) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isLoaded)
                return;
            console.log('🤖 AI Search: Loading Vector DB into memory...');
            try {
                const [rows] = yield pool.query('SELECT id, categoryId, embedding FROM products WHERE embedding IS NOT NULL AND isActive = TRUE');
                this.vectors = rows.filter(r => r.embedding !== null).map((r) => {
                    let emb = r.embedding;
                    if (typeof emb === 'string') {
                        try {
                            emb = JSON.parse(emb);
                        }
                        catch (_a) { }
                    }
                    return { id: r.id, categoryId: r.categoryId || null, embedding: emb };
                });
                console.log(`✅ AI Search: Loaded ${this.vectors.length} vectors into memory for God Mode.`);
                this.isLoaded = true;
            }
            catch (e) {
                console.error('❌ AI Search: Failed to load Vector DB', e.message);
            }
        });
    }
    /**
     * Finds the most semantically similar products
     */
    search(queryText_1) {
        return __awaiter(this, arguments, void 0, function* (queryText, topK = 20, filterCategoryId) {
            if (!this.isLoaded || this.vectors.length === 0)
                return [];
            const queryVector = yield getEmbedding(queryText);
            let results = [];
            for (const item of this.vectors) {
                if (!item.embedding || item.embedding.length !== 384)
                    continue;
                if (filterCategoryId && filterCategoryId !== 'ALL' && item.categoryId !== filterCategoryId)
                    continue;
                const score = cosineSimilarity(queryVector, item.embedding);
                // Optimization: If score is very low, totally unrelated
                if (score > 0.15) {
                    results.push({ id: item.id, score });
                }
            }
            // Sort by highest similarity
            results.sort((a, b) => b.score - a.score);
            return results.slice(0, topK);
        });
    }
    // Allows real-time updating without restarting server
    addOrUpdateVector(id, embedding, categoryId = null) {
        const existing = this.vectors.find(v => v.id === id);
        if (existing) {
            existing.embedding = embedding;
            if (categoryId !== null) {
                existing.categoryId = categoryId;
            }
        }
        else {
            this.vectors.push({ id, categoryId, embedding });
        }
    }
    removeVector(id) {
        this.vectors = this.vectors.filter(v => v.id !== id);
    }
}
exports.InMemoryVectorDB = new VectorDatabase();
