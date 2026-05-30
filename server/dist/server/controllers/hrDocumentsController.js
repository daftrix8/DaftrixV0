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
exports.getDocumentTemplates = getDocumentTemplates;
exports.createDocumentTemplate = createDocumentTemplate;
exports.updateDocumentTemplate = updateDocumentTemplate;
exports.deleteDocumentTemplate = deleteDocumentTemplate;
exports.getEmployeeDocuments = getEmployeeDocuments;
exports.getAllEmployeeDocuments = getAllEmployeeDocuments;
exports.getDocumentById = getDocumentById;
exports.createEmployeeDocument = createEmployeeDocument;
exports.updateEmployeeDocument = updateEmployeeDocument;
exports.cancelEmployeeDocument = cancelEmployeeDocument;
exports.previewDocument = previewDocument;
exports.uploadDocumentAttachment = uploadDocumentAttachment;
exports.deleteDocumentAttachment = deleteDocumentAttachment;
exports.getExpiringContracts = getExpiringContracts;
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const db_1 = require("../db");
// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatDate(dateStr, locale = 'ar-EG') {
    if (!dateStr)
        return '—';
    try {
        return new Date(dateStr).toLocaleDateString(locale, {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }
    catch (_a) {
        return dateStr;
    }
}
function mergeTemplate(body, vars) {
    let result = body;
    for (const [key, value] of Object.entries(vars)) {
        result = result.split(`{{${key}}}`).join(value !== null && value !== void 0 ? value : '—');
    }
    return result;
}
function buildTemplateVars(employee, document, companyName, companyAddress, representativeName, representativeTitle) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    return {
        employee_name: (_b = (_a = employee.fullName) !== null && _a !== void 0 ? _a : employee.name) !== null && _b !== void 0 ? _b : '—',
        employee_code: (_d = (_c = employee.employeeCode) !== null && _c !== void 0 ? _c : employee.id) !== null && _d !== void 0 ? _d : '—',
        job_title: (_f = (_e = employee.jobTitle) !== null && _e !== void 0 ? _e : employee.position) !== null && _f !== void 0 ? _f : '—',
        department: (_g = employee.department) !== null && _g !== void 0 ? _g : '—',
        hire_date: formatDate((_h = employee.hireDate) !== null && _h !== void 0 ? _h : employee.startDate),
        salary: (_k = (_j = employee.baseSalary) === null || _j === void 0 ? void 0 : _j.toLocaleString('ar-EG')) !== null && _k !== void 0 ? _k : '—',
        contract_start: formatDate(document.issueDate),
        contract_end: formatDate(document.expiryDate),
        today_date: formatDate(new Date().toISOString()),
        company_name: companyName,
        company_address: companyAddress,
        representative_name: representativeName || '—',
        representative_title: representativeTitle || '—',
        national_id: (_l = employee.nationalId) !== null && _l !== void 0 ? _l : '—',
        employee_address: (_m = employee.address) !== null && _m !== void 0 ? _m : '—',
        employee_phone: (_o = employee.phone) !== null && _o !== void 0 ? _o : '—',
        branch_name: (_p = employee.branchName) !== null && _p !== void 0 ? _p : '—',
    };
}
function getCompanySettings(db) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        try {
            const [rows] = yield db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('companyName', 'companyAddress', 'appName', 'representativeName', 'representativeTitle')");
            const map = {};
            for (const row of rows) {
                map[row.setting_key] = row.setting_value;
            }
            return {
                companyName: (_b = (_a = map.companyName) !== null && _a !== void 0 ? _a : map.appName) !== null && _b !== void 0 ? _b : 'الشركة',
                companyAddress: (_c = map.companyAddress) !== null && _c !== void 0 ? _c : '',
                representativeName: (_d = map.representativeName) !== null && _d !== void 0 ? _d : 'المفوض بالتوقيع',
                representativeTitle: (_e = map.representativeTitle) !== null && _e !== void 0 ? _e : 'المدير العام',
            };
        }
        catch (_f) {
            return {
                companyName: 'الشركة',
                companyAddress: '',
                representativeName: 'المفوض بالتوقيع',
                representativeTitle: 'المدير العام',
            };
        }
    });
}
// ─────────────────────────────────────────────
// Document Templates
// ─────────────────────────────────────────────
function getDocumentTemplates(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = db_1.pool;
        try {
            const [rows] = yield db.query('SELECT * FROM hr_document_templates WHERE isActive = 1 ORDER BY type, name');
            res.json(rows);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to fetch document templates', detail: err.message });
        }
    });
}
function createDocumentTemplate(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = db_1.pool;
        const { name, nameEn, type, bodyAr, isDefault } = req.body;
        if (!name || !type || !bodyAr) {
            return res.status(400).json({ error: 'name, type, and bodyAr are required' });
        }
        const id = (0, uuid_1.v4)();
        try {
            yield db.query('INSERT INTO hr_document_templates (id, name, nameEn, type, bodyAr, isActive, isDefault) VALUES (?, ?, ?, ?, ?, 1, ?)', [id, name, nameEn !== null && nameEn !== void 0 ? nameEn : null, type, bodyAr, isDefault ? 1 : 0]);
            const [[template]] = yield db.query('SELECT * FROM hr_document_templates WHERE id = ?', [id]);
            res.status(201).json(template);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to create template', detail: err.message });
        }
    });
}
function updateDocumentTemplate(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = db_1.pool;
        const { id } = req.params;
        const { name, nameEn, bodyAr, isActive } = req.body;
        try {
            yield db.query('UPDATE hr_document_templates SET name = COALESCE(?, name), nameEn = COALESCE(?, nameEn), bodyAr = COALESCE(?, bodyAr), isActive = COALESCE(?, isActive) WHERE id = ?', [name !== null && name !== void 0 ? name : null, nameEn !== null && nameEn !== void 0 ? nameEn : null, bodyAr !== null && bodyAr !== void 0 ? bodyAr : null, isActive != null ? (isActive ? 1 : 0) : null, id]);
            const [[template]] = yield db.query('SELECT * FROM hr_document_templates WHERE id = ?', [id]);
            res.json(template);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to update template', detail: err.message });
        }
    });
}
function deleteDocumentTemplate(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = db_1.pool;
        const { id } = req.params;
        try {
            // Soft delete — mark inactive
            yield db.query('UPDATE hr_document_templates SET isActive = 0 WHERE id = ?', [id]);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to delete template', detail: err.message });
        }
    });
}
// ─────────────────────────────────────────────
// Employee Documents
// ─────────────────────────────────────────────
function getEmployeeDocuments(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = db_1.pool;
        const { employeeId } = req.params;
        try {
            const [rows] = yield db.query(`SELECT d.*, e.fullName AS employeeName, e.jobTitle, e.department
             FROM hr_employee_documents d
             JOIN employees e ON e.id = d.employeeId
             WHERE d.employeeId = ? AND d.status != 'CANCELLED'
             ORDER BY d.createdAt DESC`, [employeeId]);
            res.json(rows);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to fetch employee documents', detail: err.message });
        }
    });
}
function getAllEmployeeDocuments(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = db_1.pool;
        const { type, status, search } = req.query;
        let query = `
        SELECT d.*, e.fullName AS employeeName, e.jobTitle, e.department, e.baseSalary
        FROM hr_employee_documents d
        JOIN employees e ON e.id = d.employeeId
        WHERE 1=1
    `;
        const params = [];
        if (type) {
            query += ' AND d.type = ?';
            params.push(type);
        }
        if (status) {
            query += ' AND d.status = ?';
            params.push(status);
        }
        else {
            query += " AND d.status != 'CANCELLED'";
        }
        if (search) {
            query += ' AND (e.fullName LIKE ? OR d.title LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        query += ' ORDER BY d.createdAt DESC LIMIT 200';
        try {
            const [rows] = yield db.query(query, params);
            res.json(rows);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to fetch documents', detail: err.message });
        }
    });
}
function getDocumentById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = db_1.pool;
        const { id } = req.params;
        try {
            const [[doc]] = yield db.query(`SELECT d.*, e.fullName AS employeeName, e.jobTitle, e.department, e.baseSalary, e.hireDate
             FROM hr_employee_documents d
             JOIN employees e ON e.id = d.employeeId
             WHERE d.id = ?`, [id]);
            if (!doc)
                return res.status(404).json({ error: 'Document not found' });
            res.json(doc);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to fetch document', detail: err.message });
        }
    });
}
function createEmployeeDocument(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = db_1.pool;
        const { employeeId, templateId, title, issueDate, expiryDate, notes, status = 'ISSUED', customBody, } = req.body;
        let { type } = req.body;
        // Derive type from template if not supplied
        if (!type && templateId) {
            try {
                const [[template]] = yield db.query('SELECT type FROM hr_document_templates WHERE id = ?', [templateId]);
                if (template) {
                    type = template.type;
                }
            }
            catch (err) {
                // Ignore error here, we will fail validation below
            }
        }
        if (!employeeId || !type || !title || !issueDate) {
            return res.status(400).json({ error: 'employeeId, type, title, and issueDate are required' });
        }
        const file = req.file;
        const attachmentPath = file ? `uploads/hr-docs/${file.filename}` : null;
        const attachmentName = file ? file.originalname : null;
        const attachmentMimeType = file ? file.mimetype : null;
        const attachmentSize = file ? file.size : null;
        try {
            const [[employee]] = yield db.query(`SELECT e.*, b.name AS branchName 
             FROM employees e 
             LEFT JOIN branches b ON b.id = e.branchId 
             WHERE e.id = ?`, [employeeId]);
            if (!employee)
                return res.status(404).json({ error: 'Employee not found' });
            const { companyName, companyAddress, representativeName, representativeTitle } = yield getCompanySettings(db);
            const vars = buildTemplateVars(employee, { issueDate, expiryDate }, companyName, companyAddress, representativeName, representativeTitle);
            let body = customBody !== null && customBody !== void 0 ? customBody : '';
            if (!body && templateId) {
                const [[template]] = yield db.query('SELECT * FROM hr_document_templates WHERE id = ?', [templateId]);
                if (!template)
                    return res.status(404).json({ error: 'Template not found' });
                body = mergeTemplate(template.bodyAr, vars);
            }
            if (!body && attachmentPath) {
                body = 'تم إرفاق مستند ممسوح ضوئياً';
            }
            if (!body) {
                return res.status(400).json({ error: 'Document body is required (provide templateId, customBody, or upload a file)' });
            }
            const id = (0, uuid_1.v4)();
            yield db.query(`INSERT INTO hr_employee_documents
             (id, employeeId, templateId, type, title, body, issueDate, expiryDate, status, notes,
              attachmentPath, attachmentName, attachmentMimeType, attachmentSize)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                id, employeeId,
                templateId !== null && templateId !== void 0 ? templateId : null,
                type, title, body, issueDate,
                expiryDate !== null && expiryDate !== void 0 ? expiryDate : null,
                status,
                notes !== null && notes !== void 0 ? notes : null,
                attachmentPath, attachmentName, attachmentMimeType, attachmentSize
            ]);
            const [[created]] = yield db.query(`SELECT d.*, e.fullName AS employeeName FROM hr_employee_documents d
             JOIN employees e ON e.id = d.employeeId WHERE d.id = ?`, [id]);
            res.status(201).json(created);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to create document', detail: err.message });
        }
    });
}
function updateEmployeeDocument(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = db_1.pool;
        const { id } = req.params;
        const { title, body, issueDate, expiryDate, status, notes } = req.body;
        try {
            yield db.query(`UPDATE hr_employee_documents
             SET title = COALESCE(?, title),
                 body = COALESCE(?, body),
                 issueDate = COALESCE(?, issueDate),
                 expiryDate = COALESCE(?, expiryDate),
                 status = COALESCE(?, status),
                 notes = COALESCE(?, notes)
             WHERE id = ?`, [title !== null && title !== void 0 ? title : null, body !== null && body !== void 0 ? body : null, issueDate !== null && issueDate !== void 0 ? issueDate : null, expiryDate !== null && expiryDate !== void 0 ? expiryDate : null, status !== null && status !== void 0 ? status : null, notes !== null && notes !== void 0 ? notes : null, id]);
            const [[doc]] = yield db.query(`SELECT d.*, e.fullName AS employeeName FROM hr_employee_documents d
             JOIN employees e ON e.id = d.employeeId WHERE d.id = ?`, [id]);
            res.json(doc);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to update document', detail: err.message });
        }
    });
}
function cancelEmployeeDocument(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = db_1.pool;
        const { id } = req.params;
        try {
            yield db.query("UPDATE hr_employee_documents SET status = 'CANCELLED' WHERE id = ?", [id]);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to cancel document', detail: err.message });
        }
    });
}
// ─────────────────────────────────────────────
// Preview — re-render template with live employee data
// ─────────────────────────────────────────────
function previewDocument(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = db_1.pool;
        const { templateId, employeeId, issueDate, expiryDate } = req.body;
        if (!templateId || !employeeId) {
            return res.status(400).json({ error: 'templateId and employeeId are required' });
        }
        try {
            const [[employee]] = yield db.query(`SELECT e.*, b.name AS branchName 
             FROM employees e 
             LEFT JOIN branches b ON b.id = e.branchId 
             WHERE e.id = ?`, [employeeId]);
            if (!employee)
                return res.status(404).json({ error: 'Employee not found' });
            const [[template]] = yield db.query('SELECT * FROM hr_document_templates WHERE id = ?', [templateId]);
            if (!template)
                return res.status(404).json({ error: 'Template not found' });
            const { companyName, companyAddress, representativeName, representativeTitle } = yield getCompanySettings(db);
            const vars = buildTemplateVars(employee, { issueDate, expiryDate }, companyName, companyAddress, representativeName, representativeTitle);
            const body = mergeTemplate(template.bodyAr, vars);
            res.json({ body, companyName, employee });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to preview document', detail: err.message });
        }
    });
}
// ─────────────────────────────────────────────
// File Attachment Upload
// ─────────────────────────────────────────────
function uploadDocumentAttachment(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = db_1.pool;
        const { id } = req.params;
        const file = req.file;
        if (!file)
            return res.status(400).json({ error: 'No file uploaded' });
        try {
            const [[doc]] = yield db.query('SELECT id, attachmentPath FROM hr_employee_documents WHERE id = ?', [id]);
            if (!doc)
                return res.status(404).json({ error: 'Document not found' });
            // Delete old attachment file if exists
            if (doc.attachmentPath) {
                const oldPath = path_1.default.join(process.cwd(), doc.attachmentPath);
                if (fs_1.default.existsSync(oldPath))
                    fs_1.default.unlinkSync(oldPath);
            }
            const relativePath = `uploads/hr-docs/${file.filename}`;
            yield db.query(`UPDATE hr_employee_documents
             SET attachmentPath = ?, attachmentName = ?, attachmentMimeType = ?, attachmentSize = ?
             WHERE id = ?`, [relativePath, file.originalname, file.mimetype, file.size, id]);
            res.json({
                success: true,
                attachmentPath: relativePath,
                attachmentName: file.originalname,
            });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to save attachment', detail: err.message });
        }
    });
}
function deleteDocumentAttachment(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = db_1.pool;
        const { id } = req.params;
        try {
            const [[doc]] = yield db.query('SELECT attachmentPath FROM hr_employee_documents WHERE id = ?', [id]);
            if (!doc)
                return res.status(404).json({ error: 'Document not found' });
            if (doc.attachmentPath) {
                const filePath = path_1.default.join(process.cwd(), doc.attachmentPath);
                if (fs_1.default.existsSync(filePath))
                    fs_1.default.unlinkSync(filePath);
            }
            yield db.query('UPDATE hr_employee_documents SET attachmentPath = NULL, attachmentName = NULL, attachmentMimeType = NULL, attachmentSize = NULL WHERE id = ?', [id]);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to delete attachment', detail: err.message });
        }
    });
}
// ─────────────────────────────────────────────
// Contract timeline / expiry dashboard
// ─────────────────────────────────────────────
function getExpiringContracts(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const db = db_1.pool;
        const daysAhead = parseInt((_a = req.query.days) !== null && _a !== void 0 ? _a : '30', 10);
        try {
            const [rows] = yield db.query(`SELECT d.*, e.fullName AS employeeName, e.department, e.jobTitle
             FROM hr_employee_documents d
             JOIN employees e ON e.id = d.employeeId
             WHERE d.type IN ('CONTRACT', 'RENEWAL')
               AND d.status = 'ISSUED'
               AND d.expiryDate IS NOT NULL
               AND d.expiryDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
             ORDER BY d.expiryDate ASC`, [daysAhead]);
            res.json(rows);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to fetch expiring contracts', detail: err.message });
        }
    });
}
