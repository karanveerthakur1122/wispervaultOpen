import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const CHECK_INTERVAL = 30_000;
const INITIAL_CHECK_TIMEOUT = 8_000;

export type ConnectivityStatus = "checking" | "connected" | "blocked";

export function useConnectivity() {
  const [status, setStatus] = useState<ConnectivityStatus>("checking");
  const wasBlockedRef = useRef(false);

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

  const applyResult = useCallback((reachable: boolean) => {
    if (reachable) {
      if (wasBlockedRef.current) {
        toast.success("Connection restored!", {
          description: "You're back online. Everything should work normally now.",
          duration: 4000,
        });
      }
      wasBlockedRef.current = false;
      setStatus("connected");
    } else {
      wasBlockedRef.current = true;
      setStatus("blocked");
    }
  }, []);

  const runCheck = useCallback(async () => {
    const reachable = await checkConnection(INITIAL_CHECK_TIMEOUT);
    applyResult(reachable);
  }, [checkConnection, applyResult]);

  const retry = useCallback(async () => {
    setStatus("checking");
    await runCheck();
  }, [runCheck]);

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

  return { status, retry };
}
