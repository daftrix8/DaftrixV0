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
exports.getCurrencies = getCurrencies;
exports.getCurrency = getCurrency;
exports.createCurrency = createCurrency;
exports.updateCurrency = updateCurrency;
exports.deleteCurrency = deleteCurrency;
exports.getExchangeRates = getExchangeRates;
exports.getLatestRate = getLatestRate;
exports.createExchangeRate = createExchangeRate;
exports.convertAmount = convertAmount;
exports.fetchLiveRates = fetchLiveRates;
exports.getCurrencyTransactions = getCurrencyTransactions;
exports.createCurrencyTransaction = createCurrencyTransaction;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
// Helper to get user from request
const getUser = (req) => {
    var _a, _b;
    return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.username) || 'system';
};
// ============================================================
// CURRENCIES CRUD
// ============================================================
function getCurrencies(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            const [currencies] = yield conn.query('SELECT * FROM currencies ORDER BY isBaseCurrency DESC, code ASC');
            res.json(currencies);
        }
        catch (error) {
            (0, errorHandler_1.handleControllerError)(res, error, 'fetching currencies');
        }
        finally {
            conn.release();
        }
    });
}
function getCurrency(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            const [currencies] = yield conn.query('SELECT * FROM currencies WHERE code = ?', [req.params.code]);
            if (currencies.length === 0) {
                return res.status(404).json({ error: 'Currency not found' });
            }
            res.json(currencies[0]);
        }
        catch (error) {
            (0, errorHandler_1.handleControllerError)(res, error, 'fetching currency');
        }
        finally {
            conn.release();
        }
    });
}
function createCurrency(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            const { code, nameAr, nameEn, symbol, decimalPlaces = 2, isActive = true } = req.body;
            if (!code || !nameAr || !nameEn) {
                return res.status(400).json({ error: 'code, nameAr, and nameEn are required' });
            }
            yield conn.query(`INSERT INTO currencies (code, nameAr, nameEn, symbol, decimalPlaces, isActive, isBaseCurrency)
             VALUES (?, ?, ?, ?, ?, ?, FALSE)`, [code.toUpperCase(), nameAr, nameEn, symbol || '', decimalPlaces, isActive]);
            const [inserted] = yield conn.query('SELECT * FROM currencies WHERE code = ?', [code.toUpperCase()]);
            yield (0, auditController_1.logAction)(getUser(req), 'CURRENCIES', 'CREATE', `Created currency: ${code}`, JSON.stringify(req.body));
            res.status(201).json(inserted[0]);
        }
        catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Currency code already exists' });
            }
            (0, errorHandler_1.handleControllerError)(res, error, 'creating currency');
        }
        finally {
            conn.release();
        }
    });
}
function updateCurrency(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            const { code } = req.params;
            const { nameAr, nameEn, symbol, decimalPlaces, isActive } = req.body;
            const updates = [];
            const values = [];
            if (nameAr !== undefined) {
                updates.push('nameAr = ?');
                values.push(nameAr);
            }
            if (nameEn !== undefined) {
                updates.push('nameEn = ?');
                values.push(nameEn);
            }
            if (symbol !== undefined) {
                updates.push('symbol = ?');
                values.push(symbol);
            }
            if (decimalPlaces !== undefined) {
                updates.push('decimalPlaces = ?');
                values.push(decimalPlaces);
            }
            if (isActive !== undefined) {
                updates.push('isActive = ?');
                values.push(isActive);
            }
            if (updates.length === 0) {
                return res.status(400).json({ error: 'No fields to update' });
            }
            values.push(code.toUpperCase());
            yield conn.query(`UPDATE currencies SET ${updates.join(', ')} WHERE code = ?`, values);
            const [updated] = yield conn.query('SELECT * FROM currencies WHERE code = ?', [code.toUpperCase()]);
            yield (0, auditController_1.logAction)(getUser(req), 'CURRENCIES', 'UPDATE', `Updated currency: ${code}`, JSON.stringify(req.body));
            res.json(updated[0]);
        }
        catch (error) {
            (0, errorHandler_1.handleControllerError)(res, error, 'updating currency');
        }
        finally {
            conn.release();
        }
    });
}
function deleteCurrency(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const conn = yield (0, db_1.getConnection)();
        try {
            const { code } = req.params;
            // Check if it's the base currency
            const [currency] = yield conn.query('SELECT isBaseCurrency FROM currencies WHERE code = ?', [code]);
            if ((_a = currency[0]) === null || _a === void 0 ? void 0 : _a.isBaseCurrency) {
                return res.status(400).json({ error: 'Cannot delete base currency' });
            }
            // Check if currency is in use
            const [partners] = yield conn.query('SELECT COUNT(*) as count FROM partners WHERE currencyCode = ?', [code]);
            const [invoices] = yield conn.query('SELECT COUNT(*) as count FROM invoices WHERE currencyCode = ?', [code]);
            if (partners[0].count > 0 || invoices[0].count > 0) {
                return res.status(400).json({ error: 'Cannot delete currency that is in use' });
            }
            yield conn.query('DELETE FROM currencies WHERE code = ?', [code]);
            yield (0, auditController_1.logAction)(getUser(req), 'CURRENCIES', 'DELETE', `Deleted currency: ${code}`, '');
            res.json({ success: true });
        }
        catch (error) {
            (0, errorHandler_1.handleControllerError)(res, error, 'deleting currency');
        }
        finally {
            conn.release();
        }
    });
}
// ============================================================
// EXCHANGE RATES
// ============================================================
function getExchangeRates(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            const { from, to, date, latest } = req.query;
            let query = 'SELECT * FROM exchange_rates WHERE 1=1';
            const params = [];
            if (from) {
                query += ' AND fromCurrency = ?';
                params.push(from);
            }
            if (to) {
                query += ' AND toCurrency = ?';
                params.push(to);
            }
            if (date) {
                query += ' AND effectiveDate = ?';
                params.push(date);
            }
            if (latest === 'true') {
                // Get only the latest rate for each currency pair
                query = `
                SELECT er.* FROM exchange_rates er
                INNER JOIN (
                    SELECT fromCurrency, toCurrency, MAX(effectiveDate) as maxDate
                    FROM exchange_rates
                    GROUP BY fromCurrency, toCurrency
                ) latest ON er.fromCurrency = latest.fromCurrency 
                    AND er.toCurrency = latest.toCurrency 
                    AND er.effectiveDate = latest.maxDate
            `;
            }
            query += ' ORDER BY effectiveDate DESC, fromCurrency ASC';
            const [rates] = yield conn.query(query, params);
            res.json(rates);
        }
        catch (error) {
            (0, errorHandler_1.handleControllerError)(res, error, 'fetching exchange rates');
        }
        finally {
            conn.release();
        }
    });
}
function getLatestRate(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            const { from, to } = req.query;
            if (!from || !to) {
                return res.status(400).json({ error: 'from and to currencies are required' });
            }
            // Get the latest rate for this pair
            const [rates] = yield conn.query(`SELECT * FROM exchange_rates 
             WHERE fromCurrency = ? AND toCurrency = ? 
             ORDER BY effectiveDate DESC LIMIT 1`, [from, to]);
            if (rates.length === 0) {
                // Try the reverse
                const [reverseRates] = yield conn.query(`SELECT * FROM exchange_rates 
                 WHERE fromCurrency = ? AND toCurrency = ? 
                 ORDER BY effectiveDate DESC LIMIT 1`, [to, from]);
                if (reverseRates.length > 0) {
                    const rate = reverseRates[0];
                    return res.json(Object.assign(Object.assign({}, rate), { fromCurrency: from, toCurrency: to, rate: 1 / rate.rate, isReverse: true }));
                }
                return res.status(404).json({ error: 'Exchange rate not found' });
            }
            res.json(rates[0]);
        }
        catch (error) {
            (0, errorHandler_1.handleControllerError)(res, error, 'fetching latest rate');
        }
        finally {
            conn.release();
        }
    });
}
function createExchangeRate(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            const { fromCurrency, toCurrency, rate, effectiveDate, source = 'MANUAL' } = req.body;
            if (!fromCurrency || !toCurrency || !rate) {
                return res.status(400).json({ error: 'fromCurrency, toCurrency, and rate are required' });
            }
            const id = (0, crypto_1.randomUUID)();
            const dateToUse = effectiveDate || new Date().toISOString().split('T')[0];
            const user = getUser(req);
            // Upsert - update if exists for same date, otherwise insert
            yield conn.query(`INSERT INTO exchange_rates (id, fromCurrency, toCurrency, rate, effectiveDate, source, createdBy)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE rate = VALUES(rate), source = VALUES(source), createdBy = VALUES(createdBy)`, [id, fromCurrency.toUpperCase(), toCurrency.toUpperCase(), rate, dateToUse, source, user]);
            yield (0, auditController_1.logAction)(user, 'EXCHANGE_RATES', 'CREATE', `Set rate: 1 ${fromCurrency} = ${rate} ${toCurrency}`, JSON.stringify(req.body));
            const [inserted] = yield conn.query('SELECT * FROM exchange_rates WHERE fromCurrency = ? AND toCurrency = ? AND effectiveDate = ?', [fromCurrency.toUpperCase(), toCurrency.toUpperCase(), dateToUse]);
            res.status(201).json(inserted[0]);
        }
        catch (error) {
            (0, errorHandler_1.handleControllerError)(res, error, 'creating exchange rate');
        }
        finally {
            conn.release();
        }
    });
}
function convertAmount(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            const { from, to, amount, date } = req.query;
            if (!from || !to || !amount) {
                return res.status(400).json({ error: 'from, to, and amount are required' });
            }
            const amountNum = parseFloat(amount);
            if (isNaN(amountNum)) {
                return res.status(400).json({ error: 'Invalid amount' });
            }
            // Same currency - no conversion needed
            if (from === to) {
                return res.json({ result: amountNum, rate: 1, from, to });
            }
            // Get the rate (try to find for specific date or latest)
            let query = `
            SELECT * FROM exchange_rates 
            WHERE fromCurrency = ? AND toCurrency = ?
        `;
            const params = [from, to];
            if (date) {
                query += ' AND effectiveDate <= ? ORDER BY effectiveDate DESC LIMIT 1';
                params.push(date);
            }
            else {
                query += ' ORDER BY effectiveDate DESC LIMIT 1';
            }
            const [rates] = yield conn.query(query, params);
            if (rates.length > 0) {
                const rate = rates[0].rate;
                return res.json({
                    result: amountNum * rate,
                    rate,
                    from,
                    to,
                    effectiveDate: rates[0].effectiveDate
                });
            }
            // Try reverse rate
            const reverseParams = [to, from];
            if (date) {
                reverseParams.push(date);
            }
            const [reverseRates] = yield conn.query(date
                ? `SELECT * FROM exchange_rates WHERE fromCurrency = ? AND toCurrency = ? AND effectiveDate <= ? ORDER BY effectiveDate DESC LIMIT 1`
                : `SELECT * FROM exchange_rates WHERE fromCurrency = ? AND toCurrency = ? ORDER BY effectiveDate DESC LIMIT 1`, reverseParams);
            if (reverseRates.length > 0) {
                const rate = 1 / reverseRates[0].rate;
                return res.json({
                    result: amountNum * rate,
                    rate,
                    from,
                    to,
                    effectiveDate: reverseRates[0].effectiveDate,
                    isReverse: true
                });
            }
            res.status(404).json({ error: 'Exchange rate not found' });
        }
        catch (error) {
            (0, errorHandler_1.handleControllerError)(res, error, 'converting amount');
        }
        finally {
            conn.release();
        }
    });
}
// ============================================================
// EXTERNAL API INTEGRATION (ExchangeRate-API)
// ============================================================
function fetchLiveRates(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            const baseCurrency = 'USD'; // Free tier usually uses USD as base
            // ExchangeRate-API (free, no key required for basic usage)
            const apiUrl = `https://open.er-api.com/v6/latest/${baseCurrency}`;
            const response = yield fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`API request failed: ${response.statusText}`);
            }
            const data = yield response.json();
            if (data.result !== 'success') {
                throw new Error('API returned error');
            }
            const rates = data.rates;
            const today = new Date().toISOString().split('T')[0];
            const savedRates = [];
            // Get our active currencies from DB
            const [currencies] = yield conn.query('SELECT code FROM currencies WHERE isActive = TRUE');
            const activeCurrencies = currencies.map(c => c.code);
            // Save rates for active currencies to EGP
            for (const code of activeCurrencies) {
                if (code === 'EGP' || !rates[code])
                    continue;
                // Calculate rate to EGP: if 1 USD = X EGP and 1 USD = Y [currency], then 1 [currency] = X/Y EGP
                const rateToEGP = rates['EGP'] / rates[code];
                const id = (0, crypto_1.randomUUID)();
                yield conn.query(`INSERT INTO exchange_rates (id, fromCurrency, toCurrency, rate, effectiveDate, source, createdBy)
                 VALUES (?, ?, 'EGP', ?, ?, 'API', 'system')
                 ON DUPLICATE KEY UPDATE rate = VALUES(rate), source = VALUES(source)`, [id, code, rateToEGP, today]);
                savedRates.push({
                    fromCurrency: code,
                    toCurrency: 'EGP',
                    rate: rateToEGP,
                    effectiveDate: today,
                    source: 'API'
                });
            }
            yield (0, auditController_1.logAction)(getUser(req), 'EXCHANGE_RATES', 'FETCH', `Fetched live rates from API: ${savedRates.length} rates updated`, JSON.stringify(savedRates));
            res.json({
                success: true,
                message: `Updated ${savedRates.length} exchange rates`,
                rates: savedRates,
                apiLastUpdate: data.time_last_update_utc
            });
        }
        catch (error) {
            (0, errorHandler_1.handleControllerError)(res, error, 'fetching live rates');
        }
        finally {
            conn.release();
        }
    });
}
// ============================================================
// CURRENCY TRANSACTIONS (Transfers/Conversions)
// ============================================================
function getCurrencyTransactions(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield (0, db_1.getConnection)();
        try {
            const { from, to, startDate, endDate } = req.query;
            let query = `
            SELECT ct.*, 
                   fb.name as fromBankName, 
                   tb.name as toBankName
            FROM currency_transactions ct
            LEFT JOIN banks fb ON ct.fromBankId = fb.id
            LEFT JOIN banks tb ON ct.toBankId = tb.id
            WHERE 1=1
        `;
            const params = [];
            if (from) {
                query += ' AND ct.fromCurrency = ?';
                params.push(from);
            }
            if (to) {
                query += ' AND ct.toCurrency = ?';
                params.push(to);
            }
            if (startDate) {
                query += ' AND ct.date >= ?';
                params.push(startDate);
            }
            if (endDate) {
                query += ' AND ct.date <= ?';
                params.push(endDate);
            }
            query += ' ORDER BY ct.date DESC';
            const [transactions] = yield conn.query(query, params);
            res.json(transactions);
        }
        catch (error) {
            (0, errorHandler_1.handleControllerError)(res, error, 'fetching currency transactions');
        }
        finally {
            conn.release();
        }
    });
}
function createCurrencyTransaction(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const connection = yield (0, db_1.getConnection)();
        try {
            yield connection.beginTransaction();
            const { fromCurrency, toCurrency, fromAmount, exchangeRate, fromBankId, toBankId, notes } = req.body;
            if (!fromCurrency || !toCurrency || !fromAmount || !exchangeRate) {
                return res.status(400).json({
                    error: 'fromCurrency, toCurrency, fromAmount, and exchangeRate are required'
                });
            }
            const toAmount = fromAmount * exchangeRate;
            const id = (0, crypto_1.randomUUID)();
            const user = getUser(req);
            const now = new Date();
            // Calculate gain/loss based on original rate vs current rate
            // (For now, we store 0 - this can be enhanced with more complex logic)
            const gainLossAmount = 0;
            // Create the currency transaction record
            yield connection.query(`INSERT INTO currency_transactions 
             (id, date, fromCurrency, toCurrency, fromAmount, toAmount, exchangeRate, 
              fromBankId, toBankId, gainLossAmount, notes, createdBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, now, fromCurrency, toCurrency, fromAmount, toAmount, exchangeRate,
                fromBankId || null, toBankId || null, gainLossAmount, notes || null, user]);
            // Update bank balances if banks are specified
            if (fromBankId) {
                yield connection.query('UPDATE banks SET balance = balance - ? WHERE id = ?', [fromAmount, fromBankId]);
            }
            if (toBankId) {
                yield connection.query('UPDATE banks SET balance = balance + ? WHERE id = ?', [toAmount, toBankId]);
            }
            yield connection.commit();
            yield (0, auditController_1.logAction)(user, 'CURRENCY_TRANSACTIONS', 'CREATE', `Currency exchange: ${fromAmount} ${fromCurrency} → ${toAmount.toFixed(2)} ${toCurrency}`, JSON.stringify({ fromAmount, fromCurrency, toAmount, toCurrency, exchangeRate }));
            res.status(201).json({
                id,
                date: now,
                fromCurrency,
                toCurrency,
                fromAmount,
                toAmount,
                exchangeRate,
                fromBankId,
                toBankId,
                gainLossAmount,
                notes,
                createdBy: user
            });
        }
        catch (error) {
            yield connection.rollback();
            (0, errorHandler_1.handleControllerError)(res, error, 'creating currency transaction');
        }
        finally {
            connection.release();
        }
    });
}
