import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Search, X, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";

const MAX_RECENT = 16;
const RECENT_KEY = "wisper_recent_emojis";

const EMOJI_CATEGORIES: { name: string; icon: string; emojis: string[] }[] = [
  {
    name: "Smileys",
    icon: "😀",
    emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩",
      "😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🫡",
      "🤐","🤨","😐","😑","😶","🫥","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴",
      "😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐",
      "😕","🫤","😟","🙁","😮","😯","😲","😳","🥺","🥹","😦","😧","😨","😰","😥","😢",
      "😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀",
      "☠️","💩","🤡","👹","👺","👻","👽","👾","🤖",
    ],
  },
  {
    name: "Gestures",
    icon: "👋",
    emojis: [
      "👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","👌","🤌","🤏","✌️","🤞","🫰",
      "🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","🫵","👍","👎","✊","👊","🤛","🤜",
      "👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🦿","🦵","🦶","👂",
      "🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄","🫦",
    ],
  },
  {
    name: "Hearts",
    icon: "❤️",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞",
      "💓","💗","💖","💘","💝","💟","♥️","🫶","😍","🥰","😘","😻","💑","💏",
    ],
  },
  {
    name: "Animals",
    icon: "🐶",
    emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐸",
      "🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗",
      "🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰","🪲","🪳","🦟","🦗","🕷️",
      "🐙","🐚","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🐘",
    ],
  },
  {
    name: "Food",
    icon: "🍕",
    emojis: [
      "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍",
      "🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🫒","🧄","🧅",
      "🥔","🍠","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩",
      "🍗","🍖","🦴","🌭","🍔","🍟","🍕","🫓","🥪","🥙","🧆","🌮","🌯","🫔","🥗",
    ],
  },
  {
    name: "Objects",
    icon: "💡",
    emojis: [
      "⌚","📱","💻","⌨️","🖥️","🖨️","🖱️","🖲️","🕹️","🗜️","💽","💾","💿","📀","📼",
      "📷","📸","📹","🎥","📽️","🎞️","📞","☎️","📟","📠","📺","📻","🎙️","🎚️","🎛️",
      "🧭","⏱️","⏲️","⏰","🕰️","⌛","⏳","📡","🔋","🪫","🔌","💡","🔦","🕯️","🧯",
      "💰","💵","💴","💶","💷","🪙","💸","💳","🧾","💎","⚖️","🪜","🧰","🪛","🔧",
    ],
  },
  {
    name: "Symbols",
    icon: "✨",
    emojis: [
      "✨","🔥","💥","⭐","🌟","✡️","☮️","✝️","☪️","🕉️","☯️","🔯","🕎","☸️",
      "♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","⛎","🔀","🔁",
      "🔂","▶️","⏩","⏭️","⏯️","◀️","⏪","⏮️","🔼","⏫","🔽","⏬","⏸️","⏹️","⏺️",
      "⏏️","🎦","🔅","🔆","📶","🛜","📳","📴","♀️","♂️","⚧️","✖️","➕","➖","➗",
      "🟰","♾️","‼️","⁉️","❓","❔","❕","❗","〰️","💱","💲","⚕️","♻️","⚜️","🔱",
      "📛","🔰","⭕","✅","☑️","✔️","❌","❎","➰","➿","〽️","✳️","✴️","❇️","©️","®️","™️",
      "🏳️","🏴","🏁","🚩","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️",
      "💯","🆒","🆕","🆓","🆙","🆗","🆘","🔟","🔢","🔣","🔤",
    ],
  },
  {
    name: "Flags",
    icon: "🏁",
    emojis: [
      "🏳️","🏴","🏁","🚩","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️",
      "🇺🇸","🇬🇧","🇫🇷","🇩🇪","🇮🇹","🇪🇸","🇵🇹","🇧🇷","🇲🇽","🇨🇦",
      "🇦🇺","🇯🇵","🇰🇷","🇨🇳","🇮🇳","🇷🇺","🇹🇷","🇸🇦","🇿🇦","🇳🇬",
      "🇪🇬","🇰🇪","🇦🇷","🇨🇱","🇨🇴","🇵🇪","🇻🇪","🇵🇰","🇧🇩","🇮🇩",
      "🇹🇭","🇻🇳","🇵🇭","🇲🇾","🇸🇬","🇦🇪","🇮🇱","🇳🇱","🇧🇪","🇨🇭",
      "🇦🇹","🇸🇪","🇳🇴","🇩🇰","🇫🇮","🇵🇱","🇺🇦","🇬🇷","🇮🇪","🇳🇿",
    ],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

// Reusable emoji button — uses touchend for mobile so keyboard never steals focus
const EmojiBtn = ({ emoji, onSelect }: { emoji: string; onSelect: (e: string) => void }) => {
  const handleTouch = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(emoji);
  }, [emoji, onSelect]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(emoji);
  }, [emoji, onSelect]);

  return (
    <button
      onTouchEnd={handleTouch}
      onMouseDown={handleMouseDown}
      className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-secondary/40 active:scale-110 transition-transform select-none"
    >
      {emoji}
    </button>
  );
};

