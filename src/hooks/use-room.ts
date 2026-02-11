import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deriveKey, encryptMessage, decryptMessage } from "@/lib/crypto";
import type { Tables } from "@/integrations/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface DecryptedMessage {
  id: string;
  text: string;
  username: string;
  color: string;
  timestamp: number;
  isOwn: boolean;
}

interface RoomConfig {
  roomId: string;
  password: string;
  username: string;
  avatarColor: string;
}

export function useRoom(config: RoomConfig | null) {
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Array<{ username: string; color: string }>>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [chatEnded, setChatEnded] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const keyRef = useRef<CryptoKey | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceIdRef = useRef<string | null>(null);

  // Derive key on mount
  useEffect(() => {
    if (!config) return;
    deriveKey(config.password, config.roomId).then((key) => {
      keyRef.current = key;
    });
  }, [config?.password, config?.roomId]);

  // Create or join room + set up realtime
  useEffect(() => {
    if (!config) return;
    let cancelled = false;

    const setup = async () => {
      // Upsert room
      const { data: existingRoom } = await supabase
        .from("rooms")
        .select("*")
        .eq("room_id", config.roomId)
        .eq("active", true)
        .maybeSingle();

      if (!existingRoom) {
        await supabase.from("rooms").insert({ room_id: config.roomId, user_count: 1 });
      } else {
        if (existingRoom.user_count >= 10) {
          return; // Room full
        }
        await supabase
          .from("rooms")
          .update({ user_count: existingRoom.user_count + 1 })
          .eq("room_id", config.roomId);
      }

      // Add presence
      const { data: presenceData } = await supabase
        .from("presence")
        .insert({
          room_id: config.roomId,
          username: config.username,
          avatar_color: config.avatarColor,
        })
        .select("id")
        .single();

      if (presenceData) {
        presenceIdRef.current = presenceData.id;
      }

      // Load existing messages
      const { data: existingMessages } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", config.roomId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });

      if (existingMessages && keyRef.current) {
        const decrypted = await Promise.all(
          existingMessages.map(async (msg) => {
            try {
              const text = await decryptMessage(msg.encrypted_blob, msg.iv, keyRef.current!);
              return {
                id: msg.id,
                text,
                username: msg.sender_name,
                color: msg.sender_color,
                timestamp: new Date(msg.created_at).getTime(),
                isOwn: msg.sender_name === config.username,
              };
            } catch {
              return null;
            }
          })
        );
        if (!cancelled) {
          setMessages(decrypted.filter(Boolean) as DecryptedMessage[]);
        }
      }

      // Load online users
      const { data: presenceList } = await supabase
        .from("presence")
        .select("username, avatar_color")
        .eq("room_id", config.roomId)
        .eq("is_active", true);

      if (presenceList && !cancelled) {
        setOnlineUsers(presenceList.map((p) => ({ username: p.username, color: p.avatar_color })));
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
              const text = await decryptMessage(msg.encrypted_blob, msg.iv, keyRef.current);
              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, {
                  id: msg.id,
                  text,
                  username: msg.sender_name,
                  color: msg.sender_color,
                  timestamp: new Date(msg.created_at).getTime(),
                  isOwn: msg.sender_name === config.username,
                }];
              });
            } catch {
              // Decryption failed — wrong key
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
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "presence", filter: `room_id=eq.${config.roomId}` },
          async () => {
            const { data } = await supabase
              .from("presence")
              .select("username, avatar_color")
              .eq("room_id", config.roomId)
              .eq("is_active", true);
            if (data) {
              setOnlineUsers(data.map((p) => ({ username: p.username, color: p.avatar_color })));
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
        .subscribe((status) => {
          if (!cancelled) setIsConnected(status === "SUBSCRIBED");
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

  const sendMessage = useCallback(async (text: string) => {
    if (!config || !keyRef.current) return;
    const { encrypted, iv } = await encryptMessage(text, keyRef.current);
    await supabase.from("messages").insert({
      room_id: config.roomId,
      encrypted_blob: encrypted,
      iv,
      sender_name: config.username,
      sender_color: config.avatarColor,
    });
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

    // Broadcast end to all clients
    channelRef.current.send({
      type: "broadcast",
      event: "chat:end",
      payload: {},
    });

    // Delete everything
    await supabase.from("messages").delete().eq("room_id", config.roomId);
    await supabase.from("presence").delete().eq("room_id", config.roomId);
    await supabase.from("rooms").delete().eq("room_id", config.roomId);

    // Clear local
    localStorage.removeItem(`room_${config.roomId}`);
    setChatEnded(true);
  }, [config]);

  const deleteMessage = useCallback(async (messageId: string) => {
    await supabase.from("messages").delete().eq("id", messageId);
  }, []);

  // Cleanup presence on unmount
  useEffect(() => {
    return () => {
      if (presenceIdRef.current) {
        supabase.from("presence").delete().eq("id", presenceIdRef.current);
      }
    };
  }, []);

  return {
    messages,
    onlineUsers,
    isConnected,
    chatEnded,
    typingUsers,
    sendMessage,
    sendTyping,
    endChat,
    deleteMessage,
  };
}
