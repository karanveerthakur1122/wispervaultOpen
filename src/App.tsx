import { useEffect } from "react";
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

  // Prevent back button from closing the app — push a dummy history entry on root pages
  useEffect(() => {
    const isRootPage = location.pathname === "/" || location.pathname === "";

    const handlePopState = (e: PopStateEvent) => {
      if (isRootPage) {
        // Push state again to prevent app from closing
        window.history.pushState(null, "", window.location.href);
      }
    };

    if (isRootPage) {
      window.history.pushState(null, "", window.location.href);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [location.pathname]);

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
