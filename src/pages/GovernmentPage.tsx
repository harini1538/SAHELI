import { useState, useRef, useEffect, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";

// Web Speech API type shim (mirrors VoicePage)
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
  interface SpeechRecognition extends EventTarget {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
  }
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }
}

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const LANGUAGES = [
  { label: "English", value: "en", bcp: "en-IN" },
  { label: "हिंदी", value: "hi", bcp: "hi-IN" },
  { label: "தமிழ்", value: "ta", bcp: "ta-IN" },
  { label: "తెలుగు", value: "te", bcp: "te-IN" },
  { label: "ಕನ್ನಡ", value: "kn", bcp: "kn-IN" },
  { label: "বাংলা", value: "bn", bcp: "bn-IN" },
];

// ─── THEME STYLES (mirrors VoicePage CSS variables exactly) ──────────────────
const injectStyles = `
:root {
  --background: #FDF6EC;
  --foreground: #2C1810;

  --card: #FAEDCD;
  --card-foreground: #2C1810;

  --popover: #FAEDCD;
  --popover-foreground: #2C1810;

  --primary: #E4ACB2;
  --primary-foreground: #8B4A52;
  --primary-dim: rgba(228,172,178,0.25);

  --secondary: #EAB896;
  --secondary-foreground: #2C1810;

  --accent: #CCD5AE;
  --accent-foreground: #4A6741;
  --accent-dim: rgba(204,213,174,0.22);

  --highlight: #99BAB9;
  --highlight-foreground: #3D7472;
  --highlight-dim: rgba(153,186,185,0.22);

  --destructive: #D96B6B;
  --destructive-foreground: #FFFFFF;
  --destructive-dim: rgba(217,107,107,0.2);

  --muted: #F4E7DC;
  --muted-foreground: #8B6B5A;

  --border: rgba(255,255,255,0.3);
  --input: rgba(255,255,255,0.4);
  --ring: #E4ACB2;

  --glass-bg: rgba(255,255,255,0.25);
  --glass-bg-hover: rgba(255,255,255,0.4);
  --glass-border: rgba(255,255,255,0.3);
  --glass-border-accent: rgba(228,172,178,0.35);

  --sidebar-background: #FAEDCD;
  --sidebar-foreground: #2C1810;
  --sidebar-primary: #E4ACB2;
  --sidebar-primary-foreground: #8B4A52;
  --sidebar-accent: #CCD5AE;
  --sidebar-accent-foreground: #4A6741;
  --sidebar-border: rgba(255,255,255,0.3);
  --sidebar-ring: #E4ACB2;
}


  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body { background: var(--background); }

  .gov-root {
    font-family: "Times New Roman", Times, serif;
    background: var(--background);
    color: var(--foreground);
    min-height: 100vh;
    position: relative;
    overflow-x: hidden;
  }

  /* Ambient background mesh */
  .gov-root::before {
    content: '';
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background:
      radial-gradient(ellipse 70% 45% at 15% 10%, rgba(228,172,178,0.18) 0%, transparent 60%),
      radial-gradient(ellipse 55% 40% at 85% 85%, rgba(153,186,185,0.14) 0%, transparent 55%);
  }

  /* ── Navbar ── */
  .navbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 50;
    height: 64px; padding: 0 32px;
    display: flex; align-items: center; justify-content: space-between;
    background: rgba(13,17,23,0.82);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--glass-border);
  }
  .navbar-brand {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 19px; font-weight: 700; color: var(--foreground);
    display: flex; align-items: center; gap: 9px; cursor: pointer;
    user-select: none;
  }
  .navbar-brand em { font-style: normal; color: var(--accent); }
  .navbar-links { display: flex; align-items: center; gap: 2px; }
  .navbar-item {
    padding: 6px 13px; border-radius: 8px;
    font-size: 13px; font-weight: 500; color: var(--muted-foreground);
    background: none; border: none; cursor: pointer; font-family: "Times New Roman", Times, serif;
    transition: color 0.18s, background 0.18s;
  }
  .navbar-item:hover { color: var(--foreground); background: var(--glass-bg); }
  .navbar-item.active { color: var(--foreground); background: var(--glass-bg); }
  .navbar-trust {
    margin-left: 10px; padding: 6px 14px; border-radius: 8px;
    font-size: 12px; font-weight: 600; font-family: "Times New Roman", Times, serif;
    background: var(--accent-dim); color: var(--accent);
    border: 1px solid rgba(204,213,174,0.45); cursor: default;
  }

  /* ── VoicePage glass primitives ── */
  .glass {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 16px;
    backdrop-filter: blur(12px);
  }
  .glass-glow {
    background: linear-gradient(135deg, rgba(228,172,178,0.18) 0%, rgba(250,237,205,0.18) 100%);
    border: 1px solid var(--glass-border-accent);
    border-radius: 16px;
    backdrop-filter: blur(16px);
    box-shadow: 0 0 48px rgba(228,172,178,0.12);
  }
  .glass-strip {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    padding: 18px 20px;
    transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
  }
  .glass-strip:hover {
    background: var(--glass-bg-hover);
    border-color: var(--glass-border-accent);
    box-shadow: 0 4px 28px rgba(228,172,178,0.12);
  }
  .glass-input {
    width: 100%;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 10px; padding: 10px 14px;
    color: var(--foreground);
    font-family: "Times New Roman", Times, serif; font-size: 14px;
    outline: none; transition: border-color 0.2s;
    appearance: none;
  }
  .glass-input:focus { border-color: var(--primary); }
  .glass-input::placeholder { color: var(--muted-foreground); }

  /* ── Pills (VoicePage naming) ── */
  .pill {
    display: inline-flex; align-items: center;
    padding: 4px 10px; border-radius: 20px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
    font-family: "Times New Roman", Times, serif;
  }
  .pill-accent   { background: var(--accent-dim);       color: var(--accent);       border: 1px solid rgba(204,213,174,0.45); }
  .pill-green    { background: var(--highlight-dim);    color: var(--highlight);    border: 1px solid rgba(153,186,185,0.45); }
  .pill-muted    { background: rgba(255,255,255,0.05);  color: var(--muted-foreground); border: 1px solid var(--glass-border); }
  .pill-red      { background: var(--destructive-dim);  color: var(--destructive);  border: 1px solid rgba(217,107,107,0.35); }

  /* ── Buttons (VoicePage naming) ── */
  .glass-pill-primary {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 9px 22px; border-radius: 24px;
    background: rgba(228,172,178,0.35);
    border: 1px solid rgba(228,172,178,0.4);
    color: var(--primary-foreground); font-family: "Times New Roman", Times, serif;
    font-weight: 700; font-size: 13px; cursor: pointer;
    text-decoration: none; transition: opacity 0.2s, transform 0.15s;
  }
  .glass-pill-primary:hover { background: rgba(228,172,178,0.5); transform: translateY(-1px); }
  .glass-pill-primary:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

  .glass-pill-secondary {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 9px 20px; border-radius: 24px;
    background: rgba(234,184,150,0.35); border: 1px solid rgba(234,184,150,0.4);
    color: var(--secondary-foreground); font-family: "Times New Roman", Times, serif;
    font-weight: 500; font-size: 13px; cursor: pointer; transition: all 0.2s;
  }
  .glass-pill-secondary:hover,
  .glass-pill-secondary.active {
    background: rgba(234,184,150,0.5);
    border-color: rgba(234,184,150,0.5);
    color: var(--secondary-foreground);
  }

  /* ── Tab nav ── */
  .tab-nav {
    display: flex; gap: 4px; padding: 4px;
    background: var(--glass-bg); border: 1px solid var(--glass-border);
    border-radius: 14px;
  }
  .tab-btn {
    flex: 1; padding: 9px 8px; border: none; border-radius: 10px;
    font-family: "Times New Roman", Times, serif; font-size: 12px; font-weight: 600;
    cursor: pointer; background: transparent; color: var(--muted-foreground);
    white-space: nowrap; transition: all 0.2s;
  }
  .tab-btn.active { background: var(--primary-dim); color: var(--primary-foreground); }
  .tab-btn:hover:not(.active) { color: var(--primary-foreground); }

  /* ── Section spacing (VoicePage) ── */
  .section-spacing { padding: 88px 24px 56px; }

  /* ── Font serif util ── */
  .font-serif { font-family: Georgia, "Times New Roman", serif; }
  .text-muted-foreground { color: var(--muted-foreground); }

  /* ── Chat bubbles ── */
  .chat-bubble-user {
    background: var(--primary-dim); border: 1px solid rgba(228,172,178,0.3);
    border-radius: 16px 16px 4px 16px; padding: 10px 14px;
    font-size: 14px; max-width: 80%; line-height: 1.6;
    align-self: flex-end;
  }
  .chat-bubble-ai {
    background: var(--glass-bg); border: 1px solid var(--glass-border);
    border-radius: 16px 16px 16px 4px; padding: 12px 14px;
    font-size: 14px; max-width: 86%; line-height: 1.75;
    align-self: flex-start;
  }


  /* ── Compare ── */
  .compare-col {
    flex: 1; min-width: 180px;
    background: var(--glass-bg); border: 1px solid var(--glass-border);
    border-radius: 12px; padding: 16px;
  }
  .compare-col.highlight {
    border-color: var(--glass-border-accent);
    background: rgba(228,172,178,0.08);
  }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 4px; }
`;

