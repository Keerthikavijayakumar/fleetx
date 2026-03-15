const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const Alert = require('../models/Alert');

// GET /api/alerts — list with filters + pagination
router.get('/', auth, authorize('admin', 'assistant'), async (req, res, next) => {
    try {
        const {
            registrationNumber,
            category,
            severity,
            status = 'active',
            page = 1,
            limit = 50,
        } = req.query;

        const filter = {};
        if (registrationNumber) filter.registrationNumber = registrationNumber;
        if (category) filter.category = category;
        if (severity) filter.severity = severity;
        if (status !== 'all') filter.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [alerts, total] = await Promise.all([
            Alert.find(filter).sort({ timestamp: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            Alert.countDocuments(filter),
        ]);

        res.json({ alerts, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        next(err);
    }
});

// GET /api/alerts/unread-count
router.get('/unread-count', auth, authorize('admin', 'assistant'), async (req, res, next) => {
    try {
        const count = await Alert.countDocuments({ status: 'active' });
        res.json({ count });
    } catch (err) {
        next(err);
    }
});

// PUT /api/alerts/:id/acknowledge
router.put('/:id/acknowledge', auth, authorize('admin', 'assistant'), async (req, res, next) => {
    try {
        const alert = await Alert.findByIdAndUpdate(
            req.params.id,
            { status: 'acknowledged' },
            { new: true }
        );
        if (!alert) return res.status(404).json({ message: 'Alert not found' });
        res.json(alert);
    } catch (err) {
        next(err);
    }
});

// PUT /api/alerts/:id/resolve
router.put('/:id/resolve', auth, authorize('admin'), async (req, res, next) => {
    try {
        const alert = await Alert.findByIdAndUpdate(
            req.params.id,
            { status: 'resolved' },
            { new: true }
        );
        if (!alert) return res.status(404).json({ message: 'Alert not found' });
        res.json(alert);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
