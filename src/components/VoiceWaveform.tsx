import { useRef, useEffect, useState, useCallback } from "react";
import { Play, Pause } from "lucide-react";

// ─── Live Recording Waveform (uses AnalyserNode from MediaStream) ────────────

interface RecordingWaveformProps {
  stream: MediaStream | null;
}

export function RecordingWaveform({ stream }: RecordingWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      if (!canvasRef.current) return;
      analyser.getByteFrequencyData(dataArray);

      const canvas = canvasRef.current;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const barCount = Math.min(bufferLength, 24);
      const barWidth = w / barCount - 2;
      const centerY = h / 2;

      for (let i = 0; i < barCount; i++) {
        const v = dataArray[i] / 255;
        const barHeight = Math.max(3, v * centerY);
        const x = i * (barWidth + 2);

        ctx.fillStyle = `hsl(var(--primary) / ${0.4 + v * 0.6})`;
        ctx.beginPath();
        ctx.roundRect(x, centerY - barHeight, barWidth, barHeight * 2, 2);
        ctx.fill();
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      source.disconnect();
      audioCtx.close();
    };
  }, [stream]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={32}
      className="flex-1 max-w-[160px] h-8 opacity-90"
    />
  );
}

// ─── Playback Waveform (custom player, no download) ──────────────────────────

interface PlaybackWaveformProps {
  src: string;
  isOwn?: boolean;
}

export function PlaybackWaveform({ src, isOwn }: PlaybackWaveformProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bars, setBars] = useState<number[]>([]);
  const animRef = useRef<number>(0);

  // Generate pseudo-random waveform bars from audio data
  useEffect(() => {
    const generateBars = () => {
      const count = 32;
      const result: number[] = [];
      // Generate aesthetically pleasing random bars
      for (let i = 0; i < count; i++) {
        const base = 0.3 + Math.random() * 0.7;
        // Create a slight arc shape
        const pos = i / count;
        const envelope = Math.sin(pos * Math.PI) * 0.4 + 0.6;
        result.push(base * envelope);
      }
      setBars(result);
    };
    generateBars();
  }, [src]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = src;
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setProgress(0);
    });

    return () => {
      audio.pause();
      audio.src = "";
      cancelAnimationFrame(animRef.current);
    };
  }, [src]);

  // Progress animation loop
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(animRef.current);
      return;
    }
    const tick = () => {
      const audio = audioRef.current;
      if (audio && audio.duration) {
        setProgress(audio.currentTime / audio.duration);
      }
      animRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying]);

  // Draw waveform bars
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const barWidth = w / bars.length - 1.5;
    const centerY = h / 2;

    bars.forEach((v, i) => {
      const x = i * (barWidth + 1.5);
      const barHeight = Math.max(2, v * centerY * 0.9);
      const barProgress = i / bars.length;

      if (barProgress <= progress) {
        ctx.fillStyle = isOwn
          ? "hsl(var(--primary-foreground) / 0.9)"
          : "hsl(var(--primary) / 0.9)";
      } else {
        ctx.fillStyle = isOwn
          ? "hsl(var(--primary-foreground) / 0.3)"
          : "hsl(var(--muted-foreground) / 0.3)";
      }

      ctx.beginPath();
      ctx.roundRect(x, centerY - barHeight, barWidth, barHeight * 2, 1);
      ctx.fill();
    });
  }, [bars, progress, isOwn]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !audio.duration) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    audio.currentTime = pct * audio.duration;
    setProgress(pct);
  };

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const currentTime = audioRef.current ? audioRef.current.currentTime : 0;
  const statusLabel = isPlaying ? "Playing" : progress > 0 && progress < 1 ? "Paused" : "";

  return (
    <div className="flex items-center gap-2 min-w-[180px] max-w-[240px]">
      <button
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-90 ${
          isOwn
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "bg-primary/15 text-primary"
        }`}
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-0.5">
        <canvas
          ref={canvasRef}
          width={180}
          height={28}
          className="w-full h-7 cursor-pointer"
          onClick={handleSeek}
        />
        <div className="flex items-center justify-between">
          <span className={`text-[10px] ${isOwn ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
            {isPlaying ? formatTime(currentTime) : formatTime(duration)}
          </span>
          {statusLabel && (
            <span className={`text-[9px] font-medium ${isOwn ? "text-primary-foreground/50" : "text-muted-foreground/70"}`}>
              {statusLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
