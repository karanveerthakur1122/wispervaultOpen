import { useState, useEffect, useRef, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

const TYPING_EXPIRY_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 2000;
const DEBOUNCE_MS = 300;
const CLEANUP_INTERVAL_MS = 1000;
const STOP_TYPING_DELAY_MS = 2000;

interface TypingEntry {
  timestamp: number;
}

interface UseTypingIndicatorOptions {
  channel: RealtimeChannel | null;
  username: string;
  onlineUsernames: string[];
}

export function useTypingIndicator({ channel, username, onlineUsernames }: UseTypingIndicatorOptions) {
  const [displayTypingUsers, setDisplayTypingUsers] = useState<string[]>([]);

  // Internal timestamp map: username -> last typing timestamp
  const typingMapRef = useRef<Map<string, TypingEntry>>(new Map());
  // Track our own typing state
  const isTypingRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef(0);
  const channelRef = useRef(channel);

  // Keep channel ref updated
  useEffect(() => {
    channelRef.current = channel;
  }, [channel]);

  // ─── Derive display list from map ────────────────────────────────────
  const updateDisplayList = useCallback(() => {
    const now = Date.now();
    const active: string[] = [];
    const map = typingMapRef.current;

    for (const [user, entry] of map.entries()) {
      if (now - entry.timestamp < TYPING_EXPIRY_MS) {
        active.push(user);
      } else {
        map.delete(user);
      }
    }

    setDisplayTypingUsers((prev) => {
      if (prev.length === active.length && prev.every((u, i) => u === active[i])) return prev;
      return active;
    });
  }, []);

  // ─── Cleanup loop: runs every 1s to expire stale entries ─────────────
  useEffect(() => {
    const interval = setInterval(updateDisplayList, CLEANUP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [updateDisplayList]);

  // ─── Remove users who leave presence ─────────────────────────────────
  useEffect(() => {
    const onlineSet = new Set(onlineUsernames);
    const map = typingMapRef.current;
    let changed = false;
    for (const user of map.keys()) {
      if (!onlineSet.has(user)) {
        map.delete(user);
        changed = true;
      }
    }
    if (changed) updateDisplayList();
  }, [onlineUsernames, updateDisplayList]);

  // ─── Handle incoming typing events ───────────────────────────────────
  useEffect(() => {
    if (!channel) return;

    const handleTypingStart = (payload: { payload?: { username?: string; timestamp?: number } }) => {
      const user = payload.payload?.username;
      if (!user || user === username) return;
      typingMapRef.current.set(user, { timestamp: Date.now() });
      updateDisplayList();
    };

    const handleTypingStop = (payload: { payload?: { username?: string } }) => {
      const user = payload.payload?.username;
      if (!user || user === username) return;
      typingMapRef.current.delete(user);
      updateDisplayList();
    };

    // Subscribe to broadcast events
    channel.on("broadcast", { event: "typing:start" }, handleTypingStart);
    channel.on("broadcast", { event: "typing:stop" }, handleTypingStop);

    // No cleanup needed — channel removal handles it
    return () => {
      // Clear map on channel change (reconnect safety)
      typingMapRef.current.clear();
      updateDisplayList();
    };
  }, [channel, username, updateDisplayList]);

  // ─── Clear typing map on reconnect ───────────────────────────────────
  useEffect(() => {
    if (!channel) {
      typingMapRef.current.clear();
      updateDisplayList();
    }
  }, [channel, updateDisplayList]);

  // ─── Send typing:start (debounced) ───────────────────────────────────
  const sendTypingStart = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < DEBOUNCE_MS) return;
    lastSentRef.current = now;
    channelRef.current?.send({
      type: "broadcast",
      event: "typing:start",
      payload: { username, timestamp: now },
    });
  }, [username]);

  // ─── Send typing:stop ────────────────────────────────────────────────
  const sendTypingStop = useCallback(() => {
    isTypingRef.current = false;
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    channelRef.current?.send({
      type: "broadcast",
      event: "typing:stop",
      payload: { username, timestamp: Date.now() },
    });
  }, [username]);

  // ─── Start heartbeat ─────────────────────────────────────────────────
  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) return;
    heartbeatRef.current = setInterval(() => {
      if (isTypingRef.current) {
        sendTypingStart();
      } else {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, [sendTypingStart]);

  // ─── Called on every input change ────────────────────────────────────
  const onInputChange = useCallback((hasText: boolean) => {
    if (!hasText) {
      if (isTypingRef.current) sendTypingStop();
      return;
    }

    // Reset the "user stopped typing" timeout
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) sendTypingStop();
    }, STOP_TYPING_DELAY_MS);

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      startHeartbeat();
    }
    sendTypingStart();
  }, [sendTypingStart, sendTypingStop, startHeartbeat]);

  // ─── Called when message is sent ─────────────────────────────────────
  const onMessageSent = useCallback(() => {
    if (isTypingRef.current) sendTypingStop();
  }, [sendTypingStop]);

  // ─── Cleanup on unmount / visibility change / beforeunload ───────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden" && isTypingRef.current) {
        sendTypingStop();
      }
    };
    const handleBeforeUnload = () => {
      if (isTypingRef.current) sendTypingStop();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Stop on unmount
      if (isTypingRef.current) sendTypingStop();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    };
  }, [sendTypingStop]);

  // ─── Format display text ────────────────────────────────────────────
  const typingText = displayTypingUsers.length === 0
    ? null
    : displayTypingUsers.length === 1
      ? `${displayTypingUsers[0]} is typing`
      : displayTypingUsers.length === 2
        ? `${displayTypingUsers[0]} and ${displayTypingUsers[1]} are typing`
        : `${displayTypingUsers.length} people are typing`;

  return {
    typingUsers: displayTypingUsers,
    typingText,
    onInputChange,
    onMessageSent,
  };
}
