import { motion } from "framer-motion";
import { Smartphone } from "lucide-react";

const DesktopBlocker = () => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass glass-glow rounded-3xl p-10 text-center max-w-sm mx-6"
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="mb-6"
        >
          <Smartphone className="w-16 h-16 mx-auto text-primary" />
        </motion.div>
        <h1 className="text-2xl font-bold text-foreground mb-3">
          Mobile Only
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          This app is designed exclusively for mobile devices. Please open it on your phone.
        </p>
      </motion.div>
    </div>
  );
};

export default DesktopBlocker;
