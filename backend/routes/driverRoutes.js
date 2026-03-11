const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Truck = require('../models/Truck');
const DriverLocation = require('../models/DriverLocation');
const { auth } = require('../middleware/auth');

// Store io instance
let ioInstance = null;

// Helper to calculate distance between two coordinates in km (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (lat1 === lat2 && lon1 === lon2) return 0;
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    return R * c; // Distance in km
};

const setIO = (io) => {
    ioInstance = io;
};

const safeNum = (v, decimals = 6) => (typeof v === 'number' ? parseFloat(v.toFixed(decimals)) : null);

// POST /api/driver/location — Driver sends GPS location
router.post('/location', auth, async (req, res, next) => {
    let session = null;
    try {
        const { driverId, truckId, latitude, longitude, speed, timestamp } = req.body;

        if (!truckId || latitude == null || longitude == null) {
            return res.status(400).json({ message: 'truckId, latitude, and longitude are required' });
        }

        session = await mongoose.startSession();
        await session.withTransaction(async () => {
            // 1. Store the exact location in history
            const locationRecord = new DriverLocation({
                driverId: driverId || req.user?._id || 'unknown',
                truckId,
                latitude,
                longitude,
                speed: speed || 0,
                timestamp: timestamp || new Date()
            });
            await locationRecord.save({ session });

            // 2. Update the main truck record for the dashboard
            const truck = await Truck.findOne({ truckId }).session(session);
            if (!truck) {
                throw Object.assign(new Error('Truck not found'), { status: 404 });
            }

            // Calculate distance if truck already has valid coordinates and has moved
            if (truck.latitude && truck.longitude && (truck.latitude !== latitude || truck.longitude !== longitude)) {
                const distanceKm = calculateDistance(truck.latitude, truck.longitude, latitude, longitude);
                // Sanity check: cap unrealistic GPS jumps (e.g. > 100km in a single ping)
                if (distanceKm > 0 && distanceKm < 100) {
                    truck.totalDistance = (truck.totalDistance || 0) + distanceKm;
                }
            }

            truck.latitude = latitude;
            truck.longitude = longitude;
            if (speed != null) truck.speed = speed;
            truck.engineStatus = speed > 0 ? 'running' : 'idle';
            truck.updatedAt = Date.now();
            await truck.save({ session });
        });

        // 3. Emit real-time update via socket (after commit)
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
                totalDistance: safeNum(t.totalDistance, 2),
                lastServiceDate: t.lastServiceDate,
                lastServiceDistance: safeNum(t.lastServiceDistance, 2),
            }));
            ioInstance.emit('truckUpdate', updates);
        }

        const truck = await Truck.findOne({ truckId });
        res.json({ 
            message: 'Location updated and stored', 
            truck: { 
                truckId: truck.truckId, 
                latitude: truck.latitude, 
                longitude: truck.longitude, 
                speed: truck.speed,
                totalDistance: safeNum(truck.totalDistance, 2)
            } 
        });
    } catch (error) {
        next(error);
    } finally {
        if (session) session.endSession();
    }
});

module.exports = { router, setIO };
