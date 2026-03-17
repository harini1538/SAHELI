import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isAuthenticated } from "@/lib/auth";

const RequireAuth = () => {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
};

export default RequireAuth;