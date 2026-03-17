import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { getAuth, getToken } from "@/lib/auth";

type ProfileUser = {
  id?: number;
  name: string;
  email: string;
  role: "user" | "admin";
  user_role?: string | null;
  interests?: string[];
  phone?: string | null;
};

type AdminStats = {
  total_users: number;
  active_learners: number;
  community_talks: number;
  active_community_posts: number;
  live_rooms_active: number;
  practice_simulations_completed: number;
  total_scenarios: number;
  updated_at?: string;
};

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const readStoredNumber = (key: string, fallback: number, writeDefault = false) => {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    if (writeDefault) window.localStorage.setItem(key, String(fallback));
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    if (writeDefault) window.localStorage.setItem(key, String(fallback));
    return fallback;
  }
  return parsed;
};

const formatNumber = (value?: number | null) => {
  if (!Number.isFinite(value as number)) return "--";
  return new Intl.NumberFormat("en-US").format(value as number);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
};

const IconShield = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3Z" />
  </svg>
);

const IconCoin = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="12" r="8" />
    <path d="M9.5 9.5h5M9.5 14.5h5M9.5 12h5" />
  </svg>
);

const IconCheck = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M5 12l4 4 10-10" />
  </svg>
);

const StatCard = ({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  tone: "rose" | "amber" | "mint";
}) => {
  const tones = {
    rose: "text-primary-foreground bg-primary/20 border-primary/30",
    amber: "text-amber-600 bg-amber-200/30 border-amber-300/40",
    mint: "text-emerald-700 bg-emerald-200/30 border-emerald-300/40",
  } as const;

  return (
    <div className="flex items-center gap-4 p-3">
      <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center ${tones[tone]}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="font-serif text-lg font-bold">{value}</p>
      </div>
    </div>
  );
};

