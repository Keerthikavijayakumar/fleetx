const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Truck = require('../models/Truck');
const DriverLocation = require('../models/DriverLocation');
const { auth } = require('../middleware/auth');

// Store io instance
let ioInstance = null;

const setIO = (io) => {
    ioInstance = io;
};

const safeNum = (v, decimals = 6) => (typeof v === 'number' ? parseFloat(v.toFixed(decimals)) : null);

// POST /api/location/update — Driver sends GPS location
router.post('/update', auth, async (req, res, next) => {
    let session = null;
    try {
        const { truckId, latitude, longitude, speed } = req.body;

        if (!truckId || latitude == null || longitude == null) {
            return res.status(400).json({ message: 'truckId, latitude, and longitude are required' });
        }

        // Start a session so we can save history + update truck atomically when possible
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
            // 1. Store history record
            const locationRecord = new DriverLocation({
                driverId: req.user?._id || 'unknown',
                truckId,
                latitude,
                longitude,
                speed: speed || 0,
                timestamp: new Date()
            });
            await locationRecord.save({ session });

            // 2. Update truck state
            const truck = await Truck.findOne({ truckId }).session(session);
            if (!truck) {
                // Abort transaction by throwing
                throw Object.assign(new Error('Truck not found'), { status: 404 });
            }

            truck.latitude = latitude;
            truck.longitude = longitude;
            if (speed != null) truck.speed = speed;
            truck.engineStatus = speed > 0 ? 'running' : 'idle';
            truck.updatedAt = Date.now();
            await truck.save({ session });
        });

        // Emit real-time update via socket (after transaction committed)
        if (ioInstance) {
            const trucks = await Truck.find({ status: 'active' });
            const updates = trucks.map(t => ({
                _id: t._id,
                truckId: t.truckId,
                driverName: t.driverName,
                latitude: safeNum(t.latitude, 6),
                longitude: safeNum(t.longitude, 6),
                speed: typeof t.speed === 'number' ? t.speed : 0,
                fuelLevel: safeNum(t.fuelLevel, 1),
                engineStatus: t.engineStatus,
                licensePlate: t.licensePlate,
            }));
            ioInstance.emit('truckUpdate', updates);
        }

        const updatedTruck = await Truck.findOne({ truckId });
        res.json({ message: 'Location updated and stored', truck: { truckId: updatedTruck.truckId, latitude: updatedTruck.latitude, longitude: updatedTruck.longitude, speed: updatedTruck.speed } });
    } catch (error) {
        next(error);
    } finally {
        if (session) session.endSession();
    }
});

module.exports = { router, setIO };
