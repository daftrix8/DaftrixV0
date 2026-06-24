"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.throttledBroadcastOnlineUsers = throttledBroadcastOnlineUsers;
exports.addActiveUser = addActiveUser;
exports.removeActiveUser = removeActiveUser;
exports.updateActiveUserView = updateActiveUserView;
exports.acquireEditLock = acquireEditLock;
exports.releaseEditLock = releaseEditLock;
exports.cleanupStaleLocks = cleanupStaleLocks;
exports.getActiveConnectionsByUserId = getActiveConnectionsByUserId;
exports.getRawActiveUsersMap = getRawActiveUsersMap;
exports.getRawEditLocksMap = getRawEditLocksMap;
exports.updateActiveUserViewByUserId = updateActiveUserViewByUserId;
exports.acquireEditLockByUserId = acquireEditLockByUserId;
exports.releaseEditLockByUserId = releaseEditLockByUserId;
exports.savePOSCartState = savePOSCartState;
exports.deletePOSCartState = deletePOSCartState;
exports.getAllPOSCarts = getAllPOSCarts;
exports.cleanupStaleUsers = cleanupStaleUsers;
const eventBus_1 = require("./eventBus");
const activeUsers = new Map();
const editLocks = new Map();
const THROTTLE_BROADCAST_MS = 1500;
const STALE_LOCK_DURATION_MS = 30 * 60 * 1000;
let broadcastTimeout = null;
// Throttled broadcast of online users list to prevent spam
function throttledBroadcastOnlineUsers() {
    if (broadcastTimeout)
        return;
    broadcastTimeout = setTimeout(() => {
        const usersList = Array.from(activeUsers.values()).map(user => ({
            userId: user.userId,
            userName: user.userName,
            currentView: user.currentView,
            editingResource: user.editingResource,
            transport: user.transport,
            connectedAt: user.connectedAt
        }));
        eventBus_1.eventBus.broadcast('users:online', usersList);
        broadcastTimeout = null;
    }, THROTTLE_BROADCAST_MS);
}
// Add user to online registry
function addActiveUser(connectionId, userId, userName, role, transport) {
    if (!connectionId || !userId || !userName)
        return;
    const existing = activeUsers.get(connectionId);
    activeUsers.set(connectionId, {
        connectionId,
        userId,
        userName,
        role,
        transport,
        connectedAt: Date.now()
    });
    if (!existing) {
        throttledBroadcastOnlineUsers();
    }
}
// Remove user from registry and release their locks
function removeActiveUser(connectionId) {
    if (!connectionId)
        return;
    const user = activeUsers.get(connectionId);
    if (!user)
        return;
    // Release any locks held by this connection
    for (const [lockKey, lock] of editLocks.entries()) {
        if (lock.connectionId === connectionId) {
            editLocks.delete(lockKey);
            const [type, id] = lockKey.split(':');
            eventBus_1.eventBus.broadcast('lock:released', { type, id, userId: user.userId });
        }
    }
    activeUsers.delete(connectionId);
    throttledBroadcastOnlineUsers();
}
// Update what page the user is currently viewing
function updateActiveUserView(connectionId, view) {
    if (!connectionId || !view)
        return;
    const user = activeUsers.get(connectionId);
    if (user) {
        // Return new object copy (immutability rule check)
        const updatedUser = Object.assign(Object.assign({}, user), { currentView: view });
        activeUsers.set(connectionId, updatedUser);
        throttledBroadcastOnlineUsers();
    }
}
// Attempt to acquire an edit lock on a resource
function acquireEditLock(type, id, connectionId) {
    if (!type || !id || !connectionId) {
        return { success: false, lockedBy: 'Invalid inputs' };
    }
    const lockKey = `${type}:${id}`;
    const existingLock = editLocks.get(lockKey);
    const user = activeUsers.get(connectionId);
    if (!user) {
        return { success: false, lockedBy: 'User not registered' };
    }
    if (existingLock && existingLock.userId !== user.userId) {
        return {
            success: false,
            lockedBy: existingLock.userName
        };
    }
    // Set or refresh lock
    editLocks.set(lockKey, {
        resourceKey: lockKey,
        userId: user.userId,
        userName: user.userName,
        connectionId,
        timestamp: Date.now()
    });
    const updatedUser = Object.assign(Object.assign({}, user), { editingResource: { type, id } });
    activeUsers.set(connectionId, updatedUser);
    throttledBroadcastOnlineUsers();
    eventBus_1.eventBus.broadcast('lock:acquired', {
        type,
        id,
        userId: user.userId,
        userName: user.userName
    });
    return { success: true };
}
// Release edit lock on a resource
function releaseEditLock(type, id, connectionId) {
    if (!type || !id || !connectionId)
        return false;
    const lockKey = `${type}:${id}`;
    const lock = editLocks.get(lockKey);
    const user = activeUsers.get(connectionId);
    if (lock && lock.connectionId === connectionId) {
        editLocks.delete(lockKey);
        if (user) {
            const updatedUser = Object.assign(Object.assign({}, user), { editingResource: undefined });
            activeUsers.set(connectionId, updatedUser);
        }
        throttledBroadcastOnlineUsers();
        eventBus_1.eventBus.broadcast('lock:released', {
            type,
            id,
            userId: lock.userId
        });
        return true;
    }
    return false;
}
// Periodically clean up stale locks (e.g. idle > 30 mins)
function cleanupStaleLocks() {
    var _a, _b;
    const now = Date.now();
    for (const [lockKey, lock] of editLocks.entries()) {
        if (now - lock.timestamp > STALE_LOCK_DURATION_MS) {
            editLocks.delete(lockKey);
            const [type, id] = lockKey.split(':');
            // Clear reference in user object
            const user = activeUsers.get(lock.connectionId);
            if (user && ((_a = user.editingResource) === null || _a === void 0 ? void 0 : _a.type) === type && ((_b = user.editingResource) === null || _b === void 0 ? void 0 : _b.id) === id) {
                const updatedUser = Object.assign(Object.assign({}, user), { editingResource: undefined });
                activeUsers.set(lock.connectionId, updatedUser);
            }
            eventBus_1.eventBus.broadcast('lock:released', {
                type,
                id,
                userId: lock.userId
            });
            console.log(`⚠️ Stale lock cleaned up: ${lockKey}`);
        }
    }
    throttledBroadcastOnlineUsers();
}
// Find target connections by user ID (can be WebSocket or SSE)
function getActiveConnectionsByUserId(userId) {
    if (!userId)
        return [];
    return Array.from(activeUsers.values()).filter(user => user.userId === userId);
}
// Helper to get raw users for tests
function getRawActiveUsersMap() {
    return activeUsers;
}
// Helper to get raw edit locks for tests
function getRawEditLocksMap() {
    return editLocks;
}
// Update view by user ID (useful for SSE actions)
function updateActiveUserViewByUserId(userId, view) {
    if (!userId || !view)
        return;
    let isUpdated = false;
    for (const [connectionId, user] of activeUsers.entries()) {
        if (user.userId === userId) {
            const updatedUser = Object.assign(Object.assign({}, user), { currentView: view });
            activeUsers.set(connectionId, updatedUser);
            isUpdated = true;
        }
    }
    if (isUpdated) {
        throttledBroadcastOnlineUsers();
    }
}
// Acquire edit lock by user ID (useful for SSE actions)
function acquireEditLockByUserId(type, id, userId, userName) {
    var _a;
    if (!type || !id || !userId) {
        return { success: false, lockedBy: 'Invalid inputs' };
    }
    const lockKey = `${type}:${id}`;
    const existingLock = editLocks.get(lockKey);
    if (existingLock && existingLock.userId !== userId) {
        return {
            success: false,
            lockedBy: existingLock.userName
        };
    }
    const connections = getActiveConnectionsByUserId(userId);
    const connectionId = ((_a = connections[0]) === null || _a === void 0 ? void 0 : _a.connectionId) || `sse-lock-${userId}-${Date.now()}`;
    editLocks.set(lockKey, {
        resourceKey: lockKey,
        userId,
        userName,
        connectionId,
        timestamp: Date.now()
    });
    for (const user of connections) {
        const updatedUser = Object.assign(Object.assign({}, user), { editingResource: { type, id } });
        activeUsers.set(user.connectionId, updatedUser);
    }
    throttledBroadcastOnlineUsers();
    eventBus_1.eventBus.broadcast('lock:acquired', {
        type,
        id,
        userId,
        userName
    });
    return { success: true };
}
// Release edit lock by user ID (useful for SSE actions)
function releaseEditLockByUserId(type, id, userId) {
    if (!type || !id || !userId)
        return false;
    const lockKey = `${type}:${id}`;
    const lock = editLocks.get(lockKey);
    if (lock && lock.userId === userId) {
        editLocks.delete(lockKey);
        const connections = getActiveConnectionsByUserId(userId);
        for (const user of connections) {
            const updatedUser = Object.assign(Object.assign({}, user), { editingResource: undefined });
            activeUsers.set(user.connectionId, updatedUser);
        }
        throttledBroadcastOnlineUsers();
        eventBus_1.eventBus.broadcast('lock:released', {
            type,
            id,
            userId
        });
        return true;
    }
    return false;
}
// POS Session Cart cache
const posCarts = new Map();
function savePOSCartState(cashierId, state) {
    if (!cashierId)
        return;
    posCarts.set(cashierId, Object.assign(Object.assign({}, state), { updatedAt: Date.now() }));
}
function deletePOSCartState(cashierId) {
    if (!cashierId)
        return;
    posCarts.delete(cashierId);
}
function getAllPOSCarts() {
    return Array.from(posCarts.values());
}
// Periodically clean up stale active users (especially HTTP polling users, e.g. idle > 25 seconds)
function cleanupStaleUsers() {
    const now = Date.now();
    const STALE_USER_THRESHOLD_MS = 25000; // 25s threshold (polling runs every 8s)
    let changed = false;
    for (const [connectionId, user] of activeUsers.entries()) {
        if (user.transport !== 'websocket') {
            if (now - user.connectedAt > STALE_USER_THRESHOLD_MS) {
                activeUsers.delete(connectionId);
                // Release any locks held by this user
                for (const [lockKey, lock] of editLocks.entries()) {
                    if (lock.connectionId === connectionId) {
                        editLocks.delete(lockKey);
                        const [type, id] = lockKey.split(':');
                        eventBus_1.eventBus.broadcast('lock:released', { type, id, userId: user.userId });
                    }
                }
                changed = true;
                console.log(`👤 Stale HTTP/SSE user removed: ${user.userName}`);
            }
        }
    }
    if (changed) {
        throttledBroadcastOnlineUsers();
    }
}
// Start periodic cleanup of stale HTTP/SSE users
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        cleanupStaleUsers();
    }, 15000); // Check every 15 seconds
}
