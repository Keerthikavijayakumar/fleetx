const mongoose = require('mongoose');

const salarySchema = new mongoose.Schema({
    tripId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Route',
        required: true,
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
    totalAmountReceived: {
        type: Number,
        required: true,
        min: 0,
    },
    driverShare: {
        type: Number,
        required: true,
        min: 0,
        comment: '15% of totalAmountReceived',
    },
    assistantShare: {
        type: Number,
        required: true,
        min: 0,
        comment: '4% of driverShare (0.6% of totalAmountReceived)',
    },
    salaryDate: {
        type: Date,
        required: true,
    },
    notes: {
        type: String,
        trim: true,
        default: '',
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

salarySchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Salary', salarySchema);
