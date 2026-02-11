import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Send, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ChatRoom = () => {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Array<{ id: string; text: string; username: string; color: string; timestamp: number }>>([]);
  const [roomData, setRoomData] = useState<{ username: string; avatarColor: string; password: string } | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const stored = localStorage.getItem(`room_${roomId}`);
    if (!stored) {
      navigate(`/join/${roomId}`);
      return;
    }
    setRoomData(JSON.parse(stored));
  }, [roomId, navigate]);

  const handleSend = () => {
    if (!message.trim() || !roomData) return;
    // Placeholder: will be wired to encryption + Supabase in Phase 3-4
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: message,
        username: roomData.username,
        color: roomData.avatarColor,
        timestamp: Date.now(),
      },
    ]);
    setMessage("");
  };

  const handleEndChat = () => {
    if (!roomId) return;
    localStorage.removeItem(`room_${roomId}`);
    navigate("/");
  };

  if (!roomData) return null;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="glass border-b border-border/50 px-4 py-3 flex items-center justify-between safe-area-top">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <div
              className="w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-xs font-bold text-background"
              style={{ backgroundColor: roomData.avatarColor }}
            >
              {roomData.username[0]?.toUpperCase()}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground font-mono tracking-wider">{roomId}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> 1 online
            </p>
          </div>
        </div>
        <motion.div whileTap={{ scale: 0.9 }}>
          <Button
            onClick={handleEndChat}
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl gap-1 text-xs"
          >
            <LogOut className="w-4 h-4" />
            End
          </Button>
        </motion.div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center h-full">
            <p className="text-muted-foreground/40 text-sm text-center">
              Messages are end-to-end encrypted.<br />No one outside this room can read them.
            </p>
          </div>
        )}
        {messages.map((msg) => {
          const isOwn = msg.username === roomData.username;
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[80%] ${isOwn ? "items-end" : "items-start"}`}>
                {!isOwn && (
                  <p className="text-xs font-medium mb-1 ml-1" style={{ color: msg.color }}>
                    {msg.username}
                  </p>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm ${
                    isOwn
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "glass rounded-bl-md text-foreground"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Input */}
      <div className="glass border-t border-border/50 p-3 safe-area-bottom">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            className="flex-1 h-11 rounded-full glass-input border-0 text-foreground placeholder:text-muted-foreground/50 px-4"
          />
          <motion.div whileTap={{ scale: 0.85 }}>
            <Button
              onClick={handleSend}
              disabled={!message.trim()}
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

export default ChatRoom;
