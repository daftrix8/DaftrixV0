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
exports.handleReaction = handleReaction;
const db_1 = require("../db");
/**
 * Handles adding or removing a reaction to/from a message in the database.
 * Updates the JSON reactions column of the chat_messages table and returns updated state.
 */
function handleReaction(userId, messageId, emoji, action) {
    return __awaiter(this, void 0, void 0, function* () {
        const [rows] = yield db_1.pool.query('SELECT reactions, type, userId, targetUserId, groupId FROM chat_messages WHERE id = ?', [messageId]);
        if (rows.length === 0) {
            throw new Error('Message not found');
        }
        const msg = rows[0];
        let reactions = {};
        if (msg.reactions) {
            reactions = typeof msg.reactions === 'string' ? JSON.parse(msg.reactions) : msg.reactions;
        }
        if (action === 'add') {
            if (!reactions[emoji]) {
                reactions[emoji] = [];
            }
            const strUserIds = reactions[emoji].map(uid => String(uid));
            if (!strUserIds.includes(String(userId))) {
                reactions[emoji] = [...strUserIds, String(userId)];
            }
            else {
                reactions[emoji] = strUserIds;
            }
        }
        else if (action === 'remove') {
            if (reactions[emoji]) {
                reactions[emoji] = reactions[emoji]
                    .map(uid => String(uid))
                    .filter((uid) => uid !== String(userId));
                if (reactions[emoji].length === 0) {
                    delete reactions[emoji];
                }
            }
        }
        yield db_1.pool.query('UPDATE chat_messages SET reactions = ? WHERE id = ?', [JSON.stringify(reactions), messageId]);
        return {
            reactions,
            type: msg.type,
            messageSenderId: msg.userId,
            targetUserId: msg.targetUserId,
            groupId: msg.groupId
        };
    });
}
