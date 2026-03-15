const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30,
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 3,
    },
    role: {
        type: String,
        enum: ['admin', 'driver', 'assistant'],
        default: 'driver',
    },
    // ── Personal profile (driver / assistant) ─────────────────────────────
    fullName:            { type: String, trim: true },
    photoPath:           { type: String },
    dateOfBirth:         { type: Date },
    phone:               { type: String, trim: true },
    additionalPhone:     { type: String, trim: true },
    monthlySalary:       { type: Number, min: 0, default: 0 },
    address:             { type: String, trim: true },
    // ── Professional / compliance ─────────────────────────────────────────
    driverLicenceNumber: { type: String, trim: true },
    aadharNumber:        { type: String, trim: true },
    experienceYears:     { type: Number, min: 0, default: 0 },
    // ─────────────────────────────────────────────────────────────────────
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

userSchema.pre('save', async function (next) {
    if (this.phone) this.phone = String(this.phone).replace(/[\s-]/g, '');
    if (this.additionalPhone) this.additionalPhone = String(this.additionalPhone).replace(/[\s-]/g, '');
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
