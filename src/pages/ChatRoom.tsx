import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
import {
  Send, LogOut, Users, Shield, Paperclip, Pin, Smile,
  Check, CheckCheck, X, Image as ImageIcon, RefreshCw
} from "lucide-react";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoom, type DecryptedMessage } from "@/hooks/use-room";
import { supabase } from "@/integrations/supabase/client";
import { decryptFile, base64ToBuffer } from "@/lib/crypto";
import { deriveKey } from "@/lib/crypto";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const QUICK_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

const ChatRoom = () => {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const [messageInput, setMessageInput] = useState("");
  const [roomConfig, setRoomConfig] = useState<{
    roomId: string; password: string; username: string; avatarColor: string; isCreator?: boolean;
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeReactionMsg, setActiveReactionMsg] = useState<string | null>(null);
  const [showContextMenu, setShowContextMenu] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pullY = useMotionValue(0);
  const pullOpacity = useTransform(pullY, [0, -60], [0, 1]);
  const pullRotate = useTransform(pullY, [0, -60], [0, -360]);
  const pullHeight = useTransform(pullY, (v: number) => Math.abs(v));

  useEffect(() => {
    if (!roomId) return;
    const stored = localStorage.getItem(`room_${roomId}`);
    if (!stored) {
      navigate(`/join/${roomId}`);
      return;
    }
    setRoomConfig(JSON.parse(stored));
  }, [roomId, navigate]);

  const {
    messages, onlineUsers, isConnected, chatEnded, typingUsers, pinnedMessage,
    sendMessage, sendTyping, endChat, leaveRoom, deleteMessage, addReaction, togglePin, markAsRead, recordMediaView,
  } = useRoom(roomConfig);

  const isCreator = roomConfig?.isCreator ?? false;

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Redirect on chat end
  useEffect(() => {
    if (chatEnded && roomId) {
      localStorage.removeItem(`room_${roomId}`);
      navigate("/");
    }
  }, [chatEnded, roomId, navigate]);

  // Intersection Observer for read receipts
  useEffect(() => {
    if (!roomConfig) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const msgId = entry.target.getAttribute("data-msg-id");
            if (msgId) markAsRead(msgId);
          }
        });
      },
      { threshold: 0.5 }
    );

    return () => observerRef.current?.disconnect();
  }, [roomConfig, markAsRead]);

  // Observe message elements
  useEffect(() => {
    if (!observerRef.current) return;
    observerRef.current.disconnect();
    
    document.querySelectorAll("[data-msg-id]").forEach((el) => {
      observerRef.current?.observe(el);
    });
  }, [messages]);

  // Pull-to-refresh callbacks
  const isAtBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return false;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 10;
  }, []);

  const handlePullEnd = useCallback(async (_: any, info: PanInfo) => {
    if (info.offset.y < -80 && isAtBottom()) {
      setIsRefreshing(true);
      haptic.light();
      await new Promise((r) => setTimeout(r, 800));
      setIsRefreshing(false);
      haptic.light();
    }
    pullY.set(0);
  }, [pullY, isAtBottom]);

  const handleSend = async () => {
    if (!messageInput.trim() && !selectedFile) return;
    haptic.medium();
    await sendMessage(messageInput.trim(), selectedFile || undefined);
    setMessageInput("");
    setSelectedFile(null);
  };

  const handleInputChange = (value: string) => {
    setMessageInput(value);
    if (value.trim()) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => sendTyping(), 300);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const scrollToMessage = (msgId: string) => {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (!roomConfig) return null;

  return (
    <div className="h-[100dvh] flex flex-col">
      {/* Header */}
      <header className="glass border-b border-border/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {onlineUsers.slice(0, 5).map((u) => (
              <div
                key={u.username}
                className="w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: u.color, color: "hsl(var(--background))" }}
              >
                {u.username[0]?.toUpperCase()}
              </div>
            ))}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground font-mono tracking-wider">{roomId}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> {onlineUsers.length} online
              {!isConnected && <span className="text-destructive ml-1">· connecting...</span>}
            </p>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <motion.div whileTap={{ scale: 0.9 }}>
              <Button
                variant="ghost"
                size="sm"
                className={`rounded-xl gap-1 text-xs ${
                  isCreator
                    ? "text-destructive hover:text-destructive hover:bg-destructive/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <LogOut className="w-4 h-4" />
                {isCreator ? "End" : "Leave"}
              </Button>
            </motion.div>
          </AlertDialogTrigger>
          <AlertDialogContent className="glass border-border/50 max-w-[320px] rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-foreground">
                {isCreator ? "End Chat?" : "Leave Room?"}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                {isCreator
                  ? "This will permanently destroy all messages and data for everyone in this room. This cannot be undone."
                  : "You will leave this room. You can rejoin later with the invite link."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl border-border/50">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={isCreator ? endChat : leaveRoom}
                className={`rounded-xl ${
                  isCreator ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""
                }`}
              >
                {isCreator ? "End Chat" : "Leave"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </header>

      {/* Pinned message banner */}
      {pinnedMessage && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="glass border-b border-border/50 px-4 py-2 flex items-center gap-2 cursor-pointer"
          onClick={() => scrollToMessage(pinnedMessage.id)}
        >
          <Pin className="w-3 h-3 text-primary rotate-45" />
          <p className="text-xs text-muted-foreground truncate flex-1">
            <span className="font-medium text-foreground">{pinnedMessage.username}: </span>
            {pinnedMessage.text}
          </p>
        </motion.div>
      )}

      {/* Messages */}
      <motion.div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
        onClick={() => { setActiveReactionMsg(null); setShowContextMenu(null); }}
        onPan={(_, info) => {
          if (isAtBottom() && info.delta.y < 0) {
            pullY.set(Math.max(info.offset.y, -100));
          }
        }}
        onPanEnd={handlePullEnd}
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <Shield className="w-10 h-10 mx-auto text-primary/30" />
              <p className="text-muted-foreground/40 text-sm">
                Messages are end-to-end encrypted.<br />No one outside this room can read them.
              </p>
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              roomConfig={roomConfig}
              activeReactionMsg={activeReactionMsg}
              showContextMenu={showContextMenu}
              onReaction={(emoji) => addReaction(msg.id, emoji)}
              onToggleReactionPicker={() => setActiveReactionMsg(activeReactionMsg === msg.id ? null : msg.id)}
              onContextMenu={() => setShowContextMenu(showContextMenu === msg.id ? null : msg.id)}
              onPin={() => { togglePin(msg.id); setShowContextMenu(null); }}
              onDelete={() => { deleteMessage(msg.id); setShowContextMenu(null); }}
              onMediaView={() => msg.mediaUrl && recordMediaView(msg.mediaUrl)}
              onlineUserCount={onlineUsers.length}
            />
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }}
                />
              ))}
            </div>
            {typingUsers.join(", ")} typing...
          </motion.div>
        )}

        <div ref={messagesEndRef} />

        {/* Pull-up-to-refresh indicator */}
        <motion.div
          style={{ opacity: pullOpacity, height: pullHeight }}
          className="flex items-center justify-center overflow-hidden"
        >
          <motion.div style={{ rotate: pullRotate }}>
            <RefreshCw className={`w-5 h-5 text-primary ${isRefreshing ? "animate-spin" : ""}`} />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* File preview */}
      {selectedFile && (
        <div className="glass border-t border-border/50 px-4 py-2 flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" />
          <span className="text-xs text-muted-foreground truncate flex-1">{selectedFile.name}</span>
          <button onClick={() => setSelectedFile(null)} className="text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="glass border-t border-border/50 p-3">
        <div className="flex gap-2 items-center">
          <motion.div whileTap={{ scale: 0.85 }}>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-full text-muted-foreground"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="w-4 h-4" />
            </Button>
          </motion.div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Input
            value={messageInput}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="flex-1 h-11 rounded-full glass-input border-0 text-foreground placeholder:text-muted-foreground/50 px-4"
          />
          <motion.div whileTap={{ scale: 0.85 }}>
            <Button
              onClick={handleSend}
              disabled={!messageInput.trim() && !selectedFile}
              size="icon"
              className="h-11 w-11 rounded-full bg-primary text-primary-foreground disabled:opacity-30"
            >
              <Send className="w-4 h-4" />
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

// Message bubble component
interface MessageBubbleProps {
  msg: DecryptedMessage;
  roomConfig: { username: string };
  activeReactionMsg: string | null;
  showContextMenu: string | null;
  onReaction: (emoji: string) => void;
  onToggleReactionPicker: () => void;
  onContextMenu: () => void;
  onPin: () => void;
  onDelete: () => void;
  onMediaView: () => void;
  onlineUserCount: number;
}

const MessageBubble = ({
  msg, roomConfig, activeReactionMsg, showContextMenu,
  onReaction, onToggleReactionPicker, onContextMenu,
  onPin, onDelete, onMediaView, onlineUserCount,
}: MessageBubbleProps) => {
  const [mediaObjectUrl, setMediaObjectUrl] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [showReadBy, setShowReadBy] = useState(false);

  const handleMediaClick = async () => {
    if (!msg.mediaUrl || !msg.mediaType || mediaObjectUrl) return;
    setLoadingMedia(true);
    onMediaView();

    try {
      const parsed = JSON.parse(msg.mediaUrl);
      const { data } = await supabase.storage.from("encrypted-media").download(parsed.path);
      if (data) {
        // Get the key from localStorage
        const roomId = new URL(window.location.href).pathname.split("/").pop();
        const stored = localStorage.getItem(`room_${roomId}`);
        if (stored) {
          const { password, roomId: rId } = JSON.parse(stored);
          const key = await deriveKey(password, rId);
          const decrypted = await decryptFile(await data.arrayBuffer(), parsed.iv, key, msg.mediaType!);
          setMediaObjectUrl(URL.createObjectURL(decrypted));
        }
      }
    } catch (e) {
      console.error("Failed to decrypt media:", e);
    }
    setLoadingMedia(false);
  };

  useEffect(() => {
    return () => {
      if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl);
    };
  }, [mediaObjectUrl]);

  // Group reactions by emoji
  const groupedReactions = msg.reactions.reduce((acc, r) => {
    acc[r.emoji] = acc[r.emoji] || { emoji: r.emoji, count: 0, names: [] };
    acc[r.emoji].count++;
    acc[r.emoji].names.push(r.senderName);
    return acc;
  }, {} as Record<string, { emoji: string; count: number; names: string[] }>);

  const isRead = msg.readBy.length > 0;
  const allRead = msg.readBy.length >= onlineUserCount - 1 && onlineUserCount > 1;

  return (
    <motion.div
      data-msg-id={msg.id}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`flex ${msg.isOwn ? "justify-end" : "justify-start"} relative`}
      onDoubleClick={(e) => { e.stopPropagation(); onToggleReactionPicker(); }}
      onTouchEnd={(e) => {
        // Long press for context menu
      }}
    >
      <div className="max-w-[80%] relative">
        {!msg.isOwn && (
          <p className="text-xs font-medium mb-1 ml-1" style={{ color: msg.color }}>
            {msg.username}
          </p>
        )}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm relative ${
            msg.isOwn
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "glass rounded-bl-md text-foreground"
          } ${msg.isPinned ? "ring-1 ring-primary/30" : ""}`}
          onClick={(e) => { e.stopPropagation(); onContextMenu(); }}
        >
          {msg.isPinned && (
            <Pin className="w-3 h-3 text-primary absolute -top-1 -right-1 rotate-45" />
          )}

          {/* Media content */}
          {msg.mediaUrl && msg.mediaType && (
            <div className="mb-2">
              {mediaObjectUrl ? (
                msg.mediaType.startsWith("image/") ? (
                  <img src={mediaObjectUrl} alt="Encrypted media" className="rounded-lg max-w-full" />
                ) : msg.mediaType.startsWith("video/") ? (
                  <video src={mediaObjectUrl} controls className="rounded-lg max-w-full" />
                ) : msg.mediaType.startsWith("audio/") ? (
                  <audio src={mediaObjectUrl} controls className="w-full" />
                ) : (
                  <a href={mediaObjectUrl} download className="text-primary underline text-xs">Download file</a>
                )
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); handleMediaClick(); }}
                  className="flex items-center gap-2 text-xs text-primary/70 py-2"
                >
                  <ImageIcon className="w-4 h-4" />
                  {loadingMedia ? "Decrypting..." : "Tap to decrypt media"}
                </button>
              )}
            </div>
          )}

          {msg.text !== "(media)" && <span>{msg.text}</span>}
        </div>

        {/* Reactions display */}
        {Object.keys(groupedReactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 ml-1">
            {Object.values(groupedReactions).map((r) => (
              <button
                key={r.emoji}
                onClick={(e) => { e.stopPropagation(); onReaction(r.emoji); }}
                className={`glass rounded-full px-1.5 py-0.5 text-xs flex items-center gap-0.5 ${
                  r.names.includes(roomConfig.username) ? "ring-1 ring-primary/50" : ""
                }`}
              >
                {r.emoji} {r.count > 1 && <span className="text-muted-foreground">{r.count}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp + read receipts */}
        <div
          className="flex items-center gap-1 mt-0.5 mx-1 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); if (msg.readBy.length > 0) setShowReadBy(!showReadBy); }}
        >
          <p className="text-[10px] text-muted-foreground/40">
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          {msg.isOwn && (
            allRead ? (
              <CheckCheck className="w-3 h-3 text-primary" />
            ) : isRead ? (
              <CheckCheck className="w-3 h-3 text-muted-foreground/40" />
            ) : (
              <Check className="w-3 h-3 text-muted-foreground/40" />
            )
          )}
        </div>

        {/* Read-by names */}
        <AnimatePresence>
          {showReadBy && msg.readBy.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-1 mt-0.5 overflow-hidden"
            >
              <p className="text-[10px] text-muted-foreground/50">
                Seen by {msg.readBy.join(", ")}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reaction picker */}
        <AnimatePresence>
          {activeReactionMsg === msg.id && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              className={`absolute ${msg.isOwn ? "right-0" : "left-0"} -top-10 glass rounded-full px-2 py-1 flex gap-1 z-20`}
              onClick={(e) => e.stopPropagation()}
            >
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onReaction(emoji)}
                  className="text-lg hover:scale-125 transition-transform p-0.5"
                >
                  {emoji}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Context menu */}
        <AnimatePresence>
          {showContextMenu === msg.id && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`absolute ${msg.isOwn ? "right-0" : "left-0"} top-full mt-1 glass rounded-xl py-1 z-10 min-w-[140px]`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => { onToggleReactionPicker(); onContextMenu(); }}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/50 flex items-center gap-2"
              >
                <Smile className="w-3 h-3" /> React
              </button>
              <button
                onClick={onPin}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/50 flex items-center gap-2"
              >
                <Pin className="w-3 h-3" /> {msg.isPinned ? "Unpin" : "Pin"}
              </button>
              {msg.isOwn && (
                <button
                  onClick={onDelete}
                  className="w-full text-left px-3 py-2 text-xs text-destructive hover:bg-destructive/10 flex items-center gap-2"
                >
                  <X className="w-3 h-3" /> Delete
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ChatRoom;
