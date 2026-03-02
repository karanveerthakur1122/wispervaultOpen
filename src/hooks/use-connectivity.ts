import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const CHECK_INTERVAL = 30_000; // 30s
const INITIAL_CHECK_TIMEOUT = 8_000; // 8s for first check

export type ConnectivityStatus = "checking" | "connected" | "blocked";

export function useConnectivity() {
  const [status, setStatus] = useState<ConnectivityStatus>("checking");
  const prevStatusRef = useRef<ConnectivityStatus>("checking");

  const checkConnection = useCallback(async (timeout = 8000): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      clearTimeout(timer);
      return response.ok || response.status === 400;
    } catch {
      return false;
    }
  }, []);

  const updateStatus = useCallback((newStatus: ConnectivityStatus) => {
    setStatus((prev) => {
      // Show toast when transitioning from blocked to connected
      if (prev === "blocked" && newStatus === "connected") {
        toast.success("Connection restored!", {
          description: "You're back online. Everything should work normally now.",
          duration: 4000,
        });
      }
      prevStatusRef.current = prev;
      return newStatus;
    });
  }, []);

  const runCheck = useCallback(async () => {
    const reachable = await checkConnection(INITIAL_CHECK_TIMEOUT);
    updateStatus(reachable ? "connected" : "blocked");
  }, [checkConnection, updateStatus]);

  const retry = useCallback(async () => {
    setStatus("checking");
    await runCheck();
  }, [runCheck]);

  useEffect(() => {
    runCheck();

    const interval = setInterval(async () => {
      const reachable = await checkConnection(10_000);
      updateStatus(reachable ? "connected" : "blocked");
    }, CHECK_INTERVAL);

    const handleOnline = () => runCheck();
    const handleOffline = () => updateStatus("blocked");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [runCheck, checkConnection, updateStatus]);

  return { status, retry };
}
