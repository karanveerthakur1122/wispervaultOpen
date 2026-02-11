import { cn } from "@/lib/utils";
import { motion, type HTMLMotionProps } from "framer-motion";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  glow?: boolean;
  children: React.ReactNode;
}

const GlassCard = ({ glow = false, className, children, ...props }: GlassCardProps) => {
  return (
    <motion.div
      className={cn(
        "glass rounded-2xl p-6",
        glow && "glass-glow",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default GlassCard;
