import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const CHECK_INTERVAL = 30_000; // 30s
const INITIAL_CHECK_TIMEOUT = 8_000; // 8s for first check

export type ConnectivityStatus = "checking" | "connected" | "blocked";

export function useConnectivity() {
  const [status, setStatus] = useState<ConnectivityStatus>("checking");

  const checkConnection = useCallback(async (timeout = 8000): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      // Try a lightweight health check against the Supabase REST endpoint
      const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      clearTimeout(timer);
      return response.ok || response.status === 400; // 400 means reachable but no table specified
    } catch {
      return false;
    }
  }, []);

  const runCheck = useCallback(async () => {
    const reachable = await checkConnection(INITIAL_CHECK_TIMEOUT);
    setStatus(reachable ? "connected" : "blocked");
  }, [checkConnection]);

  const retry = useCallback(async () => {
    setStatus("checking");
    await runCheck();
  }, [runCheck]);

  useEffect(() => {
    runCheck();

    const interval = setInterval(async () => {
      const reachable = await checkConnection(10_000);
      setStatus(reachable ? "connected" : "blocked");
    }, CHECK_INTERVAL);

    // Also listen to online/offline events
    const handleOnline = () => runCheck();
    const handleOffline = () => setStatus("blocked");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [runCheck, checkConnection]);

  return { status, retry };
}
