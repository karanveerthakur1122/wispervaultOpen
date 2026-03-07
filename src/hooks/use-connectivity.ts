import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const CHECK_INTERVAL = 30_000;

export type ConnectivityStatus = "checking" | "connected" | "blocked";

export function useConnectivity() {
  // Start as "connected" optimistically — avoids flash of offline on refresh
  const [status, setStatus] = useState<ConnectivityStatus>(
    navigator.onLine ? "connected" : "blocked"
  );
  const [latency, setLatency] = useState<number | null>(null);
  const wasBlockedRef = useRef(false);
  const hasEverConnectedRef = useRef(false);

  const checkConnection = useCallback(async (timeout = 8000): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const start = performance.now();

      const response = await fetch(`${SUPABASE_URL}/rest/v1/?_cb=${Date.now()}`, {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      clearTimeout(timer);
      const elapsed = Math.round(performance.now() - start);
      setLatency(elapsed);
      return response.ok || response.status === 400;
    } catch {
      setLatency(null);
      return false;
    }
  }, []);

  const applyResult = useCallback((reachable: boolean) => {
    if (reachable) {
      if (wasBlockedRef.current) {
        toast.success("Back online", {
          description: "Connection restored successfully.",
          duration: 3000,
        });
      }
      wasBlockedRef.current = false;
      hasEverConnectedRef.current = true;
      setStatus("connected");
    } else {
      // Only show "blocked" if we've confirmed connectivity before or browser says offline
      if (hasEverConnectedRef.current || !navigator.onLine) {
        wasBlockedRef.current = true;
        setStatus("blocked");
      }
      // On initial check failure, stay optimistic — might just be slow network on refresh
    }
  }, []);

  const runCheck = useCallback(async () => {
    const reachable = await checkConnection(8000);
    applyResult(reachable);
    // If initial check failed and we're still optimistic, retry once more
    if (!reachable && !hasEverConnectedRef.current && navigator.onLine) {
      const retry = await checkConnection(12000);
      applyResult(retry);
      if (!retry) {
        // Truly unreachable — now mark blocked
        wasBlockedRef.current = true;
        setStatus("blocked");
      }
    }
  }, [checkConnection, applyResult]);

  const retry = useCallback(async () => {
    setStatus("checking");

    for (let attempt = 0; attempt < 3; attempt++) {
      const timeout = 6000 + attempt * 3000;
      const reachable = await checkConnection(timeout);
      if (reachable) {
        applyResult(true);
        return;
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    applyResult(false);
    // Force blocked after retries exhausted
    wasBlockedRef.current = true;
    setStatus("blocked");
  }, [checkConnection, applyResult]);

  useEffect(() => {
    runCheck();

    const interval = setInterval(async () => {
      const reachable = await checkConnection(10_000);
      applyResult(reachable);
    }, CHECK_INTERVAL);

    const handleOnline = () => runCheck();
    const handleOffline = () => {
      wasBlockedRef.current = true;
      setStatus("blocked");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [runCheck, checkConnection, applyResult]);

  const serverRegion = (() => {
    try {
      const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
      return ref ? `Region: ${ref.slice(0, 3).toUpperCase()}` : "Unknown";
    } catch {
      return "Unknown";
    }
  })();

  return { status, retry, latency, serverRegion };
}
