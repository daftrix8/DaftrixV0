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
exports.getQualityStats = exports.deleteQualityCheck = exports.completeQualityCheck = exports.createQualityCheck = exports.getQualityCheck = exports.getQualityChecks = exports.deleteQCTemplate = exports.updateQCTemplate = exports.createQCTemplate = exports.getQCTemplate = exports.getQCTemplates = void 0;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
/**
 * Quality Control Controller
 * Manages quality check templates, criteria, inspections, and defects
 */
// ========================================
// QUALITY CHECK TEMPLATES
// ========================================
// Get all QC templates
const getQCTemplates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productId, checkType, isActive } = req.query;
        let query = `
            SELECT qct.*, p.name as product_name, p.sku as product_sku
            FROM quality_check_templates qct
            LEFT JOIN products p ON qct.product_id = p.id
            WHERE 1=1
        `;
        const params = [];
        if (productId) {
            query += ' AND qct.product_id = ?';
            params.push(productId);
        }
        if (checkType) {
            query += ' AND qct.check_type = ?';
            params.push(checkType);
        }
        if (isActive !== undefined) {
            query += ' AND qct.is_active = ?';
            params.push(isActive === 'true' ? 1 : 0);
        }
        query += ' ORDER BY qct.code ASC';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching QC templates:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getQCTemplates = getQCTemplates;
