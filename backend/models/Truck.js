const mongoose = require('mongoose');

const truckSchema = new mongoose.Schema({
    // ── Basic Vehicle Details ───────────────────────────────────────────
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
    // No permanent driver; assigned per trip via Route model
    registrationDate: {
        type: Date,
        required: [true, 'Registration date is required'],
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'maintenance'],
        default: 'active',
    },

    // ── Fuel / Operational ─────────────────────────────────────────────
    fuelEfficiency: {
        type: Number,
        required: true,
        min: 0,
        // stored as mileage (km per litre)
    },
    tankCapacity: {
        type: Number,
        required: true,
        min: 0,
        // litres
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
        // kg CO2 per litre – auto-assigned by backend
    },

    // ── Insurance ──────────────────────────────────────────────────────
    insuranceNumber: {
        type: String,
        trim: true,
        default: '',
    },
    insuranceExpiry: {
        type: Date,
    },

    // ── Tax Document Reference ─────────────────────────────────────────
    taxDocumentNumber: {
        type: String,
        trim: true,
        default: '',
    },

    // ── Tamil Nadu State Road Tax (quarterly – every 3 months) ────────
    stateTaxAmount: {
        type: Number,
        default: 0,
    },
    stateTaxPaidDate: {
        type: Date,
    },
    stateTaxNextDue: {
        type: Date,
        // computed: stateTaxPaidDate + 3 months (or registrationDate + 3 months)
    },
    stateTaxPermitPath: {
        type: String,
        default: '',
        // uploaded permit/receipt PDF path
    },

    // ── Central Government Road Tax (yearly from registration date) ────
    centralTaxAmount: {
        type: Number,
        default: 0,
    },
    centralTaxPaidDate: {
        type: Date,
    },
    centralTaxNextDue: {
        type: Date,
        // computed: registrationDate + 1 year
    },
    centralTaxPermitPath: {
        type: String,
        default: '',
        // uploaded permit PDF path
    },

    // ── Vehicle Model ──────────────────────────────────────────────────
    vehicleModel: {
        type: String,
        trim: true,
        default: '',
    },

    // ── FC (Fitness Certificate) Renewal ──────────────────────────────
    // New lorry: renewed twice a year for first 2 years → 4 dates
    fcRenewalDates: [
        { type: Date },
    ],

    // ── Live Tracking & Telemetry ──────────────────────────────────────
    latitude: { type: Number, default: 11.0168 },  // Chennai default
    longitude: { type: Number, default: 76.9558 },
    speed: { type: Number, default: 0, min: 0 },
    fuelLevel: { type: Number, default: 100, min: 0, max: 100 },
    engineStatus: {
        type: String,
        enum: ['running', 'idle', 'off'],
        default: 'off',
    },
    totalDistance: { type: Number, default: 0, min: 0 },

    // ── Maintenance Reference ──────────────────────────────────────────
    lastServiceDate: { type: Date, default: Date.now },
    lastServiceDistance: { type: Number, default: 0, min: 0 },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

truckSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Truck', truckSchema);
