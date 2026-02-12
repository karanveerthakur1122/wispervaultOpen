import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deriveKey, encryptMessage, decryptMessage, encryptFile } from "@/lib/crypto";
import type { Tables } from "@/integrations/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface Reaction {
  id: string;
  emoji: string;
  senderName: string;
}

export interface ReplyInfo {
  messageId: string;
  username: string;
  preview: string;
}

export interface DecryptedMessage {
  id: string;
  text: string;
  username: string;
  color: string;
  timestamp: number;
  isOwn: boolean;
  isPinned: boolean;
  mediaUrl: string | null;
  mediaType: string | null;
  reactions: Reaction[];
  readBy: string[];
  replyTo: ReplyInfo | null;
}

interface RoomConfig {
  roomId: string;
  password: string;
  username: string;
  avatarColor: string;
  isCreator?: boolean;
}

/** Deduplicate presence rows by username */
function deduplicatePresence(rows: Array<{ username: string; avatar_color: string }>) {
  const seen = new Map<string, { username: string; color: string }>();
  for (const p of rows) {
    if (!seen.has(p.username)) {
      seen.set(p.username, { username: p.username, color: p.avatar_color });
    }
  }
  return Array.from(seen.values());
}

const REPLY_PREFIX = "[reply:";

/** Parse reply metadata from decrypted text. Format: [reply:msgId:username:preview]actualText */
function parseReply(raw: string): { text: string; replyTo: ReplyInfo | null } {
  if (!raw.startsWith(REPLY_PREFIX)) return { text: raw, replyTo: null };
  const endBracket = raw.indexOf("]");
  if (endBracket === -1) return { text: raw, replyTo: null };
  const meta = raw.slice(REPLY_PREFIX.length, endBracket);
  const parts = meta.split(":");
  if (parts.length < 3) return { text: raw, replyTo: null };
  const [messageId, username, ...previewParts] = parts;
  return {
    text: raw.slice(endBracket + 1),
    replyTo: { messageId, username, preview: previewParts.join(":") },
  };
}

export interface SystemEvent {
  id: string;
  type: "join" | "leave";
  username: string;
  color: string;
  timestamp: number;
}

