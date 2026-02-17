import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

interface TenorGif {
  id: string;
  title: string;
  preview: string;
  url: string;
}

const GifPicker = ({ onSelect, onClose }: GifPickerProps) => {
  const [search, setSearch] = useState("");
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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

  const fetchGifs = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("tenor-search", {
        body: { query: query || "trending", limit: 30 },
      });
      if (fnError) throw fnError;
      if (data?.results) {
        setGifs(data.results);
      } else {
        setGifs([]);
      }
    } catch (e: any) {
      console.error("GIF search error:", e);
      setError("Could not load GIFs");
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load trending on mount
  useEffect(() => {
    fetchGifs("");
  }, [fetchGifs]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchGifs(search);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, fetchGifs]);

  const handleSelectGif = useCallback(async (gif: TenorGif) => {
    // Download the GIF and create a File from it, then pass the URL for the parent to handle
    onSelect(gif.url);
    onClose();
  }, [onSelect, onClose]);

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full left-0 right-0 mb-1 glass rounded-2xl border border-border/50 overflow-hidden z-[1001] animate-scale-in"
      style={{ maxHeight: "360px", backdropFilter: "blur(20px)" }}
    >
      {/* Search */}
      <div className="p-2 border-b border-border/30">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search GIFs..."
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

      {/* GIF grid */}
      <div className="overflow-y-auto p-2" style={{ maxHeight: "290px" }}>
        {loading && gifs.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground">{error}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Make sure the GIF API is configured</p>
          </div>
        )}

        {!loading && !error && gifs.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-6">No GIFs found</p>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          {gifs.map((gif) => (
            <button
              key={gif.id}
              onClick={() => handleSelectGif(gif)}
              className="rounded-lg overflow-hidden bg-secondary/20 hover:ring-2 hover:ring-primary/50 transition-all active:scale-95 aspect-video"
            >
              <img
                src={gif.preview}
                alt={gif.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>

        {/* Tenor attribution */}
        <div className="flex justify-center py-2 mt-1">
          <p className="text-[9px] text-muted-foreground/40">Powered by Tenor</p>
        </div>
      </div>
    </div>
  );
};

export default GifPicker;
