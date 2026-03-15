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

    async createAnalyticsEntry(payload) {
        const entry = new TruckAnalytics({
            date: payload.date ? new Date(payload.date) : new Date(),
            truckId: payload.truckId,
            distanceKm: parseFloat(payload.distanceKm || 0),
            fuelUsedLiters: parseFloat(payload.fuelUsedLiters || 0),
            costRs: parseFloat(payload.costRs || 0),
            co2Kg: parseFloat(payload.co2Kg || 0),
            deliveryTimeMin: parseFloat(payload.deliveryTimeMin || 0),
        });

        return entry.save();
    }

    async updateAnalyticsEntry(id, payload) {
        const update = {};
        if (payload.date) update.date = new Date(payload.date);
        if (payload.truckId !== undefined) update.truckId = payload.truckId;
        if (payload.distanceKm !== undefined) update.distanceKm = parseFloat(payload.distanceKm || 0);
        if (payload.fuelUsedLiters !== undefined) update.fuelUsedLiters = parseFloat(payload.fuelUsedLiters || 0);
        if (payload.costRs !== undefined) update.costRs = parseFloat(payload.costRs || 0);
        if (payload.co2Kg !== undefined) update.co2Kg = parseFloat(payload.co2Kg || 0);
        if (payload.deliveryTimeMin !== undefined) update.deliveryTimeMin = parseFloat(payload.deliveryTimeMin || 0);

        const entry = await TruckAnalytics.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
        });

        if (!entry) throw Object.assign(new Error('Analytics entry not found'), { status: 404 });
        return entry;
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

    async getAdminFullAccessData(filters = {}) {
        const Truck = require('../models/Truck');
        const Route = require('../models/Route');
        const Maintenance = require('../models/Maintenance');
        const User = require('../models/User');
        const Emergency = require('../models/Emergency');

        const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 200, 10), 500);
        const search = (filters.search || '').trim();
        const truckStatus = (filters.truckStatus || '').trim();
        const emergencyStatus = (filters.emergencyStatus || '').trim();
        const tripStatus = (filters.tripStatus || '').trim();

        const truckQuery = {};
        if (truckStatus) truckQuery.status = truckStatus;
        if (search) {
            truckQuery.$or = [
                { truckId: { $regex: search, $options: 'i' } },
                { licensePlate: { $regex: search, $options: 'i' } },
                { driverName: { $regex: search, $options: 'i' } },
            ];
        }

        const emergencyQuery = {};
        if (emergencyStatus) emergencyQuery.status = emergencyStatus;
        if (search) {
            emergencyQuery.$or = [
                { truckId: { $regex: search, $options: 'i' } },
                { driverId: { $regex: search, $options: 'i' } },
                { message: { $regex: search, $options: 'i' } },
            ];
        }

        const userSearchQuery = search
            ? {
                $or: [
                    { username: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                ],
            }
            : {};

        const routeSearchQuery = search
            ? {
                $or: [
                    { source: { $regex: search, $options: 'i' } },
                    { destination: { $regex: search, $options: 'i' } },
                ],
            }
            : {};

        const maintenanceSearchQuery = search
            ? {
                $or: [
                    { serviceType: { $regex: search, $options: 'i' } },
                    { notes: { $regex: search, $options: 'i' } },
                ],
            }
            : {};

        const [
            trucks,
            drivers,
            assistants,
            trips,
            fuelLogs,
            maintenanceRecords,
            emergencyAlerts,
            totalTrucks,
            activeTrucks,
            trucksInMaintenance,
            totalDrivers,
            totalAssistants,
            activeEmergencyAlerts,
            allRoutesForDelivery,
        ] = await Promise.all([
            Truck.find(truckQuery).sort({ updatedAt: -1 }).limit(limit).lean(),
            User.find({ role: 'driver', ...userSearchQuery }).select('-password').sort({ createdAt: -1 }).limit(limit).lean(),
            User.find({ role: 'assistant', ...userSearchQuery }).select('-password').sort({ createdAt: -1 }).limit(limit).lean(),
            Route.find(routeSearchQuery)
                .populate('truckId')
                .populate('driverId', 'username email role')
                .populate('assistantId', 'username email role')
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean(),
            TruckAnalytics.find(search ? { truckId: { $regex: search, $options: 'i' } } : {})
                .sort({ date: -1 })
                .limit(limit)
                .lean(),
            Maintenance.find(maintenanceSearchQuery).populate('truckId').sort({ createdAt: -1 }).limit(limit).lean(),
            Emergency.find(emergencyQuery).sort({ timestamp: -1 }).limit(limit).lean(),
            Truck.countDocuments(),
            Truck.countDocuments({ status: 'active' }),
            Truck.countDocuments({ status: 'maintenance' }),
            User.countDocuments({ role: 'driver' }),
            User.countDocuments({ role: 'assistant' }),
            Emergency.countDocuments({ status: 'active' }),
            Route.find()
                .populate('truckId')
                .populate('driverId', 'username email role')
                .populate('assistantId', 'username email role')
                .lean(),
        ]);

        const [truckDistanceAgg, analyticsDistanceAgg, analyticsFuelAgg] = await Promise.all([
            Truck.aggregate([{ $group: { _id: null, total: { $sum: '$totalDistance' } } }]),
            TruckAnalytics.aggregate([{ $group: { _id: null, total: { $sum: '$distanceKm' } } }]),
            TruckAnalytics.aggregate([{ $group: { _id: null, total: { $sum: '$fuelUsedLiters' } } }]),
        ]);

        const routeFuelConsumed = trips.reduce((sum, route) => sum + Number(route.fuelConsumed || 0), 0);
        const totalDistanceTravelled = Number(analyticsDistanceAgg[0]?.total || truckDistanceAgg[0]?.total || 0);
        const totalFuelConsumed = Number(analyticsFuelAgg[0]?.total || routeFuelConsumed || 0);

        const deliveryStatus = allRoutesForDelivery.reduce((acc, route) => {
            let status = route.status;

            if (!status) {
                if (route.truckId?.status === 'maintenance') {
                    status = 'delayed';
                } else if (route.truckId) {
                    status = 'in_transit';
                } else {
                    status = 'scheduled';
                }
            }

            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});

        const deliveryStatusRows = Object.entries(deliveryStatus).map(([status, count]) => ({ status, count }));
        const filteredDeliveryStatus = tripStatus
            ? deliveryStatusRows.filter((row) => row.status === tripStatus)
            : deliveryStatusRows;

        const analyticsData = {
            fuelConsumption: await this.getFuelConsumptionData(),
            maintenanceCost: await this.getMaintenanceCostData(),
            co2Emissions: await this.getCO2EmissionsData(),
            deliveryTime: await this.getDeliveryTimeData(),
            trafficImpact: await this.getTrafficImpactData(),
        };

        return {
            summary: {
                totalTrucks,
                activeTrucks,
                trucksInMaintenance,
                totalDrivers,
                totalAssistants,
                totalTrips: allRoutesForDelivery.length,
                totalDistanceTravelled: Number(totalDistanceTravelled.toFixed(2)),
                totalFuelConsumed: Number(totalFuelConsumed.toFixed(2)),
                activeEmergencyAlerts,
            },
            filters: {
                search,
                truckStatus,
                emergencyStatus,
                tripStatus,
                limit,
            },
            data: {
                trucks,
                drivers,
                assistants,
                trips,
                fuelLogs,
                maintenanceRecords,
                deliveryStatus: filteredDeliveryStatus,
                analyticsData,
                emergencyAlerts,
            },
        };
    }

    async getAdminCsvOverviewData() {
        const filePath = path.join(__dirname, '..', 'data', 'trucks_data.csv');
        if (!fs.existsSync(filePath)) {
            const err = new Error('CSV data file not found');
            err.status = 404;
            throw err;
        }

        const rawRows = await this.parseCSV(filePath);
        const normalizedRows = rawRows
            .map((row) => {
                const date = row.date ? new Date(row.date) : null;
                const truckId = String(row.truck_id || row.truckId || '').trim();
                return {
                    date,
                    truckId,
                    distanceKm: Number(row.distance_km || row.distanceKm || 0),
                    fuelUsedLiters: Number(row.fuel_used_liters || row.fuelUsedLiters || 0),
                    costRs: Number(row.cost_rs || row.costRs || 0),
                    co2Kg: Number(row.co2_kg || row.co2Kg || 0),
                    deliveryTimeMin: Number(row.delivery_time_min || row.deliveryTimeMin || 0),
                };
            })
            .filter((row) => row.date instanceof Date && !Number.isNaN(row.date.getTime()) && row.truckId);

        if (normalizedRows.length === 0) {
            return {
                summary: {
                    totalTrucks: 0,
                    activeTrucks: 0,
                    maintenanceDueTrucks: 0,
                    totalTrips: 0,
                    totalDistanceKm: 0,
                    totalFuelUsedLiters: 0,
                    totalCostRs: 0,
                    uniqueTravelDays: 0,
                    latestDataDate: null,
                },
                dailyAnalysis: [],
                monthlyAnalysis: [],
                placesTravelled: [],
                liveTracking: [],
                maintenanceDueList: [],
                rules: {
                    activeWindowDays: 30,
                    maintenanceIntervalDays: 60,
                },
            };
        }

        normalizedRows.sort((a, b) => a.date - b.date);
        const latestDataDate = normalizedRows[normalizedRows.length - 1].date;

        const dailyMap = new Map();
        const monthlyMap = new Map();
        const truckMap = new Map();

        normalizedRows.forEach((row) => {
            const dayKey = row.date.toISOString().slice(0, 10);
            const monthKey = dayKey.slice(0, 7);

            if (!dailyMap.has(dayKey)) {
                dailyMap.set(dayKey, {
                    date: dayKey,
                    totalDistanceKm: 0,
                    totalFuelUsedLiters: 0,
                    totalCostRs: 0,
                    avgDeliveryTimeMin: 0,
                    trips: 0,
                    _deliveryCount: 0,
                    _trucks: new Set(),
                });
            }
            const daily = dailyMap.get(dayKey);
            daily.totalDistanceKm += row.distanceKm;
            daily.totalFuelUsedLiters += row.fuelUsedLiters;
            daily.totalCostRs += row.costRs;
            daily.avgDeliveryTimeMin += row.deliveryTimeMin;
            daily.trips += 1;
            daily._deliveryCount += row.deliveryTimeMin > 0 ? 1 : 0;
            daily._trucks.add(row.truckId);

            if (!monthlyMap.has(monthKey)) {
                monthlyMap.set(monthKey, {
                    month: monthKey,
                    totalDistanceKm: 0,
                    totalFuelUsedLiters: 0,
                    totalCostRs: 0,
                    avgDeliveryTimeMin: 0,
                    trips: 0,
                    _deliveryCount: 0,
                    _trucks: new Set(),
                });
            }
            const monthly = monthlyMap.get(monthKey);
            monthly.totalDistanceKm += row.distanceKm;
            monthly.totalFuelUsedLiters += row.fuelUsedLiters;
            monthly.totalCostRs += row.costRs;
            monthly.avgDeliveryTimeMin += row.deliveryTimeMin;
            monthly.trips += 1;
            monthly._deliveryCount += row.deliveryTimeMin > 0 ? 1 : 0;
            monthly._trucks.add(row.truckId);

            if (!truckMap.has(row.truckId)) {
                truckMap.set(row.truckId, {
                    truckId: row.truckId,
                    totalDistanceKm: 0,
                    totalFuelUsedLiters: 0,
                    totalCostRs: 0,
                    totalTrips: 0,
                    lastTripDate: row.date,
                });
            }
            const truck = truckMap.get(row.truckId);
            truck.totalDistanceKm += row.distanceKm;
            truck.totalFuelUsedLiters += row.fuelUsedLiters;
            truck.totalCostRs += row.costRs;
            truck.totalTrips += 1;
            if (row.date > truck.lastTripDate) truck.lastTripDate = row.date;
        });

        const toRounded = (num) => Number((num || 0).toFixed(2));
        const oneDayMs = 24 * 60 * 60 * 1000;
        const activeWindowDays = 30;
        const maintenanceIntervalDays = 60;

        const trucks = Array.from(truckMap.values());
        const activeTrucks = trucks.filter((truck) => {
            const daysSinceLastTrip = Math.floor((latestDataDate - truck.lastTripDate) / oneDayMs);
            return daysSinceLastTrip <= activeWindowDays;
        });

        const maintenanceDueList = trucks
            .map((truck) => {
                const dueDate = new Date(truck.lastTripDate.getTime() + (maintenanceIntervalDays * oneDayMs));
                const overdueDays = Math.max(0, Math.floor((latestDataDate - dueDate) / oneDayMs));
                return {
                    truckId: truck.truckId,
                    lastTripDate: truck.lastTripDate.toISOString(),
                    serviceDueDate: dueDate.toISOString(),
                    overdueDays,
                    totalDistanceKm: toRounded(truck.totalDistanceKm),
                    totalTrips: truck.totalTrips,
                };
            })
            .filter((truck) => truck.overdueDays > 0)
            .sort((a, b) => b.overdueDays - a.overdueDays);

        const dailyAnalysis = Array.from(dailyMap.values())
            .map((row) => ({
                date: row.date,
                activeTrucks: row._trucks.size,
                trips: row.trips,
                totalDistanceKm: toRounded(row.totalDistanceKm),
                totalFuelUsedLiters: toRounded(row.totalFuelUsedLiters),
                totalCostRs: toRounded(row.totalCostRs),
                avgDeliveryTimeMin: toRounded(row.avgDeliveryTimeMin / (row._deliveryCount || 1)),
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const monthlyAnalysis = Array.from(monthlyMap.values())
            .map((row) => ({
                month: row.month,
                activeTrucks: row._trucks.size,
                trips: row.trips,
                totalDistanceKm: toRounded(row.totalDistanceKm),
                totalFuelUsedLiters: toRounded(row.totalFuelUsedLiters),
                totalCostRs: toRounded(row.totalCostRs),
                avgDeliveryTimeMin: toRounded(row.avgDeliveryTimeMin / (row._deliveryCount || 1)),
            }))
            .sort((a, b) => a.month.localeCompare(b.month));

        const placesTravelled = trucks
            .map((truck) => ({
                truckId: truck.truckId,
                totalDistanceKm: toRounded(truck.totalDistanceKm),
                trips: truck.totalTrips,
                lastTripDate: truck.lastTripDate.toISOString(),
            }))
            .sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);

        const liveTracking = trucks
            .map((truck) => {
                const daysSinceLastTrip = Math.floor((latestDataDate - truck.lastTripDate) / oneDayMs);
                return {
                    truckId: truck.truckId,
                    lastSeen: truck.lastTripDate.toISOString(),
                    daysSinceLastSeen: daysSinceLastTrip,
                    status: daysSinceLastTrip <= 1 ? 'Live' : daysSinceLastTrip <= 7 ? 'Recently Active' : 'Idle',
                };
            })
            .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

        return {
            summary: {
                totalTrucks: trucks.length,
                activeTrucks: activeTrucks.length,
                maintenanceDueTrucks: maintenanceDueList.length,
                totalTrips: normalizedRows.length,
                totalDistanceKm: toRounded(normalizedRows.reduce((sum, row) => sum + row.distanceKm, 0)),
                totalFuelUsedLiters: toRounded(normalizedRows.reduce((sum, row) => sum + row.fuelUsedLiters, 0)),
                totalCostRs: toRounded(normalizedRows.reduce((sum, row) => sum + row.costRs, 0)),
                uniqueTravelDays: dailyMap.size,
                latestDataDate: latestDataDate.toISOString(),
            },
            dailyAnalysis,
            monthlyAnalysis,
            placesTravelled,
            liveTracking,
            maintenanceDueList,
            rules: {
                activeWindowDays,
                maintenanceIntervalDays,
            },
        };
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
