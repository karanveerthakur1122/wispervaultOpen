import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, Image as ImageIcon, Mic, Video, Crown,
  Circle, UserX, X, Lock, Unlock, Play, Loader2, Share2,
  Bell, BellOff, Volume2, Vibrate, VolumeX
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { deriveKey, decryptFile } from "@/lib/crypto";
import type { DecryptedMessage } from "@/hooks/use-room";

type MediaTab = "photos" | "videos" | "voice";

/** Decrypts and renders a thumbnail for encrypted media */
const MediaThumbnail = ({ msg, isVideo }: { msg: DecryptedMessage; isVideo: boolean }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [inView, setInView] = useState(false);
  const mountedRef = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Intersection Observer for lazy loading
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || !msg.mediaUrl || !msg.mediaType || objectUrl || failed) return;
    let cancelled = false;
    setLoading(true);
    const decrypt = async () => {
      try {
        const parsed = JSON.parse(msg.mediaUrl!);
        const { data } = await supabase.storage.from("encrypted-media").download(parsed.path);
        if (!data || cancelled) return;
        const roomId = window.location.pathname.split("/").pop();
        const stored = localStorage.getItem(`room_${roomId}`);
        if (!stored) { if (!cancelled) setFailed(true); return; }
        const { password, roomId: rId } = JSON.parse(stored);
        const key = await deriveKey(password, rId);
        const decrypted = await decryptFile(await data.arrayBuffer(), parsed.iv, key, msg.mediaType!);
        if (!cancelled && mountedRef.current) {
          setObjectUrl(URL.createObjectURL(decrypted));
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    decrypt();
    return () => { cancelled = true; };
  }, [inView, msg.mediaUrl, msg.mediaType, objectUrl, failed]);

  useEffect(() => {
    return () => {
      if (objectUrl) {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 500);
      }
    };
  }, [objectUrl]);

  if (loading || !inView) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-muted/20">
        {loading ? <Loader2 className="w-5 h-5 text-muted-foreground/50 animate-spin" /> : null}
      </div>
    );
  }

  if (failed || !objectUrl) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-muted/20">
        {isVideo ? (
          <Video className="w-6 h-6 text-muted-foreground/40" />
        ) : (
          <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
        )}
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="relative w-full h-full bg-black">
        <video
          src={objectUrl}
          className="w-full h-full object-cover"
          muted
          playsInline
          preload="metadata"
          onLoadedData={(e) => {
            const v = e.currentTarget;
            if (v.duration > 0.5) v.currentTime = 0.5;
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-4 h-4 text-foreground fill-foreground ml-0.5" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <img
      src={objectUrl}
      alt="Shared media"
      className="w-full h-full object-cover"
      loading="lazy"
    />
  );
};

interface Props {
  open: boolean;
  onClose: () => void;
  roomId: string;
  onlineUsers: Array<{ username: string; color: string }>;
  messages: DecryptedMessage[];
  isCreator: boolean;
  currentUsername: string;
  onKickUser: (username: string) => void;
  onMediaClick?: (msg: DecryptedMessage) => void;
  isRoomLocked: boolean;
  onToggleLock: () => void;
}

