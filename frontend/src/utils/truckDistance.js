export const normalizeReg = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();

export const getTripDistanceKm = (trip) => {
    const value = Number(trip?.distanceKm ?? trip?.distance ?? 0);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
};

export const isTripForTruck = (trip, truck) => {
    if (!trip || !truck) return false;

    const tripTruckId = trip.truckId?._id || trip.truckId;
    if (tripTruckId && String(tripTruckId) === String(truck._id)) return true;

    const reg = normalizeReg(trip.registrationNumber);
    if (!reg) return false;
    return reg === normalizeReg(truck.truckId) || reg === normalizeReg(truck.licensePlate);
};

export const getTruckTotalDistanceKmFromRoutes = (truck, routes = []) => {
    if (!truck || !Array.isArray(routes)) return 0;
    return routes.reduce((sum, route) => (isTripForTruck(route, truck) ? sum + getTripDistanceKm(route) : sum), 0);
};

export const getTruckDistanceSinceServiceKm = (truck, routes = []) => {
    const total = getTruckTotalDistanceKmFromRoutes(truck, routes);
    const lastServiceDistance = Number(truck?.lastServiceDistance || 0);
    if (!Number.isFinite(lastServiceDistance)) return total;
    return Math.max(0, total - lastServiceDistance);
};
