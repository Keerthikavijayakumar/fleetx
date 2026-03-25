import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { telemetryAPI, alertsAPI, trucksAPI } from '../services/api';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const fmt = (v, fallback = '—') => (v !== null && v !== undefined && v !== '' ? v : fallback);
const fmtNum = (v, dec = 1) => (v !== null && v !== undefined && !isNaN(v) ? Number(v).toFixed(dec) : '—');
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};
const fmtDateTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

// ────────────────────────────────────────────────────────────────────────────
// Map helpers
// ────────────────────────────────────────────────────────────────────────────

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions && positions.length > 0) {
      const latlngs = positions.map((p) => [p.lat ?? p.latitude, p.lng ?? p.longitude]);
      try { map.fitBounds(latlngs, { padding: [30, 30] }); } catch (_) {}
    }
  }, [positions, map]);
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Small reusable components
// ────────────────────────────────────────────────────────────────────────────

function KpiCard({ label, value, unit, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };
  return (
    <div className={`border rounded-xl p-4 ${colors[color] || colors.blue}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">
        {value} {unit && <span className="text-sm font-normal">{unit}</span>}
      </p>
    </div>
  );
}

function EmptyState({ message, subText }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl mb-4">📭</div>
      <p className="text-lg font-semibold text-gray-600">{message}</p>
      {subText && <p className="text-sm text-gray-400 mt-2 max-w-md">{subText}</p>}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-wrap">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            active === t.id
              ? 'bg-white shadow text-blue-700 font-semibold'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Per-truck Tab: Trips
// ────────────────────────────────────────────────────────────────────────────

function TripsTab({ regNo }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const load = useCallback(async (pageNum = 1) => {
    setLoading(true);
    try {
      const res = await telemetryAPI.trips({ registrationNumber: regNo, from, to, page: pageNum, limit: 20 });
      const data = res.data;
      const list = Array.isArray(data) ? data : (data.trips || data.data || []);
      setTrips(list);
      setHasMore(list.length === 20);
    } catch {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, [regNo, from, to]);

  useEffect(() => { setPage(1); load(1); }, [load]);

  const handlePage = (p) => { setPage(p); load(p); };

  return (
    <div className="space-y-4">
      {/* Date filter */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <button onClick={() => { setPage(1); load(1); }}
          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          Search
        </button>
      </div>

      {loading ? <LoadingSpinner /> : trips.length === 0 ? (
        <EmptyState message="No trips found" subText="Try extending the date range or upload a CSV in Admin → Monthly Report." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 uppercase text-xs">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Start Time</th>
                  <th className="px-4 py-3 text-left">End Time</th>
                  <th className="px-4 py-3 text-left">Source (Start)</th>
                  <th className="px-4 py-3 text-left">Destination (End)</th>
                  <th className="px-4 py-3 text-right">Distance</th>
                  <th className="px-4 py-3 text-right">Avg Speed</th>
                  <th className="px-4 py-3 text-right">Max Speed</th>
                  <th className="px-4 py-3 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {trips.map((t, i) => {
                  const startDt = t.tripStartTime || t.startTime;
                  const endDt = t.tripEndTime || t.endTime;
                  const durationMin = t.durationMinutes ?? t.duration;
                  const hours = durationMin ? Math.floor(durationMin / 60) : null;
                  const mins = durationMin ? Math.round(durationMin % 60) : null;
                  const durationStr = durationMin != null ? `${hours}h ${mins}m` : '—';
                  return (
                    <tr key={t._id || i} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{fmtDate(startDt)}</td>
                      <td className="px-4 py-3">{fmtTime(startDt)}</td>
                      <td className="px-4 py-3">{fmtTime(endDt)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {fmt(t.startLocationName || t.startLocation || t.source)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {fmt(t.endLocationName || t.endLocation || t.destination)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-blue-700">
                        {fmtNum(t.distanceKm || t.distance, 2)} km
                      </td>
                      <td className="px-4 py-3 text-right">{fmtNum(t.avgSpeedKmph || t.avgSpeed)} km/h</td>
                      <td className="px-4 py-3 text-right">{fmtNum(t.maxSpeedKmph || t.maxSpeed)} km/h</td>
                      <td className="px-4 py-3 text-right text-gray-500">{durationStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex gap-2 justify-center mt-6">
            <button disabled={page <= 1} onClick={() => handlePage(page - 1)}
              className="px-3 py-1 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">← Prev</button>
            <span className="px-3 py-1 text-sm text-gray-500">Page {page}</span>
            <button disabled={!hasMore} onClick={() => handlePage(page + 1)}
              className="px-3 py-1 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">Next →</button>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Per-truck Tab: GPS Trail
// ────────────────────────────────────────────────────────────────────────────

function GpsTab({ regNo }) {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await telemetryAPI.gpsHistory({ registrationNumber: regNo, from, to });
      const list = Array.isArray(res.data) ? res.data : (res.data?.positions || []);
      setPositions(list);
    } catch {
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, [regNo, from, to]);

  useEffect(() => { load(); }, [load]);

  const validPositions = positions.filter((p) => {
    const lat = p.lat ?? p.latitude;
    const lng = p.lng ?? p.longitude;
    return lat && lng && !isNaN(lat) && !isNaN(lng);
  });

  const polyline = validPositions.map((p) => [p.lat ?? p.latitude, p.lng ?? p.longitude]);

  const speedData = validPositions.slice(-100).map((p, i) => ({
    i,
    speed: p.speed ?? p.vehicleSpeed ?? 0,
    time: fmtTime(p.timestamp || p.gpsTime),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <button onClick={load}
          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          Show Trail
        </button>
      </div>

      {loading ? <LoadingSpinner /> : validPositions.length === 0 ? (
        <EmptyState message="No GPS data found for this range" subText="Upload a CSV in Admin → Monthly Report to populate GPS history." />
      ) : (
        <>
          <div className="rounded-xl overflow-hidden border" style={{ height: 400 }}>
            <MapContainer center={polyline[0] || [20.5937, 78.9629]} zoom={7} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="© OpenStreetMap contributors" />
              <FitBounds positions={validPositions} />
              {polyline.length > 1 && <Polyline positions={polyline} color="#3b82f6" weight={3} />}
              {validPositions.length > 0 && (
                <CircleMarker center={polyline[0]} radius={8} color="green" fillOpacity={1}>
                  <Popup>Start</Popup>
                </CircleMarker>
              )}
              {validPositions.length > 1 && (
                <CircleMarker center={polyline[polyline.length - 1]} radius={8} color="red" fillOpacity={1}>
                  <Popup>Last Known</Popup>
                </CircleMarker>
              )}
            </MapContainer>
          </div>
          <div className="text-xs text-gray-400 text-right">{validPositions.length} GPS points plotted</div>

          {speedData.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Speed Profile (last 100 points)</h4>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={speedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="i" hide />
                  <YAxis unit=" km/h" />
                  <Tooltip formatter={(v) => `${v} km/h`} />
                  <Area type="monotone" dataKey="speed" stroke="#3b82f6" fill="#dbeafe" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Per-truck Tab: Engine Health
// ────────────────────────────────────────────────────────────────────────────

function EngineTab({ regNo }) {
  const [health, setHealth] = useState(null);
  const [params, setParams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, pRes] = await Promise.allSettled([
        telemetryAPI.engineHealth({ registrationNumber: regNo }),
        telemetryAPI.systemParams({ registrationNumber: regNo, from, to }),
      ]);
      if (hRes.status === 'fulfilled') {
        const d = hRes.value.data;
        setHealth(Array.isArray(d) ? d.find((x) => x.registrationNumber === regNo) || d[0] : d);
      }
      if (pRes.status === 'fulfilled') {
        const d = pRes.value.data;
        setParams(Array.isArray(d) ? d : (d?.data || []));
      }
    } finally {
      setLoading(false);
    }
  }, [regNo, from, to]);

  useEffect(() => { load(); }, [load]);

  const metricInfo = [
    { key: 'coolantTempC', label: 'Coolant Temp', unit: '°C', color: '#ef4444' },
    { key: 'oilPressureKpa', label: 'Oil Pressure', unit: 'kPa', color: '#f97316' },
    { key: 'exhaustTempC', label: 'Exhaust Temp', unit: '°C', color: '#eab308' },
    { key: 'engineSpeedRpm', label: 'Engine RPM', unit: '', color: '#8b5cf6' },
    { key: 'batteryVoltage', label: 'Battery', unit: 'V', color: '#22c55e' },
    { key: 'airPressure1Kpa', label: 'Air Pressure 1', unit: 'kPa', color: '#06b6d4' },
    { key: 'airPressure2Kpa', label: 'Air Pressure 2', unit: 'kPa', color: '#06b6d4' },
    { key: 'defLevelLtr', label: 'DEF Level', unit: 'L', color: '#3b82f6' },
  ];

  // Build trend data from systemParams
  const trendMap = {};
  metricInfo.forEach((m) => {
    const trend = params
      .filter((r) => r[m.key] !== undefined && r[m.key] !== null)
      .slice(-50)
      .map((r, i) => ({ i, value: r[m.key], time: fmtTime(r.timestamp || r.gpsTime) }));
    if (trend.length) trendMap[m.key] = trend;
  });

  if (loading) return <LoadingSpinner />;
  if (!health && params.length === 0) {
    return <EmptyState message="No engine data found" subText="Upload a CSV in Admin → Monthly Report to populate engine health." />;
  }

  return (
    <div className="space-y-6">
      {/* Date filter for trends */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Trend From</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <button onClick={load}
          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          Refresh
        </button>
      </div>

      {/* Engine KPIs  */}
      {health && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {metricInfo.map((m) => (
            <KpiCard key={m.key} label={m.label}
              value={health[m.key] != null ? fmtNum(health[m.key], 1) : '—'}
              unit={m.unit} color="blue" />
          ))}
          {health.engineHours != null && (
            <KpiCard label="Engine Hours" value={fmtNum(health.engineHours, 0)} unit="h" color="purple" />
          )}
          {health.odometer != null && (
            <KpiCard label="Odometer" value={fmtNum(health.odometer, 0)} unit="km" color="green" />
          )}
        </div>
      )}

      {/* Trend charts */}
      {Object.entries(trendMap).map(([key, trend]) => {
        const info = metricInfo.find((m) => m.key === key);
        return (
          <div key={key}>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              {info?.label} Trend {info?.unit && `(${info.unit})`}
            </h4>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="i" hide />
                <YAxis />
                <Tooltip formatter={(v) => `${v} ${info?.unit || ''}`} />
                <Line type="monotone" dataKey="value" stroke={info?.color || '#3b82f6'} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Per-truck Tab: Fuel & Efficiency
// ────────────────────────────────────────────────────────────────────────────

function FuelTab({ regNo }) {
  const [data, setData] = useState(null);
  const [idle, setIdle] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [fRes, iRes, aRes, mRes] = await Promise.allSettled([
          telemetryAPI.fuelEfficiency({ registrationNumber: regNo }),
          telemetryAPI.idleSessions({ registrationNumber: regNo }),
          telemetryAPI.fuelAnomalies({ registrationNumber: regNo }),
          telemetryAPI.monthlyDistance({ registrationNumber: regNo }),
        ]);
        if (!mounted) return;
        if (fRes.status === 'fulfilled') {
          const d = fRes.value.data;
          const arr = Array.isArray(d) ? d : (d?.trucks || []);
          setData(arr.find((x) => x.registrationNumber === regNo) || arr[0] || null);
        }
        if (iRes.status === 'fulfilled') setIdle(Array.isArray(iRes.value.data) ? iRes.value.data : []);
        if (aRes.status === 'fulfilled') setAnomalies(Array.isArray(aRes.value.data) ? aRes.value.data : []);
        if (mRes.status === 'fulfilled') {
          const d = mRes.value.data;
          setMonthly(Array.isArray(d) ? d : (d?.monthly || []));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [regNo]);

  if (loading) return <LoadingSpinner />;
  if (!data && idle.length === 0 && anomalies.length === 0) {
    return <EmptyState message="No fuel data found" subText="Upload a CSV in Admin → Monthly Report to populate fuel analytics." />;
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KpiCard label="Fuel Efficiency" value={fmtNum(data.fuelEfficiency || data.kmPerLitre, 2)} unit="km/L" color="green" />
          <KpiCard label="Total Fuel Used" value={fmtNum(data.totalFuelConsumed || data.totalFuel, 1)} unit="L" color="blue" />
          <KpiCard label="Total Distance" value={fmtNum(data.totalDistanceKm || data.totalDistance, 0)} unit="km" color="purple" />
          <KpiCard label="Idle Sessions" value={idle.length} color="yellow" />
          <KpiCard label="Fuel Anomalies" value={anomalies.length} color={anomalies.length > 0 ? 'red' : 'green'} />
        </div>
      )}

      {/* Monthly distance chart */}
      {monthly.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Monthly Distance</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis unit=" km" />
              <Tooltip />
              <Bar dataKey="distanceKm" fill="#3b82f6" name="Distance (km)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Idle sessions */}
      {idle.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Idle Sessions ({idle.length})</h4>
          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase text-xs">
                  <th className="px-4 py-2 text-left">Start</th>
                  <th className="px-4 py-2 text-left">End</th>
                  <th className="px-4 py-2 text-right">Duration</th>
                  <th className="px-4 py-2 text-right">Fuel Wasted</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {idle.slice(0, 20).map((s, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{fmtDateTime(s.startTime || s.start)}</td>
                    <td className="px-4 py-2">{fmtDateTime(s.endTime || s.end)}</td>
                    <td className="px-4 py-2 text-right">{fmtNum(s.durationMinutes || s.duration, 0)} min</td>
                    <td className="px-4 py-2 text-right text-red-500">{fmtNum(s.fuelWasted || s.estimatedFuel, 2)} L</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Fuel Anomalies ({anomalies.length})</h4>
          <div className="space-y-2">
            {anomalies.slice(0, 10).map((a, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm">
                <span className="text-red-500 text-lg mt-0.5">⚠</span>
                <div>
                  <p className="font-medium text-red-700">{a.type || a.anomalyType || 'Fuel Anomaly'}</p>
                  <p className="text-gray-500 text-xs">{fmtDateTime(a.timestamp || a.detectedAt)} — {fmt(a.description)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Per-truck Tab: Alerts
// ────────────────────────────────────────────────────────────────────────────

function AlertsTab({ regNo }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await alertsAPI.list({ registrationNumber: regNo, limit: 100 });
        const d = res.data;
        if (mounted) setAlerts(Array.isArray(d) ? d : (d?.alerts || []));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [regNo]);

  const filtered = filter === 'all' ? alerts : alerts.filter((a) => (a.status || a.resolved ? 'resolved' : 'active') === filter);

  const severityColor = (s) => {
    const m = { critical: 'bg-red-100 text-red-700 border-red-200', high: 'bg-orange-100 text-orange-700 border-orange-200', medium: 'bg-yellow-100 text-yellow-700 border-yellow-200', low: 'bg-blue-100 text-blue-700 border-blue-200' };
    return m[(s || '').toLowerCase()] || 'bg-gray-100 text-gray-600 border-gray-200';
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {['all', 'active', 'resolved'].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-sm border ${filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)} {f === 'all' ? `(${alerts.length})` : ''}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No alerts found" subText={alerts.length === 0 ? "No alerts have been recorded for this truck." : "No alerts match the selected filter."} />
      ) : (
        <div className="space-y-2">
          {filtered.map((a, i) => (
            <div key={a._id || i} className={`p-4 rounded-xl border ${severityColor(a.severity)}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{a.type || a.alertType || 'Alert'}</p>
                  <p className="text-xs mt-1 opacity-80">{a.message || a.description}</p>
                </div>
                <div className="text-right text-xs">
                  <p>{fmtDateTime(a.triggeredAt || a.createdAt)}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${a.resolved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {a.resolved ? 'Resolved' : 'Active'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Per-truck detail view
// ────────────────────────────────────────────────────────────────────────────

const TRUCK_TABS = [
  { id: 'trips', label: '🗺 Trips' },
  { id: 'gps', label: '📍 GPS Trail' },
  { id: 'engine', label: '⚙️ Engine Health' },
  { id: 'fuel', label: '⛽ Fuel & Efficiency' },
  { id: 'alerts', label: '🔔 Alerts' },
];

function TruckDetail({ truck, lastPos, onBack }) {
  console.log('[DEBUG] Rendering TruckDetail for:', truck?.registrationNumber || truck?._id);
  const [activeTab, setActiveTab] = useState('trips');
  const regNo = truck.registrationNumber || truck.numberPlate || truck._id || '';

  const online = lastPos?.ignitionStatus === 'ON' || lastPos?.engineStatus === 'ON';

  return (
    <div className="space-y-4">
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 text-gray-600">
          ← Back to Fleet
        </button>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-green-500' : 'bg-gray-400'}`} />
          <h2 className="text-xl font-bold text-gray-800">{regNo}</h2>
          {lastPos?.vehicleModel && <span className="text-gray-400 text-sm">· {lastPos.vehicleModel}</span>}
        </div>
        {lastPos && (
          <span className="ml-auto text-xs text-gray-400">
            Last seen: {fmtDateTime(lastPos.timestamp || lastPos.gpsTime)}
          </span>
        )}
      </div>

      {/* Quick stats bar */}
      {lastPos && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Status" value={online ? 'Online' : 'Offline'} color={online ? 'green' : 'yellow'} />
          <KpiCard label="Speed" value={fmtNum(lastPos.vehicleSpeedKmph ?? lastPos.speed ?? lastPos.vehicleSpeed, 0)} unit="km/h" color="blue" />
          <KpiCard label="Fuel Level" value={fmtNum(lastPos.fuelLevel ?? lastPos.fuel, 0)} unit="%" color={lastPos.fuelLevel < 20 ? 'red' : 'green'} />
          <KpiCard label="Odometer" value={fmtNum(lastPos.odometerKm ?? lastPos.odometer, 0)} unit="km" color="purple" />
        </div>
      )}

      {/* Tabs */}
      <TabBar tabs={TRUCK_TABS} active={activeTab} onChange={setActiveTab} />

      <div className="bg-white rounded-2xl border p-4 min-h-64">
        {activeTab === 'trips' && <TripsTab regNo={regNo} />}
        {activeTab === 'gps' && <GpsTab regNo={regNo} />}
        {activeTab === 'engine' && <EngineTab regNo={regNo} />}
        {activeTab === 'fuel' && <FuelTab regNo={regNo} />}
        {activeTab === 'alerts' && <AlertsTab regNo={regNo} />}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Fleet Overview (shown when no truck is selected)
// ────────────────────────────────────────────────────────────────────────────

function FleetOverview({ summary, positions, onSelectTruck }) {
  const online = positions.filter((p) => p.ignitionStatus === 'ON' || p.engineStatus === 'ON').length;

  return (
    <div className="space-y-6">
      {/* Fleet KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Trucks (tracked)" value={positions.length} color="blue" />
        <KpiCard label="Online Now" value={online} color="green" />
        <KpiCard label="Offline" value={positions.length - online} color="yellow" />
        {summary?.totalTrips != null && <KpiCard label="Total Trips" value={summary.totalTrips} color="purple" />}
      </div>

      {/* Truck cards */}
      {positions.length === 0 ? (
        <EmptyState
          message="No telemetry data available"
          subText="Go to Admin → Monthly Report and upload your iAlert CSV to populate Fleet Intelligence."
        />
      ) : (
        <>
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Select a truck to view detailed analytics
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {positions.map((p, i) => {
              const regNo = p.registrationNumber || p.numberPlate || p._id || `Truck ${i + 1}`;
              const isOnline = p.ignitionStatus === 'ON' || p.engineStatus === 'ON';
              return (
                <button key={regNo + i}
                  onClick={() => onSelectTruck(p)}
                  className="text-left p-4 rounded-2xl border bg-white hover:border-blue-400 hover:shadow-md transition-all group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-gray-800 group-hover:text-blue-700">{regNo}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isOnline ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-gray-500">
                    {p.vehicleModel && <p>Model: {p.vehicleModel}</p>}
                    {(p.vehicleSpeedKmph ?? p.speed ?? p.vehicleSpeed) != null && (
                      <p>Speed: <span className="text-gray-700 font-medium">{fmtNum(p.vehicleSpeedKmph ?? p.speed ?? p.vehicleSpeed, 0)} km/h</span></p>
                    )}
                    {(p.fuelLevel ?? p.fuel) != null && (
                      <p>Fuel: <span className={`font-medium ${(p.fuelLevel ?? p.fuel) < 20 ? 'text-red-500' : 'text-gray-700'}`}>
                        {fmtNum(p.fuelLevel ?? p.fuel, 0)}%
                      </span></p>
                    )}
                    {(p.timestamp || p.gpsTime) && (
                      <p className="truncate">Last: {fmtDateTime(p.timestamp || p.gpsTime)}</p>
                    )}
                  </div>
                  <div className="mt-3 text-xs text-blue-600 font-medium group-hover:underline">View Details →</div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Live Map tab (fleet-wide)
// ────────────────────────────────────────────────────────────────────────────

function LiveMapTab({ positions, onSelectTruck }) {
  const validPos = positions.filter((p) => {
    const lat = p.lat ?? p.latitude;
    const lng = p.lng ?? p.longitude;
    return lat && lng && !isNaN(lat) && !isNaN(lng);
  });

  return validPos.length === 0 ? (
    <EmptyState message="No live GPS data" subText="Upload a CSV in Admin → Monthly Report to populate GPS data." />
  ) : (
    <div className="rounded-xl overflow-hidden border" style={{ height: 500 }}>
      <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap contributors" />
        <FitBounds positions={validPos} />
        {validPos.map((p, i) => {
          const lat = p.lat ?? p.latitude;
          const lng = p.lng ?? p.longitude;
          const regNo = p.registrationNumber || p.numberPlate || `T${i}`;
          const isOnline = p.ignitionStatus === 'ON' || p.engineStatus === 'ON';
          return (
            <CircleMarker key={regNo + i} center={[lat, lng]} radius={8}
              color={isOnline ? '#22c55e' : '#9ca3af'} fillOpacity={0.9}
              eventHandlers={{ click: () => onSelectTruck(p) }}>
              <Popup>
                <div className="text-sm">
                  <p className="font-bold">{regNo}</p>
                  <p>{isOnline ? '🟢 Online' : '⚫ Offline'}</p>
                  {(p.speed ?? p.vehicleSpeed) != null && <p>Speed: {fmtNum(p.speed ?? p.vehicleSpeed, 0)} km/h</p>}
                  <button onClick={() => onSelectTruck(p)} className="mt-1 text-blue-600 underline text-xs">View Details</button>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Root Component
// ────────────────────────────────────────────────────────────────────────────

const FLEET_TABS = [
  { id: 'overview', label: '🏠 Fleet Overview' },
  { id: 'map', label: '🗺 Live Map' },
];

export default function TelemetryAnalytics() {
  const [fleetTab, setFleetTab] = useState('overview');
  const [positions, setPositions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selectedTruck, setSelectedTruck] = useState(null);
  const [loadingFleet, setLoadingFleet] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const pollRef = useRef(null);

  const loadFleet = useCallback(async () => {
    try {
      const [posRes, sumRes] = await Promise.allSettled([
        telemetryAPI.latestPositions(),
        telemetryAPI.fleetSummary(),
      ]);
      if (posRes.status === 'fulfilled') {
        const d = posRes.value.data;
        setPositions(Array.isArray(d) ? d : (d?.positions || d?.trucks || []));
      }
      if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data);
    } finally {
      setLoadingFleet(false);
    }
  }, []);

  useEffect(() => {
    loadFleet();
    pollRef.current = setInterval(loadFleet, 30000);
    return () => clearInterval(pollRef.current);
  }, [loadFleet]);

  // When a truck is selected, try to find its latest position data
  const handleSelectTruck = (truckData) => {
    console.log('[DEBUG] Selected truck data:', truckData);
    setSelectedTruck(truckData);
    setFleetTab('overview');
  };

  const handleBack = () => setSelectedTruck(null);

  // Filter positions for search
  const filteredPositions = positions.filter((p) => {
    if (!searchTerm) return true;
    const reg = (p.registrationNumber || p.numberPlate || p._id || '').toLowerCase();
    return reg.includes(searchTerm.toLowerCase());
  });

  const lastPosForTruck = selectedTruck
    ? positions.find((p) => {
        const pKey = p.registrationNumber || p.numberPlate || p._id;
        const sKey = selectedTruck.registrationNumber || selectedTruck.numberPlate || selectedTruck._id;
        return pKey && sKey && pKey === sKey;
      }) || selectedTruck
    : null;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-2xl mx-auto">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Fleet Intelligence</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {positions.length} truck{positions.length !== 1 ? 's' : ''} tracked · Auto-refreshes every 30s
          </p>
        </div>

        {/* Search / truck selector */}
        {!selectedTruck && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search truck number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border rounded-xl px-4 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>
            )}
          </div>
        )}

        <button onClick={loadFleet}
          className="flex items-center gap-1 px-3 py-1.5 border rounded-xl text-sm hover:bg-gray-50 text-gray-600">
          ↺ Refresh
        </button>
      </div>

      {/* No data banner */}
      {!loadingFleet && positions.length === 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-semibold text-amber-800">No telemetry data found</p>
            <p className="text-amber-700 mt-1">
              The telemetry database is empty. Please go to{' '}
              <a href="/admin" className="underline font-medium">Admin → Monthly Report</a>{' '}
              and upload your iAlert CSV file to populate Fleet Intelligence.
            </p>
          </div>
        </div>
      )}

      {loadingFleet ? (
        <LoadingSpinner />
      ) : selectedTruck ? (
        /* Per-truck detail view */
        <TruckDetail
          truck={selectedTruck}
          lastPos={lastPosForTruck}
          onBack={handleBack}
        />
      ) : (
        /* Fleet-wide view */
        <>
          <TabBar tabs={FLEET_TABS} active={fleetTab} onChange={setFleetTab} />
          <div className="bg-white rounded-2xl border p-4">
            {fleetTab === 'overview' && (
              <FleetOverview
                summary={summary}
                positions={filteredPositions}
                onSelectTruck={handleSelectTruck}
              />
            )}
            {fleetTab === 'map' && (
              <LiveMapTab positions={positions} onSelectTruck={handleSelectTruck} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
