import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";

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

// ── Success checkmark ──────────────────────────────────────────────────────────
const SuccessIcon = () => (
  <motion.div
    className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-green-400/30 bg-green-400/15"
    initial={{ scale: 0 }}
    animate={{ scale: 1 }}
    transition={{ type: "spring", damping: 14, stiffness: 200 }}
  >
    <motion.svg
      width="36" height="36" viewBox="0 0 36 36" fill="none"
      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <motion.path
        d="M7 18l7 7 15-15"
        stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.25 }}
      />
    </motion.svg>
  </motion.div>
);

// ── Constants ──────────────────────────────────────────────────────────────────
type AccountRole = "user" | "admin";

const STEPS         = ["Basic Info", "Role", "Interests", "Security"];
const INTERESTS     = ["Digital Safety", "Business", "Government", "Community"];
const PROFILE_ROLES = ["Student", "Professional", "Homemaker", "Entrepreneur"];

const ACCOUNT_ROLES: Array<{ id: AccountRole; label: string; description: string }> = [
  {
    id: "user",
    label: "User",
    description: "Learn, practice, and explore community resources.",
  },
  {
    id: "admin",
    label: "Admin",
    description: "Manage content, moderation, and platform insights.",
  },
];

// ── Component ──────────────────────────────────────────────────────────────────
const RegisterPage = () => {
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

  const [formData, setFormData] = useState({
    name:            "",
    email:           "",
    phone:           "",
    accountRole:     "user" as AccountRole,
    profileRole:     "",
    interests:       [] as string[],
    password:        "",
    confirmPassword: "",
  });

  const navigate = useNavigate();
  const location = useLocation();

  // ── Helpers ────────────────────────────────────────────────────────────────
  const patch = (field: string, value: unknown) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const toggleInterest = (item: string) =>
    patch(
      "interests",
      formData.interests.includes(item)
        ? formData.interests.filter((x) => x !== item)
        : [...formData.interests, item],
    );

  const canNext = (): boolean => {
    switch (step) {
      case 0: return (
        formData.accountRole.trim().length > 0 &&
        formData.name.trim().length > 0 &&
        formData.email.trim().length > 0
      );
      case 1: return formData.profileRole.trim().length > 0;
      case 2: return formData.interests.length > 0;
      case 3: return (
        formData.password.trim().length >= 6 &&
        formData.password === formData.confirmPassword
      );
      default: return true;
    }
  };

  const goNext = () => {
    setError("");
    if (step === 3) {
      if (formData.password !== formData.confirmPassword) { setError("Passwords do not match."); return; }
      if (formData.password.length < 6) { setError("Password must be at least 6 characters."); return; }
    }
    if (step < 3) setStep((s) => s + 1);
  };

  const goPrev = () => { setError(""); setStep((s) => Math.max(0, s - 1)); };

  // ── Submit registration ────────────────────────────────────────────────────
  const handleCreateAccount = async () => {
    if (!canNext() || loading) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:      formData.name,
          email:     formData.email,
          phone:     formData.phone,
          role:      formData.accountRole,
          user_role: formData.profileRole,
          interests: formData.interests,
          password:  formData.password,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Registration failed.");

      // Show success screen briefly, then navigate to /login
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Google OAuth ───────────────────────────────────────────────────────────
  const handleGoogleRegister = () => {
    setGoogleLoading(true);
    setError("");
    window.location.href =
      `${API_BASE}/api/auth/google?role=${formData.accountRole}&redirect=${encodeURIComponent("/login")}`;
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-6rem] top-10 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute bottom-[-4rem] right-[-3rem] h-80 w-80 rounded-full bg-highlight/20 blur-3xl" />
        </div>
        <motion.div
          className="glass-glow relative z-10 w-full max-w-md p-10 text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <SuccessIcon />
          <h2 className="font-serif text-2xl font-bold mb-2">Account Created!</h2>
          <p className="text-muted-foreground text-sm mb-1">
            Welcome, <span className="font-semibold text-foreground">{formData.name}</span>!
          </p>
          <p className="text-muted-foreground text-sm">
            Redirecting you to sign in…
          </p>
          <div className="mt-6 h-1 w-full rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full bg-primary/60 rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.9, ease: "linear" }}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-hidden flex items-center">
      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-6rem] top-10 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-[-4rem] right-[-3rem] h-80 w-80 rounded-full bg-highlight/20 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-start gap-12 lg:gap-14 py-10">

        {/* ── Form card ── */}
        <motion.div
          className="flex-1 w-full max-w-xl glass-glow p-10 md:p-12"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="font-serif text-3xl md:text-4xl font-bold mb-2">
            Create Your Account
          </h1>
          <p className="text-muted-foreground mb-8">Begin your empowerment journey</p>

          {/* Step progress bar */}
          <div className="flex gap-2 mb-10">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full h-1.5 rounded-full transition-all duration-500 ${
                    i <= step ? "bg-primary/60" : "bg-glass-border"
                  }`}
                />
                <span className={`text-xs ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>
                  {s}
                </span>
              </div>
            ))}
          </div>

          {/* Error banner */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300"
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
              transition={{ duration: 0.4 }}
              className="space-y-5"
            >

              {/* ── Step 0: Basic Info ── */}
              {step === 0 && (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Choose account access</p>
                    <div className="grid grid-cols-2 gap-4">
                      {ACCOUNT_ROLES.map((option) => {
                        const activeClass =
                          option.id === "admin"
                            ? "border-accent/40 bg-accent/20"
                            : "border-primary/40 bg-primary/20";
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => patch("accountRole", option.id)}
                            className={`glass-strip text-center py-6 transition-all ${
                              formData.accountRole === option.id ? activeClass : ""
                            }`}
                          >
                            <p className="font-semibold">{option.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {option.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <input
                    placeholder="Full Name *"
                    value={formData.name}
                    onChange={(e) => patch("name", e.target.value)}
                    className="glass-input"
                  />
                  <input
                    placeholder="Email *"
                    type="email"
                    value={formData.email}
                    onChange={(e) => patch("email", e.target.value)}
                    className="glass-input"
                  />
                  <input
                    placeholder="Phone (optional)"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => patch("phone", e.target.value)}
                    className="glass-input"
                  />

                  {/* Divider */}
                  <div className="relative flex items-center gap-3 pt-1">
                    <div className="flex-1 border-t border-white/15" />
                    <span className="text-xs text-muted-foreground">or sign up with</span>
                    <div className="flex-1 border-t border-white/15" />
                  </div>

                  {/* Google */}
                  <button
                    type="button"
                    onClick={handleGoogleRegister}
                    disabled={googleLoading}
                    className="glass-strip inline-flex w-full items-center justify-center gap-3 py-3 text-sm font-medium hover:bg-white/10 transition-all disabled:opacity-60"
                  >
                    {googleLoading
                      ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      : <GoogleIcon />}
                    Continue with Google
                  </button>
                </>
              )}

              {/* ── Step 1: Role ── */}
              {step === 1 && (
                <div className="grid grid-cols-2 gap-4">
                  {PROFILE_ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => patch("profileRole", r)}
                      className={`glass-strip text-center py-6 transition-all ${
                        formData.profileRole === r ? "border-primary/40 bg-primary/20" : ""
                      }`}
                    >
                      <p className="font-semibold">{r}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* ── Step 2: Interests ── */}
              {step === 2 && (
                <>
                  <p className="text-sm text-muted-foreground -mt-1">Select at least one area you care about.</p>
                  <div className="grid grid-cols-2 gap-4">
                    {INTERESTS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleInterest(item)}
                        className={`glass-strip text-center py-6 transition-all ${
                          formData.interests.includes(item)
                            ? "border-accent/50 bg-accent/20"
                            : ""
                        }`}
                      >
                        <p className="font-semibold text-sm">{item}</p>
                        {formData.interests.includes(item) && (
                          <span className="mt-1 block text-xs text-accent">✓ Selected</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ── Step 3: Security ── */}
              {step === 3 && (
                <>
                  <input
                    type="password"
                    placeholder="Create Password (min 6 chars)"
                    value={formData.password}
                    onChange={(e) => patch("password", e.target.value)}
                    className="glass-input"
                  />
                  <input
                    type="password"
                    placeholder="Confirm Password"
                    value={formData.confirmPassword}
                    onChange={(e) => patch("confirmPassword", e.target.value)}
                    className="glass-input"
                  />
                  {/* Live mismatch hint */}
                  {formData.confirmPassword.length > 0 &&
                    formData.password !== formData.confirmPassword && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs text-red-400"
                      >
                        Passwords do not match.
                      </motion.p>
                    )}
                  {formData.confirmPassword.length > 0 &&
                    formData.password === formData.confirmPassword &&
                    formData.password.length >= 6 && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs text-green-400"
                      >
                        ✓ Passwords match
                      </motion.p>
                    )}
                </>
              )}

            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex gap-4 mt-10">
            {step > 0 && (
              <button type="button" onClick={goPrev} className="glass-pill flex-1 text-center">
                ← Back
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canNext()}
                className="glass-pill-primary flex-1 text-center disabled:opacity-50 disabled:pointer-events-none"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreateAccount}
                disabled={!canNext() || loading}
                className="glass-pill-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading
                  ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Creating…</>
                  : "Create Account"}
              </button>
            )}
          </div>

          <p className="text-sm text-muted-foreground text-center mt-6">
            Already have an account?{" "}
            <Link
              to="/login"
              state={location.state}
              className="text-primary font-medium hover:underline"
            >
              Sign In
            </Link>
          </p>
        </motion.div>

        {/* ── Profile preview panel (desktop only) ── */}
        <motion.div
          className="flex-1 hidden lg:block sticky top-24"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="glass p-10 space-y-6">
            <h3 className="font-serif text-xl font-bold mb-4">Profile Preview</h3>

            {/* Avatar + name */}
            <div className="glass-strip flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/30 flex items-center justify-center text-2xl font-semibold">
                {formData.name ? formData.name[0]?.toUpperCase() : "?"}
              </div>
              <div>
                <p className="font-semibold">{formData.name || "Your Name"}</p>
                <p className="text-sm text-muted-foreground">{formData.email || "email@example.com"}</p>
              </div>
            </div>

            {formData.phone && (
              <div className="glass-strip">
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{formData.phone}</p>
              </div>
            )}

            {formData.accountRole && (
              <div className="glass-strip">
                <p className="text-sm text-muted-foreground">Account access</p>
                <p className="font-medium">
                  {formData.accountRole === "admin" ? "Admin" : "User"}
                </p>
              </div>
            )}

            {formData.profileRole && (
              <div className="glass-strip">
                <p className="text-sm text-muted-foreground">I am a</p>
                <p className="font-medium">{formData.profileRole}</p>
              </div>
            )}

            {formData.interests.length > 0 && (
              <div className="glass-strip">
                <p className="text-sm text-muted-foreground mb-2">Interests</p>
                <div className="flex flex-wrap gap-2">
                  {formData.interests.map((item) => (
                    <span key={item} className="glass-pill text-xs py-1 px-3">{item}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Step progress summary */}
            <div className="glass-strip">
              <p className="text-sm text-muted-foreground">Progress</p>
              <p className="font-medium mt-1">
                Step {step + 1} of {STEPS.length} — {STEPS[step]}
              </p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-primary/60"
                  animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>

            {/* After registration note */}
            <div className="glass-strip border border-green-400/20 bg-green-400/5">
              <p className="text-xs text-muted-foreground mb-1">After registration</p>
              <p className="text-sm font-medium text-green-300">
                You&apos;ll be redirected to sign in automatically.
              </p>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
};

export default RegisterPage;