export function useRoom(config: RoomConfig | null) {
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Array<{ username: string; color: string }>>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [chatEnded, setChatEnded] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [pinnedMessage, setPinnedMessage] = useState<DecryptedMessage | null>(null);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const keyRef = useRef<CryptoKey | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceIdRef = useRef<string | null>(null);

  // Register service worker + request notification permission
  useEffect(() => {
    if (!config) return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [config?.roomId]);

  // Helper to show notification via SW (mobile-compatible) or fallback
  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, { ...options, icon: "/favicon.ico" });
      }).catch(() => {
        try { new Notification(title, options); } catch {}
      });
    } else {
      try { new Notification(title, options); } catch {}
    }
  }, []);

  // Derive key on mount
  useEffect(() => {
    if (!config) return;
    deriveKey(config.password, config.roomId).then((key) => {
      keyRef.current = key;
    });
  }, [config?.password, config?.roomId]);

  // Helper to load reactions for messages
  const loadReactions = useCallback(async (messageIds: string[]): Promise<Record<string, Reaction[]>> => {
    if (messageIds.length === 0) return {};
    const { data } = await supabase
      .from("reactions")
      .select("*")
      .in("message_id", messageIds);
    
    const map: Record<string, Reaction[]> = {};
    data?.forEach((r) => {
      if (!map[r.message_id]) map[r.message_id] = [];
      map[r.message_id].push({ id: r.id, emoji: r.emoji, senderName: r.sender_name });
    });
    return map;
  }, []);

  // Helper to load read receipts for messages
  const loadReadReceipts = useCallback(async (messageIds: string[]): Promise<Record<string, string[]>> => {
    if (messageIds.length === 0) return {};
    const { data } = await supabase
      .from("read_receipts")
      .select("*")
      .in("message_id", messageIds);
    
    const map: Record<string, string[]> = {};
    data?.forEach((r) => {
      if (!map[r.message_id]) map[r.message_id] = [];
      map[r.message_id].push(r.reader_name);
    });
    return map;
  }, []);

  // Create or join room + set up realtime
  useEffect(() => {
    if (!config) return;
    let cancelled = false;

    const setup = async () => {
      const { data: existingRoom } = await supabase
        .from("rooms")
        .select("room_id, user_count, active")
        .eq("room_id", config.roomId)
        .eq("active", true)
        .maybeSingle();

      if (!existingRoom) {
        await supabase.from("rooms").insert({ room_id: config.roomId, user_count: 1, empty_since: null });
      } else {
        // Use actual active presence count instead of stale user_count
        const { count } = await supabase
          .from("presence")
          .select("id", { count: "exact", head: true })
          .eq("room_id", config.roomId)
          .eq("is_active", true);

        const activeCount = count ?? 0;
        // Sync the room's user_count with reality, clear empty_since since someone joined
        await supabase
          .from("rooms")
          .update({ user_count: activeCount + 1, empty_since: null })
          .eq("room_id", config.roomId);
      }

      // Clean up any stale presence for this username first
      await supabase
        .from("presence")
        .delete()
        .eq("room_id", config.roomId)
        .eq("username", config.username);

      const { data: presenceData } = await supabase
        .from("presence")
        .insert({
          room_id: config.roomId,
          username: config.username,
          avatar_color: config.avatarColor,
        })
        .select("id")
        .single();

      if (presenceData) presenceIdRef.current = presenceData.id;

      // Clean up stale presence (last_seen older than 60 seconds — heartbeat is every 30s)
      const staleThreshold = new Date(Date.now() - 60 * 1000).toISOString();
      await supabase
        .from("presence")
        .delete()
        .eq("room_id", config.roomId)
        .lt("last_seen", staleThreshold)
        .neq("id", presenceIdRef.current ?? "");

      // Load existing messages with reactions and receipts
      const { data: existingMessages } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", config.roomId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });

      if (existingMessages && keyRef.current) {
        const msgIds = existingMessages.map((m) => m.id);
        const [reactionsMap, receiptsMap] = await Promise.all([
          loadReactions(msgIds),
          loadReadReceipts(msgIds),
        ]);

        const decrypted = await Promise.all(
          existingMessages.map(async (msg) => {
            try {
              const rawText = await decryptMessage(msg.encrypted_blob, msg.iv, keyRef.current!);
              const { text, replyTo } = parseReply(rawText);
              return {
                id: msg.id,
                text,
                username: msg.sender_name,
                color: msg.sender_color,
                timestamp: new Date(msg.created_at).getTime(),
                isOwn: msg.sender_name === config.username,
                isPinned: msg.is_pinned,
                mediaUrl: msg.media_url,
                mediaType: msg.media_type,
                reactions: reactionsMap[msg.id] || [],
                readBy: receiptsMap[msg.id] || [],
                replyTo,
              };
            } catch {
              return null;
            }
          })
        );
        if (!cancelled) {
          const msgs = decrypted.filter(Boolean) as DecryptedMessage[];
          setMessages(msgs);
          setPinnedMessage(msgs.find((m) => m.isPinned) || null);
        }
      }

      // Load online users (deduplicated by username)
      const { data: presenceList } = await supabase
        .from("presence")
        .select("username, avatar_color")
        .eq("room_id", config.roomId)
        .eq("is_active", true);

      if (presenceList && !cancelled) {
        const uniqueUsers = deduplicatePresence(presenceList);
        setOnlineUsers(uniqueUsers);
      }

      // Subscribe to realtime
      const channel = supabase.channel(`room:${config.roomId}`);

      channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${config.roomId}` },
          async (payload) => {
            const msg = payload.new as Tables<"messages">;
            if (msg.is_deleted || !keyRef.current) return;
            try {
              const rawText = await decryptMessage(msg.encrypted_blob, msg.iv, keyRef.current);
              const { text, replyTo } = parseReply(rawText);
              const newMsg: DecryptedMessage = {
                id: msg.id,
                text,
                username: msg.sender_name,
                color: msg.sender_color,
                timestamp: new Date(msg.created_at).getTime(),
                isOwn: msg.sender_name === config.username,
                isPinned: msg.is_pinned,
                mediaUrl: msg.media_url,
                mediaType: msg.media_type,
                reactions: [],
                readBy: [],
                replyTo,
              };
              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, newMsg];
              });
              if (msg.is_pinned) setPinnedMessage(newMsg);

              // Browser notification for new message
              if (!newMsg.isOwn) {
                showNotification(newMsg.username, {
                  body: newMsg.mediaType ? "Sent a media file" : newMsg.text.slice(0, 100),
                  tag: `msg-${newMsg.id}`,
                  silent: false,
                });
              }
            } catch {}
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages", filter: `room_id=eq.${config.roomId}` },
          async (payload) => {
            const msg = payload.new as Tables<"messages">;
            if (!keyRef.current) return;
            
            // If deleted, remove from list
            if (msg.is_deleted) {
              setMessages((prev) => prev.filter((m) => m.id !== msg.id));
              setPinnedMessage((p) => (p?.id === msg.id ? null : p));
              return;
            }

            try {
              const rawText = await decryptMessage(msg.encrypted_blob, msg.iv, keyRef.current);
              const { text, replyTo } = parseReply(rawText);
              
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== msg.id) return m;
                  return { ...m, text, isPinned: msg.is_pinned, replyTo };
                })
              );

              // Browser notification for edited message
              if (msg.sender_name !== config.username) {
                showNotification(`${msg.sender_name} edited a message`, {
                  body: text.slice(0, 100),
                  tag: `edit-${msg.id}`,
                  silent: false,
                });
              }
              if (msg.is_pinned) {
                const existing = messages.find((m) => m.id === msg.id);
                if (existing) setPinnedMessage({ ...existing, text, isPinned: true });
              } else {
                setPinnedMessage((p) => (p?.id === msg.id ? null : p));
              }
            } catch {
              // Just update pin status if decryption fails
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== msg.id) return m;
                  return { ...m, isPinned: msg.is_pinned };
                })
              );
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "messages", filter: `room_id=eq.${config.roomId}` },
          (payload) => {
            const old = payload.old as { id?: string };
            if (old.id) {
              setMessages((prev) => prev.filter((m) => m.id !== old.id));
              setPinnedMessage((p) => (p?.id === old.id ? null : p));
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "reactions", filter: `room_id=eq.${config.roomId}` },
          (payload) => {
            const r = payload.new as Tables<"reactions">;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== r.message_id) return m;
                if (m.reactions.some((rx) => rx.id === r.id)) return m;
                return { ...m, reactions: [...m.reactions, { id: r.id, emoji: r.emoji, senderName: r.sender_name }] };
              })

            );

            // Browser notification for reaction
            if (r.sender_name !== config.username) {
              showNotification(`${r.sender_name} reacted ${r.emoji}`, {
                tag: `reaction-${r.id}`,
                silent: false,
              });
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "reactions", filter: `room_id=eq.${config.roomId}` },
          (payload) => {
            const old = payload.old as { id?: string; message_id?: string };
            if (old.id && old.message_id) {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== old.message_id) return m;
                  return { ...m, reactions: m.reactions.filter((rx) => rx.id !== old.id) };
                })
              );
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "read_receipts", filter: `room_id=eq.${config.roomId}` },
          (payload) => {
            const r = payload.new as Tables<"read_receipts">;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== r.message_id) return m;
                if (m.readBy.includes(r.reader_name)) return m;
                return { ...m, readBy: [...m.readBy, r.reader_name] };
              })
            );
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "presence", filter: `room_id=eq.${config.roomId}` },
          async () => {
            // Prune stale presence before fetching
            const staleThreshold = new Date(Date.now() - 60 * 1000).toISOString();
            await supabase
              .from("presence")
              .delete()
              .eq("room_id", config.roomId)
              .lt("last_seen", staleThreshold);

            const { data } = await supabase
              .from("presence")
              .select("username, avatar_color")
              .eq("room_id", config.roomId)
              .eq("is_active", true);
            if (data) {
              const uniqueUsers = deduplicatePresence(data);
              setOnlineUsers(uniqueUsers);

              // Update room empty_since based on active user count
              if (uniqueUsers.length === 0) {
                await supabase
                  .from("rooms")
                  .update({ user_count: 0, empty_since: new Date().toISOString() })
                  .eq("room_id", config.roomId)
                  .is("empty_since", null);
              } else {
                await supabase
                  .from("rooms")
                  .update({ user_count: uniqueUsers.length, empty_since: null })
                  .eq("room_id", config.roomId);
              }
            }
          }
        )
        .on("broadcast", { event: "chat:end" }, () => {
          setChatEnded(true);
        })
        .on("broadcast", { event: "typing" }, (payload) => {
          const user = payload.payload?.username as string;
          if (user && user !== config.username) {
            setTypingUsers((prev) => (prev.includes(user) ? prev : [...prev, user]));
            setTimeout(() => {
              setTypingUsers((prev) => prev.filter((u) => u !== user));
            }, 3000);
          }
        })
        .on("broadcast", { event: "user:join" }, (payload) => {
          const { username: joinedUser, color } = payload.payload as { username: string; color: string };
          if (joinedUser && joinedUser !== config.username) {
            setSystemEvents((prev) => [
              ...prev,
              { id: crypto.randomUUID(), type: "join", username: joinedUser, color, timestamp: Date.now() },
            ]);
          }
        })
        .on("broadcast", { event: "user:leave" }, (payload) => {
          const { username: leftUser, color } = payload.payload as { username: string; color: string };
          if (leftUser && leftUser !== config.username) {
            setSystemEvents((prev) => [
              ...prev,
              { id: crypto.randomUUID(), type: "leave", username: leftUser, color, timestamp: Date.now() },
            ]);
          }
        })
        .subscribe(async (status) => {
          if (!cancelled) setIsConnected(status === "SUBSCRIBED");
          // Broadcast join event once subscribed
          if (status === "SUBSCRIBED" && channel) {
            channel.send({
              type: "broadcast",
              event: "user:join",
              payload: { username: config.username, color: config.avatarColor },
            });
          }
        });

      channelRef.current = channel;
    };

    setup();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [config?.roomId, config?.username, config?.avatarColor, config?.password]);

  const sendMessage = useCallback(async (
    text: string,
    file?: File,
    replyTo?: ReplyInfo,
    onProgress?: (stage: string, percent: number) => void,
  ) => {
    if (!config || !keyRef.current) return;
    onProgress?.("encrypting", 10);

    const fullText = replyTo
      ? `[reply:${replyTo.messageId}:${replyTo.username}:${replyTo.preview}]${text || "(media)"}`
      : (text || "(media)");
    const { encrypted, iv } = await encryptMessage(fullText, keyRef.current);
    onProgress?.("encrypting", 30);

    let mediaUrl: string | null = null;
    let mediaType: string | null = null;

    if (file) {
      onProgress?.("encrypting", 40);
      const { encryptedBlob, iv: fileIv, mimeType } = await encryptFile(file, keyRef.current);
      onProgress?.("uploading", 50);

      const filePath = `${config.roomId}/${crypto.randomUUID()}`;
      const { error } = await supabase.storage
        .from("encrypted-media")
        .upload(filePath, encryptedBlob);

      onProgress?.("uploading", 85);
      
      if (!error) {
        mediaUrl = JSON.stringify({ path: filePath, iv: fileIv });
        mediaType = mimeType;
      }
    }

    onProgress?.("sending", 90);
    await supabase.from("messages").insert({
      room_id: config.roomId,
      encrypted_blob: encrypted,
      iv,
      sender_name: config.username,
      sender_color: config.avatarColor,
      media_url: mediaUrl,
      media_type: mediaType,
    });
    onProgress?.("done", 100);
  }, [config]);

  const sendTyping = useCallback(() => {
    if (!channelRef.current || !config) return;
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { username: config.username },
    });
  }, [config]);

  const endChat = useCallback(async () => {
    if (!config || !channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "chat:end",
      payload: {},
    });
    await supabase.functions.invoke("end-chat", {
      body: { room_id: config.roomId },
    });
    localStorage.removeItem(`room_${config.roomId}`);
    setChatEnded(true);
  }, [config]);

  const leaveRoom = useCallback(async () => {
    if (!config) return;
    // Broadcast leave event before disconnecting
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "user:leave",
        payload: { username: config.username, color: config.avatarColor },
      });
    }
    // Remove own presence
    if (presenceIdRef.current) {
      await supabase.from("presence").delete().eq("id", presenceIdRef.current);
      presenceIdRef.current = null;
    }
    // Decrement user count and set empty_since if room is now empty
    const { data: room } = await supabase
      .from("rooms")
      .select("user_count")
      .eq("room_id", config.roomId)
      .maybeSingle();
    if (room) {
      const newCount = Math.max(0, room.user_count - 1);
      await supabase
        .from("rooms")
        .update({
          user_count: newCount,
          empty_since: newCount === 0 ? new Date().toISOString() : null,
        })
        .eq("room_id", config.roomId);
    }
    localStorage.removeItem(`room_${config.roomId}`);
    setChatEnded(true);
  }, [config]);

  const deleteMessage = useCallback(async (messageId: string) => {
    await supabase.from("messages").delete().eq("id", messageId);
  }, []);

  const editMessage = useCallback(async (messageId: string, newText: string) => {
    if (!config || !keyRef.current) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !msg.isOwn) return;

    // Preserve reply prefix if original had one
    const fullText = msg.replyTo
      ? `[reply:${msg.replyTo.messageId}:${msg.replyTo.username}:${msg.replyTo.preview}]${newText}`
      : newText;

    const { encrypted, iv } = await encryptMessage(fullText, keyRef.current);
    await supabase.from("messages").update({
      encrypted_blob: encrypted,
      iv,
    }).eq("id", messageId);
  }, [config, messages]);

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!config) return;
    // Toggle: if already reacted with same emoji, remove
    const existing = messages.find((m) => m.id === messageId);
    const existingReaction = existing?.reactions.find(
      (r) => r.emoji === emoji && r.senderName === config.username
    );
    if (existingReaction) {
      await supabase.from("reactions").delete().eq("id", existingReaction.id);
    } else {
      await supabase.from("reactions").insert({
        message_id: messageId,
        room_id: config.roomId,
        emoji,
        sender_name: config.username,
      });
    }
  }, [config, messages]);

  const togglePin = useCallback(async (messageId: string) => {
    if (!config) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    if (msg.isPinned) {
      // Unpin
      await supabase.from("messages").update({ is_pinned: false }).eq("id", messageId);
    } else {
      // Unpin existing pinned message first
      if (pinnedMessage) {
        await supabase.from("messages").update({ is_pinned: false }).eq("id", pinnedMessage.id);
      }
      await supabase.from("messages").update({ is_pinned: true }).eq("id", messageId);
    }
  }, [config, messages, pinnedMessage]);

  const markAsRead = useCallback(async (messageId: string) => {
    if (!config) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || msg.isOwn || msg.readBy.includes(config.username)) return;
    
    await supabase.from("read_receipts").insert({
      message_id: messageId,
      room_id: config.roomId,
      reader_name: config.username,
    }).select().maybeSingle(); // ignore duplicate errors
  }, [config, messages]);

  const recordMediaView = useCallback(async (mediaUrl: string) => {
    if (!config) return;
    // Check if already viewed
    const { data: existing } = await supabase
      .from("media_views")
      .select("id")
      .eq("media_url", mediaUrl)
      .maybeSingle();
    
    if (!existing) {
      await supabase.from("media_views").insert({
        media_url: mediaUrl,
        room_id: config.roomId,
      });
      // Trigger auto-delete edge function
      supabase.functions.invoke("delete-media", {
        body: { media_url: mediaUrl, room_id: config.roomId },
      });
    }
  }, [config]);

  // Heartbeat: update last_seen every 20s so stale users can be detected
  useEffect(() => {
    if (!presenceIdRef.current || !config) return;
    const interval = setInterval(() => {
      if (presenceIdRef.current) {
        supabase
          .from("presence")
          .update({ last_seen: new Date().toISOString() })
          .eq("id", presenceIdRef.current)
          .then();
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [isConnected, config]);

  // Cleanup presence on unmount + beforeunload + visibilitychange
  useEffect(() => {
    if (!config) return;

    const cleanup = () => {
      if (presenceIdRef.current) {
        // Use sendBeacon for reliable cleanup on tab close
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/presence?id=eq.${presenceIdRef.current}`;
        const headers = {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        };
        // Try fetch with keepalive first (more reliable than sendBeacon for DELETE)
        try {
          fetch(url, { method: 'DELETE', headers, keepalive: true });
        } catch {
          // Fallback: mark inactive via PATCH with sendBeacon
          const patchUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/presence?id=eq.${presenceIdRef.current}`;
          navigator.sendBeacon?.(patchUrl);
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Mark as stale by setting last_seen far back so others prune it
        if (presenceIdRef.current) {
          supabase
            .from("presence")
            .update({ last_seen: new Date(Date.now() - 120000).toISOString() })
            .eq("id", presenceIdRef.current)
            .then();
        }
      } else if (document.visibilityState === 'visible') {
        // Refresh presence when coming back
        if (presenceIdRef.current) {
          supabase
            .from("presence")
            .update({ last_seen: new Date().toISOString() })
            .eq("id", presenceIdRef.current)
            .then();
        }
      }
    };

    window.addEventListener('beforeunload', cleanup);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeunload', cleanup);
      document.removeEventListener('visibilitychange', handleVisibility);
      // Don't delete presence on unmount — only beforeunload and explicit leave handle that.
      // This prevents showing offline when navigating within the app.
    };
  }, [config]);

  return {
    messages,
    onlineUsers,
    isConnected,
    chatEnded,
    typingUsers,
    pinnedMessage,
    systemEvents,
    sendMessage,
    sendTyping,
    endChat,
    leaveRoom,
    deleteMessage,
    editMessage,
    addReaction,
    togglePin,
    markAsRead,
    recordMediaView,
  };
}
