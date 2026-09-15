import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { BrandProvider } from "@/context/BrandContext";
import { Toaster } from "@/components/ui/sonner";
import AppLayout from "@/components/Layout";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminUsers from "@/pages/admin/Users";
import AdminAppearance from "@/pages/admin/Appearance";
import AdminPackages from "@/pages/admin/Packages";
import CoachDashboard from "@/pages/coach/Dashboard";
import Client360 from "@/pages/coach/Client360";
import ClientToday from "@/pages/client/Today";
import ClientProgram from "@/pages/client/Program";
import ClientLog from "@/pages/client/Log";
import ClientProgress from "@/pages/client/Progress";
import ClientChat from "@/pages/client/Chat";
import ClientCheckin from "@/pages/client/Checkin";
import ClientWorkout from "@/pages/client/Workout";

function RoleHome() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "admin" || user.role === "super_admin") return <Navigate to="/app/admin" replace />;
  if (user.role === "coach") return <Navigate to="/app/coach" replace />;
  return <Navigate to="/app/today" replace />;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<RoleHome />} />
        <Route path="admin" element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="appearance" element={<AdminAppearance />} />
        <Route path="packages" element={<AdminPackages />} />
        <Route path="coach" element={<CoachDashboard />} />
        <Route path="clients/:id" element={<Client360 />} />
        <Route path="today" element={<ClientToday />} />
        <Route path="program" element={<ClientProgram />} />
        <Route path="log" element={<ClientLog />} />
        <Route path="progress" element={<ClientProgress />} />
        <Route path="chat" element={<ClientChat />} />
        <Route path="checkin" element={<ClientCheckin />} />
        <Route path="workout" element={<ClientWorkout />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App dark">
      <BrowserRouter>
        <AuthProvider>
          <BrandProvider>
            <AppRouter />
            <Toaster position="top-center" richColors theme="dark" />
          </BrandProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
