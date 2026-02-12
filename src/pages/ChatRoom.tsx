import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, LogOut, Users, Shield, Paperclip, Pin, Smile,
  Check, CheckCheck, X, Image as ImageIcon, Reply
} from "lucide-react";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoom, type DecryptedMessage, type ReplyInfo } from "@/hooks/use-room";
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
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll — only when near bottom
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      const el = scrollContainerRef.current;
      if (el) {
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
        if (nearBottom) {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

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
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!messageInput.trim() && !selectedFile) return;
    haptic.medium();
    await sendMessage(messageInput.trim(), selectedFile || undefined, replyTo || undefined);
    setMessageInput("");
    setSelectedFile(null);
    setReplyTo(null);
  }, [messageInput, selectedFile, replyTo, sendMessage]);

  const handleReply = useCallback((msg: DecryptedMessage) => {
    haptic.light();
    setReplyTo({
      messageId: msg.id,
      username: msg.username,
      preview: msg.text.slice(0, 50),
    });
    inputRef.current?.focus();
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setMessageInput(value);
    if (value.trim()) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => sendTyping(), 300);
    }
  }, [sendTyping]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  }, []);

  const scrollToMessage = useCallback((msgId: string) => {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const clearOverlays = useCallback(() => {
    setActiveReactionMsg(null);
    setShowContextMenu(null);
  }, []);

  const username = roomConfig?.username ?? "";

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
        <div
          className="glass border-b border-border/50 px-4 py-2 flex items-center gap-2 cursor-pointer"
          onClick={() => scrollToMessage(pinnedMessage.id)}
        >
          <Pin className="w-3 h-3 text-primary rotate-45" />
          <p className="text-xs text-muted-foreground truncate flex-1">
            <span className="font-medium text-foreground">{pinnedMessage.username}: </span>
            {pinnedMessage.text}
          </p>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 overscroll-contain"
        onClick={clearOverlays}
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

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            username={username}
            activeReactionMsg={activeReactionMsg}
            showContextMenu={showContextMenu}
            onReaction={addReaction}
            onSetActiveReaction={setActiveReactionMsg}
            onSetContextMenu={setShowContextMenu}
            onPin={togglePin}
            onDelete={deleteMessage}
            onMediaView={recordMediaView}
            onlineUserCount={onlineUsers.length}
            onReply={handleReply}
            onScrollToMessage={scrollToMessage}
          />
        ))}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground animate-fade-in">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
            {typingUsers.join(", ")} typing...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

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

      {/* Reply preview */}
      {replyTo && (
        <div className="glass border-t border-border/50 px-4 py-2 flex items-center gap-2">
          <Reply className="w-4 h-4 text-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary">{replyTo.username}</p>
            <p className="text-xs text-muted-foreground truncate">{replyTo.preview}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="glass border-t border-border/50 p-3">
        <div className="flex gap-2 items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 rounded-full text-muted-foreground active:scale-90 transition-transform"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Input
            ref={inputRef}
            value={messageInput}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={replyTo ? `Reply to ${replyTo.username}...` : "Type a message..."}
            className="flex-1 h-11 rounded-full glass-input border-0 text-foreground placeholder:text-muted-foreground/50 px-4"
          />
          <Button
            onClick={handleSend}
            disabled={!messageInput.trim() && !selectedFile}
            size="icon"
            className="h-11 w-11 rounded-full bg-primary text-primary-foreground disabled:opacity-30 active:scale-90 transition-transform"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Optimized Message Bubble ────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: DecryptedMessage;
  username: string;
  activeReactionMsg: string | null;
  showContextMenu: string | null;
  onReaction: (messageId: string, emoji: string) => void;
  onSetActiveReaction: (id: string | null) => void;
  onSetContextMenu: (id: string | null) => void;
  onPin: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  onMediaView: (mediaUrl: string) => void;
  onlineUserCount: number;
  onReply: (msg: DecryptedMessage) => void;
  onScrollToMessage: (msgId: string) => void;
}

const MessageBubble = memo(({
  msg, username, activeReactionMsg, showContextMenu,
  onReaction, onSetActiveReaction, onSetContextMenu,
  onPin, onDelete, onMediaView, onlineUserCount, onReply, onScrollToMessage,
}: MessageBubbleProps) => {
  const [mediaObjectUrl, setMediaObjectUrl] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [showReadBy, setShowReadBy] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const swipingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isShowingReactions = activeReactionMsg === msg.id;
  const isShowingContext = showContextMenu === msg.id;

  const handleMediaClick = useCallback(async () => {
    if (!msg.mediaUrl || !msg.mediaType || mediaObjectUrl) return;
    setLoadingMedia(true);
    onMediaView(msg.mediaUrl);

    try {
      const parsed = JSON.parse(msg.mediaUrl);
      const { data } = await supabase.storage.from("encrypted-media").download(parsed.path);
      if (data) {
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
  }, [msg.mediaUrl, msg.mediaType, mediaObjectUrl, onMediaView]);

  useEffect(() => {
    return () => {
      if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl);
    };
  }, [mediaObjectUrl]);

  // Native touch handlers for swipe-to-reply (GPU-accelerated, no framer-motion overhead)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    swipingRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;

    // Lock direction after 10px movement
    if (!swipingRef.current && Math.abs(dx) > 10) {
      if (Math.abs(dx) > Math.abs(dy)) {
        swipingRef.current = true;
      } else {
        touchStartRef.current = null;
        return;
      }
    }

    if (swipingRef.current) {
      // Clamp: own messages swipe left, others swipe right
      const maxSwipe = 80;
      let clamped: number;
      if (msg.isOwn) {
        clamped = Math.max(-maxSwipe, Math.min(0, dx));
      } else {
        clamped = Math.max(0, Math.min(maxSwipe, dx));
      }
      // Apply with requestAnimationFrame for smoothness
      if (containerRef.current) {
        containerRef.current.style.transform = `translateX(${clamped}px)`;
      }
      setSwipeOffset(clamped);
    }
  }, [msg.isOwn]);

  const handleTouchEnd = useCallback(() => {
    if (swipingRef.current && Math.abs(swipeOffset) > 50) {
      haptic.light();
      onReply(msg);
    }
    // Animate back with CSS transition
    if (containerRef.current) {
      containerRef.current.style.transition = "transform 0.2s ease-out";
      containerRef.current.style.transform = "translateX(0)";
      setTimeout(() => {
        if (containerRef.current) containerRef.current.style.transition = "";
      }, 200);
    }
    setSwipeOffset(0);
    touchStartRef.current = null;
    swipingRef.current = false;
  }, [swipeOffset, msg, onReply]);

  // Group reactions by emoji — memoized
  const groupedReactions = useMemo(() => {
    return msg.reactions.reduce((acc, r) => {
      acc[r.emoji] = acc[r.emoji] || { emoji: r.emoji, count: 0, names: [] as string[] };
      acc[r.emoji].count++;
      acc[r.emoji].names.push(r.senderName);
      return acc;
    }, {} as Record<string, { emoji: string; count: number; names: string[] }>);
  }, [msg.reactions]);

  const isRead = msg.readBy.length > 0;
  const allRead = msg.readBy.length >= onlineUserCount - 1 && onlineUserCount > 1;
  const replyIconOpacity = Math.min(1, Math.abs(swipeOffset) / 40);

  return (
    <div
      data-msg-id={msg.id}
      className={`flex ${msg.isOwn ? "justify-end" : "justify-start"} relative`}
      onDoubleClick={(e) => { e.stopPropagation(); onSetActiveReaction(isShowingReactions ? null : msg.id); }}
    >
      {/* Reply swipe icon */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 transition-opacity ${msg.isOwn ? "left-0 -ml-8" : "right-0 -mr-8"}`}
        style={{ opacity: replyIconOpacity }}
      >
        <Reply className="w-4 h-4 text-muted-foreground" />
      </div>

      <div
        ref={containerRef}
        className="max-w-[80%] relative will-change-transform"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
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
          onClick={(e) => { e.stopPropagation(); onSetContextMenu(isShowingContext ? null : msg.id); }}
        >
          {msg.isPinned && (
            <Pin className="w-3 h-3 text-primary absolute -top-1 -right-1 rotate-45" />
          )}

          {/* Reply quote */}
          {msg.replyTo && (
            <div
              className={`mb-2 border-l-2 border-primary/50 pl-2 py-1 rounded-r cursor-pointer ${
                msg.isOwn ? "bg-primary-foreground/10" : "bg-secondary/30"
              }`}
              onClick={(e) => { e.stopPropagation(); onScrollToMessage(msg.replyTo!.messageId); }}
            >
              <p className="text-[10px] font-medium text-primary">{msg.replyTo.username}</p>
              <p className={`text-xs truncate ${msg.isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {msg.replyTo.preview}
              </p>
            </div>
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
                onClick={(e) => { e.stopPropagation(); onReaction(msg.id, r.emoji); }}
                className={`glass rounded-full px-1.5 py-0.5 text-xs flex items-center gap-0.5 ${
                  r.names.includes(username) ? "ring-1 ring-primary/50" : ""
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
        {showReadBy && msg.readBy.length > 0 && (
          <div className="mx-1 mt-0.5">
            <p className="text-[10px] text-muted-foreground/50">
              Seen by {msg.readBy.join(", ")}
            </p>
          </div>
        )}

        {/* Reaction picker */}
        {isShowingReactions && (
          <div
            className={`absolute ${msg.isOwn ? "right-0" : "left-0"} -top-10 glass rounded-full px-2 py-1 flex gap-1 z-20 animate-scale-in`}
            onClick={(e) => e.stopPropagation()}
          >
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onReaction(msg.id, emoji)}
                className="text-lg active:scale-125 transition-transform p-0.5"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Context menu */}
        {isShowingContext && (
          <div
            className={`absolute ${msg.isOwn ? "right-0" : "left-0"} top-full mt-1 glass rounded-xl py-1 z-10 min-w-[140px] animate-scale-in`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { onReply(msg); onSetContextMenu(null); }}
              className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/50 flex items-center gap-2"
            >
              <Reply className="w-3 h-3" /> Reply
            </button>
            <button
              onClick={() => { onSetActiveReaction(msg.id); onSetContextMenu(null); }}
              className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/50 flex items-center gap-2"
            >
              <Smile className="w-3 h-3" /> React
            </button>
            <button
              onClick={() => { onPin(msg.id); onSetContextMenu(null); }}
              className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/50 flex items-center gap-2"
            >
              <Pin className="w-3 h-3" /> {msg.isPinned ? "Unpin" : "Pin"}
            </button>
            {msg.isOwn && (
              <button
                onClick={() => { onDelete(msg.id); onSetContextMenu(null); }}
                className="w-full text-left px-3 py-2 text-xs text-destructive hover:bg-destructive/10 flex items-center gap-2"
              >
                <X className="w-3 h-3" /> Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  // Custom comparison — only re-render when message-relevant props change
  return (
    prev.msg === next.msg &&
    prev.username === next.username &&
    prev.onlineUserCount === next.onlineUserCount &&
    (prev.activeReactionMsg === prev.msg.id) === (next.activeReactionMsg === next.msg.id) &&
    (prev.showContextMenu === prev.msg.id) === (next.showContextMenu === next.msg.id)
  );
});

MessageBubble.displayName = "MessageBubble";

export default ChatRoom;
