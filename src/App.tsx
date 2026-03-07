import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useConnectivity } from "@/hooks/use-connectivity";
import DesktopBlocker from "@/components/DesktopBlocker";
import ConnectionBlockedOverlay from "@/components/ConnectionBlockedOverlay";
import ConnectionStatusDot from "@/components/ConnectionStatusDot";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import Home from "./pages/Home";
import CreateRoom from "./pages/CreateRoom";
import JoinRoom from "./pages/JoinRoom";
import ChatRoom from "./pages/ChatRoom";
import KnowMore from "./pages/KnowMore";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppContent = () => {
  const isMobile = useIsMobile();
  const { status, retry, latency, serverRegion } = useConnectivity();
  const wasEverBlocked = status === "blocked" || (status === "checking" && sessionStorage.getItem("was_blocked") === "1");

  // Track if user was ever blocked this session
  if (status === "blocked") sessionStorage.setItem("was_blocked", "1");
  if (status === "connected") sessionStorage.removeItem("was_blocked");

  // Show desktop blocker on non-mobile
  if (isMobile === false) {
    return <DesktopBlocker />;
  }

  // Wait for initial detection only
  if (isMobile === undefined || (status === "checking" && !wasEverBlocked)) {
    return null;
  }

  // Show connection blocked overlay (keep it during retry too)
  if (status === "blocked" || (status === "checking" && wasEverBlocked)) {
    return <ConnectionBlockedOverlay onRetry={retry} checkingStatus={status} />;
  }

  return (
    <>
      <ConnectionStatusDot status={status} latency={latency} serverRegion={serverRegion} />
      <PwaInstallBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateRoom />} />
        <Route path="/join/:roomId" element={<JoinRoom />} />
        <Route path="/room/:roomId" element={<ChatRoom />} />
        <Route path="/know-more" element={<KnowMore />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
