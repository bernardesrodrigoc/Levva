import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Toaster } from 'sonner';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DashboardPage from '@/pages/DashboardPage';
import CreateTripPage from '@/pages/CreateTripPage';
import CreateShipmentPage from '@/pages/CreateShipmentPage';
import BrowseTripsPage from '@/pages/BrowseTripsPage';
import BrowseShipmentsPage from '@/pages/BrowseShipmentsPage';
import VerificationPage from '@/pages/VerificationPage';
import AdminDashboard from '@/pages/AdminDashboard';
import ProfilePage from '@/pages/ProfilePage';
import MatchDetailPage from '@/pages/MatchDetailPage';
import CreateMatchPage from '@/pages/CreateMatchPage';
import '@/App.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/criar-viagem"
            element={
              <ProtectedRoute>
                <CreateTripPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/criar-envio"
            element={
              <ProtectedRoute>
                <CreateShipmentPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/viagens"
            element={
              <ProtectedRoute>
                <BrowseTripsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/envios"
            element={
              <ProtectedRoute>
                <BrowseShipmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/verificacao"
            element={
              <ProtectedRoute>
                <VerificationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/perfil"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/match/:matchId"
            element={
              <ProtectedRoute>
                <MatchDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/criar-combinacao"
            element={
              <ProtectedRoute>
                <CreateMatchPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<LandingPage />} />
        </Routes>
        <Toaster position="bottom-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;