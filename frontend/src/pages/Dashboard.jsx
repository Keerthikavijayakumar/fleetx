import { useState, useEffect } from 'react';
import { analyticsAPI, trucksAPI, routesAPI, emergencyAPI } from '../services/api';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import {
    HiOutlineTruck, HiOutlineMap, HiOutlineExclamation, HiOutlineLightningBolt,
    HiOutlineArrowRight, HiOutlineFire, HiOutlineCheckCircle, HiOutlineGlobe,
    HiOutlineClock, HiOutlineStatusOnline, HiOutlineChevronRight,
} from 'react-icons/hi';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const MiniTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-lg text-xs font-medium text-gray-700">
            {payload[0].value}
        </div>
    );
};

const Dashboard = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState({ totalTrucks: 0, activeTrucks: 0, totalRoutes: 0, maintenanceAlerts: 0 });
    const [trucks, setTrucks] = useState([]);
    const [recentRoutes, setRecentRoutes] = useState([]);
    const [maintenanceRecords, setMaintenanceRecords] = useState([]);
    const [fuelData, setFuelData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [emergencyAlerts, setEmergencyAlerts] = useState([]);

    useEffect(() => { 
        fetchAll(); 
        fetchEmergencies();

        const socket = io(window.location.origin.includes('localhost') ? 'http://localhost:5000' : '/');
        
        socket.on('emergencyAlert', (newAlert) => {
            setEmergencyAlerts(prev => [newAlert, ...prev]);
        });

        socket.on('emergencyResolved', (resolvedAlert) => {
            setEmergencyAlerts(prev => prev.filter(a => a._id !== resolvedAlert._id));
        });

        socket.on('truckUpdate', (liveTrucks) => {
            setTrucks(currentTrucks => {
                const updated = [...currentTrucks];
                liveTrucks.forEach(liveT => {
                    const idx = updated.findIndex(t => t.truckId === liveT.truckId);
                    if (idx !== -1) {
                        updated[idx] = { ...updated[idx], ...liveT };
                    }
                });
                return updated;
            });
        });

        return () => socket.disconnect();
    }, []);

    const fetchEmergencies = async () => {
        try {
            const res = await emergencyAPI.getAlerts();
            // res.data from axios contains the response body: { success: true, data: [...] }
            if (res.data?.data && Array.isArray(res.data.data)) {
                setEmergencyAlerts(res.data.data.filter(a => a.status === 'active'));
            } else {
                setEmergencyAlerts([]);
            }
        } catch (err) {
            console.error('Failed fetching emergencies', err);
        }
    };

    const handleResolveAlert = async (id) => {
        try {
            await emergencyAPI.resolveAlert(id);
            setEmergencyAlerts(prev => prev.filter(a => a._id !== id));
        } catch (err) {
            console.error('Failed to resolve alert', err);
        }
    };

    const fetchAll = async () => {
        try {
            const [statsRes, trucksRes, routesRes, maintRes, fuelRes] = await Promise.all([
                analyticsAPI.getDashboardStats(),
                trucksAPI.getAll(),
                routesAPI.getAll(),
                analyticsAPI.getDashboardStats(), // Placeholder for fetching maintenance
                analyticsAPI.getFuelConsumption(),
            ]);
            setStats(statsRes.data);
            setTrucks(trucksRes.data);
            setRecentRoutes(routesRes.data);
            setMaintenanceRecords(trucksRes.data.filter(t => t.status === 'maintenance'));
            setFuelData(fuelRes.data?.slice(-6) || []);
        } catch (err) {
            console.error('Dashboard fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const runningCount = trucks.filter(t => t.engineStatus === 'running').length;
    const idleCount = trucks.filter(t => t.engineStatus === 'idle').length;
    const offCount = trucks.filter(t => t.engineStatus === 'off').length;
    const maintCount = trucks.filter(t => t.status === 'maintenance').length;
    const lowFuelTrucks = trucks.filter(t => t.fuelLevel < 30);
    const utilization = trucks.length > 0 ? Math.round((trucks.filter(t => t.status === 'active').length / trucks.length) * 100) : 0;

    const sparkFuel = fuelData.length > 0 ? fuelData : [{ fuelConsumed: 120 }, { fuelConsumed: 95 }, { fuelConsumed: 140 }, { fuelConsumed: 110 }, { fuelConsumed: 130 }, { fuelConsumed: 105 }];
    const sparkRoutes = [{ v: 3 }, { v: 5 }, { v: 2 }, { v: 7 }, { v: 4 }, { v: 6 }];

    const fleetPie = [
        { name: 'Running', value: runningCount, color: '#22c55e' },
        { name: 'Idle', value: idleCount, color: '#f59e0b' },
        { name: 'Maintenance', value: maintCount, color: '#f97316' },
        { name: 'Off', value: offCount, color: '#ef4444' },
    ].filter(d => d.value > 0);

    const statCards = [
        {
            key: 'activeTrucks', label: 'Active Trucks', value: stats.activeTrucks,
            icon: HiOutlineTruck, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600',
            subtitle: `${trucks.filter(t=>t.engineStatus === 'running').length} online & sending location`, accent: 'emerald',
        },
        {
            key: 'totalRoutes', label: 'Total Routes', value: stats.totalRoutes,
            icon: HiOutlineMap, iconBg: 'bg-blue-100', iconColor: 'text-blue-600',
            subtitle: `${recentRoutes.length} active routes assigned`, accent: 'blue',
        },
        {
            key: 'maintenanceAlerts', label: 'Maintenance', value: stats.maintenanceAlerts,
            icon: HiOutlineExclamation, iconBg: 'bg-amber-100', iconColor: 'text-amber-600',
            subtitle: 'Trucks under maintenance', accent: 'amber',
        }
    ];

    const activities = [
        { icon: HiOutlineStatusOnline, text: 'Live simulation active', time: 'Every 5 sec', color: 'text-emerald-500', bg: 'bg-emerald-50' },
        { icon: HiOutlineTruck, text: `${runningCount} trucks running`, time: 'Real-time', color: 'text-blue-500', bg: 'bg-blue-50' },
        { icon: HiOutlineExclamation, text: `${stats.maintenanceAlerts} alerts pending`, time: 'Latest', color: 'text-amber-500', bg: 'bg-amber-50' },
        { icon: HiOutlineClock, text: `${stats.totalRoutes} routes planned`, time: 'All time', color: 'text-purple-500', bg: 'bg-purple-50' },
    ];

    const SkeletonCard = () => (
        <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
                <div className="skeleton w-11 h-11" />
                <div className="skeleton w-14 h-8" />
            </div>
            <div className="skeleton w-24 h-4 mb-2" />
            <div className="skeleton w-16 h-3" />
        </div>
    );

    // Filter trucks needing maintenance dynamically
    const trucksNeedingMaintenance = trucks.filter(truck => {
        if (truck.status !== 'active') return false; // Only flag active trucks, not ones already in maintenance
        const distanceDriven = Math.max(0, (truck.totalDistance || 0) - (truck.lastServiceDistance || 0));
        const dateLast = truck.lastServiceDate ? new Date(truck.lastServiceDate) : new Date(truck.createdAt || Date.now());
        const daysSince = Math.floor((Date.now() - dateLast.getTime()) / (1000 * 60 * 60 * 24));
        return distanceDriven > 10000 || daysSince > 120;
    });

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="mb-7">
                <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Dashboard</h1>
                <p className="text-gray-400 text-sm mt-1">Welcome back, <span className="text-gray-600 font-medium">{user?.username}</span>. Here's your fleet overview.</p>
            </div>

            {/* Emergency Alerts Panel */}
            {emergencyAlerts.length > 0 && (
                <div className="mb-6 space-y-3">
                    {emergencyAlerts.map(alert => {
                        const assignedTruck = trucks.find(t => t.truckId === alert.truckId) || { driverName: alert.driverId };
                        return (
                            <div key={alert._id} className="bg-red-50 border-l-4 border-red-600 rounded-r-xl p-5 shadow-sm animate-shake">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                            <HiOutlineExclamation className="text-3xl text-red-600" />
                                        </div>
                                        <div>
                                            <h3 className="text-red-800 font-black text-lg tracking-wide">🚨 DRIVER EMERGENCY</h3>
                                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-red-700">
                                                <p><span className="font-semibold">Truck:</span> {alert.truckId}</p>
                                                <p><span className="font-semibold">Driver:</span> {assignedTruck.driverName}</p>
                                                <p><span className="font-semibold">Location:</span> {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}</p>
                                                <p><span className="font-semibold">Time:</span> {new Date(alert.timestamp).toLocaleTimeString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
                                        <a 
                                            href={`/live-tracking?truckId=${alert.truckId}`}
                                            className="flex-1 sm:flex-none text-center px-4 py-2 bg-white text-red-700 font-bold text-sm border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                                        >
                                            View Truck
                                        </a>
                                        <button 
                                            onClick={() => handleResolveAlert(alert._id)}
                                            className="flex-1 sm:flex-none px-4 py-2 bg-red-600 text-white font-bold text-sm rounded-lg hover:bg-red-700 shadow-md shadow-red-600/20 transition-all"
                                        >
                                            Resolve Alert
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Live Maintenance Alerts Panel */}
            {trucksNeedingMaintenance.length > 0 && (
                <div className="mb-6 space-y-3">
                    {trucksNeedingMaintenance.map(truck => {
                        const distanceDriven = Math.max(0, (truck.totalDistance || 0) - (truck.lastServiceDistance || 0));
                        const dateLast = truck.lastServiceDate ? new Date(truck.lastServiceDate) : new Date(truck.createdAt || Date.now());
                        const daysSince = Math.floor((Date.now() - dateLast.getTime()) / (1000 * 60 * 60 * 24));
                        
                        return (
                            <div key={`maint-${truck._id}`} className="bg-amber-50 border-l-4 border-amber-500 rounded-r-xl p-4 shadow-sm animate-fade-in">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <HiOutlineExclamation className="text-2xl text-amber-600" />
                                        </div>
                                        <div>
                                            <h3 className="text-amber-800 font-bold text-base">Service Required: {truck.truckId}</h3>
                                            <p className="text-sm text-amber-700 mt-0.5">
                                                Exceeded service limits. Driven <strong>{Math.round(distanceDriven).toLocaleString()} km</strong> over <strong>{daysSince} days</strong> since last service.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                        <button 
                                            onClick={async () => {
                                                if (window.confirm(`Mark truck ${truck.truckId} as being in maintenance?`)) {
                                                    try {
                                                        await trucksAPI.update(truck._id, { status: 'maintenance' });
                                                        // Update local state to reflect change immediately
                                                        setTrucks(prev => prev.map(t => t._id === truck._id ? { ...t, status: 'maintenance' } : t));
                                                    } catch (err) {
                                                        alert('Failed to update truck status');
                                                    }
                                                }
                                            }}
                                            className="w-full sm:w-auto text-center px-4 py-2 bg-amber-600 text-white font-bold text-sm rounded-lg hover:bg-amber-700 shadow-sm transition-all"
                                        >
                                            Mark for Service
                                        </button>
                                        <a 
                                            href={`/live-tracking?truckId=${truck.truckId}`}
                                            className="w-full sm:w-auto text-center px-4 py-2 bg-white text-amber-700 font-bold text-sm border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
                                        >
                                            View Truck
                                        </a>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Row 1: Stats — grid-cols-1 md:grid-cols-3 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 stagger-children">
                {loading ? (
                    <>
                        <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
                    </>
                ) : (
                    statCards.map((card, idx) => (
                        <div key={card.key} className="card card-hover p-5 animate-slide-up" style={{ animationDelay: `${idx * 0.05}s` }}>
                            <div className="flex items-center justify-between mb-3">
                                <div className={`stat-icon ${card.iconBg} ${card.iconColor}`}>
                                    <card.icon />
                                </div>
                                <div className="text-right">
                                    <span className="text-2xl font-extrabold text-gray-900 animate-counter">
                                        {card.key === 'maintenanceAlerts' ? trucksNeedingMaintenance.length : card.value}
                                    </span>
                                </div>
                            </div>
                            <p className="text-sm font-semibold text-gray-700 mb-0.5">{card.label}</p>
                            <p className="text-xs text-gray-400">
                                {card.key === 'maintenanceAlerts' 
                                    ? (trucksNeedingMaintenance.length === 1 ? '1 truck flagged' : `${trucksNeedingMaintenance.length} trucks flagged`) 
                                    : card.subtitle}
                            </p>
                            {/* Mini sparkline */}
                            <div className="mt-3 h-8">
                                <ResponsiveContainer width="100%" height="100%" minHeight={0}>
                                    <AreaChart data={card.key === 'totalRoutes' ? sparkRoutes : sparkFuel}>
                                        <Area
                                            type="monotone"
                                            dataKey={card.key === 'totalRoutes' ? 'v' : 'fuelConsumed'}
                                            stroke={card.accent === 'emerald' ? '#22c55e' : card.accent === 'blue' ? '#3b82f6' : '#f59e0b'}
                                            fill={card.accent === 'emerald' ? 'rgba(34,197,94,0.08)' : card.accent === 'blue' ? 'rgba(59,130,246,0.08)' : 'rgba(245,158,11,0.08)'}
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Row 2: Fleet Overview Donut + Activity Timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Fleet Overview Donut */}
                <div className="card p-5 flex flex-col min-h-[340px]">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold text-gray-800">Fleet Overview</h3>
                        <span className="text-xs text-gray-400 font-medium">{trucks.length} total</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center min-h-[160px] relative">
                        <div className="w-full h-full absolute inset-0">
                            <ResponsiveContainer width="100%" height="100%" minHeight={0}>
                                <PieChart>
                                    <Pie
                                        data={fleetPie}
                                        cx="50%" cy="50%"
                                        innerRadius={55} outerRadius={75}
                                        paddingAngle={3}
                                        dataKey="value"
                                    >
                                        {fleetPie.map((entry, i) => (
                                            <Cell key={i} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<MiniTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center mt-1">
                                <p className="text-3xl font-extrabold text-gray-900 leading-none">{utilization}%</p>
                                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-1">Utilization</p>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-2 mt-4 pt-4 border-t border-gray-50">
                        {[
                            { label: 'Running', value: runningCount, color: 'bg-emerald-500' },
                            { label: 'Idle', value: idleCount, color: 'bg-amber-500' },
                            { label: 'Mainat.', value: maintCount, color: 'bg-orange-500' },
                            { label: 'Off', value: offCount, color: 'bg-red-500' },
                        ].map(s => (
                            <div key={s.label} className="flex items-center gap-2 text-xs">
                                <span className={`w-2.5 h-2.5 rounded-full ${s.color} shadow-sm`} />
                                <span className="text-gray-500 font-medium">{s.label}</span>
                                <span className="text-gray-900 font-bold ml-auto">{s.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Active Routes Table */}
                <div className="card p-5 lg:col-span-2 min-h-[340px] flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-gray-800">Active Assigned Routes</h3>
                        <a href="/route-planner" className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-0.5">
                            View routes <HiOutlineArrowRight className="text-[10px]" />
                        </a>
                    </div>
                    {recentRoutes.length > 0 ? (
                        <div className="overflow-x-auto flex-1">
                            <table className="table-dark w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="pb-2 font-semibold text-gray-500">Route Name</th>
                                        <th className="pb-2 font-semibold text-gray-500">Assigned Truck</th>
                                        <th className="pb-2 font-semibold text-gray-500">Distance</th>
                                        <th className="pb-2 font-semibold text-gray-500">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentRoutes.slice(0, 5).map(route => {
                                        const routeName = route.routeName || `${route.source} → ${route.destination}`;
                                        const assignedTruck = trucks.find(t => t.routeId === route._id || t.assignedRoute === route._id) || { truckId: 'Unassigned', driverName: '-' };
                                        return (
                                            <tr key={route._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                                                <td className="py-3 font-medium text-gray-800">{routeName}</td>
                                                <td className="py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-gray-800">{assignedTruck.truckId}</span>
                                                        <span className="text-xs text-gray-500 truncate max-w-[100px]">({assignedTruck.driverName})</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 font-medium text-blue-600">{route.distance} km</td>
                                                <td className="py-3">
                                                    <span className={`badge ${route.status === 'completed' ? 'badge-success' : route.status === 'in_progress' ? 'badge-primary' : 'badge-warning'}`}>
                                                        {route.status || 'Active'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center mb-3">
                                <HiOutlineMap className="text-2xl" />
                            </div>
                            <p className="text-sm font-semibold text-gray-700">No active routes</p>
                            <p className="text-xs text-gray-400 mt-1">Routes will appear here once planned and assigned.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Row 3: Live Tracking Status + Fuel Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Live Trucks */}
                <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            <span className="dot-pulse bg-emerald-500" /> Live Tracking
                        </h3>
                        <a href="/live-tracking" className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-0.5">
                            View map <HiOutlineArrowRight className="text-[10px]" />
                        </a>
                    </div>
                    <div className="space-y-2">
                        {trucks.filter(t => t.status === 'active').slice(0, 5).map(truck => (
                            <div key={truck._id} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50/70 hover:bg-gray-50 transition-colors">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white ${truck.engineStatus === 'running' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                                    🚛
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-gray-800">{truck.truckId}</span>
                                        <span className={`text-[10px] font-semibold capitalize px-1.5 py-0.5 rounded-full ${truck.engineStatus === 'running' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {truck.engineStatus}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 truncate">{truck.driverName}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold text-gray-700">{truck.speed} km/h</p>
                                    <p className={`text-[10px] font-semibold ${truck.fuelLevel > 50 ? 'text-emerald-600' : truck.fuelLevel > 20 ? 'text-amber-600' : 'text-red-600'}`}>
                                        ⛽ {truck.fuelLevel?.toFixed(0)}%
                                    </p>
                                </div>
                            </div>
                        ))}
                        {trucks.filter(t => t.status === 'active').length === 0 && (
                            <div className="text-center py-6 text-gray-400 text-sm">No active trucks</div>
                        )}
                    </div>
                </div>

                {/* Maintenance Alerts */}
                <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            <HiOutlineExclamation className="text-amber-500" /> Maintenance
                        </h3>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${maintenanceRecords.length > 0 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {maintenanceRecords.length} records
                        </span>
                    </div>
                    {maintenanceRecords.length === 0 ? (
                        <div className="text-center py-10">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                                <HiOutlineCheckCircle className="text-emerald-500 text-2xl" />
                            </div>
                            <p className="text-sm font-semibold text-emerald-700">All Clear</p>
                            <p className="text-xs text-gray-400 mt-1">No trucks currently under maintenance</p>
                        </div>
                    ) : (
                        <div className="space-y-2.5 max-h-[400px] overflow-y-auto">
                            {maintenanceRecords.map(truck => (
                                <div key={truck._id} className="p-3 rounded-xl border border-amber-100 bg-gradient-to-r from-amber-50 to-white">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-gray-800">{truck.truckId}</span>
                                            <span className="text-xs text-gray-400">•</span>
                                            <span className="text-xs text-gray-500">{truck.driverName}</span>
                                        </div>
                                        <span className={`text-xs font-extrabold capitalize px-2 py-0.5 rounded-full bg-amber-100 text-amber-700`}>
                                            In Progress
                                        </span>
                                    </div>
                                    <p className="text-xs text-amber-800 mb-1 line-clamp-2">
                                        <span className="font-semibold">Reason:</span> {truck.maintenanceHistory?.[0]?.description || 'Scheduled Maintenance'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default Dashboard;
