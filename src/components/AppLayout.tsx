import { Outlet } from "react-router-dom";
import FluidBackground from "./FluidBackground";

const AppLayout = () => (
  <>
    <FluidBackground />
    <div className="relative z-10 min-h-screen">
      <Outlet />
    </div>
  </>
);

export default AppLayout;
