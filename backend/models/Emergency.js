const mongoose = require('mongoose');

const emergencySchema = new mongoose.Schema({
    driverId: {
        type: String,
        required: true,
    },
    truckId: {
        type: String,
        required: true,
    },
    latitude: {
        type: Number,
        required: true,
    },
    longitude: {
        type: Number,
        required: true,
    },
    message: {
        type: String,
        default: "Emergency alert from driver",
    },
    status: {
        type: String,
        enum: ['active', 'resolved'],
        default: 'active',
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Emergency', emergencySchema);
