const mongoose = require('mongoose');

const truckSchema = new mongoose.Schema({
    truckId: {
        type: String,
        required: [true, 'Truck ID is required'],
        unique: true,
        trim: true,
    },
    licensePlate: {
        type: String,
        required: [true, 'License plate is required'],
        unique: true,
        trim: true,
    },
    driverName: {
        type: String,
        required: [true, 'Driver name is required'],
        trim: true,
    },
    fuelEfficiency: {
        type: Number,
        required: true,
        min: 0,
        comment: 'km per litre',
    },
    tankCapacity: {
        type: Number,
        required: true,
        min: 0,
        comment: 'litres',
    },
    costPerLitre: {
        type: Number,
        required: true,
        min: 0,
    },
    emissionFactor: {
        type: Number,
        required: true,
        min: 0,
        comment: 'kg CO2 per litre',
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'maintenance'],
        default: 'active',
    },
    latitude: {
        type: Number,
        default: 28.6139,
    },
    longitude: {
        type: Number,
        default: 77.2090,
    },
    speed: {
        type: Number,
        default: 0,
        min: 0,
    },
    fuelLevel: {
        type: Number,
        default: 100,
        min: 0,
        max: 100,
    },
    engineStatus: {
        type: String,
        enum: ['running', 'idle', 'off'],
        default: 'off',
    },
    totalDistance: {
        type: Number,
        default: 0,
        min: 0,
        comment: 'Kilometers',
    },
    lastServiceDate: {
        type: Date,
        default: Date.now,
    },
    lastServiceDistance: {
        type: Number,
        default: 0,
        min: 0,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

truckSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Truck', truckSchema);
