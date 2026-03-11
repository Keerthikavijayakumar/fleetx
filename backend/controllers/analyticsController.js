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

exports.uploadCSV = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No CSV file uploaded' });
        }

        const data = await analyticsService.parseCSV(req.file.path);
        const type = req.body.type || 'trucks';

        if (type === 'trucks') {
            // Insert into MongoDB truck_analytics collection
            const count = await analyticsService.insertAnalyticsData(data);
            
            // Return updated chart data
            const result = {
                fuelConsumption: await analyticsService.getFuelConsumptionData(),
                co2Emissions: await analyticsService.getCO2EmissionsData(),
                deliveryTime: await analyticsService.getDeliveryTimeData(),
                maintenanceCost: await analyticsService.getMaintenanceCostData(),
            };
            res.json({ message: `CSV processed: ${count} records inserted into database`, data: result });
        } else {
            res.json({ message: 'CSV processed successfully', data: {} });
        }
    } catch (error) {
        next(error);
    }
};
