import { useEffect, useState, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useConnectivity } from "@/hooks/use-connectivity";
import DesktopBlocker from "@/components/DesktopBlocker";
import ConnectionStatusDot from "@/components/ConnectionStatusDot";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Home from "./pages/Home";
import CreateRoom from "./pages/CreateRoom";
import JoinRoom from "./pages/JoinRoom";
import ChatRoom from "./pages/ChatRoom";
import KnowMore from "./pages/KnowMore";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppContent = () => {
  const isMobile = useIsMobile();
  const { status, latency, serverRegion } = useConnectivity();
  const location = useLocation();
  const navigate = useNavigate();
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  // Prevent back button from closing the app on root, and confirm exit on chat rooms
  useEffect(() => {
    const isRootPage = location.pathname === "/" || location.pathname === "";
    const isInRoom = location.pathname.startsWith("/room/");

    // Always push a dummy state to intercept back
    if (isRootPage || isInRoom) {
      window.history.pushState(null, "", window.location.href);
    }

    const handlePopState = (e: PopStateEvent) => {
      if (isInRoom) {
        // Re-push to prevent navigation, show confirmation
        window.history.pushState(null, "", window.location.href);
        setShowLeaveDialog(true);
      } else if (isRootPage) {
        window.history.pushState(null, "", window.location.href);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [location.pathname]);

  const handleConfirmLeave = useCallback(() => {
    setShowLeaveDialog(false);
    // Extract roomId and clean up
    const match = location.pathname.match(/^\/room\/(.+)$/);
    if (match) {
      const roomId = match[1];
      localStorage.removeItem(`room_${roomId}`);
    }
    navigate("/");
  }, [location.pathname, navigate]);

  if (isMobile === false) {
    return <DesktopBlocker />;
  }

  if (isMobile === undefined) {
    return null;
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