const navbarThemeVars = {
  "--background": "35 81% 96%",
  "--foreground": "17 47% 12%",
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
  "--border": "0 0% 100% / 0.3",
  "--input": "0 0% 100% / 0.4",
  "--ring": "354 51% 78%",
} as CSSProperties;

// ─── DATA ─────────────────────────────────────────────────────────────────────
const SCHEMES = [
  {
    id: 1,
    name: "PM Mudra Yojana",
    benefit: "Collateral-free loans up to ₹10 lakh for micro-enterprises",
    category: "Business",
    tags: ["Loan", "MSME", "Self-Employment"],
    ministry: "Ministry of Finance",
    deadline: "Open",
    launchYear: 2015,
    beneficiaries: "34.42 Cr+",
    eligibility: { minAge: 18, maxAge: 65, maxIncome: 1500000 },
    purpose: "Provide affordable credit to non-corporate, non-farm small/micro enterprises to enable them to scale up.",
    benefits: ["Loans: Shishu (up to ₹50K), Kishore (₹50K–5L), Tarun (₹5L–10L)", "No collateral required", "Repayment tenure up to 5 years", "Subsidised interest rates"],
    docs: ["Aadhaar Card", "PAN Card", "Business Plan / Proof of Business", "Bank Statement (6 months)", "Passport-size photograph", "Caste certificate (if applicable)"],
    steps: ["Visit nearest bank, MFI or NBFC", "Fill MUDRA loan application form", "Submit required documents", "Bank appraisal & sanction", "Disbursement via MUDRA card"],
    link: "https://www.mudra.org.in",
    timeline: "15–30 working days",
    fraudTips: ["Apply only through scheduled banks, MFIs, or NBFCs", "MUDRA does not charge any processing fee directly", "Beware of agents promising instant approval"],
    successStory: "Rekha Devi from Bihar used a ₹2L Kishore loan to expand her tailoring business, now employing 5 women.",
  },
  {
    id: 2,
    name: "Sukanya Samriddhi Yojana",
    benefit: "High-interest savings scheme for girl child's future",
    category: "Savings",
    tags: ["Girl Child", "Education", "Marriage"],
    ministry: "Ministry of Finance",
    deadline: "Open",
    launchYear: 2015,
    beneficiaries: "3 Cr+ accounts",
    eligibility: { minAge: 0, maxAge: 10, maxIncome: null },
    purpose: "Encourage saving for the future education and marriage expenses of a girl child.",
    benefits: ["Interest rate: 8.2% per annum (Q1 2024)", "Tax deduction under Section 80C", "Partial withdrawal after age 18 for education", "Maturity at 21 years of age"],
    docs: ["Girl child's birth certificate", "Parent/guardian Aadhaar & PAN", "Address proof", "Photograph"],
    steps: ["Visit any post office or authorised bank", "Fill Form SSY-1", "Submit documents & minimum deposit (₹250)", "Receive passbook"],
    link: "https://www.indiapost.gov.in",
    timeline: "Account opened same day",
    fraudTips: ["Only open accounts at post offices or listed banks", "Never share passbook PIN with anyone", "Interest is credited by government — no agent commission involved"],
    successStory: "Priya's parents opened an SSY account with ₹500/month. By age 21, the corpus funded her medical college admission.",
  },
  {
    id: 3,
    name: "Stand-Up India",
    benefit: "Loans ₹10 Lakh – ₹1 Crore for SC/ST and women entrepreneurs",
    category: "Business",
    tags: ["Women", "SC/ST", "Greenfield"],
    ministry: "Ministry of Finance",
    deadline: "Open",
    launchYear: 2016,
    beneficiaries: "2.04 Lakh+",
    eligibility: { minAge: 18, maxAge: 65, maxIncome: null },
    purpose: "Facilitate bank loans to SC/ST and/or Women borrowers for setting up greenfield enterprises.",
    benefits: ["Loan range: ₹10 lakh to ₹1 crore", "Covers 75% of project cost", "Tenure up to 7 years", "Moratorium period up to 18 months"],
    docs: ["Aadhaar & PAN", "Caste certificate", "Project report", "Bank statements", "No-objection certificate from existing lenders"],
    steps: ["Register on standupmitra.in portal", "Fill online application", "Choose nearest bank branch", "Document verification", "Loan sanction & disbursement"],
    link: "https://www.standupmitra.in",
    timeline: "30–45 working days",
    fraudTips: ["Apply only via standupmitra.in or directly at bank", "No middlemen required or authorised", "Verify loan terms before signing"],
    successStory: "Sunita Kumari started a food processing unit in UP with a ₹25L Stand-Up India loan, now supplying to 3 districts.",
  },
  {
    id: 4,
    name: "Digital Saksharta Abhiyan",
    benefit: "Free digital literacy training for rural households",
    category: "Education",
    tags: ["Digital", "Rural", "Free Training"],
    ministry: "MeitY",
    deadline: "Open",
    launchYear: 2017,
    beneficiaries: "6 Cr+ trained",
    eligibility: { minAge: 14, maxAge: 60, maxIncome: null },
    purpose: "Make rural India digitally literate by covering at least one person per eligible household.",
    benefits: ["Free training (20 hours)", "Certificate of completion", "Training on digital payments, internet, e-governance", "Nearest training centre assignment"],
    docs: ["Aadhaar Card", "Proof of rural residence"],
    steps: ["Register at pmgdisha.in or via CSC", "Attend 20-hour training at nearby centre", "Pass online certification exam", "Receive digital certificate"],
    link: "https://www.pmgdisha.in",
    timeline: "Training within 30 days of registration",
    fraudTips: ["Training is completely free — never pay anyone", "Register only on official portal or CSC", "Certificate is issued by NIELIT — verify on official portal"],
    successStory: "After PMGDISHA training, Meena from Rajasthan now manages her husband's shop accounts digitally and uses UPI confidently.",
  },
  {
    id: 5,
    name: "PM Fasal Bima Yojana",
    benefit: "Crop insurance with minimal premium for farmers",
    category: "Agriculture",
    tags: ["Farmer", "Insurance", "Crop"],
    ministry: "Ministry of Agriculture",
    deadline: "Seasonal",
    launchYear: 2016,
    beneficiaries: "5.5 Cr+ farmers",
    eligibility: { minAge: 18, maxAge: 70, maxIncome: null },
    purpose: "Provide financial support to farmers suffering crop loss/damage due to unforeseen events.",
    benefits: ["Premium: 2% for Kharif, 1.5% for Rabi crops", "Covers crop loss due to drought, flood, hailstorm", "Direct claim settlement to bank account", "Smartphone app for easy claim filing"],
    docs: ["Land records / tenancy papers", "Bank account details", "Aadhaar Card", "Sowing certificate"],
    steps: ["Enrol through nearest bank or CSC", "Pay nominal premium", "Submit land & crop details", "In case of loss, notify within 72 hours", "Claim settled via direct bank transfer"],
    link: "https://pmfby.gov.in",
    timeline: "Claims settled within 45 days",
    fraudTips: ["Always get official acknowledgement of your insurance", "Notify crop loss within 72 hours of occurrence", "Beware of fake agents collecting premium cash"],
    successStory: "After unseasonal rain destroyed his paddy crop, Ramesh from Odisha received ₹45,000 claim within 30 days.",
  },
  {
    id: 6,
    name: "Ayushman Bharat – PMJAY",
    benefit: "Health cover of ₹5 lakh per family per year",
    category: "Health",
    tags: ["Health", "Insurance", "BPL", "Hospital"],
    ministry: "Ministry of Health",
    deadline: "Open",
    launchYear: 2018,
    beneficiaries: "55 Cr+ beneficiaries",
    eligibility: { minAge: 0, maxAge: 100, maxIncome: 250000 },
    purpose: "Provide health cover of ₹5 lakh per family per year for secondary and tertiary hospitalisation.",
    benefits: ["₹5 lakh health cover per family/year", "Cashless treatment at 25,000+ empanelled hospitals", "Covers pre-existing conditions from day one", "No cap on family size or age"],
    docs: ["Aadhaar Card", "Ration card", "SECC database verification"],
    steps: ["Check eligibility at pmjay.gov.in or 14555", "Visit nearest Common Service Centre for e-card", "Use Ayushman card at empanelled hospital", "Avail cashless treatment"],
    link: "https://pmjay.gov.in",
    timeline: "Immediate coverage post card issuance",
    fraudTips: ["Ayushman card is FREE — never pay for it", "Verify hospitals at official website before visiting", "Report fraud at 14555"],
    successStory: "The Yadav family avoided ₹3.8L expenses when their father's cardiac surgery was fully covered under PMJAY.",
  },
];