const ProfilePage = () => {
  const auth = getAuth();
  const [profile, setProfile] = useState<ProfileUser | null>(() => {
    if (!auth) return null;
    return {
      name: auth.name || "User",
      email: auth.email || "",
      role: auth.role || "user",
    };
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [coins, setCoins] = useState(50);
  const [scenarios, setScenarios] = useState(0);
  const [confidence, setConfidence] = useState(0);

  const isAdmin = useMemo(() => {
    const role = profile?.role ?? auth?.role ?? "user";
    return role === "admin";
  }, [profile?.role, auth?.role]);

  useEffect(() => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!token) {
      setLoadingProfile(false);
      return;
    }
    fetch(`${API_BASE}/api/auth/me`, {
      credentials: "include",
      headers,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          setProfile({
            id: data.user.id,
            name: data.user.name || auth?.name || "User",
            email: data.user.email || auth?.email || "",
            role: data.user.role || auth?.role || "user",
            user_role: data.user.user_role || null,
            interests: Array.isArray(data.user.interests) ? data.user.interests : [],
            phone: data.user.phone || null,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));
  }, [auth?.email, auth?.name, auth?.role]);

  useEffect(() => {
    if (!isAdmin) return;
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!token) return;
    fetch(`${API_BASE}/api/admin/stats`, {
      credentials: "include",
      headers,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.stats) setAdminStats(data.stats as AdminStats);
      })
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    const syncStats = () => {
      const nextCoins = readStoredNumber("userCoins", 50, true);
      const nextScenarios = readStoredNumber("scenariosCompleted", 0, true);
      const storedConfidence = readStoredNumber("confidenceScore", 0, false);
      const nextConfidence = storedConfidence > 0 ? storedConfidence : nextScenarios * 10;
      setCoins(nextCoins);
      setScenarios(nextScenarios);
      setConfidence(nextConfidence);
    };

    syncStats();
    window.addEventListener("storage", syncStats);
    window.addEventListener("saheli:stats-updated", syncStats);
    return () => {
      window.removeEventListener("storage", syncStats);
      window.removeEventListener("saheli:stats-updated", syncStats);
    };
  }, []);

  const displayName = profile?.name || auth?.name || "User";
  const displayEmail = profile?.email || auth?.email || "";
  const displayPhone = profile?.phone || auth?.phone || "--";
  const displayUserRole = profile?.user_role || auth?.user_role || "--";
  const displayInterests = (profile?.interests && profile.interests.length > 0)
    ? profile.interests
    : (auth?.interests && auth.interests.length > 0 ? auth.interests : []);
  const avatarLetter = displayName.charAt(0).toUpperCase();

  const profileDetails = [
    { label: "Full Name", value: displayName },
    { label: "Email", value: displayEmail || "--" },
    { label: "Phone", value: displayPhone },
    { label: "Role", value: (profile?.role || auth?.role || "user").toUpperCase() },
    { label: "User Type", value: displayUserRole },
    { label: "Last Login", value: formatDateTime(auth?.loggedInAt) },
  ];

  return (
    <div className="relative min-h-screen">
      <Navbar />

      <div className="relative z-10 pt-24 section-spacing max-w-5xl mx-auto px-4">
        <motion.div
          className="glass-glow p-6 flex flex-wrap items-center justify-between gap-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary border border-white/60 flex items-center justify-center text-white font-serif text-xl font-bold shadow-lg">
              {avatarLetter}
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Profile</p>
              <h1 className="font-serif text-2xl font-bold">{displayName}</h1>
              <p className="text-xs text-muted-foreground break-all">{displayEmail}</p>
              {isAdmin && (
                <span className="inline-flex mt-2 text-[10px] px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent">
                  Admin Account
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="coin-badge">
              <span>Coins</span>
              <span>{coins}</span>
            </div>
            <div className="text-xs text-muted-foreground text-right">
              <p>{loadingProfile ? "Loading profile..." : "Profile synced"}</p>
              <p>{formatDateTime(auth?.loggedInAt)}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="glass p-4 rounded-3xl border border-white/10 mt-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 divide-y md:divide-y-0 md:divide-x divide-white/20">
            <StatCard
              title="Confidence Score"
              value={String(confidence)}
              icon={<IconShield className="w-5 h-5" />}
              tone="rose"
            />
            <StatCard
              title="Practice Coins"
              value={String(coins)}
              icon={<IconCoin className="w-5 h-5" />}
              tone="amber"
            />
            <StatCard
              title="Scenarios Done"
              value={String(scenarios)}
              icon={<IconCheck className="w-5 h-5" />}
              tone="mint"
            />
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <motion.div
            className="glass-glow p-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent">
                Details
              </span>
              <p className="font-semibold text-sm">Profile Information</p>
            </div>
            <div className="space-y-3 text-sm">
              {profileDetails.map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-4 border-b border-white/10 pb-2">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium text-right break-all">{item.value}</span>
                </div>
              ))}
              <div className="flex items-start justify-between gap-4 pt-2">
                <span className="text-muted-foreground">Interests</span>
                <span className="font-medium text-right">
                  {displayInterests.length > 0 ? displayInterests.join(", ") : "--"}
                </span>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="glass-glow p-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 border border-primary/30 text-primary-foreground">
                Overview
              </span>
              <p className="font-semibold text-sm">Quick Actions</p>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Review your learning progress, practice results, and community activity.</p>
              <div className="flex flex-wrap gap-2">
                <Link className="glass-pill text-xs px-4 py-2" to="/dashboard">Go to Dashboard</Link>
                <Link className="glass-pill text-xs px-4 py-2" to="/simulation">Open Practice Lab</Link>
                <Link className="glass-pill text-xs px-4 py-2" to="/community">Community Space</Link>
              </div>
            </div>
            {isAdmin && (
              <div className="mt-5 pt-5 border-t border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent">
                    Admin
                  </span>
                  <p className="font-semibold text-sm">Admin Insights</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="glass p-3 rounded-2xl border border-white/10">
                    <p className="text-muted-foreground mb-1">Total Users</p>
                    <p className="font-semibold">{formatNumber(adminStats?.total_users)}</p>
                  </div>
                  <div className="glass p-3 rounded-2xl border border-white/10">
                    <p className="text-muted-foreground mb-1">Active Learners</p>
                    <p className="font-semibold">{formatNumber(adminStats?.active_learners)}</p>
                  </div>
                  <div className="glass p-3 rounded-2xl border border-white/10">
                    <p className="text-muted-foreground mb-1">Community Talks</p>
                    <p className="font-semibold">{formatNumber(adminStats?.community_talks)}</p>
                  </div>
                  <div className="glass p-3 rounded-2xl border border-white/10">
                    <p className="text-muted-foreground mb-1">Live Rooms</p>
                    <p className="font-semibold">{formatNumber(adminStats?.live_rooms_active)}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
