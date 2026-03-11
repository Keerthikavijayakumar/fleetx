const mongoose = require('mongoose');

const driverLocationSchema = new mongoose.Schema({
    driverId: {
        type: String,
        required: [true, 'Driver ID is required'],
        trim: true,
    },
    truckId: {
        type: String,
        required: [true, 'Truck ID is required'],
        trim: true,
    },
    latitude: {
        type: Number,
        required: [true, 'Latitude is required'],
    },
    longitude: {
        type: Number,
        required: [true, 'Longitude is required'],
    },
    speed: {
        type: Number,
        default: 0,
        min: [0, 'Speed cannot be negative'],
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

// Indexes to optimize queries by truck and driver, and optional TTL retention
driverLocationSchema.index({ truckId: 1, timestamp: -1 });
driverLocationSchema.index({ driverId: 1, timestamp: -1 });
const retention = Number(process.env.DRIVER_LOCATION_RETENTION) || 30 * 24 * 60 * 60; // default 30 days
driverLocationSchema.index({ timestamp: 1 }, { expireAfterSeconds: retention });

module.exports = mongoose.model('DriverLocation', driverLocationSchema);
