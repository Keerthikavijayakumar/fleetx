const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');
const { auth, authorize } = require('../middleware/auth');
const { validateRoute } = require('../middleware/validator');

router.use(auth);

router.get('/', routeController.getAllRoutes);
router.get('/:id', routeController.getRouteById);
router.post('/', authorize('admin'), validateRoute, routeController.planRoute);
router.put('/:id', authorize('admin'), routeController.updateRoute);
router.delete('/:id', authorize('admin'), routeController.deleteRoute);

module.exports = router;
