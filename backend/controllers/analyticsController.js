const analyticsService = require('../services/analyticsService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 },
});

exports.upload = upload;

exports.getDashboardStats = async (req, res, next) => {
    try {
        const stats = await analyticsService.getDashboardStats();
        res.json(stats);
    } catch (error) {
        next(error);
    }
};

exports.getFuelConsumption = async (req, res, next) => {
    try {
        const data = await analyticsService.getFuelConsumptionData();
        res.json(data);
    } catch (error) {
        next(error);
    }
};

exports.getMaintenanceCost = async (req, res, next) => {
    try {
        const data = await analyticsService.getMaintenanceCostData();
        res.json(data);
    } catch (error) {
        next(error);
    }
};

exports.getCO2Emissions = async (req, res, next) => {
    try {
        const data = await analyticsService.getCO2EmissionsData();
        res.json(data);
    } catch (error) {
        next(error);
    }
};

exports.getDeliveryTime = async (req, res, next) => {
    try {
        const data = await analyticsService.getDeliveryTimeData();
        res.json(data);
    } catch (error) {
        next(error);
    }
};

exports.getTrafficImpact = async (req, res, next) => {
    try {
        const data = await analyticsService.getTrafficImpactData();
        res.json(data);
    } catch (error) {
        next(error);
    }
};

exports.getAdminFullAccessData = async (req, res, next) => {
    try {
        const data = await analyticsService.getAdminFullAccessData(req.query);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

exports.getAdminCsvOverview = async (req, res, next) => {
    try {
        const data = await analyticsService.getAdminCsvOverviewData();
        res.json(data);
    } catch (error) {
        next(error);
    }
};

exports.createAdminAnalyticsEntry = async (req, res, next) => {
    try {
        const entry = await analyticsService.createAnalyticsEntry(req.body);
        res.status(201).json({ message: 'Analytics entry created', data: entry });
    } catch (error) {
        next(error);
    }
};

exports.updateAdminAnalyticsEntry = async (req, res, next) => {
    try {
        const entry = await analyticsService.updateAnalyticsEntry(req.params.id, req.body);
        res.json({ message: 'Analytics entry updated', data: entry });
    } catch (error) {
        next(error);
    }
};

const toCsv = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
        return 'No data';
    }

    const headers = Array.from(
        rows.reduce((set, row) => {
            Object.keys(row || {}).forEach((k) => set.add(k));
            return set;
        }, new Set())
    );

    const escapeCell = (value) => {
        if (value === null || value === undefined) return '';
        const normalized = typeof value === 'object' ? JSON.stringify(value) : String(value);
        const escaped = normalized.replace(/"/g, '""');
        return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
    };

    const lines = [headers.join(',')];
    rows.forEach((row) => {
        lines.push(headers.map((header) => escapeCell(row[header])).join(','));
    });

    return lines.join('\n');
};

const toWordTable = (sectionTitle, rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
        return `<h2>${sectionTitle}</h2><p>No data available.</p>`;
    }

    const normalizedRows = rows.map((row) => {
        const normalized = {};
        Object.keys(row || {}).forEach((key) => {
            const value = row[key];
            normalized[key] = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
        });
        return normalized;
    });

    const headers = Array.from(
        normalizedRows.reduce((set, row) => {
            Object.keys(row).forEach((k) => set.add(k));
            return set;
        }, new Set())
    );

    const headerRow = `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
    const bodyRows = normalizedRows
        .map((row) => `<tr>${headers.map((h) => `<td>${row[h] || ''}</td>`).join('')}</tr>`)
        .join('');

    return `
        <h2>${sectionTitle}</h2>
        <table>
            <thead>${headerRow}</thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;
};

