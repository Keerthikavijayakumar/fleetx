const Maintenance = require('../models/Maintenance');
const Truck = require('../models/Truck');

class MaintenanceService {
    async getAllRecords() {
        return Maintenance.find().populate('truckId').sort({ createdAt: -1 });
    }

    async getRecordById(id) {
        const record = await Maintenance.findById(id).populate('truckId');
        if (!record) throw Object.assign(new Error('Maintenance record not found'), { status: 404 });
        return record;
    }

    async createRecord(data) {
        const record = new Maintenance(data);
        await record.save();

        if (data.status === 'completed') {
            const truck = await Truck.findById(data.truckId);
            if (truck) {
                truck.lastServiceDate = Date.now();
                truck.lastServiceDistance = truck.totalDistance || 0;
                await truck.save();
            }
        }

        return record;
    }

    async updateRecord(id, data) {
        const record = await Maintenance.findByIdAndUpdate(id, data, { new: true, runValidators: true });
        if (!record) throw Object.assign(new Error('Maintenance record not found'), { status: 404 });

        if (data.status === 'completed') {
            const truck = await Truck.findById(record.truckId);
            if (truck) {
                truck.lastServiceDate = Date.now();
                truck.lastServiceDistance = truck.totalDistance || 0;
                await truck.save();
            }
        }

        return record;
    }

    async deleteRecord(id) {
        const record = await Maintenance.findByIdAndDelete(id);
        if (!record) throw Object.assign(new Error('Maintenance record not found'), { status: 404 });
        return record;
    }

    async getOverdueRecords() {
        return Maintenance.find({
            nextServiceDue: { $lt: new Date() },
            status: { $ne: 'completed' },
        }).populate('truckId');
    }

    async getRecordsByTruck(truckId) {
        return Maintenance.find({ truckId }).populate('truckId').sort({ createdAt: -1 });
    }

    async getUpcomingMaintenance(days = 7) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);
        return Maintenance.find({
            nextServiceDue: { $lte: futureDate, $gte: new Date() },
            status: { $ne: 'completed' },
        }).populate('truckId');
    }
}

module.exports = new MaintenanceService();