const CATEGORIES = ["All", "Business", "Savings", "Education", "Agriculture", "Health", "Welfare"];
const STATES = ["All India", "Maharashtra", "Karnataka", "Tamil Nadu", "Uttar Pradesh", "Rajasthan", "West Bengal", "Gujarat", "Bihar", "Odisha", "Andhra Pradesh"];
const NAV_ITEMS = [
  { id: "discover",    label: "🔍 Discover" },
  { id: "eligibility", label: "✅ Eligibility" },
  { id: "compare",     label: "⚖️ Compare" },
  { id: "assistant",   label: "🤖 AI Assistant" },
];

// ─── AI ───────────────────────────────────────────────────────────────────────
type ChatMessage = { role: "user" | "assistant"; content: string };

async function askAI(messages: ChatMessage[]) {
  const res = await fetch(`${API_BASE}/api/schemes/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  const data = await res.json();
  return data.reply || "I couldn't process that. Please try again.";
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────
function GovNavbar({ activeTab, setActiveTab }) {
  return (
    <nav className="navbar">
      <div className="navbar-brand" onClick={() => setActiveTab("discover")}>
        🇮🇳 Scheme<em>Nav</em>
      </div>
      <div className="navbar-links">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`navbar-item ${activeTab === item.id ? "active" : ""}`}
            onClick={() => setActiveTab(item.id)}
          >
            {item.label}
          </button>
        ))}
        <span className="navbar-trust">🛡️ Verified Gov</span>
      </div>
    </nav>
  );
}

// ─── SCHEME DETAIL VIEW ───────────────────────────────────────────────────────
function SchemeDetail({ scheme: s, onBack }) {
  return (
    <div className="gov-root">
      <style>{injectStyles}</style>
      <div style={navbarThemeVars}>
        <Navbar />
      </div>
      <div style={{ position: "relative", zIndex: 1, maxWidth: "860px", margin: "0 auto" }} className="section-spacing">

        <motion.button
          className="glass-pill-secondary"
          style={{ marginBottom: "24px" }}
          onClick={onBack}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        >
          ← Back to Schemes
        </motion.button>

        {/* Header */}
        <motion.div className="glass-glow" style={{ padding: "32px", marginBottom: "20px" }}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                <span className="pill pill-accent">{s.category}</span>
                <span className="pill pill-green">✓ Official Scheme</span>
                <span className="pill pill-muted">{s.deadline}</span>
              </div>
              <h1 className="font-serif" style={{ fontSize: "30px", fontWeight: 700, marginBottom: "8px" }}>{s.name}</h1>
              <p className="text-muted-foreground" style={{ fontSize: "14px" }}>{s.ministry} · Launched {s.launchYear} · {s.beneficiaries} beneficiaries</p>
            </div>
            <a href={s.link} target="_blank" rel="noreferrer" className="glass-pill-primary">Apply Now ↗</a>
          </div>
        </motion.div>

        {/* Purpose + Timeline */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          {[
            { label: "Purpose", content: <p style={{ fontSize: "14px", lineHeight: 1.75 }}>{s.purpose}</p> },
            { label: "Processing Timeline", content: <p className="font-serif" style={{ fontSize: "24px", fontWeight: 700, color: "var(--accent)" }}>{s.timeline}</p> },
          ].map(({ label, content }, i) => (
            <motion.div key={label} className="glass" style={{ padding: "22px" }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.04 }}>
              <p style={{ fontSize: "11px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>{label}</p>
              {content}
            </motion.div>
          ))}
        </div>

        {/* Benefits */}
        <motion.div className="glass" style={{ padding: "24px", marginBottom: "16px" }}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <p className="font-serif" style={{ fontSize: "17px", fontWeight: 700, marginBottom: "14px" }}>💛 Key Benefits</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {s.benefits.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <span style={{ color: "var(--highlight)", flexShrink: 0, marginTop: "2px" }}>✓</span>
                <span style={{ fontSize: "14px" }}>{b}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Docs + Steps */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <motion.div className="glass" style={{ padding: "24px" }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
            <p className="font-serif" style={{ fontSize: "17px", fontWeight: 700, marginBottom: "14px" }}>📋 Document Checklist</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {s.docs.map((doc, i) => (
                <label key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                  <input type="checkbox" style={{ accentColor: "var(--accent)", width: "14px", height: "14px" }} /> {doc}
                </label>
              ))}
            </div>
          </motion.div>

          <motion.div className="glass" style={{ padding: "24px" }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            <p className="font-serif" style={{ fontSize: "17px", fontWeight: 700, marginBottom: "14px" }}>🗺️ How to Apply</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {s.steps.map((step, i) => (
                <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "var(--accent-dim)", border: "1px solid rgba(204,213,174,0.45)", color: "var(--accent)", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>{i + 1}</div>
                  <span style={{ fontSize: "13px", lineHeight: 1.55 }}>{step}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Fraud Awareness */}
        <motion.div className="glass" style={{ padding: "24px", marginBottom: "16px", borderColor: "rgba(239,68,68,0.22)" }}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <p className="font-serif" style={{ fontSize: "17px", fontWeight: 700, marginBottom: "12px" }}>🛡️ Fraud Awareness</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {s.fraudTips.map((tip, i) => (
              <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <span style={{ color: "var(--destructive)", flexShrink: 0 }}>⚠</span>
                <span className="text-muted-foreground" style={{ fontSize: "13px" }}>{tip}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Success story */}
        <motion.div className="glass-glow" style={{ padding: "28px" }}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
          <p style={{ fontSize: "11px", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: "12px" }}>💪 Success Story</p>
          <p className="font-serif" style={{ fontSize: "16px", fontStyle: "italic", lineHeight: 1.85 }}>"{s.successStory}"</p>
        </motion.div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function GovernmentPage() {
  const [activeTab, setActiveTab] = useState("discover");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [expandedId, setExpandedId] = useState(null);
  const [selectedScheme, setSelectedScheme] = useState(null);
  const [compareList, setCompareList] = useState([]);
  const [eligibility, setEligibility] = useState({ age: "", income: "", state: "All India", interest: "All" });
  const [eligibilityResults, setEligibilityResults] = useState(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Namaste! 🙏 I'm your Government Scheme Assistant. Ask me about any scheme, your eligibility, or how to apply. How can I help you today?" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const chatEndRef = useRef(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);
  useEffect(() => () => recognitionRef.current?.stop(), []);

  if (selectedScheme) {
    return <SchemeDetail scheme={selectedScheme} onBack={() => setSelectedScheme(null)} />;
  }

  const filtered = SCHEMES.filter(s => {
    const q = search.toLowerCase();
    return (s.name.toLowerCase().includes(q) || s.benefit.toLowerCase().includes(q) || s.tags.some(t => t.toLowerCase().includes(q)))
      && (activeCategory === "All" || s.category === activeCategory);
  });

  const toggleCompare = (scheme) => {
    setCompareList(prev =>
      prev.find(s => s.id === scheme.id)
        ? prev.filter(s => s.id !== scheme.id)
        : prev.length < 3 ? [...prev, scheme] : prev
    );
  };

  const checkEligibility = () => {
    const age = parseInt(eligibility.age) || 0;
    const income = parseInt(eligibility.income) || 0;
    setEligibilityResults(SCHEMES.filter(s => {
      const e = s.eligibility;
      return age >= e.minAge && age <= e.maxAge
        && (!e.maxIncome || income <= e.maxIncome)
        && (eligibility.interest === "All" || s.category === eligibility.interest);
    }));
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput };
    const next = [...chatMessages, userMsg];
    setChatMessages(next);
    setChatInput("");
    setChatLoading(true);
    try {
      const apiMsgs = next
        .filter((m, i) => !(m.role === "assistant" && i === 0))
        .map(m => ({ role: m.role, content: m.content }));
      const reply = await askAI(apiMsgs);
      const assistantMsg: ChatMessage = { role: "assistant", content: reply };
      setChatMessages([...next, assistantMsg]);
    } catch {
      const assistantMsg: ChatMessage = { role: "assistant", content: "Sorry, I'm having trouble connecting. Please check your internet and try again." };
      setChatMessages([...next, assistantMsg]);
    }
    setChatLoading(false);
  };

  const toggleRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setSpeechError("Speech recognition not supported. Please use Chrome or Edge.");
      return;
    }
    setSpeechError(null);
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const r = new SR();
    r.lang = language.bcp;
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e: SpeechRecognitionEvent) => {
      setChatInput(e.results[0][0].transcript);
      setIsRecording(false);
    };
    r.onerror = () => {
      setSpeechError("Couldn't capture voice. Please try again.");
      setIsRecording(false);
    };
    r.onend = () => setIsRecording(false);
    recognitionRef.current = r;
    setIsRecording(true);
    r.start();
  };

  const speakMessage = (text: string) => {
    if (!("speechSynthesis" in window)) {
      setSpeechError("Text-to-speech not supported in this browser.");
      return;
    }
    setSpeechError(null);
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = language.bcp;
    window.speechSynthesis.speak(utter);
  };

  return (
    <div className="gov-root">
      <style>{injectStyles}</style>
      <div style={navbarThemeVars}>
        <Navbar />
      </div>
      <div className="section-spacing" style={{ position: "relative", zIndex: 1, maxWidth: "1100px", margin: "0 auto" }}>

        {/* Heading */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: "28px" }}>
          <h1 className="font-serif" style={{ fontSize: "32px", fontWeight: 700, marginBottom: "6px" }}>
            Find the Right Government Support
          </h1>
          <p className="text-muted-foreground" style={{ fontSize: "14px" }}>
            Discover, verify, and apply for government schemes — all in one place
          </p>
        </motion.div>

        {/* Tab Nav */}
        <motion.div className="tab-nav" style={{ marginBottom: "28px" }}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          {NAV_ITEMS.map(tab => (
            <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? "active" : ""}`} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </motion.div>

        {/* ── DISCOVER ── */}
        {activeTab === "discover" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Search box */}
            <motion.div className="glass-glow" style={{ padding: "24px", marginBottom: "20px" }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
              <input
                className="glass-input"
                placeholder="Search schemes by name, benefit, or keyword (e.g. loan, women, education)…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ fontSize: "15px", padding: "13px 16px", marginBottom: "14px" }}
              />
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    className={`glass-pill-secondary ${activeCategory === cat ? "active" : ""}`}
                    style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "20px" }}
                    onClick={() => setActiveCategory(cat)}
                  >{cat}</button>
                ))}
              </div>
            </motion.div>

            {/* Compare bar */}
            <AnimatePresence>
              {compareList.length > 0 && (
                <motion.div
                  className="glass"
                  style={{ padding: "14px 20px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", borderColor: "var(--glass-border-accent)" }}
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                >
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    <span className="text-muted-foreground" style={{ fontSize: "13px" }}>Comparing:</span>
                    {compareList.map(s => <span key={s.id} className="pill pill-accent">{s.name}</span>)}
                  </div>
                  <button className="glass-pill-primary" style={{ fontSize: "12px", padding: "8px 18px" }} onClick={() => setActiveTab("compare")}>
                    Compare Now →
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Scheme cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {filtered.length === 0 && (
                <div className="glass" style={{ padding: "48px", textAlign: "center" }}>
                  <p className="text-muted-foreground">No schemes found for "{search}". Try different keywords.</p>
                </div>
              )}
              {filtered.map((scheme, i) => (
                <motion.div
                  key={scheme.id}
                  className="glass-strip"
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
                        <span className="pill pill-accent">{scheme.category}</span>
                        {scheme.tags.slice(0, 2).map(t => <span key={t} className="pill pill-muted">{t}</span>)}
                        <span className="pill pill-green">✓ Verified</span>
                      </div>
                      <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "5px" }}>{scheme.name}</h3>
                      <p className="text-muted-foreground" style={{ fontSize: "13px", marginBottom: "4px" }}>{scheme.benefit}</p>
                      <p className="text-muted-foreground" style={{ fontSize: "12px" }}>{scheme.ministry} · {scheme.beneficiaries} beneficiaries</p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0, alignItems: "flex-end" }}>
                      <button className="glass-pill-primary" style={{ fontSize: "12px", padding: "7px 16px" }} onClick={() => setSelectedScheme(scheme)}>
                        View Details
                      </button>
                      <button
                        className={`glass-pill-secondary ${compareList.find(s => s.id === scheme.id) ? "active" : ""}`}
                        style={{ fontSize: "11px", padding: "5px 12px", borderRadius: "20px" }}
                        onClick={() => toggleCompare(scheme)}
                      >
                        {compareList.find(s => s.id === scheme.id) ? "✓ Added" : "+ Compare"}
                      </button>
                    </div>
                  </div>

                  {/* Quick preview */}
                  <AnimatePresence>
                    {expandedId === scheme.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: "hidden" }}
                      >
                        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--glass-border)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                          <div>
                            <p style={{ fontSize: "11px", color: "var(--muted-foreground)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.8px" }}>Key Benefits</p>
                            {scheme.benefits.slice(0, 2).map((b, i) => <p key={i} style={{ fontSize: "13px", marginBottom: "5px" }}>• {b}</p>)}
                          </div>
                          <div>
                            <p style={{ fontSize: "11px", color: "var(--muted-foreground)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.8px" }}>Documents Needed</p>
                            {scheme.docs.slice(0, 3).map((d, i) => <p key={i} style={{ fontSize: "13px", marginBottom: "5px" }}>• {d}</p>)}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    onClick={() => setExpandedId(expandedId === scheme.id ? null : scheme.id)}
                    style={{ background: "none", border: "none", color: "var(--muted-foreground)", fontSize: "12px", cursor: "pointer", marginTop: "12px", fontFamily: "\"Times New Roman\", Times, serif" }}
                  >
                    {expandedId === scheme.id ? "▲ Less info" : "▼ Quick preview"}
                  </button>
                </motion.div>
              ))}
            </div>

            {/* Safe tips — mirrors VoicePage right panel bottom card */}
            <motion.div className="glass-glow" style={{ padding: "24px", marginTop: "20px" }}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
              <h3 className="font-serif" style={{ fontSize: "17px", fontWeight: 700, marginBottom: "12px" }}>🛡️ Safe Application Tips</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[
                  "Always apply through official government portals only",
                  "Never share your OTP or bank password for any scheme registration",
                  "Keep copies of all documents you submit",
                  "Verify helpline numbers on the official website before calling",
                ].map((tip, i) => (
                  <p key={i} className="text-muted-foreground" style={{ fontSize: "13px" }}>• {tip}</p>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ── ELIGIBILITY ── */}
        {activeTab === "eligibility" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "24px", alignItems: "start" }}>
              <motion.div className="glass-glow" style={{ padding: "28px" }}
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                <h2 className="font-serif" style={{ fontSize: "22px", fontWeight: 700, marginBottom: "6px" }}>Eligibility Checker</h2>
                <p className="text-muted-foreground" style={{ fontSize: "13px", marginBottom: "22px" }}>Enter your details to find schemes you qualify for</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {[
                    { label: "Age", key: "age", type: "number", placeholder: "Your age" },
                    { label: "Annual Income (₹)", key: "income", type: "number", placeholder: "e.g. 250000" },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <label style={{ fontSize: "12px", color: "var(--muted-foreground)", display: "block", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</label>
                      <input className="glass-input" type={type} placeholder={placeholder} value={eligibility[key]}
                        onChange={e => setEligibility({ ...eligibility, [key]: e.target.value })} />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: "12px", color: "var(--muted-foreground)", display: "block", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.6px" }}>State</label>
                    <select className="glass-input" value={eligibility.state} onChange={e => setEligibility({ ...eligibility, state: e.target.value })}>
                      {STATES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", color: "var(--muted-foreground)", display: "block", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Interest Area</label>
                    <select className="glass-input" value={eligibility.interest} onChange={e => setEligibility({ ...eligibility, interest: e.target.value })}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <button className="glass-pill-primary" style={{ width: "100%", padding: "11px", marginTop: "4px" }} onClick={checkEligibility}>
                    Find Matching Schemes
                  </button>
                </div>
              </motion.div>

              <div>
                {eligibilityResults === null ? (
                  <div className="glass" style={{ padding: "56px", textAlign: "center" }}>
                    <p style={{ fontSize: "40px", marginBottom: "14px" }}>🎯</p>
                    <p className="text-muted-foreground" style={{ fontSize: "14px" }}>Fill in your details and click "Find Matching Schemes" to see personalised recommendations.</p>
                  </div>
                ) : eligibilityResults.length === 0 ? (
                  <div className="glass" style={{ padding: "56px", textAlign: "center" }}>
                    <p className="text-muted-foreground">No schemes matched your criteria. Try broadening the filters.</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: "13px", color: "var(--highlight)", marginBottom: "14px" }}>✓ Found {eligibilityResults.length} matching scheme{eligibilityResults.length > 1 ? "s" : ""}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {eligibilityResults.map((s, i) => (
                        <motion.div key={s.id} className="glass-strip"
                          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                              <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                                <span className="pill pill-green">✓ Eligible</span>
                                <span className="pill pill-accent">{s.category}</span>
                              </div>
                              <p style={{ fontWeight: 600, marginBottom: "5px" }}>{s.name}</p>
                              <p className="text-muted-foreground" style={{ fontSize: "13px" }}>{s.benefit}</p>
                            </div>
                            <button className="glass-pill-primary" style={{ fontSize: "12px", padding: "7px 14px" }} onClick={() => setSelectedScheme(s)}>View →</button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── COMPARE ── */}
        {activeTab === "compare" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {compareList.length < 2 ? (
              <div className="glass" style={{ padding: "56px", textAlign: "center" }}>
                <p style={{ fontSize: "40px", marginBottom: "14px" }}>⚖️</p>
                <p className="text-muted-foreground" style={{ marginBottom: "18px" }}>Select at least 2 schemes from the Discover tab to compare them side-by-side.</p>
                <button className="glass-pill-primary" onClick={() => setActiveTab("discover")}>Go to Discover →</button>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: "16px", overflowX: "auto", paddingBottom: "8px" }}>
                  {/* Labels column */}
                  <div style={{ minWidth: "140px", paddingTop: "58px", flexShrink: 0 }}>
                    {["Category", "Benefit", "Ministry", "Launched", "Beneficiaries", "Timeline", "Min Age", "Max Income"].map((label, i) => (
                      <div key={i} style={{ padding: "11px 0", borderBottom: "1px solid var(--glass-border)", fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {label}
                      </div>
                    ))}
                  </div>
                  {compareList.map((s, i) => (
                    <div key={s.id} className={`compare-col ${i === 0 ? "highlight" : ""}`}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                        <div>
                          <span className="pill pill-accent" style={{ marginBottom: "6px", display: "inline-block" }}>{s.category}</span>
                          <p style={{ fontWeight: 700, fontSize: "14px" }}>{s.name}</p>
                        </div>
                        <button onClick={() => toggleCompare(s)} style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", fontSize: "18px" }}>×</button>
                      </div>
                      {[
                        s.category,
                        s.benefit.substring(0, 48) + "…",
                        s.ministry,
                        s.launchYear,
                        s.beneficiaries,
                        s.timeline,
                        s.eligibility.minAge + " yrs",
                        s.eligibility.maxIncome ? "₹" + (s.eligibility.maxIncome / 100000).toFixed(1) + "L" : "No limit",
                      ].map((val, j) => (
                        <div key={j} style={{ padding: "11px 0", borderBottom: "1px solid var(--glass-border)", fontSize: "13px" }}>{val}</div>
                      ))}
                      <button className="glass-pill-primary" style={{ width: "100%", marginTop: "16px", fontSize: "12px", padding: "9px" }} onClick={() => setSelectedScheme(s)}>
                        Full Details →
                      </button>
                    </div>
                  ))}
                </div>
                <button className="glass-pill-secondary" style={{ marginTop: "16px" }} onClick={() => setCompareList([])}>Clear All</button>
              </div>
            )}
          </motion.div>
        )}


        {/* ── AI ASSISTANT ── mirrors VoicePage layout exactly ── */}
        {activeTab === "assistant" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "flex-start" }}>

              {/* Main chat col */}
              <div style={{ flex: 1, minWidth: "300px" }}>
                <h1 className="font-serif" style={{ fontSize: "28px", fontWeight: 700, marginBottom: "20px" }}>Digital Safety Companion</h1>

                {/* Messages — glass-glow, min-height matches VoicePage */}
                <div className="glass-glow" style={{ padding: "20px", minHeight: "400px", maxHeight: "480px", overflowY: "auto", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {chatMessages.map((msg, i) => (
                    <motion.div
                      key={i}
                      className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    >
                      <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                        <span style={{ flex: 1 }}>{msg.content}</span>
                        {msg.role === "assistant" && (
                          <button
                            onClick={() => speakMessage(msg.content)}
                            title="Listen"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--muted-foreground)",
                              cursor: "pointer",
                              fontSize: "14px",
                              lineHeight: 1,
                            }}
                          >
                            🔊
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {chatLoading && (
                    <div className="chat-bubble-ai" style={{ color: "var(--muted-foreground)" }}>
                      <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.2 }}>Thinking…</motion.span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Mic + Input + Send — exact VoicePage layout */}
                <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px" }}>
                  <button
                    onClick={toggleRecording}
                    aria-pressed={isRecording}
                    title={isRecording ? "Stop recording" : "Start voice input"}
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                      background: isRecording ? "var(--destructive-dim)" : "var(--accent-dim)",
                      border: `1px solid ${isRecording ? "rgba(217,107,107,0.5)" : "rgba(204,213,174,0.45)"}`,
                      backdropFilter: "blur(8px)",
                      flexShrink: 0,
                      cursor: "pointer",
                    }}
                  >
                    {isRecording ? "⏺" : "🎙️"}
                  </button>
                  <input
                    className="glass-input"
                    style={{ flex: 1 }}
                    placeholder="Type your concern..."
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && sendChat()}
                  />
                  <button className="glass-pill-primary" onClick={sendChat} disabled={chatLoading} style={{ padding: "10px 22px", flexShrink: 0 }}>
                    {chatLoading ? "…" : "Send"}
                  </button>
                </div>

                {speechError && (
                  <p className="text-xs text-destructive" style={{ marginBottom: "8px" }}>
                    {speechError}
                  </p>
                )}

                {/* Language selector — VoicePage */}
                <select
                  className="glass-input"
                  style={{ width: "160px", fontSize: "13px" }}
                  value={language.value}
                  onChange={e => {
                    const next = LANGUAGES.find(l => l.value === e.target.value) || LANGUAGES[0];
                    setLanguage(next);
                  }}
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.value} value={lang.value}>{lang.label}</option>
                  ))}
                </select>
              </div>

              {/* Right panel — exact VoicePage right panel */}
              <div style={{ width: "300px", display: "flex", flexDirection: "column", gap: "16px", flexShrink: 0 }}>

                {/* Stay Safe Guide — sticky like VoicePage */}
                <div className="glass" style={{ padding: "24px" }}>
                  <h3 className="font-serif" style={{ fontSize: "17px", fontWeight: 700, marginBottom: "14px" }}>🛡️ Stay Safe Guide</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {[
                      "Never share OTP with anyone",
                      "Banks never ask for passwords",
                      "Verify caller identity",
                      "Screenshot suspicious messages",
                    ].map((tip, i) => (
                      <p key={i} className="text-muted-foreground" style={{ fontSize: "13px" }}>• {tip}</p>
                    ))}
                  </div>
                </div>

                {/* Quick Practice — glass-glow like VoicePage */}
                <div className="glass-glow" style={{ padding: "20px" }}>
                  <h4 style={{ fontWeight: 600, fontSize: "14px", marginBottom: "6px" }}>🎯 Quick Practice</h4>
                  <p className="text-muted-foreground" style={{ fontSize: "13px", marginBottom: "12px" }}>Test your knowledge with a quick drill</p>
                  <button className="glass-pill-secondary" style={{ width: "100%", justifyContent: "center" }}>Start Drill</button>
                </div>

                {/* Encouragement card — VoicePage */}
                <div className="glass" style={{ padding: "20px", textAlign: "center" }}>
                  <p style={{ fontSize: "28px", marginBottom: "8px" }}>💪</p>
                  <p style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>You're doing great!</p>
                  <p className="text-muted-foreground" style={{ fontSize: "12px" }}>Every question makes you safer</p>
                </div>

                {/* Quick questions */}
                <div className="glass" style={{ padding: "16px" }}>
                  <p style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Quick Questions</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {["Am I eligible for MUDRA?", "Best scheme for women entrepreneurs", "How to apply for Ayushman Bharat?", "Crop insurance schemes"].map(q => (
                      <button key={q} className="glass-pill-secondary"
                        style={{ fontSize: "11px", padding: "6px 12px", borderRadius: "8px", textAlign: "left", justifyContent: "flex-start" }}
                        onClick={() => setChatInput(q)}>{q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
