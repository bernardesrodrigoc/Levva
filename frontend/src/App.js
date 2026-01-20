import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Toaster } from 'sonner';

// --- SUAS IMPORTAÇÕES ORIGINAIS ---
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
import MatchSuggestionsPage from '@/pages/MatchSuggestionsPage';
import { PaymentSuccessPage, PaymentFailurePage, PaymentPendingPage } from '@/pages/PaymentResultPage';
import VehiclesPage from './pages/VehiclesPage';
import TripDetailsPage from '@/pages/TripDetailsPage';
import ShipmentDetailsPage from '@/pages/ShipmentDetailsPage';
import MyTripsPage from '@/pages/MyTripsPage';
import MyShipmentsPage from '@/pages/MyShipmentsPage';
import MobileBottomNav from '@/components/MobileBottomNav'; // <--- IMPORTAÇÃO NOVA PARA MOBILE
import '@/App.css';

// --- COMPONENTE DE LAYOUT PARA RESPONSIVIDADE ---
// Esse componente envolve as rotas para injetar a barra inferior apenas quando necessário
const AppLayout = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();

  // Rotas onde a barra NÃO deve aparecer (Login, Cadastro, Landing Page)
  const hideNavRoutes = ['/', '/login', '/register'];
  
  // Mostra a barra se o usuário estiver logado e não estiver nas páginas acima
  const showNav = user && !hideNavRoutes.includes(location.pathname);

  return (
    // Adiciona padding-bottom (pb-20) no mobile para o conteúdo não ficar atrás da barra
    <div className={showNav ? "pb-20 md:pb-0" : ""}>
      {children}
      {showNav && <MobileBottomNav />}
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Envolvemos as rotas com o Layout Responsivo */}
        <AppLayout>
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

            {/* --- NOVA ROTA DE DETALHES DA VIAGEM --- */}
            <Route
              path="/viagens/:tripId"
              element={
                <ProtectedRoute>
                  <TripDetailsPage />
                </ProtectedRoute>
              }
            />
            {/* Alias for /trip/:tripId for compatibility */}
            <Route
              path="/trip/:tripId"
              element={
                <ProtectedRoute>
                  <TripDetailsPage />
                </ProtectedRoute>
              }
            />
            {/* --------------------------------------- */}

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
              path="/vehicles"
              element={
                <ProtectedRoute>
                  <VehiclesPage />
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
            <Route
              path="/sugestoes"
              element={
                <ProtectedRoute>
                  <MatchSuggestionsPage />
                </ProtectedRoute>
              }
            />

            <Route path="/minhas-viagens" element={<ProtectedRoute><MyTripsPage /></ProtectedRoute>} />
            <Route path="/meus-envios" element={<ProtectedRoute><MyShipmentsPage /></ProtectedRoute>} />
            
            {/* Shipment Details */}
            <Route
              path="/envio/:shipmentId"
              element={
                <ProtectedRoute>
                  <ShipmentDetailsPage />
                </ProtectedRoute>
              }
            />
            {/* Alias for /shipment/:id for compatibility */}
            <Route
              path="/shipment/:shipmentId"
              element={
                <ProtectedRoute>
                  <ShipmentDetailsPage />
                </ProtectedRoute>
              }
            />

            <Route path="/payment/success" element={<PaymentSuccessPage />} />
            <Route path="/payment/failure" element={<PaymentFailurePage />} />
            <Route path="/payment/pending" element={<PaymentPendingPage />} />
            <Route path="*" element={<LandingPage />} />
          </Routes>
        </AppLayout>
        <Toaster position="bottom-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
