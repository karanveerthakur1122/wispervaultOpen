import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const PwaInstallBanner = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed this session or already installed
    if (sessionStorage.getItem("pwa_banner_dismissed") === "1") {
      setDismissed(true);
      return;
    }
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
    handleDismiss();
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("pwa_banner_dismissed", "1");
  };

  return (
    <AnimatePresence>
      {deferredPrompt && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 60 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-6 left-4 right-4 z-50"
        >
          <div className="glass rounded-2xl p-4 border border-border/50 shadow-lg shadow-primary/5">
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                <Download className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Install Phantom</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Add to home screen for instant access & offline support
                </p>
              </div>
            </div>

            <Button
              onClick={handleInstall}
              className="w-full h-11 mt-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm gap-2"
            >
              <Download className="w-4 h-4" />
              Install App
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PwaInstallBanner;
