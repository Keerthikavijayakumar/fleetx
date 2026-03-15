const Truck = require('../models/Truck');

const DEFAULT_DIESEL_EMISSION_FACTOR = 2.68; // kg CO2 per litre (diesel standard)

/**
 * Compute derived compliance dates from a truck's registration and tax data.
 *
 * FC Renewal: New lorry FC renewed twice a year for first 2 years → 4 dates:
 *   regDate+6mo, regDate+12mo, regDate+18mo, regDate+24mo.
 *
 * State Tax (TN): every 3 months from the last paid date (or registration date if never paid).
 *
 * Central Tax: yearly from the last paid date (or registration date if never paid).
 */
function computeComplianceDates(registrationDate, stateTaxPaidDate, centralTaxPaidDate) {
    const regDate = new Date(registrationDate);

    // FC renewals: +6m, +12m, +18m, +24m
    const fcRenewalDates = [1, 2, 3, 4].map((n) => {
        const d = new Date(regDate);
        d.setMonth(d.getMonth() + n * 6);
        return d;
    });

    // State Road Tax (TN) – quarterly
    const stateTaxBase = stateTaxPaidDate ? new Date(stateTaxPaidDate) : new Date(regDate);
    const stateTaxNextDue = new Date(stateTaxBase);
    stateTaxNextDue.setMonth(stateTaxNextDue.getMonth() + 3);

    // Central Govt Road Tax – yearly
    const centralTaxBase = centralTaxPaidDate ? new Date(centralTaxPaidDate) : new Date(regDate);
    const centralTaxNextDue = new Date(centralTaxBase);
    centralTaxNextDue.setFullYear(centralTaxNextDue.getFullYear() + 1);

    return { fcRenewalDates, stateTaxNextDue, centralTaxNextDue };
}

function parseFlexibleDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    const raw = String(value).trim();
    if (!raw) return null;

    // yyyy-mm-dd
    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const dt = new Date(year, month - 1, day);
        return Number.isNaN(dt.getTime()) ? null : dt;
    }

    // dd-mm-yyyy / dd/mm/yyyy
    match = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{2,4})$/);
    if (match) {
        const day = Number(match[1]);
        const month = Number(match[2]);
        let year = Number(match[3]);
        if (year < 100) year += 2000;
        if (year < 1900) year += 2000;
        const dt = new Date(year, month - 1, day);
        return Number.isNaN(dt.getTime()) ? null : dt;
    }

    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

class FleetService {
    async getAllTrucks() {
        return Truck.find().sort({ createdAt: -1 });
    }

    async getTruckById(id) {
        const truck = await Truck.findById(id);
        if (!truck) throw Object.assign(new Error('Truck not found'), { status: 404 });
        return truck;
    }

    async createTruck(data) {
        if (!data.licensePlate) {
            throw Object.assign(new Error('Number plate is required'), { status: 400 });
        }

        const registrationDate = parseFlexibleDate(data.registrationDate);
        if (!registrationDate) {
            throw Object.assign(new Error('Registration date is required and must be valid'), { status: 400 });
        }

        const insuranceExpiry = parseFlexibleDate(data.insuranceExpiry);
        const stateTaxPaidDate = parseFlexibleDate(data.stateTaxPaidDate);
        const centralTaxPaidDate = parseFlexibleDate(data.centralTaxPaidDate);

        const normalizedMileage = Number(data.mileage ?? data.fuelEfficiency);
        const { fcRenewalDates, stateTaxNextDue, centralTaxNextDue } = computeComplianceDates(
            registrationDate,
            stateTaxPaidDate,
            centralTaxPaidDate,
        );
        const truck = new Truck({
            ...data,
            truckId: data.licensePlate,
            registrationDate,
            insuranceExpiry: insuranceExpiry || undefined,
            stateTaxPaidDate: stateTaxPaidDate || undefined,
            centralTaxPaidDate: centralTaxPaidDate || undefined,
            fuelEfficiency: normalizedMileage,
            emissionFactor: DEFAULT_DIESEL_EMISSION_FACTOR,
            fcRenewalDates,
            stateTaxNextDue,
            centralTaxNextDue,
        });
        return truck.save();
    }

    async updateTruck(id, data) {
        const updatePayload = { ...data };

        // Single identifier: keep truckId always equal to number plate.
        if (updatePayload.licensePlate !== undefined) {
            updatePayload.truckId = updatePayload.licensePlate;
        }

        if (updatePayload.mileage !== undefined) {
            updatePayload.fuelEfficiency = Number(updatePayload.mileage);
            delete updatePayload.mileage;
        }

        if (updatePayload.registrationDate !== undefined) {
            const parsed = parseFlexibleDate(updatePayload.registrationDate);
            if (!parsed) throw Object.assign(new Error('Registration date must be valid'), { status: 400 });
            updatePayload.registrationDate = parsed;
        }
        if (updatePayload.insuranceExpiry !== undefined) {
            updatePayload.insuranceExpiry = parseFlexibleDate(updatePayload.insuranceExpiry);
        }
        if (updatePayload.stateTaxPaidDate !== undefined) {
            updatePayload.stateTaxPaidDate = parseFlexibleDate(updatePayload.stateTaxPaidDate);
        }
        if (updatePayload.centralTaxPaidDate !== undefined) {
            updatePayload.centralTaxPaidDate = parseFlexibleDate(updatePayload.centralTaxPaidDate);
        }

        if (updatePayload.fuelEfficiency !== undefined) {
            updatePayload.fuelEfficiency = Number(updatePayload.fuelEfficiency);
        }
        updatePayload.emissionFactor = DEFAULT_DIESEL_EMISSION_FACTOR;

        // Re-compute compliance dates if relevant fields changed
        if (updatePayload.registrationDate || updatePayload.stateTaxPaidDate || updatePayload.centralTaxPaidDate) {
            const existing = await Truck.findById(id);
            if (!existing) throw Object.assign(new Error('Truck not found'), { status: 404 });
            const regDate = updatePayload.registrationDate || existing.registrationDate;
            const statePaidDate = updatePayload.stateTaxPaidDate || existing.stateTaxPaidDate;
            const centralPaidDate = updatePayload.centralTaxPaidDate || existing.centralTaxPaidDate;
            const computed = computeComplianceDates(regDate, statePaidDate, centralPaidDate);
            Object.assign(updatePayload, computed);
        }

        const truck = await Truck.findByIdAndUpdate(id, updatePayload, { new: true, runValidators: true });
        if (!truck) throw Object.assign(new Error('Truck not found'), { status: 404 });
        return truck;
    }

    async deleteTruck(id) {
        const truck = await Truck.findByIdAndDelete(id);
        if (!truck) throw Object.assign(new Error('Truck not found'), { status: 404 });
        return truck;
    }

    async clearAllTrucks() {
        return Truck.deleteMany({});
    }

    async getActiveTrucks() {
        return Truck.find({ status: 'active' });
    }
}

module.exports = new FleetService();
