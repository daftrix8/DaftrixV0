"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const projectController_1 = require("../controllers/projectController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Projects
router.get('/', (0, authMiddleware_1.requirePermission)('projects.view'), projectController_1.getProjects);
router.get('/:id', (0, authMiddleware_1.requirePermission)('projects.view'), projectController_1.getProject);
router.post('/', (0, authMiddleware_1.requirePermission)('projects.manage'), projectController_1.createProject);
router.put('/:id', (0, authMiddleware_1.requirePermission)('projects.manage'), projectController_1.updateProject);
router.delete('/:id', (0, authMiddleware_1.requirePermission)('projects.manage'), projectController_1.deleteProject);
// Tasks
router.get('/tasks/all', (0, authMiddleware_1.requirePermission)('projects.view'), projectController_1.getTasks);
router.post('/tasks', (0, authMiddleware_1.requirePermission)('projects.manage'), projectController_1.createTask);
router.put('/tasks/:id', (0, authMiddleware_1.requirePermission)('projects.manage'), projectController_1.updateTask);
router.delete('/tasks/:id', (0, authMiddleware_1.requirePermission)('projects.manage'), projectController_1.deleteTask);
// Timesheets
router.get('/timesheets/all', (0, authMiddleware_1.requirePermission)('projects.view'), projectController_1.getTimesheets);
router.post('/timesheets', (0, authMiddleware_1.requirePermission)('projects.manage'), projectController_1.createTimesheet);
router.put('/timesheets/:id/status', (0, authMiddleware_1.requirePermission)('projects.manage'), projectController_1.updateTimesheetStatus);
router.delete('/timesheets/:id', (0, authMiddleware_1.requirePermission)('projects.manage'), projectController_1.deleteTimesheet);
exports.default = router;
