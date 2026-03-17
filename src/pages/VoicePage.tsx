import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Message {
  role: "user" | "ai";
  text: string;
  audioUrl?: string | null;
}

// ── Web Speech API type shim ───────────────────────────────────────────────────
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

// ── Language options ───────────────────────────────────────────────────────────
const LANGUAGES = [
  { label: "English", value: "en", bcp: "en-IN" },
  { label: "हिंदी",   value: "hi", bcp: "hi-IN" },
  { label: "தமிழ்",  value: "ta", bcp: "ta-IN" },
  { label: "తెలుగు", value: "te", bcp: "te-IN" },
];

const QUICK_DRILLS = [
  "Someone called saying my bank account will be blocked and asked for my OTP.",
  "I got an SMS saying I won ₹50,000. They want my Aadhaar details.",
  "A WhatsApp message claims to be from my bank asking me to click a link.",
  "An email says my KYC is pending and I need to share my card number.",
];

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

// ── Pure-CSS bouncing dots ─────────────────────────────────────────────────────
// Using <span> elements + injected <style> — NO framer-motion here.
// framer-motion's animate prop on <span> inside certain contexts tries to
// animate SVG `d` attributes, which throws "Expected moveto path command".
const dotStyle: React.CSSProperties = {
  width: 6, height: 6, borderRadius: "50%",
  background: "currentColor", display: "inline-block",
};

const LoadingDots = () => (
  <>
    <style>{`
      @keyframes saheliBounce {
        0%, 80%, 100% { transform: translateY(0);   opacity: 0.35; }
        40%            { transform: translateY(-5px); opacity: 1;    }
      }
      .sd { animation: saheliBounce 1s ease-in-out infinite; }
      .sd:nth-child(2) { animation-delay: .15s; }
      .sd:nth-child(3) { animation-delay: .30s; }
    `}</style>
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <span className="sd" style={dotStyle} />
      <span className="sd" style={dotStyle} />
      <span className="sd" style={dotStyle} />
    </span>
  </>
);

