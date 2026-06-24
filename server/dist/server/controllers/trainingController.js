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
exports.getTrainingDashboard = exports.submitQuizAnswers = exports.getEnrollmentProgress = exports.markTopicComplete = exports.removeEnrollment = exports.getProgramEnrollments = exports.getEmployeeEnrollments = exports.bulkEnrollEmployees = exports.enrollEmployee = exports.deleteTrainingQuestion = exports.updateTrainingQuestion = exports.createTrainingQuestion = exports.deleteTrainingTopic = exports.updateTrainingTopic = exports.createTrainingTopic = exports.deleteTrainingChapter = exports.updateTrainingChapter = exports.createTrainingChapter = exports.deleteTrainingProgram = exports.updateTrainingProgram = exports.createTrainingProgram = exports.getTrainingProgram = exports.getTrainingPrograms = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
// ═══════════════════════════════════════════════════════
// Training Programs
// ═══════════════════════════════════════════════════════
const getTrainingPrograms = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [programs] = yield (0, db_1.safePoolQuery)(`
      SELECT tp.*,
        (SELECT COUNT(*) FROM training_chapters tc WHERE tc.programId = tp.id) AS chapterCount,
        (SELECT COUNT(*) FROM training_enrollments te WHERE te.programId = tp.id) AS enrollmentCount,
        (SELECT COUNT(*) FROM training_enrollments te WHERE te.programId = tp.id AND te.status = 'COMPLETED') AS completedCount
      FROM training_programs tp
      WHERE tp.isActive = 1
      ORDER BY tp.createdAt DESC
    `);
        res.json({ success: true, data: programs });
    }
    catch (error) {
        console.error('Error fetching training programs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch training programs' });
    }
});
exports.getTrainingPrograms = getTrainingPrograms;
const getTrainingProgram = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const [programs] = yield (0, db_1.safePoolQuery)(`SELECT * FROM training_programs WHERE id = ?`, [id]);
        if (!programs.length) {
            return res.status(404).json({ success: false, message: 'Program not found' });
        }
        // Fetch chapters with their topics and questions
        const [chapters] = yield (0, db_1.safePoolQuery)(`SELECT * FROM training_chapters WHERE programId = ? ORDER BY sortOrder`, [id]);
        const chapterIds = chapters.map((c) => c.id);
        let topics = [];
        let questions = [];
        if (chapterIds.length > 0) {
            const placeholders = chapterIds.map(() => '?').join(',');
            const [topicRows] = yield (0, db_1.safePoolQuery)(`SELECT * FROM training_topics WHERE chapterId IN (${placeholders}) ORDER BY sortOrder`, chapterIds);
            topics = topicRows;
            const [questionRows] = yield (0, db_1.safePoolQuery)(`SELECT * FROM training_questions WHERE chapterId IN (${placeholders}) ORDER BY sortOrder`, chapterIds);
            questions = questionRows.map(parseQuestionRow);
        }
        // Assemble the tree
        const chaptersWithContent = chapters.map((chapter) => (Object.assign(Object.assign({}, chapter), { topics: topics.filter((t) => t.chapterId === chapter.id), questions: questions.filter((q) => q.chapterId === chapter.id) })));
        res.json({
            success: true,
            data: Object.assign(Object.assign({}, programs[0]), { chapters: chaptersWithContent }),
        });
    }
    catch (error) {
        console.error('Error fetching training program:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch training program' });
    }
});
exports.getTrainingProgram = getTrainingProgram;
const createTrainingProgram = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, nameEn, description, department, isMandatory, estimatedHours, coverImage } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, message: 'Program name is required' });
        }
        const id = (0, crypto_1.randomUUID)();
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || null;
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO training_programs (id, name, nameEn, description, department, isMandatory, estimatedHours, coverImage, createdBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, name, nameEn || null, description || null, department || null, isMandatory ? 1 : 0, estimatedHours || null, coverImage || null, userId]);
        res.status(201).json({ success: true, id, message: 'Training program created' });
    }
    catch (error) {
        console.error('Error creating training program:', error);
        res.status(500).json({ success: false, message: 'Failed to create training program' });
    }
});
exports.createTrainingProgram = createTrainingProgram;
const updateTrainingProgram = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, nameEn, description, department, isActive, isMandatory, estimatedHours, coverImage } = req.body;
        const updates = [];
        const params = [];
        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (nameEn !== undefined) {
            updates.push('nameEn = ?');
            params.push(nameEn);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description);
        }
        if (department !== undefined) {
            updates.push('department = ?');
            params.push(department);
        }
        if (isActive !== undefined) {
            updates.push('isActive = ?');
            params.push(isActive ? 1 : 0);
        }
        if (isMandatory !== undefined) {
            updates.push('isMandatory = ?');
            params.push(isMandatory ? 1 : 0);
        }
        if (estimatedHours !== undefined) {
            updates.push('estimatedHours = ?');
            params.push(estimatedHours);
        }
        if (coverImage !== undefined) {
            updates.push('coverImage = ?');
            params.push(coverImage);
        }
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        params.push(id);
        yield (0, db_1.safePoolQuery)(`UPDATE training_programs SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ success: true, message: 'Training program updated' });
    }
    catch (error) {
        console.error('Error updating training program:', error);
        res.status(500).json({ success: false, message: 'Failed to update training program' });
    }
});
exports.updateTrainingProgram = updateTrainingProgram;
const deleteTrainingProgram = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Soft delete
        yield (0, db_1.safePoolQuery)(`UPDATE training_programs SET isActive = 0 WHERE id = ?`, [id]);
        res.json({ success: true, message: 'Training program deleted' });
    }
    catch (error) {
        console.error('Error deleting training program:', error);
        res.status(500).json({ success: false, message: 'Failed to delete training program' });
    }
});
exports.deleteTrainingProgram = deleteTrainingProgram;
// ═══════════════════════════════════════════════════════
// Chapters
// ═══════════════════════════════════════════════════════
const createTrainingChapter = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { programId, title, titleEn, description, sortOrder, estimatedMinutes } = req.body;
        if (!programId || !title) {
            return res.status(400).json({ success: false, message: 'programId and title are required' });
        }
        const id = (0, crypto_1.randomUUID)();
        // Auto-calculate sortOrder if not provided
        let order = sortOrder;
        if (order === undefined || order === null) {
            const [maxRows] = yield (0, db_1.safePoolQuery)(`SELECT COALESCE(MAX(sortOrder), -1) + 1 AS nextOrder FROM training_chapters WHERE programId = ?`, [programId]);
            order = (_b = (_a = maxRows[0]) === null || _a === void 0 ? void 0 : _a.nextOrder) !== null && _b !== void 0 ? _b : 0;
        }
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO training_chapters (id, programId, title, titleEn, description, sortOrder, estimatedMinutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, programId, title, titleEn || null, description || null, order, estimatedMinutes || null]);
        res.status(201).json({ success: true, id, message: 'Chapter created' });
    }
    catch (error) {
        console.error('Error creating training chapter:', error);
        res.status(500).json({ success: false, message: 'Failed to create chapter' });
    }
});
exports.createTrainingChapter = createTrainingChapter;
const updateTrainingChapter = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { title, titleEn, description, sortOrder, estimatedMinutes } = req.body;
        const updates = [];
        const params = [];
        if (title !== undefined) {
            updates.push('title = ?');
            params.push(title);
        }
        if (titleEn !== undefined) {
            updates.push('titleEn = ?');
            params.push(titleEn);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description);
        }
        if (sortOrder !== undefined) {
            updates.push('sortOrder = ?');
            params.push(sortOrder);
        }
        if (estimatedMinutes !== undefined) {
            updates.push('estimatedMinutes = ?');
            params.push(estimatedMinutes);
        }
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        params.push(id);
        yield (0, db_1.safePoolQuery)(`UPDATE training_chapters SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ success: true, message: 'Chapter updated' });
    }
    catch (error) {
        console.error('Error updating training chapter:', error);
        res.status(500).json({ success: false, message: 'Failed to update chapter' });
    }
});
exports.updateTrainingChapter = updateTrainingChapter;
const deleteTrainingChapter = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield (0, db_1.safePoolQuery)(`DELETE FROM training_chapters WHERE id = ?`, [id]);
        res.json({ success: true, message: 'Chapter deleted' });
    }
    catch (error) {
        console.error('Error deleting training chapter:', error);
        res.status(500).json({ success: false, message: 'Failed to delete chapter' });
    }
});
exports.deleteTrainingChapter = deleteTrainingChapter;
// ═══════════════════════════════════════════════════════
// Topics
// ═══════════════════════════════════════════════════════
const createTrainingTopic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { chapterId, title, content, contentType, attachmentUrl, sortOrder, estimatedMinutes } = req.body;
        if (!chapterId || !title) {
            return res.status(400).json({ success: false, message: 'chapterId and title are required' });
        }
        const id = (0, crypto_1.randomUUID)();
        let order = sortOrder;
        if (order === undefined || order === null) {
            const [maxRows] = yield (0, db_1.safePoolQuery)(`SELECT COALESCE(MAX(sortOrder), -1) + 1 AS nextOrder FROM training_topics WHERE chapterId = ?`, [chapterId]);
            order = (_b = (_a = maxRows[0]) === null || _a === void 0 ? void 0 : _a.nextOrder) !== null && _b !== void 0 ? _b : 0;
        }
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO training_topics (id, chapterId, title, content, contentType, attachmentUrl, sortOrder, estimatedMinutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, chapterId, title, content || null, contentType || 'TEXT', attachmentUrl || null, order, estimatedMinutes || null]);
        res.status(201).json({ success: true, id, message: 'Topic created' });
    }
    catch (error) {
        console.error('Error creating training topic:', error);
        res.status(500).json({ success: false, message: 'Failed to create topic' });
    }
});
exports.createTrainingTopic = createTrainingTopic;
const updateTrainingTopic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { title, content, contentType, attachmentUrl, sortOrder, estimatedMinutes } = req.body;
        const updates = [];
        const params = [];
        if (title !== undefined) {
            updates.push('title = ?');
            params.push(title);
        }
        if (content !== undefined) {
            updates.push('content = ?');
            params.push(content);
        }
        if (contentType !== undefined) {
            updates.push('contentType = ?');
            params.push(contentType);
        }
        if (attachmentUrl !== undefined) {
            updates.push('attachmentUrl = ?');
            params.push(attachmentUrl);
        }
        if (sortOrder !== undefined) {
            updates.push('sortOrder = ?');
            params.push(sortOrder);
        }
        if (estimatedMinutes !== undefined) {
            updates.push('estimatedMinutes = ?');
            params.push(estimatedMinutes);
        }
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        params.push(id);
        yield (0, db_1.safePoolQuery)(`UPDATE training_topics SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ success: true, message: 'Topic updated' });
    }
    catch (error) {
        console.error('Error updating training topic:', error);
        res.status(500).json({ success: false, message: 'Failed to update topic' });
    }
});
exports.updateTrainingTopic = updateTrainingTopic;
const deleteTrainingTopic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield (0, db_1.safePoolQuery)(`DELETE FROM training_topics WHERE id = ?`, [id]);
        res.json({ success: true, message: 'Topic deleted' });
    }
    catch (error) {
        console.error('Error deleting training topic:', error);
        res.status(500).json({ success: false, message: 'Failed to delete topic' });
    }
});
exports.deleteTrainingTopic = deleteTrainingTopic;
// ═══════════════════════════════════════════════════════
// Questions (Quiz)
// ═══════════════════════════════════════════════════════
const createTrainingQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { chapterId, topicId, questionText, questionType, options, correctAnswer, sortOrder, points } = req.body;
        if (!chapterId || !questionText || !questionType) {
            return res.status(400).json({ success: false, message: 'chapterId, questionText, and questionType are required' });
        }
        const id = (0, crypto_1.randomUUID)();
        let order = sortOrder;
        if (order === undefined || order === null) {
            const [maxRows] = yield (0, db_1.safePoolQuery)(`SELECT COALESCE(MAX(sortOrder), -1) + 1 AS nextOrder FROM training_questions WHERE chapterId = ?`, [chapterId]);
            order = (_b = (_a = maxRows[0]) === null || _a === void 0 ? void 0 : _a.nextOrder) !== null && _b !== void 0 ? _b : 0;
        }
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO training_questions (id, chapterId, topicId, questionText, questionType, options, correctAnswer, sortOrder, points)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            id, chapterId, topicId || null, questionText, questionType,
            options ? JSON.stringify(options) : null,
            correctAnswer || null, order, points || 1,
        ]);
        res.status(201).json({ success: true, id, message: 'Question created' });
    }
    catch (error) {
        console.error('Error creating training question:', error);
        res.status(500).json({ success: false, message: 'Failed to create question' });
    }
});
exports.createTrainingQuestion = createTrainingQuestion;
const updateTrainingQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { questionText, questionType, options, correctAnswer, sortOrder, points } = req.body;
        const updates = [];
        const params = [];
        if (questionText !== undefined) {
            updates.push('questionText = ?');
            params.push(questionText);
        }
        if (questionType !== undefined) {
            updates.push('questionType = ?');
            params.push(questionType);
        }
        if (options !== undefined) {
            updates.push('options = ?');
            params.push(JSON.stringify(options));
        }
        if (correctAnswer !== undefined) {
            updates.push('correctAnswer = ?');
            params.push(correctAnswer);
        }
        if (sortOrder !== undefined) {
            updates.push('sortOrder = ?');
            params.push(sortOrder);
        }
        if (points !== undefined) {
            updates.push('points = ?');
            params.push(points);
        }
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        params.push(id);
        yield (0, db_1.safePoolQuery)(`UPDATE training_questions SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ success: true, message: 'Question updated' });
    }
    catch (error) {
        console.error('Error updating training question:', error);
        res.status(500).json({ success: false, message: 'Failed to update question' });
    }
});
exports.updateTrainingQuestion = updateTrainingQuestion;
const deleteTrainingQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield (0, db_1.safePoolQuery)(`DELETE FROM training_questions WHERE id = ?`, [id]);
        res.json({ success: true, message: 'Question deleted' });
    }
    catch (error) {
        console.error('Error deleting training question:', error);
        res.status(500).json({ success: false, message: 'Failed to delete question' });
    }
});
exports.deleteTrainingQuestion = deleteTrainingQuestion;
// ═══════════════════════════════════════════════════════
// Enrollments
// ═══════════════════════════════════════════════════════
const enrollEmployee = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { employeeId, programId } = req.body;
        if (!employeeId || !programId) {
            return res.status(400).json({ success: false, message: 'employeeId and programId are required' });
        }
        const id = (0, crypto_1.randomUUID)();
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || null;
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO training_enrollments (id, employeeId, programId, assignedBy)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE status = VALUES(status)
    `, [id, employeeId, programId, userId]);
        res.status(201).json({ success: true, id, message: 'Employee enrolled' });
    }
    catch (error) {
        console.error('Error enrolling employee:', error);
        res.status(500).json({ success: false, message: 'Failed to enroll employee' });
    }
});
exports.enrollEmployee = enrollEmployee;
const bulkEnrollEmployees = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { employeeIds, programId } = req.body;
        if (!(employeeIds === null || employeeIds === void 0 ? void 0 : employeeIds.length) || !programId) {
            return res.status(400).json({ success: false, message: 'employeeIds array and programId are required' });
        }
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || null;
        let enrolled = 0;
        for (const employeeId of employeeIds) {
            const id = (0, crypto_1.randomUUID)();
            yield (0, db_1.safePoolQuery)(`
        INSERT IGNORE INTO training_enrollments (id, employeeId, programId, assignedBy)
        VALUES (?, ?, ?, ?)
      `, [id, employeeId, programId, userId]);
            enrolled++;
        }
        res.status(201).json({ success: true, enrolled, message: `${enrolled} employees enrolled` });
    }
    catch (error) {
        console.error('Error bulk enrolling:', error);
        res.status(500).json({ success: false, message: 'Failed to enroll employees' });
    }
});
exports.bulkEnrollEmployees = bulkEnrollEmployees;
const getEmployeeEnrollments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employeeId } = req.params;
        const [enrollments] = yield (0, db_1.safePoolQuery)(`
      SELECT te.*, tp.name AS programName, tp.description AS programDescription,
             tp.estimatedHours, tp.coverImage,
             (SELECT COUNT(*) FROM training_chapters tc WHERE tc.programId = tp.id) AS totalChapters,
             (SELECT COUNT(*) FROM training_topics tt 
              JOIN training_chapters tc2 ON tt.chapterId = tc2.id 
              WHERE tc2.programId = tp.id) AS totalTopics,
             (SELECT COUNT(*) FROM training_progress tpr WHERE tpr.enrollmentId = te.id AND tpr.isCompleted = 1) AS completedTopics
      FROM training_enrollments te
      JOIN training_programs tp ON te.programId = tp.id
      WHERE te.employeeId = ?
      ORDER BY te.assignedAt DESC
    `, [employeeId]);
        res.json({ success: true, data: enrollments });
    }
    catch (error) {
        console.error('Error fetching enrollments:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch enrollments' });
    }
});
exports.getEmployeeEnrollments = getEmployeeEnrollments;
const getProgramEnrollments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { programId } = req.params;
        const [enrollments] = yield (0, db_1.safePoolQuery)(`
      SELECT te.*, e.fullName AS employeeName, e.department, e.jobTitle,
             (SELECT COUNT(*) FROM training_topics tt 
              JOIN training_chapters tc ON tt.chapterId = tc.id 
              WHERE tc.programId = te.programId) AS totalTopics,
             (SELECT COUNT(*) FROM training_progress tpr WHERE tpr.enrollmentId = te.id AND tpr.isCompleted = 1) AS completedTopics
      FROM training_enrollments te
      JOIN employees e ON te.employeeId = e.id
      WHERE te.programId = ?
      ORDER BY te.assignedAt DESC
    `, [programId]);
        res.json({ success: true, data: enrollments });
    }
    catch (error) {
        console.error('Error fetching program enrollments:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch program enrollments' });
    }
});
exports.getProgramEnrollments = getProgramEnrollments;
const removeEnrollment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield (0, db_1.safePoolQuery)(`DELETE FROM training_enrollments WHERE id = ?`, [id]);
        res.json({ success: true, message: 'Enrollment removed' });
    }
    catch (error) {
        console.error('Error removing enrollment:', error);
        res.status(500).json({ success: false, message: 'Failed to remove enrollment' });
    }
});
exports.removeEnrollment = removeEnrollment;
// ═══════════════════════════════════════════════════════
// Progress Tracking
// ═══════════════════════════════════════════════════════
const markTopicComplete = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { enrollmentId, topicId, timeSpentMinutes } = req.body;
        if (!enrollmentId || !topicId) {
            return res.status(400).json({ success: false, message: 'enrollmentId and topicId are required' });
        }
        const id = (0, crypto_1.randomUUID)();
        yield (0, db_1.safePoolQuery)(`
      INSERT INTO training_progress (id, enrollmentId, topicId, isCompleted, completedAt, timeSpentMinutes)
      VALUES (?, ?, ?, 1, NOW(), ?)
      ON DUPLICATE KEY UPDATE isCompleted = 1, completedAt = NOW(), timeSpentMinutes = COALESCE(VALUES(timeSpentMinutes), timeSpentMinutes)
    `, [id, enrollmentId, topicId, timeSpentMinutes || 0]);
        // Check if enrollment should transition to IN_PROGRESS or COMPLETED
        yield updateEnrollmentStatus(enrollmentId);
        res.json({ success: true, message: 'Topic marked as complete' });
    }
    catch (error) {
        console.error('Error marking topic complete:', error);
        res.status(500).json({ success: false, message: 'Failed to mark topic complete' });
    }
});
exports.markTopicComplete = markTopicComplete;
const getEnrollmentProgress = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { enrollmentId } = req.params;
        const [progress] = yield (0, db_1.safePoolQuery)(`
      SELECT tp.*, tt.title AS topicTitle, tt.chapterId
      FROM training_progress tp
      JOIN training_topics tt ON tp.topicId = tt.id
      WHERE tp.enrollmentId = ?
    `, [enrollmentId]);
        res.json({ success: true, data: progress });
    }
    catch (error) {
        console.error('Error fetching progress:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch progress' });
    }
});
exports.getEnrollmentProgress = getEnrollmentProgress;
// ═══════════════════════════════════════════════════════
// Quiz Submission
// ═══════════════════════════════════════════════════════
const submitQuizAnswers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { enrollmentId, answers } = req.body;
        // answers: [{ questionId, answerText }]
        if (!enrollmentId || !(answers === null || answers === void 0 ? void 0 : answers.length)) {
            return res.status(400).json({ success: false, message: 'enrollmentId and answers are required' });
        }
        // Fetch correct answers for the questions
        const questionIds = answers.map((a) => a.questionId);
        const placeholders = questionIds.map(() => '?').join(',');
        const [questions] = yield (0, db_1.safePoolQuery)(`SELECT id, correctAnswer, points FROM training_questions WHERE id IN (${placeholders})`, questionIds);
        const questionMap = new Map(questions.map((q) => [q.id, q]));
        let totalPoints = 0;
        let earnedPoints = 0;
        for (const answer of answers) {
            const question = questionMap.get(answer.questionId);
            if (!question)
                continue;
            const isCorrect = question.correctAnswer
                ? String(answer.answerText).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase()
                : null;
            totalPoints += question.points || 1;
            if (isCorrect)
                earnedPoints += question.points || 1;
            const id = (0, crypto_1.randomUUID)();
            yield (0, db_1.safePoolQuery)(`
        INSERT INTO training_answers (id, enrollmentId, questionId, answerText, isCorrect)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE answerText = VALUES(answerText), isCorrect = VALUES(isCorrect), answeredAt = NOW()
      `, [id, enrollmentId, answer.questionId, answer.answerText, isCorrect]);
        }
        // Update enrollment score
        const scorePercentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
        yield (0, db_1.safePoolQuery)(`UPDATE training_enrollments SET score = ? WHERE id = ?`, [scorePercentage, enrollmentId]);
        res.json({
            success: true,
            score: scorePercentage,
            earnedPoints,
            totalPoints,
            message: `Quiz submitted. Score: ${scorePercentage.toFixed(1)}%`,
        });
    }
    catch (error) {
        console.error('Error submitting quiz:', error);
        res.status(500).json({ success: false, message: 'Failed to submit quiz' });
    }
});
exports.submitQuizAnswers = submitQuizAnswers;
// ═══════════════════════════════════════════════════════
// Dashboard / Reports
// ═══════════════════════════════════════════════════════
const getTrainingDashboard = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Overall stats
        const [programStats] = yield (0, db_1.safePoolQuery)(`
      SELECT 
        (SELECT COUNT(*) FROM training_programs WHERE isActive = 1) AS totalPrograms,
        (SELECT COUNT(*) FROM training_enrollments) AS totalEnrollments,
        (SELECT COUNT(*) FROM training_enrollments WHERE status = 'COMPLETED') AS completedEnrollments,
        (SELECT COUNT(*) FROM training_enrollments WHERE status = 'IN_PROGRESS') AS inProgressEnrollments,
        (SELECT AVG(score) FROM training_enrollments WHERE score IS NOT NULL) AS avgScore
    `);
        // Per-program completion rates
        const [programBreakdown] = yield (0, db_1.safePoolQuery)(`
      SELECT tp.id, tp.name,
             COUNT(te.id) AS enrollments,
             SUM(CASE WHEN te.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
             AVG(te.score) AS avgScore
      FROM training_programs tp
      LEFT JOIN training_enrollments te ON te.programId = tp.id
      WHERE tp.isActive = 1
      GROUP BY tp.id, tp.name
      ORDER BY enrollments DESC
    `);
        res.json({
            success: true,
            data: {
                stats: programStats[0] || {},
                programs: programBreakdown,
            },
        });
    }
    catch (error) {
        console.error('Error fetching training dashboard:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch training dashboard' });
    }
});
exports.getTrainingDashboard = getTrainingDashboard;
// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════
function updateEnrollmentStatus(enrollmentId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Get enrollment and count totals
            const [enrollment] = yield (0, db_1.safePoolQuery)(`SELECT programId FROM training_enrollments WHERE id = ?`, [enrollmentId]);
            if (!enrollment.length)
                return;
            const programId = enrollment[0].programId;
            const [totals] = yield (0, db_1.safePoolQuery)(`
      SELECT 
        (SELECT COUNT(*) FROM training_topics tt 
         JOIN training_chapters tc ON tt.chapterId = tc.id 
         WHERE tc.programId = ?) AS totalTopics,
        (SELECT COUNT(*) FROM training_progress tp 
         WHERE tp.enrollmentId = ? AND tp.isCompleted = 1) AS completedTopics
    `, [programId, enrollmentId]);
            const { totalTopics, completedTopics } = totals[0];
            let newStatus = 'NOT_STARTED';
            if (completedTopics > 0 && completedTopics < totalTopics) {
                newStatus = 'IN_PROGRESS';
            }
            else if (totalTopics > 0 && completedTopics >= totalTopics) {
                newStatus = 'COMPLETED';
            }
            const updates = ['status = ?'];
            const params = [newStatus];
            if (newStatus === 'IN_PROGRESS' || newStatus === 'COMPLETED') {
                // Set startedAt if transitioning from NOT_STARTED
                updates.push('startedAt = COALESCE(startedAt, NOW())');
            }
            if (newStatus === 'COMPLETED') {
                updates.push('completedAt = NOW()');
            }
            params.push(enrollmentId);
            yield (0, db_1.safePoolQuery)(`UPDATE training_enrollments SET ${updates.join(', ')} WHERE id = ?`, params);
        }
        catch (error) {
            console.error('Error updating enrollment status:', error);
        }
    });
}
function parseQuestionRow(row) {
    if (!row)
        return row;
    let options = row.options;
    if (typeof options === 'string') {
        try {
            options = JSON.parse(options);
        }
        catch (_a) {
            options = [];
        }
    }
    return Object.assign(Object.assign({}, row), { options: options || [] });
}
