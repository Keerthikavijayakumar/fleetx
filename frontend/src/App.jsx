import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import FleetManagement from './pages/FleetManagement';
import Maintenance from './pages/Maintenance';
import TelemetryAnalytics from './pages/TelemetryAnalytics';
import Settings from './pages/Settings';
import MyTruck from './pages/MyTruck';
import AdminModule from './pages/AdminModule';
import TruckDetail from './pages/TruckDetail';
import PersonDetail from './pages/PersonDetail';

const RoleRedirect = () => {
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
            <Route path="fleet" element={<FleetManagement />} />
            <Route path="maintenance" element={<Maintenance />} />
            <Route path="telemetry" element={<TelemetryAnalytics />} />
            <Route path="admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminModule /></ProtectedRoute>} />
            <Route path="trucks/:id" element={<TruckDetail />} />
            <Route path="people/:id" element={<PersonDetail />} />
            <Route path="settings" element={<Settings />} />
            <Route path="my-truck" element={<MyTruck />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