const RoomInfoPanel = ({
  open, onClose, roomId, onlineUsers, messages, isCreator, currentUsername, onKickUser, onMediaClick, isRoomLocked, onToggleLock,
}: Props) => {
  const [mediaTab, setMediaTab] = useState<MediaTab>("photos");
  const [kickTarget, setKickTarget] = useState<string | null>(null);

  // Notification & sound preferences (persisted per room)
  const storageKey = `room_prefs_${roomId}`;
  const getPrefs = () => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch { return {}; }
  };
  const [notificationsOn, setNotificationsOn] = useState(() => getPrefs().notifications !== false);
  const [soundMode, setSoundMode] = useState<"volume" | "vibrate" | "mute">(() => getPrefs().soundMode || "volume");

  const updatePref = useCallback((key: string, value: unknown) => {
    const prefs = { ...getPrefs(), [key]: value };
    localStorage.setItem(storageKey, JSON.stringify(prefs));
  }, [storageKey]);

  const handleToggleNotifications = useCallback(() => {
    setNotificationsOn((prev) => {
      const next = !prev;
      updatePref("notifications", next);
      return next;
    });
  }, [updatePref]);

  const cycleSoundMode = useCallback(() => {
    setSoundMode((prev) => {
      const order: Array<"volume" | "vibrate" | "mute"> = ["volume", "vibrate", "mute"];
      const next = order[(order.indexOf(prev) + 1) % 3];
      updatePref("soundMode", next);
      return next;
    });
  }, [updatePref]);

  const mediaMessages = useMemo(() => {
    return messages.filter((m) => m.mediaUrl && m.mediaType);
  }, [messages]);

  const photoMessages = useMemo(
    () => mediaMessages.filter((m) => m.mediaType?.startsWith("image/")),
    [mediaMessages]
  );
  const videoMessages = useMemo(
    () => mediaMessages.filter((m) => m.mediaType?.startsWith("video/")),
    [mediaMessages]
  );
  const voiceMessages = useMemo(
    () => mediaMessages.filter((m) => m.mediaType?.startsWith("audio/")),
    [mediaMessages]
  );

  const activeMedia = mediaTab === "photos" ? photoMessages : mediaTab === "videos" ? videoMessages : voiceMessages;

  const handleKickConfirm = useCallback(() => {
    if (kickTarget) {
      onKickUser(kickTarget);
      setKickTarget(null);
    }
  }, [kickTarget, onKickUser]);

  const tabs: { key: MediaTab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "photos", label: "Photos", icon: <ImageIcon className="w-4 h-4" />, count: photoMessages.length },
    { key: "videos", label: "Videos", icon: <Video className="w-4 h-4" />, count: videoMessages.length },
    { key: "voice", label: "Voice", icon: <Mic className="w-4 h-4" />, count: voiceMessages.length },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          className="fixed inset-0 z-[2000] bg-background overflow-y-auto"
        >
          {/* Header */}
          <header className="sticky top-0 z-10 glass border-b border-border/50 px-4 py-3 flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-xl text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <p className="text-sm font-semibold text-foreground font-mono tracking-wider">{roomId}</p>
              <p className="text-xs text-muted-foreground">Room Info</p>
            </div>
          </header>

          <div className="p-4 space-y-6">
            {/* Invite Button */}
            <section>
              <Button
                variant="outline"
                className="w-full rounded-xl gap-2 border-border/50 text-foreground"
                onClick={() => {
                  const link = `${window.location.origin}/join/${roomId}`;
                  navigator.clipboard.writeText(link).then(() => {
                    toast({ title: "Link copied!", description: "Share this link to invite others." });
                  }).catch(() => {
                    toast({ title: "Copy failed", description: link, variant: "destructive" });
                  });
                }}
              >
                <Share2 className="w-4 h-4" />
                Copy Invite Link
              </Button>
            </section>

            {/* Lock Room — creator only */}
            {isCreator && (
              <section className="glass rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isRoomLocked ? (
                    <Lock className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Unlock className="w-4 h-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">Lock Room</p>
                    <p className="text-[11px] text-muted-foreground">
                      {isRoomLocked ? "No one can join right now" : "Anyone with the link can join"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isRoomLocked}
                  onCheckedChange={onToggleLock}
                />
              </section>
            )}

            {/* Locked indicator for non-creators */}
            {!isCreator && isRoomLocked && (
              <section className="glass rounded-xl px-4 py-3 flex items-center gap-3">
                <Lock className="w-4 h-4 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Room Locked</p>
                  <p className="text-[11px] text-muted-foreground">The room creator has locked this room</p>
                </div>
              </section>
            )}
            {/* Online Users Section */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="w-4 h-4 text-primary" />
                Members · {onlineUsers.length}
              </div>
              <div className="space-y-1">
                {onlineUsers.map((user) => (
                  <div
                    key={user.username}
                    className="flex items-center justify-between glass rounded-xl px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{ backgroundColor: user.color, color: "hsl(var(--background))" }}
                        >
                          {user.username[0]?.toUpperCase()}
                        </div>
                        <Circle className="absolute -bottom-0.5 -right-0.5 w-3 h-3 text-emerald-500 fill-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                          {user.username}
                          {user.username === currentUsername && (
                            <span className="text-[10px] text-muted-foreground">(you)</span>
                          )}
                        </p>
                        <p className="text-[11px] text-emerald-500">Online</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isCreator && user.username === currentUsername && (
                        <Crown className="w-4 h-4 text-amber-400" />
                      )}
                      {isCreator && user.username !== currentUsername && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setKickTarget(user.username)}
                          className="rounded-lg w-8 h-8 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                        >
                          <UserX className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Shared Media Section */}
            <section className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Shared Media</p>

              {/* Tabs */}
              <div className="flex gap-1 p-1 glass rounded-xl">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setMediaTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                      mediaTab === tab.key
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.count > 0 && (
                      <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Media Grid / List */}
              {activeMedia.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 mx-auto rounded-full bg-muted/30 flex items-center justify-center mb-3">
                    {mediaTab === "photos" ? (
                      <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
                    ) : mediaTab === "videos" ? (
                      <Video className="w-5 h-5 text-muted-foreground/50" />
                    ) : (
                      <Mic className="w-5 h-5 text-muted-foreground/50" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground/50">
                    No {mediaTab} shared yet
                  </p>
                </div>
              ) : mediaTab === "voice" ? (
                <div className="space-y-1.5">
                  {voiceMessages.map((msg) => (
                    <div
                      key={msg.id}
                      onClick={() => onMediaClick?.(msg)}
                      className="flex items-center gap-3 glass rounded-xl px-3 py-2.5 cursor-pointer active:scale-[0.98] transition-transform"
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ backgroundColor: msg.color, color: "hsl(var(--background))" }}
                      >
                        {msg.username[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{msg.username}</p>
                        <p className="text-[10px] text-muted-foreground">🎤 Voice note</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground/50">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                /* Photos/Videos grid with decrypted thumbnails */
                <div className="grid grid-cols-3 gap-1.5">
                  {activeMedia.map((msg) => (
                    <div
                      key={msg.id}
                      onClick={() => onMediaClick?.(msg)}
                      className="aspect-square rounded-xl overflow-hidden cursor-pointer active:scale-[0.96] transition-transform relative group"
                    >
                      <MediaThumbnail msg={msg} isVideo={mediaTab === "videos"} />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-4">
                        <div className="flex items-center gap-1">
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold shrink-0"
                            style={{ backgroundColor: msg.color, color: "hsl(var(--background))" }}
                          >
                            {msg.username[0]?.toUpperCase()}
                          </div>
                          <p className="text-[8px] text-white/80 truncate">{msg.username}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Kick Confirmation Dialog */}
          <AlertDialog open={!!kickTarget} onOpenChange={(o) => !o && setKickTarget(null)}>
            <AlertDialogContent className="glass border-border/50 max-w-[320px] rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-foreground">Kick {kickTarget}?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  This will remove {kickTarget} from the room. They can rejoin with the invite link.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl border-border/50">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleKickConfirm}
                  className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Kick
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RoomInfoPanel;
