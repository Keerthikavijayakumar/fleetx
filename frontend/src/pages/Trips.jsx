import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    HiOutlineClipboardList, 
    HiOutlineLocationMarker, 
    HiOutlineDocumentDownload,
    HiOutlineUser,
    HiOutlineUsers,
    HiOutlineTruck,
    HiOutlineClock,
    HiOutlineCurrencyRupee,
    HiChevronRight,
    HiChevronUp,
    HiChevronDown,
    HiOutlineSearch,
    HiOutlineCalendar
} from 'react-icons/hi';
import { 
    MapContainer, 
    TileLayer, 
    Polyline, 
    CircleMarker, 
    Popup, 
    useMap,
    ZoomControl 
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
    ResponsiveContainer, 
    BarChart, 
    XAxis, 
    YAxis, 
    Tooltip, 
    Bar, 
    PieChart, 
    Pie, 
    Cell 
} from 'recharts';
import { routesAPI, telemetryAPI } from '../services/api';
import { useLocation } from 'react-router-dom';

// Utility for fitting map bounds
const FitBounds = ({ positions }) => {
    const map = useMap();
    useEffect(() => {
        if (positions && positions.length > 0) {
            const validPositions = positions
                .map(p => [p.lat ?? p.latitude, p.lng ?? p.longitude])
                .filter(pos => !isNaN(pos[0]) && !isNaN(pos[1]));
            
            if (validPositions.length > 0) {
                const bounds = L.latLngBounds(validPositions);
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }, [positions, map]);
    return null;
};

const formatNumber = (num, decimals = 2) => {
    if (num === null || num === undefined) return '0.0';
    return Number(num).toFixed(decimals);
};

const formatMinutes = (mins) => {
    if (!mins) return '0h 0m';
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return `${h}h ${m}m`;
};

const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

const getTruckLabel = (trip) => 
    trip.truckId?.licensePlate 
    || trip.truckId?.truckId 
    || trip.registrationNumber 
    || 'N/A';

const statusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
        case 'completed': return 'bg-emerald-100 text-emerald-700';
        case 'in_transit': return 'bg-blue-100 text-blue-700';
        case 'delayed': return 'bg-rose-100 text-rose-700';
        default: return 'bg-gray-100 text-gray-700';
    }
};

const CHART_COLORS = ['#2563eb', '#d97706', '#7c3aed'];

const getHaversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

const flattenTripObject = (value, prefix = '') => {
    if (value === null || value === undefined) {
        return [{ key: prefix || 'value', value: '—' }];
    }
    if (typeof value !== 'object') {
        return [{ key: prefix || 'value', value: String(value) }];
    }
    if (Array.isArray(value)) {
        return [{ key: prefix || 'value', value: `Array(${value.length})` }];
    }

    let rows = [];
    Object.keys(value).forEach(k => {
        const val = value[k];
        const newKey = prefix ? `${prefix}.${k}` : k;
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
            rows = rows.concat(flattenTripObject(val, newKey));
        } else {
            rows.push({ key: newKey, value: Array.isArray(val) ? `Array(${val.length})` : String(val) });
        }
    });
    return rows;
};

