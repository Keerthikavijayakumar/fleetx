const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: 'Validation failed',
            errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
    }
    next();
};

const validateRegister = [
    body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['admin', 'manager', 'driver']).withMessage('Role must be admin, manager, or driver'),
    handleValidationErrors,
];

const validateLogin = [
    body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidationErrors,
];

const validateTruck = [
    body('truckId').trim().notEmpty().withMessage('Truck ID is required'),
    body('licensePlate').trim().notEmpty().withMessage('License plate is required'),
    body('driverName').trim().notEmpty().withMessage('Driver name is required'),
    body('fuelEfficiency').isFloat({ min: 0.1 }).withMessage('Fuel efficiency must be positive'),
    body('tankCapacity').isFloat({ min: 1 }).withMessage('Tank capacity must be at least 1'),
    body('costPerLitre').isFloat({ min: 0.01 }).withMessage('Cost per litre must be positive'),
    body('emissionFactor').isFloat({ min: 0 }).withMessage('Emission factor must be non-negative'),
    handleValidationErrors,
];

const validateRoute = [
    body('source').trim().notEmpty().withMessage('Source is required'),
    body('destination').trim().notEmpty().withMessage('Destination is required'),
    handleValidationErrors,
];

const validateMaintenance = [
    body('truckId').notEmpty().withMessage('Truck ID is required'),
    body('serviceType').trim().notEmpty().withMessage('Service type is required'),
    body('lastServiceDate').isISO8601().withMessage('Valid last service date is required'),
    body('nextServiceDue').isISO8601().withMessage('Valid next service due date is required'),
    body('odometer').isFloat({ min: 0 }).withMessage('Odometer must be non-negative'),
    handleValidationErrors,
];

module.exports = { validateRegister, validateLogin, validateTruck, validateRoute, validateMaintenance };
