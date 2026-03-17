import { type CSSProperties, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import { getAuth, getToken } from "@/lib/auth";

const JOURNEY_KEYS = {
  ideas: "saheli_journey_ideas",
  plans: "saheli_journey_plans",
  pitches: "saheli_journey_pitches",
} as const;

const readJourneyCount = (key: string) => {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(key);
  const parsed = Number.parseInt(raw || "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const tabs = ["Overview", "Practice Lab", "Community", "Schemes", "Business"];
const tabRoutes = {
  Overview: "/dashboard",
  "Practice Lab": "/simulation",
  Community: "/community",
  Schemes: "/government",
  Business: "/entrepreneurship",
} as const;

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const quickStats = [
  { icon: "🛡️", label: "Confidence Score", value: "--", color: "var(--primary-fg)" },
  { icon: "🪙", label: "Practice Coins", value: "--", color: "hsl(24,67%,42%)" },
  { icon: "✅", label: "Scenarios Done", value: "--", color: "var(--accent-fg)" },
];
const adminQuickStatsBase = [
  { icon: "S", label: "Total Scenarios", color: "var(--accent-fg)" },
  { icon: "C", label: "Community Talks", color: "var(--primary-fg)" },
  { icon: "A", label: "Active Learners", color: "hsl(24,67%,42%)" },
];
const adminInsightsBase = [
  { label: "Total Users" },
  { label: "Active Community Posts" },
  { label: "Live Room Activity" },
  { label: "Practice Simulations Completed" },
];
const quickHighlights = [
  {
    emoji: "💬",
    heading: "Trending Discussions",
    headColor: "var(--primary-fg)",
    dotColor: "var(--primary)",
    items: [{ label: "Explore community topics", to: "/community" }],
  },
  {
    emoji: "🏆",
    heading: "Recommended Schemes",
    headColor: "hsl(24,67%,40%)",
    dotColor: "var(--secondary)",
    items: [{ label: "Browse government programs", to: "/government" }],
  },
  {
    emoji: "👥",
    heading: "Community Activity",
    headColor: "var(--accent-fg)",
    dotColor: "var(--accent)",
    items: [{ label: "See what's happening today", to: "/community" }],
  },
];

const STORAGE_KEYS = {
  coins: "userCoins",
  scenarios: "scenariosCompleted",
  confidence: "confidenceScore",
} as const;

const DEFAULT_COINS = 50;

const readStoredNumber = (
  key: string,
  fallback: number,
  writeDefault = false
) => {
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

const authHeaders = (headers: Record<string, string> = {}) => {
  const token = getToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
};

const formatNumber = (value?: number | null) => {
  if (!Number.isFinite(value as number)) return "--";
  return new Intl.NumberFormat("en-US").format(value as number);
};

const formatCompact = (value?: number | null) => {
  if (!Number.isFinite(value as number)) return "--";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value as number);
};

const formatRoomsLive = (value?: number | null) => {
  if (!Number.isFinite(value as number)) return "--";
  return `${formatNumber(value as number)} rooms live`;
};

// ─── CSS Variables & Global Styles ────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:            hsl(35, 81%, 96%);
      --fg:            hsl(17, 47%, 12%);

      --card:          hsl(43, 82%, 89%);
      --card-fg:       hsl(17, 47%, 12%);

      --primary:       hsl(354, 51%, 78%);
      --primary-fg:    hsl(353, 31%, 42%);

      --secondary:     hsl(24, 67%, 75%);
      --secondary-fg:  hsl(17, 47%, 12%);

      --muted:         hsl(43, 82%, 89%);
      --muted-fg:      hsl(21, 29%, 33%);

      --accent:        hsl(74, 32%, 76%);
      --accent-fg:     hsl(106, 23%, 33%);

      --highlight:     hsl(178, 19%, 66%);
      --highlight-fg:  hsl(178, 31%, 35%);

      --border:        rgba(255,255,255,0.30);
      --ring:          hsl(354, 51%, 78%);

      --glass-bg:      rgba(255,255,255,0.25);
      --glass-strong:  rgba(255,255,255,0.42);
      --glass-border:  rgba(255,255,255,0.32);
      --glass-glow:    rgba(216,147,147,0.22);

      --radius:        1.5rem;
      --font-display:  Georgia, "Times New Roman", serif;
      --font-body:     "Times New Roman", Times, serif;
    }

    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font-body);
    }

    .g-card {
      background: var(--glass-strong);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius);
    }
    .g-card-glow {
      background: var(--glass-strong);
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius);
      box-shadow: 0 8px 40px var(--glass-glow), inset 0 1px 0 rgba(255,255,255,0.6);
    }
    .g-strip {
      background: rgba(255,255,255,0.35);
      border: 1px solid rgba(255,255,255,0.45);
      border-radius: 12px;
      padding: 10px 14px;
      font-family: var(--font-body);
    }
    .g-tab {
      padding: 8px 22px;
      border-radius: 99px;
      border: 1px solid rgba(255,255,255,0.38);
      background: rgba(255,255,255,0.32);
      backdrop-filter: blur(10px);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      color: var(--muted-fg);
      transition: all 0.22s;
      font-family: var(--font-body);
    }
    .g-tab:hover { background: rgba(255,255,255,0.6); color: var(--primary-fg); }
    .g-tab-active {
      background: var(--primary) !important;
      color: white !important;
      border-color: transparent !important;
      box-shadow: 0 4px 18px rgba(216,147,147,0.45);
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
      color: white;
      border: none;
      border-radius: 99px;
      padding: 12px 28px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 18px rgba(216,147,147,0.38);
      transition: transform 0.18s, box-shadow 0.18s;
      font-family: var(--font-body);
      letter-spacing: 0.01em;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(216,147,147,0.52); }
    .btn-secondary {
      background: rgba(255,255,255,0.5);
      color: var(--muted-fg);
      border: 1px solid rgba(255,255,255,0.5);
      border-radius: 99px;
      padding: 12px 28px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.18s;
      font-family: var(--font-body);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.82); border-color: var(--primary); color: var(--primary-fg); }
    .display   { font-family: var(--font-display); font-weight: 700; color: var(--fg); line-height: 1.15; }
    .label-xs  { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted-fg); font-family: var(--font-body); }
    .label-sm  { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-fg); font-family: var(--font-body); }
    .prog-track { width: 100%; height: 7px; border-radius: 99px; background: rgba(200,170,160,0.2); overflow: hidden; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--primary); border-radius: 99px; }
    .comm-card { transition: all 0.2s; }
    .comm-card:hover { background: rgba(255,255,255,0.72) !important; border-color: rgba(216,147,147,0.4) !important; transform: translateY(-2px); }
    .quick-title { font-family: var(--font-display); font-size: 20px; font-weight: 700; color: var(--fg); }
    .quick-label { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; font-weight: 600; font-family: var(--font-body); }
    .quick-item { font-size: 13.5px; color: var(--muted-fg); font-family: var(--font-body); text-decoration: none; font-weight: 500; }
    .quick-item:hover { color: var(--primary-fg); }
    .image-slot {
      width: 100%;
      height: 100%;
      border-radius: 22px;
      background: linear-gradient(135deg, rgba(216,147,147,0.08), rgba(200,168,120,0.12));
      border: 1px solid rgba(255,255,255,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .image-slot img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .image-slot-large { min-height: 360px; }
    .image-slot-small { min-height: 150px; }
    .text-link { color: var(--primary-fg); text-decoration: underline; font-weight: 600; }
    .text-link:hover { color: var(--fg); }
    .g-tab { text-decoration: none; }
  `}</style>
);

const navbarThemeVars = {
  "--background": "35 81% 96%",
  "--foreground": "17 47% 12%",
  "--muted": "43 82% 89%",
  "--muted-foreground": "21 29% 33%",
  "--primary": "354 51% 78%",
  "--primary-foreground": "353 31% 42%",
  "--secondary": "24 67% 75%",
  "--secondary-foreground": "17 47% 12%",
  "--accent": "74 32% 76%",
  "--accent-foreground": "106 23% 33%",
  "--highlight": "178 19% 66%",
  "--highlight-foreground": "178 31% 35%",
  "--glass-bg": "0 0% 100% / 0.25",
  "--glass-bg-strong": "0 0% 100% / 0.4",
  "--glass-border": "0 0% 100% / 0.3",
  "--glass-border-glow": "354 51% 78% / 0.3",
} as CSSProperties;

// ─── Hero Illustration ─────────────────────────────────────────────────────────
const HeroIllustration = () => (
  <div className="image-slot image-slot-large">
    <img
      src="https://static.vecteezy.com/system/resources/previews/021/556/409/original/womens-history-month-the-legacy-of-female-empowerment-flat-illustration-vector.jpg"
      alt="Abstract illustration of women supporting each other"
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  </div>
);

// ─── Dashboard ─────────────────────────────────────────────────────────────────
const UserDashboard = () => {
  const location = useLocation();
  const activePath = location.pathname;
  const auth = getAuth();
  const isAdmin = auth?.role === "admin";
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setAdminStats(null);
      return;
    }
    let cancelled = false;
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/stats`, {
          method: "GET",
          headers: authHeaders(),
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to load admin stats");
        }
        if (!cancelled) setAdminStats(data?.stats ?? null);
      } catch {
        if (!cancelled) setAdminStats(null);
      }
    };
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const [journey, setJourney] = useState({ ideas: 0, plans: 0, pitches: 0 });
  useEffect(() => {
    const sync = () => setJourney({
      ideas: readJourneyCount(JOURNEY_KEYS.ideas),
      plans: readJourneyCount(JOURNEY_KEYS.plans),
      pitches: readJourneyCount(JOURNEY_KEYS.pitches),
    });
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("saheli:journey-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("saheli:journey-updated", sync);
    };
  }, []);
  const [practiceCoins, setPracticeCoins] = useState(DEFAULT_COINS);
  const [scenariosCompleted, setScenariosCompleted] = useState(0);
  const [confidenceScore, setConfidenceScore] = useState(0);

  useEffect(() => {
    const syncStats = () => {
      const coins = readStoredNumber(STORAGE_KEYS.coins, DEFAULT_COINS, true);
      const scenarios = readStoredNumber(STORAGE_KEYS.scenarios, 0, true);
      const nextConfidence = scenarios * 10;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          STORAGE_KEYS.confidence,
          String(nextConfidence)
        );
      }
      setPracticeCoins(coins);
      setScenariosCompleted(scenarios);
      setConfidenceScore(nextConfidence);
    };

    syncStats();
    window.addEventListener("storage", syncStats);
    window.addEventListener("saheli:stats-updated", syncStats);
    return () => {
      window.removeEventListener("storage", syncStats);
      window.removeEventListener("saheli:stats-updated", syncStats);
    };
  }, []);

  const hasScenarios = scenariosCompleted > 0;
  const userStats = [
    {
      ...quickStats[0],
      value: hasScenarios ? String(confidenceScore) : "Not scored yet",
    },
    { ...quickStats[1], value: String(practiceCoins) },
    { ...quickStats[2], value: String(scenariosCompleted) },
  ];
  const adminQuickStats = [
    {
      ...adminQuickStatsBase[0],
      value: formatCompact(adminStats?.total_scenarios),
    },
    {
      ...adminQuickStatsBase[1],
      value: formatCompact(adminStats?.community_talks),
    },
    {
      ...adminQuickStatsBase[2],
      value: formatCompact(adminStats?.active_learners),
    },
  ];
  const adminInsights = [
    { label: adminInsightsBase[0].label, value: formatNumber(adminStats?.total_users) },
    { label: adminInsightsBase[1].label, value: formatNumber(adminStats?.active_community_posts) },
    { label: adminInsightsBase[2].label, value: formatRoomsLive(adminStats?.live_rooms_active) },
    {
      label: adminInsightsBase[3].label,
      value: formatNumber(adminStats?.practice_simulations_completed),
    },
  ];
  const stats = isAdmin ? adminQuickStats : userStats;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <GlobalStyles />
      <div style={navbarThemeVars}>
        <Navbar />
      </div>
      <div style={{ paddingTop: 72 }}>
        {isAdmin && (
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px 22px" }}>
            <div className="g-card-glow" style={{ padding: "22px 26px", display: "grid", gap: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <p className="label-xs" style={{ color: "var(--primary-fg)", marginBottom: 6 }}>Admin Control Dashboard</p>
                  <p className="display" style={{ fontSize: 22 }}>Admin Insights</p>
                </div>
                <span className="g-strip" style={{ borderRadius: 999, padding: "6px 12px", fontSize: 11, fontWeight: 600, color: "var(--primary-fg)" }}>
                  Admin
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                {adminInsights.map((item) => (
                  <div key={item.label} className="g-strip" style={{ borderRadius: 14, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted-fg)", marginBottom: 6 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 18, fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--fg)" }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── HERO ────────────────────────────────────────────────────────── */}
        <div style={{
          maxWidth: 1280, margin: "0 auto", padding: "44px 32px 0",
          display: "grid", gridTemplateColumns: "1fr 1fr 308px", gap: 22, minHeight: 492,
        }}>
          {/* LEFT */}
          <motion.div
            initial={{ opacity: 0, x: -28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
            style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 22 }}
          >
            <div>
              <p className="label-xs" style={{ color: "var(--primary-fg)", marginBottom: 10 }}>
                {isAdmin ? "Admin Control Dashboard" : "Digital Learning Hub"}
              </p>
              <h1 className="display" style={{ fontSize: "clamp(30px,3.6vw,50px)", marginBottom: 14 }}>
                Build Your Digital<br />
                <span style={{
                  background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}>Confidence</span>
              </h1>
              <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "var(--muted-fg)", maxWidth: 370, fontFamily: "var(--font-body)" }}>
                {isAdmin
                  ? "Monitor platform activity, guide community health, and keep learning resources fresh for every learner."
                  : "Learn safe digital practices, explore entrepreneurial skills through interactive scenarios and community knowledge."}
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link to="/simulation" className="btn-primary">Start Practice</Link>
              <Link to="/community" className="btn-secondary">Join Community</Link>
              <Link to="/government" className="btn-secondary">Explore Schemes</Link>
            </div>

            {/* Quick stats strip */}
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}
              style={{
                display: "flex", gap: 0,
                background: "rgba(255,255,255,0.45)", backdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.5)", borderRadius: 16, overflow: "hidden",
              }}
            >
              {stats.map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 9, flex: 1, padding: "14px 24px",
                  borderRight: i < 2 ? "1px solid rgba(255,255,255,0.45)" : "none",
                }}>
                  <span style={{ fontSize: 20 }}>{s.icon}</span>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 500, fontFamily: "var(--font-body)" }}>{s.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: s.color, fontFamily: "var(--font-display)" }}>{s.value}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* CENTER illustration */}
          <div
            className="g-card-glow"
            style={{ position: "relative", overflow: "hidden", minHeight: 390 }}
          >
            <div style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(ellipse at 35% 45%, rgba(216,147,147,0.14) 0%, transparent 58%), radial-gradient(ellipse at 70% 72%, rgba(200,168,120,0.14) 0%, transparent 58%)",
            }} />
            <HeroIllustration />
          </div>

          {/* RIGHT quick highlights */}
          <motion.div
            initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
            className="g-card-glow"
            style={{
              padding: "24px 26px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              alignSelf: "center",
              height: "fit-content",
              marginTop: 10,
            }}
          >
            <p className="quick-title">Quick Highlights</p>
            {quickHighlights.map((sec, si) => (
              <div key={si}>
                {si > 0 && <div style={{ height: 1, background: "rgba(255,255,255,0.45)", margin: "6px 0 12px" }} />}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 15 }}>{sec.emoji}</span>
                  <span className="quick-label" style={{ color: sec.headColor }}>{sec.heading}</span>
                </div>
                {sec.items.map((item, ii) => (
                  <div
                    key={ii}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: ii < sec.items.length - 1 ? 6 : 0,
                    }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: sec.dotColor, opacity: 0.6, flexShrink: 0 }} />
                    <Link to={item.to} className="quick-item">{item.label}</Link>
                  </div>
                ))}
              </div>
            ))}
          </motion.div>
        </div>

        {/* ── TABS ──────────────────────────────────────────────────────── */}
        <div style={{ maxWidth: 1280, margin: "28px auto 20px", padding: "0 32px" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {tabs.map((t) => {
              const path = tabRoutes[t as keyof typeof tabRoutes];
              const isActive = activePath === path;
              return (
                <Link key={t} to={path} className={`g-tab ${isActive ? "g-tab-active" : ""}`}>
                  {t}
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── BODY ──────────────────────────────────────────────────────── */}
        <div style={{
          maxWidth: 1280, margin: "24px auto 0", padding: "0 32px 72px",
          display: "grid", gridTemplateColumns: "1fr 368px", gap: 22,
        }}>

          {/* LEFT COLUMN */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

            {/* Learning Journey */}
            <div className="g-card-glow"
              style={{ padding: 32, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}
            >
              <div>
                <p className="display" style={{ fontSize: 22, marginBottom: 12 }}>Your Learning Journey</p>
                <p style={{ fontSize: 13.5, color: "var(--muted-fg)", lineHeight: 1.7, fontFamily: "var(--font-body)" }}>
                  Your milestones will appear here after you complete practice scenarios and lessons.
                </p>
                <div style={{ marginTop: 16 }}>
                  <Link to="/simulation" className="btn-secondary" style={{ display: "inline-flex" }}>
                    Start your first scenario
                  </Link>
                </div>
              </div>
              <div className="image-slot image-slot-small">
                <img
                  src="https://tse4.mm.bing.net/th/id/OIP.qQjcBpcNt0Lkj0mEZ408RwHaEK?pid=Api&P=0&h=180"
                  alt="Stylized line art woman portrait"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            {/* Community Conversations */}
            <motion.div className="g-card"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              style={{ padding: 32 }}
            >
              <p className="display" style={{ fontSize: 22, marginBottom: 18 }}>Community Conversations</p>
              <div className="g-strip" style={{ borderRadius: 18, padding: "18px 16px" }}>
                <p style={{ fontSize: 13.5, color: "var(--muted-fg)", lineHeight: 1.7, fontFamily: "var(--font-body)" }}>
                  Live rooms, polls, and discussions will show here once you start engaging with the community.
                </p>
                <Link to="/community" className="btn-secondary" style={{ marginTop: 12, display: "inline-flex" }}>
                  Go to Community
                </Link>
                {isAdmin && (
                  <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                    <div className="g-strip" style={{ borderRadius: 16, padding: "14px 16px" }}>
                      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--muted-fg)", marginBottom: 8 }}>
                        Admin Tools
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn-secondary" style={{ padding: "8px 14px", fontSize: 12 }}>Review Discussions</button>
                        <button className="btn-secondary" style={{ padding: "8px 14px", fontSize: 12 }}>Manage Reports</button>
                        <button className="btn-secondary" style={{ padding: "8px 14px", fontSize: 12 }}>Pin Important Announcement</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Entrepreneurship Studio */}
            <motion.div className="g-card-glow"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
              style={{ padding: 32 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <p className="label-xs" style={{ marginBottom: 6 }}>Entrepreneurship Studio</p>
                  <p className="display" style={{ fontSize: 22 }}>Your Business Journey</p>
                </div>
                <Link to="/entrepreneurship" className="btn-primary" style={{ fontSize: 13, padding: "9px 20px" }}>
                  Open Studio
                </Link>
              </div>
              {isAdmin && (
                <div className="g-strip" style={{ borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--muted-fg)", marginBottom: 8 }}>
                    Admin Studio Controls
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn-secondary" style={{ padding: "8px 14px", fontSize: 12 }}>Add Opportunity</button>
                    <button className="btn-secondary" style={{ padding: "8px 14px", fontSize: 12 }}>Edit Resources</button>
                    <button className="btn-secondary" style={{ padding: "8px 14px", fontSize: 12 }}>Remove Outdated Content</button>
                  </div>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                {[
                  { icon: "💡", label: "Ideas", color: "hsl(24,67%,42%)", value: journey.ideas },
                  { icon: "📊", label: "Plans", color: "var(--primary-fg)", value: journey.plans },
                  { icon: "🎯", label: "Pitches", color: "var(--accent-fg)", value: journey.pitches },
                ].map((item, i) => (
                  <div key={i} className="g-strip" style={{ borderRadius: 16, padding: "18px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 30, marginBottom: 8 }}>{item.icon}</div>
                    <div style={{ fontSize: 26, fontFamily: "var(--font-display)", fontWeight: 700, color: item.color }}>{item.value}</div>
                    <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 2, fontFamily: "var(--font-body)" }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

            {/* Confidence Score */}
            <motion.div className="g-card-glow"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.14 }}
              style={{ padding: 28 }}
            >
              <p className="label-sm" style={{ marginBottom: 8 }}>Confidence Score</p>
              <p className="display" style={{ fontSize: 26, color: "var(--primary-fg)", marginBottom: 10 }}>
                {hasScenarios ? String(confidenceScore) : "Not scored yet"}
              </p>
              <p style={{ fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.6, fontFamily: "var(--font-body)" }}>
                {hasScenarios
                  ? `Based on ${scenariosCompleted} completed scenario${scenariosCompleted === 1 ? "" : "s"}.`
                  : "Complete practice scenarios to generate your confidence score."}
              </p>
              <Link to="/simulation" className="btn-secondary" style={{ marginTop: 14, display: "inline-flex" }}>
                Start Practice
              </Link>
            </motion.div>

            {/* Practice Lab */}
            <motion.div className="g-card-glow"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.19 }}
              style={{ padding: 28 }}
            >
              <p className="label-sm" style={{ marginBottom: 8 }}>Practice Lab</p>
              <p className="display" style={{ fontSize: 19, marginBottom: 6 }}>
                {hasScenarios
                  ? `${scenariosCompleted} scenario${scenariosCompleted === 1 ? "" : "s"} completed`
                  : "No scenarios completed yet"}
              </p>
              <p style={{ fontSize: 13, color: "var(--muted-fg)", marginBottom: 14, fontFamily: "var(--font-body)" }}>
                {hasScenarios
                  ? "Keep practicing to build your confidence."
                  : "Start your first practice to see progress here."}
              </p>
              <Link to="/simulation" className="btn-primary" style={{ marginTop: 4, width: "100%", padding: "12px", textAlign: "center" }}>
                Go to Practice Lab
              </Link>
            </motion.div>

            {/* Saved Schemes */}
            <motion.div className="g-card"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.24 }}
              style={{ padding: 28 }}
            >
              <p className="label-sm" style={{ marginBottom: 8 }}>Saved Schemes</p>
              <p className="display" style={{ fontSize: 20 }}>No saved schemes</p>
              <p style={{ fontSize: 13, color: "var(--muted-fg)", marginTop: 6, marginBottom: 14, fontFamily: "var(--font-body)" }}>
                Save schemes to track them here.
              </p>
              <Link to="/government" className="btn-secondary" style={{ display: "inline-flex" }}>
                Explore Schemes
              </Link>
              {isAdmin && (
                <div className="g-strip" style={{ borderRadius: 16, padding: "12px 14px", marginTop: 14 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--muted-fg)", marginBottom: 8 }}>
                    Admin Scheme Actions
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn-secondary" style={{ padding: "7px 12px", fontSize: 12 }}>Add Government Scheme</button>
                    <button className="btn-secondary" style={{ padding: "7px 12px", fontSize: 12 }}>Edit Program Details</button>
                    <button className="btn-secondary" style={{ padding: "7px 12px", fontSize: 12 }}>Highlight Featured Scheme</button>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Opportunities for Growth */}
            <motion.div className="g-card-glow"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.29 }}
              style={{ padding: 28 }}
            >
              <p className="display" style={{ fontSize: 18, marginBottom: 18 }}>Opportunities for Growth</p>
              <p style={{ fontSize: 13.5, color: "var(--muted-fg)", lineHeight: 1.6, fontFamily: "var(--font-body)" }}>
                Personalized recommendations will appear after you complete onboarding and explore programs.
              </p>
              <Link to="/government" className="btn-secondary" style={{ marginTop: 14, display: "inline-flex" }}>
                View Programs
              </Link>
              {isAdmin && (
                <div className="g-strip" style={{ borderRadius: 16, padding: "12px 14px", marginTop: 14 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--muted-fg)", marginBottom: 8 }}>
                    Admin Opportunity Actions
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn-secondary" style={{ padding: "7px 12px", fontSize: 12 }}>Add Opportunity</button>
                    <button className="btn-secondary" style={{ padding: "7px 12px", fontSize: 12 }}>Edit Program Details</button>
                    <button className="btn-secondary" style={{ padding: "7px 12px", fontSize: 12 }}>Highlight Featured</button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;
