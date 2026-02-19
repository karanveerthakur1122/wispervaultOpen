import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Shield,
  Clock,
  Lock,
  Eye,
  Trash2,
  Users,
  MessageSquare,
  Server,
  KeyRound,
} from "lucide-react";

const sections = [
  {
    icon: Lock,
    title: "End-to-End Encryption",
    description:
      "Every message is encrypted on your device before it ever leaves. The encryption key lives only in your room link — our servers never see your plain text. Even we can't read your messages.",
  },
  {
    icon: Clock,
    title: "Message Lifespan — 2 Hours",
    description:
      "Each message automatically self-destructs 2 hours after it's sent. There's no archive, no backup, no way to recover it. Once it's gone, it's gone forever.",
  },
  {
    icon: Trash2,
    title: "Room Expiry — 2 Hours of Inactivity",
    description:
      "If no new messages are sent in a room for 2 hours, the entire room and all its data are permanently deleted from our servers.",
  },
  {
    icon: KeyRound,
    title: "Zero-Knowledge Architecture",
    description:
      "We store only encrypted blobs. The decryption key is part of the room URL fragment (#key=…), which is never sent to the server. Without the key, the data is meaningless.",
  },
  {
    icon: Users,
    title: "Anonymous by Default",
    description:
      "No sign-up, no email, no phone number. You pick a display name when you join — that's it. We have no way to tie your identity to your messages.",
  },
  {
    icon: Eye,
    title: "No Tracking or Analytics",
    description:
      "We don't use cookies, tracking pixels, or third-party analytics. Your conversations are yours alone.",
  },
  {
    icon: MessageSquare,
    title: "How It Works",
    description:
      "1. Create a room — you get a unique Room ID and a secret link.\n2. Share the link with someone you trust.\n3. Chat freely — messages are encrypted and ephemeral.\n4. When you're done, end the chat or let it expire automatically.",
  },
  {
    icon: Server,
    title: "Instant End Chat",
    description:
      "The room creator can end the chat at any time. This immediately deletes all messages, media, presence data, and the room itself from our servers — no waiting for expiry.",
  },
  {
    icon: Shield,
    title: "Media Privacy",
    description:
      "Photos and voice messages are stored temporarily and deleted alongside their messages. Media viewed once triggers a countdown for automatic deletion.",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

const KnowMore = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center p-6 pb-16 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/4 -left-20 w-60 h-60 rounded-full bg-primary/10 blur-[100px]" />
      <div className="absolute bottom-1/4 -right-20 w-60 h-60 rounded-full bg-primary/5 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm space-y-6"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl glass text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">How Phantom Works</h1>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Full transparency — here's exactly what happens with your data and how we keep your conversations private.
        </p>

        {/* Sections */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-4"
        >
          {sections.map((section) => (
            <motion.div
              key={section.title}
              variants={item}
              className="glass rounded-2xl p-4 space-y-2"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <section.icon className="w-4.5 h-4.5 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line pl-12">
                {section.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom note */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/50 pt-2">
          <Shield className="w-3 h-3" />
          <span>Built with privacy as the default</span>
        </div>
      </motion.div>
    </div>
  );
};

export default KnowMore;
