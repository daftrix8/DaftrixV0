"use strict";
/**
 * Fingerprint Device Controller
 * REST API endpoints for managing fingerprint devices, employee mapping, and attendance sync.
 */
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
exports.getSyncHistory = exports.syncAllDevices = exports.syncDevice = exports.suggestMappings = exports.deleteMapping = exports.saveMappings = exports.getMappings = exports.getDeviceUserList = exports.testConnection = exports.deleteDevice = exports.updateDevice = exports.createDevice = exports.getDevices = void 0;
const errorHandler_1 = require("../utils/errorHandler");
const fpService = __importStar(require("../services/fingerprintService"));
const IP_V4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEVICE_SYNC_CONCURRENCY = 3;
// ── Device CRUD ────────────────────────────────────────────────────────
const getDevices = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const devices = yield fpService.getDevices();
        res.json(devices);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch fingerprint devices');
    }
});
exports.getDevices = getDevices;
const createDevice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, ip, port, model } = req.body;
    if (!name || !ip) {
        return res.status(400).json({ error: 'اسم الجهاز وعنوان IP مطلوبان' });
    }
    if (!IP_V4_PATTERN.test(ip)) {
        return res.status(400).json({ error: 'صيغة عنوان IP غير صحيحة' });
    }
    try {
        const device = yield fpService.createDevice({ name, ip, port, model });
        res.status(201).json(device);
    }
    catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'جهاز بنفس عنوان IP والمنفذ موجود بالفعل' });
        }
        return (0, errorHandler_1.handleControllerError)(res, error, 'create fingerprint device');
    }
});
exports.createDevice = createDevice;
const updateDevice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { name, ip, port, model, isActive } = req.body;
    if (port !== undefined && (isNaN(Number(port)) || Number(port) < 1 || Number(port) > 65535)) {
        return res.status(400).json({ error: 'رقم المنفذ يجب أن يكون بين 1 و 65535' });
    }
    if (ip !== undefined && !IP_V4_PATTERN.test(ip)) {
        return res.status(400).json({ error: 'صيغة عنوان IP غير صحيحة' });
    }
    try {
        yield fpService.updateDevice(id, { name, ip, port, model, isActive });
        res.json({ message: 'تم تحديث الجهاز بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'update fingerprint device');
    }
});
exports.updateDevice = updateDevice;
const deleteDevice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        yield fpService.deleteDevice(id);
        res.json({ message: 'تم حذف الجهاز بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete fingerprint device');
    }
});
exports.deleteDevice = deleteDevice;
// ── Device Connection ──────────────────────────────────────────────────
const testConnection = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const result = yield fpService.testDeviceConnection(id);
        res.json(result);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'test device connection');
    }
});
exports.testConnection = testConnection;
const getDeviceUserList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const users = yield fpService.getDeviceUsers(id);
        res.json(users);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch device users');
    }
});
exports.getDeviceUserList = getDeviceUserList;
// ── Employee Mapping ───────────────────────────────────────────────────
const getMappings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const mappings = yield fpService.getMappings(id);
        res.json(mappings);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch fingerprint mappings');
    }
});
exports.getMappings = getMappings;
const saveMappings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { mappings } = req.body;
    if (!Array.isArray(mappings)) {
        return res.status(400).json({ error: 'mappings must be an array' });
    }
    const MAX_MAPPINGS_PER_REQUEST = 500;
    if (mappings.length > MAX_MAPPINGS_PER_REQUEST) {
        return res.status(400).json({ error: `الحد الأقصى ${MAX_MAPPINGS_PER_REQUEST} ربط لكل طلب` });
    }
    try {
        const result = yield fpService.saveMappings(id, mappings);
        res.json(Object.assign({ message: 'تم حفظ الربط بنجاح' }, result));
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'save fingerprint mappings');
    }
});
exports.saveMappings = saveMappings;
const deleteMapping = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { mappingId } = req.params;
    try {
        yield fpService.deleteMapping(mappingId);
        res.json({ message: 'تم حذف الربط بنجاح' });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'delete fingerprint mapping');
    }
});
exports.deleteMapping = deleteMapping;
const suggestMappings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const deviceUsers = yield fpService.getDeviceUsers(id);
        const suggestions = yield fpService.suggestMappings(id, deviceUsers);
        res.json(suggestions);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'suggest fingerprint mappings');
    }
});
exports.suggestMappings = suggestMappings;
// ── Attendance Sync ────────────────────────────────────────────────────
const syncDevice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { fromDate, toDate } = req.body;
    if (fromDate && !ISO_DATE_PATTERN.test(fromDate)) {
        return res.status(400).json({ error: 'fromDate must be YYYY-MM-DD format' });
    }
    if (toDate && !ISO_DATE_PATTERN.test(toDate)) {
        return res.status(400).json({ error: 'toDate must be YYYY-MM-DD format' });
    }
    if (fromDate && toDate && fromDate > toDate) {
        return res.status(400).json({ error: 'fromDate must be before or equal to toDate' });
    }
    try {
        const result = yield fpService.syncAttendanceLogs(id, { fromDate, toDate });
        res.json(result);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'sync device attendance');
    }
});
exports.syncDevice = syncDevice;
const syncAllDevices = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const devices = yield fpService.getDevices();
        const activeDevices = devices.filter(d => d.isActive);
        if (activeDevices.length === 0) {
            return res.json({ message: 'لا توجد أجهزة نشطة', results: [] });
        }
        // Sync in batches to avoid saturating ZKTeco TCP connections.
        // Most devices can only handle 1-2 concurrent connections.
        const results = [];
        const errors = [];
        for (let i = 0; i < activeDevices.length; i += DEVICE_SYNC_CONCURRENCY) {
            const batch = activeDevices.slice(i, i + DEVICE_SYNC_CONCURRENCY);
            const settled = yield Promise.allSettled(batch.map(d => {
                // Wrap the device sync in a strict 25-second timeout
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Device sync timed out (25s)')), 25000);
                });
                return Promise.race([
                    fpService.syncAttendanceLogs(d.id),
                    timeoutPromise
                ]);
            }));
            settled.forEach((outcome, j) => {
                var _a;
                if (outcome.status === 'fulfilled') {
                    results.push(outcome.value);
                }
                else {
                    errors.push({
                        deviceId: batch[j].id,
                        deviceName: batch[j].name,
                        error: ((_a = outcome.reason) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error',
                    });
                }
            });
        }
        res.json({
            message: `تمت مزامنة ${results.length} من ${activeDevices.length} جهاز`,
            results,
            errors,
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'sync all devices');
    }
});
exports.syncAllDevices = syncAllDevices;
const getSyncHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const MAX_HISTORY_LIMIT = 100;
    const limit = Math.min(MAX_HISTORY_LIMIT, parseInt(req.query.limit) || 20);
    try {
        const history = yield fpService.getSyncHistory(id, limit);
        res.json(history);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'fetch sync history');
    }
});
exports.getSyncHistory = getSyncHistory;
