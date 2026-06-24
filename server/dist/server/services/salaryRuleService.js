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
exports.deleteSalaryRule = exports.updateSalaryRule = exports.createSalaryRule = exports.getSalaryRule = exports.getSalaryRules = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const getSalaryRules = (params) => __awaiter(void 0, void 0, void 0, function* () {
    let query = `
        SELECT sr.*, sc.name as componentName, sc.code as componentCode
        FROM hr_salary_rules sr
        LEFT JOIN salary_components sc ON sr.componentId = sc.id
        WHERE 1=1
    `;
    const queryParams = [];
    if ((params === null || params === void 0 ? void 0 : params.isActive) !== undefined) {
        query += ' AND sr.isActive = ?';
        queryParams.push(params.isActive ? 1 : 0);
    }
    query += ' ORDER BY sr.createdAt DESC';
    const [rows] = yield db_1.pool.query(query, queryParams);
    return rows;
});
exports.getSalaryRules = getSalaryRules;
const getSalaryRule = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const [rows] = yield db_1.pool.query(`
        SELECT sr.*, sc.name as componentName, sc.code as componentCode
        FROM hr_salary_rules sr
        LEFT JOIN salary_components sc ON sr.componentId = sc.id
        WHERE sr.id = ?
    `, [id]);
    if (rows.length === 0)
        return null;
    return rows[0];
});
exports.getSalaryRule = getSalaryRule;
const createSalaryRule = (data) => __awaiter(void 0, void 0, void 0, function* () {
    const id = (0, crypto_1.randomUUID)();
    yield db_1.pool.query(`
        INSERT INTO hr_salary_rules 
        (id, name, nameEn, type, calculationType, amount, componentId, notes, isActive)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id,
        data.name,
        data.nameEn || null,
        data.type,
        data.calculationType || 'FIXED',
        data.amount,
        data.componentId || null,
        data.notes || null,
        data.isActive !== false ? 1 : 0
    ]);
    return id;
});
exports.createSalaryRule = createSalaryRule;
const updateSalaryRule = (id, data) => __awaiter(void 0, void 0, void 0, function* () {
    const fields = [];
    const values = [];
    Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
            fields.push(`\`${key}\` = ?`);
            values.push(value === true ? 1 : value === false ? 0 : value);
        }
    });
    if (fields.length === 0)
        return;
    values.push(id);
    yield db_1.pool.query(`UPDATE hr_salary_rules SET ${fields.join(', ')} WHERE id = ?`, values);
});
exports.updateSalaryRule = updateSalaryRule;
const deleteSalaryRule = (id) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.pool.query('DELETE FROM hr_salary_rules WHERE id = ?', [id]);
});
exports.deleteSalaryRule = deleteSalaryRule;
exports.default = {
    getSalaryRules: exports.getSalaryRules,
    getSalaryRule: exports.getSalaryRule,
    createSalaryRule: exports.createSalaryRule,
    updateSalaryRule: exports.updateSalaryRule,
    deleteSalaryRule: exports.deleteSalaryRule
};
