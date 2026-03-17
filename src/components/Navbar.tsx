import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { isAuthenticated, getAuth, clearAuth } from "@/lib/auth";

const navItems = [
  { label: "Home", path: "/" },
  { label: "Dashboard", path: "/dashboard" },
  { label: "Practice Lab", path: "/simulation" },
  { label: "Community", path: "/community" },
  { label: "Voice", path: "/voice" },
  { label: "Government", path: "/government" },
  { label: "Business", path: "/entrepreneurship" },
];

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const loggedIn = isAuthenticated();
  const auth = getAuth();
  const items = loggedIn ? navItems.filter((item) => item.label !== "Home") : navItems;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [userCoins, setUserCoins] = useState(50);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const syncCoins = () => {
      if (typeof window === "undefined") return;
      const stored = window.localStorage.getItem("userCoins");
      if (stored === null) {
        window.localStorage.setItem("userCoins", "50");
        setUserCoins(50);
        return;
      }
      const parsed = Number.parseInt(stored, 10);
      if (!Number.isFinite(parsed)) {
        window.localStorage.setItem("userCoins", "50");
        setUserCoins(50);
        return;
      }
      setUserCoins(parsed);
    };

    syncCoins();
    window.addEventListener("storage", syncCoins);
    window.addEventListener("saheli:stats-updated", syncCoins);
    return () => {
      window.removeEventListener("storage", syncCoins);
      window.removeEventListener("saheli:stats-updated", syncCoins);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore network error — clear client side regardless
    }
    clearAuth();
    setDropdownOpen(false);
    navigate("/", { replace: true });
  };

  const avatarLetter = auth?.name
    ? auth.name.charAt(0).toUpperCase()
    : auth?.email
    ? auth.email.charAt(0).toUpperCase()
    : "S";

  return (
    <motion.nav
      className="glass-nav"
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link to="/" className="font-serif text-xl font-bold text-foreground">
          Saheli
        </Link>

        <div className="hidden md:flex items-center gap-2">
          {items.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`glass-tab ${location.pathname === item.path ? "glass-tab-active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="coin-badge">
            <span>🪙</span>
            <span>{userCoins}</span>
          </div>

          {loggedIn ? (
            /* ── Avatar + dropdown ── */
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <motion.button
                onClick={() => setDropdownOpen((v) => !v)}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, hsl(354 51% 78%), hsl(24 67% 75%))",
                  border: "2px solid rgba(255,255,255,0.55)",
                  boxShadow: "0 4px 14px rgba(228,172,178,0.45)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Georgia, serif",
                  fontWeight: 700,
                  fontSize: 15,
                  color: "#fff",
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                }}
                aria-label="Account menu"
                aria-expanded={dropdownOpen}
              >
                {avatarLetter}
              </motion.button>

              <AnimatePresence>
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.18 }}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 10px)",
                      minWidth: 200,
                      background: "rgba(255,255,255,0.82)",
                      backdropFilter: "blur(18px)",
                      WebkitBackdropFilter: "blur(18px)",
                      border: "1px solid rgba(228,172,178,0.30)",
                      borderRadius: 16,
                      boxShadow: "0 16px 48px rgba(44,24,16,0.12)",
                      padding: "8px",
                      zIndex: 999,
                    }}
                  >
                    {/* User info row */}
                    <div
                      style={{
                        padding: "10px 14px 10px",
                        borderBottom: "1px solid rgba(228,172,178,0.20)",
                        marginBottom: 4,
                      }}
                    >
                      <p
                        style={{
                          fontFamily: "Georgia, serif",
                          fontWeight: 700,
                          fontSize: 13,
                          color: "#2C1810",
                          marginBottom: 2,
                        }}
                      >
                        {auth?.name || "User"}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: "#8B6B5A",
                          fontFamily: '"Times New Roman", serif',
                          wordBreak: "break-all",
                        }}
                      >
                        {auth?.email || ""}
                      </p>
                    </div>

                    {/* Dashboard link */}
                    <Link
                      to="/profile"
                      onClick={() => setDropdownOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "9px 14px",
                        borderRadius: 10,
                        fontSize: 13,
                        fontFamily: '"Times New Roman", serif',
                        fontWeight: 500,
                        color: "#2C1810",
                        textDecoration: "none",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLAnchorElement).style.background =
                          "rgba(228,172,178,0.15)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLAnchorElement).style.background = "transparent")
                      }
                    >
                      <span style={{ fontSize: 15 }}>📊</span> Dashboard
                    </Link>

                    {/* Profile / Settings placeholder */}
                    <Link
                      to="/dashboard"
                      onClick={() => setDropdownOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "9px 14px",
                        borderRadius: 10,
                        fontSize: 13,
                        fontFamily: '"Times New Roman", serif',
                        fontWeight: 500,
                        color: "#2C1810",
                        textDecoration: "none",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLAnchorElement).style.background =
                          "rgba(228,172,178,0.15)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLAnchorElement).style.background = "transparent")
                      }
                    >
                      <span style={{ fontSize: 15 }}>⚙️</span> Settings
                    </Link>

                    {/* Divider */}
                    <div
                      style={{
                        height: 1,
                        background: "rgba(228,172,178,0.20)",
                        margin: "4px 0",
                      }}
                    />

                    {/* Logout */}
                    <button
                      onClick={handleLogout}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "9px 14px",
                        borderRadius: 10,
                        fontSize: 13,
                        fontFamily: '"Times New Roman", serif',
                        fontWeight: 600,
                        color: "#C17B7B",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLButtonElement).style.background =
                          "rgba(217,107,107,0.10)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLButtonElement).style.background = "transparent")
                      }
                    >
                      <span style={{ fontSize: 15 }}>🚪</span> Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            /* ── Login button ── */
            <Link to="/login" className="glass-pill-primary text-sm py-2 px-5">
              Login
            </Link>
          )}
        </div>
      </div>
    </motion.nav>
  );
};

export default Navbar;
