import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import UserDashboard from "./pages/UserDashboard";
import SimulationPage from "./pages/SimulationPage";
import GovernmentPage from "./pages/GovernmentPage";
import VoicePage from "./pages/VoicePage";
import EntrepreneurshipPage from "./pages/EntrepreneurshipPage";
import CommunityPage from "./pages/CommunityPage";
import ProfilePage from "./pages/ProfilePage";
import NotFound from "./pages/NotFound";
import RequireAuth from "./components/RequireAuth";
import RequireAdmin from "./components/RequireAdmin";
import AppLayout from "./components/AppLayout";
import AuthCallback from "./pages/AuthCallback";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          {/* Google OAuth callback — outside AppLayout so no guards run */}
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route element={<AppLayout />}>
            {/* Public */}
            <Route path="/"         element={<LandingPage />} />
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected */}
            <Route element={<RequireAuth />}>
              <Route path="/dashboard"        element={<UserDashboard />} />
              <Route path="/profile"          element={<ProfilePage />} />
              <Route path="/simulation"       element={<SimulationPage />} />
              <Route path="/government"       element={<GovernmentPage />} />
              <Route path="/voice"            element={<VoicePage />} />
              <Route path="/entrepreneurship" element={<EntrepreneurshipPage />} />
              <Route path="/community"        element={<CommunityPage />} />
            </Route>

            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={<UserDashboard />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
