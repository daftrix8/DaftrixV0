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
const db_1 = require("./db");
function create() {
    return __awaiter(this, void 0, void 0, function* () {
        yield db_1.pool.query(`CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id VARCHAR(36) PRIMARY KEY,
    userId VARCHAR(36),
    role VARCHAR(50) NOT NULL,
    message TEXT,
    intent VARCHAR(100),
    contextSummary TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_created (userId, createdAt)
  );`);
        console.log('Table created');
        process.exit(0);
    });
}
create().catch(e => { console.error(e); process.exit(1); });
