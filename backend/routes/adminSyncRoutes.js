const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const adminSyncController = require('../controllers/adminSyncController');

router.use(auth, authorize('admin'));

router.post('/ialert-csv/run-now', adminSyncController.runNow);
router.post('/ialert-csv/upload-root', adminSyncController.upload.single('file'), adminSyncController.uploadRootCsvAndSync);
router.get('/ialert-csv/status', adminSyncController.getStatus);
router.get('/ialert-csv/history', adminSyncController.getHistory);

module.exports = router;
