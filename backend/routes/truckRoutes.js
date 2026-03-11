const express = require('express');
const router = express.Router();
const truckController = require('../controllers/truckController');
const { auth } = require('../middleware/auth');
const { validateTruck } = require('../middleware/validator');

module.exports = (io) => {
    router.use(auth);

    router.get('/', truckController.getAllTrucks);
    router.get('/:id', truckController.getTruckById);
    router.post('/', validateTruck, truckController.createTruck);
    
    router.put('/:id', async (req, res, next) => {
        try {
            const truck = await require('../services/fleetService').updateTruck(req.params.id, req.body);
            // Broadcast the individual truck update
            io.emit('truckUpdate', [truck]);
            res.json({ message: 'Truck updated successfully', truck });
        } catch (error) {
            next(error);
        }
    });

    router.delete('/:id', truckController.deleteTruck);
    router.patch('/:id/driver', truckController.assignDriver);

    return router;
};
