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
exports.postDepreciation = exports.deleteFixedAsset = exports.updateFixedAsset = exports.createFixedAsset = exports.getFixedAssets = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../utils/errorHandler");
const auditController_1 = require("./auditController");
const eventBus_1 = require("../utils/eventBus");
const getFixedAssets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [assets] = yield db_1.pool.query('SELECT * FROM fixed_assets');
        res.json(assets);
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
});
exports.getFixedAssets = getFixedAssets;
const createFixedAsset = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const asset = req.body;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        const id = asset.id || (0, crypto_1.randomUUID)();
        yield connection.query(`INSERT INTO fixed_assets (id, name, purchaseDate, purchaseCost, salvageValue, lifeYears, assetAccountId, accumulatedDepreciationAccountId, expenseAccountId, status, lastDepreciationDate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id, asset.name, asset.purchaseDate, asset.purchaseCost, asset.salvageValue, asset.lifeYears,
            asset.assetAccountId, asset.accumulatedDepreciationAccountId, asset.expenseAccountId,
            asset.status || 'ACTIVE', asset.lastDepreciationDate
        ]);
        yield connection.commit();
        res.status(201).json(Object.assign(Object.assign({}, asset), { id }));
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.createFixedAsset = createFixedAsset;
const updateFixedAsset = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const asset = req.body;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        yield connection.query(`UPDATE fixed_assets SET 
            name=?, purchaseDate=?, purchaseCost=?, salvageValue=?, lifeYears=?, 
            assetAccountId=?, accumulatedDepreciationAccountId=?, expenseAccountId=?, 
            status=?, lastDepreciationDate=?
            WHERE id=?`, [
            asset.name, asset.purchaseDate, asset.purchaseCost, asset.salvageValue, asset.lifeYears,
            asset.assetAccountId, asset.accumulatedDepreciationAccountId, asset.expenseAccountId,
            asset.status, asset.lastDepreciationDate,
            id
        ]);
        yield connection.commit();
        res.json(asset);
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.updateFixedAsset = updateFixedAsset;
const deleteFixedAsset = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const connection = yield (0, db_1.getConnection)();
    try {
        yield connection.beginTransaction();
        yield connection.query('DELETE FROM fixed_assets WHERE id = ?', [id]);
        yield connection.commit();
        res.json({ message: 'Asset deleted' });
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'operation');
    }
    finally {
        connection.release();
    }
});
exports.deleteFixedAsset = deleteFixedAsset;
// POST depreciation for a fixed asset (Straight-Line method)
const postDepreciation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const { id } = req.params;
    const connection = yield (0, db_1.getConnection)();
    try {
        const authReq = req;
        const user = ((_a = authReq.user) === null || _a === void 0 ? void 0 : _a.username) || ((_b = authReq.user) === null || _b === void 0 ? void 0 : _b.name) || 'System';
        // Get asset details
        const [assetRows] = yield connection.query('SELECT * FROM fixed_assets WHERE id = ?', [id]);
        const asset = assetRows[0];
        if (!asset) {
            connection.release();
            return res.status(404).json({ error: 'Asset not found' });
        }
        if (asset.status !== 'ACTIVE') {
            connection.release();
            return res.status(400).json({ error: 'Only active assets can be depreciated' });
        }
        // Calculate monthly depreciation (Straight-Line)
        const purchaseCost = parseFloat(asset.purchaseCost) || 0;
        const salvageValue = parseFloat(asset.salvageValue) || 0;
        const lifeYears = parseFloat(asset.lifeYears) || 1;
        const monthlyDepreciation = Math.round(((purchaseCost - salvageValue) / (lifeYears * 12)) * 100) / 100;
        if (monthlyDepreciation <= 0) {
            connection.release();
            return res.status(400).json({ error: 'Depreciation amount is zero or negative' });
        }
        yield connection.beginTransaction();
        // Create journal entry: DR Depreciation Expense, CR Accumulated Depreciation
        const journalId = (0, crypto_1.randomUUID)();
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        yield connection.query(`INSERT INTO journal_entries (id, date, description, referenceId, createdBy) VALUES (?, ?, ?, ?, ?)`, [journalId, now, `إهلاك أصل ثابت: ${asset.name}`, `DEPRECIATION-${id}`, user]);
        // Debit line: Depreciation Expense Account
        const [expAccRows] = yield connection.query('SELECT name FROM accounts WHERE id = ?', [asset.expenseAccountId]);
        const expAccName = ((_c = expAccRows[0]) === null || _c === void 0 ? void 0 : _c.name) || 'مصروف إهلاك';
        yield connection.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, ?, ?)`, [journalId, asset.expenseAccountId, expAccName, monthlyDepreciation, 0]);
        // Credit line: Accumulated Depreciation Account
        const [accDepRows] = yield connection.query('SELECT name FROM accounts WHERE id = ?', [asset.accumulatedDepreciationAccountId]);
        const accDepName = ((_d = accDepRows[0]) === null || _d === void 0 ? void 0 : _d.name) || 'مجمع الإهلاك';
        yield connection.query(`INSERT INTO journal_lines (journalId, accountId, accountName, debit, credit) VALUES (?, ?, ?, ?, ?)`, [journalId, asset.accumulatedDepreciationAccountId, accDepName, 0, monthlyDepreciation]);
        // Update account balances
        yield connection.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [monthlyDepreciation, asset.expenseAccountId]);
        yield connection.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [monthlyDepreciation, asset.accumulatedDepreciationAccountId]);
        // Update asset's last depreciation date
        yield connection.query('UPDATE fixed_assets SET lastDepreciationDate = ? WHERE id = ?', [now, id]);
        yield connection.commit();
        try {
            yield (0, auditController_1.logAction)(user, 'ACCOUNTING', 'DEPRECIATION', `إهلاك أصل: ${asset.name}`, `المبلغ: ${monthlyDepreciation}`);
        }
        catch (e) { }
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'fixed-assets', updatedBy: user });
        res.json({
            message: `تم ترحيل إهلاك ${asset.name} بمبلغ ${monthlyDepreciation}`,
            journalId,
            depreciationAmount: monthlyDepreciation,
            assetName: asset.name
        });
    }
    catch (error) {
        yield connection.rollback();
        return (0, errorHandler_1.handleControllerError)(res, error, 'depreciation');
    }
    finally {
        connection.release();
    }
});
exports.postDepreciation = postDepreciation;