const EmojiPicker = ({ onSelect, onClose }: EmojiPickerProps) => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(0);
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close on outside pointer-down (not touchend, to avoid conflicts with emoji taps)
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use pointerdown for desktop, touchstart for mobile
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [onClose]);

  const handleSelect = useCallback((emoji: string) => {
    // Update recent
    setRecentEmojis((prev) => {
      const updated = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, MAX_RECENT);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
    onSelect(emoji);
  }, [onSelect]);

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return null;
    const all: string[] = [];
    EMOJI_CATEGORIES.forEach((cat) => all.push(...cat.emojis));
    return [...new Set(all)];
  }, [search]);

  // Tabs: Recent (if any) + categories
  const tabs = useMemo(() => {
    const base = EMOJI_CATEGORIES.map((c, i) => ({ name: c.name, icon: c.icon, index: i }));
    return base;
  }, []);

  const showRecent = recentEmojis.length > 0 && !search;

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full left-0 right-0 mb-1 glass rounded-2xl border border-border/50 overflow-hidden z-[1001] animate-scale-in"
      style={{ maxHeight: "340px", backdropFilter: "blur(20px)" }}
      // Prevent any touch from propagating up and triggering the input focus
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* Search */}
      <div className="p-2 border-b border-border/30">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emoji..."
            className="h-8 pl-8 pr-8 text-xs rounded-lg border-0 bg-secondary/30"
          />
          {search && (
            <button
              onMouseDown={(e) => { e.preventDefault(); setSearch(""); }}
              onTouchEnd={(e) => { e.preventDefault(); setSearch(""); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="flex px-1 py-1 gap-0.5 border-b border-border/30 overflow-x-auto scrollbar-none">
          {/* Recent tab */}
          {showRecent && (
            <button
              onMouseDown={(e) => { e.preventDefault(); setActiveCategory(-1); }}
              onTouchEnd={(e) => { e.preventDefault(); setActiveCategory(-1); }}
              className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors ${
                activeCategory === -1 ? "bg-primary/20" : "hover:bg-secondary/30"
              }`}
              title="Recently used"
            >
              <Clock className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          {tabs.map((cat) => (
            <button
              key={cat.name}
              onMouseDown={(e) => { e.preventDefault(); setActiveCategory(cat.index); }}
              onTouchEnd={(e) => { e.preventDefault(); setActiveCategory(cat.index); }}
              className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors ${
                activeCategory === cat.index ? "bg-primary/20" : "hover:bg-secondary/30"
              }`}
              title={cat.name}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="overflow-y-auto p-2" style={{ maxHeight: "240px" }}>
        {search ? (
          <>
            <p className="text-[10px] text-muted-foreground/60 font-medium px-1 mb-1">
              All emojis
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {(filteredEmojis || []).map((emoji, i) => (
                <EmojiBtn key={`s-${emoji}-${i}`} emoji={emoji} onSelect={handleSelect} />
              ))}
            </div>
          </>
        ) : activeCategory === -1 && showRecent ? (
          <>
            <p className="text-[10px] text-muted-foreground/60 font-medium px-1 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Recently used
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {recentEmojis.map((emoji, i) => (
                <EmojiBtn key={`r-${emoji}-${i}`} emoji={emoji} onSelect={handleSelect} />
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-[10px] text-muted-foreground/60 font-medium px-1 mb-1">
              {EMOJI_CATEGORIES[activeCategory]?.name}
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {(EMOJI_CATEGORIES[activeCategory]?.emojis ?? []).map((emoji, i) => (
                <EmojiBtn key={`c-${emoji}-${i}`} emoji={emoji} onSelect={handleSelect} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EmojiPicker;
