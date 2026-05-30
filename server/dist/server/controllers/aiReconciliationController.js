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
exports.reconcileStatement = void 0;
const multer_1 = __importDefault(require("multer"));
const aiChatController_1 = require("./aiChatController");
const db_1 = require("../db");
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() }).single('statementFile');
const reconcileStatement = (req, res) => {
    upload(req, res, (err) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        if (err)
            return res.status(400).json({ error: 'File upload error' });
        const file = req.file;
        const partnerId = req.body.partnerId;
        if (!file || !partnerId) {
            return res.status(400).json({ error: 'الرجاء إرفاق الملف واختيار العميل/المورد' });
        }
        try {
            // Get partner info
            const [partnerRows] = yield db_1.pool.query('SELECT name FROM partners WHERE id = ?', [partnerId]);
            const partnerName = ((_a = partnerRows[0]) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown';
            // Get our DB statement for this partner
            const [journalRows] = yield db_1.pool.query(`
                SELECT DATE_FORMAT(date, '%Y-%m-%d') as date, debit, credit, description, reference
                FROM journal_lines
                WHERE partner_id = ?
                ORDER BY date DESC
                LIMIT 100
            `, [partnerId]);
            const ourStatement = JSON.stringify(journalRows, null, 2);
            const keys = yield (0, aiChatController_1.getAPIKeys)();
            if (keys.length === 0)
                return res.status(503).json({ error: 'مفتاح الذكاء الاصطناعي غير مفعل' });
            const [settingsRows] = yield db_1.pool.query('SELECT config FROM system_config LIMIT 1');
            let modelId = 'gemini-2.0-flash'; // sensible default
            if (settingsRows.length > 0) {
                let cfg = settingsRows[0].config;
                if (typeof cfg === 'string')
                    try {
                        cfg = JSON.parse(cfg);
                    }
                    catch (e) { }
                if (cfg === null || cfg === void 0 ? void 0 : cfg.aiModel)
                    modelId = cfg.aiModel;
            }
            const mimeType = file.mimetype;
            const base64Data = file.buffer.toString('base64');
            const prompt = `
أنت خبير مالي وحسابات.
قم بمطابقة كشف حساب العميل/المورد المرفق (كصورة أو PDF) مع كشف حسابنا الداخلي من قاعدة البيانات.

العميل/المورد: ${partnerName}

كشف حسابنا (أحدث 100 حركة):
${ourStatement}

المطلوب:
1. اقرأ الملف المرفق بدقة واستخرج الحركات والمبالغ وتواريخها.
2. قارن الحركات في الملف مع كشف حسابنا الداخلي (انتبه لاختلافات التسمية البسيطة والتواريخ المتقاربة).
3. قم بإنشاء تقرير يوضح:
   - الحركات المتطابقة (Matched)
   - الحركات الموجودة في كشفهم وغير موجودة عندنا (Missing in Ours)
   - الحركات الموجودة عندنا وغير موجودة عندهم (Missing in Theirs)
   - فروق مبالغ في حركات مسجلة (Discrepancies)

يجب أن تعيد الإجابة بصيغة JSON حصراً، لا تكتب أي نص خارج الـ JSON. هذا هو الشكل المطلوب:
{
    "matched": [ { "date": "...", "description": "...", "amount": 0 } ],
    "missingInOurs": [ { "date": "...", "description": "...", "amount": 0 } ],
    "missingInTheirs": [ { "date": "...", "description": "...", "amount": 0 } ],
    "discrepancies": [ { "date": "...", "description": "...", "ourAmount": 0, "theirAmount": 0 } ],
    "summary": "نص مختصر لنتيجة المطابقة باللغة العربية"
}
`;
            const contents = [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                data: base64Data,
                                mimeType: mimeType
                            }
                        }
                    ]
                }
            ];
            const { result: response } = yield (0, aiChatController_1.generateWithFailover)(modelId, {
                contents,
                config: {
                    temperature: 0.1, // very low for accuracy
                }
            });
            const text = (response.text || '').replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
            const result = JSON.parse(text);
            res.json(result);
        }
        catch (e) {
            console.error('Reconciliation error:', e);
            res.status(500).json({ error: e.message || 'حدث خطأ داخلي أثناء المطابقة' });
        }
    }));
};
exports.reconcileStatement = reconcileStatement;
