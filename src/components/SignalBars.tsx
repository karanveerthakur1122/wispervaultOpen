import { ConnectivityStatus } from "@/hooks/use-connectivity";

interface SignalBarsProps {
  latency: number | null;
  status: ConnectivityStatus;
  size?: "sm" | "md";
}

export function getSignalQuality(latency: number | null, status: ConnectivityStatus) {
  if (status === "blocked" || latency === null) return { label: "Offline", bars: 0, color: "text-destructive" };
  if (latency < 150) return { label: "Excellent", bars: 4, color: "text-primary" };
  if (latency < 300) return { label: "Good", bars: 3, color: "text-primary" };
  if (latency < 600) return { label: "Fair", bars: 2, color: "text-yellow-500" };
  return { label: "Poor", bars: 1, color: "text-destructive" };
}

const SignalBars = ({ latency, status, size = "md" }: SignalBarsProps) => {
  const { bars, color } = getSignalQuality(latency, status);
  const heights = size === "sm" ? [3, 5, 7, 9] : [4, 7, 10, 13];
  const barWidth = size === "sm" ? 2 : 3;
  const gap = size === "sm" ? 1 : 1.5;
  const totalHeight = heights[heights.length - 1];

  return (
    <div
      className="flex items-end"
      style={{ gap: `${gap}px`, height: `${totalHeight}px` }}
    >
      {heights.map((h, i) => (
        <div
          key={i}
          className={`rounded-[1px] transition-colors ${
            i < bars
              ? color.replace("text-", "bg-")
              : "bg-muted-foreground/20"
          }`}
          style={{ width: `${barWidth}px`, height: `${h}px` }}
        />
      ))}
    </div>
  );
};

export default SignalBars;
