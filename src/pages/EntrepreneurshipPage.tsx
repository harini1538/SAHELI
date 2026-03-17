import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";
import { getAuth, getToken } from "../lib/auth";

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const authHeaders = (headers: Record<string, string> = {}) => {
  const token = getToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
};

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

const bumpJourneyCount = (key: string, delta = 1) => {
  if (typeof window === "undefined") return 0;
  const next = readJourneyCount(key) + delta;
  window.localStorage.setItem(key, String(next));
  window.dispatchEvent(new Event("saheli:journey-updated"));
  return next;
};

type ApiFetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

async function apiFetch(path: string, opts: ApiFetchOptions = {}) {
  const res  = await fetch(`${API}/api/business${path}`, {
    credentials: "include",
    headers: authHeaders({ "Content-Type": "application/json", ...(opts.headers ?? {}) }),
    ...opts,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "API error");
  return json.data;
}
const apiGet  = (p: string) => apiFetch(p);
const apiPost = (p: string, b: Record<string, unknown>) =>
  apiFetch(p, { method: "POST", body: JSON.stringify(b) });

// ─────────────────────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────────────────────
const Spinner = ({ size = "sm" }) => (
  <span className={`inline-block border-[2.5px] border-current border-t-transparent rounded-full animate-spin
    ${size === "lg" ? "w-10 h-10" : size === "md" ? "w-5 h-5" : "w-4 h-4"}`} />
);

// Fixed admin badge — using existing pill classes only, no extra color overrides
const AdminBadge = () => (
  <span style={{
    fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase",
    padding: "2px 10px", borderRadius: "999px",
    background: "rgba(var(--color-accent, 180,60,60),0.15)",
    border: "1px solid rgba(var(--color-accent, 180,60,60),0.3)",
    color: "var(--color-foreground, #333)",
    fontWeight: 600, flexShrink: 0,
  }}>
    Admin
  </span>
);

const Err = ({ msg }) => msg
  ? <p className="text-xs text-destructive mt-1.5">{msg}</p>
  : null;

const ScoreBar = ({ label, val }) => (
  <div className="mb-3">
    <div className="flex justify-between text-xs mb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{val}<span className="text-muted-foreground font-normal">/10</span></span>
    </div>
    <div className="w-full bg-glass-border rounded-full h-1.5 overflow-hidden">
      <motion.div className="h-full rounded-full bg-primary"
        initial={{ width: 0 }} animate={{ width: `${val * 10}%` }}
        transition={{ duration: 0.7, ease: "easeOut" }} />
    </div>
  </div>
);

// Loading steps shown while AI analyzes
const LOAD_STEPS = [
  "🧠 Reading your idea…",
  "💡 Building Idea Canvas…",
  "📊 Estimating startup costs…",
  "🎯 Creating decision scenarios…",
  "⚠️ Identifying business risks…",
  "💰 Finding funding options…",
  "🎤 Writing your pitch script…",
  "🗺️ Mapping your growth roadmap…",
  "✨ Almost done…",
];

// ─────────────────────────────────────────────────────────────────────────────
// Default config
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT = {
  idea: "",
  modules: [
    { id: "canvas",   label: "💡 Idea Canvas"       },
    { id: "cost",     label: "📊 Cost Planner"      },
    { id: "decision", label: "🎯 Decision Sim"      },
    { id: "risk",     label: "⚠️ Risk Awareness"    },
    { id: "funding",  label: "💰 Funding Explorer"  },
    { id: "pitch",    label: "🎤 Pitch Practice"    },
  ],
  canvas_blocks: ["Problem", "Solution", "Target Audience", "Revenue Model", "Unique Value"],
  canvas_data:   {},
  cost_items: [
    { label: "Rent / Workspace",  estimated_min: 5000,  estimated_max: 15000 },
    { label: "Equipment",          estimated_min: 10000, estimated_max: 50000 },
    { label: "Marketing",          estimated_min: 3000,  estimated_max: 10000 },
    { label: "Inventory",          estimated_min: 5000,  estimated_max: 20000 },
    { label: "Licenses",           estimated_min: 2000,  estimated_max: 8000  },
  ],
  decision_cards: [
    { q: "Take a loan to expand?",
      context: "Access to capital early can accelerate growth but adds financial obligation.",
      a: "Yes – Grow fast", b: "No – Stay stable",
      a_detail: "Reach more customers quickly with borrowed capital.", b_detail: "Grow lean, zero debt, slower pace." },
    { q: "Hire an employee now?",
      context: "Hiring frees your time for growth but adds ₹10K-25K/month cost.",
      a: "Yes – Delegate", b: "No – Solo for now",
      a_detail: "Scale operations faster, delegate tasks.", b_detail: "Keep full control, save on salary costs." },
  ],
  risk_categories: [
    { label: "Market Risk",     description: "Demand may be lower than expected." },
    { label: "Financial Risk",  description: "Running out of funds before breakeven." },
    { label: "Competition",     description: "Established players may undercut pricing." },
    { label: "Regulatory Risk", description: "Licenses or compliance requirements." },
    { label: "Technology Risk", description: "Dependence on digital tools or platforms." },
  ],
  funding_sources: [
    { name: "MUDRA Loan", type: "Government", amount: "Up to ₹10L",
      description: "Collateral-free micro business loans under PM MUDRA Yojana.",
      how_to_apply: "Visit any PSU bank branch or mudra.org.in",
      eligibility: "Any Indian citizen, non-farm business",
      url: "https://mudra.org.in" },
    { name: "Angel Investment", type: "Private", amount: "₹5L–50L",
      description: "Early-stage equity funding from individual investors.",
      how_to_apply: "Apply on LetsVenture or AngelList India",
      eligibility: "Scalable idea with growth potential",
      url: "https://letsventure.com" },
    { name: "PMEGP", type: "Government", amount: "Up to ₹25L",
      description: "Prime Minister's Employment Generation Programme for new businesses.",
      how_to_apply: "Apply through KVIC portal: kviconline.gov.in",
      eligibility: "Above 18 years, new business, not existing unit",
      url: "https://kviconline.gov.in" },
  ],
  pitch: {
    duration: 60, feedback_enabled: true,
    tips: ["Open with your strongest result", "State the problem in one sentence"],
    generated_script: "",
  },
  mentor_prompts: [
    "How do I validate my idea with customers?",
    "What pricing strategy should I start with?",
    "How can I reduce costs in my first 3 months?",
  ],
  roadmap: ["Validate Idea", "Build MVP", "First Customer", "Scale Operations", "Seek Funding"],
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function EntrepreneurshipPage() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (auth?.role === "admin") {
      setIsAdmin(true);
      return;
    }
    setIsAdmin(false);
    if (!getToken()) return;
    fetch(`${API}/api/auth/me`, { headers: authHeaders({}) })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user?.role === "admin") setIsAdmin(true);
      })
      .catch(() => {});
  }, []);

  // phase: "idea" | "loading" | "studio"
  const [phase,      setPhase]      = useState("idea");
  const [loadStep,   setLoadStep]   = useState(0);
  const [ideaInput,  setIdeaInput]  = useState("");
  const [analyzeErr, setAnalyzeErr] = useState("");

  const [cfg, setCfg] = useState(DEFAULT);
  const apply = (d) => setCfg(p => ({ ...p, ...d }));

  const [activeModule, setActiveModule] = useState("canvas");

  // user state
  const [costValues,     setCostValues]     = useState({});  // { label: userEnteredValue }
  const [mentorQ,        setMentorQ]        = useState("");
  const [mentorAnswer,   setMentorAnswer]   = useState("");
  const [mentorLoading,  setMentorLoading]  = useState(false);
  const [mentorErr,      setMentorErr]      = useState("");
  const [pitchText,      setPitchText]      = useState("");
  const [pitchFeedback,  setPitchFeedback]  = useState(null);
  const [pitchFbLoading, setPitchFbLoading] = useState(false);
  const [pitchFbErr,     setPitchFbErr]     = useState("");
  const [recording,      setRecording]      = useState(false);
  const [timeLeft,       setTimeLeft]       = useState(60);
  const timerRef  = useRef(null);
  const recognRef = useRef(null);

  // funding search state
  const [fundingSearching, setFundingSearching] = useState(false);
  const [fundingSearchErr, setFundingSearchErr] = useState("");

  // admin inputs
  const [aModName, setAModName] = useState("");
  const [aCanvas,  setACanvas]  = useState("");
  const [aCostLbl, setACostLbl] = useState("");
  const [aCostMin, setACostMin] = useState("");
  const [aCostMax, setACostMax] = useState("");
  const [aDQ, setADQ] = useState(""); const [aDA, setADA] = useState(""); const [aDB, setADB] = useState("");
  const [aRisk,    setARisk]    = useState("");
  const [aFN, setAFN] = useState(""); const [aFT, setAFT] = useState(""); const [aFA, setAFA] = useState("");
  const [aPTip,    setAPTip]    = useState("");
  const [aMPr,     setAMPr]     = useState("");
  const [aRMap,    setARMap]    = useState("");
  const [adminErr, setAdminErr] = useState("");
  const [adminBusy,setAdminBusy]= useState(false);

  // Boot
  useEffect(() => {
    apiGet("/config").then(d => {
      apply(d);
      if (d.idea) { setPhase("studio"); setActiveModule("canvas"); }
    }).catch(() => {});
  }, []);

  useEffect(() => { setTimeLeft(cfg.pitch.duration); }, [cfg.pitch.duration]);

  // ── Analyze ───────────────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    const idea = ideaInput.trim();
    if (!idea || idea.length < 10) { setAnalyzeErr("Please describe your idea in at least 10 characters."); return; }
    setAnalyzeErr(""); setPhase("loading"); setLoadStep(0);
    const iv = setInterval(() => setLoadStep(s => s < LOAD_STEPS.length - 1 ? s + 1 : s), 1100);
    try {
      const d = await apiPost("/analyze", { idea });
      clearInterval(iv);
      apply(d);
      setPitchText(d.pitch?.generated_script || "");
      setPhase("studio"); setActiveModule("canvas");
      bumpJourneyCount(JOURNEY_KEYS.ideas);
      bumpJourneyCount(JOURNEY_KEYS.plans);
    } catch (e) {
      clearInterval(iv);
      setAnalyzeErr(e.message); setPhase("idea");
    }
  };

  // ── Funding web search ────────────────────────────────────────────────────
  const handleFundingSearch = async () => {
    setFundingSearching(true); setFundingSearchErr("");
    try {
      const d = await apiPost("/funding/search", { idea: cfg.idea });
      apply({ funding_sources: d.funding_sources });
    } catch (e) {
      setFundingSearchErr(e.message);
    } finally {
      setFundingSearching(false);
    }
  };

  // ── Mentor ────────────────────────────────────────────────────────────────
  const handleMentorAsk = async (q?: string) => {
    const question = (q || mentorQ).trim(); if (!question) return;
    setMentorQ(question); setMentorLoading(true); setMentorAnswer(""); setMentorErr("");
    try { const d = await apiPost("/mentor/ask", { question, idea: cfg.idea }); setMentorAnswer(d.answer); }
    catch (e) { setMentorErr(e.message); }
    finally   { setMentorLoading(false); }
  };

  // ── Pitch feedback ────────────────────────────────────────────────────────
  const handlePitchFeedback = async () => {
    if (!pitchText.trim()) { setPitchFbErr("Type or record your pitch first."); return; }
    setPitchFbLoading(true); setPitchFeedback(null); setPitchFbErr("");
    try {
      const d = await apiPost("/pitch/feedback", { pitch_text: pitchText, idea: cfg.idea });
      setPitchFeedback(d.feedback);
      bumpJourneyCount(JOURNEY_KEYS.pitches);
    }
    catch (e) { setPitchFbErr(e.message); }
    finally   { setPitchFbLoading(false); }
  };

  // ── Record ────────────────────────────────────────────────────────────────
  const toggleRecord = () => {
    if (recording) {
      clearInterval(timerRef.current); setRecording(false); setTimeLeft(cfg.pitch.duration);
      recognRef.current?.stop();
    } else {
      setRecording(true); setTimeLeft(cfg.pitch.duration); setPitchFeedback(null);
      timerRef.current = setInterval(() => setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); setRecording(false); return 0; } return t - 1;
      }), 1000);
      if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
        const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
        const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = "en-IN";
        rec.onresult = (e) => { let t=""; for (let i=0;i<e.results.length;i++) t+=e.results[i][0].transcript; setPitchText(t); };
        rec.start(); recognRef.current = rec;
      }
    }
  };

  // ── Admin helper ──────────────────────────────────────────────────────────
  const adm = useCallback(async (fn) => {
    setAdminErr(""); setAdminBusy(true);
    try { await fn(); } catch (e) { setAdminErr(e.message); } finally { setAdminBusy(false); }
  }, []);

  // Cost total — user entered values vs AI estimates
  const totalEntered   = cfg.cost_items.reduce((s, it) => s + (parseFloat(costValues[it.label]) || 0), 0);
  const totalEstMin    = cfg.cost_items.reduce((s, it) => s + (it.estimated_min || 0), 0);
  const totalEstMax    = cfg.cost_items.reduce((s, it) => s + (it.estimated_max || 0), 0);

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE: IDEA ENTRY
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === "idea") return (
    <div className="relative min-h-screen">
      <Navbar />
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pt-20 pb-12">

        {isAdmin && (
          <div className="absolute top-24 right-6">
            <AdminBadge />
          </div>
        )}

        <motion.div className="w-full max-w-2xl"
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>

          <motion.div className="flex justify-center mb-6"
            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }}>
            <span className="glass-strip px-4 py-1.5 text-xs uppercase tracking-[0.25em] text-primary">
              🤖 AI Startup Incubator
            </span>
          </motion.div>

          <motion.h1 className="font-serif text-4xl md:text-5xl font-bold text-center mb-4 leading-tight"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            Business Growth Studio
          </motion.h1>
          <motion.p className="text-center text-muted-foreground mb-10 text-base leading-relaxed"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            Enter your business idea once. AI generates your complete startup plan — canvas, costs with estimates,
            decision scenarios, risks, funding sources, pitch script, and roadmap.
          </motion.p>

          <motion.div className="glass-glow p-8"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground block mb-3">
              Your Business Idea
            </label>
            <textarea value={ideaInput} onChange={e => setIdeaInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) handleAnalyze(); }}
              rows={3} placeholder='e.g. "I want to start a home bakery selling customized cakes for birthdays and events"'
              className="glass-input text-sm w-full resize-none mb-4" />
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-muted-foreground">Ctrl+Enter or click Generate</p>
              <button onClick={handleAnalyze}
                className="glass-pill-primary flex items-center gap-2 px-8 py-2.5 text-sm font-semibold">
                ✨ Generate My Startup Plan
              </button>
            </div>
            <Err msg={analyzeErr} />
          </motion.div>

          {/* What AI generates preview */}
          <motion.div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
            {[
              ["💡", "Idea Canvas",      "Problem, Solution, Audience"],
              ["📊", "Cost Planner",     "Estimates per category"],
              ["🎯", "Decision Sim",     "Real scenarios with context"],
              ["⚠️", "Risk Awareness",   "Risks specific to your idea"],
              ["💰", "Funding Explorer", "Web-searched Indian funding"],
              ["🎤", "Pitch Practice",   "AI-written pitch + feedback"],
            ].map(([icon, title, sub]) => (
              <div key={title} className="glass-strip p-4 text-center">
                <div className="text-2xl mb-1">{icon}</div>
                <p className="text-xs font-semibold mb-0.5">{title}</p>
                <p className="text-[10px] text-muted-foreground">{sub}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE: LOADING
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === "loading") return (
    <div className="relative min-h-screen">
      <Navbar />
      <div className="flex flex-col items-center justify-center min-h-screen px-4 gap-8">
        <Spinner size="lg" />
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">AI is building your startup plan</p>
          <AnimatePresence mode="wait">
            <motion.p key={loadStep} className="font-serif text-xl font-semibold"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              {LOAD_STEPS[loadStep]}
            </motion.p>
          </AnimatePresence>
          <p className="text-xs text-muted-foreground italic mt-1">"{ideaInput}"</p>
        </div>
        <div className="flex gap-2">
          {LOAD_STEPS.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-all duration-300 ${i <= loadStep ? "bg-primary scale-110" : "bg-glass-border"}`} />
          ))}
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE: STUDIO
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen">
      <Navbar />
      <div className="relative z-10 pt-24 section-spacing max-w-7xl mx-auto px-4">

        {/* Top bar */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold">Business Growth Studio</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Idea:</span>
              <span className="text-sm font-medium italic">"{cfg.idea}"</span>
              <button onClick={() => { setPhase("idea"); setIdeaInput(cfg.idea); }}
                className="glass-pill-secondary text-[10px] px-2 py-0.5">✏️ Change Idea</button>
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <AdminBadge />
            </div>
          )}
        </div>

        {/* Admin module mgmt */}
        {isAdmin && (
          <div className="glass-glow p-5 mb-8">
            <div className="flex items-center gap-3 mb-3"><AdminBadge /><p className="font-serif text-base font-bold">Module Management</p></div>
            <div className="flex flex-wrap gap-2 items-center">
              <input value={aModName} onChange={e=>setAModName(e.target.value)} placeholder="Module name" className="glass-input text-sm min-w-[180px]" />
              <button className="glass-pill-primary text-xs" disabled={adminBusy} onClick={()=>adm(async()=>{ const d=await apiPost("/modules",{action:"add",label:aModName.trim()}); setCfg(p=>({...p,modules:d.modules})); setAModName(""); })}>Add</button>
              <button className="glass-pill-secondary text-xs" disabled={adminBusy} onClick={()=>adm(async()=>{ const d=await apiPost("/modules",{action:"rename",id:activeModule,label:aModName.trim()}); setCfg(p=>({...p,modules:d.modules})); setAModName(""); })}>Rename Active</button>
              <button className="glass-pill-secondary text-xs" disabled={adminBusy} onClick={()=>adm(async()=>{ const d=await apiPost("/modules",{action:"remove",id:activeModule}); setCfg(p=>({...p,modules:d.modules})); if(d.modules.length) setActiveModule(d.modules[0].id); })}>Remove Active</button>
            </div>
            <Err msg={adminErr} />
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">

          {/* ══════════════ LEFT ══════════════ */}
          <div className="flex-1 min-w-0">

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 mb-8">
              {cfg.modules.map(m => (
                <button key={m.id} onClick={() => setActiveModule(m.id)}
                  className={`glass-tab ${activeModule===m.id ? "glass-tab-active" : ""}`}>{m.label}</button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={activeModule} className="glass-glow p-8 md:p-10"
                initial={{ opacity:0,y:16 }} animate={{ opacity:1,y:0 }}
                exit={{ opacity:0,y:-10 }} transition={{ duration:0.2 }}>

                {/* ═══ CANVAS ═══ */}
                {activeModule === "canvas" && (
                  <div>
                    <MH title="💡 Idea Canvas" sub="AI analysed your idea and filled each section. You can edit anytime." />
                    {isAdmin && (
                      <div className="glass-strip p-4 mb-5 flex flex-wrap items-center gap-3">
                        <AdminBadge />
                        <input value={aCanvas} onChange={e=>setACanvas(e.target.value)} placeholder="New block name" className="glass-input text-sm min-w-[180px]" />
                        <button className="glass-pill-primary text-xs" disabled={adminBusy} onClick={()=>adm(async()=>{ const d=await apiPost("/canvas",{action:"add",block:aCanvas.trim()}); setCfg(p=>({...p,canvas_blocks:d.canvas_blocks})); setACanvas(""); })}>Add Block</button>
                        <button className="glass-pill-secondary text-xs" disabled={adminBusy} onClick={()=>adm(async()=>{ const d=await apiPost("/canvas",{action:"remove"}); setCfg(p=>({...p,canvas_blocks:d.canvas_blocks,canvas_data:d.canvas_data})); })}>Remove Last</button>
                        <Err msg={adminErr} />
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {cfg.canvas_blocks.map((block, i) => (
                        <motion.div key={block} className="glass-strip p-5"
                          initial={{ opacity:0,scale:0.97 }} animate={{ opacity:1,scale:1 }} transition={{ delay:i*0.07 }}>
                          <div className="flex items-center justify-between mb-2">
                            {isAdmin ? (
                              <input value={block}
                                onChange={e=>{ const u=cfg.canvas_blocks.map((b,j)=>j===i?e.target.value:b); setCfg(p=>({...p,canvas_blocks:u})); }}
                                onBlur={()=>adm(async()=>{ await apiPost("/canvas",{action:"set",blocks:cfg.canvas_blocks}); })}
                                className="glass-input text-xs font-semibold flex-1 mr-2" />
                            ) : (
                              <p className="text-[10px] font-bold uppercase tracking-widest text-primary">{block}</p>
                            )}
                            <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full flex-shrink-0">AI ✓</span>
                          </div>
                          <textarea value={cfg.canvas_data[block] || ""}
                            onChange={e=>setCfg(p=>({...p,canvas_data:{...p.canvas_data,[block]:e.target.value}}))}
                            className="glass-input min-h-[90px] text-sm w-full resize-none"
                            placeholder={`Describe your ${block.toLowerCase()}…`} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ═══ COST PLANNER ═══ */}
                {activeModule === "cost" && (
                  <div>
                    <MH title="📊 Startup Cost Planner"
                      sub="AI estimated cost ranges for each category. Enter your own amounts to calculate total." />
                    {isAdmin && (
                      <div className="glass-strip p-4 mb-5 flex flex-wrap items-center gap-3">
                        <AdminBadge />
                        <input value={aCostLbl} onChange={e=>setACostLbl(e.target.value)} placeholder="Category name" className="glass-input text-sm min-w-[150px]" />
                        <input value={aCostMin} onChange={e=>setACostMin(e.target.value)} placeholder="Min ₹" type="number" className="glass-input text-sm w-24" />
                        <input value={aCostMax} onChange={e=>setACostMax(e.target.value)} placeholder="Max ₹" type="number" className="glass-input text-sm w-24" />
                        <button className="glass-pill-primary text-xs" disabled={adminBusy} onClick={()=>adm(async()=>{
                          const d=await apiPost("/cost",{action:"add",item:{label:aCostLbl.trim(),estimated_min:parseInt(aCostMin || "0",10),estimated_max:parseInt(aCostMax || "0",10)}});
                          setCfg(p=>({...p,cost_items:d.cost_items})); setACostLbl(""); setACostMin(""); setACostMax("");
                        })}>Add</button>
                        <Err msg={adminErr} />
                      </div>
                    )}

                    {/* Header row */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 mb-2 px-1">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Category</p>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center w-28">AI Estimate</p>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center w-28">Your Amount</p>
                      {isAdmin && <p className="w-6" />}
                    </div>

                    <div className="space-y-2">
                      {cfg.cost_items.map((item, idx) => {
                        const hasEstimate = item.estimated_min > 0 || item.estimated_max > 0;
                        return (
                          <motion.div key={idx}
                            className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center glass-strip px-4 py-3"
                            initial={{ opacity:0,x:-10 }} animate={{ opacity:1,x:0 }} transition={{ delay:idx*0.06 }}>

                            {/* Label */}
                            {isAdmin ? (
                              <input value={item.label}
                                onChange={e=>{ const u=cfg.cost_items.map((c,i)=>i===idx?{...c,label:e.target.value}:c); setCfg(p=>({...p,cost_items:u})); }}
                                onBlur={()=>adm(async()=>{ await apiPost("/cost",{action:"set",items:cfg.cost_items}); })}
                                className="glass-input text-sm" />
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                                <span className="text-sm">{item.label}</span>
                              </div>
                            )}

                            {/* AI Estimate range */}
                            <div className="w-28 text-center">
                              {hasEstimate ? (
                                <div>
                                  <p className="text-xs font-medium text-primary">
                                    ₹{item.estimated_min.toLocaleString("en-IN")}–{item.estimated_max.toLocaleString("en-IN")}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">AI estimate</p>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">–</p>
                              )}
                            </div>

                            {/* User input */}
                            <input type="number" min="0"
                              placeholder={hasEstimate ? `~₹${Math.round((item.estimated_min+item.estimated_max)/2).toLocaleString("en-IN")}` : "₹0"}
                              value={costValues[item.label] || ""}
                              onChange={e=>setCostValues(p=>({...p,[item.label]:e.target.value}))}
                              className="glass-input text-sm w-28 text-center" />

                            {/* Admin remove */}
                            {isAdmin && (
                              <button className="glass-pill-secondary text-[10px] px-2 w-6 h-6 flex items-center justify-center"
                                onClick={()=>adm(async()=>{ const u=cfg.cost_items.filter((_,i)=>i!==idx); const d=await apiPost("/cost",{action:"set",items:u}); setCfg(p=>({...p,cost_items:d.cost_items})); })}>✕</button>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Totals */}
                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="glass-strip p-4 text-center">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">AI Estimated Range</p>
                        <p className="text-lg font-bold text-primary">
                          ₹{totalEstMin.toLocaleString("en-IN")} – ₹{totalEstMax.toLocaleString("en-IN")}
                        </p>
                        <p className="text-[10px] text-muted-foreground">based on typical Indian startup costs</p>
                      </div>
                      <div className="glass-strip p-4 text-center">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Your Estimated Total</p>
                        <p className="text-lg font-bold">
                          {totalEntered > 0 ? `₹${totalEntered.toLocaleString("en-IN")}` : "Enter amounts above"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {totalEntered > 0 && totalEstMin > 0
                            ? (totalEntered < totalEstMin ? "✅ Below AI estimate" : totalEntered > totalEstMax ? "⚠️ Above AI estimate" : "✓ Within AI estimate range")
                            : "fill in your amounts"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ DECISION SIMULATOR ═══ */}
                {activeModule === "decision" && (
                  <DecisionModule cfg={cfg} setCfg={setCfg} isAdmin={isAdmin}
                    newQ={aDQ} setNewQ={setADQ} newA={aDA} setNewA={setADA} newB={aDB} setNewB={setADB}
                    adm={adm} adminBusy={adminBusy} adminErr={adminErr} />
                )}

                {/* ═══ RISK AWARENESS ═══ */}
                {activeModule === "risk" && (
                  <div>
                    <MH title="⚠️ Risk Awareness"
                      sub="AI identified these specific risks for your business. Click each to read the detail." />
                    {isAdmin && (
                      <div className="glass-strip p-4 mb-5 flex flex-wrap items-center gap-3">
                        <AdminBadge />
                        <input value={aRisk} onChange={e=>setARisk(e.target.value)} placeholder="Risk label" className="glass-input text-sm min-w-[200px]" />
                        <button className="glass-pill-primary text-xs" disabled={adminBusy} onClick={()=>adm(async()=>{
                          const d=await apiPost("/risk",{action:"add",label:aRisk.trim()});
                          setCfg(p=>({...p,risk_categories:d.risk_categories})); setARisk("");
                        })}>Add Risk</button>
                        <Err msg={adminErr} />
                      </div>
                    )}
                    <RiskCards risks={cfg.risk_categories} isAdmin={isAdmin}
                      onSave={(cats)=>adm(async()=>{ const d=await apiPost("/risk",{action:"set",categories:cats}); setCfg(p=>({...p,risk_categories:d.risk_categories})); })}
                      onRemove={(i)=>adm(async()=>{ const u=cfg.risk_categories.filter((_,j)=>j!==i); const d=await apiPost("/risk",{action:"set",categories:u}); setCfg(p=>({...p,risk_categories:d.risk_categories})); })}
                      setCfg={setCfg} cfg={cfg} />
                  </div>
                )}

                {/* ═══ FUNDING EXPLORER ═══ */}
                {activeModule === "funding" && (
                  <div>
                    <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
                      <div>
                        <MH title="💰 Funding Explorer" sub="AI + web search found these funding sources for your business." noMargin />
                      </div>
                      <button onClick={handleFundingSearch} disabled={fundingSearching}
                        className="glass-pill-primary flex items-center gap-2 text-xs px-4 flex-shrink-0">
                        {fundingSearching ? <><Spinner /> Searching web…</> : "🔍 Search Latest Funding"}
                      </button>
                    </div>
                    {fundingSearchErr && <p className="text-xs text-destructive mb-3">{fundingSearchErr}</p>}

                    {isAdmin && (
                      <div className="glass-strip p-4 mb-5 flex flex-wrap items-center gap-3">
                        <AdminBadge />
                        <input value={aFN} onChange={e=>setAFN(e.target.value)} placeholder="Source name"  className="glass-input text-sm min-w-[130px]" />
                        <input value={aFT} onChange={e=>setAFT(e.target.value)} placeholder="Type"         className="glass-input text-sm min-w-[110px]" />
                        <input value={aFA} onChange={e=>setAFA(e.target.value)} placeholder="Amount"       className="glass-input text-sm min-w-[110px]" />
                        <button className="glass-pill-primary text-xs" disabled={adminBusy} onClick={()=>adm(async()=>{
                          const d=await apiPost("/funding",{action:"add",source:{name:aFN.trim(),type:aFT.trim(),amount:aFA.trim()}});
                          setCfg(p=>({...p,funding_sources:d.funding_sources})); setAFN(""); setAFT(""); setAFA("");
                        })}>Add</button>
                        <Err msg={adminErr} />
                      </div>
                    )}

                    <div className="space-y-4">
                      {cfg.funding_sources.map((f, i) => (
                        <FundingCard key={i} f={f} i={i} isAdmin={isAdmin} cfg={cfg} setCfg={setCfg} adm={adm} />
                      ))}
                    </div>
                  </div>
                )}

                {/* ═══ PITCH ═══ */}
                {activeModule === "pitch" && (
                  <PitchModule cfg={cfg} setCfg={setCfg} isAdmin={isAdmin}
                    pitchText={pitchText} setPitchText={setPitchText}
                    pitchFeedback={pitchFeedback} pitchFbLoading={pitchFbLoading} pitchFbErr={pitchFbErr}
                    onFeedback={handlePitchFeedback}
                    recording={recording} timeLeft={timeLeft} onToggleRecord={toggleRecord}
                    newTip={aPTip} setNewTip={setAPTip}
                    adm={adm} adminBusy={adminBusy} adminErr={adminErr} />
                )}

                {/* Dynamic */}
                {!["canvas","cost","decision","risk","funding","pitch"].includes(activeModule) && (
                  <div className="text-center py-16">
                    <p className="text-5xl mb-4">🚀</p>
                    <h3 className="font-serif text-xl font-bold mb-2">{cfg.modules.find(m=>m.id===activeModule)?.label||activeModule}</h3>
                    <p className="text-muted-foreground text-sm">Admin-added module. Content coming soon.</p>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </div>

          {/* ══════════════ RIGHT SIDEBAR ══════════════ */}
          <div className="lg:w-80 space-y-5 lg:sticky lg:top-24 h-fit">

            {/* AI Mentor */}
            <div className="glass p-6">
              <h3 className="font-serif text-lg font-bold mb-1">🤖 AI Mentor</h3>
              <p className="text-[10px] text-primary mb-4">Knows your idea — tailored answers</p>
              {cfg.mentor_prompts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {cfg.mentor_prompts.map((p,i) => (
                    <button key={i} onClick={()=>handleMentorAsk(p)}
                      className="text-[10px] glass-strip px-2 py-1 hover:bg-primary/10 hover:border-primary/30 transition-colors text-left leading-snug">
                      {p}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2 mb-3">
                <input value={mentorQ} onChange={e=>setMentorQ(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleMentorAsk()}
                  placeholder="Ask anything…" className="glass-input text-sm flex-1" />
                <button onClick={()=>handleMentorAsk()} disabled={mentorLoading}
                  className="glass-pill-primary text-xs px-3 flex-shrink-0">
                  {mentorLoading ? <Spinner /> : "Ask"}
                </button>
              </div>
              {mentorErr && <p className="text-xs text-destructive mb-2">{mentorErr}</p>}
              {mentorAnswer && (
                <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                  className="glass-strip p-3 text-sm leading-relaxed">{mentorAnswer}</motion.div>
              )}
              {isAdmin && (
                <div className="glass-strip mt-4 p-3">
                  <div className="flex items-center gap-2 mb-3"><AdminBadge /><span className="text-[10px] uppercase tracking-widest text-muted-foreground">Prompt Controls</span></div>
                  <div className="flex flex-col gap-2 mb-2">
                    {cfg.mentor_prompts.map((pr,idx)=>(
                      <div key={idx} className="flex gap-1">
                        <input value={pr}
                          onChange={e=>{ const u=cfg.mentor_prompts.map((p,i)=>i===idx?e.target.value:p); setCfg(p=>({...p,mentor_prompts:u})); }}
                          onBlur={()=>adm(async()=>{ await apiPost("/mentor/prompts",{action:"set",prompts:cfg.mentor_prompts}); })}
                          className="glass-input text-xs flex-1" />
                        <button className="glass-pill-secondary text-[10px] px-2"
                          onClick={()=>adm(async()=>{ const u=cfg.mentor_prompts.filter((_,i)=>i!==idx); const d=await apiPost("/mentor/prompts",{action:"set",prompts:u}); setCfg(p=>({...p,mentor_prompts:d.mentor_prompts})); })}>✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={aMPr} onChange={e=>setAMPr(e.target.value)} placeholder="Add prompt" className="glass-input text-xs flex-1" />
                    <button className="glass-pill-primary text-xs" disabled={adminBusy} onClick={()=>adm(async()=>{
                      const d=await apiPost("/mentor/prompts",{action:"add",prompt:aMPr.trim()});
                      setCfg(p=>({...p,mentor_prompts:d.mentor_prompts})); setAMPr("");
                    })}>Add</button>
                  </div>
                </div>
              )}
            </div>

            {/* Roadmap */}
            <div className="glass-glow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-lg font-bold">Growth Roadmap</h3>
                <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">AI ✓</span>
              </div>
              <div className="space-y-3">
                {cfg.roadmap.map((step,i)=>(
                  <motion.div key={i} className="flex items-start gap-3"
                    initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} transition={{delay:i*0.08}}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${i===0?"bg-primary/40 border border-primary/60":"bg-glass border border-glass-border"}`}>{i+1}</div>
                    {isAdmin ? (
                      <input value={step}
                        onChange={e=>{ const u=cfg.roadmap.map((s,j)=>j===i?e.target.value:s); setCfg(p=>({...p,roadmap:u})); }}
                        onBlur={()=>adm(async()=>{ await apiPost("/roadmap",{action:"set",steps:cfg.roadmap}); })}
                        className="glass-input text-xs flex-1" />
                    ) : (
                      <p className={`text-sm leading-snug ${i===0?"font-semibold":"text-muted-foreground"}`}>{step}</p>
                    )}
                  </motion.div>
                ))}
              </div>
              {isAdmin && (
                <div className="mt-4 flex gap-2">
                  <input value={aRMap} onChange={e=>setARMap(e.target.value)} placeholder="Add step" className="glass-input text-xs flex-1" />
                  <button className="glass-pill-primary text-xs" disabled={adminBusy} onClick={()=>adm(async()=>{
                    const d=await apiPost("/roadmap",{action:"add",step:aRMap.trim()});
                    setCfg(p=>({...p,roadmap:d.roadmap})); setARMap("");
                  })}>Add</button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function MH({
  title,
  sub,
  noMargin = false,
}: {
  title: string;
  sub?: string;
  noMargin?: boolean;
}) {
  return (
    <div className={noMargin ? "" : "mb-6"}>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="font-serif text-xl font-bold">{title}</h3>
        <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">AI Generated</span>
      </div>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Decision ──────────────────────────────────────────────────────────────────
function DecisionModule({ cfg, setCfg, isAdmin, newQ, setNewQ, newA, setNewA, newB, setNewB, adm, adminBusy, adminErr }) {
  const [selected, setSelected] = useState({});
  const [expanded, setExpanded]  = useState({});

  return (
    <div>
      <MH title="🎯 Decision Simulator"
        sub="AI created real business decisions based on your idea. Choose what you'd do — and see what each means." />
      {isAdmin && (
        <div className="glass-strip p-4 mb-5 flex flex-wrap items-center gap-3">
          <span style={{fontSize:"10px",letterSpacing:"0.15em",textTransform:"uppercase",padding:"2px 10px",borderRadius:"999px",background:"rgba(180,60,60,0.15)",border:"1px solid rgba(180,60,60,0.3)",fontWeight:600}}>Admin</span>
          <input value={newQ} onChange={e=>setNewQ(e.target.value)} placeholder="Decision question" className="glass-input text-sm min-w-[200px]" />
          <input value={newA} onChange={e=>setNewA(e.target.value)} placeholder="Option A" className="glass-input text-sm min-w-[130px]" />
          <input value={newB} onChange={e=>setNewB(e.target.value)} placeholder="Option B" className="glass-input text-sm min-w-[130px]" />
          <button className="glass-pill-primary text-xs" disabled={adminBusy} onClick={()=>adm(async()=>{
            const d=await apiPost("/decision",{action:"add",card:{q:newQ.trim(),a:newA.trim(),b:newB.trim()}});
            setCfg(p=>({...p,decision_cards:d.decision_cards})); setNewQ(""); setNewA(""); setNewB("");
          })}>Add</button>
          {adminErr && <span style={{fontSize:"10px",color:"var(--color-destructive)"}}>{adminErr}</span>}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cfg.decision_cards.map((card, i) => (
          <motion.div key={i} className="glass-strip p-6"
            initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.09}}>
            {isAdmin ? (
              <>
                <input value={card.q} onChange={e=>{const u=cfg.decision_cards.map((c,j)=>j===i?{...c,q:e.target.value}:c);setCfg(p=>({...p,decision_cards:u}));}} onBlur={()=>adm(async()=>{await apiPost("/decision",{action:"set",cards:cfg.decision_cards});})} className="glass-input text-sm mb-2 w-full" placeholder="Question" />
                <input value={card.context||""} onChange={e=>{const u=cfg.decision_cards.map((c,j)=>j===i?{...c,context:e.target.value}:c);setCfg(p=>({...p,decision_cards:u}));}} onBlur={()=>adm(async()=>{await apiPost("/decision",{action:"set",cards:cfg.decision_cards});})} className="glass-input text-xs mb-3 w-full" placeholder="Context (why this decision matters)" />
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input value={card.a} onChange={e=>{const u=cfg.decision_cards.map((c,j)=>j===i?{...c,a:e.target.value}:c);setCfg(p=>({...p,decision_cards:u}));}} onBlur={()=>adm(async()=>{await apiPost("/decision",{action:"set",cards:cfg.decision_cards});})} className="glass-input text-xs text-center" placeholder="Option A" />
                  <input value={card.b} onChange={e=>{const u=cfg.decision_cards.map((c,j)=>j===i?{...c,b:e.target.value}:c);setCfg(p=>({...p,decision_cards:u}));}} onBlur={()=>adm(async()=>{await apiPost("/decision",{action:"set",cards:cfg.decision_cards});})} className="glass-input text-xs text-center" placeholder="Option B" />
                </div>
                <button className="glass-pill-secondary text-[10px] px-2" onClick={()=>adm(async()=>{const u=cfg.decision_cards.filter((_,j)=>j!==i);const d=await apiPost("/decision",{action:"set",cards:u});setCfg(p=>({...p,decision_cards:d.decision_cards}));})}>Remove</button>
              </>
            ) : (
              <>
                {/* Context banner */}
                {card.context && (
                  <div className="bg-primary/8 border border-primary/20 rounded-lg px-3 py-2 mb-3">
                    <p className="text-[10px] uppercase tracking-widest text-primary mb-0.5">Why this matters</p>
                    <p className="text-xs text-muted-foreground leading-snug">{card.context}</p>
                  </div>
                )}
                <p className="font-semibold text-sm mb-4 leading-snug">{card.q}</p>
                <div className="flex gap-2 mb-3">
                  {["a","b"].map(opt => (
                    <button key={opt} onClick={()=>setSelected(s=>({...s,[i]:opt}))}
                      className={`flex-1 text-xs py-2.5 px-3 rounded-lg border transition-all text-center font-medium
                        ${selected[i]===opt
                          ? "bg-primary/20 border-primary/50 text-foreground"
                          : "bg-glass border-glass-border text-muted-foreground hover:bg-primary/10 hover:border-primary/30"}`}>
                      {opt==="a" ? card.a : card.b}
                    </button>
                  ))}
                </div>
                {/* Show detail after choosing */}
                <AnimatePresence>
                  {selected[i] && (
                    <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                      className="glass-strip px-3 py-2 text-xs leading-snug overflow-hidden">
                      <span className="font-semibold text-primary">{selected[i]==="a"?"Option A":"Option B"}: </span>
                      <span className="text-muted-foreground">{selected[i]==="a" ? card.a_detail : card.b_detail}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Risk Cards ────────────────────────────────────────────────────────────────
function RiskCards({ risks, isAdmin, onSave, onRemove, setCfg, cfg }) {
  const [expanded, setExpanded] = useState(null);
  const riskIcons = ["📉","💸","🏆","📋","💻","⭐","🌊","🔥","⚡","🎯"];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {risks.map((risk, i) => {
        const label = typeof risk === "string" ? risk : risk.label;
        const desc  = typeof risk === "string" ? "" : risk.description;
        const isOpen = expanded === i;
        return (
          <motion.div key={i} className="glass-strip overflow-hidden"
            initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{delay:i*0.08}}>
            {isAdmin ? (
              <div className="flex items-center gap-2 p-4">
                <input value={label}
                  onChange={e=>{ const u=cfg.risk_categories.map((r,j)=>j===i?(typeof r==="string"?e.target.value:{...r,label:e.target.value}):r); setCfg(p=>({...p,risk_categories:u})); }}
                  onBlur={()=>onSave(cfg.risk_categories)}
                  className="glass-input text-sm flex-1" />
                <button className="glass-pill-secondary text-[10px] px-2" onClick={()=>onRemove(i)}>✕</button>
              </div>
            ) : (
              <>
                <button onClick={()=>setExpanded(isOpen?null:i)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-primary/5 transition-colors text-left">
                  <span className="text-xl flex-shrink-0">{riskIcons[i % riskIcons.length]}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{label}</p>
                    {!isOpen && desc && <p className="text-[10px] text-muted-foreground truncate">{desc}</p>}
                  </div>
                  <span className={`text-muted-foreground text-xs transition-transform ${isOpen?"rotate-180":"rotate-0"}`}>▼</span>
                </button>
                <AnimatePresence>
                  {isOpen && desc && (
                    <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}}
                      className="px-4 pb-4 overflow-hidden">
                      <p className="text-sm text-muted-foreground leading-relaxed border-t border-glass-border pt-3">{desc}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Funding Card ──────────────────────────────────────────────────────────────
function FundingCard({ f, i, isAdmin, cfg, setCfg, adm }) {
  const [expanded, setExpanded] = useState(false);
  const typeIcon = { Government:"🏛️", Private:"💼", Community:"🤝", Self:"🪙", Bank:"🏦" };

  if (isAdmin) return (
    <div className="glass-strip p-4">
      <div className="flex flex-wrap gap-2 mb-2">
        <input value={f.name}   onChange={e=>{const u=cfg.funding_sources.map((s,j)=>j===i?{...s,name:e.target.value}:s);setCfg(p=>({...p,funding_sources:u}));}} onBlur={()=>adm(async()=>{await apiPost("/funding",{action:"set",sources:cfg.funding_sources});})} className="glass-input text-sm min-w-[130px]" placeholder="Name" />
        <input value={f.type}   onChange={e=>{const u=cfg.funding_sources.map((s,j)=>j===i?{...s,type:e.target.value}:s);setCfg(p=>({...p,funding_sources:u}));}} onBlur={()=>adm(async()=>{await apiPost("/funding",{action:"set",sources:cfg.funding_sources});})} className="glass-input text-sm min-w-[100px]" placeholder="Type" />
        <input value={f.amount} onChange={e=>{const u=cfg.funding_sources.map((s,j)=>j===i?{...s,amount:e.target.value}:s);setCfg(p=>({...p,funding_sources:u}));}} onBlur={()=>adm(async()=>{await apiPost("/funding",{action:"set",sources:cfg.funding_sources});})} className="glass-input text-sm min-w-[100px]" placeholder="Amount" />
        <button className="glass-pill-secondary text-[10px] px-2" onClick={()=>adm(async()=>{const u=cfg.funding_sources.filter((_,j)=>j!==i);const d=await apiPost("/funding",{action:"set",sources:u});setCfg(p=>({...p,funding_sources:d.funding_sources}));})}>✕</button>
      </div>
      <input value={f.description||""} onChange={e=>{const u=cfg.funding_sources.map((s,j)=>j===i?{...s,description:e.target.value}:s);setCfg(p=>({...p,funding_sources:u}));}} onBlur={()=>adm(async()=>{await apiPost("/funding",{action:"set",sources:cfg.funding_sources});})} className="glass-input text-xs w-full mb-1" placeholder="Description" />
      <input value={f.url||""} onChange={e=>{const u=cfg.funding_sources.map((s,j)=>j===i?{...s,url:e.target.value}:s);setCfg(p=>({...p,funding_sources:u}));}} onBlur={()=>adm(async()=>{await apiPost("/funding",{action:"set",sources:cfg.funding_sources});})} className="glass-input text-xs w-full" placeholder="URL" />
    </div>
  );

  return (
    <motion.div initial={{opacity:0,x:-12}} animate={{opacity:1,x:0}} transition={{delay:i*0.1}}
      className="glass-strip overflow-hidden">
      <button onClick={()=>setExpanded(e=>!e)}
        className="w-full flex items-center gap-4 p-5 hover:bg-primary/5 transition-colors text-left">
        <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center text-2xl flex-shrink-0">
          {typeIcon[f.type] || "💰"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-semibold text-sm">{f.name}</p>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full flex-shrink-0">{f.type}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{f.description || "Funding option for your business"}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-primary">{f.amount}</p>
          <p className={`text-[10px] text-muted-foreground transition-transform ${expanded?"rotate-180":"rotate-0"}`}>▼</p>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}}
            className="overflow-hidden">
            <div className="px-5 pb-5 pt-1 border-t border-glass-border space-y-2">
              {f.how_to_apply && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">How to Apply</p>
                  <p className="text-sm">{f.how_to_apply}</p>
                </div>
              )}
              {f.eligibility && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Eligibility</p>
                  <p className="text-sm text-muted-foreground">{f.eligibility}</p>
                </div>
              )}
              {f.url && (
                <a href={f.url} target="_blank" rel="noopener noreferrer"
                  className="glass-pill-primary inline-flex items-center gap-1.5 text-xs mt-2"
                  onClick={e=>e.stopPropagation()}>
                  🔗 Visit Official Site
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Pitch Module ──────────────────────────────────────────────────────────────
function PitchModule({ cfg, setCfg, isAdmin, pitchText, setPitchText, pitchFeedback, pitchFbLoading, pitchFbErr, onFeedback, recording, timeLeft, onToggleRecord, newTip, setNewTip, adm, adminBusy, adminErr }) {
  const Spin = () => <span className="inline-block border-[2.5px] border-current border-t-transparent rounded-full animate-spin w-4 h-4" />;
  return (
    <div>
      <MH title="🎤 Pitch Practice" sub="AI wrote your pitch script. Record it, edit it, then get AI feedback on your delivery." />
      {isAdmin && (
        <div className="glass-strip p-4 mb-6">
          <div className="flex items-center gap-2 mb-3" style={{fontSize:"10px",letterSpacing:"0.15em",textTransform:"uppercase"}}>
            <span style={{padding:"2px 10px",borderRadius:"999px",background:"rgba(180,60,60,0.15)",border:"1px solid rgba(180,60,60,0.3)",fontWeight:600}}>Admin</span>
            <span className="text-muted-foreground">Pitch Config</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Duration (sec)</label>
              <input type="number" min="10" value={cfg.pitch.duration}
                onChange={e=>setCfg(p=>({...p,pitch:{...p.pitch,duration:parseInt(e.target.value||"60",10)}}))}
                onBlur={()=>adm(async()=>{await apiPost("/pitch",{duration:cfg.pitch.duration});})}
                className="glass-input text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">AI Feedback</label>
              <button className="glass-pill-secondary w-full justify-center"
                onClick={()=>adm(async()=>{const d=await apiPost("/pitch",{feedback_enabled:!cfg.pitch.feedback_enabled});setCfg(p=>({...p,pitch:d.pitch}));})}>
                {cfg.pitch.feedback_enabled ? "✅ Enabled" : "🚫 Disabled"}
              </button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Add Tip</label>
              <div className="flex gap-1">
                <input value={newTip} onChange={e=>setNewTip(e.target.value)} placeholder="New tip…" className="glass-input text-xs flex-1" />
                <button className="glass-pill-primary text-xs" onClick={()=>adm(async()=>{const d=await apiPost("/pitch",{tip_action:"add",tip:newTip.trim()});setCfg(p=>({...p,pitch:d.pitch}));setNewTip("");})}> + </button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {cfg.pitch.tips.map((tip,idx)=>(
              <div key={idx} className="flex items-center gap-1">
                <input value={tip} onChange={e=>{const u=cfg.pitch.tips.map((t,i)=>i===idx?e.target.value:t);setCfg(p=>({...p,pitch:{...p.pitch,tips:u}}));}} onBlur={()=>adm(async()=>{await apiPost("/pitch",{tip_action:"set",tips:cfg.pitch.tips});})} className="glass-input text-xs" />
                <button className="glass-pill-secondary text-[10px] px-1.5" onClick={()=>adm(async()=>{const u=cfg.pitch.tips.filter((_,i)=>i!==idx);const d=await apiPost("/pitch",{tip_action:"set",tips:u});setCfg(p=>({...p,pitch:d.pitch}));})}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {cfg.pitch.generated_script && (
        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
          className="glass-strip p-5 mb-6 border-l-2 border-primary/40">
          <p className="text-[10px] uppercase tracking-widest text-primary mb-2">✨ Your AI-Written Pitch Script</p>
          <p className="text-sm leading-relaxed text-muted-foreground italic">{cfg.pitch.generated_script}</p>
          <button className="glass-pill-secondary text-xs mt-3" onClick={()=>setPitchText(cfg.pitch.generated_script)}>
            Use This Script ↓
          </button>
        </motion.div>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-6 mb-6">
        <button onClick={onToggleRecord}
          className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all duration-300 flex-shrink-0
            ${recording?"bg-destructive/40 border-2 border-destructive/70 scale-110 animate-pulse shadow-lg":"bg-destructive/20 border border-destructive/40 hover:scale-105"}`}>
          🎙️
        </button>
        <div>
          <p className="font-semibold text-sm mb-1">{recording?`🔴 Recording… ${timeLeft}s`:"Tap to record your pitch"}</p>
          <p className="text-xs text-muted-foreground">{recording?"Speech auto-transcribes below (Chrome/Edge)":`Practice in ${cfg.pitch.duration} seconds`}</p>
        </div>
      </div>

      <div className="mb-4">
        <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-2">Your Pitch Text</label>
        <textarea value={pitchText} onChange={e=>setPitchText(e.target.value)} rows={5}
          placeholder="Speak your pitch or type it here. Edit before getting feedback…"
          className="glass-input w-full text-sm resize-none" />
      </div>

      {cfg.pitch.feedback_enabled && (
        <button onClick={onFeedback} disabled={pitchFbLoading}
          className="glass-pill-primary flex items-center gap-2 mb-5 px-6">
          {pitchFbLoading ? <><Spin /> Evaluating…</> : "🤖 Get AI Feedback"}
        </button>
      )}
      {pitchFbErr && <p className="text-xs text-destructive mb-3">{pitchFbErr}</p>}

      {pitchFeedback && (
        <motion.div initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} className="glass-strip p-6 space-y-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">📊 Scores</p>
            {["clarity","confidence","structure","persuasiveness"].map(k=>(
              <ScoreBar key={k} label={k.charAt(0).toUpperCase()+k.slice(1)} val={pitchFeedback.scores?.[k]||0} />
            ))}
          </div>
          {pitchFeedback.strengths?.length>0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">✅ Strengths</p>
              <ul className="space-y-1">{pitchFeedback.strengths.map((s,i)=><li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary mt-0.5 flex-shrink-0">→</span>{s}</li>)}</ul>
            </div>
          )}
          {pitchFeedback.improvements?.length>0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">📈 Improvements</p>
              <ul className="space-y-1">{pitchFeedback.improvements.map((s,i)=><li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-destructive mt-0.5 flex-shrink-0">→</span>{s}</li>)}</ul>
            </div>
          )}
          {pitchFeedback.suggestion && (
            <div className="glass-strip p-4 border-l-2 border-primary/40">
              <p className="text-[10px] uppercase tracking-widest text-primary mb-1">💡 Suggestion</p>
              <p className="text-sm leading-relaxed">{pitchFeedback.suggestion}</p>
            </div>
          )}
        </motion.div>
      )}

      {cfg.pitch.feedback_enabled && cfg.pitch.tips.length>0 && (
        <div className="mt-5 glass-strip p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Pitch Tips</p>
          <ul className="space-y-2">{cfg.pitch.tips.map((tip,i)=><li key={i} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-primary mt-0.5 flex-shrink-0">→</span>{tip}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
