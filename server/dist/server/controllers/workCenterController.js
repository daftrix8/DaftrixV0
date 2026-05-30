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
exports.deleteWorkCenter = exports.updateWorkCenter = exports.createWorkCenter = exports.getWorkCenter = exports.getWorkCenters = void 0;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
/**
 * Work Center Controller
 * Manages production work centers (machines, workstations, assembly lines)
 */
// Get all work centers
const getWorkCenters = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status } = req.query;
        let query = `
            SELECT wc.*, w.name as warehouse_name
            FROM work_centers wc
            LEFT JOIN warehouses w ON wc.warehouse_id = w.id
            WHERE 1=1
        `;
        const params = [];
        if (status) {
            query += ' AND wc.status = ?';
            params.push(status);
        }
        query += ' ORDER BY wc.code ASC';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching work centers:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getWorkCenters = getWorkCenters;
// Get work center by ID
const getWorkCenter = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [rows] = yield db_1.pool.query(`
            SELECT wc.*, w.name as warehouse_name
            FROM work_centers wc
            LEFT JOIN warehouses w ON wc.warehouse_id = w.id
            WHERE wc.id = ?
        `, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Work center not found' });
        }
        res.json(rows[0]);
    }
    catch (error) {
        console.error('Error fetching work center:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getWorkCenter = getWorkCenter;
// Create work center
const createWorkCenter = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id, code, name, description, type, capacityPerHour, costPerHour, warehouseId, status } = req.body;
        // Check if code already exists
        const [existing] = yield db_1.pool.query('SELECT id FROM work_centers WHERE code = ?', [code]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Work center code already exists' });
        }
        yield db_1.pool.query(`
            INSERT INTO work_centers (
                id, code, name, description, type,
                capacity_per_hour, cost_per_hour, warehouse_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            code,
            name,
            description || null,
            type || null,
            capacityPerHour || 0,
            costPerHour || 0,
            warehouseId || null,
            status || 'ACTIVE'
        ]);
        const [result] = yield db_1.pool.query('SELECT id, code, name, description, type, capacity_per_hour, cost_per_hour, warehouse_id, status FROM work_centers WHERE id = ?', [id]);
        res.json(result[0]);
    }
    catch (error) {
        console.error('Error creating work center:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.createWorkCenter = createWorkCenter;
// Update work center
const updateWorkCenter = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { code, name, description, type, capacityPerHour, costPerHour, warehouseId, status } = req.body;
        // Check if work center exists
        const [rows] = yield db_1.pool.query('SELECT id FROM work_centers WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Work center not found' });
        }
        yield db_1.pool.query(`
            UPDATE work_centers
            SET code = COALESCE(?, code),
                name = COALESCE(?, name),
                description = ?,
                type = ?,
                capacity_per_hour = COALESCE(?, capacity_per_hour),
                cost_per_hour = COALESCE(?, cost_per_hour),
                warehouse_id = ?,
                status = COALESCE(?, status)
            WHERE id = ?
        `, [
            code,
            name,
            description,
            type,
            capacityPerHour,
            costPerHour,
            warehouseId,
            status,
            id
        ]);
        const [result] = yield db_1.pool.query('SELECT id, code, name, description, type, capacity_per_hour, cost_per_hour, warehouse_id, status FROM work_centers WHERE id = ?', [id]);
        res.json(result[0]);
    }
    catch (error) {
        console.error('Error updating work center:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updateWorkCenter = updateWorkCenter;
// Delete work center
const deleteWorkCenter = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Check if work center is used in any routing steps
        const [routingSteps] = yield db_1.pool.query('SELECT id FROM routing_steps WHERE work_center_id = ?', [id]);
        if (routingSteps.length > 0) {
            return res.status(400).json({
                message: 'Cannot delete work center: it is used in routing steps'
            });
        }
        yield db_1.pool.query('DELETE FROM work_centers WHERE id = ?', [id]);
        res.json({ message: 'Work center deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting work center:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteWorkCenter = deleteWorkCenter;
