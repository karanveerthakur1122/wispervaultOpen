import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Copy, Check, Key, User } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { generateRoomId, generatePassword } from "@/lib/crypto";

const AVATAR_COLORS = [
  "hsl(210 100% 60%)", "hsl(280 80% 60%)", "hsl(340 80% 60%)",
  "hsl(160 80% 50%)", "hsl(30 90% 55%)", "hsl(50 90% 50%)",
];

const CreateRoom = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(generatePassword());
  const [roomId] = useState(generateRoomId());
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [copied, setCopied] = useState(false);

  const handleCreate = () => {
    if (!username.trim()) return;
    localStorage.setItem(`room_${roomId}`, JSON.stringify({
      roomId,
      password,
      username: username.trim(),
      avatarColor: selectedColor,
    }));
    navigate(`/room/${roomId}#key=${encodeURIComponent(password)}`);
  };

  const handleCopy = async () => {
    const link = `${window.location.origin}/join/${roomId}#key=${encodeURIComponent(password)}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col p-6 relative overflow-hidden">
      <div className="absolute top-1/3 -right-20 w-60 h-60 rounded-full bg-primary/10 blur-[100px]" />

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
          <h1 className="text-2xl font-bold text-foreground">Create Room</h1>
          <p className="text-sm text-muted-foreground">Set up your encrypted chat room</p>
        </div>

        {/* Room ID display */}
        <GlassCard className="p-4 text-center" glow>
          <p className="text-xs text-muted-foreground mb-1">Room ID</p>
          <p className="text-2xl font-mono font-bold tracking-[0.3em] text-foreground">{roomId}</p>
        </GlassCard>

        {/* Username */}
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
          />
        </div>

        {/* Avatar color */}
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

        {/* Password */}
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground flex items-center gap-2">
            <Key className="w-4 h-4" /> Room Password
          </label>
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-xl glass-input border-0 text-foreground font-mono text-xs"
          />
        </div>

        {/* Copy invite link */}
        <motion.div whileTap={{ scale: 0.97 }}>
          <Button
            onClick={handleCopy}
            variant="ghost"
            className="w-full h-12 rounded-xl glass border-0 text-foreground gap-2"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
            {copied ? "Copied!" : "Copy Invite Link"}
          </Button>
        </motion.div>

        {/* Create */}
        <Button
          onClick={handleCreate}
          disabled={!username.trim() || !password.trim()}
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-semibold text-base disabled:opacity-30"
        >
          Create & Enter Room
        </Button>
      </motion.div>
    </div>
  );
};

export default CreateRoom;
