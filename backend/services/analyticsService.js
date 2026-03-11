const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const TruckAnalytics = require('../models/TruckAnalytics');

class AnalyticsService {
    parseCSV(filePath) {
        return new Promise((resolve, reject) => {
            const results = [];
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', () => resolve(results))
                .on('error', (err) => reject(err));
        });
    }

    async insertAnalyticsData(data) {
        const docs = data.map(row => ({
            date: new Date(row.date),
            truckId: row.truck_id || row.truckId || '',
            distanceKm: parseFloat(row.distance_km || 0),
            fuelUsedLiters: parseFloat(row.fuel_used_liters || 0),
            costRs: parseFloat(row.cost_rs || 0),
            co2Kg: parseFloat(row.co2_kg || 0),
            deliveryTimeMin: parseFloat(row.delivery_time_min || 0),
        }));
        await TruckAnalytics.insertMany(docs);
        return docs.length;
    }

    async getFuelConsumptionData(data = null) {
        if (!data) {
            // Try MongoDB first
            const dbData = await TruckAnalytics.find().sort({ date: 1 }).lean();
            if (dbData.length > 0) {
                const monthlyFuel = {};
                dbData.forEach(row => {
                    const month = row.date.toISOString().substring(0, 7);
                    if (!monthlyFuel[month]) monthlyFuel[month] = 0;
                    monthlyFuel[month] += row.fuelUsedLiters;
                });
                return Object.entries(monthlyFuel).map(([month, total]) => ({
                    month, fuelConsumed: parseFloat(total.toFixed(2)),
                }));
            }
            // Fallback to CSV
            const filePath = path.join(__dirname, '..', 'data', 'trucks_data.csv');
            if (fs.existsSync(filePath)) {
                data = await this.parseCSV(filePath);
            } else {
                data = this.generateSampleFuelData();
            }
        }

        const monthlyFuel = {};
        data.forEach((row) => {
            const month = row.date ? row.date.substring(0, 7) : 'Unknown';
            if (!monthlyFuel[month]) monthlyFuel[month] = 0;
            monthlyFuel[month] += parseFloat(row.fuel_used_liters || row.fuelUsedLiters || 0);
        });

        return Object.entries(monthlyFuel).map(([month, total]) => ({
            month, fuelConsumed: parseFloat(total.toFixed(2)),
        }));
    }

    async getMaintenanceCostData(data = null) {
        if (!data) {
            const dbData = await TruckAnalytics.find().sort({ date: 1 }).lean();
            if (dbData.length > 0) {
                const monthlyCost = {};
                dbData.forEach(row => {
                    const month = row.date.toISOString().substring(0, 7);
                    if (!monthlyCost[month]) monthlyCost[month] = 0;
                    monthlyCost[month] += row.costRs;
                });
                return Object.entries(monthlyCost).map(([month, cost]) => ({
                    month, cost: parseFloat(cost.toFixed(2)),
                }));
            }
            data = this.generateSampleMaintenanceData();
        }

        const monthlyCost = {};
        data.forEach((row) => {
            const month = row.date ? row.date.substring(0, 7) : row.month || 'Unknown';
            if (!monthlyCost[month]) monthlyCost[month] = 0;
            monthlyCost[month] += parseFloat(row.cost_rs || row.cost || 0);
        });

        return Object.entries(monthlyCost).map(([month, cost]) => ({
            month, cost: parseFloat(cost.toFixed(2)),
        }));
    }

