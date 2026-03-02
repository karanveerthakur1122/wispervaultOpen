import { motion } from "framer-motion";
import { WifiOff, RefreshCw, Shield, ChevronDown, ChevronUp, Smartphone, Monitor, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface Props {
  onRetry: () => void;
  isChecking: boolean;
}

const ConnectionBlockedOverlay = ({ onRetry, isChecking }: Props) => {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-background"
    >
      <div className="absolute top-1/4 -left-20 w-60 h-60 rounded-full bg-destructive/10 blur-[100px]" />
      <div className="absolute bottom-1/4 -right-20 w-60 h-60 rounded-full bg-primary/5 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, type: "spring" }}
        className="w-full max-w-sm space-y-6 relative"
      >
        {/* Icon */}
        <div className="text-center space-y-3">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-20 h-20 mx-auto rounded-3xl glass flex items-center justify-center border border-destructive/30"
          >
            <WifiOff className="w-10 h-10 text-destructive" />
          </motion.div>
          <h1 className="text-2xl font-bold text-foreground">Connection Blocked</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Our servers are unreachable from your network. This may be due to ISP-level DNS blocking in your region.
          </p>
        </div>

        {/* Quick Fix Banner */}
        <div className="glass rounded-2xl p-4 border border-primary/20 space-y-3">
          <div className="flex items-center gap-2 text-primary text-sm font-semibold">
            <Shield className="w-4 h-4" />
            Quick Fixes
          </div>

          <div className="space-y-2.5">
            <FixOption
              icon={<Globe className="w-4 h-4" />}
              title="Change DNS to 1.1.1.1"
              description="Fastest fix — bypasses ISP blocking"
            />
            <FixOption
              icon={<Shield className="w-4 h-4" />}
              title="Use a VPN"
              description="Connects via unblocked network"
            />
          </div>

          {/* Expandable steps */}
          <button
            onClick={() => setShowSteps(!showSteps)}
            className="flex items-center gap-1.5 text-xs text-primary/80 hover:text-primary transition-colors w-full"
          >
            {showSteps ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showSteps ? "Hide" : "Show"} DNS setup steps
          </button>

          {showSteps && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-3 pt-1"
            >
              <DNSSteps
                icon={<Smartphone className="w-3.5 h-3.5" />}
                platform="Android"
                steps={[
                  "Open Settings → Network & Internet",
                  "Tap Private DNS",
                  'Select "Private DNS provider hostname"',
                  "Enter: one.one.one.one",
                  "Tap Save",
                ]}
              />
              <DNSSteps
                icon={<Smartphone className="w-3.5 h-3.5" />}
                platform="iPhone / iPad"
                steps={[
                  "Open Settings → Wi-Fi",
                  "Tap ⓘ next to your network",
                  "Tap Configure DNS → Manual",
                  "Delete existing servers",
                  "Add: 1.1.1.1 and 1.0.0.1",
                  "Tap Save",
                ]}
              />
              <DNSSteps
                icon={<Monitor className="w-3.5 h-3.5" />}
                platform="Windows / Mac"
                steps={[
                  "Open Network Settings",
                  "Find DNS settings for your connection",
                  "Set DNS to 1.1.1.1 and 1.0.0.1",
                  "Save and restart browser",
                ]}
              />
            </motion.div>
          )}
        </div>

        {/* Retry Button */}
        <Button
          onClick={onRetry}
          disabled={isChecking}
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-semibold text-base gap-2"
        >
          <RefreshCw className={`w-5 h-5 ${isChecking ? "animate-spin" : ""}`} />
          {isChecking ? "Checking connection..." : "Retry Connection"}
        </Button>

        <p className="text-center text-xs text-muted-foreground/50">
          Change your DNS or enable a VPN, then tap retry
        </p>
      </motion.div>
    </motion.div>
  );
};

const FixOption = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <div className="flex items-start gap-3">
    <div className="mt-0.5 text-muted-foreground">{icon}</div>
    <div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  </div>
);

const DNSSteps = ({ icon, platform, steps }: { icon: React.ReactNode; platform: string; steps: string[] }) => (
  <div className="glass rounded-xl p-3 space-y-1.5">
    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
      {icon} {platform}
    </div>
    <ol className="space-y-0.5">
      {steps.map((step, i) => (
        <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5">
          <span className="text-primary/60 font-mono">{i + 1}.</span>
          {step}
        </li>
      ))}
    </ol>
  </div>
);

export default ConnectionBlockedOverlay;
