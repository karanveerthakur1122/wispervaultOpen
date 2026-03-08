import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, BellOff, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DISMISS_KEY = "notif_banner_dismissed";
const DISMISS_UNTIL_KEY = "notif_banner_remind_after";

/** How many messages before showing a soft reminder after dismissal */
const REMINDER_DELAY_MS = 30 * 60 * 1000; // 30 minutes

const NotificationPermissionBanner = () => {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() =>
    "Notification" in window ? Notification.permission : "unsupported"
  );
  const [dismissed, setDismissed] = useState(false);
  const [requesting, setRequesting] = useState(false);

  // Sync permission state
  useEffect(() => {
    if (!("Notification" in window)) return;
    const iv = setInterval(() => {
      const current = Notification.permission;
      setPerm(current);
      // If granted, clear any dismiss state
      if (current === "granted") {
        sessionStorage.removeItem(DISMISS_KEY);
        localStorage.removeItem(DISMISS_UNTIL_KEY);
      }
    }, 1500);
    return () => clearInterval(iv);
  }, []);

  // Check if banner was dismissed
  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) === "1") {
      // Check if reminder period has passed
      const remindAfter = localStorage.getItem(DISMISS_UNTIL_KEY);
      if (remindAfter && Date.now() < parseInt(remindAfter, 10)) {
        setDismissed(true);
      } else {
        // Reminder period passed, show again
        sessionStorage.removeItem(DISMISS_KEY);
        localStorage.removeItem(DISMISS_UNTIL_KEY);
      }
    }
  }, []);

  const handleEnable = useCallback(async () => {
    if (!("Notification" in window)) return;
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setPerm(result);
      if (result === "granted") {
        toast.success("Notifications enabled!", { duration: 2000 });
        setDismissed(false);
      } else if (result === "denied") {
        // Permission permanently denied — show instructions
        toast("Notifications blocked by browser", {
          description: "Tap your browser's lock icon (🔒) → Site settings → Allow notifications, then reload.",
          duration: 8000,
        });
      }
    } finally {
      setRequesting(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, "1");
    // Set a reminder to show again after delay
    localStorage.setItem(DISMISS_UNTIL_KEY, String(Date.now() + REMINDER_DELAY_MS));
  }, []);

  // Don't show if: granted, unsupported, or dismissed
  if (perm === "granted" || perm === "unsupported" || dismissed) return null;

  const isDenied = perm === "denied";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="overflow-hidden"
      >
        <div className="mx-3 mt-2 mb-1 rounded-2xl border border-border/50 bg-card/80 backdrop-blur-md p-3.5 shadow-lg shadow-primary/5">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isDenied ? "bg-destructive/10 border border-destructive/20" : "bg-primary/10 border border-primary/20"
            }`}>
              {isDenied ? (
                <BellOff className="w-5 h-5 text-destructive" />
              ) : (
                <Bell className="w-5 h-5 text-primary" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {isDenied ? "Notifications are blocked" : "Enable Notifications"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {isDenied
                  ? "To receive message alerts, allow notifications in your browser settings."
                  : "Get notified when new messages arrive, even when the app is in the background."}
              </p>

              {/* Action button */}
              <div className="mt-2.5 flex items-center gap-2">
                {isDenied ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-xl text-xs gap-1.5 border-border/50"
                    onClick={() => {
                      toast("How to enable notifications", {
                        description: "1. Tap the lock icon (🔒) in your browser's address bar\n2. Find 'Notifications' in Site settings\n3. Change to 'Allow'\n4. Reload the page",
                        duration: 12000,
                      });
                    }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open Instructions
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 rounded-xl text-xs bg-primary text-primary-foreground gap-1.5"
                    onClick={handleEnable}
                    disabled={requesting}
                  >
                    <Bell className="w-3 h-3" />
                    {requesting ? "Requesting…" : "Enable Notifications"}
                  </Button>
                )}
              </div>
            </div>

            {/* Dismiss */}
            <button
              onClick={handleDismiss}
              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 -mt-0.5 -mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NotificationPermissionBanner;
