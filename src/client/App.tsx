import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BrandingProvider } from './contexts/BrandingContext';
import { LocationProvider } from './contexts/LocationContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Audiences from './pages/Audiences';
import Events from './pages/Events';
import DragonDeskOptimize from './pages/DragonDeskOptimize';
import DragonDeskEngage from './pages/DragonDeskEngage';
import DragonDeskOutreach from './pages/DragonDeskOutreach';
import DragonDeskSocial from './pages/DragonDeskSocial';
import DragonDeskAnalytics from './pages/DragonDeskAnalytics';
import Settings from './pages/Settings';
import WorkforceManagement from './pages/WorkforceManagement';
import LeadForm from './pages/LeadForm';
import Billing from './pages/Billing';
import Kiosk from './pages/Kiosk';
import AttendanceTracking from './pages/AttendanceTracking';
import Layout from './components/Layout';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const SuperAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      {/* Public lead form - no authentication required */}
      <Route path="/lead-form" element={<LeadForm />} />

      {/* Public kiosk check-in - no authentication required */}
      <Route path="/kiosk" element={<Kiosk />} />
      <Route path="/kiosk/:locationId" element={<Kiosk />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="members" element={<Contacts />} />
        <Route path="audiences" element={<Audiences />} />
        <Route path="events" element={<Events />} />
        <Route path="optimize" element={<DragonDeskOptimize />} />
        <Route path="engage" element={<DragonDeskEngage />} />
        <Route path="outreach" element={<DragonDeskOutreach />} />
        <Route path="social" element={<DragonDeskSocial />} />
        <Route path="analytics" element={<DragonDeskAnalytics />} />
        <Route path="attendance" element={<AttendanceTracking />} />
        <Route
          path="workforce"
          element={
            <SuperAdminRoute>
              <WorkforceManagement />
            </SuperAdminRoute>
          }
        />
        <Route
          path="billing"
          element={
            <AdminRoute>
              <Billing />
            </AdminRoute>
          }
        />
        <Route
          path="settings"
          element={
            <AdminRoute>
              <Settings />
            </AdminRoute>
          }
        />
      </Route>
    </Routes>
  );
};

const App = () => {
  return (
    <BrandingProvider>
      <AuthProvider>
        <LocationProvider>
          <Router>
            <AppRoutes />
          </Router>
        </LocationProvider>
      </AuthProvider>
    </BrandingProvider>
  );
};

export default App;
