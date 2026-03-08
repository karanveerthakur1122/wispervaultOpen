import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import RoomInfoPanel from "@/components/RoomInfoPanel";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Send, LogOut, Users, Shield, Paperclip, Pin, Smile,
  Check, CheckCheck, X, Image as ImageIcon, Reply, ZoomIn, Pencil, Mic, Square, Loader2, Trash2, Download, Pause, Play, RotateCcw, WifiOff, Lock, Unlock
} from "lucide-react";
import { useConnectivity, type ConnectivityStatus } from "@/hooks/use-connectivity";
import SignalBars from "@/components/SignalBars";
import EmojiPicker from "@/components/EmojiPicker";
import { haptic } from "@/lib/haptics";
import { compressMedia } from "@/lib/media-compress";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { RecordingWaveform, PlaybackWaveform } from "@/components/VoiceWaveform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoom, type DecryptedMessage, type ReplyInfo, type SystemEvent } from "@/hooks/use-room";
import { supabase } from "@/integrations/supabase/client";
import { workerDecryptFile } from "@/lib/crypto-worker-api";
import { deriveKey } from "@/lib/crypto";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const QUICK_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

// ─── Chat Header ─────────────────────────────────────────────────────────────
interface ChatHeaderProps {
  roomId: string;
  onlineUsers: Array<{ username: string; color: string }>;
  isConnected: boolean;
  connLatency: number | null;
  connStatus: ConnectivityStatus;
  isCreator: boolean;
  roomCreatedAt: string | null;
  isRoomLocked: boolean;
  onShowRoomInfo: () => void;
  onEndChat: () => Promise<void>;
  onLeaveRoom: () => Promise<void>;
  headerRef: React.RefObject<HTMLElement>;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  isEndingChat: boolean;
  setIsEndingChat: (v: boolean) => void;
}

