const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const svc = require('../services/telemetryAnalyticsService');

const admin = authorize('admin', 'assistant');

// Fleet summary KPIs
router.get('/fleet-summary', auth, admin, async (req, res, next) => {
    try { res.json(await svc.getFleetSummary()); } catch (e) { next(e); }
});

// All trucks latest GPS positions (for live map)
router.get('/latest-positions', auth, admin, async (req, res, next) => {
    try { res.json(await svc.getLatestPositions()); } catch (e) { next(e); }
});

// GPS breadcrumb history for one truck
router.get('/gps-history', auth, admin, async (req, res, next) => {
    try {
        const { registrationNumber, from, to, limit } = req.query;
        if (!registrationNumber) return res.status(400).json({ message: 'registrationNumber required' });
        res.json(await svc.getGpsHistory({ registrationNumber, from, to, limit: parseInt(limit) || 2000 }));
    } catch (e) { next(e); }
});

// Trips list
router.get('/trips', auth, admin, async (req, res, next) => {
    try {
        const { registrationNumber, from, to, page, limit } = req.query;
        res.json(await svc.getTripList({ registrationNumber, from, to, page: parseInt(page) || 1, limit: parseInt(limit) || 50 }));
    } catch (e) { next(e); }
});

// Overspeed events
router.get('/overspeed', auth, admin, async (req, res, next) => {
    try {
        const { registrationNumber, from, to, threshold } = req.query;
        res.json(await svc.getOverspeedEvents({ registrationNumber, from, to, threshold: threshold ? parseInt(threshold) : undefined }));
    } catch (e) { next(e); }
});

// Overspeed ranking
router.get('/overspeed-ranking', auth, admin, async (req, res, next) => {
    try {
        const { from, to, threshold } = req.query;
        res.json(await svc.getOverspeedRanking({ from, to, threshold: threshold ? parseInt(threshold) : undefined }));
    } catch (e) { next(e); }
});

// Idle sessions
router.get('/idle-sessions', auth, admin, async (req, res, next) => {
    try {
        const { registrationNumber, from, to } = req.query;
        res.json(await svc.getIdleSessions({ registrationNumber, from, to }));
    } catch (e) { next(e); }
});

// Fuel efficiency ranking
router.get('/fuel-efficiency', auth, admin, async (req, res, next) => {
    try {
        const { from, to } = req.query;
        res.json(await svc.getFuelEfficiencyRanking({ from, to }));
    } catch (e) { next(e); }
});

// Fuel anomaly (theft detection)
router.get('/fuel-anomalies', auth, admin, async (req, res, next) => {
    try {
        const { from, to } = req.query;
        res.json(await svc.getFuelAnomalies({ from, to }));
    } catch (e) { next(e); }
});

// Engine and system health
router.get('/engine-health', auth, admin, async (req, res, next) => {
    try {
        const { registrationNumber } = req.query;
        res.json(await svc.getEngineHealth({ registrationNumber }));
    } catch (e) { next(e); }
});

// Speed trend chart for a truck
router.get('/speed-trend', auth, admin, async (req, res, next) => {
    try {
        const { registrationNumber, from, to, bucketMinutes } = req.query;
        if (!registrationNumber) return res.status(400).json({ message: 'registrationNumber required' });
        res.json(await svc.getSpeedTrend({ registrationNumber, from, to, bucketMinutes: parseInt(bucketMinutes) || 15 }));
    } catch (e) { next(e); }
});

// Monthly distance trend
router.get('/monthly-distance', auth, admin, async (req, res, next) => {
    try {
        const { registrationNumber } = req.query;
        res.json(await svc.getMonthlyDistanceTrend({ registrationNumber }));
    } catch (e) { next(e); }
});

// Air/Battery/DEF system params trend
router.get('/system-params', auth, admin, async (req, res, next) => {
    try {
        const { registrationNumber, from, to, bucketMinutes } = req.query;
        if (!registrationNumber) return res.status(400).json({ message: 'registrationNumber required' });
        res.json(await svc.getSystemParamsTrend({ registrationNumber, from, to, bucketMinutes: parseInt(bucketMinutes) || 30 }));
    } catch (e) { next(e); }
});

// Underused trucks
router.get('/underused-trucks', auth, admin, async (req, res, next) => {
    try {
        const { thresholdKm, days } = req.query;
        res.json(await svc.getUnderusedTrucks({ thresholdKm: parseInt(thresholdKm) || 50, days: parseInt(days) || 30 }));
    } catch (e) { next(e); }
});

// Manual alert sweep (admin only)
router.post('/run-alert-sweep', auth, authorize('admin'), async (req, res, next) => {
    try {
        const count = await svc.runAlertSweep();
        res.json({ message: `Alert sweep complete`, alertsUpserted: count });
    } catch (e) { next(e); }
});

module.exports = router;
