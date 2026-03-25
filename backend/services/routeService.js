const Route = require('../models/Route');
const Truck = require('../models/Truck');
const User = require('../models/User');

class RouteService {
    parseDurationToMinutes(durationText) {
        if (!durationText || typeof durationText !== 'string') return 0;
        const text = durationText.toLowerCase();
        const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/);
        const minMatch = text.match(/(\d+(?:\.\d+)?)\s*m/);
        const hours = hourMatch ? Number(hourMatch[1]) : 0;
        const mins = minMatch ? Number(minMatch[1]) : 0;
        const total = (hours * 60) + mins;
        return Number.isFinite(total) ? total : 0;
    }

    formatMinutesToDuration(minutes) {
        const m = Math.max(0, Math.round(Number(minutes || 0)));
        const hours = Math.floor(m / 60);
        const mins = m % 60;
        return `${hours}h ${mins}m`;
    }

    withRealtimeMetrics(route) {
        const raw = route?.toObject ? route.toObject() : route;
        if (!raw) return raw;

        const estimatedDurationMinutes = Number(raw.estimatedDurationMinutes || this.parseDurationToMinutes(raw.duration) || 0);
        const estimatedFuelConsumed = Number(raw.estimatedFuelConsumed ?? raw.fuelConsumed ?? 0);
        const estimatedFuelCost = Number(raw.estimatedFuelCost ?? raw.fuelCost ?? 0);
        const estimatedTollCost = Number(raw.tollTotalCost || 0);
        const estimatedFoodCost = Number(raw.foodCost || 0);
        const estimatedTotalCost = Number(raw.totalTripCost ?? (estimatedFuelCost + estimatedTollCost + estimatedFoodCost));

        let progress = 0;
        if (raw.status === 'completed') {
            progress = 1;
        } else if (raw.status === 'in_transit' && raw.tripStartTime) {
            const startedAt = new Date(raw.tripStartTime).getTime();
            const endedAt = raw.tripEndTime
                ? new Date(raw.tripEndTime).getTime()
                : startedAt + (estimatedDurationMinutes * 60 * 1000);
            const denom = Math.max(endedAt - startedAt, 1);
            progress = Math.min(Math.max((Date.now() - startedAt) / denom, 0), 1);
        }

        const costPerLitre = raw.truckId?.costPerLitre
            ? Number(raw.truckId.costPerLitre)
            : (estimatedFuelConsumed > 0 ? estimatedFuelCost / estimatedFuelConsumed : 0);

        const realtimeDurationMinutes = Number(raw.actualDurationMinutes ?? Number((estimatedDurationMinutes * progress).toFixed(2)));
        const realtimeFuelConsumed = Number(raw.actualFuelConsumed ?? Number((estimatedFuelConsumed * progress).toFixed(2)));
        const realtimeFuelCost = Number(raw.actualFuelCost ?? Number((realtimeFuelConsumed * costPerLitre).toFixed(2)));
        const realtimeTollCost = Number(raw.actualTollCost ?? Number((estimatedTollCost * progress).toFixed(2)));
        const realtimeFoodCost = Number(raw.actualFoodCost ?? Number((estimatedFoodCost * progress).toFixed(2)));
        const realtimeTotalCost = Number(raw.actualTotalCost ?? Number((realtimeFuelCost + realtimeTollCost + realtimeFoodCost).toFixed(2)));

        return {
            ...raw,
            estimated: {
                distanceKm: Number(raw.distance || 0),
                durationMinutes: estimatedDurationMinutes,
                durationText: raw.duration || this.formatMinutesToDuration(estimatedDurationMinutes),
                fuelConsumed: Number(estimatedFuelConsumed.toFixed(2)),
                fuelCost: Number(estimatedFuelCost.toFixed(2)),
                tollCost: Number(estimatedTollCost.toFixed(2)),
                foodCost: Number(estimatedFoodCost.toFixed(2)),
                totalCost: Number(estimatedTotalCost.toFixed(2)),
            },
            realtime: {
                progress: Number(progress.toFixed(3)),
                durationMinutes: Number(realtimeDurationMinutes.toFixed(2)),
                fuelConsumed: Number(realtimeFuelConsumed.toFixed(2)),
                fuelCost: Number(realtimeFuelCost.toFixed(2)),
                tollCost: Number(realtimeTollCost.toFixed(2)),
                foodCost: Number(realtimeFoodCost.toFixed(2)),
                totalCost: Number(realtimeTotalCost.toFixed(2)),
            },
        };
    }

    calculateFuelConsumed(distanceKm, fuelEfficiency) {
        return parseFloat((distanceKm / fuelEfficiency).toFixed(2));
    }

    calculateFuelCost(fuelConsumed, costPerLitre) {
        return parseFloat((fuelConsumed * costPerLitre).toFixed(2));
    }

    calculateCarbonEmission(fuelConsumed, emissionFactor) {
        return parseFloat((fuelConsumed * emissionFactor).toFixed(2));
    }

    determineTrafficLevel(durationInTraffic, normalDuration) {
        if (!durationInTraffic || !normalDuration) {
            const levels = ['Low', 'Medium', 'High'];
            return levels[Math.floor(Math.random() * 3)];
        }
        const ratio = durationInTraffic / normalDuration;
        if (ratio < 1.2) return 'Low';
        if (ratio < 1.5) return 'Medium';
        return 'High';
    }

    getDayRange(dateLike) {
        const date = dateLike ? new Date(dateLike) : new Date();
        if (Number.isNaN(date.getTime())) {
            throw Object.assign(new Error('Invalid trip date provided'), { status: 400 });
        }
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { start, end };
    }

    async ensureCrewAvailability({ routeId = null, driverId, assistantId, tripDate }) {
        const distinctCrew = [...new Set([driverId, assistantId].filter(Boolean).map(String))];
        if (distinctCrew.length === 0) return;

        if (driverId && assistantId && String(driverId) === String(assistantId)) {
            throw Object.assign(new Error('Driver and assistant cannot be the same person for a trip'), { status: 400 });
        }

        const { start, end } = this.getDayRange(tripDate);
        const conflict = await Route.findOne({
            ...(routeId ? { _id: { $ne: routeId } } : {}),
            $or: [
                { driverId: { $in: distinctCrew } },
                { assistantId: { $in: distinctCrew } },
            ],
            $or: [
                { tripStartTime: { $gte: start, $lt: end } },
                {
                    tripStartTime: null,
                    createdAt: { $gte: start, $lt: end },
                },
            ],
        })
            .select('source destination tripStartTime createdAt')
            .lean();

        if (conflict) {
            const dayText = new Date(conflict.tripStartTime || conflict.createdAt).toLocaleDateString('en-IN');
            throw Object.assign(
                new Error(`Crew member is already assigned on ${dayText} (${conflict.source} -> ${conflict.destination})`),
                { status: 400 }
            );
        }
    }

    async planRoute(data) {
        const {
            source,
            destination,
            truckId,
            driverId,
            assistantId,
            sourceSystem,
            distance,
            duration,
            polyline,
            tollCount = 0,
            tollPrice = 0,
            foodCost = 0,
            tripStartTime,
            tripEndTime,
            status,
            actualDurationMinutes,
            actualFuelConsumed,
            actualFuelCost,
            actualTollCost,
            actualFoodCost,
        } = data;

        const isCsvIngested = sourceSystem === 'ialert_csv';
        if (!isCsvIngested && (!driverId || !assistantId)) {
            throw Object.assign(new Error('Driver and assistant must be assigned for every trip'), { status: 400 });
        }

        let truck = null;
        let fuelEfficiency = 8;
        let costPerLitre = 95;
        let emissionFactor = 2.68;

        if (truckId) {
            truck = await Truck.findById(truckId);
            if (truck) {
                fuelEfficiency = truck.fuelEfficiency;
                costPerLitre = truck.costPerLitre;
                emissionFactor = truck.emissionFactor;
            }
        }

        if (driverId) {
            const driver = await User.findById(driverId).select('role');
            if (!driver || driver.role !== 'driver') {
                throw Object.assign(new Error('Assigned driver must be a user with driver role'), { status: 400 });
            }
        }

        if (assistantId) {
            const assistant = await User.findById(assistantId).select('role');
            if (!assistant || !['assistant', 'driver'].includes(assistant.role)) {
                throw Object.assign(new Error('Assigned assistant must be assistant or driver role'), { status: 400 });
            }
        }

        await this.ensureCrewAvailability({
            driverId,
            assistantId,
            tripDate: tripStartTime || new Date(),
        });

        const distanceKm = distance || 0;
        const speedForEstimate = Number(truck?.speed || 45) > 0 ? Number(truck?.speed || 45) : 45;
        const estimatedDurationMinutes = this.parseDurationToMinutes(duration) || Number(((distanceKm / speedForEstimate) * 60).toFixed(2));
        const fuelConsumed = this.calculateFuelConsumed(distanceKm, fuelEfficiency);
        const fuelCost = this.calculateFuelCost(fuelConsumed, costPerLitre);
        const carbonEmission = this.calculateCarbonEmission(fuelConsumed, emissionFactor);
        const trafficLevel = this.determineTrafficLevel(null, null) || 'Low';
        const tollTotalCost = Number((Number(tollCount || 0) * Number(tollPrice || 0)).toFixed(2));
        const foodCostValue = Number(foodCost || 0);
        const totalTripCost = Number((fuelCost + tollTotalCost + foodCostValue).toFixed(2));

        const route = new Route({
            truckId: truckId || null,
            driverId: driverId || null,
            assistantId: assistantId || null,
            source,
            destination,
            distance: distanceKm,
            duration: duration || this.formatMinutesToDuration(estimatedDurationMinutes),
            estimatedDurationMinutes,
            estimatedFuelConsumed: fuelConsumed,
            estimatedFuelCost: fuelCost,
            fuelConsumed,
            fuelCost,
            foodCost: foodCostValue,
            tollCount: Number(tollCount || 0),
            tollPrice: Number(tollPrice || 0),
            tollTotalCost,
            totalTripCost,
            carbonEmission,
            trafficLevel,
            status: status || 'scheduled',
            tripStartTime: tripStartTime ? new Date(tripStartTime) : null,
            tripEndTime: tripEndTime ? new Date(tripEndTime) : null,
            actualDurationMinutes: actualDurationMinutes !== undefined ? Number(actualDurationMinutes) : null,
            actualFuelConsumed: actualFuelConsumed !== undefined ? Number(actualFuelConsumed) : null,
            actualFuelCost: actualFuelCost !== undefined ? Number(actualFuelCost) : null,
            actualTollCost: actualTollCost !== undefined ? Number(actualTollCost) : null,
            actualFoodCost: actualFoodCost !== undefined ? Number(actualFoodCost) : null,
            polyline: polyline || '',
        });

        const saved = await route.save();
        return this.withRealtimeMetrics(saved);
    }

    async getAllRoutes() {
        const rows = await Route.find()
            .populate('truckId')
            .populate('driverId', 'username email role fullName')
            .populate('assistantId', 'username email role fullName')
            .sort({ createdAt: -1 })
            .limit(100);
        return rows.map((r) => this.withRealtimeMetrics(r));
    }

    async getRouteById(id) {
        const route = await Route.findById(id)
            .populate('truckId')
            .populate('driverId', 'username email role fullName')
            .populate('assistantId', 'username email role fullName');
        if (!route) throw Object.assign(new Error('Route not found'), { status: 404 });
        return this.withRealtimeMetrics(route);
    }

    async updateRoute(id, data) {
        const update = { ...data };
        if (update.tripStartTime) update.tripStartTime = new Date(update.tripStartTime);
        if (update.tripEndTime) update.tripEndTime = new Date(update.tripEndTime);

        const existing = await Route.findById(id).select('driverId assistantId tripStartTime createdAt');
        if (!existing) throw Object.assign(new Error('Route not found'), { status: 404 });

        const effectiveDriverId = update.driverId !== undefined ? update.driverId : existing.driverId;
        const effectiveAssistantId = update.assistantId !== undefined ? update.assistantId : existing.assistantId;
        const effectiveTripDate = update.tripStartTime || existing.tripStartTime || existing.createdAt || new Date();

        if (effectiveDriverId) {
            const driver = await User.findById(effectiveDriverId).select('role');
            if (!driver || driver.role !== 'driver') {
                throw Object.assign(new Error('Assigned driver must be a user with driver role'), { status: 400 });
            }
        }

        if (effectiveAssistantId) {
            const assistant = await User.findById(effectiveAssistantId).select('role');
            if (!assistant || !['assistant', 'driver'].includes(assistant.role)) {
                throw Object.assign(new Error('Assigned assistant must be assistant or driver role'), { status: 400 });
            }
        }

        await this.ensureCrewAvailability({
            routeId: id,
            driverId: effectiveDriverId,
            assistantId: effectiveAssistantId,
            tripDate: effectiveTripDate,
        });

        if (
            update.tollCount !== undefined ||
            update.tollPrice !== undefined ||
            update.fuelCost !== undefined ||
            update.foodCost !== undefined
        ) {
            const current = existing;

            const tollCount = Number(update.tollCount ?? current.tollCount ?? 0);
            const tollPrice = Number(update.tollPrice ?? current.tollPrice ?? 0);
            const fuelCost = Number(update.fuelCost ?? current.fuelCost ?? 0);
            const foodCost = Number(update.foodCost ?? current.foodCost ?? 0);

            update.tollTotalCost = Number((tollCount * tollPrice).toFixed(2));
            update.totalTripCost = Number((fuelCost + update.tollTotalCost + foodCost).toFixed(2));
        }

        if (update.foodCost !== undefined) {
            update.foodCost = Number(update.foodCost || 0);
        }

        if (update.actualDurationMinutes !== undefined) update.actualDurationMinutes = Number(update.actualDurationMinutes || 0);
        if (update.actualFuelConsumed !== undefined) update.actualFuelConsumed = Number(update.actualFuelConsumed || 0);
        if (update.actualFuelCost !== undefined) update.actualFuelCost = Number(update.actualFuelCost || 0);
        if (update.actualTollCost !== undefined) update.actualTollCost = Number(update.actualTollCost || 0);
        if (update.actualFoodCost !== undefined) update.actualFoodCost = Number(update.actualFoodCost || 0);
        if (
            update.actualFuelCost !== undefined ||
            update.actualTollCost !== undefined ||
            update.actualFoodCost !== undefined
        ) {
            const fuel = Number(update.actualFuelCost || 0);
            const toll = Number(update.actualTollCost || 0);
            const food = Number(update.actualFoodCost || 0);
            update.actualTotalCost = Number((fuel + toll + food).toFixed(2));
        }

        const route = await Route.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
        })
            .populate('truckId')
            .populate('driverId', 'username email role fullName')
            .populate('assistantId', 'username email role fullName');

        if (!route) throw Object.assign(new Error('Route not found'), { status: 404 });
        return this.withRealtimeMetrics(route);
    }

    async deleteRoute(id) {
        const route = await Route.findByIdAndDelete(id);
        if (!route) throw Object.assign(new Error('Route not found'), { status: 404 });
        return route;
    }
}

module.exports = new RouteService();
