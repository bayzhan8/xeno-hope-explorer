import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Bridge from "./pages/Bridge";
import NotFound from "./pages/NotFound";
import { BRIDGE_FEATURE_FLAG_ENABLED } from "./components/ModeNav";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          {/* Bridge Therapy is feature-flagged so we can ship the route to
              production *before* the Supabase data sweep finishes. Set
              VITE_FEATURE_BRIDGE=true (e.g. in Vercel env) to expose. */}
          {BRIDGE_FEATURE_FLAG_ENABLED && (
            <Route path="/bridge" element={<Bridge />} />
          )}
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
