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
exports.renewContract = exports.deleteContract = exports.updateContract = exports.createContract = exports.getContract = exports.getContracts = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const auditController_1 = require("./auditController");
// ========================================
// CONTRACTS
// ========================================
const getContracts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status, partnerId, search, expiringDays } = req.query;
        let query = `SELECT * FROM contracts WHERE 1=1`;
        const params = [];
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        if (partnerId) {
            query += ' AND partnerId = ?';
            params.push(partnerId);
        }
        if (search) {
            query += ' AND (title LIKE ? OR contractNumber LIKE ? OR partnerName LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s);
        }
        if (expiringDays) {
            query += ' AND endDate <= DATE_ADD(CURDATE(), INTERVAL ? DAY) AND status = ?';
            params.push(Number(expiringDays), 'ACTIVE');
        }
        query += ' ORDER BY createdAt DESC';
        const [rows] = yield db_1.pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getContracts = getContracts;
const getContract = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [rows] = yield db_1.pool.query('SELECT * FROM contracts WHERE id = ?', [id]);
        if (!rows[0])
            return res.status(404).json({ error: 'Contract not found' });
        const contract = rows[0];
        if (contract.checklist && typeof contract.checklist === 'string') {
            contract.checklist = JSON.parse(contract.checklist);
        }
        res.json(contract);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getContract = getContract;
const createContract = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { title, partnerId, partnerName, contractType, startDate, endDate, value, isAutoRenew, renewalPeriodMonths, renewalNoticeDays, checklist, terms, notes } = req.body;
        if (!title || !startDate || !endDate)
            return res.status(400).json({ error: 'Title, start date, and end date are required' });
        const id = (0, crypto_1.randomUUID)();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        const [lastContract] = yield db_1.pool.query("SELECT contractNumber FROM contracts ORDER BY createdAt DESC LIMIT 1");
        const lastNum = ((_b = lastContract[0]) === null || _b === void 0 ? void 0 : _b.contractNumber) ? parseInt(lastContract[0].contractNumber.replace('CTR-', '')) : 0;
        const contractNumber = `CTR-${String((lastNum || 0) + 1).padStart(5, '0')}`;
        yield db_1.pool.query(`
            INSERT INTO contracts (id, title, contractNumber, partnerId, partnerName, contractType, startDate, endDate, value, isAutoRenew, renewalPeriodMonths, renewalNoticeDays, checklist, terms, notes, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, title, contractNumber, partnerId || null, partnerName || null, contractType || 'SERVICE', startDate, endDate, value || 0, isAutoRenew || false, renewalPeriodMonths || 12, renewalNoticeDays || 30, checklist ? JSON.stringify(checklist) : null, terms || null, notes || null, user]);
        yield (0, auditController_1.logAction)(user, 'Contracts', 'CONTRACT_CREATED', `Created contract: ${title}`, `ID: ${id}`);
        res.status(201).json({ id, contractNumber });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.createContract = createContract;
const updateContract = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { title, partnerId, partnerName, contractType, status, startDate, endDate, value, isAutoRenew, renewalPeriodMonths, renewalNoticeDays, checklist, terms, notes, signedDate, signedBy } = req.body;
        const fields = [];
        const params = [];
        const addField = (field, value) => { if (value !== undefined) {
            fields.push(`${field} = ?`);
            params.push(value);
        } };
        addField('title', title);
        addField('partnerId', partnerId);
        addField('partnerName', partnerName);
        addField('contractType', contractType);
        addField('status', status);
        addField('startDate', startDate);
        addField('endDate', endDate);
        addField('value', value);
        addField('isAutoRenew', isAutoRenew);
        addField('renewalPeriodMonths', renewalPeriodMonths);
        addField('renewalNoticeDays', renewalNoticeDays);
        addField('terms', terms);
        addField('notes', notes);
        addField('signedDate', signedDate);
        addField('signedBy', signedBy);
        if (checklist !== undefined) {
            fields.push('checklist = ?');
            params.push(JSON.stringify(checklist));
        }
        if (fields.length === 0)
            return res.status(400).json({ error: 'No fields to update' });
        params.push(id);
        yield db_1.pool.query(`UPDATE contracts SET ${fields.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.updateContract = updateContract;
const deleteContract = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const [contract] = yield db_1.pool.query('SELECT status FROM contracts WHERE id = ?', [id]);
        if (((_a = contract[0]) === null || _a === void 0 ? void 0 : _a.status) === 'ACTIVE')
            return res.status(400).json({ error: 'Cannot delete active contracts. Cancel first.' });
        yield db_1.pool.query('DELETE FROM contracts WHERE id = ?', [id]);
        res.json({ success: true });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.deleteContract = deleteContract;
const renewContract = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const [contracts] = yield db_1.pool.query('SELECT * FROM contracts WHERE id = ?', [id]);
        if (!contracts[0])
            return res.status(404).json({ error: 'Contract not found' });
        const old = contracts[0];
        const newId = (0, crypto_1.randomUUID)();
        const user = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || 'System';
        const renewalMonths = old.renewalPeriodMonths || 12;
        const newStart = new Date(old.endDate);
        newStart.setDate(newStart.getDate() + 1);
        const newEnd = new Date(newStart);
        newEnd.setMonth(newEnd.getMonth() + renewalMonths);
        const newStartStr = newStart.toISOString().split('T')[0];
        const newEndStr = newEnd.toISOString().split('T')[0];
        const [lastContract] = yield db_1.pool.query("SELECT contractNumber FROM contracts ORDER BY createdAt DESC LIMIT 1");
        const lastNum = ((_b = lastContract[0]) === null || _b === void 0 ? void 0 : _b.contractNumber) ? parseInt(lastContract[0].contractNumber.replace('CTR-', '')) : 0;
        const contractNumber = `CTR-${String((lastNum || 0) + 1).padStart(5, '0')}`;
        yield db_1.pool.query(`
            INSERT INTO contracts (id, title, contractNumber, partnerId, partnerName, contractType, status, startDate, endDate, value, isAutoRenew, renewalPeriodMonths, renewalNoticeDays, checklist, terms, notes, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [newId, `${old.title} (تجديد)`, contractNumber, old.partnerId, old.partnerName, old.contractType, newStartStr, newEndStr, old.value, old.isAutoRenew, old.renewalPeriodMonths, old.renewalNoticeDays, old.checklist, old.terms, `تجديد من عقد: ${old.contractNumber}`, user]);
        // Mark old as renewed
        yield db_1.pool.query("UPDATE contracts SET status = 'RENEWED' WHERE id = ?", [id]);
        yield (0, auditController_1.logAction)(user, 'Contracts', 'CONTRACT_RENEWED', `Renewed contract ${old.contractNumber} → ${contractNumber}`, `Old: ${id}, New: ${newId}`);
        res.json({ success: true, newId, contractNumber });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.renewContract = renewContract;
