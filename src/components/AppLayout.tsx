import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, KanbanSquare, Building2, BookMarked, Database, Languages, Library, Loader2, Moon, Settings, Sparkles, StickyNote, BookOpen, Sun, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import AskAIDialog from "./AskAIDialog";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { clearBootstrapCache } from "@/lib/bootstrap";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean };
type NavEntry = NavItem | { divider: true } | { section: string };

const nav: NavEntry[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/clients", label: "Client overview", icon: Building2 },
  { divider: true },
  { section: "Security Management" },
  { to: "/controls", label: "Controls", icon: Library },
  { to: "/solutions", label: "Solutions", icon: BookOpen },
  { divider: true },
  { section: "Audit" },
  { to: "/board", label: "Findings", icon: KanbanSquare },
  { to: "/remediation", label: "Remediation plans", icon: Wrench },
  { divider: true },
  { section: "Quick" },
  { to: "/notes", label: "Notes", icon: StickyNote },
];

export default function AppLayout() {
  const [askOpen, setAskOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const qc = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();

  const translateAll = async () => {
    setTranslating(true);
    try {
      const data = await apiPost("translate-all", {});
      if (!data?.ok) throw new Error(data?.error ?? "Translation failed");
      if (data.translated > 0) {
        clearBootstrapCache();
        qc.invalidateQueries();
        toast.success(`Translated ${data.translated} field${data.translated !== 1 ? "s" : ""} to English`);
      } else {
        toast.info("All fields are already in English");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-card md:flex md:flex-col">
        <div className="flex items-center gap-2 px-6 py-6">
          <img src="/favicon.svg" className="h-9 w-9" alt="audiTrack" />
          <div>
            <div className="text-sm font-semibold leading-tight">audiTrack</div>
            <div className="text-xs text-muted-foreground">Findings tracker</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item, i) => {
            if ("divider" in item) {
              return <div key={`div-${i}`} className="my-2 border-t border-border" />;
            }
            if ("section" in item) {
              return (
                <div key={`sec-${i}`} className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {item.section}
                </div>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary-soft text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="space-y-2 px-3 pb-4 pt-2">
          <button
            type="button"
            onClick={() => setAskOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary/80 px-3 py-2 text-sm font-medium text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" />
            Ask AI
          </button>

          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-52 p-1">
              <button
                type="button"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                {resolvedTheme === "dark"
                  ? <Sun className="h-4 w-4" />
                  : <Moon className="h-4 w-4" />}
                {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
              </button>
              <Separator className="my-1" />
              <button
                type="button"
                onClick={translateAll}
                disabled={translating}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
              >
                {translating
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Languages className="h-4 w-4" />}
                Translate all
              </button>
              <Separator className="my-1" />
              <NavLink
                to="/knowledge"
                onClick={() => setSettingsOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <BookMarked className="h-4 w-4" />
                Manual
              </NavLink>
              <NavLink
                to="/backup"
                onClick={() => setSettingsOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Database className="h-4 w-4" />
                Backup & Restore
              </NavLink>
            </PopoverContent>
          </Popover>

          <div className="px-3 text-xs text-muted-foreground">{__APP_VERSION__}</div>
        </div>
      </aside>
      <AskAIDialog open={askOpen} onOpenChange={setAskOpen} />
      <main className="md:pl-60">
        <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
