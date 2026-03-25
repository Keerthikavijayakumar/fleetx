const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
    truckId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Truck',
        required: false,
    },
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
    },
    assistantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
    },
    source: {
        type: String,
        required: [true, 'Source location is required'],
        trim: true,
    },
    destination: {
        type: String,
        required: [true, 'Destination is required'],
        trim: true,
    },
    distance: {
        type: Number,
        default: 0,
        comment: 'in km',
    },
    duration: {
        type: String,
        default: '',
        comment: 'estimated time',
    },
    fuelConsumed: {
        type: Number,
        default: 0,
        comment: 'litres',
    },
    fuelCost: {
        type: Number,
        default: 0,
        comment: 'in currency',
    },
    foodCost: {
        type: Number,
        default: 0,
        min: 0,
        comment: 'meal and crew food expenses',
    },
    estimatedDurationMinutes: {
        type: Number,
        default: 0,
        min: 0,
    },
    estimatedFuelConsumed: {
        type: Number,
        default: 0,
        min: 0,
    },
    estimatedFuelCost: {
        type: Number,
        default: 0,
        min: 0,
    },
    actualDurationMinutes: {
        type: Number,
        default: null,
        min: 0,
    },
    actualFuelConsumed: {
        type: Number,
        default: null,
        min: 0,
    },
    actualFuelCost: {
        type: Number,
        default: null,
        min: 0,
    },
    actualTollCost: {
        type: Number,
        default: null,
        min: 0,
    },
    actualFoodCost: {
        type: Number,
        default: null,
        min: 0,
    },
    actualTotalCost: {
        type: Number,
        default: null,
        min: 0,
    },
    tollCount: {
        type: Number,
        default: 0,
        min: 0,
    },
    tollPrice: {
        type: Number,
        default: 0,
        min: 0,
        comment: 'average or per-toll price in currency',
    },
    tollTotalCost: {
        type: Number,
        default: 0,
        min: 0,
    },
    totalTripCost: {
        type: Number,
        default: 0,
        min: 0,
    },
    carbonEmission: {
        type: Number,
        default: 0,
        comment: 'kg CO2',
    },
    trafficLevel: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        default: 'Low',
    },
    status: {
        type: String,
        enum: ['scheduled', 'in_transit', 'completed', 'delayed'],
        default: 'scheduled',
    },
    tripStartTime: {
        type: Date,
        default: null,
    },
    tripEndTime: {
        type: Date,
        default: null,
    },
    polyline: {
        type: String,
        default: '',
    },
    sourceSystem: {
        type: String,
        enum: ['manual', 'ialert_csv'],
        default: 'manual',
    },
    externalTripKey: {
        type: String,
        default: '',
        trim: true,
    },
    startLatitude: {
        type: Number,
        default: null,
    },
    startLongitude: {
        type: Number,
        default: null,
    },
    endLatitude: {
        type: Number,
        default: null,
    },
    endLongitude: {
        type: Number,
        default: null,
    },
    // ── Telemetry-derived trip fields ──────────────────────────────────────────
    registrationNumber: {
        type: String,
        default: '',
        trim: true,
        index: true,
    },
    masterTripId: {
        type: String,
        default: '',
        trim: true,
        index: true,
    },
    distanceKm: {
        type: Number,
        default: null,
    },
    avgSpeedKmph: {
        type: Number,
        default: null,
    },
    maxSpeedKmph: {
        type: Number,
        default: null,
    },
    durationMinutes: {
        type: Number,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

routeSchema.index(
    { sourceSystem: 1, externalTripKey: 1 },
    {
        unique: true,
        partialFilterExpression: {
            sourceSystem: 'ialert_csv',
            externalTripKey: { $type: 'string', $ne: '' },
        },
    }
);

// getTripList: sort { tripStartTime:-1, startTime:-1 } + filter by sourceSystem + registrationNumber
routeSchema.index({ sourceSystem: 1, registrationNumber: 1, tripStartTime: -1 });
// maintenanceService: query by truckId
routeSchema.index({ truckId: 1 });

routeSchema.pre('save', function (next) {
    const tollComputed = this.tollCount * this.tollPrice;
    this.tollTotalCost = Number((this.tollTotalCost || tollComputed || 0).toFixed(2));
    this.totalTripCost = Number(((this.fuelCost || 0) + (this.tollTotalCost || 0) + (this.foodCost || 0)).toFixed(2));
    next();
});

module.exports = mongoose.model('Route', routeSchema);
