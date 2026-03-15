const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { auth, authorize } = require('../middleware/auth');

router.use(auth);

router.get('/dashboard', analyticsController.getDashboardStats);
router.get('/admin/full-access', authorize('admin'), analyticsController.getAdminFullAccessData);
router.get('/admin/csv-overview', authorize('admin'), analyticsController.getAdminCsvOverview);
router.get('/admin/report', authorize('admin'), analyticsController.downloadAdminReport);
router.post('/admin/entries', authorize('admin'), analyticsController.createAdminAnalyticsEntry);
router.put('/admin/entries/:id', authorize('admin'), analyticsController.updateAdminAnalyticsEntry);
router.post('/admin/upload-csv', authorize('admin'), analyticsController.upload.single('file'), analyticsController.uploadCSV);
router.get('/fuel', analyticsController.getFuelConsumption);
router.get('/maintenance-cost', analyticsController.getMaintenanceCost);
router.get('/co2', analyticsController.getCO2Emissions);
router.get('/delivery-time', analyticsController.getDeliveryTime);
router.get('/traffic', analyticsController.getTrafficImpact);

module.exports = router;
