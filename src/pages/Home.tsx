import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, LogIn, Shield, Lock } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const Home = () => {
  const navigate = useNavigate();
  const [joinRoomId, setJoinRoomId] = useState("");
  const [showJoin, setShowJoin] = useState(false);

  const handleJoin = () => {
    if (joinRoomId.trim()) {
      navigate(`/join/${joinRoomId.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow orbs */}
      <div className="absolute top-1/4 -left-20 w-60 h-60 rounded-full bg-primary/10 blur-[100px]" />
      <div className="absolute bottom-1/4 -right-20 w-60 h-60 rounded-full bg-primary/5 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, type: "spring" }}
        className="w-full max-w-sm space-y-8"
      >
        {/* Logo */}
        <div className="text-center space-y-2">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
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

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/50 pt-4">
          <Lock className="w-3 h-3" />
          <span>End-to-end encrypted · Zero knowledge</span>
        </div>
      </motion.div>
    </div>
  );
};

export default Home;
