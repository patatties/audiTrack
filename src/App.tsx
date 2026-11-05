import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard.tsx";
import Board from "./pages/Board.tsx";
import Clients from "./pages/Clients.tsx";
import Controls from "./pages/Controls.tsx";
import Remediation from "./pages/Remediation.tsx";
import Notes from "./pages/Notes.tsx";
import Solutions from "./pages/Solutions.tsx";
import KnowledgeBase from "./pages/KnowledgeBase.tsx";
import Backup from "./pages/Backup.tsx";
import NotFound from "./pages/NotFound.tsx";
import FindingDetail from "./pages/FindingDetail.tsx";
import RemediationDetail from "./pages/RemediationDetail.tsx";
import ControlDetail from "./pages/ControlDetail.tsx";
import SolutionDetail from "./pages/SolutionDetail.tsx";
import NoteDetail from "./pages/NoteDetail.tsx";
import Setup from "./pages/Setup.tsx";
import SetupGate from "@/components/SetupGate";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route element={<SetupGate><AppLayout /></SetupGate>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/board" element={<Board />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/controls" element={<Controls />} />
            <Route path="/remediation" element={<Remediation />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/solutions" element={<Solutions />} />
            <Route path="/knowledge" element={<KnowledgeBase />} />
            <Route path="/backup" element={<Backup />} />
            <Route path="/findings/:id" element={<FindingDetail />} />
            <Route path="/remediation/:id" element={<RemediationDetail />} />
            <Route path="/controls/:id" element={<ControlDetail />} />
            <Route path="/solutions/:id" element={<SolutionDetail />} />
            <Route path="/notes/:id" element={<NoteDetail />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
