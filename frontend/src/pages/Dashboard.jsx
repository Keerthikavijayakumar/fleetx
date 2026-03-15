import { useState, useEffect, useMemo } from 'react';
import { analyticsAPI, trucksAPI, routesAPI, emergencyAPI, maintenanceAPI, authAPI } from '../services/api';
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
import { getTruckDistanceSinceServiceKm } from '../utils/truckDistance';

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
    const isAdmin = user?.role === 'admin';
    const isCrewMember = user?.role === 'driver' || user?.role === 'assistant';
    const showInlineAdminPanel = false;
    const [stats, setStats] = useState({ totalTrucks: 0, activeTrucks: 0, totalRoutes: 0, maintenanceAlerts: 0 });
    const [trucks, setTrucks] = useState([]);
    const [recentRoutes, setRecentRoutes] = useState([]);
    const [maintenanceRecords, setMaintenanceRecords] = useState([]);
    const [fuelData, setFuelData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [emergencyAlerts, setEmergencyAlerts] = useState([]);
    const [adminData, setAdminData] = useState(null);
    const [adminLoading, setAdminLoading] = useState(false);
    const [adminFilters, setAdminFilters] = useState({
        search: '',
        truckStatus: '',
        emergencyStatus: 'active',
        tripStatus: '',
    });
    const [reportSection, setReportSection] = useState('trips');
    const [reportLoading, setReportLoading] = useState(false);
    const [adminSection, setAdminSection] = useState('overview');
    const [entrySaving, setEntrySaving] = useState(false);
    const [entryMessage, setEntryMessage] = useState('');
    const [adminActionMessage, setAdminActionMessage] = useState('');
    const [truckFormSaving, setTruckFormSaving] = useState(false);
    const [tripFormSaving, setTripFormSaving] = useState(false);
    const [userFormSaving, setUserFormSaving] = useState(false);
    const [truckForm, setTruckForm] = useState({
        truckId: '',
        licensePlate: '',
        driverName: '',
        fuelEfficiency: '',
        tankCapacity: '',
        costPerLitre: '',
        emissionFactor: '',
        status: 'active',
    });
    const [tripForm, setTripForm] = useState({
        source: '',
        destination: '',
        truckId: '',
        driverId: '',
        assistantId: '',
        distance: '',
        duration: '',
        tollCount: 0,
        tollPrice: 0,
        tripStartTime: '',
        tripEndTime: '',
        status: 'scheduled',
    });
    const [userForm, setUserForm] = useState({
        username: '',
        email: '',
        password: '',
        role: 'driver',
    });
    const [tripEditSavingId, setTripEditSavingId] = useState('');
    const [tripEdits, setTripEdits] = useState({});
    const [entryForm, setEntryForm] = useState({
        date: new Date().toISOString().slice(0, 10),
        truckId: '',
        distanceKm: '',
        fuelUsedLiters: '',
        costRs: '',
        co2Kg: '',
        deliveryTimeMin: '',
    });
    const [selectedOverviewTruckId, setSelectedOverviewTruckId] = useState('');
    const [adminPages, setAdminPages] = useState({
        trucks: 1,
        people: 1,
        trips: 1,
        maintenance: 1,
        emergency: 1,
        fuel: 1,
    });

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

    useEffect(() => {
        if (!isAdmin) return;
        fetchAdminFullData();
    }, [isAdmin, adminFilters]);

    useEffect(() => {
        setAdminPages({
            trucks: 1,
            people: 1,
            trips: 1,
            maintenance: 1,
            emergency: 1,
            fuel: 1,
        });
    }, [adminFilters, adminData]);

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
            const [statsRes, trucksRes, routesRes, fuelRes] = await Promise.all([
                analyticsAPI.getDashboardStats(),
                trucksAPI.getAll(),
                routesAPI.getAll(),
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

    const fetchAdminFullData = async () => {
        try {
            setAdminLoading(true);
            const res = await analyticsAPI.getAdminFullAccess({ ...adminFilters, limit: 120 });
            setAdminData(res.data);
        } catch (err) {
            console.error('Failed to fetch admin control panel data', err);
        } finally {
            setAdminLoading(false);
        }
    };

    const updateTruckStatus = async (truckId, status) => {
        try {
            await trucksAPI.update(truckId, { status });
            await Promise.all([fetchAll(), fetchAdminFullData()]);
        } catch (err) {
            console.error('Failed to update truck status', err);
            alert('Failed to update truck status');
        }
    };

    const markMaintenanceCompleted = async (record) => {
        try {
            await maintenanceAPI.update(record._id, { status: 'completed' });
            await fetchAdminFullData();
        } catch (err) {
            console.error('Failed to update maintenance record', err);
            alert('Failed to update maintenance record');
        }
    };

    const downloadAdminReport = async (format = 'word') => {
        try {
            setReportLoading(true);
            const response = await analyticsAPI.getAdminReport({
                ...adminFilters,
                format,
                section: reportSection,
                limit: 500,
            });

            const disposition = response.headers?.['content-disposition'] || '';
            const match = disposition.match(/filename="([^"]+)"/);
            const extension = format === 'word' ? 'doc' : format === 'csv' ? 'csv' : 'json';
            const fallbackName = `admin-${reportSection}-report.${extension}`;
            const fileName = match?.[1] || fallbackName;

            const blob = new Blob([response.data], {
                type: format === 'word' ? 'application/msword' : format === 'csv' ? 'text/csv' : 'application/json',
            });

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to download report', err);
            alert('Failed to download report');
        } finally {
            setReportLoading(false);
        }
    };

    const submitManualEntry = async (e) => {
        e.preventDefault();
        try {
            setEntrySaving(true);
            setEntryMessage('');
            await analyticsAPI.createAdminEntry({
                ...entryForm,
                distanceKm: Number(entryForm.distanceKm || 0),
                fuelUsedLiters: Number(entryForm.fuelUsedLiters || 0),
                costRs: Number(entryForm.costRs || 0),
                co2Kg: Number(entryForm.co2Kg || 0),
                deliveryTimeMin: Number(entryForm.deliveryTimeMin || 0),
            });

            setEntryMessage('Data saved and synced with backend.');
            setEntryForm((prev) => ({
                ...prev,
                distanceKm: '',
                fuelUsedLiters: '',
                costRs: '',
                co2Kg: '',
                deliveryTimeMin: '',
            }));
            await Promise.all([fetchAdminFullData(), fetchAll()]);
        } catch (err) {
            console.error('Failed to save analytics entry', err);
            setEntryMessage('Failed to save data. Please check required fields.');
        } finally {
            setEntrySaving(false);
        }
    };

    const createTruckFromAdmin = async (e) => {
        e.preventDefault();
        try {
            setTruckFormSaving(true);
            setAdminActionMessage('');
            await trucksAPI.create({
                ...truckForm,
                fuelEfficiency: Number(truckForm.fuelEfficiency || 0),
                tankCapacity: Number(truckForm.tankCapacity || 0),
                costPerLitre: Number(truckForm.costPerLitre || 0),
                emissionFactor: Number(truckForm.emissionFactor || 0),
            });
            setTruckForm({
                truckId: '',
                licensePlate: '',
                driverName: '',
                fuelEfficiency: '',
                tankCapacity: '',
                costPerLitre: '',
                emissionFactor: '',
                status: 'active',
            });
            setAdminActionMessage('Truck added successfully. It is now available in truck dropdowns.');
            await Promise.all([fetchAll(), fetchAdminFullData()]);
        } catch (err) {
            console.error('Failed to add truck', err);
            setAdminActionMessage('Failed to add truck.');
        } finally {
            setTruckFormSaving(false);
        }
    };

    const createTripFromAdmin = async (e) => {
        e.preventDefault();
        try {
            setTripFormSaving(true);
            setAdminActionMessage('');
            await routesAPI.plan({
                ...tripForm,
                distance: Number(tripForm.distance || 0),
                tollCount: Number(tripForm.tollCount || 0),
                tollPrice: Number(tripForm.tollPrice || 0),
                tripStartTime: tripForm.tripStartTime ? new Date(tripForm.tripStartTime).toISOString() : null,
                tripEndTime: tripForm.tripEndTime ? new Date(tripForm.tripEndTime).toISOString() : null,
            });
            setTripForm({
                source: '',
                destination: '',
                truckId: '',
                driverId: '',
                assistantId: '',
                distance: '',
                duration: '',
                tollCount: 0,
                tollPrice: 0,
                tripStartTime: '',
                tripEndTime: '',
                status: 'scheduled',
            });
            setAdminActionMessage('Trip added successfully.');
            await Promise.all([fetchAll(), fetchAdminFullData()]);
        } catch (err) {
            console.error('Failed to add trip', err);
            setAdminActionMessage('Failed to add trip.');
        } finally {
            setTripFormSaving(false);
        }
    };

    const createUserFromAdmin = async (e, role) => {
        e.preventDefault();
        try {
            setUserFormSaving(true);
            setAdminActionMessage('');
            await authAPI.adminCreateUser({ ...userForm, role });
            setUserForm({ username: '', email: '', password: '', role: 'driver' });
            setAdminActionMessage(`${role === 'assistant' ? 'Assistant' : 'Driver'} added successfully.`);
            await fetchAdminFullData();
        } catch (err) {
            console.error('Failed to add user', err);
            setAdminActionMessage('Failed to add user.');
        } finally {
            setUserFormSaving(false);
        }
    };

    const setTripEditField = (trip, field, value) => {
        setTripEdits((prev) => ({
            ...prev,
            [trip._id]: {
                driverId: trip.driverId?._id || '',
                assistantId: trip.assistantId?._id || '',
                tollCount: trip.tollCount || 0,
                tollPrice: trip.tollPrice || 0,
                tripStartTime: trip.tripStartTime ? new Date(trip.tripStartTime).toISOString().slice(0, 16) : '',
                tripEndTime: trip.tripEndTime ? new Date(trip.tripEndTime).toISOString().slice(0, 16) : '',
                status: trip.status || 'scheduled',
                ...(prev[trip._id] || {}),
                [field]: value,
            },
        }));
    };

    const saveTripEdit = async (trip) => {
        try {
            setTripEditSavingId(trip._id);
            const draft = tripEdits[trip._id] || {};
            await routesAPI.update(trip._id, {
                driverId: draft.driverId || null,
                assistantId: draft.assistantId || null,
                tollCount: Number(draft.tollCount || 0),
                tollPrice: Number(draft.tollPrice || 0),
                tripStartTime: draft.tripStartTime ? new Date(draft.tripStartTime).toISOString() : null,
                tripEndTime: draft.tripEndTime ? new Date(draft.tripEndTime).toISOString() : null,
                status: draft.status || 'scheduled',
            });
            await Promise.all([fetchAdminFullData(), fetchAll()]);
        } catch (err) {
            console.error('Failed to update trip details', err);
            alert('Failed to update trip details');
        } finally {
            setTripEditSavingId('');
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

    const adminSummary = adminData?.summary;
    const adminRows = adminData?.data || {};
    const pageSize = 5;

    const getPaginationMeta = (key, rows) => {
        const total = rows.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const currentPage = Math.min(adminPages[key] || 1, totalPages);
        const start = (currentPage - 1) * pageSize;
        const paginated = rows.slice(start, start + pageSize);
        return { total, totalPages, currentPage, paginated };
    };

    const renderPagination = (key, meta) => (
        <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-gray-500">Page {meta.currentPage} of {meta.totalPages}</span>
            <div className="flex gap-1">
                <button
                    onClick={() => setAdminPages((prev) => ({ ...prev, [key]: Math.max(1, meta.currentPage - 1) }))}
                    disabled={meta.currentPage <= 1}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
                >
                    Prev
                </button>
                <button
                    onClick={() => setAdminPages((prev) => ({ ...prev, [key]: Math.min(meta.totalPages, meta.currentPage + 1) }))}
                    disabled={meta.currentPage >= meta.totalPages}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
                >
                    Next
                </button>
            </div>
        </div>
    );

    const trucksMeta = getPaginationMeta('trucks', adminRows.trucks || []);
    const peopleMeta = getPaginationMeta('people', [...(adminRows.drivers || []), ...(adminRows.assistants || [])]);
    const tripsMeta = getPaginationMeta('trips', adminRows.trips || []);
    const maintenanceMeta = getPaginationMeta('maintenance', adminRows.maintenanceRecords || []);
    const emergencyMeta = getPaginationMeta('emergency', adminRows.emergencyAlerts || []);
    const fuelMeta = getPaginationMeta('fuel', adminRows.fuelLogs || []);

    const adminSummaryCards = adminSummary
        ? [
            { key: 'totalTrucks', label: 'Total Trucks', description: 'All trucks registered in fleet', value: adminSummary.totalTrucks },
            { key: 'activeTrucks', label: 'Active Trucks', description: 'Trucks currently available for trips', value: adminSummary.activeTrucks },
            { key: 'trucksInMaintenance', label: 'In Maintenance', description: 'Trucks under maintenance workflow', value: adminSummary.trucksInMaintenance },
            { key: 'totalDrivers', label: 'Total Drivers', description: 'Registered users with driver role', value: adminSummary.totalDrivers },
            { key: 'totalDistanceTravelled', label: 'Distance Travelled (km)', description: 'Cumulative trip distance tracked', value: adminSummary.totalDistanceTravelled?.toLocaleString() || 0 },
            { key: 'totalFuelConsumed', label: 'Fuel Consumed (L)', description: 'Cumulative fleet fuel usage', value: adminSummary.totalFuelConsumed?.toLocaleString() || 0 },
            { key: 'activeEmergencyAlerts', label: 'Active Emergencies', description: 'Open emergency alerts requiring action', value: adminSummary.activeEmergencyAlerts },
        ]
        : [];

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
    const trucksNeedingMaintenance = useMemo(() => {
        return trucks.filter((truck) => {
            if (truck.status !== 'active') return false; // Only flag active trucks, not ones already in maintenance
            const distanceDriven = getTruckDistanceSinceServiceKm(truck, recentRoutes);
            const dateLast = truck.lastServiceDate ? new Date(truck.lastServiceDate) : new Date(truck.createdAt || Date.now());
            const daysSince = Math.floor((Date.now() - dateLast.getTime()) / (1000 * 60 * 60 * 24));
            return distanceDriven > 10000 || daysSince > 120;
        });
    }, [trucks, recentRoutes]);

    const tripPerformance = useMemo(() => {
        return recentRoutes.reduce((acc, route) => {
            acc.estimatedFuel += Number(route.estimated?.fuelConsumed ?? route.fuelConsumed ?? 0);
            acc.realtimeFuel += Number(route.realtime?.fuelConsumed ?? 0);
            acc.estimatedDuration += Number(route.estimated?.durationMinutes ?? 0);
            acc.realtimeDuration += Number(route.realtime?.durationMinutes ?? 0);
            acc.estimatedCost += Number(route.estimated?.totalCost ?? route.totalTripCost ?? 0);
            acc.realtimeCost += Number(route.realtime?.totalCost ?? 0);
            acc.travelPlaces += route.source && route.destination ? 1 : 0;
            return acc;
        }, {
            estimatedFuel: 0,
            realtimeFuel: 0,
            estimatedDuration: 0,
            realtimeDuration: 0,
            estimatedCost: 0,
            realtimeCost: 0,
            travelPlaces: 0,
        });
    }, [recentRoutes]);

    const myUserId = user?._id || user?.id;
    const myTrips = useMemo(() => {
        if (!myUserId) return [];
        return recentRoutes.filter((route) => {
            const driverId = route.driverId?._id || route.driverId;
            const assistantId = route.assistantId?._id || route.assistantId;
            return String(driverId) === String(myUserId) || String(assistantId) === String(myUserId);
        });
    }, [recentRoutes, myUserId]);

    const myTrucks = useMemo(() => {
        const map = new Map();
        myTrips.forEach((route) => {
            const truck = route.truckId;
            const key = String(truck?._id || truck?.truckId || truck?.licensePlate || route.registrationNumber || 'UNKNOWN');
            if (!map.has(key)) {
                map.set(key, {
                    id: key,
                    label: truck?.licensePlate || truck?.truckId || route.registrationNumber || 'Unassigned',
                });
            }
        });
        return Array.from(map.values());
    }, [myTrips]);

    const myTripsForSelectedTruck = useMemo(() => {
        if (!selectedOverviewTruckId) return myTrips;
        return myTrips.filter((trip) => {
            const truck = trip.truckId;
            const tripKey = String(truck?._id || truck?.truckId || truck?.licensePlate || trip.registrationNumber || '');
            return tripKey === String(selectedOverviewTruckId);
        });
    }, [myTrips, selectedOverviewTruckId]);

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="mb-7">
                <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Dashboard</h1>
                <p className="text-gray-400 text-sm mt-1">Welcome back, <span className="text-gray-600 font-medium">{user?.username}</span>. Here's your fleet overview.</p>
            </div>

            {isCrewMember && (
                <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="card p-5 lg:col-span-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                            <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">My Trips (Driver / Assistant View)</p>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">Filter by truck:</span>
                                <select
                                    value={selectedOverviewTruckId}
                                    onChange={(e) => setSelectedOverviewTruckId(e.target.value)}
                                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
                                >
                                    <option value="">All My Trucks</option>
                                    {myTrucks.map((truck) => (
                                        <option key={truck.id} value={truck.id}>{truck.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="space-y-2 max-h-56 overflow-auto">
                            {myTripsForSelectedTruck.length === 0 ? (
                                <p className="text-xs text-gray-400">No trips available for the selected truck.</p>
                            ) : myTripsForSelectedTruck.slice(0, 50).map((trip) => (
                                <div key={trip._id} className="border border-gray-100 rounded-lg p-2">
                                    <p className="text-sm font-semibold text-gray-900">{trip.source} → {trip.destination}</p>
                                    <p className="text-xs text-gray-500">Lorry: {trip.truckId?.licensePlate || trip.truckId?.truckId || trip.registrationNumber || 'N/A'} • Distance: {trip.distanceKm || trip.distance || 0} km • Status: {trip.status || 'scheduled'}</p>
                                    <p className="text-xs text-gray-500">Driver: {trip.driverId?.username || 'Unassigned'} • Assistant: {trip.assistantId?.username || 'Unassigned'}</p>
                                    <p className="text-xs text-gray-500">Start: {trip.tripStartTime ? new Date(trip.tripStartTime).toLocaleString() : '-'} • End: {trip.tripEndTime ? new Date(trip.tripEndTime).toLocaleString() : '-'}</p>
                                    <p className="text-xs text-gray-500">Trip Cost: Rs.{Math.round(Number(trip.realtime?.totalCost ?? trip.estimated?.totalCost ?? trip.totalTripCost ?? trip.fuelCost ?? 0)).toLocaleString()}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {!isCrewMember && isAdmin && showInlineAdminPanel && (
                <div className="mb-6 card p-5 border border-blue-100">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                        <div>
                            <h2 className="text-lg font-extrabold text-gray-900">Admin Control Panel</h2>
                            <p className="text-sm text-gray-500">Overview first. Use dropdown navigation to add trucks, trips, drivers, and assistants.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={adminSection}
                                onChange={(e) => setAdminSection(e.target.value)}
                                className="px-2 py-2 border border-gray-200 rounded-lg text-xs"
                            >
                                <option value="overview">Overview</option>
                                <option value="add-truck">Add Truck Data</option>
                                <option value="add-trip">Add Trip Data</option>
                                <option value="add-driver">Add Driver Details</option>
                                <option value="add-assistant">Add Assistant Details</option>
                            </select>
                            <select
                                value={reportSection}
                                onChange={(e) => setReportSection(e.target.value)}
                                className="px-2 py-2 border border-gray-200 rounded-lg text-xs"
                            >
                                <option value="summary">Report: Summary</option>
                                <option value="trucks">Report: Trucks</option>
                                <option value="drivers">Report: Drivers</option>
                                <option value="assistants">Report: Assistants</option>
                                <option value="trips">Report: Trip Operational Report</option>
                                <option value="fuel-logs">Report: Fuel Logs</option>
                                <option value="maintenance">Report: Maintenance</option>
                                <option value="delivery-status">Report: Delivery Status</option>
                                <option value="emergencies">Report: Emergencies</option>
                                <option value="analytics">Report: Analytics</option>
                                <option value="all">Report: Full Dataset</option>
                            </select>
                            <button
                                onClick={() => downloadAdminReport('word')}
                                disabled={reportLoading}
                                className="px-3 py-2 text-xs font-bold rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-60"
                            >
                                Download Word Report
                            </button>
                            <button
                                onClick={fetchAdminFullData}
                                className="px-3 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                            >
                                Refresh Data
                            </button>
                        </div>
                    </div>

                    {adminActionMessage && (
                        <p className="text-xs mb-3 text-blue-700 bg-blue-50 border border-blue-100 px-3 py-2 rounded-lg">{adminActionMessage}</p>
                    )}

                    {adminSection === 'add-truck' && (
                        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-md">
                            <h3 className="text-sm font-bold text-gray-800 mb-2">Add Truck Data</h3>
                            <p className="text-xs text-gray-500 mb-3">Once saved, this truck appears in dropdowns across admin trip forms and route pages.</p>
                            <form onSubmit={createTruckFromAdmin} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                <input type="text" placeholder="Truck ID" value={truckForm.truckId} onChange={(e) => setTruckForm((p) => ({ ...p, truckId: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <input type="text" placeholder="License Plate" value={truckForm.licensePlate} onChange={(e) => setTruckForm((p) => ({ ...p, licensePlate: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <input type="text" placeholder="Driver Name" value={truckForm.driverName} onChange={(e) => setTruckForm((p) => ({ ...p, driverName: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <select value={truckForm.status} onChange={(e) => setTruckForm((p) => ({ ...p, status: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm">
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="maintenance">Maintenance</option>
                                </select>
                                <input type="number" min="0" step="0.01" placeholder="Fuel Efficiency" value={truckForm.fuelEfficiency} onChange={(e) => setTruckForm((p) => ({ ...p, fuelEfficiency: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <input type="number" min="0" step="0.01" placeholder="Tank Capacity" value={truckForm.tankCapacity} onChange={(e) => setTruckForm((p) => ({ ...p, tankCapacity: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <input type="number" min="0" step="0.01" placeholder="Cost Per Litre" value={truckForm.costPerLitre} onChange={(e) => setTruckForm((p) => ({ ...p, costPerLitre: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <input type="number" min="0" step="0.01" placeholder="Emission Factor" value={truckForm.emissionFactor} onChange={(e) => setTruckForm((p) => ({ ...p, emissionFactor: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <button type="submit" disabled={truckFormSaving} className="px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 md:col-span-4">{truckFormSaving ? 'Saving Truck...' : 'Save Truck'}</button>
                            </form>
                        </div>
                    )}

                    {adminSection === 'add-trip' && (
                        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-md">
                            <h3 className="text-sm font-bold text-gray-800 mb-2">Add Trip Data</h3>
                            <p className="text-xs text-gray-500 mb-3">Create trip with truck, driver, assistant, toll and schedule data.</p>
                            <form onSubmit={createTripFromAdmin} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                <input type="text" placeholder="Source" value={tripForm.source} onChange={(e) => setTripForm((p) => ({ ...p, source: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <input type="text" placeholder="Destination" value={tripForm.destination} onChange={(e) => setTripForm((p) => ({ ...p, destination: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <select value={tripForm.truckId} onChange={(e) => setTripForm((p) => ({ ...p, truckId: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required>
                                    <option value="">Select Truck</option>
                                    {(adminRows.trucks || []).map((truck) => (
                                        <option key={truck._id} value={truck._id}>{truck.truckId} - {truck.licensePlate}</option>
                                    ))}
                                </select>
                                <select value={tripForm.driverId} onChange={(e) => setTripForm((p) => ({ ...p, driverId: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm">
                                    <option value="">Select Driver</option>
                                    {(adminRows.drivers || []).map((driver) => (
                                        <option key={driver._id} value={driver._id}>{driver.username}</option>
                                    ))}
                                </select>
                                <select value={tripForm.assistantId} onChange={(e) => setTripForm((p) => ({ ...p, assistantId: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm">
                                    <option value="">Select Assistant</option>
                                    {(adminRows.assistants || []).map((assistant) => (
                                        <option key={assistant._id} value={assistant._id}>{assistant.username}</option>
                                    ))}
                                </select>
                                <input type="number" min="0" step="0.01" placeholder="Distance (km)" value={tripForm.distance} onChange={(e) => setTripForm((p) => ({ ...p, distance: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                                <input type="text" placeholder="Duration (e.g. 4h 20m)" value={tripForm.duration} onChange={(e) => setTripForm((p) => ({ ...p, duration: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                                <select value={tripForm.status} onChange={(e) => setTripForm((p) => ({ ...p, status: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm">
                                    <option value="scheduled">Scheduled</option>
                                    <option value="in_transit">In Transit</option>
                                    <option value="completed">Completed</option>
                                    <option value="delayed">Delayed</option>
                                </select>
                                <input type="number" min="0" step="1" placeholder="Toll Count" value={tripForm.tollCount} onChange={(e) => setTripForm((p) => ({ ...p, tollCount: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                                <input type="number" min="0" step="0.01" placeholder="Toll Price" value={tripForm.tollPrice} onChange={(e) => setTripForm((p) => ({ ...p, tollPrice: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                                <input type="datetime-local" value={tripForm.tripStartTime} onChange={(e) => setTripForm((p) => ({ ...p, tripStartTime: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                                <input type="datetime-local" value={tripForm.tripEndTime} onChange={(e) => setTripForm((p) => ({ ...p, tripEndTime: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                                <button type="submit" disabled={tripFormSaving} className="px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 md:col-span-4">{tripFormSaving ? 'Saving Trip...' : 'Save Trip'}</button>
                            </form>
                        </div>
                    )}

                    {adminSection === 'add-driver' && (
                        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-md">
                            <h3 className="text-sm font-bold text-gray-800 mb-2">Add Driver Details</h3>
                            <p className="text-xs text-gray-500 mb-3">Create new driver profile with personal details.</p>
                            <form onSubmit={(e) => createUserFromAdmin(e, 'driver')} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                <input type="text" placeholder="Full Name" value={userForm.username} onChange={(e) => setUserForm((p) => ({ ...p, username: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <input type="email" placeholder="Email" value={userForm.email} onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <input type="password" placeholder="Password" value={userForm.password} onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <button type="submit" disabled={userFormSaving} className="px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">{userFormSaving ? 'Saving...' : 'Save Driver'}</button>
                            </form>
                        </div>
                    )}

                    {adminSection === 'add-assistant' && (
                        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-md">
                            <h3 className="text-sm font-bold text-gray-800 mb-2">Add Assistant Details</h3>
                            <p className="text-xs text-gray-500 mb-3">Create new assistant profile with personal details.</p>
                            <form onSubmit={(e) => createUserFromAdmin(e, 'assistant')} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                <input type="text" placeholder="Full Name" value={userForm.username} onChange={(e) => setUserForm((p) => ({ ...p, username: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <input type="email" placeholder="Email" value={userForm.email} onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <input type="password" placeholder="Password" value={userForm.password} onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))} className="px-2 py-2 border border-gray-200 rounded-lg text-sm" required />
                                <button type="submit" disabled={userFormSaving} className="px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">{userFormSaving ? 'Saving...' : 'Save Assistant'}</button>
                            </form>
                        </div>
                    )}

                    {adminSection !== 'overview' ? null : (
                        <>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                        <input
                            type="text"
                            value={adminFilters.search}
                            onChange={(e) => setAdminFilters((prev) => ({ ...prev, search: e.target.value }))}
                            placeholder="Search trucks, users, trips..."
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                        <select
                            value={adminFilters.truckStatus}
                            onChange={(e) => setAdminFilters((prev) => ({ ...prev, truckStatus: e.target.value }))}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        >
                            <option value="">All Truck Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="maintenance">Maintenance</option>
                        </select>
                        <select
                            value={adminFilters.emergencyStatus}
                            onChange={(e) => setAdminFilters((prev) => ({ ...prev, emergencyStatus: e.target.value }))}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        >
                            <option value="">All Emergency Status</option>
                            <option value="active">Active</option>
                            <option value="resolved">Resolved</option>
                        </select>
                        <select
                            value={adminFilters.tripStatus}
                            onChange={(e) => setAdminFilters((prev) => ({ ...prev, tripStatus: e.target.value }))}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        >
                            <option value="">All Delivery Status</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="in_transit">In Transit</option>
                            <option value="delayed">Delayed</option>
                            <option value="completed">Completed</option>
                        </select>
                    </div>

                    {adminLoading ? (
                        <p className="text-sm text-gray-500">Loading full admin data...</p>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                                {adminSummaryCards.map((card) => (
                                    <div key={card.key} className="rounded-xl border border-gray-100 bg-gray-50 p-3 shadow-md">
                                        <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{card.label}</p>
                                        <p className="text-xl font-extrabold text-gray-900 mt-1">{card.value}</p>
                                        <p className="text-[11px] text-gray-500 mt-1">{card.description}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="rounded-xl border border-gray-100 p-3 shadow-md">
                                    <h3 className="text-sm font-bold text-gray-800 mb-2">Fleet Trucks ({adminRows.trucks?.length || 0})</h3>
                                    <p className="text-[11px] text-gray-500 mb-2">Quick status and control panel for each truck.</p>
                                    <div className="max-h-48 overflow-auto space-y-2">
                                        {trucksMeta.paginated.map((truck) => (
                                            <div key={truck._id} className="flex items-center justify-between border border-gray-100 rounded-lg p-2">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">{truck.truckId} • {truck.licensePlate}</p>
                                                    <p className="text-xs text-gray-500">{truck.driverName} • {truck.status}</p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button onClick={() => updateTruckStatus(truck._id, 'active')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700">Active</button>
                                                    <button onClick={() => updateTruckStatus(truck._id, 'maintenance')} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700">Maintenance</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {renderPagination('trucks', trucksMeta)}
                                </div>

                                <div className="rounded-xl border border-gray-100 p-3 shadow-md">
                                    <h3 className="text-sm font-bold text-gray-800 mb-2">Drivers & Assistants</h3>
                                    <p className="text-[11px] text-gray-500 mb-2">Assigned operations staff across all trips.</p>
                                    <div className="max-h-48 overflow-auto space-y-2">
                                        {peopleMeta.paginated.map((member) => (
                                            <div key={member._id} className="flex items-center justify-between border border-gray-100 rounded-lg p-2">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">{member.username}</p>
                                                    <p className="text-xs text-gray-500">{member.email}</p>
                                                </div>
                                                <span className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 text-slate-700 capitalize">{member.role}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {renderPagination('people', peopleMeta)}
                                </div>

                                <div className="rounded-xl border border-gray-100 p-3 shadow-md">
                                    <h3 className="text-sm font-bold text-gray-800 mb-2">Trips ({adminRows.trips?.length || 0})</h3>
                                    <p className="text-[11px] text-gray-500 mb-2">Per-trip crew assignment, tolls, timing, and cost details.</p>
                                    <div className="max-h-48 overflow-auto space-y-2">
                                        {tripsMeta.paginated.map((trip) => (
                                            <div key={trip._id} className="border border-gray-100 rounded-lg p-2">
                                                <p className="text-sm font-semibold text-gray-900">{trip.source} → {trip.destination}</p>
                                                <p className="text-xs text-gray-500">Truck: {trip.truckId?.truckId || 'N/A'} • Distance: {trip.distance || 0} km</p>
                                                <p className="text-xs text-gray-500">Driver: {trip.driverId?.username || 'Unassigned'} • Assistant: {trip.assistantId?.username || 'Unassigned'}</p>
                                                <p className="text-xs text-gray-500">Tolls: {trip.tollCount || 0} × {trip.tollPrice || 0} = {trip.tollTotalCost || 0} • Total Cost: {trip.totalTripCost || trip.fuelCost || 0}</p>
                                                <p className="text-xs text-gray-500">Start: {trip.tripStartTime ? new Date(trip.tripStartTime).toLocaleString() : '-'} • End: {trip.tripEndTime ? new Date(trip.tripEndTime).toLocaleString() : '-'}</p>

                                                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                                    <select
                                                        value={tripEdits[trip._id]?.driverId ?? trip.driverId?._id ?? ''}
                                                        onChange={(e) => setTripEditField(trip, 'driverId', e.target.value)}
                                                        className="px-2 py-1 border border-gray-200 rounded text-xs"
                                                    >
                                                        <option value="">Assign Driver</option>
                                                        {(adminRows.drivers || []).map((driver) => (
                                                            <option key={driver._id} value={driver._id}>{driver.username}</option>
                                                        ))}
                                                    </select>
                                                    <select
                                                        value={tripEdits[trip._id]?.assistantId ?? trip.assistantId?._id ?? ''}
                                                        onChange={(e) => setTripEditField(trip, 'assistantId', e.target.value)}
                                                        className="px-2 py-1 border border-gray-200 rounded text-xs"
                                                    >
                                                        <option value="">Assign Assistant</option>
                                                        {(adminRows.assistants || []).map((assistant) => (
                                                            <option key={assistant._id} value={assistant._id}>{assistant.username}</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        placeholder="Toll count"
                                                        value={tripEdits[trip._id]?.tollCount ?? trip.tollCount ?? 0}
                                                        onChange={(e) => setTripEditField(trip, 'tollCount', e.target.value)}
                                                        className="px-2 py-1 border border-gray-200 rounded text-xs"
                                                    />
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        placeholder="Toll price"
                                                        value={tripEdits[trip._id]?.tollPrice ?? trip.tollPrice ?? 0}
                                                        onChange={(e) => setTripEditField(trip, 'tollPrice', e.target.value)}
                                                        className="px-2 py-1 border border-gray-200 rounded text-xs"
                                                    />
                                                    <input
                                                        type="datetime-local"
                                                        value={tripEdits[trip._id]?.tripStartTime ?? (trip.tripStartTime ? new Date(trip.tripStartTime).toISOString().slice(0, 16) : '')}
                                                        onChange={(e) => setTripEditField(trip, 'tripStartTime', e.target.value)}
                                                        className="px-2 py-1 border border-gray-200 rounded text-xs"
                                                    />
                                                    <input
                                                        type="datetime-local"
                                                        value={tripEdits[trip._id]?.tripEndTime ?? (trip.tripEndTime ? new Date(trip.tripEndTime).toISOString().slice(0, 16) : '')}
                                                        onChange={(e) => setTripEditField(trip, 'tripEndTime', e.target.value)}
                                                        className="px-2 py-1 border border-gray-200 rounded text-xs"
                                                    />
                                                    <select
                                                        value={tripEdits[trip._id]?.status ?? trip.status ?? 'scheduled'}
                                                        onChange={(e) => setTripEditField(trip, 'status', e.target.value)}
                                                        className="px-2 py-1 border border-gray-200 rounded text-xs md:col-span-2"
                                                    >
                                                        <option value="scheduled">Scheduled</option>
                                                        <option value="in_transit">In Transit</option>
                                                        <option value="completed">Completed</option>
                                                        <option value="delayed">Delayed</option>
                                                    </select>
                                                    <button
                                                        onClick={() => saveTripEdit(trip)}
                                                        disabled={tripEditSavingId === trip._id}
                                                        className="px-2 py-1 rounded bg-blue-600 text-white text-xs font-semibold md:col-span-2 disabled:opacity-60"
                                                    >
                                                        {tripEditSavingId === trip._id ? 'Saving...' : 'Save Trip Details'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {renderPagination('trips', tripsMeta)}
                                </div>

                                <div className="rounded-xl border border-gray-100 p-3 shadow-md">
                                    <h3 className="text-sm font-bold text-gray-800 mb-2">Delivery Status</h3>
                                    <p className="text-[11px] text-gray-500 mb-2">Current stage distribution for all deliveries.</p>
                                    <div className="space-y-2">
                                        {(adminRows.deliveryStatus || []).map((item) => (
                                            <div key={item.status} className="flex items-center justify-between border border-gray-100 rounded-lg p-2">
                                                <span className="text-sm font-semibold text-gray-900 capitalize">{item.status.replace('_', ' ')}</span>
                                                <span className="text-sm font-extrabold text-blue-700">{item.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-100 p-3 shadow-md">
                                    <h3 className="text-sm font-bold text-gray-800 mb-2">Maintenance Records ({adminRows.maintenanceRecords?.length || 0})</h3>
                                    <p className="text-[11px] text-gray-500 mb-2">Service tasks, status, and completion tracking.</p>
                                    <div className="max-h-48 overflow-auto space-y-2">
                                        {maintenanceMeta.paginated.map((record) => (
                                            <div key={record._id} className="flex items-center justify-between border border-gray-100 rounded-lg p-2">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">{record.serviceType}</p>
                                                    <p className="text-xs text-gray-500">{record.truckId?.truckId || 'Unlinked truck'} • {record.status}</p>
                                                </div>
                                                {record.status !== 'completed' && (
                                                    <button
                                                        onClick={() => markMaintenanceCompleted(record)}
                                                        className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700"
                                                    >
                                                        Mark Completed
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {renderPagination('maintenance', maintenanceMeta)}
                                </div>

                                <div className="rounded-xl border border-gray-100 p-3 shadow-md">
                                    <h3 className="text-sm font-bold text-gray-800 mb-2">Emergency Alerts ({adminRows.emergencyAlerts?.length || 0})</h3>
                                    <p className="text-[11px] text-gray-500 mb-2">Incidents raised from live operations.</p>
                                    <div className="max-h-48 overflow-auto space-y-2">
                                        {emergencyMeta.paginated.map((alert) => (
                                            <div key={alert._id} className="flex items-center justify-between border border-gray-100 rounded-lg p-2">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">{alert.truckId}</p>
                                                    <p className="text-xs text-gray-500">{alert.message}</p>
                                                </div>
                                                {alert.status === 'active' ? (
                                                    <button
                                                        onClick={() => handleResolveAlert(alert._id)}
                                                        className="text-xs px-2 py-1 rounded bg-red-100 text-red-700"
                                                    >
                                                        Resolve
                                                    </button>
                                                ) : (
                                                    <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">Resolved</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {renderPagination('emergency', emergencyMeta)}
                                </div>

                                <div className="rounded-xl border border-gray-100 p-3 shadow-md">
                                    <h3 className="text-sm font-bold text-gray-800 mb-2">Fuel Logs ({adminRows.fuelLogs?.length || 0})</h3>
                                    <p className="text-[11px] text-gray-500 mb-2">Recent consumption entries recorded in system.</p>
                                    <div className="max-h-48 overflow-auto space-y-2">
                                        {fuelMeta.paginated.map((log) => (
                                            <div key={log._id} className="border border-gray-100 rounded-lg p-2">
                                                <p className="text-sm font-semibold text-gray-900">{log.truckId}</p>
                                                <p className="text-xs text-gray-500">{new Date(log.date).toLocaleDateString()} • {log.fuelUsedLiters} L • {log.distanceKm} km</p>
                                            </div>
                                        ))}
                                    </div>
                                    {renderPagination('fuel', fuelMeta)}
                                </div>
                            </div>
                        </>
                    )}
                        </>
                    )}
                </div>
            )}

            {/* Emergency Alerts Panel */}
            {!isCrewMember && emergencyAlerts.length > 0 && (
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
                                            <h3 className="text-red-800 font-black text-lg tracking-wide inline-flex items-center gap-1"><HiOutlineExclamation /> Driver Emergency</h3>
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
            {!isCrewMember && trucksNeedingMaintenance.length > 0 && (
                <div className="mb-6 space-y-3">
                    {trucksNeedingMaintenance.map(truck => {
                        const distanceDriven = getTruckDistanceSinceServiceKm(truck, recentRoutes);
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
            {!isCrewMember && <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 stagger-children">
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
                                <ResponsiveContainer width="100%" height={32} minHeight={0} minWidth={0}>
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
            </div>}

            {/* Trip Performance Summary */}
            {!isCrewMember && <div className="card p-5 mb-6">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-800">Trip Performance (Estimated vs Real-time)</h3>
                    <span className="text-xs text-gray-500">Travel places tracked: {tripPerformance.travelPlaces}</span>
                </div>
                <p className="text-[11px] text-gray-500 mb-3">Distance, fuel, time and cost analytics based on source-to-destination trips.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-[11px] text-gray-500">Fuel (L)</p>
                        <p className="text-sm font-bold text-gray-900">Est: {tripPerformance.estimatedFuel.toFixed(2)} • Live: {tripPerformance.realtimeFuel.toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-[11px] text-gray-500">Time (min)</p>
                        <p className="text-sm font-bold text-gray-900">Est: {tripPerformance.estimatedDuration.toFixed(0)} • Live: {tripPerformance.realtimeDuration.toFixed(0)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-[11px] text-gray-500">Cost (₹)</p>
                        <p className="text-sm font-bold text-gray-900">Est: {tripPerformance.estimatedCost.toFixed(0)} • Live: {tripPerformance.realtimeCost.toFixed(0)}</p>
                    </div>
                </div>
            </div>}

            {/* Row 2: Fleet Overview Donut + Activity Timeline */}
            {!isCrewMember && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Fleet Overview Donut */}
                <div className="card p-5 flex flex-col min-h-[340px]">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold text-gray-800">Fleet Overview</h3>
                        <span className="text-xs text-gray-400 font-medium">{trucks.length} total</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-2">Live utilization and operating-state breakdown.</p>
                    <div className="flex-1 flex items-center justify-center min-h-[160px] min-w-0 relative">
                        <div className="w-full h-[180px]">
                            <ResponsiveContainer width="100%" height={180} minHeight={0} minWidth={0}>
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
                        <h3 className="text-sm font-bold text-gray-800">Travel Places (Source → Destination)</h3>
                        <a href="/route-planner" className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-0.5">
                            View routes <HiOutlineArrowRight className="text-[10px]" />
                        </a>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-2">Latest routes with distance, estimated fuel/time/cost and real-time taken values.</p>
                    {recentRoutes.length > 0 ? (
                        <div className="overflow-x-auto flex-1">
                            <table className="table-dark w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="pb-2 font-semibold text-gray-500">Travel Place</th>
                                        <th className="pb-2 font-semibold text-gray-500">Assigned Truck</th>
                                        <th className="pb-2 font-semibold text-gray-500">Distance</th>
                                        <th className="pb-2 font-semibold text-gray-500">Fuel (Est / Live)</th>
                                        <th className="pb-2 font-semibold text-gray-500">Time (Est / Live)</th>
                                        <th className="pb-2 font-semibold text-gray-500">Cost (Est / Live)</th>
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
                                                <td className="py-3 text-xs text-gray-700">
                                                    {(route.estimated?.fuelConsumed ?? route.fuelConsumed ?? 0).toFixed(2)} L /
                                                    <span className="text-blue-700 font-semibold"> {(route.realtime?.fuelConsumed ?? 0).toFixed(2)} L</span>
                                                </td>
                                                <td className="py-3 text-xs text-gray-700">
                                                    {(route.estimated?.durationText ?? route.duration ?? '-')}
                                                    <span className="text-blue-700 font-semibold"> / {(route.realtime?.durationMinutes ?? 0).toFixed(0)} min</span>
                                                </td>
                                                <td className="py-3 text-xs text-gray-700">
                                                    ₹{Number(route.estimated?.totalCost ?? route.totalTripCost ?? 0).toFixed(0)} /
                                                    <span className="text-blue-700 font-semibold"> ₹{Number(route.realtime?.totalCost ?? 0).toFixed(0)}</span>
                                                </td>
                                                <td className="py-3">
                                                    <span className={`badge ${route.status === 'completed' ? 'badge-success' : route.status === 'in_transit' ? 'badge-primary' : route.status === 'delayed' ? 'badge-danger' : 'badge-warning'}`}>
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
            </div>}

            {/* Row 3: Live Tracking Status + Fuel Alerts */}
            {!isCrewMember && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
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
                    <p className="text-[11px] text-gray-500 mb-2">Current movement, speed, and fuel snapshot for active trucks.</p>
                    <div className="space-y-2">
                        {trucks.filter(t => t.status === 'active').slice(0, 5).map(truck => (
                            <div key={truck._id} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50/70 hover:bg-gray-50 transition-colors">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white ${truck.engineStatus === 'running' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                                    <HiOutlineTruck />
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
                                        Fuel {truck.fuelLevel?.toFixed(0)}%
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
                    <p className="text-[11px] text-gray-500 mb-2">Open and in-progress maintenance workload.</p>
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
            </div>}

        </div>
    );
};

export default Dashboard;
