import { motion } from "framer-motion";

const FluidBackground = () => (
  <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
    <div className="absolute inset-0 bg-background" />

    {/* Large radial blobs */}
    {(
      [
        {
          w: 600,
          h: 600,
          pos: { top: "-10%", left: "-10%" },
          bg: "radial-gradient(circle, rgba(228,172,178,0.38) 0%, rgba(234,184,150,0.18) 55%, transparent 80%)",
          blur: 60,
          dur: 18,
          delay: 0,
        },
        {
          w: 500,
          h: 500,
          pos: { top: "30%", right: "-8%" },
          bg: "radial-gradient(circle, rgba(153,186,185,0.35) 0%, rgba(204,213,174,0.15) 55%, transparent 80%)",
          blur: 55,
          dur: 22,
          delay: 3,
        },
        {
          w: 480,
          h: 480,
          pos: { bottom: "-8%", left: "22%" },
          bg: "radial-gradient(circle, rgba(204,213,174,0.32) 0%, rgba(250,237,205,0.20) 55%, transparent 80%)",
          blur: 50,
          dur: 20,
          delay: 6,
        },
        {
          w: 320,
          h: 320,
          pos: { top: "5%", left: "45%" },
          bg: "radial-gradient(circle, rgba(234,184,150,0.28) 0%, transparent 70%)",
          blur: 40,
          dur: 15,
          delay: 2,
        },
      ] as const
    ).map((blob, index) => (
      <motion.div
        key={`blob-${index}`}
        className="absolute rounded-full"
        style={{
          width: blob.w,
          height: blob.h,
          ...blob.pos,
          background: blob.bg,
          filter: `blur(${blob.blur}px)`,
        }}
        animate={{
          x: [0, 30, -20, 0],
          y: [0, 25, -15, 0],
          scale: [1, 1.08, 0.95, 1],
        }}
        transition={{
          duration: blob.dur,
          repeat: Infinity,
          ease: "easeInOut",
          delay: blob.delay,
        }}
      />
    ))}

    {/* Small floating orbs */}
    {(
      [
        { size: 120, left: "14%", top: "22%", color: "rgba(228,172,178,0.22)", delay: 0 },
        { size: 80, left: "74%", top: "14%", color: "rgba(153,186,185,0.25)", delay: 2 },
        { size: 160, left: "84%", top: "58%", color: "rgba(204,213,174,0.20)", delay: 4 },
        { size: 60, left: "30%", top: "74%", color: "rgba(234,184,150,0.28)", delay: 1 },
        { size: 100, left: "55%", top: "85%", color: "rgba(228,172,178,0.18)", delay: 3 },
        { size: 45, left: "9%", top: "54%", color: "rgba(153,186,185,0.30)", delay: 5 },
      ] as const
    ).map((orb, index) => (
      <motion.div
        key={`orb-${index}`}
        className="absolute rounded-full"
        style={{
          width: orb.size,
          height: orb.size,
          left: orb.left,
          top: orb.top,
          background: orb.color,
          filter: "blur(20px)",
        }}
        animate={{
          y: [0, -20, 10, 0],
          x: [0, 10, -15, 0],
          scale: [1, 1.15, 0.9, 1],
          opacity: [0.6, 1, 0.7, 0.6],
        }}
        transition={{
          duration: 10 + index * 2,
          repeat: Infinity,
          ease: "easeInOut",
          delay: orb.delay,
        }}
      />
    ))}

    {/* Wavy SVG texture lines */}
    <svg
      className="absolute inset-0 h-full w-full opacity-[0.07]"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
    >
      <path
        d="M0,300 C200,200 400,400 600,300 S900,150 1100,300 S1300,450 1440,300"
        fill="none"
        stroke="rgba(228,172,178,1)"
        strokeWidth="2"
      />
      <path
        d="M0,550 C250,450 500,650 750,550 S1100,400 1440,550"
        fill="none"
        stroke="rgba(153,186,185,1)"
        strokeWidth="1.5"
      />
    </svg>
  </div>
);

export default FluidBackground;
