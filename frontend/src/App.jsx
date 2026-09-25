import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import ProfilePage from "./pages/ProfilePage";
import CropListPage from "./pages/CropListPage";
import CropDetailPage from "./pages/CropDetailPage";
import ScanUploadPage from "./pages/ScanUploadPage";
import ScanHistoryPage from "./pages/ScanHistoryPage";
import ScanHistoryDetailPage from "./pages/ScanHistoryDetailPage";
import WeatherPage from "./pages/WeatherPage";
import VideosPage from "./pages/VideosPage";
import LocatorPage from "./pages/LocatorPage";
import ChatbotPage from "./pages/ChatbotPage";
import AdvisoryPage from "./pages/AdvisoryPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ResendVerificationPage from "./pages/ResendVerificationPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:uid/:token" element={<ResetPasswordPage />} />
          <Route path="/verify-email/:uid/:token" element={<VerifyEmailPage />} />
          <Route path="/resend-verification" element={<ResendVerificationPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crops"
            element={
              <ProtectedRoute>
                <CropListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crops/:id"
            element={
              <ProtectedRoute>
                <CropDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scan"
            element={
              <ProtectedRoute>
                <ScanUploadPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scan/history"
            element={
              <ProtectedRoute>
                <ScanHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scan/history/:id"
            element={
              <ProtectedRoute>
                <ScanHistoryDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/weather"
            element={
              <ProtectedRoute>
                <WeatherPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/videos"
            element={
              <ProtectedRoute>
                <VideosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/locator"
            element={
              <ProtectedRoute>
                <LocatorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chatbot"
            element={
              <ProtectedRoute>
                <ChatbotPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/advisory"
            element={
              <ProtectedRoute>
                <AdvisoryPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
