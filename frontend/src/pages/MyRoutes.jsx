import { useState, useEffect } from 'react';
import { routesAPI } from '../services/api';
import { HiOutlineMap, HiOutlineDocumentDownload } from 'react-icons/hi';
import { generateAllTripsReport, generateTripReport } from '../services/reportGenerator';

const formatMinutes = (mins) => {
    const total = Math.max(0, Math.round(Number(mins || 0)));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}h ${m}m`;
};

const MyRoutes = () => {
    const [routes, setRoutes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRoutes = async () => {
            try {
                const res = await routesAPI.getAll();
                setRoutes(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchRoutes();
    }, []);

    return (
        <div className="animate-fade-in">
            <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Routes</h1>
                    <p className="text-gray-500 text-sm mt-1">View your assigned route history</p>
                </div>
                {routes.length > 0 && (
                    <button
                        onClick={() => generateAllTripsReport(routes)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                        <HiOutlineDocumentDownload className="text-base" /> Download All Trips Report
                    </button>
                )}
            </div>

            <div className="card overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-400">Loading routes...</div>
                ) : routes.length === 0 ? (
                    <div className="p-8 text-center">
                        <HiOutlineMap className="text-4xl text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">No routes assigned yet</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table-dark">
                            <thead>
                                <tr><th>Travel Place</th><th>Distance</th><th>Time (Est / Live)</th><th>Fuel (Est / Live)</th><th>Cost (Diesel + Toll + Food)</th><th>Status</th><th>Report</th></tr>
                            </thead>
                            <tbody>
                                {routes.map(route => (
                                    <tr key={route._id}>
                                        <td>
                                            <span className="text-red-600 font-medium">{route.source}</span>
                                            <span className="text-gray-400 mx-1">→</span>
                                            <span className="text-gray-700">{route.destination}</span>
                                        </td>
                                        <td>{route.distance} km</td>
                                        <td>
                                            <span className="text-gray-700">{route.estimated?.durationText || route.duration || '-'}</span>
                                            <span className="text-gray-400 mx-1">/</span>
                                            <span className="text-blue-700 font-semibold">{formatMinutes(route.realtime?.durationMinutes)}</span>
                                        </td>
                                        <td>
                                            <span className="text-gray-700">{(route.estimated?.fuelConsumed ?? route.fuelConsumed ?? 0).toFixed(2)} L</span>
                                            <span className="text-gray-400 mx-1">/</span>
                                            <span className="text-blue-700 font-semibold">{(route.realtime?.fuelConsumed ?? 0).toFixed(2)} L</span>
                                        </td>
                                        <td className="text-amber-600">
                                            <div className="leading-tight">
                                                <div>₹{(route.realtime?.fuelCost ?? 0).toLocaleString()} + ₹{(route.realtime?.tollCost ?? 0).toLocaleString()} + ₹{(route.realtime?.foodCost ?? 0).toLocaleString()}</div>
                                                <div className="text-xs font-bold text-amber-700">Total: ₹{(route.realtime?.totalCost ?? route.totalTripCost ?? 0).toLocaleString()}</div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge text-xs ${route.status === 'completed' ? 'badge-success' : route.status === 'in_transit' ? 'badge-primary' : route.status === 'delayed' ? 'badge-danger' : 'badge-warning'}`}>
                                                {route.status || 'scheduled'}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                onClick={() => generateTripReport(route)}
                                                title="Download trip report"
                                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                            >
                                                <HiOutlineDocumentDownload /> PDF
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyRoutes;
