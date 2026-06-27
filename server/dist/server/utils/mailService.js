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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendStorefrontEmail = sendStorefrontEmail;
exports.sendInvoiceEmail = sendInvoiceEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const brandConfig_1 = require("../config/brandConfig");
/**
 * Sends a transactional email using the SMTP settings from environment variables.
 */
function sendStorefrontEmail(to, subject, html) {
    return __awaiter(this, void 0, void 0, function* () {
        const host = process.env.SMTP_HOST;
        const port = Number(process.env.SMTP_PORT) || 587;
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;
        const supportEmail = brandConfig_1.SERVER_BRAND.supportEmail || user || 'no-reply@erp.com';
        const from = process.env.SMTP_FROM || `"${brandConfig_1.SERVER_BRAND.name} Support" <${supportEmail}>`;
        const secure = process.env.SMTP_SECURE === 'true' || port === 465;
        if (!host || !user || !pass) {
            console.warn('⚠️ SMTP settings are not fully configured (SMTP_HOST, SMTP_USER, SMTP_PASS). Email sending aborted.');
            return false;
        }
        try {
            const transporter = nodemailer_1.default.createTransport({
                host,
                port,
                secure,
                auth: {
                    user,
                    pass
                }
            });
            const info = yield transporter.sendMail({
                from,
                to,
                subject,
                html
            });
            console.log(`✉️ Transactional email sent to ${to}: ${info.messageId}`);
            return true;
        }
        catch (err) {
            console.error('❌ Failed to send transactional email:', err.message);
            return false;
        }
    });
}
/**
 * Retrieves invoice data and formats/sends an HTML invoice copy to the customer.
 */
function sendInvoiceEmail(invoiceId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [invRows] = yield pool.query(`SELECT i.id, i.number, i.date, i.total, i.partnerId, i.partnerName, p.email, i.notes
             FROM invoices i
             LEFT JOIN partners p ON i.partnerId = p.id
             WHERE i.id = ?`, [invoiceId]);
            const invoice = invRows[0];
            if (!invoice || !invoice.email) {
                console.log(`[Mail] Invoice ${invoiceId} has no customer email, skipping email copy.`);
                return;
            }
            const [lineRows] = yield pool.query(`SELECT productName, quantity, price, total FROM invoice_lines WHERE invoiceId = ?`, [invoiceId]);
            let linesHtml = '';
            lineRows.forEach((l) => {
                linesHtml += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">${l.productName}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${Number(l.quantity)}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: left;">$${Number(l.price).toFixed(2)}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: left;">$${Number(l.total).toFixed(2)}</td>
                </tr>
            `;
            });
            const subject = `فاتورة الشراء الخاصة بك رقم ${invoice.number} | Your Invoice ${invoice.number}`;
            const emailBody = `
            <div style="font-family: sans-serif; direction: rtl; text-align: right; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 600px; margin: auto;">
                <h2 style="color: #2563EB;">شكراً لك على التسوق!</h2>
                <p>عزيزي ${invoice.partnerName}، تم استلام طلبك وإصدار الفاتورة رقم <strong>${invoice.number}</strong> بنجاح.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <h3>تفاصيل الفاتورة:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f8fafc;">
                            <th style="padding: 10px; text-align: right; border-bottom: 2px solid #e2e8f0;">المنتج</th>
                            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #e2e8f0;">الكمية</th>
                            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">السعر</th>
                            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">الإجمالي</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linesHtml}
                    </tbody>
                </table>
                <h3 style="color: #1E293B; text-align: left; margin-top: 20px;">المجموع الإجمالي: $${Number(invoice.total).toFixed(2)}</h3>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                ${invoice.notes ? `<p style="font-size: 14px; color: #64748B;">ملاحظات: ${invoice.notes}</p>` : ''}
            </div>
        `;
            yield sendStorefrontEmail(invoice.email, subject, emailBody);
        }
        catch (err) {
            console.error(`Failed to send invoice email for ${invoiceId}:`, err.message);
        }
    });
}
