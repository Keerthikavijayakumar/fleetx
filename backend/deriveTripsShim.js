function deriveTrips(rows) {
    const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
    const trips = [];
    let active = null;

    for (const row of sorted) {
        const speed = row.vehicleSpeedKmph || 0;
        const moving = row.ignitionStatus === 'ON' && speed > 1;

        if (!active && moving) {
            active = {
                start: row,
                lastMoving: row,
                rows: [row],
            };
            continue;
        }

        if (!active) continue;

        active.rows.push(row);
        if (moving) active.lastMoving = row;

        const shouldEnd = row.ignitionStatus !== 'ON' || (!moving && (row.timestamp - active.lastMoving.timestamp) >= 5 * 60 * 1000);
        if (!shouldEnd) continue;

        const end = active.lastMoving || row;
        if (end.timestamp > active.start.timestamp) {
            trips.push({ start: active.start, end, rows: active.rows.filter((r) => r.timestamp <= end.timestamp) });
        }
        active = null;
    }

    if (active && active.lastMoving && active.lastMoving.timestamp > active.start.timestamp) {
        trips.push({ start: active.start, end: active.lastMoving, rows: active.rows });
    }

    return trips;
}

module.exports = { deriveTrips };
