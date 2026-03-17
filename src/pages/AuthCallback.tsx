/**
 * AuthCallback.tsx
 *
 * This page is the single landing point for ALL Google OAuth redirects
 * from the Flask backend.  The backend should redirect to:
 *
 *   http://localhost:5173/auth/callback?auth=google&name=...&email=...&role=...&token=...
 *
 * This page reads those params, writes them to localStorage via setAuth(),
 * then navigates the user to the correct destination.
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setAuth, type AuthRole } from "@/lib/auth";
import { motion } from "framer-motion";

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "error">("processing");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const auth  = searchParams.get("auth");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setErrorMsg(
        error === "google_not_configured"
          ? "Google login is not configured on the server."
          : error === "google_no_email"
          ? "Google did not return an email address."
          : error === "admin_access_denied"
          ? "This account does not have admin access."
          : `Authentication failed: ${error}`
      );
      return;
    }

    if (auth === "google") {
      const name  = searchParams.get("name")  || "";
      const email = searchParams.get("email") || "";
      const role  = (searchParams.get("role") || "user") as AuthRole;
      const token = searchParams.get("token") || undefined;

      setAuth({
        role,
        email,
        name,
        loggedInAt: new Date().toISOString(),
        token,
      });

      // Redirect to dashboard (or admin if role is admin)
      setTimeout(() => {
        navigate(role === "admin" ? "/admin" : "/dashboard", { replace: true });
      }, 600);
      return;
    }

    // Unknown callback — redirect to login
    navigate("/login", { replace: true });
  }, [searchParams, navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FDF6EC",
        fontFamily: '"Times New Roman", Times, serif',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(18px)",
          border: "1px solid rgba(228,172,178,0.35)",
          borderRadius: 24,
          padding: "48px 56px",
          textAlign: "center",
          boxShadow: "0 16px 60px rgba(44,24,16,0.10)",
          maxWidth: 380,
          width: "100%",
        }}
      >
        {status === "processing" ? (
          <>
            {/* Spinner */}
            <motion.div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                border: "3px solid rgba(228,172,178,0.25)",
                borderTopColor: "#C17B7B",
                margin: "0 auto 24px",
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 22,
                fontWeight: 700,
                color: "#2C1810",
                marginBottom: 8,
              }}
            >
              Signing you in…
            </h2>
            <p style={{ fontSize: 13, color: "#8B6B5A" }}>
              Completing Google authentication
            </p>
          </>
        ) : (
          <>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "rgba(217,107,107,0.15)",
                border: "1px solid rgba(217,107,107,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
                fontSize: 22,
              }}
            >
              ⚠
            </div>
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 20,
                fontWeight: 700,
                color: "#2C1810",
                marginBottom: 10,
              }}
            >
              Authentication Failed
            </h2>
            <p style={{ fontSize: 13, color: "#8B6B5A", marginBottom: 24 }}>
              {errorMsg}
            </p>
            <button
              onClick={() => navigate("/login", { replace: true })}
              style={{
                background: "linear-gradient(135deg, #E4ACB2 0%, #C17B7B 100%)",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                padding: "10px 28px",
                fontFamily: '"Times New Roman", serif',
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Back to Login
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default AuthCallback;
