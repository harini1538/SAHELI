import { motion } from "framer-motion";

const FloatingShapes = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
    <motion.div
      className="floating-shape w-96 h-96 top-20 -right-20"
      style={{ background: "hsl(354 46% 78% / 0.15)" }}
      animate={{ y: [0, -30, 0], x: [0, 15, 0] }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
    />
    <motion.div
      className="floating-shape w-72 h-72 top-1/3 -left-10"
      style={{ background: "hsl(74 30% 76% / 0.15)" }}
      animate={{ y: [0, 20, 0], x: [0, -10, 0] }}
      transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
    />
    <motion.div
      className="floating-shape w-80 h-80 bottom-20 right-1/4"
      style={{ background: "hsl(178 18% 66% / 0.12)" }}
      animate={{ y: [0, -25, 0] }}
      transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
    />
    <motion.div
      className="floating-shape w-64 h-64 bottom-1/3 left-1/4"
      style={{ background: "hsl(18 55% 79% / 0.12)" }}
      animate={{ y: [0, 15, 0], rotate: [0, 5, 0] }}
      transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
    />
  </div>
);

export default FloatingShapes;
