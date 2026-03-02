import { ConnectivityStatus } from "@/hooks/use-connectivity";
import { Wifi, WifiOff, Activity, Server, Clock } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  status: ConnectivityStatus;
  latency: number | null;
  serverRegion: string;
}

const ConnectionStatusDot = ({ status, latency, serverRegion }: Props) => {
  const [visible, setVisible] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-hide after 3s when connected
  useEffect(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    if (status === "connected") {
      setVisible(true); // briefly show on status change
      hideTimerRef.current = setTimeout(() => setVisible(false), 3000);
    } else {
      setVisible(true); // always visible when blocked
    }

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [status]);

  // Auto-close tooltip after 4s
  useEffect(() => {
    if (showTooltip) {
      tooltipTimerRef.current = setTimeout(() => setShowTooltip(false), 4000);
    }
    return () => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  }, [showTooltip]);

  const handleTap = () => {
    // Show dot again if hidden
    if (!visible) {
      setVisible(true);
      if (status === "connected") {
        hideTimerRef.current = setTimeout(() => {
          setVisible(false);
          setShowTooltip(false);
        }, 4000);
      }
    }
    setShowTooltip((prev) => !prev);
  };

  if (status === "checking") return null;

  const latencyColor =
    latency === null
      ? "text-muted-foreground"
      : latency < 200
        ? "text-primary"
        : latency < 500
          ? "text-yellow-500"
          : "text-destructive";

  return (
    <div className="fixed top-3 right-3 z-50">
      {/* Always-present tap target */}
      <button
        onClick={handleTap}
        className="relative flex items-center justify-center w-10 h-10 cursor-pointer active:scale-95 transition-transform"
        aria-label="Connection status"
      >
        <AnimatePresence>
          {visible && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-1.5 glass rounded-full px-2.5 py-1.5"
            >
              <div className="relative">
                <div
                  className={`w-2 h-2 rounded-full ${
                    status === "connected" ? "bg-primary" : "bg-destructive"
                  }`}
                />
                {status === "blocked" && (
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-destructive animate-ping opacity-40" />
                )}
              </div>
              {status === "blocked" ? (
                <WifiOff className="w-3 h-3 text-destructive" />
              ) : (
                <Wifi className="w-3 h-3 text-primary" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && visible && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 glass rounded-xl p-3 min-w-[180px] border border-border/50"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                {status === "connected" ? (
                  <Wifi className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-destructive" />
                )}
                {status === "connected" ? "Connected" : "Blocked"}
              </div>

              <div className="h-px bg-border/50" />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Activity className="w-3 h-3" />
                    Latency
                  </span>
                  <span className={`font-mono font-medium ${latencyColor}`}>
                    {latency !== null ? `${latency}ms` : "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Server className="w-3 h-3" />
                    Server
                  </span>
                  <span className="font-mono font-medium text-foreground">
                    {serverRegion}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    Check
                  </span>
                  <span className="font-mono font-medium text-muted-foreground">
                    Every 30s
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ConnectionStatusDot;
