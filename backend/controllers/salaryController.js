const Salary = require('../models/Salary');
const Route = require('../models/Route');

exports.assignSalary = async (req, res, next) => {
    try {
        const { tripId, totalAmountReceived, salaryDate, notes } = req.body;

        if (!tripId || totalAmountReceived === undefined) {
            return res.status(400).json({ message: 'tripId and totalAmountReceived are required' });
        }

        // Fetch trip to get driver and assistant
        const trip = await Route.findById(tripId).populate('driverId assistantId');
        if (!trip) {
            return res.status(404).json({ message: 'Trip not found' });
        }

        if (!trip.driverId || !trip.assistantId) {
            return res.status(400).json({ 
                message: 'Salary can only be assigned to trips with both a driver and an assistant assigned.' 
            });
        }

        // Calculate shares
        const driverShare = (totalAmountReceived * 15) / 100; // 15% for driver
        const assistantShare = (driverShare * 4) / 100; // 4% of driver's share for assistant

        const salary = new Salary({
            tripId,
            driverId: trip.driverId?._id || null,
            assistantId: trip.assistantId?._id || null,
            totalAmountReceived: Number(totalAmountReceived),
            driverShare: Number(driverShare.toFixed(2)),
            assistantShare: Number(assistantShare.toFixed(2)),
            salaryDate: salaryDate ? new Date(salaryDate) : new Date(),
            notes: notes || '',
        });

        await salary.save();

        // Populate references for response
        await salary.populate([
            { path: 'tripId', populate: { path: 'truckId' } },
            { path: 'driverId' },
            { path: 'assistantId' }
        ]);

        res.status(201).json({
            message: 'Salary assigned successfully',
            salary,
        });
    } catch (err) {
        next(err);
    }
};

exports.getSalaries = async (req, res, next) => {
    try {
        const { tripId, driverId, assistantId, from, to, page = 1, limit = 50 } = req.query;
        const filter = {};

        if (tripId) filter.tripId = tripId;
        if (driverId) filter.driverId = driverId;
        if (assistantId) filter.assistantId = assistantId;
        if (from || to) {
            filter.salaryDate = {};
            if (from) filter.salaryDate.$gte = new Date(from);
            if (to) filter.salaryDate.$lte = new Date(to);
        }

        const salaries = await Salary.find(filter)
            .populate([
                { path: 'tripId', populate: { path: 'truckId' } },
                { path: 'driverId' },
                { path: 'assistantId' }
            ])
            .sort({ salaryDate: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .lean();

        const total = await Salary.countDocuments(filter);

        res.json({
            salaries,
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
        });
    } catch (err) {
        next(err);
    }
};

exports.getSalaryById = async (req, res, next) => {
    try {
        const salary = await Salary.findById(req.params.id).populate('tripId driverId assistantId');
        if (!salary) {
            return res.status(404).json({ message: 'Salary record not found' });
        }
        res.json(salary);
    } catch (err) {
        next(err);
    }
};

exports.updateSalary = async (req, res, next) => {
    try {
        const { totalAmountReceived, salaryDate, notes } = req.body;
        const salary = await Salary.findById(req.params.id);

        if (!salary) {
            return res.status(404).json({ message: 'Salary record not found' });
        }

        if (totalAmountReceived !== undefined) {
            salary.totalAmountReceived = Number(totalAmountReceived);
            // Recalculate shares
            salary.driverShare = Number(((totalAmountReceived * 15) / 100).toFixed(2));
            salary.assistantShare = Number((salary.driverShare * 0.04).toFixed(2));
        }

        if (salaryDate) salary.salaryDate = new Date(salaryDate);
        if (notes !== undefined) salary.notes = notes;

        await salary.save();
        await salary.populate([
            { path: 'tripId', populate: { path: 'truckId' } },
            { path: 'driverId' },
            { path: 'assistantId' }
        ]);

        res.json({
            message: 'Salary updated successfully',
            salary,
        });
    } catch (err) {
        next(err);
    }
};

exports.deleteSalary = async (req, res, next) => {
    try {
        const salary = await Salary.findByIdAndDelete(req.params.id);
        if (!salary) {
            return res.status(404).json({ message: 'Salary record not found' });
        }
        res.json({ message: 'Salary deleted successfully' });
    } catch (err) {
        next(err);
    }
};
