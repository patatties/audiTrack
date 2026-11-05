import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAllFindings, useControls, useControlCatalog } from "@/lib/queries";
import { ArrowRight, CheckCircle2, Clock3, ListTodo, FileDown, Loader2, SearchCheck } from "lucide-react";
import ActivityTimeline from "@/components/ActivityTimeline";
import HealthMatrix from "@/components/HealthMatrix";
import { generateReport } from "@/lib/report";
import ScopedReportDialog from "@/components/ScopedReportDialog";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";


export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: findings = [] } = useAllFindings();
  const { data: controls = [] } = useControls();
  const { data: catalog = [] } = useControlCatalog();

  const stats = useMemo(() => {
    const total = findings.length;
    const done = findings.filter((f) => f.status === "done").length;
    const inProgress = findings.filter((f) => f.status === "in_progress").length;
    const gatheringEvidence = findings.filter((f) => f.status === "gathering_evidence").length;
    const todo = findings.filter((f) => f.status === "todo").length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, gatheringEvidence, todo, pct };
  }, [findings]);

  const topControls = useMemo(() => {
    const WEIGHT: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    return controls
      .map((ctrl) => {
        const open = findings.filter((f) => f.control_id === ctrl.id && f.status !== "done");
        const score = open.reduce((sum, f) => sum + (WEIGHT[f.severity] ?? 0), 0);
        const cat = ctrl.catalog_id ? catalog.find((c) => c.id === ctrl.catalog_id) : null;
        return { id: ctrl.id, name: ctrl.name, code: cat?.code ?? null, score, openCount: open.length };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [findings, controls, catalog]);

  const exposureData = useMemo(() => {
    if (!findings.length) return [];

    const earliest = findings.reduce((min, f) => {
      const t = new Date(f.created_at).getTime();
      return t < min ? t : min;
    }, Date.now());

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    type ExposurePoint = { date: string; exposure: number; low: number; medium: number; high: number; critical: number };
    const points: ExposurePoint[] = [];
    const cursor = new Date(earliest);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= today) {
      const t = cursor.getTime();
      let low = 0, medium = 0, high = 0, critical = 0;
      for (const f of findings) {
        if (new Date(f.created_at).getTime() > t) continue;
        if (f.status === "done" && new Date(f.updated_at).getTime() <= t) continue;
        if (f.severity === "low") low++;
        else if (f.severity === "medium") medium++;
        else if (f.severity === "high") high++;
        else if (f.severity === "critical") critical++;
      }
      points.push({ date: cursor.toISOString().slice(0, 10), exposure: low + medium * 2 + high * 3 + critical * 4, low, medium, high, critical });
      cursor.setDate(cursor.getDate() + 7);
    }

    // Ensure the last point is today with the current live score
    let low = 0, medium = 0, high = 0, critical = 0;
    for (const f of findings) {
      if (f.status === "done") continue;
      if (f.severity === "low") low++;
      else if (f.severity === "medium") medium++;
      else if (f.severity === "high") high++;
      else if (f.severity === "critical") critical++;
    }
    const liveScore = low + medium * 2 + high * 3 + critical * 4;
    const todayStr = new Date().toISOString().slice(0, 10);
    if (points[points.length - 1]?.date !== todayStr) {
      points.push({ date: todayStr, exposure: liveScore, low, medium, high, critical });
    } else {
      Object.assign(points[points.length - 1], { exposure: liveScore, low, medium, high, critical });
    }

    return points;
  }, [findings]);

  const [exporting, setExporting] = useState(false);
  const onExport = async () => {
    try {
      setExporting(true);
      await generateReport();
      toast.success("Report downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Status of audit remediation across all clients and environments.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ScopedReportDialog />
          <Button onClick={onExport} disabled={exporting} variant="outline" className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Export PDF report
          </Button>
        </div>
      </header>

      {/* Finding pipeline */}
      <div className="flex flex-wrap items-stretch gap-1">
        <PipelineStage icon={ListTodo} label="Total" value={stats.total} color="default" onClick={() => navigate("/board")} />
        <PipelineArrow />
        <PipelineStage icon={ListTodo} label="To do" value={stats.todo} color="muted" onClick={() => navigate("/board?status=todo")} />
        <PipelineArrow />
        <PipelineStage icon={Clock3} label="In progress" value={stats.inProgress} color="primary" onClick={() => navigate("/board?status=in_progress")} />
        <PipelineArrow />
        <PipelineStage icon={SearchCheck} label="Gathering evidence" value={stats.gatheringEvidence} color="warning" onClick={() => navigate("/board?status=gathering_evidence")} />
        <PipelineArrow />
        <PipelineStage icon={CheckCircle2} label="Completed" value={stats.done} color="success" onClick={() => navigate("/board?status=done")} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 shadow-soft lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Exposure over time</h2>
              <p className="text-xs text-muted-foreground">Open findings weighted by severity · low 1 · medium 2 · high 3 · critical 4</p>
            </div>
          </div>
          {exposureData.length < 2 ? (
            <EmptyHint text="Not enough findings yet to show a trend." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={exposureData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="strokeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#7f1d1d" stopOpacity={1} />
                    <stop offset="20%"  stopColor="#dc2626" stopOpacity={1} />
                    <stop offset="50%"  stopColor="#ef4444" stopOpacity={1} />
                    <stop offset="75%"  stopColor="#eab308" stopOpacity={1} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={1} />
                  </linearGradient>
                  <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#7f1d1d" stopOpacity={0.55} />
                    <stop offset="20%"  stopColor="#dc2626" stopOpacity={0.40} />
                    <stop offset="50%"  stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="75%"  stopColor="#eab308" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                  tickFormatter={(d) => {
                    const dt = new Date(d);
                    return `${dt.toLocaleString("default", { month: "short" })} '${String(dt.getFullYear()).slice(2)}`;
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
                <Tooltip content={<ExposureTooltip />} />
                <Area
                  type="monotone"
                  dataKey="exposure"
                  stroke="url(#strokeGrad)"
                  strokeWidth={2.5}
                  fill="url(#fillGrad)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-6 shadow-soft">
          <h2 className="mb-4 text-lg font-semibold">Top controls by current risk</h2>
          {topControls.length === 0 ? (
            <EmptyHint text="No open findings to rank." />
          ) : (
            <div className="space-y-3">
              {topControls.map((ctrl, i) => {
                const maxScore = topControls[0].score;
                const pct = Math.round((ctrl.score / maxScore) * 100);
                const barColor =
                  ctrl.score >= 12 ? "bg-red-900" :
                  ctrl.score >= 8  ? "bg-red-500" :
                  ctrl.score >= 4  ? "bg-yellow-500" : "bg-green-500";
                return (
                  <div key={ctrl.id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-4 shrink-0 text-xs font-semibold text-muted-foreground">{i + 1}</span>
                        <div className="min-w-0">
                          {ctrl.code && (
                            <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{ctrl.code}</span>
                          )}
                          <span className="truncate text-xs font-medium">{ctrl.name}</span>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums">{ctrl.score} pts</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <HealthMatrix />

      <ActivityTimeline />

      <p className="text-center text-xs text-muted-foreground/50">by Patatties</p>
    </div>
  );
}

function PipelineArrow() {
  return (
    <div className="flex items-center self-stretch px-0.5 text-muted-foreground/40">
      <ArrowRight className="h-5 w-5" />
    </div>
  );
}

function PipelineStage({
  icon: Icon, label, value, color, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "default" | "muted" | "primary" | "warning" | "success";
  onClick?: () => void;
}) {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    default:  { bg: "bg-secondary",         text: "text-foreground",          dot: "bg-foreground/30" },
    muted:    { bg: "bg-secondary",         text: "text-muted-foreground",    dot: "bg-muted-foreground" },
    primary:  { bg: "bg-primary/10",        text: "text-primary",             dot: "bg-primary" },
    warning:  { bg: "bg-orange-500/10",      text: "text-orange-700",          dot: "bg-orange-500" },
    success:  { bg: "bg-success/10",        text: "text-success",             dot: "bg-success" },
  };
  const c = colors[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-[110px] flex-1 flex-col items-center gap-1 rounded-xl px-4 py-3 transition-opacity hover:opacity-80 ${c.bg} ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className={`flex items-center gap-1.5 text-xs font-medium ${c.text}`}>
        <span className={`h-2 w-2 rounded-full ${c.dot}`} />
        {label}
      </div>
      <div className={`text-2xl font-bold ${c.text}`}>{value}</div>
    </button>
  );
}

function ExposureTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: { date: string; exposure: number; low: number; medium: number; high: number; critical: number } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-md">
      <div className="mb-2 font-medium">{new Date(label!).toLocaleDateString()}</div>
      <div className="space-y-1">
        {d.critical > 0 && (
          <div className="flex justify-between gap-6">
            <span className="text-destructive">Critical ×{d.critical}</span>
            <span className="font-medium">{d.critical * 4} pts</span>
          </div>
        )}
        {d.high > 0 && (
          <div className="flex justify-between gap-6">
            <span className="text-orange-500">High ×{d.high}</span>
            <span className="font-medium">{d.high * 3} pts</span>
          </div>
        )}
        {d.medium > 0 && (
          <div className="flex justify-between gap-6">
            <span className="text-yellow-500">Medium ×{d.medium}</span>
            <span className="font-medium">{d.medium * 2} pts</span>
          </div>
        )}
        {d.low > 0 && (
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Low ×{d.low}</span>
            <span className="font-medium">{d.low} pts</span>
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between gap-6 border-t border-border pt-2 font-semibold">
        <span>Total</span>
        <span>{d.exposure} pts</span>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{text}</div>;
}
