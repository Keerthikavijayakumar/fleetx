import { useState, useEffect } from 'react';
import { routesAPI } from '../services/api';
import { HiOutlineMap } from 'react-icons/hi';

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
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">My Routes</h1>
                <p className="text-gray-500 text-sm mt-1">View your assigned route history</p>
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
                                <tr><th>Route</th><th>Distance</th><th>Duration</th><th>Fuel</th><th>Cost</th><th>CO₂</th><th>Traffic</th></tr>
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
                                        <td>{route.duration}</td>
                                        <td className="text-blue-600">{route.fuelConsumed} L</td>
                                        <td className="text-amber-600">₹{route.fuelCost?.toLocaleString()}</td>
                                        <td className="text-orange-600">{route.carbonEmission} kg</td>
                                        <td>
                                            <span className={`badge text-xs ${route.trafficLevel === 'Low' ? 'badge-success' : route.trafficLevel === 'Medium' ? 'badge-warning' : 'badge-danger'}`}>
                                                {route.trafficLevel}
                                            </span>
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
