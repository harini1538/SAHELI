import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, type MotionStyle } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { setAuth, type AuthRole } from "@/lib/auth";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

// ── Google SVG Icon ────────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M47.532 24.552c0-1.636-.147-3.2-.422-4.694H24.48v8.875h13.006c-.56 3.02-2.26 5.578-4.817 7.293v6.063h7.796c4.562-4.202 7.067-10.39 7.067-17.537z" fill="#4285F4"/>
    <path d="M24.48 48c6.528 0 12.004-2.162 16.006-5.911l-7.796-6.063c-2.162 1.449-4.928 2.305-8.21 2.305-6.312 0-11.658-4.263-13.57-9.994H2.847v6.254C6.83 42.713 15.076 48 24.48 48z" fill="#34A853"/>
    <path d="M10.91 28.337A14.378 14.378 0 0 1 10.13 24c0-1.508.26-2.974.78-4.337v-6.254H2.847A23.985 23.985 0 0 0 .48 24c0 3.868.927 7.53 2.367 10.591l8.063-6.254z" fill="#FBBC05"/>
    <path d="M24.48 9.534c3.554 0 6.742 1.222 9.253 3.622l6.942-6.941C36.476 2.391 30.999 0 24.48 0 15.076 0 6.83 5.287 2.847 13.41l8.063 6.254c1.912-5.731 7.258-10.13 13.57-10.13z" fill="#EA4335"/>
  </svg>
);

// ── Women image panel ──────────────────────────────────────────────────────────
const imageWrapperStyle: MotionStyle = {
  position: "relative",
  width: "50%",
  maxWidth: 340,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  margin: "8px auto 0",
};

const glowRingStyle: CSSProperties = {
  position: "absolute",
  width: "85%",
  height: "85%",
  borderRadius: "50%",
  background:
    "radial-gradient(ellipse, rgba(224,122,95,0.22) 0%, rgba(255,180,140,0.12) 50%, transparent 75%)",
  filter: "blur(18px)",
  zIndex: 0,
};

const imageContainerStyle: MotionStyle = {
  position: "relative",
  zIndex: 1,
  width: "80%",
  borderRadius: 22,
  overflow: "hidden",
  boxShadow:
    "0 12px 48px rgba(180,90,60,0.18), 0 2px 12px rgba(0,0,0,0.08)",
  border: "1.5px solid rgba(255,255,255,0.7)",
};

const imageStyle: CSSProperties = {
  width: "100%",
  height: "auto",
  display: "block",
  objectFit: "cover",
};

const imageOverlayStyle: CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  height: "30%",
  background:
    "linear-gradient(to top, rgba(253,232,216,0.45) 0%, transparent 100%)",
  pointerEvents: "none",
};

