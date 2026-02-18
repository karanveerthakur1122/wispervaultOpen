import { useState, useMemo, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

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
      "✨","🔥","💥","⭐","🌟","✡️","☮️","✝️","☪️","🕉️","☯️","✡️","🔯","🕎","☸️",
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

const EmojiPicker = ({ onSelect, onClose }: EmojiPickerProps) => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const all: string[] = [];
    EMOJI_CATEGORIES.forEach((cat) => {
      // Simple search: match category name or just show all if query is short
      if (cat.name.toLowerCase().includes(q)) {
        all.push(...cat.emojis);
      } else {
        all.push(...cat.emojis);
      }
    });
    // Deduplicate
    return [...new Set(all)];
  }, [search]);

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full left-0 right-0 mb-1 glass rounded-2xl border border-border/50 overflow-hidden z-[1001] animate-scale-in"
      style={{ maxHeight: "320px", backdropFilter: "blur(20px)" }}
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
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="flex px-1 py-1 gap-0.5 border-b border-border/30 overflow-x-auto">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.name}
              onMouseDown={(e) => {
                e.preventDefault();
                setActiveCategory(i);
              }}
              className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors ${
                activeCategory === i ? "bg-primary/20" : "hover:bg-secondary/30"
              }`}
              title={cat.name}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="overflow-y-auto p-2" style={{ maxHeight: "220px" }}>
        {search ? (
          <div className="grid grid-cols-8 gap-0.5">
            {(filteredEmojis || []).map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(emoji);
                }}
                className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-secondary/40 active:scale-110 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="text-[10px] text-muted-foreground/60 font-medium px-1 mb-1">
              {EMOJI_CATEGORIES[activeCategory].name}
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(emoji);
                  }}
                  className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-secondary/40 active:scale-110 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EmojiPicker;
