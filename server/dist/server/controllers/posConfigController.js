"use strict";
/**
 * POS Config Controller
 * ========================
 * CRUD for POS Shift Definitions and POS Devices
 * These are named configuration records (not sessions).
 */
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
exports.ensureDefaults = exports.deleteDevice = exports.updateDevice = exports.createDevice = exports.getDevices = exports.deleteShiftDefinition = exports.updateShiftDefinition = exports.createShiftDefinition = exports.getShiftDefinitions = void 0;
const uuid_1 = require("uuid");
const db_1 = require("../db");
// ============================================
// SHIFT DEFINITIONS (ورديات نقاط البيع)
// ============================================
/**
 * List all shift definitions
 * GET /api/pos/shift-definitions
 */
const getShiftDefinitions = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const [rows] = yield conn.query(`SELECT * FROM pos_shift_definitions ORDER BY isDefault DESC, name ASC`);
        res.json({ shiftDefinitions: rows });
    }
    catch (error) {
        console.error('Error listing shift definitions:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getShiftDefinitions = getShiftDefinitions;
/**
 * Create a shift definition
 * POST /api/pos/shift-definitions
 */
const createShiftDefinition = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'اسم الوردية مطلوب' });
        }
        const id = (0, uuid_1.v4)();
        yield conn.query(`INSERT INTO pos_shift_definitions (id, name, isDefault) VALUES (?, ?, FALSE)`, [id, name.trim()]);
        res.json({ success: true, shiftDefinition: { id, name: name.trim(), isDefault: false } });
    }
    catch (error) {
        console.error('Error creating shift definition:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.createShiftDefinition = createShiftDefinition;
/**
 * Update a shift definition
 * PUT /api/pos/shift-definitions/:id
 */
const updateShiftDefinition = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'اسم الوردية مطلوب' });
        }
        yield conn.query(`UPDATE pos_shift_definitions SET name = ? WHERE id = ?`, [name.trim(), id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error updating shift definition:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.updateShiftDefinition = updateShiftDefinition;
/**
 * Delete a shift definition
 * DELETE /api/pos/shift-definitions/:id
 */
const deleteShiftDefinition = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        // Block if any sessions reference this shift definition
        const [refs] = yield conn.query(`SELECT COUNT(*) as cnt FROM pos_shifts WHERE shiftDefinitionId = ?`, [id]);
        if (refs[0].cnt > 0) {
            return res.status(400).json({
                error: 'لا يمكن حذف وردية مرتبطة بجلسات بيع'
            });
        }
        yield conn.query(`DELETE FROM pos_shift_definitions WHERE id = ?`, [id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting shift definition:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.deleteShiftDefinition = deleteShiftDefinition;
// ============================================
// DEVICES (أجهزة نقاط البيع)
// ============================================
/**
 * List all POS devices
 * GET /api/pos/devices
 */
const getDevices = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const [rows] = yield conn.query(`SELECT * FROM pos_devices ORDER BY isDefault DESC, name ASC`);
        res.json({ devices: rows });
    }
    catch (error) {
        console.error('Error listing devices:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.getDevices = getDevices;
/**
 * Create a POS device
 * POST /api/pos/devices
 */
const createDevice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'اسم الجهاز مطلوب' });
        }
        const id = (0, uuid_1.v4)();
        yield conn.query(`INSERT INTO pos_devices (id, name, isDefault) VALUES (?, ?, FALSE)`, [id, name.trim()]);
        res.json({ success: true, device: { id, name: name.trim(), isDefault: false } });
    }
    catch (error) {
        console.error('Error creating device:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.createDevice = createDevice;
/**
 * Update a POS device
 * PUT /api/pos/devices/:id
 */
const updateDevice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'اسم الجهاز مطلوب' });
        }
        yield conn.query(`UPDATE pos_devices SET name = ? WHERE id = ?`, [name.trim(), id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error updating device:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.updateDevice = updateDevice;
/**
 * Delete a POS device
 * DELETE /api/pos/devices/:id
 */
const deleteDevice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const conn = yield (0, db_1.getConnection)();
    try {
        const { id } = req.params;
        // Block if any sessions reference this device
        const [refs] = yield conn.query(`SELECT COUNT(*) as cnt FROM pos_shifts WHERE deviceId = ?`, [id]);
        if (refs[0].cnt > 0) {
            return res.status(400).json({
                error: 'لا يمكن حذف جهاز مرتبط بجلسات بيع'
            });
        }
        yield conn.query(`DELETE FROM pos_devices WHERE id = ?`, [id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting device:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        if (conn)
            conn.release();
    }
});
exports.deleteDevice = deleteDevice;
// ============================================
// AUTO-SEED DEFAULTS
// ============================================
/**
 * Ensure default shift definition + device exist.
 * Called during openShift when none are found.
 */
const ensureDefaults = (conn) => __awaiter(void 0, void 0, void 0, function* () {
    // Check for existing default shift definition
    const [shiftDefs] = yield conn.query(`SELECT id FROM pos_shift_definitions WHERE isDefault = TRUE LIMIT 1`);
    let shiftDefinitionId;
    if (shiftDefs.length === 0) {
        shiftDefinitionId = (0, uuid_1.v4)();
        yield conn.query(`INSERT INTO pos_shift_definitions (id, name, isDefault) VALUES (?, 'Main POS Shift', TRUE)`, [shiftDefinitionId]);
    }
    else {
        shiftDefinitionId = shiftDefs[0].id;
    }
    // Check for existing default device
    const [devices] = yield conn.query(`SELECT id FROM pos_devices WHERE isDefault = TRUE LIMIT 1`);
    let deviceId;
    if (devices.length === 0) {
        deviceId = (0, uuid_1.v4)();
        yield conn.query(`INSERT INTO pos_devices (id, name, isDefault) VALUES (?, 'Main POS Device', TRUE)`, [deviceId]);
    }
    else {
        deviceId = devices[0].id;
    }
    return { shiftDefinitionId, deviceId };
});
exports.ensureDefaults = ensureDefaults;
