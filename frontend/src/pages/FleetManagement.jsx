import { useState, useEffect } from 'react';
import { routesAPI, trucksAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineTruck, HiOutlineX, HiOutlineExclamationCircle } from 'react-icons/hi';
import { getTruckDistanceSinceServiceKm, getTruckTotalDistanceKmFromRoutes } from '../utils/truckDistance';

const FleetManagement = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [trucks, setTrucks] = useState([]);
    const [routes, setRoutes] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingTruck, setEditingTruck] = useState(null);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({
        truckId: '', licensePlate: '', driverName: '', fuelEfficiency: '',
        tankCapacity: '', costPerLitre: '95', emissionFactor: '2.68', totalDistance: '0', status: 'active',
    });

    useEffect(() => { 
        fetchTrucks(); 
        
        const socket = io(window.location.origin.includes('localhost') ? 'http://localhost:5000' : '/');
        
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

    const fetchTrucks = async () => {
        try {
            const [trucksRes, routesRes] = await Promise.all([trucksAPI.getAll(), routesAPI.getAll()]);
            setTrucks(trucksRes.data);
            setRoutes(Array.isArray(routesRes.data) ? routesRes.data : []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const resetForm = () => {
        setForm({ truckId: '', licensePlate: '', driverName: '', fuelEfficiency: '', tankCapacity: '', costPerLitre: '95', emissionFactor: '2.68', totalDistance: '0', status: 'active' });
        setEditingTruck(null);
    };

    const openAdd = () => { resetForm(); setShowModal(true); };
    const openEdit = (truck) => {
        setForm({
            truckId: truck.truckId, licensePlate: truck.licensePlate, driverName: truck.driverName,
            fuelEfficiency: truck.fuelEfficiency, tankCapacity: truck.tankCapacity,
            costPerLitre: truck.costPerLitre, emissionFactor: truck.emissionFactor, totalDistance: Math.round(truck.totalDistance || 0), status: truck.status,
        });
        setEditingTruck(truck);
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = { ...form, fuelEfficiency: Number(form.fuelEfficiency), tankCapacity: Number(form.tankCapacity), costPerLitre: Number(form.costPerLitre), emissionFactor: Number(form.emissionFactor), totalDistance: Number(form.totalDistance) };
            if (editingTruck) {
                await trucksAPI.update(editingTruck._id, data);
            } else {
                await trucksAPI.create(data);
            }
            setShowModal(false);
            resetForm();
            fetchTrucks();
        } catch (err) {
            alert(err.response?.data?.message || 'Operation failed');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this truck?')) return;
        try { await trucksAPI.delete(id); fetchTrucks(); }
        catch (err) { alert('Delete failed'); }
    };

    return (
        <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Fleet Management</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage your trucks and drivers</p>
                </div>
                {isAdmin && (
                    <button onClick={openAdd} className="btn-primary flex items-center gap-2">
                        <HiOutlinePlus /> Add Truck
                    </button>
                )}
            </div>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="table-dark">
                        <thead>
                            <tr>
                                <th>Truck ID</th><th>License Plate</th><th>Driver</th><th>Fuel Eff. (km/l)</th>
                                <th>Tank (L)</th><th>Cost/L (₹)</th><th>CO₂/L (kg)</th><th>Total Dist (km)</th><th>Status</th>
                                {isAdmin && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={isAdmin ? 9 : 8} className="text-center py-8 text-gray-400">Loading...</td></tr>
                            ) : trucks.length === 0 ? (
                                <tr><td colSpan={isAdmin ? 9 : 8} className="text-center py-8 text-gray-400">No trucks found. Add your first truck.</td></tr>
                            ) : (
                                trucks.map((truck) => {
                                    const totalDistance = getTruckTotalDistanceKmFromRoutes(truck, routes);
                                    const distanceDriven = getTruckDistanceSinceServiceKm(truck, routes);
                                    const dateLast = truck.lastServiceDate ? new Date(truck.lastServiceDate) : new Date(truck.createdAt || Date.now());
                                    const daysSince = Math.floor((Date.now() - dateLast.getTime()) / (1000 * 60 * 60 * 24));
                                    const needsMaintenance = distanceDriven > 10000 || daysSince > 120;

                                    return (
                                        <tr key={truck._id}>
                                            <td className="font-semibold text-red-600">{truck.truckId}</td>
                                            <td>{truck.licensePlate}</td>
                                            <td>{truck.driverName}</td>
                                            <td>{truck.fuelEfficiency}</td>
                                            <td>{truck.tankCapacity}</td>
                                            <td>₹{truck.costPerLitre}</td>
                                            <td>{truck.emissionFactor}</td>
                                            <td>{Math.round(totalDistance).toLocaleString()} km</td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <span className={`badge ${truck.status === 'active' ? 'badge-success' : truck.status === 'maintenance' ? 'badge-warning' : 'badge-danger'}`}>
                                                        {truck.status}
                                                    </span>
                                                    {needsMaintenance && truck.status === 'active' && (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-100 px-2 py-0.5 rounded-md self-center">
                                                            <HiOutlineExclamationCircle className="text-sm" /> Service Due
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            {isAdmin && (
                                                <td>
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => openEdit(truck)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-all"><HiOutlinePencil /></button>
                                                        <button onClick={() => handleDelete(truck._id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"><HiOutlineTrash /></button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-gray-900">{editingTruck ? 'Edit Truck' : 'Add New Truck'}</h2>
                            <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><HiOutlineX className="text-xl" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block font-medium">Truck ID</label>
                                    <input type="text" value={form.truckId} onChange={(e) => setForm({ ...form, truckId: e.target.value })} className="input-field" required />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block font-medium">License Plate</label>
                                    <input type="text" value={form.licensePlate} onChange={(e) => setForm({ ...form, licensePlate: e.target.value })} className="input-field" required />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm text-gray-600 mb-1 block font-medium">Driver Name</label>
                                <input type="text" value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} className="input-field" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block font-medium">Fuel Efficiency (km/l)</label>
                                    <input type="number" step="0.1" value={form.fuelEfficiency} onChange={(e) => setForm({ ...form, fuelEfficiency: e.target.value })} className="input-field" required />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block font-medium">Tank Capacity (L)</label>
                                    <input type="number" value={form.tankCapacity} onChange={(e) => setForm({ ...form, tankCapacity: e.target.value })} className="input-field" required />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block font-medium">Cost per Litre (₹)</label>
                                    <input type="number" step="0.01" value={form.costPerLitre} onChange={(e) => setForm({ ...form, costPerLitre: e.target.value })} className="input-field" required />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block font-medium">Emission Factor (kg CO₂/L)</label>
                                    <input type="number" step="0.01" value={form.emissionFactor} onChange={(e) => setForm({ ...form, emissionFactor: e.target.value })} className="input-field" required />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block font-medium">Total Distance (km)</label>
                                    <input type="number" step="0.1" value={form.totalDistance} onChange={(e) => setForm({ ...form, totalDistance: e.target.value })} className="input-field" required />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block font-medium">Status</label>
                                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input-field">
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                        <option value="maintenance">Maintenance</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="submit" className="btn-primary flex-1">{editingTruck ? 'Update Truck' : 'Add Truck'}</button>
                                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FleetManagement;
