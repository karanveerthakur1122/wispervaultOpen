import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Key, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/GlassCard";

const AVATAR_COLORS = [
  "hsl(210 100% 60%)", "hsl(280 80% 60%)", "hsl(340 80% 60%)",
  "hsl(160 80% 50%)", "hsl(30 90% 55%)", "hsl(50 90% 50%)",
];

const JoinRoom = () => {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);

  useEffect(() => {
    // Extract key from URL fragment
    const hash = location.hash;
    const match = hash.match(/key=([^&]+)/);
    if (match) {
      setPassword(decodeURIComponent(match[1]));
    }
  }, [location.hash]);

  const handleJoin = () => {
    if (!username.trim() || !password.trim() || !roomId) return;
    localStorage.setItem(`room_${roomId}`, JSON.stringify({
      roomId,
      password,
      username: username.trim(),
      avatarColor: selectedColor,
    }));
    navigate(`/room/${roomId}#key=${encodeURIComponent(password)}`);
  };

  return (
    <div className="min-h-screen flex flex-col p-6 relative overflow-hidden">
      <div className="absolute bottom-1/3 -left-20 w-60 h-60 rounded-full bg-primary/10 blur-[100px]" />

      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => navigate("/")}
        className="self-start p-2 -ml-2 rounded-xl text-muted-foreground"
      >
        <ArrowLeft className="w-6 h-6" />
      </motion.button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-6"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Join Room</h1>
          <p className="text-sm text-muted-foreground">Enter credentials to join the encrypted chat</p>
        </div>

        <GlassCard className="p-4 text-center" glow>
          <p className="text-xs text-muted-foreground mb-1">Room ID</p>
          <p className="text-2xl font-mono font-bold tracking-[0.3em] text-foreground">{roomId}</p>
        </GlassCard>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground flex items-center gap-2">
            <User className="w-4 h-4" /> Username
          </label>
          <Input
            placeholder="Choose a username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="h-12 rounded-xl glass-input border-0 text-foreground placeholder:text-muted-foreground/50"
            maxLength={20}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Avatar Color</label>
          <div className="flex gap-3">
            {AVATAR_COLORS.map((color) => (
              <motion.button
                key={color}
                whileTap={{ scale: 0.85 }}
                onClick={() => setSelectedColor(color)}
                className="w-10 h-10 rounded-full transition-all"
                style={{
                  backgroundColor: color,
                  boxShadow: selectedColor === color ? `0 0 0 3px hsl(var(--background)), 0 0 0 5px ${color}` : "none",
                }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground flex items-center gap-2">
            <Key className="w-4 h-4" /> Room Password
          </label>
          <Input
            placeholder="Enter room password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-xl glass-input border-0 text-foreground font-mono text-xs placeholder:text-muted-foreground/50 placeholder:font-sans placeholder:text-sm"
            type="password"
          />
        </div>

        <Button
          onClick={handleJoin}
          disabled={!username.trim() || !password.trim()}
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-semibold text-base disabled:opacity-30"
        >
          Join Room
        </Button>
      </motion.div>
    </div>
  );
};

export default JoinRoom;