// ── Component ─────────────────────────────────────────────────────────────────
const VoicePage = () => {
  const [input, setInput]             = useState("");
  const [messages, setMessages]       = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [language, setLanguage]       = useState(LANGUAGES[0]);
  const [error, setError]             = useState<string | null>(null);

  const chatEndRef     = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef       = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ── Send to backend ──────────────────────────────────────────────────────────
  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setMessages(prev => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/voice-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, language: language.value }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      const data: { text: string; audioUrl: string | null } = await res.json();

      const resolvedAudioUrl = data.audioUrl?.startsWith("/")
        ? `${API_BASE}${data.audioUrl}`
        : data.audioUrl;

      setMessages(prev => [...prev, {
        role: "ai",
        text: data.text,
        audioUrl: resolvedAudioUrl,
      }]);

      if (resolvedAudioUrl) {
        audioRef.current?.pause();
        const audio = new Audio(resolvedAudioUrl);
        audioRef.current = audio;
        audio.play().catch(() => {});
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Speech recognition ────────────────────────────────────────────────────────
  const toggleRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition not supported. Please use Chrome.");
      return;
    }
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const r = new SR();
    r.lang = language.bcp;
    r.interimResults = false;
    r.continuous     = false;
    r.onresult = (e: SpeechRecognitionEvent) => {
      setInput(e.results[0][0].transcript);
      setIsRecording(false);
    };
    r.onerror = () => {
      setError("Microphone error. Check browser permissions.");
      setIsRecording(false);
    };
    r.onend = () => setIsRecording(false);
    recognitionRef.current = r;
    r.start();
    setIsRecording(true);
  };

  return (
    <div className="relative min-h-screen">
      <Navbar />
      <div className="relative z-10 pt-24 section-spacing max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* ── Chat panel ──────────────────────────────────────────────────── */}
          <div className="flex-1">
            <h1 className="font-serif text-3xl md:text-4xl font-bold mb-2">
              Digital Safety Companion
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              Powered by Groq · Llama 3 · Speak or type in your language
            </p>

            {/* Messages */}
            <div className="glass-glow p-6 min-h-[400px] max-h-[500px] overflow-y-auto mb-4 space-y-4">
              <AnimatePresence initial={false}>
                {messages.length === 0 && !isLoading && (
                  <motion.p
                    key="empty"
                    className="text-center text-muted-foreground py-20"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    Speak or type your concern. We're here to help. 💛
                  </motion.p>
                )}

                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    className={`max-w-[82%] ${msg.role === "user" ? "ml-auto" : ""}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className={`glass-strip ${
                      msg.role === "ai"
                        ? "bg-highlight/10 border-highlight/20"
                        : "bg-primary/10 border-primary/20"
                    }`}>
                      <p className="text-sm whitespace-pre-line">{msg.text}</p>
                      {msg.audioUrl && (
                        <button
                          onClick={() => new Audio(msg.audioUrl!).play()}
                          className="mt-2 text-xs opacity-60 hover:opacity-100 transition-opacity"
                        >
                          🔊 Replay
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}

                {/* Loading — plain HTML, no framer animate on inner spans */}
                {isLoading && (
                  <motion.div
                    key="loading"
                    className="max-w-[82%]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="glass-strip bg-highlight/10 border-highlight/20">
                      <div className="flex items-center gap-2 text-highlight/70">
                        <span className="text-xs text-muted-foreground">
                          Saheli is thinking
                        </span>
                        <LoadingDots />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={chatEndRef} />
            </div>

            {/* Error */}
            {error && (
              <motion.div
                className="mb-3 px-4 py-2 rounded-lg bg-destructive/20 border border-destructive/30 text-sm text-destructive"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                ⚠️ {error}
                <button onClick={() => setError(null)} className="ml-2 underline text-xs opacity-70">
                  Dismiss
                </button>
              </motion.div>
            )}

            {/* Input row */}
            <div className="flex gap-3 items-center">
              <button
                onClick={toggleRecording}
                disabled={isLoading}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all border backdrop-blur-md
                  ${isRecording
                    ? "bg-destructive/30 border-destructive/50 animate-pulse scale-110"
                    : "bg-primary/20 border-primary/30 hover:bg-primary/30"
                  } disabled:opacity-40`}
              >
                🎙️
              </button>

              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage(input)}
                placeholder={isRecording ? "Listening…" : "Type your concern…"}
                disabled={isLoading || isRecording}
                className="glass-input flex-1 disabled:opacity-50"
              />

              <button
                onClick={() => sendMessage(input)}
                disabled={isLoading || !input.trim()}
                className="glass-pill-primary disabled:opacity-40"
              >
                {isLoading ? "…" : "Send"}
              </button>
            </div>

            {/* Language */}
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Language:</span>
              <select
                value={language.value}
                onChange={e => {
                  const found = LANGUAGES.find(l => l.value === e.target.value);
                  if (found) setLanguage(found);
                }}
                className="glass-input w-36 text-sm"
              >
                {LANGUAGES.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Sidebar ─────────────────────────────────────────────────────── */}
          <div className="lg:w-80 space-y-6">
            <div className="glass p-6 sticky top-24">
              <h3 className="font-serif text-lg font-bold mb-4">🛡️ Stay Safe Guide</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                {[
                  "Never share your OTP with anyone",
                  "Banks never call asking for passwords",
                  "Verify caller identity independently",
                  "Screenshot suspicious messages",
                  "Use official apps, not random links",
                ].map((tip, i) => (
                  <p key={i} className="flex gap-2">
                    <span className="text-highlight">•</span> {tip}
                  </p>
                ))}
              </div>
            </div>

            <div className="glass-glow p-6">
              <h4 className="font-semibold text-sm mb-1">🎯 Quick Practice Drills</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Tap a scenario to test your response
              </p>
              <div className="space-y-2">
                {QUICK_DRILLS.map((drill, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(drill)}
                    disabled={isLoading}
                    className="w-full text-left text-xs glass-strip hover:bg-highlight/10 transition-colors p-2 rounded-lg disabled:opacity-40"
                  >
                    {drill}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass p-6 text-center">
              <p className="text-3xl mb-2">💪</p>
              <p className="text-sm font-medium">You're doing great!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Every question makes you safer online
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default VoicePage;