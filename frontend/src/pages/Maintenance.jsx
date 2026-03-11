import { useState, useEffect } from 'react';
import { maintenanceAPI, trucksAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineExclamation, HiOutlineX, HiOutlineInformationCircle, HiOutlineClock, HiOutlineMap, HiOutlineCog } from 'react-icons/hi';

import { io } from 'socket.io-client';

const Maintenance = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [records, setRecords] = useState([]);
    const [trucks, setTrucks] = useState([]);
    const [overdueRecords, setOverdueRecords] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({
        truckId: '', serviceType: '', lastServiceDate: '', nextServiceDue: '', odometer: '', notes: '', cost: '', status: 'pending',
    });

    useEffect(() => { 
        fetchData(); 
        
        const socket = io(window.location.origin.includes('localhost') ? 'http://localhost:5000' : '/');
        
        socket.on('truckUpdate', (liveTrucks) => {
            setTrucks(currentTrucks => {
                const updated = [...currentTrucks];
                liveTrucks.forEach(liveT => {
                    const idx = updated.findIndex(t => t.truckId === liveT.truckId);
                    if (idx !== -1) {
                        updated[idx] = { ...updated[idx], ...liveT };
                    } else {
                        updated.push(liveT);
                    }
                });
                return updated;
            });
        });

        return () => socket.disconnect();
    }, []);

    const fetchData = async () => {
        try {
            const [recRes, truckRes, overdueRes] = await Promise.all([
                maintenanceAPI.getAll(), trucksAPI.getAll(), maintenanceAPI.getOverdue(),
            ]);
            setRecords(recRes.data);
            setTrucks(truckRes.data);
            setOverdueRecords(overdueRes.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const resetForm = () => {
        setForm({ truckId: '', serviceType: '', lastServiceDate: '', nextServiceDue: '', odometer: '', notes: '', cost: '', status: 'pending' });
        setEditingRecord(null);
    };

    const openAdd = () => { resetForm(); setShowModal(true); };
    const openEdit = (record) => {
        setForm({
            truckId: record.truckId?._id || record.truckId,
            serviceType: record.serviceType,
            lastServiceDate: record.lastServiceDate?.split('T')[0] || '',
            nextServiceDue: record.nextServiceDue?.split('T')[0] || '',
            odometer: record.odometer, notes: record.notes || '', cost: record.cost || 0, status: record.status,
        });
        setEditingRecord(record);
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = { ...form, odometer: Number(form.odometer), cost: Number(form.cost || 0) };
            if (editingRecord) {
                await maintenanceAPI.update(editingRecord._id, data);
            } else {
                await maintenanceAPI.create(data);
            }
            setShowModal(false);
            resetForm();
            fetchData();
        } catch (err) {
            alert(err.response?.data?.message || 'Operation failed');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this maintenance record?')) return;
        try { await maintenanceAPI.delete(id); fetchData(); }
        catch (err) { alert('Delete failed'); }
    };

    const isOverdue = (date) => new Date(date) < new Date();

    return (
        <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Maintenance</h1>
                    <p className="text-gray-500 text-sm mt-1">Track service logs and upcoming maintenance</p>
                </div>
                {isAdmin && (
                    <button onClick={openAdd} className="btn-primary flex items-center gap-2"><HiOutlinePlus /> Add Maintenance Record</button>
                )}
            </div>

            {/* Truck Service Suggestions */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <HiOutlineInformationCircle className="text-blue-500 text-xl" />
                        <h2 className="text-lg font-bold text-gray-900">Truck Status & Suggestions</h2>
                    </div>
                    <div className="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                        Maintenance is suggested every <strong className="text-gray-700">10,000 km</strong> or <strong className="text-gray-700">120 days</strong>.
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {trucks.filter(t => t.status === 'active').map(truck => {
                        const distanceDriven = Math.max(0, (truck.totalDistance || 0) - (truck.lastServiceDistance || 0));
                        const dateLast = truck.lastServiceDate ? new Date(truck.lastServiceDate) : new Date(truck.createdAt || Date.now());
                        const daysSince = Math.floor((Date.now() - dateLast.getTime()) / (1000 * 60 * 60 * 24));
                        const needsMaintenance = distanceDriven > 10000 || daysSince > 120;

                        return (
                            <div key={truck._id} className={`p-4 rounded-xl border transition-all ${needsMaintenance ? 'bg-red-50 border-red-200 shadow-sm shadow-red-100' : 'bg-white border-gray-100'}`}>
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                            {truck.truckId} 
                                            {needsMaintenance && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"><HiOutlineCog /> Service Due</span>}
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-0.5">{truck.licensePlate} • {truck.driverName}</p>
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 flex items-center gap-1.5"><HiOutlineMap className="text-gray-400" /> Since last service</span>
                                        <span className={`font-medium ${distanceDriven > 10000 ? 'text-red-600' : 'text-gray-700'}`}>
                                            {Math.round(distanceDriven).toLocaleString()} km
                                        </span>
                                    </div>
                                    
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 flex items-center gap-1.5"><HiOutlineClock className="text-gray-400" /> Last serviced</span>
                                        <span className={`font-medium ${daysSince > 120 ? 'text-red-600' : 'text-gray-700'}`}>
                                            {daysSince} days ago
                                        </span>
                                    </div>
                                    
                                    {/* Progress Bar for distance */}
                                    <div className="mt-3">
                                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                            <div 
                                                className={`h-1.5 rounded-full ${needsMaintenance ? 'bg-red-500' : distanceDriven > 8000 ? 'bg-amber-400' : 'bg-emerald-400'}`} 
                                                style={{ width: `${Math.min(100, (distanceDriven / 10000) * 100)}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Overdue Alerts */}
            {overdueRecords.length > 0 && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200">
                    <div className="flex items-center gap-2 mb-3">
                        <HiOutlineExclamation className="text-red-500 text-xl" />
                        <h3 className="text-sm font-semibold text-red-700">Overdue Maintenance ({overdueRecords.length})</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {overdueRecords.map((rec) => (
                            <div key={rec._id} className="p-3 rounded-lg bg-white border border-red-100">
                                <p className="text-sm font-semibold text-gray-800">{rec.truckId?.truckId || 'Unknown'}</p>
                                <p className="text-xs text-gray-500">{rec.serviceType}</p>
                                <p className="text-xs text-red-600 mt-1">Due: {new Date(rec.nextServiceDue).toLocaleDateString()}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="table-dark">
                        <thead>
                            <tr><th>Truck</th><th>Service Type</th><th>Last Service</th><th>Next Due</th><th>Odometer</th><th>Cost (₹)</th><th>Status</th>{isAdmin && <th>Actions</th>}</tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-gray-400">Loading...</td></tr>
                            ) : records.length === 0 ? (
                                <tr><td colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-gray-400">No maintenance records.</td></tr>
                            ) : (
                                records.map((rec) => (
                                    <tr key={rec._id}>
                                        <td className="font-semibold text-red-600">{rec.truckId?.truckId || 'N/A'}</td>
                                        <td>{rec.serviceType}</td>
                                        <td>{new Date(rec.lastServiceDate).toLocaleDateString()}</td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                {isOverdue(rec.nextServiceDue) && rec.status !== 'completed' && (
                                                    <HiOutlineExclamation className="text-red-500" />
                                                )}
                                                <span className={isOverdue(rec.nextServiceDue) && rec.status !== 'completed' ? 'text-red-600' : ''}>
                                                    {new Date(rec.nextServiceDue).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </td>
                                        <td>{rec.odometer?.toLocaleString()} km</td>
                                        <td>₹{rec.cost?.toLocaleString()}</td>
                                        <td>
                                            <span className={`badge ${rec.status === 'completed' ? 'badge-success' : rec.status === 'overdue' ? 'badge-danger' : 'badge-warning'}`}>
                                                {rec.status}
                                            </span>
                                        </td>
                                        {isAdmin && (
                                            <td>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => openEdit(rec)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"><HiOutlinePencil /></button>
                                                    <button onClick={() => handleDelete(rec._id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><HiOutlineTrash /></button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
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
                            <h2 className="text-lg font-bold text-gray-900">{editingRecord ? 'Edit Record' : 'New Maintenance Record'}</h2>
                            <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><HiOutlineX className="text-xl" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-600 mb-1 block font-medium">Truck</label>
                                <select value={form.truckId} onChange={(e) => setForm({ ...form, truckId: e.target.value })} className="input-field" required>
                                    <option value="">Select truck</option>
                                    {trucks.map(t => <option key={t._id} value={t._id}>{t.truckId} - {t.driverName}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm text-gray-600 mb-1 block font-medium">Service Type</label>
                                <input type="text" placeholder="e.g. Oil Change, Tire Rotation" value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} className="input-field" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block font-medium">Last Service Date</label>
                                    <input type="date" value={form.lastServiceDate} onChange={(e) => setForm({ ...form, lastServiceDate: e.target.value })} className="input-field" required />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block font-medium">Next Service Due</label>
                                    <input type="date" value={form.nextServiceDue} onChange={(e) => setForm({ ...form, nextServiceDue: e.target.value })} className="input-field" required />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block font-medium">Odometer (km)</label>
                                    <input type="number" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} className="input-field" required />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block font-medium">Cost (₹)</label>
                                    <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="input-field" />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm text-gray-600 mb-1 block font-medium">Status</label>
                                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input-field">
                                    <option value="pending">Pending</option>
                                    <option value="completed">Completed</option>
                                    <option value="overdue">Overdue</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm text-gray-600 mb-1 block font-medium">Notes</label>
                                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field" rows={3} placeholder="Additional notes..." />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="submit" className="btn-primary flex-1">{editingRecord ? 'Update' : 'Create'}</button>
                                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Maintenance;
