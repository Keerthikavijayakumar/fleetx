const mongoose = require('mongoose');

const truckAnalyticsSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    truckId: { type: String, required: true, trim: true },
    distanceKm: { type: Number, required: true, min: 0 },
    fuelUsedLiters: { type: Number, required: true, min: 0 },
    costRs: { type: Number, required: true, min: 0 },
    co2Kg: { type: Number, required: true, min: 0 },
    deliveryTimeMin: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, default: Date.now },
});

truckAnalyticsSchema.index({ date: 1, truckId: 1 });

module.exports = mongoose.model('TruckAnalytics', truckAnalyticsSchema, 'truck_analytics');
