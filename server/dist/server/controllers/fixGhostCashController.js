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
exports.fixGhostCash = void 0;
const db_1 = require("../db");
const fixGhostCash = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const conn = yield (0, db_1.getConnection)();
    try {
        yield conn.beginTransaction();
        let updatedOrphaned = 0;
        let insertedMissing = 0;
        let deletedGhost = 0;
        let recalculatedShifts = 0;
        // 1. Sync payment methods from invoices to pos_cash_movements
        const [updateMovementsRes] = yield conn.query(`
            UPDATE pos_cash_movements pcm
            JOIN invoices inv ON pcm.referenceId = inv.id
            SET pcm.paymentMethod = inv.paymentMethod,
                pcm.amount = inv.total
            WHERE pcm.referenceType = 'INVOICE'
              AND (pcm.paymentMethod != inv.paymentMethod OR pcm.amount != inv.total)
        `);
        updatedOrphaned = updateMovementsRes.affectedRows;
        // 2. Insert missing cash movements for POS invoices (e.g., if deleted/recreated incorrectly)
        const [missingMovementsRes] = yield conn.query(`
            INSERT INTO pos_cash_movements (id, shiftId, type, amount, paymentMethod, referenceId, referenceType, description, createdAt)
            SELECT UUID(), inv.posShiftId, 
                   CASE WHEN inv.type = 'RETURN_SALE' THEN 'REFUND' ELSE 'SALE' END,
                   inv.total, inv.paymentMethod, inv.id, 'INVOICE',
                   CONCAT('فاتورة رقم ', inv.number), inv.date
            FROM invoices inv
            LEFT JOIN pos_cash_movements pcm ON pcm.referenceId = inv.id AND pcm.referenceType = 'INVOICE'
            WHERE inv.isPOSSale = 1 AND pcm.id IS NULL
        `);
        insertedMissing = missingMovementsRes.affectedRows;
        // 3. Delete cash movements for deleted invoices
        const [deletedMovementsRes] = yield conn.query(`
            DELETE pcm FROM pos_cash_movements pcm
            LEFT JOIN invoices inv ON pcm.referenceId = inv.id
            WHERE pcm.referenceType = 'INVOICE' AND inv.id IS NULL
        `);
        deletedGhost = deletedMovementsRes.affectedRows;
        // 4. Recalculate expectedCash and variance for all CLOSED and PENDING_VALIDATION shifts
        const [shifts] = yield conn.query(`SELECT id, closingCash FROM pos_shifts WHERE status != 'OPEN'`);
        for (const shift of shifts) {
            const shiftId = shift.id;
            const [movements] = yield conn.query(`SELECT 
                    SUM(CASE WHEN type IN ('OPENING', 'DEPOSIT') THEN amount ELSE 0 END) as deposits,
                    SUM(CASE WHEN type = 'WITHDRAWAL' THEN amount ELSE 0 END) as withdrawals,
                    SUM(CASE WHEN type = 'SALE' AND paymentMethod IN ('CASH', 'TREASURY') THEN amount ELSE 0 END) as cashSales,
                    SUM(CASE WHEN type = 'REFUND' AND paymentMethod IN ('CASH', 'TREASURY') THEN amount ELSE 0 END) as cashRefunds
                 FROM pos_cash_movements
                 WHERE shiftId = ?`, [shiftId]);
            const movementData = movements[0];
            const [expenseRows] = yield conn.query(`SELECT SUM(amount) as totalExpenses FROM pos_expenses WHERE shiftId = ?`, [shiftId]);
            const shiftExpenses = parseFloat(((_a = expenseRows[0]) === null || _a === void 0 ? void 0 : _a.totalExpenses) || 0);
            const expectedCash = parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.deposits) || 0) +
                parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.cashSales) || 0) -
                parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.withdrawals) || 0) -
                parseFloat((movementData === null || movementData === void 0 ? void 0 : movementData.cashRefunds) || 0) - shiftExpenses;
            const variance = shift.closingCash - expectedCash;
            yield conn.query(`UPDATE pos_shifts SET expectedCash = ?, variance = ? WHERE id = ?`, [expectedCash, variance, shiftId]);
        }
        recalculatedShifts = shifts.length;
        yield conn.commit();
        res.json({
            success: true,
            message: 'Historical shifts successfully fixed.',
            stats: {
                updatedOrphaned,
                insertedMissing,
                deletedGhost,
                recalculatedShifts
            }
        });
    }
    catch (err) {
        yield conn.rollback();
        console.error('FAILED!', err);
        res.status(500).json({ success: false, error: err.message });
    }
    finally {
        conn.release();
    }
});
exports.fixGhostCash = fixGhostCash;
