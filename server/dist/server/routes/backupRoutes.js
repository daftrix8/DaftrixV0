"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const backupController_1 = require("../controllers/backupController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Create new backup (async — returns backupId for polling)
router.post('/create', (0, authMiddleware_1.requirePermission)('backup.manage'), backupController_1.createBackup);
// Poll backup job status
router.get('/status/:backupId', (0, authMiddleware_1.requirePermission)('backup.manage'), backupController_1.getBackupJobStatus);
// List all backups
router.get('/list', (0, authMiddleware_1.requirePermission)('backup.manage'), backupController_1.listBackups);
// Download specific backup
router.get('/:filename/download', (0, authMiddleware_1.requirePermission)('backup.manage'), backupController_1.downloadBackup);
// Restore from backup
router.post('/:filename/restore', (0, authMiddleware_1.requirePermission)('backup.restore'), backupController_1.restoreBackup);
// Delete backup
router.delete('/:filename', (0, authMiddleware_1.requirePermission)('backup.manage'), backupController_1.deleteBackup);
// Get backup settings (server-wide)
router.get('/settings', (0, authMiddleware_1.requirePermission)('backup.manage'), backupController_1.getBackupSettingsAPI);
// Update backup settings (server-wide)
router.post('/settings', (0, authMiddleware_1.requirePermission)('backup.manage'), backupController_1.updateBackupSettingsAPI);
// Browse server folders (for backup path selection)
router.get('/browse-folders', (0, authMiddleware_1.requirePermission)('backup.manage'), backupController_1.browseFolders);
// User-specific backup settings
router.get('/user-settings', (0, authMiddleware_1.requirePermission)('backup.manage'), backupController_1.getUserBackupSettings);
router.post('/user-settings', (0, authMiddleware_1.requirePermission)('backup.manage'), backupController_1.updateUserBackupSettings);
exports.default = router;
