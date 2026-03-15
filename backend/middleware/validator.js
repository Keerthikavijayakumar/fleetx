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
    body('password').isLength({ min: 3 }).withMessage('Password must be at least 3 characters'),
    body('role').optional().isIn(['admin', 'driver', 'assistant']).withMessage('Role must be admin, driver, or assistant'),
    handleValidationErrors,
];

const validateLogin = [
    // Accept email or phone number — just require the field is non-empty
    body('emailOrPhone').optional().trim().notEmpty().withMessage('Email or phone is required'),
    body('email').optional().trim(),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidationErrors,
];

const validateTruck = [
    body('truckId').trim().notEmpty().withMessage('Truck ID is required'),
    body('licensePlate').trim().notEmpty().withMessage('License plate is required'),
    body('registrationDate').notEmpty().withMessage('Registration date is required'),
    body('fuelEfficiency').optional().isFloat({ min: 0.1 }).withMessage('Fuel efficiency must be positive'),
    body('mileage').optional().isFloat({ min: 0.1 }).withMessage('Mileage must be positive'),
    body('tankCapacity').isFloat({ min: 1 }).withMessage('Tank capacity must be at least 1'),
    body('costPerLitre').isFloat({ min: 0.01 }).withMessage('Cost per litre must be positive'),
    handleValidationErrors,
];

const validateRoute = [
    body('source').trim().notEmpty().withMessage('Source is required'),
    body('destination').trim().notEmpty().withMessage('Destination is required'),
    body('tollCount').optional().isFloat({ min: 0 }).withMessage('Toll count must be non-negative'),
    body('tollPrice').optional().isFloat({ min: 0 }).withMessage('Toll price must be non-negative'),
    body('foodCost').optional().isFloat({ min: 0 }).withMessage('Food cost must be non-negative'),
    body('tripStartTime').optional().isISO8601().withMessage('Trip start time must be a valid date-time'),
    body('tripEndTime').optional().isISO8601().withMessage('Trip end time must be a valid date-time'),
    body('actualDurationMinutes').optional().isFloat({ min: 0 }).withMessage('Actual duration must be non-negative'),
    body('actualFuelConsumed').optional().isFloat({ min: 0 }).withMessage('Actual fuel consumed must be non-negative'),
    body('actualFuelCost').optional().isFloat({ min: 0 }).withMessage('Actual fuel cost must be non-negative'),
    body('actualTollCost').optional().isFloat({ min: 0 }).withMessage('Actual toll cost must be non-negative'),
    body('actualFoodCost').optional().isFloat({ min: 0 }).withMessage('Actual food cost must be non-negative'),
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
