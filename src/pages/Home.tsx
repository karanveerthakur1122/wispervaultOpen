import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, LogIn, Shield, Lock, Clock, X, ArrowRight, Globe, Github, Info } from "lucide-react";
import { toast } from "sonner";
import GlassCard from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface RecentRoom {
  roomId: string;
  username: string;
  avatarColor: string;
  password: string;
  isCreator: boolean;
  joinedAt: number;
}

function getRecentRooms(): RecentRoom[] {
  try {
    return JSON.parse(localStorage.getItem("recent_rooms") || "[]");
  } catch {
    return [];
  }
}

function removeRecentRoom(roomId: string) {
  const rooms = getRecentRooms().filter((r) => r.roomId !== roomId);
  localStorage.setItem("recent_rooms", JSON.stringify(rooms));
  return rooms;
}

const Home = () => {
  const navigate = useNavigate();
  const [joinRoomId, setJoinRoomId] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  const [checkingRoom, setCheckingRoom] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<{ roomId: string; password: string } | null>(null);

  // Check for active room session (user pressed back) — validate server-side first
  useEffect(() => {
    const checkActiveSession = async () => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("room_")) {
          try {
            const session = JSON.parse(localStorage.getItem(key) || "");
            if (session?.roomId && session?.password) {
              // Validate room still exists on server before redirecting
              const { data } = await supabase
                .from("rooms")
                .select("room_id")
                .eq("room_id", session.roomId)
                .eq("active", true)
                .maybeSingle();

              if (data) {
                setActiveSession({ roomId: session.roomId, password: session.password });
                navigate(`/room/${session.roomId}#key=${encodeURIComponent(session.password)}`, { replace: true });
                return;
              } else {
                // Room deleted — clean up stale session
                localStorage.removeItem(key);
                const updated = removeRecentRoom(session.roomId);
                setRecentRooms(updated);
                toast("Room expired", {
                  description: `Room ${session.roomId} no longer exists and was removed.`,
                  duration: 4000,
                });
              }
            }
          } catch {}
        }
      }
    };
    checkActiveSession();
  }, [navigate]);

  // Load and validate recent rooms on mount
  useEffect(() => {
    const validate = async () => {
      const rooms = getRecentRooms();
      if (rooms.length === 0) return;

      // Check which rooms still exist
      const { data } = await supabase
        .from("rooms")
        .select("room_id")
        .in("room_id", rooms.map((r) => r.roomId))
        .eq("active", true);

      const activeIds = new Set(data?.map((r) => r.room_id) || []);
      const validRooms = rooms.filter((r) => activeIds.has(r.roomId));
      localStorage.setItem("recent_rooms", JSON.stringify(validRooms));
      setRecentRooms(validRooms);
    };
    validate();
  }, []);

  const handleJoin = () => {
    if (joinRoomId.trim()) {
      navigate(`/join/${joinRoomId.trim().toUpperCase()}`);
    }
  };

  const handleRejoin = async (room: RecentRoom) => {
    setCheckingRoom(room.roomId);
    try {
      const { data } = await supabase
        .from("rooms")
        .select("room_id, active")
        .eq("room_id", room.roomId)
        .eq("active", true)
        .maybeSingle();

      if (!data) {
        // Room no longer exists — remove from recents
        const updated = removeRecentRoom(room.roomId);
        setRecentRooms(updated);
        localStorage.removeItem(`room_${room.roomId}`);
        return;
      }

      // Restore session and navigate
      localStorage.setItem(`room_${room.roomId}`, JSON.stringify({
        roomId: room.roomId,
        password: room.password,
        username: room.username,
        avatarColor: room.avatarColor,
        isCreator: room.isCreator ?? false,
      }));
      navigate(`/room/${room.roomId}#key=${encodeURIComponent(room.password)}`);
    } finally {
      setCheckingRoom(null);
    }
  };

  const handleRemoveRecent = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    const updated = removeRecentRoom(roomId);
    setRecentRooms(updated);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow orbs */}
      <div className="absolute top-1/4 -left-20 w-60 h-60 rounded-full bg-primary/10 blur-[100px]" />
      <div className="absolute bottom-1/4 -right-20 w-60 h-60 rounded-full bg-primary/5 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-sm space-y-8"
      >
        {/* Logo */}
        <div className="text-center space-y-2">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.08, duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-20 h-20 mx-auto rounded-3xl glass glass-glow flex items-center justify-center mb-4"
          >
            <Shield className="w-10 h-10 text-primary" />
          </motion.div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Phantom
          </h1>
          <p className="text-sm text-muted-foreground">
            Encrypted · Ephemeral · Anonymous
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              onClick={() => navigate("/create")}
              className="w-full h-14 rounded-2xl glass glass-glow border-0 text-foreground font-semibold text-base gap-3 hover:bg-primary/20 transition-all"
              variant="ghost"
            >
              <Plus className="w-5 h-5 text-primary" />
              Create Room
            </Button>
          </motion.div>

          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              onClick={() => setShowJoin(!showJoin)}
              className="w-full h-14 rounded-2xl glass border-0 text-foreground font-semibold text-base gap-3 hover:bg-secondary/50 transition-all"
              variant="ghost"
            >
              <LogIn className="w-5 h-5 text-muted-foreground" />
              Join Room
            </Button>
          </motion.div>

          {showJoin && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3"
            >
              <Input
                placeholder="Enter Room ID"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                className="h-12 rounded-xl glass-input border-0 text-center text-lg tracking-widest font-mono text-foreground placeholder:text-muted-foreground/50"
                maxLength={6}
                autoFocus
              />
              <Button
                onClick={handleJoin}
                disabled={!joinRoomId.trim()}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-30"
              >
                Continue
              </Button>
            </motion.div>
          )}
        </div>

        {/* Recent Rooms */}
        <AnimatePresence>
          {recentRooms.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground/60 px-1">
                <Clock className="w-3 h-3" />
                <span>Recent Rooms</span>
              </div>
              <div className="space-y-2">
                {recentRooms.map((room) => (
                  <motion.button
                    key={room.roomId}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleRejoin(room)}
                    disabled={checkingRoom === room.roomId}
                    className="w-full glass rounded-xl px-4 py-3 flex items-center gap-3 text-left hover:bg-secondary/30 transition-all disabled:opacity-50"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: room.avatarColor, color: "hsl(var(--background))" }}
                    >
                      {room.username[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-semibold tracking-wider text-foreground">
                        {room.roomId}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        as {room.username}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleRemoveRecent(e, room.roomId)}
                      className="p-1 text-muted-foreground/40 hover:text-muted-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/50 pt-4">
          <Lock className="w-3 h-3" />
          <span>End-to-end encrypted · Zero knowledge</span>
        </div>
      </motion.div>

      {/* Bottom-left developer credit */}
      <div className="fixed bottom-4 left-4 flex items-center gap-2 text-xs text-muted-foreground/40">
        <span>Developer:</span>
        <a
          href="https://www.karanveerthakur.com.np/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary transition-colors"
          aria-label="Creator website"
        >
          <Globe className="w-4 h-4" />
        </a>
        <a
          href="https://github.com/karanveerthakur1122"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary transition-colors"
          aria-label="GitHub"
        >
          <Github className="w-4 h-4" />
        </a>
      </div>

      {/* Bottom-right know more */}
      <button
        onClick={() => navigate("/know-more")}
        className="fixed bottom-4 right-4 flex items-center gap-1.5 text-xs text-muted-foreground/40 hover:text-primary transition-colors"
      >
        <Info className="w-4 h-4" />
        <span>Know More</span>
      </button>
    </div>
  );
};

export default Home;
