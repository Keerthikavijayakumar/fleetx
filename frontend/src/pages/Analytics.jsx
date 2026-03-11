import { useState, useEffect } from 'react';
import { analyticsAPI, trucksAPI, routesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
    LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { HiOutlineChartBar, HiOutlineUpload, HiOutlineDocumentText, HiOutlineLocationMarker, HiOutlineMap, HiOutlineTruck, HiOutlineLightningBolt } from 'react-icons/hi';

const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            {payload.map((item, i) => (
                <p key={i} className="text-sm font-semibold" style={{ color: item.color }}>{item.name}: {item.value}</p>
            ))}
        </div>
    );
};

const Analytics = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [fuelData, setFuelData] = useState([]);
    const [maintenanceCostData, setMaintenanceCostData] = useState([]);
    const [co2Data, setCo2Data] = useState([]);
    const [deliveryTimeData, setDeliveryTimeData] = useState([]);
    const [trafficData, setTrafficData] = useState([]);
    const [trucks, setTrucks] = useState([]);
    const [routes, setRoutes] = useState([]);
    const [selectedTruck, setSelectedTruck] = useState(null);
    const [truckDetails, setTruckDetails] = useState(null);
    const [isTruckLoading, setIsTruckLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadMessage, setUploadMessage] = useState('');

    useEffect(() => { fetchAllData(); }, []);

    const fetchAllData = async () => {
        try {
            const [fuel, mCost, co2, delivery, traffic, tks, rts] = await Promise.all([
                analyticsAPI.getFuelConsumption(),
                analyticsAPI.getMaintenanceCost(),
                analyticsAPI.getCO2Emissions(),
                isAdmin ? analyticsAPI.getDeliveryTime() : Promise.resolve({ data: [] }),
                isAdmin ? analyticsAPI.getTrafficImpact() : Promise.resolve({ data: [] }),
                !isAdmin ? trucksAPI.getAll() : Promise.resolve({ data: [] }),
                !isAdmin ? routesAPI.getAll() : Promise.resolve({ data: [] })
            ]);
            setFuelData(fuel.data);
            setMaintenanceCostData(mCost.data);
            setCo2Data(co2.data);
            if (isAdmin) {
                setDeliveryTimeData(delivery.data);
                setTrafficData(traffic.data);
            } else {
                setTrucks(tks.data.filter(t => t.engineStatus === 'running' || t.speed > 0));
                setRoutes(rts.data);
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const handleTruckSelect = async (truck) => {
        setSelectedTruck(truck);
        setIsTruckLoading(true);

        let location = 'Bangalore, Karnataka';
        let road = 'NH44';
        let eta = '32 minutes';

        if (truck.latitude && truck.longitude) {
            try {
                const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
                if (key && key !== 'PASTE_KEY_HERE') {
                    const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${truck.latitude},${truck.longitude}&key=${key}`);
                    const geoData = await geoRes.json();
                    if (geoData.results && geoData.results.length > 0) {
                        const comps = geoData.results[0].address_components;
                        const routeComp = comps.find(c => c.types.includes('route'));
                        const cityComp = comps.find(c => c.types.includes('locality'));
                        if (routeComp) road = routeComp.long_name;
                        if (cityComp) location = cityComp.long_name;
                        if (road === 'NH44' && geoData.results[0].formatted_address) {
                             road = geoData.results[0].formatted_address.split(',')[0];
                        }
                    }
                }
            } catch (err) {
                console.error('Geocoding error', err);
            }
        }

        const assignedRoute = routes.find(r => r._id === truck.routeId || r._id === truck.assignedRoute);
        if (assignedRoute && truck.speed > 0) {
            const distanceLeft = Math.max(10, assignedRoute.distance - 20);
            eta = `${Math.round((distanceLeft / truck.speed) * 60)} minutes`; 
        } else if (truck.speed > 0) {
            eta = `${Math.round(450 / truck.speed)} minutes`; 
        } else {
            eta = 'N/A (Stopped)';
        }

        const capacity = 150; 
        const fuelLevel = truck.fuelLevel || 100;
        const usedPercentage = (100 - fuelLevel) / 100;
        let fuelUsed = (capacity * usedPercentage).toFixed(0);
        if (fuelUsed < 0) fuelUsed = 0;
        if (fuelLevel >= 100) fuelUsed = 0;
        const co2 = (fuelUsed * 2.68).toFixed(1);

        setTruckDetails({
            location,
            road,
            eta,
            fuelUsed,
            co2
        });
        
        setIsTruckLoading(false);
    };

    const handleCSVUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        setUploadMessage('');
        try {
            const formData = new FormData();
            formData.append('csvFile', file);
            formData.append('type', 'trucks');
            const res = await analyticsAPI.uploadCSV(formData);
            setUploadMessage(`✅ ${res.data.message}`);
            if (res.data.data) {
                if (res.data.data.fuelConsumption) setFuelData(res.data.data.fuelConsumption);
                if (res.data.data.co2Emissions) setCo2Data(res.data.data.co2Emissions);
                if (res.data.data.deliveryTime) setDeliveryTimeData(res.data.data.deliveryTime);
                if (res.data.data.maintenanceCost) setMaintenanceCostData(res.data.data.maintenanceCost);
            }
        } catch (err) {
            setUploadMessage('❌ Upload failed: ' + (err.response?.data?.message || err.message));
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-10 h-10 border-3 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                        <HiOutlineChartBar className="text-red-500" /> Data Analytics
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Fleet analytics & data insights</p>
                </div>
            </div>

            {/* CSV Upload (Admin only) */}
            {isAdmin && (
                <div className="card p-5 mb-6">
                    <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <HiOutlineUpload className="text-red-500" /> Upload Truck Analytics CSV
                    </h3>
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                        <div className="flex items-center gap-3 mb-3">
                            <HiOutlineDocumentText className="text-blue-500 text-xl" />
                            <div>
                                <p className="text-sm font-medium text-gray-800">Truck Operational Data</p>
                                <p className="text-xs text-gray-500">Format: date,truck_id,distance_km,fuel_used_liters,cost_rs,co2_kg,delivery_time_min</p>
                            </div>
                        </div>
                        <label className="btn-secondary text-sm cursor-pointer inline-flex items-center gap-2">
                            <HiOutlineUpload /> Choose CSV File
                            <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
                        </label>
                    </div>
                    {uploadMessage && (
                        <p className={`mt-3 text-sm ${uploadMessage.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>{uploadMessage}</p>
                    )}
                    {uploading && <p className="mt-3 text-sm text-amber-600">Processing CSV file...</p>}
                </div>
            )}

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="card p-5">
                    <h3 className="text-sm font-semibold text-gray-800 mb-4">Fuel Consumption Trend</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={fuelData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Line type="monotone" dataKey="fuelConsumed" name="Fuel (L)" stroke="#3b82f6" strokeWidth={2.5} dot={{ fill: '#3b82f6', r: 3 }} activeDot={{ r: 5 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div className="card p-5">
                    <h3 className="text-sm font-semibold text-gray-800 mb-4">Cost Analysis</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={maintenanceCostData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="cost" name="Cost (₹)" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="card p-5">
                    <h3 className="text-sm font-semibold text-gray-800 mb-4">CO₂ Emissions</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={co2Data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <defs>
                                <linearGradient id="co2Gradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="co2" name="CO₂ (kg)" stroke="#ef4444" strokeWidth={2.5} fill="url(#co2Gradient)" dot={{ fill: '#ef4444', r: 3 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {isAdmin && (
                    <div className="card p-5">
                        <h3 className="text-sm font-semibold text-gray-800 mb-4">Delivery Time Analysis</h3>
                        <ResponsiveContainer width="100%" height={280}>
                            <LineChart data={deliveryTimeData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend />
                                <Line type="monotone" dataKey="avgDeliveryTime" name="Avg Time (min)" stroke="#22c55e" strokeWidth={2.5} dot={{ fill: '#22c55e', r: 3 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {isAdmin && (
                    <div className="card p-5 lg:col-span-2">
                        <h3 className="text-sm font-semibold text-gray-800 mb-4">Traffic Impact Analysis</h3>
                        <div className="flex items-center justify-center">
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie data={trafficData} cx="50%" cy="50%" outerRadius={100} innerRadius={50} dataKey="value" nameKey="name"
                                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: '#94a3b8' }}>
                                        {trafficData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {!isAdmin && (
                    <div className="lg:col-span-2 space-y-6 animate-fade-in mt-2 border-t border-gray-100 pt-6">
                        {/* Truck List Card */}
                        <div className="card p-5">
                            <h3 className="text-sm font-bold text-gray-800 mb-4">Running Trucks</h3>
                            {trucks.length === 0 ? (
                                <p className="text-sm text-gray-500">No trucks currently running.</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {trucks.map(truck => (
                                        <div 
                                            key={truck._id}
                                            onClick={() => handleTruckSelect(truck)}
                                            className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                                selectedTruck?._id === truck._id 
                                                ? 'border-blue-500 bg-blue-50/50 shadow-sm' 
                                                : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <HiOutlineTruck className={selectedTruck?._id === truck._id ? 'text-blue-600' : 'text-gray-400'} />
                                                <span className="text-sm font-bold text-gray-800">{truck.truckId}</span>
                                                <span className={`w-1.5 h-1.5 rounded-full ml-auto ${truck.speed > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                                            </div>
                                            <p className="text-xs text-gray-500 truncate pl-6">{truck.driverName}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Truck Analysis Card */}
                        {selectedTruck && (
                            <div className="card p-5 relative overflow-hidden">
                                {isTruckLoading ? (
                                    <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
                                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : null}
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl">
                                        <HiOutlineChartBar />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-gray-900">Truck Analysis: {selectedTruck.truckId}</h3>
                                        <p className="text-xs text-gray-500">{selectedTruck.driverName}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-400 font-medium tracking-wide uppercase">Location</p>
                                        <p className="text-[14px] font-bold text-gray-800 flex items-center gap-1.5">
                                            <HiOutlineLocationMarker className="text-rose-500 text-lg" /> {truckDetails?.location}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-400 font-medium tracking-wide uppercase">Current Road</p>
                                        <p className="text-[14px] font-bold text-gray-800 flex items-center gap-1.5">
                                            <HiOutlineMap className="text-blue-500 text-lg" /> {truckDetails?.road}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-400 font-medium tracking-wide uppercase">Speed / Status</p>
                                        <p className="text-[14px] font-bold text-gray-800 flex items-center gap-1.5">
                                            <HiOutlineLightningBolt className={selectedTruck.speed > 0 ? 'text-emerald-500 text-lg' : 'text-amber-500 text-lg'} /> {selectedTruck.speed} km/h 
                                            <span className="text-gray-400 font-medium ml-1">({selectedTruck.speed > 0 ? 'Moving' : 'Idle'})</span>
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-400 font-medium tracking-wide uppercase">Est. Time to Delivery</p>
                                        <p className="text-[14px] font-bold text-gray-800">{truckDetails?.eta}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-400 font-medium tracking-wide uppercase">Fuel Used</p>
                                        <p className="text-[14px] font-bold text-gray-800">{truckDetails?.fuelUsed} L <span className="text-gray-400 font-medium mx-1">({selectedTruck.fuelLevel?.toFixed(0)}% rem)</span></p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-400 font-medium tracking-wide uppercase">CO₂ Emission</p>
                                        <p className="text-[14px] font-bold text-emerald-600">{truckDetails?.co2} kg</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Analytics;
