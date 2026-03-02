import { ConnectivityStatus } from "@/hooks/use-connectivity";
import { Wifi, WifiOff } from "lucide-react";

interface Props {
  status: ConnectivityStatus;
}

const ConnectionStatusDot = ({ status }: Props) => {
  if (status === "checking") return null;

  return (
    <div className="fixed top-3 right-3 z-50">
      <div className="flex items-center gap-1.5 glass rounded-full px-2.5 py-1.5">
        <div className="relative">
          <div
            className={`w-2 h-2 rounded-full ${
              status === "connected"
                ? "bg-primary"
                : "bg-destructive"
            }`}
          />
          {status === "connected" && (
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-primary animate-ping opacity-40" />
          )}
        </div>
        {status === "blocked" ? (
          <WifiOff className="w-3 h-3 text-destructive" />
        ) : (
          <Wifi className="w-3 h-3 text-primary" />
        )}
      </div>
    </div>
  );
};

export default ConnectionStatusDot;
