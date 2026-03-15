const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { runIAlertCsvSync, getSyncStatus, getSyncHistory, getSourceRoot } = require('../services/ialertCsvIngestionService');

const ROOT_CSV_NAME = 'FleetX_root_monthly_report.csv';

const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, getSourceRoot());
    },
    filename: (req, file, cb) => {
        cb(null, ROOT_CSV_NAME);
    },
});

const upload = multer({
    storage: uploadStorage,
    fileFilter: (req, file, cb) => {
        const ok = file.mimetype === 'text/csv' || String(file.originalname || '').toLowerCase().endsWith('.csv');
        if (!ok) return cb(new Error('Only CSV files are allowed'));
        cb(null, true);
    },
    limits: { fileSize: 25 * 1024 * 1024 },
});

exports.upload = upload;

exports.runNow = async (req, res, next) => {
    try {
        const result = await runIAlertCsvSync({ reason: `manual:${req.user?.username || 'admin'}` });
        res.json({ message: 'iAlert file sync run completed.', result });
    } catch (error) {
        next(error);
    }
};

exports.getStatus = async (req, res, next) => {
    try {
        const status = await getSyncStatus();
        res.json(status);
    } catch (error) {
        next(error);
    }
};

exports.getHistory = async (req, res, next) => {
    try {
        const history = await getSyncHistory(req.query.limit);
        res.json(history);
    } catch (error) {
        next(error);
    }
};

exports.uploadRootCsvAndSync = async (req, res, next) => {
    try {
        if (!req.file?.path) {
            return res.status(400).json({ message: 'CSV file is required.' });
        }

        const fullPath = path.resolve(req.file.path);
        if (!fs.existsSync(fullPath)) {
            return res.status(500).json({ message: 'Uploaded CSV was not found on disk.' });
        }

        const result = await runIAlertCsvSync({
            reason: `upload:${req.user?.username || 'admin'}`,
            forceFullSync: true,
            explicitFiles: [fullPath],
            originalFileName: req.file.originalname || '',
        });

        return res.json({
            message: 'Root CSV uploaded and sync completed.',
            sourceFile: ROOT_CSV_NAME,
            result,
        });
    } catch (error) {
        next(error);
    }
};
