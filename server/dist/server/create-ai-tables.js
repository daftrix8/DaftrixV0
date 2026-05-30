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
/**
 * Create AI Intelligence Engine tables.
 * Run: npx tsx server/create-ai-tables.ts
 * or:  node -r ts-node/register server/create-ai-tables.ts
 */
const db_1 = require("./db");
function createAITables() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield db_1.pool.getConnection();
        try {
            console.log('Creating AI tables...');
            // 1. AI Chat Messages
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS ai_chat_messages (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        role ENUM('user','assistant') NOT NULL DEFAULT 'user',
        message TEXT NOT NULL,
        intent VARCHAR(50) DEFAULT NULL,
        contextSummary VARCHAR(500) DEFAULT NULL,
        sessionId VARCHAR(36) DEFAULT NULL,
        feedback ENUM('positive','negative','corrected') DEFAULT NULL,
        feedbackNote TEXT DEFAULT NULL,
        provider VARCHAR(20) DEFAULT NULL,
        model VARCHAR(100) DEFAULT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_chat_user (userId, createdAt),
        INDEX idx_ai_chat_session (sessionId, createdAt)
      )
    `);
            console.log('✅ ai_chat_messages — ready');
            // 2. AI Chat Sessions (conversation memory)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS ai_chat_sessions (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        lastIntent VARCHAR(50) DEFAULT 'general',
        lastPartnerId VARCHAR(36) DEFAULT NULL,
        lastPartnerName VARCHAR(255) DEFAULT NULL,
        lastEntityType VARCHAR(20) DEFAULT NULL,
        lastTopic VARCHAR(50) DEFAULT NULL,
        conversationTone VARCHAR(10) DEFAULT 'ar',
        metadata JSON DEFAULT NULL,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_session_user (userId, updatedAt)
      )
    `);
            console.log('✅ ai_chat_sessions — ready');
            // 3. AI Usage Log (analytics)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId VARCHAR(36) DEFAULT NULL,
        provider VARCHAR(20) NOT NULL,
        model VARCHAR(100) NOT NULL,
        intent VARCHAR(50) DEFAULT NULL,
        inputTokensEst INT DEFAULT 0,
        outputTokensEst INT DEFAULT 0,
        latencyMs INT DEFAULT 0,
        cached BOOLEAN DEFAULT FALSE,
        error BOOLEAN DEFAULT FALSE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_usage_daily (createdAt, provider),
        INDEX idx_ai_usage_user (userId, createdAt)
      )
    `);
            console.log('✅ ai_usage_log — ready');
            // 4. AI Knowledge Base (RAG)
            yield conn.query(`
      CREATE TABLE IF NOT EXISTS ai_knowledge_base (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        titleAr VARCHAR(255) DEFAULT NULL,
        content MEDIUMTEXT NOT NULL,
        contentType ENUM('policy', 'procedure', 'faq', 'report', 'manual', 'note') NOT NULL DEFAULT 'note',
        category VARCHAR(100) DEFAULT 'general',
        tags JSON DEFAULT NULL,
        priority TINYINT DEFAULT 0,
        isActive BOOLEAN DEFAULT TRUE,
        createdBy VARCHAR(36) DEFAULT NULL,
        updatedBy VARCHAR(36) DEFAULT NULL,
        metadata JSON DEFAULT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FULLTEXT INDEX ft_kb_content (title, titleAr, content),
        INDEX idx_kb_type (contentType, isActive),
        INDEX idx_kb_category (category, isActive)
      )
    `);
            console.log('✅ ai_knowledge_base — ready');
            console.log('\n🎉 All AI tables created successfully!');
        }
        finally {
            conn.release();
        }
        yield db_1.pool.end();
        process.exit(0);
    });
}
createAITables().catch(e => {
    console.error('❌ Failed:', e.message);
    process.exit(1);
});