const buildTripReportRows = (trips = []) => {
    return trips.map((trip) => ({
        tripId: trip._id,
        truckId: trip.truckId?.truckId || 'N/A',
        truckPlate: trip.truckId?.licensePlate || 'N/A',
        driver: trip.driverId?.username || 'Unassigned',
        assistant: trip.assistantId?.username || 'Unassigned',
        source: trip.source,
        destination: trip.destination,
        travelledDistanceKm: Number(trip.distance || 0),
        tollCount: Number(trip.tollCount || 0),
        tollPrice: Number(trip.tollPrice || 0),
        tollTotalCost: Number(trip.tollTotalCost || 0),
        foodCost: Number(trip.foodCost || 0),
        estimatedFuelLiters: Number(trip.estimated?.fuelConsumed || trip.fuelConsumed || 0),
        estimatedDurationMin: Number(trip.estimated?.durationMinutes || trip.estimatedDurationMinutes || 0),
        estimatedTotalCost: Number(trip.estimated?.totalCost || trip.totalTripCost || 0),
        realtimeFuelLiters: Number(trip.realtime?.fuelConsumed || trip.actualFuelConsumed || 0),
        realtimeDurationMin: Number(trip.realtime?.durationMinutes || trip.actualDurationMinutes || 0),
        realtimeTotalCost: Number(trip.realtime?.totalCost || trip.actualTotalCost || 0),
        fuelCost: Number(trip.fuelCost || 0),
        totalCost: Number(trip.totalTripCost || trip.fuelCost || 0),
        tripStartedAt: trip.tripStartTime ? new Date(trip.tripStartTime).toISOString() : '',
        tripEndedAt: trip.tripEndTime ? new Date(trip.tripEndTime).toISOString() : '',
        status: trip.status || 'scheduled',
    }));
};

exports.downloadAdminReport = async (req, res, next) => {
    try {
        const format = (req.query.format || 'word').toLowerCase();
        const section = (req.query.section || 'summary').toLowerCase();
        const data = await analyticsService.getAdminFullAccessData(req.query);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        const sectionMap = {
            summary: data.summary,
            trucks: data.data?.trucks,
            drivers: data.data?.drivers,
            assistants: data.data?.assistants,
            trips: buildTripReportRows(data.data?.trips || []),
            'fuel-logs': data.data?.fuelLogs,
            maintenance: data.data?.maintenanceRecords,
            'delivery-status': data.data?.deliveryStatus,
            emergencies: data.data?.emergencyAlerts,
            analytics: data.data?.analyticsData,
        };

        if (format === 'word' || format === 'doc' || format === 'docx') {
            const reportData = section === 'all' ? data : (sectionMap[section] ?? data.summary);
            const rows = Array.isArray(reportData) ? reportData : [reportData];
            const content = `
                <html>
                <head>
                    <meta charset="utf-8" />
                    <style>
                        body { font-family: Calibri, Arial, sans-serif; font-size: 12px; }
                        h1 { color: #1f2937; }
                        h2 { margin-top: 20px; color: #334155; }
                        table { border-collapse: collapse; width: 100%; margin-top: 10px; }
                        th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; vertical-align: top; }
                        th { background: #f3f4f6; }
                    </style>
                </head>
                <body>
                    <h1>Admin ${section} Report</h1>
                    <p>Generated at: ${new Date().toLocaleString()}</p>
                    ${toWordTable(section, rows)}
                </body>
                </html>
            `;

            const fileName = `admin-${section}-report-${timestamp}.doc`;
            res.setHeader('Content-Type', 'application/msword');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            return res.send(content);
        }

        if (format === 'csv') {
            let rows = [];

            if (section === 'summary') rows = [data.summary || {}];
            if (section === 'trucks') rows = data.data?.trucks || [];
            if (section === 'drivers') rows = data.data?.drivers || [];
            if (section === 'assistants') rows = data.data?.assistants || [];
            if (section === 'trips') rows = data.data?.trips || [];
            if (section === 'fuel-logs') rows = data.data?.fuelLogs || [];
            if (section === 'maintenance') rows = data.data?.maintenanceRecords || [];
            if (section === 'delivery-status') rows = data.data?.deliveryStatus || [];
            if (section === 'emergencies') rows = data.data?.emergencyAlerts || [];

            const csv = toCsv(rows);
            const fileName = `admin-${section}-report-${timestamp}.csv`;

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            return res.send(csv);
        }

        const fileName = `admin-${section}-report-${timestamp}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        if (section === 'all') {
            return res.send(JSON.stringify(data, null, 2));
        }

        return res.send(JSON.stringify(sectionMap[section] ?? data.summary, null, 2));
    } catch (error) {
        next(error);
    }
};

exports.uploadCSV = async (req, res, next) => {
    try {
        if (!req.file?.path) {
            return res.status(400).json({ success: false, message: 'CSV file is required.' });
        }

        const parsedRows = await analyticsService.parseCSV(req.file.path);
        const inserted = await analyticsService.insertAnalyticsData(parsedRows);

        return res.json({
            success: true,
            message: 'Monthly CSV uploaded successfully.',
            inserted,
        });
    } catch (error) {
        next(error);
    } finally {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, () => {});
        }
    }
};
