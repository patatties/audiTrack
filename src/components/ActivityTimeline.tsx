import { useQuery } from "@tanstack/react-query";
import { getBootstrapData } from "@/lib/bootstrap";
import { Card } from "@/components/ui/card";
import { useAllFindings } from "@/lib/queries";
import { Flag, CheckCircle2, MessageSquare, ListPlus, AlertTriangle } from "lucide-react";
import type { Comment, Finding } from "@/lib/types";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Event = {
  id: string;
  at: string;
  kind: "opened" | "closed" | "started" | "comment";
  title: string;
  detail?: string;
  findingId?: string;
  planId?: string;
};

export default function ActivityTimeline() {
  const navigate = useNavigate();
  const { data: findings = [] } = useAllFindings();
  const { data: comments = [] } = useQuery({
    queryKey: ["comments", "all"],
    queryFn: async (): Promise<Comment[]> => {
      const data = await getBootstrapData();
      return data.comments as Comment[];
    },
  });
  const { data: planTitles = {} } = useQuery({
    queryKey: ["plan-titles"],
    queryFn: async (): Promise<Record<string, string>> => {
      const data = await getBootstrapData();
      const m: Record<string, string> = {};

      for (const r of data.remediation_plans as { id: string; title: string; code: string | null }[]) {
        m[r.id] = r.code ? `${r.code} · ${r.title}` : r.title;
      }

      return m;
    },
  });

  const events = useMemo<Event[]>(() => {
    const ev: Event[] = [];
    for (const f of findings) {
      ev.push({
        id: `o-${f.id}`,
        at: f.created_at,
        kind: "opened",
        title: f.title,
        detail: `${f.severity} severity finding logged`,
        findingId: f.id,
      });
      if (f.status === "done" && f.updated_at && f.updated_at !== f.created_at) {
        ev.push({ id: `c-${f.id}`, at: f.updated_at, kind: "closed", title: f.title, detail: "Finding closed", findingId: f.id });
      } else if (f.status === "in_progress" && f.updated_at && f.updated_at !== f.created_at) {
        ev.push({ id: `s-${f.id}`, at: f.updated_at, kind: "started", title: f.title, detail: "Work started", findingId: f.id });
      }
    }
    for (const c of comments) {
      ev.push({
        id: `cm-${c.id}`,
        at: c.created_at,
        kind: "comment",
        title: planTitles[c.plan_id] ?? "Remediation plan",
        detail: `${c.author || "Anonymous"}: ${c.body.slice(0, 120)}`,
        planId: c.plan_id,
      });
    }
    return ev.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [findings, comments, planTitles]);

  function goTo(e: Event) {
    if (e.planId) navigate(`/remediation?plan=${e.planId}`);
    else if (e.findingId) navigate(`/board?finding=${e.findingId}`);
  }

  const [visibleCount, setVisibleCount] = useState(10);
  const visible = events.slice(0, visibleCount);

  // Horizontal timeline: past 3 months
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 3);
  const totalMs = now.getTime() - start.getTime();
  const flagEvents = events.filter((e) => {
    const t = new Date(e.at).getTime();
    return t >= start.getTime() && t <= now.getTime();
  });

  // Month tick marks
  const months: { label: string; pct: number }[] = [];
  for (let i = 0; i <= 3; i++) {
    const d = new Date(start);
    d.setMonth(start.getMonth() + i);
    const pct = ((d.getTime() - start.getTime()) / totalMs) * 100;
    months.push({ label: d.toLocaleString(undefined, { month: "short" }), pct });
  }

  return (
    <Card className="p-6 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Activity timeline</h2>
        <span className="text-xs text-muted-foreground">{events.length} events · last 3 months shown above</span>
      </div>

      {/* Horizontal timeline */}
      <TooltipProvider delayDuration={100}>
        <div className="mb-8 pt-2">
          <div className="relative h-20">
            {/* baseline */}
            <div className="absolute left-0 right-0 top-12 h-px bg-border" />
            {/* month ticks */}
            {months.map((m, i) => (
              <div
                key={i}
                className="absolute top-10 flex flex-col items-center"
                style={{ left: `${m.pct}%`, transform: "translateX(-50%)" }}
              >
                <div className="h-3 w-px bg-border" />
                <div className="mt-1 text-[10px] text-muted-foreground">{m.label}</div>
              </div>
            ))}
            {/* flags */}
            {flagEvents.map((e) => {
              const pct = ((new Date(e.at).getTime() - start.getTime()) / totalMs) * 100;
              return (
                <Tooltip key={`flag-${e.id}`}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => goTo(e)}
                      className={`absolute top-2 flex flex-col items-center ${toneFor(e.kind)} ${(e.findingId || e.planId) ? "cursor-pointer" : ""}`}
                      style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background hover:bg-accent">
                        {iconFor(e.kind)}
                      </div>
                      <div className="h-4 w-px bg-border" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <div className="text-xs font-medium">{labelFor(e.kind)} · {e.title}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(e.at).toLocaleString()}</div>
                    {e.detail && <div className="mt-1 text-[11px]">{e.detail}</div>}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </TooltipProvider>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No activity yet.
        </div>
      ) : (
        <>
          <ol className="relative space-y-5 border-l border-border pl-6">
            {visible.map((e) => (
              <li key={e.id} className="relative">
                <span
                  className={`absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background ${toneFor(e.kind)}`}
                >
                  {iconFor(e.kind)}
                </span>
                <button
                  type="button"
                  onClick={() => goTo(e)}
                  disabled={!e.findingId && !e.planId}
                  className="block w-full text-left rounded-md -mx-2 px-2 py-1 hover:bg-accent/50 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <div className="text-sm font-medium">{labelFor(e.kind)} · {e.title}</div>
                    <div className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString()}</div>
                  </div>
                  {e.detail && <div className="mt-0.5 text-xs text-muted-foreground">{e.detail}</div>}
                </button>
              </li>
            ))}
          </ol>
          {events.length > 10 && (
            <div className="mt-4 flex justify-center gap-2">
              {visibleCount < events.length && (
                <Button variant="outline" size="sm" onClick={() => setVisibleCount((c) => c + 10)}>
                  Show more
                </Button>
              )}
              {visibleCount > 10 && (
                <Button variant="ghost" size="sm" onClick={() => setVisibleCount(10)}>
                  Show less
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function iconFor(k: Event["kind"]) {
  const cls = "h-3.5 w-3.5";
  switch (k) {
    case "opened": return <AlertTriangle className={cls} />;
    case "started": return <Flag className={cls} />;
    case "closed": return <CheckCircle2 className={cls} />;
    case "comment": return <MessageSquare className={cls} />;
    
  }
}

function toneFor(k: Event["kind"]) {
  switch (k) {
    case "opened": return "text-destructive";
    case "started": return "text-primary";
    case "closed": return "text-success";
    case "comment": return "text-muted-foreground";
    
  }
}

function labelFor(k: Event["kind"]) {
  switch (k) {
    case "opened": return "Finding opened";
    case "started": return "Work started";
    case "closed": return "Finding closed";
    case "comment": return "Activity logged";
    
  }
}
