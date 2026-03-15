const fleetService = require('../services/fleetService');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const TRUCK_FILES = [
    'RawData_TN29CA1787_2026-01-01_To_2026-03-15.xlsx',
    'RawData_TN29CD4797_2026-01-01_To_2026-03-15.xlsx',
    'RawData_TN29CF1787_2026-01-01_To_2026-03-15.xlsx',
    'RawData_TN29CH1787_2026-01-01_To_2026-03-15.xlsx',
    'RawData_TN29CH2959_2026-01-01_To_2026-03-15.xlsx',
    'RawData_TN29CW5375_2026-01-01_To_2026-03-15.xlsx',
];

exports.getAllTrucks = async (req, res, next) => {
    try {
        const trucks = await fleetService.getAllTrucks();
        res.json(trucks);
    } catch (error) {
        next(error);
    }
};

exports.getTruckById = async (req, res, next) => {
    try {
        const truck = await fleetService.getTruckById(req.params.id);
        res.json(truck);
    } catch (error) {
        next(error);
    }
};

exports.createTruck = async (req, res, next) => {
    try {
        const truck = await fleetService.createTruck(req.body);
        res.status(201).json({ message: 'Truck created successfully', truck });
    } catch (error) {
        next(error);
    }
};

exports.updateTruck = async (req, res, next) => {
    try {
        const truck = await fleetService.updateTruck(req.params.id, req.body);
        res.json({ message: 'Truck updated successfully', truck });
    } catch (error) {
        next(error);
    }
};

exports.deleteTruck = async (req, res, next) => {
    try {
        await fleetService.deleteTruck(req.params.id);
        res.json({ message: 'Truck deleted successfully' });
    } catch (error) {
        next(error);
    }
};

exports.assignDriver = async (req, res, next) => {
    try {
        const truck = await fleetService.assignDriver(req.params.id, req.body.driverName);
        res.json({ message: 'Driver assigned successfully', truck });
    } catch (error) {
        next(error);
    }
};

exports.getRawData = (req, res) => {
    try {
        const allData = [];

        TRUCK_FILES.forEach((filename) => {
            const filePath = path.join(__dirname, '../../', filename);
            if (!fs.existsSync(filePath)) return;

            const workbook = xlsx.readFile(filePath);
            const firstSheetName = workbook.SheetNames[0];
            if (!firstSheetName) return;

            const sheet = workbook.Sheets[firstSheetName];
            const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
            const truckId = filename.split('_')[1] || 'UNKNOWN';

            rows.forEach((row) => {
                allData.push({ ...row, truck_id: truckId });
            });
        });

        res.json({ success: true, data: allData });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
