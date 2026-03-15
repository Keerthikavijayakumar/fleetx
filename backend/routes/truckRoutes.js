const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const truckController = require('../controllers/truckController');
const { auth, authorize } = require('../middleware/auth');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads/permits');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}-${safeName}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Only PDF, DOC, DOCX, and image files are allowed for permits'));
    },
});

const permitUpload = upload.fields([
    { name: 'stateTaxPermit', maxCount: 1 },
    { name: 'centralTaxPermit', maxCount: 1 },
]);

function attachPermitPaths(req) {
    const body = { ...req.body };
    if (req.files?.stateTaxPermit?.[0]) {
        body.stateTaxPermitPath = '/api/uploads/permits/' + req.files.stateTaxPermit[0].filename;
    }
    if (req.files?.centralTaxPermit?.[0]) {
        body.centralTaxPermitPath = '/api/uploads/permits/' + req.files.centralTaxPermit[0].filename;
    }
    return body;
}

module.exports = (io) => {
    router.use(auth);

    router.get('/', truckController.getAllTrucks);
    router.get('/rawdata', truckController.getRawData);
    router.get('/:id', truckController.getTruckById);

    // Create truck (with optional permit file uploads)
    router.post('/', permitUpload, async (req, res, next) => {
        try {
            const body = attachPermitPaths(req);
            const truck = await require('../services/fleetService').createTruck(body);
            io.emit('truckUpdate', [truck]);
            res.status(201).json({ message: 'Truck created successfully', truck });
        } catch (error) {
            next(error);
        }
    });

    // Update truck (with optional permit file re-uploads)
    router.put('/:id', permitUpload, async (req, res, next) => {
        try {
            const body = attachPermitPaths(req);
            const truck = await require('../services/fleetService').updateTruck(req.params.id, body);
            io.emit('truckUpdate', [truck]);
            res.json({ message: 'Truck updated successfully', truck });
        } catch (error) {
            next(error);
        }
    });

    router.delete('/:id', truckController.deleteTruck);

    // Admin: wipe all truck records
    router.delete('/', authorize('admin'), async (req, res, next) => {
        try {
            await require('../services/fleetService').clearAllTrucks();
            res.json({ message: 'All truck data cleared successfully' });
        } catch (error) {
            next(error);
        }
    });

    return router;
};