const ChatHeader = memo(({
  roomId, onlineUsers, isConnected, connLatency, connStatus, isCreator,
  roomCreatedAt, isRoomLocked, onShowRoomInfo, onEndChat, onLeaveRoom,
  headerRef, onTouchStart, onTouchMove, onTouchEnd, isEndingChat, setIsEndingChat,
}: ChatHeaderProps) => {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!roomCreatedAt) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(roomCreatedAt).getTime()) / 1000));
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(
        h > 0
          ? `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`
          : `${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`
      );
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [roomCreatedAt]);

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 right-0 z-[1000] glass border-b border-border/50 px-4 py-3 flex items-center justify-between select-none"
      style={{ backdropFilter: 'blur(20px)', willChange: 'transform' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center">
          <span className="text-sm font-bold text-primary">{onlineUsers.length}</span>
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <button onClick={onShowRoomInfo} className="text-sm font-semibold text-foreground font-mono tracking-wider hover:text-primary transition-colors active:scale-95">
              {roomId}
            </button>
            {isRoomLocked && <Lock className="w-3.5 h-3.5 text-amber-400" />}
            <SignalBars latency={connLatency} status={connStatus} size="sm" />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="w-3 h-3" /> {onlineUsers.length} online
            {!isConnected && <span className="text-destructive ml-1">· connecting...</span>}
          </p>
          {roomCreatedAt && (
            <p className="text-[10px] text-muted-foreground/50 font-mono flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Live {elapsed}
              <span className="mx-0.5">·</span>
              {new Date(roomCreatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
            </p>
          )}
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
              onClick={isCreator ? async () => { setIsEndingChat(true); await onEndChat(); } : onLeaveRoom}
              className={`rounded-xl ${isCreator ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}
            >
              {isCreator ? "End Chat" : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
});
ChatHeader.displayName = "ChatHeader";

// ─── Chat Input ──────────────────────────────────────────────────────────────
interface ChatInputProps {
  messageInput: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onEmojiSelect: (e: string) => void;
  isSending: boolean;
  selectedFile: File | null;
  filePreviewUrl: string | null;
  replyTo: ReplyInfo | null;
  onClearFile: () => void;
  onClearReply: () => void;
  showEmojiPicker: boolean;
  onToggleEmoji: () => void;
  onCloseEmoji: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  voiceRecorder: ReturnType<typeof useVoiceRecorder>;
  onVoiceFinish: () => void;
  onVoicePreviewSend: () => void;
}

const ChatInput = memo(({
  messageInput, onInputChange, onSend, onFileSelect, onPaste, onEmojiSelect,
  isSending, selectedFile, filePreviewUrl, replyTo, onClearFile, onClearReply,
  showEmojiPicker, onToggleEmoji, onCloseEmoji, inputRef, fileInputRef,
  voiceRecorder, onVoiceFinish, onVoicePreviewSend,
}: ChatInputProps) => {
  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="fixed left-0 right-0 bottom-0 z-[1000]">
      {/* File preview */}
      {selectedFile && (
        <div className="glass border-t border-border/50 px-4 py-2">
          <div className="flex items-center gap-3">
            {filePreviewUrl && selectedFile.type.startsWith("image/") ? (
              <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-secondary/30">
                <img src={filePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
              </div>
            ) : filePreviewUrl && selectedFile.type.startsWith("video/") ? (
              <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-secondary/30 relative">
                <video src={filePreviewUrl} className="w-full h-full object-cover" muted />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <span className="text-white text-[10px]">▶</span>
                </div>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-secondary/30 flex items-center justify-center flex-shrink-0">
                <ImageIcon className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground font-medium truncate">{selectedFile.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(0)}KB · {selectedFile.type.split("/")[0]}
              </p>
            </div>
            <button onClick={onClearFile} className="text-muted-foreground p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
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
          <button onClick={onClearReply} className="text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <EmojiPicker onSelect={onEmojiSelect} onClose={onCloseEmoji} />
      )}

      {/* Input bar */}
      <div className="glass border-t border-border/50 p-3 relative" style={{ willChange: 'transform' }}>
        {voiceRecorder.previewUrl ? (
          <div className="flex gap-2 items-center">
            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full text-destructive active:scale-90 transition-transform" onClick={voiceRecorder.discardPreview}>
              <Trash2 className="w-5 h-5" />
            </Button>
            <div className="flex-1 flex flex-col gap-0.5">
              <PlaybackWaveform src={voiceRecorder.previewUrl} isOwn={false} />
              <span className="text-[10px] text-muted-foreground text-center">{formatDuration(voiceRecorder.recordedDuration)}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground active:scale-90 transition-transform" onClick={voiceRecorder.reRecord} title="Re-record">
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button onClick={onVoicePreviewSend} disabled={isSending} size="icon" className="h-11 w-11 rounded-full bg-primary text-primary-foreground active:scale-90 transition-transform">
              {isSending ? <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        ) : voiceRecorder.isRecording ? (
          <div className="flex gap-2 items-center">
            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full text-destructive active:scale-90 transition-transform" onClick={voiceRecorder.cancel}>
              <X className="w-5 h-5" />
            </Button>
            <div className="flex-1 flex items-center gap-3 px-2">
              {voiceRecorder.isPaused ? (
                <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground flex-shrink-0" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse flex-shrink-0" />
              )}
              <RecordingWaveform stream={voiceRecorder.stream} />
              <span className="text-sm font-mono text-foreground flex-shrink-0">{formatDuration(voiceRecorder.duration)}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full text-foreground active:scale-90 transition-transform" onClick={voiceRecorder.isPaused ? voiceRecorder.resume : voiceRecorder.pause}>
              {voiceRecorder.isPaused ? <Play className="w-5 h-5 ml-0.5" /> : <Pause className="w-5 h-5" />}
            </Button>
            <Button onClick={onVoiceFinish} size="icon" className="h-11 w-11 rounded-full bg-primary text-primary-foreground active:scale-90 transition-transform">
              <Check className="w-5 h-5" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-1.5 items-center">
            <Button
              variant="ghost" size="icon"
              className={`h-9 w-9 rounded-full active:scale-90 transition-transform flex-shrink-0 ${showEmojiPicker ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
              onMouseDown={(e) => { e.preventDefault(); inputRef.current?.blur(); onToggleEmoji(); }}
            >
              <Smile className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground active:scale-90 transition-transform flex-shrink-0" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="w-4 h-4" />
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*,image/gif,video/*,audio/*,.pdf,.doc,.docx" className="hidden" onChange={onFileSelect} />
            <Input
              ref={inputRef}
              value={messageInput}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSend()}
              onPaste={onPaste}
              placeholder={replyTo ? `Reply to ${replyTo.username}...` : "Type a message..."}
              className="flex-1 h-11 rounded-full glass-input border-0 text-foreground placeholder:text-muted-foreground/50 px-4"
            />
            {messageInput.trim() || selectedFile ? (
              <Button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onSend} disabled={isSending} size="icon" className="h-11 w-11 rounded-full bg-primary text-primary-foreground disabled:opacity-30 active:scale-90 transition-transform">
                {isSending ? <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            ) : (
              <Button onClick={() => voiceRecorder.start()} disabled={isSending} size="icon" variant="ghost" className="h-11 w-11 rounded-full text-primary active:scale-90 transition-transform">
                <Mic className="w-5 h-5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
ChatInput.displayName = "ChatInput";

// ─── Message Bubble ──────────────────────────────────────────────────────────
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
  onEdit: (messageId: string, newText: string) => void;
  onMediaView: (mediaUrl: string) => void;
  onlineUserCount: number;
  onReply: (msg: DecryptedMessage) => void;
  onScrollToMessage: (msgId: string) => void;
  onLightbox: (url: string, messageId: string, mediaType?: string) => void;
}

const MessageBubble = memo(({
  msg, username, activeReactionMsg, showContextMenu,
  onReaction, onSetActiveReaction, onSetContextMenu,
  onPin, onDelete, onEdit, onMediaView, onlineUserCount, onReply, onScrollToMessage, onLightbox,
}: MessageBubbleProps) => {
  const [mediaObjectUrl, setMediaObjectUrl] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [showReadBy, setShowReadBy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const swipingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const isShowingReactions = activeReactionMsg === msg.id;
  const isShowingContext = showContextMenu === msg.id;

  const decryptMedia = useCallback(async () => {
    if (!msg.mediaUrl || !msg.mediaType || mediaObjectUrl || loadingMedia) return;
    setLoadingMedia(true);
    if (!msg.isOwn) onMediaView(msg.mediaUrl);
    try {
      const parsed = JSON.parse(msg.mediaUrl);
      const { data } = await supabase.storage.from("encrypted-media").download(parsed.path);
      if (data) {
        const roomId = new URL(window.location.href).pathname.split("/").pop();
        const stored = localStorage.getItem(`room_${roomId}`);
        if (stored) {
          const { password, roomId: rId } = JSON.parse(stored);
          const arrayBuf = await data.arrayBuffer();
          const decrypted = await workerDecryptFile(arrayBuf, parsed.iv, password, rId);
          setMediaObjectUrl(URL.createObjectURL(new Blob([decrypted], { type: msg.mediaType! })));
        }
      }
    } catch (e) {
      console.error("Failed to decrypt media:", e);
    }
    setLoadingMedia(false);
  }, [msg.mediaUrl, msg.mediaType, mediaObjectUrl, loadingMedia, onMediaView, msg.isOwn]);

  useEffect(() => {
    if (msg.mediaUrl && msg.mediaType && !mediaObjectUrl && !loadingMedia) decryptMedia();
  }, [msg.mediaUrl, msg.mediaType]); // eslint-disable-line

  useEffect(() => {
    return () => { if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl); };
  }, [mediaObjectUrl]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
    swipingRef.current = false;
    longPressFiredRef.current = false;
    if (containerRef.current) containerRef.current.style.willChange = 'transform';
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      haptic.medium();
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setMenuPos({ x: msg.isOwn ? rect.right : rect.left, y: rect.top });
      onSetActiveReaction(isShowingReactions ? null : msg.id);
    }, 500);
  }, [msg.id, isShowingReactions, onSetActiveReaction, msg.isOwn]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    }
    if (!swipingRef.current && Math.abs(dx) > 10) {
      if (Math.abs(dx) > Math.abs(dy)) swipingRef.current = true;
      else { touchStartRef.current = null; return; }
    }
    if (swipingRef.current) {
      const maxSwipe = 80;
      const clamped = msg.isOwn ? Math.max(-maxSwipe, Math.min(0, dx)) : Math.max(0, Math.min(maxSwipe, dx));
      if (containerRef.current) containerRef.current.style.transform = `translateX(${clamped}px)`;
      setSwipeOffset(clamped);
    }
  }, [msg.isOwn]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    if (longPressFiredRef.current) { longPressFiredRef.current = false; touchStartRef.current = null; swipingRef.current = false; return; }
    if (swipingRef.current && Math.abs(swipeOffset) > 50) { haptic.light(); onReply(msg); }
    if (containerRef.current) {
      containerRef.current.style.transition = "transform 0.2s ease-out";
      containerRef.current.style.transform = "translateX(0)";
      setTimeout(() => { if (containerRef.current) { containerRef.current.style.transition = ""; containerRef.current.style.willChange = ""; } }, 200);
    }
    setSwipeOffset(0); touchStartRef.current = null; swipingRef.current = false;
  }, [swipeOffset, msg, onReply]);

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
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={`absolute top-1/2 -translate-y-1/2 transition-opacity ${msg.isOwn ? "left-0 -ml-8" : "right-0 -mr-8"}`}
        style={{ opacity: replyIconOpacity }}
      >
        <Reply className="w-4 h-4 text-muted-foreground" />
      </div>

      <div ref={containerRef} className="max-w-[80%] relative" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        {!msg.isOwn && <p className="text-xs font-medium mb-1 ml-1" style={{ color: msg.color }}>{msg.username}</p>}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm relative ${
            msg.isOwn ? `bg-primary text-primary-foreground rounded-br-md${msg.pending ? " opacity-70" : ""}` : "bg-secondary/60 border border-border/30 rounded-bl-md text-foreground"
          } ${msg.isPinned ? "ring-1 ring-primary/30" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            if (isShowingContext) onSetContextMenu(null);
            else { setMenuPos({ x: e.clientX, y: e.clientY }); onSetContextMenu(msg.id); }
          }}
        >
          {msg.isPinned && <Pin className="w-3 h-3 text-primary absolute -top-1 -right-1 rotate-45" />}

          {msg.replyTo && (
            <div
              className={`mb-2 border-l-2 border-primary/50 pl-2 py-1 rounded-r cursor-pointer ${msg.isOwn ? "bg-primary-foreground/10" : "bg-secondary/30"}`}
              onClick={(e) => { e.stopPropagation(); onScrollToMessage(msg.replyTo!.messageId); }}
            >
              <p className="text-[10px] font-medium text-primary">{msg.replyTo.username}</p>
              <p className={`text-xs truncate ${msg.isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{msg.replyTo.preview}</p>
            </div>
          )}

          {msg.mediaUrl && msg.mediaType && (
            <div className="mb-2">
              {mediaObjectUrl ? (
                msg.mediaType.startsWith("image/") ? (
                  <div className="relative cursor-pointer group" onClick={(e) => { e.stopPropagation(); onLightbox(mediaObjectUrl, msg.id, msg.mediaType!); }}>
                    <img src={mediaObjectUrl} alt="Encrypted media" className="rounded-lg max-w-full" loading="lazy" />
                    <div className="absolute inset-0 bg-black/0 group-active:bg-black/20 rounded-lg transition-colors flex items-center justify-center">
                      <ZoomIn className="w-6 h-6 text-white opacity-0 group-active:opacity-80 transition-opacity" />
                    </div>
                  </div>
                ) : msg.mediaType.startsWith("video/") ? (
                  <div className="relative cursor-pointer group" onClick={(e) => { e.stopPropagation(); onLightbox(mediaObjectUrl, msg.id, msg.mediaType!); }}>
                    <video src={mediaObjectUrl} className="rounded-lg max-w-full" muted preload="metadata" />
                    <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center group-active:bg-black/50 transition-colors">
                      <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                        <Play className="w-6 h-6 text-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                ) : msg.mediaType.startsWith("audio/") ? (
                  <div className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onLightbox(mediaObjectUrl, msg.id, msg.mediaType!); }}>
                    <PlaybackWaveform src={mediaObjectUrl} isOwn={msg.isOwn} />
                  </div>
                ) : (
                  <a href={mediaObjectUrl} download className="text-primary underline text-xs">Download file</a>
                )
              ) : (
                <button onClick={(e) => { e.stopPropagation(); decryptMedia(); }} className="flex items-center gap-2 text-xs text-primary/70 py-2">
                  <ImageIcon className="w-4 h-4" />
                  {loadingMedia ? "Decrypting..." : "Tap to decrypt media"}
                </button>
              )}
            </div>
          )}

          {msg.text !== "(media)" && (
            isEditing ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={editInputRef} value={editText} onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { if (editText.trim()) onEdit(msg.id, editText.trim()); setIsEditing(false); } if (e.key === "Escape") setIsEditing(false); }}
                  className="flex-1 bg-transparent border-b border-primary-foreground/30 text-sm outline-none py-0.5 min-w-0" autoFocus
                />
                <button onClick={() => { if (editText.trim()) onEdit(msg.id, editText.trim()); setIsEditing(false); }} className="p-1"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setIsEditing(false)} className="p-1"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <span>{msg.text}</span>
            )
          )}
        </div>

        {Object.keys(groupedReactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 ml-1">
            {Object.values(groupedReactions).map((r) => (
              <button key={r.emoji} onClick={(e) => { e.stopPropagation(); onReaction(msg.id, r.emoji); }}
                className={`glass rounded-full px-1.5 py-0.5 text-xs flex items-center gap-0.5 ${r.names.includes(username) ? "ring-1 ring-primary/50" : ""}`}>
                {r.emoji} {r.count > 1 && <span className="text-muted-foreground">{r.count}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 mt-0.5 mx-1 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); if (msg.readBy.length > 0) setShowReadBy(!showReadBy); }}>
          <p className="text-[10px] text-muted-foreground/40">
            {new Date(msg.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
          </p>
          {msg.isOwn && (
            allRead ? <CheckCheck className="w-3 h-3 text-primary" /> :
            isRead ? <CheckCheck className="w-3 h-3 text-muted-foreground/40" /> :
            <Check className="w-3 h-3 text-muted-foreground/40" />
          )}
          {msg.pending && <Loader2 className="w-3 h-3 text-muted-foreground/40 animate-spin" />}
        </div>

        {showReadBy && msg.readBy.length > 0 && (
          <div className="mx-1 mt-0.5"><p className="text-[10px] text-muted-foreground/50">Seen by {msg.readBy.join(", ")}</p></div>
        )}

        {isShowingReactions && menuPos && createPortal(
          <div className="fixed inset-0 z-[99998]" onClick={() => onSetActiveReaction(null)}>
            <div
              style={{ position: 'fixed', top: Math.max(8, menuPos.y - 48), ...(msg.isOwn ? { right: Math.max(8, window.innerWidth - menuPos.x) } : { left: Math.max(8, menuPos.x) }), zIndex: 99999 }}
              className="glass rounded-full px-2 py-1 flex gap-1 animate-scale-in backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
              {QUICK_EMOJIS.map((emoji) => (
                <button key={emoji} onClick={() => { onReaction(msg.id, emoji); onSetActiveReaction(null); }} className="text-lg active:scale-125 transition-transform p-0.5">{emoji}</button>
              ))}
            </div>
          </div>,
          document.getElementById('portal-root')!
        )}

        {isShowingContext && menuPos && createPortal(
          <div className="fixed inset-0 z-[99998]" onClick={() => onSetContextMenu(null)}>
            <div
              style={{ position: 'fixed', top: menuPos.y, ...(msg.isOwn ? { right: Math.max(8, window.innerWidth - menuPos.x) } : { left: Math.max(8, menuPos.x) }), zIndex: 99999 }}
              className="glass rounded-xl py-1 min-w-[140px] animate-scale-in backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => { onReply(msg); onSetContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/50 flex items-center gap-2"><Reply className="w-3 h-3" /> Reply</button>
              <button onClick={() => { onSetActiveReaction(msg.id); onSetContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/50 flex items-center gap-2"><Smile className="w-3 h-3" /> React</button>
              <button onClick={() => { onPin(msg.id); onSetContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/50 flex items-center gap-2"><Pin className="w-3 h-3" /> {msg.isPinned ? "Unpin" : "Pin"}</button>
              {msg.isOwn && !msg.mediaUrl && msg.text !== "(media)" && (
                <button onClick={() => { setEditText(msg.text); setIsEditing(true); onSetContextMenu(null); setTimeout(() => editInputRef.current?.focus(), 50); }} className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/50 flex items-center gap-2"><Pencil className="w-3 h-3" /> Edit</button>
              )}
              {msg.isOwn && (
                <button onClick={() => { onDelete(msg.id); onSetContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs text-destructive hover:bg-destructive/10 flex items-center gap-2"><X className="w-3 h-3" /> Delete</button>
              )}
            </div>
          </div>,
          document.getElementById('portal-root')!
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  return (
    prev.msg === next.msg &&
    prev.username === next.username &&
    prev.onlineUserCount === next.onlineUserCount &&
    (prev.activeReactionMsg === prev.msg.id) === (next.activeReactionMsg === next.msg.id) &&
    (prev.showContextMenu === prev.msg.id) === (next.showContextMenu === next.msg.id)
  );
});
MessageBubble.displayName = "MessageBubble";

// ─── System Event Bubble ─────────────────────────────────────────────────────
const SystemEventBubble = memo(({ evt }: { evt: SystemEvent }) => (
  <div className="flex justify-center my-2">
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-muted-foreground">
      <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: evt.color, color: "hsl(var(--background))" }}>
        {evt.username[0]?.toUpperCase()}
      </div>
      <span>
        <span className="font-medium text-foreground">{evt.username}</span>
        {evt.type === "screenshot" ? " took a screenshot ⚠️" : evt.type === "message_deleted" ? " deleted a message 🗑️" : evt.type === "media_saved" ? " saved a media 💾" : ` has ${evt.type === "join" ? "joined" : "left"}`}
      </span>
    </div>
  </div>
));
SystemEventBubble.displayName = "SystemEventBubble";

// ─── Main ChatRoom ───────────────────────────────────────────────────────────
const ChatRoom = () => {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const [messageInput, setMessageInput] = useState("");
  const [screenBlocked, setScreenBlocked] = useState(false);
  const [roomConfig, setRoomConfig] = useState<{
    roomId: string; password: string; username: string; avatarColor: string; isCreator?: boolean;
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [activeReactionMsg, setActiveReactionMsg] = useState<string | null>(null);
  const [showContextMenu, setShowContextMenu] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);
  const [sendProgress, setSendProgress] = useState<{ stage: string; percent: number } | null>(null);
  const [lightboxData, setLightboxData] = useState<{ url: string; messageId: string; mediaType?: string } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [refreshPull, setRefreshPull] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEndingChat, setIsEndingChat] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(80);
  const headerTouchRef = useRef<{ y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const virtualContentRef = useRef<HTMLDivElement>(null);
  const voiceRecorder = useVoiceRecorder();
  const { status: connStatus, latency: connLatency } = useConnectivity();

  useEffect(() => {
    if (!roomId) return;
    const stored = localStorage.getItem(`room_${roomId}`);
    if (!stored) { navigate(`/join/${roomId}`); return; }
    setRoomConfig(JSON.parse(stored));
  }, [roomId, navigate]);

  const {
    messages, onlineUsers, isConnected, chatEnded, typingUsers, pinnedMessage, systemEvents, roomCreatedAt, isRoomLocked,
    sendMessage, sendTyping, endChat, leaveRoom, deleteMessage, editMessage, addReaction, togglePin, markAsRead, recordMediaView, reportScreenshot, broadcastMediaSaved, kickUser, toggleRoomLock,
  } = useRoom(roomConfig);

  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const isCreator = roomConfig?.isCreator ?? false;

  // Build combined timeline
  const timeline = useMemo(() => {
    type TimelineItem = { type: "message"; data: DecryptedMessage } | { type: "system"; data: SystemEvent };
    const items: TimelineItem[] = [
      ...messages.map((m) => ({ type: "message" as const, data: m })),
      ...systemEvents.map((e) => ({ type: "system" as const, data: e })),
    ];
    items.sort((a, b) => {
      const tA = a.type === "message" ? a.data.timestamp : a.data.timestamp;
      const tB = b.type === "message" ? b.data.timestamp : b.data.timestamp;
      return tA - tB;
    });
    return items;
  }, [messages, systemEvents]);

  // Virtualizer for message list
  const virtualizer = useVirtualizer({
    count: timeline.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 80,
    overscan: 10,
  });

  // Smart auto-scroll: only scroll if user is near the bottom
  const isNearBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const userScrolledUpRef = useRef(false); // true when user manually scrolled away from bottom
  const justSentRef = useRef(false); // force scroll on own send
  const [newMsgCount, setNewMsgCount] = useState(0);
  const hasInitialScrolled = useRef(false);

  const scrollToBottomInternal = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
    userScrolledUpRef.current = false;
  }, []);

  const updateNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distFromBottom < 200;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) {
      userScrolledUpRef.current = false;
      setNewMsgCount(0);
    } else {
      userScrolledUpRef.current = true;
    }
  }, []);

  // Initial scroll to bottom once messages load
  useEffect(() => {
    if (timeline.length > 0 && !hasInitialScrolled.current) {
      hasInitialScrolled.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottomInternal("auto");
          setNewMsgCount(0);
        });
      });
    }
  }, [timeline.length, scrollToBottomInternal]);

  // Keep bottom anchored when message/media height changes (decrypt/load)
  useEffect(() => {
    const contentEl = virtualContentRef.current;
    if (!contentEl) return;
    const ro = new ResizeObserver(() => {
      if (!userScrolledUpRef.current && isNearBottomRef.current) {
        requestAnimationFrame(() => scrollToBottomInternal("auto"));
      }
    });
    ro.observe(contentEl);
    return () => ro.disconnect();
  }, [scrollToBottomInternal]);

  // Handle new messages arriving
  useEffect(() => {
    const addedCount = timeline.length - prevCountRef.current;
    if (addedCount > 0) {
      if (justSentRef.current) {
        justSentRef.current = false;
        requestAnimationFrame(() => scrollToBottomInternal("smooth"));
        setNewMsgCount(0);
      } else if (!userScrolledUpRef.current && isNearBottomRef.current) {
        requestAnimationFrame(() => scrollToBottomInternal("smooth"));
        setNewMsgCount(0);
      } else {
        setNewMsgCount((prev) => prev + addedCount);
      }
    }
    prevCountRef.current = timeline.length;
  }, [timeline.length, scrollToBottomInternal]);

  // Dynamic viewport height
  useEffect(() => {
    const setVh = () => document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    setVh();
    window.addEventListener('resize', setVh);
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const onVVResize = () => {
        document.documentElement.style.setProperty('--vh', `${vv.height * 0.01}px`);
        if (isNearBottomRef.current && !userScrolledUpRef.current) {
          setTimeout(() => scrollToBottomInternal("auto"), 100);
        }
      };
      vv.addEventListener("resize", onVVResize);
      return () => { window.removeEventListener('resize', setVh); vv.removeEventListener("resize", onVVResize); };
    }
    return () => window.removeEventListener('resize', setVh);
  }, [scrollToBottomInternal]);

  useEffect(() => {
    if (chatEnded && roomId) { localStorage.removeItem(`room_${roomId}`); navigate("/"); }
  }, [chatEnded, roomId, navigate]);

  // Intersection Observer for read receipts
  useEffect(() => {
    if (!roomConfig) return;
    observerRef.current = new IntersectionObserver(
      (entries) => { entries.forEach((entry) => { if (entry.isIntersecting) { const msgId = entry.target.getAttribute("data-msg-id"); if (msgId) markAsRead(msgId); } }); },
      { threshold: 0.5 }
    );
    return () => observerRef.current?.disconnect();
  }, [roomConfig, markAsRead]);

  useEffect(() => {
    if (!observerRef.current) return;
    observerRef.current.disconnect();
    document.querySelectorAll("[data-msg-id]").forEach((el) => observerRef.current?.observe(el));
  }, [timeline.length]);

  // Screenshot prevention
  useEffect(() => {
    if (!roomConfig) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const isPrintScreen = e.key === "PrintScreen";
      const isMacScreenshot = e.metaKey && e.shiftKey && ["3", "4", "5", "s", "S"].includes(e.key);
      const isWinSnip = e.ctrlKey && e.shiftKey && (e.key === "s" || e.key === "S");
      if (isPrintScreen || isMacScreenshot || isWinSnip) {
        e.preventDefault(); setScreenBlocked(true); reportScreenshot(); setTimeout(() => setScreenBlocked(false), 1500);
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") setScreenBlocked(true);
      else setTimeout(() => setScreenBlocked(false), 400);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { document.removeEventListener("keydown", handleKeyDown); document.removeEventListener("visibilitychange", handleVisibility); };
  }, [roomConfig, reportScreenshot]);

  const [isSending, setIsSending] = useState(false);

  const handleSend = useCallback(async () => {
    if ((!messageInput.trim() && !selectedFile) || isSending) return;
    setIsSending(true);
    haptic.medium();
    const textToSend = messageInput.trim();
    setSendProgress({ stage: "compressing", percent: 5 });
    setMessageInput("");
    const currentFile = selectedFile;
    const currentReply = replyTo;
    setSelectedFile(null); setFilePreviewUrl(null); setReplyTo(null);
    // Force scroll to bottom on own send
    justSentRef.current = true;
    try {
      let fileToSend: File | undefined = currentFile || undefined;
      if (fileToSend) {
        setSendProgress({ stage: "compressing", percent: 15 });
        fileToSend = await compressMedia(fileToSend);
        setSendProgress({ stage: "encrypting", percent: 30 });
      }
      await sendMessage(textToSend, fileToSend, currentReply || undefined, (stage, percent) => setSendProgress({ stage, percent }));
    } finally {
      setIsSending(false); setSendProgress(null);
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    }
  }, [messageInput, selectedFile, replyTo, sendMessage, isSending]);

  const handleVoiceFinish = useCallback(async () => { await voiceRecorder.finishRecording(); }, [voiceRecorder]);

  const handleVoicePreviewSend = useCallback(async () => {
    const file = voiceRecorder.sendPreview();
    if (!file) return;
    setIsSending(true);
    justSentRef.current = true;
    setSendProgress({ stage: "encrypting", percent: 10 });
    try {
      await sendMessage("🎤 Voice message", file, replyTo || undefined, (stage, percent) => setSendProgress({ stage, percent }));
      voiceRecorder.discardPreview();
    } finally {
      setIsSending(false); setSendProgress(null); setReplyTo(null);
    }
  }, [voiceRecorder, sendMessage, replyTo]);

  const handleReply = useCallback((msg: DecryptedMessage) => {
    haptic.light();
    setReplyTo({ messageId: msg.id, username: msg.username, preview: msg.text.slice(0, 50) });
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
    if (file) {
      setSelectedFile(file);
      if (file.type.startsWith("image/") || file.type.startsWith("video/")) setFilePreviewUrl(URL.createObjectURL(file));
      else setFilePreviewUrl(null);
    }
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const ext = file.type.split("/")[1] || "png";
          const named = new File([file], `pasted-image.${ext}`, { type: file.type, lastModified: Date.now() });
          setSelectedFile(named); setFilePreviewUrl(URL.createObjectURL(named));
        }
        return;
      }
    }
  }, []);

  const handleEmojiSelect = useCallback((emoji: string) => { setMessageInput((prev) => prev + emoji); }, []);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeaderHeight(el.offsetHeight));
    setHeaderHeight(el.offsetHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleHeaderTouchStart = useCallback((e: React.TouchEvent) => { headerTouchRef.current = { y: e.touches[0].clientY }; }, []);
  const handleHeaderTouchMove = useCallback((e: React.TouchEvent) => {
    if (!headerTouchRef.current || isRefreshing) return;
    const dy = e.touches[0].clientY - headerTouchRef.current.y;
    if (dy > 0) setRefreshPull(Math.min(dy, 120));
  }, [isRefreshing]);
  const handleHeaderTouchEnd = useCallback(() => {
    if (refreshPull > 70 && !isRefreshing) { setIsRefreshing(true); haptic.medium(); setTimeout(() => window.location.reload(), 400); }
    else setRefreshPull(0);
    headerTouchRef.current = null;
  }, [refreshPull, isRefreshing]);

  const scrollToMessage = useCallback((msgId: string) => {
    const idx = timeline.findIndex((t) => t.type === "message" && t.data.id === msgId);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' });
  }, [timeline, virtualizer]);

  const clearOverlays = useCallback(() => { setActiveReactionMsg(null); setShowContextMenu(null); }, []);

  const handleMessagesScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    updateNearBottom();
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distFromBottom > 150);
    // Auto-clear new message count when user scrolls back to bottom
    if (distFromBottom < 200) {
      setNewMsgCount(0);
      userScrolledUpRef.current = false;
    }
  }, [updateNearBottom]);

  const scrollToBottom = useCallback(() => {
    virtualizer.scrollToIndex(timeline.length - 1, { align: 'end', behavior: 'smooth' });
    setNewMsgCount(0);
    userScrolledUpRef.current = false;
    isNearBottomRef.current = true;
  }, [virtualizer, timeline.length]);

  const username = roomConfig?.username ?? "";
  if (!roomConfig) return null;

  return (
    <div className="fixed inset-0 overflow-hidden">
      {screenBlocked && (
        <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center">
          <div className="text-center space-y-2">
            <Shield className="w-12 h-12 mx-auto text-destructive animate-pulse" />
            <p className="text-destructive font-bold text-lg">Screenshot Blocked</p>
            <p className="text-muted-foreground text-xs">Screen recording & screenshots are not allowed</p>
          </div>
        </div>
      )}

      {refreshPull > 0 && (
        <div className="fixed left-0 right-0 z-[1001] flex justify-center pointer-events-none transition-transform"
          style={{ top: `${headerHeight}px`, transform: `translateY(${Math.min(refreshPull * 0.5, 50)}px)`, opacity: Math.min(refreshPull / 70, 1) }}>
          <div className={`w-8 h-8 rounded-full bg-primary/20 backdrop-blur flex items-center justify-center ${isRefreshing ? 'animate-spin' : ''}`}>
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
          </div>
        </div>
      )}

      <ChatHeader
        roomId={roomId || ""}
        onlineUsers={onlineUsers}
        isConnected={isConnected}
        connLatency={connLatency}
        connStatus={connStatus}
        isCreator={isCreator}
        roomCreatedAt={roomCreatedAt}
        isRoomLocked={isRoomLocked}
        onShowRoomInfo={() => setShowRoomInfo(true)}
        onEndChat={endChat}
        onLeaveRoom={leaveRoom}
        headerRef={headerRef}
        onTouchStart={handleHeaderTouchStart}
        onTouchMove={handleHeaderTouchMove}
        onTouchEnd={handleHeaderTouchEnd}
        isEndingChat={isEndingChat}
        setIsEndingChat={setIsEndingChat}
      />

      <AnimatePresence>
        {connStatus === "blocked" && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            className="fixed left-0 right-0 z-[999] overflow-hidden" style={{ top: `${headerHeight}px` }}>
            <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-destructive/10 border-b border-destructive/20 backdrop-blur-sm">
              <WifiOff className="w-3 h-3 text-destructive" />
              <p className="text-[11px] text-destructive font-medium">No connection · Messages will sync when back online</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {pinnedMessage && (
        <div className="fixed left-0 right-0 z-[998] glass border-b border-border/50 px-4 py-2 flex items-center gap-2 cursor-pointer"
          style={{ top: connStatus === "blocked" ? `${headerHeight + 28}px` : `${headerHeight}px`, backdropFilter: 'blur(20px)' }}
          onClick={() => scrollToMessage(pinnedMessage.id)}>
          <Pin className="w-3 h-3 text-primary rotate-45" />
          <p className="text-xs text-muted-foreground truncate flex-1">
            <span className="font-medium text-foreground">{pinnedMessage.username}: </span>{pinnedMessage.text}
          </p>
        </div>
      )}

      {/* Virtualized Messages Area */}
      <div
        ref={scrollContainerRef}
        className="fixed left-0 right-0 overflow-y-auto overflow-x-hidden chat-scroll-container"
        style={{
          top: `${headerHeight + (connStatus === "blocked" ? 28 : 0) + (pinnedMessage ? 32 : 0)}px`,
          bottom: '70px',
        }}
        onClick={clearOverlays}
        onScroll={handleMessagesScroll}
      >
        {timeline.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <Shield className="w-10 h-10 mx-auto text-primary/30" />
              <p className="text-muted-foreground/40 text-sm">Messages are end-to-end encrypted.<br />No one outside this room can read them.</p>
            </div>
          </div>
        )}

        <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = timeline[virtualItem.index];
            return (
              <div
                key={item.type === "message" ? item.data.id : `sys-${item.data.id}`}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className="px-4 py-1.5 msg-bubble-wrap"
              >
                {item.type === "system" ? (
                  <SystemEventBubble evt={item.data} />
                ) : (
                  <MessageBubble
                    msg={item.data}
                    username={username}
                    activeReactionMsg={activeReactionMsg}
                    showContextMenu={showContextMenu}
                    onReaction={addReaction}
                    onSetActiveReaction={setActiveReactionMsg}
                    onSetContextMenu={setShowContextMenu}
                    onPin={togglePin}
                    onDelete={deleteMessage}
                    onEdit={editMessage}
                    onMediaView={recordMediaView}
                    onlineUserCount={onlineUsers.length}
                    onReply={handleReply}
                    onScrollToMessage={scrollToMessage}
                    onLightbox={(url, messageId, mediaType) => setLightboxData({ url, messageId, mediaType })}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-2">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
            {typingUsers.join(", ")} typing...
          </div>
        )}
      </div>

      {/* Scroll to bottom FAB with new message count */}
      <AnimatePresence>
        {(showScrollBottom || newMsgCount > 0) && (
          <motion.button initial={{ opacity: 0, scale: 0.8, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: 10 }} transition={{ duration: 0.2 }}
            onClick={scrollToBottom} className="fixed right-4 z-[999] flex items-center gap-2 rounded-full glass border border-border/50 px-3 h-10 text-primary shadow-lg active:scale-95 transition-transform" style={{ bottom: '80px' }}>
            {newMsgCount > 0 && (
              <span className="text-xs font-medium bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {newMsgCount} new
              </span>
            )}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
          </motion.button>
        )}
      </AnimatePresence>

      <ChatInput
        messageInput={messageInput}
        onInputChange={handleInputChange}
        onSend={handleSend}
        onFileSelect={handleFileSelect}
        onPaste={handlePaste}
        onEmojiSelect={handleEmojiSelect}
        isSending={isSending}
        selectedFile={selectedFile}
        filePreviewUrl={filePreviewUrl}
        replyTo={replyTo}
        onClearFile={() => { setSelectedFile(null); if (filePreviewUrl) { URL.revokeObjectURL(filePreviewUrl); setFilePreviewUrl(null); } }}
        onClearReply={() => setReplyTo(null)}
        showEmojiPicker={showEmojiPicker}
        onToggleEmoji={() => setShowEmojiPicker((prev) => !prev)}
        onCloseEmoji={() => setShowEmojiPicker(false)}
        inputRef={inputRef}
        fileInputRef={fileInputRef}
        voiceRecorder={voiceRecorder}
        onVoiceFinish={handleVoiceFinish}
        onVoicePreviewSend={handleVoicePreviewSend}
      />

      {/* Image Lightbox */}
      {lightboxData && createPortal(
        <div className="fixed inset-0 z-[10000] bg-black/95 flex items-center justify-center animate-fade-in" onClick={() => setLightboxData(null)}>
          <div className="absolute top-4 left-4 z-10">
            <button onClick={() => setLightboxData(null)} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur text-white text-sm font-medium active:scale-90 transition-transform">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
              Back
            </button>
          </div>
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm("Saving this media will notify all users in the room. Continue?")) {
                  const a = document.createElement("a"); a.href = lightboxData.url;
                  const ext = lightboxData.mediaType?.startsWith("video/") ? "mp4" : lightboxData.mediaType?.startsWith("audio/") ? "webm" : "jpg";
                  a.download = `media-${Date.now()}.${ext}`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  broadcastMediaSaved();
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/20 backdrop-blur text-white text-sm font-medium active:scale-90 transition-transform"
            >
              <Download className="w-4 h-4" /> Save
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm("Deleting this media will notify all users in the room. Continue?")) {
                  deleteMessage(lightboxData.messageId); setLightboxData(null);
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-destructive/80 backdrop-blur text-white text-sm font-medium active:scale-90 transition-transform"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
            <button onClick={() => setLightboxData(null)} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform">
              <X className="w-5 h-5" />
            </button>
          </div>
          {lightboxData.mediaType?.startsWith("video/") ? (
            <video src={lightboxData.url} controls controlsList="nodownload" disablePictureInPicture autoPlay className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()} />
          ) : lightboxData.mediaType?.startsWith("audio/") ? (
            <div className="glass rounded-2xl p-6 w-[90vw] max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-center mb-4"><div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center"><Mic className="w-8 h-8 text-primary" /></div></div>
              <p className="text-center text-sm text-white/70 mb-4">Voice Note</p>
              <audio src={lightboxData.url} controls controlsList="nodownload" className="w-full" autoPlay />
            </div>
          ) : (
            <img src={lightboxData.url} alt="Full size" className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
          )}
        </div>,
        document.body
      )}

      <AnimatePresence>
        {isEndingChat && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 text-destructive animate-spin" />
            <p className="text-foreground font-medium text-lg">Deleting chat…</p>
            <p className="text-muted-foreground text-sm">Removing all messages and data</p>
          </motion.div>
        )}
      </AnimatePresence>

      <RoomInfoPanel
        open={showRoomInfo} onClose={() => setShowRoomInfo(false)} roomId={roomId || ""}
        onlineUsers={onlineUsers} messages={messages} isCreator={isCreator} currentUsername={username}
        onKickUser={kickUser} isRoomLocked={isRoomLocked} onToggleLock={toggleRoomLock}
        onMediaClick={(msg) => {
          if (msg.mediaUrl) {
            setShowRoomInfo(false);
            scrollToMessage(msg.id);
          }
        }}
      />
    </div>
  );
};

export default ChatRoom;
