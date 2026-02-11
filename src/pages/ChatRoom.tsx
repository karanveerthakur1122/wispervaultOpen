import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, LogOut, Users, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoom, type DecryptedMessage } from "@/hooks/use-room";

const ChatRoom = () => {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const [messageInput, setMessageInput] = useState("");
  const [roomConfig, setRoomConfig] = useState<{
    roomId: string; password: string; username: string; avatarColor: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

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
    messages, onlineUsers, isConnected, chatEnded, typingUsers,
    sendMessage, sendTyping, endChat, deleteMessage,
  } = useRoom(roomConfig);

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

  const handleSend = async () => {
    if (!messageInput.trim()) return;
    await sendMessage(messageInput.trim());
    setMessageInput("");
  };

  const handleInputChange = (value: string) => {
    setMessageInput(value);
    if (value.trim()) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => sendTyping(), 300);
    }
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
        <motion.div whileTap={{ scale: 0.9 }}>
          <Button
            onClick={endChat}
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
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className={`flex ${msg.isOwn ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[80%]`}>
                {!msg.isOwn && (
                  <p className="text-xs font-medium mb-1 ml-1" style={{ color: msg.color }}>
                    {msg.username}
                  </p>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm ${
                    msg.isOwn
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "glass rounded-bl-md text-foreground"
                  }`}
                >
                  {msg.text}
                </div>
                <p className="text-[10px] text-muted-foreground/40 mt-0.5 mx-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </motion.div>
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
      </div>

      {/* Input */}
      <div className="glass border-t border-border/50 p-3">
        <div className="flex gap-2">
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
              disabled={!messageInput.trim()}
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
