import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getAuth } from "@/lib/auth";

const RequireAdmin = () => {
  const location = useLocation();
  const auth = getAuth();

  if (!auth) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (auth.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

export default RequireAdmin;
