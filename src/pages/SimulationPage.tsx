import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";
import { getAuth, getToken } from "../lib/auth";

// ─── Backend config ────────────────────────────────────────────────────────────
const API_BASE =
  (import.meta as { env: Record<string, string> }).env?.VITE_API_URL ??
  "http://localhost:5000";

const authHeaders = (headers: Record<string, string> = {}) => {
  const token = getToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
};

const apiFetch = (url: string, options: RequestInit = {}) => {
  const headers = authHeaders({ ...(options.headers as Record<string, string> ?? {}) });
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(url, { ...options, headers });
};

const STORAGE_KEYS = {
  coins: "userCoins",
  scenarios: "scenariosCompleted",
  confidence: "confidenceScore",
} as const;

const DEFAULT_COINS = 50;

const readStoredNumber = (key: string, fallback: number) => {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ensureStoredCoins = () => {
  if (typeof window === "undefined") return DEFAULT_COINS;
  const stored = window.localStorage.getItem(STORAGE_KEYS.coins);
  if (stored === null) {
    window.localStorage.setItem(STORAGE_KEYS.coins, String(DEFAULT_COINS));
    return DEFAULT_COINS;
  }
  const parsed = Number.parseInt(stored, 10);
  if (!Number.isFinite(parsed)) {
    window.localStorage.setItem(STORAGE_KEYS.coins, String(DEFAULT_COINS));
    return DEFAULT_COINS;
  }
  return parsed;
};

// ─── API helpers ───────────────────────────────────────────────────────────────
async function apiGenerate(
  prompt: string
): Promise<{ simulation: Simulation; meta: SimMeta }> {
  const res = await apiFetch(`${API_BASE}/api/sim/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to generate simulation.");
  return data as { simulation: Simulation; meta: SimMeta };
}

async function apiTrack(payload: {
  simulation_id: string;
  event:
    | "simulation_start"
    | "step_complete"
    | "fraud_tip_viewed"
    | "simulation_complete";
  step_index?: number;
  time_spent_ms?: number;
}) {
  try {
    await apiFetch(`${API_BASE}/api/sim/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* analytics is best-effort */
  }
}

async function apiSaveTemplate(
  simulation: Simulation,
  recommended = false
): Promise<string> {
  const res = await apiFetch(`${API_BASE}/api/sim/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ simulation, recommended }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to save template.");
  return data.template_id as string;
}

async function apiGetTemplates(): Promise<TemplateSummary[]> {
  const res = await apiFetch(`${API_BASE}/api/sim/templates`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch templates.");
  return data.templates as TemplateSummary[];
}

async function apiDeleteTemplate(tid: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/sim/templates/${tid}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const d = await res.json();
    throw new Error(d.error ?? "Delete failed.");
  }
}

async function apiPatchTemplate(
  tid: string,
  patch: Record<string, unknown>
): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/sim/templates/${tid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const d = await res.json();
    throw new Error(d.error ?? "Update failed.");
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────
type UIElementType =
  | "home_screen"
  | "search_bar"
  | "contact_list"
  | "amount_input"
  | "pin_input"
  | "confirmation"
  | "qr_scanner"
  | "form_fields"
  | "menu_list"
  | "success_screen"
  | "atm_screen"
  | "ticket_booking"
  | "recharge_screen"
  | "otp_input"
  | "bank_dashboard";

interface UIElement {
  type: UIElementType;
  label: string;
  placeholder?: string;
  options?: string[];
  value?: string;
  buttonText?: string;
  subtext?: string;
}

interface SimStep {
  id: number;
  title: string;
  instruction: string;
  tip: string | null;
  uiElement: UIElement;
}

interface Simulation {
  title: string;
  app: string;
  appIcon: string;
  appColor: string;
  appColorSecondary: string;
  steps: SimStep[];
  fraudWarning: string | null;
  completionMessage: string;
  coinsReward: number;
}

interface SimMeta {
  simulation_id: string;
  elapsed_s: number;
  source: "groq" | "dataset";
}

interface TemplateSummary {
  id: string;
  title: string;
  app: string;
  appIcon: string;
  steps_count: number;
  saved_at: string;
  recommended: boolean;
}

// ─── App-specific default options ─────────────────────────────────────────────
// When Groq/dataset returns empty options, we fill in smart defaults per app
function getAppDefaults(app: string, type: UIElementType): string[] {
  const a = app.toLowerCase();
  if (type === "home_screen") {
    if (a.includes("gpay") || a.includes("google pay"))
      return ["New Payment", "Pay Contacts", "Scan QR", "History"];
    if (a.includes("phonepe"))
      return ["Send Money", "Recharge", "Pay Bills", "UPI"];
    if (a.includes("paytm"))
      return ["Pay / Send", "Recharge", "Pay Bills", "Passbook"];
    if (a.includes("irctc"))
      return ["Book Ticket", "My Bookings", "Train Search", "PNR Status"];
    if (a.includes("atm") || a.includes("machine"))
      return ["Withdraw Cash", "Balance Enquiry", "Mini Statement", "Change PIN"];
    if (a.includes("bank") || a.includes("sbi") || a.includes("hdfc"))
      return ["Transfer Money", "Check Balance", "Pay Bills", "Statements"];
    if (a.includes("recharge") || a.includes("mobile"))
      return ["Mobile Recharge", "DTH Recharge", "Data Pack", "History"];
    if (a.includes("electricity"))
      return ["Pay Bill", "View Bill", "Complaint", "History"];
    return ["Get Started", "Learn More", "Settings", "Help"];
  }
  return [];
}

// ─── Pulsing tap hint ──────────────────────────────────────────────────────────
const TapHint = ({ color }: { color: string }) => (
  <motion.div
    className="flex items-center justify-center gap-2 mt-5"
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: [0.5, 1, 0.5], y: 0 }}
    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
  >
    <span className="text-sm" style={{ color }}>
      👆
    </span>
    <span className="text-xs font-semibold" style={{ color, opacity: 0.75 }}>
      Tap any option above to continue
    </span>
  </motion.div>
);

// ─── UI Element Renderer ───────────────────────────────────────────────────────
const UIRenderer = ({
  element,
  appColor,
  appColorSecondary,
  appName,
  onInteract,
  isActive,
}: {
  element: UIElement;
  appColor: string;
  appColorSecondary: string;
  appName: string;
  onInteract: () => void;
  isActive: boolean;
}) => {
  const [inputVal, setInputVal] = useState(element.value || "");
  const [selected, setSelected] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Reset local state when step changes
  useEffect(() => {
    setInputVal(element.value || "");
    setSelected(null);
    setScanning(false);
  }, [element]);

  // Stable trigger ref — avoids stale closure bug
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const trigger = useCallback(() => {
    if (isActiveRef.current) onInteract();
  }, [onInteract]);

  // ── Shared sub-components ──────────────────────────────────────────────────
  const PrimaryBtn = ({ label }: { label: string }) => (
    <button
      onClick={trigger}
      className="w-full mt-4 py-4 rounded-2xl font-bold text-sm tracking-wide transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-95"
      style={{
        background: `linear-gradient(135deg, ${appColor}, ${appColor}cc)`,
        color: "#fff",
        boxShadow: `0 4px 20px ${appColor}55`,
        border: "none",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  const OptionRow = ({
    label,
    onClick,
    active,
  }: {
    label: string;
    onClick: () => void;
    active: boolean;
  }) => (
    <div
      onClick={onClick}
      className="glass-strip flex items-center justify-between px-4 py-3 mb-2 cursor-pointer transition-all duration-200 hover:scale-[1.01]"
      style={{
        borderColor: active ? appColor : undefined,
        background: active ? `${appColor}18` : undefined,
      }}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span style={{ color: appColor }} className="text-lg">
        ›
      </span>
    </div>
  );

  // ── Resolve options — NEVER show empty buttons ─────────────────────────────
  const resolveOptions = (fallbackList: string[]): string[] => {
    const opts = element.options;
    if (opts && opts.length > 0) return opts;
    const appDefaults = getAppDefaults(appName, element.type);
    if (appDefaults.length > 0) return appDefaults;
    return fallbackList;
  };

  switch (element.type) {
    // ── Home Screen ────────────────────────────────────────────────────────────
    case "home_screen": {
      // FIX: always show 4 buttons — use app-smart defaults when options empty
      const opts = resolveOptions([
        "Get Started",
        "Learn More",
        "Settings",
        "Help",
      ]);
      return (
        <div className="text-center py-2">
          <div className="text-5xl mb-3">📱</div>
          <div
            className="font-serif text-xl font-bold mb-1"
            style={{ color: appColor }}
          >
            {element.label || appName}
          </div>
          <div className="text-sm text-muted-foreground mb-5">
            {element.subtext || `Welcome to ${appName}`}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2">
            {opts.map((opt, i) => (
              <button
                key={i}
                onClick={trigger}
                className="py-4 rounded-xl font-semibold text-sm transition-all duration-150 hover:scale-[1.04] active:scale-95"
                style={{
                  background: i === 0 ? appColor : `${appColor}22`,
                  color: i === 0 ? "#fff" : appColor,
                  border: `1px solid ${appColor}33`,
                  cursor: "pointer",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
          <TapHint color={appColor} />
        </div>
      );
    }

    // ── Search Bar ─────────────────────────────────────────────────────────────
    case "search_bar": {
      const opts = element.options ?? [];
      return (
        <div>
          <div className="text-sm font-semibold mb-2">{element.label}</div>
          <input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={element.placeholder || "Search..."}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-3"
            style={{
              background: `${appColor}10`,
              border: `1.5px solid ${appColor}40`,
            }}
          />
          {opts.length > 0 ? (
            opts.map((opt, i) => (
              <div
                key={i}
                onClick={() => {
                  setSelected(opt);
                  trigger();
                }}
                className="glass-strip flex items-center gap-3 px-4 py-3 mb-2 cursor-pointer transition-all duration-200 hover:scale-[1.01]"
                style={{
                  borderColor: selected === opt ? appColor : undefined,
                  background: selected === opt ? `${appColor}18` : undefined,
                }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ background: appColor }}
                >
                  {opt[0]}
                </div>
                <span className="font-semibold text-sm">{opt}</span>
              </div>
            ))
          ) : (
            <PrimaryBtn label={element.buttonText || "Search"} />
          )}
        </div>
      );
    }

    // ── Contact List ───────────────────────────────────────────────────────────
    case "contact_list": {
      const contacts = resolveOptions([
        "Ravi Kumar",
        "Priya Singh",
        "Amit Shah",
      ]);
      return (
        <div>
          <div className="text-sm font-semibold mb-3">{element.label}</div>
          {contacts.map((contact, i) => (
            <div
              key={i}
              onClick={() => {
                setSelected(contact);
                trigger();
              }}
              className="glass-strip flex items-center gap-3 px-4 py-3 mb-2 cursor-pointer transition-all duration-200 hover:scale-[1.01]"
              style={{
                borderColor: selected === contact ? appColor : undefined,
                background: selected === contact ? `${appColor}18` : undefined,
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                style={{ background: appColor }}
              >
                {contact[0]}
              </div>
              <div>
                <div className="font-semibold text-sm">{contact}</div>
                <div className="text-xs text-muted-foreground">UPI Linked</div>
              </div>
              <span className="ml-auto text-lg" style={{ color: appColor }}>
                ›
              </span>
            </div>
          ))}
          <TapHint color={appColor} />
        </div>
      );
    }

    // ── Amount Input ───────────────────────────────────────────────────────────
    case "amount_input":
      return (
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-2">
            {element.label}
          </div>
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-3xl font-light">₹</span>
            <input
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={element.placeholder || "0"}
              type="number"
              className="text-5xl font-bold w-36 text-center outline-none bg-transparent"
              style={{ borderBottom: `3px solid ${appColor}`, color: appColor }}
            />
          </div>
          <div className="flex gap-2 justify-center mb-4">
            {["100", "500", "1000"].map((amt) => (
              <button
                key={amt}
                onClick={() => setInputVal(amt)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all hover:scale-105"
                style={{
                  background: `${appColor}20`,
                  color: appColor,
                  border: `1px solid ${appColor}33`,
                  cursor: "pointer",
                }}
              >
                ₹{amt}
              </button>
            ))}
          </div>
          {element.subtext && (
            <p className="text-xs text-muted-foreground mb-2">
              {element.subtext}
            </p>
          )}
          <PrimaryBtn label={element.buttonText || "Proceed"} />
        </div>
      );

    // ── PIN Input ──────────────────────────────────────────────────────────────
    case "pin_input":
      return (
        <div className="text-center">
          <div className="text-4xl mb-3">🔐</div>
          <div className="font-serif text-lg font-bold mb-1">
            {element.label}
          </div>
          <div className="text-xs text-muted-foreground mb-5">
            {element.subtext || "Enter your UPI PIN"}
          </div>
          <div className="flex gap-3 justify-center mb-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="w-3.5 h-3.5 rounded-full transition-all duration-200"
                style={{
                  background:
                    i < inputVal.length
                      ? appColor
                      : "rgba(255,255,255,0.2)",
                }}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2.5 max-w-[200px] mx-auto mb-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((num, i) => (
              <button
                key={i}
                onClick={() => {
                  if (num === "⌫") {
                    setInputVal((v) => v.slice(0, -1));
                  } else if (num !== "") {
                    const nv = inputVal + String(num);
                    setInputVal(nv);
                    if (nv.length >= 4) setTimeout(trigger, 300);
                  }
                }}
                className="h-12 rounded-xl text-xl font-semibold transition-all duration-150 hover:scale-105 active:scale-95"
                style={{
                  background:
                    num === "" ? "transparent" : "rgba(255,255,255,0.07)",
                  border:
                    num === "" ? "none" : "1px solid rgba(255,255,255,0.1)",
                  cursor: num !== "" ? "pointer" : "default",
                  color: "inherit",
                }}
              >
                {num}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Enter 4-digit PIN to proceed
          </p>
        </div>
      );

    // ── OTP Input ──────────────────────────────────────────────────────────────
    case "otp_input":
      return (
        <div className="text-center">
          <div className="text-4xl mb-3">📨</div>
          <div className="font-serif text-lg font-bold mb-1">
            {element.label}
          </div>
          <div className="text-xs text-muted-foreground mb-5">
            {element.subtext || "Enter the 6-digit OTP sent to your phone"}
          </div>
          <div className="flex gap-2.5 justify-center mb-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="w-11 h-14 rounded-xl flex items-center justify-center text-2xl font-bold transition-all"
                style={{
                  border: `2px solid ${
                    i < inputVal.length
                      ? appColor
                      : "rgba(255,255,255,0.15)"
                  }`,
                  background: "rgba(255,255,255,0.05)",
                  color: appColor,
                }}
              >
                {inputVal[i] ? "•" : ""}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2.5 max-w-[200px] mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((num, i) => (
              <button
                key={i}
                onClick={() => {
                  if (num === "⌫") {
                    setInputVal((v) => v.slice(0, -1));
                  } else if (num !== "" && inputVal.length < 6) {
                    const nv = inputVal + String(num);
                    setInputVal(nv);
                    if (nv.length >= 6) setTimeout(trigger, 400);
                  }
                }}
                className="h-12 rounded-xl text-xl font-semibold transition-all hover:scale-105 active:scale-95"
                style={{
                  background:
                    num === "" ? "transparent" : "rgba(255,255,255,0.07)",
                  border:
                    num === "" ? "none" : "1px solid rgba(255,255,255,0.1)",
                  cursor: num !== "" ? "pointer" : "default",
                  color: "inherit",
                }}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      );

    // ── Confirmation ───────────────────────────────────────────────────────────
    case "confirmation":
      return (
        <div className="text-center">
          <div className="text-sm text-muted-foreground mb-1">
            {element.subtext || "You are paying"}
          </div>
          <div
            className="font-serif text-5xl font-bold mb-2"
            style={{ color: appColor }}
          >
            ₹{element.value || "500"}
          </div>
          <div className="text-sm text-muted-foreground mb-6">
            {element.label}
          </div>
          <div className="glass-strip p-4 mb-6 text-left">
            {(
              element.options || ["Amount: ₹500", "To: Contact", "Via: UPI"]
            ).map((item, i) => (
              <div
                key={i}
                className={`flex justify-between py-2 text-sm ${
                  i < 2 ? "border-b border-glass-border" : ""
                }`}
              >
                <span className="text-muted-foreground">
                  {item.split(":")[0]}
                </span>
                <span className="font-semibold">
                  {item.split(":").slice(1).join(":")}
                </span>
              </div>
            ))}
          </div>
          <PrimaryBtn label={element.buttonText || "Confirm & Pay"} />
        </div>
      );

    // ── QR Scanner ─────────────────────────────────────────────────────────────
    case "qr_scanner":
      return (
        <div className="text-center">
          <div className="text-sm font-semibold mb-4">{element.label}</div>
          <div
            onClick={() => {
              setScanning(true);
              setTimeout(() => {
                setScanning(false);
                trigger();
              }, 2000);
            }}
            className="w-48 h-48 mx-auto rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden mb-4"
            style={{
              border: `3px solid ${appColor}`,
              background: scanning
                ? `${appColor}18`
                : "rgba(255,255,255,0.04)",
            }}
          >
            {scanning && (
              <div
                className="absolute left-0 right-0 h-0.5"
                style={{
                  background: appColor,
                  boxShadow: `0 0 10px ${appColor}`,
                  animation: "scanLine 1.5s ease-in-out infinite",
                }}
              />
            )}
            <div className="text-5xl mb-2">
              {scanning ? "📡" : "📷"}
            </div>
            <div className="text-xs text-muted-foreground">
              {scanning ? "Scanning..." : "Tap to scan QR"}
            </div>
            {[
              ["top-2 left-2", "border-t-2 border-l-2"],
              ["top-2 right-2", "border-t-2 border-r-2"],
              ["bottom-2 left-2", "border-b-2 border-l-2"],
              ["bottom-2 right-2", "border-b-2 border-r-2"],
            ].map(([pos, bdr], i) => (
              <div
                key={i}
                className={`absolute w-5 h-5 ${pos} ${bdr}`}
                style={{ borderColor: appColor, opacity: 0.6 }}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{element.subtext}</p>
        </div>
      );

    // ── Form Fields ────────────────────────────────────────────────────────────
    case "form_fields": {
      const fields = resolveOptions(["Name", "Email", "Phone", "Address"]);
      return (
        <div>
          <div className="text-sm font-semibold mb-4">{element.label}</div>
          {fields.map((field, i) => (
            <div key={i} className="mb-3">
              <label className="block text-xs text-muted-foreground font-semibold mb-1">
                {field}
              </label>
              <input
                placeholder={`Enter ${field}`}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1.5px solid rgba(255,255,255,0.12)",
                }}
              />
            </div>
          ))}
          <PrimaryBtn label={element.buttonText || "Submit"} />
        </div>
      );
    }

    // ── Menu List ──────────────────────────────────────────────────────────────
    case "menu_list": {
      const menuOpts = resolveOptions(["Option 1", "Option 2", "Option 3"]);
      return (
        <div>
          <div className="text-sm font-semibold mb-4">{element.label}</div>
          {menuOpts.map((opt, i) => (
            <OptionRow
              key={i}
              label={opt}
              active={selected === opt}
              onClick={() => {
                setSelected(opt);
                trigger();
              }}
            />
          ))}
          <TapHint color={appColor} />
        </div>
      );
    }

    // ── ATM Screen ─────────────────────────────────────────────────────────────
    case "atm_screen": {
      const atmOpts = resolveOptions([
        "Withdraw Cash",
        "Balance Enquiry",
        "Mini Statement",
        "Change PIN",
      ]);
      return (
        <div
          className="rounded-2xl p-5"
          style={{
            background: "#0d0d1a",
            color: "#00ff88",
            border: "1px solid #00ff8833",
          }}
        >
          <div className="text-center mb-4">
            <div className="text-xs tracking-[3px] opacity-60 mb-1">
              WELCOME
            </div>
            <div className="font-serif text-lg font-bold">
              {element.label || "ATM Services"}
            </div>
          </div>
          <div
            className="rounded-xl p-3 mb-4 flex items-center gap-3"
            style={{ border: "1px solid #00ff8833", background: "#00ff8808" }}
          >
            <span className="text-2xl">💳</span>
            <span className="text-xs font-medium">
              {element.subtext || "Please insert your ATM card"}
            </span>
          </div>
          {atmOpts.map((opt, i) => (
            <div
              key={i}
              onClick={() => {
                setSelected(opt);
                trigger();
              }}
              className="px-4 py-3 rounded-lg mb-2 text-sm font-semibold cursor-pointer transition-all duration-150 hover:scale-[1.01]"
              style={{
                background: selected === opt ? "#00ff8818" : "transparent",
                border: `1px solid ${
                  selected === opt ? "#00ff88" : "#00ff8833"
                }`,
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      );
    }

    // ── Ticket Booking ─────────────────────────────────────────────────────────
    case "ticket_booking": {
      const stations = resolveOptions(["New Delhi", "Mumbai Central"]);
      return (
        <div>
          <div
            className="rounded-2xl p-4 mb-4"
            style={{
              background: `linear-gradient(135deg, ${appColor}, ${appColor}bb)`,
              color: "#fff",
            }}
          >
            <div className="text-xs opacity-80 mb-1">
              {element.label || "Book Train Ticket"}
            </div>
            <div className="flex items-center gap-3 font-serif text-xl font-bold">
              <span>{stations[0]}</span>
              <span className="text-base">→</span>
              <span>{stations[1] || "Mumbai"}</span>
            </div>
          </div>
          {["Date", "Class", "Quota"].map((f, i) => (
            <div
              key={i}
              className="flex justify-between py-3 border-b border-glass-border text-sm"
            >
              <span className="text-muted-foreground">{f}</span>
              <span className="font-semibold">
                {["Today", "Sleeper (SL)", "General"][i]}
              </span>
            </div>
          ))}
          <PrimaryBtn label={element.buttonText || "Search Trains"} />
        </div>
      );
    }

    // ── Recharge Screen ────────────────────────────────────────────────────────
    case "recharge_screen":
      return (
        <div>
          <div className="text-sm font-semibold mb-3">
            {element.label || "Mobile Recharge"}
          </div>
          <div className="flex gap-2 mb-4">
            {["Airtel", "Jio", "Vi", "BSNL"].map((op) => (
              <button
                key={op}
                onClick={() => setSelected(op)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 hover:scale-105"
                style={{
                  background:
                    selected === op ? appColor : "rgba(255,255,255,0.07)",
                  color: selected === op ? "#fff" : "inherit",
                  border: `1px solid ${
                    selected === op ? appColor : "rgba(255,255,255,0.12)"
                  }`,
                  cursor: "pointer",
                }}
              >
                {op}
              </button>
            ))}
          </div>
          <input
            placeholder="Enter mobile number"
            type="tel"
            className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-4"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1.5px solid rgba(255,255,255,0.12)",
            }}
          />
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            {[
              "₹179 · 28 days",
              "₹299 · 56 days",
              "₹399 · 56 days",
              "₹599 · 84 days",
            ].map((plan, i) => (
              <div
                key={i}
                className="glass-strip py-3 text-center text-xs font-semibold cursor-pointer hover:scale-[1.02] transition-all duration-150"
                style={{ borderColor: `${appColor}33` }}
              >
                {plan}
              </div>
            ))}
          </div>
          <PrimaryBtn label={element.buttonText || "Recharge Now"} />
        </div>
      );

    // ── Bank Dashboard ─────────────────────────────────────────────────────────
    case "bank_dashboard": {
      const actions = resolveOptions(["Send", "Receive", "Pay Bills", "History"]);
      return (
        <div>
          <div
            className="rounded-2xl p-5 mb-4"
            style={{
              background: `linear-gradient(135deg, ${appColor}, ${appColor}bb)`,
              color: "#fff",
            }}
          >
            <div className="text-xs opacity-80 mb-2">
              {element.label || "Available Balance"}
            </div>
            <div className="font-serif text-4xl font-bold mb-1">
              ₹{element.value || "12,450.00"}
            </div>
            <div className="text-xs opacity-60">A/C: XXXX XXXX 4521</div>
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            {actions.map((opt, i) => (
              <div
                key={i}
                onClick={() => {
                  setSelected(opt);
                  trigger();
                }}
                className="glass-strip py-3 flex flex-col items-center gap-1 cursor-pointer hover:scale-[1.04] transition-all duration-150"
                style={{
                  borderColor: selected === opt ? appColor : undefined,
                  background:
                    selected === opt ? `${appColor}22` : undefined,
                }}
              >
                <span className="text-xl">
                  {["💸", "📥", "📄", "📋"][i] ?? "📌"}
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {opt}
                </span>
              </div>
            ))}
          </div>
          <TapHint color={appColor} />
        </div>
      );
    }

    // ── Success Screen ─────────────────────────────────────────────────────────
    case "success_screen":
      return (
        <div className="text-center py-4">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl"
            style={{
              background: `${appColor}18`,
              border: `3px solid ${appColor}`,
              color: appColor,
            }}
          >
            ✓
          </div>
          <div
            className="font-serif text-2xl font-bold mb-2"
            style={{ color: appColor }}
          >
            {element.label || "Success!"}
          </div>
          <div className="text-sm text-muted-foreground mb-4">
            {element.subtext}
          </div>
          {element.value && (
            <div className="font-serif text-4xl font-bold mb-5">
              ₹{element.value}
            </div>
          )}
          <PrimaryBtn label={element.buttonText || "Done"} />
        </div>
      );

    // ── Default fallback — always shows a working button ──────────────────────
    default:
      return (
        <div className="text-center py-6">
          <div className="text-4xl mb-4">📱</div>
          <div className="text-sm text-muted-foreground mb-4">
            {element.label}
          </div>
          <PrimaryBtn label={element.buttonText || "Continue"} />
        </div>
      );
  }
};

// ─── Source badge ──────────────────────────────────────────────────────────────
const SourceBadge = ({
  source,
}: {
  source: "groq" | "dataset" | null;
}) => {
  if (!source) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{
        background:
          source === "groq"
            ? "rgba(249,115,22,0.15)"
            : "rgba(99,102,241,0.15)",
        color: source === "groq" ? "#f97316" : "#818cf8",
        border: `1px solid ${
          source === "groq" ? "#f9731630" : "#818cf830"
        }`,
      }}
    >
      {source === "groq" ? "⚡ Groq" : "📦 Dataset"}
    </span>
  );
};

// ─── How-to-use toast (shown once on first sim) ────────────────────────────────
const HowToUseToast = ({ onDismiss }: { onDismiss: () => void }) => (
  <motion.div
    className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 max-w-sm w-full px-4"
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 30 }}
  >
    <div
      className="rounded-2xl p-4 flex gap-3 items-start shadow-2xl"
      style={{
        background: "rgba(20,20,30,0.96)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <span className="text-2xl shrink-0">💡</span>
      <div className="flex-1">
        <p className="font-bold text-sm mb-1">How to use Practice Lab</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Tap any <strong>button, option, or input</strong> in the left panel
          to move to the next step. The right panel shows your progress.
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
      >
        ✕
      </button>
    </div>
  </motion.div>
);

// ─── Main Page ─────────────────────────────────────────────────────────────────
const SimulationPage = () => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [simMeta, setSimMeta] = useState<SimMeta | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [coins, setCoins] = useState(50);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const instructionRef = useRef<HTMLDivElement>(null);
  const hasShownHowTo = useRef(false);

  useEffect(() => {
    const syncCoins = () => {
      const nextCoins = ensureStoredCoins();
      setCoins(nextCoins);
    };

    syncCoins();
    window.addEventListener("storage", syncCoins);
    window.addEventListener("saheli:stats-updated", syncCoins);
    return () => {
      window.removeEventListener("storage", syncCoins);
      window.removeEventListener("saheli:stats-updated", syncCoins);
    };
  }, []);

  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const auth = getAuth();
    if (auth?.role === "admin") {
      setIsAdmin(true);
      return;
    }
    setIsAdmin(false);
    if (!getToken()) return;
    apiFetch(`${API_BASE}/api/auth/me`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user?.role === "admin") setIsAdmin(true);
      })
      .catch(() => {});
  }, []);
  const [adminSimulations, setAdminSimulations] = useState<Simulation[]>([]);
  const [adminTemplates, setAdminTemplates] = useState<TemplateSummary[]>([]);
  const [adminEditMode, setAdminEditMode] = useState(false);
  const [adminRecommended, setAdminRecommended] = useState<
    Record<string, boolean>
  >({});
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const stepStartRef = useRef<number>(Date.now());

  const suggestions = [
    { icon: "💸", text: "How to send money using GPay?" },
    { icon: "🏧", text: "How to withdraw cash from ATM?" },
    { icon: "🚂", text: "How to book train ticket on IRCTC?" },
    { icon: "📱", text: "How to recharge my mobile phone?" },
    { icon: "🏦", text: "How to check bank balance online?" },
    { icon: "⚡", text: "How to pay electricity bill via UPI?" },
  ];

  useEffect(() => {
    if (!isAdmin) return;
    setTemplatesLoading(true);
    apiGetTemplates()
      .then(setAdminTemplates)
      .catch(() => {})
      .finally(() => setTemplatesLoading(false));
  }, [isAdmin]);

  const generateSimulation = useCallback(
    async (userPrompt: string) => {
      setLoading(true);
      setError(null);
      setSimulation(null);
      setSimMeta(null);
      setCurrentStep(0);
      setCompleted(false);
      try {
        const { simulation: sim, meta } = await apiGenerate(userPrompt);
        setSimulation(sim);
        setSimMeta(meta);
        stepStartRef.current = Date.now();
        if (!hasShownHowTo.current) {
          hasShownHowTo.current = true;
          setShowHowTo(true);
          setTimeout(() => setShowHowTo(false), 6000);
        }
        if (meta?.simulation_id) {
          apiTrack({
            simulation_id: meta.simulation_id,
            event: "simulation_start",
          });
        }
        if (isAdmin) setAdminSimulations((prev) => [sim, ...prev].slice(0, 6));
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not generate simulation. Please try again."
        );
      }
      setLoading(false);
    },
    [isAdmin]
  );

  const handleStepComplete = useCallback(async () => {
    if (!simulation) return;
    const timeSpent = Date.now() - stepStartRef.current;
    if (simMeta?.simulation_id) {
      apiTrack({
        simulation_id: simMeta.simulation_id,
        event: "step_complete",
        step_index: currentStep,
        time_spent_ms: timeSpent,
      });
    }
    if (currentStep < simulation.steps.length - 1) {
      setCurrentStep((s) => s + 1);
      stepStartRef.current = Date.now();
      setFeedback("✅ Great job! Moving to next step...");
      setTimeout(() => setFeedback(null), 1800);
      if (instructionRef.current) instructionRef.current.scrollTop = 0;
    } else {
      const reward = simulation.coinsReward || 15;
      if (!isAdmin) {
        const currentCoins = readStoredNumber(STORAGE_KEYS.coins, DEFAULT_COINS);
        const nextCoins = currentCoins + reward;
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEYS.coins, String(nextCoins));
          const completedCount =
            readStoredNumber(STORAGE_KEYS.scenarios, 0) + 1;
          window.localStorage.setItem(
            STORAGE_KEYS.scenarios,
            String(completedCount)
          );
          const nextConfidence = completedCount * 10;
          window.localStorage.setItem(
            STORAGE_KEYS.confidence,
            String(nextConfidence)
          );
          window.dispatchEvent(new Event("saheli:stats-updated"));
        }
        setCoins(nextCoins);
      }
      setCompleted(true);
      if (simMeta?.simulation_id) {
        apiTrack({
          simulation_id: simMeta.simulation_id,
          event: "simulation_complete",
        });
      }
      setFeedback(
        isAdmin
          ? "Admin preview complete. Coins not awarded."
          : `🎉 Simulation complete! +${reward} coins earned!`
      );
      setTimeout(() => setFeedback(null), 3500);
    }
  }, [simulation, simMeta, currentStep, isAdmin]);

  const openSimulation = (sim: Simulation) => {
    setSimulation(sim);
    setCurrentStep(0);
    setCompleted(false);
    setFeedback(null);
    setSimMeta(null);
  };

  const handleSaveTemplate = async () => {
    if (!simulation) return;
    try {
      const tid = await apiSaveTemplate(simulation);
      setFeedback(`✅ Template saved (${tid.slice(0, 8)}…)`);
      setTimeout(() => setFeedback(null), 2000);
      const templates = await apiGetTemplates();
      setAdminTemplates(templates);
    } catch (err: unknown) {
      setFeedback(
        `⚠️ ${err instanceof Error ? err.message : "Save failed"}`
      );
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  const handleDeleteTemplate = async (tid: string) => {
    try {
      await apiDeleteTemplate(tid);
      setAdminTemplates((prev) => prev.filter((t) => t.id !== tid));
    } catch (err: unknown) {
      setFeedback(
        `⚠️ ${err instanceof Error ? err.message : "Delete failed"}`
      );
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  const handlePatchTemplate = async (
    tid: string,
    patch: Record<string, unknown>
  ) => {
    try {
      await apiPatchTemplate(tid, patch);
      const templates = await apiGetTemplates();
      setAdminTemplates(templates);
    } catch {
      /* silent */
    }
  };

  const step = simulation?.steps?.[currentStep];
  const progress = simulation
    ? (currentStep / simulation.steps.length) * 100
    : 0;
  const simKey = simulation
    ? `${simulation.title}-${simulation.app}-${simulation.steps.length}`
    : "";
  const uiTypes = simulation
    ? Array.from(new Set(simulation.steps.map((s) => s.uiElement.type)))
    : [];

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div
          className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full opacity-20 blur-[100px]"
          style={{
            background:
              "radial-gradient(circle, #6366f1 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full opacity-15 blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, #8b5cf6 0%, transparent 70%)",
          }}
        />
      </div>

      <style>{`
        @keyframes scanLine { 0%,100% { top:0; } 50% { top:calc(100% - 2px); } }
        @keyframes shimmer  { 0% { transform:translateX(-100%); } 100% { transform:translateX(100%); } }
      `}</style>

      <Navbar />

      <div className="relative z-10 pt-24 section-spacing max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-10">
          <h1 className="font-serif text-3xl md:text-4xl font-bold">
            Practice Lab
          </h1>
          <div className="coin-badge animate-coin-glow text-base">
            <span>🪙</span>
            <span className="font-bold">{coins}</span>
          </div>
        </div>

        {/* Admin Panel */}
        {isAdmin && (
          <div className="glass-glow p-6 mb-8">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">
                  Admin Simulation Control Panel
                </p>
                <p className="font-serif text-lg font-bold">
                  Simulation Management
                </p>
              </div>
              <span className="pill pill-accent">Admin</span>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                className="glass-pill-primary"
                disabled={!simulation}
                onClick={handleSaveTemplate}
              >
                Save Simulation Template
              </button>
              <button
                className="glass-pill-secondary"
                disabled={!simulation}
                onClick={() => setAdminEditMode((prev) => !prev)}
              >
                {adminEditMode ? "Finish Editing" : "Edit Simulation Steps"}
              </button>
              <button
                className="glass-pill-secondary"
                disabled={!simulation}
                onClick={() => {
                  setSimulation(null);
                  setPrompt("");
                  setCompleted(false);
                  setFeedback(null);
                }}
              >
                Delete Simulation
              </button>
            </div>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Saved Templates
                </p>
                <p className="text-xs text-muted-foreground">
                  {adminTemplates.length} templates
                </p>
              </div>
              {templatesLoading ? (
                <p className="text-xs text-muted-foreground">
                  Loading templates…
                </p>
              ) : adminTemplates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No templates saved yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {adminTemplates.map((t) => (
                    <div
                      key={t.id}
                      className="glass-strip px-4 py-3 flex flex-wrap items-center gap-3"
                    >
                      <span className="text-xl">{t.appIcon}</span>
                      <div className="flex-1 min-w-[140px]">
                        <p className="text-sm font-semibold">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.app} · {t.steps_count} steps
                        </p>
                      </div>
                      {t.recommended && (
                        <span className="pill pill-accent text-[10px]">
                          ★ Recommended
                        </span>
                      )}
                      <button
                        className="glass-pill-secondary text-xs"
                        onClick={() =>
                          handlePatchTemplate(t.id, {
                            recommended: !t.recommended,
                          })
                        }
                      >
                        {t.recommended ? "Unmark" : "Recommend"}
                      </button>
                      <button
                        className="glass-pill-secondary text-xs text-destructive"
                        onClick={() => handleDeleteTemplate(t.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {adminSimulations.length > 0 && (
                <>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground pt-2">
                    Generated This Session
                  </p>
                  <div className="space-y-2">
                    {adminSimulations.map((sim, index) => (
                      <div
                        key={`${sim.title}-${index}`}
                        className="glass-strip px-4 py-3 flex flex-wrap items-center gap-3"
                      >
                        <div className="flex-1 min-w-[180px]">
                          <p className="text-sm font-semibold">{sim.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {sim.app} · {sim.steps.length} steps
                          </p>
                        </div>
                        <button
                          className="glass-pill-secondary"
                          onClick={() => openSimulation(sim)}
                        >
                          Open
                        </button>
                        <button
                          className="glass-pill-secondary"
                          onClick={() => {
                            openSimulation(sim);
                            setCurrentStep(0);
                          }}
                        >
                          Preview
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Prompt input */}
          {!simulation && !loading && (
            <motion.div
              key="prompt"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35 }}
            >
              <div className="glass-glow p-8 md:p-12 mb-8 text-center">
                <p className="font-serif text-2xl md:text-3xl font-bold mb-2">
                  What would you like to learn today?
                </p>
                <p className="text-muted-foreground text-sm mb-8">
                  Describe your situation and we'll simulate the real interface
                  for you
                </p>
                <div className="glass-strip p-1 mb-4 flex items-end gap-3">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        prompt.trim()
                      ) {
                        e.preventDefault();
                        generateSimulation(prompt);
                      }
                    }}
                    placeholder="e.g. I don't know how to send money using GPay..."
                    rows={3}
                    className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed px-3 py-2 placeholder:text-muted-foreground"
                  />
                  <button
                    onClick={() =>
                      prompt.trim() && generateSimulation(prompt)
                    }
                    disabled={!prompt.trim()}
                    className="glass-pill-primary shrink-0 mb-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Generate →
                  </button>
                </div>
                {error && (
                  <div className="glass-strip border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4 text-left">
                    ⚠️ {error}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {suggestions.map((s, i) => (
                  <motion.button
                    key={i}
                    onClick={() => {
                      setPrompt(s.text);
                      generateSimulation(s.text);
                    }}
                    className="glass-strip flex items-center gap-3 px-4 py-3 text-sm font-medium text-left hover:bg-accent/10 hover:border-accent/40 transition-all duration-200"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="text-xl">{s.icon}</span>
                    <span>{s.text}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Loading */}
          {loading && (
            <motion.div
              key="loading"
              className="glass-glow p-16 text-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary mx-auto mb-6 animate-spin" />
              <p className="font-serif text-xl font-bold mb-2">
                Generating your simulation...
              </p>
              <p className="text-muted-foreground text-sm">
                Analyzing your request and building the interface
              </p>
            </motion.div>
          )}

          {/* Active simulation */}
          {simulation && !loading && (
            <motion.div
              key="simulation"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {/* Sim header */}
              <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                    style={{
                      background: simulation.appColor,
                      boxShadow: `0 4px 20px ${simulation.appColor}55`,
                    }}
                  >
                    {simulation.appIcon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-serif font-bold text-lg">
                        {simulation.title}
                      </p>
                      {simMeta && <SourceBadge source={simMeta.source} />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {simulation.app} · {simulation.steps.length} steps
                      {simMeta && ` · ${simMeta.elapsed_s}s`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSimulation(null);
                    setPrompt("");
                  }}
                  className="glass-strip px-4 py-2 text-sm font-semibold hover:bg-accent/10 transition-all"
                >
                  ← New Simulation
                </button>
              </div>

              {/* Progress bar */}
              {!completed && (
                <div className="mb-8">
                  <div className="flex justify-between text-xs text-muted-foreground mb-2">
                    <span>
                      Step {currentStep + 1} of {simulation.steps.length}
                    </span>
                    <span>{Math.round(progress)}% complete</span>
                  </div>
                  <div className="flex gap-2">
                    {simulation.steps.map((_, i) => (
                      <div
                        key={i}
                        className="flex-1 h-2 rounded-full transition-all duration-500"
                        style={{
                          background:
                            i <= currentStep
                              ? `linear-gradient(90deg, ${simulation.appColor}, ${simulation.appColor}bb)`
                              : "rgba(255,255,255,0.1)",
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Fraud warning */}
              {simulation.fraudWarning && !completed && (
                <motion.div
                  className="glass-strip bg-destructive/10 border-destructive/40 px-5 py-4 mb-6 flex gap-3 items-start"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <span className="text-xl shrink-0">⚠️</span>
                  <div>
                    <p className="font-semibold text-sm text-destructive mb-0.5">
                      Fraud Alert
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {simulation.fraudWarning}
                    </p>
                  </div>
                </motion.div>
              )}

              <AnimatePresence mode="wait">
                {!completed ? (
                  <motion.div
                    key="active"
                    className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {/* Left: Simulation UI */}
                    <motion.div
                      key={`step-${currentStep}`}
                      className="glass-glow p-6 md:p-8"
                      initial={{ opacity: 0, scale: 0.97, x: 10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.97, x: -10 }}
                      transition={{ duration: 0.3 }}
                    >
                      {/* Mock app bar */}
                      <div className="flex items-center gap-2.5 mb-4 pb-4 border-b border-glass-border">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm text-white"
                          style={{ background: simulation.appColor }}
                        >
                          {simulation.appIcon}
                        </div>
                        <span className="font-semibold text-sm">
                          {simulation.app}
                        </span>
                        <div className="ml-auto flex gap-1.5">
                          {["#ff5f57", "#ffbb2c", "#28ca41"].map((c) => (
                            <div
                              key={c}
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ background: c }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Step instruction banner — always visible */}
                      {step && (
                        <div
                          className="rounded-xl px-4 py-3 mb-5 flex items-start gap-2"
                          style={{
                            background: `${simulation.appColor}12`,
                            border: `1px solid ${simulation.appColor}30`,
                          }}
                        >
                          <span className="text-lg shrink-0">👉</span>
                          <div>
                            <p
                              className="font-bold text-xs mb-0.5"
                              style={{ color: simulation.appColor }}
                            >
                              {step.title}
                            </p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {step.instruction}
                            </p>
                          </div>
                        </div>
                      )}

                      {step && (
                        <UIRenderer
                          element={step.uiElement}
                          appColor={simulation.appColor}
                          appColorSecondary={simulation.appColorSecondary}
                          appName={simulation.app}
                          onInteract={handleStepComplete}
                          isActive={true}
                        />
                      )}
                    </motion.div>

                    {/* Right: Step guide */}
                    <div className="space-y-4">
                      {isAdmin && (
                        <div className="glass-glow p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                              Admin Inspector
                            </p>
                            <span className="pill pill-accent">Admin</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                            <div className="glass-strip p-3">
                              <p className="text-muted-foreground">
                                Total Steps
                              </p>
                              <p className="font-semibold">
                                {simulation.steps.length}
                              </p>
                            </div>
                            <div className="glass-strip p-3">
                              <p className="text-muted-foreground">
                                Reward Coins
                              </p>
                              <p className="font-semibold">
                                {simulation.coinsReward}
                              </p>
                            </div>
                            <div className="glass-strip p-3">
                              <p className="text-muted-foreground">
                                Fraud Warning
                              </p>
                              <p className="font-semibold">
                                {simulation.fraudWarning ? "Yes" : "No"}
                              </p>
                            </div>
                            <div className="glass-strip p-3">
                              <p className="text-muted-foreground">
                                UI Elements
                              </p>
                              <p className="font-semibold text-[10px]">
                                {uiTypes.join(", ") || "N/A"}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs text-muted-foreground block mb-1">
                                Reward Coins
                              </label>
                              <input
                                type="number"
                                value={simulation.coinsReward}
                                onChange={(e) =>
                                  setSimulation((p) =>
                                    p
                                      ? {
                                          ...p,
                                          coinsReward: parseInt(
                                            e.target.value || "0",
                                            10
                                          ),
                                        }
                                      : p
                                  )
                                }
                                className="glass-input text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground block mb-1">
                                Fraud Warning
                              </label>
                              <textarea
                                value={simulation.fraudWarning ?? ""}
                                onChange={(e) =>
                                  setSimulation((p) =>
                                    p
                                      ? {
                                          ...p,
                                          fraudWarning:
                                            e.target.value || null,
                                        }
                                      : p
                                  )
                                }
                                rows={2}
                                className="glass-input text-xs"
                                placeholder="Add or edit fraud warning"
                              />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="glass-pill-secondary"
                                onClick={() =>
                                  setSimulation((p) =>
                                    p
                                      ? {
                                          ...p,
                                          fraudWarning: p.fraudWarning
                                            ? null
                                            : "Always verify official payment requests.",
                                        }
                                      : p
                                  )
                                }
                              >
                                Toggle Warning
                              </button>
                              <button
                                className="glass-pill-secondary"
                                onClick={() =>
                                  setAdminRecommended((p) => ({
                                    ...p,
                                    [simKey]: !p[simKey],
                                  }))
                                }
                              >
                                {adminRecommended[simKey]
                                  ? "Unmark"
                                  : "Recommend"}
                              </button>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground block mb-2">
                                Jump to Step
                              </label>
                              <div className="flex flex-wrap gap-2">
                                {simulation.steps.map((s, idx) => (
                                  <button
                                    key={`${s.title}-${idx}`}
                                    className="glass-pill-secondary text-xs"
                                    onClick={() => setCurrentStep(idx)}
                                  >
                                    {idx + 1}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                          {adminEditMode && (
                            <div className="mt-4 space-y-3">
                              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                Edit Steps
                              </p>
                              {simulation.steps.map((s, idx) => (
                                <div
                                  key={`${s.title}-${idx}`}
                                  className="glass-strip p-3 space-y-2"
                                >
                                  <div className="text-xs text-muted-foreground">
                                    Step {idx + 1}
                                  </div>
                                  <input
                                    value={s.title}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setSimulation((p) =>
                                        p
                                          ? {
                                              ...p,
                                              steps: p.steps.map((si, i) =>
                                                i === idx
                                                  ? { ...si, title: v }
                                                  : si
                                              ),
                                            }
                                          : p
                                      );
                                    }}
                                    className="glass-input text-xs"
                                  />
                                  <textarea
                                    value={s.instruction}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setSimulation((p) =>
                                        p
                                          ? {
                                              ...p,
                                              steps: p.steps.map((si, i) =>
                                                i === idx
                                                  ? {
                                                      ...si,
                                                      instruction: v,
                                                    }
                                                  : si
                                              ),
                                            }
                                          : p
                                      );
                                    }}
                                    rows={2}
                                    className="glass-input text-xs"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div
                        ref={instructionRef}
                        className="glass-glow p-5 overflow-y-auto"
                        style={{ maxHeight: "600px" }}
                      >
                        <div className="flex items-center gap-2 font-bold text-sm mb-5">
                          <span>📋</span> Step-by-Step Guide
                        </div>
                        {simulation.steps.map((s, i) => (
                          <motion.div
                            key={i}
                            className="flex gap-3 mb-4"
                            animate={{
                              opacity: i > currentStep ? 0.35 : 1,
                            }}
                            transition={{ duration: 0.3 }}
                          >
                            <div
                              className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 transition-all duration-300"
                              style={{
                                background:
                                  i < currentStep
                                    ? "#22c55e"
                                    : i === currentStep
                                    ? simulation.appColor
                                    : "rgba(255,255,255,0.12)",
                                color:
                                  i <= currentStep
                                    ? "#fff"
                                    : "rgba(255,255,255,0.4)",
                                boxShadow:
                                  i === currentStep
                                    ? `0 0 0 4px ${simulation.appColor}30`
                                    : "none",
                              }}
                            >
                              {i < currentStep ? "✓" : i + 1}
                            </div>
                            <div className="pt-0.5">
                              <p
                                className={`font-bold text-xs mb-0.5 ${
                                  i === currentStep
                                    ? ""
                                    : "text-muted-foreground"
                                }`}
                              >
                                {s.title}
                              </p>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {s.instruction}
                              </p>
                              {s.tip && i === currentStep && (
                                <motion.div
                                  className="glass-strip bg-accent/10 border-accent/30 px-3 py-2 mt-2 text-[11px] text-accent"
                                  initial={{ opacity: 0, y: 4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                >
                                  💡 {s.tip}
                                </motion.div>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="completed"
                    className="glass-glow p-14 text-center"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    <p className="text-5xl mb-4">🎉</p>
                    <h2 className="font-serif text-3xl font-bold mb-3">
                      Simulation Complete!
                    </h2>
                    <p className="text-muted-foreground mb-8">
                      {simulation.completionMessage}
                    </p>
                    {!isAdmin ? (
                      <div className="inline-flex items-center gap-2 coin-badge animate-coin-glow text-lg mb-10">
                        <span>🪙</span>
                        <span className="font-bold">
                          +{simulation.coinsReward || 15} coins earned
                        </span>
                      </div>
                    ) : (
                      <div className="glass-strip px-4 py-3 text-sm text-muted-foreground mb-10">
                        Admin preview mode — coins not awarded.
                      </div>
                    )}
                    <div className="flex gap-4 justify-center flex-wrap">
                      <button
                        onClick={() => {
                          setCurrentStep(0);
                          setCompleted(false);
                        }}
                        className="glass-pill-primary"
                      >
                        Retry Simulation
                      </button>
                      <button
                        onClick={() => {
                          setSimulation(null);
                          setPrompt("");
                        }}
                        className="glass-strip px-6 py-2.5 font-semibold text-sm hover:bg-accent/10 transition-all"
                      >
                        Try Another
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showHowTo && (
          <HowToUseToast onDismiss={() => setShowHowTo(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {feedback && (
          <motion.div
            className="fixed bottom-8 left-1/2 -translate-x-1/2 glass-glow px-8 py-4 z-50 whitespace-nowrap"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <p className="font-semibold text-sm">{feedback}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SimulationPage;
