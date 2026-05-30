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
exports.calculateRoutingCost = exports.deleteRouting = exports.updateRouting = exports.createRouting = exports.getRouting = exports.getRoutings = void 0;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
/**
 * Routing Controller
 * Manages production routings and routing steps (multi-stage workflows)
 */
// Get all routings
const getRoutings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productId, isActive } = req.query;
        let query = `
            SELECT r.*, p.name as product_name, p.sku as product_sku
            FROM routings r
            LEFT JOIN products p ON r.product_id = p.id
            WHERE 1=1
        `;
        const params = [];
        if (productId) {
            query += ' AND r.product_id = ?';
            params.push(productId);
        }
        if (isActive !== undefined) {
            query += ' AND r.is_active = ?';
            params.push(isActive === 'true' ? 1 : 0);
        }
        query += ' ORDER BY r.code ASC';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching routings:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getRoutings = getRoutings;
// Get routing by ID with steps
const getRouting = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Get routing header
        const [routingRows] = yield db_1.pool.query(`
            SELECT r.*, p.name as product_name, p.sku as product_sku
            FROM routings r
            LEFT JOIN products p ON r.product_id = p.id
            WHERE r.id = ?
        `, [id]);
        if (routingRows.length === 0) {
            return res.status(404).json({ message: 'Routing not found' });
        }
        const routing = routingRows[0];
        // Get routing steps
        const [stepsRows] = yield db_1.pool.query(`
            SELECT rs.*, wc.name as work_center_name, wc.code as work_center_code
            FROM routing_steps rs
            LEFT JOIN work_centers wc ON rs.work_center_id = wc.id
            WHERE rs.routing_id = ?
            ORDER BY rs.sequence_number ASC
        `, [id]);
        routing.steps = stepsRows;
        res.json(routing);
    }
    catch (error) {
        console.error('Error fetching routing:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getRouting = getRouting;
// Create routing with steps
const createRouting = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id, code, name, productId, description, isActive, steps } = req.body;
        // Check if code already exists
        const [existing] = yield connection.query('SELECT id FROM routings WHERE code = ?', [code]);
        if (existing.length > 0) {
            throw new Error('Routing code already exists');
        }
        // Create routing header
        yield connection.query(`
            INSERT INTO routings (id, code, name, product_id, description, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            id,
            code,
            name,
            productId,
            description || null,
            isActive !== undefined ? isActive : true
        ]);
        // Create routing steps
        if (steps && Array.isArray(steps)) {
            for (const step of steps) {
                yield connection.query(`
                    INSERT INTO routing_steps (
                        id, routing_id, sequence_number, work_center_id,
                        operation_name, description,
                        setup_time_minutes, run_time_minutes,
                        labor_cost_per_hour, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    step.id,
                    id,
                    step.sequenceNumber,
                    step.workCenterId,
                    step.operationName,
                    step.description || null,
                    step.setupTimeMinutes || 0,
                    step.runTimeMinutes || 0,
                    step.laborCostPerHour || 0,
                    step.notes || null
                ]);
            }
        }
        yield connection.commit();
        // Return created routing with steps
        const [result] = yield db_1.pool.query(`
            SELECT r.*, p.name as product_name
            FROM routings r
            LEFT JOIN products p ON r.product_id = p.id
            WHERE r.id = ?
        `, [id]);
        const routing = result[0];
        // Get steps
        const [stepsResult] = yield db_1.pool.query(`
            SELECT rs.*, wc.name as work_center_name
            FROM routing_steps rs
            LEFT JOIN work_centers wc ON rs.work_center_id = wc.id
            WHERE rs.routing_id = ?
            ORDER BY rs.sequence_number ASC
        `, [id]);
        routing.steps = stepsResult;
        res.json(routing);
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error creating routing:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.createRouting = createRouting;
// Update routing
const updateRouting = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        const { name, description, isActive, steps } = req.body;
        // Check if routing exists
        const [rows] = yield connection.query('SELECT id FROM routings WHERE id = ?', [id]);
        if (rows.length === 0) {
            throw new Error('Routing not found');
        }
        // Update routing header
        yield connection.query(`
            UPDATE routings
            SET name = COALESCE(?, name),
                description = ?,
                is_active = COALESCE(?, is_active)
            WHERE id = ?
        `, [name, description, isActive, id]);
        // Update steps if provided
        if (steps && Array.isArray(steps)) {
            // Delete existing steps
            yield connection.query('DELETE FROM routing_steps WHERE routing_id = ?', [id]);
            // Insert updated steps
            for (const step of steps) {
                yield connection.query(`
                    INSERT INTO routing_steps (
                        id, routing_id, sequence_number, work_center_id,
                        operation_name, description,
                        setup_time_minutes, run_time_minutes,
                        labor_cost_per_hour, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    step.id,
                    id,
                    step.sequenceNumber,
                    step.workCenterId,
                    step.operationName,
                    step.description || null,
                    step.setupTimeMinutes || 0,
                    step.runTimeMinutes || 0,
                    step.laborCostPerHour || 0,
                    step.notes || null
                ]);
            }
        }
        yield connection.commit();
        // Return updated routing
        const [result] = yield db_1.pool.query(`
            SELECT r.*, p.name as product_name
            FROM routings r
            LEFT JOIN products p ON r.product_id = p.id
            WHERE r.id = ?
        `, [id]);
        const routing = result[0];
        const [stepsResult] = yield db_1.pool.query(`
            SELECT rs.*, wc.name as work_center_name
            FROM routing_steps rs
            LEFT JOIN work_centers wc ON rs.work_center_id = wc.id
            WHERE rs.routing_id = ?
            ORDER BY rs.sequence_number ASC
        `, [id]);
        routing.steps = stepsResult;
        res.json(routing);
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error updating routing:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.updateRouting = updateRouting;
// Delete routing
const deleteRouting = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Check if routing is used in any production orders
        const [orders] = yield db_1.pool.query('SELECT id FROM production_orders WHERE routing_id = ?', [id]);
        if (orders.length > 0) {
            return res.status(400).json({
                message: 'Cannot delete routing: it is used in production orders'
            });
        }
        // Delete routing (steps will be cascade deleted)
        yield db_1.pool.query('DELETE FROM routings WHERE id = ?', [id]);
        res.json({ message: 'Routing deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting routing:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteRouting = deleteRouting;
// Calculate total time and cost for a routing
const calculateRoutingCost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { quantity } = req.query;
        const qty = Number(quantity) || 1;
        const [steps] = yield db_1.pool.query(`
            SELECT rs.*, wc.cost_per_hour as work_center_cost_per_hour
            FROM routing_steps rs
            LEFT JOIN work_centers wc ON rs.work_center_id = wc.id
            WHERE rs.routing_id = ?
            ORDER BY rs.sequence_number ASC
        `, [id]);
        let totalSetupTime = 0;
        let totalRunTime = 0;
        let totalLaborCost = 0;
        let totalWorkCenterCost = 0;
        for (const step of steps) {
            const setupTime = step.setup_time_minutes || 0;
            const runTimePerUnit = step.run_time_minutes || 0;
            const runTime = runTimePerUnit * qty;
            const totalTime = setupTime + runTime;
            totalSetupTime += setupTime;
            totalRunTime += runTime;
            // Labor cost
            const laborCost = (totalTime / 60) * (step.labor_cost_per_hour || 0);
            totalLaborCost += laborCost;
            // Work center cost
            const workCenterCost = (totalTime / 60) * (step.work_center_cost_per_hour || 0);
            totalWorkCenterCost += workCenterCost;
        }
        res.json({
            quantity: qty,
            totalSetupTimeMinutes: totalSetupTime,
            totalRunTimeMinutes: totalRunTime,
            totalTimeMinutes: totalSetupTime + totalRunTime,
            totalLaborCost,
            totalWorkCenterCost,
            totalCost: totalLaborCost + totalWorkCenterCost,
            steps: steps.length
        });
    }
    catch (error) {
        console.error('Error calculating routing cost:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.calculateRoutingCost = calculateRoutingCost;
