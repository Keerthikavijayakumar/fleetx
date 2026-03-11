const express = require('express');
const router = express.Router();
const Emergency = require('../models/Emergency');

module.exports = (io) => {
    // @route   POST /api/emergency
    // @desc    Trigger an emergency alert from a driver
    // @access  Private 
    router.post('/', async (req, res) => {
        try {
            const { driverId, truckId, latitude, longitude, message } = req.body;

            const newAlert = new Emergency({
                driverId,
                truckId,
                latitude,
                longitude,
                message: message || "Emergency alert from driver"
            });

            await newAlert.save();

            // Emit an emergency socket event immediately 
            io.emit('emergencyAlert', newAlert);

            res.status(201).json({
                success: true,
                message: 'Emergency alert dispatched successfully',
                data: newAlert
            });

        } catch (error) {
            console.error('Emergency endpoint error:', error);
            res.status(500).json({ success: false, message: 'Server error processing emergency alert' });
        }
    });

    // @route   GET /api/emergency
    // @desc    Get all active emergency alerts
    // @access  Private
    router.get('/', async (req, res) => {
        try {
            const alerts = await Emergency.find().sort({ timestamp: -1 });
            res.json({ success: true, data: alerts });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Server error fetching emergencies' });
        }
    });

    // @route   PATCH /api/emergency/:id
    // @desc    Mark an emergency alert as resolved
    // @access  Private
    router.patch('/:id', async (req, res) => {
        try {
            const alert = await Emergency.findByIdAndUpdate(
                req.params.id,
                { status: 'resolved' },
                { new: true }
            );

            if (!alert) {
                return res.status(404).json({ success: false, message: 'Alert not found' });
            }

            // Emit an update event so clients can clear the alert
            io.emit('emergencyResolved', alert);

            res.json({ success: true, message: 'Alert resolved', data: alert });
        } catch (error) {
            console.error('Resolve emergency error:', error);
            res.status(500).json({ success: false, message: 'Server error resolving alert' });
        }
    });

    return router;
};