    async getCO2EmissionsData(data = null) {
        if (!data) {
            const dbData = await TruckAnalytics.find().sort({ date: 1 }).lean();
            if (dbData.length > 0) {
                const monthlyCO2 = {};
                dbData.forEach(row => {
                    const month = row.date.toISOString().substring(0, 7);
                    if (!monthlyCO2[month]) monthlyCO2[month] = 0;
                    monthlyCO2[month] += row.co2Kg;
                });
                return Object.entries(monthlyCO2).map(([month, co2]) => ({
                    month, co2: parseFloat(co2.toFixed(2)),
                }));
            }
            const filePath = path.join(__dirname, '..', 'data', 'trucks_data.csv');
            if (fs.existsSync(filePath)) {
                data = await this.parseCSV(filePath);
            } else {
                data = this.generateSampleFuelData();
            }
        }

        const monthlyCO2 = {};
        data.forEach((row) => {
            const month = row.date ? row.date.substring(0, 7) : 'Unknown';
            if (!monthlyCO2[month]) monthlyCO2[month] = 0;
            monthlyCO2[month] += parseFloat(row.co2_kg || row.co2Kg || 0);
        });

        return Object.entries(monthlyCO2).map(([month, co2]) => ({
            month, co2: parseFloat(co2.toFixed(2)),
        }));
    }

    async getDeliveryTimeData(data = null) {
        if (!data) {
            const dbData = await TruckAnalytics.find().sort({ date: 1 }).lean();
            if (dbData.length > 0) {
                const monthlyTime = {};
                const monthlyCount = {};
                dbData.forEach(row => {
                    const month = row.date.toISOString().substring(0, 7);
                    if (!monthlyTime[month]) { monthlyTime[month] = 0; monthlyCount[month] = 0; }
                    monthlyTime[month] += row.deliveryTimeMin;
                    monthlyCount[month] += 1;
                });
                return Object.entries(monthlyTime).map(([month, total]) => ({
                    month, avgDeliveryTime: parseFloat((total / (monthlyCount[month] || 1)).toFixed(2)),
                }));
            }
            const filePath = path.join(__dirname, '..', 'data', 'trucks_data.csv');
            if (fs.existsSync(filePath)) {
                data = await this.parseCSV(filePath);
            } else {
                data = this.generateSampleFuelData();
            }
        }

        const monthlyTime = {};
        const monthlyCount = {};
        data.forEach((row) => {
            const month = row.date ? row.date.substring(0, 7) : 'Unknown';
            if (!monthlyTime[month]) { monthlyTime[month] = 0; monthlyCount[month] = 0; }
            monthlyTime[month] += parseFloat(row.delivery_time_min || row.deliveryTimeMin || 0);
            monthlyCount[month] += 1;
        });

        return Object.entries(monthlyTime).map(([month, total]) => ({
            month, avgDeliveryTime: parseFloat((total / (monthlyCount[month] || 1)).toFixed(2)),
        }));
    }

    async getTrafficImpactData() {
        // Dynamic traffic — returns sample distribution
        // Real traffic is computed per-route in RoutePlanner via Directions API
        return [
            { name: 'Low', value: 45 },
            { name: 'Medium', value: 35 },
            { name: 'High', value: 20 },
        ];
    }

    async getDashboardStats() {
        const Truck = require('../models/Truck');
        const Route = require('../models/Route');
        const Maintenance = require('../models/Maintenance');

        const [totalTrucks, activeTrucks, totalRoutes, overdueCount] = await Promise.all([
            Truck.countDocuments(),
            Truck.countDocuments({ status: 'active' }),
            Route.countDocuments(),
            Maintenance.countDocuments({ nextServiceDue: { $lt: new Date() }, status: { $ne: 'completed' } }),
        ]);

        return { totalTrucks, activeTrucks, totalRoutes, maintenanceAlerts: overdueCount };
    }

    generateSampleFuelData() {
        const data = [];
        for (let i = 0; i < 50; i++) {
            data.push({
                date: `2024-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
                fuel_used_liters: (Math.random() * 100 + 20).toFixed(2),
                co2_kg: (Math.random() * 250 + 50).toFixed(2),
                delivery_time_min: (Math.random() * 300 + 60).toFixed(0),
                cost_rs: (Math.random() * 10000 + 2000).toFixed(2),
            });
        }
        return data;
    }

    generateSampleMaintenanceData() {
        const data = [];
        const months = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06',
            '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12'];
        months.forEach((month) => {
            data.push({ month, cost: (Math.random() * 50000 + 10000).toFixed(2) });
        });
        return data;
    }
}

module.exports = new AnalyticsService();