const Trips = () => {
    const location = useLocation();
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [truckFilter, setTruckFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [selectedTripId, setSelectedTripId] = useState('');
    const [dataViewMode, setDataViewMode] = useState('visual');
    const detailsRef = useRef(null);
    
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsTrail, setGpsTrail] = useState([]);

    // Check for truck filter in URL on mount
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const truck = params.get('truck');
        if (truck) {
            setTruckFilter(truck);
        }
    }, [location]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                setError('');
                const tripsRes = await routesAPI.getAll();
                setTrips(Array.isArray(tripsRes.data) ? tripsRes.data : []);
            } catch (err) {
                setError(err.response?.data?.message || err.message || 'Failed to fetch trips');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const filteredTrips = useMemo(() => {
        if (!Array.isArray(trips)) return [];
        return trips.filter(t => {
            const matchesSearch = !search || 
                t.source?.toLowerCase().includes(search.toLowerCase()) || 
                t.destination?.toLowerCase().includes(search.toLowerCase()) ||
                getTruckLabel(t).toLowerCase().includes(search.toLowerCase());
            
            const matchesTruck = truckFilter === 'all' || getTruckLabel(t) === truckFilter;
            const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
            
            const tripStartTime = new Date(t.tripStartTime || t.createdAt);
            const matchesFrom = !fromDate || tripStartTime >= new Date(fromDate);
            const matchesTo = !toDate || tripStartTime <= new Date(new Date(toDate).setHours(23, 59, 59, 999));

            return matchesSearch && matchesTruck && matchesStatus && matchesFrom && matchesTo;
        });
    }, [trips, search, truckFilter, statusFilter, fromDate, toDate]);

    const selectedTrip = useMemo(() => {
        if (!selectedTripId || !Array.isArray(trips)) return null;
        return trips.find(t => t._id === selectedTripId) || null;
    }, [trips, selectedTripId]);

    // Auto-scroll on mobile when a trip is selected
    useEffect(() => {
        if (selectedTrip && window.innerWidth < 1280 && detailsRef.current) {
            const timer = setTimeout(() => {
                detailsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [selectedTrip]);

    // Fetch GPS trail for selected trip
    useEffect(() => {
        const fetchGps = async () => {
            if (!selectedTripId || !selectedTrip) {
                setGpsTrail([]);
                return;
            }

            setGpsLoading(true);
            try {
                const regNo = getTruckLabel(selectedTrip);
                if (regNo === 'N/A') {
                    setGpsTrail([]);
                    return;
                }
                
                const res = await telemetryAPI.gpsHistory({
                    registrationNumber: regNo,
                    from: selectedTrip.tripStartTime || selectedTrip.createdAt,
                    to: selectedTrip.tripEndTime || new Date()
                });
                const gpsData = Array.isArray(res.data) ? res.data : (res.data?.data || []);
                setGpsTrail(gpsData);

                // Distance fallback
                const currentDist = Number(selectedTrip.distanceKm || selectedTrip.distance || 0);
                if (currentDist === 0 && gpsData.length > 1) {
                    let calcDist = 0;
                    for (let i = 1; i < gpsData.length; i++) {
                        calcDist += getHaversineDistance(
                            gpsData[i-1].lat ?? gpsData[i-1].latitude, gpsData[i-1].lng ?? gpsData[i-1].longitude,
                            gpsData[i].lat ?? gpsData[i].latitude, gpsData[i].lng ?? gpsData[i].longitude
                        );
                    }
                    if (calcDist > 0.1) {
                         setTrips(prev => prev.map(t => t._id === selectedTripId ? { ...t, distanceKm: calcDist, distance: calcDist } : t));
                    }
                }
            } catch (err) {
                console.error('Failed to fetch GPS trail:', err);
                setGpsTrail([]);
            } finally {
                setGpsLoading(false);
            }
        };
        fetchGps();
    }, [selectedTripId, selectedTrip]);

    const metricCompareData = useMemo(() => {
        if (!selectedTrip) return [];
        const estDuration = Number(selectedTrip.estimatedDurationMinutes || 0);
        const actDuration = Number(selectedTrip.actualDurationMinutes ?? estDuration);
        const estFuel = Number(selectedTrip.estimatedFuelConsumed || selectedTrip.fuelConsumed || 0);
        const actFuel = Number(selectedTrip.actualFuelConsumed ?? estFuel);
        const estCost = Number(selectedTrip.estimatedFuelCost ?? selectedTrip.totalTripCost ?? 0);
        const actCost = Number(selectedTrip.actualTotalCost ?? estCost);

        return [
            { metric: 'Duration (Min)', estimated: estDuration, actual: actDuration },
            { metric: 'Fuel (L)', estimated: estFuel, actual: actFuel },
            { metric: 'Cost (Rs)', estimated: estCost / 10, actual: actCost / 10 } // scaled for chart
        ];
    }, [selectedTrip]);

    const costSplitData = useMemo(() => {
        if (!selectedTrip) return [];
        return [
            { name: 'Fuel', value: Number(selectedTrip.actualFuelCost ?? selectedTrip.fuelCost ?? 0) },
            { name: 'Toll', value: Number(selectedTrip.actualTollCost ?? selectedTrip.tollTotalCost ?? 0) },
            { name: 'Food/Other', value: Number(selectedTrip.actualFoodCost ?? selectedTrip.foodCost ?? 0) }
        ];
    }, [selectedTrip]);

    const completeTripDataRows = useMemo(() => {
        if (!selectedTrip) return [];
        return flattenTripObject(selectedTrip);
    }, [selectedTrip]);

    const generateTripReport = (trip) => {
        alert(`Generating detailed PDF report for Trip: ${trip.source} to ${trip.destination}`);
    };

    const truckOptions = useMemo(() => {
        const uniqueTrucks = [...new Set(trips.map(t => getTruckLabel(t)))].filter(t => t !== 'N/A');
        return uniqueTrucks;
    }, [trips]);

    return (
        <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto bg-gray-50/50 min-h-screen">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Trips</h1>
                    <p className="text-sm text-gray-500 font-medium">Past trips across all trucks with full trip analytics.</p>
                </div>
                <div className="flex items-center gap-2">
                   {trips.length > 0 && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-bold border border-blue-100 uppercase tracking-wider">{trips.length} Total Segments</span>}
                </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-3 flex items-center gap-3 overflow-x-auto no-scrollbar whitespace-nowrap lg:flex-wrap">
                <div className="relative flex-1 min-w-[200px] shrink-0 lg:shrink">
                    <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                        type="text"
                        placeholder="Search source, destination, truck..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
                
                <select 
                    value={truckFilter}
                    onChange={(e) => setTruckFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                    <option value="all">All Trucks</option>
                    {truckOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="in_transit">In Transit</option>
                    <option value="delayed">Delayed</option>
                    <option value="scheduled">Scheduled</option>
                </select>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <HiOutlineCalendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input 
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="pl-8 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder="From"
                        />
                    </div>
                    <span className="text-gray-400 text-[10px] font-bold">TO</span>
                    <div className="relative">
                        <HiOutlineCalendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input 
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="pl-8 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder="To"
                        />
                    </div>
                </div>

                {(search || truckFilter !== 'all' || statusFilter !== 'all' || fromDate || toDate) && (
                    <button 
                        onClick={() => {
                            setSearch('');
                            setTruckFilter('all');
                            setStatusFilter('all');
                            setFromDate('');
                            setToDate('');
                        }}
                        className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
                    >
                        Clear
                    </button>
                )}
            </div>

            {loading ? (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-10 text-center text-gray-400 text-sm">Loading trips...</div>
            ) : error ? (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-600">{error}</div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                    <div className={`xl:col-span-4 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col ${selectedTripId ? 'hidden xl:flex' : 'flex'}`}>
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                            <p className="text-sm font-bold text-gray-800 uppercase tracking-tight">Recent Segments</p>
                            <HiOutlineClipboardList className="text-gray-400" />
                        </div>
                        
                        <div className="max-h-[75vh] overflow-auto p-2 space-y-2 bg-gray-50/30">
                            {filteredTrips.length === 0 ? (
                                <div className="p-8 text-center text-xs text-gray-400 font-medium">No segments match your filters.</div>
                            ) : (
                                filteredTrips.map((trip) => {
                                    const selected = trip._id === selectedTripId;
                                    const tripDate = new Date(trip.tripStartTime || trip.createdAt);
                                    const displayDate = tripDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                                    const displayTime = tripDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

                                    return (
                                        <button
                                            key={trip._id}
                                            type="button"
                                            onClick={() => setSelectedTripId(trip._id)}
                                            className={`w-full text-left border rounded-xl p-3 transition-all relative overflow-hidden ${selected
                                                ? 'border-blue-400 bg-white shadow-md ring-1 ring-blue-50 z-10'
                                                : 'border-gray-100 bg-white hover:border-blue-200 hover:shadow-sm'
                                            }`}
                                        >
                                            {selected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-1.5 mb-1.5">
                                                        <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{displayDate}</span>
                                                        <span className="text-[10px] font-bold text-gray-400">@ {displayTime}</span>
                                                    </div>
                                                    <p className="text-xs font-black text-gray-800 line-clamp-1 uppercase tracking-tight">{trip.source} → {trip.destination}</p>
                                                </div>
                                                <div className="text-right flex flex-col items-end gap-1.5">
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${statusBadgeClass(trip.status)}`}>
                                                        {trip.status || 'scheduled'}
                                                    </span>
                                                    <p className="text-[11px] font-black text-blue-600">{formatNumber(trip.distanceKm || trip.distance || 0, 1)} km</p>
                                                </div>
                                            </div>
                                            <div className="mt-2.5 pt-2 flex items-center justify-between border-t border-gray-50">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center text-[10px] text-gray-500">
                                                        <HiOutlineUser />
                                                    </div>
                                                    <p className="text-[10px] font-bold text-gray-500">
                                                        <span className="text-gray-400 font-medium mr-1">T:</span>
                                                        <span className={selected ? 'text-blue-600' : 'text-gray-700'}>{getTruckLabel(trip)}</span>
                                                    </p>
                                                </div>
                                                <HiChevronRight className={`text-gray-300 transition-all ${selected ? 'translate-x-1 text-blue-400' : ''}`} />
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div 
                        ref={detailsRef}
                        className={`xl:col-span-8 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col ${selectedTripId ? 'flex' : 'hidden xl:flex'}`}
                    >
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 bg-white">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setSelectedTripId('')}
                                    className="xl:hidden p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                                >
                                    <HiChevronRight className="rotate-180" />
                                </button>
                                <p className="text-sm font-bold text-gray-800 uppercase tracking-tight">Trip Insight</p>
                            </div>
                            {selectedTrip && (
                                <button
                                    type="button"
                                    onClick={() => generateTripReport(selectedTrip)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-sm"
                                >
                                    <HiOutlineDocumentDownload /> Report
                                </button>
                            )}
                        </div>

                        {!selectedTrip ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-20 text-center space-y-4">
                                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-2xl">🚛</div>
                                <div>
                                    <p className="text-sm font-bold text-gray-800">No Trip Selected</p>
                                    <p className="text-xs text-gray-400 mt-1">Select a segment from the list to view detailed GPS trails, fuel metrics, and performance analytics.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 space-y-4 overflow-auto max-h-[85vh]">
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                    <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3">
                                        <p className="text-[10px] uppercase text-gray-400 font-black tracking-widest mb-1">Distance</p>
                                        <p className="text-lg font-black text-gray-900 leading-tight">{formatNumber(selectedTrip.distanceKm || selectedTrip.distance || 0, 1)} <span className="text-xs text-gray-400 font-bold ml-0.5">km</span></p>
                                    </div>
                                    <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3">
                                        <p className="text-[10px] uppercase text-gray-400 font-black tracking-widest mb-1">Duration</p>
                                        <p className="text-lg font-black text-gray-900 leading-tight">{formatMinutes(selectedTrip.actualDurationMinutes ?? selectedTrip.estimatedDurationMinutes)}</p>
                                    </div>
                                    <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3">
                                        <p className="text-[10px] uppercase text-gray-400 font-black tracking-widest mb-1">Fuel Used</p>
                                        <p className="text-lg font-black text-emerald-600 leading-tight">{formatNumber(selectedTrip.actualFuelConsumed ?? selectedTrip.fuelConsumed ?? 0, 1)} <span className="text-xs text-gray-400 font-bold ml-0.5">L</span></p>
                                    </div>
                                    <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3">
                                        <p className="text-[10px] uppercase text-gray-400 font-black tracking-widest mb-1">Status</p>
                                        <p className="text-lg font-black text-blue-600 leading-tight uppercase text-[14px] mt-1 tracking-tighter">{selectedTrip.status || 'scheduled'}</p>
                                    </div>
                                </div>

                                {/* Leaflet Map Section */}
                                <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm relative group">
                                    <div className="px-4 py-2 bg-white border-b border-gray-50 flex justify-between items-center relative z-10">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <HiOutlineLocationMarker className="text-blue-500" />
                                            GPS Journey Trail
                                        </p>
                                        {gpsLoading && <span className="text-[10px] text-blue-500 animate-pulse font-bold tracking-tighter">FETCHING SATELLITE DATA...</span>}
                                    </div>
                                    <div className="h-80 sm:h-96 w-full relative bg-gray-100 rounded-xl overflow-hidden shadow-inner">
                                        {!gpsLoading && gpsTrail.length === 0 ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2 p-10 text-center">
                                                <div className="text-4xl filter grayscale opacity-20">🛰️</div>
                                                <p className="text-xs font-black text-gray-400 uppercase tracking-tighter">No GPS Breadcrumbs Found</p>
                                                <p className="text-[9px] font-medium max-w-[200px]">Telemetry data unavailable for this time frame. Please verify iAlert sensor status.</p>
                                            </div>
                                        ) : (
                                            <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ height: '100%', width: '100%' }}>
                                                <TileLayer 
                                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                    attribution='&copy; OpenStreetMap'
                                                />
                                                {(() => {
                                                    const sanitizedTrail = gpsTrail
                                                        .map(p => [p.lat ?? p.latitude, p.lng ?? p.longitude])
                                                        .filter(pos => !isNaN(pos[0]) && !isNaN(pos[1]));
                                                    
                                                    if (sanitizedTrail.length === 0) return null;

                                                    return (
                                                        <>
                                                            <FitBounds positions={sanitizedTrail} />
                                                            <Polyline positions={sanitizedTrail} color="#2563eb" weight={4} opacity={0.7} />
                                                            <CircleMarker center={sanitizedTrail[0]} radius={6} color="#10b981" weight={2} fillOpacity={1}>
                                                                <Popup className="text-[10px] font-bold">START: {selectedTrip.source}</Popup>
                                                            </CircleMarker>
                                                            <CircleMarker center={sanitizedTrail[sanitizedTrail.length - 1]} radius={6} color="#ef4444" weight={2} fillOpacity={1}>
                                                                <Popup className="text-[10px] font-bold">END: {selectedTrip.destination}</Popup>
                                                            </CircleMarker>
                                                        </>
                                                    );
                                                })()}
                                            </MapContainer>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                    <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/30">
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Route Metadata</p>
                                            <HiOutlineLocationMarker className="text-gray-300" />
                                        </div>
                                        <div className="space-y-2.5 text-[11px]">
                                            <div className="flex justify-between border-b border-gray-100 pb-1.5">
                                                <span className="text-gray-500 font-medium">Source Point</span>
                                                <span className="text-gray-900 font-bold max-w-[150px] text-right truncate">{selectedTrip.source}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-gray-100 pb-1.5">
                                                <span className="text-gray-500 font-medium">Destination</span>
                                                <span className="text-gray-900 font-bold max-w-[150px] text-right truncate">{selectedTrip.destination}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-gray-100 pb-1.5">
                                                <span className="text-gray-500 font-medium">Start Time</span>
                                                <span className="text-gray-900 font-bold">{formatDateTime(selectedTrip.tripStartTime || selectedTrip.createdAt)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500 font-medium">Carbon Footprint</span>
                                                <span className="text-emerald-700 font-black">{formatNumber(selectedTrip.carbonEmission, 2)} kg CO2</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/30">
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Crew & Vehicle</p>
                                            <HiOutlineTruck className="text-gray-300" />
                                        </div>
                                        <div className="space-y-2.5 text-[11px]">
                                            <div className="flex justify-between border-b border-gray-100 pb-1.5">
                                                <span className="text-gray-500 font-medium">Primary Truck</span>
                                                <span className="text-blue-700 font-black">{getTruckLabel(selectedTrip)}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-gray-100 pb-1.5">
                                                <span className="text-gray-500 font-medium">Duty Driver</span>
                                                <span className="text-gray-900 font-bold">{selectedTrip.driverId?.fullName || 'Unassigned'}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-gray-100 pb-1.5">
                                                <span className="text-gray-500 font-medium">Avg Speed</span>
                                                <span className="text-gray-900 font-bold">{selectedTrip.avgSpeedKmph || '—'} km/h</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500 font-medium">Traffic Severity</span>
                                                <span className={`font-black ${selectedTrip.trafficLevel === 'High' ? 'text-rose-600' : 'text-emerald-600'}`}>{selectedTrip.trafficLevel || 'Low'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="border border-gray-100 rounded-2xl p-4 bg-white shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Realtime Cost vs Estimate</p>
                                        <div className="flex gap-4">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                                <span className="text-[9px] font-black text-gray-500 uppercase">Est</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                <span className="text-[9px] font-black text-gray-500 uppercase">Act</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="h-60">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={metricCompareData} barGap={8}>
                                                <XAxis dataKey="metric" tick={{ fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                                <YAxis hide />
                                                <Tooltip 
                                                    cursor={{ fill: '#f8fafc' }}
                                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px', padding: '8px' }}
                                                />
                                                <Bar dataKey="estimated" fill="#3b82f6" radius={[4, 4, 4, 4]} barSize={30} />
                                                <Bar dataKey="actual" fill="#10b981" radius={[4, 4, 4, 4]} barSize={30} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="border border-gray-100 rounded-2xl p-4 bg-white shadow-sm">
                                    <div className="flex items-center justify-between gap-2 mb-4">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Complete Telemetry Object</p>
                                        <div className="inline-flex items-center rounded-lg border border-gray-100 p-0.5 bg-gray-50">
                                            <button
                                                type="button"
                                                onClick={() => setDataViewMode('visual')}
                                                className={`px-3 py-1 text-[9px] font-black uppercase rounded-md transition-all ${dataViewMode === 'visual' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                            >
                                                Table
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDataViewMode('text')}
                                                className={`px-3 py-1 text-[9px] font-black uppercase rounded-md transition-all ${dataViewMode === 'text' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                            >
                                                JSON
                                            </button>
                                        </div>
                                    </div>

                                    {dataViewMode === 'visual' ? (
                                        <div className="max-h-80 overflow-auto border border-gray-50 rounded-xl no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
                                            <table className="min-w-full text-[10px] min-w-[400px]">
                                                <thead className="sticky top-0 bg-gray-50 z-20 shadow-sm">
                                                    <tr className="text-left text-gray-400 border-b border-gray-100 uppercase tracking-widest">
                                                        <th className="py-2.5 px-3 font-black">Parameter</th>
                                                        <th className="py-2.5 px-3 font-black text-right">Value</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {completeTripDataRows.map((row, idx) => (
                                                        <tr key={`${row.key}-${idx}`} className="hover:bg-blue-50/30 transition-colors">
                                                            <td className="py-2 px-3 text-gray-500 font-mono tracking-tighter">{row.key}</td>
                                                            <td className="py-2 px-3 text-gray-800 font-bold text-right break-all">{row.value}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="relative group">
                                            <pre className="text-[10px] leading-5 overflow-auto max-h-80 whitespace-pre-wrap break-all p-4 rounded-xl bg-gray-900 text-blue-300 font-mono shadow-inner border border-gray-800">
                                                {JSON.stringify(selectedTrip, null, 2)}
                                            </pre>
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                 <span className="text-[8px] font-black text-blue-600 bg-blue-900 border border-blue-800 px-2 py-1 rounded">JS_VIEW</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Trips;
