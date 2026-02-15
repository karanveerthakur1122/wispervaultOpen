import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, LogOut, Users, Shield, Paperclip, Pin, Smile,
  Check, CheckCheck, X, Image as ImageIcon, Reply, ZoomIn, Pencil, Mic, Square
} from "lucide-react";
import { haptic } from "@/lib/haptics";
import { compressMedia } from "@/lib/media-compress";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { RecordingWaveform, PlaybackWaveform } from "@/components/VoiceWaveform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoom, type DecryptedMessage, type ReplyInfo, type SystemEvent } from "@/hooks/use-room";
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
  const [screenBlocked, setScreenBlocked] = useState(false);
  const [roomConfig, setRoomConfig] = useState<{
    roomId: string; password: string; username: string; avatarColor: string; isCreator?: boolean;
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [activeReactionMsg, setActiveReactionMsg] = useState<string | null>(null);
  const [showContextMenu, setShowContextMenu] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);
  const [sendingText, setSendingText] = useState<string | null>(null);
  const [sendingFilePreview, setSendingFilePreview] = useState<string | null>(null);
  const [sendProgress, setSendProgress] = useState<{ stage: string; percent: number } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const voiceRecorder = useVoiceRecorder();

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };



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
    messages, onlineUsers, isConnected, chatEnded, typingUsers, pinnedMessage, systemEvents,
    sendMessage, sendTyping, endChat, leaveRoom, deleteMessage, editMessage, addReaction, togglePin, markAsRead, recordMediaView, reportScreenshot,
  } = useRoom(roomConfig);

  const isCreator = roomConfig?.isCreator ?? false;

  const handleVoiceSend = useCallback(async () => {
    const file = await voiceRecorder.stop();
    if (!file) return;
    setIsSending(true);
    setSendingText("🎤 Voice message");
    setSendProgress({ stage: "encrypting", percent: 10 });
    try {
      await sendMessage("🎤 Voice message", file, replyTo || undefined, (stage, percent) => {
        setSendProgress({ stage, percent });
      });
    } finally {
      setIsSending(false);
      setSendingText(null);
      setSendProgress(null);
      setReplyTo(null);
    }
  }, [voiceRecorder, sendMessage, replyTo]);

  // Auto-scroll on new messages — always scroll to bottom
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

  // Dynamic viewport height for mobile keyboard stability
  useEffect(() => {
    const setVh = () => {
      document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    };
    setVh();
    window.addEventListener('resize', setVh);

    // Also use visualViewport for more accurate keyboard detection
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const onVVResize = () => {
        document.documentElement.style.setProperty('--vh', `${vv.height * 0.01}px`);
        // Scroll to bottom when keyboard opens
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      };
      vv.addEventListener("resize", onVVResize);
      return () => {
        window.removeEventListener('resize', setVh);
        vv.removeEventListener("resize", onVVResize);
      };
    }

    return () => window.removeEventListener('resize', setVh);
  }, []);

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

  // Screenshot prevention & detection
  useEffect(() => {
    if (!roomConfig) return;

    // Desktop: detect PrintScreen / Cmd+Shift+S / Cmd+Shift+3/4/5
    // Only keyboard shortcuts reliably indicate a screenshot — so only these broadcast
    const handleKeyDown = (e: KeyboardEvent) => {
      const isPrintScreen = e.key === "PrintScreen";
      const isMacScreenshot = e.metaKey && e.shiftKey && ["3", "4", "5", "s", "S"].includes(e.key);
      const isWinSnip = e.ctrlKey && e.shiftKey && (e.key === "s" || e.key === "S");
      if (isPrintScreen || isMacScreenshot || isWinSnip) {
        e.preventDefault();
        setScreenBlocked(true);
        reportScreenshot();
        setTimeout(() => setScreenBlocked(false), 1500);
      }
    };

    // Visual protection only — black screen when app is not in foreground
    // No broadcast here since we can't distinguish screenshots from normal tab switches
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        setScreenBlocked(true);
      } else {
        setTimeout(() => setScreenBlocked(false), 400);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [roomConfig, reportScreenshot]);

  const [isSending, setIsSending] = useState(false);

  const handleSend = useCallback(async () => {
    if ((!messageInput.trim() && !selectedFile) || isSending) return;
    setIsSending(true);
    haptic.medium();

    const textToSend = messageInput.trim();
    setSendingText(textToSend || (selectedFile ? "(media)" : null));
    if (filePreviewUrl && selectedFile?.type.startsWith("image/")) {
      setSendingFilePreview(filePreviewUrl);
    }
    setSendProgress({ stage: "compressing", percent: 5 });

    setMessageInput("");
    const currentFile = selectedFile;
    const currentReply = replyTo;
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setReplyTo(null);

    try {
      let fileToSend: File | undefined = currentFile || undefined;
      if (fileToSend) {
        setSendProgress({ stage: "compressing", percent: 15 });
        fileToSend = await compressMedia(fileToSend);
        setSendProgress({ stage: "encrypting", percent: 30 });
      }
      await sendMessage(textToSend, fileToSend, currentReply || undefined, (stage, percent) => {
        setSendProgress({ stage, percent });
      });
    } finally {
      setIsSending(false);
      setSendingText(null);
      setSendingFilePreview(null);
      setSendProgress(null);
      // Re-focus input to keep keyboard open after send
      requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
    }
  }, [messageInput, selectedFile, replyTo, sendMessage, isSending, filePreviewUrl]);

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
    if (file) {
      setSelectedFile(file);
      // Generate preview for images/videos
      if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
        const url = URL.createObjectURL(file);
        setFilePreviewUrl(url);
      } else {
        setFilePreviewUrl(null);
      }
    }
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
    <div className="relative" style={{ height: 'calc(var(--vh, 1vh) * 100)' }}>
      {/* Screenshot black screen overlay */}
      {screenBlocked && (
        <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center">
          <div className="text-center space-y-2">
            <Shield className="w-12 h-12 mx-auto text-destructive animate-pulse" />
            <p className="text-destructive font-bold text-lg">Screenshot Blocked</p>
            <p className="text-muted-foreground text-xs">Screen recording & screenshots are not allowed</p>
          </div>
        </div>
      )}
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-[1000] glass border-b border-border/50 px-4 py-3 flex items-center justify-between" style={{ backdropFilter: 'blur(20px)' }}>
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

      {/* Pinned message banner — fixed below header */}
      {pinnedMessage && (
        <div
          className="fixed left-0 right-0 z-[999] glass border-b border-border/50 px-4 py-2 flex items-center gap-2 cursor-pointer"
          style={{ top: '60px', backdropFilter: 'blur(20px)' }}
          onClick={() => scrollToMessage(pinnedMessage.id)}
        >
          <Pin className="w-3 h-3 text-primary rotate-45" />
          <p className="text-xs text-muted-foreground truncate flex-1">
            <span className="font-medium text-foreground">{pinnedMessage.username}: </span>
            {pinnedMessage.text}
          </p>
        </div>
      )}

      {/* Scrollable Messages Area — fixed between header and input */}
      <div
        ref={scrollContainerRef}
        className="fixed left-0 right-0 overflow-y-auto overflow-x-hidden p-4 space-y-3 overscroll-contain"
        style={{ top: pinnedMessage ? '92px' : '60px', bottom: '70px' }}
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

        {/* Merged timeline: messages + system events */}
        {(() => {
          // Build combined timeline
          type TimelineItem = 
            | { type: "message"; data: DecryptedMessage }
            | { type: "system"; data: SystemEvent };
          
          const timeline: TimelineItem[] = [
            ...messages.map((m) => ({ type: "message" as const, data: m })),
            ...systemEvents.map((e) => ({ type: "system" as const, data: e })),
          ].sort((a, b) => {
            const tA = a.type === "message" ? a.data.timestamp : a.data.timestamp;
            const tB = b.type === "message" ? b.data.timestamp : b.data.timestamp;
            return tA - tB;
          });

          return timeline.map((item) => {
            if (item.type === "system") {
              const evt = item.data;
              return (
                <div key={`sys-${evt.id}`} className="flex justify-center my-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-muted-foreground">
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                      style={{ backgroundColor: evt.color, color: "hsl(var(--background))" }}
                    >
                      {evt.username[0]?.toUpperCase()}
                    </div>
                    <span>
                      <span className="font-medium text-foreground">{evt.username}</span>
                      {evt.type === "screenshot"
                        ? " took a screenshot ⚠️"
                        : ` has ${evt.type === "join" ? "joined" : "left"}`}
                    </span>
                  </div>
                </div>
              );
            }

            const msg = item.data;
            return (
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
                onEdit={editMessage}
                onMediaView={recordMediaView}
                onlineUserCount={onlineUsers.length}
                onReply={handleReply}
                onScrollToMessage={scrollToMessage}
                onLightbox={setLightboxUrl}
              />
            );
          });
        })()}

        {/* Sending bubble — optimistic preview with progress */}
        {isSending && sendingText !== null && (
          <div className="flex justify-end animate-fade-in">
            <div className="max-w-[80%]">
              <div className="rounded-2xl rounded-br-md px-4 py-2.5 text-sm bg-primary/60 text-primary-foreground relative overflow-hidden">
                {sendingFilePreview && (
                  <div className="mb-2 rounded-lg overflow-hidden opacity-70">
                    <img src={sendingFilePreview} alt="Sending..." className="max-w-full max-h-40 object-cover" />
                  </div>
                )}
                {sendingText !== "(media)" && <span className="opacity-80">{sendingText}</span>}

                {/* Progress bar */}
                {sendProgress && (
                  <div className="mt-2">
                    <div className="h-1 rounded-full bg-primary-foreground/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary-foreground/70 transition-all duration-300 ease-out"
                        style={{ width: `${sendProgress.percent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-primary-foreground/50 mt-1 capitalize">
                      {sendProgress.stage === "done" ? "Sent!" : `${sendProgress.stage}...`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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

      {/* Fixed bottom area: file preview + reply + input */}
      <div className="fixed left-0 right-0 bottom-0 z-[1000]">
      {/* File preview with thumbnail */}
      {selectedFile && (
        <div className="glass border-t border-border/50 px-4 py-2">
          <div className="flex items-center gap-3">
            {/* Thumbnail */}
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
            <button
              onClick={() => {
                setSelectedFile(null);
                if (filePreviewUrl) { URL.revokeObjectURL(filePreviewUrl); setFilePreviewUrl(null); }
              }}
              className="text-muted-foreground p-1"
            >
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
          <button onClick={() => setReplyTo(null)} className="text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="glass border-t border-border/50 p-3">
        {voiceRecorder.isRecording ? (
          /* Voice recording UI */
          <div className="flex gap-2 items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-full text-destructive active:scale-90 transition-transform"
              onClick={voiceRecorder.cancel}
            >
              <X className="w-5 h-5" />
            </Button>
            <div className="flex-1 flex items-center gap-3 px-2">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse flex-shrink-0" />
              <RecordingWaveform stream={voiceRecorder.stream} />
              <span className="text-sm font-mono text-foreground flex-shrink-0">{formatDuration(voiceRecorder.duration)}</span>
            </div>
            <Button
              onClick={handleVoiceSend}
              size="icon"
              className="h-11 w-11 rounded-full bg-primary text-primary-foreground active:scale-90 transition-transform"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        ) : (
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
            {messageInput.trim() || selectedFile ? (
              <Button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleSend}
                disabled={isSending}
                size="icon"
                className="h-11 w-11 rounded-full bg-primary text-primary-foreground disabled:opacity-30 active:scale-90 transition-transform"
              >
                {isSending ? (
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            ) : (
              <Button
                onClick={() => voiceRecorder.start()}
                disabled={isSending}
                size="icon"
                variant="ghost"
                className="h-11 w-11 rounded-full text-primary active:scale-90 transition-transform"
              >
                <Mic className="w-5 h-5" />
              </Button>
            )}
          </div>
        )}
      </div>
      </div>{/* end fixed bottom area */}

      {/* Image Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center animate-fade-in"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={() => setLightboxUrl(null)}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
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
  onEdit: (messageId: string, newText: string) => void;
  onMediaView: (mediaUrl: string) => void;
  onlineUserCount: number;
  onReply: (msg: DecryptedMessage) => void;
  onScrollToMessage: (msgId: string) => void;
  onLightbox: (url: string) => void;
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
    if (!msg.isOwn) {
      onMediaView(msg.mediaUrl);
    }
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
  }, [msg.mediaUrl, msg.mediaType, mediaObjectUrl, loadingMedia, onMediaView, msg.isOwn]);

  // Auto-decrypt media on mount
  useEffect(() => {
    if (msg.mediaUrl && msg.mediaType && !mediaObjectUrl && !loadingMedia) {
      decryptMedia();
    }
  }, [msg.mediaUrl, msg.mediaType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl);
    };
  }, [mediaObjectUrl]);

  // Native touch handlers for swipe-to-reply + long-press-to-react
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    swipingRef.current = false;
    longPressFiredRef.current = false;
    if (containerRef.current) containerRef.current.style.willChange = 'transform';

    // Start long-press timer (500ms)
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      haptic.medium();
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setMenuPos({ x: msg.isOwn ? rect.right : rect.left, y: rect.top });
      onSetActiveReaction(isShowingReactions ? null : msg.id);
    }, 500);
  }, [msg.id, isShowingReactions, onSetActiveReaction]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;

    // Cancel long-press if finger moves
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

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
    // Clear long-press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // If long-press fired, don't process swipe
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      touchStartRef.current = null;
      swipingRef.current = false;
      return;
    }

    if (swipingRef.current && Math.abs(swipeOffset) > 50) {
      haptic.light();
      onReply(msg);
    }
    // Animate back with CSS transition
    if (containerRef.current) {
      containerRef.current.style.transition = "transform 0.2s ease-out";
      containerRef.current.style.transform = "translateX(0)";
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.style.transition = "";
          containerRef.current.style.willChange = "";
        }
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
      className={`flex ${msg.isOwn ? "justify-end" : "justify-start"} relative animate-fade-in`}
      onContextMenu={(e) => e.preventDefault()}
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
        className="max-w-[80%] relative"
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
          onClick={(e) => {
            e.stopPropagation();
            if (isShowingContext) {
              onSetContextMenu(null);
            } else {
              setMenuPos({ x: e.clientX, y: e.clientY });
              onSetContextMenu(msg.id);
            }
          }}
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
                  <div className="relative cursor-pointer group" onClick={(e) => { e.stopPropagation(); onLightbox(mediaObjectUrl); }}>
                    <img src={mediaObjectUrl} alt="Encrypted media" className="rounded-lg max-w-full" />
                    <div className="absolute inset-0 bg-black/0 group-active:bg-black/20 rounded-lg transition-colors flex items-center justify-center">
                      <ZoomIn className="w-6 h-6 text-white opacity-0 group-active:opacity-80 transition-opacity" />
                    </div>
                  </div>
                ) : msg.mediaType.startsWith("video/") ? (
                  <video src={mediaObjectUrl} controls className="rounded-lg max-w-full" />
                ) : msg.mediaType.startsWith("audio/") ? (
                  <PlaybackWaveform src={mediaObjectUrl} isOwn={msg.isOwn} />
                ) : (
                  <a href={mediaObjectUrl} download className="text-primary underline text-xs">Download file</a>
                )
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); decryptMedia(); }}
                  className="flex items-center gap-2 text-xs text-primary/70 py-2"
                >
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
                  ref={editInputRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (editText.trim()) onEdit(msg.id, editText.trim());
                      setIsEditing(false);
                    }
                    if (e.key === "Escape") setIsEditing(false);
                  }}
                  className="flex-1 bg-transparent border-b border-primary-foreground/30 text-sm outline-none py-0.5 min-w-0"
                  autoFocus
                />
                <button
                  onClick={() => { if (editText.trim()) onEdit(msg.id, editText.trim()); setIsEditing(false); }}
                  className="p-1"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setIsEditing(false)} className="p-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <span>{msg.text}</span>
            )
          )}
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

        {/* Reaction picker — rendered via portal to avoid stacking context clipping */}
        {isShowingReactions && menuPos && createPortal(
          <div className="fixed inset-0 z-[99998]" onClick={() => onSetActiveReaction(null)}>
            <div
              style={{
                position: 'fixed',
                top: Math.max(8, menuPos.y - 48),
                ...(msg.isOwn ? { right: Math.max(8, window.innerWidth - menuPos.x) } : { left: Math.max(8, menuPos.x) }),
                zIndex: 99999,
              }}
              className="glass rounded-full px-2 py-1 flex gap-1 animate-scale-in backdrop-blur-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => { onReaction(msg.id, emoji); onSetActiveReaction(null); }}
                  className="text-lg active:scale-125 transition-transform p-0.5"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>,
          document.getElementById('portal-root')!
        )}

        {/* Context menu — rendered via portal to avoid z-index/stacking issues */}
        {isShowingContext && menuPos && createPortal(
          <div className="fixed inset-0 z-[99998]" onClick={() => onSetContextMenu(null)}>
            <div
              style={{
                position: 'fixed',
                top: menuPos.y,
                ...(msg.isOwn ? { right: Math.max(8, window.innerWidth - menuPos.x) } : { left: Math.max(8, menuPos.x) }),
                zIndex: 99999,
              }}
              className="glass rounded-xl py-1 min-w-[140px] animate-scale-in backdrop-blur-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => { onReply(msg); onSetContextMenu(null); }}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/50 flex items-center gap-2"
              >
                <Reply className="w-3 h-3" /> Reply
              </button>
              <button
                onClick={() => {
                  onSetActiveReaction(msg.id);
                  onSetContextMenu(null);
                }}
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
              {msg.isOwn && !msg.mediaUrl && msg.text !== "(media)" && (
                <button
                  onClick={() => { setEditText(msg.text); setIsEditing(true); onSetContextMenu(null); setTimeout(() => editInputRef.current?.focus(), 50); }}
                  className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/50 flex items-center gap-2"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
              {msg.isOwn && (
                <button
                  onClick={() => { onDelete(msg.id); onSetContextMenu(null); }}
                  className="w-full text-left px-3 py-2 text-xs text-destructive hover:bg-destructive/10 flex items-center gap-2"
                >
                  <X className="w-3 h-3" /> Delete
                </button>
              )}
            </div>
          </div>,
          document.getElementById('portal-root')!
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