const WomenImage = () => (
  <motion.div
    style={imageWrapperStyle}
    initial={{ opacity: 0, scale: 0.92, y: 16 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
  >
    <div style={glowRingStyle} />
    <motion.div
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      style={imageContainerStyle}
    >
      <img
        src="https://img.freepik.com/premium-photo/illustration-three-diverse-women-embracing-friendship-support-unity-empowerment-concept_1132312-2352.jpg"
        alt="Three diverse women embracing — friendship, unity & empowerment"
        style={imageStyle}
      />
      <div style={imageOverlayStyle} />
    </motion.div>
  </motion.div>
);

// ── Constants ──────────────────────────────────────────────────────────────────
const steps = ["Identity", "Security"];

const roleOptions: Array<{
  id: AuthRole;
  label: string;
  description: string;
  Icon: typeof UserRound;
  activeClass: string;
}> = [
  {
    id: "user",
    label: "User",
    description: "Continue to your learning dashboard and community tools.",
    Icon: UserRound,
    activeClass: "border-primary/40 bg-primary/20",
  },
  {
    id: "admin",
    label: "Admin",
    description: "Open moderation, analytics, and admin controls.",
    Icon: ShieldCheck,
    activeClass: "border-highlight/40 bg-highlight/20",
  },
];

const deriveDisplayName = (value: string) => {
  const source = value.split("@")[0]?.trim();
  if (!source) return "Your account";
  return source
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

// ── Component ──────────────────────────────────────────────────────────────────
const LoginPage = () => {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<AuthRole>("user");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [safeCheck, setSafeCheck] = useState(false);
  const [showCoinBadge, setShowCoinBadge] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = (
    location.state as { from?: { pathname?: string } } | null
  )?.from?.pathname;

  const canContinue = email.trim().length > 0;
  const canSubmit = password.trim().length > 0 && safeCheck;
  const displayName = deriveDisplayName(email);
  const resolveDestination = (nextRole: AuthRole) =>
    fromPath ?? (nextRole === "admin" ? "/admin" : "/dashboard");
  const destination = resolveDestination(role);

  // ── Handle Google OAuth redirect params on return ──────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const authParam = params.get("auth");
    if (authParam === "google") {
      const name  = params.get("name") || "";
      const email = params.get("email") || "";
      const role  = (params.get("role") || "user") as AuthRole;
      const token = params.get("token") || undefined;
      setAuth({
        role,
        email,
        name,
        loggedInAt: new Date().toISOString(),
        token,
      });
      navigate(resolveDestination(role), { replace: true });
    }
  }, [location.search, navigate]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleNext = () => {
    if (!canContinue) return;
    setError("");
    setStep(1);
  };

  const handleLogin = async () => {
    if (!canSubmit || loading) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Login failed");

      // Store auth state — use name from API response if available
      const resolvedRole = (data.user?.role ?? role) as AuthRole;
      setAuth({
        role: resolvedRole,
        email: data.user?.email ?? email,
        name: data.user?.name ?? displayName,
        phone: data.user?.phone ?? undefined,
        user_role: data.user?.user_role ?? undefined,
        interests: Array.isArray(data.user?.interests) ? data.user.interests : undefined,
        loggedInAt: new Date().toISOString(),
        token: data.token,
      });

      setShowCoinBadge(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setShowCoinBadge(false);
        navigate(resolveDestination(resolvedRole), { replace: true });
      }, 900);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth — redirects to Flask backend
  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    setError("");
    window.location.href = `${API_BASE}/api/auth/google?role=${role}&redirect=${encodeURIComponent(destination)}`;
  };

  return (
    <div className="relative flex min-h-screen items-center overflow-hidden">
      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-6rem] top-10 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-[-4rem] right-[-3rem] h-80 w-80 rounded-full bg-highlight/20 blur-3xl" />
      </div>
<div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-start gap-10 px-4 py-8 md:py-10 lg:flex-row lg:gap-12 min-h-screen">
        {/* ── Form card ── */}
        <motion.div
          className="glass-glow w-full max-w-xl flex-1 p-8 md:p-10"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="glass-pill-secondary mb-5 inline-flex items-center gap-2 px-4 py-2 text-xs">
                <Sparkles className="h-4 w-4" />
                Secure Sign In
              </div>
              <h1 className="font-serif text-3xl font-bold md:text-4xl">
                Welcome Back
              </h1>
              <p className="mt-2 text-muted-foreground">
                Sign in to continue your empowerment journey.
              </p>
            </div>
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/20 text-primary-foreground shadow-sm sm:flex">
              <span className="font-serif text-xl font-bold">S</span>
            </div>
          </div>

          {/* Step progress */}
          <div className="mb-8 flex gap-2">
            {steps.map((label, index) => (
              <div key={label} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`h-1.5 w-full rounded-full transition-all duration-500 ${
                    index <= step ? "bg-primary/60" : "bg-glass-border"
                  }`}
                />
                <span
                  className={`text-xs ${
                    index <= step ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Role selector */}
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {roleOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setRole(option.id)}
                className={`glass-strip text-left ${
                  role === option.id ? option.activeClass : ""
                }`}
              >
                <div className="mb-3 flex h-5 w-11 items-center justify-center rounded-2xl border border-white/40 bg-white/40">
                  <option.Icon className="h-5 w-5" />
                </div>
                <p className="font-semibold">{option.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {option.description}
                </p>
              </button>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300"
            >
              {error}
            </motion.div>
          )}

          {/* Step content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.35 }}
              className="space-y-5"
            >
              {step === 0 ? (
                <>
                  {/* Email field */}
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground/80">
                      <Mail className="h-3 w-4" />
                      Email or Phone
                    </label>
                    <input
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleNext()}
                      placeholder="hello@example.com"
                      className="glass-input"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleNext}
                    className={`glass-pill-primary inline-flex w-full items-center justify-center gap-2 ${
                      canContinue ? "" : "pointer-events-none opacity-55"
                    }`}
                  >
                    Continue
                    <ArrowRight className="h-3 w-4" />
                  </button>

                  {/* Divider */}
                  <div className="relative flex items-center gap-3">
                    <div className="flex-1 border-t border-white/15" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <div className="flex-1 border-t border-white/15" />
                  </div>

                  {/* Google button */}
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={googleLoading}
                    className="glass-strip inline-flex w-full items-center justify-center gap-3 py-3 text-sm font-medium transition-all hover:bg-white/10 disabled:opacity-60"
                  >
                    {googleLoading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <GoogleIcon />
                    )}
                    Continue with Google
                  </button>
                </>
              ) : (
                <>
                  {/* Account preview strip */}
                  <div className="glass-strip flex items-center gap-3 py-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/25 font-semibold text-primary-foreground">
                      {displayName.charAt(0).toUpperCase() || "S"}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{email}</p>
                      <p className="text-sm text-muted-foreground">
                        {role === "admin" ? "Admin workspace" : "Personal workspace"}
                      </p>
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground/80">
                      <LockKeyhole className="h-4 w-4" />
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && canSubmit && handleLogin()}
                      placeholder="Enter your password"
                      className="glass-input"
                    />
                  </div>

                  {/* Safe device check */}
                  <div className="glass-strip flex items-start gap-3 py-4">
                    <button
                      type="button"
                      onClick={() => setSafeCheck((v) => !v)}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                        safeCheck
                          ? "border-primary/50 bg-primary/60 text-primary-foreground"
                          : "border-glass-border bg-white/40 text-transparent"
                      }`}
                      aria-pressed={safeCheck}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <div>
                      <p className="font-medium text-foreground">This is a secure device</p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        I understand the platform safety guidelines and I am signing in from a trusted device.
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-col gap-4 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="glass-pill inline-flex flex-1 items-center justify-center gap-2 text-center"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleLogin}
                      disabled={!canSubmit || loading}
                      className={`glass-pill-primary inline-flex flex-1 items-center justify-center gap-2 text-center ${
                        canSubmit && !loading ? "" : "pointer-events-none opacity-50"
                      }`}
                    >
                      {loading ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Signing in…
                        </>
                      ) : (
                        <>
                          Sign In
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              to="/register"
              state={location.state}
              className="font-medium text-primary hover:underline"
            >
              Create one
            </Link>
          </p>
        </motion.div>

        {/* ── Right panel ── */}
        <motion.div
          className="hidden flex-1 lg:block lg:sticky lg:top-20"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.45 }}
        >
          <div className="glass space-y-5 p-8">
            <div>
              <div className="glass-pill-secondary mb-4 inline-flex items-center gap-2 px-4 py-2 text-xs">
                <ShieldCheck className="h-4 w-4" />
                Session Preview
              </div>
              <h2 className="font-serif text-3xl font-bold leading-tight">
                Enter a calmer, safer space for digital confidence.
              </h2>
            </div>

            <div className="glass-strip flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary/35 text-lg font-semibold text-secondary-foreground">
                {displayName.charAt(0).toUpperCase() || "S"}
              </div>
              <div>
                <p className="font-semibold">{displayName}</p>
                <p className="text-sm text-muted-foreground">
                  {email || "email@example.com"}
                </p>
              </div>
            </div>

            <WomenImage />

            <div className="glass-strip">
              <p className="text-sm text-muted-foreground">Selected role</p>
              <p className="mt-1 font-medium">
                {role === "admin" ? "Admin" : "User"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {role === "admin"
                  ? "You will land in the admin workspace after sign in."
                  : "You will land in your learning dashboard after sign in."}
              </p>
            </div>

            <div className="glass-strip flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Welcome reward</p>
                <p className="mt-1 font-medium">
                  Daily practice coins are ready when you sign in.
                </p>
              </div>
              <div className="coin-badge">
                <Coins className="h-4 w-4" />
                <span>50</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Coin badge toast */}
      <AnimatePresence>
        {showCoinBadge && (
          <motion.div
            className="glass-strong fixed right-6 top-24 z-20 flex items-center gap-3 rounded-full border border-accent/40 px-5 py-3 shadow-lg"
            initial={{ opacity: 0, y: -20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.92 }}
            transition={{ duration: 0.25 }}
          >
            <div className="coin-badge">
              <Coins className="h-4 w-4" />
              <span>50</span>
            </div>
            <div>
              <p className="text-sm font-semibold">Welcome back reward</p>
              <p className="text-xs text-muted-foreground">
                Practice coins added to your session.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LoginPage;
