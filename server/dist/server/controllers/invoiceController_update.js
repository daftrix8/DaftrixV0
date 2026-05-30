"use strict";
// UPDATE INVOICE FUNCTION WITH PAYMENT LOGIC
// Add this to invoiceController.ts
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
exports.updateInvoice = void 0;
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auditController_1 = require("./auditController");
const errorHandler_1 = require("../utils/errorHandler");
const eventBus_1 = require("../utils/eventBus");
/**
 * PUT /api/invoices/:id - Update invoice with payment handling
 */
const updateInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        const invoiceId = req.params.id;
        const authReq = req;
        const user = authReq.user;
        const createdBy = (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) || req.body.user || 'System';
        // Get existing invoice
        const [existing] = yield conn.query('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        const existingInvoice = existing[0];
        yield conn.beginTransaction();
        const { date, type, partnerId, partnerName, total, status, paymentMethod, posted, notes, dueDate, taxAmount, whtAmount, shippingFee, globalDiscount, lines, salesmanId, number } = req.body;
        // Update invoice
        yield conn.query(`UPDATE invoices SET
                date = ?, type = ?, partnerId = ?, partnerName = ?,
                total = ?, status = ?, paymentMethod = ?, posted = ?,
                notes = ?, dueDate = ?, taxAmount = ?, whtAmount = ?,
                shippingFee = ?, globalDiscount = ?, warehouseId = ?,
                bankAccountId = ?, bankName = ?, salesmanId = ?,
                referenceInvoiceId = ?
            WHERE id = ?`, [
            date, type, partnerId, partnerName, total, status, paymentMethod, posted,
            notes, dueDate, taxAmount, whtAmount, shippingFee, globalDiscount,
            req.body.warehouseId, req.body.bankAccountId, req.body.bankName, salesmanId,
            req.body.referenceInvoiceId || null,
            invoiceId
        ]);
        // Update lines - delete and re-insert
        yield conn.query('DELETE FROM invoice_lines WHERE invoiceId = ?', [invoiceId]);
        if (lines && lines.length > 0) {
            for (const line of lines) {
                // Multi-Unit Support: save unit info with the line
                const lineUnitId = line.unitId || null;
                const lineUnitName = line.unitName || null;
                const lineConversionFactor = Number(line.conversionFactor) || 1;
                const lineBaseQuantity = Number(line.baseQuantity) || Number(line.quantity);
                const bonusQty = Number(line.bonusQty) || 0;
                const gradeValue = line.grade || null;
                const serialsJson = line.serials && Array.isArray(line.serials) && line.serials.length > 0 ? JSON.stringify(line.serials) : null;
                const sanitizedLineWarehouseId = line.warehouseId && typeof line.warehouseId === 'string' ? line.warehouseId.substring(0, 36) : null;
                try {
                    yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total, warehouseId, serials, bonusQty, grade, unitId, unitName, conversionFactor, baseQuantity)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [invoiceId, line.productId, line.productName, line.quantity, line.price, line.cost, line.discount, line.total, sanitizedLineWarehouseId, serialsJson, bonusQty, gradeValue, lineUnitId, lineUnitName, lineConversionFactor, lineBaseQuantity]);
                }
                catch (ilErr) {
                    // Fallback: insert without unit columns if they don't exist
                    yield conn.query(`INSERT INTO invoice_lines (invoiceId, productId, productName, quantity, price, cost, discount, total)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [invoiceId, line.productId, line.productName, line.quantity, line.price, line.cost, line.discount, line.total]);
                }
            }
        }
        // === POS CASH MOVEMENTS SYNC LOGIC ===
        if (existingInvoice.posShiftId || existingInvoice.isPOSSale) {
            // Delete existing orphaned movements
            yield conn.query(`DELETE FROM pos_cash_movements WHERE referenceId = ? AND referenceType = 'INVOICE'`, [invoiceId]);
            // Insert single new movement reflecting updated method and total
            // Using existingInvoice.posShiftId instead of req body to prevent tampering, falling back to any truthy value
            const movementId = (0, crypto_1.randomUUID)();
            const getEgyptianISOStringLocal = () => {
                const now = new Date();
                return new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 19).replace('T', ' ');
            };
            yield conn.query(`INSERT INTO pos_cash_movements (id, shiftId, type, amount, paymentMethod, description, referenceId, referenceType, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'INVOICE', ?)`, [
                movementId,
                existingInvoice.posShiftId,
                type === 'RETURN_SALE' ? 'REFUND' : 'SALE',
                total,
                paymentMethod || 'CASH',
                `تعديل فاتورة ${number || existingInvoice.number}`,
                invoiceId,
                getEgyptianISOStringLocal()
            ]);
            console.log(`✅ Synced POS cash movement for invoice ${number} (${paymentMethod})`);
        }
        // === PAYMENT WITH INVOICE UPDATE LOGIC ===
        const paymentCollected = Number(req.body.paymentCollected || 0);
        if (partnerId) {
            try {
                // Find existing payment linked to this invoice
                const [existingPayments] = yield conn.query(`SELECT * FROM invoices 
                     WHERE JSON_CONTAINS(relatedInvoiceIds, ?) 
                     AND (type = 'RECEIPT' OR type = 'PAYMENT')
                     AND notes LIKE ?`, [JSON.stringify(invoiceId), `%دفعة مع الفاتورة%`]);
                const existingPayment = existingPayments.length > 0 ? existingPayments[0] : null;
                const existingAmount = existingPayment ? Number(existingPayment.total) : 0;
                console.log(`💰 Payment Update: Old=${existingAmount}, New=${paymentCollected}`);
                if (existingAmount === paymentCollected) {
                    // No change
                    console.log('✓ Payment unchanged');
                }
                else if (paymentCollected === 0 && existingPayment) {
                    // DELETE payment
                    console.log(`🗑️ Deleting payment ${existingPayment.number}`);
                    yield conn.query('DELETE FROM account_transactions WHERE invoiceId = ?', [existingPayment.id]);
                    yield conn.query('DELETE FROM invoices WHERE id = ?', [existingPayment.id]);
                    console.log('✅ Payment deleted');
                }
                else if (paymentCollected > 0 && existingPayment) {
                    // UPDATE payment
                    console.log(`✏️ Updating payment ${existingPayment.number} to ${paymentCollected}`);
                    yield conn.query('UPDATE invoices SET total = ? WHERE id = ?', [paymentCollected, existingPayment.id]);
                    yield conn.query(`UPDATE account_transactions SET debit = ?, credit = ? WHERE invoiceId = ?`, [
                        existingPayment.type === 'PAYMENT' ? paymentCollected : 0,
                        existingPayment.type === 'RECEIPT' ? paymentCollected : 0,
                        existingPayment.id
                    ]);
                    console.log('✅ Payment updated');
                }
                else if (paymentCollected > 0 && !existingPayment) {
                    // CREATE new payment
                    console.log(`💰 Creating new payment: ${paymentCollected}`);
                    const paymentType = (type === 'INVOICE_SALE' || type === 'RETURN_PURCHASE') ? 'RECEIPT' : 'PAYMENT';
                    const paymentPrefix = paymentType === 'RECEIPT' ? 'REC-' : 'PAY-';
                    const [maxResult] = yield conn.query(`SELECT MAX(CAST(SUBSTRING(number, ?) AS UNSIGNED)) as maxNum 
                         FROM invoices WHERE number LIKE ? AND number REGEXP ?`, [paymentPrefix.length + 1, `${paymentPrefix}%`, `^${paymentPrefix.replace('-', '\\\\-')}[0-9]+$`]);
                    const maxNum = ((_a = maxResult[0]) === null || _a === void 0 ? void 0 : _a.maxNum) || 0;
                    const paymentNumber = `${paymentPrefix}${String(maxNum + 1).padStart(5, '0')}`;
                    const paymentId = (0, crypto_1.randomUUID)();
                    yield conn.query(`INSERT INTO invoices (
                            id, number, date, type, partnerId, partnerName, 
                            total, status, paymentMethod, posted, notes, warehouseId, createdBy
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                        paymentId, paymentNumber, date, paymentType, partnerId, partnerName,
                        paymentCollected, 'POSTED', paymentMethod || 'CASH', 1,
                        `دفعة مع الفاتورة ${number}`, req.body.warehouseId, createdBy
                    ]);
                    yield conn.query('UPDATE invoices SET relatedInvoiceIds = ? WHERE id = ?', [JSON.stringify([invoiceId]), paymentId]);
                    yield conn.query(`INSERT INTO account_transactions (
                            id, date, type, partnerId, partnerName, debit, credit, description, invoiceId, createdBy
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                        (0, crypto_1.randomUUID)(), date, paymentType, partnerId, partnerName,
                        paymentType === 'PAYMENT' ? paymentCollected : 0,
                        paymentType === 'RECEIPT' ? paymentCollected : 0,
                        `${paymentType === 'RECEIPT' ? 'مقبوض' : 'دفع'} مع الفاتورة ${number}`,
                        paymentId, createdBy
                    ]);
                    console.log(`✅ Payment ${paymentNumber} created`);
                    yield (0, auditController_1.logAction)(createdBy, paymentType, 'CREATE', `Created ${paymentType} #${paymentNumber} with Invoice ${number}`, `Partner: ${partnerName}, Amount: ${paymentCollected}`);
                }
            }
            catch (paymentError) {
                console.error('❌ Error managing payment:', paymentError);
            }
        }
        yield conn.commit();
        // Log audit trail
        yield (0, auditController_1.logAction)(createdBy, 'INVOICE', 'UPDATE', `Updated ${type} Invoice #${number}`, `Partner: ${partnerName}, Amount: ${total}`);
        // Broadcast real-time update
        eventBus_1.eventBus.broadcast('entity:changed', { entityType: 'invoice', updatedBy: createdBy });
        res.json(Object.assign(Object.assign({ id: invoiceId, number }, req.body), { message: 'Invoice updated successfully' }));
    }
    catch (error) {
        yield conn.rollback();
        console.error('Error updating invoice:', error);
        return (0, errorHandler_1.handleControllerError)(res, error, 'update invoice');
    }
    finally {
        conn.release();
    }
});
exports.updateInvoice = updateInvoice;
