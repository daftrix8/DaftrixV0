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
Object.defineProperty(exports, "__esModule", { value: true });
exports.startEmbeddingWorker = startEmbeddingWorker;
const db_1 = require("../db");
// Run every 5 minutes and process up to 100 missing embeddings
let embeddingInterval = null;
let isProcessing = false;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5; // Stop worker after 5 consecutive failures
function startEmbeddingWorker() {
    if (process.env.ENABLE_SEMANTIC_SEARCH !== 'true') {
        return;
    }
    if (embeddingInterval)
        return;
    console.log('🤖 AI Background Worker started. Waiting for server idle to process missing vectors...');
    // Start interval
    embeddingInterval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
        if (isProcessing)
            return;
        // Stop retrying after too many consecutive failures (e.g. disk full, weights corrupted)
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.error(`❌ AI Worker: Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Restart server to retry.`);
            if (embeddingInterval) {
                clearInterval(embeddingInterval);
                embeddingInterval = null;
            }
            return;
        }
        isProcessing = true;
        try {
            // Lazy load aiSearch to prevent loading @xenova/transformers on start if disabled
            const { getEmbedding, InMemoryVectorDB } = yield Promise.resolve().then(() => __importStar(require('./aiSearch')));
            // Ensure vector DB is loaded into RAM
            yield InMemoryVectorDB.loadDB(db_1.pool);
            // Find products without an embedding
            // Use pool.query() which auto-releases the connection (no leak risk)
            const [rows] = yield db_1.pool.query(`SELECT p.id, p.categoryId, p.name, c.name as categoryName 
                 FROM products p 
                 LEFT JOIN categories c ON p.categoryId = c.id 
                 WHERE p.embedding IS NULL AND p.isActive = TRUE 
                 LIMIT 100`);
            if (rows.length === 0) {
                isProcessing = false;
                consecutiveFailures = 0; // Reset on success
                return;
            }
            console.log(`🤖 AI Worker finding ${rows.length} new products to vectorize...`);
            // Use pool.query() for updates too — avoids holding a dedicated connection
            // for the entire loop duration. Each query auto-checks-out and releases.
            for (const row of rows) {
                // Combine name and category for rich contextual meaning
                // e.g. "iPhone 15" + "Mobile Phones"
                const combinedText = `${row.name || ''} ${row.categoryName || ''}`.trim();
                if (!combinedText)
                    continue;
                // Generate 384-dimensional mathematical vector representing semantic meaning
                const vectorFields = yield getEmbedding(combinedText);
                // Save it back to the database as a JSON array
                yield db_1.pool.query(`UPDATE products SET embedding = ? WHERE id = ?`, [JSON.stringify(vectorFields), row.id]);
                // Immediately synchronize the RAM embedding matrix so searching is instant
                InMemoryVectorDB.addOrUpdateVector(row.id, vectorFields, row.categoryId || null);
            }
            console.log(`✅ AI Worker finished vectorizing ${rows.length} products.`);
            consecutiveFailures = 0; // Reset on success
        }
        catch (error) {
            consecutiveFailures++;
            const backoffMinutes = Math.min(consecutiveFailures * 5, 30);
            console.error(`❌ AI Worker error (failure ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${error.message}`);
            if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
                console.warn(`   Next retry in ${backoffMinutes} minutes (exponential backoff)`);
            }
        }
        finally {
            isProcessing = false;
        }
    }), 5 * 60 * 1000); // 5 minutes
    // Start initial pass 10 seconds after boot
    setTimeout(() => {
        if (!isProcessing) {
            // Kickstart first run
            embeddingInterval === null || embeddingInterval === void 0 ? void 0 : embeddingInterval.refresh();
        }
    }, 10000);
}