// Get QC template by ID with criteria
const getQCTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Get template
        const [templateRows] = yield db_1.pool.query(`
            SELECT qct.*, p.name as product_name, p.sku as product_sku
            FROM quality_check_templates qct
            LEFT JOIN products p ON qct.product_id = p.id
            WHERE qct.id = ?
        `, [id]);
        if (templateRows.length === 0) {
            return res.status(404).json({ message: 'QC template not found' });
        }
        const template = templateRows[0];
        // Get criteria
        const [criteriaRows] = yield db_1.pool.query(`
            SELECT * FROM quality_criteria
            WHERE template_id = ?
            ORDER BY sequence_number ASC
        `, [id]);
        template.criteria = criteriaRows;
        res.json(template);
    }
    catch (error) {
        console.error('Error fetching QC template:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getQCTemplate = getQCTemplate;
// Create QC template with criteria
const createQCTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id, code, name, productId, description, checkType, isActive, criteria } = req.body;
        // Check if code exists
        const [existing] = yield connection.query('SELECT id FROM quality_check_templates WHERE code = ?', [code]);
        if (existing.length > 0) {
            throw new Error('QC template code already exists');
        }
        // Create template
        yield connection.query(`
            INSERT INTO quality_check_templates (
                id, code, name, product_id, description, check_type, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            code,
            name,
            productId || null,
            description || null,
            checkType || 'FINAL',
            isActive !== undefined ? isActive : true
        ]);
        // Create criteria
        if (criteria && Array.isArray(criteria)) {
            for (const criterion of criteria) {
                yield connection.query(`
                    INSERT INTO quality_criteria (
                        id, template_id, sequence_number, criterion_name,
                        description, measurement_type, min_value, max_value,
                        target_value, unit, is_critical
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    criterion.id,
                    id,
                    criterion.sequenceNumber,
                    criterion.criterionName,
                    criterion.description || null,
                    criterion.measurementType || 'PASS_FAIL',
                    criterion.minValue || null,
                    criterion.maxValue || null,
                    criterion.targetValue || null,
                    criterion.unit || null,
                    criterion.isCritical || false
                ]);
            }
        }
        yield connection.commit();
        // Return created template
        const [result] = yield db_1.pool.query(`
            SELECT qct.*, p.name as product_name
            FROM quality_check_templates qct
            LEFT JOIN products p ON qct.product_id = p.id
            WHERE qct.id = ?
        `, [id]);
        const template = result[0];
        const [criteriaResult] = yield db_1.pool.query('SELECT * FROM quality_criteria WHERE template_id = ? ORDER BY sequence_number ASC', [id]);
        template.criteria = criteriaResult;
        res.json(template);
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error creating QC template:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.createQCTemplate = createQCTemplate;
// Update QC template
const updateQCTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        const { name, description, checkType, isActive, criteria } = req.body;
        // Update template
        yield connection.query(`
            UPDATE quality_check_templates
            SET name = COALESCE(?, name),
                description = ?,
                check_type = COALESCE(?, check_type),
                is_active = COALESCE(?, is_active)
            WHERE id = ?
        `, [name, description, checkType, isActive, id]);
        // Update criteria if provided
        if (criteria && Array.isArray(criteria)) {
            // Delete existing criteria
            yield connection.query('DELETE FROM quality_criteria WHERE template_id = ?', [id]);
            // Insert updated criteria
            for (const criterion of criteria) {
                yield connection.query(`
                    INSERT INTO quality_criteria (
                        id, template_id, sequence_number, criterion_name,
                        description, measurement_type, min_value, max_value,
                        target_value, unit, is_critical
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    criterion.id,
                    id,
                    criterion.sequenceNumber,
                    criterion.criterionName,
                    criterion.description || null,
                    criterion.measurementType || 'PASS_FAIL',
                    criterion.minValue || null,
                    criterion.maxValue || null,
                    criterion.targetValue || null,
                    criterion.unit || null,
                    criterion.isCritical || false
                ]);
            }
        }
        yield connection.commit();
        // Return updated template
        const [result] = yield db_1.pool.query(`
            SELECT qct.*, p.name as product_name
            FROM quality_check_templates qct
            LEFT JOIN products p ON qct.product_id = p.id
            WHERE qct.id = ?
        `, [id]);
        const template = result[0];
        const [criteriaResult] = yield db_1.pool.query('SELECT * FROM quality_criteria WHERE template_id = ? ORDER BY sequence_number ASC', [id]);
        template.criteria = criteriaResult;
        res.json(template);
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error updating QC template:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.updateQCTemplate = updateQCTemplate;
// Delete QC template
const deleteQCTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Check if used in quality checks
        const [checks] = yield db_1.pool.query('SELECT id FROM quality_checks WHERE template_id = ?', [id]);
        if (checks.length > 0) {
            return res.status(400).json({
                message: 'Cannot delete template: it is used in quality checks'
            });
        }
        yield db_1.pool.query('DELETE FROM quality_check_templates WHERE id = ?', [id]);
        res.json({ message: 'QC template deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting QC template:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteQCTemplate = deleteQCTemplate;
// ========================================
// QUALITY CHECKS
// ========================================
// Get all quality checks
const getQualityChecks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productId, status, result, startDate, endDate } = req.query;
        let query = `
            SELECT qc.*, 
                   qct.name as template_name,
                   qct.check_type,
                   p.name as product_name,
                   p.sku as product_sku,
                   po.order_number
            FROM quality_checks qc
            LEFT JOIN quality_check_templates qct ON qc.template_id = qct.id
            LEFT JOIN products p ON qc.product_id = p.id
            LEFT JOIN production_orders po ON qc.production_order_id = po.id
            WHERE 1=1
        `;
        const params = [];
        if (productId) {
            query += ' AND qc.product_id = ?';
            params.push(productId);
        }
        if (status) {
            query += ' AND qc.status = ?';
            params.push(status);
        }
        if (result) {
            query += ' AND qc.result = ?';
            params.push(result);
        }
        if (startDate) {
            query += ' AND qc.check_date >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND qc.check_date <= ?';
            params.push(endDate);
        }
        query += ' ORDER BY qc.check_date DESC';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching quality checks:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getQualityChecks = getQualityChecks;
// Get quality check by ID with results
const getQualityCheck = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Get check
        const [checkRows] = yield db_1.pool.query(`
            SELECT qc.*, 
                   qct.name as template_name,
                   p.name as product_name,
                   po.order_number
            FROM quality_checks qc
            LEFT JOIN quality_check_templates qct ON qc.template_id = qct.id
            LEFT JOIN products p ON qc.product_id = p.id
            LEFT JOIN production_orders po ON qc.production_order_id = po.id
            WHERE qc.id = ?
        `, [id]);
        if (checkRows.length === 0) {
            return res.status(404).json({ message: 'Quality check not found' });
        }
        const check = checkRows[0];
        // Get results
        const [resultsRows] = yield db_1.pool.query('SELECT * FROM quality_check_results WHERE quality_check_id = ?', [id]);
        check.results = resultsRows;
        // Get defects
        const [defectsRows] = yield db_1.pool.query('SELECT * FROM quality_defects WHERE quality_check_id = ?', [id]);
        check.defects = defectsRows;
        res.json(check);
    }
    catch (error) {
        console.error('Error fetching quality check:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getQualityCheck = getQualityCheck;
// Create quality check
const createQualityCheck = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id, checkNumber, templateId, productionOrderId, productId, batchNumber, qtyInspected, inspector, results, defects } = req.body;
        // Create check
        yield connection.query(`
            INSERT INTO quality_checks (
                id, check_number, template_id, production_order_id,
                product_id, batch_number, qty_inspected,
                inspector, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS')
        `, [
            id,
            checkNumber,
            templateId,
            productionOrderId || null,
            productId,
            batchNumber || null,
            qtyInspected,
            inspector || null
        ]);
        // Create results if provided
        if (results && Array.isArray(results)) {
            for (const result of results) {
                yield connection.query(`
                    INSERT INTO quality_check_results (
                        id, quality_check_id, criterion_id, criterion_name,
                        measurement_type, result_pass_fail, result_numeric,
                        result_text, min_value, max_value, is_within_spec, is_critical
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    result.id,
                    id,
                    result.criterionId,
                    result.criterionName,
                    result.measurementType,
                    result.resultPassFail || null,
                    result.resultNumeric || null,
                    result.resultText || null,
                    result.minValue || null,
                    result.maxValue || null,
                    result.isWithinSpec || false,
                    result.isCritical || false
                ]);
            }
        }
        // Create defects if provided
        if (defects && Array.isArray(defects)) {
            for (const defect of defects) {
                yield connection.query(`
                    INSERT INTO quality_defects (
                        id, quality_check_id, criterion_id, defect_type,
                        severity, quantity, description
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    defect.id,
                    id,
                    defect.criterionId || null,
                    defect.defectType,
                    defect.severity || 'MAJOR',
                    defect.quantity || 1,
                    defect.description || null
                ]);
            }
        }
        yield connection.commit();
        // Return created check
        const [result] = yield db_1.pool.query('SELECT * FROM quality_checks WHERE id = ?', [id]);
        res.json(result[0]);
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error creating quality check:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.createQualityCheck = createQualityCheck;
// Complete quality check
const completeQualityCheck = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const { id } = req.params;
        const { qtyPassed, qtyFailed, result, notes } = req.body;
        yield connection.query(`
            UPDATE quality_checks
            SET status = 'COMPLETED',
                qty_passed = ?,
                qty_failed = ?,
                result = ?,
                notes = ?
            WHERE id = ?
        `, [qtyPassed, qtyFailed, result, notes || null, id]);
        yield connection.commit();
        const [resultRow] = yield db_1.pool.query('SELECT * FROM quality_checks WHERE id = ?', [id]);
        res.json(resultRow[0]);
    }
    catch (error) {
        yield connection.rollback();
        console.error('Error completing quality check:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.completeQualityCheck = completeQualityCheck;
// Delete quality check
const deleteQualityCheck = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield db_1.pool.query('DELETE FROM quality_checks WHERE id = ?', [id]);
        res.json({ message: 'Quality check deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting quality check:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteQualityCheck = deleteQualityCheck;
// Get quality statistics
const getQualityStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate, productId } = req.query;
        let dateFilter = '';
        const params = [];
        if (startDate && endDate) {
            dateFilter = 'AND check_date BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }
        let productFilter = '';
        if (productId) {
            productFilter = 'AND product_id = ?';
            params.push(productId);
        }
        const [stats] = yield db_1.pool.query(`
            SELECT 
                COUNT(*) as total_checks,
                SUM(CASE WHEN result = 'PASS' THEN 1 ELSE 0 END) as passed_checks,
                SUM(CASE WHEN result = 'FAIL' THEN 1 ELSE 0 END) as failed_checks,
                SUM(qty_inspected) as total_qty_inspected,
                SUM(qty_passed) as total_qty_passed,
                SUM(qty_failed) as total_qty_failed,
                ROUND((SUM(qty_passed) / SUM(qty_inspected)) * 100, 2) as pass_rate
            FROM quality_checks
            WHERE status = 'COMPLETED'
            ${dateFilter}
            ${productFilter}
        `, params);
        res.json(stats[0]);
    }
    catch (error) {
        console.error('Error fetching quality stats:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getQualityStats = getQualityStats;
