import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { Landmark, Lightbulb, Mic, ShieldCheck, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";

/* ═══════════════════════════════════════════════════════════
   THEME COLOUR REFERENCE
   ─────────────────────────────────────────────────────────
   Background base        #FDF6EC   rgb(253 246 236)
   Rose pink (accent)     #E4ACB2   rgb(228 172 178)
   Dusty rose             #C17B7B   rgb(193 123 123)
   Peach tint             #EAB896   rgb(234 184 150)
   Sage green             #CCD5AE   rgb(204 213 174)
   Teal                   #99BAB9   rgb(153 186 185)
   Warm cream             #FAEDCD   rgb(250 237 205)
   Dark brown (text)      #2C1810   rgb(44  24  16)
   Mid brown (body text)  #6B4C3B   rgb(107 76  59)
   Muted brown            #8B6B5A   rgb(139 107 90)
   Deep rose              #8B4A52   rgb(139 74  82)
   Dark teal              #3D7472   rgb(61  116 114)
   Forest green           #4A6741   rgb(74  103 65)
   ══════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────
   Animation variant
───────────────────────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.7, ease: "easeOut" as const },
  }),
};

/* ─────────────────────────────────────────────────────────
   Fluid animated background
   Soft pastel blobs + wavy SVG lines on warm cream base
───────────────────────────────────────────────────────── */
const FluidBackground = () => (
  <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
    {/* Base — rgb(253 246 236) */}
    <div className="absolute inset-0" style={{ background: "#FDF6EC" }} />

    {/* Large radial blobs */}
    {(
      [
        {
          w: 600, h: 600,
          pos: { top: "-10%", left: "-10%" },
          bg: "radial-gradient(circle, rgba(228,172,178,0.38) 0%, rgba(234,184,150,0.18) 55%, transparent 80%)",
          blur: 60, dur: 18, delay: 0,
        },
        {
          w: 500, h: 500,
          pos: { top: "30%", right: "-8%" },
          bg: "radial-gradient(circle, rgba(153,186,185,0.35) 0%, rgba(204,213,174,0.15) 55%, transparent 80%)",
          blur: 55, dur: 22, delay: 3,
        },
        {
          w: 480, h: 480,
          pos: { bottom: "-8%", left: "22%" },
          bg: "radial-gradient(circle, rgba(204,213,174,0.32) 0%, rgba(250,237,205,0.20) 55%, transparent 80%)",
          blur: 50, dur: 20, delay: 6,
        },
        {
          w: 320, h: 320,
          pos: { top: "5%", left: "45%" },
          bg: "radial-gradient(circle, rgba(234,184,150,0.28) 0%, transparent 70%)",
          blur: 40, dur: 15, delay: 2,
        },
      ] as const
    ).map((b, i) => (
      <motion.div
        key={`blob-${i}`}
        className="absolute rounded-full"
        style={{
          width: b.w, height: b.h,
          ...b.pos,
          background: b.bg,
          filter: `blur(${b.blur}px)`,
        }}
        animate={{ x: [0, 30, -20, 0], y: [0, 25, -15, 0], scale: [1, 1.08, 0.95, 1] }}
        transition={{ duration: b.dur, repeat: Infinity, ease: "easeInOut", delay: b.delay }}
      />
    ))}

    {/* Small floating orbs */}
    {(
      [
        { size: 120, left: "14%", top: "22%", color: "rgba(228,172,178,0.22)", delay: 0 },
        { size: 80,  left: "74%", top: "14%", color: "rgba(153,186,185,0.25)", delay: 2 },
        { size: 160, left: "84%", top: "58%", color: "rgba(204,213,174,0.20)", delay: 4 },
        { size: 60,  left: "30%", top: "74%", color: "rgba(234,184,150,0.28)", delay: 1 },
        { size: 100, left: "55%", top: "85%", color: "rgba(228,172,178,0.18)", delay: 3 },
        { size: 45,  left: "9%",  top: "54%", color: "rgba(153,186,185,0.30)", delay: 5 },
      ] as const
    ).map((o, i) => (
      <motion.div
        key={`orb-${i}`}
        className="absolute rounded-full"
        style={{
          width: o.size, height: o.size,
          left: o.left, top: o.top,
          background: o.color,
          filter: "blur(20px)",
        }}
        animate={{
          y: [0, -20, 10, 0], x: [0, 10, -15, 0],
          scale: [1, 1.15, 0.9, 1], opacity: [0.6, 1, 0.7, 0.6],
        }}
        transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "easeInOut", delay: o.delay }}
      />
    ))}

    {/* Wavy SVG texture lines */}
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.07]"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
    >
      <motion.path
        d="M0,300 C200,200 400,400 600,300 S900,150 1100,300 S1300,450 1440,300"
        fill="none" stroke="rgba(228,172,178,1)" strokeWidth="2"
        animate={{
          d: [
            "M0,300 C200,200 400,400 600,300 S900,150 1100,300 S1300,450 1440,300",
            "M0,350 C200,250 400,350 600,250 S900,200 1100,350 S1300,400 1440,350",
            "M0,300 C200,200 400,400 600,300 S900,150 1100,300 S1300,450 1440,300",
          ],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.path
        d="M0,550 C250,450 500,650 750,550 S1100,400 1440,550"
        fill="none" stroke="rgba(153,186,185,1)" strokeWidth="1.5"
        animate={{
          d: [
            "M0,550 C250,450 500,650 750,550 S1100,400 1440,550",
            "M0,500 C250,600 500,500 750,600 S1100,500 1440,500",
            "M0,550 C250,450 500,650 750,550 S1100,400 1440,550",
          ],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
    </svg>
  </div>
);

/* ─────────────────────────────────────────────────────────
   Locked nav link — redirects to /login if not authenticated
───────────────────────────────────────────────────────── */
const LockedNavLink = ({
  to,
  children,
  className,
  style,
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}) => {
  const isLoggedIn = false; // ← swap with real auth context
  const navigate = useNavigate();
  return (
    <Link
      to={to}
      className={className}
      style={style}
      onClick={(e) => {
        if (!isLoggedIn) {
          e.preventDefault();
          navigate("/login");
        }
      }}
    >
      {children}
    </Link>
  );
};

/* ─────────────────────────────────────────────────────────
   Feature card data type
───────────────────────────────────────────────────────── */
type FeatureItem = {
  title: string;
  desc: string;
  Icon: React.ElementType;
  accentRgb: string; // space-separated  e.g. "228 172 178"
  tintRgb: string;
};

/* ─────────────────────────────────────────────────────────
   FeatureCard — new design
   • Icon box (top-left) + ghost number (top-right)
   • Title, animated accent divider, description
   • "Explore →" CTA revealed on hover
   • Pulsing dot bottom-right
───────────────────────────────────────────────────────── */
const FeatureCard = ({ item, i }: { item: FeatureItem; i: number }) => (
  <motion.div
    custom={i + 1}
    variants={fadeUp}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.2 }}
    whileHover={{ y: -6, transition: { duration: 0.28 } }}
    className="group relative overflow-hidden rounded-3xl p-7 md:p-8 cursor-pointer"
    style={
      {
        "--accent-rgb": item.accentRgb,
        "--tint-rgb": item.tintRgb,
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.72) 0%, rgb(var(--tint-rgb) / 0.18) 60%, rgb(var(--accent-rgb) / 0.12) 100%)",
        border: "1px solid rgb(var(--accent-rgb) / 0.24)",
        boxShadow:
          "0 4px 24px rgba(40,25,15,0.06), 0 1px 0 rgba(255,255,255,0.80) inset, 0 0 0 1px rgba(250,237,205,0.40) inset",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      } as CSSProperties
    }
  >
    {/* Hover radial glow from top */}
    <div
      className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, rgb(var(--accent-rgb) / 0.22) 0%, transparent 65%)",
      }}
    />

    {/* Decorative top-right fog blob */}
    <motion.div
      className="pointer-events-none absolute -top-8 -right-8 w-28 h-28 rounded-full"
      style={{ background: "rgb(var(--accent-rgb) / 0.14)", filter: "blur(18px)" }}
      animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.85, 0.5] }}
      transition={{ duration: 5 + i * 0.8, repeat: Infinity, ease: "easeInOut" }}
    />

    {/* ── Icon box + ghost number row ── */}
    <div className="relative mb-5 flex items-start justify-between">
      {/* Icon box */}
      <motion.div
        className="relative flex items-center justify-center rounded-2xl shrink-0"
        style={{
          width: 54,
          height: 54,
          background:
            "linear-gradient(135deg, rgb(var(--accent-rgb) / 0.34) 0%, rgb(var(--tint-rgb) / 0.28) 100%)",
          border: "1px solid rgb(var(--accent-rgb) / 0.32)",
          boxShadow: "0 8px 22px rgb(var(--accent-rgb) / 0.22)",
        }}
        animate={{ y: [0, -3.5, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
      >
        {/* Pulsing inner glow */}
        <motion.span
          className="absolute inset-0 rounded-2xl"
          style={{ background: "rgb(var(--accent-rgb) / 0.22)", filter: "blur(10px)" }}
          animate={{ opacity: [0.3, 0.65, 0.3], scale: [0.9, 1.1, 0.9] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 + i * 0.15 }}
        />
        <item.Icon
          className="relative"
          style={{ width: 23, height: 23, color: "#2C1810", opacity: 0.82 }}
          strokeWidth={1.8}
        />
      </motion.div>

      {/* Ghost ordinal number */}
      <span
        className="font-serif font-bold leading-none select-none"
        style={{
          fontSize: 48,
          lineHeight: 1,
          color: "rgb(var(--accent-rgb) / 0.20)",
          letterSpacing: "-0.02em",
        }}
      >
        0{i + 1}
      </span>
    </div>

    {/* Title */}
    <h3
      className="font-serif text-lg md:text-xl font-bold mb-3 leading-snug"
      style={{ color: "#2C1810" }}
    >
      {item.title}
    </h3>

    {/* Animated accent line */}
    <motion.div
      className="mb-4 h-[2px] w-10 rounded-full"
      style={{
        background:
          "linear-gradient(90deg, rgb(var(--accent-rgb) / 0.80), rgb(var(--accent-rgb) / 0))",
      }}
      initial={{ scaleX: 0, originX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.9, delay: 0.25 + i * 0.08, ease: "easeOut" }}
    />

    {/* Description */}
    <p className="text-sm md:text-[0.9375rem] leading-relaxed" style={{ color: "#6B4C3B" }}>
      {item.desc}
    </p>

    {/* Hover CTA */}
    <div
      className="mt-5 flex items-center gap-1.5 text-sm font-semibold
        opacity-0 translate-y-2
        group-hover:opacity-100 group-hover:translate-y-0
        transition-all duration-300"
      style={{
        color: "rgb(var(--accent-rgb))",
        filter: "saturate(1.5) brightness(0.68)",
      }}
    >
      Explore
      <motion.span
        animate={{ x: [0, 5, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      >
        →
      </motion.span>
    </div>

    {/* Pulse dot bottom-right */}
    <motion.div
      className="pointer-events-none absolute bottom-5 right-5 rounded-full"
      style={{ width: 8, height: 8, background: "rgb(var(--accent-rgb) / 0.55)" }}
      animate={{ scale: [1, 1.7, 1], opacity: [0.45, 1, 0.45] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
    />
  </motion.div>
);

/* ─────────────────────────────────────────────────────────
   Feature items data
───────────────────────────────────────────────────────── */
const featureItems: FeatureItem[] = [
  {
    title: "Digital Practice Lab",
    desc: "Learn through realistic, safe scenarios to recognize phishing, OTP traps, and UPI fraud patterns before they cost you.",
    Icon: ShieldCheck,
    accentRgb: "228 172 178",
    tintRgb: "234 184 150",
  },
  {
    title: "Government Support Companion",
    desc: "Navigate schemes with steps, eligibility hints, and scam-aware guidance to avoid misinformation.",
    Icon: Landmark,
    accentRgb: "204 213 174",
    tintRgb: "250 237 205",
  },
  {
    title: "Women's Support Network",
    desc: "A calm learning community to ask questions, share experiences, and grow confidence without judgment.",
    Icon: Users,
    accentRgb: "153 186 185",
    tintRgb: "204 213 174",
  },
  {
    title: "Entrepreneurship Studio",
    desc: "From idea to plan — use structured tools to build business confidence while staying alert to digital payment risks.",
    Icon: Lightbulb,
    accentRgb: "234 184 150",
    tintRgb: "250 237 205",
  },
  {
    title: "Voice Safety Companion",
    desc: "Get gentle, step-by-step support when something feels suspicious — what to do next, what to avoid, and safer alternatives.",
    Icon: Mic,
    accentRgb: "153 186 185",
    tintRgb: "228 172 178",
  },
];


const LandingPage = () => {
  const illustrationUrl =
    "https://static.vecteezy.com/system/resources/previews/020/664/503/original/abstract-poster-with-different-women-beautiful-females-together-force-hug-graphics-for-postcards-flyers-vector.jpg";
  const womanCenterUrl =
    "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&q=80&auto=format&fit=crop";

  return (
    <div className="relative min-h-screen overflow-hidden">

    
      <div className="relative z-50">
        <Navbar />
      </div>

    
      <section className="relative z-10 pt-28 md:pt-16 pb-16 md:pb-12 flex items-center px-6 md:px-12 lg:px-20">
        <div className="max-w-7xl mx-auto w-full flex flex-col lg:flex-row items-center gap-12 lg:gap-20">

       
          <motion.div className="flex-1 max-w-2xl mt-7" initial="hidden" animate="visible">
            <motion.div
              custom={0} variants={fadeUp}
              className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full mb-6 text-sm font-medium"
              style={{
                background: "rgba(228,172,178,0.20)",
                border: "1px solid rgba(228,172,178,0.40)",
                color: "#8B4A52",
              }}
            >
              <span className="w-2 h-2 rounded-full bg-[#E4ACB2] animate-pulse" />
              Women's Digital Safety Platform
            </motion.div>

            <motion.h1
              custom={1} variants={fadeUp}
              className="font-serif text-[7.5rem] md:text-[4.5rem] lg:text-[5.5rem] font-bold leading-[1.05] mb-6"
              style={{ color: "#2C1810" }}
            >
              Empowering Women Through{" "}
              <span style={{ color: "#C17B7B" }}>Digital Safety</span>
            </motion.h1>

            <motion.p
              custom={2} variants={fadeUp}
              className="text-lg md:text-xl mb-10 max-w-lg leading-relaxed"
              style={{ color: "#6B4C3B" }}
            >
              Learn digital literacy essentials, build financial safety habits, and
              grow your confidence with calm, guided practice.
            </motion.p>

            <motion.div custom={3} variants={fadeUp} className="flex flex-wrap gap-4">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full font-semibold text-base transition-all duration-300 hover:scale-105 hover:shadow-lg"
                style={{
                  background: "linear-gradient(135deg, #E4ACB2 0%, #C17B7B 100%)",
                  color: "#fff",
                  boxShadow: "0 8px 30px rgba(228,172,178,0.45)",
                }}
              >
                Create Account
              </Link>
              <LockedNavLink
                to="/dashboard"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full font-semibold text-base transition-all duration-300 hover:scale-105"
                style={{
                  background: "rgba(255,255,255,0.55)",
                  border: "1px solid rgba(228,172,178,0.35)",
                  color: "#2C1810",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                }}
              >
                Explore Dashboard
              </LockedNavLink>
            </motion.div>
          </motion.div>

          {/* — right illustration — */}
          <motion.div className="flex-1 w-full max-w-xl mx-auto" initial="hidden" animate="visible">
            <motion.div custom={4} variants={fadeUp} className="relative">
              <motion.div
                className="rounded-3xl overflow-hidden p-4 md:p-6 backdrop-blur-xl"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(250,237,205,0.30) 100%)",
                  border: "1px solid rgba(228,172,178,0.30)",
                  boxShadow:
                    "0 30px 80px rgba(40,25,15,0.10), 0 0 0 1px rgba(250,237,205,0.25)",
                }}
                animate={{ y: [0, -14, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="relative overflow-hidden rounded-2xl">
                  <img
                    src={illustrationUrl}
                    alt="Illustration of women supporting each other"
                    className="w-full h-[340px] md:h-[420px] object-cover"
                    loading="lazy" decoding="async" referrerPolicy="no-referrer"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#E4ACB2]/20 via-transparent to-[#99BAB9]/20" />
                </div>
              </motion.div>

              {/* Floating stat — left */}
              <motion.div
                className="absolute left-3 md:left-4 top-1/4 rounded-2xl px-4 py-3 backdrop-blur-xl"
                style={{
                  background: "rgba(255,255,255,0.70)",
                  border: "1px solid rgba(228,172,178,0.30)",
                  boxShadow: "0 8px 30px rgba(40,25,15,0.08)",
                }}
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              >
                <p className="text-xs font-medium" style={{ color: "#8B4A52" }}>Women Protected</p>
                <p className="text-xl font-bold" style={{ color: "#2C1810" }}>12,400+</p>
              </motion.div>

              {/* Floating stat — right */}
              <motion.div
                className="absolute right-3 md:right-4 bottom-1/4 rounded-2xl px-4 py-3 backdrop-blur-xl"
                style={{
                  background: "rgba(255,255,255,0.70)",
                  border: "1px solid rgba(153,186,185,0.35)",
                  boxShadow: "0 8px 30px rgba(40,25,15,0.08)",
                }}
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              >
                <p className="text-xs font-medium" style={{ color: "#3D7472" }}>Scenarios Completed</p>
                <p className="text-xl font-bold" style={{ color: "#2C1810" }}>58,000+</p>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          SECTION 2 — WHY THIS PLATFORM EXISTS
          Redesigned feature cards:
          • Icon (top-left) + ghost number (top-right)
          • Title → animated accent line → description
          • Hover: radial top-glow + "Explore →" CTA
          Layout: 3 cards (row 1) + 2 centered (row 2)
      ══════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 md:py-12 px-6 md:px-12 lg:px-20">
        {/* Subtle section wash */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, rgba(228,172,178,0.055) 40%, rgba(153,186,185,0.055) 100%)",
          }}
        />

        <div className="relative max-w-6xl mx-auto">
          {/* ── Heading ── */}
          <motion.div
            className="text-center mb-14"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.p
              custom={0} variants={fadeUp}
              className="text-sm font-semibold tracking-widest uppercase mb-3"
              style={{ color: "#C17B7B" }}
            >
              Our Purpose
            </motion.p>

            <motion.h2
              custom={1} variants={fadeUp}
              className="font-serif text-3xl md:text-5xl font-bold"
              style={{ color: "#2C1810" }}
            >
              Why This Platform Exists
            </motion.h2>

            {/* Gradient rule */}
            <motion.div
              custom={2} variants={fadeUp}
              className="mx-auto mt-4 h-[3px] w-20 rounded-full"
              style={{ background: "linear-gradient(90deg, #E4ACB2, #99BAB9)" }}
            />

            <motion.p
              custom={3} variants={fadeUp}
              className="mt-5 max-w-xl mx-auto text-base md:text-lg leading-relaxed"
              style={{ color: "#6B4C3B" }}
            >
              Five pillars designed to protect, empower, and connect women in the digital age.
            </motion.p>
          </motion.div>

          {/* ── Row 1 — 3 cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6 mb-5 md:mb-6">
            {featureItems.slice(0, 3).map((item, i) => (
              <FeatureCard key={item.title} item={item} i={i} />
            ))}
          </div>

          {/* ── Row 2 — 2 cards, centered ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6 lg:w-2/3 lg:mx-auto">
            {featureItems.slice(3).map((item, i) => (
              <FeatureCard key={item.title} item={item} i={i + 3} />
            ))}
          </div>
        </div>
      </section>

     
      <section className="relative z-10 py-24 md:py-12 px-6 md:px-12 lg:px-20 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(160deg, rgba(228,172,178,0.12) 0%, rgba(250,237,205,0.22) 40%, rgba(153,186,185,0.14) 100%)",
          }}
        />

       
        <motion.div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 520, height: 520,
            background:
              "radial-gradient(circle, rgba(228,172,178,0.22) 0%, rgba(234,184,150,0.10) 50%, transparent 75%)",
            filter: "blur(30px)",
          }}
          animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-10 lg:gap-0 items-center">

            {/* LEFT */}
            <motion.div
              className="flex flex-col justify-center lg:pr-12 xl:pr-20"
              initial="hidden" whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
            >
              <motion.div
                custom={0} variants={fadeUp}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 text-sm font-medium w-fit"
                style={{
                  background: "rgba(204,213,174,0.30)",
                  border: "1px solid rgba(204,213,174,0.50)",
                  color: "#4A6741",
                }}
              >
                <span className="w-2 h-2 rounded-full bg-[#CCD5AE] animate-pulse" />
                Built for Every Woman
              </motion.div>

              <motion.h2
                custom={1} variants={fadeUp}
                className="font-serif text-3xl md:text-3xl xl:text-4xl font-bold leading-[1.10] mb-6"
                style={{ color: "#2C1810" }}
              >
                Empowering Women to Navigate the{" "}
                <span
                  style={{
                    background: "linear-gradient(135deg, #C17B7B 0%, #99BAB9 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Digital World
                </span>{" "}
                with Confidence
              </motion.h2>

              <motion.p
                custom={2} variants={fadeUp}
                className="text-base md:text-lg leading-relaxed mb-8 max-w-md"
                style={{ color: "#6B4C3B" }}
              >
                Our platform helps women build digital awareness, protect their
                financial identity, and gain the confidence to thrive in today's
                connected world through practical learning and supportive guidance.
              </motion.p>

              <motion.div custom={3} variants={fadeUp}>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-3 px-8 py-4 rounded-full font-semibold text-base transition-all duration-300 hover:scale-105 w-fit"
                  style={{
                    background: "linear-gradient(135deg, #C17B7B 0%, #E4ACB2 100%)",
                    color: "#fff",
                    boxShadow: "0 10px 35px rgba(193,123,123,0.40)",
                  }}
                >
                  Start Your Journey
                  <motion.span
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    →
                  </motion.span>
                </Link>
              </motion.div>

              <motion.div custom={4} variants={fadeUp} className="mt-10 flex gap-8">
                {[
                  { n: "50K+", label: "Women Empowered" },
                  { n: "98%",  label: "Feel Safer Online" },
                  { n: "4.9★", label: "Community Rating" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-xl font-bold font-serif" style={{ color: "#2C1810" }}>{s.n}</p>
                    <p className="text-xs" style={{ color: "#8B6B5A" }}>{s.label}</p>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* CENTER — woman image */}
            <motion.div
              className="flex justify-center items-center relative"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            >
              {/* Rotating conic ring */}
              <motion.div
                className="absolute rounded-full"
                style={{
                  inset: 0,
                  background:
                    "conic-gradient(from 0deg, rgba(228,172,178,0.35), rgba(153,186,185,0.35), rgba(204,213,174,0.35), rgba(234,184,150,0.35), rgba(228,172,178,0.35))",
                  filter: "blur(20px)",
                  transform: "scale(1.12)",
                }}
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              />

              {/* Blob-shaped image frame */}
              <motion.div
                className="relative overflow-hidden"
                style={{
                  width: 340, height: 460,
                  borderRadius: "55% 55% 50% 50% / 60% 60% 40% 40%",
                  border: "3px solid rgba(228,172,178,0.40)",
                  boxShadow:
                    "0 30px 80px rgba(40,25,15,0.15), 0 0 0 8px rgba(250,237,205,0.35), 0 0 0 16px rgba(228,172,178,0.12)",
                }}
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
              >
                <img
                  src={womanCenterUrl}
                  alt="Confident woman"
                  className="w-full h-full object-cover object-top"
                  loading="lazy" decoding="async"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, transparent 50%, rgba(228,172,178,0.25) 100%)",
                  }}
                />
              </motion.div>

              {/* Floating accent dots */}
              {(
                [
                  { top: "10%",  left: "-8%",  size: 12, color: "#E4ACB2" },
                  { top: "30%",  right: "-10%", size: 8,  color: "#99BAB9" },
                  { bottom: "20%", left: "-6%",  size: 10, color: "#CCD5AE" },
                  { bottom: "8%",  right: "-8%",  size: 14, color: "#EAB896" },
                ] as const
              ).map((dot, i) => (
                <motion.div
                  key={`dot-${i}`}
                  className="absolute rounded-full"
                  style={{
                    width: dot.size, height: dot.size,
                    background: dot.color,
                    ...dot,
                    boxShadow: `0 0 12px ${dot.color}`,
                  }}
                  animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 3 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
                />
              ))}
            </motion.div>

            {/* RIGHT — quote */}
            <motion.div
              className="flex flex-col justify-center lg:pl-12 xl:pl-20"
              initial="hidden" whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
            >
              <motion.div custom={0} variants={fadeUp} className="relative">
                {/* Giant decorative quote mark */}
                <motion.span
                  className="absolute -top-8 -left-4 font-serif leading-none select-none"
                  style={{ fontSize: 120, color: "rgba(228,172,178,0.25)", lineHeight: 1 }}
                  animate={{ opacity: [0.25, 0.45, 0.25] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  "
                </motion.span>

                <div
                  className="relative rounded-3xl p-8 md:p-10 backdrop-blur-xl"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(250,237,205,0.30) 60%, rgba(153,186,185,0.15) 100%)",
                    border: "1px solid rgba(228,172,178,0.28)",
                    boxShadow:
                      "0 20px 60px rgba(40,25,15,0.08), inset 0 0 0 1px rgba(250,237,205,0.20)",
                  }}
                >
                  <motion.p
                    className="font-serif text-xl md:text-2xl xl:text-3xl font-bold leading-[1.35]"
                    style={{ color: "#2C1810" }}
                    animate={{ opacity: [0.85, 1, 0.85] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    When women are empowered with knowledge and confidence, they
                    don't just stay safe —{" "}
                    <span style={{ color: "#C17B7B" }}>
                      they inspire change and shape the future.
                    </span>
                  </motion.p>

                  <motion.div
                    className="mt-6 h-0.5 rounded-full"
                    style={{ background: "linear-gradient(90deg, #E4ACB2, #99BAB9, #CCD5AE)" }}
                    initial={{ scaleX: 0, originX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, delay: 0.5, ease: "easeOut" }}
                  />

                  <div className="mt-5 flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                      style={{ background: "linear-gradient(135deg, #E4ACB2, #C17B7B)" }}
                    >
                      S
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "#2C1810" }}>Saheli Platform</p>
                      <p className="text-xs" style={{ color: "#8B6B5A" }}>Our Core Mission</p>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Mini supporting cards */}
              <motion.div custom={1} variants={fadeUp} className="mt-6 grid grid-cols-2 gap-4">
                {[
                  { icon: "🛡️", label: "Safe Learning", desc: "Judge-free zone" },
                  { icon: "💡", label: "Real Skills",   desc: "Practical tools" },
                ].map((card) => (
                  <motion.div
                    key={card.label}
                    className="rounded-2xl p-4 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1"
                    style={{
                      background: "rgba(255,255,255,0.45)",
                      border: "1px solid rgba(228,172,178,0.22)",
                      boxShadow: "0 8px 25px rgba(40,25,15,0.06)",
                    }}
                    whileHover={{ boxShadow: "0 12px 35px rgba(40,25,15,0.10)" }}
                  >
                    <span className="text-2xl">{card.icon}</span>
                    <p className="font-semibold text-sm mt-1" style={{ color: "#2C1810" }}>{card.label}</p>
                    <p className="text-xs" style={{ color: "#8B6B5A" }}>{card.desc}</p>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          SECTION 4 — CTA
      ══════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 md:py-12 px-6 md:px-12 lg:px-20 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(250,237,205,0.22)_0%,rgba(234,184,150,0.10)_55%,rgba(153,186,185,0.10)_100%)]" />
          <div className="absolute -top-28 -right-24 h-80 w-80 rounded-full bg-[#E4ACB2]/[0.18] blur-3xl" />
          <div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-[#99BAB9]/[0.18] blur-3xl" />
        </div>

        <motion.div
          initial="hidden" whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          className="relative max-w-7xl mx-auto"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 lg:gap-24 items-center">

            <motion.div custom={0} variants={fadeUp} className="max-w-xl">
              <h2
                className="font-serif text-3xl md:text-5xl font-bold leading-[1.08] mb-4"
                style={{ color: "#2C1810" }}
              >
                Your Safety Journey Starts Here
              </h2>
              <p className="text-base md:text-lg leading-relaxed max-w-lg mb-8" style={{ color: "#6B4C3B" }}>
                A calm place to learn digital literacy, protect your money, and
                build confidence step by step.
              </p>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-base transition-all duration-300 hover:scale-105"
                style={{
                  background: "linear-gradient(135deg, #E4ACB2 0%, #C17B7B 100%)",
                  color: "#fff",
                  boxShadow: "0 10px 35px rgba(228,172,178,0.45)",
                }}
              >
                Create Account →
              </Link>
            </motion.div>

            <motion.div
              custom={1} variants={fadeUp}
              className="flex flex-col items-center md:items-end justify-center"
            >
              <motion.div
                className="w-full max-w-md rounded-3xl border p-4 md:p-5 backdrop-blur-xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(250,237,205,0.18) 0%, rgba(204,213,174,0.08) 60%, rgba(153,186,185,0.08) 100%)",
                  borderColor: "rgba(153,186,185,0.26)",
                  boxShadow:
                    "0 16px 60px rgba(40,25,15,0.08), inset 0 0 0 1px rgba(250,237,205,0.14)",
                }}
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="relative overflow-hidden rounded-2xl">
                  <img
                    src={illustrationUrl}
                    alt="Women hugging illustration"
                    className="w-full h-[220px] md:h-[260px] object-cover"
                    loading="lazy" decoding="async" referrerPolicy="no-referrer"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#E4ACB2]/20 via-transparent to-[#99BAB9]/20" />
                </div>
              </motion.div>

              <div
                className="mt-5 w-full max-w-md rounded-2xl border px-6 py-4 backdrop-blur-xl text-center"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(250,237,205,0.22) 0%, rgba(228,172,178,0.08) 55%, rgba(153,186,185,0.08) 100%)",
                  borderColor: "rgba(250,237,205,0.55)",
                  boxShadow:
                    "0 14px 55px rgba(40,25,15,0.08), inset 0 0 0 1px rgba(250,237,205,0.14)",
                }}
              >
                <p
                  className="font-serif text-lg md:text-xl font-bold leading-relaxed"
                  style={{ color: "rgba(44,24,16,0.85)" }}
                >
                  "When women support each other, incredible things happen."
                </p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 pb-10 px-12 text-center">
        <p className="text-sm" style={{ color: "#cbc0ba",marginTop: "30px" }}>
          Built with care for women's digital empowerment
        </p>
      </footer>
    </div>
  );
};

export default LandingPage;
