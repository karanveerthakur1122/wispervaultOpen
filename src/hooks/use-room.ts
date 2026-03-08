import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { encryptFile } from "@/lib/crypto";
import { workerEncrypt, workerDecrypt, workerDecryptBatch, workerEncryptFile } from "@/lib/crypto-worker-api";
import type { Tables } from "@/integrations/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Pre-warm crypto key by triggering a dummy encrypt on the worker
function preWarmCryptoKey(password: string, salt: string) {
  workerEncrypt("warmup", password, salt).catch(() => {});
}

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
  pending?: boolean; // optimistic flag
}

interface RoomConfig {
  roomId: string;
  password: string;
  username: string;
  avatarColor: string;
  isCreator?: boolean;
}

function presenceStateToUsers(state: Record<string, Array<{ username: string; color: string }>>): Array<{ username: string; color: string }> {
  const seen = new Map<string, { username: string; color: string }>();
  for (const presences of Object.values(state)) {
    for (const p of presences) {
      if (p.username && !seen.has(p.username)) {
        seen.set(p.username, { username: p.username, color: p.color });
      }
    }
  }
  return Array.from(seen.values());
}

const REPLY_PREFIX = "[reply:";

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
  type: "join" | "leave" | "screenshot" | "message_deleted" | "media_saved";
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
  const [roomCreatedAt, setRoomCreatedAt] = useState<string | null>(null);
  const [isRoomLocked, setIsRoomLocked] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceIdRef = useRef<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const messagesRef = useRef<DecryptedMessage[]>([]);
  const setupCompleteRef = useRef(false);
  const offlineQueueRef = useRef<Array<{ text: string; file?: File; replyTo?: ReplyInfo; tempId: string }>>([]);

  // rAF batching for incoming messages
  const pendingMessagesRef = useRef<DecryptedMessage[]>([]);
  const rafIdRef = useRef<number | null>(null);

  const flushPendingMessages = useCallback(() => {
    rafIdRef.current = null;
    const batch = pendingMessagesRef.current;
    if (batch.length === 0) return;
    pendingMessagesRef.current = [];
    setMessages((prev) => {
      let next = prev;
      for (const newMsg of batch) {
        // Dedupe
        if (next.some((m) => m.id === newMsg.id)) continue;
        // Replace optimistic
        const optimisticIdx = next.findIndex(
          (m) => m.pending && m.text === newMsg.text && m.username === newMsg.username
        );
        if (optimisticIdx >= 0) {
          next = [...next];
          next[optimisticIdx] = newMsg;
        } else {
          next = [...next, newMsg];
        }
      }
      return next;
    });
  }, []);

  const enqueueMessage = useCallback((msg: DecryptedMessage) => {
    pendingMessagesRef.current.push(msg);
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushPendingMessages);
    }
  }, [flushPendingMessages]);

  useEffect(() => {
    if (!config) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [config?.roomId]);

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

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const loadReactions = useCallback(async (messageIds: string[]): Promise<Record<string, Reaction[]>> => {
    if (messageIds.length === 0) return {};
    const { data } = await supabase.from("reactions").select("*").in("message_id", messageIds);
    const map: Record<string, Reaction[]> = {};
    data?.forEach((r) => {
      if (!map[r.message_id]) map[r.message_id] = [];
      map[r.message_id].push({ id: r.id, emoji: r.emoji, senderName: r.sender_name });
    });
    return map;
  }, []);

  const loadReadReceipts = useCallback(async (messageIds: string[]): Promise<Record<string, string[]>> => {
    if (messageIds.length === 0) return {};
    const { data } = await supabase.from("read_receipts").select("*").in("message_id", messageIds);
    const map: Record<string, string[]> = {};
    data?.forEach((r) => {
      if (!map[r.message_id]) map[r.message_id] = [];
      map[r.message_id].push(r.reader_name);
    });
    return map;
  }, []);

  // Main setup effect
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    // Pre-warm the crypto key so first send is instant
    preWarmCryptoKey(config.password, config.roomId);

    const setup = async () => {
      const { data: existingRoom } = await supabase
        .from("rooms")
        .select("room_id, user_count, active, created_at, is_locked")
        .eq("room_id", config.roomId)
        .eq("active", true)
        .maybeSingle();

      if (!existingRoom) {
        if (!config.isCreator) {
          // Retry once after 2s to handle transient network issues
          await new Promise((r) => setTimeout(r, 2000));
          if (cancelled) return;
          const { data: retryRoom } = await supabase
            .from("rooms")
            .select("room_id, user_count, active, created_at, is_locked")
            .eq("room_id", config.roomId)
            .eq("active", true)
            .maybeSingle();
          if (!retryRoom) {
            setChatEnded(true);
            return;
          }
          // Use retry result
          setRoomCreatedAt(retryRoom.created_at);
          setIsRoomLocked(retryRoom.is_locked ?? false);
        }
      } else if (existingRoom.is_locked && !config.isCreator) {
        setChatEnded(true);
        return;
      } else {
        setRoomCreatedAt(existingRoom.created_at);
        setIsRoomLocked(existingRoom.is_locked ?? false);
        const { count } = await supabase
          .from("presence")
          .select("id", { count: "exact", head: true })
          .eq("room_id", config.roomId)
          .eq("is_active", true);
        const activeCount = count ?? 0;
        await supabase
          .from("rooms")
          .update({ user_count: activeCount + 1, empty_since: null })
          .eq("room_id", config.roomId);
      }

      await supabase.from("presence").delete().eq("room_id", config.roomId).eq("username", config.username);
      const { data: presenceData } = await supabase
        .from("presence")
        .insert({ room_id: config.roomId, username: config.username, avatar_color: config.avatarColor })
        .select("id")
        .single();
      if (presenceData) presenceIdRef.current = presenceData.id;

      // Create or upsert session token for server-side sender validation
      const { data: sessionData } = await supabase
        .from("room_sessions")
        .upsert(
          { room_id: config.roomId, username: config.username },
          { onConflict: "room_id,username" }
        )
        .select("session_token")
        .single();
      if (sessionData) sessionTokenRef.current = sessionData.session_token;

      const staleThreshold = new Date(Date.now() - 60 * 1000).toISOString();
      await supabase.from("presence").delete()
        .eq("room_id", config.roomId)
        .lt("last_seen", staleThreshold)
        .neq("id", presenceIdRef.current ?? "");

      // Load & batch-decrypt existing messages via worker
      const { data: existingMessages } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", config.roomId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });

      if (existingMessages && existingMessages.length > 0) {
        const msgIds = existingMessages.map((m) => m.id);
        const [reactionsMap, receiptsMap, decryptedTexts] = await Promise.all([
          loadReactions(msgIds),
          loadReadReceipts(msgIds),
          workerDecryptBatch(
            existingMessages.map((m) => ({ id: m.id, encrypted: m.encrypted_blob, iv: m.iv })),
            config.password,
            config.roomId
          ),
        ]);

        const textMap = new Map(decryptedTexts.map((d) => [d.id, d.text]));
        const msgs: DecryptedMessage[] = [];
        for (const msg of existingMessages) {
          const rawText = textMap.get(msg.id);
          if (rawText === null || rawText === undefined) continue;
          const { text, replyTo } = parseReply(rawText);
          msgs.push({
            id: msg.id, text, username: msg.sender_name, color: msg.sender_color,
            timestamp: new Date(msg.created_at).getTime(), isOwn: msg.sender_name === config.username,
            isPinned: msg.is_pinned, mediaUrl: msg.media_url, mediaType: msg.media_type,
            reactions: reactionsMap[msg.id] || [], readBy: receiptsMap[msg.id] || [], replyTo,
          });
        }
        if (!cancelled) {
          setMessages((prev) => {
            if (msgs.length === 0 && prev.length > 0) return prev;
            return msgs;
          });
          setPinnedMessage(msgs.find((m) => m.isPinned) || null);
        }
      }

      // Realtime channel
      const channel = supabase.channel(`room:${config.roomId}`);

      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${config.roomId}` },
          async (payload) => {
            const msg = payload.new as Tables<"messages">;
            if (msg.is_deleted) return;
            try {
              const rawText = await workerDecrypt(msg.encrypted_blob, msg.iv, config.password, config.roomId);
              const { text, replyTo } = parseReply(rawText);
              const newMsg: DecryptedMessage = {
                id: msg.id, text, username: msg.sender_name, color: msg.sender_color,
                timestamp: new Date(msg.created_at).getTime(), isOwn: msg.sender_name === config.username,
                isPinned: msg.is_pinned, mediaUrl: msg.media_url, mediaType: msg.media_type,
                reactions: [], readBy: [], replyTo,
              };
              enqueueMessage(newMsg);
              if (msg.is_pinned) setPinnedMessage(newMsg);
              if (!newMsg.isOwn) {
                showNotification(newMsg.username, {
                  body: newMsg.mediaType ? "Sent a media file" : newMsg.text.slice(0, 100),
                  tag: `msg-${newMsg.id}`, silent: false,
                });
              }
            } catch {}
          }
        )
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `room_id=eq.${config.roomId}` },
          async (payload) => {
            const msg = payload.new as Tables<"messages">;
            if (msg.is_deleted) {
              setMessages((prev) => prev.filter((m) => m.id !== msg.id));
              setPinnedMessage((p) => (p?.id === msg.id ? null : p));
              return;
            }
            try {
              const rawText = await workerDecrypt(msg.encrypted_blob, msg.iv, config.password, config.roomId);
              const { text, replyTo } = parseReply(rawText);
              setMessages((prev) => prev.map((m) => m.id !== msg.id ? m : { ...m, text, isPinned: msg.is_pinned, replyTo }));
              if (msg.sender_name !== config.username) {
                showNotification(`${msg.sender_name} edited a message`, { body: text.slice(0, 100), tag: `edit-${msg.id}`, silent: false });
              }
              if (msg.is_pinned) {
                const existing = messagesRef.current.find((m) => m.id === msg.id);
                if (existing) setPinnedMessage({ ...existing, text, isPinned: true });
              } else {
                setPinnedMessage((p) => (p?.id === msg.id ? null : p));
              }
            } catch {
              setMessages((prev) => prev.map((m) => m.id !== msg.id ? m : { ...m, isPinned: msg.is_pinned }));
            }
          }
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `room_id=eq.${config.roomId}` },
          (payload) => {
            const old = payload.old as { id?: string };
            if (old.id) {
              setMessages((prev) => prev.filter((m) => m.id !== old.id));
              setPinnedMessage((p) => (p?.id === old.id ? null : p));
            }
          }
        )
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions", filter: `room_id=eq.${config.roomId}` },
          (payload) => {
            const r = payload.new as Tables<"reactions">;
            setMessages((prev) => prev.map((m) => {
              if (m.id !== r.message_id) return m;
              if (m.reactions.some((rx) => rx.id === r.id)) return m;
              return { ...m, reactions: [...m.reactions, { id: r.id, emoji: r.emoji, senderName: r.sender_name }] };
            }));
            if (r.sender_name !== config.username) {
              showNotification(`${r.sender_name} reacted ${r.emoji}`, { tag: `reaction-${r.id}`, silent: false });
            }
          }
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "reactions", filter: `room_id=eq.${config.roomId}` },
          (payload) => {
            const old = payload.old as { id?: string; message_id?: string };
            if (old.id && old.message_id) {
              setMessages((prev) => prev.map((m) => {
                if (m.id !== old.message_id) return m;
                return { ...m, reactions: m.reactions.filter((rx) => rx.id !== old.id) };
              }));
            }
          }
        )
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "read_receipts", filter: `room_id=eq.${config.roomId}` },
          (payload) => {
            const r = payload.new as Tables<"read_receipts">;
            setMessages((prev) => prev.map((m) => {
              if (m.id !== r.message_id) return m;
              if (m.readBy.includes(r.reader_name)) return m;
              return { ...m, readBy: [...m.readBy, r.reader_name] };
            }));
          }
        )
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState<{ username: string; color: string }>();
          const users = presenceStateToUsers(state);
          setOnlineUsers(users);
          supabase.from("rooms").update({
            user_count: users.length,
            empty_since: users.length === 0 ? new Date().toISOString() : null
          }).eq("room_id", config.roomId).then();
        })
        .on("presence", { event: "join" }, () => {
          setOnlineUsers(presenceStateToUsers(channel.presenceState<{ username: string; color: string }>()));
        })
        .on("presence", { event: "leave" }, () => {
          setOnlineUsers(presenceStateToUsers(channel.presenceState<{ username: string; color: string }>()));
        })
        .on("broadcast", { event: "chat:end" }, () => setChatEnded(true))
        .on("broadcast", { event: "typing" }, (payload) => {
          const user = payload.payload?.username as string;
          if (user && user !== config.username) {
            setTypingUsers((prev) => (prev.includes(user) ? prev : [...prev, user]));
            setTimeout(() => setTypingUsers((prev) => prev.filter((u) => u !== user)), 3000);
          }
        })
        .on("broadcast", { event: "user:join" }, (payload) => {
          const { username: joinedUser, color } = payload.payload as { username: string; color: string };
          if (joinedUser && joinedUser !== config.username) {
            setSystemEvents((prev) => [...prev, { id: crypto.randomUUID(), type: "join", username: joinedUser, color, timestamp: Date.now() }]);
          }
        })
        .on("broadcast", { event: "user:leave" }, (payload) => {
          const { username: leftUser, color } = payload.payload as { username: string; color: string };
          if (leftUser && leftUser !== config.username) {
            setSystemEvents((prev) => [...prev, { id: crypto.randomUUID(), type: "leave", username: leftUser, color, timestamp: Date.now() }]);
          }
        })
        .on("broadcast", { event: "screenshot" }, (payload) => {
          const { username: ssUser, color } = payload.payload as { username: string; color: string };
          setSystemEvents((prev) => [...prev, { id: crypto.randomUUID(), type: "screenshot", username: ssUser, color, timestamp: Date.now() }]);
        })
        .on("broadcast", { event: "message_deleted" }, (payload) => {
          const { username: delUser, color } = payload.payload as { username: string; color: string };
          if (delUser !== config.username) {
            setSystemEvents((prev) => [...prev, { id: crypto.randomUUID(), type: "message_deleted", username: delUser, color, timestamp: Date.now() }]);
          }
        })
        .on("broadcast", { event: "media_saved" }, (payload) => {
          const { username: saveUser, color } = payload.payload as { username: string; color: string };
          if (saveUser !== config.username) {
            setSystemEvents((prev) => [...prev, { id: crypto.randomUUID(), type: "media_saved", username: saveUser, color, timestamp: Date.now() }]);
          }
        })
        .on("broadcast", { event: "user:kick" }, (payload) => {
          const { username: kickedUser } = payload.payload as { username: string; by: string };
          if (kickedUser === config.username) {
            presenceIdRef.current = null;
            localStorage.removeItem(`room_${config.roomId}`);
            setChatEnded(true);
          } else {
            setOnlineUsers((prev) => prev.filter((u) => u.username !== kickedUser));
            setSystemEvents((prev) => [...prev, { id: crypto.randomUUID(), type: "leave", username: kickedUser, color: "", timestamp: Date.now() }]);
          }
        })
        .on("broadcast", { event: "room:lock" }, (payload) => {
          const { locked } = payload.payload as { locked: boolean };
          setIsRoomLocked(locked);
        })
        .subscribe(async (status) => {
          if (!cancelled) setIsConnected(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED" && channel) {
            await channel.track({ username: config.username, color: config.avatarColor, online: true, joined_at: Date.now() });
            channel.send({ type: "broadcast", event: "user:join", payload: { username: config.username, color: config.avatarColor } });
          }
        });

      channelRef.current = channel;
    };

    setup().then(() => { if (!cancelled) setupCompleteRef.current = true; });
    return () => {
      cancelled = true;
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [config?.roomId, config?.username, config?.avatarColor, config?.password]);

  // Offline queue flush
  useEffect(() => {
    if (!config) return;
    const flushQueue = async () => {
      if (!navigator.onLine || offlineQueueRef.current.length === 0) return;
      const queue = [...offlineQueueRef.current];
      offlineQueueRef.current = [];
      for (const item of queue) {
        try {
          const replyPrefix = item.replyTo ? `[reply:${item.replyTo.messageId}:${item.replyTo.username}:${item.replyTo.preview}]` : "";
          const fullText = replyPrefix + (item.text || "(media)");
          const { encrypted, iv } = await workerEncrypt(fullText, config.password, config.roomId);
          await supabase.from("messages").insert({
            room_id: config.roomId, encrypted_blob: encrypted, iv,
            sender_name: config.username, sender_color: config.avatarColor,
            media_url: null, media_type: null,
          });
        } catch {
          // Re-queue on failure
          offlineQueueRef.current.push(item);
        }
      }
    };
    window.addEventListener("online", flushQueue);
    return () => window.removeEventListener("online", flushQueue);
  }, [config]);

  // Send message with optimistic rendering
  const sendMessage = useCallback(async (
    text: string, file?: File, replyTo?: ReplyInfo,
    onProgress?: (stage: string, percent: number) => void,
  ) => {
    if (!config) return;
    onProgress?.("encrypting", 10);

    const replyPrefix = replyTo
      ? `[reply:${replyTo.messageId}:${replyTo.username}:${replyTo.preview}]`
      : "";
    const displayText = text || "(media)";
    const fullText = replyPrefix + displayText;

    // Optimistic message — add immediately
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimisticMsg: DecryptedMessage = {
      id: tempId, text: displayText, username: config.username, color: config.avatarColor,
      timestamp: Date.now(), isOwn: true, isPinned: false,
      mediaUrl: null, mediaType: file?.type || null,
      reactions: [], readBy: [], replyTo: replyTo || null, pending: true,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    // Queue for offline if no network and no file
    if (!navigator.onLine && !file) {
      offlineQueueRef.current.push({ text: displayText, replyTo, tempId });
      return;
    }

    try {
      const { encrypted, iv } = await workerEncrypt(fullText, config.password, config.roomId);
      onProgress?.("encrypting", 30);

      let mediaUrl: string | null = null;
      let mediaType: string | null = null;

      if (file) {
        onProgress?.("encrypting", 40);
        const fileData = await file.arrayBuffer();
        const { encryptedData, iv: fileIv } = await workerEncryptFile(fileData, config.password, config.roomId);
        onProgress?.("uploading", 50);

        const filePath = `${config.roomId}/${crypto.randomUUID()}`;
        const { error } = await supabase.storage
          .from("encrypted-media")
          .upload(filePath, new Blob([encryptedData]));
        onProgress?.("uploading", 85);

        if (error) {
          console.error("Storage upload failed:", error);
          throw new Error(`Upload failed: ${error.message}`);
        }
        mediaUrl = JSON.stringify({ path: filePath, iv: fileIv });
        mediaType = file.type;
      }

      onProgress?.("sending", 90);
      const { error: insertError } = await supabase.from("messages").insert({
        room_id: config.roomId, encrypted_blob: encrypted, iv,
        sender_name: config.username, sender_color: config.avatarColor,
        media_url: mediaUrl, media_type: mediaType,
      });
      if (insertError) {
        console.error("Message insert failed:", insertError);
        throw new Error(`Message send failed: ${insertError.message}`);
      }

      await supabase.from("rooms").update({ last_message_at: new Date().toISOString() }).eq("room_id", config.roomId);
      onProgress?.("done", 100);
    } catch (err) {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      throw err;
    }
  }, [config]);

  const sendTyping = useCallback(() => {
    if (!channelRef.current || !config) return;
    channelRef.current.send({ type: "broadcast", event: "typing", payload: { username: config.username } });
  }, [config]);

  const endChat = useCallback(async () => {
    if (!config || !channelRef.current) return;
    channelRef.current.send({ type: "broadcast", event: "chat:end", payload: {} });
    await supabase.functions.invoke("end-chat", { body: { room_id: config.roomId } });
    localStorage.removeItem(`room_${config.roomId}`);
    setChatEnded(true);
  }, [config]);

  const leaveRoom = useCallback(async () => {
    if (!config) return;
    if (channelRef.current) {
      channelRef.current.send({ type: "broadcast", event: "user:leave", payload: { username: config.username, color: config.avatarColor } });
    }
    channelRef.current?.untrack();
    if (presenceIdRef.current) {
      await supabase.from("presence").delete().eq("id", presenceIdRef.current);
      presenceIdRef.current = null;
    }
    const { data: room } = await supabase.from("rooms").select("user_count").eq("room_id", config.roomId).maybeSingle();
    if (room) {
      const newCount = Math.max(0, room.user_count - 1);
      await supabase.from("rooms").update({ user_count: newCount, empty_since: newCount === 0 ? new Date().toISOString() : null }).eq("room_id", config.roomId);
    }
    localStorage.removeItem(`room_${config.roomId}`);
    setChatEnded(true);
  }, [config]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!config) return;
    const msg = messagesRef.current.find((m) => m.id === messageId);
    if (!msg || msg.username !== config.username) return;
    // Optimistic UI removal
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    setPinnedMessage((p) => (p?.id === messageId ? null : p));

    if (sessionTokenRef.current) {
      // Server-side validated delete via edge function
      const { error } = await supabase.functions.invoke("delete-message", {
        body: { message_id: messageId, session_token: sessionTokenRef.current },
      });
      if (error) {
        // Restore on failure
        setMessages((prev) => {
          if (prev.some((m) => m.id === messageId)) return prev;
          return [...prev, msg].sort((a, b) => a.timestamp - b.timestamp);
        });
        return;
      }
    } else {
      // Fallback direct delete (legacy)
      const { error } = await supabase.from("messages").delete().eq("id", messageId);
      if (error) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === messageId)) return prev;
          return [...prev, msg].sort((a, b) => a.timestamp - b.timestamp);
        });
        return;
      }
    }
    channelRef.current?.send({ type: "broadcast", event: "message_deleted", payload: { username: config.username, color: config.avatarColor } });
    setSystemEvents((prev) => [...prev, { id: crypto.randomUUID(), type: "message_deleted", username: config.username, color: config.avatarColor, timestamp: Date.now() }]);
  }, [config]);

  const editMessage = useCallback(async (messageId: string, newText: string) => {
    if (!config) return;
    const msg = messagesRef.current.find((m) => m.id === messageId);
    if (!msg || msg.username !== config.username) return;

    // Check if message has expired client-side
    const twoHoursMs = 2 * 60 * 60 * 1000;
    if (Date.now() - msg.timestamp > twoHoursMs) return;

    const fullText = msg.replyTo
      ? `[reply:${msg.replyTo.messageId}:${msg.replyTo.username}:${msg.replyTo.preview}]${newText}`
      : newText;
    const { encrypted, iv } = await workerEncrypt(fullText, config.password, config.roomId);
    // Optimistic update
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text: newText } : m)));

    if (sessionTokenRef.current) {
      // Server-side validated edit via edge function
      const { error } = await supabase.functions.invoke("edit-message", {
        body: { message_id: messageId, session_token: sessionTokenRef.current, encrypted_blob: encrypted, iv },
      });
      if (error) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text: msg.text } : m)));
      }
    } else {
      // Fallback direct edit (legacy)
      const { error } = await supabase.from("messages").update({ encrypted_blob: encrypted, iv }).eq("id", messageId);
      if (error) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text: msg.text } : m)));
        return;
      }
      await supabase.from("rooms").update({ last_message_at: new Date().toISOString() }).eq("room_id", config.roomId);
    }
  }, [config]);

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!config) return;
    const existing = messagesRef.current.find((m) => m.id === messageId);
    const existingReaction = existing?.reactions.find((r) => r.emoji === emoji && r.senderName === config.username);
    if (existingReaction) {
      await supabase.from("reactions").delete().eq("id", existingReaction.id);
    } else {
      await supabase.from("reactions").insert({ message_id: messageId, room_id: config.roomId, emoji, sender_name: config.username });
    }
  }, [config]);

  const togglePin = useCallback(async (messageId: string) => {
    if (!config) return;
    const msg = messagesRef.current.find((m) => m.id === messageId);
    if (!msg) return;
    if (msg.isPinned) {
      await supabase.from("messages").update({ is_pinned: false }).eq("id", messageId);
    } else {
      const currentPinned = messagesRef.current.find((m) => m.isPinned);
      if (currentPinned) await supabase.from("messages").update({ is_pinned: false }).eq("id", currentPinned.id);
      await supabase.from("messages").update({ is_pinned: true }).eq("id", messageId);
    }
  }, [config]);

  const markAsRead = useCallback(async (messageId: string) => {
    if (!config) return;
    const msg = messagesRef.current.find((m) => m.id === messageId);
    if (!msg || msg.isOwn || msg.readBy.includes(config.username)) return;
    await supabase.from("read_receipts").insert({ message_id: messageId, room_id: config.roomId, reader_name: config.username }).select().maybeSingle();
  }, [config]);

  const recordMediaView = useCallback(async (mediaUrl: string) => {
    if (!config) return;
    const { data: existing } = await supabase.from("media_views").select("id").eq("media_url", mediaUrl).maybeSingle();
    if (!existing) {
      await supabase.from("media_views").insert({ media_url: mediaUrl, room_id: config.roomId });
      supabase.functions.invoke("delete-media", { body: { media_url: mediaUrl, room_id: config.roomId } });
    }
  }, [config]);

  // Heartbeat
  useEffect(() => {
    if (!presenceIdRef.current || !config) return;
    const interval = setInterval(() => {
      if (!presenceIdRef.current) { clearInterval(interval); return; }
      supabase.from("presence").update({ last_seen: new Date().toISOString() }).eq("id", presenceIdRef.current).then();
    }, 20000);
    return () => clearInterval(interval);
  }, [isConnected, config]);

  // Visibility + focus
  useEffect(() => {
    if (!config) return;
    const restorePresence = () => {
      const ch = channelRef.current;
      if (!ch) return;
      ch.track({ username: config.username, color: config.avatarColor, online: true, joined_at: Date.now() });
    };
    const handleVisibility = () => {
      const ch = channelRef.current;
      if (!ch) return;
      if (document.visibilityState === "hidden") ch.untrack();
      else if (document.visibilityState === "visible") restorePresence();
    };
    const handleFocus = () => restorePresence();
    const cleanup = () => {
      if (presenceIdRef.current) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/presence?id=eq.${presenceIdRef.current}`;
        const headers = {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal',
        };
        try { fetch(url, { method: 'DELETE', headers, keepalive: true }); } catch {}
      }
      channelRef.current?.untrack();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("beforeunload", cleanup);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("beforeunload", cleanup);
    };
  }, [config]);

  const reportScreenshot = useCallback(() => {
    if (!config || !channelRef.current) return;
    channelRef.current.send({ type: "broadcast", event: "screenshot", payload: { username: config.username, color: config.avatarColor } });
    setSystemEvents((prev) => [...prev, { id: crypto.randomUUID(), type: "screenshot", username: config.username, color: config.avatarColor, timestamp: Date.now() }]);
  }, [config]);

  const broadcastMediaSaved = useCallback(() => {
    if (!config || !channelRef.current) return;
    channelRef.current.send({ type: "broadcast", event: "media_saved", payload: { username: config.username, color: config.avatarColor } });
    setSystemEvents((prev) => [...prev, { id: crypto.randomUUID(), type: "media_saved", username: config.username, color: config.avatarColor, timestamp: Date.now() }]);
  }, [config]);

  const kickUser = useCallback(async (targetUsername: string) => {
    if (!config || !channelRef.current || !config.isCreator) return;
    const targetUser = onlineUsers.find((u) => u.username === targetUsername);
    const targetColor = targetUser?.color || "";
    channelRef.current.send({ type: "broadcast", event: "user:kick", payload: { username: targetUsername, by: config.username } });
    await supabase.from("presence").delete().eq("room_id", config.roomId).eq("username", targetUsername);
    setOnlineUsers((prev) => prev.filter((u) => u.username !== targetUsername));
    setSystemEvents((prev) => [...prev, { id: crypto.randomUUID(), type: "leave", username: targetUsername, color: targetColor, timestamp: Date.now() }]);
  }, [config, onlineUsers]);

  const toggleRoomLock = useCallback(async () => {
    if (!config || !channelRef.current || !config.isCreator) return;
    const newLocked = !isRoomLocked;
    setIsRoomLocked(newLocked);
    await supabase.from("rooms").update({ is_locked: newLocked }).eq("room_id", config.roomId);
    channelRef.current.send({ type: "broadcast", event: "room:lock", payload: { locked: newLocked } });
  }, [config, isRoomLocked]);

  return {
    messages, onlineUsers, isConnected, chatEnded, typingUsers, pinnedMessage, systemEvents, roomCreatedAt, isRoomLocked,
    sendMessage, sendTyping, endChat, leaveRoom, deleteMessage, editMessage, addReaction, togglePin, markAsRead,
    recordMediaView, reportScreenshot, broadcastMediaSaved, kickUser, toggleRoomLock,
  };
}
