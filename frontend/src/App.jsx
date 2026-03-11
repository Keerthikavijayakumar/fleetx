import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import LiveTracking from './pages/LiveTracking';
import FleetManagement from './pages/FleetManagement';
import RoutePlanner from './pages/RoutePlanner';
import Maintenance from './pages/Maintenance';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import MyTruck from './pages/MyTruck';
import DriverAnalysis from './pages/DriverAnalysis';

const RoleRedirect = () => {
  const { user } = useAuth();
  if (user?.role === 'driver') return <Navigate to="/my-truck" replace />;
  return <Dashboard />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<RoleRedirect />} />
            <Route path="live-tracking" element={<LiveTracking />} />
            <Route path="fleet" element={<FleetManagement />} />
            <Route path="route-planner" element={<RoutePlanner />} />
            <Route path="maintenance" element={<Maintenance />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
            <Route path="my-truck" element={<MyTruck />} />
            <Route path="driver-analysis" element={<DriverAnalysis />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
